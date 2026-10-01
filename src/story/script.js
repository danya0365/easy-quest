/**
 * script.js — the cutscene engine: a tiny scripting language a writer can read, and the runner that plays it.
 *                                                                             (P26, owner: src/story/script.js)
 *
 * PLUGIN: `install(ctx)` — main.js may import this file and call it like any other plugin (it installs Flags,
 * Quests and the Act I chapter, registers the `cutscene` scene and the __DQ story controls). It also installs
 * itself from a bare `install()` with no context, so a demo page (or a critic's one-liner in the real game) can
 * bring the story up on its own.
 *
 * ── WRITING A SCENE ──────────────────────────────────────────────────────────────────────────────────────────
 *   import { say, narrate, move, face, wait, camera, fade, music, sfx, give, flag, joinParty, choice, shake,
 *            teleport, battle, card, spawn, despawn, act, branch } from '../script.js';
 *
 *   export const b1 = [
 *     music('village'),
 *     narrate('Somebody has left a boot on the stairs. Again.'),
 *     say('halvard', 'Morning, lad. My boots, if you would.'),
 *     move('hero', {x: -2, z: 1}),
 *     face('halvard', 'hero'),
 *     camera.shot({from: {x: 0, y: 1.2, z: 4}, lookAt: 'hero', duration: 1.6}),
 *     choice(['Nod', 'Nod twice'], [[ say('halvard', 'Good lad.') ], [ say('halvard', 'Steady on.') ]]),
 *     give('wooden_sword'), flag('ch1.awake'), camera.follow(), fade('in'),
 *   ];
 *
 * Every builder returns a PLAIN OBJECT ({op: 'say', ...}) so a scene is readable data a writer can diff, and
 * `Story.play(list)` runs it. Nothing in here throws out of the frame loop: a step that fails is reported and the
 * scene carries on, and a scene that is already running refuses a second one instead of tangling.
 *
 * ── THE STEPS ────────────────────────────────────────────────────────────────────────────────────────────────
 *   say(who, text, {name, voice, nod})   one speaker's words. `who` is a CANON char id ('halvard') — the name
 *                                        plate and the glyph voice come from CAST. A run of consecutive
 *                                        say/narrate/flag/sfx/wait/nod steps plays as ONE Dragon Quest
 *                                        conversation (one box, pages, ▼), so the box never blinks mid-scene.
 *   narrate(text)                        no name plate, narrator voice. Tokens: %HERO% %WIFE% %PIP% ...
 *   move(actor, to, {speed, run, wait})  walk somebody somewhere. 'hero' drives the real player (with footsteps
 *                                        and the walk cycle); a cutscene actor walks its own body.
 *   face(actor, target)                  turn to a point, a degree, or another actor's id ('hero').
 *   wait(ms)                             hold.
 *   camera.shot({from, to, lookAt, duration, ease, fov, hold})   the cutscene lens (P09 rig.shot)
 *   camera.release(s) / camera.follow(s) / camera.orbit(deg) / camera.mode(name)
 *   fade('out'|'in'|'white'|'iris'|'flash', {ms, colour})
 *   music(id, {fade}) · sfx(id, {vol, pitch}) · shake({ms, strength})
 *   give(itemId, n) · flag(name, value) · joinParty(charId) · gold(n) adds · gold({set: n}) sets
 *   choice([labels], [[steps], [steps]], {cancel})    a real DQ choice window; branches into story steps
 *   teleport(mapId, x, z, facing)         move the world (used with a fade round it)
 *   battle({area, enemies, boss, scripted, turns})    a fight, awaited; the scene resumes after it
 *   card(title, sub, {ms})               a chapter card ("Ten years pass.")
 *   spawn(id, look, at, opts) / despawn(id)           cutscene actors (P07 bodies, P16 monsters)
 *   act(fn) / branch(cond, thenSteps, elseSteps)      an escape hatch and an if
 *
 * ── THE RUNNER ───────────────────────────────────────────────────────────────────────────────────────────────
 *   Story.play(steps, {id, name, skippable})  -> Promise<{ok, id, ran, skipped}>
 *   Story.skip()             a child can always get out: Cancel (X / Escape) skips, Confirm hurries
 *   Story.running() / Story.state() / Story.scenes() / Story.register(id, steps | fn())
 *   Story.beat(id)           play a registered scene by name (also __DQ.story('b1'))
 * A scene runs with a letterbox and the player's controls locked; every flag it sets is a real CANON flag, so
 * the HUD ribbon, the NPC lines and the map layers all turn over with the story.
 *
 * __DQ: story(id) · storySkip() · storyState() · storyScenes() · storyActors() · state().story
 */
import { Scenes } from '../engine/states.js';
import { Bus } from '../engine/events.js';
import { Debug, reportError } from '../engine/debug.js';
import { Input } from '../engine/input.js';
import { Field } from '../world/field.js';
import { findRoute, pathWhy, standable, PLAN_RADIUS, PLAN_BONUS } from '../world/walk-path.js';
import { StoryLock } from '../world/story-lock.js';
import { Sfx } from '../audio/sfx.js';
import { Transitions } from '../ui/transitions.js';
import { Flags } from './flags.js';
import { Quests } from './quests.js';

const DEG = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
const guard = (where, fn, fallback) => { try { return fn(); } catch (e) { reportError('story ' + where, e); return fallback; } };
const sleep = (ms) => new Promise((res) => setTimeout(res, Math.max(0, ms | 0)));
const stackNow = () => guard('stack', () => Scenes.stack(), []) || [];
const onStack = (name) => stackNow().indexOf(name) >= 0;
/** A writer types "Papa’s boots" and the map file says "Papa's boots". One curly apostrophe must never cost a beat
 *  its staging, so every `at:` lookup compares on this normal form. */
