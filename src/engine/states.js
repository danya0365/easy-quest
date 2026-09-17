/**
 * states.js — the scene stack.                                                   (F1, owner: src/engine/states.js)
 *
 *   import { Scenes } from './engine/states.js';
 *   Scenes.register('field', {
 *     enter(ctx) {}, exit() {},          // push/replace/pop lifecycle
 *     pause() {}, resume() {},           // optional: another scene was pushed over / popped off this one
 *     update(dt) {},                     // fixed 60 Hz, dt = 1/60 s
 *     render(alpha) {},                  // once per frame; call App.render(threeScene, camera) to draw
 *     onInput(btn) {},                   // virtual button pressed; return false to let the scene below see it
 *     opaque: false,                     // true = scenes BELOW are not rendered (battle, title). Default false.
 *     updateBelow: false,                // true = the scene below keeps updating while this one is on top.
 *   });
 *   // or register(name, () => ({...}))   a factory: a fresh instance per push (use for re-entrant scenes)
 *
 *   Scenes.push(name, ctx)     Scenes.pop()     Scenes.replace(name, ctx)     Scenes.top() -> name|null
 *   Scenes.reset(name, ctx)    pop everything, then push name
 *   Scenes.stack()             -> ['field', 'menu']  (bottom first)
 *   Scenes.list()              -> registered names     Scenes.has(name)     Scenes.get(name) -> def/instance
 *   Scenes.topScene()          -> the top scene object (or null)
 *   Scenes.update(dt)          called by the app loop: updates the top scene (+ any below it via updateBelow)
 *   Scenes.render(alpha)       called by the app loop: renders BOTTOM-UP from the highest opaque scene to the top,
 *                              so the field keeps drawing under a menu or dialogue
 *   Scenes.input(btn)          deliver a virtual button to the top scene (falls through on `return false`)
 *
 * Every hook call is individually try/caught: a scene that throws in update or render logs to __DQ.errors and the
 * rest of the stack keeps updating and drawing. A scene whose enter() throws still goes on the stack (a half-built
 * scene that draws something beats a black screen).
 *
 * Push/pop/replace are allowed from inside any hook (a field scene pushing 'battle' from update, a menu popping
 * itself from onInput). Scenes removed mid-frame receive no further calls that frame.
 *
 * Emits: scene.push {name, stack}, scene.pop {name, stack}, scene.replace {from, name, stack}.
 */
import { reportError } from './debug.js';
import { Bus } from './events.js';

const registry = new Map();  // name -> def object | factory function
const stack = [];            // [{name, scene, ctx, alive}]
let seq = 0;

function instantiate(name) {
  const def = registry.get(name);
  if (typeof def === 'function') {
    try { return def() || {}; }
    catch (e) { reportError(`scene "${name}" factory`, e); return {}; }
  }
  return def || {};
}

function call(entry, hook, ...args) {
  const fn = entry && entry.scene && entry.scene[hook];
  if (typeof fn !== 'function') return undefined;
  try { return fn.apply(entry.scene, args); }
  catch (e) { reportError(`scene "${entry.name}" ${hook}`, e); return undefined; }
}

const names = () => stack.map(e => e.name);

export const Scenes = {
  register(name, def) {
    if (!name || (typeof def !== 'object' && typeof def !== 'function') || def === null) {
      reportError('Scenes.register', new Error(`bad scene definition for "${name}"`));
      return false;
    }
    registry.set(String(name), def);
    return true;
  },

  unregister(name) { return registry.delete(String(name)); },

  has(name) { return registry.has(String(name)); },

  /** Registered definition (object) — or, if that scene is on the stack and was built by a factory, its live instance. */
  get(name) {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === name) return stack[i].scene;
    const d = registry.get(String(name));
    return typeof d === 'function' ? null : (d || null);
  },

  list() { return Array.from(registry.keys()); },

  stack() { return names(); },

  depth() { return stack.length; },

  top() { return stack.length ? stack[stack.length - 1].name : null; },

  topScene() { return stack.length ? stack[stack.length - 1].scene : null; },

  push(name, ctx = {}) {
    name = String(name);
    if (!registry.has(name)) {
      reportError('Scenes.push', new Error(`unknown scene "${name}" (registered: ${this.list().join(', ') || 'none'})`));
      return false;
    }
    const below = stack[stack.length - 1];
    if (below) call(below, 'pause');
    const entry = { name, scene: instantiate(name), ctx, alive: true, id: ++seq };
    stack.push(entry);
    call(entry, 'enter', ctx);
    Bus.emit('scene.push', { name, stack: names() });
    return true;
  },

  pop() {
    const entry = stack.pop();
    if (!entry) return null;
    entry.alive = false;
    call(entry, 'exit');
    const top = stack[stack.length - 1];
    if (top) call(top, 'resume');
    Bus.emit('scene.pop', { name: entry.name, stack: names() });
    return entry.name;
  },

  replace(name, ctx = {}) {
    name = String(name);
    if (!registry.has(name)) {
      reportError('Scenes.replace', new Error(`unknown scene "${name}" (registered: ${this.list().join(', ') || 'none'})`));
      return false;
    }
    const old = stack.pop();
    if (old) { old.alive = false; call(old, 'exit'); }
    const entry = { name, scene: instantiate(name), ctx, alive: true, id: ++seq };
    stack.push(entry);
    call(entry, 'enter', ctx);
    Bus.emit('scene.replace', { from: old ? old.name : null, name, stack: names() });
    return true;
  },

  /** Pop every scene, then push `name` (if given). */
  reset(name, ctx = {}) {
    while (stack.length) this.pop();
    return name ? this.push(name, ctx) : true;
  },

  update(dt) {
    if (!stack.length) return;
    // Active set: the top scene, plus each scene below for as long as the scene above says updateBelow.
    let first = stack.length - 1;
    while (first > 0 && stack[first].scene && stack[first].scene.updateBelow) first--;
    const active = stack.slice(first);
    for (const entry of active) if (entry.alive) call(entry, 'update', dt);
  },

  render(alpha) {
    if (!stack.length) return;
    let first = stack.length - 1;
    while (first > 0 && !(stack[first].scene && stack[first].scene.opaque)) first--;
    const visible = stack.slice(first);
    for (const entry of visible) if (entry.alive) call(entry, 'render', alpha);
  },

  input(btn) {
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i];
      if (!entry.alive) continue;
      const r = call(entry, 'onInput', btn);
      if (r !== false) return entry.name;
    }
    return null;
  },

  /** For __DQ.state(): [{name, id, opaque, updateBelow}] bottom first. */
  describe() {
    return stack.map(e => ({ name: e.name, id: e.id, opaque: !!(e.scene && e.scene.opaque), updateBelow: !!(e.scene && e.scene.updateBelow) }));
  },
};
