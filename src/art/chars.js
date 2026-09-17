/**
 * chars.js — procedural character models in the locked house style.                      (P07, owner: src/art/chars.js)
 *
 *   import { Chars } from '../art/chars.js';
 *   const bram = Chars.build('hero', { age: 6 });               // or {age: 'boy'} / {age: 26} / {age: 'man'}
 *   scene.add(bram.root);
 *   bram.setFacing(rad, instant?)   bram.setMove(speed /*u/s*\/, {run?})   bram.play('talk', {loop, fade})
 *   bram.emote('surprised')         bram.lookAt(vec3|null)   bram.update(dt)   bram.dispose()
 *   bram.height  bram.onStep = (side) => Sfx.play('step')  bram.onEvent = (name) => {}   bram.state()
 *   bram.attach(object3d, boneName)   // hang a real item on a bone ('item' for the held-aloft treasure, 'handR', ...)
 *   Chars.list() -> ['hero','halvard','willow','sera','barty','villager']
 *   Chars.variants('villager') -> ['farmer','baker','granny','child','guard','innkeeper','nun','merchant']
 *   Chars.catalog() -> [{id, age, variant, label}]   (every buildable look, for demos and critics)
 *
 * How a character is made (docs/ART-DIRECTION.md §5, §6, §15; ARCHITECTURE "Art conventions"):
 *  - Round primitives (ellipsoids, tapered capsules, lathes, tori) authored in a rest pose, every vertex skinned to
 *    the skeleton from anim.js, then MERGED: one toon mesh (vertex colours; a cloth weave only where there is cloth;
 *    skin gets the 0.85 mid band), one inverted-hull outline mesh (PAL.outline.char, 0.018 / head 0.02, smooth parts
 *    only), one unlit face mesh (eyes, highlights, mouths, blush). 3 draw calls + 1 shadow pass per character, plus
 *    one sprite while an emote bubble shows. Geometry is cached per look and shared by every instance; the three
 *    materials are shared by the whole cast.
 *  - Toriyama proportions: adults ~1.6 u, children ~1.1 u, heads ~1/3 of the body, mitten hands, chunky boots.
 *    Sir Halvard is the exception the story needs: a 2.07 u giant on a V-shaped barrel chest twice the boy's width,
 *    with bare massive arms, a small head and adult eyes under heavy brows (CANON: "enormous shaggy bear of a man").
 *  - Hair, beards and fur are ONE closed shaggy mass each (shag() / fringe()): an outer surface with pointed tufts,
 *    an inner wall tucked under the skin, per-vertex colour (so grey temples are streaks in the same hair, never
 *    separate outlined blobs) and ONE outline. A bald man's horseshoe of hair is fringe().
 *  - A character who carries a staff-like prop (greatsword, cane, pitchfork) declares style.plant = {len, gripY, ...}
 *    and sets K.m.stickLen; anim.js then plants its tip on the ground every stride and the hand follows the staff.
 *  - Faces are decals sitting ON the head surface; eyes, brows and mouths hang on bones so they blink, glance,
 *    talk and emote. Colours come only from PAL (mixHex/scaleHex of palette entries, never a literal hex).
 */
import * as THREE from 'three';
import { PAL, C3, mixHex, scaleHex } from './palette.js';
import { Tex } from './tex.js';
import { makeToon, outlineMaterial, OUTLINE } from './toon.js';
import { Assets } from '../engine/assets.js';
import { reportError } from '../engine/debug.js';
import { makeSkeleton, createAnimator, CLIP_NAMES, EMOTES } from './anim.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// shared colours (all derived from PAL)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const COL = {
  skin: PAL.char.skin,
  tan: mixHex(PAL.char.skin, PAL.wood.light, 0.32),
  ruddy: mixHex(PAL.char.skin, PAL.tile.light, 0.2),
  pale: mixHex(PAL.char.skin, PAL.plaster.light, 0.35),
  olive: mixHex(PAL.char.skin, PAL.dirt.base, 0.38),
  cheek: mixHex(PAL.char.skin, PAL.flower.pink, 0.6),
  sunburn: mixHex(PAL.char.skin, PAL.flower.red, 0.3),
  eye: PAL.char.eye, white: PAL.char.white, mouth: PAL.slime.mouth, tongue: PAL.slime.tongue, sclera: PAL.plaster.light,
  ribbon: PAL.foliage.light,
  steel: PAL.stone.light, steelDark: PAL.stone.mid, iron: PAL.paint.iron, gold: PAL.paint.gold,
  boot: PAL.char.boot, belt: PAL.char.belt, leather: PAL.cloth.leather,
  darkTrousers: mixHex(PAL.cloth.blueDark, PAL.char.hair, 0.45),
  greyHair: PAL.stone.light, whiteHair: mixHex(PAL.plaster.light, PAL.cloud.mid, 0.5),
  freckle: mixHex(PAL.wood.light, PAL.char.skin, 0.25),
  outlineSoft: PAL.outline.char,
};
const WEAVE_BASE = PAL.stone.light;          // neutral weave: texel / base = 1 ± 10%
const WEAVE_WORLD = 0.34;                     // world units per weave tile

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// materials (shared by the whole cast)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function charPatch(sh) {
  sh.uniforms.uWeaveBase = { value: C3(WEAVE_BASE) };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 dqChar;\nvarying vec2 vDqChar;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvDqChar = dqChar;');
  let fs = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vDqChar;\nuniform vec3 uWeaveBase;')
    .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 dqWeave = texture2D( map, vMapUv );
  diffuseColor.rgb *= mix( vec3( 1.0 ), dqWeave.rgb / uWeaveBase, vDqChar.x );
#endif`);
  // skin keeps a softer mid band (ART-DIRECTION §5: hero skin mid 0.85)
  fs = fs.replace('return a * mix( uMid, 1.0, b );', 'return a * mix( mix( uMid, 0.85, vDqChar.y ), 1.0, b );');
  sh.fragmentShader = fs;
}
charPatch.key = 'dqchar';

const MAT = {
  toon: () => Assets.material('chars:toon', () => {
    const m = makeToon({ vertexColors: true, map: Tex.cloth(WEAVE_BASE) }, 'character', [charPatch], 'dqchar');
    m.name = 'chars:toon'; return m;
  }),
  face: () => Assets.material('chars:face', () => {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    m.name = 'chars:face'; return m;
  }),
  hull: () => outlineMaterial(PAL.outline.char),
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// geometry primitives (all smooth, all with uv)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const G = {
  ell: (d = 1) => new THREE.SphereGeometry(1, Math.max(6, Math.round(11 * d)), Math.max(4, Math.round(8 * d))),
  sphereCap: (d, thetaLen) => new THREE.SphereGeometry(1, Math.max(8, Math.round(16 * d)), Math.max(4, Math.round(9 * d * thetaLen / Math.PI + 2)), 0, TAU, 0, thetaLen),
  /** tapered capsule from y=0 (radius r0) down to y=-len (radius r1) */
  taper: (len, r0, r1, d = 1) => {
    const pts = [], n = Math.max(2, Math.round(3 * d));
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * r1 + 1e-4, -len + Math.sin(a) * r1)); }
    for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * r0 + 1e-4, Math.sin(a) * r0)); }
    return new THREE.LatheGeometry(pts, Math.max(6, Math.round(9 * d)));
  },
  lathe: (prof, d = 1, phiStart = 0, phiLen = TAU) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), Math.max(6, Math.round(15 * d * phiLen / TAU) + 2), phiStart, phiLen),
  torus: (R, r, d = 1, arc = TAU) => new THREE.TorusGeometry(R, r, Math.max(3, Math.round(5 * d)), Math.max(6, Math.round(14 * d * arc / TAU) + 3), arc),
  box: (w, h, dd) => new THREE.BoxGeometry(w, h, dd),
  cyl: (rt, rb, h, d = 1) => new THREE.CylinderGeometry(rt, rb, h, Math.max(6, Math.round(9 * d))),
  disc: (r, d = 1, start = 0, len = TAU) => new THREE.CircleGeometry(r, Math.max(8, Math.round(12 * d)), start, len),
  head: (d = 1) => new THREE.SphereGeometry(1, Math.max(10, Math.round(24 * d)), Math.max(8, Math.round(17 * d))),
};

/** flip winding + normals (inner cloth linings) */
function flipGeo(g) {
  const idx = g.index;
  if (idx) { for (let i = 0; i < idx.count; i += 3) { const b = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, b); } }
  const n = g.attributes.normal;
  if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/** Matrix from position, euler rotation, scale */
const _e = new THREE.Euler(), _q = new THREE.Quaternion();
function TRS(p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const S = Array.isArray(s) ? s : [s, s, s];
  return new THREE.Matrix4().compose(V3(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2], r[3] || 'XYZ')), V3(S[0], S[1], S[2]));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the part builder
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
class Kit {
  constructor(m) {
    this.m = m;
    this.joints = [];
    this.jointAbs = {};
    this.parts = [];          // {kind:'toon'|'face', make(detail) -> geo, M, skin, color, weave, skinFlag, outline, rep, grad}
  }
  joint(name, parent, at) {
    if (this.jointAbs[name]) return name;
    this.joints.push({ name, parent, at: at.slice() });
    this.jointAbs[name] = at.slice();
    return name;
  }
  abs(name) { return this.jointAbs[name]; }

