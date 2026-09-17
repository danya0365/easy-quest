/**
 * tex.js — cached, tileable, procedural canvas textures.                                (F3, owner: src/art/tex.js)
 *
 * Recipes follow docs/ART-DIRECTION.md §8-9 (extracted from the tuned prototype). Everything is drawn to <canvas>
 * from PAL colours, built lazily on first use, and memoised through Assets (tagged shared: never dispose one from
 * a scene). Colour textures are SRGBColorSpace; masks / noise are NoColorSpace (data, not colour).
 *
 *   import { Tex } from '../art/tex.js';
 *   mat.map = Tex.stone();                         // RepeatWrapping, anisotropy 8, mipmapped
 *   const s = Tex.worldSize('stone');              // world units covered by one repeat (1.6) — set UVs to match
 *
 * Tileable colour textures (all seamless in both directions — see __DQ.sheet() in demos/F3.html):
 *   Tex.grass()  Tex.dirt()  Tex.stone()  Tex.cobble()  Tex.wood()  Tex.thatch()  Tex.tile()  Tex.plaster()
 *   Tex.water()  Tex.sand()  Tex.snow()  Tex.brick()  Tex.bark()  Tex.cloth(baseHex, {stripe, scallop, S})
 * Data (masks, NoColorSpace) for the painterly ground shader (P03 terrain):
 *   Tex.noise()      RGB = three independent tileable fbm octave sets (macro variation)
 *   Tex.grassMask()  R dark clumps, G sunlit blade tips, B fine mottling
 *   Tex.dirtMask()   R pebble lit tops, G pebble shadows + cracks + specks, B streaky mottling
 * Sprites (clamped): Tex.tuft()  Tex.flower()  Tex.blob()  Tex.clouds() (2x2 atlas, 1024x512)
 *
 *   Tex.get(name)  Tex.list()  Tex.info()  Tex.dump(name) -> PNG dataURL  Tex.prewarm([names])
 *
 * Notes
 *  - Tex.water() is ONE shared texture: scrolling its offset scrolls every river (intended). Clone it for a
 *    private offset.
 *  - Big terrain should not simply repeat Tex.grass(); use the mask textures in the ground shader (P03) or
 *    Toon.worldPlanar(), which breaks tiling with a second rotated sample + macro noise.
 *  - Noise/canvas helpers are exported for other art pieces (mulberry, fbmTile, vnoise, blur, ...).
 */
import * as THREE from 'three';
import { Assets } from '../engine/assets.js';
import { reportError } from '../engine/debug.js';
import { PAL, rgb, css, mixHex, lerp, clamp01, smooth, linRgb, toSrgb8 } from './palette.js';

// ── noise ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function grid(n, seed) { const r = mulberry(seed), g = new Float32Array(n * n); for (let i = 0; i < n * n; i++) g[i] = r(); return g; }
export function tileSample(g, n, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = (i, j) => g[((j % n) + n) % n * n + ((i % n) + n) % n];
  return (a(xi, yi) * (1 - u) + a(xi + 1, yi) * u) * (1 - v) + (a(xi, yi + 1) * (1 - u) + a(xi + 1, yi + 1) * u) * v;
}
/** Tileable fbm over an S x S tile, normalised to 0..1. base = cells across the tile at octave 0. */
export function fbmTile(S, base, oct, seed) {
  const out = new Float32Array(S * S), gs = [];
  for (let o = 0; o < oct; o++) gs.push([base << o, grid(base << o, seed + o * 131)]);
  let mn = 1e9, mx = -1e9;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = 1, sum = 0;
    for (const [n, g] of gs) { v += amp * tileSample(g, n, x / S * n, y / S * n); sum += amp; amp *= 0.5; }
    v /= sum; out[y * S + x] = v; if (v < mn) mn = v; if (v > mx) mx = v;
  }
  for (let i = 0; i < S * S; i++) out[i] = (out[i] - mn) / (mx - mn);
  return out;
}
export function hash2(i, j, s) { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (hash2(xi, zi, s) * (1 - u) + hash2(xi + 1, zi, s) * u) * (1 - v) + (hash2(xi, zi + 1, s) * (1 - u) + hash2(xi + 1, zi + 1, s) * u) * v;
}

// ── canvas helpers ─────────────────────────────────────────────────────────────────────────────────────────────
export function mkCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function ctx2(c) { return c.getContext('2d', { willReadFrequently: true }); }
export function texFrom(c, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.needsUpdate = true; return t;
}
/** Call fn(X, Y) for every wrapped copy of a stamp of radius r centred at (x, y) that touches the S x S tile. */
export function wrapDraw(S, x, y, r, fn) { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const X = x + ox, Y = y + oy; if (X + r < 0 || X - r > S || Y + r < 0 || Y - r > S) continue; fn(X, Y); } }
export function grayLayer(S, draw) {
  const c = mkCanvas(S), g = ctx2(c); g.fillStyle = PAL.mask.off; g.fillRect(0, 0, S, S); draw(g, S);
  const d = g.getImageData(0, 0, S, S).data, out = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) out[i] = d[i * 4] / 255; return out;
}
export function packRGB(S, R, G, B) {
  const c = mkCanvas(S), g = ctx2(c), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { img.data[i * 4] = (R ? R[i] : 0) * 255; img.data[i * 4 + 1] = (G ? G[i] : 0) * 255; img.data[i * 4 + 2] = (B ? B[i] : 0) * 255; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}
/** Separable box blur ~ gaussian, in place on a Float32Array. wrap = tileable. */
export function blur(a, w, h, r, passes = 3, wrap = false) {
  const b = new Float32Array(w * h), idx = wrap ? (v, n) => ((v % n) + n) % n : (v, n) => Math.max(0, Math.min(n - 1, v));
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) { const row = y * w; let acc = 0; for (let x = -r; x <= r; x++) acc += a[row + idx(x, w)];
      for (let x = 0; x < w; x++) { b[row + x] = acc / (2 * r + 1); acc += a[row + idx(x + r + 1, w)] - a[row + idx(x - r, w)]; } }
    for (let x = 0; x < w; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += b[idx(y, h) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = acc / (2 * r + 1); acc += b[idx(y + r + 1, h) * w + x] - b[idx(y - r, h) * w + x]; } }
  }
  return a;
}
/** Paint a per-pixel colour function into an S x S canvas: fn(i, x, y) -> [r, g, b] bytes (alpha 255). */
function pixelCanvas(S, fn) {
  const c = mkCanvas(S), g = ctx2(c), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, col = fn(i, x, y);
    d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { c, g };
}
const mix3 = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };

// shared intermediate layers (memoised so grass() and grassMask() don't redo the work)
const layer = (key, build) => Assets.memo('other', 'tex-layer:' + key, build);

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Recipes. Each returns a THREE.Texture. Names match Tex.<name>().
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════

// 2a. macro noise: three independent tileable fbm channels (masks, not colour)
function texNoise() { return texFrom(packRGB(256, fbmTile(256, 4, 5, 11), fbmTile(256, 8, 4, 23), fbmTile(256, 16, 3, 37)), { srgb: false }); }

