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
 *   give(itemId, n) · flag(name, value) · joinParty(charId) · gold(n)
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
import { Sfx } from '../audio/sfx.js';
import { Transitions } from '../ui/transitions.js';
import { Flags } from './flags.js';
import { Quests } from './quests.js';

const DEG = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
const guard = (where, fn, fallback) => { try { return fn(); } catch (e) { reportError('story ' + where, e); return fallback; } };
const sleep = (ms) => new Promise((res) => setTimeout(res, Math.max(0, ms | 0)));

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
export const gold = (n) => ({ op: 'gold', n });
export const flag = (name, value = true) => ({ op: 'flag', name, value });
export const joinParty = (id, o = {}) => ({ op: 'join', id, ...o });
export const teleport = (map, x, z, facing) => ({ op: 'teleport', map, x, z, facing });
export const battle = (o = {}) => ({ op: 'battle', ...o });
export const card = (title, sub = null, o = {}) => ({ op: 'card', title, sub, ms: 2200, ...o });
export const spawn = (id, look, at, o = {}) => ({ op: 'spawn', id, look, at, ...o });
export const despawn = (id) => ({ op: 'despawn', id });
export const act = (fn) => ({ op: 'do', fn });
export const nod = (who = 'hero') => ({ op: 'nod', who });
export const emote = (who, what) => ({ op: 'emote', who, what });
export const branch = (cond, then_ = [], else_ = []) => ({ op: 'branch', cond, then: then_, else: else_ });
export const choice = (labels, thens = [], o = {}) => ({ op: 'choice', labels, thens, ...o });

