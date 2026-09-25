/**
 * saltmarrow.js — SALTMARROW: where the Beck widens into a tidal creek.                     (P23B base map)
 *
 * WORLD-BIBLE §2 [03]: "the first BIGGER place. Puddlewick is home; Saltmarrow is the world beginning. It has the
 * first shop, the first inn bed (the Contented Herring, with its parrot), and the first girl who is braver than
 * you." Landmark: "a tide-mill wheel the size of a house, turning, audible from four tiles into the meadow."
 *
 * The plan, walked from the west gate:
 *   - the street comes in from the west past the ODD LITTLE SHOP and Goodwife Sump's vegetable stall;
 *   - it bends south to THE QUAY — flagstones, bollards, coils of rope, crab pots, two moored boats, gulls;
 *   - the TIDE MILL stands where the creek narrows, its wheel turning in the tide (a real door: saltmarrow_mill);
 *   - THE CONTENTED HERRING (Dodd Pye's inn) faces the quay with its hanging sign and its parrot;
 *   - the CHAPEL sits on the rise north-east of the green, which is where a wipe puts you (SYSTEMS §6.2);
 *   - a FOOTBRIDGE crosses the creek to the south bank: net frames, an upturned boat, a beach, and Ozzy's toll;
 *   - the NORTH GATE opens on the lane into the Whispering Wood, which is where Willow wants you to go.
 *
 * Coordinates: world units, centred (origin [-26, -22], 52 x 44 tiles). +x is east, -z is north. The basin of
 * water is the south-east; the village stands north and west of it.
 *
 * The four NPCs of WORLD-BIBLE §2 [03] and every word are src/world/maps/saltmarrow.npcs.js; the treasure is
 * saltmarrow.chests.js. The npc ids `dodd`, `sump`, `saltmarrow_smith`, `saltmarrow_oddments`,
 * `saltmarrow_priest` and `saltmarrow_banker` are the ones src/data/shops.js (P22) already has counters for, so
 * the inn, both shops, the chapel and the bank work the moment the people layer stands them here.
 */
import { outdoorMap, marks, PAL, mulberry, THREE } from './road_common.js';
import { BECK_EAST_LANDING } from './road_beck.js';
import { reportError } from '../../engine/debug.js';

/** A box / a boat hull, placed in WORLD space (the kit's buckets own the material). */
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const M = (x, y, z, rot = 0) => new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
/**
 * A little clinker boat: a shallow open box, light inside, with one painted top strake and a thwart across the
 * middle. Returns [[geometry, localMatrix, hex], ...] in its own frame — +z is the bow, y = 0 is the waterline.
 */
function boatParts(len, w, h, paint) {
  const L = len * 0.9, HW2 = w / 2;
  const out = [];
  out.push([new THREE.BoxGeometry(w * 0.86, 0.12, L), new THREE.Matrix4().setPosition(0, 0.02, 0), PAL.wood.light]);
  // the two long sides, flared out a little, in two strakes so the top one can be painted
  for (const s of [-1, 1]) {
    out.push([new THREE.BoxGeometry(0.1, h * 0.62, L),
      new THREE.Matrix4().makeRotationZ(s * 0.2).setPosition(s * HW2 * 0.88, h * 0.32, 0), PAL.wood.light]);
    out.push([new THREE.BoxGeometry(0.1, h * 0.4, L),
      new THREE.Matrix4().makeRotationZ(s * 0.24).setPosition(s * HW2 * 1.02, h * 0.78, 0), paint]);
  }
  // the two ends, narrowed, so the hull reads as a boat and not a crate
  for (const e of [-1, 1]) {
    out.push([new THREE.BoxGeometry(w * 0.56, h * 0.92, 0.12),
      new THREE.Matrix4().makeRotationY(e * 0.0).setPosition(0, h * 0.46, e * L * 0.5), paint]);
    out.push([new THREE.BoxGeometry(w * 0.74, h * 0.5, 0.5),
      new THREE.Matrix4().setPosition(0, h * 0.2, e * L * 0.42), PAL.wood.light]);
  }
  out.push([new THREE.BoxGeometry(w * 0.9, 0.12, 0.3), new THREE.Matrix4().setPosition(0, h * 0.82, -L * 0.14), PAL.wood.mid]);
  return out;
}

