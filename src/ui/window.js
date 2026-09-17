/**
 * window.js — the Dragon Quest command window, and the tiny runtime every UI widget lives in.
 *                                                                               (F4, owner: src/ui/window.js)
 *
 *   import { UI, Window, Menu } from './ui/window.js';
 *
 * ── Windows ──────────────────────────────────────────────────────────────────────────────────────────────────
 *   const w = UI.window({ left: 40, top: 40, width: 360, title: 'Gold', content: UI.row('G', '30') });
 *   await w.open();  await w.close();  w.destroy();
 *
 *   Ids are unique: creating a window with the id of a live one destroys the old one (handy for re-entrant flows).
 *   Placement is in DESIGN PIXELS of a 1280x720 frame (the whole UI scales with the viewport):
 *     left top right bottom width height minWidth maxWidth minHeight  (x y w h are aliases)
 *     centerX / centerY: true      origin: CSS transform-origin for the open animation ('0 0', '50% 100%')
 *     pop: 'scale' (default, a quick unroll) | 'up' | 'down' | 'left' | 'right' (slide + settle) | 'none'
 *     title: string (a tab on the top border)   titleAlign: 'left' | 'center'
 *     slim: true (tighter padding)   className   zIndex   destroyOnClose: true
 *     content: string | Node | Node[]  (w.body is the element; w.setContent(x) replaces it)
 *     interactive + onInput(btn, win): a plain window that takes input (return false to pass it on)
 *   w.untilButton(['confirm','cancel']) -> Promise<btn>   focus the window and wait for one of those buttons
 *
 * ── Menus ────────────────────────────────────────────────────────────────────────────────────────────────────
 *   const cmd = UI.menu({ left: 40, top: 40, columns: 2, items: ['Talk', 'Spells', 'Status', 'Items'] });
 *   const item = await cmd.choose();          // -> the item object ({id, label, index, ...}) or null on cancel
 *   items: 'Talk' | '-' (divider) | {label, id, right, disabled, color, note, header, divider, data}
 *   options: columns, maxRows (scrolls, with ▲▼), wrap (default true), initial (index or id), lineHeight,
 *            closeOnSelect (default false), closeOnCancel (default true), cancel: false (cannot be left — use
 *            sparingly; the rubric says every menu can be left), cancelValue, onSelect(item), onCancel(),
 *            onChange(item), onDisabled(item), modal (default true: swallows other buttons)
 *   Nesting is automatic: a menu opened while another is focused takes focus; the parent's cursor stops and dims.
 *   Cancel closes the child and focus returns to the parent.
 *   UI.yesNo({right, bottom, yes:'Yes', no:'No'}) -> Promise<boolean>  (cancel = No). Default spot: just above the
 *   right end of the default MessageBox.
 *
 * ── Input ────────────────────────────────────────────────────────────────────────────────────────────────────
 *   UI.input(btn) -> boolean   deliver a virtual button (up down left right confirm cancel menu run map) to the
 *                              focused widget. A scene that owns windows calls this from onInput:
 *                                onInput(btn) { if (UI.input(btn)) return; ...field stuff... }
 *   With F2 (src/engine/input.js: Input.init() + App.start({beforeUpdate: Input.update})) every press AND menu repeat
 *   arrives through Scenes.input -> the owning scene's onInput -> UI.input. window.js never imports input.js: it
 *   detects F2 by __DQ.state().input and stands aside. Without F2 (a bare page), UI listens to keydown itself
 *   (ARCHITECTURE key map), delivers to the focused widget first, else Scenes.input(btn), and repeats held
 *   directions on F2's timing (300 ms, then every 100 ms).
 *   UI.keyboard('auto'|'raw'|'off').   Colours: window.js calls palette.js applyCssVars() once, ui.css reads --pal-ui-*.
 *
 * ── Sound, theme, scale, time ────────────────────────────────────────────────────────────────────────────────
 *   Default sounds go through src/audio/sfx.js: cursor, confirm (with the thunk), cancel, buzzer, and text ticks
 *   via Sfx.glyph(voice). UI.setSound(fn(kind, opts)) replaces it; UI.setSound(null) mutes.
 *   UI.setTheme({ 'win-top': 'rgba(...)', gold: '#...' })  -> sets --dq-* custom properties (see ui.css)
 *   UI.setScale(1.2)   bigger everything (P33 kid mode)
 *   UI.time            UI clock (seconds). Driven by the engine Loop (so __DQ.freeze / __DQ.advance apply to typing and
 *                      animation), or by requestAnimationFrame when no Loop is running.
 *   UI.wait(seconds) -> Promise (UI time)      UI.onUpdate(fn(dt, t)) -> off()
 *
 * ── Observability ────────────────────────────────────────────────────────────────────────────────────────────
 *   __DQ.state().ui = { windows:[{id, kind, title, state, focused, rect, items?, index?, selected?}], focus,
 *                       text:{page, pages, typing, pageDone, done, caret, text, ...} | null, input, sounds }
 *   Debug.busy('ui.anim') is set while a window is mid-open/close, so __DQ.screenshotReady() waits for it.
 *   Bus: ui.open {id}  ui.close {id}  ui.select {id, item}  ui.cancel {id}
 */
import { Loop } from '../engine/loop.js';
import { Scenes } from '../engine/states.js';
import { Debug, reportError } from '../engine/debug.js';
import { Bus } from '../engine/events.js';
import { Sfx } from '../audio/sfx.js';
import { applyCssVars } from '../art/palette.js';
import { Font } from './font.js';

export const DESIGN = { width: 1280, height: 720 };
export const BUTTONS = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu', 'run', 'map'];
const DIRS = new Set(['up', 'down', 'left', 'right']);