const norm = (s) => String(s == null ? '' : s)
  .replace(/[‘’ʼ`´]/g, "'")
  .replace(/\s+/g, ' ')
  .toLowerCase().trim();

/** A sound the library does not have must not become a reported error — a scene is not broken by a missing tick. */
let SFX_IDS = null;
function playSfx(id, o = {}) {
  if (!id) return null;
  if (!SFX_IDS) SFX_IDS = new Set(guard('sfx list', () => Sfx.list(), []) || []);
  if (!SFX_IDS.has(String(id))) return null;
  return guard('sfx', () => Sfx.play(String(id), o), null);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CAST — one line each: the name on the plate, the glyph voice, and the body to build for a cutscene actor.
// Names and voices are CANON §1. A `who` the table does not know still speaks (as itself, neutral voice).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const CAST = {
  hero: { name: '%HERO%', voice: 'hero', look: null, silent: true },
  halvard: { name: 'Sir Halvard', voice: 'halvard', look: 'halvard' },
  elowen: { name: 'Elowen', voice: 'elowen', look: 'villager:granny' },
  willow: { name: 'Willow', voice: 'willow', look: 'willow' },
  sera: { name: 'Sera', voice: 'sera', look: 'sera' },
  barty: { name: 'Barty', voice: 'barty', look: 'barty' },
  bobble: { name: 'Bobble', voice: 'bobble', look: 'monster:gloop' },
  pip: { name: '%PIP%', voice: 'pip', look: 'monster:gloop' },
  bertie: { name: 'Prince Bertie', voice: 'bertie', look: 'villager:child' },
  mortmain: { name: 'Bishop Mortmain', voice: 'mortmain', look: 'villager:nun' },
  nettle: { name: 'Grandmother Nettle', voice: 'nettle', look: 'villager:granny' },
  quiddle: { name: 'Fennick Quiddle', voice: 'quiddle', look: 'villager:merchant' },
  rowan: { name: '%SON%', voice: 'rowan', look: 'villager:child' },
  linnet: { name: '%DAUGHTER%', voice: 'linnet', look: 'villager:child' },
  rudolpho: { name: 'Lord Rudolpho', voice: 'rudolpho', look: 'villager:merchant' },
  pru: { name: 'Pru', voice: 'pru', look: 'villager:child' },
  quietling: { name: 'a Quietling', voice: 'low:0.9', look: 'villager:nun' },
  narrator: { name: null, voice: 'narrator', look: null },
};
export const castName = (who) => (CAST[who] && CAST[who].name) || null;
export const castVoice = (who) => (CAST[who] && CAST[who].voice) || 'narrator';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE DSL — every builder returns a plain readable object
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const say = (who, text, o = {}) => ({ op: 'say', who: who || 'narrator', text, ...o });
export const narrate = (text, o = {}) => ({ op: 'narrate', text, ...o });
export const move = (actor, to, o = {}) => ({ op: 'move', actor, to, ...o });
export const face = (actor, to, o = {}) => ({ op: 'face', actor, to, ...o });
export const wait = (ms = 400) => ({ op: 'wait', ms });
export const fade = (dir = 'out', o = {}) => ({ op: 'fade', dir, ...o });
export const music = (id, o = {}) => ({ op: 'music', id, ...o });
export const sfx = (id, o = {}) => ({ op: 'sfx', id, ...o });
export const shake = (o = {}) => ({ op: 'shake', ms: 420, strength: 10, ...o });
export const give = (item, n = 1) => ({ op: 'give', item, n });
export const gold = (n) => (typeof n === 'object' && n !== null ? { op: 'gold', ...n } : { op: 'gold', n });
export const flag = (name, value = true) => ({ op: 'flag', name, value });
export const joinParty = (id, o = {}) => ({ op: 'join', id, ...o });
export const teleport = (map, x, z, facing) => ({ op: 'teleport', map, x, z, facing });
export const battle = (o = {}) => ({ op: 'battle', ...o });
export const card = (title, sub = null, o = {}) => ({ op: 'card', title, sub, ms: 2200, ...o });
export const spawn = (id, look, at, o = {}) => ({ op: 'spawn', id, look, at, ...o });
/**
 * `despawn('halvard')` hands a borrowed body back to the field exactly where it stands — the right thing for a scene
 * that borrowed a villager to borrow them. `despawn('halvard', { leave: true })` says he has actually gone: out of
 * the room, out of the map, until a flag says otherwise. See the 'despawn' op and `__DQ.npcLeave`.
 */
export const despawn = (id, o = {}) => ({ op: 'despawn', id, ...o });
export const act = (fn) => ({ op: 'do', fn });
export const nod = (who = 'hero') => ({ op: 'nod', who });
export const emote = (who, what) => ({ op: 'emote', who, what });
export const branch = (cond, then_ = [], else_ = []) => ({ op: 'branch', cond, then: then_, else: else_ });
export const choice = (labels, thens = [], o = {}) => ({ op: 'choice', labels, thens, ...o });

export const camera = {
  shot: (o = {}) => ({ op: 'camera', what: 'shot', ...o }),
  /**
   * camera.two(a, b) — the conversation shot, worked out at runtime from where the two of them are actually
   * standing: the lens swings to the side of the line between them (whichever side it is already on) and frames
   * both. A writer never types a camera position for a talk beat, and the framing is right on every map.
   */
  two: (a, b = 'hero', o = {}) => ({ op: 'camera', what: 'two', a, b, ...o }),
  release: (seconds = 0.9) => ({ op: 'camera', what: 'release', seconds }),
  follow: (seconds = 0.9) => ({ op: 'camera', what: 'release', seconds }),
  drop: () => ({ op: 'camera', what: 'drop' }),
  orbit: (deg) => ({ op: 'camera', what: 'orbit', deg }),
  mode: (name) => ({ op: 'camera', what: 'mode', mode: name }),
  snap: () => ({ op: 'camera', what: 'snap' }),
};

/** The steps that can share ONE Dragon Quest conversation window (P12 script format). */
const TALKY = new Set(['say', 'narrate', 'flag', 'sfx', 'wait', 'nod', 'emote']);

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CUTSCENE ACTORS — bodies the story owns, standing in the live field scene
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
let CharsLib = null, MonstersLib = null, libsAsked = false;
function loadLibs() {
  if (libsAsked) return;
  libsAsked = true;
  import('../art/chars.js').then((m) => { CharsLib = (m && (m.Chars || m.default)) || null; })
    .catch((e) => reportError('story chars', e));
  import('../art/monsters.js').then((m) => { MonstersLib = (m && (m.Monsters || m.default)) || null; })
    .catch((e) => reportError('story monsters', e));
}

const ACTORS = new Map();                  // id -> actor
const STANDINS = new Set();                // ids the story does NOT build a body for: they are already walking
let blobNext = 1;                          // field blob 0 is the hero; actors take 1..capacity-1

/**
 * TWO PAPAS IS WORSE THAN NO CAMERA MOVE. Halvard is a party guest for the whole of Act I, so P18's walking line
 * already has him trailing the boy — and B1 then built a SECOND Halvard by the hearth. A child sees that
 * instantly. So a `spawn` of somebody who is already in the world keeps the one who is there: no body is built,
 * and the scene's framing, its lines and its lens all point at the follower who is really standing in the room.
 */
function followerOf(id) {
  const q = dq();
  if (!q || typeof q.followers !== 'function' || !id) return null;
  const list = guard('followers', () => q.followers(), null);
  if (!Array.isArray(list)) return null;
  const want = String(id).toLowerCase();
  const hit = list.find((f) => f && (String(f.id || '').toLowerCase() === want
    || String(f.name || '').toLowerCase() === String(castName(id) || id).toLowerCase()));
  return hit && Number.isFinite(+hit.x) ? { x: +hit.x, z: +hit.z, y: +hit.y || 0 } : null;
}

/**
 * …AND THE OTHER HALF OF IT: somebody who is not walking with us but is already STANDING on this map.
 *
 * `followerOf` was written for the party (P18's walking line) and it cannot see a person the map's people layer put
 * there. hollybank.npcs.js lists `hb-halvard` — an id, so an exact match on the story's 'halvard' misses — and
 * P11 gives that entry a `char` of 'halvard' too, which is the thing to match on. `describe()` publishes that as
 * `look`, so `look === 'halvard'` is the one comparison that reliably says "this body is that character".
 *
 * The NAME is deliberately NOT a fallback: a beat says `spawn('halvard')` but his nameplate in this room is 'Papa',
 * and CANON §5 B12 wants Barty introduced as "Barty Marrow". One person, two labels, so a name match would find
 * nothing here and would find the WRONG man in a room where a nickname happens to collide. `char` is the identity;
 * a name is a caption.
 *
 * Returns the field's own describe() row, so the caller gets his position and can stand a shot on him.
 */
function fieldNpc(id) {
  const q = dq();
  if (!q || typeof q.npcs !== 'function' || !id) return null;
  const list = guard('npcs', () => q.npcs(), null);
  if (!Array.isArray(list)) return null;
  const want = String(id).toLowerCase();
  // `hidden` is deliberately NOT part of this test. `npcTake` sets it, and the body is meant to be visible while
  // the scene has it — so a borrow lookup that skipped hidden men could never FIND the one it had just taken, and
  // `pointOf` would hand the scene a null spot for the rest of the beat.
  const hit = list.find((n) => n && n.kind === 'person'
    && (String(n.id || '').toLowerCase() === want
      || String(n.id || '').toLowerCase().endsWith('-' + want)
      || String(n.look || '').toLowerCase() === want));
  return hit && Number.isFinite(+hit.x) ? hit : null;
}

/**
 * Which bodies this scene is BORROWING from the field, so `killAllActors` (map change, skip, tear-down) can hand
 * every one of them back. A borrowed body is not in ACTORS — nothing to kill — but if the map goes away while it is
 * lent out, the cottage is left one Papa short and the next visit finds a hole where a person was standing.
 */
const BORROWED = new Map();                          // story id -> the FIELD's own id for him (they are rarely equal)
/** The field's id for a borrowed body, or null. `npcTake`/`npcGo`/`npcFace` all speak the MAP's vocabulary. */
const byId = (storyId) => BORROWED.get(storyId) || null;
function returnBorrowed() {
  const q = dq();
  for (const [id, fieldId] of BORROWED) guard('return borrowed', () => { if (q && q.npcTake) q.npcTake(fieldId, false); });
  BORROWED.clear();
}

/**
 * A WILD MONSTER MUST NOT WALK INTO A CUTSCENE. The hero's legs are only driven while the field is the top scene,
 * so a `move('hero', ...)` step has to take the overlay down for a second or two — and P31 counts those paces like
 * any others. Three of the Act's beats put a fight on screen *over* the story that way. Resetting the pace counter
 * before every scripted walk leaves a whole threshold of walking before the next wild fight.
 *          NEEDS (P31 src/world/encounter.js): a real `Encounter.pause(token, on)` so this does not have to borrow
 *          `soon()`, which also clears the post-defeat grace period.
 */
let EncLib = null;
function calmEncounters() {
  if (EncLib === null) {
    EncLib = false;
    import('../world/encounter.js').then((m) => { EncLib = (m && (m.Encounter || m.default)) || false; }).catch(() => { EncLib = false; });
    return;
  }
  if (EncLib && typeof EncLib.soon === 'function') guard('calm encounters', () => EncLib.soon(1e6));
}

function makeActor(id, look, at = {}, opts = {}) {
  const w = Field.world();
  if (!w || !w.scene) return null;
  const spec = String(look || (CAST[id] && CAST[id].look) || 'villager');
  let body = null, kind = 'chars';
  if (spec.startsWith('monster:')) {
    if (!MonstersLib) return null;
    body = guard('Monsters.build', () => MonstersLib.build(spec.slice(8)), null);
    kind = 'monster';
  } else {
    if (!CharsLib) return null;
    const [base, variant] = spec.split(':');
    body = guard('Chars.build', () => CharsLib.build(base, Object.assign({ variant }, opts.build || {})), null);
  }
  if (!body || !body.root) return null;
  // A NAME THE MAP DOES NOT KNOW MUST NOT PUT SOMEBODY AT THE ORIGIN. The first version spawned Papa at (0, 0)
  // whenever a prop had been renamed, which in a 14x12 cottage is the middle of the floor. Fall back to a step in
  // front of the boy, where a person standing is always legible.
  const spot = pointOf(at) || pointOf({ ahead: 2.3, side: -0.8 }) || {};
  let x = Number.isFinite(+spot.x) ? +spot.x : 0, z = Number.isFinite(+spot.z) ? +spot.z : 0;
  // …and nobody arrives ON the lens either: a body that spawns where the camera is holding fills the whole frame
  guard('spawn clear of lens', () => {
    const cam = w.camera;
    if (!cam) return;
    for (let i = 0; i < 3; i++) {
      const dx = x - cam.position.x, dz = z - cam.position.z, d = Math.hypot(dx, dz);
      if (d > 1.3) return;
      const ux = d > 0.01 ? dx / d : 0.7, uz = d > 0.01 ? dz / d : 0.7;
      let nx = x + ux * 1.1, nz = z + uz * 1.1;
      if (w.map && w.map.resolve) { const r = w.map.resolve(nx, nz, 0.4); nx = r.x; nz = r.z; }
      x = nx; z = nz;
    }
  });
  const y = w.map ? w.map.walkY(x, z) : 0;
  body.root.position.set(x, y, z);
  // an actor with nowhere to look faces the boy: a spawned body standing with its back to the hero reads as a bug
  const face0 = Number.isFinite(+(at && at.facing)) ? +at.facing : (Number.isFinite(+opts.facing) ? +opts.facing : null);
  let yaw;
  if (face0 !== null) yaw = face0 * DEG;
  else { const p = Field.player(); yaw = p ? Math.atan2(p.x - x, p.z - z) : 0; }
  if (kind === 'monster') body.root.rotation.y = yaw; else guard('setFacing', () => body.setFacing(yaw, true));
  if (Number.isFinite(+opts.scale)) body.root.scale.setScalar(+opts.scale);
  w.scene.add(body.root);
  const a = { id, kind, body, look: spec, x, z, y, yaw, speed: 0, blob: -1, path: null,
    height: (body.height || 1.5) * (Number.isFinite(+opts.scale) ? +opts.scale : 1) };
  if (w.blobs && blobNext < w.blobs.capacity) a.blob = blobNext++;
  ACTORS.set(id, a);
  if (kind === 'monster') guard('monster idle', () => body.play('idle'));
  return a;
}

function killActor(id) {
  const a = ACTORS.get(id);
  if (!a) return false;
  guard('actor remove', () => { a.body.root.removeFromParent(); if (a.body.dispose) a.body.dispose(); });
  const w = Field.world();
  if (w && w.blobs && a.blob >= 0) guard('blob hide', () => { w.blobs.hide(a.blob); w.blobs.commit(); });
  ACTORS.delete(id);
  return true;
}
function killAllActors() { for (const id of Array.from(ACTORS.keys())) killActor(id); STANDINS.clear(); returnBorrowed(); blobNext = 1; }

/**
 * Where is somebody, or something? A writer never types coordinates from another piece's map file into a scene:
 *   'hero' | an actor id | {x, z} | 'spawn' | "at:Papa's boots"  (any prop, chest or exit by NAME, or by type)
 * so when P23 moves the boots the scene follows them.
 */
function pointOf(target) {
  if (!target) return null;
  if (typeof target === 'object' && Number.isFinite(+target.x) && Number.isFinite(+target.z)) return { x: +target.x, z: +target.z };
  // RELATIVE staging — {ahead, side} in the boy's own frame (+ahead = in front of him, +side = to his right).
  // A scene written this way stages itself correctly on any map, which is what lets a beat whose own map is not
  // built yet still play properly where the player is standing.
  if (typeof target === 'object' && (target.ahead !== undefined || target.side !== undefined)) {
    const p = Field.player();
    if (!p) return null;
    const yaw = (+p.facing || 0) * DEG;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const a = +target.ahead || 0, s = +target.side || 0;
    let x = p.x + fx * a + rx * s, z = p.z + fz * a + rz * s;
    const m = Field.world() && Field.world().map;
    if (m && m.resolve) { const r = m.resolve(x, z, 0.4); x = r.x; z = r.z; }        // never inside a wall
    return { x, z };
  }
  // AN INTERIOR'S OWN DOORSTEP — the tile OUTSIDE this map's front door. The only spot a beat can name that means
  // "he has gone out", and the one a player would point at: an interior's exit carries the landing it sends the boy
  // to, so this is read from the map rather than written down as a number that would rot with the room.
  if (typeof target === 'string' && target === '__doorstep') {
    const w = Field.world();
    const m = w && w.map;
    const e = m && (m.exits || []).find(x => x && x.back && Number.isFinite(+x.back.x));
    if (!e) return null;
    // `e.back` IS NOT THE DOORSTEP — READ IT BEFORE ASSUMING SO. It is the tile an interior drops the boy on when
    // he comes IN, and for the cottage that is two steps inside the room (`SPOTS.door`, z 3.0, on a floor that runs
    // to z 5.3). A father sent to the "doorstep" by that number stopped short of his own front door and then
    // vanished from it.
    //
    // Nor is `e.w`, the exit's own BAND: for the cottage that is 7.8 of a room 12.6 wide, so "just past the edge of
    // the band" put him at x +1.6 — the far east wall — and he walked the whole length of the south side of the room
    // to get there. The DOOR is the prop, 1.3 wide, and it has a name. `back` and that prop are not on one line —
    // `back` is where a boy ARRIVES, two steps in — so the only axis the exit states for certain is the one from
    // `back` through the prop, which is straight out. Carry it a stride past the door frame and let `resolve` have
    // the last word: there is nothing outside these walls for a man to stand in, and the reader's one true image
    // is a father in his own doorway.
    const want = norm(e.name || 'the front door');
    const prop = (m.props || []).find(p => norm(p.name) === want) || (m.props || []).find(p => /door/i.test(String(p.type || '')));
    const ax = prop ? +prop.x - +e.back.x : 0, az = prop ? +prop.z - +e.back.z : 0;
    const d = Math.hypot(ax, az);
    const out = prop && d > 0.01
      ? { x: +prop.x + (ax / d) * 0.7, z: +prop.z + (az / d) * 0.7 }
      : { x: +e.back.x, z: +e.back.z };
    if (m.resolve) { const r = m.resolve(out.x, out.z, 0.4); out.x = r.x; out.z = r.z; }   // not inside a wall
    return out;
  }
  const id = String(target);
  if (id === 'hero' || id === 'player') {
    const p = Field.player();
    return p ? { x: p.x, z: p.z } : null;
  }
  const a = ACTORS.get(id);
  if (a) return { x: a.x, z: a.z };
  if (STANDINS.has(id)) { const f = followerOf(id); if (f) return { x: f.x, z: f.z }; }
  // a body borrowed from this map's people layer — same answer, from the field's own describe()
  if (BORROWED.has(id)) { const f = fieldNpc(byId(id)); if (f) return { x: +f.x, z: +f.z }; }
  const w = Field.world();
  const m = w && w.map;
  if (!m) return null;
  if (id === 'spawn') return { x: m.spawn.x, z: m.spawn.z };
  if (id.startsWith('at:')) {
    const want = norm(id.slice(3));
    const pool = [].concat(m.props || [], m.chests || [], m.exits || []);
    const hit = pool.find((p) => norm(p.name) === want)
      || pool.find((p) => want && norm(p.name).includes(want))
      || pool.find((p) => norm(p.type || p.kind) === want);
    if (hit && Number.isFinite(+hit.x)) {
      const hx = +hit.x, hz = +hit.z;
      // STAND BESIDE IT, ON THE SIDE HE IS COMING FROM — the straight line from him. The mark is the thing itself,
      // offset out of its own collider, and the direction is what makes it usable: a chest deep inside the bed, or
      // the back of a wardrobe, is not somewhere a boy can be sent to stand.
      const reach = Number.isFinite(+hit.reach) ? +hit.reach : 1.1;
      const off = Math.min(1.4, Math.max(0.9, reach * 0.6));
      const p = Field.player();
      let dx = 0, dz = 0;
      if (p) { dx = p.x - hx; dz = p.z - hz; }
      const d = Math.hypot(dx, dz);
      if (d < 1e-3) { dx = 0; dz = 1; } else { dx /= d; dz /= d; }
      // …but a mark a body can never stand ON is what sends a walk round the furniture. A chest is a 0.36 circle
      // and the boy is 0.35, so a mark only 0.96 off its centre is still inside him: he was told to walk into it, was
      // pushed out every frame, and paced. Anything inside a collider is pushed out along the line he is walking, to
      // the first spot his own body fits, which is a spot the beat can still reach and open.
      const mark = { x: hx + dx * off, z: hz + dz * off };
      if (m.resolve) {
        const r = m.resolve(mark.x, mark.z, PLAN_RADIUS + PLAN_BONUS);
        mark.x = r.x; mark.z = r.z;
      }
      // …and say WHICH THING, and how near it has to be. The mark is an internal mark: it is the chest plus a
      // deliberate offset, so "how far from the mark did he stop" is a number about the planner's own scaffolding and
      // not one a player could check. The question a player asks is whether he ended up close enough to OPEN it, which
      // is the thing's own reach. Without this the only honest way to measure an arrival was to know the chest's
      // position independently, and `describe()` replaces every array with a count, so it is not readable.
      mark.thing = { x: +hx.toFixed(2), z: +hz.toFixed(2), name: String(hit.name || hit.type || ''), reach };
      return mark;
    }
    return null;
  }
  const spots = m.def && m.def.spots;
  if (spots && spots[id] && Number.isFinite(+spots[id].x)) return { x: +spots[id].x, z: +spots[id].z };
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE RUNNER
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const SCENES = new Map();                  // id -> steps | () => steps
const R = {
  playing: null,                           // {id, name, steps, i, skipped, started}
  hurry: 0, skipReq: false,
  lost: false,                             // P25: set when a scripted fight is lost; ends the scene (runList stops)
  staged: false, blocked: false,
  hero: null,                              // the live hero walk {tx, tz, speed, t, timeout, resolve}
  letterbox: null, cardWin: null,
  history: [], installed: false, ctx: null, autoplay: true,
  shakeT: 0, shakeMs: 0, shakeAmp: 0,
  keys: false, unstaging: null,
  lastPlay: null,                               // what the last storyPlay actually did — see Story.play
  heart: { n: 0, last: 0, tail: '' },
};
try { if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('story') === 'off') R.autoplay = false; } catch (_) {}

const dq = () => (typeof window !== 'undefined' && window.__DQ) || null;

// ── the letterbox: two bars and a "skip" word, so a child can see this is a story and how to leave it ────────
function installCss() {
  if (typeof document === 'undefined' || document.getElementById('story-css')) return;
  const el = document.createElement('style');
  el.id = 'story-css';
  el.textContent = `
/* The bars sit ABOVE the canvas and BELOW every DQ window. The canvas is a non-positioned block, so any fixed
   element with z-index >= 0 paints over it; F4's window layer (.dq-ui) is z-index 10, so 5 puts the letterbox
   between them. (z-index -1 put it behind the canvas in /index.html, where #game-root is the containing block —
   the bars were invisible in the real game and only looked right in the demo.) */
#story-bars{position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;transition:opacity .34s ease}
#story-bars.on{opacity:1}
#story-bars .bar{position:absolute;left:0;right:0;height:7%;background:var(--pal-ui-shadow,#0b0d17);
  box-shadow:0 0 calc(30 * var(--u,1px)) rgba(0,0,0,.55)}
#story-bars .bar.t{top:0;transform:translateY(-100%);transition:transform .38s cubic-bezier(.2,.8,.25,1)}
#story-bars .bar.b{bottom:0;transform:translateY(100%);transition:transform .38s cubic-bezier(.2,.8,.25,1)}
#story-bars.on .bar.t,#story-bars.on .bar.b{transform:translateY(0)}
#story-bars .skip{position:absolute;right:calc(28 * var(--u,1px));bottom:calc(20 * var(--u,1px));
  font:700 calc(20 * var(--u,1px))/1.2 var(--dq-font,system-ui,sans-serif);color:var(--pal-ui-text-dim,#cfd6ff);
  letter-spacing:.04em;opacity:.8;text-shadow:0 calc(2 * var(--u,1px)) 0 rgba(0,0,0,.6);
  pointer-events:auto;cursor:pointer;background:none;border:0;padding:calc(6 * var(--u,1px)) calc(10 * var(--u,1px))}
#story-bars .skip:hover{opacity:1;color:var(--pal-ui-cursor,#fff)}
#story-card{position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;z-index:41;opacity:0;
  transition:opacity .5s ease}
