/**
 * int_hob.js — OLD HOB'S COTTAGE, inside.                                    (P06 interior; art src/art/interior.js)
 *
 * Old Hob leans on the well all day and has done since before the well (WORLD-BIBLE §3). This is the room he goes
 * back to: one chair, drawn right up to the fire, a pot of something on the hook, herbs on the beam, a shelf of
 * books nobody in the village knew he had, and a cat who has been asleep for eleven years. It is the quietest
 * room in the game and it should make a grown-up's throat go slightly tight. `puddlewick_hob`'s door opens here.
 */
import { interiorMap, WALLS } from './int_common.js';
import { PAL, mixHex } from '../../art/palette.js';

const SPOTS = {
  hearth: { x: -3.2, z: -3.7 },
  chair: { x: -2.4, z: -2.0 },
  cat: { x: -1.2, z: -2.9 },
  bed: { x: 4.2, z: -2.6 },
  books: { x: 2.4, z: -4.9 },
  table: { x: 0.6, z: 0.2 },
  dresser: { x: -5.6, z: -0.6 },
  pots: { x: -5.4, z: 2.8 },
  hob: { x: 1.6, z: 2.0, facing: 320 },
};

export default interiorMap({
  id: 'int_hob',
  name: "Old Hob's cottage",
  plot: 'puddlewick_hob',
  doorName: 'the front door',
  W: 12.6, D: 10.6,
  doorX: -0.6,
  music: 'village',
  wallTint: WALLS.oat,
  doorColor: PAL.paint.shutterGreen,
  hours: 15.9,
  sun: 1.2,
  surround: 0.6,
  seed: 23,
  spots: SPOTS,
  windows: [
    { side: 'south', at: 3.8, y: 1.36, w: 1.0, h: 0.88, shutter: PAL.paint.shutterGreen, shaft: true, len: 3.4 },
    { side: 'west', at: 2.2, y: 1.4, w: 0.9, h: 0.82, shutter: PAL.paint.shutterGreen },
  ],
  outLine: 'Out into the afternoon, where it\nis louder.',

  colliders: [
    { type: 'box', x: SPOTS.hearth.x, z: SPOTS.hearth.z + 0.2, w: 2.9, d: 1.3, rot: 0, tag: 'hearth' },
    { type: 'circle', x: SPOTS.chair.x, z: SPOTS.chair.z, r: 0.38, tag: 'chair' },
    { type: 'box', x: SPOTS.bed.x, z: SPOTS.bed.z, w: 1.25, d: 2.1, rot: 0, tag: 'bed' },
    { type: 'box', x: SPOTS.books.x, z: SPOTS.books.z, w: 1.6, d: 0.42, rot: 0, tag: 'bookshelf' },
    { type: 'box', x: SPOTS.table.x, z: SPOTS.table.z, w: 1.5, d: 1.0, rot: 0, tag: 'table' },
    { type: 'box', x: SPOTS.dresser.x, z: SPOTS.dresser.z, w: 0.55, d: 1.6, rot: 0, tag: 'dresser' },
    { type: 'circle', x: SPOTS.pots.x, z: SPOTS.pots.z, r: 0.5, tag: 'pots' },
  ],

  props: [
    { type: 'hearth', name: 'the hearth', x: SPOTS.hearth.x, z: SPOTS.hearth.z + 0.9, line: 'hearth', reach: 2.0, height: 1.7 },
    { type: 'chair', name: "Hob's chair", x: SPOTS.chair.x + 0.7, z: SPOTS.chair.z, line: 'chair', reach: 1.6, height: 1.2 },
    { type: 'bookshelf', name: 'the books', x: SPOTS.books.x, z: SPOTS.books.z + 0.7, line: 'books', reach: 1.8, height: 1.7 },
    { type: 'bed', name: 'the bed', x: SPOTS.bed.x - 0.9, z: SPOTS.bed.z, line: 'bed', reach: 1.7, height: 1.0 },
    { type: 'sign', name: 'the pot on the hook', x: SPOTS.hearth.x + 1.3, z: SPOTS.hearth.z + 0.7, line: 'pot', reach: 1.7, height: 1.2 },
  ],

  lines: {
    hearth: ['The fire is banked right down to\na red eye, the way a man does it\nwhen he lives alone and knows\nexactly how much wood he has.',
      'It is warm. It is always warm.\nHe is never in.'],
    chair: ['One chair, pulled right up to\nthe fire, with a dip worn in the\nseat.',
      'There is a second dip in the\narm, where a hand goes.',
      'There is no second chair.{p}There is a mark on the boards\nwhere one used to stand.'],
    books: ['Eleven books. Nobody in the\nvillage knows Old Hob has\neleven books.',
      'Wells, water, weather, sheep,\nand one about the sea that has\nbeen read to bits.',
      'He has never seen the sea.'],
    bed: ['A narrow bed, made properly,\nwith the corners done.',
      'A soldier makes a bed like that.\nHob has never mentioned being a\nsoldier.'],
    pot: ['A pot on the hook with something\nin it that has been in it a\nwhile and improved.',
      'It smells extraordinary.{p}Nobody has ever been offered\nany. Everybody has hoped.'],
  },

  decorate(kit, R) {
    const H = R.H, HW = R.HW, HD = R.HD;

    kit.hearth(SPOTS.hearth.x, SPOTS.hearth.z, 0, { w: 1.9, h: 1.5, kettle: false });
    kit.cauldron(SPOTS.hearth.x + 0.1, SPOTS.hearth.z + 0.8, { r: 0.3, fire: true });
    kit.chair(SPOTS.chair.x, SPOTS.chair.z, Math.PI * 0.85, { big: true });

    // the mark on the boards where a second chair used to stand (a rug drew concentric rings, which read as a
    // dartboard; a plain worn patch is what a chair leaves)
    kit.floorPatch(SPOTS.chair.x + 1.6, SPOTS.chair.z + 0.15, { rx: 0.42, rz: 0.4, rect: true, color: mixHex(PAL.wood.dark, PAL.wood.mid, 0.45) });
    kit.rug(SPOTS.hearth.x + 0.6, SPOTS.hearth.z + 1.9, 0.06, { w: 2.6, d: 1.7, color: mixHex(PAL.cloth.blue, PAL.wood.dark, 0.3), seed: 43 });

    kit.roomTable(SPOTS.table.x, SPOTS.table.z, -0.12, { w: 1.5, d: 1.0, top: 0.76,
      things: [{ kind: 'bowl', x: -0.2, z: 0.05 }, { kind: 'cup', x: 0.26, z: -0.12 }, { kind: 'loaf', x: 0.3, z: 0.24 }] });
    kit.stool(SPOTS.table.x - 1.1, SPOTS.table.z + 0.2, 0.2, {});
    kit.bed(SPOTS.bed.x, SPOTS.bed.z, 0, { w: 0.95, l: 1.9, small: false, blanket: mixHex(PAL.cloth.blue, PAL.cloth.cream, 0.25) });
    kit.bookshelf(SPOTS.books.x, -HD + 0.25, 0, { w: 1.6, h: 1.8, n: 4, seed: 31 });
    kit.dresser(SPOTS.dresser.x, SPOTS.dresser.z, Math.PI / 2, { w: 1.5, h: 1.8 });

    kit.potGroup(SPOTS.pots.x, SPOTS.pots.z, { n: 3, seed: 33, spread: 0.45 });
    kit.roomBarrel(-5.8, 4.0, 0.15, { s: 0.9 });
    kit.crateStack(4.8, 3.4, -0.2, { n: 2, seed: 37, s: 0.85 });

    kit.hangingHerbs(-1.4, -2.0, H - 0.3, { n: 3, seed: 39, spread: 0.5 });
    kit.onionRope(-HW + 0.28, -1.4, 1.86, { n: 4, seed: 41 });
    kit.wallSconce(HW - 0.22, -4.4, -Math.PI / 2, { y: 1.6 });
    kit.roomLamp(SPOTS.table.x, SPOTS.table.z, H - 0.26, {});
    kit.wallPicture(HW - 0.24, 3.0, -Math.PI / 2, { y: 1.6, w: 0.5, h: 0.6, color: mixHex(PAL.water.mid, PAL.cloth.cream, 0.3) });

    // a stool, a log basket and a broom: the three things a man living alone actually owns
    kit.stool(SPOTS.hearth.x + 1.7, SPOTS.hearth.z + 1.1, 0.3, {});
    kit.roomBarrel(SPOTS.hearth.x - 1.7, SPOTS.hearth.z + 1.2, 0.2, { s: 0.8, lid: false });
    kit.dustMotes(3.6, HD - 2.2, { n: 20, w: 1.5, h: 1.5, d: 1.8, y: 0.45 });
  },
});
