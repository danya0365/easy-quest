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
 *     wear?: 'plum'|'moss'|'slate'|'rust'|'teal'|'mustard'|'berry'|'sky'|'clay'|'ink' | {hue, sat, light},
 *                                            //   re-dye THIS person's clothes and hair (see WEAR, §2b): chars.js
 *                                            //   caches one body per look, so this is what makes four innkeepers
 *                                            //   four different people. Skin is never touched. Costs no triangles.
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
 *     fixed?: true,                          // do NOT settle me onto clear ground — this spot is the point
 *                                            //   (a wall perch, a pot on the green); implies no extra collider
 *     it?: true, home?: [x, z],              // who is It in a game of tag · where they go when the day ends
 *     emotes?: ['question', 'love'],         // the ONLY way to get an idle emote bubble; nobody emotes at random
 *                                            //   ('happy' shares chars.js's music icon — ask for 'love' instead)
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
 *   lean    leans ON something: `look` names it, and he is walked back in until he touches it, then tipped
 *           back onto it (Old Hob's back is against the well he says he has leaned on since before the well)
 *   sit     sits (on a bench, a step, a wall)
 *   sell    stands by their stall and waves you over when you pass
 *   perch   sits on a wall and does not come down (a cat)
 *   Animals: a cat grooms, strolls and bolts · a dog trots along with you for a while, then sits and goes home ·
 *   hens peck and scatter · a duck waddles. All of them can be talked to.
 *
 * ── Noticing you (P08's ch.lookAt, wired) ────────────────────────────────────────────────────────────────────
 *   Nobody is a statue and nobody stares through you. Inside 6.8 units `attention` climbs, the BODY swings part
 *   of the way round (how far is per-behaviour: a stander turns all the way, a sweeper keeps half an eye on her
 *   step, a fisher barely moves) and the head and eyes finish the turn — chars.js clamps the neck at about 63°,
 *   so a body that never moved would leave somebody squinting sideways at you forever. Inside 7.5 units the eyes
 *   track you. Further off they look at their own work (the float, the step, the ground), at the person they are
 *   chatting to, at the cat they are chasing, or — every few seconds — at somebody else in the square.
 *   Whoever has the floor in a conversation stops, turns square to the hero and holds it; the one who just
 *   finished turns to look at them; and the hero turns to the new speaker. Measure it all with __DQ.npcLook().
 *
 * ── How it plugs in (no shared-file edits) ───────────────────────────────────────────────────────────────────
 *   Field.on('load')   builds everyone for the new map (Chars.build, animals here), gives each map.npcs entry a
 *                      talk() the field's confirm can reach, and a live x/z so the ▼ prompt follows them
 *   Field.on('update') the 60 Hz simulation; Field.on('render') interpolates, animates and does the LOD
 *   Bus dialogue.say / dialogue.typing / dialogue.cue / dialogue.end   drive the talking mouth, emotes and nods
 * ── Nobody is a statue (the numbers a critic reads) ──────────────────────────────────────────────────────────
 *   Every entry in __DQ.npcs() carries `walked` (units travelled since the map loaded), `breath` (how far their
 *   head rises and falls over a rolling three seconds — about 0.02 for an adult), `blinks` and `sway` (the slow
 *   weight shift from hip to hip, in degrees). A stander, a seller, a leaner and a chatter all spend part of their
 *   radius: they pick a point, walk it, pause and turn back. Nothing reads 0.00 at thirty seconds except somebody
 *   who is `fixed` — a cat on a wall, a cactus in a pot.
 *
 *   __DQ.state().npcs · __DQ.npcs() · __DQ.talkTo(id) · __DQ.npcFace(id) · __DQ.npcGo(id, x, z, hold?) ·
 *   __DQ.talkShot() (the conversation framing: where the speaker landed on screen, and how far the lens swung) ·
 *   __DQ.npcModel(id) · __DQ.npcLook() (who everybody is looking at, and how much of their attention you have) ·
 *   __DQ.npcSpot(x, z) (may somebody stand here? ground, clear, doorway) ·
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

// ── noticing you ─────────────────────────────────────────────────────────────────────────────────────────────
// DQV's villagers are not statues staring past you: as you come near, the body swings PART of the way round and
// the head and eyes finish the turn (chars.js lookAt clamps the neck at about 63°, so a body that never moves
// leaves somebody looking sideways at you forever — that was P08's "gaze is built but never wired").
const NOTICE = 6.8;          // how far away somebody looks up from what they are doing
const LOOK_AT = 7.5;         // how far away the head/eyes still track you
/** How far each behaviour is willing to turn its BODY towards you (1 = all the way). A sweeper keeps her step. */
const BODY_TURN = {
  stand: 1, lean: 0.85, sit: 0.8, sell: 1, wander: 0.55, sweep: 0.5, fish: 0.3, chat: 0.7, perch: 0.45,
  chase: 0.25, tag: 0.25, cat: 0.35, dog: 1, hen: 0.3, duck: 0.3,
};

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
// 2b. WHAT THEY ARE WEARING — nine bodies, twenty-one people
//
// src/art/chars.js (P07) builds eight villager looks and caches the geometry per look, so four innkeepers are one
// bald mustachioed man standing in four places. A people layer cannot add a body — but it CAN change the dye in
// the cloth: `wear: 'plum'` (or `{hue, sat, light}`) on an entry repaints that instance's clothes and hair.
//
// The geometry is NOT copied. A new BufferGeometry re-uses every one of the cached attribute buffers — position,
// normal, uv, skinIndex, skinWeight and the index — and swaps in its own `color` array, so a recoloured villager
// costs one small vertex-colour buffer and not one triangle more. Skin is protected by hue and lightness (warm
// hues above mid lightness are left exactly as they were), so nobody ever ends up with a green face; the shirt,
// the apron, the waistcoat, the boots and the hair are what move.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Named dyes a people layer can hand an entry. hue is degrees round the wheel; sat/light are multipliers. */
export const WEAR = {
  plum: { hue: -74, sat: 1.1, light: 0.94 },
  moss: { hue: 96, sat: 0.92, light: 1.0 },
  slate: { hue: 172, sat: 0.55, light: 0.96 },
  rust: { hue: -28, sat: 1.22, light: 1.02 },
  teal: { hue: 140, sat: 1.0, light: 1.04 },
  mustard: { hue: 44, sat: 1.15, light: 1.1 },
  berry: { hue: -110, sat: 1.05, light: 0.9 },
  sky: { hue: 190, sat: 0.9, light: 1.12 },
  clay: { hue: -14, sat: 0.8, light: 0.86 },
  ink: { hue: 205, sat: 0.7, light: 0.78 },
};
const wearOf = (w) => (typeof w === 'string' ? WEAR[w] || null : (w && (Number.isFinite(+w.hue) || Number.isFinite(+w.sat) || Number.isFinite(+w.light)) ? w : null));

// Vertex colours are stored in the LINEAR working space, and every judgement below ("is this skin?", "how far
// round the wheel?") only makes sense in sRGB, so the transfer function is done here by hand rather than trusted
// to a colour-space argument that changes between three revisions.
const toS = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const toL = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** sRGB -> {h, s, v} (HSV, not HSL: a pale warm colour reads as low saturation here, which is what skin IS). */
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  let h = 0;
  if (c > 1e-6) {
    if (mx === r) h = ((g - b) / c) % 6;
    else if (mx === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: mx <= 1e-6 ? 0 : c / mx, v: mx };
}
function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}
/**
 * Is this the skin of a face, a hand, a knee — or the ink of an outline, or the white of an eye?
 * Skin is the warm hues (5-50 deg) at or above mid brightness and never strongly saturated; chars.js mixes every
 * one of its tones (tan, ruddy, pale, olive, freckled, sunburnt) out of PAL.char.skin, and all of them land here.
 * An orange shirt or a red apron is the same hue but far more saturated, so it still gets re-dyed.
 */
function keepAsIs(h, s, v) {
  if (v < 0.2) return true;                       // the ink outline, dark hair, eyes, boots in shadow
  if (s < 0.085) return true;                     // whites: eye whites, plaster, linen
  return (h < 0.14 || h > 0.965) && v >= 0.55 && s <= 0.55;   // ...and the blush, which sits just under red
}
/** Build this instance's colour attribute: every distinct colour is mapped once, then splatted over the array. */
function dyedColors(src, dye) {
  const n = src.count, out = new Float32Array(n * 3);
  const seen = new Map();
  const hue = (+dye.hue || 0) / 360, sat = Number.isFinite(+dye.sat) ? +dye.sat : 1, lit = Number.isFinite(+dye.light) ? +dye.light : 1;
  for (let i = 0; i < n; i++) {
    const r = src.getX(i), g = src.getY(i), b = src.getZ(i);
    const key = ((r * 511) | 0) * 262144 + ((g * 511) | 0) * 512 + ((b * 511) | 0);
    let m = seen.get(key);
    if (m === undefined) {
      const c = rgb2hsv(toS(r), toS(g), toS(b));
      if (keepAsIs(c.h, c.s, c.v)) m = [r, g, b];
      else {
        const h2 = ((c.h + hue) % 1 + 1) % 1;
        const rgbS = hsv2rgb(h2, clamp(c.s * sat, 0, 1), clamp(c.v * lit, 0.02, 1));
        m = [toL(rgbS[0]), toL(rgbS[1]), toL(rgbS[2])];
      }
      seen.set(key, m);
    }
    out[i * 3] = m[0]; out[i * 3 + 1] = m[1]; out[i * 3 + 2] = m[2];
  }
  return new THREE.BufferAttribute(out, 3);
}
/** Re-dye one built character in place. Returns the per-instance geometries, for this NPC's own dispose(). */
function recolour(ch, def) {
  const dye = wearOf(def && def.wear);
  if (!dye || !ch || !Array.isArray(ch.meshes)) return null;
  const made = [];
  try {
    for (const mesh of ch.meshes) {
      if (!mesh || !mesh.geometry || mesh.name === 'face') continue;          // eyes and mouths stay as drawn
      const geo = mesh.geometry, src = geo.attributes && geo.attributes.color;
      if (!src || src.count > 60000) continue;
      const g = new THREE.BufferGeometry();
      g.name = (geo.name || 'villager') + ':' + (typeof def.wear === 'string' ? def.wear : 'dyed');
      if (geo.index) g.setIndex(geo.index);
      for (const k of Object.keys(geo.attributes)) if (k !== 'color') g.setAttribute(k, geo.attributes[k]);
      g.setAttribute('color', dyedColors(src, dye));
      if (geo.groups && geo.groups.length) g.groups = geo.groups.slice();
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      if (geo.boundingSphere) g.boundingSphere = geo.boundingSphere.clone();
      if (geo.boundingBox) g.boundingBox = geo.boundingBox.clone();
      g.userData.dyed = true;
      mesh.geometry = g;
      made.push(g);
    }
  } catch (e) { reportError('npc recolour ' + (def && def.id), e); }
  return made.length ? made : null;
}
/** Give back only what this instance owned: the shared buffers are detached first so the cache keeps them. */
function undye(list) {
  if (!list) return;
  for (const g of list) {
    try {
      g.setIndex(null);
      for (const k of Object.keys(g.attributes)) if (k !== 'color') g.deleteAttribute(k);
      g.dispose();
    } catch (_) { /* a geometry that is already gone is not a problem */ }
  }
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
    time: 0, hours: 9, hourT: 0, talkingWith: null, speakerId: null, prevSpeaker: null, cam: null, camZoom: null, camOrbit: null, built: 0, gen: 0,
  };
  const AWAY = { away: true };
  const LOOKV = new THREE.Vector3();        // scratch: where somebody's eyes are pointed this frame
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
  /**
   * Can somebody stand here at all? (`roam` also keeps them out of doorways, which is only for a DESTINATION —
   * walking past a door is fine, standing in it is not.) `probe` is the body radius the spot is tested with: a
   * destination wants elbow room (0.45), a step along the way only wants the body through (0.28).
   */
  function noGo(x, z, roam = true, probe = 0.45) {
    const m = S.map; if (!m) return true;
    if (!m.inBounds(x, z)) return true;
    const g = m.groundAt(x, z);
    if (g === 'water' || g === 'wood') return true;             // never in the Beck, never on the footbridge
    if (roam) for (const d of S.doors) if (Math.hypot(x - d.x, z - d.z) < (d.r || 2.1)) return true;
    return !m.clear(x, z, probe);
  }
  /**
   * Run a test with somebody's OWN collider parked off the map.
   *
   * THIS IS WHY NOBODY WALKED. Every person carries a circle collider at their feet, so `map.clear()` at the spot
   * they are standing on reported "blocked — by themselves". `pickSpot` then failed its path test on its very
   * first sample (the sample nearest the walker), returned null every time, and twelve villagers with authored
   * wander radii stood perfectly still for the whole of a thirty-second measurement. `stepTo` already did this
   * dance; the spot and path tests did not.
   */
  function withoutSelf(n, fn) {
    const c = n && n.collider;
    const saved = c ? c.bound : null;
    if (c) c.bound = [1e9, 1e9, 1e9, 1e9];
    try { return fn(); } finally { if (c) c.bound = saved; }
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
  /** Is the walk from here to there clear? Doorways do not block a PATH (you may walk past a door, not stand in it). */
  function pathClear(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 0.5));
    for (let i = 1; i <= n; i++) { const t = i / n; if (noGo(lerp(x0, x1, t), lerp(z0, z1, t), false, 0.28)) return false; }
    return true;
  }
  /**
   * Somewhere within `radius` of their spot that this person can actually walk to. Their own collider is parked
   * for the whole test (see withoutSelf), the path is probed at body width rather than elbow width, and if the
   * scatter finds nothing we fall back to a ring of eight short steps — a person in a crowded square still shifts
   * their feet. Returning null means "there is genuinely nowhere to go", not "I tested myself and lost".
   */
  function pickSpot(n, radius = n.radius) {
    if (!(radius > 0.12)) return null;
    return withoutSelf(n, () => {
      const free = (x, z) => {
        if (noGo(x, z)) return false;
        if (!pathClear(n.x, n.z, x, z)) return false;
        for (const o of S.list) if (o !== n && !o.hidden && Math.hypot(o.x - x, o.z - z) < 0.78) return false;
        return true;
      };
      for (let i = 0; i < 14; i++) {
        const a = rnd() * TAU, r = Math.max(0.35, Math.sqrt(rnd()) * radius);
        const x = n.anchor.x + Math.cos(a) * r, z = n.anchor.z + Math.sin(a) * r;
        if (free(x, z)) return { x, z };
      }
      const r = Math.min(radius, 0.75), a0 = rnd() * TAU;                  // a short step, in any of eight directions
      for (let i = 0; i < 8; i++) {
        const a = a0 + (i / 8) * TAU;
        const x = n.x + Math.cos(a) * r, z = n.z + Math.sin(a) * r;
        if (Math.hypot(x - n.anchor.x, z - n.anchor.z) > radius * 1.15) continue;
        if (free(x, z)) return { x, z };
      }
      return null;
    });
  }
  /**
   * Nobody stands perfectly still for thirty seconds. A stander, a seller, a leaner and a chatter all shift their
   * weight: every few seconds they take a short step inside their radius, pause, and turn back to what they were
   * looking at. It is small (0.4-1.1 units) and it is what stops a village reading as a shelf of statues.
   */
  function shuffle(n, dt, maxR) {
    if (n.def.fixed || !(maxR > 0.12)) return false;          // a cat on a wall, a cactus in a pot: that IS the spot
    if (n.mode === 'walk' && n.target) {
      const speed = SPEED.work * 1.5;
      if (stepTo(n, n.target.x, n.target.z, speed, dt)) { n.mode = 'idle'; n.shuffleT = range(4.5, 10); n.target = null; }
      return true;
    }
    n.shuffleT = (n.shuffleT == null ? range(1.5, 5) : n.shuffleT) - dt;
    if (n.shuffleT > 0) return false;
    n.shuffleT = range(4.5, 10);
    const spot = pickSpot(n, Math.min(maxR, Math.max(0.4, n.radius)));
    if (spot) { n.target = spot; n.mode = 'walk'; return true; }
    return false;
  }

  /**
   * A leaner leans on something. `settle` pushes everybody off the colliders, which left Old Hob standing a clear
   * metre from the well he says he has leaned on since before the well. So a leaner feels around for the nearest
   * solid thing, walks back in until the collision says stop, and remembers the direction as `leanDir` — the
   * render pass then tips him back onto it, shoulder turned to the lane. Nobody says "I have leaned on this all
   * my life" a metre clear of it. __DQ.npcs()[i].leanGap is how far off it he ended up (a hand's width or less).
   */
  function leanOnto(n) {
    if (n.behaviour !== 'lean' || !S.map) return;
    // Which way is the thing? `look` is a hint, not the answer — a people layer may name a well the base map
    // never published, and `settle` has already pushed him a metre clear of whatever is really beside him. So
    // feel outwards in twenty-four directions for the nearest solid thing, preferring the way `look` points.
    let pref = null;
    if (Array.isArray(n.def.look) && Number.isFinite(+n.def.look[0])) {
      pref = Math.atan2(+n.def.look[0] - n.x, +n.def.look[1] - n.z);
    } else if (Number.isFinite(+n.def.facing)) pref = +n.def.facing * DEG;
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      let hit = -1;
      for (let d = 0.4; d <= 2.6; d += 0.15) {
        if (noGo(n.x + Math.sin(a) * d, n.z + Math.cos(a) * d, false, 0.16)) { hit = d; break; }
      }
      if (hit < 0) continue;
      const bias = pref == null ? 0 : (1 - Math.cos(wrapPi(a - pref))) * 0.55;   // the hinted way wins a tie
      const score = hit + bias;
      if (!best || score < best.score) best = { a, hit, score };
    }
    if (!best) return;                                  // out in the open with nothing to lean on: he just stands
    const a = best.a;
    let bx = n.x, bz = n.z;
    for (let d = 0.1; d <= best.hit; d += 0.1) {
      const x = n.x + Math.sin(a) * d, z = n.z + Math.cos(a) * d;
      if (noGo(x, z, false, 0.33)) break;
      bx = x; bz = z;
    }
    n.x = n.px = bx; n.z = n.pz = bz;
    n.anchor = { x: bx, z: bz };
    n.leanTo = { x: n.x + Math.sin(a) * best.hit, z: n.z + Math.cos(a) * best.hit };
    n.leanDir = a;                                      // the way he walked IN: his back goes to it, not his face
    n.leanGap = r3(Math.max(0, Math.hypot(n.leanTo.x - bx, n.leanTo.z - bz)));
    n.leanRoll = (rnd() * 2 - 1) * 0.22;
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
      const dyed = recolour(ch, def);
      return {
        wear: (typeof def.wear === 'string' ? def.wear : (def.wear ? 'custom' : null)),
        kind: 'person', root: ch.root, height: ch.height, radius: 0.3, meshes: ch.meshes || [], character: ch,
        bones: ch.bones || null,
        setFacing: (rad, instant) => ch.setFacing(rad, instant),
        get facing() { return ch.facing; },
        setMove: (sp, o) => ch.setMove(sp, o), play: (clip, o) => ch.play(clip, o), stop: (f) => ch.stop(f),
        emote: (e2, d) => ch.emote(e2, d), lookAt: (v) => ch.lookAt(v), update: (dt) => ch.update(dt),
        state: () => ch.state(), attach: (o, b) => ch.attach(o, b), dispose: () => { undye(dyed); ch.dispose(); },
      };
    } catch (e) { err('npc model ' + (def.id || def.char), e); return null; }
  }

  function spawnOne(def, index) {
    // `fixed: true` means "this is exactly where I belong": a cat on a wall, a Cactuddle in its pot on the green,
    // somebody sitting in a window. The map already has a collider under them, so settling them onto clear ground
    // would be the bug, not the fix. Everybody else gets nudged to somewhere they can actually stand.
    const at = def.fixed ? { x: +def.x || 0, z: +def.z || 0, moved: 0 } : settle(+def.x || 0, +def.z || 0);
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
      scale: Number.isFinite(+def.scale) && +def.scale > 0 ? +def.scale : 1,
      it: !!def.it, chatTurn: false, animFrame: false, goingHome: false, slot: null, run: false,
      attention: 0, baseYaw: 0, speaking: 0, lookNpc: null, lookT: range(2, 7), looking: null,
    };
    n.yawPrev = n.yaw;
    n.walked = 0; n.breath = 0; n.shuffleT = range(1.5, 5);
    leanOnto(n);                                     // ...and a leaner is put right up against the thing he leans on
    n.model = modelFor(def);
    if (n.model) attachModel(n);
    // the map entry the field talks to: keep it in step with where this person actually is
    def.ix = n.x; def.iz = n.z;
    def.reach = Number.isFinite(+def.reach) ? +def.reach : (n.kind === 'person' ? 2.0 : 1.7);
    def.talk = () => { beginTalk(n); return null; };
    if (def.solid !== false && !def.fixed && n.kind !== 'animal' && S.map) {
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
    S.talkingWith = null; S.speakerId = null; S.prevSpeaker = null;
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

  /**
   * THE TWO-SHOT. A conversation is a camera beat, and the one thing a child must never have to guess is WHO IS
   * TALKING. So when a conversation opens the lens swings round until the speaker stands beside the hero, a
   * little beyond him, both of them whole in the frame — the over-the-shoulder shot DQV uses for every villager.
   *
   * The geometry: with the lens sitting in direction `camDir` from the hero, somebody in direction `to` lands at
   * screen-x proportional to sin(to - camDir) and at depth proportional to cos(to - camDir). phi = +/-180 deg is
   * "directly behind the hero" (hidden by him); phi = 0 is "between the hero and the lens" (their back fills the
   * frame). TALK_OFF = 128 deg is the sweet spot: clearly to one side, still on the far side of the hero, so we
   * look past his shoulder at their face. Whichever way round is the SHORTER swing wins, so the camera never
   * takes the long way round the green. Measure it with __DQ.talkShot().
   */
  const TALK_OFF = 128 * DEG;
  function frameTalk(n, first) {
    const rig = S.cam, p = S.player ? S.player.p : null;
    if (!rig || !p || !n) return null;
    const toN = Math.atan2(n.x - p.x, n.z - p.z);
    if (!Number.isFinite(toN)) return null;
    const camDir = rig.orbit() * DEG;
    const phi = wrapPi(toN - camDir);
    const want = (phi >= 0 ? 1 : -1) * TALK_OFF;
    const next = (((toN - want) / DEG) % 360 + 360) % 360;
    const swing = Math.abs(wrapPi((next - rig.orbit()) * DEG)) / DEG;
    if (first || swing > 6) rig.orbit(next);                 // a dead band, so a long speech does not judder
    S.camFramed = { id: n.id, orbit: r3(next), swing: r3(swing), phi: r3(phi / DEG) };
    return S.camFramed;
  }
  /** The camera beat itself: remember where the lens was, push in, swing to the two-shot, clear the foreground. */
  function easeCamera(n) {
    try {
      const rig = S.cam, p = S.player ? S.player.p : null;
      if (!rig || !p) return;
      if (S.camZoom == null) {
        // Somebody short — a boy sitting on the bank, a cat, a hen, a Cactuddle in its pot — barely gets the push
        // in: at close range a low head lands under the message box and the child never sees who is talking.
        const headY = (n.y || 0) + (n.yOff || 0) + ((n.model && n.model.height) || 1.5) * (n.scale || 1);
        const low = headY < (p.y || 0) + 1.15;
        S.camZoom = rig.zoom();
        S.camOrbit = rig.orbit();
        rig.zoom(low ? Math.min(12, S.camZoom * 0.97) : Math.max(5.0, S.camZoom * 0.94));
      }
      frameTalk(n, true);
      clearTheShot(n);
    } catch (e) { err('npc camera ease', e); }
  }
  /**
   * ...and nobody stands in front of the person talking. A villager between the lens and the speaker takes a step
   * out of the shot — which is exactly what a person does when two people start talking beside them.
   */
  function clearTheShot(n) {
    try {
      const rig = S.cam, cam = rig && rig.camera;
      if (!cam || !n) return;
      const ax = cam.position.x, az = cam.position.z;
      const dx = n.x - ax, dz = n.z - az, len = Math.hypot(dx, dz);
      if (len < 0.5) return;
      const ux = dx / len, uz = dz / len;
      for (const o of S.list) {
        if (o === n || o.hidden || o.talking || o.kind !== 'person') continue;
        const t = (o.x - ax) * ux + (o.z - az) * uz;
        if (t < 0.6 || t > len - 0.45) continue;              // behind the lens, or behind the speaker: harmless
        const off = (o.x - ax) * -uz + (o.z - az) * ux;
        if (Math.abs(off) > 0.62) continue;                   // not actually in the way
        const side = Math.atan2(-uz, ux);
        for (const s of (off >= 0 ? [1, -1] : [-1, 1])) {
          const tx = o.x + Math.cos(side) * 1.05 * s, tz = o.z + Math.sin(side) * 1.05 * s;
          if (withoutSelf(o, () => !noGo(tx, tz) && pathClear(o.x, o.z, tx, tz))) {
            o.target = { x: tx, z: tz }; o.mode = 'walk'; o.timer = 0.2; o.shuffleT = 6; o.stepped = true;
            break;
          }
        }
      }
    } catch (e) { err('npc clear the shot', e); }
  }
  function restoreCamera() {
    try {
      if (S.cam && S.camZoom != null) S.cam.zoom(S.camZoom);
      if (S.cam && S.camOrbit != null) S.cam.orbit(S.camOrbit);
    } catch (e) { err('npc camera restore', e); }
    S.camZoom = null; S.camOrbit = null; S.camFramed = null;
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

  // ── noticing you, and looking at things ───────────────────────────────────────────────────────────────────
  /**
   * The hero comes near: the body swings part of the way round (how far is up to the behaviour) and stays there
   * while he is close. Anybody actually walking somewhere keeps facing their way — they glance with the head only.
   */
  function notice(n, p, dt) {
    const d = Math.hypot(p.x - n.x, p.z - n.z);
    const want = d < NOTICE ? clamp((NOTICE - d) / (NOTICE - 1.4), 0, 1) : 0;
    n.attention += (want - n.attention) * Math.min(1, dt * (want > n.attention ? 3.4 : 1.4));
    if (n.attention < 0.02) return;
    const turn = (BODY_TURN[n.behaviour] ?? 0.5) * n.attention;
    if (turn < 0.03 || n.speed > 0.35 || d < 0.25) return;
    const to = Math.atan2(p.x - n.x, p.z - n.z);
    n.yaw = n.baseYaw + wrapPi(to - n.baseYaw) * clamp(turn, 0, 1);
  }
  /**
   * What somebody looks at when the hero is not there: the work in their hands, the person they are talking to,
   * the cat they are chasing — and every few seconds, somebody else in the square. Nobody stares into space.
   */
  function idleLook(n, dt) {
    n.lookT -= dt;
    const partner = n.def.with ? S.byId.get(n.def.with) : null;
    if (partner && !partner.hidden && (n.behaviour === 'chat' || n.behaviour === 'chase' || n.behaviour === 'tag')) {
      n.looking = partner.id;
      return LOOKV.set(partner.x, partner.y + (partner.kind === 'person' ? 1.25 : 0.4), partner.z);
    }
    if (n.behaviour === 'fish' && n.extra && n.extra.float) { n.looking = 'the float'; return LOOKV.copy(n.extra.float.position); }
    if (n.behaviour === 'sweep' || n.behaviour === 'hen' || n.behaviour === 'duck') {
      n.looking = 'the ground';
      return LOOKV.set(n.x + Math.sin(n.yaw) * 1.1, n.y + 0.1, n.z + Math.cos(n.yaw) * 1.1);
    }
    if (n.lookT <= 0) {                                   // pick somebody new to be nosy about
      n.lookT = range(3.5, 9);
      let best = null, bd = 9;
      for (const o of S.list) {
        if (o === n || o.hidden) continue;
        const d = Math.hypot(o.x - n.x, o.z - n.z);
        if (d < bd && d > 0.6 && rnd() < 0.8) { bd = d; best = o; }
      }
      n.lookNpc = best && bd < 9 ? best.id : null;
      if (rnd() < 0.3) n.lookNpc = null;                  // ...or back to their own business
    }
    const o = n.lookNpc ? S.byId.get(n.lookNpc) : null;
    if (o && !o.hidden && n.lookT > 1.2) {
      n.looking = o.id;
      return LOOKV.set(o.x, o.y + (o.kind === 'person' ? 1.25 : 0.35), o.z);
    }
    if (n.look) { n.looking = 'away'; return LOOKV.set(n.look.x, n.y + 1.3, n.look.z); }
    n.looking = null;
    return null;
  }

  // ── behaviours ────────────────────────────────────────────────────────────────────────────────────────────
  const BEHAVE = {
    /** Standing about: a glance, an occasional emote, and — every few seconds — a real shift of the feet. */
    stand(n, dt, roam = 0.95) {
      if (roam > 0 && shuffle(n, dt, roam)) { /* mid-step: keep the walking yaw stepTo chose */ }
      else {
        n.wantSpeed = 0;
        if (n.look) n.yaw = Math.atan2(n.look.x - n.x, n.look.z - n.z);
        else if (Number.isFinite(+n.def.facing)) n.yaw = +n.def.facing * DEG;
      }
      n.timer -= dt;
      if (n.timer <= 0) {
        n.timer = range(3.5, 9);
        // An emote bubble is a LOUD thing on screen — a floating ♪ over a stranger reads as a broken UI marker,
        // not as charm. So nobody emotes at random: only somebody the people layer gave `emotes` to, and rarely.
        const list = Array.isArray(n.def.emotes) ? n.def.emotes : null;
        if (list && list.length && n.model && rnd() < 0.2) n.model.emote(list[(rnd() * list.length) | 0], 1.6);
      }
    },
    /**
     * Leaning on the well, the fence, the gatepost. He stands AGAINST the thing (leanTo, found once at spawn),
     * tipped back onto it, and only pushes himself off it now and then to stretch and settle back. Old Hob says
     * he has leaned on this well since before the well; he had better be touching it.
     */
    lean(n, dt) {
      if (n.mode !== 'walk' && n.leanDir != null) {
        n.yaw = n.leanDir + Math.PI + (n.leanRoll || 0) * 0.9;   // back to the well, shoulder turned to the lane
      }
      BEHAVE.stand(n, dt, Math.min(0.55, n.radius));
      if (n.timer > 5 && n.model && rnd() < 0.004) n.model.emote('sleepy', 2.6);
    },
    sit(n, dt) {
      n.wantSpeed = 0;
      if (n.model && n.act !== 'sit' && !n.talking) { n.model.play('sit'); n.act = 'sit'; }
      BEHAVE.stand(n, dt, 0);
    },
    /** Working a stall: a step along the trestle to straighten something, and a wave when you come past. */
    sell(n, dt) {
      BEHAVE.stand(n, dt, Math.min(1.1, Math.max(0.45, n.radius)));
      const p = S.player ? S.player.p : null;
      if (!p) return;
      const d = Math.hypot(p.x - n.x, p.z - n.z);
      n.waveT -= dt;
      if (d < 4.2 && n.waveT <= 0 && !n.talking) { n.waveT = 9; if (n.model) n.model.play('wave'); }
    },
    wander(n, dt) {
      n.timer -= dt;
      if (n.mode === 'idle' || !n.target) {
        n.mode = 'idle';
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
      if (shuffle(n, dt, Math.min(0.5, Math.max(0.4, n.radius)))) return;   // forty years at this pond, still fidgets
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
            if (n.model) n.model.emote(rnd() < 0.35 ? 'love' : 'sad', 2);   // a real fish, or the boot again
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
      // two people talking still move: a step, a shift onto the other foot, and back to facing each other
      if (shuffle(n, dt, Math.min(0.5, Math.max(0.35, n.radius)))) { n.timer -= dt; return; }
      n.wantSpeed = 0;
      n.yaw = Math.atan2(o.x - n.x, o.z - n.z);
      n.timer -= dt;
      if (n.timer <= 0) {
        n.timer = range(2.6, 4.6);
        const mine = (n.chatTurn = !n.chatTurn);
        if (n.model && !n.talking) {
          if (mine) n.model.play('talk');
          else { n.model.stop(0.3); if (rnd() < 0.5) n.model.play('nod'); else if (rnd() < 0.3) n.model.emote('question', 1.6); }
        }
      }
    },
    tag(n, dt) {
      const o = S.byId.get(n.def.with);
      if (!o) { BEHAVE.wander(n, dt); return; }
      // somebody has to be It, or the whole game is two children standing in a field
      if (!n.it && !o.it && n.id < o.id) n.it = true;
      const d = Math.hypot(o.x - n.x, o.z - n.z);
      if (n.it) {
        if (d < 0.8) {
          n.it = false; o.it = true; n.timer = 1.1; o.timer = 1.4;
          if (n.model) n.model.play('celebrate');
          if (o.model) o.model.emote('surprised', 1.2);
          o.target = null;                                   // and OFF she goes, somewhere new
          return;
        }
        if (n.timer > 0) { n.timer -= dt; n.wantSpeed = 0; n.yaw = Math.atan2(o.x - n.x, o.z - n.z); return; }
        stepTo(n, o.x, o.z, SPEED.kid, dt);
        n.run = true;
      } else {
        if (n.timer > 0) { n.timer -= dt; n.wantSpeed = 0; n.yaw = Math.atan2(o.x - n.x, o.z - n.z); return; }
        // run for the far side of the green: a fresh spot whenever we arrive, or whenever It gets close
        if (!n.target || Math.hypot(n.target.x - n.x, n.target.z - n.z) < 0.5 || d < 1.6) {
          const away = Math.atan2(n.x - o.x, n.z - o.z) + range(-0.8, 0.8);
          const r = n.radius * range(0.65, 1);
          const tx = n.anchor.x + Math.sin(away) * r, tz = n.anchor.z + Math.cos(away) * r;
          const ok = withoutSelf(n, () => !noGo(tx, tz) && pathClear(n.x, n.z, tx, tz));
          n.target = ok ? { x: tx, z: tz } : (pickSpot(n) || { x: n.anchor.x, z: n.anchor.z });
        }
        if (stepTo(n, n.target.x, n.target.z, SPEED.kid * 0.92, dt)) n.target = null;
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
        if (n.timer <= 0) { n.timer = 2.4; if (n.model) { n.model.emote('love', 1.4); n.model.play('celebrate'); } }
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
        if (n.speaking > 0 && S.speakerId !== n.id) n.speaking -= dt;   // the one with the floor keeps it
        if (n.talking || n.speaking > 0) {
          // whoever has the floor stops what they are doing and faces the hero squarely
          n.talkT += dt;
          n.wantSpeed = 0;
          n.attention = 1;
          if (p) n.yaw = n.baseYaw = Math.atan2(p.x - n.x, p.z - n.z);
        } else if (n.linger > 0 && p) {
          n.wantSpeed = 0;
          n.yaw = n.baseYaw = Math.atan2(p.x - n.x, p.z - n.z);
        } else {
          const fn = BEHAVE[n.behaviour] || BEHAVE.stand;
          fn(n, dt);
          n.baseYaw = n.yaw;                                  // what they would be facing if you weren't here
          if (p) notice(n, p, dt);                            // ...and how far round they turn because you are
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
        n.walked += Math.hypot(n.x - n.px, n.z - n.pz);       // the number a critic reads: __DQ.npcs()[i].walked
      } catch (e) { err('npc tick ' + n.id, e); }
    }
    // the two-shot is held for the whole conversation: the follow camera would otherwise ease back behind the
    // hero halfway through a speech and put the speaker behind his head again
    if (S.camZoom != null) {
      S.camHold = (S.camHold || 0) + dt;
      if (S.camHold > 0.5) {
        S.camHold = 0;
        const who = S.talkingWith || (S.speakerId ? S.byId.get(S.speakerId) : null);
        if (who && !who.hidden) frameTalk(who, false);
      }
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
        // how far the lens is: the LOD bands, and how close somebody has to be to be worth probing for life
        const dc = cam ? Math.hypot(cam.position.x - x, cam.position.z - z) : 0;
        // A leaner is tipped back onto the well / the fence / the gatepost (anim.js only ever writes rotation.y,
        // so YXZ order lets us add the tilt in body space without fighting it).
        // THE WEIGHT SHIFT. Standing still is not standing rigid: a person rocks very slowly from one hip to the
        // other. One degree of roll is about 2.5 cm at the head — you read it as life, never as swaying. A leaner
        // gets the same shift on top of being tipped back onto his well.
        if (n.kind === 'person' || n.leanTo) {
          const r = m.root;
          r.rotation.order = 'YXZ';
          const still = clamp(1 - n.speed * 2.2, 0, 1);
          const ph = t * 0.68 + n.index * 1.77;                 // a weight shift every nine seconds or so
          // somebody sitting pivots from much lower down, so the same angle reads as almost nothing: a boy on a
          // bank leaning over his jar of newt and back again needs more of it
          const amp = (n.behaviour === 'sit' || n.behaviour === 'perch') ? 0.044 : 0.019;
          n.sway = (Math.sin(ph) * amp + Math.sin(ph * 2.37 + 1.1) * amp * 0.32) * still;
          const leanK = n.leanTo ? (n.leanK = (n.leanK || 0) + ((n.mode === 'walk' ? 0 : 1) - (n.leanK || 0)) * Math.min(1, dt * 3)) : 0;
          r.rotation.x = -0.16 * leanK + Math.sin(ph * 0.71) * 0.009 * still;
          r.rotation.z = (n.leanRoll || 0) * leanK + n.sway;
        }
        // BREATHING, measured rather than promised: the head's rise and fall over a rolling three seconds.
        // anim.js gives every idle a breath and a blink; nothing reported it, so a critic could only call it a
        // still frame. __DQ.npcs()[i].breath is that number in world units (a villager runs about 0.02).
        if (m.bones && m.bones.head) {
          n.breathT = (n.breathT || 0) + dt;
          if (n.breathT > 0.08) {
            n.breathT = 0;
            m.bones.head.getWorldPosition(tmpV);
            const hy = tmpV.y - y;
            // ...and the head's TOTAL travel over the same window: breathing, the weight shift, a neck turning.
            // A statue reads 0.000 for both; an idle villager reads about 0.02 of breath and 0.15 of stir.
            if (!n.hPrev) n.hPrev = new THREE.Vector3().copy(tmpV);
            if (n.bMin == null || t - (n.bAt || 0) > 3) {
              n.stirLast = n.bStir || 0;
              n.bMin = hy; n.bMax = hy; n.bAt = t; n.bStir = 0;
            } else {
              if (hy < n.bMin) n.bMin = hy;
              if (hy > n.bMax) n.bMax = hy;
              n.bStir = (n.bStir || 0) + tmpV.distanceTo(n.hPrev);
            }
            n.hPrev.copy(tmpV);
            n.breath = n.bMax - n.bMin;
            n.stir = Math.max(n.bStir || 0, n.stirLast || 0);
            if (dc < 55 && m.state) {
              try {
                const st = m.state();
                if (st && st.blinking && !n.wasBlink) n.blinks = (n.blinks || 0) + 1;
                n.wasBlink = !!(st && st.blinking);
              } catch (_) { /* a model with no state is just a model with no blink count */ }
            }
          }
        }
        // ── the gaze (P08's ch.lookAt, wired) ──────────────────────────────────────────────────────────────
        // You get looked at when you are close, while you are being spoken to, and for a beat after. Otherwise
        // they watch their own work, their chat partner, the cat, or whoever else is about.
        if (m.lookAt) {
          const d = hero ? Math.hypot(hero.x - x, hero.z - z) : 99;
          const atYou = hero && (n.talking || n.speaking > 0 || n.linger > 0 || (n.glance > 0 && d < 9) || d < LOOK_AT);
          if (atYou) { m.lookAt(tmpV.set(hero.x, hero.y + (n.kind === 'person' ? 1.32 : 0.62), hero.z)); n.looking = 'you'; }
          else m.lookAt(idleLook(n, dt));
        }
        m.setMove(n.speed, { run: !!n.run });
        // LOD: outlines close by, sun shadows closer still, and nobody at all past 55 units
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
        n.def.promptY = y + (n.yOff || 0) + (m.height || 1.5) * (n.scale || 1) + 0.26;
      } catch (e) { err('npc render ' + n.id, e); }
    }
    if (S.blobs) S.blobs.commit();
    void t; void blobN;
  }

  // ── the words ask for a nod, an emote, a mouth ────────────────────────────────────────────────────────────
  const HERO_IDS = new Set(['hero', 'player', 'bram', '%HERO%']);
  function cue({ who, emote, anim, look }) {
    // the hero is nobody's NPC: his body belongs to player.js, so a cue aimed at him goes there
    if (who && HERO_IDS.has(String(who).toLowerCase())) {
      try { const pl = S.player; if (pl && pl.hero && (anim === 'nod' || !anim)) pl.hero.nod(); } catch (e) { err('npc hero cue', e); }
      return;
    }
    const n = who ? S.byId.get(who) : S.talkingWith;
    if (!n || !n.model) return;
    try {
      if (emote) n.model.emote(emote, 1.8);
      if (anim) n.model.play(anim);
      if (look !== undefined) {                            // {look: 'budge'} — turn and look at somebody named
        n.lookNpc = look ? String(look) : null;
        n.lookT = look ? 6 : 0;
        n.speaking = 0;                                    // looking away means you have stopped talking at him
      }
    } catch (e) { err('npc cue', e); }
  }
  /**
   * A new speaker takes the floor. Whoever it is stops, turns to the hero and starts talking; the one who just
   * finished turns to LOOK at them; and the hero turns to the new speaker, so a two-voice scene reads on screen
   * even when the conversation was staged (Dialogue.say / __DQ.say) rather than started by walking up to someone.
   */
  function onSay({ who }) {
    S.speakerId = who || (S.talkingWith ? S.talkingWith.id : null);
    const n = S.speakerId ? S.byId.get(S.speakerId) : null;
    if (!n) return;
    try {
      n.speaking = 3.2;                                   // topped up on every page of their speech
      n.attention = 1;
      n.hidden = false;
      if (S.prevSpeaker && S.prevSpeaker !== n && !S.prevSpeaker.hidden) {
        S.prevSpeaker.lookNpc = n.id; S.prevSpeaker.lookT = 6; S.prevSpeaker.speaking = 0;
      }
      S.prevSpeaker = n;
      const pl = S.player;
      if (pl && typeof pl.faceToward === 'function') pl.faceToward(n.x, n.z);
      if (!S.talkingWith) easeCamera(n);                  // a staged scene gets the same gentle push in
    } catch (e) { err('npc onSay', e); }
  }
  /** The conversation is over: stop every mouth, let everybody go back to work. */
  function onDialogueEnd() {
    try {
      for (const n of S.list) { if (n.speaking > 0) { n.speaking = 0; n.linger = Math.max(n.linger, 1.2); } }
      S.prevSpeaker = null; S.speakerId = null;
      if (!S.talkingWith) restoreCamera();
    } catch (e) { err('npc dialogue end', e); }
  }
  /** Poses that must survive a conversation: anim.js has ONE action slot, so play('talk') would stand a sitter up. */
  const HELD_POSE = new Set(['sit', 'perch']);
  function onTyping({ who, on }) {
    const n = S.byId.get(who || S.speakerId || (S.talkingWith ? S.talkingWith.id : null));
    if (!n || !n.model) return;
    if (HELD_POSE.has(n.behaviour)) return;              // a boy sitting on the bank talks sitting down
    try { if (on) n.model.play('talk'); else n.model.stop(0.25); } catch (e) { err('npc typing', e); }
  }

  const describe = () => S.list.map(n => ({
    id: n.id, name: n.def.name || null, kind: n.kind, look: n.def.animal || n.def.monster || (n.def.variant ? n.def.char + ':' + n.def.variant : n.def.char),
    x: r3(n.x), z: r3(n.z), facing: r3(((n.yaw / DEG) % 360 + 360) % 360), behaviour: n.behaviour, mode: n.mode,
    speed: r3(n.speed), talking: !!n.talking, hidden: !!n.hidden, lod: n.lod, moved: r3(n.moved), model: n.model ? n.model.kind : null,
    talks: talks.get(talkKey(n)) || 0, hasWords: !!(n.def.script || n.def.text || n.def.pages), voice: n.def.voice || null,
    attention: r3(n.attention), looking: n.looking || null, speaking: n.speaking > 0,
    // the two numbers that say "this is a person, not a statue": how far they have walked since the map loaded,
    // and how far their head rises and falls with their breath over the last three seconds
    walked: r3(n.walked || 0), breath: r3(n.breath || 0), stir: r3(n.stir || 0), blinks: n.blinks || 0, sway: r3((n.sway || 0) / DEG),
    wear: (n.model && n.model.wear) || null, radius: r3(n.radius),
    leanGap: n.leanGap == null ? null : n.leanGap,
  }));

  return {
    S, spawn, despawn, update, render, cue, onSay, onTyping, onDialogueEnd, describe, beginTalk, applySchedules,
    noGoAt: (x, z, roam) => noGo(x, z, roam !== false),
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
  Bs.on('dialogue.end', () => sys.onDialogueEnd());
  Bs.on('time.set', () => sys.applySchedules(false));

  Db.provide('npcs', () => sys.describe());
  /** __DQ.npcs() — everyone on this map, with where they are and what they are doing. */
  Db.expose('npcs', () => sys.describe());
  /** Stand the hero in front of an NPC, close enough to talk, looking at them. Shared by talkTo and npcFace. */
  function stepUpTo(n) {
    const w = ctx.Field.world();
    if (!w || !w.player) return null;
    const yaw = Math.atan2(n.x - w.player.p.x, n.z - w.player.p.z);
    const px = n.x - Math.sin(yaw) * 1.35, pz = n.z - Math.cos(yaw) * 1.35;
    w.player.place(px, pz, yaw, true);
    if (w.cameraRig) w.cameraRig.snap();
    return { x: r3(px), z: r3(pz), facing: r3(((yaw / DEG) % 360 + 360) % 360) };
  }
  /** __DQ.talkTo('hob') — walk the conversation open from anywhere (critics, scenarios). */
  Db.expose('talkTo', (id) => {
    const n = sys.byId(id);
    if (!n) return { ok: false, reason: `nobody called "${id}" here`, npcs: sys.describe().map(x => x.id) };
    stepUpTo(n);
    sys.beginTalk(n);
    return { ok: true, id: n.id, name: n.def.name || null };
  });
  /**
   * __DQ.npcFace('pell') — stand the hero in front of somebody WITHOUT starting their conversation, and hand back
   * their nameplate and voice. A demo or a cutscene that wants to put its own words in a real person's mouth uses
   * this, so the name on the box always belongs to the body on the screen.
   */
  Db.expose('npcFace', (id) => {
    const n = sys.byId(id);
    if (!n) return { ok: false, reason: `nobody called "${id}" here`, npcs: sys.describe().map(x => x.id) };
    const at = stepUpTo(n);
    return { ok: true, id: n.id, name: n.def.name || null, voice: n.def.voice || null, at, npc: { x: r3(n.x), z: r3(n.z) } };
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
    const m = n.model;
    let mstate = null;
    try { mstate = m.state ? m.state() : null; } catch (_) { mstate = null; }
    const out = { id: n.id, kind: m.kind, height: m.height, visible: m.root.visible, y: +m.root.position.y.toFixed(3),
      behaviour: n.behaviour, pose: mstate, bones: {}, meshes: [] };
    m.root.updateMatrixWorld(true);
    const V = new THREE.Vector3();
    for (const [name, b] of Object.entries(m.bones || {})) { b.getWorldPosition(V); out.bones[name] = [+V.x.toFixed(2), +V.y.toFixed(3), +V.z.toFixed(2)]; }
    m.root.traverse((o) => { if (o.isMesh) out.meshes.push((o.name || o.type) + (o.visible ? '' : ':hidden')); });
    return out;
  });
  /**
   * __DQ.npcSpot(x, z) — may somebody stand here? The same test the people layer is placed by, so a critic can
   * check "never block doorways" and "nobody stands in the Beck" by measurement instead of by eye.
   */
  Db.expose('npcSpot', (x, z) => {
    const m = sys.S.map;
    if (!m) return { ok: false, reason: 'no map loaded' };
    const at = sys.settleAt(+x, +z);
    return {
      ok: !sys.noGoAt(+x, +z), ground: m.groundAt(+x, +z), clear: m.clear(+x, +z, 0.45), inBounds: m.inBounds(+x, +z),
      inDoorway: !sys.noGoAt(+x, +z, false) && sys.noGoAt(+x, +z, true),
      settled: [r3(at.x), r3(at.z)], moved: r3(at.moved),
    };
  });
  /**
   * __DQ.talkShot() — the conversation framing, as numbers. `phi` is where the speaker sat relative to the lens
   * when the beat opened (0 = in front of the hero, ±180 = hidden behind him), `orbit` where the lens was sent,
   * `onScreen` whether the speaker's head actually projects inside the frame right now, and `headPct` how far
   * down the frame it lands. A critic never has to take "the camera frames the speaker" on trust.
   */
  Db.expose('talkShot', () => {
    const S2 = sys.S;
    const n = S2.talkingWith || (S2.speakerId ? sys.byId(S2.speakerId) : null);
    const w = ctx.Field.world();
    const cam = w && w.camera;
    const out = { talking: !!n, id: n ? n.id : null, framed: S2.camFramed || null, orbit: w && w.cameraRig ? w.cameraRig.orbit() : null };
    if (n && cam) {
      try {
        cam.updateMatrixWorld();
        const h = ((n.model && n.model.height) || 1.5) * (n.scale || 1);
        const V = new THREE.Vector3(n.x, n.y + (n.yOff || 0) + h * 0.86, n.z).project(cam);
        out.ndc = [r3(V.x), r3(V.y)];
        out.onScreen = Math.abs(V.x) < 0.95 && Math.abs(V.y) < 0.95 && V.z < 1;
        out.xPct = r3((V.x * 0.5 + 0.5) * 100);
        out.headPct = r3((1 - (V.y * 0.5 + 0.5)) * 100);
        const p = S2.player ? S2.player.p : null;
        if (p) out.heroDist = r3(Math.hypot(n.x - p.x, n.z - p.z));
      } catch (e) { reportError('npc talkShot', e); }
    }
    return out;
  });
  /** __DQ.npcLook() — who everybody is looking at right now, and how much of their attention you have. */
  Db.expose('npcLook', () => sys.describe().map(n => ({ id: n.id, looking: n.looking, attention: n.attention, facing: n.facing, speaking: n.speaking })));
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