  /**
   * Add a part.
   *   make: (detail) => BufferGeometry in part space        M: Matrix4 part -> bind space
   *   o: {bone | weights(p) -> [[bone, w]...], color | colorFn(p) -> hex, weave 0..1, skin bool, outline th|0,
   *       face bool, rep [u, v] (weave repeats), grad [y0, y1, dark]}
   */
  add(make, M, o) {
    this.parts.push(Object.assign({ make, M, outline: 0, weave: 0, skin: false, face: false }, o));
    return this;
  }
  // ── sugar ──
  /** ellipsoid at p with radii rr */
  ball(bone, p, rr, color, o = {}) {
    const R = Array.isArray(rr) ? rr : [rr, rr, rr];
    return this.add((d) => G.ell(d * (o.detail || 1)), TRS(p, o.rot || [0, 0, 0], R), Object.assign({ bone, color, outline: OUTLINE.char, rep: [2, 1] }, o));
  }
  /** tapered limb between two bind-space points (radius r0 at a, r1 at b) */
  limb(bone, a, b, r0, r1, color, o = {}) {
    const A = V3(...a), B = V3(...b), dir = B.clone().sub(A), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, -1, 0), dir.normalize());
    const M = new THREE.Matrix4().compose(A, q, V3(o.sx || 1, 1, o.sz || 1));
    return this.add((d) => G.taper(len, r0, r1, d * (o.detail || 1)), M, Object.assign({ bone, color, outline: OUTLINE.char, rep: [3, Math.max(1, len / WEAVE_WORLD)] }, o));
  }
  lathe(bone, p, prof, color, o = {}) {
    const M = TRS(p, o.rot || [0, 0, 0], o.scale || [1, 1, 1]);
    const h = Math.abs(prof[prof.length - 1][1] - prof[0][1]), rmax = Math.max(...prof.map(q => q[0]));
    const sizeK = clamp(0.8 + rmax * 2.6, 1, 1.9);
    const mk = (d) => { const g = G.lathe(prof, d * (o.detail || 1) * sizeK, o.phiStart || 0, o.phiLen || TAU); return o.flip ? flipGeo(g) : g; };
    return this.add(mk, M, Object.assign({ bone, color, outline: OUTLINE.char, rep: [Math.max(1, Math.round(TAU * rmax / WEAVE_WORLD * (o.phiLen || TAU) / TAU)), Math.max(1, h / WEAVE_WORLD)] }, o));
  }
  torus(bone, p, R, r, color, o = {}) {
    return this.add((d) => G.torus(R, r, d * (o.detail || 1), o.arc || TAU), TRS(p, o.rot || [Math.PI / 2, 0, 0], o.scale || [1, 1, 1]), Object.assign({ bone, color, outline: 0, rep: [Math.max(1, Math.round(TAU * R / WEAVE_WORLD)), 1] }, o));
  }
  box(bone, p, size, color, o = {}) {
    return this.add(() => G.box(size[0], size[1], size[2]), TRS(p, o.rot || [0, 0, 0], [1, 1, 1]), Object.assign({ bone, color, outline: 0, rep: [1, 1] }, o));
  }
  cyl(bone, p, rt, rb, h, color, o = {}) {
    return this.add((d) => G.cyl(rt, rb, h, d), TRS(p, o.rot || [0, 0, 0], o.scale || [1, 1, 1]), Object.assign({ bone, color, outline: 0, rep: [2, 1] }, o));
  }

  // ── head-surface placement ──
  /** point + frame on the head ellipsoid at (yaw, pitch); lift pushes it off the surface */
  onHead(yaw, pitch, lift = 0) {
    const h = this.head;
    const d = V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const P = V3(h.c[0] + d.x * h.rx, h.c[1] + d.y * h.ry, h.c[2] + d.z * h.rz);
    const n = V3(d.x / h.rx, d.y / h.ry, d.z / h.rz).normalize();
    P.addScaledVector(n, lift);
    const M = new THREE.Matrix4().lookAt(P.clone().add(n), P, V3(0, 1, 0));
    M.setPosition(P);
    return { P, n, M };
  }
  /** a decal on the face mesh: make(d) in decal space (+Z = out of the head) */
  decal(bone, yaw, pitch, lift, make, color, o = {}) {
    const { M } = this.onHead(yaw, pitch, lift);
    const L = TRS(o.p || [0, 0, 0], o.rot || [0, 0, 0], o.scale || [1, 1, 1]);
    return this.add(make, M.clone().multiply(L), Object.assign({ bone, color, face: true }, o));
  }
  /** a toon part placed on the head surface */
  headPart(bone, yaw, pitch, lift, make, color, o = {}) {
    const { M } = this.onHead(yaw, pitch, lift);
    const L = TRS(o.p || [0, 0, 0], o.rot || [0, 0, 0], o.scale || [1, 1, 1]);
    return this.add(make, M.clone().multiply(L), Object.assign({ bone, color, outline: 0, rep: [1, 1] }, o));
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// merge: parts -> {toon, hull, face} skinned BufferGeometries
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
const _nm = new THREE.Matrix3();

function newBuf() { return { pos: [], nor: [], uv: [], col: [], si: [], sw: [], dq: [], idx: [], v: 0 }; }

function appendGeo(buf, geo, part, index, hullTh = 0, wantUv = true) {
  const g = geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, DC = g.attributes.dqcol || null;
  const base = buf.v;
  const rep = part.rep || [1, 1];
  const colFixed = part.colorFn || DC ? null : C3(part.color || PAL.debug.missing);
  const rigid = part.weights ? null : index[part.bone];
  if (!part.weights && rigid === undefined) throw new Error(`chars: unknown bone "${part.bone}"`);
  for (let i = 0; i < P.count; i++) {
    _p.fromBufferAttribute(P, i); _n.fromBufferAttribute(N, i);
    const px = _p.x + _n.x * hullTh, py = _p.y + _n.y * hullTh, pz = _p.z + _n.z * hullTh;
    buf.pos.push(px, py, pz);
    buf.nor.push(_n.x, _n.y, _n.z);
    if (wantUv) { const u = U ? U.getX(i) : 0, v = U ? U.getY(i) : 0; buf.uv.push(u * rep[0], v * rep[1]); }
    // colour
    if (DC) _c.setRGB(DC.getX(i), DC.getY(i), DC.getZ(i));
    else if (part.colorFn) _c.copy(C3(part.colorFn(_p, _n)));
    else _c.copy(colFixed);
    if (part.grad) { const [y0, y1, dk] = part.grad; const k = lerp(dk, 1, sstep(y0, y1, _p.y)); _c.multiplyScalar(k); }
    buf.col.push(_c.r, _c.g, _c.b);
    // skin
    if (rigid !== undefined && rigid !== null) { buf.si.push(rigid, 0, 0, 0); buf.sw.push(1, 0, 0, 0); }
    else {
      const ws = part.weights(_p, _n).filter(w => w[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      let tot = 0; for (const w of ws) tot += w[1];
      const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
      ws.forEach((w, j) => { const bi = index[w[0]]; if (bi === undefined) throw new Error(`chars: unknown bone "${w[0]}"`); si[j] = bi; sw[j] = w[1] / (tot || 1); });
      if (!ws.length) { si[0] = index.root; sw[0] = 1; }
      buf.si.push(...si); buf.sw.push(...sw);
    }
    buf.dq.push(part.weave || 0, part.skin ? 1 : 0);
  }
  if (g.index) { for (let i = 0; i < g.index.count; i++) buf.idx.push(base + g.index.getX(i)); }
  else { for (let i = 0; i < P.count; i++) buf.idx.push(base + i); }
  buf.v += P.count;
}

function finish(buf, { uv = true, dq = true } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(buf.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(buf.sw, 4));
  if (dq) g.setAttribute('dqChar', new THREE.Float32BufferAttribute(buf.dq, 2));
  g.setIndex(buf.v > 65535 ? new THREE.Uint32BufferAttribute(buf.idx, 1) : new THREE.Uint16BufferAttribute(buf.idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  g.userData.shared = true;
  return g;
}

function mergeKit(K, index) {
  const toon = newBuf(), hull = newBuf(), face = newBuf();
  const byPart = [];
  for (const part of K.parts) {
    const g = part.make(part.face ? 0.7 : (part.detailBoost || 0.78));
    byPart.push([String(part.bone || 'w'), part.face ? 'F' : 'T', (g.index ? g.index.count : g.attributes.position.count) / 3, part.color || '']);
    g.applyMatrix4(part.M);
    if (part.face) appendGeo(face, g, part, index, 0, false);
    else appendGeo(toon, g, part, index, 0, true);
    if (part.outline && !part.face) {
      const gh = part.make(part.hullDetail || 0.5);
      gh.applyMatrix4(part.M);
      // hull normals must be smooth; lathes/spheres already are
      appendGeo(hull, gh, part, index, part.outline, false);
      gh.dispose();
    }
    g.dispose();
  }
  return {
    toon: finish(toon, { uv: true, dq: true }),
    hull: finish(hull, { uv: false, dq: false }),
    face: finish(face, { uv: false, dq: false }),
    tris: { toon: toon.idx.length / 3, hull: hull.idx.length / 3, face: face.idx.length / 3 },
    byPart,
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// bodies: metrics + the base skeleton
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * o: {r head radius, leg, ankle, torso, neck, hipX, shX, arm, hand, bodyX, bodyZ, hipsUp, hair (extra height)}
 */
function makeBody(o) {
  const m = Object.assign({ hipsUp: 0.035, neck: 0.015, hair: 0.03 }, o);
  m.L1 = m.leg * 0.52; m.L2 = m.leg * 0.48; m.legLen = m.leg;
  m.hipY = m.ankle + m.leg * 0.985;
  m.footY = m.hipY - m.leg;                         // bind height of the ankle joint
  m.spineY = m.hipY + m.hipsUp + m.torso * 0.16;
  m.chestY = m.hipY + m.torso * 0.62;
  m.neckY = m.hipY + m.torso;
  m.shoulderY = m.neckY - m.torso * 0.11;
  m.shoulderX = m.shX;
  m.headBase = m.neckY + m.neck;
  m.headR = m.r;
  m.headC = m.headBase + m.r * 0.9;
  m.headY = m.headC;
  m.A1 = m.arm * 0.5; m.A2 = m.arm * 0.5;
  m.handY = m.shoulderY - m.arm;
  m.top = m.headC + m.r * 0.97;
  m.height = m.top + m.hair;
  m.k = m.height / 1.6;
  m.eyeLook = m.r * 0.05;
  m.ankleY = m.ankle;
  return m;
}

function baseJoints(K) {
  const m = K.m;
  K.joint('root', null, [0, 0, 0]);
  K.joint('hips', 'root', [0, m.hipY + m.hipsUp, 0]);
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    K.joint('thigh' + S, 'hips', [s * m.hipX, m.hipY, 0]);
    K.joint('shin' + S, 'thigh' + S, [s * m.hipX, m.hipY - m.L1, 0]);
    K.joint('foot' + S, 'shin' + S, [s * m.hipX, m.footY, 0]);
  }
  K.joint('spine', 'hips', [0, m.spineY, 0]);
  K.joint('chest', 'spine', [0, m.chestY, 0]);
  K.joint('neck', 'chest', [0, m.neckY, 0]);
  K.joint('head', 'neck', [0, m.headBase, 0]);
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    K.joint('clav' + S, 'chest', [s * m.shX * 0.45, m.shoulderY, 0]);
    K.joint('arm' + S, 'clav' + S, [s * m.shX, m.shoulderY, 0]);
    K.joint('fore' + S, 'arm' + S, [s * m.shX, m.shoulderY - m.A1, 0]);
    K.joint('hand' + S, 'fore' + S, [s * m.shX, m.handY, 0]);
  }
}

// ── skin weights ────────────────────────────────────────────────────────────────────────────────────────────
function wTorso(m) {
  return (p) => {
    const hipsW = 1 - sstep(m.hipY + m.hipsUp - 0.02 * m.k, m.spineY + 0.04 * m.k, p.y);
    const chestW = sstep(m.spineY + 0.02 * m.k, m.chestY, p.y);
    return [['hips', hipsW], ['chest', chestW], ['spine', Math.max(0, 1 - hipsW - chestW)]];
  };
}
/** skirts / robes / surcoat tails: panels swing with the legs */
function wSkirt(m, topY, hemY) {
  return (p) => {
    const t = clamp((topY - p.y) / Math.max(0.01, topY - hemY), 0, 1);
    const panel = Math.pow(t, 1.15);
    const ang = Math.atan2(p.x, p.z), c = Math.cos(ang);
    const f = Math.max(0, c), b = Math.max(0, -c), side = 1 - f - b;
    return [['hips', 1 - panel], ['skirtF', panel * (f + side * 0.5)], ['skirtB', panel * (b + side * 0.5)]];
  };
}
function skirtJoints(K, y, zf = 0.08) {
  const m = K.m;
  K.joint('skirtF', 'hips', [0, y, zf * m.k]);
  K.joint('skirtB', 'hips', [0, y, -zf * m.k]);
}
/** cloaks: shoulders ride the chest, the rest hangs off a 3-bone chain */
function wCloak(m, topY, hemY) {
  return (p) => {
    const t = clamp((topY - p.y) / Math.max(0.01, topY - hemY), 0, 1);
    const ang = Math.atan2(p.x, p.z), front = Math.max(0, Math.cos(ang)) ** 1.5;
    const w1 = 1 - sstep(0.0, 0.45, t), w3 = sstep(0.5, 1.0, t), w2 = Math.max(0, 1 - w1 - w3);
    const hang = sstep(0.0, 0.12, t) * (1 - front * 0.65);
    return [['chest', 1 - hang], ['cloak1', w1 * hang], ['cloak2', w2 * hang], ['cloak3', w3 * hang]];
  };
}
function cloakJoints(K, topY, hemY, backZ) {
  const m = K.m;
  K.joint('cloak1', 'chest', [0, topY, backZ * 0.3]);
  K.joint('cloak2', 'cloak1', [0, lerp(topY, hemY, 0.45), backZ * 0.9]);
  K.joint('cloak3', 'cloak2', [0, lerp(topY, hemY, 0.78), backZ * 1.2]);
  void m;
}

// ── standard pieces ─────────────────────────────────────────────────────────────────────────────────────────
/** the head ball, ears, nose. o: {skin, sx, sy, sz, ears, earScale, nose:'button'|'big'|'round'|'none', noseC} */
function stdHead(K, o) {
  const m = K.m, r = m.r;
  const sx = o.sx || 1.04, sy = o.sy || 0.97, sz = o.sz || 0.98;
  K.head = { c: [0, m.headC, 0], rx: r * sx, ry: r * sy, rz: r * sz };
  K.add((d) => G.head(d), TRS([0, m.headC, 0], [0, 0, 0], [r * sx, r * sy, r * sz]), { bone: 'head', color: o.skin, skin: true, outline: OUTLINE.head, rep: [2, 1], hullDetail: 0.7 });
  if (o.ears !== false) {
    const es = o.earScale || 1;
    for (const s of [1, -1]) {
      const { P } = K.onHead(s * Math.PI / 2, -0.08, -r * 0.05);
      K.ball('head', [P.x, P.y, P.z - r * 0.02], [r * 0.13 * es, r * 0.24 * es, r * 0.2 * es], o.skin, { skin: true, outline: OUTLINE.char, detail: 0.6 });
    }
  }
  const nose = o.nose || 'button';
  if (nose !== 'none') {
    const nr = nose === 'big' ? 0.21 : nose === 'round' ? 0.16 : 0.115;
    const { P } = K.onHead(0, -0.3, -r * nr * 0.35);
    K.ball('head', [P.x, P.y, P.z], [r * nr * 1.05, r * nr * 0.9, r * nr], o.noseC || o.skin, { skin: true, outline: nose === 'button' ? 0 : OUTLINE.char, detail: 0.7 });
  }
}

/**
 * eyes + brows. o: {style:'oval'|'dot'|'big'|'narrow'|'arc', yaw, pitch, w, h, lash, brow:'line'|'bushy'|'none',
 *   browColor, browW, browPitch, highlights}
 */
function stdEyes(K, o = {}) {
  const m = K.m, r = m.r;
  const yaw = o.yaw ?? 0.36, pitch = o.pitch ?? -0.12;
  const style = o.style || 'oval';
  const w = (o.w ?? 0.15) * r, h = (o.h ?? 0.25) * r;
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const { P } = K.onHead(s * yaw, pitch, 0);
    K.joint('eye' + S, 'head', [P.x, P.y, P.z]);
    if (style === 'arc') {
      K.decal('eye' + S, s * yaw, pitch, r * 0.01, (d) => G.torus(w * 1.0, r * 0.022, d, Math.PI), COL.eye, { rot: [0, 0, 0] });
    } else if (style === 'adult') {
      // a grown-up's eye: warm white almond, a dark iris set toward the nose, a thick upper lid that droops kindly
      // at the outer corner. Deep enough to still read in profile.
      const ew = w, eh = h;
      K.decal('eye' + S, s * yaw, pitch, -ew * 0.1, (d) => G.ell(d * 0.9), COL.sclera, { scale: [ew, eh, ew * 0.55] });
      K.decal('eye' + S, s * yaw, pitch, ew * 0.22, (d) => G.ell(d * 0.8), COL.eye, { p: [-s * ew * 0.12, -eh * 0.08, 0], scale: [ew * 0.52, eh * 0.86, ew * 0.3] });
      K.decal('eye' + S, s * yaw, pitch, ew * 0.42, (d) => G.ell(d * 0.4), COL.white, { p: [-s * ew * 0.02, eh * 0.28, 0], scale: [ew * 0.17, ew * 0.17, ew * 0.08] });
      K.decal('eye' + S, s * yaw, pitch, ew * 0.2, (d) => G.torus(ew * 1.02, r * 0.03, d, Math.PI), COL.eye, { p: [0, -eh * 0.18, 0], rot: [0, 0, s * -0.12], scale: [1, eh / ew * 1.25, 1] });
    } else {
      const ew = style === 'dot' ? w * 0.72 : style === 'narrow' ? w * 0.95 : style === 'big' ? w * 1.18 : w;
      const eh = style === 'dot' ? w * 0.9 : style === 'narrow' ? h * 0.7 : style === 'big' ? h * 1.12 : h;
      // deep enough to stand proud of the head: a face still reads when the head is seen in profile
      K.decal('eye' + S, s * yaw, pitch, -ew * 0.08, (d) => G.ell(d * 0.9), COL.eye, { scale: [ew, eh, ew * 0.62] });
      if (style !== 'dot' || o.highlights) {
        K.decal('eye' + S, s * yaw, pitch, ew * 0.3, (d) => G.ell(d * 0.5), COL.white, { p: [-s * ew * 0.28 + ew * 0.05, eh * 0.38, 0], scale: [ew * 0.36, ew * 0.4, ew * 0.2] });
        if (style === 'big') K.decal('eye' + S, s * yaw, pitch, ew * 0.3, (d) => G.ell(d * 0.4), COL.white, { p: [s * ew * 0.3, -eh * 0.35, 0], scale: [ew * 0.18, ew * 0.18, ew * 0.1] });
      }
      if (o.lash) {
        // a single flick at the outer top corner
        K.decal('eye' + S, s * yaw, pitch, ew * 0.1, (d) => G.ell(d * 0.5), COL.eye, { p: [s * ew * 0.95, eh * 0.72, 0], rot: [0, 0, s * -0.9], scale: [ew * 0.5, ew * 0.16, ew * 0.12] });
      }
    }
    const brow = o.brow || 'line';
    if (brow !== 'none') {
      const bp = o.browPitch ?? pitch + 0.33;
      const byaw = s * (yaw + 0.02);
      const { P: BP } = K.onHead(byaw, bp, 0);
      K.joint('brow' + S, 'head', [BP.x, BP.y, BP.z]);
      const bw = (o.browW ?? 0.2) * r;
      if (brow === 'heavy') {
        // a heavy, shaggy ridge set low over the eye: a grown man's brow (toon, so it catches the light like hair)
        K.headPart('brow' + S, byaw, bp, r * 0.05, (d) => G.ell(d * 0.8), o.browColor || COL.eye, { scale: [bw, bw * 0.36, bw * 0.46], rot: [0.25, 0, s * (o.browTilt ?? -0.16)], outline: 0 });
        K.headPart('brow' + S, byaw + s * bw / r * 0.62, bp - 0.05, r * 0.045, (d) => G.ell(d * 0.6), o.browColor || COL.eye, { scale: [bw * 0.5, bw * 0.3, bw * 0.36], rot: [0.2, 0, s * -0.55], outline: 0 });
      } else if (brow === 'bushy') {
        K.headPart('brow' + S, byaw, bp, r * 0.03, (d) => G.ell(d * 0.7), o.browColor || COL.eye, { scale: [bw, bw * 0.42, bw * 0.4], rot: [0, 0, s * -0.12], outline: 0 });
      } else {
        K.decal('brow' + S, byaw, bp, r * 0.005, (d) => G.ell(d * 0.6), o.browColor || COL.eye, { scale: [bw * 0.55, r * 0.028, r * 0.02], rot: [0, 0, s * -0.1] });
      }
    }
  }
}

/** mouth set (smile arc, open mouth, O mouth) + blush. o: {pitch, w, blush:'always'|'anim', cheekColor} */
function stdMouth(K, o = {}) {
  const m = K.m, r = m.r;
  const pitch = o.pitch ?? -0.5, w = (o.w ?? 0.13) * r;
  const { P } = K.onHead(0, pitch, 0);
  K.joint('mouth', 'head', [P.x, P.y, P.z]);
  K.joint('mouthOpen', 'head', [P.x, P.y + w * 0.1, P.z]);
  K.joint('mouthO', 'head', [P.x, P.y - w * 0.3, P.z]);
  // smile: a "U" arc
  K.decal('mouth', 0, pitch, r * 0.012, (d) => G.torus(w, r * 0.024, d, Math.PI), o.color || COL.mouth, { rot: [0, 0, Math.PI], p: [0, w * 0.5, 0] });
  // open mouth: a "D" on its back, with a tongue
  K.decal('mouthOpen', 0, pitch, r * 0.004, (d) => G.ell(d * 0.7), COL.mouth, { p: [0, -w * 0.62, 0], scale: [w * 1.15, w * 0.95, w * 0.3] });
  K.decal('mouthOpen', 0, pitch - 0.05, r * 0.02, (d) => G.ell(d * 0.5), COL.tongue, { p: [0, -w * 0.72, 0], scale: [w * 0.62, w * 0.36, w * 0.2] });
  // O
  K.decal('mouthO', 0, pitch - 0.04, r * 0.004, (d) => G.ell(d * 0.6), COL.mouth, { scale: [w * 0.55, w * 0.72, w * 0.3] });
  // cheeks
  const cc = o.cheekColor || COL.cheek;
  const cheekYaw = o.cheekYaw ?? 0.62, cheekPitch = o.cheekPitch ?? -0.32;
  if (o.blush === 'always') for (const s of [1, -1]) K.decal('head', s * cheekYaw, cheekPitch, -r * 0.018, (d) => G.ell(d * 0.6), cc, { scale: [r * 0.16, r * 0.1, r * 0.05] });
  const { P: BP } = K.onHead(0, cheekPitch, 0);
  K.joint('blush', 'head', [0, BP.y, BP.z * 0.6]);
  for (const s of [1, -1]) K.decal('blush', s * cheekYaw, cheekPitch, -r * 0.012, (d) => G.ell(d * 0.6), mixHex(cc, PAL.flower.red, 0.25), { scale: [r * 0.17, r * 0.11, r * 0.05] });
}

/**
 * legs. o: {pants, pantsTo:'ankle'|'knee'|'hip', legSkin, sock, boot, bootStyle:'chunky'|'shoe'|'tall', cuff, knee}
 */
function stdLegs(K, o) {
  const m = K.m, k = m.k;
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const hip = [s * m.hipX, m.hipY, 0], knee = [s * m.hipX, m.hipY - m.L1, 0], ank = [s * m.hipX, m.footY, 0];
    const rT = (o.thigh ?? 0.07) * k, rK = (o.knee ?? 0.055) * k, rA = (o.ankleR ?? 0.048) * k;
    const upper = o.pantsTo === 'hip' ? (o.legSkin || COL.skin) : o.pants;
    const lower = o.pantsTo === 'ankle' ? o.pants : (o.sock && o.sockHigh ? o.sock : (o.legSkin || COL.skin));
    K.limb('thigh' + S, hip, knee, rT, rK, upper, { weave: o.pantsTo === 'hip' ? 0 : (o.pantsWeave ?? 0.8), skin: o.pantsTo === 'hip', sx: 1.0 });
    K.limb('shin' + S, knee, [ank[0], ank[1] + 0.01 * k, 0], rK * 0.98, rA, lower, { weave: o.pantsTo === 'ankle' ? (o.pantsWeave ?? 0.8) : 0, skin: o.pantsTo !== 'ankle' && !(o.sock && o.sockHigh) });
    if (o.pantsTo === 'knee') K.torus('thigh' + S, [knee[0], knee[1] + 0.035 * k, 0], rK * 1.05, 0.016 * k, o.pants, { weave: 0.6 });
    if (o.kneePatch) K.ball('shin' + S, [knee[0], knee[1] - 0.012 * k, rK * 0.85], [rK * 0.5, rK * 0.4, rK * 0.25], o.kneePatch, { outline: 0 });
    if (o.sock && !o.sockHigh) K.torus('shin' + S, [ank[0], ank[1] + 0.06 * k, 0], rA * 1.05, 0.02 * k, o.sock, { weave: 0.6 });
    // boots: shaft + a round toe; the sole sits at ground when the ankle is at m.ankle
    const style = o.bootStyle || 'chunky';
    const bh = m.ankle;
    const toeL = (style === 'shoe' ? 0.075 : 0.09) * k * (o.bootScale || 1);
    const toeW = (style === 'shoe' ? 0.052 : 0.066) * k * (o.bootScale || 1);
    const toeH = (style === 'shoe' ? 0.045 : 0.06) * k * (o.bootScale || 1);
    K.ball('foot' + S, [ank[0], ank[1] - bh + toeH * 0.95, 0.035 * k * (o.bootScale || 1)], [toeW, toeH, toeL], o.boot, { detail: 0.9, grad: [ank[1] - bh, ank[1] - bh + toeH, 0.82] });
    if (style !== 'shoe') {
      const shaftTop = style === 'tall' ? m.L2 * 0.62 : 0.03 * k;
      K.limb('foot' + S, [ank[0], ank[1] + shaftTop, -0.005 * k], [ank[0], ank[1] - bh + toeH * 1.1, 0], rA * 1.18, toeW * 0.92, o.boot, { detail: 0.8 });
      K.torus(style === 'tall' ? 'shin' + S : 'foot' + S, [ank[0], ank[1] + shaftTop + 0.005 * k, -0.005 * k], rA * 1.22, 0.017 * k, o.cuff || scaleHex(o.boot, 0.8), { detail: 0.8 });
    } else if (o.buckle) {
      K.box('foot' + S, [ank[0], ank[1] - bh + toeH * 1.7, 0.07 * k], [0.035 * k, 0.02 * k, 0.012 * k], o.buckle, { rot: [-0.5, 0, 0] });
    }
  }
}

/** arms. o: {sleeve, sleeveTo:'wrist'|'elbow'|'short'|'none', skin, puff, cuff, hand(color), upperR, foreR, handR} */
function stdArms(K, o) {
  const m = K.m, k = m.k;
  for (const [s, S] of [[1, 'L'], [-1, 'R']]) {
    const sh = [s * m.shX, m.shoulderY, 0], el = [s * m.shX, m.shoulderY - m.A1, 0], wr = [s * m.shX, m.handY + 0.01 * k, 0];
    const rU = (o.upperR ?? 0.048) * k, rF = (o.foreR ?? 0.042) * k, rW = rF * 0.85;
    const to = o.sleeveTo || 'wrist';
    const upperCol = to === 'none' ? o.skin : o.sleeve, foreCol = to === 'wrist' ? o.sleeve : o.skin;
    K.limb('arm' + S, sh, el, rU, rF * 1.02, upperCol, { weave: to === 'none' ? 0 : 0.8, skin: to === 'none' });
    K.limb('fore' + S, el, wr, rF, rW, foreCol, { weave: to === 'wrist' ? 0.8 : 0, skin: to !== 'wrist' });
    if (o.puff) K.ball('arm' + S, [sh[0] + s * 0.005 * k, sh[1] - 0.03 * k, 0], [rU * 1.55, rU * 1.5, rU * 1.5], o.puffColor || o.sleeve, { weave: 0.8 });
    else K.ball('arm' + S, [sh[0], sh[1], 0], [rU * 1.12, rU * 1.12, rU * 1.12], upperCol, { weave: to === 'none' ? 0 : 0.8, skin: to === 'none', outline: 0, detail: 0.7 });
    if (to === 'elbow' || to === 'short') K.torus(to === 'short' ? 'arm' + S : 'fore' + S, to === 'short' ? [sh[0], sh[1] - m.A1 * 0.45, 0] : [el[0], el[1] - 0.005 * k, 0], (to === 'short' ? rU : rF) * 1.12, 0.018 * k, o.cuff || o.sleeve, { weave: 0.6 });
    if (o.cuff && to === 'wrist') K.torus('fore' + S, [wr[0], wr[1] + 0.03 * k, 0], rW * 1.18, 0.02 * k, o.cuff, { weave: 0.5 });
    if (o.bracer) K.limb('fore' + S, [el[0], el[1] - m.A2 * 0.35, 0], [wr[0], wr[1] + 0.025 * k, 0], rF * 1.12, rW * 1.15, o.bracer, { outline: 0 });
    // mitten hand + thumb
    const hr = (o.handR ?? 0.055) * k;
    const hc = [s * m.shX, m.handY - hr * 0.75, hr * 0.1];
    K.ball('hand' + S, hc, [hr * 0.92, hr * 1.02, hr * 0.86], o.hand || o.skin, { skin: !o.hand, detail: 0.9 });
    K.ball('hand' + S, [hc[0] - s * hr * 0.18, hc[1] + hr * 0.2, hc[2] + hr * 0.72], [hr * 0.36, hr * 0.46, hr * 0.36], o.hand || o.skin, { skin: !o.hand, outline: OUTLINE.char, detail: 0.5, rot: [0.4, 0, 0] });
    K.joint('prop' + S, 'hand' + S, [s * m.shX, m.handY - hr * 0.75, 0.0]);
  }
}

/** torso lathe from a profile of [radius, dy above hipY]. o: {color, weave, zs, xs, detail} */
function stdTorso(K, prof, o) {
  const m = K.m;
  const P = prof.map(([r, y]) => [r * m.k, y * m.k]);
  K.lathe(null, [0, m.hipY, 0], P, o.color, { weights: wTorso(m), weave: o.weave ?? 1, scale: [o.xs || 1, 1, o.zs || 0.82], detail: o.detail || 1.1, grad: o.grad });
}

/**
 * A treasure for the item-held-aloft pose (hidden until celebrate). It sits IN the fist of the free hand (the left one
 * when the right carries something): in bind pose that is just past the mitten's fingers, so when the arm goes up the
 * treasure rides on top of the fist.
 */
function stdItem(K) {
  const m = K.m, k = m.k;
  const side = K.style && K.style.propR ? 'L' : 'R', sd = side === 'L' ? 1 : -1;
  const hand = K.abs('hand' + side) || [sd * m.shX, m.handY, 0];
  const s = 0.105 * Math.max(0.95, Math.min(1.2, k));
  const hr = 0.075 * k;
  const c = [hand[0], hand[1] - hr * 1.3, hand[2] + 0.02 * k];
  K.joint('item', 'hand' + side, c);
  K.add(() => new THREE.OctahedronGeometry(1, 0), TRS(c, [0, 0, 0], [s * 0.78, s * 1.2, s * 0.78]), { bone: 'item', color: PAL.water.light, outline: 0, rep: [1, 1] });
  K.torus('item', c, s * 0.66, s * 0.13, COL.gold, { rot: [Math.PI / 2, 0, 0] });
  K.ball('item', [c[0] - s * 0.28, c[1] + s * 0.42, c[2] + s * 0.4], [s * 0.15, s * 0.15, s * 0.08], PAL.water.foam, { outline: 0, detail: 0.4 });
}

// ── hair & cloth helpers ────────────────────────────────────────────────────────────────────────────────────
/** a hair cap over the crown. o: {theta (0..PI), tilt, grow, yaw, detail} */
function hairCap(K, color, o = {}) {
  const h = K.head, g = o.grow ?? 1.07;
  K.add((d) => G.sphereCap(d * (o.detail || 1.2), (o.theta ?? 0.58) * Math.PI), TRS([h.c[0], h.c[1] + (o.dy || 0) * K.m.r, h.c[2] + (o.dz || 0) * K.m.r], [o.tilt ?? -0.45, o.yaw || 0, 0, 'YXZ'], [h.rx * g * (o.sx || 1), h.ry * g, h.rz * g * (o.sz || 1)]),
    { bone: 'head', color, outline: OUTLINE.char, rep: [3, 2] });
}
/** a soft lock of hair sitting on the head surface: an ellipsoid pointing along `rot` */
function lock(K, yaw, pitch, size, color, o = {}) {
  const r = K.m.r;
  K.headPart(o.bone || 'head', yaw, pitch, (o.lift ?? 0.02) * r, (d) => G.ell(d * (o.detail || 0.8)), color, { scale: [size[0] * r, size[1] * r, size[2] * r], rot: o.rot || [0, 0, 0], outline: o.outline ?? 0, p: o.p || [0, 0, 0] });
}
/** open-front cloak or cape: outer cloth + darker lining. prof bottom->top [[r, y]] absolute y */
function cloak(K, prof, color, lining, o = {}) {
  const m = K.m;
  const open = o.open ?? 1.2;
  const top = prof[prof.length - 1][1], hem = prof[0][1];
  cloakJoints(K, top, hem, -(o.backZ ?? 0.18) * m.k);
  const w = wCloak(m, o.hangFrom ?? m.shoulderY, hem);
  const sc = [o.xs || 1, 1, o.zs || 0.92];
  K.lathe(null, [0, 0, o.z || 0], prof, color, { weights: w, weave: 1, phiStart: open, phiLen: TAU - 2 * open, scale: sc, detail: 1.1, grad: [hem, hem + 0.25 * m.k, 0.86] });
  const inner = prof.map(([r, y]) => [Math.max(0.001, r - 0.012 * m.k), y]);
  K.lathe(null, [0, 0, o.z || 0], inner, lining, { weights: w, weave: 1, phiStart: open, phiLen: TAU - 2 * open, scale: sc, detail: 0.9, flip: true, outline: 0 });
}
/** skirt / robe: full lathe with an optional petticoat, panels on skirtF / skirtB. prof bottom->top */
function skirt(K, prof, color, o = {}) {
  const m = K.m;
  const top = prof[prof.length - 1][1], hem = prof[0][1];
  skirtJoints(K, lerp(top, hem, 0.2), o.panelZ ?? 0.06);
  const w = wSkirt(m, top, hem);
  K.lathe(null, [0, 0, o.z || 0], prof, color, { weights: w, weave: o.weave ?? 1, scale: [o.xs || 1, 1, o.zs || 0.9], detail: o.detail || 1.1, grad: [hem, hem + 0.2 * m.k, 0.84], phiStart: o.phiStart || 0, phiLen: o.phiLen || TAU });
  const inner = prof.map(([r, y]) => [Math.max(0.001, r - 0.01 * m.k), y]);
  K.lathe(null, [0, 0, o.z || 0], inner, o.lining || scaleHex(color, 0.7), { weights: w, weave: 0, scale: [o.xs || 1, 1, o.zs || 0.9], detail: 0.8, flip: true, outline: 0, phiStart: o.phiStart || 0, phiLen: o.phiLen || TAU });
}

/**
 * A shaggy hair / fur mass: a CLOSED shell (outer surface, pointed tufts, inner wall tucked under the skin) hugging an
 * ellipsoid E = {c:[x,y,z], rx, ry, rz}. One continuous piece with one outline, so a beard reads as hair and a mane
 * with grey temples reads as one head of hair (not as separate outlined blobs).
 *   o.yaw0 / o.yaw1   range round the ellipsoid (0 = +Z front); o.wrap = full circle (yaw -PI..PI, seam at the back)
 *   o.top(a, yaw)     pitch of the upper edge (PI/2 = crown); a = |yaw|
 *   o.bot(a, yaw)     pitch of the lower edge, before tufts
 *   o.tuft(a, yaw)    extra pitch (radians of arc) the pointed tufts hang past the edge
 *   o.thick(a, t)     thickness in world units at t (0 upper edge .. 1 tip)
 *   o.locks, o.lockDepth   clumps across the range and how deep the grooves between them are
 *   o.hang            pitch below which the mass stops hugging and hangs straight down (beards, napes)
 *   o.flare, o.fwd    outward / forward push per unit of hanging length
 *   o.topTaper        0..1 of t over which the mass grows out of the skin (0 = starts at full thickness)
 *   o.color(q, lc, a, t) -> THREE.Color (linear); q = unit direction on the ellipsoid, lc = 1 at a lock's centre
 */
function shagGeo(E, o) {
  const nu = o.nu || 64, nv = o.nv || 12;
  const wrap = !!o.wrap;
  const yaw0 = wrap ? -Math.PI : o.yaw0, yaw1 = wrap ? Math.PI : o.yaw1;
  const locks = o.locks || 12, depth = o.lockDepth ?? 0.4;
  const hang = o.hang ?? -9, flare = o.flare ?? 0, fwd = o.fwd ?? 0;
  const inset = o.inset ?? 0.012;
  const cols = wrap ? nu : nu + 1;
  const rows = nv * 2 + 1;
  const pos = new Float32Array(cols * rows * 3), col = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2);
  const surf = (yaw, pitch, P, N) => {
    // point + outward normal; below `hang` the mass drops straight down from the hang line
    const pp = Math.max(pitch, hang);
    const d = V3(Math.sin(yaw) * Math.cos(pp), Math.sin(pp), Math.cos(yaw) * Math.cos(pp));
    P.set(E.c[0] + d.x * E.rx, E.c[1] + d.y * E.ry, E.c[2] + d.z * E.rz);
    N.set(d.x / E.rx, d.y / E.ry, d.z / E.rz).normalize();
    if (pitch < hang) {
      const L = (hang - pitch) * (E.ry + Math.hypot(d.x * E.rx, d.z * E.rz)) * 0.5;
      const hz = V3(N.x, 0, N.z); if (hz.lengthSq() < 1e-6) hz.set(Math.sin(yaw), 0, Math.cos(yaw)); hz.normalize();
      P.y -= L; P.addScaledVector(hz, L * flare); P.z += L * fwd;
      N.lerp(hz, clamp((hang - pitch) * 4, 0, 1)).normalize();
    }
    return d;
  };
  const Pn = V3(), Nn = V3(), c = new THREE.Color();
  for (let iu = 0; iu < cols; iu++) {
    const u = iu / nu, yaw = lerp(yaw0, yaw1, u), a = Math.abs(yaw);
    const lph = u * locks;
    const lc = 0.5 + 0.5 * Math.cos(lph * TAU);                         // 1 at a lock's centre, 0 in the groove
    const tri = Math.abs(((lph + 0.5) % 1) * 2 - 1);                      // 1 at a lock's centre
    const jig = 0.55 + 0.9 * hash01(Math.floor(lph + 0.5) * 7.31 + (o.seed || 0));
    const endK = wrap ? 1 : sstep(0, o.endTaper ?? 0.06, u) * sstep(0, o.endTaper ?? 0.06, 1 - u);
    const top = o.top(a, yaw), bot = o.bot(a, yaw);
    const edge = bot - (o.tuft ? o.tuft(a, yaw) : 0) * Math.pow(tri, 1.6) * jig * endK;
    for (let r = 0; r < rows; r++) {
      const outer = r <= nv;
      const t = outer ? r / nv : (rows - 1 - r) / nv;
      const pitch = lerp(top, lerp(bot, edge, sstep(0.55, 1, t)), t);
      const d = surf(yaw, pitch, Pn, Nn);
      const grow = o.topTaper ? sstep(0, o.topTaper, t) : 1;
      const tip = 1 - sstep(0.62, 1, t) * 0.94;
      const th = o.thick(a, t, yaw) * (1 - depth * (1 - lc)) * grow * tip * endK;
      const k = (r * cols + iu);
      if (outer) Pn.addScaledVector(Nn, th); else Pn.addScaledVector(Nn, -inset * (0.3 + 0.7 * grow));
      pos[k * 3] = Pn.x; pos[k * 3 + 1] = Pn.y; pos[k * 3 + 2] = Pn.z;
      uv[k * 2] = lph; uv[k * 2 + 1] = t;
      c.copy(o.color(d, lc, a, t, yaw));
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }
  const idx = [];
  const segU = wrap ? nu : nu;
  for (let iu = 0; iu < segU; iu++) {
    const i2 = wrap ? (iu + 1) % cols : iu + 1;
    for (let r = 0; r < rows - 1; r++) {
      const a0 = r * cols + iu, b0 = r * cols + i2, a1 = (r + 1) * cols + iu, b1 = (r + 1) * cols + i2;
      idx.push(a0, a1, b0, b0, a1, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('dqcol', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the outer surface faces out
  const probe = Math.floor(nv / 2) * cols + Math.floor(cols / 2);
  surf(lerp(yaw0, yaw1, Math.floor(cols / 2) / nu), 0, Pn, Nn);
  const nrm = g.attributes.normal, P = g.attributes.position;
  const outDir = V3(P.getX(probe) - E.c[0], P.getY(probe) - E.c[1], P.getZ(probe) - E.c[2]);
  if (V3(nrm.getX(probe), nrm.getY(probe), nrm.getZ(probe)).dot(outDir) < 0) {
    const I = g.index; for (let i = 0; i < I.count; i += 3) { const b = I.getX(i + 1); I.setX(i + 1, I.getX(i + 2)); I.setX(i + 2, b); }
    g.computeVertexNormals();
  }
  return g;
}
const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** add a shag mass as one part (same resolution for the body and its outline, so the tufts' outlines line up) */
function shag(K, bone, E, o) {
  let cached = null;
  const make = () => (cached ? cached.clone() : (cached = shagGeo(E, o)).clone());
  return K.add(make, new THREE.Matrix4(), { bone, color: PAL.char.hair, outline: o.outline ?? OUTLINE.char, rep: [1, 1], hullDetail: 1 });
}
/** angle from the back of the head (0 at the back, PI at the face) */
const fromBack = (yaw) => Math.abs(Math.atan2(Math.sin(yaw - Math.PI), Math.cos(yaw - Math.PI)));
/**
 * A bald man's horseshoe of hair: one fluffy band round the back of the head from temple to temple, bushiest over
 * the ears (o.sideburn drops it down the cheeks). One outline for the whole band.
 */
function fringe(K, color, o = {}) {
  const r = K.m.r, base = LC(color), shade = LC(scaleHex(color, o.shade ?? 0.86)), cc = new THREE.Color();
  const ear = (fb) => Math.exp(-(((fb - 1.55) / 0.42) ** 2));
  return shag(K, 'head', K.head, {
    yaw0: o.from ?? 1.12, yaw1: TAU - (o.from ?? 1.12), nu: 40, nv: 7, locks: o.locks || 15, lockDepth: 0.4, seed: o.seed || 5, topTaper: 0.3, endTaper: 0.12,
    top: (a, yaw) => lerp(o.top ?? 0.24, -0.02, sstep(1.0, 2.0, fromBack(yaw))),
    bot: (a, yaw) => lerp(o.bot ?? -0.4, o.sideburn ?? -0.22, sstep(0.8, 2.0, fromBack(yaw))),
    tuft: (a, yaw) => (o.tuft ?? 0.1) * (0.6 + 0.8 * ear(fromBack(yaw))),
    thick: (a, t, yaw) => r * ((o.thick ?? 0.075) + (o.puff ?? 0.08) * ear(fromBack(yaw))),
    color: (q, lc) => cc.copy(shade).lerp(base, 0.4 + 0.6 * lc),
  });
}
/** a toon colour helper for shag colour functions */
const LC = (hex) => C3(hex);

/**
 * A limb with a real muscle profile (bicep, forearm bulge) between two bind points. prof: [[t 0..1, radius]...]
 * from a to b; rounded caps both ends.
 */
function limbProf(K, bone, a, b, prof, color, o = {}) {
  const A = V3(...a), B = V3(...b), dir = B.clone().sub(A), len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, -1, 0), dir.normalize());
  const M = new THREE.Matrix4().compose(A, q, V3(o.sx || 1, 1, o.sz || 1));
  const make = (d) => {
    const pts = [], r0 = prof[0][1], r1 = prof[prof.length - 1][1], n = Math.max(2, Math.round(3 * d));
    for (let i = 0; i <= n; i++) { const an = -Math.PI / 2 + (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(an) * r1 + 1e-4, -len + Math.sin(an) * r1 * 0.7)); }
    for (let i = prof.length - 2; i >= 1; i--) pts.push(new THREE.Vector2(prof[i][1], -prof[i][0] * len));
    for (let i = 0; i <= n; i++) { const an = (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(an) * r0 + 1e-4, Math.sin(an) * r0 * 0.7)); }
    return new THREE.LatheGeometry(pts, Math.max(8, Math.round(14 * d * (o.detail || 1))));
  };
  return K.add(make, M, Object.assign({ bone, color, outline: OUTLINE.char, rep: [3, Math.max(1, len / WEAVE_WORLD)] }, o));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CAST
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const DEFS = {};

// ── Bram, the hero ──────────────────────────────────────────────────────────────────────────────────────────
// CANON: round-headed boy in a too-big green travelling cloak, half a green ribbon knotted on his left wrist;
// grows into a broad, sun-browned man still wearing that frayed ribbon.
function ribbonOnWrist(K, frayed) {
  const m = K.m, k = m.k;
  const wr = [m.shX, m.handY + 0.045 * k, 0];
  const rr = 0.042 * k * (frayed ? 1.25 : 1.05);
  K.torus('foreL', wr, rr, 0.014 * k, COL.ribbon, { rot: [Math.PI / 2, 0, 0.1] });
  // the knot and two tails, fluttering at the outside of the wrist
  K.ball('foreL', [wr[0] + rr * 0.9, wr[1], wr[2] + rr * 0.3], [0.018 * k, 0.02 * k, 0.018 * k], COL.ribbon, { outline: 0, detail: 0.5 });
  const L = frayed ? 0.045 : 0.07;
  for (const t of [-1, 1]) {
    const a = [wr[0] + rr * 0.95, wr[1] - 0.005 * k, wr[2] + rr * 0.35];
    const b = [a[0] + 0.02 * k, a[1] - L * k, a[2] + t * 0.03 * k];
    K.limb('foreL', a, b, 0.011 * k, 0.008 * k, COL.ribbon, { outline: 0, detail: 0.5, sz: 0.45 });
  }
}

DEFS.hero = {
  label: (a) => a < 12 ? 'Bram (6)' : `Bram (${a >= 20 ? 26 : 16})`,
  ages: [6, 16, 26],
  body(age) {
    if (age < 12) return { r: 0.228, leg: 0.3, ankle: 0.065, torso: 0.27, neck: 0.012, hipX: 0.072, shX: 0.165, arm: 0.27, bodyX: 0.15, bodyZ: 0.12, hair: 0.045 };
    const grown = age >= 20 ? 1 : 0.94;
    return { r: 0.245, leg: 0.52 * grown, ankle: 0.08, torso: 0.5 * grown, neck: 0.022, hipX: 0.1, shX: 0.27 * (0.95 + grown * 0.05), arm: 0.5 * grown, bodyX: 0.21, bodyZ: 0.15, hipsUp: 0.04, hair: 0.06 };
  },
  style(age) {
    return age < 12
      ? { kid: true, bounce: 1.2, armSwing: 1.1, smile: 0.95, hop: 1.25, fidget: 1.2, cloakLift: 1.2, weapon: 'sword', blinkEvery: 3.0, cloakArms: true, stride: 1.15 }
      : { bounce: 0.9, armSwing: 0.95, smile: 0.7, cloakLift: 1.0, weapon: 'sword', chestOut: 0.03, breathPeriod: 4 };
  },
  dress(K, age) {
    const m = K.m, k = m.k, kid = age < 12;
    const skin = kid ? COL.skin : COL.tan;
    const hair = PAL.char.hairBrown;
    if (kid) {
      stdLegs(K, { pants: PAL.cloth.leather, pantsTo: 'ankle', boot: COL.boot, bootStyle: 'chunky', thigh: 0.1, knee: 0.08, ankleR: 0.07, cuff: PAL.wood.dark, bootScale: 1.35 });
      stdTorso(K, [[0.001, -0.04], [0.15, -0.03], [0.2, 0.03], [0.21, 0.1], [0.2, 0.18], [0.17, 0.25], [0.11, 0.29], [0.001, 0.3]], { color: PAL.cloth.tunic, zs: 0.84 });
      // tunic skirt below the belt
      K.lathe(null, [0, 0, 0], [[0.19 * k * 1.45, m.hipY - 0.1 * k], [0.18 * k * 1.45, m.hipY - 0.04 * k], [0.16 * k * 1.45, m.hipY + 0.04 * k]].map(([r, y]) => [r / 1.45 * 1.0 + 0.0, y]), PAL.cloth.tunic, { weights: wTorso(m), weave: 1, scale: [1.02, 1, 0.86], detail: 0.9 });
      K.torus('hips', [0, m.hipY + 0.045 * k, 0], 0.2 * k, 0.022 * k, COL.belt, { scale: [1.02, 0.86, 1], weave: 0.3 });
      K.box('hips', [0, m.hipY + 0.045 * k, 0.175 * k], [0.06 * k, 0.05 * k, 0.02 * k], COL.gold);
      stdArms(K, { sleeve: PAL.cloth.tunic, sleeveTo: 'wrist', skin, upperR: 0.068, foreR: 0.06, handR: 0.083, cuff: scaleHex(PAL.cloth.tunic, 0.9) });
      ribbonOnWrist(K, false);
      // the too-big cloak: drags nearly to the ground, shoulders slump off the boy, hood bunched up behind
      cloak(K, [[0.335, 0.115], [0.35, 0.135], [0.335, 0.2], [0.31, 0.3], [0.27, m.shoulderY - 0.12], [0.24, m.shoulderY - 0.03], [0.19, m.neckY - 0.005], [0.125, m.neckY + 0.03]], PAL.cloth.green, PAL.cloth.greenDark, { open: 1.18, backZ: 0.2, zs: 0.98, z: -0.02 });
      K.torus('chest', [0, m.neckY + 0.012, -0.01], 0.13, 0.042, PAL.cloth.green, { weave: 1, outline: OUTLINE.char, detail: 1.1, scale: [1, 1, 0.82] });
      K.ball('chest', [0, m.neckY + 0.05, -0.16], [0.21, 0.13, 0.13], PAL.cloth.green, { weave: 1, rot: [0.35, 0, 0], grad: [m.neckY - 0.08, m.neckY + 0.12, 0.8] });
      for (const sd of [1, -1]) K.ball('chest', [sd * 0.14, m.neckY + 0.0, -0.06], [0.1, 0.09, 0.12], PAL.cloth.green, { weave: 1, rot: [0.2, sd * 0.4, 0] });
      K.ball('chest', [0, m.neckY - 0.01, 0.125], [0.028, 0.028, 0.02], COL.gold, { outline: 0, detail: 0.5 });
    } else {
      stdLegs(K, { pants: COL.darkTrousers, pantsTo: 'ankle', boot: COL.boot, bootStyle: 'tall', thigh: 0.078, knee: 0.062, ankleR: 0.052, cuff: PAL.wood.dark });
      stdTorso(K, [[0.001, -0.05], [0.16, -0.04], [0.2, 0.03], [0.19, 0.12], [0.21, 0.25], [0.235, 0.36], [0.2, 0.45], [0.12, 0.5], [0.001, 0.51]], { color: PAL.cloth.cream, zs: 0.76 });
      // leather jerkin, open at the throat
      K.lathe(null, [0, m.hipY, 0], [[0.215, -0.08], [0.215, 0.0], [0.205, 0.12], [0.225, 0.25], [0.248, 0.36], [0.21, 0.44]].map(([r, y]) => [r * k, y * k]), PAL.cloth.leather, { weights: wTorso(m), weave: 0.6, phiStart: 0.32, phiLen: TAU - 0.64, scale: [1, 1, 0.8], detail: 1 });
      K.torus('hips', [0, m.hipY + 0.02 * k, 0], 0.222 * k, 0.026 * k, COL.belt, { scale: [1, 0.8, 1], weave: 0.3 });
      K.box('hips', [0, m.hipY + 0.02 * k, 0.18 * k], [0.07 * k, 0.06 * k, 0.02 * k], COL.gold);
      K.ball('hips', [-0.16 * k, m.hipY - 0.03 * k, 0.1 * k], [0.06 * k, 0.07 * k, 0.04 * k], PAL.cloth.leather, { outline: OUTLINE.char, detail: 0.6 });
      stdArms(K, { sleeve: PAL.cloth.cream, sleeveTo: 'wrist', skin, upperR: 0.056, foreR: 0.05, handR: 0.068, bracer: PAL.cloth.leather });
      ribbonOnWrist(K, true);
      cloak(K, [[0.36, 0.3], [0.37, 0.33], [0.335, 0.5], [0.3, 0.72], [0.285, m.shoulderY - 0.12], [0.28, m.shoulderY - 0.02], [0.2, m.neckY - 0.01], [0.13, m.neckY + 0.03]], PAL.cloth.green, PAL.cloth.greenDark, { open: 1.45, backZ: 0.2, zs: 0.9, z: -0.02 });
      K.torus('chest', [0, m.neckY + 0.005, 0.0], 0.14, 0.045, PAL.cloth.green, { weave: 1, outline: OUTLINE.char, scale: [1.02, 1, 0.84] });
      K.ball('chest', [0, m.neckY - 0.01, -0.15], [0.17, 0.08, 0.1], PAL.cloth.greenDark, { weave: 1, rot: [0.5, 0, 0] });
      // sheathed sword on the left hip
      K.joint('sheath', 'hips', [0.2 * k, m.hipY, -0.05 * k]);
      K.limb('sheath', [0.2 * k, m.hipY + 0.02 * k, -0.02 * k], [0.26 * k, m.hipY - 0.55 * k, -0.2 * k], 0.03 * k, 0.026 * k, PAL.cloth.leather, { outline: OUTLINE.char, detail: 0.6, sz: 0.6 });
      K.box('sheath', [0.195 * k, m.hipY + 0.05 * k, -0.01 * k], [0.14 * k, 0.025 * k, 0.03 * k], COL.iron, { rot: [0.25, 0, -0.1] });
      K.limb('sheath', [0.19 * k, m.hipY + 0.16 * k, 0.03 * k], [0.195 * k, m.hipY + 0.06 * k, 0.0], 0.018 * k, 0.018 * k, PAL.cloth.leather, { outline: 0, detail: 0.5 });
      K.ball('sheath', [0.19 * k, m.hipY + 0.175 * k, 0.035 * k], 0.026 * k, COL.gold, { outline: 0, detail: 0.5 });
    }
    // ── head ──
    stdHead(K, { skin, nose: kid ? 'button' : 'button', earScale: kid ? 1.1 : 1 });
    stdEyes(K, kid ? { style: 'oval', w: 0.155, h: 0.26, yaw: 0.36, pitch: -0.1, brow: 'line', browColor: hair }
                   : { style: 'adult', w: 0.14, h: 0.1, yaw: 0.33, pitch: -0.04, brow: 'heavy', browColor: hair, browW: 0.22, browPitch: 0.17, browTilt: -0.08 });
    stdMouth(K, { pitch: kid ? -0.5 : -0.52, w: kid ? 0.13 : 0.12, blush: kid ? 'always' : 'anim' });
    // hair: a round brown cap, soft fringe locks, and (boy) the curl that will not lie down; (man) spikier
    hairCap(K, hair, { theta: 0.6, tilt: -0.5 });
    if (kid) {
      for (const [y, p, sx, rz] of [[-0.42, 0.52, 1.0, 0.45], [0, 0.6, 1.05, 0], [0.42, 0.52, 1.0, -0.45], [-0.95, 0.2, 0.8, 0.25], [0.95, 0.2, 0.8, -0.25]])
        lock(K, y, p, [0.33 * sx, 0.2, 0.2], hair, { rot: [0, 0, rz], lift: 0.02 });
      K.add((d) => G.torus(0.07, 0.026, d, Math.PI * 1.55), TRS([0, m.headC + m.r * 1.02, 0.03], [0, Math.PI / 2, 0.9], 1), { bone: 'head', color: hair, outline: OUTLINE.char, rep: [1, 1] });
    } else {
      for (const [y, p, len, rz, rx] of [[-0.5, 0.55, 0.36, 0.6, 0], [-0.15, 0.68, 0.4, 0.2, -0.2], [0.2, 0.66, 0.4, -0.25, -0.2], [0.55, 0.52, 0.36, -0.7, 0], [-1.0, 0.25, 0.3, 0.3, 0], [1.0, 0.25, 0.3, -0.3, 0], [2.6, 0.5, 0.36, 0.2, 0.4], [-2.6, 0.5, 0.36, -0.2, 0.4], [Math.PI, 0.3, 0.36, 0, 0.6]])
        lock(K, y, p, [0.2, len, 0.16], hair, { rot: [rx, 0, rz], lift: 0.05, outline: OUTLINE.char });
    }
    // wooden sword (boy) / steel sword (man), shown only when attacking
    const L = kid ? 0.34 : 0.62, bw = kid ? 0.05 : 0.07;
    const c = [-m.shX, m.handY - 0.05 * k, 0];
    const blade = kid ? PAL.wood.light : COL.steel;
    K.box('propR', [c[0], c[1], c[2] + L * 0.5 * k + 0.06 * k], [bw * k, 0.016 * k, L * k], blade);
    K.box('propR', [c[0], c[1], c[2] + 0.055 * k], [0.16 * k, 0.03 * k, 0.03 * k], kid ? PAL.wood.mid : COL.iron);
    K.box('propR', [c[0], c[1], c[2] - 0.02 * k], [0.035 * k, 0.035 * k, 0.12 * k], PAL.cloth.leather);
    if (!kid) K.box('propR', [c[0], c[1] + 0.009 * k, c[2] + L * 0.45 * k + 0.06 * k], [0.018 * k, 0.004 * k, L * 0.8 * k], COL.steelDark);
    stdItem(K);
  },
};

// ── Sir Halvard Bellwether ──────────────────────────────────────────────────────────────────────────────────
// CANON: enormous shaggy bear of a man in a patched blue surcoat, grey at the temples, greatsword carried like a
// walking stick.
DEFS.halvard = {
  label: () => 'Sir Halvard',
  ages: [41],
  // a Toriyama giant: ~2.07 u (Bram at 6 comes up to his belly), a barrel chest twice the boy's width on a narrower
  // waist, huge bare forearms, a small head in a big mane and beard
  body: () => ({ r: 0.25, leg: 0.66, ankle: 0.1, torso: 0.76, neck: 0.016, hipX: 0.155, shX: 0.47, arm: 0.66, bodyX: 0.4, bodyZ: 0.3, hipsUp: 0.05, hair: 0.075 }),
  style: () => ({
    gait: 'heavy', bounce: 0.55, sway: 1.9, twist: 1.25, roll: 1, cadence: 0.72, stride: 1.12, armSwing: 0.95, armSwingR: 0,
    armOut: 0.3, elbow: 0.28, breath: 1.5, breathPeriod: 4.8, fidget: 0.55, smile: 0.5, hop: 0.45, runLean: 0.7,
    weapon: 'great', propR: 'stick', plant: { len: 0.98, gripY: 1.0, out: 0.1, fwd: 0.22, tipOut: 0.08, tipFwd: 0.26, swing: 0.2, lift: 0.1 },
    turnRate: 0.6, chestOut: 0.05, hunch: 0.04, kidEyes: false, blinkEvery: 3.8,
  }),
  dress(K) {
    const m = K.m, k = m.k;
    const hair = mixHex(PAL.char.hairBrown, PAL.char.hair, 0.4), hairLit = mixHex(PAL.char.hairBrown, PAL.wood.mid, 0.25);
    const grey = mixHex(COL.greyHair, PAL.cloud.shade, 0.35);
    const blue = PAL.cloth.blue, blueD = PAL.cloth.blueDark;
    const skin = mixHex(COL.tan, COL.ruddy, 0.55);
    const leather = PAL.cloth.leather, leatherD = scaleHex(PAL.cloth.leather, 0.72);
    const trousers = mixHex(PAL.cloth.leather, PAL.char.hair, 0.45);

    // ── legs: thick, in heavy tall boots ──
    stdLegs(K, { pants: trousers, pantsTo: 'ankle', boot: scaleHex(COL.boot, 0.82), bootStyle: 'tall', thigh: 0.118, knee: 0.088, ankleR: 0.068, cuff: PAL.wood.dark, bootScale: 1.24 });

    // ── the barrel chest: a V from a broad chest down to the belt, the patched blue surcoat over it ──
    const torso = [[0.001, 0.70], [0.25, 0.71], [0.3, 0.8], [0.325, 0.92], [0.37, 1.06], [0.425, 1.2], [0.452, 1.32], [0.44, 1.41], [0.38, 1.48], [0.25, 1.535], [0.13, 1.56], [0.001, 1.57]];
    K.lathe(null, [0, 0, 0], torso, blue, { weights: wTorso(m), weave: 1, scale: [1.06, 1, 0.72], detail: 1.5, grad: [0.72, 0.95, 0.85] });
    K.ball('chest', [0, 1.26, 0.07], [0.36, 0.23, 0.27], blue, { weave: 1, detail: 1.3 });            // the chest itself
    K.ball('chest', [0, 1.37, -0.07], [0.38, 0.17, 0.25], blue, { weave: 1, detail: 1.2, outline: 0 }); // the yoke of the back
    K.torus('chest', [0, 1.525, 0.0], 0.165, 0.048, blueD, { scale: [1.12, 0.9, 1], weave: 1, outline: OUTLINE.char, detail: 1.2 });
    K.ball('neck', [0, 1.55, 0.02], [0.13, 0.08, 0.12], skin, { skin: true, outline: 0, detail: 0.8 });
    // surcoat tails, split front and back so the big legs can stride
    const tails = [[0.42, 0.46], [0.43, 0.49], [0.385, 0.61], [0.335, 0.75], [0.312, 0.84]];
    skirt(K, tails, blue, { phiStart: -0.9, phiLen: 1.8, xs: 1.05, zs: 0.76, lining: blueD });
    skirt(K, tails, blue, { phiStart: Math.PI - 0.98, phiLen: 1.96, xs: 1.05, zs: 0.76, lining: blueD });
    // a broad belt with a big buckle
    K.torus('hips', [0, 0.855, 0], 0.318, 0.046, COL.belt, { scale: [1.07, 0.76, 0.95], weave: 0.3, outline: OUTLINE.char });
    K.box('hips', [0, 0.855, 0.268], [0.14, 0.12, 0.035], COL.gold);
    K.box('hips', [0, 0.855, 0.282], [0.075, 0.055, 0.02], COL.iron);
    // patches: darker blue on the chest (with stitches), cream on the belly, mustard on the tails
    K.box('chest', [0.175, 1.31, 0.3], [0.14, 0.12, 0.016], blueD, { rot: [-0.2, 0.4, 0.16] });
    for (let i = 0; i < 4; i++) K.box('chest', [0.12 + i * 0.037, 1.382 - i * 0.004, 0.292 - i * 0.012], [0.008, 0.028, 0.012], PAL.cloth.cream, { rot: [-0.2, 0.4, 0.16] });
    K.box('spine', [-0.165, 1.02, 0.236], [0.105, 0.095, 0.016], PAL.cloth.cream, { rot: [0.05, -0.33, -0.12] });
    for (let i = 0; i < 3; i++) K.box('spine', [-0.215 + i * 0.045, 0.965, 0.228 - (i === 0 ? 0.012 : 0)], [0.007, 0.026, 0.012], COL.eye, { rot: [0.05, -0.33, 0.35] });
    K.box('skirtF', [0.15, 0.6, 0.285], [0.11, 0.1, 0.016], PAL.cloth.mustard, { rot: [0.32, 0.36, 0.1] });

    // ── arms: huge, bare below the surcoat's cap sleeves, forearms like hams, leather bracers and gauntlets ──
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      const x = sd * m.shX;
      const sh = [x, m.shoulderY, 0], el = [x, m.shoulderY - m.A1, 0], wr = [x, m.handY + 0.013, 0];
      const at = (t) => [x, lerp(el[1], wr[1], t), 0];
      limbProf(K, 'arm' + S, sh, el, [[0, 0.128], [0.32, 0.136], [0.72, 0.114], [1, 0.095]], skin, { skin: true, detail: 1.1 });
      K.ball('fore' + S, [x, el[1], -0.005], [0.097, 0.1, 0.1], skin, { skin: true, outline: 0, detail: 0.8 });
      limbProf(K, 'fore' + S, el, wr, [[0, 0.1], [0.24, 0.12], [0.6, 0.102], [1, 0.078]], skin, { skin: true, detail: 1.1 });
      limbProf(K, 'fore' + S, at(0.42), at(0.98), [[0, 0.114], [0.5, 0.104], [1, 0.09]], leather, { weave: 0.5, outline: 0, detail: 1 });
      for (const t of [0.52, 0.86]) K.torus('fore' + S, [x, lerp(el[1], wr[1], t), 0], lerp(0.114, 0.09, (t - 0.42) / 0.56) + 0.004, 0.011, leatherD, { detail: 0.8 });
      // the surcoat's shoulder cap, a ring of mail peeping out under it
      K.ball('arm' + S, [x + sd * 0.02, m.shoulderY + 0.015, 0], [0.178, 0.165, 0.185], blue, { weave: 1, detail: 1.1 });
      K.torus('arm' + S, [x, m.shoulderY - 0.125, 0], 0.132, 0.022, COL.steelDark, { detail: 0.9 });
      if (sd > 0) K.box('arm' + S, [x + 0.1, m.shoulderY + 0.07, 0.12], [0.1, 0.09, 0.016], blueD, { rot: [-0.5, 0.55, -0.4] });
      // gauntlet mitts
      const hr = 0.105, hc = [x, m.handY - hr * 0.76, 0.01];
      K.torus('fore' + S, [x, m.handY + 0.02, 0], 0.086, 0.024, leatherD, { detail: 0.9 });
      K.ball('hand' + S, hc, [hr * 0.95, hr * 1.04, hr * 0.9], leather, { detail: 1 });
      K.ball('hand' + S, [x - sd * hr * 0.15, hc[1] + hr * 0.2, hc[2] + hr * 0.74], [hr * 0.36, hr * 0.48, hr * 0.36], leather, { outline: OUTLINE.char, detail: 0.6, rot: [0.4, 0, 0] });
      K.joint('prop' + S, 'hand' + S, [x, m.handY - hr * 0.76, 0]);
    }

    // ── head: sun-browned, a big nose, a grown man's kind eyes under heavy brows ──
    stdHead(K, { skin, nose: 'big', noseC: mixHex(skin, PAL.tile.light, 0.28), earScale: 0.85, sx: 1.0, sy: 0.98, sz: 1.0 });
    stdEyes(K, { style: 'adult', w: 0.135, h: 0.09, yaw: 0.31, pitch: -0.05, brow: 'heavy', browColor: mixHex(hair, grey, 0.2), browW: 0.24, browPitch: 0.17, browTilt: -0.1 });
    stdMouth(K, { pitch: -0.54, w: 0.12, blush: 'anim', cheekYaw: 0.52, cheekPitch: -0.26 });
    const E = K.head, r = m.r;
    const Lh = LC(hair), Ll = LC(hairLit), Lg = LC(grey), cc = new THREE.Color();
    // the mane: one shaggy mass from the crown down to the nape, locks falling over the ears, grey at the temples
    shag(K, 'head', E, {
      wrap: true, nu: 76, nv: 9, locks: 19, lockDepth: 0.5, seed: 3,
      top: () => Math.PI / 2,
      // the hairline sweeps up past the temple so his ear and jaw stay clear (the beard takes over below)
      bot: (a) => (a < 1.25 ? lerp(0.64, 0.02, sstep(0.25, 1.2, a)) : lerp(0.02, -0.5, sstep(1.4, 2.5, a))),
      tuft: (a) => lerp(0.2, 0.22, sstep(0.3, 1.2, a)) + sstep(1.6, 2.8, a) * 0.28,
      thick: (a, t) => r * (0.12 + 0.15 * (1 - t) * (1 - t)) * (a < 0.7 ? lerp(0.72, 1, a / 0.7) : 1),
      hang: -0.26, flare: 0.22,
      color: (q, lc, a, t) => {
        // grey only at the temples, in streaks along the locks, fading out toward the crown and the back
        const temple = sstep(0.6, 0.86, Math.abs(q.x)) * (1 - sstep(0.12, 0.5, q.y)) * sstep(-0.3, 0.2, q.z) * sstep(-0.4, -0.05, q.y + 0.25);
        cc.copy(Lh).lerp(Ll, 0.5 * lc * (1 - t) * sstep(0.2, 0.9, q.y));
        return cc.lerp(Lg, clamp(temple * lc * lc * 0.95, 0, 0.8));
      },
    });
    // the beard: from under the mane's sideburns round the jaw, hanging to his chest; the mouth shows above it
    shag(K, 'head', E, {
      yaw0: -1.72, yaw1: 1.72, nu: 48, nv: 9, locks: 12, lockDepth: 0.5, seed: 11, topTaper: 0.2, endTaper: 0.08,
      top: (a) => lerp(-0.66, 0.1, sstep(0.14, 1.3, a)),
      bot: (a) => lerp(-1.2, -0.42, sstep(0.25, 1.62, a)),
      tuft: (a) => lerp(0.34, 0.1, sstep(0.2, 1.3, a)),
      thick: (a) => r * lerp(0.21, 0.12, sstep(0.2, 1.4, a)),
      hang: -0.62, flare: 0.12, fwd: 0.32,
      color: (q, lc, a, t) => {
        cc.copy(Lh).lerp(Ll, 0.35 * lc * (1 - t));
        return cc.lerp(Lg, sstep(1.05, 1.6, a) * 0.6 * (1 - sstep(0.1, 0.6, t)));
      },
    });
    // moustache: two bushy wings drooping over the corners of the mouth
    for (const sd of [1, -1]) {
      lock(K, sd * 0.19, -0.37, [0.27, 0.105, 0.15], hair, { lift: 0.055, rot: [0, 0, sd * 0.36], detail: 0.9 });
      lock(K, sd * 0.4, -0.48, [0.13, 0.085, 0.1], hair, { lift: 0.045, rot: [0, 0, sd * 1.0], detail: 0.7 });
    }

    // ── the greatsword, carried like a walking stick: grip at the prop joint, blade along +Z to the tip ──
    const g = [-m.shX, m.handY - 0.105 * 0.76, 0];
    const L = 0.98, roll = -0.62;                                   // blade turned so both its flat and its edge read
    const R2 = (x, y) => [g[0] + x * Math.cos(roll) - y * Math.sin(roll), g[1] + x * Math.sin(roll) + y * Math.cos(roll)];
    const P3 = (x, y, z) => { const q = R2(x, y); return [q[0], q[1], g[2] + z]; };
    K.m.stickLen = L;
    const bladeProf = [[0.001, 0.105], [0.108, 0.125], [0.112, 0.22], [0.1, 0.74], [0.076, 0.88], [0.001, L]];
    K.add(() => {
      const geo = new THREE.LatheGeometry(bladeProf.map(([rr, y]) => new THREE.Vector2(rr, y)), 4);
      geo.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 0.34));
      geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      geo.computeVertexNormals();
      return geo;
    }, TRS([g[0], g[1], g[2]], [0, 0, roll]), { bone: 'propR', color: COL.steel, outline: OUTLINE.char * 0.8, rep: [1, 1], hullDetail: 1 });
    K.add(() => { const geo = new THREE.LatheGeometry([[0.001, 0.18], [0.02, 0.2], [0.02, 0.72], [0.001, 0.74]].map(([rr, y]) => new THREE.Vector2(rr, y)), 4); geo.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 1.9)); geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)); return geo; },
      TRS([g[0], g[1], g[2]], [0, 0, roll]), { bone: 'propR', color: COL.steelDark, outline: 0, rep: [1, 1] });
    limbProf(K, 'propR', P3(-0.23, 0, 0.09), P3(0.23, 0, 0.09), [[0, 0.034], [0.5, 0.046], [1, 0.034]], COL.iron, { detail: 0.8 });
    for (const sx of [-1, 1]) K.ball('propR', P3(sx * 0.245, 0, 0.09), 0.05, COL.gold, { detail: 0.7 });
    K.ball('propR', P3(0, 0, 0.1), [0.06, 0.06, 0.05], COL.gold, { detail: 0.6, outline: 0 });
    limbProf(K, 'propR', [g[0], g[1], g[2] - 0.27], [g[0], g[1], g[2] + 0.06], [[0, 0.034], [0.5, 0.039], [1, 0.034]], leather, { detail: 0.7 });
    for (const z of [-0.2, -0.1]) K.torus('propR', [g[0], g[1], g[2] + z], 0.04, 0.009, COL.iron, { rot: [0, 0, 0], detail: 0.6 });
    K.ball('propR', [g[0], g[1], g[2] - 0.31], [0.058, 0.058, 0.065], COL.gold, { detail: 0.8 });
    stdItem(K);
  },
};

