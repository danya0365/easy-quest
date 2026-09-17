/**
 * npc.js — NPC life: the people and animals of a map, built, placed, idling, working, wandering, and turning to
 * face you when you speak to them.                                                  (P11, owner: src/world/npc.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx). Who stands where and what they say lives in the map
 * layer files src/world/maps/<id>.npcs.js (also P11); the words themselves run through src/ui/dialogue.js (P12).
 *
 * ── A person in the people layer ─────────────────────────────────────────────────────────────────────────────
 *   {
 *     id: 'hob', name: 'Old Hob',            // `name` is the dialogue name tab
 *     char: 'villager', variant: 'farmer',   // src/art/chars.js (hero halvard willow sera barty villager)
 *     animal: 'cat' | 'dog' | 'hen' | 'duck', tint?: 'ginger'|'grey'|'tan'|'brown'|'white'|'speckled',
 *     monster: 'cactuddle',                  // ...or a monster from src/art/monsters.js (the potted Cactuddle)
 *     x, z, y?, facing?: degrees (0 = +z / south, 90 = east, 180 = north), voice?: dialogue.js voice, scale?,
 *     idle: 'stand',                         // stand wander sweep fish chat tag chase lean sit sell perch (below)
 *     with?: 'otherId',                      // chat partner · chase target · tag partner
 *     radius?: 2.5,                          // how far they roam / work from their spot
 *     look?: [x, z],                         // what they face while standing
 *     when?: cond,                           // only spawn when this story condition holds (dialogue.js conditions)
 *     schedule?: [{from: 6, to: 12, at: [x, z], idle?, facing?}],   // a simple day, by __DQ.timeOfDay()
 *     script?: ...,                          // the conversation (see src/ui/dialogue.js "SCRIPT")
 *     text? | line?: 'key',                  // ...or plain words, straight from the map's `lines`
 *     solid?: false,                         // people are solid (you cannot walk through them) unless this says no
 *     prop?: 'broom' | 'rod',                // a working prop in their hands
 *     water?: y, cast?: units,               // a fisher's water level and how far out the float lands
 *     pot?: true, y?: offset,                // stood in a pot (or on a wall): y lifts them off the ground
 *     it?: true, home?: [x, z],              // who is It in a game of tag · where they go when the day ends
 *   }
 *
 * ── Behaviours (the `idle` field) ────────────────────────────────────────────────────────────────────────────
 *   stand   stays put, glances about, looks at you when you come near, waves if `wave: true`
 *   wander  strolls to spots within `radius`, pausing; never onto water, a bridge or a doorway
 *   sweep   sweeps a doorstep with a broom, stepping sideways along it
 *   fish    stands at the water with a rod; the float dips; sometimes a fish, mostly a boot
 *   chat    faces `with` and takes turns talking; both turn to you when you speak to either
 *   tag     two children (`with`) chase each other round their spot and swap who is It
 *   chase   runs after `with` (a cat) until it bolts again
 *   lean    leans on a well or a fence, dozing off now and then
 *   sit     sits (on a bench, a step, a wall)
 *   sell    stands by their stall and waves you over when you pass
 *   perch   sits on a wall and does not come down (a cat)
 *   Animals: a cat grooms, strolls and bolts · a dog trots along with you for a while, then sits and goes home ·
 *   hens peck and scatter · a duck waddles. All of them can be talked to.
 *
 * ── How it plugs in (no shared-file edits) ───────────────────────────────────────────────────────────────────
 *   Field.on('load')   builds everyone for the new map (Chars.build, animals here), gives each map.npcs entry a
 *                      talk() the field's confirm can reach, and a live x/z so the ▼ prompt follows them
 *   Field.on('update') the 60 Hz simulation; Field.on('render') interpolates, animates and does the LOD
 *   Bus dialogue.say / dialogue.typing / dialogue.cue / dialogue.end   drive the talking mouth, emotes and nods
 *   __DQ.state().npcs · __DQ.npcs() · __DQ.talkTo(id) · __DQ.npcGo(id, x, z, hold?) · __DQ.npcModel(id) ·
 *   __DQ.npcsShow(false) (hide everyone: before-and-after shots, and to measure what they cost)
 *
 * Draw-call budget: a person is 2-3 meshes (+1 shadow pass near the camera), an animal 2. Outlines drop past 18
 * units, faces past 26, sun shadows past 14, and anybody past 55 units is hidden; everyone gets a blob shadow.
 * The ten of Puddlewick Vale cost about 32k triangles and 17 draw calls in the opening frame (measured with
 * __DQ.npcsShow).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, mixHex, scaleHex } from '../art/palette.js';
import { makeToon, outlineMaterial, hullGeometry, makeBlobShadows, OUTLINE } from '../art/toon.js';
import { Assets } from '../engine/assets.js';
import { Debug, reportError } from '../engine/debug.js';
import { Bus } from '../engine/events.js';
import { Scenes } from '../engine/states.js';
import { STR } from '../data/strings.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const r3 = (v) => Math.round(v * 1000) / 1000;
const lerp = (a, b, t) => a + (b - a) * t;

/** The clips a monster model understands (src/art/monsters.js); anything else is a person's clip. */
const MONSTER_CLIPS = new Set(['idle', 'attack', 'cast', 'hurt', 'defeat', 'join', 'taunt']);

// walking speeds (units / second)
const SPEED = { stroll: 1.15, work: 0.42, kid: 2.3, cat: 1.2, catRun: 3.6, dog: 2.6, hen: 0.75, duck: 0.6 };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. animals — one skinned toon mesh + its outline hull, rigid-bound to a few bones (2 draw calls each)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const COL = {
  ginger: mixHex(PAL.char.carrot, PAL.wood.light, 0.3),
  gingerDark: mixHex(PAL.char.carrot, PAL.wood.dark, 0.45),
  cream: mixHex(PAL.cloth.cream, PAL.char.carrot, 0.12),
  dog: mixHex(PAL.wood.light, PAL.thatch.pale, 0.45),
  dogDark: mixHex(PAL.wood.mid, PAL.wood.dark, 0.35),
  nose: mixHex(PAL.char.hair, PAL.flower.pink, 0.35),
  eye: PAL.char.eye,
  white: PAL.animal.duck,
  comb: PAL.cloth.red,
  beak: PAL.animal.beak,
  wood: PAL.wood.mid,
  straw: PAL.thatch.mid,
  pot: PAL.tile.mid,
  soil: PAL.dirt.dark,
};

const MAT = {
  toon: () => Assets.material('npc:animal', () => { const m = makeToon({ vertexColors: true }, 'character'); m.name = 'npc:animal'; return m; }),
  hull: () => outlineMaterial(PAL.outline.char),
  prop: () => Assets.material('npc:prop', () => { const m = makeToon({ vertexColors: true }, 'wood'); m.name = 'npc:prop'; return m; }),
};

const MX = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

