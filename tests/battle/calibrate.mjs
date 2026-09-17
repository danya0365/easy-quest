#!/usr/bin/env node
// tests/battle/calibrate.mjs — balance pass r2: calibrate every wild species at its home, then write
// tests/battle/balance-wild.js. The end-to-end check is tests/battle/journey.mjs, not this.
//
//   node tests/battle/calibrate.mjs [--iters 8] [--n 400] [--seed 5] [--only gloop,crabbit] [--dry]
//
// For each species: its home area (where the bible's "Where" line puts it) and that area's tuned party level.
// Fight groups of it (its own group size, else the area's) with the party a child has there, pressing "Fight!",
// and nudge the block until
//   rounds ≈ 2.0 … 3.1 by danger     a normal fight lasts two to three rounds (a Gloop two, a Chestnut three)
//   cost   ≈ 11% × danger           and costs about a tenth of the party's HP (Halvard excluded)
// HP moves the rounds; ATK above the party's guard (and Wisdom, for casters) moves the cost. DEF is capped so a
// swing never turns into the 1–3 chip floor. EXP: EXP-to-next ÷ fights-per-level ÷ group size. Gold: SYSTEMS §5.
// `danger` keeps each monster's personality from the bible (a Gloop is 0.6, a Chestnut 1.6).

import fs from 'node:fs';
import { createBattle } from '../../src/battle/battle.js';
import { makeRng, REF, round } from '../../src/battle/formulas.js';
import { EXP_TABLE } from '../../src/data/growth.js';
import { chooseAllyAction } from '../../src/battle/ai.js';
import DATA from './data.js';
import { AREA_BY_ID } from './areas.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ITERS = Number(arg('iters', 8));
const N = Number(arg('n', 400));
const ONLY = arg('only', null);
const DRY = argv.includes('--dry');
const rng = makeRng(Number(arg('seed', 5)));

/** species: [home area, danger] */
export const HOME = {
  gloop: ['long_lane', 0.6], peckish: ['long_lane', 0.6], bloop: ['long_lane', 0.6], flapjack: ['long_lane', 0.6],
  grumpleroot: ['long_lane', 0.7], bumbleblunder: ['long_lane', 0.7],
  crabbit: ['saltmarrow_coast', 1.0], batterfly: ['whispering_wood', 1.0], toadstooligan: ['whispering_wood', 0.9],
  twiglet: ['whispering_wood', 0.9], hoot_couture: ['whispering_wood', 1.0], sir_gloopalot: ['whispering_wood', 1.3],
  boohoo: ['cobwell_manor', 0.9], chestnut: ['cobwell_manor', 1.6], quietling: ['coddleston_downs', 0.8],
  barrowmole: ['whistling_caves', 1.0], candelabracadabra: ['whistling_caves', 1.1], clankworthy: ['whistling_caves', 1.3],
  jinglebottom: ['whistling_caves', 1.1], cactuddle: ['frittering_sands', 1.0], dune_buggy: ['frittering_sands', 0.9],
  grumbleglop: ['sogglemarsh', 1.0], boulderdash: ['marbleford_downs', 1.3], squidgeon: ['sighing_grotto', 1.1],
  gloopold: ['glasswing_grotto', 1.4], lady_mothbonnet: ['grey_ruins', 1.1], grimalkitten: ['grey_ruins', 1.1],
  sir_cumference: ['grey_ruins', 1.3], thunderpuff: ['highfeather', 1.1], mirthquake: ['highfeather', 1.3],
  hexcalibur: ['whistfell_abbey', 1.3], vesperling: ['whistfell_abbey', 1.2], wyrmsley: ['whistfell_abbey', 1.2],
};
const FIGHTS_PER_LEVEL = (L) => (L <= 3 ? 3 : L <= 7 ? 4 : L <= 13 ? 5 : 6);
const toNext = (L) => EXP_TABLE[Math.min(29, L) + 1] - EXP_TABLE[Math.min(29, L)];
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));

function measure(id, area) {
  const L = area.areaLevel;
  const m = DATA.monsters[id];
  const g = m.group || area.group || [1, 3];
  const rounds = [], cost = [];
  let wins = 0, guardSum = 0, atkSum = 0, hpSum = 0, members = 0;
  for (let i = 0; i < N; i++) {
    const n = rng.int(g[0], g[1]);
    const b = createBattle({ party: area.party(L), enemies: Array.from({ length: n }, () => ({ id, partyLevel: L })), data: DATA, rng,
      options: { bag: { ...(area.bag || {}) }, gold: 100, ambush: 'none', areaLevel: L, wagonReachable: area.wagonReachable ?? true } });
    const B = b._internal;
    const own = B.party.filter((c) => !(c.guest && c.member.mentor));
    if (i === 0) { for (const c of own) { guardSum += c.def; atkSum += c.atk; hpSum += c.maxHp; members++; } }
    const maxHp = own.reduce((s, c) => s + c.maxHp, 0);
    let r = 0;
    while (!b.over && r++ < 40) {
      let k = 0, need;
      while ((need = b.needsCommand()) && k++ < 8) {
        const a = B.party.find((c) => c.id === need.id);
        if (!b.command(a.id, chooseAllyAction(B, a, 'auto')).ok) b.command(a.id, { type: 'attack' });
      }
      b.resolveRound();
    }
    if (b.result && b.result.outcome === 'victory') wins++;
    rounds.push(b.round);
    let taken = 0;
    const ids = new Set(own.map((c) => c.id));
    for (const e of b.log) if (e.t === 'damage' && e.side === 'party' && !e.miss && ids.has(e.target)) taken += e.dealt;
    cost.push(taken / maxHp);
  }
  return { rounds: mean(rounds), cost: mean(cost), win: wins / N, guard: guardSum / members, partyAtk: atkSum / members, hp: hpSum / members, group: (g[0] + g[1]) / 2 };
}

