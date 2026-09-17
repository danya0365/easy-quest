/**
 * font.js — the chunky warm type: DOM stack, measure / wrap helpers, and a canvas text renderer for text that
 * lives in 3D (damage numbers, place names, signposts, name tags).                      (F4, owner: src/ui/font.js)
 *
 *   import { Font } from './ui/font.js';
 *
 *   Font.STACK                       CSS font-family stack (mirrors --dq-font in ui.css; the CSS var wins if set)
 *   Font.css(size = 30, weight = 700) -> '700 30px "Arial Rounded MT Bold", ...'   (for ctx.font)
 *   Font.measure(text, size = 30, {letterSpacing}) -> {width, ascent, descent, height}
 *   Font.wrap(text, maxWidth, {size, letterSpacing}) -> string[]   (respects \n; never splits a word unless the word
 *                                                                  alone is wider than the line)
 *   Font.paginate(lines, perPage = 3) -> string[][]
 *   Font.fits(line, maxChars = 34)   -> boolean       VOICE-BIBLE §0: 34 characters is the wall
 *   Font.color(name)                 -> resolved theme colour ('ink', 'gold', 'red', 'edge', 'win-bot', ...) from
 *                                       the ui.css custom properties (--dq-<name>)
 *
 *   Font.draw(ctx, text, x, y, opts) draw chunky outlined text onto any 2D canvas
 *       opts: {size=30, weight=700, fill='ink', fill2 (bottom colour of a vertical gradient), outline='ink-shadow',
 *              outlineWidth=size*0.16, shadow=true (hard drop shadow), align='left'|'center'|'right',
 *              baseline='alphabetic'|'middle'|'top', letterSpacing=size*0.03}
 *       colours may be theme names ('gold') or any CSS colour string.
 *   Font.canvas(text, opts) -> {canvas, width, height, lines}      a tight, padded canvas (multi-line with maxWidth)
 *   Font.texture(text, opts) -> THREE.CanvasTexture (sRGB)           tex.userData = {width, height, aspect}
 *   Font.sprite(text, opts)  -> THREE.Sprite, opts.height = world units tall (default 0.5); depthTest off by
 *                               default so it reads over the world (put it in App.layers.ui3d).
 *       Sprites are cached by (text, style) key and share a texture; call Font.release(sprite) to free one early.
 *   Font.ready() -> Promise that resolves once document fonts are usable (system stack: immediately).
 */
import * as THREE from 'three';
import { reportError } from '../engine/debug.js';
import { applyCssVars } from '../art/palette.js';

export const STACK = '"Arial Rounded MT Bold", "Arial Rounded MT", ui-rounded, "Nunito", "Varela Round", "Quicksand", ' +
  '"Trebuchet MS", "Verdana", system-ui, sans-serif';

let stackCache = null;
let measureCtx = null;
const colorCache = new Map();
const texCache = new Map();   // key -> {tex, refs, width, height}

