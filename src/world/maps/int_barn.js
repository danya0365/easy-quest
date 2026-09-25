/**
 * int_barn.js — HOLLYBANK'S BARN, inside.                                    (P06 interior; art src/art/interior.js)
 *
 * WORLD-BIBLE §3: "Behind it, a barn (Papa's wagon waits here in Act II) and a fenced paddock." This is the barn:
 * a beaten earth floor, two stalls with a manger each, hay to the rafters, the harness on its pegs, and the empty
 * space where the wagon stands when it is home. `hollybank_barn`'s door opens here.
 */
import { interiorMap } from './int_common.js';
import { PAL, mixHex } from '../../art/palette.js';

const SPOTS = {
  stallA: { x: -4.4, z: -3.0 },
  stallB: { x: -4.4, z: 0.2 },
  hay: { x: 4.4, z: -3.2 },
  loft: { x: 5.6, z: 2.6 },
  harness: { x: 0.4, z: -5.4 },
  wagon: { x: 1.6, z: -1.0 },
  crates: { x: 5.4, z: 0.4 },
  cat: { x: 3.0, z: -1.6 },
  hand: { x: -0.6, z: 2.2, facing: 340 },
};

export default interiorMap({
  id: 'int_barn',
  name: "Hollybank's barn",
  plot: 'hollybank_barn',
  doorName: 'the barn door',
  W: 13.6, D: 12.6, H: 3.1,
  doorX: -1.4,
  doorW: 2.0, doorH: 2.5,
  music: 'village',
  wall: 'planks',
  fill: 0.62,
  upperTint: mixHex(PAL.wood.weathered, PAL.plaster.light, 0.5), // the gable end, bleached by forty summers
  wallTint: mixHex(PAL.wood.weathered, PAL.wood.mid, 0.4),
  floor: 'stone',
  doorColor: PAL.wood.weathered,
  timberSides: ['north', 'east', 'west'],
  sun: 1.62,
  seed: 17,
  spots: SPOTS,
  windows: [
    { side: 'east', at: -1.6, y: 1.9, w: 1.0, h: 0.85, shutter: false, shaft: true, len: 4.4 },
    { side: 'north', at: -4.0, y: 1.9, w: 0.9, h: 0.8, shutter: false, shaft: true, len: 4.0 },
    { side: 'west', at: 3.4, y: 1.9, w: 0.9, h: 0.8, shutter: false, shaft: true, len: 4.0 },
  ],
  outLine: 'Out of the hay and into the\nafternoon.',
  searchLines: [
    '%HERO% searches the barn.{n}Hay. Two kinds. He is now an\nexpert on hay and nobody will\never ask.',
  ],

  colliders: [
    { type: 'box', x: SPOTS.stallA.x, z: SPOTS.stallA.z - 1.4, w: 3.4, d: 0.3, rot: 0, tag: 'stall' },
    { type: 'box', x: SPOTS.stallB.x, z: SPOTS.stallB.z - 1.4, w: 3.4, d: 0.3, rot: 0, tag: 'stall' },
    { type: 'box', x: SPOTS.stallB.x, z: SPOTS.stallB.z + 1.5, w: 3.4, d: 0.3, rot: 0, tag: 'stall' },
    { type: 'box', x: SPOTS.hay.x, z: SPOTS.hay.z, w: 2.6, d: 2.2, rot: 0.2, tag: 'hay' },
    { type: 'circle', x: SPOTS.crates.x, z: SPOTS.crates.z, r: 0.65, tag: 'crates' },
    { type: 'box', x: SPOTS.loft.x, z: SPOTS.loft.z, w: 1.7, d: 3.1, rot: 0, tag: 'stair' },
  ],

  props: [
    { type: 'stall', name: 'the near stall', x: SPOTS.stallB.x + 1.9, z: SPOTS.stallB.z, line: 'stall', reach: 1.9, height: 1.5 },
    { type: 'manger', name: 'the manger', x: SPOTS.stallA.x, z: SPOTS.stallA.z - 0.9, line: 'manger', reach: 1.7, height: 1.0 },
    { type: 'hay', name: 'the hay', x: SPOTS.hay.x - 1.5, z: SPOTS.hay.z, line: 'hay', reach: 2.0, height: 1.2 },
    { type: 'sign', name: "Parsnip's harness", x: SPOTS.harness.x, z: SPOTS.harness.z + 0.7, line: 'harness', reach: 1.8, height: 1.8 },
    { type: 'sign', name: 'the empty space', x: SPOTS.wagon.x, z: SPOTS.wagon.z, line: 'wagon-space', reach: 1.9, height: 1.4 },
    { type: 'stairs', name: 'the loft ladder', x: SPOTS.loft.x - 1.1, z: SPOTS.loft.z + 1.3, line: 'loft', reach: 1.9, height: 2.2 },
  ],

  lines: {
    stall: ['A stall with a manger and a\nrubbed-shiny post.',
      'Parsnip lives in this one. You\ncan tell because the post is\nshiny at exactly his height.'],
    manger: ['Hay in the manger, put there\nthis morning by somebody who\nwas told to.',
      'That was you. You did do it.\nEventually.'],
    hay: ['Hay to the rafters, and a\npitchfork stuck in it at an\nangle that means business.',
      'You are not supposed to jump in\nit.{p}You have jumped in it.'],
    harness: ['{gold}Parsnip\'s harness{/gold}, on three pegs,\noiled and hung the way Papa\nhangs everything.',
      'There is a fourth peg with\nnothing on it. Nobody knows what\nwent there.'],
    'wagon-space': ['Two wooden chocks, a yard apart,\nand between them the cobbles are\nworn smooth and swept.',
      'The wagon stands here when it is\nhome.{p}It is not home.'],
    loft: ['A ladder to the hayloft, which\nis the best place in Puddlewick\nand everybody knows it.',
      'You are not allowed up there\nalone.{p}"Alone" is doing a lot of work\nin that sentence.'],
  },

  decorate(kit, R) {
    const H = R.H, HW = R.HW, HD = R.HD;

    // The shell's own stone floor IS the barn floor. (A flagFloor over it at 1.3-unit slabs came out as a pale
    // tiled bathroom — measured in shots/P06-rooms/04-barn.) What it needs instead is straw trodden into it and
    // the clean rectangle where the wagon stands.
    // Parsnip's corner: two chocks and the smooth cobbles between them, where the wagon stands when it is home.
    for (const sg of [-1, 1]) kit.crateStack(SPOTS.wagon.x + sg * 1.25, SPOTS.wagon.z + 1.5, sg * 0.2, { n: 1, seed: 61 + sg, s: 0.5 });
    // loose straw trodden across the cobbles, so the floor of a barn is not a swept yard
    for (const [sx, sz, sn] of [[-1.0, -3.6, 16], [1.4, -4.2, 12], [2.6, 1.2, 14], [-3.0, 4.6, 12],
      [3.8, 4.2, 16], [0.2, 2.6, 10], [-5.0, -1.2, 12], [4.4, -5.0, 12], [SPOTS.hay.x - 1.6, SPOTS.hay.z + 1.7, 22]]) {
      kit.strawScatter(sx, sz, { n: sn, r: 0.8, seed: Math.abs((sx * 31 + sz * 17 + 71) | 0) });
    }

    // two stalls down the west side, each with a manger
    kit.stallDivider(SPOTS.stallA.x, SPOTS.stallA.z - 1.5, 0, { w: 3.4, h: 1.3 });
    kit.stallDivider(SPOTS.stallB.x, SPOTS.stallB.z - 1.5, 0, { w: 3.4, h: 1.3 });
    kit.stallDivider(SPOTS.stallB.x, SPOTS.stallB.z + 1.6, 0, { w: 3.4, h: 1.3 });
    kit.manger(SPOTS.stallA.x, -HD + 0.45, 0, { w: 1.4, y: 0.52 });
    kit.manger(SPOTS.stallB.x, SPOTS.stallB.z - 1.1, 0, { w: 1.3, y: 0.52 });

    // hay: a heap in the corner and two forkfuls on the floor
    kit.hayPile(SPOTS.hay.x, SPOTS.hay.z, 0.2, { w: 3.2, d: 2.4, h: 1.5, seed: 31, fork: true });
    kit.hayPile(2.0, 3.6, -0.5, { w: 1.8, d: 1.2, h: 0.6, seed: 37 });

    // the harness on its pegs: a BARN wall, not a shop shelf of coloured bottles
    kit.toolRack(SPOTS.harness.x, -HD + 0.24, 0, { w: 3.2, h: 2.3, seed: 43 });
    kit.roomBarrel(-5.8, 4.0, 0.2, { s: 1.15 });
    kit.crateStack(SPOTS.crates.x, SPOTS.crates.z, 0.15, { n: 3, seed: 47 });
    kit.sackPile(-5.4, 2.6, 0.4, { n: 3, seed: 53, color: mixHex(PAL.cloth.cream, PAL.thatch.mid, 0.4) });

    // the ladder to the hayloft, and a lantern on the post by the door
    kit.roomStair(SPOTS.loft.x, SPOTS.loft.z + 1.4, 0, { w: 1.5, rise: 0.3, run: 0.34, n: 8, rail: true });
    kit.wallSconce(HW - 0.24, 3.4, -Math.PI / 2, { y: 1.8, lantern: true });
    kit.roomLamp(0.0, 0.4, H - 0.35, {});

    // hay dust in the shaft from the east window
    kit.dustMotes(HW - 2.4, -1.6, { n: 28, w: 2.0, h: 2.2, d: 2.4, y: 0.7 });
  },
});