// Raw-keyboard fallback repeat, matched to F2's menu repeat (input.js REPEAT: 300 ms, then every 100 ms).
const REPEAT_DELAY = 0.30;
const REPEAT_RATE = 0.10;

// ── runtime ──────────────────────────────────────────────────────────────────────────────────────────────────
const R = {
  layer: null,
  uPx: 1,
  scale: 1,
  time: 0,
  lastSim: -1,
  rafLast: 0,
  installed: false,
  widgets: new Map(),
  openOrder: [],
  focus: [],
  updaters: new Set(),
  tweens: new Set(),
  busy: false,
  sound: null,
  soundLog: [],
  soundCount: 0,
  kb: { mode: 'auto', attached: false, held: new Set() },
  ext: { at: -1e9, live: false },
  inputCount: 0,
  lastInput: null,
  reducedMotion: false,
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = {
  linear: (k) => k,
  outBack: (k) => { const c1 = 1.4, c3 = c1 + 1; const x = k - 1; return 1 + c3 * x * x * x + c1 * x * x; },
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inQuad: (k) => k * k,
};
const U = (n) => (typeof n === 'number' ? `calc(${n} * var(--u))` : String(n));

function defaultSound(kind, opts = {}) {
  if (kind === 'glyph') return Sfx.glyph(opts.voice || 'narrator');
  const id = { cursor: 'cursor', confirm: 'confirm', cancel: 'cancel', buzzer: 'buzzer' }[kind];
  if (!id) return null;
  return Sfx.play(id, opts);
}
R.sound = defaultSound;

function sound(kind, opts) {
  R.soundCount++;
  if (kind !== 'glyph') { R.soundLog.push(kind); if (R.soundLog.length > 16) R.soundLog.shift(); }
  if (!R.sound) return null;
  try { return R.sound(kind, opts || {}); } catch (e) { reportError('UI.sound', e); return null; }
}

function install() {
  if (R.installed) return;
  R.installed = true;
  // ui.css derives every window colour from the palette's CSS vars (--pal-ui-*): publish them (idempotent).
  try { applyCssVars(); } catch (e) { reportError('UI install (palette vars)', e); }
  try { Loop.onFrame(onLoopFrame); } catch (e) { reportError('UI install (Loop.onFrame)', e); }
  try { requestAnimationFrame(onRaf); } catch (e) { reportError('UI install (raf)', e); }
  try { Debug.provide('ui', describe); } catch (e) { reportError('UI install (Debug.provide)', e); }
  try {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    R.reducedMotion = mq.matches;
    mq.addEventListener && mq.addEventListener('change', (e) => { R.reducedMotion = e.matches; });
  } catch (_) {}
  attachKeyboard();
}

/** Loop-driven clock: interpolated sim time, so freeze stops the UI and advance(ms) steps it deterministically. */
function onLoopFrame() {
  const sim = Loop.simTime + (Loop.alpha || 0) * (Loop.stepMs / 1000);
  if (R.lastSim < 0) { R.lastSim = sim; step(0); return; }
  let dt = sim - R.lastSim;
  R.lastSim = sim;
  if (!(dt > 0)) dt = 0;
  step(dt);
}

function onRaf(now) {
  try { requestAnimationFrame(onRaf); } catch (_) { return; }
  if (Loop.running) { R.rafLast = 0; return; }
  const dt = R.rafLast ? Math.min(0.1, Math.max(0, (now - R.rafLast) / 1000)) : 0;
  R.rafLast = now;
  R.lastSim = -1;
  step(dt);
}

function step(dt) {
  if (dt > 60) dt = 60;
  R.time += dt;
  if (R.tweens.size) {
    for (const tw of Array.from(R.tweens)) {
      if (tw.dead) { R.tweens.delete(tw); continue; }
      tw.t += dt;
      const k = tw.dur > 0 ? clamp01(tw.t / tw.dur) : 1;
      try { tw.fn(tw.ease(k), k); } catch (e) { reportError('UI tween', e); }
      if (k >= 1) { R.tweens.delete(tw); tw.dead = true; tw.res(true); }
    }
  }
  for (const fn of Array.from(R.updaters)) {
    try { fn(dt, R.time); } catch (e) { reportError('UI update', e); }
  }
  const busy = R.tweens.size > 0;
  if (busy !== R.busy) { R.busy = busy; try { Debug.busy('ui.anim', busy); } catch (_) {} }
}

/** Animate fn(easedK) over `dur` seconds of UI time. Returns a Promise with .cancel(). */
function tween(dur, fn, easing = ease.linear) {
  let tw;
  const p = new Promise((res) => { tw = { t: 0, dur, fn, ease: easing, res, dead: false }; });
  p.cancel = () => { if (!tw.dead) { tw.dead = true; R.tweens.delete(tw); tw.res(false); } };
  if (!(dur > 0)) {
    try { fn(easing(1), 1); } catch (e) { reportError('UI tween', e); }
    tw.dead = true; tw.res(true);
    return p;
  }
  R.tweens.add(tw);
  try { fn(easing(0), 0); } catch (e) { reportError('UI tween', e); }
  return p;
}

function wait(seconds) {
  return tween(Math.max(0, Number(seconds) || 0), () => {});
}

function layer() {
  if (R.layer && R.layer.isConnected) return R.layer;
  let host = document.getElementById('ui-root');
  if (!host) {
    host = document.createElement('div');
    host.id = 'ui-root';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none';
    document.body.appendChild(host);
  }
  let el = host.querySelector(':scope > .dq-ui');
  if (!el) {
    el = document.createElement('div');
    el.className = 'dq-ui';
    host.appendChild(el);
  }
  R.layer = el;
  const fit = () => {
    const w = el.clientWidth || innerWidth || DESIGN.width;
    const h = el.clientHeight || innerHeight || DESIGN.height;
    R.uPx = Math.min(w / DESIGN.width, h / DESIGN.height) * R.scale;
    el.style.setProperty('--u', `${R.uPx}px`);
    for (const wdg of R.widgets.values()) { try { wdg.onResize && wdg.onResize(); } catch (e) { reportError('UI resize', e); } }
  };
  R.fit = fit;
  fit();
  try { new ResizeObserver(fit).observe(el); } catch (_) { addEventListener('resize', fit); }
  install();
  return el;
}

// ── focus + input ───────────────────────────────────────────────────────────────────────────────────────────
function topFocus() {
  for (let i = R.focus.length - 1; i >= 0; i--) {
    const w = R.focus[i];
    if (w.destroyed) { R.focus.splice(i, 1); continue; }
    if (w.state === 'open' || w.state === 'opening') return w;
  }
  return null;
}

function refreshFocus() {
  const top = topFocus();
  for (const w of R.widgets.values()) {
    const f = w === top;
    if (w.focused !== f) {
      w.focused = f;
      try { w.onFocus && w.onFocus(f); } catch (e) { reportError('UI focus', e); }
    }
  }
}

function input(btn) {
  const b = String(btn);
  const w = topFocus();
  if (!w) return false;
  R.inputCount++;
  R.lastInput = b;
  try { return w.handle(b) !== false; } catch (e) { reportError(`UI input "${b}" -> ${w.id}`, e); return true; }
}

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  Enter: 'confirm', NumpadEnter: 'confirm', Space: 'confirm', KeyZ: 'confirm',
  Escape: 'cancel', KeyX: 'cancel', Backspace: 'cancel',
  Tab: 'menu', KeyC: 'menu', ShiftLeft: 'run', ShiftRight: 'run', KeyM: 'map',
};
const KEYS_BY_KEY = { ' ': 'confirm', Enter: 'confirm', Escape: 'cancel', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** Is a real input system (F2) live? Checked lazily, at most once a second. */
function externalInput() {
  if (R.kb.mode === 'raw') return false;
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (now - R.ext.at < 1000) return R.ext.live;
  R.ext.at = now;
  let live = false;
  try {
    const dq = typeof window !== 'undefined' ? window.__DQ : null;
    if (dq && typeof dq.state === 'function') { const s = dq.state(); live = !!(s && s.input && !s.input.error); }
  } catch (_) { live = false; }
  R.ext.live = live;
  return live;
}

/** Held-button repeat is ours only on the raw fallback: F2 delivers its own repeats through Scenes.input. */
function isHeld(btn) {
  if (R.ext.live) return false;
  return R.kb.held.has(btn);
}

function attachKeyboard() {
  if (R.kb.attached || typeof addEventListener !== 'function') return;
  R.kb.attached = true;
  addEventListener('keydown', (e) => {
    try {
      if (R.kb.mode === 'off') return;
      const btn = KEYS[e.code] || KEYS_BY_KEY[e.key];
      if (!btn) return;
      const t = e.target;
      if (t && t.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (externalInput()) return;
      if (topFocus() || btn === 'menu' || DIRS.has(btn) || btn === 'confirm') e.preventDefault();
      R.kb.held.add(btn);
      if (e.repeat) return;
      if (topFocus()) { input(btn); return; }
      if (Scenes.depth() > 0) Scenes.input(btn);
    } catch (err) { reportError('UI keydown', err); }
  });
  addEventListener('keyup', (e) => {
    const btn = KEYS[e.code] || KEYS_BY_KEY[e.key];
    if (btn) R.kb.held.delete(btn);
  });
  addEventListener('blur', () => R.kb.held.clear());
}

// ── procedural glyphs ───────────────────────────────────────────────────────────────────────────────────────
// A chunky, rounded, right-pointing cursor with a soft lower bevel; the ▼ caret; the ▲ scroll arrow.
const CURSOR_SVG = '<svg viewBox="0 0 24 28" aria-hidden="true">' +
  '<path class="dq-fill" d="M5.2 2.6 C3.6 1.7 2.2 2.6 2.2 4.4 L2.2 23.6 C2.2 25.4 3.6 26.3 5.2 25.4 L21.2 16.3 C22.8 15.4 22.8 12.6 21.2 11.7 Z"/>' +
  '<path class="dq-shade" d="M2.2 14 L22.4 14 C22.4 14.9 22 15.8 21.2 16.3 L5.2 25.4 C3.6 26.3 2.2 25.4 2.2 23.6 Z"/>' +
  '<path class="dq-line" stroke-width="2.3" stroke-linejoin="round" d="M5.2 2.6 C3.6 1.7 2.2 2.6 2.2 4.4 L2.2 23.6 C2.2 25.4 3.6 26.3 5.2 25.4 L21.2 16.3 C22.8 15.4 22.8 12.6 21.2 11.7 Z"/>' +
  '</svg>';
export const CARET_SVG = '<svg viewBox="0 0 26 18" aria-hidden="true">' +
  '<path class="dq-fill" d="M3.4 1.6 C1.6 1.6 0.9 3.2 1.9 4.6 L11 16 C12 17.3 14 17.3 15 16 L24.1 4.6 C25.1 3.2 24.4 1.6 22.6 1.6 Z"/>' +
  '<path class="dq-shade" d="M1.3 3.2 L24.7 3.2 C24.8 3.7 24.6 4.1 24.1 4.6 L15 16 C14 17.3 12 17.3 11 16 L1.9 4.6 C1.5 4.1 1.3 3.7 1.3 3.2 Z" opacity=".0"/>' +
  '<path class="dq-line" stroke-width="2.2" stroke-linejoin="round" d="M3.4 1.6 C1.6 1.6 0.9 3.2 1.9 4.6 L11 16 C12 17.3 14 17.3 15 16 L24.1 4.6 C25.1 3.2 24.4 1.6 22.6 1.6 Z"/>' +
  '</svg>';
const UP_SVG = '<svg viewBox="0 0 20 13" aria-hidden="true"><path class="dq-fill" d="M3 11.6 C1.4 11.6 .8 10.2 1.7 9 L8.6 1.6 C9.4 .8 10.6 .8 11.4 1.6 L18.3 9 C19.2 10.2 18.6 11.6 17 11.6 Z"/>' +
  '<path class="dq-line" stroke-width="1.8" stroke-linejoin="round" d="M3 11.6 C1.4 11.6 .8 10.2 1.7 9 L8.6 1.6 C9.4 .8 10.6 .8 11.4 1.6 L18.3 9 C19.2 10.2 18.6 11.6 17 11.6 Z"/></svg>';

// ── element helpers ─────────────────────────────────────────────────────────────────────────────────────────
/** h('div.dq-row', child|[children]|'text', {style, dataset...}) — a tiny element builder for window content. */
export function h(spec, children, attrs) {
  const [tag, ...cls] = String(spec || 'div').split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  append(el, children);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
      else el.setAttribute(k, v);
    }
  }
  return el;
}