// ── Willow Pye (as a girl) ───────────────────────────────────────────────────────────────────────────────────
// CANON: straw-blonde plait with one green ribbon (the other half is on Bram's wrist), sunburnt, scabby-kneed,
// slingshot in her pocket.
DEFS.willow = {
  label: () => 'Willow (8)',
  ages: [8],
  body: () => ({ r: 0.228, leg: 0.33, ankle: 0.06, torso: 0.28, neck: 0.012, hipX: 0.072, shX: 0.165, arm: 0.28, bodyX: 0.14, bodyZ: 0.11, hair: 0.035 }),
  style: () => ({ kid: true, stride: 1.15, bounce: 1.3, armSwing: 1.25, smile: 1.0, hop: 1.35, fidget: 1.4, weapon: 'sling', headCock: 0.06, blinkEvery: 3.4 }),
  dress(K) {
    const m = K.m, k = m.k;
    const straw = PAL.thatch.light, strawHi = PAL.thatch.pale, strawDk = PAL.thatch.mid;
    const skin = mixHex(COL.skin, COL.sunburn, 0.25);
    const red = PAL.cloth.red, cream = PAL.cloth.cream;
    stdLegs(K, { pantsTo: 'hip', legSkin: skin, sock: cream, boot: COL.boot, bootStyle: 'chunky', thigh: 0.085, knee: 0.07, ankleR: 0.062, cuff: PAL.wood.dark, bootScale: 1.3, kneePatch: mixHex(PAL.cloth.cream, PAL.flower.pink, 0.3) });
    // bloomers peeking under the skirt
    K.lathe(null, [0, 0, 0], [[0.1, m.hipY - 0.11], [0.13, m.hipY - 0.07], [0.13, m.hipY + 0.02]], cream, { weights: wTorso(m), weave: 1, scale: [1.05, 1, 0.9], outline: 0, detail: 0.8 });
    stdTorso(K, [[0.001, -0.02], [0.14, -0.01], [0.18, 0.05], [0.19, 0.13], [0.2, 0.22], [0.17, 0.3], [0.11, 0.35], [0.001, 0.365]], { color: red, zs: 0.84 });
    skirt(K, [[0.235, 0.245], [0.245, 0.262], [0.21, 0.31], [0.165, m.hipY + 0.0], [0.14, m.hipY + 0.05]], red, { zs: 0.88, lining: scaleHex(red, 0.65) });
    K.lathe(null, [0, 0, 0], [[0.25, 0.235], [0.252, 0.25], [0.24, 0.262]], cream, { weights: wSkirt(m, m.hipY + 0.05, 0.245), weave: 0.4, scale: [1, 1, 0.88], outline: 0, detail: 0.9 });
    // pinafore front + collar
    K.lathe(null, [0, m.hipY, 0], [[0.185, 0.07], [0.195, 0.13], [0.205, 0.22], [0.18, 0.29]].map(([r, y]) => [r * k, y * k]), cream, { weights: wTorso(m), weave: 1, phiStart: -0.55, phiLen: 1.1, scale: [1, 1, 0.9], outline: 0, detail: 1.2 });
    K.torus('chest', [0, m.neckY + 0.0, 0.0], 0.1, 0.028, cream, { scale: [1.05, 1, 0.9], weave: 1 });
    // the pocket, with the slingshot poking out of it
    K.joint('sheath', 'hips', [-0.11, 0.33, 0.17]);
    K.box('skirtF', [-0.1, 0.315, 0.195], [0.09, 0.075, 0.012], scaleHex(red, 0.8), { rot: [0.35, -0.5, 0] });
    K.limb('sheath', [-0.105, 0.335, 0.18], [-0.11, 0.42, 0.17], 0.011, 0.011, PAL.wood.mid, { outline: 0, detail: 0.5 });
    for (const s of [1, -1]) K.limb('sheath', [-0.11, 0.415, 0.17], [-0.11 + s * 0.03, 0.47, 0.17], 0.01, 0.009, PAL.wood.mid, { outline: 0, detail: 0.5 });
    stdArms(K, { sleeve: cream, sleeveTo: 'short', skin, puff: true, upperR: 0.064, foreR: 0.058, handR: 0.08, cuff: cream });
    // ── head: sunburnt nose and cheeks, freckles, a cheeky grin ──
    stdHead(K, { skin, nose: 'button', noseC: mixHex(skin, PAL.flower.red, 0.2) });
    stdEyes(K, { style: 'oval', w: 0.15, h: 0.25, yaw: 0.37, pitch: -0.1, lash: true, brow: 'line', browColor: strawDk, browW: 0.22 });
    stdMouth(K, { pitch: -0.5, w: 0.14, blush: 'always', cheekColor: mixHex(COL.sunburn, PAL.flower.red, 0.35), cheekYaw: 0.56 });
    for (const [yaw, p] of [[0.5, -0.24], [0.6, -0.2], [0.55, -0.3], [-0.5, -0.24], [-0.6, -0.2], [-0.55, -0.3], [0.12, -0.2], [-0.12, -0.2]])
      K.decal('head', yaw, p, -0.002, (d) => G.ell(d * 0.4), COL.freckle, { scale: [0.009, 0.009, 0.004] });
    // hair: parted straw cap, a side-swept fringe, the plait down her back with the ribbon bow
    hairCap(K, straw, { theta: 0.6, tilt: -0.42 });
    for (const [yaw, p, sx, rz, col] of [[-0.3, 0.55, 1.2, 0.7, straw], [0.25, 0.62, 1.0, 0.35, strawHi], [0.6, 0.5, 0.8, -0.3, straw], [-1.0, 0.18, 0.7, 0.2, straw], [1.0, 0.18, 0.7, -0.2, straw]])
      lock(K, yaw, p, [0.34 * sx, 0.19, 0.2], col, { rot: [0, 0, rz], lift: 0.02 });
    // the plait: from behind her right ear, over the right shoulder, down her front; the ribbon on the end
    const P1 = [-0.14, m.headC - m.r * 0.62, -0.06], P2 = [-0.155, m.neckY + 0.0, 0.05], P3 = [-0.12, m.chestY - 0.03, 0.135];
    K.joint('plait1', 'head', P1);
    K.joint('plait2', 'plait1', P2);
    K.joint('plait3', 'plait2', P3);
    // seen from behind: the braid starts at the crown and winds down to behind her right ear
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      lock(K, lerp(Math.PI - 0.05, Math.PI + 1.05, t), lerp(0.42, -0.5, t), [0.22 - t * 0.04, 0.16, 0.14], i % 2 ? strawDk : straw, { rot: [0, 0, i % 2 ? 0.5 : -0.5], lift: 0.035, detail: 0.7 });
    }
    const along = [[P1, P2, 'plait1', 0.058], [P1, P2, 'plait1', 0.052], [P2, P3, 'plait2', 0.047], [P2, P3, 'plait2', 0.044], [P3, [P3[0] + 0.01, P3[1] - 0.08, P3[2] + 0.02], 'plait3', 0.04]];
    along.forEach(([a, b, bone, r], i) => {
      const t = i % 2 ? 0.75 : 0.25;
      const c = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      K.ball(bone, c, [r * 0.9, r * 0.78, r * 0.85], i % 2 ? strawDk : straw, { rot: [0.3, 0, i % 2 ? 0.45 : -0.45], detail: 0.7 });
    });
    const ry = P3[1] - 0.105, rz = P3[2] + 0.03, rx = P3[0] + 0.012;
    K.ball('plait3', [rx, ry, rz], [0.02, 0.018, 0.018], COL.ribbon, { outline: 0, detail: 0.5 });
    for (const sd of [1, -1]) K.ball('plait3', [rx + sd * 0.034, ry + 0.006, rz + 0.004], [0.034, 0.021, 0.013], COL.ribbon, { rot: [0, 0, sd * 0.35], detail: 0.6 });
    for (const sd of [1, -1]) K.limb('plait3', [rx + sd * 0.008, ry - 0.01, rz + 0.008], [rx + sd * 0.028, ry - 0.055, rz + 0.012], 0.01, 0.008, COL.ribbon, { outline: 0, detail: 0.5, sz: 0.45 });
    K.ball('plait3', [rx, ry - 0.045, rz + 0.004], [0.028, 0.042, 0.026], straw, { detail: 0.6 });
    // slingshot in her hand while she uses it (hand-local +Z points up the fork when her arm is out)
    const c = [m.shX, m.handY - 0.04, 0];
    K.limb('propL', [c[0], c[1], c[2] - 0.04], [c[0], c[1], c[2] + 0.08], 0.013, 0.013, PAL.wood.mid, { outline: 0, detail: 0.5 });
    for (const s of [1, -1]) K.limb('propL', [c[0], c[1], c[2] + 0.075], [c[0] + s * 0.045, c[1], c[2] + 0.15], 0.012, 0.01, PAL.wood.mid, { outline: 0, detail: 0.5 });
    K.box('propL', [c[0], c[1] + 0.03, c[2] + 0.15], [0.09, 0.006, 0.006], PAL.cloth.leather);
    stdItem(K);
  },
};

