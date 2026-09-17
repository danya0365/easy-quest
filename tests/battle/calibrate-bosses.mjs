#!/usr/bin/env node
// tests/battle/calibrate-bosses.mjs — balance pass r3: tune every boss so it lasts, hurts, and cares what level you are.
// Writes tests/battle/balance-bosses.js (applied last, on top of balance.js BOSSES). The end-to-end check is
// tests/battle/journey.mjs; the quick look is tests/battle/bosses.mjs.
//
//   node tests/battle/calibrate-bosses.mjs [--only hoarfax,mortmain] [--n 60] [--iters 7] [--dry]
//
// For each boss, at the level a non-grinding child really reaches it (areas.js boss.level, journey-measured), with the
// party that child has, arriving the way they arrive (the area walked, resting on the road: HP rested, MP spent):
//   design child (Fight!)        wins first try >= 90%, in ~7-9 rounds, leaving the party at ~40% HP
//   four levels under            straight to the door with full HP and MP (the child who ran from everything):
//                                wins first try at most 40% — levels matter
//   four levels over             wins, easily
//   Attack only, three wipes in  wins within three tries >= 92% (S from 36, the rubber band engaged)
// Knobs: actions a round (1 or 2), HP (rounds), damage (the blow's margin over the party's guard, and magic), and
// optionally a guard high enough that a few levels of Might show in every swing (DEF "lever").
// Everything a boss says, telegraphs and does stays as authored: only its numbers move.

import fs from 'node:fs';
import { createBattle } from '../../src/battle/battle.js';
import { round } from '../../src/battle/formulas.js';
import DATA from './data.js';
import { cell, retry, bossSpecs } from './bosses.mjs';
import { partyAt } from './play.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const N = Number(arg('n', 60));
const ITERS = Number(arg('iters', 8));
const ONLY = arg('only', null);
const DRY = argv.includes('--dry');
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * Per-boss targets: [rounds, HP left]. The first boss is gentler and shorter; the finale longer.
 * r4 (Tactics): the last two fights are the only ones with Queen Elowen in the party, and with Tactics on she heals on
 * her own turn every turn, so they simply do not end at 40% HP — pushed there they become coin flips instead of fights
 * (the damage that outruns her healing kills outright). They are aimed at "eight rounds, somebody knocked out, the
 * party standing at about half" instead; tests/battle/journey.mjs judges them on their own band.
 */
const TARGET = {
  mumbleroot: [7, 0.44], bogwallop: [7.5, 0.41], sexton_sootbell: [8, 0.41], tidewarden: [8, 0.40], hoarfax: [7.5, 0.45],
  iron_governess: [8.5, 0.40], 'hush+hark': [8.5, 0.40], mortmain: [8.5, 0.55], malgrim_cocoon: [7.5, 0.55],
};
const UNDER_MAX = 0.40;     // four levels under, fresh: first-try win at most this…
// …and lower where the design child reaches the door with its healer's magic spent on the road (Act II: Bram does all
// the Mending), which leaves a child who ran from everything, full of magic, too close to it
const UNDER_MAX_BY = { tidewarden: 0.25, sexton_sootbell: 0.25, bogwallop: 0.25, iron_governess: 0.30 };
// Malgrim acts twice: "Nothing At All" is followed at once by "Listen", the moment it gives you (a one-action Malgrim
// leaves the party on one hit point through everybody's turn, and the fight stops caring what level you are)
const ACTIONS_BY = { malgrim_cocoon: [2] };
const DESIGN_MIN = 0.90;    // the design child's first-try win…
// …except the finale, where Queen Elowen heals so well that a fight which leaves the party near 40% also floors it
// now and then: a second try at the last two bosses is fine (the helper, the rubber band and the Retreat Bell are there)
const DESIGN_MIN_BY = { mortmain: 0.88, malgrim_cocoon: 0.88 };
// no high guard for these: their weak spot is magic (Hoarfax's fire, the finale's healers keeping the casters casting),
// so a guard that shrugs off swords leaves the child who only presses Attack far behind the one whose Fight! casts
const NO_LEVER = new Set(['hoarfax', 'mortmain', 'malgrim_cocoon']);
const MASH_MIN = 0.92;      // Attack only, S from 36: won within three tries

const chain = (id) => { const out = []; let m = DATA.monsters[id]; while (m && !out.includes(m.id)) { out.push(m.id); m = m.transformsInto && DATA.monsters[m.transformsInto]; } return out; };

function partyGuard(area, spec, L) {
  const b = createBattle({ party: partyAt(area, spec, L).slice(0, 4), enemies: ['gloop'], data: DATA, rng: 1, options: { ambush: 'none' } });
  const own = b.snapshot().party.filter((p) => p.kind !== 'guest' || p.name !== 'Halvard');
  const hitters = own.map((p) => p.atk).sort((x, y) => y - x).slice(0, 3);
  return { halfDef: own.reduce((s, p) => s + p.def, 0) / own.length / 2, atk: hitters.reduce((s, x) => s + x, 0) / hitters.length };
}

