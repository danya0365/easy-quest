/**
 * events.js — the global event bus.                                            (F1, owner: src/engine/events.js)
 *
 *   import { Bus } from './engine/events.js';
 *   const off = Bus.on('battle.start', (payload, evt) => { ... });   // returns an unsubscribe function
 *   Bus.once('dialogue.end', fn);
 *   Bus.off('battle.start', fn);   // or off()
 *   Bus.emit('party.join', { id: 'gloop' });
 *
 * Event names are lowercase dotted: `battle.start`, `party.join`, `flag.set`, `dialogue.end`, `map.enter`.
 * Wildcards on the LISTEN side only: `battle.*` matches `battle.start` and `battle.end.win`; `*` matches everything.
 *
 * A throwing listener never breaks the emitter or the other listeners: the error goes to __DQ.errors.
 * Listeners added during an emit do not fire for that emit; listeners removed during an emit do not fire either.
 *
 * Engine events emitted by F1:
 *   scene.push {name, stack}   scene.pop {name, stack}   scene.replace {from, name, stack}
 *   app.resize {width, height, dpr}   app.contextlost   app.contextrestored
 *   loop.freeze {frozen}   debug.seed {seed}   time.set {hours}   flag.set {name, value}   (flag/time only while
 *   no story/sky system has implemented those accessors)
 */
import { reportError } from './debug.js';

const listeners = new Map(); // evt -> Array<{fn, once, dead}>
let emitting = 0;
let history = [];            // last N emitted event names, for __DQ inspection
const HISTORY_MAX = 50;

function add(evt, fn, once) {
  if (typeof fn !== 'function') return () => {};
  const key = String(evt);
  let arr = listeners.get(key);
  if (!arr) listeners.set(key, arr = []);
  const rec = { fn, once, dead: false };
  arr.push(rec);
  return () => { rec.dead = true; prune(key); };
}

function prune(key) {
  if (emitting) return; // compacted after the emit finishes
  const arr = listeners.get(key);
  if (!arr) return;
  const live = arr.filter(r => !r.dead);
  if (live.length) listeners.set(key, live); else listeners.delete(key);
}

function fire(key, evt, payload) {
  const arr = listeners.get(key);
  if (!arr || !arr.length) return 0;
  const snapshot = arr.slice();
  let n = 0;
  for (const rec of snapshot) {
    if (rec.dead) continue;
    if (rec.once) rec.dead = true;
    n++;
    try { rec.fn(payload, evt); }
    catch (e) { reportError(`event "${evt}" listener`, e); }
  }
  return n;
}

export const Bus = {
  on(evt, fn) { return add(evt, fn, false); },
  once(evt, fn) { return add(evt, fn, true); },

  off(evt, fn) {
    const key = String(evt);
    const arr = listeners.get(key);
    if (!arr) return;
    for (const r of arr) if (!fn || r.fn === fn) r.dead = true;
    prune(key);
  },

  emit(evt, payload) {
    const name = String(evt);
    history.push(name);
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    emitting++;
    let n = 0;
    try {
      n += fire(name, name, payload);
      // wildcard parents: a.b.c -> a.b.* -> a.*
      let i = name.lastIndexOf('.');
      while (i > 0) {
        n += fire(name.slice(0, i) + '.*', name, payload);
        i = name.lastIndexOf('.', i - 1);
      }
      if (name !== '*') n += fire('*', name, payload);
    } finally {
      emitting--;
      if (!emitting) for (const k of Array.from(listeners.keys())) prune(k);
    }
    return n;
  },

  /** Number of live listeners for an exact event key (or all keys). */
  count(evt) {
    if (evt === undefined) { let n = 0; for (const a of listeners.values()) n += a.filter(r => !r.dead).length; return n; }
    const arr = listeners.get(String(evt));
    return arr ? arr.filter(r => !r.dead).length : 0;
  },

  /** Recently emitted event names, oldest first. */
  recent() { return history.slice(); },

  /** Remove every listener (tests only). */
  clear() { listeners.clear(); history = []; },
};
