/**
 * input.js — virtual buttons from keyboard, gamepad, touch and the harness.        (F2, owner: src/engine/input.js)
 *
 *   import { Input } from './engine/input.js';
 *   Input.init();                                     // listeners + touch overlay + __DQ press/hold/release. Idempotent.
 *   App.start({ beforeUpdate: Input.update });        // poll ONCE PER FIXED TICK, before the scene stack updates.
 *
 * Buttons (docs/ARCHITECTURE.md): up down left right confirm cancel menu run map
 *
 *   Input.down(btn)        held this tick
 *   Input.pressed(btn)     went down this tick (one tick only)
 *   Input.released(btn)    went up this tick
 *   Input.repeat(btn)      MENU REPEAT: true on the press tick, then after `delay` ms, then every `interval` ms
 *                          (faster after `fastAfter` repeats). Directions only by default; while several directions
 *                          are held only the most recently pressed one repeats. Use this for every cursor.
 *   Input.axis()           -> {x, y, mag, angle, source}. x: right +, y: UP/FORWARD + (W, ArrowUp, stick pushed away).
 *                          Keys/d-pad are 8-way and unit length (diagonals 0.707); sticks are analog with a radial
 *                          dead zone rescaled so output starts at 0 at the dead-zone edge. |v| <= 1 always.
 *   Input.look()           -> {x, y} camera orbit: right stick, bumpers, Q/E.
 *   Input.inject(btn, ms)  hold a virtual button for `ms` of SIMULATED time (ticks), min 1 tick. Several injections of one
 *                          button queue up with a 1-tick release between them, so each is its own press.
 *   Input.hold(btn) / Input.release(btn?)       indefinite injected hold / release injected (and everything if no btn).
 *   Input.sequence(['down','down','confirm'], {hold:100, gap:80})   ordered presses, one after another.
 *   Input.any()            any button pressed this tick          Input.heldMs(btn)   how long it has been held
 *   Input.consume(btn)     make pressed()/repeat() false for the rest of this tick
 *   Input.current()        inside a scene's onInput: {btn, repeat, device, tick}
 *   Input.block(token, on) while any token is on, every button reads up and the axis is zero; on unblock, buttons
 *                          still held must be released before they press again (transitions, battle intro).
 *   Input.suppress()       every held button must be released before it can press again
 *   Input.device           'keyboard'|'gamepad'|'touch'|'inject'|null — last device used (Bus 'input.device')
 *   Input.setRepeat({delay, interval, fast, fastAfter, buttons})   Input.bind(btn, codes[])   Input.bindings()
 *   Input.setTouchMode('auto'|'on'|'off')   auto = shown on a coarse primary pointer or after the first touch.
 *                          Overrides: ?touch=on|off in the URL, localStorage 'dqv.touch'.
 *   Input.describe()       JSON summary, also __DQ.state().input
 *
 * Scene delivery: every press and every repeat is delivered to Scenes.input(btn) (the top scene's onInput) during
 * update(). A press whose delivery changed the scene stack (a dialogue closing on confirm, a menu opening) is CONSUMED,
 * so the scene revealed or pushed by it does not also see pressed(btn) in the same tick. Any scene change also stops
 * held buttons from repeating until they are pressed again, so a new menu never scrolls on its own.
 *
 * Keyboard: arrows/WASD, Enter/Space/Z confirm, Escape/X/Backspace cancel, Shift run, Tab/C menu, M map, Q/E look.
 *   Uses KeyboardEvent.code (layout independent). Ctrl/Alt/Meta chords are left to the browser. Ignored while typing
 *   into an input/textarea/contenteditable. Opposite keys: the last one pressed wins for the axis.
 *   A tap shorter than one tick still produces exactly one press (taps are latched until polled).
 * Gamepad (standard mapping, every connected pad merged): A confirm, B cancel, X / L2 / R2 run, Y / Start menu,
 *   Back map, d-pad directions, left stick axis (+ digital directions with hysteresis), right stick + L1/R1 look.
 * Touch: a floating thumbstick (touch anywhere on the lower-left half; pushing past the rim = run) and OK / Back / Menu
 *   buttons, drawn like Dragon Quest windows: soft, rounded, translucent. Slide a thumb between buttons.
 * Blur / tab hidden / pagehide: everything is released (released() fires next tick), and gamepad buttons still held
 *   must be let go before they count again.
 *
 * Driving: call Input.update() once per fixed tick (App.start beforeUpdate). If nobody does, a per-frame fallback
 * polls instead so the game still responds (state().input.driver === 'frame-fallback' flags it).
 *
 * Colours: the touch skin below is a PLACEHOLDER copied from the DQ window colours used by F1/P28 until F3/F4 land;
 * each colour is exposed as a CSS custom property that defers to --dq-win-top / --dq-win-bot / --dq-win-edge /
 * --dq-win-line / --dq-ink / --dq-gold when ui.css defines them, and Input.setSkin({...}) overrides at runtime.
 */
import { Loop } from './loop.js';
import { Scenes } from './states.js';
import { Bus } from './events.js';
import { Debug, reportError } from './debug.js';

export const BUTTONS = Object.freeze(['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu', 'run', 'map']);
const DIRS = ['up', 'down', 'left', 'right'];
const IS_BUTTON = new Set(BUTTONS);

const DEFAULT_KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'NumpadEnter', 'Space', 'KeyZ'],
  cancel: ['Escape', 'KeyX', 'Backspace'],
  menu: ['Tab', 'KeyC'],
  run: ['ShiftLeft', 'ShiftRight'],
  map: ['KeyM'],
};
const LOOK_KEYS = { left: ['KeyQ'], right: ['KeyE'] };

// Standard-mapping gamepad button indices.
const PAD_BUTTONS = { confirm: [0], cancel: [1], run: [2, 6, 7], menu: [3, 9], map: [8], up: [12], down: [13], left: [14], right: [15] };
const PAD_LOOK = { left: 4, right: 5 };

const CFG = {
  padDead: { inner: 0.2, outer: 0.95 },
  touchDead: { inner: 0.14, outer: 0.9 },
  lookDead: { inner: 0.22, outer: 0.95 },
  triggerOn: 0.35,
  analogOn: 0.5, analogOff: 0.35,        // stick -> digital direction magnitude hysteresis
  sectorOn: 0.42, sectorOff: 0.26,       // component (of the unit vector) needed to turn a direction on / keep it on
  touchRun: 1.5,                         // thumb this far past the knob travel = run (full walk speed comes at 0.9)
  touchFollow: 1.9,                      // ...and this far drags the whole stick along
  touchZone: { maxX: 0.5, minY: 0.28 },  // floating-stick zone as a fraction of the viewport
};

const REPEAT = { delay: 300, interval: 100, fast: 66, fastAfter: 10, buttons: DIRS.slice() };