function cssVar(name) {
  try {
    if (typeof document === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch (_) { return ''; }
}

function stack() {
  if (stackCache) return stackCache;
  const v = cssVar('--dq-font');
  stackCache = v || STACK;
  return stackCache;
}

function mctx() {
  if (measureCtx) return measureCtx;
  try {
    const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
    measureCtx = c.getContext('2d');
  } catch (e) { reportError('Font.measure ctx', e); }
  return measureCtx;
}

// Named CSS keywords only, used if ui.css / the palette vars are missing. The real values come from palette.js via ui.css.
const FALLBACK = { ink: 'white', 'ink-shadow': 'midnightblue', gold: 'gold', red: 'tomato', green: 'palegreen',
  blue: 'lightskyblue', pink: 'pink', grey: 'lightsteelblue', orange: 'orange', edge: 'ivory', 'win-bot': 'midnightblue',
  label: 'lavender', 'title-ink': 'cornsilk' };

let probeEl = null;
/** Resolve any CSS colour expression (var(), color-mix()) to a canvas-safe 'rgb(...)' string. */
function resolveCssColor(expr) {
  try {
    if (typeof document === 'undefined' || !document.documentElement) return '';
    if (!probeEl || !probeEl.isConnected) {
      probeEl = document.createElement('span');
      probeEl.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
      probeEl.setAttribute('aria-hidden', 'true');
      document.documentElement.appendChild(probeEl);
    }
    probeEl.style.color = '';
    probeEl.style.color = expr;
    if (!probeEl.style.color) return '';
    return getComputedStyle(probeEl).color || '';
  } catch (_) { return ''; }
}

function color(name) {
  if (!name) return FALLBACK.ink;
  if (!/^[a-z][a-z-]*$/i.test(name)) return name;                  // already a CSS colour string
  if (colorCache.has(name)) return colorCache.get(name);
  if (!cssVar('--pal-ui-text')) { try { applyCssVars(); } catch (_) {} }   // theme tokens are derived from the palette vars
  let out = '';
  if (cssVar('--dq-' + name)) out = resolveCssColor(`var(--dq-${name})`);
  out = out || FALLBACK[name] || name;
  colorCache.set(name, out);
  return out;
}

function css(size = 30, weight = 700) { return `${weight} ${Math.round(size * 100) / 100}px ${stack()}`; }

function setSpacing(ctx, px) {
  try { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; } catch (_) {}
}

function measure(text, size = 30, opts = {}) {
  const ctx = mctx();
  const s = String(text ?? '');
  if (!ctx) return { width: s.length * size * 0.55, ascent: size * 0.8, descent: size * 0.2, height: size };
  ctx.font = css(size, opts.weight || 700);
  const ls = opts.letterSpacing ?? size * 0.035;
  setSpacing(ctx, ls);
  const m = ctx.measureText(s);
  const ascent = m.actualBoundingBoxAscent || size * 0.78;
  const descent = m.actualBoundingBoxDescent || size * 0.22;
  // measureText includes letterSpacing when the property is supported; otherwise add it
  const width = ('letterSpacing' in ctx) ? m.width : m.width + ls * s.length;
  return { width, ascent, descent, height: ascent + descent };
}

function wrap(text, maxWidth, opts = {}) {
  const size = opts.size || 30;
  const out = [];
  const paras = String(text ?? '').split('\n');
  const w = (s) => measure(s, size, opts).width;
  for (const para of paras) {
    const words = para.split(/ +/).filter((x, i, a) => x.length || a.length === 1);
    let line = '';
    for (const word of words) {
      const trial = line ? line + ' ' + word : word;
      if (!line || w(trial) <= maxWidth) {
        if (!line && w(word) > maxWidth) {
          // a single word wider than the line: split it by glyphs (last resort)
          let chunk = '';
          for (const ch of word) {
            if (chunk && w(chunk + ch) > maxWidth) { out.push(chunk); chunk = ch; } else chunk += ch;
          }
          line = chunk;
        } else line = trial;
      } else {
        out.push(line);
        line = word;
        if (w(word) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (chunk && w(chunk + ch) > maxWidth) { out.push(chunk); chunk = ch; } else chunk += ch;
          }
          line = chunk;
        }
      }
    }
    out.push(line);
  }
  return out;
}

function paginate(lines, perPage = 3) {
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  return pages.length ? pages : [[]];
}

function draw(ctx, text, x, y, opts = {}) {
  try {
    const size = opts.size || 30;
    const s = String(text ?? '');
    ctx.save();
    ctx.font = css(size, opts.weight || 700);
    setSpacing(ctx, opts.letterSpacing ?? size * 0.03);
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    const ow = opts.outlineWidth ?? size * 0.16;
    const outline = opts.outline === false ? null : color(opts.outline || 'ink-shadow');
    if (opts.shadow !== false && outline) {
      const d = opts.shadowOffset ?? Math.max(1, size * 0.075);
      ctx.fillStyle = outline; ctx.strokeStyle = outline; ctx.lineWidth = ow;
      ctx.strokeText(s, x, y + d); ctx.fillText(s, x, y + d);
    }
    if (outline && ow > 0) { ctx.strokeStyle = outline; ctx.lineWidth = ow; ctx.strokeText(s, x, y); }
    let fill = color(opts.fill || 'ink');
    if (opts.fill2) {
      const m = ctx.measureText(s);
      const top = y - (m.actualBoundingBoxAscent || size * 0.78), bot = y + (m.actualBoundingBoxDescent || size * 0.2);
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, fill); g.addColorStop(1, color(opts.fill2));
      fill = g;
    }
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
    ctx.restore();
  } catch (e) { reportError('Font.draw', e); }
}

