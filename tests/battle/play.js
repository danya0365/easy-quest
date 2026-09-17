// tests/battle/play.js — P14/P19 shared "a child plays it" helpers (not a test file).
// Used by tests/battle/journey.mjs (whole playthroughs, carried), tests/battle/bosses.mjs (the boss bench) and the tests.
//
//   fight(rng, members, enemies, opts, policy, flee)  one battle the way a kind of child commands it
//   fieldRest(members, bag)                           Mend / Rouse / Herbs on the road between fights
//   walkArea(area, L, rng, opts)                      an area's walk-through at a fixed level: the state a child
//                                                     arrives at the boss door in (HP rested, MP spent, herbs used)
//   hpShare(members)                                  the child's own party HP ÷ max HP (mentor guests excluded)

import { createBattle } from '../../src/battle/battle.js';
import { chooseAllyAction } from '../../src/battle/ai.js';
import DATA from './data.js';
import { AREAS, rollEncounter } from './areas.js';

export const MAX_ROUNDS = 80;
export const STORY = AREAS.filter((a) => !a.stress);
export const HEAL_KINDS = ['heal', 'healAll', 'fullheal', 'revive'];

/**
 * One round of commands the way this child gives them.
 *   'auto'   the "Fight!" button (SYSTEMS §7.3)          'smart'  a careful twelve-year-old
 *   'mash'   Attack, Attack, Attack                      'noheal' Fight! but never a heal or an item
 */
export function commandRound(b, policy, flee) {
  const B = b._internal;
  let guard = 0, n;
  while ((n = b.needsCommand()) && guard++ < 8) {
    const a = B.party.find((c) => c.id === n.id);
    let cmd;
    if (flee) cmd = { type: 'flee' };
    else if (policy === 'noheal') {
      cmd = chooseAllyAction(B, a, 'auto');
      const s = cmd.type === 'spell' && DATA.spells[cmd.id];
      if ((s && HEAL_KINDS.includes(s.kind)) || cmd.type === 'item') cmd = { type: 'attack' };
    } else cmd = chooseAllyAction(B, a, policy);
    let r = b.command(a.id, cmd);
    if (!r.ok) r = b.command(a.id, { type: 'attack' });
    if (!r.ok) b.command(a.id, { type: 'defend' });
  }
  return b.resolveRound();
}

const isMentor = (c) => !!(c.guest && c.member && c.member.mentor);

/** Play one battle to the end. Returns {b, res, taken (share of max HP lost), low (lowest HP share), left}. */
export function fight(rng, members, enemies, opts, policy, flee = false) {
  const b = createBattle({ party: members.slice(0, 4), wagon: members.slice(4), enemies, data: DATA, rng, options: opts });
  const B = b._internal;
  // the child's own side: everyone but a mentor guest (Halvard) — Willow and Sera as children count, they are friends
  const heroSide = () => B.party.filter((c) => !isMentor(c));
  const maxOf = (list) => list.reduce((s, c) => s + c.maxHp, 0);
  const startMax = maxOf(heroSide()) || 1;
  const startHp = heroSide().reduce((s, c) => s + c.hp, 0);
  let low = startHp / startMax, r = 0;
  while (!b.over && r++ < MAX_ROUNDS) {
    commandRound(b, policy, flee && !B.isBoss);
    const hs = heroSide();
    low = Math.min(low, hs.reduce((s, c) => s + Math.max(0, c.hp), 0) / Math.max(1, maxOf(hs)));
  }
  if (b.errors.length) throw new Error('engine errors: ' + b.errors.join(' | '));
  // damage the child's own party took (guests such as Halvard excluded), as a share of their max HP
  let taken = 0;
  const ids = new Set(members.filter((m) => !m.mentor).map((m) => m.id));
  for (const e of b.log) if (e.t === 'damage' && e.side === 'party' && !e.miss && ids.has(e.target)) taken += e.dealt ?? e.amount;
  const hs = heroSide();
  const left = hs.reduce((s, c) => s + Math.max(0, c.hp), 0) / Math.max(1, maxOf(hs));
  return { b, res: b.result, taken: taken / startMax, low, left, startMax };
}

