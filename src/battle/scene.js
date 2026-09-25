/**
 * scene.js — the 'battle' scene: wires the rules engine (battle.js / actions.js / ai.js) to input, the command
 * windows and the presenter.                                             (P14/P15, owner: src/battle/scene.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx), so filling it puts real fights in /index.html.
 *
 * HOW A FIGHT RUNS (docs/DATA-SHAPES §6, docs/SYSTEMS-BIBLE §7)
 *   Scenes.push('battle', {area, enemies?, boss?, level?, seed?, bossWipes?, onEnd?})   — opaque, over the field
 *   createBattle({party, wagon, enemies, data, rng, options}) is the whole rules engine; this file only:
 *     1. asks it what it needs   — battle.needsCommand() names the ONE member who takes orders (Bram; everybody
 *        else fights by their Tactics and decides on their own turn, DQV's way)
 *     2. opens the F4 windows for that                                   (UI.menu / MessageBox — the approved look)
 *     3. resolves the round and plays the events back one beat at a time (src/battle/present.js does the pictures)
 *     4. writes the result into the Roster below, and pops straight back to the field where you were standing
 *   ONE press of Confirm is the whole round for a child who only wants to fight: it finishes the line that is
 *   typing, then opens the next window — and it dismisses the victory tally and the level-up card.
 *
 * THE ROSTER — the party between battles, until P18 owns it
 *   Nothing else in the build keeps a party yet, so `Roster` here holds the family, the wagon, the gold, the bag,
 *   the hidden struggle score and the befriending state, saves them through the F5 contract keys ('party', 'gold',
 *   'inventory') and publishes them in __DQ.state().party / .gold. P18 can take it over key by key.
 *   NEEDS P16/P20/P21: the rules data still comes from tests/battle/data.js (docs/DATA-SHAPES calls it the working
 *   example of every shape); the moment src/data/monsters.js, spells.js and items.js exist, DATA below points there.
 *
 * __DQ: battle(...) · fight(area, opts) · command(...) · tactic(who, t) · autoplay(n) · answer(yes) · idle() ·
 *       log(n) · roster() · state().battle / .party / .gold / .battleUi / .battlePresent
 */
import { Scenes } from '../engine/states.js';
import { Debug, reportError } from '../engine/debug.js';
import { UI } from '../ui/window.js';
import { MessageBox } from '../ui/text.js';
import { Transitions } from '../ui/transitions.js';
import { createBattle, TACTICS, TACTIC_BY_ID } from './battle.js';
import { makeRng } from './formulas.js';
import { newCompanion, newMember, statsFor } from '../data/growth.js';
import { createPresenter, setLivePresenter } from './present.js';
import DATA from '../../tests/battle/data.js';
import { AREAS, AREA_BY_ID, rollEncounter } from '../../tests/battle/areas.js';
import { ITEMS as CANON_ITEMS } from '../data/items.js';

/** Prefer the canon item table (P21) for give / bag rows; fall back to the battle fixture. */
const ITEM_TABLE = Object.assign({}, DATA.items || {}, CANON_ITEMS || {});

