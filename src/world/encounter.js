/**
 * encounter.js — random encounters: step-based rate, terrain tables, ambush / first strike, boss triggers.
 *                                                                             (P31, owner: src/world/encounter.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx), so filling it makes the world dangerous (gently).
 *
 * THE RATE IS A STEP COUNTER, NOT A DICE ROLL PER FRAME (docs/SYSTEMS-BIBLE §9)
 *   counter += paces walked (1 pace = 0.55 u) x 1.15 when running
 *   threshold = triangular(min, mode, max), drawn fresh after every battle, per terrain:
 *     field 22/38/62 · forest 18/30/50 · cave 16/26/44 · tower 20/32/52 · snow 20/34/55 · town, interior: never
 *   when counter >= threshold: a fight, and the counter goes back to zero.
 *   Triangular (not uniform) means fights cluster around a comfortable average and true back-to-back is vanishing.
 *
 * EVERY MERCY RULE, ALL NON-NEGOTIABLE
 *   grace       60 free paces after a battle, 26 on arriving somewhere new, 120 after a party wipe
 *   the gate    a DOOR APRON (5 tiles) round an exit, a church or a save point, 4 round where you came in — small
 *               enough that the walkable map is never covered. Finish the counter inside one and the fight is
 *               ARMED (state().armed / state().held), not cancelled: it goes off on the first pace outside.
 *   look-around standing still, or ambling under 0.8 u/s, does not advance the counter at all
 *   escalation  every consecutive fight without leaving the map adds +6 to min and mode (capped +18)
 *   towns       zero, always, everywhere inside one
 *
 * BOSSES (tests/battle/areas.js)
 *   Encounter.addBossDoor(mapId, {x, z, r, area, boss, name, ask}) — step into the circle and the game asks whether
 *   you are ready. Boss parties, boss levels and boss enemies all come from areas.js, the wagon waits outside, and
 *   `options.bossWipes` is passed into createBattle so the engine can hand back `result.advice`. From the SECOND
 *   wipe in a row `advice.helper` is set: the unhurried woman with the basket is then standing at that door with a
 *   free full heal, three Strong Herbs and one sentence about that particular boss (SYSTEMS §6.1.6). She never
 *   comments on why she is there. A map can declare its own doors as `bossDoors: [...]` in its def (P23).
 *
 * THE GENTLE DEFEAT (SYSTEMS §6.2)
 *   The battle has already halved the gold (floor 30) and kept every level and every point of EXP. This file walks
 *   the family to the chapel of Saint Alden, heals them for free, and the priest says something warm and different
 *   each time — followed by `result.advice.text`, the one sentence a child can act on. The words "Game Over" appear
 *   nowhere.
 *
 * __DQ: state().encounter · encounterRate(n) · encounterNow() · bossDoor(area) · church()
 */
import { Debug, reportError } from '../engine/debug.js';
import { str } from '../data/strings.js';
import { Roster, startBattle, areaFor, MAP_AREA } from '../battle/scene.js';
import { AREA_BY_ID } from '../../tests/battle/areas.js';

const guard = (where, fn) => { try { return fn(); } catch (e) { reportError('encounter ' + where, e); return undefined; } };
const STRIDE = 0.55;                    // world units in one pace
/**
 * The gate rule, in tiles. SYSTEMS §9 says twelve; twelve measured out to be a disaster in a real map — the meadow's
 * three edge exits plus its spawn point covered the ground a child actually wanders, and 182 s of unbroken walking
 * produced ONE fight with the counter finished and pegged at zero the whole time. A safe patch is a doorstep, not a
 * field: these are door aprons now, and the counter ARMS inside one and fires on the first pace outside it.
 */
const SAFE_RADIUS = 5;                  // an exit / a town gate / a church door
const SPAWN_RADIUS = 4;                 // where the map put you down
const MOVING = 0.8;                     // the look-around rule

