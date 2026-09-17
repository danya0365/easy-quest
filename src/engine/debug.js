/**
 * debug.js — window.__DQ, the error sink, and the extension points every subsystem plugs into.
 *                                                                                (F1, owner: src/engine/debug.js)
 *
 * window.__DQ follows docs/ARCHITECTURE.md EXACTLY. Every accessor exists from boot. Accessors for systems that
 * are not built yet are STUBS: they never throw and return `{ok:false, stub:true, reason}` (or a safe getter
 * value), and are listed in `__DQ.state().stubs`. `__DQ.help()` lists everything.
 *
 * ── For subsystem builders ───────────────────────────────────────────────────────────────────────────────────
 *   import { Debug, reportError } from '../engine/debug.js';
 *
 *   reportError(where, err)            push a caught error to __DQ.errors (console.warn, never console.error).
 *                                      Use it in every catch. Repeats of one message are counted, not spammed.
 *   Debug.implement(name, fn)          replace the stub for a contract accessor. `name` is one of:
 *                                        goto teleport battle press hold release give gold setLevel heal flag party
 *                                        timeOfDay cameraOrbit cameraZoom screenshotReady listMaps
 *                                      e.g. Debug.implement('teleport', (mapId, x, z) => Field.load(mapId, x, z))
 *                                      fn may return a Promise; rejections are reported, never thrown.
 *   Debug.provide(key, fn)             extend (or take over a key of) __DQ.state(): state()[key] = fn().
 *                                      Contract keys you own: map player party gold flags dialogue battle.
 *                                      e.g. Debug.provide('audio', () => ({theme, bar, beat, voices, ducked, ctxState}))
 *                                      Must return JSON-safe data. A throwing provider yields {error} for its key.
 *   Debug.expose(name, fn)             add an extra control, e.g. Debug.expose('pose', p => rig.play(p)) -> __DQ.pose.
 *                                      Wrapped so it never throws. Cannot overwrite contract accessors.
 *   Debug.busy(token, on)              mark a transition/fade mid-flight: screenshotReady() is false while any
 *                                      token is busy (P29 transitions, map loads).
 *   Debug.install({version})           called once by App.start(); safe to call again.
 */
import { Loop } from './loop.js';
import { Scenes } from './states.js';
import { App } from './app.js';
import { Bus } from './events.js';
import { RNG } from './rng.js';

export const VERSION = '0.1.0-f1';

// ── error sink ───────────────────────────────────────────────────────────────────────────────────────────────
// Lives at module scope so errors raised before install() (or with no window) are kept, and __DQ.errors is this
// exact array once installed.
const ERRORS = [];
const ERROR_MAX = 1000;
const errorCounts = new Map(); // message -> occurrences
let errorTotal = 0;

function fmt(where, e) {
  let msg;
  if (e instanceof Error) {
    const stack = String(e.stack || '').split('\n').slice(1, 4).map(s => s.trim()).filter(Boolean).join(' | ');
    msg = `${e.name}: ${e.message}${stack ? ' @ ' + stack : ''}`;
  } else if (e && typeof e === 'object') {
    try { msg = JSON.stringify(e); } catch (_) { msg = String(e); }
  } else msg = String(e);
  return `[${where}] ${msg}`.slice(0, 700);
}

export function reportError(where, e) {
  try {
    const msg = fmt(where || 'error', e);
    errorTotal++;
    const n = (errorCounts.get(msg) || 0) + 1;
    errorCounts.set(msg, n);
    if (errorCounts.size > 5000) errorCounts.clear();
    // First occurrence always recorded; repeats recorded at 10, 100, 1000... so a scene throwing 60x/sec stays
    // visible without flooding the list.
    const decade = n > 1 && /^10+$/.test(String(n));
    if (n === 1 || decade) {
      ERRORS.push(n === 1 ? msg : `${msg} (x${n})`);
      if (ERRORS.length > ERROR_MAX) ERRORS.splice(0, ERRORS.length - ERROR_MAX);
      try { console.warn('[__DQ.errors]', n === 1 ? msg : `${msg} (x${n})`); } catch (_) {}
    }
  } catch (_) { /* the error sink itself must never throw */ }
}

// ── registries ───────────────────────────────────────────────────────────────────────────────────────────────
const CONTRACT = ['goto', 'teleport', 'battle', 'press', 'hold', 'release', 'give', 'gold', 'setLevel', 'heal',
  'flag', 'party', 'timeOfDay', 'advance', 'freeze', 'cameraOrbit', 'cameraZoom', 'screenshotReady', 'listMaps',
  'listScenes'];
