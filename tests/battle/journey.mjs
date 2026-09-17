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
//   node tests/battle/journey.mjs                       # every kind of child, contract check, exit 1 on FAIL
//   node tests/battle/journey.mjs --kids normal,masher --trials 60 --seed 7
//   node tests/battle/journey.mjs --kids normal --verbose
//   node tests/battle/journey.mjs --json shots/P14-sim/journey.json
//
// Kinds of child:
//   normal    — presses "Fight!" (SYSTEMS §7.3 auto-battle) for everything, heals on the road.  THE design child.
//   smart     — the careful twelve-year-old: heals early, Bolsters on a wind-up, uses items.
//   masher    — a six-year-old who only ever presses Attack, never heals, never uses an item.
//   neverheal — Fight! but never casts a heal or opens the bag, in battle or out of it.
//   skipper   — runs from 60% of fights (the child who wants to see the world), Fight! for the rest.
//   fleer     — runs from every normal fight, Fight! for bosses; after a boss wipe it fights on the way back (a child
//               learns). Stress case: reported, not contracted.
//   grinder   — smart, and keeps fighting until 3 levels above the area. Reported, not contracted.

import fs from 'node:fs';
import { createBattle } from '../../src/battle/battle.js';
import { makeRng } from '../../src/battle/formulas.js';
import { chooseAllyAction } from '../../src/battle/ai.js';
import DATA from './data.js';
import { AREAS, rollEncounter } from './areas.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const KIDS = arg('kids', 'normal,smart,masher,neverheal,skipper,fleer,grinder').split(',');
const TRIALS = Number(arg('trials', 40));
const SEED = Number(arg('seed', 20040));
const VERBOSE = argv.includes('--verbose');
const JSON_OUT = arg('json', null);
const RETRY_TRIALS = Number(arg('retry', 60));
const MAX_ROUNDS = 80;
const MAX_TRIES = 10;
const STORY = AREAS.filter((a) => !a.stress);

const KID = {
  normal:    { fight: 'auto',    boss: 'auto',    rest: true,  fightFrac: 1,   contract: 'design' },
  smart:     { fight: 'smart',   boss: 'smart',   rest: true,  fightFrac: 1,   contract: 'kind' },
  masher:    { fight: 'mash',    boss: 'mash',    rest: false, fightFrac: 1,   contract: 'kind' },
  neverheal: { fight: 'noheal',  boss: 'noheal',  rest: false, fightFrac: 1,   contract: 'kind' },
  skipper:   { fight: 'auto',    boss: 'auto',    rest: true,  fightFrac: 0.4, contract: 'kind' },
  fleer:     { fight: 'auto',    boss: 'auto',    rest: true,  fightFrac: 0,   learns: true, contract: null },
  grinder:   { fight: 'smart',   boss: 'smart',   rest: true,  fightFrac: 1,   grind: 3, contract: null },
};

// ---------------------------------------------------------------------------------------------------------
// one round of commands the way this child gives them

function commandRound(b, policy, flee) {
  const B = b._internal;
  let guard = 0, n;
  while ((n = b.needsCommand()) && guard++ < 8) {
    const a = B.party.find((c) => c.id === n.id);
    let cmd;
    if (flee) cmd = { type: 'flee' };
    else if (policy === 'noheal') {
      cmd = chooseAllyAction(B, a, 'auto');
      const s = cmd.type === 'spell' && DATA.spells[cmd.id];
      if ((s && ['heal', 'healAll', 'fullheal', 'revive'].includes(s.kind)) || cmd.type === 'item') cmd = { type: 'attack' };
    } else cmd = chooseAllyAction(B, a, policy);
    let r = b.command(a.id, cmd);
    if (!r.ok) r = b.command(a.id, { type: 'attack' });
    if (!r.ok) b.command(a.id, { type: 'defend' });
  }
  return b.resolveRound();
}

function fight(rng, members, enemies, opts, policy, flee = false) {
  const b = createBattle({ party: members.slice(0, 4), wagon: members.slice(4), enemies, data: DATA, rng, options: opts });
  const B = b._internal;
  // the child's own side: everyone but a mentor guest (Halvard) — Willow and Sera as children count, they are friends
  const heroSide = () => B.party.filter((c) => !(c.guest && c.member && c.member.mentor));
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
  return { b, res: b.result, taken: taken / startMax, low, startMax };
}

