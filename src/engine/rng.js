/**
 * rng.js — seeded, deterministic randomness.                                   (F1, owner: src/engine/rng.js)
 *
 * NEVER use Math.random() for anything that affects the simulation (battle rolls, encounters, drops, AI, NPC
 * wander). Use an Rng so `__DQ.advance(ms)` replays identically from the same seed.
 *
 *   import { RNG, Rng, makeRng, mulberry32, hashSeed } from './engine/rng.js';
 *
 *   RNG                       the global game stream (seed via RNG.reseed(n) or __DQ.seed(n))
 *   makeRng(seed)             a new independent stream; seed may be a number or a string ('map:puddlewick')
 *   RNG.fork('encounters')    child stream derived from the parent's CURRENT state + label (does not advance parent)
 *
 *   r.next()                  float in [0, 1)
 *   r.float(min=0, max=1)     float in [min, max)
 *   r.int(min, max)           integer in [min, max]  — BOTH ENDS INCLUSIVE (SYSTEMS-BIBLE: 1 + rng.int(0, 2) = 1..3)
 *                             r.int(n) with one argument = [0, n-1]
 *   r.chance(p)               true with probability p (0..1)
 *   r.pick(array)             a random element (undefined for an empty array)
 *   r.weighted(list, w?)      weighted pick. `w` may be: omitted (uses item.weight, or item[1] for [item, weight]
 *                             pairs, returning item[0]); an array of weights; or a function item => weight.
 *                             Items with weight <= 0 never win. Returns undefined if nothing can win.
 *   r.shuffle(array)          a NEW shuffled array (input untouched)
 *   r.sign()                  -1 or +1
 *   r.state / r.state = n     the full 32-bit state (save/restore for replays)
 *   r.reseed(seed)            restart the stream
 */

/** Classic mulberry32. Returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string or number (FNV-1a + avalanche). */
export function hashSeed(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return (Math.floor(v) >>> 0);
  const s = String(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  constructor(seed = 1) { this.reseed(seed); }

  reseed(seed = 1) { this.seed = hashSeed(seed); this._a = this.seed; this.calls = 0; return this; }

  get state() { return this._a >>> 0; }
  set state(v) { this._a = (v >>> 0); }

  /** float in [0, 1) — mulberry32 step, inlined so the state is inspectable. */
  next() {
    this.calls++;
    this._a = (this._a + 0x6d2b79f5) | 0;
    let t = Math.imul(this._a ^ (this._a >>> 15), 1 | this._a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min = 0, max = 1) { return min + (max - min) * this.next(); }

  int(min, max) {
    if (max === undefined) { max = min - 1; min = 0; }
    min = Math.ceil(min); max = Math.floor(max);
    if (max < min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p) { return this.next() < p; }

  sign() { return this.next() < 0.5 ? -1 : 1; }

  pick(arr) {
    if (!arr || !arr.length) return undefined;
    return arr[Math.floor(this.next() * arr.length)];
  }

  weighted(list, w) {
    if (!list || !list.length) return undefined;
    const weights = new Array(list.length);
    let total = 0;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      let wt;
      if (typeof w === 'function') wt = w(it, i);
      else if (Array.isArray(w)) wt = w[i];
      else if (Array.isArray(it)) wt = it[1];
      else wt = it && it.weight;
      wt = Number(wt);
      weights[i] = Number.isFinite(wt) && wt > 0 ? wt : 0;
      total += weights[i];
    }
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (let i = 0; i < list.length; i++) {
      if (weights[i] <= 0) continue;
      r -= weights[i];
      if (r < 0) return (w === undefined && Array.isArray(list[i])) ? list[i][0] : list[i];
    }
    // floating-point tail: last item with weight
    for (let i = list.length - 1; i >= 0; i--) {
      if (weights[i] > 0) return (w === undefined && Array.isArray(list[i])) ? list[i][0] : list[i];
    }
    return undefined;
  }

  shuffle(arr) {
    const a = Array.from(arr || []);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** Independent child stream keyed by label; does not consume from this stream. */
  fork(label = '') { return new Rng(hashSeed(`${this.state}:${label}`)); }
}

export function makeRng(seed = 1) { return new Rng(seed); }

/** The global game stream. Reseeded by __DQ.seed(n). */
export const RNG = new Rng(0x0d05eed5);