const IMPLEMENTABLE = new Set(['goto', 'teleport', 'battle', 'press', 'hold', 'release', 'give', 'gold', 'setLevel',
  'heal', 'flag', 'party', 'timeOfDay', 'cameraOrbit', 'cameraZoom', 'screenshotReady', 'listMaps']);
// Accessors whose default (no implementation) behaviour is a stand-in rather than the real system.
const STUBBED_BY_DEFAULT = ['teleport', 'battle', 'press', 'hold', 'release', 'give', 'gold', 'setLevel', 'heal',
  'flag', 'party', 'timeOfDay', 'cameraOrbit', 'cameraZoom', 'listMaps'];

const IMPL = new Map();       // name -> fn
const PROVIDERS = new Map();  // state key -> fn
const EXTRAS = new Map();     // exposed extra controls
const BUSY = new Set();

// Fallback stores while the real systems don't exist yet — so get/set accessors are observable, not dead.
const fallback = { flags: {}, gold: 0, hours: 12, held: new Set(), pressLog: [] };

const stub = (name, reason) => ({ ok: false, stub: true, accessor: name, reason });

function safeCall(name, fn, args) {
  try {
    const v = fn(...args);
    if (v && typeof v.then === 'function') {
      return v.then(x => x, (e) => { reportError(`__DQ.${name}`, e); return { ok: false, error: String(e && e.message || e) }; });
    }
    return v;
  } catch (e) {
    reportError(`__DQ.${name}`, e);
    return { ok: false, error: String(e && e.message || e) };
  }
}

const BUTTONS = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu', 'run', 'map'];

// ── default (stub/fallback) accessors ───────────────────────────────────────────────────────────────────────
const DEFAULTS = {
  goto(sceneName, opts = {}) {
    const name = String(sceneName);
    if (!Scenes.has(name)) return { ok: false, reason: `scene "${name}" is not registered`, scenes: Scenes.list() };
    const o = opts || {};
    const ok = o.push ? Scenes.push(name, o) : o.replace ? Scenes.replace(name, o) : Scenes.reset(name, o);
    return { ok: !!ok, scene: Scenes.top(), stack: Scenes.stack() };
  },
  teleport(mapId) { return stub('teleport', `no map system yet (src/world) — cannot load "${mapId}"`); },
  battle(monsterIds) {
    const ids = Array.isArray(monsterIds) ? monsterIds : (monsterIds == null ? [] : [monsterIds]);
    if (Scenes.has('battle')) { Scenes.push('battle', { monsters: ids, forced: true }); return { ok: true, scene: Scenes.top(), monsters: ids }; }
    return stub('battle', 'no battle scene registered yet (src/battle)');
  },
  press(btn, ms = 120) {
    // Without the input system (F2): deliver the button straight to the top scene.
    const b = String(btn);
    if (!BUTTONS.includes(b)) return { ok: false, reason: `unknown button "${b}"`, buttons: BUTTONS };
    fallback.pressLog.push(b); if (fallback.pressLog.length > 20) fallback.pressLog.shift();
    const handledBy = Scenes.input(b);
    return { ok: true, stub: true, via: 'Scenes.input', button: b, handledBy, ms };
  },
  hold(btn, ms = 300) {
    const b = String(btn);
    if (!BUTTONS.includes(b)) return { ok: false, reason: `unknown button "${b}"`, buttons: BUTTONS };
    fallback.held.add(b);
    const handledBy = Scenes.input(b);
    if (ms > 0) setTimeout(() => fallback.held.delete(b), ms);
    return { ok: true, stub: true, button: b, handledBy, ms };
  },
  release(btn) {
    const b = String(btn);
    const was = fallback.held.delete(b);
    return { ok: true, stub: true, button: b, wasHeld: was };
  },
  give(itemId, n = 1) { return stub('give', `no inventory system yet (src/data/items.js) — cannot give ${n} x "${itemId}"`); },
  gold(n) {
    if (n === undefined) return fallback.gold;
    const v = Math.max(0, Math.floor(Number(n) || 0));
    fallback.gold = v;
    return v;
  },
  setLevel(n) { return stub('setLevel', `no party/growth system yet — cannot set level ${n}`); },
  heal() { return stub('heal', 'no party system yet'); },
  flag(name, value) {
    if (name === undefined) return { ...fallback.flags };
    const k = String(name);
    if (value === undefined) return Object.prototype.hasOwnProperty.call(fallback.flags, k) ? fallback.flags[k] : null;
    fallback.flags[k] = value;
    Bus.emit('flag.set', { name: k, value });
    return value;
  },
  party(add) {
    if (add === undefined) return [];
    return stub('party', `no party system yet — cannot add "${add}"`);
  },
  timeOfDay(hours) {
    if (hours === undefined) return fallback.hours;
    const h = Number(hours);
    if (!Number.isFinite(h)) return fallback.hours;
    fallback.hours = ((h % 24) + 24) % 24;
    Bus.emit('time.set', { hours: fallback.hours });
    return fallback.hours;
  },
  cameraOrbit(deg) { return stub('cameraOrbit', `no camera rig yet (src/world/camera.js) — orbit ${deg}`); },
  cameraZoom(n) { return stub('cameraZoom', `no camera rig yet (src/world/camera.js) — zoom ${n}`); },
  screenshotReady() { return true; },
  listMaps() { return []; },
};

