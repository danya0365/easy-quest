// node --test tests/battle — SYSTEMS-BIBLE §1, §2, §6, §11 as tests. Worked examples are checked to the digit.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../../src/battle/formulas.js';
import {
  PERSONALITIES, FAMILY_PERSONALITIES, personalityAt, templateAt, MONSTER_TEMPLATES, EXP_TABLE, levelForExp, expToNext,
  learnsetFor, spellsKnownAt, spellsLearnedAt, newMember, statsFor, gainsAt, GUESTS, CHARACTERS,
} from '../../src/data/growth.js';
import { fixedRng } from './helpers.js';

test('§1.3 physical damage: the Toadstooligan worked example is 17', () => {
  // Bram Lv5: Might 20 + Copper Sword 11 = ATK 31 vs a Toadstooligan's DEF 9, variance roll 1.04 -> 16.53 -> 17
  const r = F.physicalDamage(31, 9, fixedRng({ float: 1.04 }));
  assert.equal(r.amount, 17);
  assert.equal(r.raw, 26.5);
});

test('§1.3 chip floor: a hit is never 0 (raw <= 3 gives 1..3)', () => {
  const rng = F.makeRng(5);
  for (let i = 0; i < 2000; i++) {
    const r = F.physicalDamage(rng.int(0, 12), rng.int(0, 60), rng);
    assert.ok(r.amount >= 1, 'zero is never printed');
    if (r.chip) assert.ok(r.amount <= 3);
  }
});

test('§1.2 derived values', () => {
  const d = F.derive({ hp: 44, mp: 8, might: 20, nimble: 15, resil: 19, wis: 10, luck: 14 }, { power: 11, def: 4 + 3, mdef: 0 });
  assert.deepEqual([d.atk, d.def, d.mag, d.mdef, d.spd, d.luck, d.maxHp], [31, 9 + 7, 10, 3, 15, 14, 44]);
});

test('§1.4 misses: hit-first, never two misses in a row', () => {
  assert.equal(F.playerMissChance({ evade: 0, luck: 8 }), 0);
  assert.ok(Math.abs(F.playerMissChance({ evade: 0.06, luck: 10 }) - 0.05) < 1e-9);
  assert.equal(F.playerMissChance({ evade: 0.06, luck: 0, lastMissed: true }), 0);
  assert.equal(F.playerMissChance({ evade: 0, luck: 100, blinded: true }), 0.25 - 0.03);
  assert.equal(F.enemyMissChance({ nimble: 30, lastMissed: true }), 0);
});

test('§1.5 crits: Lv1 ≈ 4.6%, capped at 16%, +3% at S>=40; enemies 1/64, never at S>=30', () => {
  assert.ok(Math.abs(F.critChance(8) - (0.031 + 8 / 512)) < 1e-12);
  assert.ok(Math.abs(F.critChance(8) - 0.0466) < 0.001);
  assert.equal(F.critChance(999), 0.16);
  assert.ok(Math.abs(F.critChance(999, 40) - 0.19) < 1e-12);
  assert.equal(F.enemyCritChance(0), 1 / 64);
  assert.equal(F.enemyCritChance(30), 0);
  // a crit always looks like a crit
  const rng = fixedRng({ float: 0.95 });
  const c = F.critDamage(40, 70, rng);
  assert.ok(c >= Math.round(F.avgNormalHit(40, 70) * 1.75) - 1);
});

test('§1.6 spell damage: the Kanip worked example is 45 and 98', () => {
  const kanip = { base: 40, k: 0.55 };
  assert.equal(F.spellDamage(kanip, 116, { elementMult: 0.5, mdef: 30 }, fixedRng({ float: 1.02 })).amount, 45);
  assert.equal(F.spellDamage(kanip, 116, { elementMult: 1, mdef: 10 }, fixedRng({ float: 0.99 })).amount, 98);
  const none = F.spellDamage(kanip, 116, { elementMult: 0, mdef: 10 }, fixedRng());
  assert.equal(none.noEffect, true);
  // MDEF reduction caps at 60%
  assert.equal(F.spellDamage({ base: 100, k: 0 }, 0, { mdef: 9999 }, fixedRng({ float: 1 })).amount, 40);
});

