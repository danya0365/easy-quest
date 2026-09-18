/**
 * sky.js — the world beyond the playable area: sky dome, sun disc and glow, moon and stars, big soft drifting cumulus,
 * layered hill rings fading into haze, distant ranges, birds, and Highfeather in the clouds.
 *                                                                                        (P02, owner: src/art/sky.js)
 *
 * House style: docs/ART-DIRECTION.md §11 (gradient dome + sun glow + painted cumulus + three landscape layers), extended
 * to every hour and weather. Everything reads the shared environment in src/art/weather.js (ENV), which the dome syncs
 * from the light rig once per frame, so __DQ.timeOfDay(h) and __DQ.weather(kind) re-light the whole backdrop.
 *
 *   buildSky(scene, rig, {clouds, ranges, landmarks}) -> {sky, clouds, uniforms, setHours(h), setWeather(kind, opts), state()}
 *        uniforms uZenith/uUpper/uHorizon/uHaze/uSunGlow — the field's time of day lerps them; the names are a contract.
 *        Self-animating: the dome follows the camera and syncs ENV in its onBeforeRender; the clouds drift and billow
 *        on the GPU. (Callers that still copy the camera position / spin sky.clouds keep working.)
 *   ringHill(scene, id, r0, r1, r2, baseH, amp, seed, lowHex, highHex, haze, {fogged, peaky, patches, gates}) -> Mesh
 *        a rolling hill ring, hazed toward the hour's haze colour (lower slopes hazier), forest/pasture patches.
 *        It opens a SADDLE (a pass in the hills) on every registered landmark bearing, so the lane that leaves the
 *        vale visibly runs out through a gap and up toward the place it is signposted to.
 *   buildLandmarks(scene, list) -> {group, list, describe()}
 *        THE THING ON THE SKYLINE. Big readable painted silhouettes of real CANON places, each standing on its own
 *        far ridge on the bearing its signpost points down: Puddlewick's roofs and church tower, Saltmarrow's sea
 *        and tide-mill, Coddleston Castle's four copper spires, the Whispering Wood with Cobwell Manor's gable.
 *        Registered with `buildSky` by default, so any map that builds a sky gets a horizon worth walking to.
 *   buildBackdrop(scene, rig, {hills, clouds, ranges}) -> sky   one call for a new outdoor map: sky + mid and far rings.
 *   lookTick(dt) / attachLook(adapter)
 *        THE LOOK AXIS. Right-stick Y and PageUp/PageDown (or R/F) tip the field camera from the map's own ground
 *        angle up to -18 degrees and down to +50, on a spring, easing back to the framing default after a couple of
 *        idle seconds the way DQV PS2 does — with the look point rising under a closed loop on the rig's own
 *        projection probe so the boy is never lost off the bottom of the frame. `Home` snaps back. Wired to the
 *        real game's rig by buildSky through Field.on('update') + rig.tune(); __DQ.look() reports and drives it.
 *   skyRecipes(kit)    adds kit.birds(n, {centre, height, radius, seed}) and kit.skyCastle({azimuth, elevation, ...})
 *
 * Kit contract used here (src/art/props.js createPropsKit): kit.scene, kit.animators.push(fn(t, dt, cam)).
 */
import * as THREE from 'three';
import { PAL, C3, css, lerp, smooth, clamp01, mixHex } from './palette.js';
import { Tex, mulberry, vnoise, mkCanvas, ctx2, blur } from './tex.js';
import { makeToon } from './toon.js';
import { App } from '../engine/app.js';
import { Assets } from '../engine/assets.js';
import { Debug, reportError } from '../engine/debug.js';
import { Input } from '../engine/input.js';
import { ENV, installEnvDebug, createPrecipitation } from './weather.js';

/** The live sky: the clouds a critic can speed up, the one precipitation slot, and the horizon's landmarks. */
const CURRENT = { clouds: null, precip: null, landmarks: null, camera: null, scene: null };

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the dome
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const DOME_VERT = /* glsl */`
  varying vec3 vDir;
  void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const DOME_FRAG = /* glsl */`
  uniform vec3 uZenith, uUpper, uHorizon, uHaze, uSunGlow;
  uniform vec3 uEnvSunDir, uEnvMoonDir, uEnvSun, uEnvTwilightCol, uEnvRange, uEnvDeck, uEnvDeckLit;
  uniform float uEnvTime, uEnvDay, uEnvDusk, uEnvNight, uEnvTwilight, uEnvSunVis, uEnvMoonVis, uEnvOvercast;
  uniform vec2 uEnvWindXZ;
  uniform vec3 uMoonLit, uMoonDark, uMoonHalo, uStarCol;
  uniform float uRanges;
  uniform vec4 uGateAz, uGateK;
  uniform mat3 uEnvSkyRot;
  uniform sampler2D tNoise;
  varying vec3 vDir;

  float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
  vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }

  // a layer of pixel-sized stars on a 3D lattice around the dome
  float stars(vec3 d, float scale, float prob, float px, float bright){
    vec3 p = d * scale, id = floor(p), f = fract(p);
    float h = hash13(id);
    if (h > prob) return 0.0;
    float k = h / prob;
    vec3 q = f - (0.3 + 0.4 * hash33(id + 7.13));
    float dist = length(q - dot(q, d) * d);
    float rad = min(0.22, px * scale * (0.8 + 1.5 * k * k));
    float tw = 0.7 + 0.3 * sin(uEnvTime * (0.8 + 2.6 * hash13(id + 3.7)) + k * 91.0);
    return (1.0 - smoothstep(rad * 0.3, rad, dist)) * tw * mix(0.35, 1.0, k) * bright;
  }

  // the farthest hills: TWO painted silhouette tiers on the horizon (the third landscape layer) — a tall blue
  // massif behind, a nearer, darker range in front of it, so the distance has depth instead of one thin smear.
  // Both sag into a pass on each signposted bearing, so the lane out of the vale has open distance over it.
  float gateSag(float az){
    float sag = 0.0;
    for (int i = 0; i < 4; i++) {
      float d = az - uGateAz[i];
      d = mod(d + 3.14159265, 6.2831853) - 3.14159265;
      sag = max(sag, uGateK[i] * exp(-(d * d) / 0.0784));
    }
    return sag;
  }
  // Heights are in sin(elevation): the great massif tops out at about 5.4 deg and the nearer range at 3.5, which
  // is where the mountains sit on the owner-approved docs/approved/field-opening.png (their crest is ~5.2 deg
  // under a frame whose whole sky band is 7.5). Taller than that and the ranges ARE the sky instead of standing
  // under it — the frame loses its band of blue and its clouds.
  float ridgeFar(float az){
    float u = az / 6.2831853;
    float n = textureLod(tNoise, vec2(u * 2.0 + 0.13, 0.41), 0.0).r * 0.58 + textureLod(tNoise, vec2(u * 7.0, 0.77), 0.0).g * 0.42;
    return (0.013 + 0.098 * pow(clamp(n, 0.0, 1.0), 1.35)) * (1.0 - 0.74 * gateSag(az));
  }
  float ridgeNear(float az){
    float u = az / 6.2831853;
    float n = textureLod(tNoise, vec2(u * 3.0, 0.21), 0.0).r * 0.62 + textureLod(tNoise, vec2(u * 11.0, 0.63), 0.0).g * 0.38;
    return (0.004 + 0.0705 * pow(clamp(n, 0.0, 1.0), 1.55)) * (1.0 - 0.80 * gateSag(az));
  }

  void main(){
    vec3 d = normalize(vDir); float h = d.y;
    float px = max(length(fwidth(d)), 1e-5);

    // gradient (ART-DIRECTION §11), colours blended per hour by ENV
    vec3 c = mix(uHorizon, uUpper, smoothstep(0.0, 0.28, h));
    c = mix(c, uZenith, smoothstep(0.22, 0.9, h));

    vec3 sd = normalize(uEnvSunDir);
    vec2 dh = normalize(d.xz + vec2(1e-5)), sh = normalize(sd.xz + vec2(1e-5));
    float toward = dot(dh, sh) * 0.5 + 0.5;

    // twilight: a warm band hugging the horizon, brightest under the sun
    float low = 1.0 - smoothstep(-0.04, 0.5, h);
    c = mix(c, uEnvTwilightCol, low * (0.2 + 0.8 * pow(toward, 3.0)) * uEnvTwilight * 0.72 * (1.0 - uEnvOvercast * 0.7));

    // night: stars, a faint milky way — the whole field turns about the pole as the hours pass (uEnvSkyRot),
    // so 21:30 and 03:00 are not the same sky
    float night = uEnvNight * (1.0 - uEnvOvercast * 0.9);
    if (night > 0.002 && h > -0.02) {
      float fade = smoothstep(0.0, 0.25, h) * smoothstep(0.45, 0.95, night);
      vec3 sd2 = uEnvSkyRot * d;
      vec3 mwN = normalize(vec3(0.42, 0.3, 0.86));
      float mw = exp(-pow(dot(sd2, mwN) / 0.28, 2.0));
      vec2 muv = vec2(atan(sd2.z, sd2.x) / 6.2831853, sd2.y * 0.5);
      float mn = textureLod(tNoise, vec2(muv.x * 4.0, muv.y * 1.3 + 0.2), 0.0).b;
      c += uStarCol * mw * mw * smoothstep(0.3, 0.85, mn) * 0.04 * fade;
      float s = stars(sd2, 70.0, 0.042, px, 1.0) + stars(sd2, 150.0, 0.03 + 0.05 * mw, px, 0.5);
      c = mix(c, uStarCol, clamp(s, 0.0, 1.0) * fade);
    }

    // sun: glow (the proto's two lobes), a wider warm bloom at dusk, and a soft painted disc
    float s = max(dot(d, sd), 0.0);
    float vis = uEnvSunVis;
    c += uSunGlow * (pow(s, 6.0) * 0.18 + pow(s, 60.0) * 0.45) * mix(0.25, 1.0, vis);
    c += uEnvTwilightCol * pow(s, 3.0) * 0.22 * uEnvDusk * vis;
    float R = mix(0.042, 0.062, uEnvDusk);
    float ang = length(d - sd);
    float aa = px * 1.5;
    float disc = 1.0 - smoothstep(R - aa, R + aa, ang);
    float corona = exp(-pow(max(ang - R, 0.0) / (R * 0.9), 2.0));
    vec3 discCol = mix(uEnvSun * mix(1.1, 1.45, (1.0 - ang / R) * (1.0 - uEnvDusk)), vec3(1.0), (1.0 - smoothstep(0.1, 0.85, ang / R)) * (1.0 - uEnvDusk * 0.85) * 0.55);
    c = mix(c, discCol, disc * vis * smoothstep(-0.03, 0.02, h));
    c += uEnvSun * corona * (1.0 - disc) * 0.28 * vis;

    // moon: a big storybook disc, gibbous-lit, soft maria, a halo
    float mvis = uEnvMoonVis;
    if (mvis > 0.002) {
      vec3 md = normalize(uEnvMoonDir);
      float MR = 0.052;
      vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), md)), my = cross(md, mx);
      vec2 q = vec2(dot(d - md, mx), dot(d - md, my)) / MR;
      float r = length(q);
      if (r < 9.0 && dot(d, md) > 0.0) {
        float inD = 1.0 - smoothstep(1.0 - px / MR * 1.5, 1.0 + px / MR * 1.5, r);
        vec3 n = vec3(q, sqrt(max(0.0, 1.0 - r * r)));
        float lit = smoothstep(-0.2, 0.3, dot(n, normalize(vec3(-0.5, 0.3, 0.8))));
        float mare = textureLod(tNoise, q * 0.19 + vec2(0.31, 0.57), 0.0).r;
        vec3 mc = mix(uMoonDark, uMoonLit, lit);
        mc = mix(mc, mc * 0.84, smoothstep(0.5, 0.66, mare) * lit);
        float halo = exp(-max(r - 1.0, 0.0) * 1.4) * 0.16 + exp(-max(r - 1.0, 0.0) * 0.32) * 0.07;
        c += uMoonHalo * halo * (1.0 - inD) * mvis;
        c = mix(c, mc, inD * mix(0.3, 1.0, lit) * mvis * smoothstep(-0.01, 0.03, h));
      }
    }

    // overcast: a soft moving cloud deck over everything
    if (uEnvOvercast > 0.002) {
      vec2 puv = d.xz / (max(h, 0.0) + 0.16) * 0.085 + uEnvWindXZ * uEnvTime * 0.0035;
      float n1 = texture2D(tNoise, puv).r, n2 = texture2D(tNoise, puv * 2.6 + vec2(0.37, 0.11)).g;
      float cov = smoothstep(0.2, 0.7, n1 * 0.65 + n2 * 0.35 + (uEnvOvercast - 0.55) * 0.9);
      vec3 dc = mix(uEnvDeck, uEnvDeckLit, smoothstep(0.35, 0.8, n2) * (0.6 + 0.4 * toward));
      c = mix(c, dc, cov * uEnvOvercast * smoothstep(-0.06, 0.1, h) * 0.92);
    }

    // the farthest ranges, then the haze below the horizon (ART-DIRECTION §11)
    if (uRanges > 0.5 && h < 0.15) {
      float az = atan(d.z, d.x);
      float a2 = px * 1.2;
      // tier 1: the great blue massif, hazy, its feet lost in aerial perspective
      float rf = ridgeFar(az);
      float inF = 1.0 - smoothstep(rf - a2, rf + a2, h);
      vec3 fc = mix(mix(uHorizon, uHaze, 0.62), uEnvRange, smoothstep(-0.02, rf, h) * 0.92);
      fc = mix(fc, uEnvTwilightCol, low * pow(toward, 4.0) * uEnvTwilight * 0.30);
      c = mix(c, fc, inF * 0.94);
      // tier 2: a nearer range standing in front of it, a shade darker and less hazed, so the two read apart
      float rn = ridgeNear(az);
      float inN = 1.0 - smoothstep(rn - a2, rn + a2, h);
      vec3 nc = mix(mix(uEnvRange, uHaze, 0.18), uEnvRange * 0.86, smoothstep(-0.02, rn, h) * 0.75);
      nc = mix(nc, uEnvTwilightCol, low * pow(toward, 3.0) * uEnvTwilight * 0.26);
      c = mix(c, nc, inN);
    }
    c = mix(c, uHaze, smoothstep(0.02, -0.06, h));

    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

export function buildSky(scene, rig, { clouds: withClouds = true, ranges = true, landmarks = 'vale' } = {}) {
  installEnvDebug();
  installLook();                 // a child can look up at whatever this sky is about to paint (P02 gap #3)
  // the skyline first: the hill rings built after this one open a pass at every landmark's bearing
  const marks = landmarks === false || landmarks === null ? null : buildLandmarks(scene, landmarks);
  const E = ENV.u;
  const U = {
    // the five the field lerps (shared with ENV, so both agree)
    uZenith: ENV.sky.uZenith, uUpper: ENV.sky.uUpper, uHorizon: E.uEnvHorizon, uHaze: E.uEnvHaze, uSunGlow: ENV.sky.uSunGlow,
    uSunDir: E.uEnvSunDir,
    uEnvSunDir: E.uEnvSunDir, uEnvMoonDir: E.uEnvMoonDir, uEnvSun: E.uEnvSun, uEnvTwilightCol: E.uEnvTwilightCol, uEnvRange: E.uEnvRange,
    uEnvDeck: E.uEnvDeck, uEnvDeckLit: E.uEnvDeckLit, uEnvTime: E.uEnvTime, uEnvDay: E.uEnvDay, uEnvDusk: E.uEnvDusk, uEnvNight: E.uEnvNight,
    uEnvTwilight: E.uEnvTwilight, uEnvSunVis: E.uEnvSunVis, uEnvMoonVis: E.uEnvMoonVis, uEnvOvercast: E.uEnvOvercast, uEnvWindXZ: E.uEnvWindXZ,
    uMoonLit: { value: C3(PAL.snow.light) }, uMoonDark: { value: C3(mixHex(PAL.snow.deep, PAL.night.upper, 0.35)) },
    uMoonHalo: { value: C3(PAL.night.sunGlow) }, uStarCol: { value: C3(PAL.night.star) },
    uRanges: { value: ranges ? 1 : 0 }, tNoise: { value: Tex.noise() },
    uEnvSkyRot: E.uEnvSkyRot,
    uGateAz: { value: new THREE.Vector4(0, 0, 0, 0) }, uGateK: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  // the painted ranges sag into a pass wherever a landmark stands, so the distance opens up over the lane
  if (marks) {
    marks.list.slice(0, 4).forEach((m, i) => {
      const k = ['x', 'y', 'z', 'w'][i];
      U.uGateAz.value[k] = m.az; U.uGateK.value[k] = Math.min(0.95, (m.gate ?? 0.6) * 0.8);
    });
    GATE_UNIFORMS.add(U);
  }
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG });
  mat.name = 'sky-dome';
  const sky = new THREE.Mesh(Assets.geometry('sky:dome', () => new THREE.SphereGeometry(900, 32, 16)), mat);
  sky.renderOrder = -10; sky.frustumCulled = false; sky.name = 'sky';
  // one live precipitation slot: a new map's sky takes it over from the old one (no orphaned particles)
  if (CURRENT.precip) { try { CURRENT.precip.dispose(); } catch (e) { reportError('sky precip handover', e); } }
  const precip = CURRENT.precip = createPrecipitation();
  let fitFrames = 0;
  const FIT_AT = 8, REHANG_AT = 150;
  sky.onBeforeRender = (renderer, sc, camera) => {
    try {
      if (camera) { sky.position.copy(camera.position); sky.updateMatrixWorld(); CURRENT.camera = camera; }
      CURRENT.scene = sc || scene;
      ENV.sync(rig, sc || scene);
      precip.update(sc || scene);
      // THE SKYLINE FIT (see fitLandmarks): once the map has finished building its wood and its hills, every
      // painted place is re-hung so its whole silhouette stands clear ABOVE whatever the map put on the horizon.
      if (marks && camera) {
        fitFrames++;
        if (fitFrames === FIT_AT) fitLandmarks(marks, sc || scene, camera);
        else if (fitFrames === REHANG_AT) rehangLandmarks(marks, camera);      // the camera has settled by now
      }
    } catch (e) { reportError('sky frame', e); }
  };
  scene.add(sky);
  const clouds = withClouds ? buildClouds(scene) : null;
  if (clouds) { CURRENT.clouds = clouds; installCloudDebug(); }
  const api = {
    sky, clouds, uniforms: U, env: ENV, landmarks: marks,
    /** 0..24: blends the rig (and so the whole backdrop) like the field's time of day. */
    setHours: (h) => ENV.setHours(h, rig),
    setWeather: (kind, opts) => ENV.setWeather(kind, opts),
    /** Kept for callers that tick a view: the sky animates itself, so this only mirrors the camera. */
    update(t, dt, camera) { if (camera) sky.position.copy(camera.position); },
    state: () => ENV.describe(),
    /** Cloud drift multiplier (1 = the gentle default; big values are a time-lapse for demos and critics). */
    drift(n) { if (clouds && Number.isFinite(+n)) clouds.material.uniforms.uDrift.value = +n; return clouds ? clouds.material.uniforms.uDrift.value : 0; },
    /** Re-measure the skyline and re-hang every painted place above it (the field calls this after a map builds). */
    fit(opts) { return marks ? fitLandmarks(marks, CURRENT.scene || scene, CURRENT.camera, opts) : null; },
    dispose() {
      precip.dispose(); if (CURRENT.precip === precip) CURRENT.precip = null;
      GATE_UNIFORMS.delete(U);
      if (marks && CURRENT.landmarks === marks) CURRENT.landmarks = null;
    },
  };
  return api;
}

