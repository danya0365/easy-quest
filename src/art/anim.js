/**
 * anim.js — the procedural character rig and its clips.                                  (P08, owner: src/art/anim.js)
 *
 * chars.js builds the model (one skinned toon mesh + its outline hull + a face mesh, all bound to ONE skeleton made
 * here) and hands it to createAnimator(). Nothing here knows what a character looks like; it only knows bone names,
 * body metrics (leg / arm lengths) and a style (posture, weapon, bounce).
 *
 *   import { makeSkeleton, createAnimator, CLIP_NAMES } from './anim.js';
 *   const rig = makeSkeleton(joints);                 // joints: [{name, parent, at:[x,y,z] root-space bind position}]
 *   const an  = createAnimator({ root, rig, metrics, style });
 *   an.setFacing(rad, instant?)   an.setMove(speed, {run}?)   an.play(name, {loop, fade})   an.emote(name)
 *   an.lookAt(worldVec3 | null)   an.update(dt)   an.state()   an.onStep = (side) => {}   an.onEvent = (name) => {}
 *
 * How it moves (docs/DQV-RUBRIC.md "Motion"):
 *  - Pose layers: a LOCOMOTION base (idle / walk / run blended by speed), an ACTION layer with smooth cross-fades
 *    (talk, nod, surprised, celebrate, attack, cast, hurt, sit, sleep, kneel, grieve, wave, turn), then additive
 *    life on top (auto blink, breathing, glances, look-at, facial expression, emotes).
 *  - Feet are REAL: each foot is planted in world space while it carries weight and swings along an arc to a
 *    predicted landing spot. Stride length = speed x stance time, so feet never skate, whatever speed the field
 *    moves the root at. Turning in place makes the feet step round. If the root is NOT moving (a treadmill: menus,
 *    this demo's in-place mode) the planted feet slide back at the move speed instead, so the cycle still reads.
 *  - Walk and run are different cycles: walk = long double support, heel-toe roll, straight arm swing, bob up over
 *    the planted leg, hip sway over the stance foot; run = flight phase, high knees and heel kick, bent pumping arms,
 *    forward lean, squash on landing.
 *  - Legs and (when a clip asks) arms are solved with 2-bone IK, so kneeling knees touch the ground, a greatsword
 *    held like a walking stick stays upright, and hands meet on an item held aloft.
 *  - Walk heights are built from walkDrop(): the pelvis follows a smooth wave between "both feet down" and
 *    "over the planted leg", so a planted foot is always in reach and the bob is a wave, not an IK kink. The back
 *    heel peels up at the end of each stance. style.gait = 'heavy' adds a shoulder roll, a weight-taking dip at
 *    each landing and a slower cadence — a big man lumbers, a child scurries, on the same code.
 *  - style.plant = {len, gripY, out, fwd, tipOut, tipFwd, swing, lift} makes the right hand's prop a WALKING STAFF:
 *    its tip is planted in world space like a third foot (once per stride, with the left foot), carried forward in
 *    an arc, and the hand rides the staff (so Halvard's greatsword thumps the ground and never slides).
 *  - Turning is a critically-damped spring on the root's yaw, never a snap; the head leads, the chest follows.
 *  - Cloaks, skirts and plaits are damped springs driven by speed, turning, bob and the legs underneath.
 *
 * Never throws out of update(): failures go to __DQ.errors and the character holds its last pose.
 */
import * as THREE from 'three';
import { reportError } from '../engine/debug.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
/** 0 before a, rises to 1 by b, holds, falls back to 0 between c and d. */
const env = (t, a, b, c = Infinity, d = Infinity) => sstep(a, b, t) * (1 - sstep(c, d, t));
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const hash1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** smooth value noise in [-1, 1] */
const vnoise1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash1(i), hash1(i + 1), u) * 2 - 1; };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// skeleton
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const YXZ_BONES = new Set(['root', 'hips', 'spine', 'chest', 'neck', 'head']);

/**
 * joints: [{name, parent, at:[x,y,z]}] in bind (rest) pose, root space, parents listed before children.
 * Returns {bones: {name: Bone}, list: Bone[], index: {name: i}, bind: {name: Vector3 local}, abs: {name: [x,y,z]}}
 */