export const camera = {
  shot: (o = {}) => ({ op: 'camera', what: 'shot', ...o }),
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
let blobNext = 1;                          // field blob 0 is the hero; actors take 1..capacity-1

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
  if (typeof at === 'string') at = pointOf(at) || {};
  at = at || {};
  const x = Number.isFinite(+at.x) ? +at.x : 0, z = Number.isFinite(+at.z) ? +at.z : 0;
  const y = w.map ? w.map.walkY(x, z) : 0;
  body.root.position.set(x, y, z);
  const yaw = Number.isFinite(+at.facing) ? +at.facing * DEG : (Number.isFinite(+opts.facing) ? +opts.facing * DEG : 0);
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
function killAllActors() { for (const id of Array.from(ACTORS.keys())) killActor(id); blobNext = 1; }

/**
 * Where is somebody, or something? A writer never types coordinates from another piece's map file into a scene:
 *   'hero' | an actor id | {x, z} | 'spawn' | "at:Papa's boots"  (any prop, chest or exit by NAME, or by type)
 * so when P23 moves the boots the scene follows them.
 */
function pointOf(target) {
  if (!target) return null;
  if (typeof target === 'object' && Number.isFinite(+target.x) && Number.isFinite(+target.z)) return { x: +target.x, z: +target.z };
  const id = String(target);
  if (id === 'hero' || id === 'player') {
    const p = Field.player();
    return p ? { x: p.x, z: p.z } : null;
  }
  const a = ACTORS.get(id);
  if (a) return { x: a.x, z: a.z };
  const w = Field.world();
  const m = w && w.map;
  if (!m) return null;
  if (id === 'spawn') return { x: m.spawn.x, z: m.spawn.z };
  if (id.startsWith('at:')) {
    const want = id.slice(3).toLowerCase().trim();
    const pool = [].concat(m.props || [], m.chests || [], m.exits || []);
    const hit = pool.find((p) => String(p.name || '').toLowerCase() === want)
      || pool.find((p) => String(p.name || '').toLowerCase().includes(want))
      || pool.find((p) => String(p.type || p.kind || '').toLowerCase() === want);
    if (hit && Number.isFinite(+hit.x)) {
      // stand a step OFF the thing, never inside it
      const off = Number.isFinite(+hit.reach) ? Math.min(1.4, Math.max(0.9, +hit.reach * 0.6)) : 1.1;
      const p = Field.player();
      if (p) {
        const dx = p.x - hit.x, dz = p.z - hit.z, d = Math.hypot(dx, dz) || 1;
        return { x: hit.x + (dx / d) * off, z: hit.z + (dz / d) * off };
      }
      return { x: +hit.x, z: +hit.z };
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
  hurry: false, skipReq: false,
  staged: false, blocked: false,
  hero: null,                              // the live hero walk {tx, tz, speed, t, timeout, resolve}
  letterbox: null, cardWin: null,
  history: [], installed: false, ctx: null, autoplay: true,
  shakeT: 0, shakeMs: 0, shakeAmp: 0,
};
try { if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('story') === 'off') R.autoplay = false; } catch (_) {}

const dq = () => (typeof window !== 'undefined' && window.__DQ) || null;

// ── the letterbox: two bars and a "skip" word, so a child can see this is a story and how to leave it ────────
function installCss() {
  if (typeof document === 'undefined' || document.getElementById('story-css')) return;
  const el = document.createElement('style');
  el.id = 'story-css';
  el.textContent = `
/* the bars sit BEHIND every DQ window inside #ui-root (z-index -1 there is still in front of the canvas), so a
   letterbox never clips the message box the way the first version did */
#story-bars{position:fixed;inset:0;pointer-events:none;z-index:-1;opacity:0;transition:opacity .34s ease}
#story-bars.on{opacity:1}
#story-bars .bar{position:absolute;left:0;right:0;height:7%;background:var(--pal-ui-shadow,#0b0d17);
  box-shadow:0 0 calc(30 * var(--u,1px)) rgba(0,0,0,.55)}
#story-bars .bar.t{top:0;transform:translateY(-100%);transition:transform .38s cubic-bezier(.2,.8,.25,1)}
#story-bars .bar.b{bottom:0;transform:translateY(100%);transition:transform .38s cubic-bezier(.2,.8,.25,1)}
#story-bars.on .bar.t,#story-bars.on .bar.b{transform:translateY(0)}
#story-bars .skip{position:absolute;right:calc(28 * var(--u,1px));bottom:calc(20 * var(--u,1px));
  font:600 calc(20 * var(--u,1px))/1.2 var(--dq-font,system-ui,sans-serif);color:var(--pal-ui-text-dim,#cfd6ff);
  letter-spacing:.04em;opacity:.75;text-shadow:0 calc(2 * var(--u,1px)) 0 rgba(0,0,0,.6)}
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
    el.innerHTML = '<div class="bar t"></div><div class="bar b"></div><div class="skip">X skip</div>';
    root.appendChild(el);
    R.letterbox = el;
  }
  R.letterbox.classList.toggle('on', !!on);
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
  await sleep(Math.max(400, ms | 0));
  el.classList.remove('on');
  await sleep(520);
}

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
    if (btn === 'confirm' || btn === 'run') { R.hurry = true; return true; }
    return true;                                     // everything else is swallowed: no walking off mid-scene
  },
};

function stage(on) {
  if (on === R.staged) return;
  R.staged = on;
  if (on) { if (Scenes.has('cutscene') && Scenes.top() === 'field') guard('push cutscene', () => Scenes.push('cutscene')); else bars(true); }
  else { if (Scenes.top() === 'cutscene') guard('pop cutscene', () => Scenes.pop()); }
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
function tickHero(dt) {
  const H = R.hero;
  if (!H) return;
  const w = Field.world();
  const pl = w && w.player;
  if (!pl || !w.map) { const f = H.resolve; R.hero = null; if (f) f(false); return; }
  const p = pl.p;
  H.t += dt;
  const dx = H.tx - p.x, dz = H.tz - p.z, d = Math.hypot(dx, dz);
  const close = d <= (H.stop || 0.22);
  if (close || H.t >= H.timeout) {
    p.vx = 0; p.vz = 0;
    guard('hero halt', () => pl.halt());
    if (!close) guard('hero place', () => pl.place(H.tx, H.tz, Math.atan2(dx, dz), true));
    const f = H.resolve; R.hero = null;
    if (f) f(true);
    return;
  }
  p.yawT = Math.atan2(dx, dz);
  const v = Math.min(H.speed, d * 4 + 0.35);                  // ease in to the mark instead of stopping dead
  p.vx = (dx / d) * v / DECAY;
  p.vz = (dz / d) * v / DECAY;
}

function walkHero(to, o = {}) {
  const pt = pointOf(to);
  const pl = Field.world() && Field.world().player;
  if (!pt || !pl) return Promise.resolve(false);
  const d = Math.hypot(pt.x - pl.p.x, pt.z - pl.p.z);
  if (d < 0.25) return Promise.resolve(true);
  const speed = Number.isFinite(+o.speed) ? +o.speed : (o.run ? 4.2 : 2.1);
  return new Promise((res) => {
    R.hero = { tx: pt.x, tz: pt.z, speed, t: 0, stop: Number.isFinite(+o.stop) ? +o.stop : 0.22,
      timeout: Number.isFinite(+o.timeout) ? +o.timeout : Math.max(1.5, d / Math.max(0.6, speed) * 2.6 + 1.2), resolve: res };
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
    if (m) a.y = m.walkY(a.x, a.z);
    a.body.root.position.set(a.x, a.y, a.z);
    if (a.kind === 'monster') { a.body.root.rotation.y = a.yaw; guard('monster tick', () => a.body.update(dt)); }
    else guard('char tick', () => { a.body.setFacing(a.yaw); a.body.setMove(a.speed, { run: false }); a.body.update(dt); });
    if (w && w.blobs && a.blob >= 0) { w.blobs.set(a.blob, a.x, a.y, a.z, 0.85 * (a.height / 1.6)); touched = true; }
  }
  if (touched && w.blobs) guard('blob commit', () => w.blobs.commit());
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
    // belt and braces: if the dialogue scene never closes we must not hang the story for ever
    setTimeout(() => { if (!done && Scenes.top() !== 'dialogue') finish(); }, 400);
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// one step
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function holdFor(ms) {
  const end = Date.now() + Math.max(0, ms | 0);
  while (Date.now() < end) {
    if (R.skipReq) return false;
    if (R.hurry) { R.hurry = false; return true; }
    await sleep(Math.min(60, end - Date.now()));
  }
  return true;
}

async function runStep(s) {
  if (!s || typeof s !== 'object') return;
  switch (s.op) {
    case 'move': {
      if (s.actor === 'hero' || s.actor === 'player') {
        stage(false); lockPad(true);
        await walkHero(s.to, s);
        lockPad(false); stage(true);
      } else {
        const a = ACTORS.get(s.actor);
        if (a) await walkActor(a, s.to, s);
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
      if (!a) return;
      if (pt) a.yaw = Math.atan2(pt.x - a.x, pt.z - a.z);
      else if (Number.isFinite(+s.to)) a.yaw = +s.to * DEG;
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
    case 'gold': { const q = dq(); if (q && q.gold) guard('gold', () => q.gold(s.n)); return; }
    case 'flag': Flags.set(s.name, s.value); return;
    case 'join': {
      const q = dq();
      if (q && q.party) guard('join', () => q.party(s.id));
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
    case 'card': { stage(false); await showCard(s.title, s.sub, s.ms); stage(true); return; }
    case 'spawn': { loadLibs(); makeActor(s.id, s.look, s.at || s, s); return; }
    case 'despawn': killActor(s.id); return;
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
      if (s.what === 'release') { guard('camera release', () => rig.release(s.seconds)); await holdFor((s.seconds || 0.9) * 1000); return; }
      if (s.what === 'drop') { guard('camera drop', () => rig.drop && rig.drop()); return; }
      if (s.what === 'orbit') { guard('camera orbit', () => rig.orbit(s.deg)); return; }
      if (s.what === 'mode') { guard('camera mode', () => rig.mode(s.mode)); return; }
      if (s.what === 'snap') { guard('camera snap', () => rig.snap()); return; }
      return;
    }
    case 'battle': {
      const q = dq();
      if (!q) return;
      await new Promise((res) => {
        let done = false;
        const finish = () => { if (!done) { done = true; res(true); } };
        const off = Bus.on('battle.end', finish);
        const started = guard('battle', () => (q.fight ? q.fight(s.area || null, Object.assign({ onEnd: finish }, s)) : q.battle(s.enemies || [])), null);
        if (!started) { off(); finish(); return; }
        // the battle scene pops itself; watch the stack too, in case it never emits
        const iv = setInterval(() => { if (Scenes.top() !== 'battle' && Scenes.stack().indexOf('battle') < 0) { clearInterval(iv); off(); finish(); } }, 180);
        setTimeout(() => { clearInterval(iv); off(); finish(); }, 240000);
      });
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
    await runStep(s);
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
  autoplay(on) { if (on !== undefined) R.autoplay = !!on; return R.autoplay; },
  get auto() { return R.autoplay; },
  actors() { return Array.from(ACTORS.values()).map((a) => ({ id: a.id, look: a.look, x: r3(a.x), z: r3(a.z), facing: r3(((a.yaw / DEG) % 360 + 360) % 360), walking: !!a.path })); },

  /** Play a registered scene by id (or a list of steps directly). */
  beat(id, opts = {}) {
    const def = SCENES.get(String(id));
    if (!def) return Promise.resolve({ ok: false, reason: `no story scene "${id}"`, scenes: Story.scenes() });
    const steps = typeof def === 'function' ? guard(`scene ${id}`, () => def(), []) : def;
    return Story.play(steps, Object.assign({ id }, opts));
  },

  async play(steps, opts = {}) {
    if (R.playing) return { ok: false, reason: 'a story scene is already playing', playing: R.playing.id };
    const list = Array.isArray(steps) ? steps : [steps];
    const id = String(opts.id || 'scene');
    R.playing = { id, name: opts.name || id, steps: list.length, i: 0, skipped: false, at: Date.now() };
    R.skipReq = false; R.hurry = false;
    guard('busy on', () => Debug.busy('story', true));
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
      stage(false);
      bars(false);
      guard('camera back', () => { const w = Field.world(); if (w && w.cameraRig) w.cameraRig.release(0.6); });
      guard('shake off', () => { const el = typeof document !== 'undefined' && document.getElementById('game-canvas'); if (el) el.style.transform = ''; });
      if (opts.keepActors !== true) killAllActors();
      R.history.push({ id, ran: R.playing ? R.playing.i : 0, of: list.length, skipped, ms: Date.now() - (R.playing ? R.playing.at : Date.now()) });
      if (R.history.length > 20) R.history.shift();
      const out = { ok: true, id, ran: R.playing ? R.playing.i : 0, of: list.length, skipped };
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
    R.hurry = true;
    // close whatever window is up so the runner can unwind at once
    if (Scenes.top() === 'dialogue') guard('skip dialogue', () => Scenes.pop());
    if (R.hero) { const f = R.hero.resolve; R.hero = null; if (f) f(false); }
    for (const a of ACTORS.values()) if (a.path) { const f = a.path.resolve; a.x = a.path.tx; a.z = a.path.tz; a.path = null; if (f) f(false); }
    guard('story.skip', () => Bus.emit('story.skip', { id: R.playing.id }));
    return { ok: true, id: R.playing.id };
  },

  state() {
    return {
      playing: R.playing ? { id: R.playing.id, step: R.playing.i, of: R.playing.steps } : null,
      staged: R.staged, padLocked: R.blocked, autoplay: R.autoplay, actors: Story.actors(), scenes: Story.scenes().length,
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
    D.expose('storyScenes', () => Story.scenes());
    D.expose('storyActors', () => Story.actors());
    /** __DQ.storyAuto(false) — stop beats starting themselves (a clean screenshot of a map a scene lives in). */
    D.expose('storyAuto', (on) => Story.autoplay(on));
    /** __DQ.storyPlay([...steps]) — run a scene written in the console (demos, critics). */
    D.expose('storyPlay', (steps, opts) => Story.play(steps || [], opts || {}));

    // ── Act I (P24). The chapter registers its beats and its own triggers. ────────────────────────────────
    import('./chapters/ch1.js')
      .then((m) => { const c = m && (m.Chapter1 || m.default); if (c && c.install) guard('ch1 install', () => c.install(Object.assign({ Story, Flags, Quests }, ctx))); })
      .catch((e) => reportError('story: src/story/chapters/ch1.js did not load', e));

    guard('quest refresh', () => Quests.refresh());
    return Story;
  },
};

export function install(ctx) { return Story.install(ctx || {}); }
export default Story;