// Placeholder skin (see header). Hex lives here only.
const SKIN = {
  top: '#2c4fb8', bot: '#132a78', hi: '#6d95ea', edge: '#f4f1ea', line: '#9fb2ff', ink: '#fbf8ee',
  inkShadow: '#0a1540', gold: '#ffd766', shadow: '#050a24', knob: '#f7f1e1', knobHi: '#ffffff', knobShade: '#cdc2a6',
};

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────
const TICK_MS = () => (Loop && Loop.stepMs) || 1000 / 60;
const msToTicks = (ms) => Math.max(1, Math.round((Number(ms) || 0) / TICK_MS()));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r3 = (v) => Math.round(v * 1000) / 1000;
const hasWindow = typeof window !== 'undefined';

function radial(x, y, dz) {
  x = Number(x) || 0; y = Number(y) || 0;
  const m = Math.hypot(x, y);
  if (m <= dz.inner || m === 0) return { x: 0, y: 0, mag: 0 };
  const k = clamp((m - dz.inner) / (dz.outer - dz.inner), 0, 1);
  return { x: (x / m) * k, y: (y / m) * k, mag: k };
}

function rgba(hex, a) {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function normCode(e) {
  if (e.code) return e.code;
  const k = e.key;
  if (!k) return '';
  if (k.length === 1) {
    if (k === ' ') return 'Space';
    if (/[a-z]/i.test(k)) return 'Key' + k.toUpperCase();
    return k;
  }
  if (k === 'Esc') return 'Escape';
  if (k === 'Shift') return 'ShiftLeft';
  if (k === 'Up' || k === 'Down' || k === 'Left' || k === 'Right') return 'Arrow' + k;
  return k;
}

function isEditable(t) {
  if (!t || t === window || t === document) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t.isContentEditable;
}

// ── state ────────────────────────────────────────────────────────────────────────────────────────────────────
let inited = false;
let tick = 0;
let bindings = {};
let codeMap = new Map();          // code -> [btn]
const keys = new Map();           // held code -> press order
const keyTaps = new Map();        // code -> press order, latched until the next poll
let keySeq = 0;

const B = {};
for (const b of BUTTONS) {
  B[b] = { down: false, pressTick: -1, releaseTick: -1, repeatTick: -1, consumedTick: -1, heldTicks: 0, nextRepeat: 0,
    repeats: 0, presses: 0, repeatsTotal: 0, device: null, suppressed: false, raw: false, repeatLocked: false };
}

const src = { kb: {}, pad: {}, padDir: {}, touch: {}, touchDir: {}, inj: {} };
for (const k of Object.keys(src)) for (const b of BUTTONS) src[k][b] = false;

let axisV = { x: 0, y: 0, mag: 0, angle: 0, source: null };
let lookV = { x: 0, y: 0 };

// gamepad
let virtualPad = null;
let padInfo = { connected: false, count: 0, id: null, mapping: null, virtual: false };
let padStick = { x: 0, y: 0, mag: 0 };
let padRaw = { lx: 0, ly: 0, rx: 0, ry: 0, buttons: [] };
const padHyst = { active: false, up: false, down: false, left: false, right: false };
let padWasActive = false;

// touch
let touchMode = 'auto';
let touchVisible = false;
let coarseMQ = null;
let dom = null;                   // {root, stick, base, knob, arrows:{}, btn:{}}
const touchHeld = {};             // btn -> pointer count
const touchTaps = new Set();
const btnPointers = new Map();    // pointerId -> btn
const stick = { pointerId: null, active: false, hx: 0, hy: 0, cx: 0, cy: 0, ox: 0, oy: 0, px: 0, py: 0, radius: 60, travel: 50,
  raw: { x: 0, y: 0 }, vec: { x: 0, y: 0, mag: 0 }, run: false };
const touchHyst = { active: false, up: false, down: false, left: false, right: false };
let touchCounts = { starts: 0, buttonPresses: 0 };

// injection
const inj = {};
for (const b of BUTTONS) inj[b] = { queue: [], left: 0, gap: 0, hold: false };
const seq = { items: [], cur: null, left: 0, gapLeft: 0 };

// misc
const blockTokens = new Set();
let device = null;
let current = null;
let sceneChanges = 0;
let offSceneBus = null;
let blurReleases = 0;
let lastBlurReason = null;
const history = [];               // {tick, btn, kind, device}
const HISTORY_MAX = 64;
let polls = 0;
let externalCalls = 0;
let fallbackPolls = 0;
let driver = 'idle';
let lastFrameLoopTick = -1;
const listeners = [];
let repeatTicks = { delay: 18, interval: 6, fast: 4 };

function computeRepeatTicks() {
  repeatTicks = { delay: msToTicks(REPEAT.delay), interval: msToTicks(REPEAT.interval), fast: msToTicks(REPEAT.fast) };
}

function rebuildCodeMap() {
  codeMap = new Map();
  for (const b of BUTTONS) for (const c of bindings[b] || []) {
    if (!codeMap.has(c)) codeMap.set(c, []);
    codeMap.get(c).push(b);
  }
}

function setDevice(d) {
  if (d && d !== device) {
    device = d;
    try { Bus.emit('input.device', { device: d }); } catch (_) {}
    if (d === 'touch') showTouchIfAuto();
    else if ((d === 'keyboard' || d === 'gamepad') && touchMode === 'auto' && touchVisible && !isCoarse()) setTouchVisible(false);
  }
}

function logEvent(btn, kind, dev) {
  history.push({ tick, btn, kind, device: dev });
  if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
}

// ── keyboard ─────────────────────────────────────────────────────────────────────────────────────────────────
function onKeyDown(e) {
  try {
    const code = normCode(e);
    const mapped = codeMap.has(code) || LOOK_KEYS.left.includes(code) || LOOK_KEYS.right.includes(code);
    if (!mapped) return;
    if (isEditable(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.cancelable) e.preventDefault();
    if (keys.has(code)) return;          // OS auto-repeat: we do our own
    if (e.repeat) return;                // a key still held from before a blur: wait for a real press
    keys.set(code, ++keySeq);
    keyTaps.set(code, keySeq);
    if (codeMap.has(code)) setDevice('keyboard');
  } catch (err) { reportError('Input keydown', err); }
}

function onKeyUp(e) {
  try {
    const code = normCode(e);
    if (code === 'MetaLeft' || code === 'MetaRight' || e.key === 'Meta') { keys.clear(); return; } // mac drops keyups under Cmd
    if (keys.delete(code) && e.cancelable && !isEditable(e.target)) e.preventDefault();
  } catch (err) { reportError('Input keyup', err); }
}

function kbHeld(code) { return keys.has(code) || keyTaps.has(code); }
function kbOrder(code) { return Math.max(keys.get(code) || 0, keyTaps.get(code) || 0); }

// ── gamepad ──────────────────────────────────────────────────────────────────────────────────────────────────
function padValue(pad, i) {
  const b = pad.buttons && pad.buttons[i];
  if (b == null) return 0;
  if (typeof b === 'number') return b;
  if (typeof b === 'boolean') return b ? 1 : 0;
  return b.pressed ? Math.max(1, Number(b.value) || 0) : (Number(b.value) || 0);
}

function sampleGamepads() {
  for (const b of BUTTONS) src.pad[b] = false;
  const list = [];
  try {
    const gp = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : null;
    if (gp) for (const p of gp) if (p && p.connected !== false) list.push(p);
  } catch (_) { /* insecure context / permissions policy */ }
  if (virtualPad) list.push(virtualPad);
  padInfo = { connected: list.length > 0, count: list.length, id: list[0] ? String(list[0].id || 'pad') : null,
    mapping: list[0] ? (list[0].mapping || '') : null, virtual: !!virtualPad };
  let best = { x: 0, y: 0, mag: 0 };
  let look = { x: 0, y: 0, mag: 0 };
  let lookBtn = 0;
  let raw = { lx: 0, ly: 0, rx: 0, ry: 0, buttons: [] };
  let bestRawMag = -1;
  for (const pad of list) {
    for (const b of BUTTONS) {
      const idx = PAD_BUTTONS[b];
      for (const i of idx) {
        const thr = (i === 6 || i === 7) ? CFG.triggerOn : 0.5;
        if (padValue(pad, i) >= thr) { src.pad[b] = true; break; }
      }
    }
    const ax = pad.axes || [];
    const lx = Number(ax[0]) || 0, ly = Number(ax[1]) || 0, rx = Number(ax[2]) || 0, ry = Number(ax[3]) || 0;
    const v = radial(lx, -ly, CFG.padDead);
    if (v.mag > best.mag) best = v;
    const lv = radial(rx, -ry, CFG.lookDead);
    if (lv.mag > look.mag) look = lv;
    if (padValue(pad, PAD_LOOK.left) >= 0.5) lookBtn -= 1;
    if (padValue(pad, PAD_LOOK.right) >= 0.5) lookBtn += 1;
    const rm = Math.hypot(lx, ly);
    if (rm > bestRawMag) {
      bestRawMag = rm;
      raw = { lx: r3(lx), ly: r3(ly), rx: r3(rx), ry: r3(ry), buttons: Array.from({ length: Math.min(17, (pad.buttons || []).length) }, (_, i) => padValue(pad, i) >= 0.5 ? 1 : 0) };
    }
  }
  padStick = best;
  padRaw = raw;
  const dirs = analogDirs(best, padHyst);
  for (const d of DIRS) src.padDir[d] = dirs[d];
  lookV = { x: clamp(look.x + clamp(lookBtn, -1, 1), -1, 1), y: look.y };
  const active = best.mag > 0 || BUTTONS.some(b => src.pad[b]) || look.mag > 0 || lookBtn !== 0;
  if (active && !padWasActive) setDevice('gamepad');
  padWasActive = active;
}

/** Analog vector -> 8-way digital directions with magnitude and angle hysteresis. Mutates `h`. */
function analogDirs(v, h) {
  const m = v.mag;
  h.active = h.active ? m > CFG.analogOff : m > CFG.analogOn;
  if (!h.active) { h.up = h.down = h.left = h.right = false; return h; }
  const ux = v.x / (m || 1), uy = v.y / (m || 1);
  h.up = h.up ? uy > CFG.sectorOff : uy > CFG.sectorOn;
  h.down = h.down ? -uy > CFG.sectorOff : -uy > CFG.sectorOn;
  h.right = h.right ? ux > CFG.sectorOff : ux > CFG.sectorOn;
  h.left = h.left ? -ux > CFG.sectorOff : -ux > CFG.sectorOn;
  return h;
}

// ── touch overlay ────────────────────────────────────────────────────────────────────────────────────────────
function isCoarse() {
  try { return !!(coarseMQ ? coarseMQ.matches : matchMedia('(pointer: coarse)').matches); } catch (_) { return false; }
}

function readTouchOverride() {
  try {
    const q = new URLSearchParams(location.search).get('touch');
    if (q === 'on' || q === 'off' || q === 'auto') return q;
  } catch (_) {}
  try {
    const q = localStorage.getItem('dqv.touch');
    if (q === 'on' || q === 'off' || q === 'auto') return q;
  } catch (_) {}
  return null;
}

function css() {
  const S = SKIN;
  return `
.dq-touch{
  --dq-t-top:var(--dq-win-top,${S.top});--dq-t-bot:var(--dq-win-bot,${S.bot});--dq-t-hi:var(--dq-win-hi,${S.hi});
  --dq-t-edge:var(--dq-win-edge,${S.edge});--dq-t-line:var(--dq-win-line,${S.line});--dq-t-ink:var(--dq-ink,${S.ink});
  --dq-t-gold:var(--dq-gold,${S.gold});--dq-t-knob:${S.knob};--dq-t-knob-hi:${S.knobHi};--dq-t-knob-shade:${S.knobShade};
  --dq-t-inkshadow:${rgba(S.inkShadow, 0.85)};--dq-t-drop:${rgba(S.shadow, 0.34)};--dq-t-gold-glow:${rgba(S.gold, 0.55)};
  --dq-t-sheen:${rgba(S.knobHi, 0.42)};--dq-t-gap:${rgba(S.inkShadow, 0.55)};
  --dq-stick:clamp(118px,23vmin,172px);--dq-knob:calc(var(--dq-stick)*.44);
  --dq-a:clamp(80px,15.5vmin,114px);--dq-b:clamp(62px,11.6vmin,86px);--dq-m:clamp(40px,7vmin,52px);
  --dq-sl:env(safe-area-inset-left,0px);--dq-sr:env(safe-area-inset-right,0px);--dq-sb:env(safe-area-inset-bottom,0px);
  position:fixed;inset:0;z-index:60;pointer-events:none;opacity:0;transition:opacity .28s ease;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;
  font-family:var(--dq-font,ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold","Nunito","Trebuchet MS",system-ui,sans-serif);
}
.dq-touch.is-visible{opacity:1}
.dq-touch[hidden]{display:none!important}
.dq-stick{position:absolute;left:calc(var(--dq-sl) + 3.6vmin + 10px);bottom:calc(var(--dq-sb) + 3.6vmin + 10px);
  width:var(--dq-stick);height:var(--dq-stick);opacity:.78;
  transition:transform .26s cubic-bezier(.2,.9,.3,1.15),opacity .2s ease}
.dq-stick.is-active{transition:opacity .12s ease;opacity:1}
.dq-stick-base,.dq-stick-base::before,.dq-stick-base::after{position:absolute;inset:0;border-radius:50%}
.dq-stick-base::before{content:"";background:radial-gradient(circle at 50% 34%,var(--dq-t-hi) 0,var(--dq-t-top) 46%,var(--dq-t-bot) 100%);opacity:.5}
.dq-stick-base::after{content:"";border:4px solid var(--dq-t-edge);opacity:.88;
  box-shadow:inset 0 0 0 2px var(--dq-t-gap),inset 0 0 0 4px var(--dq-t-line),0 6px 16px var(--dq-t-drop)}
.dq-stick-arrows{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.dq-stick-arrows path{fill:var(--dq-t-edge);stroke:var(--dq-t-edge);stroke-width:5;stroke-linejoin:round;opacity:.72;
  transition:fill .08s,stroke .08s,opacity .08s}
.dq-stick-arrows path.is-on{fill:var(--dq-t-gold);stroke:var(--dq-t-gold);opacity:1}
.dq-stick-knob{position:absolute;left:50%;top:50%;width:var(--dq-knob);height:var(--dq-knob);
  margin:calc(var(--dq-knob)*-.5) 0 0 calc(var(--dq-knob)*-.5);border-radius:50%;
  background:radial-gradient(circle at 38% 30%,var(--dq-t-knob-hi) 0,var(--dq-t-knob) 36%,var(--dq-t-knob-shade) 100%);
  box-shadow:0 0 0 3px var(--dq-t-bot),0 0 0 5px var(--dq-t-edge),0 6px 12px var(--dq-t-drop);
  transition:transform .2s cubic-bezier(.2,.9,.3,1.3),box-shadow .12s}
.dq-stick.is-active .dq-stick-knob{transition:box-shadow .12s}
.dq-stick-knob::after{content:"";position:absolute;left:30%;top:30%;width:40%;height:40%;border-radius:50%;
  background:radial-gradient(circle at 40% 35%,var(--dq-t-hi) 0,var(--dq-t-top) 60%,var(--dq-t-bot) 100%);opacity:.9}
.dq-stick.is-run .dq-stick-knob{box-shadow:0 0 0 3px var(--dq-t-bot),0 0 0 5px var(--dq-t-gold),0 0 20px var(--dq-t-gold-glow),0 6px 12px var(--dq-t-drop)}
.dq-tb{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  border-radius:50%;pointer-events:auto;touch-action:none;cursor:pointer;color:var(--dq-t-ink);font-weight:800;
  letter-spacing:.04em;line-height:1;text-shadow:0 2px 0 var(--dq-t-inkshadow);
  transition:transform .14s cubic-bezier(.2,.9,.3,1.5)}
.dq-tb::before,.dq-tb::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none}
.dq-tb::before{background:radial-gradient(120% 95% at 50% 16%,var(--dq-t-hi) 0,var(--dq-t-top) 44%,var(--dq-t-bot) 100%);opacity:.6;transition:opacity .1s}
.dq-tb::after{border:4px solid var(--dq-t-edge);opacity:.9;
  box-shadow:inset 0 0 0 2px var(--dq-t-gap),inset 0 0 0 4px var(--dq-t-line),0 6px 14px var(--dq-t-drop);transition:border-color .08s,box-shadow .08s}
.dq-tb>*{position:relative;z-index:1;pointer-events:none}
.dq-tb .dq-sheen{position:absolute;left:22%;top:13%;width:34%;height:20%;border-radius:50%;background:var(--dq-t-sheen);transform:rotate(-18deg);filter:blur(1px)}
.dq-tb.is-down{transform:scale(.9)}
.dq-tb.is-down::before{opacity:.92}
.dq-tb.is-down::after{border-color:var(--dq-t-gold);box-shadow:inset 0 0 0 2px var(--dq-t-gap),inset 0 0 0 4px var(--dq-t-gold),0 0 22px var(--dq-t-gold-glow)}
.dq-tb-confirm{width:var(--dq-a);height:var(--dq-a);right:calc(var(--dq-sr) + 3.6vmin + 10px);bottom:calc(var(--dq-sb) + 7.4vmin + 10px);font-size:calc(var(--dq-a)*.3)}
.dq-tb-confirm::after{border-width:5px}
.dq-tb-cancel{width:var(--dq-b);height:var(--dq-b);right:calc(var(--dq-sr) + 3.6vmin + 10px + var(--dq-a) + 1.8vmin);bottom:calc(var(--dq-sb) + 2.2vmin + 8px);font-size:calc(var(--dq-b)*.25)}
.dq-tb-menu{height:var(--dq-m);padding:0 calc(var(--dq-m)*.42) 0 calc(var(--dq-m)*.34);border-radius:calc(var(--dq-m)*.5);
  right:calc(var(--dq-sr) + 3.6vmin + 10px + var(--dq-a)*.12);bottom:calc(var(--dq-sb) + 7.4vmin + 10px + var(--dq-a) + 2.4vmin);
  flex-direction:row;gap:calc(var(--dq-m)*.18);font-size:calc(var(--dq-m)*.4)}
.dq-tb-menu .dq-sheen{left:12%;top:12%;width:44%;height:24%}
.dq-tb-menu svg{width:calc(var(--dq-m)*.42);height:calc(var(--dq-m)*.42);overflow:visible}
.dq-tb-menu svg rect{fill:var(--dq-t-ink)}
.dq-tb-sub{font-size:.42em;letter-spacing:.12em;opacity:.8;font-weight:700}
`;
}

function buildOverlay() {
  if (dom || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'dq-input-style';
  style.textContent = css();
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'dq-touch';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  // Rounded chevrons at N/E/S/W of a 100x100 base.
  const chev = (d, pts) => `<path data-dir="${d}" d="${pts}"/>`;
  root.innerHTML =
    `<div class="dq-stick"><div class="dq-stick-base"></div>` +
    `<svg class="dq-stick-arrows" viewBox="0 0 100 100" aria-hidden="true">` +
      chev('up', 'M50 10 L57.5 19 L42.5 19 Z') + chev('down', 'M50 90 L57.5 81 L42.5 81 Z') +
      chev('left', 'M10 50 L19 42.5 L19 57.5 Z') + chev('right', 'M90 50 L81 42.5 L81 57.5 Z') +
    `</svg><div class="dq-stick-knob"></div></div>` +
    `<div class="dq-tb dq-tb-cancel" data-btn="cancel" role="button" aria-label="Back"><span class="dq-sheen"></span><span>Back</span></div>` +
    `<div class="dq-tb dq-tb-confirm" data-btn="confirm" role="button" aria-label="OK"><span class="dq-sheen"></span><span>OK</span></div>` +
    `<div class="dq-tb dq-tb-menu" data-btn="menu" role="button" aria-label="Menu"><span class="dq-sheen"></span>` +
      `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="1" y="2" width="18" height="3.6" rx="1.8"/><rect x="1" y="8.2" width="18" height="3.6" rx="1.8"/><rect x="1" y="14.4" width="18" height="3.6" rx="1.8"/></svg>` +
      `<span>Menu</span></div>`;
  const host = document.getElementById('ui-root') || document.body;
  host.appendChild(root);
  const q = (s) => root.querySelector(s);
  dom = { style, root, stick: q('.dq-stick'), knob: q('.dq-stick-knob'), arrows: {}, btn: {} };
  for (const d of DIRS) dom.arrows[d] = root.querySelector(`path[data-dir="${d}"]`);
  for (const el of root.querySelectorAll('.dq-tb')) {
    dom.btn[el.dataset.btn] = el;
    el.addEventListener('pointerdown', onButtonPointerDown, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

let prevHtmlTouchAction = null;
function setTouchVisible(on) {
  on = !!on;
  if (on) buildOverlay();
  if (!dom) { touchVisible = false; return; }
  if (on === touchVisible) return;
  touchVisible = on;
  const html = document.documentElement;
  if (on) {
    dom.root.hidden = false;
    // next frame so the fade runs
    requestAnimationFrame(() => { if (touchVisible && dom) dom.root.classList.add('is-visible'); });
    if (prevHtmlTouchAction === null) { prevHtmlTouchAction = html.style.touchAction || ''; html.style.touchAction = 'none'; }
  } else {
    endStick();
    for (const [id, btn] of Array.from(btnPointers)) { btnPointers.delete(id); releaseTouchButton(btn); }
    dom.root.classList.remove('is-visible');
    dom.root.hidden = true;
    if (prevHtmlTouchAction !== null) { html.style.touchAction = prevHtmlTouchAction; prevHtmlTouchAction = null; }
  }
  try { Bus.emit('input.touch', { visible: on, mode: touchMode }); } catch (_) {}
}

function applyTouchMode() {
  if (touchMode === 'on') setTouchVisible(true);
  else if (touchMode === 'off') setTouchVisible(false);
  else setTouchVisible(isCoarse());
}

function showTouchIfAuto() { if (touchMode === 'auto' && !touchVisible) setTouchVisible(true); }

function pressTouchButton(btn) {
  touchHeld[btn] = (touchHeld[btn] || 0) + 1;
  touchTaps.add(btn);
  touchCounts.buttonPresses++;
  if (dom && dom.btn[btn]) dom.btn[btn].classList.add('is-down');
  setDevice('touch');
}

function releaseTouchButton(btn) {
  touchHeld[btn] = Math.max(0, (touchHeld[btn] || 0) - 1);
  if (!touchHeld[btn] && dom && dom.btn[btn]) dom.btn[btn].classList.remove('is-down');
}

function haptic(e) {
  try {
    if (e.isTrusted && navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(8);
  } catch (_) {}
}

function onButtonPointerDown(e) {
  try {
    const el = e.currentTarget;
    const btn = el && el.dataset.btn;
    if (!IS_BUTTON.has(btn)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    if (btnPointers.has(e.pointerId)) return;
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    btnPointers.set(e.pointerId, btn);
    pressTouchButton(btn);
    haptic(e);
  } catch (err) { reportError('Input touch button', err); }
}

function interactiveTarget(t) {
  if (!t || typeof t.closest !== 'function') return false;
  return !!t.closest('button, a, input, select, textarea, label, [contenteditable], [data-dq-ui], .dq-tb');
}

function onWindowPointerDown(e) {
  try {
    if (e.pointerType === 'touch') showTouchIfAuto();
    if (!touchVisible || !dom) return;
    if (e.pointerType === 'mouse' && (touchMode !== 'on' || e.button !== 0)) return;
    if (stick.pointerId !== null) return;
    if (interactiveTarget(e.target)) return;
    const vw = innerWidth, vh = innerHeight;
    if (e.clientX > vw * CFG.touchZone.maxX || e.clientY < vh * CFG.touchZone.minY) return;
    startStick(e);
  } catch (err) { reportError('Input pointerdown', err); }
}

function startStick(e) {
  const el = dom.stick;
  const size = el.offsetWidth || 150;
  stick.radius = size / 2;
  stick.travel = stick.radius * 0.62;
  stick.hx = el.offsetLeft + size / 2;
  stick.hy = el.offsetTop + size / 2;
  const vw = innerWidth, vh = innerHeight, R = stick.radius;
  stick.cx = clamp(e.clientX, R + 4, vw - R - 4);
  stick.cy = clamp(e.clientY, R + 4, vh - R - 4);
  stick.pointerId = e.pointerId;
  stick.active = true;
  touchCounts.starts++;
  el.classList.add('is-active');
  moveStick(e.clientX, e.clientY);
  if (e.cancelable) e.preventDefault();
  try { if (e.target && e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId); } catch (_) {}
  setDevice('touch');
}

function moveStick(px, py) {
  let dx = px - stick.cx, dy = py - stick.cy;
  let d = Math.hypot(dx, dy);
  const follow = stick.travel * CFG.touchFollow;
  if (d > follow) { // drag the base along behind the thumb
    const k = (d - follow) / d;
    stick.cx += dx * k; stick.cy += dy * k;
    const R = stick.radius;
    stick.cx = clamp(stick.cx, R + 4, innerWidth - R - 4);
    stick.cy = clamp(stick.cy, R + 4, innerHeight - R - 4);
    dx = px - stick.cx; dy = py - stick.cy; d = Math.hypot(dx, dy);
  }
  stick.px = px; stick.py = py;
  stick.raw = { x: dx / stick.travel, y: -dy / stick.travel };
  const rm = Math.hypot(stick.raw.x, stick.raw.y), s = rm > 1 ? 1 / rm : 1;
  stick.vec = radial(stick.raw.x * s, stick.raw.y * s, CFG.touchDead);
  stick.run = d > stick.travel * CFG.touchRun;
  stick.ox = stick.cx - stick.hx; stick.oy = stick.cy - stick.hy;
  if (dom) {
    dom.stick.style.transform = `translate3d(${stick.ox.toFixed(1)}px,${stick.oy.toFixed(1)}px,0)`;
    const k = d > stick.travel ? stick.travel / d : 1;
    dom.knob.style.transform = `translate3d(${(dx * k).toFixed(1)}px,${(dy * k).toFixed(1)}px,0)`;
    dom.stick.classList.toggle('is-run', stick.run);
  }
}

function endStick() {
  stick.pointerId = null;
  stick.active = false;
  stick.raw = { x: 0, y: 0 };
  stick.vec = { x: 0, y: 0, mag: 0 };
  stick.run = false;
  if (dom) {
    dom.stick.classList.remove('is-active', 'is-run');
    dom.stick.style.transform = '';
    dom.knob.style.transform = '';
  }
}

function onWindowPointerMove(e) {
  try {
    if (stick.pointerId !== null && e.pointerId === stick.pointerId) { moveStick(e.clientX, e.clientY); return; }
    const cur = btnPointers.get(e.pointerId);
    if (cur && typeof document.elementFromPoint === 'function') {
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const over = hit && hit.closest ? hit.closest('.dq-tb') : null;
      const next = over && over.dataset.btn;
      if (next && next !== cur && IS_BUTTON.has(next)) { // slide a thumb from one button to the next
        btnPointers.set(e.pointerId, next);
        releaseTouchButton(cur);
        pressTouchButton(next);
      }
    }
  } catch (err) { reportError('Input pointermove', err); }
}

function onWindowPointerUp(e) {
  try {
    if (stick.pointerId !== null && e.pointerId === stick.pointerId) endStick();
    const btn = btnPointers.get(e.pointerId);
    if (btn) { btnPointers.delete(e.pointerId); releaseTouchButton(btn); }
  } catch (err) { reportError('Input pointerup', err); }
}

// ── injection ────────────────────────────────────────────────────────────────────────────────────────────────
function stepInjection() {
  for (const b of BUTTONS) {
    const q = inj[b];
    let d = q.hold;
    if (q.left > 0) { d = true; q.left--; if (q.left === 0) q.gap = 1; }
    else if (q.gap > 0) { q.gap--; }
    else if (q.queue.length) { q.left = q.queue.shift(); d = true; q.left--; if (q.left === 0) q.gap = 1; }
    src.inj[b] = d;
  }
  // ordered sequence
  if (!seq.cur && seq.items.length) {
    seq.cur = seq.items.shift();
    seq.left = seq.cur.ticks;
    seq.gapLeft = seq.cur.gap;
  }
  if (seq.cur) {
    if (seq.left > 0) {
      if (seq.cur.btn) src.inj[seq.cur.btn] = true;
      seq.left--;
    } else {
      seq.gapLeft--;
      if (seq.gapLeft <= 0) seq.cur = null;
    }
  }
}

// ── the per-tick poll ────────────────────────────────────────────────────────────────────────────────────────
function poll() {
  tick++;
  polls++;
  stepInjection();
  sampleGamepads();

  // keyboard
  for (const b of BUTTONS) {
    let d = false;
    for (const c of bindings[b] || []) if (kbHeld(c)) { d = true; break; }
    src.kb[b] = d;
  }
  // touch
  const tDirs = analogDirs(stick.vec, touchHyst);
  for (const b of BUTTONS) src.touch[b] = (touchHeld[b] || 0) > 0 || touchTaps.has(b);
  for (const d of DIRS) src.touchDir[d] = tDirs[d];
  if (stick.run) src.touch.run = true;
  if (dom) for (const d of DIRS) {
    const on = tDirs[d];
    const el = dom.arrows[d];
    if (el && el.classList.contains('is-on') !== on) el.classList.toggle('is-on', on);
  }

  const blocked = blockTokens.size > 0;
  computeAxis(blocked);

  // look keys
  let lk = 0;
  for (const c of LOOK_KEYS.left) if (kbHeld(c)) lk -= 1;
  for (const c of LOOK_KEYS.right) if (kbHeld(c)) lk += 1;
  if (lk) lookV = { x: clamp(lookV.x + lk, -1, 1), y: lookV.y };
  if (blocked) lookV = { x: 0, y: 0 };

  keyTaps.clear();
  touchTaps.clear();

  // edges
  for (const b of BUTTONS) {
    const st = B[b];
    const devs = src.kb[b] ? 'keyboard' : (src.pad[b] || src.padDir[b]) ? 'gamepad' : (src.touch[b] || src.touchDir[b]) ? 'touch' : src.inj[b] ? 'inject' : null;
    let raw = !!devs;
    st.raw = raw;
    if (blocked) raw = false;
    if (st.suppressed) { if (!raw) st.suppressed = false; raw = false; }
    if (raw && !st.down) {
      st.down = true; st.pressTick = tick; st.heldTicks = 0; st.repeats = 0; st.nextRepeat = repeatTicks.delay;
      st.presses++; st.device = devs; st.repeatLocked = false;
      logEvent(b, 'press', devs);
      setDevice(devs);
    } else if (!raw && st.down) {
      st.down = false; st.releaseTick = tick; st.repeatLocked = false;
      logEvent(b, 'release', st.device);
    } else if (raw) {
      st.heldTicks++;
    }
  }

  // repeat (directions: only the most recently pressed held direction repeats)
  let owner = null;
  for (const d of DIRS) if (B[d].down && (!owner || B[d].pressTick > B[owner].pressTick)) owner = d;
  for (const b of REPEAT.buttons) {
    const st = B[b];
    if (!st || !st.down || st.pressTick === tick || st.repeatLocked) continue;
    const isDir = DIRS.includes(b);
    if (isDir && b !== owner) { st.nextRepeat = Math.max(st.nextRepeat, st.heldTicks + repeatTicks.interval); continue; }
    if (st.heldTicks >= st.nextRepeat) {
      st.repeatTick = tick; st.repeats++; st.repeatsTotal++;
      st.nextRepeat += st.repeats >= REPEAT.fastAfter ? repeatTicks.fast : repeatTicks.interval;
      logEvent(b, 'repeat', st.device);
    }
  }

  // deliver to the scene stack
  for (const b of BUTTONS) {
    const st = B[b];
    const isPress = st.pressTick === tick;
    const isRepeat = st.repeatTick === tick;
    if (!isPress && !isRepeat) continue;
    current = { btn: b, repeat: !isPress, device: st.device, tick };
    const before = sceneChanges;
    try { Scenes.input(b); } catch (e) { reportError('Input dispatch', e); }
    if (sceneChanges !== before) st.consumedTick = tick;
    current = null;
  }
}

function computeAxis(blocked) {
  if (blocked) { axisV = { x: 0, y: 0, mag: 0, angle: 0, source: null }; return; }
  // digital: keyboard with last-pressed-wins, then d-pad and injection
  const kbDirOrder = (d) => { let o = 0; for (const c of bindings[d] || []) if (kbHeld(c)) o = Math.max(o, kbOrder(c)); return o; };
  const L = kbDirOrder('left'), R = kbDirOrder('right'), U = kbDirOrder('up'), D = kbDirOrder('down');
  let kx = (L || R) ? (R > L ? 1 : -1) : 0;
  let ky = (U || D) ? (U > D ? 1 : -1) : 0;
  let dx = kx, dy = ky, dsrc = (kx || ky) ? 'keyboard' : null;
  if (!dx && !dy) {
    const on = (d) => src.pad[d];
    const px = (on('right') ? 1 : 0) - (on('left') ? 1 : 0), py = (on('up') ? 1 : 0) - (on('down') ? 1 : 0);
    if (px || py) { dx = px; dy = py; dsrc = 'gamepad'; }
  }
  if (!dx && !dy) {
    const on = (d) => src.inj[d];
    const ix = (on('right') ? 1 : 0) - (on('left') ? 1 : 0), iy = (on('up') ? 1 : 0) - (on('down') ? 1 : 0);
    if (ix || iy) { dx = ix; dy = iy; dsrc = 'inject'; }
  }
  let best = { x: 0, y: 0, mag: 0, source: null };
  if (dx || dy) {
    const k = dx && dy ? Math.SQRT1_2 : 1;
    best = { x: dx * k, y: dy * k, mag: 1, source: dsrc };
  }
  if (padStick.mag > best.mag) best = { x: padStick.x, y: padStick.y, mag: padStick.mag, source: 'gamepad' };
  if (stick.vec.mag > best.mag) best = { x: stick.vec.x, y: stick.vec.y, mag: stick.vec.mag, source: 'touch' };
  const x = r3(best.x), y = r3(best.y);
  axisV = { x, y, mag: r3(Math.min(1, best.mag)), angle: best.mag ? r3(Math.atan2(y, x) * 180 / Math.PI) : 0, source: best.source };
}

// ── release / block ──────────────────────────────────────────────────────────────────────────────────────────
function releaseAll(reason = 'manual') {
  keys.clear(); keyTaps.clear();
  for (const [, btn] of Array.from(btnPointers)) releaseTouchButton(btn);
  btnPointers.clear(); touchTaps.clear();
  for (const b of BUTTONS) touchHeld[b] = 0;
  if (dom) for (const el of Object.values(dom.btn)) el.classList.remove('is-down');
  endStick();
  for (const b of BUTTONS) { const q = inj[b]; q.queue.length = 0; q.left = 0; q.gap = 0; q.hold = false; }
  seq.items.length = 0; seq.cur = null; seq.left = 0; seq.gapLeft = 0;
  // Anything still physically held (a gamepad button) must be let go before it counts again. down() reads false at once;
  // released() fires on the next tick.
  for (const b of BUTTONS) if (B[b].down || B[b].raw) B[b].suppressed = true;
  axisV = { x: 0, y: 0, mag: 0, angle: 0, source: null };
  lookV = { x: 0, y: 0 };
  blurReleases++;
  lastBlurReason = reason;
  try { Bus.emit('input.release', { reason }); } catch (_) {}
}

function suppressHeld() { for (const b of BUTTONS) if (B[b].down || B[b].raw) B[b].suppressed = true; }

// ── lifecycle ────────────────────────────────────────────────────────────────────────────────────────────────
function listen(target, type, fn, opts) {
  if (!target || !target.addEventListener) return;
  target.addEventListener(type, fn, opts);
  listeners.push([target, type, fn, opts]);
}

function frameFallback() {
  // If ticks ran this frame but nobody called Input.update(), poll here so the game still responds.
  if (Loop.tick !== lastFrameLoopTick) {
    if (externalCalls === 0 && lastFrameLoopTick >= 0) {
      driver = 'frame-fallback';
      fallbackPolls++;
      try { poll(); } catch (e) { reportError('Input fallback poll', e); }
    }
    lastFrameLoopTick = Loop.tick;
  }
  externalCalls = 0;
}

function validButton(btn) { return IS_BUTTON.has(String(btn)); }
const badButton = (btn) => ({ ok: false, reason: `unknown button "${btn}"`, buttons: BUTTONS.slice() });

export const Input = {
  BUTTONS,

  get device() { return device; },
  get tick() { return tick; },

  init(opts = {}) {
    if (inited) { if (opts.touch) Input.setTouchMode(opts.touch); return Input; }
    inited = true;
    try {
      bindings = {};
      for (const b of BUTTONS) bindings[b] = DEFAULT_KEYS[b].slice();
      rebuildCodeMap();
      computeRepeatTicks();
      if (hasWindow) {
        listen(window, 'keydown', onKeyDown, { passive: false });
        listen(window, 'keyup', onKeyUp, { passive: false });
        listen(window, 'blur', () => releaseAll('blur'));
        listen(window, 'pagehide', () => releaseAll('pagehide'));
        listen(document, 'visibilitychange', () => { if (document.hidden) releaseAll('hidden'); });
        listen(window, 'pointerdown', onWindowPointerDown, { capture: true, passive: false });
        listen(window, 'pointermove', onWindowPointerMove, { capture: true, passive: true });
        listen(window, 'pointerup', onWindowPointerUp, { capture: true, passive: true });
        listen(window, 'pointercancel', onWindowPointerUp, { capture: true, passive: true });
        listen(window, 'gamepadconnected', (e) => { try { Bus.emit('input.gamepad', { connected: true, id: e.gamepad && e.gamepad.id }); } catch (_) {} });
        listen(window, 'gamepaddisconnected', (e) => { try { Bus.emit('input.gamepad', { connected: false, id: e.gamepad && e.gamepad.id }); } catch (_) {} });
        try {
          coarseMQ = matchMedia('(pointer: coarse)');
          const onChange = () => { if (touchMode === 'auto') applyTouchMode(); };
          if (coarseMQ.addEventListener) coarseMQ.addEventListener('change', onChange);
        } catch (_) { coarseMQ = null; }
        touchMode = opts.touch || readTouchOverride() || 'auto';
        applyTouchMode();
      }
      // A new scene must not inherit a held direction's repeat (holding down while a menu opens must not scroll it):
      // held buttons stop repeating until they are pressed again.
      offSceneBus = Bus.on('scene.*', () => { sceneChanges++; for (const b of BUTTONS) if (B[b].down) B[b].repeatLocked = true; });
      Loop.onFrame(frameFallback);

      Debug.implement('press', (btn, ms) => Input.inject(btn, ms === undefined ? 100 : ms));
      Debug.implement('hold', (btn, ms) => (ms === undefined || ms === null || !(Number(ms) > 0)) ? Input.hold(btn) : Input.inject(btn, ms));
      Debug.implement('release', (btn) => Input.release(btn));
      Debug.provide('input', () => Input.describe());
      Debug.expose('pressSeq', (list, o) => Input.sequence(list, o));
      Debug.expose('touchMode', (m) => (m === undefined ? { mode: touchMode, visible: touchVisible } : Input.setTouchMode(m)));
    } catch (e) {
      reportError('Input.init', e);
    }
    return Input;
  },

  /** Poll once per fixed tick, BEFORE Scenes.update. Safe to pass directly: App.start({beforeUpdate: Input.update}). */
  update() {
    if (!inited) Input.init();
    externalCalls++;
    driver = 'tick';
    try { poll(); } catch (e) { reportError('Input.update', e); }
  },

  down(btn) { const st = B[btn]; return !!(st && st.down && !st.suppressed && !blockTokens.size); },
  pressed(btn) { const st = B[btn]; return !!(st && st.pressTick === tick && st.consumedTick !== tick); },
  released(btn) { const st = B[btn]; return !!(st && st.releaseTick === tick); },
  repeat(btn) { const st = B[btn]; return !!(st && (st.pressTick === tick || st.repeatTick === tick) && st.consumedTick !== tick); },
  any() { return BUTTONS.some(b => Input.pressed(b)); },
  anyDown() { return BUTTONS.some(b => Input.down(b)); },
  heldMs(btn) { const st = B[btn]; return st && st.down ? Math.round((st.heldTicks + 1) * TICK_MS()) : 0; },
  consume(btn) { if (btn === undefined) { for (const b of BUTTONS) B[b].consumedTick = tick; return true; } const st = B[btn]; if (st) st.consumedTick = tick; return !!st; },
  current() { return current ? { ...current } : null; },

  axis() { return { ...axisV }; },
  look() { return { ...lookV }; },

  inject(btn, ms = 100) {
    const b = String(btn);
    if (!validButton(b)) return badButton(b);
    if (!inited) Input.init();
    const ticks = msToTicks(ms);
    const q = inj[b];
    q.queue.push(ticks);
    return { ok: true, button: b, ms: Number(ms) || 0, ticks, queued: q.queue.length + (q.left > 0 ? 1 : 0) - 1 };
  },

  hold(btn) {
    const b = String(btn);
    if (!validButton(b)) return badButton(b);
    if (!inited) Input.init();
    inj[b].hold = true;
    return { ok: true, button: b, hold: true };
  },

  release(btn) {
    if (btn === undefined || btn === null) {
      for (const b of BUTTONS) { const q = inj[b]; q.hold = false; q.queue.length = 0; q.left = 0; }
      seq.items.length = 0; seq.cur = null;
      return { ok: true, released: 'all' };
    }
    const b = String(btn);
    if (!validButton(b)) return badButton(b);
    const q = inj[b];
    const was = q.hold || q.left > 0 || q.queue.length > 0;
    q.hold = false; q.queue.length = 0; q.left = 0;
    if (seq.cur && seq.cur.btn === b) seq.left = 0;
    return { ok: true, button: b, wasHeld: was };
  },

  /** Ordered presses: items are 'btn' | {btn, ms?, gap?} | {wait: ms}. Returns the number queued. */
  sequence(list, opts = {}) {
    if (!inited) Input.init();
    const items = Array.isArray(list) ? list : [list];
    const holdMs = opts && opts.hold != null ? opts.hold : 100;
    const gapMs = opts && opts.gap != null ? opts.gap : 80;
    let n = 0;
    const bad = [];
    for (const it of items) {
      if (it && typeof it === 'object' && it.wait != null) { seq.items.push({ btn: null, ticks: 0, gap: msToTicks(it.wait) }); n++; continue; }
      const b = String(it && typeof it === 'object' ? it.btn : it);
      if (!validButton(b)) { bad.push(b); continue; }
      const ms = it && typeof it === 'object' && it.ms != null ? it.ms : holdMs;
      const gap = it && typeof it === 'object' && it.gap != null ? it.gap : gapMs;
      seq.items.push({ btn: b, ticks: msToTicks(ms), gap: msToTicks(gap) });
      n++;
    }
    return bad.length ? { ok: false, queued: n, reason: `unknown buttons: ${bad.join(', ')}`, buttons: BUTTONS.slice() } : { ok: true, queued: n };
  },

  block(token, on = true) {
    const k = String(token);
    if (on) blockTokens.add(k);
    else if (blockTokens.delete(k) && !blockTokens.size) suppressHeld();
    return blockTokens.size;
  },

  suppress() { suppressHeld(); return true; },
  releaseAll(reason) { releaseAll(reason || 'manual'); return true; },

  setRepeat(o = {}) {
    for (const k of ['delay', 'interval', 'fast', 'fastAfter']) if (Number(o[k]) > 0) REPEAT[k] = Number(o[k]);
    if (Array.isArray(o.buttons)) REPEAT.buttons = o.buttons.filter(validButton);
    computeRepeatTicks();
    return Input.getRepeat();
  },
  getRepeat() { return { ...REPEAT, buttons: REPEAT.buttons.slice(), ticks: { ...repeatTicks } }; },

  bind(btn, codes) {
    if (!validButton(btn) || !Array.isArray(codes)) return false;
    bindings[btn] = codes.map(String);
    rebuildCodeMap();
    return true;
  },
  bindings() { const o = {}; for (const b of BUTTONS) o[b] = (bindings[b] || DEFAULT_KEYS[b]).slice(); return o; },

  setTouchMode(mode) {
    if (!['auto', 'on', 'off'].includes(mode)) return { ok: false, reason: 'mode must be auto|on|off' };
    touchMode = mode;
    try { localStorage.setItem('dqv.touch', mode); } catch (_) {}
    if (hasWindow) applyTouchMode();
    return { ok: true, mode, visible: touchVisible };
  },
  touchVisible() { return touchVisible; },
  /** The overlay root element (or null) — for layout decisions by UI pieces. */
  touchElement() { return dom ? dom.root : null; },

  /** Override skin colours ({top, bot, hi, edge, line, ink, gold, ...} as #rrggbb). */
  setSkin(skin = {}) {
    for (const k of Object.keys(skin)) if (k in SKIN && /^#[0-9a-f]{6}$/i.test(skin[k])) SKIN[k] = skin[k];
    if (dom) dom.style.textContent = css();
    return { ...SKIN };
  },

  /** Test hook: a synthetic gamepad {id?, mapping?, axes:[], buttons:[number|bool|{pressed,value}]} polled like a real one. null removes it. */
  setVirtualPad(pad) {
    if (!pad) { virtualPad = null; return { ok: true, virtual: false }; }
    virtualPad = { id: String(pad.id || 'Virtual Pad (test)'), mapping: pad.mapping == null ? 'standard' : pad.mapping,
      connected: true, axes: Array.isArray(pad.axes) ? pad.axes.slice() : [0, 0, 0, 0], buttons: Array.isArray(pad.buttons) ? pad.buttons.slice() : [] };
    return { ok: true, virtual: true };
  },

  history(n = 32) { return history.slice(-n); },

  counts() { const o = {}; for (const b of BUTTONS) o[b] = { presses: B[b].presses, repeats: B[b].repeatsTotal }; return o; },

  resetCounts() { for (const b of BUTTONS) { B[b].presses = 0; B[b].repeatsTotal = 0; } history.length = 0; blurReleases = 0; return true; },

  describe() {
    const list = (f) => BUTTONS.filter(f);
    return {
      driver, tick, polls, fallbackPolls, device,
      down: list(b => Input.down(b)),
      pressed: list(b => B[b].pressTick === tick),
      released: list(b => B[b].releaseTick === tick),
      repeat: list(b => B[b].repeatTick === tick),
      axis: { ...axisV },
      look: { x: r3(lookV.x), y: r3(lookV.y) },
      keys: Array.from(keys.keys()),
      gamepad: { ...padInfo, stick: { x: r3(padStick.x), y: r3(padStick.y), mag: r3(padStick.mag) }, raw: { lx: padRaw.lx, ly: padRaw.ly, rx: padRaw.rx, ry: padRaw.ry }, buttons: padRaw.buttons, deadZone: { ...CFG.padDead } },
      touch: { mode: touchMode, visible: touchVisible, coarse: isCoarse(), built: !!dom,
        stick: { active: stick.active, x: r3(stick.vec.x), y: r3(stick.vec.y), mag: r3(stick.vec.mag), rawX: r3(stick.raw.x), rawY: r3(stick.raw.y), run: stick.run },
        held: list(b => (touchHeld[b] || 0) > 0), starts: touchCounts.starts, buttonPresses: touchCounts.buttonPresses, deadZone: { ...CFG.touchDead } },
      injected: { held: list(b => inj[b].hold || inj[b].left > 0), queued: BUTTONS.reduce((n, b) => n + inj[b].queue.length, 0), sequence: seq.items.length + (seq.cur ? 1 : 0) },
      blocked: Array.from(blockTokens),
      suppressed: list(b => B[b].suppressed),
      repeatLocked: list(b => B[b].repeatLocked),
      repeatCfg: Input.getRepeat(),
      counts: Input.counts(),
      blurReleases, lastRelease: lastBlurReason,
    };
  },

  /** Remove listeners and the overlay (tests). */
  destroy() {
    for (const [t, type, fn, o] of listeners) { try { t.removeEventListener(type, fn, o); } catch (_) {} }
    listeners.length = 0;
    if (offSceneBus) { offSceneBus(); offSceneBus = null; }
    if (dom) { setTouchVisible(false); dom.root.remove(); dom.style.remove(); dom = null; }
    inited = false;
  },
};