/** SYSTEMS §9: triangular(min, mode, max) paces between fights, by terrain. */
export const RATES = {
  field: [22, 38, 62],
  forest: [18, 30, 50],
  cave: [16, 26, 44],
  tower: [20, 32, 52],
  snow: [20, 34, 55],
};
/** A map's kind + theme -> which rate table it walks on. null = never, anywhere on it. */
export function terrainOf(def) {
  if (!def) return null;
  if (def.kind === 'town' || def.kind === 'interior') return null;
  if (def.encounters === false) return null;
  const theme = def.theme || 'grass';
  if (def.kind === 'dungeon') return theme === 'snow' ? 'snow' : 'cave';
  if (theme === 'cave') return 'cave';
  if (theme === 'snow') return 'snow';
  if (theme === 'stone' || theme === 'wood') return 'tower';
  return 'field';
}

/** Where a wipe puts you down again: the chapel of Saint Alden, in the home village.
 *  Land on the forecourt dirt (measured clear of the Beck and of the chapel door exit — the old
 *  (0, -14.6) / (0, -16.5) sat on the door pad and walked a child into int_chapel on every wake). */
export const CHURCHES = {
  meadow: { map: 'puddlewick', x: 2.0, z: -14.0, facing: 180 },
  puddlewick: { map: 'puddlewick', x: 2.0, z: -14.0, facing: 180 },
};
/** SYSTEMS §6.2: warm, a little funny, different every time. Never the words "game over". */
const PRIEST = [
  'You wake on a bench that has\nheld a lot of adventurers.{n}The cushion knows.',
  str('defeat.church'),
  'Somebody carried you in.\nThey did not leave a name.{n}They left your boots by the door.',
  'The bell rang for you. It does\nthat.{n}Sit up slowly.',
  'You were dreaming about a very\nlarge pudding.{n}It was not a monster. Probably.',
  'Tea. Then feet. Then the road.{n}In that order, mind.',
];
/** The woman at the door (SYSTEMS §6.1.6). She is knitting. She does not look up much. */
const HELPER_LINES = [
  'Sit down a minute. You look\nlike weather.',
  'There. All mended, and three\nStrong Herbs for the pocket.',
];

const E = {
  ctx: null, mapId: null, def: null, terrain: null, table: null, area: null,
  paces: 0, threshold: 40, grace: 80, battles: 0, fights: 0, last: null,
  px: null, pz: null, safe: [], doors: [], doorIn: null, busy: false, offUpdate: null,
  rateScale: 1, lastRoll: null, wipes: 0, helperUsed: {},
};

const rnd = () => Math.random();
/** SYSTEMS §9: triangular, so fights cluster around the mode and never truly double up. */
function triangular(min, mode, max) {
  const u = rnd(), c = (mode - min) / (max - min);
  return u < c ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}
function drawThreshold() {
  const t = RATES[E.terrain] || RATES.field;
  // SYSTEMS §9's escalation, capped so the mode can never climb past the max (it did, and the draw went strange)
  const bump = Math.min(18, 6 * E.battles);
  const min = t[0] + bump, mode = t[1] + bump, max = Math.max(t[2], mode + 10);
  E.threshold = Math.max(6, Math.round(triangular(min, mode, max) * E.rateScale));
  E.lastRoll = { terrain: E.terrain, min, mode, max, got: E.threshold };
  E.armed = false;
  return E.threshold;
}

/** Arriving somewhere: rebuild the table, the safe circles and the grace period. */
function onLoad(map) {
  const def = map && map.def ? map.def : null;
  E.mapId = map ? map.id : null;
  E.def = def;
  E.terrain = terrainOf(def);
  E.area = MAP_AREA[E.mapId] === null ? null : areaFor(E.mapId);
  E.table = def && def.encounters && def.encounters.table ? def.encounters.table : (E.area ? E.area.table : null);
  E.rateScale = def && def.encounters && def.encounters.rate ? (1 / Math.max(0.1, def.encounters.rate)) : 1;
  E.paces = 0;
  E.battles = 0;
  E.armed = false;
  // Arriving somewhere: a breath, not a walk. 80 paces put the first fight of a session 25 s away.
  E.grace = 26;
  E.px = E.pz = null;
  // the gate rule: every exit, plus where the map puts you down, is a place a hurt child always reaches
  E.safe = [];
  guard('safe spots', () => {
    for (const x of (map && map.exits) || []) E.safe.push({ x: x.x, z: x.z, r: SAFE_RADIUS });
    if (def && def.spawn) E.safe.push({ x: def.spawn.x, z: def.spawn.z, r: SPAWN_RADIUS });
    const ch = CHURCHES[E.mapId];
    if (ch && ch.map === E.mapId) E.safe.push({ x: ch.x, z: ch.z, r: SAFE_RADIUS });
  });
  E.doors = [];
  guard('boss doors', () => {
    const own = (def && def.bossDoors) || [];
    for (const d of own.concat(EXTRA_DOORS[E.mapId] || [])) E.doors.push(Object.assign({ r: 2.2 }, d));
  });
  E.doorIn = null;
  if (E.terrain) drawThreshold();
  reviveOnArrival(def);
}