/** A geometry ready to merge: non-indexed, position/normal/uv + vertex colour + rigid skin weights for one bone. */
function part(geo, color, matrix, bone = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (matrix) g.applyMatrix4(matrix);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count, c = C3(color);
  const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    si[i * 4] = bone; sw[i * 4] = 1;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

/** Coats: `tint` on an animal entry picks one (cats: ginger grey · dogs: tan brown · birds: white brown). */
const COATS = {
  ginger: { body: COL.ginger, dark: COL.gingerDark, pale: COL.cream },
  grey: { body: mixHex(PAL.stone.mid, PAL.cloud.shade, 0.35), dark: mixHex(PAL.stone.dark, PAL.char.hair, 0.3), pale: PAL.cloud.lit },
  tan: { body: COL.dog, dark: COL.dogDark, pale: PAL.cloth.cream },
  brown: { body: mixHex(PAL.wood.mid, PAL.dirt.base, 0.4), dark: PAL.wood.dark, pale: PAL.thatch.pale },
  white: { body: COL.white, dark: mixHex(COL.white, PAL.stone.mid, 0.4), pale: PAL.cloth.cream },
  speckled: { body: mixHex(COL.white, PAL.wood.light, 0.3), dark: PAL.wood.dark, pale: PAL.cloth.cream },
};
const coatOf = (tint, fallback) => COATS[tint] || COATS[fallback];

/** Build one animal look (geometry is cached and shared by every instance of that animal + coat). */
function animalLook(kind, tint) {
  return Assets.memo('other', `npc:animal:${kind}:${tint || '-'}`, () => {
    const bones = [{ name: 'root', parent: null, at: [0, 0, 0] }];
    const B = (name, parent, at) => { bones.push({ name, parent, at }); return bones.length - 1; };
    const parts = [];
    // Rigid skinning works in BIND-POSE ROOT SPACE (as in chars.js), so a part written relative to its own bone is
    // moved out to where that bone stands in the rest pose. Every `add` below can then be read bone-locally.
    const add = (bone, geo, color, matrix) => {
      const at = bones[bone] ? bones[bone].at : [0, 0, 0];
      const m = new THREE.Matrix4().makeTranslation(at[0], at[1], at[2]);
      if (matrix) m.multiply(matrix);
      parts.push(part(geo, color, m, bone));
    };
    const ell = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
    let height = 0.4, radius = 0.25, headAt = [0, 0.3, 0.2];

    if (kind === 'cat' || kind === 'dog') {
      // Chunky, round, readable from across the vale: legs long enough to see daylight under them, ears and tail up.
      const dog = kind === 'dog';
      const C = coatOf(tint, dog ? 'tan' : 'ginger');
      const body = C.body, dark = C.dark, pale = C.pale;
      const hipY = dog ? 0.34 : 0.3, leg = dog ? 0.28 : 0.25, br = dog ? 0.175 : 0.15;
      const headY = hipY + (dog ? 0.28 : 0.25), headZ = dog ? 0.26 : 0.23, hr = dog ? 0.2 : 0.175;
      const iBody = B('body', 'root', [0, hipY, 0]);
      const iHead = B('head', 'body', [0, headY, headZ]);
      const iTail = B('tail', 'body', [0, hipY + 0.03, -br * 1.35]);
      const iLegA = B('legA', 'body', [0, hipY, 0]);     // front-left + back-right (a diagonal pair)
      const iLegB = B('legB', 'body', [0, hipY, 0]);
      // body: chest, haunches, a pale belly
      add(iBody, ell(br, 10, 8), body, MX(0, 0, 0.02, 1.02, 0.96, 1.3));
      add(iBody, ell(br * 0.95, 9, 7), body, MX(0, 0.02, -br * 0.8, 1.08, 1.06, 1.0));
      add(iBody, ell(br * 0.82, 9, 7), pale, MX(0, -br * 0.5, 0.03, 0.92, 0.5, 1.2));
      if (!dog) for (const z of [-0.12, 0.02, 0.15]) add(iBody, ell(br * 0.55, 7, 5), dark, MX(0, br * 0.6, z, 1.25, 0.42, 0.26));   // tabby
      if (dog) add(iBody, ell(br * 0.62, 8, 6), dark, MX(0.02, br * 0.5, -br * 0.5, 1.15, 0.5, 1.0));                              // a patch
      // head, muzzle, nose, eyes, ears
      add(iHead, ell(hr, 10, 8), body, MX(0, 0, 0, 1.04, 0.96, 1));
      add(iHead, ell(hr * 0.62, 8, 6), pale, MX(0, -hr * 0.34, hr * 0.7, 0.86, 0.7, dog ? 1.7 : 1.05));
      add(iHead, ell(hr * 0.24, 6, 5), COL.nose, MX(0, -hr * 0.2, hr * (dog ? 1.5 : 1.12), 1, 0.8, 0.8));
      for (const s of [1, -1]) {
        if (dog) add(iHead, ell(hr * 0.52, 6, 5), dark, MX(s * hr * 0.8, hr * 0.12, -0.01, 0.4, 1.6, 0.95, 0, 0, s * 0.28));        // floppy ear
        else add(iHead, new THREE.ConeGeometry(hr * 0.5, hr * 1.15, 5), body, MX(s * hr * 0.58, hr * 0.95, -0.005, 1, 1, 0.5, -0.1, 0, s * 0.26));
        add(iHead, ell(hr * 0.3, 8, 6), PAL.char.white, MX(s * hr * 0.42, hr * 0.16, hr * 0.74, 1, 1.15, 0.7));
        add(iHead, ell(hr * 0.17, 6, 5), COL.eye, MX(s * hr * 0.44, hr * 0.16, hr * 0.9, 0.9, 1.5, 0.7));
      }
      // tail, up (a cat's curls, a dog's wags)
      const tl = dog ? 0.28 : 0.36;
      add(iTail, new THREE.CylinderGeometry(br * 0.26, br * 0.16, tl, 6), body, MX(0, tl * 0.42, -0.02, 1, 1, 1, dog ? -0.45 : -0.28));
      add(iTail, ell(br * 0.22, 6, 5), dog ? pale : dark, MX(0, tl * 0.94, -tl * (dog ? 0.25 : 0.16)));
      // legs (one mesh per diagonal pair, swinging about the body's hip line)
      const lx = br * 0.52, lz = br * 0.7;
      for (const [bone, x, z] of [[iLegA, lx, lz], [iLegB, -lx, lz], [iLegB, lx, -lz], [iLegA, -lx, -lz]]) {
        add(bone, new THREE.CylinderGeometry(br * 0.22, br * 0.18, leg, 6), body, MX(x, -leg * 0.5, z));
        add(bone, ell(br * 0.26, 6, 5), pale, MX(x, -leg, z + 0.015, 1, 0.55, 1.25));
      }
      height = headY + hr * 1.5; radius = br; headAt = [0, headY, headZ];
    } else if (kind === 'hen' || kind === 'duck') {
      const duck = kind === 'duck';
      const C = coatOf(tint, 'white');
      const body = C.body, dark = C.dark;
      // every `at` below is in ROOT space (the bone's own position is worked out from its parent's)
      const br = duck ? 0.17 : 0.175, bodyY = duck ? 0.26 : 0.3, leg = duck ? 0.14 : 0.19;
      const iBody = B('body', 'root', [0, bodyY, 0]);
      const iHead = B('head', 'body', [0, bodyY + br * (duck ? 0.85 : 1.0), duck ? 0.07 : 0.05]);
      const iTail = B('tail', 'body', [0, bodyY + br * 0.25, -br * 0.8]);
      const iLegA = B('legA', 'body', [br * 0.3, bodyY - br * 0.55, 0]);
      const iLegB = B('legB', 'body', [-br * 0.3, bodyY - br * 0.55, 0]);
      const wingL = B('wingL', 'body', [br * 0.7, bodyY + 0.02, 0]);
      const wingR = B('wingR', 'body', [-br * 0.7, bodyY + 0.02, 0]);
      add(iBody, ell(br, 10, 8), body, MX(0, 0, 0, 0.94, 1.0, duck ? 1.3 : 1.08));
      const hr = duck ? 0.105 : 0.115;
      add(iHead, ell(hr, 9, 7), body, MX(0, 0, 0, 1, 1, 1));
      if (duck) add(iHead, ell(hr * 0.5, 7, 5), COL.beak, MX(0, -0.012, hr * 0.92, 1.15, 0.45, 1.6));
      else {
        add(iHead, new THREE.ConeGeometry(hr * 0.36, hr * 1.05, 5), COL.beak, MX(0, -0.012, hr * 0.85, 1, 1, 1, -1.35));
        for (const t of [-0.3, 0, 0.3]) add(iHead, ell(hr * 0.3, 6, 5), COL.comb, MX(0, hr * (0.9 - Math.abs(t) * 0.5), t * hr * 0.7, 0.3, 1.05, 0.8));   // a proper comb
        add(iHead, ell(hr * 0.26, 6, 5), COL.comb, MX(0, -hr * 0.62, hr * 0.5, 0.4, 1.0, 0.6));     // wattle
      }
      for (const s of [1, -1]) {
        add(iHead, ell(hr * 0.28, 8, 6), PAL.char.white, MX(s * hr * 0.48, hr * 0.2, hr * 0.6, 1, 1, 0.7));
        add(iHead, ell(hr * 0.16, 6, 5), COL.eye, MX(s * hr * 0.5, hr * 0.2, hr * 0.74, 1, 1.3, 0.7));
      }
      add(iTail, new THREE.ConeGeometry(br * 0.46, br * 0.95, 6), dark, MX(0, br * 0.22, -0.02, 1, 1, 0.55, duck ? -0.7 : -1.15));
      add(wingL, ell(br * 0.52, 7, 6), dark, MX(br * 0.3, 0, 0, 0.4, 0.92, 1.18));
      add(wingR, ell(br * 0.52, 7, 6), dark, MX(-br * 0.3, 0, 0, 0.4, 0.92, 1.18));
      for (const bone of [iLegA, iLegB]) {
        add(bone, new THREE.CylinderGeometry(0.014, 0.014, leg, 5), COL.beak, MX(0, -leg * 0.5, 0));
        add(bone, ell(0.034, 6, 4), COL.beak, MX(0, -leg, 0.022, 1, 0.25, 1.5));
      }
      height = bodyY + br * (duck ? 1.9 : 2.3); radius = br * 0.9; headAt = [0, bodyY + br * 1.0, 0.05];
    }

    const geo = mergeGeometries(parts);
    geo.userData.shared = true;
    for (const p of parts) p.dispose();
    const hull = hullGeometry(geo, OUTLINE.slime * 0.75);
    hull.userData.shared = true;
    return { geo, hull, bones, height, radius, headAt };
  });
}

/** An animal instance with the same small interface as a Chars character. */
function buildAnimal(kind, tint) {
  const look = animalLook(kind, tint);
  const root = new THREE.Group();
  root.name = 'npc:' + kind;
  const boneByName = {};
  const list = [];
  for (const j of look.bones) {
    const b = new THREE.Bone();
    b.name = j.name;
    const p = j.parent ? boneByName[j.parent] : null;
    const at = j.at, pat = j.parent ? look.bones.find(x => x.name === j.parent).at : [0, 0, 0];
    b.position.set(at[0] - pat[0], at[1] - pat[1], at[2] - pat[2]);
    (p || root).add(b);
    boneByName[j.name] = b;
    list.push(b);
  }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);
  const ident = new THREE.Matrix4();
  const mk = (geo, mat, name) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.name = name; m.bind(skeleton, ident);
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, look.height * 0.5, 0), look.height * 2.2);
    m.castShadow = false; m.receiveShadow = false;
    root.add(m);
    return m;
  };
  const body = mk(look.geo, MAT.toon(), 'body');
  const hull = mk(look.hull, MAT.hull(), 'outline');
  hull.userData.isOutline = true;
  const meshes = [body, hull];
  const rest = {};
  for (const [n, b] of Object.entries(boneByName)) rest[n] = { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z, py: b.position.y };

  const A = { yaw: root.rotation.y, yawT: root.rotation.y, speed: 0, cmd: 0, phase: 0, t: 0, look: null, act: null, actT: 0, seed: Math.random() * 10 };
  const tmp = new THREE.Vector3();
  const api = {
    kind: 'animal', animal: kind, root, height: look.height, radius: look.radius, meshes, bones: boneByName,
    setFacing(rad, instant) { if (!Number.isFinite(rad)) return; A.yawT = A.yaw + wrapPi(rad - A.yaw); if (instant) { A.yaw = A.yawT; root.rotation.y = A.yaw; } },
    get facing() { return A.yaw; },
    setMove(speed) { A.cmd = Math.max(0, +speed || 0); },
    play(name) { if (name === 'idle') { A.act = null; return true; } A.act = String(name); A.actT = 0; return true; },
    stop() { A.act = null; },
    emote() { return false; },
    lookAt(v) { A.look = v ? (A.look || new THREE.Vector3()).copy(v) : null; },
    update(dt) {
      try {
        A.t += dt;
        const t = A.t, s = A.seed;
        A.yaw += wrapPi(A.yawT - A.yaw) * Math.min(1, dt * 7);
        root.rotation.y = A.yaw;
        A.speed += (A.cmd - A.speed) * Math.min(1, dt * 8);
        const moving = A.speed > 0.06;
        A.phase += dt * (moving ? (2.2 + A.speed * 1.5) : 0);
        if (A.act) A.actT += dt;
        const b = boneByName;
        const bird = kind === 'hen' || kind === 'duck';
        // body: breathing, the bob of the walk, a little rock
        const breathe = Math.sin(t * 2.4 + s) * 0.012;
        const bob = moving ? Math.abs(Math.sin(A.phase)) * (bird ? 0.022 : 0.026) : 0;
        if (b.body) {
          b.body.position.y = rest.body.py + bob + breathe * 0.4;
          b.body.rotation.x = rest.body.x + (moving ? Math.sin(A.phase * 2) * 0.05 : Math.sin(t * 1.1 + s) * 0.012);
          b.body.scale.setScalar(1 + breathe * 0.5);
        }
        // legs
        const swing = moving ? Math.sin(A.phase) * (bird ? 0.75 : 0.55) : 0;
        if (b.legA) b.legA.rotation.x = rest.legA.x + swing;
        if (b.legB) b.legB.rotation.x = rest.legB.x - swing;
        // head: look at what we were told to, plus a sniff or a peck
        if (b.head) {
          let yaw = 0, pitch = 0;
          if (A.look) {
            tmp.copy(A.look);
            root.worldToLocal(tmp);
            yaw = clamp(Math.atan2(tmp.x, tmp.z), -1.1, 1.1);
            pitch = clamp(-Math.atan2(tmp.y - look.headAt[1], Math.max(0.2, Math.hypot(tmp.x, tmp.z))), -0.7, 0.7);
          } else {
            yaw = Math.sin(t * 0.7 + s) * 0.35;
            pitch = bird ? 0.5 + Math.max(0, Math.sin(t * 3.1 + s)) * 0.55 : Math.sin(t * 0.9 + s * 2) * 0.12;
          }
          if (A.act === 'peck') pitch = 1.1;
          if (A.act === 'groom') { yaw = 0.9; pitch = 0.8 + Math.sin(t * 9) * 0.25; }
          b.head.rotation.y = lerp(b.head.rotation.y, yaw, Math.min(1, dt * 7));
          b.head.rotation.x = lerp(b.head.rotation.x, rest.head.x + pitch, Math.min(1, dt * 7));
        }
        // tail: a dog wags, a cat swishes slowly, a bird bobs
        if (b.tail) {
          const wagK = A.act === 'wag' ? 1 : (moving ? 0.55 : 0.2);
          b.tail.rotation.y = Math.sin(t * (kind === 'dog' ? 11 : 3.1) + s) * (kind === 'dog' ? 0.55 * wagK : 0.3);
          b.tail.rotation.x = rest.tail.x + (kind === 'cat' ? Math.sin(t * 1.7 + s) * 0.12 : 0) - (A.act === 'wag' ? 0.2 : 0);
        }
        if (b.wingL && b.wingR) {
          const flap = A.act === 'flap' ? Math.max(0, 1 - A.actT / 0.9) : 0;
          const f = flap * (0.6 + Math.sin(A.actT * 26) * 0.7) + (moving ? Math.abs(Math.sin(A.phase)) * 0.12 : 0);
          b.wingL.rotation.z = rest.wingL.z - f;
          b.wingR.rotation.z = rest.wingR.z + f;
        }
        if (A.act === 'flap' && A.actT > 1) A.act = null;
        if (A.act === 'peck' && A.actT > 0.5) A.act = null;
      } catch (e) { reportError('npc animal update', e); }
    },
    state() { return { animal: kind, speed: r3(A.speed), act: A.act, facing: r3(A.yaw) }; },
    attach() { return false; },
    dispose() { try { root.removeFromParent(); skeleton.dispose(); } catch (e) { reportError('npc animal dispose', e); } },
  };
  return api;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. working props (a broom, a fishing rod with a float) — merged toon geometry, one draw call each
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function propMesh(kind) {
  const geo = Assets.geometry('npc:prop:' + kind, () => {
    const g = [];
    if (kind === 'broom') {
      g.push(part(new THREE.CylinderGeometry(0.018, 0.015, 0.92, 6), COL.wood, MX(0, 0, 0)));
      g.push(part(new THREE.CylinderGeometry(0.085, 0.055, 0.2, 7), COL.straw, MX(0, -0.53, 0)));
      g.push(part(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 7), scaleHex(COL.wood, 0.8), MX(0, -0.41, 0)));
    } else if (kind === 'rod') {
      g.push(part(new THREE.CylinderGeometry(0.016, 0.005, 1.5, 6), COL.wood, MX(0, 0, 0)));
      g.push(part(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6), PAL.cloth.leather, MX(0, -0.6, 0)));
    } else if (kind === 'float') {
      g.push(part(new THREE.SphereGeometry(0.05, 8, 6), PAL.cloth.red, MX(0, 0, 0)));
      g.push(part(new THREE.CylinderGeometry(0.009, 0.009, 0.14, 5), PAL.plaster.light, MX(0, 0.08, 0)));
    } else if (kind === 'line') {
      g.push(part(new THREE.CylinderGeometry(0.006, 0.006, 1, 4), PAL.plaster.light, MX(0, 0.5, 0)));
    } else if (kind === 'pot') {
      g.push(part(new THREE.CylinderGeometry(0.26, 0.18, 0.34, 12), COL.pot, MX(0, 0.17, 0)));
      g.push(part(new THREE.TorusGeometry(0.26, 0.028, 4, 14), scaleHex(COL.pot, 0.86), MX(0, 0.33, 0, 1, 1, 1, Math.PI / 2)));
      g.push(part(new THREE.CylinderGeometry(0.225, 0.225, 0.04, 10), COL.soil, MX(0, 0.32, 0)));
    }
    const merged = mergeGeometries(g);
    for (const x of g) x.dispose();
    merged.userData.shared = true;
    return merged;
  });
  const m = new THREE.Mesh(geo, MAT.prop());
  m.name = 'npc:' + kind;
  m.castShadow = false; m.receiveShadow = false;
  return m;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. the people system
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
let CharsLib = null, charsPromise = null;
function loadChars() {
  if (!charsPromise) {
    charsPromise = import('../art/chars.js')
      .then((m) => { CharsLib = (m && (m.Chars || m.default)) || null; return CharsLib; })
      .catch((e) => { reportError('npc: src/art/chars.js did not load (nobody will be built)', e); return null; });
  }
  return charsPromise;
}
let MonstersLib = null, monstersPromise = null;
function loadMonsters() {
  if (!monstersPromise) {
    monstersPromise = import('../art/monsters.js')
      .then((m) => { MonstersLib = (m && (m.Monsters || m.default)) || null; return MonstersLib; })
      .catch((e) => { reportError('npc: src/art/monsters.js did not load', e); return null; });
  }
  return monstersPromise;
}

