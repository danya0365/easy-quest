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
 * The map is DATA first (layout(): paths, water, buildings, trees, colliders, interactables, exits — computed once,
 * deterministically) and ART second (view(): meshes built from that layout with the scenery kit, F3 materials only).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, lerp, smooth } from '../../art/palette.js';
import { Tex, mulberry, vnoise } from '../../art/tex.js';
import { makeAOMask } from '../../art/toon.js';
import { createKit, buildSky, ringHill, buildGround, paintMasks, distanceGrid, curvePoints, bridgeFrame, prep,
  OAK, POPLAR, BUSH, CHESTNUT } from '../scenery.js';

// ── the words (VOICE-BIBLE: three lines, 34 characters, the joke on the strong word) ─────────────────────────
const SIGN_TEXT = [
  '{gold}Puddlewick{/gold} — over the bridge,\nround the bend. Wipe your boots.',
  '{gold}Saltmarrow{/gold} — along the Beck,\na morning\'s walk. A whole day,\nif you stop for every frog.',
  'Somebody has carved a very small\ndragon into the post.\nIt is smiling.',
];
const DOOR_TEXT = 'Somebody inside is singing to\na kettle. The kettle is winning.';
const BARREL_TEXT = 'Barrel of rainwater. And one boot.\nJust the one.';
const SHEEP_TEXT = 'Baa.\n(She has had a very long morning.)';
const DUCK_TEXT = 'Quack.\n(This is his pond. You may look.)';
const LANE_SHEEP_TEXT = ['The lane is full of sheep.\nThey are not in a hurry.', 'Nobody in Puddlewick has ever\nhurried a sheep. Not twice.'];
const EAST_TEXT = ['The lane follows the Beck\nall the way down to the sea.', 'That is a grown-up sort of walk.\nPapa would want to come.'];
const SOUTH_TEXT = ['The Long Lane goes on for ever.', 'Best not start on for ever\nwithout telling somebody.'];

// ── shape constants ────────────────────────────────────────────────────────────────────────────────────────
const HALF = 40, MASK_SPAN = 96;
const BOUND = 33.5;                         // playable superellipse radius
const WATER_Y = -0.4, BED = -1.0, VALLEY = -0.08;
const HW = 1.35, BANK = 0.75;               // the Beck: water half-width, bank
const TAU = Math.PI * 2;

const LANE = [[6.5, 44], [3.2, 35], [4.4, 27.5], [2.6, 21.5], [0.2, 16.5], [0.9, 11.5], [0.2, 5.5], [-1.4, 0], [-2.8, -5], [-3.3, -9], [-3.0, -13], [-1.2, -17.5],
  [3.5, -20.5], [9.5, -22.5], [14.5, -26], [17.2, -32], [18.2, -39], [18.8, -48]];
const EAST = [[0.5, 9.2], [4.5, 8.0], [10.5, 8.4], [17.5, 6.4], [25, 3.0], [33, 1.0], [44, 0.2]];
const SPUR = [[-1.6, 1.8], [-4.6, 1.4], [-7.6, 0.6], [-9.6, 0.3]];
const BECK = [[-24.5, -8.8], [-19.5, -10.6], [-13, -12.0], [-7.5, -11.6], [-3.2, -11.0], [2.0, -12.2], [7.5, -14.2], [13, -15.6], [18.5, -16.2], [22.5, -18.2]];
const PONDS = [{ x: -28.4, z: -7.6, r: 3.6, sx: 1.3, sz: 1.0 }, { x: 26.2, z: -20.8, r: 3.8, sx: 1.15, sz: 1.0 }];

