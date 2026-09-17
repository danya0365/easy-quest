// src/battle/actions.js — P14. Resolves one action into events. Pure logic: no DOM, no Three.js.
// Every event is a plain object {t, ...} with a ready-to-type `text` in the house voice (VOICE-BIBLE §3,
// SYSTEMS-BIBLE §1/§7/§10, CANON §11 wording wins). Override any line via data.strings['battle.<key>'].

import {
  physicalDamage, critChance, critDamage, enemyCritChance, playerMissChance, enemyMissChance,
  spellDamage, healAmount, sleepLandChance, bigAttackCap, poisonTick, round, clamp, BIG_ATTACK_COOLDOWN,
} from './formulas.js';

// ---------------------------------------------------------------------------------------------------------
// Text

export const TEXT = {
  'appear': '%LIST% %VERB% near!',
  'ambush.party': "You've caught them napping!",
  'ambush.enemy': 'They came out of nowhere!',
  'attack': '%ACTOR% attacks!',
  'dmg.toEnemy': '%N% damage to %TARGET%!',
  'dmg.toParty': '%TARGET% takes %N% damage!',
  'crit': 'A terrific whack!',
  'miss.party': '%ACTOR% swings at the air. The air is unharmed.',
  'miss.enemy': '%TARGET% dodges out of the way!',
  'miss.hidden': "%TARGET% isn't there to hit!",
  'miss.fluffed': '%TARGET% is far too fluffy to hit!',
  'miss.blocked': '%TARGET% blocks it with a great clatter!',
  'miss.unreachable': "You can't reach him.",
  'miss.swallowed': '%TARGET% is somewhere inside a very large frog.',
  'defeat.enemy': '%TARGET% is beaten.',
  'defeat.party': '%TARGET% is worn out.',
  'spared': '%TARGET% sits down and stops fighting.',
  'spell.cast': '%ACTOR% casts %SPELL%!',
  'spell.nomp': "%ACTOR% hasn't the puff for it.",
  'spell.fizzle': 'The spell coughs, thinks better of it, and goes out.',
  'spell.silenced': "%ACTOR% opens their mouth, but the spell won't come.",
  'noeffect': 'It has no effect at all!',
  'heal': '%TARGET% recovers %N% HP!',
  'heal.full': '%TARGET% is already in the pink!',
  'heal.allfull': 'Everybody is already in the pink!',
  'mp': '%TARGET% recovers %N% MP!',
  'mp.full': "%TARGET%'s magic is already brimming!",
  'revive': "%TARGET% sits up, blinking. 'What did I miss?'",
  'revive.notneeded': "%TARGET% is up and about already!",
  'cure': '%TARGET% is feeling much better.',
  'cure.nothing': '%TARGET% was feeling fine already.',
  'item.use': '%ACTOR% uses the %ITEM%.',
  'item.none': "%ACTOR% rummages in the bag. There aren't any left!",
  'defend': '%ACTOR% is on guard.',
  'flee.ok': 'Everybody runs. Nobody mentions it again.',
  'flee.fail': '%HERO% turns to run, thinks about it, and turns back.',
  'flee.boss': '%TARGET% plants itself in the doorway with the calm of a monster who has nowhere else to be.',
  'flee.scripted': "There's nowhere to run to. Not this time.",
  'enemy.flee': '%TARGET% has had enough and legs it.',
  'swap': '%OUT% climbs down. %IN% climbs up.',
  'swap.auto': '%IN% jumps down from the wagon!',
  'swap.no': "The wagon's outside, waiting in the rain.",
  'asleep': '%TARGET% is fast asleep.',
  'wake': '%TARGET% wakes up!',
  'rooted': '%TARGET% is stuck fast!',
  'hiccup.skip': '%TARGET% hiccups and loses their place. Hic!',
  'confused.dither': '%ACTOR% spins round and round, looking for the way out.',
  'status.sleep': '%TARGET% is fast asleep. Rude, mid-fight.',
  'status.poison': '%TARGET% is looking rather green.',
  'status.confuse': '%TARGET% has forgotten which way is which.',
  'status.dazzle': "%TARGET% can't see a thing!",
  'status.root': "Vines knot round %TARGET%'s feet!",
  'status.hiccup': '%TARGET% has the hiccups!',
  'status.silence': "%TARGET%'s spells have gone quiet.",
  'status.swallowed': '%TARGET% has been swallowed whole!',
  'status.hidden': '%TARGET% vanishes from sight!',
  'status.fluffed': '%TARGET% fluffs up, enormously pleased with itself.',
  'status.guard': '%TARGET% raises its guard.',
  'status.hexed': "%TARGET% feels half as sturdy as before.",
  'end.sleep': '%TARGET% wakes up!',
  'end.confuse': '%TARGET% remembers which way is which.',
  'end.dazzle': '%TARGET% can see again.',
  'end.root': '%TARGET% pulls free of the vines.',
  'end.hiccup': "%TARGET%'s hiccups have stopped.",
  'end.silence': "%TARGET%'s voice comes back.",
  'end.swallowed': '%TARGET% pops back out, unharmed and slightly sticky.',
  'end.hidden': '%TARGET% pops back up!',
  'poison.tick': '%TARGET% takes %N% damage from the poison.',
  'resist': '%TARGET% shrugs it off.',
  'buff.atk': "%TARGET%'s attack goes up!",
  'buff.def': "%TARGET%'s defence goes up!",
  'buff.agi': '%TARGET% feels quicker!',
  'debuff.atk': "%TARGET%'s attack goes down!",
  'debuff.def': "%TARGET%'s defence goes down!",
  'debuff.agi': '%TARGET% feels sluggish.',
  'buff.max': "%TARGET% can't get any %STATWORD% than that!",
  'buff.end': "%TARGET%'s %STATNAME% goes back to normal.",
  'buffs.purged': 'Every helpful spell on the party unravels!',
  'regen': '%TARGET% recovers %N% MP.',
  'second_wind': '%TARGET% wobbles... and stays standing!',
  'steal': '%ACTOR% gobbles up %N% gold coins!',
  'steal.back': 'The %N% gold coins come tumbling back out!',
  'summon': '%LIST% %VERB% to help!',
  'transform': '%ACTOR% changes...',
  'victory': 'Victory!',
  'victory.exp': 'The party gains %N% experience points.',
  'victory.gold': '...and %G% gold coins.',
  'victory.fled': 'The monsters have all run off.',
  'drop': '%MONSTER% dropped %ITEM%!',
  'levelup': "%NAME%'s level has gone up to %N%!",
  'learn': '%NAME% has learnt %SPELL%! It tingles all the way to the elbows.',
  'recruit.want': '%MONSTER% wants to be your friend!',
  'recruit.ask': 'Shall %PRONOUN% come along?',
  'wipe': 'You are dreaming of somewhere warm. Somebody is carrying you.',
  'wipe.church': 'You wake on a church bench. Your purse is lighter. You are not.',
  'nothing': '%ACTOR% does nothing at all.',
  'lookaround': '%ACTOR% looks around for someone to bother.',
  'telegraph.default': '%ACTOR% is gathering itself for something big!',
};

