/**
 * fx.js — the procedural special-effects library.                                    (P20, owner: src/art/fx.js)
 *
 * One pooled, instanced billboard system plus three tiny prop pools (ground rings, light pillars, lightning
 * ribbons) and a DOM screen flash. Everything is drawn in the locked house style: warm saturated PAL colours,
 * chunky readable shapes, nothing neon, nothing that lingers. Every effect reads in about half a second.
 *
 *   import { FX } from '../art/fx.js';
 *
 *   FX.attach(scene, { camera, sound })      // put the pools in a THREE.Scene (Field.world().scene, a battle stage)
 *   FX.play('fire_burst', { at, scale, dir, onPeak })
 *   FX.update(dt)                            // call it once a tick; if nobody does, it ticks itself on render
 *   FX.detach()                              // take the pools back out and free the GPU memory
 *
 * play(id, opts):
 *   at        THREE.Vector3 | {x,y,z} | Object3D  where it happens       (default 0,1,0)
 *   scale     number                              1 = a person-sized effect. USE ~0.7 IN BATTLE: the battle rig
 *                                                 sits 0.55 up and 2.9 out, and a 1.0 fire_big fills the frame.
 *   dir       THREE.Vector3 | {x,z} | radians     which way it travels   (default the camera's facing)
 *   from      like `at`                           the CASTER: a comet flies from here and the burst fires on
 *                                                 arrival; `travelMs` (default 190) is how long the flight takes
 *   onPeak    fn()                                called at the effect's loudest moment (hit frame, flash, thunk)
 *   sound     false to stay silent, or an sfx id to override the effect's own
 *   flash     false to suppress the whole-screen flash (a screenshot grid, many effects at once)
 *   Returns {id, ms, peak, ok, travelMs?} — never throws, never returns null for a real id.
 *
 * FX.setShake(fn) lets whoever owns the camera answer the heavy effects: they ask for {amp, ms} and `install`
 * routes that to the Bus as `fx.shake`. FX.setFlash(false) turns every screen flash off. FX.setCap(n) caps the
 * particles in flight (384 on the low quality tier).
 *
 * COST. Two draw calls for every particle in flight (one additive mesh, one soft-blend mesh), each an
 * InstancedMesh of a single quad billboarded in the vertex shader; a 512x512 canvas atlas of 16 shapes is the only
 * texture. Rings, pillars and bolts are 8 + 2 + 3 pooled meshes that sit invisible when idle. Nothing allocates
 * during a fight: particles are recycled objects, and the pool caps itself (768 / 384 particles at high / low
 * quality) by retiring the oldest.
 *
 * SOUND. Each effect names the src/audio/sfx.js id that belongs with it and plays it at its peak through the
 * sound hook, so the picture and the noise can never drift apart. `FX.setSound(fn)` or `attach({sound})` wires it;
 * with no hook, effects are silent and still correct.
 *
 * PLUGIN. `install(ctx)` follows the main.js plugin contract: it attaches to the field as maps load, ticks on the
 * field's render hook, plays an effect for any `fx.play` Bus event, gives level-ups / chests / footsteps their
 * sparkle, and exposes __DQ.fx(id, opts) + __DQ.state().fx.
 */
import * as THREE from 'three';
import { PAL, C3, mixHex } from './palette.js';
import { mkCanvas, ctx2, texFrom } from './tex.js';
import { reportError } from '../engine/debug.js';

const TAU = Math.PI * 2;
/** Particle sizes are authored small and boosted here, so 'bolder' is one number, not fifty. */
const PSZ = 1.15;
/**
 * Vertical damping. THE BATTLE CAMERA SITS 0.55 UNITS OFF THE GROUND, 2.9 UNITS OUT: anything that climbs much
 * more than a metre leaves the top of the frame and the spell looks like it never happened. Every effect is
 * authored as if it had room, then squashed here, so a burst HUGS whatever it hit.
 */
const VY = 0.55;
const rnd = () => Math.random();
const rr = (a, b) => a + (b - a) * Math.random();
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const guard = (where, fn) => { try { return fn(); } catch (e) { reportError('fx: ' + where, e); return undefined; } };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the shape atlas — 16 white masks on a 512x512 canvas, 4 x 4 cells of 128px
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const SHAPE = Object.freeze({
  blob: 0, spark: 1, ring: 2, shard: 3, puff: 4, smoke: 5, zed: 6, bird: 7,
  bubble: 8, flame: 9, bolt: 10, leaf: 11, star: 12, drop: 13, arc: 14, mote: 15,
});
const CELL = 128, COLS = 4;

let atlasTex = null;
function atlas() {
  if (atlasTex) return atlasTex;
  const c = mkCanvas(CELL * COLS, CELL * COLS);
  const g = ctx2(c);
  g.clearRect(0, 0, c.width, c.height);
  const cell = (i, fn) => {
    g.save();
    g.translate((i % COLS) * CELL, ((i / COLS) | 0) * CELL);
    g.beginPath(); g.rect(0, 0, CELL, CELL); g.clip();
    g.translate(CELL / 2, CELL / 2);
    g.scale(0.88, 0.88);                       // keep every shape clear of its cell edge (see UV_INSET)
    g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineJoin = 'round'; g.lineCap = 'round';
    fn(g);
    g.restore();
  };
  const radial = (r0, r1, stops) => {
    const gr = g.createRadialGradient(0, 0, r0, 0, 0, r1);
    for (const [t, a] of stops) gr.addColorStop(t, `rgba(255,255,255,${a})`);
    return gr;
  };

  // 0 blob — the soft round glow everything is made of
  cell(SHAPE.blob, () => { g.fillStyle = radial(0, 62, [[0, 1], [0.35, 0.82], [0.7, 0.24], [1, 0]]); g.beginPath(); g.arc(0, 0, 62, 0, TAU); g.fill(); });
  // 1 spark — a hard four-point star with a bright core
  cell(SHAPE.spark, () => {
    g.fillStyle = radial(0, 22, [[0, 1], [1, 0]]); g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const R = 60, w = 9;
      g.moveTo(Math.cos(a) * R, Math.sin(a) * R);
      g.lineTo(Math.cos(a + 0.5) * w, Math.sin(a + 0.5) * w);
      g.lineTo(Math.cos(a - 0.5) * w, Math.sin(a - 0.5) * w); }
    g.fill();
  });
  // 2 ring — a clean annulus (chime, shockwave seen edge-on)
  cell(SHAPE.ring, () => { g.lineWidth = 13; g.globalAlpha = 1; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.stroke();
    g.globalAlpha = 0.35; g.lineWidth = 26; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.stroke(); });
  // 3 shard — an ice splinter, point up
  cell(SHAPE.shard, () => { g.beginPath(); g.moveTo(0, -60); g.lineTo(20, 6); g.lineTo(0, 58); g.lineTo(-20, 6); g.closePath(); g.fill();
    g.globalAlpha = 0.45; g.beginPath(); g.moveTo(0, -60); g.lineTo(30, 10); g.lineTo(0, 58); g.lineTo(-30, 10); g.closePath(); g.fill(); });
  // 4 puff — three fat lobes, a DQ cloud
  cell(SHAPE.puff, () => { for (const [x, y, r] of [[-22, 8, 34], [20, 12, 30], [0, -14, 38]]) {
    g.fillStyle = radial(0, r, [[0, 1], [0.6, 0.9], [1, 0]]); g.save(); g.translate(x, y); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.restore(); } });
  // 5 smoke — soft and lumpy, quieter than a puff
  cell(SHAPE.smoke, () => { for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, R = 20 + (i % 3) * 7;
    const x = Math.cos(a) * R, y = Math.sin(a) * R, r = 30 + (i % 4) * 5;
    g.fillStyle = radial(0, r, [[0, 0.55], [1, 0]]); g.save(); g.translate(x, y); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.restore(); } });
  // 6 zed — the sleep Z
  cell(SHAPE.zed, () => { g.lineWidth = 15; g.beginPath(); g.moveTo(-34, -36); g.lineTo(34, -36); g.lineTo(-34, 36); g.lineTo(34, 36); g.stroke(); });
  // 7 bird — a confusion birdie
  cell(SHAPE.bird, () => { g.lineWidth = 13; g.beginPath(); g.moveTo(-52, 6); g.quadraticCurveTo(-26, -34, 0, 4); g.quadraticCurveTo(26, -34, 52, 6); g.stroke(); });
  // 8 bubble — a poison bubble with a highlight
  cell(SHAPE.bubble, () => { g.lineWidth = 11; g.globalAlpha = 0.95; g.beginPath(); g.arc(0, 0, 44, 0, TAU); g.stroke();
    g.globalAlpha = 0.28; g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.fill();
    g.globalAlpha = 1; g.beginPath(); g.arc(-16, -18, 9, 0, TAU); g.fill(); });
  // 9 flame — a teardrop lick, point up
  cell(SHAPE.flame, () => { g.beginPath(); g.moveTo(0, -62); g.bezierCurveTo(34, -18, 40, 22, 0, 60); g.bezierCurveTo(-40, 22, -34, -18, 0, -62); g.fill();
    g.globalAlpha = 0.5; g.beginPath(); g.moveTo(0, -46); g.bezierCurveTo(22, -12, 26, 18, 0, 46); g.bezierCurveTo(-26, 18, -22, -12, 0, -46); g.fill(); });
  // 10 bolt — a jagged streak
  cell(SHAPE.bolt, () => { g.lineWidth = 14; g.beginPath(); g.moveTo(-6, -62); g.lineTo(16, -18); g.lineTo(-10, -4); g.lineTo(14, 24); g.lineTo(-4, 62); g.stroke();
    g.globalAlpha = 0.4; g.lineWidth = 32; g.beginPath(); g.moveTo(-6, -62); g.lineTo(16, -18); g.lineTo(-10, -4); g.lineTo(14, 24); g.lineTo(-4, 62); g.stroke(); });
  // 11 leaf — a vine leaf, point up
  cell(SHAPE.leaf, () => { g.beginPath(); g.moveTo(0, -58); g.quadraticCurveTo(38, -6, 0, 58); g.quadraticCurveTo(-38, -6, 0, -58); g.fill(); });
  // 12 star — a six-point sparkle with long spokes
  cell(SHAPE.star, () => {
    g.fillStyle = radial(0, 18, [[0, 1], [1, 0]]); g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.fill();
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const R = i % 2 ? 40 : 62, w = 7;
      g.beginPath();
      g.moveTo(Math.cos(a) * R, Math.sin(a) * R);
      g.lineTo(Math.cos(a + 0.45) * w, Math.sin(a + 0.45) * w);
      g.lineTo(Math.cos(a - 0.45) * w, Math.sin(a - 0.45) * w);
      g.fill(); }
  });
  // 13 drop — a water droplet
  cell(SHAPE.drop, () => { g.beginPath(); g.moveTo(0, -56); g.bezierCurveTo(30, -6, 32, 26, 0, 54); g.bezierCurveTo(-32, 26, -30, -6, 0, -56); g.fill(); });
  // 14 arc — a crescent slash
  cell(SHAPE.arc, () => { g.lineWidth = 16; g.beginPath(); g.arc(0, 14, 52, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    g.globalAlpha = 0.4; g.lineWidth = 34; g.beginPath(); g.arc(0, 14, 52, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); });
  // 15 mote — a tight little dot of dust
  cell(SHAPE.mote, () => { g.fillStyle = radial(0, 34, [[0, 1], [0.5, 0.7], [1, 0]]); g.beginPath(); g.arc(0, 0, 34, 0, TAU); g.fill(); });

  atlasTex = texFrom(c, { srgb: false, aniso: 1 });
  // mipmaps blend NEIGHBOURING atlas cells at small sizes (a sleep Z once turned up inside a lightning bolt),
  // and Repeat wrapping bleeds the far edge in. Clamp, no mips, plus the UV inset in the shader.
  atlasTex.generateMipmaps = false;
  atlasTex.minFilter = THREE.LinearFilter;
  atlasTex.magFilter = THREE.LinearFilter;
  atlasTex.wrapS = atlasTex.wrapT = THREE.ClampToEdgeWrapping;
  atlasTex.name = 'fx-atlas';
  atlasTex.needsUpdate = true;
  return atlasTex;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the instanced billboard system
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const VERT = /* glsl */`
attribute vec3 aPos;
attribute vec4 aMisc;   // x size, y rotation, z alpha, w atlas cell
attribute vec3 aCol;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
void main() {
  vCol = aCol;
  vA = aMisc.z;
  float f = aMisc.w;
  // The canvas atlas is uploaded flipped (texture.flipY), so ROW 0 of the drawing is the TOP row of the
  // canvas but the LAST row in texture space. Counting rows down from 3 keeps every shape the right way up
  // AND in the right cell — without this the ice shards drew as dust motes and the bolts drew as sleep Zs.
  vec2 c0 = vec2(mod(f, 4.0), 3.0 - floor(f / 4.0));
  vUv = (uv * 0.94 + 0.03 + c0) * 0.25;
  float s = sin(aMisc.y), c = cos(aMisc.y);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aMisc.x;
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
void main() {
  float a = texture2D(uMap, vUv).a * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol, a);
  #include <colorspace_fragment>
}`;

let quadGeo = null;
function makeBatch(capacity, additive) {
  if (!quadGeo) quadGeo = new THREE.PlaneGeometry(1, 1);      // ONE quad, shared by both batches
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quadGeo.index;
  geo.setAttribute('position', quadGeo.getAttribute('position'));
  geo.setAttribute('uv', quadGeo.getAttribute('uv'));
  const pos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const misc = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const col = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  pos.setUsage(THREE.DynamicDrawUsage); misc.setUsage(THREE.DynamicDrawUsage); col.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', pos);
  geo.setAttribute('aMisc', misc);
  geo.setAttribute('aCol', col);
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);   // never frustum-culled away mid-effect
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: atlas() } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: true, fog: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = additive ? 'fx-additive' : 'fx-soft';
  mesh.frustumCulled = false;
  mesh.renderOrder = additive ? 9 : 8;
  mesh.matrixAutoUpdate = false;
  return { mesh, geo, mat, pos, misc, col, capacity };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// state
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const S = {
  scene: null, camera: null, sound: null,
  add: null, soft: null, cap: 768,
  live: [], free: [], rings: [], pillars: [], bolts: [],
  manual: 0, lastAuto: 0, played: 0, dropped: 0, lastId: null, flashEl: null, ms: 0,
  flash: true, flashOff: false, shake: null, shook: 0, paused: false,
};

