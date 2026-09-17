// node --test tests/battle — the battle rules engine (P14): contract, determinism, every event type, wagon,
// flee, befriending, level-ups and the difficulty contract (SYSTEMS §6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle } from '../../src/battle/battle.js';
import { EXP_TABLE } from '../../src/data/growth.js';
import { DATA, newMember, heroAt, runToEnd, battle, types } from './helpers.js';
import { AREAS, rollEncounter } from './areas.js';
import { makeRng, expKeel, scaleMonster } from '../../src/battle/formulas.js';
import { normalizeMonster } from '../../src/battle/battle.js';
import { spawnSync } from 'node:child_process';

const kidParty = () => [heroAt(5), newMember('willow_child'), newMember('sera_child'), newMember('bobble', 5)];

// ------------------------------------------------------------------------------------------------ contract
test('contract: phases, needsCommand, command, undoCommand, resolveRound, snapshot', () => {
  const b = battle({ party: [heroAt(3), newMember('bobble', 3)], enemies: ['gloop', 'gloop'] });
  assert.equal(b.phase, 'command');
  assert.equal(b.opening[0].t, 'appear');
  assert.equal(b.opening[0].text, 'Two Gloops draw near!');
  assert.equal(b.needsCommand().id, 'hero');
  assert.deepEqual(b.command('hero', { type: 'attack', target: 'e1' }), { ok: true, next: 'bobble' });
  assert.equal(b.needsCommand().id, 'bobble');
  assert.equal(b.undoCommand().actor.id, 'hero');
  assert.equal(b.needsCommand().id, 'hero');
  b.command('hero', { type: 'attack', target: 'e2' });
  b.command('bobble', { type: 'defend' });
  assert.equal(b.needsCommand(), null);
  const ev = b.resolveRound();
  assert.equal(ev[0].t, 'round');
  assert.ok(ev.some((e) => e.t === 'act' && e.actor === 'hero'));
  assert.ok(['command', 'victory'].includes(b.phase));
  const snap = b.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap, 'snapshot is serialisable');
  assert.equal(snap.party.length, 2);
  assert.equal(snap.enemies[0].name, 'Gloop A');
  assert.equal(snap.assist.s, 0);
});

test('contract: bad commands are refused with a reason and a kind sentence, never thrown', () => {
  const b = battle({ party: [heroAt(3, { weapon: 'copper_sword' }, { hp: 38 })], enemies: ['gloop'], options: { bag: { herb: 1 } } });
  assert.equal(b.command('nobody', { type: 'attack' }).ok, false);
  assert.equal(b.command('hero', { type: 'dance' }).reason, 'type');
  const spell = b.command('hero', { type: 'spell', id: 'kascorcha' });
  assert.equal(spell.ok, false); assert.equal(spell.reason, 'unknown');
  const herb = b.command('hero', { type: 'item', id: 'herb', target: 'hero' });
  assert.equal(herb.ok, false); assert.equal(herb.reason, 'full');
  assert.match(herb.text, /already in the pink/);
  const swap = b.command('hero', { type: 'swap', target: 'bobble' });
  assert.equal(swap.ok, false);
});

// ------------------------------------------------------------------------------------------------ determinism
test('determinism: the same seed gives the same battle, event for event', () => {
  const run = (seed) => {
    const b = createBattle({ party: kidParty(), enemies: ['toadstooligan', 'boohoo', 'flapjack'], data: DATA, rng: seed, options: { bag: { herb: 3 } } });
    runToEnd(b, 'smart');
    return JSON.stringify({ log: b.log, result: b.result });
  };
  assert.equal(run(777), run(777));
  assert.notEqual(run(777), run(778));
});

test('determinism: a shared rng object continues its sequence across battles', () => {
  const go = () => {
    const rng = makeRng(99);
    const out = [];
    for (let i = 0; i < 5; i++) {
      const b = createBattle({ party: [heroAt(4), newMember('halvard')], enemies: ['crabbit', 'crabbit'], data: DATA, rng });
      runToEnd(b, 'auto');
      out.push(b.result.rounds, b.log.length);
    }
    return out.join(',');
  };
  assert.equal(go(), go());
});

// ------------------------------------------------------------------------------------------------ events
test('events: appear, ambush (both sides), round, act, damage, defeat, victory, levelup, end', () => {
  const p = battle({ party: [heroAt(3)], enemies: ['peckish'], options: { ambush: 'party' } });
  assert.equal(p.opening[1].t, 'ambush'); assert.equal(p.opening[1].text, "You've caught them napping!");
  const ev = p.resolveRound();
  assert.ok(!ev.some((e) => e.t === 'act' && e.actor && e.actor.startsWith('e')), 'enemies do not act in the free round');

  const e = createBattle({ party: [heroAt(3)], enemies: ['peckish', 'peckish'], data: DATA, rng: 3, options: { ambush: 'enemy' } });
  assert.equal(e.opening[1].text, 'They came out of nowhere!');
  assert.ok(e.opening.some((x) => x.t === 'act' && x.actor.startsWith('e')), 'enemy free round resolved in the opening');
  assert.equal(e.phase, 'command');

  const hero = newMember('hero', 3, { exp: EXP_TABLE[4] - 1, equip: { weapon: 'copper_sword' } });
  const b = battle({ party: [hero], enemies: ['gloop'] });
  runToEnd(b, 'mash');
  const t = types(b.log);
  for (const k of ['appear', 'round', 'act', 'damage', 'defeat', 'victory', 'levelup', 'end']) assert.ok(t.has(k), k);
  const lvl = b.log.find((x) => x.t === 'levelup');
  assert.equal(lvl.level, 4); assert.equal(lvl.from, 3);
  assert.equal(lvl.text, "Bram's level has gone up to 4!");
  assert.deepEqual(lvl.learned.map((s) => s.id), ['mend'], 'level-up with a learned spell');
  assert.match(lvl.lines.at(-1), /has learnt Mend! It tingles all the way to the elbows\./);
  assert.deepEqual(lvl.gainsOrdered.map((g) => g.key), ['hp', 'mp', 'might', 'nimble', 'resil', 'wis', 'luck']);
  assert.deepEqual(lvl.gains, { hp: 6, mp: 2, might: 3, nimble: 1, resil: 3, wis: 2, luck: 2 });
  assert.equal(lvl.gainsOrdered[0].total, 38);
  const out = b.result.party[0];
  assert.equal(out.lvl, 4);
  assert.ok(b.snapshot().party[0].spells.includes('mend'));
  const v = b.log.find((x) => x.t === 'victory');
  const g = DATA.monsters.gloop;
  assert.deepEqual(v.lines.slice(0, 3), ['Victory!', `The party gains ${g.exp} experience points.`, `...and ${g.gold} gold coins.`]);
  assert.ok(b.log.indexOf(v) < b.log.indexOf(lvl), 'victory tally before level-ups');
});

