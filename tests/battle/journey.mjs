#!/usr/bin/env node
// tests/battle/journey.mjs — P14/P19 THE pass/fail balance check: a whole playthrough, carried.
//
// Plays every area of tests/battle/areas.js in CANON story order the way a real child does: EXP, levels, the
// hidden struggle score S, gold and befriending state carry from fight to fight and area to area; nobody is
// rebuilt at "the level on paper". Each area's SYSTEMS §5 walk-through battles are shared out between the areas of
// its economy leg; the party rests on the road (Mend / Herbs) the way that kind of child would; a wipe wakes you
// at the church with EXP kept and gold halved (SYSTEMS §6.2) and you walk it again; a boss wipe wakes you at the
// church, never more than 90 seconds from the door (§6.1.2), so a couple of fights on the way back; the third
// approach meets the §6.1.6 helper at the door (a full heal and three Strong Herbs).
//
// Then, for every boss: does the level you arrive at MATTER? (critic r1: "Bosses 1-8 are won first try by every kind
// of child even 4 levels under", "a flee-everything child beats 8 bosses 2-7 levels under".) Fight! at the design level,
// four under (walked, and straight to the door with full HP and MP), four over; and the retries of a child who only
// presses Attack once the rubber band has noticed.
//
//   node tests/battle/journey.mjs                       # every kind of child, contract check, exit 1 on FAIL
//   node tests/battle/journey.mjs --kids normal,masher --trials 60 --seed 7
//   node tests/battle/journey.mjs --kids normal --verbose
//   node tests/battle/journey.mjs --json shots/P14-sim/journey.json
//   node tests/battle/journey.mjs --levels 0 --retry 0  # the playthroughs only
//
// Kinds of child:
//   normal    — presses "Fight!" (SYSTEMS §7.3 auto-battle) for everything, heals on the road.  THE design child.
//   smart     — the careful twelve-year-old: heals early, Bolsters on a wind-up, uses items.
//   masher    — a six-year-old who only ever presses Attack, never heals, never uses an item.
//   neverheal — Fight! but never casts a heal or opens the bag, in battle or out of it.
//   skipper   — runs from 60% of fights (the child who wants to see the world), Fight! for the rest.
//   fleer     — runs from every normal fight, Fight! for bosses; after a boss wipe it walks back fighting (a child
//               learns). Contracted: it must NOT beat bosses it arrives far under-levelled for on the first try, and
//               it must never be walled.
//   grinder   — smart, keeps fighting until 3 levels above the area, then goes back to the inn before the boss (a
//               child who grinds knows where the inn is). Reported, not contracted.

import fs from 'node:fs';
import { makeRng } from '../../src/battle/formulas.js';
import DATA from './data.js';
import { rollEncounter } from './areas.js';
import { STORY, fight, fieldRest, walkLength, mean } from './play.js';
import { cell, retry, bossSpecs } from './bosses.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const KIDS = arg('kids', 'normal,smart,masher,neverheal,skipper,fleer,grinder').split(',');
const TRIALS = Number(arg('trials', 40));
const SEED = Number(arg('seed', 20040));
const VERBOSE = argv.includes('--verbose');
const JSON_OUT = arg('json', null);
const RETRY_TRIALS = Number(arg('retry', 60));
const LEVEL_TRIALS = Number(arg('levels', 60));
const MAX_TRIES = 10;

const KID = {
  normal:    { fight: 'auto',    boss: 'auto',    rest: true,  fightFrac: 1,   contract: 'design' },
  smart:     { fight: 'smart',   boss: 'smart',   rest: true,  fightFrac: 1,   contract: 'kind' },
  masher:    { fight: 'mash',    boss: 'mash',    rest: false, fightFrac: 1,   contract: 'kind', noHeal: true },
  neverheal: { fight: 'noheal',  boss: 'noheal',  rest: false, fightFrac: 1,   contract: 'kind', noHeal: true },
  skipper:   { fight: 'auto',    boss: 'auto',    rest: true,  fightFrac: 0.4, contract: 'kind' },
  fleer:     { fight: 'auto',    boss: 'auto',    rest: true,  fightFrac: 0,   learns: true, contract: 'fleer' },
  grinder:   { fight: 'smart',   boss: 'smart',   rest: true,  fightFrac: 1,   grind: 3, inn: true, contract: null },
};

