/**
 * puddlewick.js — PUDDLEWICK: the home village, the emotional anchor of the whole game.  (P05/P23 base map)
 *
 * WORLD-BIBLE §3 is the plan, and it is followed: the Beck runs west-to-east through the top third, crossed by a
 * humpbacked stone bridge; south of it the green, with the well at its centre and the chestnut tree leaning over the
 * well; seven houses in a loose ring around the green with their doors facing in; Hollybank Cottage (the hero's home)
 * is the north-west house, with the barn and the paddock behind it; the shrine of Saint Alden stands in the north-east
 * corner; the sheep pen is on the west edge with a gate a child can open; the lane out, a signpost and a low wall the
 * hero sits on are at the south-east gate. Added on top of the bible (the task's building kit): the inn with its
 * hanging sign, the chapel of Saint Alden with a bell tower (the landmark you can see from the meadow), the item and
 * weapon shop with awnings, Nan Puddifoot's bakery and its oven, and the watermill with a turning wheel on the Beck.
 * Visit 1 dressing (Act I, WORLD-BIBLE §3): harvest bunting between the houses, a trestle table of pies on the green,
 * a half-built maypole, market stalls, all seven doors open.
 *
 * Coordinates: world units, centred (origin [-32, -28], 64 x 56 tiles). +x is east, -z is north. You arrive from
 * Puddlewick Vale (`meadow`) at the south-east gate and walk up the lane to the green.
 *
 * DATA first (layout(): lanes, the Beck, building plots, colliders, exits, spots — computed once, deterministically)
 * and ART second (view(): meshes from the scenery kit, F3 materials only). Its PEOPLE and WORDS are the layer
 * src/world/maps/puddlewick.npcs.js (P11 — every `line` key below is a default it may override), its treasure is
 * src/world/maps/puddlewick.chests.js (P30).
 *
 * Debug: `/index.html?p05only=inn,chapel` builds only the named buildings (bisecting a render problem).
 *
 * ── For P11 (people) and P30 (treasure): `def.spots` ──────────────────────────────────────────────────────────
 *   spots.hob · nan · barty · dot · bel · halvard · innkeeper · shopkeeper · smithBoy · gateGuard · deacon
 *        {x, z, facing}  — where each of WORLD-BIBLE §3's constant NPCs belongs (facing in radians, 0 = north)
 *   spots.cat {x, y, z}          the bakery wall the cat sleeps on
 *   spots.duck {x, z}            the well the duck has decided is his
 *   spots.cactuddle {x, z}       the potted Cactuddle on the green (MONSTER-BIBLE §8) — the pot is already there
 *   spots.sheep [{x, z}]         six sheep in the pen (the map draws a flock only if the people layer brings none)
 *   spots.play [{x, z}]          where Dot and Bel run their chasing game
 *   spots.wagon {x, z, facing}   where Papa's wagon and Parsnip stand at the lane (B2)
 *   spots.pen / spots.paddock    {x, z, r} the two fenced fields
 *   spots.doors {id: {x, z, facing}}   the spot to stand on outside every door (and where an interior sends you back)
 *   spots.containers [{x, z, kind}]    pots, barrels and crates already standing in the village (P30 may search them)
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, lerp, smooth } from '../../art/palette.js';
import { Tex, mulberry, vnoise } from '../../art/tex.js';
import { makeAOMask } from '../../art/toon.js';
import { Sfx } from '../../audio/sfx.js';
import { reportError } from '../../engine/debug.js';
import { createKit, buildSky, ringHill, buildGround, paintMasks, distanceGrid, curvePoints, bridgeFrame, prep } from '../scenery.js';
import { LANDMARK_SETS } from '../../art/sky.js';
// Which of P06's eight interiors is behind each door on the green. int_rooms.js is now PURE DATA and imports
// nothing (it used to import all eight rooms to register them, which made an import cycle through int_common.js
// -> puddlewick.js and, once maps/index.js listed twelve maps loaded in parallel, stopped this village from
// registering at all). Only the exits array in furnish() reads it.
import { ROOM_OF } from './int_rooms.js';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// shape constants
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const W = 64, H = 56, MASK_SPAN = 108;
const AX = 30.0, AZ = 25.4;                       // the playable superellipse (village + its fields)
const WATER_Y = -0.45, BED = -1.15, VALLEY = -0.1;
const HW = 1.3, BANK = 0.8;                       // the Beck: water half-width, bank
const TAU = Math.PI * 2;
const GREEN = { x: 0, z: 6, rx: 9.5, rz: 8 };

const BECK = [[-42, -5], [-30, -9], [-22, -11.2], [-14, -12.6], [-6, -13.4], [2, -13.7], [10, -14.8], [18, -16.6], [26, -18.8], [38, -21.8]];
const NORTH_LANE = [[0.3, -2.6], [-0.2, -7.0], [-0.6, -10.6], [-0.6, -13.8], [0.3, -15.6], [1.4, -16.6], [2.0, -18.1]];
const SHRINE_PATH = [[4.8, -17.2], [9.2, -18.0], [13.5, -19.4], [18.6, -20.4]];
const WEST_LANE = [[-8.8, 2.2], [-12.6, 0.4], [-16.6, -0.4], [-20.4, 0.6], [-23.2, 3.2], [-22.6, 7.0], [-20.2, 9.4]];
const MILL_LANE = [[-16.6, -1.4], [-17.4, -4.4], [-17.8, -7.2], [-17.9, -8.4]];
const GATE_LANE = [[4.6, 13.6], [8.4, 15.6], [11.6, 18.6], [13.6, 22.0], [15.4, 25.4], [16.6, 30.5]];
/** The dead-end alley every town has (WORLD-BIBLE §5): it goes nowhere, and the pot at the end of it is always full. */
const ALLEY = [[11.6, -0.2], [14.6, -1.4], [17.4, -2.6]];

/**
 * The lane that rings the green, so every door faces a worn path. Its radius wobbles (periodically, so it closes
 * seamlessly): a village lane was walked into the grass, never drawn with a compass.
 */
function ringLane(rx = 11.7, rz = 10.1, n = 64) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, c = Math.cos(a), si = Math.sin(a);
    const k = 1 + 0.1 * (vnoise(c * 2 + 5, si * 2 + 5, 29) - 0.5) * 2 + 0.05 * (vnoise(c * 5 + 1, si * 5 + 1, 31) - 0.5) * 2;
    pts.push([GREEN.x + c * rx * k, GREEN.z + si * rz * k]);
  }
  return pts;
}


// ── the plots' own geometry: the kit recipes' footprints and door positions, known before any mesh exists ────
/** A local point in a plot's frame -> world. */
const at = (o, lx, lz) => {
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
};
/** [width, depth] of each kit recipe, so collision and lanes match the art exactly. */
const SIZE = {
  cottage: (o) => [o.W ?? 5.4, o.D ?? 4.3], bakery: () => [5.6, 4.3], inn: () => [8.2, 5.4 + 0.64],
  shop: () => [6.4, 4.5], barn: () => [6.6, 5.2], mill: () => [4.8, 4.8 + 0.32], church: (o) => [o.W ?? 6.0, o.D ?? 9.2],
};
/** [door x offset, front face z, door width] in the plot's local frame. */
const DOORPOS = {
  cottage: (o) => [o.doorX ?? 0, (o.D ?? 4.3) / 2, o.doorW ?? 1.0], bakery: () => [-1.3, 4.3 / 2, 1.0],
  inn: () => [0, 5.4 / 2 + 0.32, 1.15], shop: () => [-1.7, 4.5 / 2, 1.05], barn: () => [0, 5.2 / 2, 2.3],
  mill: () => [0, 4.8 / 2 + 0.16, 1.05], church: (o) => [0, (o.D ?? 9.2) / 2, 1.7],
};
/** Everything about a plot's door: the doorway, where you stand outside it, and which way you then face. */
function doorOf(o) {
  const kind = o.kind || 'cottage';
  const [dx, dz, dw] = (DOORPOS[kind] || DOORPOS.cottage)(o);
  const doorway = at(o, dx, dz), out = at(o, dx, dz + 1.0), far = at(o, dx, dz + 2.1), spur = at(o, dx, dz + 3.1);
  const nx = out.x - doorway.x, nz = out.z - doorway.z;
  return { kind, dx, dz, dw, doorway, out, far, spur, nx, nz, face: Math.atan2(-nx, -nz), size: (SIZE[kind] || SIZE.cottage)(o) };
}

/** The doors whose rooms are built (src/world/maps/<id>.js + an entry in maps/index.js). */
const BUILT_INTERIORS = new Set(['hollybank', 'puddlewick_inn']);