// 2b. GRASS detail mask  R = dark clumps, G = sunlit blade tips, B = fine mottling
function grassLayers() {
  return layer('grass', () => {
    const S = 512, rnd = mulberry(101), clumps = [];
    for (let i = 0; i < 120; i++) clumps.push({ x: rnd() * S, y: rnd() * S, s: 18 + rnd() * 34, n: 7 + (rnd() * 4 | 0), a0: rnd() * 6.283, al: 0.35 + rnd() * 0.4, k: Array.from({ length: 12 }, () => rnd()) });
    const R = grayLayer(S, (g) => {
      for (const c of clumps) wrapDraw(S, c.x, c.y, c.s * 1.2, (X, Y) => {
        g.fillStyle = css(PAL.mask.on, c.al);
        for (let k = 0; k < c.n; k++) {
          const a = c.a0 + k / c.n * 6.283 + (c.k[k] - 0.5) * 0.5, L = c.s * (0.6 + c.k[k] * 0.35), w = c.s * 0.34;
          const px = Math.cos(a + 1.57) * w, py = Math.sin(a + 1.57) * w;
          g.beginPath(); g.moveTo(X + px, Y + py);
          g.quadraticCurveTo(X + Math.cos(a) * L * 0.5 + px * 0.7, Y + Math.sin(a) * L * 0.5 + py * 0.7, X + Math.cos(a) * L, Y + Math.sin(a) * L);
          g.quadraticCurveTo(X + Math.cos(a) * L * 0.5 - px * 0.7, Y + Math.sin(a) * L * 0.5 - py * 0.7, X - px, Y - py); g.fill();
        }
        g.beginPath(); g.arc(X, Y, c.s * 0.5, 0, 6.283); g.fill();
      });
    });
    const G = grayLayer(S, (g) => {
      g.lineCap = 'round';
      for (const c of clumps) wrapDraw(S, c.x, c.y, c.s * 1.2, (X, Y) => {
        g.strokeStyle = css(PAL.mask.on, 0.55 + c.k[9] * 0.4); g.lineWidth = 2.5;
        for (let k = 0; k < c.n; k++) {
          const a = c.a0 + k / c.n * 6.283 + (c.k[k] - 0.5) * 0.7; if (Math.cos(a - 3.93) < 0.2) continue;
          const L = c.s * (0.55 + c.k[k] * 0.5);
          g.beginPath(); g.moveTo(X + Math.cos(a) * L * 0.45, Y + Math.sin(a) * L * 0.45); g.lineTo(X + Math.cos(a) * L * 0.92, Y + Math.sin(a) * L * 0.92); g.stroke();
        }
      });
      const r2 = mulberry(7);
      for (let i = 0; i < 500; i++) { const x = r2() * S, y = r2() * S, l = 3 + r2() * 6, a = -2.2 + (r2() - 0.5) * 0.8, al = 0.25 + r2() * 0.35;
        wrapDraw(S, x, y, l, (X, Y) => { g.strokeStyle = css(PAL.mask.on, al); g.lineWidth = 1.5; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); g.stroke(); }); }
    });
    blur(R, S, S, 2, 2, true);
    return { S, R, G, B: fbmTile(S, 16, 4, 77) };
  });
}
function texGrassMask() { const L = grassLayers(); return texFrom(packRGB(L.S, L.R, L.G, L.B), { srgb: false }); }

// 2c. DIRT detail mask  R = pebble lit tops, G = pebble shadows + cracks + specks, B = streaky mottling
function dirtLayers() {
  return layer('dirt', () => {
    const S = 512, rnd = mulberry(202), peb = [];
    for (let i = 0; i < 60; i++) peb.push({ x: rnd() * S, y: rnd() * S, rx: (rnd() < 0.2 ? 7 : 2.5) + rnd() * 5, q: 0.55 + rnd() * 0.35, rot: rnd() * 3.14, al: 0.5 + rnd() * 0.4 });
    const R = grayLayer(S, (g) => { for (const p of peb) wrapDraw(S, p.x, p.y, p.rx + 2, (X, Y) => {
      g.fillStyle = css(PAL.mask.on, p.al); g.beginPath(); g.ellipse(X, Y, p.rx, p.rx * p.q, p.rot, 0, 6.283); g.fill(); }); });
    const G = grayLayer(S, (g) => {
      for (const p of peb) wrapDraw(S, p.x, p.y, p.rx + 4, (X, Y) => { g.fillStyle = css(PAL.mask.on, 0.8); g.beginPath(); g.ellipse(X + 1.5, Y + 2, p.rx * 1.05, p.rx * p.q * 1.1, p.rot, 0, 6.283); g.fill(); });
      const r2 = mulberry(9); g.lineCap = 'round';
      for (let i = 0; i < 12; i++) { let x = r2() * S, y = r2() * S, a = r2() * 6.28; const al = 0.25 + r2() * 0.3;
        for (let s = 0; s < 8; s++) { const nx = x + Math.cos(a) * 9, ny = y + Math.sin(a) * 9;
          wrapDraw(S, x, y, 12, (X, Y) => { g.strokeStyle = css(PAL.mask.on, al); g.lineWidth = 1.3; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + nx - x, Y + ny - y); g.stroke(); });
          x = nx; y = ny; a += (r2() - 0.5) * 1.1; } }
      for (let i = 0; i < 900; i++) { const x = r2() * S, y = r2() * S; g.fillStyle = css(PAL.mask.on, 0.2 + r2() * 0.4); g.fillRect(x, y, 1.5, 1.5); }
    });
    for (let i = 0; i < S * S; i++) G[i] = Math.max(0, G[i] - R[i]);        // shadows sit under/behind pebbles only
    return { S, R, G, B: fbmTile(S, 8, 5, 303) };
  });
}
function texDirtMask() { const L = dirtLayers(); return texFrom(packRGB(L.S, L.R, L.G, L.B), { srgb: false }); }

// GRASS (colour) — the ground shader's grass formula baked into a tile, mixed in linear light like the shader.
function texGrass() {
  const L = grassLayers(), S = L.S;
  const nA = fbmTile(S, 4, 5, 511), nB = fbmTile(S, 4, 4, 523), nC = fbmTile(S, 8, 3, 537);   // big patches come from Toon.worldPlanar at world scale
  const P = { deep: linRgb(PAL.grass.deep), mid: linRgb(PAL.grass.mid), light: linRgb(PAL.grass.light), sun: linRgb(PAL.grass.sun), clump: linRgb(PAL.grass.clump), tip: linRgb(PAL.grass.tip) };
  const o = [0, 0, 0], out = [0, 0, 0];
  return texFrom(pixelCanvas(S, (i) => {
    mix3(o, P.deep, P.mid, 0.3 + 0.7 * smooth(0.12, 0.55, nA[i]));
    mix3(o, o, P.light, smooth(0.48, 0.80, nB[i]) * 0.75);
    mix3(o, o, P.sun, smooth(0.58, 0.90, nA[i] * 0.55 + nC[i] * 0.45) * 0.55);
    const clump = L.R[i];
    mix3(o, o, P.clump, clump * 0.36);
    mix3(o, o, P.tip, L.G[i] * 0.30 * (1 - clump * 0.5));
    const k = 0.94 + 0.12 * L.B[i];
    out[0] = toSrgb8(o[0] * k); out[1] = toSrgb8(o[1] * k); out[2] = toSrgb8(o[2] * k);
    return out;
  }).c);
}