/** SYSTEMS §6 + the critic's targets, as numbers. */
export const CONTRACT = {
  design: {
    bossArrive: 1.5,                   // hero level at the boss door within ±1.5 of the level the boss is tuned for
    rounds: [2.0, 3.5],                // a normal fight lasts two to three rounds
    oneRound: 0.25, zeroDmg: 0.20,     // …and only now and then is over in one, or free
    cost: [0.07, 0.16],                // …and costs about a tenth of the party's HP
    win: 0.97,
    bossRounds: [6, 10], bossHpLeft: [0.35, 0.50], bossFirst: 0.70,
  },
  // no kind of child is walled: a boss is beaten in a couple of tries. A child who never heals at all (Attack only,
  // or Fight! with every heal refused) and never rests between fights meets the Act III bosses bruised, loses, and
  // wins once the §6.1.6 helper has patched them up at the third door — three tries on average (the critic's bar:
  // "an Attack-only child wins within 3 tries with the rubber band engaged"; from full HP that is the retry table's
  // >= 90%). The long tail is judged at the 95th percentile (the worst of 80 playthroughs is one unlucky child):
  // 19 children in 20 are through within five tries.
  kind: { bossMeanAttempts: 2.5, noHealMeanAttempts: 3.0, bossP95Attempts: 5 },
  // the child who ran from everything: where it reaches a boss 4+ levels under, it mostly does not win first try
  // (3+ under is reported: with full HP and MP a child three under wins about half the time, bruised)
  fleer: { underBy: 4, underFirstWin: 0.50, reportUnderBy: 3 },
  // Fight!, first try, S = 0 (tests/battle/bosses.mjs cells)
  levels: { design: 0.80, under4Walked: 0.40, under4Fresh: 0.50, over4: 0.97, over4HpGain: 0.10 },
  retry: { within3: 0.90 },            // from S = 36, Attack-only and Fight! both win within three tries
};

// ---------------------------------------------------------------------------------------------------------
// a whole playthrough for one kind of child

