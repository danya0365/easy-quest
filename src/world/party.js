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
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the wagon window — "who walks, who rides?"  (you get it by talking to the wagon, DQV's way)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const hp = (m) => (m.hp == null ? '' : `Lv ${m.lvl}`);

function rowsFor() {
  const r = R();
  const items = [{ header: 'WALKING WITH YOU' }];
  r.party.forEach((m) => items.push({ id: m.id, label: m.name, right: hp(m),
    note: isLeader(m) ? 'leads the way' : (isGuest(m) ? 'his own way' : null) }));
  if (r.wagon.length) {
    items.push({ header: 'IN THE WAGON' });
    r.wagon.forEach((m) => items.push({ id: m.id, label: m.name, right: hp(m) }));
  }
  if (r.paddock.length) {
    items.push({ header: 'WAITING IN THE PADDOCK' });
    r.paddock.forEach((m) => items.push({ id: m.id, label: m.name, right: hp(m) }));
  }
  return items;
}

let wagonOpen = false;
/** The roster window: pick somebody, pick somebody else, and they trade places. Cancel always leaves. */
async function wagonMenu({ title = 'Who walks, who rides?' } = {}) {
  if (wagonOpen) return { ok: false, reason: 'already open' };
  wagonOpen = true;
  try {
    let pick = null;
    for (;;) {
      const m = UI.menu({ id: 'party-wagon', centerX: true, centerY: true, columns: 1, maxRows: 11,
        items: rowsFor(), title: pick ? `Trade places with ${pick.name}?` : title, minWidth: 420,
        destroyOnClose: true, closeOnSelect: true, cancelValue: null });
      const it = await m.choose();
      if (!it) { if (pick) { pick = null; continue; } return { ok: true, done: true }; }
      const who = find(it.id);
      if (!who) continue;
      if (!pick) {
        if (!canRemove(who.id) && whereIs(who.id) === 'party') {
          guard('sfx', () => Sfx.play('buzzer'));
          pick = null;
          continue;
        }
        pick = who;
        continue;
      }
      const first = pick;
      const res = swap(first.id, who.id);
      guard('sfx', () => Sfx.play(res.ok ? 'confirm' : 'buzzer'));
      pick = null;
      if (res.ok) return { ok: true, swapped: [first.id, who.id], roster: describe() };
    }
  } catch (e) {
    reportError('party wagonMenu', e);
    return { ok: false, error: String(e && e.message || e) };
  } finally { wagonOpen = false; }
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