/** Between fights: Rouse the fallen, Mend/Mendmore anyone under 70%, a Herb for anyone still under 45%. */
export function fieldRest(members, bag) {
  const b = createBattle({ party: members.slice(0, 4), wagon: members.slice(4), enemies: ['gloop'], data: DATA, rng: 1, options: { ambush: 'none' } });
  const all = b._internal.party.concat(b._internal.wagon);
  const S = DATA.spells;
  for (const c of all) if (c.hp <= 0) {
    const who = all.find((x) => x.hp > 0 && x.spells.includes('rouse') && x.mp >= S.rouse.mp);
    if (who) { who.mp -= S.rouse.mp; c.hp = Math.ceil(c.maxHp / 2); }
  }
  for (let g = 0; g < 80; g++) {
    const hurt = all.filter((c) => c.hp > 0 && c.hp / c.maxHp < 0.7).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
    if (!hurt) break;
    let done = false;
    for (const id of ['mendmore', 'mend']) {
      const sp = S[id];
      if (!sp) continue;
      const who = all.filter((x) => x.hp > 0 && !x.guest && x.spells.includes(id) && x.mp >= sp.mp).sort((x, y) => y.mp - x.mp)[0];
      if (!who) continue;
      who.mp -= sp.mp; hurt.hp = Math.min(hurt.maxHp, hurt.hp + Math.round(sp.base + who.mag * sp.k)); done = true; break;
    }
    if (done) continue;
    if (hurt.hp / hurt.maxHp < 0.45) {
      const herb = ['herb', 'strong_herb', 'fresh_herb'].find((h) => bag[h] > 0);
      if (herb) { bag[herb]--; hurt.hp = Math.min(hurt.maxHp, hurt.hp + DATA.items[herb].battle.amount); continue; }
    }
    break;
  }
  return all.map((c) => ({ ...c.member, hp: c.hp, mp: c.mp, lvl: c.lvl, exp: c.exp }));
}

/** The party at a boss door: the boss spec's measured party (areas.js boss.party) if it has one, else the area's. */
export const partyAt = (area, spec, L) => (spec && spec.party ? spec.party(L) : area.party(L));

/** Fights in an area's walk for one pass of the journey (the SYSTEMS §5 leg's battles shared between its areas). */
export function walkLength(area) {
  const legShare = STORY.filter((x) => x.leg === area.leg).length || 1;
  return Math.max(3, Math.round(area.walk / legShare));
}

/**
 * Walk an area at a FIXED level (levels are put back after every fight) the way the design child does — Fight!,
 * resting on the road — and return the party as it reaches the boss door. A wipe on the way wakes you at the church
 * and you walk it again (at most three times). `fresh: true` skips the walk (the child who ran from everything).
 * `spec`: the boss at the end of it, whose measured party (areas.js boss.party) walks it.
 */
export function walkArea(area, L, rng, { policy = 'auto', rest = true, S = 0, fresh = false, spec = null } = {}) {
  const base = partyAt(area, spec, L);
  let bag = { ...(area.bag || {}) };
  if (fresh) return { members: base, bag, wiped: 0 };
  const n = walkLength(area);
  let wiped = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    let members = base.map((m) => ({ ...m }));
    bag = { ...(area.bag || {}) };
    let ok = true;
    for (let k = 0; k < n; k++) {
      const { res } = fight(rng, members, rollEncounter(area, rng, DATA.monsters),
        { bag, gold: 100, assist: { s: S }, areaLevel: area.areaLevel, wagonReachable: area.wagonReachable ?? true, recruit: null }, policy);
      if (!res || res.outcome === 'defeat') { ok = false; break; }
      bag = { ...res.bag };
      const byId = Object.fromEntries(res.party.concat(res.wagon).map((m) => [m.id, m]));
      // keep the level fixed: carry only HP, MP and status
      members = base.map((m) => (byId[m.id] ? { ...m, hp: byId[m.id].hp, mp: byId[m.id].mp, status: byId[m.id].status } : m));
      if (rest) members = fieldRest(members, bag).map((m, i) => ({ ...base[i], hp: m.hp, mp: m.mp }));
    }
    if (ok) return { members, bag, wiped };
    wiped++;
  }
  return { members: base, bag: { ...(area.bag || {}) }, wiped };
}

/** The child's own party HP share (mentor guests excluded). members are §5 shapes. */
export function hpShare(members) {
  const b = createBattle({ party: members.slice(0, 4), wagon: members.slice(4), enemies: ['gloop'], data: DATA, rng: 1, options: { ambush: 'none' } });
  const own = b._internal.party.filter((c) => !isMentor(c));
  return own.reduce((s, c) => s + c.hp, 0) / Math.max(1, own.reduce((s, c) => s + c.maxHp, 0));
}

export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