function newParticle() {
  return { on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gy: 0, drag: 0,
    life: 0, max: 1, s0: 1, s1: 1, rot: 0, spin: 0, r: 1, g: 1, b: 1, a0: 1, fi: 0.12, fp: 1,
    f: 0, add: true, swirl: 0, sx: 0, sz: 0, sr: 0, sp: 0 };
}

/** Emit one particle. Every field is optional; see newParticle for the defaults. */
function emit(o) {
  let p = S.free.pop();
  if (!p) {
    if (S.live.length >= S.cap) { p = S.live.shift(); S.dropped++; }   // retire the oldest rather than grow
    else p = newParticle();
  }
  p.on = true;
  p.x = o.x || 0; p.y = o.y || 0; p.z = o.z || 0;
  p.vx = o.vx || 0; p.vy = (o.vy || 0) * VY; p.vz = o.vz || 0;
  p.gy = (o.gy || 0) * VY; p.drag = o.drag || 0;
  p.max = p.life = o.life || 0.5;
  p.s0 = (o.s0 != null ? o.s0 : 1) * PSZ; p.s1 = (o.s1 != null ? o.s1 : (o.s0 != null ? o.s0 : 1)) * PSZ;
  p.rot = o.rot || 0; p.spin = o.spin || 0;
  p.a0 = o.a != null ? o.a : 1; p.fi = o.fi != null ? o.fi : 0.12; p.fp = o.fp != null ? o.fp : 1;
  p.f = o.f || 0; p.add = o.add !== false;
  const c = o.col || WHITE;
  p.r = c.r; p.g = c.g; p.b = c.b;
  p.swirl = o.swirl || 0; p.sx = o.sx || 0; p.sz = o.sz || 0; p.sr = o.sr || 0; p.sp = o.sp || 0;
  S.live.push(p);
  return p;
}

/**
 * The core of an effect: a soft-blended coloured mass that grows and fades. Additive alone only ever brightens
 * toward white, so a cool or dark spell needs this to keep its colour over bright grass.
 */
/**
 * Ask for a camera shake. FX owns no camera (src/world/camera.js is P09, the battle rig is P15), so the heavy
 * effects call this and whoever owns the camera answers — `install` routes it to the Bus as `fx.shake`.
 */
function shake(amp, ms) {
  S.shook++;
  if (S.shake) guard('shake', () => S.shake({ amp, ms }));
}

function bloom(x, y, z, colour, { r0 = 0.6, r1 = 2.6, life = 0.42, a = 0.85, add = false } = {}) {
  emit({ x, y, z, life, s0: r0, s1: r1, f: SHAPE.blob, col: colour, a, fi: 0.05, fp: 0.95, add });
}

const WHITE = C3(PAL.cloud.lit);
/** Cache C3() per hex — colours are created once, never per particle. */
const COL = new Map();
const col = (hex) => { let c = COL.get(hex); if (!c) { c = C3(hex); COL.set(hex, c); } return c; };
/** t is quantised to quarters so the colour cache stays five entries wide, not one per particle. */
const mix = (a, b, t) => col(mixHex(a, b, Math.round(Math.max(0, Math.min(1, t)) * 4) / 4));

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ground rings, light pillars, lightning ribbons
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
let ringGeo = null, pillarGeo = null, pillarAlpha = null;

function ringPool() {
  if (!ringGeo) { ringGeo = new THREE.RingGeometry(0.86, 1.0, 44); ringGeo.rotateX(-Math.PI / 2); }
  while (S.rings.length < 8) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(ringGeo, mat);
    m.name = 'fx-ring'; m.visible = false; m.frustumCulled = false; m.renderOrder = 9;
    S.rings.push({ mesh: m, mat, life: 0, max: 1, r0: 1, r1: 3, a0: 1, tilt: 0 });
    if (S.scene) S.scene.add(m);
  }
}
function ring(o) {
  ringPool();
  let R = S.rings.find((r) => r.life <= 0) || S.rings[0];
  R.life = R.max = o.life || 0.5;
  R.r0 = o.r0 != null ? o.r0 : 0.3; R.r1 = o.r1 != null ? o.r1 : 2.4; R.a0 = o.a != null ? o.a : 0.8;
  R.mat.color.copy(o.col || WHITE);
  // ADDITIVE can only brighten: over saturated grass a cool colour washes out to white. Cool rings blend soft.
  R.mat.blending = o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending;
  R.mesh.position.set(o.x || 0, (o.y || 0) + 0.06, o.z || 0);
  R.mesh.rotation.set(o.tilt || 0, o.spin || 0, 0);
  R.mesh.visible = true;
  return R;
}

function pillarPool() {
  if (!pillarGeo) {
    pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 26, 1, true);
    pillarGeo.translate(0, 0.5, 0);
    // three's alphaMap reads the GREEN channel, so the ramp must be an OPAQUE grey ramp, never an alpha ramp
    const c = mkCanvas(4, 64); const g = ctx2(c);
    g.fillStyle = '#000000'; g.fillRect(0, 0, 4, 64);
    const gr = g.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, 'rgb(255,255,255)'); gr.addColorStop(0.45, 'rgb(178,178,178)');
    gr.addColorStop(0.85, 'rgb(30,30,30)'); gr.addColorStop(1, 'rgb(0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
    pillarAlpha = texFrom(c, { srgb: false, aniso: 1 });
    pillarAlpha.wrapS = pillarAlpha.wrapT = THREE.ClampToEdgeWrapping;   // Repeat put a bright band on the top rim
    pillarAlpha.generateMipmaps = false;
    pillarAlpha.minFilter = THREE.LinearFilter;
    pillarAlpha.needsUpdate = true;
  }
  while (S.pillars.length < 2) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: pillarAlpha, transparent: true,
      opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(pillarGeo, mat);
    m.name = 'fx-pillar'; m.visible = false; m.frustumCulled = false; m.renderOrder = 9;
    S.pillars.push({ mesh: m, mat, life: 0, max: 1, h: 6, w: 1, a0: 0.9 });
    if (S.scene) S.scene.add(m);
  }
}
function pillar(o) {
  pillarPool();
  const P = S.pillars.find((p) => p.life <= 0) || S.pillars[0];
  P.life = P.max = o.life || 1.1;
  P.h = o.h || 6; P.w = o.w || 0.9; P.a0 = o.a != null ? o.a : 0.85;
  P.mat.color.copy(o.col || WHITE);
  P.mesh.position.set(o.x || 0, o.y || 0, o.z || 0);
  P.mesh.visible = true;
  return P;
}

