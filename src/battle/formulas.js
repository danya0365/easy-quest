// src/battle/formulas.js — P19. Every number in docs/SYSTEMS-BIBLE.md §1, §2.1, §6, §11 as a pure function.
// No DOM, no Three.js, no state. Randomness only through the rng passed in (see makeRng).

import { EXP_TABLE, LEVEL_CAP, levelForExp, expForLevel, expToNext, lerpAnchors } from '../data/growth.js';

export { levelForExp, expForLevel, expToNext, EXP_TABLE, LEVEL_CAP };
export const statsAtLevel = lerpAnchors;

export const round = (x) => (x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5 + 1e-9));
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------------------------------------------------------------------------------------------------------
// RNG — deterministic, serialisable. Accepts: a seed number/string, a () => [0,1) function, an object with
// next()/random()/float(), or an existing makeRng() result.

export function makeRng(src = 1) {
  if (src && src.__dqRng) return src;
  let next, getState = () => null, setState = () => {};
  if (typeof src === 'function') next = src;
  else if (src && typeof src === 'object') {
    const f = src.next || src.random || src.float;
    if (typeof f !== 'function') throw new Error('makeRng: object rng needs next()/random()');
    next = () => { const v = f.length >= 2 ? f.call(src, 0, 1) : f.call(src); return v; };
  } else {
    // mulberry32
    let s = typeof src === 'string' ? hashString(src) : (Number(src) >>> 0) || 0x9e3779b9;
    next = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    getState = () => s;
    setState = (v) => { s = v >>> 0; };
  }
  const r = {
    __dqRng: true,
    next,
    float: (a = 0, b = 1) => a + (b - a) * next(),
    /** inclusive integer */
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted(items, w = (x) => x.weight ?? 1) {
      const ws = items.map((x) => Math.max(0, w(x)));
      const tot = ws.reduce((a, b) => a + b, 0);
      if (tot <= 0) return null;
      let roll = next() * tot;
      for (let i = 0; i < items.length; i++) { roll -= ws[i]; if (roll < 0) return items[i]; }
      return items[items.length - 1];
    },
    get state() { return getState(); },
    set state(v) { setState(v); },
  };
  return r;
}

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------------------------------------------------
// §1.2 derived values

/**
 * @param stats  {hp, mp, might, nimble, resil, wis, luck}
 * @param gear   summed gear {power, def, mdef, agi, wis, luck, maxHp, maxMp, resil}
 */
export function derive(stats, gear = {}) {
  const resil = stats.resil + (gear.resil || 0);
  const wis = stats.wis + (gear.wis || 0);
  return {
    maxHp: Math.max(1, stats.hp + (gear.maxHp || 0)),
    maxMp: Math.max(0, stats.mp + (gear.maxMp || 0)),
    atk: stats.might + (gear.power || 0),
    def: Math.floor(resil / 2) + (gear.def || 0),
    mag: wis,
    mdef: Math.floor(wis / 3) + (gear.mdef || 0),
    spd: Math.max(1, stats.nimble + (gear.agi || 0)),
    luck: stats.luck + (gear.luck || 0),
  };
}

// §1.3 physical damage
export const PHYS_VARIANCE = [0.90, 1.12];

export function physicalRaw(atk, def) { return atk - def / 2; }

export function physicalDamage(atk, def, rng, { varMin = 0.90, varMax = 1.12, power = 1 } = {}) {
  const raw = physicalRaw(atk, def);
  let dmg, chip = false;
  if (raw <= 3) { dmg = 1 + rng.int(0, 2); chip = true; }
  else dmg = raw * 0.60 * rng.float(varMin, varMax);
  dmg = Math.max(1, round(dmg * power));
  return { amount: dmg, raw, chip };
}

/** Mean of the normal (non-crit) hit, used for the crit floor. */
export function avgNormalHit(atk, def) {
  const raw = physicalRaw(atk, def);
  return raw <= 3 ? 2 : raw * 0.60 * 1.01;
}

