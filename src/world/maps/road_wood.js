/**
 * road_wood.js — THE WHISPERING WOOD: the lane from Saltmarrow to Cobwell Manor's gates.     (P23B base map)
 *
 * WORLD-BIBLE §1 T2: "Puddlewick Vale <-> Whispering Wood — none, but Cobwell Manor's door is barred until
 * Willow's dare." The wood is region `TT` on the schematic, north of Saltmarrow and west of the road — the one
 * place in Act I where the trees close over the lane, the light goes green, and a child keeps walking because
 * Willow is whistling one bend ahead.
 *
 * It is the same land as the Beck road with three things changed, which is all a wood is: the trees come INSIDE
 * (a hundred and forty of them, thickest where the lane bends), the encounter table is the wood's own, and the
 * skyline is shut — no painted towns, only the crest of the hills and, at the north end, ONE LIT WINDOW in a
 * black house (WORLD-BIBLE §2 [04]: "a single lit window in a black house, visible from the Vale road at night").
 *
 * Coordinates: world units, centred (origin [-30, -28], 60 x 56 tiles). You come in from the SOUTH (Saltmarrow)
 * and the manor gates are at the NORTH.
 */
import { outdoorMap, marks, PAL, mulberry, smooth, vnoise, THREE } from './road_common.js';

const LANE = [[-0.6, 24], [-1.4, 19], [0.6, 14.4], [3.4, 10.0], [2.6, 5.0], [-0.8, 0.6],
  [-3.0, -4.6], [-2.2, -10.0], [-0.6, -15.0], [0, -20.0], [0, -24]];
/** The dead end every wood needs: a deer path to a clearing with a standing stone in it. */
const DEER = [[2.8, 7.4], [8.0, 6.0], [13.0, 3.6], [16.6, 0.2]];
/** The other one, west, to the charcoal burner's ring. */
const BURNER = [[-2.4, -6.0], [-8.0, -7.6], [-13.4, -9.8], [-16.4, -13.0]];

const SOUTH = { x: 0, z: 23.2 };
const NORTH = { x: 0, z: -23.2 };
export const WOOD_SOUTH_LANDING = { x: -0.6, z: 20.0, facing: Math.PI };
export const WOOD_NORTH_LANDING = { x: 0, z: -19.6, facing: 0 };

const CLEARING = { x: 16.4, z: 0.0 };
const RING = { x: -16.2, z: -13.2 };

