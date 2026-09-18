/**
 * party.js — who walks with you, who rides in the wagon, and who waits in the paddock at home.
 *                                                                   (P18, owner: src/world/party.js)
 *
 * ONE PARTY. `Roster` in src/battle/scene.js (P14) already holds the family, the wagon, the gold and the bag, and
 * saves them through the F5 keys. This file does NOT keep a second copy: it is the *rules* over that roster —
 * the four who walk, the eight who ride, the paddock behind them, the order they stand in, and who may be moved.
 * It adds one thing the roster had no room for, `Roster.paddock`, and saves that itself under the Save key
 * `friends` (SYSTEMS §8 — the Hollybank Cottage paddock, where a monster can be visited and swapped in).
 *
 *   PLUGIN ENTRY. This module is the one install() for the whole P17+P18 feature: it installs
 *   src/world/companions.js (the followers, the wagon and the paddock on the field) and
 *   src/battle/recruit.js (the join moment and the naming). One line in src/main.js PLUGINS turns the lot on.
 *
 *   Party.members()   the up-to-four who walk and fight, in order (the leader is always first)
 *   Party.wagon()     the up-to-eight who ride behind you
 *   Party.paddock()   everybody else, waiting at Hollybank
 *   Party.add(m)      -> 'party' | 'wagon' | 'paddock'      (fills forward, exactly like DQV)
 *   Party.move(id, 'party'|'wagon'|'paddock') / Party.swap(a, b) / Party.reorder([ids])
 *   Party.canRemove(id)   false for the hero and for guests (Halvard fights his own way and cannot be sent away)
 *   Party.rehome()    push any overflow down the line (wagon full -> paddock) and report where everyone landed
 *   Party.describe()  -> __DQ.state().friends
 *
 * __DQ: friends() · partySwap(a, b) · partyMove(id, where) · partyOrder(ids) · wagonMenu() · state().friends
 */
import { Debug, reportError } from '../engine/debug.js';
import { UI } from '../ui/window.js';
import { Sfx } from '../audio/sfx.js';
import { Roster } from '../battle/scene.js';
import { statsFor } from '../data/growth.js';
import { Companions } from './companions.js';
import { Recruit } from '../battle/recruit.js';

const guard = (where, fn) => { try { return fn(); } catch (e) { reportError('party ' + where, e); return undefined; } };

export const MAX_PARTY = 4;        // SYSTEMS §5: four walk and fight
export const MAX_WAGON = 8;        // eight ride; the rest wait in the paddock
export const MAX_PADDOCK = 32;

const L = { ctx: null, installed: false, lastMove: null };

/** The roster, with the paddock the battle's Roster has no field for. Never returns undefined arrays. */
function R() {
  guard('ensure', () => Roster.ensure());
  if (!Array.isArray(Roster.party)) Roster.party = [];
  if (!Array.isArray(Roster.wagon)) Roster.wagon = [];
  if (!Array.isArray(Roster.paddock)) Roster.paddock = [];
  return Roster;
}
const listOf = (where) => { const r = R(); return where === 'party' ? r.party : where === 'wagon' ? r.wagon : r.paddock; };
const isGuest = (m) => !!(m && (m.kind === 'guest' || m.guest));
const isLeader = (m) => !!(m && (m.leader || m.id === 'hero'));

function find(id) {
  const r = R();
  for (const list of [r.party, r.wagon, r.paddock]) { const m = list.find((x) => x && x.id === id); if (m) return m; }
  return null;
}
function whereIs(id) {
  const r = R();
  if (r.party.some((m) => m && m.id === id)) return 'party';
  if (r.wagon.some((m) => m && m.id === id)) return 'wagon';
  if (r.paddock.some((m) => m && m.id === id)) return 'paddock';
  return null;
}
function detach(id) {
  const r = R();
  for (const list of [r.party, r.wagon, r.paddock]) {
    const i = list.findIndex((m) => m && m.id === id);
    if (i >= 0) return list.splice(i, 1)[0];
  }
  return null;
}
const cap = (where) => (where === 'party' ? MAX_PARTY : where === 'wagon' ? MAX_WAGON : MAX_PADDOCK);