// ── Sera Fairweather (as a girl) ─────────────────────────────────────────────────────────────────────────────
// CANON: small and dark-eyed in good clothes you cannot climb in, always a step ahead of her chaperone.
DEFS.sera = {
  label: () => 'Sera (7)',
  ages: [7],
  body: () => ({ r: 0.222, leg: 0.29, ankle: 0.055, torso: 0.265, neck: 0.012, hipX: 0.066, shX: 0.155, arm: 0.26, bodyX: 0.13, bodyZ: 0.11, hair: 0.07 }),
  style: () => ({ kid: true, stride: 1.1, bounce: 0.8, armSwing: 0.6, sway: 0.7, twist: 0.7, smile: 0.55, hop: 0.9, fidget: 0.5, weapon: 'none', arms: 'clasp', headTilt: 0.03, headCock: -0.05, cadence: 1.05, blinkEvery: 2.8 }),
  dress(K) {
    const m = K.m, k = m.k;
    const blue = PAL.cloth.blue, blueD = PAL.cloth.blueDark, lace = PAL.plaster.light, pink = PAL.cloth.pink, hair = PAL.char.hair;
    stdLegs(K, { pants: lace, pantsTo: 'ankle', pantsWeave: 0, boot: mixHex(PAL.char.hair, PAL.cloth.purpleDark, 0.3), bootStyle: 'shoe', buckle: COL.gold, thigh: 0.075, knee: 0.062, ankleR: 0.052, bootScale: 1.15 });
    stdTorso(K, [[0.001, -0.02], [0.13, -0.01], [0.16, 0.05], [0.165, 0.13], [0.18, 0.22], [0.16, 0.3], [0.1, 0.36], [0.001, 0.375]], { color: blue, zs: 0.84 });
    // the good, full, unclimbable skirt, and a lace petticoat hem peeping out
    skirt(K, [[0.26, 0.115], [0.268, 0.135], [0.25, 0.19], [0.205, 0.26], [0.155, m.hipY + 0.02], [0.125, m.hipY + 0.06]], blue, { zs: 0.9, lining: lace });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      K.ball({ weights: true }, [Math.sin(a) * 0.262, 0.112, Math.cos(a) * 0.262 * 0.9], [0.028, 0.02, 0.012], lace, { weights: wSkirt(m, m.hipY + 0.06, 0.12), rot: [0, a, 0], outline: 0, detail: 0.4 });
    }
    // sash with a big bow at the back
    K.torus('hips', [0, m.hipY + 0.05, 0], 0.125, 0.022, pink, { scale: [1.05, 1, 0.9], weave: 1 });
    for (const s of [1, -1]) K.ball('hips', [s * 0.06, m.hipY + 0.07, -0.13], [0.06, 0.04, 0.022], pink, { rot: [0, 0, s * 0.4], weave: 1, detail: 0.7 });
    for (const s of [1, -1]) K.limb('hips', [s * 0.015, m.hipY + 0.05, -0.13], [s * 0.05, m.hipY - 0.07, -0.16], 0.018, 0.016, pink, { outline: 0, weave: 1, detail: 0.5, sz: 0.4 });
    // lace collar
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      K.ball('chest', [Math.sin(a) * 0.1, m.neckY - 0.005, Math.cos(a) * 0.09], [0.04, 0.012, 0.03], lace, { rot: [0, a, 0], outline: i % 2 ? OUTLINE.char * 0.6 : 0, detail: 0.5 });
    }
    K.ball('chest', [0, m.neckY - 0.045, 0.125], [0.022, 0.022, 0.012], PAL.flower.pink, { outline: 0, detail: 0.5 });
    stdArms(K, { sleeve: blue, sleeveTo: 'wrist', skin: COL.pale, puff: true, upperR: 0.062, foreR: 0.055, handR: 0.076, cuff: lace });
    // ── head: pale, big dark eyes, a neat black bob with a blunt fringe, a big pink bow ──
    stdHead(K, { skin: COL.pale, nose: 'button' });
    stdEyes(K, { style: 'big', w: 0.16, h: 0.26, yaw: 0.36, pitch: -0.12, lash: true, brow: 'line', browColor: hair, browW: 0.2, browPitch: 0.14 });
    stdMouth(K, { pitch: -0.52, w: 0.1, blush: 'always' });
    const h = K.head;
    const open = 0.95;
    K.add((d) => new THREE.SphereGeometry(1, Math.round(22 * d), Math.round(14 * d), Math.PI / 2 + open, TAU - 2 * open, 0, 0.8 * Math.PI),
      TRS([0, h.c[1] + 0.005, -0.008], [-0.12, 0, 0], [h.rx * 1.13, h.ry * 1.1, h.rz * 1.1]), { bone: 'head', color: hair, outline: OUTLINE.char, rep: [3, 2] });
    hairCap(K, hair, { theta: 0.52, tilt: -0.2, grow: 1.09 });
    lock(K, 0, 0.42, [0.72, 0.2, 0.26], hair, { lift: 0.02, outline: 0, detail: 0.9 });
    for (const s of [1, -1]) lock(K, s * 0.72, -0.12, [0.2, 0.44, 0.2], hair, { lift: 0.045, outline: 0, rot: [0, 0, 0] });
    // the bow
    const by = h.c[1] + h.ry * 0.82, bz = -h.rz * 0.35;
    K.ball('head', [0, by, bz], [0.03, 0.03, 0.026], pink, { outline: 0, detail: 0.6 });
    for (const s of [1, -1]) K.ball('head', [s * 0.075, by + 0.02, bz - 0.01], [0.075, 0.045, 0.024], pink, { rot: [0.2, 0, s * 0.35], weave: 1, detail: 0.8 });
    stdItem(K);
  },
};