/** One call for a new outdoor map: the sky plus two rolling hill rings behind it (the dome adds the farthest ranges). */
export function buildBackdrop(scene, rig, { hills = true, clouds = true, ranges = true, seed = 71 } = {}) {
  const sky = buildSky(scene, rig, { clouds, ranges });
  if (hills) {
    try {
      sky.hills = [
        ringHill(scene, 'mid', 118, 150, 205, 5, 21, seed, PAL.hill.midLow, PAL.hill.mid, 0.2, { patches: 0.22 }),
        ringHill(scene, 'far', 240, 300, 380, 12, 78, seed + 10, PAL.hill.farLow, PAL.hill.far, 0.25, { fogged: false, peaky: 1.8 }),
      ];
    } catch (e) { reportError('backdrop hills', e); }
  }
  return sky;
}

let cloudDebug = false;
function installCloudDebug() {
  if (cloudDebug) return;
  cloudDebug = true;
  try {
    Debug.expose('cloudDrift', (n) => {
      const c = CURRENT.clouds;
      if (!c) return null;
      const U = c.material.uniforms;
      if (Number.isFinite(+n)) U.uDrift.value = Math.max(0, +n);
      const rate = (c.userData.rate || 0) * U.uDrift.value;
      return { drift: U.uDrift.value, cards: c.userData.cards,
        // how far the flock has travelled, and how fast — both measurable, so "do the clouds move?" has an answer
        phaseRad: +U.uPhase.value.toFixed(5), degPerMin: +(rate * 60 * 180 / Math.PI).toFixed(2) };
    });
  } catch (e) { reportError('sky debug', e); }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// clouds: a painted DATA atlas (R = light, G = thickness, A = coverage) coloured per hour in the shader
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * The clouds are the approved painted cumulus atlas (F3 Tex.clouds(), ART-DIRECTION §9m) — at midday the pixels are
 * exactly those. This companion DATA texture reads that painting back and stores, per pixel:
 *   R = where the pixel sits on the cloud's light ramp (0 = the lavender core under the flat base, 1 = sunlit top)
 *   G = thickness (0 at the thin silhouette, 1 deep inside), so the edges can glow when the light is behind them
 * That lets dawn, dusk, night and rain re-colour the same cloud without repainting it.
 */
function cloudData() {
  return Assets.texture('sky:cloud-data', () => {
    const src = Tex.clouds(), cv = src.image;
    const W = cv.width, H = cv.height;
    const g = ctx2(cv), img = g.getImageData(0, 0, W, H).data;
    const lum = (i) => (0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2]) / 255;
    const L0 = lumOf(PAL.cloud.core), L1 = lumOf(PAL.cloud.lit);
    const A = new Float32Array(W * H), T = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { A[i] = img[i * 4 + 3] / 255; T[i] = clamp01((lum(i * 4) - L0) / Math.max(0.001, L1 - L0)); }
    const TH = A.slice(); blur(TH, W, H, 11, 2);
    const data = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = ((H - 1 - y) * W + x) * 4;      // flipY false: write the canvas upside down to match the CanvasTexture
      data[o] = T[i] * 255; data[o + 1] = clamp01(smooth(0.1, 0.8, TH[i])) * 255; data[o + 2] = 0; data[o + 3] = A[i] * 255;
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
    tex.needsUpdate = true; tex.name = 'sky:cloud-data';
    return tex;
  });
}
const lumOf = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };

const CLOUD_VERT = /* glsl */`
  attribute vec4 aCard;    // azimuth, elevation (rad), width, drift (relative rate, 1 = the flock's mean)
  attribute vec4 aVar;     // atlas cell u, v, phase, -
  uniform float uEnvTime, uDrift, uRadius, uPhase;
  uniform vec3 uEnvSunDir, uEnvMoonDir; uniform float uEnvNight;
  varying vec2 vUv; varying vec2 vCell; varying vec3 vWDir; varying float vSide; varying float vPh;
  void main(){
    // uPhase is INTEGRATED on the CPU (radians travelled so far, drift-scaled), so a critic turning the drift up
    // speeds the sky up from where it is instead of teleporting it: the cards really cross the sky.
    float az = aCard.x + aCard.w * uPhase;
    float w = aCard.z * (1.0 + 0.03 * sin(uEnvTime * 0.043 + aVar.z * 6.2831));
    float hh = aCard.z * 0.5 * (1.0 + 0.06 * sin(uEnvTime * 0.061 + aVar.z * 17.0));     // billows upward; the base stays level
    // the card's flat base sits AT its elevation (it used to be dragged 7% of its width downward, which pulled
    // every big cumulus down onto the skyline and walled off the distance)
    vec3 centre = vec3(cos(az) * uRadius, sin(aCard.y) * uRadius - aCard.z * 0.02, sin(az) * uRadius);
    vec3 f = normalize(vec3(centre.x, 0.0, centre.z));
    vec3 right = vec3(-f.z, 0.0, f.x);
    vec3 p = centre + right * position.x * w + vec3(0.0, (position.y + 0.5) * hh, 0.0);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWDir = normalize(wp.xyz - cameraPosition);
    vec3 rightW = normalize((modelMatrix * vec4(right, 0.0)).xyz);
    vec3 L = normalize(mix(uEnvSunDir, uEnvMoonDir, uEnvNight));
    vSide = smoothstep(-0.3, 0.3, dot(normalize(L.xz + vec2(1e-5)), rightW.xz));     // the painted highlight turns to face the light
    vUv = position.xy + 0.5; vCell = aVar.xy; vPh = aVar.z;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const CLOUD_FRAG = /* glsl */`
  uniform sampler2D tClouds, tCloudData;
  uniform vec3 uEnvCloudLit, uEnvCloudMid, uEnvCloudShade, uEnvCloudBase, uEnvHorizon, uEnvSun, uEnvTwilightCol, uEnvSunDir, uEnvMoonDir;
  uniform float uEnvDay, uEnvNight, uEnvTwilight, uEnvOvercast, uEnvTime, uEnvSunVis, uEnvMoonVis;
  varying vec2 vUv; varying vec2 vCell; varying vec3 vWDir; varying float vSide; varying float vPh;
  vec2 cuv(vec2 uv){ return vCell + clamp(uv, 0.002, 0.998) * 0.5; }
  // the ramp is parametrised by the painting's own luminance: core -> shade -> mid -> sunlit
  vec3 ramp(float t){
    if (t < 0.28) return mix(uEnvCloudBase, uEnvCloudShade, t / 0.28);
    if (t < 0.75) return mix(uEnvCloudShade, uEnvCloudMid, (t - 0.28) / 0.47);
    return mix(uEnvCloudMid, uEnvCloudLit, (t - 0.75) / 0.25);
  }
  void main(){
    vec2 uv = vUv;
    // a slow, tiny boil along the silhouette
    uv.x += sin(uv.y * 9.0 + uEnvTime * 0.11 + vPh * 20.0) * 0.0025;
    uv.y += sin(uv.x * 13.0 + uEnvTime * 0.09 + vPh * 31.0) * 0.003;
    vec2 uvA = cuv(uv), uvB = cuv(vec2(1.0 - uv.x, uv.y));
    vec4 colA = texture2D(tClouds, uvA), colB = texture2D(tClouds, uvB);
    vec4 datA = texture2D(tCloudData, uvA), datB = texture2D(tCloudData, uvB);
    vec4 C = mix(colA, colB, vSide);
    vec4 D = mix(datA, datB, vSide);
    float a = C.a;
    if (a < 0.004) discard;
    float t = D.r, thick = D.g;
    vec3 col = mix(ramp(t), C.rgb, uEnvDay);                      // midday = the painted cumulus, exactly
    col = mix(col, ramp(t) * 0.9, uEnvOvercast * 0.5);
    // silver lining: thin edges glow when the sun (or the moon) is behind the cloud
    vec3 L = normalize(mix(uEnvSunDir, uEnvMoonDir, uEnvNight));
    float back = pow(max(dot(vWDir, L), 0.0), 4.0) * mix(uEnvSunVis, uEnvMoonVis * 0.7, uEnvNight);
    col += uEnvSun * (1.0 - thick) * back * 0.55;
    // sunset: the tops facing the sun catch the last warm light
    float face = pow(max(dot(normalize(vWDir.xz), normalize(uEnvSunDir.xz + vec2(1e-5))), 0.0), 2.0);
    col = mix(col, uEnvTwilightCol, uEnvTwilight * smoothstep(0.55, 1.0, t) * (0.14 + 0.34 * face) * (1.0 - uEnvNight));
    // aerial haze: the low clouds sit back in the distance
    col = mix(col, uEnvHorizon, (1.0 - smoothstep(0.03, 0.34, vWDir.y)) * 0.26);
    gl_FragColor = vec4(col, a * (1.0 - 0.18 * uEnvNight) * (1.0 - 0.3 * uEnvOvercast));
    #include <colorspace_fragment>
  }`;

/**
 * A cumulus FIELD, not a fence.
 *
 * The first version ringed the horizon with 22 wide cards starting at 4 degrees of elevation, and each card's base
 * was pulled a further 7% of its width down: from the gameplay camera (whose whole visible sky is the band from the
 * treetops up to about 12 degrees) that was a solid white wall across every view, hiding the hills, the far ranges
 * and the places on the skyline. So now:
 *   - every cumulus base is lifted clear of the horizon (>= ~7.5 degrees), leaving the band where the distance
 *     lives — ranges, hill rings, Puddlewick's roofs, Coddleston's spires — open blue;
 *   - the low deck is gathered into three clumps with wide LANES of clear sky between them, the way a real
 *     summer sky is, so turning the camera finds sky as often as it finds cloud;
 *   - the rest of the cards go high overhead, where they only show when the camera tips up.
 */
function buildClouds(scene) {
  const rnd = mulberry(1301), cards = [];
  const CLUMPS = [3, 3, 4];                                     // 10 big cumulus in three clumps
  CLUMPS.forEach((n, c) => {
    const a0 = (c / CLUMPS.length) * TAU + (rnd() - 0.5) * 0.34;
    for (let i = 0; i < n; i++) cards.push({
      az: a0 + (i - (n - 1) / 2) * (0.34 + rnd() * 0.14),
      // 5.7 - 16 deg. The gameplay frame only shows about 7.5 degrees of sky, so a cumulus based at 7 deg is a
      // cumulus nobody ever sees: on the owner-approved opening frame the cloud bank fills the top 70 px of the
      // sky band. Based here, the clumps read as weather over the far country, and the painted places (which are
      // 200 m away against a 760 m cloud radius) are drawn IN FRONT of them, so nothing on the skyline is hidden.
      el: 0.100 + Math.pow(rnd(), 1.2) * 0.18,
      w: 250 + rnd() * 220,
      v: [0, 1, 0, 1, 2][rnd() * 5 | 0],
    });
  });
  // seven SMALL low puffs, dropped into the lanes between the clumps: from a low gameplay camera these are the
  // cloud you actually see, and they are narrow enough that the ranges still read between and under them
  for (let i = 0; i < 7; i++) cards.push({
    az: ((i + 0.5) / 7) * TAU + (rnd() - 0.5) * 0.5,
    el: 0.075 + rnd() * 0.030, w: 150 + rnd() * 95, v: [0, 1, 2, 3][rnd() * 4 | 0],
  });
  for (let i = 0; i < 14; i++) cards.push({ az: rnd() * TAU, el: 0.34 + Math.pow(rnd(), 0.8) * 0.56, w: 150 + rnd() * 170, v: rnd() * 4 | 0 });
  const n = cards.length, pos = new Float32Array(n * 4 * 3), card = new Float32Array(n * 4 * 4), vr = new Float32Array(n * 4 * 4), idx = [];
  cards.forEach((c, i) => {
    const drift = (0.78 + rnd() * 0.5) * (c.v === 3 ? 1.28 : 1), ph = rnd();     // relative to the flock's mean rate
    [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(([x, y], k) => {
      const o = i * 4 + k;
      pos.set([x, y, 0], o * 3); card.set([c.az, c.el, c.w, drift], o * 4); vr.set([(c.v % 2) * 0.5, (c.v >> 1) ? 0.0 : 0.5, ph, 0], o * 4);
    });
    const b = i * 4; idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCard', new THREE.BufferAttribute(card, 4));
  g.setAttribute('aVar', new THREE.BufferAttribute(vr, 4));
  g.setIndex(idx);
  const E = ENV.u;
  const U = {
    tClouds: { value: Tex.clouds() }, tCloudData: { value: cloudData() }, uDrift: { value: 1 }, uPhase: { value: 0 }, uRadius: { value: 760 },
    uEnvTime: E.uEnvTime, uEnvSunDir: E.uEnvSunDir, uEnvMoonDir: E.uEnvMoonDir, uEnvDay: E.uEnvDay, uEnvNight: E.uEnvNight, uEnvTwilight: E.uEnvTwilight,
    uEnvOvercast: E.uEnvOvercast, uEnvSunVis: E.uEnvSunVis, uEnvMoonVis: E.uEnvMoonVis,
    uEnvCloudLit: E.uEnvCloudLit, uEnvCloudMid: E.uEnvCloudMid, uEnvCloudShade: E.uEnvCloudShade, uEnvCloudBase: E.uEnvCloudBase,
    uEnvHorizon: E.uEnvHorizon, uEnvSun: E.uEnvSun, uEnvTwilightCol: E.uEnvTwilightCol,
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  mat.name = 'sky-clouds';
  mat.color = new THREE.Color(1, 1, 1);          // the field's applyTime tints `clouds.material.color`; the hour now comes from ENV
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = -9; mesh.frustumCulled = false; mesh.name = 'clouds';
  mesh.userData.cards = n;
  // The flock CROSSES the sky. RATE is the mean angular speed of a cloud: 0.0042 rad/s = 14.5 deg/min, about
  // 5 minutes to carry a cumulus from one side of a 50-degree frame to the other — a child who stops and looks
  // up sees it move. The phase is integrated per frame, so uDrift scales the SPEED (linearly) and never jumps.
  const RATE = 0.0042;
  let last = -1;
  mesh.onBeforeRender = () => {
    try {
      const t = ENV.u.uEnvTime.value;
      const dt = last < 0 ? 0 : Math.max(0, Math.min(0.25, t - last));
      last = t;
      U.uPhase.value = (U.uPhase.value + dt * RATE * U.uDrift.value) % TAU;
    } catch (e) { reportError('cloud drift', e); }
  };
  mesh.userData.rate = RATE;
  scene.add(mesh);
  return mesh;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// far landmarks: the thing on the skyline. Big painted silhouettes of real places (CANON §2), each standing on
// its own ridge on the bearing its signpost points down, pre-hazed so it reads bluer and farther than the near
// land. This is what turns a pretty clearing into a world: somewhere to point at, and somewhere to walk to.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * Aerial perspective, baked into the paint: everything on a far card is mixed toward the horizon's colour.
 * The 0.62 is deliberate. The card is hazed TWICE — once here in the paint and again in the fragment shader
 * against the hour's live haze — and at full strength the two together washed a castle down to a pale smear you
 * could not pick out of the sky. On the approved opening frame the far mountains are still plainly blue-grey
 * objects, not fog. So the baked half is pulled back and the live half does the rest.
 */
const hz = (hex, k) => mixHex(hex, PAL.sky.horizon, k * 0.62);
const INK = (k) => hz(PAL.outline.prop, 0.42 + k * 0.3);

/** A rolling crest across the whole card: [x, y] points, y in px, crest at `crestY`, +/- `amp`. */
function crestLine(W, crestY, amp, seed, bias = 0) {
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const u = i / 64;
    const n = 0.58 * vnoise(u * 3.1 + seed, seed * 0.7, seed | 0) + 0.28 * vnoise(u * 7.3 + seed, 4.1, (seed | 0) + 1) + 0.14 * vnoise(u * 17 + seed, 9.3, (seed | 0) + 2);
    pts.push([u * W, crestY + (0.5 - n) * 2 * amp + bias * Math.sin(u * Math.PI)]);
  }
  return pts;
}
function fillCrest(g, W, H, pts, topHex, botHex) {
  const grad = g.createLinearGradient(0, Math.min(...pts.map(p => p[1])), 0, H);
  grad.addColorStop(0, topHex); grad.addColorStop(1, botHex);
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(0, H);
  for (const [x, y] of pts) g.lineTo(x, y);
  g.lineTo(W, H); g.closePath(); g.fill();
  return pts;
}
const crestAt = (pts, x) => {
  const W = pts[pts.length - 1][0], u = Math.max(0, Math.min(0.9999, x / W)) * (pts.length - 1);
  const i = Math.floor(u), f = u - i;
  return pts[i][1] * (1 - f) + pts[Math.min(pts.length - 1, i + 1)][1] * f;
};

/** Puddlewick: the home village on its rise — thatched roofs, the church tower, the great chestnut, smoke. */
function paintVillage({ g, wg, W, H, rnd, S, UX }) {
  const back = crestLine(W, H * 0.52, H * 0.075, 12.3);
  fillCrest(g, W, H, back, hz(PAL.hill.mid, 0.62), hz(PAL.hill.midLow, 0.56));
  const front = crestLine(W, H * 0.70, H * 0.055, 31.7, -H * 0.05);
  fillCrest(g, W, H, front, hz(PAL.hill.near, 0.44), hz(PAL.hill.nearLow, 0.40));
  g.strokeStyle = INK(0.55); g.lineWidth = 3; g.lineJoin = 'round';
  g.beginPath(); front.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
  // the lane climbing out of the vale to the village gate
  const gx = UX(0.5);
  g.strokeStyle = hz(PAL.dirt.light, 0.42); g.lineWidth = S * 0.014; g.lineCap = 'round';
  g.beginPath(); g.moveTo(UX(0.40), H); g.quadraticCurveTo(UX(0.42), H * 0.88, gx - S * 0.03, crestAt(front, gx) + 4); g.stroke();
  const wall = hz(PAL.plaster.light, 0.36), wallS = hz(PAL.plaster.dark, 0.40), thatchL = hz(PAL.thatch.light, 0.36), thatchD = hz(PAL.thatch.dark, 0.40);
  const win = (x, y, w, h) => { g.fillStyle = hz(PAL.paint.glass, 0.34); g.fillRect(x, y, w, h); wg.fillStyle = PAL.mask.on; wg.fillRect(x, y, w, h); };
  const clear = (x, y, w, h) => { wg.fillStyle = PAL.mask.off; wg.fillRect(x, y, w, h); };
  /** One cottage: walls, a steep thatched roof with a lit and a shaded pitch, a window, a chimney. */
  const cottage = (cx, w, h, lit) => {
    const gy = crestAt(front, cx) + 2, y0 = gy - h;
    clear(cx - w, y0 - h * 1.1, w * 2, h * 2.4);
    g.fillStyle = lit ? wall : wallS; g.fillRect(cx - w / 2, y0, w, h);
    g.fillStyle = wallS; g.globalAlpha = 0.5; g.fillRect(cx + w * 0.1, y0, w * 0.4, h); g.globalAlpha = 1;
    const rh = h * 0.95, ov = w * 0.16;
    g.beginPath(); g.moveTo(cx - w / 2 - ov, y0 + 2); g.lineTo(cx, y0 - rh); g.lineTo(cx + w / 2 + ov, y0 + 2); g.closePath();
    g.fillStyle = thatchL; g.fill();
    g.beginPath(); g.moveTo(cx, y0 - rh); g.lineTo(cx + w / 2 + ov, y0 + 2); g.lineTo(cx + w * 0.08, y0 + 2); g.closePath();
    g.fillStyle = thatchD; g.fill();
    g.strokeStyle = INK(0.35); g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(cx - w / 2 - ov, y0 + 2); g.lineTo(cx, y0 - rh); g.lineTo(cx + w / 2 + ov, y0 + 2); g.stroke();
    g.strokeRect(cx - w / 2, y0, w, h);
    win(cx - w * 0.17, y0 + h * 0.3, w * 0.34, h * 0.38);
    return { x: cx + w * 0.3, y: y0 - rh * 0.75 };
  };
  const smokes = [];
  // a straggle of cottages either side of the tower, small ones farthest out
  for (const [u, w, h, lit] of [[0.20, 0.052, 0.085, false], [0.28, 0.062, 0.10, true], [0.355, 0.055, 0.09, true],
    [0.62, 0.068, 0.11, true], [0.70, 0.058, 0.095, false], [0.775, 0.05, 0.08, false], [0.845, 0.044, 0.07, true]]) {
    const s = cottage(UX(u), S * w, H * h * (S / H) * 0.42 + H * h * 0.55, lit);
    if (rnd() > 0.45) smokes.push(s);
  }
  // the church: a square tower with a pyramid spire, a bell arch and a gilt weather-lark
  {
    const cx = UX(0.475), tw = S * 0.05, th = H * 0.30, gy = crestAt(front, cx) + 2, y0 = gy - th;
    clear(cx - tw, y0 - th, tw * 2.6, th * 2.4);
    g.fillStyle = hz(PAL.stone.light, 0.36); g.fillRect(cx - tw / 2, y0, tw, th);
    g.fillStyle = hz(PAL.stone.mid, 0.40); g.globalAlpha = 0.65; g.fillRect(cx + tw * 0.08, y0, tw * 0.42, th); g.globalAlpha = 1;
    g.strokeStyle = INK(0.3); g.lineWidth = 2.8; g.strokeRect(cx - tw / 2, y0, tw, th);
    const sh = th * 0.52;
    g.beginPath(); g.moveTo(cx - tw * 0.62, y0 + 1); g.lineTo(cx, y0 - sh); g.lineTo(cx + tw * 0.62, y0 + 1); g.closePath();
    g.fillStyle = hz(PAL.tile.mid, 0.42); g.fill();
    g.beginPath(); g.moveTo(cx, y0 - sh); g.lineTo(cx + tw * 0.62, y0 + 1); g.lineTo(cx + tw * 0.06, y0 + 1); g.closePath();
    g.fillStyle = hz(PAL.tile.dark, 0.44); g.fill();
    g.beginPath(); g.moveTo(cx - tw * 0.62, y0 + 1); g.lineTo(cx, y0 - sh); g.lineTo(cx + tw * 0.62, y0 + 1); g.stroke();
    g.fillStyle = hz(PAL.paint.gold, 0.2); g.beginPath(); g.arc(cx, y0 - sh - tw * 0.16, tw * 0.13, 0, Math.PI * 2); g.fill();
    // the bell arch, which glows warm at night like every window in a DQ village
    g.fillStyle = hz(PAL.paint.glass, 0.3);
    g.beginPath(); g.moveTo(cx - tw * 0.2, y0 + th * 0.36); g.lineTo(cx - tw * 0.2, y0 + th * 0.2); g.arc(cx, y0 + th * 0.2, tw * 0.2, Math.PI, 0); g.lineTo(cx + tw * 0.2, y0 + th * 0.36); g.closePath(); g.fill();
    wg.fillStyle = PAL.mask.on;
    wg.beginPath(); wg.moveTo(cx - tw * 0.2, y0 + th * 0.36); wg.lineTo(cx - tw * 0.2, y0 + th * 0.2); wg.arc(cx, y0 + th * 0.2, tw * 0.2, Math.PI, 0); wg.lineTo(cx + tw * 0.2, y0 + th * 0.36); wg.closePath(); wg.fill();
    // the nave beside it
    const nw = S * 0.075, nh = H * 0.11, ny = gy - nh;
    g.fillStyle = hz(PAL.plaster.light, 0.38); g.fillRect(cx + tw * 0.5, ny, nw, nh);
    g.beginPath(); g.moveTo(cx + tw * 0.4, ny + 1); g.lineTo(cx + tw * 0.5 + nw * 0.45, ny - nh * 0.6); g.lineTo(cx + tw * 0.5 + nw + 4, ny + 1); g.closePath();
    g.fillStyle = hz(PAL.tile.mid, 0.44); g.fill();
    g.strokeStyle = INK(0.32); g.lineWidth = 2.4; g.stroke(); g.strokeRect(cx + tw * 0.5, ny, nw, nh);
  }
  // the great chestnut on the green, and a couple of hedgerow trees
  const tree = (cx, r, dark) => {
    const gy = crestAt(front, cx) + 2;
    g.strokeStyle = hz(PAL.foliage.trunk, 0.4); g.lineWidth = r * 0.3; g.beginPath(); g.moveTo(cx, gy); g.lineTo(cx, gy - r * 1.1); g.stroke();
    for (const [ox, oy, rr] of [[-r * 0.55, -r * 1.5, r * 0.7], [r * 0.5, -r * 1.55, r * 0.66], [0, -r * 2.0, r * 0.78], [-r * 0.15, -r * 1.25, r * 0.72]]) {
      g.fillStyle = dark ? hz(PAL.foliage.dark, 0.44) : hz(PAL.foliage.mid, 0.42);
      g.beginPath(); g.arc(cx + ox, gy + oy, rr, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = dark ? hz(PAL.foliage.mid, 0.46) : hz(PAL.foliage.light, 0.44);
    g.beginPath(); g.arc(cx - r * 0.35, gy - r * 2.1, r * 0.5, 0, Math.PI * 2); g.fill();
  };
  tree(UX(0.555), H * 0.075, false);
  tree(UX(0.13), H * 0.055, true); tree(UX(0.905), H * 0.05, true); tree(UX(0.415), H * 0.045, true);
  // a hedgerow of far trees along the rest of the ridge, so the wide card is a stretch of country and not a
  // village floating in a blank green band
  for (let i = 0; i < 26; i++) {
    const u = (i + 0.5) / 26, cx = u * W;
    if (Math.abs(cx - UX(0.5)) < S * 0.52) continue;
    tree(cx + (vnoise(u * 31, 5.5, 3) - 0.5) * W * 0.02, H * (0.030 + 0.026 * vnoise(u * 17, 2.2, 7)), true);
  }
  // chimney smoke, thin and pale, leaning on the wind
  g.strokeStyle = css(PAL.cloud.lit, 0.5); g.lineCap = 'round';
  for (const s of smokes) {
    g.lineWidth = H * 0.014;
    g.beginPath(); g.moveTo(s.x, s.y);
    g.bezierCurveTo(s.x + H * 0.04, s.y - H * 0.08, s.x - H * 0.02, s.y - H * 0.16, s.x + H * 0.05, s.y - H * 0.26);
    g.stroke();
  }
}

/**
 * Saltmarrow: where the Beck meets the tide. Composition — a green ridge runs right across the card (so the
 * painted land is one solid mass and never a hole), and it SADDLES in the middle: through that gap you see the
 * open sea with a hazy horizon of its own, and the little town standing on the near shore of the bay — roofs, a
 * quay, gulls, and the tide-mill with its great wheel in the millrace (CANON §2).
 */
function paintSeaTown({ g, wg, W, H, S, UX }) {
  const seaY = H * 0.315;
  // the saddle: the crest of the near ridge, dipping to the shore of the bay in the middle of the card
  const crest = (x) => {
    const u = clamp01((x - UX(0.14)) / (S * 0.72));
    const dip = Math.pow(Math.sin(Math.PI * u), 1.25);
    return H * 0.245 + H * 0.40 * dip + H * 0.016 * vnoise(u * 8 + 3, 1.9, 5);
  };
  const BAY0 = UX(0.255), BAY1 = UX(0.745);
  // ── the open sea in the gap ──
  const sea = g.createLinearGradient(0, seaY, 0, H * 0.70);
  sea.addColorStop(0, hz(PAL.water.mid, 0.56)); sea.addColorStop(0.3, hz(PAL.water.mid, 0.34));
  sea.addColorStop(0.8, hz(PAL.water.light, 0.22)); sea.addColorStop(1, hz(PAL.water.foam, 0.16));
  g.fillStyle = sea; g.fillRect(0, seaY, W, H * 0.45);
  g.fillStyle = css(PAL.cloud.lit, 0.34); g.fillRect(0, seaY, W, Math.max(2, H * 0.012));
  // a far blue headland out at sea on the left, so the water has depth in it
  g.fillStyle = hz(PAL.hill.farLow, 0.42);
  g.beginPath(); g.moveTo(UX(0.24), seaY + H * 0.004); g.quadraticCurveTo(UX(0.33), seaY - H * 0.055, UX(0.42), seaY + H * 0.004); g.closePath(); g.fill();
  // a pale glint down the middle of the water, and long slow swells
  const glint = g.createLinearGradient(UX(0.40), 0, UX(0.64), 0);
  glint.addColorStop(0, css(PAL.water.foam, 0)); glint.addColorStop(0.5, css(PAL.water.foam, 0.36)); glint.addColorStop(1, css(PAL.water.foam, 0));
  g.fillStyle = glint; g.fillRect(UX(0.40), seaY, S * 0.24, H * 0.40);
  g.strokeStyle = css(PAL.water.foam, 0.42); g.lineCap = 'round';
  for (let i = 0; i < 20; i++) {
    const y = seaY + H * (0.03 + 0.34 * Math.pow(i / 20, 1.4));
    const x = BAY0 + (BAY1 - BAY0) * ((i * 0.149) % 0.88), w = S * (0.03 + 0.065 * ((i * 7) % 5) / 5);
    g.lineWidth = 1.3 + i * 0.16;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.stroke();
  }
  // ── sails on the tide (drawn before the ridge, so the near shore overlaps them) ──
  const boat = (bx, by, s, flip) => {
    g.fillStyle = hz(PAL.wood.mid, 0.26);
    g.beginPath(); g.moveTo(bx - s, by); g.quadraticCurveTo(bx, by + s * 0.45, bx + s, by); g.closePath(); g.fill();
    g.fillStyle = hz(PAL.cloud.lit, 0.06);
    g.beginPath(); g.moveTo(bx + (flip ? -s * 0.2 : s * 0.2), by - s * 2.1); g.lineTo(bx + (flip ? -s * 0.2 : s * 0.2), by - s * 0.1);
    g.lineTo(bx + (flip ? -s * 1.2 : s * 1.2), by - s * 0.1); g.closePath(); g.fill();
    g.strokeStyle = INK(0.3); g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(bx + (flip ? -s * 0.2 : s * 0.2), by - s * 2.1); g.lineTo(bx + (flip ? -s * 0.2 : s * 0.2), by + s * 0.12); g.stroke();
  };
  boat(UX(0.475), H * 0.50, H * 0.042, false); boat(UX(0.375), H * 0.415, H * 0.028, true); boat(UX(0.600), H * 0.385, H * 0.022, false);
  // ── the ridge: one solid green mass across the whole card, saddling down to the bay ──
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W + 1; x += W / 128) g.lineTo(x, crest(x));
  g.lineTo(W, H); g.closePath();
  const rg = g.createLinearGradient(0, H * 0.20, 0, H);
  rg.addColorStop(0, hz(PAL.hill.mid, 0.40)); rg.addColorStop(0.45, hz(PAL.hill.near, 0.26)); rg.addColorStop(1, hz(PAL.hill.nearLow, 0.18));
  g.fillStyle = rg; g.fill();
  // the waterline along the saddle: pale surf, then the ink of the shore
  g.save();
  g.beginPath(); g.rect(BAY0 - S * 0.01, 0, BAY1 - BAY0 + S * 0.02, H); g.clip();
  g.strokeStyle = css(PAL.water.foam, 0.66); g.lineWidth = H * 0.017;
  g.beginPath(); for (let x = BAY0 - S * 0.02; x <= BAY1 + S * 0.02; x += S / 128) { const y = crest(x) + H * 0.008; x === BAY0 - S * 0.02 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
  g.restore();
  g.strokeStyle = INK(0.38); g.lineWidth = 3.2; g.lineJoin = 'round';
  g.beginPath(); for (let x = 0; x <= W + 1; x += W / 128) { const y = crest(x); x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
  // bare rock on the ridge shoulders where it drops into the tide
  for (const sx of [-1, 1]) {
    const bx = sx < 0 ? BAY0 + S * 0.035 : BAY1 - S * 0.035, by = crest(bx);
    g.fillStyle = hz(PAL.stone.mid, 0.30);
    g.beginPath(); g.moveTo(bx - sx * S * 0.03, by + H * 0.006); g.lineTo(bx + sx * S * 0.022, by + H * 0.055);
    g.lineTo(bx - sx * S * 0.006, by + H * 0.10); g.lineTo(bx - sx * S * 0.042, by + H * 0.055); g.closePath(); g.fill();
    g.strokeStyle = INK(0.3); g.lineWidth = 2; g.stroke();
  }
  const win = (x, y, w, h) => { g.fillStyle = hz(PAL.paint.glass, 0.22); g.fillRect(x, y, w, h); wg.fillStyle = PAL.mask.on; wg.fillRect(x, y, w, h); };
  const clear = (x, y, w, h) => { wg.fillStyle = PAL.mask.off; wg.fillRect(x, y, w, h); wg.fillStyle = PAL.mask.on; };
  // ── the quay: a stone jetty running out into the bay ──
  g.fillStyle = hz(PAL.stone.mid, 0.26);
  g.beginPath(); g.moveTo(UX(0.345), crest(UX(0.345)) + H * 0.012); g.lineTo(UX(0.455), crest(UX(0.455)) - H * 0.048);
  g.lineTo(UX(0.462), crest(UX(0.462)) - H * 0.012); g.lineTo(UX(0.352), crest(UX(0.352)) + H * 0.048); g.closePath(); g.fill();
  g.strokeStyle = INK(0.3); g.lineWidth = 2.4; g.stroke();
  // ── the tide-mill: a tall gabled house at the water with a great wheel in the millrace ──
  {
    const cx = UX(0.565), w = S * 0.072, h = H * 0.20, gy = crest(cx) + H * 0.012, y0 = gy - h;
    clear(cx - w, y0 - h, w * 2.6, h * 2.2);
    g.fillStyle = hz(PAL.plaster.light, 0.20); g.fillRect(cx - w / 2, y0, w, h);
    g.fillStyle = hz(PAL.plaster.dark, 0.28); g.globalAlpha = 0.6; g.fillRect(cx + w * 0.1, y0, w * 0.4, h); g.globalAlpha = 1;
    g.beginPath(); g.moveTo(cx - w * 0.64, y0 + 2); g.lineTo(cx, y0 - h * 0.5); g.lineTo(cx + w * 0.64, y0 + 2); g.closePath();
    g.fillStyle = hz(PAL.tile.mid, 0.18); g.fill();
    g.beginPath(); g.moveTo(cx, y0 - h * 0.5); g.lineTo(cx + w * 0.64, y0 + 2); g.lineTo(cx + w * 0.07, y0 + 2); g.closePath();
    g.fillStyle = hz(PAL.tile.dark, 0.24); g.fill();
    g.strokeStyle = INK(0.16); g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - w * 0.64, y0 + 2); g.lineTo(cx, y0 - h * 0.5); g.lineTo(cx + w * 0.64, y0 + 2); g.stroke();
    g.strokeRect(cx - w / 2, y0, w, h);
    win(cx - w * 0.3, y0 + h * 0.2, w * 0.22, h * 0.2); win(cx + w * 0.08, y0 + h * 0.2, w * 0.22, h * 0.2);
    win(cx - w * 0.12, y0 + h * 0.56, w * 0.26, h * 0.26);
    const wx = cx - w * 0.84, wy = gy - h * 0.10, wr = h * 0.31;
    clear(wx - wr * 1.4, wy - wr * 1.4, wr * 2.8, wr * 2.8);
    g.strokeStyle = hz(PAL.wood.dark, 0.18); g.lineWidth = wr * 0.22;
    g.beginPath(); g.arc(wx, wy, wr, 0, Math.PI * 2); g.stroke();
    g.lineWidth = wr * 0.12;
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.beginPath(); g.moveTo(wx + Math.cos(a) * wr * 0.15, wy + Math.sin(a) * wr * 0.15); g.lineTo(wx + Math.cos(a) * wr * 0.95, wy + Math.sin(a) * wr * 0.95); g.stroke(); }
  }
  // ── the town round the bay, and a church tower up on the right shoulder ──
  const roof = (cx, w, h, lit, gyAt) => {
    const gy = (gyAt ?? crest(cx)) + H * 0.006, y0 = gy - h;
    clear(cx - w, y0 - h, w * 2, h * 2.3);
    g.fillStyle = lit ? hz(PAL.plaster.light, 0.22) : hz(PAL.plaster.dark, 0.30); g.fillRect(cx - w / 2, y0, w, h);
    g.beginPath(); g.moveTo(cx - w * 0.62, y0 + 2); g.lineTo(cx, y0 - h * 0.66); g.lineTo(cx + w * 0.62, y0 + 2); g.closePath();
    g.fillStyle = lit ? hz(PAL.tile.mid, 0.18) : hz(PAL.tile.dark, 0.26); g.fill();
    g.strokeStyle = INK(0.18); g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(cx - w * 0.62, y0 + 2); g.lineTo(cx, y0 - h * 0.66); g.lineTo(cx + w * 0.62, y0 + 2); g.stroke();
    g.strokeRect(cx - w / 2, y0, w, h);
    win(cx - w * 0.16, y0 + h * 0.28, w * 0.32, h * 0.36);
  };
  for (const [u, w, h, lit] of [[0.295, 0.040, 0.062, true], [0.345, 0.032, 0.048, false], [0.400, 0.044, 0.070, true],
    [0.450, 0.034, 0.052, false], [0.495, 0.038, 0.058, true], [0.645, 0.036, 0.056, false], [0.685, 0.042, 0.066, true],
    [0.725, 0.032, 0.048, false]]) roof(UX(u), S * w, H * h, lit);
  {
    const cx = UX(0.775), tw = S * 0.030, th = H * 0.155, gy = crest(cx) + H * 0.006, y0 = gy - th;
    clear(cx - tw, y0 - th, tw * 2.6, th * 2.2);
    g.fillStyle = hz(PAL.stone.light, 0.22); g.fillRect(cx - tw / 2, y0, tw, th);
    g.strokeStyle = INK(0.16); g.lineWidth = 2.8; g.strokeRect(cx - tw / 2, y0, tw, th);
    g.beginPath(); g.moveTo(cx - tw * 0.66, y0 + 1); g.lineTo(cx, y0 - tw * 1.7); g.lineTo(cx + tw * 0.66, y0 + 1); g.closePath();
    g.fillStyle = hz(PAL.tile.mid, 0.20); g.fill(); g.stroke();
    win(cx - tw * 0.2, y0 + th * 0.26, tw * 0.4, th * 0.2);
  }
  // ── gulls over the bay ──
  g.strokeStyle = css(PAL.char.white, 0.80); g.lineWidth = 3; g.lineCap = 'round';
  for (const [x, y, s] of [[UX(0.39), H * 0.225, H * 0.026], [UX(0.455), H * 0.175, H * 0.020], [UX(0.565), H * 0.245, H * 0.022], [UX(0.635), H * 0.19, H * 0.017]]) {
    g.beginPath(); g.moveTo(x - s, y + s * 0.5); g.quadraticCurveTo(x, y - s * 0.45, x + s, y + s * 0.5); g.stroke();
  }
}
/** Coddleston Castle: four green copper spires on a far ridge, with a pale road climbing to the gate. */
function paintCastle({ g, wg, W, H, S, UX }) {
  const back = crestLine(W, H * 0.66, H * 0.07, 71.1);
  fillCrest(g, W, H, back, hz(PAL.hill.farLow, 0.30), hz(PAL.hill.mid, 0.56));
  const ridge = crestLine(W, H * 0.80, H * 0.045, 19.7, -H * 0.10);
  fillCrest(g, W, H, ridge, hz(PAL.hill.near, 0.46), hz(PAL.hill.nearLow, 0.42));
  g.strokeStyle = INK(0.54); g.lineWidth = 3; g.lineJoin = 'round';
  g.beginPath(); ridge.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
  // the road, a thin pale thread climbing the ridge in two switchbacks
  g.strokeStyle = hz(PAL.dirt.light, 0.44); g.lineCap = 'round'; g.lineWidth = S * 0.011;
  g.beginPath(); g.moveTo(UX(0.30), H);
  g.bezierCurveTo(UX(0.36), H * 0.93, UX(0.60), H * 0.93, UX(0.56), H * 0.86);
  g.bezierCurveTo(UX(0.52), H * 0.82, UX(0.42), H * 0.83, UX(0.46), H * 0.79);
  g.stroke();
  const stone = hz(PAL.stone.light, 0.34), stoneS = hz(PAL.stone.mid, 0.40), stoneD = hz(PAL.stone.dark, 0.44);
  const copper = hz(mixHex(PAL.paint.shutterGreen, PAL.stone.light, 0.14), 0.22), copperD = hz(mixHex(PAL.paint.shutterGreen, PAL.foliage.dark, 0.3), 0.26);
  const ink = INK(0.24);
  const win = (x, y, w, h) => { g.fillStyle = hz(PAL.paint.glass, 0.3); g.fillRect(x, y, w, h); wg.fillStyle = PAL.mask.on; wg.fillRect(x, y, w, h); };
  const clear = (x, y, w, h) => { wg.fillStyle = PAL.mask.off; wg.fillRect(x, y, w, h); };
  const baseY = crestAt(ridge, UX(0.5)) + 3;
  // the curtain wall with crenellations and a gatehouse arch
  const wx0 = UX(0.325), wx1 = UX(0.675), wh = H * 0.115, wy = baseY - wh;
  clear(wx0 - 10, wy - 14, wx1 - wx0 + 20, wh + 24);
  g.fillStyle = stone; g.fillRect(wx0, wy, wx1 - wx0, wh);
  g.fillStyle = stoneS; g.globalAlpha = 0.5; g.fillRect(UX(0.53), wy, S * 0.145, wh); g.globalAlpha = 1;
  for (let x = wx0; x < wx1 - 4; x += S * 0.024) { g.fillStyle = stone; g.fillRect(x, wy - H * 0.022, S * 0.014, H * 0.024); g.strokeStyle = ink; g.lineWidth = 2; g.strokeRect(x, wy - H * 0.022, S * 0.014, H * 0.024); }
  g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(wx0, wy, wx1 - wx0, wh);
  g.fillStyle = hz(PAL.paint.glass, 0.26);
  g.beginPath(); g.moveTo(UX(0.475), baseY); g.lineTo(UX(0.475), wy + wh * 0.42); g.arc(UX(0.5), wy + wh * 0.42, S * 0.025, Math.PI, 0); g.lineTo(UX(0.525), baseY); g.closePath(); g.fill();
  // the keep, and four spired towers
  const keepW = S * 0.13, keepH = H * 0.30, kx = UX(0.5), ky = baseY - keepH;
  clear(kx - keepW, ky - keepH * 0.9, keepW * 2, keepH * 2);
  g.fillStyle = stone; g.fillRect(kx - keepW / 2, ky, keepW, keepH);
  g.fillStyle = stoneS; g.globalAlpha = 0.55; g.fillRect(kx + keepW * 0.08, ky, keepW * 0.42, keepH); g.globalAlpha = 1;
  g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(kx - keepW / 2, ky, keepW, keepH);
  g.fillStyle = hz(PAL.paint.glass, 0.26);
  g.beginPath(); g.moveTo(kx - keepW * 0.13, ky + keepH * 0.55); g.lineTo(kx - keepW * 0.13, ky + keepH * 0.32); g.arc(kx, ky + keepH * 0.32, keepW * 0.13, Math.PI, 0); g.lineTo(kx + keepW * 0.13, ky + keepH * 0.55); g.closePath(); g.fill();
  wg.fillStyle = PAL.mask.on;
  wg.beginPath(); wg.moveTo(kx - keepW * 0.13, ky + keepH * 0.55); wg.lineTo(kx - keepW * 0.13, ky + keepH * 0.32); wg.arc(kx, ky + keepH * 0.32, keepW * 0.13, Math.PI, 0); wg.lineTo(kx + keepW * 0.13, ky + keepH * 0.55); wg.closePath(); wg.fill();
  const tower = (cx, tw, th, lit, banner) => {
    const y0 = baseY - th;
    clear(cx - tw * 1.3, y0 - th * 0.8, tw * 2.6, th * 1.9);
    g.fillStyle = lit ? stone : stoneS; g.fillRect(cx - tw / 2, y0, tw, th);
    g.fillStyle = stoneD; g.globalAlpha = 0.42; g.fillRect(cx + tw * 0.12, y0, tw * 0.38, th); g.globalAlpha = 1;
    g.strokeStyle = ink; g.lineWidth = 2.8; g.strokeRect(cx - tw / 2, y0, tw, th);
    const sh = tw * 1.45;
    g.beginPath(); g.moveTo(cx - tw * 0.66, y0 + 2); g.lineTo(cx, y0 - sh); g.lineTo(cx + tw * 0.66, y0 + 2); g.closePath();
    g.fillStyle = copper; g.fill();
    g.beginPath(); g.moveTo(cx, y0 - sh); g.lineTo(cx + tw * 0.66, y0 + 2); g.lineTo(cx + tw * 0.06, y0 + 2); g.closePath();
    g.fillStyle = copperD; g.fill();
    g.beginPath(); g.moveTo(cx - tw * 0.66, y0 + 2); g.lineTo(cx, y0 - sh); g.lineTo(cx + tw * 0.66, y0 + 2); g.stroke();
    for (let k = 0; k < Math.floor(th / (H * 0.075)); k++) win(cx - tw * 0.14, y0 + th * 0.2 + k * H * 0.072, tw * 0.28, H * 0.04);
    if (banner) {
      g.strokeStyle = ink; g.lineWidth = 2.2; g.beginPath(); g.moveTo(cx, y0 - sh); g.lineTo(cx, y0 - sh - H * 0.05); g.stroke();
      g.fillStyle = hz(PAL.flower.red, 0.26);
      g.beginPath(); g.moveTo(cx, y0 - sh - H * 0.05); g.quadraticCurveTo(cx + S * 0.028, y0 - sh - H * 0.038, cx + S * 0.045, y0 - sh - H * 0.05);
      g.quadraticCurveTo(cx + S * 0.026, y0 - sh - H * 0.006, cx, y0 - sh - H * 0.004); g.closePath(); g.fill();
    }
  };
  tower(UX(0.355), S * 0.036, H * 0.245, true, false);
  tower(UX(0.645), S * 0.036, H * 0.235, false, false);
  tower(UX(0.432), S * 0.030, H * 0.315, true, true);
  tower(UX(0.568), S * 0.030, H * 0.305, false, true);
  // a dark copse at the ridge foot, so the castle reads as standing above a wood
  for (const [u, r] of [[0.19, 0.030], [0.235, 0.024], [0.80, 0.028], [0.855, 0.022], [0.90, 0.026], [0.14, 0.022]]) {
    const cx = UX(u), gy = crestAt(ridge, cx) + H * 0.02, rr = H * r;
    g.fillStyle = hz(PAL.foliage.dark, 0.48);
    g.beginPath(); g.arc(cx, gy - rr, rr, 0, Math.PI * 2); g.arc(cx + rr * 0.8, gy - rr * 0.7, rr * 0.7, 0, Math.PI * 2); g.fill();
  }
  // copses running away along the rest of the downs, so a wide card is Coddleston Downs and not a castle on a lawn
  for (let i = 0; i < 30; i++) {
    const u = (i + 0.5) / 30, cx = u * W;
    if (Math.abs(cx - UX(0.5)) < S * 0.45) continue;
    const gy = crestAt(ridge, cx) + H * 0.02, rr = H * (0.016 + 0.020 * vnoise(u * 19, 4.4, 11));
    g.fillStyle = hz(PAL.foliage.dark, 0.44 + 0.10 * vnoise(u * 27, 1.3, 5));
    g.beginPath(); g.arc(cx, gy - rr, rr, 0, Math.PI * 2); g.arc(cx + rr * 0.85, gy - rr * 0.66, rr * 0.66, 0, Math.PI * 2); g.fill();
  }
}

/** The Whispering Wood, with Cobwell Manor's crooked gable in a clearing and one window already lit. */
function paintWood({ g, wg, W, H, S, UX }) {
  const back = crestLine(W, H * 0.50, H * 0.06, 91.3);
  fillCrest(g, W, H, back, hz(PAL.hill.farLow, 0.34), hz(PAL.hill.midLow, 0.5));
  const ridge = crestLine(W, H * 0.70, H * 0.04, 23.9);
  fillCrest(g, W, H, ridge, hz(PAL.foliage.dark, 0.40), hz(PAL.foliage.dark, 0.30));
  // a wooded crest: clumps of canopy along the ridge line
  const CLUMPS = Math.round(110 * W / Math.max(1, S));
  for (let i = 0; i < CLUMPS; i++) {
    const u = (i + 0.4) / CLUMPS, cx = u * W, r = H * (0.034 + 0.030 * vnoise(u * 21 * S / W, 3.3, 5));
    const gy = crestAt(ridge, cx) + H * 0.012;
    g.fillStyle = hz(PAL.foliage.dark, 0.34 + 0.12 * vnoise(u * 13, 7.1, 9));
    g.beginPath(); g.arc(cx, gy - r * 0.8, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = hz(PAL.foliage.mid, 0.48);
    g.beginPath(); g.arc(cx - r * 0.3, gy - r * 1.25, r * 0.45, 0, Math.PI * 2); g.fill();
  }
  // Cobwell Manor: a tall crooked gable in a clearing, two chimneys at odd angles, one lit window
  const cx = UX(0.52), w = S * 0.105, h = H * 0.36, gy = crestAt(ridge, cx) + H * 0.015, y0 = gy - h;
  wg.fillStyle = PAL.mask.off; wg.fillRect(cx - w, y0 - h, w * 2.4, h * 2.2); wg.fillStyle = PAL.mask.on;
  g.save(); g.translate(cx, gy); g.rotate(0.035); g.translate(-cx, -gy);
  g.fillStyle = hz(PAL.plaster.grime, 0.36); g.fillRect(cx - w / 2, y0, w, h);
  g.fillStyle = hz(PAL.wood.dark, 0.44); g.globalAlpha = 0.5; g.fillRect(cx + w * 0.1, y0, w * 0.4, h); g.globalAlpha = 1;
  g.beginPath(); g.moveTo(cx - w * 0.66, y0 + 2); g.lineTo(cx - w * 0.06, y0 - h * 0.52); g.lineTo(cx + w * 0.66, y0 + 2); g.closePath();
  g.fillStyle = hz(PAL.tile.dark, 0.40); g.fill();
  g.strokeStyle = INK(0.26); g.lineWidth = 2.8;
  g.beginPath(); g.moveTo(cx - w * 0.66, y0 + 2); g.lineTo(cx - w * 0.06, y0 - h * 0.52); g.lineTo(cx + w * 0.66, y0 + 2); g.stroke();
  g.strokeRect(cx - w / 2, y0, w, h);
  for (const [ox, lean] of [[-w * 0.3, -0.12], [w * 0.34, 0.16]]) {
    g.save(); g.translate(cx + ox, y0 - h * 0.3); g.rotate(lean);
    g.fillStyle = hz(PAL.stone.dark, 0.38); g.fillRect(-w * 0.08, -h * 0.30, w * 0.16, h * 0.34);
    g.strokeStyle = INK(0.26); g.lineWidth = 2.4; g.strokeRect(-w * 0.08, -h * 0.30, w * 0.16, h * 0.34);
    g.restore();
  }
  // one window lit, the rest dark and empty
  g.fillStyle = hz(PAL.interior.lamp, 0.18); g.fillRect(cx - w * 0.28, y0 + h * 0.26, w * 0.2, h * 0.18);
  wg.fillRect(cx - w * 0.28, y0 + h * 0.26, w * 0.2, h * 0.18);
  g.fillStyle = hz(PAL.paint.glass, 0.24);
  g.fillRect(cx + w * 0.08, y0 + h * 0.26, w * 0.2, h * 0.18);
  g.fillRect(cx - w * 0.1, y0 + h * 0.62, w * 0.2, h * 0.2);
  g.restore();
  // mist pooling in the wood's hollows
  const mist = g.createLinearGradient(0, H * 0.72, 0, H);
  mist.addColorStop(0, css(PAL.sky.haze, 0)); mist.addColorStop(1, css(PAL.sky.haze, 0.55));
  g.fillStyle = mist; g.fillRect(0, H * 0.72, W, H * 0.28);
}

/**
 * The skyline of Puddlewick Vale: four places you can see from the opening meadow, each on the bearing its
 * signpost points down (WORLD-BIBLE §1: Puddlewick [01], Saltmarrow [03] north-east, Coddleston [06] east along
 * the Long Lane, Cobwell Manor [04] in the Whispering Wood). `az` = atan2(z, x) of the direction it lies in.
 */
export const LANDMARK_SETS = {
  vale: [
    // `width`/`height` are now only the card's ASPECT: the world size is fitted at build time so the highest
    // PAINTED point (a spire, a roof ridge, a treetop) lands at `topDeg` degrees of elevation from the vale, and
    // the card's foot at `footDeg` — just above the horizon, where it dissolves into the aerial haze.
    // Fixed world heights used to put the spires at 13-15 degrees, well above the top of the frame, so the field
    // camera cut every castle and town in half; the fit keeps the whole silhouette inside the sky band instead.
    // The bearings are the LANE MOUTHS of the opening vale, not decoration: -66.8 deg is the village clearing the
    // Puddlewick lane runs out through, -7.4 deg the east lane down the Beck to Saltmarrow, +76 deg the Long Lane
    // south to Coddleston. A place standing where the wood already opens is a place you can see.
    // They stand BEYOND the mid hill ring (r 118-205) rather than inside it, so the ring is a foreground they rise
    // over — and so walking the 70 m to the lane's end really closes 30-40% of the distance to them.
    // `width : height` is the CARD (a panorama, ~5.5 : 1); `town` is the aspect the place itself is painted at,
    // so widening the card spreads country round the village instead of stretching the village.
    { id: 'puddlewick', name: 'Puddlewick', az: -1.166, dist: 215, width: 205, height: 37, town: 2.4, topDeg: 7.8, footDeg: 1.6, crest: 0.30, haze: 0.19, gate: 0.88, paint: paintVillage },
    { id: 'saltmarrow', name: 'Saltmarrow', az: -0.129, dist: 228, width: 240, height: 43, town: 2.5, topDeg: 8.1, footDeg: 1.6, crest: 0.20, haze: 0.19, gate: 0.88, paint: paintSeaTown },
    { id: 'coddleston', name: 'Coddleston Castle', az: 1.326, dist: 232, width: 265, height: 48, town: 1.95, topDeg: 7.1, footDeg: 1.5, crest: 0.20, haze: 0.22, gate: 0.88, paint: paintCastle },
    { id: 'whispering_wood', name: 'the Whispering Wood', az: 2.950, dist: 205, width: 180, height: 32, town: 2.4, topDeg: 6.4, footDeg: 1.6, crest: 0.30, haze: 0.24, gate: 0.72, paint: paintWood },
  ],
};

const LANDMARK_VERT = /* glsl */`
  varying vec2 vLUv; varying vec3 vLW;
  void main(){ vLUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vLW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

const LANDMARK_FRAG = /* glsl */`
  uniform sampler2D tCard, tWin;
  uniform vec3 uWinCol, uEnvLight, uEnvHaze, uEnvHorizon, uEnvTwilightCol, uEnvSun, uEnvSunDir;
  uniform float uEnvNight, uEnvDusk, uEnvTwilight, uEnvOvercast, uEnvPrecip, uEnvSnow, uHaze, uFade;
  varying vec2 vLUv; varying vec3 vLW;
  void main(){
    vec4 C = texture2D(tCard, vLUv);
    if (C.a < 0.006) discard;
    vec3 col = C.rgb * uEnvLight;
    // aerial perspective: the foot of the ridge sits back in the haze, the crest stays readable
    float low = 1.0 - smoothstep(0.02, 0.62, vLUv.y);
    float k = clamp(uHaze * (0.55 + 0.75 * low) + uEnvOvercast * 0.26 + uEnvPrecip * 0.2 + uEnvSnow * 0.12, 0.0, 0.94);
    col = mix(col, uEnvHaze, k);
    // the low sun rakes the skyline warm at dusk and dawn, from the side it is on
    float face = pow(max(dot(normalize(vec3(-vLW.x, 0.0, -vLW.z)), normalize(vec3(uEnvSunDir.x, 0.0, uEnvSunDir.z) + vec3(1e-5))), 0.0), 1.5);
    col = mix(col, uEnvTwilightCol, uEnvTwilight * (0.12 + 0.34 * face) * (1.0 - uEnvNight) * 0.7);
    // every window in the place lights up after dusk
    float w = texture2D(tWin, vLUv).r;
    col = mix(col, uWinCol, w * clamp(uEnvNight * 0.95 + uEnvDusk * 0.5, 0.0, 1.0) * 0.9);
    col += uEnvSun * w * uEnvNight * 0.06;
    gl_FragColor = vec4(col, C.a * uFade);
    #include <colorspace_fragment>
  }`;

/**
 * Build the skyline. `list` is a key of LANDMARK_SETS, or an array of specs. Returns the group, the specs (with
 * the camera orbit that faces each one) and a describe() for __DQ.state().sky.
 */
export function buildLandmarks(scene, list = 'vale') {
  const specs = (typeof list === 'string' ? LANDMARK_SETS[list] : list) || [];
  const group = new THREE.Group(); group.name = 'landmarks';
  const out = [];
  const E = ENV.u;
  for (const L of specs) {
    try {
      // A PANORAMA, not a postcard. The card runs `width : height`, but the PLACE inside it is painted at its own
      // design aspect (`town`) and the rest of the card is the country either side of it — ridge, copses,
      // hedgerow trees, sea. That is what the approved opening frame does with its mountains: they run the whole
      // width, so a scattering of trees can never hide them, only interrupt them. S is the place's own span in
      // pixels; UX(u) puts a design coordinate on the card.
      const RES = 1280;
      const W = RES, H = Math.max(96, Math.round(RES * L.height / L.width));
      const S = Math.min(W, H * (L.town ?? L.width / L.height));
      const UX = (u) => W * 0.5 + (u - 0.5) * S;
      const c = mkCanvas(W, H), g = ctx2(c);
      const wc = mkCanvas(W, H), wg = ctx2(wc);
      wg.fillStyle = PAL.mask.off; wg.fillRect(0, 0, W, H);
      g.lineJoin = 'round'; g.lineCap = 'round';
      L.paint({ g, wg, W, H, S, UX, rnd: mulberry(((L.id.charCodeAt(0) * 7919) | 0) + 13) });
      // Every edge of the card dissolves into the haze, so a painted landscape never ends on a straight line —
      // the one thing that would give away that the skyline is painted at all.
      g.globalCompositeOperation = 'destination-out';
      const ramp = (x0, y0, x1, y1, rect) => {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, css(PAL.mask.on, 1)); gr.addColorStop(0.55, css(PAL.mask.on, 0.55)); gr.addColorStop(1, css(PAL.mask.on, 0));
        g.fillStyle = gr; g.fillRect(...rect);
      };
      // The foot. A place hung clear of the treeline has open sky under it, so the bottom of the card must melt
      // into the haze over a long way — a third of its height — or the card reads as a green shelf floating in
      // the air with a ruled edge along the bottom.
      ramp(0, H, 0, H * 0.64, [0, H * 0.64, W, H * 0.36]);                 // the foot
      ramp(0, 0, W * 0.17, 0, [0, 0, W * 0.17, H]);                        // the left edge
      ramp(W, 0, W * 0.83, 0, [W * 0.83, 0, W * 0.17, H]);                 // the right edge
      ramp(0, 0, 0, H * 0.04, [0, 0, W, H * 0.04]);                        // the top edge
      g.globalCompositeOperation = 'source-over';
      // Where does the PAINT actually reach? (the card is mostly empty sky above a town, and the ramps have just
      // eaten its edges) — the answer sets the card's world size, so the silhouette lands in the sky band.
      let pTop = H - 1;
      try {
        const px = g.getImageData(0, 0, W, H).data;
        for (let y = 0; y < H; y++) {
          for (let x = 2; x < W - 2; x += 2) if (px[(y * W + x) * 4 + 3] > 76) { pTop = y; break; }
          if (pTop < H - 1) break;
        }
      } catch (e) { reportError('landmark paint extent ' + L.id, e); }
      const D2R = Math.PI / 180;
      const footY = L.dist * Math.tan((L.footDeg ?? 0.5) * D2R);
      const topY = L.dist * Math.tan((L.topDeg ?? 6.5) * D2R);
      const hW = Math.max(4, (topY - footY) / Math.max(0.15, 1 - pTop / H));
      const wW = hW * (L.width / L.height);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const wtex = new THREE.CanvasTexture(wc);
      wtex.colorSpace = THREE.NoColorSpace; wtex.wrapS = wtex.wrapT = THREE.ClampToEdgeWrapping;
      const U = {
        tCard: { value: tex }, tWin: { value: wtex }, uWinCol: { value: C3(PAL.interior.lamp) },
        uHaze: { value: L.haze ?? 0.3 }, uFade: { value: 1 },
        uEnvLight: E.uEnvLight, uEnvHaze: E.uEnvHaze, uEnvHorizon: E.uEnvHorizon, uEnvTwilightCol: E.uEnvTwilightCol,
        uEnvSun: E.uEnvSun, uEnvSunDir: E.uEnvSunDir, uEnvNight: E.uEnvNight, uEnvDusk: E.uEnvDusk,
        uEnvTwilight: E.uEnvTwilight, uEnvOvercast: E.uEnvOvercast, uEnvPrecip: E.uEnvPrecip, uEnvSnow: E.uEnvSnow,
      };
      const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: LANDMARK_VERT, fragmentShader: LANDMARK_FRAG,
        transparent: true, depthWrite: false, depthTest: true, fog: false, side: THREE.DoubleSide });
      mat.name = 'landmark-' + L.id;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wW, hW), mat);
      const cy = footY + hW / 2;
      mesh.position.set(Math.cos(L.az) * L.dist, cy, Math.sin(L.az) * L.dist);
      mesh.lookAt(0, cy, 0);
      mesh.renderOrder = -8.5; mesh.frustumCulled = false; mesh.name = 'landmark-' + L.id;
      group.add(mesh);
      // the camera orbit that puts this place in the middle of the frame (camera sits opposite the bearing)
      const orbit = (Math.atan2(-Math.cos(L.az), -Math.sin(L.az)) * 180 / Math.PI + 360) % 360;
      out.push({ id: L.id, name: L.name, az: L.az, dist: L.dist, size: [+wW.toFixed(1), +hW.toFixed(1)], y0: +footY.toFixed(2),
        paintTop: +(pTop / H).toFixed(3), aspect: L.width / L.height, topDeg: L.topDeg ?? 6.5, footDeg: L.footDeg ?? 0.5,
        crest: L.crest ?? 0.24, gate: L.gate ?? 0.6, orbit: Math.round(orbit * 10) / 10, mesh });
    } catch (e) { reportError('landmark ' + (L && L.id), e); }
  }
  scene.add(group);
  const api = {
    group, list: out, fitted: null,
    get(id) { return out.find(m => m.id === id) || null; },
    /** `dist` is how far away the place is FROM THE PLAYER right now — it has to come down as a child walks at it. */
    describe: () => {
      const cam = CURRENT.camera;
      return out.map((m) => {
        const wx = Math.cos(m.az) * m.dist, wz = Math.sin(m.az) * m.dist;
        const dist = cam ? Math.round(Math.hypot(wx - cam.position.x, wz - cam.position.z)) : m.dist;
        // how big the place LOOKS from here, in degrees: pure geometry, so "does it grow as I walk at it?" is a
        // number that does not depend on where in the frame it happens to land
        const angDeg = +(2 * Math.atan(m.size[1] * 0.5 / Math.max(1, dist)) * R2D).toFixed(3);
        return { id: m.id, name: m.name, bearing: Math.round(m.az * 1800 / Math.PI) / 10, dist, home: m.dist, angDeg,
          orbit: m.orbit, size: m.size, footDeg: m.footDeg, topDeg: m.topDeg, skylineDeg: m.skylineDeg ?? null };
      });
    },
  };
  CURRENT.landmarks = api;
  installLandmarkDebug();
  return api;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SKYLINE — measuring what actually stands between the lens and a painted place, and hanging the places