/**
 * SYSTEMS §8: "a knocked-out character revives automatically to 1 HP on a map transition to any town, plus a free
 * full heal at any church. Nobody stays broken." Without this a fight won with the leader worn out put Bram back on
 * the road at 0 HP with nothing in the game to tell him or mend him.
 */
function reviveOnArrival(def) {
  if (!def || (def.kind !== 'town' && def.kind !== 'interior')) return;
  guard('revive on arrival', () => {
    const woke = [];
    for (const m of Roster.ensure().concat(Roster.wagon || [])) {
      if (m && m.hp !== undefined && m.hp <= 0) { m.hp = 1; m.status = undefined; woke.push(m.name); }
    }
    if (woke.length && E.ctx && E.ctx.Field && typeof E.ctx.Field.talk === 'function') {
      const who = woke.length === 1 ? woke[0] : woke.slice(0, -1).join(', ') + ' and ' + woke[woke.length - 1];
      E.ctx.Field.talk({ pages: [`${who} ${woke.length === 1 ? 'comes' : 'come'} round on the way into town.{n}A sit down and a cup of something, then.`], voice: 'narrator' });
    }
  });
}

const EXTRA_DOORS = {};

function inSafeZone(x, z) {
  for (const s of E.safe) if (Math.hypot(s.x - x, s.z - z) < s.r) return true;
  return false;
}

/** Every tick on the field: count paces, and only where a fight is allowed to happen. */
function onUpdate(dt, info) {
  if (!E.ctx || E.busy) return;
  if (info && info.top === false) return;                   // a dialogue or a menu is open: nothing is walking
  const p = guard('player', () => E.ctx.Field.player());
  if (!p) return;
  if (E.px == null) { E.px = p.x; E.pz = p.z; return; }
  const dx = p.x - E.px, dz = p.z - E.pz;
  E.px = p.x; E.pz = p.z;
  // boss doors first: walking into one asks a question, it never just happens to you
  for (const d of E.doors) {
    const near = Math.hypot(d.x - p.x, d.z - p.z) < d.r;
    if (near && E.doorIn !== d) { E.doorIn = d; askBoss(d); return; }
    if (!near && E.doorIn === d) E.doorIn = null;
  }
  if (!E.terrain || !E.table) return;
  if ((p.speed || 0) < MOVING) return;                      // the look-around rule
  const paces = (Math.hypot(dx, dz) / STRIDE) * (p.running ? 1.15 : 1);
  if (!(paces > 0)) return;
  if (E.grace > 0) { E.grace -= paces; return; }
  E.paces += paces;
  if (E.paces < E.threshold) return;
  // the gate rule: inside a doorstep the fight is ARMED, not cancelled — it goes off on the first pace outside
  if (inSafeZone(p.x, p.z)) { E.armed = true; return; }
  E.armed = false;
  E.paces = 0;
  trigger();
}

function trigger() {
  if (E.busy) return;
  E.busy = true;
  E.battles++;
  E.fights++;
  E.last = { at: Date.now(), map: E.mapId, terrain: E.terrain, threshold: E.threshold };
  guard('start', () => startBattle(E.area ? E.area.id : 'long_lane', {
    protectedMap: E.battles <= 3,                            // the first three fights on a map never ambush you
    onEnd: (out) => finish(out),
  }));
  // a fight that fails to start must never leave the field frozen
  setTimeout(() => { if (E.busy && !(E.ctx && E.ctx.Scenes && E.ctx.Scenes.top() === 'battle')) E.busy = false; }, 4000);
}