// ── Barty Marrow ─────────────────────────────────────────────────────────────────────────────────────────────
// CANON: small, wide, bald old man in an apron worn over armour, a ladle in his belt where a dagger should be.
DEFS.barty = {
  label: () => 'Barty',
  ages: [58],
  body: () => ({ r: 0.245, leg: 0.28, ankle: 0.075, torso: 0.42, neck: 0.0, hipX: 0.105, shX: 0.285, arm: 0.34, bodyX: 0.28, bodyZ: 0.24, hipsUp: 0.03, hair: 0.0 }),
  style: () => ({ stride: 1.15, bounce: 1.05, sway: 1.9, twist: 0.6, armSwing: 0.75, cadence: 1.12, smile: 1.1, hop: 0.8, weapon: 'ladle', hunch: 0.04, armOut: 0.32, breathPeriod: 3.2, fidget: 1.1 }),
  dress(K) {
    const m = K.m, k = m.k;
    const amber = PAL.cloth.mustard, apron = PAL.cloth.cream, white = COL.whiteHair;
    stdLegs(K, { pants: PAL.cloth.leather, pantsTo: 'ankle', boot: COL.boot, bootStyle: 'chunky', thigh: 0.14, knee: 0.11, ankleR: 0.085, cuff: PAL.wood.dark, bootScale: 1.3 });
    stdTorso(K, [[0.001, -0.05], [0.26, -0.04], [0.35, 0.06], [0.38, 0.2], [0.37, 0.34], [0.32, 0.44], [0.2, 0.53], [0.001, 0.545]], { color: amber, zs: 0.9 });
    // breastplate + gold rim, pauldrons
    K.lathe(null, [0, m.hipY, 0], [[0.36, 0.24], [0.385, 0.33], [0.34, 0.44], [0.22, 0.52]].map(([r, y]) => [r * k, y * k]), COL.steel, { weights: wTorso(m), weave: 0, phiStart: -1.35, phiLen: 2.7, scale: [1, 1, 0.92], outline: 0, detail: 1.1 });
    for (const s of [1, -1]) {
      K.ball('clav' + (s > 0 ? 'L' : 'R'), [s * (m.shX - 0.01), m.shoulderY + 0.015, 0], [0.1, 0.075, 0.1], COL.steel, { detail: 0.8 });
      K.torus('clav' + (s > 0 ? 'L' : 'R'), [s * (m.shX - 0.01), m.shoulderY - 0.02, 0], 0.095, 0.012, COL.gold, { scale: [1, 1, 1] });
    }
    // apron: bib, strap and a skirt panel to the knees
    K.lathe(null, [0, 0, 0], [[0.3, m.hipY + 0.06], [0.305, m.hipY + 0.14], [0.3, m.hipY + 0.24]], apron, { weights: wTorso(m), weave: 1, phiStart: -0.75, phiLen: 1.5, scale: [1.02, 1, 0.94], outline: 0, detail: 1 });
    skirt(K, [[0.29, 0.14], [0.3, 0.16], [0.3, 0.26], [0.29, m.hipY + 0.03], [0.285, m.hipY + 0.07]], apron, { phiStart: -0.95, phiLen: 1.9, zs: 0.94, lining: scaleHex(apron, 0.85) });
    K.torus('hips', [0, m.hipY + 0.07, 0], 0.3, 0.018, apron, { scale: [1, 1, 0.93], weave: 1 });
    K.box('skirtF', [0.08, 0.2, 0.278], [0.06, 0.05, 0.01], scaleHex(apron, 0.88), { rot: [0.25, 0.25, 0.3] });
    // the ladle in his belt, bowl up by his right hip
    K.joint('sheath', 'hips', [-0.25, m.hipY, 0.12]);
    K.limb('sheath', [-0.24, m.hipY - 0.12, 0.13], [-0.27, m.hipY + 0.14, 0.16], 0.011, 0.011, COL.iron, { outline: 0, detail: 0.5 });
    K.add((d) => G.sphereCap(d * 0.7, Math.PI / 2), TRS([-0.275, m.hipY + 0.18, 0.165], [Math.PI, 0, -0.2], [0.055, 0.045, 0.055]), { bone: 'sheath', color: COL.steel, rep: [1, 1] });
    stdArms(K, { sleeve: amber, sleeveTo: 'wrist', skin: COL.ruddy, upperR: 0.1, foreR: 0.09, handR: 0.1, bracer: COL.steel });
    // ── head: bald dome, white fringe, huge white brows, dot eyes, a big nose and a walrus moustache ──
    stdHead(K, { skin: COL.ruddy, nose: 'big', noseC: mixHex(COL.ruddy, PAL.tile.light, 0.3), earScale: 1.3 });
    stdEyes(K, { style: 'dot', w: 0.13, yaw: 0.32, pitch: -0.1, brow: 'bushy', browColor: white, browW: 0.3, browPitch: 0.15, highlights: true });
    stdMouth(K, { pitch: -0.62, w: 0.12, blush: 'always' });
    // a fluffy white horseshoe of hair round the back, puffing out over the ears
    fringe(K, white, { top: 0.16, bot: -0.42, sideburn: -0.2, thick: 0.07, puff: 0.1, tuft: 0.12, locks: 17, shade: 0.9, seed: 7 });
    // a shine on the dome
    K.decal('head', -0.35, 0.72, -0.004, (d) => G.ell(d * 0.5), mixHex(COL.ruddy, PAL.plaster.light, 0.6), { scale: [0.05, 0.03, 0.012] });
    for (const s of [1, -1]) lock(K, s * 0.2, -0.43, [0.3, 0.13, 0.15], white, { lift: 0.07, rot: [0, 0, s * 0.45], outline: OUTLINE.char, detail: 0.7 });
    // the ladle in his hand while he fights with it (hand-local +Z = handle out, bowl at the end)
    const c = [-m.shX, m.handY - 0.06, 0];
    K.cyl('propR', [c[0], c[1], c[2] + 0.12], 0.012, 0.012, 0.3, COL.iron, { rot: [Math.PI / 2, 0, 0] });
    K.add((d) => G.sphereCap(d * 0.7, Math.PI / 2), TRS([c[0], c[1] + 0.02, c[2] + 0.29], [Math.PI, 0, 0], [0.06, 0.05, 0.06]), { bone: 'propR', color: COL.steel, rep: [1, 1] });
    stdItem(K);
  },
};