test('events: crit ("A terrific whack!") and miss (VOICE atk.miss), never two misses in a row', () => {
  let crit = null, miss = null;
  for (let seed = 1; seed < 400 && !(crit && miss); seed++) {
    const b = createBattle({ party: [heroAt(20, { weapon: 'steel_sword' })], enemies: ['flapjack', 'flapjack', 'flapjack'], data: DATA, rng: seed, options: { ambush: 'none' } });
    runToEnd(b, 'mash');
    crit ||= b.log.find((e) => e.t === 'damage' && e.crit);
    miss ||= b.log.find((e) => e.t === 'damage' && e.miss && e.reason === 'miss' && e.side === 'enemy');
  }
  assert.ok(crit, 'a crit happened'); assert.match(crit.text, /^A terrific whack! \d+ damage to Flapjack [ABC]!$/);
  assert.ok(miss, 'a miss happened'); assert.equal(miss.text, 'Bram swings at the air. The air is unharmed.');
  // never two misses in a row, across a big sample
  for (let seed = 1; seed < 150; seed++) {
    const b = createBattle({ party: [heroAt(20, { weapon: 'steel_sword' }), newMember('willow', 20, { equip: { weapon: 'sling' } })], enemies: ['flapjack', 'flapjack', 'flapjack'], data: DATA, rng: seed, options: { ambush: 'none' } });
    runToEnd(b, 'mash');
    const last = {};
    for (const e of b.log) {
      if (e.t !== 'damage' || e.side !== 'enemy' || !e.actor || e.poison) continue;
      const missed = e.miss && e.reason === 'miss';
      assert.ok(!(missed && last[e.actor]), `two misses in a row by ${e.actor} (seed ${seed})`);
      last[e.actor] = missed;
    }
  }
});

test('events: zero damage is never printed', () => {
  const rng = makeRng(4242);
  for (const area of AREAS) {
    for (let i = 0; i < 25; i++) {
      const b = createBattle({ party: area.party(area.levels[0]), enemies: rollEncounter(area, rng, DATA.monsters), data: DATA, rng, options: { bag: { ...(area.bag || {}) } } });
      runToEnd(b, i % 2 ? 'mash' : 'smart');
      for (const e of b.log) {
        if (e.t === 'damage' && !e.miss) assert.ok(e.amount >= 1 || e.target && b.log.some((x) => x.t === 'second_wind'), `${area.id}: ${e.text}`);
        if (e.text) assert.doesNotMatch(e.text, /\b0 damage\b|\bdied\b|\bdead\b|game over/i, e.text);
      }
      assert.equal(b.errors.length, 0, b.errors.join('\n'));
    }
  }
});

test('events: spells — damage, heal, heal refused at full (no MP spent), revive, buff, debuff, sleep, root, cure', () => {
  const sera = newMember('sera', 20);
  const bram = heroAt(20, { weapon: 'steel_sword' }, { hp: 60 });
  const willow = newMember('willow', 21);
  const b = battle({ party: [bram, sera, willow], enemies: ['cactuddle', 'cactuddle'] });
  const full = b.command('sera', { type: 'spell', id: 'mend', target: 'sera' });
  assert.equal(full.ok, false); assert.match(full.text, /Sera is already in the pink!/);
  assert.equal(b.snapshot().party[1].mp, sera.mp, 'no MP lost for the refusal');
  assert.ok(b.command('hero', { type: 'spell', id: 'bolster' }).ok);
  assert.ok(b.command('sera', { type: 'spell', id: 'mendmore', target: 'hero' }).ok);
  assert.ok(b.command('willow', { type: 'spell', id: 'snoozle' }).ok);
  const ev = b.resolveRound();
  assert.ok(ev.some((e) => e.t === 'heal' && e.target === 'hero' && e.amount > 0 && /Bram recovers \d+ HP!/.test(e.text)));
  assert.ok(ev.some((e) => e.t === 'status' && e.status === 'def_up' && e.on));
  assert.ok(ev.some((e) => e.t === 'status' && (e.status === 'sleep' || e.resisted)));

  const c = battle({ party: [newMember('linnet', 20, { hp: 100 }), newMember('willow', 21)], enemies: ['sir_cumference'], options: { S: 0 } });
  c.command('linnet', { type: 'spell', id: 'wobble', target: 'e1' });
  c.command('willow', { type: 'spell', id: 'tanglefoot', target: 'e1' });
  const ev2 = c.resolveRound();
  assert.ok(ev2.some((e) => e.t === 'status' && (e.status === 'def_down' || e.resisted)));
  assert.ok(ev2.some((e) => e.t === 'status' && (e.status === 'root' || e.resisted)));

  // Rouse always works on a worn-out friend
  const d = battle({ party: [heroAt(20, {}, { hp: 0 }), newMember('sera', 20)], enemies: ['gloop'] });
  assert.equal(d.needsCommand().id, 'sera');
  assert.ok(d.command('sera', { type: 'spell', id: 'rouse', target: 'hero' }).ok);
  const ev3 = d.resolveRound();
  const rev = ev3.find((e) => e.t === 'revive');
  assert.ok(rev); assert.equal(rev.target, 'hero'); assert.ok(rev.hp >= 1);

  // cure
  const p = newMember('sera', 20); const poisoned = heroAt(10, {}, { status: { poison: 99 } });
  const e = battle({ party: [poisoned, p], enemies: ['gloop'] });
  e.command('hero', { type: 'defend' });
  e.command('sera', { type: 'spell', id: 'sweeten', target: 'hero' });
  const ev4 = e.resolveRound();
  assert.ok(ev4.some((x) => x.t === 'status' && x.cured && x.cured.includes('poison')));
});

test('events: "It has no effect at all!" refunds half the MP', () => {
  const lin = newMember('linnet', 20);
  const b = battle({ party: [lin], enemies: ['hoarfax'] });
  const before = b.snapshot().party[0].mp;
  b.command('linnet', { type: 'spell', id: 'nip', target: 'e1' });
  const ev = b.resolveRound();
  const no = ev.find((e) => e.t === 'damage' && e.reason === 'immune');
  assert.ok(no); assert.equal(no.text, 'It has no effect at all!');
  const after = b.snapshot().party[0].mp;
  assert.equal(before - after, 3 - Math.floor(3 / 2));
});

