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
  ringPlacements, speciesBounds, SPECIES, LANDMARK_SETS } from '../scenery.js';

/**
 * The woodland rim: a hedgerow on the boundary, then THREE staggered rows of mixed tree clumps with gaps you can
 * see out through, then wooded hills painted on cards, hazier every row. (e = superellipse "radius"; the walkable
 * edge is BOUND = 33.5.) `clump` breaks each row into clumps, and every row's noise is offset so they stagger.
 */
const WOOD_ROWS = [
  // P04 #5: hedgerow must gap and vary (0.65–1.55) — unbroken stamp is the green wallpaper
  { kind: 'tree', e: 36.0, spacing: 2.55, jitter: 0.55, size: [0.65, 1.55], mouth: 4.0, clump: { freq: 14, threshold: 0.40, seed: 5 } },
  // view = corridor half-scale: mid rows used to be ~0.12 (≈7°), so the Puddlewick bearing filled with
  // chestnut/oak and hid the one town the HUD points at (P04 #6). Keep a real wedge through every row.
  { kind: 'tree', e: 38.8, spacing: 3.9, jitter: 1.4, size: [0.9, 1.45], mouth: 3.4, view: 0.48, clump: { freq: 13, threshold: 0.48, seed: 91 } },
  { kind: 'tree', e: 43.4, spacing: 4.6, jitter: 1.8, size: [0.95, 1.55], mouth: 2.6, view: 0.52, clump: { freq: 10, threshold: 0.52, seed: 57 } },
  { kind: 'tree', e: 48.6, spacing: 6.0, jitter: 2.4, size: [1.0, 1.65], mouth: 1.6, view: 0.56, clump: { freq: 7, threshold: 0.64, seed: 23 } },
  { kind: 'card', e: 57.5, spacing: 6.6, jitter: 3.2, size: [6.0, 8.4], haze: 0.16, view: 0.62, clump: { freq: 6, threshold: 0.54, seed: 131 } },
  { kind: 'card', e: 69.0, spacing: 8.0, jitter: 4.8, size: [6.8, 9.6], haze: 0.28, view: 0.66, clump: { freq: 5, threshold: 0.58, seed: 167 } },
  { kind: 'card', e: 84.0, spacing: 10.0, jitter: 6.2, size: [7.6, 10.8], haze: 0.40, view: 0.70, clump: { freq: 4, threshold: 0.62, seed: 199 } },
];

/**
 * THE VIEW CORRIDORS. A vale ringed by four unbroken rows of trees and three more of painted hills has no
 * horizon: the next town has to be hung in the sky above the treeline to be seen at all, which is exactly why it
 * floated. Every bearing a signpost points down — the Puddlewick lane, the Beck lane east to Saltmarrow, the
 * Long Lane south to Coddleston, and a narrower window west over the Whispering Wood — now gets a WEDGE cut
 * clean through rows 1-6, so from the lane's end a child sees the hills roll across the distance with the place
 * standing ON them. `az` is the world bearing atan2(z, x); `half` the half-angle of the wedge in radians.
 * They match LANDMARK_SETS.vale exactly, so the pass in the hills, the gap in the wood and the painted place
 * are all on the same line.
 */
const VIEW_CORRIDORS = [
  // puddlewick half was 1.00 — still lost behind mid-row canopy; widen so the lane bearing stays an open wedge
  { id: 'puddlewick', az: -1.166, half: 1.18 },
  { id: 'saltmarrow', az: -0.129, half: 1.00 },
  { id: 'coddleston', az: 1.326, half: 1.00 },
  { id: 'whispering_wood', az: 2.950, half: 0.62 },
];

/**
 * Which species grows where: broad groves of one kind (birch coppice, pine stand) with the rest mixed through.
 * The boundary row alternates TWO hedgerow shapes and two bush shapes, so a run of it is never the same blob
 * twice over — the old single-shape hedge read as a chain of identical spheres round the whole vale.
 */
/** Is (x, z) inside one of the view corridors? `k` scales every wedge (rows widen theirs as they go out). */
function inCorridor(x, z, k = 1) {
  const a = Math.atan2(z, x);
  for (const c of VIEW_CORRIDORS) { let d = (a - c.az) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; if (Math.abs(d) < c.half * k) return c; }
  return null;
}

