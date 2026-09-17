/**
 * assets.js — memoised geometry / material / canvas / canvas-texture cache.        (F1, owner: src/engine/assets.js)
 *
 * Everything in this game is procedural, so "loading" = building once and sharing. Share aggressively: the draw
 * call and memory budgets (ARCHITECTURE rule 4) depend on it.
 *
 *   import { Assets } from './engine/assets.js';
 *
 *   Assets.geometry(key, () => new THREE.IcosahedronGeometry(1, 1))    build once per key, then shared
 *   Assets.material(key, () => Toon.make(...))
 *   Assets.canvas(key, w, h, (ctx, w, h, canvas) => { ...draw... })   -> HTMLCanvasElement (shared)
 *   Assets.canvasTexture(key, { w, h, draw, data?, repeat?, wrap?, filter?, mipmaps?, anisotropy?, flipY? })
 *        draw(ctx, w, h, canvas)   paint it
 *        data: true                mask/noise texture -> NoColorSpace; default false -> SRGBColorSpace (ART-DIRECTION §3)
 *        wrap: 'repeat'|'clamp'|'mirror' (default 'repeat')   repeat: [u, v]   filter: 'linear'|'nearest'
 *        mipmaps: default true     anisotropy: default 4
 *   Assets.texture(key, () => someTexture)                             any other texture
 *   Assets.memo(kind, key, build)                                      any other shareable value
 *
 *   Primitive shortcuts (memoised by their parameters):
 *   Assets.box(w,h,d)  Assets.sphere(r, ws=24, hs=16)  Assets.icosa(r, detail=1)  Assets.plane(w,h,ws=1,hs=1)
 *   Assets.cylinder(rt, rb, h, rs=16)  Assets.cone(r, h, rs=16)  Assets.capsule(r, len, cs=6, rs=12)
 *   Assets.circle(r, segs=24)  Assets.torus(r, tube, rs=12, ts=24)
 *
 *   Assets.has(kind, key)  Assets.peek(kind, key)
 *   Assets.dispose(kind?, keyOrPrefix?)   free GPU memory for cached entries (all, one kind, or key prefix)
 *   Assets.disposeObject(object3d)        dispose a subtree's NON-shared geometries/materials/textures (scene exit)
 *   Assets.stats()                        {geometries, materials, textures, canvases, other, hits, misses, buildMs}
 *
 * Cached resources are tagged `userData.shared = true`; disposeObject skips them, so a scene can tear itself down
 * without breaking another scene that shares a material. Keys are strings; build a key from parameters, e.g.
 * `tree-canopy:${detail}`. A build that throws is reported to __DQ.errors and returns a harmless fallback (an empty
 * geometry, a plain material, a 1x1 texture) so callers never crash.
 */
import * as THREE from 'three';
import { reportError } from './debug.js';

const KINDS = ['geometry', 'material', 'texture', 'canvas', 'other'];
const caches = Object.fromEntries(KINDS.map(k => [k, new Map()]));
const counters = { hits: 0, misses: 0, buildMs: 0 };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function tagShared(v) {
  try { if (v && typeof v === 'object' && v.userData) v.userData.shared = true; } catch (_) {}
  return v;
}

function fallbackFor(kind) {
  switch (kind) {
    case 'geometry': return new THREE.BufferGeometry();
    case 'material': return new THREE.MeshBasicMaterial();
    case 'texture': {
      const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
      t.needsUpdate = true;
      return t;
    }
    case 'canvas': {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas'); c.width = c.height = 1; return c;
    }
    default: return null;
  }
}

function memo(kind, key, build) {
  const cache = caches[kind] || caches.other;
  const k = String(key);
  if (cache.has(k)) { counters.hits++; return cache.get(k); }
  counters.misses++;
  const t0 = now();
  let v;
  try {
    v = build();
    if (v === undefined || v === null) throw new Error('builder returned nothing');
  } catch (e) {
    reportError(`Assets.${kind}("${k}")`, e);
    v = fallbackFor(kind);
  }
  counters.buildMs += now() - t0;
  tagShared(v);
  cache.set(k, v);
  return v;
}

const WRAP = { repeat: THREE.RepeatWrapping, clamp: THREE.ClampToEdgeWrapping, mirror: THREE.MirroredRepeatWrapping };

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return c;
}

function disposeValue(kind, v) {
  try {
    if (!v) return;
    if (kind === 'canvas') { v.width = v.height = 0; return; }
    if (typeof v.dispose === 'function') v.dispose();
  } catch (e) { reportError('Assets.dispose', e); }
}

const f = (n) => (Number.isFinite(+n) ? +(+n).toFixed(4) : 0); // stable numeric key part