test('§1.7 healing: the Mendmore worked example is 83, never overheals', () => {
  const r = F.healAmount({ base: 45, k: 0.45 }, 80, 999, fixedRng({ float: 1.03 }));
  assert.equal(r.amount, 83);
  assert.equal(F.healAmount({ base: 45, k: 0.45 }, 80, 12, fixedRng({ float: 1.03 })).amount, 12);
});

test('§1.8 turn order: +10% player thumb, ties go to the player', () => {
  const rng = fixedRng({ float: 1 });
  assert.ok(Math.abs(F.initiative(20, true, rng) - 22) < 1e-9);
  assert.equal(F.initiative(20, false, rng), 20);
  const order = F.sortInitiative([{ init: 5, side: 'enemy' }, { init: 5, side: 'party' }, { init: 9, side: 'enemy' }]);
  assert.deepEqual(order.map((o) => o.side), ['enemy', 'party', 'enemy']);
});

test('§1.9 fleeing (balance pass r4): a coin toss on the first try, likelier each time, the fourth try always works', () => {
  // party Agi 26 vs two Grumbleglops (Agi 9): 0.30 + 0.40 * 26/35 = 0.597 (SYSTEMS §1.9 had 0.85, and sure on the 2nd)
  assert.ok(Math.abs(F.fleeChance(26, 9, 0) - (0.30 + 0.4 * 26 / 35)) < 1e-9);
  assert.ok(Math.abs(F.fleeChance(26, 9, 0) - 0.597) < 0.001);
  assert.ok(Math.abs(F.fleeChance(10, 10, 0) - 0.5) < 1e-9, 'as quick as the monsters: half the time');
  assert.ok(F.fleeChance(26, 9, 1) < 1 && F.fleeChance(26, 9, 1) > F.fleeChance(26, 9, 0));
  assert.ok(F.fleeChance(1, 1000, 0) >= 0.3, 'even a very slow party gets away three times in ten');
  assert.equal(F.fleeChance(1, 1000, 3), 1, 'the fourth try always works: never trapped');
});

test('§1.8 ambush: 6% party, 4% enemy; enemy ambush never at S>=25, on protected maps, or for bosses', () => {
  assert.equal(F.ambushRoll(fixedRng({ next: 0.03 })), 'party');
  assert.equal(F.ambushRoll(fixedRng({ next: 0.08 })), 'enemy');
  assert.equal(F.ambushRoll(fixedRng({ next: 0.08 }), { S: 25 }), null);
  assert.equal(F.ambushRoll(fixedRng({ next: 0.08 }), { protectedMap: true }), null);
  assert.equal(F.ambushRoll(fixedRng({ next: 0.03 }), { boss: true }), null);
  assert.equal(F.ambushRoll(fixedRng({ next: 0.5 })), null);
});

test('§2.1 one shared EXP table and the catch-up rule', () => {
  assert.equal(EXP_TABLE[1], 0); assert.equal(EXP_TABLE[2], 7); assert.equal(EXP_TABLE[13], 2120); assert.equal(EXP_TABLE[30], 59000);
  assert.equal(levelForExp(0), 1); assert.equal(levelForExp(6), 1); assert.equal(levelForExp(7), 2);
  assert.equal(levelForExp(59000), 30); assert.equal(levelForExp(9e9), 30);
  assert.equal(expToNext(1), 7); assert.equal(expToNext(20), 2350); assert.equal(expToNext(30), 0);
  // "To next" column of the table
  const toNext = [7, 16, 24, 45, 68, 100, 140, 190, 250, 330, 420, 530, 660, 820, 1000, 1200, 1450, 1700, 2000, 2350, 2750, 3200, 3700, 4250, 4850, 5550, 6300, 7100, 8000];
  toNext.forEach((n, i) => assert.equal(EXP_TABLE[i + 2] - EXP_TABLE[i + 1], n, `Lv${i + 1}`));
  assert.equal(F.catchUpMultiplier(10, 12), 1);
  assert.equal(F.catchUpMultiplier(9, 12), 2);
  assert.equal(F.catchUpMultiplier(6, 12), 3);
  assert.equal(F.catchUpMultiplier(1, 25), 3);
});

