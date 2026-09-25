/**
 * buildings.js — the village building kit: cottages, the inn, the church, the shop, barns, the mill, market stalls,
 *                the well, the stone bridge, festival dressing, doors that open, chimney smoke.
 *                                                                                 (P05, owner: src/art/buildings.js)
 *
 * Recipes are docs/ART-DIRECTION.md §13 expressed ONLY through F3's foundation (PAL, Tex, makeToon; materials come
 * from the kit's merge buckets). The three original recipes (gableRoof, cottage, smoke) keep their exact signatures —
 * src/world/maps/meadow.js and demos/P07.html build with them.
 *
 *   buildingRecipes(kit) adds, on top of src/art/props.js' kit core:
 *     ── walls and roofs ────────────────────────────────────────────────────────────────────────────────────────
 *     kit.gableRoof(base, W, D, H0, pitch, ovx, ovz, t, kind, gable?, gableColor?, {barge, verge}) -> ridgeY
 *     kit.cottage(o) -> {y, ridgeY, chimneyTop, chimneyTops, door, doorway, front, id}
 *          o = {x, z, rot, W, D, H, roof:'tile'|'thatch', pitch, walls:'plaster'|'stone'|'planks', wallTint,
 *               doorX, doorColor, doorW, doorStyle, doubleDoor, opens:{id, reach}|true, frontWindows:[], sideWindows:[],
 *               backWindow, upperWindows:[], storeys:1|2, H2, jetty, shutter, chimney:'brick'|'stone'|null, chimneyX,
 *               chimneys:[x], braces, barge, sill:'flowers'|'bread'|'none', sign:{icon, text, panel, side},
 *               awning:{color, stripe, over:[x], depth}, oven:'left'|'right', roses:[x], lamp, steps}
 *     kit.inn(o) · kit.shop(o) · kit.bakery(o) · kit.barn(o) · kit.mill(o) · kit.church(o)      (presets over cottage)
 *     ── doors that open (every door in a town is an exit) ──────────────────────────────────────────────────────
 *     kit.doorsUpdate(dt, focus) — wired into kit.update(t, dt, camera, focus), so a map gets it for free
 *     kit.doors -> [{id, x, z, nx, nz, amount, ...}] · kit.doorAt(id) · kit.setDoor(id, 0..1|null)
 *     kit.onDoor = (door, opening) => {}      // the map plays Sfx 'door_open' on this
 *     ── village furniture ──────────────────────────────────────────────────────────────────────────────────────
 *     kit.wellHouse(x, z, o) · kit.stoneBridge(frame, o) · kit.stall(o) · kit.stoneWall(pts, o) · kit.standingStone(...)
 *     kit.bunting(points, o) · kit.hangingSign(o) · kit.awning(o) · kit.maypole(x, z, o) · kit.trestleTable(x, z, rot, o)
 *     kit.noticeBoard(x, z, rot, o) · kit.sacks(x, z, n, rot, seed)      (hay, veg patches, ripples: P04's props kit)
 *     ── moving charm ───────────────────────────────────────────────────────────────────────────────────────────
 *     kit.smoke([Vector3]) -> InstancedMesh (chimney smoke); the mill wheel turns and asks kit.ripples for foam
 *
 * Kit contract used here (src/art/props.js createPropsKit): kit.scene, kit.heightAt, kit.ao, kit.animators,
 * kit.addTo(bucket, geo, matrix, color) with buckets stone | plaster | wood | thatch | tile | brick | bark | paint,
 * kit.footBox / kit.footDisc, kit.seeSurface(tex), kit.flush() (wrapped here: it also merges this kit's own
 * cloth / sign / door / interior meshes) and kit.update() (wrapped here: it also animates the doors).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, css, smooth, lerp, mixHex } from './palette.js';
import { Tex, mulberry, vnoise, mkCanvas, ctx2 } from './tex.js';
import { makeToon, TOON_PRESETS, See, hullGeometry } from './toon.js';
import { M4, boxUV, scaleUV, wrapUV, prep, hashJ } from './props.js';
import { Font } from '../ui/font.js';
import { reportError } from '../engine/debug.js';

const TAU = Math.PI * 2;
const WALL_T = 0.26;                  // wall thickness of a hollow shell (a building whose door opens)
const LEAF = {                        // the unit size of each door-leaf style (instances are scaled to fit)
  plank: { w: 0.9, h: 1.8 },
  barn: { w: 1.15, h: 2.5 },
  church: { w: 0.8, h: 2.3 },
};

/** A local point in a building's frame -> world. */
const toWorld = (o, lx, lz) => {
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// kit recipes (installed by src/world/scenery.js createKit)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function buildingRecipes(kit) {
  const { scene, heightAt, ao, animators } = kit;

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // A BUILDING IS ONE THING — the fade unit                                                      (P05 gap #2)
  //
  // The camera's see-through used to run on the kit's MERGED MATERIAL BUCKETS: every wall in the village in one
  // mesh, every roof in another. It then had to guess where one house ended and the next began by chopping those
  // buckets into runs and clustering the runs by proximity — which is why one cottage came out as eight pieces at
  // five different alphas, why a run box with nothing in it swallowed the lens and dropped a whole wall to alpha
  // 0, and why a "ghost" was a milky film cut by a dead-straight horizontal line that followed no silhouette.
  //
  // Here a building owns its geometry. Every addTo() between beginBuilding() and endBuilding() goes into THAT
  // building's own meshes (one per material, plus its door leaves, its swinging sign, its awning, its mill
  // wheel), the meshes carry userData.camIgnore so P09's pass leaves them alone, and this file fades them:
  //   * ONE alpha for the whole house, eased over 150 ms out / 220 ms in;
  //   * its own depth pre-pass, so a ghost is one clean surface and not four stacked translucent walls;
  //   * an ink outline drawn over it, so the silhouette still reads;
  //   * and the alpha is CLAMPED to 0.38-0.42 — never 0, not even with the lens inside the shell. A house you
  //     walk behind goes to glass, never to nothing.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  const BUILT = [];                   // every building: its meshes, its box, its alpha
  let CUR = null;                     // the building being built right now (addTo routes into it)
  const GH = {
    alpha: 0.40,                      // the DQ see-through level (the brief says 35-45%)
    min: 0.38, max: 0.42,             // ... and it may never leave this band while it is ghosting
    ink: 0.85,                        // the ink line stays stronger than the fill
    outMs: 150, inMs: 220, hold: 0.12,
    pad: 0.30,                        // the sight line is fattened by this (a box says "blocked" a little early)
    lens: 0.55,                       // ... and a surface this close to the lens ghosts whether or not it covers him
    most: 5,                          // at most this many houses ghost at once
  };

  const beginBuilding = (o, kind) => {
    if (CUR) return null;             // shop/barn/mill wrap kit.cottage: the OUTER call owns the building
    CUR = { id: o.id || `bld-${BUILT.length}`, kind, x: +o.x || 0, z: +o.z || 0, rot: +o.rot || 0,
      geos: new Map(), cloth: new Map(), interior: [], glow: [], meshes: [], extra: [], parts: [],
      alpha: 1, hit: 0, dist: 0, ghosting: false, why: '', depth: null, ink: null,
      lo: null, hi: null };
    BUILT.push(CUR);
    return CUR;
  };
  const endBuilding = (b) => { if (b && CUR === b) CUR = null; };
  /** Anything with a mesh of its own (a door leaf, a sign, the mill wheel) fades with the house it belongs to. */
  const ownMesh = (mesh) => { if (CUR && mesh) CUR.extra.push(mesh); return mesh; };
  const currentBuilding = () => CUR;

  /**
   * The kit's addTo, but while a building is being built the geometry is kept for that building instead of
   * going into the village-wide bucket. Same signature, same return value (the recipes tint the geometry they
   * get back), so every recipe below is untouched.
   */
  const addTo = (bucket, geo, matrix, color) => {
    if (!CUR) return kit.addTo(bucket, geo, matrix, color);
    const g = prep(geo, color);
    if (matrix) g.applyMatrix4(matrix);
    let l = CUR.geos.get(bucket);
    if (!l) CUR.geos.set(bucket, l = []);
    l.push(g);
    return g;
  };

  // ── this kit's own merged meshes (flushed with the buckets) ────────────────────────────────────────────────
  const CLOTH = new Map();            // texture key -> {tex, geos: []}    awnings, bunting, stall roofs
  const INTERIOR = [];                // the dark warm room you see through an open door
  const GLOW = [];                    // unshaded warm light INSIDE a room: firelight, lamps, daylight in a door
  const DOORS = [];                   // every registered door leaf group
  const SIGNS = [];                   // hanging boards (each swings, so each is its own small mesh)
  const BOARDS = [];                  // sign board geometries waiting for their pivot groups
  let signAtlas = null;

  const beam = PAL.wood.beam;
  const woodMat = () => kit.seeSurface('wood', { vertexColors: true });
  const paintMat = () => (kit._bldPaint || (kit._bldPaint = makeToon({ vertexColors: true }, {}, [See.patch])));

  /**
   * A FRESH copy of a bucket's surface, for one building only. The kit caches one material per texture, which is
   * right for a village-wide bucket and wrong here: two houses ghosting at different moments must not share an
   * opacity. Same options, same shader patches, so the program cache still compiles one program per surface.
   */
  const BLD_PRESET = { plaster: 'plaster', thatch: 'thatch', dirt: 'ground' };
  const BLD_TEX = { stone: 'stone', plaster: 'plaster', wood: 'wood', thatch: 'thatch', tile: 'tile',
    brick: 'brick', bark: 'bark', dirtbed: 'dirt' };
  function bldSurface(bucket) {
    // deliberately WITHOUT See.patch: a building's see-through is this file's, so the old screen-door uniforms
    // (and P09's near-melt) can never reach it and dither half a wall away behind our back.
    if (bucket === 'paint' || bucket === 'glow' || !BLD_TEX[bucket]) return makeToon({ vertexColors: true }, {});
    const tex = BLD_TEX[bucket];
    return makeToon({ map: Tex.get(tex), vertexColors: true }, TOON_PRESETS[BLD_PRESET[tex] || 'default'] || {});
  }

  /** Lowest terrain under a (rotated) footprint, minus a whisker: nothing floats, nothing shows daylight beneath. */
  const padY = (o, W, D) => {
    let m = Infinity;
    for (const [lx, lz] of [[0, 0], [-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], [0, D / 2], [0, -D / 2], [-W / 2, 0], [W / 2, 0]]) {
      const p = toWorld(o, lx, lz);
      m = Math.min(m, heightAt(p.x, p.z));
    }
    return m - 0.05;
  };
  /**
   * HIGHEST terrain under the same footprint. A house stands at the LOWEST corner (padY) so no daylight shows
   * under its sill — which means the hillside inside it can be most of a metre higher than that. The floor of the
   * room you see through the open door has to clear THAT, or the meadow grows through the back of the chapel
   * (P05 gap #4, measured: the chapel's ground runs 0.10 at the door to 1.51 at the altar end).
   */
  const padTop = (o, W, D) => {
    let m = -Infinity;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const p = toWorld(o, (i / 4 - 0.5) * W * 0.98, (j / 4 - 0.5) * D * 0.98);
      m = Math.max(m, heightAt(p.x, p.z));
    }
    return m;
  };

  const clothGeos = (base, stripe, scallop, S = 128) => {
    const key = `${base}|${stripe || '-'}|${scallop ? 1 : 0}|${S}`;
    if (!CLOTH.has(key)) CLOTH.set(key, { tex: Tex.cloth(base, { stripe, scallop, S }), geos: [] });
    // an awning belongs to the shop it is nailed to: it ghosts with it instead of hanging in mid-air
    if (CUR) {
      let c = CUR.cloth.get(key);
      if (!c) CUR.cloth.set(key, c = { tex: CLOTH.get(key).tex, geos: [] });
      return c.geos;
    }
    return CLOTH.get(key).geos;
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // roofs (ART-DIRECTION §13) — thick, overhanging, with a ridge you can read from across the green
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  kit.gableRoof = (base, W, D, H0, pitch, ovx, ovz, t, kind, gable = 'plaster', gableColor, opts = {}) => {
    const run = D / 2 + ovz, L = run / Math.cos(pitch), ridgeY = H0 + (D / 2) * Math.tan(pitch);
    const texS = Tex.worldSize(kind);
    for (const side of [0, 1]) {
      const slab = boxUV(W + 2 * ovx, t, L, texS);
      const cy = ridgeY - (L / 2) * Math.sin(pitch) + (t / 2) * Math.cos(pitch), cz = (L / 2) * Math.cos(pitch) + (t / 2) * Math.sin(pitch);
      const m = new THREE.Matrix4().makeRotationX(pitch).setPosition(0, cy, cz);
      if (side) m.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
      addTo(kind, slab, base.clone().multiply(m));
      if (kind === 'thatch') {
        const roll = new THREE.CylinderGeometry(t * 0.62, t * 0.62, W + 2 * ovx + 0.1, 10); scaleUV(roll, 0.35);
        const ey = ridgeY - L * Math.sin(pitch) + (t * 0.45) * Math.cos(pitch), ez = L * Math.cos(pitch) + (t * 0.45) * Math.sin(pitch);
        const rm = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, ey, ez);
        if (side) rm.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
        addTo('thatch', roll, base.clone().multiply(rm));
      } else if (opts.barge) {
        // a barge board down each gable rake: the tile roof gets a carpentered edge instead of a sawn-off slab
        for (const sx of [-1, 1]) {
          const bb = boxUV(0.1, 0.3, L + 0.1, 1.2);
          const m2 = new THREE.Matrix4().makeRotationX(pitch).setPosition(sx * (W / 2 + ovx + 0.05), cy - t * 0.1, cz);
          if (side) m2.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
          addTo('wood', bb, base.clone().multiply(m2), opts.bargeColor || PAL.wood.weathered);
        }
      }
    }
    const shape = new THREE.Shape(); shape.moveTo(-D / 2, 0); shape.lineTo(D / 2, 0); shape.lineTo(0, ridgeY - H0); shape.closePath();
    for (const sx of [-1, 1]) {
      const gab = scaleUV(new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false }), Tex.worldSize(gable));
      addTo(gable, gab, base.clone().multiply(M4(sx * (W / 2) + (sx < 0 ? 0 : -0.14), H0, 0, Math.PI / 2)), gableColor || undefined);
    }
    if (kind === 'thatch') {
      const ridge = new THREE.CylinderGeometry(t * 0.95, t * 0.95, W + 2 * ovx + 0.2, 12); scaleUV(ridge, 0.4);
      addTo('thatch', ridge, base.clone().multiply(M4(0, ridgeY + t * 0.55, 0, 0, 0, Math.PI / 2)));
    } else {
      const ridge = new THREE.CylinderGeometry(0.17, 0.17, W + 2 * ovx + 0.1, 10); scaleUV(ridge, 0.5);
      addTo('tile', ridge, base.clone().multiply(M4(0, ridgeY + t * 0.75, 0, 0, 0, Math.PI / 2)), PAL.tile.ridge);
    }
    return ridgeY;
  };

  /** A four-sided pyramid roof (bell towers, the well house): tiles, a ridge ball, and an optional gold finial. */
  const pyramidRoof = (base, side, h, kind = 'tile', { finial = false } = {}) => {
    const r = side * Math.SQRT1_2 + 0.1;
    const cone = new THREE.ConeGeometry(r, h, 4, 1);
    wrapUV(cone, Math.max(1, Math.round((4 * side) / Tex.worldSize(kind))), h / Tex.worldSize(kind));
    addTo(kind, cone, base.clone().multiply(M4(0, h / 2, 0, Math.PI / 4)));
    addTo(kind === 'thatch' ? 'thatch' : 'tile', new THREE.SphereGeometry(0.16, 10, 8), base.clone().multiply(M4(0, h + 0.05, 0)), PAL.tile.ridge);
    if (finial) addTo('paint', new THREE.SphereGeometry(0.13, 10, 8), base.clone().multiply(M4(0, h + 0.24, 0)), PAL.paint.gold);
    return h;
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // doors that open
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  const leafGeometry = (style, color) => {
    const parts = [], put = (g, m, c) => { const q = prep(g, c); if (m) q.applyMatrix4(m); parts.push(q); };
    const dark = mixHex(color, PAL.wood.dark, 0.4), lite = mixHex(color, PAL.wood.light, 0.3);
    if (style === 'barn') {
      const { w, h } = LEAF.barn, t = 0.1;
      put(boxUV(w, h, t, 1.2), M4(w / 2, h / 2, 0), color);
      for (const zs of [-1, 1]) {
        for (const yy of [0.12, h - 0.12]) put(boxUV(w, 0.18, 0.05, 1.2), M4(w / 2, yy, zs * (t / 2 + 0.02)), lite);
        for (const s of [-1, 1]) {
          const bl = Math.hypot(w - 0.2, h / 2 - 0.24);
          put(boxUV(0.14, bl, 0.04, 1.2), M4(w / 2, h / 2 + s * 0.02, zs * (t / 2 + 0.02), 0, 0, s * Math.atan2(w - 0.2, h / 2 - 0.24)), lite);
        }
        put(new THREE.BoxGeometry(0.5, 0.07, 0.03), M4(0.26, 0.5, zs * (t / 2 + 0.05)), PAL.paint.iron);
        put(new THREE.BoxGeometry(0.5, 0.07, 0.03), M4(0.26, h - 0.5, zs * (t / 2 + 0.05)), PAL.paint.iron);
      }
      put(new THREE.TorusGeometry(0.08, 0.02, 5, 12), M4(w - 0.14, h * 0.45, 0.07, 0, Math.PI / 2), PAL.paint.iron);
    } else if (style === 'church') {
      const { w, h } = LEAF.church, t = 0.11;
      put(boxUV(w, h, t, 1.0), M4(w / 2, h / 2, 0), color);
      for (const zs of [-1, 1]) {
        for (const yy of [0.3, h - 0.3]) put(boxUV(w - 0.04, 0.12, 0.04, 1), M4(w / 2, yy, zs * (t / 2 + 0.02)), dark);
        for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++)
          put(new THREE.SphereGeometry(0.045, 7, 5), M4(0.22 + k * 0.36, 0.55 + i * 0.4, zs * (t / 2 + 0.03)), PAL.paint.iron);
        put(new THREE.TorusGeometry(0.1, 0.022, 5, 14), M4(w - 0.16, h * 0.42, zs * (t / 2 + 0.04), 0, Math.PI / 2), PAL.paint.iron);
      }
    } else {
      const { w, h } = LEAF.plank, t = 0.09;
      put(boxUV(w, h, t, 1.0), M4(w / 2, h / 2, 0), color);
      for (const zs of [-1, 1]) {
        for (const yy of [0.34, h - 0.34]) {
          put(boxUV(w - 0.1, 0.13, 0.035, 1), M4(w / 2, yy, zs * (t / 2 + 0.02)), dark);
          put(new THREE.BoxGeometry(0.44, 0.055, 0.025), M4(0.24, yy, zs * (t / 2 + 0.05)), PAL.paint.iron);
        }
        put(new THREE.SphereGeometry(0.052, 9, 7), M4(w - 0.16, h * 0.51, zs * (t / 2 + 0.05)), PAL.paint.gold);
      }
    }
    return mergeGeometries(parts);
  };

  /**
   * Register a door: one leaf (hinged left) or two (hinged at both jambs). Local frame = the building's `base`.
   * Returns {id, x, z, nx, nz, front:{x, z}, yaw} — the doorway in world space, and the spot to stand outside it.
   */
  const registerDoor = ({ id, base, style = 'plank', color = PAL.paint.doorRed, x: dx = 0, y0 = 0, zFace, w, h, double = false, reach = 3.1, max = null }) => {
    const unit = LEAF[style] || LEAF.plank;
    const zc = zFace - WALL_T * 0.5;
    const leaves = [];
    if (double) {
      leaves.push({ m: base.clone().multiply(M4(dx - w / 2, y0 + 0.01, zc)), sign: -1, sx: (w / 2) / unit.w, sy: h / unit.h });
      leaves.push({ m: base.clone().multiply(M4(dx + w / 2, y0 + 0.01, zc, Math.PI)), sign: 1, sx: (w / 2) / unit.w, sy: h / unit.h });
    } else {
      leaves.push({ m: base.clone().multiply(M4(dx - w / 2, y0 + 0.01, zc)), sign: -1, sx: w / unit.w, sy: h / unit.h });
    }
    const c = new THREE.Vector3(dx, 0, zFace).applyMatrix4(base);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(base).setY(0).normalize();
    const door = {
      id: id || `door-${DOORS.length}`, style, color, leaves, x: c.x, z: c.z, nx: n.x, nz: n.z,
      front: { x: c.x + n.x * 1.7, z: c.z + n.z * 1.7 }, yaw: Math.atan2(n.x, n.z),
      amount: 0, vel: 0, target: 0, force: null, reach, max: max ?? (double ? 1.2 : 1.32), opens: 0,
      bld: CUR,                        // the house this door belongs to, so the leaf ghosts with it
    };
    DOORS.push(door);
    return door;
  };

  /**
   * Light you can see, indoors. The kit core's 'glow' bucket is tuned for lanterns on a village street: it DIMS
   * by 0.78 in daylight and only brightens at dusk, which indoors turned every fire and every lamp into a flat
   * white pebble. This bucket is unshaded and always at full strength, because a hearth does not know it is
   * three o'clock. Merged by kit.flush() into one mesh named 'roomglow'.
   */
  kit.addGlow = (geo, matrix, hex) => { const g = prep(geo, hex); if (matrix) g.applyMatrix4(matrix); (CUR ? CUR.glow : GLOW).push(g); return g; };

  kit.doors = DOORS;
  kit.doorAt = (id) => DOORS.find(d => d.id === id) || null;
  /** Force a door open (1) or shut (0). null also means shut — doors no longer auto-open on approach. */
  kit.setDoor = (id, v) => { const d = kit.doorAt(id); if (d) d.force = v == null ? 0 : Math.max(0, Math.min(1, +v)); return !!d; };
  kit.onDoor = null;

  let doorMeshes = [];
  /**
   * One MESH per leaf, not one InstancedMesh per style. It costs a dozen draw calls and buys the thing the
   * see-through pass could not do before: P09's occluder fade clusters solid meshes that touch each other into one
   * object, but handles instanced meshes one instance at a time — so a ghosting cottage used to leave its red door
   * hanging in mid-air on the green (P05 gap #2). A leaf that is its own mesh sits in the doorway, touching the
   * wall runs, and fades with the house it belongs to.
   */
  const buildDoors = () => {
    const made = [];
    const geos = new Map();
    for (const d of DOORS) {
      const key = `${d.style}|${d.color}`;
      if (!geos.has(key)) geos.set(key, leafGeometry(d.style, d.color));
      for (const lf of d.leaves) {
        // its own material instance, so the leaf can go to glass with its house and not with every other door
        const mesh = new THREE.Mesh(geos.get(key), d.bld ? bldSurface('wood') : woodMat());
        mesh.name = 'door-' + d.id; mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
        lf.mesh = mesh; lf.index = -1;
        scene.add(mesh);
        if (d.bld) { d.bld.extra.push(mesh); mesh.userData.camIgnore = true; }
        made.push(mesh);
      }
    }
    doorMeshes = made;
    writeDoors(true);
    return made;
  };

  const dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), dv = new THREE.Vector3(), ds = new THREE.Vector3(), dy = new THREE.Vector3(0, 1, 0);
  const writeDoors = (all = false) => {
    for (const d of DOORS) {
      if (!all && !d.dirty) continue;
      d.dirty = false;
      const ang = d.amount * d.max;
      for (const lf of d.leaves) {
        if (!lf.mesh) continue;
        dq.setFromAxisAngle(dy, ang * lf.sign);
        dm.compose(dv.set(0, 0, 0), dq, ds.set(lf.sx, lf.sy, 1));
        dm.premultiply(lf.m);
        if (lf.mesh.isInstancedMesh) { lf.mesh.setMatrixAt(lf.index, dm); lf.mesh.instanceMatrix.needsUpdate = true; }
        else { lf.mesh.matrix.copy(dm); lf.mesh.matrixWorldNeedsUpdate = true; }
      }
    }
  };

  /**
   * Doors stay shut until something asks — kit.setDoor(id, 1) from Confirm on the door prop.
   * Proximity auto-open used to swing every leaf as you walked the green (owner, 2026-09-25).
   * Wired into kit.update, so every map that calls kit.update(t, dt, camera, focus) gets it.
   */
  kit.doorsUpdate = (dt, focus) => {
    if (!DOORS.length) return;
    void focus;
    const step = Math.max(0, Math.min(0.06, dt || 0));
    for (const d of DOORS) {
      const want = d.force != null ? d.force : 0;
      if (want > 0.5 && d.target < 0.5) { d.opens++; if (typeof kit.onDoor === 'function') { try { kit.onDoor(d, true); } catch (e) { reportError('kit.onDoor', e); } } }
      d.target = want;
      const a0 = d.amount;
      d.vel += (d.target - d.amount) * 90 * step;
      d.vel *= Math.exp(-step * 11);
      d.amount = Math.max(-0.02, Math.min(1.06, d.amount + d.vel * step));
      if (Math.abs(d.amount - d.target) < 0.002 && Math.abs(d.vel) < 0.01) { d.amount = d.target; d.vel = 0; }
      if (Math.abs(d.amount - a0) > 1e-4) d.dirty = true;
    }
    writeDoors();
  };

  /**
   * WHAT YOU SEE THROUGH AN OPEN DOOR.                                                          (P05 gap #4)
   *
   * The old one was a hollow box with a single top-to-bottom gradient painted on it, which is why a horizontal
   * line sampled across a church doorway came back as the SAME byte triple all the way across: a flat card
   * facing the lens, with no floor, no perspective and no depth falloff. This is a room instead. It is built
   * out of separate inward-facing surfaces, each with its own colour, so the eye gets the three things that
   * make a room a room:
   *   1. A FLOOR — a horizontal plane running away from you, bright warm boards at the threshold falling off
   *      into the dark at the back. A horizontal plane in perspective is the whole trick; nothing else reads.
   *   2. SIDE WALLS that recede, darker than the floor, darker still with depth.
   *   3. SOMETHING ONE METRE IN, lit: the daylight pool the open door itself throws on the boards, a rug edge,
   *      a stool or a pew, and — for a house — the hearth's ember glow on the back wall with its own warm pool
   *      on the floor in front of it.
   * Plus the two rules that were already right: the floor clears the HIGHEST ground under the footprint so the
   * hillside can never grow into the room, and the room fills the shell so a church door shows a nave.
   * The rooms a child can actually WALK into are their own maps (src/world/maps/hollybank.js, puddlewick_inn.js).
   */
  const ROOM = (g) => { (CUR ? CUR.interior : INTERIOR).push(g); return g; };
  /** An inward-facing panel with a colour ramp along its own local +y (or +x when `acrossX`). */
  const panel = (base, wq, hq, m, a, b, acrossX = false) => {
    const g = prep(new THREE.PlaneGeometry(wq, hq, 1, 3), PAL.mask.on);
    const p = g.attributes.position, c = g.attributes.color, t = new THREE.Color();
    const ca = C3(a), cb = C3(b), half = (acrossX ? wq : hq) / 2 || 1;
    for (let i = 0; i < p.count; i++) {
      const u = ((acrossX ? p.getX(i) : p.getY(i)) + half) / (2 * half);
      t.copy(ca).lerp(cb, Math.max(0, Math.min(1, u)));
      c.setXYZ(i, t.r, t.g, t.b);
    }
    g.applyMatrix4(base.clone().multiply(m));
    return ROOM(g);
  };
  const roomSlab = (base, g, m, hex) => { const q = prep(g, hex); q.applyMatrix4(base.clone().multiply(m)); return ROOM(q); };

  const interiorRoom = (base, { x = 0, zFace, T = WALL_T, y0 = 0, w, h, depth = 1.1, roomW = null, floorY = null,
    top = null, hearth = false, kind = 'house' } = {}) => {
    const W = roomW != null ? roomW : w + 0.55;
    // A room whose boards sit level with (or above) the door head is a wall with a door painted on it — which is
    // exactly what Hollybank's open door was showing. The floor clears the high ground under the house, but never
    // by more than a third of the doorway, so there is always a floor to see through the opening.
    const want = floorY != null ? floorY : y0 + 0.09;
    const fy = Math.min(want, y0 + Math.max(0.08, h * 0.32));
    const ceil = Math.max(fy + Math.max(h, 1.6) + 0.3, top != null ? top : fy + h + 0.5);
    const H = ceil - fy;
    const D = Math.max(1.2, depth);
    const zF = zFace - T + 0.01;                  // the inner face of the front wall: where the room starts
    const zB = zF - D;                            // the back wall
    const zc = (zF + zB) / 2;

    const near = mixHex(PAL.wood.light, PAL.interior.lamp, 0.34);          // boards in the daylight at the door
    const far = mixHex(PAL.wood.dark, PAL.interior.dark, 0.72);            // boards at the back of the room
    const wallNear = mixHex(PAL.plaster.grime, PAL.interior.dark, 0.5);
    const wallFar = mixHex(PAL.interior.dark, PAL.interior.haze, 0.35);
    const stone = kind === 'church';

    // 1. the floor: local +y after the -90 deg X spin runs INTO the room, so the ramp is bright at the door
    panel(base, W, D, M4(x, fy, zc, 0, -Math.PI / 2), stone ? mixHex(PAL.stone.light, PAL.interior.lamp, 0.25) : near,
      stone ? mixHex(PAL.stone.dark, PAL.interior.dark, 0.6) : far);
    // 2. the ceiling, dark, so the top of the opening does not read as sky
    panel(base, W, D, M4(x, fy + H, zc, 0, Math.PI / 2), mixHex(PAL.interior.dark, PAL.wood.dark, 0.35), PAL.interior.dark);
    // 3. the two side walls, receding
    for (const s of [-1, 1]) panel(base, D, H, M4(x + s * W / 2, fy + H / 2, zc, -s * Math.PI / 2), wallFar, wallNear, true);
    // 4. the back wall
    panel(base, W, H, M4(x, fy + H / 2, zB), mixHex(wallNear, PAL.interior.dark, 0.45), wallFar);

    // ── the lit things, one metre in ──────────────────────────────────────────────────────────────────────────
    // board joints running away from you: three thin dark lines are all it takes for the floor to read as boards
    // in perspective rather than as a painted gradient
    for (let k = -1; k <= 1; k++) {
      roomSlab(base, new THREE.PlaneGeometry(0.045, D * 0.94), M4(x + k * Math.max(0.42, W * 0.22), fy + 0.008, zc, 0, -Math.PI / 2),
        mixHex(PAL.wood.dark, PAL.interior.dark, 0.5));
    }
    // the daylight the open door itself lays on the boards: a warm wedge just inside the threshold
    roomSlab(base, new THREE.PlaneGeometry(Math.min(w + 0.3, W * 0.8), Math.min(0.85, D * 0.4)),
      M4(x, fy + 0.014, zF - Math.min(0.5, D * 0.24), 0, -Math.PI / 2), mixHex(PAL.wood.light, PAL.interior.lamp, 0.55));
    if (stone) {
      // a nave: two rows of pew ends and an altar cloth catching the window light
      for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
        roomSlab(base, boxUV(0.16, 0.92, Math.min(1.0, W * 0.3), 1), M4(x + s * (W * 0.28), fy + 0.46, zF - 0.9 - k * Math.min(1.1, D * 0.22)), PAL.wood.dark);
      }
      roomSlab(base, boxUV(Math.min(1.5, W * 0.5), 0.75, 0.5, 1), M4(x, fy + 0.38, zB + 0.45), PAL.cloth.cream);
      roomSlab(base, new THREE.PlaneGeometry(Math.min(1.2, W * 0.4), Math.min(2.0, H * 0.6)), M4(x, fy + H * 0.52, zB + 0.03),
        mixHex(PAL.sky.horizon, PAL.plaster.light, 0.35));
    } else {
      // a rug you can see the edge of, a stool, and the corner of a table
      roomSlab(base, new THREE.PlaneGeometry(Math.min(1.7, W * 0.62), Math.min(1.3, D * 0.42)),
        M4(x, fy + 0.02, zF - Math.min(1.35, D * 0.52), 0, -Math.PI / 2), mixHex(PAL.cloth.red, PAL.interior.dark, 0.32));
      const sx = x + (W > 2.4 ? -W * 0.26 : 0);
      roomSlab(base, new THREE.CylinderGeometry(0.19, 0.21, 0.09, 10), M4(sx, fy + 0.45, zF - Math.min(1.5, D * 0.55)), PAL.wood.mid);
      for (const s of [-1, 1]) roomSlab(base, boxUV(0.06, 0.45, 0.06, 1), M4(sx + s * 0.13, fy + 0.22, zF - Math.min(1.5, D * 0.55)), PAL.wood.dark);
      roomSlab(base, boxUV(Math.min(1.3, W * 0.42), 0.09, 0.62, 1), M4(x + W * 0.24, fy + 0.74, zB + 0.55), PAL.wood.mid);
      for (const s of [-1, 1]) roomSlab(base, boxUV(0.08, 0.72, 0.08, 1), M4(x + W * 0.24 + s * Math.min(0.5, W * 0.15), fy + 0.36, zB + 0.55), PAL.wood.dark);
      // a shuttered window high on the back wall: the one bright thing, so the dark has depth
      roomSlab(base, new THREE.PlaneGeometry(Math.min(0.78, W * 0.3), Math.min(0.78, H * 0.32)),
        M4(x - W * 0.2, fy + Math.min(H - 0.6, 1.45), zB + 0.03), mixHex(PAL.sky.horizon, PAL.plaster.light, 0.35));
      for (const s2 of [-1, 1]) roomSlab(base, new THREE.PlaneGeometry(0.05, Math.min(0.78, H * 0.32)),
        M4(x - W * 0.2 + s2 * Math.min(0.2, W * 0.075), fy + Math.min(H - 0.6, 1.45), zB + 0.04), PAL.wood.dark);
      roomSlab(base, new THREE.PlaneGeometry(0.22, 0.26), M4(x + W * 0.26, fy + Math.min(H - 0.45, 1.78), zB + 0.03), PAL.interior.lamp);
    }
    // the hearth: embers low on the back wall and the warm pool they throw on the boards in front of them
    if (hearth) {
      const hx = x + W * 0.2;
      roomSlab(base, boxUV(Math.min(1.15, W * 0.42), 0.82, 0.22, 1), M4(hx, fy + 0.41, zB + 0.12), mixHex(PAL.stone.dark, PAL.interior.dark, 0.35));
      roomSlab(base, new THREE.PlaneGeometry(Math.min(0.85, W * 0.3), 0.36), M4(hx, fy + 0.22, zB + 0.24),
        mixHex(PAL.interior.lamp, PAL.flower.red, 0.32));
      roomSlab(base, new THREE.PlaneGeometry(Math.min(1.5, W * 0.55), Math.min(1.2, D * 0.45)),
        M4(hx, fy + 0.016, zB + 0.24 + Math.min(0.62, D * 0.24), 0, -Math.PI / 2), mixHex(PAL.interior.dark, PAL.interior.lamp, 0.5));
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // signs: one small atlas, painted as boards are created; each board swings on its bracket
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  const ATLAS = { cols: 4, rows: 4, w: 1024, h: 512 };
  const atlas = () => {
    if (!signAtlas) {
      const c = mkCanvas(ATLAS.w, ATLAS.h), g = ctx2(c);
      g.clearRect(0, 0, ATLAS.w, ATLAS.h);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      signAtlas = { c, g, tex, n: 0, mat: null };
    }
    return signAtlas;
  };

  const drawIcon = (g, name, x, y, s) => {
    const R = (a, b, w, h, r, fill) => { g.beginPath(); g.roundRect(a, b, w, h, r); g.fillStyle = fill; g.fill(); };
    if (name === 'bed') {
      R(x - s * 0.5, y - s * 0.1, s, s * 0.42, s * 0.08, PAL.wood.mid);
      R(x - s * 0.55, y - s * 0.38, s * 0.18, s * 0.6, s * 0.06, PAL.wood.dark);
      R(x - s * 0.34, y - s * 0.22, s * 0.36, s * 0.2, s * 0.07, PAL.cloth.cream);
      R(x + s * 0.0, y - s * 0.14, s * 0.5, s * 0.26, s * 0.07, PAL.cloth.red);
      g.fillStyle = PAL.flower.yellow; g.beginPath(); g.arc(x + s * 0.36, y - s * 0.52, s * 0.16, Math.PI * 0.35, Math.PI * 1.45); g.fill();
    } else if (name === 'bag') {
      g.fillStyle = PAL.cloth.rope; g.beginPath(); g.moveTo(x - s * 0.1, y - s * 0.34);
      g.bezierCurveTo(x - s * 0.55, y - s * 0.1, x - s * 0.5, y + s * 0.42, x, y + s * 0.42);
      g.bezierCurveTo(x + s * 0.5, y + s * 0.42, x + s * 0.55, y - s * 0.1, x + s * 0.1, y - s * 0.34);
      g.closePath(); g.fill();
      g.strokeStyle = PAL.wood.dark; g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(x - s * 0.16, y - s * 0.3); g.lineTo(x + s * 0.16, y - s * 0.3); g.stroke();
      g.fillStyle = PAL.paint.gold; g.beginPath(); g.arc(x + s * 0.28, y - s * 0.34, s * 0.19, 0, TAU); g.fill();
      g.fillStyle = PAL.wood.grain; Font.draw(g, 'G', x + s * 0.28, y - s * 0.28, { size: s * 0.3, align: 'center', baseline: 'middle', fill: PAL.wood.grain, outline: false, shadow: false });
    } else if (name === 'loaf') {
      g.fillStyle = PAL.wood.light; g.beginPath(); g.ellipse(x, y + s * 0.05, s * 0.52, s * 0.32, 0, 0, TAU); g.fill();
      g.fillStyle = PAL.thatch.light; g.beginPath(); g.ellipse(x, y - s * 0.02, s * 0.46, s * 0.24, 0, 0, TAU); g.fill();
      g.strokeStyle = PAL.wood.mid; g.lineWidth = s * 0.07; g.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * s * 0.22 - s * 0.06, y - s * 0.12); g.lineTo(x + i * s * 0.22 + s * 0.06, y + s * 0.08); g.stroke(); }
    } else if (name === 'sword') {
      g.fillStyle = PAL.stone.light; g.beginPath(); g.moveTo(x, y - s * 0.55); g.lineTo(x + s * 0.11, y - s * 0.35); g.lineTo(x + s * 0.08, y + s * 0.2);
      g.lineTo(x - s * 0.08, y + s * 0.2); g.lineTo(x - s * 0.11, y - s * 0.35); g.closePath(); g.fill();
      R(x - s * 0.3, y + s * 0.2, s * 0.6, s * 0.1, s * 0.05, PAL.paint.gold);
      R(x - s * 0.07, y + s * 0.3, s * 0.14, s * 0.26, s * 0.05, PAL.wood.dark);
      g.fillStyle = PAL.paint.gold; g.beginPath(); g.arc(x, y + s * 0.6, s * 0.09, 0, TAU); g.fill();
    } else if (name === 'bell') {
      g.fillStyle = PAL.paint.gold; g.beginPath(); g.moveTo(x - s * 0.36, y + s * 0.26);
      g.bezierCurveTo(x - s * 0.34, y - s * 0.4, x + s * 0.34, y - s * 0.4, x + s * 0.36, y + s * 0.26); g.closePath(); g.fill();
      R(x - s * 0.42, y + s * 0.26, s * 0.84, s * 0.12, s * 0.05, PAL.paint.gold);
      g.fillStyle = PAL.wood.dark; g.beginPath(); g.arc(x, y + s * 0.44, s * 0.08, 0, TAU); g.fill();
    }
  };

  /** Paint one sign cell; returns the cell index. */
  const paintSign = ({ text = '', icon = null, panel = PAL.paint.shutterGreen, ink = PAL.flower.yellow }) => {
    const A = atlas();
    if (A.n >= ATLAS.cols * ATLAS.rows) return 0;
    const i = A.n++, cw = ATLAS.w / ATLAS.cols, ch = ATLAS.h / ATLAS.rows;
    const x = (i % ATLAS.cols) * cw, y = Math.floor(i / ATLAS.cols) * ch, g = A.g;
    g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
    // the board: planks, then a painted panel with a gold keyline
    const wood = Tex.wood().image;
    g.save(); g.translate(x + cw / 2, y + ch / 2); g.rotate(Math.PI / 2); g.drawImage(wood, -ch / 2, -cw / 2, ch, cw * 1.2); g.restore();
    g.fillStyle = css(PAL.wood.mid, 0.34); g.fillRect(x, y, cw, ch);
    g.strokeStyle = css(PAL.wood.grain, 0.9); g.lineWidth = 9; g.strokeRect(x + 5, y + 5, cw - 10, ch - 10);
    g.fillStyle = PAL.paint.iron; g.fillRect(x + 1, y + 1, 10, 10);                     // the chain patch (UV corner)
    const px = x + 16, py = y + 16, pw = cw - 32, ph = ch - 32;
    g.beginPath(); g.roundRect(px, py, pw, ph, 14); g.fillStyle = panel; g.fill();
    g.lineWidth = 4; g.strokeStyle = css(PAL.paint.gold, 0.85); g.beginPath(); g.roundRect(px + 7, py + 7, pw - 14, ph - 14, 10); g.stroke();
    const grad = g.createLinearGradient(0, py, 0, py + ph);
    grad.addColorStop(0, css(PAL.mask.on, 0.16)); grad.addColorStop(0.5, css(PAL.mask.on, 0.02)); grad.addColorStop(1, css(PAL.shadow.contact, 0.22));
    g.fillStyle = grad; g.beginPath(); g.roundRect(px, py, pw, ph, 14); g.fill();
    let tx = px + pw / 2;
    if (icon) { drawIcon(g, icon, px + ph * 0.52, py + ph / 2, ph * 0.62); tx = px + ph * 0.52 + (pw - ph * 0.52) / 2; }
    if (text) {
      let size = ph * 0.52;
      const room = icon ? pw - ph * 0.95 : pw - 30;
      while (Font.measure(text, size).width > room && size > 12) size -= 2;
      Font.draw(g, text, tx, py + ph / 2 + size * 0.04, { size, align: 'center', baseline: 'middle', fill: ink, outline: PAL.wood.grain, outlineWidth: size * 0.15, shadow: false });
    }
    g.restore();
    A.tex.needsUpdate = true;
    return i;
  };

  const boardGeometry = (cell, w, h) => {
    const g = new THREE.BoxGeometry(w, h, 0.07);
    const cw = 1 / ATLAS.cols, chh = 1 / ATLAS.rows;
    const u0 = (cell % ATLAS.cols) * cw, v0 = 1 - (Math.floor(cell / ATLAS.cols) + 1) * chh;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4);
      if (face === 4 || face === 5) uv.setXY(i, u0 + (0.03 + uv.getX(i) * 0.94) * cw, v0 + (0.05 + uv.getY(i) * 0.9) * chh);
      else uv.setXY(i, u0 + 0.006 * cw, v0 + (1 - 0.006) * chh);                       // the iron patch: edges read as metal
    }
    return g;
  };

  /**
   * A hanging shop sign: an iron bracket out of the wall, a cross-bar, two chains and a painted board that sways.
   * o = {x, z, y (world mount height), rot (the wall's yaw; the board faces the wall's +z), icon, text, panel, ink,
   *      w, h, arm, drop}
   */
  kit.hangingSign = (o) => {
    const A = atlas();
    const w = o.w ?? 1.05, h = o.h ?? 0.66, arm = o.arm ?? 0.78, drop = o.drop ?? 0.34;
    const base = M4(o.x, o.y, o.z, o.rot || 0);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('paint', boxUV(0.07, 0.07, arm, 1), M4(0, 0, arm / 2), PAL.paint.iron);                     // the arm
    add('paint', boxUV(w + 0.16, 0.07, 0.07, 1), M4(0, 0, arm), PAL.paint.iron);                    // the cross-bar
    add('paint', boxUV(0.05, 0.05, Math.hypot(arm * 0.7, 0.42), 1), M4(0, -0.24, arm * 0.36, 0, 0.85), PAL.paint.iron);   // the strut
    for (const s of [-1, 1]) add('paint', new THREE.SphereGeometry(0.05, 8, 6), M4(s * (w / 2 + 0.08), 0, arm), PAL.paint.iron);
    const cell = paintSign({ text: o.text, icon: o.icon, panel: o.panel, ink: o.ink });
    const pivot = new THREE.Group();
    pivot.position.set(o.x, o.y, o.z); pivot.rotation.y = o.rot || 0;
    const local = new THREE.Group(); local.position.set(0, 0, arm); pivot.add(local);
    const parts = [prep(boardGeometry(cell, w, h), PAL.mask.on)];
    parts[0].applyMatrix4(M4(0, -drop - h / 2, 0));
    for (const s of [-1, 1]) {
      const ch = prep(new THREE.CylinderGeometry(0.022, 0.022, drop, 6), PAL.mask.on);
      ch.applyMatrix4(M4(s * (w / 2 - 0.04), -drop / 2, 0));
      parts.push(ch);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts),
      CUR ? makeToon({ map: A.tex, vertexColors: true }, {}) : (A.mat || (A.mat = makeToon({ map: A.tex, vertexColors: true }, {}, [See.patch]))));
    mesh.name = 'sign-' + (o.text || o.icon || 'board'); mesh.castShadow = true; mesh.receiveShadow = true;
    if (CUR) mesh.userData.camIgnore = true;
    local.add(mesh);
    scene.add(pivot);
    const ph = hashJ(SIGNS.length, 7) * TAU;
    SIGNS.push({ pivot: local, ph });
    BOARDS.push(mesh);
    ownMesh(mesh);                     // a shop sign ghosts with its shop (it used to stay 100% opaque in front of it)
    return mesh;
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // awnings, bunting and other cloth
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  const quad = (a, b, c, d, u0, u1, v0, v1) => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z]);
    const uv = new Float32Array([u0, v1, u1, v1, u1, v0, u0, v1, u1, v0, u0, v0]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };

  /** A striped, scallop-edged shop awning over a window or a whole front. o = {base|x,z,rot, y, z(face), w, depth, drop, color, stripe, valance} */
  kit.awning = (o) => {
    const base = o.base || M4(o.x, o.y0 ?? heightAt(o.x, o.z), o.z, o.rot || 0);
    const y = o.y, zf = o.zFace ?? 0, w = o.w ?? 2.6, depth = o.depth ?? 1.05, drop = o.drop ?? 0.5, val = o.valance ?? 0.26;
    const lx = o.x0 ?? 0;
    const geos = clothGeos(o.color || PAL.cloth.red, o.stripe || PAL.cloth.cream, true, 128);
    const P = (x, yy, z) => new THREE.Vector3(x, yy, z);
    const uRep = Math.max(1, w / 1.7);
    const slope = quad(P(lx - w / 2, y, zf), P(lx + w / 2, y, zf), P(lx + w / 2, y - drop, zf + depth), P(lx - w / 2, y - drop, zf + depth), 0, uRep, 0.3, 1);
    slope.applyMatrix4(base);
    geos.push(slope);
    const valance = quad(P(lx - w / 2, y - drop, zf + depth), P(lx + w / 2, y - drop, zf + depth), P(lx + w / 2, y - drop - val, zf + depth), P(lx - w / 2, y - drop - val, zf + depth), 0, uRep, 0.0, 0.46);
    valance.applyMatrix4(base);
    geos.push(valance);
    for (const s of [-1, 1]) {
      const bx = lx + s * (w / 2 - 0.12);
      addTo('paint', boxUV(0.05, 0.05, depth, 1), base.clone().multiply(M4(bx, y - drop / 2 - 0.02, zf + depth / 2, 0, Math.atan2(drop, depth))), PAL.paint.iron);
    }
    return { depth, drop };
  };

  /**
   * Harvest bunting: little triangular flags on a sagging rope between anchor points (world [x, y, z]).
   * The flags hang from the rope and sway (negative wind), so the green is never quite still.
   */
  kit.bunting = (points, { colors = [PAL.cloth.red, PAL.cloth.cream, PAL.cloth.blue, PAL.cloth.mustard, PAL.cloth.green], sag = 1.0, step = 0.52, seed = 3 } = {}) => {
    const r = mulberry(seed);
    let ci = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const A = new THREE.Vector3(...points[i]), B = new THREE.Vector3(...points[i + 1]);
      const span = A.distanceTo(B), droop = sag * Math.min(1.6, span * 0.1);
      const mid = A.clone().lerp(B, 0.5); mid.y -= droop;
      const curve = new THREE.CatmullRomCurve3([A, mid, B]);
      addTo('paint', new THREE.TubeGeometry(curve, Math.max(8, Math.round(span * 2)), 0.02, 5), null, PAL.cloth.rope);
      const n = Math.max(3, Math.round(span / step));
      for (let k = 1; k < n; k++) {
        const t = k / n, p = curve.getPoint(t), colour = colors[ci++ % colors.length];
        const w = 0.26 + r() * 0.05, h = 0.34 + r() * 0.06;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, -h, 0.02], 3));
        g.computeVertexNormals();
        const geo = prep(g, colour);
        geo.applyMatrix4(M4(p.x, p.y - 0.02, p.z, Math.atan2(B.x - A.x, B.z - A.z) + Math.PI / 2, 0, (r() - 0.5) * 0.25));
        FLAGS.push(geo);
      }
    }
  };
  const FLAGS = [];

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // the house: cottages, the inn, the shop, the bakery, barns — one builder, many presets
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  /** The sill under a window: a board, then flower pots (or, at the bakery, loaves cooling). `a` is window-local. */
  const windowSill = (a, kind, seed) => {
    const r = mulberry(seed);
    if (kind === 'none') return;
    a('wood', boxUV(1.0, 0.2, 0.3, 0.8), M4(0, -0.55, 0.16), PAL.wood.light);
    if (kind === 'bread') {
      for (let k = 0; k < 3; k++) {
        const g = new THREE.SphereGeometry(0.12, 9, 7); g.scale(1.5, 0.8, 0.9);
        a('paint', g, M4(-0.3 + k * 0.3, -0.42, 0.17 + (r() - 0.5) * 0.04, r() * 0.4), k === 1 ? PAL.thatch.light : PAL.wood.light);
      }
      return;
    }
    for (let k = 0; k < 4; k++) a('paint', new THREE.IcosahedronGeometry(0.1, 0), M4(-0.33 + k * 0.22, -0.4 + r() * 0.05, 0.16 + (r() - 0.5) * 0.12), [PAL.flower.pink, PAL.flower.yellow, PAL.flower.white, PAL.flower.red][r() * 4 | 0]);
    for (let k = 0; k < 2; k++) a('paint', new THREE.IcosahedronGeometry(0.12, 0), M4(-0.24 + k * 0.48, -0.46, 0.2), PAL.foliage.mid);
  };

  /**
   * A half-timbered village house. The original signature (meadow.js, demos/P07.html) is unchanged; everything
   * new is opt-in. See the file header for the full option list.
   */
  kit.cottage = (o) => {
    const B = beginBuilding(o, o.kind || 'cottage');
    const { W, D, H } = o, P = o.plinth ?? 0.5;
    const rot = o.rot || 0;
    const y = o.y ?? padY(o, W, D);
    const base = M4(o.x, y, o.z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const wallKind = o.walls || 'plaster';
    const wallBucket = wallKind === 'stone' ? 'stone' : wallKind === 'planks' ? 'wood' : 'plaster';
    const texName = wallBucket === 'wood' ? 'wood' : wallBucket;
    const opens = o.opens ? (o.opens === true ? {} : o.opens) : null;
    const dx = o.doorX || 0;
    const doorW = o.doorW ?? (o.doubleDoor ? 2.1 : 1.0);
    const doorH = o.doorH ?? (o.doubleDoor ? 2.3 : 1.86);
    const holeW = doorW + 0.06, holeH = doorH + 0.06;
    const storeys = o.storeys === 2 ? 2 : 1;
    const jetty = storeys === 2 ? (o.jetty ?? 0.32) : 0;
    const H2 = o.H2 ?? 2.05;

    // ── plinth ──
    add('stone', boxUV(W + 0.2, P + 0.1, D + 0.2, Tex.worldSize('stone')), M4(0, (P + 0.1) / 2 - 0.05, 0));

    // ── walls ──
    const wallTop = C3(o.wallTint || PAL.mask.on);
    const wallLow = C3(wallKind === 'stone' ? mixHex(o.wallTint || PAL.mask.on, PAL.stone.mid, 0.5)
      : wallKind === 'planks' ? mixHex(o.wallTint || PAL.mask.on, PAL.wood.dark, 0.35) : PAL.plaster.grime);
    const slab = (w, h, d, lx, ly, lz, y0) => {
      const g = addTo(wallBucket, boxUV(w, h, d, Tex.worldSize(texName), [Math.max(2, Math.round(w)), 4, Math.max(1, Math.round(d))]), base.clone().multiply(M4(lx, ly, lz)));
      const p = g.attributes.position, c = g.attributes.color, t = new THREE.Color();
      for (let i = 0; i < p.count; i++) { t.copy(wallLow).lerp(wallTop, smooth(0, wallKind === 'plaster' ? 1.0 : 1.5, p.getY(i) - y - y0)); c.setXYZ(i, t.r, t.g, t.b); }
      return g;
    };
    if (!opens) {
      slab(W, H, D, 0, P + H / 2, 0, P);
    } else {
      const T = WALL_T, hl = dx - holeW / 2, hr = dx + holeW / 2;
      slab(W, H, T, 0, P + H / 2, -D / 2 + T / 2, P);
      for (const sx of [-1, 1]) slab(T, H, D - 2 * T, sx * (W / 2 - T / 2), P + H / 2, 0, P);
      if (hl > -W / 2 + 0.02) slab(hl + W / 2, H, T, (-W / 2 + hl) / 2, P + H / 2, D / 2 - T / 2, P);
      if (hr < W / 2 - 0.02) slab(W / 2 - hr, H, T, (hr + W / 2) / 2, P + H / 2, D / 2 - T / 2, P);
      if (H - holeH > 0.05) slab(holeW, H - holeH, T, dx, P + holeH + (H - holeH) / 2, D / 2 - T / 2, P);
      // the floorboards clear the highest ground under the house, so the hillside never grows into the room
      const floorY = Math.max(P + 0.09, padTop(o, W, D) - y + 0.1);
      interiorRoom(base, { x: dx, zFace: D / 2, T, y0: P, w: holeW, h: holeH, roomW: W - 2 * T - 0.06,
        depth: D - 2 * T - 0.06, floorY, top: P + H - 0.12, hearth: true });
      // the reveal: the doorway has real thickness — lined jambs and a head, then an oak threshold
      for (const s of [-1, 1]) add('wood', boxUV(0.07, holeH, T + 0.02, 1), M4(dx + s * (holeW / 2 - 0.035), P + holeH / 2, D / 2 - T / 2), PAL.wood.dark);
      add('wood', boxUV(holeW, 0.07, T + 0.02, 1), M4(dx, P + holeH - 0.035, D / 2 - T / 2), PAL.wood.dark);
      add('wood', boxUV(holeW + 0.1, 0.09, T + 0.16, 1), M4(dx, P + 0.045, D / 2 - T / 2), PAL.wood.dark);
    }
    // timber frame: corner posts, wall plate, sill beam
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood', boxUV(0.22, H, 0.22, 1.2), M4(sx * W / 2, P + H / 2, sz * D / 2), beam);
    for (const sz of [-1, 1]) add('wood', boxUV(W + 0.14, 0.22, 0.24, 1.2), M4(0, P + H - 0.05, sz * D / 2), beam);
    for (const sx of [-1, 1]) add('wood', boxUV(0.24, 0.22, D + 0.14, 1.2), M4(sx * W / 2, P + H - 0.05, 0), beam);
    for (const sz of [-1, 1]) add('wood', boxUV(W + 0.1, 0.16, 0.22, 1.2), M4(0, P + 0.08, sz * D / 2), beam);
    if (o.braces !== false) for (const s of [-1, 1]) {
      const bx = dx + s * 1.3;
      if (Math.abs(bx) < W / 2 - 0.3 && !(o.frontWindows || []).some(wx => Math.abs(wx - bx) < 0.9)) add('wood', boxUV(0.16, 1.6, 0.14, 1.2), M4(bx, P + H * 0.5, D / 2 + 0.02, 0, 0, s * 0.62), beam);
    }

    // ── the door ──
    let door = null, doorway = null;
    if (opens) {
      const jw = 0.15;
      for (const s of [-1, 1]) add('wood', boxUV(jw, holeH + jw, 0.22, 1.2), M4(dx + s * (holeW / 2 + jw / 2 - 0.01), P + (holeH + jw) / 2, D / 2 + 0.01), beam);
      add('wood', boxUV(holeW + 2 * jw + 0.1, 0.22, 0.26, 1.2), M4(dx, P + holeH + 0.1, D / 2 + 0.02), beam);
      door = registerDoor({ id: opens.id || o.id, base, style: o.doorStyle || 'plank', color: o.doorColor || PAL.paint.doorRed,
        x: dx, y0: P, zFace: D / 2, w: doorW, h: doorH, double: !!o.doubleDoor, reach: opens.reach ?? 3.1 });
      doorway = { x: door.x, z: door.z };
    } else {
      add('wood', boxUV(1.14, 1.9, 0.16, 1.2), M4(dx, P + 0.95, D / 2 + 0.02), beam);
      add('wood', boxUV(0.88, 1.74, 0.12, 1.0), M4(dx, P + 0.87, D / 2 + 0.07), o.doorColor || PAL.paint.doorRed);
      add('paint', new THREE.SphereGeometry(0.06, 8, 6), M4(dx + 0.3, P + 0.9, D / 2 + 0.15), PAL.paint.iron);
    }
    // the step(s)
    if (o.steps === false) { /* none */ }
    else if (o.steps === 2 || P > 0.55) {
      add('stone', boxUV(doorW + 0.7, 0.24, 0.85, 1.2), M4(dx, 0.12, D / 2 + 0.62));
      add('stone', boxUV(doorW + 0.35, 0.24, 0.5, 1.2), M4(dx, 0.34, D / 2 + 0.35));
    } else {
      add('stone', boxUV(1.4, 0.2, 0.7, 1.2), M4(dx, 0.1, D / 2 + 0.45));
    }

    // ── windows ──
    const win = (lx, ly, face, zOff = 0) => {
      const fm = face === 'front' ? M4(lx, ly, D / 2 + zOff) : face === 'back' ? M4(lx, ly, -D / 2 - zOff, Math.PI)
        : face === 'left' ? M4(-W / 2, ly, lx, -Math.PI / 2) : M4(W / 2, ly, lx, Math.PI / 2);
      const a = (b, g, m, c) => add(b, g, fm.clone().multiply(m), c);
      a('wood', boxUV(0.96, 0.9, 0.14, 1.2), M4(0, 0, 0.04), beam);
      a('paint', new THREE.BoxGeometry(0.72, 0.66, 0.1), M4(0, 0, 0.08), PAL.paint.glass);
      a('wood', boxUV(0.07, 0.66, 0.08, 1), M4(0, 0, 0.14), beam); a('wood', boxUV(0.72, 0.07, 0.08, 1), M4(0, 0, 0.14), beam);
      for (const s of [-1, 1]) a('paint', new THREE.BoxGeometry(0.4, 0.8, 0.06), M4(s * 0.7, 0, 0.1, s * 0.25), o.shutter || PAL.paint.shutterGreen);
      windowSill(a, o.sill || 'flowers', Math.abs(lx * 100 + ly * 7 + o.x * 13 + o.z * 3) | 0);
    };
    for (const wx of (o.frontWindows || [])) win(wx, P + 1.25, 'front');
    for (const wx of (o.sideWindows || [])) { win(wx, P + 1.25, 'left'); win(wx, P + 1.25, 'right'); }
    if (o.backWindow !== false) win(0, P + 1.25, 'back');

    // ── the upper storey (the inn): a jettied, timber-framed first floor ──
    let topY = P + H;
    if (storeys === 2) {
      add('wood', boxUV(W + 0.24, 0.26, D + 2 * jetty + 0.24, 1.2), M4(0, P + H + 0.13, 0), beam);      // the jetty joist band
      for (let k = -2; k <= 2; k++) add('wood', boxUV(0.16, 0.2, 0.3, 1), M4(k * (W / 5), P + H + 0.13, D / 2 + jetty + 0.12), PAL.wood.mid);
      const y0 = P + H + 0.26;
      const g = addTo('plaster', boxUV(W, H2, D + 2 * jetty, Tex.worldSize('plaster'), [3, 3, 2]), base.clone().multiply(M4(0, y0 + H2 / 2, 0)));
      { const p = g.attributes.position, c = g.attributes.color, t = new THREE.Color(), lo = C3(mixHex(PAL.mask.on, PAL.plaster.grime, 0.35));
        for (let i = 0; i < p.count; i++) { t.copy(lo).lerp(wallTop, smooth(0, 0.7, p.getY(i) - y - y0)); c.setXYZ(i, t.r, t.g, t.b); } }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood', boxUV(0.2, H2, 0.2, 1.2), M4(sx * W / 2, y0 + H2 / 2, sz * (D / 2 + jetty)), beam);
      for (const sz of [-1, 1]) add('wood', boxUV(W + 0.12, 0.2, 0.22, 1.2), M4(0, y0 + H2 - 0.05, sz * (D / 2 + jetty)), beam);
      for (const sx of [-1, 1]) add('wood', boxUV(0.22, 0.2, D + 2 * jetty + 0.12, 1.2), M4(sx * W / 2, y0 + H2 - 0.05, 0), beam);
      const studs = o.upperWindows || [];
      for (let k = -3; k <= 3; k++) {
        const sxp = k * (W / 7);
        if (studs.some(wx => Math.abs(wx - sxp) < 0.75)) continue;
        for (const sz of [-1, 1]) add('wood', boxUV(0.15, H2 - 0.1, 0.14, 1.2), M4(sxp, y0 + H2 / 2, sz * (D / 2 + jetty + 0.01)), beam);
      }
      for (const s of [-1, 1]) for (const sz of [-1, 1]) add('wood', boxUV(0.14, 1.3, 0.13, 1.2), M4(s * (W / 2 - 0.55), y0 + H2 * 0.45, sz * (D / 2 + jetty + 0.01), 0, 0, s * 0.62), beam);
      for (const wx of studs) win(wx, y0 + H2 * 0.55, 'front', jetty);
      topY = y0 + H2;
    }

    // ── roof ──
    const roof = o.roof || 'tile';
    const ridgeY = kit.gableRoof(base, W, D + 2 * jetty, topY, o.pitch ?? 0.62, o.ovx ?? 0.45, o.ovz ?? 0.6,
      roof === 'thatch' ? 0.34 : 0.16, roof, o.gable || 'plaster', o.gableColor,
      { barge: o.barge && roof !== 'thatch', bargeColor: o.bargeColor });

    // ── chimneys (with pots) ──
    const chimneyTops = [];
    const chimneyXs = o.chimneys || (o.chimney ? [o.chimneyX ?? W * 0.3] : []);
    for (const cxl of chimneyXs) {
      const kind = o.chimney === 'stone' ? 'stone' : 'brick', czl = o.chimneyZ ?? -D * 0.2;
      add(kind, boxUV(0.8, 2.3 + (ridgeY - (P + H)) * 0.2, 0.8, Tex.worldSize(kind)), M4(cxl, ridgeY - 0.45, czl));
      add(kind, boxUV(0.96, 0.18, 0.96, Tex.worldSize(kind)), M4(cxl, ridgeY + 0.74, czl));
      for (const px of (Math.abs(cxl) > 0.1 ? [0] : [0])) {
        const pot = new THREE.CylinderGeometry(0.15, 0.17, 0.32, 10); scaleUV(pot, 0.5);
        add('tile', pot, M4(cxl + px, ridgeY + 0.98, czl), PAL.tile.mid);
      }
      chimneyTops.push(new THREE.Vector3(cxl, ridgeY + 1.16, czl).applyMatrix4(base));
    }

    // ── extras: awning, sign, oven, roses, lamp ──
    if (o.awning) {
      const aw = o.awning;
      const overs = aw.over || (o.frontWindows || []);
      if (aw.full) kit.awning({ base, x0: aw.x ?? 0, y: P + H - 0.12, zFace: D / 2 + 0.02, w: aw.w ?? (W - 0.5), depth: aw.depth ?? 1.15, drop: aw.drop ?? 0.5, color: aw.color, stripe: aw.stripe });
      else for (const wx of overs) kit.awning({ base, x0: wx, y: P + 1.92, zFace: D / 2 + 0.02, w: aw.w ?? 1.5, depth: aw.depth ?? 0.85, drop: aw.drop ?? 0.38, color: aw.color, stripe: aw.stripe });
    }
    if (o.sign) {
      const side = o.sign.side ?? 1;
      const p = toWorld(o, side * (W / 2 - 0.45), D / 2 + 0.05);
      kit.hangingSign({ x: p.x, z: p.z, y: y + P + H - 0.28, rot, icon: o.sign.icon, text: o.sign.text, panel: o.sign.panel, ink: o.sign.ink, w: o.sign.w, h: o.sign.h });
    }
    if (o.oven) {
      const s = o.oven === 'left' ? -1 : 1, ox = s * (W / 2 + 0.85);
      add('brick', boxUV(1.7, 0.7, 1.7, Tex.worldSize('brick')), M4(ox, 0.35, -D * 0.05));
      const dome = new THREE.SphereGeometry(0.82, 14, 9, 0, TAU, 0, Math.PI / 2); scaleUV(dome, 1.4);
      add('brick', dome, M4(ox, 0.7, -D * 0.05));
      add('paint', new THREE.CircleGeometry(0.3, 14, 0, Math.PI), M4(ox, 0.78, -D * 0.05 + 0.84), PAL.cave.glow);
      add('brick', new THREE.TorusGeometry(0.33, 0.07, 6, 16, Math.PI), M4(ox, 0.78, -D * 0.05 + 0.8));
      add('brick', boxUV(0.4, 0.9, 0.4, Tex.worldSize('brick')), M4(ox, 1.6, -D * 0.05 - 0.3));
      add('wood', boxUV(0.12, 0.1, 1.6, 1), M4(ox + 0.5, 1.0, -D * 0.05 + 0.4, 0, 0, 0.5), PAL.wood.light);      // the peel
      ao.disc(toWorld(o, ox, -D * 0.05).x, toWorld(o, ox, -D * 0.05).z, 1.5, 0.7);
      kit.footBox(toWorld(o, ox, -D * 0.05).x, toWorld(o, ox, -D * 0.05).z, 2, 2, rot);
    }
    for (const rx of (o.roses || [])) {
      const r = mulberry(Math.abs((o.x * 31 + o.z * 17 + rx * 7) | 0) + 3);
      for (let k = 0; k < 26; k++) {
        const t = k / 25, yy = P + 0.2 + t * (H - 0.2), sx2 = rx + Math.sin(t * 9 + r()) * 0.3;
        add('paint', new THREE.IcosahedronGeometry(0.13 + r() * 0.05, 0), M4(sx2, yy, D / 2 + 0.12 + (r() - 0.5) * 0.06), PAL.foliage.mid);
        if (k % 3 === 0) add('paint', new THREE.IcosahedronGeometry(0.085, 0), M4(sx2 + (r() - 0.5) * 0.3, yy + 0.05, D / 2 + 0.18), r() < 0.5 ? PAL.flower.pink : PAL.flower.red);
      }
    }
    if (o.lamp) {
      const s = o.lampSide ?? (dx > 0 ? -1 : 1);
      const lx = dx + s * (doorW / 2 + 0.42);
      add('paint', boxUV(0.05, 0.05, 0.34, 1), M4(lx, P + 1.95, D / 2 + 0.2), PAL.paint.iron);
      add('paint', new THREE.CylinderGeometry(0.13, 0.16, 0.3, 8), M4(lx, P + 1.78, D / 2 + 0.36), PAL.paint.iron);
      add('paint', new THREE.SphereGeometry(0.12, 10, 8), M4(lx, P + 1.74, D / 2 + 0.36), PAL.interior.lamp);
      add('paint', new THREE.ConeGeometry(0.17, 0.12, 8), M4(lx, P + 1.96, D / 2 + 0.36), PAL.paint.iron);
    }

    ao.box(o.x, o.z, W + 0.2, D + 2 * jetty + 0.2, rot, 1.3, 0.75);
    kit.footBox(o.x, o.z, W + 0.5, D + 2 * jetty + 0.5, rot);
    const doorOut = new THREE.Vector3(dx, 0, D / 2 + 0.9).applyMatrix4(base);
    kit.footBox(doorOut.x, doorOut.z, 1.2, 1.2, rot, 0);
    const rec = { id: o.id || null, kind: o.kind || 'cottage', x: o.x, z: o.z, rot, W, D: D + 2 * jetty, y,
      ridgeY: y + ridgeY, chimneyTop: chimneyTops[0] || null, chimneyTops,
      door: { x: doorOut.x, z: doorOut.z }, doorway, front: door ? door.front : { x: doorOut.x, z: doorOut.z },
      doorId: door ? door.id : null, doorYaw: door ? door.yaw : rot };
    (kit.buildings || (kit.buildings = [])).push(rec);
    endBuilding(B);
    return rec;
  };

  /** The village inn: two storeys, a jettied upper floor, a tile roof, two chimneys and a sign that swings. */
  kit.inn = (o) => kit.cottage(Object.assign({
    kind: 'inn', W: 8.2, D: 5.4, H: 2.5, H2: 2.1, storeys: 2, roof: 'tile', pitch: 0.58, barge: true,
    doorX: 0, doorW: 1.15, doorH: 2.05, doorColor: PAL.paint.doorRed, opens: true, steps: 2,
    frontWindows: [-2.6, 2.6], upperWindows: [-2.7, 0, 2.7], sideWindows: [0], shutter: PAL.paint.shutterGreen,
    chimney: 'brick', chimneys: [-3.1, 3.1], chimneyZ: -1.1, lamp: true,
    sign: { icon: 'bed', text: 'INN', panel: PAL.paint.shutterGreen, side: 1 },
  }, o));

  /** The item and weapon shop: striped awnings over the windows, a counter of goods, a coin-bag sign. */
  kit.shop = (o) => {
    const opts = Object.assign({
      kind: 'shop', W: 6.4, D: 4.5, H: 2.45, roof: 'tile', pitch: 0.6, barge: true,
      doorX: -1.7, doorW: 1.05, opens: true, frontWindows: [1.3], sideWindows: [0], shutter: PAL.paint.shutterBlue,
      chimney: 'brick', chimneyX: -2.0, awning: { over: [1.3], color: PAL.cloth.red, stripe: PAL.cloth.cream, w: 2.5, depth: 1.0, drop: 0.46 },
      sign: { icon: 'bag', text: 'SHOP', panel: PAL.paint.doorRed, side: 1 },
    }, o);
    const B = beginBuilding(opts, 'shop');
    const rec = kit.cottage(opts);
    // a counter under the awning with goods on it, and a sword and shield on the wall
    const base = M4(rec.x, rec.y, rec.z, rec.rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const W = (o && o.W) || 6.4, D = (o && o.D) || 4.5, P = 0.5;
    add('wood', boxUV(2.5, 0.12, 0.85, 1), M4(1.3, P + 0.82, D / 2 + 0.5), PAL.wood.light);
    for (const s of [-1, 1]) add('wood', boxUV(0.12, 0.8, 0.12, 1), M4(1.3 + s * 1.1, P + 0.4, D / 2 + 0.8), PAL.wood.mid);
    const r = mulberry(Math.abs((rec.x * 13 + rec.z * 7) | 0) + 5);
    for (let k = 0; k < 7; k++) {
      const gx = 0.25 + k * 0.32;
      add('paint', new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), M4(gx, P + 0.98, D / 2 + 0.4 + (r() - 0.5) * 0.2), [PAL.tile.mid, PAL.stone.mid, PAL.thatch.light][k % 3]);
    }
    for (let k = 0; k < 4; k++) add('paint', new THREE.IcosahedronGeometry(0.1, 0), M4(0.5 + k * 0.5, P + 0.96, D / 2 + 0.72), [PAL.flower.red, PAL.foliage.sun, PAL.flower.yellow][k % 3]);
    // sword and round shield hung beside the door
    add('paint', boxUV(0.1, 0.9, 0.05, 1), M4(-3.0, P + 1.5, D / 2 + 0.08), PAL.stone.light);
    add('paint', boxUV(0.34, 0.09, 0.06, 1), M4(-3.0, P + 1.08, D / 2 + 0.09), PAL.paint.gold);
    add('paint', new THREE.CylinderGeometry(0.34, 0.34, 0.08, 14), M4(-2.45, P + 1.4, D / 2 + 0.1, 0, Math.PI / 2), PAL.wood.mid);
    add('paint', new THREE.SphereGeometry(0.09, 9, 7), M4(-2.45, P + 1.4, D / 2 + 0.16), PAL.paint.iron);
    void W;
    endBuilding(B);
    return rec;
  };

  /** The bakery: a brick oven on the side, bread on the sill, a loaf sign, flour sacks by the door. */
  kit.bakery = (o) => kit.cottage(Object.assign({
    kind: 'bakery', W: 5.6, D: 4.3, H: 2.35, roof: 'thatch', pitch: 0.74,
    doorX: -1.3, opens: true, frontWindows: [1.2], sideWindows: [], shutter: PAL.paint.shutterBlue,
    chimney: 'brick', chimneyX: 1.5, sill: 'bread', oven: 'right', braces: false,
    sign: { icon: 'loaf', text: 'BAKER', panel: PAL.paint.shutterBlue, side: -1 },
  }, o));

  /** A timber barn: plank walls, big braced double doors, a hay-loft door, hay and a cart wheel outside. */
  kit.barn = (o) => {
    const opts = Object.assign({
      kind: 'barn', W: 6.6, D: 5.2, H: 2.9, roof: 'thatch', pitch: 0.8, walls: 'planks', wallTint: PAL.wood.light,
      doorX: 0, doorW: 2.3, doorH: 2.5, doorStyle: 'barn', doubleDoor: true, doorColor: PAL.wood.mid, opens: true,
      frontWindows: [], sideWindows: [], backWindow: false, braces: false, chimney: null, steps: false,
      gable: 'wood', gableColor: PAL.wood.weathered, plinth: 0.34,
    }, o);
    const B = beginBuilding(opts, 'barn');
    const rec = kit.cottage(opts);
    const base = M4(rec.x, rec.y, rec.z, rec.rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const D = rec.D, W = rec.W, P = 0.34, H = (o && o.H) || 2.9;
    // the hay-loft door, open, with hay spilling out of it
    add('wood', boxUV(1.3, 1.2, 0.14, 1.2), M4(0, P + H + 0.5, D / 2 + 0.02), PAL.wood.dark);
    add('wood', boxUV(1.1, 1.0, 0.1, 1), M4(-0.95, P + H + 0.5, D / 2 + 0.16, 0.9), PAL.wood.mid);
    const r = mulberry(Math.abs((rec.x * 7 + rec.z * 3) | 0) + 11);
    for (let k = 0; k < 9; k++) add('thatch', new THREE.IcosahedronGeometry(0.16 + r() * 0.07, 0), M4((r() - 0.5) * 1.0, P + H + 0.16 + r() * 0.5, D / 2 + 0.1 + r() * 0.2));
    add('wood', boxUV(0.16, 0.16, 1.1, 1.2), M4(0, P + H + 1.25, D / 2 + 0.5), beam);                  // the hoist beam
    add('paint', new THREE.TorusGeometry(0.1, 0.025, 5, 12), M4(0, P + H + 1.05, D / 2 + 0.95, 0, Math.PI / 2), PAL.paint.iron);
    void W;
    endBuilding(B);
    return rec;
  };

  /**
   * The watermill: a stone ground floor, a timber-framed upper floor, and a wheel that turns in the Beck.
   * o.waterY = the water level, o.wheelSide = +1 (local +x) or -1.
   */
  kit.mill = (o) => {
    const wheelSide = o.wheelSide ?? 1;
    const opts = Object.assign({
      kind: 'mill', W: 4.8, D: 4.8, H: 2.7, H2: 2.0, storeys: 2, jetty: 0.16, roof: 'tile', pitch: 0.72, barge: true,
      walls: 'stone', doorX: 0, doorW: 1.05, opens: true, frontWindows: [], sideWindows: [], backWindow: false,
      upperWindows: [-1.2, 1.2], shutter: PAL.paint.shutterGreen, chimney: null, braces: false, steps: 2,
    }, o);
    const B = beginBuilding(opts, 'mill');
    const rec = kit.cottage(opts);
    const base = M4(rec.x, rec.y, rec.z, rec.rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const W = 4.8, R = o.wheelR ?? 1.9, waterY = o.waterY ?? (rec.y - 0.4);
    const axleLocalY = (waterY + R - 0.5) - rec.y;
    const axleX = wheelSide * (W / 2 + 0.62);
    // axle and its bearing
    add('wood', boxUV(0.9, 0.24, 0.24, 1.2), M4(wheelSide * (W / 2 + 0.28), axleLocalY, 0, 0, 0, 0), beam);
    add('stone', boxUV(0.6, 0.8, 0.7, Tex.worldSize('stone')), M4(wheelSide * (W / 2 + 0.1), axleLocalY - 0.55, 0));
    // the wheel itself: rims, spokes, paddles — one mesh, turning
    const parts = [], put = (g, m, c) => { const q = prep(g, c); if (m) q.applyMatrix4(m); parts.push(q); };
    const width = 0.78;
    for (const s of [-1, 1]) {
      put(new THREE.TorusGeometry(R, 0.085, 6, 30), M4(s * width / 2, 0, 0, Math.PI / 2), PAL.wood.mid);
      put(new THREE.TorusGeometry(R * 0.55, 0.07, 6, 24), M4(s * width / 2, 0, 0, Math.PI / 2), PAL.wood.weathered);
      for (let k = 0; k < 8; k++) put(boxUV(0.1, R * 1.9, 0.09, 1), M4(s * width / 2, 0, 0, 0, (k / 8) * Math.PI), PAL.wood.light);
    }
    put(new THREE.CylinderGeometry(0.22, 0.22, width + 0.5, 12), M4(0, 0, 0, 0, 0, Math.PI / 2), PAL.wood.dark);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      put(boxUV(width, 0.52, 0.09, 1), M4(0, Math.cos(a) * (R - 0.22), Math.sin(a) * (R - 0.22), 0, a), PAL.wood.mid);
      put(boxUV(width, 0.1, 0.42, 1), M4(0, Math.cos(a) * (R - 0.5), Math.sin(a) * (R - 0.5), 0, a), PAL.wood.weathered);
    }
    const wheel = new THREE.Mesh(mergeGeometries(parts), B ? bldSurface('wood') : woodMat());
    wheel.name = 'mill-wheel'; wheel.castShadow = true; wheel.receiveShadow = true;
    if (B) { wheel.userData.camIgnore = true; ownMesh(wheel); }
    const holder = new THREE.Group();
    const wp = toWorld(rec, axleX, 0);
    holder.position.set(wp.x, rec.y + axleLocalY, wp.z);
    holder.rotation.y = rec.rot;
    holder.add(wheel);
    scene.add(holder);
    animators.push((t, dt) => { wheel.rotation.x -= (dt || 0) * 0.85; });
    try { if (kit.ripples) kit.ripples([{ x: wp.x, z: wp.z, r: 1.5 }], { y: waterY, count: 8, seed: 5 }); } catch (e) { reportError('mill splash', e); }
    rec.wheel = wheel;
    rec.wheelAt = { x: wp.x, z: wp.z, y: rec.y + axleLocalY, r: R };
    endBuilding(B);
    return rec;
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // the church: a stone chapel with a bell tower you can see from the meadow
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  /**
   * o = {x, z, rot (front faces local +z), W (nave width), D (nave length), H, towerSide:-1|1, id, opens}
   * Returns the cottage-shaped record plus {towerTop, bellAt}.
   */
  kit.church = (o) => {
    const B = beginBuilding(o, 'church');
    const W = o.W ?? 6.0, D = o.D ?? 9.2, H = o.H ?? 3.5, P = 0.5, rot = o.rot || 0;
    const y = o.y ?? padY({ x: o.x, z: o.z, rot }, W + 3.4, D);
    const base = M4(o.x, y, o.z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const doorW = 1.7, doorH = 2.45, holeW = doorW + 0.08, holeH = doorH + 0.08, T = WALL_T;
    let bellAt = null;

    // plinth
    add('stone', boxUV(W + 0.35, P + 0.1, D + 0.35, Tex.worldSize('stone')), M4(0, (P + 0.1) / 2 - 0.05, 0));
    // lime-washed walls with a stone base course, hollow so the door can open
    const top = C3(PAL.mask.on), low = C3(mixHex(PAL.mask.on, PAL.plaster.grime, 0.85));
    const slab = (w, h, d, lx, ly, lz) => {
      const g = addTo('plaster', boxUV(w, h, d, Tex.worldSize('plaster'), [Math.max(2, Math.round(w)), 4, Math.max(1, Math.round(d))]), base.clone().multiply(M4(lx, ly, lz)));
      const p = g.attributes.position, c = g.attributes.color, t = new THREE.Color();
      for (let i = 0; i < p.count; i++) { t.copy(low).lerp(top, smooth(0, 1.2, p.getY(i) - y - P)); c.setXYZ(i, t.r, t.g, t.b); }
    };
    slab(W, H, T, 0, P + H / 2, -D / 2 + T / 2);
    for (const sx of [-1, 1]) slab(T, H, D - 2 * T, sx * (W / 2 - T / 2), P + H / 2, 0);
    const hl = -holeW / 2, hr = holeW / 2;
    slab(hl + W / 2, H, T, (-W / 2 + hl) / 2, P + H / 2, D / 2 - T / 2);
    slab(W / 2 - hr, H, T, (hr + W / 2) / 2, P + H / 2, D / 2 - T / 2);
    slab(holeW, H - holeH, T, 0, P + holeH + (H - holeH) / 2, D / 2 - T / 2);
    // the nave you see through the open doors: the full inside of the shell, floored above the knoll it stands on
    {
      const floorY = Math.max(P + 0.09, padTop({ x: o.x, z: o.z, rot }, W, D) - y + 0.1);
      interiorRoom(base, { x: 0, zFace: D / 2, T, y0: P, w: holeW, h: holeH, roomW: W - 2 * T - 0.06,
        depth: D - 2 * T - 0.06, floorY, top: P + H - 0.1, hearth: false, kind: 'church' });
      // the doorway's reveal: stone lining up both jambs and across the head, and a worn stone threshold
      for (const s of [-1, 1]) add('stone', boxUV(0.09, holeH, T + 0.02, Tex.worldSize('stone')), M4(s * (holeW / 2 - 0.045), P + holeH / 2, D / 2 - T / 2), PAL.stone.mid);
      add('stone', boxUV(holeW, 0.09, T + 0.02, Tex.worldSize('stone')), M4(0, P + holeH - 0.045, D / 2 - T / 2), PAL.stone.mid);
      add('stone', boxUV(holeW + 0.12, 0.1, T + 0.18, Tex.worldSize('stone')), M4(0, P + 0.05, D / 2 - T / 2), PAL.stone.light);
    }
    // stone quoins up the corners and a string course
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < Math.floor(H / 0.42); k++) {
      const big = k % 2 === 0;
      add('stone', boxUV(big ? 0.5 : 0.3, 0.38, big ? 0.3 : 0.5, Tex.worldSize('stone')),
        M4(sx * (W / 2 - (big ? 0.22 : 0.12)), P + 0.22 + k * 0.42, sz * (D / 2 - (big ? 0.12 : 0.22))), PAL.stone.light);
    }
    for (const sx of [-1, 1]) for (const bz of [-D * 0.28, D * 0.1]) {
      add('stone', boxUV(0.55, H * 0.62, 0.8, Tex.worldSize('stone')), M4(sx * (W / 2 + 0.2), P + H * 0.31, bz), PAL.stone.light);
      add('stone', boxUV(0.62, 0.22, 0.9, Tex.worldSize('stone')), M4(sx * (W / 2 + 0.22), P + H * 0.62, bz, 0, 0, sx * 0.2), PAL.stone.mid);
    }
    // the arched door: stone surround, voussoirs, a tympanum and two leaves
    add('stone', new THREE.TorusGeometry(holeW / 2 + 0.16, 0.2, 5, 16, Math.PI), M4(0, P + holeH - 0.1, D / 2 + 0.02), PAL.stone.light);
    for (const s of [-1, 1]) add('stone', boxUV(0.3, holeH - 0.1, 0.24, Tex.worldSize('stone')), M4(s * (holeW / 2 + 0.14), P + (holeH - 0.1) / 2, D / 2 + 0.02), PAL.stone.light);
    add('wood', new THREE.CircleGeometry(holeW / 2 - 0.02, 16, 0, Math.PI), M4(0, P + holeH - 0.12, D / 2 - T / 2 + 0.02), PAL.wood.dark);
    add('stone', boxUV(holeW + 1.2, 0.26, 1.0, Tex.worldSize('stone')), M4(0, 0.13, D / 2 + 0.72));
    add('stone', boxUV(holeW + 0.7, 0.26, 0.62, Tex.worldSize('stone')), M4(0, 0.38, D / 2 + 0.38));
    const door = registerDoor({ id: (o.opens && o.opens.id) || o.id, base, style: 'church', color: o.doorColor || PAL.wood.mid,
      x: 0, y0: P, zFace: D / 2, w: doorW, h: doorH, double: true, reach: 3.4, max: 1.4 });
    // the rose window in the gable
    const roseY = P + H + 0.95;
    add('paint', new THREE.CircleGeometry(0.62, 20), M4(0, roseY, D / 2 - 0.05), PAL.paint.glass);
    add('stone', new THREE.TorusGeometry(0.68, 0.14, 5, 18), M4(0, roseY, D / 2 - 0.02), PAL.stone.light);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      add('stone', boxUV(0.08, 1.24, 0.1, 1.2), M4(0, roseY, D / 2 + 0.01, 0, 0, a), PAL.stone.light);
      add('paint', new THREE.CircleGeometry(0.15, 10), M4(Math.cos(a + 0.5) * 0.36, roseY + Math.sin(a + 0.5) * 0.36, D / 2 + 0.02), [PAL.flower.red, PAL.paint.shutterBlue, PAL.flower.yellow][k % 3]);
    }
    // tall arched windows down both sides
    const archWindow = (fm, w, h, colour) => {
      const a = (b, g, m, c) => add(b, g, fm.clone().multiply(m), c);
      a('paint', new THREE.BoxGeometry(w, h, 0.1), M4(0, h / 2, 0.06), PAL.paint.glass);
      a('paint', new THREE.CircleGeometry(w / 2, 14, 0, Math.PI), M4(0, h, 0.11), PAL.paint.glass);
      a('stone', new THREE.TorusGeometry(w / 2 + 0.1, 0.12, 4, 12, Math.PI), M4(0, h, 0.03), PAL.stone.light);
      for (const s of [-1, 1]) a('stone', boxUV(0.2, h, 0.16, Tex.worldSize('stone')), M4(s * (w / 2 + 0.08), h / 2, 0.03), PAL.stone.light);
      a('paint', new THREE.BoxGeometry(0.07, h * 0.9, 0.06), M4(0, h / 2, 0.12), PAL.stone.mid);
      a('paint', new THREE.BoxGeometry(w * 0.8, 0.06, 0.06), M4(0, h * 0.45, 0.12), PAL.stone.mid);
      a('paint', new THREE.CircleGeometry(w * 0.2, 10), M4(0, h * 0.98, 0.13), colour);
      a('paint', new THREE.BoxGeometry(w * 0.3, h * 0.2, 0.05), M4(0, h * 0.62, 0.13), colour);
      a('stone', boxUV(w + 0.5, 0.16, 0.3, Tex.worldSize('stone')), M4(0, -0.05, 0.1), PAL.stone.mid);
    };
    [[-D * 0.26, PAL.flower.red], [0, PAL.paint.shutterBlue], [D * 0.26, PAL.flower.yellow]].forEach(([lz, colour], i) => {
      archWindow(M4(-W / 2, P + 1.0, lz, -Math.PI / 2), 0.62, 1.5, colour);
      archWindow(M4(W / 2, P + 1.0, lz, Math.PI / 2), 0.62, 1.5, [PAL.flower.yellow, PAL.flower.red, PAL.paint.shutterBlue][i]);
    });

    // the roof: the ridge runs along the nave, so the roof frame is the base turned a quarter
    const roofBase = base.clone().multiply(M4(0, 0, 0, -Math.PI / 2));
    const ridgeY = kit.gableRoof(roofBase, D, W, P + H, o.pitch ?? 0.84, 0.3, 0.45, 0.16, 'tile', 'plaster', null, { barge: true, bargeColor: PAL.wood.weathered });

    // ── the bell tower ──
    const ts = o.towerSide ?? -1, tw = 2.9, twH = o.towerH ?? 7.2;
    const tx = ts * (W / 2 + tw / 2 - 0.3), tz = D / 2 - tw / 2 - 0.1;
    const tbase = base.clone().multiply(M4(tx, 0, tz));
    const tadd = (b, g, m, c) => addTo(b, g, tbase.clone().multiply(m), c);
    tadd('stone', boxUV(tw + 0.3, 0.5, tw + 0.3, Tex.worldSize('stone')), M4(0, 0.2, 0));
    const tg = addTo('stone', boxUV(tw, twH, tw, Tex.worldSize('stone'), [3, 8, 3]), tbase.clone().multiply(M4(0, 0.4 + twH / 2, 0)));
    { const p = tg.attributes.position, c = tg.attributes.color, t = new THREE.Color(), lo = C3(mixHex(PAL.mask.on, PAL.stone.mid, 0.5)), hi = C3(mixHex(PAL.mask.on, PAL.thatch.pale, 0.2));
      for (let i = 0; i < p.count; i++) { t.copy(lo).lerp(hi, smooth(0, 3.0, p.getY(i) - y)); c.setXYZ(i, t.r, t.g, t.b); } }
    for (const sy of [2.6, 5.0]) tadd('stone', boxUV(tw + 0.24, 0.2, tw + 0.24, Tex.worldSize('stone')), M4(0, sy, 0), PAL.stone.light);
    for (const face of [0, 1, 2, 3]) {
      const fm = M4(0, 0, 0, face * Math.PI / 2);
      tadd('paint', new THREE.BoxGeometry(0.34, 0.8, 0.1), fm.clone().multiply(M4(0, 3.6, tw / 2 + 0.02)), PAL.paint.glass);
      tadd('stone', new THREE.TorusGeometry(0.22, 0.09, 5, 12, Math.PI), fm.clone().multiply(M4(0, 4.0, tw / 2 + 0.03)), PAL.stone.light);
    }
    // the belfry: four piers, four arches, and the bell inside
    const belfryY = 0.4 + twH;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tadd('stone', boxUV(0.62, 1.9, 0.62, Tex.worldSize('stone')), M4(sx * (tw / 2 - 0.31), belfryY + 0.95, sz * (tw / 2 - 0.31)), PAL.stone.light);
    for (const face of [0, 1, 2, 3]) {
      const fm = M4(0, 0, 0, face * Math.PI / 2);
      tadd('stone', new THREE.TorusGeometry(tw / 2 - 0.45, 0.22, 4, 12, Math.PI), fm.clone().multiply(M4(0, belfryY + 1.42, tw / 2 - 0.3)), PAL.stone.light);
      tadd('stone', boxUV(tw - 1.24, 0.3, 0.5, Tex.worldSize('stone')), fm.clone().multiply(M4(0, belfryY + 0.15, tw / 2 - 0.3)), PAL.stone.mid);
    }
    tadd('stone', boxUV(tw + 0.5, 0.26, tw + 0.5, Tex.worldSize('stone')), M4(0, belfryY + 2.0, 0), PAL.stone.light);
    tadd('wood', boxUV(0.22, 0.22, tw - 0.6, 1.2), M4(0, belfryY + 1.72, 0), beam);                      // the bell yoke
    const spireH = o.spireH ?? 3.6;
    pyramidRoof(tbase.clone().multiply(M4(0, belfryY + 2.13, 0)), tw + 0.2, spireH, 'tile', { finial: true });
    // the bell: bronze, hanging from the yoke, swinging just a little
    {
      const prof = [[0.0, 0.92], [0.18, 0.92], [0.2, 0.7], [0.3, 0.42], [0.44, 0.12], [0.48, 0.03], [0.5, 0.0], [0.36, 0.0], [0.34, 0.06], [0.2, 0.34], [0.12, 0.62], [0.1, 0.9]]
        .map(([a, b]) => new THREE.Vector2(a, b));
      const bellGeo = prep(new THREE.LatheGeometry(prof, 18), PAL.paint.gold);
      const parts2 = [bellGeo];
      const clap = prep(new THREE.SphereGeometry(0.09, 9, 7), PAL.wood.dark); clap.applyMatrix4(M4(0, 0.1, 0));
      parts2.push(clap);
      const bell = new THREE.Mesh(mergeGeometries(parts2), B ? bldSurface('paint') : paintMat());
      bell.name = 'bell'; bell.castShadow = true;
      if (B) { bell.userData.camIgnore = true; ownMesh(bell); }
      const pivot = new THREE.Group();
      const bp = toWorld({ x: o.x, z: o.z, rot }, tx, tz);
      pivot.position.set(bp.x, y + belfryY + 1.72, bp.z);
      pivot.rotation.y = rot;
      bell.position.set(0, -1.0, 0);
      pivot.add(bell);
      scene.add(pivot);
      animators.push((t) => { pivot.rotation.z = Math.sin(t * 0.55) * 0.035 + Math.sin(t * 1.7) * 0.012; });
      bellAt = { x: bp.x, z: bp.z, y: y + belfryY + 1.7 };
    }
    // the weathervane lark on the spire
    {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(0.42, 0.1); shape.lineTo(0.3, 0.2); shape.lineTo(0.36, 0.42);
      shape.lineTo(0.16, 0.26); shape.lineTo(-0.1, 0.3); shape.lineTo(-0.3, 0.12); shape.lineTo(-0.16, 0.0); shape.closePath();
      const lark = prep(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }), PAL.paint.gold);
      const rod = prep(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6), PAL.paint.iron); rod.applyMatrix4(M4(0, -0.4, 0));
      lark.applyMatrix4(M4(0, 0.08, 0));
      const vane = new THREE.Mesh(mergeGeometries([lark, rod]), B ? bldSurface('paint') : paintMat());
      vane.name = 'weathervane';
      if (B) { vane.userData.camIgnore = true; ownMesh(vane); }
      const vp = toWorld({ x: o.x, z: o.z, rot }, tx, tz);
      vane.position.set(vp.x, y + belfryY + 2.13 + spireH + 0.6, vp.z);
      scene.add(vane);
      animators.push((t) => { vane.rotation.y = Math.sin(t * 0.21) * 0.9 + Math.sin(t * 0.07) * 1.6; });
    }

    ao.box(o.x, o.z, W + 0.5, D + 0.5, rot, 1.6, 0.8);
    const tp = toWorld({ x: o.x, z: o.z, rot }, tx, tz);
    ao.box(tp.x, tp.z, tw + 0.6, tw + 0.6, rot, 1.2, 0.8);
    kit.footBox(o.x, o.z, W + 1.0, D + 1.0, rot);
    kit.footBox(tp.x, tp.z, tw + 1.0, tw + 1.0, rot);
    const rec = { id: o.id || 'church', kind: 'church', x: o.x, z: o.z, rot, W, D, y, ridgeY: y + ridgeY,
      door: { x: door.front.x, z: door.front.z }, doorway: { x: door.x, z: door.z }, front: door.front, doorId: door.id, doorYaw: door.yaw,
      tower: { x: tp.x, z: tp.z, w: tw, top: y + belfryY + 2.13 + spireH }, bell: bellAt, chimneyTop: null, chimneyTops: [] };
    (kit.buildings || (kit.buildings = [])).push(rec);
    endBuilding(B);
    return rec;
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // village furniture
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  /** The well on the green: a stone ring, a windlass, a bucket and a little tiled roof. */
  kit.wellHouse = (x, z, { rot = 0.3, roof = 'tile', water = PAL.water.deep } = {}) => {
    const y = heightAt(x, z) - 0.02, base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const prof = [[0.78, 0], [1.12, 0], [1.14, 0.8], [1.06, 0.95], [0.8, 0.95], [0.78, 0.1]].map(([a, b]) => new THREE.Vector2(a, b));
    const ring = new THREE.LatheGeometry(prof, 22);
    { const uv = ring.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7.0 / 1.6, uv.getY(i) * 1.1 / 1.6); }
    add('stone', ring, M4());
    add('paint', new THREE.CylinderGeometry(0.79, 0.79, 0.5, 20, 1, true), M4(0, 0.7, 0, 0, 0, 0), PAL.shadow.contact);
    add('paint', new THREE.CircleGeometry(0.8, 18), M4(0, 0.5, 0, 0, -Math.PI / 2), water);
    for (const s of [-1, 1]) add('wood', boxUV(0.16, 2.3, 0.16, 1.2), M4(s * 0.98, 1.15, 0), beam);
    add('wood', new THREE.CylinderGeometry(0.09, 0.09, 2.1, 10), M4(0, 1.95, 0, 0, 0, Math.PI / 2), PAL.wood.mid);
    add('paint', new THREE.CylinderGeometry(0.02, 0.02, 1.15, 5), M4(0.05, 1.38, 0), PAL.cloth.rope);
    add('wood', new THREE.CylinderGeometry(0.2, 0.17, 0.3, 12), M4(0.05, 0.86, 0), PAL.wood.light);
    add('paint', new THREE.TorusGeometry(0.19, 0.02, 4, 12), M4(0.05, 0.96, 0, 0, Math.PI / 2), PAL.paint.iron);
    add('paint', new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), M4(1.06, 1.95, 0, 0, 0, Math.PI / 2), PAL.paint.iron);   // the crank
    add('paint', new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), M4(1.26, 1.82, 0), PAL.paint.iron);
    add('wood', new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8), M4(1.26, 1.66, 0), PAL.wood.light);
    kit.gableRoof(base, 2.5, 1.7, 2.3, 0.62, 0.2, 0.3, 0.12, roof, 'wood', PAL.wood.weathered);
    ao.disc(x, z, 2.3, 0.7);
    kit.footDisc(x, z, 1.5);
    return { x, z, y, r: 1.2 };
  };

  /** A humpbacked stone bridge over the Beck, built on a bridgeFrame() (src/art/props.js). */
  kit.stoneBridge = (F, { parapetH = 0.62, thick = 0.3, bed = -1.7 } = {}) => {
    const { L, W, y0, cx, cz, dir } = F;
    const base = M4(cx, 0, cz, dir - Math.PI / 2);
    const E = L / 2 + 1.0;
    const top = (u) => (Math.abs(u) <= L / 2 ? F.archY(u) : lerp(F.archY(L / 2), y0 - 0.45, smooth(L / 2, E, Math.abs(u))));
    const yb = y0 + bed;
    const shape = new THREE.Shape();
    shape.moveTo(-E, yb);
    const N = 26;
    for (let i = 0; i <= N; i++) { const u = -E + (2 * E * i) / N; shape.lineTo(u, top(u)); }
    shape.lineTo(E, yb);
    const Ro = L / 2 - 0.9, yc = F.archY(0) - thick - 0.12;
    shape.lineTo(Ro, yb);
    for (let i = 0; i <= 18; i++) { const a = (i / 18) * Math.PI; shape.lineTo(Math.cos(a) * Ro, yb + (yc - yb) * Math.sin(a)); }
    shape.lineTo(-Ro, yb);
    shape.closePath();
    const body = scaleUV(new THREE.ExtrudeGeometry(shape, { depth: W + 0.2, bevelEnabled: false, curveSegments: 6 }), Tex.worldSize('stone'));
    body.translate(0, 0, -(W + 0.2) / 2);
    addTo('stone', body, base.clone());
    // parapets with capstones, and a newel at each end
    const pShape = new THREE.Shape();
    pShape.moveTo(-E + 0.35, top(-E + 0.35) - 0.05);
    for (let i = 0; i <= N; i++) { const u = -E + 0.35 + ((2 * E - 0.7) * i) / N; pShape.lineTo(u, top(u) + parapetH); }
    pShape.lineTo(E - 0.35, top(E - 0.35) - 0.05);
    pShape.closePath();
    for (const s of [-1, 1]) {
      const pg = scaleUV(new THREE.ExtrudeGeometry(pShape, { depth: 0.3, bevelEnabled: false, curveSegments: 6 }), Tex.worldSize('stone'));
      pg.translate(0, 0, s * (W / 2 - 0.02) - (s > 0 ? 0 : 0.3));
      addTo('stone', pg, base.clone());
      for (let i = 0; i <= 12; i++) {
        const u = -E + 0.4 + ((2 * E - 0.8) * i) / 12, yy = top(u) + parapetH;
        const slope = (top(u + 0.4) - top(u - 0.4)) / 0.8;
        addTo('stone', boxUV(0.55, 0.14, 0.44, Tex.worldSize('stone')), base.clone().multiply(M4(u, yy + 0.06, s * (W / 2 + 0.13), 0, 0, Math.atan(slope))), PAL.stone.light);
      }
      for (const e of [-1, 1]) addTo('stone', boxUV(0.6, 0.9, 0.5, Tex.worldSize('stone')), base.clone().multiply(M4(e * (E - 0.2), top(e * (E - 0.2)) + 0.35, s * (W / 2 + 0.12))), PAL.stone.mid);
    }
    // keystone over the arch
    for (const s of [-1, 1]) addTo('stone', boxUV(0.4, 0.5, 0.16, Tex.worldSize('stone')), base.clone().multiply(M4(0, yc - 0.1, s * (W / 2 + 0.16))), PAL.stone.light);
    for (const e of F.ends) { ao.disc(e[0], e[1], 1.6, 0.5); }
    kit.footBox(cx, cz, W + 1.0, L + 1.6, dir);
    return F;
  };

  /** A market stall: four posts, a counter, a striped awning and a heap of goods. */
  kit.stall = (o) => {
    const x = o.x, z = o.z, rot = o.rot || 0;
    // a market stall is as big as a shed and stands ON the lane: it is a fade unit of its own, or its bare
    // timber frame ends up as an opaque plank across a third of the frame while the boy walks behind it
    const B = beginBuilding({ id: o.id || `stall-${BUILT.length}`, x, z, rot }, 'stall');
    const y = heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const W = o.W ?? 2.7, D = o.D ?? 1.5;
    for (const px of [-1, 1]) for (const pz of [-1, 1]) {
      const h = pz < 0 ? 2.35 : 1.95;
      add('wood', boxUV(0.12, h, 0.12, 1), M4(px * (W / 2 - 0.1), h / 2, pz * (D / 2 - 0.1)), beam);
    }
    add('wood', boxUV(W, 0.14, D, 0.9), M4(0, 0.9, 0), PAL.wood.light);
    add('wood', boxUV(W - 0.2, 0.7, 0.1, 0.9), M4(0, 0.5, D / 2 - 0.12), PAL.wood.weathered);
    const geos = clothGeos(o.color || PAL.cloth.mustard, o.stripe || PAL.cloth.cream, true, 128);
    const P3 = (a, b, c) => new THREE.Vector3(a, b, c);
    const uRep = Math.max(1, (W + 0.5) / 1.7);
    const sl = quad(P3(-(W + 0.5) / 2, 2.32, -(D / 2 + 0.2)), P3((W + 0.5) / 2, 2.32, -(D / 2 + 0.2)), P3((W + 0.5) / 2, 1.92, D / 2 + 0.35), P3(-(W + 0.5) / 2, 1.92, D / 2 + 0.35), 0, uRep, 0.3, 1);
    sl.applyMatrix4(base); geos.push(sl);
    const val = quad(P3(-(W + 0.5) / 2, 1.92, D / 2 + 0.35), P3((W + 0.5) / 2, 1.92, D / 2 + 0.35), P3((W + 0.5) / 2, 1.62, D / 2 + 0.35), P3(-(W + 0.5) / 2, 1.62, D / 2 + 0.35), 0, uRep, 0, 0.46);
    val.applyMatrix4(base); geos.push(val);
    const r = mulberry(o.seed ?? 55);
    const goods = o.goods || ['apple', 'cabbage', 'loaf', 'pot'];
    for (let i = 0; i < 11; i++) {
      const gx = -W / 2 + 0.25 + r() * (W - 0.5), gz = -D / 2 + 0.3 + r() * (D - 0.6);
      const what = goods[(r() * goods.length) | 0];
      if (what === 'pot') add('paint', new THREE.CylinderGeometry(0.11, 0.13, 0.22, 9), M4(gx, 1.08, gz), PAL.tile.mid);
      else if (what === 'loaf') { const g = new THREE.SphereGeometry(0.11, 9, 7); g.scale(1.5, 0.8, 0.9); add('paint', g, M4(gx, 1.04, gz, r() * 3), PAL.wood.light); }
      else if (what === 'cabbage') add('paint', new THREE.IcosahedronGeometry(0.13, 0), M4(gx, 1.06, gz), PAL.foliage.light);
      else add('paint', new THREE.IcosahedronGeometry(0.1, 0), M4(gx, 1.03, gz), r() < 0.5 ? PAL.flower.red : PAL.flower.yellow);
    }
    ao.box(x, z, W + 0.6, D + 0.8, rot, 0.9, 0.6);
    kit.footBox(x, z, W + 0.6, D + 0.9, rot);
    endBuilding(B);
    return { x, z, rot, W, D };
  };

  /** A low drystone wall — the kind a boy sits on to wait for his father. Returns the capsule collider points. */
  kit.stoneWall = (pts, { h = 0.5, w = 0.42, seed = 9, cap = true } = {}) => {
    const r = mulberry(seed);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(L / 1.2));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const mx = lerp(x0, x1, (t0 + t1) / 2), mz = lerp(z0, z1, (t0 + t1) / 2);
        const yy = (heightAt(lerp(x0, x1, t0), lerp(z0, z1, t0)) + heightAt(lerp(x0, x1, t1), lerp(z0, z1, t1))) / 2;
        const hh = h * (0.92 + r() * 0.16);
        addTo('stone', boxUV(w, hh + 0.2, L / n + 0.04, Tex.worldSize('stone')), M4(mx, yy + hh / 2 - 0.1, mz, ang, 0, (r() - 0.5) * 0.04));
        if (cap) addTo('stone', boxUV(w + 0.16, 0.14, L / n + 0.02, Tex.worldSize('stone')), M4(mx, yy + hh + 0.02, mz, ang, 0, (r() - 0.5) * 0.05), PAL.stone.light);
        ao.box(mx, mz, w + 0.4, L / n + 0.3, ang, 0.3, 0.5);
        kit.footBox(mx, mz, w + 0.3, L / n + 0.1, ang, 0.05);
      }
    }
    return pts;
  };

  /** A standing stone: taller than a rock, mossy on its north face. The shrine of Saint Alden is three of them. */
  kit.standingStone = (x, z, { h = 1.9, r: rad = 0.45, lean = 0.08, seed = 1 } = {}) => {
    const rnd = mulberry(seed * 7717 + 3);
    const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const k = 0.82 + 0.3 * vnoise(vx * 2.1 + seed, vz * 2.1 + vy * 1.3, seed + 5);
      p.setXYZ(i, vx * rad * k * (1.1 - 0.25 * vy), Math.max(vy, -0.35) * (h / 2) * k, vz * rad * k * (1.0 - 0.2 * vy));
    }
    g.computeVertexNormals();
    const geo = prep(g, PAL.mask.on);
    const col = geo.attributes.color, pos = geo.attributes.position, nrm = geo.attributes.normal, t = new THREE.Color();
    const a = C3(PAL.stone.mid), b = C3(PAL.stone.light), m = C3(PAL.stone.moss);
    for (let i = 0; i < pos.count; i++) {
      t.copy(a).lerp(b, smooth(-h * 0.3, h * 0.5, pos.getY(i)));
      t.lerp(m, smooth(0.1, 0.6, -nrm.getZ(i)) * smooth(0.3, 0.7, vnoise(pos.getX(i) * 3 + seed, pos.getY(i) * 3, 7)) * 0.7);
      col.setXYZ(i, t.r, t.g, t.b);
    }
    const uv = geo.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i) * 0.6) / 1.6, pos.getY(i) / 1.6);
    geo.applyMatrix4(M4(x, heightAt(x, z) + h * 0.35, z, rnd() * TAU, lean * (rnd() - 0.5) * 2, lean));
    addTo('stone', geo, null);
    ao.disc(x, z, rad * 2.4, 0.7);
    kit.footDisc(x, z, rad * 1.5);
    return { x, z, r: rad * 1.1 };
  };

  /** A half-built maypole: the pole is up, its garland crown leans against it, and somebody has left a ladder. */
  kit.maypole = (x, z, { h = 5.4, built = false, seed = 21 } = {}) => {
    const y = heightAt(x, z), base = M4(x, y, z);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const pole = new THREE.CylinderGeometry(0.11, 0.15, h, 10); wrapUV(pole, 2, h / Tex.worldSize('wood'));
    add('wood', pole, M4(0, h / 2, 0), PAL.wood.light);
    add('paint', new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), M4(0, h - 0.06, 0), PAL.paint.gold);
    const r = mulberry(seed);
    if (built) {
      add('paint', new THREE.TorusGeometry(0.85, 0.11, 6, 20), M4(0, h - 0.35, 0, 0, Math.PI / 2), PAL.foliage.mid);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        add('paint', boxUV(0.14, h * 0.75, 0.02, 1), M4(Math.cos(a) * 0.5, h * 0.62, Math.sin(a) * 0.5, a, 0, 0.12),
          [PAL.cloth.red, PAL.cloth.cream, PAL.cloth.blue, PAL.cloth.mustard][k % 4]);
      }
    } else {
      // the crown on the grass, leaning on the pole, ribbons still coiled
      add('paint', new THREE.TorusGeometry(0.62, 0.11, 6, 18), M4(0.5, 0.66, 0.78, 0.4, 1.15), PAL.foliage.mid);
      for (let k = 0; k < 12; k++) { const a2 = (k / 12) * TAU; add('paint', new THREE.IcosahedronGeometry(0.1, 0), M4(0.5 + Math.cos(a2) * 0.6, 0.66 + Math.sin(a2) * 0.24, 0.78 + Math.sin(a2) * 0.55), [PAL.flower.pink, PAL.flower.yellow, PAL.flower.white, PAL.flower.red][k % 4]); }
      for (let k = 0; k < 4; k++) add('paint', new THREE.TorusGeometry(0.16, 0.05, 5, 12), M4(-0.6 + k * 0.32, 0.06, 0.7 + (r() - 0.5) * 0.4, r() * 3, Math.PI / 2), [PAL.cloth.red, PAL.cloth.cream, PAL.cloth.blue, PAL.cloth.mustard][k]);
      // the ladder, leaning on the pole: stiles tilted back, rungs climbing with them
      const lh = 3.6, tilt = 0.34, cs = Math.cos(tilt), sn = Math.sin(tilt);
      for (const s of [-1, 1]) add('wood', boxUV(0.08, lh, 0.08, 1), M4(s * 0.3 - 0.15, (lh / 2) * cs + 0.05, -(lh / 2) * sn - 0.55, 0, -tilt), PAL.wood.light);
      for (let k = 0; k < 7; k++) {
        const t = 0.35 + k * 0.47;
        add('wood', boxUV(0.66, 0.06, 0.06, 1), M4(-0.15, t * cs + 0.05, -t * sn - 0.55, 0, -tilt), PAL.wood.mid);
      }
    }
    ao.disc(x, z, 1.1, 0.6);
    kit.footDisc(x, z, 0.5);
    return { x, z };
  };

  /** A trestle table with pies on it, ready for the harvest festival. */
  kit.trestleTable = (x, z, rot = 0, { pies = 3, seed = 31 } = {}) => {
    const y = heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const W = 2.6, D = 0.95, T = 0.78;
    add('wood', boxUV(W, 0.1, D, 0.9), M4(0, T, 0), PAL.wood.light);
    for (const s of [-1, 1]) {
      for (const e of [-1, 1]) add('wood', boxUV(0.1, T, 0.1, 1), M4(s * (W / 2 - 0.25), T / 2, e * (D / 2 - 0.15), 0, 0, -e * s * 0.12), PAL.wood.mid);
      add('wood', boxUV(0.1, 0.09, D - 0.2, 1), M4(s * (W / 2 - 0.25), T * 0.4, 0), PAL.wood.mid);
    }
    // a cloth over one end
    const geos = clothGeos(PAL.cloth.cream, PAL.cloth.red, false, 128);
    const P3 = (a, b, c) => new THREE.Vector3(a, b, c);
    const cl = quad(P3(-W / 2 - 0.1, T + 0.11, -D / 2 - 0.08), P3(0.5, T + 0.11, -D / 2 - 0.08), P3(0.5, T + 0.11, D / 2 + 0.08), P3(-W / 2 - 0.1, T + 0.11, D / 2 + 0.08), 0, 1.4, 0.4, 1);
    cl.applyMatrix4(base); geos.push(cl);
    const dropF = quad(P3(-W / 2 - 0.1, T + 0.11, D / 2 + 0.08), P3(0.5, T + 0.11, D / 2 + 0.08), P3(0.5, T - 0.2, D / 2 + 0.08), P3(-W / 2 - 0.1, T - 0.2, D / 2 + 0.08), 0, 1.4, 0.4, 1);
    dropF.applyMatrix4(base); geos.push(dropF);
    const r = mulberry(seed);
    for (let k = 0; k < pies; k++) {
      const px = -0.85 + k * 0.72, pz = (r() - 0.5) * 0.25;
      add('paint', new THREE.CylinderGeometry(0.24, 0.2, 0.12, 14), M4(px, T + 0.17, pz), PAL.wood.light);
      add('paint', new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14), M4(px, T + 0.24, pz), PAL.thatch.light);
      for (let q = 0; q < 3; q++) add('paint', boxUV(0.36, 0.03, 0.05, 1), M4(px, T + 0.27, pz - 0.1 + q * 0.1, 0.4), PAL.wood.light);
    }
    add('paint', new THREE.CylinderGeometry(0.12, 0.14, 0.3, 10), M4(0.95, T + 0.26, 0.1), PAL.tile.mid);
    ao.box(x, z, W + 0.4, D + 0.4, rot, 0.6, 0.55);
    kit.footBox(x, z, W + 0.3, D + 0.3, rot);
    return { x, z, rot };
  };

  /** Flour sacks, leaning on each other (the mill door, the bakery, a cart). */
  kit.sacks = (x, z, n = 3, rot = 0, seed = 4) => {
    const y = heightAt(x, z), r = mulberry(seed);
    for (let k = 0; k < n; k++) {
      const a = rot + k * 1.9, dx = Math.cos(a) * 0.3, dz = Math.sin(a) * 0.3;
      const g = new THREE.SphereGeometry(0.3, 8, 6); g.scale(0.85, 1.15, 0.85);
      addTo('paint', g, M4(x + dx, y + 0.32, z + dz, r() * 3, (r() - 0.5) * 0.2, (r() - 0.5) * 0.25), PAL.cloth.cream);
      addTo('paint', new THREE.SphereGeometry(0.1, 7, 5), M4(x + dx, y + 0.62, z + dz), PAL.cloth.rope);
    }
    ao.disc(x, z, 0.9, 0.6);
    kit.footDisc(x, z, 0.62);
  };

  /** The parish noticeboard: two posts, a board, pinned papers. Interactable (the map gives it words). */
  kit.noticeBoard = (x, z, rot = 0, { w = 1.3, h = 0.9 } = {}) => {
    const y = heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    for (const s of [-1, 1]) add('wood', boxUV(0.12, 2.0, 0.12, 1), M4(s * (w / 2 - 0.1), 1.0, 0), beam);
    add('wood', boxUV(w + 0.12, h + 0.12, 0.09, 1), M4(0, 1.62, 0.01), PAL.wood.mid);
    add('wood', boxUV(w - 0.06, h - 0.06, 0.06, 0.9), M4(0, 1.62, 0.06), PAL.wood.dark);
    add('wood', boxUV(w + 0.34, 0.1, 0.22, 1), M4(0, 1.62 + h / 2 + 0.14, 0.08, 0, -0.5), PAL.wood.weathered);
    const r = mulberry(Math.abs((x * 7 + z * 3) | 0) + 2);
    for (let k = 0; k < 4; k++) add('paint', new THREE.BoxGeometry(0.3 + r() * 0.1, 0.34 + r() * 0.1, 0.02), M4(-w / 2 + 0.28 + k * 0.28, 1.6 + (r() - 0.5) * 0.2, 0.1, 0, 0, (r() - 0.5) * 0.25), PAL.cloth.cream);
    ao.box(x, z, w + 0.4, 0.6, rot, 0.4, 0.5);
    kit.footBox(x, z, w + 0.3, 0.5, rot);
    return { x, z, rot };
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // moving charm
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  /** Soft chimney smoke: puffs rise, swell, drift with the wind and fade. */
  kit.smoke = (points) => {
    if (!points.length) return null;
    const S = 128, c = mkCanvas(S), g = ctx2(c);
    const puff = (x, y, r, a) => { const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r); gr.addColorStop(0, css(PAL.cloud.lit, a)); gr.addColorStop(0.45, css(PAL.cloud.warm, a * 0.8)); gr.addColorStop(0.8, css(PAL.cloud.mid, a * 0.3)); gr.addColorStop(1, css(PAL.cloud.mid, 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); };
    puff(64, 70, 50, 0.9); puff(46, 58, 30, 0.6); puff(84, 54, 32, 0.6);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const per = 6, total = points.length * per;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade; varying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade;');
    };
    mat.customProgramCacheKey = () => 'kitsmoke';
    const geo = new THREE.PlaneGeometry(1, 1);
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
    geo.setAttribute('aFade', fade);
    const mesh = new THREE.InstancedMesh(geo, mat, total); mesh.name = 'smoke'; mesh.frustumCulled = false; mesh.renderOrder = 2;
    scene.add(mesh);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qz = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
    const jitter = Array.from({ length: total }, (_, k) => [hashJ(k, 1), hashJ(k, 2), hashJ(k, 3)]);
    animators.push((t, dt, cam) => {
      if (cam) q.copy(cam.quaternion);
      let k = 0;
      for (let pi = 0; pi < points.length; pi++) {
        const p = points[pi];
        for (let i = 0; i < per; i++, k++) {
          const [j1, j2, j3] = jitter[k];
          const life = ((t * 0.11 + i / per + pi * 0.37 + j1 * 0.08) % 1);
          const rise = life * 4.2, drift = life * life * 2.6;
          v.set(p.x + drift * 0.85 + Math.sin(t * 0.6 + i * 2.1 + pi) * 0.22 * life, p.y + rise, p.z - drift * 0.35 + (j2 - 0.5) * 0.3 * life);
          const s = (0.5 + life * 2.1) * (0.85 + j3 * 0.3);
          sc.set(s, s, s);
          qz.setFromAxisAngle(zAxis, j1 * 6.283 + life * (j2 - 0.5) * 1.5);
          m4.compose(v, q.clone().multiply(qz), sc); mesh.setMatrixAt(k, m4);
          fade.array[k] = smooth(0, 0.15, life) * (1 - smooth(0.3, 1, life)) * 0.62;
        }
      }
      mesh.instanceMatrix.needsUpdate = true; fade.needsUpdate = true;
    });
    return mesh;
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // INTERIORS — the rooms the doors actually open into                                        (P05, for P23)
  //
  // Every door in Puddlewick promised a room and gave a line of text instead (P23 gap #6). These recipes are the
  // inside of a house, built in the same kit and the same buckets as the outside: a shell with a real doorway cut
  // in it, floorboards, a beamed ceiling, and the furniture WORLD-BIBLE §3 names by hand — a hearth with the fire
  // in, a table with three chairs (one is Father's and is bigger), a ladder to a loft, a bed, and a chest at the
  // foot of it. src/world/maps/hollybank.js and puddlewick_inn.js build with these.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  const ROOM_T = 0.34;                               // interior wall thickness
  const SIDES = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 };

  /**
   * The shell of a room, seen from the inside. Local +z is SOUTH (the wall a door is usually in), matching the
   * exterior recipes' convention that a building's front face is local +z.
   *   o = {x, z, rot, W, D, H, y, wall:'plaster'|'stone'|'planks', wallTint, floor:'wood'|'stone', beams,
   *        openings:[{side, at, w, h, kind:'door'|'arch'}], windows:[{side, at, y, w, h, shutter}], skirt}
   * Returns {x, z, rot, W, D, H, y, at(lx, lz) -> {x, z}, doorAt(side, at) -> {x, z, facing}}.
   */
  kit.roomShell = (o) => {
    const W = o.W ?? 8, D = o.D ?? 7, H = o.H ?? 2.6, y = o.y ?? 0, rot = o.rot || 0;
    const base = M4(o.x || 0, y, o.z || 0, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const wallKind = o.wall || 'plaster';
    const bucket = wallKind === 'stone' ? 'stone' : wallKind === 'planks' ? 'wood' : 'plaster';
    const texName = bucket === 'wood' ? 'wood' : bucket;
    const T = o.T ?? ROOM_T;
    const floorKind = o.floor || 'wood';
    const openings = o.openings || [];
    const hi = C3(o.wallTint || PAL.plaster.light), lo = C3(mixHex(o.wallTint || PAL.plaster.light, PAL.plaster.grime, 0.55));

    // ── floorboards: warm at the middle of the room, dark in the corners ──
    {
      const g = addTo(floorKind === 'stone' ? 'stone' : 'wood',
        boxUV(W + 2 * T, 0.3, D + 2 * T, Tex.worldSize(floorKind === 'stone' ? 'stone' : 'wood'), [Math.max(2, Math.round(W)), 1, Math.max(2, Math.round(D))]),
        base.clone().multiply(M4(0, -0.15, 0)));
      const p = g.attributes.position, c = g.attributes.color, t = new THREE.Color();
      const mid = C3(floorKind === 'stone' ? PAL.stone.light : PAL.wood.light), edge = C3(floorKind === 'stone' ? PAL.stone.dark : PAL.wood.dark);
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i) - (o.x || 0), lz = p.getZ(i) - (o.z || 0);
        const e = Math.max(Math.abs(lx) / (W / 2 + T), Math.abs(lz) / (D / 2 + T));
        t.copy(mid).lerp(edge, smooth(0.45, 1.0, e) * 0.8);
        c.setXYZ(i, t.r, t.g, t.b);
      }
    }

    // ── the four walls, each split around its openings ──
    const wallSlab = (w, h, lx, ly, lz, ry) => {
      if (w <= 0.02 || h <= 0.02) return;
      const g = addTo(bucket, boxUV(w, h, T, Tex.worldSize(texName), [Math.max(2, Math.round(w)), 3, 1]), base.clone().multiply(M4(lx, ly, lz, ry)));
      const p = g.attributes.position, c = g.attributes.color, t = new THREE.Color();
      for (let i = 0; i < p.count; i++) { t.copy(lo).lerp(hi, smooth(0.1, H * 0.75, p.getY(i) - y)); c.setXYZ(i, t.r, t.g, t.b); }
    };
    for (const side of ['south', 'north', 'east', 'west']) {
      const ry = SIDES[side];
      const span = (side === 'south' || side === 'north') ? W : D;
      const off = (side === 'south' || side === 'north') ? D / 2 + T / 2 : W / 2 + T / 2;
      // the wall runs along its own local x; place it by rotating the room frame
      const put = (w, h, at, yc) => {
        const c = Math.cos(ry), s = Math.sin(ry);
        const lx = at * c + off * s, lz = -at * s + off * c;
        wallSlab(w, h, lx, yc, lz, ry);
      };
      const cuts = openings.filter(op => op.side === side).sort((a, b) => (a.at || 0) - (b.at || 0));
      let x0 = -span / 2 - T;
      for (const op of cuts) {
        const ow = (op.w ?? 1.2) + 0.06, oh = (op.h ?? 2.05) + 0.04, oa = op.at ?? 0;
        const l = (oa - ow / 2) - x0;
        if (l > 0.02) put(l, H, x0 + l / 2, H / 2);
        if (H - oh > 0.04) put(ow, H - oh, oa, oh + (H - oh) / 2);
        x0 = oa + ow / 2;
        // the reveal: the doorway has thickness, lined in oak, with a threshold under it
        const c = Math.cos(ry), s = Math.sin(ry);
        const jx = oa * c + off * s, jz = -oa * s + off * c;
        for (const sg of [-1, 1]) add('wood', boxUV(0.08, oh, T, 1), M4((oa + sg * (ow / 2 - 0.04)) * c + off * s, oh / 2, -(oa + sg * (ow / 2 - 0.04)) * s + off * c, ry), PAL.wood.dark);
        add('wood', boxUV(ow + 0.16, 0.12, T + 0.02, 1), M4(jx, oh + 0.06, jz, ry), PAL.wood.beam);
        add('wood', boxUV(ow, 0.06, T + 0.06, 1), M4(jx, 0.03, jz, ry), PAL.wood.dark);
      }
      const l = (span / 2 + T) - x0;
      if (l > 0.02) put(l, H, x0 + l / 2, H / 2);
    }

    // ── windows: a splayed reveal, a frame, glass, and the daylight it lets in ──
    for (const wn of (o.windows || [])) {
      const ry = SIDES[wn.side] ?? 0;
      const off = (wn.side === 'south' || wn.side === 'north') ? D / 2 : W / 2;
      const ww = wn.w ?? 1.0, wh = wn.h ?? 0.9, wy = wn.y ?? 1.35, at = wn.at ?? 0;
      const c = Math.cos(ry), s = Math.sin(ry);
      const fm = M4(at * c + off * s, wy, -at * s + off * c, ry);
      const a = (b, g, m, col) => add(b, g, fm.clone().multiply(m), col);
      a('wood', boxUV(ww + 0.22, wh + 0.22, 0.12, 1.2), M4(0, 0, 0.06), PAL.wood.beam);
      kit.addGlow(new THREE.BoxGeometry(ww, wh, 0.08), fm.clone().multiply(M4(0, 0, 0.1)).premultiply(base), mixHex(PAL.sky.horizon, PAL.plaster.light, 0.5));
      a('wood', boxUV(0.06, wh, 0.06, 1), M4(0, 0, 0.02), PAL.wood.beam);
      a('wood', boxUV(ww, 0.06, 0.06, 1), M4(0, 0, 0.02), PAL.wood.beam);
      a('wood', boxUV(ww + 0.34, 0.1, 0.3, 1.2), M4(0, -wh / 2 - 0.09, -0.08), PAL.wood.light);        // the sill
      if (wn.shutter !== false) for (const sg of [-1, 1]) {
        const sm = M4(sg * (ww / 2 + ww * 0.28), 0, -0.04, sg * 0.28);
        a('paint', boxUV(ww * 0.52, wh + 0.14, 0.05, 1), sm, wn.shutter || PAL.paint.shutterGreen);
        for (const by of [-wh * 0.28, wh * 0.28]) a('paint', boxUV(ww * 0.5, 0.07, 0.03, 1), sm.clone().multiply(M4(0, by, 0.04)), mixHex(wn.shutter || PAL.paint.shutterGreen, PAL.wood.dark, 0.45));
      }
    }

    // ── the ceiling and its beams ──
    // A room the camera looks DOWN into has no ceiling (DQV PS2's own answer, and the only one that works with a
    // 40-degree follow camera: with a ceiling on, the fade pass ghosted it and every interior frame was brown mud).
    // Instead the walls are capped with a timber plate, so the top of the wall reads as built and not as a cut edge.
    if (o.ceiling === true) add(bucket, boxUV(W + 2 * T, 0.26, D + 2 * T, Tex.worldSize(texName)), M4(0, H + 0.13, 0), PAL.plaster.mid);
    else {
      for (const [w, lx, lz, ry] of [[W + 2 * T, 0, D / 2 + T / 2, 0], [W + 2 * T, 0, -D / 2 - T / 2, 0],
        [D + 2 * T, W / 2 + T / 2, 0, Math.PI / 2], [D + 2 * T, -W / 2 - T / 2, 0, Math.PI / 2]]) {
        add('wood', boxUV(w, 0.16, T + 0.14, 1.2), M4(lx, H + 0.08, lz, ry), PAL.wood.beam);
      }
    }
    if (o.beams !== false) {
      const n = Math.max(2, Math.round(D / 1.35));
      for (let k = 0; k < n; k++) {
        const lz = -D / 2 + (k + 0.5) * (D / n);
        add('wood', boxUV(W + 2 * T, 0.2, 0.24, 1.2), M4(0, H - 0.1, lz), PAL.wood.beam);
      }
      add('wood', boxUV(0.26, 0.26, D + 2 * T, 1.2), M4(0, H - 0.1, 0), PAL.wood.dark);                // the spine
    }
    // skirting, so wall and floor meet in a line instead of a seam
    if (o.skirt !== false) {
      for (const [w, lx, lz, ry] of [[W, 0, D / 2, 0], [W, 0, -D / 2, Math.PI], [D, W / 2, 0, -Math.PI / 2], [D, -W / 2, 0, Math.PI / 2]]) {
        add('wood', boxUV(w, 0.16, 0.08, 1), M4(lx, 0.08, lz, ry), PAL.wood.dark);
      }
    }
    const at = (lx, lz) => toWorld({ x: o.x || 0, z: o.z || 0, rot }, lx, lz);
    return { x: o.x || 0, z: o.z || 0, rot, W, D, H, y, T, at,
      spot(side, a = 0, into = 1.0) {
        const ry = SIDES[side] ?? 0, c = Math.cos(ry), s = Math.sin(ry);
        const off = (side === 'south' || side === 'north') ? D / 2 - into : W / 2 - into;
        const p = at(a * c + off * s, -a * s + off * c);
        return { x: p.x, z: p.z, facing: rot + ry + Math.PI };
      } };
  };

  /** A hearth in a wall: stone surround, a sooty brick back, a mantel, fire irons, and the fire itself. */
  kit.hearth = (x, z, rot = 0, { w = 1.9, h = 1.5, lit = true, kettle = true, y: yy = null } = {}) => {
    const y = yy != null ? +yy : heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    // A fireplace is a HOLE with stone round it: piers up both sides, a bressumer beam across, and the chimney
    // breast above — never one solid slab, which is what it was, and which hid the fire completely.
    const d = 0.7, pier = 0.42;
    for (const s of [-1, 1]) add('stone', boxUV(pier, h + 0.2, d + 0.2, Tex.worldSize('stone')), M4(s * (w / 2 + pier / 2), (h + 0.2) / 2, -0.1), PAL.stone.mid);
    add('stone', boxUV(w + 2 * pier, 0.55, d + 0.2, Tex.worldSize('stone')), M4(0, h + 0.2 + 0.275, -0.1), PAL.stone.mid);   // the chimney breast
    add('brick', boxUV(w, h, 0.26, Tex.worldSize('brick')), M4(0, h / 2, -d / 2 - 0.06), PAL.brick.soot);               // the sooty back
    for (const s of [-1, 1]) add('brick', boxUV(0.2, h, d, Tex.worldSize('brick')), M4(s * (w / 2 - 0.1), h / 2, -0.1), PAL.brick.dark);
    add('brick', boxUV(w, 0.22, d, Tex.worldSize('brick')), M4(0, h - 0.11, -0.1), PAL.brick.soot);                     // the sooty throat
    add('stone', boxUV(w + 2 * pier + 0.3, 0.22, d + 0.4, Tex.worldSize('stone')), M4(0, h + 0.31, 0.0), PAL.stone.light); // the mantel shelf
    add('wood', boxUV(w + 0.26, 0.24, 0.32, 1.2), M4(0, h + 0.08, 0.14), PAL.wood.beam);                                // the oak bressumer
    add('stone', boxUV(w + 2 * pier + 0.4, 0.16, 1.15, Tex.worldSize('stone')), M4(0, 0.08, 0.5), PAL.stone.light);      // the hearthstone
    // logs and the fire
    const r = mulberry(Math.abs((x * 13 + z * 7) | 0) + 3);
    for (let k = 0; k < 4; k++) add('wood', new THREE.CylinderGeometry(0.075, 0.065, 0.62, 6),
      M4((r() - 0.5) * 0.5, 0.16 + (k > 1 ? 0.12 : 0), -0.18 + (r() - 0.5) * 0.2, 0, 0, Math.PI / 2 + (r() - 0.5) * 0.5), PAL.wood.dark);
    if (lit) {
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * TAU, rr = 0.12 + r() * 0.24;
        kit.addGlow(new THREE.ConeGeometry(0.11 + r() * 0.08, 0.34 + r() * 0.36, 6),
          base.clone().multiply(M4(Math.cos(a) * rr, 0.24 + r() * 0.22, -0.16 + Math.sin(a) * rr * 0.5)),
          k % 3 === 0 ? PAL.flower.yellow : k % 3 === 1 ? PAL.paint.gold : PAL.flower.red);
      }
      kit.addGlow(new THREE.SphereGeometry(0.3, 10, 8), base.clone().multiply(M4(0, 0.16, -0.14, 0, 0, 0, 1)), PAL.interior.lamp);
    }
    if (kettle) {
      add('paint', boxUV(0.05, 0.05, w * 0.82, 1), M4(0, h - 0.3, -0.18, 0, 0, Math.PI / 2), PAL.paint.iron);
      add('paint', new THREE.CylinderGeometry(0.018, 0.018, 0.32, 5), M4(0.12, h - 0.46, -0.18), PAL.paint.iron);
      add('paint', new THREE.SphereGeometry(0.16, 10, 8), M4(0.12, h - 0.68, -0.18), PAL.paint.iron);
      add('paint', new THREE.CylinderGeometry(0.07, 0.09, 0.07, 9), M4(0.12, h - 0.52, -0.18), PAL.paint.iron);
    }
    kit.contact(x, z + 0.3, 0.9, 0.5, { rx: (w + 0.8) / 2, rz: 0.8, rot });
    return { x, z, y, w, h };
  };

  /** A plank table on trestle legs. `top` = the height of the top. */
  kit.roomTable = (x, z, rot = 0, { w = 1.8, d = 1.0, top = 0.78, cloth = null, things = [], y: yy = null } = {}) => {
    const y = yy != null ? +yy : heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const n = Math.max(3, Math.round(d / 0.26));
    for (let k = 0; k < n; k++) add('wood', boxUV(w, 0.07, d / n - 0.012, 1.0), M4(0, top - 0.035, -d / 2 + (k + 0.5) * (d / n)), k % 2 ? PAL.wood.light : PAL.wood.mid);
    add('wood', boxUV(w + 0.06, 0.05, d + 0.06, 1.0), M4(0, top - 0.09, 0), PAL.wood.mid);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood', boxUV(0.1, top - 0.1, 0.1, 1.2), M4(sx * (w / 2 - 0.16), (top - 0.1) / 2, sz * (d / 2 - 0.14)), PAL.wood.beam);
    for (const sx of [-1, 1]) add('wood', boxUV(0.08, 0.08, d - 0.28, 1), M4(sx * (w / 2 - 0.16), 0.22, 0), PAL.wood.beam);
    if (cloth) add('paint', boxUV(w + 0.2, 0.03, d + 0.2, 1), M4(0, top + 0.01, 0), cloth);
    for (const t of things) {
      const tx = t.x ?? 0, tz = t.z ?? 0;
      if (t.kind === 'bowl') { add('tile', new THREE.SphereGeometry(0.13, 12, 8, 0, TAU, 0, Math.PI / 2), M4(tx, top + 0.13, tz, 0, Math.PI), t.color || PAL.tile.light); add('paint', new THREE.CircleGeometry(0.11, 12), M4(tx, top + 0.07, tz, 0, -Math.PI / 2), t.fill || PAL.thatch.light); }
      else if (t.kind === 'loaf') { add('thatch', new THREE.SphereGeometry(0.16, 10, 8), M4(tx, top + 0.08, tz, t.rot || 0, 0, 0, 1), PAL.thatch.mid); }
      else if (t.kind === 'candle') { add('paint', new THREE.CylinderGeometry(0.035, 0.04, 0.22, 7), M4(tx, top + 0.11, tz), PAL.plaster.light); kit.addGlow(new THREE.ConeGeometry(0.035, 0.11, 6), base.clone().multiply(M4(tx, top + 0.28, tz)), PAL.flower.yellow); }
      else if (t.kind === 'cup') { add('tile', new THREE.CylinderGeometry(0.06, 0.05, 0.11, 9), M4(tx, top + 0.055, tz), t.color || PAL.tile.light); }
    }
    kit.contact(x, z, Math.max(w, d) * 0.45, 0.55, { rx: w * 0.5, rz: d * 0.5, rot });
    return { x, z, top };
  };

  /** A chair. `big` is Father's, and it is bigger, exactly as WORLD-BIBLE §3 says. */
  kit.chair = (x, z, rot = 0, { big = false, seat = 0.46, color = null, y: yy = null } = {}) => {
    const y = yy != null ? +yy : heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const s = big ? 1.22 : 1, w = 0.44 * s, dd = 0.42 * s, sy = seat * (big ? 1.06 : 1);
    add('wood', boxUV(w, 0.07, dd, 1), M4(0, sy, 0), color || PAL.wood.light);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood', boxUV(0.06 * s, sy, 0.06 * s, 1.2), M4(sx * (w / 2 - 0.05), sy / 2, sz * (dd / 2 - 0.05)), PAL.wood.beam);
    for (const sx of [-1, 1]) add('wood', boxUV(0.07 * s, 0.62 * s, 0.07 * s, 1.2), M4(sx * (w / 2 - 0.05), sy + 0.31 * s, -dd / 2 + 0.05), PAL.wood.beam);
    for (const k of [0.22, 0.44]) add('wood', boxUV(w - 0.08, 0.08 * s, 0.05, 1), M4(0, sy + k * s, -dd / 2 + 0.05), color || PAL.wood.mid);
    if (big) {
      add('wood', boxUV(w - 0.06, 0.09, 0.06, 1), M4(0, sy + 0.64, -dd / 2 + 0.05), PAL.wood.light);
      for (const sx of [-1, 1]) add('wood', boxUV(0.06, 0.06, dd - 0.1, 1), M4(sx * (w / 2 - 0.03), sy + 0.3, 0), PAL.wood.beam);
    }
    kit.contact(x, z, 0.3 * s, 0.5);
    return { x, z, big };
  };

  /** A stool — an inn is mostly stools. */
  kit.stool = (x, z, rot = 0, { h = 0.44, y: yy = null } = {}) => {
    const y = yy != null ? +yy : heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', new THREE.CylinderGeometry(0.2, 0.19, 0.07, 12), M4(0, h, 0), PAL.wood.light);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + rot; add('wood', new THREE.CylinderGeometry(0.035, 0.045, h, 6), M4(Math.cos(a) * 0.13, h / 2, Math.sin(a) * 0.13, 0, 0.12 * Math.cos(a), -0.12 * Math.sin(a)), PAL.wood.beam); }
    kit.contact(x, z, 0.22, 0.5);
  };

  /** A bed with a blanket and a pillow. Local +z is the foot. */
  kit.bed = (x, z, rot = 0, { w = 1.0, l = 1.9, blanket = null, small = false, y: yy = null } = {}) => {
    const y = yy != null ? +yy : heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const fy = small ? 0.3 : 0.36;
    for (const sz of [-1, 1]) add('wood', boxUV(w + 0.14, sz < 0 ? 0.85 : 0.5, 0.12, 1.2), M4(0, (sz < 0 ? 0.85 : 0.5) / 2, sz * (l / 2 + 0.06)), PAL.wood.mid);
    for (const sx of [-1, 1]) add('wood', boxUV(0.1, 0.24, l, 1.2), M4(sx * (w / 2 + 0.05), fy - 0.1, 0), PAL.wood.beam);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood', boxUV(0.12, fy, 0.12, 1.2), M4(sx * (w / 2 + 0.03), fy / 2, sz * (l / 2 + 0.02)), PAL.wood.beam);
    add('thatch', boxUV(w, 0.2, l - 0.1, 1), M4(0, fy + 0.1, 0), PAL.thatch.pale);                              // the straw mattress
    add('paint', boxUV(w + 0.08, 0.14, l * 0.62, 1), M4(0, fy + 0.26, l * 0.16), blanket || PAL.cloth.red);      // the blanket
    add('paint', boxUV(w + 0.09, 0.05, 0.22, 1), M4(0, fy + 0.33, l * 0.16 - l * 0.31), mixHex(blanket || PAL.cloth.red, PAL.cloth.cream, 0.6));
    add('paint', new THREE.SphereGeometry(0.22, 12, 8), M4(0, fy + 0.3, -l / 2 + 0.3, 0, 0, 0, 1), PAL.cloth.cream);
    kit.contact(x, z, 0.8, 0.6, { rx: w * 0.64, rz: l * 0.56, rot });
    return { x, z };
  };

  /** A ladder to the loft. `h` is the height it reaches; it leans back `lean` at the top. */
  kit.ladder = (x, z, rot = 0, { h = 2.2, w = 0.5, lean = 0.12, y: yy = null } = {}) => {
    const y = yy != null ? +yy : heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const L = Math.hypot(h, lean);
    for (const sx of [-1, 1]) add('wood', boxUV(0.09, L, 0.07, 1.2), M4(sx * w / 2, h / 2, lean / 2, 0, Math.atan2(lean, h)), PAL.wood.mid);
    const n = Math.max(3, Math.round(h / 0.3));
    for (let k = 1; k <= n; k++) { const t = k / (n + 1); add('wood', new THREE.CylinderGeometry(0.035, 0.035, w + 0.04, 7), M4(0, h * t, lean * t, 0, 0, Math.PI / 2), PAL.wood.light); }
    kit.contact(x, z, 0.3, 0.45, { rx: w * 0.7, rz: 0.3, rot });
  };

  /** A loft deck: joists, boards, and a rail along its open edge (local -z is the open side). */
  kit.loftDeck = (x, z, rot = 0, { w = 4.0, d = 2.6, y: ly = 2.05, rail = true } = {}) => {
    const y = heightAt(x, z) + ly, base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const n = Math.max(3, Math.round(w / 0.42));
    for (let k = 0; k < n; k++) add('wood', boxUV(w / n - 0.015, 0.08, d, 1.0), M4(-w / 2 + (k + 0.5) * (w / n), 0, 0), k % 2 ? PAL.wood.light : PAL.wood.mid);
    add('wood', boxUV(w + 0.1, 0.16, 0.2, 1.2), M4(0, -0.12, -d / 2 + 0.1), PAL.wood.beam);
    add('wood', boxUV(w + 0.1, 0.16, 0.2, 1.2), M4(0, -0.12, d / 2 - 0.1), PAL.wood.beam);
    if (rail) {
      for (const sx of [-1, 1]) add('wood', boxUV(0.1, 0.62, 0.1, 1.2), M4(sx * (w / 2 - 0.08), 0.35, -d / 2 + 0.08), PAL.wood.beam);
      add('wood', boxUV(w - 0.1, 0.09, 0.1, 1.2), M4(0, 0.62, -d / 2 + 0.08), PAL.wood.light);
      const m = Math.max(2, Math.round(w / 0.55));
      for (let k = 1; k < m; k++) add('wood', boxUV(0.06, 0.58, 0.06, 1), M4(-w / 2 + k * (w / m), 0.33, -d / 2 + 0.08), PAL.wood.mid);
    }
    return { x, z, y };
  };

  /** A chest: oak, iron-banded, with a lid that stands a little open when it has been found. */
  kit.chestBox = (x, z, rot = 0, { w = 0.8, h = 0.52, d = 0.5, open = 0, color = null, y: yy = null } = {}) => {
    const y = yy != null ? +yy : heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(w, h, d, 0.9), M4(0, h / 2, 0), color || PAL.wood.mid);
    for (const sx of [-1, 1]) add('paint', boxUV(0.07, h + 0.02, d + 0.02, 1), M4(sx * (w / 2 - 0.1), h / 2, 0), PAL.paint.iron);
    // the lid, hinged along the back edge: `open` 0 = shut, 1 = thrown right back
    const ang = Math.max(0, Math.min(1, open)) * 1.15;
    const hinge = M4(0, h, -d / 2).multiply(M4(0, 0, 0, 0, -ang));
    add('wood', boxUV(w, 0.12, d, 0.9), hinge.clone().multiply(M4(0, 0.06, d / 2)), color || PAL.wood.light);
    for (const sx of [-1, 1]) add('paint', boxUV(0.07, 0.14, d + 0.02, 1), hinge.clone().multiply(M4(sx * (w / 2 - 0.1), 0.06, d / 2)), PAL.paint.iron);
    add('paint', boxUV(0.18, 0.2, 0.07, 1), M4(0, h - 0.06, d / 2 + 0.02), PAL.paint.gold);
    kit.contact(x, z, 0.42, 0.6, { rx: w * 0.6, rz: d * 0.65, rot });
    return { x, z };
  };

  /** A dresser with plates on it — every DQ kitchen has one. */
  kit.dresser = (x, z, rot = 0, { w = 1.5, h = 1.9, d = 0.45, y: yy = null } = {}) => {
    const y = yy != null ? +yy : heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(w, 0.86, d, 0.9), M4(0, 0.43, 0), PAL.wood.mid);
    for (const sx of [-1, 1]) { add('wood', boxUV(w / 2 - 0.08, 0.34, 0.06, 0.9), M4(sx * w / 4, 0.62, d / 2 + 0.02), PAL.wood.light); add('paint', new THREE.SphereGeometry(0.045, 8, 6), M4(sx * w / 4, 0.62, d / 2 + 0.07), PAL.paint.iron); }
    add('wood', boxUV(w, 0.06, d, 0.9), M4(0, 0.89, 0), PAL.wood.light);
    for (const sx of [-1, 1]) add('wood', boxUV(0.07, h - 0.9, d - 0.08, 0.9), M4(sx * (w / 2 - 0.035), 0.9 + (h - 0.9) / 2, -0.04), PAL.wood.mid);
    add('wood', boxUV(w, 0.06, d - 0.08, 0.9), M4(0, h, -0.04), PAL.wood.mid);
    for (const k of [0.45, 0.8]) {
      add('wood', boxUV(w - 0.14, 0.05, d - 0.1, 0.9), M4(0, 0.9 + (h - 0.9) * k, -0.04), PAL.wood.light);
      for (let i = -1; i <= 1; i++) add('tile', new THREE.CylinderGeometry(0.15, 0.15, 0.025, 14), M4(i * 0.4, 0.9 + (h - 0.9) * k + 0.16, -0.16, 0, 0, Math.PI / 2), i === 0 ? PAL.tile.light : PAL.plaster.light);
    }
    kit.contact(x, z, 0.55, 0.6, { rx: w * 0.55, rz: d * 0.8, rot });
  };

  /** A shelf of pots and books against a wall. */
  kit.shelf = (x, z, rot = 0, { w = 1.3, y: sy = 1.45, n = 2, seed = 5, y0 = null } = {}) => {
    const y = y0 != null ? +y0 : heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const r = mulberry(seed);
    for (let k = 0; k < n; k++) {
      const ly = sy + k * 0.46;
      add('wood', boxUV(w, 0.06, 0.28, 0.9), M4(0, ly, 0), PAL.wood.light);
      for (const sx of [-1, 1]) add('wood', boxUV(0.06, 0.16, 0.24, 1), M4(sx * (w / 2 - 0.06), ly - 0.1, 0), PAL.wood.beam);
      let cx = -w / 2 + 0.16;
      while (cx < w / 2 - 0.16) {
        const pick = r();
        if (pick < 0.45) { const hh = 0.18 + r() * 0.12; add('tile', new THREE.CylinderGeometry(0.08, 0.06, hh, 10), M4(cx, ly + 0.03 + hh / 2, 0), r() < 0.5 ? PAL.tile.mid : PAL.tile.light); cx += 0.2; }
        else if (pick < 0.8) { for (let b2 = 0; b2 < 3; b2++) { add('paint', boxUV(0.05, 0.24, 0.17, 1), M4(cx + b2 * 0.06, ly + 0.15, 0, 0, 0, b2 === 2 ? 0.2 : 0), [PAL.cloth.red, PAL.cloth.blue, PAL.cloth.green][b2 % 3]); } cx += 0.26; }
        else { add('paint', new THREE.SphereGeometry(0.1, 10, 8), M4(cx, ly + 0.12, 0), PAL.flower.yellow); cx += 0.24; }
      }
    }
  };

  /** A rag rug: an oval of warm colour on the boards. */
  kit.rug = (x, z, rot = 0, { w = 2.0, d = 1.3, color = PAL.cloth.red, seed = 3, y: yy = null } = {}) => {
    const y = yy != null ? +yy : heightAt(x, z), base = M4(x, y, z, rot);
    const r = mulberry(seed);
    for (let k = 0; k < 4; k++) {
      const t = 1 - k * 0.22;
      addTo('paint', new THREE.CircleGeometry(0.5, 22).scale(w * t, d * t, 1).rotateX(-Math.PI / 2),
        base.clone().multiply(M4(0, 0.012 + k * 0.004, 0)), k % 2 ? mixHex(color, PAL.cloth.cream, 0.45) : mixHex(color, PAL.wood.dark, 0.2 + r() * 0.1));
    }
    kit.contact(x, z, Math.max(w, d) * 0.5, 0.18, { rx: w * 0.52, rz: d * 0.52, rot, lift: 0.02 });
  };

  /** A barrel-and-plank counter — the inn's bar, with a row of tankards. */
  kit.counter = (x, z, rot = 0, { w = 3.0, h = 1.02, d = 0.7, y: yy = null } = {}) => {
    const y = yy != null ? +yy : heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(w, h - 0.12, d, 0.9, [Math.max(3, Math.round(w)), 3, 1]), M4(0, (h - 0.12) / 2, 0), PAL.wood.mid);
    add('wood', boxUV(w + 0.16, 0.12, d + 0.22, 0.9), M4(0, h - 0.06, 0), PAL.wood.light);
    for (const sx of [-1, 0, 1]) add('wood', boxUV(0.1, h - 0.2, 0.08, 1), M4(sx * (w / 2 - 0.2), (h - 0.2) / 2, d / 2 + 0.02), PAL.wood.beam);
    for (let k = 0; k < 4; k++) add('tile', new THREE.CylinderGeometry(0.075, 0.065, 0.16, 10), M4(-w / 2 + 0.4 + k * 0.42, h + 0.08, -0.12), PAL.stone.light);
    kit.contact(x, z, 0.8, 0.6, { rx: w * 0.52, rz: d * 0.75, rot });
    return { x, z, h };
  };

  /** A stack of kegs. */
  kit.kegs = (x, z, rot = 0, { n = 3, seed = 7, y: yy = null } = {}) => {
    const y = yy != null ? +yy : heightAt(x, z), base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const r = mulberry(seed);
    for (let k = 0; k < n; k++) {
      const row = k < 2 ? 0 : 1, i = k < 2 ? k : k - 2;
      const lx = (i - 0.5) * 0.66 + (row ? 0.33 : 0), ly = 0.3 + row * 0.6, lz = (r() - 0.5) * 0.1;
      add('wood', new THREE.CylinderGeometry(0.28, 0.28, 0.6, 12), M4(lx, ly, lz, 0, 0, Math.PI / 2), PAL.wood.mid);
      for (const e of [-1, 1]) add('paint', new THREE.TorusGeometry(0.285, 0.025, 4, 14), M4(lx + e * 0.2, ly, lz, 0, Math.PI / 2), PAL.paint.iron);
    }
    kit.contact(x, z, 0.7, 0.6, { rx: 0.8, rz: 0.45, rot });
  };

  /** A lantern hanging from a ceiling beam — the one warm point of light in a dark room. */
  kit.roomLamp = (x, z, y0 = 2.2, { drop = 0.35, floor = null } = {}) => {
    const y = (floor != null ? +floor : heightAt(x, z)) + y0, base = M4(x, y, z);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('paint', new THREE.CylinderGeometry(0.012, 0.012, drop, 5), M4(0, drop / 2, 0), PAL.paint.iron);
    add('paint', new THREE.ConeGeometry(0.2, 0.16, 8), M4(0, -0.02, 0), PAL.paint.iron);
    kit.addGlow(new THREE.SphereGeometry(0.1, 10, 8), base.clone().multiply(M4(0, -0.15, 0, 0, 0, 0, 1)), PAL.flower.yellow);
    kit.addGlow(new THREE.ConeGeometry(0.055, 0.15, 7), base.clone().multiply(M4(0, -0.06, 0)), mixHex(PAL.flower.yellow, PAL.plaster.light, 0.4));
    for (let k = 0; k < 4; k++) add('paint', boxUV(0.022, 0.24, 0.022, 1), M4(Math.cos(k * TAU / 4) * 0.115, -0.15, Math.sin(k * TAU / 4) * 0.115), PAL.paint.iron);
    add('paint', new THREE.TorusGeometry(0.115, 0.014, 4, 12), M4(0, -0.27, 0, 0, Math.PI / 2), PAL.paint.iron);
    return { x, y: y - 0.16, z };
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // merge: the kit's own meshes go in with the buckets; doors and signs animate from kit.update
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // the see-through, per BUILDING                                                                (P05 gap #2)
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  const GT = { lens: new THREE.Vector3(), lo: new THREE.Vector3(), hi: new THREE.Vector3() };

  /** Merge each building's geometry into its own meshes, and measure its box in its OWN frame (not an AABB). */
  const buildBuildingMeshes = () => {
    const out = [];
    for (const b of BUILT) {
      if (b.done) continue;
      b.done = true;
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (const [bucket, list] of b.geos) {
        if (!list.length) continue;
        const geo = mergeGeometries(list);
        if (!geo) continue;
        // the OBB: every vertex back through the building's own rotation, so a house turned 38 degrees to the
        // green is measured as the 9 x 6 box it IS and not as the 12-wide axis-aligned box it sits in. That box
        // is what the "is the lens inside the shell" test uses, and the old one had corners full of fresh air.
        const p = geo.attributes.position.array;
        for (let i = 0; i < p.length; i += 3) {
          const dx = p[i] - b.x, dz = p[i + 2] - b.z;
          const lx = dx * c - dz * s, lz = dx * s + dz * c, ly = p[i + 1];
          if (lx < x0) x0 = lx; if (lx > x1) x1 = lx;
          if (ly < y0) y0 = ly; if (ly > y1) y1 = ly;
          if (lz < z0) z0 = lz; if (lz > z1) z1 = lz;
        }
        const mesh = new THREE.Mesh(geo, bldSurface(bucket));
        mesh.name = `bld:${b.id}:${bucket}`;
        mesh.castShadow = bucket !== 'paint' && bucket !== 'glow';
        mesh.receiveShadow = bucket !== 'glow';
        mesh.userData.camIgnore = true;                   // P09's pass leaves buildings to this file
        scene.add(mesh);
        b.meshes.push(mesh); b.parts.push(geo); out.push(mesh);
      }
      b.geos.clear();
      for (const [, cl] of b.cloth) {                      // the shop's awning ghosts with the shop
        if (!cl.geos.length) continue;
        const mat = makeToon({ map: cl.tex, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: false },
          Object.assign({}, TOON_PRESETS.cloth));
        const mesh = new THREE.Mesh(mergeGeometries(cl.geos.map(g => (g.index ? g.toNonIndexed() : g))), mat);
        mesh.name = `bld:${b.id}:cloth`; mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.camIgnore = true;
        scene.add(mesh); b.meshes.push(mesh); out.push(mesh);
      }
      b.cloth.clear();
      // the room you see through its own open door, and the firelight in it: inside the shell, so they belong to
      // the shell — they used to be one village-wide mesh that P09's pass could (and did) drop to alpha 0 alone
      if (b.interior.length) {
        const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
        const mesh = new THREE.Mesh(mergeGeometries(b.interior), mat);
        mesh.name = `bld:${b.id}:room`; mesh.castShadow = false; mesh.receiveShadow = false;
        mesh.userData.camIgnore = true;
        scene.add(mesh); b.meshes.push(mesh); out.push(mesh);
        b.interior.length = 0;
      }
      if (b.glow.length) {
        const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
        const mesh = new THREE.Mesh(mergeGeometries(b.glow), mat);
        mesh.name = `bld:${b.id}:glow`; mesh.castShadow = false; mesh.receiveShadow = false;
        mesh.userData.camIgnore = true;
        scene.add(mesh); b.meshes.push(mesh); out.push(mesh);
        b.glow.length = 0;
      }
      if (!Number.isFinite(x0)) { b.lo = null; continue; }
      b.lo = { x: x0, y: y0, z: z0 };
      b.hi = { x: x1, y: y1, z: z1 };
      b.span = Math.max(x1 - x0, z1 - z0);
    }
    return out;
  };

  /** The depth pre-pass and the ink line — built the first time a house actually goes to glass, never before. */
  const ghostAids = (b) => {
    if (b.depth || !b.parts.length) return;
    try {
      const merged = b.parts.length === 1 ? b.parts[0] : mergeGeometries(b.parts);
      if (!merged) return;
      // 1. depth only: one clean surface instead of four stacked translucent walls
      const dm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true, fog: false });
      dm.depthFunc = THREE.LessEqualDepth;
      const depth = new THREE.Mesh(merged, dm);
      depth.name = `bld:${b.id}:ghost-depth`;
      depth.castShadow = false; depth.receiveShadow = false; depth.frustumCulled = false;
      depth.visible = false; depth.userData.camIgnore = true;
      scene.add(depth); b.depth = depth;
      // 2. the ink line, kept: a faded house still reads as a house and not as a smear
      const im = new THREE.MeshBasicMaterial({ color: C3(PAL.outline.prop), side: THREE.BackSide,
        transparent: true, opacity: GH.ink, depthWrite: false, fog: false });
      im.depthFunc = THREE.LessEqualDepth;
      const ink = new THREE.Mesh(hullGeometry(merged, 0.045), im);
      ink.name = `bld:${b.id}:ghost-ink`;
      ink.castShadow = false; ink.receiveShadow = false; ink.frustumCulled = false;
      ink.visible = false; ink.userData.camIgnore = true;
      scene.add(ink); b.ink = ink;
    } catch (e) { reportError('building ghost aids', e); }
  };

  const boxDist = (px, py, pz, lo, hi) => {
    const dx = Math.max(lo.x - px, 0, px - hi.x), dy = Math.max(lo.y - py, 0, py - hi.y), dz = Math.max(lo.z - pz, 0, pz - hi.z);
    return Math.hypot(dx, dy, dz);
  };
  /** Slab test: does the segment a->b cross this box, grown by `pad`? */
  const segBox = (ax, ay, az, bx, by, bz, lo, hi, pad) => {
    let t0 = 0, t1 = 1;
    const d = [bx - ax, by - ay, bz - az], o = [ax, ay, az];
    const mn = [lo.x - pad, lo.y - pad, lo.z - pad], mx = [hi.x + pad, hi.y + pad, hi.z + pad];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-7) { if (o[k] < mn[k] || o[k] > mx[k]) return false; continue; }
      let ta = (mn[k] - o[k]) / d[k], tb = (mx[k] - o[k]) / d[k];
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    return true;
  };

  const setMat = (mesh, ghost, a, order) => {
    const m = mesh && mesh.material;
    if (!m || Array.isArray(m)) return;
    if (m.transparent !== ghost) m.transparent = ghost;
    m.opacity = a;
    m.depthWrite = !ghost;
    m.depthFunc = THREE.LessEqualDepth;
    mesh.renderOrder = ghost ? order : 0;
  };

  /**
   * One alpha for the whole house, every frame: its meshes, its door leaves, its sign, its awning, its wheel.
   * Drawn last, depth first, ink over the top — and NEVER below GH.min, so a house you walk behind turns to
   * glass and never to nothing.
   */
  const ghostUpdate = (dt, camera, focus) => {
    if (!BUILT.length) return;
    const step = Math.max(0, Math.min(0.06, dt || 0));
    const live = !!(camera && focus && Number.isFinite(focus.x));
    if (live) { camera.updateMatrixWorld(); GT.lens.setFromMatrixPosition(camera.matrixWorld); }
    const hx = live ? focus.x : 0, hy = (live ? (focus.y || 0) : 0) + 0.85, hz = live ? focus.z : 0;
    const fading = [];
    for (const b of BUILT) {
      if (!b.lo) continue;
      let want = false;
      b.why = '';
      if (live) {
        const c = Math.cos(b.rot), s = Math.sin(b.rot);
        const dxl = GT.lens.x - b.x, dzl = GT.lens.z - b.z;
        const lx = dxl * c - dzl * s, lz = dxl * s + dzl * c, ly = GT.lens.y;
        const dxh = hx - b.x, dzh = hz - b.z;
        const tx = dxh * c - dzh * s, tz = dxh * s + dzh * c;
        b.dist = Math.hypot(dxl, dzl);
        const heroIn = tx > b.lo.x - 0.4 && tx < b.hi.x + 0.4 && tz > b.lo.z - 0.4 && tz < b.hi.z + 0.4;
        if (!heroIn && lx > b.lo.x - 0.15 && lx < b.hi.x + 0.15 && ly > b.lo.y - 0.2 && ly < b.hi.y + 0.5 &&
            lz > b.lo.z - 0.15 && lz < b.hi.z + 0.15) { want = true; b.why = 'lens inside it'; }
        else if (segBox(lx, ly, lz, tx, hy, tz, b.lo, b.hi, GH.pad)) { want = true; b.why = 'covering him'; }
        else if (boxDist(lx, ly, lz, b.lo, b.hi) < GH.lens) { want = true; b.why = 'pressed against the lens'; }
      }
      if (want) b.hit = GH.hold; else b.hit = Math.max(0, b.hit - step);
      const target = b.hit > 0 ? GH.alpha : 1;
      if (b.alpha !== target) {
        const sp = step / ((target < b.alpha ? GH.outMs : GH.inMs) / 1000);
        b.alpha += Math.max(-sp, Math.min(sp, target - b.alpha));
        if (Math.abs(target - b.alpha) < 0.01) b.alpha = target;
      }
      if (b.alpha < 0.999) fading.push(b);
    }
    fading.sort((p, q) => q.dist - p.dist);                 // far to near: ghosts layer correctly
    let rank = 0;
    for (const b of BUILT) {
      const i = fading.indexOf(b);
      const ghost = i >= 0 && i < GH.most + 8;
      const a = ghost ? Math.max(GH.min, Math.min(1, b.alpha)) : 1;
      const order = 220 + (ghost ? rank++ : 0) * 3;
      if (ghost !== b.ghosting || ghost) {
        for (const m of b.meshes) setMat(m, ghost, a, order + 1);
        for (const m of b.extra) setMat(m, ghost, a, order + 1);
        if (ghost) {
          ghostAids(b);
          if (b.depth) { b.depth.visible = true; b.depth.renderOrder = order; }
          if (b.ink) { b.ink.visible = true; b.ink.renderOrder = order + 2; b.ink.material.opacity = Math.min(1, a * (GH.ink / GH.alpha)); }
        } else {
          if (b.depth) b.depth.visible = false;
          if (b.ink) b.ink.visible = false;
        }
        b.ghosting = ghost;
      }
    }
  };

  /** __DQ.state().buildings.ghosts — what is glass right now, and why. A critic must be able to read this. */
  kit.buildingGhosts = () => BUILT.filter(b => b.lo).map(b => ({
    id: b.id, kind: b.kind, alpha: +b.alpha.toFixed(3), ghost: b.alpha < 0.999,
    why: b.why || (b.alpha < 0.999 ? 'easing back' : ''), dist: +b.dist.toFixed(2),
    meshes: b.meshes.length + b.extra.length, span: b.span ? +b.span.toFixed(1) : 0,
  }));
  /** Tune the building see-through live (a demo control): {alpha, min, outMs, inMs, hold, pad, lens}. */
  kit.ghostTune = (o = {}) => {
    for (const k of ['alpha', 'min', 'max', 'ink', 'outMs', 'inMs', 'hold', 'pad', 'lens', 'most']) if (Number.isFinite(+o[k])) GH[k] = +o[k];
    return Object.assign({}, GH);
  };

  const flushBuildings = () => {
    const out = [];
    try { out.push(...buildBuildingMeshes()); } catch (e) { reportError('building meshes', e); }
    for (const [key, c] of CLOTH) {
      if (!c.geos.length) continue;
      const mat = makeToon({ map: c.tex, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: false },
        Object.assign({}, TOON_PRESETS.cloth), [See.patch]);
      const mesh = new THREE.Mesh(mergeGeometries(c.geos.map(g => { const q = g.index ? g.toNonIndexed() : g; return q; })), mat);
      mesh.name = 'cloth-' + key.split('|')[0]; mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh); out.push(mesh);
      c.geos.length = 0;
    }
    CLOTH.clear();
    if (FLAGS.length) {
      let sum = 0; for (const g of FLAGS) { const p = g.attributes.position; sum += p.getY(0); }
      const mean = sum / FLAGS.length;
      const mat = makeToon({ vertexColors: true, side: THREE.DoubleSide }, Object.assign({}, TOON_PRESETS.cloth, { wind: -0.05, windBase: mean + 0.05 }), [See.patch]);
      const mesh = new THREE.Mesh(mergeGeometries(FLAGS), mat);
      mesh.name = 'bunting'; mesh.castShadow = false; mesh.receiveShadow = true;
      scene.add(mesh); out.push(mesh);
      FLAGS.length = 0;
    }
    if (GLOW.length) {
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
      mat.onBeforeCompile = (sh) => See.patch(sh);
      mat.customProgramCacheKey = () => 'bldglow|see';
      const mesh = new THREE.Mesh(mergeGeometries(GLOW), mat);
      mesh.name = 'roomglow'; mesh.castShadow = false; mesh.receiveShadow = false;
      scene.add(mesh); out.push(mesh);
      GLOW.length = 0;
    }
    if (INTERIOR.length) {
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
      mat.onBeforeCompile = (sh) => See.patch(sh);
      mat.customProgramCacheKey = () => 'bldinterior|see';        // P09's fade pass looks for |see| in the key
      const mesh = new THREE.Mesh(mergeGeometries(INTERIOR), mat);
      mesh.name = 'interiors'; mesh.castShadow = false; mesh.receiveShadow = false;
      scene.add(mesh); out.push(mesh);
      INTERIOR.length = 0;
    }
    if (DOORS.length && !doorMeshes.length) out.push(...buildDoors());
    kit.counts.doors = DOORS.length;
    kit.counts.signs = BOARDS.length;
    return out;
  };

  const baseFlush = kit.flush;
  kit.flush = () => {
    const a = (() => { try { return baseFlush() || []; } catch (e) { reportError('kit.flush', e); return []; } })();
    let b = [];
    try { b = flushBuildings(); } catch (e) { reportError('buildings flush', e); }
    return [...a, ...b];
  };

  const baseUpdate = kit.update;
  kit.update = (t, dt, camera, focus) => {
    try { baseUpdate(t, dt, camera, focus); } catch (e) { reportError('kit.update', e); }
    try { kit.doorsUpdate(dt, focus); } catch (e) { reportError('buildings doors', e); }
    try { ghostUpdate(dt, camera, focus); } catch (e) { reportError('buildings see-through', e); }
    for (const s of SIGNS) s.pivot.rotation.x = Math.sin(t * 0.9 + s.ph) * 0.045 + Math.sin(t * 2.3 + s.ph) * 0.012;
  };

  /** What the buildings did, for __DQ.state() and the demo. */
  kit.buildingState = () => ({
    buildings: (kit.buildings || []).map(b => ({ id: b.id, kind: b.kind, x: +b.x.toFixed(2), z: +b.z.toFixed(2) })),
    doors: DOORS.map(d => ({ id: d.id, open: +d.amount.toFixed(2), opens: d.opens })),
    signs: BOARDS.length,
    // the see-through, per building: one alpha each, never 0 (P05 gap #2)
    fade: { alpha: GH.alpha, min: GH.min, grouped: 'per building' },
    ghosts: kit.buildingGhosts().filter(g => g.ghost),
    ghostable: BUILT.filter(b => b.lo).length,
  });

  return kit;
}

export default buildingRecipes;