test('events: items — Herb heals and is used up; Angel\'s Kiss revives; Sunbottle burns everyone', () => {
  const b = battle({ party: [heroAt(5, {}, { hp: 10 }), newMember('bobble', 5, { hp: 0 })], enemies: ['gloop', 'gloop'], options: { bag: { herb: 1, angels_kiss: 1, sunbottle: 1 } } });
  assert.ok(b.command('hero', { type: 'item', id: 'herb', target: 'hero' }).ok);
  let ev = b.resolveRound();
  assert.ok(ev.some((e) => e.t === 'act' && e.kind === 'item' && e.text === 'Bram uses the Herb.'));
  assert.ok(ev.some((e) => e.t === 'heal' && e.target === 'hero'));
  assert.equal(b.snapshot().bag.herb, undefined);
  if (b.over) return;
  assert.ok(b.command('hero', { type: 'item', id: 'angels_kiss', target: 'bobble' }).ok);
  ev = b.resolveRound();
  assert.ok(ev.some((e) => e.t === 'revive' && e.target === 'bobble'));
  const c = battle({ party: [heroAt(5)], enemies: ['gloop', 'gloop'], options: { bag: { sunbottle: 1 } } });
  c.command('hero', { type: 'item', id: 'sunbottle' });
  ev = c.resolveRound();
  assert.equal(ev.filter((e) => e.t === 'damage' && e.side === 'enemy' && e.element === 'fire').length, 2);
});

test('events: monster moves — status, steal (and the gold comes back), summon, swallow, flee, fx, phase, reorder', () => {
  const statusSeen = new Set(), seen = new Set();
  for (let seed = 1; seed < 60; seed++) {
    const party = () => [heroAt(14, { weapon: 'wooden_sword', armour: 'iron_armour' }), newMember('barty', 14, { equip: { armour: 'iron_armour' } })];
    const fights = [
      // wild monsters met where a Lv 14 party meets them (encounter-table level), bosses as they are
      [{ id: 'chestnut', partyLevel: 14 }], [{ id: 'barrowmole', partyLevel: 14 }], ['bogwallop'], ['sexton_sootbell'],
      [{ id: 'jinglebottom', partyLevel: 14 }, { id: 'jinglebottom', partyLevel: 14 }], ['mumbleroot'],
      [{ id: 'grumbleglop', partyLevel: 14 }, { id: 'crabbit', partyLevel: 14 }, { id: 'toadstooligan', partyLevel: 14 }],
      [{ id: 'gloopold', partyLevel: 14 }], ['glimmergloop'],
    ];
    for (const f of fights) {
      const b = createBattle({ party: party(), enemies: f, data: DATA, rng: seed, options: { ambush: 'none', gold: 500 } });
      runToEnd(b, 'auto', 40);
      for (const e of b.log) { seen.add(e.t); if (e.t === 'status' && e.on) statusSeen.add(e.status); }
      assert.equal(b.errors.length, 0, b.errors.join('\n'));
    }
  }
  for (const k of ['steal', 'summon', 'flee', 'fx', 'phase', 'telegraph', 'reorder', 'status', 'heal']) assert.ok(seen.has(k), `saw ${k}`);
  for (const s of ['hiccup', 'dazzle', 'swallowed', 'root', 'sleep']) assert.ok(statusSeen.has(s), `status ${s}`);
});