function append(el, children) {
  if (children == null || children === false) return el;
  if (Array.isArray(children)) { for (const c of children) append(el, c); return el; }
  if (children instanceof Node) el.appendChild(children);
  else el.appendChild(document.createTextNode(String(children)));
  return el;
}

let seq = 0;

// ── Window ──────────────────────────────────────────────────────────────────────────────────────────────────
export class Window {
  constructor(opts = {}) {
    this.opts = { pop: 'scale', ...opts };
    this.kind = opts.kind || 'window';
    this.id = opts.id || `${this.kind}-${++seq}`;
    if (R.widgets.has(this.id)) { const old = R.widgets.get(this.id); try { old.destroy(); } catch (_) {} }
    this.state = 'closed';
    this.k = 0;
    this.focused = false;
    this.destroyed = false;
    this.interactive = !!(opts.interactive || opts.onInput);
    this.center = { x: false, y: false };
    this.el = document.createElement('div');
    this.el.className = 'dq-win' + (opts.slim ? ' dq-slim' : '') + (opts.className ? ' ' + opts.className : '');
    this.el.dataset.dq = this.id;
    if (this.interactive) this.el.classList.add('dq-interactive');
    this.titleEl = null;
    this.body = document.createElement('div');
    this.body.className = 'dq-body';
    this.el.appendChild(this.body);
    if (opts.title) this.setTitle(opts.title);
    if (opts.content != null) this.setContent(opts.content);
    this.place(opts);
    this._update = (dt, t) => this.update(dt, t);
    this._tween = null;
    this._btnWaiters = [];
    (opts.parentEl || layer()).appendChild(this.el);
    R.widgets.set(this.id, this);
    this.applyAnim(0);
  }

