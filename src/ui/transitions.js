/**
 * transitions.js — wipes, fades, the battle swirl, flashes, vignette, the boot fade-in.
 *                                                                              (P29, owner: src/ui/transitions.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx) FIRST (before the other plugins), so it is live in
 * the real game with no shared-file edit. Everything is one absolutely-positioned overlay inside #ui-root, drawn
 * ABOVE the windows (z-index 40) and never taking pointer events.
 *
 * WHAT IT GIVES THE REST OF THE GAME
 *   import { Transitions } from '../ui/transitions.js';
 *   await Transitions.swirl()                 the DQ encounter spiral: resolves when the screen is COVERED, so the
 *                                             caller pushes the battle scene behind it and then calls clear()
 *   await Transitions.clear({ms})             uncover (the swirl unwinds / the fade lifts)
 *   await Transitions.cover(fn, {kind})       fade out -> await fn() -> fade in   (doors, stairs, the church)
 *   Transitions.flash({ms, color, alpha})     one-frame white slam (a crit, a spell landing)
 *   await Transitions.white(true|false, {ms}) the gentle defeat: a slow fade to WHITE, never black
 *   await Transitions.iris(false|true, {ms})  a round iris in / out (arriving somewhere that matters)
 *   Transitions.busy                          true while anything is mid-flight
 *
 * Every beat is driven by the engine clock (UI.onUpdate, which the fixed-step Loop pumps), so __DQ.freeze holds a
 * wipe still and __DQ.advance(ms) steps it — a screenshot is never taken halfway through a fade by accident:
 * Debug.busy('transition') holds __DQ.screenshotReady() false, and Input.block('transition') means a button held
 * down through a wipe has to be pressed again afterwards.
 *
 * Field exits (P23's map `exits`) run through Field.setTransition: door = a quick dark fade with a *click*, stairs =
 * a slower fade, edge = a soft sky-coloured wipe. The boot gets a fade up from the sky colour over the first frame.
 */
import { Bus } from '../engine/events.js';
import { Debug, reportError } from '../engine/debug.js';
import { UI } from './window.js';

const CSS = `
.dqfx{position:absolute;inset:0;z-index:40;pointer-events:none;overflow:hidden;contain:strict}
.dqfx > *{position:absolute;pointer-events:none;will-change:opacity,transform}
.dqfx .sheet{inset:0;opacity:0}
.dqfx .ink{background:var(--pal-ui-shadow,#050a20)}
.dqfx .white{background:var(--pal-ui-text,#fff)}
.dqfx .sky{background:var(--pal-sky-page,#9cc7e6)}
.dqfx .flash{background:var(--pal-ui-text,#fff);mix-blend-mode:screen}
/* the encounter swirl: DQ's spiral of window-blue and pale border, spun and blown up until it fills the frame */
.dqfx .swirl{inset:-60%;opacity:0;background:
  repeating-conic-gradient(from 0deg,
    var(--pal-ui-win-top,#2c4fb8) 0deg 9deg,
    var(--pal-ui-border,#f4f1ea) 9deg 16deg,
    var(--pal-ui-win-bottom,#132a78) 16deg 25deg,
    var(--pal-ui-border,#f4f1ea) 25deg 30deg)}
.dqfx .swirl.b{background:
  repeating-conic-gradient(from 12deg,
    transparent 0deg 14deg,
    var(--pal-ui-text,#fff) 14deg 20deg,
    transparent 20deg 34deg);opacity:0}
/* the iris: a hole in an ink sheet, closing on the middle of the frame */
.dqfx .iris{inset:-2px;opacity:0;background:radial-gradient(circle at 50% 50%,
  transparent calc(var(--r) * 1%), var(--pal-ui-shadow,#050a20) calc(var(--r) * 1% + 2px))}
.dqfx .vig{inset:0;opacity:0;background:radial-gradient(ellipse at 50% 46%,
  transparent 46%, var(--pal-ui-shadow,#050a20) 128%)}
`;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = {
  out: (t) => 1 - (1 - t) * (1 - t),
  in: (t) => t * t,
  inout: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
};

const R = {
  layer: null, sheets: {}, styled: false, off: null,
  anims: new Set(), token: 0, busy: 0, blocked: false,
  swirl: 0, cover: null, last: null, count: 0,
  ctx: null, snapshot: { swirl: 0, ink: 0, sky: 0, white: 0, iris: 0, flash: 0, vignette: 0 },
};
const BLANK = () => ({ swirl: 0, ink: 0, sky: 0, white: 0, iris: 0, flash: 0, vignette: 0 });

