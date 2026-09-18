/**
 * interior.js — THE INSIDE OF A BUILDING: the furniture, fire, light and small life that turn a room shell into
 * somewhere a child wants to stand still.                                    (P06, owner: src/art/interior.js)
 *
 *   import { interiorRecipes, indoorContacts, interiorRig, ROOM } from '../../art/interior.js';
 *   const kit = createKit({ scene, heightAt: () => 0, ao });   // P04 core + P02/P03/P05 recipes (scenery.js)
 *   interiorRecipes(kit);                                       // ...then THESE, on top
 *   indoorContacts(kit);                                        // soften the outdoor contact pools for boards
 *
 * WHY IT IS A SEPARATE FILE. src/art/buildings.js (P05) already carries the shell and the first stick of
 * furniture a cottage needs — `roomShell hearth roomTable chair stool bed ladder loftDeck chestBox dresser shelf
 * rug counter kegs roomLamp`. Those stay P05's and are used unchanged. Everything a village needs BEYOND one
 * kitchen lives here: wardrobes, bookshelves, urns, crates, sacks, a cooking pot over the fire, candles and
 * sconces, herbs hung from a beam, flagstones, pews and an altar, an inn's row of beds, a baker's oven, a mill's
 * stones, a barn's hay and stalls, a shop's wall of wares, the shaft of daylight a window throws on the floor,
 * and the cat asleep by the hearth.
 *
 * HOUSE RULES (docs/ARCHITECTURE.md + the LOCKED look in docs/DQV-RUBRIC.md)
 *  - Colour comes from PAL only; geometry goes into the kit's merged buckets (stone plaster wood thatch tile
 *    brick bark paint · glow) so a whole room is a handful of draw calls.
 *  - Nothing floats: every recipe that stands on the floor registers a contact pool (kit.contact).
 *  - Nothing throws out of a recipe: a room with one broken chair still renders.
 *  - Local +z is SOUTH, matching roomShell and the exterior kit, so `rot` means the same thing everywhere.
 *  - A room the camera looks DOWN into has no ceiling (see roomShell): anything hung from "the beams" is placed
 *    just under the head height the map passes in, never above it.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, mixHex, lerp } from './palette.js';
import { Tex, mulberry } from './tex.js';
import { makeToon, TOON_PRESETS, withOutline, OUTLINE } from './toon.js';
import { M4, boxUV, prep } from './props.js';
import { reportError } from '../engine/debug.js';

const TAU = Math.PI * 2;

/** Numbers every interior map shares, so ten rooms agree with each other. */
export const ROOM = Object.freeze({
  T: 0.34,             // wall thickness (roomShell's default)
  H: 2.55,             // head height that keeps the camera out of the woodwork
  DOOR_W: 1.32,        // a door a child walks through without aiming
  DOOR_H: 2.15,
  ARRIVE: 1.9,         // how far in from the inside face of the door you land
  /**
   * The interior camera, measured (shots/P06-probe): a room is looked DOWN into at 52 degrees — nearly twice the
   * field's ground angle — from a 6-unit boom, half what the field uses. `mode: 'world'` names the COMPOSITION,
   * not the place: CAM_MODES.interior frames the hero at 26% of frame height, which is a portrait of a boy on
   * some floorboards, and hides the room he came in to look at. The 'world' composition (hero 18%, horizon 18%)
   * with this ground angle puts the whole room in the frame. hollybank.js measured the same thing first.
   */
  CAMERA: Object.freeze({ mode: 'world', orbit: 0, pitch: 52, dist: 6.0, fov: 52, lookUp: 1.25 }),
});

/**
 * The contact pools the props kit registers are tuned for grass. Stacked on floorboards they turn a room into
 * mud (measured in hollybank.js before this existed). Indoors every pool is smaller and much fainter.
 */
export function indoorContacts(kit, { scale = 0.62, strength = 0.42 } = {}) {
  if (!kit || kit._indoorContacts) return kit;
  const raw = kit.contact;
  kit.contact = (x, z, r, k = 0.85, o = {}) => raw(x, z, r * scale, k * strength,
    Object.assign({}, o, { rx: (o.rx ?? r) * scale, rz: (o.rz ?? r) * scale, spread: 1.0 }));
  kit._indoorContacts = true;
  return kit;
}

/**
 * The standard interior lighting: F3's 'interior' rig preset, lifted a little (a cottage has a fire and four
 * windows; it is not a cave), no fog, and the dark surround a DQV dollhouse room sits in so the room itself
 * reads far brighter than the edge of the world.
 */
export function interiorRig({ rig, scene, dir = [0.22, 0.96, 0.26], sun = 1.3, hemi = 1.12, extent = 18, surround = 0.55 }) {
  try {
    if (rig) {
      rig.apply('interior');
      if (rig.dir && rig.dir.set) rig.dir.set(dir[0], dir[1], dir[2]).normalize();
      if (rig.sun) rig.sun.intensity *= sun;
      if (rig.hemi) rig.hemi.intensity *= hemi;
      if (rig.setExtent) rig.setExtent(extent);
    }
    if (scene) {
      scene.background = C3(mixHex(PAL.shadow.contact, PAL.interior.dark, surround));
      scene.fog = null;
    }
  } catch (e) { reportError('interior rig', e); }
  return rig;
}