/** The fight is over: grace, a fresh threshold, and — if it went badly — the walk to the chapel. */
async function finish(out) {
  E.busy = false;
  E.grace = out && out.outcome === 'defeat' ? 120 : 60;      // SYSTEMS §9
  E.paces = 0;
  drawThreshold();
  if (!out) return;
  if (out.outcome === 'defeat') { await wakeAtChurch(out); return; }
  // a scripted end (the Sunmane stopping mid-roar) can hand back a "victory" with everybody worn out: the family
  // still needs carrying home, and the game must never leave a child standing on the road at 0 HP
  const up = guard('standing', () => Roster.ensure().filter((m) => (m.hp ?? 1) > 0).length);
  if (up === 0) await wakeAtChurch(out);
}

/** SYSTEMS §6.2 — the gentle defeat. No walls, no "Game Over", one sentence a child can act on. */
export async function wakeAtChurch(out) {
  E.wipes++;
  const here = E.mapId;
  const ch = CHURCHES[here] || CHURCHES.meadow;
  guard('church teleport', () => E.ctx.Field.teleport(ch.map, ch.x, ch.z, ch.facing));
  guard('church heal', () => Roster.heal());
  guard('church bell', () => { if (E.ctx.Sfx && E.ctx.Audio && E.ctx.Audio.ready) E.ctx.Sfx.play('save_church_bell', { vol: 0.7 }); });
  // The engine's `wipe` event already printed result.advice.text (DATA-SHAPES §6.1: it is in the event's lines),
  // so the priest only adds the warm, slightly funny part — a different one each time.
  const pages = [PRIEST[E.wipes % PRIEST.length]];
  guard('church talk', () => E.ctx.Field.talk({ pages, name: 'the priest', voice: 'narrator' }));
  E.grace = 120;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// boss doors
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function bossSpecOf(door) {
  const area = AREA_BY_ID[door.area];
  if (!area) return null;
  const spec = door.boss === 2 ? area.boss2 : area.boss;
  return spec ? { area, spec, which: door.boss === 2 ? 2 : 1, key: spec.enemies.join('+') } : null;
}

/** Step into the circle in front of a boss door and the game asks. It never just happens to you. */
async function askBoss(door) {
  const info = bossSpecOf(door);
  if (!info || E.busy) return;
  E.busy = true;
  const wipes = Roster.bossWipes[info.key] || 0;
  try {
    // From the second wipe in a row: the unhurried woman with the basket is at the door (SYSTEMS §6.1.6)
    if (wipes >= 2 && !E.helperUsed[info.key]) {
      E.helperUsed[info.key] = true;
      guard('helper heal', () => Roster.heal());
      const herbs = (Roster.helper && Roster.helper.items) || { strong_herb: 3 };
      for (const [id, n] of Object.entries(herbs)) Roster.bag[id] = (Roster.bag[id] || 0) + n;
      const hint = (Roster.helper && Roster.helper.text) || null;
      const pages = HELPER_LINES.concat(hint ? [hint] : []);
      await new Promise((res) => {
        let done = false;
        const fin = () => { if (!done) { done = true; res(); } };
        const ok = guard('helper talk', () => E.ctx.Field.talk({ pages, name: 'a woman with a basket', voice: 'nettle', onClose: fin }));
        if (!ok) fin();
      });
    }
    const ready = await confirmBoss(door, info);
    if (!ready) { E.busy = false; return; }
    E.busy = true;
    guard('boss start', () => startBattle(info.area.id, {
      boss: info.which, level: null, bossWipes: wipes,
      onEnd: (out) => finish(out),
    }));
  } catch (e) {
    reportError('encounter askBoss', e);
    E.busy = false;
  }
}

/** "Something is waiting past this door. Go on?" — a window and a Yes / No, never a surprise. */
async function confirmBoss(door, info) {
  const UIm = E.ctx.UI;
  if (!UIm || typeof UIm.yesNo !== 'function') return true;
  const name = door.name || info.spec.enemies.join(' and ');
  const ask = door.ask || 'Something is waiting past this door.';
  let win = null;
  try {
    win = UIm.window({ id: 'boss-door-ask', centerX: true, bottom: 300, width: 720, slim: true, title: name,
      content: ask + '\nGo on?', destroyOnClose: true });
    await win.open();
    return await UIm.yesNo({ id: 'boss-door', initial: 'no' });
  } catch (e) {
    reportError('encounter confirmBoss', e);
    return false;
  } finally {
    try { if (win) win.close(); } catch (_) { /* it is only a window */ }
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the public face
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const Encounter = {
  /** Add a boss door to a map (a demo, a story script, or P23 through the map def's `bossDoors`). */
  addBossDoor(mapId, door) {
    const list = EXTRA_DOORS[mapId] || (EXTRA_DOORS[mapId] = []);
    list.push(Object.assign({ r: 2.2 }, door));
    if (mapId === E.mapId) E.doors.push(Object.assign({ r: 2.2 }, door));
    return list.length;
  },
  doors(mapId) { return (EXTRA_DOORS[mapId] || []).slice(); },
  /** Force the next fight to be one pace away (critics, demos). */
  soon(paces = 1) { E.grace = 0; E.paces = Math.max(0, E.threshold - Math.max(0, paces)); return { paces: E.paces, threshold: E.threshold }; },
  now() { if (E.busy || !E.area) return { ok: false, reason: E.busy ? 'busy' : 'no encounters here' }; E.paces = 0; trigger(); return { ok: true, area: E.area.id }; },
  state() {
    const inSafe = E.px == null ? null : inSafeZone(E.px, E.pz);
    const ready = E.paces >= E.threshold;
    // why nothing is happening, in one word — so a critic can measure it instead of guessing
    const held = E.busy ? 'busy' : !E.terrain || !E.table ? 'no encounters here'
      : E.grace > 0 ? 'grace' : ready && inSafe ? 'armed: waiting to leave the doorstep' : ready ? 'firing' : null;
    return { map: E.mapId, terrain: E.terrain, area: E.area ? E.area.id : null,
      table: E.table ? E.table.map(([id, w]) => `${id}x${w}`) : null,
      paces: Math.round(E.paces * 10) / 10, threshold: E.threshold, stepsToNext: Math.max(0, Math.round(E.threshold - E.paces)),
      grace: Math.max(0, Math.round(E.grace)), battlesOnMap: E.battles, fights: E.fights, wipes: E.wipes,
      roll: E.lastRoll, safeZones: E.safe.length, safeRadius: SAFE_RADIUS, armed: !!E.armed, held,
      doors: E.doors.map((d) => ({ area: d.area, x: d.x, z: d.z })),
      inSafeZone: inSafe, busy: E.busy, rates: RATES };
  },
};

export function install(ctx = {}) {
  E.ctx = ctx;
  if (ctx.Field && typeof ctx.Field.on === 'function') {
    ctx.Field.on('load', (info) => guard('load', () => onLoad(info && info.map)));
    ctx.Field.on('update', (dt, info) => guard('update', () => onUpdate(dt, info)));
  }
  if (ctx.Bus) {
    // A battle that started some other way (a story script, __DQ.battle) still earns its grace period.
    ctx.Bus.on('battle.end', (out) => {
      if (E.busy) return;                                   // one we started: finish() has it
      guard('battle.end', () => finish(out));
    });
  }
  const D = ctx.Debug || Debug;
  D.provide('encounter', () => Encounter.state());
  D.expose('encounterSoon', (paces = 1) => Encounter.soon(paces));
  D.expose('encounterNow', () => Encounter.now());
  D.expose('bossDoor', (area = 'cobwell_manor', which = 1) => {
    const info = bossSpecOf({ area, boss: which });
    if (!info) return { ok: false, reason: `no boss for area "${area}"`, areas: Object.keys(AREA_BY_ID) };
    const wipes = Roster.bossWipes[info.key] || 0;
    guard('debug boss', () => startBattle(info.area.id, { boss: info.which, bossWipes: wipes, onEnd: (o) => finish(o) }));
    return { ok: true, area: info.area.id, boss: info.spec.enemies, level: info.spec.level, wipes };
  });
  D.expose('church', () => { wakeAtChurch({ outcome: 'defeat', result: null }); return CHURCHES[E.mapId] || null; });
  return Encounter;
}

export default install;