const BOLT_SEG = 13;
function boltPool() {
  while (S.bolts.length < 3) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((BOLT_SEG + 1) * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < BOLT_SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'fx-bolt'; m.visible = false; m.frustumCulled = false; m.renderOrder = 10;
    S.bolts.push({ mesh: m, geo, mat, life: 0, max: 1, a0: 1 });
    if (S.scene) S.scene.add(m);
  }
}
/** A jagged ribbon from `from` down to `to`, facing the camera. */
function bolt(from, to, o = {}) {
  boltPool();
  const B = S.bolts.find((b) => b.life <= 0) || S.bolts[0];
  B.life = B.max = o.life || 0.26; B.a0 = o.a != null ? o.a : 1;
  B.mat.color.copy(o.col || WHITE);
  const w = o.w || 0.22;
  // the ribbon widens across the camera's right, so it reads from every angle
  const right = new THREE.Vector3(1, 0, 0);
  if (S.camera) { right.set(0, 0, 0).setFromMatrixColumn(S.camera.matrixWorld, 0).normalize(); }
  const arr = B.geo.getAttribute('position');
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  let jx = 0, jz = 0;
  for (let i = 0; i <= BOLT_SEG; i++) {
    const t = i / BOLT_SEG;
    const k = Math.sin(t * Math.PI);                       // no wobble at either end
    jx = (rnd() - 0.5) * 0.9 * k * (o.jag || 1);
    jz = (rnd() - 0.5) * 0.9 * k * (o.jag || 1);
    const x = from.x + dx * t + jx, y = from.y + dy * t, z = from.z + dz * t + jz;
    const hw = w * (0.45 + 0.9 * k);
    arr.setXYZ(i * 2, x - right.x * hw, y - right.y * hw, z - right.z * hw);
    arr.setXYZ(i * 2 + 1, x + right.x * hw, y + right.y * hw, z + right.z * hw);
  }
  arr.needsUpdate = true;
  B.mesh.visible = true;
  return B;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the screen flash (DOM — it must cover the whole game, including the UI)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function flashEl() {
  if (S.flashEl && S.flashEl.isConnected) return S.flashEl;
  return guard('flash element', () => {
    const host = document.getElementById('ui-root') || document.body;
    const el = document.createElement('div');
    el.className = 'dq-fx-flash';
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;z-index:40;background:#fff;' +
      'mix-blend-mode:screen;transition:opacity 260ms ease-out';
    host.appendChild(el);
    S.flashEl = el;
    return el;
  }) || null;
}
function screenFlash(hex, peak = 0.62, ms = 260) {
  if (!S.flash || S.flashOff) return;                       // {flash: false} — a demo grid firing 25 effects at once
  const el = flashEl();
  if (!el) return;
  guard('flash', () => {
    el.style.transition = 'none';
    el.style.background = hex;
    el.style.opacity = String(peak);
    // next frame: fade it back out
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = `opacity ${ms}ms ease-out`;
      el.style.opacity = '0';
    }));
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the effects
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Palette shorthands so no hex is ever written here (ARCHITECTURE: colour comes from palette.js). */
const K = {
  // FIRE. Every flame body is drawn SOFT (never additive) in these three oranges and rimmed with fireEdge, because
  // additive orange over bright grass only ever climbs toward white — which is how the whole school used to read as
  // a pale lemon flower. Yellow is the small hot core, not the fire.
  fireCore: PAL.flower.yellow, fireMid: PAL.tile.light, fireDeep: PAL.tile.mid, fireDark: PAL.tile.dark,
  fireEdge: PAL.ink.tileShadow, ember: PAL.paint.gold,
  smoke: PAL.stone.dark, ash: PAL.stone.mid,
  iceCore: PAL.snow.light, iceMid: PAL.snow.ice, iceDeep: PAL.water.mid,
  boltCore: PAL.cloud.lit, boltMid: PAL.ui.mp, boltDeep: PAL.sky.zenith,
  windCore: PAL.cloud.lit, windMid: PAL.hill.nearHaze, windDeep: PAL.foliage.sun,
  holyCore: PAL.cloud.lit, holyMid: PAL.light.sun, holyDeep: PAL.ui.gold,
  // HEAL reads WHITE-cored with mint rings and gold glints: a green sparkle on green grass is invisible.
  healCore: PAL.flower.white, healMid: PAL.ui.hp, healDeep: PAL.paint.gold,
  buffCore: PAL.cloud.lit, buffMid: PAL.ui.mp, buffDeep: PAL.sky.upper,
  hexCore: PAL.cloth.pink, hexMid: PAL.cloth.purple, hexDeep: PAL.cloth.purpleDark,
  // POISON is purple with a sickly lime glint — the old foliage greens were the same colour as the meadow.
  poisonCore: PAL.ui.purple, poisonMid: PAL.cloth.purple, poisonDeep: PAL.cloth.purpleDark,
  poisonGlint: PAL.foliage.sun,
  dust: PAL.dirt.pebble, dustMid: PAL.dirt.light, dustDeep: PAL.dirt.dark,
  waterCore: PAL.water.foam, waterMid: PAL.water.light, waterDeep: PAL.water.mid,
  // VINES are woody brown with bright leaf tips, for the same reason.
  leaf: PAL.bark.mid, leafDeep: PAL.bark.dark, leafEdge: PAL.bark.furrow, leafTip: PAL.foliage.sun,
  lamp: PAL.interior.lamp, glow: PAL.cave.glow,
  poofCore: PAL.cloud.lit, poofMid: PAL.cloud.mid, poofDeep: PAL.cloud.shade,
};

/**
 * An OUTLINED billboard: a slightly larger near-black copy of the same quad, emitted first so the soft batch draws
 * it behind, then the coloured body on top. This is what makes an effect read in the locked house style (chunky,
 * rimmed) instead of dissolving into whatever it is standing on. `o` is a normal emit() spec plus:
 *   edge   the rim colour        grow  how much bigger the rim is (default 1.32)
 */
function outlined(o, edge, grow = 1.32) {
  const rim = Object.assign({}, o);
  rim.s0 = (o.s0 != null ? o.s0 : 1) * grow;
  rim.s1 = (o.s1 != null ? o.s1 : rim.s0 / grow) * (grow + 0.16);
  rim.col = edge;
  rim.add = false;
  rim.a = (o.a != null ? o.a : 1) * 0.94;
  emit(rim);
  const body = Object.assign({}, o);
  body.add = false;                       // the body of an outlined shape is never additive: see K.fireCore
  emit(body);
}

/**
 * Every effect: `ms` is how long it runs, `peak` when its hit frame lands (both ms), `sfx` the sound that
 * belongs with it, `build(o)` what it emits. `o` = {x, y, z, s (scale), dx, dz (unit direction), c (tint or null)}.
 */
export const EFFECTS = {

  // ── fire ────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * A DQ fireball: a dark-rimmed orange flower of flame licks with a small hot yellow heart, a scatter of gold
   * embers and a scorch ring. Measured at its peak on the demo meadow it is ~70% orange/red of the non-ground
   * pixels; the old additive build was 52% yellow / 48% white with no orange at all.
   */
  fire_burst: { ms: 700, peak: 90, sfx: 'fire', build(o) {
    const { x, y, z, s } = o;
    const edge = col(K.fireEdge);
    // Author the licks first so the rim and the body of each one share exactly the same flight.
    const licks = [];
    for (let i = 0; i < 14; i++) {
      const a = rr(0, TAU), r = rr(0, 0.45) * s;
      licks.push({ x: x + Math.cos(a) * r, y: y + rr(-0.12, 0.3) * s, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * rr(0.45, 1.7) * s, vy: rr(1.4, 3.3) * s, vz: Math.sin(a) * rr(0.45, 1.7) * s,
        gy: -1.6 * s, drag: 2.4, life: rr(0.34, 0.56), s0: rr(0.9, 1.6) * s, s1: rr(0.24, 0.5) * s,
        rot: rr(-0.35, 0.35), spin: rr(-2.6, 2.6), f: SHAPE.flame, a: 1, fi: 0.05,
        col: i < 2 ? col(K.fireCore) : i < 8 ? col(K.fireMid) : i < 12 ? col(K.fireDeep) : col(K.fireDark) });
    }
    // the hot heart, behind the licks so yellow only ever peeks between them
    emit({ x, y: y + 0.3 * s, z, life: 0.24, s0: 0.42 * s, s1: 1.0 * s, f: SHAPE.blob,
      col: col(K.fireCore), a: 0.9, fi: 0.02, add: false });
    for (const L of licks) outlined(L, edge);
    for (let i = 0; i < 7; i++) {
      const a = rr(0, TAU);
      emit({ x, y: y + 0.2 * s, z, vx: Math.cos(a) * rr(1.5, 4) * s, vy: rr(1.2, 3.4) * s, vz: Math.sin(a) * rr(1.5, 4) * s,
        gy: -5 * s, drag: 1.2, life: rr(0.35, 0.6), s0: rr(0.14, 0.26) * s, s1: 0.02, spin: rr(-6, 6),
        f: SHAPE.spark, col: col(K.ember), a: 1, fi: 0.02 });
    }
    for (let i = 0; i < 5; i++) {
      const a = rr(0, TAU);
      emit({ x: x + Math.cos(a) * 0.4 * s, y: y + 0.5 * s, z: z + Math.sin(a) * 0.4 * s,
        vx: Math.cos(a) * 0.5 * s, vy: rr(0.9, 1.5) * s, vz: Math.sin(a) * 0.5 * s, drag: 1.4,
        life: rr(0.6, 0.95), s0: rr(0.5, 0.8) * s, s1: rr(1.4, 2.1) * s, spin: rr(-1.2, 1.2),
        f: SHAPE.smoke, add: false, a: 0.42, fi: 0.2, fp: 1.6, col: mix(K.smoke, K.ash, rnd()) });
    }
    // the scorch ring blends SOFT: additive over saturated grass turned it yellow-green
    ring({ x, y, z, life: 0.34, r0: 0.25 * s, r1: 1.5 * s, a: 0.8, add: false, col: col(K.fireDeep) });
  } },

  fire_big: { ms: 1000, peak: 120, sfx: 'fire', build(o) {
    const { x, y, z, s } = o;
    const edge = col(K.fireEdge);
    EFFECTS.fire_burst.build({ x, y, z, s: s * 1.25 });
    for (let i = 0; i < 13; i++) {
      const a = rr(0, TAU), r = rr(0.3, 1.35) * s;
      outlined({ x: x + Math.cos(a) * r, y: y + rr(0, 0.4) * s, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * rr(0.3, 1.2) * s, vy: rr(2.2, 4.6) * s, vz: Math.sin(a) * rr(0.3, 1.2) * s,
        gy: -1.2 * s, drag: 1.6, life: rr(0.45, 0.75), s0: rr(1.3, 2.3) * s, s1: rr(0.3, 0.7) * s,
        spin: rr(-2, 2), f: SHAPE.flame, a: 1, fi: 0.08,
        col: i % 4 === 0 ? col(K.fireMid) : i % 4 === 3 ? col(K.fireDark) : col(K.fireDeep) }, edge);
    }
    ring({ x, y, z, life: 0.46, r0: 0.4 * s, r1: 2.8 * s, a: 0.8, add: false, col: col(K.fireDark) });
    // a WARM flash, not a white one: #fff at mix-blend screen bleached the whole frame
    screenFlash(PAL.tile.mid, 0.26, 320);
    shake(0.5 * s, 260);
  } },

  // ── ice ─────────────────────────────────────────────────────────────────────────────────────────────────
  ice_shards: { ms: 720, peak: 210, sfx: 'ice', build(o) {
    const { x, y, z, s } = o;
    // splinters rush IN, then shatter outward — the DQ "Crack!" read
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU + rr(-0.2, 0.2), R = rr(1.8, 2.8) * s;
      emit({ x: x + Math.cos(a) * R, y: y + rr(0.2, 1.6) * s, z: z + Math.sin(a) * R,
        vx: -Math.cos(a) * R * 4.2, vy: rr(-0.4, 0.4), vz: -Math.sin(a) * R * 4.2, drag: 1.2,
        life: 0.26, s0: rr(0.7, 1.2) * s, s1: rr(0.5, 0.9) * s, rot: a + Math.PI / 2, spin: rr(-1, 1),
        f: SHAPE.shard, a: 1, fi: 0.1, add: false, col: i % 3 ? col(K.iceMid) : col(K.iceDeep) });
    }
    for (let i = 0; i < 14; i++) {
      const a = rr(0, TAU);
      emit({ x, y: y + rr(0.1, 0.9) * s, z, vx: Math.cos(a) * rr(1.2, 3.4) * s, vy: rr(0.6, 2.6) * s, vz: Math.sin(a) * rr(1.2, 3.4) * s,
        gy: -4.2 * s, drag: 1.1, life: rr(0.38, 0.65), s0: rr(0.45, 0.9) * s, s1: rr(0.12, 0.28) * s,
        rot: rr(0, TAU), spin: rr(-7, 7), f: SHAPE.shard, a: 1, fi: 0.02, add: i % 4 === 0,
        col: i % 4 === 0 ? col(K.iceCore) : i % 4 === 1 ? col(K.iceDeep) : col(K.iceMid) });
    }
    for (let i = 0; i < 8; i++) {
      const a = rr(0, TAU);
      emit({ x: x + Math.cos(a) * rr(0, 0.9) * s, y: y + rr(0, 1.2) * s, z: z + Math.sin(a) * rr(0, 0.9) * s,
        vy: rr(0.2, 0.7) * s, drag: 1.6, life: rr(0.5, 0.8), s0: rr(0.1, 0.2) * s, s1: 0.02,
        f: SHAPE.star, col: col(K.iceCore), a: 0.9, fi: 0.15 });
    }
    bloom(x, y + 0.55 * s, z, col(K.iceMid), { r0: 0.8 * s, r1: 3.1 * s, life: 0.5, a: 0.95 });
    emit({ x, y: y + 0.5 * s, z, life: 0.26, s0: 0.5 * s, s1: 1.6 * s, f: SHAPE.blob, col: col(K.iceCore), a: 0.75, fi: 0.02 });
    ring({ x, y, z, life: 0.38, r0: 0.3 * s, r1: 1.6 * s, a: 0.75, add: false, col: col(K.iceMid) });
  } },

  frost: { ms: 1000, peak: 240, sfx: 'ice', build(o) {
    const { x, y, z, s } = o;
    EFFECTS.ice_shards.build({ x, y, z, s });
    // a wide creeping ground frost plus a slow glitter fall
    ring({ x, y, z, life: 0.7, r0: 0.6 * s, r1: 2.8 * s, a: 0.5, add: false, col: col(K.iceMid) });
    for (let i = 0; i < 22; i++) {
      const a = rr(0, TAU), R = rr(0.4, 4.2) * s;
      emit({ x: x + Math.cos(a) * R, y: y + rr(1.6, 3.4) * s, z: z + Math.sin(a) * R,
        vy: -rr(0.5, 1.3) * s, vx: rr(-0.2, 0.2), vz: rr(-0.2, 0.2), drag: 0.4,
        life: rr(0.7, 1.0), s0: rr(0.09, 0.2) * s, s1: rr(0.04, 0.09) * s, spin: rr(-2, 2),
        f: SHAPE.star, col: i % 2 ? col(K.iceCore) : col(K.iceMid), a: 0.9, fi: 0.2, fp: 1.4 });
    }
    bloom(x, y + 0.7 * s, z, col(K.iceMid), { r0: 1.4 * s, r1: 4.8 * s, life: 0.7, a: 0.8 });
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * TAU;
      emit({ x: x + Math.cos(a) * 1.5 * s, y, z: z + Math.sin(a) * 1.5 * s, vy: 1.6 * s, drag: 3.4,
        life: 0.75, s0: 0.14 * s, s1: rr(1.5, 2.4) * s, rot: rr(-0.3, 0.3), f: SHAPE.shard,
        col: i % 2 ? col(K.iceCore) : col(K.iceMid), a: 0.95, fi: 0.08, fp: 1.5, add: false });
    }
    screenFlash(PAL.snow.ice, 0.2, 380);
    shake(0.3 * s, 220);
  } },

  // ── lightning ───────────────────────────────────────────────────────────────────────────────────────────
  lightning: { ms: 640, peak: 40, sfx: 'lightning', build(o) {
    const { x, y, z, s } = o;
    const top = { x: x + rr(-0.6, 0.6), y: y + 9 * s, z: z + rr(-0.6, 0.6) };
    bolt(top, { x, y: y + 0.1, z }, { life: 0.3, w: 0.3 * s, col: col(K.boltCore), jag: s });
    setTimeout(() => guard('bolt echo', () => bolt({ x: x + rr(-1, 1), y: y + 8 * s, z: z + rr(-1, 1) }, { x, y: y + 0.1, z },
      { life: 0.2, w: 0.16 * s, col: col(K.boltMid), jag: s * 1.3 })), 90);
    screenFlash(PAL.cloud.lit, 0.5, 220);
    shake(0.7 * s, 240);
    for (let i = 0; i < 18; i++) {
      const a = rr(0, TAU);
      emit({ x, y: y + 0.1, z, vx: Math.cos(a) * rr(2, 6.5) * s, vy: rr(1.5, 5) * s, vz: Math.sin(a) * rr(2, 6.5) * s,
        gy: -8 * s, drag: 1.4, life: rr(0.25, 0.45), s0: rr(0.16, 0.34) * s, s1: 0.02, spin: rr(-9, 9),
        f: SHAPE.spark, col: i % 3 ? col(K.boltCore) : col(K.boltMid), a: 1, fi: 0.02 });
    }
    for (let i = 0; i < 5; i++) {
      emit({ x: x + rr(-0.5, 0.5) * s, y: y + rr(0.4, 3.5) * s, z: z + rr(-0.5, 0.5) * s,
        life: rr(0.18, 0.32), s0: rr(1.1, 2.0) * s, s1: rr(0.3, 0.7) * s, rot: rr(-0.5, 0.5),
        f: SHAPE.bolt, col: col(K.boltCore), a: 1, fi: 0.02 });
    }
    emit({ x, y: y + 0.4 * s, z, life: 0.28, s0: 0.6 * s, s1: 2.4 * s, f: SHAPE.blob, col: col(K.boltMid), a: 0.85, fi: 0.02 });
    ring({ x, y, z, life: 0.34, r0: 0.2 * s, r1: 2.2 * s, a: 0.7, col: col(K.boltMid) });
  } },

  // ── wind ────────────────────────────────────────────────────────────────────────────────────────────────
  wind_slash: { ms: 620, peak: 120, sfx: 'wind', build(o) {
    const { x, y, z, s, dx, dz } = o;
    const px = -dz, pz = dx;                                  // across the direction of travel
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 0.55 * s, d = -1.8 * s;
      emit({ x: x + px * off - dx * d, y: y + 0.5 * s + i * 0.35 * s, z: z + pz * off - dz * d,
        vx: dx * 8.5 * s, vy: 0, vz: dz * 8.5 * s, drag: 1.4,
        life: 0.44, s0: rr(1.4, 2.1) * s, s1: rr(2.0, 2.7) * s, rot: Math.atan2(dx, dz) + Math.PI / 2 + rr(-0.25, 0.25),
        spin: rr(-1, 1), f: SHAPE.arc, col: i === 1 ? col(K.windCore) : col(K.windMid), a: 0.95, fi: 0.05, add: false });
    }
    for (let i = 0; i < 20; i++) {
      const off = rr(-1.3, 1.3) * s;
      emit({ x: x + px * off - dx * rr(0.5, 2.6) * s, y: y + rr(0, 1.7) * s, z: z + pz * off - dz * rr(0.5, 2.6) * s,
        vx: dx * rr(5, 12) * s + rr(-0.6, 0.6), vy: rr(-0.3, 1.2), vz: dz * rr(5, 12) * s + rr(-0.6, 0.6),
        drag: 1.9, life: rr(0.38, 0.6), s0: rr(0.16, 0.38) * s, s1: rr(0.05, 0.12) * s, spin: rr(-4, 4),
        f: i % 4 === 0 ? SHAPE.leaf : SHAPE.mote, col: i % 5 === 0 ? col(K.windDeep) : col(K.windCore), a: 0.8, fi: 0.08 });
    }
    ring({ x, y, z, life: 0.42, r0: 0.4 * s, r1: 1.8 * s, a: 0.35, add: false, col: col(K.windDeep),
      tilt: Math.PI / 2.6, spin: Math.atan2(dx, dz) });
  } },

  // ── holy / healing / buffs ──────────────────────────────────────────────────────────────────────────────
  holy_light: { ms: 1100, peak: 260, sfx: 'heal', build(o) {
    const { x, y, z, s } = o;
    pillar({ x, y, z, life: 0.95, h: 7 * s, w: 0.95 * s, a: 0.7, col: col(K.holyMid) });
    for (let i = 0; i < 22; i++) {
      const a = rr(0, TAU), R = rr(0.1, 1.0) * s;
      emit({ x: x + Math.cos(a) * R, y: y + rr(0, 0.6) * s, z: z + Math.sin(a) * R,
        vy: rr(2.2, 5.0) * s, vx: Math.cos(a) * 0.3, vz: Math.sin(a) * 0.3, drag: 0.9,
        life: rr(0.55, 0.95), s0: rr(0.14, 0.34) * s, s1: rr(0.03, 0.1) * s, spin: rr(-2.5, 2.5),
        f: i % 3 ? SHAPE.star : SHAPE.spark, col: i % 4 ? col(K.holyCore) : col(K.holyDeep), a: 1, fi: 0.1, fp: 1.3 });
    }
    emit({ x, y: y + 0.8 * s, z, life: 0.5, s0: 0.6 * s, s1: 2.2 * s, f: SHAPE.blob, col: col(K.holyMid), a: 0.7, fi: 0.08, fp: 1.4 });
    emit({ x, y: y + 0.8 * s, z, life: 0.6, s0: 0.3 * s, s1: 1.8 * s, f: SHAPE.star, col: col(K.holyCore), a: 0.95, fi: 0.06, fp: 1.6 });
    ring({ x, y, z, life: 0.6, r0: 0.3 * s, r1: 2.0 * s, a: 0.5, col: col(K.holyDeep) });
    screenFlash(PAL.light.sun, 0.22, 420);
  } },

  /**
   * DQ healing: a ring gathers at the feet, three hoops of light climb the body and white-gold sparkles rise out
   * of the top. The hoops are the whole point — a shower of green sparkles over a green meadow was 556 pixels.
   */
  heal_sparkle: { ms: 950, peak: 200, sfx: 'heal', build(o) {
    const { x, y, z, s } = o;
    // three hoops of light rising up the ally, soft-blended so the mint survives over grass
    for (let i = 0; i < 3; i++) {
      emit({ x, y: y + 0.12 * s, z, vy: rr(2.2, 2.9) * s, drag: 0.25,
        life: 0.5 + i * 0.12, s0: (1.35 + i * 0.18) * s, s1: (1.9 + i * 0.26) * s, f: SHAPE.ring,
        col: i === 1 ? col(K.healCore) : col(K.healMid), a: 0.95, fi: 0.05, fp: 1.1, add: false });
    }
    for (let i = 0; i < 24; i++) {
      const a = rr(0, TAU), R = rr(0.25, 1.0) * s;
      emit({ x: x + Math.cos(a) * R, y: y + rr(-0.1, 0.2) * s, z: z + Math.sin(a) * R,
        vy: rr(1.6, 3.4) * s, drag: 0.7, swirl: rr(1.6, 3.4) * (rnd() < 0.5 ? -1 : 1), sx: x, sz: z, sr: R, sp: a,
        life: rr(0.55, 0.9), s0: rr(0.26, 0.5) * s, s1: rr(0.06, 0.16) * s, spin: rr(-3, 3),
        f: i % 3 === 0 ? SHAPE.spark : SHAPE.star, a: 1, fi: 0.1, fp: 1.2,
        col: i % 4 === 0 ? col(K.healDeep) : i % 2 === 0 ? col(K.healCore) : col(K.healMid) });
    }
    for (let i = 0; i < 6; i++) {
      emit({ x: x + rr(-0.5, 0.5) * s, y: y + rr(0.2, 1.6) * s, z: z + rr(-0.5, 0.5) * s,
        vy: rr(0.6, 1.2) * s, drag: 1.2, life: rr(0.5, 0.8), s0: rr(0.4, 0.75) * s, s1: rr(0.8, 1.4) * s,
        f: SHAPE.blob, col: col(K.healCore), a: 0.55, fi: 0.2, fp: 1.5, add: false });
    }
    bloom(x, y + 0.9 * s, z, col(K.healCore), { r0: 1.0 * s, r1: 3.0 * s, life: 0.6, a: 0.85 });
    bloom(x, y + 0.9 * s, z, col(K.healMid), { r0: 0.6 * s, r1: 2.0 * s, life: 0.55, a: 0.6 });
    ring({ x, y, z, life: 0.6, r0: 1.7 * s, r1: 0.35 * s, a: 0.9, add: false, col: col(K.healMid) });
  } },

  buff_aura: { ms: 900, peak: 180, sfx: 'buff', build(o) {
    const { x, y, z, s } = o;
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * TAU * 2, R = rr(0.6, 1.0) * s;
      emit({ x: x + Math.cos(a) * R, y: y + rr(-0.2, 0.1) * s, z: z + Math.sin(a) * R,
        vy: rr(1.8, 3.2) * s, drag: 0.6, swirl: 4.4, sx: x, sz: z, sr: R, sp: a,
        life: rr(0.5, 0.8), s0: rr(0.2, 0.38) * s, s1: rr(0.05, 0.14) * s, spin: rr(-2, 2),
        f: i % 4 === 0 ? SHAPE.spark : SHAPE.mote, a: 0.95, fi: 0.1, fp: 1.2,
        col: i % 3 === 0 ? col(K.buffCore) : col(K.buffMid) });
    }
    for (let i = 0; i < 3; i++) {
      ring({ x, y: y + i * 0.5 * s, z, life: 0.55 + i * 0.08, r0: 1.5 * s, r1: 0.7 * s, a: 0.55, col: col(K.buffMid) });
    }
    bloom(x, y + 0.9 * s, z, col(K.buffMid), { r0: 0.7 * s, r1: 2.8 * s, life: 0.55, a: 0.68 });
    emit({ x, y: y + 0.9 * s, z, life: 0.45, s0: 0.4 * s, s1: 2.2 * s, f: SHAPE.blob, col: col(K.buffCore), a: 0.5, fi: 0.1, fp: 1.5 });
  } },

  debuff_aura: { ms: 900, peak: 180, sfx: 'debuff', build(o) {
    const { x, y, z, s } = o;
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * TAU * 2, R = rr(0.5, 1.1) * s;
      emit({ x: x + Math.cos(a) * R, y: y + rr(1.6, 2.4) * s, z: z + Math.sin(a) * R,
        vy: -rr(1.6, 2.8) * s, drag: 0.6, swirl: -3.8, sx: x, sz: z, sr: R, sp: a,
        life: rr(0.5, 0.85), s0: rr(0.2, 0.4) * s, s1: rr(0.06, 0.16) * s, spin: rr(-3, 3),
        f: i % 4 === 0 ? SHAPE.mote : SHAPE.smoke, a: 0.92, fi: 0.1, fp: 1.2, add: i % 4 === 0,
        col: i % 3 === 0 ? col(K.hexCore) : i % 3 === 1 ? col(K.hexMid) : col(K.hexDeep) });
    }
    for (let i = 0; i < 3; i++) {
      ring({ x, y: y + (2 - i) * 0.55 * s, z, life: 0.5 + i * 0.08, r0: 0.7 * s, r1: 1.7 * s, a: 0.6, add: false, col: col(K.hexMid) });
    }
    emit({ x, y: y + 0.7 * s, z, life: 0.5, s0: 2.0 * s, s1: 0.5 * s, f: SHAPE.blob, col: col(K.hexDeep), a: 0.5, fi: 0.1, fp: 1.4, add: false });
  } },

  chime_ring: { ms: 700, peak: 60, sfx: 'buff', build(o) {
    const { x, y, z, s } = o;
    for (let i = 0; i < 3; i++) {
      emit({ x, y: y + 1.0 * s, z, life: 0.45 + i * 0.09, s0: 0.3 * s, s1: (2.4 + i * 0.9) * s,
        f: SHAPE.ring, col: i ? col(K.holyMid) : col(K.holyCore), a: 0.85, fi: 0.04, fp: 1.4 });
    }
    for (let i = 0; i < 10; i++) {
      const a = rr(0, TAU);
      emit({ x: x + Math.cos(a) * 0.5 * s, y: y + 1.0 * s + rr(-0.3, 0.3) * s, z: z + Math.sin(a) * 0.5 * s,
        vx: Math.cos(a) * rr(1, 2.6) * s, vy: rr(0.3, 1.4) * s, vz: Math.sin(a) * rr(1, 2.6) * s, drag: 2.2,
        life: rr(0.35, 0.6), s0: rr(0.12, 0.26) * s, s1: 0.02, spin: rr(-4, 4),
        f: SHAPE.star, col: col(K.holyCore), a: 1, fi: 0.06 });
    }
  } },

  // ── mischief ────────────────────────────────────────────────────────────────────────────────────────────
  sleep_z: { ms: 1500, peak: 120, sfx: 'debuff', build(o) {
    const { x, y, z, s } = o;
    for (let i = 0; i < 4; i++) {
      const d = i * 0.24;
      emit({ x: x + rr(-0.15, 0.15) * s, y: y + 1.5 * s, z: z + rr(-0.15, 0.15) * s,
        vx: rr(0.25, 0.55) * s, vy: rr(0.55, 0.8) * s, vz: rr(-0.15, 0.15) * s, drag: 0.15,
        life: 1.0 + d, s0: (0.48 + i * 0.12) * s, s1: (0.7 + i * 0.16) * s,
        rot: rr(-0.25, 0.25), spin: rr(-0.5, 0.5), f: SHAPE.zed, add: false,
        col: i % 2 ? col(PAL.cloud.lit) : col(K.buffMid), a: 1, fi: 0.18, fp: 1.6 });
    }
    for (let i = 0; i < 6; i++) {
      emit({ x: x + rr(-0.5, 0.5) * s, y: y + rr(1.0, 1.8) * s, z: z + rr(-0.5, 0.5) * s,
        vy: rr(0.3, 0.7) * s, drag: 0.5, life: rr(0.7, 1.1), s0: rr(0.1, 0.2) * s, s1: 0.03,
        f: SHAPE.mote, col: col(K.buffMid), a: 0.7, fi: 0.2, fp: 1.4 });
    }
  } },

  confusion_birds: { ms: 1600, peak: 140, sfx: 'debuff', build(o) {
    const { x, y, z, s } = o;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU, R = 0.85 * s;
      emit({ x: x + Math.cos(a) * R, y: y + 1.75 * s, z: z + Math.sin(a) * R,
        vy: 0, drag: 0, swirl: 5.6, sx: x, sz: z, sr: R, sp: a,
        life: 1.35, s0: 0.78 * s, s1: 0.78 * s, rot: 0, spin: 0, f: SHAPE.bird, add: false,
        col: i % 2 ? col(PAL.flower.yellow) : col(PAL.cloth.pink), a: 1, fi: 0.12, fp: 1.2 });
    }
    for (let i = 0; i < 8; i++) {
      const a = rr(0, TAU);
      emit({ x: x + Math.cos(a) * 0.9 * s, y: y + 1.75 * s + rr(-0.3, 0.3) * s, z: z + Math.sin(a) * 0.9 * s,
        vy: rr(-0.2, 0.4), drag: 0.8, life: rr(0.6, 1.2), s0: rr(0.12, 0.24) * s, s1: 0.04,
        f: SHAPE.star, col: col(PAL.flower.white), a: 0.9, fi: 0.15, fp: 1.3 });
    }
    bloom(x, y + 1.75 * s, z, col(PAL.cloth.pink), { r0: 0.9 * s, r1: 2.2 * s, life: 0.8, a: 0.45 });
  } },

  /** Purple bubbles with a lime glint, each rimmed dark. (Sickly green bubbles on a green meadow were invisible.) */
  poison_bubbles: { ms: 1200, peak: 200, sfx: 'poison', build(o) {
    const { x, y, z, s } = o;
    const edge = col(K.poisonDeep);
    for (let i = 0; i < 11; i++) {
      const a = rr(0, TAU), R = rr(0, 0.6) * s;
      outlined({ x: x + Math.cos(a) * R, y: y + rr(0, 0.3) * s, z: z + Math.sin(a) * R,
        vx: rr(-0.25, 0.25), vy: rr(0.9, 2.0) * s, vz: rr(-0.25, 0.25), drag: 0.35,
        life: rr(0.6, 1.05), s0: rr(0.34, 0.68) * s, s1: rr(0.46, 0.9) * s, spin: rr(-1, 1),
        f: SHAPE.bubble, a: 1, fi: 0.12, fp: 2.2,
        col: i % 4 === 0 ? col(K.poisonGlint) : i % 2 === 0 ? col(K.poisonCore) : col(K.poisonMid) }, edge, 1.2);
    }
    for (let i = 0; i < 8; i++) {
      const a = rr(0, TAU);
      emit({ x: x + Math.cos(a) * rr(0, 0.8) * s, y: y + rr(0, 0.5) * s, z: z + Math.sin(a) * rr(0, 0.8) * s,
        vy: rr(0.2, 0.7) * s, drag: 1.1, life: rr(0.6, 1.0), s0: rr(0.4, 0.8) * s, s1: rr(0.8, 1.4) * s,
        f: SHAPE.smoke, add: false, a: 0.6, fi: 0.2, fp: 1.5, col: col(K.poisonMid) });
    }
    bloom(x, y + 0.7 * s, z, col(K.poisonMid), { r0: 0.9 * s, r1: 2.6 * s, life: 0.68, a: 0.9 });
    ring({ x, y, z, life: 0.7, r0: 0.3 * s, r1: 1.9 * s, a: 0.8, add: false, col: col(K.poisonDeep) });
  } },

  /** Tanglefoot: woody brown vines with bright leaf tips, rimmed dark, out of a scuff of earth. */
  root_vines: { ms: 900, peak: 160, sfx: 'debuff', build(o) {
    const { x, y, z, s } = o;
    const edge = col(K.leafEdge);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU, R = 0.55 * s;
      outlined({ x: x + Math.cos(a) * R, y, z: z + Math.sin(a) * R,
        vy: rr(2.4, 4.0) * s, drag: 3.6, swirl: 2.2, sx: x, sz: z, sr: R, sp: a,
        life: rr(0.5, 0.78), s0: 0.2 * s, s1: rr(1.05, 1.6) * s, rot: rr(-0.4, 0.4), spin: rr(-1.5, 1.5),
        f: SHAPE.leaf, a: 1, fi: 0.08, fp: 1.6,
        col: i % 3 === 0 ? col(K.leafTip) : i % 3 === 1 ? col(K.leaf) : col(K.leafDeep) }, edge, 1.26);
    }
    for (let i = 0; i < 8; i++) {
      const a = rr(0, TAU);
      emit({ x, y: y + 0.05, z, vx: Math.cos(a) * rr(1, 2.6) * s, vy: rr(0.4, 1.4) * s, vz: Math.sin(a) * rr(1, 2.6) * s,
        gy: -4 * s, drag: 1.5, life: rr(0.3, 0.55), s0: rr(0.2, 0.38) * s, s1: 0.03, spin: rr(-5, 5),
        f: SHAPE.puff, add: false, col: col(K.dust), a: 0.85, fi: 0.05 });
    }
    bloom(x, y + 0.5 * s, z, col(K.leafDeep), { r0: 0.8 * s, r1: 2.2 * s, life: 0.55, a: 0.8 });
    ring({ x, y, z, life: 0.5, r0: 0.2 * s, r1: 1.4 * s, a: 0.85, add: false, col: col(K.leafEdge) });
  } },

  // ── the world ───────────────────────────────────────────────────────────────────────────────────────────
  screen_flash: { ms: 320, peak: 0, sfx: null, build(o) {
    screenFlash(o.hex || PAL.cloud.lit, o.peakA != null ? o.peakA : 0.7, o.fade || 300);
  } },

  shockwave: { ms: 600, peak: 30, sfx: 'sword_crit', build(o) {
    const { x, y, z, s } = o;
    shake(0.6 * s, 200);
    ring({ x, y, z, life: 0.3, r0: 0.25 * s, r1: 2.0 * s, a: 0.7, col: col(PAL.cloud.lit) });
    ring({ x, y, z, life: 0.38, r0: 0.1 * s, r1: 1.3 * s, a: 0.55, col: col(K.ember) });
    for (let i = 0; i < 14; i++) {
      const a = rr(0, TAU);
      emit({ x: x + Math.cos(a) * 0.3 * s, y: y + 0.08, z: z + Math.sin(a) * 0.3 * s,
        vx: Math.cos(a) * rr(3.5, 7) * s, vy: rr(0.4, 1.6) * s, vz: Math.sin(a) * rr(3.5, 7) * s,
        gy: -5 * s, drag: 2.4, life: rr(0.25, 0.45), s0: rr(0.2, 0.45) * s, s1: rr(0.4, 0.8) * s,
        f: SHAPE.puff, add: false, col: col(K.dust), a: 0.6, fi: 0.05, fp: 1.4 });
    }
  } },

  smoke_puff: { ms: 1100, peak: 40, sfx: null, build(o) {
    const { x, y, z, s } = o;
    for (let i = 0; i < 9; i++) {
      const a = rr(0, TAU);
      emit({ x: x + Math.cos(a) * rr(0, 0.35) * s, y: y + rr(0, 0.3) * s, z: z + Math.sin(a) * rr(0, 0.35) * s,
        vx: Math.cos(a) * rr(0.3, 1.1) * s, vy: rr(0.7, 1.6) * s, vz: Math.sin(a) * rr(0.3, 1.1) * s, drag: 1.3,
        life: rr(0.7, 1.05), s0: rr(0.35, 0.65) * s, s1: rr(1.2, 1.9) * s, spin: rr(-1.4, 1.4),
        f: i % 3 === 0 ? SHAPE.puff : SHAPE.smoke, add: false, a: 0.72, fi: 0.15, fp: 1.5,
        col: mix(K.smoke, K.ash, rnd()) });
    }
  } },

  defeat_poof: { ms: 800, peak: 50, sfx: 'monster_defeat', build(o) {
    const { x, y, z, s } = o;
    for (let i = 0; i < 16; i++) {
      const a = rr(0, TAU), e = rr(-0.3, 1.1);
      emit({ x, y: y + 0.55 * s, z,
        vx: Math.cos(a) * Math.cos(e) * rr(2.2, 5.0) * s, vy: Math.sin(e) * rr(2.0, 4.4) * s, vz: Math.sin(a) * Math.cos(e) * rr(2.2, 5.0) * s,
        gy: -2.2 * s, drag: 2.6, life: rr(0.4, 0.65), s0: rr(0.4, 0.75) * s, s1: rr(0.7, 1.25) * s,
        spin: rr(-2.5, 2.5), f: SHAPE.puff, add: false, a: 0.92, fi: 0.04, fp: 1.5,
        col: i % 3 === 0 ? col(K.poofCore) : i % 3 === 1 ? col(K.poofMid) : col(K.poofDeep) });
    }
    for (let i = 0; i < 8; i++) {
      const a = rr(0, TAU);
      emit({ x, y: y + 0.55 * s, z, vx: Math.cos(a) * rr(2, 5) * s, vy: rr(1.5, 3.6) * s, vz: Math.sin(a) * rr(2, 5) * s,
        gy: -5 * s, drag: 1.4, life: rr(0.35, 0.55), s0: rr(0.12, 0.22) * s, s1: 0.02, spin: rr(-6, 6),
        f: SHAPE.star, col: col(PAL.cloud.warm), a: 1, fi: 0.02 });
    }
    emit({ x, y: y + 0.55 * s, z, life: 0.2, s0: 0.4 * s, s1: 1.6 * s, f: SHAPE.blob, col: col(K.poofCore), a: 0.8, fi: 0.02 });
  } },

  level_pillar: { ms: 1600, peak: 220, sfx: 'level_up_sparkle', build(o) {
    const { x, y, z, s } = o;
    pillar({ x, y, z, life: 1.4, h: 9 * s, w: 1.1 * s, a: 0.85, col: col(K.holyDeep) });
    pillar({ x, y, z, life: 1.2, h: 7 * s, w: 0.55 * s, a: 0.9, col: col(K.holyCore) });
    for (let i = 0; i < 34; i++) {
      const a = rr(0, TAU), R = rr(0.15, 1.15) * s;
      emit({ x: x + Math.cos(a) * R, y: y + rr(-0.1, 0.4) * s, z: z + Math.sin(a) * R,
        vy: rr(2.6, 6.2) * s, drag: 0.55, swirl: rr(1.6, 3.2), sx: x, sz: z, sr: R, sp: a,
        life: rr(0.7, 1.25), s0: rr(0.16, 0.4) * s, s1: rr(0.03, 0.1) * s, spin: rr(-3, 3),
        f: i % 3 === 0 ? SHAPE.spark : SHAPE.star, a: 1, fi: 0.1, fp: 1.2,
        col: i % 3 === 0 ? col(K.holyCore) : i % 3 === 1 ? col(K.holyMid) : col(K.holyDeep) });
    }
    for (let i = 0; i < 4; i++) {
      ring({ x, y: y + 0.02, z, life: 0.7 + i * 0.1, r0: 0.4 * s, r1: (1.6 + i * 0.5) * s, a: 0.5, col: col(K.holyMid) });
    }
    screenFlash(PAL.ui.gold, 0.3, 520);
    shake(0.25 * s, 320);
  } },

  chest_sparkle: { ms: 900, peak: 60, sfx: 'chest_open', build(o) {
    const { x, y, z, s } = o;
    for (let i = 0; i < 12; i++) {
      const a = rr(0, TAU);
      emit({ x: x + Math.cos(a) * rr(0, 0.35) * s, y: y + rr(0, 0.25) * s, z: z + Math.sin(a) * rr(0, 0.35) * s,
        vx: Math.cos(a) * rr(0.9, 2.4) * s, vy: rr(1.6, 3.2) * s, vz: Math.sin(a) * rr(0.9, 2.4) * s,
        gy: -4.5 * s, drag: 1.1, life: rr(0.5, 0.85), s0: rr(0.14, 0.3) * s, s1: rr(0.04, 0.1) * s,
        spin: rr(-4, 4), f: i % 2 ? SHAPE.star : SHAPE.spark, a: 1, fi: 0.06, fp: 1.2,
        col: i % 3 === 0 ? col(PAL.cloud.lit) : col(K.ember) });
    }
    emit({ x, y: y + 0.2 * s, z, life: 0.45, s0: 0.3 * s, s1: 1.4 * s, f: SHAPE.blob, col: col(K.ember), a: 0.85, fi: 0.05, fp: 1.4 });
    emit({ x, y: y + 0.45 * s, z, life: 0.6, s0: 0.2 * s, s1: 1.2 * s, f: SHAPE.star, col: col(PAL.cloud.lit), a: 0.9, fi: 0.05, fp: 1.5 });
  } },

  footstep_dust: { ms: 620, peak: 10, sfx: null, build(o) {
    const { x, y, z, s } = o;
    for (let i = 0; i < 7; i++) {
      const a = rr(0, TAU);
      emit({ x: x + Math.cos(a) * 0.1 * s, y: y + 0.05, z: z + Math.sin(a) * 0.1 * s,
        vx: Math.cos(a) * rr(0.4, 1.2) * s, vy: rr(0.3, 0.85) * s, vz: Math.sin(a) * rr(0.4, 1.2) * s,
        gy: -0.9 * s, drag: 2.8, life: rr(0.32, 0.58), s0: rr(0.2, 0.36) * s, s1: rr(0.5, 0.82) * s,
        spin: rr(-2, 2), f: i % 3 === 0 ? SHAPE.puff : SHAPE.smoke, add: false, a: 0.8, fi: 0.08, fp: 1.4,
        col: mix(K.dust, K.dustMid, rnd()) });
    }
  } },

  water_splash: { ms: 900, peak: 40, sfx: 'splash', build(o) {
    const { x, y, z, s } = o;
    for (let i = 0; i < 16; i++) {
      const a = rr(0, TAU), e = rr(0.5, 1.35);
      emit({ x: x + Math.cos(a) * rr(0, 0.2) * s, y: y + 0.05, z: z + Math.sin(a) * rr(0, 0.2) * s,
        vx: Math.cos(a) * Math.cos(e) * rr(1.6, 4.2) * s, vy: Math.sin(e) * rr(2.6, 5.2) * s, vz: Math.sin(a) * Math.cos(e) * rr(1.6, 4.2) * s,
        gy: -9.2 * s, drag: 0.35, life: rr(0.4, 0.75), s0: rr(0.12, 0.3) * s, s1: rr(0.06, 0.16) * s,
        rot: rr(0, TAU), spin: rr(-3, 3), f: SHAPE.drop, a: 0.95, fi: 0.04,
        col: i % 3 === 0 ? col(K.waterCore) : col(K.waterMid) });
    }
    for (let i = 0; i < 6; i++) {
      const a = rr(0, TAU);
      emit({ x: x + Math.cos(a) * 0.2 * s, y: y + 0.12 * s, z: z + Math.sin(a) * 0.2 * s,
        vx: Math.cos(a) * rr(0.6, 1.6) * s, vy: rr(0.5, 1.2) * s, vz: Math.sin(a) * rr(0.6, 1.6) * s, drag: 2.2,
        life: rr(0.35, 0.6), s0: rr(0.25, 0.5) * s, s1: rr(0.6, 1.0) * s,
        f: SHAPE.puff, add: false, col: col(K.waterCore), a: 0.55, fi: 0.06, fp: 1.4 });
    }
    bloom(x, y + 0.35 * s, z, col(K.waterMid), { r0: 0.7 * s, r1: 2.3 * s, life: 0.45, a: 0.75 });
    ring({ x, y, z, life: 0.5, r0: 0.2 * s, r1: 1.9 * s, a: 0.75, add: false, col: col(K.waterCore) });
  } },

  warp_swirl: { ms: 1100, peak: 340, sfx: 'level_up_sparkle', build(o) {
    const { x, y, z, s } = o;
    for (let i = 0; i < 26; i++) {
      const a = rr(0, TAU), R = rr(1.4, 3.0) * s;
      emit({ x: x + Math.cos(a) * R, y: y + rr(0, 2.0) * s, z: z + Math.sin(a) * R,
        vy: rr(1.0, 3.0) * s, drag: 0.5, swirl: 7.0, sx: x, sz: z, sr: R, sp: a,
        life: rr(0.6, 0.95), s0: rr(0.14, 0.3) * s, s1: rr(0.04, 0.12) * s, spin: rr(-5, 5),
        f: i % 3 === 0 ? SHAPE.spark : SHAPE.star, a: 1, fi: 0.1, fp: 1.2,
        col: i % 3 === 0 ? col(K.buffCore) : i % 3 === 1 ? col(K.buffMid) : col(K.holyDeep) });
    }
    pillar({ x, y, z, life: 0.85, h: 6 * s, w: 1.4 * s, a: 0.5, col: col(K.buffMid) });
    for (let i = 0; i < 3; i++) ring({ x, y: y + i * 0.6 * s, z, life: 0.6 + i * 0.1, r0: 2.0 * s, r1: 0.3 * s, a: 0.55, col: col(K.buffCore) });
    emit({ x, y: y + 0.9 * s, z, life: 0.35, s0: 0.2 * s, s1: 2.0 * s, f: SHAPE.blob, col: col(K.buffCore), a: 0.8, fi: 0.5, fp: 1.2 });
  } },

  lantern_glow: { ms: 1500, peak: 200, sfx: 'buff', build(o) {
    const { x, y, z, s } = o;
    emit({ x, y: y + 0.9 * s, z, life: 1.3, s0: 0.5 * s, s1: 3.2 * s, f: SHAPE.blob, col: col(K.lamp), a: 0.6, fi: 0.25, fp: 1.1 });
    emit({ x, y: y + 0.9 * s, z, life: 1.2, s0: 0.3 * s, s1: 1.7 * s, f: SHAPE.blob, col: col(K.glow), a: 0.8, fi: 0.2, fp: 1.2 });
    for (let i = 0; i < 14; i++) {
      const a = rr(0, TAU), R = rr(0.3, 1.6) * s;
      emit({ x: x + Math.cos(a) * R, y: y + rr(0.4, 1.8) * s, z: z + Math.sin(a) * R,
        vy: rr(0.3, 0.9) * s, drag: 0.6, swirl: rr(-1.4, 1.4), sx: x, sz: z, sr: R, sp: a,
        life: rr(0.8, 1.3), s0: rr(0.1, 0.22) * s, s1: rr(0.03, 0.08) * s, spin: rr(-2, 2),
        f: SHAPE.star, col: i % 2 ? col(K.lamp) : col(PAL.cloud.warm), a: 0.9, fi: 0.2, fp: 1.3 });
    }
    ring({ x, y, z, life: 0.9, r0: 0.5 * s, r1: 2.6 * s, a: 0.28, col: col(K.lamp) });
  } },
};