// ── the villager kit ─────────────────────────────────────────────────────────────────────────────────────────
const ADULT = { r: 0.24, leg: 0.5, ankle: 0.075, torso: 0.47, neck: 0.02, hipX: 0.095, shX: 0.25, arm: 0.48, bodyX: 0.19, bodyZ: 0.15, hipsUp: 0.04, hair: 0.04 };
const VILLAGERS = {
  farmer: {
    label: 'Farmer',
    body: { ...ADULT, leg: 0.52, shX: 0.26, hair: 0.12 },
    style: { bounce: 0.9, propR: 'fork', gripY: 0.86, armSwingR: 0.2, smile: 0.9, weapon: 'none',
      plant: { len: 0.66, gripY: 0.68, out: 0.04, fwd: 0.14, tipOut: 0.05, tipFwd: 0.2, swing: 0.14, lift: 0.1 } },
    dress(K) {
      const m = K.m, k = m.k, denim = PAL.cloth.blue, shirt = PAL.tile.mid, hat = PAL.thatch.light;
      stdLegs(K, { pants: denim, pantsTo: 'ankle', boot: mixHex(COL.boot, PAL.dirt.dark, 0.4), bootStyle: 'chunky', thigh: 0.08, knee: 0.065, ankleR: 0.056, bootScale: 1.15 });
      stdTorso(K, [[0.001, -0.05], [0.17, -0.04], [0.2, 0.04], [0.21, 0.15], [0.22, 0.28], [0.23, 0.37], [0.19, 0.45], [0.11, 0.5], [0.001, 0.51]], { color: shirt, zs: 0.8 });
      // dungarees: bib + straps
      K.lathe(null, [0, m.hipY, 0], [[0.215, -0.09], [0.215, 0.05], [0.222, 0.18], [0.226, 0.28]].map(([r, y]) => [r * k, y * k]), denim, { weights: wTorso(m), weave: 1, phiStart: -0.62, phiLen: 1.24, scale: [1, 1, 0.82], outline: 0 });
      K.lathe(null, [0, m.hipY, 0], [[0.22, -0.09], [0.222, 0.0], [0.218, 0.07]].map(([r, y]) => [r * k, y * k]), denim, { weights: wTorso(m), weave: 1, scale: [1, 1, 0.82], outline: 0 });
      for (const s of [1, -1]) K.limb('chest', [s * 0.1, m.hipY + 0.27, 0.16], [s * 0.12, m.neckY - 0.02, -0.02], 0.018, 0.018, denim, { outline: 0, detail: 0.5, sx: 1.6, sz: 0.5 });
      for (const s of [1, -1]) K.ball('chest', [s * 0.1, m.hipY + 0.27, 0.19], 0.018, COL.gold, { outline: 0, detail: 0.4 });
      stdArms(K, { sleeve: shirt, sleeveTo: 'elbow', skin: COL.tan, upperR: 0.056, foreR: 0.05, handR: 0.07 });
      stdHead(K, { skin: COL.tan, nose: 'round' });
      stdEyes(K, { style: 'oval', w: 0.12, h: 0.18, yaw: 0.34, pitch: -0.14, brow: 'line', browColor: PAL.wood.dark, browW: 0.24 });
      stdMouth(K, { pitch: -0.52, w: 0.13, blush: 'always', cheekColor: mixHex(COL.tan, PAL.flower.red, 0.3) });
      hairCap(K, PAL.wood.mid, { theta: 0.5, tilt: -0.7 });
      // stubble + a stalk of hay in his mouth
      K.decal('head', 0, -0.62, -0.02, (d) => G.ell(d * 0.8), mixHex(COL.tan, PAL.wood.dark, 0.3), { scale: [0.13, 0.08, 0.03] });
      K.limb('head', [0.03, m.headC - m.r * 0.52, m.r * 0.84], [0.17, m.headC - m.r * 0.62, m.r * 1.15], 0.007, 0.005, PAL.thatch.pale, { outline: 0, detail: 0.4 });
      // straw hat: wide brim + crown + red band
      const hy = m.headC + m.r * 0.55;
      K.lathe('head', [0, hy, -0.02], [[0.0, -0.012], [0.33, -0.02], [0.35, -0.005], [0.33, 0.012], [0.17, 0.02], [0.0, 0.022]], hat, { weave: 1, rot: [-0.12, 0, 0], detail: 1.2 });
      K.lathe('head', [0, hy, -0.02], [[0.17, 0.0], [0.165, 0.08], [0.14, 0.15], [0.001, 0.17]], hat, { weave: 1, rot: [-0.12, 0, 0] });
      K.torus('head', [0, hy + 0.03, -0.02], 0.166, 0.018, PAL.cloth.red, { rot: [Math.PI / 2 - 0.12, 0, 0] });
      // pitchfork (orient frame: -Z = up), used as a walking staff
      const c = [-m.shX, m.handY - 0.05, 0];
      K.m.stickLen = 0.66;
      K.cyl('propR', [c[0], c[1], c[2] - 0.09], 0.016, 0.016, 1.5, PAL.wood.light, { rot: [Math.PI / 2, 0, 0] });
      K.box('propR', [c[0], c[1], c[2] - 0.84], [0.2, 0.03, 0.03], COL.iron);
      for (const x of [-0.09, 0, 0.09]) K.add(() => new THREE.ConeGeometry(0.013, 0.24, 5), TRS([c[0] + x, c[1], c[2] - 0.97], [-Math.PI / 2, 0, 0]), { bone: 'propR', color: COL.iron, rep: [1, 1] });
      stdItem(K);
    },
  },
  baker: {
    label: 'Baker',
    body: { ...ADULT, bodyX: 0.26, bodyZ: 0.22, hair: 0.2, leg: 0.46, shX: 0.29 },
    style: { bounce: 1.05, sway: 1.4, propR: 'loaf', smile: 1.2, armOut: 0.25, weapon: 'none' },
    dress(K) {
      const m = K.m, k = m.k, white = PAL.plaster.light, flour = PAL.cloth.cream;
      stdLegs(K, { pants: PAL.wood.mid, pantsTo: 'ankle', boot: COL.boot, bootStyle: 'shoe', thigh: 0.09, knee: 0.07, ankleR: 0.06, bootScale: 1.3 });
      stdTorso(K, [[0.001, -0.05], [0.22, -0.04], [0.3, 0.05], [0.33, 0.17], [0.32, 0.29], [0.28, 0.4], [0.18, 0.49], [0.001, 0.51]], { color: white, zs: 0.9 });
      skirt(K, [[0.3, 0.2], [0.31, 0.22], [0.32, 0.36], [0.335, m.hipY + 0.05], [0.33, m.hipY + 0.12]], flour, { phiStart: -1.1, phiLen: 2.2, zs: 0.92, lining: scaleHex(flour, 0.85) });
      K.torus('hips', [0, m.hipY + 0.12, 0], 0.335, 0.016, flour, { scale: [1, 1, 0.92], weave: 1 });
      K.torus('chest', [0, m.neckY - 0.01, 0.01], 0.12, 0.035, PAL.cloth.blue, { scale: [1.1, 1, 0.95], weave: 1 });
      K.ball('chest', [0.03, m.neckY - 0.06, 0.13], [0.04, 0.05, 0.02], PAL.cloth.blue, { rot: [0, 0, 0.4], outline: 0, detail: 0.5 });
      // flour smudges
      K.box('skirtF', [0.1, 0.35, 0.31], [0.07, 0.04, 0.008], mixHex(flour, PAL.wood.light, 0.25), { rot: [0.1, 0.3, 0.5] });
      stdArms(K, { sleeve: white, sleeveTo: 'elbow', skin: COL.ruddy, upperR: 0.07, foreR: 0.062, handR: 0.078 });
      stdHead(K, { skin: COL.ruddy, nose: 'round', noseC: mixHex(COL.ruddy, PAL.flower.red, 0.2) });
      stdEyes(K, { style: 'arc', w: 0.1, yaw: 0.33, pitch: -0.1, brow: 'line', browColor: PAL.tile.dark, browW: 0.22 });
      stdMouth(K, { pitch: -0.55, w: 0.13, blush: 'always' });
      const ginger = mixHex(PAL.tile.mid, PAL.wood.mid, 0.45);
      for (const s of [1, -1]) lock(K, s * 0.24, -0.42, [0.34, 0.12, 0.15], ginger, { lift: 0.07, rot: [0, 0, s * -0.3], outline: OUTLINE.char });
      for (const s of [1, -1]) lock(K, s * 1.25, 0.05, [0.2, 0.3, 0.2], ginger, { lift: 0.04 });
      // tall puffy toque
      const hy = m.headC + m.r * 0.5;
      K.lathe('head', [0, hy, -0.01], [[0.0, -0.01], [0.2, -0.005], [0.21, 0.05], [0.2, 0.09], [0.24, 0.16], [0.27, 0.24], [0.25, 0.3], [0.16, 0.34], [0.001, 0.345]], white, { weave: 1, rot: [-0.08, 0, 0], detail: 1.2, grad: [hy, hy + 0.1, 0.9] });
      K.torus('head', [0, hy + 0.02, -0.01], 0.205, 0.03, white, { rot: [Math.PI / 2 - 0.08, 0, 0], weave: 1, outline: OUTLINE.char });
      // the loaf he is proud of (orient frame: -Z = up, +Y = forward)
      const c = [-m.shX, m.handY - 0.06, 0];
      K.ball('propR', [c[0], c[1] + 0.02, c[2] - 0.07], [0.14, 0.1, 0.085], PAL.wood.light, { detail: 0.8, grad: [c[1] - 0.1, c[1] + 0.1, 0.8] });
      for (const x of [-0.06, 0, 0.06]) K.box('propR', [c[0] + x, c[1] + 0.1, c[2] - 0.1], [0.02, 0.012, 0.07], PAL.wood.mid, { rot: [0, 0, 0.4] });
      stdItem(K);
    },
  },
  granny: {
    label: 'Granny',
    body: { r: 0.235, leg: 0.38, ankle: 0.06, torso: 0.4, neck: 0.01, hipX: 0.085, shX: 0.215, arm: 0.42, bodyX: 0.19, bodyZ: 0.16, hipsUp: 0.03, hair: 0.1 },
    style: { hunch: 0.32, bounce: 0.5, cadence: 0.86, stride: 1.0, lift: 0.9, armSwing: 0.65, armSwingR: 0.1, breathPeriod: 4.5, fidget: 0.45, smile: 1.15, hop: 0.4, propR: 'cane', runStart: 3.4, runFull: 4.4, weapon: 'none', turnRate: 0.7, sway: 1.5, roll: 0.6,
      plant: { len: 0.44, gripY: 0.46, out: 0.02, fwd: 0.2, tipOut: 0.05, tipFwd: 0.27, swing: 0.08, lift: 0.07 } },
    dress(K) {
      const m = K.m, k = m.k, skirtC = mixHex(PAL.cloth.purpleDark, PAL.wood.dark, 0.35), shawl = PAL.cloth.purple, white = COL.whiteHair;
      stdLegs(K, { pants: skirtC, pantsTo: 'ankle', boot: PAL.cloth.purpleDark, bootStyle: 'shoe', thigh: 0.07, knee: 0.056, ankleR: 0.05 });
      stdTorso(K, [[0.001, -0.05], [0.19, -0.04], [0.24, 0.04], [0.25, 0.14], [0.25, 0.25], [0.22, 0.34], [0.14, 0.4], [0.001, 0.42]], { color: PAL.cloth.cream, zs: 0.9 });
      skirt(K, [[0.275, 0.1], [0.285, 0.12], [0.265, 0.19], [0.23, 0.27], [0.2, m.hipY + 0.02], [0.18, m.hipY + 0.07]], skirtC, { zs: 0.92 });
      skirt(K, [[0.265, 0.155], [0.27, 0.175], [0.25, 0.23], [0.215, m.hipY + 0.04]], PAL.cloth.cream, { phiStart: -0.9, phiLen: 1.8, zs: 0.95 });
      // knitted shawl over the shoulders, knotted in front
      K.lathe(null, [0, 0, 0], [[0.27, m.chestY - 0.12], [0.285, m.chestY - 0.08], [0.27, m.chestY + 0.02], [0.23, m.shoulderY], [0.15, m.neckY + 0.01]], shawl, { weights: wTorso(m), weave: 1, scale: [1, 1, 0.94], detail: 1.1, phiStart: 0.3, phiLen: TAU - 0.6 });
      K.ball('chest', [0, m.chestY - 0.03, 0.2], [0.05, 0.045, 0.035], shawl, { weave: 1, detail: 0.6 });
      for (const s of [1, -1]) K.limb('chest', [s * 0.02, m.chestY - 0.05, 0.2], [s * 0.05, m.chestY - 0.2, 0.2], 0.03, 0.022, shawl, { weave: 1, detail: 0.5, sz: 0.5 });
      stdArms(K, { sleeve: PAL.cloth.cream, sleeveTo: 'wrist', skin: COL.pale, upperR: 0.048, foreR: 0.044, handR: 0.064, cuff: shawl });
      stdHead(K, { skin: COL.pale, nose: 'round' });
      stdEyes(K, { style: 'arc', w: 0.1, yaw: 0.33, pitch: -0.12, brow: 'line', browColor: PAL.stone.mid, browW: 0.2 });
      stdMouth(K, { pitch: -0.52, w: 0.12, blush: 'always' });
      // round spectacles
      for (const s of [1, -1]) K.decal('head', s * 0.33, -0.12, 0.028, (d) => G.torus(0.052, 0.008, d * 0.8), COL.gold, {});
      K.decal('head', 0, -0.1, 0.03, (d) => G.torus(0.03, 0.007, d * 0.6, Math.PI), COL.gold, {});
      // white hair, pinned into a bun
      hairCap(K, white, { theta: 0.55, tilt: -0.3 });
      for (const s of [1, -1]) lock(K, s * 0.45, 0.45, [0.34, 0.2, 0.18], white, { rot: [0, 0, s * -0.5], lift: 0.03 });
      K.ball('head', [0, m.headC + m.r * 0.72, -m.r * 0.72], [0.1, 0.09, 0.09], white, { detail: 0.8 });
      K.torus('head', [0, m.headC + m.r * 0.66, -m.r * 0.64], 0.07, 0.012, PAL.cloth.purple, { rot: [0.9, 0, 0] });
      // walking cane (orient frame: +Z = down), planted at every stride
      const c = [-m.shX, m.handY - 0.04, 0];
      K.m.stickLen = 0.44;
      K.cyl('propR', [c[0], c[1], c[2] + 0.21], 0.014, 0.012, 0.46, PAL.wood.mid, { rot: [Math.PI / 2, 0, 0] });
      K.add((d) => G.torus(0.045, 0.014, d * 0.7, Math.PI), TRS([c[0] - 0.045, c[1], c[2] - 0.02], [Math.PI / 2, 0, Math.PI]), { bone: 'propR', color: PAL.wood.mid, rep: [1, 1] });
      stdItem(K);
    },
  },
  child: {
    label: 'Village child',
    body: { r: 0.22, leg: 0.27, ankle: 0.055, torso: 0.25, neck: 0.01, hipX: 0.068, shX: 0.15, arm: 0.25, bodyX: 0.13, bodyZ: 0.11, hair: 0.07 },
    style: { kid: true, stride: 1.15, bounce: 1.45, fidget: 1.7, hop: 1.5, armSwing: 1.35, armSwingR: 0.5, smile: 1.15, propR: 'tankard', weapon: 'none', cadence: 1.1, headCock: 0.08 },
    dress(K) {
      const m = K.m, k = m.k, shirt = PAL.cloth.mustard, shorts = PAL.wood.mid, ginger = PAL.char.carrot;
      stdLegs(K, { pants: shorts, pantsTo: 'knee', legSkin: COL.skin, sock: PAL.plaster.light, boot: PAL.wood.dark, bootStyle: 'chunky', thigh: 0.082, knee: 0.064, ankleR: 0.056, bootScale: 1.2, kneePatch: PAL.cloth.green });
      stdTorso(K, [[0.001, -0.03], [0.14, -0.02], [0.18, 0.04], [0.19, 0.12], [0.19, 0.22], [0.16, 0.3], [0.1, 0.35], [0.001, 0.36]], { color: shirt, zs: 0.86 });
      K.lathe(null, [0, m.hipY, 0], [[0.19, -0.07], [0.19, 0.0], [0.19, 0.05]].map(([r, y]) => [r * k, y * k]), shorts, { weights: wTorso(m), weave: 1, scale: [1, 1, 0.86], outline: 0 });
      for (const s of [1, -1]) K.limb('chest', [s * 0.07, m.hipY + 0.03, 0.105], [s * 0.08, m.neckY - 0.01, 0.03], 0.012, 0.012, PAL.cloth.leather, { outline: 0, detail: 0.5, sx: 1.4, sz: 0.5 });
      for (const s of [1, -1]) K.limb('chest', [s * 0.07, m.hipY + 0.03, -0.105], [s * 0.08, m.neckY - 0.01, -0.03], 0.012, 0.012, PAL.cloth.leather, { outline: 0, detail: 0.5, sx: 1.4, sz: 0.5 });
      K.torus('chest', [0, m.neckY, 0.0], 0.09, 0.03, PAL.cloth.red, { weave: 1, scale: [1.1, 1, 0.95], outline: OUTLINE.char });
      stdArms(K, { sleeve: shirt, sleeveTo: 'short', skin: COL.skin, upperR: 0.062, foreR: 0.056, handR: 0.078 });
      stdHead(K, { skin: COL.skin, nose: 'button', earScale: 1.2 });
      stdEyes(K, { style: 'oval', w: 0.15, h: 0.24, yaw: 0.38, pitch: -0.12, brow: 'line', browColor: PAL.tile.dark });
      stdMouth(K, { pitch: -0.48, w: 0.15, blush: 'always' });
      for (const [yaw, p] of [[0.46, -0.22], [0.56, -0.26], [0.5, -0.32], [-0.46, -0.22], [-0.56, -0.26], [-0.5, -0.32]])
        K.decal('head', yaw, p, -0.002, (d) => G.ell(d * 0.4), COL.freckle, { scale: [0.009, 0.009, 0.004] });
      hairCap(K, ginger, { theta: 0.5, tilt: -0.6 });
      for (const [yaw, p, rz] of [[-0.35, 0.5, 0.6], [0.1, 0.56, -0.2], [0.5, 0.48, -0.6], [2.6, 0.4, 0.3], [-2.6, 0.4, -0.3]]) lock(K, yaw, p, [0.26, 0.22, 0.2], ginger, { rot: [0, 0, rz], lift: 0.04 });
      // flat cap with a peak, worn at an angle
      const hy = m.headC + m.r * 0.55;
      K.add((d) => G.sphereCap(d * 1.1, 0.5 * Math.PI), TRS([0, hy - 0.075, -0.015], [-0.22, 0.25, 0.1, 'YXZ'], [0.262, 0.2, 0.27]), { bone: 'head', color: PAL.cloth.green, weave: 1, outline: OUTLINE.char, rep: [2, 1] });
      K.ball('head', [0.045, hy - 0.06, 0.225], [0.15, 0.022, 0.1], PAL.cloth.greenDark, { rot: [0.3, 0.25, 0], outline: 0, detail: 0.7 });
      K.ball('head', [0, hy + 0.12, -0.02], [0.025, 0.02, 0.025], PAL.cloth.greenDark, { outline: 0, detail: 0.5 });
      // a swirly lollipop (orient frame: -Z = up)
      const c = [-m.shX, m.handY - 0.04, 0];
      K.cyl('propR', [c[0], c[1], c[2] - 0.08], 0.007, 0.007, 0.2, PAL.plaster.light, { rot: [Math.PI / 2, 0, 0] });
      K.cyl('propR', [c[0], c[1], c[2] - 0.22], 0.08, 0.08, 0.025, PAL.flower.pink, { rot: [0, 0, 0], scale: [1, 1, 1] });
      K.add((d) => G.torus(0.045, 0.011, d * 0.8, TAU * 1), TRS([c[0], c[1] + 0.014, c[2] - 0.22], [Math.PI / 2, 0, 0]), { bone: 'propR', color: PAL.plaster.light, rep: [1, 1] });
      stdItem(K);
    },
  },
  guard: {
    label: 'Guard',
    body: { ...ADULT, leg: 0.56, torso: 0.5, shX: 0.27, bodyX: 0.2, hair: 0.14 },
    style: { bounce: 0.6, fidget: 0.2, chestOut: 0.06, armSwingR: 0.15, armSwingL: 0.8, smile: 0.2, propR: 'spear', gripY: 0.92, weapon: 'spear', breath: 0.8, cadence: 0.95 },
    dress(K) {
      const m = K.m, k = m.k, mail = COL.steelDark, tabard = PAL.cloth.red, trim = COL.gold;
      stdLegs(K, { pants: mail, pantsTo: 'ankle', boot: scaleHex(COL.boot, 0.8), bootStyle: 'tall', thigh: 0.08, knee: 0.064, ankleR: 0.054, cuff: COL.steel });
      stdTorso(K, [[0.001, -0.05], [0.16, -0.04], [0.2, 0.04], [0.2, 0.14], [0.215, 0.27], [0.235, 0.37], [0.2, 0.45], [0.12, 0.5], [0.001, 0.51]], { color: mail, zs: 0.78, weave: 0.9 });
      K.lathe(null, [0, m.hipY, 0], [[0.205, -0.06], [0.212, 0.05], [0.222, 0.2], [0.24, 0.32], [0.22, 0.42]].map(([r, y]) => [r * k, y * k]), tabard, { weights: wTorso(m), weave: 1, phiStart: -0.85, phiLen: 1.7, scale: [1, 1, 0.8], outline: 0 });
      skirt(K, [[0.25, 0.3], [0.255, 0.33], [0.23, 0.45], [0.215, m.hipY + 0.04]], tabard, { phiStart: -0.7, phiLen: 1.4, zs: 0.82 });
      skirt(K, [[0.25, 0.3], [0.255, 0.33], [0.23, 0.45], [0.215, m.hipY + 0.04]], tabard, { phiStart: Math.PI - 0.7, phiLen: 1.4, zs: 0.82 });
      K.ball('chest', [0, m.chestY + 0.04, 0.19], [0.06, 0.06, 0.012], trim, { outline: 0, detail: 0.6 });
      K.ball('chest', [0, m.chestY + 0.04, 0.2], [0.03, 0.03, 0.008], PAL.cloth.blueDark, { outline: 0, detail: 0.5 });
      K.torus('hips', [0, m.hipY + 0.04, 0], 0.22, 0.024, COL.belt, { scale: [1, 0.8, 0.82], weave: 0.3 });
      stdArms(K, { sleeve: mail, sleeveTo: 'wrist', skin: COL.skin, upperR: 0.058, foreR: 0.052, handR: 0.068, hand: PAL.cloth.leather, puff: true, puffColor: COL.steel });
      stdHead(K, { skin: COL.skin, nose: 'round' });
      stdEyes(K, { style: 'adult', w: 0.125, h: 0.085, yaw: 0.32, pitch: -0.08, brow: 'heavy', browColor: PAL.char.hair, browW: 0.21, browPitch: 0.12, browTilt: -0.14 });
      stdMouth(K, { pitch: -0.58, w: 0.1 });
      for (const s of [1, -1]) lock(K, s * 0.22, -0.42, [0.3, 0.09, 0.12], PAL.char.hair, { lift: 0.06, rot: [0, 0, s * 0.2], outline: OUTLINE.char });
      // kettle helmet with a brim and a red plume
      const hy = m.headC + m.r * 0.18;
      K.add((d) => G.sphereCap(d * 1.2, 0.5 * Math.PI), TRS([0, hy, -0.01], [-0.08, 0, 0], [m.r * 1.12, m.r * 1.08, m.r * 1.12]), { bone: 'head', color: COL.steel, outline: OUTLINE.char, rep: [1, 1] });
      K.torus('head', [0, hy + 0.005, -0.01], m.r * 1.2, 0.022, COL.steel, { rot: [Math.PI / 2 - 0.08, 0, 0], outline: OUTLINE.char, scale: [1, 1, 1] });
      for (let i = 0; i < 4; i++) K.ball('head', [0, hy + m.r * 1.05 + i * 0.012, -0.05 - i * 0.05], [0.04, 0.06 - i * 0.008, 0.05], PAL.cloth.red, { rot: [-0.6, 0, 0], detail: 0.6 });
      // spear held upright (orient frame: +Z = down, -Z = up)
      const c = [-m.shX, m.handY - 0.05, 0];
      K.cyl('propR', [c[0], c[1], c[2] + 0.08], 0.017, 0.017, 1.95, PAL.wood.mid, { rot: [Math.PI / 2, 0, 0] });
      K.add(() => new THREE.ConeGeometry(0.045, 0.2, 4), TRS([c[0], c[1], c[2] - 1.0], [-Math.PI / 2, 0, 0], [1, 1, 0.4]), { bone: 'propR', color: COL.steel, rep: [1, 1] });
      K.ball('propR', [c[0], c[1], c[2] - 0.86], [0.04, 0.04, 0.06], PAL.cloth.red, { outline: 0, detail: 0.5 });
      stdItem(K);
    },
  },
  innkeeper: {
    label: 'Innkeeper',
    body: { ...ADULT, bodyX: 0.27, bodyZ: 0.23, leg: 0.46, shX: 0.29, hair: 0.0 },
    style: { bounce: 1.0, sway: 1.5, propR: 'tankard', arms: 'hipL', smile: 1.0, armOut: 0.25, weapon: 'none' },
    dress(K) {
      const m = K.m, k = m.k, shirt = PAL.cloth.cream, vest = PAL.cloth.leather, apron = PAL.paint.shutterGreen, brown = PAL.wood.dark;
      stdLegs(K, { pants: COL.darkTrousers, pantsTo: 'ankle', boot: COL.boot, bootStyle: 'chunky', thigh: 0.095, knee: 0.075, ankleR: 0.062, bootScale: 1.2 });
      stdTorso(K, [[0.001, -0.05], [0.23, -0.04], [0.31, 0.05], [0.34, 0.17], [0.33, 0.29], [0.29, 0.4], [0.18, 0.49], [0.001, 0.51]], { color: shirt, zs: 0.9 });
      K.lathe(null, [0, m.hipY, 0], [[0.33, 0.1], [0.35, 0.17], [0.342, 0.29], [0.3, 0.4], [0.2, 0.47]].map(([r, y]) => [r * k, y * k]), vest, { weights: wTorso(m), weave: 0.5, phiStart: 0.35, phiLen: TAU - 0.7, scale: [1, 1, 0.9] });
      for (let i = 0; i < 3; i++) K.ball('chest', [0.075, m.hipY + 0.19 + i * 0.08, 0.3 - i * 0.02], 0.016, COL.gold, { outline: 0, detail: 0.4 });
      skirt(K, [[0.335, 0.17], [0.34, 0.19], [0.345, 0.32], [0.345, m.hipY + 0.06], [0.338, m.hipY + 0.1]], apron, { phiStart: -0.78, phiLen: 1.56, zs: 0.93 });
      for (let i = 0; i < 3; i++) K.box('skirtF', [-0.12 + i * 0.12, 0.25, 0.31], [0.012, 0.16, 0.006], scaleHex(apron, 0.8), { rot: [0.12, (i - 1) * 0.35, 0] });
      K.torus('hips', [0, m.hipY + 0.1, 0], 0.338, 0.008, PAL.cloth.cream, { scale: [1, 1, 0.93], weave: 0.5 });
      stdArms(K, { sleeve: shirt, sleeveTo: 'elbow', skin: COL.ruddy, upperR: 0.074, foreR: 0.066, handR: 0.08 });
      stdHead(K, { skin: COL.ruddy, nose: 'big', noseC: mixHex(COL.ruddy, PAL.flower.red, 0.25), earScale: 1.1 });
      stdEyes(K, { style: 'dot', w: 0.13, yaw: 0.32, pitch: -0.06, brow: 'bushy', browColor: brown, browW: 0.24, highlights: true });
      stdMouth(K, { pitch: -0.62, w: 0.13, blush: 'always' });
      // a brown horseshoe of hair, bushy sideburns down to the moustache
      fringe(K, brown, { top: 0.22, bot: -0.36, sideburn: -0.42, from: 0.95, thick: 0.07, puff: 0.1, tuft: 0.1, locks: 15, seed: 9 });
      // the magnificent handlebar moustache
      for (const s of [1, -1]) {
        lock(K, s * 0.2, -0.42, [0.3, 0.12, 0.14], brown, { lift: 0.07, rot: [0, 0, s * 0.3], outline: OUTLINE.char });
        K.add((d) => G.torus(0.05, 0.016, d * 0.7, Math.PI * 0.9), TRS([s * 0.14, m.headC - m.r * 0.38, m.r * 0.82], [0, s * -0.4, s > 0 ? -0.2 : Math.PI + 0.2]), { bone: 'head', color: brown, rep: [1, 1] });
      }
      // a foaming tankard (orient frame: -Z = up)
      const c = [-m.shX, m.handY - 0.06, 0];
      K.cyl('propR', [c[0], c[1] + 0.06, c[2] - 0.05], 0.06, 0.065, 0.16, PAL.wood.mid, { rot: [Math.PI / 2, 0, 0] });
      K.torus('propR', [c[0], c[1] + 0.06, c[2] - 0.01], 0.066, 0.008, COL.iron, { rot: [0, 0, 0] });
      K.ball('propR', [c[0], c[1] + 0.06, c[2] - 0.14], [0.065, 0.065, 0.035], PAL.plaster.light, { outline: 0, detail: 0.6 });
      stdItem(K);
    },
  },
  nun: {
    label: 'Nun',
    body: { ...ADULT, r: 0.235, leg: 0.48, torso: 0.45, shX: 0.23, bodyX: 0.18, hair: 0.05 },
    style: { bounce: 0.55, sway: 0.5, twist: 0.5, armSwing: 0.2, cadence: 0.9, smile: 0.8, arms: 'clasp', headTilt: 0.05, fidget: 0.4, weapon: 'none', breathPeriod: 4.2 },
    dress(K) {
      const m = K.m, k = m.k, habit = PAL.cloth.blueDark, white = PAL.plaster.light;
      stdLegs(K, { pants: habit, pantsTo: 'ankle', boot: PAL.char.hair, bootStyle: 'shoe', thigh: 0.07, knee: 0.056, ankleR: 0.05 });
      stdTorso(K, [[0.001, -0.05], [0.17, -0.04], [0.2, 0.04], [0.2, 0.15], [0.21, 0.28], [0.2, 0.37], [0.14, 0.44], [0.001, 0.46]], { color: habit, zs: 0.84 });
      skirt(K, [[0.3, 0.02], [0.305, 0.04], [0.28, 0.14], [0.24, 0.3], [0.2, m.hipY + 0.02], [0.18, m.hipY + 0.08]], habit, { zs: 0.9, lining: PAL.char.hair });
      K.torus('hips', [0, m.hipY + 0.06, 0], 0.2, 0.018, PAL.cloth.rope, { scale: [1.02, 1, 0.9] });
      // white bib collar + a small gold pendant
      K.ball('chest', [0, m.neckY - 0.06, 0.07], [0.2, 0.1, 0.13], white, { weave: 1, detail: 0.9 });
      K.box('chest', [0, m.chestY + 0.0, 0.17], [0.02, 0.07, 0.01], COL.gold);
      K.box('chest', [0, m.chestY + 0.012, 0.172], [0.05, 0.018, 0.01], COL.gold);
      stdArms(K, { sleeve: habit, sleeveTo: 'wrist', skin: COL.pale, upperR: 0.056, foreR: 0.06, handR: 0.066, cuff: white });
      stdHead(K, { skin: COL.pale, nose: 'button', ears: false });
      stdEyes(K, { style: 'oval', w: 0.13, h: 0.2, yaw: 0.34, pitch: -0.14, lash: true, brow: 'line', browColor: PAL.wood.dark, browW: 0.2 });
      stdMouth(K, { pitch: -0.52, w: 0.11, blush: 'always' });
      // wimple framing the face + veil hanging down the back
      const h = K.head, open = 0.78;
      K.add((d) => new THREE.SphereGeometry(1, Math.round(22 * d), Math.round(14 * d), Math.PI / 2 + open, TAU - 2 * open, 0, 0.92 * Math.PI),
        TRS([0, h.c[1] - 0.01, -0.01], [0, 0, 0], [h.rx * 1.14, h.ry * 1.14, h.rz * 1.12]), { bone: 'head', color: white, weave: 1, outline: OUTLINE.char, rep: [3, 2] });
      K.torus('head', [0, h.c[1] + 0.03, 0.02], m.r * 0.98, 0.03, white, { rot: [0, 0, 0], scale: [1, 1.15, 1], weave: 1 });
      K.add((d) => G.sphereCap(d * 1.2, 0.5 * Math.PI), TRS([0, h.c[1] + 0.02, -0.03], [-0.25, 0, 0], [h.rx * 1.24, h.ry * 1.22, h.rz * 1.22]), { bone: 'head', color: habit, weave: 1, outline: OUTLINE.char, rep: [3, 2] });
      K.lathe('neck', [0, 0, -0.08], [[0.2, m.chestY - 0.05], [0.22, m.chestY + 0.06], [0.24, m.neckY], [0.22, m.headC]], habit, { weave: 1, phiStart: Math.PI - 1.1, phiLen: 2.2, scale: [1, 1, 0.7] });
      stdItem(K);
    },
  },
  merchant: {
    label: 'Merchant',
    body: { ...ADULT, leg: 0.53, torso: 0.46, bodyX: 0.16, shX: 0.235, hair: 0.18 },
    style: { hunch: 0.12, bounce: 0.85, cadence: 1.05, arms: 'straps', smile: 1.05, weapon: 'none', sway: 1.1 },
    dress(K) {
      const m = K.m, k = m.k, coat = PAL.cloth.mustard, sash = PAL.cloth.red, turban = PAL.cloth.purple;
      stdLegs(K, { pants: PAL.cloth.purpleDark, pantsTo: 'ankle', boot: COL.boot, bootStyle: 'tall', thigh: 0.07, knee: 0.058, ankleR: 0.05, cuff: COL.gold });
      stdTorso(K, [[0.001, -0.05], [0.16, -0.04], [0.18, 0.04], [0.175, 0.15], [0.19, 0.28], [0.2, 0.37], [0.17, 0.45], [0.1, 0.5], [0.001, 0.51]], { color: coat, zs: 0.84 });
      skirt(K, [[0.25, 0.26], [0.255, 0.28], [0.22, 0.4], [0.19, m.hipY + 0.03], [0.17, m.hipY + 0.08]], coat, { zs: 0.88, phiStart: 0.25, phiLen: TAU - 0.5, lining: sash });
      K.torus('hips', [0, m.hipY + 0.06, 0], 0.18, 0.035, sash, { scale: [1.05, 1, 0.9], weave: 1 });
      K.limb('hips', [0.12, m.hipY + 0.05, 0.12], [0.16, m.hipY - 0.12, 0.16], 0.025, 0.02, sash, { weave: 1, outline: 0, detail: 0.5, sz: 0.5 });
      stdArms(K, { sleeve: coat, sleeveTo: 'wrist', skin: COL.olive, upperR: 0.05, foreR: 0.046, handR: 0.064, cuff: sash });
      // the mountain of wares on his back: a pack, pans, a kettle
      const by = m.chestY + 0.04, bz = -0.28;
      K.ball('chest', [0, by + 0.12, bz], [0.25, 0.42, 0.17], PAL.cloth.leather, { weave: 1, detail: 0.9, grad: [by - 0.3, by + 0.2, 0.8] });
      K.ball('chest', [0, by + 0.56, bz + 0.02], [0.2, 0.08, 0.14], PAL.cloth.rope, { weave: 1, detail: 0.7 });
      for (const s of [1, -1]) K.limb('chest', [s * 0.13, m.neckY - 0.02, 0.06], [s * 0.15, m.chestY - 0.12, 0.17], 0.018, 0.018, PAL.cloth.leather, { outline: 0, detail: 0.5, sx: 1.5, sz: 0.5 });
      K.cyl('chest', [0.27, by + 0.2, bz], 0.13, 0.12, 0.03, COL.iron, { rot: [0, 0, Math.PI / 2 - 0.2] });
      K.cyl('chest', [0.32, by + 0.2, bz + 0.18], 0.012, 0.012, 0.22, PAL.wood.dark, { rot: [Math.PI / 2, 0, 0] });
      K.cyl('chest', [-0.26, by - 0.02, bz + 0.02], 0.1, 0.09, 0.028, COL.iron, { rot: [0, 0, -Math.PI / 2 + 0.25] });
      K.ball('chest', [0.02, by + 0.68, bz], [0.1, 0.085, 0.1], PAL.tile.mid, { detail: 0.7 });
      K.cyl('chest', [0.13, by + 0.7, bz], 0.012, 0.02, 0.1, PAL.tile.mid, { rot: [0, 0, -1.0] });
      K.cyl('chest', [-0.1, by - 0.3, bz + 0.05], 0.06, 0.06, 0.12, PAL.wood.light, { rot: [0, 0, 0] });
      stdHead(K, { skin: COL.olive, nose: 'big', noseC: mixHex(COL.olive, PAL.tile.mid, 0.15) });
      stdEyes(K, { style: 'narrow', w: 0.12, h: 0.17, yaw: 0.32, pitch: -0.1, brow: 'line', browColor: PAL.char.hair, browW: 0.24 });
      stdMouth(K, { pitch: -0.58, w: 0.14 });
      for (const s of [1, -1]) {
        lock(K, s * 0.17, -0.42, [0.26, 0.08, 0.1], PAL.char.hair, { lift: 0.05, rot: [0, 0, s * 0.35], outline: 0 });
        lock(K, s * 0.42, -0.33, [0.14, 0.06, 0.08], PAL.char.hair, { lift: 0.05, rot: [0, 0, s * -0.7], outline: 0 });
      }
      lock(K, 0, -0.9, [0.1, 0.16, 0.1], PAL.char.hair, { lift: 0.06, outline: OUTLINE.char });
      // turban: two wound rolls and a dome, a jewel and a feather
      const hy = m.headC + m.r * 0.32;
      K.torus('head', [0, hy, -0.01], m.r * 0.96, 0.07, turban, { rot: [Math.PI / 2 - 0.1, 0, 0.12], weave: 1, outline: OUTLINE.char, detail: 1.2 });
      K.torus('head', [0, hy + 0.1, -0.02], m.r * 0.84, 0.065, scaleHex(turban, 0.9), { rot: [Math.PI / 2 - 0.1, 0, -0.14], weave: 1, outline: OUTLINE.char, detail: 1.2 });
      K.ball('head', [0, hy + 0.14, -0.03], [m.r * 0.82, m.r * 0.62, m.r * 0.82], turban, { weave: 1 });
      K.ball('head', [0, hy + 0.05, m.r * 1.02], [0.04, 0.05, 0.022], COL.gold, { outline: 0, detail: 0.6 });
      K.ball('head', [0, hy + 0.05, m.r * 1.045], [0.02, 0.026, 0.012], PAL.flower.red, { outline: 0, detail: 0.5 });
      K.ball('head', [0.03, hy + 0.26, m.r * 0.72], [0.028, 0.16, 0.014], PAL.flower.yellow, { rot: [-0.35, 0, -0.3], detail: 0.7 });
      stdItem(K);
    },
  },
};
DEFS.villager = {
  label: (a, v) => (VILLAGERS[v] || VILLAGERS.farmer).label,
  ages: [30],
  variants: Object.keys(VILLAGERS),
  body: (a, v) => (VILLAGERS[v] || VILLAGERS.farmer).body,
  style: (a, v) => (VILLAGERS[v] || VILLAGERS.farmer).style,
  dress: (K, a, v) => (VILLAGERS[v] || VILLAGERS.farmer).dress(K),
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// emote balloons (one shared canvas atlas; one sprite per character while it shows)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const ICONS = { surprised: 0, question: 1, music: 2, happy: 2, love: 3, sweat: 4, sleepy: 5, angry: 6, sad: 7 };
function iconAtlas() {
  return Assets.canvasTexture('chars:emote-atlas', {
    w: 512, h: 256, wrap: 'clamp', mipmaps: true, anisotropy: 4,
    draw(g, W, H) {
      const S = 128;
      const glyphs = [['!', PAL.cloth.red], ['?', PAL.cloth.blue], ['♪', PAL.cloth.purple], ['♥', PAL.flower.red], ['drop', PAL.water.mid], ['Zz', PAL.cloth.blue], ['vein', PAL.cloth.red], ['…', PAL.char.eye]];
      glyphs.forEach(([ch, col], i) => {
        const x0 = (i % 4) * S, y0 = Math.floor(i / 4) * S, cx = x0 + S / 2, cy = y0 + S / 2 - 6;
        // balloon with a tail
        g.lineJoin = 'round';
        g.beginPath();
        g.ellipse(cx, cy, 46, 42, 0, 0, TAU);
        g.moveTo(cx - 10, cy + 36); g.lineTo(cx - 2, cy + 58); g.lineTo(cx + 14, cy + 34);
        g.fillStyle = PAL.char.white; g.strokeStyle = PAL.outline.char; g.lineWidth = 7;
        g.stroke(); g.fill();
        g.beginPath(); g.ellipse(cx, cy, 44, 40, 0, 0, TAU); g.fill();
        if (ch === 'drop') {
          g.beginPath(); g.moveTo(cx, cy - 30); g.bezierCurveTo(cx + 26, cy + 4, cx + 22, cy + 28, cx, cy + 28); g.bezierCurveTo(cx - 22, cy + 28, cx - 26, cy + 4, cx, cy - 30);
          g.fillStyle = col; g.fill(); g.fillStyle = PAL.water.foam; g.beginPath(); g.ellipse(cx - 8, cy + 10, 5, 9, -0.4, 0, TAU); g.fill();
        } else if (ch === 'vein') {
          g.strokeStyle = col; g.lineWidth = 9; g.lineCap = 'round';
          for (const [a, b, c, d] of [[-22, -8, -8, -22], [8, -22, 22, -8], [22, 8, 8, 22], [-8, 22, -22, 8]]) { g.beginPath(); g.moveTo(cx + a, cy + b); g.quadraticCurveTo(cx, cy, cx + c, cy + d); g.stroke(); }
        } else {
          g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = `900 ${ch.length > 1 && ch !== '…' ? 44 : 64}px system-ui, "Arial Rounded MT Bold", sans-serif`;
          g.fillText(ch, cx + (ch === '♪' ? -2 : 0), cy + 3);
        }
      });
    },
  });
}
function iconMaterial(name) {
  const i = ICONS[name] ?? 0;
  return Assets.material('chars:emote:' + i, () => {
    const t = iconAtlas().clone();
    t.repeat.set(0.25, 0.5); t.offset.set((i % 4) * 0.25, 0.5 - Math.floor(i / 4) * 0.5); t.needsUpdate = true;
    const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, alphaTest: 0.05, fog: false });
    m.name = 'chars:emote:' + name; return m;
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// looks (cached, shared) and instances
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function normAge(id, age, act) {
  const def = DEFS[id];
  if (!def) return 0;
  if (act === 1 || act === 2 || act === 3) { const a = def.ages[Math.min(def.ages.length - 1, act - 1)]; if (a != null) return a; }
  if (typeof age === 'string') {
    const s = age.toLowerCase();
    if (/boy|girl|child|kid|young(?!\s*man)|act1|small/.test(s)) age = 6;
    else if (/young|teen|act2/.test(s)) age = 16;
    else if (/man|woman|adult|grown|act3|old/.test(s)) age = 26;
    else age = parseFloat(s);
  }
  if (!Number.isFinite(age)) age = def.ages[0];
  if (id === 'hero') return age < 12 ? 6 : age < 20 ? 16 : 26;
  return def.ages[0];
}

const LOOKS = new Map();
function getLook(id, age, variant) {
  const key = `${id}|${age}|${variant || '-'}`;
  if (LOOKS.has(key)) return LOOKS.get(key);
  const t0 = performance.now();
  const def = DEFS[id];
  const m = makeBody(def.body(age, variant));
  const K = new Kit(m);
  const style = Object.assign({ seed: LOOKS.size * 1.37 + age * 0.11 }, def.style(age, variant));
  K.style = style;
  baseJoints(K);
  def.dress(K, age, variant);
  const index = {}; K.joints.forEach((j, i) => { index[j.name] = i; });
  const geos = mergeKit(K, index);
  const look = { key, id, age, variant: variant || null, label: def.label(age, variant), metrics: m, style, joints: K.joints, geos, buildMs: Math.round(performance.now() - t0) };
  for (const g of [geos.toon, geos.hull, geos.face]) g.name = 'chars:' + key;
  LOOKS.set(key, look);
  return look;
}

let instanceCount = 0;
function instantiate(look) {
  const root = new THREE.Group();
  root.name = 'char:' + look.key;
  const rig = makeSkeleton(look.joints);
  root.add(rig.bones.root);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(rig.list);
  const h = look.metrics.height;
  const ident = new THREE.Matrix4();
  const meshes = [];
  const mk = (geo, mat, name, shadow) => {
    const s = new THREE.SkinnedMesh(geo, mat);
    s.name = name; s.bind(skeleton, ident);
    s.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h * 0.5, 0), h * 1.35);
    s.castShadow = shadow; s.receiveShadow = false;
    root.add(s); meshes.push(s); return s;
  };
  mk(look.geos.toon, MAT.toon(), 'body', true);
  if (look.geos.hull.index.count) mk(look.geos.hull, MAT.hull(), 'outline', false).userData.isOutline = true;
  if (look.geos.face.index.count) mk(look.geos.face, MAT.face(), 'face', false);

  const anim = createAnimator({ root, rig, metrics: look.metrics, style: look.style });
  // emote balloon
  let icon = null, iconT = 0, iconDur = 0, iconName = null;
  anim.onIcon = (name, dur) => {
    if (!(name in ICONS)) return;
    if (!icon) { icon = new THREE.Sprite(iconMaterial(name)); icon.name = 'emote'; icon.renderOrder = 5; root.add(icon); }
    // start invisible at bubble height: it pops in on the next update (never a full-size balloon at the feet)
    icon.scale.setScalar(1e-4); icon.position.set(0.12 * look.metrics.k, bubbleY, 0);
    icon.material = iconMaterial(name);
    iconName = name; iconT = 0; iconDur = Number.isFinite(dur) ? Math.max(0.8, dur) : Infinity;
    icon.visible = true;
  };
  const bubbleY = look.metrics.height + 0.26 * Math.max(0.8, look.metrics.k);
  const tmpV = new THREE.Vector3();

  instanceCount++;
  const ch = {
    id: look.id, age: look.age, variant: look.variant, label: look.label, key: look.key,
    root, height: h, metrics: look.metrics, bones: rig.bones, skeleton, anim, meshes,
    setFacing: (rad, instant) => anim.setFacing(rad, instant),
    setMove: (speed, opts) => anim.setMove(speed, opts),
    play: (name, opts) => anim.play(name, opts || {}),
    stop: (fade) => anim.stop(fade),
    emote: (name, dur) => anim.emote(name, dur),
    lookAt: (v) => anim.lookAt(v),
    get facing() { return anim.facing; },
    get clip() { return anim.current; },
    get onStep() { return anim.onStep; }, set onStep(fn) { anim.onStep = fn; },
    get onEvent() { return anim.onEvent; }, set onEvent(fn) { anim.onEvent = fn; },
    get drawCalls() { return meshes.length + (icon && icon.visible ? 1 : 0); },
    update(dt) {
      try {
        anim.update(dt);
        if (icon && icon.visible) {
          iconT += dt;
          if (iconT >= iconDur) { icon.visible = false; iconName = null; if (anim.current === 'sleep' && iconDur === Infinity) icon.visible = true; }
          else {
            const pop = iconT < 0.22 ? Math.sin((iconT / 0.22) * Math.PI * 0.75) * 1.25 : 1;
            const out = iconDur === Infinity ? 1 : 1 - sstep(iconDur - 0.18, iconDur, iconT);
            const s = 0.36 * Math.max(0.8, look.metrics.k) * Math.max(0, pop * out);
            icon.scale.set(s, s, s);
            // follow the head, bob gently
            if (rig.bones.head) { rig.bones.head.getWorldPosition(tmpV); root.worldToLocal(tmpV); icon.position.set(tmpV.x + 0.12 * look.metrics.k, Math.max(bubbleY * 0.5, tmpV.y + look.metrics.r * 2.3) + Math.sin(iconT * 5) * 0.015, tmpV.z); }
          }
        }
        if (icon && iconName === 'sleepy' && anim.current !== 'sleep' && iconDur === Infinity) { icon.visible = false; iconName = null; }
      } catch (e) { reportError('Chars.update', e); }
    },
    attach(obj, boneName = 'handR') { const b = rig.bones[boneName]; if (b && obj) b.add(obj); return !!b; },
    state() { return Object.assign({ id: look.id, age: look.age, variant: look.variant, label: look.label, height: +h.toFixed(3), drawCalls: ch.drawCalls, emoteIcon: icon && icon.visible ? iconName : null }, anim.state()); },
    dispose() {
      try {
        root.removeFromParent();
        skeleton.dispose();
        if (icon) icon.removeFromParent();
        instanceCount--;
      } catch (e) { reportError('Chars.dispose', e); }
    },
  };
  return ch;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// public API
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const Chars = {
  /** Build a character. id: hero|halvard|willow|sera|barty|villager. opts: {age, act, variant, facing} */
  build(id, opts = {}) {
    try {
      if (!DEFS[id]) { reportError('Chars.build', new Error(`unknown character "${id}"; known: ${Object.keys(DEFS).join(', ')}`)); id = 'villager'; }
      const age = normAge(id, opts.age, opts.act);
      const variant = id === 'villager' ? (VILLAGERS[opts.variant] ? opts.variant : 'farmer') : null;
      const ch = instantiate(getLook(id, age, variant));
      if (opts.facing != null) ch.setFacing(opts.facing, true);
      return ch;
    } catch (e) {
      reportError('Chars.build', e);
      // never leave a caller with nothing: an empty group that still honours the contract
      const root = new THREE.Group();
      return { id, root, height: 1.6, setFacing() {}, setMove() {}, play() { return false; }, stop() {}, emote() { return false; }, lookAt() {}, update() {}, dispose() { root.removeFromParent(); }, attach() { return false; }, state: () => ({ error: true }), drawCalls: 0 };
    }
  },
  list() { return Object.keys(DEFS); },
  variants(id) { return id === 'villager' ? Object.keys(VILLAGERS) : []; },
  /** every buildable look: [{id, age, variant, label}] */
  catalog() {
    const out = [];
    for (const [id, def] of Object.entries(DEFS)) {
      if (id === 'villager') for (const v of Object.keys(VILLAGERS)) out.push({ id, age: def.ages[0], variant: v, label: VILLAGERS[v].label });
      else for (const a of (id === 'hero' ? [6, 26] : def.ages)) out.push({ id, age: a, variant: null, label: def.label(a) });
    }
    return out;
  },
  /** build every look's geometry up front (behind a fade) */
  prewarm() { for (const c of Chars.catalog()) getLook(c.id, normAge(c.id, c.age), c.variant); return Chars.stats(); },
  stats() {
    const looks = [...LOOKS.values()].map(l => ({ key: l.key, tris: l.geos.tris, parts: l.geos.byPart, bones: l.joints.length, height: +l.metrics.height.toFixed(3), buildMs: l.buildMs }));
    return { looks, instances: instanceCount, materials: 3 };
  },
  CLIPS: CLIP_NAMES,
  EMOTES,
};

export default Chars;