export function makeSkeleton(joints) {
  const bones = {}, list = [], index = {}, bind = {}, abs = {};
  for (const j of joints) {
    const b = new THREE.Bone();
    b.name = j.name;
    if (YXZ_BONES.has(j.name)) b.rotation.order = 'YXZ';
    const p = j.parent ? bones[j.parent] : null;
    const pa = j.parent ? abs[j.parent] : [0, 0, 0];
    b.position.set(j.at[0] - pa[0], j.at[1] - pa[1], j.at[2] - pa[2]);
    bind[j.name] = b.position.clone();
    abs[j.name] = j.at.slice();
    if (p) p.add(b);
    index[j.name] = list.length;
    bones[j.name] = b;
    list.push(b);
  }
  return { bones, list, index, bind, abs };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// pose buffers
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// per bone: rx ry rz  px py pz  sx sy sz (scale stored as offset from 1)
const BS = 9;
// IK: footL footR (root space) · handL handR chest space · handL handR root space · each [x·w, y·w, z·w, w]
const IK_SLOTS = ['footL', 'footR', 'handLc', 'handRc', 'handLr', 'handRr'];
// scalar channels
export const EXPR = ['blink', 'wide', 'happy', 'lookX', 'lookY', 'browUp', 'browAngry', 'browSad', 'smile', 'frown',
  'open', 'O', 'blush', 'weapon', 'item', 'legsFree', 'footPitchL', 'footPitchR', 'orientL', 'orientR', 'twoHand', 'tilt', 'seat',
  'stick', 'blade', 'bladeX', 'bladeY', 'bladeZ'];
const EX = Object.fromEntries(EXPR.map((k, i) => [k, i]));

class Pose {
  constructor(nb) {
    this.nb = nb;
    this.ikOff = nb * BS;
    this.exOff = this.ikOff + IK_SLOTS.length * 4;
    this.a = new Float32Array(this.exOff + EXPR.length);
  }
  clear() { this.a.fill(0); return this; }
  copy(o) { this.a.set(o.a); return this; }
  /** this += (o - this) * k * mask */
  blend(o, k, mask) {
    if (k <= 0) return this;
    const a = this.a, b = o.a;
    if (k >= 1 && !mask) { a.set(b); return this; }
    if (!mask) { for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * k; }
    else { for (let i = 0; i < a.length; i++) { const w = k * mask[i]; if (w) a[i] += (b[i] - a[i]) * w; } }
    return this;
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// clip context (the writer every clip gets)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function makeWriter(index) {
  const W = {
    pose: null,
    has: (name) => index[name] !== undefined,
    r(name, x, y = 0, z = 0) { const i = index[name]; if (i === undefined) return W; const a = W.pose.a, o = i * BS; a[o] += x; a[o + 1] += y; a[o + 2] += z; return W; },
    p(name, x, y = 0, z = 0) { const i = index[name]; if (i === undefined) return W; const a = W.pose.a, o = i * BS; a[o + 3] += x; a[o + 4] += y; a[o + 5] += z; return W; },
    s(name, x, y = x, z = x) { const i = index[name]; if (i === undefined) return W; const a = W.pose.a, o = i * BS; a[o + 6] += x; a[o + 7] += y; a[o + 8] += z; return W; },
    /** mirrored limb rotation: side +1 = left (+X), -1 = right */
    rl(base, side, x, y = 0, z = 0) { return W.r(base + (side > 0 ? 'L' : 'R'), x, y * side, z * side); },
    ik(slot, x, y, z, w = 1) { const o = W.pose.ikOff + IK_SLOTS.indexOf(slot) * 4, a = W.pose.a; a[o] += x * w; a[o + 1] += y * w; a[o + 2] += z * w; a[o + 3] += w; return W; },
    foot(side, x, y, z, w = 1) { return W.ik(side > 0 ? 'footL' : 'footR', x, y, z, w); },
    handC(side, x, y, z, w = 1) { return W.ik(side > 0 ? 'handLc' : 'handRc', x, y, z, w); },
    handR(side, x, y, z, w = 1) { return W.ik(side > 0 ? 'handLr' : 'handRr', x, y, z, w); },
    x(name, v) { W.pose.a[W.pose.exOff + EX[name]] += v; return W; },
  };
  return W;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// rest postures (shared by idle / walk / run so the character keeps its personality while moving)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function restArms(P, c, k = 1, moving = 0, run = 0, skip = null) {
  const s = c.style, m = c.m, kk = m.k;
  const a = s.arms || 'side';
  const kL = k * (1 - (skip ? skip.L || 0 : 0)), kR = k * (1 - (skip ? skip.R || 0 : 0));
  // chest-space: origin at the chest bone, axes = the character's (x left, y up, z forward)
  const bellyY = (m.hipY + m.torso * 0.28) - m.chestY;
  switch (a) {
    case 'clasp': {   // hands folded in front of the tummy (Sera, the nun)
      const f = 1 - moving * 0.35, w = Math.min(kL, kR) * f;
      P.handC(1, 0.035 * kk, bellyY, m.bodyZ + 0.075 * kk, w); P.handC(-1, -0.035 * kk, bellyY - 0.01 * kk, m.bodyZ + 0.08 * kk, w);
      break;
    }
    case 'hips': case 'hipL': {   // fist(s) on the hips, elbows out
      const f = 1 - moving * 0.6;
      const hy = (m.hipY + m.torso * 0.12) - m.chestY;
      P.handC(1, m.bodyX + 0.02 * kk, hy, 0.02 * kk, kL * f);
      P.rl('arm', 1, 0, 0, 0.5 * kL * f);
      if (a === 'hips') { P.handC(-1, -m.bodyX - 0.02 * kk, hy, 0.02 * kk, kR * f); P.rl('arm', -1, 0, 0, 0.5 * kR * f); }
      break;
    }
    case 'behind': {
      const f = 1 - moving * 0.4;
      P.handC(1, 0.04 * kk, bellyY, -m.bodyZ - 0.05 * kk, kL * f); P.handC(-1, -0.04 * kk, bellyY, -m.bodyZ - 0.05 * kk, kR * f);
      break;
    }
    case 'straps': {  // thumbs hooked under pack straps
      const f = 1 - moving * 0.25;
      const sy = (m.shoulderY - m.torso * 0.28) - m.chestY;
      P.handC(1, m.bodyX * 0.6, sy, m.bodyZ + 0.06 * kk, kL * f); P.handC(-1, -m.bodyX * 0.6, sy, m.bodyZ + 0.06 * kk, kR * f);
      break;
    }
    default: break;
  }
  const r = s.propR;   // what the right hand carries all the time
  if (r === 'stick' || r === 'spear' || r === 'cane' || r === 'fork') {
    const fwd = r === 'cane' ? 0.24 : r === 'stick' ? 0.2 : 0.1;
    const h = s.gripY != null ? s.gripY : s.plant ? s.plant.gripY : m.shoulderY - m.A1 - m.A2 * 0.6;
    const swing = moving ? Math.sin(c.loco.phase * Math.PI * 2) * 0.05 * kk : 0;
    // carried (running, or a staff that is never planted): upright in the fist, tipped back when running
    P.handR(-1, -(m.shoulderX + 0.06 * kk), h, fwd * kk + swing, kR);
    P.x('orientR', kR);
    if (run && s.plant) P.x('tilt', 0.8 * kR * run);
    // a walking staff: the animator plants its tip on the ground and the hand follows the staff
    if (s.plant) P.x('stick', kR);
  } else if (r === 'tankard' || r === 'loaf') {
    P.rl('arm', -1, -0.35 * kR, 0, 0.05 * kR); P.rl('fore', -1, -1.45 * kR, -0.25 * kR, 0);
    P.x('orientR', kR);
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CLIPS. sample(P, t, c): P = writer (pose), t = clip time (s), c = context
//   c.m metrics · c.style · c.loco (phase/stride info, base layer only) · c.seed · c.T (animator time)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const UPPER = 'upper', FULL = 'full', HEAD = 'head';

function idleClip(P, t, c) {
  const s = c.style, m = c.m, k = m.k, seed = c.seed;
  const breathe = Math.sin(t * TAU / s.breathPeriod);
  const sway = vnoise1(t * 0.23 + seed) * 0.6 + Math.sin(t * 0.9 + seed) * 0.4;
  // posture
  P.r('spine', s.hunch * 0.9, 0, 0); P.r('chest', s.hunch * 0.5 + s.chestOut, 0, 0); P.r('neck', -s.hunch * 0.8 + s.headTilt, 0, 0);
  P.r('head', -s.hunch * 0.3, 0, s.headCock);
  // breathing: chest lifts, shoulders ride up, head counter-moves
  P.s('chest', breathe * 0.012 * s.breath, breathe * 0.02 * s.breath, breathe * 0.018 * s.breath);
  P.p('chest', 0, breathe * 0.004 * k * s.breath, 0);
  P.r('clavL', 0, 0, breathe * 0.025 * s.breath); P.r('clavR', 0, 0, -breathe * 0.025 * s.breath);
  P.r('head', -breathe * 0.012, 0, 0);
  // slow weight shift from foot to foot
  P.p('hips', sway * 0.012 * k * s.fidget, -Math.abs(sway) * 0.004 * k, 0);
  P.r('hips', 0, 0, -sway * 0.02 * s.fidget); P.r('chest', 0, 0, sway * 0.025 * s.fidget);
  // arms hang with a little A, swaying with the breath
  const aOut = s.armOut + breathe * 0.015;
  P.rl('arm', 1, 0.02 + sway * 0.02 * s.fidget, 0, aOut); P.rl('arm', -1, 0.02 - sway * 0.02 * s.fidget, 0, aOut);
  P.rl('fore', 1, -s.elbow, 0, 0); P.rl('fore', -1, -s.elbow, 0, 0);
  P.rl('hand', 1, 0, 0, 0.1); P.rl('hand', -1, 0, 0, 0.1);
  // children bounce on their toes now and then
  if (s.kid) {
    const hop = Math.max(0, Math.sin(t * 2.3 + seed)) ** 6 * env((t + seed * 7) % 9, 4, 4.3, 6.5, 7);
    P.p('hips', 0, hop * 0.02 * k, 0); P.x('footPitchL', hop * 0.35); P.x('footPitchR', hop * 0.35);
  }
  restArms(P, c, 1, 0);
  P.x('smile', s.smile);
}

/**
 * How far the pelvis must come down so both feet reach the ground at double support (front foot landK*D ahead,
 * back foot (1-landK)*D behind with its heel already lifting). Walk heights are built from this, so the hips never
 * rise out of reach of a planted foot and the bob is a smooth wave, not an IK kink.
 */
export function walkDrop(m, D, landK, heelLift) {
  const reach = (m.L1 + m.L2) * 0.985;
  const f = reach - Math.sqrt(Math.max(0, reach * reach - (landK * D) ** 2));
  const b = reach - Math.sqrt(Math.max(0, reach * reach - ((1 - landK) * D) ** 2)) - heelLift;
  return Math.max(0, f, b);
}

/** walk + run share this; runK picks the cycle */
function locoClip(P, t, c, run) {
  const s = c.style, m = c.m, k = m.k, L = c.loco;
  const zL = L.zL, zR = L.zR, half = Math.max(0.05 * k, L.D * 0.5);
  const legPh = L.phase * TAU;                                    // L lands at phase 0
  const step2 = (L.phase * 2) % 1;                                // per step: 0 = a foot lands
  const heavy = s.gait === 'heavy';
  if (!run) {
    // ── WALK: heel-toe, straight arms, the body rises over the planted leg and sinks into each landing ──
    const stride = clamp(L.D / (m.legLen * 1.1), 0, 1);
    const drop = walkDrop(m, L.D, L.landK, L.heel);
    // knees stay soft at mid-stance (kneeBend), children spring up more (bounce), heavy men sink into the landing
    const soft = clamp(s.kneeBend, 0, 0.9) * (1 - clamp(s.bounce * 0.45, 0, 0.8));
    const wave = 0.5 + 0.5 * Math.cos(step2 * TAU);                // 1 at landing, 0 at mid-stance
    const land = env(step2, 0, 0.07, 0.09, heavy ? 0.34 : 0.24);    // the weight arriving on the new foot
    const dip = land * (heavy ? 0.02 : 0.008) * k;
    const swayW = Math.sin(legPh + TAU * (0.25 - L.duty * 0.5));   // + while the LEFT foot carries the weight
    P.p('hips', swayW * 0.018 * k * s.sway, -drop * (soft + (1 - soft) * wave) - dip, 0);
    P.r('hips', 0.04 + s.hunch * 0.3, -(zL - zR) / (half * 2) * 0.16 * s.twist, -swayW * 0.04 * s.sway);
    P.r('spine', s.hunch * 0.8 + land * (heavy ? 0.05 : 0.01), 0, 0);
    // shoulders roll over the stance leg (a big man lumbers), the head stays level
    const roll = s.roll * (0.5 + 0.5 * stride);
    P.r('chest', s.hunch * 0.4 + s.chestOut, (zL - zR) / (half * 2) * 0.2 * s.twist, Math.sin(legPh + 1.2) * 0.03 * s.sway - swayW * 0.085 * roll);
    P.s('chest', land * 0.02 * s.roll, -land * 0.025 * s.roll, land * 0.02 * s.roll);
    P.r('clavL', 0, 0, Math.max(0, -swayW) * 0.1 * roll); P.r('clavR', 0, 0, -Math.max(0, swayW) * 0.1 * roll);
    P.r('neck', -s.hunch * 0.6 - 0.03 + land * (heavy ? 0.07 : 0.02), 0, swayW * 0.05 * roll);
    P.r('head', Math.sin(step2 * TAU + 0.8) * 0.025, 0, s.headCock * 0.5 + swayW * 0.03 * roll);
    const swing = 0.52 * s.armSwing * (0.35 + 0.65 * stride);
    const backK = s.cloakArms ? 0.25 : 1;
    const aL = -(zR / half) * swing * s.armSwingL, aR = -(zL / half) * swing * s.armSwingR;
    P.rl('arm', 1, aL > 0 ? aL * backK : aL, 0, s.armOut + 0.03 + (s.cloakArms ? 0.08 : 0) + (heavy ? Math.max(0, -swayW) * 0.08 : 0));
    P.rl('arm', -1, aR > 0 ? aR * backK : aR, 0, s.armOut + 0.03 + (s.cloakArms ? 0.08 : 0) + (heavy ? Math.max(0, swayW) * 0.08 : 0));
    P.rl('fore', 1, -0.18 - Math.max(0, -zR / half) * 0.35 - s.elbow, 0, 0);
    P.rl('fore', -1, -0.18 - Math.max(0, -zL / half) * 0.35 - s.elbow, 0, 0);
    P.rl('hand', 1, 0, 0, 0.12); P.rl('hand', -1, 0, 0, 0.12);
    restArms(P, c, 1, 1);
  } else {
    // ── RUN: lean, pumping bent arms, flight bob, squash on landing ──
    const lean = 0.2 * s.runLean;
    const land = Math.max(0, 1 - step2 / Math.max(0.05, L.duty * 2));        // 1 right at touch-down
    const flight = sstep(L.duty * 2, 1, step2);
    const bob = -Math.sin(Math.min(1, step2 / Math.max(0.05, L.duty * 2)) * Math.PI) * 0.035 * k + Math.sin(clamp((step2 - L.duty * 2) / (1 - L.duty * 2), 0, 1) * Math.PI) * 0.045 * k * s.bounce;
    P.p('hips', Math.sin(legPh + TAU * 0.1) * 0.012 * k * s.sway, bob, 0.02 * k);
    P.r('hips', lean * 0.5, -(zL - zR) / (half * 2) * 0.22 * s.twist, 0);
    P.r('spine', lean * 0.6 + s.hunch * 0.6, 0, 0);
    P.r('chest', lean * 0.2 + land * 0.06, (zL - zR) / (half * 2) * 0.3 * s.twist, -Math.sin(legPh) * 0.05 * s.roll);
    P.r('neck', -lean * 0.9, 0, 0);
    P.r('head', -lean * 0.25 + land * 0.05, 0, 0);
    const pump = 0.95 * s.armSwing;
    P.rl('arm', 1, -(zR / half) * pump * s.armSwingL - 0.15, 0, s.armOut + 0.12);
    P.rl('arm', -1, -(zL / half) * pump * s.armSwingR - 0.15, 0, s.armOut + 0.12);
    P.rl('fore', 1, -1.35 + (zR / half) * 0.25, 0, 0);
    P.rl('fore', -1, -1.35 + (zL / half) * 0.25, 0, 0);
    P.s('chest', land * 0.03, -land * 0.03, land * 0.03);
    P.x('open', 0.25 + flight * 0.15);
    restArms(P, c, 0.85, 1, 1);
  }
  P.x('smile', s.smile);
}

// ── actions ─────────────────────────────────────────────────────────────────────────────────────────────────
function standFeet(P, c, wide = 1, w = 1, dz = 0) {
  const m = c.m;
  P.foot(1, m.hipX * wide, m.ankleY, dz, w); P.foot(-1, -m.hipX * wide, m.ankleY, -dz, w);
}

const CLIPS = {
  talk: {
    loop: true, mask: UPPER, dur: 3.2,
    sample(P, t, c) {
      const s = c.style, m = c.m, k = m.k, seed = c.seed;
      const PH = 2.6, pt = (t + seed) % PH, ph = Math.floor((t + seed) / PH);
      // syllables: a gated wobble, with little pauses between phrases
      const phrase = env(pt, 0.05, 0.15, 1.95, 2.2);
      const syl = Math.max(0, Math.sin(t * 17 + Math.sin(t * 5.3) * 2)) * (0.55 + 0.45 * vnoise1(t * 3 + seed));
      const stress = Math.pow(Math.max(0, Math.sin(t * 4.3 + seed)), 6) * phrase;   // an emphatic word now and then
      P.x('open', syl * phrase * 0.9);
      P.x('smile', s.smile * (1 - phrase * 0.3));
      P.x('browUp', Math.max(0, vnoise1(t * 1.7 + seed * 3)) * 0.7 * phrase + stress * 0.6);
      P.r('head', Math.sin(t * 5.1) * 0.035 * phrase + 0.02 + stress * 0.12, Math.sin(t * 1.3) * 0.08, Math.sin(t * 0.8) * 0.05 + Math.sin(ph * 2.1) * 0.05);
      P.r('neck', Math.sin(t * 2.6) * 0.03 + stress * 0.05, 0, 0);
      P.r('chest', 0.02 + stress * 0.04, Math.sin(t * 1.1) * 0.05, 0);
      P.p('chest', 0, Math.sin(t * 3) * 0.004 * k, 0);
      // which hands are free to talk with (a hand on the hip, a staff or a tankard's hand stays put or joins in kind)
      const busyL = s.arms === 'hipL' || s.arms === 'hips';
      const busyR = s.arms === 'hips' || !!s.plant;
      const gw = env(pt, 0.1, 0.45, 1.7, 2.2);
      const beat = Math.sin(t * 6.5) * 0.08 + stress * 0.12;
      const pick = hash1(ph * 3.7 + seed * 11);
      let g = hash1(ph * 1.3 + seed) < 0.5 ? 1 : -1;
      if (busyL && !busyR) g = -1; else if (busyR && !busyL) g = 1;
      const any = !(busyL && busyR);
      const skip = { L: 0, R: 0 };
      if (any) {
        const gs = g > 0 ? 'L' : 'R';
        if (pick < 0.4) {
          // explaining: palm up, out in front
          P.rl('arm', g, (-0.95 + beat) * gw, 0.15 * gw, 0.25 * gw + s.armOut); P.rl('fore', g, (-1.1 - beat) * gw, 0.5 * gw, 0); P.rl('hand', g, -0.3 * gw, 0, 0.3 * gw);
          skip[gs] = gw;
        } else if (pick < 0.6 && !busyL && !busyR) {
          // both hands open: "well, what can you do?"
          for (const sd of [1, -1]) { P.rl('arm', sd, -0.55 * gw, 0.1 * gw, (0.55 + beat) * gw + s.armOut); P.rl('fore', sd, -1.25 * gw, -0.4 * gw, 0); P.rl('hand', sd, -0.4 * gw, 0, 0.2 * gw); }
          P.r('clavL', 0, 0, 0.14 * gw); P.r('clavR', 0, 0, -0.14 * gw); P.r('head', 0, 0, 0.1 * gw);
          skip.L = gw; skip.R = gw;
        } else if (pick < 0.8) {
          // a hand to the heart
          P.handC(g, g * 0.06 * k, (m.shoulderY - m.chestY) * 0.2, m.bodyZ + 0.05 * k, gw);
          P.r('head', 0.05 * gw, 0, -g * 0.06 * gw);
          skip[gs] = gw;
        } else {
          // a raised hand, making a point (with the tankard, if that's what's in it)
          P.rl('arm', g, (-1.75 + beat * 1.5) * gw, 0.1 * gw, 0.3 * gw + s.armOut); P.rl('fore', g, (-0.7 - beat) * gw, 0, 0); P.rl('hand', g, 0, 0, Math.sin(t * 9) * 0.25 * gw);
          skip[gs] = gw;
        }
      } else {
        // both hands busy: talk with the shoulders
        P.r('clavL', 0, 0, stress * 0.12); P.r('clavR', 0, 0, -stress * 0.12);
      }
      P.rl('arm', 1, 0.02 * (1 - skip.L), 0, s.armOut * (1 - skip.L)); P.rl('fore', 1, (-s.elbow - 0.1) * (1 - skip.L), 0, 0);
      P.rl('arm', -1, 0.02 * (1 - skip.R), 0, s.armOut * (1 - skip.R)); P.rl('fore', -1, (-s.elbow - 0.1) * (1 - skip.R), 0, 0);
      restArms(P, c, 1, 0, 0, skip);
    },
  },
  nod: {
    loop: false, mask: HEAD, dur: 0.72, fadeIn: 0.06, fadeOut: 0.14,
    sample(P, t, c) {
      // "Nods twice, fast, to agree"
      const n = Math.max(0, Math.sin(clamp(t / 0.62, 0, 1) * TAU * 2 - 0.3)) ;
      P.r('head', n * 0.38, 0, 0); P.r('neck', n * 0.12, 0, 0); P.r('chest', n * 0.04, 0, 0);
      P.x('happy', env(t, 0.05, 0.15, 0.5, 0.65) * 0.8); P.x('smile', c.style.smile + 0.4);
    },
  },
  surprised: {
    loop: false, mask: FULL, dur: 1.15, fadeIn: 0.04, fadeOut: 0.3, icon: '!',
    sample(P, t, c) {
      const m = c.m, k = m.k;
      const crouch = env(t, 0, 0.07, 0.07, 0.14);
      const up = Math.sin(clamp((t - 0.1) / 0.36, 0, 1) * Math.PI);      // the hop
      const land = env(t, 0.44, 0.5, 0.52, 0.7);
      const hopH = 0.16 * k * c.style.hop;
      P.p('hips', 0, -crouch * 0.07 * k + up * hopH - land * 0.06 * k, -up * 0.03 * k);
      P.r('spine', -up * 0.15 + crouch * 0.1, 0, 0); P.r('chest', -up * 0.12, 0, 0); P.r('head', -up * 0.12 + land * 0.1, 0, 0);
      standFeet(P, c, 1.1, 1);
      P.ik('footL', 0, up * hopH * 0.95, -up * 0.03 * k, 0); P.ik('footR', 0, up * hopH * 0.95, -up * 0.03 * k, 0);
      // the planted-foot targets above already carry w=1; add the lift directly
      const a = P.pose.a, o = P.pose.ikOff;
      a[o + 1] += up * hopH * 0.95; a[o + 5] += up * hopH * 0.95;
      P.x('footPitchL', up * 0.5); P.x('footPitchR', up * 0.5);
      const arms = env(t, 0.06, 0.2, 0.75, 1.1);
      P.rl('arm', 1, -1.1 * arms, 0, 0.9 * arms); P.rl('arm', -1, -1.1 * arms, 0, 0.9 * arms);
      P.rl('fore', 1, -0.9 * arms, 0, 0); P.rl('fore', -1, -0.9 * arms, 0, 0);
      P.rl('hand', 1, 0, 0, 0.5 * arms); P.rl('hand', -1, 0, 0, 0.5 * arms);
      const face = env(t, 0.03, 0.1, 0.85, 1.15);
      P.x('wide', face); P.x('browUp', face * 1.2); P.x('O', face); P.x('smile', c.style.smile * (1 - face));
    },
  },
  celebrate: {
    // the Dragon Quest item-held-aloft pose: a crouch, a hop, the treasure thrust up in one fist, the other arm pumping,
    // a huge grin, a second little bounce of joy
    loop: false, mask: FULL, dur: 2.6, fadeIn: 0.08, fadeOut: 0.4,
    sample(P, t, c) {
      const m = c.m, k = m.k, s = c.style;
      const hs = s.propR ? 1 : -1, free = -hs;                // the treasure goes up in the free hand
      const crouch = env(t, 0, 0.12, 0.14, 0.26);
      const jump = Math.sin(clamp((t - 0.18) / 0.3, 0, 1) * Math.PI);
      const hop2 = Math.sin(clamp((t - 1.3) / 0.26, 0, 1) * Math.PI) * 0.55;
      const land2 = env(t, 1.52, 1.58, 1.6, 1.75);
      const hold = sstep(0.2, 0.42, t) * (1 - sstep(2.15, 2.6, t));
      const sway = Math.sin((t - 0.55) * 4.4) * sstep(0.55, 0.85, t) * (1 - sstep(1.9, 2.3, t));
      const up = (jump + hop2) * 0.1 * k * s.hop;
      P.p('hips', sway * 0.018 * k, -crouch * 0.08 * k - land2 * 0.03 * k + up, 0);
      P.r('hips', 0, 0, -sway * 0.04);
      P.r('spine', -0.08 * hold, 0, 0); P.r('chest', -0.1 * hold, sway * 0.05, sway * 0.07); P.r('neck', -0.02 * hold, 0, 0);
      P.r('head', -0.14 * hold, 0, -sway * 0.05 + hs * 0.07 * hold);
      standFeet(P, c, 1.3, 1);
      const a = P.pose.a, o = P.pose.ikOff;
      a[o + 1] += up; a[o + 5] += up;
      // the treasure arm: straight up and out beside the head, the item riding on top of the fist
      const out = s.kid ? 0.56 : 0.34;
      const hy = (m.shoulderY - m.chestY) + m.arm * (s.kid ? 0.84 : 0.92), hx = hs * (m.shoulderX + m.arm * out);
      P.rl('arm', hs, -2.6 * hold, 0, 0.45 * hold); P.rl('fore', hs, -0.1 * hold, 0, 0);
      P.handC(hs, hx, hy + Math.sin(t * 7) * 0.008 * k * hold, (s.kid ? 0.16 : 0.1) * k, hold);
      P.p('item', 0, Math.sin(t * 3.1) * 0.01 * k, 0);
      P.x('item', sstep(0.26, 0.34, t) * (1 - sstep(2.3, 2.5, t)));
      if (s.plant) {
        P.x('stick', 1);                                        // the big man keeps his sword planted
      } else {
        const pump = Math.sin((t - 0.6) * 9) * sstep(0.6, 0.8, t) * (1 - sstep(1.8, 2.1, t));
        P.rl('arm', free, (-2.2 + pump * 0.3) * hold, 0.1 * hold, 0.85 * hold); P.rl('fore', free, (-0.95 - pump * 0.35) * hold, 0, 0);
        P.rl('hand', free, -0.2 * hold, 0, -0.3 * hold);
      }
      P.r('clavL', 0, 0, 0.16 * hold); P.r('clavR', 0, 0, -0.16 * hold);
      P.x('happy', hold); P.x('open', hold * (0.65 + 0.2 * Math.sin(t * 3))); P.x('smile', 1 + hold * 0.5); P.x('browUp', hold * 0.6); P.x('blush', hold);
      P.x('lookX', hs * 0.7 * hold); P.x('lookY', 0.55 * hold);        // he looks up at the treasure in his fist
    },
  },
  attack: {
    loop: false, mask: FULL, dur: 1.0, fadeIn: 0.06, fadeOut: 0.24, events: [[0.38, 'hit']],
    sample(P, t, c) {
      const m = c.m, k = m.k, s = c.style, w = s.weapon;
      const wind = env(t, 0.02, 0.28, 0.3, 0.4);
      const strike = sstep(0.3, 0.42, t) * (1 - sstep(0.66, 0.95, t));
      const lunge = strike * 0.14 * k;
      P.x('weapon', env(t, 0.0, 0.06, 0.9, 1.0));
      P.x('browAngry', env(t, 0.02, 0.15, 0.7, 0.9)); P.x('smile', -0.2);
      P.x('open', strike * 0.7);
      if (w === 'sling') {
        // left hand holds the slingshot out, right hand pulls the band back to the cheek, then lets fly
        const aim = env(t, 0.02, 0.22, 0.75, 0.95);
        const pull = sstep(0.05, 0.3, t) * (1 - sstep(0.36, 0.4, t));
        P.r('chest', 0, -0.5 * aim, 0); P.r('hips', 0, -0.25 * aim, 0); P.r('head', 0, 0.55 * aim, 0);
        P.rl('arm', 1, -1.5 * aim, -0.1 * aim, -0.2 * aim); P.rl('fore', 1, -0.05 * aim, 0, 0); P.rl('hand', 1, 0, 0, 0);
        P.rl('arm', -1, -1.3 * aim + pull * 0.2, 0.3 * aim, -0.3 * aim + pull * 0.2); P.rl('fore', -1, -(0.3 + pull * 1.8) * aim, 0.6 * pull, 0);
        P.x('blink', pull * 0.4);
        standFeet(P, c, 1.4, 1, 0.08 * k * aim);
        return;
      }
      if (w === 'spear') {
        P.r('hips', 0, 0.2 * wind - 0.3 * strike, 0); P.r('chest', -0.1 * wind + 0.15 * strike, 0.2 * wind - 0.3 * strike, 0);
        P.p('hips', 0, -0.03 * k * (wind + strike), -0.06 * k * wind + lunge * 1.4);
        P.rl('arm', -1, -0.6 - 0.4 * wind - 1.0 * strike, 0, 0.1); P.rl('fore', -1, -1.4 * wind + 1.2 * strike - 0.3, 0, 0);
        P.rl('arm', 1, -0.9 - 0.4 * strike, -0.3, -0.2); P.rl('fore', 1, -0.9, 0, 0);
        P.x('orientR', 1 - strike);
        standFeet(P, c, 1.2, 1, 0.1 * k + lunge);
        return;
      }
      // sword / greatsword / ladle / bare fist: wind UP beside the right shoulder with the blade raised where it can be
      // seen, then chop down and forward across the body toward the foe. The body loads to the right and turns INTO
      // the blow; it never turns its back.
      const two = w === 'great', blade = w !== 'none';
      const big = two ? 1.2 : w === 'ladle' ? 0.9 : 1;
      P.p('hips', 0, -0.035 * k * wind - 0.05 * k * strike, -0.04 * k * wind + lunge);
      P.r('hips', 0, -0.1 * wind + 0.08 * strike, 0);
      P.r('spine', -0.06 * wind + 0.16 * strike * big, -0.06 * wind + 0.05 * strike, 0);
      P.r('chest', -0.1 * wind + 0.14 * strike, -0.16 * wind + 0.1 * strike, 0.05 * wind);
      P.r('head', 0.04 * wind - 0.05 * strike, 0.24 * wind - 0.14 * strike, 0);
      // FK gets the arm roughly there; IK puts the fist exactly on the arc
      P.rl('arm', -1, -2.2 * wind - 1.0 * strike, 0, 0.5 * wind);
      P.rl('fore', -1, -1.2 * wind - 0.2 * strike, 0, 0);
      const wx = -(m.shoulderX + m.arm * 0.3), wy = m.shoulderY + m.arm * 0.5, wz = -0.02 * k;
      const sx = -m.shoulderX * 0.2, sy = m.chestY - m.arm * 0.3, sz = m.bodyZ + m.arm * 0.75;
      const ww = wind * (1 - strike);
      if (ww > 0.001) P.handR(-1, wx, wy, wz, ww);
      if (strike > 0.001) P.handR(-1, sx, sy, sz, strike);
      if (blade) {
        // blade direction (root space): up and a little back/out on the wind, forward and down at the end of the chop
        const bx = lerp(-0.35, 0.18, strike), by = lerp(0.92, -0.55, strike), bz = lerp(-0.2, 0.82, strike);
        P.x('blade', Math.max(ww, strike)); P.x('bladeX', bx * Math.max(ww, strike)); P.x('bladeY', by * Math.max(ww, strike)); P.x('bladeZ', bz * Math.max(ww, strike));
      }
      if (two) {
        P.x('twoHand', sstep(0.02, 0.2, t) * (1 - sstep(0.66, 0.9, t)));
        P.rl('arm', 1, -2.0 * wind - 1.0 * strike, -0.3, -0.1); P.rl('fore', 1, -0.8, 0, 0);
      } else {
        // the free arm swings back for balance
        P.rl('arm', 1, 0.3 * wind + 0.45 * strike, 0, 0.35 * wind + 0.25 * strike); P.rl('fore', 1, -0.5 * wind - 0.3 * strike, 0, 0);
      }
      standFeet(P, c, 1.25, 1, 0.07 * k + lunge * 0.8);
      P.x('footPitchR', wind * 0.2);
    },
  },
  cast: {
    loop: false, mask: FULL, dur: 1.45, dropStick: true, fadeIn: 0.1, fadeOut: 0.3, events: [[0.95, 'cast']],
    sample(P, t, c) {
      const m = c.m, k = m.k;
      const gather = env(t, 0.02, 0.3, 0.45, 0.65);
      const raise = env(t, 0.4, 0.75, 0.9, 1.0);
      const thrust = env(t, 0.9, 1.0, 1.2, 1.45);
      const rise = env(t, 0.35, 0.75, 1.0, 1.3);
      P.p('hips', 0, rise * 0.05 * k - gather * 0.02 * k, 0);
      P.x('footPitchL', rise * 0.5); P.x('footPitchR', rise * 0.5);
      standFeet(P, c, 1.2, 1);
      const a = P.pose.a, o = P.pose.ikOff; a[o + 1] += rise * 0.035 * k; a[o + 5] += rise * 0.035 * k;
      P.r('chest', 0.08 * gather - 0.18 * raise + 0.1 * thrust, 0, 0); P.r('head', 0.2 * gather - 0.3 * raise + 0.05 * thrust, 0, 0);
      // gather: hands together in front of the chest
      P.handC(1, 0.04 * k, -0.02 * k, m.bodyZ + 0.16 * k, gather); P.handC(-1, -0.04 * k, -0.02 * k, m.bodyZ + 0.16 * k, gather);
      // raise: arms up and out
      P.rl('arm', 1, -2.3 * raise - 1.45 * thrust, 0, 0.7 * raise + 0.1 * thrust); P.rl('arm', -1, -2.3 * raise - 1.45 * thrust, 0, 0.7 * raise + 0.1 * thrust);
      P.rl('fore', 1, -0.2 * raise, 0, 0); P.rl('fore', -1, -0.2 * raise, 0, 0);
      P.rl('hand', 1, -0.6 * thrust, 0, 0.5 * raise); P.rl('hand', -1, -0.6 * thrust, 0, 0.5 * raise);
      P.x('blink', gather * 0.95); P.x('wide', thrust); P.x('browUp', raise * 0.8 + thrust * 0.4); P.x('O', thrust * 0.6); P.x('smile', c.style.smile * (1 - thrust));
    },
  },
  hurt: {
    loop: false, mask: FULL, dur: 0.75, fadeIn: 0.03, fadeOut: 0.3,
    sample(P, t, c) {
      const m = c.m, k = m.k;
      const hit = env(t, 0, 0.05, 0.14, 0.55);
      const shake = Math.sin(t * 55) * env(t, 0.03, 0.06, 0.2, 0.35);
      P.p('hips', shake * 0.012 * k, -hit * 0.05 * k, -hit * 0.07 * k);
      P.r('spine', -hit * 0.28, 0, shake * 0.05); P.r('chest', -hit * 0.2, 0, 0); P.r('head', hit * 0.25, shake * 0.1, -hit * 0.12);
      P.rl('arm', 1, -0.9 * hit, 0, 0.6 * hit); P.rl('arm', -1, -0.9 * hit, 0, 0.6 * hit);
      P.rl('fore', 1, -1.5 * hit, 0, 0); P.rl('fore', -1, -1.5 * hit, 0, 0);
      standFeet(P, c, 1.15, 1, -hit * 0.05 * k);
      P.x('footPitchL', hit * 0.3);
      P.x('blink', hit); P.x('browAngry', hit * 0.4); P.x('browSad', hit * 0.8); P.x('O', hit * 0.7); P.x('smile', -hit * 0.5); P.x('frown', hit);
    },
  },
  sit: {
    loop: true, mask: FULL, dur: 4, fadeIn: 0.45, fadeOut: 0.45,
    sample(P, t, c) {
      const m = c.m, k = m.k, s = c.style;
      const seat = m.L2 + m.ankleY + 0.01 * k;
      const breathe = Math.sin(t * TAU / s.breathPeriod);
      P.p('hips', 0, seat - m.hipY, -0.04 * k);
      P.r('hips', -0.08, 0, 0); P.r('spine', 0.06 + s.hunch, 0, 0); P.r('chest', 0.04 + breathe * 0.01, 0, 0);
      P.s('chest', breathe * 0.01, breathe * 0.02, breathe * 0.015);
      P.r('head', 0.05 + Math.sin(t * 0.5) * 0.04, Math.sin(t * 0.31) * 0.2, 0);
      // feet on the ground, knees bent over the seat edge
      P.foot(1, m.hipX * 1.15, m.ankleY, m.L1 * 0.92, 1); P.foot(-1, -m.hipX * 1.15, m.ankleY, m.L1 * 0.92, 1);
      // hands on the knees, swinging a little for children
      const swing = s.kid ? Math.sin(t * 2.1) * 0.06 * k : 0;
      P.handR(1, m.hipX * 1.2, seat + m.L1 * 0.15, m.L1 * 0.72 + swing, 1); P.handR(-1, -m.hipX * 1.2, seat + m.L1 * 0.15, m.L1 * 0.72 - swing, 1);
      if (s.kid) { P.x('footPitchL', Math.max(0, Math.sin(t * 2.1)) * 0.4); P.x('footPitchR', Math.max(0, -Math.sin(t * 2.1)) * 0.4); }
      P.x('smile', s.smile); P.x('seat', 1);
    },
  },
  sleep: {
    loop: true, mask: FULL, dur: 4, fadeIn: 0.6, fadeOut: 0.6, icon: 'z',
    sample(P, t, c) {
      const m = c.m, k = m.k;
      const breathe = Math.sin(t * TAU / 3.4);
      const lieY = m.bodyZ * 0.9 + 0.02 * k;
      P.p('hips', 0, lieY - (m.hipY + m.hipsUp), -(m.hipY - m.ankleY) * 0.35);
      P.r('hips', -Math.PI / 2, 0, 0);
      P.r('spine', 0.05, 0, 0); P.r('chest', breathe * 0.02, 0, 0); P.s('chest', breathe * 0.03, breathe * 0.04, breathe * 0.05);
      P.r('neck', 0.2, 0, 0); P.r('head', 0.05, 0.35, 0.1);
      P.x('legsFree', 1);
      P.rl('thigh', 1, -0.25, 0, 0.12); P.rl('shin', 1, 0.45, 0, 0);
      P.rl('thigh', -1, -0.05, 0, 0.06); P.rl('shin', -1, 0.1, 0, 0);
      P.rl('foot', 1, -0.4, 0, 0); P.rl('foot', -1, -0.9, 0, 0);
      P.rl('arm', 1, -0.3, 0, 0.35); P.rl('fore', 1, -1.6, 0.4, 0);   // one hand on the tummy
      P.rl('arm', -1, 0.1, 0, 0.35); P.rl('fore', -1, -0.25, 0, 0);
      P.x('blink', 1); P.x('open', 0.25 + breathe * 0.15); P.x('smile', 0.4); P.x('blush', 0.5);
    },
  },
  kneel: {
    loop: true, mask: FULL, dur: 4, fadeIn: 0.45, fadeOut: 0.45,
    sample(P, t, c) {
      const m = c.m, k = m.k;
      const breathe = Math.sin(t * TAU / 3.2);
      const hipH = m.L2 + m.ankleY * 0.4;
      P.p('hips', 0, hipH - m.hipY, -0.02 * k);
      P.r('spine', 0.1, 0, 0); P.r('chest', 0.08 + breathe * 0.01, 0, 0); P.r('neck', 0.2, 0, 0); P.r('head', 0.3, 0, 0);
      // left foot planted forward (knee up), right knee on the ground
      P.foot(1, m.hipX, m.ankleY, m.L1 * 0.95, 1);
      P.foot(-1, -m.hipX, m.ankleY * 0.55, -m.L2 * 0.72, 1);
      P.x('footPitchR', 1.2);
      // left forearm resting on the raised knee, right fist to the ground by the knee... or the heart
      P.handR(1, m.hipX * 1.1, hipH + m.L1 * 0.02, m.L1 * 0.85, 1);
      P.handC(-1, 0.02 * k, -0.04 * k, m.bodyZ + 0.08 * k, 1);
      P.x('blink', 0.55); P.x('smile', 0);
    },
  },
  grieve: {
    loop: true, mask: FULL, dur: 4, dropStick: true, fadeIn: 0.6, fadeOut: 0.6,
    sample(P, t, c) {
      const m = c.m, k = m.k;
      const sob = Math.max(0, Math.sin(t * 7)) * env(t % 3.2, 0.2, 0.5, 1.6, 2.4);
      const hipH = m.ankleY * 0.5 + m.L2 * 0.62;
      P.p('hips', 0, hipH - m.hipY - sob * 0.006 * k, -m.L2 * 0.35);
      P.r('hips', 0.12, 0, 0); P.r('spine', 0.18, 0, 0); P.r('chest', 0.12 + sob * 0.04, 0, 0); P.r('neck', 0.1, 0, 0); P.r('head', 0.22, 0, 0);
      P.r('clavL', 0, 0, sob * 0.12); P.r('clavR', 0, 0, -sob * 0.12);
      P.foot(1, m.hipX * 0.9, m.ankleY * 0.5, -m.L2 * 0.75, 1); P.foot(-1, -m.hipX * 0.9, m.ankleY * 0.5, -m.L2 * 0.75, 1);
      P.x('footPitchL', 1.3); P.x('footPitchR', 1.3);
      // hands to the face
      const faceY = (m.headY - m.chestY) + m.headR * 0.55;
      P.handC(1, 0.1 * k, faceY, m.headR * 1.25, 1); P.handC(-1, -0.1 * k, faceY, m.headR * 1.25, 1);
      P.x('blink', 1); P.x('browSad', 1); P.x('frown', 1); P.x('smile', -0.6); P.x('open', sob * 0.5);
    },
  },
  wave: {
    loop: false, mask: UPPER, dur: 1.8, fadeIn: 0.15, fadeOut: 0.3,
    sample(P, t, c) {
      const w = env(t, 0, 0.25, 1.4, 1.8);
      const wag = Math.sin(t * 13) * w;
      const sd = c.style.propR ? 1 : -1;                        // wave with the hand that isn't holding something
      P.rl('arm', sd, -2.3 * w, 0, 0.35 * w); P.rl('fore', sd, -0.5 * w, 0, wag * 0.45); P.rl('hand', sd, 0, 0, wag * 0.3);
      P.r('head', -0.06 * w, sd * 0.1 * w, -sd * 0.1 * w); P.r('chest', 0, 0, sd * 0.05 * w);
      P.x('happy', w * 0.8); P.x('open', w * 0.5); P.x('smile', c.style.smile + w * 0.5); P.x('browUp', w * 0.5);
    },
  },
};
CLIPS.turn = { loop: false, mask: HEAD, dur: 0.01, fadeIn: 0.01, fadeOut: 0.01, sample() {} };
CLIPS.idle = { base: true }; CLIPS.walk = { base: true }; CLIPS.run = { base: true };

export const CLIP_NAMES = ['idle', 'walk', 'run', 'turn', 'talk', 'nod', 'surprised', 'celebrate', 'attack', 'cast', 'hurt', 'sit', 'sleep', 'kneel', 'grieve', 'wave'];
export const EMOTES = ['surprised', 'happy', 'sad', 'angry', 'love', 'question', 'sweat', 'sleepy', 'music'];

const EMOTE_FACE = {
  surprised: { wide: 1, browUp: 1.2, O: 1, smile: -1 },
  happy: { happy: 1, open: 0.6, smile: 0.6, browUp: 0.5, blush: 0.6 },
  sad: { browSad: 1, frown: 1, smile: -1, lookY: -0.6 },
  angry: { browAngry: 1.2, frown: 0.6, smile: -1 },
  love: { happy: 1, blush: 1.2, smile: 0.6, browUp: 0.4 },
  question: { browUp: 0.7, browSad: 0.3, smile: -0.4, lookX: 0.6, lookY: 0.4 },
  sweat: { browSad: 0.8, smile: -0.3, wide: 0.3, frown: 0.4 },
  sleepy: { blink: 0.6, open: 0.3, smile: -0.2 },
  music: { happy: 0.7, smile: 0.5, open: 0.3 },
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the animator
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const STYLE_DEFAULT = {
  kid: false, bounce: 1, sway: 1, twist: 1, armSwing: 1, armSwingL: 1, armSwingR: 1, armOut: 0.12, elbow: 0.12,
  hunch: 0, chestOut: 0, headTilt: 0, headCock: 0, breath: 1, breathPeriod: 3.6, fidget: 1, smile: 0.9, hop: 1,
  runLean: 1, cadence: 1, weapon: 'none', arms: 'side', propR: null, propL: null, gripY: null, runStart: 4.1, runFull: 4.9,
  turnRate: 1, blinkEvery: 3.2, cloakLift: 1, seed: 0, stride: 1.1,
  gait: 'normal', roll: 0.35, kneeBend: 0.5, lift: 1, landK: 0.44, heelLift: 1, plant: null,
};

class Spring {
  constructor(k = 60, c = 9) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(target, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.c * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _e1 = new THREE.Euler();
const Y_UP = new THREE.Vector3(0, 1, 0);

/**
 * Two-bone IK, blended over the FK pose already on the bones. A = upper (thigh / upper arm), B = lower, C = end.
 * target / pole in world space. Keeps FK twist (minimal correction from the FK direction).
 */
function solve2(A, B, C, target, pole, w) {
  if (!(w > 0.001)) return;
  A.updateWorldMatrix(true, false);
  const S = _v1.setFromMatrixPosition(A.matrixWorld);
  const l1 = B.position.length(), l2 = C.position.length();
  const dv = _v2.subVectors(target, S);
  let d = dv.length();
  if (d < 1e-5 || l1 < 1e-5 || l2 < 1e-5) return;
  const u = dv.divideScalar(d);
  d = clamp(d, Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995);
  const pw = _v3.subVectors(pole, S); pw.addScaledVector(u, -pw.dot(u));
  if (pw.lengthSq() < 1e-10) pw.set(0, 0, 1).addScaledVector(u, -u.z);
  pw.normalize();
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const E = _v4.copy(S).addScaledVector(u, l1 * cosA).addScaledVector(pw, l1 * sinA);
  const T = _v5.copy(S).addScaledVector(u, d);
  // upper
  A.parent.getWorldQuaternion(_q1).invert();
  const want = E.sub(S).normalize().applyQuaternion(_q1);                    // desired B direction, A-parent space
  const have = _v1.copy(B.position).normalize().applyQuaternion(A.quaternion); // FK B direction, A-parent space
  _q2.setFromUnitVectors(have, want).multiply(A.quaternion);
  A.quaternion.slerp(_q2, w);
  A.updateWorldMatrix(false, true);
  // lower
  const Eact = _v4.setFromMatrixPosition(B.matrixWorld);
  B.parent.getWorldQuaternion(_q1).invert();
  const want2 = _v2.subVectors(T, Eact).normalize().applyQuaternion(_q1);
  const have2 = _v1.copy(C.position).normalize().applyQuaternion(B.quaternion);
  _q2.setFromUnitVectors(have2, want2).multiply(B.quaternion);
  B.quaternion.slerp(_q2, w);
  B.updateWorldMatrix(false, true);
}

/** Orient a bone so its world rotation = rootWorldQuat * local(euler), blended by w. */
function orientWorld(bone, rootQ, ex, ey, ez, w) {
  if (!(w > 0.001)) return;
  bone.parent.getWorldQuaternion(_q1).invert();
  _q3.setFromEuler(_e1.set(ex, ey, ez, 'YXZ'));
  _q2.copy(rootQ).multiply(_q3);
  _q1.multiply(_q2);
  bone.quaternion.slerp(_q1, w);
  bone.updateWorldMatrix(false, true);
}

export function createAnimator({ root, rig, metrics, style = {} }) {
  const m = metrics;
  const S = Object.assign({}, STYLE_DEFAULT, style);
  if (style.turnRate == null && S.kid) S.turnRate = 1.3;            // little ones whip round, big men swing round
  if (style.kneeBend == null && S.gait === 'heavy') S.kneeBend = 0.78;
  if (style.roll == null && S.gait === 'heavy') S.roll = 1;
  const { bones, list, index, bind } = rig;
  const nb = list.length;
  const W = makeWriter(index);
  const poseBase = new Pose(nb), poseTmp = new Pose(nb), poseOut = new Pose(nb), poseAct = new Pose(nb), posePrev = new Pose(nb);
  const seed = (hash1((m.height || 1) * 13.7 + (style.seed || 0)) * 10);

  const CHEST_KIDS = list.filter(b => b.parent === bones.chest && /^(clav|neck)/.test(b.name)).map(b => b.name);
  // masks
  const maskOf = (kind) => {
    const mk = new Float32Array(poseOut.a.length).fill(1);
    if (kind === FULL) return null;
    const lower = new Set(['root', 'hips', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'skirtF', 'skirtB', 'skirtL', 'skirtR']);
    const headOnly = new Set(['neck', 'head', 'eyeL', 'eyeR', 'browL', 'browR', 'mouth', 'mouthOpen', 'mouthO', 'plait1', 'plait2', 'plait3']);
    for (let i = 0; i < nb; i++) {
      const n = list[i].name;
      const keep = kind === UPPER ? !lower.has(n) : headOnly.has(n) || n === 'chest';
      if (!keep) for (let j = 0; j < BS; j++) mk[i * BS + j] = 0;
    }
    const ik = poseOut.ikOff;
    // feet never come from an upper/head clip; hands do only for upper
    for (let j = 0; j < 8; j++) mk[ik + j] = 0;
    if (kind === HEAD) for (let j = 8; j < 24; j++) mk[ik + j] = 0;
    for (const n of ['legsFree', 'footPitchL', 'footPitchR', 'seat']) mk[poseOut.exOff + EX[n]] = 0;
    return mk;
  };
  const MASKS = { [FULL]: null, [UPPER]: maskOf(UPPER), [HEAD]: maskOf(HEAD) };
  // a clip that doesn't fight with the weapon leaves the carried prop's upright grip alone
  const keepGrip = (mk) => { const out = mk ? mk.slice() : new Float32Array(poseOut.a.length).fill(1); out[poseOut.exOff + EX.orientR] = 0; out[poseOut.exOff + EX.stick] = 0; return out; };
  const GRIP_MASKS = { [FULL]: keepGrip(MASKS[FULL]), [UPPER]: keepGrip(MASKS[UPPER]), [HEAD]: keepGrip(MASKS[HEAD]) };

  // state
  const A = {
    T: 0,
    // facing
    yaw: root.rotation.y, yawT: root.rotation.y, yawV: 0, turnVel: 0,
    // locomotion
    speedCmd: 0, runCmd: null, speed: 0, amp: 0, runK: 0, phase: 0, D: 0, freq: 0, duty: 0.58, moving: false, lockW: 1,
    vAct: 0, lastRoot: new THREE.Vector3(), haveLast: false,
    forced: null,             // 'walk' | 'run' when play('walk') on a still root (in-place)
    // actions
    cur: null, prev: null,
    // face
    blinkT: 1.5 + hash1(seed) * 2, blinkK: 0, blinkDouble: false,
    glanceT: 2 + hash1(seed + 1) * 3, glanceX: 0, glanceY: 0, glanceHead: 0, eyeX: 0, eyeY: 0, headLook: 0, headLookY: 0,
    emote: null, emoteT: 0, emoteDur: 0,
    lookAt: null,
    lastEvents: [],
  };
  const feet = [1, -1].map((side) => ({
    side, pos: new THREE.Vector3(), from: new THREE.Vector3(), swing: false, s: 0, dur: 0.25, lift: 0.05, init: false, pitch: 0,
    q: 0, lastQ: 0, target: new THREE.Vector3(),
  }));
  const springs = {
    cloakX: new Spring(55, 8), cloakZ: new Spring(40, 6), cloak2: new Spring(70, 7), cloak3: new Spring(80, 6),
    skirtF: new Spring(140, 14), skirtB: new Spring(140, 14), skirtY: new Spring(90, 8),
    plaitX: new Spring(38, 5), plaitZ: new Spring(30, 4), plait2: new Spring(60, 6), bobV: 0, lastHipY: 0,
    hairX: new Spring(90, 8),
  };

  const ctx = { m, style: S, loco: { phase: 0, D: 0, duty: 0.58, zL: 0, zR: 0, landK: S.landK, heel: 0 }, seed, T: 0 };
  // the walking staff (greatsword, cane, pitchfork): its tip is planted in world space like a third foot
  const stick = { tip: new THREE.Vector3(), from: new THREE.Vector3(), planted: false, swing: false, kind: null, s: 0, dur: 0.3, lift: 0.1, init: false, plants: 0 };
  const footLen = 0.1 * m.k;                                            // ankle -> ball of the foot, for heel lift
  const heelMax = () => footLen * Math.sin(0.5) * S.heelLift;

  const api = {
    debug: false,
    onStep: null,
    onEvent: null,
    style: S,
    metrics: m,

    setFacing(rad, instant = false) {
      if (!Number.isFinite(rad)) return;
      A.yawT = A.yaw + wrapPi(rad - A.yaw);
      if (instant) { A.yaw = A.yawT; A.yawV = 0; root.rotation.y = A.yaw; api.resetFeet(); }
    },
    get facing() { return A.yaw; },
    setMove(speed, opts = {}) {
      A.speedCmd = Math.max(0, Number(speed) || 0);
      A.runCmd = opts && typeof opts.run === 'boolean' ? opts.run : null;
      if (A.speedCmd > 0.01) A.forced = null;
    },

    play(name, opts = {}) {
      name = String(name || 'idle');
      const fade = opts.fade != null ? Math.max(0, +opts.fade) : null;
      if (name === 'idle' || name === 'walk' || name === 'run') {
        A.forced = name === 'idle' ? null : name;
        if (name === 'idle') A.speedCmd = 0;
        api.stop(fade != null ? fade : 0.3);
        return true;
      }
      if (name === 'turn') { api.setFacing(A.yawT + (opts.angle != null ? +opts.angle : Math.PI)); return true; }
      const clip = CLIPS[name];
      if (!clip || clip.base) return false;
      const loop = opts.loop != null ? !!opts.loop : clip.loop;
      const fadeIn = fade != null ? fade : (clip.fadeIn != null ? clip.fadeIn : 0.25);
      if (A.cur && A.cur.name === name && loop && A.cur.loop) return true;
      if (A.cur) { A.prev = A.cur; A.prev.fadingOut = true; A.prev.fadeOutDur = Math.max(0.05, fadeIn); A.prev.fadeFrom = A.prev.w; A.prev.fadeT = 0; }
      A.cur = { name, clip, t: 0, w: fadeIn <= 0 ? 1 : 0, fadeIn, loop, fadingOut: false, fadeOutDur: clip.fadeOut != null ? clip.fadeOut : 0.25, fadeFrom: 1, fadeT: 0, fired: new Set() };
      if (clip.icon && opts.icon !== false && api.onIcon) { try { api.onIcon(clip.icon === 'z' ? 'sleepy' : clip.icon === '!' ? 'surprised' : 'music', loop ? Infinity : clip.dur); } catch (e) { reportError('anim.onIcon', e); } }
      return true;
    },
    stop(fade = 0.3) {
      if (A.cur) { A.cur.fadingOut = true; A.cur.fadeOutDur = Math.max(0.05, fade); A.cur.fadeFrom = A.cur.w; A.cur.fadeT = 0; }
    },
    emote(name, dur = 1.8) {
      if (!EMOTE_FACE[name]) return false;
      A.emote = name; A.emoteT = 0; A.emoteDur = dur;
      if (api.onIcon) { try { api.onIcon(name, dur); } catch (e) { reportError('anim.onIcon', e); } }
      if (name === 'surprised' && !A.cur) api.play('surprised', { icon: false });
      return true;
    },
    lookAt(v) { A.lookAt = v ? (A.lookAt || new THREE.Vector3()).copy(v) : null; },
    resetFeet() { for (const f of feet) f.init = false; A.haveLast = false; stick.init = false; },
    get current() { return A.cur && !A.cur.fadingOut ? A.cur.name : (A.forced || (A.speed > 0.05 ? (A.runK > 0.5 ? 'run' : 'walk') : 'idle')); },

    update(dt) {
      try { step(dt); } catch (e) { reportError('anim.update', e); }
    },

    state() {
      const r3 = (v) => Math.round(v * 1000) / 1000;
      return {
        clip: api.current, action: A.cur ? { name: A.cur.name, t: r3(A.cur.t), w: r3(A.cur.w), loop: A.cur.loop } : null,
        fading: A.prev ? { name: A.prev.name, w: r3(A.prev.w) } : null,
        facing: r3(A.yaw), facingTarget: r3(A.yawT), turning: Math.abs(wrapPi(A.yawT - A.yaw)) > 0.02,
        speed: r3(A.speed), amp: r3(A.amp), ikDrop: r3(A.ikDrop || 0), run: r3(A.runK), phase: r3(A.phase), stride: r3(A.D), cadence: r3(A.freq), lockW: r3(A.lockW),
        feet: feet.map(f => ({ side: f.side > 0 ? 'L' : 'R', swing: f.swing, s: r3(f.s) })),
        blinking: A.blinkK > 0.3, emote: A.emote,
        stick: S.plant ? { planted: stick.planted && stick.init, swing: stick.swing, plants: stick.plants, tip: [r3(stick.tip.x), r3(stick.tip.y), r3(stick.tip.z)] } : undefined,
        debug: api.debug ? {
          footLocal: feet.map(f => f.local ? [r3(f.local.x), r3(f.local.y), r3(f.local.z)] : null),
          hipsY: bones.hips ? r3(bones.hips.position.y) : null, vAct: r3(A.vAct), D: r3(A.D), freq: r3(A.freq), duty: r3(A.duty),
          thighL: bones.thighL ? [r3(bones.thighL.rotation.x), r3(bones.thighL.rotation.z)] : null, shinL: bones.shinL ? r3(bones.shinL.rotation.x) : null,
        } : undefined,
      };
    },
    CLIP_NAMES, EMOTES,
  };

  // ── per-frame ───────────────────────────────────────────────────────────────────────────────────────────
  const rootQ = new THREE.Quaternion();
  const invRoot = new THREE.Matrix4();
  const tmpV = new THREE.Vector3(), fwdW = new THREE.Vector3(), rootPos = new THREE.Vector3();

  function step(dtIn) {
    const dt = clamp(dtIn || 0, 0, 0.1);
    A.T += dt; ctx.T = A.T;

    // ── facing: critically-damped spring toward the target yaw ──
    const dy = wrapPi(A.yawT - A.yaw);
    A.yawT = A.yaw + dy;
    const wn = (A.speed > 0.3 ? 10 : 6.5) * S.turnRate;
    const acc = wn * wn * dy - 2 * wn * A.yawV;
    A.yawV += acc * dt;
    const maxV = (A.speed > 0.3 ? 12 : 6.5) * S.turnRate;
    A.yawV = clamp(A.yawV, -maxV, maxV);
    A.yaw += A.yawV * dt;
    if (Math.abs(dy) < 0.0005 && Math.abs(A.yawV) < 0.01) { A.yaw = A.yawT; A.yawV = 0; }
    root.rotation.y = A.yaw;
    A.turnVel = A.yawV;

    // ── root velocity (world) → foot locking vs treadmill ──
    root.updateWorldMatrix(true, false);
    rootPos.setFromMatrixPosition(root.matrixWorld);
    root.getWorldQuaternion(rootQ);
    fwdW.set(0, 0, 1).applyQuaternion(rootQ);
    if (A.haveLast && dt > 0) {
      tmpV.subVectors(rootPos, A.lastRoot);
      if (tmpV.length() > 2.5) api.resetFeet();
      else A.vAct += ((tmpV.dot(fwdW) / dt) - A.vAct) * Math.min(1, dt * 12);
    }
    A.lastRoot.copy(rootPos); A.haveLast = true;

    // ── locomotion parameters ──
    let cmd = A.speedCmd;
    const forcedSpeed = A.forced === 'run' ? 5.6 * Math.max(0.75, m.k) : A.forced === 'walk' ? 1.9 * Math.max(0.7, m.k) : 0;
    if (cmd < 0.01 && A.forced) cmd = forcedSpeed;
    A.speed += (cmd - A.speed) * Math.min(1, dt * 12);
    if (A.speed < 0.004 && cmd === 0) A.speed = 0;
    const runWanted = A.forced === 'run' ? 1 : A.forced === 'walk' ? 0 : A.runCmd === true ? 1 : A.runCmd === false ? 0 : sstep(S.runStart, S.runFull, A.speed);
    A.runK += (runWanted - A.runK) * Math.min(1, dt * 7);
    const moving = A.speed > 0.06;
    A.amp += ((moving ? 1 : 0) - A.amp) * Math.min(1, dt * (moving ? 9 : 6));
    const legLen = m.legLen;
    // brisk walks spend less time on each foot and reach further; children take proportionally longer strides
    const walkDuty = lerp(0.6, 0.5, sstep(1.2, 3.4, A.speed / Math.max(0.7, m.k)));
    const duty = lerp(walkDuty, 0.34, A.runK);
    const dmax = lerp(1.05 * S.stride, 1.25 * S.stride, A.runK) * legLen;
    const f0 = lerp(1.55, 2.3, A.runK) * Math.sqrt(0.55 / legLen) * S.cadence;
    let f = f0 + A.speed * 0.08;
    let D = A.speed * duty / f;
    if (D > dmax) { f = A.speed * duty / dmax; D = dmax; }
    A.freq = moving ? f : A.freq * Math.max(0, 1 - dt * 4);
    A.D = D; A.duty = duty; A.moving = moving;
    const expected = Math.max(0.05, A.speed);
    A.lockW += (clamp(A.vAct / expected, 0, 1) - A.lockW) * Math.min(1, dt * 10);
    if (moving) A.phase = (A.phase + f * dt) % 1;

    // ── feet (world space) ──
    const legsFreeLast = poseOut.a[poseOut.exOff + EX.legsFree];
    stepFeet(dt, D, duty, moving);

    // foot z in root space for the arm swing
    invRoot.copy(root.matrixWorld).invert();
    for (const f of feet) { tmpV.copy(f.pos).applyMatrix4(invRoot); f.local = f.local || new THREE.Vector3(); f.local.copy(tmpV); }
    ctx.loco.phase = A.phase; ctx.loco.D = Math.max(D, 0.02); ctx.loco.duty = duty; ctx.loco.landK = S.landK; ctx.loco.heel = heelMax() * (1 - A.runK);
    ctx.loco.zL = feet[0].local.z; ctx.loco.zR = feet[1].local.z;

    // ── base layer ──
    poseBase.clear(); W.pose = poseBase; idleClip(W, A.T, ctx);
    const wLoco = A.amp;
    if (wLoco > 0.001) {
      if (A.runK < 0.999) { poseTmp.clear(); W.pose = poseTmp; locoClip(W, A.T, ctx, false); poseBase.blend(poseTmp, wLoco * (1 - A.runK) / Math.max(1e-4, 1 - wLoco * A.runK), null); }
      if (A.runK > 0.001) { poseTmp.clear(); W.pose = poseTmp; locoClip(W, A.T, ctx, true); poseBase.blend(poseTmp, wLoco * A.runK, null); }
    }
    poseOut.copy(poseBase);

    // ── action layers ──
    for (const layer of [A.prev, A.cur]) {
      if (!layer) continue;
      layer.t += dt;
      const clip = layer.clip;
      if (!layer.fadingOut) {
        layer.w = layer.fadeIn > 0 ? Math.min(1, layer.w + dt / layer.fadeIn) : 1;
        if (!layer.loop && layer.t >= clip.dur - layer.fadeOutDur) { layer.fadingOut = true; layer.fadeFrom = layer.w; layer.fadeT = 0; }
      } else {
        layer.fadeT += dt;
        layer.w = layer.fadeFrom * (1 - sstep(0, layer.fadeOutDur, layer.fadeT));
      }
      const tt = layer.loop ? layer.t : Math.min(layer.t, clip.dur);
      if (clip.events) for (const [et, ename] of clip.events) {
        if (!layer.fired.has(ename) && tt >= et) { layer.fired.add(ename); if (api.onEvent) { try { api.onEvent(ename, layer.name); } catch (e) { reportError('anim.onEvent', e); } } }
      }
      const P = layer === A.cur ? poseAct : posePrev;
      P.clear(); W.pose = P; clip.sample(W, tt, ctx);
      poseOut.blend(P, sstep(0, 1, layer.w), (layer.name === 'attack' ? MASKS : GRIP_MASKS)[clip.mask || FULL]);
      // a clip that needs both hands (hands to the face, gathering a spell) lets go of the staff
      if (clip.dropStick) poseOut.a[poseOut.exOff + EX.stick] *= 1 - sstep(0, 1, layer.w);
    }
    if (A.prev && A.prev.w <= 0.001) A.prev = null;
    if (A.cur && A.cur.fadingOut && A.cur.w <= 0.001) { A.cur = null; }
    if (A.cur && A.prev && A.cur.w >= 0.999) A.prev = null;

    // ── additive life: blink, glance, look-at, emote face ──
    const ex = poseOut.exOff, pa = poseOut.a;
    A.blinkT -= dt;
    if (A.blinkT <= 0) {
      A.blinkK = 1;
      A.blinkDouble = hash1(A.T * 3.1 + seed) < 0.18;
      A.blinkT = S.blinkEvery * (0.55 + hash1(A.T * 7.7 + seed) * 0.9);
    }
    let blink = 0;
    if (A.blinkK > 0) {
      A.blinkK -= dt / 0.16;
      blink = Math.sin(clamp(1 - A.blinkK, 0, 1) * Math.PI);
      if (A.blinkK <= 0 && A.blinkDouble) { A.blinkDouble = false; A.blinkK = 1; }
    }
    A.glanceT -= dt;
    if (A.glanceT <= 0) {
      const r = hash1(A.T * 1.37 + seed * 3);
      A.glanceT = 1.8 + r * 3.8;
      const look = hash1(A.T * 2.11 + seed) < 0.55;
      A.glanceX = look ? (hash1(A.T * 5.3 + seed) * 2 - 1) : 0;
      A.glanceY = look ? (hash1(A.T * 9.1 + seed) - 0.6) * 0.5 : 0;
      A.glanceHead = look && hash1(A.T * 4.4 + seed) < 0.6 ? 1 : 0;
    }
    const still = 1 - A.amp;
    let lookX = A.glanceX * still, lookY = A.glanceY * still, headLook = A.glanceX * A.glanceHead * 0.45 * still;
    if (A.lookAt) {
      tmpV.copy(A.lookAt).applyMatrix4(invRoot);
      const yawTo = Math.atan2(tmpV.x, tmpV.z);
      const pitchTo = Math.atan2(tmpV.y - m.headY, Math.hypot(tmpV.x, tmpV.z));
      headLook = clamp(yawTo, -1.1, 1.1) * 0.8; lookX = clamp(yawTo * 1.5, -1, 1); lookY = clamp(pitchTo * 1.5, -1, 1);
      A.headLookY += (clamp(-pitchTo, -0.4, 0.4) * 0.6 - A.headLookY) * Math.min(1, dt * 5);
    } else A.headLookY += (0 - A.headLookY) * Math.min(1, dt * 5);
    // the head leads a turn, the chest follows
    const turnLead = clamp(wrapPi(A.yawT - A.yaw), -1, 1);
    headLook += turnLead * 0.55; lookX += turnLead * 0.9;
    A.eyeX += (clamp(lookX, -1, 1) - A.eyeX) * Math.min(1, dt * 18);
    A.eyeY += (clamp(lookY, -1, 1) - A.eyeY) * Math.min(1, dt * 18);
    A.headLook += (headLook - A.headLook) * Math.min(1, dt * 5);
    pa[ex + EX.lookX] += A.eyeX; pa[ex + EX.lookY] += A.eyeY;
    pa[ex + EX.blink] = Math.max(pa[ex + EX.blink], blink);
    if (A.emote) {
      A.emoteT += dt;
      const ew = env(A.emoteT, 0, 0.12, A.emoteDur - 0.3, A.emoteDur);
      const face = EMOTE_FACE[A.emote];
      for (const k in face) pa[ex + EX[k]] += face[k] * ew;
      if (A.emoteT >= A.emoteDur) A.emote = null;
    }
    {
      const i = index.head, o = i * BS; if (i !== undefined) { pa[o + 1] += A.headLook * 0.75; pa[o] += A.headLookY; }
      const n = index.neck; if (n !== undefined) pa[n * BS + 1] += A.headLook * 0.25;
      const c = index.chest; if (c !== undefined) pa[c * BS + 1] += turnLead * 0.18;
      // lean into turns while moving
      const h = index.hips; if (h !== undefined) pa[h * BS + 2] += clamp(-A.turnVel * A.speed * 0.012, -0.18, 0.18);
    }

    // ── write FK ──
    for (let i = 0; i < nb; i++) {
      const b = list[i], o = i * BS, bp = bind[b.name];
      b.rotation.set(pa[o], pa[o + 1], pa[o + 2]);
      b.position.set(bp.x + pa[o + 3], bp.y + pa[o + 4], bp.z + pa[o + 5]);
      b.scale.set(1 + pa[o + 6], 1 + pa[o + 7], 1 + pa[o + 8]);
    }
    // the chest breathes and squashes, but the arms and head it carries must not stretch with it (a stretched arm
    // puts a held staff's tip off its spot on the ground, and wobbles the face)
    if (bones.chest) {
      const cs = bones.chest.scale;
      for (const n of CHEST_KIDS) { const b = bones[n]; if (b) b.scale.set(b.scale.x / cs.x, b.scale.y / cs.y, b.scale.z / cs.z); }
    }
    applyFace(pa, ex);
    applySecondary(dt, pa, ex);
    root.updateWorldMatrix(false, true);

    // ── legs: IK to the feet ──
    const legsFree = clamp(pa[ex + EX.legsFree], 0, 1);
    const ikW = 1 - legsFree;
    const ikO = poseOut.ikOff;
    for (let li = 0; li < 2; li++) {
      const f = feet[li];
      const aw = clamp(pa[ikO + li * 4 + 3], 0, 1);
      f.target.copy(f.pos);
      if (f.heel > 0.001) {
        // pivot on the ball of the foot: the ankle rises and eases forward
        const hl = f.heel * 0.5 * S.heelLift;
        f.target.addScaledVector(Y_UP, footLen * Math.sin(hl)).addScaledVector(fwdW, footLen * (1 - Math.cos(hl)));
      }
      if (aw > 0.001) {
        tmpV.set(pa[ikO + li * 4] / aw, pa[ikO + li * 4 + 1] / aw, pa[ikO + li * 4 + 2] / aw).applyMatrix4(root.matrixWorld);
        f.target.lerp(tmpV, aw);
        if (!f.swing || aw > 0.5) { f.pos.copy(f.target); f.swing = false; }
      }
    }
    if (ikW > 0.001) {
      // lower the pelvis if a foot is out of reach (long strides, crouches)
      const hips = bones.hips;
      let drop = 0;
      for (let li = 0; li < 2; li++) {
        const th = bones[li === 0 ? 'thighL' : 'thighR'];
        if (!th) continue;
        const hp = _v1.setFromMatrixPosition(th.matrixWorld);
        const reach = (m.L1 + m.L2) * 0.985;
        const dx = Math.hypot(feet[li].target.x - hp.x, feet[li].target.z - hp.z);
        const maxUp = Math.sqrt(Math.max(0, reach * reach - dx * dx));
        const need = (hp.y - feet[li].target.y) - maxUp;
        if (need > drop) drop = need;
      }
      A.ikDrop = drop;
      if (drop > 0 && hips) { hips.position.y -= Math.min(drop, m.legLen * 0.5) * ikW; hips.updateWorldMatrix(false, true); }
      for (let li = 0; li < 2; li++) {
        const side = li === 0 ? 'L' : 'R', sgn = li === 0 ? 1 : -1;
        const th = bones['thigh' + side], sh = bones['shin' + side], ft = bones['foot' + side];
        if (!th || !sh || !ft) continue;
        const hp = _v3.setFromMatrixPosition(th.matrixWorld);
        const pole = tmpV.set(sgn * 0.12, 0, 1).applyQuaternion(rootQ).multiplyScalar(m.legLen).add(hp);
        solve2(th, sh, ft, feet[li].target, pole.clone(), ikW);
        const pitch = pa[ex + (li === 0 ? EX.footPitchL : EX.footPitchR)] + feet[li].pitch + (feet[li].heel || 0) * 0.5 * S.heelLift;
        orientWorld(ft, rootQ, pitch, sgn * 0.08, 0, ikW);
      }
    }

    // ── arms: IK when a clip asks for it. Right hand first: the left may need to grip what the right is holding ──
    const chest = bones.chest;
    const weaponK = clamp(pa[ex + EX.weapon], 0, 1);
    const stickW = S.plant ? clamp(pa[ex + EX.stick], 0, 1) * (1 - weaponK) * (1 - legsFree) * (1 - A.runK) : 0;
    stepStick(dt, stickW);
    for (const ai of [1, 0]) {
      const side = ai === 0 ? 'L' : 'R', sgn = ai === 0 ? 1 : -1;
      const up = bones['arm' + side], lo = bones['fore' + side], hd = bones['hand' + side];
      if (!up || !lo || !hd) continue;
      const oc = ikO + (2 + ai) * 4, orr = ikO + (4 + ai) * 4;
      const wc = clamp(pa[oc + 3], 0, 1), wr = clamp(pa[orr + 3], 0, 1);
      if (ai === 0 && pa[ex + EX.twoHand] > 0.001 && bones.propR) {
        // left hand grips the right hand's weapon just below the right fist
        bones.propR.updateWorldMatrix(true, false);
        const g = _v2.set(0, 0, -0.1 * m.k).applyMatrix4(bones.propR.matrixWorld);
        solve2(up, lo, hd, g, _v3.set(sgn * 1, -0.3, -0.5).applyQuaternion(rootQ).add(g), clamp(pa[ex + EX.twoHand], 0, 1));
        continue;
      }
      if (wc + wr > 0.001) {
        const tgt = _v2.set(0, 0, 0);
        if (wc > 0.001 && chest) tgt.addScaledVector(_v4.set(pa[oc] / wc, pa[oc + 1] / wc, pa[oc + 2] / wc).applyMatrix4(chest.matrixWorld), wc);
        if (wr > 0.001) tgt.addScaledVector(_v4.set(pa[orr] / wr, pa[orr + 1] / wr, pa[orr + 2] / wr).applyMatrix4(root.matrixWorld), wr);
        const w = Math.max(wc, wr);
        tgt.divideScalar(wc + wr);
        up.updateWorldMatrix(true, false);
        const sp = _v5.setFromMatrixPosition(up.matrixWorld);
        const pole = new THREE.Vector3(sgn * 0.8, -0.4, -0.7).applyQuaternion(rootQ).add(sp);
        solve2(up, lo, hd, tgt.clone(), pole, clamp(w, 0, 1));
      }
      if (ai === 1) {
        // hands that hold long things upright
        const tilt = pa[ex + EX.tilt];
        orientWorld(hd, rootQ, Math.PI / 2 + tilt - A.amp * 0.12 * Math.sin(A.phase * TAU), 0, 0, clamp(pa[ex + EX.orientR], 0, 1) * (1 - weaponK) * (1 - legsFree) * (1 - stickW));
        // a swung blade points where the clip says (root-space direction)
        const bw = clamp(pa[ex + EX.blade], 0, 1);
        if (bw > 0.001) {
          const bd = _v4.set(pa[ex + EX.bladeX], pa[ex + EX.bladeY], pa[ex + EX.bladeZ]);
          if (bd.lengthSq() > 1e-6) { bd.normalize().applyQuaternion(rootQ); setWorldQuat(hd, quatFromDir(bd, _qH), bw); }
        }
        if (stickW > 0.001) stickIK(up, lo, hd, stickW);
      }
    }
    if (bones.handL) orientWorld(bones.handL, rootQ, 0, 0, 0, clamp(pa[ex + EX.orientL], 0, 1));
  }

  // ── hand orientation helpers ──
  const _qH = new THREE.Quaternion(), _qW = new THREE.Quaternion(), _mB = new THREE.Matrix4();
  const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
  /** world quaternion whose +Z runs along dirW (the blade / staff), knuckles kept facing the character's front */
  function quatFromDir(dirW, out) {
    _bz.copy(dirW).normalize();
    _bx.set(-1, 0, 0).applyQuaternion(rootQ);
    _bx.addScaledVector(_bz, -_bx.dot(_bz));
    if (_bx.lengthSq() < 1e-6) _bx.set(0, 0, 1).applyQuaternion(rootQ).addScaledVector(_bz, -_bz.z);
    _bx.normalize();
    _by.crossVectors(_bz, _bx);
    _mB.makeBasis(_bx, _by, _bz);
    return out.setFromRotationMatrix(_mB);
  }
  function setWorldQuat(bone, qW, w) {
    bone.parent.getWorldQuaternion(_qW).invert().multiply(qW);
    bone.quaternion.slerp(_qW, w);
    bone.updateWorldMatrix(false, true);
  }

  // ── the walking staff: a third foot. Planted with the left foot (the right hand's stride), carried forward in an
  //    arc while the right foot lands; steps back under the hand when standing, turning, or picked up again ──
  function stepStick(dt, sw) {
    const P = S.plant;
    if (!P || sw < 0.05) { stick.init = false; stick.planted = false; stick.swing = false; return; }
    const restTip = (out, ahead = 0) => out.set(-(m.shoulderX + P.out + P.tipOut), 0, P.tipFwd + ahead).applyMatrix4(root.matrixWorld);
    const plant = () => {
      stick.swing = false; stick.planted = true; stick.s = 0; stick.plants++;
      if (api.onEvent) { try { api.onEvent('plant', 'staff'); } catch (e) { reportError('anim.onEvent', e); } }
    };
    if (!stick.init) {
      // pick it up from wherever the tip is now and set it down under the hand
      if (bones.propR) { bones.propR.updateWorldMatrix(true, false); stick.from.set(0, 0, P.len).applyMatrix4(bones.propR.matrixWorld); } else restTip(stick.from);
      stick.tip.copy(stick.from); stick.init = true; stick.planted = false;
      stick.swing = true; stick.kind = 'settle'; stick.s = 0; stick.dur = 0.3; stick.lift = 0.04;
    }
    const vVirtual = Math.max(0, A.speed - Math.max(0, A.vAct)) * (1 - A.lockW);
    if (!stick.swing && vVirtual > 0.001) stick.tip.addScaledVector(fwdW, -vVirtual * dt);
    const walking = A.moving && A.amp > 0.3;
    if (walking && !(stick.swing && stick.kind === 'settle')) {
      const q = A.phase % 1, sd = 0.5, inSwing = q >= sd;
      const Ds = A.speed * sd / Math.max(0.1, A.freq);
      if (inSwing && !stick.swing) { stick.swing = true; stick.kind = 'gait'; stick.from.copy(stick.tip); stick.planted = false; }
      if (stick.swing && stick.kind === 'gait') {
        if (!inSwing) { restTip(stick.tip, Ds * 0.5); plant(); }
        else {
          const sN = (q - sd) / (1 - sd);
          const remain = (1 - sN) * (1 - sd) / Math.max(0.1, A.freq);
          const land = restTip(_v4, Ds * 0.5).addScaledVector(fwdW, Math.max(0, A.vAct) * remain);
          stick.s = sN;
          stick.tip.lerpVectors(stick.from, land, sN * sN * (3 - 2 * sN));
          stick.tip.y += Math.sin(Math.pow(sN, 0.8) * Math.PI) * P.lift;
        }
      }
    }
    if (stick.swing && stick.kind === 'settle') {
      stick.s = Math.min(1, stick.s + dt / stick.dur);
      const e = stick.s * stick.s * (3 - 2 * stick.s);
      const tgt = restTip(_v4);
      stick.tip.lerpVectors(stick.from, tgt, e);
      stick.tip.y = lerp(stick.from.y, tgt.y, stick.s) + Math.sin(stick.s * Math.PI) * stick.lift;
      if (stick.s >= 1) plant();
    } else if (!walking && !stick.swing) {
      const tgt = restTip(_v4);
      const d = Math.hypot(tgt.x - stick.tip.x, tgt.z - stick.tip.z);
      if (d > (Math.abs(A.yawV) > 0.3 ? 0.1 : 0.16) * m.k) {
        stick.swing = true; stick.kind = 'settle'; stick.s = 0; stick.from.copy(stick.tip); stick.planted = false;
        stick.dur = clamp(0.24 + d * 0.35, 0.24, 0.5); stick.lift = clamp(0.04 + d * 0.12, 0.04, 0.12) * m.k;
      }
    }
  }

  /** the right hand rides the staff: grip at staff length from the planted tip, toward where the hand wants to be */
  function stickIK(up, lo, hd, sw) {
    const P = S.plant, pr = bones.propR;
    if (!pr) return;
    const cyc = Math.cos(A.phase * TAU) * A.amp * (1 - A.runK);
    const Ds = A.speed * 0.5 / Math.max(0.1, A.freq);
    const hipsLift = bones.hips ? (bones.hips.position.y - bind.hips.y) * 0.85 : 0;
    const H = _v1.set(-(m.shoulderX + P.out), P.gripY + hipsLift, P.fwd + cyc * Math.min(P.swing, Ds * 0.32)).applyMatrix4(root.matrixWorld);
    const T = stick.tip;
    const dir = _v2.subVectors(H, T);
    const len = dir.length() || 1; dir.divideScalar(len);
    const G = _v3.copy(T).addScaledVector(dir, P.len);
    quatFromDir(_v4.copy(dir).negate(), _qH);
    const W = _v5.copy(pr.position).applyQuaternion(_qH).negate().add(G);
    up.updateWorldMatrix(true, false);
    const pole = new THREE.Vector3(-0.8, -0.4, -0.7).applyQuaternion(rootQ).add(_v4.setFromMatrixPosition(up.matrixWorld));
    solve2(up, lo, hd, W, pole, sw);
    setWorldQuat(hd, _qH, sw);
    // re-aim from where the grip actually ended up, so the tip meets its spot on the ground
    for (let i = 0; i < 2; i++) {
      pr.updateWorldMatrix(true, false);
      const g = _v3.setFromMatrixPosition(pr.matrixWorld);
      quatFromDir(_v4.subVectors(T, g), _qH);
      setWorldQuat(hd, _qH, sw);
    }
  }

  // ── feet state machine ──
  function stepFeet(dt, D, duty, moving) {
    root.updateWorldMatrix(true, false);
    const rest = (f, out, ahead = 0) => out.set(f.side * m.hipX, m.ankleY, ahead).applyMatrix4(root.matrixWorld);
    for (const f of feet) if (!f.init) { rest(f, f.pos); f.init = true; f.swing = false; }
    const vVirtual = Math.max(0, A.speed - Math.max(0, A.vAct)) * (1 - A.lockW);
    const velW = _v2.copy(fwdW).multiplyScalar(Math.max(0, A.vAct));
    for (const f of feet) {
      // treadmill: planted feet ride the virtual ground backward
      if (!f.swing && vVirtual > 0.001) f.pos.addScaledVector(fwdW, -vVirtual * dt);
      f.pitch *= Math.max(0, 1 - dt * 10);
    }
    if (moving || A.amp > 0.25) {
      for (const f of feet) {
        const off = f.side > 0 ? 0 : 0.5;
        const q = (A.phase + off) % 1;
        const inSwing = q >= duty;
        // heel peels up at the end of the stance (walk), so the back leg need not drag the hips down
        f.heel = moving && !f.swing ? sstep(duty * 0.55, duty, q) * (1 - A.runK) * A.amp : 0;
        if (f.swing && f.kind !== 'gait') { f.kind = 'gait'; f.from.copy(f.pos); f.dur = Math.max(0.05, (1 - duty) / Math.max(0.1, A.freq)); f.lift = 0.05 * m.legLen; }
        if (inSwing && !f.swing && moving) {
          f.swing = true; f.from.copy(f.pos); f.s = 0;
          // leave from where the peeled-up ankle already is (no dip at toe-off)
          const hl = 0.5 * S.heelLift * (1 - A.runK);
          f.from.addScaledVector(Y_UP, footLen * Math.sin(hl)).addScaledVector(fwdW, footLen * (1 - Math.cos(hl)));
          f.dur = Math.max(0.05, (1 - duty) / Math.max(0.1, A.freq));
          f.lift = lerp(0.2, 0.32, A.runK) * m.legLen * (0.5 + 0.5 * clamp(D / (m.legLen * 0.9), 0, 1)) * S.lift;
          f.kind = 'gait';
        }
        if (f.swing && f.kind === 'gait') {
          const landing = moving && !inSwing;
          const s = landing ? 1 : moving ? clamp((q - duty) / (1 - duty), 0, 1) : clamp(f.s + dt / f.dur, 0, 1);
          const remain = (1 - s) * f.dur;
          const land = rest(f, _v3, D * lerp(S.landK, 0.5, A.runK) * A.amp).addScaledVector(velW, remain);
          if (landing || s >= 1) {
            f.pos.copy(land); f.swing = false; f.s = 0;
            if (api.onStep) { try { api.onStep(f.side > 0 ? 'L' : 'R'); } catch (e) { reportError('anim.onStep', e); } }
          } else {
            f.s = s;
            const e = s * s * (3 - 2 * s);
            f.pos.lerpVectors(f.from, land, e);
            // run: heel kicks up behind first; walk: the knee lifts early, the foot reaches and sets down flat
            const arc = A.runK > 0.5 ? Math.sin(Math.pow(s, 0.7) * Math.PI) : Math.sin(Math.pow(s, 0.8) * Math.PI);
            f.pos.y = lerp(f.from.y, land.y, s) + arc * f.lift;
            f.pitch = lerp(0.5 * (1 - s) * 1.2, -0.25, s) * (1 - A.runK * 0.3) - (A.runK * Math.sin(s * Math.PI) * 0.4);
          }
        }
      }
      if (moving) return;
    }
    // idle: settle steps (also turns in place)
    for (const f of feet) f.heel = 0;
    const other = (f) => feet[f.side > 0 ? 1 : 0];
    for (const f of feet) {
      if (f.swing && (f.kind !== 'gait' || !moving)) {
        f.s = clamp(f.s + dt / f.dur, 0, 1);
        const tgt = rest(f, _v3);
        const e = f.s * f.s * (3 - 2 * f.s);
        f.pos.lerpVectors(f.from, tgt, e);
        f.pos.y = lerp(f.from.y, tgt.y, f.s) + Math.sin(f.s * Math.PI) * f.lift;
        f.pitch = Math.sin(f.s * Math.PI) * 0.2;
        if (f.s >= 1) { f.swing = false; if (api.onStep) { try { api.onStep(f.side > 0 ? 'L' : 'R', 'shuffle'); } catch (e2) { reportError('anim.onStep', e2); } } }
      }
    }
    for (const f of feet) {
      if (f.swing || other(f).swing) continue;
      const tgt = rest(f, _v3);
      const d = Math.hypot(tgt.x - f.pos.x, tgt.z - f.pos.z);
      const thresh = (Math.abs(A.yawV) > 0.4 ? 0.035 : 0.07) * m.k;
      if (d > thresh) {
        // step the foot that is further away first
        const od = rest(other(f), _v4); const d2 = Math.hypot(od.x - other(f).pos.x, od.z - other(f).pos.z);
        if (d2 > d * 1.05) continue;
        f.swing = true; f.kind = 'settle'; f.s = 0; f.from.copy(f.pos);
        f.dur = clamp(0.16 + d * 0.5, 0.16, 0.32); f.lift = clamp(d * 0.35, 0.02, 0.07) * Math.max(0.7, m.k);
        break;
      }
    }
  }

  // ── face: blink / look / expressions onto the face bones ──
  function applyFace(pa, ex) {
    const g = (n) => pa[ex + EX[n]];
    const blink = clamp(g('blink'), 0, 1), wide = clamp(g('wide'), 0, 1.5), happy = clamp(g('happy'), 0, 1);
    const eyeSy = Math.max(0.08, (1 - blink * 0.92) * (1 - happy * 0.72) * (1 + wide * 0.18));
    const eyeSx = 1 + wide * 0.12 + happy * 0.08;
    const lx = clamp(g('lookX'), -1, 1), ly = clamp(g('lookY'), -1, 1);
    for (const [n, sgn] of [['eyeL', 1], ['eyeR', -1]]) {
      const b = bones[n]; if (!b) continue;
      b.scale.set(eyeSx, eyeSy, 1);
      b.position.x += lx * m.eyeLook; b.position.y += ly * m.eyeLook * 0.6 + happy * m.headR * 0.03;
      b.rotation.z = happy * 0.0 + sgn * 0;
    }
    const browUp = g('browUp'), angry = clamp(g('browAngry'), 0, 1.5), sad = clamp(g('browSad'), 0, 1.5);
    for (const [n, sgn] of [['browL', 1], ['browR', -1]]) {
      const b = bones[n]; if (!b) continue;
      b.position.y += (browUp * 0.045 - angry * 0.018 + sad * 0.012 + wide * 0.02 - blink * 0.008) * m.headR;
      b.rotation.z += sgn * (-angry * 0.4 + sad * 0.45);
    }
    const open = clamp(g('open'), 0, 1), O = clamp(g('O'), 0, 1), frown = clamp(g('frown'), 0, 1);
    let smile = g('smile');
    const mouth = bones.mouth, mo = bones.mouthOpen, mO = bones.mouthO;
    const shut = clamp(1 - open * 1.4 - O * 1.5, 0, 1);
    if (mouth) {
      const sm = clamp(smile, -1, 1.5);
      const sy = Math.abs(sm) < 0.12 ? 0.12 * (sm < 0 || frown > 0.5 ? -1 : 1) : sm;
      const flip = frown > 0.5 && sm < 0.3 ? -Math.max(0.4, frown) : sy;
      mouth.scale.set(shut * (0.8 + Math.abs(sm) * 0.25), shut * flip, shut);
    }
    if (mo) { const k = open > 0.03 ? 1 : 0; mo.scale.set(k * (0.75 + 0.35 * clamp(smile, 0, 1.5) * 0.5), k * open, k); }
    if (mO) { const k = O > 0.03 ? 1 : 0; mO.scale.set(k * O * 0.9, k * O, k); }
    const blush = bones.blush; if (blush) { const k = clamp(g('blush'), 0, 1); blush.scale.setScalar(k > 0.02 ? 0.4 + k * 0.6 : 0); }
    // props
    const weapon = clamp(g('weapon'), 0, 1), item = clamp(g('item'), 0, 1);
    if (bones.propR && S.propR === null) { const k = weapon > 0.5 ? 1 : 0; bones.propR.scale.setScalar(k); }
    if (bones.propL && S.weapon === 'sling') { const k = weapon > 0.5 ? 1 : 0; bones.propL.scale.setScalar(k); }
    if (bones.sheath) { const k = weapon > 0.5 ? 0 : 1; bones.sheath.scale.setScalar(k); }
    if (bones.item) { bones.item.scale.setScalar(item > 0.05 ? sstep(0, 1, item) : 0); bones.item.rotation.y = A.T * 2.2; }
    if (bones.seat) { bones.seat.scale.setScalar(clamp(g('seat'), 0, 1) > 0.5 ? 1 : 0); }
  }

  // ── cloth and hair springs ──
  function applySecondary(dt, pa, ex) {
    const hipsY = bones.hips ? bones.hips.position.y : 0;
    const vy = dt > 0 ? (hipsY - springs.lastHipY) / dt : 0; springs.lastHipY = hipsY;
    const run = A.runK, sp = A.speed;
    const hipsPitch = bones.hips ? bones.hips.rotation.x : 0, spinePitch = bones.spine ? bones.spine.rotation.x : 0, chestPitch = bones.chest ? bones.chest.rotation.x : 0;
    const lean = hipsPitch + spinePitch + chestPitch;
    const lying = clamp(pa[ex + EX.legsFree], 0, 1);
    const still = 1 - A.amp;
    if (bones.cloak1) {
      const flutter = vnoise1(A.T * 6.5 + seed) * run * 0.12 + vnoise1(A.T * 2.2 + seed * 2) * 0.03 * A.amp;
      const tgt = (clamp(sp * 0.07, 0, 0.3) + run * 0.35 + flutter) * S.cloakLift - lean * 0.85 * (1 - lying) + clamp(-vy * 0.03, -0.1, 0.15);
      const x = springs.cloakX.step(tgt, dt);
      const z = springs.cloakZ.step(clamp(A.turnVel * 0.04 * (1 - still * 0.6), -0.12, 0.12), dt);
      bones.cloak1.rotation.x += Math.max(-0.2, x) * 0.6; bones.cloak1.rotation.z += z * 0.5;
      if (bones.cloak2) bones.cloak2.rotation.x += springs.cloak2.step(Math.max(-0.1, x) * 0.5 + flutter * 0.8, dt);
      if (bones.cloak3) bones.cloak3.rotation.x += springs.cloak3.step(Math.max(0, x) * 0.35 + flutter * 1.2, dt);
    }
    if (bones.skirtF || bones.skirtB) {
      const thL = bones.thighL, thR = bones.thighR;
      // use the feet: a forward foot pushes the front panel, a back foot the back one
      const zL = feet[0].local ? feet[0].local.z : 0, zR = feet[1].local ? feet[1].local.z : 0;
      const fwd = Math.max(zL, zR, 0) / Math.max(0.1, m.legLen), back = Math.min(zL, zR, 0) / Math.max(0.1, m.legLen);
      const sitK = clamp(pa[ex + EX.seat], 0, 1);
      const kneelFwd = thL && thR ? Math.max(0, -Math.min(thL.rotation.x, thR.rotation.x)) : 0;
      const bounce = springs.skirtY.step(clamp(-vy * 0.05, -0.25, 0.25), dt);
      if (bones.skirtF) bones.skirtF.rotation.x += springs.skirtF.step(-fwd * 1.1 - sitK * 1.2 - bounce * 0.5 - run * 0.1, dt);
      if (bones.skirtB) bones.skirtB.rotation.x += springs.skirtB.step(-back * 1.1 + run * 0.35 + bounce * 0.5 + sp * 0.02, dt);
      void kneelFwd;
    }
    if (bones.plait1) {
      const tgtX = clamp(sp * 0.035, 0, 0.2) + run * 0.25 - (lean + (bones.neck ? bones.neck.rotation.x : 0) + (bones.head ? bones.head.rotation.x : 0)) * 0.5 * (1 - lying) + clamp(-vy * 0.05, -0.3, 0.3);
      const x = springs.plaitX.step(tgtX, dt);
      const z = springs.plaitZ.step(clamp(A.turnVel * 0.2, -0.5, 0.5) + (bones.hips ? bones.hips.position.x : 0) * -4, dt);
      bones.plait1.rotation.x += x * 0.35; bones.plait1.rotation.z += z * 0.5;
      if (bones.plait2) bones.plait2.rotation.x += springs.plait2.step(x * 0.35, dt);
      if (bones.plait3) bones.plait3.rotation.x += x * 0.3;
    }
    if (bones.hairBack) bones.hairBack.rotation.x += springs.hairX.step(clamp(sp * 0.03, 0, 0.15) + clamp(-vy * 0.02, -0.08, 0.08), dt);
  }

  // settle at the start
  root.rotation.y = A.yaw;
  return api;
}

export const Anim = { makeSkeleton, createAnimator, CLIP_NAMES, EMOTES, EXPR };
export default Anim;