// ── the water ────────────────────────────────────────────────────────────────────────────────────────────────
const CREEK = [[-25, -3.4], [-19, -2.2], [-13, -0.8], [-7, 0.8], [-2.4, 2.4]];
const BASIN = { x: 9, z: 8, r: 6.0, sx: 1.6, sz: 1.05 };

// ── the streets ──────────────────────────────────────────────────────────────────────────────────────────────
const STREET = [[-24, -8.2], [-18, -8.6], [-13, -8.2], [-9, -7.4], [-6, -6.0], [-3.6, -4.4], [-2.2, -2.6]];
const QUAY = [[-2.6, -2.4], [1.6, -2.6], [6.2, -2.4], [11.0, -1.8], [15.4, -0.6], [18.6, 1.0]];
const NORTH = [[-4.6, -5.2], [-4.0, -9.0], [-3.2, -13.0], [-2.6, -17.2]];
const CHAPEL_PATH = [[-3.6, -11.6], [1.0, -12.4], [5.4, -13.6], [8.6, -15.0]];
const BRIDGE_LANE = [[-11.6, -6.4], [-11.4, -3.0], [-11.2, 1.6], [-11.6, 5.4], [-12.4, 9.0]];

const BRIDGE = { cx: -11.3, cz: -0.6, dir: Math.PI, L: 7.2, W: 2.4, arch: 0.42, kind: 'foot' };

const WEST = { x: -21.6, z: -8.2 };
const NORTH_GATE = { x: -2.5, z: -18.4 };

// ── the plots: every building, where it stands, which way its door faces ─────────────────────────────────────
const PLOTS = {
  inn: { id: 'contented_herring', x: 2.4, z: -10.2, rot: 0.06, name: 'the Contented Herring' },
  shop: { id: 'saltmarrow_shop', x: -15.4, z: -14.6, rot: 0.3, name: 'the odd little shop' },
  mill: { id: 'saltmarrow_mill', x: -5.4, z: 1.2, rot: Math.PI, name: 'the tide mill' },
  chapel: { id: 'saltmarrow_chapel', x: 10.6, z: -17.4, rot: 0.1, name: 'the Saltmarrow chapel' },
  pye: { id: 'saltmarrow_pye', x: -9.6, z: -13.4, rot: -0.2, name: 'the Pyes’ cottage' },
  kettleby: { id: 'saltmarrow_kettleby', x: 14.6, z: -9.6, rot: 0.55, name: 'the Kettlebys’ cottage' },
  net: { id: 'saltmarrow_netloft', x: -19.6, z: -1.2, rot: -1.1, name: 'the net loft' },
};

/** [w, d] of each kit recipe, so the collider matches the art. */
const SIZE = { cottage: (o) => [o.W ?? 5.4, o.D ?? 4.3], inn: () => [8.2, 6.04], shop: () => [6.4, 4.5],
  mill: () => [4.8, 5.12], church: (o) => [o.W ?? 6.0, o.D ?? 9.2] };
/** [door x offset, front face z, door width] in the plot's local frame. */
const DOORPOS = { cottage: (o) => [o.doorX ?? 0, (o.D ?? 4.3) / 2, 1.0], inn: () => [0, 6.04 / 2, 1.15],
  shop: () => [-1.7, 4.5 / 2, 1.05], mill: () => [0, 5.12 / 2, 1.05], church: (o) => [0, (o.D ?? 9.2) / 2, 1.7] };

const at = (o, lx, lz) => {
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
};
function doorOf(o) {
  const kind = o.kind || 'cottage';
  const [dx, dz, dw] = (DOORPOS[kind] || DOORPOS.cottage)(o);
  const doorway = at(o, dx, dz), out = at(o, dx, dz + 1.0), far = at(o, dx, dz + 2.1);
  const nx = out.x - doorway.x, nz = out.z - doorway.z;
  return { kind, dw, doorway, out, far, nx, nz, face: Math.atan2(-nx, -nz), size: (SIZE[kind] || SIZE.cottage)(o) };
}

