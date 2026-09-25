/**
 * road_beck.js — THE BECK ROAD: the lane out of Puddlewick Vale, down the Beck, to the sea. (P23B base map)
 *
 * WORLD-BIBLE §1 T1: "Puddlewick <-> Saltmarrow (the Beck Bridge, r5-r6 c4) — none, open from minute one." Until
 * now that lane ran to the edge of the vale and a villager apologised. This is the road: the Long Lane leaving
 * the vale westward behind you, the Beck running east beside it, a humpbacked stone bridge where the lane changes
 * bank, willows, reeds, a drystone wall, a fold of sheep, a stile, and a fork signpost at each end so a
 * six-year-old always knows which way is home (WORLD-BIBLE §6.3: a signpost at every fork).
 *
 * Coordinates: world units, centred (origin [-36, -28], 72 x 56 tiles). +x is east, -z is north. You come IN from
 * the west (the vale) and OUT to the east (Saltmarrow). The Beck crosses under the bridge at (-12, 7.5).
 *
 * Encounters: `##` road, so HALF rate (WORLD-BIBLE §1 legend) on the Long Lane table (tests/battle/areas.js).
 * Its people and words are src/world/maps/road_beck.npcs.js, its treasure road_beck.chests.js.
 */
import { outdoorMap, marks, PAL, smooth, vnoise, mulberry } from './road_common.js';
import { BECK_WEST, VALE_LANDING } from './road_links.js';   // registers the vale -> road join (see road_links.js)

// ── the shape of the road ────────────────────────────────────────────────────────────────────────────────────
const LANE = [[-29, 15.4], [-23, 14.8], [-18, 13.8], [-14.4, 12.0], [-12.6, 9.6], [-12.1, 5.6], [-11.2, 2.2],
  [-7.4, 0.2], [0, -1.0], [8, -2.6], [17, -4.2], [24, -5.8], [29, -6.6]];
const BECK = [[-34, 5.6], [-24, 6.6], [-16, 7.2], [-8, 7.0], [1, 5.6], [10, 3.2], [19, -0.4], [26, -4.0], [34, -8.6]];
/** The spur up to the fold and the stile: a dead end with something in it (WORLD-BIBLE §5). */
const SPUR = [[2, -2.2], [5, -6.4], [7.5, -11.0], [8.4, -15.4]];

const BRIDGE = { cx: -12, cz: 7.5, dir: Math.PI, L: 9.0, W: 3.0, arch: 0.62, kind: 'stone' };

const WEST = { x: -26.6, z: 14.6 };                   // the exit box back to the vale
const EAST = { x: 27.4, z: -6.4 };                    // the exit box on to Saltmarrow
export const BECK_EAST_LANDING = { x: 22.4, z: -5.6, facing: -Math.PI / 2 };   // where Saltmarrow puts you back

const SIGN_W = { x: -16.4, z: 12.2 };
const SIGN_E = { x: 22.0, z: -3.0 };