const bump = (x, z, cx, cz, r) => Math.exp(-((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r));
const superR = (x, z) => Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(z), 4), 0.25);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const gauss = (d, w) => Math.exp(-(d * d) / (w * w));
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
  L.laundry = [[-16.3, -4.9], [-11.4, -6.3]];
  L.bench = { x: -9.2, z: 3.9, rot: Math.PI / 2 + 0.05 };
  L.barrels = [{ x: -10.0, z: -2.5, s: 1 }, { x: -9.4, z: -3.3, s: 0.85 }];
  L.crates = [{ x: -15.6, z: 3.3, r: 0.4 }];
  L.woodpile = { x: -15.9, z: -0.6, rot: Math.PI / 2 };
  L.beds = [{ x: -8.8, z: 5.2, w: 2.4, d: 1.3, rot: 0.02 }];
  L.rocks = [
    [-6.4, -8.9, 0.8, 1], [0.8, -9.3, 0.62, 2], [7.4, -11.6, 1.1, 3], [-14.6, -9.1, 0.9, 4], [5.8, 14.2, 0.9, 5], [-4.8, 19.6, 1.35, 6],
    [-3.6, 20.9, 0.55, 7], [12.8, 12.2, 1.55, 8], [20.8, -8.2, 1.0, 9], [-20.8, -5.4, 0.7, 10], [23.5, -15.5, 0.85, 11], [-24.5, -12.0, 1.0, 12],
    [15.5, -19.0, 0.7, 13], [-5.4, -15.9, 0.6, 14], [28, 12, 1.2, 15], [-30, 24, 1.3, 16], [9.5, 26.5, 1.0, 17], [-12.5, 22.5, 0.8, 18],
  ].map(([x, z, s, seed]) => ({ x, z, s, seed }));

  // ── trees: the hand-placed ones that compose the view, then a seeded meadow fill ──
  L.trees = { oak: [], poplar: [], bush: [], chestnut: [] };
  const hand = {
    oak: [[-19.4, -2.0, 1.25], [-20.5, -15.5, 1.3], [-9.2, -17.2, 1.1], [6.2, -18.8, 1.0], [8.8, -30.2, 1.35], [5.2, -34.8, 1.2], [16.2, 15.0, 1.3], [22.5, 19.5, 1.1],
      [19.5, 24.5, 1.2], [-26.5, 24.5, 1.15], [-12.2, 27.0, 1.0], [11.0, 30.5, 1.1], [-9.0, 33.0, 1.2], [-31, -1.5, 1.2], [30.5, -9.5, 1.15], [-24.5, -20.5, 1.1]],
    poplar: [[-8.4, -6.2, 1.0], [14.8, -11.6, 1.1], [12.4, -34.0, 1.2], [27.2, 9.8, 1.15], [-18.2, 4.2, 0.95], [21.6, -26.0, 1.1]],
    bush: [[11.8, -27.6, 0.9], [6.8, -26.9, 0.85], [-6.9, -4.2, 0.8], [-15.4, 3.8, 0.7], [20.8, -10.4, 0.9], [-4.5, -13.8, 0.7], [0.6, -14.6, 0.65],
      [4.6, 12.6, 0.75], [-17.4, 7.6, 0.8], [15.8, 9.6, 0.9], [9.0, -9.8, 0.8], [-21.5, -11.2, 0.85], [-1.6, 24.0, 0.7]],
  };
  const r = mulberry(4242);
  for (const [name, list] of Object.entries(hand)) for (const [x, z, s] of list) L.trees[name].push({ x, z, s, r: r() * TAU, c: 0.9 + r() * 0.16 });
  L.trees.chestnut.push({ x: 21.2, z: -46.2, s: 2.3, r: 0.4, c: 1.02 });
  const all = () => [...L.trees.oak, ...L.trees.poplar, ...L.trees.chestnut];
  const clearForTree = (x, z, rad) => {
    if (superR(x, z) > BOUND - 1) return false;
    for (const [ox, oz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) if (pathAt(x + ox, z + oz) > 0.12) return false;
    if (waterD(x, z) < 2.4 + rad * 0.6) return false;
    if (nearBuilding(x, z, rad + 1.2)) return false;
    if (x > -7 && x < 9 && z > 12) return false;                          // the opening view down the lane stays open
    if (Math.hypot(x - L.sign.x, z - L.sign.z) < 3.5) return false;
    if (Math.hypot(x - L.paddockCentre.x, z - L.paddockCentre.z) < 7.5) return false;
    if (L.bridge.corridor(x, z, 3)) return false;
    return true;
  };
  let tries = 0;
  while (all().length < 38 && tries++ < 6000) {
    const x = (r() - 0.5) * 2 * BOUND, z = (r() - 0.5) * 2 * BOUND, s = 0.85 + r() * 0.45;
    if (superR(x, z) < 19) continue;
    if (!clearForTree(x, z, 2 * s)) continue;
    if (all().some(t => Math.hypot(t.x - x, t.z - z) < 2.6 * (t.s + s) * 0.8)) continue;
    (r() < 0.28 ? L.trees.poplar : L.trees.oak).push({ x, z, s, r: r() * TAU, c: 0.86 + r() * 0.22 });
  }
  tries = 0;
  while (L.trees.bush.length < 24 && tries++ < 4000) {
    const x = (r() - 0.5) * 2 * BOUND, z = (r() - 0.5) * 2 * BOUND, s = 0.65 + r() * 0.55;
    if (superR(x, z) < 12 || !clearForTree(x, z, s)) continue;
    if ([...all(), ...L.trees.bush].some(t => Math.hypot(t.x - x, t.z - z) < 1.8 * (t.s + s))) continue;
    L.trees.bush.push({ x, z, s, r: r() * TAU, c: 0.9 + r() * 0.2 });
  }

  // ── colliders ──
  const C = [];
  C.push({ type: 'box', x: L.cottage.x, z: L.cottage.z, w: L.cottage.W + 0.35, d: L.cottage.D + 0.35, rot: L.cottage.rot, tag: 'cottage' });
  for (const t of L.trees.oak) C.push({ type: 'circle', x: t.x, z: t.z, r: 0.34 * t.s, tag: 'tree' });
  for (const t of L.trees.poplar) C.push({ type: 'circle', x: t.x, z: t.z, r: 0.3 * t.s, tag: 'tree' });
  for (const t of L.trees.bush) C.push({ type: 'circle', x: t.x, z: t.z, r: 0.62 * t.s, tag: 'bush' });
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
  L.colliders = C;
  // what the follow camera must not hide behind: canopies (trees scale their blob layout) and the cottage roofs
  L.occluders = [
    ...L.trees.oak.map(t => ({ type: 'sphere', x: t.x, y: heightRaw(t.x, t.z) + 2.85 * t.s, z: t.z, r: 1.75 * t.s })),
    ...L.trees.poplar.map(t => ({ type: 'sphere', x: t.x, y: heightRaw(t.x, t.z) + 3.0 * t.s, z: t.z, r: 1.35 * t.s })),
    ...L.trees.chestnut.map(t => ({ type: 'sphere', x: t.x, y: heightRaw(t.x, t.z) + 3.4 * t.s, z: t.z, r: 2.1 * t.s })),
    ...[L.cottage, ...L.village].map(o => ({ type: 'sphere', x: o.x, y: heightRaw(o.x, o.z) + 2.2, z: o.z, r: Math.max(o.W, o.D) * 0.62 })),
  ];

  // ── animals ──
  L.sheep = [{ x: -24.5, z: 10.8, yaw: 0.8 }, { x: -21.5, z: 14.4, yaw: -2.2 }, { x: -25.8, z: 15.2, yaw: 2.6 }];
  L.laneSheep = [{ x: 17.6, z: -37.4, yaw: 2.9 }, { x: 19.6, z: -38.6, yaw: -2.5 }, { x: 18.2, z: -40.4, yaw: 0.4 }, { x: 16.4, z: -39.6, yaw: 1.4 }];
  L.ducks = [{ pond: 0, rad: 1.9, ph: 0 }, { pond: 0, rad: 1.4, ph: 2.4 }, { pond: 1, rad: 2.1, ph: 1.1 }];

  // ── interactables ──
  const door = (() => { const o = L.cottage, c = Math.cos(o.rot), s = Math.sin(o.rot), lx = o.doorX, lz = o.D / 2 + 0.2; return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c }; })();
  L.props = [
    { type: 'sign', name: 'signpost', x: L.sign.x, z: L.sign.z, text: SIGN_TEXT, reach: 2.2, height: 2.55 },
    { type: 'door', name: 'cottage door', x: door.x, z: door.z, text: DOOR_TEXT, reach: 2.2, height: 2.7 },
    { type: 'barrel', name: 'rain barrel', x: L.barrels[0].x, z: L.barrels[0].z, text: BARREL_TEXT, reach: 1.6, height: 1.55 },
    ...L.sheep.map((s, i) => ({ type: 'sheep', name: 'sheep ' + (i + 1), x: s.x, z: s.z, text: SHEEP_TEXT, reach: 4.6, height: 1.75, animal: i })),
    ...L.ducks.map((d, i) => ({ type: 'duck', name: 'duck ' + (i + 1), x: PONDS[d.pond].x, z: PONDS[d.pond].z, text: DUCK_TEXT, reach: 3.4, height: 1.0, animal: i })),
  ];

  // ── exits: the lanes run on to places that are not built yet; each ends with somebody (or some sheep) saying so ──
  const exitOn = (pts, text, name) => {
    let k = pts.length - 1;
    while (k > 0 && superR(pts[k][0], pts[k][1]) > BOUND - 1.6) k--;
    const kb = Math.max(0, k - 8);
    const back = pts[k] && pts[kb] ? { x: pts[kb][0], z: pts[kb][1] } : null;
    return { x: pts[k][0], z: pts[k][1], w: 4.2, h: 4.2, to: null, text, name, back, kind: 'edge' };
  };
  L.exits = [exitOn(L.lane, LANE_SHEEP_TEXT, 'the lane into Puddlewick'), exitOn(L.east, EAST_TEXT, 'the lane to Saltmarrow'),
    exitOn([...L.lane].reverse(), SOUTH_TEXT, 'the Long Lane')];

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