// SYSTEMS §2.3 — Alder (Bram) full table, verbatim.
const BRAM = `1 20 0 10 8 9 4 8|2 26 2 13 10 12 6 10|3 32 4 15 12 14 7 11|4 38 6 18 13 17 9 13|5 44 8 20 15 19 10 14|
6 52 11 23 17 22 12 16|7 59 14 26 19 25 14 17|8 67 16 29 22 27 16 19|9 74 19 32 24 30 18 20|10 82 22 35 26 33 20 22|
11 91 26 38 28 36 22 24|12 100 29 42 31 39 25 26|13 110 33 45 33 43 27 27|14 119 36 49 36 46 30 29|15 128 40 52 38 49 32 31|
16 139 44 56 41 53 35 33|17 150 49 60 43 56 38 35|18 160 53 64 46 60 40 37|19 171 58 68 48 63 43 39|20 182 62 72 51 67 46 41|
21 195 67 77 54 71 49 43|22 208 72 82 57 75 52 45|23 220 78 86 59 80 56 48|24 233 83 91 62 84 59 50|25 246 88 96 65 88 62 52|
26 261 94 102 68 93 66 54|27 276 100 107 71 98 69 57|28 290 106 113 74 102 73 59|29 305 112 118 77 107 76 62|30 320 118 124 80 112 80 64`;

test('§2.2/§2.3 growth: Bram (the Steady Oak) reproduces the full 30-level table from his anchors', () => {
  const rows = BRAM.replace(/\n/g, '').split('|').map((r) => r.trim().split(/\s+/).map(Number));
  assert.equal(rows.length, 30);
  for (const [L, hp, mp, might, nimble, resil, wis, luck] of rows) {
    assert.deepEqual(personalityAt('steady_oak', L), { hp, mp, might, nimble, resil, wis, luck }, `Lv${L}`);
  }
});

test('§2.4 growth: the other five personalities (and Queen Elowen\'s Lantern) hit their anchors exactly, gains are deterministic', () => {
  assert.deepEqual([...FAMILY_PERSONALITIES].sort(), ['boulder', 'firecracker', 'kite', 'prodigy', 'slow_bloom', 'steady_oak']);
  assert.deepEqual(personalityAt('lantern', 20), { hp: 110, mp: 150, might: 20, nimble: 50, resil: 40, wis: 120, luck: 70 });
  assert.deepEqual(personalityAt('lantern', 30), { hp: 170, mp: 240, might: 28, nimble: 66, resil: 56, wis: 170, luck: 90 });
  assert.equal(personalityAt('lantern', 25).wis, 145);
  assert.deepEqual(spellsKnownAt(newMember('elowen', 26)).sort(), ['fullmend', 'mend', 'mendall', 'mendmore', 'rouse']);
  assert.equal(personalityAt('firecracker', 15).hp, 105);
  assert.equal(personalityAt('slow_bloom', 18).wis, 66);
  assert.equal(personalityAt('slow_bloom', 18).luck, 76);
  assert.equal(personalityAt('boulder', 30).mp, 0);
  assert.equal(personalityAt('prodigy', 25).might, 110);
  assert.equal(personalityAt('kite', 20).wis, 116);
  const bram = newMember('hero', 12);
  assert.deepEqual(gainsAt(bram, 13), { hp: 10, mp: 4, might: 3, nimble: 2, resil: 4, wis: 2, luck: 1 });
  // the Firecracker is better than Bram all Act I; Rowan out-damages Willow from 22
  assert.ok(personalityAt('firecracker', 8).might > personalityAt('steady_oak', 8).might);
  assert.ok(personalityAt('prodigy', 22).might > personalityAt('firecracker', 22).might);
  // Guests are SYSTEMS §2.4 verbatim
  assert.deepEqual(GUESTS.halvard.stats, { hp: 260, mp: 40, might: 78, nimble: 40, resil: 70, wis: 45, luck: 30 });
  assert.deepEqual(GUESTS.bertie.stats, { hp: 90, mp: 0, might: 30, nimble: 12, resil: 34, wis: 8, luck: 40 });
  assert.deepEqual(statsFor(newMember('willow_child')), personalityAt('firecracker', 3), 'children use their own Lv 3 row');
  assert.deepEqual(statsFor(newMember('sera_child')), personalityAt('slow_bloom', 3));
  assert.equal(newMember('willow_grown', 18).lvl, 18, 'grown Willow joins at the party\'s level');
  assert.equal(newMember('bobble', 1).lvl, 1);
});

