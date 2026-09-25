/**
 * int_bakery.js — NAN PUDDIFOOT'S BAKERY, inside.                             (P06 interior; art src/art/interior.js)
 *
 * WORLD-BIBLE §3 gives Puddlewick a baker who calls everyone "love" and hands a boy a warm one and tells him not
 * to tell his father. This is the room that happens in: a brick oven with the fire in it, a flagged floor worn
 * pale in front of it, a kneading bench under the window, flour in sacks, bread on every shelf, herbs on the beam
 * and a ginger cat asleep where the warmth is. `puddlewick_bakery`'s door opens here.
 */
import { interiorMap, WALLS } from './int_common.js';
import { PAL } from '../../art/palette.js';

const SPOTS = {
  oven: { x: -3.3, z: -4.2 },
  counter: { x: 2.7, z: 0.2 },
  keeper: { x: 2.7, z: -0.9, facing: 0 },          // behind the counter, looking at the door
  bench: { x: -4.9, z: 1.5 },
  sacks: { x: -5.3, z: 3.5 },
  cat: { x: -1.5, z: -3.2 },
  shelf: { x: -6.0, z: -0.8 },
  crates: { x: 5.3, z: 3.2 },
  pots: { x: 5.6, z: -3.6 },
};

export default interiorMap({
  id: 'int_bakery',
  name: "Nan Puddifoot's bakery",
  plot: 'puddlewick_bakery',
  doorName: 'the bakery door',
  W: 12.6, D: 10.6,
  doorX: 0.6,
  music: 'village',
  wallTint: WALLS.ochre,
  doorColor: PAL.paint.shutterGreen,
  seed: 5,
  spots: SPOTS,
  // the flagged floor in front of the oven — a baker does not stand on boards
  stoneFloor: (x, z) => (x > -6.0 && x < 0.6 && z < 0.2),
  windows: [
    { side: 'south', at: -4.2, y: 1.4, w: 1.05, h: 0.9, shutter: PAL.paint.shutterGreen, shaft: true, len: 3.6 },
    { side: 'south', at: 4.4, y: 1.4, w: 1.05, h: 0.9, shutter: PAL.paint.shutterGreen },
    { side: 'east', at: 0.4, y: 1.4, w: 0.95, h: 0.85, shutter: PAL.paint.shutterGreen, shaft: true, len: 3.4 },
  ],
  outLine: 'Out into the afternoon, smelling\nof bread.',
  searchLines: [
    '%HERO% searches the bakery.{n}Flour. Flour everywhere. Some of\nit is on him now.',
    '%HERO% looks under the bench.{n}A wooden spoon with a bite\ntaken out of it.',
  ],

  colliders: [
    { type: 'box', x: SPOTS.oven.x, z: SPOTS.oven.z, w: 2.6, d: 1.7, rot: 0, tag: 'oven' },
    { type: 'box', x: SPOTS.counter.x, z: SPOTS.counter.z, w: 3.6, d: 0.95, rot: 0, tag: 'counter' },
    { type: 'box', x: SPOTS.bench.x, z: SPOTS.bench.z, w: 0.8, d: 2.2, rot: 0, tag: 'bench' },
    { type: 'circle', x: SPOTS.sacks.x, z: SPOTS.sacks.z, r: 0.7, tag: 'sacks' },
    { type: 'circle', x: SPOTS.crates.x, z: SPOTS.crates.z, r: 0.55, tag: 'crates' },
    { type: 'circle', x: SPOTS.pots.x, z: SPOTS.pots.z, r: 0.55, tag: 'pots' },
    { type: 'box', x: SPOTS.shelf.x, z: SPOTS.shelf.z, w: 0.34, d: 2.2, rot: 0, tag: 'shelf' },
    { type: 'box', x: -1.4, z: 1.9, w: 1.6, d: 1.1, rot: 0.12, tag: 'table' },
    { type: 'circle', x: -6.0, z: 3.9, r: 0.4, tag: 'barrel' },
  ],

  props: [
    { type: 'oven', name: 'the oven', x: SPOTS.oven.x, z: SPOTS.oven.z + 1.3, line: 'oven', reach: 2.0, height: 1.8 },
    { type: 'counter', name: 'the counter', x: SPOTS.counter.x, z: SPOTS.counter.z + 0.7, line: 'counter', reach: 1.9, height: 1.3 },
    { type: 'table', name: 'the kneading bench', x: SPOTS.bench.x + 0.8, z: SPOTS.bench.z, line: 'bench', reach: 1.7, height: 1.1 },
    { type: 'shelf', name: 'the bread shelf', x: SPOTS.shelf.x + 0.6, z: SPOTS.shelf.z, line: 'bread', reach: 1.7, height: 1.7 },
    { type: 'sign', name: 'the price slate', x: SPOTS.counter.x + 2.2, z: SPOTS.counter.z - 0.2, line: 'slate', reach: 1.8, height: 1.7 },
  ],

  lines: {
    oven: ['The oven is roaring. You can\nfeel it in your teeth.',
      'A whole village worth of loaves\ngoes in this hole every morning\nbefore anybody is awake.'],
    counter: ['The counter is dusted white, and\nso is everything within a yard\nof it.', 'Including, now, you.'],
    bench: ['A slab worn into a dip in the\nmiddle by forty years of the same\ntwo hands.'],
    bread: ['Cottage loaves, a plait, and one\nthat has gone a shape nobody\nordered.',
      'That one is sold at half price\nand it is always the first to go.'],
    slate: ['{gold}LOAF{/gold} — 3 G\n{gold}PLAIT{/gold} — 5 G\n{gold}BUN{/gold} — 1 G',
      'Underneath, rubbed nearly out:\n"BOYS WITH NO MONEY — 0 G.\nDO NOT TELL YOUR FATHER."'],
  },

  decorate(kit, R) {
    const H = R.H, HW = R.HW, HD = R.HD;
    // the flagged floor the oven stands on
    kit.flagFloor(-2.9, -2.6, { w: 6.0, d: 5.0, seed: 4 });
    kit.oven(SPOTS.oven.x, SPOTS.oven.z, 0, { w: 2.4, h: 2.0, d: 1.5, lit: true, peel: true });

    // the counter a child cannot see over, with today's bread on it
    kit.counter(SPOTS.counter.x, SPOTS.counter.z, 0, { w: 3.5, d: 0.9, h: 1.02 });
    kit.loafTray(SPOTS.counter.x - 0.7, SPOTS.counter.z - 0.1, 0.1, { n: 4, y: 1.04, seed: 23 });
    kit.loafTray(SPOTS.counter.x + 1.0, SPOTS.counter.z + 0.05, -0.15, { n: 3, y: 1.04, seed: 29 });

    // the kneading bench under the west window, and the flour it works through
    kit.workbench(SPOTS.bench.x, SPOTS.bench.z, Math.PI / 2, { w: 2.4, d: 0.78, rack: true, seed: 8 });
    kit.sackPile(SPOTS.sacks.x, SPOTS.sacks.z, 0.3, { n: 4, seed: 11 });
    kit.sackPile(SPOTS.sacks.x + 1.3, SPOTS.sacks.z + 0.4, -0.5, { n: 2, seed: 15, s: 0.9 });

    // bread everywhere, herbs on the beam, onions on a nail
    kit.shelf(SPOTS.shelf.x - 0.1, SPOTS.shelf.z, Math.PI / 2, { w: 2.2, y: 1.28, n: 2, seed: 12 });
    kit.hangingHerbs(-0.4, -1.4, H - 0.3, { n: 3, seed: 13, spread: 0.55 });
    kit.onionRope(HW - 0.25, -2.8, 1.92, { n: 5, seed: 19 });
    kit.wallSconce(HW - 0.22, 1.6, -Math.PI / 2, { y: 1.66 });
    kit.wallSconce(-HW + 0.22, -2.6, Math.PI / 2, { y: 1.66 });

    // the corners a child pokes about in
    kit.crateStack(SPOTS.crates.x, SPOTS.crates.z, 0.2, { n: 3, seed: 7 });
    kit.potGroup(SPOTS.pots.x, SPOTS.pots.z, { n: 3, seed: 21, spread: 0.5 });
    kit.roomBarrel(-6.0, 3.9, 0.2, { s: 1.05 });

    // the middle of the room is where a village waits for bread: a table, two stools and a basket on the boards
    kit.roomTable(-1.4, 1.9, 0.12, { w: 1.5, d: 1.0, top: 0.76,
      things: [{ kind: 'bowl', x: -0.3, z: 0.05 }, { kind: 'loaf', x: 0.28, z: -0.05 }, { kind: 'cup', x: 0.1, z: 0.28 }] });
    kit.stool(-2.5, 2.1, 0.2, {});
    kit.stool(-0.5, 2.5, -0.3, {});
    kit.loafTray(-4.4, -0.6, 1.4, { n: 3, y: 0.06, seed: 41 });     // a tray cooling on the flags

    // flour in the light from the window
    kit.dustMotes(-4.0, HD - 2.4, { n: 20, w: 1.6, h: 1.5, d: 1.8, y: 0.45 });
    kit.rug(1.4, 3.0, 0.1, { w: 2.6, d: 1.6, color: PAL.cloth.mustard, seed: 6 });
    kit.roomLamp(0.8, 0.4, H - 0.25, {});
  },
});
