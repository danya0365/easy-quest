/**
 * meadow.js — Puddlewick Vale: the meadow at the edge of the home village, on a sunny morning.
 *
 * WORLD-BIBLE §3 / CANON §2: Puddlewick sits in the softest green in the game; the Beck runs past it; the chestnut
 * tree on its rise is the landmark you can see from the meadow. This is the first thing the kids see: a worn lane
 * that forks at a signpost, a thatched cottage with its washing out, the Beck with a wooden footbridge, the lane
 * curling over the rise toward the village roofs and the chestnut tree, sheep, ducks, butterflies, drifting clouds.
 *
 * Coordinates: world units, centred (origin [-40, -40], 80 x 80 tiles). +x is east, -z is north. The hero starts on
 * the south lane facing north, so the default camera looks up the lane toward the village.
 *
 * Its SET DRESSING is P04's (src/art/props.js): the vale is closed by a hedgerow on the walkable edge and three
 * staggered rows of MIXED tree clumps — oak, birch, pine, lollipop, fruit — with gaps you can see out through, and
 * wooded hills painted on cards behind them, so every outward view has hills, sky and distance in it. Inside: the
 * orchard on the east swell, birches over the Beck, pines on the north-west shoulder, blossom by the cottage and the
 * bridge, the well by the paddock gate, hay, a stile, a scarecrow in his kitchen garden, lanterns at the bridge, two
 * signposts — and the life: wind sway, butterflies, birds that take off, pollen motes, pond ripples, sheep, ducks.
 *
 * The map is DATA first (layout(): paths, water, buildings, trees, colliders, interactables, exits — computed once,
 * deterministically) and ART second (view(): meshes built from that layout with the scenery kit, F3 materials only).
 * Its WORDS and PEOPLE are the layer src/world/maps/meadow.npcs.js; its treasure is src/world/maps/meadow.chests.js.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, lerp, smooth } from '../../art/palette.js';
import { Tex, mulberry, vnoise } from '../../art/tex.js';
import { makeAOMask } from '../../art/toon.js';
import { createKit, buildSky, ringHill, buildGround, paintMasks, distanceGrid, curvePoints, bridgeFrame, prep,
  ringPlacements, speciesBounds, SPECIES } from '../scenery.js';

/**
 * The woodland rim: a hedgerow on the boundary, then THREE staggered rows of mixed tree clumps with gaps you can
 * see out through, then wooded hills painted on cards, hazier every row. (e = superellipse "radius"; the walkable
 * edge is BOUND = 33.5.) `clump` breaks each row into clumps, and every row's noise is offset so they stagger.
 */
const WOOD_ROWS = [
  { kind: 'tree', e: 35.3, spacing: 2.3, jitter: 0.45, size: [0.95, 1.35], mouth: 4.0 },
  { kind: 'tree', e: 38.8, spacing: 3.5, jitter: 1.2, size: [0.95, 1.4], mouth: 3.4, clump: { freq: 15, threshold: 0.42, seed: 91 } },
  { kind: 'tree', e: 43.4, spacing: 4.2, jitter: 1.6, size: [1.0, 1.5], mouth: 2.6, clump: { freq: 11, threshold: 0.47, seed: 57 } },
  { kind: 'tree', e: 48.6, spacing: 5.6, jitter: 2.2, size: [1.05, 1.6], mouth: 1.6, clump: { freq: 8, threshold: 0.60, seed: 23 } },
  { kind: 'card', e: 57.5, spacing: 6.0, jitter: 3.0, size: [6.4, 8.2], haze: 0.14, clump: { freq: 7, threshold: 0.50, seed: 131 } },
  { kind: 'card', e: 69.0, spacing: 7.5, jitter: 4.5, size: [7.2, 9.4], haze: 0.26, clump: { freq: 6, threshold: 0.56, seed: 167 } },
  { kind: 'card', e: 84.0, spacing: 9.5, jitter: 6.0, size: [8.0, 10.6], haze: 0.38, clump: { freq: 5, threshold: 0.60, seed: 199 } },
];

/**
 * Which species grows where: broad groves of one kind (birch coppice, pine stand) with the rest mixed through.
 * The boundary row alternates TWO hedgerow shapes and two bush shapes, so a run of it is never the same blob
 * twice over — the old single-shape hedge read as a chain of identical spheres round the whole vale.
 */
function woodPick(x, z, rnd, ri) {
  const g = vnoise(x * 0.042 + 3.1, z * 0.042 + 7.7, 43);
  let kind = g < 0.33 ? 'birch' : g > 0.79 ? 'pine' : g > 0.62 ? 'round' : 'oak';
  const k = rnd();
  if (ri === 0) {                                                             // the boundary: hedgerow + the odd tree
    const h = vnoise(x * 0.09 + 17.3, z * 0.09 + 4.1, 67);
    if (k < 0.72) return h < 0.5 ? 'hedge' : 'hedgeb';
    if (k < 0.9) return h < 0.45 ? 'bushb' : 'bush';
    return kind;
  }
  if (k < 0.1) kind = 'round';
  else if (k < 0.18) kind = kind === 'birch' ? 'oak' : 'birch';
  else if (k < 0.23) kind = 'poplar';
  else if (k < 0.26) kind = 'fruit';
  else if (k < 0.3) kind = 'bushb';
  return kind;
}

// ── the words live in the people layer: src/world/maps/meadow.npcs.js (P11) — base entities name a `line` ──────
// ── shape constants ────────────────────────────────────────────────────────────────────────────────────────
const HALF = 40, MASK_SPAN = 96;
const BOUND = 33.5;                         // playable superellipse radius
const WATER_Y = -0.4, BED = -1.0, VALLEY = -0.08;
const HW = 1.35, BANK = 0.75;               // the Beck: water half-width, bank
const TAU = Math.PI * 2;

const LANE = [[14.5, 58], [9.8, 50.5], [6.5, 44], [3.2, 35], [4.4, 27.5], [2.6, 21.5], [0.2, 16.5], [0.9, 11.5], [0.2, 5.5], [-1.4, 0], [-2.8, -5], [-3.3, -9], [-3.0, -13], [-1.2, -17.5],
  [3.5, -20.5], [9.5, -22.5], [14.5, -26], [17.2, -32], [18.2, -39], [18.8, -48]];
const EAST = [[0.5, 9.2], [4.5, 8.0], [10.5, 8.4], [17.5, 6.4], [25, 3.0], [33, 1.0], [44, 0.2], [51.5, -2.6], [58, -7.5]];
const SPUR = [[-1.6, 1.8], [-4.6, 1.4], [-7.6, 0.6], [-9.6, 0.3]];
const BECK = [[-24.5, -8.8], [-19.5, -10.6], [-13, -12.0], [-7.5, -11.6], [-3.2, -11.0], [2.0, -12.2], [7.5, -14.2], [13, -15.6], [18.5, -16.2], [22.5, -18.2]];
const VILLAGE_CLEARING = { x: 19.5, z: -45.5, rx: 17.5, rz: 14.5 };
const PONDS = [{ x: -28.4, z: -7.6, r: 3.6, sx: 1.3, sz: 1.0 }, { x: 26.2, z: -20.8, r: 3.8, sx: 1.15, sz: 1.0 }];

const bump = (x, z, cx, cz, r) => Math.exp(-((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r));
const superR = (x, z) => Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(z), 4), 0.25);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const gauss = (d, w) => Math.exp(-(d * d) / (w * w));
/** Distance from (x, z) to a polyline — nothing may stand on a fence run, and no fence may run through anything. */
function nearPolyline(x, z, pts) {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
    d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return d;
}
const ANG_VILLAGE = Math.atan2(-44, 18.6), ANG_EAST = Math.atan2(0.4, 44), ANG_SOUTH = Math.atan2(44, 4.6);