#story-card.on{opacity:1}
#story-card .in{text-align:center;padding:0 6vw}
#story-card .t{font:700 calc(56 * var(--u,1px))/1.1 var(--dq-font,system-ui,sans-serif);color:var(--pal-ui-text,#fff);
  text-shadow:0 calc(4 * var(--u,1px)) 0 rgba(0,0,0,.65)}
#story-card .s{margin-top:calc(14 * var(--u,1px));font:500 calc(24 * var(--u,1px))/1.3 var(--dq-font,system-ui,sans-serif);
  color:var(--pal-ui-text-dim,#cfd6ff)}`;
  document.head.appendChild(el);
}

function bars(on) {
  if (typeof document === 'undefined') return;
  installCss();
  if (!R.letterbox) {
    const root = document.getElementById('ui-root') || document.body;
    const el = document.createElement('div');
    el.id = 'story-bars';
    el.innerHTML = '<div class="bar t"></div><div class="bar b"></div><button type="button" class="skip">skip &#9654;</button>';
    root.appendChild(el);
    // A CHILD MUST ALWAYS BE ABLE TO GET OUT. On a phone there is no X key, so the word itself is the button.
    guard('skip button', () => el.querySelector('.skip').addEventListener('click', () => Story.skip()));
    R.letterbox = el;
  }
  R.letterbox.classList.toggle('on', !!on);
}

/**
 * The skip key, listened for on the page and not only in the cutscene scene.
 * Nearly every second of a cutscene has a Dragon Quest message box open, and the dialogue scene (P12) uses Cancel
 * to close the page it is on — so it never reaches the cutscene scene underneath. Without this, the word "skip" on
 * the letterbox was a lie for the whole of a conversation.
 */
function skipKey(e) {
  if (!R.playing || !e || e.repeat) return;
  const k = String(e.key || '');
  if (k !== 'Escape' && k !== 'x' && k !== 'X' && k !== 'Backspace') return;
  if (onStack('battle')) return;                 // a fight is the child's to finish, not the story's to unwind
  Story.skip();
}
function installKeys() {
  if (typeof document === 'undefined' || R.keys) return;
  R.keys = true;
  guard('skip key', () => document.addEventListener('keydown', skipKey, true));
}

/**
 * The field HUD steps aside for a scene. A cutscene needs a clean frame: the ribbon, the place card, the minimap
 * and above all the little "Z — Talk to Linnet" prompt (the field is briefly the top scene again while the hero's
 * legs are driven) do not belong over the moment Papa hands over his boots. P32 already publishes the switch.
 */
function hud(on) {
  const q = dq();
  if (q && typeof q.hudShow === 'function') guard('hud', () => q.hudShow(!!on));
}

/** Take the overlay down WHEREVER it is in the stack. A battle or a menu that opened over a scene must never
 *  leave the letterbox nailed across the screen for the rest of the game. */