test('events: phases (Mortmain becomes Enfolded, two actions), transform (the Cocoon breaks open), spared (Mortmain kneels; Hoarfax sits; Malgrim lets go)', () => {
  const party = () => [heroAt(30, { weapon: 'halvards_greatsword', armour: 'gleaming_plate', shield: 'dragon_scale_shield', helm: 'wide_awake_crown' }),
    newMember('rowan', 30, { equip: { weapon: 'larksteel_sword', armour: 'gleaming_plate', shield: 'larksteel_shield', helm: 'larksteel_helm' } }),
    newMember('linnet', 30, { equip: { weapon: 'ash_staff', armour: 'larkweave_cloak' } }), newMember('sera', 30)];
  const a = createBattle({ party: party(), enemies: ['mortmain'], data: DATA, rng: 11, options: { ambush: 'none' } });
  runToEnd(a, 'smart', 120);
  const ph = a.log.find((e) => e.t === 'phase' && e.index === 0);
  assert.ok(ph && /bat's face/.test(ph.text));
  assert.equal(a.snapshot().enemies[0].name, 'Mortmain Enfolded');
  const after = a.log.slice(a.log.indexOf(ph));
  const r = after.find((e) => e.t === 'round');
  if (r) {
    const inRound = after.slice(after.indexOf(r) + 1, after.findIndex((e, i) => i > after.indexOf(r) && e.t === 'round'));
    assert.ok(inRound.filter((e) => (e.t === 'act' || e.t === 'telegraph') && e.actor === 'e1').length <= 2);
  }
  assert.equal(a.phase, 'victory');
  assert.ok(a.log.some((e) => e.t === 'spared' && /ordinary, very old man/.test(e.text)), 'Mortmain is not killed');
  assert.ok(!a.log.some((e) => e.t === 'defeat' && e.side === 'enemy'));
  assert.equal(a.result.exp, Math.round(DATA.monsters.mortmain.exp * expKeel(30, DATA.monsters.mortmain.partyLevel)),
    'boss EXP goes through the keel: a Lv 30 party earns a fifth of it');

  const c = createBattle({ party: party(), enemies: ['malgrim_cocoon'], data: DATA, rng: 3, options: { ambush: 'none' } });
  runToEnd(c, 'smart', 160);
  assert.ok(c.log.some((e) => e.t === 'transform' && e.into === 'malgrim_unravelling'));

  const h = createBattle({ party: party(), enemies: ['hoarfax'], data: DATA, rng: 5, options: { ambush: 'none', recruit: { enabled: true, misses: { hoarfax: 12 } } } });
  runToEnd(h, 'smart', 80);
  const sp = h.log.find((e) => e.t === 'spared');
  assert.ok(sp); assert.match(sp.text, /sneezes/);
  assert.ok(!h.log.some((e) => e.t === 'defeat' && e.side === 'enemy'), 'Hoarfax does not die');
  assert.ok(h.log.some((e) => e.t === 'recruit_offer' && e.monster.species === 'hoarfax'), 'and may ask to join');

  const m = createBattle({ party: party(), enemies: ['malgrim_unravelling'], data: DATA, rng: 2, options: { ambush: 'none' } });
  runToEnd(m, 'smart', 120);
  assert.equal(m.phase, 'victory');
  assert.ok(m.log.some((e) => e.t === 'spared' && /lets go/.test(e.text)));
});

// ------------------------------------------------------------------------------------------------ wagon
test('wagon: swapping costs the turn, the newcomer acts next round, and it greys out with a reason when the wagon cannot follow', () => {
  const party = [heroAt(10), newMember('bobble', 10), newMember('pip', 10)];
  const wagon = [newMember('digby', 10)];
  const b = battle({ party, wagon, enemies: ['twiglet', 'twiglet', 'twiglet'] });
  assert.equal(b.needsCommand().canSwap.ok, true);
  assert.ok(b.command('hero', { type: 'attack' }).ok);
  assert.ok(b.command('bobble', { type: 'swap', target: 'digby' }).ok);
  assert.ok(b.command('pip', { type: 'attack' }).ok);
  const ev = b.resolveRound();
  const sw = ev.find((e) => e.t === 'swap');
  assert.deepEqual([sw.out, sw.in, sw.text], ['bobble', 'digby', 'Bobble climbs down. Digby climbs up.']);
  assert.ok(!ev.some((e) => e.t === 'act' && (e.actor === 'digby' || e.actor === 'bobble')), 'neither acts on the swap round');
  const snap = b.snapshot();
  assert.deepEqual(snap.party.map((p) => p.id), ['hero', 'digby', 'pip']);
  assert.deepEqual(snap.wagon.map((p) => p.id), ['bobble']);
  if (!b.over) {
    assert.ok(b.command('hero', { type: 'attack' }).ok);
    assert.equal(b.needsCommand().id, 'digby', 'the newcomer can act next round');
  }

  const cave = battle({ party: [heroAt(10)], wagon: [newMember('digby', 10)], enemies: ['gloop'], options: { wagonReachable: false } });
  const r = cave.command('hero', { type: 'swap', target: 'digby' });
  assert.equal(r.ok, false);
  assert.equal(r.text, "The wagon's outside, waiting in the rain.");
  assert.equal(cave.needsCommand().canSwap.text, "The wagon's outside, waiting in the rain.");
});

test('wagon: a party beyond four rides in the wagon, earns full EXP, and jumps down if the front line falls', () => {
  const party = [heroAt(10, {}, { hp: 1 }), newMember('bobble', 10, { hp: 1 }), newMember('pip', 10), newMember('digby', 10), newMember('barty', 4)];
  const b = battle({ party, enemies: ['glimmergloop'] });
  const snap = b.snapshot();
  assert.equal(snap.party.length, 4); assert.equal(snap.wagon[0].id, 'barty');
  const c = createBattle({ party: [heroAt(3, {}, { hp: 1 })], wagon: [newMember('bobble', 30)], data: DATA, rng: 8, enemies: ['boulderdash'], options: { ambush: 'enemy', normalHitCap: null } });
  const all = c.opening.concat(runToEnd(c, 'mash').log);
  const auto = all.find((e) => e.t === 'swap' && e.auto);
  assert.ok(auto, 'wagon member jumps down'); assert.equal(auto.text, 'Bobble jumps down from the wagon!');
  assert.notEqual(c.phase, 'defeat');

  const d = battle({ party: [heroAt(10, { weapon: 'steel_sword' })], wagon: [newMember('barty', 4)], enemies: ['gloop'] });
  runToEnd(d, 'mash');
  const barty = d.result.wagon.find((m) => m.id === 'barty');
  assert.equal(barty.exp, EXP_TABLE[4] + DATA.monsters.gloop.exp * 3, 'wagon earns full EXP with the x3 catch-up (6 levels behind)');
});

// ------------------------------------------------------------------------------------------------ flee
test('flee: success ends the battle; failures soften the next blows; the third try always works', () => {
  let ok = null, failed = null;
  for (let seed = 1; seed < 300 && !(ok && failed); seed++) {
    const b = createBattle({ party: [heroAt(2, {}, { hp: 30 })], enemies: ['flapjack', 'flapjack', 'flapjack'], data: DATA, rng: seed, options: { ambush: 'none' } });
    b.command('hero', { type: 'flee' });
    const ev = b.resolveRound();
    if (b.phase === 'fled') ok ||= ev.find((e) => e.t === 'flee' && e.ok);
    else failed ||= { b, ev };
  }
  assert.equal(ok.text, 'Everybody runs. Nobody mentions it again.');
  assert.ok(failed, 'a flee failed at least once');
  assert.equal(failed.ev.find((e) => e.t === 'flee').text, 'Bram turns to run, thinks about it, and turns back.');
  assert.ok(!failed.ev.some((e) => e.t === 'act' && e.actor === 'hero'), 'a failed flee costs the party\'s turn');
  const b = failed.b;
  let tries = b._internal.fleeFails;
  while (!b.over && tries < 2) {
    b.command('hero', { type: 'flee' });
    b.resolveRound();
    tries = b._internal.fleeFails;
    if (b.phase === 'fled') break;
  }
  if (!b.over) { b.command('hero', { type: 'flee' }); b.resolveRound(); }
  assert.ok(b.phase === 'fled' || b.phase === 'defeat');
  assert.equal(b.result.outcome, b.phase);
  if (b.phase === 'fled') assert.equal(b.result.assist.delta >= 3, true, 'fleeing a normal battle nudges S by +3');
});

test('flee: bosses refuse with a joke and the child loses no turn; scripted fights say so', () => {
  const b = battle({ party: [heroAt(12)], enemies: ['bogwallop'] });
  const r = b.command('hero', { type: 'flee' });
  assert.equal(r.ok, false); assert.equal(r.reason, 'boss');
  assert.ok(r.text.length > 10);
  assert.equal(b.needsCommand().id, 'hero', 'no turn lost');
  const s = b.command('hero', { type: 'spell', id: 'scarper' });
  assert.equal(s.ok, false);
  const m = battle({ party: [heroAt(8)], enemies: ['mumbleroot'] });
  assert.match(m.command('hero', { type: 'flee' }).text, /nowhere to run but forward/);
});

// ------------------------------------------------------------------------------------------------ befriending
test('recruit offer: after the tally, before level-ups; never before the wagon; 13th time guaranteed', () => {
  const off = battle({ party: [heroAt(5)], enemies: ['gloop'] });
  runToEnd(off, 'mash');
  assert.ok(!off.log.some((e) => e.t === 'recruit_offer'));
  assert.equal(off.result.recruit, null);

  const hero = newMember('hero', 4, { exp: EXP_TABLE[5] - 1, equip: { weapon: 'copper_sword' } });
  const b = battle({ party: [hero], enemies: ['cactuddle'], options: { recruit: { enabled: true, kidMode: true, misses: { cactuddle: 12 } } } });
  b._internal.party[0].atk = 999;
  runToEnd(b, 'mash');
  const offer = b.log.find((e) => e.t === 'recruit_offer');
  assert.ok(offer);
  assert.equal(offer.monster.species, 'cactuddle');
  assert.equal(offer.text, 'The Cactuddle wants to be your friend!');
  assert.equal(offer.ask, 'Shall it come along?');
  assert.match(offer.joinLine, /Nobody's ever not run away before/);
  const iV = b.log.findIndex((e) => e.t === 'victory'), iR = b.log.indexOf(offer), iL = b.log.findIndex((e) => e.t === 'levelup');
  assert.ok(iV < iR && iR < iL, 'fanfare → tally → monster asks to join → level-ups');
  assert.equal(b.result.recruit.state.misses.cactuddle, 0);
  assert.equal(b.result.recruit.state.battlesSinceRecruit, 0);

  // misses accumulate when nobody asks
  let misses = 0;
  const state = { enabled: true, kidMode: false, misses: {}, battlesSinceRecruit: 0 };
  for (let seed = 1; seed <= 20; seed++) {
    const c = createBattle({ party: [heroAt(30, { weapon: 'steel_sword' })], enemies: ['glimmergloop'], data: DATA, rng: seed, options: { ambush: 'none', recruit: state } });
    c._internal.enemies[0].moves = c._internal.enemies[0].moves.filter((m) => m.kind !== 'flee');
    runToEnd(c, 'mash');
    if (c.result && c.result.recruit && !c.result.recruit.offer) {
      Object.assign(state, c.result.recruit.state);
      misses = state.misses.glimmergloop;
    }
  }
  assert.ok(misses >= 1 && misses <= 20);
});

test('recruit: only one monster asks per battle, rarest first', () => {
  const b = battle({ party: [heroAt(30, { weapon: 'steel_sword' })], enemies: ['gloop', 'sir_gloopalot', 'cactuddle'],
    options: { recruit: { enabled: true, misses: { gloop: 12, sir_gloopalot: 12, cactuddle: 12 } } } });
  runToEnd(b, 'mash');
  const offers = b.log.filter((e) => e.t === 'recruit_offer');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].monster.species, 'sir_gloopalot', '1/32 is rarer than 1/8 and 1/6, so it is rolled first');
});