const NUM_WORDS = ['no', 'a', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
const STAT_WORDS = { atk: ['stronger', 'attack'], def: ['sturdier', 'defence'], agi: ['quicker', 'speed'] };

export function fill(tpl, vars = {}) {
  return String(tpl).replace(/%([A-Z_]+)%/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}
export const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function say(B, key, vars) {
  const over = B.data.strings && (B.data.strings['battle.' + key] ?? B.data.strings[key]);
  const tpl = over != null ? (Array.isArray(over) ? B.rng.pick(over) : over) : (TEXT[key] ?? key);
  return capFirst(fill(tpl, vars));
}

/** "the Gloop A" / "Bram" / "Mumbleroot the Grudge" */
export function nameOf(c) {
  if (!c) return 'someone';
  if (c.side === 'party') return c.name;
  if (c.properName || c.lettered) return c.display;
  return 'the ' + c.display;
}
const article = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

/** "Two Gloops and a Bloop" + verb agreement. */
export function listMonsters(list) {
  const groups = [];
  for (const e of list) {
    const g = groups.find((x) => x.species === e.species);
    if (g) g.n++; else groups.push({ species: e.species, n: 1, e });
  }
  const parts = groups.map((g) => {
    if (g.e.properName) return g.e.name;
    if (g.n === 1) return `${g.e.article || (g.e.boss ? 'the' : article(g.e.name))} ${g.e.name}`;
    return `${(NUM_WORDS[g.n] || String(g.n)).toLowerCase()} ${g.e.plural || g.e.name + 's'}`;
  });
  const text = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  const plural = list.length > 1;
  return { text: capFirst(text), plural };
}

// ---------------------------------------------------------------------------------------------------------
// Event plumbing

export function push(B, ev) {
  B.cur.push(ev);
  B.log.push(ev);
  if (B.emit) { try { B.emit(ev); } catch (e) { B.errors.push(String(e && e.message || e)); } }
  return ev;
}

// ---------------------------------------------------------------------------------------------------------
// Combatant queries

export const isUp = (c) => !!c && c.hp > 0 && !c.gone;
export const opponents = (B, c) => (c.side === 'party' ? B.enemies : B.party).filter(isUp);
export const alliesOf = (B, c) => (c.side === 'party' ? B.party : B.enemies).filter(isUp);
export const byId = (B, id) => B.party.find((c) => c.id === id) || B.enemies.find((c) => c.id === id)
  || B.wagon.find((c) => c.id === id);

export function targetable(c) {
  return isUp(c) && !c.status.hidden && !c.status.swallowed;
}

export function buffMult(c, stat) {
  const b = c.buffs[stat];
  return b ? b.mult : 1;
}
export function effAtk(c) { return Math.max(1, round(c.atk * buffMult(c, 'atk'))); }
export function effDef(c) { return Math.max(0, round(c.def * buffMult(c, 'def') * (c.flags.standStill ? 2 : 1))); }
export function effSpd(c) { return Math.max(1, c.spd * buffMult(c, 'agi')); }
export function effMdef(c) { return c.mdef; }
export function effMaxHp(c) { return c.status.hexed ? Math.max(1, Math.ceil(c.maxHp / 2)) : c.maxHp; }

export function elementMult(c, element) {
  if (!element) return 1;
  if (c.side === 'enemy') return c.elements && c.elements[element] != null ? c.elements[element] : 1;
  return c.gear && c.gear.halves && c.gear.halves.includes(element) ? 0.5 : 1;
}

/** Larkweave Cloak: "halves all spell damage" (gear.spellGuard 0.5). */
export function spellGuard(c) { return c.side === 'party' && c.gear && c.gear.spellGuard != null ? c.gear.spellGuard : 1; }

function statusImmune(c, id) {
  if (c.side === 'party') return !!(c.gear && c.gear.immune && c.gear.immune.includes(id));
  return c.resist && c.resist[id] === 0;
}

/** Party enemy-targeting weights: position 1 draws 35%, 2–4 ~22% each (SYSTEMS §8). */
export function pickPartyTarget(B, attacker, pool) {
  const never = (attacker && attacker.neverTargets) || [];
  const list = (pool || B.party).filter((c) => targetable(c) && !never.includes(c.id) && !never.includes(c.baseId));
  if (!list.length) return null;
  // a mentor guest (Halvard) is enormous: monsters give him a wide berth and go for the children instead
  const weights = list.map((c) => (B.party.indexOf(c) === 0 ? 35 : 22) * (c.guest && c.member && c.member.mentor ? 0.35 : 1));
  return B.rng.weighted(list, (c) => weights[list.indexOf(c)]);
}

export function pickEnemyTarget(B, pool) {
  const list = (pool || B.enemies).filter(targetable);
  return list.length ? B.rng.pick(list) : null;
}

/** If the chosen target has gone, pick a sensible replacement on the same side. */
export function retarget(B, actor, targetId, wantSide) {
  const t = byId(B, targetId);
  if (t && targetable(t) && (!wantSide || t.side === wantSide) && B.party.concat(B.enemies).includes(t)) return t;
  const side = wantSide || (actor.side === 'party' ? 'enemy' : 'party');
  if (side === 'enemy') return pickEnemyTarget(B);
  return pickPartyTarget(B, actor);
}

// ---------------------------------------------------------------------------------------------------------
// Damage / healing application

/**
 * Apply `amount` of damage to `target`. Handles defend, failed-flee softening, the normal-encounter 40% floor,
 * boss Big-Attack caps, second wind, unlosable scripted fights, sleep wake, KO, spare, transform and phases.
 */
export function applyDamage(B, source, target, amount, opt = {}) {
  let dmg = amount;
  const fromEnemy = source && source.side === 'enemy' && target.side === 'party';
  if (target.flags.defending) dmg = Math.max(1, Math.floor(dmg / 2));
  if (fromEnemy && B.fleeFailedThisRound) dmg = Math.max(1, Math.floor(dmg * 0.75));
  if (fromEnemy && opt.big) {
    const first = !source.bigUsedOn.has(target.id);
    dmg = bigAttackCap(dmg, { expectedMaxHP: B.expectedMaxHP(source), currentHP: target.hp, firstUse: first, S: B.S });
    source.bigUsedOn.add(target.id);
  }
  if (fromEnemy && B.normalCap && !opt.big && !opt.setHp) {
    const cap = Math.max(1, Math.floor(B.normalCap * effMaxHp(target)));
    if (dmg > cap) { dmg = cap; B.stats.cappedHits++; }
  }
  if (target.side === 'party' && B.unlosable) dmg = Math.min(dmg, Math.max(0, target.hp - 1));
  if (target.side === 'enemy' && target.minHpPct) dmg = Math.min(dmg, Math.max(0, target.hp - Math.ceil(target.maxHp * target.minHpPct)));
  if (target.side === 'party' && B.fx.secondWind && !B.secondWindUsed && dmg >= target.hp && target.hp > 1) {
    dmg = target.hp - 1;
    B.secondWindUsed = true;
    B.pendingSecondWind = target;
  }
  dmg = Math.max(0, dmg);
  // DQ prints the whole blow even when it overkills; HP simply stops at zero.
  const dealt = Math.min(dmg, target.hp);

  if (fromEnemy) {
    B.stats.damageTaken += dealt;
    B.stats.enemyHits++;
    B.stats.maxHitPct = Math.max(B.stats.maxHitPct, dmg / Math.max(1, effMaxHp(target)));
  } else if (target.side === 'enemy') B.stats.damageDealt += dealt;

  target.hp -= dealt;
  const toParty = target.side === 'party';
  push(B, {
    t: 'damage', actor: source ? source.id : null, target: target.id, side: target.side, amount: dmg, dealt,
    crit: !!opt.crit, miss: false, element: opt.element || null, hp: target.hp, maxHp: effMaxHp(target),
    text: (opt.crit ? say(B, 'crit') + ' ' : '') + (dmg > 0
      ? say(B, toParty ? 'dmg.toParty' : 'dmg.toEnemy', { N: dmg, TARGET: nameOf(target) })
      : `${capFirst(nameOf(target))} staggers, but stays standing.`),
  });
  if (B.pendingSecondWind === target) {
    B.pendingSecondWind = null;
    B.stats.secondWinds++;
    push(B, { t: 'second_wind', target: target.id, text: say(B, 'second_wind', { TARGET: nameOf(target) }) });
  }
  if (dmg > 0 && target.status.sleep && target.hp > 0) {
    delete target.status.sleep;
    push(B, { t: 'status', target: target.id, status: 'sleep', on: false, text: say(B, 'wake', { TARGET: nameOf(target) }) });
  }
  if (target.hp <= 0) knockOut(B, source, target);
  else if (target.side === 'enemy') checkPhases(B, target);
  return dealt;
}

export function knockOut(B, source, target) {
  target.hp = 0;
  if (target.side === 'enemy') {
    if (target.transformsInto && B.data.monsters[target.transformsInto]) return transform(B, target);
    // a "spare" phase (Malgrim at 10%) still happens if one big blow skips straight past it
    const spareIdx = (target.phases || []).findIndex((ph, i) => ph.spare && !target.phaseDone.has(i));
    if (spareIdx >= 0) {
      target.phaseDone.add(spareIdx);
      const ph = target.phases[spareIdx];
      if (ph.text) push(B, { t: 'phase', actor: target.id, index: spareIdx, text: capFirst(fill(ph.text, { ACTOR: nameOf(target) })) });
      target.spareAtZero = true;
    }
    target.gone = target.spareAtZero ? 'spared' : 'defeated';
    target.status = {}; target.buffs = {};
    if (target.spareAtZero) {
      push(B, { t: 'spared', target: target.id, text: target.spareText || say(B, 'spared', { TARGET: nameOf(target) }) });
    } else {
      push(B, { t: 'defeat', target: target.id, side: 'enemy', species: target.species,
        text: target.defeatText ? capFirst(fill(target.defeatText, { TARGET: nameOf(target) })) : say(B, 'defeat.enemy', { TARGET: nameOf(target) }) });
    }
    if (target.stolen) {
      push(B, { t: 'steal', actor: target.id, gold: -target.stolen, text: say(B, 'steal.back', { N: target.stolen }) });
      B.gold += target.stolen; target.stolen = 0;
    }
    if (target.partnerGivesUp) {
      for (const o of B.enemies) {
        if (o === target || !isUp(o) || !o.partnerGivesUp) continue;
        o.gone = 'spared'; o.status = {}; o.buffs = {}; o.windup = null;
        push(B, { t: 'spared', target: o.id, text: o.spareText || say(B, 'spared', { TARGET: nameOf(o) }) });
      }
    }
  } else {
    const keepPoison = target.status.poison;
    target.status = keepPoison ? { poison: keepPoison } : {};
    target.buffs = {};
    B.stats.koCount++;
    B.stats.koIds.add(target.id);
    push(B, { t: 'defeat', target: target.id, side: 'party', text: say(B, 'defeat.party', { TARGET: nameOf(target) }) });
  }
}

function transform(B, e) {
  const next = B.makeEnemyStats(B.data.monsters[e.transformsInto]);
  const expTotal = e.expTotal + next.exp, goldTotal = e.goldTotal + next.gold;
  const text = e.transformText || say(B, 'transform', { ACTOR: nameOf(e) });
  Object.assign(e, next, { id: e.id, uid: e.uid, display: next.name, hp: next.maxHp, status: {}, buffs: {}, flags: {},
    windup: null, bigCooldown: 0, bigUsedOn: new Set(), phaseDone: new Set(), used: new Map(), cooldowns: {},
    followUp: null, lastMove: null, expTotal, goldTotal });
  push(B, { t: 'transform', actor: e.id, into: e.species, name: e.name, hp: e.hp, maxHp: e.maxHp, text });
}

export function checkPhases(B, e) {
  if (!e.phases || !e.phases.length) return;
  const frac = e.hp / e.maxHp;
  e.phases.forEach((ph, i) => {
    if (e.phaseDone.has(i) || frac > ph.below) return;
    e.phaseDone.add(i);
    if (ph.set) { Object.assign(e, ph.set); if (ph.set.name) e.display = ph.set.name; }
    if (ph.removeMoves) e.moves = e.moves.filter((m) => !ph.removeMoves.includes(m.id));
    if (ph.addMoves) e.moves = e.moves.concat(ph.addMoves.map((m) => B.normalizeMove(m)));
    if (ph.skipTurn) e.flags.skipNext = ph.skipText || true;
    if (ph.text) push(B, { t: 'phase', actor: e.id, index: i, text: capFirst(fill(ph.text, { ACTOR: nameOf(e) })) });
    if (ph.spare && isUp(e)) {
      e.gone = 'spared'; e.status = {}; e.buffs = {};
      push(B, { t: 'spared', target: e.id, text: e.spareText || say(B, 'spared', { TARGET: nameOf(e) }) });
    }
  });
}

export function healTarget(B, source, target, amount, opt = {}) {
  const max = effMaxHp(target);
  const amt = Math.max(0, Math.min(amount, max - target.hp));
  target.hp += amt;
  push(B, { t: 'heal', actor: source ? source.id : null, target: target.id, side: target.side, amount: amt,
    hp: target.hp, maxHp: max, text: say(B, 'heal', { TARGET: nameOf(target), N: amt }), ...opt });
  return amt;
}

// ---------------------------------------------------------------------------------------------------------
// Status & buffs

const DEFAULT_TURNS = { sleep: [2, 4], confuse: [2, 3], dazzle: [2, 2], root: [1, 3], hiccup: [2, 2], silence: [3, 3],
  swallowed: [1, 1], hidden: [1, 1], fluffed: [1, 1], guard: [2, 2], poison: [99, 99], hexed: [99, 99] };

/**
 * Try to land a status. `chance` is the base landing chance (1 = always). Returns true if it landed.
 * Enemy-cast statuses on the party are softened at S >= 40 (x0.75).
 */
export function tryStatus(B, source, target, id, { chance = 1, turns, silentResist = false } = {}) {
  if (!isUp(target)) return false;
  let p = chance;
  if (source && source.side === 'enemy' && target.side === 'party') p *= B.fx.enemyStatusMult;
  if (target.side === 'enemy' && target.resist && target.resist[id] != null) p *= target.resist[id];
  if (statusImmune(target, id)) p = 0;
  if (target.status[id] && id !== 'guard') p = 0;
  if (!B.rng.chance(p)) {
    if (!silentResist) push(B, { t: 'status', target: target.id, status: id, on: false, resisted: true,
      text: say(B, 'resist', { TARGET: nameOf(target) }) });
    return false;
  }
  const [a, b] = turns ? (Array.isArray(turns) ? turns : [turns, turns]) : (DEFAULT_TURNS[id] || [2, 2]);
  target.status[id] = B.rng.int(a, b);
  if (id === 'hexed') target.hp = Math.min(target.hp, effMaxHp(target));
  push(B, { t: 'status', target: target.id, status: id, on: true, turns: target.status[id],
    text: say(B, 'status.' + id, { TARGET: nameOf(target) }) });
  return true;
}

export function clearStatus(B, target, id, quiet = false) {
  if (!target.status[id]) return false;
  delete target.status[id];
  if (!quiet) push(B, { t: 'status', target: target.id, status: id, on: false,
    text: say(B, 'end.' + id, { TARGET: nameOf(target) }) });
  return true;
}

/**
 * buff spec: {stat:'def', step:0.25, max:1.5, turns:5} (stacking) or {stat:'atk', mult:0.85, turns:3} (set).
 */
export function applyBuff(B, target, spec) {
  if (!isUp(target)) return false;
  const cur = target.buffs[spec.stat];
  let mult;
  if (spec.step) {
    const base = cur ? cur.mult : 1;
    const lim = spec.max ?? (spec.step > 0 ? 1.5 : 0.5);
    mult = spec.step > 0 ? Math.min(lim, base + spec.step) : Math.max(lim, base + spec.step);
    if (cur && Math.abs(mult - base) < 1e-9) {
      push(B, { t: 'status', target: target.id, status: spec.stat + (spec.step > 0 ? '_up' : '_down'), on: false, maxed: true,
        text: say(B, 'buff.max', { TARGET: nameOf(target), STATWORD: STAT_WORDS[spec.stat] ? STAT_WORDS[spec.stat][0] : 'better' }) });
      return false;
    }
  } else mult = spec.mult;
  target.buffs[spec.stat] = { mult, turns: spec.turns || 5 };
  const up = mult >= 1;
  push(B, { t: 'status', target: target.id, status: spec.stat + (up ? '_up' : '_down'), on: true, mult,
    turns: spec.turns || 5, text: say(B, (up ? 'buff.' : 'debuff.') + spec.stat, { TARGET: nameOf(target) }) });
  return true;
}

// ---------------------------------------------------------------------------------------------------------
// Physical attacks

/** One physical swing from actor at target. opts: {power, hits, critRate, noCrit, big, element, statusOnHit} */
export function physicalHit(B, actor, target, opts = {}) {
  const power = opts.power ?? 1;
  const tName = nameOf(target);
  const missEv = (reason, key) => {
    push(B, { t: 'damage', actor: actor.id, target: target.id, side: target.side, amount: 0, crit: false, miss: true,
      reason, hp: target.hp, maxHp: effMaxHp(target),
      text: say(B, key, { ACTOR: nameOf(actor), TARGET: tName }) });
  };
  if (!isUp(target)) return 0;
  if (target.side === 'enemy' && target.untouchable) { missEv('unreachable', 'miss.unreachable'); return 0; }
  if (target.status.hidden) { missEv('hidden', 'miss.hidden'); return 0; }
  if (target.status.swallowed) { missEv('swallowed', 'miss.swallowed'); return 0; }
  if (target.status.fluffed) { missEv('fluffed', 'miss.fluffed'); return 0; }
  if (target.status.guard) { delete target.status.guard; missEv('blocked', 'miss.blocked'); return 0; }

  const partyAttacker = actor.side === 'party';
  const missP = partyAttacker
    ? playerMissChance({ evade: target.evade || 0, luck: actor.luck, blinded: !!actor.status.dazzle, lastMissed: actor.flags.lastMissed })
    : enemyMissChance({ nimble: target.nimble || 0, blinded: !!actor.status.dazzle, lastMissed: actor.flags.lastMissed });
  if (B.rng.chance(missP)) {
    actor.flags.lastMissed = true;
    if (partyAttacker) B.stats.playerMisses++;
    missEv('miss', partyAttacker ? 'miss.party' : 'miss.enemy');
    return 0;
  }
  actor.flags.lastMissed = false;

  const atk = effAtk(actor), def = effDef(target);
  let crit = false;
  if (!opts.noCrit && !opts.big) {
    const cc = partyAttacker ? critChance(actor.luck, B.S) : (B.fx.noEnemyCrit ? 0 : (opts.critRate ?? enemyCritChance(B.S)));
    crit = B.rng.chance(cc);
  }
  let dmg;
  if (opts.fixed != null) { crit = false; dmg = opts.fixed; }
  else if (crit) { dmg = critDamage(atk, def, B.rng, power); B.stats.crits += partyAttacker ? 1 : 0; B.stats.enemyCrits += partyAttacker ? 0 : 1; }
  else {
    const varMax = partyAttacker ? 1.12 : B.fx.enemyVarMax;
    dmg = physicalDamage(atk, def, B.rng, { varMax, power }).amount;
  }
  if (opts.element) dmg = Math.max(1, round(dmg * elementMult(target, opts.element)));
  const dealt = applyDamage(B, actor, target, dmg, { crit, big: opts.big, element: opts.element });
  if (isUp(target) && opts.statusOnHit) {
    const s = opts.statusOnHit;
    tryStatus(B, actor, target, s.id, { chance: s.chance ?? 1, turns: s.turns, silentResist: true });
  }
  if (isUp(target) && partyAttacker && actor.gear && actor.gear.stun && !target.boss) {
    tryStatus(B, actor, target, 'root', { chance: actor.gear.stun, turns: 1, silentResist: true });
  }
  return dealt;
}

export function doAttack(B, actor, targetId) {
  push(B, { t: 'act', actor: actor.id, kind: 'attack', text: say(B, 'attack', { ACTOR: nameOf(actor) }) });
  if (actor.side === 'party' && actor.gear && actor.gear.allEnemies) {
    for (const t of B.enemies.filter(targetable)) physicalHit(B, actor, t, { power: actor.gear.allEnemies });
    return;
  }
  const t = retarget(B, actor, targetId, actor.side === 'party' ? 'enemy' : 'party');
  if (!t) { push(B, { t: 'message', text: say(B, 'lookaround', { ACTOR: nameOf(actor) }) }); return; }
  physicalHit(B, actor, t, {});
}

// ---------------------------------------------------------------------------------------------------------
// Spells (party and enemy)

export function spellCost(actor, spell) {
  return actor.mpCost && actor.mpCost[spell.id] != null ? actor.mpCost[spell.id] : (spell.mp || 0);
}

/** Pre-flight check shared by command validation and resolution. Returns null if fine, else {reason, text}. */
export function spellProblem(B, actor, spell, targetId, { atResolve = false } = {}) {
  if (!spell) return { reason: 'unknown', text: 'That spell has wandered off.' };
  if (spell.battle === false || spell.kind === 'field') return { reason: 'field', text: `${spell.name} only works out on the road.` };
  if (actor.status.silence) return { reason: 'silenced', text: say(B, 'spell.silenced', { ACTOR: nameOf(actor) }) };
  if (actor.mp < spellCost(actor, spell)) return { reason: 'nomp', text: say(B, 'spell.nomp', { ACTOR: nameOf(actor) }) };
  const allies = actor.side === 'party' ? B.party : B.enemies;
  if (spell.kind === 'heal' || spell.kind === 'fullheal') {
    const t = byId(B, targetId);
    if (t && isUp(t) && t.hp >= effMaxHp(t)) return { reason: 'full', text: say(B, 'heal.full', { TARGET: nameOf(t) }) };
    if (!atResolve && (!t || !isUp(t) || !allies.includes(t))) return { reason: 'target', text: 'Choose a friend who is still standing.' };
  }
  if (spell.kind === 'healAll' && !allies.filter(isUp).some((c) => c.hp < effMaxHp(c))) {
    return { reason: 'full', text: say(B, 'heal.allfull') };
  }
  if (spell.kind === 'revive') {
    const t = byId(B, targetId);
    if (t && isUp(t)) return { reason: 'notneeded', text: say(B, 'revive.notneeded', { TARGET: nameOf(t) }) };
    if (!atResolve && (!t || !allies.includes(t))) return { reason: 'target', text: 'Choose a friend who is worn out.' };
  }
  if (spell.kind === 'escape' && (B.isBoss || B.scripted)) {
    return { reason: 'boss', text: B.scripted ? say(B, 'flee.scripted') : B.fleeRefusalText() };
  }
  return null;
}

export function doSpell(B, actor, spellId, targetId) {
  const spell = B.data.spells[spellId];
  const aName = nameOf(actor);
  if (!spell) { push(B, { t: 'message', text: say(B, 'spell.fizzle') }); return; }
  if (actor.status.silence) {
    push(B, { t: 'act', actor: actor.id, kind: 'spell', spell: spell.id, text: say(B, 'spell.cast', { ACTOR: aName, SPELL: spell.name }) });
    push(B, { t: 'message', text: say(B, 'spell.fizzle') });
    return;
  }
  const cost = spellCost(actor, spell);
  if (actor.mp < cost) {
    if (actor.side === 'enemy') return doAttack(B, actor, null);
    push(B, { t: 'act', actor: actor.id, kind: 'spell', spell: spell.id, text: say(B, 'spell.nomp', { ACTOR: aName }) });
    return;
  }
  push(B, { t: 'act', actor: actor.id, kind: 'spell', spell: spell.id, element: spell.element || null,
    text: say(B, 'spell.cast', { ACTOR: aName, SPELL: spell.name }) });
  const prob = spellProblem(B, actor, spell, targetId, { atResolve: true });
  if (prob && prob.reason !== 'nomp') { push(B, { t: 'message', refunded: true, text: prob.text }); return; }

  const foes = actor.side === 'party' ? B.enemies : B.party;
  const friends = actor.side === 'party' ? B.party : B.enemies;
  const pay = () => { actor.mp -= cost; B.stats.mpSpent += actor.side === 'party' ? cost : 0; };

  switch (spell.kind) {
    case 'damage': {
      pay();
      const targets = spell.target === 'enemies' ? foes.filter(targetable) : [retarget(B, actor, targetId, actor.side === 'party' ? 'enemy' : 'party')].filter(Boolean);
      let refunded = false;
      for (const t of targets) {
        if (t.side === 'enemy' && t.untouchable) {
          push(B, { t: 'damage', actor: actor.id, target: t.id, side: t.side, amount: 0, miss: true, reason: 'unreachable', hp: t.hp, maxHp: t.maxHp, text: say(B, 'miss.unreachable') });
          continue;
        }
        const em = elementMult(t, spell.element);
        if (em === 0) {
          if (!refunded && actor.side === 'party') { actor.mp += Math.floor(cost / 2); refunded = true; }
          push(B, { t: 'damage', actor: actor.id, target: t.id, side: t.side, amount: 0, miss: true, reason: 'immune', element: spell.element, hp: t.hp, maxHp: t.maxHp, text: say(B, 'noeffect') });
          continue;
        }
        const bonus = spell.element && actor.gear && actor.gear.elementBonus ? (actor.gear.elementBonus[spell.element] || 0) : 0;
        const r = spellDamage(spell, actor.mag * (1 + bonus), { elementMult: em * spellGuard(t), mdef: effMdef(t), pierce: spell.pierce || 0 }, B.rng);
        applyDamage(B, actor, t, r.amount, { element: spell.element });
      }
      return;
    }
    case 'heal': {
      const t = retargetFriend(B, actor, targetId);
      if (!t) return;
      if (t.hp >= effMaxHp(t)) { push(B, { t: 'message', refunded: true, text: say(B, 'heal.full', { TARGET: nameOf(t) }) }); return; }
      pay();
      const r = healAmount(spell, actor.mag, effMaxHp(t) - t.hp, B.rng);
      healTarget(B, actor, t, Math.max(1, r.amount));
      return;
    }
    case 'fullheal': {
      const t = retargetFriend(B, actor, targetId);
      if (!t) return;
      pay();
      healTarget(B, actor, t, effMaxHp(t) - t.hp);
      return;
    }
    case 'healAll': {
      pay();
      for (const t of friends.filter(isUp)) {
        const missing = effMaxHp(t) - t.hp;
        if (missing <= 0) continue;
        const r = healAmount(spell, actor.mag, missing, B.rng);
        healTarget(B, actor, t, Math.max(1, r.amount));
      }
      return;
    }
    case 'revive': {
      let t = byId(B, targetId);
      if (!t || isUp(t) || !friends.includes(t)) t = friends.find((c) => !isUp(c) && !c.gone);
      if (!t) { push(B, { t: 'message', refunded: true, text: 'Nobody needs rousing.' }); return; }
      pay();
      revive(B, actor, t, spell.pct ?? 0.5);
      return;
    }
    case 'cure': {
      const t = retargetFriend(B, actor, targetId, true);
      if (!t) return;
      pay();
      cure(B, t, spell.cures || []);
      return;
    }
    case 'buff': {
      pay();
      const targets = spell.target === 'allies' ? friends.filter(isUp) : [retargetFriend(B, actor, targetId, true)].filter(Boolean);
      for (const t of targets) applyBuff(B, t, spell.buff);
      return;
    }
    case 'debuff': {
      pay();
      const targets = spell.target === 'enemies' ? foes.filter(targetable) : [retarget(B, actor, targetId, actor.side === 'party' ? 'enemy' : 'party')].filter(Boolean);
      for (const t of targets) {
        const land = spell.land ? (t.boss ? spell.land.boss : spell.land.normal) : 1;
        const p = land * (actor.side === 'enemy' ? B.fx.enemyStatusMult : 1) * reflectFactor(t, spell);
        if (reflects(t, spell)) { reflectMessage(B, t); if (B.rng.chance(land)) applyBuff(B, actor, spell.buff); continue; }
        if (B.rng.chance(p)) applyBuff(B, t, spell.buff);
        else push(B, { t: 'status', target: t.id, status: spell.buff.stat + '_down', on: false, resisted: true, text: say(B, 'resist', { TARGET: nameOf(t) }) });
      }
      return;
    }
    case 'sleep': {
      pay();
      const targets = spell.target === 'enemies' ? foes.filter(targetable) : [retarget(B, actor, targetId)].filter(Boolean);
      for (const t of targets) {
        if (reflects(t, spell)) { reflectMessage(B, t); tryStatus(B, t, actor, 'sleep', { chance: sleepLandChance(actor.luck, actor.resil || 0), turns: spell.turns }); continue; }
        const resil = t.side === 'enemy' ? (t.resil ?? t.def) : t.resil;
        tryStatus(B, actor, t, 'sleep', { chance: sleepLandChance(actor.luck, resil || 0), turns: spell.turns || [2, 4] });
      }
      return;
    }
    case 'root': {
      pay();
      const t = retarget(B, actor, targetId, actor.side === 'party' ? 'enemy' : 'party');
      if (!t) return;
      if (t.boss) {
        if (B.bossRooted.has(t.id)) { push(B, { t: 'status', target: t.id, status: 'root', on: false, resisted: true, text: `${capFirst(nameOf(t))} has already learnt that trick.` }); return; }
        B.bossRooted.add(t.id);
        tryStatus(B, actor, t, 'root', { chance: 1, turns: 1 });
      } else tryStatus(B, actor, t, 'root', { chance: spell.chance ?? 0.9, turns: spell.turns || [1, 3] });
      return;
    }
    case 'status': {
      pay();
      const targets = spell.target === 'enemies' ? foes.filter(targetable) : [retarget(B, actor, targetId)].filter(Boolean);
      for (const t of targets) tryStatus(B, actor, t, spell.status, { chance: spell.chance ?? 0.6, turns: spell.turns });
      return;
    }
    case 'escape': {
      pay();
      B.endFled(true);
      return;
    }
    default:
      push(B, { t: 'message', text: say(B, 'spell.fizzle') });
  }
}

function reflects(t, spell) {
  return t.side === 'party' && t.gear && t.gear.reflect && t.gear.reflect.includes(spell.id);
}
function reflectFactor(t, spell) { return reflects(t, spell) ? 0 : 1; }
function reflectMessage(B, t) {
  push(B, { t: 'message', target: t.id, text: `${capFirst(nameOf(t))}'s shield flashes and throws the spell straight back!` });
}

function retargetFriend(B, actor, targetId, allowFull = false) {
  const friends = actor.side === 'party' ? B.party : B.enemies;
  let t = byId(B, targetId);
  if (t && isUp(t) && friends.includes(t)) return t;
  const hurt = friends.filter(isUp).sort((a, b) => a.hp / effMaxHp(a) - b.hp / effMaxHp(b));
  t = hurt[0];
  if (!t) return null;
  if (!allowFull && t.hp >= effMaxHp(t)) { push(B, { t: 'message', refunded: true, text: say(B, 'heal.allfull') }); return null; }
  return t;
}

export function revive(B, source, t, pct = 0.5) {
  t.hp = Math.max(1, Math.ceil(effMaxHp(t) * pct));
  B.stats.revives++;
  push(B, { t: 'revive', actor: source ? source.id : null, target: t.id, hp: t.hp, maxHp: effMaxHp(t),
    text: say(B, 'revive', { TARGET: nameOf(t) }) });
}

export function cure(B, t, list) {
  const had = list.filter((s) => t.status[s]);
  if (!had.length) { push(B, { t: 'message', target: t.id, text: say(B, 'cure.nothing', { TARGET: nameOf(t) }) }); return; }
  for (const s of had) delete t.status[s];
  push(B, { t: 'status', target: t.id, status: had.join(','), on: false, cured: had, text: say(B, 'cure', { TARGET: nameOf(t) }) });
}

// ---------------------------------------------------------------------------------------------------------
// Items

export function itemProblem(B, actor, item, targetId) {
  if (!item) return { reason: 'unknown', text: 'That is not in the bag.' };
  if (!(B.bag[item.id] > 0)) return { reason: 'none', text: say(B, 'item.none', { ACTOR: nameOf(actor) }) };
  const eff = item.battle;
  if (!eff) return { reason: 'field', text: `The ${item.name} won't help in a fight.` };
  const t = byId(B, targetId);
  if (eff.effect === 'heal') {
    if (t && isUp(t) && t.hp >= effMaxHp(t)) return { reason: 'full', text: say(B, 'heal.full', { TARGET: nameOf(t) }) };
    if (t && !isUp(t)) return { reason: 'target', text: `${nameOf(t)} is worn out. A Herb won't do it.` };
  }
  if (eff.effect === 'mp' && t && isUp(t) && t.mp >= t.maxMp) return { reason: 'full', text: say(B, 'mp.full', { TARGET: nameOf(t) }) };
  if (eff.effect === 'revive' && t && isUp(t)) return { reason: 'notneeded', text: say(B, 'revive.notneeded', { TARGET: nameOf(t) }) };
  return null;
}

export function doItem(B, actor, itemId, targetId) {
  const item = B.data.items[itemId];
  if (!item || !(B.bag[itemId] > 0)) {
    push(B, { t: 'act', actor: actor.id, kind: 'item', item: itemId, text: say(B, 'item.none', { ACTOR: nameOf(actor) }) });
    return;
  }
  const eff = item.battle || {};
  push(B, { t: 'act', actor: actor.id, kind: 'item', item: item.id, text: say(B, 'item.use', { ACTOR: nameOf(actor), ITEM: item.name }) });
  const use = () => { B.bag[itemId]--; if (B.bag[itemId] <= 0) delete B.bag[itemId]; B.itemsUsed[itemId] = (B.itemsUsed[itemId] || 0) + 1; };
  switch (eff.effect) {
    case 'heal': {
      const t = retargetFriend(B, actor, targetId);
      if (!t) return;
      use();
      const amt = eff.amount === 'full' ? effMaxHp(t) : eff.amount;
      healTarget(B, actor, t, amt);
      return;
    }
    case 'mp': {
      let t = byId(B, targetId);
      if (!t || !isUp(t)) t = actor;
      if (t.mp >= t.maxMp) { push(B, { t: 'message', refunded: true, text: say(B, 'mp.full', { TARGET: nameOf(t) }) }); return; }
      use();
      const amt = Math.min(eff.amount, t.maxMp - t.mp);
      t.mp += amt;
      push(B, { t: 'heal', actor: actor.id, target: t.id, side: t.side, mp: true, amount: amt, hp: t.hp, maxHp: effMaxHp(t),
        text: say(B, 'mp', { TARGET: nameOf(t), N: amt }) });
      return;
    }
    case 'cure': {
      const t = retargetFriend(B, actor, targetId, true);
      if (!t) return;
      use();
      cure(B, t, eff.statuses || []);
      return;
    }
    case 'revive': {
      let t = byId(B, targetId);
      if (!t || isUp(t) || !B.party.includes(t)) t = B.party.find((c) => !isUp(c));
      if (!t) { push(B, { t: 'message', refunded: true, text: 'Nobody needs it right now.' }); return; }
      use();
      revive(B, actor, t, eff.pct ?? 0.5);
      return;
    }
    case 'damageAll': {
      use();
      for (const t of B.enemies.filter(targetable)) {
        const em = elementMult(t, eff.element);
        if (em === 0) { push(B, { t: 'damage', actor: actor.id, target: t.id, side: 'enemy', amount: 0, miss: true, reason: 'immune', hp: t.hp, maxHp: t.maxHp, text: say(B, 'noeffect') }); continue; }
        applyDamage(B, actor, t, Math.max(1, round(eff.amount * em * B.rng.float(0.95, 1.05))), { element: eff.element });
      }
      return;
    }
    default:
      push(B, { t: 'message', text: `Nothing much happens.` });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Monster moves (monster-only attacks from MONSTER-BIBLE entries)

/** Perform a normalized monster move. `targetHint` may be a combatant. */
export function doMove(B, e, move, targetHint) {
  const aName = nameOf(e);
  const foes = e.side === 'enemy' ? B.party : B.enemies;
  const pickFoe = () => {
    if (move.lowestHp) return foes.filter(targetable).sort((a, b) => a.hp - b.hp)[0] || null;
    if (move.targetCaster) { // "Silence the Choir" goes for whoever is carrying the most magic and still has a voice
      const st = move.status && move.status.id;
      const c = foes.filter((f) => targetable(f) && f.maxMp > 0 && !(st && f.status[st])).sort((a, b) => b.mp - a.mp)[0];
      if (c) return c;
    }
    if (targetHint && targetable(targetHint)) return targetHint;
    return e.side === 'enemy' ? pickPartyTarget(B, e) : pickEnemyTarget(B);
  };
  const actText = (tgt) => capFirst(fill(move.text || '%ACTOR% uses %MOVE%!', { ACTOR: aName, MOVE: move.name, TARGET: tgt ? nameOf(tgt) : 'everyone' }));
  e.used.set(move.id, (e.used.get(move.id) || 0) + 1);

  switch (move.kind) {
    case 'spell':
      return doSpell(B, e, move.spell, targetHint ? targetHint.id : null);
    case 'attack': {
      const targets = move.target === 'enemies' ? foes.filter(targetable)
        : move.target === 'random' ? Array.from({ length: move.hits || 1 }, () => pickFoe()).filter(Boolean)
        : [pickFoe()].filter(Boolean);
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, big: !!move.big, text: actText(targets.length === 1 ? targets[0] : null) });
      if (!targets.length) { push(B, { t: 'message', text: say(B, 'lookaround', { ACTOR: aName }) }); return; }
      if (move.big) B.stats.bigFired++;
      const hits = move.target === 'random' ? 1 : (move.hits || 1);
      for (const t of targets) {
        for (let h = 0; h < hits && isUp(t); h++) {
          if (move.selfMiss && B.rng.chance(move.selfMiss)) {
            push(B, { t: 'message', text: `${capFirst(aName)} misses completely and bonks itself!` });
            applyDamage(B, null, e, move.selfMissDamage || 3, {});
            break;
          }
          physicalHit(B, e, t, { power: move.power ?? 1, big: !!move.big, critRate: move.critRate, element: move.element, fixed: move.fixed,
            statusOnHit: move.status ? { id: move.status.id, chance: move.status.chance, turns: move.status.turns } : null });
        }
      }
      if (move.recoil && isUp(e)) applyDamage(B, null, e, move.recoil, {});
      if (move.drain && isUp(e)) healTarget(B, e, e, move.drain);
      return;
    }
    case 'magic': { // non-spell magical damage (Toll, Unlight, Frostbreath): base + wis*k vs MDEF
      const targets = move.target === 'enemies' ? foes.filter(targetable) : [pickFoe()].filter(Boolean);
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, big: !!move.big, element: move.element || null, text: actText(targets.length === 1 ? targets[0] : null) });
      if (move.big) B.stats.bigFired++;
      if (move.fx) push(B, { t: 'fx', id: move.fx, actor: e.id });
      for (const t of targets) {
        const em = elementMult(t, move.element);
        const r = spellDamage({ base: move.base || 0, k: move.k || 0.5 }, e.mag, { elementMult: em === 0 ? 0 : em * spellGuard(t), mdef: effMdef(t), pierce: move.pierce || 0 }, B.rng);
        if (r.noEffect) { push(B, { t: 'damage', actor: e.id, target: t.id, side: t.side, amount: 0, miss: true, reason: 'immune', hp: t.hp, maxHp: effMaxHp(t), text: say(B, 'noeffect') }); continue; }
        applyDamage(B, e, t, r.amount, { big: !!move.big, element: move.element });
        if (isUp(t) && move.status) tryStatus(B, e, t, move.status.id, { chance: move.status.chance ?? 1, turns: move.status.turns, silentResist: true });
      }
      return;
    }
    case 'setHp': { // "Nothing At All": everyone to 1 HP. Nobody is knocked out.
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, big: !!move.big, text: actText(null) });
      if (move.big) B.stats.bigFired++;
      for (const t of foes.filter(isUp)) {
        if (t.hp > 1) applyDamage(B, e, t, t.hp - 1, { setHp: true });
      }
      return;
    }
    case 'status': {
      const targets = move.target === 'enemies' ? foes.filter(targetable) : [pickFoe()].filter(Boolean);
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(targets.length === 1 ? targets[0] : null) });
      for (const t of targets) {
        if (t.side === 'party' && t.gear && t.gear.reflect && t.gear.reflect.includes(move.status.id)) {
          reflectMessage(B, t); tryStatus(B, t, e, move.status.id, { chance: move.status.chance ?? 0.5, turns: move.status.turns });
          continue;
        }
        tryStatus(B, e, t, move.status.id, { chance: move.status.chance ?? 0.5, turns: move.status.turns });
      }
      return;
    }
    case 'heal': {
      const pool = (e.side === 'enemy' ? B.enemies : B.party).filter(isUp);
      const targets = move.target === 'self' ? [e]
        : move.target === 'allies' ? pool
        : [pool.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]].filter(Boolean);
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(targets.length === 1 ? targets[0] : null) });
      for (const t of targets) if (t.hp < effMaxHp(t)) healTarget(B, e, t, move.amount || 20);
      if (move.healsParty) for (const t of B.party.filter(isUp)) if (t.hp < effMaxHp(t)) healTarget(B, e, t, move.amount || 20);
      return;
    }
    case 'mercy': { // Malgrim's "Listen": it gives you a moment, and every standing hero gets `pct` of their HP back
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(null) });
      for (const t of foes.filter(isUp)) {
        const max = effMaxHp(t);
        if (t.hp < max) healTarget(B, e, t, Math.max(1, Math.round(max * (move.pct ?? 0.35))));
      }
      return;
    }
    case 'buff': {
      const own = (e.side === 'enemy' ? B.enemies : B.party).filter(isUp);
      const targets = move.target === 'self' ? [e] : move.target === 'allies' ? own
        : move.target === 'enemies' ? foes.filter(targetable) : [pickFoe()].filter(Boolean);
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(targets.length === 1 ? targets[0] : null) });
      for (const t of targets) for (const spec of [].concat(move.buff)) applyBuff(B, t, spec);
      return;
    }
    case 'purge': {
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(null) });
      let any = false;
      for (const t of foes.filter(isUp)) if (Object.keys(t.buffs).some((k) => t.buffs[k].mult > 1)) {
        for (const k of Object.keys(t.buffs)) if (t.buffs[k].mult > 1) delete t.buffs[k];
        any = true;
      }
      push(B, { t: 'status', status: 'buffs', on: false, purged: true, text: any ? say(B, 'buffs.purged') : 'Nothing happens. Nobody had anything to lose.' });
      return;
    }
    case 'selfStatus': { // Burrow, Vanish, Fluff Up, Clatterguard
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(null) });
      tryStatus(B, e, e, move.status.id, { chance: 1, turns: move.status.turns || 1 });
      return;
    }
    case 'standStill': {
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(null) });
      e.flags.standStill = true;
      if (move.heal) healTarget(B, e, e, move.heal);
      return;
    }
    case 'nothing': {
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, nothing: true, text: actText(null) });
      if (move.fx) push(B, { t: 'fx', id: move.fx, actor: e.id });
      return;
    }
    case 'flee': {
      push(B, { t: 'flee', side: 'enemy', actor: e.id, ok: true, withGold: !!move.withGold,
        text: move.text ? actText(null) : say(B, 'enemy.flee', { TARGET: nameOf(e) }) });
      e.gone = 'fled';
      return;
    }
    case 'steal': {
      const [a, b] = move.gold || [1, 20];
      const n = Math.min(B.gold, B.rng.int(a, b));
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(null) });
      if (n > 0) {
        B.gold -= n; e.stolen = (e.stolen || 0) + n;
        push(B, { t: 'steal', actor: e.id, gold: n, text: say(B, 'steal', { ACTOR: aName, N: n }) });
      }
      if (B.rng.chance(move.fleeChance ?? 0.2)) {
        push(B, { t: 'flee', side: 'enemy', actor: e.id, ok: true, withGold: true, text: say(B, 'enemy.flee', { TARGET: nameOf(e) }) });
        e.gone = 'fled';
      }
      return;
    }
    case 'summon': {
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(null) });
      const room = Math.max(0, (B.options.maxEnemies || 6) - B.enemies.filter(isUp).length);
      const n = Math.min(room, move.count || 1);
      const added = [];
      for (let i = 0; i < n; i++) { const c = B.addEnemy(move.monster); if (c) added.push(c); }
      if (added.length) {
        const l = listMonsters(added);
        push(B, { t: 'summon', actor: e.id, added: added.map((c) => B.enemySummary(c)),
          text: say(B, 'summon', { LIST: l.text, VERB: l.plural ? 'come' : 'comes' }) });
      } else push(B, { t: 'message', text: 'Nobody comes. It looks a bit hurt about that.' });
      return;
    }
    case 'swallow': {
      const t = pickFoe();
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(t) });
      if (t) tryStatus(B, e, t, 'swallowed', { chance: 1, turns: 1 });
      return;
    }
    case 'pullBack': { // the Tidewarden's Undertow: one hero is dragged to the back row
      const t = pickFoe();
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(t) });
      if (t && e.side === 'enemy') {
        const i = B.party.indexOf(t);
        if (i >= 0 && i < B.party.length - 1) {
          B.party.splice(i, 1); B.party.push(t);
          push(B, { t: 'reorder', order: B.party.map((c) => c.id), text: `${t.name} is dragged to the back of the line!` });
        } else push(B, { t: 'message', text: `${t.name} digs in and stays put.` });
        if (move.power) physicalHit(B, e, t, { power: move.power });
      }
      return;
    }
    case 'echo': { // Hark repeats Hush's last move
      const partner = B.enemies.find((o) => o !== e && isUp(o) && (!move.partner || o.species === move.partner));
      const last = partner && partner.lastMoveObj;
      if (!last || last.kind === 'echo') return doAttack(B, e, targetHint ? targetHint.id : null);
      push(B, { t: 'message', actor: e.id, text: capFirst(fill(move.text || '%ACTOR% echoes %PARTNER%!', { ACTOR: nameOf(e), PARTNER: nameOf(partner) })) });
      return doMove(B, e, { ...last, big: false, telegraph: null }, targetHint);
    }
    case 'shuffle': { // Jinglebottom's Swap: switches two heroes' positions
      push(B, { t: 'act', actor: e.id, kind: 'move', move: move.id, name: move.name, text: actText(null) });
      const up = B.party.filter(isUp);
      if (up.length >= 2) {
        const i = B.party.indexOf(up[0]), j = B.party.indexOf(up[1]);
        [B.party[i], B.party[j]] = [B.party[j], B.party[i]];
        push(B, { t: 'reorder', order: B.party.map((c) => c.id), text: `${up[0].name} and ${up[1].name} have been spun round and swapped places!` });
      }
      return;
    }
    default:
      return doAttack(B, e, targetHint ? targetHint.id : null);
  }
}