function heightRaw(x, z) {
  let h = 1.3 * vnoise(x * 0.045 + 11.3, z * 0.045 + 3.7, 3) + 0.55 * vnoise(x * 0.11 + 2.1, z * 0.11 + 7.9, 5) + 0.16 * vnoise(x * 0.3, z * 0.3, 9) - 0.95;
  h += 1.2 * bump(x, z, -22, 13, 8.5);       // the paddock rise
  h += 1.4 * bump(x, z, 17, 19, 9);          // the east swell
  h += 1.5 * bump(x, z, -16, -25, 10);       // the north-west shoulder over the Beck
  h += 2.2 * bump(x, z, 7, -31, 8.5);        // the copse hill the lane curls round
  h += 2.4 * bump(x, z, 21.2, -46.2, 6.5);   // the chestnut's rise
  const e = superR(x, z), ang = Math.atan2(z, x);
  const lump = 0.6 * vnoise(Math.cos(ang) * 3 + 5, Math.sin(ang) * 3 + 5, 17) + 0.4 * vnoise(Math.cos(ang) * 7, Math.sin(ang) * 7, 19);
  const notch = 1 - 0.72 * gauss(angDiff(ang, ANG_VILLAGE), 0.42) - 0.6 * gauss(angDiff(ang, ANG_EAST), 0.3) - 0.55 * gauss(angDiff(ang, ANG_SOUTH), 0.26);
  h += (2.6 + 5.8 * lump) * notch * smooth(31, 90, e);
  return h;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// layout: every decision about where things are, made once
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
let LAYOUT = null;
function layout() {
  if (LAYOUT) return LAYOUT;
  const L = {};
  L.lane = curvePoints(LANE, 0.35); L.east = curvePoints(EAST, 0.35); L.spur = curvePoints(SPUR, 0.3); L.beck = curvePoints(BECK, 0.35);
  L.laneOut = L.lane.filter(([x, z]) => superR(x, z) > 28); L.eastOut = L.east.filter(([x, z]) => superR(x, z) > 28);
  L.masks = paintMasks({
    N: 1024, span: MASK_SPAN,
    strokes: [
      { pts: L.lane, w: 2.15, falloff: 1.0, channel: 0 },
      { pts: L.east, w: 1.9, falloff: 1.0, channel: 0, widthAt: (t) => lerp(1.95, 1.6, t) },
      { pts: L.spur, w: 1.3, falloff: 0.85, channel: 0, widthAt: (t) => lerp(1.5, 1.1, t) },
      { pts: L.beck, w: 2 * (HW + BANK), falloff: 1.8, channel: 1 },
    ],
    discs: PONDS.map(p => ({ x: p.x, z: p.z, r: p.r + BANK, sx: p.sx, sz: p.sz, falloff: 1.8, channel: 1 })),
  });
  L.water = distanceGrid({ N: 384, span: MASK_SPAN, lines: [L.beck], discs: PONDS, maxR: 14 });

  // the footbridge sits where the lane crosses the Beck
  let best = null;
  for (let i = 1; i < L.lane.length - 1; i++) {
    const [x, z] = L.lane[i], d = L.water.sample(x, z);
    if (!best || d < best.d) best = { d, i, x, z };
  }
  const a = L.lane[best.i - 2] || L.lane[best.i - 1], b = L.lane[best.i + 2] || L.lane[best.i + 1];
  const bdir = Math.atan2(b[0] - a[0], b[1] - a[1]);
  L.bridge = bridgeFrame({ cx: best.x, cz: best.z, dir: bdir, L: 6.6, W: 2.5, arch: 0.62, y0: VALLEY + 0.02 });

  // building pads (terrain flattens under them)
  L.cottage = { x: -12.6, z: 0.4, rot: Math.PI / 2, W: 4.8, D: 3.9, H: 2.3, roof: 'thatch', pitch: 0.74, doorX: -0.3, doorColor: PAL.paint.doorRed,
    frontWindows: [1.35], sideWindows: [0], shutter: PAL.paint.shutterGreen, chimney: 'stone', chimneyX: -1.2, braces: false };
  L.village = [
    { x: 11.2, z: -41.5, rot: 0.55, W: 5.2, D: 3.9, H: 2.4, roof: 'tile', pitch: 0.62, doorX: 0.6, frontWindows: [-1.4], sideWindows: [0], shutter: PAL.paint.shutterBlue, chimney: 'brick', chimneyX: -1.5 },
    { x: 27.5, z: -39.5, rot: -0.9, W: 4.6, D: 3.7, H: 2.3, roof: 'thatch', pitch: 0.74, doorX: -0.5, frontWindows: [1.2], sideWindows: [], shutter: PAL.paint.shutterGreen, chimney: 'stone', chimneyX: 1.0 },
    { x: 24.5, z: -52, rot: -0.3, W: 5.6, D: 4.1, H: 2.5, roof: 'tile', pitch: 0.6, doorX: 0, frontWindows: [-1.7, 1.7], sideWindows: [0], shutter: PAL.paint.shutterGreen, chimney: 'brick', chimneyX: 1.6 },
  ];
  L.pads = [L.cottage, ...L.village].map(o => ({ x: o.x, z: o.z, r: Math.max(o.W, o.D) * 0.62, y: heightRaw(o.x, o.z) }));

  const pathAt = (x, z) => L.masks.sample(0, x, z);
  const waterD = (x, z) => L.water.sample(x, z);
  const inBox = (x, z, o, pad) => { const dx = x - o.x, dz = z - o.z, c = Math.cos(o.rot), s = Math.sin(o.rot), lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < o.W / 2 + pad && Math.abs(lz) < o.D / 2 + pad; };
  const nearBuilding = (x, z, pad) => [L.cottage, ...L.village].some(o => inBox(x, z, o, pad));

  // ── set dressing positions ──
  L.sign = { x: 2.9, z: 10.8 };
  L.paddock = [[-29.5, 6.5], [-18.5, 6.0], [-16.6, 16.8], [-21.0, 19.6], [-29.8, 18.2], [-29.5, 6.5]];
  L.paddockCentre = { x: -23.5, z: 12.4, r: 3.8 };
  L.picket = [[-11.6, 2.9], [-6.4, 3.0], [-6.2, 6.4], [-11.9, 6.6]];
  // a droveway: one rail each side of the lane up to the village, and the flock grazing in the west field clear of
  // both — never standing ON a rail line, and no two of them closer than 2 units
  L.drove = [[[13.4, -33.0], [14.6, -35.6], [16.0, -43.5]], [[21.6, -36.2], [23.4, -44.2]]];
  L.laundry = [[-16.3, -4.9], [-11.4, -6.3]];
  L.bench = { x: -9.2, z: 4.35, rot: Math.PI / 2 + 0.05 };
  L.barrels = [{ x: -10.0, z: -2.5, s: 1 }, { x: -9.4, z: -3.3, s: 0.85 }];
  L.crates = [{ x: -16.4, z: 2.0, r: 0.4 }];
  L.woodpile = { x: -15.9, z: -0.6, rot: Math.PI / 2 };
  L.beds = [{ x: -8.8, z: 5.2, w: 2.4, d: 1.3, rot: 0.02 }];
  L.rocks = [
    [-6.4, -8.9, 0.8, 1], [0.8, -9.3, 0.62, 2], [7.4, -11.6, 1.1, 3], [-14.6, -9.1, 0.9, 4], [5.8, 14.2, 0.9, 5], [-4.8, 19.6, 1.35, 6],
    [-3.6, 20.9, 0.55, 7], [12.8, 12.2, 1.55, 8], [20.8, -8.2, 1.0, 9], [-20.8, -5.4, 0.7, 10], [23.5, -15.5, 0.85, 11], [-24.5, -12.0, 1.0, 12],
    [15.5, -19.0, 0.7, 13], [-5.4, -15.9, 0.6, 14], [28, 12, 1.2, 15], [-30, 24, 1.3, 16], [9.5, 26.5, 1.0, 17], [-12.5, 22.5, 0.8, 18],
  ].map(([x, z, s, seed]) => ({ x, z, s, seed }));
  // the farm's working clutter (P04): the well by the paddock gate, hay in the paddock, a stile over its fence,
  // a scarecrow in the kitchen garden, lanterns at the bridge and the cottage door, the orchard's crates and ladder
  L.well = { x: -14.4, z: 8.7, rot: 0.4 };
  L.hay = [{ x: -27.4, z: 16.2, rot: 0.5, round: true, s: 1.08 }, { x: -20.4, z: 8.9, rot: -0.4, round: true, s: 0.88 },
    { x: -26.1, z: 9.3, rot: 0.2, round: false }, { x: -26.05, z: 9.35, rot: 0.34, round: false, lift: 0.55 }];
  L.stile = { x: -17.55, z: 11.4, rot: -1.4 };
  L.scarecrow = { x: -8.1, z: 15.6, rot: 1.35 };
  L.veg = { x: -10.4, z: 18.2, w: 3.4, d: 2.4, rot: 0.15 };
  L.orchard = { crates: [{ x: 17.4, z: 17.6, rot: 0.3 }, { x: 18.5, z: 18.7, rot: -0.5, s: 0.9 }], ladder: { x: 17.9, z: 15.7, rot: 0.35 } };
  L.signLane = { x: 3.6, z: 31.8 };
  // ── the OUTFIELD: the vale used to be a beautiful yard with sixty metres of empty lawn round it. Every corner
  //    now has something worth walking to, and every lane fork and walkable edge is marked. (P04 set dressing.)
  L.outfield = {
    // a farmer's second paddock on the east swell, its gate facing the orchard
    fences: [
      [[9.6, 24.6], [20.4, 26.4], [26.0, 21.2], [24.4, 13.4]],                       // east swell paddock
      [[-31.0, -12.6], [-27.0, -17.4], [-21.0, -18.4]],                              // the pine shoulder's boundary
      [[12.6, -6.0], [19.4, -3.2], [25.8, -4.6]],                                    // the water meadow's rail
    ],
    stiles: [{ x: 23.2, z: 23.8, rot: 0.749 }, { x: -24.0, z: -17.9, rot: 0.165 }, { x: 19.4, z: -3.2, rot: 0.215 }],
    // hay left out in the fields, a cart's worth of crates and barrels by each lane mouth, and a log pile
    hay: [{ x: 21.6, z: 21.0, rot: 0.9, round: true, s: 1.12 }, { x: 14.4, z: 22.8, rot: -0.2, round: false },
      { x: -25.0, z: 27.6, rot: 0.6, round: true, s: 0.92 }, { x: 27.4, z: -12.0, rot: -0.7, round: true, s: 1.04 },
      { x: 9.8, z: -8.4, rot: 0.25, round: false }],
    barrels: [{ x: 6.0, z: 30.0, s: 1 }, { x: 5.2, z: 30.9, s: 0.86 }, { x: -18.4, z: -15.5, s: 0.95 },
      { x: 27.2, z: 4.7, s: 0.9 }],
    crates: [{ x: 7.1, z: 30.7, rot: 0.5 }, { x: -19.2, z: -14.7, rot: -0.35, s: 0.92 }, { x: 26.0, z: 3.8, rot: 0.2, s: 0.95 }],
    woodpiles: [{ x: -27.1, z: -15.2, rot: 0.42 }, { x: 23.4, z: 17.4, rot: -1.1 }],
    benches: [{ x: 6.2, z: 11.2, rot: -0.35 }, { x: -25.8, z: 22.4, rot: 1.1 }, { x: 18.2, z: -20.4, rot: -0.6 }],
    // lanterns: the lane at night is a string of warm lights, not a black field
    lanterns: [{ x: 4.6, z: 27.4, rot: -0.4 }, { x: -1.1, z: 15.0, rot: 0.3 }, { x: 4.9, z: 9.9, rot: -1.2, h: 1.8 },
      { x: 11.6, z: 7.4, rot: -1.6, h: 1.8 }, { x: -3.6, z: -8.6, rot: 0.2 }, { x: 17.0, z: -25.5, rot: 2.6 },
      { x: 20.0, z: 3.2, rot: -1.4, h: 1.8 }],
    // a second scarecrow in the far field, and a veg patch by the east paddock
    scarecrows: [{ x: 19.0, z: 8.2, rot: -0.7 }],
    veg: [{ x: 16.6, z: 21.4, w: 3.0, d: 2.0, rot: -0.28 }],
    laundry: null,
  };
  L.keepOut = [{ x: L.well.x, z: L.well.z, r: 2.2 }, { x: L.scarecrow.x, z: L.scarecrow.z, r: 2.2 },
    { x: L.veg.x, z: L.veg.z, r: 3.0 }, { x: L.signLane.x, z: L.signLane.z, r: 3.0 },
    ...L.hay.map(h => ({ x: h.x, z: h.z, r: 1.8 })), ...L.orchard.crates.map(c => ({ x: c.x, z: c.z, r: 1.4 })),
    { x: L.orchard.ladder.x, z: L.orchard.ladder.z, r: 1.4 },
    ...L.outfield.hay.map(h => ({ x: h.x, z: h.z, r: 1.9 })),
    ...L.outfield.barrels.map(b => ({ x: b.x, z: b.z, r: 1.3 })),
    ...L.outfield.crates.map(c => ({ x: c.x, z: c.z, r: 1.3 })),
    ...L.outfield.woodpiles.map(w => ({ x: w.x, z: w.z, r: 2.1 })),
    ...L.outfield.benches.map(b => ({ x: b.x, z: b.z, r: 1.8 })),
    ...L.outfield.lanterns.map(l => ({ x: l.x, z: l.z, r: 1.4 })),
    ...L.outfield.scarecrows.map(s => ({ x: s.x, z: s.z, r: 2.2 })),
    ...L.outfield.veg.map(v => ({ x: v.x, z: v.z, r: 2.8 })),
    ...L.outfield.stiles.map(s => ({ x: s.x, z: s.z, r: 2.0 }))];

  // ── trees: the hand-placed ones that compose the view, then a seeded MIXED fill ──
  //    Species (src/art/props.js SPECIES): oak · birch (white stems by the Beck) · pine (the north-west shoulder) ·
  //    fruit (the orchard on the east swell) · round (lollipop trees along the lanes) · blossom (by the cottage and
  //    the bridge) · poplar · bush · the one chestnut on the village rise (CANON §2's landmark).
  const HAND = [
    ['oak', -19.4, -2.0, 1.25], ['oak', 8.8, -30.2, 1.35], ['oak', -26.5, 24.5, 1.15], ['oak', 11.0, 30.5, 1.1],
    ['oak', -31.0, -1.5, 1.2], ['oak', 30.5, -9.5, 1.15],
    ['birch', -20.5, -15.5, 1.2], ['birch', -16.2, -13.4, 1.05], ['birch', -13.4, -16.4, 0.92], ['birch', -9.2, -17.2, 1.1],
    ['birch', 6.2, -18.8, 1.0],
    ['pine', -24.5, -20.5, 1.15], ['pine', -15.2, -24.6, 1.2], ['pine', -12.4, -27.4, 1.0], ['pine', -18.6, -27.2, 1.3],
    ['pine', -9.0, 33.0, 1.2],
    ['fruit', 15.6, 14.8, 1.1], ['fruit', 18.4, 16.4, 1.15], ['fruit', 21.4, 18.4, 1.05], ['fruit', 16.8, 19.8, 1.0],
    ['fruit', 19.8, 22.2, 1.1], ['fruit', 22.8, 21.0, 1.0],
    ['round', 5.2, -34.8, 1.15], ['round', -12.2, 27.0, 1.0], ['round', 13.6, -31.0, 1.05], ['round', 24.5, -13.6, 1.0],
    ['blossom', -17.8, 3.2, 1.05], ['blossom', -6.4, -14.4, 1.0],
    ['poplar', -8.4, -6.2, 1.0], ['poplar', 14.8, -11.6, 1.1], ['poplar', 12.4, -34.0, 1.2], ['poplar', 27.2, 9.8, 1.15],
    ['poplar', -18.2, 4.2, 0.95], ['poplar', 21.6, -26.0, 1.1],
    ['bush', 11.8, -27.6, 0.9], ['bush', 6.8, -26.9, 0.85], ['bush', -6.9, -4.2, 0.8], ['bush', -15.4, 3.8, 0.7],
    ['bush', 20.8, -10.4, 0.9], ['bush', -4.3, -17.0, 0.7], ['bush', 0.6, -14.6, 0.65], ['bush', 4.6, 12.6, 0.75],
    ['bush', -17.4, 7.6, 0.8], ['bush', 15.8, 9.6, 0.9], ['bush', 9.0, -9.8, 0.8], ['bush', -24.5, -1.6, 0.85],
    ['bush', -1.6, 24.0, 0.7],
    ['chestnut', 21.2, -46.2, 2.3],
  ];
  const r = mulberry(4242);
  L.trees = HAND.map(([kind, x, z, s]) => ({ kind, x, z, s, r: r() * TAU, c: 0.9 + r() * 0.16, tint: (r() - 0.5) * 1.5 }));
  const clearForTree = (x, z, rad) => {
    if (superR(x, z) > BOUND - 1) return false;
    for (const [ox, oz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) if (pathAt(x + ox, z + oz) > 0.12) return false;
    if (waterD(x, z) < 2.4 + rad * 0.6) return false;
    if (nearBuilding(x, z, rad + 1.2)) return false;
    if (x > -7 && x < 9 && z > 12) return false;                          // the opening view down the lane stays open
    if (Math.hypot(x - L.sign.x, z - L.sign.z) < 3.5) return false;
    if (Math.hypot(x - L.paddockCentre.x, z - L.paddockCentre.z) < 7.5) return false;
    if (L.bridge.corridor(x, z, 3)) return false;
    for (const k of L.keepOut) if (Math.hypot(x - k.x, z - k.z) < k.r + rad) return false;
    for (const run of [L.paddock, L.picket, ...L.drove, ...L.outfield.fences]) if (nearPolyline(x, z, run) < 1.1 + rad) return false;
    for (const k of L.rocks) if (Math.hypot(x - k.x, z - k.z) < 0.95 * k.s + 0.5 + rad) return false;
    return true;
  };
  const FILL = ['oak', 'oak', 'oak', 'oak', 'round', 'round', 'birch', 'birch', 'poplar', 'pine', 'fruit'];
  let big = L.trees.filter(t => t.kind !== 'bush' && t.kind !== 'chestnut').length, tries = 0;
  while (big < 42 && tries++ < 8000) {
    const x = (r() - 0.5) * 2 * BOUND, z = (r() - 0.5) * 2 * BOUND, s = 0.85 + r() * 0.45;
    if (superR(x, z) < 19) continue;
    if (!clearForTree(x, z, 2 * s)) continue;
    if (L.trees.some(t => Math.hypot(t.x - x, t.z - z) < 2.6 * (t.s + s) * 0.8)) continue;
    L.trees.push({ kind: FILL[(r() * FILL.length) | 0], x, z, s, r: r() * TAU, c: 0.86 + r() * 0.22, tint: (r() - 0.5) * 1.5 });
    big++;
  }
  tries = 0;
  let bushes = L.trees.filter(t => t.kind === 'bush').length;
  while (bushes < 26 && tries++ < 4000) {
    const x = (r() - 0.5) * 2 * BOUND, z = (r() - 0.5) * 2 * BOUND, s = 0.65 + r() * 0.55;
    if (superR(x, z) < 12 || !clearForTree(x, z, s)) continue;
    if (L.trees.some(t => Math.hypot(t.x - x, t.z - z) < 1.8 * (t.s + s))) continue;
    L.trees.push({ kind: 'bush', x, z, s, r: r() * TAU, c: 0.9 + r() * 0.2, tint: (r() - 0.5) * 1.2 });
    bushes++;
  }

  // ── the woodland rim: hedgerow + three staggered rows of mixed clumps + wooded hills on cards ──
  L.laneNear = (x, z) => {
    let d = 1e9;
    for (const P of [L.laneOut, L.eastOut]) for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], vx = bx - ax, vz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
      d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
    }
    return d;
  };
  L.ring = ringPlacements({
    seed: 4711,
    pointAt: (a, e) => { const c = Math.cos(a), si = Math.sin(a), rr = e / Math.pow(Math.pow(Math.abs(c), 4) + Math.pow(Math.abs(si), 4), 0.25); return [c * rr, si * rr]; },
    rows: WOOD_ROWS.map((row, ri) => Object.assign({}, row, { pick: (x, z, rnd) => woodPick(x, z, rnd, ri) })),
    clear: (x, z, ri, row) => {
      if (Math.hypot((x - VILLAGE_CLEARING.x) / VILLAGE_CLEARING.rx, (z - VILLAGE_CLEARING.z) / VILLAGE_CLEARING.rz) < 1) return true;
      const mouth = row.mouth ?? 0;
      return mouth > 0 && L.laneNear(x, z) < mouth;
    },
  });

  // ── colliders ──
  const C = [];
  C.push({ type: 'box', x: L.cottage.x, z: L.cottage.z, w: L.cottage.W + 0.35, d: L.cottage.D + 0.35, rot: L.cottage.rot, tag: 'cottage' });
  for (const t of L.trees) C.push({ type: 'circle', x: t.x, z: t.z, r: ((SPECIES[t.kind] || {}).collide ?? 0.34) * t.s, tag: t.kind === 'bush' ? 'bush' : 'tree' });
  for (const k of L.rocks) C.push({ type: 'circle', x: k.x, z: k.z, r: 0.58 * k.s, tag: 'rock' });
  C.push({ type: 'circle', x: L.sign.x, z: L.sign.z, r: 0.2, tag: 'sign' });
  C.push({ type: 'capsule', pts: L.paddock, r: 0.12, tag: 'fence' });
  C.push({ type: 'capsule', pts: L.picket, r: 0.08, tag: 'picket' });
  for (const rail of L.bridge.rails) C.push({ type: 'capsule', pts: rail, r: 0.09, tag: 'bridge-rail' });
  for (const p of L.laundry) C.push({ type: 'circle', x: p[0], z: p[1], r: 0.12, tag: 'post' });
  for (const b of L.barrels) C.push({ type: 'circle', x: b.x, z: b.z, r: 0.42 * b.s, tag: 'barrel' });
  for (const c of L.crates) C.push({ type: 'box', x: c.x, z: c.z, w: 0.82, d: 0.82, rot: c.r, tag: 'crate' });
  C.push({ type: 'box', x: L.bench.x, z: L.bench.z, w: 1.8, d: 0.55, rot: L.bench.rot, tag: 'bench' });
  C.push({ type: 'box', x: L.woodpile.x, z: L.woodpile.z, w: 2.0, d: 1.2, rot: L.woodpile.rot, tag: 'woodpile' });
  C.push({ type: 'circle', x: L.well.x, z: L.well.z, r: 0.95, tag: 'well' });
  C.push({ type: 'circle', x: L.scarecrow.x, z: L.scarecrow.z, r: 0.3, tag: 'scarecrow' });
  for (const h of L.hay) if (!h.lift) C.push({ type: 'circle', x: h.x, z: h.z, r: h.round ? 0.75 : 0.6, tag: 'hay' });
  for (const c of L.orchard.crates) C.push({ type: 'box', x: c.x, z: c.z, w: 0.82, d: 0.82, rot: c.rot, tag: 'crate' });
  C.push({ type: 'circle', x: L.signLane.x, z: L.signLane.z, r: 0.2, tag: 'sign' });
  // the outfield's own dressing, each with its collider so nothing can be walked through
  for (const run of L.drove) C.push({ type: 'capsule', pts: run, r: 0.12, tag: 'fence' });
  for (const run of L.outfield.fences) C.push({ type: 'capsule', pts: run, r: 0.12, tag: 'fence' });
  for (const h of L.outfield.hay) C.push({ type: 'circle', x: h.x, z: h.z, r: h.round ? 0.75 : 0.6, tag: 'hay' });
  for (const b of L.outfield.barrels) C.push({ type: 'circle', x: b.x, z: b.z, r: 0.42 * (b.s ?? 1), tag: 'barrel' });
  for (const c of L.outfield.crates) C.push({ type: 'box', x: c.x, z: c.z, w: 0.82 * (c.s ?? 1), d: 0.82 * (c.s ?? 1), rot: c.rot, tag: 'crate' });
  for (const w of L.outfield.woodpiles) C.push({ type: 'box', x: w.x, z: w.z, w: 2.0, d: 1.2, rot: w.rot, tag: 'woodpile' });
  for (const b of L.outfield.benches) C.push({ type: 'box', x: b.x, z: b.z, w: 1.8, d: 0.55, rot: b.rot, tag: 'bench' });
  for (const l of L.outfield.lanterns) C.push({ type: 'circle', x: l.x, z: l.z, r: 0.16, tag: 'lantern' });
  for (const s of L.outfield.scarecrows) C.push({ type: 'circle', x: s.x, z: s.z, r: 0.3, tag: 'scarecrow' });
  L.colliders = C;
  // what the follow camera must not hide behind: canopies (trees scale their blob layout) and the cottage roofs
  L.occluders = [
    ...L.trees.filter(t => t.kind !== 'bush').map(t => {
      const B = speciesBounds(t.kind);
      return { type: 'sphere', x: t.x, y: heightRaw(t.x, t.z) + B.cy * t.s, z: t.z, r: B.R * t.s * 0.8 };
    }),
    ...[L.cottage, ...L.village].map(o => ({ type: 'sphere', x: o.x, y: heightRaw(o.x, o.z) + 2.2, z: o.z, r: Math.max(o.W, o.D) * 0.62 })),
  ];

  // ── animals ──
  L.sheep = [{ x: -24.5, z: 10.8, yaw: 0.8 }, { x: -21.5, z: 14.4, yaw: -2.2 }, { x: -25.8, z: 15.2, yaw: 2.6 }];
  // The lane flock used to stand ON the two village fence lines, so from the road the top rail ran straight through
  // two sheep's chests and a post through a third's neck. The fold below is a real pen: the rails are its walls, and
  // every sheep stands clear of them and of its neighbours (checked in layout, see L.fold).
  L.laneSheep = [{ x: 9.6, z: -34.6, yaw: 2.9 }, { x: 12.2, z: -35.6, yaw: -2.5 }, { x: 10.4, z: -37.4, yaw: 0.4 }, { x: 13.0, z: -37.6, yaw: 1.4 }];
  L.ducks = [{ pond: 0, rad: 1.9, ph: 0 }, { pond: 0, rad: 1.4, ph: 2.4 }, { pond: 1, rad: 2.1, ph: 1.1 }];

  // ── interactables ──
  const door = (() => { const o = L.cottage, c = Math.cos(o.rot), s = Math.sin(o.rot), lx = o.doorX, lz = o.D / 2 + 0.2; return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c }; })();
  L.props = [
    { type: 'sign', name: 'signpost', x: L.sign.x, z: L.sign.z, line: 'signpost', reach: 2.2, height: 2.55 },
    { type: 'door', name: 'cottage door', x: door.x, z: door.z, line: 'cottage-door', reach: 2.2, height: 2.7 },
    { type: 'barrel', name: 'rain barrel', x: L.barrels[0].x, z: L.barrels[0].z, line: 'rain-barrel', reach: 1.6, height: 1.55 },
    ...L.sheep.map((s, i) => ({ type: 'sheep', name: 'sheep ' + (i + 1), x: s.x, z: s.z, line: 'sheep', reach: 4.6, height: 1.75, animal: i })),
    ...L.ducks.map((d, i) => ({ type: 'duck', name: 'duck ' + (i + 1), x: PONDS[d.pond].x, z: PONDS[d.pond].z, line: 'duck', reach: 3.4, height: 1.0, animal: i })),
  ];

  // ── exits: the lanes run on to places that are not built yet; each ends with somebody (or some sheep) saying so
  //    (the words are lines 'lane-sheep' / 'lane-east' / 'lane-south' in meadow.npcs.js) ──
  const exitOn = (pts, line, name) => {
    let k = pts.length - 1;
    while (k > 0 && superR(pts[k][0], pts[k][1]) > BOUND - 1.6) k--;
    const kb = Math.max(0, k - 8);
    const back = pts[k] && pts[kb] ? { x: pts[kb][0], z: pts[kb][1] } : null;
    return { x: pts[k][0], z: pts[k][1], w: 4.2, h: 4.2, to: null, line, name, back, kind: 'edge' };
  };
  L.exits = [exitOn(L.lane, 'lane-sheep', 'the lane into Puddlewick'), exitOn(L.east, 'lane-east', 'the lane to Saltmarrow'),
    exitOn([...L.lane].reverse(), 'lane-south', 'the Long Lane')];

  LAYOUT = L;
  return L;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// terrain
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function heightAt(x, z) {
  const L = layout();
  let h = heightRaw(x, z);
  for (const p of L.pads) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 3.5) h = lerp(h, p.y, 1 - smooth(p.r, p.r + 3.5, d)); }
  const dW = L.water.sample(x, z);
  h = lerp(VALLEY + (h - VALLEY) * 0.25, h, smooth(2.4, 11, dW));      // the Beck's gentle valley
  h -= 0.07 * smooth(0.45, 0.92, L.masks.sample(0, x, z));             // lanes worn a little lower
  if (dW < HW + BANK) h = lerp(BED, h, smooth(HW - 0.55, HW + BANK, dW)); // the channel and its banks
  return h;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// critters (merged, vertex coloured; instanced by the kit)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function coloured(geo, hex, matrix) { const g = prep(geo, hex); if (matrix) g.applyMatrix4(matrix); return g; }
