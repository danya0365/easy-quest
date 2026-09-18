/**
 * companions.js — everyone who walks behind you, the wagon that rattles along at the back, and the monsters
 * waiting in the paddock at home.                              (P17, owner: src/world/companions.js)
 *
 * This is the part of Dragon Quest V a child remembers twenty years later: you are not one boy on a map, you are
 * a little procession. Halvard strides behind you, a Gloop hops after him in its own rhythm, and Papa's wagon
 * comes creaking along at the back with everybody else riding in it.
 *
 * HOW IT WORKS
 *   The hero's path is recorded as a breadcrumb trail (a point every ~0.12 u, with the running arc length). Each
 *   follower is placed at a fixed distance BACK ALONG THAT TRAIL, so they walk where you walked — round the tree,
 *   over the bridge — instead of cutting corners or bumping into you. Nobody collides, nobody ever blocks a door.
 *   Models come from src/art/chars.js (people) and src/art/monsters.js (friends), both loaded lazily; if either is
 *   missing the line simply has fewer walkers in it and the game carries on.
 *
 *   Companions.install(ctx, {Party})    called by src/world/party.js (the P17/P18 plugin entry)
 *   Companions.refresh()                rebuild the line (the roster changed: somebody joined or swapped)
 *   Companions.state()                  -> __DQ.state().companions
 *
 * Talk to the wagon and you get the roster window ("Who walks, who rides?"). Talk to a follower and they say
 * something. The paddock at Hollybank draws whoever the wagon could not hold.
 */
import * as THREE from 'three';
import { Debug, reportError } from '../engine/debug.js';
import { PAL } from '../art/palette.js';
import { makeToon, makeBlobShadows, withOutline, outlineMaterial, OUTLINE } from '../art/toon.js';
import { Sfx } from '../audio/sfx.js';