function runKid(kind, trials, seed) {
  const cfg = KID[kind];
  const rng = makeRng(seed);
  const areaStats = {}, bossStats = {};
  let walls = 0;
  const logs = [];
  for (let t = 0; t < trials; t++) {
    const lv = {};
    let S = 0, gold = 30, heroLvl = 1;
    let rec = { enabled: true, kidMode: true, joined: {}, misses: {}, battlesSinceRecruit: 0 };
    const trail = [];
    let walled = false;
    const learned = {};
    for (const area of STORY) {
      const A = (areaStats[area.id] ||= { arrive: [], leave: [], tries: [], fights: 0, wins: 0, fled: 0, wipes: 0,
        rounds: [], oneRound: 0, zeroDmg: 0, cost: [], offers: 0, eligible: 0, gold: [], exp: [], walls: 0 });
      A.arrive.push(heroLvl);
      const rejoin = new Set(area.rejoin || []);
      const build = () => area.party(heroLvl).map((m) => {
        const k = lv[m.id];
        if (m.kind === 'guest' || !k) return m;
        const lvl = rejoin.has(m.id) ? Math.max(k.lvl, m.lvl) : k.lvl;
        const exp = lvl === k.lvl ? k.exp : m.exp;
        return { ...m, lvl, exp, hp: undefined, mp: undefined };
      });
      const remember = (list) => {
        for (const m of list) if (m.kind !== 'guest') lv[m.id] = { lvl: m.lvl, exp: m.exp };
        heroLvl = (lv.hero || { lvl: heroLvl }).lvl;
      };
      remember(build().filter((m) => m.kind !== 'guest' && !lv[m.id]));
      const walkN = walkLength(area);
      const opts = (extra = {}) => ({ gold, assist: { s: S }, areaLevel: area.areaLevel, wagonReachable: area.wagonReachable ?? true,
        recruit: area.act >= 2 && area.recruit !== false ? { ...rec } : null, ...extra });
      const after = (res) => {
        S = res.assist.after; gold = res.goldAfter;
        if (res.recruit) {
          rec = { ...rec, ...res.recruit.state };
          if (res.recruit.offer) rec.joined = { ...rec.joined, [res.recruit.offer.species]: (rec.joined[res.recruit.offer.species] || 0) + 1 };
        }
        remember(res.party.concat(res.wagon));
      };

      // ---- the walk (and, for the grinder, the grind)
      let tries = 0, cleared = false;
      const grindTo = cfg.grind ? (area.boss ? area.boss.level : area.levels[2]) + cfg.grind : 0;
      let members, bag;
      while (!cleared && tries < MAX_TRIES) {
        tries++;
        members = build(); bag = { ...(area.bag || {}) };
        let wiped = false;
        for (let k = 0; ; k++) {
          const more = cfg.grind ? (k < walkN || heroLvl < grindTo) && k < walkN * 8 : k < walkN;
          if (!more) break;
          const enemies = rollEncounter(area, rng, DATA.monsters);
          const flee = rng.next() >= (cfg.learns && learned[area.id] ? 1 : cfg.fightFrac);
          const { res, taken } = fight(rng, members, enemies, opts({ bag }), cfg.fight, flee);
          A.fights++;
          if (!res) { wiped = true; break; }
          if (res.outcome === 'fled') A.fled++;
          if (res.outcome === 'victory') {
            A.wins++; A.rounds.push(res.rounds); A.cost.push(taken); A.gold.push(res.gold); A.exp.push(res.exp);
            if (res.rounds === 1) A.oneRound++;
            if (taken === 0) A.zeroDmg++;
            if (area.act >= 2) { A.eligible++; if (res.recruit && res.recruit.offer) A.offers++; }
          }
          bag = { ...res.bag };
          after(res);
          if (res.outcome === 'defeat') { A.wipes++; wiped = true; break; }
          members = cfg.rest ? fieldRest(res.party.concat(res.wagon), bag) : res.party.concat(res.wagon);
        }
        if (wiped) { if (VERBOSE) trail.push(`${area.id}: wiped on the walk (try ${tries}) Lv${heroLvl} S${S}`); continue; }
        cleared = true;
      }
      A.tries.push(tries);
      if (!cleared) { walled = true; A.walls++; trail.push(`WALL on the ${area.id} walk at Lv${heroLvl} S${S}`); break; }

      // ---- bosses
      for (const key of ['boss', 'boss2']) {
        const spec = area[key];
        if (!spec) continue;
        const id = spec.enemies.join('+');
        const R = (bossStats[id] ||= { area: area.id, design: spec.level, arrive: [], attempts: [], firstWin: 0, wins: 0,
          rounds: [], hpLeft: [], low: [], ko: 0, fights: 0, walls: 0, underFirst: 0, underFirstWins: 0, under3First: 0, under3FirstWins: 0 });
        R.arrive.push(heroLvl);
        const under = heroLvl <= spec.level - CONTRACT.fleer.underBy;
        const under3 = heroLvl <= spec.level - CONTRACT.fleer.reportUnderBy;
        if (under) R.underFirst++;
        if (under3) R.under3First++;
        if (cfg.inn) members = members.map((m) => ({ ...m, hp: undefined, mp: undefined }));
        let attempts = 0, won = false;
        while (!won && attempts < MAX_TRIES) {
          attempts++;
          if (attempts > 1) {
            // woke at the church (full HP), ninety seconds of walking back to the door: a couple of fights — and a child
            // who ran from everything and has just been flattened walks back fighting, and more of them
            members = build(); bag = { ...(area.bag || {}) };
            const frac = cfg.learns ? 1 : cfg.fightFrac;
            const back = cfg.learns ? Math.max(2, Math.ceil(walkN / 2)) : Math.max(1, Math.ceil(walkN / 4));
            for (let k = 0; k < back; k++) {
              const { res } = fight(rng, members, rollEncounter(area, rng, DATA.monsters), opts({ bag }), cfg.fight, rng.next() >= frac);
              if (!res) break;
              bag = { ...res.bag }; after(res);
              if (res.outcome === 'defeat') { members = build(); continue; }
              members = cfg.rest ? fieldRest(res.party.concat(res.wagon), bag) : res.party.concat(res.wagon);
            }
          }
          if (attempts >= 3) {
            // §6.1.6: two wipes in a row by this boss — a plain, unhurried helper at the door: full heal, 3 Strong Herbs
            members = members.map((m) => ({ ...m, hp: undefined, mp: undefined }));
            bag.strong_herb = (bag.strong_herb || 0) + 3;
          }
          const { res, low, left } = fight(rng, members, spec.enemies,
            opts({ bag, ambush: 'none', recruit: null, wagonReachable: spec.wagonReachable ?? false }), cfg.boss);
          R.fights++;
          if (!res) { if (VERBOSE) trail.push(`${id} timed out`); continue; }
          bag = { ...res.bag };
          if (res.stats.koCount) R.ko++;
          after(res);
          if (VERBOSE) trail.push(`${area.id} ${id}: ${res.outcome} in ${res.rounds} rounds (went in with ${members.slice(0, 4).map((m) => `${m.id} ${m.lvl}`).join(', ')}, S${res.assist.before}; now Lv${heroLvl}, S${S})`);
          if (res.outcome !== 'victory') { learned[area.id] = true; continue; }
          won = true; R.wins++;
          if (attempts === 1) { R.firstWin++; if (under) R.underFirstWins++; if (under3) R.under3FirstWins++; }
          R.rounds.push(res.rounds); R.low.push(low); R.hpLeft.push(left);
          members = fieldRest(res.party.concat(res.wagon), bag);
        }
        R.attempts.push(attempts);
        if (!won) { walled = true; R.walls++; trail.push(`WALL at ${id} Lv${heroLvl} S${S}`); break; }
      }
      A.leave.push(heroLvl);
      if (walled) break;
    }
    if (walled) walls++;
    if (VERBOSE) logs.push(`trial ${t}:\n  ` + trail.join('\n  '));
  }
  return { kind, areaStats, bossStats, walls, logs };
}