// DIRT / PATH (colour) — packed earth with a lighter worn crown, hairline cracks and a few pebbles.
function texDirt() {
  const L = dirtLayers(), S = L.S, n = fbmTile(S, 4, 4, 611), m = fbmTile(S, 2, 3, 619);
  const P = { dark: linRgb(PAL.dirt.dark), base: linRgb(PAL.dirt.base), light: linRgb(PAL.dirt.light), crack: linRgb(PAL.dirt.crack), pebble: linRgb(PAL.dirt.pebble) };
  const o = [0, 0, 0], out = [0, 0, 0];
  return texFrom(pixelCanvas(S, (i) => {
    mix3(o, P.dark, P.base, smooth(0.08, 0.5, n[i] * 0.7 + m[i] * 0.3));
    mix3(o, o, P.light, smooth(0.55, 0.95, n[i] * 0.5 + m[i] * 0.5) * 0.5);
    const k = 0.92 + 0.16 * L.B[i];
    o[0] *= k; o[1] *= k; o[2] *= k;
    mix3(o, o, P.crack, L.G[i] * 0.55);
    mix3(o, o, P.pebble, L.R[i] * 0.75);
    out[0] = toSrgb8(o[0]); out[1] = toSrgb8(o[1]); out[2] = toSrgb8(o[2]);
    return out;
  }).c);
}

// 2d. STONE wall (colour) — rounded coursed rubble with moss
function texStone() {
  const S = 512, c = mkCanvas(S), g = ctx2(c), rnd = mulberry(404);
  g.fillStyle = PAL.stone.mortar; g.fillRect(0, 0, S, S);
  let y = 0;
  while (y < S) {
    let h = 52 + rnd() * 26; if (S - (y + h) < 44) h = S - y;
    const x0 = rnd() * S; let x = 0;
    while (x < S) {
      let w = 70 + rnd() * 80; if (S - (x + w) < 50) w = S - x;
      const base = mixHex(PAL.stone.light, PAL.stone.mid, rnd()), dark = rnd() < 0.25;
      const sx = (x0 + x) % S, moss = rnd() < 0.2;
      for (const ox of [0, -S]) {
        const X = sx + ox + 3, Y = y + 3, W = w - 6, H = h - 6;
        if (X > S || X + W < 0) continue;
        g.fillStyle = dark ? mixHex(PAL.stone.mid, PAL.stone.dark, 0.5) : base;
        g.beginPath(); g.roundRect(X, Y, W, H, 14); g.fill();
        const gr = g.createLinearGradient(X, Y, X + W * 0.35, Y + H);
        gr.addColorStop(0, css(PAL.ink.highlight, 0.40)); gr.addColorStop(0.45, css(PAL.ink.highlight, 0)); gr.addColorStop(1, css(PAL.ink.shadow, 0.38));
        g.fillStyle = gr; g.beginPath(); g.roundRect(X, Y, W, H, 14); g.fill();
        if (moss) { g.fillStyle = css(PAL.stone.moss, 0.55); g.beginPath(); g.ellipse(X + W * 0.5, Y + 6, W * 0.35, 7, 0, 0, 6.283); g.fill(); }
      }
      x += w;
    }
    y += h;
  }
  for (let i = 0; i < 2500; i++) { g.fillStyle = rnd() < 0.5 ? css(PAL.char.white, 0.12) : css(PAL.ink.speck, 0.12); g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  return texFrom(c);
}

// 2e. COBBLES (colour) — rounded cobbles in dark earth
function texCobble() {
  const S = 512, c = mkCanvas(S), g = ctx2(c), rnd = mulberry(505), N = 9, cell = S / N;
  g.fillStyle = PAL.dirt.dark; g.fillRect(0, 0, S, S);
  const stones = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) stones.push({ x: (i + 0.5 + (rnd() - 0.5) * 0.35) * cell, y: (j + 0.5 + (rnd() - 0.5) * 0.35) * cell, rx: cell * (0.40 + rnd() * 0.07), ry: cell * (0.36 + rnd() * 0.07), rot: rnd() * 3.14, t: rnd() });
  for (const s of stones) wrapDraw(S, s.x, s.y, cell, (X, Y) => { g.fillStyle = css(PAL.ink.cobbleShadow, 0.55); g.beginPath(); g.ellipse(X + 3, Y + 4, s.rx, s.ry, s.rot, 0, 6.283); g.fill(); });
  for (const s of stones) wrapDraw(S, s.x, s.y, cell, (X, Y) => {
    g.fillStyle = mixHex(PAL.stone.cobbleA, PAL.stone.cobbleB, s.t); g.beginPath(); g.ellipse(X, Y, s.rx, s.ry, s.rot, 0, 6.283); g.fill();
    g.fillStyle = css(PAL.ink.cobbleLight, 0.35); g.beginPath(); g.ellipse(X - s.rx * 0.22, Y - s.ry * 0.25, s.rx * 0.55, s.ry * 0.45, s.rot, 0, 6.283); g.fill();
  });
  return texFrom(c);
}

// 2f. WOOD planks (colour) — vertical planks, grain, gaps, knots. Tint with material colour / vertex colour.
function texWood() {
  const S = 256, c = mkCanvas(S), g = ctx2(c), rnd = mulberry(606), P = 4, pw = S / P;
  for (let p = 0; p < P; p++) {
    const x0 = p * pw; g.fillStyle = mixHex(PAL.wood.mid, PAL.wood.light, 0.25 + rnd() * 0.5); g.fillRect(x0, 0, pw, S);
    for (let k = 0; k < 12; k++) {
      const x = x0 + 4 + rnd() * (pw - 8), amp = 1 + rnd() * 3, per = [1, 2, 3][rnd() * 3 | 0], ph = rnd() * 6.28;
      g.strokeStyle = css(PAL.wood.dark, 0.18 + rnd() * 0.3); g.lineWidth = 1 + rnd() * 1.5; g.beginPath();
      for (let y = 0; y <= S; y += 8) g.lineTo(x + Math.sin(y / S * 6.283 * per + ph) * amp, y);
      g.stroke();
    }
    if (rnd() < 0.7) { const kx = x0 + pw * (0.3 + rnd() * 0.4), ky = 12 + rnd() * (S - 24); g.strokeStyle = css(PAL.wood.grain, 0.6); g.lineWidth = 2;
      g.beginPath(); g.ellipse(kx, ky, 5, 8, 0, 0, 6.283); g.stroke(); g.fillStyle = css(PAL.wood.grain, 0.5); g.beginPath(); g.ellipse(kx, ky, 2, 4, 0, 0, 6.283); g.fill(); }
    g.fillStyle = css(PAL.wood.grain, 0.9); g.fillRect(x0, 0, 3, S);
    g.fillStyle = css(PAL.ink.woodSheen, 0.18); g.fillRect(x0 + 3, 0, 2, S);
  }
  return texFrom(c);
}

