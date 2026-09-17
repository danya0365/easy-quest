/**
 * scenery.js — the scenery kit hand-authored maps build with, until P02 sky / P03 terrain / P04 props /
 * P05 buildings land. Every recipe here is docs/ART-DIRECTION.md §10-14 (as ported in demos/F3.html) expressed
 * ONLY through F3's foundation: colours from PAL, surfaces from Tex, materials from makeToon / Toon.surface,
 * outlines from the Toon hull helpers, contact shadows painted into a makeAOMask. No hex lives in this file.
 *                                                                                           (integrator-owned)
 *
 *   import { createKit } from '../scenery.js';
 *   const kit = createKit({ scene, heightAt, ao });      // ao = makeAOMask({...}) painted as things are placed
 *   kit.cottage({...}); kit.rock(x, z, s); kit.fence(pts); kit.forest('oak', OAK, list, {...});
 *   kit.flush();                                         // merge every bucket into one mesh per material
 *   kit.update(t, dt)                                    // animated bits (smoke, butterflies, water, clouds)
 *
 * Standalone: buildSky(scene, rig) · ringHill(scene, ...) · canopyGeometry(...) · paintMasks(...) · buildGround(...)
 * Geometry helpers: boxUV scaleUV wrapUV M4 prep curvePoints
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, css, lerp, smooth, clamp01 } from '../art/palette.js';
import { Tex, mulberry, vnoise, mkCanvas, ctx2 } from '../art/tex.js';
import { Toon, makeToon, outlineMaterial, hullGeometry, spherizeNormals, normalsUp, worldPlanar, aoPatch, OUTLINE, TOON_PRESETS } from '../art/toon.js';
import { Font } from '../ui/font.js';
import { reportError } from '../engine/debug.js';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// geometry helpers
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const M4 = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s));

/** Box whose UVs are in world units / s on every face (so textures keep their scale). */
export function boxUV(w, h, d, s = 1, segs = [1, 1, 1]) {
  const g = new THREE.BoxGeometry(w, h, d, ...segs), uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [U, V] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, uv.getX(i) * U / s, uv.getY(i) * V / s);
  }
  return g;
}
export function scaleUV(g, s) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / s, uv.getY(i) / s); return g; }
/** Lathe/cylinder: an INTEGER number of repeats around (no seam) and V = height / worldSize. */
export function wrapUV(g, uRepeats, vScale) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(uRepeats)), uv.getY(i) * vScale); return g; }

/** Non-indexed copy with only position/normal/uv plus a flat vertex colour — mergeable into a bucket. */
export function prep(geo, color = PAL.mask.on) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = C3(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Dense points along a Catmull-Rom through [[x, z], ...], spaced about `step` world units apart. */
export function curvePoints(pts, step = 0.4) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(8, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map(p => [p.x, p.z]);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// masks: exact distance fields painted into float grids (path / water), sampled by the CPU and the ground shader
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * strokes: [{pts: dense [[x,z]], w: width, falloff?, channel: 0|1}]   discs: [{x, z, r, falloff?, channel}]
 * value = clamp01(0.5 + (halfWidth - distance) / (2 * falloff)) -> exactly 0.5 on the edge, max over strokes.
 * Returns {N, span, center, ch: [Float32Array, Float32Array], sample(ch, x, z), texture()}
 */
export function paintMasks({ N = 1024, span = 96, center = [0, 0], strokes = [], discs = [] } = {}) {
  const pxu = N / span, ox = center[0] - span / 2, oz = center[1] - span / 2;
  const ch = [new Float32Array(N * N), new Float32Array(N * N)];
  const put = (c, k, v) => { if (v > ch[c][k]) ch[c][k] = v; };
  for (const s of strokes) {
    const hw = s.w / 2, fo = s.falloff ?? 1.2, reach = hw + fo, c = s.channel | 0, P = s.pts;
    const widthAt = typeof s.widthAt === 'function' ? s.widthAt : null;
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az] = P[k], [bx, bz] = P[k + 1];
      const hwk = widthAt ? widthAt(k / (P.length - 1)) / 2 : hw, rk = hwk + fo;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - rk - ox) * pxu)), i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + rk - ox) * pxu));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - rk - oz) * pxu)), j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + rk - oz) * pxu));
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1e-9;
      for (let j = j0; j <= j1; j++) {
        const z = oz + (j + 0.5) / pxu;
        for (let i = i0; i <= i1; i++) {
          const x = ox + (i + 0.5) / pxu;
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
          const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
          if (d >= rk) continue;
          put(c, j * N + i, clamp01(0.5 + (hwk - d) / (2 * fo)));
        }
      }
      void reach;
    }
  }
  for (const s of discs) {
    const fo = s.falloff ?? 1.2, rk = s.r + fo, c = s.channel | 0;
    const i0 = Math.max(0, Math.floor((s.x - rk - ox) * pxu)), i1 = Math.min(N - 1, Math.ceil((s.x + rk - ox) * pxu));
    const j0 = Math.max(0, Math.floor((s.z - rk - oz) * pxu)), j1 = Math.min(N - 1, Math.ceil((s.z + rk - oz) * pxu));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = ox + (i + 0.5) / pxu, z = oz + (j + 0.5) / pxu, d = Math.hypot((x - s.x) / (s.sx ?? 1), (z - s.z) / (s.sz ?? 1));
      if (d >= rk) continue;
      put(c, j * N + i, clamp01(0.5 + (s.r - d) / (2 * fo)));
    }
  }
  let tex = null;
  const M = {
    N, span, center, ch, rect: [ox, oz, span, span],
    sample(c, x, z) {
      const fx = (x - ox) * pxu - 0.5, fz = (z - oz) * pxu - 0.5, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = (ii, jj) => (ii < 0 || jj < 0 || ii >= N || jj >= N) ? 0 : ch[c][jj * N + ii];
      return (a(i, j) * (1 - u) + a(i + 1, j) * u) * (1 - v) + (a(i, j + 1) * (1 - u) + a(i + 1, j + 1) * u) * v;
    },
    texture() {
      if (tex) return tex;
      const data = new Uint8Array(N * N * 4);
      for (let k = 0; k < N * N; k++) { data[k * 4] = ch[0][k] * 255; data[k * 4 + 1] = ch[1][k] * 255; data[k * 4 + 3] = 255; }
      tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      tex.colorSpace = THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true; tex.name = 'groundMask';
      return tex;
    },
  };
  return M;
}

/**
 * Coarse exact distance field to polylines / discs (for terrain shaping: valleys, pads). Cells beyond maxR = maxR.
 *   lines: [dense [[x,z]...]]   discs: [{x, z, r, sx?, sz?}]   -> {sample(x, z) -> distance}
 */