// §1.4 hitting and missing
export function playerMissChance({ evade = 0, luck = 0, blinded = false, lastMissed = false }) {
  if (lastMissed) return 0;
  return Math.max(0, evade + (blinded ? 0.25 : 0) - Math.min(0.03, luck / 1000));
}
/** "Enemies miss the player on the same maths using the player's Nimbleness/1000" (capped at 8%). */
export function enemyMissChance({ nimble = 0, blinded = false, lastMissed = false }) {
  if (lastMissed) return 0;
  return Math.max(0, Math.min(0.08, nimble / 1000) + (blinded ? 0.25 : 0));
}

// §1.5 critical hits
export function critChance(luck, S = 0) {
  let c = Math.min(0.16, 0.031 + luck / 512);
  if (S >= 40) c += 0.03;
  return c;
}
export const ENEMY_CRIT = 1 / 64;
export function enemyCritChance(S = 0) { return S >= 30 ? 0 : ENEMY_CRIT; }

export function critDamage(atk, def, rng, power = 1) {
  const c = atk * 0.90 * rng.float(0.95, 1.15);
  return Math.max(1, round(Math.max(c, avgNormalHit(atk, def) * 1.75) * power));
}

// §1.6 spell damage
export function spellDamage(spell, mag, { elementMult = 1, mdef = 0, pierce = 0 } = {}, rng) {
  if (elementMult === 0) return { amount: 0, noEffect: true };
  const base = spell.base + mag * spell.k;
  const effMdef = mdef * (1 - pierce);
  const dmg = base * elementMult * (1 - Math.min(0.60, effMdef / 200)) * rng.float(0.92, 1.08);
  return { amount: Math.max(1, round(dmg)), noEffect: false };
}

// §1.7 healing — returns {amount, rolled}; amount never exceeds the missing HP.
export function healAmount(spell, mag, missing, rng) {
  const rolled = round((spell.base + mag * spell.k) * rng.float(0.95, 1.10));
  return { amount: Math.max(0, Math.min(rolled, missing)), rolled };
}

// §1.8 turn order
export function initiative(spd, isPlayer, rng) {
  return spd * rng.float(0.75, 1.25) * (isPlayer ? 1.10 : 1.00);
}
/** sort actors [{init, side}] descending; ties break toward the player. */
export function sortInitiative(list) {
  return list.sort((a, b) => (b.init - a.init) || ((a.side === 'party' ? 0 : 1) - (b.side === 'party' ? 0 : 1)));
}

/** First strike / ambush (§1.8). Returns 'party' | 'enemy' | null. */
export function ambushRoll(rng, { S = 0, protectedMap = false, boss = false } = {}) {
  if (boss) return null;
  const r = rng.next();
  if (r < 0.06) return 'party';
  if (r < 0.10 && S < 25 && !protectedMap) return 'enemy';
  return null;
}

// §1.9 fleeing
export function fleeChance(partyAvgAgi, enemyAvgAgi, fails = 0) {
  if (fails >= 2) return 1;
  const p = 0.55 + 0.40 * (partyAvgAgi / Math.max(1e-6, partyAvgAgi + enemyAvgAgi)) + 0.25 * fails;
  return Math.min(1, p);
}
export const FAILED_FLEE_DAMAGE = 0.75;

// §2.1 EXP
export function catchUpMultiplier(lvl, partyHighest) {
  const gap = partyHighest - lvl;
  if (gap >= 6) return 3;
  if (gap >= 3) return 2;
  return 1;
}

// §3 control — Snoozle landing
export function sleepLandChance(casterLuck, targetRes) {
  return clamp(0.55 + (casterLuck - targetRes) / 120, 0.15, 0.85);
}

// §5 economy helpers the battle needs
/** §6.1.3 + §6.2 — gold after a party wipe. */
export function defeatGold(gold) { return Math.max(30, Math.floor(gold / 2)); }

// §6.3 bosses telegraph
export function bigAttackCap(rolled, { expectedMaxHP, currentHP, firstUse, S = 0 }) {
  const pct = S >= 75 ? 0.45 : 0.55;
  let d = rolled;
  if (expectedMaxHP) d = Math.min(d, Math.floor(pct * expectedMaxHP));
  if (firstUse) d = Math.min(d, Math.floor(0.80 * currentHP));
  return Math.max(1, d);
}
export const BIG_ATTACK_COOLDOWN = 3;