  get u() { return R.uPx; }

  place(p = {}) {
    const s = this.el.style;
    const alias = { x: 'left', y: 'top', w: 'width', h: 'height' };
    for (const [a, k] of Object.entries(alias)) if (p[a] != null && p[k] == null) p = { ...p, [k]: p[a] };
    for (const k of ['left', 'top', 'right', 'bottom', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight']) {
      if (p[k] != null) s[k] = U(p[k]);
    }
    if (p.centerX != null) this.center.x = !!p.centerX;
    if (p.centerY != null) this.center.y = !!p.centerY;
    if (this.center.x) s.left = '50%';
    if (this.center.y) s.top = '50%';
    if (p.origin) s.transformOrigin = p.origin;
    if (p.zIndex != null) s.zIndex = String(p.zIndex);
    this.applyAnim(this.k);
    return this;
  }

  setTitle(text) {
    if (text == null || text === '') { if (this.titleEl) { this.titleEl.remove(); this.titleEl = null; } this.el.classList.remove('dq-titled'); return this; }
    if (!this.titleEl) {
      this.titleEl = document.createElement('div');
      this.titleEl.className = 'dq-title' + (this.opts.titleAlign === 'center' ? ' dq-center' : '');
      this.el.appendChild(this.titleEl);
    }
    this.titleEl.textContent = String(text);
    this.el.classList.add('dq-titled');
    return this;
  }

  setContent(content) {
    this.body.textContent = '';
    if (content && typeof content === 'object' && !(content instanceof Node) && !Array.isArray(content) && 'html' in content) {
      this.body.innerHTML = String(content.html);
    } else append(this.body, content);
    return this;
  }

  applyAnim(k) {
    const st = this.el.style;
    const pop = R.reducedMotion ? 'none' : this.opts.pop;
    const inv = 1 - Math.min(1, k);
    let tr = '';
    if (this.center.x) tr += 'translateX(-50%) ';
    if (this.center.y) tr += 'translateY(-50%) ';
    let sx = 1, sy = 1;
    if (pop === 'scale') { sx = 0.9 + 0.1 * k; sy = 0.28 + 0.72 * k; }
    else if (pop === 'up' || pop === 'down' || pop === 'left' || pop === 'right') {
      const d = (inv * 30).toFixed(2);
      if (pop === 'up') tr += `translateY(calc(${d} * var(--u))) `;
      if (pop === 'down') tr += `translateY(calc(-${d} * var(--u))) `;
      if (pop === 'left') tr += `translateX(calc(${d} * var(--u))) `;
      if (pop === 'right') tr += `translateX(calc(-${d} * var(--u))) `;
      sx = 0.97 + 0.03 * k; sy = 0.9 + 0.1 * k;
    }
    tr += `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    st.transform = tr;
    st.opacity = pop === 'none' ? (k > 0 ? '1' : '0') : clamp01(k * 2.4).toFixed(3);
  }

  open(o = {}) {
    if (this.destroyed) return Promise.resolve(this);
    if (this.state === 'open') { if (this.interactive && o.focus !== false && this.opts.focus !== false) this.focus(); return Promise.resolve(this); }
    if (this.state === 'opening') return this._openP;
    if (this._tween) this._tween.cancel();
    this.state = 'opening';
    this.el.classList.add('dq-shown');
    R.updaters.add(this._update);
    R.openOrder = R.openOrder.filter(w => w !== this); R.openOrder.push(this);
    if (this.interactive && o.focus !== false && this.opts.focus !== false) this.focus();
    const dur = (o.instant || R.reducedMotion) ? 0 : (o.duration ?? this.opts.openMs ?? 150) / 1000;
    const from = this.k;
    try { this.onOpen && this.onOpen(); } catch (e) { reportError(`UI ${this.id} onOpen`, e); }
    this._tween = tween(dur, (e) => { this.k = from + (1 - from) * e; this.applyAnim(this.k); }, ease.outBack);
    this._openP = this._tween.then(() => {
      if (this.state === 'opening') { this.state = 'open'; this.k = 1; this.applyAnim(1); Bus.emit('ui.open', { id: this.id }); }
      return this;
    });
    return this._openP;
  }

  close(o = {}) {
    if (this.destroyed) return Promise.resolve(this);
    if (this.state === 'closed') { if (o.destroy ?? this.opts.destroyOnClose) this.destroy(); return Promise.resolve(this); }
    if (this.state === 'closing') return this._closeP;
    if (this._tween) this._tween.cancel();
    this.blur();
    this.state = 'closing';
    const dur = (o.instant || R.reducedMotion) ? 0 : (o.duration ?? this.opts.closeMs ?? 95) / 1000;
    const from = Math.min(1, this.k);
    this._tween = tween(dur, (e) => { this.k = from * (1 - e); this.applyAnim(this.k); }, ease.inQuad);
    this._closeP = this._tween.then(() => {
      if (this.state !== 'closing') return this;
      this.state = 'closed';
      this.k = 0;
      this.el.classList.remove('dq-shown');
      R.updaters.delete(this._update);
      R.openOrder = R.openOrder.filter(w => w !== this);
      try { this.onClose && this.onClose(); } catch (e) { reportError(`UI ${this.id} onClose`, e); }
      Bus.emit('ui.close', { id: this.id });
      if (o.destroy ?? this.opts.destroyOnClose) this.destroy();
      return this;
    });
    return this._closeP;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this._tween) this._tween.cancel();
    this.blur();
    R.updaters.delete(this._update);
    R.openOrder = R.openOrder.filter(w => w !== this);
    if (R.widgets.get(this.id) === this) R.widgets.delete(this.id);
    this.state = 'closed';
    try { this.el.remove(); } catch (_) {}
    for (const w of this._btnWaiters.splice(0)) w.res(null);
  }

  focus() {
    if (this.destroyed) return this;
    const i = R.focus.indexOf(this);
    if (i >= 0) R.focus.splice(i, 1);
    R.focus.push(this);
    refreshFocus();
    return this;
  }

  blur() {
    const i = R.focus.indexOf(this);
    if (i >= 0) { R.focus.splice(i, 1); refreshFocus(); }
    return this;
  }

  /** Plain windows: opts.onInput(btn, win), plus untilButton waiters. Modal by default. */
  handle(btn) {
    if (this._btnWaiters.length) {
      const hit = this._btnWaiters.filter(w => w.btns.includes(btn));
      if (hit.length) {
        this._btnWaiters = this._btnWaiters.filter(w => !hit.includes(w));
        sound(btn === 'cancel' ? 'cancel' : 'confirm');
        for (const w of hit) w.res(btn);
        return true;
      }
    }
    if (this.opts.onInput) { const r = this.opts.onInput(btn, this); return r !== false; }
    return this.opts.modal !== false;
  }

  untilButton(btns = ['confirm', 'cancel']) {
    this.interactive = true;
    this.el.classList.add('dq-interactive');
    if (this.state === 'closed' || this.state === 'closing') this.open(); else this.focus();
    return new Promise((res) => this._btnWaiters.push({ btns: [].concat(btns), res }));
  }

  update() {}

  rect() {
    try {
      const r = this.el.getBoundingClientRect(), L = layer().getBoundingClientRect(), u = R.uPx || 1;
      return { x: Math.round((r.left - L.left) / u), y: Math.round((r.top - L.top) / u), w: Math.round(r.width / u), h: Math.round(r.height / u) };
    } catch (_) { return null; }
  }

  describe() {
    return { id: this.id, kind: this.kind, title: this.titleEl ? this.titleEl.textContent : null, state: this.state,
      focused: this.focused, rect: this.rect() };
  }
}

// ── Menu ────────────────────────────────────────────────────────────────────────────────────────────────────
function normItem(it, index) {
  if (it == null) return { divider: true, index };
  if (typeof it === 'string') return it === '-' ? { divider: true, index } : { label: it, id: it.toLowerCase().replace(/[^a-z0-9]+/g, '_'), index };
  const o = { ...it, index };
  if (o.id == null && typeof o.label === 'string') o.id = o.label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return o;
}
const selectable = (it) => it && !it.divider && it.header == null && !it.hidden;

export class Menu extends Window {
  constructor(opts = {}) {
    super({ kind: 'menu', ...opts, content: null });
    this.interactive = true;
    this.el.classList.add('dq-interactive', 'dq-menu');
    this.columns = Math.max(1, opts.columns | 0 || 1);
    this.maxRows = Math.max(0, opts.maxRows | 0);
    this.wrap = opts.wrap !== false;
    this.index = -1;
    this.cursorPos = null;
    this.bobT = 0;
    this.pressT = 0;
    this.hold = null;
    this.scrollPx = 0;
    this.flashT = 0;
    this._waiters = [];
    if (opts.lineHeight) this.el.style.setProperty('--dq-line', String(opts.lineHeight));
    if (opts.fontSize) this.el.style.fontSize = U(opts.fontSize);

    this.viewport = h('div.dq-viewport');
    this.list = h('div.dq-list');
    this.list.style.gridTemplateColumns = opts.colWidths
      ? opts.colWidths.map(w => (typeof w === 'number' ? U(w) : w)).join(' ')
      : `repeat(${this.columns}, auto)`;
    if (opts.colGap != null) this.list.style.columnGap = U(opts.colGap);
    this.cursor = h('span.dq-cursor');
    this.cursor.innerHTML = CURSOR_SVG;
    this.moreUp = h('span.dq-more.dq-up'); this.moreUp.innerHTML = UP_SVG;
    this.moreDown = h('span.dq-more.dq-down'); this.moreDown.innerHTML = UP_SVG; this.moreDown.firstChild.style.transform = 'scaleY(-1)';
    this.viewport.appendChild(this.list);
    this.body.appendChild(this.viewport);
    this.body.appendChild(this.moreUp);
    this.body.appendChild(this.moreDown);
    if (this.maxRows) {
      this.viewport.classList.add('dq-scroll');
      this.viewport.style.height = `calc(${this.maxRows} * var(--dq-line, 43) * var(--u))`;
    }
    this.setItems(opts.items || [], opts.initial);
  }

  setItems(items, initial) {
    this.items = (items || []).map(normItem);
    this.list.textContent = '';
    this.list.appendChild(this.cursor);
    for (const it of this.items) {
      let el;
      if (it.divider) el = h('div.dq-divider');
      else if (it.header != null) el = h('div.dq-header', it.header);
      else {
        el = h('div.dq-item');
        const lab = h('span.dq-label-text');
        if (it.html != null) lab.innerHTML = String(it.html);
        else append(lab, it.label);
        el.appendChild(lab);
        if (it.note != null) el.appendChild(h('span.dq-note', it.note));
        if (it.right != null) el.appendChild(h('span.dq-right', it.right));
        if (it.disabled) el.classList.add('dq-disabled');
        if (it.color) el.classList.add(`dq-c-${it.color}`);
        el.addEventListener('pointerenter', () => { if (topFocus() === this && it.index !== this.index && selectable(it)) { this.setIndex(it.index); sound('cursor'); } });
        el.addEventListener('click', (ev) => { ev.stopPropagation(); if (topFocus() !== this || !selectable(it)) return; this.setIndex(it.index); this.confirm(); });
      }
      it.el = el;
      this.list.appendChild(el);
    }
    let idx = -1;
    if (typeof initial === 'number' && selectable(this.items[initial])) idx = initial;
    else if (initial != null) { const f = this.items.find(it => selectable(it) && it.id === initial); if (f) idx = f.index; }
    if (idx < 0) { const f = this.items.find(selectable); idx = f ? f.index : -1; }
    this.index = idx;
    this.cursorPos = null;
    this.scrollPx = 0;
    return this;
  }

  get item() { return this.items[this.index] || null; }

  setIndex(i, opts = {}) {
    if (!selectable(this.items[i])) return false;
    const changed = i !== this.index;
    this.index = i;
    if (opts.snap) this.cursorPos = null;
    if (changed) {
      try { this.opts.onChange && this.opts.onChange(this.items[i], this); } catch (e) { reportError(`UI ${this.id} onChange`, e); }
    }
    return changed;
  }

  handle(btn) {
    if (DIRS.has(btn)) { this.move(btn, true); return true; }
    if (btn === 'confirm') { this.confirm(); return true; }
    if (btn === 'cancel') { this.cancel(); return true; }
    return this.opts.modal !== false;
  }

  move(dir, fromInput = false) {
    const cur = this.items[this.index];
    const sel = this.items.filter(selectable);
    if (!sel.length) return false;
    if (!cur) { this.setIndex(sel[0].index, { snap: true }); return true; }
    const P = (it) => ({ x: it.el.offsetLeft, y: it.el.offsetTop, h: it.el.offsetHeight || 1 });
    const c = P(cur);
    const tol = Math.max(3, c.h * 0.45);
    const others = sel.filter(it => it !== cur).map(it => ({ it, p: P(it) }));
    let pick = null;
    if (dir === 'up' || dir === 'down') {
      const sign = dir === 'down' ? 1 : -1;
      const sameCol = others.filter(o => Math.abs(o.p.x - c.x) < 6);
      const pool = sameCol.length ? sameCol : others;
      const ahead = pool.filter(o => sign * (o.p.y - c.y) > tol);
      if (ahead.length) {
        ahead.sort((a, b) => (Math.abs(a.p.y - c.y) - Math.abs(b.p.y - c.y)) || (Math.abs(a.p.x - c.x) - Math.abs(b.p.x - c.x)));
        pick = ahead[0].it;
      } else if (this.wrap && pool.length) {
        const sorted = pool.slice().sort((a, b) => (sign * (a.p.y - b.p.y)) || (Math.abs(a.p.x - c.x) - Math.abs(b.p.x - c.x)));
        if (sign * (sorted[0].p.y - c.y) < -tol || sameCol.length) pick = sorted[0].it;
      }
    } else {
      const sign = dir === 'right' ? 1 : -1;
      const sameRow = others.filter(o => Math.abs(o.p.y - c.y) <= tol);
      const ahead = sameRow.filter(o => sign * (o.p.x - c.x) > 4);
      if (ahead.length) { ahead.sort((a, b) => Math.abs(a.p.x - c.x) - Math.abs(b.p.x - c.x)); pick = ahead[0].it; }
      else if (this.wrap && sameRow.length) { sameRow.sort((a, b) => sign * (a.p.x - b.p.x)); pick = sameRow[0].it; }
    }
    if (fromInput) this.hold = { dir, t: 0, next: REPEAT_DELAY };
    if (!pick || pick === cur) return false;
    this.setIndex(pick.index);
    sound('cursor');
    return true;
  }

  confirm() {
    const it = this.items[this.index];
    if (!it || this.state === 'closing' || this.state === 'closed') return;
    if (it.disabled) {
      sound('buzzer');
      try { this.opts.onDisabled && this.opts.onDisabled(it, this); } catch (e) { reportError(`UI ${this.id} onDisabled`, e); }
      return;
    }
    sound(it.sound || this.opts.confirmSound || 'confirm');
    this.pressT = 0.13;
    this.flashT = 0.11;
    it.el.classList.add('dq-flash');
    Bus.emit('ui.select', { id: this.id, item: it.id });
    try { this.opts.onSelect && this.opts.onSelect(it, this); } catch (e) { reportError(`UI ${this.id} onSelect`, e); }
    if (this.opts.closeOnSelect) this.close();
    for (const res of this._waiters.splice(0)) res(it);
  }

  cancel() {
    if (this.state === 'closing' || this.state === 'closed') return;
    if (this.opts.cancel === false) return;
    sound('cancel');
    Bus.emit('ui.cancel', { id: this.id });
    try { this.opts.onCancel && this.opts.onCancel(this); } catch (e) { reportError(`UI ${this.id} onCancel`, e); }
    const v = this.opts.cancelValue !== undefined ? this.opts.cancelValue : null;
    if (this.opts.closeOnCancel !== false) this.close();
    for (const res of this._waiters.splice(0)) res(v);
  }

  /** Open (if needed), take focus, resolve with the next selected item or the cancel value. */
  choose(o = {}) {
    if (this.destroyed) return Promise.resolve(null);
    if (o.initial != null) {
      const f = typeof o.initial === 'number' ? this.items[o.initial] : this.items.find(it => it.id === o.initial);
      if (selectable(f)) this.setIndex(f.index, { snap: true });
    }
    if (this.state === 'closed' || this.state === 'closing') this.open(o); else this.focus();
    return new Promise((res) => this._waiters.push(res));
  }

  destroy() {
    for (const res of this._waiters.splice(0)) res(null);
    super.destroy();
  }

  onFocus(f) {
    if (f) { this.bobT = 0; this.cursorPos = this.cursorPos || null; }
    this.cursor.classList.toggle('dq-idle', !f);
  }

  update(dt) {
    const it = this.items[this.index];
    if (!it || !it.el || !it.el.isConnected) { this.cursor.classList.add('dq-hidden'); return; }
    this.cursor.classList.remove('dq-hidden');
    const u = R.uPx || 1;
    const itemTop = it.el.offsetTop, itemH = it.el.offsetHeight;
    // scrolling
    if (this.maxRows) {
      const vpH = this.viewport.clientHeight || itemH * this.maxRows;
      let target = this.scrollPx;
      if (itemTop - target < 0) target = itemTop;
      if (itemTop + itemH - target > vpH) target = itemTop + itemH - vpH;
      const maxScroll = Math.max(0, this.list.scrollHeight - vpH);
      target = Math.max(0, Math.min(maxScroll, target));
      if (this.scrollPx === 0 && this.cursorPos === null) this.scrollPx = target;
      else this.scrollPx += (target - this.scrollPx) * (1 - Math.exp(-dt * 30));
      if (Math.abs(target - this.scrollPx) < 0.5) this.scrollPx = target;
      this.list.style.transform = `translateY(${(-this.scrollPx).toFixed(2)}px)`;
      this.moreUp.classList.toggle('dq-on', this.scrollPx > 1);
      this.moreDown.classList.toggle('dq-on', this.scrollPx < maxScroll - 1);
    }
    const cw = this.cursor.offsetWidth || 24 * u, ch = this.cursor.offsetHeight || 28 * u;
    const tx = it.el.offsetLeft + 3 * u;
    const ty = itemTop + (itemH - ch) / 2 + 1 * u;
    if (!this.cursorPos) this.cursorPos = { x: tx, y: ty };
    else {
      const a = 1 - Math.exp(-dt * 40);
      this.cursorPos.x += (tx - this.cursorPos.x) * a;
      this.cursorPos.y += (ty - this.cursorPos.y) * a;
      if (Math.abs(tx - this.cursorPos.x) < 0.35) this.cursorPos.x = tx;
      if (Math.abs(ty - this.cursorPos.y) < 0.35) this.cursorPos.y = ty;
    }
    // the bob: a quick nudge right and back, ~1.7 times a second, only while focused
    let bx = 0;
    if (this.focused && !R.reducedMotion) {
      this.bobT += dt;
      const ph = (this.bobT * 1.7) % 1;
      bx = (ph < 0.5 ? ease.outCubic(ph * 2) : 1 - ease.inQuad((ph - 0.5) * 2)) * 4.2 * u;
    }
    let sc = 1;
    if (this.pressT > 0) { this.pressT -= dt; sc = 0.82 + 0.18 * (1 - Math.max(0, this.pressT) / 0.13); }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) for (const x of this.items) x.el && x.el.classList.remove('dq-flash'); }
    const nx = (this.cursorPos.x + bx).toFixed(2), ny = this.cursorPos.y.toFixed(2);
    const t = `translate(${nx}px, ${ny}px) scale(${sc.toFixed(3)})`;
    if (t !== this._lastT) { this.cursor.style.transform = t; this._lastT = t; }
    void cw;
    // held-button repeat (only while the button is physically held)
    if (this.hold && this.focused) {
      if (!isHeld(this.hold.dir)) this.hold = null;
      else {
        this.hold.t += dt;
        if (this.hold.t >= this.hold.next) { this.hold.next += REPEAT_RATE; this.move(this.hold.dir, false); }
      }
    }
  }

  onResize() { this.cursorPos = null; }

  describe() {
    const d = super.describe();
    const it = this.items[this.index];
    d.items = this.items.filter(selectable).map(x => (typeof x.label === 'string' ? x.label : x.id));
    d.index = this.index;
    d.selected = it ? (it.id ?? it.label) : null;
    d.selectedLabel = it && typeof it.label === 'string' ? it.label : null;
    d.columns = this.columns;
    if (this.maxRows) d.scroll = Math.round(this.scrollPx / (R.uPx || 1));
    return d;
  }
}

// ── state ───────────────────────────────────────────────────────────────────────────────────────────────────
function describe() {
  const windows = [];
  for (const w of R.widgets.values()) {
    if (w.state === 'closed') continue;
    try { windows.push(w.describe()); } catch (e) { windows.push({ id: w.id, error: String(e && e.message || e) }); }
  }
  const top = topFocus();
  let text = null;
  for (let i = R.openOrder.length - 1; i >= 0; i--) {
    const w = R.openOrder[i];
    if (w.kind === 'message' && w.state !== 'closed' && typeof w.describeText === 'function') { text = w.describeText(); break; }
  }
  return {
    unit: +R.uPx.toFixed(4), scale: R.scale, time: +R.time.toFixed(3),
    windows, focus: top ? top.id : null, focusStack: R.focus.map(w => w.id),
    text,
    input: { source: R.ext.live ? 'input.js' : (R.kb.mode === 'off' ? 'scenes-only' : 'raw-keyboard'), last: R.lastInput,
      count: R.inputCount, held: Array.from(R.kb.held) },
    sounds: { count: R.soundCount, last: R.soundLog.slice(-8), muted: !R.sound },
    animating: R.tweens.size,
  };
}

// ── facade ──────────────────────────────────────────────────────────────────────────────────────────────────
export const UI = {
  DESIGN,
  BUTTONS,
  Window,
  Menu,
  h,
  get time() { return R.time; },
  get unit() { return R.uPx; },
  get layer() { return layer(); },
  get focused() { return topFocus(); },

  window(opts) { return new Window(opts); },
  menu(opts) { return new Menu(opts); },

  /** Yes / No prompt. Resolves true for Yes, false for No or cancel. */
  yesNo(opts = {}) {
    const m = new Menu({
      id: opts.id || 'yesno', right: 'calc(50% - 515 * var(--u))', bottom: 234, slim: true, origin: '100% 100%', minWidth: 160,
      destroyOnClose: true, closeOnSelect: true, cancelValue: null, ...opts,
      items: [{ id: 'yes', label: opts.yes || 'Yes' }, { id: 'no', label: opts.no || 'No' }],
      initial: opts.initial || 'yes',
    });
    return m.choose().then((it) => !!(it && it.id === 'yes'));
  },

  input,
  get: (id) => R.widgets.get(id) || null,
  all: () => Array.from(R.widgets.values()),
  closeAll(o = {}) { return Promise.all(Array.from(R.widgets.values()).map(w => w.close(o))); },
  destroyAll() { for (const w of Array.from(R.widgets.values())) w.destroy(); },

  sound,
  setSound(fn) { R.sound = typeof fn === 'function' ? fn : null; },
  defaultSound,

  setTheme(vars = {}) {
    try {
      const root = document.documentElement;
      for (const [k, v] of Object.entries(vars)) {
        const name = k.startsWith('--') ? k : '--dq-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
        root.style.setProperty(name, String(v));
      }
      Font.refresh();
    } catch (e) { reportError('UI.setTheme', e); }
  },
  setScale(n) {
    const v = Number(n);
    R.scale = Number.isFinite(v) && v > 0.3 ? Math.min(v, 3) : 1;
    layer(); if (R.fit) R.fit();
    return R.scale;
  },

  keyboard(mode) {
    if (mode === undefined) return R.kb.mode;
    if (['auto', 'raw', 'off'].includes(mode)) R.kb.mode = mode;
    R.ext.at = -1e9;
    layer();
    return R.kb.mode;
  },
  isHeld,

  wait,
  tween,
  ease,
  onUpdate(fn) { if (typeof fn !== 'function') return () => {}; layer(); R.updaters.add(fn); return () => R.updaters.delete(fn); },
  install() { layer(); return UI; },
  describe,

  // content helpers
  row(left, right, cls = '') { return h(`div.dq-row${cls ? '.' + cls : ''}`, [h('span.dq-grow', left), h('span.dq-num', right)]); },
  divider() { return h('div.dq-divider'); },
  vdiv() { return h('span.dq-vdiv'); },
  cols(columns) {
    const out = [];
    columns.forEach((c, i) => { if (i) out.push(h('span.dq-vdiv')); out.push(h('div.dq-col', c)); });
    return h('div.dq-cols', out);
  },
  label(text) { return h('span.dq-label', text); },
};

export default UI;
