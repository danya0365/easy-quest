/**
 * access.js — Accessibility & kid-mode.                                              (P33, owner: src/ui/access.js)
 *
 * Wave-2 breadth: one place that answers "can a six-year-old keep playing?" without a critic digging through
 * menu settings. Bigger words, gentler battle speed, and a kid-mode flag that later systems may honour.
 *
 *   Access.install(ctx)
 *   Access.describe() -> { kidMode, scale, speed, colourSafe, hints }
 *   Access.set({ kidMode?, scale?, speed?, colourSafe? })
 *   __DQ.state().access / __DQ.access(...)
 */
import { Debug, reportError } from '../engine/debug.js';
import { Bus } from '../engine/events.js';
import { Menu } from './menu.js';
import { UI } from './window.js';
import { Text } from './text.js';
import { Input } from '../engine/input.js';

const KEY = 'dqv.access';
const S = {
  installed: false,
  kidMode: false,
  scale: 1,                 // word scale (mirrors menu SETTINGS.scale when both live)
  speed: 35,                // message chars/sec — lower = easier to read
  colourSafe: false,        // reserved: later colourblind-safe status colours
  hints: true,              // ribbon / quest hints stay on
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(S, JSON.parse(raw) || {});
  } catch (_) {}
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      kidMode: !!S.kidMode, scale: S.scale, speed: S.speed, colourSafe: !!S.colourSafe, hints: !!S.hints,
    }));
  } catch (_) {}
}

function apply() {
  // Kid-mode floors scale / caps speed; explicit set() still wins when kidMode is off.
  const scale = S.kidMode ? Math.max(S.scale, 1.12) : S.scale;
  const speed = S.kidMode ? Math.min(S.speed, 28) : S.speed;
  S.scale = scale;
  S.speed = speed;
  try {
    if (Menu && typeof Menu.setOption === 'function') {
      Menu.setOption('scale', scale);
      Menu.setOption('speed', speed);
    } else {
      if (UI && UI.setScale) UI.setScale(scale);
      if (Text && Text.setSpeed) Text.setSpeed(speed);
    }
  } catch (e) { reportError('access apply menu', e); }
  // Kid-mode: slower menu cursor repeat so a six-year-old does not fly past the thing they meant.
  try {
    if (Input && typeof Input.setRepeat === 'function') {
      if (S.kidMode) Input.setRepeat({ delay: 280, interval: 140 });
      else Input.setRepeat({ delay: 220, interval: 90 });
    }
  } catch (e) { reportError('access apply repeat', e); }
  try {
    document.documentElement.dataset.kidMode = S.kidMode ? '1' : '0';
    document.documentElement.dataset.colourSafe = S.colourSafe ? '1' : '0';
    // Colour-safe: nudge status CSS vars toward blue/amber (avoid red/green-only tells).
    const root = document.documentElement;
    if (S.colourSafe) {
      root.style.setProperty('--dq-hp-ok', '#5b8fd9');
      root.style.setProperty('--dq-hp-warn', '#e0a84a');
      root.style.setProperty('--dq-mp', '#7a9fd4');
    } else {
      root.style.removeProperty('--dq-hp-ok');
      root.style.removeProperty('--dq-hp-warn');
      root.style.removeProperty('--dq-mp');
    }
  } catch (_) {}
  try { Bus.emit('access.change', Access.describe()); } catch (_) {}
}

export const Access = {
  describe() {
    return {
      kidMode: !!S.kidMode,
      scale: +S.scale || 1,
      speed: +S.speed || 35,
      colourSafe: !!S.colourSafe,
      hints: S.hints !== false,
    };
  },
  set(o = {}) {
    if (o.kidMode != null) S.kidMode = !!o.kidMode;
    if (o.scale != null) S.scale = Math.max(1, Math.min(1.4, +o.scale || 1));
    if (o.speed != null) S.speed = Math.max(18, Math.min(60, +o.speed || 35));
    if (o.colourSafe != null) S.colourSafe = !!o.colourSafe;
    if (o.hints != null) S.hints = !!o.hints;
    save(); apply();
    return Access.describe();
  },
  install(ctx = {}) {
    if (S.installed) return Access;
    S.installed = true;
    load(); apply();
    const D = ctx.Debug || Debug;
    D.provide('access', () => Access.describe());
    D.expose('access', (o) => (o === undefined ? Access.describe() : Access.set(o)));
    return Access;
  },
};

export function install(ctx) { return Access.install(ctx); }
export default Access;