/** Build (once) the overlay layer and every sheet in it. Never throws: a page with no DOM just gets no wipes. */
function ensure() {
  if (R.layer && R.layer.isConnected) return R.layer;
  try {
    if (!R.styled) {
      const st = document.createElement('style');
      st.id = 'dq-transitions-css';
      st.textContent = CSS;
      document.head.appendChild(st);
      R.styled = true;
    }
    UI.install();                                    // makes sure #ui-root and .dq-ui exist (and --u is set)
    let host = document.getElementById('ui-root');
    if (!host) { host = document.createElement('div'); host.id = 'ui-root'; host.style.cssText = 'position:absolute;inset:0;pointer-events:none'; document.body.appendChild(host); }
    const el = document.createElement('div');
    el.className = 'dqfx';
    el.innerHTML = `<div class="sheet sky"></div><div class="sheet ink"></div><div class="sheet white"></div>
      <div class="swirl"></div><div class="swirl b"></div><div class="iris" style="--r:75"></div>
      <div class="sheet vig"></div><div class="sheet flash"></div>`;
    host.appendChild(el);
    R.layer = el;
    const [sky, ink, white, swirl, swirlB, iris, vig, flash] = el.children;
    R.sheets = { sky, ink, white, swirl, swirlB, iris, vig, flash };
    if (!R.off) R.off = UI.onUpdate(tick);
  } catch (e) { reportError('transitions: overlay', e); }
  return R.layer;
}

function setBusy(on) {
  R.busy += on ? 1 : -1;
  if (R.busy < 0) R.busy = 0;
  try { Debug.busy('transition', R.busy > 0); } catch (_) { /* no debug yet */ }
  const want = R.busy > 0;
  if (want !== R.blocked) {
    R.blocked = want;
    try { if (R.ctx && R.ctx.Input) R.ctx.Input.block('transition', want); } catch (e) { reportError('transitions: input block', e); }
  }
}

/** One animation: t seconds long, step(k) each frame with k = 0..1 eased, then resolve. */
function animate(seconds, step, easing = ease.inout) {
  ensure();
  const ms = Math.max(0, Number(seconds) || 0);
  return new Promise((resolve) => {
    if (!R.layer) { try { step(1); } catch (_) {} resolve(false); return; }
    const a = { t: 0, dur: ms, step, easing, resolve, done: false };
    R.anims.add(a);
    setBusy(true);
    try { step(easing(0)); } catch (e) { reportError('transitions: step', e); }
    if (ms <= 0) finish(a, true);
  });
}

function finish(a, ok) {
  if (a.done) return;
  a.done = true;
  R.anims.delete(a);
  try { a.step(1); } catch (e) { reportError('transitions: step', e); }
  setBusy(false);
  a.resolve(ok !== false);
}

function tick(dt) {
  if (!R.anims.size) return;
  for (const a of Array.from(R.anims)) {
    a.t += dt;
    const k = a.dur > 0 ? clamp01(a.t / a.dur) : 1;
    if (k >= 1) { finish(a, true); continue; }
    try { a.step(a.easing(k)); } catch (e) { reportError('transitions: step', e); finish(a, false); }
  }
}