function unstage() {
  // the bars stay up while a scene is still running: a `move('hero', ...)` step has to hand the field back for a
  // second or two to drive his legs, and a letterbox that blinked off and on again at every walk looked broken
  if (!R.playing) bars(false);
  if (Scenes.top() === 'cutscene') { guard('pop cutscene', () => Scenes.pop()); return; }
  if (!onStack('cutscene')) return;
  if (R.unstaging) return;
  R.unstaging = setInterval(() => {
    if (!onStack('cutscene')) { clearInterval(R.unstaging); R.unstaging = null; return; }
    if (R.staged) { clearInterval(R.unstaging); R.unstaging = null; return; }   // a new scene took it over
    if (Scenes.top() === 'cutscene') {
      guard('pop cutscene', () => Scenes.pop());
      clearInterval(R.unstaging); R.unstaging = null;
    }
  }, 150);
}

async function showCard(title, sub, ms) {
  if (typeof document === 'undefined') return;
  installCss();
  const root = document.getElementById('ui-root') || document.body;
  let el = R.cardWin;
  if (!el) {
    el = document.createElement('div');
    el.id = 'story-card';
    root.appendChild(el);
    R.cardWin = el;
  }
  el.innerHTML = '';
  const inn = document.createElement('div'); inn.className = 'in';
  const t = document.createElement('div'); t.className = 't'; t.textContent = String(title || '');
  inn.appendChild(t);
  if (sub) { const s = document.createElement('div'); s.className = 's'; s.textContent = String(sub); inn.appendChild(s); }
  el.appendChild(inn);
  el.classList.add('on');
  await holdFor(Math.max(400, ms | 0));
  el.classList.remove('on');
  await sleep(R.skipReq ? 120 : 520);
}
function hideCard() { try { if (R.cardWin) R.cardWin.classList.remove('on'); } catch (_) {} }

// ── the cutscene scene: it eats the controls and hands back Cancel = skip, Confirm = hurry ───────────────────
const cutsceneScene = {
  opaque: false,
  updateBelow: true,
  enter() { bars(true); },
  exit() {},
  update() {},
  render() {},
  onInput(btn) {
    if (btn === 'cancel' || btn === 'menu') { Story.skip(); return true; }
    // Confirm hurries the beat along, and the HUD says so: `hud(true)` puts up "Confirm — hurry". It was a flag,
    // so `holdFor` cleared it once and the next `wait` waited its full length; it is a counter now, one spent per
    // wait, so a few taps runs the beat at reading pace. A key HELD down still cannot: confirm is the one button
    // that does not auto-repeat (REPEAT.buttons is DIRS only, and that is right — a held confirm must not skip),
    // so it delivers one press and there is no second press to queue. Tapping is the gesture this beat wants.
    if (btn === 'confirm' || btn === 'run') { R.hurry++; return true; }
    return true;                                     // everything else is swallowed: no walking off mid-scene
  },
};

function stage(on) {
  if (on === R.staged) return;
  R.staged = on;
  if (!on) { unstage(); return; }
  if (onStack('cutscene')) { bars(true); return; }        // already staged, just sitting under something
  if (Scenes.has('cutscene') && Scenes.top() === 'field') guard('push cutscene', () => Scenes.push('cutscene'));
  else bars(true);
}
/** The hero can only walk while the FIELD is the top scene (that is where his legs are driven), so a walk step
 *  takes the overlay down and locks the pad instead. Two seconds without a skip button beats a sliding statue. */
function lockPad(on) {
  if (on === R.blocked) return;
  R.blocked = on;
  guard('input block', () => Input.block('story.cutscene', on));
}

// ── the hero's legs: velocity written after the field's tick, so player.update carries him next tick ─────────
const DECAY = 0.7333;                         // what player.update keeps of last tick's velocity with no stick

// The pathfinder lives in src/world/walk-path.js now (P25) — the people layer needs it too, because a father who
// says he is walking to the door has to be able to walk round a chair. `findRoute`, `standable`, the plan radii and
// the search's own complaint (`pathWhy`) all come from there; the header comment went with it.

/** Is this spot free for the boy's real body, the circle `m.move` actually resolves him with? */
function bodyFits(m, x, z) {
  if (!m || typeof m._deepest !== 'function') return true;
  return !guard('path body', () => m._deepest(x, z, PLAN_RADIUS + PLAN_BONUS), false);
}

function tickHero(dt) {
  const H = R.hero;
  if (!H) return;
  const w = Field.world();
  const pl = w && w.player;
  if (!pl || !w.map) { const f = H.resolve; R.hero = null; if (f) f(false); return; }
  const p = pl.p;
  H.t += dt;
  R.heart.n++; R.heart.last = (typeof performance !== 'undefined' ? performance.now() : 0);
  // GROUND COVERED, COUNTED. Path length over displacement is what separates "he took the long way round" from "he is
  // going in circles", and it is the shape of the bug as a player would describe it. It must be measured off the
  // BOY, never off his velocity: `p.vx` is a wish, not a movement, and while the field is not the top scene the
  // player's `hold()` only zeroes it. Watching velocity instead measured a walk that was not happening at all, and
  // reported "no progress" for a boy who was in fact crossing the cottage.
  if (H.px !== undefined) H.path += Math.hypot(p.x - H.px, p.z - H.pz);
  H.px = p.x; H.pz = p.z;

  // Follow the PLANNED route, not the straight line. A waypoint is reached and forgotten, and the last one is the
  // standing tile beside the mark — the mark itself is inside a chest, and a walk that keeps aiming at the inside of a
  // chest is a walk that paces and circles, which is what the player reported.
  const route = H.route;
  if (route && route.length) {
    while (route.length && Math.hypot(route[0].x - p.x, route[0].z - p.z) <= 0.16) route.shift();
  }
  const aim = (route && route.length) ? route[0] : { x: H.ex, z: H.ez };
  if (H.aim !== aim) { H.aim = aim; H.path = 0; H.from = p.x; H.fz = p.z; H.covered = 0; }   // a new leg: the loop count starts again
  const dx = aim.x - p.x, dz = aim.z - p.z, d = Math.hypot(dx, dz);
  const last = !route || !route.length;
  const close = last && d <= (H.stop || 0.22);

  // THE SHUFFLE BACKSTOP, AND THE CLOCK. Both are here because both of them are the reported bug — "he walks a loop
  // and will not stop" — and both were once written `if (last && …)`, which is exactly what let it through.
  //
  // `last` means "this is the final waypoint". A walk whose LAST waypoint is one his body cannot quite touch is not
  // "on the last waypoint" in any sense: the waypoint is never retired, the route never empties, and with every
  // guard gated on `last` nothing was ever allowed to end the walk. He stood at one spot — a spot the probe calls
  // clear — vibrating at a third of a walking pace, for THIRTY-SIX SECONDS, and the step only finished because the
  // player's own keypresses ran out. Neither the clock nor the stall check may be conditional on anything but
  // whether the walk is making progress.
  //
  // The check is on PROGRESS, not on being blocked: a corner assist sliding him a few hundredths sideways is normal
  // and stops on its own, while pacing, circling and grinding all share the one signature that matters — the walk is
  // not going anywhere. Along the route that is the sum of what is left; at the end, where the waypoint is the only
  // thing left, the distance to it. Measuring the waypoint there is what makes the two comparable: a route of two
  // corners falls 0.6 at a time and a boy pacing one tile falls 0.006 at a time, and only the second one is a bug.
  const leg = H.path / Math.max(0.25, Math.hypot(p.x - H.from, p.z - H.fz));
  const remaining = last ? d : route.reduce((a, w2) => a + Math.hypot(w2.x - p.x, w2.z - p.z), 0);
  // …AND PROGRESS IS GROUND COVERED, NOT GROUND CLOSED. The obvious reading — did the remaining distance shrink since
  // last frame — is the one that just broke a working beat: the margin is 0.02, so a walk moving slower than about 1.2
  // a second never shrinks the remainder by that much in a frame, and every SLOW WALK READ AS STALLED. B1's own
  // approach to the water pot did, at a perfectly good half pace, and was cut off half a room from its target:
  //
  //   walk hero: stalled 56.53 short of "at:the water pot"
  //   no progress for 0.80s, 0.4 units walked for 0.4 of ground
  //
  // One for one. He was walking. The number that is honest at every pace is how much ground he has covered since the
  // leg began, and a walk that paces one tile covers a great deal of it while going precisely nowhere — which is why
  // `leg` is a separate test below rather than part of this one.
  if (H.path - H.covered > PLAN_BONUS) { H.covered = H.path; H.best = remaining; H.stall = 0; } else { H.stall += dt; }
  R.heart.tail = `rem=${remaining.toFixed(2)} best=${(H.best === Infinity ? 'inf' : H.best.toFixed(2))} stall=${H.stall.toFixed(2)} leg=${leg.toFixed(2)} d=${d.toFixed(2)} route=${route ? route.length : 'none'}`;
  if (H.stall > 0.8 || leg > 3 || d < 1e-3) {
    R.heart.tail = 'STALL ' + R.heart.tail;
    p.vx = 0; p.vz = 0;
    guard('hero halt', () => pl.halt());
    if (d >= 1e-3) {
      reportError(`walk hero: stalled ${remaining.toFixed(2)} short of "${typeof H.to === 'string' ? H.to : JSON.stringify(H.to)}"`,
        new Error(`no progress for ${H.stall.toFixed(2)}s, ${H.path.toFixed(1)} units walked for ${Math.hypot(p.x - H.from, p.z - H.fz).toFixed(1)} of ground, waypoint (${aim.x.toFixed(2)},${aim.z.toFixed(2)}) which his body ${bodyFits(w.map, aim.x, aim.z) ? 'fits' : 'does not fit'}`));
    }
    const f = H.resolve; R.hero = null;
    if (f) f(d < 1e-3);
    return;
  }

  if (close || H.t >= H.timeout) {
    R.heart.tail = (close ? 'CLOSE' : 'TIMEOUT') + ' ' + R.heart.tail;
    p.vx = 0; p.vz = 0;
    guard('hero halt', () => pl.halt());
    if (!close && !H.route) {
      // RAN OUT OF TIME with no route to follow. Only this case may drop him on the mark, and only because it is
      // what an open field needs when the search found nothing to plan. Said plainly, because a scene that silently
      // teleports the hero is worse than one that stops early — and a beat that HAS a route must never get here: if
      // the route ran out, he did not arrive, and the step reports failure rather than moving him.
      guard('hero place', () => pl.place(H.tx, H.tz, Math.atan2(dx, dz), true));
    }
    const f = H.resolve; R.hero = null;
    if (f) f(close || !H.route);
    return;
  }
  p.yawT = Math.atan2(dx, dz);
  R.heart.tail += ' WALK';
  const v = Math.min(H.speed, d * 4 + 0.35);                  // ease in to the mark instead of stopping dead
  p.vx = (dx / d) * v / DECAY;
  p.vz = (dz / d) * v / DECAY;
}