// above it. A landmark that reports "onScreen, unclipped, 120 px of paint" while a wall of oaks renders in front
// of it is a lie: these are the tools that stop the assertion measuring anything but what a child can see.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
/** Never a blocker: the backdrop itself, the weather, the shadows under things, the UI. */
const NOT_A_BLOCKER = /^(sky|clouds|highfeather|bird|weather-|landmark|blobShadow|contactShadow|talk-prompt|rig:|outline|smoke|motes|pollen|butterfl|dust|spark|glow|prompt|ghost)/;
const _v = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _box = new THREE.Box3();

/**
 * THE SKYLINE PROFILE — how the world's silhouette is measured, and why it is not a raycast.
 *
 * The honest question is "is this patch of painted castle behind the world's silhouette?", and the first version
 * answered it with THREE.Raycaster against the live scene. That is exact and unusably slow: 1980 rays against 83
 * meshes (several of them InstancedMeshes with a thousand trees each) took 16.3 SECONDS in one frame at map load
 * — a freeze a child would notice long before they noticed the castle.
 *
 * So the world is reduced ONCE, per eye, to a silhouette: 720 bins of azimuth, each holding the highest elevation
 * anything reaches there and how far away that thing is. Everything that stands (trees, hedges, buildings, the
 * painted treetop cards, props) becomes a vertical cylinder from its world bounding box — which is also the only
 * honest proxy for the tree cards, since they turn to face the lens in their vertex shader and a geometry raycast
 * against them is meaningless. The few very wide meshes (the ground, the hill rings, the water) are too big to be
 * a cylinder, so their own vertices are dropped straight into the bins.
 *
 * Reading the profile is then a lookup: ~0.15 ms to build, microseconds to ask. Being a silhouette it cannot see
 * a gap UNDER a canopy, which is exactly right for a place on the horizon.
 */
