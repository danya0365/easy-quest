#!/usr/bin/env node
// tests/battle/bosses.mjs — P14/P19 the boss bench: does every boss last, hurt, and care what level you are?
// The pass/fail check is tests/battle/journey.mjs; this is the fast tuning loop for tests/battle/balance.js BOSSES.
//
//   node tests/battle/bosses.mjs                                  # every boss, 80 fights a cell
//   node tests/battle/bosses.mjs --only hoarfax,mortmain --n 150
//   node tests/battle/bosses.mjs --patch '{"hoarfax":{"hp":1300,"def":120}}'   # try numbers without editing balance.js
//
// Cells (Fight! unless noted, S = 0, first try):
//   -4 fresh   four levels under, straight to the door (the child who ran from everything)
//   -4 / 0 / +4 walked   at that level after walking the area resting on the road (HP rested, MP spent); for a second
//              boss (Malgrim), after getting past the first one too (three tries at most, or the cell is lost)
//   mash 0     Attack only, at the design level, walked
//   retry      Attack only / Fight! from full at the design level, S from 36 (three wipes in), +12 a wipe: won within 3

import { makeRng } from '../../src/battle/formulas.js';
import DATA, { applyBalance } from './data.js';
import { STORY, fight, fieldRest, walkArea, partyAt, mean } from './play.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const N = Number(arg('n', 80));
const ONLY = arg('only', null);
const SEED = Number(arg('seed', 4242));
const PATCH = arg('patch', null);
if (PATCH) applyBalance(DATA.monsters, JSON.parse(PATCH));

/**
 * The party at the door of `spec`: the area walked at level L (or fresh), and — for a second boss (areas.js boss2:
 * Malgrim rises the moment Mortmain kneels) — the first boss beaten on the way (up to three tries, same S), then a rest
 * with what magic is left. `blocked: true` when the child never got past the first boss: that counts as a lost cell.
 */
export function arrive(area, spec, L, rng, { fresh = false, S = 0, policy = 'auto' } = {}) {
  const lead = spec === area.boss2 && area.boss ? area.boss : null;
  if (!lead) return walkArea(area, Math.max(1, L), rng, { fresh, spec });
  for (let t = 0; t < 3; t++) {
    const w = walkArea(area, Math.max(1, L), rng, { fresh, spec: lead });
    const { res } = fight(rng, w.members, lead.enemies, { bag: w.bag, gold: 500, assist: { s: S }, ambush: 'none', wagonReachable: false }, policy);
    if (res && res.outcome === 'victory') {
      const keep = Object.fromEntries(res.party.concat(res.wagon).map((m) => [m.id, m]));
      const members = partyAt(area, spec, Math.max(1, L)).map((m) => (keep[m.id] ? { ...m, hp: keep[m.id].hp, mp: keep[m.id].mp } : m));
      return { members: fieldRest(members, res.bag).map((m, i) => ({ ...members[i], hp: m.hp, mp: m.mp })), bag: res.bag };
    }
  }
  return { blocked: true };
}

export function cell(area, spec, L, { n = N, policy = 'auto', fresh = false, S = 0, seed = SEED } = {}) {
  const rng = makeRng(seed);
  let wins = 0;
  const rounds = [], left = [], low = [];
  for (let i = 0; i < n; i++) {
    const { members, bag, blocked } = arrive(area, spec, L, rng, { fresh, S, policy: policy === 'mash' ? 'mash' : 'auto' });
    if (blocked) { low.push(0); continue; }
    const { res, left: lf, low: lo } = fight(rng, members, spec.enemies,
      { bag, gold: 500, assist: { s: S }, ambush: 'none', wagonReachable: spec.wagonReachable ?? false }, policy);
    low.push(lo);
    if (res && res.outcome === 'victory') { wins++; rounds.push(res.rounds); left.push(lf); }
  }
  return { win: wins / n, rounds: mean(rounds), left: mean(left), low: mean(low) };
}

export function retry(area, spec, policy, { n = N, S0 = 36, seed = SEED } = {}) {
  const rng = makeRng(seed);
  let within3 = 0;
  const tries = [];
  for (let t = 0; t < n; t++) {
    let S = S0, k = 0, won = false;
    while (!won && k < 12) {
      k++;
      const { res } = fight(rng, partyAt(area, spec, spec.level), spec.enemies,
        { bag: { ...(area.bag || {}) }, gold: 500, assist: { s: S }, ambush: 'none', wagonReachable: spec.wagonReachable ?? false }, policy);
      if (res && res.outcome === 'victory') won = true;
      S = res ? res.assist.after : Math.min(100, S + 12);
    }
    tries.push(won ? k : 13);
    if (won && k <= 3) within3++;
  }
  return { within3: within3 / n, tries: mean(tries) };
}

export function bossSpecs() {
  const out = [];
  for (const area of STORY) for (const key of ['boss', 'boss2']) {
    const spec = area[key];
    if (!spec) continue;
    const id = spec.enemies.join('+');
    const scripted = spec.enemies.some((e) => DATA.monsters[e].scriptedEnd);
    out.push({ id, area, spec, scripted });
  }
  return out;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const pct = (x) => (Number.isFinite(x) ? String(Math.round(100 * x)).padStart(3) + '%' : '   —');
  const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1).padStart(4) : '   —');
  const show = (c) => `${pct(c.win)} ${f1(c.rounds)}r left${pct(c.left)}`;
  const t0 = Date.now();
  console.log(`boss bench — ${N} fights a cell, seed ${SEED}${PATCH ? ', patch ' + PATCH : ''}`);
  for (const { id, area, spec, scripted } of bossSpecs()) {
    if (ONLY && !ONLY.split(',').some((o) => id.includes(o))) continue;
    if (scripted) continue;
    const L = spec.level;
    const m = DATA.monsters[spec.enemies[0]];
    const f4 = cell(area, spec, L - 4, { fresh: true });
    const w4 = cell(area, spec, L - 4);
    const w2 = cell(area, spec, L - 2);
    const w0 = cell(area, spec, L);
    const p4 = cell(area, spec, L + 4);
    const m0 = cell(area, spec, L, { policy: 'mash' });
    const rm = retry(area, spec, 'mash');
    const ra = retry(area, spec, 'auto');
    console.log(`\n${id} (design Lv ${L}) hp ${m.hp} atk ${m.atk} def ${m.def} wis ${m.wis ?? '-'} mdef ${m.mdef ?? '-'} agi ${m.agi}`);
    console.log(`  -4 fresh ${show(f4)} | -4 ${show(w4)} | -2 ${show(w2)} | 0 ${show(w0)} low${pct(w0.low)} | +4 ${show(p4)}`);
    console.log(`  mash 0 ${show(m0)} | retry<=3 (S36) mash ${pct(rm.within3)} ${f1(rm.tries)} tries, Fight! ${pct(ra.within3)}`);
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