export function distanceGrid({ N = 320, span = 96, center = [0, 0], lines = [], discs = [], maxR = 14 } = {}) {
  const pxu = N / span, ox = center[0] - span / 2, oz = center[1] - span / 2, D = new Float32Array(N * N).fill(maxR);
  for (const P of lines) {
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az] = P[k], [bx, bz] = P[k + 1];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - maxR - ox) * pxu)), i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + maxR - ox) * pxu));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - maxR - oz) * pxu)), j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + maxR - oz) * pxu));
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1e-9;
      for (let j = j0; j <= j1; j++) {
        const z = oz + (j + 0.5) / pxu;
        for (let i = i0; i <= i1; i++) {
          const x = ox + (i + 0.5) / pxu, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
          const d = Math.hypot(x - ax - vx * t, z - az - vz * t), q = j * N + i;
          if (d < D[q]) D[q] = d;
        }
      }
    }
  }
  for (const s of discs) {
    const rk = s.r * Math.max(s.sx ?? 1, s.sz ?? 1) + maxR;
    const i0 = Math.max(0, Math.floor((s.x - rk - ox) * pxu)), i1 = Math.min(N - 1, Math.ceil((s.x + rk - ox) * pxu));
    const j0 = Math.max(0, Math.floor((s.z - rk - oz) * pxu)), j1 = Math.min(N - 1, Math.ceil((s.z + rk - oz) * pxu));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = ox + (i + 0.5) / pxu, z = oz + (j + 0.5) / pxu;
      const d = Math.max(0, Math.hypot((x - s.x) / (s.sx ?? 1), (z - s.z) / (s.sz ?? 1)) - s.r), q = j * N + i;
      if (d < D[q]) D[q] = d;
    }
  }
  return {
    D, N, span,
    sample(x, z) {
      const fx = (x - ox) * pxu - 0.5, fz = (z - oz) * pxu - 0.5, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = (ii, jj) => (ii < 0 || jj < 0 || ii >= N || jj >= N) ? maxR : D[jj * N + ii];
      return (a(i, j) * (1 - u) + a(i + 1, j) * u) * (1 - v) + (a(i, j + 1) * (1 - u) + a(i + 1, j + 1) * u) * v;
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ground: fine grid over the playable square + a square-to-round annulus out to the hills, one draw call.
// Grass = Tex.grass world-planar; path + stream banks from the mask (R path, G water); contact AO from the AO mask.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function buildGround(scene, { heightAt, masks, ao, inner = 40, step = 0.8, outer = 128, rings = 16 } = {}) {
  const n = Math.round((inner * 2) / step);
  const pos = [], idx = [];
  const vtx = (x, z) => { pos.push(x, heightAt(x, z), z); return pos.length / 3 - 1; };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) vtx(-inner + i * step, -inner + j * step);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + (n + 1), d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // perimeter of the inner grid, counter-clockwise from the top-left (x -> +, z = -inner first)
  const perim = [];
  for (let i = 0; i < n; i++) perim.push([i, 0]);
  for (let j = 0; j < n; j++) perim.push([n, j]);
  for (let i = n; i > 0; i--) perim.push([i, n]);
  for (let j = n; j > 0; j--) perim.push([0, j]);
  let prevRing = perim.map(([i, j]) => j * (n + 1) + i);
  const P = perim.length;
  for (let k = 1; k <= rings; k++) {
    const t = k / rings, r = lerp(inner, outer, Math.pow(t, 1.6)), round = smooth(0, 0.7, t);
    const ring = [];
    for (let q = 0; q < P; q++) {
      const [i, j] = perim[q], sx = -inner + i * step, sz = -inner + j * step;
      const sq = Math.max(Math.abs(sx), Math.abs(sz)) || 1, ang = Math.atan2(sz, sx);
      const bx = sx / sq * r, bz = sz / sq * r, cx = Math.cos(ang) * r * 1.08, cz = Math.sin(ang) * r * 1.08;
      ring.push(vtx(lerp(bx, cx, round), lerp(bz, cz, round)));
    }
    for (let q = 0; q < P; q++) {
      const a = prevRing[q], b = prevRing[(q + 1) % P], c = ring[q], d = ring[(q + 1) % P];
      idx.push(a, b, c, b, d, c);
    }
    prevRing = ring;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();

  const maskTex = masks.texture();
  const groundPatch = (sh) => {
    sh.uniforms.tGMask = { value: maskTex };
    sh.uniforms.tDirtMap = { value: Tex.dirt() };
    sh.uniforms.uGMaskRect = { value: new THREE.Vector4(...masks.rect) };
    sh.uniforms.uDry = { value: C3(PAL.grass.dry) }; sh.uniforms.uLip = { value: C3(PAL.dirt.dark) };
    sh.uniforms.uCrown = { value: C3(PAL.dirt.light) }; sh.uniforms.uBank = { value: C3(PAL.dirt.bank) };
    sh.uniforms.uLush = { value: C3(PAL.grass.deep) }; sh.uniforms.uClump = { value: C3(PAL.grass.clump) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGMask, tDirtMap; uniform vec4 uGMaskRect; uniform vec3 uDry, uLip, uCrown, uBank, uLush, uClump;')
      .replace('#include <color_fragment>', /* glsl */`
  {
    vec2 mUv = ( vDqWorld.xz - uGMaskRect.xy ) / uGMaskRect.zw;
    float mIn = step( 0.0, mUv.x ) * step( mUv.x, 1.0 ) * step( 0.0, mUv.y ) * step( mUv.y, 1.0 );
    vec4 mk = texture2D( tGMask, mUv ) * mIn;
    float edgeN = ( texture2D( tDqNoise, vDqWorld.xz * 0.21 + vec2( 0.13, 0.41 ) ).r - 0.5 ) * 0.16 + ( texture2D( tDqNoise, vDqWorld.xz * 0.85 ).g - 0.5 ) * 0.10;
    // stream banks: lush darker grass, then a bank of wet earth
    float wet = mk.g + edgeN * 0.35;
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, uLush * 0.9, 0.5 ), smoothstep( 0.12, 0.34, wet ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, uBank, smoothstep( 0.44, 0.5, wet ) );
    // worn path
    float pd = mk.r + edgeN;
    float aa = fwidth( pd ) * 0.8 + 0.003;
    float isPath = smoothstep( 0.5 - aa, 0.5 + aa, pd );
    float rim = smoothstep( 0.24, 0.5, pd ) * ( 1.0 - isPath );
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, uDry, 0.65 ), rim * 0.85 );
    vec3 dirt = texture2D( tDirtMap, vDqWorld.xz / 3.3 ).rgb;
    dirt = mix( dirt, mix( dirt, uCrown, 0.45 ), smoothstep( 0.74, 0.98, mk.r ) * ( 0.4 + 0.6 * texture2D( tDqNoise, vDqWorld.xz * 0.061 ).r ) );
    dirt = mix( dirt, uLip * 0.92, ( 1.0 - smoothstep( 0.5, 0.58, pd ) ) * 0.45 );
    diffuseColor.rgb = mix( diffuseColor.rgb, dirt, isPath );
  }
  #include <color_fragment>`);
  };
  groundPatch.key = 'kitground';
  const mat = makeToon({ map: Tex.grass() }, 'ground',
    [worldPlanar({ scale: 1 / Tex.worldSize('grass'), breakup: 1, macro: 0.1, tint: PAL.grass.sun, tintAmount: 0.42 }), groundPatch, aoPatch(ao)], 'dqground');
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'ground'; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// sky dome + drifting cloud cards + layered hill rings (ART-DIRECTION §11; P02 owns the real sky later)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function buildSky(scene, rig) {
  const U = { uZenith: { value: C3(PAL.sky.zenith) }, uUpper: { value: C3(PAL.sky.upper) }, uHorizon: { value: C3(PAL.sky.horizon) },
    uHaze: { value: C3(PAL.sky.haze) }, uSunGlow: { value: C3(PAL.sky.sunGlow) }, uSunDir: { value: rig.dir } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uUpper, uHorizon, uHaze, uSunGlow, uSunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = mix(uHorizon, uUpper, smoothstep(0.0, 0.28, h));
        c = mix(c, uZenith, smoothstep(0.22, 0.9, h));
        c = mix(c, uHaze, smoothstep(0.02, -0.06, h));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        c += uSunGlow * (pow(s, 6.0) * 0.18 + pow(s, 60.0) * 0.45);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  sky.renderOrder = -10; sky.frustumCulled = false; sky.name = 'sky';
  scene.add(sky);
  const rnd = mulberry(1301), geos = [];
  for (let i = 0; i < 22; i++) {
    const c = { az: i / 22 * 6.283 + (rnd() - 0.5) * 0.25, el: 0.07 + Math.pow(rnd(), 1.5) * 0.3, w: 260 + rnd() * 260, v: rnd() * 4 | 0 };
    const g = new THREE.PlaneGeometry(c.w, c.w * 0.5), uv = g.attributes.uv, cx = (c.v % 2) * 0.5, cy = (c.v >> 1) * 0.5;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, cx + uv.getX(k) * 0.5, 1 - (cy + (1 - uv.getY(k)) * 0.5));
    const R = 760, y = Math.sin(c.el) * R + c.w * 0.18, p = new THREE.Vector3(Math.cos(c.az) * R, y, Math.sin(c.az) * R);
    const m = new THREE.Matrix4().lookAt(p, new THREE.Vector3(0, y, 0), new THREE.Vector3(0, 1, 0));
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI)); g.applyMatrix4(m); g.translate(p.x, p.y, p.z);
    geos.push(g);
  }
  const clouds = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ map: Tex.clouds(), transparent: true, depthWrite: false, fog: false }));
  clouds.renderOrder = -9; clouds.frustumCulled = false; clouds.name = 'clouds';
  scene.add(clouds);
  return { sky, clouds, uniforms: U };
}

