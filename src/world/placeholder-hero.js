/**
 * placeholder-hero.js — a round, charming stand-in for Bram. FALLBACK ONLY: the field's hero is the real Bram from
 * P07 (chars.js) + P08 (anim.js) via src/world/player.js heroModel(); this model is used when chars.js is missing or
 * throws, or when the page is opened with ?hero=placeholder (before/after comparisons).     (integrator-owned)
 * CANON §1: a round-headed boy in a too-big green travelling cloak, half a green ribbon knotted on his LEFT wrist.
 * Built only from F3: toon materials (PAL colours), inverted-hull outlines on the smooth parts, flat unlit eyes.
 *
 *   const hero = buildPlaceholderHero();       // -> {group, animate(dt, t, motion), nod(), blink(), state()}
 *   scene.add(hero.group);
 *   hero.animate(dt, t, { speed, run, turn, grounded, onStep })   // speed in world units / second
 *
 * Motion: idle breathes, blinks and glances about; walk swings arms and legs with a bob and a little lean; run is a
 * different cycle (bigger stride, bent-forward lean, cloak streaming, a hop in the bob). onStep(foot) fires on every
 * footfall. nod() plays Bram's two quick nods ("Nods twice, fast, to agree").
 */
import * as THREE from 'three';
import { PAL, C3, mixHex } from '../art/palette.js';
import { makeToon, withOutline, OUTLINE } from '../art/toon.js';

const TAU = Math.PI * 2;