function snapshotBase(ids) {
  return Object.fromEntries(ids.map((id) => {
    const m = DATA.monsters[id];
    return [id, JSON.parse(JSON.stringify({ hp: m.hp, atk: m.atk, def: m.def, mdef: m.mdef ?? Math.round(m.lvl * 1.2),
      wis: m.wis ?? Math.round(5 + m.lvl * 2.5), actions: m.actions || 1, moves: m.moves, phases: m.phases || null }))];
  }));
}

/** Apply {a, h, k, def, mdef} on top of the base block (restores the base first). */
function apply(ids, base, guard, { a, h, k, def, mdef }) {
  const D = guard.halfDef;
  const scaleAtk = (atk) => Math.max(Math.round(D * 0.6), round(D + (atk - D) * k));
  for (const id of ids) {
    const m = DATA.monsters[id], b = base[id];
    m.hp = Math.max(50, round(b.hp * h));
    m.atk = scaleAtk(b.atk);
    m.wis = Math.max(1, round(b.wis * k));
    m.def = def ?? b.def;
    m.mdef = mdef ?? b.mdef;
    m.actions = a;
    m.moves = JSON.parse(JSON.stringify(b.moves));
    for (const mv of m.moves) if (typeof mv === 'object' && mv.kind === 'magic' && typeof mv.base === 'number') mv.base = Math.max(1, round(mv.base * k));
    m.phases = b.phases ? JSON.parse(JSON.stringify(b.phases)) : undefined;
    for (const ph of m.phases || []) {
      if (ph.set && typeof ph.set.atk === 'number') ph.set.atk = scaleAtk(ph.set.atk);
      if (ph.set && ph.set.actions != null && a >= 2) delete ph.set.actions;
    }
    if (!m.phases) delete m.phases;
  }
}

/** Two independent samples averaged: one seed's luck otherwise decides a boss (Malgrim's HP left moves ±6 by seed). */
function cell2(area, spec, L, opts, seeds) {
  const a = cell(area, spec, L, { ...opts, seed: seeds[0] }), b = cell(area, spec, L, { ...opts, seed: seeds[1] });
  const avg = (k) => (Number.isFinite(a[k]) && Number.isFinite(b[k]) ? (a[k] + b[k]) / 2 : Number.isFinite(a[k]) ? a[k] : b[k]);
  return { win: (a.win + b.win) / 2, rounds: avg('rounds'), left: avg('left'), low: avg('low') };
}

function evaluate(area, spec, full = true) {
  const L = spec.level;
  const w0 = full ? cell2(area, spec, L, { n: N }, [101, 505]) : cell(area, spec, L, { n: N, seed: 101 });
  if (!full) return { w0 };
  const f4 = cell2(area, spec, L - 4, { n: N, fresh: true }, [202, 606]);
  const p4 = cell(area, spec, L + 4, { n: Math.ceil(N / 2), seed: 303 });
  const rm = retry(area, spec, 'mash', { n: N, seed: 404 });
  return { w0, f4, p4, rm };
}

function score(ev, [tR, tL], designMin = DESIGN_MIN, underMax = UNDER_MAX) {
  const { w0, f4, p4, rm } = ev;
  let s = 0;
  s += Math.abs(Math.log((w0.rounds || 20) / tR)) * 2;
  s += Math.abs((Number.isFinite(w0.left) ? w0.left : 0) - tL) * 6;
  s += Math.max(0, designMin - w0.win) * 12;
  if (f4) s += Math.max(0, f4.win - underMax) * 8;
  if (p4) s += Math.max(0, 0.97 - p4.win) * 8;
  if (rm) s += Math.max(0, MASH_MIN - rm.within3) * 12;
  return s;
}

