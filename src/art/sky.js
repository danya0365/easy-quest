/**
 * sky.js — the sky dome, drifting cloud cards, the layered hill rings, birds, and Highfeather in the clouds.
 *                                                                                        (P02, owner: src/art/sky.js)
 *
 * Recipes are docs/ART-DIRECTION.md §11 expressed ONLY through F3's foundation (PAL, Tex, makeToon).
 * Moved verbatim out of src/world/scenery.js (the vertical slice's kit); signatures are a contract maps rely on.
 *
 *   buildSky(scene, rig) -> {sky, clouds, uniforms}   uniforms uZenith/uUpper/uHorizon/uHaze/uSunGlow (the field's
 *                                                     time of day lerps them; keep the names)
 *   ringHill(scene, id, r0, r1, r2, baseH, amp, seed, lowHex, highHex, haze, {fogged, peaky}) -> Mesh
 *   skyRecipes(kit)    adds kit.birds(n, {centre, height, radius, seed}) and kit.skyCastle({azimuth, elevation, ...})
 *
 * Kit contract used here (src/art/props.js createPropsKit): kit.scene, kit.animators.push(fn(t, dt, cam)).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, css, lerp, smooth, mixHex } from './palette.js';
import { Tex, mulberry, vnoise, mkCanvas, ctx2 } from './tex.js';
import { makeToon } from './toon.js';

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
// kit recipes (installed by src/world/scenery.js createKit)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function skyRecipes(kit) {
  const { scene, animators } = kit;

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

  /**
   * Highfeather: a castle on its own cloud, far off in the sky (WORLD-BIBLE: visible from the first minute).
   * Painted like the cloud cards — sunlit puffs with a lavender base — and a castle in pre-hazed sky colours with
   * lit and shaded faces, violet roofs and gold spire tips, so it reads as somewhere real and very far away (a place
   * you will go), never as a see-through rendering ghost.
   */
  kit.skyCastle = ({ azimuth = -1.05, elevation = 0.36, distance = 700, size = 150, opacity = 0.94, tintFrom = null } = {}) => {
    const W = 512, H = 384, c = mkCanvas(W, H), g = ctx2(c), rnd = mulberry(15015);
    const hz = (hex, k) => mixHex(hex, PAL.sky.horizon, k);                 // aerial perspective, baked in
    const wallLit = hz(PAL.plaster.light, 0.45), wallShade = hz(PAL.hill.farLow, 0.4), roofLit = hz(PAL.cloth.purple, 0.58), roofShade = hz(PAL.cloth.purpleDark, 0.55);
    const ink = hz(PAL.cloth.purpleDark, 0.35), gold = mixHex(PAL.flower.yellow, PAL.cloud.lit, 0.25), win = hz(PAL.paint.glass, 0.45);
    g.lineJoin = 'round'; g.lineCap = 'round';
    // back cloud bank (behind the castle)
    const puff = (x, y, r, lit = 1) => {
      const gr = g.createRadialGradient(x + r * 0.25, y - r * 0.4, r * 0.1, x, y, r * 1.02);
      gr.addColorStop(0, PAL.cloud.lit); gr.addColorStop(0.5, mixHex(PAL.cloud.warm, PAL.cloud.mid, 1 - lit)); gr.addColorStop(1, mixHex(PAL.cloud.mid, PAL.cloud.shade, 0.5));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    for (const [x, y, r] of [[118, 292, 52], [196, 272, 66], [300, 268, 70], [388, 286, 56], [452, 300, 38], [66, 306, 34]]) puff(x, y, r, 0.8);
    // the castle: keep, towers with conical roofs, windows, pennant
    const tower = (x, w, h, roofH, lit) => {
      const y0 = 268, yt = y0 - h;
      g.fillStyle = lit ? wallLit : wallShade; g.fillRect(x - w / 2, yt, w, h);
      g.fillStyle = wallShade; g.globalAlpha = 0.55; g.fillRect(x + w * 0.12, yt, w * 0.38, h); g.globalAlpha = 1;       // shaded side
      g.strokeStyle = ink; g.lineWidth = 2.2; g.strokeRect(x - w / 2, yt, w, h);
      // crenel band + roof
      g.beginPath(); g.moveTo(x - w / 2 - 5, yt); g.lineTo(x, yt - roofH); g.lineTo(x + w / 2 + 5, yt); g.closePath();
      g.fillStyle = roofLit; g.fill();
      g.beginPath(); g.moveTo(x, yt - roofH); g.lineTo(x + w / 2 + 5, yt); g.lineTo(x + w * 0.1, yt); g.closePath(); g.fillStyle = roofShade; g.fill();
      g.beginPath(); g.moveTo(x - w / 2 - 5, yt); g.lineTo(x, yt - roofH); g.lineTo(x + w / 2 + 5, yt); g.closePath(); g.stroke();
      g.fillStyle = gold; g.beginPath(); g.arc(x, yt - roofH - 3, 3.2, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < Math.floor(h / 42); k++) { g.fillStyle = win; g.beginPath(); g.roundRect(x - 3.5, yt + 18 + k * 40, 7, 13, 3.5); g.fill(); }
    };
    g.fillStyle = wallLit; g.fillRect(168, 170, 196, 98); g.fillStyle = wallShade; g.globalAlpha = 0.5; g.fillRect(270, 170, 94, 98); g.globalAlpha = 1;
    g.strokeStyle = ink; g.lineWidth = 2.2; g.strokeRect(168, 170, 196, 98);
    for (let x = 172; x < 360; x += 16) { g.fillStyle = wallLit; g.fillRect(x, 162, 9, 9); g.strokeRect(x, 162, 9, 9); }
    g.fillStyle = win; g.beginPath(); g.moveTo(250, 268); g.lineTo(250, 236); g.arc(266, 236, 16, Math.PI, 0); g.lineTo(282, 268); g.closePath(); g.fill();
    tower(186, 40, 150, 50, true); tower(346, 40, 140, 48, false); tower(226, 28, 118, 36, true); tower(306, 28, 116, 36, false); tower(266, 58, 172, 62, true);
    // pennant on the great tower
    g.strokeStyle = ink; g.lineWidth = 2; g.beginPath(); g.moveTo(266, 32); g.lineTo(266, 8); g.stroke();
    g.fillStyle = hz(PAL.flower.red, 0.3); g.beginPath(); g.moveTo(266, 8); g.quadraticCurveTo(284, 12, 300, 8); g.quadraticCurveTo(284, 20, 266, 23); g.closePath(); g.fill();
    // front cloud puffs hugging the castle's feet, flat lavender underside
    for (const [x, y, r] of [[96, 312, 40], [160, 300, 50], [236, 298, 56], [322, 300, 54], [404, 310, 44], [466, 318, 30], [44, 322, 26]]) puff(x + (rnd() - 0.5) * 6, y, r, 1);
    g.globalCompositeOperation = 'destination-out'; g.fillRect(0, 334, W, H - 334); g.globalCompositeOperation = 'source-atop';
    const base = g.createLinearGradient(0, 300, 0, 334); base.addColorStop(0, css(PAL.cloud.core, 0)); base.addColorStop(1, css(PAL.cloud.core, 0.5));
    g.fillStyle = base; g.fillRect(0, 300, W, 34); g.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, fog: false });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(size, size * H / W), mat);
    const y = Math.sin(elevation) * distance, h = Math.cos(elevation) * distance;
    card.position.set(Math.cos(azimuth) * h, y, Math.sin(azimuth) * h);
    card.lookAt(0, y * 0.6, 0);
    card.renderOrder = -9.5; card.frustumCulled = false; card.name = 'highfeather';
    scene.add(card);
    animators.push((t, dt, cam) => {
      if (cam) card.position.set(cam.position.x + Math.cos(azimuth) * h, cam.position.y * 0.2 + y + Math.sin(t * 0.05) * 3, cam.position.z + Math.sin(azimuth) * h);
      if (tintFrom && tintFrom.color) mat.color.copy(tintFrom.color);            // dusk and night tint it like the clouds
    });
    return card;
  };

  return kit;
}
