/**
 * hollybank.js — HOLLYBANK COTTAGE: Bram's home, and the first room in the game.          (P23 base map, art P05)
 *
 * CANON §2 [02] `hollybank`, kind `interior`. WORLD-BIBLE §3 describes it by hand and this file follows it word
 * for word: "kitchen with a hearth, a table with three chairs (one is Father's and is bigger), a ladder to a loft
 * with the hero's bed, a chest at its foot, and a window that looks at the chestnut tree." CANON §5 B1 happens in
 * this room — name the hero, get up, search four containers, take Papa his boots — so there are exactly four
 * searchable containers on the ground floor and Halvard's boots stand by the door.
 *
 * It is the room ten doors in Puddlewick were promising and not delivering (P23 gap #6): the village's
 * `to: 'hollybank'` door exit lands here, and the doorway here lands you back on your own doorstep.
 *
 * Coordinates: world units, centred (origin [-7, -6], 14 x 12 tiles, WORLD-BIBLE's size). Local +z is SOUTH — the
 * wall the front door is in, the same convention the exterior kit uses. The loft is a half-storey at y = 1.12
 * reached by a steep boarded cottage stair on the east side; `walkY` lifts you onto it tread by tread.
 *
 * DATA first (the room, the furniture spots, colliders, the exit) and ART second (view()). Its people and words
 * are the layer src/world/maps/hollybank.npcs.js (P11), its treasure src/world/maps/hollybank.chests.js (P30).
 */
import * as THREE from 'three';
import { PAL, C3, mixHex } from '../../art/palette.js';
import { makeAOMask } from '../../art/toon.js';
import { Sfx } from '../../audio/sfx.js';
import { reportError } from '../../engine/debug.js';
import { createKit, prep } from '../scenery.js';
import { puddlewickDoorstep } from './puddlewick.js';

// ── the room ────────────────────────────────────────────────────────────────────────────────────────────────
// The room fills its 14 x 12 plot. It is generous ON PURPOSE: measured in the running build, P09's occluder fade
// ghosts anything whose surface is within 2.2 units of the lens, and the lens sits ~2 units behind the boy — so a
// small room put a 19%-alpha wall over the whole frame and every interior shot came out brown mud. With the walls
// this far out and the arrival two steps in from the door, the nearest wall is 2.2+ from the lens and the frame
// is the room, not a smear.
const W = 12.6, D = 10.6, H = 2.45;               // inside width, depth and head height
const HW = W / 2, HD = D / 2;
const T = 0.34;                                   // wall thickness
const DX = -2.8, DW = 1.3, DH = 2.15;             // the front door: where it is, how wide, how tall
const LOFT_Y = 1.15;                              // the half-storey
const LOFT_X0 = 2.0, LOFT_Z1 = 1.0;               // the loft fills x > LOFT_X0, z < LOFT_Z1
const STAIR_X0 = 4.3, STAIR_Z0 = 1.0, STAIR_Z1 = 4.2, STEPS = 8;

