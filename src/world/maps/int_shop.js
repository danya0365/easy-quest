/**
 * int_shop.js — MR HAMMOND'S SHOP, inside.                                    (P06 interior; art src/art/interior.js)
 *
 * The shop door's line out on the green is "Iron, oil, and Mr Hammond deciding, very slowly, that you are not
 * ready for any of it" (puddlewick.npcs.js). This is the iron and the oil: a counter you cannot see over, a wall
 * of wares, barrels of nails, crates, a tool rack, and a sword on the wall that a six-year-old is going to ask
 * about. `puddlewick_shop`'s door opens here.
 */
import { interiorMap, WALLS } from './int_common.js';
import { PAL, mixHex } from '../../art/palette.js';

const SPOTS = {
  counter: { x: 0.2, z: -1.6 },
  keeper: { x: 0.2, z: -2.8, facing: 0 },
  rack: { x: -0.4, z: -4.9 },
  bench: { x: 4.6, z: -2.2 },
  crates: { x: -5.2, z: -3.4 },
  barrels: { x: -5.6, z: 0.6 },
  pots: { x: 5.4, z: 2.4 },
  sword: { x: 4.3, z: -5.0 },
};

export default interiorMap({
  id: 'int_shop',
  name: "Mr Hammond's shop",
  plot: 'puddlewick_shop',
  doorName: 'the shop door',
  W: 12.6, D: 10.6,
  doorX: -0.8,
  music: 'village',
  wallTint: WALLS.smoke,
  fill: 0.58,          // the smoke-grey plaster reads darker than the other rooms
  doorColor: PAL.paint.shutterBlue,
  seed: 9,
  spots: SPOTS,
  windows: [
    { side: 'south', at: 3.6, y: 1.4, w: 1.15, h: 0.95, shutter: PAL.paint.shutterBlue, shaft: true, len: 3.8 },
    { side: 'west', at: -1.6, y: 1.42, w: 0.95, h: 0.85, shutter: PAL.paint.shutterBlue, shaft: true, len: 3.4 },
    { side: 'east', at: 1.2, y: 1.42, w: 0.95, h: 0.85, shutter: PAL.paint.shutterBlue, shaft: true, len: 3.4 },
  ],
  outLine: 'Out onto the green, still empty-\nhanded.',
  searchLines: [
    '%HERO% searches the shop.{n}Everything in here costs money\nand he has the wrong amount,\nwhich is none.',
  ],

  colliders: [
    { type: 'box', x: SPOTS.counter.x, z: SPOTS.counter.z, w: 5.0, d: 0.95, rot: 0, tag: 'counter' },
    { type: 'box', x: SPOTS.rack.x, z: SPOTS.rack.z, w: 3.0, d: 0.5, rot: 0, tag: 'rack' },
    { type: 'box', x: SPOTS.bench.x, z: SPOTS.bench.z, w: 0.8, d: 2.1, rot: 0, tag: 'bench' },
    { type: 'circle', x: SPOTS.crates.x, z: SPOTS.crates.z, r: 0.6, tag: 'crates' },
    { type: 'circle', x: SPOTS.barrels.x, z: SPOTS.barrels.z, r: 0.7, tag: 'barrels' },
    { type: 'circle', x: SPOTS.pots.x, z: SPOTS.pots.z, r: 0.55, tag: 'pots' },
    { type: 'circle', x: -3.6, z: 2.2, r: 0.42, tag: 'crates' },
    { type: 'circle', x: 3.9, z: 2.4, r: 0.38, tag: 'barrel' },
  ],

  props: [
    { type: 'counter', name: 'the counter', x: SPOTS.counter.x, z: SPOTS.counter.z + 0.75, line: 'counter', reach: 2.0, height: 1.3 },
    { type: 'sign', name: 'the sword on the wall', x: SPOTS.sword.x, z: SPOTS.sword.z + 0.7, line: 'sword', reach: 2.0, height: 2.3 },
    { type: 'shelf', name: 'the wall of wares', x: SPOTS.rack.x, z: SPOTS.rack.z + 0.7, line: 'wares', reach: 1.8, height: 1.7 },
    { type: 'table', name: "the mending bench", x: SPOTS.bench.x - 0.7, z: SPOTS.bench.z, line: 'bench', reach: 1.7, height: 1.1 },
    { type: 'sign', name: 'the price list', x: SPOTS.counter.x - 2.2, z: SPOTS.counter.z - 0.3, line: 'prices', reach: 1.8, height: 1.7 },
  ],

  lines: {
    counter: ['The counter is a plank on two\nbarrels and it has held up\neverything this village owns.',
      'There is a dent in it the exact\nshape of a horseshoe.'],
    sword: ['A sword on two pegs, high up.{p}It is not for sale. It is for\nlooking at.',
      'There is a mark on the wall\nunder it where somebody\nmeasured himself.',
      'It is quite a low mark.'],
    wares: ['Nails by the pound, lamp oil,\nrope, a bolt of cloth, and eleven\nkinds of hook.',
      'Nobody has ever needed eleven\nkinds of hook. Everybody has\nbought one.'],
    bench: ['A vice, a hammer, and somebody\nelse\'s kettle waiting to be\nmended.',
      'It has been waiting a while.'],
    prices: ['{gold}NAILS{/gold} — 2 G a dozen\n{gold}LAMP OIL{/gold} — 4 G\n{gold}ROPE{/gold} — 6 G\n{gold}SWORD{/gold} — 11 G',
      'Beside the last one, in pencil:\n"ASK ME AGAIN WHEN YOU ARE\nTALLER."'],
  },

  decorate(kit, R) {
    const H = R.H, HW = R.HW, HD = R.HD;

    // the counter across the room, and the wall of wares behind it
    kit.counter(SPOTS.counter.x, SPOTS.counter.z, 0, { w: 4.9, d: 0.9, h: 1.04 });
    kit.goodsRack(SPOTS.rack.x, -HD + 0.3, 0, { w: 3.6, h: 2.1, d: 0.4, seed: 17 });
    kit.shelf(2.9, -HD + 0.22, 0, { w: 1.6, y: 1.24, n: 2, seed: 25 });

    // the sword on two pegs, and the mark on the wall under it
    kit.wallSword(SPOTS.sword.x, -HD + 0.2, 0, { y: 2.12, len: 1.3 });
    kit.wallPicture(-4.2, -HD + 0.2, 0, { y: 1.72, w: 0.56, h: 0.42 });

    // the mending bench under the east window, the tools over it
    kit.workbench(SPOTS.bench.x, SPOTS.bench.z, Math.PI / 2, { w: 2.2, d: 0.76, rack: true, seed: 33 });

    // the stock: crates, nail barrels, pots, a coil of rope
    kit.crateStack(SPOTS.crates.x, SPOTS.crates.z, 0.15, { n: 3, seed: 7 });
    kit.crateStack(SPOTS.crates.x + 1.2, SPOTS.crates.z - 0.5, -0.4, { n: 2, seed: 13, s: 0.9 });
    kit.roomBarrel(SPOTS.barrels.x, SPOTS.barrels.z, 0.1, { s: 1.1 });
    kit.roomBarrel(SPOTS.barrels.x + 0.8, SPOTS.barrels.z + 0.55, -0.3, { s: 0.95 });
    kit.potGroup(SPOTS.pots.x, SPOTS.pots.z, { n: 4, seed: 27, spread: 0.55 });
    kit.sackPile(-5.4, 3.4, 0.4, { n: 3, seed: 37, color: mixHex(PAL.cloth.cream, PAL.dirt.light, 0.4) });

    // light: a hanging lamp over the counter and a lantern on a bracket by the door
    kit.roomLamp(SPOTS.counter.x, SPOTS.counter.z + 0.4, H - 0.25, {});
    kit.wallSconce(HW - 0.22, 3.0, -Math.PI / 2, { y: 1.7, lantern: true });
    kit.wallSconce(-HW + 0.22, -1.8, Math.PI / 2, { y: 1.7, lantern: true });
    kit.hangingHerbs(-3.0, -1.0, H - 0.3, { n: 2, seed: 41, spread: 0.35 });

    kit.rug(0.4, 1.9, 0.08, { w: 3.0, d: 1.8, color: PAL.cloth.blue, seed: 9 });
    // something for a child to walk round on the way to the counter, so the floor is not a bare stage
    kit.crateStack(-3.6, 2.2, -0.25, { n: 2, seed: 71, s: 0.95 });
    kit.roomBarrel(3.9, 2.4, 0.15, { s: 1.0 });
    kit.urn(4.7, 3.1, { r: 0.28, h: 0.6, color: PAL.tile.light });
    kit.dustMotes(3.4, HD - 2.6, { n: 18, w: 1.5, h: 1.5, d: 1.8, y: 0.5 });
  },
});