/** Between fights: Rouse the fallen, Mend/Mendmore anyone under 70%, a Herb for anyone still under 45%. */
function fieldRest(members, bag) {
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

// ---------------------------------------------------------------------------------------------------------
// a whole playthrough for one kind of child

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

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
      const legShare = STORY.filter((x) => x.leg === area.leg).length;
      const walkN = Math.max(3, Math.round(area.walk / legShare));
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
          rounds: [], hpLeft: [], low: [], ko: 0, fights: 0, walls: 0 });
        R.arrive.push(heroLvl);
        let attempts = 0, won = false;
        while (!won && attempts < MAX_TRIES) {
          attempts++;
          if (attempts > 1) {
            // woke at the church (full HP), ninety seconds of walking back to the door: a couple of fights
            members = build(); bag = { ...(area.bag || {}) };
            const frac = cfg.learns ? 1 : cfg.fightFrac;
            for (let k = 0; k < Math.max(1, Math.ceil(walkN / 4)); k++) {
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
          const { res, low } = fight(rng, members, spec.enemies,
            opts({ bag, ambush: 'none', recruit: null, wagonReachable: spec.wagonReachable ?? false }), cfg.boss);
          R.fights++;
          if (!res) { if (VERBOSE) trail.push(`${id} timed out`); continue; }
          bag = { ...res.bag };
          if (res.stats.koCount) R.ko++;
          after(res);
          if (VERBOSE) trail.push(`${area.id} ${id}: ${res.outcome} in ${res.rounds} rounds at Lv${heroLvl}, S${S}`);
          if (res.outcome !== 'victory') { learned[area.id] = true; continue; }
          won = true; R.wins++;
          if (attempts === 1) R.firstWin++;
          R.rounds.push(res.rounds); R.low.push(low);
          const hs = res.party.filter((m) => !m.mentor);
          const snap = createBattle({ party: hs, enemies: ['gloop'], data: DATA, rng: 1, options: { ambush: 'none' } }).snapshot().party;
          R.hpLeft.push(snap.reduce((s, p) => s + p.hp, 0) / snap.reduce((s, p) => s + p.maxHp, 0));
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
// boss retries from full HP at the design level, S rising +12 per wipe (the critic's "3 tries at S >= 36")

function bossRetry(policy, S0, trials, seed, delta = 0) {
  const rng = makeRng(seed);
  const rows = [];
  for (const area of STORY) for (const key of ['boss', 'boss2']) {
    const spec = area[key];
    if (!spec) continue;
    const L = Math.max(1, spec.level + delta);
    let within3 = 0, first = 0, tries = [], rounds = [], low = [];
    for (let t = 0; t < trials; t++) {
      let S = S0, k = 0, won = false;
      while (!won && k < 12) {
        k++;
        const members = area.party(L);
        const { res, low: lo } = fight(rng, members, spec.enemies,
          { bag: { ...(area.bag || {}) }, gold: 500, assist: { s: S }, ambush: 'none', wagonReachable: spec.wagonReachable ?? false }, policy);
        if (res && res.outcome === 'victory') { won = true; rounds.push(res.rounds); low.push(lo); }
        S = res ? res.assist.after : Math.min(100, S + 12);
      }
      tries.push(won ? k : 13);
      if (won && k <= 3) within3++;
      if (won && k === 1) first++;
    }
    rows.push({ boss: spec.enemies.join('+'), L, first: first / trials, within3: within3 / trials, tries: mean(tries), rounds: mean(rounds), low: mean(low) });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------------
// report + the contract

const pct = (x) => (Number.isFinite(x) ? Math.round(100 * x) + '%' : '—');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
function table(headers, rows) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => '| ' + cells.map((c, i) => String(c).padEnd(w[i])).join(' | ') + ' |';
  return [line(headers), '|' + w.map((x) => '-'.repeat(x + 2)).join('|') + '|', ...rows.map(line)].join('\n');
}

/** SYSTEMS §6 + the critic's targets, as numbers. */
export const CONTRACT = {
  design: {
    bossArrive: 2,                     // hero level at the boss door within ±2 of CANON §8
    rounds: [2.0, 3.6],                // a normal fight lasts two to three rounds
    oneRound: 0.30, zeroDmg: 0.25,     // …and only now and then is over in one, or free
    cost: [0.06, 0.18],                // …and costs about a tenth of the party's HP
    win: 0.97,
    bossRounds: [6, 10.5], bossHpLeft: [0.25, 0.60], bossFirst: 0.60,
  },
  kind: { bossMeanAttempts: 2.5, bossMaxAttempts: 5 },
  retry: { within3: 0.90 },            // from S = 36, Attack-only and Fight! both win within three tries
};

const t0 = Date.now();
const out = { seed: SEED, trials: TRIALS, kids: {}, retry: {} };
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
      if (mean(R.attempts) > c.bossMeanAttempts) flags.push('TRIES');
      if (Math.max(...R.attempts) > c.bossMaxAttempts) flags.push('MAX-TRIES');
    }
    if (R.walls && cfg.contract) flags.push('WALL');
    if (flags.length && cfg.contract) fails.push(`${kind} boss ${id}: ${flags.join(' ')}`);
    bRows.push([id, R.design, f1(arrive), R.attempts.length, f1(mean(R.attempts)), Math.max(0, ...R.attempts),
      pct(R.firstWin / Math.max(1, R.attempts.length)), scripted ? 'scripted' : f1(rounds), pct(mean(R.low)), pct(left),
      pct(R.ko / Math.max(1, R.fights)), R.walls, flags.join(' ') || 'ok']);
  }
  console.log(`## ${kind}${cfg.contract ? '' : ' (reported, not contracted)'} — walls ${r.walls}/${TRIALS}`);
  console.log(table(['area', 'tuned Lv', 'arrive', 'leave', 'tries', 'fights', 'won', 'wipes', 'rounds', '1-round', 'no dmg', 'HP cost', 'EXP', 'G', 'join offers', 'walls', 'flags'], aRows));
  console.log(table(['boss', 'design Lv', 'arrive', 'reached', 'attempts', 'max', '1st try', 'rounds', 'lowest HP', 'HP left', 'someone KO', 'walls', 'flags'], bRows));
  if (VERBOSE) console.log(r.logs.join('\n'));
  console.log('');
}

if (RETRY_TRIALS > 0) {
  console.log(`## boss retries from full at the design level, S starting at 36 (three wipes in), +12 per wipe — ${RETRY_TRIALS} children each`);
  const rows = [];
  const res = {};
  for (const policy of ['mash', 'auto']) res[policy] = bossRetry(policy, 36, RETRY_TRIALS, SEED + 7);
  const res0 = {};
  for (const policy of ['mash', 'auto']) res0[policy] = bossRetry(policy, 0, RETRY_TRIALS, SEED + 9);
  out.retry = { s36: res, s0: res0 };
  res.mash.forEach((m, i) => {
    const a = res.auto[i], m0 = res0.mash[i], a0 = res0.auto[i];
    const flags = [];
    if (m.within3 < CONTRACT.retry.within3) flags.push('MASH-WALL');
    if (a.within3 < CONTRACT.retry.within3) flags.push('AUTO-WALL');
    if (flags.length) fails.push(`retry ${m.boss}: ${flags.join(' ')}`);
    rows.push([m.boss, m.L, pct(m0.first), pct(a0.first), f1(m0.rounds), f1(a0.rounds), pct(m.within3), pct(a.within3), f1(m.tries), f1(a.tries), flags.join(' ') || 'ok']);
  });
  console.log(table(['boss', 'Lv', 'mash 1st (S0)', 'Fight! 1st (S0)', 'mash rounds', 'Fight! rounds', 'mash ≤3 tries (S36)', 'Fight! ≤3 tries (S36)', 'mash tries', 'Fight! tries', 'flags'], rows));
}

console.log(`\nColumns: tuned Lv = the level the area's monsters are tuned for (areas.js areaLevel). arrive/leave = hero level. HP cost = HP the child's party lost in a won normal fight ÷ its max HP (Halvard excluded: he is the one keeping them safe). 1-round / no dmg = share of won normal fights over in one round / costing nothing. join offers = wins that ended with a monster asking to join (Act II on). Boss HP left = the child's party HP at the end of a won boss fight; lowest HP = the lowest it fell during the fight. ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
if (fails.length) console.log('\nCONTRACT FAILURES:\n  ' + fails.join('\n  '));
else console.log('\nCONTRACT: all pass.');
if (JSON_OUT) {
  fs.mkdirSync(JSON_OUT.replace(/\/[^/]*$/, '') || '.', { recursive: true });
  // summaries only: every array of per-fight numbers becomes its mean (the raw arrays run to megabytes)
  const slim = JSON.parse(JSON.stringify(out, (k, v) => (k === 'logs' ? undefined
    : Array.isArray(v) && v.every((x) => typeof x === 'number') ? Math.round(1000 * mean(v)) / 1000 : v)));
  fs.writeFileSync(JSON_OUT, JSON.stringify({ ...slim, fails }, null, 1));
  console.log('json →', JSON_OUT);
}
process.exitCode = fails.length ? 1 : 0;