/** Everything the people layer, the treasure layer and the scenarios need to know about this room. */
const SPOTS = {
  door: { x: DX, z: 0.8, facing: Math.PI },                // where you arrive: two steps in, facing the room
  hearth: { x: -2.8, z: -4.7, rot: 0 },
  hearthside: { x: -2.8, z: -3.35, facing: Math.PI },      // where somebody stands to sing at a kettle
  table: { x: -2.4, z: -1.5, rot: 0 },
  fatherChair: { x: -2.4, z: -2.85, rot: 0 },
  chairA: { x: -3.85, z: -0.2, rot: Math.PI },
  chairB: { x: -0.95, z: -0.2, rot: Math.PI },
  dresser: { x: -5.85, z: -2.4, rot: Math.PI / 2 },
  shelf: { x: 0.4, z: -5.12, rot: 0 },
  rug: { x: -2.4, z: 1.5, rot: 0 },
  boots: { x: -4.7, z: 4.1 },
  waterPot: { x: -0.7, z: -4.75 },
  basket: { x: -5.5, z: 3.1 },
  crock: { x: 0.7, z: -4.55 },
  bed: { x: 4.15, z: -3.4, rot: 0, y: LOFT_Y },
  chest: { x: 4.15, z: -1.5, rot: 0, y: LOFT_Y },
  loftWindow: { x: HW, z: -3.0, y: LOFT_Y + 0.72 },
  cat: { x: -1.3, z: -3.7 },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const onLoft = (x, z) => x > LOFT_X0 && z < LOFT_Z1 && z > -HD - 0.3 && x < HW + 0.3;
const onStair = (x, z) => x > STAIR_X0 && z >= STAIR_Z0 && z <= STAIR_Z1;
/** The height of the floor you are standing on: the boards, a tread of the loft stair, or the loft itself. */
function floorY(x, z) {
  if (onLoft(x, z)) return LOFT_Y;
  if (onStair(x, z)) {
    const t = clamp((STAIR_Z1 - z) / (STAIR_Z1 - STAIR_Z0), 0, 1);
    return LOFT_Y * (Math.ceil(t * STEPS) / STEPS);
  }
  return 0;
}

const hollybank = {
  id: 'hollybank',
  name: 'Hollybank Cottage',
  kind: 'interior',
  size: [14, 12],
  origin: [-7, -6],
  res: 4,
  theme: 'wood',
  // CANON §9: `village` is the home motif, and this is the home. It plays quieter indoors (the mixer's job).
  music: 'village',
  hours: 15.6,
  light: { preset: 'interior' },
  weather: 'clear',
  encounters: null,
  spawn: { x: SPOTS.door.x, z: SPOTS.door.z, facing: Math.PI },
  // A room is looked DOWN into, not along: at pitch 40 the lens sat level with the south wall and every frame was
  // half a ghosted wall. 52 degrees clears it. `mode: 'world'` is asked for deliberately — the interior preset
  // frames the boy at 26% of frame height, which is a portrait of a boy on some floorboards; the wide preset
  // frames him at 18% and shows him the ROOM, which is the thing a child came in here to look at.
  camera: { mode: 'world', orbit: 0, pitch: 52, dist: 6.0, fov: 52, lookUp: 1.25 },

  tiles: {
    height: () => 0,
    solid(x, z) { return Math.abs(x) > HW - 0.02 || Math.abs(z) > HD - 0.02; },
    ground(x, z) { return (Math.abs(x - SPOTS.hearth.x) < 1.7 && z < -2.6) ? 'stone' : 'wood'; },
  },
  walkY(x, z) { return floorY(x, z); },

  spots: SPOTS,

  colliders: [
    // the hearth, its hearthstone and the fire irons
    { type: 'box', x: SPOTS.hearth.x, z: SPOTS.hearth.z + 0.1, w: 2.9, d: 1.3, rot: 0, tag: 'hearth' },
    // the table and its three chairs
    { type: 'box', x: SPOTS.table.x, z: SPOTS.table.z, w: 2.0, d: 1.15, rot: 0, tag: 'table' },
    { type: 'circle', x: SPOTS.fatherChair.x, z: SPOTS.fatherChair.z, r: 0.32, tag: 'chair' },
    { type: 'circle', x: SPOTS.chairA.x, z: SPOTS.chairA.z, r: 0.28, tag: 'chair' },
    { type: 'circle', x: SPOTS.chairB.x, z: SPOTS.chairB.z, r: 0.28, tag: 'chair' },
    { type: 'box', x: SPOTS.dresser.x, z: SPOTS.dresser.z, w: 0.52, d: 1.6, rot: 0, tag: 'dresser' },
    { type: 'circle', x: SPOTS.waterPot.x, z: SPOTS.waterPot.z, r: 0.34, tag: 'pot' },
    { type: 'circle', x: SPOTS.basket.x, z: SPOTS.basket.z, r: 0.36, tag: 'basket' },
    { type: 'circle', x: SPOTS.crock.x, z: SPOTS.crock.z, r: 0.3, tag: 'crock' },
    // the loft: its rail is its west and south face, so the only way up is the stair
    { type: 'capsule', pts: [[LOFT_X0, -HD - 0.2], [LOFT_X0, LOFT_Z1]], r: 0.13, tag: 'loft-rail' },
    { type: 'capsule', pts: [[LOFT_X0, LOFT_Z1], [STAIR_X0, LOFT_Z1]], r: 0.13, tag: 'loft-rail' },
    { type: 'capsule', pts: [[STAIR_X0, STAIR_Z0], [STAIR_X0, STAIR_Z1 + 0.2]], r: 0.13, tag: 'stair-side' },
    // the bed and the chest, up on the loft
    { type: 'box', x: SPOTS.bed.x, z: SPOTS.bed.z, w: 1.25, d: 2.1, rot: 0, tag: 'bed' },
    { type: 'box', x: SPOTS.chest.x, z: SPOTS.chest.z, w: 0.95, d: 0.62, rot: 0, tag: 'chest' },
  ],

  // ── the way out: the front door, back onto Hollybank's own doorstep in Puddlewick ──
  get exits() {
    const back = puddlewickDoorstep('hollybank');
    return [{ x: DX, z: HD - 0.5, w: DW + 0.2, h: 0.9, to: 'puddlewick', tx: back.x, tz: back.z, kind: 'door',
      name: 'the front door', line: 'door-out', back: { x: DX, z: HD - 2.0 } }];
  },

  props: [
    { type: 'hearth', name: 'the hearth', x: SPOTS.hearth.x, z: SPOTS.hearth.z + 0.75, line: 'hearth', reach: 2.0, height: 1.7 },
    { type: 'table', name: 'the table', x: SPOTS.table.x, z: SPOTS.table.z, line: 'table', reach: 1.9, height: 1.0 },
    { type: 'chair', name: "Father's chair", x: SPOTS.fatherChair.x, z: SPOTS.fatherChair.z, line: 'big-chair', reach: 1.6, height: 1.2 },
    { type: 'dresser', name: 'the dresser', x: SPOTS.dresser.x + 0.5, z: SPOTS.dresser.z, line: 'dresser', reach: 1.6, height: 1.7 },
    { type: 'window', name: 'the window', x: -5.0, z: HD - 0.7, line: 'window', reach: 1.9, height: 1.5 },
    { type: 'boots', name: "Papa's boots", x: SPOTS.boots.x, z: SPOTS.boots.z, line: 'boots', reach: 1.7, height: 0.6 },
    { type: 'bed', name: 'your bed', x: SPOTS.bed.x - 0.85, z: SPOTS.bed.z, line: 'bed', reach: 1.7, height: 1.0 },
    { type: 'window', name: 'the loft window', x: SPOTS.loftWindow.x - 0.7, z: SPOTS.loftWindow.z, line: 'loft-window', reach: 1.7, height: 1.6 },
    { type: 'shelf', name: 'the shelf', x: SPOTS.shelf.x, z: SPOTS.shelf.z + 0.5, line: 'shelf', reach: 1.6, height: 1.8 },
  ],

  // ── the four containers CANON §5 B1 asks a six-year-old to search, and the chest at the foot of the bed ──
  chests: [
    { id: 'hollybank_sword', x: SPOTS.chest.x - 0.75, z: SPOTS.chest.z, kind: 'chest', item: 'wooden_sword',
      name: 'the chest at the foot of your bed', line: 'chest-sword', reach: 1.6 },
    { id: 'hollybank_pot', x: SPOTS.waterPot.x, z: SPOTS.waterPot.z + 0.55, kind: 'pot', name: 'the water pot', line: 'search-pot', reach: 1.5 },
    { id: 'hollybank_basket', x: SPOTS.basket.x + 0.5, z: SPOTS.basket.z, kind: 'basket', name: 'the log basket', line: 'search-basket', reach: 1.5 },
    { id: 'hollybank_crock', x: SPOTS.crock.x, z: SPOTS.crock.z + 0.5, kind: 'crock', name: 'the crock', line: 'search-crock', reach: 1.5 },
    { id: 'hollybank_drawer', x: SPOTS.dresser.x + 0.55, z: SPOTS.dresser.z - 0.7, kind: 'drawer', name: 'the dresser drawer', line: 'search-drawer', reach: 1.5 },
  ],

  /** Default words — the people layer (hollybank.npcs.js, P11) may override any key. */
  lines: {
    'door-out': 'Out into the afternoon.',
    hearth: ['The fire is in. It is always in.', 'Somebody has left a kettle on the\nhook, and the kettle is singing.',
      'Badly. The kettle is singing badly.'],
    table: ['Three chairs. One is bigger than\nthe others, and nobody sits in it\nbut him.', 'There are crumbs. You did that.'],
    'big-chair': ["Father's chair. It is the right\nsize for him.", 'You have measured yourself\nagainst it since you could\nstand.'],
    dresser: ['Plates up on the rack, the good\nones at the back.', 'One of them is chipped and it is\nyour favourite.'],
    window: ['Out of the window: the chestnut\ntree, leaning over the well.',
      'You could climb it from here if\nthe window were a door.'],
    'loft-window': ['From up here you can see the\nwhole green, and the chestnut,\nand somebody arguing at the well.',
      'Home is a very small word for\nall of that.'],
    boots: ['{gold}Papa\'s boots{/gold}, dried out by the\nfire and left where he will trip\nover them.',
      'He will want these.'],
    bed: ['Your bed, under the roof, where\nthe rain sounds best.', 'It is made. Somebody else made\nit.'],
    shelf: 'Pots, three books and a wooden\nhorse with one ear.',
    'chest-sword': ['The chest at the foot of your bed.{wait:400}{n}Inside: a {gold}wooden sword{/gold}.',
      '"Father made it. Badly. On\npurpose."'],
    'search-pot': ['Bram looks in the water pot.{n}Water. Quite a lot of it.', 'And one leaf, sailing.'],
    'search-basket': 'Bram digs in the log basket.{n}Logs, and a woodlouse with plans.',
    'search-crock': ['Bram lifts the lid off the crock.{wait:300}{n}Oatcakes.', 'He takes one. He puts it back.\nHe takes it again.'],
    'search-drawer': ['Bram opens the dresser drawer.{n}String. A bent nail. A button\nnobody will ever find the coat\nfor.', 'Perfect. All of it.'],
    search: ['Bram searches the kitchen.{n}Everything is exactly where it\nlives.',
      'Bram looks under the table.{n}Crumbs. His crumbs.',
      'Bram checks the hearth.{n}Warm. Always warm.'],
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // the art
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  view({ scene, rig, App }) {
    const t0 = performance.now();
    const safe = (name, fn) => { try { return fn(); } catch (e) { reportError(`hollybank: ${name}`, e); return null; } };
    // a room is lit by its own fire, not by the sun: the interior rig, re-asserted below in case the clock runs
    safe('rig', () => {
      rig.apply('interior'); rig.dir.set(0.22, 0.96, 0.26).normalize();
      if (rig.sun) rig.sun.intensity *= 1.3;                 // a fire and four windows: a cottage is not a cave
      if (rig.hemi) rig.hemi.intensity *= 1.12;
      if (rig.setExtent) rig.setExtent(9);                   // a room is 12 m across: a tight shadow map keeps edges clean
    });
    // the dark surround a DQV dollhouse interior sits in: the room must read far brighter than it
    scene.background = C3(mixHex(PAL.shadow.contact, PAL.interior.dark, 0.55));
    scene.fog = null;                       // RIG_PRESETS.interior carries no fog: a room is not a distance

    const ao = makeAOMask({ span: 30, size: 512, center: [0, 0] });
    const kit = createKit({ scene, heightAt: () => 0, ao });
    // The kit's contact pools are tuned for grass; stacked on floorboards they turned the room into mud. Indoors
    // a piece of furniture gets a small, faint pool instead of a big soft one.
    const rawContact = kit.contact;
    kit.contact = (x, z, r, k = 0.85, o = {}) => rawContact(x, z, r * 0.62, k * 0.42,
      Object.assign({}, o, { rx: (o.rx ?? r) * 0.62, rz: (o.rz ?? r) * 0.62, spread: 1.0 }));

    const room = safe('shell', () => kit.roomShell({
      x: 0, z: 0, rot: 0, W, D, H, wall: 'plaster', wallTint: PAL.plaster.light, floor: 'wood', beams: false, ceiling: false,
      openings: [{ side: 'south', at: DX, w: DW, h: DH, kind: 'door' }],
      windows: [
        { side: 'south', at: -5.0, y: 1.35, w: 1.0, h: 0.9, shutter: PAL.paint.shutterGreen },
        { side: 'south', at: 2.2, y: 1.35, w: 1.0, h: 0.9, shutter: PAL.paint.shutterGreen },
        { side: 'west', at: 1.4, y: 1.35, w: 0.9, h: 0.85, shutter: PAL.paint.shutterGreen },
        { side: 'east', at: SPOTS.loftWindow.z, y: SPOTS.loftWindow.y, w: 0.9, h: 0.72, shutter: false },
      ],
    }));

    // ── the front door, standing a little open on the afternoon outside ──
    safe('door', () => {
      const day = mixHex(PAL.sky.horizon, PAL.plaster.light, 0.55);
      kit.addGlow(new THREE.BoxGeometry(DW - 0.06, DH - 0.06, 0.08), new THREE.Matrix4().setPosition(DX, (DH - 0.06) / 2, HD + T * 0.72), day);
      const leaf = new THREE.Matrix4().setPosition(DX - DW / 2, 0, HD + 0.02)
        .multiply(new THREE.Matrix4().makeRotationY(-0.72)).multiply(new THREE.Matrix4().setPosition(DW / 2, DH / 2, 0));
      kit.addTo('wood', new THREE.BoxGeometry(DW, DH, 0.09), leaf, PAL.paint.doorRed);
      kit.addTo('paint', new THREE.SphereGeometry(0.06, 8, 6),
        leaf.clone().multiply(new THREE.Matrix4().setPosition(DW / 2 - 0.14, -0.1, 0.07)), PAL.paint.iron);
    });

    // ── the kitchen: the hearth with the fire in, the table, three chairs (one is Father's) ──
    safe('hearth', () => kit.hearth(SPOTS.hearth.x, SPOTS.hearth.z, SPOTS.hearth.rot, { w: 2.0, h: 1.55 }));
    safe('table', () => kit.roomTable(SPOTS.table.x, SPOTS.table.z, SPOTS.table.rot, { w: 2.1, d: 1.15, top: 0.78,
      things: [{ kind: 'loaf', x: -0.45, z: -0.1 }, { kind: 'bowl', x: 0.35, z: 0.08, color: PAL.tile.light },
        { kind: 'candle', x: 0.72, z: -0.22 }, { kind: 'cup', x: -0.1, z: 0.24 }] }));
    safe('chairs', () => {
      kit.chair(SPOTS.fatherChair.x, SPOTS.fatherChair.z, SPOTS.fatherChair.rot, { big: true });
      kit.chair(SPOTS.chairA.x, SPOTS.chairA.z, SPOTS.chairA.rot, {});
      kit.chair(SPOTS.chairB.x, SPOTS.chairB.z, SPOTS.chairB.rot, {});
    });
    safe('dresser', () => kit.dresser(SPOTS.dresser.x, SPOTS.dresser.z, SPOTS.dresser.rot, { w: 1.6, h: 2.0 }));
    safe('shelf', () => kit.shelf(SPOTS.shelf.x, SPOTS.shelf.z, SPOTS.shelf.rot, { w: 1.5, y: 1.5, n: 2, seed: 12 }));
    safe('rug', () => kit.rug(SPOTS.rug.x, SPOTS.rug.z, 0.1, { w: 2.6, d: 1.7, color: PAL.cloth.red, seed: 4 }));
    safe('lamp', () => kit.roomLamp(SPOTS.table.x, SPOTS.table.z, H - 0.28, {}));

    // ── the small true things: Papa's boots by the door, the water pot, the log basket, the crock ──
    safe('boots', () => {
      const put = (x, z, rot) => {
        const m = (dx, dy, dz, ry) => new THREE.Matrix4().setPosition(x + dx, dy, z + dz).multiply(new THREE.Matrix4().makeRotationY(ry));
        kit.addTo('wood', new THREE.CylinderGeometry(0.115, 0.13, 0.42, 9), m(0, 0.21, 0, 0), PAL.cloth.leather);
        kit.addTo('wood', new THREE.BoxGeometry(0.2, 0.13, 0.34), m(0, 0.065, 0.14, rot), PAL.wood.dark);
      };
      put(SPOTS.boots.x - 0.13, SPOTS.boots.z, 0.1); put(SPOTS.boots.x + 0.14, SPOTS.boots.z + 0.06, -0.14);
      kit.contact(SPOTS.boots.x, SPOTS.boots.z, 0.3, 0.55);
    });
    safe('pots', () => {
      const pot = (x, z, r, h, col) => {
        kit.addTo('tile', new THREE.CylinderGeometry(r * 0.86, r * 0.7, h, 14), new THREE.Matrix4().setPosition(x, h / 2, z), col);
        kit.addTo('tile', new THREE.TorusGeometry(r * 0.88, 0.035, 5, 16), new THREE.Matrix4().setPosition(x, h - 0.02, z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), PAL.tile.ridge);
        kit.contact(x, z, r * 1.2, 0.55);
      };
      pot(SPOTS.waterPot.x, SPOTS.waterPot.z, 0.32, 0.6, PAL.tile.mid);
      pot(SPOTS.crock.x, SPOTS.crock.z, 0.27, 0.42, PAL.tile.light);
      // the log basket
      kit.addTo('bark', new THREE.CylinderGeometry(0.36, 0.3, 0.42, 14, 1, true), new THREE.Matrix4().setPosition(SPOTS.basket.x, 0.21, SPOTS.basket.z), PAL.bark.light);
      const r2 = 0;
      for (let k = 0; k < 5; k++) kit.addTo('wood', new THREE.CylinderGeometry(0.07, 0.065, 0.5, 6),
        new THREE.Matrix4().setPosition(SPOTS.basket.x + (k % 3 - 1) * 0.11 + r2, 0.42 + (k > 2 ? 0.12 : 0), SPOTS.basket.z + (k > 2 ? 0.08 : -0.06))
          .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 + (k - 2) * 0.12)), PAL.wood.dark);
      kit.contact(SPOTS.basket.x, SPOTS.basket.z, 0.42, 0.55);
    });

    // ── the loft: the boarded half-storey, its stair, the rail, the bed and the chest at the foot of it ──
    safe('loft', () => {
      const cx = (LOFT_X0 + HW) / 2, cz = (-HD + LOFT_Z1) / 2;
      const lw = HW - LOFT_X0, ld = LOFT_Z1 + HD;
      // the deck and the joists under it
      kit.addTo('wood', new THREE.BoxGeometry(lw + 0.1, 0.16, ld + 0.1), new THREE.Matrix4().setPosition(cx, LOFT_Y - 0.08, cz), PAL.wood.mid);
      const n = Math.max(3, Math.round(ld / 0.42));
      for (let k = 0; k < n; k++) {
        const z = -HD + (k + 0.5) * (ld / n);
        kit.addTo('wood', new THREE.BoxGeometry(lw, 0.05, ld / n - 0.02), new THREE.Matrix4().setPosition(cx, LOFT_Y + 0.005, z), k % 2 ? PAL.wood.light : PAL.wood.mid);
      }
      // the boarded face of the platform, so it reads as built and not as a floating slab
      kit.addTo('wood', new THREE.BoxGeometry(0.12, LOFT_Y, ld), new THREE.Matrix4().setPosition(LOFT_X0 + 0.06, LOFT_Y / 2, cz), PAL.wood.dark);
      kit.addTo('wood', new THREE.BoxGeometry(STAIR_X0 - LOFT_X0, LOFT_Y, 0.12), new THREE.Matrix4().setPosition((LOFT_X0 + STAIR_X0) / 2, LOFT_Y / 2, LOFT_Z1 - 0.06), PAL.wood.dark);
      // the rail along the open edge
      const post = (x, z) => kit.addTo('wood', new THREE.BoxGeometry(0.1, 0.72, 0.1), new THREE.Matrix4().setPosition(x, LOFT_Y + 0.36, z), PAL.wood.beam);
      post(LOFT_X0 + 0.06, -HD + 0.3); post(LOFT_X0 + 0.06, -1.4); post(LOFT_X0 + 0.06, LOFT_Z1 - 0.1); post(STAIR_X0 - 0.06, LOFT_Z1 - 0.1);
      kit.addTo('wood', new THREE.BoxGeometry(0.1, 0.1, ld - 0.3), new THREE.Matrix4().setPosition(LOFT_X0 + 0.06, LOFT_Y + 0.72, cz), PAL.wood.light);
      kit.addTo('wood', new THREE.BoxGeometry(STAIR_X0 - LOFT_X0, 0.1, 0.1), new THREE.Matrix4().setPosition((LOFT_X0 + STAIR_X0) / 2, LOFT_Y + 0.72, LOFT_Z1 - 0.06), PAL.wood.light);
      // the stair: eight boarded treads climbing the east wall, with a handrail
      const sw = HW - STAIR_X0, run = (STAIR_Z1 - STAIR_Z0) / STEPS, rise = LOFT_Y / STEPS;
      for (let k = 0; k < STEPS; k++) {
        const z = STAIR_Z1 - (k + 0.5) * run, y = (k + 1) * rise;
        kit.addTo('wood', new THREE.BoxGeometry(sw, 0.07, run + 0.02), new THREE.Matrix4().setPosition(STAIR_X0 + sw / 2, y - 0.035, z), k % 2 ? PAL.wood.light : PAL.wood.mid);
        kit.addTo('wood', new THREE.BoxGeometry(sw - 0.06, rise, 0.06), new THREE.Matrix4().setPosition(STAIR_X0 + sw / 2, y - rise / 2, z - run / 2), PAL.wood.dark);
      }
      kit.addTo('wood', new THREE.BoxGeometry(0.1, 0.9, 0.1), new THREE.Matrix4().setPosition(STAIR_X0 + 0.06, 0.45, STAIR_Z1 - 0.1), PAL.wood.beam);
      kit.addTo('wood', new THREE.BoxGeometry(0.09, 0.09, STAIR_Z1 - STAIR_Z0 + 0.3), new THREE.Matrix4()
        .setPosition(STAIR_X0 + 0.06, LOFT_Y * 0.5 + 0.86, (STAIR_Z0 + STAIR_Z1) / 2)
        .multiply(new THREE.Matrix4().makeRotationX(Math.atan2(LOFT_Y, STAIR_Z1 - STAIR_Z0))), PAL.wood.light);
    });
    safe('bed', () => kit.bed(SPOTS.bed.x, SPOTS.bed.z, SPOTS.bed.rot, { w: 0.95, l: 1.85, small: true, blanket: PAL.cloth.green, y: LOFT_Y }));
    safe('chest', () => kit.chestBox(SPOTS.chest.x, SPOTS.chest.z, 0, { w: 0.9, h: 0.5, d: 0.56, open: 0, y: LOFT_Y }));

    kit.flush();

    // ── the dust in the light from the window, the one thing in the room that moves on its own ──
    let motes = null;
    safe('motes', () => {
      const geo = prep(new THREE.IcosahedronGeometry(0.02, 0), mixHex(PAL.interior.lamp, PAL.plaster.light, 0.4));
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
      const N = 22;
      const m = new THREE.InstancedMesh(geo, mat, N);
      m.name = 'dust'; m.frustumCulled = false;
      scene.add(m);
      const seeds = Array.from({ length: N }, (_, i) => ({ x: -5.1 + (i % 5) * 0.22, y: 0.45 + ((i * 7) % 9) * 0.13, z: HD - 1.1 - ((i * 5) % 7) * 0.18, ph: i * 0.73 }));
      motes = { m, seeds, mx: new THREE.Matrix4() };
    });

    const buildMs = Math.round(performance.now() - t0);
    return {
      update(t, dt, c) {
        if (rig && rig.preset !== 'interior') { try { rig.apply('interior'); } catch (e) { reportError('hollybank rig', e); } }
        kit.update(t, dt, c && c.camera, c && c.player);
        if (motes) {
          for (let i = 0; i < motes.seeds.length; i++) {
            const s = motes.seeds[i];
            motes.mx.makeTranslation(s.x + Math.sin(t * 0.32 + s.ph) * 0.24, s.y + Math.sin(t * 0.21 + s.ph * 1.7) * 0.3, s.z + Math.cos(t * 0.27 + s.ph) * 0.2);
            motes.m.setMatrixAt(i, motes.mx);
          }
          motes.m.instanceMatrix.needsUpdate = true;
        }
        void dt;
      },
      state() { return { buildMs, room: room ? { W: room.W, D: room.D, H: room.H } : null, loftY: LOFT_Y, counts: Object.assign({}, kit.counts) }; },
      dispose() { motes = null; },
    };
  },

  onEnter() { try { Sfx.play('door_open', { vol: 0.34 }); } catch (_) { /* the door you just came through */ } },
};

/** Where everything is, for scenarios, critics and the layers (read-only). */
export function hollybankLayout() {
  return { room: { W, D, H }, door: { x: DX, w: DW, h: DH }, loftY: LOFT_Y, spots: SPOTS,
    floorY, exits: hollybank.exits.map(e => ({ to: e.to, x: e.x, z: e.z, tx: e.tx, tz: e.tz })) };
}

export default hollybank;
