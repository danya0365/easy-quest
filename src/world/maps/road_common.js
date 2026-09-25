/**
 * road_common.js — the shared body of every OUTDOOR map P23B builds.          (P23B, owner: maps/road_*.js)
 *
 * `meadow.js` and `puddlewick.js` each hand-author their terrain, their skyline, their masks and their rim wood
 * in a thousand lines. Three more outdoor places (the Beck road, Saltmarrow, the Whispering Wood) cannot each be
 * a thousand lines and still be finished, so everything those three share lives here ONCE:
 *
 *   - the land: a shallow bowl of noise, closed by hills, with a notch in the rim on every bearing a lane
 *     runs out on (so a road always visibly GOES somewhere);
 *   - the worn-path / wet-ground / paving masks (P03 paintMasks) and the ground built off them;
 *   - the sky, its two hill rings, and the painted places on the skyline (P02) — re-aimed per map, and never
 *     including the map's OWN place (P23 gap #4: a town must not stand on its own horizon);
 *   - the rim wood, grass tufts, flowers, the water sheet, and the merge;
 *   - the standard field camera / music / encounter / exit plumbing.
 *
 * A map file then only says WHERE things are (`lanes`, `plots`, `props`, `exits`) and what its own dressing is
 * (`dress(kit, L, ctx)`), which is what makes three real places affordable.
 *
 *   import { outdoorMap } from './road_common.js';
 *   export default outdoorMap({ id: 'road_beck', name: 'The Beck Road', size: [72, 56], ... });
 *
 * Nothing here edits a kit: every recipe comes from src/art/* through ../scenery.js, exactly as documented.
 */
import * as THREE from 'three';
import { PAL, C3, lerp, smooth, mixHex } from '../../art/palette.js';
import { mulberry, vnoise } from '../../art/tex.js';
import { makeAOMask } from '../../art/toon.js';
import { reportError } from '../../engine/debug.js';
import { createKit, buildSky, ringHill, buildGround, paintMasks, curvePoints } from '../scenery.js';
import { LANDMARK_SETS } from '../../art/sky.js';