// 2g. THATCH (colour) — layered straw courses, each shadowed by the course above.
// Wraps vertically: the bottom course's straw tips reappear hanging over the top edge, and the top course's
// clipped roots reappear (hidden under the fill) at the bottom, drawn in the same overlap order as interior courses.
function texThatch() {
  const S = 512, c = mkCanvas(S), g = ctx2(c), rnd = mulberry(707), ROWS = 6, rh = S / ROWS;
  g.fillStyle = PAL.thatch.dark; g.fillRect(0, 0, S, S);
  const tones = [PAL.thatch.pale, PAL.thatch.light, PAL.thatch.light, PAL.thatch.mid, PAL.thatch.mid, PAL.thatch.dark];
  const courses = [];
  for (let r = 0; r < ROWS; r++) {
    const list = [];
    for (let i = 0; i < 650; i++) list.push({ x: rnd() * S, y0: -4 + rnd() * 14, len: rh * 0.75 + rnd() * rh * 0.45, lean: (rnd() - 0.5) * 10, col: tones[rnd() * tones.length | 0], al: 0.55 + rnd() * 0.45, lw: 1.2 + rnd() * 2.2 });
    courses.push(list);
  }
  const straw = (list, top) => {
    for (const st of list) for (const ox of [-S, 0, S]) {
      const x = st.x + ox, y0 = top + st.y0;
      g.strokeStyle = css(st.col, st.al); g.lineWidth = st.lw; g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + st.lean * 0.3, y0 + st.len * 0.5, x + st.lean, y0 + st.len); g.stroke();
    }
  };
  straw(courses[0], ROWS * rh);                                     // course 0 wrapped below the tile (covered like any course)
  for (let r = ROWS - 1; r >= 0; r--) {                              // bottom course first; upper courses overlap
    const top = r * rh;
    g.fillStyle = PAL.thatch.mid; g.fillRect(0, top, S, rh);
    straw(courses[r], top);
    const sh = g.createLinearGradient(0, top, 0, top + rh * 0.42);
    sh.addColorStop(0, css(PAL.thatch.gap, 0.75)); sh.addColorStop(1, css(PAL.thatch.gap, 0));
    g.fillStyle = sh; g.fillRect(0, top, S, rh * 0.42);
  }
  straw(courses[ROWS - 1], -rh);                                     // last course wrapped above: its tips hang over the top edge
  return texFrom(c);
}

// 2h. ROOF TILE (colour) — overlapping terracotta pantiles
function texTile() {
  const S = 512, c = mkCanvas(S), g = ctx2(c), rnd = mulberry(808), ROWS = 8, COLS = 8, rh = S / ROWS, tw = S / COLS;
  g.fillStyle = PAL.tile.dark; g.fillRect(0, 0, S, S);
  for (let r = ROWS; r >= -1; r--) {
    const top = r * rh, off = (r & 1) ? tw * 0.5 : 0;
    for (let k = -1; k <= COLS; k++) {
      const x = k * tw + off, base = mixHex(PAL.tile.mid, PAL.tile.light, 0.25 + rnd() * 0.75), lich = rnd() < 0.1;
      const draw = (X) => {
        g.fillStyle = css(PAL.ink.tileShadow, 0.45); g.beginPath(); g.roundRect(X + 2, top + 6, tw - 3, rh + 6, [0, 0, tw * 0.45, tw * 0.45]); g.fill();
        const gr = g.createLinearGradient(X, 0, X + tw, 0);
        gr.addColorStop(0, base); gr.addColorStop(0.35, mixHex(base, PAL.char.white, 0.2)); gr.addColorStop(1, mixHex(base, PAL.tile.dark, 0.35));
        g.fillStyle = gr; g.beginPath(); g.roundRect(X + 1, top, tw - 2, rh + 2, [0, 0, tw * 0.45, tw * 0.45]); g.fill();
        const vg = g.createLinearGradient(0, top, 0, top + rh);
        vg.addColorStop(0, css(PAL.ink.tileShade, 0.45)); vg.addColorStop(0.3, css(PAL.ink.tileShade, 0)); vg.addColorStop(1, css(PAL.ink.tileSheen, 0.10));
        g.fillStyle = vg; g.beginPath(); g.roundRect(X + 1, top, tw - 2, rh + 2, [0, 0, tw * 0.45, tw * 0.45]); g.fill();
        if (lich) { g.fillStyle = css(PAL.tile.lichen, 0.5); g.beginPath(); g.ellipse(X + tw * 0.5, top + rh * 0.7, tw * 0.18, rh * 0.12, 0, 0, 6.283); g.fill(); }
      };
      draw(x); if (x < 0) draw(x + S); if (x + tw > S) draw(x - S);
    }
  }
  return texFrom(c);
}

// 2i. PLASTER (colour) — warm mottled lime-wash
function texPlaster() {
  const S = 256, c = mkCanvas(S), g = ctx2(c), img = g.createImageData(S, S), n = fbmTile(S, 4, 5, 909), m = fbmTile(S, 16, 3, 919);
  const A = rgb(PAL.plaster.mid), B = rgb(PAL.plaster.light), D = rgb(PAL.plaster.dark);
  for (let i = 0; i < S * S; i++) { const t = smooth(0.2, 0.8, n[i]); const d = smooth(0.62, 0.95, m[i]) * 0.35;
    for (let k = 0; k < 3; k++) img.data[i * 4 + k] = lerp(lerp(A[k], B[k], t), D[k], d); img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const rnd = mulberry(929); g.strokeStyle = css(PAL.plaster.grime, 0.35); g.lineWidth = 1;
  for (let i = 0; i < 4; i++) { let x = 20 + rnd() * (S - 40), y = 10 + rnd() * (S - 110); g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 18; y += rnd() * 14; g.lineTo(x, y); } g.stroke(); }
  return texFrom(c);
}

