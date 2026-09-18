/**
 * int_cottage.js — THE POTTLES' COTTAGE, inside.                             (P06 interior; art src/art/interior.js)
 *
 * The seventh door round the green (WORLD-BIBLE §3: "seven houses in a loose ring, doors facing in"). Mrs Pottle
 * is out on the green telling everybody everything; Mr Pottle is in here, asleep in the chair, and has been for
 * some time. A dresser of good plates, a wardrobe, a rag rug, a fire, and a smell of soup.
 * `puddlewick_cottage`'s door opens here.
 */
import { interiorMap, WALLS } from './int_common.js';
import { PAL, mixHex } from '../../art/palette.js';

const SPOTS = {
  hearth: { x: 3.0, z: -3.8 },
  chair: { x: 2.2, z: -2.1 },
  table: { x: -1.4, z: -1.0 },
  dresser: { x: -5.6, z: -2.2 },
  wardrobe: { x: -5.4, z: 1.8 },
  bed: { x: 4.4, z: 1.6 },
  pots: { x: 5.4, z: 3.4 },
  sleeper: { x: 2.2, z: -2.1, facing: 200 },
  cat: { x: 1.2, z: -3.0 },
};

export default interiorMap({
  id: 'int_cottage',
  name: 'the Pottles’ cottage',
  plot: 'puddlewick_cottage',
  doorName: 'the front door',
  W: 12.6, D: 10.6,
  doorX: -0.4,
  music: 'village',
  wallTint: WALLS.rose,
  doorColor: PAL.paint.doorRed,
  seed: 29,
  spots: SPOTS,
  windows: [
    { side: 'south', at: -4.0, y: 1.38, w: 1.0, h: 0.9, shutter: PAL.paint.shutterGreen, shaft: true, len: 3.4 },
    { side: 'south', at: 3.6, y: 1.38, w: 1.0, h: 0.9, shutter: PAL.paint.shutterGreen },
    { side: 'west', at: -0.4, y: 1.4, w: 0.9, h: 0.85, shutter: PAL.paint.shutterGreen },
  ],
  outLine: 'Out onto the green, quietly.',

  colliders: [
    { type: 'box', x: SPOTS.hearth.x, z: SPOTS.hearth.z + 0.2, w: 2.9, d: 1.3, rot: 0, tag: 'hearth' },
    { type: 'circle', x: SPOTS.chair.x, z: SPOTS.chair.z, r: 0.4, tag: 'chair' },
    { type: 'box', x: SPOTS.table.x, z: SPOTS.table.z, w: 2.0, d: 1.1, rot: 0, tag: 'table' },
    { type: 'box', x: SPOTS.dresser.x, z: SPOTS.dresser.z, w: 0.55, d: 1.7, rot: 0, tag: 'dresser' },
    { type: 'box', x: SPOTS.wardrobe.x, z: SPOTS.wardrobe.z, w: 0.6, d: 1.25, rot: 0, tag: 'wardrobe' },
    { type: 'box', x: SPOTS.bed.x, z: SPOTS.bed.z, w: 1.25, d: 2.1, rot: 0, tag: 'bed' },
    { type: 'circle', x: SPOTS.pots.x, z: SPOTS.pots.z, r: 0.5, tag: 'pots' },
  ],

  props: [
    { type: 'hearth', name: 'the hearth', x: SPOTS.hearth.x, z: SPOTS.hearth.z + 0.9, line: 'hearth', reach: 2.0, height: 1.7 },
    { type: 'dresser', name: 'the good plates', x: SPOTS.dresser.x + 0.6, z: SPOTS.dresser.z, line: 'plates', reach: 1.7, height: 1.8 },
    { type: 'wardrobe', name: 'the wardrobe', x: SPOTS.wardrobe.x + 0.7, z: SPOTS.wardrobe.z, line: 'wardrobe', reach: 1.7, height: 1.9 },
    { type: 'table', name: 'the table', x: SPOTS.table.x, z: SPOTS.table.z, line: 'table', reach: 1.8, height: 1.0 },
    { type: 'bed', name: 'the bed', x: SPOTS.bed.x - 0.9, z: SPOTS.bed.z, line: 'bed', reach: 1.7, height: 1.0 },
  ],

  lines: {
    hearth: ['A pot of soup on the hook, going\nvery slowly, the way soup that is\nmeant to last does.',
      'There is a spoon beside it with\na ribbon tied on the handle, so\nnobody uses the wrong spoon.'],
    plates: ['The good plates, up on the rack,\nturned face out.',
      'They have never been eaten off.\nThey are for looking at and for\nmentioning.'],
    wardrobe: ['A wardrobe with one door that\nswings open on its own if you\nwalk past it quickly.',
      'Everybody in this house now\nwalks past it slowly.'],
    table: ['Two places laid, one cleared.\nA pot of jam with the lid half\non.',
      'Somebody has been at the jam\nwith a finger. Somebody has\ndenied it.'],
    bed: ['A big bed with a heap of\nblankets, made in a hurry.',
      'One side is made properly and\none side is not, which tells you\neverything.'],
  },

  decorate(kit, R) {
    const H = R.H, HW = R.HW, HD = R.HD;

    kit.hearth(SPOTS.hearth.x, SPOTS.hearth.z, 0, { w: 1.9, h: 1.5, kettle: true });
    kit.cauldron(SPOTS.hearth.x - 0.5, SPOTS.hearth.z + 0.85, { r: 0.28, fire: false });
    kit.chair(SPOTS.chair.x, SPOTS.chair.z, Math.PI * 0.9, { big: true });

    kit.roomTable(SPOTS.table.x, SPOTS.table.z, 0.06, { w: 2.0, d: 1.1, top: 0.77,
      things: [{ kind: 'bowl', x: -0.45, z: 0.02 }, { kind: 'loaf', x: 0.3, z: -0.08 }, { kind: 'cup', x: 0.0, z: 0.3 }, { kind: 'candle', x: 0.68, z: 0.2 }] });
    kit.chair(SPOTS.table.x - 1.4, SPOTS.table.z + 0.1, Math.PI / 2, {});
    kit.chair(SPOTS.table.x + 1.4, SPOTS.table.z - 0.1, -Math.PI / 2, {});

    kit.dresser(SPOTS.dresser.x, SPOTS.dresser.z, Math.PI / 2, { w: 1.7, h: 2.0 });
    kit.wardrobe(SPOTS.wardrobe.x, SPOTS.wardrobe.z, Math.PI / 2, { w: 1.25, h: 1.95, d: 0.56 });
    kit.bed(SPOTS.bed.x, SPOTS.bed.z, 0, { w: 1.05, l: 1.9, blanket: mixHex(PAL.cloth.red, PAL.cloth.cream, 0.35) });
    kit.bookshelf(HW - 0.26, -0.6, -Math.PI / 2, { w: 1.2, h: 1.5, n: 3, seed: 43 });

    kit.potGroup(SPOTS.pots.x, SPOTS.pots.z, { n: 3, seed: 47, spread: 0.45 });
    kit.roomBarrel(-5.9, 3.9, 0.2, { s: 0.95 });
    kit.crateStack(-3.4, 3.6, 0.1, { n: 2, seed: 53, s: 0.85 });

    kit.rug(0.2, 1.6, 0.05, { w: 3.2, d: 2.0, color: PAL.cloth.red, seed: 31 });
    kit.wallPicture(-HW + 0.24, -4.0, Math.PI / 2, { y: 1.6, w: 0.58, h: 0.44 });
    kit.wallPicture(0.8, -HD + 0.22, 0, { y: 1.68, w: 0.5, h: 0.62, color: mixHex(PAL.cloth.cream, PAL.cloth.blue, 0.18) });
    kit.hangingHerbs(1.2, -2.2, H - 0.3, { n: 2, seed: 57, spread: 0.34 });
    kit.onionRope(HW - 0.28, -3.4, 1.84, { n: 5, seed: 59 });
    kit.roomLamp(SPOTS.table.x + 0.4, SPOTS.table.z + 0.2, H - 0.26, {});
    kit.wallSconce(-HW + 0.22, 0.6, Math.PI / 2, { y: 1.64 });

    kit.dustMotes(-3.8, HD - 2.2, { n: 18, w: 1.5, h: 1.4, d: 1.7, y: 0.45 });
  },
});
