#!/usr/bin/env node
// tests/battle/first-hour.mjs — P14/P19: the first hour on the Long Lane, the way Dragon Quest V opens.
// (critic a2r1: "Gloop has 30 HP and Bram hits for 5. Bram lands 6% of the killing blows, Halvard 73%. Fights average
// 3.4 rounds; 38% go 4+ rounds, only 3% end in 1-2.") DQV: the boy swings, the slime pops, Papa finishes the next one
// in a single blow, and the fight is over in one or two rounds.
//
//   node tests/battle/first-hour.mjs                     # the report + contract (exit 1 on FAIL)
//   node tests/battle/first-hour.mjs --n 800 --hp 0.55   # try an hpMult for the Long Lane without editing areas.js
//
// For each row: 'mash' = Bram presses Attack, Bobble fights by his Tactics (Fight Wisely), Halvard is Halvard.

import { makeRng } from '../../src/battle/formulas.js';
import DATA from './data.js';
import { AREA_BY_ID, rollEncounter } from './areas.js';
import { fight, mean } from './play.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const N = Number(arg('n', 1500));
const HP = arg('hp', null);
const TL = arg('tableLvl', null);
if (HP != null) AREA_BY_ID.long_lane.hpMult = Number(HP);
if (TL != null) AREA_BY_ID.long_lane.tableLvl = Number(TL);

/** What the first hour should feel like (Lv 1–3 on the Long Lane, Attack only; Saltmarrow Coast in COAST). */
export const FIRST_HOUR = {
  meanRounds: [1.6, 2.6],      // one or two rounds, now and then three
  short: 0.60,                 // at least 60% over in 1–2 rounds
  long: 0.12,                  // at most 12% last 4+ rounds
  bramKills: 0.33,             // the boy's swing kills things: a third of the killing blows are Bram's
  halvardKills: 0.40,          // …and Papa does not win the fight for him
  cost: [0.05, 0.20],          // a scrape, not a scare
  wipe: 0.01,
};
/** Saltmarrow Coast (Lv 4–5, still with Papa): a notch longer and harder, still the boy's fight. */
export const COAST = { meanRounds: [1.8, 2.9], short: 0.45, long: 0.25, bramKills: 0.30, halvardKills: 0.45, cost: [0.06, 0.22], wipe: 0.01 };

export function firstHour(aid, L, { n = N, policy = 'mash', seed = 99 } = {}) {
  const area = AREA_BY_ID[aid];
  const rng = makeRng(seed + L * 7);
  const hp = {}, kills = {}, rounds = [], cost = [], bramHits = [];
  let wipes = 0, free = 0;
  for (let i = 0; i < n; i++) {
    const { b, res, taken } = fight(rng, area.party(L), rollEncounter(area, rng, DATA.monsters), { bag: {}, gold: 0, areaLevel: area.areaLevel, recruit: null }, policy);
    for (const e of b._internal.enemies) (hp[e.species] ||= []).push(e.maxHp);
    const last = {};
    for (const e of b.log) {
      if (e.t === 'damage' && e.side === 'enemy' && !e.miss) { last[e.target] = e.actor; if (e.actor === 'hero') bramHits.push(e.amount); }
      if (e.t === 'defeat' && e.side === 'enemy') { const who = last[e.target] || '?'; kills[who] = (kills[who] || 0) + 1; }
    }
    if (!res) continue;
    if (res.outcome === 'defeat') { wipes++; continue; }
    rounds.push(res.rounds); cost.push(taken); if (taken === 0) free++;
  }
  const K = Object.values(kills).reduce((s, x) => s + x, 0) || 1;
  return {
    aid, L, n, bramHit: mean(bramHits), hp: Object.fromEntries(Object.entries(hp).map(([k, v]) => [k, Math.round(mean(v))])),
    kills: Object.fromEntries(Object.entries(kills).map(([k, v]) => [k, v / K])), meanRounds: mean(rounds),
    short: rounds.filter((r) => r <= 2).length / rounds.length, long: rounds.filter((r) => r >= 4).length / rounds.length,
    cost: mean(cost), free: free / Math.max(1, rounds.length), wipe: wipes / n,
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const pct = (x) => Math.round(100 * (x || 0)) + '%';
  const fails = [];
  console.log(`first hour — ${N} fights a row${HP != null ? `, long_lane hpMult ${HP}` : ''}${TL != null ? `, tableLvl ${TL}` : ''}`);
  const rows = [['long_lane', 1, FIRST_HOUR], ['long_lane', 2, FIRST_HOUR], ['long_lane', 3, FIRST_HOUR],
    ['saltmarrow_coast', 4, COAST], ['saltmarrow_coast', 5, COAST], ['whispering_wood', 5, null]];
  for (const [aid, L, C] of rows) {
    const contracted = !!C;
    for (const policy of ['mash', 'auto']) {
      const r = firstHour(aid, L, { policy });
      const flags = [];
      if (contracted && policy === 'mash') {
        if (r.meanRounds < C.meanRounds[0] || r.meanRounds > C.meanRounds[1]) flags.push('ROUNDS');
        if (r.short < C.short) flags.push('SHORT');
        if (r.long > C.long) flags.push('LONG');
        if ((r.kills.hero || 0) < C.bramKills) flags.push('BRAM-KILLS');
        if ((r.kills.halvard || 0) > C.halvardKills) flags.push('PAPA-KILLS');
        if (r.cost < C.cost[0] || r.cost > C.cost[1]) flags.push('COST');
        if (r.wipe > C.wipe) flags.push('WIPES');
        if (flags.length) fails.push(`${aid} Lv${L}: ${flags.join(' ')}`);
      }
      console.log(`${aid} Lv${L} ${policy.padEnd(4)}: Bram hits ${r.bramHit.toFixed(1)} · HP ${Object.entries(r.hp).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      console.log(`    rounds ${r.meanRounds.toFixed(2)} · 1-2 rounds ${pct(r.short)} · 4+ ${pct(r.long)} · kills ${Object.entries(r.kills).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v)}`).join(', ')} · HP cost ${pct(r.cost)} · free ${pct(r.free)} · wipes ${pct(r.wipe)}${flags.length ? '  ← ' + flags.join(' ') : ''}`);
    }
  }
  if (fails.length) console.log('\nFIRST-HOUR FAILURES:\n  ' + fails.join('\n  '));
  else console.log('\nFIRST HOUR: all pass.');
  process.exitCode = fails.length ? 1 : 0;
}