function createSystem(ctx) {
  const { Field, reportError: err = reportError } = ctx;
  const S = {
    map: null, scene: null, group: null, blobs: null, player: null, list: [], byId: new Map(), doors: [],
    time: 0, hours: 9, hourT: 0, talkingWith: null, speakerId: null, cam: null, camZoom: null, camOrbit: null, built: 0, gen: 0,
  };
  const AWAY = { away: true };
  const talks = new Map();      // "map/id" -> how many times the player has talked to them
  const rnd = (() => { let s = 20260918; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
  const range = (a, b) => a + (b - a) * rnd();

  const DQ = () => (typeof window !== 'undefined' && window.__DQ) || null;
  const hourNow = () => { try { const h = DQ() && DQ().timeOfDay(); return Number.isFinite(+h) ? +h : S.hours; } catch (_) { return S.hours; } };
  const condOk = (c) => { if (c == null) return true; try { return DlgCond ? DlgCond(c, condApi) : true; } catch (e) { err('npc cond', e); return true; } };
  let DlgCond = null;
  const condApi = {
    flag: (k, v) => { try { const q = DQ(); return q ? (v === undefined ? q.flag(k) : q.flag(k, v)) : null; } catch (_) { return null; } },
    gold: () => { try { const s = DQ() && DQ().state(); return s ? +s.gold || 0 : 0; } catch (_) { return 0; } },
    hour: hourNow, act: () => (condApi.flag('ch3.start') ? 3 : condApi.flag('ch2.start') ? 2 : 1), talks: 0, npc: null, vars: {}, who: () => null,
  };
  import('../ui/dialogue.js').then((m) => { DlgCond = m.cond || null; }).catch(() => {});

  // ── where somebody may stand ──────────────────────────────────────────────────────────────────────────────
  /** Can somebody stand here at all? (`roam` also keeps them out of doorways, which is only for wandering.) */
  function noGo(x, z, roam = true) {
    const m = S.map; if (!m) return true;
    if (!m.inBounds(x, z)) return true;
    const g = m.groundAt(x, z);
    if (g === 'water' || g === 'wood') return true;             // never in the Beck, never on the footbridge
    if (roam) for (const d of S.doors) if (Math.hypot(x - d.x, z - d.z) < (d.r || 2.1)) return true;
    return !m.clear(x, z, 0.45);
  }
  /** The nearest spot to (x, z) somebody can actually stand on (an authored spot may be a doorstep on purpose). */
  function settle(x, z, spread = 3) {
    if (!noGo(x, z, false)) return { x, z, moved: 0 };
    for (let r = 0.4; r <= spread; r += 0.4) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + r;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (!noGo(px, pz, false)) return { x: px, z: pz, moved: r };
      }
    }
    return { x, z, moved: -1 };
  }
  function pathClear(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 0.5));
    for (let i = 1; i <= n; i++) { const t = i / n; if (noGo(lerp(x0, x1, t), lerp(z0, z1, t))) return false; }
    return true;
  }
  function pickSpot(n, radius = n.radius) {
    for (let i = 0; i < 14; i++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * radius;
      const x = n.anchor.x + Math.cos(a) * r, z = n.anchor.z + Math.sin(a) * r;
      if (noGo(x, z) || !pathClear(n.x, n.z, x, z)) continue;
      let clash = false;
      for (const o of S.list) if (o !== n && !o.hidden && Math.hypot(o.x - x, o.z - z) < 0.9) clash = true;
      if (clash) continue;
      return { x, z };
    }
    return null;
  }

  // ── build ─────────────────────────────────────────────────────────────────────────────────────────────────
  function modelFor(def) {
    try {
      if (def.animal) return buildAnimal(String(def.animal), def.tint);
      if (def.monster) {
        if (!MonstersLib) { loadMonsters(); return null; }
        const mo = MonstersLib.build(def.monster);
        const root = new THREE.Group();
        root.add(mo.root);
        return {
          kind: 'monster', root, height: mo.height || 0.6, radius: mo.radius || 0.3, meshes: [],
          setFacing(rad, instant) { if (Number.isFinite(rad)) { if (instant) root.rotation.y = rad; else root.rotation.y += wrapPi(rad - root.rotation.y) * 0.2; } },
          get facing() { return root.rotation.y; },
          setMove() {},
          // monsters know their own small set of clips; 'talk' and 'nod' are people things, so they are ignored
          play(clip) { if (!MONSTER_CLIPS.has(String(clip))) return false; try { mo.play(clip); } catch (e) { err('npc monster play', e); } return true; },
          stop() {}, emote() { return false; }, lookAt() {},
          update(dt) { try { mo.update(dt); } catch (e) { err('npc monster update', e); } },
          state() { return { monster: def.monster }; }, attach() { return false; },
          dispose() { try { mo.dispose(); root.removeFromParent(); } catch (e) { err('npc monster dispose', e); } },
        };
      }
      if (!CharsLib) return null;
      const ch = CharsLib.build(def.char || 'villager', { variant: def.variant, age: def.age, act: def.act, facing: (def.facing || 0) * DEG });
      return {
        kind: 'person', root: ch.root, height: ch.height, radius: 0.3, meshes: ch.meshes || [], character: ch,
        setFacing: (rad, instant) => ch.setFacing(rad, instant),
        get facing() { return ch.facing; },
        setMove: (sp, o) => ch.setMove(sp, o), play: (clip, o) => ch.play(clip, o), stop: (f) => ch.stop(f),
        emote: (e2, d) => ch.emote(e2, d), lookAt: (v) => ch.lookAt(v), update: (dt) => ch.update(dt),
        state: () => ch.state(), attach: (o, b) => ch.attach(o, b), dispose: () => ch.dispose(),
      };
    } catch (e) { err('npc model ' + (def.id || def.char), e); return null; }
  }

  function spawnOne(def, index) {
    const at = settle(+def.x || 0, +def.z || 0);
    const n = {
      def, id: String(def.id || def.char || 'npc' + index), index,
      kind: def.animal ? 'animal' : def.monster ? 'monster' : 'person',
      x: at.x, z: at.z, y: 0, px: at.x, pz: at.z, py: 0, moved: at.moved,
      anchor: { x: at.x, z: at.z }, radius: Number.isFinite(+def.radius) ? +def.radius : (def.idle === 'wander' ? 2.6 : 1.2),
      yaw: (Number.isFinite(+def.facing) ? +def.facing : 0) * DEG, yawPrev: 0, speed: 0, wantSpeed: 0, run: false,
      behaviour: String(def.idle || (def.animal ? def.animal : 'stand')),
      mode: 'idle', timer: range(0.4, 2.4), target: null, model: null, prop: null, extra: null,
      talking: false, talkT: 0, hidden: false, lod: 'near', animT: 0, stuck: 0, blob: index + 1,
      collider: null, look: def.look ? { x: +def.look[0], z: +def.look[1] } : null,
      waveT: 0, bite: range(6, 14), act: null, yOff: Number.isFinite(+def.y) ? +def.y : 0,
      flee: 0, biting: 0, linger: 0, glance: 0, shove: 0, follow: 0, followCd: 0, sweepSide: 1,
      it: !!def.it, chatTurn: false, animFrame: false, goingHome: false, slot: null, run: false,
    };
    n.yawPrev = n.yaw;
    n.model = modelFor(def);
    if (n.model) attachModel(n);
    // the map entry the field talks to: keep it in step with where this person actually is
    def.ix = n.x; def.iz = n.z;
    def.reach = Number.isFinite(+def.reach) ? +def.reach : (n.kind === 'person' ? 2.0 : 1.7);
    def.talk = () => { beginTalk(n); return null; };
    if (def.solid !== false && n.kind !== 'animal' && S.map) {
      try { n.collider = S.map.addCollider({ type: 'circle', x: n.x, z: n.z, r: n.kind === 'monster' ? 0.32 : 0.3, tag: 'npc' }); } catch (e) { err('npc collider', e); }
    }
    return n;
  }

  function attachModel(n) {
    const m = n.model;
    if (!m || !S.group) return;
    S.group.add(m.root);
    m.root.position.set(n.x, n.y, n.z);
    m.setFacing(n.yaw, true);
    if (Number.isFinite(+n.def.scale) && +n.def.scale !== 1) m.root.scale.setScalar(+n.def.scale);
    if (n.def.prop === 'broom' || n.behaviour === 'sweep') {
      n.prop = propMesh('broom');
      n.prop.position.set(0.24, 0.5, 0.3);
      n.prop.rotation.set(-0.78, 0, -0.3);                 // leaning forward, bristles on the ground in front
      m.root.add(n.prop);
    } else if (n.def.prop === 'rod' || n.behaviour === 'fish') {
      n.prop = propMesh('rod');
      n.prop.position.set(0.2, 0.74, 0.22);
      n.prop.rotation.set(-1.12, 0, 0.16);                 // held across him, tip up and out over the water
      m.root.add(n.prop);
      const float = propMesh('float');
      const line = propMesh('line');
      const waterY = Number.isFinite(+n.def.water) ? +n.def.water : (S.map ? S.map.walkY(n.x, n.z) : 0);
      S.group.add(float); S.group.add(line);
      n.extra = { float, line, waterY, dip: 0, cast: Number.isFinite(+n.def.cast) ? +n.def.cast : 2.6 };
    }
    if (n.def.pot) {
      const pot = propMesh('pot');
      n.yOff = (n.yOff || 0) + 0.3;                       // stood in a pot on the green (the Cactuddle)
      n.extra = Object.assign({ pot }, n.extra || {});
      S.group.add(pot);
      pot.position.set(n.x, S.map ? S.map.walkY(n.x, n.z) : 0, n.z);
    }
  }

  function spawn(map, scene) {
    despawn();
    S.map = map; S.scene = scene;
    S.gen++;
    const gen = S.gen;
    S.group = new THREE.Group();
    S.group.name = 'npcs';
    scene.add(S.group);
    S.doors = [];
    try {
      for (const p of map.props || []) if (p.type === 'door' || /door/i.test(String(p.name || ''))) S.doors.push({ x: p.x, z: p.z, r: 2.1 });
      for (const e of map.exits || []) if (e.kind === 'door' || e.kind === 'stairs') S.doors.push({ x: e.x, z: e.z, r: 2.0 });
    } catch (e) { err('npc doors', e); }
    const defs = (map.npcs || []).filter(d => d && condOk(d.when));
    const build = () => {
      if (gen !== S.gen || !S.map) return;
      S.blobs = makeBlobShadows(Math.max(4, defs.length + 2), { opacity: 0.5 });
      S.group.add(S.blobs.mesh);
      defs.forEach((d, i) => {
        const n = spawnOne(d, i);
        S.list.push(n);
        S.byId.set(n.id, n);
      });
      S.built = S.list.length;
      const w = Field.world();
      S.player = w ? w.player : null;
      S.cam = w ? w.cameraRig : null;
      applySchedules(true);
    };
    const needChars = defs.some(d => !d.animal && !d.monster);
    const needMonsters = defs.some(d => d.monster);
    const waits = [];
    if (needChars) waits.push(loadChars());
    if (needMonsters) waits.push(loadMonsters());
    if (waits.length) Promise.all(waits).then(() => { try { build(); } catch (e) { err('npc spawn', e); } });
    else { try { build(); } catch (e) { err('npc spawn', e); } }
  }

  function despawn() {
    for (const n of S.list) {
      try {
        if (n.model) n.model.dispose();
        if (n.prop) n.prop.removeFromParent();
        if (n.extra && n.extra.float) n.extra.float.removeFromParent();
        if (n.extra && n.extra.line) n.extra.line.removeFromParent();
        if (n.extra && n.extra.pot) n.extra.pot.removeFromParent();
        if (n.def) { delete n.def.talk; delete n.def.ix; delete n.def.iz; delete n.def.promptY; }
      } catch (e) { err('npc despawn', e); }
    }
    if (S.blobs) { try { S.blobs.mesh.removeFromParent(); } catch (_) {} }
    if (S.group) { try { S.group.removeFromParent(); } catch (_) {} }
    S.list = []; S.byId = new Map(); S.group = null; S.blobs = null; S.map = null; S.scene = null;
    S.talkingWith = null; S.speakerId = null;
    S.doors = [];
  }

  // ── talking ───────────────────────────────────────────────────────────────────────────────────────────────
  const talkKey = (n) => (S.map ? S.map.id : '?') + '/' + n.id;
  function beginTalk(n) {
    try {
      const p = S.player ? S.player.p : null;
      const key = talkKey(n);
      const count = talks.get(key) || 0;
      // everyone within earshot turns to look; the one you spoke to turns to face you
      for (const o of S.list) if (o !== n && !o.hidden && Math.hypot(o.x - n.x, o.z - n.z) < 4.5) o.glance = 2.4;
      n.talking = true; n.talkT = 0;
      if (p) n.yaw = Math.atan2(p.x - n.x, p.z - n.z);
      const partner = n.def.with ? S.byId.get(n.def.with) : null;
      if (partner && (n.behaviour === 'chat' || partner.behaviour === 'chat')) {
        partner.talking = true; partner.talkT = 0;
        if (p) partner.yaw = Math.atan2(p.x - partner.x, p.z - partner.z);
      }
      S.talkingWith = n;
      easeCamera(n);
      const script = n.def.script ?? n.def.pages ?? n.def.text ?? STR['talk.nothing'];
      if (!Scenes.has('dialogue')) {                       // no P12 scene (a bare demo page): say it the field's way
        if (ctx.Field && typeof ctx.Field.talk === 'function') ctx.Field.talk({ text: script, name: n.def.name || n.id, voice: n.def.voice });
        n.talking = false;
        return;
      }
      Scenes.push('dialogue', {
        script,
        name: n.def.name || null,
        speaker: n.def.name || n.id,
        nameplate: n.def.nameplate,
        voice: n.def.voice || (n.kind === 'person' ? 'high' : 'monster:1.3'),
        npc: n.id,
        talks: count,
        who: (id) => { const o = S.byId.get(id); return o ? { name: o.def.name || null, voice: o.def.voice || 'high' } : null; },
        onClose: () => endTalk(n, count),
      });
    } catch (e) { err('npc beginTalk', e); }
  }
  function endTalk(n, count) {
    try {
      talks.set(talkKey(n), count + 1);
      n.talking = false; n.linger = 1.6; n.glance = 2.2; n.act = null;
      const partner = n.def.with ? S.byId.get(n.def.with) : null;
      if (partner) { partner.talking = false; partner.linger = 1.2; partner.act = null; }
      S.talkingWith = null; S.speakerId = null;
      restoreCamera();
    } catch (e) { err('npc endTalk', e); }
  }

  /** A small DQ camera beat: a gentle push in, and a nudge round if the person is hidden behind the hero. */
  function easeCamera(n) {
    try {
      const rig = S.cam, p = S.player ? S.player.p : null;
      if (!rig || !p || S.camZoom != null) return;
      S.camZoom = rig.zoom();
      rig.zoom(Math.max(4.2, S.camZoom * 0.88));
      const toN = Math.atan2(n.x - p.x, n.z - p.z);
      const camDir = rig.orbit() * DEG;                      // the direction the lens sits in, from the hero
      const off = wrapPi(toN - (camDir + Math.PI));          // 0 = straight away from the lens (hidden behind the hero)
      if (Math.abs(off) < 26 * DEG) { S.camOrbit = rig.orbit(); rig.orbit((S.camOrbit + (off >= 0 ? -15 : 15) + 360) % 360); }
    } catch (e) { err('npc camera ease', e); }
  }
  function restoreCamera() {
    try {
      if (S.cam && S.camZoom != null) S.cam.zoom(S.camZoom);
      if (S.cam && S.camOrbit != null) S.cam.orbit(S.camOrbit);
    } catch (e) { err('npc camera restore', e); }
    S.camZoom = null; S.camOrbit = null;
  }

  // ── schedules ─────────────────────────────────────────────────────────────────────────────────────────────
  function slotFor(n, h) {
    const sch = n.def.schedule;
    if (!Array.isArray(sch) || !sch.length) return null;
    for (const s of sch) {
      const a = +s.from, b = +s.to;
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a <= b ? (h >= a && h < b) : (h >= a || h < b)) return s;
    }
    return AWAY;
  }
  function applySchedules(instant = false) {
    const h = hourNow();
    for (const n of S.list) {
      const slot = slotFor(n, h);
      if (!slot) continue;
      if (n.slot === slot) continue;
      n.slot = slot;
      if (slot.away) { n.goingHome = true; continue; }
      n.goingHome = false;
      if (slot.idle) n.behaviour = String(slot.idle);
      else n.behaviour = String(n.def.idle || (n.def.animal ? n.def.animal : 'stand'));
      if (Number.isFinite(+slot.facing)) n.yaw = +slot.facing * DEG;
      if (Array.isArray(slot.at)) {
        const at = settle(+slot.at[0], +slot.at[1]);
        n.anchor = { x: at.x, z: at.z };
        if (instant || n.hidden) { place(n, at.x, at.z); n.hidden = false; showModel(n, true); }
        else { n.target = { x: at.x, z: at.z }; n.mode = 'walk'; }
      }
      n.timer = 0.2;
    }
  }
  function place(n, x, z) {
    n.x = n.px = x; n.z = n.pz = z;
    if (n.collider) moveCollider(n);
    if (n.model) n.model.root.position.set(x, n.y, z);
  }
  function showModel(n, on) {
    if (!n.model) return;
    n.model.root.visible = !!on;
    if (n.extra && n.extra.float) n.extra.float.visible = !!on;
    if (n.extra && n.extra.line) n.extra.line.visible = !!on;
    if (n.extra && n.extra.pot) n.extra.pot.visible = !!on;
  }
  function moveCollider(n) {
    const c = n.collider; if (!c) return;
    c.x = n.x; c.z = n.z;
    c.bound = [n.x - c.r, n.z - c.r, n.x + c.r, n.z + c.r];
  }

  // ── movement ──────────────────────────────────────────────────────────────────────────────────────────────
  function stepTo(n, tx, tz, speed, dt) {
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    if (d < 0.12) { n.wantSpeed = 0; return true; }
    const want = Math.min(speed, d * 2.6 + 0.25);
    n.yaw = Math.atan2(dx, dz);
    const step = want * dt;
    const c = n.collider;
    if (c) { c.bound = [1e9, 1e9, 1e9, 1e9]; }                      // never collide with yourself
    let moved = 0;
    try {
      const r = S.map.move(n.x, n.z, (dx / d) * step, (dz / d) * step, 0.3, 0.2);
      moved = Math.hypot(r.x - n.x, r.z - n.z);
      n.x = r.x; n.z = r.z;
    } catch (e) { err('npc move', e); }
    if (c) moveCollider(n);
    n.wantSpeed = moved > step * 0.25 ? want : 0;
    n.stuck = moved < step * 0.25 ? n.stuck + dt : 0;
    if (n.stuck > 0.7) { n.stuck = 0; return true; }                // give up on this spot and pick another
    return false;
  }

  // ── behaviours ────────────────────────────────────────────────────────────────────────────────────────────
  const BEHAVE = {
    stand(n, dt) {
      n.wantSpeed = 0;
      if (n.look) n.yaw = Math.atan2(n.look.x - n.x, n.look.z - n.z);
      else if (Number.isFinite(+n.def.facing)) n.yaw = +n.def.facing * DEG;
      n.timer -= dt;
      if (n.timer <= 0) {
        n.timer = range(3.5, 9);
        if (n.model && rnd() < 0.25) n.model.emote(rnd() < 0.5 ? 'music' : 'happy', 1.6);
      }
    },
    lean(n, dt) {
      BEHAVE.stand(n, dt);
      if (n.timer > 5 && n.model && rnd() < 0.004) n.model.emote('sleepy', 2.6);
    },
    sit(n, dt) {
      n.wantSpeed = 0;
      if (n.model && n.act !== 'sit' && !n.talking) { n.model.play('sit'); n.act = 'sit'; }
      BEHAVE.stand(n, dt);
    },
    sell(n, dt) {
      BEHAVE.stand(n, dt);
      const p = S.player ? S.player.p : null;
      if (!p) return;
      const d = Math.hypot(p.x - n.x, p.z - n.z);
      n.waveT -= dt;
      if (d < 4.2 && n.waveT <= 0 && !n.talking) { n.waveT = 9; if (n.model) n.model.play('wave'); }
    },
    wander(n, dt) {
      n.timer -= dt;
      if (n.mode === 'idle') {
        n.wantSpeed = 0;
        if (n.look && n.timer > 0.6) n.yaw = Math.atan2(n.look.x - n.x, n.look.z - n.z);
        if (n.timer <= 0) {
          const spot = pickSpot(n);
          if (spot) { n.target = spot; n.mode = 'walk'; } else n.timer = range(1.5, 3);
        }
      } else {
        const speed = n.kind === 'animal' ? SPEED[n.def.animal] || SPEED.cat : SPEED.stroll;
        if (stepTo(n, n.target.x, n.target.z, speed, dt)) { n.mode = 'idle'; n.timer = range(2.5, 7); }
      }
    },
    sweep(n, dt) {
      // stay facing the step and shuffle sideways along it, the broom swinging
      const dir = (Number.isFinite(+n.def.facing) ? +n.def.facing : 0) * DEG;
      n.yaw = dir;
      n.timer -= dt;
      const span = Math.min(1.1, n.radius);
      if (n.timer <= 0) { n.timer = range(1.6, 3.2); n.sweepSide = (n.sweepSide || 1) * -1; }
      const side = n.sweepSide || 1;
      const tx = n.anchor.x + Math.cos(dir) * span * side * 0.5, tz = n.anchor.z - Math.sin(dir) * span * side * 0.5;
      stepTo(n, tx, tz, SPEED.work, dt);
      n.yaw = dir;
      if (n.prop) {
        const s = Math.sin(S.time * 3.2);
        n.prop.rotation.z = -0.3 + s * 0.4;
        n.prop.rotation.x = -0.78 - Math.abs(s) * 0.06;
        n.prop.position.x = 0.24 + s * 0.12;
        n.prop.position.z = 0.3 + Math.abs(s) * 0.05;
      }
    },
    fish(n, dt) {
      n.wantSpeed = 0;
      if (n.look) n.yaw = Math.atan2(n.look.x - n.x, n.look.z - n.z);
      else if (Number.isFinite(+n.def.facing)) n.yaw = +n.def.facing * DEG;
      const e = n.extra;
      n.bite -= dt;
      if (e && e.float) {
        if (n.bite <= 0 && !n.biting) { n.biting = 1.4; n.bite = range(9, 17); if (n.model) n.model.emote('surprised', 1.2); }
        if (n.biting > 0) {
          n.biting -= dt;
          e.dip = 0.12;
          if (n.biting <= 0) {
            if (n.model) n.model.emote(rnd() < 0.35 ? 'happy' : 'sad', 2);
            e.dip = 0;
          }
        }
      }
      if (n.prop) {
        n.prop.rotation.x = -1.12 + (n.biting > 0 ? 0.3 : 0) + Math.sin(S.time * 0.8) * 0.035;
        n.prop.rotation.z = 0.16;
      }
    },
    chat(n, dt) {
      const o = S.byId.get(n.def.with);
      if (!o || o.hidden) { BEHAVE.stand(n, dt); return; }
      n.wantSpeed = 0;
      n.yaw = Math.atan2(o.x - n.x, o.z - n.z);
      n.timer -= dt;
      if (n.timer <= 0) {
        n.timer = range(2.6, 4.6);
        const mine = (n.chatTurn = !n.chatTurn);
        if (n.model && !n.talking) {
          if (mine) n.model.play('talk');
          else { n.model.stop(0.3); if (rnd() < 0.5) n.model.play('nod'); else if (rnd() < 0.3) n.model.emote('happy', 1.6); }
        }
      }
    },
    tag(n, dt) {
      const o = S.byId.get(n.def.with);
      if (!o) { BEHAVE.wander(n, dt); return; }
      const d = Math.hypot(o.x - n.x, o.z - n.z);
      if (n.it) {
        if (d < 0.8) {
          n.it = false; o.it = true; n.timer = 1.1; o.timer = 1.1;
          if (n.model) n.model.play('celebrate');
          if (o.model) o.model.emote('surprised', 1.2);
          return;
        }
        if (n.timer > 0) { n.timer -= dt; n.wantSpeed = 0; return; }
        stepTo(n, o.x, o.z, SPEED.kid, dt);
        n.run = true;
      } else {
        if (n.timer > 0) { n.timer -= dt; n.wantSpeed = 0; n.yaw = Math.atan2(o.x - n.x, o.z - n.z); return; }
        if (!n.target || Math.hypot(n.target.x - n.x, n.target.z - n.z) < 0.5 || d < 1.6) {
          const away = Math.atan2(n.x - o.x, n.z - o.z) + range(-0.8, 0.8);
          const tx = n.anchor.x + Math.sin(away) * n.radius * range(0.5, 1), tz = n.anchor.z + Math.cos(away) * n.radius * range(0.5, 1);
          const at = noGo(tx, tz) ? pickSpot(n) : { x: tx, z: tz };
          n.target = at || n.anchor;
        }
        stepTo(n, n.target.x, n.target.z, SPEED.kid * 0.92, dt);
        n.run = true;
      }
    },
    chase(n, dt) {
      const o = S.byId.get(n.def.with);
      if (!o) { BEHAVE.wander(n, dt); return; }
      const d = Math.hypot(o.x - n.x, o.z - n.z);
      if (d < 1.0) {
        n.wantSpeed = 0;
        n.yaw = Math.atan2(o.x - n.x, o.z - n.z);
        o.flee = 3.2;
        if (n.timer <= 0) { n.timer = 2.4; if (n.model) { n.model.emote('happy', 1.4); n.model.play('celebrate'); } }
        n.timer -= dt;
        return;
      }
      if (Math.hypot(o.x - n.anchor.x, o.z - n.anchor.z) > n.radius * 1.6) {
        // it has gone too far: give up, hands on hips, and wait for it to come back
        n.wantSpeed = 0;
        n.yaw = Math.atan2(o.x - n.x, o.z - n.z);
        return;
      }
      stepTo(n, o.x, o.z, SPEED.kid, dt);
      n.run = true;
    },
    perch(n, dt) {
      n.wantSpeed = 0;
      n.timer -= dt;
      if (n.model) n.model.lookAt(null);
      if (n.timer <= 0) { n.timer = range(4, 9); if (n.model) n.model.play(rnd() < 0.5 ? 'groom' : 'idle'); }
    },
    cat(n, dt) {
      const p = S.player ? S.player.p : null;
      if (n.flee > 0) {
        n.flee -= dt;
        if (!n.target || Math.hypot(n.target.x - n.x, n.target.z - n.z) < 0.4) {
          const spot = pickSpot(n, n.radius * 1.1);
          n.target = spot || n.anchor;
        }
        if (stepTo(n, n.target.x, n.target.z, SPEED.catRun, dt)) n.flee = 0;
        n.run = true;
        if (n.model) n.model.play('idle');
        return;
      }
      if (p && Math.hypot(p.x - n.x, p.z - n.z) < 1.25 && p.speed > 2.6) { n.flee = 2; return; }
      n.timer -= dt;
      if (n.mode === 'idle') {
        n.wantSpeed = 0;
        if (n.timer <= 0) {
          if (rnd() < 0.45) { if (n.model) n.model.play('groom'); n.timer = range(2.5, 5); }
          else { const spot = pickSpot(n); if (spot) { n.target = spot; n.mode = 'walk'; if (n.model) n.model.play('idle'); } else n.timer = range(1.5, 3); }
        }
      } else if (stepTo(n, n.target.x, n.target.z, SPEED.cat, dt)) { n.mode = 'idle'; n.timer = range(2.5, 6); }
    },
    dog(n, dt) {
      const p = S.player ? S.player.p : null;
      n.timer -= dt;
      n.followCd = Math.max(0, (n.followCd || 0) - dt);
      if (n.mode === 'follow') {
        n.follow -= dt;
        const d = p ? Math.hypot(p.x - n.x, p.z - n.z) : 99;
        const far = p ? Math.hypot(p.x - n.anchor.x, p.z - n.anchor.z) : 99;
        if (n.follow <= 0 || far > 13 || !p) {
          n.mode = 'home'; n.target = { x: n.anchor.x, z: n.anchor.z }; n.followCd = 18;
          if (n.model) n.model.play('idle');
          return;
        }
        if (d > 1.7) { stepTo(n, p.x - Math.sin(p.yaw) * 1.3, p.z - Math.cos(p.yaw) * 1.3, Math.max(SPEED.dog, p.speed + 0.4), dt); }
        else { n.wantSpeed = 0; n.yaw = Math.atan2(p.x - n.x, p.z - n.z); if (n.model) n.model.play('wag'); }
        return;
      }
      if (n.mode === 'home') {
        if (stepTo(n, n.target.x, n.target.z, SPEED.dog * 0.8, dt)) { n.mode = 'idle'; n.timer = range(1.5, 4); }
        return;
      }
      if (p && n.followCd <= 0 && Math.hypot(p.x - n.x, p.z - n.z) < 5.5 && p.speed > 0.8) {
        n.mode = 'follow'; n.follow = range(10, 16);
        if (n.model) { n.model.play('wag'); }
        return;
      }
      if (n.mode === 'idle') {
        n.wantSpeed = 0;
        if (p && Math.hypot(p.x - n.x, p.z - n.z) < 6) n.yaw = Math.atan2(p.x - n.x, p.z - n.z);
        if (n.timer <= 0) {
          const spot = pickSpot(n);
          if (spot) { n.target = spot; n.mode = 'walk'; } else n.timer = range(2, 4);
        }
      } else if (stepTo(n, n.target.x, n.target.z, SPEED.dog * 0.6, dt)) { n.mode = 'idle'; n.timer = range(2.5, 6); }
    },
    hen(n, dt) {
      const p = S.player ? S.player.p : null;
      n.timer -= dt;
      if (p && Math.hypot(p.x - n.x, p.z - n.z) < 1.7 && p.speed > 2.4 && n.flee <= 0) {
        n.flee = 1.4;
        if (n.model) n.model.play('flap');
        const away = Math.atan2(n.x - p.x, n.z - p.z);
        n.target = { x: n.x + Math.sin(away) * 1.6, z: n.z + Math.cos(away) * 1.6 };
        if (noGo(n.target.x, n.target.z)) n.target = pickSpot(n) || n.anchor;
        n.mode = 'walk';
      }
      if (n.flee > 0) { n.flee -= dt; if (stepTo(n, n.target.x, n.target.z, SPEED.hen * 2.6, dt)) { n.flee = 0; n.mode = 'idle'; n.timer = 1; } return; }
      if (n.mode === 'idle') {
        n.wantSpeed = 0;
        if (n.timer <= 0) {
          if (rnd() < 0.55) { if (n.model) n.model.play('peck'); n.timer = range(0.7, 1.8); }
          else { const spot = pickSpot(n, Math.min(1.4, n.radius)); if (spot) { n.target = spot; n.mode = 'walk'; } else n.timer = 1; }
        }
      } else if (stepTo(n, n.target.x, n.target.z, SPEED.hen, dt)) { n.mode = 'idle'; n.timer = range(0.6, 2); }
    },
    duck(n, dt) { BEHAVE.hen(n, dt); },
  };

  // ── the tick ──────────────────────────────────────────────────────────────────────────────────────────────
  function update(dt, top) {
    if (!S.map || !S.list.length) return;
    S.time += dt;
    S.hourT += dt;
    if (S.hourT > 0.75) { S.hourT = 0; applySchedules(false); }
    const p = S.player ? S.player.p : null;
    for (const n of S.list) {
      n.px = n.x; n.pz = n.z; n.yawPrev = n.yaw;
      n.run = false;
      if (n.linger > 0) n.linger -= dt;
      if (n.glance > 0) n.glance -= dt;
      try {
        if (n.goingHome) {
          // walk to their spot, then step indoors (out of sight) until the schedule brings them back
          if (!n.hidden) {
            const home = n.def.home ? { x: +n.def.home[0], z: +n.def.home[1] } : n.anchor;
            if (stepTo(n, home.x, home.z, SPEED.stroll, dt)) { n.hidden = true; showModel(n, false); if (n.collider) { n.collider.bound = [1e9, 1e9, 1e9, 1e9]; } }
          }
          continue;
        }
        if (n.talking) {
          n.talkT += dt;
          n.wantSpeed = 0;
          if (p) n.yaw = Math.atan2(p.x - n.x, p.z - n.z);
        } else if (n.linger > 0 && p) {
          n.wantSpeed = 0;
          n.yaw = Math.atan2(p.x - n.x, p.z - n.z);
        } else {
          const fn = BEHAVE[n.behaviour] || BEHAVE.stand;
          fn(n, dt);
        }
        // a person you are pushing against steps out of the way (nobody can trap a six-year-old)
        if (p && n.collider && !n.talking) {
          const d = Math.hypot(p.x - n.x, p.z - n.z);
          if (d < 0.85 && p.speed > 0.6) {
            n.shove = (n.shove || 0) + dt;
            if (n.shove > 0.45) {
              const side = Math.atan2(n.x - p.x, n.z - p.z) + Math.PI / 2;
              const tx = n.x + Math.sin(side) * 1.1, tz = n.z + Math.cos(side) * 1.1;
              if (!noGo(tx, tz)) { n.target = { x: tx, z: tz }; n.mode = 'walk'; n.timer = 0.2; }
              n.shove = 0;
            }
          } else n.shove = 0;
        }
        n.speed += (n.wantSpeed - n.speed) * Math.min(1, dt * 9);
        n.y = S.map.walkY(n.x, n.z);
      } catch (e) { err('npc tick ' + n.id, e); }
    }
    void top;
  }

  // ── the frame ─────────────────────────────────────────────────────────────────────────────────────────────
  const tmpV = new THREE.Vector3(), TIP = new THREE.Vector3(), MID = new THREE.Vector3(), DIR = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), Q = new THREE.Quaternion();
  /** The fishing line: from the rod's tip to the float bobbing out on the water. */
  function fishingRig(n) {
    const e = n.extra;
    if (!e || !e.float || !n.prop || !n.model) return;
    n.model.root.updateMatrixWorld(true);
    TIP.set(0, 0.74, 0);
    n.prop.localToWorld(TIP);
    const bob = Math.sin(S.time * 1.7) * 0.012 - (e.dip || 0) * (0.6 + 0.4 * Math.sin(S.time * 22));
    const fx = TIP.x + Math.sin(n.yaw) * e.cast, fz = TIP.z + Math.cos(n.yaw) * e.cast;
    e.float.position.set(fx, e.waterY + 0.02 + bob, fz);
    DIR.copy(e.float.position).sub(TIP);
    const len = Math.max(0.05, DIR.length());
    MID.copy(TIP);
    e.line.position.copy(MID);
    Q.setFromUnitVectors(UP, DIR.normalize());
    e.line.quaternion.copy(Q);
    e.line.scale.set(1, len, 1);
  }
  function render(alpha, dt, t, info) {
    if (!S.map || !S.list.length) return;
    const cam = info && info.camera;
    const hero = info && info.player;
    let blobN = 0;
    for (const n of S.list) {
      const m = n.model;
      if (!m) continue;
      try {
        const x = n.px + (n.x - n.px) * alpha, z = n.pz + (n.z - n.pz) * alpha;
        const y = S.map.walkY(x, z);
        if (n.hidden) {
          showModel(n, false);
          if (S.blobs) S.blobs.hide(n.blob);
          n.def.ix = 1e9; n.def.iz = 1e9;                 // indoors: not something the hero can talk to
          continue;
        }
        m.root.position.set(x, y + (n.yOff || 0), z);
        if (n.extra && n.extra.pot) n.extra.pot.position.set(x, y, z);
        m.setFacing(n.yaw);
        // look at the hero when he is close, or at whoever we are chatting to
        if (m.lookAt && hero) {
          const d = Math.hypot(hero.x - x, hero.z - z);
          if (n.talking || n.linger > 0 || (n.glance > 0 && d < 6) || d < 3.2) m.lookAt(tmpV.set(hero.x, hero.y + (n.kind === 'person' ? 1.3 : 0.6), hero.z));
          else if (n.behaviour === 'chat') { const o = S.byId.get(n.def.with); if (o) m.lookAt(tmpV.set(o.x, o.y + 1.25, o.z)); }
          else if (d > 7) m.lookAt(null);
        }
        m.setMove(n.speed, { run: !!n.run });
        // LOD: outlines close by, sun shadows closer still, and nobody at all past 55 units
        const dc = cam ? Math.hypot(cam.position.x - x, cam.position.z - z) : 0;
        const vis = dc < 55 && !n.suppressed;
        n.lod = !vis ? 'culled' : dc < 14 ? 'near' : dc < 22 ? 'mid' : 'far';
        m.root.visible = vis;
        if (n.extra && n.extra.float) { n.extra.float.visible = vis; if (n.extra.line) n.extra.line.visible = vis; }
        if (vis) {
          for (const mesh of m.meshes || []) {
            if (mesh.userData && mesh.userData.isOutline) mesh.visible = dc < 18;      // the ink line reads to ~18 u
            else if (mesh.name === 'face') mesh.visible = dc < 26;                      // eyes and mouths, up close
            else if (mesh.name === 'body') mesh.castShadow = n.kind === 'person' && dc < 14;
          }
          // animate at full rate near the camera, every other frame further out
          n.animT += dt;
          if (dc < 26 || (n.animFrame = !n.animFrame)) { m.update(n.animT); n.animT = 0; }
          if (S.blobs && n.blob < S.blobs.capacity) { S.blobs.set(n.blob, x, y, z, n.kind === 'person' ? 0.95 : (n.def.animal === 'dog' ? 0.6 : 0.42)); blobN++; }
          if (n.extra && n.extra.line) fishingRig(n);
        } else if (S.blobs) S.blobs.hide(n.blob);
        // keep the map entry (the ▼ prompt and the talk test) on top of where they are standing
        n.def.ix = x; n.def.iz = z;
        n.def.promptY = y + (m.height || 1.5) + 0.42;
      } catch (e) { err('npc render ' + n.id, e); }
    }
    if (S.blobs) S.blobs.commit();
    void t; void blobN;
  }

  // ── the words ask for a nod, an emote, a mouth ────────────────────────────────────────────────────────────
  function cue({ who, emote, anim }) {
    const n = who ? S.byId.get(who) : S.talkingWith;
    if (!n || !n.model) return;
    try {
      if (emote) n.model.emote(emote, 1.8);
      if (anim) n.model.play(anim);
    } catch (e) { err('npc cue', e); }
  }
  function onSay({ who }) {
    S.speakerId = who || (S.talkingWith ? S.talkingWith.id : null);
  }
  function onTyping({ who, on }) {
    const n = S.byId.get(who || S.speakerId || (S.talkingWith ? S.talkingWith.id : null));
    if (!n || !n.model) return;
    try { if (on) n.model.play('talk'); else n.model.stop(0.25); } catch (e) { err('npc typing', e); }
  }

  const describe = () => S.list.map(n => ({
    id: n.id, name: n.def.name || null, kind: n.kind, look: n.def.animal || n.def.monster || (n.def.variant ? n.def.char + ':' + n.def.variant : n.def.char),
    x: r3(n.x), z: r3(n.z), facing: r3(((n.yaw / DEG) % 360 + 360) % 360), behaviour: n.behaviour, mode: n.mode,
    speed: r3(n.speed), talking: !!n.talking, hidden: !!n.hidden, lod: n.lod, moved: r3(n.moved), model: n.model ? n.model.kind : null,
    talks: talks.get(talkKey(n)) || 0, hasWords: !!(n.def.script || n.def.text || n.def.pages),
  }));

  return {
    S, spawn, despawn, update, render, cue, onSay, onTyping, describe, beginTalk, applySchedules,
    settleAt: (x, z) => settle(x, z), place,
    byId: (id) => S.byId.get(String(id)) || null,
    talks,
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 4. install
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function install(ctx = {}) {
  const Field = ctx.Field;
  if (!Field || typeof Field.on !== 'function') { reportError('npc install', new Error('no Field in the plugin context')); return; }
  const sys = createSystem(ctx);
  const Bs = ctx.Bus || Bus;
  const Db = ctx.Debug || Debug;

  Field.on('load', ({ map, scene }) => sys.spawn(map, scene));
  Field.on('unload', () => sys.despawn());
  Field.on('update', (dt, o) => sys.update(dt, o && o.top));
  Field.on('render', (alpha, dt, t, info) => sys.render(alpha, dt, t, info));

  Bs.on('dialogue.cue', (e) => sys.cue(e || {}));
  Bs.on('dialogue.say', (e) => sys.onSay(e || {}));
  Bs.on('dialogue.typing', (e) => sys.onTyping(e || {}));
  Bs.on('time.set', () => sys.applySchedules(false));

  Db.provide('npcs', () => sys.describe());
  /** __DQ.npcs() — everyone on this map, with where they are and what they are doing. */
  Db.expose('npcs', () => sys.describe());
  /** __DQ.talkTo('hob') — walk the conversation open from anywhere (critics, scenarios). */
  Db.expose('talkTo', (id) => {
    const n = sys.byId(id);
    if (!n) return { ok: false, reason: `nobody called "${id}" here`, npcs: sys.describe().map(x => x.id) };
    const w = ctx.Field.world();
    if (w && w.player) {
      const yaw = Math.atan2(n.x - w.player.p.x, n.z - w.player.p.z);
      const px = n.x - Math.sin(yaw) * 1.35, pz = n.z - Math.cos(yaw) * 1.35;
      w.player.place(px, pz, yaw, true);
      if (w.cameraRig) w.cameraRig.snap();
    }
    sys.beginTalk(n);
    return { ok: true, id: n.id, name: n.def.name || null };
  });
  /** __DQ.npcsShow(false) — hide everyone (before/after screenshots, and to measure what they cost). */
  Db.expose('npcsShow', (on = true) => {
    for (const n of sys.S.list) { n.suppressed = !on; if (n.model) { n.model.root.visible = !!on && !n.hidden; } if (n.extra) { for (const k of ['float', 'line', 'pot']) if (n.extra[k]) n.extra[k].visible = !!on && !n.hidden; } }
    return { shown: !!on, count: sys.S.list.length };
  });
  /** __DQ.npcModel('sausage') — what their body is actually doing: the root, and every bone's world height. */
  Db.expose('npcModel', (id) => {
    const n = sys.byId(id);
    if (!n || !n.model) return { ok: false, reason: 'nobody there, or no body built' };
    const m = n.model, out = { id: n.id, kind: m.kind, height: m.height, visible: m.root.visible, y: +m.root.position.y.toFixed(3), bones: {}, meshes: [] };
    m.root.updateMatrixWorld(true);
    const V = new THREE.Vector3();
    for (const [name, b] of Object.entries(m.bones || {})) { b.getWorldPosition(V); out.bones[name] = [+V.x.toFixed(2), +V.y.toFixed(3), +V.z.toFixed(2)]; }
    m.root.traverse((o) => { if (o.isMesh) out.meshes.push((o.name || o.type) + (o.visible ? '' : ':hidden')); });
    return out;
  });
  /** __DQ.npcGo('sausage', x, z) — send somebody somewhere (used to pose scenes for screenshots). */
  Db.expose('npcGo', (id, x, z, hold = false) => {
    const n = sys.byId(id);
    if (!n) return { ok: false };
    if (hold) { n.behaviour = 'stand'; n.radius = 0; }
    const at = sys.settleAt(+x, +z);
    n.anchor = { x: at.x, z: at.z };
    n.target = null;
    n.mode = 'idle'; n.timer = 1.2; n.hidden = false; n.goingHome = false;
    sys.place(n, at.x, at.z);
    if (n.model) n.model.root.visible = true;
    return { ok: true, x: at.x, z: at.z };
  });

  // talk counts ride along in the save, so a villager remembers you met
  try {
    if (ctx.Save && typeof ctx.Save.register === 'function') {
      ctx.Save.register('npcs', {
        save: () => ({ talks: Object.fromEntries(sys.talks) }),
        load: (d) => { sys.talks.clear(); if (d && d.talks) for (const [k, v] of Object.entries(d.talks)) sys.talks.set(k, +v || 0); },
        reset: () => sys.talks.clear(),
      });
    }
  } catch (e) { reportError('npc save', e); }
}

export default install;