// 2j. WATER (colour) — flat bright blue with painted ripple highlights
function texWater() {
  const S = 256, c = mkCanvas(S), g = ctx2(c), img = g.createImageData(S, S), n = fbmTile(S, 4, 4, 1001);
  const A = rgb(PAL.water.deep), B = rgb(PAL.water.mid);
  for (let i = 0; i < S * S; i++) { const t = smooth(0.25, 0.75, n[i]); for (let k = 0; k < 3; k++) img.data[i * 4 + k] = lerp(A[k], B[k], 0.35 + 0.65 * t); img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const rnd = mulberry(1011); g.lineCap = 'round';
  for (let i = 0; i < 46; i++) { const x = rnd() * S, y = rnd() * S, L = 16 + rnd() * 34, al = 0.35 + rnd() * 0.45, lw = 1.5 + rnd() * 2;
    wrapDraw(S, x, y, L, (X, Y) => { g.strokeStyle = css(PAL.water.light, al); g.lineWidth = lw; g.beginPath(); for (let s = 0; s <= 8; s++) g.lineTo(X + s / 8 * L, Y + Math.sin(s / 8 * 6.283) * 2.2); g.stroke(); }); }
  for (let i = 0; i < 22; i++) { const x = rnd() * S, y = rnd() * S; wrapDraw(S, x, y, 6, (X, Y) => { g.strokeStyle = css(PAL.water.foam, 0.9); g.lineWidth = 2; g.beginPath(); g.moveTo(X - 4, Y); g.lineTo(X + 4, Y); g.stroke(); }); }
  return texFrom(c);
}

// 2k. CLOTH (colour) — plain weave over a base colour; stripes optional; scalloped hem alpha optional
function texCloth(base, { stripe = null, scallop = false, S = 128 } = {}) {
  const c = mkCanvas(S), g = ctx2(c), img = g.createImageData(S, S), B = rgb(base), T = stripe ? rgb(stripe) : null;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, weave = (((x >> 1) + (y >> 1)) & 1) ? 10 : -10, thread = (x % 4 === 0 || y % 4 === 0) ? -8 : 0;
    const band = T && (Math.floor(x / (S / 8)) & 1);
    const col = band ? T : B;
    for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, col[k] + weave + thread));
    let a = 255;
    if (scallop) { const cx = ((x % (S / 8)) - S / 16) / (S / 16), yy = y / S; if (yy > 0.78 && yy - 0.78 > 0.2 * Math.sqrt(Math.max(0, 1 - cx * cx))) a = 0; }
    img.data[i + 3] = a;
  }
  g.putImageData(img, 0, 0); return texFrom(c);
}

// SAND (colour) — warm dune sand: soft mottling, wind ripples with a lit crest and a shaded lee, a few specks.
function texSand() {
  const S = 512, n = fbmTile(S, 4, 5, 701), warp = fbmTile(S, 4, 3, 709), amp = fbmTile(S, 2, 3, 719), fine = fbmTile(S, 32, 2, 727);
  const P = { dark: linRgb(PAL.sand.dark), mid: linRgb(PAL.sand.mid), light: linRgb(PAL.sand.light), ripple: linRgb(PAL.sand.ripple) };
  const o = [0, 0, 0], out = [0, 0, 0], K = 9, TAU = Math.PI * 2;
  const { c, g } = pixelCanvas(S, (i, x, y) => {
    mix3(o, P.dark, P.mid, 0.45 + 0.55 * smooth(0.1, 0.5, n[i]));
    mix3(o, o, P.light, smooth(0.5, 0.95, n[i]) * 0.6);
    // integer wave numbers in x and y + tileable warp => the ripples wrap seamlessly
    const ph = (y / S) * K + (x / S) * 1 + warp[i] * 1.6;
    const f = ph - Math.floor(ph), a = smooth(0.25, 0.75, amp[i]);
    const lee = smooth(0.0, 0.07, f) * (1 - smooth(0.12, 0.32, f));      // thin shaded trough just past the crest
    const crest = smooth(0.62, 0.9, f) * (1 - smooth(0.94, 1.0, f));      // broad lit face rising to the crest
    mix3(o, o, P.ripple, lee * 0.55 * a);
    mix3(o, o, P.light, crest * 0.45 * a);
    const k = 0.96 + 0.08 * fine[i];
    out[0] = toSrgb8(o[0] * k); out[1] = toSrgb8(o[1] * k); out[2] = toSrgb8(o[2] * k);
    return out;
  });
  const rnd = mulberry(733);
  for (let i = 0; i < 700; i++) { const x = rnd() * S, y = rnd() * S; g.fillStyle = rnd() < 0.6 ? css(PAL.sand.shell, 0.5 + rnd() * 0.4) : css(PAL.sand.wet, 0.35 + rnd() * 0.3); g.fillRect(x, y, 1.5, 1.5); }
  for (let i = 0; i < 14; i++) { const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 2.5, rot = rnd() * 3.14;
    wrapDraw(S, x, y, r + 3, (X, Y) => { g.fillStyle = css(PAL.sand.wet, 0.45); g.beginPath(); g.ellipse(X + 1, Y + 1.5, r, r * 0.7, rot, 0, 6.283); g.fill();
      g.fillStyle = css(PAL.sand.shell, 0.9); g.beginPath(); g.ellipse(X, Y, r, r * 0.7, rot, 0, 6.283); g.fill(); }); }
  return texFrom(c);
}

// SNOW (colour) — bright crust with soft lavender-blue hollows (tinted, never grey) and sparkles. Kept simple:
// the toon bands and the mound do the modelling; the texture only adds painterly temperature shifts.
function texSnow() {
  const S = 512, n = fbmTile(S, 4, 5, 801), drift = fbmTile(S, 4, 4, 811), fine = fbmTile(S, 16, 3, 821);
  const P = { light: linRgb(PAL.snow.light), mid: linRgb(PAL.snow.mid), shade: linRgb(PAL.snow.shade), deep: linRgb(PAL.snow.deep) };
  const o = [0, 0, 0], out = [0, 0, 0];
  const { c, g } = pixelCanvas(S, (i) => {
    mix3(o, P.mid, P.light, smooth(0.25, 0.75, n[i]));
    mix3(o, o, P.shade, smooth(0.48, 0.85, drift[i]) * 0.7);
    mix3(o, o, P.deep, smooth(0.8, 1.0, drift[i]) * 0.25);
    mix3(o, o, P.shade, smooth(0.6, 0.95, fine[i]) * 0.14);
    out[0] = toSrgb8(o[0]); out[1] = toSrgb8(o[1]); out[2] = toSrgb8(o[2]);
    return out;
  });
  const rnd = mulberry(831), TAU = Math.PI * 2;
  for (let i = 0; i < 16; i++) {                                              // soft scoops: shaded hollows
    const x = rnd() * S, y = rnd() * S, r = 18 + rnd() * 26, q = 0.5 + rnd() * 0.2;
    wrapDraw(S, x, y, r * 1.2, (X, Y) => {
      const gr = g.createRadialGradient(X - r * 0.2, Y - r * 0.15 * q, 1, X, Y, r);
      gr.addColorStop(0, css(PAL.snow.shade, 0.32)); gr.addColorStop(1, css(PAL.snow.shade, 0));
      g.save(); g.translate(X, Y); g.scale(1, q); g.translate(-X, -Y); g.fillStyle = gr; g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill(); g.restore();
    });
  }
  for (let i = 0; i < 260; i++) { const x = rnd() * S, y = rnd() * S, s2 = 1 + rnd() * 1.3; g.fillStyle = rnd() < 0.7 ? css(PAL.snow.sparkle, 0.95) : css(PAL.snow.ice, 0.85); g.fillRect(x, y, s2, s2); }
  for (let i = 0; i < 22; i++) { const x = 4 + rnd() * (S - 8), y = 4 + rnd() * (S - 8), L = 2 + rnd() * 2.5;            // tiny four-point glints
    g.strokeStyle = css(PAL.snow.sparkle, 0.95); g.lineWidth = 1; g.beginPath(); g.moveTo(x - L, y); g.lineTo(x + L, y); g.moveTo(x, y - L); g.lineTo(x, y + L); g.stroke(); }
  return texFrom(c);
}