// the plots, with their kit kind filled in
PLOTS.inn.kind = 'inn';
PLOTS.shop.kind = 'shop';
PLOTS.mill.kind = 'mill';
PLOTS.chapel.kind = 'church';
PLOTS.pye.kind = 'cottage'; PLOTS.pye.W = 5.6; PLOTS.pye.D = 4.4; PLOTS.pye.H = 2.4;
PLOTS.kettleby.kind = 'cottage'; PLOTS.kettleby.W = 5.2; PLOTS.kettleby.D = 4.2; PLOTS.kettleby.H = 2.35;
PLOTS.net.kind = 'cottage'; PLOTS.net.W = 5.0; PLOTS.net.D = 4.6; PLOTS.net.H = 2.7;

/** DOORS[id] = the DOORSTEP: two units out in front of the door, where you stand and where an interior returns you. */
const DOORS = {};
/** DOORWAY[id] = the exit trigger, just outside the wall (the same 0.45 offset puddlewick.js measured). */
const DOORWAY = {};
const PADS = [];
const PLOT_COLLIDERS = [];
for (const key of Object.keys(PLOTS)) {
  const p = PLOTS[key];
  const d = doorOf(p);
  DOORS[p.id] = { x: +d.far.x.toFixed(2), z: +d.far.z.toFixed(2), facing: +d.face.toFixed(3) };
  DOORWAY[p.id] = { x: +(d.doorway.x + d.nx * 0.45).toFixed(2), z: +(d.doorway.z + d.nz * 0.45).toFixed(2), w: Math.max(1.0, d.dw * 0.8) };
  PADS.push({ x: p.x, z: p.z, r: Math.max(d.size[0], d.size[1]) * 0.62 });
  PLOT_COLLIDERS.push({ type: 'box', x: p.x, z: p.z, w: d.size[0], d: d.size[1], rot: p.rot || 0, tag: p.id });
}

