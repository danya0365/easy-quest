/**
 * props.js — set dressing: the MIXED WOODLAND (oak, birch, pine, fruit, round, blossom, poplar, bush, hedgerow,
 * chestnut), rocks, fences, stiles, signposts, wells, lanterns, hay, scarecrows, kitchen gardens, barrels, crates,
 * woodpiles, benches, ladders, washing lines, bridges, reeds, lily pads, flowers, tufts — and the LIFE that moves:
 * wind sway, butterflies, ground birds that take off when you come near, pollen motes, pond ripples, instanced
 * critters. Plus THE KIT CORE every other recipe module builds into.       (P04, owner: src/art/props.js)
 *
 * Recipes are docs/ART-DIRECTION.md §12-14 expressed ONLY through F3's foundation (PAL, Tex, makeToon, Toon hulls,
 * AO masks). Signatures are a contract maps rely on.
 *
 * Standalone:  M4 boxUV scaleUV wrapUV prep hashJ (geometry helpers) · canopyGeometry(blobs, dark, light, detail,
 *              spherize) · bridgeFrame({cx, cz, dir, L, W, arch, y0}) · forestCardAtlas() · barkPatch
 *              OAK POPLAR BUSH BUSH2 EDGE CHESTNUT BIRCH FRUIT ROUND BLOSSOM HEDGE HEDGE2   (canopy blob layouts)
 *              SPECIES                     every plantable species: {blobs|pine, detail, spherize, trunk, dark,
 *                                          light, ink, wind, windBase, collide, aoR, sizeK, ...}
 *              speciesBounds(kindOrDef)    {cy, R} at scale 1 — colliders, occluders, see-through
 *              ringPlacements({pointAt, rows, clear, seed}) -> {trees, cards}    a map's woodland rim, as DATA
 *
 * THE TREES — one geometry per species per LOD, laid out as [canopy][trunk][shadow proxy]. The colour pass draws
 * canopy + trunk (the trunk's vertices carry aBark = 1 and sample the bark texture through barkPatch, so leaves and
 * bark share ONE material) and the shadow pass draws trunk + proxy; the draw range is swapped in onBeforeRender /
 * onBeforeShadow. Instances are culled and LOD-picked PER INSTANCE every frame (near / mid / far), so a wood of ten
 * species in three staggered rows costs ~4 draw calls per species instead of ~5 per clump — the meadow's whole rim
 * plus its own trees is ~40 calls where the old chunked forest was ~180.
 *
 * GROUNDING (the rule every recipe here obeys) — set dressing must sit IN the field, not on top of it:
 *   1. feet reach the LOWEST ground under their own footprint (kit.lowestAt), so no post, picket, leg or roof
 *      support ever ends in mid-air on a slope, and a run of fence follows the ground post by post and bay by bay;
 *   2. everything that stands gets a soft contact POOL (kit.contact) — ONE InstancedMesh for the whole map, each
 *      quad laid flat on the local slope so it can neither clip through nor z-fight the grass. The pool reaches
 *      PAST the prop's own footprint (POOL.spread), leans away from the sun (POOL.lean) and MULTIPLIES the ground
 *      instead of alpha-blending a flat dark green over it. Before that it was exactly footprint-sized, hidden
 *      under its own prop, and every crate, barrel, well and fence post met the grass with a hard bright seam;
 *   3. earth beds (flower beds, kitchen gardens) are DRAPED over the terrain, never one flat card.
 *
 * THE KIT CORE — createPropsKit({scene, heightAt, ao, low}) -> kit   (src/world/scenery.js createKit adds the
 * terrain, building and sky recipes on top; maps call createKit). The contract other recipe modules may rely on:
 *   kit.scene kit.heightAt kit.ao kit.low kit.counts{} kit.focus     kit.animators.push(fn(t, dt, camera))
 *   kit.addTo(bucket, geo, matrix, hex)                 merge into a per-material bucket, drawn by kit.flush()
 *                                                       buckets: stone plaster wood thatch tile brick bark
 *                                                       dirtbed paint · glow (unshaded, lights up at night)
 *   kit.lowestAt(x, z, r, n) / kit.normalAt(x, z, h)    the grounding samplers
 *   kit.contact(x, z, r, strength, {rx, rz, rot, lift, spread, lean})   a contact POOL, merged by kit.flush()
 *   kit.plant(x, z, r, {ao, aoS, blob, blobS, rot})     AO mask + contact pool in one call
 *   kit.setSun(dir) / kit.pools({spread, lean, cap, near, far})         which way pools lean, and how far they reach
 *   kit.footBox(x, z, w, d, rot, pad) / kit.footDisc(x, z, r) / kit.blocked(x, z)   tufts and flowers stay out
 *   kit.seeSurface(texName, opts)                       a textured toon material the camera pass may fade
 *   kit.seeMode('auto'|'ghost'|'off') / kit.seeTune({alpha, outMs, inMs}) / kit.seeState / kit.clearSee()
 *   kit.update(t, dt, camera, focus)                    the see-through pass + grove culling + animators
 *   kit.flush()                                         build the grove, merge every bucket into one mesh per material
 *
 * Prop recipes on the kit:
 *   trees(list, {shade, species})    plant [{kind, x, z, s, r, c, tint, sx, sz, sy}] — THE mixed-woodland call
 *   forest(name, blobs, list, opts)  the older single-species call (still supported, now backed by the grove)
 *   forestRing({pointAt, rows, clear, shade, sunDir})   hedgerow + staggered mixed rows + painted hills behind
 *   cards(list, {sunDir, shade})     painted treetop clumps (the wooded hills beyond the playable edge)
 *   forestBelt(...) groveState()
 *   rock fence picket stile well hayBale lantern scarecrow vegPatch ladder barrel crate appleCrate bench woodpile
 *   flowerBed signAtlas useSignAtlas signpost footbridge laundry reeds lilyPads tufts flowers
 *   butterflies groundBirds motes ripples critters
 *   lantern() also registers a warm halo that fades in at dusk/night (one additive instanced mesh, ENV-driven)
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, css, rgb, lerp, smooth, clamp01, mixHex } from './palette.js';
import { Tex, mulberry, vnoise, mkCanvas, ctx2 } from './tex.js';
import { Toon, makeToon, outlineMaterial, hullGeometry, spherizeNormals, normalsUp, OUTLINE, TOON_PRESETS, See, SUN_DIR } from './toon.js';
import { ENV } from './weather.js';
import { Font } from '../ui/font.js';
import { reportError } from '../engine/debug.js';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// geometry helpers
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const M4 = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s));

/** Box whose UVs are in world units / s on every face (so textures keep their scale). */
export function boxUV(w, h, d, s = 1, segs = [1, 1, 1]) {
  const g = new THREE.BoxGeometry(w, h, d, ...segs), uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [U, V] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, uv.getX(i) * U / s, uv.getY(i) * V / s);
  }
  return g;
}
export function scaleUV(g, s) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / s, uv.getY(i) / s); return g; }
/** Lathe/cylinder: an INTEGER number of repeats around (no seam) and V = height / worldSize. */
export function wrapUV(g, uRepeats, vScale) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(uRepeats)), uv.getY(i) * vScale); return g; }