export const TAU = Math.PI * 2;
export const bump = (x, z, cx, cz, r) => Math.exp(-((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r));
export const gauss = (d, w) => Math.exp(-(d * d) / (w * w));
export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

/**
 * A skyline for a map that is NOT one of the painted places: take P02's four vale cards, drop the ones this map
 * would be painting of itself, and re-aim the rest down the bearings this map's own signposts point along.
 *   marks([{ id: 'saltmarrow', az: -0.3 }, { id: 'puddlewick', az: 2.6 }])
 */
export function marks(list) {
  const by = new Map(LANDMARK_SETS.vale.map(m => [m.id, m]));
  const out = [];
  for (const want of list || []) {
    const src = by.get(want.id);
    if (!src) continue;
    out.push(Object.assign({}, src, {
      az: Number.isFinite(+want.az) ? +want.az : src.az,
      dist: Math.max(216, want.dist || src.dist),
      width: Math.round(src.height * (want.aspect || 3.6)),
      haze: Math.min(0.46, src.haze + (want.haze ?? 0.13)),
    }));
  }
  return out.length ? out : false;
}

/**
 * Build a complete outdoor map def. Everything has a default; a map overrides what it cares about.
 *
 * o = {
 *   id, name, kind: 'field'|'town', size: [w, h], theme, music, ambience, hours, weather,
 *   spawn: {x, z, facing}, camera, encounters, landmarks: marks([...]),
 *   lanes:   [{ pts: [[x,z]...], w?, stone?: bool }]     worn paths (or paving) — also where the rim notches
 *   stream?: { pts: [[x,z]...], w?, y?, bank? }          a river / creek: carved, walkable only on bridges
 *   ponds?:  [{x, z, r, sx?, sz?}]
 *   sand?:   [{x, z, r}]                                 beach / dune discs (theme 'sand' ground)
 *   pads?:   [{x, z, r, y}]                              flattened building ground
 *   hills?:  [{x, z, r, h}]                              swells in the land
 *   bridges?:[{cx, cz, dir, L, W, arch, kind: 'stone'|'foot'}]
 *   rim?:    { radius?, rows?, seed?, threshold? }        the wood that closes the view
 *   trees?:  [{kind, x, z, s, r}]                         trees INSIDE the map
 *   tufts?:  { count?, radius? }   flowers?: [{x, z, hue, n, spread}]
 *   props, chests, colliders, occluders, exits, lines, spots, bossDoors
 *   dress(kit, L, ctx)                                   the map's own set dressing
 *   groundAt?(x, z, L) -> 'grass'|'dirt'|... | null       an override before the default rules
 *   solidAt?(x, z, L) -> bool | null
 *   heightAdd?(x, z) -> number                           extra land shaping
 * }
 */
export function outdoorMap(o) {
  const W = (o.size && o.size[0]) || 64, H = (o.size && o.size[1]) || 56;
  const HX = W / 2, HZ = H / 2;
  const AX = o.ax ?? (HX - 4), AZ = o.az ?? (HZ - 4);
  const MASK_SPAN = Math.max(W, H) + 44;
  const RIM = o.rim || {};
  const WATER_Y = (o.stream && o.stream.y) ?? -0.45;
  const HW = (o.stream && o.stream.w ? o.stream.w / 2 : 1.3);
  const BANK = (o.stream && o.stream.bank) ?? 0.8;
  const BED = WATER_Y - 0.7;
  const seed = o.seed ?? 17;

  const edgeR = (x, z) => Math.pow(Math.pow(Math.abs(x) / AX, 4) + Math.pow(Math.abs(z) / AZ, 4), 0.25);

  // ── the bare land: noise, the map's own swells, and a rim of hills notched wherever a lane runs out ────────
  const NOTCH = [];                       // bearings the rim sags on (filled by layout(), from the exits)
  function heightRaw(x, z) {
    let h = 1.1 * vnoise(x * 0.042 + seed * 0.7, z * 0.042 + seed * 1.3, 13)
      + 0.5 * vnoise(x * 0.105 + seed * 0.3, z * 0.105 + seed * 0.17, 17)
      + 0.14 * vnoise(x * 0.31, z * 0.31, 23) - 0.74;
    for (const b of (o.hills || [])) h += (b.h ?? 1) * bump(x, z, b.x, b.z, b.r ?? 8);
    if (typeof o.heightAdd === 'function') h += o.heightAdd(x, z) || 0;
    const e = edgeR(x, z), ang = Math.atan2(z, x);
    const lump = 0.6 * vnoise(Math.cos(ang) * 3 + 11, Math.sin(ang) * 3 + 11, 31) + 0.4 * vnoise(Math.cos(ang) * 7, Math.sin(ang) * 7, 37);
    let notch = 1;
    for (const n of NOTCH) notch -= n.k * gauss(angDiff(ang, n.az), n.w);
    notch = Math.max(0.12, notch);
    h += ((o.rimH ?? 2.2) + (o.rimAmp ?? 5.0) * lump) * notch * smooth(1.0, 2.1, e);
    return h;
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // layout — every decision about where things are, made once
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  let LAYOUT = null;
  function layout() {
    if (LAYOUT) return LAYOUT;
    const L = { W, H, AX, AZ, edgeR, spots: Object.assign({}, o.spots || null) };

    L.lanes = (o.lanes || []).map(l => Object.assign({}, l, { dense: curvePoints(l.pts, 0.35) }));
    L.stream = o.stream ? curvePoints(o.stream.pts, 0.35) : null;
    L.ponds = o.ponds || [];

    // the rim notches: one per exit bearing, so a lane always runs out through a dip in the hills
    NOTCH.length = 0;
    for (const e of (o.exits || [])) {
      // a DOOR is not a lane mouth: only an edge exit notches the hills and parts the rim wood
      const k = e.notch ?? (e.kind === 'door' ? 0 : 0.78);
      if (!Number.isFinite(+e.x) || !(k > 0)) continue;
      NOTCH.push({ az: Math.atan2(+e.z, +e.x), k, w: e.notchW ?? 0.34 });
    }
    for (const n of (o.notches || [])) NOTCH.push(Object.assign({ k: 0.7, w: 0.3 }, n));

    // ── the masks: worn lanes (0), wet ground (1), paving (2) ──
    const strokes = [], discs = [];
    for (const l of L.lanes) strokes.push({ pts: l.dense, w: l.w ?? 2.2, falloff: l.falloff ?? 1.0, channel: l.stone ? 2 : 0 });
    if (L.stream) strokes.push({ pts: L.stream, w: 2 * (HW + BANK), falloff: 1.2, channel: 1 });
    for (const p of L.ponds) discs.push({ x: p.x, z: p.z, r: p.r + BANK, sx: p.sx, sz: p.sz, falloff: 1.3, channel: 1 });
    for (const s of (o.paving || [])) discs.push({ x: s.x, z: s.z, r: s.r, sx: s.sx, sz: s.sz, falloff: s.falloff ?? 0.8, channel: 2 });
    for (const d of (o.wornDiscs || [])) discs.push({ x: d.x, z: d.z, r: d.r, falloff: d.falloff ?? 0.9, channel: 0 });
    L.masks = paintMasks({ N: 1024, span: MASK_SPAN, strokes, discs });

    // ── the bridges: their deck is what you walk on across the water ──
    L.bridges = (o.bridges || []).map(b => {
      const F = bridgeOf(b);
      return Object.assign(F, { kind: b.kind || 'stone' });
    });

    // ── distance to water (carving, reeds, and "can I stand here") ──
    const wdist = (x, z) => {
      let d = 1e9;
      if (L.stream) for (let i = 0; i < L.stream.length; i++) { const p = L.stream[i]; d = Math.min(d, Math.hypot(x - p[0], z - p[1])); }
      for (const p of L.ponds) d = Math.min(d, Math.max(0, Math.hypot((x - p.x) / (p.sx ?? 1), (z - p.z) / (p.sz ?? 1)) - p.r));
      return d;
    };
    L.wdist = wdist;
    L.deckY = (x, z) => { for (const b of L.bridges) { const y = b.deckY(x, z); if (y != null) return y; } return null; };
    L.onBridge = (x, z, pad = 0.25) => L.bridges.some(b => b.corridor(x, z, pad));

    L.props = (o.props || []).slice();
    L.chests = (o.chests || []).slice();
    L.colliders = (o.colliders || []).slice();
    L.occluders = (o.occluders || []).slice();
    L.exits = (o.exits || []).map(e => Object.assign({}, e));
    L.trees = (o.trees || []).slice();

    LAYOUT = L;
    return L;
  }

  // a bridge frame, without importing props.js's helper twice
  function bridgeOf(b) {
    const dir = b.dir || 0, L0 = b.L ?? 6.4, W0 = b.W ?? 2.4, arch = b.arch ?? 0.55, y0 = b.y0 ?? 0;
    const ax = Math.sin(dir), az = Math.cos(dir), sx = az, sz = -ax;
    const archY = (u) => y0 + arch * (1 - Math.pow(2 * u / L0, 2));
    const local = (x, z) => { const dx = x - b.cx, dz = z - b.cz; return { u: dx * ax + dz * az, v: dx * sx + dz * sz }; };
    const world = (u, v) => [b.cx + ax * u + sx * v, b.cz + az * u + sz * v];
    const posts = [-L0 / 2 + 0.25, -L0 / 6, L0 / 6, L0 / 2 - 0.25];
    return {
      cx: b.cx, cz: b.cz, dir, L: L0, W: W0, arch, y0, ax, az, sx, sz, archY, local, posts,
      rails: [-1, 1].map(side => [world(posts[0], side * (W0 / 2 - 0.08)), world(posts[posts.length - 1], side * (W0 / 2 - 0.08))]),
      ends: [world(-L0 / 2, 0), world(L0 / 2, 0)],
      deckY(x, z) { const { u, v } = local(x, z); if (Math.abs(u) > L0 / 2 || Math.abs(v) > W0 / 2) return null; return archY(u); },
      corridor(x, z, pad = 0.2) { const { u, v } = local(x, z); return Math.abs(u) <= L0 / 2 + pad && Math.abs(v) <= W0 / 2; },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // terrain
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  function heightAt(x, z) {
    const L = layout();
    let h = heightRaw(x, z);
    for (const p of (o.pads || [])) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + 3.5) h = lerp(h, p.y ?? heightRaw(p.x, p.z), 1 - smooth(p.r, p.r + 3.5, d));
    }
    h -= 0.07 * smooth(0.45, 0.92, L.masks.sample(0, x, z));
    if (L.stream || L.ponds.length) {
      const d = L.wdist(x, z);
      h = lerp(WATER_Y + (h - WATER_Y) * 0.3, h, smooth(2.2, 10, d));
      if (d < HW + BANK) h = lerp(BED, h, smooth(HW - 0.55, HW + BANK, d));
    }
    return h;
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // the def
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  const def = {
    id: o.id,
    name: o.name,
    kind: o.kind || 'field',
    size: [W, H],
    origin: [-HX, -HZ],
    res: 4,
    theme: o.theme || 'grass',
    music: o.music || 'overworld',
    ambience: o.ambience || 'amb_meadow',
    hours: o.hours ?? 10,
    light: { preset: o.lightPreset || 'day' },
    weather: o.weather || 'clear',
    encounters: o.encounters === undefined ? null : o.encounters,
    spawn: Object.assign({ x: 0, z: 0, facing: 0 }, o.spawn || null),
    camera: Object.assign({ orbit: 0, pitch: 27, dist: 10.5, fov: 49, lookUp: 2.6 }, o.camera || null),
    bossDoors: o.bossDoors || undefined,

    tiles: {
      height: heightAt,
      solid(x, z) {
        const L = layout();
        if (typeof o.solidAt === 'function') { const r = o.solidAt(x, z, L); if (r != null) return !!r; }
        if (L.edgeR(x, z) > 1) return true;
        if ((L.stream || L.ponds.length) && L.wdist(x, z) < HW + 0.3 && !L.onBridge(x, z, 0.3)) return true;
        return false;
      },
      ground(x, z) {
        const L = layout();
        if (L.deckY(x, z) != null) return 'wood';
        if (typeof o.groundAt === 'function') { const g = o.groundAt(x, z, L); if (g) return g; }
        if ((L.stream || L.ponds.length) && L.wdist(x, z) < HW) return 'water';
        if (L.masks.sample(2, x, z) > 0.5) return 'stone';
        if (L.masks.sample(0, x, z) > 0.5) return 'dirt';
        for (const s of (o.sand || [])) if (Math.hypot(x - s.x, z - s.z) < s.r) return 'sand';
        return 'grass';
      },
    },
    walkY(x, z, terrain) {
      const y = layout().deckY(x, z);
      const t = terrain(x, z);
      return y != null ? Math.max(t, y) : t;
    },

    get spots() { return layout().spots; },
    get props() { return layout().props; },
    get chests() { return layout().chests; },
    get colliders() { return layout().colliders; },
    get occluders() { return layout().occluders; },
    get exits() { return layout().exits; },
    lines: o.lines || {},
    npcs: [],

    // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
    // the art
    // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
    view(ctx) {
      const t0 = performance.now();
      const { scene, rig, App } = ctx;
      const safe = (name, fn) => { try { return fn(); } catch (e) { reportError(`${o.id}: ${name}`, e); return null; } };
      const low = !!(App && App.quality === 'low');
      const L = layout();
      const ao = makeAOMask({ span: MASK_SPAN, size: 1024, center: [0, 0] });
      const kit = createKit({ scene, heightAt, ao, low });

      // ── the sky and the hills behind it ──
      const sky = safe('sky', () => buildSky(scene, rig, { landmarks: o.landmarks || false }));
      safe('hills', () => {
        ringHill(scene, 'mid', 118, 150, 205, 5, 21, 71, PAL.hill.midLow, PAL.hill.mid, 0.2, { gates: 0.45 });
        ringHill(scene, 'far', 240, 300, 380, 12, 78, 81, PAL.hill.farLow, PAL.hill.far, 0.25, { fogged: false, peaky: 1.8, gates: 0.3 });
      });

      // ── the rim wood: the wall of green that closes the view, with a gap on every lane mouth ──
      const shade = makeAOMask({ span: MASK_SPAN + 80, size: 1024, center: [0, 0] });
      safe('rim', () => {
        const mouth = (x, z) => {
          const a = Math.atan2(z, x);
          for (const n of NOTCH) if (Math.abs(angDiff(a, n.az)) < (n.w * 1.5)) return true;
          return false;
        };
        kit.forestBelt({ radius: RIM.radius ?? (Math.max(AX, AZ) + 3), rows: low ? 2 : (RIM.rows ?? 3), rowGap: RIM.rowGap ?? 6.5,
          seed: RIM.seed ?? 777, threshold: RIM.threshold ?? 0.3,
          skip: (x, z) => mouth(x, z) || (typeof o.rimSkip === 'function' && !!o.rimSkip(x, z)) });
      });

      // ── the map's own trees, then its dressing ──
      safe('trees', () => { if (L.trees.length) kit.trees(L.trees, { shade }); });
      safe('bridges', () => {
        for (const b of L.bridges) { if (b.kind === 'foot') kit.footbridge(b); else kit.stoneBridge(b); }
      });
      safe('dress', () => { if (typeof o.dress === 'function') o.dress(kit, L, ctx); });

      safe('flush', () => kit.flush());
      safe('water', () => {
        if (!L.stream && !L.ponds.length) return;
        kit.water({ stream: L.stream || undefined, width: 2 * (HW + BANK + 0.45),
          ponds: L.ponds.map(p => ({ x: p.x, z: p.z, r: p.r + BANK + 1.4, sx: p.sx, sz: p.sz })),
          y: WATER_Y, shoreDepth: 0.42 });
      });

      // ── the grass: tufts and flowers, outside every footprint the dressing registered ──
      const pathAt = (x, z) => L.masks.sample(0, x, z);
      const open = (x, z) => L.edgeR(x, z) < 1.02 && pathAt(x, z) < 0.34 && L.masks.sample(2, x, z) < 0.3
        && (!(L.stream || L.ponds.length) || L.wdist(x, z) > 2.1) && !L.onBridge(x, z, 1);
      safe('tufts', () => {
        const dryAt = (x, z) => {
          const n = vnoise(x * 0.055 + 31.7, z * 0.055 + 12.3, 77);
          return smooth(0.42, 0.8, n) * (0.45 + 0.55 * smooth(-0.4, 1.6, heightRaw(x, z)));
        };
        kit.tufts({ count: low ? 620 : (o.tufts && o.tufts.count) || 1200, radius: (o.tufts && o.tufts.radius) || Math.max(AX, AZ),
          seed: 999 + seed, accept: open, dry: dryAt,
          rimOf: (x, z) => { const p = pathAt(x, z); return smooth(0.08, 0.3, p) * (1 - smooth(0.3, 0.42, p)); } });
      });
      safe('flowers', () => {
        const hues = [PAL.flower.white, PAL.flower.yellow, PAL.flower.pink, PAL.flower.blue];
        const fr = mulberry(511 + seed), clusters = (o.flowers || []).slice();
        for (let i = 0; i < (o.flowerCount ?? 34); i++) {
          clusters.push({ x: (fr() - 0.5) * AX * 1.9, z: (fr() - 0.5) * AZ * 1.9, hue: hues[(fr() * hues.length) | 0],
            n: 5 + (fr() * 13 | 0), spread: 0.7 + fr() * 1.7 });
        }
        if (clusters.length) kit.flowers(clusters, { accept: (x, z) => open(x, z) && pathAt(x, z) < 0.2 });
      });

      // ── the ground LAST: it samples the finished AO mask ──
      safe('ground', () => buildGround(scene, { heightAt, masks: L.masks, ao, shade,
        inner: Math.max(AX, AZ) + 2, step: low ? 1.3 : 1.0, outer: 132, rings: 8 }));

      safe('birds', () => kit.birds(o.birds ?? 4, { centre: [0, 0], height: 12, radius: Math.max(AX, AZ) * 0.6, seed: 91 + seed }));
      safe('highfeather', () => { if (sky && sky.clouds) kit.skyCastle({ azimuth: o.skyCastleAz ?? -1.12, elevation: 0.33, distance: 720, size: 112, opacity: 0.45, tintFrom: sky.clouds.material }); });

      const buildMs = Math.round(performance.now() - t0);
      return {
        update(t, dt, c) {
          kit.update(t, dt, c && c.camera, c && c.player);
          if (sky && sky.update) sky.update(t, dt, c && c.camera);
        },
        state() { return { buildMs, counts: Object.assign({}, kit.counts), lanes: L.lanes.length, exits: L.exits.length }; },
      };
    },
  };

  /** Where everything is, for scenarios, critics and the layers that fill this map (read-only). */
  def.layout = layout;
  return def;
}

export { PAL, C3, lerp, smooth, mixHex, vnoise, mulberry, THREE };