function walkHero(to, o = {}) {
  const pt = pointOf(to);
  const w = Field.world();
  const pl = w && w.player;
  if (!pt || !pl || !w.map) return Promise.resolve(false);
  // THE MARK, READ BEFORE THE SEARCH MOVES THE PLAYER. `findRoute` re-points the search start at the STARTING cell's
  // centre for its path, but nothing here moves the boy — and yet the mark, being offset from the boy along their
  // joining line, moves with him. Measured from after a route is planned, every mark in a chase is a step further
  // along than it was when the walk began, and the distance at the end reads as a miss. Read once, on arrival.
  const mark = { x: pt.x, z: pt.z };
  const d = Math.hypot(pt.x - pl.p.x, pt.z - pl.p.z);
  if (d < 0.25) return Promise.resolve(true);
  // A scripted walk is a little brisker than the player's own walk. A beat that has to send him across a cottage and
  // back up the stair is a beat the player is watching, and at the player's 2.1 the same route takes a shade over ten
  // seconds of him trundling — long enough, on the chest step, to look like a bug rather than a walk. 2.6 is still
  // well inside the player's run, so nothing about it reads as a hurry the boy did not ask for.
  const speed = Number.isFinite(+o.speed) ? +o.speed : (o.run ? 4.2 : 2.6);
  // The route is planned ONCE, up front — a search per frame would be a hundred searches a second for one step.
  const route = guard('hero route', () => findRoute(w.map, pl.p.x, pl.p.z, pt.x, pt.z), null);
  // Say so when there is nowhere to walk TO. A target that does not resolve used to look identical to a walk that
  // finished: the step returned, the beat carried on, and the boy stood exactly where he was. B1's chest is a real
  // chest, but a mark that no longer matches anything would leave the beat silently do nothing — and on screen
  // that reads as the same jam-and-teleport bug this pathfinder was written to remove.
  if (!route) {
    reportError(`walk hero: no route to "${typeof to === 'string' ? to : JSON.stringify(to)}"`, new Error(pathWhy() || 'target did not resolve to a place he can stand'));
  }
  return new Promise((res) => {
    // `ex/ez` is the last waypoint — the standing tile — and it is the END of the walk. The route ends there on
    // purpose, so with no route at all the mark itself is the only place he could finish; `findRoute` returns null
    // exactly when nothing is standable, and that case is reported above rather than walked.
    const end = (route && route.length) ? route[route.length - 1] : pt;
    R.hero = { tx: mark.x, tz: mark.z, ex: end.x, ez: end.z, to, speed, t: 0, stop: Number.isFinite(+o.stop) ? +o.stop : 0.22, route,
      best: Infinity, stall: 0, path: 0, covered: 0, aim: null,
      // a routed walk is longer than the straight line and climbs stairs, so it gets a proportionally longer clock
      timeout: Number.isFinite(+o.timeout) ? +o.timeout : Math.max(1.5, (route ? d * 3.2 : d) / Math.max(0.6, speed) * 2.6 + 1.2), resolve: res };
  });
}

// ── an actor's own legs ──────────────────────────────────────────────────────────────────────────────────────
function walkActor(a, to, o = {}) {
  const pt = pointOf(to);
  if (!pt) return Promise.resolve(false);
  const speed = Number.isFinite(+o.speed) ? +o.speed : 1.9;
  const d = Math.hypot(pt.x - a.x, pt.z - a.z);
  if (d < 0.1) return Promise.resolve(true);
  return new Promise((res) => {
    a.path = { tx: pt.x, tz: pt.z, speed, t: 0, timeout: Math.max(1.4, d / speed * 2.4 + 1.2), resolve: res };
  });
}

function tickActors(dt) {
  const w = Field.world();
  const m = w && w.map;
  let touched = false;
  for (const a of ACTORS.values()) {
    const P = a.path;
    if (P) {
      P.t += dt;
      const dx = P.tx - a.x, dz = P.tz - a.z, d = Math.hypot(dx, dz);
      if (d <= 0.12 || P.t >= P.timeout) {
        a.x = P.tx; a.z = P.tz; a.speed = 0; a.path = null;
        const f = P.resolve; if (f) f(true);
      } else {
        const step = Math.min(d, P.speed * dt);
        a.x += (dx / d) * step; a.z += (dz / d) * step;
        a.yaw = Math.atan2(dx, dz);
        a.speed = P.speed;
      }
    } else if (a.speed) a.speed = Math.max(0, a.speed - dt * 6);
    if (a.kind === 'monster') { a.body.root.rotation.y = a.yaw; guard('monster tick', () => a.body.update(dt)); }
    if (m) a.y = m.walkY(a.x, a.z);
    a.body.root.position.set(a.x, a.y, a.z);
    if (a.kind === 'monster') { a.body.root.rotation.y = a.yaw; guard('monster tick', () => a.body.update(dt)); }
    else guard('char tick', () => { a.body.setFacing(a.yaw); a.body.setMove(a.speed, { run: false }); a.body.update(dt); });
    if (w && w.blobs && a.blob >= 0) { w.blobs.set(a.blob, a.x, a.y, a.z, 0.85 * (a.height / 1.6)); touched = true; }
  }
  if (touched && w.blobs) guard('blob commit', () => w.blobs.commit());
}

/**
 * A LENS INSIDE SOMEBODY'S HEAD is the worst frame the story can produce: B9's low, wide "look at the sky" shot
 * put the boom exactly where the Bishop was standing, and the great throat-tightener of Act I played as one
 * enormous nose. The lens must clear every body in the scene, not only the walls.
 */
function lensClear(x, z, gap = 1.0) {
  const p = Field.player();
  if (p && Math.hypot(p.x - x, p.z - z) < gap) return false;
  for (const a of ACTORS.values()) if (Math.hypot(a.x - x, a.z - z) < gap) return false;
  for (const id of STANDINS) { const f = followerOf(id); if (f && Math.hypot(f.x - x, f.z - z) < gap) return false; }
  // A LENT BODY IS STILL A BODY IN THE ROOM — that is the whole point of lending it instead of hiding it — so the
  // boom may not sit where he is standing either, or the shot frames an empty chair beside a body nobody drew.
  for (const id of BORROWED.keys()) { const f = fieldNpc(byId(id)); if (f && Math.hypot(f.x - x, f.z - z) < gap) return false; }
  return true;
}