// §6.4 the rubber band — effects by S (never shown to the player)
export function assistEffects(S = 0) {
  return {
    tier: S >= 75 ? 6 : S >= 60 ? 5 : S >= 40 ? 4 : S >= 30 ? 3 : S >= 25 ? 2 : S >= 15 ? 1 : 0,
    enemyVarMax: S >= 15 ? 1.00 : 1.12,
    noEnemyAmbush: S >= 25,
    herbDropMult: S >= 25 ? 1.5 : 1,
    noEnemyCrit: S >= 30,
    playerCritBonus: S >= 40 ? 0.03 : 0,
    enemyStatusMult: S >= 40 ? 0.75 : 1,
    secondWind: S >= 60,
    rewardMult: S >= 75 ? 1.2 : 1,
    bigCapPct: S >= 75 ? 0.45 : 0.55,
  };
}
export function assistTier(S) { return assistEffects(S).tier; }

/**
 * §6.4 struggle-score delta for one finished battle.
 * @param sum {outcome, boss, koCount, rounds, lowHpAll, levelsGained, nobodyBelow60}
 */
export function assistDelta(sum) {
  let d = 0;
  if (sum.outcome === 'defeat') d += 12;
  if (sum.outcome === 'victory' && sum.koCount > 0) d += 6;
  if (sum.rounds > 8) d += 4;
  if (sum.outcome === 'fled' && !sum.boss) d += 3;
  if (sum.lowHpAll) d += 2;
  if (sum.outcome === 'victory' && sum.boss) d -= 5;
  d -= 2 * (sum.levelsGained || 0);
  if (sum.outcome === 'victory' && sum.nobodyBelow60) d -= 1;
  return d;
}
export function applyAssist(S, delta) { return clamp(S + delta, 0, 100); }

// §6.5 the floor — nothing in a normal encounter deals more than 40% of max HP in one hit.
export const NORMAL_HIT_CAP = 0.40;

// MONSTER-BIBLE §7 + SYSTEMS §10.3 befriending
export function recruitChance({ base, kidMode = true, heroLvl = 1, monsterLvl = 1, charmBell = false,
  duplicate = false, pity = false }) {
  if (!base) return 0;
  const b = duplicate ? base / 2 : base;
  const gap = clamp(1 + 0.04 * (heroLvl - monsterLvl), 0.6, 1.8);
  let p = b * (kidMode ? 2 : 1) * gap * (charmBell ? 1.5 : 1);
  if (pity) p *= 3;
  return Math.min(0.5, p);
}
export const RECRUIT_GUARANTEE_AFTER = 12;  // refused or missed 12 times -> guaranteed on the 13th
export const RECRUIT_PITY_BATTLES = 30;

// poison: provisional (SYSTEMS names poison but gives no tick). Never knocks anyone out on its own.
export function poisonTick(maxHp) { return Math.max(1, Math.floor(maxHp / 12)); }

/** Sum gear pieces into one {power, def, mdef, agi, wis, luck, maxHp, resil, ...} bag. */
export function sumGear(pieces) {
  const out = { power: 0, def: 0, mdef: 0, agi: 0, wis: 0, luck: 0, maxHp: 0, maxMp: 0, resil: 0, mpRegen: 0,
    allEnemies: 0, stun: 0, halves: [], immune: [], reflect: [], elementBonus: {}, spellGuard: 1 };
  for (const p of pieces) {
    if (!p) continue;
    for (const k of ['power', 'def', 'mdef', 'agi', 'wis', 'luck', 'maxHp', 'maxMp', 'resil', 'mpRegen', 'stun']) {
      out[k] += p[k] || 0;
    }
    for (const [el, v] of Object.entries(p.elementBonus || {})) out.elementBonus[el] = (out.elementBonus[el] || 0) + v;
    if (p.spellGuard != null) out.spellGuard *= p.spellGuard;
    if (p.allEnemies) out.allEnemies = Math.max(out.allEnemies, p.allEnemies);
    for (const k of ['halves', 'immune', 'reflect']) if (p[k]) out[k].push(...p[k]);
  }
  return out;
}