const guard = (where, fn) => { try { return fn(); } catch (e) { reportError('battle ' + where, e); return undefined; } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Which area's monsters, levels and boss a map belongs to (P23 maps -> tests/battle/areas.js areas). */
export const MAP_AREA = {
  meadow: 'long_lane',
  puddlewick: null,                      // home: nothing ambushes you in the village
};
export const areaFor = (mapId) => AREA_BY_ID[MAP_AREA[mapId] || ''] || AREA_BY_ID.long_lane;

/**
 * BEFRIENDING — CANON B12 gates wild monsters behind `ch2.wagon` ("they have nowhere to ride"), which is why the
 * areas carry `act`. But there is no story module in the build yet and the Long Lane IS the whole playable game, so
 * that gate made the single signature beat of Dragon Quest V unreachable: 264 fights, nought monsters asking.
 * So: on from Act II, on once `ch2.wagon` is set, and on in a build that has no story at all (this one).
 * `__DQ.befriending(true|false|'auto')` forces it either way.   NEEDS P26: set `ch2.wagon` and this falls into line.
 */
let BEFRIEND = 'auto';
function storyPresent() {
  if (L.ctx && (L.ctx.Story || L.ctx.Quests || L.ctx.Chapters)) return true;
  // Plugin ctx may not carry Story (P26 cannot edit main.js) — read the live published state instead.
  try {
    const st = (typeof window !== 'undefined' && window.__DQ && window.__DQ.state && window.__DQ.state()) || null;
    if (st && (st.story || st.quest || st.act1)) return true;
  } catch (_) {}
  return false;
}
function befriendOn(area) {
  if (BEFRIEND !== 'auto') return !!BEFRIEND;
  if (!area || area.act >= 2) return true;
  if (guard('flag', () => L.ctx && L.ctx.Debug && typeof window !== 'undefined' && window.__DQ
    && typeof window.__DQ.flag === 'function' && window.__DQ.flag('ch2.wagon'))) return true;
  return !storyPresent();
}

/** How long each kind of event holds on screen before the next one (ms, SYSTEMS §7). */
const HOLD = {
  appear: 360, ambush: 360, round: 140, act: 100, damage: 170, heal: 190, defeat: 270, telegraph: 1000,
  victory: 700, levelup: 460, recruit_offer: 400, wipe: 1500, transform: 1000, phase: 900, spared: 900,
  message: 220, status: 180, swap: 360, summon: 700, flee: 360, end: 0, scripted_end: 700,
};
const LINE_GAP = 110;
/**
 * Glyphs a second in the COMBAT LOG. Dialogue types at SYSTEMS §7's 38 (reading pace, a person talking); a blow-by-
 * blow round is not a person talking, and at 38 one gloop cost eight seconds of watching letters arrive. DQ's own
 * battle text is brisk — this is that, still with a tick per glyph, and Confirm still finishes the line at once.
 */
const LOG_SPEED = 72;
/** Events that change who the party IS: the status windows have to catch up before the beat is shown. */
const SYNC_AFTER = { levelup: 1, swap: 1, transform: 1, summon: 1, revive: 1, reorder: 1 };
/**
 * The window is what a child reads, so it reads properly. Two things the data cannot say for itself yet:
 *   "1 experience points"  -> "1 experience point"   (the engine builds that line from a number)
 *   "Two Peckishs"         -> "Two Peckishes"        (a plural of name + 's' on a sibilant ending)
 * NEEDS P16: a `plural` on every monster whose name does not just take an s (DATA-SHAPES 2).
 */
function polish(line) {
  return String(line)
    .replace(/\b1 experience points\b/g, '1 experience point')
    .replace(/\b1 gold coins\b/g, '1 gold coin')
    .replace(/(sh|ch|x|z)s\b/g, '$1es');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// The Roster — who you are, between fights
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const HERB_PRICE = Object.fromEntries(Object.values(ITEM_TABLE).filter((i) => i && i.kind === 'consumable' && i.buy > 0).map((i) => [i.id, i.buy]));

export const Roster = {
  party: null, wagon: [], gold: 30, bag: { herb: 3 }, assist: 0,
  recruit: { enabled: true, kidMode: true, joined: {}, misses: {}, battlesSinceRecruit: 0 },
  bossWipes: {}, fights: 0, defeats: 0, helper: null,

  /** New game: just the boy. Story adds Papa as guest at B2 and Bobble at B3 (CANON §4). */
  ensure() {
    if (!this.party) {
      this.party = guard('roster build', () => AREA_BY_ID.long_lane_alone.party(1)) || [];
      this.wagon = [];
    }
    return this.party;
  },
  reset() {
    this.party = null; this.wagon = []; this.gold = 30; this.bag = { herb: 3 }; this.assist = 0;
    this.recruit = { enabled: true, kidMode: true, joined: {}, misses: {}, battlesSinceRecruit: 0 };
    this.bossWipes = {}; this.fights = 0; this.defeats = 0; this.helper = null;
    this.ensure();
    return this;
  },
  /** Free church heal (SYSTEMS §6.1): nobody stays broken. */
  heal() {
    this.ensure();
    for (const m of this.party.concat(this.wagon)) {
      const s = guard('stats', () => statsFor(m, m.lvl || 1));
      m.hp = s ? s.hp : undefined;
      m.mp = s ? s.mp : undefined;
      m.status = undefined;
    }
    return this;
  },
  /** Write a finished battle back (DATA-SHAPES §7). */
  applyResult(r, { boss = null } = {}) {
    if (!r) return this;
    this.party = (r.party || this.party).slice();
    this.wagon = (r.wagon || this.wagon).slice();
    this.gold = Math.max(0, Math.round(r.goldAfter ?? this.gold));
    this.bag = Object.assign({}, r.bag || this.bag);
    if (r.assist) this.assist = r.assist.after;
    if (r.recruit && r.recruit.state) this.recruit = Object.assign({}, this.recruit, r.recruit.state);
    this.fights++;
    if (r.outcome === 'defeat') this.defeats++;
    const key = boss ? [].concat(boss).join('+') : null;
    if (key) {
      if (r.bossWipe) this.bossWipes[key] = (this.bossWipes[key] || 0) + 1;
      else if (r.bossDefeated) delete this.bossWipes[key];
    }
    this.helper = r.advice && r.advice.helper ? { boss: key, ...r.advice.helper } : this.helper;
    return this;
  },
  /** Restock the herb bag at a shop price, as far as the purse goes (used by the demo's inn). */
  restock(want = { herb: 3 }) {
    let spent = 0;
    for (const [id, n] of Object.entries(want)) {
      while ((this.bag[id] || 0) < n && this.gold >= (HERB_PRICE[id] || 1e9)) {
        this.gold -= HERB_PRICE[id]; spent += HERB_PRICE[id]; this.bag[id] = (this.bag[id] || 0) + 1;
      }
    }
    return spent;
  },
  /** Everything that makes the next fight what it is, as plain JSON — for a seed search that must leave no trace. */
  snapshot() {
    this.ensure();
    return JSON.parse(JSON.stringify({ party: this.party, wagon: this.wagon, gold: this.gold, bag: this.bag,
      assist: this.assist, recruit: this.recruit, bossWipes: this.bossWipes, fights: this.fights,
      defeats: this.defeats, helper: this.helper }));
  },
  restore(snap) {
    if (!snap) return this;
    const v = JSON.parse(JSON.stringify(snap));
    this.party = v.party; this.wagon = v.wagon; this.gold = v.gold; this.bag = v.bag;
    this.assist = v.assist; this.recruit = v.recruit; this.bossWipes = v.bossWipes;
    this.fights = v.fights; this.defeats = v.defeats; this.helper = v.helper;
    return this;
  },
  describe() {
    this.ensure();
    const one = (m) => ({ id: m.id, name: m.name, kind: m.kind, lvl: m.lvl, hp: m.hp ?? null, mp: m.mp ?? null,
      tactic: m.tactic || (m.kind === 'guest' ? null : 'wisely') });
    return { party: this.party.map(one), wagon: this.wagon.map(one), gold: this.gold, bag: Object.assign({}, this.bag),
      fights: this.fights, defeats: this.defeats, assist: this.assist, bossWipes: Object.assign({}, this.bossWipes),
      friends: this.wagon.filter((m) => m.kind === 'monster').map((m) => m.name), helper: this.helper };
  },
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the live battle
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const L = {
  ctx: null, session: null, present: null, box: null, menu: null, ui: null,
  confirmAt: -1e9, confirmUntil: -1e9, instant: false, lastResult: null, lastArea: null, sound: [], busy: false, waiting: null,
  lastLine: null, autoAnswer: true, speed: 1, theme: null,
};

/** SYSTEMS §7: every timing scales by one setting — Gentle 1.25x, Normal 1.0x, Brisk 0.7x — and auto-battle
 *  (Fight! / playOut) runs at 0.7x on top of it, so a child who is bored of pressing Attack can just watch. */
const rate = () => L.speed * (L.session && L.session.autopilot ? 0.7 : 1);

const nowMs = () => (UI.time || 0) * 1000;
const noteSfx = (id) => { L.sound.push(id); if (L.sound.length > 24) L.sound.shift(); };

function music(theme, opts = {}) {
  const c = L.ctx;
  L.theme = theme;
  if (!c || typeof c.Music !== 'function') return;
  guard('music', () => {
    const p = c.Music();
    if (p && p.then) p.then((M) => { try { if (M) M.play(theme, Object.assign({ fade: 0.25 }, opts)); } catch (e) { reportError('battle music', e); } }).catch(() => {});
  });
}
function musicStop(fade = 0.05) {
  const c = L.ctx;
  if (!c || typeof c.Music !== 'function') return;
  guard('music stop', () => {
    const p = c.Music();
    if (p && p.then) p.then((M) => { try { if (M) M.stop({ fade }); } catch (_) {} }).catch(() => {});
  });
}
function sting(id) {
  const c = L.ctx;
  noteSfx('sting:' + id);
  if (!c || typeof c.Music !== 'function') return;
  guard('sting', () => {
    const p = c.Music();
    if (p && p.then) p.then((M) => { try { if (M) M.stinger(id); } catch (_) {} }).catch(() => {});
  });
}
function blip(id, opts) {
  const c = L.ctx;
  noteSfx(id);
  guard('sfx', () => { if (c && c.Sfx && c.Audio && c.Audio.ready) c.Sfx.play(id, opts); });
}

/** A beat: wait `ms` of engine time, cut short by a press of Confirm (or a recent mash window). */
function beat(rawMs) {
  const ms = rawMs * rate();
  if (L.instant || !(ms > 0)) return Promise.resolve(true);
  const start = nowMs();
  return new Promise((resolve) => {
    const off = UI.onUpdate(() => {
      if (nowMs() - start >= ms || L.confirmAt > start || nowMs() < L.confirmUntil || !L.session || !L.session.alive) {
        off(); resolve(true);
      }
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the windows
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** The DQ bottom row: the command window on the left, the message window beside it. Its width never changes, so a
 *  page the typewriter has laid out can never be clipped by a later move. */
const MSG = { left: 420, width: 844, bottom: 18 };
const CMD = { left: 16, bottom: 16, minWidth: 380 };

function messageBox() {
  if (L.box && !L.box.destroyed) return L.box;
  L.box = new MessageBox({ id: 'battle-msg', left: MSG.left, width: MSG.width, bottom: MSG.bottom, lines: 3,
    speed: 38, pop: 'up', modal: false });
  return L.box;
}
/**
 * One line into the message window, typed at SYSTEMS §7's 38 glyphs a second. A line too long for the window is
 * laid out as pages and the pages turn THEMSELVES after a beat (a child watching a fight must never have to press
 * anything to see the rest of a sentence) — Confirm still finishes the page at once and turns it early.
 */
function say(raw, { voice = 'narrator' } = {}) {
  const box = messageBox();
  const line = polish(raw);
  L.lastLine = line;
  if (L.instant) { guard('say', () => box.show(line, { voice })); return Promise.resolve(true); }
  const p = guard('say', () => box.say(line, { voice, wait: false, caret: true, speed: LOG_SPEED / rate() }));
  if (!p || typeof p.then !== 'function') return Promise.resolve(true);
  const turn = 0.72 * rate();
  const off = UI.onUpdate(() => {
    try {
      if (box.destroyed || box.finished) { off(); return; }
      if (box.tw.pageDone && box.tw.hasNext() && box.tw.sinceDone > turn) { box.tw.next(); box.setCaret(false); }
    } catch (e) { off(); reportError('battle page turn', e); }
  });
  return p.then((v) => { off(); return v; }, (e) => { off(); reportError('battle say', e); return false; });
}
function clearLines() { guard('clear', () => { if (L.box && !L.box.destroyed) L.box.clearText(); }); }
/** Take the combat log off the screen entirely, so the victory window is the only thing in the frame. */
function hideBox() { guard('hide box', () => { if (L.box && !L.box.destroyed) { L.box.clearText(); L.box.close(); } }); }

/** One F4 menu, awaited. Returns the chosen item (or null on cancel). */
function ask({ items, title, columns = 1, left = CMD.left, bottom = CMD.bottom, width, minWidth = 300, hint = null, onChange = null, initial = 0 }) {
  messageBox();
  const m = UI.menu({
    id: 'battle-cmd', left, bottom, columns, items, title, minWidth, width, initial,
    destroyOnClose: true, closeOnSelect: true, origin: '0 100%', pop: 'up',
    onChange: (it) => { if (onChange) guard('menu change', () => onChange(it)); },
  });
  L.menu = m;
  L.ui = { kind: title, items: items.map((i) => (typeof i === 'string' ? i : i.label)), title };
  if (hint) guard('hint', () => { const el = document.createElement('div'); el.className = 'dq-label'; el.style.whiteSpace = 'normal'; el.textContent = hint; m.body.appendChild(el); });
  return m.choose().then((it) => { L.menu = null; L.ui = null; return it; });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the event queue: one beat each, never two lines at once
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Instant mode (autoplay, sims, a critic driving the rules): apply every beat with no waiting at all. */
function flushEvents(events) {
  const S = L.session;
  if (!S) return Promise.resolve();
  for (const ev of events || []) {
    S.log.push(ev);
    if (S.log.length > 200) S.log.shift();
    guard('present ' + ev.t, () => L.present && L.present.play(ev));
    const lines = ev.lines || (ev.text ? [ev.text] : []);
    if (lines.length) { L.lastLine = lines[lines.length - 1]; guard('show', () => { const b = messageBox(); b.show(lines.map(polish).join('{n}')); }); }
    if (ev.t === 'recruit_offer') resolveRecruit(ev, L.autoAnswer !== false);
    S.beats++;
  }
  if (L.present && S.battle) guard('sync', () => L.present.setParty(S.battle.snapshot()));
  return Promise.resolve();
}

async function playEvents(events) {
  const S = L.session;
  if (!S) return;
  if (L.instant) return flushEvents(events);
  S.queue.push(...(events || []));
  if (S.draining) return;
  S.draining = true;
  L.busy = true;
  try {
    while (S.alive && S.queue.length) {
      const ev = S.queue.shift();
      S.log.push(ev);
      if (S.log.length > 200) S.log.shift();
      guard('present ' + ev.t, () => L.present && L.present.play(ev));
      if (SYNC_AFTER[ev.t] && L.present) guard('sync', () => L.present.setParty(S.battle.snapshot()));
      // the join question and the tally each get the window to themselves
      if (ev.t === 'recruit_offer' || ev.t === 'victory' || ev.t === 'wipe') clearLines();
      /**
       * SYSTEMS §10.1 — victory is a MOMENT, not a line in the log. The music stops dead, the fanfare stings, the
       * combat log window goes away entirely and the frame is held while a window of its own counts the spoils up.
       * Nothing about the tally goes through the message box any more.
       */
      if (ev.t === 'victory') {
        musicStop(0.05);
        await beat(170);
        sting('victory');
        hideBox();
        L.waiting = 'victory';
        if (L.present) await L.present.victory(ev);
        else await beat(900);
        L.waiting = null;
        await beat(240);                                   // §10.3: the tally closes, and 0.4 s of nothing
        S.beats++;
        continue;
      }
      if (ev.t === 'levelup') sting('level_up');
      if (ev.t === 'recruit_offer') sting('join');
      const lines = ev.lines || (ev.text ? [ev.text] : []);
      const show = ev.t === 'levelup' ? lines.slice(0, 1) : lines;   // the level-up panel takes the stat lines
      for (let i = 0; i < show.length && S.alive; i++) {
        await say(show[i]);
        if (i < show.length - 1) await beat(LINE_GAP);
      }
      if (!S.alive) break;
      await beat(HOLD[ev.t] ?? 300);
      if (!S.alive) break;
      if (ev.t === 'levelup') { L.waiting = 'levelup'; await (L.present ? L.present.levelUp(ev) : Promise.resolve()); L.waiting = null; }
      if (ev.t === 'recruit_offer') { L.waiting = 'recruit'; await askRecruit(ev); L.waiting = null; }
      if (ev.t === 'wipe') { L.waiting = 'wipe'; await beat(900); L.waiting = null; }
      S.beats++;
    }
  } finally {
    S.draining = false;
    L.busy = false;
    if (L.present && S.battle) guard('sync', () => L.present.setParty(S.battle.snapshot()));
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// commands — the one window a child ever has to use
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const tacticLabel = (t) => (TACTIC_BY_ID[t] ? TACTIC_BY_ID[t].short : '');

async function refuse(text) {
  blip('buzzer');
  await say(text);
  await beat(700);
}

/** The per-character command window. Returns a command object, 'auto', 'undo' or null (nothing chosen). */
async function askCommand(actor) {
  const S = L.session;
  const b = S.battle;
  const snap = b.snapshot();
  const foes = snap.enemies.filter((e) => e.alive);
  const hasSpell = actor.spells && actor.spells.some((s) => !s.field);
  const hasItem = Object.keys(snap.bag || {}).some((k) => ITEM_TABLE[k] && ITEM_TABLE[k].battle && snap.bag[k] > 0);
  const others = b.tactics().filter((t) => t.canChange).length;
  if (L.present) L.present.setActive(actor.id);
  const items = [
    { id: 'fight', label: 'Fight' },
    { id: 'spells', label: 'Spells', right: actor.maxMp ? `${actor.mp}` : '', disabled: !hasSpell },
    { id: 'items', label: 'Items', disabled: !hasItem },
    { id: 'defend', label: 'Defend' },
    { id: 'flee', label: 'Flee' },
    { id: 'tactics', label: 'Tactics' },
  ];
  if (actor.canSwap && actor.canSwap.ok) items.push({ id: 'wagon', label: 'Wagon' });
  if (others > 1) items.push({ id: 'all', label: 'All fight!' });
  const it = await ask({ items, title: actor.name, columns: 2, minWidth: CMD.minWidth, initial: S.cmdIdx[actor.id] || 0 });
  if (!it) return 'undo';
  S.cmdIdx[actor.id] = it.index || 0;
  switch (it.id) {
    case 'fight':
      if (!foes.length) return null;
      if (foes.length === 1) return { type: 'attack', target: foes[0].id };
      return pickTarget('Attack which one?', foes, (id) => ({ type: 'attack', target: id }));
    case 'defend': return { type: 'defend' };
    case 'flee': return { type: 'flee' };
    case 'all': return 'auto';
    case 'tactics': await tacticsMenu(); return null;
    case 'spells': {
      const list = (actor.spells || []).map((s) => ({ id: s.id, label: s.name, right: String(s.mp), disabled: !s.usable, data: s }));
      if (!list.length) { await refuse(`${actor.name} doesn't know any spells yet.`); return null; }
      const pick = await ask({ items: list, title: `Spells · MP ${actor.mp}`, minWidth: 340 });
      if (!pick) return null;
      const s = pick.data;
      if (!s.usable) { await refuse(s.field ? `${s.name} only works out on the road.` : `${actor.name} hasn't the puff for it.`); return null; }
      const sp = DATA.spells[s.id] || {};
      if (sp.target === 'enemy') {
        if (!foes.length) return null;
        return foes.length === 1 ? { type: 'spell', id: s.id, target: foes[0].id }
          : pickTarget(`${s.name} on which one?`, foes, (id) => ({ type: 'spell', id: s.id, target: id }));
      }
      if (['ally', 'fallen', 'self'].includes(sp.target)) {
        const pool = snap.party.filter((p) => (sp.target === 'fallen' ? !p.alive : p.alive));
        if (!pool.length) { await refuse(sp.target === 'fallen' ? 'Nobody needs rousing.' : 'There is nobody to help.'); return null; }
        return pickTarget(`${s.name} on whom?`, pool, (id) => ({ type: 'spell', id: s.id, target: id }), 'party');
      }
      return { type: 'spell', id: s.id };
    }
    case 'items': {
      const list = Object.entries(snap.bag || {}).filter(([k, n]) => ITEM_TABLE[k] && n > 0)
        .map(([k, n]) => ({ id: k, label: ITEM_TABLE[k].name, right: '×' + n, disabled: !ITEM_TABLE[k].battle }));
      if (!list.length) { await refuse('The bag has nothing useful for a fight.'); return null; }
      const pick = await ask({ items: list, title: 'The bag', minWidth: 340 });
      if (!pick) return null;
      const item = ITEM_TABLE[pick.id];
      if (!item.battle) { await refuse(`The ${item.name} won't help in a fight.`); return null; }
      if (item.battle.target === 'enemies') return { type: 'item', id: item.id };
      const pool = snap.party.filter((p) => (item.battle.effect === 'revive' ? !p.alive : p.alive));
      if (!pool.length) { await refuse('Nobody needs it right now.'); return null; }
      return pickTarget(`The ${item.name} for whom?`, pool, (id) => ({ type: 'item', id: item.id, target: id }), 'party');
    }
    case 'wagon': {
      const out = await ask({ items: snap.party.filter((p) => !p.leader).map((p) => ({ id: p.id, label: p.name, right: `HP ${p.hp}` })), title: 'Who climbs up?', minWidth: 330 });
      if (!out) return null;
      const inn = await ask({ items: snap.wagon.filter((p) => p.alive).map((p) => ({ id: p.id, label: p.name, right: `Lv ${p.lvl}` })), title: 'Who climbs down?', minWidth: 330 });
      if (!inn) return null;
      return { type: 'swap', target: inn.id, out: out.id };
    }
    default: return null;
  }
}

/** The target cursor: the chunky gold arrow hops with the menu selection, over the monster it is on. */
async function pickTarget(title, pool, make, side = 'enemy') {
  const first = pool[0] ? pool[0].id : null;
  if (L.present && side !== 'party') L.present.setTarget(first);
  const it = await ask({
    items: pool.map((p) => ({ id: p.id, label: p.name, right: side === 'party' ? `HP ${p.hp}` : '' })),
    title, minWidth: 330,
    onChange: (o) => { if (L.present && side !== 'party') L.present.setTarget(o ? o.id : null); },
  });
  if (L.present) L.present.setTarget(null);
  if (!it) return null;
  return make(it.id);
}

/** Tactics: who fights how. Free — it never costs a turn (DATA-SHAPES §6). */
async function tacticsMenu() {
  const b = L.session.battle;
  const list = b.tactics().filter((t) => !t.guest);
  const items = list.map((t) => ({ id: t.id, label: t.name, right: t.leader ? 'Orders' : tacticLabel(t.tactic), disabled: !t.canChange }));
  if (list.filter((t) => t.canChange).length > 1) items.push({ id: 'all', label: 'Everybody' });
  const who = await ask({ items, title: 'Tactics', minWidth: 360, initial: Math.min(1, items.length - 1) });
  if (!who) return false;
  const cur = who.id === 'all' ? null : (list.find((t) => t.id === who.id) || {}).tactic;
  const pick = await ask({
    items: TACTICS.map((t) => ({ id: t.id, label: t.name, right: t.id === cur ? '●' : '' })),
    title: who.label, minWidth: 360, initial: Math.max(0, TACTICS.findIndex((t) => t.id === cur)),
  });
  if (!pick) return false;
  const r = b.setTactic(who.id, pick.id);
  if (!r.ok) { await refuse(r.text); return false; }
  if (L.present) L.present.setParty(b.snapshot());
  await say(r.text);
  await beat(600);
  return true;
}

/** Nobody on Follow Orders can act (Bram is worn out or asleep): the fight goes on, and you can still run. */
async function partyMenu() {
  const b = L.session.battle;
  const it = await ask({ items: [{ id: 'go', label: 'Fight on' }, { id: 'tactics', label: 'Tactics' }, { id: 'flee', label: 'Flee' }],
    title: 'Your friends fight on', minWidth: 330 });
  if (!it || it.id === 'go') return true;
  if (it.id === 'tactics') { await tacticsMenu(); return false; }
  const r = b.command(null, { type: 'flee' });
  if (!r.ok) { await refuse(r.text); return false; }
  return true;
}

/** MONSTER-BIBLE §7: the monster gets up, looks at you, and asks. The question is the last thing on screen. */
/**
 * The answer to "shall it come along?". Nothing is written to the Roster here — it is banked with the result (the
 * engine hands `result.recruit.state` back and would otherwise overwrite it), so a seed search that never finishes
 * a battle leaves the befriending state exactly as it found it.
 */
function resolveRecruit(ev, yes) {
  const S = L.session;
  const mon = DATA.monsters[ev.monster.species] || {};
  S.offer = ev.monster;
  S.recruitAnswer = !!yes;
  if (!yes) return null;
  const n = (Roster.recruit.joined[ev.monster.species] || 0) + 1;
  const base = mon.nameSuggest || mon.name || 'Friend';
  const name = n > 1 ? `${base} ${['', '', 'II', 'III', 'IV', 'V'][n] || n}` : base;
  const hero = (S.battle.snapshot().party.find((p) => p.id === 'hero') || {}).lvl || 1;
  const friend = guard('companion', () => newCompanion(mon, { id: `${ev.monster.species}_${n}`, name, lvl: Math.max(1, hero - 2) }));
  if (friend) S.newFriends.push(friend);
  return friend ? name : null;
}

/** Write a finished battle into the Roster exactly once: the result, then the answer to the join question. */
function bank(S) {
  if (!S || S.banked || !S.battle || !S.battle.result) return null;
  S.banked = true;
  const r = S.battle.result;
  L.lastResult = r;
  Roster.applyResult(r, { boss: S.boss });
  if (S.offer) {
    const sp = S.offer.species;
    if (S.recruitAnswer) {
      Roster.recruit = Object.assign({}, Roster.recruit,
        { joined: Object.assign({}, Roster.recruit.joined, { [sp]: (Roster.recruit.joined[sp] || 0) + 1 }) });
      for (const f of S.newFriends) Roster.wagon.push(f);
    } else {
      Roster.recruit = Object.assign({}, Roster.recruit,
        { misses: Object.assign({}, Roster.recruit.misses, { [sp]: (Roster.recruit.misses[sp] || 0) + 1 }) });
    }
    S.newFriends = [];
  }
  return r;
}

async function askRecruit(ev) {
  const S = L.session;
  S.offer = ev.monster;
  if (L.present) L.present.join(ev);
  await beat(500);
  if (!S.alive) return;
  const yes = await UI.yesNo({ id: 'battle-join', right: 'calc(50% - 515 * var(--u))', bottom: 234 });
  if (!S.alive) return;
  if (L.present) L.present.joinAnswer(yes);
  const name = resolveRecruit(ev, yes);
  if (yes) {
    blip('confirm');
    sting('join');
    await say(`${name} joined the party!`);
    await beat(600);
    await say(`${name} hops up into the wagon, very pleased with itself. It will Fight Wisely.`);
    await beat(700);
  } else {
    blip('cancel');
    await say(`The ${ev.monster.name} waves you off cheerfully and wanders home.`);
    await beat(700);
  }
  void S;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the round loop
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function runBattle() {
  const S = L.session;
  const b = S.battle;
  await playEvents(b.opening);
  let spins = 0;
  while (S.alive && !b.over && spins++ < 400) {
    if (S.autopilot) {
      guard('autopilot', () => b.autoCommands(S.autopilot));
      await playEvents(b.resolveRound());
      continue;
    }
    let gave = 0;
    for (;;) {
      if (!S.alive || b.over || b.phase !== 'command' || S.autopilot || L.instant) break;
      const need = guard('needsCommand', () => b.needsCommand());
      if (!need) {
        if (gave > 0) break;
        const go = await partyMenu();
        if (go) break;
        continue;
      }
      const cmd = await askCommand(need);
      if (!S.alive) break;
      if (cmd === 'undo') {
        const u = guard('undo', () => b.undoCommand());
        if (u && u.ok && u.actor) { blip('cancel'); gave = Math.max(0, gave - 1); }
        continue;
      }
      if (cmd === 'auto') { guard('auto', () => b.autoCommands('auto')); gave++; break; }
      if (!cmd) continue;
      const r = guard('command', () => b.command(need.id, cmd));
      if (!r || !r.ok) { await refuse((r && r.text) || 'Not that, not now.'); continue; }
      blip('confirm');
      gave++;
    }
    if (!S.alive || b.over) break;
    if (L.present) L.present.setActive(null);
    await playEvents(b.resolveRound());
  }
  if (S.alive) await endBattle();
}

async function endBattle() {
  const S = L.session;
  const b = S.battle;
  const r = bank(S) || b.result || null;
  if (L.present) L.present.setTarget(null);
  const outcome = (r && r.outcome) || 'fled';
  const wiped = outcome === 'defeat';
  if (wiped) { Roster.heal(); if (!L.instant) { await Transitions.white(true, { ms: 500 }); await beat(500); } }
  else if (!L.instant) await Transitions.fadeOut({ ms: 260, colour: 'ink' });
  guard('bus end', () => L.ctx.Bus && L.ctx.Bus.emit('battle.end', { outcome, result: r, area: S.area.id, boss: S.boss, advice: r && r.advice ? r.advice : null }));
  const done = S.onEnd;
  S.alive = false;
  guard('pop', () => { if (Scenes.top() === 'battle') Scenes.pop(); });
  if (typeof done === 'function') await (guard('onEnd', () => done({ outcome, result: r, area: S.area.id, boss: S.boss })) || null);
  guard('field music', () => {
    const m = L.ctx.Field && L.ctx.Field.map;
    if (m && m.music) music(m.music, { fade: 1.2 });
  });
  Transitions.vignette(0, { ms: 300 });
  await Transitions.clear({ ms: wiped ? 700 : 360 });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// starting a fight
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function buildParty(area, { boss = null, level = null, fresh = false } = {}) {
  if (fresh || !Roster.party) {
    const spec = boss && area.boss && [].concat(boss).join('+') === area.boss.enemies.join('+') ? area.boss
      : boss && area.boss2 && [].concat(boss).join('+') === area.boss2.enemies.join('+') ? area.boss2 : null;
    const lvl = level || (spec ? spec.level : area.levels[0]);
    Roster.party = guard('party', () => (spec && spec.party ? spec.party(lvl) : area.party(lvl))) || [];
    Roster.wagon = [];
    if (!Roster.bag || !Object.keys(Roster.bag).length) Roster.bag = Object.assign({}, area.bag || { herb: 3 });
  }
  Roster.ensure();
  return { party: Roster.party, wagon: Roster.wagon };
}

/**
 * The battle scene. ctx:
 *   {area, enemies?, monsters?, boss?, level?, seed?, fresh?, ambush?, protectedMap?, bossWipes?, onEnd?}
 */
function createBattleScene() {
  return {
    opaque: true,
    enter(sctx = {}) {
      const S = {
        alive: true, queue: [], log: [], draining: false, beats: 0, cmdIdx: {}, newFriends: [],
        area: null, boss: null, autopilot: null, onEnd: sctx.onEnd || null, battle: null, recruitAnswer: null,
        offer: null, banked: false,
      };
      L.session = S;
      L.lastResult = null;
      L.sound = [];
      guard('enter', () => {
        const area = S.area = (sctx.area && AREA_BY_ID[sctx.area]) || areaFor(sctx.map || (L.ctx.Field && L.ctx.Field.map ? L.ctx.Field.map.id : null));
        L.lastArea = area.id;
        const bossSpec = sctx.boss ? (sctx.boss === 2 && area.boss2 ? area.boss2 : area.boss) : null;
        S.boss = bossSpec ? bossSpec.enemies : null;
        const rng = makeRng(sctx.seed == null ? (Math.random() * 1e9) | 0 : sctx.seed);
        const level = sctx.level ?? null;
        buildParty(area, { boss: S.boss, level, fresh: !!sctx.fresh || level != null || !Roster.party });
        const list = sctx.enemies || sctx.monsters;
        const foes = list && list.length
          ? list.map((e) => (typeof e === 'string' ? { id: e, partyLevel: area.tableLvl ?? area.areaLevel, areaLevel: area.areaLevel } : e))
          : (bossSpec ? bossSpec.enemies : rollEncounter(area, rng, DATA.monsters));
        const bossKey = S.boss ? S.boss.join('+') : null;
        S.battle = createBattle({
          party: Roster.party, wagon: Roster.wagon, enemies: foes, data: DATA, rng,
          options: {
            gold: Roster.gold, bag: Object.assign({}, Roster.bag), assist: { s: Roster.assist },
            areaLevel: bossSpec ? undefined : area.areaLevel,
            wagonReachable: bossSpec ? false : (area.wagonReachable ?? true),
            ambush: bossSpec ? 'none' : sctx.ambush,
            protectedMap: !!sctx.protectedMap,
            recruit: !bossSpec && befriendOn(area) ? Object.assign({}, Roster.recruit) : null,
            bossWipes: sctx.bossWipes ?? (bossKey ? (Roster.bossWipes[bossKey] || 0) : 0),
            scripted: sctx.scripted || null,
          },
        });
        const snap = S.battle.snapshot();
        L.present = createPresenter({ ctx: Object.assign({}, L.ctx, { tacticName: tacticLabel }), terrain: 'grass', onSfx: noteSfx });
        L.present.setInstant(L.instant);
        setLivePresenter(L.present);
        L.present.setParty(snap);
        L.present.setEnemies(snap.enemies, { drop: !L.instant });
        messageBox();
        clearLines();
        guard('bus start', () => L.ctx.Bus && L.ctx.Bus.emit('battle.start', { area: area.id, boss: S.boss, enemies: snap.enemies.map((e) => e.id) }));
        music(bossSpec ? 'boss' : 'battle', { fade: 0.2 });
      });
      if (!S.battle) { guard('bail', () => Scenes.pop()); return; }
      runBattle().catch((e) => { reportError('battle loop', e); guard('bail', () => { if (Scenes.top() === 'battle') Scenes.pop(); }); });
    },
    exit() {
      const S = L.session;
      if (S) S.alive = false;
      guard('exit menus', () => { if (L.menu) { L.menu.destroy(); L.menu = null; } });
      // Every window this scene can have open, by id. The join Yes/No is NOT L.menu (UI.yesNo makes its own), so
      // leaving the scene with the question up — a story jump, a debug fight, a scene replaced under it — used to
      // strand a live Yes/No on the field with nothing behind it.
      guard('exit windows', () => {
        for (const id of ['battle-cmd', 'battle-join', 'battle-victory']) {
          const w = UI.get(id);
          if (w) w.destroy();
        }
      });
      guard('exit box', () => { if (L.box) { L.box.destroy(); L.box = null; } });
      guard('exit present', () => { if (L.present) L.present.dispose(); });
      setLivePresenter(null);
      L.present = null; L.session = null; L.busy = false; L.waiting = null; L.ui = null;
    },
    update(dt) { if (L.present) L.present.update(dt); },
    render(alpha) { if (L.present) L.present.render(alpha); },
    onInput(btn) {
      if (btn === 'confirm') {
        L.confirmAt = nowMs();
        // Mash window: the next ~0.45s of beats / typewriter finish early (P14 gap #1 — Confirm is the heartbeat).
        L.confirmUntil = L.confirmAt + 450;
        // ONE press is the whole ceremony: it fills the tally, then dismisses it; then the level-up card.
        if (L.present && L.present.tallyOpen) { L.present.skipTally(); return true; }
        if (L.present && L.present.panelOpen) { L.present.skipPanel(); return true; }
        // Finish the current message page at once.
        try {
          if (L.box && L.box.tw && !L.box.destroyed) {
            if (!L.box.tw.pageDone) L.box.tw.complete();
            else if (L.box.tw.hasNext && L.box.tw.hasNext()) L.box.tw.next();
          }
        } catch (_) {}
      }
      if (UI.input(btn)) return true;
      return true;               // nothing below the battle ever gets a button
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the plugin
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Start (or restart) a fight. Accepts everything __DQ.battle / __DQ.fight can be given. */
export function startBattle(a, opts = {}) {
  const o = Object.assign({}, opts);
  if (Array.isArray(a)) o.enemies = a;
  else if (a && typeof a === 'object') Object.assign(o, a);
  else if (typeof a === 'string') o.area = a;
  if (!Scenes.has('battle')) return { ok: false, reason: 'the battle scene is not registered' };
  const push = () => (Scenes.top() === 'battle' ? Scenes.replace('battle', o) : Scenes.push('battle', o));
  if (o.instant || L.instant) { push(); return describeBattle(); }
  return Transitions.swirl().then(() => {
    push();
    return Transitions.clear({ ms: 340 }).then(() => describeBattle());
  });
}

function describeBattle() {
  const S = L.session;
  if (!S || !S.battle) return { ok: false, reason: 'no battle' };
  const snap = S.battle.snapshot();
  return { ok: true, area: S.area.id, boss: S.boss, phase: snap.phase, round: snap.round,
    party: snap.party.map((p) => ({ name: p.name, lvl: p.lvl, hp: p.hp, tactic: p.tactic })),
    enemies: snap.enemies.map((e) => ({ id: e.id, name: e.name, hp: e.hp })) };
}

export function install(ctx = {}) {
  L.ctx = ctx;
  Scenes.register('battle', createBattleScene);
  Roster.ensure();

  // ── the save (F5 contract keys nobody owns yet; P18/P21/P22 can take them one by one) ──────────────────────
  if (ctx.Save && typeof ctx.Save.register === 'function') {
    ctx.Save.register('party', {
      save: () => ({ party: Roster.party, wagon: Roster.wagon, assist: Roster.assist, recruit: Roster.recruit,
        bossWipes: Roster.bossWipes, fights: Roster.fights, defeats: Roster.defeats }),
      load: (v) => {
        if (!v) return;
        if (Array.isArray(v)) { Roster.party = v; return; }
        if (Array.isArray(v.party)) Roster.party = v.party;
        if (Array.isArray(v.wagon)) Roster.wagon = v.wagon;
        Roster.assist = Number(v.assist) || 0;
        if (v.recruit) Roster.recruit = Object.assign({}, Roster.recruit, v.recruit);
        Roster.bossWipes = v.bossWipes || {};
        Roster.fights = Number(v.fights) || 0;
        Roster.defeats = Number(v.defeats) || 0;
      },
      summary: () => {
        const hero = (Roster.describe().party || []).find((p) => p.id === 'hero') || (Roster.describe().party || [])[0];
        return { level: hero ? hero.lvl : null, name: hero ? hero.name : null };
      },
      reset: () => { Roster.reset(); },
    });
    ctx.Save.register('gold', { save: () => Roster.gold, load: (v) => { Roster.gold = Math.max(0, Math.round(Number(v) || 0)); }, reset: () => { Roster.gold = 30; } });
    ctx.Save.register('inventory', { save: () => Object.assign({}, Roster.bag), load: (v) => { Roster.bag = Object.assign({}, v || {}); }, reset: () => { Roster.bag = { herb: 3 }; } });
  }

  // ── __DQ ───────────────────────────────────────────────────────────────────────────────────────────────────
  const D = ctx.Debug || Debug;
  D.provide('battle', () => {
    const S = L.session;
    if (!S || !S.battle) return null;
    const s = S.battle.snapshot();
    return { turn: s.round, phase: s.phase, area: S.area.id, boss: !!S.boss, ambush: s.ambush,
      scripted: s.scripted || null,        // a story fight that ends on a beat, not on HP (B11b's Sunmane)
      enemies: s.enemies.map((e) => ({ id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, alive: e.alive,
        telegraphing: !!e.telegraphing, bigCooldown: e.bigCooldown })),
      needs: s.needs, over: !!S.battle.over, result: s.result ? { outcome: s.result.outcome, exp: s.result.exp, gold: s.result.gold } : null };
  });
  D.provide('party', () => {
    const S = L.session;
    if (S && S.battle) {
      return S.battle.snapshot().party.map((p) => ({ name: p.name, hp: p.hp, mhp: p.maxHp, mp: p.mp, lvl: p.lvl, tactic: p.tactic, leader: !!p.leader }));
    }
    return Roster.describe().party.map((p) => ({ name: p.name, hp: p.hp, mhp: null, mp: p.mp, lvl: p.lvl, tactic: p.tactic }));
  });
  D.provide('gold', () => Roster.gold);
  D.provide('battleUi', () => ({ menu: L.ui, typing: L.busy, waiting: L.waiting, instant: L.instant,
    music: L.theme, offer: L.session && L.session.offer ? L.session.offer : null,
    befriending: { mode: BEFRIEND, onHere: befriendOn(L.lastArea ? AREA_BY_ID[L.lastArea] : AREA_BY_ID.long_lane),
      joined: Object.assign({}, Roster.recruit.joined), misses: Object.assign({}, Roster.recruit.misses) },
    answered: L.session ? L.session.recruitAnswer : null,
    beats: L.session ? L.session.beats : 0, sound: L.sound.slice(-10),
    line: L.lastLine || null }));
  D.provide('roster', () => Roster.describe());

  D.implement('battle', (a) => startBattle(a));
  D.implement('party', (add) => {
    if (add === undefined) return Roster.describe();
    Roster.ensure();
    const has = (list) => (list || []).some((m) => m && m.id === add);
    if (has(Roster.party) || has(Roster.wagon)) return Roster.describe();
    // Prefer growth.js (guests + companions); fall back to the Long Lane draft party for test ids.
    let m = guard('party member', () => newMember(add));
    if (!m) m = guard('party area', () => AREA_BY_ID.long_lane.party(1).find((p) => p && p.id === add));
    if (!m) return { ok: false, reason: `unknown member "${add}"` };
    const st = guard('stats', () => statsFor(m, m.lvl || 1));
    if (st) { m.hp = st.hp; m.mp = st.mp; }
    if (Roster.party.length < 4) Roster.party.push(m);
    else Roster.wagon.push(m);
    return Roster.describe();
  });
  D.implement('heal', () => { Roster.heal(); return Roster.describe(); });
  D.implement('gold', (n) => { if (n !== undefined) Roster.gold = Math.max(0, Math.round(Number(n) || 0)); return Roster.gold; });
  D.implement('give', (itemId, n = 1) => {
    if (!ITEM_TABLE[itemId]) return { ok: false, reason: `unknown item "${itemId}"`, items: Object.keys(ITEM_TABLE).slice(0, 20) };
    Roster.bag[itemId] = (Roster.bag[itemId] || 0) + Math.max(1, n | 0);
    return Object.assign({}, Roster.bag);
  });
  D.implement('setLevel', (n) => {
    const lv = clamp(Math.round(Number(n) || 1), 1, 30);
    Roster.party = guard('setLevel', () => (L.lastArea ? AREA_BY_ID[L.lastArea] : AREA_BY_ID.long_lane).party(lv)) || Roster.party;
    Roster.wagon = [];
    return Roster.describe();
  });

  /** __DQ.fight(area, opts) — every argument, unlike the one-argument __DQ.battle contract (NEEDS F1). */
  D.expose('fight', (area, opts) => startBattle(area, opts));
  D.expose('idle', () => !L.busy && !L.waiting && !(L.present && L.present.panelOpen));
  D.expose('log', (n = 30) => {
    const S = L.session;
    if (!S) return [];
    return S.log.slice(-n).map((e) => `${e.t}${e.actor ? '@' + e.actor : ''}${e.target ? '>' + e.target : ''} ${e.text || ''}`.trim());
  });
  D.expose('roster', (what) => (what === 'reset' ? Roster.reset().describe() : Roster.describe()));
  /** Save / put back the whole party state, so a seed search can run a hundred fights and leave no trace. */
  D.expose('rosterSnapshot', () => Roster.snapshot());
  D.expose('rosterRestore', (snap) => { Roster.restore(snap); return Roster.describe(); });
  D.expose('tactic', (who, t) => {
    const S = L.session;
    if (!S || !S.battle) return null;
    if (who == null) return S.battle.tactics();
    const r = S.battle.setTactic(who, t);
    if (L.present) L.present.setParty(S.battle.snapshot());
    return r;
  });
  /** Resolve up to n rounds with an AI policy, without waiting for the animation. */
  D.expose('autoplay', (n = 99, policy = 'auto') => {
    const S = L.session;
    if (!S || !S.battle) return null;
    const b = S.battle;
    const was = L.instant;
    L.instant = true;
    if (L.present) L.present.setInstant(true);
    guard('close menu', () => { if (L.menu) L.menu.cancel(); });
    guard('autoplay', () => { let k = 0; while (!b.over && k++ < n) flushEvents(b.autoRound(policy)); });
    if (b.over) guard('bank', () => bank(S));
    L.instant = was;
    if (L.present) L.present.setInstant(was);
    return { phase: b.phase, round: b.round, outcome: b.result ? b.result.outcome : null };
  });
  /** Watch the rest of the fight play itself at reading pace. */
  D.expose('playOut', (policy = 'auto') => { const S = L.session; if (!S) return null; S.autopilot = policy; guard('close menu', () => { if (L.menu) L.menu.cancel(); }); return policy; });
  /** Answer a live "shall it come along?" (a critic, a touch shortcut): __DQ.answer(true | false). */
  D.expose('answer', (yes = true) => {
    L.autoAnswer = !!yes;
    const w = UI.get('battle-join');
    if (!w) return false;
    guard('answer', () => { w.setIndex(yes ? 0 : 1); w.confirm(); });
    return true;
  });
  D.expose('instant', (v = true) => { L.instant = !!v; if (L.present) L.present.setInstant(L.instant); return L.instant; });
  /** Wild befriending on / off / 'auto' (CANON B12's `ch2.wagon` gate, with no story module yet). */
  D.expose('befriending', (v) => {
    if (v !== undefined) BEFRIEND = v === 'auto' ? 'auto' : !!v;
    return { mode: BEFRIEND, onHere: befriendOn(L.lastArea ? AREA_BY_ID[L.lastArea] : AREA_BY_ID.long_lane), story: storyPresent() };
  });
  /** SYSTEMS §7 battle speed: 1.25 gentle, 1 normal, 0.7 brisk. */
  D.expose('battleSpeed', (n) => { if (n !== undefined) L.speed = clamp(Number(n) || 1, 0.4, 2); return L.speed; });
  /** What a join offer is answered with while `instant` is on (a seed search, a simulation). */
  D.expose('instantAnswer', (v = true) => { L.autoAnswer = !!v; return L.autoAnswer; });
  D.expose('battleResult', () => L.lastResult);
  D.expose('listAreas', () => AREAS.map((a) => ({ id: a.id, name: a.name, levels: a.levels, areaLevel: a.areaLevel,
    boss: a.boss ? a.boss.enemies : null, boss2: a.boss2 ? a.boss2.enemies : null })));
  return { Roster, startBattle };
}

export default install;