// BRICK (colour) — running bond, rounded chunky bricks, pale warm mortar, a little soot and moss.
function texBrick() {
  const S = 512, c = mkCanvas(S), g = ctx2(c), rnd = mulberry(901), ROWS = 8, COLS = 4, rh = S / ROWS, bw = S / COLS, gap = 5;
  g.fillStyle = PAL.brick.mortar; g.fillRect(0, 0, S, S);
  const grain = fbmTile(S, 16, 3, 907);
  { const img = g.getImageData(0, 0, S, S), d = img.data;                    // mottled mortar
    for (let i = 0; i < S * S; i++) { const k = 0.9 + grain[i] * 0.16; d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; }
    g.putImageData(img, 0, 0); }
  for (let r = 0; r < ROWS; r++) {
    const top = r * rh, off = (r & 1) ? bw * 0.5 : 0;
    for (let k = -1; k <= COLS; k++) {
      const x = k * bw + off, t = rnd(), dark = rnd() < 0.16, soot = rnd() < 0.1, moss = rnd() < 0.07, chip = rnd();
      const base = dark ? mixHex(PAL.brick.mid, PAL.brick.dark, 0.55 + rnd() * 0.3) : mixHex(PAL.brick.mid, PAL.brick.light, t * 0.85);
      const draw = (X) => {
        const bx = X + gap / 2, by = top + gap / 2, W = bw - gap, H = rh - gap;
        g.fillStyle = css(PAL.brick.soot, 0.35); g.beginPath(); g.roundRect(bx + 1.5, by + 2.5, W, H, 7); g.fill();
        g.fillStyle = base; g.beginPath(); g.roundRect(bx, by, W, H, 7); g.fill();
        const gr = g.createLinearGradient(bx, by, bx, by + H);
        gr.addColorStop(0, css(PAL.ink.highlight, 0.24)); gr.addColorStop(0.3, css(PAL.ink.highlight, 0)); gr.addColorStop(0.7, css(PAL.brick.soot, 0)); gr.addColorStop(1, css(PAL.brick.soot, 0.22));
        g.fillStyle = gr; g.beginPath(); g.roundRect(bx, by, W, H, 7); g.fill();
        if (soot) { const sg = g.createRadialGradient(bx + W * 0.6, by + H * 0.4, 2, bx + W * 0.6, by + H * 0.4, W * 0.5);
          sg.addColorStop(0, css(PAL.brick.soot, 0.45)); sg.addColorStop(1, css(PAL.brick.soot, 0)); g.fillStyle = sg; g.beginPath(); g.roundRect(bx, by, W, H, 7); g.fill(); }
        if (moss) { g.fillStyle = css(PAL.brick.moss, 0.6); g.beginPath(); g.ellipse(bx + W * (0.2 + chip * 0.6), by + H - 3, W * 0.22, 5, 0, 0, 6.283); g.fill(); }
        if (chip < 0.3) { g.fillStyle = css(PAL.brick.soot, 0.22); g.beginPath(); g.ellipse(bx + W * (0.15 + chip * 2.3), by + H * (0.3 + chip), 5, 2.5, 0.3, 0, 6.283); g.fill(); }
      };
      draw(x); if (x < 0) draw(x + S); if (x + bw > S) draw(x - S);
    }
  }
  for (let i = 0; i < 1800; i++) { g.fillStyle = rnd() < 0.5 ? css(PAL.plaster.light, 0.12) : css(PAL.brick.soot, 0.14); g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  return texFrom(c);
}

// BARK (colour) — a net of wavy dark furrows running up the trunk, lit ridge edges, soft plates, a little lichen.
function texBark() {
  const S = 512, rnd = mulberry(1103), TAU = Math.PI * 2, n = fbmTile(S, 4, 4, 1109);
  // anisotropic tileable streak noise: 40 cells across, 3 down -> long vertical grain that still wraps both ways
  const GX = 40, GY = 3, sg = grid(GX * GY, 1117), streakAt = (x, y) => {
    const fx = x / S * GX, fy = y / S * GY, xi = Math.floor(fx), yi = Math.floor(fy), u = fx - xi, v = fy - yi;
    const a = (i, j) => sg[(((j % GY) + GY) % GY) * GX + (((i % GX) + GX) % GX)];
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return (a(xi, yi) * (1 - su) + a(xi + 1, yi) * su) * (1 - sv) + (a(xi, yi + 1) * (1 - su) + a(xi + 1, yi + 1) * su) * sv;
  };
  const M = linRgb(PAL.bark.mid), L = linRgb(PAL.bark.light), D = linRgb(PAL.bark.dark);
  const o = [0, 0, 0], out = [0, 0, 0];
  // vertical streaks: squash a tileable noise along x so it reads as grain (sample the same column at 8 rows)
  const { c, g } = pixelCanvas(S, (i, x, y) => {
    const st = streakAt(x, y);
    mix3(o, D, M, 0.45 + 0.55 * smooth(0.15, 0.6, n[i]));
    mix3(o, o, L, smooth(0.55, 0.9, st) * 0.45);
    out[0] = toSrgb8(o[0]); out[1] = toSrgb8(o[1]); out[2] = toSrgb8(o[2]);
    return out;
  });
  const FUR = 9, lines = [];
  for (let k = 0; k < FUR; k++) {
    lines.push({ x0: (k + 0.5) * S / FUR + (rnd() - 0.5) * 14, k1: 1 + (rnd() * 2 | 0), p1: rnd() * TAU, a1: 5 + rnd() * 8, k2: 3 + (rnd() * 3 | 0), p2: rnd() * TAU, a2: 1.5 + rnd() * 3, w: 5 + rnd() * 4 });
  }
  const xAt = (l, y) => l.x0 + Math.sin((y / S) * TAU * l.k1 + l.p1) * l.a1 + Math.sin((y / S) * TAU * l.k2 + l.p2) * l.a2;
  const path = (l, ox, dx) => { g.beginPath(); for (let y = -8; y <= S + 8; y += 6) g.lineTo(xAt(l, y) + ox + dx, y); };
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const l of lines) for (const ox of [-S, 0, S]) {
    path(l, ox, 3.5); g.strokeStyle = css(PAL.bark.light, 0.35); g.lineWidth = l.w * 0.9; g.stroke();          // lit ridge edge beside the furrow
    path(l, ox, 0); g.strokeStyle = css(PAL.bark.furrow, 0.95); g.lineWidth = l.w; g.stroke();
    path(l, ox, -1); g.strokeStyle = css(PAL.bark.furrow, 0.5); g.lineWidth = l.w * 0.4; g.stroke();
  }
  // diagonal splits between neighbouring furrows make the diamond net (drawn with wrapped copies)
  for (let k = 0; k < FUR; k++) {
    const A = lines[k], B = lines[(k + 1) % FUR], wrapB = k === FUR - 1 ? S : 0;
    for (let j = 0; j < 2; j++) {
      const y0 = rnd() * S, dy = 34 + rnd() * 40, up = rnd() < 0.5;
      const xa = xAt(A, up ? y0 + dy : y0), xb = xAt(B, up ? y0 : y0 + dy) + wrapB;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.strokeStyle = css(PAL.bark.furrow, 0.7); g.lineWidth = 2.5 + (j % 2);
        g.beginPath(); g.moveTo(xa + ox, (up ? y0 + dy : y0) + oy); g.quadraticCurveTo((xa + xb) / 2 + ox, y0 + dy / 2 + oy, xb + ox, (up ? y0 : y0 + dy) + oy); g.stroke();
      }
    }
  }
  for (let i = 0; i < 5; i++) {                                               // soft irregular lichen
    const x = rnd() * S, y = rnd() * S, r = 8 + rnd() * 10, col = rnd() < 0.65 ? PAL.bark.lichen : PAL.bark.moss;
    const bits = Array.from({ length: 10 }, () => [rnd() * TAU, rnd(), 0.25 + rnd() * 0.35, 0.3 + rnd() * 0.3]);
    wrapDraw(S, x, y, r * 1.8, (X, Y) => { for (const [a, d, s2, al] of bits) { g.fillStyle = css(col, al); g.beginPath(); g.arc(X + Math.cos(a) * d * r, Y + Math.sin(a) * d * r * 1.6, r * s2, 0, TAU); g.fill(); } });
  }
  return texFrom(c);
}