// ------------------------------------------------------------------------------------------------ difficulty contract
test('§6.2 defeat is gentle: half gold (floor 30), EXP kept, the word is never "Game Over"', () => {
  const b = battle({ party: [heroAt(1, { weapon: 'wooden_sword' }, { hp: 3 })], enemies: ['gloop', 'toadstooligan', 'toadstooligan'], options: { gold: 90, normalHitCap: null } });
  runToEnd(b, 'mash');
  assert.equal(b.phase, 'defeat');
  const w = b.log.find((e) => e.t === 'wipe');
  assert.equal(w.goldBefore, 90); assert.equal(w.goldAfter, 45);
  assert.deepEqual(w.lines, ['You are dreaming of somewhere warm. Somebody is carrying you.', 'You wake on a church bench. Your purse is lighter. You are not.']);
  assert.equal(w.wakeAt, 'church');
  assert.equal(b.result.outcome, 'defeat'); assert.equal(b.result.goldAfter, 45);
  assert.equal(b.result.assist.delta >= 12, true);
  const poor = battle({ party: [heroAt(1, {}, { hp: 1 })], enemies: ['toadstooligan', 'toadstooligan', 'toadstooligan'], options: { gold: 40, normalHitCap: null } });
  runToEnd(poor, 'mash');
  if (poor.phase === 'defeat') assert.equal(poor.result.goldAfter, 30);
});

test('§6.2 EXP earned before a wipe is kept', () => {
  for (let seed = 1; seed < 80; seed++) {
    const b = createBattle({ party: [heroAt(1, { weapon: 'copper_sword' }, { hp: 6 })], enemies: ['peckish', 'grumbleglop'], data: DATA, rng: seed, options: { ambush: 'none', normalHitCap: null } });
    b.command('hero', { type: 'attack', target: 'e1' });
    b.resolveRound();
    runToEnd(b, 'mash');
    if (b.phase === 'defeat' && b.log.some((e) => e.t === 'defeat' && e.target === 'e1')) {
      assert.equal(b.result.exp, 2);
      assert.equal(b.result.party[0].exp, 2);
      return;
    }
  }
  assert.fail('no seed produced a partial win then a wipe');
});

test('§6.3 bosses telegraph: a wind-up round, then the Big Attack, capped so the first one never knocks anyone out', () => {
  let checked = 0;
  for (let seed = 1; seed < 120 && checked < 25; seed++) {
    const b = createBattle({ party: [heroAt(6, { weapon: 'copper_sword', armour: 'quilted_coat' }), newMember('willow_child'), newMember('sera_child'), newMember('bobble', 6)],
      enemies: ['mumbleroot'], data: DATA, rng: seed, options: { ambush: 'none' } });
    let windRound = null;
    let n = 0;
    while (!b.over && n++ < 40) {
      const hpBefore = Object.fromEntries(b.snapshot().party.map((p) => [p.id, p.hp]));
      const ev = b.autoRound('mash');
      const tel = ev.find((e) => e.t === 'telegraph');
      if (tel) {
        assert.equal(tel.big, true);
        assert.match(tel.text, /candle flame leans sideways/);
        assert.ok(b.snapshot().enemies[0].telegraphing || b.over, 'snapshot shows the wind-up');
        windRound = b.round;
      }
      const big = ev.find((e) => e.t === 'act' && e.big);
      if (big) {
        assert.equal(b.round, windRound + 1, 'Big Attack lands exactly one round after the wind-up');
        const firstUse = checked >= 0 && !b._internal.enemies[0].firstBigChecked;
        if (firstUse) {
          b._internal.enemies[0].firstBigChecked = true;
          // the Big Attack's own hits: up to the boss's next action (bosses may act twice a round)
          const i0 = ev.indexOf(big), i1 = ev.findIndex((e, i) => i > i0 && (e.t === 'act' || e.t === 'telegraph'));
          const hits = ev.slice(i0 + 1, i1 < 0 ? ev.length : i1).filter((e) => e.t === 'damage' && e.side === 'party');
          for (const h of hits) if (hpBefore[h.target] > 5) assert.ok(h.hp >= 1, `first Big Attack left ${h.target} standing`);
          checked++;
        }
        assert.equal(b.snapshot().enemies[0].bigCooldown, 3, 'three dots under its HP bar');
      }
    }
  }
  assert.ok(checked > 3, `saw ${checked} first Big Attacks`);
});

