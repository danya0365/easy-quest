/**
 * int_chapel.js — THE CHAPEL OF SAINT ALDEN, inside.                         (P06 interior; art src/art/interior.js)
 *
 * DQV-RUBRIC "Ceremony" and "Clarity": the church is the place a child learns nothing bad is permanent. Stone
 * walls, a flagged floor, three rows of pews down an aisle, candles, a poor box you can give to, and one tall
 * window throwing a slab of afternoon down the aisle onto the altar step. `puddlewick_chapel`'s door opens here.
 *
 * Music is `church` (CANON §9) — the only room in Puddlewick that is not on the village motif.
 */
import { interiorMap, WALLS } from './int_common.js';
import { PAL, mixHex } from '../../art/palette.js';

const SPOTS = {
  altar: { x: 0, z: -6.0 },
  deacon: { x: -1.5, z: -4.6, facing: 90 },
  pews: { x: 0, z: -1.6 },
  poorBox: { x: 3.3, z: 1.4 },
  font: { x: -3.4, z: 2.0 },
  candles: { x: 2.6, z: -5.2 },
  bellRope: { x: 4.2, z: 4.0 },
};

export default interiorMap({
  id: 'int_chapel',
  name: 'the chapel of Saint Alden',
  plot: 'puddlewick_chapel',
  doorName: 'the chapel door',
  W: 11.6, D: 15.6, H: 3.3,
  doorX: 0,
  arrive: 4.8,
  music: 'church',
  wall: 'stone',
  wallTint: PAL.stone.light,
  floor: 'stone',
  doorColor: PAL.wood.dark,
  timberSides: [],
  timbers: false,
  hours: 15.2,
  sun: 1.6,
  surround: 0.62,
  seed: 11,
  spots: SPOTS,
  windows: [
    { side: 'north', at: 0, y: 2.0, w: 1.2, h: 1.4, shutter: false, shaft: true, len: 5.0 },
    { side: 'west', at: -3.0, y: 1.6, w: 0.9, h: 1.3, shutter: false, shaft: true, len: 4.6 },
    { side: 'west', at: 2.0, y: 1.6, w: 0.9, h: 1.3, shutter: false },
    { side: 'east', at: -3.0, y: 1.6, w: 0.9, h: 1.3, shutter: false },
    { side: 'east', at: 2.0, y: 1.6, w: 0.9, h: 1.3, shutter: false, shaft: true, len: 4.6 },
  ],
  outLine: 'Out of the quiet, back into the\nafternoon.',
  searchLines: [
    '%HERO% looks along a pew.{n}A hymn book, three hymn books,\nand a hymn book with a beetle\nin it.',
  ],

  colliders: [
    { type: 'box', x: SPOTS.altar.x, z: SPOTS.altar.z, w: 2.4, d: 1.1, rot: 0, tag: 'altar' },
    { type: 'circle', x: SPOTS.poorBox.x, z: SPOTS.poorBox.z, r: 0.3, tag: 'poorbox' },
    { type: 'circle', x: SPOTS.font.x, z: SPOTS.font.z, r: 0.55, tag: 'font' },
    // the pews: three rows either side of the aisle
    ...[0, 1, 2].flatMap(k => [-1, 1].map(sx => ({
      type: 'box', x: sx * 2.15, z: SPOTS.pews.z + k * 1.3, w: 2.4, d: 0.62, rot: 0, tag: 'pew',
    }))),
  ],

  props: [
    { type: 'altar', name: 'the altar', x: SPOTS.altar.x, z: SPOTS.altar.z + 0.9, line: 'altar', reach: 2.0, height: 1.6 },
    { type: 'poorbox', name: 'the poor box', x: SPOTS.poorBox.x, z: SPOTS.poorBox.z + 0.5, line: 'poor-box', reach: 1.7, height: 1.4 },
    { type: 'font', name: 'the font', x: SPOTS.font.x, z: SPOTS.font.z + 0.7, line: 'font', reach: 1.7, height: 1.2 },
    { type: 'sign', name: 'the bell rope', x: SPOTS.bellRope.x, z: SPOTS.bellRope.z, line: 'bell-rope', reach: 1.8, height: 1.8 },
    { type: 'chair', name: 'a pew', x: -2.15, z: SPOTS.pews.z + 0.6, line: 'pew', reach: 1.7, height: 1.0 },
  ],

  lines: {
    altar: ['A stone table under a white\ncloth, two candles, and a lark\ncarved into a wooden roundel.',
      'Saint Alden was a shepherd who\nwas kind to a bird.{p}That is the whole story. It is\nenough.'],
    'poor-box': ['A wooden box on a post, with a\nslot in the top.',
      '{gold}Anything you put in here goes to\nsomebody who needs it more.{/gold}{p}Even one coin. Especially one\ncoin.'],
    font: ['A stone basin of cold water.{p}Every child in the village has\nbeen dunked in this, including\nyou.',
      'You do not remember it. Nan\nremembers it. Nan mentions it.'],
    'bell-rope': ['A rope down the wall, with a\nwooden handle worn shiny.',
      'A small sign beside it:\n"RING FOR JOY, FIRE, OR SHEEP\nIN THE BECK. NOTHING ELSE."'],
    pew: ['Somebody has carved two sets of\ninitials into the pew and then\nvery badly scratched them out.'],
  },

  decorate(kit, R) {
    const H = R.H, HW = R.HW, HD = R.HD;

    // the chancel step and the altar on it
    kit.flagFloor(0, -5.4, { w: 8.4, d: 3.6, seed: 5, color: mixHex(PAL.stone.mid, PAL.dirt.light, 0.3), flag: 0.9 });
    kit.altar(SPOTS.altar.x, SPOTS.altar.z, 0, { w: 2.2, d: 0.9, h: 1.0, cloth: PAL.cloth.cream, lark: true });

    // three rows of pews either side of a wide aisle, all facing the altar
    kit.pewRows(0, SPOTS.pews.z, 0, { rows: 3, gap: 1.3, w: 2.4, aisle: 1.9 });

    // the font by the door, and the poor box a child can give to
    kit.font(SPOTS.font.x, SPOTS.font.z, { r: 0.42, h: 0.9 });
    kit.poorBox(SPOTS.poorBox.x, SPOTS.poorBox.z, Math.PI, { h: 0.98 });

    // candles: a stand of them beside the chancel, and a sconce between the windows
    kit.candleStand(SPOTS.candles.x, SPOTS.candles.z, { n: 7, r: 0.34, h: 0.84 });
    kit.candleStand(-SPOTS.candles.x, SPOTS.candles.z, { n: 5, r: 0.3, h: 0.74 });
    for (const z of [-4.6, -0.6, 3.4]) {
      kit.wallSconce(HW - 0.22, z, -Math.PI / 2, { y: 1.5 });
      kit.wallSconce(-HW + 0.22, z, Math.PI / 2, { y: 1.5 });
    }

    // the bell rope in the corner by the door
    kit.bellRope(SPOTS.bellRope.x, SPOTS.bellRope.z, Math.PI, { top: H - 0.1, handle: 0.95 });

    // a plain lectern and a stack of hymn books
    kit.workbench(-3.9, -4.4, Math.PI / 2, { w: 1.2, d: 0.6, rack: false, seed: 51 });
    kit.crateStack(4.6, -1.0, 0.1, { n: 2, seed: 61, s: 0.8 });

    // the afternoon coming through the west window, full of dust
    kit.dustMotes(-2.6, -1.4, { n: 26, w: 2.0, h: 2.0, d: 3.0, y: 0.5 });
    // a runner up the aisle: without it the floor is one unbroken field of cobbles from the door to the altar
    for (let k = 0; k < 5; k++) kit.floorPatch(0, 3.4 - k * 2.1, { rx: 0.85, rz: 1.05, rect: true,
      color: mixHex(PAL.cloth.red, PAL.cloth.purple, 0.3 + (k % 2) * 0.08), lift: 0.016 });
  },
});
