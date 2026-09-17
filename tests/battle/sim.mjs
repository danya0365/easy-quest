#!/usr/bin/env node
// tests/battle/sim.mjs — P14/P19 balance simulator.
// Simulates thousands of fights for every area in docs/WORLD-BIBLE.md (tests/battle/areas.js) with the party a
// never-grinding child would plausibly have there, and prints the numbers the difficulty contract cares about.
//
//   node tests/battle/sim.mjs                     # all areas, default sample sizes
//   node tests/battle/sim.mjs --n 3000 --walks 300
//   node tests/battle/sim.mjs --area cobwell_manor --seed 7
//   node tests/battle/sim.mjs --json shots/P14-sim.json
//
// Policies: smart = careful player (heals early, uses items, Bolsters on a wind-up); mash = a six-year-old who
// only ever presses Attack. "walk" = the area's walk-through length in fights back to back, carrying HP/MP and
// herbs, never visiting an inn: the harshest honest test of "grinding is never required".

import fs from 'node:fs';
import { createBattle } from '../../src/battle/battle.js';
import { makeRng } from '../../src/battle/formulas.js';
import { EXP_TABLE } from '../../src/data/growth.js';
import DATA from './data.js';
import { AREAS, rollEncounter } from './areas.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const N = Number(arg('n', 1000));
const WALKS = Number(arg('walks', 200));
const SEED = Number(arg('seed', 20040));
const ONLY = arg('area', null);
const JSON_OUT = arg('json', null);
const MAX_ROUNDS = 60;

const rng = makeRng(SEED);

function runFight(party, enemies, area, policy, extra = {}) {
  const b = createBattle({
    party, enemies, data: DATA, rng,
    options: { bag: extra.bag ? { ...extra.bag } : { ...(area.bag || {}) }, gold: 100, wagonReachable: extra.wagonReachable ?? area.wagonReachable ?? true, ...extra.options },
  });
  const startMax = b.snapshot().party.reduce((s, p) => s + p.maxHp, 0);
  let r = 0;
  while (!b.over && r++ < MAX_ROUNDS) b.autoRound(policy);
  const res = b.result || { outcome: 'timeout', rounds: r, exp: 0, gold: 0, stats: b._internal.stats, party: [], wagon: [], bag: {} };
  if (b.errors.length) throw new Error('engine errors: ' + b.errors.join(' | '));
  return { res, startMax, b };
}

const pct = (x) => (100 * x).toFixed(x < 0.1 && x > 0 ? 1 : 0) + '%';
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function normalStats(area, L, policy, n) {
  const out = { wins: 0, wipes: 0, timeouts: 0, rounds: [], dmgPct: [], ko: 0, maxHit: 0, capped: 0, exp: [], gold: [], enemyCrits: 0 };
  for (let i = 0; i < n; i++) {
    const enemies = rollEncounter(area, rng, DATA.monsters);
    const { res, startMax } = runFight(area.party(L), enemies, area, policy, { options: { ambush: undefined } });
    if (res.outcome === 'victory') out.wins++;
    else if (res.outcome === 'defeat') out.wipes++;
    else if (res.outcome === 'timeout') out.timeouts++;
    out.rounds.push(res.rounds);
    out.dmgPct.push(res.stats.damageTaken / startMax);
    if (res.stats.koCount > 0) out.ko++;
    out.maxHit = Math.max(out.maxHit, res.stats.maxHitPct);
    out.capped += res.stats.cappedHits;
    out.enemyCrits += res.stats.enemyCrits;
    if (res.outcome === 'victory') { out.exp.push(res.exp); out.gold.push(res.gold); }
    else { out.exp.push(0); out.gold.push(0); }
  }
  return out;
}

/**
 * Between fights on the road a real player casts Mend and eats Herbs. Heal anyone under 70% with spells
 * (cheapest adequate), Rouse the fallen if someone can, and use a Herb on anyone still under 45%.
 */