const sheet = (name) => (ensure() ? R.sheets[name] : null);
const SNAP_KEY = { vig: 'vignette' };
function opacity(name, v) {
  const el = sheet(name);
  R.snapshot[SNAP_KEY[name] || name] = Math.round(clamp01(v) * 100) / 100;
  if (el) el.style.opacity = String(clamp01(v));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the beats
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const COLOUR = { black: 'ink', ink: 'ink', white: 'white', sky: 'sky' };
const KIND = {
  door: { out: 0.24, in: 0.3, colour: 'ink', sfx: 'door_open' },
  stairs: { out: 0.34, in: 0.42, colour: 'ink', sfx: 'stairs' },
  edge: { out: 0.4, in: 0.5, colour: 'sky', sfx: null },
  church: { out: 0.7, in: 0.9, colour: 'white', sfx: null },
  default: { out: 0.3, in: 0.36, colour: 'ink', sfx: null },
};

export const Transitions = {
  get busy() { return R.busy > 0; },
  get ready() { return !!(R.layer && R.layer.isConnected); },

  /** Fade the screen out to a colour. Resolves when it is fully covered. */
  fadeOut({ ms = 300, colour = 'ink', color } = {}) {
    const name = COLOUR[color || colour] || 'ink';
    R.cover = name;
    return animate(ms / 1000, (k) => opacity(name, k), ease.out);
  },
  /** Lift whatever is covering the screen. */
  fadeIn({ ms = 360, colour, color } = {}) {
    const name = COLOUR[color || colour] || R.cover || 'ink';
    return animate(ms / 1000, (k) => opacity(name, 1 - k), ease.in).then((v) => { R.cover = null; return v; });
  },

  /**
   * The DQ encounter swirl (SYSTEMS §7.1: 520 ms). Resolves at the moment the screen is fully covered — the caller
   * pushes the battle scene then and calls clear(), so a child never sees the field blink out.
   */
  swirl({ ms = 520, stinger = true } = {}) {
    ensure();
    R.count++;
    if (stinger) sting('battle_start');
    const a = R.sheets.swirl, b = R.sheets.swirlB;
    const cover = ms * 0.62 / 1000;
    R.swirl = 1;
    const spin = (k) => {
      const turn = 520 * ease.in(k);
      const scale = 0.18 + 2.4 * ease.out(k);
      if (a) { a.style.opacity = String(clamp01(k * 2.2)); a.style.transform = `rotate(${turn}deg) scale(${scale})`; }
      if (b) { b.style.opacity = String(clamp01(k * 1.6) * 0.55); b.style.transform = `rotate(${-turn * 0.7}deg) scale(${scale * 1.25})`; }
      R.snapshot.swirl = Math.round(k * 100) / 100;
    };
    return animate(cover, spin, (t) => t).then(() => {
      // hold the spiral solid while the battle stage builds behind it
      if (a) a.style.opacity = '1';
      return true;
    });
  },

  /** Unwind the swirl / lift the fade. */
  clear({ ms = 320 } = {}) {
    ensure();
    const a = R.sheets.swirl, b = R.sheets.swirlB;
    const wasSwirl = R.swirl > 0;
    const wasCover = R.cover;
    R.swirl = 0;
    return animate(ms / 1000, (k) => {
      if (wasSwirl) {
        const turn = 520 + 300 * k, scale = 2.6 + 1.6 * k;
        if (a) { a.style.opacity = String(clamp01(1 - k * 1.25)); a.style.transform = `rotate(${turn}deg) scale(${scale})`; }
        if (b) { b.style.opacity = String(clamp01(0.55 - k)); b.style.transform = `rotate(${-turn * 0.7}deg) scale(${scale * 1.2})`; }
        R.snapshot.swirl = Math.round((1 - k) * 100) / 100;
      }
      if (wasCover) opacity(wasCover, 1 - k);
    }, ease.in).then((v) => {
      if (a) { a.style.opacity = '0'; a.style.transform = 'none'; }
      if (b) { b.style.opacity = '0'; b.style.transform = 'none'; }
      R.cover = null;
      return v;
    });
  },

  /** fade out -> run fn (which may return a promise) -> fade in. The one every door and stairway uses. */
  async cover(fn, { kind = 'default', out, in: inMs, colour } = {}) {
    const K = KIND[kind] || KIND.default;
    R.last = kind;
    await Transitions.fadeOut({ ms: out ?? K.out * 1000, colour: colour || K.colour });
    if (K.sfx) play(K.sfx);
    try { if (typeof fn === 'function') await fn(); }
    catch (e) { reportError('transitions: cover body', e); }
    await Transitions.fadeIn({ ms: inMs ?? K.in * 1000, colour: colour || K.colour });
    return true;
  },

  /** A hit landing: one hard white frame that falls away. Not awaited — it never blocks a beat. */
  flash({ ms = 130, alpha = 0.55 } = {}) {
    ensure();
    const el = R.sheets.flash;
    if (!el) return Promise.resolve(false);
    return animate(ms / 1000, (k) => { el.style.opacity = String(alpha * (1 - k)); R.snapshot.flash = Math.round(alpha * (1 - k) * 100) / 100; }, ease.in);
  },

  /** SYSTEMS §6.2 — the gentle defeat fades to WHITE, never black. */
  white(on = true, { ms = 1100, alpha = 0.86 } = {}) {
    R.cover = on ? 'white' : R.cover;
    return animate(ms / 1000, (k) => opacity('white', on ? alpha * k : alpha * (1 - k)), ease.inout)
      .then((v) => { if (!on) R.cover = null; return v; });
  },

  /** A round iris. iris(false) closes it down to nothing, iris(true) opens it back up. */
  iris(open = false, { ms = 520 } = {}) {
    ensure();
    const el = R.sheets.iris;
    if (!el) return Promise.resolve(false);
    el.style.opacity = '1';
    return animate(ms / 1000, (k) => {
      const r = open ? 2 + 90 * ease.out(k) : 92 - 92 * ease.in(k);
      el.style.setProperty('--r', r.toFixed(1));
      R.snapshot.iris = Math.round((100 - r)) / 100;
      if (open && k >= 1) el.style.opacity = '0';
    }, (t) => t);
  },

  /** A soft dark vignette for a tense moment (a boss door, a telegraph). */
  vignette(v = 0.5, { ms = 400 } = {}) {
    const from = Number(R.snapshot.vignette) || 0;
    return animate(ms / 1000, (k) => opacity('vig', from + (clamp01(v) - from) * k), ease.inout);
  },

  /** Everything off, at once (a scene tearing down mid-wipe). */
  reset() {
    for (const a of Array.from(R.anims)) finish(a, false);
    for (const name of ['sky', 'ink', 'white', 'flash', 'vig']) opacity(name, 0);
    if (R.sheets.swirl) { R.sheets.swirl.style.opacity = '0'; R.sheets.swirl.style.transform = 'none'; }
    if (R.sheets.swirlB) { R.sheets.swirlB.style.opacity = '0'; R.sheets.swirlB.style.transform = 'none'; }
    if (R.sheets.iris) R.sheets.iris.style.opacity = '0';
    R.cover = null; R.swirl = 0;
    R.snapshot = BLANK();
    return true;
  },

  state() {
    return { ready: Transitions.ready, busy: R.busy > 0, running: R.anims.size, wipes: R.count,
      last: R.last, covering: R.cover, ...R.snapshot };
  },
};

// ── sound (through the ctx the plugin was installed with; silent in a bare page) ─────────────────────────────
function play(id, opts) {
  try { if (R.ctx && R.ctx.Sfx && R.ctx.Audio && R.ctx.Audio.ready) R.ctx.Sfx.play(id, opts); }
  catch (e) { reportError('transitions: sfx', e); }
}
function sting(id) {
  try {
    if (!R.ctx || typeof R.ctx.Music !== 'function') return;
    const p = R.ctx.Music();
    if (p && typeof p.then === 'function') p.then((M) => { try { if (M) M.stinger(id); } catch (e) { reportError('transitions: stinger', e); } }).catch(() => {});
  } catch (e) { reportError('transitions: music', e); }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the plugin
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function install(ctx = {}) {
  R.ctx = ctx;
  ensure();

  // Every exit to a built map: fade out, build the new map, fade in. The map kind picks the wipe.
  if (ctx.Field && typeof ctx.Field.setTransition === 'function') {
    ctx.Field.setTransition((info, swap) => Transitions.cover(swap, { kind: (info && info.kind) || 'default' }));
  }

  // The first frame takes about a second to build; come up out of the sky colour instead of blinking on.
  if (ctx.Bus) {
    ctx.Bus.on('app.booted', () => {
      try {
        opacity('sky', 1);
        R.cover = 'sky';
        Transitions.fadeIn({ ms: 700, colour: 'sky' });
      } catch (e) { reportError('transitions: boot fade', e); }
    });
    // The battle scene (P14/P15) drives its own swirl so it can push the scene behind it; these are the fallbacks
    // for anything else that announces a fight (a story script, a critic calling Bus.emit).
    ctx.Bus.on('battle.swirl', (o) => Transitions.swirl(o || {}));
    ctx.Bus.on('battle.clear', (o) => Transitions.clear(o || {}));
  }

  if (ctx.Debug) {
    ctx.Debug.provide('transitions', () => Transitions.state());
    /** __DQ.wipe('swirl'|'fade'|'flash'|'white'|'iris'|'clear'|'reset') — one wipe, for a critic. */
    ctx.Debug.expose('wipe', (what = 'swirl', opts = {}) => {
      switch (String(what)) {
        case 'swirl': return Transitions.swirl(opts).then(() => Transitions.clear());
        case 'fade': return Transitions.cover(() => {}, opts);
        case 'flash': return Transitions.flash(opts);
        case 'white': return opts.hold ? Transitions.white(true, opts)
          : opts.off ? Transitions.white(false, opts)
            : Transitions.white(true, opts).then(() => Transitions.white(false, opts));
        case 'iris': return opts.hold ? Transitions.iris(!!opts.open, opts)
          : opts.open ? Transitions.iris(true, opts)
            : Transitions.iris(false, opts).then(() => Transitions.iris(true, opts));
        case 'clear': return Transitions.clear(opts);
        case 'reset': return Transitions.reset();
        default: return { ok: false, reason: `unknown wipe "${what}"`, wipes: ['swirl', 'fade', 'flash', 'white', 'iris', 'clear', 'reset'] };
      }
    });
  }
  return Transitions;
}

export default install;
