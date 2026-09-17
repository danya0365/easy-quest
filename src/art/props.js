/**
 * props.js — set dressing: trees and forests, bushes, rocks, fences, signposts, flowers, tufts, barrels, benches,
 * bridges, washing lines, reeds, butterflies, instanced critters — and THE KIT CORE every recipe module builds into.
 *                                                                                     (P04, owner: src/art/props.js)
 *
 * Recipes are docs/ART-DIRECTION.md §12-14 expressed ONLY through F3's foundation (PAL, Tex, makeToon, Toon hulls,
 * AO masks). Moved verbatim out of src/world/scenery.js; signatures are a contract maps rely on.
 *
 * Standalone:  M4 boxUV scaleUV wrapUV prep hashJ (geometry helpers) · OAK POPLAR BUSH EDGE CHESTNUT (canopy blobs)
 *              canopyGeometry(blobs, dark, light, detail, spherize) · bridgeFrame({cx, cz, dir, L, W, arch, y0})
 *              forestCardAtlas()
 *
 * THE KIT CORE — createPropsKit({scene, heightAt, ao}) -> kit   (src/world/scenery.js createKit adds the terrain,
 * building and sky recipes on top; maps call createKit). The contract other recipe modules may rely on:
 *   kit.scene kit.heightAt kit.ao kit.counts{}          kit.animators.push(fn(t, dt, camera))
 *   kit.addTo(bucket, geo, matrix, hex)                 merge into a per-material bucket, drawn by kit.flush()
 *   kit.footBox(x, z, w, d, rot, pad) / kit.footDisc(x, z, r) / kit.blocked(x, z)   tufts and flowers stay out
 *   kit.seeSurface(texName, opts)                       a textured toon material that dissolves in front of the hero
 *   kit.FADE.push({x, z, cy, R, trunk, keep: 1, kind})   register a see-through candidate (trees, forest cards)
 *   kit.update(t, dt, camera, focus)                    animators + the see-through pass (kit.updateSee)
 *   kit.flush()                                         merge every bucket into one mesh per material
 * Prop recipes on the kit: rock fence picket barrel crate bench woodpile flowerBed forest forestBelt forestRing tufts
 * flowers lilyPads reeds signAtlas useSignAtlas signpost butterflies footbridge laundry critters.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, css, lerp, smooth, clamp01, mixHex } from './palette.js';
import { Tex, mulberry, vnoise, mkCanvas, ctx2 } from './tex.js';
import { Toon, makeToon, outlineMaterial, hullGeometry, spherizeNormals, normalsUp, OUTLINE, TOON_PRESETS, See } from './toon.js';
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
export function createPropsKit({ scene, heightAt, ao }) {
  const buckets = new Map();
  const animators = [];
  const counts = {};
  const FOOT = [];                                            // footprints: tufts and flowers stay out
  const FADE = [];                                            // see-through candidates: {x, z, cy, R, keep}
  const kit = { scene, heightAt, ao, buckets, animators, counts, FOOT, FADE };

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
    geo.applyMatrix4(M4(x, heightAt(x, z) - sink * s, z, r() * 6.283, 0, 0, s));
    if (!buckets.has('stone')) buckets.set('stone', []);
    buckets.get('stone').push(geo);
    ao.disc(x, z, 1.0 * s * sx, 0.6);
    kit.footDisc(x, z, 0.55 * s * sx);
    return { x, z, r: 0.5 * s * Math.max(sx, sz) };
  };

  /** Post-and-rail fence along a polyline. Returns the capsule collider points. */
  kit.fence = (pts, { color = PAL.wood.weathered, height = 1.05, spacing = 1.8, rails = [0.35, 0.75], seed = 3 } = {}) => {
    const r = mulberry(seed);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / spacing)), ang = Math.atan2(x1 - x0, z1 - z0);
      for (let k = 0; k <= n; k++) {
        if (k === n && i < pts.length - 2) continue;
        const x = lerp(x0, x1, k / n), z = lerp(z0, z1, k / n), y = heightAt(x, z);
        addTo('wood', boxUV(0.15, height, 0.15, 0.8), M4(x, y + height / 2 - 0.08, z, ang + (r() - 0.5) * 0.2, (r() - 0.5) * 0.06), color);
        ao.disc(x, z, 0.45, 0.5); kit.footDisc(x, z, 0.3);
      }
      for (const ry of rails) {
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, y = (heightAt(x0, z0) + heightAt(x1, z1)) / 2, dy = heightAt(x1, z1) - heightAt(x0, z0);
        addTo('wood', boxUV(0.08, 0.12, L + 0.1, 0.8), M4(mx, y + ry, mz, ang, -Math.atan2(dy, L)), color);
      }
    }
    return pts;
  };

  /** A little white-ish picket fence (garden edge). */
  kit.picket = (pts, { color = PAL.plaster.light, height = 0.75 } = {}) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / 0.32)), ang = Math.atan2(x1 - x0, z1 - z0);
      for (let k = 0; k <= n; k++) {
        const x = lerp(x0, x1, k / n), z = lerp(z0, z1, k / n), y = heightAt(x, z), h = height * (k % 2 ? 0.92 : 1);
        addTo('wood', boxUV(0.1, h, 0.05, 0.8), M4(x, y + h / 2 - 0.06, z, ang + Math.PI / 2), color);
        addTo('wood', new THREE.ConeGeometry(0.07, 0.12, 4), M4(x, y + h - 0.02, z, ang + Math.PI / 4), color);
      }
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, y = (heightAt(x0, z0) + heightAt(x1, z1)) / 2;
      for (const ry of [0.22, 0.52]) addTo('wood', boxUV(0.05, 0.08, L, 0.8), M4(mx, y + ry, mz, ang), PAL.wood.weathered);
      ao.disc(mx, mz, L * 0.5, 0.3);
    }
  };

  kit.barrel = (x, z, s = 1, rot = 0) => {
    const y = heightAt(x, z), base = M4(x, y, z, rot, 0, 0, s);
    const prof = []; for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(0.36 + Math.sin(t * Math.PI) * 0.07, t * 0.95)); }
    addTo('wood', wrapUV(new THREE.LatheGeometry(prof, 14), 2, 0.9), base, PAL.wood.light);
    addTo('wood', new THREE.CircleGeometry(0.36, 14), base.clone().multiply(M4(0, 0.95, 0, 0, -Math.PI / 2)), PAL.wood.mid);
    for (const by of [0.18, 0.77]) addTo('paint', new THREE.TorusGeometry(0.415, 0.03, 5, 18), base.clone().multiply(M4(0, by, 0, 0, Math.PI / 2)), PAL.paint.iron);
    ao.disc(x, z, 0.8 * s, 0.6); kit.footDisc(x, z, 0.5 * s);
  };

  kit.crate = (x, z, rot = 0, s = 1) => {
    const y = heightAt(x, z);
    addTo('wood', boxUV(0.8 * s, 0.8 * s, 0.8 * s, 0.8), M4(x, y + 0.38 * s, z, rot), PAL.wood.light);
    for (const e of [-1, 1]) addTo('wood', boxUV(0.84 * s, 0.1 * s, 0.84 * s, 1), M4(x, y + (0.38 + e * 0.35) * s, z, rot), PAL.wood.beam);
    ao.disc(x, z, 0.85 * s, 0.6); kit.footDisc(x, z, 0.55 * s);
  };

  kit.bench = (x, z, rot = 0) => {
    const y = heightAt(x, z), base = M4(x, y, z, rot), add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(1.7, 0.1, 0.45, 1), M4(0, 0.48, 0), PAL.wood.light);
    add('wood', boxUV(1.7, 0.36, 0.08, 1), M4(0, 0.78, -0.22, 0, -0.12), PAL.wood.light);
    for (const s of [-1, 1]) { add('wood', boxUV(0.12, 0.48, 0.4, 1), M4(s * 0.7, 0.24, 0), PAL.wood.beam); add('wood', boxUV(0.1, 0.5, 0.08, 1), M4(s * 0.7, 0.72, -0.22), PAL.wood.beam); }
    ao.box(x, z, 1.7, 0.5, rot, 0.6, 0.55); kit.footBox(x, z, 1.8, 0.6, rot);
  };

  kit.woodpile = (x, z, rot = 0) => {
    const y = heightAt(x, z), base = M4(x, y, z, rot), r = mulberry(Math.round(x * 31 + z * 17));
    const rows = [[5, 0.18], [4, 0.5], [3, 0.82], [2, 1.12]];
    for (const [n, ly] of rows) for (let i = 0; i < n; i++) {
      const lr = 0.16 + r() * 0.03, lx = (i - (n - 1) / 2) * 0.35 + (r() - 0.5) * 0.04, len = 1.1;
      addTo('bark', wrapUV(new THREE.CylinderGeometry(lr, lr, len, 10, 1, true), 1, len / Tex.worldSize('bark')), base.clone().multiply(M4(lx, ly, 0, 0, Math.PI / 2)));
      for (const e of [1, -1]) {
        addTo('paint', new THREE.CircleGeometry(lr, 10), base.clone().multiply(M4(lx, ly, e * len / 2, e > 0 ? 0 : Math.PI)), PAL.wood.light);
        addTo('paint', new THREE.RingGeometry(lr * 0.35, lr * 0.47, 10), base.clone().multiply(M4(lx, ly, e * (len / 2 + 0.01), e > 0 ? 0 : Math.PI)), PAL.wood.mid);
      }
    }
    ao.box(x, z, 1.9, 1.2, rot, 0.7, 0.6); kit.footBox(x, z, 2.0, 1.3, rot);
  };

  /** Flower bed: an earth patch heaped with round flower heads and leaves. */
  kit.flowerBed = (x, z, w, d, rot = 0, seed = 5) => {
    const y = heightAt(x, z), base = M4(x, y, z, rot), r = mulberry(seed);
    addTo('dirtbed', new THREE.PlaneGeometry(w, d, 1, 1).rotateX(-Math.PI / 2), base.clone().multiply(M4(0, 0.06, 0)), PAL.dirt.dark);
    const hues = [PAL.flower.pink, PAL.flower.yellow, PAL.flower.white, PAL.flower.red, PAL.flower.blue];
    const n = Math.round(w * d * 9);
    for (let i = 0; i < n; i++) addTo('paint', new THREE.IcosahedronGeometry(0.12 + r() * 0.05, 0), base.clone().multiply(M4((r() - 0.5) * w * 0.9, 0.18 + r() * 0.12, (r() - 0.5) * d * 0.9)), PAL.foliage.mid);
    for (let i = 0; i < n * 0.8; i++) addTo('paint', new THREE.IcosahedronGeometry(0.075 + r() * 0.03, 0), base.clone().multiply(M4((r() - 0.5) * w * 0.9, 0.3 + r() * 0.12, (r() - 0.5) * d * 0.9)), hues[(r() * hues.length) | 0]);
    ao.box(x, z, w, d, rot, 0.4, 0.35); kit.footBox(x, z, w, d, rot);
  };

  // ── foliage ──
  /**
   * Instanced trees. Instances are split into spatial chunks (`chunk` world units) so whole groves off-screen are
   * frustum-culled — an InstancedMesh is only culled when ALL of its instances are out of view.
   */
  kit.forest = (name, blobs, list, { detail = 1, spherize = 0.72, trunkH = 1.7, dark = PAL.foliage.dark, light = PAL.foliage.sun, wind = 0.016, windBase = 1.6, outline = true, shadows = true, proxyDetail = 1, aoR = 1.9, aoS = 0.65, chunk = 18, lodDist = 30, nearDist = 0, fade = true } = {}) => {
    if (!list.length) return null;
    const cg = canopyGeometry(blobs, dark, light, detail, spherize);
    // near LOD: one icosphere level UP for chunks right by the lens, so close canopies keep round, unbroken silhouettes
    const nearGeo = nearDist > 0 ? canopyGeometry(blobs, dark, light, detail + 1, spherize) : null;
    const nearHull = nearGeo && outline ? hullGeometry(nearGeo, OUTLINE.canopy) : null;
    // far LOD: one icosphere level down, same silhouette; swapped per chunk by camera distance (with hysteresis)
    const lodGeo = detail > 0 && lodDist > 0 ? canopyGeometry(blobs, dark, light, detail - 1, spherize) : null;
    const lodHull = lodGeo && outline ? hullGeometry(lodGeo, OUTLINE.canopy) : null;
    const leafMat = makeToon({ vertexColors: true }, Object.assign({}, TOON_PRESETS.canopy, { wind, windBase }), [See.patch]);
    const hullGeo = outline ? hullGeometry(cg, OUTLINE.canopy) : null, hullMat = outline ? outlineMaterial(PAL.outline.leaf, { wind, windBase, see: true }) : null;
    const big = [...blobs].sort((a, b) => b[3] - a[3]).slice(0, 3).map(b => [b[0], b[1], b[2], b[3] * 0.78, proxyDetail]);
    const proxyGeo = shadows ? canopyGeometry(big, dark, light, 0, 0) : null;
    const trunkGeo = trunkH ? trunkGeometry(trunkH + 0.4) : null, trunkMat = trunkH ? kit.seeSurface('bark') : null;
    // the canopy as one sphere, for the see-through test (the camera never zooms: trees in the way dissolve)
    let bcx = 0, bcy = 0, bcz = 0, bw = 0; for (const b of blobs) { bcx += b[0] * b[3]; bcy += b[1] * b[3]; bcz += b[2] * b[3]; bw += b[3]; } bcx /= bw; bcy /= bw; bcz /= bw;
    let bR = 0; for (const b of blobs) bR = Math.max(bR, Math.hypot(b[0] - bcx, b[1] - bcy, b[2] - bcz) + b[3]);
    const groups = new Map();
    for (const t of list) { const key = `${Math.floor(t.x / chunk)},${Math.floor(t.z / chunk)}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const made = [];
    let gi = 0;
    for (const items of groups.values()) {
      const n = items.length, tag = `${name}#${gi++}`;
      const canopy = new THREE.InstancedMesh(cg, leafMat, n); canopy.name = tag + '-canopy'; canopy.receiveShadow = true;
      const hull = hullGeo ? new THREE.InstancedMesh(hullGeo, hullMat, n) : null;
      if (hull) { hull.instanceMatrix = canopy.instanceMatrix; hull.name = tag + '-hull'; hull.userData.isOutline = true; }
      const proxy = proxyGeo ? new THREE.InstancedMesh(proxyGeo, SHADOW_PROXY_MAT, n) : null;
      if (proxy) { proxy.castShadow = true; proxy.instanceMatrix = canopy.instanceMatrix; proxy.name = tag + '-shadowProxy'; }
      const trunk = trunkGeo ? new THREE.InstancedMesh(trunkGeo, trunkMat, n) : null;
      if (trunk) { trunk.castShadow = true; trunk.receiveShadow = true; trunk.instanceMatrix = canopy.instanceMatrix; trunk.name = tag + '-trunk'; }
      items.forEach((t, i) => {
        q.setFromAxisAngle(up, t.r ?? 0);
        m4.compose(new THREE.Vector3(t.x, heightAt(t.x, t.z) - 0.1, t.z), q, new THREE.Vector3(t.s, t.s * (0.95 + ((t.c ?? 1) - 0.9)), t.s));
        canopy.setMatrixAt(i, m4); col.setRGB(t.c ?? 1, t.c ?? 1, (t.c ?? 1) * 0.95); canopy.setColorAt(i, col);
        if (aoR > 0) ao.disc(t.x, t.z, aoR * t.s, aoS);
        kit.footDisc(t.x, t.z, (trunkH ? 0.55 : 1.0) * t.s);
        if (fade) { const sy = t.s * (0.95 + ((t.c ?? 1) - 0.9)); FADE.push({ x: t.x, z: t.z, cy: heightAt(t.x, t.z) - 0.1 + bcy * sy, R: bR * t.s * 0.86, trunk: trunkH ? 0.35 * t.s : 0, keep: 1, kind: name }); }
      });
      for (const m of [canopy, hull, proxy, trunk]) if (m) { m.computeBoundingSphere(); scene.add(m); }
      let cx = 0, cz = 0; for (const t of items) { cx += t.x; cz += t.z; } cx /= n; cz /= n;
      let rad = 0; for (const t of items) rad = Math.max(rad, Math.hypot(t.x - cx, t.z - cz) + 2.5 * t.s);
      made.push({ canopy, hull, proxy, trunk, cx, cz, rad, far: false, tier: 1 });
    }
    if (lodGeo || nearGeo) {
      animators.push((t, dt, cam) => {
        if (!cam) return;
        for (const c of made) {
          const d = Math.hypot(cam.position.x - c.cx, cam.position.z - c.cz) - c.rad;
          // tier 0 = near (detail + 1), 1 = normal, 2 = far (detail - 1); 3 units of hysteresis either side
          let tier = 1;
          if (nearGeo && (c.tier === 0 ? d < nearDist + 3 : d < nearDist)) tier = 0;
          else if (lodGeo && (c.tier === 2 ? d > lodDist - 3 : d > lodDist + 3)) tier = 2;
          if (tier === c.tier) continue;
          c.tier = tier; c.far = tier === 2;
          c.canopy.geometry = tier === 0 ? nearGeo : tier === 2 ? lodGeo : cg;
          if (c.hull) c.hull.geometry = tier === 0 ? nearHull : tier === 2 ? lodHull : hullGeo;
        }
      });
    }
    counts[name] = list.length;
    counts[name + 'Chunks'] = made.length;
    kit.lodChunks = (kit.lodChunks || []).concat(made);
    return made;
  };

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
   * A closed ring of woodland around a field map: the world never ends in bare grass. Every lane runs into it.
   *   pointAt(angle, e) -> [x, z]      the ring of "radius" e (e.g. a superellipse matching the walkable edge)
   *   rows: [{e, spacing, jitter, kind: 'tree' | 'card', size: [min, max], haze}]  inner rows first
   *        'tree' = real 3D edge oaks (toon + ink hull + trunks + shadows), exactly the foreground style
   *        'card' = painted treetop clusters (same palette, same ink, lit top, dark underside, trunks) that turn to
   *                 face the lens; each row further out is hazier. Cheap enough to stack four deep.
   *   clear(x, z, rowIndex, row) -> true where no tree may stand (a village clearing, a lane mouth)
   *   shade: a makeAOMask the forest floor is painted into (buildGround({shade}) darkens the grass under the trees)
   *   sunDir: rig.dir (cards flip their painted light to the sun's side)
   */
  kit.forestRing = ({ pointAt, rows = [], clear = () => false, seed = 4711, shade = null, sunDir = null, yAt = heightAt, low = false } = {}) => {
    const rnd = mulberry(seed), N = 2048, trees = [], cards = [];
    rows.forEach((row, ri) => {
      const P = [], cum = [0];
      for (let i = 0; i <= N; i++) P.push(pointAt(i / N * Math.PI * 2, row.e));
      for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      const total = cum[N];
      let sAt = rnd() * row.spacing, k = 0;
      while (sAt < total) {
        while (k < N - 1 && cum[k + 1] < sAt) k++;
        const u = (sAt - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
        const bx = lerp(P[k][0], P[k + 1][0], u), bz = lerp(P[k][1], P[k + 1][1], u);
        const tx = P[k + 1][0] - P[k][0], tz = P[k + 1][1] - P[k][1], tl = Math.hypot(tx, tz) || 1;
        const nx = tz / tl, nz = -tx / tl;                                  // perpendicular to the ring
        const off = (rnd() - 0.5) * 2 * (row.jitter ?? 1), x = bx + nx * off, z = bz + nz * off;
        const size = lerp(row.size[0], row.size[1], rnd());
        if (!clear(x, z, ri, row)) {
          if (row.kind === 'tree') trees.push({ x, z, s: size, r: rnd() * Math.PI * 2, c: 0.84 + rnd() * 0.18 });
          else cards.push({ x, z, w: size, v: (rnd() * 4) | 0, haze: (row.haze ?? 0) + rnd() * 0.03, row: ri });
        }
        sAt += row.spacing * (0.82 + rnd() * 0.36);
      }
    });
    // row 0: real trees, the same recipe as the meadow oaks
    if (trees.length) {
      kit.forest('edge', EDGE, trees, { detail: 1, spherize: 0.72, trunkH: 1.9, aoR: 2.7, aoS: 0.72, outline: !low, chunk: 14, lodDist: 70, proxyDetail: 0 });
      if (shade) for (const t of trees) shade.disc(t.x, t.z, 3.8 * t.s, 0.78);
    }
    let cardMesh = null;
    if (cards.length) {
      const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0); normalsUp(geo);
      const aCard = new THREE.InstancedBufferAttribute(new Float32Array(cards.length * 3), 3);
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
      cardMesh = new THREE.InstancedMesh(geo, mat, cards.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
      cards.forEach((c, i) => {
        const y = yAt(c.x, c.z) - (c.row <= 1 ? 0.6 : c.w * 0.2);        // rows behind show only treetops
        m4.compose(v.set(c.x, y, c.z), q, sc.set(c.w, c.w * (0.95 + ((i * 7) % 5) * 0.03), c.w)); cardMesh.setMatrixAt(i, m4);
        const k = 0.9 + ((i * 13) % 7) * 0.025; cardMesh.setColorAt(i, col.setRGB(k, k, k * 0.96));
        aCard.setXYZ(i, c.v, Math.min(0.6, c.haze), 0);
        if (shade) shade.disc(c.x, c.z, c.w * 0.5, 0.9);
        FADE.push({ x: c.x, z: c.z, cy: y + c.w * 0.62, R: c.w * 0.4, trunk: 0, keep: 1, kind: 'card' });
      });
      cardMesh.name = 'forestCards'; cardMesh.frustumCulled = false; cardMesh.castShadow = false; cardMesh.receiveShadow = false;
      scene.add(cardMesh);
    }
    counts.forestTrees = trees.length; counts.forestCards = cards.length;
    return { trees, cards, cardMesh };
  };

  /** Grass tufts, instanced, lit like the ground. accept(x, z) -> bool gates placement. */
  kit.tufts = ({ count = 900, radius = 36, seed = 999, accept = () => true, rimOf = () => 0, boost = () => 0 } = {}) => {
    const list = [], tr = mulberry(seed);
    let tries = 0;
    while (list.length < count && tries++ < count * 40) {
      const x = (tr() - 0.5) * radius * 2, z = (tr() - 0.5) * radius * 2;
      if (!accept(x, z) || kit.blocked(x, z)) continue;
      const aoV = ao.sample(x, z), rim = rimOf(x, z) * 0.6 + smooth(0.05, 0.3, aoV) * 0.45;
      const cluster = vnoise(x * 0.2, z * 0.2, 71);
      if (tr() > smooth(0.55, 0.9, cluster) * 0.4 + rim + boost(x, z)) continue;
      list.push({ x, z, s: 0.5 + tr() * 0.55, r: tr() * 3.14, c: 0.95 + tr() * 0.25 });
    }
    const A = new THREE.PlaneGeometry(0.9, 0.62); A.translate(0, 0.29, 0); const B = A.clone().rotateY(Math.PI / 2);
    const g = normalsUp(mergeGeometries([A, B]));
    const mat = makeToon({ map: Tex.tuft(), alphaTest: 0.5, side: THREE.DoubleSide }, Object.assign({}, TOON_PRESETS.tuft, { wind: 0.14, windBase: 0.05 }));
    const mesh = new THREE.InstancedMesh(g, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    list.forEach((t, i) => { q.setFromAxisAngle(up, t.r); m4.compose(new THREE.Vector3(t.x, heightAt(t.x, t.z) - 0.04, t.z), q, new THREE.Vector3(t.s, t.s * (0.8 + tr() * 0.4), t.s)); mesh.setMatrixAt(i, m4); col.setRGB(t.c, t.c, t.c * 0.9); mesh.setColorAt(i, col); });
    mesh.name = 'tufts'; mesh.receiveShadow = true; scene.add(mesh); counts.tufts = list.length;
    return mesh;
  };

  /** Flower clusters: [{x, z, hue, n, spread}] -> instanced flat heads. */
  kit.flowers = (clusters, { seed = 31337, accept = () => true } = {}) => {
    const fr = mulberry(seed), list = [];
    for (const cl of clusters) {
      const n = cl.n ?? (8 + (fr() * 12 | 0)), spread = cl.spread ?? 1.3;
      for (let k = 0; k < n; k++) {
        const aa = fr() * 6.283, dd = Math.sqrt(fr()) * spread, x = cl.x + Math.cos(aa) * dd, z = cl.z + Math.sin(aa) * dd;
        if (!accept(x, z) || kit.blocked(x, z)) continue;
        list.push({ x, z, hue: cl.hue, s: 0.7 + fr() * 0.5 });
      }
    }
    const g = normalsUp(new THREE.PlaneGeometry(0.34, 0.34).rotateX(-Math.PI / 2).translate(0, 0.2, 0));
    const mat = makeToon({ map: Tex.flower(), alphaTest: 0.5, side: THREE.DoubleSide }, 'flower');
    const mesh = new THREE.InstancedMesh(g, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    list.forEach((t, i) => { q.setFromEuler(new THREE.Euler((fr() - 0.5) * 0.5, fr() * 6.28, (fr() - 0.5) * 0.5)); m4.compose(new THREE.Vector3(t.x, heightAt(t.x, t.z), t.z), q, new THREE.Vector3(t.s, t.s, t.s)); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, col.copy(C3(t.hue))); });
    mesh.name = 'flowers'; scene.add(mesh); counts.flowers = list.length;
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
    const y = heightAt(x, z);
    addTo('wood', boxUV(0.16, h + 0.35, 0.16, 1.2), M4(x, y + (h + 0.35) / 2 - 0.1, z), PAL.wood.beam);
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
    ao.disc(x, z, 0.6, 0.5); kit.footDisc(x, z, 0.4);
  };

  /** Butterflies flitting around flower patches: [{x, z, hue}] */
  kit.butterflies = (spots) => {
    if (!spots.length) return null;
    const wing = new THREE.CircleGeometry(0.11, 10); wing.scale(1, 0.8, 1);
    const L = wing.clone().translate(-0.1, 0, 0), R = wing.clone().translate(0.1, 0, 0);
    const mats = [], meshes = [];
    const group = new THREE.Group(); group.name = 'butterflies'; scene.add(group);
    const flies = spots.map((s, i) => {
      const m = new THREE.MeshBasicMaterial({ color: C3(s.hue), side: THREE.DoubleSide, fog: true }); mats.push(m);
      const body = new THREE.Group();
      const l = new THREE.Mesh(L, m), r = new THREE.Mesh(R, m);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.08, 2, 4), new THREE.MeshBasicMaterial({ color: C3(PAL.wood.dark), fog: true }));
      torso.rotation.x = Math.PI / 2;
      const lp = new THREE.Group(), rp = new THREE.Group(); lp.add(l); rp.add(r); l.position.x = 0; r.position.x = 0;
      body.add(lp, rp, torso); group.add(body); meshes.push(body);
      return { s, body, lp, rp, ph: i * 1.7, sp: 0.5 + (i % 3) * 0.12 };
    });
    animators.push((t) => {
      for (const f of flies) {
        const a = t * f.sp + f.ph, x = f.s.x + Math.sin(a) * 1.6 + Math.sin(a * 2.3) * 0.5, z = f.s.z + Math.cos(a * 0.8) * 1.3;
        const y = heightAt(x, z) + 0.7 + Math.sin(a * 3.1) * 0.25 + Math.abs(Math.sin(t * 9 + f.ph)) * 0.06;
        const nx = f.s.x + Math.sin(a + 0.05) * 1.6 + Math.sin((a + 0.05) * 2.3) * 0.5, nz = f.s.z + Math.cos((a + 0.05) * 0.8) * 1.3;
        f.body.position.set(x, y, z);
        f.body.rotation.y = Math.atan2(nx - x, nz - z);
        const flap = Math.sin(t * 22 + f.ph) * 0.9 + 0.2;
        f.lp.rotation.z = flap; f.rp.rotation.z = -flap;
      }
    });
    return group;
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
        const y = F.archY(u), p = at(u, v, y + 0.42);
        addTo('wood', boxUV(0.14, 0.95, 0.14, 1.2), M4(p.x, p.y, p.z, dir), PAL.wood.beam);
        addTo('wood', new THREE.SphereGeometry(0.09, 8, 6), M4(p.x, y + 0.94, p.z), PAL.wood.beam);
      }
      for (let k = 0; k < posts.length - 1; k++) {
        const ua = posts[k], ub = posts[k + 1], um = (ua + ub) / 2, ya = F.archY(ua) + 0.82, yb = F.archY(ub) + 0.82, p = at(um, v, (ya + yb) / 2);
        addTo('wood', boxUV(0.09, 0.1, ub - ua + 0.08, 1.0), M4(p.x, p.y, p.z, dir, -Math.atan2(yb - ya, ub - ua)), PAL.wood.light);
        const q = at(um, v, (ya + yb) / 2 - 0.36);
        addTo('wood', boxUV(0.07, 0.08, ub - ua, 1.0), M4(q.x, q.y, q.z, dir, -Math.atan2(yb - ya, ub - ua)), PAL.wood.weathered);
      }
    }
    for (const e of F.ends) ao.disc(e[0], e[1], 1.3, 0.5);
    kit.footBox(F.cx, F.cz, W + 0.4, L + 0.4, dir);
    return F;
  };

  /** A washing line between two posts with cloths that hang and sway (negative wind: they hang from the line). */
  kit.laundry = (A, B, cloths) => {
    const LA = new THREE.Vector3(A[0], heightAt(A[0], A[1]), A[1]), LB = new THREE.Vector3(B[0], heightAt(B[0], B[1]), B[1]);
    const yaw = Math.atan2(LB.x - LA.x, LB.z - LA.z) + Math.PI / 2;
    for (const P of [LA, LB]) {
      addTo('wood', boxUV(0.14, 2.35, 0.14, 1.2), M4(P.x, P.y + 1.1, P.z), PAL.wood.beam);
      addTo('wood', boxUV(0.5, 0.1, 0.1, 1.2), M4(P.x, P.y + 2.18, P.z, yaw), PAL.wood.beam);
      ao.disc(P.x, P.z, 0.5, 0.5); kit.footDisc(P.x, P.z, 0.3);
    }
    const lineY = Math.max(LA.y, LB.y) + 2.15;
    const rope = new THREE.CatmullRomCurve3([new THREE.Vector3(LA.x, lineY, LA.z), new THREE.Vector3(lerp(LA.x, LB.x, 0.5), lineY - 0.22, lerp(LA.z, LB.z, 0.5)), new THREE.Vector3(LB.x, lineY, LB.z)]);
    addTo('paint', new THREE.TubeGeometry(rope, 24, 0.022, 5), null, PAL.cloth.rope);
    const lineDir = new THREE.Vector3().subVectors(LB, LA).setY(0).normalize(), side = new THREE.Vector3(-lineDir.z, 0, lineDir.x);
    const span = LA.distanceTo(LB);
    for (const cd of cloths) {
      const g = new THREE.PlaneGeometry(cd.w, cd.h, 8, 8), p = g.attributes.position, uv = g.attributes.uv;
      const c0 = rope.getPoint(cd.t);
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), ly = p.getY(i) - cd.h / 2;
        const along = c0.clone().addScaledVector(lineDir, lx);
        const topY = rope.getPoint(Math.min(1, Math.max(0, cd.t + lx / span))).y;
        const billow = Math.sin((lx / cd.w + 0.5) * Math.PI) * 0.06 * (-ly / cd.h) + Math.sin((lx / cd.w) * 9) * 0.02;
        p.setXYZ(i, along.x + side.x * billow, topY + ly, along.z + side.z * billow);
        uv.setXY(i, uv.getX(i) * cd.w / 0.9, uv.getY(i) * cd.h / 0.9);
      }
      g.computeVertexNormals();
      const mat = makeToon({ map: cd.tex, side: THREE.DoubleSide }, Object.assign({}, TOON_PRESETS.cloth, { wind: -0.07, windBase: lineY - 0.05 }), [See.patch]);
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'laundry'; scene.add(mesh);
      for (const s of [-1, 1]) { const q = c0.clone().addScaledVector(lineDir, s * cd.w * 0.36); addTo('paint', new THREE.BoxGeometry(0.05, 0.14, 0.05), M4(q.x, rope.getPoint(cd.t).y - 0.02, q.z), PAL.wood.light); }
    }
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

  /**
   * See-through: every registered tree (and forest card) whose canopy sits between the lens and the hero — or
   * around the lens itself — dissolves to 25% instead of the camera zooming in. Eased both ways.
   */
  const seeSeg = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const vx = bx - ax, vy = by - ay, vz = bz - az, L2 = vx * vx + vy * vy + vz * vz || 1e-9;
    const u = Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy + (cz - az) * vz) / L2));
    return { u, d: Math.hypot(ax + vx * u - cx, ay + vy * u - cy, az + vz * u - cz) };
  };
  kit.seeState = { fading: 0, occluding: 0 };
  const seeV = new THREE.Vector3(), seeH = new THREE.Vector3();
  kit.updateSee = (dt, camera, focus) => {
    if (!camera || !focus) { See.setFades([]); return; }
    camera.updateMatrixWorld();
    const A = camera.position, fx = focus.x, fy = focus.y, fz = focus.z;
    const tanH = Math.tan((camera.fov * Math.PI / 180) / 2), aspect = camera.aspect || 16 / 9;
    // the hero on screen (NDC, y up; x scaled by aspect so distances are round) and his depth
    seeH.set(fx, fy + 0.9, fz).applyMatrix4(camera.matrixWorldInverse);
    const heroDepth = -seeH.z;
    const hx = (seeH.x / (heroDepth * tanH)), hy = seeH.y / (heroDepth * tanH);
    const heroR = 0.95 / (heroDepth * tanH);                    // a circle just around a 1.6-unit hero
    const pts = [[fx, fy + 0.3], [fx, fy + 0.95], [fx, fy + 1.6]];
    const list = [];
    let occluding = 0;
    const kDown = 1 - Math.exp(-dt * 12), kUp = 1 - Math.exp(-dt * 5);
    for (const f of FADE) {
      let occ = false, deep = 0;
      // cheap reject: behind the lens or further away than the hero
      seeV.set(f.x, f.cy, f.z).applyMatrix4(camera.matrixWorldInverse);
      const depth = -seeV.z;
      if (depth > -f.R && depth < heroDepth + f.R * 0.5) {
        if (Math.hypot(A.x - f.x, A.y - f.cy, A.z - f.z) < f.R + 0.9 || (f.trunk && Math.hypot(A.x - f.x, A.z - f.z) < f.R * 0.7 && A.y < f.cy + f.R)) { occ = true; deep = 1; }  // the lens is in the leaves
        else if (depth > 0.3 && depth < heroDepth - 0.6) {
          // nearer than the hero AND (its canopy disc overlaps the circle around him on screen, OR it is a giant
          // right in front of the lens that would fill a third of the frame)
          const cx = seeV.x / (depth * tanH), cy = seeV.y / (depth * tanH), cr = (f.R * 0.92) / (depth * tanH);
          const onScreen = Math.abs(cx) < 1.78 + cr && Math.abs(cy) < 1 + cr;
          if (Math.hypot(cx - hx, cy - hy) < cr + heroR) occ = true;
          else if (onScreen && cr > 0.62 && depth < heroDepth * 0.75) occ = true;
          deep = smooth(0.5, 1.1, cr);
        }
        if (!occ) for (const [py] of pts) {
          const r = seeSeg(A.x, A.y, A.z, fx, py, fz, f.x, f.cy, f.z);
          if (r.u < 0.97 && r.d < f.R * 0.95) { occ = true; break; }
        }
      }
      if (occ) occluding++;
      const target = occ ? (deep >= 1 ? 0 : 0.25 - 0.15 * deep) : 1;   // the bigger it looms, the more it dissolves; lens inside = gone
      f.keep += (target - f.keep) * (target < f.keep ? kDown : kUp);
      if (f.keep > 0.995) f.keep = 1;
      if (f.keep < 1) list.push(f);
    }
    void aspect;
    kit.seeState.fading = See.setFades(list);
    kit.seeState.occluding = occluding;
  };
  kit.update = (t, dt, camera, focus) => {
    for (const fn of animators) { try { fn(t, dt, camera); } catch (e) { reportError('scenery animator', e); } }
    try { if (focus) kit.updateSee(dt, camera, focus); } catch (e) { reportError('scenery see-through', e); }
  };

  // ── merge ──
  kit.flush = () => {
    const ss = (n, o = {}) => kit.seeSurface(n, Object.assign({ vertexColors: true }, o));
    const MAT = {
      stone: ss('stone'), plaster: ss('plaster'), wood: ss('wood'), thatch: ss('thatch'), tile: ss('tile'), brick: ss('brick'),
      bark: ss('bark'), dirtbed: ss('dirt', { preset: 'ground' }),
      paint: kit._paintMat || (kit._paintMat = makeToon({ vertexColors: true }, {}, [See.patch])),
    };
    const out = [];
    for (const [k, list] of buckets) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), MAT[k] || MAT.paint); mesh.name = 'bucket-' + k; mesh.castShadow = k !== 'paint'; mesh.receiveShadow = true;
      scene.add(mesh); out.push(mesh);
    }
    buckets.clear();
    if (signParts.length && kit._signTex) {
      const signs = new THREE.Mesh(mergeGeometries(signParts), makeToon({ map: kit._signTex, vertexColors: true }, {}, [See.patch]));
      signs.name = 'signs'; signs.castShadow = true; signs.receiveShadow = true; scene.add(signs); out.push(signs);
      signParts.length = 0;
    }
    return out;
  };
  kit.useSignAtlas = (atlas) => { kit._signTex = atlas.tex; return atlas; };

  return kit;
}