/** Fills forward: into the party if there is room, else the wagon, else the paddock. Returns where it landed. */
function add(member) {
  if (!member) return null;
  const r = R();
  if (find(member.id)) member.id = `${member.id}_${Math.random().toString(36).slice(2, 5)}`;
  const where = r.party.length < MAX_PARTY ? 'party' : (r.wagon.length < MAX_WAGON ? 'wagon' : 'paddock');
  listOf(where).push(member);
  L.lastMove = { id: member.id, to: where, at: Date.now() };
  bump();
  return where;
}

/** Anything over a limit slides down the line (party -> wagon -> paddock). Returns {id: where it ended up}. */
function rehome() {
  const r = R();
  const moved = {};
  while (r.party.length > MAX_PARTY) { const m = r.party.pop(); r.wagon.push(m); moved[m.id] = 'wagon'; }
  while (r.wagon.length > MAX_WAGON) { const m = r.wagon.pop(); r.paddock.push(m); moved[m.id] = 'paddock'; }
  if (Object.keys(moved).length) bump();
  return moved;
}

/** Guests fight their own way and the hero is the hero: neither can be sent to the wagon. */
function canRemove(id) {
  const m = find(id);
  if (!m) return false;
  if (isLeader(m)) return false;
  if (isGuest(m)) return false;
  return true;
}

function move(id, where) {
  const m = find(id);
  if (!m) return { ok: false, reason: `nobody called "${id}"` };
  const from = whereIs(id);
  if (from === where) return { ok: true, id, where, moved: false };
  if (from === 'party' && !canRemove(id)) {
    return { ok: false, reason: isLeader(m) ? `${m.name} leads the way — he stays.` : `${m.name} travels with you his own way.` };
  }
  const dest = listOf(where);
  if (dest.length >= cap(where)) return { ok: false, reason: where === 'party' ? 'Four walk at a time.' : 'No room.' };
  detach(id);
  dest.push(m);
  L.lastMove = { id, from, to: where, at: Date.now() };
  bump();
  return { ok: true, id, where, from, moved: true };
}

/** Trade two members' places, wherever they are. This is how you put a monster in the line-up. */
function swap(aId, bId) {
  const a = find(aId), b = find(bId);
  if (!a || !b) return { ok: false, reason: 'one of them is not in the roster' };
  if (a === b) return { ok: true, moved: false };
  const wa = whereIs(aId), wb = whereIs(bId);
  if (wa === 'party' && !canRemove(aId)) return { ok: false, reason: isLeader(a) ? `${a.name} leads the way.` : `${a.name} goes his own way.` };
  if (wb === 'party' && !canRemove(bId)) return { ok: false, reason: isLeader(b) ? `${b.name} leads the way.` : `${b.name} goes his own way.` };
  const la = listOf(wa), lb = listOf(wb);
  const ia = la.indexOf(a), ib = lb.indexOf(b);
  la[ia] = b; lb[ib] = a;
  L.lastMove = { swap: [aId, bId], at: Date.now() };
  bump();
  return { ok: true, moved: true, a: wb, b: wa };
}

/** Order matters (who is hit first, who walks nearest you). The leader is always pushed back to the front. */
function reorder(ids) {
  const r = R();
  const want = (ids || []).map((id) => find(id)).filter(Boolean);
  const rest = r.party.filter((m) => !want.includes(m));
  const next = want.concat(rest).slice(0, MAX_PARTY);
  const lead = next.findIndex(isLeader);
  if (lead > 0) next.unshift(next.splice(lead, 1)[0]);
  if (next.length) r.party = next;
  bump();
  return r.party.map((m) => m.id);
}

const countSpecies = (sp) => Party.all().filter((m) => m && (m.species || m.id) === sp).length;

function bump() { guard('refresh', () => Companions && Companions.refresh && Companions.refresh()); }

const brief = (m, where) => ({ id: m.id, name: m.name, kind: m.kind, species: m.species || null, lvl: m.lvl,
  hp: m.hp ?? null, mp: m.mp ?? null, where, fixed: !canRemove(m.id) });