test('§6.5 the floor: nothing in a normal encounter deals more than 40% of max HP in one hit', () => {
  for (let seed = 1; seed < 40; seed++) {
    const b = createBattle({ party: [heroAt(3, { weapon: 'wooden_sword' })], enemies: ['clankworthy'], data: DATA, rng: seed, options: { ambush: 'none' } });
    runToEnd(b, 'mash');
    for (const e of b.log) if (e.t === 'damage' && e.side === 'party' && !e.miss) assert.ok(e.amount <= Math.floor(0.4 * e.maxHp), e.text);
  }
});

test('§6.4 rubber band: second wind at S>=60 (once per battle), no enemy crits at S>=30, invisible in text', () => {
  let seen = false;
  for (let seed = 1; seed < 60 && !seen; seed++) {
    const b = createBattle({ party: [heroAt(2, { weapon: 'wooden_sword' }, { hp: 5 })], enemies: ['toadstooligan', 'toadstooligan'], data: DATA, rng: seed, options: { ambush: 'none', S: 60, normalHitCap: null } });
    runToEnd(b, 'mash');
    const sw = b.log.filter((e) => e.t === 'second_wind');
    assert.ok(sw.length <= 1);
    if (sw.length) { seen = true; assert.equal(sw[0].text, 'Bram wobbles... and stays standing!'); }
    for (const e of b.log) if (e.text) assert.doesNotMatch(e.text, /assist|struggl|rubber/i);
  }
  assert.ok(seen);
  for (let seed = 1; seed < 40; seed++) {
    const b = createBattle({ party: [heroAt(20, { weapon: 'steel_sword' })], enemies: ['grimalkitten'], data: DATA, rng: seed, options: { ambush: 'none', S: 30 } });
    runToEnd(b, 'mash');
    assert.equal(b.result.stats.enemyCrits, 0);
  }
});

test('scripted fights (B9/B19): cannot be won or lost, end after three rounds and say so plainly', () => {
  const b = battle({ party: [heroAt(8, {}, { hp: 5 }), newMember('halvard')], enemies: ['mortmain_scripted'], options: { scripted: { rounds: 3, text: "You can't reach him." } } });
  runToEnd(b, 'mash');
  assert.equal(b.phase, 'scripted');
  assert.equal(b.round, 3);
  assert.ok(b.log.some((e) => e.t === 'damage' && e.reason === 'unreachable' && e.text === "You can't reach him."));
  assert.ok(!b.log.some((e) => e.t === 'defeat' && e.side === 'party'));
  assert.ok(!b.log.some((e) => e.t === 'wipe'));
  assert.equal(b.result.outcome, 'scripted');
});

test('the Sunmane stops on its second turn (scripted end → a gentle victory)', () => {
  const b = battle({ party: [heroAt(11, { weapon: 'copper_sword' }), newMember('bobble', 10), newMember('digby', 11)], enemies: ['sunmane'] });
  runToEnd(b, 'mash');
  assert.equal(b.phase, 'victory');
  assert.ok(b.log.some((e) => e.t === 'message' && /It's Pip!/.test(e.text)));
  assert.ok(b.round <= 2);
  assert.ok(b.result.bossDefeated.includes('sunmane'));
  assert.ok(b.result.assist.delta <= -5);
});

test('guests are AI-controlled, never level, and earn no EXP', () => {
  const b = battle({ party: [heroAt(2, { weapon: 'wooden_sword' }), newMember('halvard')], enemies: ['gloop', 'gloop'] });
  assert.equal(b.needsCommand().id, 'hero');
  b.command('hero', { type: 'defend' });
  assert.equal(b.needsCommand(), null);
  runToEnd(b, 'mash');
  assert.ok(b.log.some((e) => e.t === 'act' && e.actor === 'halvard'));
  const h = b.result.party.find((p) => p.id === 'halvard');
  assert.equal(h.exp, 0);
});

test('every area\'s plausible party can finish a fight without engine errors (smoke)', () => {
  const rng = makeRng(1);
  for (const area of AREAS) {
    for (const L of area.levels) {
      const b = createBattle({ party: area.party(L), enemies: rollEncounter(area, rng, DATA.monsters), data: DATA, rng, options: { bag: { ...(area.bag || {}) }, wagonReachable: area.wagonReachable ?? true } });
      runToEnd(b, 'smart');
      assert.ok(b.over, area.id);
      assert.equal(b.errors.length, 0, `${area.id}: ${b.errors.join('\n')}`);
    }
    for (const key of ['boss', 'boss2']) {
      if (!area[key]) continue;
      const b = createBattle({ party: area.party(area[key].level), enemies: area[key].enemies, data: DATA, rng, options: { ambush: 'none', wagonReachable: false } });
      runToEnd(b, 'smart', 80);
      assert.equal(b.errors.length, 0, `${area.id} boss: ${b.errors.join('\n')}`);
    }
  }
});

test('the Sunmane cannot be hurt below 50% HP', () => {
  const b = battle({ party: [heroAt(30, { weapon: 'halvards_greatsword' }), newMember('barty', 30, { equip: { weapon: 'thunderfork' } })], enemies: ['sunmane'] });
  b.command('hero', { type: 'attack', target: 'e1' });
  b.command('barty', { type: 'attack', target: 'e1' });
  b.resolveRound();
  const s = b.snapshot().enemies[0];
  assert.ok(s.hp >= 210, `hp ${s.hp}`);
});

test('Hush & Hark: beat one and the other gives up and sits down; Hark echoes Hush', () => {
  const party = () => [heroAt(30, { weapon: 'halvards_greatsword', armour: 'gleaming_plate' }), newMember('rowan', 30, { equip: { weapon: 'larksteel_sword', armour: 'gleaming_plate' } }),
    newMember('barty', 30, { equip: { weapon: 'thunderfork', armour: 'gleaming_plate' } }), newMember('sera', 30)];
  let echoed = false;
  for (let seed = 1; seed < 12; seed++) {
    // the mechanic, not the balance: a Lv 30 party that never heals, against the twins at a third of their HP
    const b = createBattle({ party: party(), enemies: [{ id: 'hush', hp: Math.round(DATA.monsters.hush.hp / 3) }, { id: 'hark', hp: Math.round(DATA.monsters.hark.hp / 3) }], data: DATA, rng: seed, options: { ambush: 'none' } });
    let n = 0;
    while (!b.over && n++ < 80) {
      for (let k = 0; k < 4; k++) { const need = b.needsCommand(); if (need) b.command(need.id, need.id === 'sera' ? { type: 'defend' } : { type: 'attack', target: 'e1' }); }
      b.resolveRound();
    }
    assert.equal(b.phase, 'victory');
    const defeats = b.log.filter((e) => e.t === 'defeat' && e.side === 'enemy');
    const spared = b.log.filter((e) => e.t === 'spared');
    assert.equal(defeats.length, 1); assert.equal(spared.length, 1);
    assert.match(spared[0].text, /sits down/);
    echoed ||= b.log.some((e) => e.t === 'message' && /does exactly what Hush did/.test(e.text));
  }
  assert.ok(echoed, 'Hark echoed Hush at least once');
});

test('the Tidewarden\'s Undertow drags a hero to the back row; it shuts its door instead of dying', () => {
  let pulled = false;
  for (let seed = 1; seed < 40 && !pulled; seed++) {
    const b = createBattle({ party: [heroAt(18, { weapon: 'steel_sword', armour: 'iron_armour' }), newMember('willow_grown', 18), newMember('barty', 18), newMember('pip', 17)],
      enemies: ['tidewarden'], data: DATA, rng: seed, options: { ambush: 'none' } });
    runToEnd(b, 'smart', 60);
    const re = b.log.find((e) => e.t === 'reorder');
    if (re) { pulled = true; assert.match(re.text, /dragged to the back/); }
    if (b.phase === 'victory') assert.ok(b.log.some((e) => e.t === 'spared' && /Tide Pearl/.test(e.text)));
  }
  assert.ok(pulled);
});

test('gear: the Larkweave Cloak halves spell damage; the Larksteel Sword adds 25% to lightning', () => {
  const hits = (armour) => {
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const b = createBattle({ party: [newMember('linnet', 25, { equip: { armour } })], enemies: [{ id: 'candelabracadabra', moves: [{ id: 'scorcha', kind: 'spell', spell: 'scorcha' }] }],
        data: DATA, rng: seed, options: { ambush: 'none', normalHitCap: null } });
      b.command('linnet', { type: 'defend' });
      for (const e of b.resolveRound()) if (e.t === 'damage' && e.side === 'party' && !e.miss) total += e.amount;
    }
    return total;
  };
  const cloak = hits('larkweave_cloak'), robe = hits('silk_robe');
  assert.ok(cloak < robe * 0.7, `cloak ${cloak} vs robe ${robe}`);
  const zap = (weapon) => {
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const b = createBattle({ party: [newMember('rowan', 25, { equip: { weapon } })], enemies: ['sir_cumference'], data: DATA, rng: seed, options: { ambush: 'none' } });
      b.command('rowan', { type: 'spell', id: 'zapple', target: 'e1' });
      for (const e of b.resolveRound()) if (e.t === 'damage' && e.side === 'enemy' && e.element === 'lightning') total += e.amount;
    }
    return total;
  };
  const lark = zap('larksteel_sword'), steel = zap('steel_sword');
  assert.ok(lark > steel * 1.12, `larksteel ${lark} vs steel ${steel}`);
});