// ── the screen shake (CEREMONY, and the only way a stone door lands) ────────────────────────────────────────
function tickShake(dt) {
  if (R.shakeT <= 0) return;
  R.shakeT -= dt * 1000;
  const el = typeof document !== 'undefined' ? document.getElementById('game-canvas') : null;
  if (!el) { R.shakeT = 0; return; }
  if (R.shakeT <= 0) { el.style.transform = ''; return; }
  const k = R.shakeT / Math.max(1, R.shakeMs);
  const a = R.shakeAmp * k * k;
  el.style.transform = `translate(${(Math.random() - 0.5) * a}px, ${(Math.random() - 0.5) * a}px)`;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// compiling a run of talky steps into ONE Dragon Quest conversation (P12 script format)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const HERO_NAME = () => guard('hero name', () => (R.ctx && R.ctx.vars && R.ctx.vars.HERO) || 'Bram', 'Bram');

function talkStep(s) {
  switch (s.op) {
    case 'say': {
      const c = CAST[s.who] || {};
      let name = s.name !== undefined ? s.name : c.name;
      if (name === '%HERO%') name = HERO_NAME();
      return { say: s.text, name: name || null, voice: s.voice || c.voice || 'narrator', nameplate: name != null };
    }
    case 'narrate': return { narrate: s.text };
    case 'flag': return { set: { [s.name]: s.value } };
    case 'sfx': return { sfx: s.id };
    case 'wait': return { wait: s.ms };
    case 'nod': return { nod: true };
    case 'emote': return { emote: s.what, who: s.who };
    default: return null;
  }
}

function runDialogue(script) {
  if (!Scenes.has('dialogue')) {
    // no P12 in this build: at least do not eat the words
    for (const s of script) if (s && s.set) for (const [k, v] of Object.entries(s.set)) Flags.set(k, v);
    return sleep(120);
  }
  return new Promise((res) => {
    let done = false;
    const finish = () => { if (!done) { done = true; res(true); } };
    guard('dialogue push', () => Scenes.push('dialogue', { script, vars: { HERO: HERO_NAME() }, onClose: finish }), finish);
    // belt and braces: if the dialogue scene never even opened we must not hang the story for ever (the stack, not
    // the top — a place card or a transition can legitimately sit over the box for a moment)
    setTimeout(() => { if (!done && !onStack('dialogue')) finish(); }, 500);
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// one step
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function holdFor(ms) {
  const end = Date.now() + Math.max(0, ms | 0);
  while (Date.now() < end) {
    if (R.skipReq) return false;
    if (R.hurry > 0) { R.hurry--; return true; }   // one queued hurry per step; a held key queues the next
    await sleep(Math.min(60, end - Date.now()));
  }
  return true;
}

async function runStep(s) {
  if (!s || typeof s !== 'object') return;
  switch (s.op) {
    case 'move': {
      if (s.actor === 'hero' || s.actor === 'player') {
        // a held two-shot would watch him walk out of frame: hand the lens back to the follow camera first
        if (s.keepShot !== true) guard('move release', () => { const w = Field.world(); if (w && w.cameraRig) w.cameraRig.release(0.45); });
        calmEncounters();
        stage(false); lockPad(true);
        await walkHero(s.to, s);
        lockPad(false); stage(true);
      } else {
        const a = ACTORS.get(s.actor);
        if (a) { await walkActor(a, s.to, s); return; }
        // …or one lent to us by the map. `npcWalk` puts him on his feet and WAITS for him to arrive; `npcGo`
        // only teleports, which is how a father who says he is walking to the lane arrives there without ever
        // having crossed the room (see __DQ.npcWalk). The old fallback is still here for a step that wants him
        // THERE at once — a pose, a cut — and the wait itself is guarded, because a beat must not hang on a man.
        const fieldId = BORROWED.get(s.actor);
        if (fieldId) {
          const pt = pointOf(s.to);
          const q = dq();
          if (!pt || !q) return;
          if (s.walk === false || !(q.npcWalk)) guard('move borrowed', () => { if (q.npcGo) q.npcGo(fieldId, pt.x, pt.z, true); });
          else await guard('move borrowed', () => q.npcWalk(fieldId, pt.x, pt.z, s.speed == null ? 2.4 : +s.speed), null);
          // arrival or not, he stands where the beat told him to stand
          guard('move borrowed hold', () => { if (q.npcGo) q.npcGo(fieldId, pt.x, pt.z, true); });
        }
      }
      return;
    }
    case 'face': {
      const pt = pointOf(s.to);
      if (s.actor === 'hero' || s.actor === 'player') {
        const pl = Field.world() && Field.world().player;
        if (!pl) return;
        if (pt) pl.faceToward(pt.x, pt.z);
        else if (Number.isFinite(+s.to)) pl.face(+s.to);
        return;
      }
      const a = ACTORS.get(s.actor);
      if (a) {
        if (pt) a.yaw = Math.atan2(pt.x - a.x, pt.z - a.z);
        else if (Number.isFinite(+s.to)) a.yaw = +s.to * DEG;
        return;
      }
      if (BORROWED.has(s.actor) && pt) {
        const q = dq();
        const fieldId = BORROWED.get(s.actor);
        // the body is hidden but it is still ANIMATED: `npcFace` points it, and the next `npcTake(false)` hands
        // back a man already looking where the scene left him.
        if (q && q.npcFace) guard('face borrowed', () => q.npcFace(fieldId));
      }
      return;
    }
    case 'wait': await holdFor(s.ms); return;
    case 'fade': {
      const ms = Number.isFinite(+s.ms) ? +s.ms : 420;
      await guard('fade', () => {
        if (s.dir === 'in') return Transitions.fadeIn({ ms, colour: s.colour });
        if (s.dir === 'white') return Transitions.white(true, { ms });
        if (s.dir === 'iris') return Transitions.iris(s.open !== false, { ms });
        if (s.dir === 'flash') return Transitions.flash({ ms, alpha: s.alpha });
        if (s.dir === 'clear') return Transitions.clear({ ms });
        return Transitions.fadeOut({ ms, colour: s.colour });
      }, null);
      return;
    }
    case 'music': {
      const M = R.ctx && typeof R.ctx.Music === 'function' ? R.ctx.Music() : null;
      if (!M) return;
      await Promise.resolve(M).then((lib) => { if (lib && lib.play) guard('music', () => lib.play(s.id, { fade: s.fade == null ? 1.2 : s.fade })); }).catch(() => {});
      return;
    }
    case 'sfx': playSfx(s.id, s); return;
    case 'nod': { const pl = Field.world() && Field.world().player; if (pl && pl.hero && pl.hero.nod) guard('nod', () => pl.hero.nod()); return; }
    case 'emote': return;
    case 'shake': {
      R.shakeMs = Math.max(80, s.ms | 0); R.shakeT = R.shakeMs; R.shakeAmp = Math.max(2, +s.strength || 10);
      await holdFor(R.shakeMs);
      return;
    }
    case 'give': { const q = dq(); if (q && q.give) guard('give', () => q.give(s.item, s.n)); return; }
    // P25: `gold(n)` ADDS. It used to SET, which is invisible everywhere except the one place it matters: the boy
    // already boots with 30 gold, so B2's "Here. Thirty gold coins." set his purse to 30 — the number it already
    // was — and he walked away from his father's gift with nothing. A signed amount sets, so an absolute purse is
    // still available: `gold({set: 120})`.
    case 'gold': {
      const q = dq();
      if (!q || !q.gold) return;
      if (s.set != null) { guard('gold set', () => q.gold(s.set)); return; }
      guard('gold add', () => q.gold(Math.max(0, q.state ? q.state().gold : 0) + (+s.n || 0)));
      return;
    }
    case 'flag': Flags.set(s.name, s.value); return;
    case 'join': {
      const q = dq();
      // Do NOT call q.state() here — buildState re-enters every provider (story/quest/act2/menu) and blows the stack.
      // Story flags are the authority for "already joined"; Party.add is itself idempotent for known ids.
      if (!Flags.has('party.' + s.id) && q && q.party) guard('join', () => q.party(s.id));
      Flags.set('party.' + s.id, true);
      guard('party.join', () => Bus.emit('party.join', { id: s.id, name: castName(s.id) }));
      playSfx(s.sound || 'befriend');
      return;
    }
    case 'teleport': {
      const q = dq();
      if (q && q.teleport) guard('teleport', () => q.teleport(s.map, s.x, s.z));
      if (Number.isFinite(+s.facing)) guard('teleport facing', () => { const pl = Field.world() && Field.world().player; if (pl) pl.face(+s.facing); });
      return;
    }
    case 'card': { stage(true); await showCard(s.title, s.sub, s.ms); return; }
    case 'spawn': {
      // TWO PAPAS IS WORSE THAN NO CAMERA MOVE, PART TWO. `followerOf` above only catches somebody already WALKING
      // behind the boy — a party member. In Act I the party is the boy alone, so Papa is not a follower, and B1's
      // `spawn('halvard')` built a second body for a man the cottage's people layer had already put beside the big
      // chair (hollybank.npcs.js hb-halvard). Two of him, both called Papa, both in frame.
      //
      // So before building a body, ask the FIELD whether it already has one of this person, and if it does lend
      // that one to the scene instead: hidden, uncollidable, and still in the map's list so his talk target, his
      // lines and his prompt survive the scene. `despawn('halvard')` gives him back (see the 'despawn' op). A beat
      // that does not despawn hands him back when the map goes: `despawn()` in npc.js clears the flag.
      if (!ACTORS.has(s.id) && followerOf(s.id)) { STANDINS.add(s.id); return; }   // he is already walking with us
      const here = ACTORS.has(s.id) ? null : fieldNpc(s.id);
      if (here) {                                                              // he is already standing in the room
        guard('spawn borrow', () => { const q = dq(); if (q && q.npcTake) q.npcTake(here.id, true); });
        BORROWED.set(s.id, here.id);
        return;
      }
      loadLibs(); makeActor(s.id, s.look, s.at || s, s);
      return;
    }
    case 'despawn': STANDINS.delete(s.id);
      // A BORROWED BODY COMES BACK BY DEFAULT — same spot, same facing, same collider. Without that the cottage is
      // left without its Papa for the rest of the chapter, which is worse than two of him, and any beat that borrows
      // somebody just to borrow them has quietly relocated a villager. The FIELD's id is the key: the beat says
      // 'halvard' and the map calls him 'hb-halvard'.
      const borrowedId = BORROWED.get(s.id);
      if (borrowedId) {
        BORROWED.delete(s.id);
        // …UNLESS THE BEAT SAYS HE IS GOING. `leave` is not `despawn`: a man who has walked out of a house has not
        // walked back into his chair, and handing him to the field where he stands is precisely the bug a player
        // reports as "he says he will wait outside and he is still in the house". It only ever fires where the map
        // has said this person is gone — an explicit `gone()` in his own people layer — so a mistyped `leave` costs a
        // body for a visit rather than putting a second father back on a chair.
        if (s.leave === true) guard('despawn leave', () => { const q = dq(); if (q && q.npcLeave) q.npcLeave(borrowedId); });
        else guard('despawn return', () => { const q = dq(); if (q && q.npcTake) q.npcTake(borrowedId, false); });
      }
      killActor(s.id); return;
    case 'do': { const more = await guard('do', () => s.fn({ Flags, Quests, Story, Field, actors: ACTORS }), null); if (Array.isArray(more)) await runList(more); return; }
    case 'branch': {
      const ok = typeof s.cond === 'function' ? !!guard('branch cond', () => s.cond(Flags), false) : Flags.has(s.cond);
      await runList(ok ? s.then : s.else);
      return;
    }
    case 'camera': {
      const w = Field.world();
      const rig = w && w.cameraRig;
      if (!rig) return;
      if (s.what === 'shot') {
        const pt = (v) => {
          if (!v) return undefined;
          const p = pointOf(v);
          if (p) { const y = w.map ? w.map.walkY(p.x, p.z) : 0; return { x: p.x, y: y + (v && v.y != null ? +v.y : 1.0), z: p.z }; }
          return v;
        };
        const opts = { from: pt(s.from), to: pt(s.to), lookAt: pt(s.lookAt), duration: s.duration, ease: s.ease, fov: s.fov, hold: s.hold };
        const p = guard('camera shot', () => rig.shot(opts), null);
        if (p && typeof p.then === 'function') await Promise.race([p, sleep(((s.duration || 1) * 1000) + 800)]);
        else await holdFor((s.duration || 1) * 1000);
        return;
      }
      if (s.what === 'two') {
        const A = pointOf(s.a), B = pointOf(s.b);
        if (!A || !B) return;
        const m = w.map;
        const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
        const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz) || 1;
        let px = -dz / d, pz = dx / d;                                  // the line's perpendicular
        const cam = w.camera;
        if (cam) { const cx = cam.position.x - mx, cz = cam.position.z - mz; if (cx * px + cz * pz < 0) { px = -px; pz = -pz; } }
        // A LENS INSIDE A WALL IS WORSE THAN NO SHOT. Hollybank is 14x12: the first version put the boom seven
        // units out through the cottage wall and the whole frame was one plank of wood. So: try the near side,
        // then the far side, then closer in, and only take the shot when the point is really in the room.
        // When the two of them are almost on the same spot — a party guest is glued a pace behind the boy — a
        // 2.8-unit boom ends up inside the speaker's shoulder. Back off with a floor of 3.4.
        const want = Number.isFinite(+s.dist) ? +s.dist : Math.max(3.4, Math.min(5.6, d * 0.9 + 2.6));
        /**
         * SWING BEFORE YOU SHRINK. The first version only ever pulled the boom in when the near side was blocked,
         * so a scene with a third person standing in the way ended up two metres from the speakers with their
         * heads out of frame. Try the asked distance all the way round first — a talk shot at the right distance
         * from an odd angle beats the right angle from inside somebody's chin.
         */
        const dirs = [];
        for (const sign of [1, -1]) {
          for (const deg of [0, 25, -25, 50, -50, 75, -75]) {
            const a = deg * DEG, c = Math.cos(a), sn = Math.sin(a);
            dirs.push({ x: (px * c - pz * sn) * sign, z: (px * sn + pz * c) * sign });
          }
        }
        let from = null;
        for (const k of [1, 1.15, 0.85, 0.68, 0.52]) {
          for (const u of dirs) {
            const x = mx + u.x * want * k, z = mz + u.z * want * k;
            if (m && !(m.inBounds(x, z) && m.clear(x, z, 0.45))) continue;
            if (!lensClear(x, z)) continue;
            from = { x, z }; break;
          }
          if (from) break;
        }
        if (!from) return;                                              // nowhere honest to stand: keep the follow camera
        const gy = m ? m.walkY(mx, mz) : 0;
        const eye = { x: from.x, y: (m ? m.walkY(from.x, from.z) : 0) + (Number.isFinite(+s.height) ? +s.height : 1.45), z: from.z };
        const lookY = Number.isFinite(+s.lookY) ? +s.lookY : 1.0;       // raise it to look UP at a standing adult
        const p = guard('camera two', () => rig.shot({ from: eye, lookAt: { x: mx, y: gy + lookY, z: mz }, duration: s.duration == null ? 1.1 : s.duration, fov: s.fov, hold: s.hold !== false }), null);
        if (p && typeof p.then === 'function') await Promise.race([p, sleep(((s.duration == null ? 1.1 : s.duration) * 1000) + 700)]);
        return;
      }
      if (s.what === 'release') { guard('camera release', () => rig.release(s.seconds)); await holdFor((s.seconds || 0.9) * 1000); return; }
      if (s.what === 'drop') { guard('camera drop', () => rig.drop && rig.drop()); return; }
      if (s.what === 'orbit') { guard('camera orbit', () => rig.orbit(s.deg)); return; }
      if (s.what === 'mode') { guard('camera mode', () => rig.mode(s.mode)); return; }
      if (s.what === 'snap') { guard('camera snap', () => rig.snap()); return; }
      return;
    }
    /**
     * A FIGHT INSIDE A SCENE. `battle.end` fires while the fight is still SAYING things — the victory tally, the
     * level-up panel, and P17's "wants to join you" and naming windows — and the battle SCENE only pops when the
     * child has read all of it. The first version gave up after nine seconds and spoke anyway: its dialogue box
     * went on TOP of the live battle, the confirm presses went to the box, and the fight sat underneath for ever.
     * That one mistake wedged the whole of Act I (the letterbox stayed up, Cancel could not reach the runner, and
     * every later beat was refused with "a story scene is already playing"). So: wait for the battle to be really,
     * properly over — the scene off the stack and no window holding the screen — and only then carry on.
     */
    case 'battle': {
      const q = dq();
      if (!q) return;
      let ended = false, outcome = null;
      const off = Bus.on('battle.end', (out) => { ended = true; outcome = (out && out.outcome) || null; });
      const started = guard('battle', () => (q.fight ? q.fight(s.area || null, Object.assign({}, s)) : q.battle(s.enemies || [])), null);
      // it has to actually appear: a couple of seconds for the swirl and the scene push
      let appeared = false;
      for (let i = 0; i < 40 && !appeared && !ended; i++) {
        if (onStack('battle')) appeared = true; else await sleep(100);
      }
      if (!appeared && !ended && !started) { off(); return; }          // no battle in this build: the scene goes on
      const cap = Date.now() + 240000;
      while (Date.now() < cap) {
        if (!onStack('battle')) {
          const top = Scenes.top();
          const st2 = guard('state', () => q.state(), null);
          const focused = st2 && st2.ui ? st2.ui.focus : null;         // a modal window (the join Yes/No, the tally)
          if (top !== 'dialogue' && top !== 'menu' && !focused) break;
        }
        await sleep(150);
      }
      off();
      calmEncounters();                                                // the fight the scene asked for, not one more
      await sleep(250);
      // P25: a loss STOPS the scene. It used to walk straight on, so losing B3 still ran `joinParty('bobble')` and
      // the beats after it — the boy recruited a friend and left with Papa after being carried home unconscious.
      // The chapel is the one place a scene cannot continue from, so hand the story back to the player here and let
      // the beat's own `blocks` flag decide what re-arms when they walk back in.
      if (outcome === 'defeat') {
        R.skipReq = false;
        R.lost = true;
        if (typeof onDefeat === 'function') await guard('onDefeat', () => onDefeat(s));
      }
      return;
    }
    case 'choice': {
      const labels = (s.labels || []).map(String);
      if (!labels.length) return;
      let picked = s.cancel != null ? +s.cancel : 0;
      const script = [{
        choice: labels,
        then: labels.map((_, i) => [{ do: () => { picked = i; } }]),
        cancel: s.cancel == null ? undefined : +s.cancel,
      }];
      await runDialogue(script);
      const thens = s.thens || [];
      if (Array.isArray(thens[picked])) await runList(thens[picked]);
      if (s.flag) Flags.set(s.flag, s.values ? s.values[picked] : labels[picked]);
      return;
    }
    default: return;
  }
}

async function runList(steps) {
  const list = (steps || []).filter(Boolean);
  let i = 0;
  while (i < list.length) {
    if (R.skipReq) return;
    if (R.lost) return;                                          // P25: a defeat ends the scene where it fell
    const s = list[i];
    // a run of talky steps becomes one conversation: one box, one open, one close
    if (TALKY.has(s.op) && (s.op === 'say' || s.op === 'narrate')) {
      const batch = [];
      while (i < list.length && TALKY.has(list[i].op)) { batch.push(talkStep(list[i])); i++; }
      const script = batch.filter(Boolean);
      if (R.playing) R.playing.i = i;
      stage(true);
      await runDialogue(script);
      continue;
    }
    if (R.playing) R.playing.i = i;
    // Name the step a failure came from. Every walk in a beat says the same thing when it cannot find a route, and
    // "one of the seven" is not a diagnosis — a 37-step beat reports which of them by the time the reader sees it.
    try { await runStep(s); } catch (e) {
      reportError(`story step ${i + 1}/${R.playing ? R.playing.steps : '?'} (${s.op}${s.to !== undefined ? ' → ' + s.to : ''})`, e);
      throw e;
    }
    i++;
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const Story = {
  CAST, SCENES,

  register(id, steps) { SCENES.set(String(id), steps); return Story; },
  registerAll(obj = {}) { for (const [k, v] of Object.entries(obj)) Story.register(k, v); return Story; },
  scenes() { return Array.from(SCENES.keys()); },
  running() { return !!R.playing; },
  /**
   * Auto-play: the beats that start themselves when you walk into the map they belong to. On by default in the
   * real game; `?story=off` (or `__DQ.storyAuto(false)`) turns it off, which is how another piece photographs a
   * map the story has a scene in without a conversation opening over the shot.
   */
  /**
   * R.autoplay ON = the chapters start their own beats, and keep starting them when the field comes back up. OFF = no
   * beat starts itself, AND the one already running stops where it stands.
   *
   * The second half is the half that matters, and getting it wrong is what a whole afternoon of phantom bugs looked
   * like. `storyAuto(false)` used to flip a flag the chapters read BEFORE starting a beat and nothing else, so a
   * harness that meant to stage its own walk instead spent the whole run measuring a chapter beat it had not asked
   * for: at a waypoint it never chose, ending at a mark it never set, parked in place while a dialogue box it never
   * opened waited for a keypress nobody was going to send. Three things have to be let go of, because the run can be
   * stuck in three different places: `skipReq` unwinds the beat runner, `staged` hands a `move('hero')` step's field
   * back so it cannot keep walking with no field under it, and `hurry` is the queued advance a held key left behind.
   *
   * ASYNCHRONOUS, and it has to stay that way. `play` refuses any beat while the previous one still holds the stage,
   * and the runner only clears it in a `finally` that runs when the step in flight returns — so this must WAIT for
   * the stage to clear. A caller that treats it as fire-and-forget gets its own beat refused, and cannot tell:
   * `play` settles its promise at the END of a beat, so a refused call and an accepted one look identical from
   * outside. `await __DQ.storyAuto(false)`, then stage.
   *
   * And the flag goes false LAST, after the wait. ch1 re-arms itself the moment the field goes quiet, so a chapter
   * that slipped in during the unwind would beat the caller's own `storyPlay` to the stage and the caller's beat
   * would come back refused. Clearing first means the chapters read "on" for the whole unwind — including after the
   * runner returns, since that lands on the microtask queue behind this loop.
   */
  async autoplay(on) {
    if (on === undefined) return R.autoplay;
    if (on) { R.autoplay = true; R.skipReq = false; R.hurry = 0; R.staged = false; Bus.emit('story.autoplay', { on: true }); return true; }
    R.hurry = 0;
    // Mid-walk: hand the field its stage back first. A walk is left holding the field OFF the scene stack, and if
    // this cleared that alone the runner would carry on stepping with no field under it — which is its own class of
    // hang, and a quieter one.
    guard('auto restage', () => { if (R.staged) stage(true); });
    R.staged = false;
    if (R.playing) {
      Story.skip();
      const until = Date.now() + 5000;
      while (R.playing && Date.now() < until) await sleep(50);
    }
    for (let i = 0; i < 3 && Scenes.top() === 'dialogue'; i++) guard('auto dialogue', () => Scenes.pop());
    if (R.hero) { const f = R.hero.resolve; R.hero = null; if (f) f(false); }
    R.autoplay = false;
    R.skipReq = false;                        // the runner clears it in its `finally`; a leftover would refuse the next beat
    Bus.emit('story.autoplay', { on: false });
    return false;
  },
  get auto() { return R.autoplay; },
  actors() {
    const out = Array.from(ACTORS.values()).map((a) => ({ id: a.id, look: a.look, x: r3(a.x), z: r3(a.z), facing: r3(((a.yaw / DEG) % 360 + 360) % 360), walking: !!a.path }));
    for (const id of STANDINS) { const f = followerOf(id); out.push({ id, look: 'follower', standin: true, x: f ? r3(f.x) : null, z: f ? r3(f.z) : null }); }
    // A BORROWED BODY IS A BODY IN THIS SCENE. `__DQ.storyActors()` is how a scenario counts the people on screen,
    // so a lent one has to be in the list or "how many Papas" answers one while the room holds two. Reported
    // `borrowed` rather than `standin`: a follower is somebody walking behind the boy, this is somebody the scene
    // put somewhere specific, and the two want different things if you act on them.
    for (const id of BORROWED.keys()) { const f = fieldNpc(byId(id)); out.push({ id, look: 'borrowed', borrowed: true, x: f ? r3(+f.x) : null, z: f ? r3(+f.z) : null, facing: f ? r3(+f.facing || 0) : null }); }
    return out;
  },

  /** Play a registered scene by id (or a list of steps directly). */
  beat(id, opts = {}) {
    const def = SCENES.get(String(id));
    if (!def) return Promise.resolve({ ok: false, reason: `no story scene "${id}"`, scenes: Story.scenes() });
    const steps = typeof def === 'function' ? guard(`scene ${id}`, () => def(), []) : def;
    return Story.play(steps, Object.assign({ id }, opts));
  },

  async play(steps, opts = {}) {
    // A BEAT BY NAME. `storyPlay('b1')` used to be read as a list of one STRING — one step, named `b1`, which is
    // not a step at all — so a scenario that asked for the real B1 got a no-op, 400 keypresses, and a run that
    // measured nothing while looking, to the notes, exactly like a beat that had played and misbehaved. A registered
    // scene id is resolved here, where the runner can say so, and `list` in the report says which.
    if (typeof steps === 'string' && SCENES.has(steps)) {
      const at = SCENES.get(steps);
      const list = (Array.isArray(at) ? at : typeof at === 'function' ? at() : [at]).filter(Boolean);
      return Story.play(list, { ...opts, id: opts.id || steps });
    }
    // What the last call actually did. `play` returns a promise the runner settles at the END of the beat, so a
    // caller that cannot await it — a harness issuing a beat and moving on — has no way at all to tell "your beat is
    // refused, something else is already playing" from "your beat started". Two afternoons of measuring a beat that
    // had never begun, because the only way to find out was to await the very thing that would have told you.
    if (R.playing && !R.skipReq) {
      R.lastPlay = { ok: false, reason: 'a story scene is already playing', playing: R.playing.id, step: R.playing.i };
      return R.lastPlay;
    }
    const list = (Array.isArray(steps) ? steps : [steps]).filter(Boolean);
    R.lastPlay = { ok: true, id: String(opts.id || 'scene'), steps: list.length, at: Date.now() };
    return Story._run(list, opts);
  },

  async _run(list, opts = {}) {
    if (R.playing) {
      // A STORY MUST NOT BE ABLE TO WEDGE ITSELF. If something upstream really did strand a scene, let the next
      // beat take the stage rather than refusing every beat for the rest of the child's afternoon.
      if (Date.now() - R.playing.at > 300000) { Story.skip(); await sleep(700); }
      if (R.playing) { R.lastPlay = { ok: false, reason: 'a story scene is already playing', playing: R.playing.id }; return R.lastPlay; }
    }
    const id = String(opts.id || 'scene');
    R.playing = { id, name: opts.name || id, steps: list.length, i: 0, skipped: false, at: Date.now() };
    R.skipReq = false; R.hurry = 0; R.lost = false;
    Bus.emit('story.issued', R.lastPlay);            // the beat is ON, before the first step has run
    installKeys();
    stage(true);                                   // the bars and the locked controls come up BEFORE the first fade
    hud(false);
    calmEncounters();
    guard('busy on', () => Debug.busy('story', true));
    StoryLock.set(true);                             // the field asks this before it walks him anywhere (P25)
    guard('story.start', () => Bus.emit('story.start', { id, steps: list.length }));
    try {
      await runList(list);
    } catch (e) {
      reportError(`story scene "${id}"`, e);
    } finally {
      // whatever happened, put the world back the way a child can play it
      const skipped = R.skipReq;
      if (skipped && opts.onSkip) guard('onSkip', () => opts.onSkip());
      R.hero = null;
      lockPad(false);
      StoryLock.set(false);                          // hand him back to the field, or he can never walk again (P25)
      stage(false);
      bars(false);
      hud(true);                                   // and the ribbon comes straight back to say where to go next
      guard('camera back', () => { const w = Field.world(); if (w && w.cameraRig) w.cameraRig.release(0.6); });
      // A BLACK FRAME IS THE WORST FAILURE IN THIS PROJECT: a scene that ends (or is skipped) mid-fade or under a
      // chapter card must hand the screen back uncovered, every time.
      hideCard();
      guard('uncover', () => Transitions.clear({ ms: skipped ? 200 : 300 }));
      guard('shake off', () => { const el = typeof document !== 'undefined' && document.getElementById('game-canvas'); if (el) el.style.transform = ''; });
      if (opts.keepActors !== true) killAllActors();
      R.history.push({ id, ran: R.playing ? R.playing.i : 0, of: list.length, skipped, ms: Date.now() - (R.playing ? R.playing.at : Date.now()) });
      if (R.history.length > 20) R.history.shift();
      const out = { ok: true, id, ran: R.playing ? R.playing.i : 0, of: list.length, skipped, lost: !!R.lost };
      R.playing = null;
      R.skipReq = false;
      guard('busy off', () => Debug.busy('story', false));
      guard('story.end', () => Bus.emit('story.end', out));
      guard('quests', () => Quests.refresh());
      return out;
    }
  },

  /** A child can always get out of a story. Cancel does this; so does __DQ.storySkip(). */
  skip() {
    if (!R.playing) return { ok: false, reason: 'nothing is playing' };
    R.skipReq = true;
    R.hurry++;                       // skip outranks whatever hurry is still queued
    // close whatever window is up so the runner can unwind at once
    for (let i = 0; i < 3 && Scenes.top() === 'dialogue'; i++) guard('skip dialogue', () => Scenes.pop());
    if (R.hero) { const f = R.hero.resolve; R.hero = null; if (f) f(false); }
    for (const a of ACTORS.values()) if (a.path) { const f = a.path.resolve; a.x = a.path.tx; a.z = a.path.tz; a.path = null; if (f) f(false); }
    guard('story.skip', () => Bus.emit('story.skip', { id: R.playing.id }));
    return { ok: true, id: R.playing.id };
  },

  state() {
    return {
      playing: R.playing ? { id: R.playing.id, step: R.playing.i, of: R.playing.steps, ms: Date.now() - R.playing.at } : null,
      staged: R.staged, padLocked: R.blocked, autoplay: R.autoplay, actors: Story.actors(), scenes: Story.scenes().length,
      skippable: !!R.playing && !onStack('battle'), stack: stackNow(),
      act: Flags.act(), quest: Quests.current(), flags: Flags.describe().set, history: R.history.slice(-5),
      chapters: Array.from(SCENES.keys()).filter((k) => k.startsWith('b')).length,
    };
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * install(ctx) — the plugin entry main.js calls, and a STANDALONE one.
   * Everything the story needs (Scenes, Bus, Input, Field, Transitions, Sfx) is imported directly, so a bare
   * `install()` with no context brings the whole story up in a page that never heard of it:
   *     (await import('/src/story/script.js')).install()
   * The only things it takes from a context when there is one are the shared Save (so the flags persist) and the
   * shared score (so `music('village')` really changes the music) — and it goes and finds both itself when there
   * is not.                                              NEEDS (src/main.js): add ['story', () => import('./story/script.js')]
   * to PLUGINS, which is the one line that makes all of this live in /index.html for a child.
   */
  install(ctx = {}) {
    if (R.installed) return Story;
    R.installed = true;
    R.ctx = ctx;
    const D = ctx.Debug || Debug;

    if (!ctx.Save) {
      import('../engine/save.js').then((m) => {
        const Save = m && (m.Save || m.default);
        if (Save && typeof Save.register === 'function') { R.ctx = Object.assign({}, R.ctx, { Save }); guard('flags save late', () => Flags.installSave(Save)); }
      }).catch((e) => reportError('story save', e));
    }
    if (typeof ctx.Music !== 'function') {
      let lib = null;
      R.ctx = Object.assign({}, ctx, {
        Music: () => (lib ? Promise.resolve(lib) : import('../audio/music.js').then((m) => (lib = (m && (m.Music || m.default)) || null)).catch(() => null)),
      });
      ctx = R.ctx;
    }

    guard('flags install', () => Flags.install(ctx));
    guard('quests install', () => Quests.install(ctx));
    loadLibs();                                   // the cast's bodies, ready before the first scene asks for one

    installCss();
    installKeys();
    Scenes.register('cutscene', cutsceneScene);

    // the story's own heartbeat rides the field's tick, so it stops dead when there is no world
    guard('field hooks', () => {
      Field.on('update', (dt) => { tickHero(dt); tickActors(dt); });
      Field.on('render', (alpha, dt) => { tickShake(dt); });
      Field.on('unload', () => { killAllActors(); });
    });

    D.provide('story', () => Story.state());
    /** __DQ.story('b1') — play a beat by name; __DQ.story() lists them. */
    D.expose('story', (id, opts) => (id === undefined ? { scenes: Story.scenes(), state: Story.state() } : Story.beat(id, opts || {})));
    D.expose('storySkip', () => Story.skip());
    D.expose('storyState', () => Story.state());
    /**
     * __DQ.route('at:the chest …') — the waypoints a scripted walk to that mark would be given, and the point it would
     * end at, without starting the walk. A pathfinder that only reports "no route" cannot be debugged: this is how a
     * route is read. The last entry is the ENDING, which is the standing tile and not the mark — the mark sits inside
     * the chest, and a walk that aims at the inside of a chest is a walk that paces and circles.
     */
    D.expose('route', (to) => {
      const pt = pointOf(to);
      const w = Field.world();
      if (!pt || !w || !w.map) return null;
      const start = w.player ? w.player.p : { x: 0, z: 0 };
      const route = findRoute(w.map, start.x, start.z, pt.x, pt.z);
      if (!route) return { to, ok: false, why: 'no tile beside that mark his body fits on', mark: { x: +pt.x.toFixed(2), z: +pt.z.toFixed(2) } };
      const end = route[route.length - 1];
      // Per-leg ground, the long way round. A leg is the straight line between two consecutive waypoints; anything
      // well over 1 is a detour a player would notice. It is the walking version of what the `stalled` report catches
      // at runtime: the same detour, visible before it is walked.
      const pts = [{ x: start.x, z: start.z }].concat(route);
      let ground = 0, worst = 1;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k];
        const straight = Math.hypot(b.x - a.x, b.z - a.z);
        if (straight < 0.5) continue;
        const got = standable(w.map, b.x, b.z, PLAN_RADIUS) ? straight : straight + 1.2;
        ground += got;
        if (straight > 0.9) worst = Math.max(worst, got / straight);
      }
      return { to, ok: true, from: { x: +start.x.toFixed(2), z: +start.z.toFixed(2) },
        mark: { x: +pt.x.toFixed(2), z: +pt.z.toFixed(2) }, thing: pt.thing || null,
        end: { x: +end.x.toFixed(2), z: +end.z.toFixed(2) }, steps: route.length,
        at: { endsOnMark: Math.hypot(end.x - pt.x, end.z - pt.z) <= 0.3, fits: bodyFits(w.map, end.x, end.z),
              ground: +ground.toFixed(1), worstLeg: +worst.toFixed(2),
              // AND HOW NEAR THE THING ITSELF — the number that says whether he got close enough to use it.
              fromThing: pt.thing ? +Math.hypot(end.x - pt.thing.x, end.z - pt.thing.z).toFixed(2) : null,
              inReach: pt.thing ? Math.hypot(end.x - pt.thing.x, end.z - pt.thing.z) <= pt.thing.reach : null },
        waypoints: route.map((p) => [+p.x.toFixed(2), +p.z.toFixed(2)]) };
    });
    D.expose('storyScenes', () => Story.scenes());
    /**
     * __DQ.heart() — is the hero's walk tick running, and how far did it get on the frame before it stopped?
     * `n` counts frames since boot, `last` the wall clock of the most recent one, and `tail` the walk's own arithmetic
     * — remaining distance, best so far, stall time, path ratio, waypoint distance, waypoints left. A walk that is
     * hung and a walk that is not being ticked at all look identical from the outside, which is the whole reason this
     * exists: the tail says which of the two it is.
     */
    D.expose('heart', () => Object.assign({ playing: !!R.hero, auto: R.autoplay }, R.heart));
    /** __DQ.storyIssued() — did the last `storyPlay` actually start a beat, or was it refused? */
    D.expose('storyIssued', () => R.lastPlay);
    D.expose('storyActors', () => Story.actors());
    /** __DQ.storyAuto(false) — stop beats starting themselves (a clean screenshot of a map a scene lives in). */
    D.expose('storyAuto', (on) => Story.autoplay(on));
    /** __DQ.storyPlay([...steps]) — run a scene written in the console (demos, critics). */
    D.expose('storyPlay', (steps, opts) => Story.play(steps || [], opts || {}));

    // ── Act I (P24). The chapter registers its beats and its own triggers. ────────────────────────────────
    import('./chapters/ch1.js')
      .then((m) => { const c = m && (m.Chapter1 || m.default); if (c && c.install) guard('ch1 install', () => c.install(Object.assign({ Story, Flags, Quests }, ctx))); })
      .catch((e) => reportError('story: src/story/chapters/ch1.js did not load', e));

    // ── Act II (P25). Loads after Act I; arms only once ch2.start is set. ───────────────────────────────
    import('./chapters/ch2.js')
      .then((m) => { const c = m && (m.Chapter2 || m.default); if (c && c.install) guard('ch2 install', () => c.install(Object.assign({ Story, Flags, Quests }, ctx))); })
      .catch((e) => reportError('story: src/story/chapters/ch2.js did not load', e));

    // ── Act III (P25). Arms only once ch3.start is set (end of B19). ─────────────────────────────────
    import('./chapters/ch3.js')
      .then((m) => { const c = m && (m.Chapter3 || m.default); if (c && c.install) guard('ch3 install', () => c.install(Object.assign({ Story, Flags, Quests }, ctx))); })
      .catch((e) => reportError('story: src/story/chapters/ch3.js did not load', e));

    guard('quest refresh', () => Quests.refresh());
    return Story;
  },
};

export function install(ctx) { return Story.install(ctx || {}); }
export default Story;