function accessor(name) {
  if (IMPL.has(name)) return IMPL.get(name);
  return DEFAULTS[name];
}

// ── state() ──────────────────────────────────────────────────────────────────────────────────────────────────
function buildState() {
  const loop = Loop.info();
  let render = null;
  try { render = App.stats(); } catch (_) { render = null; }
  const s = {
    scene: Scenes.top(),
    sceneStack: Scenes.stack(),
    map: null,
    player: { x: 0, y: 0, z: 0, facing: 0 },
    party: [],
    gold: fallback.gold,
    flags: { ...fallback.flags },
    fps: Loop.fps,
    errors: Math.max(errorTotal, ERRORS.length),   // audio modules push straight into __DQ.errors: count those too
    dialogue: null,
    battle: null,
    // extensions (F1)
    version: api.version,
    ready: !!api.ready,
    timeOfDay: fallback.hours,
    loop,
    render,
    rng: { seed: RNG.seed, state: RNG.state, calls: RNG.calls },
    busy: Array.from(BUSY),
    stubs: [],
  };
  s.stubs = STUBBED_BY_DEFAULT.filter(n => !IMPL.has(n));
  // Contract keys are stand-ins until a system provides them.
  const standIns = ['map', 'player', 'party', 'dialogue', 'battle'];
  for (const k of standIns) if (!PROVIDERS.has(k)) s.stubs.push(`state.${k}`);
  if (IMPL.has('timeOfDay')) { try { s.timeOfDay = IMPL.get('timeOfDay')(); } catch (_) {} }
  for (const [key, fn] of PROVIDERS) {
    try { s[key] = fn(); }
    catch (e) { reportError(`__DQ.state provider "${key}"`, e); s[key] = { error: String(e && e.message || e) }; }
  }
  return s;
}

// ── the public object ────────────────────────────────────────────────────────────────────────────────────────
const api = {
  ready: false,
  version: VERSION,
  errors: ERRORS,
  state() {
    try { return buildState(); }
    catch (e) { reportError('__DQ.state', e); return { scene: null, sceneStack: [], errors: errorTotal, error: String(e && e.message || e) }; }
  },
  goto(sceneName, opts) { return safeCall('goto', accessor('goto'), [sceneName, opts]); },
  teleport(mapId, x, z) { return safeCall('teleport', accessor('teleport'), [mapId, x, z]); },
  battle(monsterIds) { return safeCall('battle', accessor('battle'), [monsterIds]); },
  press(btn, ms) { return safeCall('press', accessor('press'), ms === undefined ? [btn] : [btn, ms]); },
  hold(btn, ms) { return safeCall('hold', accessor('hold'), ms === undefined ? [btn] : [btn, ms]); },
  release(btn) { return safeCall('release', accessor('release'), [btn]); },
  give(itemId, n) { return safeCall('give', accessor('give'), n === undefined ? [itemId] : [itemId, n]); },
  gold(n) { return safeCall('gold', accessor('gold'), [n]); },
  setLevel(n) { return safeCall('setLevel', accessor('setLevel'), [n]); },
  heal() { return safeCall('heal', accessor('heal'), []); },
  flag(name, value) { return safeCall('flag', accessor('flag'), value === undefined ? [name] : [name, value]); },
  party(add) { return safeCall('party', accessor('party'), add === undefined ? [] : [add]); },
  timeOfDay(hours) { return safeCall('timeOfDay', accessor('timeOfDay'), hours === undefined ? [] : [hours]); },
  advance(ms) {
    try {
      const steps = Loop.step(ms);
      return { ok: true, steps, tick: Loop.tick, simMs: Math.round(Loop.simMs * 1000) / 1000 };
    } catch (e) { reportError('__DQ.advance', e); return { ok: false, error: String(e && e.message || e) }; }
  },
  freeze(on) {
    try {
      const f = Loop.freeze(on === undefined ? true : !!on);
      Bus.emit('loop.freeze', { frozen: f });
      return f;
    } catch (e) { reportError('__DQ.freeze', e); return Loop.frozen; }
  },
  cameraOrbit(deg) { return safeCall('cameraOrbit', accessor('cameraOrbit'), [deg]); },
  cameraZoom(n) { return safeCall('cameraZoom', accessor('cameraZoom'), [n]); },
  screenshotReady() {
    try {
      if (!api.ready || BUSY.size) return false;
      return !!accessor('screenshotReady')();
    } catch (e) { reportError('__DQ.screenshotReady', e); return false; }
  },
  listMaps() {
    const v = safeCall('listMaps', accessor('listMaps'), []);
    return Array.isArray(v) ? v : [];
  },
  listScenes() { try { return Scenes.list(); } catch (e) { reportError('__DQ.listScenes', e); return []; } },

  // ── F1 extras ──
  /** Reseed the global RNG (or read the seed). */
  seed(n) {
    try {
      if (n === undefined) return RNG.seed;
      RNG.reseed(n);
      Bus.emit('debug.seed', { seed: RNG.seed });
      return RNG.seed;
    } catch (e) { reportError('__DQ.seed', e); return null; }
  },
  /** Get/set the loop time scale (1 = normal). */
  timeScale(n) { try { return n === undefined ? Loop.timeScale : Loop.setTimeScale(n); } catch (e) { reportError('__DQ.timeScale', e); return 1; } },
  /** Render budget of the last frame: {calls, tris, geometries, textures, programs, ...}. */
  budget() { try { return App.stats(); } catch (e) { reportError('__DQ.budget', e); return null; } },
  /** Which accessors are real vs stubbed, plus extra controls. */
  help() {
    return {
      contract: CONTRACT.slice(),
      implemented: CONTRACT.filter(n => IMPL.has(n) || ['advance', 'freeze', 'listScenes', 'goto', 'screenshotReady'].includes(n)),
      stubs: STUBBED_BY_DEFAULT.filter(n => !IMPL.has(n)),
      stateKeys: Object.keys(buildState()),
      extras: ['seed', 'timeScale', 'budget', 'help', ...EXTRAS.keys()],
      buttons: BUTTONS.slice(),
    };
  },
};