export function buildPlaceholderHero() {
  const toon = (hex, preset = 'character') => makeToon({ color: C3(hex) }, preset);
  const flat = (hex) => new THREE.MeshBasicMaterial({ color: C3(hex) });
  const M = {
    cloak: toon(PAL.cloth.green, 'cloth'), cloakDark: toon(PAL.cloth.greenDark, 'cloth'), tunic: toon(PAL.cloth.tunic, 'cloth'),
    skin: toon(PAL.char.skin, 'skin'), hair: toon(PAL.char.hairBrown), boot: toon(PAL.char.boot), trousers: toon(PAL.cloth.leather), belt: toon(PAL.char.belt),
    ribbon: toon(PAL.foliage.sun, 'cloth'), clasp: toon(PAL.paint.gold), satchel: toon(PAL.wood.mid),
    eye: flat(PAL.char.eye), white: flat(PAL.char.white), mouth: flat(PAL.slime.mouth), cheek: flat(mixHex(PAL.char.skin, PAL.flower.pink, 0.55)),
  };
  const root = new THREE.Group(); root.name = 'hero';
  const part = (geo, mat, parent, x, y, z, outline = OUTLINE.char, shadow = false) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow;
    if (outline) withOutline(m, outline);
    parent.add(m); return m;
  };

  // ── pivots ──
  const body = new THREE.Group(); body.name = 'hero-body'; root.add(body);
  const hips = { L: new THREE.Group(), R: new THREE.Group() };
  const shoulders = { L: new THREE.Group(), R: new THREE.Group() };
  hips.L.position.set(0.1, 0.36, 0); hips.R.position.set(-0.1, 0.36, 0);
  root.add(hips.L, hips.R);
  shoulders.L.position.set(0.215, 0.78, 0.0); shoulders.R.position.set(-0.215, 0.78, 0.0);
  body.add(shoulders.L, shoulders.R);
  const headPivot = new THREE.Group(); headPivot.position.set(0, 0.86, 0.01); body.add(headPivot);
  const cloakPivot = new THREE.Group(); cloakPivot.position.set(0, 0.84, 0); body.add(cloakPivot);

  // ── legs: short trousers + round boots (left = +x, the hero faces +z in model space) ──
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1, hip = hips[side];
    part(new THREE.CapsuleGeometry(0.075, 0.12, 4, 10), M.trousers, hip, 0, -0.1, 0, OUTLINE.char, true);
    const boot = part(new THREE.CapsuleGeometry(0.085, 0.1, 4, 12), M.boot, hip, 0.005 * s, -0.28, 0.035, OUTLINE.char);
    boot.rotation.x = Math.PI / 2; boot.scale.set(1.05, 1.1, 0.85);
  }

  // ── torso: tunic under a bell-shaped cloak that is a size too big ──
  const tunic = part(new THREE.CapsuleGeometry(0.19, 0.2, 6, 16), M.tunic, body, 0, 0.56, 0.0, OUTLINE.char, true);
  tunic.scale.set(1, 1, 0.9);
  const belt = part(new THREE.TorusGeometry(0.19, 0.03, 6, 20), M.belt, body, 0, 0.46, 0.0, 0);
  belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.9, 1);
  part(new THREE.BoxGeometry(0.07, 0.06, 0.03), M.clasp, body, 0, 0.46, 0.175, 0);
  const cloakProfile = [[0.001, 0.05], [0.2, 0.02], [0.225, -0.08], [0.26, -0.22], [0.31, -0.38], [0.355, -0.5], [0.365, -0.56], [0.33, -0.58]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const cloakGeo = new THREE.LatheGeometry(cloakProfile, 28, Math.PI * 0.15, Math.PI * 1.7);    // open at the front (lathe phi 0 = +z)
  const cloak = part(cloakGeo, makeToon({ color: C3(PAL.cloth.green), side: THREE.DoubleSide }, 'cloth'), cloakPivot, 0, 0, -0.01, 0, true);
  cloak.scale.set(1, 1, 0.92);
  const collar = part(new THREE.TorusGeometry(0.19, 0.06, 10, 24), M.cloakDark, cloakPivot, 0, 0.0, 0.0, OUTLINE.char);
  collar.rotation.x = Math.PI / 2; collar.scale.set(1, 1.02, 1);
  const hood = part(new THREE.SphereGeometry(0.2, 16, 12), M.cloakDark, cloakPivot, 0, 0.03, -0.15, OUTLINE.char);
  hood.scale.set(1.12, 0.62, 0.72); hood.rotation.x = 0.35;
  part(new THREE.SphereGeometry(0.045, 10, 8), M.clasp, cloakPivot, 0, -0.01, 0.2, 0);
  // satchel strap + bag on the right hip
  const strap = part(new THREE.TorusGeometry(0.235, 0.018, 5, 26), M.satchel, body, 0, 0.6, 0.0, 0);
  strap.rotation.set(0.12, 0, 0.55); strap.scale.set(1, 1.2, 0.9);

  // ── arms: tunic sleeves, round hands, the ribbon on the LEFT wrist ──
  const hands = {};
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1, sh = shoulders[side];
    const arm = part(new THREE.CapsuleGeometry(0.058, 0.2, 4, 10), M.tunic, sh, 0.02 * s, -0.15, 0, OUTLINE.char);
    arm.rotation.z = 0.12 * s;
    hands[side] = part(new THREE.SphereGeometry(0.07, 12, 10), M.skin, sh, 0.045 * s, -0.33, 0.01, OUTLINE.char);
    if (side === 'L') {
      const band = part(new THREE.TorusGeometry(0.058, 0.02, 6, 16), M.ribbon, sh, 0.04, -0.27, 0.0, 0);
      band.rotation.x = Math.PI / 2;
      for (const k of [-1, 1]) {
        const tail = part(new THREE.CapsuleGeometry(0.014, 0.075, 3, 6), M.ribbon, sh, 0.085 + k * 0.012, -0.3, 0.05, 0);
        tail.rotation.set(0.5, 0, 0.5 + k * 0.45);
      }
    }
  }

  // ── head: big and round ──
  const head = new THREE.Group(); head.position.set(0, 0.25, 0); headPivot.add(head);
  const skull = part(new THREE.SphereGeometry(0.28, 24, 16), M.skin, head, 0, 0, 0, OUTLINE.head, true);
  skull.scale.set(1.04, 0.97, 0.98);
  for (const s of [-1, 1]) part(new THREE.SphereGeometry(0.07, 10, 8), M.skin, head, s * 0.275, -0.02, -0.01, OUTLINE.char).scale.set(0.55, 0.9, 0.75);
  // hair: a soft round cap, a fringe of three soft locks and one cowlick that refuses to lie down
  const cap = part(new THREE.SphereGeometry(0.3, 24, 18, 0, TAU, 0, Math.PI * 0.62), M.hair, head, 0, 0.03, -0.03, OUTLINE.char);
  cap.rotation.x = -0.5; cap.scale.set(1.04, 1.02, 1.05);
  // fringe: three soft locks along the hairline, and a tuft over each ear
  for (const [x, y, z, r, rz] of [[-0.13, 0.13, 0.215, 0.085, 0.35], [0.0, 0.155, 0.235, 0.09, 0], [0.13, 0.13, 0.215, 0.085, -0.35], [-0.24, 0.02, 0.1, 0.075, 0.2], [0.24, 0.02, 0.1, 0.075, -0.2]]) {
    const lock = part(new THREE.SphereGeometry(r, 12, 9), M.hair, head, x, y, z, 0);
    lock.scale.set(1.15, 0.7, 0.62); lock.rotation.z = rz;
  }
  // the one curl on the crown that will not lie down
  const curl = part(new THREE.TorusGeometry(0.07, 0.026, 8, 16, Math.PI * 1.55), M.hair, head, 0.0, 0.335, 0.06, OUTLINE.char);
  curl.rotation.set(0, Math.PI / 2, 0.9);
  // face
  const eyes = [];
  for (const s of [-1, 1]) {
    const eyeG = new THREE.Group(); eyeG.position.set(s * 0.1, 0.0, 0.255); head.add(eyeG);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), M.eye); e.scale.set(0.82, 1.3, 0.45); eyeG.add(e);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), M.white); hl.position.set(-0.012 * s + 0.004, 0.028, 0.02); eyeG.add(hl);
    eyes.push(eyeG);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.05, 3, 6), M.eye); brow.position.set(s * 0.105, 0.105, 0.245); brow.rotation.z = Math.PI / 2 + s * 0.18; head.add(brow);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.045, 14), M.cheek); cheek.position.set(s * 0.17, -0.075, 0.228); cheek.rotation.y = s * 0.55; cheek.scale.set(1.2, 0.8, 1); head.add(cheek);
  }
  const nose = part(new THREE.SphereGeometry(0.03, 10, 8), M.skin, head, 0, -0.045, 0.285, 0);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.011, 5, 12, Math.PI), M.mouth);
  mouth.position.set(0, -0.1, 0.262); mouth.rotation.z = Math.PI; mouth.rotation.x = -0.25; head.add(mouth);
  void nose;

  root.scale.setScalar(1.05);

  // ── animation state ──
  const A = {
    phase: 0, amp: 0, runK: 0, lean: 0, cloakBack: 0, lastFoot: 0,
    blinkT: 2.2, blinkDur: 0, lookT: 3.5, look: 0, lookTarget: 0,
    nodT: -1, breath: 0, t: 0,
  };
  const HIP_Y = 0.36;

  function animate(dt, t, motion = {}) {
    A.t = t;
    const speed = Math.max(0, motion.speed || 0);
    const moving = speed > 0.15;
    const runTarget = motion.run && moving ? 1 : 0;
    A.runK += (runTarget - A.runK) * Math.min(1, dt * 8);
    const ampTarget = moving ? Math.min(1, speed / 3.2) : 0;
    A.amp += (ampTarget - A.amp) * Math.min(1, dt * (moving ? 10 : 7));
    // stride length: walk 0.62 per step, run 1.0 per step
    const stride = 0.62 + A.runK * 0.4;
    const prev = A.phase;
    if (moving) A.phase += (speed * dt) / (stride * 2);
    else { const toRest = Math.round(A.phase * 2) / 2; A.phase += (toRest - A.phase) * Math.min(1, dt * 6); }
    // footfalls at phase 0.25 / 0.75 (legs cross)
    if (moving && motion.onStep) {
      const a = Math.floor(prev * 2 + 0.5), b = Math.floor(A.phase * 2 + 0.5);
      if (b !== a) { try { motion.onStep(b % 2 ? 'L' : 'R'); } catch (_) {} }
    }
    const ph = A.phase * TAU, amp = A.amp, rk = A.runK;
    const swing = Math.sin(ph);
    const legAmp = (0.55 + rk * 0.45) * amp, armAmp = (0.5 + rk * 0.35) * amp;
    hips.L.rotation.x = swing * legAmp; hips.R.rotation.x = -swing * legAmp;
    // a little knee lift on the forward leg
    hips.L.position.y = HIP_Y + Math.max(0, Math.sin(ph)) * 0.03 * amp; hips.R.position.y = HIP_Y + Math.max(0, -Math.sin(ph)) * 0.03 * amp;
    shoulders.L.rotation.x = -swing * armAmp - rk * 0.35 * amp; shoulders.R.rotation.x = swing * armAmp - rk * 0.35 * amp;
    shoulders.L.rotation.z = 0.12 + rk * 0.25 * amp; shoulders.R.rotation.z = -0.12 - rk * 0.25 * amp;
    // bob: two dips per cycle; running adds a hop
    const bob = Math.abs(Math.sin(ph)) * (0.035 + rk * 0.06) * amp;
    A.breath += dt;
    const breathe = Math.sin(A.breath * 2.1) * 0.012 * (1 - amp);
    body.position.y = bob + breathe * 0.5;
    const leanTarget = amp * (0.07 + rk * 0.2) + (motion.turn || 0) * 0;
    A.lean += (leanTarget - A.lean) * Math.min(1, dt * 6);
    body.rotation.x = A.lean;
    body.rotation.z = Math.sin(ph) * 0.03 * amp;
    body.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    // the cloak trails behind with speed and flutters when running
    const cloakTarget = -amp * (0.12 + rk * 0.35) - Math.sin(t * 9) * 0.04 * rk * amp;
    A.cloakBack += (cloakTarget - A.cloakBack) * Math.min(1, dt * 5);
    cloakPivot.rotation.x = A.cloakBack;
    cloak.scale.set(1 + amp * 0.03, 1, 0.92 + amp * 0.05 + rk * 0.08 * amp);
    // head: steadies against the bob, glances around when idle
    A.lookT -= dt;
    if (A.lookT <= 0) { A.lookT = 2.5 + ((Math.sin(t * 12.9898) * 43758.5453) % 1 + 1) % 1 * 3.5; A.lookTarget = moving ? 0 : (Math.sin(t * 3.7) * 0.5); }
    if (moving) A.lookTarget = 0;
    A.look += (A.lookTarget - A.look) * Math.min(1, dt * 3);
    headPivot.rotation.y = A.look;
    headPivot.rotation.x = -A.lean * 0.6 + Math.sin(ph * 2) * 0.03 * amp;
    headPivot.position.y = 0.86 - bob * 0.3;
    // blink
    A.blinkT -= dt;
    if (A.blinkT <= 0 && A.blinkDur <= 0) { A.blinkDur = 0.13; A.blinkT = 2.2 + ((Math.sin(t * 78.233) * 43758.5453) % 1 + 1) % 1 * 2.8; }
    let eyeY = 1;
    if (A.blinkDur > 0) { A.blinkDur -= dt; const k = 1 - Math.abs(A.blinkDur / 0.13 * 2 - 1); eyeY = 1 - k * 0.9; }
    for (const e of eyes) e.scale.y = eyeY;
    // nod twice, fast
    if (A.nodT >= 0) {
      A.nodT += dt;
      const k = A.nodT / 0.62;
      if (k >= 1) { A.nodT = -1; head.rotation.x = 0; }
      else head.rotation.x = Math.max(0, Math.sin(k * TAU * 2)) * 0.32;
    }
  }

  return {
    group: root,
    head, eyes,
    animate,
    nod() { A.nodT = 0; },
    blink() { A.blinkT = 0; },
    height: 1.5,
    state() { return { phase: +A.phase.toFixed(3), amp: +A.amp.toFixed(3), run: +A.runK.toFixed(3), blinking: A.blinkDur > 0, nodding: A.nodT >= 0 }; },
  };
}

export default buildPlaceholderHero;