const bump = (x, z, cx, cz, r) => Math.exp(-((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r));
const edgeR = (x, z) => Math.pow(Math.pow(Math.abs(x) / AX, 4) + Math.pow(Math.abs(z) / AZ, 4), 0.25);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const gauss = (d, w) => Math.exp(-(d * d) / (w * w));
const ANG_GATE = Math.atan2(28, 16), ANG_BECK_W = Math.atan2(-9, -30), ANG_BECK_E = Math.atan2(-20, 30);

/** The bare land under the village: a shallow bowl with the green on a rise, closed by hills on every side. */
function heightRaw(x, z) {
  let h = 1.15 * vnoise(x * 0.042 + 5.1, z * 0.042 + 9.3, 13) + 0.5 * vnoise(x * 0.105 + 3.3, z * 0.105 + 1.7, 17)
    + 0.14 * vnoise(x * 0.31, z * 0.31, 23) - 0.78;
  h += 0.85 * bump(x, z, GREEN.x, GREEN.z, 11);       // the green sits up a little, so the well is the high point
  h += 0.5 * bump(x, z, -2.4, 2.6, 5);                // the chestnut's own rise
  h += 1.1 * bump(x, z, -24, 12, 9);                  // the sheep-pen slope on the west edge
  h += 1.3 * bump(x, z, 16, 22, 9);                   // the swell the gate lane climbs over
  h += 1.5 * bump(x, z, 4, -23, 9);                   // the chapel's knoll, north of the Beck
  const e = edgeR(x, z), ang = Math.atan2(z, x);
  const lump = 0.6 * vnoise(Math.cos(ang) * 3 + 11, Math.sin(ang) * 3 + 11, 31) + 0.4 * vnoise(Math.cos(ang) * 7, Math.sin(ang) * 7, 37);
  const notch = 1 - 0.8 * gauss(angDiff(ang, ANG_GATE), 0.3) - 0.7 * gauss(angDiff(ang, ANG_BECK_W), 0.26) - 0.7 * gauss(angDiff(ang, ANG_BECK_E), 0.26);
  h += (2.2 + 5.2 * lump) * notch * smooth(1.0, 2.1, e);
  return h;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// layout: every decision about where things are, made once
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
let LAYOUT = null;
function layout() {
  if (LAYOUT) return LAYOUT;
  const L = {};
  L.beck = curvePoints(BECK, 0.35);
  L.ring = curvePoints(ringLane(), 0.4);
  L.north = curvePoints(NORTH_LANE, 0.35);
  L.shrinePath = curvePoints(SHRINE_PATH, 0.4);
  L.west = curvePoints(WEST_LANE, 0.35);
  L.mill = curvePoints(MILL_LANE, 0.35);
  L.gate = curvePoints(GATE_LANE, 0.35);
  L.alley = curvePoints(ALLEY, 0.3);

  // ── the plots: every building, where it stands and which way its door faces ──
  const faceGreen = (x, z) => Math.atan2(GREEN.x - x, GREEN.z - z);
  const plot = (o) => Object.assign({ rot: faceGreen(o.x, o.z) }, o);
  L.plots = {
    hollybank: plot({ id: 'hollybank', kind: 'cottage', x: -12.7, z: -1.4, W: 5.6, D: 4.4, H: 2.4, roof: 'thatch', pitch: 0.76,
      doorX: -0.5, doorColor: PAL.paint.doorRed, frontWindows: [1.5], sideWindows: [0], shutter: PAL.paint.shutterGreen,
      chimney: 'stone', chimneyX: -1.7, braces: false, roses: [2.4], name: 'Hollybank Cottage' }),
    bakery: plot({ id: 'puddlewick_bakery', x: -6.0, z: -6.2, name: "Nan Puddifoot's bakery" }),
    inn: plot({ id: 'puddlewick_inn', x: 8.4, z: -4.6, name: 'the inn' }),
    shop: plot({ id: 'puddlewick_shop', x: 15.4, z: 3.8, name: 'the shop' }),
    // Moved 2026-09-18 from (12.2, 14.8): its blank gable filled the right third of the frame a child ARRIVES
    // in, and the green, the well and the chestnut were behind it. Here it sits properly on the ring lane and
    // the lane out of the gate opens on the village instead of on one wall.
    twins: plot({ id: 'puddlewick_twins', kind: 'cottage', x: 12.6, z: 11.6, W: 5.2, D: 4.2, H: 2.4, roof: 'tile', pitch: 0.62, barge: true,
      doorX: 0.4, doorColor: PAL.paint.shutterBlue, frontWindows: [-1.5], sideWindows: [0], shutter: PAL.paint.shutterBlue,
      chimney: 'brick', chimneyX: 1.6, name: "Dot and Bel's house" }),
    hob: plot({ id: 'puddlewick_hob', kind: 'cottage', x: -1.6, z: 18.4, W: 5.0, D: 4.0, H: 2.3, roof: 'thatch', pitch: 0.78,
      doorX: 0.3, doorColor: PAL.paint.shutterGreen, frontWindows: [-1.3], sideWindows: [], shutter: PAL.paint.shutterGreen,
      chimney: 'stone', chimneyX: 1.2, braces: false, name: "Old Hob's cottage" }),
    cottage: plot({ id: 'puddlewick_cottage', kind: 'cottage', x: -11.8, z: 13.6, W: 5.4, D: 4.3, H: 2.4, roof: 'tile', pitch: 0.6, barge: true,
      doorX: -0.3, doorColor: PAL.paint.doorRed, frontWindows: [1.4], sideWindows: [0], shutter: PAL.paint.shutterGreen,
      chimney: 'brick', chimneyX: -1.6, name: 'a cottage on the green' }),
        // The chapel stands back from the Beck ON PURPOSE. Its door faces south, and doorOf() puts the spot you step
    // back to 2.1 units out in front of it: at z = -21 that spot landed IN THE RIVER, so walking into the chapel
    // door dropped a child in the water. At z = -23.2 the front face is -18.6 and the step-back is -16.5, which is
    // 1.5 clear of the water's edge (the Beck is centred z = -13.7 here, half-width 1.3).
    chapel: { id: 'puddlewick_chapel', kind: 'church', x: 2.0, z: -23.2, rot: 0, W: 6.0, D: 9.2, H: 3.4, towerSide: 1, name: 'the chapel of Saint Alden' },
    mill: { id: 'puddlewick_mill', kind: 'mill', x: -21.0, z: -8.2, rot: Math.PI / 2, name: 'the mill' },
    barn: { id: 'hollybank_barn', kind: 'barn', x: -21.6, z: -1.2, rot: Math.PI / 2, name: "Hollybank's barn" },
  };
  L.plotList = Object.values(L.plots);

  // ── masks: worn lanes (channel 0) and the Beck's wet ground (channel 1) ──
  // every doorstep has a patch of bare earth worn in front of it, and a spur toward the lane
  const doorDiscs = [];
  for (const o of L.plotList) {
    const d = doorOf(o);
    doorDiscs.push({ x: d.out.x, z: d.out.z, r: 1.1, falloff: 0.9, channel: 0 });
    doorDiscs.push({ x: d.spur.x, z: d.spur.z, r: 0.5, falloff: 1.1, channel: 0 });
  }
  L.masks = paintMasks({
    N: 1024, span: MASK_SPAN,
    strokes: [
      { pts: L.ring, w: 2.3, falloff: 1.0, channel: 0 },
      { pts: L.north, w: 2.4, falloff: 1.0, channel: 0 },
      { pts: L.shrinePath, w: 1.5, falloff: 0.9, channel: 0 },
      { pts: L.west, w: 2.1, falloff: 1.0, channel: 0 },
      { pts: L.mill, w: 1.7, falloff: 0.9, channel: 0 },
      { pts: L.gate, w: 2.5, falloff: 1.1, channel: 0 },
      { pts: L.alley, w: 1.5, falloff: 0.8, channel: 0 },
      { pts: L.beck, w: 2 * (HW + BANK), falloff: 1.8, channel: 1 },
    ],
    discs: doorDiscs,
  });
  L.water = distanceGrid({ N: 420, span: MASK_SPAN, lines: [L.beck], maxR: 14 });

  // ── the bridge, where the north lane crosses the Beck ──
  let best = null;
  for (let i = 1; i < L.north.length - 1; i++) {
    const [x, z] = L.north[i], d = L.water.sample(x, z);
    if (!best || d < best.d) best = { d, i, x, z };
  }
  const a = L.north[best.i - 3] || L.north[0], b = L.north[best.i + 3] || L.north[L.north.length - 1];
  L.bridge = bridgeFrame({ cx: best.x, cz: best.z, dir: Math.atan2(b[0] - a[0], b[1] - a[1]), L: 7.6, W: 2.9, arch: 0.9, y0: VALLEY + 0.1 });

  // ── pads: the terrain flattens under every building ──
  // Measured 2026-09-18: with the pads applied BEFORE the Beck's valley, the valley re-cut the chapel's plot
  // afterwards and the ground ran 0.10 at its door to 1.51 at its altar end — a 1.4 m hillside INSIDE a 9.2 m
  // building, which is the grass a critic could see through the chapel doorway (P05 gap #4). Each pad is now the
  // building's own footprint (half-diagonal + a margin) and `groundNoPads` is what it levels TO, applied last.
  L.pads = L.plotList.map(o => {
    const [bw, bd] = (SIZE[o.kind || 'cottage'] || SIZE.cottage)(o);
    return { x: o.x, z: o.z, r: Math.hypot(bw, bd) / 2 + 0.55, f: 3.0, y: groundNoPads(L, o.x, o.z) };
  });
  L.pads.push({ x: 2.2, z: 5.0, r: 2.2, f: 3.0, y: groundNoPads(L, 2.2, 5.0) });          // the well stands level

  // ── fields, fences, festival dressing ──
  L.pen = [[-29, 6.5], [-20.5, 5.4], [-19.6, 13.4], [-28.6, 15.0], [-29, 6.5]];
  L.penGate = { x: -20.1, z: 9.4, rot: Math.atan2(1, -0.1) };
  L.penCentre = { x: -24.4, z: 10.1, r: 3.8 };
  L.paddock = [[-29.6, -3.4], [-25.0, -4.4], [-24.0, 1.0], [-29.2, 2.0], [-29.6, -3.4]];
  L.paddockCentre = { x: -27.0, z: -1.2, r: 2.4 };
  L.picket = [[-17.2, -0.2], [-13.0, -1.6], [-10.6, -3.6]];
  L.wall = [[9.9, 18.2], [11.0, 21.2]];                                                  // the low wall the hero waits on
  L.stile = { x: 11.3, z: 22.4, rot: -0.35 };
  // The signpost stands on open grass beside the gate lane, not against Dot and Bel's front wall: in the frame a
  // child actually arrives on, the post and the cottage were overlapping and neither one read.
  // 1.9 off the lane centre put the signpost dead in the middle of the frame a child arrives in. At 15.6/20.0 it
  // is 3 units clear on the east verge: you read it on your way past instead of walking into it.
  L.sign = { x: 15.6, z: 20.0 };
  L.pads.push({ x: L.sign.x, z: L.sign.z, r: 2.0, f: 3.0, y: groundNoPads(L, L.sign.x, L.sign.z) });   // level ground
  L.stalls = [{ x: 3.2, z: 3.8, rot: -1.0, color: PAL.cloth.mustard, goods: ['apple', 'cabbage', 'loaf'], seed: 41 },
    { x: 6.8, z: 9.8, rot: 0.7, color: PAL.cloth.blue, goods: ['pot', 'loaf', 'apple'], seed: 42 }];
  L.trestle = { x: -4.8, z: 10.2, rot: 0.15 };
  L.maypole = { x: 5.0, z: 12.6 };
  L.well = { x: 2.2, z: 5.0, rot: 0.34 };
  L.chestnut = { x: -2.4, z: 2.6, s: 2.5 };
  L.shrine = [{ x: 18.4, z: -20.4, h: 2.1, seed: 3 }, { x: 20.3, z: -21.4, h: 2.5, seed: 4 }, { x: 22.0, z: -20.3, h: 1.9, seed: 5 }];
  L.shrineBench = { x: 21.0, z: -22.6, rot: 0.1 };          // north of the stones, looking back at them (the Beck's edge is at -18.5)
  L.benches = [{ x: 1.6, z: 8.6, rot: 0.25 }, { x: 14.0, z: 18.4, rot: -1.0 }];
  L.notice = { x: 4.4, z: -15.9, rot: 0.1 };
  L.barrels = [{ x: 12.3, z: -2.2, s: 1 }, { x: 12.9, z: -1.3, s: 0.85 }, { x: -9.6, z: -4.8, s: 1 }, { x: -20.0, z: -11.4, s: 0.9 }];
  L.crates = [{ x: 18.9, z: 6.3, rot: 0.4 }, { x: 18.3, z: 7.2, rot: -0.2 }, { x: -18.6, z: -8.6, rot: 0.2 }];
  L.woodpile = { x: -16.8, z: -4.6, rot: Math.PI / 2 };
  // The washing line used to be strung a metre off Hollybank's north wall, which merged it into the cottage's
  // see-through cluster and inflated that cluster's box to 10.0 x 6.7 — so the fade pass called the lens "inside
  // the cottage" while it was still out on the grass. It hangs in the orchard now, clear of every wall.
  L.laundry = [[-18.4, -7.6], [-14.2, -6.8]];
  L.beds = [{ x: -11.4, z: -0.4, w: 2.2, d: 1.2, rot: 0.9 }, { x: 4.4, z: 3.2, w: 2.6, d: 1.3, rot: 0.1 }, { x: 11.0, z: -2.6, w: 2.0, d: 1.1, rot: -0.6 }];
  L.vegPatches = [{ x: -9.4, z: -10.4, w: 4.4, d: 3.0, rot: 0.45, seed: 9 }, { x: 1.4, z: 23.6, w: 4.0, d: 2.8, rot: 0.1, seed: 11 },
    { x: -15.8, z: 18.4, w: 3.6, d: 2.6, rot: 2.1, seed: 13 }];
  L.hay = [{ x: -19.6, z: 1.6, rot: 0.3 }, { x: -18.4, z: 2.6, rot: -0.4 }];
  L.sacks = [{ x: -18.1, z: -6.6, n: 3, rot: 0.3, seed: 6 }];
  L.pot = { x: 4.8, z: 8.2 };                                                            // the potted Cactuddle's pot
  L.alleyPot = { x: 17.2, z: -2.9 };                                                     // the dead end's always-full pot
  L.rocks = [[-26.5, 18.5, 0.9, 21], [21.5, 9.5, 1.0, 22], [-8.5, 22.5, 0.7, 23], [24.5, -12.5, 1.2, 24], [-27.5, -9.5, 1.0, 25],
    [14.5, -22.5, 0.8, 26], [-4.5, -19.5, 0.6, 27], [26.5, 3.5, 1.1, 28]].map(([x, z, s, seed]) => ({ x, z, s, seed }));

  // ── trees ──
  L.trees = [
    { kind: 'chestnut', x: L.chestnut.x, z: L.chestnut.z, s: L.chestnut.s, r: 0.4, c: 1.02 },
    { kind: 'oak', x: 19.8, z: -7.4, s: 1.3 }, { kind: 'oak', x: -17.8, z: 8.6, s: 1.25 }, { kind: 'oak', x: 4.4, z: 24.6, s: 1.3 },
    { kind: 'oak', x: -24.8, z: 19.4, s: 1.2 }, { kind: 'oak', x: 26.0, z: 11.0, s: 1.15 }, { kind: 'oak', x: -8.8, z: -19.2, s: 1.25 },
    { kind: 'oak', x: 11.2, z: -23.4, s: 1.2 }, { kind: 'oak', x: -26.8, z: -14.8, s: 1.1 }, { kind: 'oak', x: 25.4, z: 22.6, s: 1.2 },
    { kind: 'fruit', x: -9.8, z: -12.6, s: 1.0 }, { kind: 'fruit', x: -12.8, z: -11.4, s: 1.05 }, { kind: 'fruit', x: -15.6, z: -12.4, s: 1.0 },
    { kind: 'fruit', x: -13.0, z: -8.6, s: 0.95 }, { kind: 'blossom', x: 6.4, z: -25.0, s: 1.1 }, { kind: 'blossom', x: -2.6, z: -24.4, s: 1.0 },
    { kind: 'poplar', x: -13.4, z: -15.6, s: 1.15 }, { kind: 'poplar', x: -4.6, z: -17.8, s: 1.1 }, { kind: 'poplar', x: 14.4, z: -13.0, s: 1.05 },
    { kind: 'poplar', x: -22.6, z: -12.8, s: 1.1 }, { kind: 'birch', x: 25.0, z: -17.0, s: 1.0 }, { kind: 'birch', x: 26.2, z: -14.6, s: 1.05 },
    { kind: 'round', x: -19.4, z: 16.4, s: 1.1 }, { kind: 'round', x: 18.6, z: 24.4, s: 1.05 },
  ];
  const rnd = mulberry(7717);
  for (const t of L.trees) { if (t.r == null) t.r = rnd() * TAU; if (t.c == null) t.c = 0.88 + rnd() * 0.2; }
  const bushSpots = [[-6.6, 1.2], [8.8, 3.4], [-4.4, 14.6], [9.8, 12.8], [-16.4, 4.6], [17.8, 9.0], [-10.4, 20.4], [3.0, 16.4],
    [-24.4, 3.4], [20.4, -3.4], [-2.4, -10.4], [8.4, -10.6], [-19.4, -14.4], [15.6, -19.4], [-27.4, 6.4], [24.8, 17.8]];
  L.bushes = bushSpots.map(([x, z]) => ({ kind: 'bush', x, z, s: 0.7 + rnd() * 0.5, r: rnd() * TAU, c: 0.9 + rnd() * 0.2 }));

  // ── sheep (the map only draws them when the people layer brings none) ──
  L.sheep = [{ x: -25.8, z: 8.6, yaw: 0.6 }, { x: -23.2, z: 9.8, yaw: -2.1 }, { x: -26.2, z: 11.8, yaw: 2.4 },
    { x: -22.4, z: 12.4, yaw: -0.7 }, { x: -24.8, z: 13.2, yaw: 1.4 }, { x: -21.8, z: 7.4, yaw: -2.6 }];

  LAYOUT = L;
  return L;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// terrain
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** The land before any building levelled it: the bowl, the Beck's valley, the worn lanes and the bridge ramps. */
function groundNoPads(L, x, z) {
  let h = heightRaw(x, z);
  const dW = L.water.sample(x, z);
  h = lerp(VALLEY + (h - VALLEY) * 0.3, h, smooth(2.2, 10, dW));            // the Beck's shallow valley
  h -= 0.07 * smooth(0.45, 0.92, L.masks.sample(0, x, z));                  // lanes worn a little lower
  // the bridge ramps: the banks rise to meet the deck, so nobody steps off a ledge
  const br = L.bridge, loc = br.local(x, z);
  if (Math.abs(loc.v) < br.W * 0.9 + 1.0 && Math.abs(loc.u) < br.L / 2 + 3.2) {
    const k = (1 - smooth(br.L / 2 - 0.4, br.L / 2 + 3.2, Math.abs(loc.u))) * (1 - smooth(br.W * 0.55, br.W * 0.9 + 1.0, Math.abs(loc.v)));
    h = lerp(h, br.y0 - 0.06, k);
  }
  return h;
}

function heightAt(x, z) {
  const L = layout();
  let h = groundNoPads(L, x, z);
  // the building plots LAST, so nothing re-cuts a floor after it has been levelled
  for (const p of L.pads) {
    const d = Math.hypot(x - p.x, z - p.z), f = p.f ?? 3.0;
    if (d < p.r + f) h = lerp(h, p.y, 1 - smooth(p.r, p.r + f, d));
  }
  const dW = L.water.sample(x, z);
  if (dW < HW + BANK) h = lerp(BED, h, smooth(HW - 0.55, HW + BANK, dW));   // the channel and its banks, last of all
  return h;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the village flock (only when nobody else brings sheep)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const MX = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
function coloured(geo, hex, matrix) { const g = prep(geo, hex); if (matrix) g.applyMatrix4(matrix); return g; }

function sheepGeometry() {
  const Wl = PAL.animal.wool, wool = [];
  wool.push(coloured(new THREE.IcosahedronGeometry(0.42, 1), Wl, MX(0, 0.62, 0, 0.95, 0.8, 1.2)));
  for (const [x, y, z, r] of [[0.21, 0.8, 0.12, 0.22], [-0.21, 0.8, 0.1, 0.22], [0, 0.92, -0.14, 0.25], [0, 0.64, -0.44, 0.23],
    [0.25, 0.58, -0.12, 0.23], [-0.25, 0.58, -0.12, 0.23], [0, 0.72, 0.36, 0.2], [0, 0.73, -0.64, 0.09]]) {
    wool.push(coloured(new THREE.IcosahedronGeometry(r, 0), Wl, MX(x, y, z)));
  }
  const body = mergeGeometries(wool);
  { const p = body.attributes.position, c = body.attributes.color, a = C3(PAL.animal.woolShade), b = C3(PAL.animal.wool), t = new THREE.Color();
    for (let i = 0; i < p.count; i++) { t.copy(a).lerp(b, smooth(0.35, 0.8, p.getY(i))); c.setXYZ(i, t.r, t.g, t.b); } }
  const legs = [];
  for (const [x, z] of [[0.17, 0.25], [-0.17, 0.25], [0.17, -0.3], [-0.17, -0.3]]) legs.push(coloured(new THREE.CylinderGeometry(0.055, 0.05, 0.36, 6), PAL.animal.hoof, MX(x, 0.19, z)));
  const head = mergeGeometries([
    coloured(new THREE.SphereGeometry(0.17, 8, 6), PAL.animal.face, MX(0, -0.03, 0.14, 0.82, 0.95, 1.15)),
    coloured(new THREE.IcosahedronGeometry(0.13, 0), Wl, MX(0, 0.12, 0.06, 1.1, 0.8, 1)),
    coloured(new THREE.SphereGeometry(0.07, 7, 4), PAL.animal.ear, MX(0.18, 0.04, 0.06, 1.45, 0.45, 0.8, 0, 0, -0.35)),
    coloured(new THREE.SphereGeometry(0.07, 7, 4), PAL.animal.ear, MX(-0.18, 0.04, 0.06, 1.45, 0.45, 0.8, 0, 0, 0.35)),
    coloured(new THREE.SphereGeometry(0.036, 6, 4), PAL.char.white, MX(0.085, 0.03, 0.265)),
    coloured(new THREE.SphereGeometry(0.036, 6, 4), PAL.char.white, MX(-0.085, 0.03, 0.265)),
    coloured(new THREE.SphereGeometry(0.021, 5, 3), PAL.char.eye, MX(0.083, 0.03, 0.296)),
    coloured(new THREE.SphereGeometry(0.021, 5, 3), PAL.char.eye, MX(-0.083, 0.03, 0.296)),
  ]);
  return { body: mergeGeometries([body, ...legs]), head, headAt: [0, 0.74, 0.46] };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the def
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const puddlewick = {
  id: 'puddlewick',
  name: 'Puddlewick',
  kind: 'town',
  size: [W, H],
  origin: [-W / 2, -H / 2],
  res: 4,
  theme: 'grass',
  music: 'village',                       // CANON §9: `village` is Puddlewick's own theme and nowhere else's
  ambience: 'amb_town',
  hours: 15.6,                            // Visit 1: a warm afternoon, the harvest festival being got ready
  light: { preset: 'day' },
  weather: 'clear',
  encounters: null,                       // nothing ambushes you at home
  // You arrive on the gate lane, 2.6 units clear of the lane-out trigger (which starts at z = 26.0) — so a child
  // who arrives and takes one step backwards does NOT fall straight back out into the vale.
  spawn: { x: 14.8, z: 23.4, facing: Math.atan2(-2.6, -3.4) },
  camera: { orbit: 36, pitch: 28, dist: 11, fov: 49, lookUp: 2.2 },

  tiles: {
    height: heightAt,
    solid(x, z) {
      const e = edgeR(x, z);
      if (e > 1) {
        // The lane-out pad sits past the playable rim. Open a corridor along the GATE LANE centreline
        // (not just the dirt mask — walking a step off the worn track used to hit an invisible wall again).
        if (z > 21 && e < 1.22) {
          const g = layout().gate;
          let d = 1e9;
          for (let i = 0; i < g.length - 1; i++) {
            const [ax, az] = g[i], [bx, bz] = g[i + 1], vx = bx - ax, vz = bz - az;
            const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
            d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
          }
          if (d < 3.4) return false;
        }
        return true;
      }
      const L = layout();
      if (L.water.sample(x, z) < HW + 0.35 && !L.bridge.corridor(x, z, 0.35)) return true;
      return false;
    },
    ground(x, z) {
      const L = layout();
      if (L.bridge.deckY(x, z) != null) return 'stone';
      if (L.water.sample(x, z) < HW) return 'water';
      return L.masks.sample(0, x, z) > 0.5 ? 'dirt' : 'grass';
    },
  },
  walkY(x, z, terrain) {
    const y = layout().bridge.deckY(x, z);
    const t = terrain(x, z);
    return y != null ? Math.max(t, y) : t;
  },

  get colliders() { return furnish().colliders; },
  get props() { return furnish().props; },
  get exits() { return furnish().exits; },
  get occluders() { return furnish().occluders; },
  get spots() { return furnish().spots; },
  get chests() { return furnish().chests; },
  npcs: [],

  /**
   * Default words. Everything here is a fallback the people layer (puddlewick.npcs.js, P11) may override key by key;
   * the map only holds WHERE things are (docs/ARCHITECTURE.md "Map layers").
   */
  lines: {
    signpost: [
      '{gold}Puddlewick{/gold} — you are\nstanding in it.',
      '{gold}Saltmarrow{/gold} — down the lane,\npast the sheep. Keep the sea\non your left.',
      'Somebody scratched a very small\nboat under the bottom board.',
    ],
    well: ['The well is deep and cold, and\nsmells of rain.', 'A bucket waits on the rim, in case\nyou are the helpful sort.'],
    chestnut: ['The chestnut tree. Older than\nthe village, and it knows it.', 'The bark is worn smooth where a\nboy always climbs.'],
    beck: 'The Beck goes by with its hands\nin its pockets, whistling.',
    bridge: 'The bridge is humpbacked, and\nevery footstep sounds important.',
    'mill-wheel': 'The wheel turns, and turns, and\nturns. It has no plans to stop.',
    notice: ['{gold}HARVEST FESTIVAL{/gold} — Saturday.\nBring a pie. Bring TWO pies.',
      'Underneath, in another hand:\n"Pie judging is NOT hereditary."'],
    shrine: ['Three stones and a bench, and no\nroof at all.', 'Saint Alden liked the weather.', 'You feel looked after. You could\nnot say by whom.'],
    wall: 'A low wall, exactly the right\nheight for waiting on.',
    maypole: ['The maypole is half up. The\nribbons are still in a heap.', 'Somebody has climbed halfway and\nthought better of it.'],
    pies: ['Pies. Cooling. Guarded by nobody,\nwhich is a kind of trust.', 'You count them twice, to be sure\nof the number. Six.'],
    stall: 'A market stall, set out early,\nthe way hopeful people do.',
    'inn-sign': 'The sign says {gold}INN{/gold}.\nUnderneath, smaller: "and soup".',
    'shop-sign': 'The sign says {gold}SHOP{/gold}.\nUnderneath: "no credit, no\nexceptions, not even you".',
    'bakery-sign': 'The sign says {gold}BAKER{/gold}, and the\nair says it louder.',
    'pen-gate': ['The gate is latched with a loop\nof string. A child could open it.', 'That is, more or less, the point\nof a gate.'],
    paddock: 'An empty paddock, mown short,\nwith room for something enormous.',
    'cactuddle-pot': 'Somebody planted something in a\npot on the green.{n}It looks pleased about it.',
    barrel: 'Barrel of rainwater, with one\nleaf sailing on it.',
    'alley-pot': ['The lane stops here, at a pot.', 'A pot at the end of a lane is\nalways worth a look.', 'Everyone here knows that. Nobody\nknows why it is true.'],
    sheep: 'Baa.\n(She has had a very long morning.)',
    // the doors: the insides are their own maps (P06/P23); until they are built, the village says so in its own voice
    'door-hollybank': ['Home. Somebody inside is singing\nto a kettle, and losing.', 'Better go in when Papa calls.'],
    'door-hollybank_barn': 'Hay, old wood, and a wagon that\nhas been places.',
    'door-puddlewick_bakery': 'Warm bread, and Nan Puddifoot\nelbow-deep in dough.{n}Come back when her hands are free.',
    'door-puddlewick_inn': 'Spoons, and somebody laughing at\nsomething that was not funny.',
    'door-puddlewick_shop': ['The shopkeeper looks at you, then\nat your empty pockets.', 'He puts the sword away. Slowly.'],
    'door-puddlewick_chapel': ['Cool air, candle smoke, and a bell\nrope.', 'You are absolutely not allowed\nto pull it.'],
    'door-puddlewick_mill': 'Flour dust turning in the light,\nand the floor humming underfoot.',
    'door-puddlewick_twins': ['Dot and Bel live here.\nYou can hear both of them.', 'They are making a new rule.'],
    'door-puddlewick_hob': "One chair, worn exactly to the\nshape of Old Hob.",
    'door-puddlewick_cottage': 'Somebody is having a nap, loudly.',
    'lane-out': 'The lane runs down to the vale,\nand the vale runs on for ever.',
    'search-crate-shop': ['Bram gets the lid off the crate.{wait:320}{n}Straw, and something wrapped in\nstraw, and under THAT: nothing.',
      'Whoever packed this was making\na point.'],
    'search-crate-mill': 'Bram tips the crate over.{n}Three nails and a very startled\nspider.',
    'search-sacks': ['Bram puts an arm into the flour\nsack up to the elbow.{wait:350}{n}Flour.', 'He is going to be found out\nabout this.'],
    'search-hay': ['Bram searches the hay, the way\nyou are meant to.{n}A hen has beaten him to it, and\nleft the evidence.'],
    'search-barrel-mill': ['Bram lifts the lid of the barrel.{n}Rainwater, and the sky in it,\nupside down.'],
    search: [
      'Bram looks under the trestle.{wait:350}{n}A pie has been counted twice.{n}By him.',
      'Bram searches the green.{n}Three chestnuts in their shells.{n}He puts two back.',
      'Bram checks the well bucket.{n}Empty. Somebody drank the rain.',
    ],
  },

  onEnter() { /* the field emits map.enter; the score plays `village` (CANON §9) */ },

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // the art
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  view({ scene, rig, map, blobs, App }) {
    const t0 = performance.now();
    const low = !!(App && App.quality === 'low');
    const L = layout();
    const ao = makeAOMask({ span: MASK_SPAN, size: 1024, center: [0, 0] });
    const kit = createKit({ scene, heightAt, ao });
    // every stage is guarded: a recipe module mid-edit in another piece must never cost this map its art
    const safe = (name, fn) => { try { return fn(); } catch (e) { reportError(`puddlewick: ${name}`, e); return null; } };
    let sky = null;
    // The skyline, re-aimed for home. P02's default 'vale' set paints PUDDLEWICK on the horizon — which is wrong
    // when you are standing in it (you could see your own village two miles away). So: drop that card, and point
    // the other three down the bearings Puddlewick's own signpost points (WORLD-BIBLE §1: Saltmarrow south-east
    // down the Beck, Coddleston east along the Long Lane, the Whispering Wood north beyond the chapel).
    const HOME_AZ = { saltmarrow: 1.02, coddleston: 0.16, whispering_wood: -1.47 };
    const homeMarks = (() => {
      try {
        const vale = LANDMARK_SETS && LANDMARK_SETS.vale;
        if (!Array.isArray(vale) || !vale.length) return 'vale';
        const kept = vale.filter(m => m && m.id !== 'puddlewick').map(m => Object.assign({}, m, { az: HOME_AZ[m.id] ?? m.az }));
        return kept.length ? kept : 'vale';
      } catch (e) { reportError('puddlewick: skyline', e); return 'vale'; }
    })();
    safe('sky', () => { sky = buildSky(scene, rig, { landmarks: homeMarks }); });
    safe('hills', () => {
      ringHill(scene, 'mid', 120, 155, 205, 5, 21, 53, PAL.hill.midLow, PAL.hill.mid, 0.2);
      ringHill(scene, 'far', 245, 305, 385, 12, 78, 61, PAL.hill.farLow, PAL.hill.far, 0.25, { fogged: false, peaky: 1.8 });
    });

    // ── the buildings ──
    const recs = {};
    const ONLY = (() => { try { return new URLSearchParams(location.search).get('p05only'); } catch (_) { return null; } })();
    const only = ONLY ? ONLY.split(',') : null;
    const build = (name, fn) => { if (only && !only.includes(name)) return; try { recs[name] = fn(); } catch (e) { reportError(`puddlewick: ${name}`, e); } };
    const P = L.plots;
    build('hollybank', () => kit.cottage(Object.assign({ opens: { id: 'hollybank' } }, P.hollybank)));
    build('bakery', () => kit.bakery(Object.assign({ opens: { id: 'puddlewick_bakery' } }, P.bakery)));
    build('inn', () => kit.inn(Object.assign({ opens: { id: 'puddlewick_inn' } }, P.inn)));
    build('shop', () => kit.shop(Object.assign({ opens: { id: 'puddlewick_shop' } }, P.shop)));
    build('twins', () => kit.cottage(Object.assign({ opens: { id: 'puddlewick_twins' } }, P.twins)));
    build('hob', () => kit.cottage(Object.assign({ opens: { id: 'puddlewick_hob' } }, P.hob)));
    build('cottage', () => kit.cottage(Object.assign({ opens: { id: 'puddlewick_cottage' } }, P.cottage)));
    build('chapel', () => kit.church(Object.assign({ opens: { id: 'puddlewick_chapel' } }, P.chapel)));
    build('mill', () => kit.mill(Object.assign({ opens: { id: 'puddlewick_mill' }, waterY: WATER_Y, wheelSide: 1 }, P.mill)));
    build('barn', () => kit.barn(Object.assign({ opens: { id: 'hollybank_barn' } }, P.barn)));

    // ── the well, the bridge, the shrine, the wall, the signpost ──
    build('well', () => kit.wellHouse(L.well.x, L.well.z, { rot: L.well.rot }));
    try { kit.stoneBridge(L.bridge); } catch (e) { reportError('puddlewick: bridge', e); }
    for (const s of L.shrine) { try { kit.standingStone(s.x, s.z, { h: s.h, seed: s.seed, r: 0.5 }); } catch (e) { reportError('puddlewick: shrine', e); } }
    try { kit.stoneWall(L.wall, { seed: 7 }); } catch (e) { reportError('puddlewick: wall', e); }
    try {
      const atlas = kit.useSignAtlas(kit.signAtlas(['Puddlewick', 'Saltmarrow', 'Long Lane']));
      kit.signpost(atlas, L.sign.x, L.sign.z, [
        { label: 'Puddlewick', dir: Math.atan2(GREEN.x - L.sign.x, GREEN.z - L.sign.z) },   // up the lane, into the village
        { label: 'Saltmarrow', dir: Math.atan2(3.4, 5.6) },                                 // out of the gate and down the Beck
        { label: 'Long Lane', dir: Math.atan2(16.0 - L.sign.x, 26.8 - L.sign.z) },          // straight down the gate lane to the vale
      ]);
    } catch (e) { reportError('puddlewick: signpost', e); }

    // ── fences, gardens, the festival ──
    safe('pen', () => kit.fence(L.pen, { seed: 5 }));
    safe('paddock', () => kit.fence(L.paddock, { seed: 6 }));
    safe('picket', () => kit.picket(L.picket));
    for (const b of L.beds) safe('bed', () => kit.flowerBed(b.x, b.z, b.w, b.d, b.rot, 17));
    for (const v of L.vegPatches) safe('veg', () => kit.vegPatch(v.x, v.z, v.w, v.d, v.rot, v.seed));
    for (const b of L.benches) safe('bench', () => kit.bench(b.x, b.z, b.rot));
    safe('shrine bench', () => kit.bench(L.shrineBench.x, L.shrineBench.z, L.shrineBench.rot));
    for (const b of L.barrels) safe('barrel', () => kit.barrel(b.x, b.z, b.s, b.x));
    for (const c of L.crates) safe('crate', () => kit.crate(c.x, c.z, c.rot));
    safe('woodpile', () => kit.woodpile(L.woodpile.x, L.woodpile.z, L.woodpile.rot));
    for (const h of L.hay) safe('hay', () => (kit.hayBale ? kit.hayBale(h.x, h.z, h.rot, {}) : null));
    for (const s of L.sacks) safe('sacks', () => kit.sacks(s.x, s.z, s.n, s.rot, s.seed));
    safe('notice', () => kit.noticeBoard(L.notice.x, L.notice.z, L.notice.rot, {}));
    safe('stile', () => (kit.stile ? kit.stile(L.stile.x, L.stile.z, L.stile.rot) : null));
    safe('lanterns', () => { if (!kit.lantern) return; const d = L.spots.doors.puddlewick_inn; kit.lantern(d.x + 1.6, d.z + 0.6, 0); kit.lantern(L.well.x - 2.6, L.well.z + 1.8, 0); });
    for (const s of L.stalls) safe('stall', () => kit.stall(s));
    safe('trestle', () => kit.trestleTable(L.trestle.x, L.trestle.z, L.trestle.rot, { pies: 3 }));
    safe('maypole', () => kit.maypole(L.maypole.x, L.maypole.z, { h: 4.7 }));
    safe('laundry', () => kit.laundry(L.laundry[0], L.laundry[1], [
      { t: 0.2, w: 0.9, h: 0.72, tex: Tex.cloth(PAL.cloth.cream, { stripe: PAL.cloth.red, S: 128 }) },
      { t: 0.46, w: 1.0, h: 1.1, tex: Tex.cloth(PAL.cloth.green) },
      { t: 0.72, w: 0.7, h: 0.85, tex: Tex.cloth(PAL.cloth.blue) },
    ]));
    // the pot at the end of the dead-end alley (WORLD-BIBLE §5: that pot is always full)
    safe('alley pot', () => {
      const y = heightAt(L.alleyPot.x, L.alleyPot.z);
      const pot = new THREE.CylinderGeometry(0.36, 0.28, 0.5, 14);
      kit.addTo('tile', pot, new THREE.Matrix4().setPosition(L.alleyPot.x, y + 0.25, L.alleyPot.z), PAL.tile.dark);
      kit.addTo('paint', new THREE.TorusGeometry(0.36, 0.045, 5, 16), new THREE.Matrix4().setPosition(L.alleyPot.x, y + 0.48, L.alleyPot.z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), PAL.tile.ridge);
      ao.disc(L.alleyPot.x, L.alleyPot.z, 0.8, 0.6); kit.footDisc(L.alleyPot.x, L.alleyPot.z, 0.45);
      // the alley is a dead end because a fence closes it
      kit.fence([[16.0, -4.4], [18.6, -3.4], [19.2, -1.0]], { seed: 8 });
    });
    // the pot on the green that a Cactuddle lives in (MONSTER-BIBLE §8 — P16 puts the creature in it)
    safe('pot', () => {
      const y = heightAt(L.pot.x, L.pot.z);
      const pot = new THREE.CylinderGeometry(0.34, 0.26, 0.44, 14);
      kit.addTo('tile', pot, new THREE.Matrix4().setPosition(L.pot.x, y + 0.22, L.pot.z), PAL.tile.mid);
      kit.addTo('dirtbed', new THREE.CircleGeometry(0.3, 14).rotateX(-Math.PI / 2), new THREE.Matrix4().setPosition(L.pot.x, y + 0.45, L.pot.z), PAL.dirt.dark);
      ao.disc(L.pot.x, L.pot.z, 0.7, 0.6); kit.footDisc(L.pot.x, L.pot.z, 0.45);
    });
    // harvest bunting, strung from eave to eave across the green (WORLD-BIBLE §3, Visit 1)
    safe('bunting', () => {
      const eave = (rec, side) => {
        if (!rec) return null;
        const c = Math.cos(rec.rot), s = Math.sin(rec.rot), lx = side * (rec.W / 2 - 0.3), lz = rec.D / 2 - 0.1;
        const x = rec.x + lx * c + lz * s, z = rec.z - lx * s + lz * c;
        return [x, heightAt(x, z) + (rec.kind === 'inn' ? 5.0 : 3.0), z];
      };
      const a = eave(recs.hollybank, 1), b = eave(recs.bakery, -1), c = eave(recs.inn, -1), d = eave(recs.shop, -1);
      const chain = [a, b, c, d].filter(Boolean);
      if (chain.length > 1) kit.bunting(chain, { seed: 4 });
    });

    // ── trees, hedges and the wooded rim ──
    safe('trees', () => {
      if (kit.trees) kit.trees([...L.trees, ...L.bushes]);
      else for (const t of [...L.trees, ...L.bushes]) kit.forest(t.kind, null, [t], {});
    });
    for (const r of L.rocks) safe('rock', () => kit.rock(r.x, r.z, r.s, r.seed));
    const shade = makeAOMask({ span: 200, size: 512, center: [0, 0] });
    safe('rim', () => {
      const laneOut = L.gate.filter(([x, z]) => edgeR(x, z) > 0.86);
      const nearLane = (x, z) => {
        let d = 1e9;
        for (let i = 0; i < laneOut.length - 1; i++) {
          const [ax, az] = laneOut[i], [bx, bz] = laneOut[i + 1], vx = bx - ax, vz = bz - az;
          const tt = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
          d = Math.min(d, Math.hypot(x - ax - vx * tt, z - az - vz * tt));
        }
        return d;
      };
      const beckMouth = (x, z) => Math.abs(z - (-9 + (x + 30) * -0.28)) < 5 && Math.abs(x) > 24;
      const rows = [
        { kind: 'tree', e: 1.04, spacing: 3.0, jitter: 0.5, size: [0.95, 1.3], mouth: 4.2, pick: (x, z, rnd) => (rnd() < 0.82 ? 'hedge' : 'bush') },
        { kind: 'tree', e: 1.14, spacing: 4.6, jitter: 1.3, size: [1.0, 1.4], mouth: 3.4, clump: { freq: 13, threshold: 0.4, seed: 71 },
          pick: (x, z, rnd) => (rnd() < 0.55 ? 'oak' : rnd() < 0.7 ? 'birch' : rnd() < 0.85 ? 'round' : 'pine') },
        { kind: 'tree', e: 1.27, spacing: 5.6, jitter: 1.8, size: [1.05, 1.5], mouth: 2.4, clump: { freq: 10, threshold: 0.46, seed: 37 },
          pick: (x, z, rnd) => (rnd() < 0.5 ? 'oak' : rnd() < 0.75 ? 'pine' : 'birch') },
        { kind: 'card', e: 1.5, spacing: 6.0, jitter: 3.0, size: [6.4, 8.2], haze: 0.14, clump: { freq: 7, threshold: 0.5, seed: 131 } },
        { kind: 'card', e: 1.8, spacing: 7.5, jitter: 4.5, size: [7.2, 9.4], haze: 0.26, clump: { freq: 6, threshold: 0.56, seed: 167 } },
        { kind: 'card', e: 2.2, spacing: 9.5, jitter: 6.0, size: [8.0, 10.6], haze: 0.38, clump: { freq: 5, threshold: 0.6, seed: 199 } },
      ];
      // On the low tier the third real-tree row and the farthest card row go: the rim still reads as 2 staggered
      // rows of mixed clumps in front of 2 hazed card layers, for ~40 fewer trees (ARCHITECTURE rule 4, P34).
      const useRows = low ? rows.filter((r, i) => i !== 2 && i !== 5) : rows;
      kit.forestRing({
        rows: useRows, seed: 5150, shade, sunDir: rig.dir, low,
        pointAt: (ang, e) => {
          const c = Math.cos(ang), s = Math.sin(ang);
          const k = Math.pow(Math.pow(Math.abs(c / AX), 4) + Math.pow(Math.abs(s / AZ), 4), -0.25);
          return [c * k * e, s * k * e];
        },
        clear: (x, z, ri, row) => {
          const mouth = row.mouth ?? 0;
          if (mouth > 0 && nearLane(x, z) < mouth) return true;
          if (beckMouth(x, z)) return true;
          // the chapel stands on its knoll at the very edge of the village: keep the hedge and the first tree rows
          // out of its back wall and out of its tower, so the landmark reads as a building and not as a thicket
          const c = P.chapel, [cw, cd] = SIZE.church(c);
          if (Math.abs(x - c.x) < cw / 2 + 3.4 && z < c.z + cd / 2 + 0.5 && z > c.z - cd / 2 - 3.6) return true;
          return false;
        },
      });
    });

    kit.flush();

    // ── the Beck ──
    safe('water', () => kit.water({ stream: L.beck, width: 2 * (HW + BANK + 0.5), y: WATER_Y, shoreDepth: 0.45 }));
    const shore = (x, z, y) => y > WATER_Y - 0.15 && y < WATER_Y + 0.42;
    for (const [x, z, n, seed] of [[-11.6, -12.0, 12, 61], [4.0, -13.0, 10, 62], [13.0, -14.6, 10, 63], [-24.6, -11.6, 9, 64], [21.0, -17.2, 9, 65]]) {
      safe('reeds', () => kit.reeds(x, z, n, seed, 1.3, shore));
    }
    safe('lilies', () => kit.lilyPads(8.0, -14.2, WATER_Y, 5, 66, 1.8));

    // ── tufts and flowers (footprints and AO are complete by now) ──
    const pathAt = (x, z) => L.masks.sample(0, x, z);
    const onGrass = (x, z) => edgeR(x, z) < 1.16 && pathAt(x, z) < 0.3 && L.water.sample(x, z) > 2.2 && !L.bridge.corridor(x, z, 1);
    safe('tufts', () => kit.tufts({ count: low ? 560 : 840, radius: 31, seed: 606, accept: onGrass,
      rimOf: (x, z) => { const p = pathAt(x, z); return smooth(0.08, 0.3, p) * (1 - smooth(0.3, 0.42, p)) + smooth(3.2, 2.4, L.water.sample(x, z)) * 0.6; } }));
    safe('flowers', () => {
      const hues = [PAL.flower.white, PAL.flower.yellow, PAL.flower.pink, PAL.flower.blue];
      const cl = [
        { x: -5.0, z: 4.0, hue: PAL.flower.white, n: 16 }, { x: 5.6, z: 6.6, hue: PAL.flower.yellow, n: 14 },
        { x: -1.0, z: 11.6, hue: PAL.flower.pink, n: 14 }, { x: 3.0, z: -0.6, hue: PAL.flower.white, n: 12 },
        { x: 15.6, z: 12.0, hue: PAL.flower.yellow, n: 12 }, { x: -18.0, z: 12.0, hue: PAL.flower.white, n: 14 },
        { x: -7.0, z: 17.6, hue: PAL.flower.pink, n: 12 }, { x: 9.0, z: -18.6, hue: PAL.flower.blue, n: 12 },
        { x: -20.0, z: -16.0, hue: PAL.flower.white, n: 12 }, { x: 24.0, z: 6.0, hue: PAL.flower.yellow, n: 10 },
      ];
      const fr = mulberry(808);
      for (let i = 0; i < 18; i++) cl.push({ x: (fr() - 0.5) * 54, z: (fr() - 0.5) * 46, hue: hues[(fr() * hues.length) | 0] });
      kit.flowers(cl, { accept: (x, z) => onGrass(x, z) && pathAt(x, z) < 0.2 });
    });

    // ── the ground, last: it samples the finished AO and shade masks ──
    buildGround(scene, { heightAt, masks: L.masks, ao, shade, inner: 33, step: 1.0, outer: 132, rings: 8 });

    // ── the sky's small stories ──
    safe('birds', () => kit.birds(4, { centre: [0, 0], height: 13, radius: 20, seed: 71 }));
    safe('highfeather', () => kit.skyCastle({ azimuth: -1.35, elevation: 0.13, distance: 720, size: 112, opacity: 0.86, tintFrom: sky && sky.clouds ? sky.clouds.material : null }));

    // ── life: smoke from every chimney, butterflies on the green, sparrows at the bakery ──
    safe('smoke', () => kit.smoke(Object.values(recs).flatMap(r => (r && r.chimneyTops) || []).filter(Boolean)));
    safe('butterflies', () => kit.butterflies([{ x: -4.6, z: 5.0, hue: PAL.flower.yellow }, { x: 4.0, z: 9.2, hue: PAL.char.white },
      { x: -0.6, z: 1.6, hue: PAL.flower.pink }, { x: 8.0, z: 13.0, hue: PAL.flower.yellow }]));
    safe('sparrows', () => (kit.groundBirds ? kit.groundBirds([{ x: -7.4, z: -4.6 }, { x: 2.6, z: 7.6 }, { x: 12.4, z: 1.0 }], { seed: 19 }) : null));

    // ── doors knock when they open ──
    kit.onDoor = (d) => { try { Sfx.play('door_open', { vol: 0.42 }); } catch (e) { reportError('puddlewick door sfx', e); } void d; };

    // ── the flock (only if the people layer has not brought its own sheep) ──
    let flock = null, flockState = [];
    if (!map.npcs.some(n => n && (n.char === 'sheep' || n.type === 'sheep'))) {
      safe('sheep', () => {
        const sg = sheepGeometry();
        const c = kit.critters({ name: 'sheep', body: sg.body, head: sg.head, headAt: sg.headAt, count: L.sheep.length, outline: 0.022,
          headOutline: false, bounds: { x: L.penCentre.x, y: heightAt(L.penCentre.x, L.penCentre.z) + 0.6, z: L.penCentre.z, r: L.penCentre.r + 4 } });
        const rnd = mulberry(4242);
        flockState = L.sheep.map((s, i) => ({ ...s, tx: s.x, tz: s.z, mode: 'graze', timer: 1 + rnd() * 4, pitch: 0.7, ph: rnd() * TAU, walk: 0, id: i, rnd }));
        flock = c;
      });
    }
    const sheepProps = map.props.filter(p => p.type === 'sheep');

    const buildMs = Math.round(performance.now() - t0);
    return {
      sky,
      update(t, dt, c) {
        const cam = c && c.camera;
        if (sky && sky.sky && cam) sky.sky.position.copy(cam.position);
        if (sky && sky.clouds) sky.clouds.rotation.y = t * 0.003;
        kit.update(t, dt, cam, c && c.player);
        if (flock) {
          const rnd = mulberry(Math.floor(t * 1000) % 99991);
          for (const s of flockState) {
            s.timer -= dt;
            if (s.mode === 'graze' && s.timer <= 0) { s.mode = 'look'; s.timer = 1.2 + rnd() * 2.2; }
            else if (s.mode === 'look' && s.timer <= 0) {
              const a = rnd() * TAU, d = Math.sqrt(rnd()) * L.penCentre.r;
              s.tx = L.penCentre.x + Math.cos(a) * d; s.tz = L.penCentre.z + Math.sin(a) * d; s.mode = 'walk';
            } else if (s.mode === 'walk') {
              const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
              if (d < 0.15) { s.mode = 'graze'; s.timer = 3 + rnd() * 5; }
              else {
                const want = Math.atan2(dx, dz); s.yaw += angDiff(want, s.yaw) * Math.min(1, dt * 3);
                const v = Math.min(0.5, d) * dt; s.x += Math.sin(s.yaw) * v; s.z += Math.cos(s.yaw) * v; s.walk += dt * 7;
              }
            }
            const pitchT = s.mode === 'graze' ? 0.75 + Math.sin(t * 5 + s.ph) * 0.06 : s.mode === 'look' ? -0.12 : 0.18;
            s.pitch += (pitchT - s.pitch) * Math.min(1, dt * 4);
            const hop = s.mode === 'walk' ? Math.abs(Math.sin(s.walk)) * 0.05 : 0;
            const gy = heightAt(s.x, s.z);
            flock.set(s.id, s.x, gy + hop, s.z, s.yaw, s.pitch, s.mode === 'look' ? Math.sin(t * 1.3 + s.ph) * 0.5 : 0, 1, Math.sin(t * 2 + s.ph) * 0.015);
            if (blobs && s.id + 1 < blobs.capacity) blobs.set(s.id + 1, s.x, gy, s.z, 1.25 - hop, 1.2);
            if (sheepProps[s.id]) { sheepProps[s.id].x = s.x; sheepProps[s.id].z = s.z; }
          }
          flock.commit();
        }
      },
      state() {
        return { buildMs, counts: Object.assign({}, kit.counts), buildings: kit.buildingState ? kit.buildingState() : null,
          bridge: { x: +L.bridge.cx.toFixed(2), z: +L.bridge.cz.toFixed(2) }, sheep: flockState.length, see: Object.assign({}, kit.seeState) };
      },
      dispose() { kit.onDoor = null; },
      kit,
    };
  },
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// colliders, interactables, exits and spots — built from the same layout the art uses
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function furnish() {
  const L = layout();
  if (L.exits) return L;
  const P = L.plots;
  const C = [], props = [], exits = [], occ = [];

  L.spots = { doors: {}, containers: [] };
  const chests = [];

  for (const o of L.plotList) {
    const d = doorOf(o), kind = d.kind, [bw, bd] = d.size;
    C.push({ type: 'box', x: o.x, z: o.z, w: bw + 0.3, d: bd + 0.3, rot: o.rot, tag: kind });
    // Two spheres, not one: a single ball at eaves height leaves the lens free to slide in at ground level
    // through the corners of the footprint, which is how the camera kept ending up INSIDE a cottage.
    {
      const gy = heightAt(o.x, o.z), rad = Math.hypot(bw, bd) / 2;
      const topY = gy + (kind === 'inn' ? 5.6 : kind === 'church' ? 6.4 : kind === 'barn' ? 4.4 : 4.0);
      occ.push({ type: 'sphere', x: o.x, y: gy + (topY - gy) * 0.34, z: o.z, r: rad });
      occ.push({ type: 'sphere', x: o.x, y: gy + (topY - gy) * 0.78, z: o.z, r: rad * 0.92 });
    }
    // A door whose interior EXISTS (src/world/maps/<id>.js, listed in maps/index.js) carries no tx/tz, so the
    // room's own spawn decides where you land — the interior owns its doorstep. A door whose room is not built
    // yet keeps tx/tz and `back`, so it speaks its line and steps you back out (src/world/field.js onExit).
    // ...and a door whose room is one of P06's eight (src/world/maps/int_*.js) points at that room id instead of
    // at the plot id. Every one of the ten doors on the green is now real, so `built` is never false here.
    //
    // Built interiors: NO walk-in exit pad. Accidental steps kept swallowing a child into a house (owner
    // 2026-09-25). Enter only by pressing Confirm / Z on the door prop below. Unbuilt doors still keep a
    // speak-and-step-back exit so the jamb is not a silent wall.
    //
    // Return landing for interiors is `spur` (3.1 m out), facing the green — clear of any door interact.
    const room = ROOM_OF[o.id] || o.id;
    const built = BUILT_INTERIORS.has(o.id) || !!ROOM_OF[o.id];
    L.spots.doors[o.id] = { x: d.spur.x, z: d.spur.z, facing: d.face + Math.PI };
    if (!built) {
      const depth = 1.0, along = 0.85, across = Math.max(1.15, d.dw + 0.35);
      const anx = Math.abs(d.nx), anz = Math.abs(d.nz);
      exits.push({
        x: d.doorway.x + d.nx * depth, z: d.doorway.z + d.nz * depth,
        w: along * anx + across * anz, h: along * anz + across * anx,
        to: room, kind: 'door', name: o.name || o.id, line: 'door-' + o.id,
        back: { x: d.spur.x, z: d.spur.z }, tx: d.spur.x, tz: d.spur.z,
        facing: d.face + Math.PI,
      });
    } else {
      const dest = room;
      const doorId = o.id;
      // Interact on the doorstep (far). Confirm opens the leaf, then the room loads.
      props.push({
        type: 'door', name: o.name || 'the door', solid: false,
        x: d.far.x, z: d.far.z, doorId,
        reach: 2.8, height: 2.15,
        talk({ field }) {
          try {
            const w = field.world && field.world();
            const kit = w && w.view && w.view.kit;
            // setDoor(1) swings the leaf; kit.onDoor plays the knock. Then the room loads.
            if (kit && typeof kit.setDoor === 'function') kit.setDoor(doorId, 1);
            else { try { Sfx.play('door_open', { vol: 0.5 }); } catch (e) { reportError('puddlewick: door sfx', e); } }
            setTimeout(() => {
              try { field.teleport(dest); } catch (e) { reportError('puddlewick: door in ' + dest, e); }
            }, 320);
          } catch (e) { reportError('puddlewick: door in ' + dest, e); }
          return null;
        },
      });
    }
  }
  // the chapel's tower is its own block, and the bakery's oven sticks out
  C.push({ type: 'box', x: at(P.chapel, 4.15, 9.2 / 2 - 1.55).x, z: at(P.chapel, 4.15, 9.2 / 2 - 1.55).z, w: 3.2, d: 3.2, rot: P.chapel.rot, tag: 'tower' });
  C.push({ type: 'box', x: at(P.bakery, 5.6 / 2 + 0.85, -0.2).x, z: at(P.bakery, 5.6 / 2 + 0.85, -0.2).z, w: 2.0, d: 2.0, rot: P.bakery.rot, tag: 'oven' });
  C.push({ type: 'circle', x: at(P.mill, 4.8 / 2 + 0.62, 0).x, z: at(P.mill, 4.8 / 2 + 0.62, 0).z, r: 1.0, tag: 'wheel' });

  // the well, the trees, the rocks, the fences, the furniture
  C.push({ type: 'circle', x: L.well.x, z: L.well.z, r: 1.25, tag: 'well' });
  C.push({ type: 'circle', x: L.maypole.x, z: L.maypole.z, r: 0.35, tag: 'maypole' });
  C.push({ type: 'circle', x: L.sign.x, z: L.sign.z, r: 0.22, tag: 'sign' });
  C.push({ type: 'circle', x: L.pot.x, z: L.pot.z, r: 0.42, tag: 'pot' });
  C.push({ type: 'circle', x: L.alleyPot.x, z: L.alleyPot.z, r: 0.4, tag: 'pot' });
  for (const t of L.trees) C.push({ type: 'circle', x: t.x, z: t.z, r: (t.kind === 'chestnut' ? 0.62 : 0.32) * (t.s || 1), tag: 'tree' });
  for (const b of L.bushes) C.push({ type: 'circle', x: b.x, z: b.z, r: 0.6 * b.s, tag: 'bush' });
  for (const r of L.rocks) C.push({ type: 'circle', x: r.x, z: r.z, r: 0.58 * r.s, tag: 'rock' });
  for (const s of L.shrine) C.push({ type: 'circle', x: s.x, z: s.z, r: 0.55, tag: 'stone' });
  for (const b of L.barrels) C.push({ type: 'circle', x: b.x, z: b.z, r: 0.42 * b.s, tag: 'barrel' });
  for (const c of L.crates) C.push({ type: 'box', x: c.x, z: c.z, w: 0.82, d: 0.82, rot: c.rot, tag: 'crate' });
  for (const s of L.stalls) C.push({ type: 'box', x: s.x, z: s.z, w: 2.9, d: 1.8, rot: s.rot, tag: 'stall' });
  for (const b of L.benches) C.push({ type: 'box', x: b.x, z: b.z, w: 1.8, d: 0.55, rot: b.rot, tag: 'bench' });
  C.push({ type: 'box', x: L.shrineBench.x, z: L.shrineBench.z, w: 1.8, d: 0.55, rot: L.shrineBench.rot, tag: 'bench' });
  C.push({ type: 'box', x: L.trestle.x, z: L.trestle.z, w: 2.6, d: 0.95, rot: L.trestle.rot, tag: 'trestle' });
  C.push({ type: 'box', x: L.woodpile.x, z: L.woodpile.z, w: 2.0, d: 1.2, rot: L.woodpile.rot, tag: 'woodpile' });
  C.push({ type: 'box', x: L.notice.x, z: L.notice.z, w: 1.5, d: 0.5, rot: L.notice.rot, tag: 'notice' });
  for (const p of L.laundry) C.push({ type: 'circle', x: p[0], z: p[1], r: 0.12, tag: 'post' });
  for (const h of L.hay) C.push({ type: 'box', x: h.x, z: h.z, w: 1.2, d: 0.9, rot: h.rot, tag: 'hay' });
  for (const s of L.sacks) C.push({ type: 'circle', x: s.x, z: s.z, r: 0.66, tag: 'sacks' });
  // the fences: the pen's gate is a gap you can walk through (the gate swings for you)
  const penA = L.pen.slice(0, 2), penB = L.pen.slice(1);
  C.push({ type: 'capsule', pts: [[-29, 6.5], [-20.5, 5.4]], r: 0.12, tag: 'fence' });
  C.push({ type: 'capsule', pts: [[-20.5, 5.4], [-20.2, 8.2]], r: 0.12, tag: 'fence' });
  C.push({ type: 'capsule', pts: [[-19.9, 10.6], [-19.6, 13.4], [-28.6, 15.0], [-29, 6.5]], r: 0.12, tag: 'fence' });
  C.push({ type: 'capsule', pts: L.paddock, r: 0.12, tag: 'fence' });
  C.push({ type: 'capsule', pts: L.picket, r: 0.08, tag: 'picket' });
  C.push({ type: 'capsule', pts: L.wall, r: 0.26, tag: 'wall' });
  C.push({ type: 'circle', x: L.stile.x, z: L.stile.z, r: 0.3, tag: 'stile' });
  C.push({ type: 'capsule', pts: [[16.0, -4.4], [18.6, -3.4], [19.2, -1.0]], r: 0.12, tag: 'fence' });
  for (const rail of L.bridge.rails) C.push({ type: 'capsule', pts: rail, r: 0.12, tag: 'bridge-rail' });
  void penA; void penB;

  // canopy occluders, so the follow camera never hides behind a tree
  for (const t of L.trees) occ.push({ type: 'sphere', x: t.x, y: heightRaw(t.x, t.z) + 3.0 * (t.s || 1), z: t.z, r: 1.9 * (t.s || 1) });

  // ── interactables (the words are the `lines` above, or the people layer's) ──
  const prop = (type, name, x, z, line, o = {}) => props.push(Object.assign({ type, name, x, z, line }, o));
  // the signpost at the gate: a child who stops BESIDE it on the lane, not nose to it, must still be able to read
  // it, so its reach is the width of the lane (3.6) rather than arm's length (2.4).
  prop('sign', 'signpost', L.sign.x, L.sign.z, 'signpost', { reach: 3.6, height: 2.55 });
  prop('well', 'the well', L.well.x, L.well.z, 'well', { reach: 2.4, height: 2.6 });
  prop('tree', 'the chestnut tree', L.chestnut.x, L.chestnut.z, 'chestnut', { reach: 3.0, height: 4.2 });
  prop('sign', 'the noticeboard', L.notice.x, L.notice.z, 'notice', { reach: 2.2, height: 2.3 });
  prop('shrine', 'the shrine of Saint Alden', L.shrine[1].x, L.shrine[1].z + 1.0, 'shrine', { reach: 2.6, height: 2.7 });
  prop('wall', 'the low wall', L.wall[1][0], L.wall[1][1], 'wall', { reach: 2.0, height: 1.2 });
  prop('maypole', 'the maypole', L.maypole.x, L.maypole.z, 'maypole', { reach: 2.2, height: 3.0 });
  prop('table', 'the pies', L.trestle.x, L.trestle.z, 'pies', { reach: 2.0, height: 1.4 });
  prop('stall', 'a market stall', L.stalls[0].x, L.stalls[0].z, 'stall', { reach: 2.2, height: 2.4 });
  prop('bridge', 'the bridge', L.bridge.cx, L.bridge.cz, 'bridge', { reach: 2.6, height: 1.6 });
  prop('water', 'the Beck', -6.0, -11.6, 'beck', { reach: 2.4, height: 1.2 });
  prop('gate', 'the sheep gate', L.penGate.x, L.penGate.z, 'pen-gate', { reach: 2.2, height: 1.6 });
  prop('gate', 'the paddock', L.paddockCentre.x + 2.0, L.paddockCentre.z, 'paddock', { reach: 2.4, height: 1.6 });
  prop('pot', 'a pot on the green', L.pot.x, L.pot.z, 'cactuddle-pot', { reach: 1.8, height: 1.1 });
  prop('barrel', 'a rain barrel', L.barrels[0].x, L.barrels[0].z, 'barrel', { reach: 1.7, height: 1.5 });
  prop('barrel', 'a rain barrel', L.barrels[2].x, L.barrels[2].z, 'barrel', { reach: 1.7, height: 1.5 });
  prop('pot', 'a pot at the dead end', L.alleyPot.x, L.alleyPot.z, 'alley-pot', { reach: 1.7, height: 1.2 });
  L.sheep.forEach((s, i) => prop('sheep', 'sheep ' + (i + 1), s.x, s.z, 'sheep', { reach: 4.2, height: 1.75, animal: i }));
  // the mill wheel and the signs, where you can reach them
  {
    const wheel = at(P.mill, 4.8 / 2 + 0.62, 0);
    prop('wheel', 'the mill wheel', wheel.x, wheel.z + 1.6, 'mill-wheel', { reach: 2.6, height: 2.6 });
    const innSign = at(P.inn, 8.2 / 2 - 0.45, 5.4 / 2 + 1.1);
    prop('sign', 'the inn sign', innSign.x, innSign.z, 'inn-sign', { reach: 2.2, height: 3.4 });
    const shopSign = at(P.shop, 6.4 / 2 - 0.45, 4.5 / 2 + 1.1);
    prop('sign', 'the shop sign', shopSign.x, shopSign.z, 'shop-sign', { reach: 2.2, height: 3.0 });
    const bakeSign = at(P.bakery, -(5.6 / 2 - 0.45), 4.3 / 2 + 1.1);
    prop('sign', 'the bakery sign', bakeSign.x, bakeSign.z, 'bakery-sign', { reach: 2.2, height: 3.0 });
  }

  // ── the way out: down the lane to Puddlewick Vale (the meadow) ──
  // The meadow's own village-lane exit triggers over z = -33.1..-28.9 at x = 14.8..19.0, so we land at (14.5, -25.6)
  // — 3.3 units back down its lane — and the meadow's exit lands us at this map's spawn (14.8, 23.4), 2.6 clear of
  // the trigger below. Walking out and walking back in are therefore both one clean step, never a bounce.
  // Facing 0 rad = +z = south into the vale. Pad sits on the gate lane past the rim; w/h are generous so a
  // child walking a little off-centre still trips the exit (shots/P24-angles: narrow headings used to miss).
  exits.push({ x: 16.0, z: 26.8, w: 7.2, h: 4.4, to: 'meadow', tx: 14.5, tz: -25.6, facing: 0, kind: 'edge',
    name: 'the lane out of Puddlewick', line: 'lane-out', back: { x: 14.8, z: 23.4 } });

  // ── spots: where the people, the animals and the wagon go (P11 / P16 / P18 read these) ──
  const s = L.spots;
  s.hob = { x: L.well.x - 1.5, z: L.well.z + 0.9, facing: Math.atan2(1.5, -0.9) };
  s.nan = { x: s.doors.puddlewick_bakery.x + 2.2, z: s.doors.puddlewick_bakery.z + 1.6, facing: s.doors.puddlewick_bakery.facing };
  s.barty = { x: s.doors.hollybank.x + 1.8, z: s.doors.hollybank.z + 1.4, facing: s.doors.hollybank.facing };
  s.dot = { x: -1.6, z: 8.4, facing: 1.2 };
  s.bel = { x: 1.2, z: 10.4, facing: -2.0 };
  s.play = [{ x: -1.6, z: 8.4 }, { x: 1.2, z: 10.4 }, { x: 3.0, z: 7.0 }];
  s.halvard = { x: 10.6, z: 17.2, facing: Math.atan2(-2.0, -3.0) };
  s.wagon = { x: 12.4, z: 20.4, facing: Math.atan2(2.2, 3.2) };
  s.innkeeper = { x: s.doors.puddlewick_inn.x - 2.4, z: s.doors.puddlewick_inn.z + 1.6, facing: s.doors.puddlewick_inn.facing };
  s.shopkeeper = { x: s.doors.puddlewick_shop.x + 1.8, z: s.doors.puddlewick_shop.z + 2.2, facing: s.doors.puddlewick_shop.facing };
  s.smithBoy = { x: L.crates[0].x - 1.2, z: L.crates[0].z + 0.6, facing: -1.4 };
  // Watchman Nodd used to stand at (14.8, 22.6) — dead centre of the gate lane, four metres in front of a child
  // the instant they arrive, filling the middle third of the very first frame of the village. He now leans on
  // the grass on the east verge and watches the lane, so the first thing you see is Puddlewick.
  s.gateGuard = { x: 18.2, z: 21.8, facing: Math.atan2(13.6 - 18.2, 22.0 - 21.8) };
  s.deacon = { x: s.doors.puddlewick_chapel.x - 2.2, z: s.doors.puddlewick_chapel.z + 1.8, facing: s.doors.puddlewick_chapel.facing };
  s.cat = { x: at(P.bakery, 5.6 / 2 + 0.85, -0.2).x, y: heightRaw(P.bakery.x, P.bakery.z) + 1.15, z: at(P.bakery, 5.6 / 2 + 0.85, -0.2).z };
  s.duck = { x: L.well.x + 1.6, z: L.well.z + 1.2 };
  s.cactuddle = { x: L.pot.x, z: L.pot.z };
  s.sheep = L.sheep.map(p => ({ x: p.x, z: p.z }));
  s.pen = { x: L.penCentre.x, z: L.penCentre.z, r: L.penCentre.r };
  s.paddock = { x: L.paddockCentre.x, z: L.paddockCentre.z, r: L.paddockCentre.r };
  s.green = { x: GREEN.x, z: GREEN.z, rx: GREEN.rx, rz: GREEN.rz };
  s.containers = [{ x: L.alleyPot.x, z: L.alleyPot.z, kind: 'pot', note: 'the dead-end pot: always full (WORLD-BIBLE §5)' },
    ...L.barrels.map(b => ({ x: b.x, z: b.z, kind: 'barrel' })), ...L.crates.map(c => ({ x: c.x, z: c.z, kind: 'crate' })),
    { x: L.well.x, z: L.well.z, kind: 'well' }, { x: L.woodpile.x, z: L.woodpile.z, kind: 'woodpile' }];

  // ── things worth searching (DISCOVERY): the village reported 0 containers with 51 interactables, so a child
  // could talk to Puddlewick but never FIND anything in it. Five to start with, each somewhere a child would
  // actually poke. P30 may replace or extend these from src/world/maps/puddlewick.chests.js.
  chests.push(
    { id: 'pw_crate_shop', x: L.crates[0].x, z: L.crates[0].z, kind: 'crate', name: 'a crate behind the shop', line: 'search-crate-shop', reach: 1.6 },
    { id: 'pw_crate_mill', x: L.crates[2].x, z: L.crates[2].z, kind: 'crate', name: 'a crate by the mill', line: 'search-crate-mill', reach: 1.6 },
    { id: 'pw_sacks', x: L.sacks[0].x, z: L.sacks[0].z, kind: 'sacks', name: 'the flour sacks', line: 'search-sacks', reach: 1.7 },
    { id: 'pw_hay', x: L.hay[0].x, z: L.hay[0].z, kind: 'hay', name: 'the hay', line: 'search-hay', reach: 1.7 },
    { id: 'pw_barrel_mill', x: L.barrels[3].x, z: L.barrels[3].z, kind: 'barrel', name: 'a barrel at the mill', line: 'search-barrel-mill', reach: 1.6 },
  );
  L.chests = chests;
  L.colliders = C;
  L.props = props;
  L.exits = exits;
  L.occluders = occ;
  return L;
}

/**
 * Where an interior's door puts you back down in the village. The interiors (src/world/maps/hollybank.js,
 * puddlewick_inn.js) read this instead of copying numbers, so a plot that moves takes its doorstep with it.
 */
export function puddlewickDoorstep(id) {
  try {
    const d = furnish().spots.doors[id];
    if (d && Number.isFinite(+d.x)) return { x: +d.x, z: +d.z, facing: +d.facing || 0 };
  } catch (e) { reportError('puddlewickDoorstep', e); }
  return { x: puddlewick.spawn.x, z: puddlewick.spawn.z, facing: puddlewick.spawn.facing || 0 };
}

/** Where everything is, for scenarios, critics and the people who fill this map (read-only). */
export function puddlewickLayout() {
  const L = furnish();
  return {
    green: { ...GREEN }, well: { ...L.well }, chestnut: { ...L.chestnut }, bridge: { x: L.bridge.cx, z: L.bridge.cz, dir: L.bridge.dir },
    sign: { ...L.sign }, spawn: { ...puddlewick.spawn },
    buildings: L.plotList.map(p => ({ id: p.id, kind: p.kind || 'cottage', x: p.x, z: p.z, rot: +p.rot.toFixed(3), name: p.name })),
    doors: L.spots.doors, spots: L.spots,
    exits: L.exits.map(e => ({ name: e.name, to: e.to, x: +e.x.toFixed(2), z: +e.z.toFixed(2) })),
  };
}

export default puddlewick;