const out = {};
const log = [];
for (const { id, area, spec, scripted } of bossSpecs()) {
  if (scripted) continue;
  if (ONLY && !ONLY.split(',').some((o) => id.includes(o))) continue;
  const ids = spec.enemies.flatMap(chain);
  const base = snapshotBase(ids);
  const guard = partyGuard(area, spec, spec.level);
  const target = TARGET[id] || [8, 0.42];
  const lever = Math.round(guard.atk * 0.9);    // a guard where the hitters' swings do ~55% of their ATK: every level of Might shows
  const tries = [];
  const candidates = [];
  // mdef 100: spells do 50% (SYSTEMS §1.6 caps the cut at 60%) — the fight leans on Might, which levels bring, and the
  // child who only presses Attack is not left so far behind the one whose Fight! button casts
  for (const a of ACTIONS_BY[id] || [1, 2]) for (const def of NO_LEVER.has(id) ? [null] : [null, lever]) for (const mdef of [null, 100]) candidates.push({ a, def, mdef });
  for (const c of candidates) {
    const baseActions = Math.max(...ids.map((x) => base[x].actions));
    let h = 1, k = c.a > baseActions ? 0.62 : c.a < baseActions ? 1.5 : 1;
    if (c.def != null) { const d0 = Math.max(...ids.map((x) => base[x].def)); h *= clampN(1 - (c.def - d0) / (2 * guard.atk), 0.5, 1); }
    let [tR, tL] = target;
    let best = null;
    for (let it = 0; it < ITERS; it++) {
      apply(ids, base, guard, { a: c.a, h, k, def: c.def, mdef: c.mdef });
      const full = it >= ITERS - 4;
      const ev = evaluate(area, spec, full);
      const sc = score(ev, target, DESIGN_MIN_BY[id] ?? DESIGN_MIN, UNDER_MAX_BY[id] ?? UNDER_MAX);
      if (full && (!best || sc < best.sc)) best = { sc, h, k, ev };
      const { w0 } = ev;
      if (full) {
        // an Attack-only child is short of tries: a shorter, harder-hitting fight (their odds ride on HP x damage,
        // the healer's on how long it lasts). Too kind four levels under: a little leaner at the design level.
        if (ev.rm.within3 < MASH_MIN) tR = Math.max(6.5, tR * 0.92);
        if (ev.f4.win > (UNDER_MAX_BY[id] ?? UNDER_MAX)) tL = Math.max(0.36, tL - 0.02);
      }
      const rounds = Number.isFinite(w0.rounds) ? w0.rounds : tR * 1.6;
      h *= clampN((tR / rounds) ** 0.9, 0.75, 1.3);
      // HP left over wins, but a lost fight counts as nothing left: aim the mean end state, not just the survivors
      const left = (Number.isFinite(w0.left) ? w0.left : 0) * w0.win;
      const want = tL * 0.95;
      const loss = Math.max(0.05, 1 - left), wantLoss = 1 - want;
      k *= clampN((wantLoss / loss) ** 0.9, 0.8, 1.22);
      if (w0.win < (DESIGN_MIN_BY[id] ?? DESIGN_MIN) - 0.05) k *= 0.9;
    }
    tries.push({ ...c, ...best });
    const e = best.ev;
    log.push(`  ${id} a${c.a} def ${c.def ?? 'keep'} mdef ${c.mdef ?? 'keep'}: h ${best.h.toFixed(2)} k ${best.k.toFixed(2)} | design ${(100 * e.w0.win).toFixed(0)}% ${e.w0.rounds.toFixed(1)}r left ${(100 * e.w0.left).toFixed(0)}% | -4 fresh ${(100 * e.f4.win).toFixed(0)}% | +4 ${(100 * e.p4.win).toFixed(0)}% | mash<=3 ${(100 * e.rm.within3).toFixed(0)}% | score ${best.sc.toFixed(2)}`);
    console.log(log[log.length - 1]);
  }
  const pick = tries.sort((x, y) => x.sc - y.sc)[0];
  apply(ids, base, guard, { a: pick.a, h: pick.h, k: pick.k, def: pick.def, mdef: pick.mdef });
  for (const x of ids) {
    const m = DATA.monsters[x];
    const magic = Object.fromEntries(m.moves.filter((mv) => typeof mv === 'object' && mv.kind === 'magic').map((mv) => [mv.id, { base: mv.base }]));
    out[x] = { hp: m.hp, atk: m.atk, def: m.def, mdef: m.mdef, wis: m.wis, actions: m.actions, ...(Object.keys(magic).length ? { moves: magic } : {}),
      ...(m.phases ? { phases: m.phases } : {}) };
  }
  console.log(`→ ${id}: actions ${pick.a}, def ${pick.def ?? 'kept'}, mdef ${pick.mdef ?? 'kept'}, hp x${pick.h.toFixed(2)}, damage x${pick.k.toFixed(2)} (score ${pick.sc.toFixed(2)})`);
}

if (!DRY && Object.keys(out).length) {
  const path = new URL('./balance-bosses.js', import.meta.url);
  let prev = {};
  try { prev = (await import(path.href)).BOSS_CAL || {}; } catch { /* first run */ }
  const merged = { ...prev, ...out };
  const body = Object.entries(merged).map(([id, v]) => `  ${id}: ${JSON.stringify(v)},`).join('\n');
  fs.writeFileSync(path, `// tests/battle/balance-bosses.js — GENERATED by tests/battle/calibrate-bosses.mjs (balance pass r3). Do not hand-edit:\n// change BOSSES in balance.js or the targets in calibrate-bosses.mjs and run it again, then tests/battle/journey.mjs.\n// Applied last (after balance.js BOSSES): every boss's actions a round, HP, blow, guard, Wisdom and magic bases.\nexport const BOSS_CAL = {\n${body}\n};\n`);
  console.log('wrote', path.pathname);
}