function renderCanvas(text, opts = {}) {
  const size = opts.size || 64;
  const ow = opts.outlineWidth ?? size * 0.16;
  const pad = Math.ceil(opts.pad ?? (ow + size * 0.12));
  const lh = opts.lineHeight || size * 1.18;
  const lines = opts.maxWidth ? wrap(text, opts.maxWidth, { size, letterSpacing: opts.letterSpacing }) : String(text ?? '').split('\n');
  let maxW = 1;
  for (const l of lines) maxW = Math.max(maxW, measure(l, size, opts).width);
  const shadowD = opts.shadow === false ? 0 : (opts.shadowOffset ?? Math.max(1, size * 0.075));
  const width = Math.ceil(maxW + pad * 2);
  const height = Math.ceil(lh * lines.length + pad * 2 + shadowD);
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  const align = opts.align || 'center';
  const ax = align === 'center' ? width / 2 : align === 'right' ? width - pad : pad;
  lines.forEach((l, i) => draw(ctx, l, ax, pad + lh * i + lh * 0.5, { ...opts, size, align, baseline: 'middle' }));
  return { canvas: c, width, height, lines };
}

function styleKey(text, opts) {
  const o = { ...opts }; delete o.height; delete o.depthTest; delete o.renderOrder;
  return `${text}|${JSON.stringify(o)}`;
}

function texture(text, opts = {}) {
  const key = styleKey(text, opts);
  const hit = texCache.get(key);
  if (hit) { hit.refs++; return hit.tex; }
  let tex;
  try {
    const r = renderCanvas(text, { size: 96, ...opts });
    tex = new THREE.CanvasTexture(r.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    tex.userData = { width: r.width, height: r.height, aspect: r.width / r.height, key, fontTexture: true };
  } catch (e) {
    reportError('Font.texture', e);
    tex = new THREE.Texture();
    tex.userData = { width: 1, height: 1, aspect: 1, key, fontTexture: true };
  }
  texCache.set(key, { tex, refs: 1 });
  return tex;
}

function sprite(text, opts = {}) {
  const tex = texture(text, opts);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: opts.depthTest ?? false, depthWrite: false, fog: false });
  const sp = new THREE.Sprite(mat);
  const h = opts.height ?? 0.5;
  const a = tex.userData.aspect || 1;
  sp.scale.set(h * a, h, 1);
  sp.renderOrder = opts.renderOrder ?? 50;
  sp.userData.fontKey = tex.userData.key;
  sp.userData.baseScale = { x: h * a, y: h };
  return sp;
}

function release(sp) {
  try {
    if (!sp) return;
    const key = sp.userData && sp.userData.fontKey;
    if (sp.material) sp.material.dispose();
    const hit = key && texCache.get(key);
    if (hit && --hit.refs <= 0) { hit.tex.dispose(); texCache.delete(key); }
  } catch (e) { reportError('Font.release', e); }
}

export const Font = {
  STACK,
  get stack() { return stack(); },
  css,
  measure,
  wrap,
  paginate,
  fits(line, maxChars = 34) { return String(line ?? '').length <= maxChars; },
  color,
  draw,
  canvas: renderCanvas,
  texture,
  sprite,
  release,
  /** Forget cached theme colours / stack (after UI.setTheme). */
  refresh() { colorCache.clear(); stackCache = null; },
  ready() {
    try { return (document.fonts && document.fonts.ready) ? document.fonts.ready.then(() => true, () => true) : Promise.resolve(true); }
    catch (_) { return Promise.resolve(true); }
  },
  stats() { return { textures: texCache.size }; },
};

export default Font;