const wood = outdoorMap({
  id: 'road_wood',
  name: 'The Whispering Wood',
  kind: 'field',
  size: [60, 56],
  ax: 26, az: 24,
  seed: 59,
  theme: 'grass',
  music: 'overworld',                        // CANON §9 — still the travelling theme; the manor brings 'dungeon'
  ambience: 'amb_meadow',
  hours: 16.5,                               // late afternoon under a canopy: the green light the wood is for
  spawn: { x: WOOD_SOUTH_LANDING.x, z: WOOD_SOUTH_LANDING.z, facing: Math.PI },
  camera: { orbit: 180, pitch: 25, dist: 10.0, fov: 50, lookUp: 2.5 },
  // `TT` forest: the full rate, on the children's own table (tests/battle/areas.js whispering_wood)
  encounters: { rate: 1.0, table: [['toadstooligan', 4], ['twiglet', 2], ['batterfly', 2], ['hoot_couture', 2],
    ['grumpleroot', 2], ['flapjack', 2], ['sir_gloopalot', 1]] },
  // the wood's skyline is the wood: only Saltmarrow, low and small, back the way you came
  landmarks: marks([{ id: 'saltmarrow', az: 0.06, haze: 0.2 }]),

  lanes: [{ pts: LANE, w: 2.3 }, { pts: DEER, w: 1.3, falloff: 0.8 }, { pts: BURNER, w: 1.3, falloff: 0.8 }],
  hills: [{ x: -14, z: 8, r: 11, h: 1.8 }, { x: 15, z: -14, r: 10, h: 2.0 }, { x: 18, z: 12, r: 9, h: 1.4 }],
  rim: { radius: 27, rows: 3, rowGap: 5.6, seed: 929, threshold: 0.14 },
  rimH: 2.6, rimAmp: 5.4,
  exits: [
    { x: SOUTH.x, z: SOUTH.z, w: 9.0, h: 2.6, to: 'saltmarrow', tx: -2.9, tz: -14.4, kind: 'edge',
      name: 'the lane back down to Saltmarrow', line: 'lane-south', back: { x: -0.6, z: 20.4 } },
    { x: NORTH.x, z: NORTH.z, w: 7.0, h: 3.0, to: 'cobwell_manor', tx: 0, tz: 16.6, kind: 'door',
      notch: 0.7, name: 'the gates of Cobwell Manor', line: 'manor-gate', back: { x: 0, z: -19.6 } },
  ],

  spots: {
    clearing: CLEARING, ring: RING,
    sign: { x: 2.2, z: 8.2 },
    signNorth: { x: 1.8, z: -17.0 },
    gates: { x: 0, z: -21.6 },
    willow: { x: -1.0, z: 12.0, facing: Math.PI },
    burner: { x: -15.0, z: -12.4, facing: Math.PI * 1.4 },
    hermit: { x: 15.4, z: 1.2, facing: Math.PI * 0.6 },
    stone: { x: CLEARING.x, z: CLEARING.z },
    containers: [{ x: -14.2, z: -11.4, kind: 'crate' }, { x: 14.6, z: 1.8, kind: 'log' }, { x: 1.2, z: -18.4, kind: 'pot' }],
  },

  props: [
    { type: 'sign', name: 'the signpost in the wood', x: 2.2, z: 8.2, line: 'sign', reach: 3.4, height: 2.4 },
    { type: 'sign', name: 'the last signpost', x: 1.8, z: -17.0, line: 'sign-north', reach: 3.4, height: 2.2 },
    { type: 'gate', name: 'the manor gates', x: 0, z: -20.8, line: 'gates', reach: 2.6, height: 3.2 },
    { type: 'stone', name: 'the standing stone', x: CLEARING.x, z: CLEARING.z + 1.4, line: 'stone', reach: 2.2, height: 2.2 },
    { type: 'log', name: 'a hollow log', x: 14.6, z: 1.8, line: 'hollow-log', reach: 1.9, height: 0.8 },
    { type: 'fire', name: 'the charcoal ring', x: RING.x + 1.4, z: RING.z + 0.6, line: 'ring', reach: 2.2, height: 1.0 },
    { type: 'tree', name: 'the whispering trees', x: -4.4, z: 3.0, line: 'trees', reach: 2.6, height: 3.0 },
  ],

  colliders: [
    { type: 'circle', x: CLEARING.x, z: CLEARING.z, r: 0.6, tag: 'standing-stone' },
  ],

  lines: {
    'lane-south': 'Down the lane, out of the trees,\nand the sea comes back into\nthe air.',
    'manor-gate': 'Through the gates, up the drive,\nand under the porch.',
    sign: ['{gold}COBWELL MANOR{/gold} — north, and\ndo not.\n{gold}SALTMARROW{/gold} — south, and do.',
      'Somebody has added, in chalk:\n"I did. — W.P."'],
    'sign-north': ['{gold}COBWELL MANOR{/gold}\nPrivate. Madam is not receiving.',
      'Under that, much newer, in a\nsmall careful hand: "she never\nwas."'],
    gates: ['Iron gates, open, with a stone\nlark on each post. One lark has\nlost its head.',
      'Up the drive there is a black\nhouse with exactly one window\nlit.'],
    stone: ['A grey stone, taller than a man,\nstanding on its own in a\nclearing that is too round.',
      'Cut into it, worn nearly away:\na lark.'],
    'hollow-log': ['A log you could get inside, and\nsomebody has, because there is a\ncushion in it.'],
    ring: ['A ring of stones, warm, with a\nturf-covered heap of charcoal\nbeside it.',
      'The charcoal burner sleeps out\nhere for a fortnight at a time\nand talks to the heap.'],
    trees: ['Oaks, and the wind in them a\nlong way up, so the sound\narrives after the movement.',
      'That is all the whispering is.\nProbably.'],
  },

  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  // set dressing
  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  dress(kit, L) {
    const r = mulberry(6151);
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const M = (x, y, z, rot = 0) => new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);

    // ── THE WOOD. A hundred and forty trees inside the playable edge, thickest away from the lane, thinning to
    //    a clearing at each dead end. Noise decides where a clump is; the lane and the dead ends are always open.
    const trees = [];
    const KINDS = ['oak', 'edge', 'oak', 'birch', 'round', 'edge', 'poplar'];
    for (let k = 0; k < 900 && trees.length < 150; k++) {
      const px = (r() - 0.5) * 50, pz = (r() - 0.5) * 46;
      if (L.edgeR(px, pz) > 0.95) continue;
      if (L.masks.sample(0, px, pz) > 0.16) continue;                     // never on a path
      if (Math.hypot(px - CLEARING.x, pz - CLEARING.z) < 5.5) continue;   // the round clearing
      if (Math.hypot(px - RING.x, pz - RING.z) < 4.5) continue;           // the burner's ring
      if (pz < -19 && Math.abs(px) < 6) continue;                         // the drive up to the gates
      const clump = vnoise(px * 0.09 + 3.1, pz * 0.09 + 7.7, 51);
      if (r() > 0.25 + smooth(0.34, 0.78, clump) * 0.75) continue;
      trees.push({ kind: KINDS[(r() * KINDS.length) | 0], x: px, z: pz, s: 0.85 + r() * 0.7, r: r() * 6.28 });
    }
    kit.trees(trees);

    // ── the floor of a wood: brackens, brambles, stumps, logs, mushrooms, molehills ──
    for (let k = 0; k < 90; k++) {
      const px = (r() - 0.5) * 48, pz = (r() - 0.5) * 44;
      if (L.edgeR(px, pz) > 0.96 || L.masks.sample(0, px, pz) > 0.3) continue;
      const pick = (r() * 6) | 0;
      if (pick === 0) kit.bracken(px, pz, { s: 0.85 + r() * 0.5, seed: k * 13 });
      else if (pick === 1) kit.brambles(px, pz, { s: 0.85 + r() * 0.5, seed: k * 17 });
      else if (pick === 2) kit.stump(px, pz, r() * 3, { s: 0.75 + r() * 0.4, seed: k * 19 });
      else if (pick === 3) kit.mushrooms(px, pz, 3 + (k % 5), k * 23, 0.5 + r() * 0.5);
      else if (pick === 4) kit.fallenLog(px, pz, r() * 3, { len: 2.2 + r() * 1.8, rad: 0.22 + r() * 0.14, seed: k * 29 });
      else kit.rock(px, pz, 0.4 + r() * 0.5, (k * 31) | 0, { sink: 0.4 });
    }
    for (const [mx, mz] of [[-3.6, 2.0], [-2.8, 1.2], [3.8, -8.0]]) kit.molehill(mx, mz, { s: 1, seed: (mx * 7) | 0 });

    // ── the signposts and the manor gates ──
    const atlas = kit.useSignAtlas(kit.signAtlas(['Cobwell Manor', 'Saltmarrow', 'The clearing']));
    kit.signpost(atlas, 2.2, 8.2, [{ label: 'Cobwell Manor', dir: Math.PI }, { label: 'Saltmarrow', dir: 0 },
      { label: 'The clearing', dir: Math.PI / 2 }]);
    kit.signpost(atlas, 1.8, -17.0, [{ label: 'Cobwell Manor', dir: Math.PI }], { h: 1.6 });
    // the gates: two stone posts with a lark on each, and iron leaves standing open
    for (const s of [-1, 1]) {
      const gx = s * 2.1, gz = -21.4, gy = kit.lowestAt(gx, gz, 0.6, 5);
      kit.addTo('stone', B(1.0, 3.0, 1.0), M(gx, gy + 1.5, gz), PAL.stone.mid);
      kit.addTo('stone', new THREE.ConeGeometry(0.7, 0.5, 4), M(gx, gy + 3.2, gz, Math.PI / 4), PAL.stone.light);
      if (s > 0) kit.addTo('stone', new THREE.SphereGeometry(0.28, 9, 7), M(gx, gy + 3.7, gz), PAL.stone.light);
      // the iron leaf, swung back against the wall
      for (let k = 0; k < 6; k++) kit.addTo('paint', B(0.06, 2.3, 0.06), M(gx + s * (0.7 + k * 0.28), gy + 1.3, gz - 0.5, 0), PAL.paint.iron);
      kit.addTo('paint', B(0.08, 0.08, 1.9), M(gx + s * 1.5, gy + 2.3, gz - 0.5, Math.PI / 2), PAL.paint.iron);
      kit.contact(gx, gz, 1.0, 0.75);
      kit.footBox(gx, gz, 1.4, 1.4, 0);
    }
    // ── the ONE LIT WINDOW in a black house, up the drive: the landmark of WORLD-BIBLE §2 [04] ──
    {
      const hx = 0, hz = -27.5, hy = kit.lowestAt(0, -26, 2, 5) + 1.0;
      kit.addTo('stone', B(11.0, 8.0, 6.0), M(hx, hy + 4.0, hz), PAL.interior.dark);
      kit.addTo('stone', new THREE.ConeGeometry(8.0, 3.4, 4), M(hx, hy + 9.6, hz, Math.PI / 4), PAL.interior.dark);
      kit.addTo('stone', B(1.6, 3.2, 1.6), M(hx - 3.6, hy + 9.2, hz), PAL.interior.dark);
      kit.addTo('glow', B(1.1, 1.4, 0.1), M(hx + 2.6, hy + 5.4, hz + 3.05), PAL.interior.lamp);
    }

    // ── the clearing, the standing stone, and the charcoal burner's ring ──
    kit.standingStone(CLEARING.x, CLEARING.z, { h: 2.2, r: 0.5, lean: 0.06, seed: 3 });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      kit.rock(CLEARING.x + Math.cos(a) * 4.2, CLEARING.z + Math.sin(a) * 4.2, 0.4, (k * 41) | 0, { sink: 0.5 });
    }
    kit.flowers([{ x: CLEARING.x, z: CLEARING.z + 2.4, hue: PAL.flower.white, n: 18, spread: 2.2 }],
      { accept: () => true });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      kit.rock(RING.x + Math.cos(a) * 1.5, RING.z + Math.sin(a) * 1.5, 0.3, (k * 17) | 0, { moss: false, sink: 0.5 });
    }
    kit.addTo('dirtbed', new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(RING.x + 3.2, kit.lowestAt(RING.x + 3.2, RING.z, 1.4, 5), RING.z), PAL.foliage.trunkDark);
    kit.woodpile(RING.x - 2.4, RING.z + 1.6, 0.4);
    kit.crate(RING.x + 2.0, RING.z + 2.4, 0.3, 0.9);
    kit.fallenLog(14.6, 1.8, 1.2, { len: 3.2, rad: 0.42, seed: 7 });
    kit.lantern(1.6, -18.6, 0, { h: 2.1 });
    kit.lantern(1.8, 9.6, 0, { h: 2.1 });

    // ── life: a few ground birds and butterflies in the shafts of light ──
    kit.groundBirds([{ x: 3.0, z: 12.0 }, { x: -2.0, z: -8.0 }, { x: CLEARING.x, z: CLEARING.z + 3.0 }], { scare: 3.4, seed: 71 });
    kit.butterflies([{ x: CLEARING.x, z: CLEARING.z + 2.2, hue: PAL.char.white },
      { x: -1.0, z: 4.0, hue: PAL.flower.yellow }, { x: 3.0, z: -12.0, hue: PAL.flower.white }]);
    kit.motes({ count: 70, radius: 20, height: 5.0, seed: 41 });
  },

  flowerCount: 16,
  tufts: { count: 900, radius: 25 },
  birds: 2,
});

export default wood;