const NBIN = 720, BIN = NBIN / TAU;

/** Every blocker in the scene, as vertical cylinders plus the handful of meshes too wide to be one. */
function occluders(scene) {
  const cyl = [], big = [];
  if (!scene || !scene.traverse) return { cyl, big };
  scene.traverse((o) => {
    if (!o.visible || (!o.isMesh && !o.isInstancedMesh)) return;
    const n = o.name || ((o.material && o.material.name) ? 'mat:' + o.material.name : o.type + '#' + o.id);
    if (NOT_A_BLOCKER.test(n) || n.endsWith(':outline') || o.renderOrder <= -8) return;
    if (o.userData && o.userData.isOutline) return;
    // Anything drawn transparent is something you can see through: a ghosted tree, a see-through cottage, a
    // sprite. It cannot hide a place on the horizon, and counting it as a blocker was reporting a 17.7-degree
    // wall at 35 m on the Puddlewick bearing that nothing in the frame actually contains.
    const mat = o.material;
    if (mat && !Array.isArray(mat) && mat.transparent && (mat.opacity ?? 1) < 0.92) return;
    const g = o.geometry;
    if (!g || !g.attributes || !g.attributes.position) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    o.updateMatrixWorld();
    const push = (m, cap) => {
      _box.copy(bb).applyMatrix4(m);
      const w = _box.max.x - _box.min.x, d = _box.max.z - _box.min.z;
      // 0.34 of the footprint, not half: a canopy is a cluster of blobs, and a cylinder of its full bounding
      // width reported a chestnut as hiding 80 of 160 samples where an exact geometry raycast found 40.
      const r = Math.min(cap, Math.max(0.05, Math.sqrt(Math.max(0.01, w * d)) * 0.34));
      cyl.push({ x: (_box.min.x + _box.max.x) * 0.5, z: (_box.min.z + _box.max.z) * 0.5, r,
        y0: _box.min.y, y1: _box.max.y, name: n });
    };
    if (o.isInstancedMesh) {
      // every instance is one prop: a tree, a bush, a painted treetop. Each gets its own cylinder.
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, _m4); push(_m4.premultiply(o.matrixWorld), 14); }
    } else {
      // A MERGED mesh is not a thing: src/art/props.js kit.flush() merges every thatched roof in the map into one
      // `bucket-thatch`, and the ground and the hill rings are whole landscapes. One cylinder round those would
      // black out half the compass (it did: bucket-thatch reported a 22-degree skyline from -100 to -40), so
      // anything wider than about 20 m across goes in by its own vertices instead.
      _box.copy(bb).applyMatrix4(o.matrixWorld);
      const w = _box.max.x - _box.min.x, d = _box.max.z - _box.min.z;
      if (Math.sqrt(Math.max(0.01, w * d)) * 0.42 > 9) big.push(o); else push(o.matrixWorld, 14);
    }
  });
  return { cyl, big };
}

