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
import { makeToon, TOON_PRESETS, See } from './toon.js';
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
  const { scene, heightAt, ao, animators, addTo } = kit;

  // ── this kit's own merged meshes (flushed with the buckets) ────────────────────────────────────────────────
  const CLOTH = new Map();            // texture key -> {tex, geos: []}    awnings, bunting, stall roofs
  const INTERIOR = [];                // the dark warm room you see through an open door
  const DOORS = [];                   // every registered door leaf group
  const SIGNS = [];                   // hanging boards (each swings, so each is its own small mesh)
  const BOARDS = [];                  // sign board geometries waiting for their pivot groups
  let signAtlas = null;

  const beam = PAL.wood.beam;
  const woodMat = () => kit.seeSurface('wood', { vertexColors: true });
  const paintMat = () => (kit._bldPaint || (kit._bldPaint = makeToon({ vertexColors: true }, {}, [See.patch])));

  /** Lowest terrain under a (rotated) footprint, minus a whisker: nothing floats, nothing shows daylight beneath. */
  const padY = (o, W, D) => {
    let m = Infinity;
    for (const [lx, lz] of [[0, 0], [-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], [0, D / 2], [0, -D / 2], [-W / 2, 0], [W / 2, 0]]) {
      const p = toWorld(o, lx, lz);
      m = Math.min(m, heightAt(p.x, p.z));
    }
    return m - 0.05;
  };

  const clothGeos = (base, stripe, scallop, S = 128) => {
    const key = `${base}|${stripe || '-'}|${scallop ? 1 : 0}|${S}`;
    if (!CLOTH.has(key)) CLOTH.set(key, { tex: Tex.cloth(base, { stripe, scallop, S }), geos: [] });
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
    };
    DOORS.push(door);
    return door;
  };

  kit.doors = DOORS;
  kit.doorAt = (id) => DOORS.find(d => d.id === id) || null;
  /** Force a door open (1), shut (0) or back to automatic (null) — demos and cutscenes. */
  kit.setDoor = (id, v) => { const d = kit.doorAt(id); if (d) d.force = v == null ? null : Math.max(0, Math.min(1, +v)); return !!d; };
  kit.onDoor = null;

  let doorMeshes = [];
  const buildDoors = () => {
    const groups = new Map();
    for (const d of DOORS) {
      const key = `${d.style}|${d.color}`;
      if (!groups.has(key)) groups.set(key, { style: d.style, color: d.color, leaves: [] });
      for (const lf of d.leaves) groups.get(key).leaves.push({ door: d, lf });
    }
    const made = [];
    for (const g of groups.values()) {
      const geo = leafGeometry(g.style, g.color);
      const mesh = new THREE.InstancedMesh(geo, woodMat(), g.leaves.length);
      mesh.name = 'door-' + g.style; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      g.leaves.forEach((entry, i) => { entry.lf.mesh = mesh; entry.lf.index = i; });
      scene.add(mesh);
      made.push(mesh);
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
        lf.mesh.setMatrixAt(lf.index, dm.premultiply(lf.m));
        lf.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  };

  /**
   * Doors open as you walk up to them and shut behind you (a little spring, so they land with a knock).
   * Wired into kit.update, so every map that calls kit.update(t, dt, camera, focus) gets it.
   */
  kit.doorsUpdate = (dt, focus) => {
    if (!DOORS.length) return;
    const step = Math.max(0, Math.min(0.06, dt || 0));
    for (const d of DOORS) {
      let want = 0;
      if (d.force != null) want = d.force;
      else if (focus) {
        const dx = focus.x - d.x, dz = focus.z - d.z, dist = Math.hypot(dx, dz);
        const front = dist > 1e-4 ? (dx * d.nx + dz * d.nz) / dist : 1;
        if (dist < d.reach && front > -0.35) want = 1;
      }
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
   * What you see through an open door: a shallow, dark, faintly lamplit room behind the doorway. It is a box drawn
   * from the inside (BackSide), sitting just behind the wall's inner face, with its floor a whisker above the
   * plinth so the sunlit stonework can never show through. The real interiors are their own maps (P06).
   */
  const interiorRoom = (base, { x = 0, zFace, T = WALL_T, y0 = 0, w, h, depth = 1.1 }) => {
    const W = w + 0.55, H = h + 0.12, zc = zFace - T - depth / 2 + 0.02;
    const g = prep(new THREE.BoxGeometry(W, H, depth, 1, 3, 1), PAL.interior.dark);
    g.applyMatrix4(base.clone().multiply(M4(x, y0 + 0.09 + H / 2, zc)));
    const p = g.attributes.position, c = g.attributes.color, t = new THREE.Color();
    const floor = C3(mixHex(PAL.interior.dark, PAL.shadow.contact, 0.45)), glow = C3(mixHex(PAL.interior.dark, PAL.interior.lamp, 0.34));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.count; i++) { lo = Math.min(lo, p.getY(i)); hi = Math.max(hi, p.getY(i)); }
    for (let i = 0; i < p.count; i++) { t.copy(floor).lerp(glow, smooth(lo, hi + 0.4, p.getY(i))); c.setXYZ(i, t.r, t.g, t.b); }
    INTERIOR.push(g);
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
    const mesh = new THREE.Mesh(mergeGeometries(parts), A.mat || (A.mat = makeToon({ map: A.tex, vertexColors: true }, {}, [See.patch])));
    mesh.name = 'sign-' + (o.text || o.icon || 'board'); mesh.castShadow = true; mesh.receiveShadow = true;
    local.add(mesh);
    scene.add(pivot);
    const ph = hashJ(SIGNS.length, 7) * TAU;
    SIGNS.push({ pivot: local, ph });
    BOARDS.push(mesh);
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
      interiorRoom(base, { x: dx, zFace: D / 2, T, y0: P, w: holeW, h: holeH, depth: Math.min(1.5, D - 2 * T - 0.1) });
      add('wood', boxUV(holeW + 0.1, 0.06, T + 0.12, 1), M4(dx, P + 0.03, D / 2 - T / 2), PAL.wood.dark);
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
    const rec = kit.cottage(Object.assign({
      kind: 'shop', W: 6.4, D: 4.5, H: 2.45, roof: 'tile', pitch: 0.6, barge: true,
      doorX: -1.7, doorW: 1.05, opens: true, frontWindows: [1.3], sideWindows: [0], shutter: PAL.paint.shutterBlue,
      chimney: 'brick', chimneyX: -2.0, awning: { over: [1.3], color: PAL.cloth.red, stripe: PAL.cloth.cream, w: 2.5, depth: 1.0, drop: 0.46 },
      sign: { icon: 'bag', text: 'SHOP', panel: PAL.paint.doorRed, side: 1 },
    }, o));
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
    const rec = kit.cottage(Object.assign({
      kind: 'barn', W: 6.6, D: 5.2, H: 2.9, roof: 'thatch', pitch: 0.8, walls: 'planks', wallTint: PAL.wood.light,
      doorX: 0, doorW: 2.3, doorH: 2.5, doorStyle: 'barn', doubleDoor: true, doorColor: PAL.wood.mid, opens: true,
      frontWindows: [], sideWindows: [], backWindow: false, braces: false, chimney: null, steps: false,
      gable: 'wood', gableColor: PAL.wood.weathered, plinth: 0.34,
    }, o));
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
    return rec;
  };

  /**
   * The watermill: a stone ground floor, a timber-framed upper floor, and a wheel that turns in the Beck.
   * o.waterY = the water level, o.wheelSide = +1 (local +x) or -1.
   */
  kit.mill = (o) => {
    const wheelSide = o.wheelSide ?? 1;
    const rec = kit.cottage(Object.assign({
      kind: 'mill', W: 4.8, D: 4.8, H: 2.7, H2: 2.0, storeys: 2, jetty: 0.16, roof: 'tile', pitch: 0.72, barge: true,
      walls: 'stone', doorX: 0, doorW: 1.05, opens: true, frontWindows: [], sideWindows: [], backWindow: false,
      upperWindows: [-1.2, 1.2], shutter: PAL.paint.shutterGreen, chimney: null, braces: false, steps: 2,
    }, o));
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
    const wheel = new THREE.Mesh(mergeGeometries(parts), woodMat());
    wheel.name = 'mill-wheel'; wheel.castShadow = true; wheel.receiveShadow = true;
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
    interiorRoom(base, { x: 0, zFace: D / 2, T, y0: P, w: holeW, h: holeH, depth: 1.6 });
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
      const bell = new THREE.Mesh(mergeGeometries(parts2), paintMat());
      bell.name = 'bell'; bell.castShadow = true;
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
      const vane = new THREE.Mesh(mergeGeometries([lark, rod]), paintMat());
      vane.name = 'weathervane';
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
  // merge: the kit's own meshes go in with the buckets; doors and signs animate from kit.update
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  const flushBuildings = () => {
    const out = [];
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
    if (INTERIOR.length) {
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: true });
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
    for (const s of SIGNS) s.pivot.rotation.x = Math.sin(t * 0.9 + s.ph) * 0.045 + Math.sin(t * 2.3 + s.ph) * 0.012;
  };

  /** What the buildings did, for __DQ.state() and the demo. */
  kit.buildingState = () => ({
    buildings: (kit.buildings || []).map(b => ({ id: b.id, kind: b.kind, x: +b.x.toFixed(2), z: +b.z.toFixed(2) })),
    doors: DOORS.map(d => ({ id: d.id, open: +d.amount.toFixed(2), opens: d.opens })),
    signs: BOARDS.length,
  });

  return kit;
}

export default buildingRecipes;