const out = {};
const ids = Object.keys(HOME).filter((id) => !ONLY || ONLY.split(',').includes(id));
for (const id of ids) {
  const [areaId, danger] = HOME[id];
  const area = AREA_BY_ID[areaId];
  const m = DATA.monsters[id];
  const L = area.areaLevel;
  m.partyLevel = L;
  const tRounds = clampN(2.0 + 1.5 * (danger - 0.6), 2.0, 3.1), tCost = 0.11 * danger;
  const power = Math.max(1, ...m.moves.filter((mv) => typeof mv === 'object' && mv.kind === 'attack').map((mv) => (mv.power || 1) * (mv.target === 'random' ? 1 : (mv.hits || 1)) ** 0.5));
  const caster = m.moves.some((mv) => typeof mv === 'object' && (mv.kind === 'spell' || mv.kind === 'magic'));
  // staged and damped: HP for the rounds, then ATK (and Wisdom) for the cost, then both gently; keep the best try
  let res, best = null;
  const score = (r) => Math.abs(Math.log(r.rounds / tRounds)) + Math.abs(Math.log(Math.max(0.002, r.cost) / tCost));
  const snap = () => ({ hp: m.hp, atk: m.atk, def: m.def, wis: m.wis, mp: m.mp });
  const stages = [['hp', 1.0, 0.7, 1.4, ITERS], ['atk', 0.8, 0.7, 1.4, ITERS], ['both', 0.5, 0.85, 1.18, Math.ceil(ITERS / 2)]];
  for (const [what, ex, lo, hi, n] of stages) {
    for (let it = 0; it < n; it++) {
      res = measure(id, area);
      const sc = score(res);
      if (!best || sc < best.sc) best = { sc, v: snap(), res };
      const D = res.guard / 2;
      m.def = Math.min(m.def, Math.round(res.partyAtk * 1.2));
      if (what !== 'atk') m.hp = Math.max(3, round(m.hp * clampN((tRounds / res.rounds) ** ex, lo, hi)));
      if (what !== 'hp') {
        const f = res.cost > 0 ? clampN((tCost / res.cost) ** ex, lo, hi) : hi;
        const atkMax = D + 0.30 * res.hp / (0.6 * power); // its biggest blow never takes more than ~30% of a hero's bar
        m.atk = Math.max(1, Math.min(round(atkMax), round(D + Math.max(2, m.atk - D) * f)));
        if (caster) {
          const wis = m.wis ?? Math.round(5 + m.lvl * 2.5);
          m.wis = Math.max(1, round(wis * f));
          // a spell's flat base cannot be tuned down through Wisdom: fewer casts instead
          if (f < 1 && m.wis <= 3) m.mp = Math.max(0, Math.floor(m.mp * f));
        }
      }
    }
  }
  Object.assign(m, best.v);
  res = measure(id, area);
  m.exp = Math.max(1, round(toNext(L) / FIGHTS_PER_LEVEL(L) / res.group * danger ** 0.5));
  m.gold = Math.max(1, round(REF.gold[L - 1] / res.group * danger ** 0.5));
  out[id] = { partyLevel: L, hp: m.hp, atk: m.atk, def: m.def, ...(caster ? { wis: m.wis, mp: m.mp } : {}), exp: m.exp, gold: m.gold };
  console.log(`${id.padEnd(18)} home ${areaId} Lv${L}  hp ${String(m.hp).padStart(4)} atk ${String(m.atk).padStart(4)} def ${String(m.def).padStart(4)}${caster ? ' wis ' + m.wis : ''}  exp ${m.exp} gold ${m.gold}  | rounds ${res.rounds.toFixed(2)} (target ${tRounds.toFixed(2)}) cost ${(100 * res.cost).toFixed(1)}% (target ${(100 * tCost).toFixed(1)}%) win ${(100 * res.win).toFixed(0)}%`);
}

if (!DRY) {
  const path = new URL('./balance-wild.js', import.meta.url);
  let prev = {};
  try { prev = (await import(path.href)).WILD || {}; } catch { /* first run */ }
  const merged = { ...prev, ...out };
  const body = Object.entries(merged).map(([id, v]) => `  ${id}: ${JSON.stringify(v).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')},`).join('\n');
  fs.writeFileSync(path, `// tests/battle/balance-wild.js — GENERATED by tests/battle/calibrate.mjs (balance pass r2). Do not hand-edit:\n// change the targets or dangers in calibrate.mjs and run it again, then run tests/battle/journey.mjs.\n// partyLevel = the party level this block is tuned for (its home); encounter tables carry it elsewhere.\nexport const WILD = {\n${body}\n};\n`);
  console.log('wrote', path.pathname);
}