function sheepGeometry() {
  const wool = [];
  const W = PAL.animal.wool;
  wool.push(coloured(new THREE.IcosahedronGeometry(0.42, 2), W, MX(0, 0.62, 0, 0.95, 0.8, 1.2)));
  for (const [x, y, z, r] of [[0.21, 0.8, 0.12, 0.22], [-0.21, 0.8, 0.1, 0.22], [0, 0.92, -0.14, 0.25],
    [0, 0.64, -0.44, 0.23], [0.25, 0.58, -0.12, 0.23], [-0.25, 0.58, -0.12, 0.23], [0, 0.72, 0.36, 0.2], [0, 0.73, -0.64, 0.09]]) {
    wool.push(coloured(new THREE.IcosahedronGeometry(r, 1), W, MX(x, y, z)));
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
    coloured(new THREE.SphereGeometry(0.17, 12, 9), PAL.animal.face, MX(0, -0.03, 0.14, 0.82, 0.95, 1.15)),
    coloured(new THREE.IcosahedronGeometry(0.13, 1), W, MX(0, 0.12, 0.06, 1.1, 0.8, 1)),
    coloured(new THREE.SphereGeometry(0.07, 8, 5), PAL.animal.ear, MX(0.18, 0.04, 0.06, 1.45, 0.45, 0.8, 0, 0, -0.35)),
    coloured(new THREE.SphereGeometry(0.07, 8, 5), PAL.animal.ear, MX(-0.18, 0.04, 0.06, 1.45, 0.45, 0.8, 0, 0, 0.35)),
    coloured(new THREE.SphereGeometry(0.036, 7, 5), PAL.char.white, MX(0.085, 0.03, 0.265)),
    coloured(new THREE.SphereGeometry(0.036, 7, 5), PAL.char.white, MX(-0.085, 0.03, 0.265)),
    coloured(new THREE.SphereGeometry(0.021, 6, 4), PAL.char.eye, MX(0.083, 0.03, 0.296)),
    coloured(new THREE.SphereGeometry(0.021, 6, 4), PAL.char.eye, MX(-0.083, 0.03, 0.296)),
  ]);
  return { body: bodyAll, head, headAt: [0, 0.74, 0.46] };
}