test('§2.5 a recruited monster is never better than the family member it displaces', () => {
  const src = { brute: ['boulder'], sprite: ['firecracker'], wisp: ['kite'], plodder: ['boulder', 'steady_oak'] };
  for (const t of Object.keys(MONSTER_TEMPLATES)) {
    for (const mult of [0.7, 1, 1.3]) {
      for (let L = 1; L <= 30; L++) {
        const s = templateAt(t, L, mult);
        for (const k of Object.keys(s)) {
          const cap = Math.max(...src[t].map((p) => personalityAt(p, L)[k]));
          assert.ok(s[k] <= cap || (k === 'hp' && cap <= 1), `${t} x${mult} Lv${L} ${k} ${s[k]} > ${cap}`);
        }
      }
    }
  }
  assert.ok(statsFor(newMember('bobble', 10)).hp > statsFor(newMember('hero', 10)).hp * 0.9, 'Plodder = flat, huge HP');
});

test('§3 learnsets use CANON spell names, and the mother\'s gift moves the lines 3 levels earlier', () => {
  const ids = new Set(Object.values(CHARACTERS).flatMap((c) => c.learn.map(([s]) => s)));
  for (const retired of ['flick', 'flicker', 'kaflick', 'zizzle', 'lullaby', 'dither', 'unbind', 'mendy', 'frostle', 'kanipper', 'shielda']) {
    assert.ok(!ids.has(retired), `retired spell ${retired}`);
  }
  assert.deepEqual(spellsLearnedAt(newMember('hero', 3), 4).map((s) => s.id), ['mend']);
  assert.deepEqual(spellsKnownAt(newMember('sera', 1)), ['mend']);
  const rowanW = newMember('rowan', 1, { mother: 'willow' });
  const rowanS = newMember('rowan', 1, { mother: 'sera' });
  const find = (m, id) => (learnsetFor(m).find(([s]) => s === id) || [])[1];
  assert.equal(find(newMember('rowan', 1), 'scorcha'), 6);
  assert.equal(find(rowanW, 'scorcha'), 3);
  assert.equal(find(rowanW, 'whistle_down'), 10);
  assert.equal(find(rowanS, 'whistle_down'), undefined);
  assert.equal(find(rowanS, 'mend'), 1);
  assert.equal(find(newMember('linnet', 1, { mother: 'sera' }), 'rouse'), 16);
  assert.equal(find(newMember('linnet', 1, { mother: 'sera' }), 'mendall'), undefined, 'the gift only moves spells she learns');
  assert.equal(find(newMember('rowan', 1, { mother: 'sera' }), 'mendmore'), 12);
  assert.equal(find(newMember('willow', 1), 'whistle_down'), 10);
  assert.equal(find(newMember('rowan', 1), 'kazapple'), 27);
  assert.equal(find(newMember('rowan', 1), 'zapple'), 18);
  assert.equal(find(newMember('linnet', 1, { mother: 'willow' }), 'kascorcha'), 16);
  assert.equal(find(newMember('linnet', 1), 'rouse'), undefined);
  assert.deepEqual(learnsetFor(newMember('barty', 20)).find(([s]) => s === 'bluster')[2], { mp: 0, name: 'Bluster (a shout)' });
});

test('§6.2 defeat gold: half, never below 30', () => {
  assert.equal(F.defeatGold(1000), 500);
  assert.equal(F.defeatGold(61), 30);
  assert.equal(F.defeatGold(50), 30);
  assert.equal(F.defeatGold(0), 30);
});

