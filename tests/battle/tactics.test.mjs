// node --test tests/battle — DQV Tactics (balance pass r4): Bram takes commands, everybody else fights by their Tactics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, TACTICS } from '../../src/battle/battle.js';
import { chooseAllyAction, policyForTactic, normalizeTactic } from '../../src/battle/ai.js';
import { DATA, newMember, heroAt, runToEnd, battle } from './helpers.js';
import { AREA_BY_ID } from './areas.js';
import { makeRng } from '../../src/battle/formulas.js';

const family = (L = 26) => [
  heroAt(L, { weapon: 'halvards_greatsword', armour: 'gleaming_plate' }),
  newMember('rowan', L - 1, { equip: { weapon: 'larksteel_sword' }, mother: 'willow' }),
  newMember('linnet', L - 1, { mother: 'willow' }),
  newMember('elowen', L - 1),
];

test('tactics: only Bram takes commands; the rest of the family fights by "Fight Wisely"', () => {
  const b = battle({ party: family(), enemies: ['hexcalibur', 'vesperling'] });
  assert.equal(b.needsCommand().id, 'hero');
  assert.deepEqual(b.tactics().map((t) => [t.id, t.tactic, t.leader, t.canChange]),
    [['hero', 'orders', true, false], ['rowan', 'wisely', false, true], ['linnet', 'wisely', false, true], ['elowen', 'wisely', false, true]]);
  assert.deepEqual(b.command('hero', { type: 'attack', target: 'e1' }), { ok: true, next: null }, 'one press a round');
  assert.equal(b.needsCommand(), null);
  const r = b.command('elowen', { type: 'attack' });
  assert.equal(r.ok, false); assert.equal(r.reason, 'tactics');
  assert.match(r.text, /Fight Wisely.*Follow Orders/);
  const ev = b.resolveRound();
  for (const id of ['rowan', 'linnet', 'elowen']) assert.ok(ev.some((e) => e.t === 'act' && e.actor === id), `${id} acted on her own`);
  const snap = b.snapshot();
  assert.equal(snap.leader, 'hero');
  assert.equal(snap.party.find((p) => p.id === 'linnet').tactic, 'wisely');
  assert.deepEqual(TACTICS.map((t) => t.name), ['Show No Mercy', 'Fight Wisely', 'Watch My Back', "Don't Use Magic", 'Follow Orders']);
});

test('tactics: the best healer in the game heals on her own, instead of hitting Mortmain with her staff', () => {
  // The critic's run: "Elowen hit Mortmain for 12 while he knocked her out" — every member took commands, so a child
  // mashing Attack had the best healer in the game swinging a staff. Now she only takes orders if you ask her to.
  const area = AREA_BY_ID.quiet_deep;
  let heals = 0, swings = 0, silenced = 0, won = 0;
  for (let seed = 1; seed <= 30; seed++) {
    let B;
    const b = createBattle({ party: area.boss.party(28), enemies: ['mortmain'], data: DATA, rng: seed,
      options: { ambush: 'none', wagonReachable: false },
      emit: (ev) => {
        if (ev.t !== 'act' || ev.actor !== 'elowen') return;
        const her = B.party.concat(B.wagon).find((c) => c.id === 'elowen');
        if (ev.kind === 'spell') heals++;
        else if (her.status.silence) silenced++;   // "Silence the Choir": then even she can only swing
        else swings++;
      } });
    B = b._internal;
    runToEnd(b, 'mash', 40);   // the child mashes Attack for Bram, nothing else
    if (b.result.outcome === 'victory') won++;
  }
  assert.ok(heals >= 40, `Elowen cast ${heals} spells in 30 fights`);
  assert.ok(heals > swings, `spells ${heals} vs staff swings ${swings} (and ${silenced} turns silenced, which is his doing)`);
  assert.ok(won >= 12, `a mashing child won ${won}/30 first tries`);
});