function woodPick(x, z, rnd, ri) {
  const g = vnoise(x * 0.042 + 3.1, z * 0.042 + 7.7, 43);
  let kind = g < 0.33 ? 'birch' : g > 0.79 ? 'pine' : g > 0.62 ? 'round' : 'oak';
  const k = rnd();
  if (ri === 0) {                                                             // the boundary: hedgerow + the odd tree
    const h = vnoise(x * 0.09 + 17.3, z * 0.09 + 4.1, 67);
    // inside a view corridor the boundary stays LOW — and on the Puddlewick bearing leave a real gap so the
    // town card is not buried behind hedge mid-LODs (P04 #6)
    const corr = inCorridor(x, z, 0.72);
    if (corr) {
      if (corr.id === 'puddlewick' && k < 0.62) return null;
      if (k < 0.22) return null;                                              // P04 #5: thin even in corridors
      return k < 0.55 ? (h < 0.5 ? 'hedge' : 'hedgeb') : (h < 0.45 ? 'bushb' : 'bush');
    }
    // P04 #5: leave real gaps so the rim is not an unbroken green stamp
    if (k < 0.18) return null;
    if (k < 0.70) return h < 0.5 ? 'hedge' : 'hedgeb';
    if (k < 0.88) return h < 0.45 ? 'bushb' : 'bush';
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
// the field tracks: to the drystone fold, past the fallen oak in the north wood, along the cut hayfield —
// extended into the four census corners so ochre dirt (not more green furniture) breaks the wallpaper
const TRACK_A = [[2.0, 13.4], [-3.4, 17.0], [-8.4, 20.6], [-13.4, 22.6], [-17.4, 24.6], [-21.0, 26.8], [-24.5, 28.0]];
const TRACK_B = [[-2.0, -13.5], [-8.0, -16.5], [-13.6, -18.4], [-19.5, -20.6], [-23.5, -23.5], [-25.5, -25.2]];
const TRACK_C = [[6.0, 29.5], [11.5, 30.6], [17.0, 29.4], [22.0, 27.0], [24.8, 25.2]];
const TRACK_D = [[8.0, -6.0], [14.0, -10.0], [19.5, -15.5], [23.5, -20.5], [25.5, -24.0]];
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
  // Three FIELD TRACKS: not lanes, just the worn lines feet and hooves make between the places people go. They
  // are the ochre in the corner frames — the vale away from the cottage was one green with no path in it at all —
  // and they curve, so from any of them you cannot see where they end.
  L.trackA = curvePoints(TRACK_A, 0.3); L.trackB = curvePoints(TRACK_B, 0.3); L.trackC = curvePoints(TRACK_C, 0.3);
  L.trackD = curvePoints(TRACK_D, 0.3);
  L.laneOut = L.lane.filter(([x, z]) => superR(x, z) > 28); L.eastOut = L.east.filter(([x, z]) => superR(x, z) > 28);
  // P04 #5: worn dirt must be VISIBLE in corner frames (ochre / brown hue lives outside the green census band)
  const CORNER_YARDS = [
    { x: -22.0, z: -21.5, r: 5.6 },   // NW — fallen oak approach
    { x: -21.0, z: 24.5, r: 6.2 },    // SW — drystone fold yard (largest: worst census corner)
    { x: 20.5, z: 23.5, r: 5.4 },     // SE — cut hayfield stubble
    { x: 23.0, z: -17.5, r: 4.8 },    // NE — boulder / pond approach
  ];
  L.masks = paintMasks({
    N: 1024, span: MASK_SPAN,
    strokes: [
      { pts: L.lane, w: 1.7, falloff: 0.65, channel: 0 },
      { pts: L.east, w: 1.45, falloff: 0.65, channel: 0, widthAt: (t) => lerp(1.55, 1.2, t) },
      { pts: L.spur, w: 0.95, falloff: 0.55, channel: 0, widthAt: (t) => lerp(1.1, 0.8, t) },
      { pts: L.trackA, w: 1.25, falloff: 0.65, channel: 0, widthAt: (t) => lerp(1.35, 1.0, t) },
      { pts: L.trackB, w: 1.20, falloff: 0.62, channel: 0, widthAt: (t) => lerp(1.30, 0.95, t) },
      { pts: L.trackC, w: 1.15, falloff: 0.60, channel: 0, widthAt: (t) => lerp(1.25, 0.92, t) },
      { pts: L.trackD, w: 1.15, falloff: 0.60, channel: 0, widthAt: (t) => lerp(1.25, 0.90, t) },
      { pts: L.beck, w: 2 * (HW + BANK), falloff: 1.8, channel: 1 },
    ],
    discs: [
      ...PONDS.map(p => ({ x: p.x, z: p.z, r: p.r + BANK, sx: p.sx, sz: p.sz, falloff: 1.8, channel: 1 })),
      ...CORNER_YARDS.map(p => ({ x: p.x, z: p.z, r: p.r, falloff: 1.8, channel: 0 })),
      // stone yards — grey sits outside the green census band (SW was the worst corner)
      { x: -19.5, z: 24.2, r: 3.6, falloff: 1.4, channel: 2 },
      { x: -23.5, z: 26.0, r: 2.4, falloff: 1.1, channel: 2 },
      { x: -22.0, z: -20.5, r: 2.2, falloff: 1.1, channel: 2 },
    ],
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
  // ── THE FOUR PLACES ─────────────────────────────────────────────────────────────────────────────────────
  // The cottage yard proved the kit could dress a corner; the rest of the vale was sixty metres of one green
  // with about five tufts in it. Each corner away from the cottage now has ONE thing worth walking to, and each
  // brings a hue the meadow does not otherwise own: bark and toadstool red at the fallen oak, cut stone at the
  // drystone fold, ochre stubble at the hayfield, bare rock at the boulder field.
  L.places = [
    { id: 'fallen-oak', x: -20.2, z: -22.6, r: 5.2,
      stumps: [{ x: -20.5, z: -22.8, rot: 0.6, s: 1.15, seed: 3 }, { x: -17.2, z: -25.4, rot: 2.1, s: 0.72, seed: 8 }],
      logs: [{ x: -19.0, z: -21.0, rot: 0.75, len: 3.6, rad: 0.32, seed: 7 },
        { x: -22.6, z: -24.6, rot: 2.35, len: 2.4, rad: 0.24, seed: 12 }],
      brambles: [{ x: -22.9, z: -21.2, s: 1.15, seed: 11 }, { x: -17.9, z: -23.2, s: 0.9, seed: 14 }],
      shrooms: [{ x: -21.6, z: -20.2, n: 6, seed: 21, spread: 0.8 }, { x: -18.4, z: -26.2, n: 5, seed: 23, spread: 0.7 }],
      rocks: [{ x: -23.6, z: -19.4, s: 0.62, seed: 41 }] },
    { id: 'drystone-fold', x: -17.8, z: 23.6, r: 6.4,
      // longer wall runs into the SW census FOV (stone grey breaks the green band)
      walls: [[[-24.5, 22.8], [-22.0, 20.5], [-19.2, 22.9]], [[-16.4, 25.1], [-13.0, 26.4], [-10.5, 27.2]]],
      gates: [{ x: -17.85, z: 24.05, rot: -0.72, w: 2.9 }],
      rocks: [{ x: -21.4, z: 25.6, s: 1.45, seed: 51 }, { x: -20.0, z: 27.2, s: 0.85, seed: 52 },
        { x: -14.8, z: 22.4, s: 1.1, seed: 53 }, { x: -22.8, z: 23.4, s: 0.7, seed: 54 },
        { x: -24.0, z: 25.5, s: 1.2, seed: 55 }],
      brambles: [{ x: -20.2, z: 21.2, s: 0.95, seed: 16 }],
      shrooms: [{ x: -19.4, z: 26.4, n: 4, seed: 25, spread: 0.6 }] },
    { id: 'cut-hayfield', x: 18.5, z: 24.5, r: 6.8,
      // pulled toward SE census camera so ochre stooks read in the corner frame
      stooks: [{ x: 16.4, z: 22.8, rot: 0.3, s: 1.05, seed: 5 }, { x: 19.2, z: 24.6, rot: 1.1, s: 0.95, seed: 6 },
        { x: 15.0, z: 25.8, rot: 2.2, s: 1.0, seed: 7 }, { x: 20.8, z: 22.0, rot: 0.8, s: 0.9, seed: 9 },
        { x: 21.5, z: 25.8, rot: 2.9, s: 1.08, seed: 13 }, { x: 17.6, z: 27.2, rot: 1.6, s: 0.98, seed: 14 }],
      carts: [{ x: 22.0, z: 27.0, rot: -0.55 }],
      walls: [[[14.5, 21.5], [17.0, 20.8]]], gates: [], rocks: [], brambles: [], shrooms: [{ x: 14.2, z: 24.0, n: 4, seed: 27, spread: 0.6 }] },
    { id: 'boulder-field', x: 25.0, z: -10.4, r: 5.6,
      rocks: [{ x: 25.2, z: -10.6, s: 1.7, seed: 61 }, { x: 23.4, z: -12.4, s: 1.05, seed: 62 },
        { x: 26.8, z: -8.4, s: 0.9, seed: 63 }, { x: 22.6, z: -8.6, s: 1.25, seed: 64 },
        { x: 27.2, z: -12.8, s: 0.66, seed: 65 }],
      stumps: [{ x: 21.6, z: -11.6, rot: 1.2, s: 0.9, seed: 15 }],
      brambles: [{ x: 26.4, z: -13.6, s: 1.05, seed: 18 }, { x: 24.0, z: -7.2, s: 0.8, seed: 19 }],
      logs: [], walls: [], gates: [], stooks: [], carts: [],
      shrooms: [{ x: 22.4, z: -12.8, n: 4, seed: 29, spread: 0.5 }] },
  ].map(p => Object.assign({ stumps: [], logs: [], brambles: [], shrooms: [], rocks: [], walls: [], gates: [], stooks: [], carts: [] }, p));

  // ── THE SCATTER ─────────────────────────────────────────────────────────────────────────────────────────
  // Four places fixed four corners; the sixty metres BETWEEN them was still a single green with about five tufts
  // in it. This is the small ground furniture a real field has everywhere: molehills of bare earth, bracken going
  // rust at the tips, half-buried stones, bramble patches, toadstool rings, the odd stump and fallen branch.
  // Seeded, so it is the same every run, and cleared of every path, bank, building and place.
  const SCATTER = [['scrape', 4], ['mole', 28], ['bracken', 40], ['rock', 26], ['shrooms', 18], ['bramble', 16], ['stump', 8], ['log', 7]];
  const buildScatter = () => {
    const sr = mulberry(20260918), out = [];
    const bag = [];
    for (const [kind, n] of SCATTER) for (let i = 0; i < n; i++) bag.push(kind);
    for (let i = bag.length - 1; i > 0; i--) { const j = (sr() * (i + 1)) | 0; const t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
    const clash = (x, z, rad, kind) => {
      if (superR(x, z) > BOUND - 1.6 || superR(x, z) < 6) return true;
      // never ON a lane — though a bare scrape beside one is exactly where the ground wears through
      if (L.masks.sample(0, x, z) > (kind === 'scrape' ? 0.32 : 0.10)) return true;
      if (L.water.sample(x, z) < 3.0 + rad) return true;                    // nor in the Beck or a pond
      if (nearBuilding(x, z, rad + 2.6)) return true;
      if (L.bridge.corridor(x, z, 3)) return true;
      if (Math.hypot(x - L.paddockCentre.x, z - L.paddockCentre.z) < 5.5) return true;
      // the opening frame is the first thing the kids ever see: the lane up from the spawn stays clear
      if (x > -9 && x < 10 && z > 9 && z < 30 && (kind === 'scrape' || kind === 'log')) return true;
      for (const k of L.keepOut) if (Math.hypot(x - k.x, z - k.z) < k.r + rad) return true;
      for (const p of L.places) if (Math.hypot(x - p.x, z - p.z) < p.r + rad) return true;
      for (const run of [L.paddock, L.picket, ...L.drove, ...L.outfield.fences]) if (nearPolyline(x, z, run) < 1.4 + rad) return true;
      for (const k of L.rocks) if (Math.hypot(x - k.x, z - k.z) < 1.2 + rad) return true;
      for (const o of out) if (Math.hypot(x - o.x, z - o.z) < o.r + rad + 0.6) return true;
      return false;
    };
    let tries = 0;
    for (const kind of bag) {
      // scrapes were 1.9 m discs → shapeless brown amoebas (P03 #3); keep them small and few
      const rad = kind === 'scrape' ? 1.05 : kind === 'log' ? 2.0 : kind === 'stump' || kind === 'bramble' ? 1.1 : 0.8;
      for (let k = 0; k < 140; k++) {
        tries++;
        const x = (sr() - 0.5) * 2 * BOUND, z = (sr() - 0.5) * 2 * BOUND;
        if (clash(x, z, rad, kind)) continue;
        out.push({ kind, x: +x.toFixed(2), z: +z.toFixed(2), r: rad, rot: sr() * TAU, s: 0.7 + sr() * 0.7, seed: (sr() * 9000) | 0 });
        break;
      }
    }
    void tries;
    return out;
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
    ...L.outfield.stiles.map(s => ({ x: s.x, z: s.z, r: 2.0 })),
    // the four places keep the seeded tree fill out of themselves, so a stook never grows an oak through it
    ...L.places.map(p => ({ x: p.x, z: p.z, r: p.r }))];
  // the scatter is laid against everything above, then joins the keep-out list so no tree lands on a molehill
  L.scatter = buildScatter();
  for (const o of L.scatter) L.keepOut.push({ x: o.x, z: o.z, r: o.r + 0.6 });

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
    // chestnut: village landmark (CANON §2) — kept OFF the Puddlewick skyline bearing (az≈-1.17) so the town
    // card is not buried behind its mid/far LOD (P04 #6). Was (21.2,-46.2) on that ray.
    ['chestnut', 29.4, -48.8, 2.3],
  ];
  const r = mulberry(4242);
  L.trees = HAND.map(([kind, x, z, s]) => ({ kind, x, z, s, r: r() * TAU, c: 0.9 + r() * 0.16, tint: (r() - 0.5) * 1.5 }));
  const clearForTree = (x, z, rad) => {
    if (superR(x, z) > BOUND - 1) return false;
    for (const [ox, oz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) if (pathAt(x + ox, z + oz) > 0.12) return false;
    if (waterD(x, z) < 2.4 + rad * 0.6) return false;
    if (nearBuilding(x, z, rad + 1.2)) return false;
    // keep the signposted Puddlewick (and other) wedges free of mid-field trunks
    if (inCorridor(x, z, 0.55)) return false;
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
  while (big < 30 && tries++ < 8000) {
    const x = (r() - 0.5) * 2 * BOUND, z = (r() - 0.5) * 2 * BOUND, s = 0.80 + r() * 0.40;
    if (superR(x, z) < 19) continue;
    // P04 #5: keep the four corner places + their approaches clear of canopy that fills census mid-band
    if (CORNER_YARDS.some(p => Math.hypot(x - p.x, z - p.z) < p.r + 4.5)) continue;
    if (!clearForTree(x, z, 2 * s)) continue;
    if (L.trees.some(t => Math.hypot(t.x - x, t.z - z) < 2.8 * (t.s + s) * 0.8)) continue;
    L.trees.push({ kind: FILL[(r() * FILL.length) | 0], x, z, s, r: r() * TAU, c: 0.86 + r() * 0.22, tint: (r() - 0.5) * 1.5 });
    big++;
  }
  tries = 0;
  let bushes = L.trees.filter(t => t.kind === 'bush').length;
  while (bushes < 18 && tries++ < 4000) {
    const x = (r() - 0.5) * 2 * BOUND, z = (r() - 0.5) * 2 * BOUND, s = 0.65 + r() * 0.55;
    if (superR(x, z) < 12 || !clearForTree(x, z, s)) continue;
    if (CORNER_YARDS.some(p => Math.hypot(x - p.x, z - p.z) < p.r + 3.0)) continue;
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
      // never plant a trunk through a cottage roof (P04 #6)
      if (nearBuilding(x, z, 2.6)) return true;
      // the view corridors: a wedge cut clean through every row past the boundary, on each signposted bearing
      if ((row.view ?? 0) > 0 && inCorridor(x, z, row.view)) return true;
      const mouth = row.mouth ?? 0;
      return mouth > 0 && L.laneNear(x, z) < mouth;
    },
  });
  // belt-and-braces: drop any ring tree that still touches a building pad (jitter can push past the ellipse)
  L.ring.trees = L.ring.trees.filter(t => !nearBuilding(t.x, t.z, 2.2 * (t.s || 1)));
  // HAND fill: drop any non-bush trunk that still sits in a view corridor (they were placed before clearForTree had the rule)
  // and clear canopy out of the four corner yards so census mid-bands are not a green wall (P04 #5)
  L.trees = L.trees.filter(t => {
    if (t.kind === 'bush' || t.kind === 'chestnut') return !nearBuilding(t.x, t.z, 1.6 * (t.s || 1));
    if (nearBuilding(t.x, t.z, 1.8 * (t.s || 1))) return false;
    if (inCorridor(t.x, t.z, 0.5)) return false;
    if (CORNER_YARDS.some(p => Math.hypot(t.x - p.x, t.z - p.z) < p.r + 2.8)) return false;
    return true;
  });
  L.ring.trees = L.ring.trees.filter(t => {
    if (t.kind === 'hedge' || t.kind === 'hedgeb' || t.kind === 'bush' || t.kind === 'bushb') return true;
    return !CORNER_YARDS.some(p => Math.hypot(t.x - p.x, t.z - p.z) < p.r + 3.5);
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
  // the four places: everything solid in them stops the hero, so he can never stand buried inside a bramble,
  // a stump, a drystone wall or a stook the way he could stand inside the hedgerow
  for (const p of L.places) {
    for (const s of p.stumps) C.push({ type: 'circle', x: s.x, z: s.z, r: 0.42 * (s.s ?? 1), tag: 'stump' });
    for (const g of p.logs) {
      const c = Math.cos(g.rot), si = Math.sin(g.rot), h = (g.len ?? 3) / 2;
      C.push({ type: 'capsule', pts: [[g.x - si * h, g.z - c * h], [g.x + si * h, g.z + c * h]], r: (g.rad ?? 0.3) * 1.1, tag: 'log' });
    }
    for (const b of p.brambles) C.push({ type: 'circle', x: b.x, z: b.z, r: 0.66 * (b.s ?? 1), tag: 'bramble' });
    for (const k of p.rocks) C.push({ type: 'circle', x: k.x, z: k.z, r: 0.58 * k.s, tag: 'rock' });
    for (const run of p.walls) C.push({ type: 'capsule', pts: run, r: 0.3, tag: 'wall' });
    for (const g of p.gates) {
      const c = Math.cos(g.rot), si = Math.sin(g.rot), h = (g.w ?? 2.6) / 2;
      for (const e of [-1, 1]) C.push({ type: 'circle', x: g.x + c * e * h, z: g.z - si * e * h, r: 0.2, tag: 'gatepost' });
    }
    for (const s of p.stooks) C.push({ type: 'circle', x: s.x, z: s.z, r: 0.44 * (s.s ?? 1), tag: 'stook' });
    for (const k of p.carts) C.push({ type: 'box', x: k.x, z: k.z, w: 1.9, d: 2.4, rot: k.rot, tag: 'cart' });
  }
  for (const o of L.scatter) {
    if (o.kind === 'rock') C.push({ type: 'circle', x: o.x, z: o.z, r: 0.5 * o.s, tag: 'rock' });
    else if (o.kind === 'stump') C.push({ type: 'circle', x: o.x, z: o.z, r: 0.4 * o.s, tag: 'stump' });
    else if (o.kind === 'bramble') C.push({ type: 'circle', x: o.x, z: o.z, r: 0.62 * o.s, tag: 'bramble' });
    else if (o.kind === 'log') {
      const c = Math.cos(o.rot), si = Math.sin(o.rot), h = 1.3;
      C.push({ type: 'capsule', pts: [[o.x - si * h, o.z - c * h], [o.x + si * h, o.z + c * h]], r: 0.3, tag: 'log' });
    }
  }
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
    // the signposts. A child who stops *beside* a post on the lane — not nose to it — must still be able to read
    // it, so the reach is the width of the lane (3.6) rather than arm's length (2.2).
    { type: 'sign', name: 'signpost', x: L.sign.x, z: L.sign.z, line: 'signpost', reach: 3.6, height: 2.55 },
    { type: 'sign', name: 'the Long Lane signpost', x: L.signLane.x, z: L.signLane.z, line: 'lane-south', reach: 3.6, height: 1.9 },
    { type: 'door', name: 'cottage door', x: door.x, z: door.z, line: 'cottage-door', reach: 2.2, height: 2.7 },
    { type: 'barrel', name: 'rain barrel', x: L.barrels[0].x, z: L.barrels[0].z, line: 'rain-barrel', reach: 1.6, height: 1.55 },
    ...L.sheep.map((s, i) => ({ type: 'sheep', name: 'sheep ' + (i + 1), x: s.x, z: s.z, line: 'sheep', reach: 4.6, height: 1.75, animal: i })),
    ...L.ducks.map((d, i) => ({ type: 'duck', name: 'duck ' + (i + 1), x: PONDS[d.pond].x, z: PONDS[d.pond].z, line: 'duck', reach: 3.4, height: 1.0, animal: i })),
  ];

  // ── exits: the village lane arrives in Puddlewick. The Beck lane east still ends with a kind word (not built
  //    yet). The Long Lane south used to be a to:null speak-and-bounce exit on the same spot as Act I B3
  //    (signpost at 3.6, 31.8) — walking there bounced the child before the beat could arm, so Bobble never
  //    appeared. The signpost prop still speaks `lane-south` on Confirm; B3 owns the walk-up.
  const exitOn = (pts, line, name, extra = {}) => {
    let k = pts.length - 1;
    while (k > 0 && superR(pts[k][0], pts[k][1]) > BOUND - 1.6) k--;
    const kb = Math.max(0, k - 8);
    const back = pts[k] && pts[kb] ? { x: pts[kb][0], z: pts[kb][1] } : null;
    return Object.assign({ x: pts[k][0], z: pts[k][1], w: 4.2, h: 4.2, to: null, line, name, back, kind: 'edge' }, extra);
  };
  L.exits = [
    // Puddlewick's own lane-out lands at (14.5, -25.6) here, and we land on its gate lane at (14.8, 23.4): each
    // landing spot is ~3 units clear of the other map's trigger box, so walking out never walks straight back in.
    exitOn(L.lane, 'lane-sheep', 'the lane into Puddlewick', { to: 'puddlewick', tx: 14.8, tz: 23.4 }),
    exitOn(L.east, 'lane-east', 'the lane to Saltmarrow')];

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
  // CANON §9: `village` is Puddlewick's own theme and nowhere else's. The vale is outside the village, so it plays
  // the travelling theme — and walking up the lane into Puddlewick is then an ARRIVAL you can hear.
  music: 'overworld',
  ambience: 'amb_meadow',
  hours: 9,
  light: { preset: 'day' },
  weather: 'clear',
  encounters: null,
  spawn: { x: 1.4, z: 19.2, facing: Math.PI },
  camera: { orbit: 4, pitch: 22, dist: 10.5, fov: 50, lookUp: 2.7 },
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
    // ── THE SKYLINE ────────────────────────────────────────────────────────────────────────────────────────
    // The painted places stand on their own bearings (LANDMARK_SETS.vale) but the vale asks for three changes.
    // (1) A narrower card. The stock card is a 5.5:1 panorama; the PLACE inside it is painted at its own aspect,
    //     so trimming the country either side keeps the town exactly as big and stops the card spreading 40
    //     degrees of hard-edged slab across the horizon once it is hung big enough to read.
    // (2) More haze, to sit with hill-far rather than in front of it.
    // (3) Never closer than 216 units: hill-mid's outer lip is at 205, and a card inside it cannot be grounded
    //     on it. The Whispering Wood used to stand at exactly 205.
    const VALE_MARKS = LANDMARK_SETS.vale.map(L => Object.assign({}, L, {
      width: Math.round(L.height * 3.6), dist: Math.max(216, L.dist), haze: Math.min(0.44, L.haze + 0.13),
    }));
    const sky = buildSky(scene, rig, { landmarks: VALE_MARKS });
    // The hill rings sag into a PASS on every landmark bearing so the lane can run out of the vale. At full
    // strength the pass took the crest from y 13.8 down to y 2.4 — a hole in the skyline with nothing in it, and
    // the reason every painted place ended up hung in clear blue air. A pass is a dip, not a hole: `gates` at
    // 0.45 leaves a real crest for the town to stand on and still opens the distance over the lane.
    const hillMid = ringHill(scene, 'mid', 118, 150, 205, 5, 21, 71, PAL.hill.midLow, PAL.hill.mid, 0.2, { gates: 0.45 });
    ringHill(scene, 'far', 240, 300, 380, 12, 78, 81, PAL.hill.farLow, PAL.hill.far, 0.25, { fogged: false, peaky: 1.8, gates: 0.3 });

    // ── GROUNDING THE SKYLINE ──────────────────────────────────────────────────────────────────────────────
    // The generic fit in sky.js hangs each card so its FOOT clears whatever stands on the horizon — measured as
    // an angle from the eye, capped by the top of the frame. In this vale that arithmetic collapses: the rim
    // wood reads as an 11-degree wall, the frame only has 7 degrees of sky in it, so every card was clamped to
    // the same footDeg (4.74) and ended up with its bottom edge at world y 17-19, three to five units above the
    // tallest hill it could have stood on. A village hung in clear blue air.
    //
    // This grounds them instead. For each place: put it back on its signposted bearing (the fit's nudge walks it
    // up to 13 degrees off the pass in the hills and the gap in the wood), measure the REAL hill crest along
    // that bearing straight off hill-mid's vertices, and re-hang the card so its own painted horizon line
    // (spec `crest`) sits SINK_DEG under that crest. The hill then cuts across the card's lower edge, which is
    // what makes a painted place stand on the land instead of over it.
    const R2D = 180 / Math.PI, D2R = Math.PI / 180;
    const TOWN_DEG = 2.55;        // how tall the place stands above the point the hill crest cuts across it
    const SINK_DEG = 0.55;        // how far that point is pushed UNDER the real hill crest
    const CAP_DEG = 6.1;          // the highest spire stays well under the top of the frame
    const MAX_W = 124;            // world units: a flat card wider than this starts to read as a wall
    const CANON_AZ = new Map(LANDMARK_SETS.vale.map(m => [m.id, m.az]));
    /**
     * The hill silhouette across a card's own width, in radians of elevation from `eyeY` at the vale centre —
     * and the number returned is the LOWEST point of it, not the highest. A card grounded on the highest point
     * of the crest still shows open sky under itself wherever the ridge dips, which is the whole complaint.
     */
    const crestRad = (mesh, az, half, minR, eyeY) => {
      const p = mesh && mesh.geometry && mesh.geometry.attributes.position;
      if (!p) return 0;
      const N = 9, band = half / N + 0.02;
      let lowest = 9;
      for (let k = 0; k < N; k++) {
        const a = az + (k / (N - 1) - 0.5) * 2 * half;
        let best = -9;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, z);
          if (rr < minR) continue;
          if (Math.abs(angDiff(Math.atan2(z, x), a)) > band) continue;
          const e = Math.atan2(y - eyeY, rr);
          if (e > best) best = e;
        }
        if (best > -9 && best < lowest) lowest = best;
      }
      return lowest < 9 ? lowest : 0;
    };
    const lmState = [];
    let lastFit;
    function groundLandmarks(camera) {
      const M = sky && sky.landmarks;
      if (!M || !M.list || !M.list.length) return;
      const eyeY = camera ? Math.max(1.6, Math.min(9, camera.position.y)) : 3.05;
      lmState.length = 0;
      for (const m of M.list) {
        const az = CANON_AZ.has(m.id) ? CANON_AZ.get(m.id) : m.az;
        m.az = az;
        const D = m.dist;
        const crest = crestRad(hillMid, az, 0.15, 140, eyeY);
        // WHERE ON THE CARD the hill crest must cut across it. The spec's own `crest` is the painted ridge line,
        // but the bottom 36 percent of every card is alpha-ramped away to nothing (buildSky), so aligning the
        // ramped part with the hill leaves the painted ground transparent right where it meets the land — and a
        // mill standing on that ridge hangs in the air with its foot dissolved. Align at 0.44 instead: the hill
        // then cuts across paint that is fully opaque, and everything below it is behind real ground.
        const cf = Math.max(m.crest ?? 0.24, 0.54), pt = m.paintTop ?? 0.25;
        const townFrac = Math.max(0.14, 1 - pt - cf);
        let hW = Math.max(6, (D * Math.tan(TOWN_DEG * D2R)) / townFrac);
        hW = Math.min(hW, MAX_W / Math.max(1e-3, m.aspect));
        const capY = eyeY + D * Math.tan(CAP_DEG * D2R);
        const Ycrest = eyeY + D * Math.tan(crest);
        const target = Ycrest - D * Math.tan(SINK_DEG * D2R);        // where the card's painted horizon must land
        let footY = target - cf * hW;
        if (footY + (1 - pt) * hW > capY) {                          // too tall for the sky band: shrink, keep the foot
          hW = Math.max(6, (capY - target) / Math.max(0.05, 1 - pt - cf));
          footY = target - cf * hW;
        }
        const wW = hW * m.aspect;
        try {
          const old = m.mesh.geometry;
          m.mesh.geometry = new THREE.PlaneGeometry(wW, hW);
          if (old && old.dispose) old.dispose();
        } catch (e) { void e; }
        const cy = footY + hW / 2;
        m.mesh.position.set(Math.cos(az) * D, cy, Math.sin(az) * D);
        m.mesh.lookAt(0, cy, 0);
        m.mesh.updateMatrixWorld();
        m.size = [+wW.toFixed(1), +hW.toFixed(1)];
        m.y0 = +footY.toFixed(2);
        m.footDeg = +(Math.atan2(footY, D) * R2D).toFixed(2);
        m.topDeg = +(Math.atan2(footY + (1 - pt) * hW, D) * R2D).toFixed(2);
        m.skylineDeg = +(crest * R2D).toFixed(2);
        m.orbit = Math.round(((Math.atan2(-Math.cos(az), -Math.sin(az)) * R2D + 360) % 360) * 10) / 10;
        lmState.push({ id: m.id, bearing: +(az * R2D).toFixed(1), dist: D, eyeY: +eyeY.toFixed(2),
          hillCrestDeg: +(crest * R2D).toFixed(2), hillCrestY: +Ycrest.toFixed(2),
          paintedHorizonY: +(footY + cf * hW).toFixed(2), footY: +footY.toFixed(2),
          topY: +(footY + (1 - pt) * hW).toFixed(2), size: m.size,
          // the one number that says GROUNDED: how far the card's painted horizon sits below the hill crest
          sunkBelowCrest: +(Ycrest - (footY + cf * hW)).toFixed(2) });
        try { if (m.mesh.material.uniforms && m.mesh.material.uniforms.uHaze) m.mesh.material.uniforms.uHaze.value = Math.min(0.46, (m.mesh.material.uniforms.uHaze.value || 0.3) + 0.0); } catch (e) { void e; }
      }
    }

    // the contact pools lean away from THIS map's sun, so the shade under every prop agrees with the cast shadows
    kit.setSun(rig.dir);

    // ── buildings ──
    // The building recipes (P05) paint their AO into the mask but register no contact pool, so a cottage met the
    // grass with a hard bright seam exactly the way the crates did. The vale gives its own houses one: a pool a
    // third wider than the footprint, which is the band of shade a thatched wall throws at its own feet.
    const cot = kit.cottage(L.cottage);
    const chimneys = [cot.chimneyTop];
    for (const o of L.village) { const b = kit.cottage(o); chimneys.push(b.chimneyTop); }
    for (const o of [L.cottage, ...L.village]) {
      kit.contact(o.x, o.z, 0, 0.95, { rx: o.W * 0.5, rz: o.D * 0.5, rot: o.rot, spread: 1.32, lift: 0.06 });
    }
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
    // ── THE FOUR PLACES: a fallen oak in the north wood, a drystone fold on the west rise, a cut hayfield at
    //    the south lane mouth, a boulder field over the water meadow. Each one brings a hue the green does not.
    for (const p of L.places) {
      for (const s of p.stumps) kit.stump(s.x, s.z, s.rot, { s: s.s ?? 1, seed: s.seed ?? 3 });
      for (const g of p.logs) kit.fallenLog(g.x, g.z, g.rot, { len: g.len ?? 3.2, rad: g.rad ?? 0.3, seed: g.seed ?? 7 });
      for (const run of p.walls) kit.drystoneWall(run, { seed: 17 + run.length });
      for (const g of p.gates) kit.fieldGate(g.x, g.z, g.rot, { w: g.w ?? 2.6 });
      for (const k of p.rocks) kit.rock(k.x, k.z, k.s, k.seed);
      for (const b of p.brambles) kit.brambles(b.x, b.z, { s: b.s ?? 1, seed: b.seed ?? 11 });
      for (const s of p.stooks) kit.stook(s.x, s.z, s.rot, { s: s.s ?? 1, seed: s.seed ?? 5 });
      for (const k of p.carts) kit.handcart(k.x, k.z, k.rot);
      for (const m of p.shrooms) kit.mushrooms(m.x, m.z, m.n ?? 4, m.seed ?? 9, m.spread ?? 0.6);
    }
    // ── THE SCATTER: the small ground furniture, everywhere. This is what stops a corner frame being 93 percent
    //    one green: bare earth (molehills), rust (bracken), stone (half-buried rocks), red (toadstools). ──
    for (const o of L.scatter) {
      if (o.kind === 'scrape') kit.scrape(o.x, o.z, o.r * 1.05, o.r * 0.9, o.rot, o.seed);
      else if (o.kind === 'mole') kit.molehill(o.x, o.z, { s: 0.7 + o.s * 0.3, seed: o.seed });
      else if (o.kind === 'bracken') kit.bracken(o.x, o.z, { s: 0.85 + o.s * 0.45, seed: o.seed });
      else if (o.kind === 'rock') kit.rock(o.x, o.z, 0.55 + o.s * 0.7, o.seed, { sink: 0.4 });
      else if (o.kind === 'shrooms') kit.mushrooms(o.x, o.z, 3 + (o.seed % 4), o.seed, 0.55 + o.s * 0.4);
      else if (o.kind === 'bramble') kit.brambles(o.x, o.z, { s: 0.8 + o.s * 0.5, seed: o.seed });
      else if (o.kind === 'stump') kit.stump(o.x, o.z, o.rot, { s: 0.7 + o.s * 0.4, seed: o.seed });
      else if (o.kind === 'log') kit.fallenLog(o.x, o.z, o.rot, { len: 2.0 + o.s * 1.4, rad: 0.2 + o.s * 0.12, seed: o.seed });
    }
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
    // Tufts, and STRAW ones through them: broad patches of summer-dry grass (a smooth noise field, strongest on
    // the high dry ground and nothing at all near the water) so the meadow is two greens and an ochre, not one
    // green. Count up by half again — the corner frames had about five tufts in the whole lower half.
    const dryAt = (x, z) => {
      const wet = smooth(3.0, 9.0, L.water.sample(x, z));
      const n = vnoise(x * 0.055 + 31.7, z * 0.055 + 12.3, 77);
      // more straw patches (P04 #5): dry hue sits outside the green census band
      return smooth(0.32, 0.70, n) * wet * (0.50 + 0.50 * smooth(-0.4, 1.6, heightRaw(x, z)));
    };
    kit.tufts({ count: low ? 1000 : 1900, boost: (x, z) => 0.08 * (1 - smooth(6, 16, Math.hypot(x - 1.5, z - 16))), radius: 40, seed: 999, accept: onMeadow, dry: dryAt, rimOf: (x, z) => { const p = pathAt(x, z); return smooth(0.08, 0.3, p) * (1 - smooth(0.3, 0.42, p)) + smooth(3.2, 2.4, L.water.sample(x, z)) * 0.6; } });
    const hues = [PAL.flower.white, PAL.flower.yellow, PAL.flower.pink, PAL.flower.white, PAL.flower.blue, PAL.flower.yellow];
    const fr = mulberry(5150), clusters = [
      { x: 4.8, z: 12.6, hue: PAL.flower.yellow, n: 16 }, { x: -2.6, z: 13.5, hue: PAL.flower.white, n: 18 }, { x: 3.8, z: 20.5, hue: PAL.flower.pink, n: 14 },
      { x: -3.2, z: 6.4, hue: PAL.flower.blue, n: 12 }, { x: 5.6, z: 3.8, hue: PAL.flower.white, n: 16 }, { x: -6.0, z: 8.8, hue: PAL.flower.pink, n: 14 },
      { x: 7.6, z: -7.4, hue: PAL.flower.yellow, n: 16 }, { x: -8.8, z: -7.6, hue: PAL.flower.white, n: 14 }, { x: 1.4, z: -16.0, hue: PAL.flower.pink, n: 12 },
      { x: -4.4, z: 22.5, hue: PAL.flower.white, n: 20 }, { x: 6.8, z: 24.0, hue: PAL.flower.yellow, n: 18 }, { x: -1.8, z: 27.0, hue: PAL.flower.pink, n: 14 }, { x: 8.2, z: 17.0, hue: PAL.flower.blue, n: 12 },
      { x: -20.2, z: -22.6, hue: PAL.flower.white, n: 14 }, { x: -17.8, z: 23.6, hue: PAL.flower.yellow, n: 12 },
      { x: 18.5, z: 24.5, hue: PAL.flower.pink, n: 14 }, { x: 24.0, z: -10.0, hue: PAL.flower.blue, n: 12 },
    ];
    for (let i = 0; i < 55; i++) clusters.push({ x: (fr() - 0.5) * 64, z: (fr() - 0.5) * 64, hue: hues[(fr() * hues.length) | 0],
      n: 6 + (fr() * 14 | 0), spread: 0.7 + fr() * 1.9 });
    kit.flowers(clusters, { accept: (x, z) => onMeadow(x, z) && pathAt(x, z) < 0.2 });

    // ── the ground last: it samples the finished AO mask ──
    buildGround(scene, { heightAt, masks: L.masks, ao, shade, inner: 37, step: 1.0, outer: 132, rings: 8 });   // the fine grid ends under the woodland's first row

    // ── the sky's small stories: birds over the vale, and Highfeather, faint, for anyone who looks up ──
    kit.birds(4, { centre: [4, -2], height: 11, radius: 16, seed: 91 });
    // Highfeather, up among the clouds where a castle in the sky belongs. At elevation 0.12 it stood a couple of
    // degrees over the horizon and read as a solid white tower parked on the far hills — one more thing floating.
    kit.skyCastle({ azimuth: -1.12, elevation: 0.33, distance: 720, size: 112, opacity: 0.5, tintFrom: sky.clouds.material });

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
        // the skyline fit in sky.js runs itself a few frames after the map builds, and a critic may re-run it:
        // every time it does, put the painted places back down on the hills (see GROUNDING THE SKYLINE above)
        if (sky.landmarks && sky.landmarks.fitted !== lastFit) { lastFit = sky.landmarks.fitted; groundLandmarks(cam); }
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
      state() {
        return { buildMs, counts: Object.assign({}, kit.counts), grove: kit.groveState(),
          bridge: { x: +L.bridge.cx.toFixed(2), z: +L.bridge.cz.toFixed(2) }, sign: L.sign,
          see: Object.assign({}, kit.seeState),
          // every painted place on the skyline, with the number that says it is standing on the land:
          // sunkBelowCrest > 0 means the ring-hill crest cuts across the card's own painted horizon
          landmarks: lmState.map(o => Object.assign({}, o)),
          places: L.places.map(p => ({ id: p.id, x: p.x, z: p.z })) };
      },
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