/** The silhouette of the whole world from one eye: max elevation per azimuth bin, and its distance. */
function skylineProfile(O, eye) {
  const el = new Float32Array(NBIN).fill(-90), di = new Float32Array(NBIN).fill(1e9), who = new Array(NBIN).fill(null);
  const put = (b, e, d, name) => { const i = ((b % NBIN) + NBIN) % NBIN; if (e > el[i]) { el[i] = e; di[i] = d; who[i] = name; } };
  for (const c of O.cyl) {
    const dx = c.x - eye.x, dz = c.z - eye.z, d = Math.hypot(dx, dz);
    if (d < 0.3) continue;
    const top = Math.atan2(c.y1 - eye.y, Math.max(0.5, d - c.r)) * R2D;
    if (top < -20) continue;
    const half = d <= c.r ? Math.PI : Math.asin(Math.min(0.999, c.r / d));
    const a0 = Math.atan2(dz, dx) * BIN, hb = Math.max(0.5, half * BIN);
    for (let b = Math.floor(a0 - hb); b <= Math.ceil(a0 + hb); b++) {
      // the silhouette of a cylinder sags at its edges; near the middle it is the full height
      const t = Math.min(1, Math.abs(b - a0) / hb);
      put(b, top - (top + 2) * t * t * 0.34, d, c.name);
    }
  }
  // the wide meshes (ground, hill rings, water): their own vertices straight into the bins
  for (const o of O.big) {
    const p = o.geometry.attributes.position, m = o.matrixWorld, n = o.name || 'mesh';
    const step = p.count > 24000 ? 2 : 1;
    for (let i = 0; i < p.count; i += step) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m);
      const dx = _v.x - eye.x, dz = _v.z - eye.z, d = Math.hypot(dx, dz);
      if (d < 2) continue;
      put(Math.round(Math.atan2(dz, dx) * BIN), Math.atan2(_v.y - eye.y, d) * R2D, d, n);
    }
  }
  // a coarse ring mesh leaves holes between its vertices: close them with a 3-bin dilation
  const el2 = el.slice(), di2 = di.slice(), who2 = who.slice();
  for (let i = 0; i < NBIN; i++) {
    for (const k of [-2, -1, 1, 2]) {
      const j = ((i + k) % NBIN + NBIN) % NBIN;
      if (el[j] > el2[i]) { el2[i] = el[j]; di2[i] = di[j]; who2[i] = who[j]; }
    }
  }
  return { el: el2, di: di2, who: who2,
    /** Is a ray at this bearing and elevation stopped by something nearer than `maxDist`? */
    blocked(az, elDeg, maxDist = 1e9) {
      const i = ((Math.round(az * BIN) % NBIN) + NBIN) % NBIN;
      return elDeg < el2[i] && di2[i] < maxDist ? { t: di2[i], name: who2[i] } : null;
    },
    at(az) {
      const i = ((Math.round(az * BIN) % NBIN) + NBIN) % NBIN;
      return { deg: el2[i], dist: di2[i], name: who2[i] };
    } };
}

/** How high the world stands on this bearing, in degrees, as seen from `eye` — treetops, rim, hills, everything. */
function skylineDeg(prof, az, who = null) {
  const r = prof.at(az);
  if (who) { who.name = r.name; who.dist = Number.isFinite(r.dist) && r.dist < 1e8 ? Math.round(r.dist) : null; }
  return Math.max(-3, Math.min(22, r.deg));
}

/** The elevation of the very top of the frame for this camera: the ceiling a painted place has to fit under. */
function frameTopDeg(camera) {
  try {
    const d = new THREE.Vector3(0, 1, 0.5).unproject(camera).sub(camera.position).normalize();
    return Math.asin(Math.max(-1, Math.min(1, d.y))) * R2D;
  } catch (e) { reportError('frameTop', e); return 8; }
}

/** Re-hang one card so its painted extent spans footDeg..topDeg of elevation at its own distance. */
function hangCard(m, footDeg, topDeg) {
  const footY = m.dist * Math.tan(footDeg * D2R), topY = m.dist * Math.tan(topDeg * D2R);
  const hW = Math.max(4, (topY - footY) / Math.max(0.15, 1 - m.paintTop));
  const wW = hW * m.aspect;
  const old = m.mesh.geometry;
  m.mesh.geometry = new THREE.PlaneGeometry(wW, hW);
  try { old.dispose(); } catch (e) { void e; }
  const cy = footY + hW / 2;
  m.mesh.position.set(Math.cos(m.az) * m.dist, cy, Math.sin(m.az) * m.dist);
  m.mesh.lookAt(0, cy, 0);
  m.mesh.updateMatrixWorld();
  m.size = [+wW.toFixed(1), +hW.toFixed(1)];
  m.y0 = +footY.toFixed(2); m.footDeg = +footDeg.toFixed(2); m.topDeg = +topDeg.toFixed(2);
  m.orbit = Math.round(((Math.atan2(-Math.cos(m.az), -Math.sin(m.az)) * R2D + 360) % 360) * 10) / 10;
}

/**
 * THE FIT. Run a few frames after a map is built, when its wood, its rim and its hill rings exist.
 * For each painted place: measure the real skyline across the bearings it covers, nudge it (a little) toward the
 * clearest bearing near its signposted one, then re-hang it so its FOOT sits just above the treeline and its
 * highest spire just under the top of the frame. A castle you can see beats a castle in the right place.
 */
export function fitLandmarks(marks, scene, camera, opts = {}) {
  if (!marks || !marks.list.length || !scene || !camera) return null;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
  const O = occluders(scene);
  // Measured from the MIDDLE of the vale at the camera's own eye height, not from wherever the hero happens to
  // be standing: a place has to read from the whole meadow, not only from the spawn tile.
  const eye = opts.eye ? new THREE.Vector3(...opts.eye) : new THREE.Vector3(0, camera.position.y, 0);
  const eyes = opts.eye ? [eye] : [eye, camera.position.clone()];
  const profs = eyes.map(e => skylineProfile(O, e));
  // THE CEILING. It should be the top of the frame — but the fit runs a few frames after a map is built, and in
  // those frames the camera is still swinging into place behind the hero, so reading it raw once hung every
  // place at 4.4 degrees instead of 7.1 and left them half the size for the rest of the session. So: use the
  // frame only when it reports a sane gameplay sky band, and otherwise fall back to the measured one (7.49 deg
  // at the meadow's opening camera). A deterministic ceiling also means walking at a place really grows it.
  const camTop = frameTopDeg(camera);
  const cap = opts.capDeg ?? ((camTop >= 6.4 && camTop <= 9.5) ? camTop - 0.35 : 7.14);
  const out = [];
  for (const m of marks.list) {
    try {
      const halfAz = Math.atan2(m.size[0] * 0.5, m.dist);
      // The skyline that matters is the WORST of the two places a child looks from: where the hero is standing
      // now, and the middle of the vale. A place hung above both is a place you can see from anywhere in it.
      const sky = (az, all) => {
        let k = -99;
        for (const P of (all ? profs : [profs[0]])) for (let i = 0; i < 9; i++) k = Math.max(k, skylineDeg(P, az + (i / 4 - 1) * halfAz * 0.9));
        return k;
      };
      // a nudge toward the clearest bearing near the one the signpost points down (never more than 12 deg, and
      // a tie always goes to the signposted bearing)
      let bestAz = m.az, bestK = sky(m.az, false);
      if (opts.nudge !== false) {
        for (const d of [-12, -8, -4, 4, 8, 12]) {
          const az = m.az + d * D2R, k = sky(az, false) + Math.abs(d) * 0.030;
          if (k < bestK - 0.05) { bestK = k; bestAz = az; }
        }
      }
      bestK = Math.max(bestK, sky(bestAz, true));
      m.az = bestAz;
      const skyDeg = Math.max(0.2, bestK);
      // The card's bottom fifth is ramped away to nothing (see buildLandmarks), so letting the FOOT sink a little
      // into the treeline costs no visible paint and buys the place real height. The spires still stand clear.
      let foot = skyDeg - 0.85, top = cap;
      if (top - foot < 2.4) foot = Math.max(0.2, top - 2.4);          // never a smear: keep 2.4 deg of place
      foot = Math.max(0.2, Math.min(foot, top - 1.2));
      hangCard(m, foot, top);
      m.skylineDeg = +skyDeg.toFixed(2);
      out.push({ id: m.id, bearing: +(m.az * R2D).toFixed(1), skylineDeg: m.skylineDeg, footDeg: m.footDeg, topDeg: m.topDeg, size: m.size });
    } catch (e) { reportError('landmark fit ' + m.id, e); }
  }
  // the hill rings' saddles follow the nudged bearings (the dome reads uGateAz every frame)
  try {
    for (const U of GATE_UNIFORMS) {
      marks.list.slice(0, 4).forEach((m, i) => { U.uGateAz.value[['x', 'y', 'z', 'w'][i]] = m.az; });
    }
  } catch (e) { reportError('landmark gates', e); }
  marks.fitted = { at: Date.now(), ms: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0),
    capDeg: +cap.toFixed(2), eye: [+eye.x.toFixed(1), +eye.y.toFixed(1), +eye.z.toFixed(1)], places: out };
  return marks.fitted;
}

/**
 * Re-hang the places against a (now settled) camera WITHOUT re-measuring the skyline: the wood has not moved,
 * only the lens has. Cheap enough to run a second time a few seconds after a map loads.
 */
export function rehangLandmarks(marks, camera) {
  if (!marks || !camera) return null;
  const camTop = frameTopDeg(camera);
  const cap = (camTop >= 6.4 && camTop <= 9.5) ? camTop - 0.35 : 7.14;
  for (const m of marks.list) {
    if (m.skylineDeg == null) continue;
    let foot = m.skylineDeg - 0.85, top = cap;
    if (top - foot < 2.4) foot = Math.max(0.2, top - 2.4);
    foot = Math.max(0.2, Math.min(foot, top - 1.2));
    try { hangCard(m, foot, top); } catch (e) { reportError('landmark rehang ' + m.id, e); }
  }
  if (marks.fitted) marks.fitted.capDeg = +cap.toFixed(2);
  return cap;
}

/** Every live sky dome's gate uniforms, so a re-fit can move the passes in the hills with the places. */
const GATE_UNIFORMS = new Set();

