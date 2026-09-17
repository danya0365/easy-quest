/**
 * palette.js — every named colour in the game.                                     (F3, owner: src/art/palette.js)
 *
 * THE RULE: this is the only file in the codebase that may contain a colour hex. Everything else reads `PAL`.
 * Values are sRGB hex exactly as tuned by eye in demos/_proto-render.html (docs/ART-DIRECTION.md §7), plus the
 * families the art foundation added for the rest of the game (sand, snow, brick, bark, extra cloth, time-of-day,
 * UI). Under NoToneMapping the hex you pick is the colour you get in lit areas, so pick it here and nowhere else.
 *
 *   import { PAL, C3, hex, css, mixHex, rgb } from '../art/palette.js';
 *
 *   PAL.grass.mid                 '#62a04a'
 *   hex('grass.mid')              same, by dotted path (throws nothing: unknown paths return PAL.debug.missing)
 *   C3(PAL.grass.mid) / C3('grass.mid')   -> THREE.Color (sRGB hex -> linear working colour, ColorManagement on)
 *   css(hex, alpha)               'rgba(r,g,b,a)' for canvas / DOM
 *   mixHex(a, b, t)               '#rrggbb' (never rgb() strings: re-mixing those gave NaN black, see ART-DIRECTION §2)
 *   rgb(hex)                      [r, g, b] 0..255        linRgb(hex) -> [r, g, b] linear 0..1
 *   scaleHex(hex, k)              multiply brightness (k < 1 darker), clamped
 *   applyCssVars(el?)             sets --pal-<family>-<name> custom properties so CSS never hardcodes a colour
 *   families() / swatches()       listing helpers (the F3 demo swatch strip uses these)
 *   lerp clamp01 smooth           tiny maths helpers every art recipe uses
 *
 * Adding a colour: add it to the right family here (or ask the F3 owner via NEEDS). Never inline a hex elsewhere.
 * PAL is deep-frozen; to vary a colour at runtime, copy it (`C3(PAL.sky.zenith).lerp(...)`).
 */
import * as THREE from 'three';