// 2l. sprites: grass tuft, flower, blob shadow
function texTuft() {
  const S = 128, c = mkCanvas(S), g = ctx2(c), rnd = mulberry(1111);
  for (let i = 0; i < 11; i++) {
    const bx = 64 + (rnd() - 0.5) * 26, tx = 64 + (i / 10 - 0.5) * 110 + (rnd() - 0.5) * 10, ty = 8 + rnd() * 50, w = 6 + rnd() * 4;
    const gr = g.createLinearGradient(0, 124, 0, ty); gr.addColorStop(0, PAL.grass.deep); gr.addColorStop(0.5, PAL.grass.mid); gr.addColorStop(1, PAL.grass.tip);
    g.fillStyle = gr; g.beginPath(); g.moveTo(bx - w, 126); g.quadraticCurveTo((bx + tx) / 2 - w * 0.3, (126 + ty) / 2, tx, ty); g.quadraticCurveTo((bx + tx) / 2 + w * 0.3, (126 + ty) / 2, bx + w, 126); g.fill();
  }
  const t = texFrom(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function texFlower() {
  const S = 64, c = mkCanvas(S), g = ctx2(c);
  for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283 - 1.57; g.fillStyle = PAL.char.white; g.strokeStyle = css(PAL.ink.petalLine, 0.5); g.lineWidth = 2;
    g.beginPath(); g.ellipse(32 + Math.cos(a) * 13, 32 + Math.sin(a) * 13, 11, 8, a, 0, 6.283); g.fill(); g.stroke(); }
  g.fillStyle = PAL.flower.center; g.beginPath(); g.arc(32, 32, 8, 0, 6.283); g.fill();
  const t = texFrom(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function texBlob() {
  const S = 128, c = mkCanvas(S), g = ctx2(c), gr = g.createRadialGradient(64, 64, 0, 64, 64, 63);
  gr.addColorStop(0, css(PAL.mask.on, 0.85)); gr.addColorStop(0.5, css(PAL.mask.on, 0.6)); gr.addColorStop(1, css(PAL.mask.on, 0));
  g.fillStyle = gr; g.fillRect(0, 0, S, S); const t = texFrom(c, { srgb: false }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// 2m. cloud atlas: 2x2, each cell 512x256; cumulus with flat lavender bases (sky, P02)
function texClouds() {
  const W = 1024, H = 512, c = mkCanvas(W, H), g = ctx2(c);
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * 512, oy = (v >> 1) * 256, rnd = mulberry(1201 + v * 17), base = oy + 214, puffs = [];
    const span = 300 + rnd() * 110, x0 = ox + 256 - span / 2, n = 5 + (rnd() * 2 | 0);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; puffs.push({ x: x0 + t * span + (rnd() - 0.5) * 14, y: base - 24 - rnd() * 10, r: 34 + rnd() * 14 }); }
    const m = 3 + (rnd() * 3 | 0);
    for (let i = 0; i < m; i++) { const t = (i + 0.5) / m; puffs.push({ x: x0 + span * 0.15 + t * span * 0.7 + (rnd() - 0.5) * 24, y: base - 62 - rnd() * 22 - Math.sin(t * 3.14) * 24, r: 40 + rnd() * 16 + Math.sin(t * 3.14) * 14 }); }
    for (let i = 0; i < 1 + (rnd() * 2 | 0); i++) puffs.push({ x: ox + 256 + (rnd() - 0.5) * span * 0.35, y: base - 118 - rnd() * 26, r: 40 + rnd() * 16 });
    for (const p of puffs.slice()) if (p.r > 38) for (let k = 0; k < 2; k++) {                // small secondary bumps break the 'stacked balls' silhouette
      const a = -2.6 + rnd() * 2.0; puffs.push({ x: p.x + Math.cos(a) * p.r * 0.78, y: p.y + Math.sin(a) * p.r * 0.78, r: p.r * (0.32 + rnd() * 0.16) }); }
    puffs.sort((p, q) => q.y - p.y);                                                        // low puffs first; higher puffs overlap them
    g.save(); g.beginPath(); g.rect(ox, oy, 512, base - oy); g.clip();
    for (const p of puffs) {
      const hgt = clamp01((base - p.y) / 150);
      const outer = hgt > 0.35 ? mixHex(PAL.cloud.mid, PAL.cloud.warm, (hgt - 0.35) * 0.9) : mixHex(PAL.cloud.shade, PAL.cloud.mid, hgt / 0.35);   // soft internal edges up top, defined base below
      const inner = mixHex(PAL.cloud.mid, PAL.cloud.lit, 0.35 + 0.65 * hgt);
      const gr = g.createRadialGradient(p.x - p.r * 0.38, p.y - p.r * 0.42, p.r * 0.05, p.x - p.r * 0.12, p.y - p.r * 0.12, p.r * 1.02);
      gr.addColorStop(0, PAL.cloud.lit); gr.addColorStop(0.35, inner); gr.addColorStop(0.72, mixHex(inner, PAL.cloud.warm, 0.4)); gr.addColorStop(1, outer);
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
    }
    g.globalCompositeOperation = 'source-atop';
    const bg = g.createLinearGradient(0, base - 46, 0, base); bg.addColorStop(0, css(PAL.cloud.core, 0)); bg.addColorStop(1, css(PAL.cloud.core, 0.55));
    g.fillStyle = bg; g.fillRect(ox, base - 46, 512, 46);
    g.globalCompositeOperation = 'source-over'; g.restore();
  }
  // soften only the silhouette: blur alpha, keep colour (transparent pixels get the shade colour first)
  const img = g.getImageData(0, 0, W, H), d = img.data, A = new Float32Array(W * H), sh = rgb(PAL.cloud.shade);
  for (let i = 0; i < W * H; i++) { A[i] = d[i * 4 + 3] / 255; if (d[i * 4 + 3] === 0) { d[i * 4] = sh[0]; d[i * 4 + 1] = sh[1]; d[i * 4 + 2] = sh[2]; } }
  blur(A, W, H, 1, 2);
  for (let i = 0; i < W * H; i++) d[i * 4 + 3] = A[i] * 255;
  g.putImageData(img, 0, 0);
  const t = texFrom(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Registry
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * kind: 'color' (tileable sRGB) | 'data' (tileable mask) | 'sprite' (clamped)
 * world: world units covered by one repeat, as used in the tuned frame (set UVs = worldPos / world)
 */
const RECIPES = {
  grass:     { build: texGrass,     kind: 'color',  size: 512, world: 6.25, reads: 'lawn: soft clumps with sunlit blade tips' },
  dirt:      { build: texDirt,      kind: 'color',  size: 512, world: 3.3,  reads: 'packed earth path, a few pebbles, hairline cracks' },
  stone:     { build: texStone,     kind: 'color',  size: 512, world: 1.6,  reads: 'rounded coursed rubble with moss' },
  cobble:    { build: texCobble,    kind: 'color',  size: 512, world: 2.2,  reads: 'rounded cobbles in dark earth' },
  wood:      { build: texWood,      kind: 'color',  size: 256, world: 1.2,  reads: 'vertical planks, grain, knots (tint it)' },
  thatch:    { build: texThatch,    kind: 'color',  size: 512, world: 2.6,  reads: 'layered straw courses' },
  tile:      { build: texTile,      kind: 'color',  size: 512, world: 2.2,  reads: 'overlapping terracotta pantiles' },
  plaster:   { build: texPlaster,   kind: 'color',  size: 256, world: 2.4,  reads: 'warm mottled lime-wash' },
  water:     { build: texWater,     kind: 'color',  size: 256, world: 7,    reads: 'bright blue with painted ripples (scroll offset)' },
  sand:      { build: texSand,      kind: 'color',  size: 512, world: 4.0,  reads: 'warm dune sand with wind ripples' },
  snow:      { build: texSnow,      kind: 'color',  size: 512, world: 4.0,  reads: 'bright crust, lavender hollows, sparkles' },
  brick:     { build: texBrick,     kind: 'color',  size: 512, world: 1.8,  reads: 'running-bond chunky red brick' },
  bark:      { build: texBark,      kind: 'color',  size: 512, world: 1.4,  reads: 'ridged bark plates over dark furrows' },
  noise:     { build: texNoise,     kind: 'data',   size: 256, world: 59,   reads: 'macro fbm, RGB = 3 independent scales' },
  grassMask: { build: texGrassMask, kind: 'data',   size: 512, world: 6.25, reads: 'R clumps, G tips, B mottling' },
  dirtMask:  { build: texDirtMask,  kind: 'data',   size: 512, world: 3.3,  reads: 'R pebble tops, G shadows + cracks, B streaks' },
  tuft:      { build: texTuft,      kind: 'sprite', size: 128, world: 0.9,  reads: 'grass tuft card (alphaTest 0.5)' },
  flower:    { build: texFlower,    kind: 'sprite', size: 64,  world: 0.34, reads: 'white 5-petal flower (tint per instance)' },
  blob:      { build: texBlob,      kind: 'sprite', size: 128, world: 1,    reads: 'soft round contact shadow' },
  clouds:    { build: texClouds,    kind: 'sprite', size: 1024, world: 0,   reads: '2x2 cumulus atlas (512x256 cells)' },
};

/** Clothes, awnings, bunting: keyed by parameters so each variant is built once. */
function cloth(base = PAL.cloth.cream, { stripe = null, scallop = false, S = 128 } = {}) {
  const key = `tex:cloth:${base}:${stripe || '-'}:${scallop ? 1 : 0}:${S}`;
  return Assets.texture(key, () => { const t = texCloth(base, { stripe, scallop, S }); t.name = key; return t; });
}

function get(name) {
  const r = RECIPES[name];
  if (!r) { reportError('Tex.get', new Error(`unknown texture "${name}"`)); return Assets.texture('tex:__missing', () => texFrom(mkCanvas(1))); }
  return Assets.texture('tex:' + name, () => {
    const t0 = performance.now();
    const t = r.build();
    t.name = 'tex:' + name;
    t.userData.worldSize = r.world;
    t.userData.kind = r.kind;
    BUILD_MS[name] = Math.round(performance.now() - t0);
    return t;
  });
}
const BUILD_MS = {};

export const Tex = {
  RECIPES,
  get,
  cloth,
  grass: () => get('grass'), dirt: () => get('dirt'), stone: () => get('stone'), cobble: () => get('cobble'),
  wood: () => get('wood'), thatch: () => get('thatch'), tile: () => get('tile'), plaster: () => get('plaster'),
  water: () => get('water'), sand: () => get('sand'), snow: () => get('snow'), brick: () => get('brick'), bark: () => get('bark'),
  noise: () => get('noise'), grassMask: () => get('grassMask'), dirtMask: () => get('dirtMask'),
  tuft: () => get('tuft'), flower: () => get('flower'), blob: () => get('blob'), clouds: () => get('clouds'),
  /** World units covered by one repeat of a named texture (UV = worldPos / worldSize). */
  worldSize(name) { return RECIPES[name] ? RECIPES[name].world : 1; },
  /** Names of the tileable colour textures (the 13 materials; cloth is parameterised). */
  materials() { return Object.keys(RECIPES).filter(k => RECIPES[k].kind === 'color'); },
  list() { return Object.keys(RECIPES); },
  /** Build several up front (e.g. behind a loading fade) so the first frame of a map doesn't hitch. */
  prewarm(names = Object.keys(RECIPES)) { for (const n of names) get(n); return Object.assign({}, BUILD_MS); },
  /** {name: {built, ms, kind, size, world}} */
  info() {
    const o = {};
    for (const [k, r] of Object.entries(RECIPES)) o[k] = { built: Assets.has('texture', 'tex:' + k), ms: BUILD_MS[k] ?? null, kind: r.kind, size: r.size, world: r.world };
    return o;
  },
  /** PNG data URL of a texture's canvas (debug / critics). */
  dump(nameOrTex) {
    try {
      const t = typeof nameOrTex === 'string' ? get(nameOrTex) : nameOrTex;
      return t && t.image && t.image.toDataURL ? t.image.toDataURL('image/png') : null;
    } catch (e) { reportError('Tex.dump', e); return null; }
  },
};

export default Tex;