/** Aliases so callers can use the obvious word. */
export const ALIAS = Object.freeze({
  fire: 'fire_burst', ice: 'ice_shards', wind: 'wind_slash', bolt: 'lightning', thunder: 'lightning',
  heal: 'heal_sparkle', holy: 'holy_light', buff: 'buff_aura', debuff: 'debuff_aura', sleep: 'sleep_z',
  confuse: 'confusion_birds', poison: 'poison_bubbles', flash: 'screen_flash', poof: 'defeat_poof',
  levelup: 'level_pillar', chest: 'chest_sparkle', dust: 'footstep_dust', splash: 'water_splash',
  smoke: 'smoke_puff', warp: 'warp_swirl', lantern: 'lantern_glow', root: 'root_vines', chime: 'chime_ring',
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the tick
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function step(dt) {
  if (!(dt > 0)) return;
  if (dt > 0.1) dt = 0.1;                                   // a tab that was asleep must not teleport everything
  S.ms += dt * 1000;
  const live = S.live;
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i];
    p.life -= dt;
    if (p.life <= 0) { p.on = false; live.splice(i, 1); if (S.free.length < 900) S.free.push(p); continue; }
    if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vz *= k; p.vy *= k; }
    p.vy += p.gy * dt;
    if (p.swirl) {                                          // orbit a column instead of flying straight
      p.sp += p.swirl * dt;
      p.x = p.sx + Math.cos(p.sp) * p.sr;
      p.z = p.sz + Math.sin(p.sp) * p.sr;
      p.y += p.vy * dt;
    } else {
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    p.rot += p.spin * dt;
  }

  for (let i = S.rings.length - 1; i >= 0; i--) {
    const R = S.rings[i];
    if (R.life <= 0) continue;
    R.life -= dt;
    if (R.life <= 0) { R.mesh.visible = false; R.mat.opacity = 0; continue; }
    const t = 1 - R.life / R.max, e = 1 - Math.pow(1 - t, 2.6);
    const r = R.r0 + (R.r1 - R.r0) * e;
    R.mesh.scale.set(r, 1, r);
    R.mat.opacity = R.a0 * Math.min(1, t / 0.1) * Math.pow(1 - t, 1.3);
  }
  for (const P of S.pillars) {
    if (P.life <= 0) continue;
    P.life -= dt;
    if (P.life <= 0) { P.mesh.visible = false; P.mat.opacity = 0; continue; }
    const t = 1 - P.life / P.max;
    const grow = Math.min(1, t / 0.18);
    P.mesh.scale.set(P.w * (0.6 + 0.4 * grow), P.h * grow, P.w * (0.6 + 0.4 * grow));
    P.mesh.rotation.y += dt * 1.1;
    P.mat.opacity = P.a0 * grow * Math.pow(1 - t, 1.5);
  }
  for (const B of S.bolts) {
    if (B.life <= 0) continue;
    B.life -= dt;
    if (B.life <= 0) { B.mesh.visible = false; B.mat.opacity = 0; continue; }
    const t = 1 - B.life / B.max;
    B.mat.opacity = B.a0 * (t < 0.12 ? t / 0.12 : Math.pow(1 - (t - 0.12) / 0.88, 1.6)) * (0.75 + 0.25 * Math.random());
  }
}