/** Keep the interior rig asserted even if the world clock tries to make a room into an evening. */
export function holdInteriorRig(rig, where = 'interior') {
  if (!rig) return;
  try { if (rig.preset !== 'interior') rig.apply('interior'); } catch (e) { reportError(where + ' rig', e); }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the recipes
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * Install every interior recipe onto a scenery kit. Safe to call twice; safe to call on a kit that already has
 * P05's room recipes (nothing here overwrites one of those).
 */
export function interiorRecipes(kit) {
  if (!kit || kit._interiorRecipes) return kit;
  kit._interiorRecipes = true;
  const addTo = kit.addTo;
  const scene = kit.scene;
  const glow = (geo, m, hex) => { try { return kit.addGlow(geo, m, hex); } catch (e) { reportError('interior glow', e); return null; } };
  const count = (k) => { kit.counts[k] = (kit.counts[k] || 0) + 1; };

  /** Every recipe body runs inside this: one broken chair never costs you the room. */
  const safe = (name, fn) => { try { return fn(); } catch (e) { reportError('interior ' + name, e); return null; } };

  // ── the doorway you came in through: daylight in the hole, and a leaf standing open on it ──────────────────
  kit.roomDoorway = (x, z, rot = 0, { w = ROOM.DOOR_W, h = ROOM.DOOR_H, t = ROOM.T, swing = 0.7, color = PAL.paint.doorRed, open = true } = {}) => safe('doorway', () => {
    const base = M4(x, 0, z, rot);
    const day = mixHex(PAL.sky.horizon, PAL.plaster.light, 0.55);
    glow(new THREE.BoxGeometry(w - 0.06, h - 0.06, 0.08), base.clone().multiply(M4(0, (h - 0.06) / 2, t * 0.72)), day);
    if (open) {
      const leaf = base.clone().multiply(M4(w / 2, 0, 0.02)).multiply(M4(0, 0, 0, swing)).multiply(M4(-w / 2, h / 2, 0));
      addTo('wood', boxUV(w, h, 0.09, 1), leaf, color);
      addTo('paint', new THREE.SphereGeometry(0.055, 8, 6), leaf.clone().multiply(M4(w / 2 - 0.14, -0.1, 0.07)), PAL.paint.iron);
    }
    count('doorway');
    return { x, z, rot };
  });

  // ── a shaft of daylight from a window onto the floor ───────────────────────────────────────────────────────
  // The one thing in a DQV room that says "there is a world outside". An additive slab leaning in from the wall,
  // brightest at the glass, gone by the time it reaches the boards.
  const SHAFTS = [];
  kit.lightShaft = (x, z, rot = 0, { w = 1.0, y = 1.4, len = 2.6, color = PAL.interior.lamp, spread = 1.25, blades = 3 } = {}) => safe('lightShaft', () => {
    // Measured (shots/P06-rooms): ONE quad lying nearly flat across the floor reads as a stray translucent sheet,
    // not as light. Three quads crossed about the beam's own axis read as a volume from every camera angle, and
    // the beam is steep (it falls `len` forward while dropping the whole window height), so it looks like sun.
    for (let b = 0; b < blades; b++) {
      const g = new THREE.PlaneGeometry(1, 1, 4, 6).rotateX(-Math.PI / 2);
      const p = g.attributes.position, n = p.count;
      const col = new Float32Array(n * 3), c0 = C3(mixHex(color, PAL.char.white, 0.45));
      for (let i = 0; i < n; i++) {
        const u = p.getX(i), v = p.getZ(i) + 0.5;    // 0 at the glass, 1 where it lands on the boards
        const wide = lerp(1, spread, v);
        p.setX(i, u * w * wide);
        p.setY(i, y * (1 - v));
        p.setZ(i, v * len);
        const side = 1 - Math.min(1, Math.abs(u) * 2) ** 1.4;      // 1 in the middle, 0 at both edges
        const f = (1 - v * 0.85) * (0.5 + 0.5 * (1 - v)) * side;
        col[i * 3] = c0.r * f; col[i * 3 + 1] = c0.g * f; col[i * 3 + 2] = c0.b * f;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      // roll each blade about the beam direction: the beam runs +z and falls in -y, so roll about z
      g.applyMatrix4(new THREE.Matrix4().makeRotationZ((b / blades) * Math.PI));
      g.applyMatrix4(M4(x, 0.02, z, rot));
      SHAFTS.push(g);
    }
    count('lightShaft');
    return { x, z };
  });

  /** Build the shafts registered so far into ONE additive mesh. Called by kit.flushInterior(). */
  const buildShafts = () => {
    if (!SHAFTS.length) return null;
    const geo = mergeGeometries(SHAFTS.splice(0));
    if (!geo) return null;
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'light-shafts'; mesh.renderOrder = 4;
    mesh.userData.camIgnore = true;
    scene.add(mesh);
    return mesh;
  };

  // ── plaster AND BEAMS: the half-timbering of a Puddlewick wall, seen from the inside ───────────────────────
  // The village outside is timber-framed; from a top-down camera the far walls are most of what a child sees of
  // a room, and bare plaster reads as a cardboard box. Studs, a mid rail and corner posts fix that for the price
  // of a few dozen boxes in the wood bucket. Studs step round any window on that wall.
  const WALL_AT = {
    north: (W, D, t) => ({ span: W, off: -D / 2 + t * 0.5, axis: 'z', rot: 0 }),
    south: (W, D, t) => ({ span: W, off: D / 2 - t * 0.5, axis: 'z', rot: 0 }),
    east: (W, D, t) => ({ span: D, off: W / 2 - t * 0.5, axis: 'x', rot: Math.PI / 2 }),
    west: (W, D, t) => ({ span: D, off: -W / 2 + t * 0.5, axis: 'x', rot: Math.PI / 2 }),
  };
  kit.wallTimbers = ({ W = 10, D = 8, H = 2.5, sides = ['north', 'east', 'west'], spacing = 1.55, t = 0.11,
    color = PAL.wood.beam, rail = true, windows = [], openings = [], seed = 3 } = {}) => safe('wallTimbers', () => {
    const r = mulberry(seed);
    for (const side of sides) {
      const f = WALL_AT[side]; if (!f) continue;
      const { span, off, axis, rot } = f(W, D, t);
      // where the wall is interrupted on this side
      const gaps = [...windows, ...openings].filter(g => g.side === side).map(g => ({ at: g.at ?? 0, w: (g.w ?? 1) / 2 + t * 1.2 }));
      const put = (at, lw, lh, ly, col) => {
        const lx = axis === 'z' ? at : off, lz = axis === 'z' ? off : -at;
        addTo('wood', boxUV(axis === 'z' ? lw : t, lh, axis === 'z' ? t : lw, 1.2), M4(lx, ly, lz, 0), col);
      };
      const n = Math.max(1, Math.round(span / spacing));
      for (let k = 1; k < n; k++) {
        const at = -span / 2 + k * (span / n);
        if (gaps.some(g => Math.abs(at - g.at) < g.w)) continue;
        put(at, t, H - 0.08, (H - 0.08) / 2, r() < 0.3 ? PAL.wood.dark : color);
      }
      // corner posts and the mid rail
      for (const e of [-1, 1]) put(e * (span / 2 - t * 0.8), t * 1.5, H - 0.04, (H - 0.04) / 2, PAL.wood.dark);
      if (rail) {
        const ly = H * 0.56;
        let x0 = -span / 2;
        const cuts = gaps.slice().sort((a, b) => a.at - b.at);
        for (const g of cuts) {
          const l = (g.at - g.w) - x0;
          if (l > 0.08) put(x0 + l / 2, l, 0.12, ly, color);
          x0 = g.at + g.w;
        }
        const l = span / 2 - x0;
        if (l > 0.08) put(x0 + l / 2, l, 0.12, ly, color);
      }
      void rot;
    }
    count('timbers');
    return true;
  });

  // ── flagstones: a stone floor laid over the boards (a chapel, a bakery, a dairy) ────────────────────────────
  /**
   * Flagstones. Measured first try with the stone TEXTURE on each slab, which drew four brick courses and a patch
   * of moss inside every flag and read as a cobbled street laid indoors. A flag is a smooth warm slab with a dark
   * joint under it: the plaster surface (smooth) tinted to stone, over one dark plate that shows in the gaps.
   */
  kit.flagFloor = (x, z, { w = 4, d = 4, rot = 0, seed = 3, lift = 0.012, color = mixHex(PAL.stone.mid, PAL.stone.dark, 0.28), flag = 0.74 } = {}) => safe('flagFloor', () => {
    const r = mulberry(seed);
    const nx = Math.max(2, Math.round(w / flag)), nz = Math.max(2, Math.round(d / flag));
    const base = M4(x, 0, z, rot);
    // the mortar bed: one dark plate the joints show through
    addTo('stone', boxUV(w, 0.06, d, 6), base.clone().multiply(M4(0, lift - 0.03, 0)), PAL.stone.mortar);
    const TONES = [color, mixHex(color, PAL.stone.light, 0.55), mixHex(color, PAL.stone.dark, 0.35),
      mixHex(color, PAL.dirt.light, 0.3), mixHex(color, PAL.stone.light, 0.25)];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const sw = w / nx, sd = d / nz;
        addTo('plaster', boxUV(sw - 0.07, 0.06, sd - 0.07, 8),
          base.clone().multiply(M4(-w / 2 + (i + 0.5) * sw, lift, -d / 2 + (j + 0.5) * sd)),
          TONES[(r() * TONES.length) | 0]);
      }
    }
    count('flagFloor');
    return { x, z };
  });

  // ── containers: the whole DISCOVERY dimension is these five shapes ─────────────────────────────────────────
  /** An upright barrel, indoors: staves, two hoops, a lid. */
  kit.roomBarrel = (x, z, rot = 0, { s = 1, lid = true, color = PAL.wood.mid, y: yy = 0 } = {}) => safe('roomBarrel', () => {
    const base = M4(x, yy, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', new THREE.CylinderGeometry(0.31 * s, 0.27 * s, 0.78 * s, 14), M4(0, 0.39 * s, 0), color);
    for (const ly of [0.16, 0.62]) add('paint', new THREE.TorusGeometry(0.315 * s, 0.026 * s, 4, 16), M4(0, ly * s, 0, 0, Math.PI / 2), PAL.paint.iron);
    if (lid) add('wood', new THREE.CylinderGeometry(0.305 * s, 0.305 * s, 0.05 * s, 14), M4(0, 0.79 * s, 0), PAL.wood.light);
    kit.contact(x, z, 0.36 * s, 0.9);
    count('barrel');
    return { x, z };
  });

  /** A glazed urn or crock — a pot a child will absolutely try to search. */
  kit.urn = (x, z, { r = 0.3, h = 0.66, color = PAL.tile.mid, rim = true, y: yy = 0 } = {}) => safe('urn', () => {
    const base = M4(x, yy, z);
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const rr = r * (0.52 + 0.86 * Math.sin(Math.PI * (0.16 + t * 0.78)));
      pts.push(new THREE.Vector2(Math.max(0.04, rr), t * h));
    }
    // the 'plaster' surface, not 'tile': Tex.tile() is ROOF tiles, and a lathed pot wearing it came out as a
    // red beehive. Plaster is smooth, so a glazed pot reads as glazed pottery.
    addTo('plaster', new THREE.LatheGeometry(pts, 16), base, color);
    if (rim) addTo('plaster', new THREE.TorusGeometry(r * 0.62, 0.035, 6, 18), base.clone().multiply(M4(0, h - 0.01, 0, 0, Math.PI / 2)), mixHex(color, PAL.wood.dark, 0.3));
    kit.contact(x, z, r * 1.15, 0.85);
    count('urn');
    return { x, z };
  });

  /** A little group of pots, the way pots actually stand: unevenly, in a corner. */
  kit.potGroup = (x, z, { n = 3, seed = 5, spread = 0.42 } = {}) => safe('potGroup', () => {
    const r = mulberry(seed);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + r() * 0.8;
      kit.urn(x + Math.cos(a) * spread * (0.4 + r() * 0.8), z + Math.sin(a) * spread * (0.4 + r() * 0.8),
        { r: 0.16 + r() * 0.14, h: 0.3 + r() * 0.34, color: r() < 0.5 ? PAL.tile.light : PAL.tile.mid, rim: r() < 0.6 });
    }
    return { x, z };
  });

  /** A stack of crates. */
  kit.crateStack = (x, z, rot = 0, { n = 3, seed = 7, s = 1 } = {}) => safe('crateStack', () => {
    const r = mulberry(seed);
    const base = M4(x, 0, z, rot);
    const put = (lx, ly, lz, sc, ry) => {
      const w = 0.62 * sc;
      addTo('wood', boxUV(w, w, w, 0.9), base.clone().multiply(M4(lx, ly + w / 2, lz, ry)), PAL.wood.mid);
      for (const e of [-1, 1]) addTo('wood', boxUV(w + 0.03, 0.07, 0.05, 1), base.clone().multiply(M4(lx, ly + w / 2 + e * w * 0.3, lz + w / 2, ry)), PAL.wood.light);
    };
    let y = 0;
    for (let k = 0; k < n; k++) {
      const sc = s * (0.86 + r() * 0.24);
      put((r() - 0.5) * 0.12, y, (r() - 0.5) * 0.12, sc, (r() - 0.5) * 0.35);
      y += 0.62 * sc;
    }
    kit.contact(x, z, 0.46 * s, 0.9, { rx: 0.44 * s, rz: 0.44 * s, rot });
    count('crates');
    return { x, z, top: y };
  });

  /** A heap of sacks — flour at the bakery, grain at the mill, feed in the barn. */
  kit.sackPile = (x, z, rot = 0, { n = 3, seed = 11, color = mixHex(PAL.cloth.cream, PAL.dirt.light, 0.35), s = 1.15 } = {}) => safe('sackPile', () => {
    const r = mulberry(seed);
    const base = M4(x, 0, z, rot);
    for (let k = 0; k < n; k++) {
      const row = k < 2 ? 0 : 1;
      const lx = (k % 2 - 0.5) * 0.5 * s + (row ? 0.12 : 0), lz = (r() - 0.5) * 0.18 * s, ly = row ? 0.46 * s : 0;
      const g = new THREE.SphereGeometry(0.34 * s, 10, 8);
      g.scale(1.12, 0.74, 0.86);
      // 'plaster' is the kit's smooth surface: on the thatch texture every sack came out as a wicker basket.
      addTo('plaster', g, base.clone().multiply(M4(lx, ly + 0.25 * s, lz, (r() - 0.5) * 0.7)), mixHex(color, PAL.dirt.light, r() * 0.3));
      // the twisted neck at the top of a tied sack, and the cord round it
      addTo('plaster', new THREE.ConeGeometry(0.075 * s, 0.2 * s, 7), base.clone().multiply(M4(lx, ly + 0.46 * s, lz, 0, 0, (r() - 0.5) * 0.5)), mixHex(color, PAL.dirt.dark, 0.22));
      addTo('paint', new THREE.TorusGeometry(0.055 * s, 0.014 * s, 4, 12), base.clone().multiply(M4(lx, ly + 0.42 * s, lz, 0, Math.PI / 2)), PAL.cloth.rope);
    }
    kit.contact(x, z, 0.5 * s, 0.85, { rx: 0.55 * s, rz: 0.4 * s, rot });
    count('sacks');
    return { x, z };
  });

  // ── storage furniture ──────────────────────────────────────────────────────────────────────────────────────
  /** A wardrobe: two doors, a cornice, and a key nobody has ever turned. */
  kit.wardrobe = (x, z, rot = 0, { w = 1.15, h = 2.0, d = 0.56, color = PAL.wood.mid, y: yy = 0 } = {}) => safe('wardrobe', () => {
    const base = M4(x, yy, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(w, h - 0.18, d, 0.9), M4(0, (h - 0.18) / 2 + 0.1, 0), color);
    add('wood', boxUV(w + 0.14, 0.14, d + 0.12, 1), M4(0, h - 0.07, 0), PAL.wood.light);       // the cornice
    add('wood', boxUV(w + 0.06, 0.1, d + 0.06, 1), M4(0, 0.05, 0), PAL.wood.beam);             // the plinth
    for (const sx of [-1, 1]) {
      add('wood', boxUV(w / 2 - 0.08, h - 0.5, 0.05, 0.9), M4(sx * w / 4, h / 2, d / 2 + 0.01), PAL.wood.light);
      add('paint', new THREE.SphereGeometry(0.045, 8, 6), M4(sx * (w / 4 - sx * w * 0.16), h * 0.52, d / 2 + 0.05), PAL.paint.iron);
    }
    add('paint', boxUV(0.05, 0.1, 0.03, 1), M4(0, h * 0.5, d / 2 + 0.03), PAL.paint.gold);     // the escutcheon
    kit.contact(x, z, 0.5, 0.7, { rx: w * 0.55, rz: d * 0.85, rot });
    count('wardrobe');
    return { x, z };
  });

  /** A bookshelf. Books are one merged block of spines per shelf, in three cloth colours, leaning at the end. */
  kit.bookshelf = (x, z, rot = 0, { w = 1.3, h = 1.9, d = 0.34, n = 4, seed = 9, color = PAL.wood.mid } = {}) => safe('bookshelf', () => {
    const base = M4(x, 0, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const r = mulberry(seed);
    add('wood', boxUV(w + 0.1, 0.07, d, 1), M4(0, 0.035, 0), PAL.wood.beam);
    add('wood', boxUV(w + 0.1, 0.07, d, 1), M4(0, h, 0), PAL.wood.light);
    for (const sx of [-1, 1]) add('wood', boxUV(0.08, h, d, 0.9), M4(sx * (w / 2 + 0.04), h / 2, 0), color);
    add('wood', boxUV(w, h, 0.05, 0.9), M4(0, h / 2, -d / 2 + 0.02), PAL.wood.dark);
    const SPINE = [PAL.cloth.red, PAL.cloth.blue, PAL.cloth.green, PAL.cloth.mustard, PAL.cloth.leather];
    for (let k = 0; k < n; k++) {
      const ly = 0.12 + (k + 1) * (h - 0.28) / (n + 1);
      add('wood', boxUV(w, 0.05, d - 0.04, 0.9), M4(0, ly, 0), PAL.wood.light);
      let cx = -w / 2 + 0.06;
      while (cx < w / 2 - 0.1) {
        const bw = 0.045 + r() * 0.05, bh = 0.2 + r() * 0.1, lean = (cx > w / 2 - 0.34 && r() < 0.5) ? 0.35 : 0;
        add('paint', boxUV(bw, bh, d - 0.12, 1), M4(cx + bw / 2, ly + 0.03 + bh / 2, 0, 0, 0, lean), SPINE[(r() * SPINE.length) | 0]);
        cx += bw + 0.012 + (lean ? 0.06 : 0);
      }
    }
    kit.contact(x, z, 0.45, 0.65, { rx: w * 0.58, rz: d * 0.9, rot });
    count('bookshelf');
    return { x, z };
  });

  /** A plain workbench / kneading table with a tool rack above it. */
  kit.workbench = (x, z, rot = 0, { w = 2.0, d = 0.72, h = 0.86, rack = true, seed = 4 } = {}) => safe('workbench', () => {
    const base = M4(x, 0, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const r = mulberry(seed);
    add('wood', boxUV(w, 0.1, d, 0.9, [Math.max(2, Math.round(w)), 1, 1]), M4(0, h - 0.05, 0), PAL.wood.light);
    for (const sx of [-1, 1]) {
      add('wood', boxUV(0.12, h - 0.1, 0.12, 1.2), M4(sx * (w / 2 - 0.12), (h - 0.1) / 2, d / 2 - 0.12), PAL.wood.beam);
      add('wood', boxUV(0.12, h - 0.1, 0.12, 1.2), M4(sx * (w / 2 - 0.12), (h - 0.1) / 2, -d / 2 + 0.12), PAL.wood.beam);
    }
    add('wood', boxUV(w - 0.3, 0.08, 0.08, 1), M4(0, 0.24, 0), PAL.wood.beam);
    add('wood', boxUV(w - 0.1, 0.05, d - 0.16, 0.9), M4(0, 0.42, 0), PAL.wood.mid);            // the under-shelf
    if (rack) {
      add('wood', boxUV(w * 0.8, 0.07, 0.1, 1), M4(0, h + 0.62, -d / 2 + 0.04), PAL.wood.beam);
      for (let k = 0; k < 4; k++) {
        const lx = -w * 0.3 + k * (w * 0.2);
        add('paint', new THREE.CylinderGeometry(0.018, 0.018, 0.18 + r() * 0.16, 5), M4(lx, h + 0.48, -d / 2 + 0.06), PAL.paint.iron);
        add('paint', boxUV(0.1 + r() * 0.08, 0.06, 0.04, 1), M4(lx, h + 0.36, -d / 2 + 0.06), r() < 0.5 ? PAL.paint.iron : PAL.wood.dark);
      }
    }
    kit.contact(x, z, 0.6, 0.6, { rx: w * 0.52, rz: d * 0.6, rot });
    count('workbench');
    return { x, z, top: h };
  });

  /** The shop's wall of wares: a deep rack of boxes, bolts of cloth, rope coils and hanging pans. */
  kit.goodsRack = (x, z, rot = 0, { w = 2.6, h = 2.1, d = 0.42, seed = 17 } = {}) => safe('goodsRack', () => {
    const base = M4(x, 0, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const r = mulberry(seed);
    for (const sx of [-1, 1]) add('wood', boxUV(0.09, h, d, 0.9), M4(sx * (w / 2 - 0.045), h / 2, 0), PAL.wood.beam);
    add('wood', boxUV(w, h, 0.05, 0.9), M4(0, h / 2, -d / 2 + 0.02), PAL.wood.dark);
    const CLOTH = [PAL.cloth.red, PAL.cloth.blue, PAL.cloth.green, PAL.cloth.mustard, PAL.cloth.purple];
    for (let k = 0; k < 4; k++) {
      const ly = 0.3 + k * (h - 0.5) / 3.4;
      add('wood', boxUV(w - 0.1, 0.06, d - 0.04, 0.9), M4(0, ly, 0), PAL.wood.light);
      let cx = -w / 2 + 0.16;
      while (cx < w / 2 - 0.2) {
        const pick = r();
        if (pick < 0.35) { const bw = 0.24 + r() * 0.18; add('wood', boxUV(bw, 0.2, d - 0.12, 0.9), M4(cx + bw / 2, ly + 0.13, 0), PAL.wood.mid); cx += bw + 0.05; }
        else if (pick < 0.7) { const bw = 0.12 + r() * 0.08; add('paint', new THREE.CylinderGeometry(bw / 2, bw / 2, 0.3, 9), M4(cx + bw / 2, ly + 0.18, 0, 0, 0, 0.1), CLOTH[(r() * CLOTH.length) | 0]); cx += bw + 0.06; }
        else { add('tile', new THREE.CylinderGeometry(0.1, 0.08, 0.16, 10), M4(cx + 0.1, ly + 0.11, 0), r() < 0.5 ? PAL.tile.light : PAL.tile.mid); cx += 0.24; }
      }
    }
    // pans and a coil of rope hung off the front rail
    add('wood', boxUV(w - 0.2, 0.06, 0.06, 1), M4(0, h - 0.12, d / 2 - 0.05), PAL.wood.beam);
    for (let k = 0; k < 3; k++) {
      const lx = -w * 0.28 + k * (w * 0.28);
      add('paint', new THREE.CylinderGeometry(0.014, 0.014, 0.16, 5), M4(lx, h - 0.2, d / 2 - 0.05), PAL.paint.iron);
      if (k === 1) add('paint', new THREE.TorusGeometry(0.13, 0.04, 5, 14), M4(lx, h - 0.42, d / 2 - 0.05), PAL.cloth.rope);
      else add('paint', new THREE.CylinderGeometry(0.15, 0.13, 0.1, 12), M4(lx, h - 0.34, d / 2 - 0.05), PAL.paint.iron);
    }
    kit.contact(x, z, 0.6, 0.55, { rx: w * 0.52, rz: d * 0.9, rot });
    count('goodsRack');
    return { x, z };
  });

  // ── fire, light and the things that hang ───────────────────────────────────────────────────────────────────
  /** A cooking pot on a trivet, with the fire's light under it. Stands in front of a hearth. */
  kit.cauldron = (x, z, { r = 0.3, h = 0.34, fire = true, y: yy = 0, hook = false } = {}) => safe('cauldron', () => {
    const base = M4(x, yy, z);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const lift = fire ? 0.2 : 0.06;
    const body = new THREE.SphereGeometry(r, 14, 10, 0, TAU, 0, Math.PI * 0.62);
    body.scale(1, 1.0, 1); body.rotateX(Math.PI);
    add('paint', body, M4(0, lift + r * 0.62, 0), PAL.paint.iron);
    add('paint', new THREE.TorusGeometry(r * 0.94, 0.03, 5, 16), M4(0, lift + r * 0.62, 0, 0, Math.PI / 2), PAL.paint.iron);
    add('paint', new THREE.TorusGeometry(r * 0.8, 0.018, 4, 14, Math.PI), M4(0, lift + r * 0.72, 0, Math.PI / 2, 0, Math.PI / 2), PAL.paint.iron);
    if (!hook) for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      add('paint', new THREE.CylinderGeometry(0.02, 0.025, lift, 5), M4(Math.cos(a) * r * 0.62, lift / 2, Math.sin(a) * r * 0.62, 0, 0, Math.cos(a) * 0.12), PAL.paint.iron);
    }
    if (fire) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU, rr = 0.05 + (k % 3) * 0.04;
        glow(new THREE.ConeGeometry(0.06, 0.16 + (k % 2) * 0.06, 6), base.clone().multiply(M4(Math.cos(a) * rr, 0.06, Math.sin(a) * rr)),
          k % 2 ? PAL.flower.yellow : PAL.paint.gold);
      }
    }
    kit.contact(x, z, r * 1.25, 0.8);
    count('cauldron');
    return { x, z };
  });

  /** A candle on a spike, anywhere: a table, a windowsill, a ledge, an altar. */
  kit.candle = (x, y, z, { h = 0.2, stick = true, color = PAL.plaster.light } = {}) => safe('candle', () => {
    const base = M4(x, y, z);
    if (stick) {
      addTo('paint', new THREE.CylinderGeometry(0.06, 0.075, 0.03, 10), base.clone(), PAL.paint.iron);
      addTo('paint', new THREE.CylinderGeometry(0.016, 0.016, 0.06, 6), base.clone().multiply(M4(0, 0.045, 0)), PAL.paint.iron);
    }
    const y0 = stick ? 0.07 : 0;
    addTo('paint', new THREE.CylinderGeometry(0.028, 0.032, h, 8), base.clone().multiply(M4(0, y0 + h / 2, 0)), color);
    glow(new THREE.ConeGeometry(0.03, 0.1, 6), base.clone().multiply(M4(0, y0 + h + 0.05, 0)), PAL.flower.yellow);
    glow(new THREE.SphereGeometry(0.075, 8, 6), base.clone().multiply(M4(0, y0 + h + 0.04, 0)), mixHex(PAL.interior.lamp, PAL.flower.yellow, 0.4));
    count('candle');
    return { x, y, z };
  });

  /** A candle sconce on a wall (or a lantern on a bracket). Local +z faces into the room. */
  kit.wallSconce = (x, z, rot = 0, { y = 1.62, lantern = false } = {}) => safe('wallSconce', () => {
    const base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('paint', boxUV(0.07, 0.2, 0.05, 1), M4(0, 0, -0.02), PAL.paint.iron);
    add('paint', new THREE.CylinderGeometry(0.02, 0.02, 0.26, 5), M4(0, 0.05, 0.11, 0, 0, Math.PI / 2 - 0.3), PAL.paint.iron);
    if (lantern) {
      add('paint', new THREE.ConeGeometry(0.11, 0.09, 6), M4(0, 0.12, 0.22), PAL.paint.iron);
      glow(new THREE.SphereGeometry(0.075, 9, 7), base.clone().multiply(M4(0, 0.01, 0.22)), PAL.interior.lamp);
      for (let k = 0; k < 4; k++) add('paint', boxUV(0.018, 0.17, 0.018, 1), M4(Math.cos(k * TAU / 4) * 0.08, 0.02, 0.22 + Math.sin(k * TAU / 4) * 0.08), PAL.paint.iron);
      add('paint', new THREE.CylinderGeometry(0.09, 0.09, 0.02, 8), M4(0, -0.08, 0.22), PAL.paint.iron);
    } else {
      add('paint', new THREE.CylinderGeometry(0.06, 0.05, 0.02, 9), M4(0, 0.09, 0.22), PAL.paint.iron);
      // the candle itself is placed in WORLD space (local (0, 0.10, 0.22) through this sconce's own frame)
      kit.candle(x + Math.sin(rot) * 0.22, y + 0.10, z + Math.cos(rot) * 0.22, { stick: false, h: 0.17 });
    }
    count('sconce');
    return { x, y, z };
  });

  /** Bunches of herbs hung upside down from a beam — the smell of a kitchen, drawn. */
  kit.hangingHerbs = (x, z, y = 2.2, { n = 3, seed = 13, spread = 0.5, rot = 0 } = {}) => safe('hangingHerbs', () => {
    const r = mulberry(seed);
    const base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('paint', new THREE.CylinderGeometry(0.012, 0.012, spread * 2.1, 5), M4(0, 0.02, 0, 0, 0, Math.PI / 2), PAL.cloth.rope);
    for (let k = 0; k < n; k++) {
      const lx = -spread + (k + 0.5) * (spread * 2 / n), drop = 0.14 + r() * 0.1;
      add('paint', new THREE.CylinderGeometry(0.008, 0.008, drop, 4), M4(lx, -drop / 2, 0), PAL.cloth.rope);
      const leafy = mixHex(PAL.foliage.mid, PAL.foliage.dark, r() * 0.5);
      // the bunch hangs UPSIDE DOWN to dry: the cones point at the floor (rx = PI), not at the ceiling
      for (let b2 = 0; b2 < 7; b2++) {
        const a = (b2 / 7) * TAU + r();
        const len = 0.26 + r() * 0.2;
        const g = new THREE.ConeGeometry(0.075, len, 5);
        add('paint', g, M4(lx + Math.cos(a) * 0.04, -drop - len / 2, Math.sin(a) * 0.04, a, Math.PI, Math.cos(a) * 0.22), leafy);
      }
      if (r() < 0.4) add('paint', new THREE.SphereGeometry(0.05, 7, 6), M4(lx, -drop - 0.34, 0), PAL.flower.pink);
    }
    count('herbs');
    return { x, z };
  });

  /** A rope of onions or garlic on a nail. Cheap, and every DQ kitchen has one. */
  kit.onionRope = (x, z, y = 1.9, { n = 5, seed = 19, color = PAL.thatch.light } = {}) => safe('onionRope', () => {
    const r = mulberry(seed);
    const base = M4(x, y, z);
    addTo('paint', new THREE.CylinderGeometry(0.01, 0.01, 0.1, 4), base.clone().multiply(M4(0, 0.05, 0)), PAL.cloth.rope);
    for (let k = 0; k < n; k++) {
      const g = new THREE.SphereGeometry(0.075, 8, 7); g.scale(1, 1.15, 1);
      addTo('paint', g, base.clone().multiply(M4((r() - 0.5) * 0.07, -k * 0.13, (r() - 0.5) * 0.06)), mixHex(color, PAL.dirt.light, r() * 0.4));
    }
    count('onions');
    return { x, z };
  });

  // ── a chapel ───────────────────────────────────────────────────────────────────────────────────────────────
  /** A pew: a plank bench with a back and a kneeler. */
  kit.pew = (x, z, rot = 0, { w = 2.6, h = 0.94, seat = 0.44 } = {}) => safe('pew', () => {
    const base = M4(x, 0, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(w, 0.08, 0.38, 0.9, [Math.max(2, Math.round(w)), 1, 1]), M4(0, seat, 0), PAL.wood.light);
    add('wood', boxUV(w, h - seat - 0.1, 0.06, 0.9), M4(0, seat + (h - seat) / 2, -0.17), PAL.wood.mid);
    for (const sx of [-1, 1]) {
      add('wood', boxUV(0.09, seat, 0.34, 1.2), M4(sx * (w / 2 - 0.08), seat / 2, 0), PAL.wood.beam);
      add('wood', boxUV(0.09, h, 0.09, 1.2), M4(sx * (w / 2 - 0.08), h / 2, -0.17), PAL.wood.beam);
    }
    add('wood', boxUV(w - 0.2, 0.06, 0.18, 0.9), M4(0, 0.13, 0.28), PAL.wood.mid);             // the kneeler
    kit.contact(x, z, 0.5, 0.6, { rx: w * 0.52, rz: 0.3, rot });
    count('pew');
    return { x, z };
  });

  /** Rows of pews down both sides of an aisle. */
  kit.pewRows = (x, z, rot = 0, { rows = 3, gap = 1.15, w = 2.3, aisle = 1.5 } = {}) => safe('pewRows', () => {
    const base = { x, z, c: Math.cos(rot), s: Math.sin(rot) };
    const at = (lx, lz) => ({ x: base.x + lx * base.c + lz * base.s, z: base.z - lx * base.s + lz * base.c });
    for (let k = 0; k < rows; k++) {
      for (const sx of [-1, 1]) {
        const p = at(sx * (aisle / 2 + w / 2), k * gap);
        kit.pew(p.x, p.z, rot, { w });
      }
    }
    return { x, z, rows };
  });

  /** The altar: a stone table under a cloth, two candles and a carved lark on the wall behind it. */
  kit.altar = (x, z, rot = 0, { w = 2.0, d = 0.8, h = 0.98, cloth = PAL.cloth.cream, lark = true } = {}) => safe('altar', () => {
    const base = M4(x, 0, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('stone', boxUV(w * 0.7, h - 0.14, d * 0.72, Tex.worldSize('stone')), M4(0, (h - 0.14) / 2, 0), PAL.stone.mid);
    add('stone', boxUV(w, 0.14, d, Tex.worldSize('stone')), M4(0, h - 0.07, 0), PAL.stone.light);
    add('stone', boxUV(w + 0.2, 0.12, d + 0.2, Tex.worldSize('stone')), M4(0, 0.06, 0), PAL.stone.light);
    add('paint', boxUV(w * 0.94, 0.03, d + 0.16, 1), M4(0, h + 0.015, 0), cloth);
    for (const sx of [-1, 1]) add('paint', boxUV(w * 0.94, 0.3, 0.03, 1), M4(0, h - 0.13, sx * (d / 2 + 0.08)), cloth);
    for (const sx of [-1, 1]) add('paint', boxUV(w * 0.94, 0.06, 0.035, 1), M4(0, h - 0.26, sx * (d / 2 + 0.085)), PAL.paint.gold);
    kit.candle(x - Math.cos(rot) * w * 0.32, h + 0.03, z + Math.sin(rot) * w * 0.32, { h: 0.26 });
    kit.candle(x + Math.cos(rot) * w * 0.32, h + 0.03, z - Math.sin(rot) * w * 0.32, { h: 0.26 });
    if (lark) {
      // a lark carved into a wooden roundel: a body, a head and two swept wings (the Order of nobody, just a bird)
      const m = M4(0, h + 0.86, -d / 2 - 0.02);
      add('wood', new THREE.CylinderGeometry(0.34, 0.34, 0.06, 18), base.clone().multiply(m.clone().multiply(M4(0, 0, 0, 0, Math.PI / 2))), PAL.wood.light);
      add('paint', new THREE.SphereGeometry(0.1, 9, 7), base.clone().multiply(m.clone().multiply(M4(0, -0.02, 0.05))), PAL.paint.gold);
      add('paint', new THREE.SphereGeometry(0.055, 8, 6), base.clone().multiply(m.clone().multiply(M4(0, 0.1, 0.06))), PAL.paint.gold);
      for (const sx of [-1, 1]) {
        const g = new THREE.ConeGeometry(0.06, 0.26, 5);
        add('paint', g, base.clone().multiply(m.clone().multiply(M4(sx * 0.13, 0.04, 0.05, 0, 0, sx * -1.1))), PAL.paint.gold);
      }
    }
    kit.contact(x, z, 0.7, 0.6, { rx: w * 0.55, rz: d * 0.7, rot });
    count('altar');
    return { x, z, top: h };
  });

  /** An iron stand of votive candles — a chapel's whole lighting budget. */
  kit.candleStand = (x, z, { n = 7, r = 0.34, h = 0.82 } = {}) => safe('candleStand', () => {
    const base = M4(x, 0, z);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('paint', new THREE.CylinderGeometry(0.28, 0.32, 0.05, 12), M4(0, 0.025, 0), PAL.paint.iron);
    add('paint', new THREE.CylinderGeometry(0.035, 0.045, h, 8), M4(0, h / 2, 0), PAL.paint.iron);
    add('paint', new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.04, 16), M4(0, h, 0), PAL.paint.iron);
    add('paint', new THREE.TorusGeometry(r + 0.04, 0.02, 5, 18), M4(0, h + 0.03, 0, 0, Math.PI / 2), PAL.paint.iron);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      kit.candle(x + Math.cos(a) * r * 0.72, h + 0.03, z + Math.sin(a) * r * 0.72, { stick: false, h: 0.16 + (k % 3) * 0.06 });
    }
    kit.contact(x, z, 0.36, 0.7);
    count('candleStand');
    return { x, z };
  });

  /** A bell rope down a wall, with a handle worn shiny and a sally of red and white wool. */
  kit.bellRope = (x, z, rot = 0, { top = 2.4, handle = 0.95 } = {}) => safe('bellRope', () => {
    const base = M4(x, 0, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('paint', new THREE.CylinderGeometry(0.022, 0.022, top - handle, 6), M4(0, handle + (top - handle) / 2, 0), PAL.cloth.rope);
    for (let k = 0; k < 4; k++) add('paint', new THREE.CylinderGeometry(0.035, 0.035, 0.1, 6),
      M4(0, handle + 0.06 + k * 0.11, 0), k % 2 ? PAL.cloth.red : PAL.cloth.cream);       // the sally
    add('wood', new THREE.CylinderGeometry(0.05, 0.042, 0.28, 8), M4(0, handle - 0.14, 0), PAL.wood.light);
    add('paint', boxUV(0.3, 0.2, 0.03, 1), M4(0.42, handle + 0.1, 0), PAL.cloth.cream);    // the little sign
    count('bellRope');
    return { x, z };
  });

  /** A poor box on a post — the thing a child can GIVE to. */
  kit.poorBox = (x, z, rot = 0, { h = 1.0 } = {}) => safe('poorBox', () => {
    const base = M4(x, 0, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(0.14, h, 0.14, 1.2), M4(0, h / 2, 0), PAL.wood.beam);
    add('wood', boxUV(0.4, 0.34, 0.3, 0.9), M4(0, h + 0.17, 0), PAL.wood.mid);
    add('wood', boxUV(0.44, 0.06, 0.34, 0.9), M4(0, h + 0.37, 0), PAL.wood.light);
    add('paint', boxUV(0.16, 0.02, 0.03, 1), M4(0, h + 0.41, 0), PAL.shadow.contact);
    add('paint', boxUV(0.06, 0.09, 0.03, 1), M4(0, h + 0.14, 0.16), PAL.paint.gold);
    kit.contact(x, z, 0.24, 0.7);
    count('poorBox');
    return { x, z };
  });

  // ── an inn's row of beds ───────────────────────────────────────────────────────────────────────────────────
  /** n beds in a row with a nightstand and a candle between each pair. `rot` faces the heads. */
  kit.bedRow = (x, z, rot = 0, { n = 3, gap = 1.5, blanket = PAL.cloth.blue, small = false, stands = true } = {}) => safe('bedRow', () => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
    const out = [];
    for (let k = 0; k < n; k++) {
      const p = at((k - (n - 1) / 2) * gap, 0);
      if (typeof kit.bed === 'function') kit.bed(p.x, p.z, rot, { w: 0.95, l: 1.85, small, blanket: k % 2 ? mixHex(blanket, PAL.cloth.cream, 0.3) : blanket });
      out.push(p);
      if (stands && k < n - 1) {
        const q = at((k - (n - 1) / 2 + 0.5) * gap, -0.55);
        addTo('wood', boxUV(0.34, 0.5, 0.34, 0.9), M4(q.x, 0.25, q.z, rot), PAL.wood.mid);
        kit.candle(q.x, 0.5, q.z, { h: 0.15 });
        kit.contact(q.x, q.z, 0.22, 0.7);
      }
    }
    count('bedRow');
    return out;
  });

  // ── a bakery ───────────────────────────────────────────────────────────────────────────────────────────────
  /** A brick bread oven: a domed mouth in a brick breast, the fire inside, a peel leaning on it. */
  kit.oven = (x, z, rot = 0, { w = 2.2, h = 1.9, d = 1.4, lit = true, peel = true } = {}) => safe('oven', () => {
    const base = M4(x, 0, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    // The body is STONE with brick only where the fire touches, and it is a FRAME round a real chamber. First
    // version was one solid stone box with a mouth stuck on the front, so the fire was sealed inside it and every
    // shot of the bakery showed a dark rectangle: measured in shots/P06-rooms/08-bakery.
    const mw = w * 0.4, mh = 0.56, my = 0.42, body = h * 0.6, ch = 0.58;      // ch = how deep the chamber goes
    for (const sg of [-1, 1]) add('stone', boxUV((w - mw) / 2, body, d, Tex.worldSize('stone')),
      M4(sg * (mw + (w - mw) / 2) / 2, body / 2, 0), PAL.stone.mid);
    add('stone', boxUV(mw, my, d, Tex.worldSize('stone')), M4(0, my / 2, 0), PAL.stone.mid);
    if (body - my - mh > 0.02) add('stone', boxUV(mw, body - my - mh, d, Tex.worldSize('stone')), M4(0, my + mh + (body - my - mh) / 2, 0), PAL.stone.mid);
    add('brick', boxUV(mw, mh, d - ch, Tex.worldSize('brick')), M4(0, my + mh / 2, -ch / 2), PAL.brick.soot);      // the sooty back
    for (const sg of [-1, 1]) add('brick', boxUV(0.08, mh, ch, Tex.worldSize('brick')), M4(sg * (mw / 2 - 0.04), my + mh / 2, d / 2 - ch / 2), PAL.brick.soot);
    add('brick', boxUV(mw, 0.07, ch, Tex.worldSize('brick')), M4(0, my + mh - 0.035, d / 2 - ch / 2), PAL.brick.soot);
    const dome = new THREE.SphereGeometry(w * 0.46, 16, 10, 0, TAU, 0, Math.PI / 2);
    dome.scale(1, 0.66, d / w * 1.02);
    add('brick', dome, M4(0, body, 0), PAL.brick.mid);
    add('stone', boxUV(w + 0.22, 0.16, d + 0.22, Tex.worldSize('stone')), M4(0, body, 0), PAL.stone.light);   // the string course
    // ...a FRAME, not a slab: the first version was one solid box across the mouth, which walled the fire in and
    // every shot of the bakery showed a dark brick rectangle where the fire was meant to be.
    for (const sg of [-1, 1]) add('brick', boxUV(0.17, mh + 0.2, 0.14, Tex.worldSize('brick')), M4(sg * (mw / 2 + 0.085), my + mh / 2, d / 2 + 0.02), PAL.brick.soot);
    add('brick', boxUV(mw + 0.34, 0.14, 0.14, Tex.worldSize('brick')), M4(0, my + mh + 0.07, d / 2 + 0.02), PAL.brick.soot);
    add('stone', boxUV(mw + 0.5, 0.15, 0.2, Tex.worldSize('stone')), M4(0, my + mh + 0.21, d / 2 + 0.04), PAL.stone.light);
    add('brick', boxUV(mw, 0.06, ch, Tex.worldSize('brick')), M4(0, my + 0.03, d / 2 - ch / 2), PAL.brick.soot);    // the sole
    if (lit) {
      // set BACK behind the jamb so it reads as a fire in a hole, not a white card stuck on the front
      // the back of the chamber, glowing red, then real flames standing in FRONT of it. (The first version put a
      // cream slab and a fat cream sphere in the hole and the oven read as a lamp with a shade on it.)
      glow(new THREE.BoxGeometry(mw - 0.06, mh - 0.1, 0.05), base.clone().multiply(M4(0, my + mh / 2, d / 2 - ch + 0.04)),
        mixHex(PAL.flower.red, PAL.paint.gold, 0.45));
      for (let k = 0; k < 3; k++) add('wood', new THREE.CylinderGeometry(0.05, 0.045, mw * 0.7, 6),
        M4((k - 1) * 0.11, my + 0.09, d / 2 - ch * 0.62, 0, 0, Math.PI / 2), PAL.wood.dark);
      for (let k = 0; k < 9; k++) {
        const fx = ((k % 5) / 4 - 0.5) * mw * 0.74, tall = 0.16 + ((k * 7) % 3) * 0.1;
        glow(new THREE.ConeGeometry(0.055 + (k % 2) * 0.02, tall, 6),
          base.clone().multiply(M4(fx, my + 0.1 + tall / 2, d / 2 - ch * 0.5 - (k % 3) * 0.07)),
          k % 3 === 0 ? PAL.flower.red : k % 3 === 1 ? PAL.paint.gold : PAL.flower.yellow);
      }
    }
    // a chimney breast so the oven reads as connected to the roof
    add('stone', boxUV(0.66, 0.8, 0.62, Tex.worldSize('stone')), M4(0, body + 0.44, -d * 0.16), PAL.stone.mid);
    if (peel) {
      // the baker's peel, stood on its blade against the side of the oven
      const lean = 0.2;
      add('wood', new THREE.CylinderGeometry(0.028, 0.034, 1.7, 6), M4(w / 2 + 0.3, 0.86, d / 2 - 0.34, 0, 0, lean), PAL.wood.light);
      add('wood', boxUV(0.36, 0.035, 0.3, 1), M4(w / 2 + 0.47, 0.05, d / 2 - 0.34, 0, 0, lean), PAL.wood.light);
      kit.contact(x + w * 0.55, z + d * 0.2, 0.2, 0.6);
    }
    kit.contact(x, z, 1.0, 0.6, { rx: w * 0.6, rz: d * 0.7, rot });
    count('oven');
    return { x, z, mouth: my + mh / 2 };
  });

  /** A tray of loaves — the reason a bakery is worth walking into. */
  kit.loafTray = (x, z, rot = 0, { n = 4, y = 0.88, seed = 23 } = {}) => safe('loafTray', () => {
    const r = mulberry(seed);
    const base = M4(x, y, z, rot);
    addTo('wood', boxUV(0.9, 0.04, 0.5, 0.9), base.clone(), PAL.wood.light);
    for (const sx of [-1, 1]) addTo('wood', boxUV(0.9, 0.07, 0.04, 1), base.clone().multiply(M4(0, 0.05, sx * 0.24)), PAL.wood.mid);
    for (let k = 0; k < n; k++) {
      const g = new THREE.SphereGeometry(0.11, 10, 8); g.scale(1.5, 0.85, 1.0);
      addTo('thatch', g, base.clone().multiply(M4(-0.32 + k * (0.64 / Math.max(1, n - 1)), 0.1, (r() - 0.5) * 0.1, (r() - 0.5) * 0.3)),
        mixHex(PAL.thatch.mid, PAL.thatch.light, r()));
    }
    count('loaves');
    return { x, z };
  });

  // ── a mill ─────────────────────────────────────────────────────────────────────────────────────────────────
  /** The millstones, the hopper above them and the great gear on the shaft. Turns, slowly, forever. */
  kit.millstones = (x, z, { r = 0.95, y = 0.0, turn = true } = {}) => safe('millstones', () => {
    const base = M4(x, y, z);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    // the tun (the wooden case round the stones)
    add('wood', new THREE.CylinderGeometry(r + 0.1, r + 0.1, 0.62, 18, 1, true), M4(0, 0.62, 0), PAL.wood.mid);
    // 'plaster' is the kit's SMOOTH surface: on the stone texture a millstone came out as a chequerboard.
    add('plaster', new THREE.CylinderGeometry(r, r, 0.28, 20), M4(0, 0.45, 0), PAL.stone.mid);
    add('plaster', new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.26, 20), M4(0, 0.74, 0), mixHex(PAL.stone.light, PAL.plaster.light, 0.3));
    add('plaster', new THREE.TorusGeometry(r * 0.98, 0.04, 6, 22), M4(0, 0.87, 0, 0, Math.PI / 2), PAL.stone.mid);
    add('plaster', new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), M4(0, 0.9, 0), PAL.paint.iron);        // the eye
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood', boxUV(0.16, 0.34, 0.16, 1.2), M4(sx * r * 0.72, 0.17, sz * r * 0.72), PAL.wood.beam);
    // the hopper on its frame
    const hop = new THREE.CylinderGeometry(0.62, 0.16, 0.66, 4);
    add('wood', hop, M4(0, 1.5, 0, Math.PI / 4), PAL.wood.light);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood', boxUV(0.09, 1.2, 0.09, 1.2), M4(sx * 0.58, 1.5, sz * 0.58), PAL.wood.beam);
    add('wood', boxUV(0.22, 0.34, 0.16, 1), M4(0, 1.12, 0.06, 0, 0, 0.2), PAL.wood.mid);       // the shoe
    kit.contact(x, z, r * 1.1, 0.7);
    count('millstones');
    void turn;
    return { x, z };
  });

  /**
   * The great gear, upright on a horizontal shaft, turning. THE thing a child stands and watches in a mill.
   * (The first version put a spur wheel on the upright shaft UNDER the floor, where nobody could ever see it,
   * so the one room in the village with a machine in it had nothing moving in the frame.)
   * Its own mesh, not a bucket, because it rotates.
   */
  kit.millGear = (x, z, rot = 0, { r = 0.9, teeth = 18, speed = 0.5, y = 0.98 } = {}) => safe('millGear', () => {
    const parts = [];
    const push = (g, m, c) => parts.push(prep(g, c).applyMatrix4(m));
    // the gear lies in its own XY plane and spins about Z
    push(new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.2, 10), M4(0, 0, 0, 0, Math.PI / 2), PAL.paint.iron);
    push(new THREE.TorusGeometry(r, 0.07, 7, 30), M4(0, 0, 0), PAL.wood.mid);
    push(new THREE.TorusGeometry(r * 0.3, 0.05, 6, 20), M4(0, 0, 0), PAL.wood.beam);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      push(boxUV(r * 0.72, 0.09, 0.1, 1), M4(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, 0, 0, 0, a), PAL.wood.light);
    }
    for (let k = 0; k < teeth; k++) {
      const a = (k / teeth) * TAU;
      push(boxUV(0.15, 0.09, 0.11, 1), M4(Math.cos(a) * (r + 0.07), Math.sin(a) * (r + 0.07), 0, 0, 0, a), PAL.wood.dark);
    }
    const geo = mergeGeometries(parts);
    if (!geo) return null;
    const mesh = new THREE.Mesh(geo, makeToon({ vertexColors: true }, TOON_PRESETS.default || {}));
    mesh.name = 'mill-gear'; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    scene.add(mesh);
    kit.animators.push((t) => { mesh.rotation.z = t * speed; });
    // the bearing blocks the shaft turns in
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (const sg of [-1, 1]) {
      const bx = x + sg * 0.34 * c, bz = z - sg * 0.34 * sn;
      addTo('wood', boxUV(0.22, y + 0.2, 0.3, 1.2), M4(bx, (y + 0.2) / 2 - 0.1, bz, rot), PAL.wood.beam);
      kit.contact(bx, bz, 0.2, 0.7);
    }
    count('millGear');
    return { x, z, mesh };
  });

  /**
   * A soft flat stain on the floor: spilt flour, a worn path, the clean rectangle where the wagon stands. Uses the
   * contact-pool trick in reverse — a plain flat plate just above the boards, no texture, no z-fight.
   */
  kit.floorPatch = (x, z, { rx = 1, rz = 1, rot = 0, color = PAL.plaster.light, lift = 0.014, rect = false, seed = 3 } = {}) => safe('floorPatch', () => {
    const r = mulberry(seed);
    const geo = rect ? new THREE.PlaneGeometry(rx * 2, rz * 2) : new THREE.CircleGeometry(1, 20).scale(rx, rz, 1);
    geo.rotateX(-Math.PI / 2);
    addTo('plaster', geo, M4(x, lift, z, rot), color);
    if (!rect) for (let k = 0; k < 3; k++) {
      const a = r() * TAU, dd = 0.6 + r() * 0.6;
      const g2 = new THREE.CircleGeometry(1, 14).scale(rx * 0.3 * dd, rz * 0.3 * dd, 1).rotateX(-Math.PI / 2);
      addTo('plaster', g2, M4(x + Math.cos(a) * rx * 0.9, lift - 0.002, z + Math.sin(a) * rz * 0.9), color);
    }
    count('floorPatch');
    return { x, z };
  });

  /** A wall of pegs with harness, a scythe, a coil of rope and a lantern: the working end of a barn. */
  kit.toolRack = (x, z, rot = 0, { w = 3.0, h = 2.1, seed = 7 } = {}) => safe('toolRack', () => {
    const base = M4(x, 0, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const r = mulberry(seed);
    add('wood', boxUV(w, 0.14, 0.16, 1.2), M4(0, h * 0.78, 0.02), PAL.wood.beam);            // the peg rail
    add('wood', boxUV(w, 0.12, 0.14, 1.2), M4(0, h * 0.36, 0.02), PAL.wood.beam);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const lx = -w / 2 + (k + 0.5) * (w / n);
      add('wood', new THREE.CylinderGeometry(0.03, 0.026, 0.2, 6), M4(lx, h * 0.78, 0.12, 0, 0, Math.PI / 2, 1), PAL.wood.dark);
      const pick = (k + (r() < 0.5 ? 0 : 1)) % 4;
      if (pick === 0) {                                                                       // a hank of harness
        for (let b2 = 0; b2 < 3; b2++) add('paint', new THREE.TorusGeometry(0.15 + b2 * 0.04, 0.035, 5, 14),
          M4(lx, h * 0.78 - 0.18 - b2 * 0.05, 0.14), PAL.cloth.leather);
        add('paint', new THREE.SphereGeometry(0.04, 7, 6), M4(lx, h * 0.78 - 0.42, 0.14), PAL.paint.gold);
      } else if (pick === 1) {                                                                // a coil of rope
        for (let b2 = 0; b2 < 2; b2++) add('paint', new THREE.TorusGeometry(0.17, 0.045, 5, 16), M4(lx, h * 0.78 - 0.2 - b2 * 0.06, 0.14), PAL.cloth.rope);
      } else if (pick === 2) {                                                                // a bridle strap
        add('paint', boxUV(0.06, 0.6, 0.03, 1), M4(lx, h * 0.78 - 0.32, 0.14, 0, 0, 0.06), PAL.cloth.leather);
        add('paint', new THREE.TorusGeometry(0.09, 0.02, 4, 12), M4(lx, h * 0.78 - 0.64, 0.14), PAL.paint.iron);
      } else {                                                                                // a bucket
        add('wood', new THREE.CylinderGeometry(0.13, 0.1, 0.24, 12), M4(lx, h * 0.78 - 0.3, 0.16), PAL.wood.mid);
        add('paint', new THREE.TorusGeometry(0.115, 0.014, 4, 12), M4(lx, h * 0.78 - 0.2, 0.16, 0, Math.PI / 2), PAL.paint.iron);
      }
    }
    // a scythe and a pitchfork leaning in the corner of the rack
    add('wood', new THREE.CylinderGeometry(0.03, 0.035, 1.9, 6), M4(w / 2 - 0.2, 0.95, 0.24, 0, 0, 0.12), PAL.wood.light);
    add('paint', new THREE.TorusGeometry(0.3, 0.02, 4, 14, Math.PI * 0.7), M4(w / 2 - 0.42, 1.75, 0.24, 0, 0, -0.5), PAL.stone.light);
    kit.contact(x, z, 0.5, 0.5, { rx: w * 0.5, rz: 0.3, rot });
    count('toolRack');
    return { x, z };
  });

  /** A stone font: a plinth, a stem, a round basin with a rim, and cold water in it. */
  kit.font = (x, z, { r = 0.42, h = 0.9 } = {}) => safe('font', () => {
    const base = M4(x, 0, z);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('stone', boxUV(r * 2.1, 0.12, r * 2.1, Tex.worldSize('stone')), M4(0, 0.06, 0), PAL.stone.mid);
    add('plaster', new THREE.CylinderGeometry(r * 0.42, r * 0.56, h - 0.34, 12), M4(0, 0.12 + (h - 0.34) / 2, 0), PAL.stone.light);
    add('plaster', new THREE.CylinderGeometry(r, r * 0.66, 0.26, 14), M4(0, h - 0.06, 0), PAL.stone.light);
    add('plaster', new THREE.TorusGeometry(r, 0.045, 6, 18), M4(0, h + 0.06, 0, 0, Math.PI / 2), PAL.stone.mid);
    add('paint', new THREE.CircleGeometry(r * 0.88, 16).rotateX(-Math.PI / 2), M4(0, h + 0.04, 0), PAL.water.light);
    kit.contact(x, z, r * 1.2, 0.7);
    count('font');
    return { x, z };
  });

  // ── a barn ─────────────────────────────────────────────────────────────────────────────────────────────────
  /** A heap of loose hay, with a pitchfork stuck in it if you like. */
  kit.hayPile = (x, z, rot = 0, { w = 2.2, d = 1.6, h = 0.9, seed = 31, fork = false } = {}) => safe('hayPile', () => {
    const r = mulberry(seed);
    const base = M4(x, 0, z, rot);
    for (let k = 0; k < 7; k++) {
      const g = new THREE.SphereGeometry(0.5, 9, 7);
      g.scale(w / 2.4 * (0.7 + r() * 0.5), h / 1.4 * (0.6 + r() * 0.5), d / 2.0 * (0.7 + r() * 0.5));
      addTo('thatch', g, base.clone().multiply(M4((r() - 0.5) * w * 0.6, h * 0.34 + (r() - 0.5) * 0.2, (r() - 0.5) * d * 0.5)),
        mixHex(PAL.thatch.pale, PAL.thatch.light, r() * 0.8));
    }
    // loose straws so the silhouette is not a row of eggs
    for (let k = 0; k < 46; k++) {
      const a = r() * TAU, rr = r() * 1.0;
      addTo('thatch', new THREE.CylinderGeometry(0.014, 0.014, 0.34 + r() * 0.4, 4),
        base.clone().multiply(M4(Math.cos(a) * w * 0.46 * rr, h * (0.2 + r() * 0.5), Math.sin(a) * d * 0.46 * rr, a, 0, 0.5 + r() * 0.9)),
        r() < 0.4 ? PAL.thatch.mid : PAL.thatch.pale);
    }
    if (fork) {
      addTo('wood', new THREE.CylinderGeometry(0.03, 0.035, 1.7, 6), base.clone().multiply(M4(w * 0.3, 0.95, -d * 0.1, 0, 0, 0.3)), PAL.wood.light);
      for (let k = -1; k <= 1; k++) addTo('paint', new THREE.CylinderGeometry(0.014, 0.008, 0.38, 5),
        base.clone().multiply(M4(w * 0.3 + 0.5 + k * 0.06, 0.28, -d * 0.1, 0, 0, 0.3)), PAL.paint.iron);
    }
    kit.contact(x, z, 0.9, 0.7, { rx: w * 0.5, rz: d * 0.5, rot });
    count('hay');
    return { x, z };
  });

  /**
   * Loose straw trodden across a floor. Real little cylinders lying flat, not a coloured disc — measured
   * (shots/P06-demo2/05-barn): a flat pale patch on a cobbled floor reads as a puddle of custard, every time.
   */
  kit.strawScatter = (x, z, { n = 14, r = 0.7, seed = 5, color = PAL.thatch.light } = {}) => safe('strawScatter', () => {
    const rr = mulberry(seed);
    for (let k = 0; k < n; k++) {
      const a = rr() * TAU, d = Math.sqrt(rr()) * r;
      addTo('thatch', new THREE.CylinderGeometry(0.014, 0.014, 0.2 + rr() * 0.22, 4),
        M4(x + Math.cos(a) * d, 0.03, z + Math.sin(a) * d, rr() * TAU, 0, Math.PI / 2),
        rr() < 0.35 ? PAL.thatch.mid : color);
    }
    count('straw');
    return { x, z };
  });

  /** A stall divider: the boarded partition between one animal and the next. */
  kit.stallDivider = (x, z, rot = 0, { w = 2.6, h = 1.25 } = {}) => safe('stallDivider', () => {
    const base = M4(x, 0, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    const n = Math.max(3, Math.round(w / 0.4));
    for (let k = 0; k < n; k++) add('wood', boxUV(w / n - 0.02, h * 0.62, 0.09, 0.9), M4(-w / 2 + (k + 0.5) * (w / n), h * 0.31, 0), k % 2 ? PAL.wood.mid : PAL.wood.light);
    add('wood', boxUV(w, 0.12, 0.14, 1.2), M4(0, h * 0.64, 0), PAL.wood.beam);
    for (const sx of [-1, 1]) add('wood', boxUV(0.14, h, 0.14, 1.2), M4(sx * (w / 2 - 0.07), h / 2, 0), PAL.wood.beam);
    add('wood', boxUV(w, 0.1, 0.1, 1.2), M4(0, h - 0.05, 0), PAL.wood.beam);
    kit.contact(x, z, 0, 0.6, { rx: w * 0.5, rz: 0.12, rot });
    count('stall');
    return { x, z };
  });

  /** A manger of hay on a stall wall. */
  kit.manger = (x, z, rot = 0, { w = 1.2, y = 0.5 } = {}) => safe('manger', () => {
    const base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(w, 0.34, 0.06, 0.9), M4(0, 0, 0.2), PAL.wood.mid);
    add('wood', boxUV(w, 0.34, 0.06, 0.9), M4(0, 0.06, -0.2, 0, -0.25), PAL.wood.mid);
    add('wood', boxUV(w, 0.06, 0.44, 0.9), M4(0, -0.16, 0), PAL.wood.dark);
    for (const sx of [-1, 1]) add('wood', boxUV(0.06, 0.4, 0.44, 0.9), M4(sx * w / 2, 0, 0), PAL.wood.beam);
    // a bed of hay, then a few thick straws out of it (hairline cylinders read as pencil scribble)
    const rr = mulberry(Math.abs((x * 17 + z * 11) | 0) + 5);
    const bed = new THREE.SphereGeometry(0.2, 10, 7); bed.scale(w * 2.1, 0.5, 1.5);
    add('thatch', bed, M4(0, 0.1, 0), PAL.thatch.light);
    for (let k = 0; k < 7; k++) {
      const a = rr() * TAU;
      add('thatch', new THREE.CylinderGeometry(0.026, 0.024, 0.2 + rr() * 0.16, 5),
        M4((rr() - 0.5) * w * 0.7, 0.16 + rr() * 0.06, (rr() - 0.5) * 0.24, a, 0, 0.8 + rr() * 0.6),
        rr() < 0.4 ? PAL.thatch.mid : PAL.thatch.pale);
    }
    count('manger');
    return { x, z };
  });

  // ── the small life ─────────────────────────────────────────────────────────────────────────────────────────
  const CATS = { ginger: PAL.char.carrot, grey: PAL.stone.mid, tan: PAL.dirt.light, white: PAL.cloth.cream, black: PAL.char.coal };
  /**
   * The cat asleep by the hearth. A closed comma of a cat with its tail round its nose, breathing.
   * It is its own little mesh (not a bucket) so it can breathe — the rubric asks that nothing living is a statue.
   */
  kit.sleepingCat = (x, z, rot = 0, { tint = 'ginger', s = 1.3, y = 0 } = {}) => safe('sleepingCat', () => {
    const body = CATS[tint] || CATS.ginger;
    const pale = mixHex(body, PAL.cloth.cream, 0.55);
    const parts = [];
    const push = (g, m, c) => parts.push(prep(g, c).applyMatrix4(m));
    // body: a fat comma
    const b = new THREE.SphereGeometry(0.19 * s, 14, 10); b.scale(1.35, 0.86, 1.0);
    push(b, M4(0, 0.16 * s, 0), body);
    // haunch
    const hq = new THREE.SphereGeometry(0.14 * s, 12, 9); hq.scale(1.0, 0.92, 1.0);
    push(hq, M4(-0.14 * s, 0.15 * s, 0.05 * s), body);
    // head, tucked down at the front but big enough to read as a head at gameplay distance
    const hd = new THREE.SphereGeometry(0.145 * s, 12, 10); hd.scale(1.0, 0.94, 0.94);
    push(hd, M4(0.24 * s, 0.17 * s, -0.02 * s, 0.4), body);
    push(new THREE.SphereGeometry(0.07 * s, 9, 7), M4(0.35 * s, 0.13 * s, 0.0), pale);         // muzzle
    push(new THREE.SphereGeometry(0.022 * s, 6, 5), M4(0.41 * s, 0.15 * s, 0.0), PAL.char.eye); // nose
    for (const sx of [-1, 1]) {
      const ear = new THREE.ConeGeometry(0.06 * s, 0.12 * s, 4);
      push(ear, M4(0.2 * s, 0.3 * s, sx * 0.085 * s, 0, 0, sx * 0.3), body);
      push(new THREE.ConeGeometry(0.032 * s, 0.07 * s, 4), M4(0.215 * s, 0.3 * s, sx * 0.085 * s, 0, 0, sx * 0.3), pale);
    }
    // closed eyes: two little dark arcs
    for (const sx of [-1, 1]) push(new THREE.BoxGeometry(0.05 * s, 0.011 * s, 0.014 * s), M4(0.3 * s, 0.185 * s, sx * 0.055 * s), PAL.char.eye);
    // the tail, round the nose
    for (let k = 0; k < 10; k++) {
      const t = k / 9, a = -1.1 + t * 3.5;
      push(new THREE.SphereGeometry((0.058 - t * 0.016) * s, 7, 6),
        M4((-0.02 + Math.cos(a) * 0.3) * s, 0.085 * s, (0.26 + Math.sin(a) * 0.22) * s), k % 3 ? body : pale);
    }
    // two front paws
    for (const sx of [-1, 1]) push(new THREE.SphereGeometry(0.05 * s, 8, 6), M4(0.27 * s, 0.06 * s, sx * 0.08 * s), pale);
    const geo = mergeGeometries(parts);
    if (!geo) return null;
    const mat = makeToon({ vertexColors: true }, TOON_PRESETS.default || {});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'hearth-cat';
    mesh.castShadow = true; mesh.receiveShadow = true;
    // an ink line, like every character and key prop in the approved look: without it a curled cat is one
    // orange blob on the floorboards at gameplay distance.
    withOutline(mesh, OUTLINE.char * 0.8);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    scene.add(mesh);
    kit.animators.push((t) => {
      const br = 1 + Math.sin(t * 1.15) * 0.035;                     // the slow rise and fall of a sleeping cat
      mesh.scale.set(1, br, 1 + (br - 1) * 0.5);
      mesh.position.y = y + (br - 1) * 0.02;
    });
    kit.contact(x, z, 0.24 * s, 0.6, { rx: 0.3 * s, rz: 0.2 * s, rot });
    count('cat');
    return { x, z, mesh };
  });

  /** Dust in the light: the one thing in a quiet room that moves on its own. */
  kit.dustMotes = (x, z, { n = 22, w = 1.4, h = 1.6, d = 1.4, y = 0.5, color = null } = {}) => safe('dustMotes', () => {
    const geo = prep(new THREE.IcosahedronGeometry(0.02, 0), color || mixHex(PAL.interior.lamp, PAL.plaster.light, 0.4));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.name = 'dust'; mesh.frustumCulled = false; mesh.userData.camIgnore = true;
    scene.add(mesh);
    const r = mulberry(((x * 31 + z * 17) | 0) + 101);
    const seeds = Array.from({ length: n }, () => ({ x: x + (r() - 0.5) * w, y: y + r() * h, z: z + (r() - 0.5) * d, ph: r() * 6.28 }));
    const mx = new THREE.Matrix4();
    kit.animators.push((t) => {
      for (let i = 0; i < seeds.length; i++) {
        const s0 = seeds[i];
        mx.makeTranslation(s0.x + Math.sin(t * 0.32 + s0.ph) * 0.24, s0.y + Math.sin(t * 0.21 + s0.ph * 1.7) * 0.3, s0.z + Math.cos(t * 0.27 + s0.ph) * 0.2);
        mesh.setMatrixAt(i, mx);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
    count('dust');
    return mesh;
  });

  /** A sword on two pegs, high up on a wall. The thing a six-year-old asks about and cannot have. */
  kit.wallSword = (x, z, rot = 0, { y = 1.85, len = 1.1, mark = true } = {}) => safe('wallSword', () => {
    const base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    for (const sg of [-1, 1]) add('wood', new THREE.CylinderGeometry(0.03, 0.026, 0.14, 6), M4(sg * len * 0.28, -0.06, 0.07, 0, 0, Math.PI / 2), PAL.wood.dark);
    add('paint', boxUV(len, 0.07, 0.022, 1), M4(0, 0, 0.11), PAL.stone.light);                  // the blade
    add('paint', boxUV(0.03, 0.05, 0.03, 1), M4(len / 2 - 0.02, 0, 0.11), PAL.stone.light);
    add('paint', boxUV(0.05, 0.2, 0.05, 1), M4(-len / 2 + 0.03, 0, 0.11), PAL.paint.gold);      // the guard
    add('wood', new THREE.CylinderGeometry(0.03, 0.033, 0.2, 7), M4(-len / 2 - 0.12, 0, 0.11, 0, 0, Math.PI / 2), PAL.cloth.leather);
    add('paint', new THREE.SphereGeometry(0.042, 8, 6), M4(-len / 2 - 0.23, 0, 0.11), PAL.paint.gold);
    // the pencil mark on the wall where somebody measured himself, which is quite a low mark
    if (mark) add('paint', boxUV(0.2, 0.012, 0.01, 1), M4(0.1, -0.78, 0.035), PAL.wood.dark);
    count('sword');
    return { x, y, z };
  });

  /** A framed sampler / painting on a wall — two lines of "stitching" and a frame. */
  kit.wallPicture = (x, z, rot = 0, { y = 1.65, w = 0.6, h = 0.46, color = PAL.cloth.cream } = {}) => safe('wallPicture', () => {
    const base = M4(x, y, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('wood', boxUV(w + 0.08, h + 0.08, 0.05, 1), M4(0, 0, 0), PAL.wood.beam);
    add('paint', boxUV(w, h, 0.02, 1), M4(0, 0, 0.03), color);
    for (const ly of [h * 0.18, -h * 0.12]) add('paint', boxUV(w * 0.6, 0.02, 0.01, 1), M4(0, ly, 0.045), PAL.cloth.red);
    add('paint', new THREE.ConeGeometry(0.06, 0.1, 3), M4(0, -h * 0.28, 0.045, 0, 0, 0), PAL.foliage.mid);
    count('picture');
    return { x, z };
  });

  /** A boarded stair up to a loft, with a handrail. Local -z is up. */
  kit.roomStair = (x, z, rot = 0, { w = 1.5, rise = 0.26, run = 0.34, n = 7, rail = true } = {}) => safe('roomStair', () => {
    const base = M4(x, 0, z, rot);
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    for (let k = 0; k < n; k++) {
      const lz = -(k + 0.5) * run, y = (k + 1) * rise;
      add('wood', boxUV(w, 0.08, run + 0.02, 1), M4(0, y - 0.04, lz), k % 2 ? PAL.wood.light : PAL.wood.mid);
      add('wood', boxUV(w - 0.06, rise, 0.06, 1), M4(0, y - rise / 2, lz - run / 2), PAL.wood.dark);
    }
    if (rail) {
      add('wood', boxUV(0.1, 0.95, 0.1, 1.2), M4(-w / 2 + 0.05, 0.47, 0), PAL.wood.beam);
      add('wood', boxUV(0.1, 0.95 + n * rise, 0.1, 1.2), M4(-w / 2 + 0.05, (0.95 + n * rise) / 2, -n * run), PAL.wood.beam);
      add('wood', boxUV(0.09, 0.09, n * run + 0.2, 1), M4(-w / 2 + 0.05, 0.95 + n * rise * 0.5, -n * run / 2, 0, Math.atan2(n * rise, n * run)), PAL.wood.light);
    }
    kit.contact(x, z - n * run / 2, 0, 0.45, { rx: w * 0.55, rz: n * run * 0.55, rot });
    count('stair');
    return { x, z, top: n * rise };
  });

  /**
   * Finish an interior: flush the kit's buckets AND build the light shafts. Call INSTEAD of kit.flush().
   * (kit.flush() alone still works; the shafts would just never appear.)
   */
  kit.flushInterior = () => {
    const out = kit.flush();
    const shafts = buildShafts();
    if (shafts) out.push(shafts);
    return out;
  };

  return kit;
}

export default interiorRecipes;