const RAW = {
  // ── from the tuned prototype (ART-DIRECTION §7), unchanged ─────────────────────────────────────────────────
  sky:    { zenith: '#2a74d0', upper: '#4f9ae2', horizon: '#bfe2f2', haze: '#cbdfe8', sunGlow: '#fff0c8', page: '#9cc7e6' },
  cloud:  { lit: '#fffdf6', warm: '#fff3dc', mid: '#e9edf6', shade: '#b8c3dd', core: '#9aa8c8' },
  light:  { sun: '#fff0d2', hemiSky: '#c3cff0', hemiGround: '#bba374' },
  grass:  { deep: '#3f7a3a', mid: '#62a04a', light: '#86b85a', sun: '#a9c36a', dry: '#b0ac66', clump: '#335f30', tip: '#a6d273' },
  dirt:   { base: '#b98d5d', light: '#dcbc8a', dark: '#8d6641', pebble: '#ead7b0', crack: '#6f4f33', bank: '#7a6446' },
  stone:  { light: '#d7cfbd', mid: '#b0a592', dark: '#83796a', mortar: '#6a6256', moss: '#7d9150', cobbleA: '#c8bca5', cobbleB: '#a99c86' },
  wood:   { light: '#c08a58', mid: '#94623a', dark: '#65402a', grain: '#4b2f1c', beam: '#7a5236', weathered: '#a38c74' },
  thatch: { pale: '#f0d38a', light: '#e2bb68', mid: '#c79a4e', dark: '#8f6a34', gap: '#5d4424' },
  tile:   { light: '#e98657', mid: '#cc603d', dark: '#93402a', ridge: '#b5533a', lichen: '#b8b06a' },
  plaster:{ light: '#fdf4e0', mid: '#f1e2c3', dark: '#dcc7a2', grime: '#bba684' },
  water:  { deep: '#2c74a6', mid: '#4a9dcc', light: '#90d3ea', foam: '#f0fbff' },
  cloth:  { purple: '#7d4bb0', purpleDark: '#57337f', tunic: '#ecdcb8', red: '#d8483b', cream: '#f7ecd6', rope: '#bf9f6c', leather: '#7a4c2c',
            // added (F3): Bram's green travelling cloak (CANON §1), a sky-blue and a mustard for bunting / villagers
            green: '#4f8f45', greenDark: '#35632f', blue: '#4f7fc4', blueDark: '#34568f', mustard: '#e0b040', pink: '#e98fae' },
  foliage:{ dark: '#2d5a2b', mid: '#4a8a3a', light: '#78b048', sun: '#a8cc5c', trunk: '#7d5433', trunkDark: '#523622', bush: '#467f36', poplar: '#3c7336' },
  flower: { white: '#fffaf0', yellow: '#ffd64a', pink: '#f59bbd', red: '#e8535a', blue: '#8fb0ff', center: '#f0a232' },
  char:   { skin: '#fcd4ac', hair: '#2a2130', eye: '#1c1418', boot: '#6b4428', white: '#ffffff', carrot: '#f08a2c', coal: '#2e2a2c',
            hairBrown: '#5a3a26', belt: '#6e4527' },   // integrator: Bram's warm dark-brown hair, a plain belt
  slime:  { body: '#3b8fea', light: '#9bd2ff', mouth: '#7a1f2e', tongue: '#f07a8a' },
  hill:   { nearLow: '#4f8c40', near: '#76a852', midLow: '#4e8868', mid: '#86b088', farLow: '#86a6cc', far: '#bccde4', nearHaze: '#d9e6d2' },
  shadow: { contact: '#23301c', ao: '#6e7a52', aoCool: '#5d6484' },
  outline:{ char: '#2b1d1a', prop: '#3a2a20', leaf: '#1e3219', snow: '#5a6488' },
  paint:  { shutterGreen: '#4f8f5c', shutterBlue: '#4a74a8', glass: '#2d3f58', iron: '#4d4a50', doorRed: '#a8453a', gold: '#e9b949' },

  // added by the integrator for the first field (sheep, ducks): warm cream wool, a soft charcoal face, a farm duck
  animal: { wool: '#f7f1e2', woolShade: '#e3d8c2', face: '#4a3c38', ear: '#5b4a44', hoof: '#34292a', duck: '#fbf8ef', beak: '#f3a93c', cheek: '#f2b6a8' },

  // ── added by the art foundation (F3) — tuned under the standard rig in demos/F3.html ──────────────────────
  sand:   { light: '#f4e2b4', mid: '#e5c78f', dark: '#c9a56c', ripple: '#b58f5a', shell: '#fdf1e2', wet: '#a98b5f' },
  snow:   { light: '#fbfcff', mid: '#e8eef9', shade: '#bfcbeb', deep: '#9aa9d8', ice: '#b6e0ef', sparkle: '#ffffff' },
  brick:  { light: '#dc7d5c', mid: '#be5d41', dark: '#8f412e', mortar: '#d9c9a9', soot: '#5b3b31', moss: '#86975a' },
  bark:   { light: '#a0714a', mid: '#7d5433', dark: '#5e3d25', furrow: '#3a2516', lichen: '#a5b36e', moss: '#6f8a44' },

  // Time-of-day / place lighting sets. The day set is PAL.sky + PAL.light. Keep the lit:shade ratio rule
  // (≈1 : 0.6 perceived) and keep shade TINTED — lerp between these, never toward grey.
  dusk:   { zenith: '#34488f', upper: '#6f6aae', horizon: '#f2b27e', haze: '#d8ae98', sunGlow: '#ffc98a',
            sun: '#ffc690', hemiSky: '#a79bd0', hemiGround: '#a57f5e' },
  night:  { zenith: '#0e1a44', upper: '#1f3068', horizon: '#46598e', haze: '#34416a', sunGlow: '#dfe6ff',
            sun: '#a9bcff', hemiSky: '#5d6cb0', hemiGround: '#3a3550', star: '#fff8e0' },
  interior:{ lamp: '#ffd9a2', hemiSky: '#efd8b4', hemiGround: '#8a6444', haze: '#4a3628', dark: '#2a1d16' },
  cave:   { torch: '#ffbd78', hemiSky: '#8487b8', hemiGround: '#5a4638', haze: '#231f2e', glow: '#ffe2a0' },

  // DQ command window (F4 reads these through applyCssVars: var(--pal-ui-win-top) etc.)
  ui:     { winTop: '#2c4fb8', winBottom: '#132a78', border: '#f4f1ea', borderShade: '#0a1540', text: '#ffffff',
            textDim: '#c9d4f2', cursor: '#ffe98a', gold: '#ffd64a', hp: '#8ee07a', mp: '#8fc8ff', danger: '#ff8a7a', shadow: '#050a20',
            // added (integrator, F4 needs): the tokens ui.css used to colour-mix, at exactly the mixed values it rendered
            winMid: '#213e9b', titleInk: '#f9e8ba', label: '#c9d4f2', purple: '#b89cd4', grey: '#adbce8', orange: '#f0a232' },

  // MONSTER-BIBLE §9 colours src/art/monsters.js (P16) picks up automatically (PAL.monster[key] wins over its derived
  // colour). Added (integrator, canon keeper need): only Pip's sunspot so far, which matches P16's derived colour; the
  // rest of §9 would override P16's tuned house-style derivations (e.g. the Gloop), so P16 adds them when it chooses.
  monster:{ sunspot: '#e8a04a' },

  // Painting inks: the exact highlight / shadow tints the tuned texture recipes glaze with (ART-DIRECTION §9).
  ink:    { highlight: '#fffaeb', shadow: '#32281e', speck: '#281e14', cobbleShadow: '#3c2a1c', cobbleLight: '#fffcf0',
            woodSheen: '#ffe6be', tileShadow: '#46190f', tileShade: '#3c140a', tileSheen: '#ffe6c8', petalLine: '#786e64' },

  // Pure data values for painting masks (not colours anyone sees). Named so no recipe inlines a hex.
  mask:   { on: '#ffffff', off: '#000000' },
  debug:  { missing: '#ff00ff' },
};

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  return Object.freeze(o);
}