let landmarkDebug = false;
function installLandmarkDebug() {
  if (landmarkDebug) return;
  landmarkDebug = true;
  try {
    Debug.expose('landmarks', () => (CURRENT.landmarks ? CURRENT.landmarks.describe() : []));
    /**
     * Where each place actually LANDS on screen, in pixels, from the camera that drew the last frame — so
     * "is there anything on the skyline?" is a measurement, not an opinion. `crest` is the painted ridge line,
     * `top` the highest painted point: both must sit clear of the treeline for the landmark to read.
     */
    Debug.expose('landmarkScreen', (opts) => {
      const M = CURRENT.landmarks, cam = CURRENT.camera;
      if (!M || !cam) return { ok: false, reason: 'no landmarks or no frame drawn yet' };
      const W = App.width || 1280, H = App.height || 720;
      const v = new THREE.Vector3();
      cam.updateMatrixWorld();
      const inv = new THREE.Matrix4().copy(cam.matrixWorld).invert();
      // THE OCCLUSION TERM. A card that projects onto the frame is not the same thing as a card a child can see:
      // sample a grid inside its own painted rect and fire a ray per sample at the LIVE scene. `hiddenPct` is how
      // much of the place is behind something, `visiblePx` the painted height that really renders.
      const wantRays = !(opts && opts.rays === false) && !!CURRENT.scene;
      const PROF = wantRays ? skylineProfile(occluders(CURRENT.scene), cam.position) : null;
      const GX = (opts && opts.gx) || 16, GY = (opts && opts.gy) || 10;
      // The bottom fifth of every card is ramped away to nothing so it can melt into the haze (buildLandmarks),
      // so the rays stop at the last row that really renders: hiding something that draws no pixels hides nothing.
      const measure = (m, box, paintTopPx, solidFootPx) => {
        if (!PROF) return null;
        const x0 = Math.max(0, box.x0), x1 = Math.min(W, box.x1), y0 = Math.max(0, paintTopPx), y1 = Math.min(H, solidFootPx);
        if (!(x1 > x0 && y1 > y0)) return { samples: 0, hiddenPct: 100, blockers: {} };
        const card = m.mesh.position.distanceTo(cam.position);
        const blockers = {};
        let hit = 0, n = 0;
        const d = new THREE.Vector3();
        for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
          const px = x0 + (i + 0.5) / GX * (x1 - x0), py = y0 + (j + 0.5) / GY * (y1 - y0);
          d.set((px / W) * 2 - 1, 1 - (py / H) * 2, 0.5).unproject(cam).sub(cam.position).normalize();
          n++;
          const az = Math.atan2(d.z, d.x), el = Math.asin(Math.max(-1, Math.min(1, d.y))) * R2D;
          const f = PROF.blocked(az, el, card - 1.5);
          if (f) { hit++; blockers[f.name || '?'] = (blockers[f.name || '?'] || 0) + 1; }
        }
        return { samples: n, hiddenPct: n ? Math.round(hit / n * 1000) / 10 : 100,
          blockers: Object.fromEntries(Object.entries(blockers).sort((a, b) => b[1] - a[1]).slice(0, 3)) };
      };
      return M.list.map((m) => {
        const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
        let front = 0;
        // A PANORAMA is wide enough that one corner can be past the lens while the place itself is in frame, so
        // the box is built from the corners that are really in front and `behind` means the whole card is.
        for (const [sx, sy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, -0.5], [0, 0.5]]) {
          if (v.set(sx * m.size[0], sy * m.size[1], 0).applyMatrix4(m.mesh.matrixWorld).applyMatrix4(inv).z > -0.5) continue;
          front++;
          v.set(sx * m.size[0], sy * m.size[1], 0).applyMatrix4(m.mesh.matrixWorld).project(cam);
          const px = (v.x * 0.5 + 0.5) * W, py = (1 - (v.y * 0.5 + 0.5)) * H;
          box.x0 = Math.min(box.x0, px); box.x1 = Math.max(box.x1, px);
          box.y0 = Math.min(box.y0, py); box.y1 = Math.max(box.y1, py);
        }
        if (!front) return { id: m.id, behind: true, onScreen: false, clipped: false, hiddenPct: 100, visiblePx: 0, visible: false };
        const r = (n) => Math.round(n);
        const crest = m.crest ?? 0.24, hp = box.y1 - box.y0;
        // paintTopPx is the highest PAINTED pixel (a spire, a roof), not the empty top of the card: if it is
        // below 0 the place is clipped by the top of the frame, which is what a child would notice first.
        const paintTop = r(box.y1 - hp * (1 - (m.paintTop ?? 0)));
        const solidFoot = r(box.y0 + hp * 0.80);
        const occ = measure(m, box, paintTop, solidFoot);
        const painted = r(box.y1 - paintTop);
        const onScreen = box.x1 > 0 && box.x0 < W && box.y1 > 0 && box.y0 < H;
        const out = { id: m.id, x: [r(box.x0), r(box.x1)], top: r(box.y0), paintTopPx: paintTop, foot: r(box.y1),
          solidFootPx: solidFoot, crestPx: r(box.y1 - hp * crest), heightPx: r(hp), paintedPx: painted,
          clipped: paintTop < 0, onScreen };
        if (occ) {
          out.hiddenPct = occ.hiddenPct; out.rays = occ.samples; out.blockers = occ.blockers;
          // what a child actually sees: the painted height that is on screen AND not behind anything
          out.visiblePx = onScreen ? Math.round(Math.max(0, Math.min(H, solidFoot) - Math.max(0, paintTop)) * (1 - occ.hiddenPct / 100)) : 0;
          out.visible = out.visiblePx > 22 && occ.hiddenPct < 55;
        }
        return out;
      });
    });
    /** The height of the world on the horizon, bearing by bearing — the wall a painted place has to clear. */
    Debug.expose('skyline', (fromDeg = 0, toDeg = 360, stepDeg = 15) => {
      const cam = CURRENT.camera, scene = CURRENT.scene;
      if (!cam || !scene) return { ok: false, reason: 'no frame drawn yet' };
      const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
      const O = occluders(scene), P = skylineProfile(O, cam.position), rows = [];
      for (let d = fromDeg; d < toDeg; d += stepDeg) {
        const az = d * D2R, who = {};
        rows.push({ bearing: Math.round(d), skylineDeg: +skylineDeg(P, az, who).toFixed(2), by: who.name, at: who.dist });
      }
      return { eye: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1)],
        frameTopDeg: +frameTopDeg(cam).toFixed(2), standing: O.cyl.length, wideMeshes: O.big.map(m => m.name),
        buildMs: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0), rows };
    });
    /**
     * What stands on the horizon, and a switch to take it away for a measurement: __DQ.blockers() lists every
     * mesh that can hide a painted place; __DQ.blockers('forestCards') hides those and re-fits; __DQ.blockers('')
     * puts them all back. It is how "would opening the lane mouths help, and by how much?" gets a number.
     */
    Debug.expose('blockers', (pattern) => {
      const scene = CURRENT.scene;
      if (!scene) return { ok: false, reason: 'no frame drawn yet' };
      const seen = {};
      const re = pattern === undefined ? null : new RegExp(String(pattern) || '(?!)');
      scene.traverse((o) => {
        if ((!o.isMesh && !o.isInstancedMesh) || NOT_A_BLOCKER.test(o.name || '')) return;
        const n = o.name || 'mesh';
        seen[n] = (seen[n] || 0) + (o.isInstancedMesh ? o.count : 1);
        if (re) { if (!('dqWasVisible' in o.userData)) o.userData.dqWasVisible = o.visible; o.visible = re.test(n) ? false : o.userData.dqWasVisible; }
      });
      if (re && CURRENT.landmarks && CURRENT.camera) fitLandmarks(CURRENT.landmarks, scene, CURRENT.camera);
      // the tallest things on the horizon from here, so an unexpected wall can be named and chased down
      let tall = [];
      if (CURRENT.camera) {
        const eye = CURRENT.camera.position;
        tall = occluders(scene).cyl.map((c) => {
          const d = Math.hypot(c.x - eye.x, c.z - eye.z);
          return { name: c.name, deg: +(Math.atan2(c.y1 - eye.y, Math.max(0.5, d - c.r)) * R2D).toFixed(1),
            at: Math.round(d), r: +c.r.toFixed(1), y: [+c.y0.toFixed(1), +c.y1.toFixed(1)] };
        }).filter(c => c.at > 6).sort((a, b) => b.deg - a.deg).slice(0, 8);
      }
      return { hidden: pattern === undefined ? null : String(pattern), meshes: seen, tallest: tall };

    });
    /** What the skyline fit decided (and how long it took). __DQ.landmarkFit({refit: true}) runs it again. */
    Debug.expose('landmarkFit', (o) => {
      const M = CURRENT.landmarks;
      if (!M) return { ok: false, reason: 'no landmarks' };
      if (!o || !o.refit) return M.fitted || { ok: false, reason: 'not fitted yet' };
      if (!CURRENT.scene || !CURRENT.camera) return { ok: false, reason: 'no frame drawn yet' };
      return fitLandmarks(M, CURRENT.scene, CURRENT.camera, o);
    });
    /** Swing the camera round until the named place is in the middle of the frame. */
    Debug.expose('landmarkView', (id) => {
      const L = CURRENT.landmarks && CURRENT.landmarks.get(String(id));
      if (!L) return { ok: false, reason: `unknown landmark "${id}"`, landmarks: CURRENT.landmarks ? CURRENT.landmarks.describe().map(m => m.id) : [] };
      const r = Debug.api && typeof Debug.api.cameraOrbit === 'function' ? Debug.api.cameraOrbit(L.orbit) : null;
      return { ok: true, id: L.id, name: L.name, orbit: L.orbit, camera: r };
    });
  } catch (e) { reportError('landmark debug', e); }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// LOOKING UP — the child's own way to raise the lens (P02 gap #3)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * Everything P02 paints — the cumulus, the sun, the dusk rose, the Milky Way, Highfeather, the four places on the
 * skyline — lives ABOVE the field camera's 26° ground angle, and nothing bound a look axis to it: a child could
 * spin the yaw all the way round and only ever see the ground. This is the missing axis, and it is DQV PS2's:
 *
 *   - the RIGHT STICK's Y axis (Input.look().y) and a keyboard pair (PageUp / PageDown, R / F) tip the lens
 *   - the ground angle travels from the map's own framing (26° in the vale) up to -18° and down to +50°
 *   - it is a SPRING, not a jump, and after ~2.2 s with nothing held it eases back to the framing default the
 *     way DQV does, so a child who let go is never left staring at the sky
 *   - THE BOY STAYS IN FRAME: the look point rises with the lens under a closed loop on the rig's OWN projection
 *     probe (`rig.frame()`), so his feet are held at a measured share of frame height at every angle instead of
 *     sliding off the bottom edge — 79% at rest, 90% at full tilt, and he is never lost
 *   - `Home` snaps back at once; `__DQ.look()` reports the whole thing as numbers and `__DQ.look(v)` drives it
 *
 * It reaches the camera only through P09's published interface (`rig.tune`) from the field's own per-tick hook
 * (`Field.on('update')`), and while the look is at rest it does not touch the rig at all.
 */
const LOOK = {
  PITCH_UP: -16, PITCH_DOWN: 50,       // the ground angle at full up / full down (range -18..+50 with the spring's overshoot)
  RATE: 1.15,                          // stick units per second: about 0.9 s from rest to full tilt
  SPRING: 8,                           // how fast the shown angle chases the asked-for one
  RETURN_AFTER: 2.2, RETURN_RATE: 2.6, // DQV eases the framing back after a couple of idle seconds
  FEET_UP: 90, FEET_DOWN: 62,          // where his feet sit in the frame at full up / full down (% of frame height)
  FOV_UP: 5,                           // the lens opens a little as it tips up, so more sky lands in the frame
  v: 0, vT: 0, idle: 99, hold: false, src: 'none',
  base: null, lookUp: 0, feet: 79, ticks: 0, driving: false, on: true,
  keys: new Set(), listening: false, adapter: null, installed: false,
};
const LOOK_UP_KEYS = ['PageUp', 'KeyR'];
const LOOK_DOWN_KEYS = ['PageDown', 'KeyF'];
const LOOK_HOME_KEYS = ['Home'];

function lookTyping(t) {
  return !!t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || ''));
}

function listenForLook() {
  if (LOOK.listening || typeof window === 'undefined') return;
  LOOK.listening = true;
  const all = [...LOOK_UP_KEYS, ...LOOK_DOWN_KEYS, ...LOOK_HOME_KEYS];
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || lookTyping(e.target) || !all.includes(e.code)) return;
    e.preventDefault();
    if (LOOK_HOME_KEYS.includes(e.code)) { LOOK.vT = 0; LOOK.hold = false; LOOK.idle = 99; LOOK.keys.clear(); return; }
    LOOK.keys.add(e.code);
  }, { passive: false });
  window.addEventListener('keyup', (e) => { LOOK.keys.delete(e.code); }, { passive: true });
  window.addEventListener('blur', () => LOOK.keys.clear());
}

/** The look axis a child is asking for this tick: -1 (down at the ground) .. +1 (up at the sky). */
function lookDemand() {
  let v = 0, src = 'none';
  try {
    const l = Input.look();
    if (l && Math.abs(l.y) > 0.06) { v = Math.max(-1, Math.min(1, l.y)); src = 'stick'; }
  } catch (_) { /* input not initialised (a demo page) */ }
  let k = 0;
  for (const c of LOOK.keys) { if (LOOK_UP_KEYS.includes(c)) k += 1; else if (LOOK_DOWN_KEYS.includes(c)) k -= 1; }
  if (k) { v = Math.max(-1, Math.min(1, v + k)); src = src === 'stick' ? 'stick+keys' : 'keys'; }
  return { v, src };
}

/**
 * One tick of the look axis. `dt` is simulated seconds. Returns the state (also what __DQ.look() reports).
 * The adapter is how this reaches a camera: {rig(), base(rig), apply(rig, o), frame(rig)}.
 */
export function lookTick(dt = 1 / 60, { active = true } = {}) {
  const A = LOOK.adapter;
  if (!A) return lookState();
  let rig = null;
  try { rig = A.rig(); } catch (_) { rig = null; }
  if (!rig) { LOOK.v = LOOK.vT = 0; LOOK.driving = false; LOOK.base = null; return lookState(); }
  const step = Math.max(0, Math.min(0.1, dt || 1 / 60));
  const d = active && LOOK.on ? lookDemand() : { v: 0, src: 'none' };
  LOOK.src = d.src;
  if (Math.abs(d.v) > 0.02) {
    LOOK.vT = Math.max(-1, Math.min(1, LOOK.vT + d.v * LOOK.RATE * step));
    LOOK.idle = 0;
  } else {
    LOOK.idle += step;
    // DQV hands the framing back after a beat, unless a critic or a script is holding the angle on purpose
    if (!LOOK.hold && LOOK.idle > LOOK.RETURN_AFTER) {
      LOOK.vT += (0 - LOOK.vT) * (1 - Math.exp(-step * LOOK.RETURN_RATE));
      if (Math.abs(LOOK.vT) < 0.004) LOOK.vT = 0;
    }
  }
  LOOK.v += (LOOK.vT - LOOK.v) * (1 - Math.exp(-step * LOOK.SPRING));
  if (Math.abs(LOOK.v) < 0.004 && LOOK.vT === 0) LOOK.v = 0;

  // the framing default this map composed for itself (P09 solves it; we only ever offset it)
  let base = null;
  try { base = A.base(rig); } catch (_) { base = null; }
  if (base) LOOK.base = base;
  base = LOOK.base;
  if (!base) return lookState();

  if (LOOK.v === 0) {
    // at rest the look axis does not touch the camera at all: P09's rig is left exactly as it composed itself
    if (LOOK.driving) { try { A.apply(rig, { pitch: base.pitch, lookUp: base.lookUp, fov: base.fov }); } catch (e) { reportError('look release', e); } }
    LOOK.driving = false; LOOK.lookUp = base.lookUp; LOOK.feet = base.feet; LOOK.ticks = 0;
    return lookState();
  }

  const up = Math.max(0, LOOK.v), down = Math.max(0, -LOOK.v);
  const pitch = base.pitch + (LOOK.PITCH_UP - base.pitch) * up + (LOOK.PITCH_DOWN - base.pitch) * down;
  const fov = base.fov + LOOK.FOV_UP * up;
  // where his feet should sit in the frame at this angle — the guarantee that a raised lens never loses the boy
  const wantFeet = base.feet + (LOOK.FEET_UP - base.feet) * up + (LOOK.FEET_DOWN - base.feet) * down;
  if (!LOOK.driving) { LOOK.lookUp = base.lookUp; LOOK.driving = true; LOOK.ticks = 0; }
  // seed the look point from the tilt (so the first frame is already close), then close the loop on the real
  // projection: raising the look point slides him DOWN the frame, so this is a simple monotone controller
  if (LOOK.ticks === 0) LOOK.lookUp = base.lookUp + up * 2.2 - down * 0.5;
  let feet = wantFeet;
  try {
    const f = A.frame(rig);
    if (f && Number.isFinite(f.feetPct)) {
      feet = f.feetPct;
      const err = wantFeet - f.feetPct;
      LOOK.lookUp = Math.max(-1.5, Math.min(16, LOOK.lookUp + Math.max(-0.35, Math.min(0.35, err * 0.055))));
    }
  } catch (_) { /* the probe is optional */ }
  LOOK.feet = feet;
  LOOK.ticks++;
  try { A.apply(rig, { pitch, lookUp: LOOK.lookUp, fov }); } catch (e) { reportError('look apply', e); }
  return lookState();
}

function lookState() {
  const b = LOOK.base;
  return {
    on: LOOK.on, axis: +LOOK.v.toFixed(3), axisTarget: +LOOK.vT.toFixed(3), source: LOOK.src,
    keys: [...LOOK.keys], holding: LOOK.hold, driving: LOOK.driving, idleSec: +LOOK.idle.toFixed(2),
    pitch: b ? +(b.pitch + (LOOK.PITCH_UP - b.pitch) * Math.max(0, LOOK.v) + (LOOK.PITCH_DOWN - b.pitch) * Math.max(0, -LOOK.v)).toFixed(2) : null,
    basePitch: b ? +b.pitch.toFixed(2) : null, lookUp: +LOOK.lookUp.toFixed(3), feetPct: +LOOK.feet.toFixed(2),
    range: [LOOK.PITCH_UP, LOOK.PITCH_DOWN], bind: { up: LOOK_UP_KEYS, down: LOOK_DOWN_KEYS, home: LOOK_HOME_KEYS, pad: 'right stick Y' },
  };
}

/** Give the look axis a camera to drive. adapter = {rig(), base(rig), apply(rig, o), frame(rig)}. */
export function attachLook(adapter) {
  LOOK.adapter = adapter || null;
  listenForLook();
  installLookDebug();
  return lookState();
}

let lookDebug = false;
function installLookDebug() {
  if (lookDebug) return;
  lookDebug = true;
  try {
    /**
     * __DQ.look()            what the look axis is doing, as numbers
     * __DQ.look(v)           hold the look stick at v (-1 down .. +1 up); it stops easing back while held
     * __DQ.look(0)           let go — the framing eases back to the map's own composition
     * __DQ.look({v, hold})   the same, explicitly; {home: true} snaps straight back
     */
    Debug.expose('look', (o) => {
      if (o === undefined) return lookState();
      const arg = (typeof o === 'object' && o) ? o : { v: +o };
      if (arg.on !== undefined) LOOK.on = !!arg.on;
      if (arg.home) { LOOK.vT = 0; LOOK.v = 0; LOOK.hold = false; LOOK.idle = 99; LOOK.keys.clear(); return lookState(); }
      if (Number.isFinite(+arg.v)) {
        LOOK.vT = Math.max(-1, Math.min(1, +arg.v));
        LOOK.hold = arg.hold === undefined ? LOOK.vT !== 0 : !!arg.hold;
        LOOK.idle = 0;
        if (arg.snap) LOOK.v = LOOK.vT;
      }
      return lookState();
    });
    Debug.provide('look', lookState);
  } catch (e) { reportError('look debug', e); }
}

/**
 * Wire the look axis to the real game's field camera. Called once by buildSky, so every outdoor map that raises
 * a sky can be looked up into. It reaches src/world/field.js lazily (an import at module scope would be a cycle)
 * and drives the rig from the field's own per-tick hook, after P09's own update, through rig.tune().
 */
function installLook() {
  if (LOOK.installed || typeof window === 'undefined') return;
  LOOK.installed = true;
  import('../world/field.js').then(({ Field }) => {
    attachLook({
      rig: () => { const w = Field.world(); return w ? w.cameraRig : null; },
      base: (rig) => {
        const p = rig && rig.c && rig.c.pose;
        if (!p) return null;
        return { pitch: p.pitch, lookUp: p.lookUp, fov: p.fov, feet: (p.measured && p.measured.feet) || 79 };
      },
      apply: (rig, o) => rig.tune(o),
      frame: (rig) => (typeof rig.frame === 'function' ? rig.frame() : null),
    });
    Field.on('update', (dt, info) => { lookTick(dt, { active: !info || info.top !== false }); });
  }).catch((e) => { reportError('look install', e); });
}