// ------------------------------------------------------------------------------------------------ balance pass r2
test('scaling: a wild species met at another party level is carried there; bosses and bare ids are not', () => {
  const q = DATA.monsters.quietling;
  const home = scaleMonster(normalizeMonster(q), q.partyLevel);
  assert.equal(home.hp, q.hp, 'at its home level the block is exactly as written');
  const deep = scaleMonster(normalizeMonster(q), 26);
  assert.ok(deep.hp > q.hp * 3 && deep.atk > q.atk * 2 && deep.exp > q.exp * 10, `Quietling at Lv 26: ${deep.hp} HP, ${deep.atk} ATK, ${deep.exp} EXP`);
  assert.ok(deep.lvl > q.lvl, 'its danger rank rises with it (recruit odds stay the same)');
  const boss = DATA.monsters.mortmain;
  assert.equal(scaleMonster(normalizeMonster(boss), 10).hp, boss.hp, 'bosses never scale');
  const b = battle({ party: [heroAt(26, { weapon: 'halvards_greatsword' })], enemies: ['quietling', { id: 'quietling', partyLevel: 26 }, { id: 'quietling', partyLevel: 26, hpMult: 1.5 }] });
  const hp = b.snapshot().enemies.map((e) => e.maxHp);
  assert.equal(hp[0], q.hp);
  assert.equal(hp[1], deep.hp);
  assert.equal(hp[2], Math.round(deep.hp * 1.5), 'hpMult: a sturdier one of these');
});

test('the EXP keel: under the area level earns more, over it earns less, nothing without an area level', () => {
  assert.equal(expKeel(5, 8), 2.5); assert.equal(expKeel(6, 8), 2); assert.equal(expKeel(7, 8), 1.5);
  assert.equal(expKeel(8, 8), 1); assert.equal(expKeel(9, 8), 0.675); assert.equal(expKeel(20, 8), 0.2);
  assert.equal(expKeel(8, null), 1);
  const run = (lvl, areaLevel) => {
    const b = battle({ party: [heroAt(lvl, { weapon: 'steel_sword' })], enemies: ['gloop'], options: { areaLevel } });
    runToEnd(b, 'mash');
    return b.result.exp;
  };
  const g = DATA.monsters.gloop.exp;
  assert.equal(run(10, undefined), g, 'a bare battle pays the block');
  assert.equal(run(10, 13), Math.round(g * 2.5));
  assert.equal(run(10, 10), g);
});

test('a boss pays what it pays: the keel never inflates boss EXP for an under-levelled party (levels matter)', () => {
  // a single Gloop dressed as a boss, so the fight is short and certain
  const bossGloop = { id: 'gloop', boss: true, hp: 5 };
  const run = (lvl) => {
    const b = battle({ party: [heroAt(lvl, { weapon: 'steel_sword' })], enemies: [bossGloop], options: { areaLevel: 14 } });
    runToEnd(b, 'mash');
    assert.equal(b.phase, 'victory');
    return b.result.exp;
  };
  const g = DATA.monsters.gloop.exp;
  assert.equal(run(8), g, 'six levels under: no catch-up bonus on a boss');
  assert.equal(run(14), g);
  assert.equal(run(16), Math.round(g * expKeel(16, 14)), 'above the level the keel still trims it');
});