test('tactics: Follow Orders is switched on per member, and switched off again', () => {
  const b = battle({ party: family(), enemies: ['hexcalibur'] });
  const on = b.setTactic('linnet', 'orders');
  assert.deepEqual(on, { ok: true, tactic: 'orders', text: 'Linnet will Follow Orders.' });
  assert.equal(b.command('hero', { type: 'defend' }).next, 'linnet');
  assert.ok(b.command('linnet', { type: 'spell', id: 'scorchalot', target: 'e1' }).ok);
  assert.equal(b.needsCommand(), null);
  // switching back drops the command she was given: from now on she chooses for herself
  assert.equal(b.setTactic('linnet', 'no_mercy').text, 'Linnet will Show No Mercy.');
  assert.ok(!b.snapshot().commands.some((c) => c.actor === 'linnet'));
  // the leader and guests cannot be changed; nonsense is refused kindly
  assert.equal(b.setTactic('hero', 'wisely').reason, 'leader');
  assert.equal(b.setTactic('linnet', 'dance').reason, 'tactic');
  const g = battle({ party: [heroAt(3), newMember('halvard')], enemies: ['gloop'] });
  assert.match(g.setTactic('halvard', 'orders').text, /Halvard nods politely/);
  // everybody at once
  const all = b.setTactic('all', 'watch_back');
  assert.equal(all.text, 'Everybody will Watch My Back.');
  assert.deepEqual(b.tactics().map((t) => t.tactic), ['orders', 'watch_back', 'watch_back', 'watch_back']);
});

test('tactics: carried in the member (save) shape, old control values still read, options.tactics for sims', () => {
  const b = battle({ party: [heroAt(10), newMember('bobble', 10, { tactic: 'no_magic' }), newMember('pip', 10, { control: 'player' })], enemies: ['gloop'] });
  assert.deepEqual(b.tactics().map((t) => t.tactic), ['orders', 'no_magic', 'orders']);
  runToEnd(b, 'mash');
  const out = Object.fromEntries(b.result.party.map((m) => [m.id, m.tactic]));
  assert.deepEqual(out, { hero: undefined, bobble: 'no_magic', pip: 'orders' });
  const everyone = battle({ party: [heroAt(10), newMember('bobble', 10)], enemies: ['gloop'], options: { tactics: 'orders' } });
  assert.equal(everyone.command('hero', { type: 'attack' }).next, 'bobble');
  const one = battle({ party: [heroAt(10), newMember('bobble', 10), newMember('pip', 10)], enemies: ['gloop'], options: { tactics: { pip: 'no_mercy' } } });
  assert.deepEqual(one.tactics().map((t) => t.tactic), ['orders', 'wisely', 'no_mercy']);
  assert.equal(normalizeTactic('ai'), 'wisely'); assert.equal(normalizeTactic('player'), 'orders'); assert.equal(policyForTactic('watch_back'), 'support');
});

test('tactics: without Bram the first of the family leads (Linnet at the Stone Garden); the leader stays at the front', () => {
  const b = battle({ party: [newMember('linnet', 1), newMember('rowan', 1)], enemies: ['gloop'] });
  assert.equal(b.needsCommand().id, 'linnet');
  assert.equal(b.snapshot().leader, 'linnet');
  const w = battle({ party: [heroAt(12), newMember('bobble', 12, { tactic: 'orders' })], wagon: [newMember('digby', 12)], enemies: ['gloop'] });
  const r = w.command('hero', { type: 'swap', target: 'digby' });
  assert.equal(r.ok, false); assert.equal(r.reason, 'leader'); assert.match(r.text, /stays at the front/);
  assert.ok(w.command('hero', { type: 'swap', target: 'digby', out: 'bobble' }).ok, 'somebody else can climb up');
});

test('tactics: when Bram is worn out the fight carries on by itself, and the party can still run', () => {
  const b = battle({ party: [heroAt(10, {}, { hp: 0 }), newMember('bobble', 10)], enemies: ['gloop', 'gloop'] });
  assert.equal(b.needsCommand(), null);
  assert.equal(b.ready(), true);
  const r = b.command(null, { type: 'flee' });
  assert.ok(r.ok, r.text);
  b.resolveRound();
  assert.ok(['fled', 'command', 'defeat', 'victory'].includes(b.phase));
});