/** 0..1 — how much a hill ring should sag at this bearing, so a lane can run out through a pass. */
function gateAt(a, strength = 1) {
  const M = CURRENT.landmarks;
  if (!M || !M.list.length) return 0;
  let k = 0;
  for (const L of M.list) {
    const d = angDiff(a, L.az);
    k = Math.max(k, (L.gate ?? 0.6) * strength * Math.exp(-(d * d) / (0.26 * 0.26)));
  }
  return Math.min(0.95, k);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// hill rings (ART-DIRECTION §11 ringHill): haze applied AFTER lighting toward the hour's haze colour
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function ringT(a, seed) { const c = Math.cos(a), si = Math.sin(a); return 0.5 * vnoise(c * 2.5 + 9, si * 2.5 + 9, seed) + 0.32 * vnoise(c * 6 + 3, si * 6 + 3, seed + 1) + 0.18 * vnoise(c * 15, si * 15, seed + 2); }

function hillPatch({ haze, top, patches }) {
  const fn = (sh) => {
    const E = ENV.u;
    Object.assign(sh.uniforms, { uHillHaze: { value: haze }, uHillTop: { value: top }, uHillPatches: { value: patches },
      uEnvHaze: E.uEnvHaze, uEnvOvercast: E.uEnvOvercast, uEnvPrecip: E.uEnvPrecip, uEnvSnow: E.uEnvSnow, uEnvNight: E.uEnvNight,
      tHillNoise: { value: Tex.noise() }, uHillForest: { value: C3(PAL.foliage.dark) }, uHillField: { value: C3(PAL.grass.sun) }, uHillSnow: { value: C3(PAL.snow.mid) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHillW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHillW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHillW; uniform float uHillHaze, uHillTop, uHillPatches, uEnvOvercast, uEnvPrecip, uEnvSnow, uEnvNight; uniform vec3 uEnvHaze, uHillForest, uHillField, uHillSnow; uniform sampler2D tHillNoise;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    // painterly patches: dark copses and sunny pasture on the rolling rings; snow settles on the tops first
    vec3 hn = texture2D( tHillNoise, vHillW.xz * 0.0045 ).rgb;
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb * 0.82, uHillForest, 0.45 ), smoothstep( 0.56, 0.7, hn.g ) * uHillPatches );
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, uHillField, 0.45 ), smoothstep( 0.6, 0.78, hn.b ) * uHillPatches );
    float hs = uEnvSnow * smoothstep( 0.25, 0.75, hn.r * 0.6 + smoothstep( 0.0, uHillTop, vHillW.y ) * 0.6 );
    diffuseColor.rgb = mix( diffuseColor.rgb, uHillSnow, hs * 0.85 );
  }`)
      .replace('#include <opaque_fragment>', `
  {
    float hk = uHillHaze * ( 1.0 + 0.55 * ( 1.0 - smoothstep( -2.0, uHillTop, vHillW.y ) ) );
    hk = clamp( hk + uEnvOvercast * 0.22 + uEnvPrecip * 0.18 + uEnvNight * 0.12, 0.0, 0.92 );
    outgoingLight = mix( outgoingLight, uEnvHaze, hk );
  }
  #include <opaque_fragment>`);
  };
  fn.key = 'envhill';
  return fn;
}

export function ringHill(scene, id, r0, r1, r2, baseH, amp, seed, low, high, haze,
  { fogged = true, peaky = 1, patches = null, gates = null, capDeg = null, eyeY = 3.2 } = {}) {
  const SEG = 180, rp = r2 - (r2 - r1) * 0.35, RR = 7;
  // A CEILING ON THE SKYLINE. A ring whose peaks stand higher than the top of the frame is not a distant hill,
  // it is a wall: on the approved opening frame the whole sky band is 7.5 degrees and the mountains crest at 5.2,
  // leaving blue and cloud above them. So every ring is soft-kneed down to a target elevation seen from the vale
  // (the far ring a little higher than the mid one, so the layers still stack). Pass capDeg:false to opt out.
  const CAP = capDeg === false ? null : ((capDeg ?? (peaky > 1.2 ? 5.3 : 3.6)) * Math.PI / 180);
  const ceil = (y, r) => {
    if (CAP == null) return y;
    const top = eyeY + r * Math.tan(CAP), knee = eyeY + (top - eyeY) * 0.55;
    return y <= knee ? y : knee + (top - knee) * (1 - Math.exp(-(y - knee) / Math.max(0.5, top - knee)));
  };
  // a pass in the hills on every landmark's bearing: the ring sags so the lane runs out of the vale and the
  // place it is signposted to is visible over the gap (the far ranges only sag a little, so they stay a wall)
  const gateK = gates === false ? 0 : (gates ?? (peaky > 1.2 ? 0.45 : 1));
  const prof = (r, t) => {
    if (r <= r0) return -2;
    if (r < r1) return lerp(-2, baseH + amp * t * 0.5, smooth(r0, r1, r));
    if (r < rp) return lerp(baseH + amp * t * 0.5, baseH + amp * t, smooth(r1, rp, r));
    return lerp(baseH + amp * t, baseH * 0.4 + amp * t * 0.3 - 6, smooth(rp, r2, r));
  };
  const pos = [], col = [], idx = [], cl = C3(low), chh = C3(high), tmp = new THREE.Color();
  for (let i = 0; i <= SEG; i++) {
    const a = i / SEG * 6.283, t = Math.pow(ringT(a, seed), peaky);
    const sag = gateK > 0 ? gateAt(a, gateK) : 0;
    for (let k = 0; k < RR; k++) {
      const r = k === RR - 1 ? r2 : lerp(r0, rp, k / (RR - 2));
      let y = prof(r, t);
      if (k > 0 && k < RR - 1) y += (vnoise(a * 14 + k * 3.1, k * 1.7, seed + 5) - 0.5) * amp * 0.12;
      y = ceil(y, r);
      if (sag > 0) y -= (y + 2) * sag * 0.82;                 // the inner lip (-2) stays put; the crest comes down
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      tmp.copy(cl).lerp(chh, smooth(-1, baseH + amp * 0.9, y));
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < SEG; i++) for (let k = 0; k < RR - 1; k++) { const a = i * RR + k, b = (i + 1) * RR + k; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // the proto baked `haze` into the albedo (so the shade side darkened the haze too); here it is laid over the lit colour,
  // slightly less of it, so the rings read as farther away and follow dusk, night and rain
  const P = patches ?? (peaky > 1.2 ? 0 : 0.2);
  const mesh = new THREE.Mesh(g, makeToon({ vertexColors: true, fog: fogged, side: THREE.DoubleSide }, 'hill', [hillPatch({ haze: haze * 0.7, top: baseH + amp, patches: P })], 'dqhill'));
  mesh.name = 'hill-' + id; scene.add(mesh);
  return mesh;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// kit recipes (installed by src/world/scenery.js createKit)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function skyRecipes(kit) {
  const { scene, animators } = kit;

  /** Small birds gliding in lazy loops high over the map, wings beating now and then. They go home at night and in rain. */
  kit.birds = (n = 4, { centre = [0, 0], height = 16, radius = 22, seed = 77 } = {}) => {
    const r = mulberry(seed);
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.05, 0.34, 0.02, -0.08, 0, 0, -0.12], 3));
    wing.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: C3(PAL.outline.prop), side: THREE.DoubleSide, fog: true });
    const flock = [];
    const group = new THREE.Group(); group.name = 'birds'; scene.add(group);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Group(), L = new THREE.Mesh(wing, mat), R = new THREE.Mesh(wing, mat);
      // named, because an unnamed mesh gliding at 16 m reads to the skyline profile as a 36-degree wall
      b.name = 'bird'; L.name = R.name = 'bird-wing';
      R.scale.x = -1; b.add(L, R); b.scale.setScalar(2.3); group.add(b);
      flock.push({ b, L, R, ph: r() * 6.283, sp: 0.09 + r() * 0.05, rad: radius * (0.6 + r() * 0.5), h: height + r() * 6, cx: centre[0] + (r() - 0.5) * 12, cz: centre[1] + (r() - 0.5) * 12, flapPh: r() * 6.283 });
    }
    let away = 0;
    animators.push((t, dt) => {
      const W = ENV.weather, wantAway = ENV.weights.night > 0.55 || W.precip > 0.3 ? 1 : 0;
      away += (wantAway - away) * Math.min(1, (dt || 0.016) * 0.8);
      group.visible = away < 0.98;
      for (const f of flock) {
        const a = t * f.sp + f.ph, x = f.cx + Math.cos(a) * f.rad, z = f.cz + Math.sin(a) * f.rad * 0.7;
        f.b.position.set(x, f.h + Math.sin(a * 3) * 0.8 + away * 40, z);
        f.b.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a) * 0.7) + Math.PI, Math.sin(a) * 0.25);
        const beat = away > 0.02 ? Math.sin(t * 18 + f.flapPh) * 0.8 : Math.max(0, Math.sin(t * 0.8 + f.flapPh)) > 0.6 ? Math.sin(t * 16 + f.flapPh) * 0.7 : 0.12;
        f.L.rotation.z = beat; f.R.rotation.z = -beat;
      }
    });
    return group;
  };

  /**
   * Highfeather: a castle on its own cloud, far off in the sky (WORLD-BIBLE: visible from the first minute).
   * Painted like the cloud cards — sunlit puffs with a lavender base — and a castle in pre-hazed sky colours with
   * lit and shaded faces, violet roofs and gold spire tips, so it reads as somewhere real and very far away (a place
   * you will go), never as a see-through rendering ghost. It takes the hour's light, its windows glow after dusk, and
   * it hides in the overcast.
   */
  kit.skyCastle = ({ azimuth = -1.05, elevation = 0.36, distance = 700, size = 150, opacity = 0.94, tintFrom = null } = {}) => {
    void tintFrom;
    const W = 512, H = 384, c = mkCanvas(W, H), g = ctx2(c), rnd = mulberry(15015);
    const wc = mkCanvas(W, H), wg = ctx2(wc);                                  // the window-glow mask, same shapes
    wg.fillStyle = PAL.mask.off; wg.fillRect(0, 0, W, H); wg.fillStyle = PAL.mask.on;
    const hz = (hex, k) => mixHex(hex, PAL.sky.horizon, k);                 // aerial perspective, baked in
    const wallLit = hz(PAL.plaster.light, 0.45), wallShade = hz(PAL.hill.farLow, 0.4), roofLit = hz(PAL.cloth.purple, 0.58), roofShade = hz(PAL.cloth.purpleDark, 0.55);
    const ink = hz(PAL.cloth.purpleDark, 0.35), gold = mixHex(PAL.flower.yellow, PAL.cloud.lit, 0.25), win = hz(PAL.paint.glass, 0.45);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const puff = (x, y, r, lit = 1) => {
      const gr = g.createRadialGradient(x + r * 0.25, y - r * 0.4, r * 0.1, x, y, r * 1.02);
      gr.addColorStop(0, PAL.cloud.lit); gr.addColorStop(0.5, mixHex(PAL.cloud.warm, PAL.cloud.mid, 1 - lit)); gr.addColorStop(1, mixHex(PAL.cloud.mid, PAL.cloud.shade, 0.5));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      wg.fillStyle = PAL.mask.off; wg.beginPath(); wg.arc(x, y, r, 0, Math.PI * 2); wg.fill(); wg.fillStyle = PAL.mask.on;
    };
    for (const [x, y, r] of [[118, 292, 52], [196, 272, 66], [300, 268, 70], [388, 286, 56], [452, 300, 38], [66, 306, 34]]) puff(x, y, r, 0.8);
    const windowAt = (x, y, w, h, rr) => { g.fillStyle = win; g.beginPath(); g.roundRect(x, y, w, h, rr); g.fill(); wg.beginPath(); wg.roundRect(x, y, w, h, rr); wg.fill(); };
    const tower = (x, w, h, roofH, lit) => {
      const y0 = 268, yt = y0 - h;
      g.fillStyle = lit ? wallLit : wallShade; g.fillRect(x - w / 2, yt, w, h);
      g.fillStyle = wallShade; g.globalAlpha = 0.55; g.fillRect(x + w * 0.12, yt, w * 0.38, h); g.globalAlpha = 1;
      g.strokeStyle = ink; g.lineWidth = 2.2; g.strokeRect(x - w / 2, yt, w, h);
      wg.fillStyle = PAL.mask.off; wg.fillRect(x - w / 2 - 6, yt - roofH - 6, w + 12, h + roofH + 6); wg.fillStyle = PAL.mask.on;
      g.beginPath(); g.moveTo(x - w / 2 - 5, yt); g.lineTo(x, yt - roofH); g.lineTo(x + w / 2 + 5, yt); g.closePath();
      g.fillStyle = roofLit; g.fill();
      g.beginPath(); g.moveTo(x, yt - roofH); g.lineTo(x + w / 2 + 5, yt); g.lineTo(x + w * 0.1, yt); g.closePath(); g.fillStyle = roofShade; g.fill();
      g.beginPath(); g.moveTo(x - w / 2 - 5, yt); g.lineTo(x, yt - roofH); g.lineTo(x + w / 2 + 5, yt); g.closePath(); g.stroke();
      g.fillStyle = gold; g.beginPath(); g.arc(x, yt - roofH - 3, 3.2, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < Math.floor(h / 42); k++) windowAt(x - 3.5, yt + 18 + k * 40, 7, 13, 3.5);
    };
    g.fillStyle = wallLit; g.fillRect(168, 170, 196, 98); g.fillStyle = wallShade; g.globalAlpha = 0.5; g.fillRect(270, 170, 94, 98); g.globalAlpha = 1;
    g.strokeStyle = ink; g.lineWidth = 2.2; g.strokeRect(168, 170, 196, 98);
    for (let x = 172; x < 360; x += 16) { g.fillStyle = wallLit; g.fillRect(x, 162, 9, 9); g.strokeRect(x, 162, 9, 9); }
    g.fillStyle = win; g.beginPath(); g.moveTo(250, 268); g.lineTo(250, 236); g.arc(266, 236, 16, Math.PI, 0); g.lineTo(282, 268); g.closePath(); g.fill();
    tower(186, 40, 150, 50, true); tower(346, 40, 140, 48, false); tower(226, 28, 118, 36, true); tower(306, 28, 116, 36, false); tower(266, 58, 172, 62, true);
    for (const [x, y] of [[200, 190], [232, 212], [300, 190], [332, 212]]) windowAt(x, y, 8, 12, 4);
    g.strokeStyle = ink; g.lineWidth = 2; g.beginPath(); g.moveTo(266, 32); g.lineTo(266, 8); g.stroke();
    g.fillStyle = hz(PAL.flower.red, 0.3); g.beginPath(); g.moveTo(266, 8); g.quadraticCurveTo(284, 12, 300, 8); g.quadraticCurveTo(284, 20, 266, 23); g.closePath(); g.fill();
    for (const [x, y, r] of [[96, 312, 40], [160, 300, 50], [236, 298, 56], [322, 300, 54], [404, 310, 44], [466, 318, 30], [44, 322, 26]]) puff(x + (rnd() - 0.5) * 6, y, r, 1);
    g.globalCompositeOperation = 'destination-out'; g.fillRect(0, 334, W, H - 334); g.globalCompositeOperation = 'source-atop';
    const base = g.createLinearGradient(0, 300, 0, 334); base.addColorStop(0, css(PAL.cloud.core, 0)); base.addColorStop(1, css(PAL.cloud.core, 0.5));
    g.fillStyle = base; g.fillRect(0, 300, W, 34); g.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const wtex = new THREE.CanvasTexture(wc); wtex.colorSpace = THREE.NoColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, fog: false });
    const E = ENV.u;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tWin: { value: wtex }, uWinCol: { value: C3(PAL.interior.lamp) }, uEnvLight: E.uEnvLight, uEnvHorizon: E.uEnvHorizon,
        uEnvNight: E.uEnvNight, uEnvDusk: E.uEnvDusk, uEnvOvercast: E.uEnvOvercast, uEnvCloudLit: E.uEnvCloudLit });
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tWin; uniform vec3 uWinCol, uEnvLight, uEnvHorizon, uEnvCloudLit; uniform float uEnvNight, uEnvDusk, uEnvOvercast;')
        .replace('#include <map_fragment>', `#include <map_fragment>
  {
    diffuseColor.rgb = mix( diffuseColor.rgb * uEnvLight, uEnvHorizon, 0.18 * uEnvNight + 0.12 * uEnvDusk );
    float dqWin = texture2D( tWin, vMapUv ).r;
    diffuseColor.rgb = mix( diffuseColor.rgb, uWinCol, dqWin * clamp( uEnvNight * 0.95 + uEnvDusk * 0.45, 0.0, 1.0 ) );
    diffuseColor.a *= 1.0 - 0.8 * uEnvOvercast;
  }`);
    };
    mat.customProgramCacheKey = () => 'skycastle|env';
    const card = new THREE.Mesh(new THREE.PlaneGeometry(size, size * H / W), mat);
    const y = Math.sin(elevation) * distance, h = Math.cos(elevation) * distance;
    card.position.set(Math.cos(azimuth) * h, y, Math.sin(azimuth) * h);
    card.lookAt(0, y * 0.6, 0);
    card.renderOrder = -9.5; card.frustumCulled = false; card.name = 'highfeather';
    scene.add(card);
    animators.push((t, dt, cam) => {
      if (cam) card.position.set(cam.position.x + Math.cos(azimuth) * h, cam.position.y * 0.2 + y + Math.sin(t * 0.05) * 3, cam.position.z + Math.sin(azimuth) * h);
    });
    return card;
  };

  return kit;
}