const salt = outdoorMap({
  id: 'saltmarrow',
  name: 'Saltmarrow',
  kind: 'town',
  size: [52, 44],
  ax: 23, az: 19,
  seed: 41,
  theme: 'grass',
  music: 'town',                                     // CANON §9
  ambience: 'amb_town',
  hours: 11.2,
  encounters: null,                                  // a town: kind 'town' switches encounters off anyway
  spawn: { x: -15.8, z: -8.4, facing: Math.PI / 2 },
  camera: { orbit: 96, pitch: 26, dist: 10.4, fov: 48, lookUp: 2.5 },
  // Saltmarrow must never paint ITSELF on its own horizon (P23 gap #4): only the places you can walk to from here
  landmarks: marks([{ id: 'puddlewick', az: 2.78 }, { id: 'whispering_wood', az: -3.02 }, { id: 'coddleston', az: 1.5 }]),

  lanes: [
    { pts: STREET, w: 3.0 },
    { pts: QUAY, w: 4.6, stone: true },
    { pts: NORTH, w: 2.6 },
    { pts: CHAPEL_PATH, w: 1.9, stone: true },
    { pts: BRIDGE_LANE, w: 1.9 },
  ],
  stream: { pts: CREEK, w: 3.6, y: -0.45, bank: 0.9 },
  ponds: [BASIN],
  bridges: [BRIDGE],
  pads: PADS,
  sand: [{ x: -4.0, z: 11.0, r: 6.0 }, { x: 3.0, z: 14.0, r: 5.0 }],
  hills: [{ x: 10, z: -18, r: 9, h: 1.7 }, { x: -18, z: -14, r: 9, h: 1.0 }],
  wornDiscs: Object.values(DOORS).map(d => ({ x: d.x, z: d.z, r: 1.1, falloff: 0.9 })),
  paving: [{ x: 9.0, z: -16.6, r: 3.2, falloff: 1.0 }],
  rim: { radius: 25, rows: 3, rowGap: 6.0, seed: 311, threshold: 0.34 },
  // the rim wood stops at the water: no trees standing in the basin or on the open sea bearing
  rimSkip: (x, z) => (x > 1 && z > -1),
  notches: [{ az: Math.atan2(12, 16), k: 0.95, w: 0.95 }, { az: Math.atan2(3, 22), k: 0.7, w: 0.4 }],
  groundAt(x, z, L) {
    // the beach: sand where the basin's shore is shallow and the ground is low
    if (z > 4 && L.wdist(x, z) < 4.0 && L.masks.sample(2, x, z) < 0.4) return 'sand';
    return null;
  },

  exits: [
    { x: WEST.x, z: WEST.z, w: 4.8, h: 8.4, to: 'road_beck', tx: BECK_EAST_LANDING.x, tz: BECK_EAST_LANDING.z,
      kind: 'edge', name: 'the lane back up the Beck', line: 'gate-west', back: { x: -15.8, z: -8.4 } },
    { x: NORTH_GATE.x, z: NORTH_GATE.z, w: 9.0, h: 4.4, to: 'road_wood', tx: -0.6, tz: 20.0, kind: 'edge',
      name: 'the lane into the Whispering Wood', line: 'gate-north', back: { x: -2.9, z: -14.4 } },
    { x: DOORWAY.saltmarrow_mill.x, z: DOORWAY.saltmarrow_mill.z, w: DOORWAY.saltmarrow_mill.w, h: DOORWAY.saltmarrow_mill.w,
      to: 'saltmarrow_mill', tx: 0, tz: 0.9, kind: 'door', name: 'the mill door', line: 'mill-door',
      back: { x: DOORS.saltmarrow_mill.x, z: DOORS.saltmarrow_mill.z } },
    // Act III: abbey road east of the quay (B23 Cloud Stair path)
    { x: 18.5, z: -6.5, w: 4.0, h: 3.5, to: 'bellhollow_abbey', tx: 0, tz: 8, kind: 'door',
      name: 'the abbey road', line: 'to-abbey', back: { x: 16.5, z: -5.0 }, facing: Math.PI * 0.5 },
  ],

  spots: {
    doors: DOORS,
    plots: Object.fromEntries(Object.keys(PLOTS).map(k => [k, { x: PLOTS[k].x, z: PLOTS[k].z, rot: PLOTS[k].rot || 0, id: PLOTS[k].id }])),
    quay: { x: 8.0, z: -1.6 },
    wheel: { x: -8.4, z: 1.2 },
    gulls: [{ x: 6.0, z: -1.0 }, { x: 13.0, z: 0.4 }, { x: -1.0, z: 8.0 }],
    // the four constant people of WORLD-BIBLE §2 [03], and P22's counter-keepers
    willow: { x: -2.0, z: -6.4, facing: Math.PI * 0.45 },
    dodd: { x: DOORS.contented_herring.x - 1.1, z: DOORS.contented_herring.z + 0.4, facing: DOORS.contented_herring.facing },
    ozzy: { x: -11.4, z: 3.2, facing: Math.PI },
    sump: { x: -7.6, z: -9.4, facing: Math.PI * 0.6 },
    smith: { x: DOORS.saltmarrow_shop.x + 0.6, z: DOORS.saltmarrow_shop.z + 0.8, facing: DOORS.saltmarrow_shop.facing },
    oddments: { x: DOORS.saltmarrow_shop.x - 1.4, z: DOORS.saltmarrow_shop.z + 1.2, facing: DOORS.saltmarrow_shop.facing },
    priest: { x: DOORS.saltmarrow_chapel.x - 0.9, z: DOORS.saltmarrow_chapel.z + 0.6, facing: DOORS.saltmarrow_chapel.facing },
    banker: { x: 16.0, z: -1.0, facing: Math.PI * 0.8 },
    sera: { x: 4.6, z: -4.4, facing: Math.PI * 0.2 },
    parrot: { x: DOORS.contented_herring.x + 1.6, y: 2.4, z: DOORS.contented_herring.z + 0.2 },
    cat: { x: -8.0, z: -4.2 },
    nets: [{ x: -13.6, z: 7.4 }, { x: -9.2, z: 8.8 }, { x: -5.4, z: 9.6 }],
    boats: [{ x: 5.4, z: 1.2, rot: 0.24 }, { x: 12.4, z: 2.8, rot: -0.3 }],
    stall: { x: -7.0, z: -8.0, rot: 0.3 },
    containers: [{ x: 0.4, z: -1.0, kind: 'barrel' }, { x: 6.6, z: -0.8, kind: 'crate' }, { x: 14.6, z: 0.4, kind: 'crate' },
      { x: -3.0, z: -8.6, kind: 'barrel' }, { x: -18.2, z: -13.2, kind: 'barrel' }, { x: -12.0, z: 7.0, kind: 'crate' }],
  },

  props: [
    { type: 'sign', name: 'the harbour signpost', x: -4.8, z: -3.4, line: 'signpost', reach: 3.4, height: 2.5 },
    { type: 'wheel', name: 'the tide-mill wheel', x: -8.4, z: 1.2, line: 'wheel', reach: 3.6, height: 3.4 },
    { type: 'sign', name: 'the inn sign', x: DOORS.contented_herring.x + 1.9, z: DOORS.contented_herring.z + 0.2, line: 'inn-sign', reach: 2.4, height: 3.4 },
    { type: 'door', name: 'the inn door', x: DOORS.contented_herring.x, z: DOORS.contented_herring.z, line: 'inn-door', reach: 1.8, height: 2.6,
      talk({ field }) {
        try { field.teleport('contented_herring'); } catch (e) { reportError('saltmarrow: inn door', e); }
        return null;
      } },
    { type: 'door', name: 'the shop door', x: DOORS.saltmarrow_shop.x, z: DOORS.saltmarrow_shop.z, line: 'shop-door', reach: 1.8, height: 2.6 },
    { type: 'door', name: 'the chapel door', x: DOORS.saltmarrow_chapel.x, z: DOORS.saltmarrow_chapel.z, line: 'chapel-door', reach: 2.0, height: 3.0 },
    { type: 'boat', name: 'a moored boat', x: 5.4, z: 0.2, line: 'boat', reach: 2.4, height: 1.2 },
    { type: 'net', name: 'the drying nets', x: -9.2, z: 7.9, line: 'nets', reach: 2.2, height: 1.9 },
    { type: 'pot', name: 'the crab pots', x: 10.2, z: -1.0, line: 'crabpots', reach: 1.8, height: 0.9 },
    { type: 'bollard', name: 'a bollard', x: 15.0, z: -0.2, line: 'bollard', reach: 1.6, height: 0.7 },
    { type: 'bridge', name: 'the plank bridge', x: -9.9, z: -0.6, line: 'footbridge', reach: 2.0, height: 1.0 },
  ],

  get colliders() { return PLOT_COLLIDERS; },

  lines: {
    'gate-west': 'The lane climbs back up the Beck\ntoward Puddlewick.',
    'gate-north': 'The trees start about a hundred\npaces up that lane, and they\ndo not stop.',
    'mill-door': 'Into the mill, where it is\nlouder and whiter.',
    'to-abbey': 'The road climbs toward Bellhollow.\nAn empty bell frame waits.',
    signpost: ['{gold}PUDDLEWICK{/gold} — back up the Beck.\n{gold}THE WHISPERING WOOD{/gold} — north.\n{gold}THE QUAY{/gold} — you are standing on it.',
      'Somebody has scratched a fourth\narm pointing straight down. It\nsays HERE.'],
    wheel: ['The wheel is as tall as a house\nand it turns with the tide, not\nthe stream — so it stops twice\na day and nobody minds.',
      'You can feel it through your\nboots.'],
    'inn-sign': ['A painted herring on a blue\nboard, lying on its back with\nits fins folded, entirely content.'],
    'inn-door': ['{gold}THE CONTENTED HERRING{/gold}\nTwelve gold a bed.',
      'Mr Pye is stood right outside\nit, so you might as well ask\nhim.'],
    'shop-door': ['The door is wedged open with a\nboot. The boot is doing well.'],
    'chapel-door': ['Cool air, and somebody inside\nsinging very slightly wrong.'],
    boat: ['A blue clinker boat called the\n{gold}MARY PYE{/gold}, tied with four knots\nwhen one would do.',
      'There is a bucket in it, and\nthe bucket has a fish in it,\nand the fish is fine.'],
    nets: ['Nets on frames, drying in the\nwind, mended in a dozen\ndifferent colours of twine.'],
    crabpots: ['Withy baskets stacked six high.\nOne of them is occupied and\ngrumpy about it.'],
    bollard: ['A stone bollard, polished by\nrope, exactly the right height\nfor a boy to sit on.'],
    footbridge: ['Six planks and a handrail over\nthe creek. It gives a little,\nwhich is the fun of it.'],
  },

  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  // set dressing
  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  dress(kit, L) {
    const r = mulberry(9901);
    const chimneys = [];

    // ── the buildings ──
    const rec = {};
    rec.inn = kit.inn(Object.assign({}, PLOTS.inn, { sign: { icon: 'bed', text: 'HERRING', panel: PAL.paint.shutterBlue, side: 1 } }));
    rec.shop = kit.shop(Object.assign({}, PLOTS.shop, { sign: { icon: 'bag', text: 'SHOP', panel: PAL.paint.doorRed, side: 1 } }));
    rec.mill = kit.mill(Object.assign({}, PLOTS.mill, { waterY: -0.45, wheelSide: 1 }));
    rec.chapel = kit.church(Object.assign({}, PLOTS.chapel, { W: 6.0, D: 9.2, H: 3.4, towerSide: 1 }));
    for (const key of ['pye', 'kettleby', 'net']) {
      const p = PLOTS[key];
      rec[key] = kit.cottage(Object.assign({
        roof: key === 'net' ? 'tile' : 'thatch', pitch: key === 'net' ? 0.6 : 0.76, opens: true,
        doorColor: key === 'pye' ? PAL.paint.doorRed : PAL.paint.shutterBlue,
        frontWindows: [1.4], sideWindows: [0], shutter: PAL.paint.shutterBlue,
        chimney: 'stone', chimneyX: -1.5, braces: false,
      }, p));
    }
    for (const key of Object.keys(rec)) {
      const b = rec[key];
      for (const c of ((b && b.chimneyTops) || [])) if (c) chimneys.push(c);
    }

    // ── the quay: stone bollards, crab pots, crates, barrels ──
    for (const [bx, bz] of [[0.6, -0.6], [5.2, -0.4], [10.0, 0.0], [15.0, -0.2]]) {
      const by = kit.heightAt(bx, bz);
      kit.addTo('stone', new THREE.CylinderGeometry(0.19, 0.24, 0.72, 10), M(bx, by + 0.3, bz), PAL.stone.mid);
      kit.addTo('stone', new THREE.SphereGeometry(0.2, 10, 7), M(bx, by + 0.68, bz), PAL.stone.light);
      kit.addTo('paint', new THREE.TorusGeometry(0.26, 0.05, 5, 12), M(bx, by + 0.1, bz).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), PAL.cloth.rope);
      kit.contact(bx, bz, 0.5, 0.7);
    }
    for (const [px, pz] of [[10.2, -1.0], [10.9, -1.5], [10.5, -0.4]]) {
      const py = kit.heightAt(px, pz);
      kit.addTo('thatch', new THREE.CylinderGeometry(0.36, 0.42, 0.42, 9), M(px, py + 0.21, pz), PAL.thatch.mid);
      kit.addTo('thatch', new THREE.SphereGeometry(0.34, 9, 6), M(px, py + 0.46, pz), PAL.thatch.light);
      kit.contact(px, pz, 0.6, 0.6);
    }
    for (const [cx, cz, cr] of [[6.6, -0.8, 0.5], [7.4, -1.6, 1.2], [14.6, 0.4, 0.2], [-0.2, -1.2, 0.8]]) kit.crate(cx, cz, cr, 0.95);
    for (const [bx, bz] of [[0.4, -1.0], [-3.0, -8.6], [-18.2, -13.2], [12.0, -0.6]]) kit.barrel(bx, bz, 1, r() * 3);
    kit.appleCrate(-6.2, -7.2, 0.3, {});
    kit.stall(Object.assign({ W: 2.4, D: 1.6 }, { x: -7.0, z: -8.0, rot: 0.3 }));
    kit.woodpile(-19.0, -12.4, 0.4);
    kit.handcart(1.8, -3.6, 0.9, {});
    kit.bench(11.6, -2.4, Math.atan2(-0.6, 1));
    kit.bench(-5.0, -5.0, 0.8);
    for (const [lx, lz] of [[-2.8, -3.0], [4.0, -2.0], [12.6, -1.2], [-4.2, -10.0], [DOORS.contented_herring.x - 2.2, DOORS.contented_herring.z + 0.3]]) kit.lantern(lx, lz, 0, { h: 2.15 });

    // the moored boats: a hull, a thwart, a mast stub and an oar, floating at the quay's foot
    const boat = (bx, bz, rot, len = 3.4, col = PAL.paint.shutterBlue, y = -0.4) => {
      const base = M(bx, y, bz, rot);
      for (const [geo, m, hex] of boatParts(len, 1.3, 0.62, col)) kit.addTo('wood', geo, base.clone().multiply(m), hex);
      kit.addTo('wood', BOX(0.1, 0.95, 0.1), base.clone().multiply(new THREE.Matrix4().setPosition(0, 0.72, len * 0.14)), PAL.wood.beam);
      kit.addTo('wood', BOX(0.08, 0.08, 2.2), base.clone().multiply(new THREE.Matrix4().makeRotationY(0.5).setPosition(0.3, 0.5, -0.2)), PAL.wood.weathered);
      kit.contact(bx, bz, 1.4, 0.4, { rx: len * 0.45, rz: 0.8, rot });
    };
    boat(5.4, 1.4, 0.24);
    boat(12.4, 3.0, -0.3, 3.0, PAL.paint.doorRed);
    // the upturned boat on the beach: hull up, on the sand, a proper thing to hide behind
    const ub = { x: -3.4, z: 12.2 };
    {
      const uy = kit.heightAt(ub.x, ub.z);
      const ubase = M(ub.x, uy + 0.62, ub.z, 1.9).multiply(new THREE.Matrix4().makeRotationZ(Math.PI));
      for (const [geo, m] of boatParts(2.9, 1.25, 0.58, PAL.wood.weathered)) kit.addTo('wood', geo, ubase.clone().multiply(m), PAL.wood.weathered);
    }
    kit.contact(ub.x, ub.z, 1.4, 0.55, { rx: 1.5, rz: 0.75, rot: 1.9 });

    // ── the nets drying on frames along the south bank: two posts, a cross-beam, and the net slung off it ──
    for (const [nx, nz] of [[-13.6, 7.4], [-9.2, 8.8], [-5.4, 9.6]]) {
      const ny = kit.lowestAt(nx, nz, 1.7, 5);
      for (const s of [-1, 1]) kit.addTo('wood', BOX(0.13, 2.1, 0.13), M(nx + s * 1.55, ny + 1.05, nz), PAL.wood.beam);
      kit.addTo('wood', BOX(3.4, 0.12, 0.12), M(nx, ny + 2.0, nz), PAL.wood.beam);
      // the net: three sagging strands of twine over a light cloth panel, so it reads as mesh and not a sail
      kit.addTo('paint', BOX(2.9, 1.25, 0.03), M(nx, ny + 1.28, nz, 0.06), PAL.cloth.cream);
      for (let s = 0; s < 4; s++) kit.addTo('paint', BOX(2.9, 0.035, 0.05), M(nx, ny + 0.75 + s * 0.34, nz + 0.04), PAL.cloth.rope);
      for (let s = 0; s < 6; s++) kit.addTo('paint', BOX(0.035, 1.25, 0.05), M(nx - 1.25 + s * 0.5, ny + 1.28, nz + 0.04), PAL.cloth.rope);
      kit.contact(nx, nz, 1.8, 0.45, { rx: 1.9, rz: 0.4 });
      kit.footBox(nx, nz, 3.6, 0.8, 0);
    }
    for (let k = 0; k < 9; k++) {
      const px = -5 + (r() - 0.5) * 16, pz = 11 + (r() - 0.5) * 6;
      if (L.edgeR(px, pz) > 0.96) continue;
      kit.rock(px, pz, 0.3 + r() * 0.3, (k * 37) | 0, { moss: false, sink: 0.4 });
    }
    kit.reeds(-15.4, 4.4, 12, 51, 1.2);
    kit.reeds(-7.6, 5.6, 10, 52, 1.1);
    kit.reeds(-17.8, 0.6, 9, 53, 1.0);
    kit.lilyPads(-14.0, 1.6, -0.45, 4, 54, 1.6);

    // ── the trees: a wind-bent row along the north edge, apples behind the Pyes' ──
    const trees = [];
    for (let k = 0; k < 16; k++) {
      const px = -22 + k * 2.8 + (r() - 0.5) * 2, pz = -17.0 - r() * 2.4;
      if (L.edgeR(px, pz) > 0.94 || L.masks.sample(0, px, pz) > 0.25) continue;
      trees.push({ kind: r() > 0.6 ? 'round' : 'edge', x: px, z: pz, s: 0.82 + r() * 0.35, r: r() * 6.28 });
    }
    trees.push({ kind: 'fruit', x: -12.4, z: -15.6, s: 1.0, r: 0.4 }, { kind: 'fruit', x: -14.0, z: -12.4, s: 0.95, r: 2.1 });
    trees.push({ kind: 'chestnut', x: 6.0, z: -12.0, s: 1.0, r: 1.2 });
    kit.trees(trees);
    for (const [hx, hz] of [[-5.6, -12.6], [1.2, -10.0], [-17.0, -6.6], [8.0, -6.4]]) kit.flowerBed(hx, hz, 2.0, 1.2, r() * 3, (hx * 5) | 0);

    // ── the signposts, the bridge, the gate lanterns, the sea wall ──
    const atlas = kit.useSignAtlas(kit.signAtlas(['Puddlewick', 'The Wood', 'The Quay']));
    kit.signpost(atlas, -4.8, -3.4, [{ label: 'Puddlewick', dir: 2.78 }, { label: 'The Wood', dir: Math.PI }, { label: 'The Quay', dir: Math.PI / 2 }]);
    kit.stoneWall([[18.4, 1.6], [19.6, 4.6], [19.0, 8.0]], { h: 0.62, seed: 4 });
    kit.stoneWall([[-2.0, -1.2], [2.0, -1.4], [6.0, -1.2]], { h: 0.34, seed: 9 });
    kit.picket([[-11.0, -12.2], [-7.4, -12.6], [-7.0, -9.6]], { height: 0.8 });
    kit.fence([[-20.0, -16.0], [-14.0, -16.4]], { spacing: 1.9, seed: 3 });

    // ── life: smoke, gulls, butterflies over the flowerbeds ──
    kit.smoke(chimneys.filter(Boolean));
    kit.groundBirds([{ x: 6.0, z: -1.0 }, { x: 13.0, z: 0.4 }, { x: -1.0, z: 8.0 }, { x: -12.0, z: 6.4 }], { scare: 3.2, seed: 61 });
    kit.butterflies([{ x: -5.6, z: -12.6, hue: PAL.flower.white }, { x: 1.2, z: -10.0, hue: PAL.flower.yellow },
      { x: -17.0, z: -6.6, hue: PAL.flower.pink }]);
    kit.motes({ count: 40, radius: 12, height: 3.0, seed: 27 });
  },

  flowers: [{ x: -10.0, z: -16.0, hue: PAL.flower.white, n: 16 }, { x: 4.0, z: -14.0, hue: PAL.flower.yellow, n: 14 },
    { x: -19.0, z: -11.0, hue: PAL.flower.pink, n: 12 }, { x: 14.0, z: -12.0, hue: PAL.flower.blue, n: 12 }],
  flowerCount: 18,
  tufts: { count: 900, radius: 22 },
});

/** Where a Saltmarrow interior's door puts you back down in the village (the mill reads this). */
export function saltmarrowDoorstep(id) {
  const d = DOORS[id];
  if (d) return { x: d.x, z: d.z, facing: d.facing };
  return { x: salt.spawn.x, z: salt.spawn.z, facing: salt.spawn.facing || 0 };
}

/** Where everything is, for scenarios, critics and the layers that fill this map (read-only). */
export function saltmarrowLayout() {
  return { doors: DOORS, plots: PLOTS, basin: BASIN, bridge: { x: BRIDGE.cx, z: BRIDGE.cz },
    spawn: Object.assign({}, salt.spawn), gates: { west: WEST, north: NORTH_GATE } };
}

export default salt;