test('§6.3 Big Attack caps: 55% of expected max HP, first use never knocks anyone out, 45% at S>=75', () => {
  assert.equal(F.bigAttackCap(500, { expectedMaxHP: 200, currentHP: 999, firstUse: false }), 110);
  assert.equal(F.bigAttackCap(500, { expectedMaxHP: 200, currentHP: 100, firstUse: true }), 80);
  assert.equal(F.bigAttackCap(500, { expectedMaxHP: 200, currentHP: 999, firstUse: false, S: 75 }), 90);
  assert.equal(F.BIG_ATTACK_COOLDOWN, 3);
});

test('§6.4 rubber band: effects by S and the score deltas', () => {
  const e0 = F.assistEffects(0), e60 = F.assistEffects(60), e75 = F.assistEffects(75);
  assert.equal(e0.enemyVarMax, 1.12); assert.equal(F.assistEffects(15).enemyVarMax, 1.0);
  assert.equal(F.assistEffects(25).noEnemyAmbush, true); assert.equal(F.assistEffects(25).herbDropMult, 1.5);
  assert.equal(F.assistEffects(30).noEnemyCrit, true); assert.equal(F.assistEffects(29).noEnemyCrit, false);
  assert.equal(F.assistEffects(40).enemyStatusMult, 0.75);
  assert.equal(e60.secondWind, true); assert.equal(e0.secondWind, false);
  assert.equal(e75.rewardMult, 1.2); assert.equal(e75.bigCapPct, 0.45);
  assert.equal(F.assistDelta({ outcome: 'defeat', rounds: 3 }), 12);
  assert.equal(F.assistDelta({ outcome: 'victory', koCount: 1, rounds: 9 }), 10);
  assert.equal(F.assistDelta({ outcome: 'fled', boss: false, rounds: 1 }), 3);
  // fleeing wakes the rubber band, it cannot max it out
  assert.equal(F.assistDelta({ outcome: 'fled', boss: false, rounds: 1 }, 28), 2);
  assert.equal(F.assistDelta({ outcome: 'fled', boss: false, rounds: 1 }, 30), 0);
  assert.equal(F.assistDelta({ outcome: 'fled', boss: false, rounds: 9 }, 60), 4, 'a long fight still counts');
  assert.equal(F.assistDelta({ outcome: 'defeat', rounds: 3 }, 60), 12, 'a wipe still counts');
  assert.equal(F.assistDelta({ outcome: 'victory', boss: true, levelsGained: 1, nobodyBelow60: true, rounds: 5 }), -8);
  assert.equal(F.applyAssist(3, -8), 0);
  assert.equal(F.applyAssist(95, 12), 100);
});

test('MONSTER §7 befriending odds', () => {
  assert.equal(F.recruitChance({ base: 1 / 8, kidMode: true, heroLvl: 2, monsterLvl: 2 }), 0.25);
  assert.equal(F.recruitChance({ base: 1 / 8, kidMode: false, heroLvl: 2, monsterLvl: 2 }), 0.125);
  assert.equal(F.recruitChance({ base: 1 / 6, kidMode: true, heroLvl: 30, monsterLvl: 1, charmBell: true }), 0.5);
  assert.ok(Math.abs(F.recruitChance({ base: 1 / 64, kidMode: true, heroLvl: 1, monsterLvl: 40 }) - (1 / 64) * 2 * 0.6) < 1e-12);
  assert.equal(F.recruitChance({ base: 1 / 8, kidMode: false, heroLvl: 2, monsterLvl: 2, duplicate: true }), 1 / 16);
  assert.equal(F.recruitChance({ base: 0 }), 0);
});

test('makeRng is deterministic and serialisable', () => {
  const a = F.makeRng(123), b = F.makeRng(123);
  const xs = Array.from({ length: 50 }, () => a.next());
  assert.deepEqual(xs, Array.from({ length: 50 }, () => b.next()));
  const st = a.state; const n1 = a.next(); a.state = st; assert.equal(a.next(), n1);
  assert.notDeepEqual(F.makeRng(1).next(), F.makeRng(2).next());
  const c = F.makeRng(() => 0.25); assert.equal(c.int(1, 4), 2);
});