function fieldRest(members, bag) {
  const b = createBattle({ party: members, enemies: ['gloop'], data: DATA, rng: 1, options: { ambush: 'none' } });
  const B = b._internal;
  const all = B.party.concat(B.wagon);
  const S = DATA.spells;
  const casters = () => all.filter((c) => c.hp > 0);
  for (const c of all) {
    if (c.hp > 0) continue;
    const who = casters().find((x) => x.spells.includes('rouse') && x.mp >= S.rouse.mp);
    if (who) { who.mp -= S.rouse.mp; c.hp = Math.ceil(c.maxHp / 2); }
  }
  for (let guard = 0; guard < 40; guard++) {
    const hurt = all.filter((c) => c.hp > 0 && c.hp / c.maxHp < 0.7).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
    if (!hurt) break;
    let done = false;
    for (const id of ['mend', 'mendmore', 'fullmend']) {
      const sp = S[id];
      const who = casters().filter((x) => x.spells.includes(id) && x.mp - sp.mp >= 0).sort((x, y) => y.mp - x.mp)[0];
      if (!who) continue;
      const amt = sp.kind === 'fullheal' ? hurt.maxHp : Math.round(sp.base + who.mag * sp.k);
      if (id !== 'fullmend' && amt < (hurt.maxHp - hurt.hp) * 0.5 && who.spells.includes('mendmore') && id === 'mend') continue;
      who.mp -= sp.mp; hurt.hp = Math.min(hurt.maxHp, hurt.hp + amt); done = true; break;
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

function walkStats(area, L, trials) {
  let wiped = 0; const hpLeft = [], herbsUsed = [], fightsSurvived = [];
  for (let t = 0; t < trials; t++) {
    let party = area.party(L);
    let bag = { ...(area.bag || {}) };
    const bag0 = Object.values(bag).reduce((s, x) => s + x, 0);
    let ok = true, k = 0;
    for (; k < area.walk; k++) {
      const enemies = rollEncounter(area, rng, DATA.monsters);
      const { res } = runFight(party, enemies, area, 'smart', { bag });
      if (res.outcome !== 'victory') { ok = false; break; }
      bag = { ...res.bag };
      party = fieldRest(res.party.concat(res.wagon), bag);
    }
    if (!ok) wiped++;
    fightsSurvived.push(k);
    if (ok) {
      const s = createBattle({ party, enemies: ['gloop'], data: DATA, rng: 1, options: { ambush: 'none' } }).snapshot().party;
      hpLeft.push(s.reduce((a, p) => a + p.hp, 0) / s.reduce((a, p) => a + p.maxHp, 0));
      herbsUsed.push(bag0 - Object.values(bag).reduce((s2, x) => s2 + x, 0));
    }
  }
  return { wipePct: wiped / trials, hpLeft: mean(hpLeft), herbsUsed: mean(herbsUsed), survived: mean(fightsSurvived) };
}

function bossStats(area, boss, policy, n) {
  const out = { wins: 0, wipes: 0, timeouts: 0, rounds: [], big: [], tele: [], ko: 0, hpLeft: [], secondWinds: 0 };
  for (let i = 0; i < n; i++) {
    const { res } = runFight(area.party(boss.level), boss.enemies, area, policy,
      { wagonReachable: boss.wagonReachable ?? false, options: { ambush: 'none', assist: { s: boss.S || 0 } } });
    if (res.outcome === 'victory') {
      out.wins++;
      const maxes = createBattle({ party: res.party, enemies: ['gloop'], data: DATA, rng: 1, options: { ambush: 'none' } }).snapshot().party;
      out.hpLeft.push(maxes.reduce((a, p) => a + p.hp, 0) / maxes.reduce((a, p) => a + p.maxHp, 0));
    } else if (res.outcome === 'defeat') out.wipes++;
    else out.timeouts++;
    out.rounds.push(res.rounds); out.big.push(res.stats.bigFired); out.tele.push(res.stats.telegraphs);
    if (res.stats.koCount) out.ko++;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
function table(headers, rows) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => '| ' + cells.map((c, i) => String(c).padEnd(w[i])).join(' | ') + ' |';
  return [line(headers), '|' + w.map((x) => '-'.repeat(x + 2)).join('|') + '|', ...rows.map(line)].join('\n');
}

const t0 = Date.now();
const normalRows = [], bossRows = [], json = { seed: SEED, n: N, walks: WALKS, areas: [] };
const flags = [];

for (const area of AREAS) {
  if (ONLY && area.id !== ONLY) continue;
  const aj = { id: area.id, name: area.name, levels: [] };
  for (const L of area.levels) {
    const smart = normalStats(area, L, 'smart', N);
    const mash = normalStats(area, L, 'mash', Math.max(100, Math.floor(N / 2)));
    const walk = walkStats(area, L, WALKS);
    const expPer = mean(smart.exp);
    const goldPer = mean(smart.gold);
    const toNext = L < 30 ? EXP_TABLE[L + 1] - EXP_TABLE[L] : 0;
    const fightsToLevel = expPer > 0 ? toNext / expPer : Infinity;
    const fightsToBuy = area.nextBuy && goldPer > 0 ? area.nextBuy.price / goldPer : null;
    const winS = smart.wins / N, winM = mash.wins / Math.max(100, Math.floor(N / 2));
    const row = {
      area: area.name, id: area.id, L, winSmart: winS, winMash: winM, rounds: mean(smart.rounds),
      dmgPct: mean(smart.dmgPct), koPct: smart.ko / N, maxHitPct: smart.maxHit, cappedPer100: (100 * smart.capped) / N,
      expPer, fightsToLevel, goldPer, goldTarget: area.goldTarget, nextBuy: area.nextBuy, fightsToBuy, walk,
    };
    aj.levels.push(row);
    const verdict = [];
    if (!area.stress) {
      if (winS < 0.97) verdict.push('WIN<97');
      if (winM < 0.90) verdict.push('MASH<90');
      if (walk.wipePct > 0.05) verdict.push('WALK-WIPE');
      if (goldPer < area.goldTarget * 0.6) verdict.push('POOR');
      if (goldPer > area.goldTarget * 1.8) verdict.push('RICH');
      if (mean(smart.rounds) > 6.5) verdict.push('LONG');
    }
    if (verdict.length && L === area.levels[1]) flags.push(`${area.id} Lv${L}: ${verdict.join(', ')}`);
    normalRows.push([
      L === area.levels[0] ? area.name : '', L, pct(winS), pct(winM), f1(mean(smart.rounds)), pct(mean(smart.dmgPct)),
      pct(smart.ko / N), pct(smart.maxHit), f1((100 * smart.capped) / N), f1(expPer), f1(fightsToLevel), f1(goldPer), area.goldTarget,
      area.nextBuy ? `${area.nextBuy.name} ${area.nextBuy.price}G` : '—', fightsToBuy ? f1(fightsToBuy) : '—',
      `${pct(walk.wipePct)} /${area.walk}`, pct(walk.hpLeft), verdict.join(' ') || 'ok',
    ]);
  }
  for (const key of ['boss', 'boss2']) {
    const boss = area[key];
    if (!boss) continue;
    const bn = Math.max(100, Math.floor(N / 4));
    const smart = bossStats(area, boss, 'smart', bn);
    const mash = bossStats(area, boss, 'mash', bn);
    const auto = bossStats(area, boss, 'auto', bn);
    const mashS = bossStats(area, { ...boss, S: 36 }, 'mash', bn); // after three wipes (+12 each)
    const chainHp = (id) => { let h = 0, m = DATA.monsters[id]; while (m) { h += m.hp; m = m.transformsInto && DATA.monsters[m.transformsInto]; } return h; };
    const totalHp = boss.enemies.reduce((sum, id) => sum + chainHp(id), 0);
    const chainName = (id) => { const names = []; let m = DATA.monsters[id]; while (m) { names.push(m.name); m = m.transformsInto && DATA.monsters[m.transformsInto]; } return [...new Set(names)].join(' → '); };
    const name = boss.enemies.map(chainName).join(' & ');
    const scripted = boss.enemies.some((id) => DATA.monsters[id].scriptedEnd);
    const r = mean(smart.rounds);
    const brow = { boss: name, area: area.id, L: boss.level, winSmart: smart.wins / bn, winMash: mash.wins / bn,
      winAuto: auto.wins / bn, winMashAssisted: mashS.wins / bn,
      rounds: r, roundsMash: mean(mash.rounds), big: mean(smart.big), tele: mean(smart.tele), koPct: smart.ko / bn,
      hpLeft: mean(smart.hpLeft), totalHp, hpFor8: scripted ? null : Math.round(totalHp * 8 / Math.max(1, r) / 10) * 10 };
    (aj.bosses ||= []).push(brow);
    const bflags = [];
    if (!scripted && brow.winSmart < 0.9) bflags.push('HARD');
    if (!scripted && brow.winAuto < 0.6) bflags.push('AUTO-WALL');
    if (!scripted && r < 5) bflags.push('SHORT');
    if (!scripted && r > 14) bflags.push('LONG');
    if (bflags.length) flags.push(`${area.id} boss ${name}: ${bflags.join(', ')}`);
    bossRows.push([name, area.name, boss.level, pct(brow.winSmart), pct(brow.winAuto), pct(brow.winMash), pct(brow.winMashAssisted), f1(r), f1(brow.roundsMash),
      f1(brow.tele), f1(brow.big), pct(brow.koPct), pct(brow.hpLeft), totalHp, scripted ? 'scripted' : brow.hpFor8, bflags.join(' ') || 'ok']);
  }
  json.areas.push(aj);
}

console.log(`\nP14/P19 battle simulator — seed ${SEED}, ${N} fights per area×level (smart), ${Math.max(100, Math.floor(N / 2))} (mash), ${WALKS} walk-throughs, ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
console.log('NORMAL ENCOUNTERS  (fresh party each fight unless noted)');
console.log(table(['Area', 'Lv', 'Win smart', 'Win mash', 'Rounds', 'Dmg taken', 'KO', 'Max hit', 'Capped/100', 'EXP/fight', 'Fights→Lv', 'G/fight', 'G bible', 'Next buy', 'Fights→buy', 'Walk wipe', 'HP after walk', 'Flags'], normalRows));
if (bossRows.length) {
  console.log('\nBOSSES  (party at the CANON §8 level, no wagon, smart vs mash)');
  console.log(table(['Boss', 'Area', 'Lv', 'Win smart', 'Win auto', 'Win mash', 'Mash S=36', 'Rounds', 'Rounds mash', 'Telegraphs', 'Big attacks', 'Someone KO', 'HP left (wins)', 'Boss HP', 'HP for ~8 rnds', 'Flags'], bossRows));
}
console.log('\nColumns: Dmg taken = HP lost / party max HP per fight. Max hit = biggest single enemy hit as % of the target\'s max HP (normal fights are capped at 40% by the §6.5 floor). Capped/100 = hits that needed that cap per 100 fights. Fights→Lv = EXP to next level ÷ EXP per fight (hero, no catch-up). G bible = SYSTEMS §5 average gold per battle for the area\'s economy leg; Next buy and walk length are that leg\'s too. Walk wipe = chance of a wipe walking the area\'s fights back-to-back with no inn (smart play; Mend/Herbs on the road between fights, starting herbs only). Boss: auto = the "Fight!" auto-battle (never items, never MP below half); Mash S=36 = attack-only after three wipes, with the invisible rubber band on. "HP for ~8 rnds" = the HP that would make the smart fight last about eight rounds.');
if (flags.length) console.log('\nFLAGS (mid level + bosses):\n  ' + flags.join('\n  '));
else console.log('\nFLAGS: none at mid level.');
if (JSON_OUT) { fs.mkdirSync(require_dirname(JSON_OUT), { recursive: true }); fs.writeFileSync(JSON_OUT, JSON.stringify(json, null, 2)); console.log('\njson →', JSON_OUT); }

function require_dirname(p) { const i = p.lastIndexOf('/'); return i > 0 ? p.slice(0, i) : '.'; }