/** Non-indexed copy with only position/normal/uv plus a flat vertex colour — mergeable into a bucket. */
export function prep(geo, color = PAL.mask.on) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = C3(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// foliage (ART-DIRECTION §12): merged icosphere blobs, spherized normals, vertex gradient, hull, proxy shadow
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const OAK = [[0, 2.75, 0, 1.3], [1.0, 2.35, 0.3, 0.88], [-0.9, 2.4, 0.45, 0.88], [0.1, 2.3, -1.0, 0.9], [0.45, 2.2, 0.95, 0.8], [0.35, 3.6, 0.2, 0.85], [-0.5, 3.35, -0.3, 0.78]];
export const POPLAR = [[0, 2.0, 0, 0.85], [0.1, 2.9, 0.05, 0.8], [-0.05, 3.7, 0, 0.66], [0, 4.35, 0.05, 0.46], [0.45, 2.4, 0.3, 0.55], [-0.45, 2.6, -0.25, 0.55]];
export const BUSH = [[0, 0.5, 0, 0.66], [0.62, 0.36, 0.15, 0.48], [-0.58, 0.38, 0.1, 0.5], [0.05, 0.4, 0.58, 0.45]];
/** A woodland-edge crown: one broad dome, fuller at the shoulders, so a row of them closes into one scalloped wall. */
export const EDGE = [[0, 2.95, 0, 1.45], [1.2, 2.55, 0.2, 1.02], [-1.15, 2.6, 0.3, 1.0], [0.15, 2.5, -1.1, 1.0], [0.1, 2.45, 1.1, 0.95], [0.1, 3.85, 0.0, 1.02]];
export const CHESTNUT = [[0, 3.3, 0, 1.55], [1.3, 2.8, 0.35, 1.05], [-1.2, 2.9, 0.5, 1.05], [0.15, 2.7, -1.25, 1.08], [0.55, 2.6, 1.2, 0.95], [0.45, 4.35, 0.25, 1.0], [-0.65, 4.0, -0.4, 0.95], [-1.35, 3.6, -0.6, 0.7], [1.4, 3.8, -0.5, 0.72]];

export function canopyGeometry(blobs, dark, light, detail = 1, spherize = 0.6) {
  let cx = 0, cy = 0, cz = 0, ws = 0; for (const b of blobs) { cx += b[0] * b[3]; cy += b[1] * b[3]; cz += b[2] * b[3]; ws += b[3]; } cx /= ws; cy /= ws; cz /= ws;
  let R = 0; for (const b of blobs) R = Math.max(R, Math.hypot(b[0] - cx, b[1] - cy, b[2] - cz) + b[3]);
  const cd = C3(dark), cl = C3(light), tmp = new THREE.Color(), v = new THREE.Vector3();
  const parts = blobs.map(([x, y, z, r, d]) => {
    const g = new THREE.IcosahedronGeometry(r, d ?? detail); g.translate(x, y, z);
    const p = g.attributes.position, cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const t = smooth(-0.85, 0.9, (v.y - cy) / R), dd = Math.hypot(v.x - cx, v.y - cy, v.z - cz) / R;
      tmp.copy(cd).lerp(cl, t).multiplyScalar(lerp(0.6, 1.0, smooth(0.3, 0.92, dd)));
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.deleteAttribute('uv');
    return g;
  });
  // Drop faces buried inside a neighbouring blob: invisible (the union's surface hides them, and the inverted hull's
  // copy is inside the canopy too) but they cost triangles on every instance. A face goes only when all three corners
  // sit well inside another blob, so the silhouette and every visible scallop stay exactly the same.
  const trimmed = parts.map((g, bi) => {
    const p = g.attributes.position, keep = [];
    const inside = (x, y, z) => blobs.some((b, j) => j !== bi && Math.hypot(x - b[0], y - b[1], z - b[2]) < b[3] * 0.9);
    for (let f = 0; f < p.count; f += 3) {
      if (inside(p.getX(f), p.getY(f), p.getZ(f)) && inside(p.getX(f + 1), p.getY(f + 1), p.getZ(f + 1)) && inside(p.getX(f + 2), p.getY(f + 2), p.getZ(f + 2))) continue;
      keep.push(f);
    }
    if (keep.length * 3 === p.count) return g;
    const out = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const n = attr.itemSize, arr = new Float32Array(keep.length * 3 * n);
      keep.forEach((f, k) => { for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) arr[(k * 3 + v) * n + c] = attr.array[(f + v) * n + c]; });
      out.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    return out;
  });
  return spherizeNormals(mergeGeometries(trimmed), new THREE.Vector3(cx, cy, cz), spherize);
}
function trunkGeometry(h = 1.6, flare = 1) {
  const pts = [[0.36 * flare, 0], [0.24 * flare, 0.2], [0.18, 0.6], [0.16, h * 0.8], [0.12, h]].map(([r, y]) => new THREE.Vector2(r, y));
  return wrapUV(new THREE.LatheGeometry(pts, 10), 1, h / Tex.worldSize('bark'));
}
const SHADOW_PROXY_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
export const hashJ = (i, s) => { let h = Math.imul(i + 1, 374761393) ^ Math.imul(s, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/**
 * The walkable frame of an arched footbridge: pure maths, no meshes (collision needs it before any art exists).
 * Centre (cx, cz), yaw `dir` (atan2(dx, dz) convention), length L, width W, arch height, end height y0.
 */
export function bridgeFrame({ cx, cz, dir, L = 6.4, W = 2.4, arch = 0.55, y0 = 0 }) {
  const ax = Math.sin(dir), az = Math.cos(dir), sx = az, sz = -ax;
  const archY = (u) => y0 + arch * (1 - Math.pow(2 * u / L, 2));
  const local = (x, z) => { const dx = x - cx, dz = z - cz; return { u: dx * ax + dz * az, v: dx * sx + dz * sz }; };
  const posts = [-L / 2 + 0.25, -L / 6, L / 6, L / 2 - 0.25];
  const world = (u, v) => [cx + ax * u + sx * v, cz + az * u + sz * v];
  const rails = [-1, 1].map(side => [world(posts[0], side * (W / 2 - 0.08)), world(posts[posts.length - 1], side * (W / 2 - 0.08))]);
  return {
    cx, cz, dir, L, W, arch, y0, ax, az, sx, sz, archY, local, posts, rails,
    ends: [world(-L / 2, 0), world(L / 2, 0)],
    deckY(x, z) { const { u, v } = local(x, z); if (Math.abs(u) > L / 2 || Math.abs(v) > W / 2) return null; return archY(u); },
    corridor(x, z, pad = 0.2) { const { u, v } = local(x, z); return Math.abs(u) <= L / 2 + pad && Math.abs(v) <= W / 2; },
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// SPECIES — the mixed woodland (ART-DIRECTION §12, extended). A tree is ONE geometry with three ranges in order:
//   [canopy][trunk][shadow proxy]
// The colour pass draws [canopy + trunk], the shadow pass [trunk + proxy] — the draw range is swapped in
// onBeforeRender / onBeforeShadow, so a whole species costs ~2 colour calls + 1 shadow call + 1 ink hull, no
// matter how many clumps it is scattered in. Leaves are vertex coloured; trunks sample the bark texture through
// the per-vertex `aBark` flag, so canopy and trunk share one material (and one draw call).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Airy, slightly asymmetric crown high on a slim white stem. */
export const BIRCH = [[0.12, 2.95, 0.02, 0.70], [-0.50, 3.40, 0.22, 0.58], [0.52, 3.58, -0.18, 0.56], [0.02, 4.15, 0.10, 0.62],
  [-0.18, 4.72, -0.08, 0.44], [0.40, 2.60, 0.42, 0.48], [-0.42, 2.72, -0.42, 0.50], [0.30, 4.45, 0.34, 0.34]];
/** Low, wide, heavy with fruit (apples are merged into the canopy: no extra draw call). */
export const FRUIT = [[0, 2.30, 0, 1.12], [0.92, 2.00, 0.22, 0.78], [-0.88, 2.05, 0.30, 0.80], [0.10, 1.95, -0.90, 0.80],
  [0.32, 1.92, 0.86, 0.74], [0.10, 3.00, 0.08, 0.78]];
/** The lollipop tree: one round ball on a slim trunk (DQ village standard). */
export const ROUND = [[0, 2.75, 0, 1.00], [0.52, 2.50, 0.22, 0.62], [-0.48, 2.55, -0.20, 0.64], [0.06, 3.30, 0.04, 0.66], [-0.10, 2.45, 0.50, 0.55]];
/** Spring blossom — pink, a little wider than round. */
export const BLOSSOM = [[0, 2.45, 0, 1.08], [0.90, 2.15, 0.25, 0.74], [-0.86, 2.20, 0.30, 0.74], [0.10, 2.12, -0.86, 0.76],
  [0.25, 3.15, 0, 0.74], [-0.40, 2.95, -0.45, 0.55]];
/** A ~3.4-unit length of hedgerow: lumpy, waist high, laid end to end along a field boundary. */
export const HEDGE = [[-1.15, 0.55, 0, 0.62], [0, 0.72, 0.05, 0.70], [1.10, 0.58, -0.05, 0.64], [-0.58, 0.50, 0.30, 0.50], [0.62, 0.52, -0.30, 0.50]];
/** A taller, shaggier length of hedgerow with a bulge at one end — alternated with HEDGE so a run never clones. */
export const HEDGE2 = [[-1.18, 0.60, 0.08, 0.58], [-0.34, 0.86, -0.06, 0.66], [0.46, 0.62, 0.12, 0.56], [1.14, 0.80, -0.04, 0.68],
  [0.08, 0.44, 0.34, 0.46]];
/** A second bush: two lopsided lobes with a low skirt, so a scatter of bushes is never one shape repeated. */
export const BUSH2 = [[-0.16, 0.54, 0.05, 0.60], [0.44, 0.40, -0.16, 0.46], [0.08, 0.30, 0.46, 0.40], [0.06, 0.76, 0.02, 0.32]];

const F = PAL.foliage;
/**
 * Every species the maps may plant. `detail` is the middle LOD (near = +1, far = -1, picked per instance per frame).
 * trunk: {h, flare, thin, birch} · fruit: how many apples · pine: tiered conifer instead of blobs.
 */
export const SPECIES = {
  oak:      { blobs: OAK, detail: 1, spherize: 0.72, trunk: { h: 1.7 }, collide: 0.34, dark: F.dark, light: F.sun, windBase: 1.6, wind: 0.018, aoR: 1.9, aoS: 0.65, foot: 0.55 },
  edge:     { blobs: EDGE, detail: 1, spherize: 0.72, trunk: { h: 1.9 }, collide: 0.36, dark: F.dark, light: F.sun, windBase: 1.7, wind: 0.018, aoR: 2.5, aoS: 0.7, foot: 0.6 },
  poplar:   { blobs: POPLAR, detail: 1, spherize: 0.6, trunk: { h: 1.3, thin: 0.85 }, collide: 0.3, dark: F.dark, light: F.light, windBase: 1.4, wind: 0.02, aoR: 1.5, aoS: 0.6, foot: 0.45 },
  chestnut: { blobs: CHESTNUT, detail: 2, spherize: 0.72, trunk: { h: 2.2, flare: 1.2 }, collide: 0.6, dark: F.dark, light: F.sun, windBase: 2.0, wind: 0.015, aoR: 2.4, aoS: 0.7, foot: 0.7, nearTier: false },
  birch:    { blobs: BIRCH, detail: 1, spherize: 0.55, trunk: { h: 3.0, thin: 0.6, birch: true }, collide: 0.22, dark: mixHex(F.mid, F.dark, 0.45), light: mixHex(F.sun, PAL.flower.yellow, 0.22), windBase: 2.2, wind: 0.026, aoR: 1.5, aoS: 0.55, foot: 0.4 },
  pine:     { pine: true, detail: 1, trunk: { h: 1.05, thin: 0.8 }, collide: 0.45, sizeK: 0.84, dark: mixHex(F.dark, PAL.hill.midLow, 0.2), light: mixHex(F.poplar, F.light, 0.62), windBase: 1.2, wind: 0.01, aoR: 1.8, aoS: 0.68, foot: 0.5 },
  fruit:    { blobs: FRUIT, detail: 1, spherize: 0.7, trunk: { h: 1.25, flare: 1.1 }, fruit: 15, collide: 0.32, dark: mixHex(F.dark, F.mid, 0.22), light: mixHex(F.light, F.sun, 0.5), windBase: 1.3, wind: 0.02, aoR: 1.8, aoS: 0.66, foot: 0.5 },
  round:    { blobs: ROUND, detail: 1, spherize: 0.78, trunk: { h: 2.0, thin: 0.7 }, collide: 0.26, dark: mixHex(F.dark, F.bush, 0.6), light: F.sun, windBase: 1.9, wind: 0.022, aoR: 1.5, aoS: 0.6, foot: 0.4 },
  blossom:  { blobs: BLOSSOM, detail: 1, spherize: 0.76, trunk: { h: 1.6, thin: 0.8 }, collide: 0.28, dark: mixHex(PAL.cloth.pink, PAL.tile.dark, 0.3), light: mixHex(PAL.flower.pink, PAL.plaster.light, 0.45), ink: PAL.outline.prop, windBase: 1.5, wind: 0.024, aoR: 1.7, aoS: 0.6, foot: 0.45 },
  // bush / hedge: LOW things whose whole job is to sit in the grass. They cast a real sun shadow (a squat proxy) and
  // take a tight contact blob, or they read as hard-outlined stickers pasted on a lawn. Their ink is thinner than a
  // canopy's, so a chain of them never draws its neighbours' outlines across its own face.
  bush:     { blobs: BUSH, detail: 1, spherize: 0.6, trunk: null, shadow: true, hull: 0.022, collide: 0.62, dark: mixHex(F.dark, PAL.outline.leaf, 0.3), light: F.light, windBase: 0.15, wind: 0.03, aoR: 1.25, aoS: 0.62, blobR: 0.82, blobS: 0.9, sink: -0.14, foot: 1.0, nearTier: false },
  hedge:    { blobs: HEDGE, detail: 1, spherize: 0.62, trunk: null, shadow: true, hull: 0.024, align: true, box: [3.2, 1.5], dark: mixHex(F.dark, PAL.outline.leaf, 0.22), light: F.light, windBase: 0.2, wind: 0.022, aoBox: [3.2, 1.5], blobBox: [1.75, 0.8], blobS: 0.85, sink: -0.16, foot: 0, footBox: [3.2, 1.5], nearTier: false },
  // a second hedgerow shape, so a boundary laid end to end is never a chain of the same blob twice running
  hedgeb:   { blobs: HEDGE2, detail: 1, spherize: 0.6, trunk: null, shadow: true, hull: 0.024, align: true, box: [3.0, 1.6], dark: mixHex(F.dark, F.mid, 0.3), light: mixHex(F.light, F.sun, 0.22), windBase: 0.2, wind: 0.024, aoBox: [3.0, 1.6], blobBox: [1.65, 0.85], blobS: 0.85, sink: -0.16, foot: 0, footBox: [3.0, 1.6], nearTier: false },
  bushb:    { blobs: BUSH2, detail: 1, spherize: 0.66, trunk: null, shadow: true, hull: 0.022, collide: 0.5, dark: mixHex(F.dark, F.mid, 0.35), light: mixHex(F.sun, F.light, 0.4), windBase: 0.15, wind: 0.032, aoR: 1.1, aoS: 0.6, blobR: 0.7, blobS: 0.88, sink: -0.14, foot: 0.85, nearTier: false },
};

/** {cy, R}: the canopy's centre height and radius at scale 1 — colliders, occluders and the see-through use it. */
export function speciesBounds(defOrKind) {
  const def = typeof defOrKind === 'string' ? (SPECIES[defOrKind] || SPECIES.oak) : defOrKind;
  if (def._b) return def._b;
  let cy = 3.0, R = 2.1;
  if (!def.pine && def.blobs) {
    let cx = 0, cz = 0, ws = 0; cy = 0;
    for (const b of def.blobs) { cx += b[0] * b[3]; cy += b[1] * b[3]; cz += b[2] * b[3]; ws += b[3]; }
    cx /= ws; cy /= ws; cz /= ws; R = 0;
    for (const b of def.blobs) R = Math.max(R, Math.hypot(b[0] - cx, b[1] - cy, b[2] - cz) + b[3]);
  }
  try { Object.defineProperty(def, '_b', { value: { cy, R }, enumerable: false }); } catch (_) { return { cy, R }; }
  return def._b;
}

/** Non-indexed, with position/normal/uv/color/aBark — the shape every tree part is merged in. */
function treePart(geo, bark) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aBark', new THREE.BufferAttribute(new Float32Array(n).fill(bark), 1));
  return g;
}

/** The usual flared, bark-textured trunk. `thin` scales every radius (poplars, lollipops, birches). */
function barkTrunkGeometry(h = 1.6, flare = 1, thin = 1) {
  const pts = [[0.36 * flare, 0], [0.24 * flare, 0.2], [0.18, 0.6], [0.16, h * 0.8], [0.12, h]]
    .map(([r, y]) => new THREE.Vector2(r * thin, y));
  return wrapUV(new THREE.LatheGeometry(pts, 10), 1, h / Tex.worldSize('bark'));
}

/**
 * A birch stem: a slim creamy-white bole with REAL markings — the dark lenticel dashes, the sooty flare at the
 * foot and two dark branch "eyes". Only the lenticels were vertex colours before, spread over a 7-segment lathe
 * with six rings, which averaged out to nothing: from three metres away a birch read as a plastic pole standing
 * beside oaks with proper bark. The dashes are now chunky geometry laid ON the bole (DQV draws its bark, it does
 * not smear it), and the paper-white is broken by a warm shadow side and a grey underlay.
 * `detail` -1 drops the marks (the far LOD is six pixels wide).
 */
function birchTrunkGeometry(h = 3.0, thin = 0.6, detail = 1) {
  const N = Math.max(7, Math.round(h / 0.34)), pts = [];
  const rAt = (t) => lerp(0.3, 0.1, Math.pow(t, 0.7)) * thin;
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(new THREE.Vector2(rAt(t), t * h)); }
  const SEG = detail >= 1 ? 9 : 7;
  const g = new THREE.LatheGeometry(pts, SEG);
  const paint = (geo) => {
    const p = geo.attributes.position, cols = new Float32Array(p.count * 3), tmp = new THREE.Color();
    const pale = C3(mixHex(PAL.plaster.light, PAL.flower.white, 0.5));
    const cream = C3(mixHex(PAL.plaster.light, PAL.bark.light, 0.22));
    const grey = C3(mixHex(PAL.stone.mid, PAL.bark.dark, 0.3));
    const foot = C3(mixHex(PAL.bark.furrow, PAL.outline.char, 0.3));
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i);
      // long vertical grain streaks, a warm side, and the sooty flare where the bole meets the ground
      const streak = smooth(0.42, 0.88, vnoise(a * 1.7 + 11, y * 0.55, 61));
      tmp.copy(pale).lerp(cream, 0.28 + 0.46 * (0.5 + 0.5 * Math.sin(a + 0.7)))
        .lerp(grey, streak * 0.62)
        .lerp(foot, smooth(0.62, 0.0, y) * 0.9);
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return geo;
  };
  paint(g);
  if (detail < 1) return g;
  // the lenticels: short dark dashes wrapped round the bole, and two branch scars
  const parts = [g], dash = C3(mixHex(PAL.bark.furrow, PAL.outline.char, 0.45));
  const paintFlat = (geo, col) => {
    const n = geo.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return geo;
  };
  const r0 = mulberry(613);
  const MARKS = Math.max(5, Math.round(h * 2.6));
  for (let i = 0; i < MARKS; i++) {
    const t = 0.10 + 0.86 * ((i + 0.35 * r0()) / MARKS), r = rAt(t) * 0.985;
    const a = r0() * 6.283, w = r * (0.55 + r0() * 0.95), th = 0.022 + r0() * 0.022;
    const b = new THREE.BoxGeometry(w, th, 0.03);
    b.applyMatrix4(M4(Math.cos(a) * r, t * h, Math.sin(a) * r, -a + Math.PI / 2, 0, (r0() - 0.5) * 0.12));
    parts.push(paintFlat(b, dash));
    if (r0() < 0.34) {                                            // a shorter partner dash just under it
      const w2 = r * (0.3 + r0() * 0.4), a2 = a + (r0() - 0.5) * 0.9;
      const b2 = new THREE.BoxGeometry(w2, th * 0.85, 0.03);
      b2.applyMatrix4(M4(Math.cos(a2) * r, t * h - th * 2.6, Math.sin(a2) * r, -a2 + Math.PI / 2));
      parts.push(paintFlat(b2, dash));
    }
  }
  for (const [t, a] of [[0.52, 1.1], [0.78, 3.9]]) {              // branch scars: a dark eye with a pale lid
    const r = rAt(t) * 0.99;
    const e = new THREE.SphereGeometry(rAt(t) * 0.42, 7, 5);
    e.applyMatrix4(M4(Math.cos(a) * r * 0.86, t * h, Math.sin(a) * r * 0.86, 0, 0, 0, 1));
    e.scale(1, 0.72, 1);
    parts.push(paintFlat(e, dash));
  }
  const merged = mergeGeometries(parts.map(q => (q.index ? q.toNonIndexed() : q)));
  return merged || g;
}

/** A tiered conifer: four rounded skirts with scalloped rims — chunky and friendly, never spiky. */
const PINE_TIERS = [[0.95, 3.05, 1.50], [1.85, 3.85, 1.22], [2.75, 4.60, 0.94], [3.60, 5.45, 0.60]];
function pineCanopyGeometry(dark, light, detail = 1) {
  const seg = detail >= 2 ? 18 : detail === 1 ? 13 : 7, cd = C3(dark), cl = C3(light), tmp = new THREE.Color();
  const parts = PINE_TIERS.map(([y0, y1, R], ti) => {
    const H = y1 - y0;
    const prof = detail <= 0
      ? [[0.16, y0 + 0.3], [R * 0.94, y0 + 0.02], [R * 0.99, y0 + 0.16], [0.02, y1]]
      : [[0.16, y0 + 0.36], [R * 0.58, y0 + 0.07], [R * 0.93, y0 - 0.02], [R * 0.99, y0 + 0.14], [R * 0.70, y0 + H * 0.32], [R * 0.34, y0 + H * 0.68], [0.02, y1]];
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {                                   // scalloped rim: no perfect cones
      const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z);
      if (rr < 0.22) continue;
      const a = Math.atan2(z, x), k = 1 + 0.12 * Math.sin(a * 5 + ti * 1.7) + 0.06 * Math.sin(a * 9 - ti * 2.1) + 0.04 * Math.sin(a * 3 + ti);
      p.setXYZ(i, x * k, p.getY(i), z * k);
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal, cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const t = smooth(y0 - 0.15, y1, p.getY(i)) * 0.58 + smooth(-0.35, 0.9, nrm.getY(i)) * 0.42;
      tmp.copy(cd).lerp(cl, Math.min(1, t * (0.95 + ti * 0.07)));
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g.toNonIndexed();
  });
  return spherizeNormals(mergeGeometries(parts), new THREE.Vector3(0, 3.1, 0), 0.42);
}

/** Apples (or plums) sitting on the canopy's outer shell, merged in so they cost nothing extra. */
function fruitGeometry(blobs, n, seed = 77, detail = 0) {
  const r = mulberry(seed * 131 + 7), hues = [PAL.flower.red, mixHex(PAL.flower.red, PAL.flower.yellow, 0.42), PAL.tile.mid];
  const parts = [];
  for (let i = 0; i < n * 3 && parts.length < n; i++) {
    const b = blobs[(r() * blobs.length) | 0];
    const a = r() * 6.283, el = -0.25 + r() * 1.15, ca = Math.cos(el);
    const dx = Math.cos(a) * ca, dy = Math.sin(el), dz = Math.sin(a) * ca;
    // 1.03, not 0.94: an apple SITS ON the canopy. Sunk into it, it reads as a flat red disc painted on the leaves.
    const x = b[0] + dx * b[3] * 1.03, y = b[1] + dy * b[3] * 1.03, z = b[2] + dz * b[3] * 1.03;
    if (blobs.some(o => o !== b && Math.hypot(x - o[0], y - o[1], z - o[2]) < o[3] * 1.0)) continue;
    const g = new THREE.IcosahedronGeometry(0.105 + r() * 0.03, detail);
    g.translate(x, y, z);
    parts.push(prep(g, hues[(r() * hues.length) | 0]));
  }
  return parts.length ? mergeGeometries(parts) : null;
}

const TREE_GEO = new Map();        // `${kind}:${detail}` -> {geo, canopy, hull, cy, R, ranges}
/** Build (and cache) one species at one LOD: the merged [canopy][trunk][proxy] geometry plus its ink hull. */
function treeGeometry(kind, def, detail, outline = true) {
  const key = `${kind}:${detail}:${outline ? 1 : 0}`;
  if (TREE_GEO.has(key)) return TREE_GEO.get(key);
  let canopyRaw, cx = 0, cy = 0, cz = 0, R = 0;
  if (def.pine) {
    canopyRaw = pineCanopyGeometry(def.dark, def.light, detail);
    cy = 3.0; R = 2.1;
  } else {
    canopyRaw = canopyGeometry(def.blobs, def.dark, def.light, Math.max(0, detail), def.spherize ?? 0.7);
    let ws = 0;
    for (const b of def.blobs) { cx += b[0] * b[3]; cy += b[1] * b[3]; cz += b[2] * b[3]; ws += b[3]; }
    cx /= ws; cy /= ws; cz /= ws;
    for (const b of def.blobs) R = Math.max(R, Math.hypot(b[0] - cx, b[1] - cy, b[2] - cz) + b[3]);
  }
  const hull = outline ? hullGeometry(canopyRaw, def.hull ?? OUTLINE.canopy) : null;
  const fruits = def.fruit && detail >= 1 ? fruitGeometry(def.blobs, def.fruit, 77, detail >= 2 ? 1 : 0) : null;
  const canopy = fruits ? mergeGeometries([treePart(canopyRaw, 0), treePart(fruits, 0)]) : treePart(canopyRaw, 0);
  const T = def.trunk;
  const trunk = T ? treePart(T.birch ? birchTrunkGeometry(T.h + 0.5, T.thin ?? 0.6, detail)
    : barkTrunkGeometry(T.h + 0.4, T.flare ?? 1, T.thin ?? 1), T.birch ? 0 : 1) : null;
  let proxy = null;
  if (def.shadow !== false) {
    if (def.pine) {
      const cones = PINE_TIERS.filter((_, i) => i % 2 === 0).map(([y0, y1, R]) => {
        const g = new THREE.ConeGeometry(R * 0.82, y1 - y0 + 0.4, 6);
        g.translate(0, (y0 + y1) / 2, 0);
        return g.toNonIndexed();
      });
      proxy = treePart(mergeGeometries(cones), 0);
    } else {
      const big = [...def.blobs].sort((a, b) => b[3] - a[3]).slice(0, 3).map(b => [b[0], b[1], b[2], b[3] * 0.78, 0]);
      proxy = treePart(canopyGeometry(big, def.dark, def.light, 0, 0), 0);
    }
  }
  const nc = canopy.attributes.position.count, nt = trunk ? trunk.attributes.position.count : 0, np = proxy ? proxy.attributes.position.count : 0;
  const geo = mergeGeometries([canopy, trunk, proxy].filter(Boolean));
  geo.userData.shared = true;
  const parts = { geo, canopy, hull, cy, R, main: [0, nc + nt], shadow: nt + np > 0 ? [nc, nt + np] : null };
  if (hull) hull.userData.shared = true;
  TREE_GEO.set(key, parts);
  return parts;
}

/**
 * Walk a closed ring (a superellipse, usually the walkable edge) and place staggered rows of trees, hedge and
 * painted far clumps along it. PURE data — maps call this in layout() so positions are deterministic.
 *   pointAt(angle, e) -> [x, z]
 *   rows: [{kind: 'tree'|'card', e, spacing, jitter, size: [min, max], haze?,
 *           pick?(x, z, rnd, u) -> species id | null,     // null = leave a gap
 *           clump?: {freq, threshold, seed}}]             // arc-length noise that breaks the row into clumps
 *   clear(x, z, rowIndex, row) -> true where nothing may stand (a village clearing, a lane mouth)
 */
export function ringPlacements({ pointAt, rows = [], clear = () => false, seed = 4711 } = {}) {
  const rnd = mulberry(seed), N = 1024, trees = [], cards = [];
  rows.forEach((row, ri) => {
    const P = [], cum = [0];
    for (let i = 0; i <= N; i++) P.push(pointAt(i / N * Math.PI * 2, row.e));
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = cum[N];
    const cl = row.clump;
    let sAt = rnd() * row.spacing, k = 0;
    while (sAt < total) {
      while (k < N - 1 && cum[k + 1] < sAt) k++;
      const u = (sAt - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
      const bx = lerp(P[k][0], P[k + 1][0], u), bz = lerp(P[k][1], P[k + 1][1], u);
      const tx = P[k + 1][0] - P[k][0], tz = P[k + 1][1] - P[k][1], tl = Math.hypot(tx, tz) || 1;
      const nx = tz / tl, nz = -tx / tl;                                  // perpendicular to the ring
      const arc = sAt / total;
      const off = (rnd() - 0.5) * 2 * (row.jitter ?? 1), x = bx + nx * off, z = bz + nz * off;
      const size = lerp(row.size[0], row.size[1], rnd());
      const gap = cl ? vnoise(arc * (cl.freq ?? 9), ri * 3.1 + 0.5, cl.seed ?? 91) < (cl.threshold ?? 0.42) : false;
      if (!gap && !clear(x, z, ri, row)) {
        const kind = row.pick ? row.pick(x, z, rnd, arc) : null;
        if (row.kind === 'card') cards.push({ x, z, w: size, v: (rnd() * 4) | 0, haze: (row.haze ?? 0) + rnd() * 0.03, row: ri });
        // sx is along the run (aligned species keep it near 1 so a hedgerow never opens a gap); sy/sz vary widely,
        // which is what stops a row of the same species reading as one shape stamped out over and over
        else if (kind) trees.push({ kind, x, z, s: size, r: rnd() * Math.PI * 2, c: 0.84 + rnd() * 0.2, tint: (rnd() - 0.5) * 1.4,
          sx: 0.99 + rnd() * 0.14, sy: 0.82 + rnd() * 0.42, sz: 0.84 + rnd() * 0.36,
          ryaw: Math.atan2(-tz, tx) + (rnd() - 0.5) * 0.22, row: ri });
      }
      sAt += row.spacing * (0.8 + rnd() * 0.4);
    }
  });
  return { trees, cards };
}

/** One material for canopy AND trunk: `aBark` says which vertices sample the bark texture. */
export function barkPatch(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aBark; varying float vDqBark;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vDqBark = aBark;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vDqBark;')
    .replace('#include <map_fragment>', `
  #ifdef USE_MAP
    vec4 dqBarkTexel = texture2D( map, vMapUv );
    diffuseColor *= mix( vec4( 1.0 ), dqBarkTexel, vDqBark );
  #endif`);
}
barkPatch.key = 'bark';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// painted woodland cards (2x2 atlas): treetop clusters in the canopy palette with the leaf ink outline, a lit
// crown, a shaded underside and trunks — the far rows of kit.forestRing
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
let CARD_ATLAS = null;
function paintForestCard(g, S, rnd, v) {
  const tall = v === 1 || v === 3, base = S * (tall ? 0.72 : 0.7);
  const puffs = [];
  const add = (x, y, r, tier) => puffs.push({ x, y, r, tier });
  const nb = 3 + ((rnd() * 2) | 0);
  for (let i = 0; i < nb; i++) { const t = i / (nb - 1), r = S * (0.115 + rnd() * 0.035); add(S * (0.23 + t * 0.54) + (rnd() - 0.5) * 18, base - r * 0.72, r, 2); }
  const nm = 2 + ((rnd() * 2) | 0);
  for (let i = 0; i < nm; i++) { const t = nm === 1 ? 0.5 : i / (nm - 1), r = S * (0.15 + rnd() * 0.035); add(S * (0.32 + t * 0.36) + (rnd() - 0.5) * 16, base - S * (0.25 + rnd() * 0.04), r, 1); }
  const nt = tall ? 2 : 1 + ((rnd() * 2) | 0);
  for (let i = 0; i < nt; i++) { const t = nt === 1 ? 0.5 : i / (nt - 1), r = S * (0.12 + rnd() * 0.03); add(S * (0.43 + t * 0.14) + (rnd() - 0.5) * 12, base - S * (tall ? 0.5 : 0.44) - rnd() * S * 0.03, r, 0); }
  for (const p of puffs.slice()) if (rnd() < 0.8) {
    const a = -Math.PI * (0.12 + rnd() * 0.76);
    add(p.x + Math.cos(a) * p.r * 0.86, p.y + Math.sin(a) * p.r * 0.86, p.r * (0.34 + rnd() * 0.14), p.tier);
  }
  for (const p of puffs) { p.x = Math.max(p.r + 12, Math.min(S - p.r - 12, p.x)); p.y = Math.max(p.r + 12, p.y); }
  const ink = PAL.outline.leaf;
  // trunks under the crown
  const nTr = tall ? 1 : 2;
  for (let i = 0; i < nTr; i++) {
    const x = S * (nTr === 1 ? 0.5 : 0.4 + i * 0.2) + (rnd() - 0.5) * 20, w = S * (0.03 + rnd() * 0.012), top = base - S * 0.08;
    const trunk = (pad) => { g.beginPath(); g.moveTo(x - w - pad, S); g.quadraticCurveTo(x - w * 0.7 - pad, S * 0.9, x - w * 0.55 - pad, top); g.lineTo(x + w * 0.55 + pad, top); g.quadraticCurveTo(x + w * 0.7 + pad, S * 0.9, x + w + pad, S); g.closePath(); g.fill(); };
    g.fillStyle = PAL.outline.char; trunk(5);
    const tg = g.createLinearGradient(x - w, 0, x + w, 0); tg.addColorStop(0, PAL.foliage.trunkDark); tg.addColorStop(0.55, PAL.foliage.trunkDark); tg.addColorStop(1, PAL.foliage.trunk);
    g.fillStyle = tg; trunk(0);
  }
  // ink silhouette, then the shaded volume
  g.fillStyle = ink;
  for (const p of puffs) { g.beginPath(); g.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = PAL.foliage.dark;
  for (const p of puffs) { g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
  // clip everything that follows to the crown (so inner contours never cross the ink)
  g.save(); g.beginPath(); for (const p of puffs) { g.moveTo(p.x + p.r, p.y); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); } g.clip();
  // ONE big lit volume first, like the 3D canopies' spherized normals: sun up-right, three soft toon bands
  let top = S, left = S, right = 0; for (const p of puffs) { top = Math.min(top, p.y - p.r); left = Math.min(left, p.x - p.r); right = Math.max(right, p.x + p.r); }
  const vx = left + (right - left) * 0.64, vy = top + (base - top) * 0.3, vr = Math.max(right - left, base - top) * 0.78;
  const vol = g.createRadialGradient(vx, vy, vr * 0.04, vx, vy, vr);
  vol.addColorStop(0, mixHex(PAL.foliage.sun, PAL.foliage.light, 0.25)); vol.addColorStop(0.3, mixHex(PAL.foliage.light, PAL.foliage.sun, 0.35));
  vol.addColorStop(0.4, mixHex(PAL.foliage.mid, PAL.foliage.light, 0.45)); vol.addColorStop(0.62, PAL.foliage.mid);
  vol.addColorStop(0.74, mixHex(PAL.foliage.dark, PAL.foliage.mid, 0.4)); vol.addColorStop(1, PAL.foliage.dark);
  g.fillStyle = vol; g.fillRect(0, 0, S, S);
  const order = puffs.slice().sort((a, b) => a.tier - b.tier || a.y - b.y);   // crown top first, the front shoulders last
  for (const p of order) {
    // each puff, back to front: the SAME crown-wide light (so it stays one volume), its own gentle sunlit cap, leaf
    // dabs, and a soft contact line along its top edge where it sits in front of the puff behind
    g.save(); g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.clip();
    g.fillStyle = vol; g.fillRect(p.x - p.r - 1, p.y - p.r - 1, p.r * 2 + 2, p.r * 2 + 2);
    const hx = p.x + p.r * 0.3, hy = p.y - p.r * 0.38, vdP = Math.hypot(p.x - vx, p.y - vy) / vr;
    const cap = g.createRadialGradient(hx, hy, p.r * 0.05, hx, hy, p.r * 0.8);
    const capA = 0.34 * (1 - smooth(0.35, 0.9, vdP)) + 0.06;
    cap.addColorStop(0, css(PAL.foliage.sun, capA)); cap.addColorStop(0.6, css(PAL.foliage.sun, capA * 0.3)); cap.addColorStop(1, css(PAL.foliage.sun, 0));
    g.fillStyle = cap; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    const under = g.createLinearGradient(0, p.y + p.r * 0.2, 0, p.y + p.r);
    under.addColorStop(0, css(PAL.outline.leaf, 0)); under.addColorStop(1, css(PAL.outline.leaf, 0.22));
    g.fillStyle = under; g.fillRect(p.x - p.r, p.y, p.r * 2, p.r);
    g.lineCap = 'round';
    const n = Math.round(p.r / 3.4);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * p.r * 0.88, cx = p.x + Math.cos(a) * d, cy = p.y + Math.sin(a) * d;
      const vd = Math.hypot(cx - vx, cy - vy) / vr, rr = 3.5 + rnd() * 5;
      if (vd < 0.36) { g.fillStyle = css(PAL.foliage.sun, 0.2 + rnd() * 0.16); g.beginPath(); g.ellipse(cx, cy, rr * 1.2, rr * 0.8, rnd() * 3, 0, Math.PI * 2); g.fill(); }
      else if (vd > 0.5) { g.strokeStyle = css(PAL.outline.leaf, 0.12 + rnd() * 0.1); g.lineWidth = 2.5; const a0 = Math.PI * (1.05 + rnd() * 0.3); g.beginPath(); g.arc(cx, cy, rr, a0, a0 + Math.PI * (0.35 + rnd() * 0.25)); g.stroke(); }
    }
    g.restore();
    g.strokeStyle = css(PAL.outline.leaf, 0.3); g.lineWidth = 3.5;
    g.beginPath(); g.arc(p.x, p.y, p.r - 1, Math.PI * 1.18, Math.PI * 1.82); g.stroke();
  }
  g.restore();
  // shaded underside: the bottom of the crown sinks into the forest's own shadow (source-atop keeps the alpha)
  g.save(); g.globalCompositeOperation = 'source-atop';
  const ug = g.createLinearGradient(0, base - S * 0.2, 0, base + S * 0.1);
  ug.addColorStop(0, css(PAL.shadow.contact, 0)); ug.addColorStop(0.7, css(PAL.shadow.contact, 0.38)); ug.addColorStop(1, css(PAL.shadow.contact, 0.6));
  g.fillStyle = ug; g.fillRect(0, base - S * 0.2, S, S);
  g.restore();
}
export function forestCardAtlas() {
  if (CARD_ATLAS) return CARD_ATLAS;
  const S = 512, c = mkCanvas(S * 2, S * 2), g = ctx2(c);
  for (let v = 0; v < 4; v++) {
    g.save(); g.translate((v % 2) * S, (v >> 1) * S); g.beginPath(); g.rect(0, 0, S, S); g.clip();
    paintForestCard(g, S, mulberry(7301 + v * 131), v);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; t.name = 'forestCards';
  t.userData.shared = true;
  CARD_ATLAS = t;
  return t;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the kit core + prop recipes
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function createPropsKit({ scene, heightAt, ao, low = false }) {
  const buckets = new Map();
  const animators = [];
  const counts = {};
  const FOOT = [];                                            // footprints: tufts and flowers stay out
  const FADE = [];                                            // see-through candidates: {x, z, cy, R, keep}
  const kit = { scene, heightAt, ao, low, buckets, animators, counts, FOOT, FADE };
  kit.focus = null;                                           // the hero (set by kit.update; the live props follow him)

  /** Textured toon surface that dissolves when it stands between the camera and the hero (Toon.see). */
  const seeMats = new Map();
  const SEE_PRESET = { plaster: 'plaster', thatch: 'thatch', dirt: 'ground' };
  kit.seeSurface = (texName, { vertexColors = false, preset = SEE_PRESET[texName] || 'default', side = THREE.FrontSide } = {}) => {
    const key = `${texName}:${vertexColors ? 1 : 0}:${preset}:${side}`;
    if (!seeMats.has(key)) {
      const m = makeToon({ map: Tex.get(texName), vertexColors, side }, TOON_PRESETS[preset] || {}, [See.patch]);
      m.name = 'see:' + key; seeMats.set(key, m);
    }
    return seeMats.get(key);
  };

  const addTo = kit.addTo = (bucket, geo, matrix, color) => {
    const g = prep(geo, color); if (matrix) g.applyMatrix4(matrix);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(g);
    return g;
  };
  kit.footBox = (x, z, w, d, rot, pad = 0.15) => FOOT.push({ x, z, w: w / 2 + pad, d: d / 2 + pad, c: Math.cos(rot), s: Math.sin(rot) });
  kit.footDisc = (x, z, r) => FOOT.push({ x, z, r });
  kit.blocked = (x, z) => FOOT.some(f => {
    const dx = x - f.x, dz = z - f.z;
    if (f.r) return dx * dx + dz * dz < f.r * f.r;
    const lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c;
    return Math.abs(lx) < f.w && Math.abs(lz) < f.d;
  });

  // ═══ GROUNDING — the one pass that makes set dressing sit IN the field instead of on top of it ═════════════
  // Two rules, applied by every recipe below:
  //   1. a prop's feet are buried to the LOWEST ground under its own footprint (kit.lowestAt), so no post, picket
  //      or leg ever ends in mid-air on a slope, and a run of fence follows the ground post by post;
  //   2. everything that stands gets the same soft contact blob the hero gets (kit.contact) — ONE instanced mesh
  //      for the whole map, each quad laid flat on the local slope, so it can neither clip nor z-fight.
  /** The lowest terrain height within radius r of (x, z) — where a prop's feet must reach. */
  kit.lowestAt = (x, z, r = 0, n = 8) => {
    let y = heightAt(x, z);
    if (r > 0) for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; y = Math.min(y, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
    return y;
  };
  /** The terrain's up-normal at (x, z), sampled over h units. */
  kit.normalAt = (x, z, h = 0.7) => new THREE.Vector3(heightAt(x - h, z) - heightAt(x + h, z), 2 * h, heightAt(x, z - h) - heightAt(x, z + h)).normalize();
  const CONTACT = [];
  /**
   * POOL — the contact-shadow tuning, and the one number that decides whether set dressing looks PLANTED.
   *
   * Measured, not guessed (shots/P04-before/03-prop-yard.png with the pools tinted red): a pool exactly the size
   * of the prop's own footprint is ~95% HIDDEN UNDER that prop from the gameplay camera, so a well, a barrel, a
   * crate and a fence post each met the grass with a hard bright seam and the whole yard read as stickers laid on
   * a lawn. Three fixes, all here:
   *   spread   every pool reaches PAST its prop's footprint, so a ring of shade is always visible round the base;
   *   lean     the pool is offset away from the sun, so it reads as a shadow instead of a symmetric dark ring;
   *   multiply the pool DARKENS the ground (dst * (1 - a * (1 - tint))) instead of alpha-blending a flat dark
   *            green over it — grass keeps its hue and gets shade, and it can never wash out over dirt or stone.
   * `cap` limits how much shade may stack in one spot (a hedgerow's 80 overlapping pools would otherwise multiply
   * into a black band round the vale).
   */
  const POOL = { spread: 1.8, min: 0.4, max: 4.6, lean: 0.55, cap: 1.15, floor: 0.2, grid: 1.0, near: 58, far: 104,
    // Tex.blob()'s gradient is very soft (alpha .85 at the centre, .6 at half, 0 at the rim), which spread over a
    // pool 1.8x the footprint left only a 10-15% wash where it mattered — measured, and invisible in the frame.
    // `gain` pulls the core up so the ring the prop does NOT cover is a real shadow (~55% at half radius).
    gain: 1.45, max_a: 0.88, white: 0.22 };
  const SUNXZ = new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize();
  /** Point the contact shadows away from a different sun (a dusk / night map): pass the rig's `dir`. */
  kit.setSun = (dir) => { if (dir && (dir.x || dir.z)) SUNXZ.set(dir.x, dir.z).normalize(); return SUNXZ.toArray(); };
  /**
   * How far a contact pool reaches and how deep it goes. `spread`/`lean`/`cap` are read when a recipe registers a
   * pool, so they only bite before kit.flush(); `near`/`far` (the distance fade) are a live uniform and take
   * effect at once. A demo exposes this as __DQ.pools().
   */
  let CONTACT_U = null;
  kit.pools = (o = {}) => {
    for (const k of ['spread', 'lean', 'cap', 'near', 'far']) if (Number.isFinite(+o[k])) POOL[k] = +o[k];
    if (CONTACT_U) CONTACT_U.uDqRange.value.set(POOL.near, POOL.far);
    return Object.assign({}, POOL, { live: !!CONTACT_U });
  };
  /**
   * A soft contact shadow under a standing prop. Round by default; pass rx/rz + rot for a long thin one (a fence
   * rail, a bench, a wall). Collected here and merged into one InstancedMesh by kit.flush().
   *   strength 0..1   how dark the core is (0.9 = a crate sitting in the grass, 0.45 = a wide soft tree pool)
   *   spread          override POOL.spread for this pool (1 = exactly the footprint — almost never what you want)
   */
  kit.contact = (x, z, r, strength = 0.85, { rx = r, rz = r, rot = 0, lift = 0.05, spread = POOL.spread, lean = 1 } = {}) => {
    if (!(rx > 0) || !(rz > 0)) return;
    CONTACT.push({ x, z,
      rx: Math.min(Math.max(rx * spread, POOL.min), POOL.max),
      rz: Math.min(Math.max(rz * spread, POOL.min), POOL.max),
      rot, k: Math.max(0.04, Math.min(1, strength)), lift, lean });
  };
  /** AO into the painted mask AND the contact blob — what a standing prop calls instead of ao.disc alone. */
  kit.plant = (x, z, r, { ao: aoR = r * 1.9, aoS = 0.55, blob = r * 1.45, blobS = 0.8, rx = 0, rz = 0, rot = 0 } = {}) => {
    if (aoR > 0) ao.disc(x, z, aoR, aoS);
    kit.contact(x, z, blob, blobS, { rx: rx || blob, rz: rz || blob, rot });
  };
  let CONTACT_MAT = null;
  /** The pool material: a tinted MULTIPLY over whatever is already on the ground, with its own distance fade. */
  function contactMaterial() {
    if (CONTACT_MAT) return CONTACT_MAT;
    const t = rgb(mixHex(PAL.shadow.contact, PAL.char.white, POOL.white));
    const m = new THREE.MeshBasicMaterial({ map: Tex.blob(), transparent: true, depthWrite: false, fog: false });
    // out = src * dst + dst * (1 - srcA); with src.rgb premultiplied by srcA this is dst * (1 - a * (1 - tint))
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.DstColorFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.polygonOffset = true; m.polygonOffsetFactor = -6; m.polygonOffsetUnits = -6;
    m.onBeforeCompile = (sh) => {
      try {
        sh.uniforms.uDqTint = { value: new THREE.Vector3(t[0] / 255, t[1] / 255, t[2] / 255) };
        sh.uniforms.uDqRange = { value: new THREE.Vector2(POOL.near, POOL.far) };
        sh.uniforms.uDqGain = { value: new THREE.Vector2(POOL.gain, POOL.max_a) };
        CONTACT_U = sh.uniforms;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aK; varying float vDqK; varying float vDqD;')
          .replace('#include <project_vertex>', '#include <project_vertex>\n  vDqK = aK;\n  vDqD = -mvPosition.z;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vDqK; varying float vDqD; uniform vec3 uDqTint; uniform vec2 uDqRange; uniform vec2 uDqGain;')
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  {
    float dqA = min( clamp( gl_FragColor.a, 0.0, 1.0 ) * uDqGain.x, uDqGain.y ) * vDqK;
    dqA *= 1.0 - smoothstep( uDqRange.x, uDqRange.y, vDqD );
    gl_FragColor = vec4( uDqTint * dqA, dqA );
  }`);
      } catch (e) { reportError('props contact shadow patch', e); }
    };
    m.customProgramCacheKey = () => 'dqcontact2';
    m.name = 'contact';
    CONTACT_MAT = m;
    return m;
  }
  function buildContacts() {
    if (!CONTACT.length) return null;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const N = CONTACT.length;
    const aK = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    geo.setAttribute('aK', aK);
    const mesh = new THREE.InstancedMesh(geo, contactMaterial(), N);
    mesh.name = 'contactShadows'; mesh.renderOrder = 2; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    // the stacking cap: a coarse world grid of how much shade is already pooled at a spot (each pool stamps its own
    // falloff into it), so overlapping pools stay shade instead of turning into a black blot
    const acc = new Map();
    const G = POOL.grid, cellKey = (i, j) => (i + 4096) * 16384 + (j + 4096);
    const readAcc = (x, z) => acc.get(cellKey(Math.round(x / G), Math.round(z / G))) || 0;
    let peak = 0;
    CONTACT.forEach((c, i) => {
      const k = c.k * Math.max(POOL.floor, 1 - readAcc(c.x, c.z) / POOL.cap);
      const i0 = Math.round((c.x - c.rx) / G), i1 = Math.round((c.x + c.rx) / G);
      const j0 = Math.round((c.z - c.rz) / G), j1 = Math.round((c.z + c.rz) / G);
      for (let gi = i0; gi <= i1; gi++) for (let gj = j0; gj <= j1; gj++) {
        const dx = (gi * G - c.x) / c.rx, dz = (gj * G - c.z) / c.rz, d = Math.hypot(dx, dz);
        if (d >= 1) continue;
        const key = cellKey(gi, gj), was = acc.get(key) || 0, now = was + k * (1 - d);
        acc.set(key, now);
        if (now > peak) peak = now;
      }
      // lean the pool away from the sun: a shadow leaves the base on the shaded side, it is not a collar
      const lean = c.lean * POOL.lean * Math.min(0.6, Math.max(c.rx, c.rz) * 0.42);
      const px = c.x - SUNXZ.x * lean, pz = c.z - SUNXZ.y * lean;
      const nrm = kit.normalAt(c.x, c.z, Math.max(0.45, Math.max(c.rx, c.rz) * 0.7));
      q.setFromUnitVectors(UP, nrm).multiply(qy.setFromAxisAngle(UP, c.rot));
      // the quad is the tangent plane at its centre, so on rolling ground its edges can sink UNDER the hillside
      // (and the ground mesh is a 1-unit grid, which lifts it further between samples). Lift by the worst
      // deviation actually sampled round the pool, plus a margin: a soft blob 0.1 high reads exactly the same.
      const y0 = heightAt(px, pz), inv = 1 / Math.max(0.2, nrm.y);
      let up = 0;
      for (let a = 0; a < 8; a++) {
        const th = a * Math.PI / 4, ca = Math.cos(th), sa = Math.sin(th);
        for (const rr of [0.55, 1]) {
          const dx = ca * c.rx * rr, dz = sa * c.rz * rr;
          up = Math.max(up, heightAt(px + dx, pz + dz) - (y0 - (nrm.x * dx + nrm.z * dz) * inv));
        }
      }
      m4.compose(v.set(px, y0 + up + c.lift + Math.min(0.12, 0.045 * Math.max(c.rx, c.rz)), pz), q, sc.set(c.rx * 2, 1, c.rz * 2));
      mesh.setMatrixAt(i, m4);
      aK.array[i] = k;
    });
    mesh.instanceMatrix.needsUpdate = true; aK.needsUpdate = true;
    scene.add(mesh);
    counts.contactShadows = N;
    counts.poolPeak = +peak.toFixed(2);
    CONTACT.length = 0;
    return mesh;
  }

  // ── small props ──
  kit.rock = (x, z, s = 1, seed = 1, { moss = true, sink = 0.28 } = {}) => {
    const r = mulberry(seed * 7919 + 13), g = new THREE.IcosahedronGeometry(0.55, 1), p = g.attributes.position;
    const sx = 1 + r() * 0.5, sy = 0.55 + r() * 0.3, sz = 0.8 + r() * 0.4;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), k = 0.86 + 0.28 * vnoise(vx * 2.3 + seed, vz * 2.3 + vy, seed + 3);
      p.setXYZ(i, vx * sx * k, Math.max(vy, -0.2) * sy * k, vz * sz * k);
    }
    g.computeVertexNormals(); spherizeNormals(g, new THREE.Vector3(0, 0, 0), 0.45);
    const geo = prep(g, PAL.mask.on);
    const col = geo.attributes.color, pos = geo.attributes.position, nrm = geo.attributes.normal, tmp = new THREE.Color();
    const base = C3(PAL.stone.mid), light = C3(PAL.stone.light), mossC = C3(PAL.stone.moss);
    for (let i = 0; i < pos.count; i++) {
      tmp.copy(base).lerp(light, smooth(-0.1, 0.4, pos.getY(i)));
      if (moss) tmp.lerp(mossC, smooth(0.55, 0.9, nrm.getY(i)) * smooth(0.35, 0.65, vnoise(pos.getX(i) * 3 + seed, pos.getZ(i) * 3, 5)) * 0.85);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    const uv = geo.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i) * 0.7) / 1.6, pos.getY(i) / 1.6);
    geo.applyMatrix4(M4(x, kit.lowestAt(x, z, 0.5 * s * sx, 6) - sink * s, z, r() * 6.283, 0, 0, s));
    if (!buckets.has('stone')) buckets.set('stone', []);
    buckets.get('stone').push(geo);
    ao.disc(x, z, 1.0 * s * sx, 0.6);
    kit.contact(x, z, 0.72 * s * Math.max(sx, sz), 0.74, { spread: 1.3 });
    kit.footDisc(x, z, 0.55 * s * sx);
    return { x, z, r: 0.5 * s * Math.max(sx, sz) };
  };

  /**
   * Post-and-rail fence along a polyline, FOLLOWING THE GROUND: one node per post, each sampled on its own patch
   * of terrain and buried `dig` deep, and one rail piece per bay pitched from post to post — so a run rolls over
   * the field instead of cutting a dead-level chord through it. Returns the capsule collider points.
   */
  kit.fence = (pts, { color = PAL.wood.weathered, height = 1.05, spacing = 1.8, rails = [0.35, 0.75], seed = 3, dig = 0.45, contact = true } = {}) => {
    const r = mulberry(seed);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(L / spacing)), ang = Math.atan2(x1 - x0, z1 - z0);
      const P = [];
      for (let k = 0; k <= n; k++) { const x = lerp(x0, x1, k / n), z = lerp(z0, z1, k / n); P.push([x, z, kit.lowestAt(x, z, 0.2, 4)]); }
      for (let k = 0; k <= n; k++) {
        if (k === n && i < pts.length - 2) continue;                       // the shared post belongs to the next run
        const [x, z, y] = P[k];
        addTo('wood', boxUV(0.15, height + dig, 0.15, 0.8), M4(x, y + (height - dig) / 2, z, ang + (r() - 0.5) * 0.2, (r() - 0.5) * 0.06), color);
        ao.disc(x, z, 0.5, 0.52); kit.footDisc(x, z, 0.3);
        if (contact) kit.contact(x, z, 0.44, 0.72);
      }
      for (let k = 0; k < n; k++) {                                        // rails: one bay at a time, on the slope
        const [ax, az, ay] = P[k], [bx, bz, by] = P[k + 1], bay = Math.hypot(bx - ax, bz - az);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (ay + by) / 2, pitch = -Math.atan2(by - ay, bay);
        for (const ry of rails) addTo('wood', boxUV(0.08, 0.12, bay + 0.15, 0.8), M4(mx, my + ry, mz, ang, pitch), color);
        if (contact) kit.contact(mx, mz, 0, 0.3, { rx: 0.3, rz: bay * 0.52, rot: ang });
      }
    }
    return pts;
  };

  /** A little picket fence (garden edge) — same grounding rules: every picket on its own ground, rails per bay. */
  kit.picket = (pts, { color = PAL.plaster.light, height = 0.75, dig = 0.3, step = 0.32 } = {}) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.round(L / step)), ang = Math.atan2(x1 - x0, z1 - z0);
      const P = [];
      for (let k = 0; k <= n; k++) { const x = lerp(x0, x1, k / n), z = lerp(z0, z1, k / n); P.push([x, z, kit.lowestAt(x, z, 0.14, 4)]); }
      for (let k = 0; k <= n; k++) {
        const [x, z, y] = P[k], h = height * (k % 2 ? 0.92 : 1);
        addTo('wood', boxUV(0.1, h + dig, 0.05, 0.8), M4(x, y + (h - dig) / 2, z, ang + Math.PI / 2), color);
        addTo('wood', new THREE.ConeGeometry(0.07, 0.12, 4), M4(x, y + h - 0.02, z, ang + Math.PI / 4), color);
      }
      // rails in short bays so they hug the ground, and one long soft contact blob along the whole run
      const bays = Math.max(1, Math.round(L / 1.6));
      for (let b = 0; b < bays; b++) {
        const ka = Math.round(b * n / bays), kb = Math.round((b + 1) * n / bays);
        const [ax, az, ay] = P[ka], [bx, bz, by] = P[kb], bay = Math.hypot(bx - ax, bz - az) || 0.01;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (ay + by) / 2, pitch = -Math.atan2(by - ay, bay);
        for (const ry of [0.22, 0.52]) addTo('wood', boxUV(0.05, 0.08, bay + 0.02, 0.8), M4(mx, my + ry, mz, ang, pitch), PAL.wood.weathered);
        kit.contact(mx, mz, 0, 0.45, { rx: 0.26, rz: bay * 0.56, rot: ang });
      }
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      ao.disc(mx, mz, L * 0.5, 0.3);
    }
  };

  kit.barrel = (x, z, s = 1, rot = 0) => {
    const y = kit.lowestAt(x, z, 0.4 * s, 6) - 0.03 * s, base = M4(x, y, z, rot, 0, 0, s);
    const prof = []; for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(0.36 + Math.sin(t * Math.PI) * 0.07, t * 0.95)); }
    addTo('wood', wrapUV(new THREE.LatheGeometry(prof, 14), 2, 0.9), base, PAL.wood.light);
    addTo('wood', new THREE.CircleGeometry(0.36, 14), base.clone().multiply(M4(0, 0.95, 0, 0, -Math.PI / 2)), PAL.wood.mid);
    for (const by of [0.18, 0.77]) addTo('paint', new THREE.TorusGeometry(0.415, 0.03, 5, 18), base.clone().multiply(M4(0, by, 0, 0, Math.PI / 2)), PAL.paint.iron);
    ao.disc(x, z, 0.8 * s, 0.6); kit.contact(x, z, 0.56 * s, 0.92); kit.footDisc(x, z, 0.5 * s);
  };

  kit.crate = (x, z, rot = 0, s = 1) => {
    const y = kit.lowestAt(x, z, 0.55 * s, 6) - 0.02 * s;
    addTo('wood', boxUV(0.8 * s, 0.84 * s, 0.8 * s, 0.8), M4(x, y + 0.4 * s, z, rot), PAL.wood.light);
    for (const e of [-1, 1]) addTo('wood', boxUV(0.84 * s, 0.1 * s, 0.84 * s, 1), M4(x, y + (0.4 + e * 0.35) * s, z, rot), PAL.wood.beam);
    ao.disc(x, z, 0.85 * s, 0.6); kit.contact(x, z, 0, 0.92, { rx: 0.52 * s, rz: 0.52 * s, rot }); kit.footDisc(x, z, 0.55 * s);
  };

  kit.bench = (x, z, rot = 0) => {
    const y = kit.lowestAt(x, z, 0.85, 8), base = M4(x, y, z, rot), add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(1.7, 0.1, 0.45, 1), M4(0, 0.48, 0), PAL.wood.light);
    add('wood', boxUV(1.7, 0.36, 0.08, 1), M4(0, 0.78, -0.22, 0, -0.12), PAL.wood.light);
    for (const s of [-1, 1]) { add('wood', boxUV(0.12, 0.62, 0.4, 1), M4(s * 0.7, 0.17, 0), PAL.wood.beam); add('wood', boxUV(0.1, 0.5, 0.08, 1), M4(s * 0.7, 0.72, -0.22), PAL.wood.beam); }
    ao.box(x, z, 1.7, 0.5, rot, 0.6, 0.55); kit.contact(x, z, 0, 0.7, { rx: 0.95, rz: 0.36, rot: rot + Math.PI / 2 }); kit.footBox(x, z, 1.8, 0.6, rot);
  };

  kit.woodpile = (x, z, rot = 0) => {
    const y = kit.lowestAt(x, z, 1.0, 8), base = M4(x, y, z, rot), r = mulberry(Math.round(x * 31 + z * 17));
    const rows = [[5, 0.18], [4, 0.5], [3, 0.82], [2, 1.12]];
    for (const [n, ly] of rows) for (let i = 0; i < n; i++) {
      const lr = 0.16 + r() * 0.03, lx = (i - (n - 1) / 2) * 0.35 + (r() - 0.5) * 0.04, len = 1.1;
      addTo('bark', wrapUV(new THREE.CylinderGeometry(lr, lr, len, 10, 1, true), 1, len / Tex.worldSize('bark')), base.clone().multiply(M4(lx, ly, 0, 0, Math.PI / 2)));
      for (const e of [1, -1]) {
        addTo('paint', new THREE.CircleGeometry(lr, 10), base.clone().multiply(M4(lx, ly, e * len / 2, e > 0 ? 0 : Math.PI)), PAL.wood.light);
        addTo('paint', new THREE.RingGeometry(lr * 0.35, lr * 0.47, 10), base.clone().multiply(M4(lx, ly, e * (len / 2 + 0.01), e > 0 ? 0 : Math.PI)), PAL.wood.mid);
      }
    }
    ao.box(x, z, 1.9, 1.2, rot, 0.7, 0.6); kit.contact(x, z, 0, 0.8, { rx: 1.0, rz: 0.7, rot }); kit.footBox(x, z, 2.0, 1.3, rot);
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // THE OUTFIELD KIT — what a field has in it that is not a tree. Away from the cottage the vale was five grass
  // tufts and four flower sprigs over sixty metres of one green; these are the things that give a corner of it a
  // reason to exist, and a second hue: cut stone, ochre stubble, bramble purple, toadstool red, mushroom cream.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

  /** A cut stump: flared roots, saw-cut rings on top, moss down one side, the odd bracket fungus. */
  kit.stump = (x, z, rot = 0, { s = 1, seed = 3, fungi = true } = {}) => {
    const r = mulberry(seed * 977 + 41), y = kit.lowestAt(x, z, 0.55 * s, 6) - 0.06 * s;
    const base = M4(x, y, z, rot, 0, 0, s), add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const H = 0.44 + r() * 0.26;
    const prof = [[0.52, 0], [0.40, 0.09], [0.345, 0.22], [0.33, H]].map(([rr, yy]) => new THREE.Vector2(rr, yy));
    add('bark', wrapUV(new THREE.LatheGeometry(prof, 11), 2, H / Tex.worldSize('bark')), M4(0, 0, 0));
    add('paint', new THREE.CircleGeometry(0.335, 11), M4(0, H + 0.001, 0, 0, -Math.PI / 2), PAL.wood.light);
    for (const [ri, rw] of [[0.12, 0.022], [0.21, 0.02], [0.29, 0.018]]) {                 // the saw-cut growth rings
      add('paint', new THREE.RingGeometry(ri, ri + rw, 12), M4(0, H + 0.004, 0, 0, -Math.PI / 2), PAL.wood.mid);
    }
    for (let i = 0; i < 4; i++) {                                                          // roots reaching out
      const a = i * 1.57 + r() * 0.5, L = 0.42 + r() * 0.3;
      const g = new THREE.CylinderGeometry(0.08, 0.13, L, 6);
      add('bark', wrapUV(g, 1, L / Tex.worldSize('bark')), M4(Math.cos(a) * L * 0.42, 0.06, Math.sin(a) * L * 0.42, -a + Math.PI / 2, 0, Math.PI / 2 - 0.35));
    }
    {                                                                                      // a moss cushion on one cheek
      const mg = new THREE.SphereGeometry(0.19, 8, 6); mg.scale(1.1, 0.52, 0.9);
      add('paint', mg, M4(0.22, H - 0.1, 0.16), mixHex(PAL.bark.moss, PAL.foliage.mid, 0.3));
    }
    if (fungi) for (let i = 0; i < 2 + ((r() * 2) | 0); i++) {                              // bracket fungi on the flank
      const a = r() * 6.283, yy = 0.12 + r() * (H - 0.18);
      const g = new THREE.SphereGeometry(0.075 + r() * 0.05, 7, 5); g.scale(1, 0.34, 0.62);
      add('paint', g, M4(Math.cos(a) * 0.33, yy, Math.sin(a) * 0.33, -a), mixHex(PAL.thatch.pale, PAL.bark.light, 0.3));
    }
    ao.disc(x, z, 0.95 * s, 0.6); kit.contact(x, z, 0.6 * s, 0.86, { spread: 1.35 }); kit.footDisc(x, z, 0.55 * s);
    return { x, z, r: 0.5 * s, h: H * s };
  };

  /** A fallen trunk lying in the grass: a mossy bole, a splintered end, bracket fungi and a couple of toadstools. */
  kit.fallenLog = (x, z, rot = 0, { len = 3.2, rad = 0.3, seed = 7 } = {}) => {
    const r = mulberry(seed * 631 + 17);
    const c = Math.cos(rot), si = Math.sin(rot);
    const ends = [[x - si * len / 2, z - c * len / 2], [x + si * len / 2, z + c * len / 2]];
    const y = Math.min(kit.lowestAt(ends[0][0], ends[0][1], rad, 4), kit.lowestAt(ends[1][0], ends[1][1], rad, 4), kit.lowestAt(x, z, rad, 4));
    const base = M4(x, y + rad * 0.78, z, rot), add = (b, g, m, col) => addTo(b, g, base.clone().multiply(m), col);
    add('bark', wrapUV(new THREE.CylinderGeometry(rad * 0.86, rad, len, 10, 1, true), 1, len / Tex.worldSize('bark')), M4(0, 0, 0, 0, Math.PI / 2));
    for (const e of [1, -1]) {                                                             // the sawn / splintered ends
      add('paint', new THREE.CircleGeometry(rad * (e > 0 ? 0.86 : 1), 10), M4(0, 0, e * len / 2, e > 0 ? 0 : Math.PI), PAL.wood.light);
      add('paint', new THREE.RingGeometry(rad * 0.3, rad * 0.44, 10), M4(0, 0, e * (len / 2 + 0.01), e > 0 ? 0 : Math.PI), PAL.wood.mid);
    }
    for (let i = 0; i < 5; i++) {                                                          // moss cushions along the top
      const t = (i + 0.35 + r() * 0.3) / 5 - 0.5, a = (r() - 0.5) * 1.2;
      const g = new THREE.SphereGeometry(rad * (0.5 + r() * 0.4), 8, 6); g.scale(1.25, 0.5, 1.0);
      add('paint', g, M4(Math.sin(a) * rad * 0.7, Math.cos(a) * rad * 0.82, t * len), mixHex(PAL.bark.moss, PAL.foliage.mid, r() * 0.5));
    }
    for (let i = 0; i < 3; i++) {                                                          // bracket fungi on the flank
      const t = (r() - 0.5) * 0.78, side = r() < 0.5 ? 1 : -1;
      const g = new THREE.SphereGeometry(0.1 + r() * 0.07, 7, 5); g.scale(1, 0.3, 0.66);
      add('paint', g, M4(side * rad * 0.88, -0.02 + r() * rad * 0.5, t * len, side > 0 ? -Math.PI / 2 : Math.PI / 2),
        mixHex(PAL.thatch.pale, PAL.bark.light, 0.25));
    }
    const R = Math.max(rad, len * 0.5);
    ao.box(x, z, len + 0.6, rad * 3.2, rot, 0.7, 0.6);
    kit.contact(x, z, 0, 0.85, { rx: rad * 1.5, rz: len * 0.52, rot, spread: 1.25 });
    kit.footBox(x, z, len + 0.4, rad * 3, rot);
    kit.mushrooms(x - si * len * 0.36 + c * 0.75, z - c * len * 0.36 - si * 0.75, 4, seed + 5, 0.5);
    return { x, z, r: R, ends };
  };

  /** Toadstools: red caps with white spots, and a cream one or two. A ring of them is a thing a child walks to. */
  kit.mushrooms = (x, z, n = 5, seed = 9, spread = 0.7) => {
    const r = mulberry(seed * 5171 + 3);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * spread, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (kit.blocked(px, pz)) continue;
      const s = 0.55 + r() * 0.75, y = kit.lowestAt(px, pz, 0.1, 4) - 0.02;
      const red = r() < 0.62;
      const cap = red ? PAL.flower.red : mixHex(PAL.plaster.light, PAL.thatch.pale, 0.4);
      const base = M4(px, y, pz, r() * 6.283, 0, 0, s), add = (g, m, c) => addTo('paint', g, base.clone().multiply(m), c);
      add(new THREE.CylinderGeometry(0.034, 0.05, 0.19, 6), M4(0, 0.095, 0), mixHex(PAL.plaster.light, PAL.thatch.light, 0.25));
      const cg = new THREE.SphereGeometry(0.135, 9, 6, 0, 6.283, 0, Math.PI / 2); cg.scale(1, 0.78, 1);
      add(cg, M4(0, 0.185, 0), cap);
      if (red) for (let k = 0; k < 4; k++) {
        const ka = k * 1.57 + r(), kd = 0.055 + r() * 0.06;
        const sp = new THREE.SphereGeometry(0.024, 5, 4); sp.scale(1, 0.5, 1);
        add(sp, M4(Math.cos(ka) * kd, 0.185 + 0.09 * (1 - kd / 0.14), Math.sin(ka) * kd), PAL.flower.white);
      }
      ao.disc(px, pz, 0.24 * s, 0.35); kit.contact(px, pz, 0.14 * s, 0.6);
    }
    counts.mushrooms = (counts.mushrooms || 0) + n;
  };

  /**
   * A molehill: a heap of fresh earth with a scrape of bare soil beside it. Cheap (two shapes) and the most
   * useful thing in the kit for a field that is one green — a handful of these puts BROWN in every frame.
   */
  kit.molehill = (x, z, { s = 1, seed = 2 } = {}) => {
    const r = mulberry(seed * 2087 + 5), y = kit.lowestAt(x, z, 0.5 * s, 4) - 0.05 * s;
    const base = M4(x, y, z, r() * 6.283, 0, 0, s);
    const heap = new THREE.SphereGeometry(0.34, 9, 6, 0, 6.283, 0, Math.PI / 2);
    heap.scale(1 + r() * 0.3, 0.46 + r() * 0.2, 1 + r() * 0.3);
    addTo('dirtbed', heap, base, PAL.dirt.base);
    for (let i = 0; i < 3; i++) {                                   // clods of turned earth round the foot
      const a = r() * 6.283, d = 0.3 + r() * 0.3;
      const g = new THREE.IcosahedronGeometry(0.06 + r() * 0.05, 0);
      addTo('dirtbed', g, base.clone().multiply(M4(Math.cos(a) * d, 0.02, Math.sin(a) * d)), r() < 0.5 ? PAL.dirt.dark : PAL.dirt.light);
    }
    ao.disc(x, z, 0.62 * s, 0.45); kit.contact(x, z, 0.34 * s, 0.55); kit.footDisc(x, z, 0.42 * s);
    counts.molehills = (counts.molehills || 0) + 1;
    return { x, z, r: 0.34 * s };
  };

  /** A clump of bracken: fronds arching out of one crown, green at the foot and going to rust at the tips. */
  kit.bracken = (x, z, { s = 1, seed = 4 } = {}) => {
    const r = mulberry(seed * 4409 + 19), y = kit.lowestAt(x, z, 0.5 * s, 4) - 0.05 * s;
    const base = M4(x, y, z, r() * 6.283, 0, 0, s);
    const N = 6 + ((r() * 4) | 0);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 6.283 + r() * 0.4, L = 0.6 + r() * 0.42, lean = 0.55 + r() * 0.4;
      const rust = r();
      const col = rust < 0.34 ? mixHex(PAL.grass.dry, PAL.bark.light, 0.35)
        : rust < 0.66 ? mixHex(PAL.foliage.mid, PAL.grass.dry, 0.42) : PAL.foliage.mid;
      const g = new THREE.ConeGeometry(0.09 + r() * 0.05, L, 4);
      g.scale(1, 1, 0.42);
      addTo('paint', g, base.clone().multiply(M4(Math.cos(a) * 0.1, L * 0.42, Math.sin(a) * 0.1, -a, 0, lean)), col);
    }
    ao.disc(x, z, 0.7 * s, 0.5); kit.contact(x, z, 0.4 * s, 0.6); kit.footDisc(x, z, 0.45 * s);
    counts.bracken = (counts.bracken || 0) + 1;
    return { x, z, r: 0.42 * s };
  };

  /** A bramble thicket: a dark thorny mound with blackberry dots and a few arching canes. Purple, not green. */
  kit.brambles = (x, z, { s = 1, seed = 11 } = {}) => {
    const r = mulberry(seed * 3331 + 29), y = kit.lowestAt(x, z, 0.8 * s, 6) - 0.08 * s;
    const base = M4(x, y, z, r() * 6.283, 0, 0, s), add = (g, m, c) => addTo('paint', g, base.clone().multiply(m), c);
    const dark = mixHex(PAL.foliage.dark, PAL.outline.leaf, 0.42), leaf = mixHex(PAL.foliage.mid, PAL.cloth.purpleDark, 0.16);
    for (let i = 0; i < 7; i++) {
      const a = r() * 6.283, d = r() * 0.55, rr = 0.24 + r() * 0.25;
      const g = new THREE.IcosahedronGeometry(rr, 1); g.scale(1.15, 0.72, 1.15);
      add(g, M4(Math.cos(a) * d, 0.16 + r() * 0.26, Math.sin(a) * d), r() < 0.5 ? dark : leaf);
    }
    for (let i = 0; i < 5; i++) {                                                          // arching canes
      const a = r() * 6.283, L = 0.7 + r() * 0.5;
      const g = new THREE.CylinderGeometry(0.018, 0.026, L, 5);
      add(g, M4(Math.cos(a) * 0.3, 0.42 + r() * 0.2, Math.sin(a) * 0.3, -a, 0, 0.9 + r() * 0.5), mixHex(PAL.bark.dark, PAL.cloth.purpleDark, 0.35));
    }
    for (let i = 0; i < 9; i++) {                                                          // blackberries
      const a = r() * 6.283, d = 0.2 + r() * 0.45;
      add(new THREE.IcosahedronGeometry(0.035, 0), M4(Math.cos(a) * d, 0.3 + r() * 0.35, Math.sin(a) * d),
        r() < 0.6 ? mixHex(PAL.cloth.purpleDark, PAL.outline.char, 0.3) : PAL.flower.red);
    }
    ao.disc(x, z, 1.1 * s, 0.6); kit.contact(x, z, 0.72 * s, 0.8, { spread: 1.3 }); kit.footDisc(x, z, 0.7 * s);
    return { x, z, r: 0.62 * s };
  };

  /**
   * A drystone wall along a polyline: courses of stacked stone following the ground, a row of cap stones on top,
   * lichen and moss on the weather side. One extra HUE on a green hillside, and something to walk along.
   */
  kit.drystoneWall = (pts, { h = 0.82, seed = 17, thick = 0.42 } = {}) => {
    const r = mulberry(seed * 131 + 7);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.round(L / 0.46)), ang = Math.atan2(x1 - x0, z1 - z0);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, px = lerp(x0, x1, t), pz = lerp(z0, z1, t);
        const y = kit.lowestAt(px, pz, 0.3, 4) - 0.1;
        const courses = 3;
        for (let c = 0; c < courses; c++) {
          const cy = y + (c + 0.5) * (h / courses), w = (L / n) * (0.82 + r() * 0.3);
          const hh = (h / courses) * (0.86 + r() * 0.2), dd = thick * (0.84 + r() * 0.26);
          const g = boxUV(w, hh, dd, 0.9);
          const col = r() < 0.16 ? mixHex(PAL.stone.mid, PAL.stone.moss, 0.42)
            : r() < 0.5 ? PAL.stone.light : r() < 0.82 ? PAL.stone.mid : PAL.stone.dark;
          addTo('stone', g, M4(px + (r() - 0.5) * 0.05, cy, pz + (r() - 0.5) * 0.05, ang + (r() - 0.5) * 0.14, (r() - 0.5) * 0.08), col);
        }
        // the cap stones: set on edge, the way a real drystone wall is finished
        addTo('stone', boxUV((L / n) * 0.92, 0.16, thick * 1.12, 0.9),
          M4(px, y + h + 0.07, pz, ang + (r() - 0.5) * 0.1, (r() - 0.5) * 0.12), r() < 0.35 ? PAL.stone.dark : PAL.stone.light);
        ao.disc(px, pz, 0.6, 0.5); kit.footDisc(px, pz, 0.3);
        if (k % 2 === 0) kit.contact(px, pz, 0, 0.8, { rx: (L / n), rz: thick * 0.85, rot: ang });
      }
    }
    counts.wallRuns = (counts.wallRuns || 0) + pts.length - 1;
    return pts;
  };

  /** A five-bar field gate hung between two posts: the thing at the end of a lane that says a person farms here. */
  kit.fieldGate = (x, z, rot = 0, { w = 2.6, h = 1.15, open = 0.35 } = {}) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const hy = (dx) => kit.lowestAt(x + c * dx, z - s * dx, 0.25, 4);
    const yL = hy(-w / 2), yR = hy(w / 2);
    for (const e of [-1, 1]) {                                                            // the two hanging posts
      const px = x + c * (e * w / 2), pz = z - s * (e * w / 2), py = e < 0 ? yL : yR;
      addTo('wood', boxUV(0.19, h + 0.85, 0.19, 0.9), M4(px, py + (h - 0.5) / 2 + 0.1, pz, rot), PAL.wood.beam);
      addTo('wood', new THREE.ConeGeometry(0.13, 0.17, 4), M4(px, py + h + 0.36, pz, rot + Math.PI / 4), PAL.wood.beam);
      ao.disc(px, pz, 0.5, 0.5); kit.contact(px, pz, 0.34, 0.8); kit.footDisc(px, pz, 0.3);
    }
    // the gate itself, swung open a little so the lane reads as a way THROUGH
    const gx = x + c * (-w / 2), gz = z - s * (-w / 2), gy = yL;
    const gw = w - 0.4, ga = rot + open;
    const gb = M4(gx, gy, gz, ga), add = (g, m, col) => addTo('wood', g, gb.clone().multiply(m), col);
    for (let i = 0; i < 5; i++) add(boxUV(gw, 0.085, 0.06, 0.9), M4(gw / 2, 0.24 + i * 0.22, 0), PAL.wood.weathered);
    add(boxUV(0.1, h, 0.07, 0.9), M4(0.08, 0.24 + h / 2 - 0.12, 0), PAL.wood.weathered);
    add(boxUV(0.1, h, 0.07, 0.9), M4(gw - 0.06, 0.24 + h / 2 - 0.12, 0), PAL.wood.weathered);
    add(boxUV(Math.hypot(gw, h) - 0.1, 0.075, 0.05, 0.9), M4(gw / 2, 0.24 + h / 2 - 0.12, 0.02, 0, 0, Math.atan2(h - 0.2, gw)), PAL.wood.weathered);
    kit.contact(gx + Math.sin(ga) * gw * 0.5, gz + Math.cos(ga) * gw * 0.5, 0, 0.45, { rx: gw * 0.5, rz: 0.2, rot: ga });
    return { x, z, rot, w };
  };

  /**
   * A stook: six sheaves of cut corn stood up against each other in a stubble field, twine round each one and the
   * cut ears fanning out at the head. Each sheaf is built base-out / head-in from a real direction vector, so the
   * stook leans together into a cone the way one in a field does.
   */
  kit.stook = (x, z, rot = 0, { s = 1, seed = 5 } = {}) => {
    const r = mulberry(seed * 7717 + 11), y = kit.lowestAt(x, z, 0.5 * s, 6) - 0.04 * s;
    const base = M4(x, y, z, rot, 0, 0, s);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const UP = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const q = new THREE.Quaternion();
    const lay = (bx, bz, H, tilt, a) => {                      // a sheaf from (bx, 0, bz) leaning in toward the middle
      dir.set(-Math.cos(a) * tilt, H, -Math.sin(a) * tilt).normalize();
      q.setFromUnitVectors(UP, dir);
      return { m: new THREE.Matrix4().compose(pos.set(bx + dir.x * H / 2, dir.y * H / 2, bz + dir.z * H / 2), q, one), dir: dir.clone(), H };
    };
    for (let i = 0; i < 6; i++) {
      const a = i * 1.0472 + (r() - 0.5) * 0.3, R = 0.30 + r() * 0.06;
      const H = 1.08 + r() * 0.2, tilt = 0.30 + r() * 0.12;
      const bx = Math.cos(a) * R, bz = Math.sin(a) * R;
      const sh = lay(bx, bz, H, tilt, a);
      const body = wrapUV(new THREE.CylinderGeometry(0.12, 0.2, H, 8), 1, H / 1.2);
      add('thatch', body, sh.m, r() < 0.45 ? PAL.thatch.light : r() < 0.8 ? PAL.thatch.mid : PAL.thatch.pale);
      // the twine, two thirds up, and the cut ears fanning out of the head
      const tw = new THREE.Matrix4().compose(pos.set(bx + sh.dir.x * H * 0.66, sh.dir.y * H * 0.66, bz + sh.dir.z * H * 0.66), q.clone(), one);
      add('thatch', new THREE.TorusGeometry(0.135, 0.024, 4, 9), tw.clone().multiply(M4(0, 0, 0, 0, Math.PI / 2)), PAL.cloth.rope);
      for (let k = 0; k < 3; k++) {
        const ea = a + (k - 1) * 0.5 + r() * 0.2, eL = 0.26 + r() * 0.12;
        const head = new THREE.Matrix4().compose(pos.set(bx + sh.dir.x * H * 0.98, sh.dir.y * H * 0.98, bz + sh.dir.z * H * 0.98), q.clone(), one);
        add('thatch', new THREE.ConeGeometry(0.055, eL, 5), head.clone().multiply(M4(Math.cos(ea) * 0.07, eL * 0.36, Math.sin(ea) * 0.07, -ea, 0, 0.5)), PAL.thatch.pale);
      }
    }
    ao.disc(x, z, 0.95 * s, 0.6); kit.contact(x, z, 0.5 * s, 0.86, { spread: 1.4 }); kit.footDisc(x, z, 0.48 * s);
    counts.stooks = (counts.stooks || 0) + 1;
    return { x, z, r: 0.45 * s };
  };

  /** A two-wheeled farm handcart, shafts down in the stubble, with a plank bed and a spoked wheel each side. */
  kit.handcart = (x, z, rot = 0, { s = 1 } = {}) => {
    const y = kit.lowestAt(x, z, 1.1 * s, 8), base = M4(x, y, z, rot, 0, 0, s);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    for (let i = 0; i < 5; i++) add('wood', boxUV(0.29, 0.07, 1.9, 0.9), M4((i - 2) * 0.3, 0.62, 0), i % 2 ? PAL.wood.light : PAL.wood.mid);
    for (const e of [-1, 1]) add('wood', boxUV(1.55, 0.3, 0.08, 0.9), M4(0, 0.78, e * 0.95), PAL.wood.beam);
    for (const e of [-1, 1]) add('wood', boxUV(0.09, 0.3, 1.9, 0.9), M4(e * 0.72, 0.78, 0), PAL.wood.beam);
    add('wood', boxUV(1.5, 0.12, 0.12, 0.9), M4(0, 0.55, 0), PAL.wood.beam);               // the axle
    for (const e of [-1, 1]) {                                                             // the shafts, resting down
      add('wood', boxUV(0.085, 0.085, 1.5, 0.9), M4(e * 0.5, 0.36, 1.55, 0, -0.26), PAL.wood.beam);
    }
    for (const e of [-1, 1]) {
      // A wheel stands in the plane ACROSS the axle. THREE's torus lies in local XY with its axis on +Z, so the
      // wheel is built there and the whole thing is turned a quarter turn about Y to put that axis on world X.
      // (Built the other way round the rim lay flat on the grass and read as a dark arc in the stubble.)
      const wb = M4(e * 0.8, 0.55, 0, Math.PI / 2);
      add('wood', new THREE.TorusGeometry(0.52, 0.062, 6, 16), wb, PAL.wood.mid);
      add('wood', new THREE.TorusGeometry(0.46, 0.028, 5, 14), wb, PAL.wood.light);        // the inner felloe line
      for (let k = 0; k < 6; k++) add('wood', boxUV(0.052, 0.94, 0.052, 0.9), wb.clone().multiply(M4(0, 0, 0, 0, 0, k * 0.5236)), PAL.wood.light);
      add('paint', new THREE.CylinderGeometry(0.1, 0.1, 0.16, 9), wb.clone().multiply(M4(0, 0, 0, 0, Math.PI / 2)), PAL.paint.iron);
    }
    ao.box(x, z, 2.2, 2.6, rot, 0.8, 0.6);
    kit.contact(x, z, 0, 0.78, { rx: 0.9 * s, rz: 1.2 * s, rot, spread: 1.2 });
    kit.footBox(x, z, 2.2 * s, 2.8 * s, rot);
    return { x, z, r: 1.1 * s };
  };

  /**
   * Flower bed: an earth patch heaped with round flower heads and leaves. The earth follows the ground (a grid, not
   * one flat card) and every head sits ON the leaves — nothing hangs over open air on a slope.
   */
  kit.flowerBed = (x, z, w, d, rot = 0, seed = 5) => {
    const y = kit.lowestAt(x, z, Math.max(w, d) * 0.5, 8), base = M4(x, y, z, rot), r = mulberry(seed);
    const c0 = Math.cos(rot), s0 = Math.sin(rot);
    const NX = Math.max(2, Math.round(w / 0.7)), NZ = Math.max(2, Math.round(d / 0.7));
    const bedGeo = new THREE.PlaneGeometry(w, d, NX, NZ).rotateX(-Math.PI / 2);
    { const p = bedGeo.attributes.position;                              // drape the earth over the real terrain
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), lz = p.getZ(i), wx = x + lx * c0 + lz * s0, wz = z - lx * s0 + lz * c0;
        p.setY(i, heightAt(wx, wz) - y + 0.055);
      }
      bedGeo.computeVertexNormals();
    }
    addTo('dirtbed', bedGeo, base, PAL.dirt.dark);
    const hues = [PAL.flower.pink, PAL.flower.yellow, PAL.flower.white, PAL.flower.red, PAL.flower.blue];
    const n = Math.round(w * d * 9);
    const localY = (lx, lz) => heightAt(x + lx * c0 + lz * s0, z - lx * s0 + lz * c0) - y;
    for (let i = 0; i < n; i++) { const lx = (r() - 0.5) * w * 0.9, lz = (r() - 0.5) * d * 0.9;
      addTo('paint', new THREE.IcosahedronGeometry(0.12 + r() * 0.05, 0), base.clone().multiply(M4(lx, localY(lx, lz) + 0.16 + r() * 0.1, lz)), PAL.foliage.mid); }
    for (let i = 0; i < n * 0.8; i++) { const lx = (r() - 0.5) * w * 0.9, lz = (r() - 0.5) * d * 0.9;
      addTo('paint', new THREE.IcosahedronGeometry(0.075 + r() * 0.03, 0), base.clone().multiply(M4(lx, localY(lx, lz) + 0.27 + r() * 0.1, lz)), hues[(r() * hues.length) | 0]); }
    ao.box(x, z, w, d, rot, 0.4, 0.35); kit.contact(x, z, 0, 0.5, { rx: w * 0.55, rz: d * 0.55, rot, spread: 1.2 }); kit.footBox(x, z, w, d, rot);
  };

  // ── foliage ──
  // ── the grove: every tree in the map lives in ONE set of InstancedMeshes per species ──────────────────────
  /**
   * Trees are CPU-culled and LOD-picked per instance every frame (not per chunk), so a mixed wood of five species
   * in three staggered rows costs ~4 draw calls per species instead of ~5 per clump. Each species has up to three
   * tiers — near (detail + 1), mid, far (detail - 1, no ink hull, no sun shadow) — and every tier is one
   * InstancedMesh whose canopy + trunk draw in the colour pass and whose trunk + low proxy draw in the shadow pass.
   *   kit.trees([{kind, x, z, s, r, c, tint, sx, sz, sy}], {shade, species})     plant a mixed list
   *   kit.forest(name, blobs, list, opts)                                        the older single-species call
   *   kit.groveState()                                                           {species, instances, visible, calls}
   */
  const grove = { species: new Map(), dirty: false, custom: 0, cache: new Map(), stats: { instances: 0, visible: 0, meshes: 0 } };
  const treeMats = new Map();
  const treeMaterial = (def) => {
    const wind = def.wind ?? 0.018, windBase = def.windBase ?? 1.6, key = `${wind}:${windBase}`;
    if (!treeMats.has(key)) treeMats.set(key, makeToon({ map: Tex.bark(), vertexColors: true },
      Object.assign({}, TOON_PRESETS.canopy, { wind, windBase }), [See.patch, barkPatch]));
    return treeMats.get(key);
  };
  const hullMaterial = (def) => outlineMaterial(def.ink || PAL.outline.leaf, { wind: def.wind ?? 0.018, windBase: def.windBase ?? 1.6, see: true });
  /**
   * How faded a ghost may be and still carry its ink line. A canopy four metres from the lens fades almost all
   * the way out (see kit.updateSee `f.screen`); drawing a full-strength ink hull round a tree that is no longer
   * there left a hard black ellipse arcing across a fifth of the frame with a dirty translucent wedge inside it.
   * Below this alpha the ghost keeps its depth and its sun shadow but drops its outline.
   */
  const INK_MIN = 0.22;

  function ensureSpecies(kind, override) {
    let S = grove.species.get(kind);
    if (!S) {
      const base = SPECIES[kind] || SPECIES.oak;
      S = { kind, def: Object.assign({}, base, override || {}), items: [], tiers: null, gkey: kind };
      if (override && (override.blobs || override.pine || override.detail != null)) S.gkey = `${kind}@${++grove.custom}`;
      grove.species.set(kind, S);
    } else if (override) { Object.assign(S.def, override); grove.dirty = true; }
    return S;
  }

  function addTreeInstance(S, t, shade) {
    const def = S.def, B = speciesBounds(def);
    const s = (t.s ?? 1) * (def.sizeK ?? 1), c = t.c ?? 1;
    const sx = (t.sx ?? 1) * s, sz = (t.sz ?? 1) * s, sy = (t.sy ?? (0.95 + (c - 0.9))) * s;
    // a trunkless species (bush, hedgerow) meets the grass with its whole underside, so it is planted at the LOWEST
    // ground under its own footprint — a bush on a slope buries its downhill side instead of hovering over it
    const bb = def.box || def.aoBox;
    const footR = def.trunk ? 0 : (bb ? Math.max(bb[0] * sx, bb[1] * sz) * 0.42 : (def.blobR ?? 0.7) * s);
    const y = (footR > 0 ? kit.lowestAt(t.x, t.z, footR, 6) : heightAt(t.x, t.z)) + (t.y0 ?? def.sink ?? -0.1);
    const rot = (def.align && t.ryaw != null) ? t.ryaw : (t.r ?? t.yaw ?? 0);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x, y, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0, 'YXZ')), new THREE.Vector3(sx, sy, sz));
    const tint = t.tint ?? 0, warm = Math.max(0, tint), cool = Math.max(0, -tint);
    const cy = y + B.cy * sy, cr = B.R * Math.max(sx, sz);
    const item = { x: t.x, z: t.z, cy, cr, tier: 1, ghost: 1, m: m.elements.slice(),
      col: [c * (1 + warm * 0.06), c * (1 - tint * 0.01), c * 0.95 * (1 + cool * 0.08)] };
    S.items.push(item);
    const box = def.box || def.aoBox;
    if (box) ao.box(t.x, t.z, box[0] * sx, box[1] * sz, rot, 0.6, def.aoS ?? 0.6);
    else if ((def.aoR ?? 1.9) > 0) ao.disc(t.x, t.z, (def.aoR ?? 1.9) * s, def.aoS ?? 0.65);
    // GROUNDING: the soft contact blob the hero gets. A trunked tree gets a pool at its root flare; a bush or a
    // hedge gets one its own width, which is what stops it reading as a sticker laid on the lawn.
    if (def.blobBox) kit.contact(t.x, t.z, 0, def.blobS ?? 0.8, { rx: def.blobBox[0] * sx, rz: def.blobBox[1] * sz, rot, spread: 1.3 });
    else if ((def.blobR ?? def.foot ?? 0.55) > 0) kit.contact(t.x, t.z, (def.blobR ?? (def.foot ?? 0.55) * 1.35) * s, def.blobS ?? 0.78, { spread: def.trunk ? POOL.spread : 1.3 });
    if (box) kit.footBox(t.x, t.z, box[0] * sx, box[1] * sz, rot);
    else if ((def.foot ?? 0.55) > 0) kit.footDisc(t.x, t.z, (def.foot ?? 0.55) * s);
    // a see-through candidate, linked to its grove instance so the ghost pass can draw exactly this tree.
    // Only things TALL enough to hide a child: a knee-high bush or a hedgerow can never cover him, and fading one
    // is the "it triggers on objects not covering the hero" complaint in miniature.
    if (def.fade !== false && cy + cr > y + 1.1) FADE.push({ x: t.x, z: t.z, cy, R: cr * 0.86, trunk: def.trunk ? 0.35 * s : 0, keep: 1, p: 0, hit: 0, kind: S.kind, item });
    // the woodland FLOOR: one broad, weak pool per tree that merges with its neighbours into leafy shade. Kept wide
    // and soft on purpose — a small strong disc reads as a hard-edged polygon decal stamped on the grass.
    if (shade && (def.shadeR ?? 5.0) > 0) shade.disc(t.x, t.z, (def.shadeR ?? 5.0) * s, def.shadeS ?? 0.5);
  }

  function disposeSpecies(S) {
    if (!S.tiers) return;
    for (const t of S.tiers.list) for (const m of [t.mesh, t.hull, t.gdepth, t.ghull, t.gbody]) if (m) { m.removeFromParent(); m.dispose(); }
    S.tiers = null;
  }

  // ── the SEE-THROUGH ghost: a clean alpha fade, never a screen-door dither ──────────────────────────────────
  /**
   * When a canopy covers the hero it is drawn ONCE, translucent, with its ink line kept — the DQV see-through.
   * The three meshes below share the tier's geometry and are packed with only the trees that are actually fading:
   *   gdepth  renderOrder 20, colour OFF, depth ON, pushed back a hair — the DEPTH PRE-PASS. It is also the tree
   *           that CASTS THE SUN SHADOW while it is a ghost (a faded tree still shades the grass).
   *   ghull   renderOrder 21, the shared ink hull material — its inside is depth-rejected by gdepth, so all that
   *           survives is the rim: the outline stays at full strength.
   *   gbody   renderOrder 22, transparent, depth-write OFF — only the FRONT-MOST canopy layer passes the depth
   *           test, so a ghost is one clean 40% surface instead of four stacked blobs (that muddiness is exactly
   *           why the old pass used a Bayer dither). Its alpha is PER INSTANCE (aGA), so each tree eases alone.
   */
  const SEE = { alpha: 0.40, outMs: 150, inMs: 220, hold: 0.1, max: 6 };
  const ghostMats = new Map();
  function ghostMaterials(def) {
    const wind = def.wind ?? 0.018, windBase = def.windBase ?? 1.6, key = `${wind}:${windBase}`;
    if (!ghostMats.has(key)) {
      const preset = Object.assign({}, TOON_PRESETS.canopy, { wind, windBase });
      const depth = makeToon({ map: Tex.bark(), vertexColors: true }, preset, [barkPatch]);
      depth.name = 'ghost-depth'; depth.colorWrite = false; depth.depthWrite = true;
      depth.polygonOffset = true; depth.polygonOffsetFactor = 0.6; depth.polygonOffsetUnits = 0.6;
      const body = makeToon({ map: Tex.bark(), vertexColors: true }, preset, [barkPatch, ghostAlphaPatch]);
      body.name = 'ghost-body'; body.transparent = true; body.depthWrite = false; body.opacity = 1;
      ghostMats.set(key, { depth, body });
    }
    return ghostMats.get(key);
  }
  /** Per-instance ghost alpha (so two trees fading at different moments never share one opacity). */
  function ghostAlphaPatch(sh) {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGA; varying float vDqGA;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vDqGA = aGA;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDqGA;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a *= clamp( vDqGA, 0.0, 1.0 );');
  }
  ghostAlphaPatch.key = 'ghostA';
  /** A geometry that SHARES the tier's attribute buffers but owns its own draw range and instanced attributes. */
  function share(src) {
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(src.attributes)) g.setAttribute(k, a);
    if (src.index) g.setIndex(src.index);
    g.userData.shared = true;
    return g;
  }
  function ensureGhost(S, t, parts) {
    if (t.gbody) return;
    const M = ghostMaterials(S.def), cap = SEE.max;
    const gd = share(parts.geo), gb = share(parts.geo);
    const aGA = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1);
    aGA.setUsage(THREE.DynamicDrawUsage);
    gb.setAttribute('aGA', aGA);
    const mkGhost = (geo, mat, order, name, cast) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.name = `${t.mesh.name}-${name}`;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.renderOrder = order; m.castShadow = !!cast; m.receiveShadow = false;
      m.count = 0; m.visible = false; m.frustumCulled = false;
      if (parts.shadow) {
        m.onBeforeRender = () => geo.setDrawRange(parts.main[0], parts.main[1]);
        if (cast) m.onBeforeShadow = () => geo.setDrawRange(parts.shadow[0], parts.shadow[1]);
      }
      scene.add(m);
      return m;
    };
    t.gdepth = mkGhost(gd, M.depth, 20, 'gdepth', !!parts.shadow);
    t.gbody = mkGhost(gb, M.body, 22, 'gbody', false);
    t.gbody.instanceMatrix = t.gdepth.instanceMatrix;             // one matrix drives all three ghost passes
    t.gAlpha = aGA;
    if (t.hull && parts.hull) {
      const gh = share(parts.hull);
      const m = new THREE.InstancedMesh(gh, t.hull.material, cap);
      m.name = `${t.mesh.name}-ghull`;
      m.instanceMatrix = t.gdepth.instanceMatrix;                 // the ink follows the ghost, matrix for matrix
      m.userData.isOutline = true;
      m.renderOrder = 21; m.castShadow = false; m.receiveShadow = false;
      m.count = 0; m.visible = false; m.frustumCulled = false;
      scene.add(m);
      t.ghull = m;
    }
  }

  function buildSpecies(S) {
    disposeSpecies(S);
    const def = S.def, n = S.items.length;
    if (!n) return;
    const outline = def.outline !== false && !low;
    const list = [], tiers = { list };
    const mk = (key, detail, hull, shadow) => {
      const parts = treeGeometry(S.gkey, def, detail, hull, grove.cache);
      const mesh = new THREE.InstancedMesh(parts.geo, treeMaterial(def), n);
      mesh.name = `tree-${S.kind}-${key}`;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = !!(shadow && parts.shadow);
      mesh.receiveShadow = true;
      mesh.count = 0; mesh.visible = false;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
      if (parts.shadow) {                                   // colour pass = canopy + trunk, shadow pass = trunk + proxy
        mesh.onBeforeRender = () => parts.geo.setDrawRange(parts.main[0], parts.main[1]);
        mesh.onBeforeShadow = () => parts.geo.setDrawRange(parts.shadow[0], parts.shadow[1]);
      }
      scene.add(mesh);
      let hullMesh = null;
      if (hull && parts.hull) {
        hullMesh = new THREE.InstancedMesh(parts.hull, hullMaterial(def), n);
        hullMesh.instanceMatrix = mesh.instanceMatrix;
        hullMesh.name = mesh.name + '-hull';
        hullMesh.userData.isOutline = true;
        hullMesh.castShadow = false; hullMesh.receiveShadow = false;
        hullMesh.count = 0; hullMesh.visible = false;
        hullMesh.boundingSphere = mesh.boundingSphere;
        scene.add(hullMesh);
      }
      const tier = { key, i: list.length, mesh, hull: hullMesh, parts, n: 0, ng: 0, sig: 0, lastSig: -1 };
      list.push(tier);
      return tier;
    };
    if (def.nearTier !== false && !low) tiers.near = mk('near', (def.detail ?? 1) + 1, outline, true);
    tiers.mid = mk('mid', def.detail ?? 1, outline, true);
    if ((def.detail ?? 1) > 0 || def.pine) tiers.far = mk('far', (def.detail ?? 1) - 1, false, false);
    S.tiers = tiers;
    for (const it of S.items) it.tier = tiers.mid.i;
  }

  grove.ensure = () => {
    if (!grove.dirty) return;
    grove.dirty = false;
    let inst = 0, meshes = 0;
    for (const S of grove.species.values()) {
      if (!S.tiers || S.tiers.built !== S.items.length) { buildSpecies(S); if (S.tiers) S.tiers.built = S.items.length; }
      inst += S.items.length;
      if (S.tiers) for (const t of S.tiers.list) meshes += t.hull ? 2 : 1;
    }
    grove.stats.instances = inst; grove.stats.meshes = meshes;
  };

  const NEAR_IN = 9, NEAR_OUT = 11.5, FAR_IN = 32, FAR_OUT = 29;
  const gF = new THREE.Frustum(), gM = new THREE.Matrix4(), gS = new THREE.Sphere();
  grove.update = (camera, focus) => {
    if (grove.dirty) grove.ensure();
    if (!grove.species.size) return;
    if (camera) { camera.updateMatrixWorld(); gF.setFromProjectionMatrix(gM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); }
    const cx = camera ? camera.position.x : 0, cz = camera ? camera.position.z : 0;
    const fx = focus ? focus.x : cx, fz = focus ? focus.z : cz;
    let visible = 0, ghosts = 0;
    for (const S of grove.species.values()) {
      const T = S.tiers; if (!T) continue;
      for (const t of T.list) { t.n = 0; t.ng = 0; (t.gList || (t.gList = [])).length = 0; t.sig = 0; t.x0 = t.z0 = t.y0 = 1e9; t.x1 = t.z1 = t.y1 = -1e9; t.rmax = 0; }
      for (let i = 0; i < S.items.length; i++) {
        const it = S.items[i];
        let ti = T.mid.i;
        if (camera) {
          gS.center.set(it.x, it.cy, it.z); gS.radius = it.cr + 4.5;      // the pad keeps shadows of just-offscreen trees
          if (!gF.intersectsSphere(gS)) continue;
          const dc = Math.hypot(cx - it.x, cz - it.z), df = Math.hypot(fx - it.x, fz - it.z);
          if (T.near && (it.tier === T.near.i ? dc < NEAR_OUT : dc < NEAR_IN)) ti = T.near.i;
          else if (T.far && (it.tier === T.far.i ? df > FAR_OUT : df > FAR_IN)) ti = T.far.i;
        }
        it.tier = ti;
        const t = T.list[ti];
        // SEE-THROUGH: a tree that is covering the hero leaves the solid pass altogether and is drawn by its
        // tier's three ghost meshes instead (depth pre-pass, ink rim, one clean translucent surface).
        const ga = it.ghost;                                              // signed: a negative alpha drops the ink
        if (ga != null && Math.abs(ga) < 0.995) {
          if (t.gList.length < SEE.max) { t.gList.push(it.m, ga); if (Math.abs(ga) > 0.02) ghosts++; }
          continue;                                                       // never in the solid pass, ghost or gone
        }
        t.mesh.instanceMatrix.array.set(it.m, t.n * 16);
        const ca = t.mesh.instanceColor.array, k3 = t.n * 3;
        ca[k3] = it.col[0]; ca[k3 + 1] = it.col[1]; ca[k3 + 2] = it.col[2];
        t.sig = (t.sig * 31 + i + 1) | 0;
        if (it.x - it.cr < t.x0) t.x0 = it.x - it.cr;
        if (it.x + it.cr > t.x1) t.x1 = it.x + it.cr;
        if (it.z - it.cr < t.z0) t.z0 = it.z - it.cr;
        if (it.z + it.cr > t.z1) t.z1 = it.z + it.cr;
        if (it.cy - it.cr < t.y0) t.y0 = it.cy - it.cr;
        if (it.cy + it.cr > t.y1) t.y1 = it.cy + it.cr;
        t.n++;
      }
      for (const t of T.list) {
        if (t.n !== t.mesh.count || t.sig !== t.lastSig) {
          t.mesh.count = t.n; t.lastSig = t.sig;
          t.mesh.instanceMatrix.needsUpdate = true; t.mesh.instanceColor.needsUpdate = true;
          if (t.hull) t.hull.count = t.n;
          if (t.n) {
            t.mesh.boundingSphere.center.set((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, (t.z0 + t.z1) / 2);
            t.mesh.boundingSphere.radius = 0.5 * Math.hypot(t.x1 - t.x0, t.y1 - t.y0, t.z1 - t.z0) + 0.5;
          }
        }
        t.mesh.visible = t.n > 0;
        if (t.hull) t.hull.visible = t.n > 0;
        // the ghosts, drawn ones first: a tree faded all the way out (the lens is inside it) still goes into the
        // depth mesh, because a faded tree must keep shading the grass
        if (t.gList.length || t.gbody) {
          if (t.gList.length) ensureGhost(S, t, t.parts);
          if (t.gbody) {
            // packed in three bands so each ghost mesh can stop early: inked (a > INK_MIN), faint (still drawn,
            // no outline), and gone (depth + sun shadow only)
            let inked = 0, vis = 0, all = 0;
            for (let pass = 0; pass < 3; pass++) {
              for (let q = 0; q < t.gList.length; q += 2) {
                const av = t.gList[q + 1], a = Math.abs(av);
                const band = av > INK_MIN ? 0 : a > 0.02 ? 1 : 2;
                if (band !== pass) continue;
                t.gdepth.instanceMatrix.array.set(t.gList[q], all * 16);
                t.gAlpha.array[all] = a;
                all++;
                if (pass === 0) { inked++; vis++; } else if (pass === 1) vis++;
              }
            }
            t.ng = vis;
            t.gdepth.count = all; t.gdepth.visible = all > 0;
            t.gbody.count = vis; t.gbody.visible = vis > 0;
            if (t.ghull) { t.ghull.count = inked; t.ghull.visible = inked > 0; }
            if (all) { t.gdepth.instanceMatrix.needsUpdate = true; t.gAlpha.needsUpdate = true; }
          }
        }
        visible += t.n;
      }
    }
    grove.stats.visible = visible;
    grove.stats.ghosts = ghosts;
  };

  /** Plant a mixed list of trees: [{kind, x, z, s, r, c, tint, sx, sz, sy}] (kind = a SPECIES id). */
  kit.trees = (list, { shade = null, species = null } = {}) => {
    const added = {};
    for (const t of list || []) {
      const kind = t.kind || 'oak';
      const S = ensureSpecies(kind, species ? species[kind] : null);
      addTreeInstance(S, t, shade);
      added[kind] = (added[kind] || 0) + 1;
    }
    for (const k of Object.keys(added)) counts[k] = (counts[k] || 0) + added[k];
    grove.dirty = true;
    return added;
  };

  /** The older single-species call (maps and the F3 demo rely on this signature). */
  kit.forest = (name, blobs, list, opts = {}) => {
    if (!list || !list.length) return null;
    const known = SPECIES[name] && (!blobs || SPECIES[name].blobs === blobs);
    const override = known
      ? { outline: opts.outline !== false, nearTier: opts.nearDist === undefined ? (SPECIES[name].nearTier !== false) : opts.nearDist > 0 }
      : { blobs: blobs || OAK, detail: opts.detail ?? 1, spherize: opts.spherize ?? 0.7,
          trunk: opts.trunkH ? { h: opts.trunkH } : null,
          dark: opts.dark ?? PAL.foliage.dark, light: opts.light ?? PAL.foliage.sun,
          wind: opts.wind ?? 0.018, windBase: opts.windBase ?? 1.6,
          shadow: opts.shadows !== false, outline: opts.outline !== false,
          aoR: opts.aoR ?? 1.9, aoS: opts.aoS ?? 0.65, foot: opts.trunkH ? 0.55 : 1.0,
          nearTier: (opts.nearDist ?? 0) > 0 };
    ensureSpecies(name, override);
    kit.trees(list.map(t => (t.kind === name ? t : Object.assign({}, t, { kind: name }))));
    return { kind: name, count: list.length };
  };

  kit.groveState = () => ({ species: grove.species.size, instances: grove.stats.instances, visible: grove.stats.visible, meshes: grove.stats.meshes, ghosts: grove.stats.ghosts || 0 });

  /** Dark clusters in belts along a rim: no outline, no shadow. */
  kit.forestBelt = ({ radius = 60, rows = 3, rowGap = 7, seed = 777, threshold = 0.42, step = 0.06, skip = null, yAt = heightAt } = {}) => {
    const fr = mulberry(seed), belt = [];
    for (let a = 0; a < Math.PI * 2; a += step) {
      const f = vnoise(Math.cos(a) * 4 + 20, Math.sin(a) * 4 + 20, 91);
      if (f < threshold) continue;
      for (let row = 0; row < rows; row++) {
        if ((row === 1 && f < threshold + 0.04) || (row === 2 && f < threshold + 0.14)) continue;
        const r = radius + row * rowGap + (fr() - 0.5) * 4, aa = a + row * 0.025 + (fr() - 0.5) * 0.02;
        const x = Math.cos(aa) * r, z = Math.sin(aa) * r;
        if (skip && skip(x, z)) continue;
        belt.push({ x, z, s: 1.0 + fr() * 0.45, r: fr() * 6.283, c: 0.85 + fr() * 0.2 });
      }
    }
    const g = canopyGeometry([[0, 1.8, 0, 1.75, 1], [1.6, 1.35, 0.4, 1.3, 0], [-1.5, 1.4, -0.3, 1.35, 0]], PAL.foliage.dark, PAL.foliage.mid, 1, 0.8);
    const mesh = new THREE.InstancedMesh(g, makeToon({ vertexColors: true }, 'farForest'), belt.length), m4 = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    belt.forEach((t, i) => { q.setFromAxisAngle(up, t.r); m4.compose(new THREE.Vector3(t.x, yAt(t.x, t.z) - 0.4 * t.s, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + fr() * 0.3), t.s)); mesh.setMatrixAt(i, m4); col.setRGB(t.c, t.c * (0.95 + fr() * 0.1), t.c * 0.95); mesh.setColorAt(i, col); });
    mesh.name = 'farForest'; scene.add(mesh); counts.farForest = belt.length;
    return mesh;
  };

  /**
   * Painted treetop cards, one draw call for the lot: the woodland and the wooded hills BEYOND the playable edge.
   * list: [{x, z, w (width in world units), v (0-3 atlas variant), haze (0-0.6), row}]
   * They turn to face the lens, flip their painted light to the sun's side, and haze toward the fog colour.
   */
  kit.cards = (list, { sunDir = null, shade = null, yAt = heightAt, sink = null } = {}) => {
    if (!list || !list.length) return null;
    const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0); normalsUp(geo);
    const aCard = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
    geo.setAttribute('aCard', aCard);
    const cardPatch = (sh) => {
      sh.uniforms.uDqSunDir = { value: sunDir || Toon.SUN_DIR };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aCard; uniform vec3 uDqSunDir; varying float vDqHaze;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
  {
    vec3 dqR = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
    float dqFlip = dot( dqR.xz, uDqSunDir.xz ) < 0.0 ? 1.0 : 0.0;
    vec2 dqUv = uv; dqUv.x = mix( dqUv.x, 1.0 - dqUv.x, dqFlip );
    float dqV = floor( aCard.x + 0.5 );
    #ifdef USE_MAP
      vMapUv = dqUv * 0.5 + vec2( mod( dqV, 2.0 ), 1.0 - floor( dqV / 2.0 ) ) * 0.5;
    #endif
    vDqHaze = aCard.y;
  }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec3 dqRt = vec3( viewMatrix[ 0 ][ 0 ], 0.0, viewMatrix[ 2 ][ 0 ] );
    dqRt = normalize( dqRt + vec3( 1e-5, 0.0, 0.0 ) );
    transformed = dqRt * position.x + vec3( 0.0, position.y, 0.0 );
  }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vDqHaze;')
        .replace('#include <fog_fragment>', `#include <fog_fragment>
  #ifdef USE_FOG
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, vDqHaze );
  #endif`);
    };
    cardPatch.key = 'forestcard';
    const mat = makeToon({ map: forestCardAtlas(), alphaTest: 0.5, side: THREE.DoubleSide }, { soft: 0.1, mid: 0.86, midEdge: 0.25, shadeSat: 1.05 }, [cardPatch, See.patch]);
    mat.alphaToCoverage = true;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    list.forEach((c, i) => {
      const y = yAt(c.x, c.z) - (sink != null ? sink : (c.sink != null ? c.sink : c.w * 0.14));
      m4.compose(v.set(c.x, y, c.z), q, sc.set(c.w, c.w * (0.95 + ((i * 7) % 5) * 0.03), c.w)); mesh.setMatrixAt(i, m4);
      const k = 0.9 + ((i * 13) % 7) * 0.025; mesh.setColorAt(i, col.setRGB(k, k, k * 0.96));
      aCard.setXYZ(i, c.v ?? ((i * 5) % 4), Math.min(0.6, c.haze ?? 0), 0);
      if (shade) shade.disc(c.x, c.z, c.w * 0.45, 0.85);
      // NOT a see-through candidate: the painted hills sit 20+ units beyond the walkable edge, so they can never
      // be between the lens and the hero. Registering them was pure per-frame cost and one more way to fade
      // something that was not covering him.
    });
    mesh.name = 'forestCards'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    scene.add(mesh);
    counts.forestCards = (counts.forestCards || 0) + list.length;
    return mesh;
  };

  /**
   * A ring of woodland around a field map: the world never ends in bare grass, and you can always see out over it.
   *   pointAt(angle, e) -> [x, z]      the ring of "radius" e (a superellipse matching the walkable edge)
   *   rows: [{kind: 'tree'|'card', e, spacing, jitter, size: [min, max], haze, pick(x, z, rnd, u), clump: {...}}]
   *        'tree' rows are real 3D trees of whatever species `pick` returns (mix them!), 'card' rows are painted
   *        treetops for the wooded hills behind. `clump` breaks a row into clumps with gaps you can see through.
   *   clear(x, z, rowIndex, row) -> true where no tree may stand (a village clearing, a lane mouth)
   *   shade: a makeAOMask the woodland floor is painted into · sunDir: rig.dir (cards flip their light to the sun)
   */
  kit.forestRing = ({ pointAt, rows = [], clear = () => false, seed = 4711, shade = null, sunDir = null, yAt = heightAt } = {}) => {
    const R = rows.map((row) => (row.pick || row.kind === 'card' ? row : Object.assign({}, row, { pick: () => row.species || 'edge' })));
    const { trees, cards } = ringPlacements({ pointAt, rows: R, clear, seed });
    if (trees.length) kit.trees(trees, { shade });
    const cardMesh = cards.length ? kit.cards(cards, { sunDir, shade, yAt }) : null;
    counts.forestTrees = (counts.forestTrees || 0) + trees.length;
    return { trees, cards, cardMesh };
  };

  /** Grass tufts, instanced, lit like the ground. accept(x, z) -> bool gates placement. */
  /**
   * Grass tufts. `dry(x, z) -> 0..1` mixes STRAW-coloured tufts through the green ones: a meadow in high summer
   * is not one hue, and a field that is 90 percent a single green is wallpaper however many tufts are in it.
   */
  kit.tufts = ({ count = 900, radius = 36, seed = 999, accept = () => true, rimOf = () => 0, boost = () => 0, dry = null } = {}) => {
    const list = [], tr = mulberry(seed);
    let tries = 0;
    while (list.length < count && tries++ < count * 40) {
      const x = (tr() - 0.5) * radius * 2, z = (tr() - 0.5) * radius * 2;
      if (!accept(x, z) || kit.blocked(x, z)) continue;
      const aoV = ao.sample(x, z), rim = rimOf(x, z) * 0.6 + smooth(0.05, 0.3, aoV) * 0.45;
      const cluster = vnoise(x * 0.2, z * 0.2, 71);
      if (tr() > smooth(0.55, 0.9, cluster) * 0.4 + rim + boost(x, z)) continue;
      list.push({ x, z, s: 0.5 + tr() * 0.55, r: tr() * 3.14, c: 0.95 + tr() * 0.25,
        d: dry ? clamp01(dry(x, z)) * (0.35 + 0.65 * tr()) : 0 });
    }
    const A = new THREE.PlaneGeometry(0.9, 0.62); A.translate(0, 0.29, 0); const B = A.clone().rotateY(Math.PI / 2);
    const g = normalsUp(mergeGeometries([A, B]));
    const mat = makeToon({ map: Tex.tuft(), alphaTest: 0.5, side: THREE.DoubleSide }, Object.assign({}, TOON_PRESETS.tuft, { wind: 0.14, windBase: 0.05 }));
    const mesh = new THREE.InstancedMesh(g, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    let dryN = 0;
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.r);
      m4.compose(new THREE.Vector3(t.x, heightAt(t.x, t.z) - 0.04, t.z), q, new THREE.Vector3(t.s, t.s * (0.8 + tr() * 0.4), t.s));
      mesh.setMatrixAt(i, m4);
      // green tuft -> straw tuft: the multiplier that takes PAL.grass toward PAL.grass.dry through the texture
      const d = t.d || 0; if (d > 0.25) dryN++;
      col.setRGB(t.c * (1 + d * 0.55), t.c * (1 + d * 0.10), t.c * 0.9 * (1 - d * 0.46));
      mesh.setColorAt(i, col);
    });
    mesh.name = 'tufts'; mesh.receiveShadow = true; scene.add(mesh); counts.tufts = list.length; counts.dryTufts = dryN;
    return mesh;
  };

  /**
   * Flower clusters: [{x, z, hue, n, spread}]. Each flower is a little PLANT, not a sticker — two crossed cards
   * standing in the grass on a green stem, with its foot below the ground line, so it reads as growing there from
   * any angle instead of as a flat card lying on the lawn.
   */
  kit.flowers = (clusters, { seed = 31337, accept = () => true } = {}) => {
    const fr = mulberry(seed), list = [];
    for (const cl of clusters) {
      const n = cl.n ?? (8 + (fr() * 12 | 0)), spread = cl.spread ?? 1.3;
      let put = 0;
      for (let k = 0; k < n; k++) {
        const aa = fr() * 6.283, dd = Math.sqrt(fr()) * spread, x = cl.x + Math.cos(aa) * dd, z = cl.z + Math.sin(aa) * dd;
        if (!accept(x, z) || kit.blocked(x, z)) continue;
        list.push({ x, z, hue: cl.hue, s: 0.78 + fr() * 0.42 });
        put++;
      }
      if (put > 2) ao.disc(cl.x, cl.z, spread * 1.05, 0.2);              // the patch sits in a faint pool of its own
    }
    // three heads at different heights and angles: a little clump standing UP out of the grass, the lowest one
    // touching it, so it reads as a plant from a grazing camera instead of a card lying flat on the lawn
    const petal = (w, y, ry, dx = 0) => { const p = new THREE.PlaneGeometry(w, w); p.translate(dx, y, 0); return p.rotateY(ry); };
    const g = normalsUp(mergeGeometries([petal(0.30, 0.27, 0), petal(0.23, 0.14, 1.25, 0.06), petal(0.20, 0.35, 2.45, -0.05)]));
    const mat = makeToon({ map: Tex.flower(), alphaTest: 0.45, side: THREE.DoubleSide }, Object.assign({}, TOON_PRESETS.flower, { wind: 0.2, windBase: 0 }));
    const mesh = new THREE.InstancedMesh(g, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    list.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler((fr() - 0.5) * 0.16, fr() * 6.28, (fr() - 0.5) * 0.16));
      m4.compose(new THREE.Vector3(t.x, heightAt(t.x, t.z) - 0.05, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      mesh.setMatrixAt(i, m4); mesh.setColorAt(i, col.copy(C3(t.hue)));
    });
    mesh.name = 'flowers'; mesh.receiveShadow = true; scene.add(mesh); counts.flowers = list.length;
    return mesh;
  };

  kit.lilyPads = (x, z, y, n = 4, seed = 9, spread = 2) => {
    const r = mulberry(seed);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = 0.4 + r() * spread, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, pr = 0.22 + r() * 0.12;
      addTo('paint', new THREE.CircleGeometry(pr, 14, 0.3, Math.PI * 2 - 0.6), M4(px, y + 0.02, pz, r() * 6, -Math.PI / 2), i % 2 ? PAL.foliage.light : PAL.foliage.mid);
      if (i % 3 === 0) for (let k = 0; k < 5; k++) { const pa = k / 5 * Math.PI * 2; addTo('paint', new THREE.IcosahedronGeometry(0.055, 0), M4(px + Math.cos(pa) * 0.06, y + 0.08, pz + Math.sin(pa) * 0.06), PAL.flower.pink); }
    }
  };

  kit.reeds = (x, z, n = 9, seed = 21, spread = 0.8, accept = null) => {
    const r = mulberry(seed);
    for (let i = 0; i < n; i++) {
      const px = x + (r() - 0.5) * spread * 2, pz = z + (r() - 0.5) * spread * 2, y = heightAt(px, pz), h = 0.9 + r() * 0.7;
      if (accept && !accept(px, pz, y)) { r(); r(); r(); r(); continue; }
      addTo('paint', new THREE.CylinderGeometry(0.02, 0.035, h, 5), M4(px, y + h / 2, pz, 0, (r() - 0.5) * 0.25, (r() - 0.5) * 0.25), PAL.foliage.poplar);
      if (r() < 0.55) addTo('paint', new THREE.CylinderGeometry(0.05, 0.05, 0.24, 5), M4(px, y + h + 0.05, pz, 0, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2), PAL.wood.dark);
    }
  };

  // ── signs: one atlas, one draw call for every board ──
  kit.signAtlas = (labels) => {
    const W = 1024, H = 128 * Math.max(1, Math.ceil(labels.length / 2)), cols = 2, rows = Math.ceil(labels.length / 2), sw = W / cols, sh = H / rows;
    const c = mkCanvas(W, H), g = ctx2(c), wood = Tex.wood().image;
    labels.forEach((txt, i) => {
      const x = (i % cols) * sw, y = Math.floor(i / cols) * sh;
      g.save(); g.beginPath(); g.rect(x, y, sw, sh); g.clip();
      g.drawImage(wood, x, y, sw, sh);
      g.fillStyle = css(PAL.wood.light, 0.62); g.fillRect(x, y, sw, sh);
      g.strokeStyle = css(PAL.wood.grain, 0.85); g.lineWidth = 8; g.strokeRect(x + 4, y + 4, sw - 8, sh - 8);
      let size = 70;
      while (Font.measure(txt, size).width > sw - 60 && size > 28) size -= 2;
      Font.draw(g, txt, x + sw / 2 + 2, y + sh / 2 + 5, { size, align: 'center', baseline: 'middle', fill: css(PAL.thatch.pale, 0.55), outline: false, shadow: false });
      Font.draw(g, txt, x + sw / 2, y + sh / 2 + 2, { size, align: 'center', baseline: 'middle', fill: PAL.wood.grain, outline: false, shadow: false });
      g.restore();
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
    return { tex: t, cols, rows, labels };
  };
  const signParts = [];
  /** A signpost with arrow boards: boards [{label, dir (radians, world yaw the arrow points to)}]. */
  kit.signpost = (atlas, x, z, boards, { h = 1.75 } = {}) => {
    const y = kit.lowestAt(x, z, 0.3, 4);
    addTo('wood', boxUV(0.16, h + 0.8, 0.16, 1.2), M4(x, y + (h + 0.8) / 2 - 0.48, z), PAL.wood.beam);
    addTo('wood', new THREE.ConeGeometry(0.14, 0.18, 4), M4(x, y + h + 0.32, z, Math.PI / 4), PAL.wood.beam);
    boards.forEach((b, k) => {
      const i = atlas.labels.indexOf(b.label); if (i < 0) return;
      const len = 1.7, bh = 0.46, arrow = 0.28;
      const shape = new THREE.Shape();
      shape.moveTo(-0.08, -bh / 2); shape.lineTo(len - arrow, -bh / 2); shape.lineTo(len, 0); shape.lineTo(len - arrow, bh / 2); shape.lineTo(-0.08, bh / 2); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
      geo.translate(0, 0, -0.035);
      const u0 = (i % atlas.cols) / atlas.cols, v0 = 1 - (Math.floor(i / atlas.cols) + 1) / atlas.rows, du = 1 / atlas.cols, dv = 1 / atlas.rows;
      const P = geo.attributes.position, N = geo.attributes.normal, uv = geo.attributes.uv;
      for (let q = 0; q < P.count; q++) {
        const px = P.getX(q), py = P.getY(q), nz = N.getZ(q);
        let u = clamp01((px + 0.02) / (len - arrow * 0.35)), v = clamp01((py + bh / 2) / bh);
        if (Math.abs(nz) > 0.5) { if (nz < 0) u = 1 - u; } else { u = 0.03; v = 0.5; }
        uv.setXY(q, u0 + (0.03 + u * 0.94) * du, v0 + (0.08 + v * 0.84) * dv);
      }
      const g = prep(geo, PAL.mask.on);
      g.applyMatrix4(M4(x, y + h - k * 0.56, z, b.dir - Math.PI / 2, 0, (vnoise(x + k, z, 4) - 0.5) * 0.1));
      signParts.push(g);
    });
    ao.disc(x, z, 0.6, 0.5); kit.contact(x, z, 0.4, 0.78); kit.footDisc(x, z, 0.4);
  };

  /** Build the meshes for a footbridge frame made by bridgeFrame(). */
  kit.footbridge = (F) => {
    const { L, W, arch, dir } = F, T = 0.1, N = 16;
    const at = (u, v, y) => new THREE.Vector3(F.cx + F.ax * u + F.sx * v, y, F.cz + F.az * u + F.sz * v);
    for (let k = 0; k < N; k++) {
      const u = -L / 2 + (k + 0.5) * L / N, y = F.archY(u), slope = -arch * 8 * u / (L * L);
      const p = at(u, 0, y - T / 2);
      const plank = boxUV(W * (0.97 + ((k * 7) % 3) * 0.015), T, L / N * 0.9, 0.9);
      addTo('wood', plank, M4(p.x, p.y, p.z, dir, -Math.atan(slope)), k % 3 === 1 ? PAL.wood.weathered : PAL.wood.light);
    }
    for (const side of [-1, 1]) {
      const v = side * (W / 2 - 0.08);
      for (let k = 0; k < N; k++) {
        const u = -L / 2 + (k + 0.5) * L / N, y = F.archY(u), slope = -arch * 8 * u / (L * L), p = at(u, side * (W / 2 - 0.12), y - T - 0.09);
        addTo('wood', boxUV(0.16, 0.2, L / N + 0.02, 1.2), M4(p.x, p.y, p.z, dir, -Math.atan(slope)), PAL.wood.beam);
      }
      const posts = F.posts;
      for (const u of posts) {
        const y = F.archY(u), p = at(u, v, y + 0.42), gy = heightAt(p.x, p.z);
        // the end posts run down to the bank, not to the deck, so nothing is left hanging off the end of the bridge
        const foot = Math.abs(u) > F.L / 2 - 0.4 ? Math.min(y - 0.2, gy - 0.25) : y - 0.2;
        const hh = (y + 0.9) - foot;
        addTo('wood', boxUV(0.14, hh, 0.14, 1.2), M4(p.x, foot + hh / 2, p.z, dir), PAL.wood.beam);
        addTo('wood', new THREE.SphereGeometry(0.09, 8, 6), M4(p.x, y + 0.94, p.z), PAL.wood.beam);
      }
      for (let k = 0; k < posts.length - 1; k++) {
        const ua = posts[k], ub = posts[k + 1], um = (ua + ub) / 2, ya = F.archY(ua) + 0.82, yb = F.archY(ub) + 0.82, p = at(um, v, (ya + yb) / 2);
        addTo('wood', boxUV(0.09, 0.1, ub - ua + 0.08, 1.0), M4(p.x, p.y, p.z, dir, -Math.atan2(yb - ya, ub - ua)), PAL.wood.light);
        const q = at(um, v, (ya + yb) / 2 - 0.36);
        addTo('wood', boxUV(0.07, 0.08, ub - ua, 1.0), M4(q.x, q.y, q.z, dir, -Math.atan2(yb - ya, ub - ua)), PAL.wood.weathered);
      }
    }
    for (const e of F.ends) { ao.disc(e[0], e[1], 1.3, 0.5); kit.contact(e[0], e[1], 0, 0.6, { rx: W * 0.55, rz: 0.55, rot: dir }); }
    kit.footBox(F.cx, F.cz, W + 0.4, L + 0.4, dir);
    return F;
  };

  /**
   * A washing line between two posts with cloths that hang and sway (negative wind: they hang from the line).
   * The cloth textures are atlased into one canvas, so the whole washing is ONE mesh.
   */
  kit.laundry = (A, B, cloths) => {
    const LA = new THREE.Vector3(A[0], kit.lowestAt(A[0], A[1], 0.28, 4), A[1]), LB = new THREE.Vector3(B[0], kit.lowestAt(B[0], B[1], 0.28, 4), B[1]);
    const yaw = Math.atan2(LB.x - LA.x, LB.z - LA.z) + Math.PI / 2;
    for (const P of [LA, LB]) {
      addTo('wood', boxUV(0.14, 2.75, 0.14, 1.2), M4(P.x, P.y + 0.9, P.z), PAL.wood.beam);
      addTo('wood', boxUV(0.5, 0.1, 0.1, 1.2), M4(P.x, P.y + 2.18, P.z, yaw), PAL.wood.beam);
      ao.disc(P.x, P.z, 0.5, 0.5); kit.contact(P.x, P.z, 0.32, 0.72); kit.footDisc(P.x, P.z, 0.3);
    }
    const lineY = Math.max(LA.y, LB.y) + 2.15;
    const rope = new THREE.CatmullRomCurve3([new THREE.Vector3(LA.x, lineY, LA.z), new THREE.Vector3(lerp(LA.x, LB.x, 0.5), lineY - 0.22, lerp(LA.z, LB.z, 0.5)), new THREE.Vector3(LB.x, lineY, LB.z)]);
    addTo('paint', new THREE.TubeGeometry(rope, 24, 0.022, 5), null, PAL.cloth.rope);
    const lineDir = new THREE.Vector3().subVectors(LB, LA).setY(0).normalize(), side = new THREE.Vector3(-lineDir.z, 0, lineDir.x);
    const span = LA.distanceTo(LB);
    if (!cloths || !cloths.length) return null;
    const CS = 128, n = cloths.length, cv = mkCanvas(CS * n, CS), g2 = ctx2(cv);
    cloths.forEach((cd, i) => {
      try { g2.drawImage(cd.tex.image, i * CS, 0, CS, CS); }
      catch (_) { g2.fillStyle = css(PAL.cloth.cream, 1); g2.fillRect(i * CS, 0, CS, CS); }
    });
    const atlas = new THREE.CanvasTexture(cv); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4; atlas.needsUpdate = true;
    const parts = [];
    cloths.forEach((cd, ci) => {
      const g = new THREE.PlaneGeometry(cd.w, cd.h, 8, 8), p = g.attributes.position, uv = g.attributes.uv;
      const c0 = rope.getPoint(cd.t);
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), ly = p.getY(i) - cd.h / 2;
        const along = c0.clone().addScaledVector(lineDir, lx);
        const topY = rope.getPoint(Math.min(1, Math.max(0, cd.t + lx / span))).y;
        const billow = Math.sin((lx / cd.w + 0.5) * Math.PI) * 0.06 * (-ly / cd.h) + Math.sin((lx / cd.w) * 9) * 0.02;
        p.setXYZ(i, along.x + side.x * billow, topY + ly, along.z + side.z * billow);
        uv.setXY(i, (uv.getX(i) + ci) / n, uv.getY(i));
      }
      g.computeVertexNormals();
      parts.push(g.toNonIndexed());
      for (const e of [-1, 1]) { const q = c0.clone().addScaledVector(lineDir, e * cd.w * 0.36); addTo('paint', new THREE.BoxGeometry(0.05, 0.14, 0.05), M4(q.x, rope.getPoint(cd.t).y - 0.02, q.z), PAL.wood.light); }
    });
    const mat = makeToon({ map: atlas, side: THREE.DoubleSide }, Object.assign({}, TOON_PRESETS.cloth, { wind: -0.07, windBase: lineY - 0.05 }), [See.patch]);
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'laundry'; scene.add(mesh);
    return mesh;
  };

  /**
   * Instanced critters: one merged body geometry + one head geometry (vertex coloured), with hull outlines.
   * spec: {name, body: BufferGeometry (colour attr), head: BufferGeometry, headAt: [x, y, z], count, outline, wind?}
   * Returns {set(i, x, y, z, yaw, headPitch, headYaw, scale, bob), commit(), count}
   */
  kit.critters = ({ name, body, head, headAt, count, outline = OUTLINE.slime, headOutline = true, preset = 'character', bounds = null }) => {
    const bodyMat = makeToon({ vertexColors: true }, preset, [See.patch]), headMat = makeToon({ vertexColors: true }, preset, [See.patch]);
    const B = new THREE.InstancedMesh(body, bodyMat, count), H = new THREE.InstancedMesh(head, headMat, count);
    B.name = name + '-body'; H.name = name + '-head';
    // moving things get blob shadows (ART-DIRECTION §1.6), not sun shadows: cheap, soft and never swimming
    for (const m of [B, H]) { m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
    const hb = outline ? new THREE.InstancedMesh(hullGeometry(body, outline), outlineMaterial(PAL.outline.char, { see: true }), count) : null;
    const hh = outline && headOutline ? new THREE.InstancedMesh(hullGeometry(head, outline), outlineMaterial(PAL.outline.char, { see: true }), count) : null;
    if (hb) { hb.instanceMatrix = B.instanceMatrix; hb.frustumCulled = false; hb.name = name + '-body-hull'; scene.add(hb); }
    if (hh) { hh.instanceMatrix = H.instanceMatrix; hh.frustumCulled = false; hh.name = name + '-head-hull'; scene.add(hh); }
    // a herd that stays in one place ({x, y, z, r} covering everywhere it can wander) is culled like anything else
    if (bounds) for (const m of [B, H, hb, hh]) if (m) { m.boundingSphere = new THREE.Sphere(new THREE.Vector3(bounds.x, bounds.y ?? 0, bounds.z), bounds.r); m.frustumCulled = true; }
    const m4 = new THREE.Matrix4(), hm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    counts[name] = count;
    return {
      count, body: B, head: H,
      set(i, x, y, z, yaw, headPitch = 0, headYaw = 0, scale = 1, squash = 0) {
        q.setFromAxisAngle(v.set(0, 1, 0), yaw);
        m4.compose(v.set(x, y, z), q, s.set(scale * (1 + squash * 0.5), scale * (1 - squash), scale * (1 + squash * 0.5)));
        B.setMatrixAt(i, m4);
        e.set(headPitch, headYaw, 0, 'YXZ'); q.setFromEuler(e);
        hm.compose(v.set(headAt[0], headAt[1], headAt[2]), q, s.set(1, 1, 1));
        H.setMatrixAt(i, m4.multiply(hm));
      },
      commit() { B.instanceMatrix.needsUpdate = true; H.instanceMatrix.needsUpdate = true; },
    };
  };

  // ═══ farm and lane furniture (all merged into the kit's buckets: no extra draw calls) ═════════════════════

  /** A stone well: round wall, oak posts, a little thatched roof, crank, rope and bucket. */
  kit.well = (x, z, rot = 0, { s = 1 } = {}) => {
    const y = kit.lowestAt(x, z, 0.95 * s, 8), base = M4(x, y, z, rot, 0, 0, s), add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const R = 0.82;
    // the wall and BOTH roof posts run well below the ground line, so no foot can end in mid-air on the slope
    add('stone', wrapUV(new THREE.CylinderGeometry(R, R * 1.06, 1.12, 16, 1, true), 4, 1.12 / Tex.worldSize('stone')), M4(0, 0.22, 0), PAL.stone.mid);
    add('stone', new THREE.TorusGeometry(R, 0.075, 6, 18), M4(0, 0.79, 0, 0, Math.PI / 2), PAL.stone.light);
    add('paint', wrapUV(new THREE.CylinderGeometry(R - 0.06, R - 0.06, 0.7, 14, 1, true), 2, 1), M4(0, 0.42, 0), PAL.shadow.contact);  // the shaft
    add('paint', new THREE.CircleGeometry(R - 0.08, 14), M4(0, 0.12, 0, 0, -Math.PI / 2), mixHex(PAL.water.deep, PAL.shadow.contact, 0.45));                              // water, far down
    for (const e of [-1, 1]) {
      add('wood', boxUV(0.15, 2.3, 0.15, 1.2), M4(e * (R - 0.04), 0.7, 0), PAL.wood.beam);
      add('wood', boxUV(0.09, 0.34, 0.09, 1.2), M4(e * (R - 0.24), 1.5, 0, 0, 0, e * 0.8), PAL.wood.beam);
    }
    // roof: two thatched slopes meeting on a ridge beam
    const RW = 0.98, RP = 0.62, RL = 1.75;
    add('wood', boxUV(0.09, 0.09, RL + 0.12, 1.2), M4(0, 1.93, 0), PAL.wood.beam);
    for (const e of [-1, 1]) {
      add('thatch', boxUV(RW, 0.1, RL, 1), M4(e * 0.5 * RW * Math.cos(RP), 1.9 - 0.5 * RW * Math.sin(RP), 0, 0, 0, -e * RP), PAL.thatch.light);
      add('thatch', boxUV(0.12, 0.12, RL + 0.04, 1), M4(e * RW * Math.cos(RP), 1.9 - RW * Math.sin(RP) + 0.02, 0, 0, 0, -e * RP), PAL.thatch.mid);
    }
    // crank, rope and bucket — the windlass stops INSIDE the posts and its handle is carried out on a short axle
    add('wood', wrapUV(new THREE.CylinderGeometry(0.075, 0.075, 1.32, 8), 1, 1), M4(0, 1.02, 0, 0, 0, Math.PI / 2), PAL.wood.light);
    add('paint', wrapUV(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 6), 1, 1), M4(R + 0.06, 1.02, 0, 0, 0, Math.PI / 2), PAL.paint.iron);
    add('paint', new THREE.TorusGeometry(0.14, 0.03, 4, 10), M4(R + 0.24, 1.02, 0, 0, 0, Math.PI / 2), PAL.paint.iron);
    add('paint', wrapUV(new THREE.CylinderGeometry(0.016, 0.016, 0.46, 5), 1, 1), M4(0, 0.79, 0), PAL.cloth.rope);
    const prof = []; for (let i = 0; i <= 5; i++) { const t = i / 5; prof.push(new THREE.Vector2(0.16 + t * 0.05, t * 0.32)); }
    add('wood', wrapUV(new THREE.LatheGeometry(prof, 10), 2, 0.4), M4(0, 0.4, 0), PAL.wood.mid);          // the bucket, hung in the mouth
    add('paint', new THREE.TorusGeometry(0.21, 0.018, 4, 12), M4(0, 0.7, 0, 0, Math.PI / 2), PAL.paint.iron);
    ao.disc(x, z, 1.5 * s, 0.68); kit.contact(x, z, 1.15 * s, 0.95); kit.footDisc(x, z, 1.0 * s);
    return { x, z, r: R * s };
  };

  /** Hay: a round bale on its side, or a rectangular one. Twine and a spiral end, in thatch. */
  kit.hayBale = (x, z, rot = 0, { round = true, s = 1, lift = 0 } = {}) => {
    const y = (lift ? heightAt(x, z) : kit.lowestAt(x, z, 0.62 * s, 6)) + lift, base = M4(x, y, z, rot, 0, 0, s), add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    if (round) {
      const R = 0.56, L = 1.34;
      add('thatch', wrapUV(new THREE.CylinderGeometry(R, R, L, 16, 1, true), 3, L / Tex.worldSize('thatch')), M4(0, R, 0, 0, 0, Math.PI / 2), PAL.thatch.light);
      // the ends are ROLLED, not painted: a recessed face inside a rolled rim, a coil of straw wound into it, and
      // a few wisps sticking out — never the flat bullseye a textured cylinder cap gives you
      for (const e of [-1, 1]) {
        const dir = e > 0 ? Math.PI / 2 : -Math.PI / 2;
        add('thatch', wrapUV(new THREE.CylinderGeometry(R * 0.9, R, 0.16, 16, 1, true), 3, 0.2), M4(e * (L / 2 - 0.08), R, 0, 0, 0, Math.PI / 2), PAL.thatch.mid);
        add('paint', new THREE.CircleGeometry(R * 0.9, 16), M4(e * (L / 2 - 0.1), R, 0, dir, 0, 0), mixHex(PAL.thatch.mid, PAL.thatch.dark, 0.35));
        for (let k = 0; k < 3; k++) {                                   // the coil: three arcs, each a third round
          const rr = R * (0.26 + k * 0.24);
          add('paint', new THREE.TorusGeometry(rr, 0.022, 4, 12, Math.PI * 1.5), M4(e * (L / 2 - 0.1 + 0.012 * (k + 1)), R, 0, dir, 0, k * 2.1), k % 2 ? PAL.thatch.pale : PAL.thatch.light);
        }
        for (let k = 0; k < 4; k++) {
          const a = 0.6 + k * 1.5, rr = R * (0.45 + (k % 3) * 0.17);
          add('paint', new THREE.ConeGeometry(0.018, 0.2 + (k % 2) * 0.08, 4), M4(e * (L / 2 + 0.04), R + Math.sin(a) * rr, Math.cos(a) * rr, 0, 0, e * (1.2 + (k % 2) * 0.3)), PAL.thatch.pale);
        }
      }
      for (const u of [-0.3, 0.3]) add('paint', new THREE.TorusGeometry(R + 0.015, 0.02, 4, 16), M4(u, R, 0, 0, 0, Math.PI / 2), PAL.cloth.rope);
      ao.disc(x, z, 1.15 * s, 0.7);
      if (!lift) kit.contact(x, z, 0, 0.9, { rx: L * 0.5 * s, rz: R * 0.95 * s, rot: rot + Math.PI / 2 });
      kit.footBox(x, z, 1.3 * s, 1.3 * s, rot);
      return { r: R * s };
    }
    const W = 1.05, H = 0.58, D = 0.6;
    add('thatch', boxUV(W, H + (lift ? 0 : 0.16), D, 1), M4(0, H / 2 - (lift ? 0 : 0.08), 0), PAL.thatch.light);
    for (const u of [-0.26, 0.26]) add('paint', boxUV(0.03, H + 0.02, D + 0.02, 1), M4(u, H / 2, 0), PAL.cloth.rope);
    ao.box(x, z, W, D, rot, 0.5, 0.65);
    if (!lift) kit.contact(x, z, 0, 0.9, { rx: W * 0.55 * s, rz: D * 0.6 * s, rot });
    kit.footBox(x, z, W * s, D * s, rot);
    return { r: W * 0.5 * s };
  };

  /** A stile over a fence: two posts, steps either side, a worn top plank. */
  kit.stile = (x, z, rot = 0) => {
    const y = kit.lowestAt(x, z, 0.8, 8), base = M4(x, y, z, rot), add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    for (const e of [-1, 1]) add('wood', boxUV(0.14, 1.75, 0.14, 1.2), M4(e * 0.5, 0.4, 0), PAL.wood.beam);
    add('wood', boxUV(1.2, 0.1, 0.3, 0.9), M4(0, 1.02, 0), PAL.wood.weathered);
    for (const e of [-1, 1]) {
      add('wood', boxUV(1.1, 0.09, 0.26, 0.9), M4(0, 0.66, e * 0.34), PAL.wood.light);
      add('wood', boxUV(1.1, 0.09, 0.26, 0.9), M4(0, 0.34, e * 0.6), PAL.wood.light);
    }
    ao.box(x, z, 1.4, 1.5, rot, 0.5, 0.55);
    kit.contact(x, z, 0, 0.72, { rx: 0.8, rz: 0.75, rot });
  };

  /**
   * A lantern on a post: an iron CAGE (four corner uprights, a base tray, a capped roof and a ring) round a warm
   * glass box with a brighter flame inside it. The glass and the flame go in the 'glow' bucket, which is unshaded
   * and brightens as the sky goes over to dusk and night (ENV), and a soft halo, centred on the pane itself,
   * fades in with them — so a lane has warm light in it after dark instead of nothing at all.
   *
   * It used to be four SOLID iron panels 0.33 wide round a 0.30 glass box: the light could never be seen from any
   * angle, and ten of these read as flat grey plates by day and black blocks at night. The uprights are 0.05
   * square and stand at the corners, so from every bearing the glass is the biggest thing on the lamp.
   */
  kit.lantern = (x, z, rot = 0, { h = 2.0, glow = true } = {}) => {
    const y = kit.lowestAt(x, z, 0.3, 4), base = M4(x, y, z, rot), add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const GLASS = mixHex(PAL.interior.lamp, PAL.paint.gold, 0.30);        // amber glass, warm even at noon
    const FLAME = mixHex(PAL.interior.lamp, PAL.char.white, 0.45);        // the wick, brighter than the pane
    const IRON = PAL.paint.iron, IRON_LIT = mixHex(PAL.paint.iron, PAL.interior.lamp, 0.22);
    add('wood', boxUV(0.13, h + 0.4, 0.13, 1.2), M4(0, h / 2 - 0.2, 0), PAL.wood.beam);
    add('paint', boxUV(0.055, 0.055, 0.42, 1), M4(0, h - 0.05, 0.2), IRON);                  // the bracket arm
    add('paint', wrapUV(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 5), 1, 1), M4(0, h - 0.14, 0.38), IRON);
    const ly = h - 0.42, D = 0.38;
    // the glass box, then the flame inside it — both unshaded, both visible from every side
    add('glow', new THREE.BoxGeometry(0.30, 0.34, 0.30), M4(0, ly, D), GLASS);
    add('glow', new THREE.BoxGeometry(0.10, 0.17, 0.10), M4(0, ly - 0.03, D), FLAME);
    add('glow', new THREE.ConeGeometry(0.052, 0.13, 6), M4(0, ly + 0.11, D), FLAME);
    // the cage: four corner uprights (0.05 square) — NOT panels. The glass shows between them from any bearing.
    for (const [dx, dz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) {
      add('paint', new THREE.BoxGeometry(0.05, 0.40, 0.05), M4(dx, ly, D + dz), IRON_LIT);
    }
    add('paint', new THREE.BoxGeometry(0.36, 0.045, 0.36), M4(0, ly - 0.20, D), IRON);       // the tray it stands on
    add('paint', new THREE.BoxGeometry(0.34, 0.035, 0.34), M4(0, ly + 0.20, D), IRON_LIT);   // the eave under the cap
    add('paint', new THREE.ConeGeometry(0.27, 0.19, 4), M4(0, ly + 0.30, D, Math.PI / 4), IRON);
    add('paint', new THREE.TorusGeometry(0.045, 0.014, 4, 8), M4(0, ly + 0.44, D, 0, Math.PI / 2), IRON);
    ao.disc(x, z, 0.6, 0.5); kit.contact(x, z, 0.34, 0.75); kit.footDisc(x, z, 0.32);
    if (glow) HALOS.push({ x: x + Math.sin(rot) * D, y: y + ly, z: z + Math.cos(rot) * D, r: 1.35 });
    return { x, y: y + ly, z };
  };

  // the halos, built once by kit.flush(): one additive billboarded mesh whose opacity follows ENV's night weight
  const HALOS = [];
  function buildHalos() {
    if (!HALOS.length) return null;
    const S = 64, c = mkCanvas(S), g = ctx2(c);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, css(PAL.interior.lamp, 0.95)); gr.addColorStop(0.28, css(PAL.interior.lamp, 0.55));
    gr.addColorStop(0.62, css(PAL.flower.yellow, 0.16)); gr.addColorStop(1, css(PAL.flower.yellow, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 6.283); g.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    mat.onBeforeCompile = (sh) => {
      try {
        sh.uniforms.uDqLit = ENV.u.uEnvNight; sh.uniforms.uDqDusk = ENV.u.uEnvDusk;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDqLit; uniform float uDqDusk;')
          .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= clamp( uDqLit + uDqDusk * 0.55, 0.0, 1.0 );');
      } catch (e) { reportError('props lantern halo patch', e); }
    };
    mat.customProgramCacheKey = () => 'dqhalo';
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, HALOS.length);
    mesh.name = 'lanternGlow'; mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const list = HALOS.slice();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    animators.push((t, dt, cam) => {
      if (cam) q.copy(cam.quaternion);
      list.forEach((L, i) => {
        const flick = L.r * (0.94 + 0.06 * Math.sin(t * 3.1 + i * 2.2) + 0.03 * Math.sin(t * 7.7 + i));
        m4.compose(v.set(L.x, L.y, L.z), q, sc.set(flick, flick, flick));
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      void dt;
    });
    scene.add(mesh);
    counts.lanterns = list.length;
    HALOS.length = 0;
    return mesh;
  }

  /** A scarecrow: crossed poles, a patched coat, straw cuffs, a sack head with a stitched smile and a straw hat. */
  kit.scarecrow = (x, z, rot = 0) => {
    const y = kit.lowestAt(x, z, 0.3, 4), base = M4(x, y, z, rot), add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(0.11, 2.3, 0.11, 1.2), M4(0, 0.78, 0), PAL.wood.beam);
    add('wood', boxUV(1.5, 0.09, 0.09, 1.2), M4(0, 1.36, 0), PAL.wood.weathered);
    // coat and sleeves
    add('paint', new THREE.CylinderGeometry(0.3, 0.38, 0.62, 10), M4(0, 1.1, 0), PAL.cloth.blue);
    add('paint', new THREE.BoxGeometry(0.16, 0.16, 0.02), M4(0.2, 1.12, 0.3), PAL.cloth.red);
    add('paint', new THREE.BoxGeometry(0.12, 0.12, 0.02), M4(-0.16, 1.0, 0.29), PAL.cloth.mustard);
    for (const e of [-1, 1]) {
      add('paint', new THREE.CylinderGeometry(0.12, 0.1, 0.62, 8), M4(e * 0.46, 1.34, 0, 0, 0, Math.PI / 2), PAL.cloth.mustard);
      for (let k = 0; k < 4; k++) add('paint', new THREE.ConeGeometry(0.035, 0.24, 4), M4(e * 0.78, 1.34 + (k - 1.5) * 0.045, (k - 1.5) * 0.04, 0, 0, e * (1.35 + k * 0.08)), PAL.thatch.light);
    }
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; add('paint', new THREE.ConeGeometry(0.035, 0.26, 4), M4(Math.cos(a) * 0.26, 0.76, Math.sin(a) * 0.26, 0, 0, 0), PAL.thatch.mid); }
    // head: a sack, a face, a hat
    add('paint', new THREE.SphereGeometry(0.25, 12, 9), M4(0, 1.74, 0, 0, 0, 0, 1), PAL.cloth.cream);
    add('paint', new THREE.TorusGeometry(0.16, 0.035, 4, 10), M4(0, 1.54, 0, 0, Math.PI / 2), PAL.cloth.rope);
    for (const e of [-1, 1]) add('paint', new THREE.SphereGeometry(0.035, 7, 6), M4(e * 0.09, 1.79, 0.22), PAL.outline.char);
    for (let k = 0; k < 5; k++) add('paint', new THREE.BoxGeometry(0.025, 0.05, 0.02), M4((k - 2) * 0.045, 1.67 + Math.abs(k - 2) * 0.014, 0.23, 0, 0, (k - 2) * 0.3), PAL.outline.char);
    add('paint', new THREE.CylinderGeometry(0.42, 0.42, 0.035, 14), M4(0, 1.93, -0.02, 0, 0, 0.12), PAL.thatch.mid);
    add('paint', new THREE.ConeGeometry(0.25, 0.26, 12), M4(0.03, 2.06, -0.02, 0, 0, 0.12), PAL.thatch.light);
    ao.disc(x, z, 1.0, 0.6); kit.contact(x, z, 0.62, 0.8); kit.footDisc(x, z, 0.45);
    return { x, z, r: 0.3 };
  };

  /** A kitchen garden: earth rows with cabbages and carrot tops, all draped over the real ground. */
  kit.vegPatch = (x, z, w, d, rot = 0, seed = 9) => {
    const y = kit.lowestAt(x, z, Math.max(w, d) * 0.5, 8), base = M4(x, y, z, rot), r = mulberry(seed);
    const c0 = Math.cos(rot), s0 = Math.sin(rot);
    const localY = (lx, lz) => heightAt(x + lx * c0 + lz * s0, z - lx * s0 + lz * c0) - y;
    const bedGeo = new THREE.PlaneGeometry(w, d, Math.max(2, Math.round(w / 0.7)), Math.max(2, Math.round(d / 0.7))).rotateX(-Math.PI / 2);
    { const p = bedGeo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, localY(p.getX(i), p.getZ(i)) + 0.05);
      bedGeo.computeVertexNormals();
    }
    addTo('dirtbed', bedGeo, base, PAL.dirt.base);
    const rows = Math.max(2, Math.round(d / 0.55));
    for (let j = 0; j < rows; j++) {
      const lz = (j / (rows - 1) - 0.5) * (d - 0.35), ry = localY(0, lz);
      addTo('dirtbed', boxUV(w - 0.2, 0.14, 0.22, 1), base.clone().multiply(M4(0, ry + 0.08, lz)), PAL.dirt.dark);
      const n = Math.max(2, Math.round((w - 0.4) / 0.42));
      for (let i = 0; i < n; i++) {
        const lx = (i / (n - 1) - 0.5) * (w - 0.5) + (r() - 0.5) * 0.06, hy = localY(lx, lz);
        if (j % 2 === 0) {
          addTo('paint', new THREE.IcosahedronGeometry(0.15 + r() * 0.04, 1), base.clone().multiply(M4(lx, hy + 0.2, lz)), PAL.foliage.light);
          addTo('paint', new THREE.IcosahedronGeometry(0.095, 0), base.clone().multiply(M4(lx + 0.04, hy + 0.28, lz - 0.03)), PAL.foliage.sun);
        } else {
          for (let k = 0; k < 4; k++) addTo('paint', new THREE.ConeGeometry(0.035, 0.3, 4), base.clone().multiply(M4(lx + (k - 1.5) * 0.03, hy + 0.2, lz, 0, 0, (k - 1.5) * 0.24)), PAL.foliage.poplar);
        }
      }
    }
    ao.box(x, z, w, d, rot, 0.45, 0.4); kit.contact(x, z, 0, 0.42, { rx: w * 0.55, rz: d * 0.55, rot, spread: 1.2 }); kit.footBox(x, z, w, d, rot);
  };

  /** A ladder leaning against something (the orchard's, at picking height). */
  kit.ladder = (x, z, rot = 0, { h = 2.6, lean = 0.28 } = {}) => {
    const y = kit.lowestAt(x, z, 0.3, 4), base = M4(x, y, z, rot, 0, 0, 1), add = (g, m, c) => addTo('wood', g, base.clone().multiply(m), c);
    for (const e of [-1, 1]) add(boxUV(0.07, h + 0.3, 0.07, 0.9), M4(e * 0.22, h / 2 * Math.cos(lean) - 0.15, -h / 2 * Math.sin(lean), 0, -lean), PAL.wood.light);
    const rungs = Math.round(h / 0.34);
    for (let k = 1; k < rungs; k++) {
      const t = k / rungs;
      add(boxUV(0.5, 0.05, 0.05, 0.9), M4(0, h * t * Math.cos(lean), -h * t * Math.sin(lean), 0, -lean), PAL.wood.mid);
    }
    ao.disc(x, z, 0.7, 0.4); kit.contact(x, z, 0, 0.6, { rx: 0.42, rz: 0.72, rot }); kit.footDisc(x, z, 0.35);
  };

  /** A crate heaped with apples (the orchard corner). */
  kit.appleCrate = (x, z, rot = 0, { s = 1, seed = 4 } = {}) => {
    kit.crate(x, z, rot, s);
    const y = heightAt(x, z), base = M4(x, y, z, rot, 0, 0, s), r = mulberry(seed);
    const hues = [PAL.flower.red, mixHex(PAL.flower.red, PAL.flower.yellow, 0.4), PAL.tile.mid];
    for (let i = 0; i < 9; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * 0.3;
      addTo('paint', new THREE.IcosahedronGeometry(0.1 + r() * 0.025, 0), base.clone().multiply(M4(Math.cos(a) * d, 0.78 + r() * 0.1, Math.sin(a) * d)), hues[(r() * hues.length) | 0]);
    }
  };

  // ═══ life: butterflies, ground birds, pollen motes, pond ripples ══════════════════════════════════════════

  /**
   * Butterflies flitting around flower patches: [{x, z, hue}] — one instanced mesh for every wing. The wings are
   * inked, shaded like everything else, and NEVER lie flat open: a butterfly caught mid-flap with flat unshaded
   * wings reads as a yellow card hanging in the air, which is exactly what it must not look like.
   */
  kit.butterflies = (spots, { perSpot = 1 } = {}) => {
    if (!spots || !spots.length) return null;
    const inkA = new THREE.CircleGeometry(0.108, 9); inkA.scale(1, 0.92, 1); inkA.translate(0.088, 0.04, -0.004);
    const inkB = new THREE.CircleGeometry(0.072, 8); inkB.scale(1, 0.85, 1); inkB.translate(0.075, -0.068, -0.004);
    const lobeA = new THREE.CircleGeometry(0.086, 9); lobeA.scale(1, 0.92, 1); lobeA.translate(0.088, 0.04, 0.01);
    const lobeB = new THREE.CircleGeometry(0.052, 8); lobeB.scale(1, 0.85, 1); lobeB.translate(0.075, -0.068, 0);
    const spot = new THREE.CircleGeometry(0.026, 6); spot.translate(0.115, 0.058, 0.014);
    const bodyStrip = new THREE.CircleGeometry(0.026, 6); bodyStrip.scale(0.5, 2.4, 1);
    const wing = mergeGeometries([prep(inkA, PAL.outline.char), prep(inkB, PAL.outline.char),
      prep(lobeA, PAL.mask.on), prep(lobeB, PAL.char.white), prep(spot, PAL.char.white), prep(bodyStrip, PAL.wood.dark)]);
    wing.rotateX(-Math.PI / 2);                                           // the wing lies flat, hinged along local z
    const mat = makeToon({ vertexColors: true, side: THREE.DoubleSide }, { mid: 0.86, soft: 0.1 }, [See.patch]);
    const flies = [];
    spots.forEach((s, i) => {
      for (let k = 0; k < perSpot; k++) flies.push({ s, hue: s.hue, ph: (i * 1.7 + k * 2.3) % 6.283, sp: 0.45 + ((i + k) % 4) * 0.11, rad: 1.3 + ((i + k) % 3) * 0.4 });
    });
    const mesh = new THREE.InstancedMesh(wing, mat, flies.length * 2);
    mesh.name = 'butterflies'; mesh.frustumCulled = false; mesh.castShadow = false;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(flies.length * 6).fill(1), 3);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    flies.forEach((f, i) => {
      const c = C3(f.hue);
      for (const k of [0, 1]) mesh.instanceColor.setXYZ(i * 2 + k, c.r, c.g, c.b);
    });
    scene.add(mesh);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    animators.push((t) => {
      flies.forEach((f, i) => {
        const a = t * f.sp + f.ph;
        const x = f.s.x + Math.sin(a) * f.rad + Math.sin(a * 2.3) * 0.45, z = f.s.z + Math.cos(a * 0.8) * f.rad * 0.85;
        const y = heightAt(x, z) + 0.66 + Math.sin(a * 3.1) * 0.22 + Math.abs(Math.sin(t * 9 + f.ph)) * 0.07;
        const nx = f.s.x + Math.sin(a + 0.05) * f.rad + Math.sin((a + 0.05) * 2.3) * 0.45, nz = f.s.z + Math.cos((a + 0.05) * 0.8) * f.rad * 0.85;
        // 0.55..1.35 rad: always a clear dihedral V, never a flat open plate
        const yaw = Math.atan2(nx - x, nz - z), flap = 0.95 + Math.sin(t * 19 + f.ph) * 0.4;
        for (const k of [0, 1]) {
          e.set(0, yaw, k ? -flap : flap, 'YZX'); q.setFromEuler(e);
          m4.compose(v.set(x, y, z), q, sc.set(k ? -1 : 1, 1, 1));
          mesh.setMatrixAt(i * 2 + k, m4);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
    counts.butterflies = flies.length;
    return mesh;
  };

  /**
   * Little birds on the ground: they peck and hop, and when the hero comes close they clatter up into the air and
   * fly away, coming back a while later. spots: [{x, z, kind?: 'sparrow'|'robin'}]
   */
  kit.groundBirds = (spots, { scare = 3.5, seed = 17 } = {}) => {
    if (!spots || !spots.length) return null;
    const rnd = mulberry(seed);
    const bodyOf = (kind) => {
      const back = kind === 'robin' ? PAL.wood.mid : mixHex(PAL.wood.mid, PAL.thatch.dark, 0.45);
      const belly = kind === 'robin' ? PAL.flower.red : PAL.plaster.light;
      const body = prep(new THREE.IcosahedronGeometry(0.115, 1).scale(0.85, 0.92, 1.3), back);
      { // the breast is painted on, not a second sphere
        const p = body.attributes.position, c = body.attributes.color, a = C3(back), b = C3(belly), t = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
          const k = smooth(0.02, -0.05, p.getY(i)) * smooth(-0.02, 0.09, p.getZ(i));
          t.copy(a).lerp(b, k); c.setXYZ(i, t.r, t.g, t.b);
        }
      }
      return mergeGeometries([
        body,
        prep(new THREE.IcosahedronGeometry(0.076, 1).translate(0, 0.085, 0.09), back),
        prep(new THREE.ConeGeometry(0.028, 0.085, 5).rotateX(Math.PI / 2).translate(0, 0.075, 0.175), PAL.animal.beak),
        prep(new THREE.IcosahedronGeometry(0.016, 0).translate(0.045, 0.105, 0.135), PAL.char.eye),
        prep(new THREE.IcosahedronGeometry(0.016, 0).translate(-0.045, 0.105, 0.135), PAL.char.eye),
        prep(new THREE.ConeGeometry(0.055, 0.2, 5).rotateX(-Math.PI / 2.3).translate(0, 0.02, -0.16), back),
      ]);
    };
    const wingGeo = (() => {
      const g = new THREE.CircleGeometry(0.13, 8); g.scale(1, 0.55, 1); g.translate(0.12, 0, 0); g.rotateX(-Math.PI / 2);
      return prep(g, mixHex(PAL.wood.mid, PAL.outline.char, 0.25));
    })();
    const kinds = [...new Set(spots.map(s => s.kind || 'sparrow'))];
    const groups = kinds.map((kind) => {
      const list = spots.filter(s => (s.kind || 'sparrow') === kind);
      const body = new THREE.InstancedMesh(bodyOf(kind), makeToon({ vertexColors: true }, 'character', [See.patch]), list.length);
      const wings = new THREE.InstancedMesh(wingGeo, makeToon({ vertexColors: true, side: THREE.DoubleSide }, 'character', [See.patch]), list.length * 2);
      body.name = 'birds-' + kind; wings.name = 'birds-' + kind + '-wings';
      for (const m of [body, wings]) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
      const birds = list.map((s, i) => ({
        hx: s.x, hz: s.z, x: s.x, z: s.z, y: heightAt(s.x, s.z), yaw: rnd() * 6.283, mode: 'peck', t: rnd() * 3,
        ph: rnd() * 6.283, hop: 0, vy: 0, tx: s.x, tz: s.z, gone: 0, i,
      }));
      return { body, wings, birds };
    });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    animators.push((t, dt) => {
      const F = kit.focus;
      for (const g of groups) {
        for (const b of g.birds) {
          b.t -= dt;
          const dHero = F ? Math.hypot(F.x - b.x, F.z - b.z) : 99;
          if ((b.mode === 'peck' || b.mode === 'hop') && dHero < scare) {
            b.mode = 'flee'; b.t = 2.8 + rnd() * 1.2; b.vy = 5.4;
            const away = F ? Math.atan2(b.x - F.x, b.z - F.z) : rnd() * 6.283;
            b.yaw = away + (rnd() - 0.5) * 0.7;
          }
          if (b.mode === 'peck') {
            b.hop = 0;
            if (b.t <= 0) { b.mode = 'hop'; b.t = 0.28 + rnd() * 0.2; b.yaw += (rnd() - 0.5) * 1.6; b.tx = b.hx + (rnd() - 0.5) * 1.6; b.tz = b.hz + (rnd() - 0.5) * 1.6; }
          } else if (b.mode === 'hop') {
            const k = 1 - Math.max(0, b.t) / 0.48;
            b.hop = Math.sin(Math.min(1, k) * Math.PI) * 0.16;
            b.x += (b.tx - b.x) * Math.min(1, dt * 4); b.z += (b.tz - b.z) * Math.min(1, dt * 4);
            if (b.t <= 0) { b.mode = 'peck'; b.t = 0.7 + rnd() * 2.4; }
          } else if (b.mode === 'flee') {
            const sp = 5.6 + 2.2 * Math.min(1, 3 - b.t);
            b.x += Math.sin(b.yaw) * sp * dt; b.z += Math.cos(b.yaw) * sp * dt;
            b.vy += (1.1 - b.vy) * Math.min(1, dt * 2.2);
            b.y += b.vy * dt;
            if (b.t <= 0) { b.mode = 'gone'; b.t = 7 + rnd() * 9; }
          } else if (b.mode === 'gone') {
            if (b.t <= 0 && (!F || Math.hypot(F.x - b.hx, F.z - b.hz) > scare * 2)) {
              b.mode = 'peck'; b.t = 0.6 + rnd() * 2; b.x = b.hx; b.z = b.hz; b.y = heightAt(b.hx, b.hz); b.vy = 0;
            }
          }
          const flying = b.mode === 'flee';
          if (!flying && b.mode !== 'gone') b.y = heightAt(b.x, b.z);
          const scale = b.mode === 'gone' ? 0 : 1;
          const peck = b.mode === 'peck' ? Math.max(0, Math.sin(t * 2.4 + b.ph)) * 0.5 : 0;
          e.set(flying ? -0.25 : peck, b.yaw, 0, 'YXZ'); q.setFromEuler(e);
          m4.compose(v.set(b.x, b.y + 0.11 + b.hop + (flying ? 0 : 0), b.z), q, sc.setScalar(scale));
          g.body.setMatrixAt(b.i, m4);
          const flap = flying ? Math.sin(t * 22 + b.ph) * 1.15 : (b.mode === 'hop' ? Math.sin(t * 16 + b.ph) * 0.35 : 0.08);
          for (const k of [0, 1]) {
            e.set(0, b.yaw, k ? -flap : flap, 'YZX'); q.setFromEuler(e);
            m4.compose(v.set(b.x, b.y + 0.14 + b.hop, b.z), q, sc.set(k ? -scale : scale, scale, scale));
            g.wings.setMatrixAt(b.i * 2 + k, m4);
          }
        }
        g.body.instanceMatrix.needsUpdate = true; g.wings.instanceMatrix.needsUpdate = true;
      }
    });
    counts.birds = spots.length;
    return groups;
  };

  /** Pollen and seed motes drifting through the sunlight around the hero. One instanced, billboarded mesh. */
  kit.motes = ({ count = 70, radius = 10, height = 3.4, seed = 21, hue = null } = {}) => {
    const S = 32, c = mkCanvas(S), g = ctx2(c);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, css(PAL.cloud.lit, 1)); gr.addColorStop(0.35, css(hue || PAL.flower.yellow, 0.7)); gr.addColorStop(1, css(hue || PAL.flower.yellow, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 6.283); g.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade; varying float vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade;');
    };
    mat.customProgramCacheKey = () => 'kitmotes';
    const geo = new THREE.PlaneGeometry(1, 1);
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    geo.setAttribute('aFade', fade);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.name = 'motes'; mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.castShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    const r = mulberry(seed);
    const M = Array.from({ length: count }, () => ({ a: r() * 6.283, d: Math.sqrt(r()) * radius, y: 0.4 + r() * height, ph: r() * 6.283, sp: 0.1 + r() * 0.22, s: 0.07 + r() * 0.08, drift: 0.5 + r() * 1.2 }));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    animators.push((t, dt, cam) => {
      if (cam) q.copy(cam.quaternion);
      const F = kit.focus || (cam ? { x: cam.position.x, z: cam.position.z } : { x: 0, z: 0 });
      for (let i = 0; i < count; i++) {
        const m = M[i];
        const a = m.a + t * m.sp * 0.12;
        const x = F.x + Math.cos(a) * m.d + Math.sin(t * m.sp + m.ph) * m.drift;
        const z = F.z + Math.sin(a) * m.d + Math.cos(t * m.sp * 0.8 + m.ph) * m.drift;
        const y = heightAt(x, z) + m.y + Math.sin(t * 0.5 + m.ph * 2) * 0.35;
        const s = m.s * (0.85 + 0.15 * Math.sin(t * 3 + m.ph));
        m4.compose(v.set(x, y, z), q, sc.set(s, s, s));
        mesh.setMatrixAt(i, m4);
        fade.array[i] = (0.4 + 0.42 * Math.max(0, Math.sin(t * 1.7 + m.ph * 3))) * smooth(radius * 1.15, radius * 0.55, m.d);
      }
      mesh.instanceMatrix.needsUpdate = true; fade.needsUpdate = true;
    });
    counts.motes = count;
    return mesh;
  };

  /**
   * Ripples on still water: soft rings that spread and fade, on the ponds and wherever `sources()` says something
   * just moved (the ducks). areas: [{x, z, r, sx, sz}] · y = the water level.
   */
  kit.ripples = (areas, { y = 0, count = 14, seed = 33, sources = null, every = 1.1 } = {}) => {
    if (!areas || !areas.length) return null;
    const S = 96, c = mkCanvas(S), g = ctx2(c);
    g.clearRect(0, 0, S, S);
    for (const [rr, w, a] of [[0.46, 5, 0.85], [0.33, 3, 0.4], [0.2, 2, 0.2]]) {
      g.strokeStyle = css(PAL.water.foam, a); g.lineWidth = w;
      g.beginPath(); g.arc(S / 2, S / 2, S / 2 * rr, 0, 6.283); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade; varying float vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade;');
    };
    mat.customProgramCacheKey = () => 'kitripple';
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    geo.setAttribute('aFade', fade);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.name = 'ripples'; mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.castShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    const r = mulberry(seed);
    const R = Array.from({ length: count }, () => ({ life: r(), x: 0, z: 0, on: false, sp: 0.42 + r() * 0.25, max: 1.5 + r() * 1.3 }));
    let next = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    animators.push((t, dt) => {
      next -= dt;
      if (next <= 0) {
        next = every * (0.6 + r() * 0.8);
        const free = R.find(p => !p.on);
        if (free) {
          const src = sources ? sources() : null;
          if (src && src.length && r() < 0.6) { const p = src[(r() * src.length) | 0]; free.x = p.x + (r() - 0.5) * 0.3; free.z = p.z + (r() - 0.5) * 0.3; }
          else { const A = areas[(r() * areas.length) | 0], a = r() * 6.283, d = Math.sqrt(r()) * A.r * 0.72; free.x = A.x + Math.cos(a) * d * (A.sx ?? 1); free.z = A.z + Math.sin(a) * d * (A.sz ?? 1); }
          free.on = true; free.life = 0;
        }
      }
      for (let i = 0; i < count; i++) {
        const p = R[i];
        if (!p.on) { fade.array[i] = 0; sc.setScalar(0); m4.compose(v.set(0, -999, 0), q, sc); mesh.setMatrixAt(i, m4); continue; }
        p.life += dt * p.sp;
        if (p.life >= 1) { p.on = false; fade.array[i] = 0; continue; }
        const k = p.life, s = 0.25 + k * p.max;
        m4.compose(v.set(p.x, y + 0.012, p.z), q, sc.set(s, 1, s));
        mesh.setMatrixAt(i, m4);
        fade.array[i] = smooth(0, 0.15, k) * (1 - smooth(0.4, 1, k)) * 0.75;
      }
      mesh.instanceMatrix.needsUpdate = true; fade.needsUpdate = true;
    });
    return mesh;
  };

  /**
   * ══ THE SEE-THROUGH ══ A canopy that covers the hero fades to a CLEAN 40% with its ink line kept, eased over
   * 150 ms out / 220 ms back, and only while it is REALLY in the way. The old pass discarded pixels through an
   * ordered Bayer matrix — a screen-door dither across a fifth of the frame — and it fired on anything that merely
   * loomed near the lens, hero or no hero. Both are gone:
   *
   *   WHAT COUNTS AS IN THE WAY (all three must survive the cheap depth reject: nearer the lens than the hero)
   *     1. the lens is inside the leaves           -> the tree goes entirely (you can never be stuck in a canopy)
   *     2. three rays, lens -> the hero's knees / chest / head, pass through the canopy sphere
   *     3. the canopy's screen disc overlaps the hero's own screen ellipse
   *   and nothing else. A big tree off to one side of the frame stays solid.
   *
   *   HOW IT IS DRAWN            grove.update + ensureGhost: depth pre-pass, ink rim, one translucent surface.
   *   WHO OWNS IT                kit.seeMode('auto'|'ghost'|'off'). 'auto' (the default) stands down while the
   *                              field camera's own occluder fade is running (__DQ.cameraFade().on), so the two
   *                              never ghost the same tree twice; in a demo, or with the camera pass off, this
   *                              one runs.  __DQ readout: kit.seeState.
   */
  const seeSeg = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const vx = bx - ax, vy = by - ay, vz = bz - az, L2 = vx * vx + vy * vy + vz * vz || 1e-9;
    const u = Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy + (cz - az) * vz) / L2));
    return { u, d: Math.hypot(ax + vx * u - cx, ay + vy * u - cy, az + vz * u - cz) };
  };
  kit.seeState = { mode: 'auto', owner: null, alpha: SEE.alpha, occluding: 0, fading: 0, ghosts: 0, gone: 0 };
  kit.seeMode = (m) => { if (m === 'auto' || m === 'ghost' || m === 'off') kit.seeState.mode = m; return kit.seeState.mode; };
  /** Tune the see-through live (a demo control): {alpha, outMs, inMs, hold}. */
  kit.seeTune = (o = {}) => { for (const k of ['alpha', 'outMs', 'inMs', 'hold', 'max']) if (Number.isFinite(+o[k])) SEE[k] = +o[k]; kit.seeState.alpha = SEE.alpha; return Object.assign({}, SEE); };
  const seeV = new THREE.Vector3(), seeH = new THREE.Vector3();
  let ownerT = 0;
  /** Is the field camera's own occluder fade running? (its published state, checked twice a second, never trusted) */
  function externalOwner(dt) {
    ownerT -= dt;
    if (ownerT > 0) return kit.seeState.owner;
    ownerT = 0.45;
    let owner = null;
    try {
      const D = typeof window !== 'undefined' ? window.__DQ : null;
      if (D && typeof D.cameraFade === 'function') { const f = D.cameraFade(); if (f && f.on) owner = 'camera'; }
    } catch (_) { owner = null; }
    kit.seeState.owner = owner;
    return owner;
  }
  /**
   * Park Toon.see's own two dither rules while THIS pass owns the see-through: the hero window (anything nearer
   * the lens than the hero, inside an ellipse round him, keeps 22% of its pixels) and the near dissolve (anything
   * within 3.2 units of the lens). Both are ordered-Bayer discards — the screen door the ledger complained about.
   * The ghost pass covers both cases properly (a canopy the lens is inside goes out entirely). Restored the moment
   * the field camera's own occluder pass takes over, exactly as camera.js parks them for its own pass.
   */
  function parkDither() {
    try {
      const U = See.uniforms;
      // every frame, because field.js sets the hero window again on every render; the near dissolve is a constant
      U.uDqHero.value.w = 0;
      if (U.uDqNear.value.x > -1) U.uDqNear.value.set(-2, -1);
    } catch (e) { reportError('props see dither park', e); }
  }
  /** Everything solid again, in one frame (mode changes, map unload, an owner taking over). */
  function clearGhosts() {
    for (const S of grove.species.values()) for (const it of S.items) it.ghost = 1;
    for (const f of FADE) { f.keep = 1; f.p = 0; f.hit = 0; }
    kit.seeState.occluding = kit.seeState.fading = kit.seeState.ghosts = kit.seeState.gone = 0;
    See.setFades([]);
  }
  kit.clearSee = clearGhosts;
  kit.updateSee = (dt, camera, focus) => {
    const mode = kit.seeState.mode;
    const owned = mode === 'auto' ? !externalOwner(dt) : mode === 'ghost';
    // The dither is RETIRED, whoever owns the pass. Both live owners handle the two cases it existed for —
    // the field camera's occluder pass melts a surface right against the lens, and the ghost below drops a
    // canopy the lens is standing inside — so no frame in this game has a screen door in it any more.
    parkDither();
    if (!owned || !camera || !focus) {
      if (kit.seeState.fading || kit.seeState.ghosts) clearGhosts();
      return;
    }
    camera.updateMatrixWorld();
    const A = camera.position, fx = focus.x, fy = focus.y, fz = focus.z;
    const tanH = Math.tan((camera.fov * Math.PI / 180) / 2);
    const aspect = camera.aspect || 16 / 9;
    // the hero on screen (NDC-ish, y up, x scaled by aspect so distances are round) and his view depth
    seeH.set(fx, fy + 0.8, fz).applyMatrix4(camera.matrixWorldInverse);
    const heroDepth = -seeH.z;
    const hx = seeH.x / (heroDepth * tanH), hy = seeH.y / (heroDepth * tanH);
    const heroRX = 0.52 / (heroDepth * tanH), heroRY = 1.05 / (heroDepth * tanH);   // a 1.35-unit child, not a disc
    const pts = [fy + 0.34, fy + 0.8, fy + 1.3];
    let occluding = 0, fading = 0, gone = 0, big0 = 0;
    const kOut = dt / Math.max(0.016, SEE.outMs / 1000), kIn = dt / Math.max(0.016, SEE.inMs / 1000);
    for (const f of FADE) {
      if (f.p === undefined) { f.p = 0; f.hit = 0; }
      let occ = false, inside = false;
      seeV.set(f.x, f.cy, f.z).applyMatrix4(camera.matrixWorldInverse);
      const depth = -seeV.z;
      // how much of the frame this canopy owns (1.0 = half the frame height). A tree four metres from the lens
      // fills the screen, and a 40% ghost of it is a flat grey-green wedge over a fifth of the frame with the
      // ink hull drawn round it — uglier than the dither it replaced. A canopy that big goes nearly all the way
      // out instead, the way DQV takes a tree out of your way.
      f.screen = depth > 0.25 ? (f.R * 0.92) / (depth * tanH) : (depth > -f.R ? 9 : 0);
      if (depth > -f.R && depth < heroDepth - 0.5) {
        // "the lens is IN the leaves" has to mean exactly that. At f.R + 0.8 any tree standing near the boy with
        // the camera pulled in close counted as inside and VANISHED instead of ghosting, which is its own kind of
        // wrong. f.R is the canopy's bounding radius; the leaves themselves stop short of it.
        if (Math.hypot(A.x - f.x, A.y - f.cy, A.z - f.z) < f.R * 0.92
          || (f.trunk && Math.hypot(A.x - f.x, A.z - f.z) < f.R * 0.5 && A.y < f.cy + f.R * 0.8)) { occ = inside = true; }
        else if (depth > 0.25) {
          for (const py of pts) {                                    // 2. does a ray lens -> hero go through it?
            const r = seeSeg(A.x, A.y, A.z, fx, py, fz, f.x, f.cy, f.z);
            if (r.u < 0.97 && r.d < f.R * 0.95) { occ = true; break; }
          }
          if (!occ) {                                                // 3. does its screen disc cover him?
            const cx = seeV.x / (depth * tanH), cy = seeV.y / (depth * tanH), cr = (f.R * 0.92) / (depth * tanH);
            const dx = Math.max(0, Math.abs(cx - hx) - heroRX), dy = Math.max(0, Math.abs(cy - hy) - heroRY);
            if (Math.hypot(dx, dy) < cr) occ = true;
          }
        }
      }
      if (occ) { occluding++; f.hit = SEE.hold; } else f.hit = Math.max(0, f.hit - dt);
      const want = f.hit > 0;
      f.p = Math.max(0, Math.min(1, f.p + (want ? kOut : -kIn)));
      // eased, and a tree the lens is standing inside goes all the way out instead of stopping at 40%
      const k = smooth(0, 1, f.p);
      // ...and so does a canopy big enough on screen that a 40% ghost of it would be a grey-green pane of glass
      const big = smooth(0.50, 1.4, f.screen ?? 0);
      const target = inside ? 0.06 : lerp(SEE.alpha, 0.10, big);
      const alpha = inside && f.p > 0.98 ? 0 : lerp(1, target, k);
      f.keep = alpha;
      // NEGATIVE alpha = draw the ghost but NOT its ink line. A canopy more than about half the frame across is
      // mostly off screen, so its hull reduces to one long black arc with a dirty translucent wash inside it.
      // The tree still fades; it just stops drawing a ring round the frame while it does.
      if (f.item) f.item.ghost = (f.screen > 0.46 || alpha <= INK_MIN) ? -alpha : alpha;
      if (alpha < 0.995) { fading++; if (alpha <= 0.02) gone++; if (f.screen > big0) big0 = f.screen; }
    }
    kit.seeState.widest = +big0.toFixed(2);
    void aspect;
    kit.seeState.occluding = occluding;
    kit.seeState.fading = fading;
    kit.seeState.gone = gone;
    kit.seeState.ghosts = grove.stats.ghosts || 0;
    See.setFades([]);                       // the dither stays switched off: the ghost meshes do the fading now
  };
  kit.update = (t, dt, camera, focus) => {
    kit.focus = focus || kit.focus;
    // the see-through decides FIRST: grove.update packs the ghosts it chose in the same frame
    try { kit.updateSee(dt, camera, focus); } catch (e) { reportError('scenery see-through', e); }
    try { grove.update(camera, focus); } catch (e) { reportError('scenery grove', e); }
    for (const fn of animators) { try { fn(t, dt, camera); } catch (e) { reportError('scenery animator', e); } }
    kit.seeState.ghosts = grove.stats.ghosts || 0;
  };

  // ── merge ──
  kit.flush = () => {
    try { grove.ensure(); } catch (e) { reportError('scenery grove build', e); }
    const ss = (n, o = {}) => kit.seeSurface(n, Object.assign({ vertexColors: true }, o));
    const MAT = {
      stone: ss('stone'), plaster: ss('plaster'), wood: ss('wood'), thatch: ss('thatch'), tile: ss('tile'), brick: ss('brick'),
      bark: ss('bark'), dirtbed: ss('dirt', { preset: 'ground' }),
      paint: kit._paintMat || (kit._paintMat = makeToon({ vertexColors: true }, {}, [See.patch])),
      // 'glow': unshaded warm glass (lantern panes) that brightens as the sky goes to dusk and night
      glow: kit._glowMat || (kit._glowMat = (() => {
        const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
        m.onBeforeCompile = (sh) => {
          try {
            sh.uniforms.uDqLit = ENV.u.uEnvNight; sh.uniforms.uDqDusk = ENV.u.uEnvDusk;
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDqLit; uniform float uDqDusk;')
              .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  { float dqLit = clamp( uDqLit + uDqDusk * 0.6, 0.0, 1.0 );
    gl_FragColor.rgb = mix( gl_FragColor.rgb * 0.78, min( gl_FragColor.rgb * 1.5 + vec3( 0.22, 0.14, 0.03 ), vec3( 1.0 ) ), dqLit ); }`);
          } catch (e) { reportError('props glow patch', e); }
        };
        m.customProgramCacheKey = () => 'dqglow';
        m.name = 'glow';
        return m;
      })()),
    };
    const out = [];
    for (const [k, list] of buckets) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), MAT[k] || MAT.paint); mesh.name = 'bucket-' + k;
      mesh.castShadow = k !== 'paint' && k !== 'glow'; mesh.receiveShadow = k !== 'glow';
      scene.add(mesh); out.push(mesh);
    }
    buckets.clear();
    if (signParts.length && kit._signTex) {
      const signs = new THREE.Mesh(mergeGeometries(signParts), makeToon({ map: kit._signTex, vertexColors: true }, {}, [See.patch]));
      signs.name = 'signs'; signs.castShadow = true; signs.receiveShadow = true; scene.add(signs); out.push(signs);
      signParts.length = 0;
    }
    // the grounding pass, last: every contact blob the recipes registered, in ONE instanced mesh
    try { const c = buildContacts(); if (c) out.push(c); } catch (e) { reportError('scenery contact shadows', e); }
    try { const h = buildHalos(); if (h) out.push(h); } catch (e) { reportError('scenery lantern halos', e); }
    return out;
  };
  kit.useSignAtlas = (atlas) => { kit._signTex = atlas.tex; return atlas; };

  return kit;
}
