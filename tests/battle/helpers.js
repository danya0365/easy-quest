// tests/battle/helpers.js — shared test helpers (not a test file).
import { createBattle } from '../../src/battle/battle.js';
import { newMember } from '../../src/data/growth.js';
import DATA from './data.js';

export { DATA, newMember, createBattle };

/** An rng whose float() returns a fixed factor (or the midpoint) — for worked examples. */
export function fixedRng({ float = null, int = null, next = 0.5, chance = null } = {}) {
  return {
    __dqRng: true,
    next: () => next,
    float: (a, b) => (float != null ? float : (a + b) / 2),
    int: (a, b) => (int != null ? int : a),
    chance: (p) => (chance != null ? chance : next < p),
    pick: (arr) => arr[0],
    weighted: (items) => items[0],
    state: null,
  };
}

export function heroAt(lvl, equip = { weapon: 'copper_sword', armour: 'wayfarers_clothes' }, extra = {}) {
  return newMember('hero', lvl, { equip, ...extra });
}

/** Run a battle to the end with an AI policy. Returns {b, log}. */
export function runToEnd(b, policy = 'smart', max = 80) {
  let n = 0;
  while (!b.over && n++ < max) b.autoRound(policy);
  return { b, log: b.log };
}

export function battle(opts) {
  return createBattle({ data: DATA, rng: 1, ...opts, options: { ambush: 'none', ...(opts.options || {}) } });
}

export const types = (log) => new Set(log.map((e) => e.t));