// ---------------------------------------------------------------------------------------------------------
// report + the contract

const pct = (x) => (Number.isFinite(x) ? Math.round(100 * x) + '%' : '—');
const p95 = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] : 0; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
function table(headers, rows) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => '| ' + cells.map((c, i) => String(c).padEnd(w[i])).join(' | ') + ' |';
  return [line(headers), '|' + w.map((x) => '-'.repeat(x + 2)).join('|') + '|', ...rows.map(line)].join('\n');
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const t0 = Date.now();
  const out = { seed: SEED, trials: TRIALS, kids: {}, levels: [], retry: [] };
  const fails = [];
  console.log(`\nP14/P19 JOURNEY — whole playthroughs, carried; seed ${SEED}, ${TRIALS} runs per kind of child\n`);
  for (const kind of KIDS) {
    if (!KID[kind]) { console.error('unknown kid', kind); process.exit(2); }
    const r = runKid(kind, TRIALS, SEED + kind.length * 101);
    out.kids[kind] = r;
    const cfg = KID[kind];
    const aRows = [], bRows = [];
    for (const area of STORY) {
      const A = r.areaStats[area.id];
      if (!A) continue;
      const flags = [];
      if (cfg.contract === 'design') {
        const c = CONTRACT.design;
        const rr = mean(A.rounds), cost = mean(A.cost);
        if (A.fights && A.wins / Math.max(1, A.fights - A.fled) < c.win) flags.push('WIN');
        if (!area.soft && (rr < c.rounds[0] || rr > c.rounds[1])) flags.push('ROUNDS');
        if (!area.soft && A.oneRound / Math.max(1, A.wins) > c.oneRound) flags.push('1-ROUND');
        if (!area.soft && A.zeroDmg / Math.max(1, A.wins) > c.zeroDmg) flags.push('FREE');
        if (!area.soft && (cost < c.cost[0] || cost > c.cost[1])) flags.push('COST');
      }
      if (A.walls && cfg.contract) flags.push('WALL');
      if (flags.length && cfg.contract) fails.push(`${kind} ${area.id}: ${flags.join(' ')}`);
      aRows.push([area.id, area.areaLevel ?? '—', f1(mean(A.arrive)), f1(mean(A.leave)), f1(mean(A.tries)), A.fights,
        pct(A.wins / Math.max(1, A.fights)), A.wipes, f1(mean(A.rounds)), pct(A.oneRound / Math.max(1, A.wins)),
        pct(A.zeroDmg / Math.max(1, A.wins)), pct(mean(A.cost)), f1(mean(A.exp)), f1(mean(A.gold)),
        area.act >= 2 ? pct(A.offers / Math.max(1, A.eligible)) : '—', A.walls, flags.join(' ') || 'ok']);
    }
    for (const [id, R] of Object.entries(r.bossStats)) {
      const flags = [];
      const arrive = mean(R.arrive), rounds = mean(R.rounds), left = mean(R.hpLeft);
      const scripted = DATA.monsters[id.split('+')[0]].scriptedEnd;
      if (cfg.contract === 'design') {
        const c = CONTRACT.design;
        if (Math.abs(arrive - R.design) > c.bossArrive) flags.push('LEVEL');
        if (!scripted && (rounds < c.bossRounds[0] || rounds > c.bossRounds[1])) flags.push('ROUNDS');
        if (!scripted && (left < c.bossHpLeft[0] || left > c.bossHpLeft[1])) flags.push('HP-LEFT');
        if (R.firstWin / Math.max(1, R.attempts.length) < c.bossFirst) flags.push('FIRST');
      }
      if (cfg.contract === 'kind') {
        const c = CONTRACT.kind;
        if (mean(R.attempts) > (cfg.noHeal ? c.noHealMeanAttempts : c.bossMeanAttempts)) flags.push('TRIES');
        if (p95(R.attempts) > c.bossP95Attempts) flags.push('P95-TRIES');
      }
      if (cfg.contract === 'fleer' && !scripted && R.underFirst >= Math.max(3, trials(r) * 0.2)
        && R.underFirstWins / R.underFirst > CONTRACT.fleer.underFirstWin) flags.push('UNDER-WINS');
      if (R.walls && cfg.contract) flags.push('WALL');
      if (flags.length && cfg.contract) fails.push(`${kind} boss ${id}: ${flags.join(' ')}`);
      bRows.push([id, R.design, f1(arrive), R.attempts.length, f1(mean(R.attempts)), `${p95(R.attempts)} / ${Math.max(0, ...R.attempts)}`,
        pct(R.firstWin / Math.max(1, R.attempts.length)),
        R.under3First ? `${pct(R.under3FirstWins / R.under3First)} of ${R.under3First}` : '—',
        R.underFirst ? `${pct(R.underFirstWins / R.underFirst)} of ${R.underFirst}` : '—',
        scripted ? 'scripted' : f1(rounds), pct(mean(R.low)), pct(left),
        pct(R.ko / Math.max(1, R.fights)), R.walls, flags.join(' ') || 'ok']);
    }
    console.log(`## ${kind}${cfg.contract ? '' : ' (reported, not contracted)'} — walls ${r.walls}/${TRIALS}`);
    console.log(table(['area', 'tuned Lv', 'arrive', 'leave', 'tries', 'fights', 'won', 'wipes', 'rounds', '1-round', 'no dmg', 'HP cost', 'EXP', 'G', 'join offers', 'walls', 'flags'], aRows));
    console.log(table(['boss', 'design Lv', 'arrive', 'reached', 'attempts', 'p95 / max', '1st try', `1st try ${CONTRACT.fleer.reportUnderBy}+ under`, `1st try ${CONTRACT.fleer.underBy}+ under`, 'rounds', 'lowest HP', 'HP left', 'someone KO', 'walls', 'flags'], bRows));
    if (VERBOSE) console.log(r.logs.join('\n'));
    console.log('');
  }

  const bosses = bossSpecs().filter((b) => !b.scripted);
  if (LEVEL_TRIALS > 0) {
    console.log(`## do levels matter? Fight!, first try, S = 0 — ${LEVEL_TRIALS} children a cell (walked = the area walked at that level, resting on the road; fresh = straight to the door, full HP and MP)`);
    const rows = [];
    const c = CONTRACT.levels;
    for (const { id, area, spec } of bosses) {
      const L = spec.level;
      const f4 = cell(area, spec, L - 4, { n: LEVEL_TRIALS, fresh: true, seed: SEED + 11 });
      const w4 = cell(area, spec, L - 4, { n: LEVEL_TRIALS, seed: SEED + 12 });
      const w2 = cell(area, spec, L - 2, { n: LEVEL_TRIALS, seed: SEED + 13 });
      const w0 = cell(area, spec, L, { n: LEVEL_TRIALS, seed: SEED + 14 });
      const up = Math.min(30, L + 4) - L;              // Mortmain and Malgrim: "+4" stops at the level cap (30)
      const p4 = cell(area, spec, L + up, { n: LEVEL_TRIALS, seed: SEED + 15 });
      const m0 = cell(area, spec, L, { n: LEVEL_TRIALS, seed: SEED + 16, policy: 'mash' });
      const flags = [];
      if (w0.win < c.design) flags.push('DESIGN');
      if (w4.win > c.under4Walked) flags.push('UNDER-WALKED');
      if (f4.win > c.under4Fresh) flags.push('UNDER-FRESH');
      // four levels over wins, easily; where the level cap stops it short (Mortmain, Malgrim: +2), it at least wins more
      if (up >= 4 ? p4.win < c.over4 : p4.win < w0.win) flags.push('OVER');
      // compare what a child can expect to walk out with (a lost fight walks out with nothing): HP left over wins alone
      // is flattered at the design level, where only the good fights are won
      if (!(p4.win * p4.left >= w0.win * w0.left + c.over4HpGain * (up / 4))) flags.push('OVER-HP');
      if (flags.length) fails.push(`levels ${id}: ${flags.join(' ')}`);
      out.levels.push({ id, L, f4, w4, w2, w0, p4, m0 });
      const show = (x) => `${pct(x.win)} · ${pct(x.left)} left`;
      rows.push([id, L, show(f4), show(w4), show(w2), `${show(w0)} · ${f1(w0.rounds)} r`, show(p4), show(m0), flags.join(' ') || 'ok']);
    }
    console.log(table(['boss', 'Lv', '-4 fresh', '-4 walked', '-2 walked', 'design walked', '+4 walked (cap 30)', 'Attack only, design', 'flags'], rows));
    console.log('');
  }

  if (RETRY_TRIALS > 0) {
    console.log(`## boss retries from full at the design level, S starting at 36 (three wipes in), +12 per wipe — ${RETRY_TRIALS} children each`);
    const rows = [];
    for (const { id, area, spec } of bosses) {
      const m = retry(area, spec, 'mash', { n: RETRY_TRIALS, seed: SEED + 7 });
      const a = retry(area, spec, 'auto', { n: RETRY_TRIALS, seed: SEED + 8 });
      const flags = [];
      if (m.within3 < CONTRACT.retry.within3) flags.push('MASH-WALL');
      if (a.within3 < CONTRACT.retry.within3) flags.push('AUTO-WALL');
      if (flags.length) fails.push(`retry ${id}: ${flags.join(' ')}`);
      out.retry.push({ id, L: spec.level, mash: m, auto: a });
      rows.push([id, spec.level, pct(m.within3), pct(a.within3), f1(m.tries), f1(a.tries), flags.join(' ') || 'ok']);
    }
    console.log(table(['boss', 'Lv', 'Attack only ≤3 tries', 'Fight! ≤3 tries', 'Attack only tries', 'Fight! tries', 'flags'], rows));
  }

  console.log(`\nColumns: tuned Lv = the level the area's monsters are tuned for (areas.js areaLevel). arrive/leave = hero level. HP cost = HP the child's party lost in a won normal fight ÷ its max HP (Halvard excluded: he is the one keeping them safe). 1-round / no dmg = share of won normal fights over in one round / costing nothing. join offers = wins that ended with a monster asking to join (Act II on). Boss HP left = the child's party HP at the end of a won boss fight; lowest HP = the lowest it fell during the fight. "1st try 3+/4+ under" = first attempts made 3 (or 4) or more levels under the boss's level, and how many of those were won. ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
  if (fails.length) console.log('\nCONTRACT FAILURES:\n  ' + fails.join('\n  '));
  else console.log('\nCONTRACT: all pass.');
  if (JSON_OUT) {
    fs.mkdirSync(JSON_OUT.replace(/\/[^/]*$/, '') || '.', { recursive: true });
    // summaries only: every array of per-fight numbers becomes its mean (the raw arrays run to megabytes)
    const slim = JSON.parse(JSON.stringify(out, (k, v) => (k === 'logs' ? undefined
      : Array.isArray(v) && v.every((x) => typeof x === 'number') ? Math.round(1000 * mean(v)) / 1000 : v)));
    fs.writeFileSync(JSON_OUT, JSON.stringify({ ...slim, contract: CONTRACT, fails }, null, 1));
    console.log('json →', JSON_OUT);
  }
  process.exitCode = fails.length ? 1 : 0;
}

function trials(r) { return Object.values(r.areaStats)[0] ? Object.values(r.areaStats)[0].arrive.length : 0; }

export { runKid, KID };