function describe() {
  const r = R();
  return {
    party: r.party.map((m) => brief(m, 'party')),
    wagon: r.wagon.map((m) => brief(m, 'wagon')),
    paddock: r.paddock.map((m) => brief(m, 'paddock')),
    max: { party: MAX_PARTY, wagon: MAX_WAGON, paddock: MAX_PADDOCK },
    friends: r.party.concat(r.wagon, r.paddock).filter((m) => m.kind === 'monster').map((m) => m.name),
    lastMove: L.lastMove,
    // the roster window, so a critic can read what it told the child instead of guessing from a buzzer
    roster: { open: wagonOpen, said: L.lastSay || null },
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the wagon window — "who walks, who rides?"  (you get it by talking to the wagon, DQV's way)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Max HP / MP from the growth curves (gear is a rounding error on a monster, and this must never throw). */
function maxOf(m) {
  const s = guard('stats', () => statsFor(m)) || {};
  return { hp: s.hp ?? m.hp ?? 1, mp: s.mp ?? m.mp ?? 0 };
}
/**
 * The right-hand column. You are choosing WHO FIGHTS, so a row that shows only a name and a level is not
 * enough to choose with (P18 gap #2): every row carries HP and, if it has any, MP.
 */
function statLine(m) {
  const mx = maxOf(m);
  const hp = m.hp == null ? '' : `HP ${m.hp}/${mx.hp}`;
  const mp = mx.mp > 0 ? `  MP ${m.mp ?? 0}/${mx.mp}` : '';
  return `Lv ${m.lvl ?? 1}   ${hp}${mp}`;
}

function rowsFor(pickId = null) {
  const r = R();
  const items = [{ header: 'WALKING WITH YOU' }];
  const row = (m) => ({ id: m.id, label: (m.id === pickId ? '▸ ' : '') + m.name, right: statLine(m),
    color: m.id === pickId ? 'gold' : undefined,
    note: isLeader(m) ? 'leads the way' : (isGuest(m) ? 'his own way' : null) });
  r.party.forEach((m) => items.push(row(m)));
  if (r.wagon.length) {
    items.push({ header: 'IN THE WAGON' });
    r.wagon.forEach((m) => items.push(row(m)));
  }
  if (r.paddock.length) {
    items.push({ header: 'WAITING IN THE PADDOCK' });
    r.paddock.forEach((m) => items.push(row(m)));
  }
  return items;
}

let wagonOpen = false;
/**
 * The roster window: pick somebody, pick somebody else, and they trade places.
 *
 * P18 gap #2 — three rules a six-year-old needs and this window used to break:
 *   1. ONE window for the whole visit. It is built once and refreshed with setItems, so the cursor stays where
 *      the child left it instead of snapping back to row one on every press.
 *   2. NOTHING refuses in silence. Every "no" has a sentence in a box under the list — "Bram leads the way,
 *      he stays." — because party.js already knows why and used to throw the reason away.
 *   3. It STAYS OPEN after a swap, so three monsters can be rearranged in one visit; cancel is the only exit.
 */
async function wagonMenu({ title = 'Who walks, who rides?' } = {}) {
  if (wagonOpen) return { ok: false, reason: 'already open' };
  wagonOpen = true;
  let menu = null, note = null;
  const swaps = [];
  try {
    const HINT = 'Z picks two to trade places · X closes';
    note = UI.window({ id: 'party-wagon-note', centerX: true, bottom: 74, width: 560, slim: true,
      destroyOnClose: true, content: HINT });
    const says = (text) => { L.lastSay = text; guard('note', () => note && !note.destroyed && note.setContent(text)); };
    await note.open();

    menu = UI.menu({ id: 'party-wagon', centerX: true, centerY: true, columns: 1, maxRows: 11,
      items: rowsFor(), title, minWidth: 560, destroyOnClose: true, closeOnSelect: false, cancelValue: null });

    let pick = null, at = null;
    for (;;) {
      const it = await menu.choose(at != null ? { initial: at } : {});
      if (!it) {
        if (pick) { pick = null; menu.setTitle(title); menu.setItems(rowsFor(), at); says(HINT); continue; }
        break;
      }
      at = it.id;
      const who = find(it.id);
      if (!who) continue;

      if (!pick) {
        if (whereIs(who.id) === 'party' && !canRemove(who.id)) {
          guard('sfx', () => Sfx.play('buzzer'));
          says(isLeader(who) ? `${who.name} leads the way — he stays.` : `${who.name} travels with you his own way.`);
          continue;
        }
        pick = who;
        menu.setTitle(`Who takes ${who.name}'s place?`);
        menu.setItems(rowsFor(who.id), at);
        says(`${who.name} is ready to move. Pick who trades places.`);
        continue;
      }

      const first = pick;
      pick = null;
      menu.setTitle(title);
      if (first.id === who.id) { menu.setItems(rowsFor(), at); says(`${who.name} stays where ${who.name} is.`); continue; }
      const res = swap(first.id, who.id);
      guard('sfx', () => Sfx.play(res.ok ? 'confirm' : 'buzzer'));
      menu.setItems(rowsFor(), at);
      if (!res.ok) { says(res.reason || 'That cannot be done.'); continue; }
      swaps.push([first.id, who.id]);
      const wa = whereIs(first.id), wb = whereIs(who.id);
      const place = (w) => (w === 'party' ? 'walks with you' : w === 'wagon' ? 'rides in the wagon' : 'waits in the paddock');
      says(`${first.name} now ${place(wa)}, ${who.name} now ${place(wb)}.`);
    }
    return { ok: true, done: true, swaps, roster: describe() };
  } catch (e) {
    reportError('party wagonMenu', e);
    return { ok: false, error: String(e && e.message || e) };
  } finally {
    wagonOpen = false;
    guard('close menu', () => { if (menu && !menu.destroyed) { menu.close(); menu.destroy(); } });
    guard('close note', () => { if (note && !note.destroyed) { note.close(); note.destroy(); } });
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// public
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const Party = {
  MAX_PARTY, MAX_WAGON, MAX_PADDOCK,
  roster: R,
  members: () => R().party.slice(),
  wagonList: () => R().wagon.slice(),
  paddock: () => R().paddock.slice(),
  all: () => { const r = R(); return r.party.concat(r.wagon, r.paddock); },
  friends: () => Party.all().filter((m) => m && m.kind === 'monster'),
  find, whereIs, add, move, swap, reorder, rehome, canRemove, countSpecies, describe, wagonMenu,
  isGuest, isLeader,

  install(ctx = {}) {
    if (L.installed) return Party;
    L.installed = true;
    L.ctx = ctx;
    const D = ctx.Debug || Debug;
    R();

    // the field side of it: followers trailing you, the wagon rattling behind, the paddock at home
    guard('companions install', () => Companions.install(ctx, { Party }));
    // the battle side of it: the join moment and the naming window
    guard('recruit install', () => Recruit.install(ctx, { Party, Companions }));

    // SAVE — the paddock (and the order the party stands in) are ours; the rest saves under P14's 'party' key.
    if (ctx.Save && typeof ctx.Save.register === 'function') {
      ctx.Save.register('friends', {
        save: () => ({ paddock: R().paddock, order: R().party.map((m) => m.id) }),
        load: (v) => {
          if (!v) return;
          const r = R();
          if (Array.isArray(v.paddock)) r.paddock = v.paddock.slice();
          if (Array.isArray(v.order)) reorder(v.order);
          rehome();
          bump();
        },
        summary: () => ({ friends: Party.friends().length, paddock: R().paddock.length }),
        reset: () => { R().paddock = []; },
      });
    }

    // NB: 'roster' is already P14's state key (src/battle/scene.js publishes Roster.describe() there).
    // Ours is the same party seen through P18's rules, plus the paddock, so it gets its own key.
    D.provide('friends', () => guard('describe', () => describe()) || null);
    D.expose('friends', () => describe());
    D.expose('partySwap', (a, b) => swap(a, b));
    D.expose('partyMove', (id, where) => move(id, where));
    D.expose('partyOrder', (ids) => reorder(ids));
    /** __DQ.wagonMenu() — the roster window, from anywhere (the same one the wagon opens). */
    D.expose('wagonMenu', (o) => wagonMenu(o || {}));
    return Party;
  },
};

export function install(ctx) { return Party.install(ctx); }
export default Party;