/** Write the live particles into the two instanced batches. */
function upload() {
  if (!S.add || !S.soft) return;
  let na = 0, ns = 0;
  const A = S.add, B = S.soft;
  for (const p of S.live) {
    const t = 1 - p.life / p.max;
    const size = p.s0 + (p.s1 - p.s0) * t;
    if (size <= 0) continue;
    const fadeIn = p.fi > 0 ? Math.min(1, t / p.fi) : 1;
    const a = p.a0 * fadeIn * Math.pow(Math.max(0, 1 - t), p.fp);
    if (a <= 0.004) continue;
    const bat = p.add ? A : B;
    const n = p.add ? na : ns;
    if (n >= bat.capacity) continue;
    bat.pos.array[n * 3] = p.x; bat.pos.array[n * 3 + 1] = p.y; bat.pos.array[n * 3 + 2] = p.z;
    bat.misc.array[n * 4] = size; bat.misc.array[n * 4 + 1] = p.rot; bat.misc.array[n * 4 + 2] = a; bat.misc.array[n * 4 + 3] = p.f;
    bat.col.array[n * 3] = p.r; bat.col.array[n * 3 + 1] = p.g; bat.col.array[n * 3 + 2] = p.b;
    if (p.add) na++; else ns++;
  }
  A.geo.instanceCount = na; B.geo.instanceCount = ns;
  // The additive batch stays VISIBLE even when empty (instanceCount 0 draws nothing): it is the self-tick clock,
  // and a hidden mesh gets no onBeforeRender — which used to dead-lock FX the moment the field stopped ticking.
  A.mesh.visible = true; B.mesh.visible = ns > 0;
  if (na) { A.pos.needsUpdate = true; A.misc.needsUpdate = true; A.col.needsUpdate = true; }
  if (ns) { B.pos.needsUpdate = true; B.misc.needsUpdate = true; B.col.needsUpdate = true; }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the public facade
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** The travelling head of a spell: a short comet of sparks that arrives exactly when the burst fires. */
function comet(from, to, secs, s, colour) {
  const vx = (to.x - from.x) / secs, vy = (to.y - from.y) / secs / VY, vz = (to.z - from.z) / secs;
  // the head: a bright blob that reads at a glance
  emit({ x: from.x, y: from.y, z: from.z, vx, vy, vz, life: secs, s0: 0.75 * s, s1: 1.0 * s,
    f: SHAPE.blob, col: colour, a: 0.95, fi: 0.08, fp: 0.6 });
  emit({ x: from.x, y: from.y, z: from.z, vx, vy, vz, life: secs, s0: 0.42 * s, s1: 0.55 * s,
    f: SHAPE.star, col: col(PAL.cloud.lit), a: 1, fi: 0.08, fp: 0.6 });
  // the tail: sparks dropped along the way, each lagging a little further behind
  for (let i = 0; i < 16; i++) {
    const k = (i / 16) * 0.55;
    emit({ x: from.x, y: from.y, z: from.z,
      vx: vx * (1 - k) + rr(-0.5, 0.5), vy: vy * (1 - k), vz: vz * (1 - k) + rr(-0.5, 0.5),
      life: secs * (0.55 + k * 0.8), s0: (0.34 - k * 0.3) * s, s1: 0.03,
      spin: rr(-7, 7), f: i % 3 === 0 ? SHAPE.spark : SHAPE.mote, col: colour, a: 0.95, fi: 0.04 });
  }
}

const _v = new THREE.Vector3();

function resolveAt(at) {
  if (!at) return { x: 0, y: 1, z: 0 };
  if (at.isObject3D) { at.getWorldPosition(_v); return { x: _v.x, y: _v.y, z: _v.z }; }
  if (at.isVector3) return { x: at.x, y: at.y, z: at.z };
  if (Array.isArray(at)) return { x: +at[0] || 0, y: +at[1] || 0, z: +at[2] || 0 };
  return { x: +at.x || 0, y: at.y != null ? +at.y : 1, z: +at.z || 0 };
}
function resolveDir(dir) {
  if (typeof dir === 'number') return { dx: Math.sin(dir), dz: Math.cos(dir) };
  if (dir && (dir.x != null || dir.z != null)) {
    const dx = +dir.x || 0, dz = +dir.z || 0, L = Math.hypot(dx, dz);
    if (L > 1e-5) return { dx: dx / L, dz: dz / L };
  }
  if (S.camera) {                                            // default: away from the camera
    S.camera.getWorldDirection(_v);
    const L = Math.hypot(_v.x, _v.z) || 1;
    return { dx: _v.x / L, dz: _v.z / L };
  }
  return { dx: 0, dz: 1 };
}

export const FX = {
  /** Every effect id a caller may use (aliases excluded). */
  ids() { return Object.keys(EFFECTS); },
  aliases() { return Object.assign({}, ALIAS); },
  has(id) { return !!EFFECTS[ALIAS[id] || id]; },
  /** {ms, peak, sfx} for an id, or null. */
  spec(id) { const e = EFFECTS[ALIAS[id] || id]; return e ? { id: ALIAS[id] || id, ms: e.ms, peak: e.peak, sfx: e.sfx } : null; },

  /** Where the particles live. Pass the scene the game is drawing; `camera` keeps ribbons facing the viewer. */
  attach(scene, opts = {}) {
    if (!scene || !scene.isObject3D) return false;
    if (S.scene === scene) { if (opts.camera) S.camera = opts.camera; if (opts.sound) S.sound = opts.sound; return true; }
    return !!guard('attach', () => {
      if (S.scene) FX.detach();
      S.scene = scene;
      if (opts.camera) S.camera = opts.camera;
      if (opts.sound) S.sound = opts.sound;
      if (opts.cap) S.cap = Math.max(96, opts.cap | 0);
      const half = Math.max(64, Math.min(1600, S.cap) >> 1);
      if (!S.add) S.add = makeBatch(half, true);
      if (!S.soft) S.soft = makeBatch(half, false);
      scene.add(S.add.mesh); scene.add(S.soft.mesh);
      ringPool(); pillarPool(); boltPool();
      for (const r of S.rings) scene.add(r.mesh);
      for (const p of S.pillars) scene.add(p.mesh);
      for (const b of S.bolts) scene.add(b.mesh);
      // self-tick: if nobody calls FX.update, the additive batch ticks us as the scene renders
      // The field drives FX.update every tick — but a battle pushed OVER the field stops the field ticking while
      // still drawing its scene. So the batch takes over the clock whenever nobody has called update() lately.
      S.add.mesh.onBeforeRender = () => {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        if (S.paused) { S.lastAuto = now; return; }
        if (now - S.manual < 0.25) { S.lastAuto = now; return; }
        const dt = S.lastAuto ? now - S.lastAuto : 1 / 60;
        S.lastAuto = now;
        step(Math.min(0.1, dt)); upload();
      };
      return true;
    });
  },

  /** Take the pools out of the scene and free the GPU memory. Safe to call twice. */
  detach() {
    guard('detach', () => {
      const scene = S.scene;
      if (scene) {
        if (S.add) scene.remove(S.add.mesh);
        if (S.soft) scene.remove(S.soft.mesh);
        for (const r of S.rings) scene.remove(r.mesh);
        for (const p of S.pillars) scene.remove(p.mesh);
        for (const b of S.bolts) scene.remove(b.mesh);
      }
      FX.clear();
      S.scene = null;
    });
    return true;
  },

  /** Free everything, including the atlas. After this, attach() rebuilds from scratch. */
  dispose() {
    FX.detach();
    guard('dispose', () => {
      for (const b of [S.add, S.soft]) if (b) { b.geo.dispose(); b.mat.dispose(); }
      S.add = S.soft = null;
      for (const r of S.rings) r.mat.dispose();
      for (const p of S.pillars) p.mat.dispose();
      for (const b of S.bolts) { b.geo.dispose(); b.mat.dispose(); }
      S.rings = []; S.pillars = []; S.bolts = [];
      if (quadGeo) { quadGeo.dispose(); quadGeo = null; }
      if (ringGeo) { ringGeo.dispose(); ringGeo = null; }
      if (pillarGeo) { pillarGeo.dispose(); pillarGeo = null; }
      if (pillarAlpha) { pillarAlpha.dispose(); pillarAlpha = null; }
      if (atlasTex) { atlasTex.dispose(); atlasTex = null; }
      if (S.flashEl && S.flashEl.parentNode) S.flashEl.parentNode.removeChild(S.flashEl);
      S.flashEl = null;
    });
    return true;
  },

  setCamera(cam) { if (cam && cam.isCamera) S.camera = cam; return !!S.camera; },
  /** fn(sfxId, opts) — usually (id, o) => Sfx.play(id, o). */
  setSound(fn) { S.sound = typeof fn === 'function' ? fn : null; return !!S.sound; },
  /** Cap the particles in flight (a low-quality tier passes 384). */
  setCap(n) { S.cap = Math.max(96, n | 0); return S.cap; },
  /** Turn the whole-screen flash off (a screenshot grid, a reduced-flash setting). */
  setFlash(on) { S.flash = on !== false; return S.flash; },
  /** fn({amp, ms}) — whoever owns the camera answers the heavy effects' request for a shake. */
  setShake(fn) { S.shake = typeof fn === 'function' ? fn : null; return !!S.shake; },

  /**
   * Play an effect. `id` is an EFFECTS key or an ALIAS. Never throws.
   * Returns {id, ms, peak, ok}.
   */
  play(id, opts = {}) {
    const key = ALIAS[id] || id;
    const e = EFFECTS[key];
    if (!e) { reportError('fx.play', new Error(`unknown effect "${id}"`)); return { id, ms: 0, peak: 0, ok: false }; }
    const at = resolveAt(opts.at);
    const { dx, dz } = resolveDir(opts.dir);
    const s = opts.scale > 0 ? opts.scale : 1;
    // A spell with a caster FLIES: a little comet leaves `from`, and the burst fires when it lands.
    const from = opts.from ? resolveAt(opts.from) : null;
    if (from) {
      const ms = opts.travelMs > 0 ? opts.travelMs : 190;
      comet(from, at, ms / 1000, s, e.travelCol ? col(e.travelCol) : (e.sfx === 'heal' ? col(K.healCore) : col(K.fireCore)));
      setTimeout(() => guard('land ' + key, () => FX.play(key, Object.assign({}, opts, { from: null, at }))), ms);
      S.played++; S.lastId = key;
      return { id: key, ms: e.ms + ms, peak: e.peak + ms, ok: true, travelMs: ms };
    }
    S.flashOff = opts.flash === false;
    guard('play ' + key, () => e.build({ x: at.x, y: at.y, z: at.z, s, dx, dz,
      hex: opts.colour || opts.color || null, peakA: opts.peakA, fade: opts.fade }));
    S.flashOff = false;
    S.played++; S.lastId = key;
    upload();                                               // show the first frame now, whoever owns the clock
    // the sound and the caller's hit frame land together, at the effect's peak
    const sid = opts.sound === false ? null : (typeof opts.sound === 'string' ? opts.sound : e.sfx);
    const fire = () => {
      if (sid && S.sound) guard('sound ' + sid, () => S.sound(sid, opts.soundOpts || undefined));
      if (typeof opts.onPeak === 'function') guard('onPeak ' + key, () => opts.onPeak());
    };
    if (e.peak > 8) setTimeout(() => guard('peak ' + key, fire), e.peak);
    else fire();
    return { id: key, ms: e.ms, peak: e.peak, ok: true };
  },

  /**
   * Advance the simulation. Whoever calls this owns the clock while they keep calling it; stop for a quarter of a
   * second (a battle over the field, a paused scene) and the batch's own render tick takes over automatically.
   */
  update(dt) {
    S.manual = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    if (S.paused) { upload(); return S.live.length; }
    step(dt); upload();
    return S.live.length;
  },

  /**
   * Freeze the effect clock where it is and keep drawing it. A critic (or a screenshot tool) can then hold an
   * effect at its own stated peak and MEASURE it, instead of racing a 90 ms flame with a 300 ms screen capture.
   * Nothing in the game calls this; `FX.step(ms)` advances a paused simulation by hand.
   * (The few setTimeout beats inside an effect — the second lightning ribbon, the sound at the peak, a comet
   * landing — still run on the wall clock, so a paused frame is the particles, not those.)
   */
  pause(on) { S.paused = on !== false; return S.paused; },
  /** Advance a paused (or running) simulation by `ms`, in 1/120 s slices so the result is the same every time. */
  step(ms) {
    let left = Math.max(0, +ms || 0) / 1000;
    while (left > 0) { const dt = Math.min(1 / 120, left); step(dt); left -= dt; }
    upload();
    return S.live.length;
  },

  /** Stop everything in flight at once (a scene change, a transition). */
  clear() {
    for (const p of S.live) { p.on = false; if (S.free.length < 900) S.free.push(p); }
    S.live.length = 0;
    for (const r of S.rings) { r.life = 0; r.mesh.visible = false; r.mat.opacity = 0; }
    for (const p of S.pillars) { p.life = 0; p.mesh.visible = false; p.mat.opacity = 0; }
    for (const b of S.bolts) { b.life = 0; b.mesh.visible = false; b.mat.opacity = 0; }
    upload();
    return true;
  },

  /** What a critic sees in __DQ.state().fx. */
  state() {
    return {
      attached: !!S.scene, camera: !!S.camera, sound: !!S.sound,
      effects: Object.keys(EFFECTS).length, particles: S.live.length, cap: S.cap,
      rings: S.rings.filter((r) => r.life > 0).length,
      pillars: S.pillars.filter((p) => p.life > 0).length,
      bolts: S.bolts.filter((b) => b.life > 0).length,
      draws: (S.add && S.add.geo.instanceCount > 0 ? 1 : 0) + (S.soft && S.soft.geo.instanceCount > 0 ? 1 : 0),
      played: S.played, dropped: S.dropped, last: S.lastId, flash: S.flash, shakes: S.shook, shakeHook: !!S.shake,
      paused: S.paused,
      driver: (((typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000) - S.manual < 0.25) ? 'caller' : 'self',
    };
  },
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PLUGIN — main.js may install this like any other scene plugin; it is harmless if half the context is missing.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function install(ctx = {}) {
  const { Bus, Debug, Field, Sfx, Audio, App } = ctx;

  if (Sfx) FX.setSound((id, o) => { if (!Audio || Audio.ready) Sfx.play(id, o); });
  if (Bus) FX.setShake((p) => Bus.emit('fx.shake', p));
  if (App && App.quality === 'low') FX.setCap(384);

  if (Field && typeof Field.on === 'function') {
    // the field may ALREADY be up (installed late, a demo, a hot reload): attach to the live world at once
    guard('install attach', () => {
      const w = typeof Field.world === 'function' ? Field.world() : null;
      if (w && w.scene) FX.attach(w.scene, { camera: w.camera });
    });
    Field.on('load', (info) => { if (info && info.scene) FX.attach(info.scene, { camera: info.camera }); });
    Field.on('unload', () => FX.detach());
    Field.on('render', (alpha, dt, t, info) => {
      if (info && info.camera) S.camera = info.camera;
      FX.update(dt || 1 / 60);
    });
  } else if (App && App.scene) {
    FX.attach(App.layers && App.layers.fx ? App.layers.fx : App.scene, { camera: App.camera });
  }

  if (Bus && typeof Bus.on === 'function') {
    // anybody can fire an effect without importing this file
    Bus.on('fx.play', (p) => { if (p && p.id) FX.play(p.id, p); });
    Bus.on('fx.clear', () => FX.clear());
    // the ceremonies that belong to the world
    Bus.on('party.levelup', (p) => FX.play('level_pillar', { at: p && p.at, scale: (p && p.scale) || 1 }));
    Bus.on('chest.open', (p) => FX.play('chest_sparkle', { at: p && p.at }));
    // P10 does not emit this yet (NEEDS) — the hook is here so a footstep puffs the moment it does
    Bus.on('player.step', (p) => { if (p && p.at) FX.play('footstep_dust', { at: p.at, scale: p.scale || 0.8, sound: false, flash: false }); });
    Bus.on('map.leave', () => FX.clear());
  }

  if (Debug) {
    if (typeof Debug.expose === 'function') {
      Debug.expose('fx', (id, o) => FX.play(id, o || {}));
      Debug.expose('fxList', () => FX.ids());
      Debug.expose('fxAt', (id, x, y, z, scale) => FX.play(id, { at: { x, y, z }, scale }));
      Debug.expose('fxClear', () => FX.clear());
      Debug.expose('fxSpec', (id) => FX.spec(id));
      // hold an effect still at a chosen moment so a critic can measure the frame instead of racing it
      Debug.expose('fxHold', (id, ms, o) => {
        FX.clear(); FX.pause(false);
        const r = FX.play(id, Object.assign({ sound: false, flash: false }, o || {}));
        FX.pause(true);
        FX.step(ms != null ? ms : r.peak || 90);
        return r;
      });
      Debug.expose('fxResume', () => { FX.pause(false); return true; });
    }
    if (typeof Debug.provide === 'function') Debug.provide('fx', () => FX.state());
  }
  return true;
}

export default FX;