const guard = (where, fn) => { try { return fn(); } catch (e) { reportError('companions ' + where, e); return undefined; } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

/** How far behind the one in front each kind walks. A Gloop tucks in close; a grown man needs room. */
const GAP = { first: 1.00, person: 0.70, monster: 0.58, wagon: 0.80 };
/** The wagon rides at the side of the path, not in the lens: a cart dead behind you fills the whole frame. */
const WAGON_SIDE = -2.35, WAGON_SCALE = 0.80;
/**
 * CLARITY. A follower directly behind the hero stands between him and the lens and hides him completely — the one
 * thing a six-year-old must always be able to see. So the line is STAGGERED: each walker steps a little to one
 * side of the path, alternating, and drops back to dead centre if that side is inside a wall or off a bridge.
 */
const STAGGER = [1.10, -1.05, 0.78];
const OUTDOOR = { field: 1, world: 1, town: 1 };
const MAX_FOLLOWERS = 3, MAX_PADDOCK_SHOWN = 6;

// ── model libraries, loaded lazily (never block the first frame) ─────────────────────────────────────────────
let CharsLib = null, MonLib = null, charsP = null, monP = null;
function loadChars() {
  if (!charsP) charsP = import('../art/chars.js').then((m) => { CharsLib = m.Chars || m.default || null; return CharsLib; })
    .catch((e) => { reportError('companions: chars.js', e); return null; });
  return charsP;
}
function loadMonsters() {
  if (!monP) monP = import('../art/monsters.js').then((m) => { MonLib = m.Monsters || m.default || null; return MonLib; })
    .catch((e) => { reportError('companions: monsters.js', e); return null; });
  return monP;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the wagon — built from primitives, in the approved toon look
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function buildWagon() {
  const g = new THREE.Group();
  g.name = 'wagon';
  const wood = makeToon({ color: PAL.wood.mid });
  const beam = makeToon({ color: PAL.wood.beam });
  const canvasMat = makeToon({ color: PAL.cloth.cream });
  const iron = makeToon({ color: PAL.wood.grain });
  const ol = outlineMaterial(PAL.outline.prop);

  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.34, 2.10), wood);
  bed.position.y = 0.60; bed.castShadow = true; withOutline(bed, OUTLINE.prop, ol); g.add(bed);

  for (const s of [-1, 1]) {                                   // side boards
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.34, 2.02), beam);
    side.position.set(s * 0.68, 0.76, 0); side.castShadow = true; g.add(side);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.32, 0.10), beam);
  tail.position.set(0, 0.76, 1.03); tail.castShadow = true; g.add(tail);

  // the hood: the TOP half of a tube of canvas laid along the wagon, with three hoops holding it up.
  // (thetaStart -PI/2 + a -PI/2 tilt about X puts the shell over the bed; any other pairing leaves one side open.)
  canvasMat.side = THREE.DoubleSide;
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.70, 1.90, 18, 1, true, -Math.PI / 2, Math.PI), canvasMat);
  hood.rotation.x = -Math.PI / 2;
  hood.position.set(0, 0.90, -0.04); hood.castShadow = true;
  g.add(hood);
  for (const z of [-0.92, 0.0, 0.92]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.705, 0.030, 6, 18, Math.PI), beam);
    hoop.position.set(0, 0.90, z); g.add(hoop);
  }

  // wheels: two big at the back, two small at the front
  const wheels = [];
  const mkWheel = (r) => {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.13, 6, 18), iron);
    withOutline(tyre, OUTLINE.prop * 0.7, ol); w.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.17, r * 0.17, 0.10, 8), beam);
    hub.rotation.x = Math.PI / 2; w.add(hub);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(r * 0.09, r * 1.74, 0.05), beam);
      sp.rotation.z = (i / 6) * Math.PI; w.add(sp);
    }
    return w;
  };
  for (const [x, z, r] of [[-0.70, 0.66, 0.40], [0.70, 0.66, 0.40], [-0.62, -0.78, 0.29], [0.62, -0.78, 0.29]]) {
    const w = mkWheel(r);
    w.position.set(x, r, z);
    g.add(w); wheels.push(w);
  }

  // the shafts Parsnip would be harnessed into
  for (const s of [-1, 1]) {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.20), beam);
    shaft.position.set(s * 0.44, 0.50, -1.44); shaft.rotation.x = -0.10; g.add(shaft);
  }

  const dispose = () => {
    try {
      g.removeFromParent();
      g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
      for (const m of [wood, beam, canvasMat, iron, ol]) m.dispose();
    } catch (e) { reportError('wagon dispose', e); }
  };
  return { group: g, wheels, radius: 0.85, dispose };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the walking line
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function createSystem(ctx, Party) {
  const Field = ctx.Field;
  const S = {
    map: null, scene: null, group: null, blobs: null, gen: 0,
    walkers: [], wagon: null, wagonAt: null, penned: [], trail: [], trailLen: 0,
    head: { x: 0, z: 0, y: 0, yaw: 0, speed: 0, run: false },
    rattle: 0, outdoor: false, props: [], built: 0, t: 0, dirty: false, reject: { solid: 0, drop: 0, ok: 0 },
  };

  /** The screen-lateral unit vector (right of the lens) in world XZ, refreshed once a tick. */
  const LAT = { x: 1, z: 0 };
  function lateral(w) {
    const cam = w && w.camera;
    if (!cam) return LAT;
    const vx = S.head.x - cam.position.x, vz = S.head.z - cam.position.z;
    const len = Math.hypot(vx, vz);
    if (len < 0.2) return LAT;
    LAT.x = -vz / len; LAT.z = vx / len;
    return LAT;
  }

  /** Somewhere a companion may stand: not inside anything, and not off the edge of what you are walking on. */
  function freeSpot(x, z, y) {
    try {
      if (S.map.solidAt(x, z)) { S.reject.solid++; return false; }
      if (Math.abs(S.map.walkY(x, z) - y) > 0.6) { S.reject.drop++; return false; }
      S.reject.ok++;
      return true;
    } catch (e) { return false; }
  }

  const mapDef = () => (S.map && S.map.def) || null;
  const spots = () => { const d = mapDef(); return (d && d.spots) || null; };
  const groundY = (x, z) => { try { return S.map ? S.map.walkY(x, z) : 0; } catch (_) { return 0; } };

  // ── the breadcrumb trail ───────────────────────────────────────────────────────────────────────────────
  function resetTrail(x, y, z, yaw) {
    S.trail.length = 0;
    for (let i = 0; i < 40; i++) {
      S.trail.push({ x: x - Math.sin(yaw) * i * 0.14, z: z - Math.cos(yaw) * i * 0.14, y, yaw, d: i * 0.14 });
    }
  }
  function pushTrail(x, y, z, yaw) {
    const head = S.trail[0];
    if (!head) { resetTrail(x, y, z, yaw); return; }
    const step = Math.hypot(x - head.x, z - head.z);
    if (step < 0.11) { head.y = y; return; }
    for (const p of S.trail) p.d += step;
    S.trail.unshift({ x, y, z, yaw, d: 0 });
    while (S.trail.length > 2 && S.trail[S.trail.length - 1].d > 14) S.trail.pop();
    if (S.trail.length > 220) S.trail.length = 220;
  }
  /** Where the trail is `dist` behind the hero, with the direction of travel there. */
  function sampleTrail(dist) {
    const t = S.trail;
    if (!t.length) return { x: S.head.x, z: S.head.z, y: S.head.y, yaw: S.head.yaw };
    for (let i = 1; i < t.length; i++) {
      if (t[i].d >= dist) {
        const a = t[i - 1], b = t[i];
        const span = b.d - a.d || 1;
        const k = clamp((dist - a.d) / span, 0, 1);
        const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
        return { x, z, y: a.y + (b.y - a.y) * k, yaw: Math.atan2(a.x - b.x, a.z - b.z) };
      }
    }
    const last = t[t.length - 1], prev = t[Math.max(0, t.length - 2)];
    return { x: last.x, z: last.z, y: last.y, yaw: Math.atan2(prev.x - last.x, prev.z - last.z) };
  }

  // ── building the walkers ────────────────────────────────────────────────────────────────────────────────
  function charIdFor(m) {
    const lib = CharsLib;
    const want = m.charId || m.id;
    if (lib && lib.list && lib.list().includes(want)) return want;
    return 'villager';
  }

  function makeWalker(m, kind) {
    const w = { id: m.id, name: m.name, kind, member: m, model: null, holder: new THREE.Group(),
      x: S.head.x, z: S.head.z, y: S.head.y, yaw: S.head.yaw, speed: 0, blob: -1, hop: Math.random() * 6.28 };
    w.holder.name = 'companion:' + m.id;
    try {
      if (kind === 'monster' && MonLib) {
        const mon = MonLib.build(m.species || m.id);
        mon.setMood('friend');
        w.model = mon; w.builtAs = m.species || m.id; w.holder.add(mon.root);
        w.radius = mon.radius || 0.3; w.height = mon.height || 0.55;
      } else if (CharsLib) {
        const id = charIdFor(m);
        const ch = CharsLib.build(id, { age: m.age || (m.id === 'hero' ? 'boy' : undefined) });
        w.model = ch; w.builtAs = id; w.holder.add(ch.root); w.radius = 0.32; w.height = ch.height || 1.6;
      }
    } catch (e) { reportError('companions build ' + m.id, e); }
    if (S.group) S.group.add(w.holder);
    return w;
  }

  /** The talk target for one walker (pushed into the live map's props, so it dies with the map). */
  function addInteractable(w) {
    if (!S.map) return;
    const line = () => {
      const l = LINES[w.kind === 'monster' ? 'monster' : 'person'];
      return l[(S.built + w.id.length) % l.length].replace(/%NAME%/g, w.name);
    };
    const t = { type: 'follower', name: w.name, x: w.x, z: w.z, ix: w.x, iz: w.z, reach: 1.5,
      promptY: w.y + (w.height || 1.2) + 0.45,
      talk: () => ({ text: line(), voice: w.kind === 'monster' ? 'monster' : 'low', name: w.name }) };
    w.target = t;
    S.map.props.push(t);
    S.props.push(t);
  }

  function clearInteractables() {
    if (!S.map) return;
    for (const t of S.props) { const i = S.map.props.indexOf(t); if (i >= 0) S.map.props.splice(i, 1); }
    S.props.length = 0;
  }

  const LINES = {
    person: ['%NAME% gives you a nod. "Lead on."', '"Mind the puddles," says %NAME%.',
      '%NAME% checks over his shoulder, the way he always does.', '"You are walking too fast for an old man."'],
    monster: ['%NAME% goes "…!" and hops twice.', '%NAME% bumps gently into the back of your knee.',
      '%NAME% is very pleased to be here.', '%NAME% looks up at you and wobbles.'],
  };

  // ── spawn / despawn ─────────────────────────────────────────────────────────────────────────────────────
  function despawn() {
    clearInteractables();
    for (const w of S.walkers) guard('dispose walker', () => { if (w.model) w.model.dispose(); w.holder.removeFromParent(); });
    for (const p of S.penned) guard('dispose penned', () => { if (p.model) p.model.dispose(); p.holder.removeFromParent(); });
    if (S.wagon) guard('dispose wagon', () => S.wagon.dispose());
    if (S.blobs) guard('blobs', () => S.blobs.mesh.removeFromParent());
    if (S.group) guard('group', () => S.group.removeFromParent());
    S.walkers = []; S.penned = []; S.wagon = null; S.wagonAt = null; S.wagonProp = null;
    S.blobs = null; S.group = null; S.map = null; S.scene = null; S.trail.length = 0;
  }

  function spawn(map, scene) {
    despawn();
    S.map = map; S.scene = scene;
    S.gen++;
    const gen = S.gen;
    S.group = new THREE.Group(); S.group.name = 'companions';
    scene.add(S.group);
    const kind = String(map.kind || 'field');
    S.outdoor = !!OUTDOOR[kind];
    const w = guard('world', () => Field && Field.world());
    const p = w && w.player ? w.player.p : null;
    S.head = { x: p ? p.x : 0, z: p ? p.z : 0, y: p ? p.y : 0, yaw: p ? p.yaw : 0, speed: 0, run: false };
    resetTrail(S.head.x, S.head.y, S.head.z, S.head.yaw);

    const need = build();
    const waits = [];
    if (need.chars) waits.push(loadChars());
    if (need.monsters) waits.push(loadMonsters());
    if (waits.length) Promise.all(waits).then(() => { if (gen === S.gen) guard('rebuild', () => build()); });
  }

  /** (Re)build the line from the roster. Safe to call whenever the roster changes. */
  function build() {
    if (!S.group || !S.map) return { chars: false, monsters: false };
    clearInteractables();
    for (const w of S.walkers) guard('dispose walker', () => { if (w.model) w.model.dispose(); w.holder.removeFromParent(); });
    for (const p of S.penned) guard('dispose penned', () => { if (p.model) p.model.dispose(); p.holder.removeFromParent(); });
    // the wagon and the shadow mesh are rebuilt too: keeping the old ones left a second, stranded wagon standing
    // in the field every time somebody joined (and a spare InstancedMesh with it).
    const wasAt = S.wagonAt;
    if (S.wagon) guard('dispose wagon', () => S.wagon.dispose());
    if (S.blobs) guard('dispose blobs', () => S.blobs.mesh.removeFromParent());
    S.walkers = []; S.penned = []; S.wagon = null; S.wagonAt = null; S.wagonProp = null; S.blobs = null;

    const party = guard('members', () => Party.members()) || [];
    const line = party.filter((m) => m && !Party.isLeader(m)).slice(0, MAX_FOLLOWERS);
    const need = { chars: line.some((m) => m.kind !== 'monster'), monsters: line.some((m) => m.kind === 'monster') };

    let dist = GAP.first;
    line.forEach((m, i) => {
      const w = makeWalker(m, m.kind === 'monster' ? 'monster' : 'person');
      w.gap = dist;
      w.side = STAGGER[i % STAGGER.length] * (m.kind === 'monster' ? 0.85 : 1);
      dist += (m.kind === 'monster' ? GAP.monster : GAP.person);
      S.walkers.push(w);
      addInteractable(w);
    });

    // the wagon: rattling along at the back outdoors, parked at its spot in the village
    const sp = spots();
    const riders = () => (guard('wagonList', () => Party.wagonList()) || []).length;
    const wantWagon = S.outdoor || !!(sp && sp.wagon);
    if (wantWagon) {
      S.wagon = buildWagon();
      S.wagon.group.scale.setScalar(WAGON_SCALE);
      S.group.add(S.wagon.group);
      if (sp && sp.wagon && !(S.map.kind === 'field' || S.map.kind === 'world')) {
        S.wagonAt = { x: sp.wagon.x, z: sp.wagon.z, yaw: sp.wagon.facing || 0, parked: true };
      } else {
        // keep where it already was across a rebuild, so it does not jump to the hero's feet when somebody joins
        S.wagonAt = { x: (wasAt && !wasAt.parked ? wasAt.x : S.head.x), z: (wasAt && !wasAt.parked ? wasAt.z : S.head.z),
          yaw: (wasAt && !wasAt.parked ? wasAt.yaw : S.head.yaw), parked: false, gap: GAP.wagon, side: WAGON_SIDE };
      }
      const t = { type: 'wagon', name: "the wagon", x: S.wagonAt.x, z: S.wagonAt.z, ix: S.wagonAt.x, iz: S.wagonAt.z,
        reach: 2.0, promptY: 2.2,
        talk: () => {
          const n = riders();
          return { voice: 'narrator', name: 'the wagon',
            text: `The wagon creaks companionably.{n}${n ? `${n} riding inside, out of the rain.` : 'Room in there for everybody.'}`,
            onClose: () => guard('wagon menu', () => Party.wagonMenu()) };
        } };
      S.map.props.push(t); S.props.push(t);
      S.wagonProp = t;
    }

    // the paddock at home: whoever the wagon cannot hold, hopping about in the fenced field
    if (sp && sp.paddock) {
      const pad = (guard('paddock', () => Party.paddock()) || []).slice(0, MAX_PADDOCK_SHOWN);
      if (pad.length) need.monsters = true;
      pad.forEach((m, i) => {
        if (m.kind !== 'monster' || !MonLib) return;
        const a = (i / Math.max(1, pad.length)) * Math.PI * 2;
        const r = (sp.paddock.r || 3) * 0.55;
        const w = makeWalker(m, 'monster');
        w.x = sp.paddock.x + Math.cos(a) * r; w.z = sp.paddock.z + Math.sin(a) * r;
        w.y = groundY(w.x, w.z); w.yaw = a + Math.PI;
        w.holder.position.set(w.x, w.y, w.z); w.holder.rotation.y = w.yaw;
        S.penned.push(w);
      });
    }

    const n = S.walkers.length + S.penned.length + 2;
    S.blobs = makeBlobShadows(Math.max(4, n), { opacity: 0.5 });
    S.group.add(S.blobs.mesh);
    S.built++;
    return need;
  }

  // ── per tick ────────────────────────────────────────────────────────────────────────────────────────────
  function update(dt, top) {
    if (!S.map || !S.group) return;
    // the roster changed since the last tick: rebuild the line once, not once per member
    if (S.dirty) { S.dirty = false; guard('rebuild', () => build()); }
    const w = guard('world', () => Field && Field.world());
    const p = w && w.player ? w.player.p : null;
    if (!p) return;
    S.head.x = p.x; S.head.y = p.y; S.head.z = p.z; S.head.yaw = p.yaw;
    S.head.speed = p.speed || 0; S.head.run = !!p.run;
    if (top !== false) pushTrail(p.x, p.y, p.z, p.yaw);

    // The stagger is measured ACROSS THE SCREEN, not across the path: the one thing that must never happen is a
    // grown man standing between the lens and a six-year-old. Perpendicular to (camera -> hero) in the XZ plane.
    lateral(w);

    for (const wk of S.walkers) {
      const s = sampleTrail(wk.gap);
      // step to one side — as far as there is room for. A wall, a tree or the edge of a bridge shortens the step.
      if (wk.side) {
        for (const f of [1, 0.66, 0.33]) {
          const sx = s.x + LAT.x * wk.side * f, sz = s.z + LAT.z * wk.side * f;
          if (freeSpot(sx, sz, s.y)) { s.x = sx; s.z = sz; wk.sideNow = wk.side * f; break; }
          wk.sideNow = 0;
        }
      }
      const dx = s.x - wk.x, dz = s.z - wk.z;
      const d = Math.hypot(dx, dz);
      wk.speed = d / Math.max(dt, 1e-3);
      const k = d > 0.001 ? Math.min(1, dt * 14) : 0;
      wk.x += dx * k; wk.z += dz * k;
      wk.y = groundY(wk.x, wk.z);
      if (d > 0.04) wk.yaw += wrapPi(s.yaw - wk.yaw) * Math.min(1, dt * 9);
      if (wk.target) { wk.target.x = wk.target.ix = wk.x; wk.target.z = wk.target.iz = wk.z; wk.target.promptY = wk.y + (wk.height || 1.2) + 0.45; }
    }

    if (S.wagon && S.wagonAt && !S.wagonAt.parked) {
      const s = sampleTrail(S.wagonAt.gap);
      if (S.wagonAt.side) {
        for (const f of [1, 0.7, 0.4]) {
          const sx = s.x + LAT.x * S.wagonAt.side * f, sz = s.z + LAT.z * S.wagonAt.side * f;
          if (freeSpot(sx, sz, s.y)) { s.x = sx; s.z = sz; break; }
        }
      }
      const dx = s.x - S.wagonAt.x, dz = s.z - S.wagonAt.z;
      const d = Math.hypot(dx, dz);
      const k = d > 0.001 ? Math.min(1, dt * 10) : 0;
      S.wagonAt.x += dx * k; S.wagonAt.z += dz * k;
      S.wagonAt.speed = d / Math.max(dt, 1e-3);
      if (d > 0.04) S.wagonAt.yaw += wrapPi(s.yaw - S.wagonAt.yaw) * Math.min(1, dt * 7);
      if (S.wagonProp) { S.wagonProp.x = S.wagonProp.ix = S.wagonAt.x; S.wagonProp.z = S.wagonProp.iz = S.wagonAt.z; }
      // the wagon has a voice: boards, wheels and harness, quietly, while it rolls
      S.rattle -= dt;
      if (S.wagonAt.speed > 1.2 && S.rattle <= 0) { S.rattle = 2.4; guard('rattle', () => Sfx.play('wagon_rattle', { vol: 0.13, pitch: 0.94 })); }
    }
  }

  function render(alpha, dt, t) {
    if (!S.group || !S.map) return;
    S.t = t;
    let bi = 0;
    for (const wk of S.walkers) {
      const y = wk.y;
      wk.holder.position.set(wk.x, y, wk.z);
      if (wk.kind === 'monster') {
        wk.holder.rotation.y = wk.yaw;
        guard('mon update', () => wk.model && wk.model.update(dt));
      } else if (wk.model) {
        guard('char update', () => {
          wk.model.setFacing(wk.yaw);
          wk.model.setMove(wk.speed, { run: wk.speed > 4.4 });
          wk.model.update(dt);
        });
      }
      if (S.blobs && bi < S.blobs.capacity) S.blobs.set(bi++, wk.x, y, wk.z, wk.kind === 'monster' ? 0.5 : 0.95);
    }
    for (const pn of S.penned) {
      guard('penned update', () => pn.model && pn.model.update(dt));
      if (S.blobs && bi < S.blobs.capacity) S.blobs.set(bi++, pn.x, pn.y, pn.z, 0.5);
    }
    if (S.wagon && S.wagonAt) {
      const y = groundY(S.wagonAt.x, S.wagonAt.z);
      const bounce = S.wagonAt.parked ? 0 : Math.sin(t * 9) * 0.012 * Math.min(1, (S.wagonAt.speed || 0) / 3);
      S.wagon.group.position.set(S.wagonAt.x, y + bounce, S.wagonAt.z);
      S.wagon.group.rotation.y = S.wagonAt.yaw;
      const roll = (S.wagonAt.speed || 0) * dt;
      for (const wheel of S.wagon.wheels) wheel.rotation.x -= roll / 0.4;
      if (S.blobs && bi < S.blobs.capacity) S.blobs.set(bi++, S.wagonAt.x, y, S.wagonAt.z, 1.5, 0.8);
    }
    if (S.blobs) { for (let i = bi; i < S.blobs.capacity; i++) S.blobs.hide(i); S.blobs.commit(); }
  }

  function describe() {
    return {
      map: S.map ? S.map.id : null,
      followers: S.walkers.map((w) => ({ id: w.id, name: w.name, kind: w.kind,
        x: +w.x.toFixed(2), z: +w.z.toFixed(2), y: +w.y.toFixed(2), gap: w.gap, model: !!w.model,
        builtAs: w.builtAs || null, visible: !!(w.model && w.holder.visible), side: w.side, sideNow: w.sideNow ?? null,
        behind: +Math.hypot(w.x - S.head.x, w.z - S.head.z).toFixed(2) })),
      wagon: S.wagonAt ? { x: +S.wagonAt.x.toFixed(2), z: +S.wagonAt.z.toFixed(2), parked: !!S.wagonAt.parked,
        riders: (guard('riders', () => Party.wagonList().length)) || 0 } : null,
      paddock: S.penned.map((p) => ({ id: p.id, name: p.name, x: +p.x.toFixed(2), z: +p.z.toFixed(2) })),
      trail: S.trail.length, builds: S.built, outdoor: S.outdoor, lat: [+LAT.x.toFixed(2), +LAT.z.toFixed(2)],
      reject: Object.assign({}, S.reject),
    };
  }

  return { spawn, despawn, update, render, describe,
    rebuild() { if (!S.map) return false; S.dirty = true; return true; },
    rebuildNow: () => guard('rebuild', () => build()) };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// public
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
let SYS = null;

export const Companions = {
  /** Rebuild the walking line — call after anything changes who is in the party. */
  refresh() { if (SYS) SYS.rebuild(); return !!SYS; },
  state() { return SYS ? SYS.describe() : null; },

  install(ctx = {}, { Party = null } = {}) {
    const Field = ctx.Field;
    if (!Field || typeof Field.on !== 'function') { reportError('companions install', new Error('no Field in the plugin context')); return null; }
    if (!Party) { reportError('companions install', new Error('no Party')); return null; }
    if (SYS) return Companions;
    SYS = createSystem(ctx, Party);
    Field.on('load', ({ map, scene }) => guard('load', () => SYS.spawn(map, scene)));
    Field.on('unload', () => guard('unload', () => SYS.despawn()));
    Field.on('update', (dt, o) => guard('update', () => SYS.update(dt, o && o.top)));
    Field.on('render', (alpha, dt, t) => guard('render', () => SYS.render(alpha, dt, t)));

    const D = ctx.Debug || Debug;
    D.provide('companions', () => Companions.state());
    D.expose('companions', () => Companions.state());
    D.expose('followers', () => (Companions.state() || {}).followers || []);
    return Companions;
  },
};

export default Companions;