test('Fight! keeps half its MP on the road, and spends that half on the boss', () => {
  const linnet = () => newMember('linnet', 24, { equip: { weapon: 'ash_staff' }, mother: 'willow' });
  const half = (m) => { m.mp = Math.floor(m.mp * 0.5); return m; };
  // on the road, at half MP, she will not cast
  const road = battle({ party: [half(linnet())], enemies: [{ id: 'quietling', partyLevel: 24, hpMult: 20 }] });
  road.autoCommands('auto');
  assert.equal(road.snapshot().commands[0].type, 'attack');
  // against a boss, the same half is spent
  const boss = battle({ party: [half(linnet())], enemies: [{ id: 'quietling', partyLevel: 24, hpMult: 20, boss: true }] });
  boss.autoCommands('auto');
  assert.equal(boss.snapshot().commands[0].type, 'spell');
});

test('Halvard the mentor: he leaves the lad his own monster, takes the spare ones, and steps in when anyone is hurt', () => {
  // one Gloop, Bram picks it: Papa steps back with a line
  const one = battle({ party: [heroAt(2, { weapon: 'wooden_sword' }), newMember('halvard')], enemies: [{ id: 'gloop', hpMult: 5 }] });
  one.command('hero', { type: 'attack', target: 'e1' });
  const ev = one.resolveRound();
  const watch = ev.find((e) => e.t === 'act' && e.actor === 'halvard');
  assert.equal(watch.kind, 'watch');
  assert.match(watch.text, /^Halvard .*lad/);
  assert.ok(!ev.some((e) => e.t === 'damage' && e.actor === 'halvard'), 'Papa did not swing');
  // two Gloops, Bram picks the first: Papa takes the other
  const two = battle({ party: [heroAt(2, { weapon: 'wooden_sword' }), newMember('halvard')], enemies: [{ id: 'gloop', hpMult: 5 }, { id: 'gloop', hpMult: 5 }] });
  two.command('hero', { type: 'attack', target: 'e1' });
  const ev2 = two.resolveRound();
  assert.ok(ev2.some((e) => e.t === 'damage' && e.actor === 'halvard' && e.target === 'e2'), 'Papa took the spare one');
  // the lad is hurt: Papa does not hold back
  const hurt = battle({ party: [heroAt(2, { weapon: 'wooden_sword' }, { hp: 5 }), newMember('halvard')], enemies: [{ id: 'gloop', hpMult: 5 }] });
  hurt.command('hero', { type: 'defend' });
  const ev3 = hurt.resolveRound();
  assert.ok(!ev3.some((e) => e.t === 'act' && e.actor === 'halvard' && e.kind === 'watch'));
  // monsters give him a wide berth: the children draw most of the blows
  let onPapa = 0, onKids = 0;
  for (let seed = 1; seed < 80; seed++) {
    const b = createBattle({ party: [heroAt(4, { weapon: 'copper_sword' }), newMember('halvard'), newMember('bobble', 4)], enemies: [{ id: 'gloop', hpMult: 9 }], data: DATA, rng: seed, options: { ambush: 'none' } });
    for (let r = 0; r < 3 && !b.over; r++) b.autoRound('mash');
    for (const e of b.log) if (e.t === 'damage' && e.side === 'party') (e.target === 'halvard' ? onPapa++ : onKids++);
  }
  assert.ok(onPapa < onKids * 0.35, `blows on Papa ${onPapa}, on the children ${onKids}`);
});

test('befriending: one roll per species, so three Crabbits ask no more often than one', () => {
  const offers = (n) => {
    let k = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const b = createBattle({ party: [heroAt(20, { weapon: 'steel_sword' })], enemies: Array.from({ length: n }, () => 'crabbit'), data: DATA, rng: seed,
        options: { ambush: 'none', recruit: { enabled: true, kidMode: true } } });
      runToEnd(b, 'mash');
      if (b.result.recruit.offer) k++;
      if (seed === 1) assert.equal(b.result.recruit.state.misses.crabbit || 0, b.result.recruit.offer ? 0 : 1, 'a miss counts once per battle');
    }
    return k / 300;
  };
  const p1 = offers(1), p3 = offers(3);
  assert.ok(Math.abs(p3 - p1) < 0.07, `one Crabbit ${p1}, three Crabbits ${p3}`);
});

test('Malgrim: Nothing At All leaves everyone on 1 HP, and the moment it gives you is a lullaby that gives some back', () => {
  const party = () => [heroAt(27, { weapon: 'halvards_greatsword', armour: 'gleaming_plate' }), newMember('rowan', 26, { equip: { weapon: 'larksteel_sword' } }),
    newMember('linnet', 26), newMember('elowen', 26)];
  let seen = false;
  for (let seed = 1; seed < 40 && !seen; seed++) {
    const b = createBattle({ party: party(), enemies: ['malgrim_unravelling'], data: DATA, rng: seed, options: { ambush: 'none' } });
    let n = 0;
    while (!b.over && n++ < 30) {
      const ev = b.autoRound('mash');
      const i = ev.findIndex((e) => e.t === 'act' && e.move === 'listen');
      if (i < 0) continue;
      const heals = ev.slice(i).filter((e) => e.t === 'heal' && e.side === 'party');
      assert.ok(heals.length >= 1, 'somebody got colour back');
      assert.match(ev[i].text, /lullaby/);
      seen = true; break;
    }
  }
  assert.ok(seen, 'Listen happened');
});

test('Silence the Choir goes for whoever is carrying the most magic', () => {
  const hits = {};
  for (let seed = 1; seed < 40; seed++) {
    const b = createBattle({ party: [heroAt(27), newMember('linnet', 26), newMember('elowen', 26)], data: DATA, rng: seed,
      enemies: [{ id: 'mortmain', moves: [{ id: 'silence_the_choir', name: 'Silence the Choir', kind: 'status', targetCaster: true, status: { id: 'silence', chance: 1, turns: 3 } }] }],
      options: { ambush: 'none' } });
    b.command('hero', { type: 'defend' }); b.command('linnet', { type: 'defend' }); b.command('elowen', { type: 'defend' });
    for (const e of b.resolveRound()) if (e.t === 'status' && e.status === 'silence' && e.on) hits[e.target] = (hits[e.target] || 0) + 1;
  }
  assert.ok(!hits.hero, 'never the hero while a caster still has a voice');
  assert.ok((hits.elowen || 0) + (hits.linnet || 0) >= 30);
});

test('journey (whole playthroughs, EXP carried): no kind of child is ever walled', () => {
  const r = spawnSync(process.execPath, [new URL('./journey.mjs', import.meta.url).pathname, '--kids', 'normal,masher,skipper,fleer', '--trials', '5', '--retry', '0', '--levels', '0', '--seed', '9'], { encoding: 'utf8' });
  assert.equal(r.stderr, '');
  for (const kid of ['normal', 'masher', 'skipper', 'fleer']) assert.match(r.stdout, new RegExp(`## ${kid} — walls 0/5`), kid);
});