const road = outdoorMap({
  id: 'road_beck',
  name: 'The Beck Road',
  kind: 'field',
  size: [72, 56],
  ax: 32, az: 24,
  seed: 23,
  theme: 'grass',
  music: 'overworld',                                 // CANON §9 — the travelling theme
  ambience: 'amb_meadow',
  hours: 10.5,
  spawn: { x: BECK_WEST.x, z: BECK_WEST.z, facing: Math.PI / 2 },
  camera: { orbit: 96, pitch: 27, dist: 10.6, fov: 49, lookUp: 2.6 },
  // `##` road: half the encounter rate of open country, on the Long Lane's own table
  encounters: { rate: 0.5, table: [['gloop', 5], ['peckish', 4], ['bloop', 3], ['flapjack', 2], ['grumpleroot', 2], ['bumbleblunder', 2]] },
  landmarks: marks([{ id: 'puddlewick', az: 2.62 }, { id: 'saltmarrow', az: -0.34 }, { id: 'coddleston', az: 1.22 }]),

  lanes: [{ pts: LANE, w: 2.6 }, { pts: SPUR, w: 1.7, falloff: 0.9 }],
  stream: { pts: BECK, w: 3.4, y: -0.45, bank: 0.9 },
  bridges: [BRIDGE],
  hills: [{ x: -20, z: -14, r: 11, h: 1.6 }, { x: 14, z: 12, r: 10, h: 1.2 }, { x: 8, z: -16, r: 9, h: 1.5 }],
  rim: { radius: 30, rows: 3, rowGap: 6.2, seed: 641, threshold: 0.26 },
  exits: [
    { x: WEST.x, z: WEST.z, w: 5.0, h: 8.4, to: 'meadow', tx: VALE_LANDING.x, tz: VALE_LANDING.z, kind: 'edge',
      name: 'the lane back up to the vale', line: 'lane-west', back: { x: -22.0, z: 14.2 } },
    { x: EAST.x, z: EAST.z, w: 5.0, h: 8.4, to: 'saltmarrow', tx: -17.6, tz: -8.2, kind: 'edge',
      name: 'the lane down into Saltmarrow', line: 'lane-east', back: { x: 22.4, z: -5.6 } },
  ],
  notches: [{ az: Math.atan2(-14, -20), k: 0.4, w: 0.26 }],

  spots: {
    signWest: SIGN_W, signEast: SIGN_E,
    bridge: { x: BRIDGE.cx, z: BRIDGE.cz },
    fold: { x: 8.0, z: -14.4 },
    stile: { x: 6.4, z: -10.2 },
    ford: { x: 4.0, z: 4.6 },
    shepherd: { x: 7.0, z: -12.0, facing: Math.PI * 0.75 },
    carter: { x: -4.0, z: -0.4, facing: Math.PI / 2 },
    fisher: { x: -16.6, z: 4.4, facing: 0.4 },
    wall: [[-8, -4.6], [2, -5.6], [9, -8.0]],
  },

  props: [
    { type: 'sign', name: 'the signpost by the vale', x: SIGN_W.x, z: SIGN_W.z, line: 'sign-west', reach: 3.6, height: 2.5 },
    { type: 'sign', name: 'the signpost above Saltmarrow', x: SIGN_E.x, z: SIGN_E.z, line: 'sign-east', reach: 3.6, height: 2.5 },
    { type: 'bridge', name: 'the Beck Bridge', x: BRIDGE.cx + 2.2, z: BRIDGE.cz, line: 'bridge', reach: 2.4, height: 1.4 },
    { type: 'stile', name: 'the stile', x: 6.4, z: -10.2, line: 'stile', reach: 2.0, height: 1.2 },
    { type: 'gate', name: 'the field gate', x: 8.2, z: -15.0, line: 'fold', reach: 2.4, height: 1.3 },
    { type: 'water', name: 'the Beck', x: 4.0, z: 3.0, line: 'beck', reach: 2.6, height: 0.6 },
  ],

  colliders: [
    { type: 'capsule', pts: [[-8, -4.6], [2, -5.6], [9, -8.0]], r: 0.3, tag: 'wall' },
  ],

  lines: {
    'lane-west': 'The lane climbs back up into\nPuddlewick Vale.',
    'lane-east': 'Down there the Beck goes wide\nand the air smells of salt.',
    'sign-west': ['{gold}PUDDLEWICK{/gold} — up the lane, and\nmind the sheep.\n{gold}SALTMARROW{/gold} — follow the water.',
      'Somebody has carved SALTMARROW\ndeeper than the other one. They\nmust have liked it there.'],
    'sign-east': ['{gold}SALTMARROW{/gold} — a hop, a skip\nand a bridge.\n{gold}PUDDLEWICK{/gold} — a morning’s walk.',
      'Underneath, very small:\n"the mill is louder than it\nlooks."'],
    bridge: ['Three arches of old stone, worn\nsmooth in two lines by two\nhundred years of carts.',
      'The Beck goes under it without\nhurrying about anything.'],
    stile: ['Two steps over the wall, put\nthere for people and not for\nsheep.'],
    fold: ['A field gate, shut, with a loop\nof rope for a latch.',
      'Beyond it, twelve sheep and one\nfirm opinion.'],
    beck: ['The water is brown-gold and\nquick, and there are little\nfish standing still in it.',
      'One of them is watching you.\nProbably.'],
  },

  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  // set dressing
  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  dress(kit, L) {
    const r = mulberry(4021);
    const y = (x, z) => kit.heightAt(x, z);

    // ── the willows and the hedgerow trees along the water ──
    const trees = [];
    for (let i = 6; i < L.stream.length - 6; i += 22) {
      const p = L.stream[i], side = (i / 22) % 2 ? 1 : -1;
      const a = L.stream[i - 4], b = L.stream[i + 4];
      const tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
      const px = p[0] - tz / tl * 3.4 * side, pz = p[1] + tx / tl * 3.4 * side;
      if (L.edgeR(px, pz) > 0.94) continue;
      trees.push({ kind: r() > 0.5 ? 'birch' : 'oak', x: px, z: pz, s: 0.9 + r() * 0.4, r: r() * 6.28 });
    }
    // a hedge-line of oaks down the north side of the lane, so the road has a SIDE and not just grass
    for (let i = 10; i < L.lanes[0].dense.length - 10; i += 26) {
      const p = L.lanes[0].dense[i];
      const px = p[0] + (r() - 0.5) * 2, pz = p[1] - 4.4 - r() * 1.6;
      if (L.edgeR(px, pz) > 0.93 || L.wdist(px, pz) < 3.0) continue;
      trees.push({ kind: r() > 0.7 ? 'fruit' : 'oak', x: px, z: pz, s: 0.95 + r() * 0.5, r: r() * 6.28 });
    }
    // a small copse on the southern swell
    for (let k = 0; k < 14; k++) {
      const px = 14 + (r() - 0.5) * 13, pz = 13 + (r() - 0.5) * 11;
      if (L.edgeR(px, pz) > 0.95 || L.wdist(px, pz) < 3.0) continue;
      trees.push({ kind: ['oak', 'edge', 'round'][(r() * 3) | 0], x: px, z: pz, s: 0.9 + r() * 0.6, r: r() * 6.28 });
    }
    kit.trees(trees);

    // ── the signposts ──
    const atlas = kit.useSignAtlas(kit.signAtlas(['Puddlewick', 'Saltmarrow', 'Coddleston', 'The fold']));
    kit.signpost(atlas, SIGN_W.x, SIGN_W.z, [{ label: 'Puddlewick', dir: 2.3 }, { label: 'Saltmarrow', dir: -0.6 }]);
    kit.signpost(atlas, SIGN_E.x, SIGN_E.z, [{ label: 'Saltmarrow', dir: -0.4 }, { label: 'Puddlewick', dir: 2.7 }]);
    kit.signpost(atlas, 3.4, -3.2, [{ label: 'The fold', dir: Math.atan2(4.4, 6.0) }], { h: 1.5 });

    // ── the drystone wall along the south verge, and the fold at the end of the spur ──
    kit.drystoneWall([[-8, -4.6], [2, -5.6], [9, -8.0]], { h: 0.8, seed: 12 });
    kit.fence([[4.6, -13.0], [11.4, -13.4], [12.2, -18.0], [5.0, -18.4], [4.6, -13.0]], { spacing: 1.9, seed: 7 });
    kit.fieldGate(8.2, -15.0, Math.PI, { w: 2.6 });
    kit.stile(6.4, -10.2, Math.atan2(1, 0.1));
    for (const [hx, hz] of [[6.6, -15.6], [9.4, -16.4], [7.8, -17.4]]) kit.hayBale(hx, hz, r() * 3, { round: true });

    // ── the water's edge: reeds, half-sunk stones, lily pads in the slack ──
    const shore = (x, z, yy) => yy > -0.6 && yy < -0.05;
    L.stream.forEach((p, i) => {
      if (i % 11 || i < 4 || i > L.stream.length - 5) return;
      const side = (i / 11) % 2 ? 1 : -1, d = 2.1 + ((i * 7) % 5) * 0.2;
      const a = L.stream[i - 3], b = L.stream[i + 3];
      const tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
      const px = p[0] - tz / tl * d * side, pz = p[1] + tx / tl * d * side;
      if (L.edgeR(px, pz) > 0.98 || L.onBridge(px, pz, 2.4)) return;
      kit.reeds(px, pz, 7 + (i % 4), 40 + i, 0.9, shore);
      if ((i / 11) % 2) kit.rock(p[0] - tz / tl * (d - 1.0) * side, p[1] + tx / tl * (d - 1.0) * side, 0.34 + ((i * 3) % 4) * 0.08, 200 + i, { sink: 0.45 });
    });
    kit.lilyPads(6.0, 4.2, -0.45, 5, 31, 1.9);

    // ── the small stories along a road ──
    kit.handcart(-3.2, 0.9, 1.2, {});
    kit.woodpile(-25.4, 13.0, 0.6);
    kit.barrel(-26.2, 14.4, 1.0, 0.4);
    kit.crate(-25.2, 15.6, 0.8);
    kit.bench(21.4, -2.0, Math.atan2(-1, 0.2));
    kit.lantern(-13.6, 11.0, 0, { h: 2.1 });
    kit.lantern(24.0, -5.0, 0, { h: 2.1 });
    for (const [rx, rz, rs] of [[-24, 9.0, 0.8], [-6, -7.4, 1.0], [12.6, -9.0, 0.9], [19.0, 6.0, 1.1], [-27, 4.0, 0.9]]) kit.rock(rx, rz, rs, (rx * 7 + rz) | 0);
    for (let k = 0; k < 12; k++) {
      const px = (r() - 0.5) * 56, pz = (r() - 0.5) * 42;
      if (L.edgeR(px, pz) > 0.95 || L.wdist(px, pz) < 2.6 || L.masks.sample(0, px, pz) > 0.3) continue;
      const pick = (r() * 4) | 0;
      if (pick === 0) kit.bracken(px, pz, { s: 0.9, seed: k * 13 });
      else if (pick === 1) kit.brambles(px, pz, { s: 0.9, seed: k * 17 });
      else if (pick === 2) kit.stump(px, pz, r() * 3, { s: 0.8, seed: k * 19 });
      else kit.mushrooms(px, pz, 3 + (k % 4), k * 23, 0.6);
    }
    kit.molehill(-9.4, -2.8, { s: 1 });
    kit.molehill(-8.2, -3.6, { s: 0.8, seed: 5 });
    kit.scarecrow(13.0, -17.0, 0.4);
    kit.vegPatch(15.4, -15.0, 4.0, 3.0, 0.2, 11);
    kit.groundBirds([{ x: -2.0, z: -3.0 }, { x: 16.0, z: -2.0 }, { x: -20.0, z: 10.0 }], { seed: 31 });
    kit.butterflies([{ x: -6, z: 3, hue: PAL.flower.yellow }, { x: 10, z: 6, hue: PAL.char.white },
      { x: 20, z: -9, hue: PAL.flower.pink }, { x: -22, z: 16, hue: PAL.flower.white }]);
    void y; void smooth; void vnoise;
  },

  flowers: [{ x: -20, z: 11.4, hue: PAL.flower.yellow, n: 16 }, { x: -15.4, z: 5.2, hue: PAL.flower.white, n: 14 },
    { x: 3.0, z: 2.0, hue: PAL.flower.pink, n: 14 }, { x: 18.0, z: -2.0, hue: PAL.flower.blue, n: 12 },
    { x: 24.0, z: -9.0, hue: PAL.flower.yellow, n: 14 }],
  flowerCount: 30,
  tufts: { count: 1300 },
});

export default road;