// Canon calls the slime a Gloop (CANON §1): alias, same object.
RAW.gloop = RAW.slime;

export const PAL = deepFreeze(RAW);

// ── maths helpers (shared by every art recipe) ─────────────────────────────────────────────────────────────────
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ── colour helpers ─────────────────────────────────────────────────────────────────────────────────────────────
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Resolve a dotted palette path ('grass.mid') or pass a '#rrggbb' through. Unknown -> PAL.debug.missing. */
export function hex(pathOrHex) {
  if (typeof pathOrHex === 'string') {
    if (HEX_RE.test(pathOrHex)) return pathOrHex;
    const parts = pathOrHex.split('.');
    let v = PAL;
    for (const p of parts) { v = v ? v[p] : undefined; }
    if (typeof v === 'string') return v;
  }
  return PAL.debug.missing;
}

/** sRGB hex (or palette path) -> THREE.Color in the linear working space. */
export const C3 = (h) => new THREE.Color(hex(h));

/** [r, g, b] 0..255 */
export const rgb = (h) => { const n = parseInt(hex(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

/** 'rgba(r,g,b,a)' */
export const css = (h, a = 1) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };

/** Mix two hexes in sRGB, returns '#rrggbb'. */
export const mixHex = (a, b, t) => {
  const A = rgb(a), B = rgb(b);
  return '#' + [0, 1, 2].map(k => (Math.round(lerp(A[k], B[k], t)) | 0).toString(16).padStart(2, '0')).join('');
};

/** Multiply brightness of a hex (k < 1 darker, k > 1 lighter), clamped, returns '#rrggbb'. */
export const scaleHex = (h, k) => '#' + rgb(h).map(c => Math.max(0, Math.min(255, Math.round(c * k))).toString(16).padStart(2, '0')).join('');

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
/** [r, g, b] linear 0..1 — for baking colour maths into canvases the way the shaders do it. */
export const linRgb = (h) => rgb(h).map(c => s2l(c / 255));
/** linear 0..1 -> sRGB byte */
export const toSrgb8 = (v) => Math.max(0, Math.min(255, Math.round(l2s(Math.max(0, Math.min(1, v))) * 255)));

/** Perceived lightness (0..1) of a hex — used by the demo and critics to check the lit:shade ratio rule. */
export const luma = (h) => { const [r, g, b] = linRgb(h); return l2s(0.2126 * r + 0.7152 * g + 0.0722 * b); };

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * Publish the palette as CSS custom properties: --pal-grass-mid, --pal-ui-win-top, ...
 * Call once at boot (idempotent). Stylesheets then use var(--pal-ui-win-top) and never contain a hex.
 */
export function applyCssVars(el) {
  try {
    const root = el || (typeof document !== 'undefined' ? document.documentElement : null);
    if (!root || !root.style) return 0;
    let n = 0;
    for (const [fam, cols] of Object.entries(PAL)) {
      if (fam === 'gloop') continue;
      for (const [name, v] of Object.entries(cols)) { root.style.setProperty(`--pal-${kebab(fam)}-${kebab(name)}`, v); n++; }
    }
    return n;
  } catch (_) { return 0; }
}

/** Family names in display order (aliases skipped). */
export function families() { return Object.keys(PAL).filter(k => k !== 'gloop'); }

/** [{family, name, hex, path}] for every colour (aliases skipped). */
export function swatches(only) {
  const out = [];
  for (const fam of (only || families())) {
    const cols = PAL[fam];
    if (!cols) continue;
    for (const [name, v] of Object.entries(cols)) out.push({ family: fam, name, hex: v, path: `${fam}.${name}` });
  }
  return out;
}

export default PAL;