function duckGeometry() {
  const D = PAL.animal.duck;
  const body = mergeGeometries([
    coloured(new THREE.SphereGeometry(0.22, 12, 8), D, MX(0, 0.1, 0, 0.9, 0.68, 1.3)),
    coloured(new THREE.ConeGeometry(0.09, 0.2, 10), D, MX(0, 0.2, -0.29, 1, 1, 1, -0.9)),
    coloured(new THREE.SphereGeometry(0.1, 10, 8), D, MX(0.15, 0.15, -0.02, 0.5, 0.6, 1.3)),
    coloured(new THREE.SphereGeometry(0.1, 10, 8), D, MX(-0.15, 0.15, -0.02, 0.5, 0.6, 1.3)),
  ]);
  const head = mergeGeometries([
    coloured(new THREE.CylinderGeometry(0.055, 0.07, 0.16, 7), D, MX(0, -0.06, -0.02)),
    coloured(new THREE.SphereGeometry(0.11, 10, 7), D, MX(0, 0.06, 0.02)),
    coloured(new THREE.SphereGeometry(0.055, 10, 8), PAL.animal.beak, MX(0, 0.03, 0.14, 1.1, 0.45, 1.5)),
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
    const kit = createKit({ scene, heightAt, ao });
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
    // ── the paddock ──
    kit.fence(L.paddock, { seed: 11 });
    kit.fence([[14.6, -35.6], [16.0, -43.5]], { seed: 12 });
    kit.fence([[21.6, -36.2], [23.4, -44.2]], { seed: 13 });
    // ── the signpost at the fork ──
    const atlas = kit.useSignAtlas(kit.signAtlas(['Puddlewick', 'Saltmarrow']));
    kit.signpost(atlas, L.sign.x, L.sign.z, [
      { label: 'Puddlewick', dir: -1.95 },
      { label: 'Saltmarrow', dir: 1.62 },
    ]);
    // ── the Beck: footbridge, rocks, reeds, lily pads ──
    kit.footbridge(L.bridge);
    for (const k of L.rocks) kit.rock(k.x, k.z, k.s, k.seed);
    kit.reeds(PONDS[0].x + 3.6, PONDS[0].z + 2.6, 11, 21, 0.9);
    kit.reeds(PONDS[0].x - 3.9, PONDS[0].z - 2.2, 8, 22, 0.8);
    kit.reeds(PONDS[1].x - 3.2, PONDS[1].z + 3.1, 10, 23, 0.9);
    kit.reeds(-10.4, -9.4, 6, 24, 0.6);
    kit.reeds(11.2, -13.0, 7, 25, 0.6);
    kit.lilyPads(PONDS[0].x - 1.0, PONDS[0].z + 0.4, WATER_Y, 6, 31, 2.2);
    kit.lilyPads(PONDS[1].x + 0.6, PONDS[1].z - 0.8, WATER_Y, 5, 32, 2.0);

    // ── trees ──
    kit.forest('chestnut', CHESTNUT, L.trees.chestnut, { detail: 2, spherize: 0.72, trunkH: 2.2, aoR: 2.4 });
    kit.forest('oak', OAK, L.trees.oak, { detail: 1, spherize: 0.72, trunkH: 1.7, outline: !low });
    kit.forest('poplar', POPLAR, L.trees.poplar, { detail: 1, spherize: 0.6, trunkH: 1.3, light: PAL.foliage.light, outline: !low });
    kit.forest('bush', BUSH, L.trees.bush, { detail: 1, spherize: 0.6, trunkH: 0, light: PAL.foliage.light, wind: 0.02, windBase: 0.2, shadows: false, aoR: 1.1, aoS: 0.55, outline: !low });
    kit.forestBelt({ radius: 46, rows: 3, rowGap: 6.5, seed: 777, threshold: 0.4, step: 0.075,
      skip: (x, z) => { const a = Math.atan2(z, x); return Math.abs(angDiff(a, ANG_VILLAGE)) < 0.34 || Math.abs(angDiff(a, ANG_SOUTH)) < 0.16 || Math.abs(angDiff(a, ANG_EAST)) < 0.14; } });

    kit.flush();

    // ── water (after the buckets: transparent-free, but drawn over the carved banks) ──
    kit.water({ stream: L.beck, width: 2 * (HW + 0.45), ponds: PONDS.map(p => ({ x: p.x, z: p.z, r: p.r + 0.35, sx: p.sx, sz: p.sz })), y: WATER_Y });

    // ── tufts + flowers (footprints and AO are complete now) ──
    const pathAt = (x, z) => L.masks.sample(0, x, z);
    const onMeadow = (x, z) => superR(x, z) < 40 && pathAt(x, z) < 0.3 && L.water.sample(x, z) > 2.3 && !L.bridge.corridor(x, z, 1);
    kit.tufts({ count: low ? 700 : 1300, boost: (x, z) => 0.08 * (1 - smooth(6, 16, Math.hypot(x - 1.5, z - 16))), radius: 40, seed: 999, accept: onMeadow, rimOf: (x, z) => { const p = pathAt(x, z); return smooth(0.08, 0.3, p) * (1 - smooth(0.3, 0.42, p)) + smooth(3.2, 2.4, L.water.sample(x, z)) * 0.6; } });
    const hues = [PAL.flower.white, PAL.flower.yellow, PAL.flower.pink, PAL.flower.white, PAL.flower.blue, PAL.flower.yellow];
    const fr = mulberry(5150), clusters = [
      { x: 4.8, z: 12.6, hue: PAL.flower.yellow, n: 16 }, { x: -2.6, z: 13.5, hue: PAL.flower.white, n: 18 }, { x: 3.8, z: 20.5, hue: PAL.flower.pink, n: 14 },
      { x: -3.2, z: 6.4, hue: PAL.flower.blue, n: 12 }, { x: 5.6, z: 3.8, hue: PAL.flower.white, n: 16 }, { x: -6.0, z: 8.8, hue: PAL.flower.pink, n: 14 },
      { x: 7.6, z: -7.4, hue: PAL.flower.yellow, n: 16 }, { x: -8.8, z: -7.6, hue: PAL.flower.white, n: 14 }, { x: 1.4, z: -16.0, hue: PAL.flower.pink, n: 12 },
      { x: -4.4, z: 22.5, hue: PAL.flower.white, n: 20 }, { x: 6.8, z: 24.0, hue: PAL.flower.yellow, n: 18 }, { x: -1.8, z: 27.0, hue: PAL.flower.pink, n: 14 }, { x: 8.2, z: 17.0, hue: PAL.flower.blue, n: 12 },
    ];
    for (let i = 0; i < 34; i++) clusters.push({ x: (fr() - 0.5) * 64, z: (fr() - 0.5) * 64, hue: hues[(fr() * hues.length) | 0] });
    kit.flowers(clusters, { accept: (x, z) => onMeadow(x, z) && pathAt(x, z) < 0.2 });

    // ── the ground last: it samples the finished AO mask ──
    buildGround(scene, { heightAt, masks: L.masks, ao, inner: 40, step: 1.0, outer: 132, rings: 9 });

    // ── the sky's small stories: birds over the vale, and Highfeather, faint, for anyone who looks up ──
    kit.birds(4, { centre: [4, -2], height: 11, radius: 16, seed: 91 });
    kit.skyCastle({ azimuth: -1.12, elevation: 0.1, distance: 720, size: 120, opacity: 0.2 });

    // ── life: smoke, butterflies, sheep, ducks ──
    kit.smoke(chimneys.filter(Boolean));
    kit.butterflies([{ x: 4.2, z: 13.2, hue: PAL.flower.yellow }, { x: -2.2, z: 14.4, hue: PAL.char.white }, { x: 5.2, z: 4.4, hue: PAL.flower.pink },
      { x: -7.2, z: 5.8, hue: PAL.flower.yellow }, { x: 7.2, z: -6.8, hue: PAL.char.white }]);
    const sg = sheepGeometry(), dg = duckGeometry();
    const flock = [...L.sheep.map(s => Object.assign({ pen: true }, s)), ...L.laneSheep.map(s => Object.assign({ pen: false }, s))];
    const sheep = kit.critters({ name: 'sheep', body: sg.body, head: sg.head, headAt: sg.headAt, count: flock.length, outline: 0.022, headOutline: false });
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
        kit.update(t, dt, cam);
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
          if (propsByAnimal.duck[i]) { propsByAnimal.duck[i].x = x; propsByAnimal.duck[i].z = z; }
        });
        ducks.commit();
        void tmp;
      },
      state() { return { buildMs, counts: Object.assign({}, kit.counts), bridge: { x: +L.bridge.cx.toFixed(2), z: +L.bridge.cz.toFixed(2) }, sign: L.sign }; },
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