// ---------------------------------------------------------------------------------------------------------
// End-of-round ticks (one line at a time, never batched — SYSTEMS §7.3)

const TIMED = ['confuse', 'dazzle', 'hiccup', 'silence', 'swallowed', 'hidden', 'fluffed', 'guard'];

export function endOfRound(B) {
  for (const c of B.party.concat(B.enemies)) {
    if (!isUp(c)) continue;
    c.flags.defending = false;
    c.flags.standStill = false;
    if (c.status.poison) {
      const n = Math.min(poisonTick(effMaxHp(c)), c.hp - 1);
      if (n > 0) {
        c.hp -= n;
        push(B, { t: 'damage', target: c.id, side: c.side, amount: n, poison: true, crit: false, miss: false, hp: c.hp, maxHp: effMaxHp(c),
          text: say(B, 'poison.tick', { TARGET: nameOf(c), N: n }) });
      }
    }
    for (const s of TIMED) {
      if (!c.status[s]) continue;
      c.status[s]--;
      if (c.status[s] <= 0) {
        delete c.status[s];
        if (s === 'guard' || s === 'fluffed') continue;
        push(B, { t: 'status', target: c.id, status: s, on: false, text: say(B, 'end.' + s, { TARGET: nameOf(c) }) });
      }
    }
    for (const k of Object.keys(c.buffs)) {
      const b = c.buffs[k];
      if (--b.turns <= 0) {
        delete c.buffs[k];
        push(B, { t: 'status', target: c.id, status: k + (b.mult >= 1 ? '_up' : '_down'), on: false, expired: true,
          text: say(B, 'buff.end', { TARGET: nameOf(c), STATNAME: STAT_WORDS[k] ? STAT_WORDS[k][1] : k }) });
      }
    }
    if (c.side === 'party' && c.gear && c.gear.mpRegen && c.mp < c.maxMp) {
      const n = Math.min(c.gear.mpRegen, c.maxMp - c.mp);
      c.mp += n;
      push(B, { t: 'heal', target: c.id, side: c.side, mp: true, amount: n, hp: c.hp, maxHp: effMaxHp(c), quiet: true,
        text: say(B, 'regen', { TARGET: nameOf(c), N: n }) });
    }
    // "cannot use it again for 3 rounds": the round it fires does not count
    if (c.side === 'enemy' && c.bigCooldown > 0 && c.lastBigRound !== B.round) c.bigCooldown--;
  }
}

export { BIG_ATTACK_COOLDOWN, clamp };