const MX = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

function sheepGeometry({ far = false } = {}) {
  const wool = [];
  const W = PAL.animal.wool;
  wool.push(coloured(new THREE.IcosahedronGeometry(0.42, 1), W, MX(0, 0.62, 0, 0.95, 0.8, 1.2)));
  for (const [x, y, z, r] of [[0.21, 0.8, 0.12, 0.22], [-0.21, 0.8, 0.1, 0.22], [0, 0.92, -0.14, 0.25],
    [0, 0.64, -0.44, 0.23], [0.25, 0.58, -0.12, 0.23], [-0.25, 0.58, -0.12, 0.23], [0, 0.72, 0.36, 0.2], [0, 0.73, -0.64, 0.09]]) {
    wool.push(coloured(new THREE.IcosahedronGeometry(r, far ? 0 : 1), W, MX(x, y, z)));
  }
  const body = mergeGeometries(wool);
  { // wool is a touch creamier underneath
    const p = body.attributes.position, c = body.attributes.color, a = C3(PAL.animal.woolShade), b = C3(PAL.animal.wool), t = new THREE.Color();
    for (let i = 0; i < p.count; i++) { t.copy(a).lerp(b, smooth(0.35, 0.8, p.getY(i))); c.setXYZ(i, t.r, t.g, t.b); }
  }
  const legs = [];
  for (const [x, z] of [[0.17, 0.25], [-0.17, 0.25], [0.17, -0.3], [-0.17, -0.3]]) legs.push(coloured(new THREE.CylinderGeometry(0.055, 0.05, 0.36, 6), PAL.animal.hoof, MX(x, 0.19, z)));
  const bodyAll = mergeGeometries([body, ...legs]);
  const head = mergeGeometries([
    coloured(far ? new THREE.SphereGeometry(0.17, 8, 6) : new THREE.SphereGeometry(0.17, 11, 8), PAL.animal.face, MX(0, -0.03, 0.14, 0.82, 0.95, 1.15)),
    coloured(new THREE.IcosahedronGeometry(0.13, 1), W, MX(0, 0.12, 0.06, 1.1, 0.8, 1)),
    coloured(new THREE.SphereGeometry(0.07, 7, 4), PAL.animal.ear, MX(0.18, 0.04, 0.06, 1.45, 0.45, 0.8, 0, 0, -0.35)),
    coloured(new THREE.SphereGeometry(0.07, 7, 4), PAL.animal.ear, MX(-0.18, 0.04, 0.06, 1.45, 0.45, 0.8, 0, 0, 0.35)),
    coloured(new THREE.SphereGeometry(0.036, 6, 4), PAL.char.white, MX(0.085, 0.03, 0.265)),
    coloured(new THREE.SphereGeometry(0.036, 6, 4), PAL.char.white, MX(-0.085, 0.03, 0.265)),
    coloured(new THREE.SphereGeometry(0.021, 5, 3), PAL.char.eye, MX(0.083, 0.03, 0.296)),
    coloured(new THREE.SphereGeometry(0.021, 5, 3), PAL.char.eye, MX(-0.083, 0.03, 0.296)),
  ]);
  return { body: bodyAll, head, headAt: [0, 0.74, 0.46] };
}