test('tactics: Show No Mercy spends magic on the road, Fight Wisely keeps half, Don\'t Use Magic never casts', () => {
  const linnet = (tactic) => newMember('linnet', 24, { equip: { weapon: 'ash_staff' }, mother: 'willow', tactic });
  const half = (m) => { m.mp = Math.floor(m.mp * 0.5); return m; };
  const road = (tactic) => {
    const b = battle({ party: [heroAt(24), half(linnet(tactic))], enemies: [{ id: 'quietling', partyLevel: 24, hpMult: 20 }, { id: 'quietling', partyLevel: 24, hpMult: 20 }] });
    return chooseAllyAction(b._internal, b._internal.party[1], policyForTactic(tactic));
  };
  assert.equal(road('no_mercy').type, 'spell');
  assert.equal(road('wisely').type, 'attack');
  assert.equal(road('no_magic').type, 'attack');
});

test('tactics: Watch My Back heals early and wakes a sleeping friend; Fight Wisely waits until it is serious', () => {
  const mk = (tactic, hp) => {
    const b = battle({ party: [heroAt(20, {}, { hp }), newMember('sera', 20, { tactic })], enemies: ['crabbit'] });
    return chooseAllyAction(b._internal, b._internal.party[1], policyForTactic(tactic));
  };
  const at = Math.round(heroAt(20).hp * 0.5);
  assert.equal(mk('watch_back', at).type, 'spell', 'half HP: Watch My Back heals');
  assert.equal(mk('wisely', at).type, 'attack', 'half HP: Fight Wisely keeps fighting');
  const b = battle({ party: [heroAt(20), newMember('sera', 20, { tactic: 'watch_back' })], enemies: ['crabbit'] });
  b._internal.party[0].status.sleep = 2;
  const cmd = chooseAllyAction(b._internal, b._internal.party[1], 'support');
  assert.deepEqual([cmd.type, cmd.id, cmd.target], ['spell', 'wakey', 'hero']);
});

test('tactics: a friend leaves the small monster the boy was told to hit to the boy (he pops the slime)', () => {
  const b = battle({ party: [heroAt(1, { weapon: 'wooden_sword' }), newMember('bobble', 1)], enemies: [{ id: 'gloop', hpMult: 0.6 }, { id: 'gloop', hpMult: 0.6 }] });
  b.command('hero', { type: 'attack', target: 'e1' });
  const cmd = chooseAllyAction(b._internal, b._internal.party[1], 'auto');
  assert.equal(cmd.target, 'e2');
  // …but a big one gets everybody
  const big = battle({ party: [heroAt(1, { weapon: 'wooden_sword' }), newMember('bobble', 1)], enemies: [{ id: 'gloop', hpMult: 4 }, { id: 'gloop', hpMult: 4.5 }] });
  big.command('hero', { type: 'attack', target: 'e1' });
  assert.equal(chooseAllyAction(big._internal, big._internal.party[1], 'auto').target, 'e1');
});

test('boss wipes say one thing a child can act on: grow when far under, the boss\'s own tip otherwise, the helper from the second', () => {
  const wipe = (party, enemy, bossWipes = 0) => {
    const rng = makeRng(5);
    for (let t = 0; t < 30; t++) {
      const b = createBattle({ party, enemies: [enemy], data: DATA, rng, options: { ambush: 'none', bossWipes } });
      runToEnd(b, 'mash', 60);
      if (b.result.outcome === 'defeat') return b;
    }
    return null;
  };
  const low = wipe([heroAt(1)], 'mumbleroot');
  assert.equal(low.result.advice.kind, 'grow');
  assert.match(low.result.advice.text, /^"Mumbleroot the Grudge is an awful lot of monster/);
  assert.ok(low.log.find((e) => e.t === 'wipe').lines.includes(low.result.advice.text), 'the priest says it when you wake');
  assert.equal(low.result.advice.helper, null, 'the first wipe: no helper yet');
  const near = wipe([heroAt(6, { weapon: 'copper_sword' })], 'mumbleroot', 1);
  assert.equal(near.result.advice.kind, 'boss');
  assert.match(near.result.advice.text, /candle leans sideways/);
  assert.deepEqual(near.result.advice.helper.items, { strong_herb: 3 });
  const normal = createBattle({ party: [heroAt(1, {}, { hp: 1 })], enemies: ['crabbit'], data: DATA, rng: 2, options: { ambush: 'enemy', normalHitCap: null } });
  runToEnd(normal, 'mash');
  if (normal.result.outcome === 'defeat') assert.equal(normal.result.advice, null, 'no advice after a normal fight');
});