function ringT(a, seed) { const c = Math.cos(a), si = Math.sin(a); return 0.5 * vnoise(c * 2.5 + 9, si * 2.5 + 9, seed) + 0.32 * vnoise(c * 6 + 3, si * 6 + 3, seed + 1) + 0.18 * vnoise(c * 15, si * 15, seed + 2); }
export function ringHill(scene, id, r0, r1, r2, baseH, amp, seed, low, high, haze, { fogged = true, peaky = 1 } = {}) {
  const SEG = 180, rp = r2 - (r2 - r1) * 0.35, RR = 7;
  const prof = (r, t) => {
    if (r <= r0) return -2;
    if (r < r1) return lerp(-2, baseH + amp * t * 0.5, smooth(r0, r1, r));
    if (r < rp) return lerp(baseH + amp * t * 0.5, baseH + amp * t, smooth(r1, rp, r));
    return lerp(baseH + amp * t, baseH * 0.4 + amp * t * 0.3 - 6, smooth(rp, r2, r));
  };
  const pos = [], col = [], idx = [], cl = C3(low), chh = C3(high), hz = C3(PAL.sky.haze), tmp = new THREE.Color();
  for (let i = 0; i <= SEG; i++) {
    const a = i / SEG * 6.283, t = Math.pow(ringT(a, seed), peaky);
    for (let k = 0; k < RR; k++) {
      const r = k === RR - 1 ? r2 : lerp(r0, rp, k / (RR - 2));
      let y = prof(r, t);
      if (k > 0 && k < RR - 1) y += (vnoise(a * 14 + k * 3.1, k * 1.7, seed + 5) - 0.5) * amp * 0.12;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      tmp.copy(cl).lerp(chh, smooth(-1, baseH + amp * 0.9, y)).lerp(hz, haze);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < SEG; i++) for (let k = 0; k < RR - 1; k++) { const a = i * RR + k, b = (i + 1) * RR + k; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, makeToon({ vertexColors: true, fog: fogged, side: THREE.DoubleSide }, 'hill'));
  mesh.name = 'hill-' + id; scene.add(mesh);
  return mesh;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// foliage (ART-DIRECTION §12): merged icosphere blobs, spherized normals, vertex gradient, hull, proxy shadow
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const OAK = [[0, 2.75, 0, 1.3], [1.0, 2.35, 0.3, 0.88], [-0.9, 2.4, 0.45, 0.88], [0.1, 2.3, -1.0, 0.9], [0.45, 2.2, 0.95, 0.8], [0.35, 3.6, 0.2, 0.85], [-0.5, 3.35, -0.3, 0.78]];
export const POPLAR = [[0, 2.0, 0, 0.85], [0.1, 2.9, 0.05, 0.8], [-0.05, 3.7, 0, 0.66], [0, 4.35, 0.05, 0.46], [0.45, 2.4, 0.3, 0.55], [-0.45, 2.6, -0.25, 0.55]];
export const BUSH = [[0, 0.5, 0, 0.66], [0.62, 0.36, 0.15, 0.48], [-0.58, 0.38, 0.1, 0.5], [0.05, 0.4, 0.58, 0.45]];
export const CHESTNUT = [[0, 3.3, 0, 1.55], [1.3, 2.8, 0.35, 1.05], [-1.2, 2.9, 0.5, 1.05], [0.15, 2.7, -1.25, 1.08], [0.55, 2.6, 1.2, 0.95], [0.45, 4.35, 0.25, 1.0], [-0.65, 4.0, -0.4, 0.95], [-1.35, 3.6, -0.6, 0.7], [1.4, 3.8, -0.5, 0.72]];

export function canopyGeometry(blobs, dark, light, detail = 1, spherize = 0.6) {
  let cx = 0, cy = 0, cz = 0, ws = 0; for (const b of blobs) { cx += b[0] * b[3]; cy += b[1] * b[3]; cz += b[2] * b[3]; ws += b[3]; } cx /= ws; cy /= ws; cz /= ws;
  let R = 0; for (const b of blobs) R = Math.max(R, Math.hypot(b[0] - cx, b[1] - cy, b[2] - cz) + b[3]);
  const cd = C3(dark), cl = C3(light), tmp = new THREE.Color(), v = new THREE.Vector3();
  const parts = blobs.map(([x, y, z, r, d]) => {
    const g = new THREE.IcosahedronGeometry(r, d ?? detail); g.translate(x, y, z);
    const p = g.attributes.position, cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const t = smooth(-0.85, 0.9, (v.y - cy) / R), dd = Math.hypot(v.x - cx, v.y - cy, v.z - cz) / R;
      tmp.copy(cd).lerp(cl, t).multiplyScalar(lerp(0.6, 1.0, smooth(0.3, 0.92, dd)));
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.deleteAttribute('uv');
    return g;
  });
  return spherizeNormals(mergeGeometries(parts), new THREE.Vector3(cx, cy, cz), spherize);
}
function trunkGeometry(h = 1.6, flare = 1) {
  const pts = [[0.36 * flare, 0], [0.24 * flare, 0.2], [0.18, 0.6], [0.16, h * 0.8], [0.12, h]].map(([r, y]) => new THREE.Vector2(r, y));
  return wrapUV(new THREE.LatheGeometry(pts, 10), 1, h / Tex.worldSize('bark'));
}
const SHADOW_PROXY_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const hashJ = (i, s) => { let h = Math.imul(i + 1, 374761393) ^ Math.imul(s, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/**
 * The walkable frame of an arched footbridge: pure maths, no meshes (collision needs it before any art exists).
 * Centre (cx, cz), yaw `dir` (atan2(dx, dz) convention), length L, width W, arch height, end height y0.
 */
export function bridgeFrame({ cx, cz, dir, L = 6.4, W = 2.4, arch = 0.55, y0 = 0 }) {
  const ax = Math.sin(dir), az = Math.cos(dir), sx = az, sz = -ax;
  const archY = (u) => y0 + arch * (1 - Math.pow(2 * u / L, 2));
  const local = (x, z) => { const dx = x - cx, dz = z - cz; return { u: dx * ax + dz * az, v: dx * sx + dz * sz }; };
  const posts = [-L / 2 + 0.25, -L / 6, L / 6, L / 2 - 0.25];
  const world = (u, v) => [cx + ax * u + sx * v, cz + az * u + sz * v];
  const rails = [-1, 1].map(side => [world(posts[0], side * (W / 2 - 0.08)), world(posts[posts.length - 1], side * (W / 2 - 0.08))]);
  return {
    cx, cz, dir, L, W, arch, y0, ax, az, sx, sz, archY, local, posts, rails,
    ends: [world(-L / 2, 0), world(L / 2, 0)],
    deckY(x, z) { const { u, v } = local(x, z); if (Math.abs(u) > L / 2 || Math.abs(v) > W / 2) return null; return archY(u); },
    corridor(x, z, pad = 0.2) { const { u, v } = local(x, z); return Math.abs(u) <= L / 2 + pad && Math.abs(v) <= W / 2; },
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the kit
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function createKit({ scene, heightAt, ao }) {
  const buckets = new Map();
  const animators = [];
  const counts = {};
  const FOOT = [];                                            // footprints: tufts and flowers stay out
  const kit = { scene, heightAt, ao, buckets, animators, counts, FOOT };

  const addTo = kit.addTo = (bucket, geo, matrix, color) => {
    const g = prep(geo, color); if (matrix) g.applyMatrix4(matrix);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(g);
    return g;
  };
  kit.footBox = (x, z, w, d, rot, pad = 0.15) => FOOT.push({ x, z, w: w / 2 + pad, d: d / 2 + pad, c: Math.cos(rot), s: Math.sin(rot) });
  kit.footDisc = (x, z, r) => FOOT.push({ x, z, r });
  kit.blocked = (x, z) => FOOT.some(f => {
    const dx = x - f.x, dz = z - f.z;
    if (f.r) return dx * dx + dz * dz < f.r * f.r;
    const lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c;
    return Math.abs(lx) < f.w && Math.abs(lz) < f.d;
  });

  // ── roofs and cottages (ART-DIRECTION §13) ──
  kit.gableRoof = (base, W, D, H0, pitch, ovx, ovz, t, kind, gable = 'plaster', gableColor) => {
    const run = D / 2 + ovz, L = run / Math.cos(pitch), ridgeY = H0 + (D / 2) * Math.tan(pitch);
    const texS = Tex.worldSize(kind);
    for (const side of [0, 1]) {
      const slab = boxUV(W + 2 * ovx, t, L, texS);
      const cy = ridgeY - (L / 2) * Math.sin(pitch) + (t / 2) * Math.cos(pitch), cz = (L / 2) * Math.cos(pitch) + (t / 2) * Math.sin(pitch);
      const m = new THREE.Matrix4().makeRotationX(pitch).setPosition(0, cy, cz);
      if (side) m.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
      addTo(kind, slab, base.clone().multiply(m));
      if (kind === 'thatch') {
        const roll = new THREE.CylinderGeometry(t * 0.62, t * 0.62, W + 2 * ovx + 0.1, 10); scaleUV(roll, 0.35);
        const ey = ridgeY - L * Math.sin(pitch) + (t * 0.45) * Math.cos(pitch), ez = L * Math.cos(pitch) + (t * 0.45) * Math.sin(pitch);
        const rm = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, ey, ez);
        if (side) rm.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
        addTo('thatch', roll, base.clone().multiply(rm));
      }
    }
    const shape = new THREE.Shape(); shape.moveTo(-D / 2, 0); shape.lineTo(D / 2, 0); shape.lineTo(0, ridgeY - H0); shape.closePath();
    for (const sx of [-1, 1]) {
      const gab = scaleUV(new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false }), Tex.worldSize(gable));
      addTo(gable, gab, base.clone().multiply(M4(sx * (W / 2) + (sx < 0 ? 0 : -0.14), H0, 0, Math.PI / 2)), gableColor);
    }
    if (kind === 'thatch') {
      const ridge = new THREE.CylinderGeometry(t * 0.95, t * 0.95, W + 2 * ovx + 0.2, 12); scaleUV(ridge, 0.4);
      addTo('thatch', ridge, base.clone().multiply(M4(0, ridgeY + t * 0.55, 0, 0, 0, Math.PI / 2)));
    } else {
      const ridge = new THREE.CylinderGeometry(0.17, 0.17, W + 2 * ovx + 0.1, 10); scaleUV(ridge, 0.5);
      addTo('tile', ridge, base.clone().multiply(M4(0, ridgeY + t * 0.75, 0, 0, 0, Math.PI / 2)), PAL.tile.ridge);
    }
    return ridgeY;
  };

  /**
   * A half-timbered cottage. o: {x, z, rot, W, D, H, roof:'tile'|'thatch', pitch, doorX, doorColor, frontWindows:[],
   * sideWindows:[], backWindow, shutter, chimney:'brick'|'stone'|null, chimneyX, braces}
   * Returns {chimneyTop: Vector3 | null, door: {x, z}, y}
   */
  kit.cottage = (o) => {
    const y = Math.min(heightAt(o.x - o.W / 2, o.z), heightAt(o.x + o.W / 2, o.z), heightAt(o.x, o.z - o.D / 2), heightAt(o.x, o.z + o.D / 2), heightAt(o.x, o.z)) - 0.05;
    const base = M4(o.x, y, o.z, o.rot);
    const { W, D, H } = o, P = 0.5, beam = PAL.wood.beam;
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('stone', boxUV(W + 0.2, P + 0.1, D + 0.2, Tex.worldSize('stone')), M4(0, (P + 0.1) / 2 - 0.05, 0));
    const wg = addTo('plaster', boxUV(W, H, D, Tex.worldSize('plaster'), [2, 4, 2]), base.clone().multiply(M4(0, P + H / 2, 0)));
    { const p = wg.attributes.position, c = wg.attributes.color, gr = C3(PAL.plaster.grime), wh = C3(PAL.mask.on), t = new THREE.Color();
      for (let i = 0; i < p.count; i++) { t.copy(gr).lerp(wh, smooth(0, 1.0, p.getY(i) - y - P)); c.setXYZ(i, t.r, t.g, t.b); } }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood', boxUV(0.22, H, 0.22, 1.2), M4(sx * W / 2, P + H / 2, sz * D / 2), beam);
    for (const sz of [-1, 1]) add('wood', boxUV(W + 0.14, 0.22, 0.24, 1.2), M4(0, P + H - 0.05, sz * D / 2), beam);
    for (const sx of [-1, 1]) add('wood', boxUV(0.24, 0.22, D + 0.14, 1.2), M4(sx * W / 2, P + H - 0.05, 0), beam);
    for (const sz of [-1, 1]) add('wood', boxUV(W + 0.1, 0.16, 0.22, 1.2), M4(0, P + 0.08, sz * D / 2), beam);
    const dx = o.doorX || 0;
    if (o.braces !== false) for (const s of [-1, 1]) {
      const bx = dx + s * 1.3;
      if (Math.abs(bx) < W / 2 - 0.3 && !(o.frontWindows || []).some(wx => Math.abs(wx - bx) < 0.9)) add('wood', boxUV(0.16, 1.6, 0.14, 1.2), M4(bx, P + H * 0.5, D / 2 + 0.02, 0, 0, s * 0.62), beam);
    }
    add('wood', boxUV(1.14, 1.9, 0.16, 1.2), M4(dx, P + 0.95, D / 2 + 0.02), beam);
    add('wood', boxUV(0.88, 1.74, 0.12, 1.0), M4(dx, P + 0.87, D / 2 + 0.07), o.doorColor || PAL.paint.doorRed);
    add('paint', new THREE.SphereGeometry(0.06, 8, 6), M4(dx + 0.3, P + 0.9, D / 2 + 0.15), PAL.paint.iron);
    add('stone', boxUV(1.4, 0.2, 0.7, 1.2), M4(dx, 0.1, D / 2 + 0.45));
    const win = (lx, ly, face) => {
      const fm = face === 'front' ? M4(lx, ly, D / 2) : face === 'back' ? M4(lx, ly, -D / 2, Math.PI) : face === 'left' ? M4(-W / 2, ly, lx, -Math.PI / 2) : M4(W / 2, ly, lx, Math.PI / 2);
      const a = (b, g, m, c) => add(b, g, fm.clone().multiply(m), c);
      a('wood', boxUV(0.96, 0.9, 0.14, 1.2), M4(0, 0, 0.04), beam);
      a('paint', new THREE.BoxGeometry(0.72, 0.66, 0.1), M4(0, 0, 0.08), PAL.paint.glass);
      a('wood', boxUV(0.07, 0.66, 0.08, 1), M4(0, 0, 0.14), beam); a('wood', boxUV(0.72, 0.07, 0.08, 1), M4(0, 0, 0.14), beam);
      for (const s of [-1, 1]) a('paint', new THREE.BoxGeometry(0.4, 0.8, 0.06), M4(s * 0.7, 0, 0.1, s * 0.25), o.shutter || PAL.paint.shutterGreen);
      a('wood', boxUV(1.0, 0.2, 0.3, 0.8), M4(0, -0.55, 0.16), PAL.wood.light);
      const r = mulberry(Math.abs(lx * 100 + ly * 7 + o.x * 13 + o.z * 3) | 0);
      for (let k = 0; k < 5; k++) a('paint', new THREE.IcosahedronGeometry(0.095, 0), M4(-0.36 + k * 0.18, -0.4 + r() * 0.05, 0.16 + (r() - 0.5) * 0.12), [PAL.flower.pink, PAL.flower.yellow, PAL.flower.white, PAL.flower.red][r() * 4 | 0]);
      for (let k = 0; k < 3; k++) a('paint', new THREE.IcosahedronGeometry(0.12, 0), M4(-0.3 + k * 0.3, -0.46, 0.2), PAL.foliage.mid);
    };
    for (const wx of (o.frontWindows || [])) win(wx, P + 1.25, 'front');
    for (const wx of (o.sideWindows || [])) { win(wx, P + 1.25, 'left'); win(wx, P + 1.25, 'right'); }
    if (o.backWindow !== false) win(0, P + 1.25, 'back');
    const roof = o.roof || 'tile';
    const ridgeY = kit.gableRoof(base, W, D, P + H, o.pitch ?? 0.62, 0.45, 0.6, roof === 'thatch' ? 0.34 : 0.16, roof);
    let chimneyTop = null;
    if (o.chimney) {
      const kind = o.chimney === 'stone' ? 'stone' : 'brick', cxl = o.chimneyX ?? W * 0.3, czl = -D * 0.2;
      add(kind, boxUV(0.8, 2.3, 0.8, Tex.worldSize(kind)), M4(cxl, ridgeY - 0.45, czl));
      add(kind, boxUV(0.96, 0.18, 0.96, Tex.worldSize(kind)), M4(cxl, ridgeY + 0.74, czl));
      chimneyTop = new THREE.Vector3(cxl, ridgeY + 0.85, czl).applyMatrix4(base);
    }
    ao.box(o.x, o.z, W + 0.2, D + 0.2, o.rot, 1.3, 0.75);
    kit.footBox(o.x, o.z, W + 0.5, D + 0.5, o.rot);
    const door = new THREE.Vector3(dx, 0, D / 2 + 0.9).applyMatrix4(base);
    kit.footBox(door.x, door.z, 1.2, 1.2, o.rot, 0);
    return { y, chimneyTop, door: { x: door.x, z: door.z }, ridgeY: y + ridgeY };
  };

  // ── small props ──
  kit.rock = (x, z, s = 1, seed = 1, { moss = true, sink = 0.28 } = {}) => {
    const r = mulberry(seed * 7919 + 13), g = new THREE.IcosahedronGeometry(0.55, 1), p = g.attributes.position;
    const sx = 1 + r() * 0.5, sy = 0.55 + r() * 0.3, sz = 0.8 + r() * 0.4;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), k = 0.86 + 0.28 * vnoise(vx * 2.3 + seed, vz * 2.3 + vy, seed + 3);
      p.setXYZ(i, vx * sx * k, Math.max(vy, -0.2) * sy * k, vz * sz * k);
    }
    g.computeVertexNormals(); spherizeNormals(g, new THREE.Vector3(0, 0, 0), 0.45);
    const geo = prep(g, PAL.mask.on);
    const col = geo.attributes.color, pos = geo.attributes.position, nrm = geo.attributes.normal, tmp = new THREE.Color();
    const base = C3(PAL.stone.mid), light = C3(PAL.stone.light), mossC = C3(PAL.stone.moss);
    for (let i = 0; i < pos.count; i++) {
      tmp.copy(base).lerp(light, smooth(-0.1, 0.4, pos.getY(i)));
      if (moss) tmp.lerp(mossC, smooth(0.55, 0.9, nrm.getY(i)) * smooth(0.35, 0.65, vnoise(pos.getX(i) * 3 + seed, pos.getZ(i) * 3, 5)) * 0.85);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    const uv = geo.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i) * 0.7) / 1.6, pos.getY(i) / 1.6);
    geo.applyMatrix4(M4(x, heightAt(x, z) - sink * s, z, r() * 6.283, 0, 0, s));
    if (!buckets.has('stone')) buckets.set('stone', []);
    buckets.get('stone').push(geo);
    ao.disc(x, z, 1.0 * s * sx, 0.6);
    kit.footDisc(x, z, 0.55 * s * sx);
    return { x, z, r: 0.5 * s * Math.max(sx, sz) };
  };

  /** Post-and-rail fence along a polyline. Returns the capsule collider points. */
  kit.fence = (pts, { color = PAL.wood.weathered, height = 1.05, spacing = 1.8, rails = [0.35, 0.75], seed = 3 } = {}) => {
    const r = mulberry(seed);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / spacing)), ang = Math.atan2(x1 - x0, z1 - z0);
      for (let k = 0; k <= n; k++) {
        if (k === n && i < pts.length - 2) continue;
        const x = lerp(x0, x1, k / n), z = lerp(z0, z1, k / n), y = heightAt(x, z);
        addTo('wood', boxUV(0.15, height, 0.15, 0.8), M4(x, y + height / 2 - 0.08, z, ang + (r() - 0.5) * 0.2, (r() - 0.5) * 0.06), color);
        ao.disc(x, z, 0.45, 0.5); kit.footDisc(x, z, 0.3);
      }
      for (const ry of rails) {
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, y = (heightAt(x0, z0) + heightAt(x1, z1)) / 2, dy = heightAt(x1, z1) - heightAt(x0, z0);
        addTo('wood', boxUV(0.08, 0.12, L + 0.1, 0.8), M4(mx, y + ry, mz, ang, -Math.atan2(dy, L)), color);
      }
    }
    return pts;
  };

  /** A little white-ish picket fence (garden edge). */
  kit.picket = (pts, { color = PAL.plaster.light, height = 0.75 } = {}) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / 0.32)), ang = Math.atan2(x1 - x0, z1 - z0);
      for (let k = 0; k <= n; k++) {
        const x = lerp(x0, x1, k / n), z = lerp(z0, z1, k / n), y = heightAt(x, z), h = height * (k % 2 ? 0.92 : 1);
        addTo('wood', boxUV(0.1, h, 0.05, 0.8), M4(x, y + h / 2 - 0.06, z, ang + Math.PI / 2), color);
        addTo('wood', new THREE.ConeGeometry(0.07, 0.12, 4), M4(x, y + h - 0.02, z, ang + Math.PI / 4), color);
      }
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, y = (heightAt(x0, z0) + heightAt(x1, z1)) / 2;
      for (const ry of [0.22, 0.52]) addTo('wood', boxUV(0.05, 0.08, L, 0.8), M4(mx, y + ry, mz, ang), PAL.wood.weathered);
      ao.disc(mx, mz, L * 0.5, 0.3);
    }
  };

  kit.barrel = (x, z, s = 1, rot = 0) => {
    const y = heightAt(x, z), base = M4(x, y, z, rot, 0, 0, s);
    const prof = []; for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(0.36 + Math.sin(t * Math.PI) * 0.07, t * 0.95)); }
    addTo('wood', wrapUV(new THREE.LatheGeometry(prof, 14), 2, 0.9), base, PAL.wood.light);
    addTo('wood', new THREE.CircleGeometry(0.36, 14), base.clone().multiply(M4(0, 0.95, 0, 0, -Math.PI / 2)), PAL.wood.mid);
    for (const by of [0.18, 0.77]) addTo('paint', new THREE.TorusGeometry(0.415, 0.03, 5, 18), base.clone().multiply(M4(0, by, 0, 0, Math.PI / 2)), PAL.paint.iron);
    ao.disc(x, z, 0.8 * s, 0.6); kit.footDisc(x, z, 0.5 * s);
  };

  kit.crate = (x, z, rot = 0, s = 1) => {
    const y = heightAt(x, z);
    addTo('wood', boxUV(0.8 * s, 0.8 * s, 0.8 * s, 0.8), M4(x, y + 0.38 * s, z, rot), PAL.wood.light);
    for (const e of [-1, 1]) addTo('wood', boxUV(0.84 * s, 0.1 * s, 0.84 * s, 1), M4(x, y + (0.38 + e * 0.35) * s, z, rot), PAL.wood.beam);
    ao.disc(x, z, 0.85 * s, 0.6); kit.footDisc(x, z, 0.55 * s);
  };

  kit.bench = (x, z, rot = 0) => {
    const y = heightAt(x, z), base = M4(x, y, z, rot), add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(1.7, 0.1, 0.45, 1), M4(0, 0.48, 0), PAL.wood.light);
    add('wood', boxUV(1.7, 0.36, 0.08, 1), M4(0, 0.78, -0.22, 0, -0.12), PAL.wood.light);
    for (const s of [-1, 1]) { add('wood', boxUV(0.12, 0.48, 0.4, 1), M4(s * 0.7, 0.24, 0), PAL.wood.beam); add('wood', boxUV(0.1, 0.5, 0.08, 1), M4(s * 0.7, 0.72, -0.22), PAL.wood.beam); }
    ao.box(x, z, 1.7, 0.5, rot, 0.6, 0.55); kit.footBox(x, z, 1.8, 0.6, rot);
  };

  kit.woodpile = (x, z, rot = 0) => {
    const y = heightAt(x, z), base = M4(x, y, z, rot), r = mulberry(Math.round(x * 31 + z * 17));
    const rows = [[5, 0.18], [4, 0.5], [3, 0.82], [2, 1.12]];
    for (const [n, ly] of rows) for (let i = 0; i < n; i++) {
      const lr = 0.16 + r() * 0.03, lx = (i - (n - 1) / 2) * 0.35 + (r() - 0.5) * 0.04, len = 1.1;
      addTo('bark', wrapUV(new THREE.CylinderGeometry(lr, lr, len, 10, 1, true), 1, len / Tex.worldSize('bark')), base.clone().multiply(M4(lx, ly, 0, 0, Math.PI / 2)));
      for (const e of [1, -1]) {
        addTo('paint', new THREE.CircleGeometry(lr, 10), base.clone().multiply(M4(lx, ly, e * len / 2, e > 0 ? 0 : Math.PI)), PAL.wood.light);
        addTo('paint', new THREE.RingGeometry(lr * 0.35, lr * 0.47, 10), base.clone().multiply(M4(lx, ly, e * (len / 2 + 0.01), e > 0 ? 0 : Math.PI)), PAL.wood.mid);
      }
    }
    ao.box(x, z, 1.9, 1.2, rot, 0.7, 0.6); kit.footBox(x, z, 2.0, 1.3, rot);
  };

  /** Flower bed: an earth patch heaped with round flower heads and leaves. */
  kit.flowerBed = (x, z, w, d, rot = 0, seed = 5) => {
    const y = heightAt(x, z), base = M4(x, y, z, rot), r = mulberry(seed);
    addTo('dirtbed', new THREE.PlaneGeometry(w, d, 1, 1).rotateX(-Math.PI / 2), base.clone().multiply(M4(0, 0.06, 0)), PAL.dirt.dark);
    const hues = [PAL.flower.pink, PAL.flower.yellow, PAL.flower.white, PAL.flower.red, PAL.flower.blue];
    const n = Math.round(w * d * 9);
    for (let i = 0; i < n; i++) addTo('paint', new THREE.IcosahedronGeometry(0.12 + r() * 0.05, 0), base.clone().multiply(M4((r() - 0.5) * w * 0.9, 0.18 + r() * 0.12, (r() - 0.5) * d * 0.9)), PAL.foliage.mid);
    for (let i = 0; i < n * 0.8; i++) addTo('paint', new THREE.IcosahedronGeometry(0.075 + r() * 0.03, 0), base.clone().multiply(M4((r() - 0.5) * w * 0.9, 0.3 + r() * 0.12, (r() - 0.5) * d * 0.9)), hues[(r() * hues.length) | 0]);
    ao.box(x, z, w, d, rot, 0.4, 0.35); kit.footBox(x, z, w, d, rot);
  };

  // ── foliage ──
  /**
   * Instanced trees. Instances are split into spatial chunks (`chunk` world units) so whole groves off-screen are
   * frustum-culled — an InstancedMesh is only culled when ALL of its instances are out of view.
   */
  kit.forest = (name, blobs, list, { detail = 1, spherize = 0.72, trunkH = 1.7, dark = PAL.foliage.dark, light = PAL.foliage.sun, wind = 0.016, windBase = 1.6, outline = true, shadows = true, aoR = 1.9, aoS = 0.65, chunk = 18, lodDist = 30 } = {}) => {
    if (!list.length) return null;
    const cg = canopyGeometry(blobs, dark, light, detail, spherize);
    // far LOD: one icosphere level down, same silhouette; swapped per chunk by camera distance (with hysteresis)
    const lodGeo = detail > 0 && lodDist > 0 ? canopyGeometry(blobs, dark, light, detail - 1, spherize) : null;
    const lodHull = lodGeo && outline ? hullGeometry(lodGeo, OUTLINE.canopy) : null;
    const leafMat = makeToon({ vertexColors: true }, Object.assign({}, TOON_PRESETS.canopy, { wind, windBase }));
    const hullGeo = outline ? hullGeometry(cg, OUTLINE.canopy) : null, hullMat = outline ? outlineMaterial(PAL.outline.leaf, { wind, windBase }) : null;
    const big = [...blobs].sort((a, b) => b[3] - a[3]).slice(0, 3).map(b => [b[0], b[1], b[2], b[3] * 0.78, 1]);
    const proxyGeo = shadows ? canopyGeometry(big, dark, light, 0, 0) : null;
    const trunkGeo = trunkH ? trunkGeometry(trunkH + 0.4) : null, trunkMat = trunkH ? Toon.surface('bark') : null;
    const groups = new Map();
    for (const t of list) { const key = `${Math.floor(t.x / chunk)},${Math.floor(t.z / chunk)}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const made = [];
    let gi = 0;
    for (const items of groups.values()) {
      const n = items.length, tag = `${name}#${gi++}`;
      const canopy = new THREE.InstancedMesh(cg, leafMat, n); canopy.name = tag + '-canopy'; canopy.receiveShadow = true;
      const hull = hullGeo ? new THREE.InstancedMesh(hullGeo, hullMat, n) : null;
      if (hull) { hull.instanceMatrix = canopy.instanceMatrix; hull.name = tag + '-hull'; hull.userData.isOutline = true; }
      const proxy = proxyGeo ? new THREE.InstancedMesh(proxyGeo, SHADOW_PROXY_MAT, n) : null;
      if (proxy) { proxy.castShadow = true; proxy.instanceMatrix = canopy.instanceMatrix; proxy.name = tag + '-shadowProxy'; }
      const trunk = trunkGeo ? new THREE.InstancedMesh(trunkGeo, trunkMat, n) : null;
      if (trunk) { trunk.castShadow = true; trunk.receiveShadow = true; trunk.instanceMatrix = canopy.instanceMatrix; trunk.name = tag + '-trunk'; }
      items.forEach((t, i) => {
        q.setFromAxisAngle(up, t.r ?? 0);
        m4.compose(new THREE.Vector3(t.x, heightAt(t.x, t.z) - 0.1, t.z), q, new THREE.Vector3(t.s, t.s * (0.95 + ((t.c ?? 1) - 0.9)), t.s));
        canopy.setMatrixAt(i, m4); col.setRGB(t.c ?? 1, t.c ?? 1, (t.c ?? 1) * 0.95); canopy.setColorAt(i, col);
        if (aoR > 0) ao.disc(t.x, t.z, aoR * t.s, aoS);
        kit.footDisc(t.x, t.z, (trunkH ? 0.55 : 1.0) * t.s);
      });
      for (const m of [canopy, hull, proxy, trunk]) if (m) { m.computeBoundingSphere(); scene.add(m); }
      let cx = 0, cz = 0; for (const t of items) { cx += t.x; cz += t.z; } cx /= n; cz /= n;
      let rad = 0; for (const t of items) rad = Math.max(rad, Math.hypot(t.x - cx, t.z - cz) + 2.5 * t.s);
      made.push({ canopy, hull, proxy, trunk, cx, cz, rad, far: false });
    }
    if (lodGeo) {
      animators.push((t, dt, cam) => {
        if (!cam) return;
        for (const c of made) {
          const d = Math.hypot(cam.position.x - c.cx, cam.position.z - c.cz) - c.rad;
          const far = c.far ? d > lodDist - 3 : d > lodDist + 3;
          if (far === c.far) continue;
          c.far = far;
          c.canopy.geometry = far ? lodGeo : cg;
          if (c.hull) c.hull.geometry = far ? lodHull : hullGeo;
        }
      });
    }
    counts[name] = list.length;
    counts[name + 'Chunks'] = made.length;
    kit.lodChunks = (kit.lodChunks || []).concat(made);
    return made;
  };

  /** Dark clusters in belts along a rim: no outline, no shadow. */
  kit.forestBelt = ({ radius = 60, rows = 3, rowGap = 7, seed = 777, threshold = 0.42, step = 0.06, skip = null, yAt = heightAt } = {}) => {
    const fr = mulberry(seed), belt = [];
    for (let a = 0; a < Math.PI * 2; a += step) {
      const f = vnoise(Math.cos(a) * 4 + 20, Math.sin(a) * 4 + 20, 91);
      if (f < threshold) continue;
      for (let row = 0; row < rows; row++) {
        if ((row === 1 && f < threshold + 0.04) || (row === 2 && f < threshold + 0.14)) continue;
        const r = radius + row * rowGap + (fr() - 0.5) * 4, aa = a + row * 0.025 + (fr() - 0.5) * 0.02;
        const x = Math.cos(aa) * r, z = Math.sin(aa) * r;
        if (skip && skip(x, z)) continue;
        belt.push({ x, z, s: 1.0 + fr() * 0.45, r: fr() * 6.283, c: 0.85 + fr() * 0.2 });
      }
    }
    const g = canopyGeometry([[0, 1.8, 0, 1.75, 1], [1.6, 1.35, 0.4, 1.3, 0], [-1.5, 1.4, -0.3, 1.35, 0]], PAL.foliage.dark, PAL.foliage.mid, 1, 0.8);
    const mesh = new THREE.InstancedMesh(g, makeToon({ vertexColors: true }, 'farForest'), belt.length), m4 = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    belt.forEach((t, i) => { q.setFromAxisAngle(up, t.r); m4.compose(new THREE.Vector3(t.x, yAt(t.x, t.z) - 0.4 * t.s, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + fr() * 0.3), t.s)); mesh.setMatrixAt(i, m4); col.setRGB(t.c, t.c * (0.95 + fr() * 0.1), t.c * 0.95); mesh.setColorAt(i, col); });
    mesh.name = 'farForest'; scene.add(mesh); counts.farForest = belt.length;
    return mesh;
  };

  /** Grass tufts, instanced, lit like the ground. accept(x, z) -> bool gates placement. */
  kit.tufts = ({ count = 900, radius = 36, seed = 999, accept = () => true, rimOf = () => 0, boost = () => 0 } = {}) => {
    const list = [], tr = mulberry(seed);
    let tries = 0;
    while (list.length < count && tries++ < count * 40) {
      const x = (tr() - 0.5) * radius * 2, z = (tr() - 0.5) * radius * 2;
      if (!accept(x, z) || kit.blocked(x, z)) continue;
      const aoV = ao.sample(x, z), rim = rimOf(x, z) * 0.6 + smooth(0.05, 0.3, aoV) * 0.45;
      const cluster = vnoise(x * 0.2, z * 0.2, 71);
      if (tr() > smooth(0.55, 0.9, cluster) * 0.4 + rim + boost(x, z)) continue;
      list.push({ x, z, s: 0.5 + tr() * 0.55, r: tr() * 3.14, c: 0.95 + tr() * 0.25 });
    }
    const A = new THREE.PlaneGeometry(0.9, 0.62); A.translate(0, 0.29, 0); const B = A.clone().rotateY(Math.PI / 2);
    const g = normalsUp(mergeGeometries([A, B]));
    const mat = makeToon({ map: Tex.tuft(), alphaTest: 0.5, side: THREE.DoubleSide }, Object.assign({}, TOON_PRESETS.tuft, { wind: 0.14, windBase: 0.05 }));
    const mesh = new THREE.InstancedMesh(g, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    list.forEach((t, i) => { q.setFromAxisAngle(up, t.r); m4.compose(new THREE.Vector3(t.x, heightAt(t.x, t.z) - 0.04, t.z), q, new THREE.Vector3(t.s, t.s * (0.8 + tr() * 0.4), t.s)); mesh.setMatrixAt(i, m4); col.setRGB(t.c, t.c, t.c * 0.9); mesh.setColorAt(i, col); });
    mesh.name = 'tufts'; mesh.receiveShadow = true; scene.add(mesh); counts.tufts = list.length;
    return mesh;
  };

  /** Flower clusters: [{x, z, hue, n, spread}] -> instanced flat heads. */
  kit.flowers = (clusters, { seed = 31337, accept = () => true } = {}) => {
    const fr = mulberry(seed), list = [];
    for (const cl of clusters) {
      const n = cl.n ?? (8 + (fr() * 12 | 0)), spread = cl.spread ?? 1.3;
      for (let k = 0; k < n; k++) {
        const aa = fr() * 6.283, dd = Math.sqrt(fr()) * spread, x = cl.x + Math.cos(aa) * dd, z = cl.z + Math.sin(aa) * dd;
        if (!accept(x, z) || kit.blocked(x, z)) continue;
        list.push({ x, z, hue: cl.hue, s: 0.7 + fr() * 0.5 });
      }
    }
    const g = normalsUp(new THREE.PlaneGeometry(0.34, 0.34).rotateX(-Math.PI / 2).translate(0, 0.2, 0));
    const mat = makeToon({ map: Tex.flower(), alphaTest: 0.5, side: THREE.DoubleSide }, 'flower');
    const mesh = new THREE.InstancedMesh(g, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    list.forEach((t, i) => { q.setFromEuler(new THREE.Euler((fr() - 0.5) * 0.5, fr() * 6.28, (fr() - 0.5) * 0.5)); m4.compose(new THREE.Vector3(t.x, heightAt(t.x, t.z), t.z), q, new THREE.Vector3(t.s, t.s, t.s)); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, col.copy(C3(t.hue))); });
    mesh.name = 'flowers'; scene.add(mesh); counts.flowers = list.length;
    return mesh;
  };

  // ── water ──
  /** Stream ribbon + pond discs at one water level, world-planar UVs, Tex.water scrolling. */
  kit.water = ({ stream, width = 2.8, ponds = [], y = -0.5 } = {}) => {
    const parts = [];
    if (stream && stream.length > 1) {
      const pts = stream, pos = [], idx = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        const nx = -dz / L, nz = dx / L, w = width / 2;
        pos.push(pts[i][0] + nx * w, y, pts[i][1] + nz * w, pts[i][0] - nx * w, y, pts[i][1] - nz * w);
        if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }   // faces +Y
      }
      const rib = new THREE.BufferGeometry(); rib.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rib.setIndex(idx);
      parts.push(rib.toNonIndexed());
    }
    for (const p of ponds) { const d = new THREE.CircleGeometry(1, 40); d.rotateX(-Math.PI / 2); d.scale(p.r * (p.sx ?? 1), 1, p.r * (p.sz ?? 1)); d.translate(p.x, y + 0.004, p.z); parts.push(d.toNonIndexed()); }
    for (const g of parts) for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    const g = mergeGeometries(parts), P = g.attributes.position, uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { uv[i * 2] = P.getX(i) / 7; uv[i * 2 + 1] = P.getZ(i) / 7; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: Tex.water(), fog: true }));
    mesh.name = 'water'; mesh.renderOrder = 0; scene.add(mesh);
    animators.push((t) => { Tex.water().offset.set(t * 0.012, -t * 0.03); });
    return mesh;
  };

  kit.lilyPads = (x, z, y, n = 4, seed = 9, spread = 2) => {
    const r = mulberry(seed);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = 0.4 + r() * spread, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, pr = 0.22 + r() * 0.12;
      addTo('paint', new THREE.CircleGeometry(pr, 14, 0.3, Math.PI * 2 - 0.6), M4(px, y + 0.02, pz, r() * 6, -Math.PI / 2), i % 2 ? PAL.foliage.light : PAL.foliage.mid);
      if (i % 3 === 0) for (let k = 0; k < 5; k++) { const pa = k / 5 * Math.PI * 2; addTo('paint', new THREE.IcosahedronGeometry(0.055, 0), M4(px + Math.cos(pa) * 0.06, y + 0.08, pz + Math.sin(pa) * 0.06), PAL.flower.pink); }
    }
  };

  kit.reeds = (x, z, n = 9, seed = 21, spread = 0.8) => {
    const r = mulberry(seed);
    for (let i = 0; i < n; i++) {
      const px = x + (r() - 0.5) * spread * 2, pz = z + (r() - 0.5) * spread * 2, y = heightAt(px, pz), h = 0.9 + r() * 0.7;
      addTo('paint', new THREE.CylinderGeometry(0.02, 0.035, h, 5), M4(px, y + h / 2, pz, 0, (r() - 0.5) * 0.25, (r() - 0.5) * 0.25), PAL.foliage.poplar);
      if (r() < 0.55) addTo('paint', new THREE.CylinderGeometry(0.05, 0.05, 0.24, 5), M4(px, y + h + 0.05, pz, 0, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2), PAL.wood.dark);
    }
  };

  // ── signs: one atlas, one draw call for every board ──
  kit.signAtlas = (labels) => {
    const W = 1024, H = 128 * Math.max(1, Math.ceil(labels.length / 2)), cols = 2, rows = Math.ceil(labels.length / 2), sw = W / cols, sh = H / rows;
    const c = mkCanvas(W, H), g = ctx2(c), wood = Tex.wood().image;
    labels.forEach((txt, i) => {
      const x = (i % cols) * sw, y = Math.floor(i / cols) * sh;
      g.save(); g.beginPath(); g.rect(x, y, sw, sh); g.clip();
      g.drawImage(wood, x, y, sw, sh);
      g.fillStyle = css(PAL.wood.light, 0.62); g.fillRect(x, y, sw, sh);
      g.strokeStyle = css(PAL.wood.grain, 0.85); g.lineWidth = 8; g.strokeRect(x + 4, y + 4, sw - 8, sh - 8);
      let size = 70;
      while (Font.measure(txt, size).width > sw - 60 && size > 28) size -= 2;
      Font.draw(g, txt, x + sw / 2 + 2, y + sh / 2 + 5, { size, align: 'center', baseline: 'middle', fill: css(PAL.thatch.pale, 0.55), outline: false, shadow: false });
      Font.draw(g, txt, x + sw / 2, y + sh / 2 + 2, { size, align: 'center', baseline: 'middle', fill: PAL.wood.grain, outline: false, shadow: false });
      g.restore();
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
    return { tex: t, cols, rows, labels };
  };
  const signParts = [];
  /** A signpost with arrow boards: boards [{label, dir (radians, world yaw the arrow points to)}]. */
  kit.signpost = (atlas, x, z, boards, { h = 1.75 } = {}) => {
    const y = heightAt(x, z);
    addTo('wood', boxUV(0.16, h + 0.35, 0.16, 1.2), M4(x, y + (h + 0.35) / 2 - 0.1, z), PAL.wood.beam);
    addTo('wood', new THREE.ConeGeometry(0.14, 0.18, 4), M4(x, y + h + 0.32, z, Math.PI / 4), PAL.wood.beam);
    boards.forEach((b, k) => {
      const i = atlas.labels.indexOf(b.label); if (i < 0) return;
      const len = 1.7, bh = 0.46, arrow = 0.28;
      const shape = new THREE.Shape();
      shape.moveTo(-0.08, -bh / 2); shape.lineTo(len - arrow, -bh / 2); shape.lineTo(len, 0); shape.lineTo(len - arrow, bh / 2); shape.lineTo(-0.08, bh / 2); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
      geo.translate(0, 0, -0.035);
      const u0 = (i % atlas.cols) / atlas.cols, v0 = 1 - (Math.floor(i / atlas.cols) + 1) / atlas.rows, du = 1 / atlas.cols, dv = 1 / atlas.rows;
      const P = geo.attributes.position, N = geo.attributes.normal, uv = geo.attributes.uv;
      for (let q = 0; q < P.count; q++) {
        const px = P.getX(q), py = P.getY(q), nz = N.getZ(q);
        let u = clamp01((px + 0.02) / (len - arrow * 0.35)), v = clamp01((py + bh / 2) / bh);
        if (Math.abs(nz) > 0.5) { if (nz < 0) u = 1 - u; } else { u = 0.03; v = 0.5; }
        uv.setXY(q, u0 + (0.03 + u * 0.94) * du, v0 + (0.08 + v * 0.84) * dv);
      }
      const g = prep(geo, PAL.mask.on);
      g.applyMatrix4(M4(x, y + h - k * 0.56, z, b.dir - Math.PI / 2, 0, (vnoise(x + k, z, 4) - 0.5) * 0.1));
      signParts.push(g);
    });
    ao.disc(x, z, 0.6, 0.5); kit.footDisc(x, z, 0.4);
  };

  // ── moving charm ──
  /** Soft chimney smoke: puffs rise, swell, drift with the wind and fade. */
  kit.smoke = (points) => {
    if (!points.length) return null;
    const S = 128, c = mkCanvas(S), g = ctx2(c);
    const puff = (x, y, r, a) => { const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r); gr.addColorStop(0, css(PAL.cloud.lit, a)); gr.addColorStop(0.45, css(PAL.cloud.warm, a * 0.8)); gr.addColorStop(0.8, css(PAL.cloud.mid, a * 0.3)); gr.addColorStop(1, css(PAL.cloud.mid, 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); };
    puff(64, 70, 50, 0.9); puff(46, 58, 30, 0.6); puff(84, 54, 32, 0.6);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const per = 6, total = points.length * per;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade; varying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade;');
    };
    mat.customProgramCacheKey = () => 'kitsmoke';
    const geo = new THREE.PlaneGeometry(1, 1);
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
    geo.setAttribute('aFade', fade);
    const mesh = new THREE.InstancedMesh(geo, mat, total); mesh.name = 'smoke'; mesh.frustumCulled = false; mesh.renderOrder = 2;
    scene.add(mesh);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qz = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
    const jitter = Array.from({ length: total }, (_, k) => [hashJ(k, 1), hashJ(k, 2), hashJ(k, 3)]);
    animators.push((t, dt, cam) => {
      if (cam) q.copy(cam.quaternion);
      let k = 0;
      for (let pi = 0; pi < points.length; pi++) {
        const p = points[pi];
        for (let i = 0; i < per; i++, k++) {
          const [j1, j2, j3] = jitter[k];
          const life = ((t * 0.11 + i / per + pi * 0.37 + j1 * 0.08) % 1);
          const rise = life * 4.2, drift = life * life * 2.6;
          v.set(p.x + drift * 0.85 + Math.sin(t * 0.6 + i * 2.1 + pi) * 0.22 * life, p.y + rise, p.z - drift * 0.35 + (j2 - 0.5) * 0.3 * life);
          const s = (0.5 + life * 2.1) * (0.85 + j3 * 0.3);
          sc.set(s, s, s);
          qz.setFromAxisAngle(zAxis, j1 * 6.283 + life * (j2 - 0.5) * 1.5);
          m4.compose(v, q.clone().multiply(qz), sc); mesh.setMatrixAt(k, m4);
          fade.array[k] = smooth(0, 0.15, life) * (1 - smooth(0.3, 1, life)) * 0.62;
        }
      }
      mesh.instanceMatrix.needsUpdate = true; fade.needsUpdate = true;
    });
    return mesh;
  };

  /** Butterflies flitting around flower patches: [{x, z, hue}] */
  kit.butterflies = (spots) => {
    if (!spots.length) return null;
    const wing = new THREE.CircleGeometry(0.11, 10); wing.scale(1, 0.8, 1);
    const L = wing.clone().translate(-0.1, 0, 0), R = wing.clone().translate(0.1, 0, 0);
    const mats = [], meshes = [];
    const group = new THREE.Group(); group.name = 'butterflies'; scene.add(group);
    const flies = spots.map((s, i) => {
      const m = new THREE.MeshBasicMaterial({ color: C3(s.hue), side: THREE.DoubleSide, fog: true }); mats.push(m);
      const body = new THREE.Group();
      const l = new THREE.Mesh(L, m), r = new THREE.Mesh(R, m);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.08, 2, 4), new THREE.MeshBasicMaterial({ color: C3(PAL.wood.dark), fog: true }));
      torso.rotation.x = Math.PI / 2;
      const lp = new THREE.Group(), rp = new THREE.Group(); lp.add(l); rp.add(r); l.position.x = 0; r.position.x = 0;
      body.add(lp, rp, torso); group.add(body); meshes.push(body);
      return { s, body, lp, rp, ph: i * 1.7, sp: 0.5 + (i % 3) * 0.12 };
    });
    animators.push((t) => {
      for (const f of flies) {
        const a = t * f.sp + f.ph, x = f.s.x + Math.sin(a) * 1.6 + Math.sin(a * 2.3) * 0.5, z = f.s.z + Math.cos(a * 0.8) * 1.3;
        const y = heightAt(x, z) + 0.7 + Math.sin(a * 3.1) * 0.25 + Math.abs(Math.sin(t * 9 + f.ph)) * 0.06;
        const nx = f.s.x + Math.sin(a + 0.05) * 1.6 + Math.sin((a + 0.05) * 2.3) * 0.5, nz = f.s.z + Math.cos((a + 0.05) * 0.8) * 1.3;
        f.body.position.set(x, y, z);
        f.body.rotation.y = Math.atan2(nx - x, nz - z);
        const flap = Math.sin(t * 22 + f.ph) * 0.9 + 0.2;
        f.lp.rotation.z = flap; f.rp.rotation.z = -flap;
      }
    });
    return group;
  };

  /** Build the meshes for a footbridge frame made by bridgeFrame(). */
  kit.footbridge = (F) => {
    const { L, W, arch, dir } = F, T = 0.1, N = 16;
    const at = (u, v, y) => new THREE.Vector3(F.cx + F.ax * u + F.sx * v, y, F.cz + F.az * u + F.sz * v);
    for (let k = 0; k < N; k++) {
      const u = -L / 2 + (k + 0.5) * L / N, y = F.archY(u), slope = -arch * 8 * u / (L * L);
      const p = at(u, 0, y - T / 2);
      const plank = boxUV(W * (0.97 + ((k * 7) % 3) * 0.015), T, L / N * 0.9, 0.9);
      addTo('wood', plank, M4(p.x, p.y, p.z, dir, -Math.atan(slope)), k % 3 === 1 ? PAL.wood.weathered : PAL.wood.light);
    }
    for (const side of [-1, 1]) {
      const v = side * (W / 2 - 0.08);
      for (let k = 0; k < N; k++) {
        const u = -L / 2 + (k + 0.5) * L / N, y = F.archY(u), slope = -arch * 8 * u / (L * L), p = at(u, side * (W / 2 - 0.12), y - T - 0.09);
        addTo('wood', boxUV(0.16, 0.2, L / N + 0.02, 1.2), M4(p.x, p.y, p.z, dir, -Math.atan(slope)), PAL.wood.beam);
      }
      const posts = F.posts;
      for (const u of posts) {
        const y = F.archY(u), p = at(u, v, y + 0.42);
        addTo('wood', boxUV(0.14, 0.95, 0.14, 1.2), M4(p.x, p.y, p.z, dir), PAL.wood.beam);
        addTo('wood', new THREE.SphereGeometry(0.09, 8, 6), M4(p.x, y + 0.94, p.z), PAL.wood.beam);
      }
      for (let k = 0; k < posts.length - 1; k++) {
        const ua = posts[k], ub = posts[k + 1], um = (ua + ub) / 2, ya = F.archY(ua) + 0.82, yb = F.archY(ub) + 0.82, p = at(um, v, (ya + yb) / 2);
        addTo('wood', boxUV(0.09, 0.1, ub - ua + 0.08, 1.0), M4(p.x, p.y, p.z, dir, -Math.atan2(yb - ya, ub - ua)), PAL.wood.light);
        const q = at(um, v, (ya + yb) / 2 - 0.36);
        addTo('wood', boxUV(0.07, 0.08, ub - ua, 1.0), M4(q.x, q.y, q.z, dir, -Math.atan2(yb - ya, ub - ua)), PAL.wood.weathered);
      }
    }
    for (const e of F.ends) ao.disc(e[0], e[1], 1.3, 0.5);
    kit.footBox(F.cx, F.cz, W + 0.4, L + 0.4, dir);
    return F;
  };

  /** A washing line between two posts with cloths that hang and sway (negative wind: they hang from the line). */
  kit.laundry = (A, B, cloths) => {
    const LA = new THREE.Vector3(A[0], heightAt(A[0], A[1]), A[1]), LB = new THREE.Vector3(B[0], heightAt(B[0], B[1]), B[1]);
    const yaw = Math.atan2(LB.x - LA.x, LB.z - LA.z) + Math.PI / 2;
    for (const P of [LA, LB]) {
      addTo('wood', boxUV(0.14, 2.35, 0.14, 1.2), M4(P.x, P.y + 1.1, P.z), PAL.wood.beam);
      addTo('wood', boxUV(0.5, 0.1, 0.1, 1.2), M4(P.x, P.y + 2.18, P.z, yaw), PAL.wood.beam);
      ao.disc(P.x, P.z, 0.5, 0.5); kit.footDisc(P.x, P.z, 0.3);
    }
    const lineY = Math.max(LA.y, LB.y) + 2.15;
    const rope = new THREE.CatmullRomCurve3([new THREE.Vector3(LA.x, lineY, LA.z), new THREE.Vector3(lerp(LA.x, LB.x, 0.5), lineY - 0.22, lerp(LA.z, LB.z, 0.5)), new THREE.Vector3(LB.x, lineY, LB.z)]);
    addTo('paint', new THREE.TubeGeometry(rope, 24, 0.022, 5), null, PAL.cloth.rope);
    const lineDir = new THREE.Vector3().subVectors(LB, LA).setY(0).normalize(), side = new THREE.Vector3(-lineDir.z, 0, lineDir.x);
    const span = LA.distanceTo(LB);
    for (const cd of cloths) {
      const g = new THREE.PlaneGeometry(cd.w, cd.h, 8, 8), p = g.attributes.position, uv = g.attributes.uv;
      const c0 = rope.getPoint(cd.t);
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), ly = p.getY(i) - cd.h / 2;
        const along = c0.clone().addScaledVector(lineDir, lx);
        const topY = rope.getPoint(Math.min(1, Math.max(0, cd.t + lx / span))).y;
        const billow = Math.sin((lx / cd.w + 0.5) * Math.PI) * 0.06 * (-ly / cd.h) + Math.sin((lx / cd.w) * 9) * 0.02;
        p.setXYZ(i, along.x + side.x * billow, topY + ly, along.z + side.z * billow);
        uv.setXY(i, uv.getX(i) * cd.w / 0.9, uv.getY(i) * cd.h / 0.9);
      }
      g.computeVertexNormals();
      const mat = makeToon({ map: cd.tex, side: THREE.DoubleSide }, Object.assign({}, TOON_PRESETS.cloth, { wind: -0.07, windBase: lineY - 0.05 }));
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'laundry'; scene.add(mesh);
      for (const s of [-1, 1]) { const q = c0.clone().addScaledVector(lineDir, s * cd.w * 0.36); addTo('paint', new THREE.BoxGeometry(0.05, 0.14, 0.05), M4(q.x, rope.getPoint(cd.t).y - 0.02, q.z), PAL.wood.light); }
    }
  };

  /**
   * Instanced critters: one merged body geometry + one head geometry (vertex coloured), with hull outlines.
   * spec: {name, body: BufferGeometry (colour attr), head: BufferGeometry, headAt: [x, y, z], count, outline, wind?}
   * Returns {set(i, x, y, z, yaw, headPitch, headYaw, scale, bob), commit(), count}
   */
  kit.critters = ({ name, body, head, headAt, count, outline = OUTLINE.slime, headOutline = true, preset = 'character' }) => {
    const bodyMat = makeToon({ vertexColors: true }, preset), headMat = makeToon({ vertexColors: true }, preset);
    const B = new THREE.InstancedMesh(body, bodyMat, count), H = new THREE.InstancedMesh(head, headMat, count);
    B.name = name + '-body'; H.name = name + '-head';
    // moving things get blob shadows (ART-DIRECTION §1.6), not sun shadows: cheap, soft and never swimming
    for (const m of [B, H]) { m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
    const hb = outline ? new THREE.InstancedMesh(hullGeometry(body, outline), outlineMaterial(PAL.outline.char), count) : null;
    const hh = outline && headOutline ? new THREE.InstancedMesh(hullGeometry(head, outline), outlineMaterial(PAL.outline.char), count) : null;
    if (hb) { hb.instanceMatrix = B.instanceMatrix; hb.frustumCulled = false; hb.name = name + '-body-hull'; scene.add(hb); }
    if (hh) { hh.instanceMatrix = H.instanceMatrix; hh.frustumCulled = false; hh.name = name + '-head-hull'; scene.add(hh); }
    const m4 = new THREE.Matrix4(), hm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    counts[name] = count;
    return {
      count, body: B, head: H,
      set(i, x, y, z, yaw, headPitch = 0, headYaw = 0, scale = 1, squash = 0) {
        q.setFromAxisAngle(v.set(0, 1, 0), yaw);
        m4.compose(v.set(x, y, z), q, s.set(scale * (1 + squash * 0.5), scale * (1 - squash), scale * (1 + squash * 0.5)));
        B.setMatrixAt(i, m4);
        e.set(headPitch, headYaw, 0, 'YXZ'); q.setFromEuler(e);
        hm.compose(v.set(headAt[0], headAt[1], headAt[2]), q, s.set(1, 1, 1));
        H.setMatrixAt(i, m4.multiply(hm));
      },
      commit() { B.instanceMatrix.needsUpdate = true; H.instanceMatrix.needsUpdate = true; },
    };
  };

  /** Small birds gliding in lazy loops high over the map, wings beating now and then. */
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
      R.scale.x = -1; b.add(L, R); b.scale.setScalar(2.3); group.add(b);
      flock.push({ b, L, R, ph: r() * 6.283, sp: 0.09 + r() * 0.05, rad: radius * (0.6 + r() * 0.5), h: height + r() * 6, cx: centre[0] + (r() - 0.5) * 12, cz: centre[1] + (r() - 0.5) * 12, flapPh: r() * 6.283 });
    }
    animators.push((t) => {
      for (const f of flock) {
        const a = t * f.sp + f.ph, x = f.cx + Math.cos(a) * f.rad, z = f.cz + Math.sin(a) * f.rad * 0.7;
        f.b.position.set(x, f.h + Math.sin(a * 3) * 0.8, z);
        f.b.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a) * 0.7) + Math.PI, Math.sin(a) * 0.25);
        const beat = Math.max(0, Math.sin(t * 0.8 + f.flapPh)) > 0.6 ? Math.sin(t * 16 + f.flapPh) * 0.7 : 0.12;
        f.L.rotation.z = beat; f.R.rotation.z = -beat;
      }
    });
    return group;
  };

  /** A faint castle on a cloud, far up in the sky (WORLD-BIBLE: Highfeather, visible from the first minute). */
  kit.skyCastle = ({ azimuth = -1.05, elevation = 0.36, distance = 700, size = 150, opacity = 0.16 } = {}) => {
    const W = 512, H = 384, c = mkCanvas(W, H), g = ctx2(c);
    const ink = PAL.cloud.shade;
    g.fillStyle = css(ink, 1);
    // the cloud it sits on
    for (const [x, y, rr] of [[150, 300, 70], [230, 285, 90], [320, 295, 80], [390, 310, 55], [95, 318, 45]]) { g.beginPath(); g.arc(x, y, rr, 0, 6.283); g.fill(); }
    g.clearRect(0, 330, W, H - 330);
    // keep and towers
    const tower = (x, w, h, roof) => {
      g.fillRect(x - w / 2, 260 - h, w, h);
      g.beginPath(); g.moveTo(x - w / 2 - 6, 260 - h); g.lineTo(x, 260 - h - roof); g.lineTo(x + w / 2 + 6, 260 - h); g.closePath(); g.fill();
    };
    g.fillRect(170, 150, 190, 110);
    tower(185, 38, 150, 46); tower(345, 38, 140, 44); tower(265, 56, 200, 70); tower(225, 26, 120, 34); tower(305, 26, 118, 34);
    g.fillStyle = css(PAL.cloud.lit, 1);
    for (const [x, y] of [[265, 110], [185, 150], [345, 158]]) { g.beginPath(); g.ellipse(x, y, 5, 9, 0, 0, 6.283); g.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(size, size * H / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, fog: false }));
    const y = Math.sin(elevation) * distance, h = Math.cos(elevation) * distance;
    card.position.set(Math.cos(azimuth) * h, y, Math.sin(azimuth) * h);
    card.lookAt(0, y * 0.6, 0);
    card.renderOrder = -9.5; card.frustumCulled = false; card.name = 'highfeather';
    scene.add(card);
    animators.push((t, dt, cam) => { if (cam) card.position.set(cam.position.x + Math.cos(azimuth) * h, cam.position.y * 0.2 + y + Math.sin(t * 0.05) * 3, cam.position.z + Math.sin(azimuth) * h); });
    return card;
  };

  kit.update = (t, dt, camera) => { for (const fn of animators) { try { fn(t, dt, camera); } catch (e) { reportError('scenery animator', e); } } };

  // ── merge ──
  kit.flush = () => {
    const MAT = {
      stone: Toon.surface('stone', { vertexColors: true }), plaster: Toon.surface('plaster', { vertexColors: true }),
      wood: Toon.surface('wood', { vertexColors: true }), thatch: Toon.surface('thatch', { vertexColors: true }),
      tile: Toon.surface('tile', { vertexColors: true }), brick: Toon.surface('brick', { vertexColors: true }),
      bark: Toon.surface('bark', { vertexColors: true }), dirtbed: Toon.surface('dirt', { vertexColors: true, preset: 'ground' }),
      paint: makeToon({ vertexColors: true }),
    };
    const out = [];
    for (const [k, list] of buckets) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), MAT[k] || MAT.paint); mesh.name = 'bucket-' + k; mesh.castShadow = k !== 'paint'; mesh.receiveShadow = true;
      scene.add(mesh); out.push(mesh);
    }
    buckets.clear();
    if (signParts.length && kit._signTex) {
      const signs = new THREE.Mesh(mergeGeometries(signParts), makeToon({ map: kit._signTex, vertexColors: true }));
      signs.name = 'signs'; signs.castShadow = true; signs.receiveShadow = true; scene.add(signs); out.push(signs);
      signParts.length = 0;
    }
    return out;
  };
  kit.useSignAtlas = (atlas) => { kit._signTex = atlas.tex; return atlas; };

  return kit;
}