export const Assets = {
  memo(kind, key, build) { return memo(kind, key, build); },
  geometry(key, build) { return memo('geometry', key, build); },
  material(key, build) { return memo('material', key, build); },
  texture(key, build) { return memo('texture', key, build); },

  canvas(key, w, h, draw) {
    return memo('canvas', key, () => {
      const c = makeCanvas(w, h);
      const ctx = c.getContext('2d');
      if (typeof draw === 'function') draw(ctx, c.width, c.height, c);
      return c;
    });
  },

  canvasTexture(key, opts = {}) {
    return memo('texture', key, () => {
      const { w = 256, h = 256, draw, data = false, repeat, wrap = 'repeat', filter = 'linear', mipmaps = true,
        anisotropy = 4, flipY } = opts;
      const c = makeCanvas(w, h);
      const ctx = c.getContext('2d');
      if (typeof draw === 'function') draw(ctx, c.width, c.height, c);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = WRAP[wrap] || THREE.RepeatWrapping;
      if (Array.isArray(repeat)) tex.repeat.set(repeat[0], repeat[1] ?? repeat[0]);
      if (filter === 'nearest') { tex.magFilter = THREE.NearestFilter; tex.minFilter = mipmaps ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter; }
      else { tex.magFilter = THREE.LinearFilter; tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; }
      tex.generateMipmaps = !!mipmaps;
      tex.anisotropy = anisotropy;
      if (flipY !== undefined) tex.flipY = !!flipY;
      tex.name = String(key);
      tex.needsUpdate = true;
      return tex;
    });
  },

  // ── primitive shortcuts ──
  box(w = 1, h = 1, d = 1) { return memo('geometry', `box:${f(w)},${f(h)},${f(d)}`, () => new THREE.BoxGeometry(w, h, d)); },
  sphere(r = 1, ws = 24, hs = 16) { return memo('geometry', `sphere:${f(r)},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)); },
  icosa(r = 1, detail = 1) { return memo('geometry', `icosa:${f(r)},${detail}`, () => new THREE.IcosahedronGeometry(r, detail)); },
  plane(w = 1, h = 1, ws = 1, hs = 1) { return memo('geometry', `plane:${f(w)},${f(h)},${ws},${hs}`, () => new THREE.PlaneGeometry(w, h, ws, hs)); },
  cylinder(rt = 1, rb = 1, h = 1, rs = 16) { return memo('geometry', `cyl:${f(rt)},${f(rb)},${f(h)},${rs}`, () => new THREE.CylinderGeometry(rt, rb, h, rs)); },
  cone(r = 1, h = 1, rs = 16) { return memo('geometry', `cone:${f(r)},${f(h)},${rs}`, () => new THREE.ConeGeometry(r, h, rs)); },
  capsule(r = 0.5, len = 1, cs = 6, rs = 12) { return memo('geometry', `capsule:${f(r)},${f(len)},${cs},${rs}`, () => new THREE.CapsuleGeometry(r, len, cs, rs)); },
  circle(r = 1, segs = 24) { return memo('geometry', `circle:${f(r)},${segs}`, () => new THREE.CircleGeometry(r, segs)); },
  torus(r = 1, tube = 0.3, rs = 12, ts = 24) { return memo('geometry', `torus:${f(r)},${f(tube)},${rs},${ts}`, () => new THREE.TorusGeometry(r, tube, rs, ts)); },

  has(kind, key) { return !!(caches[kind] && caches[kind].has(String(key))); },
  peek(kind, key) { return caches[kind] ? caches[kind].get(String(key)) : undefined; },

  dispose(kind, keyOrPrefix) {
    const kinds = kind ? [kind] : KINDS;
    let n = 0;
    for (const k of kinds) {
      const cache = caches[k];
      if (!cache) continue;
      for (const [key, v] of Array.from(cache)) {
        if (keyOrPrefix !== undefined && !(key === keyOrPrefix || key.startsWith(String(keyOrPrefix)))) continue;
        disposeValue(k, v);
        cache.delete(key);
        n++;
      }
    }
    return n;
  },

  disposeObject(root) {
    if (!root || typeof root.traverse !== 'function') return 0;
    let n = 0;
    const seen = new Set();
    const texKeys = ['map', 'alphaMap', 'aoMap', 'bumpMap', 'normalMap', 'emissiveMap', 'gradientMap', 'lightMap', 'specularMap', 'roughnessMap', 'metalnessMap', 'displacementMap'];
    try {
      root.traverse((o) => {
        if (o.isLight && typeof o.dispose === 'function') { o.dispose(); n++; } // frees shadow-map render targets
        const g = o.geometry;
        if (g && !seen.has(g) && !(g.userData && g.userData.shared)) { seen.add(g); g.dispose(); n++; }
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) {
          if (!m || seen.has(m) || (m.userData && m.userData.shared)) continue;
          seen.add(m);
          for (const tk of texKeys) {
            const t = m[tk];
            if (t && !seen.has(t) && !(t.userData && t.userData.shared)) { seen.add(t); t.dispose(); n++; }
          }
          m.dispose(); n++;
        }
      });
    } catch (e) { reportError('Assets.disposeObject', e); }
    return n;
  },

  stats() {
    return { geometries: caches.geometry.size, materials: caches.material.size, textures: caches.texture.size,
      canvases: caches.canvas.size, other: caches.other.size, hits: counters.hits, misses: counters.misses,
      buildMs: Math.round(counters.buildMs) };
  },
};