function duckGeometry() {
  const D = PAL.animal.duck;
  const body = mergeGeometries([
    coloured(new THREE.SphereGeometry(0.22, 11, 7), D, MX(0, 0.1, 0, 0.9, 0.68, 1.3)),
    coloured(new THREE.ConeGeometry(0.09, 0.2, 10), D, MX(0, 0.2, -0.29, 1, 1, 1, -0.9)),
    coloured(new THREE.SphereGeometry(0.1, 8, 6), D, MX(0.15, 0.15, -0.02, 0.5, 0.6, 1.3)),
    coloured(new THREE.SphereGeometry(0.1, 8, 6), D, MX(-0.15, 0.15, -0.02, 0.5, 0.6, 1.3)),
  ]);
  const head = mergeGeometries([
    coloured(new THREE.CylinderGeometry(0.055, 0.07, 0.16, 7), D, MX(0, -0.06, -0.02)),
    coloured(new THREE.SphereGeometry(0.11, 9, 6), D, MX(0, 0.06, 0.02)),
    coloured(new THREE.SphereGeometry(0.055, 8, 5), PAL.animal.beak, MX(0, 0.03, 0.14, 1.1, 0.45, 1.5)),
    coloured(new THREE.SphereGeometry(0.018, 6, 5), PAL.char.eye, MX(0.07, 0.09, 0.08)),
    coloured(new THREE.SphereGeometry(0.018, 6, 5), PAL.char.eye, MX(-0.07, 0.09, 0.08)),
  ]);
  return { body, head, headAt: [0, 0.3, 0.2] };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the def
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const meadow = {
  id: 'meadow',
  name: 'Puddlewick Vale',
  kind: 'field',
  size: [80, 80],
  origin: [-HALF, -HALF],
  res: 4,
  theme: 'grass',
  music: 'village',
  ambience: 'amb_meadow',
  hours: 9,
  light: { preset: 'day' },
  weather: 'clear',
  encounters: null,
  spawn: { x: 1.4, z: 19.2, facing: Math.PI },
  camera: { orbit: 4, pitch: 26, dist: 10.5, fov: 50, lookUp: 2.7 },
  tiles: {
    height: heightAt,
    solid(x, z) {
      if (superR(x, z) > BOUND) return true;
      const L = layout();
      if (L.water.sample(x, z) < HW + 0.35 && !L.bridge.corridor(x, z, 0.3)) return true;
      return false;
    },
    ground(x, z) {
      const L = layout();
      if (L.bridge.deckY(x, z) != null) return 'wood';
      if (L.water.sample(x, z) < HW) return 'water';
      return L.masks.sample(0, x, z) > 0.5 ? 'dirt' : 'grass';
    },
  },
  walkY(x, z, terrain) {
    const y = layout().bridge.deckY(x, z);
    const t = terrain(x, z);
    return y != null ? Math.max(t, y) : t;
  },
  get colliders() { return layout().colliders; },
  get props() { return layout().props; },
  get exits() { return layout().exits; },
  get occluders() { return layout().occluders; },
  npcs: [],

  view({ scene, rig, map, blobs, App }) {
    const t0 = performance.now();
    const low = !!(App && App.quality === 'low');          // P34 tier: no foliage hulls, thinner grass
    const L = layout();
    const ao = makeAOMask({ span: MASK_SPAN, size: 1024, center: [0, 0] });
    const kit = createKit({ scene, heightAt, ao, low });
    const sky = buildSky(scene, rig);
    ringHill(scene, 'mid', 118, 150, 205, 5, 21, 71, PAL.hill.midLow, PAL.hill.mid, 0.2);
    ringHill(scene, 'far', 240, 300, 380, 12, 78, 81, PAL.hill.farLow, PAL.hill.far, 0.25, { fogged: false, peaky: 1.8 });

    // ── buildings ──
    const cot = kit.cottage(L.cottage);
    const chimneys = [cot.chimneyTop];
    for (const o of L.village) { const b = kit.cottage(o); chimneys.push(b.chimneyTop); }
    // ── the garden: picket fence, flower bed, bench, barrels, crate, woodpile, washing line ──
    kit.picket(L.picket);
    for (const b of L.beds) kit.flowerBed(b.x, b.z, b.w, b.d, b.rot, 17);
    kit.bench(L.bench.x, L.bench.z, L.bench.rot);
    for (const b of L.barrels) kit.barrel(b.x, b.z, b.s, b.x);
    for (const c of L.crates) kit.crate(c.x, c.z, c.r);
    kit.woodpile(L.woodpile.x, L.woodpile.z, L.woodpile.rot);
    kit.laundry(L.laundry[0], L.laundry[1], [
      { t: 0.18, w: 0.9, h: 0.72, tex: Tex.cloth(PAL.cloth.cream, { stripe: PAL.cloth.red, S: 128 }) },
      { t: 0.42, w: 1.0, h: 1.15, tex: Tex.cloth(PAL.cloth.green) },
      { t: 0.64, w: 0.75, h: 0.9, tex: Tex.cloth(PAL.cloth.blue) },
      { t: 0.85, w: 0.55, h: 0.55, tex: Tex.cloth(PAL.cloth.mustard) },
    ]);
    // ── the paddock, and the village fold the lane flock stands in ──
    kit.fence(L.paddock, { seed: 11 });
    L.drove.forEach((run, i) => kit.fence(run, { seed: 12 + i }));
    // ── the well, the hay, the stile, the scarecrow and his kitchen garden, the orchard's crates and ladder ──
    kit.well(L.well.x, L.well.z, L.well.rot);
    for (const h of L.hay) kit.hayBale(h.x, h.z, h.rot, { round: h.round, s: h.s ?? 1, lift: h.lift ?? 0 });
    kit.stile(L.stile.x, L.stile.z, L.stile.rot);
    kit.scarecrow(L.scarecrow.x, L.scarecrow.z, L.scarecrow.rot);
    kit.vegPatch(L.veg.x, L.veg.z, L.veg.w, L.veg.d, L.veg.rot, 9);
    for (const c of L.orchard.crates) kit.appleCrate(c.x, c.z, c.rot, { s: c.s ?? 1 });
    kit.ladder(L.orchard.ladder.x, L.orchard.ladder.z, L.orchard.ladder.rot);
    // ── lanterns: both ends of the footbridge, one by the cottage door, and a string of them up the lane ──
    for (const [ex, ez] of L.bridge.ends) kit.lantern(ex + L.bridge.sx * 1.5, ez + L.bridge.sz * 1.5, Math.atan2(-L.bridge.sx, -L.bridge.sz));
    kit.lantern(L.cottage.x + 2.6, L.cottage.z + 1.8, -Math.PI / 2, { h: 1.8 });
    // ── THE OUTFIELD: every corner of the vale gets something worth walking to, and every fork and edge is marked ──
    const OF = L.outfield;
    for (const run of OF.fences) kit.fence(run, { seed: 21 + run.length });
    for (const s of OF.stiles) kit.stile(s.x, s.z, s.rot);
    for (const h of OF.hay) kit.hayBale(h.x, h.z, h.rot, { round: h.round, s: h.s ?? 1 });
    for (const b of OF.barrels) kit.barrel(b.x, b.z, b.s ?? 1, b.x);
    for (const c of OF.crates) kit.crate(c.x, c.z, c.rot, c.s ?? 1);
    for (const w of OF.woodpiles) kit.woodpile(w.x, w.z, w.rot);
    for (const b of OF.benches) kit.bench(b.x, b.z, b.rot);
    for (const l of OF.lanterns) kit.lantern(l.x, l.z, l.rot, { h: l.h ?? 2.0 });
    for (const s of OF.scarecrows) kit.scarecrow(s.x, s.z, s.rot);
    for (const v of OF.veg) kit.vegPatch(v.x, v.z, v.w, v.d, v.rot, 33);
    // ── the signposts: the fork by the lane, and the one that points down the Long Lane ──
    const atlas = kit.useSignAtlas(kit.signAtlas(['Puddlewick', 'Saltmarrow', 'The Long Lane']));
    kit.signpost(atlas, L.sign.x, L.sign.z, [
      { label: 'Puddlewick', dir: -1.95 },
      { label: 'Saltmarrow', dir: 1.62 },
    ]);
    kit.signpost(atlas, L.signLane.x, L.signLane.z, [{ label: 'The Long Lane', dir: 2.9 }], { h: 1.55 });
    // ── the Beck: footbridge, rocks, reeds, lily pads ──
    kit.footbridge(L.bridge);
    for (const k of L.rocks) kit.rock(k.x, k.z, k.s, k.seed);
    const shore = (x, z, y) => y > WATER_Y - 0.14 && y < WATER_Y + 0.4;          // reeds grow at the water's edge, not in it
    kit.reeds(PONDS[0].x + 3.6, PONDS[0].z + 2.6, 16, 21, 1.3, shore);
    kit.reeds(PONDS[0].x - 3.9, PONDS[0].z - 2.2, 12, 22, 1.2, shore);
    kit.reeds(PONDS[1].x - 3.2, PONDS[1].z + 3.1, 14, 23, 1.3, shore);
    // the Beck's banks: reeds and half-sunk stones the whole length of it, so the river has edges instead of a stripe
    L.beck.forEach(([bx, bz], i) => {
      if (i % 9) return;
      const side = (i / 9) % 2 ? 1 : -1, d = 2.0 + ((i * 7) % 5) * 0.22;
      const a = L.beck[Math.max(0, i - 2)], b = L.beck[Math.min(L.beck.length - 1, i + 2)];
      const tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
      const px = bx - tz / tl * d * side, pz = bz + tx / tl * d * side;
      if (superR(px, pz) > BOUND - 1 || L.bridge.corridor(px, pz, 2.2)) return;
      kit.reeds(px, pz, 7 + (i % 4), 40 + i, 0.85, shore);
      if ((i / 9) % 2) kit.rock(bx - tz / tl * (d - 0.9) * side, bz + tx / tl * (d - 0.9) * side, 0.34 + ((i * 3) % 4) * 0.08, 200 + i, { sink: 0.45 });
    });
    kit.lilyPads(PONDS[0].x - 1.0, PONDS[0].z + 0.4, WATER_Y, 6, 31, 2.2);
    kit.lilyPads(PONDS[1].x + 0.6, PONDS[1].z - 0.8, WATER_Y, 5, 32, 2.0);

    // ── trees: ONE mixed grove — the meadow's own trees and the rim's rows, every species CPU-culled and
    //    LOD-picked per instance by the kit (src/art/props.js kit.trees), so the whole wood is a few draw calls ──
    // the woodland floor. 1024 over 200 units (was 512): at half that resolution a single tree's shade pool read as
    // a hard-edged octagonal decal stamped on the grass wherever it crossed the lane.
    const shade = makeAOMask({ span: 200, size: 1024, center: [0, 0] });
    kit.trees(L.trees);
    kit.trees(L.ring.trees, { shade });
    // the wooded hills beyond the rim: painted treetop clumps, hazier every row, with green slopes showing between
    kit.cards(L.ring.cards, { sunDir: rig.dir, shade });

    kit.flush();

    // ── water (after the buckets: transparent-free, but drawn over the carved banks) ──
    // one level sheet wider than the water: the carved banks decide the shore, so river and ponds meet seamlessly
    kit.water({ stream: L.beck, width: 2 * (HW + BANK + 0.45), ponds: PONDS.map(p => ({ x: p.x, z: p.z, r: p.r + BANK + 1.7, sx: p.sx, sz: p.sz })), y: WATER_Y, shoreDepth: 0.42 });

    // ── tufts + flowers (footprints and AO are complete now) ──
    const pathAt = (x, z) => L.masks.sample(0, x, z);
    const onMeadow = (x, z) => superR(x, z) < 40 && pathAt(x, z) < 0.3 && L.water.sample(x, z) > 2.3 && !L.bridge.corridor(x, z, 1);
    kit.tufts({ count: low ? 700 : 1150, boost: (x, z) => 0.08 * (1 - smooth(6, 16, Math.hypot(x - 1.5, z - 16))), radius: 40, seed: 999, accept: onMeadow, rimOf: (x, z) => { const p = pathAt(x, z); return smooth(0.08, 0.3, p) * (1 - smooth(0.3, 0.42, p)) + smooth(3.2, 2.4, L.water.sample(x, z)) * 0.6; } });
    const hues = [PAL.flower.white, PAL.flower.yellow, PAL.flower.pink, PAL.flower.white, PAL.flower.blue, PAL.flower.yellow];
    const fr = mulberry(5150), clusters = [
      { x: 4.8, z: 12.6, hue: PAL.flower.yellow, n: 16 }, { x: -2.6, z: 13.5, hue: PAL.flower.white, n: 18 }, { x: 3.8, z: 20.5, hue: PAL.flower.pink, n: 14 },
      { x: -3.2, z: 6.4, hue: PAL.flower.blue, n: 12 }, { x: 5.6, z: 3.8, hue: PAL.flower.white, n: 16 }, { x: -6.0, z: 8.8, hue: PAL.flower.pink, n: 14 },
      { x: 7.6, z: -7.4, hue: PAL.flower.yellow, n: 16 }, { x: -8.8, z: -7.6, hue: PAL.flower.white, n: 14 }, { x: 1.4, z: -16.0, hue: PAL.flower.pink, n: 12 },
      { x: -4.4, z: 22.5, hue: PAL.flower.white, n: 20 }, { x: 6.8, z: 24.0, hue: PAL.flower.yellow, n: 18 }, { x: -1.8, z: 27.0, hue: PAL.flower.pink, n: 14 }, { x: 8.2, z: 17.0, hue: PAL.flower.blue, n: 12 },
    ];
    // flowers over the WHOLE vale, in patches of very different size, not a handful round the cottage
    for (let i = 0; i < 62; i++) clusters.push({ x: (fr() - 0.5) * 64, z: (fr() - 0.5) * 64, hue: hues[(fr() * hues.length) | 0],
      n: 6 + (fr() * 16 | 0), spread: 0.7 + fr() * 1.9 });
    kit.flowers(clusters, { accept: (x, z) => onMeadow(x, z) && pathAt(x, z) < 0.2 });

    // ── the ground last: it samples the finished AO mask ──
    buildGround(scene, { heightAt, masks: L.masks, ao, shade, inner: 37, step: 1.0, outer: 132, rings: 8 });   // the fine grid ends under the woodland's first row

    // ── the sky's small stories: birds over the vale, and Highfeather, faint, for anyone who looks up ──
    kit.birds(4, { centre: [4, -2], height: 11, radius: 16, seed: 91 });
    kit.skyCastle({ azimuth: -1.12, elevation: 0.12, distance: 720, size: 112, opacity: 0.86, tintFrom: sky.clouds.material });

    // ── life: smoke, butterflies, sheep, ducks ──
    kit.smoke(chimneys.filter(Boolean));
    kit.butterflies([{ x: 4.2, z: 13.2, hue: PAL.flower.yellow }, { x: -2.2, z: 14.4, hue: PAL.char.white }, { x: 5.2, z: 4.4, hue: PAL.flower.pink },
      { x: -7.2, z: 5.8, hue: PAL.flower.yellow }, { x: 7.2, z: -6.8, hue: PAL.char.white }, { x: -4.6, z: 22.2, hue: PAL.flower.white },
      { x: 6.9, z: 24.2, hue: PAL.flower.yellow }, { x: -9.8, z: 17.6, hue: PAL.flower.pink }, { x: 1.6, z: -16.2, hue: PAL.char.white },
      { x: 19.4, z: 19.8, hue: PAL.flower.yellow }], { perSpot: 1 });
    // birds on the lane, by the bridge, in the paddock — and two sitting beside the scarecrow, unimpressed.
    // They peck and hop, and clatter up into the air when the hero comes close.
    kit.groundBirds([
      { x: 2.6, z: 22.6 }, { x: -1.2, z: 23.9 }, { x: 4.4, z: 16.4 },
      { x: -5.2, z: -9.2 }, { x: -1.0, z: -13.8 },
      { x: -7.0, z: 14.2, kind: 'robin' }, { x: -9.2, z: 16.4 }, { x: -8.2, z: 1.7, kind: 'robin' },
      { x: -19.2, z: 9.6 }, { x: 17.2, z: 16.8, kind: 'robin' },
    ], { scare: 3.4, seed: 17 });
    // pollen and seed fluff drifting through the sun around the hero, and ripples spreading on the ponds
    kit.motes({ count: low ? 34 : 68, radius: 11, height: 3.2, seed: 21 });
    const duckPts = L.ducks.map(d => ({ x: PONDS[d.pond].x, z: PONDS[d.pond].z }));
    kit.ripples(PONDS.map(p => ({ x: p.x, z: p.z, r: p.r, sx: p.sx, sz: p.sz })), { y: WATER_Y, sources: () => duckPts, every: 1.0 });
    const sg = sheepGeometry(), dg = duckGeometry();
    const flock = [...L.sheep.map(s => Object.assign({ pen: true }, s)), ...L.laneSheep.map(s => Object.assign({ pen: false }, s))];
    // the paddock flock and the lane flock by the village are separate meshes, so each is culled when out of view
    const penSheep = kit.critters({ name: 'sheep', body: sg.body, head: sg.head, headAt: sg.headAt, count: L.sheep.length, outline: 0.022, headOutline: false,
      bounds: { x: L.paddockCentre.x, y: heightAt(L.paddockCentre.x, L.paddockCentre.z) + 0.6, z: L.paddockCentre.z, r: L.paddockCentre.r + 3 } });
    const laneBounds = (() => { let x = 0, z = 0; for (const q of L.laneSheep) { x += q.x; z += q.z; } x /= L.laneSheep.length; z /= L.laneSheep.length; return { x, z, y: heightAt(x, z) + 0.6, r: 4.5 }; })();
    const sgFar = sheepGeometry({ far: true });                      // the lane flock is only ever seen from across the vale
    const laneSheep = kit.critters({ name: 'laneSheep', body: sgFar.body, head: sgFar.head, headAt: sgFar.headAt, count: L.laneSheep.length, outline: 0.022, headOutline: false, bounds: laneBounds });
    const sheep = {
      set(i, ...a) { if (i < L.sheep.length) penSheep.set(i, ...a); else laneSheep.set(i - L.sheep.length, ...a); },
      commit() { penSheep.commit(); laneSheep.commit(); },
    };
    const ducks = kit.critters({ name: 'duck', body: dg.body, head: dg.head, headAt: dg.headAt, count: L.ducks.length, outline: 0.016, headOutline: false });
    const rnd = mulberry(8080);
    const S = flock.map((s, i) => ({ ...s, tx: s.x, tz: s.z, mode: 'graze', timer: 1 + rnd() * 4, pitch: 0.7, ph: rnd() * TAU, walk: 0, id: i }));
    const propsByAnimal = { sheep: map.props.filter(p => p.type === 'sheep'), duck: map.props.filter(p => p.type === 'duck') };

    const buildMs = Math.round(performance.now() - t0);
    const tmp = new THREE.Vector3();
    return {
      sky,
      update(t, dt, c) {
        const cam = c && c.camera;
        if (cam) sky.sky.position.copy(cam.position);
        sky.clouds.rotation.y = t * 0.0035;
        kit.update(t, dt, cam, c && c.player);
        // sheep: graze, look up, amble somewhere nicer, graze again
        for (const s of S) {
          s.timer -= dt;
          if (s.mode === 'graze' && s.timer <= 0) { s.mode = 'look'; s.timer = 1.2 + rnd() * 2.2; }
          else if (s.mode === 'look' && s.timer <= 0) {
            if (s.pen) {
              const a = rnd() * TAU, d = Math.sqrt(rnd()) * L.paddockCentre.r;
              s.tx = L.paddockCentre.x + Math.cos(a) * d; s.tz = L.paddockCentre.z + Math.sin(a) * d; s.mode = 'walk';
            } else { s.mode = 'graze'; s.timer = 3 + rnd() * 5; s.yaw += (rnd() - 0.5) * 1.2; }
          } else if (s.mode === 'walk') {
            const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
            if (d < 0.15) { s.mode = 'graze'; s.timer = 3 + rnd() * 5; }
            else {
              const want = Math.atan2(dx, dz); s.yaw += angDiff(want, s.yaw) * Math.min(1, dt * 3);
              const v = Math.min(0.55, d) * dt; s.x += Math.sin(s.yaw) * v; s.z += Math.cos(s.yaw) * v; s.walk += dt * 7;
            }
          }
          const pitchT = s.mode === 'graze' ? 0.75 + Math.sin(t * 5 + s.ph) * 0.06 : s.mode === 'look' ? -0.12 : 0.18;
          s.pitch += (pitchT - s.pitch) * Math.min(1, dt * 4);
          const hop = s.mode === 'walk' ? Math.abs(Math.sin(s.walk)) * 0.05 : 0;
          const breathe = Math.sin(t * 2 + s.ph) * 0.015;
          const lookYaw = s.mode === 'look' ? Math.sin(t * 1.3 + s.ph) * 0.5 : 0;
          const gy = heightAt(s.x, s.z);
          sheep.set(s.id, s.x, gy + hop, s.z, s.yaw, s.pitch, lookYaw, s.pen ? 1 : 0.95, breathe);
          if (blobs && s.id + 1 < blobs.capacity) blobs.set(s.id + 1, s.x + Math.sin(s.yaw) * 0.05, gy, s.z + Math.cos(s.yaw) * 0.05, 1.25 - hop, 1.2);
          if (s.pen && propsByAnimal.sheep[s.id]) { propsByAnimal.sheep[s.id].x = s.x; propsByAnimal.sheep[s.id].z = s.z; }
        }
        sheep.commit();
        // ducks: slow circles, bobbing, the odd dip
        L.ducks.forEach((d, i) => {
          const P = PONDS[d.pond], a = t * 0.16 * (i % 2 ? -1 : 1) + d.ph;
          const x = P.x + Math.cos(a) * d.rad * P.sx, z = P.z + Math.sin(a) * d.rad * P.sz;
          const yaw = Math.atan2(-Math.sin(a) * (i % 2 ? -1 : 1), Math.cos(a) * (i % 2 ? -1 : 1));
          const dip = Math.max(0, Math.sin(t * 0.7 + d.ph * 3) - 0.92) * 12;
          ducks.set(i, x, WATER_Y - 0.06 + Math.sin(t * 2.1 + d.ph) * 0.02, z, yaw, dip * 0.9 - 0.1, 0, 1);
          if (duckPts[i]) { duckPts[i].x = x; duckPts[i].z = z; }
          if (propsByAnimal.duck[i]) { propsByAnimal.duck[i].x = x; propsByAnimal.duck[i].z = z; }
        });
        ducks.commit();
        void tmp;
      },
      state() { return { buildMs, counts: Object.assign({}, kit.counts), grove: kit.groveState(), bridge: { x: +L.bridge.cx.toFixed(2), z: +L.bridge.cz.toFixed(2) }, sign: L.sign, see: Object.assign({}, kit.seeState) }; },
      dispose() {},
    };
  },
};

/** Where things are, for scenarios and critics (read-only). */
export function meadowLayout() {
  const L = layout();
  return { sign: { ...L.sign }, bridge: { x: L.bridge.cx, z: L.bridge.cz, dir: L.bridge.dir }, cottageDoor: L.props.find(p => p.type === 'door'),
    spawn: { ...meadow.spawn }, exits: L.exits.map(e => ({ name: e.name, x: e.x, z: e.z })) };
}

export default meadow;