let installed = false;
let errorListenersAdded = false;

export const Debug = {
  VERSION,
  api,
  errors: ERRORS,

  install(opts = {}) {
    if (opts && opts.version) api.version = String(opts.version);
    if (typeof window === 'undefined') return api;
    try {
      const prev = window.__DQ;
      if (prev && prev !== api && typeof prev === 'object') {
        // Something (a demo, the audio probe) set __DQ first: keep its extra keys and its errors.
        if (Array.isArray(prev.errors)) for (const e of prev.errors) ERRORS.push(String(e));
        for (const k of Object.keys(prev)) {
          if (!(k in api)) { try { api[k] = prev[k]; } catch (_) {} }
        }
      }
      window.__DQ = api;
    } catch (e) { reportError('Debug.install', e); }

    if (!errorListenersAdded && typeof addEventListener === 'function') {
      errorListenersAdded = true;
      addEventListener('error', (ev) => {
        // Resource errors (img/script tags) have no ev.error; still record them.
        reportError('window.onerror', ev && (ev.error || ev.message) || 'unknown error');
      });
      addEventListener('unhandledrejection', (ev) => reportError('unhandledrejection', ev && ev.reason));
    }

    if (!installed) {
      installed = true;
      // ready flips true after the first frame that actually drew something.
      const off = Loop.onFrame(() => {
        if (App.framesDrawn > 0) { api.ready = true; off(); Bus.emit('debug.ready', { frame: Loop.frame }); }
      });
    }
    return api;
  },

  implement(name, fn) {
    if (!IMPLEMENTABLE.has(name)) { reportError('Debug.implement', new Error(`"${name}" is not an implementable __DQ accessor`)); return false; }
    if (typeof fn !== 'function') { IMPL.delete(name); return true; }
    IMPL.set(name, fn);
    return true;
  },

  provide(key, fn) {
    if (typeof fn !== 'function') { PROVIDERS.delete(String(key)); return false; }
    PROVIDERS.set(String(key), fn);
    return true;
  },

  expose(name, fn) {
    const k = String(name);
    if (CONTRACT.includes(k) || ['ready', 'version', 'errors', 'state', 'seed', 'timeScale', 'budget', 'help'].includes(k)) {
      reportError('Debug.expose', new Error(`"${k}" is reserved; use Debug.implement for contract accessors`));
      return false;
    }
    if (typeof fn !== 'function') { EXTRAS.delete(k); delete api[k]; return false; }
    EXTRAS.set(k, fn);
    api[k] = (...args) => safeCall(k, fn, args);
    return true;
  },

  busy(token, on = true) {
    if (on) BUSY.add(String(token)); else BUSY.delete(String(token));
    return BUSY.size;
  },

  /** Total caught errors (including collapsed repeats). */
  errorCount() { return errorTotal; },

  state() { return api.state(); },
};
