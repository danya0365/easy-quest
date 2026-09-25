/**
 * int_mill.js — THE PUDDLEWICK MILL, inside.                                 (P06 interior; art src/art/interior.js)
 *
 * The one room in the village with a MOVING machine in it: the great spur wheel turns on its shaft all day, the
 * hopper drips grain into the stones, and everything is an inch deep in flour, including the air. A boarded stair
 * goes up to the bin floor. `puddlewick_mill`'s door opens here.
 */
import { interiorMap, WALLS } from './int_common.js';
import { PAL, mixHex } from '../../art/palette.js';

const SPOTS = {
  stones: { x: -1.6, z: -2.4 },
  miller: { x: 1.4, z: -1.2, facing: 250 },
  sacks: { x: 4.4, z: -3.4 },
  bench: { x: -5.0, z: 1.4 },
  stair: { x: 5.2, z: 3.2 },
  barrels: { x: -5.4, z: -3.6 },
  scales: { x: 3.4, z: 1.8 },
  cat: { x: -3.6, z: 3.2 },
};

export default interiorMap({
  id: 'int_mill',
  name: 'the mill',
  plot: 'puddlewick_mill',
  doorName: 'the mill door',
  W: 12.6, D: 11.6, H: 2.9,
  doorX: 1.0,
  music: 'village',
  wall: 'planks',
  fill: 0.66,                                                    // dark planks eat the light (measured: mean 60/255 at 0.5)
  upperTint: mixHex(PAL.wood.weathered, PAL.plaster.light, 0.5), // a pale sun-bleached gable over dark boards
  wallTint: mixHex(PAL.wood.weathered, PAL.plaster.dark, 0.35),
  doorColor: PAL.wood.weathered,
  timberSides: ['north', 'west'],
  seed: 13,
  spots: SPOTS,
  windows: [
    { side: 'south', at: -3.6, y: 1.5, w: 1.0, h: 0.9, shutter: false, shaft: true, len: 4.0 },
    { side: 'west', at: 0.6, y: 1.55, w: 0.95, h: 0.9, shutter: false, shaft: true, len: 3.8 },
    { side: 'north', at: 3.2, y: 1.6, w: 0.9, h: 0.85, shutter: false },
  ],
  outLine: 'Out of the flour and the noise.',
  searchLines: [
    '%HERO% searches the mill.{n}Flour. It gets into everything.\nIt is getting into this\nsentence.',
  ],

  colliders: [
    { type: 'circle', x: SPOTS.stones.x, z: SPOTS.stones.z, r: 1.25, tag: 'stones' },
    { type: 'circle', x: SPOTS.sacks.x, z: SPOTS.sacks.z, r: 0.75, tag: 'sacks' },
    { type: 'circle', x: SPOTS.barrels.x, z: SPOTS.barrels.z, r: 0.72, tag: 'barrels' },
    { type: 'box', x: SPOTS.bench.x, z: SPOTS.bench.z, w: 0.8, d: 2.2, rot: 0, tag: 'bench' },
    { type: 'box', x: SPOTS.stair.x, z: SPOTS.stair.z, w: 1.7, d: 2.6, rot: 0, tag: 'stair' },
    { type: 'circle', x: SPOTS.scales.x, z: SPOTS.scales.z, r: 0.45, tag: 'scales' },
  ],

  props: [
    { type: 'millstones', name: 'the millstones', x: SPOTS.stones.x, z: SPOTS.stones.z + 1.5, line: 'stones', reach: 2.1, height: 1.8 },
    { type: 'sign', name: 'the hopper', x: SPOTS.stones.x - 1.5, z: SPOTS.stones.z, line: 'hopper', reach: 1.9, height: 2.2 },
    { type: 'table', name: 'the flour bench', x: SPOTS.bench.x + 0.8, z: SPOTS.bench.z, line: 'bench', reach: 1.7, height: 1.1 },
    { type: 'stairs', name: 'the stair up', x: SPOTS.stair.x - 1.1, z: SPOTS.stair.z + 1.2, line: 'stair', reach: 1.9, height: 2.0 },
    { type: 'sign', name: 'the scales', x: SPOTS.scales.x, z: SPOTS.scales.z + 0.6, line: 'scales', reach: 1.7, height: 1.2 },
  ],

  lines: {
    stones: ['Two stones the size of cart-\nwheels, one lying still and one\ngoing round on top of it.',
      'Do not put your hand in.{p}Everyone says that. Somebody\nmust have, once, for it to be a\nthing everyone says.'],
    hopper: ['Grain goes in the top and comes\nout of the bottom as something\nelse entirely.',
      'That is the most magic thing in\nthe village and nobody calls it\nmagic.'],
    bench: ['A bench worn white with flour,\nwith a tally scratched along its\nedge.',
      'One scratch for every sack. It\nruns off the end of the bench\nand onto the wall.'],
    stair: ['Up to the bin floor, where the\ngrain waits its turn.',
      'It is dark up there and it\nrustles.{p}It is grain. It is definitely\ngrain.'],
    scales: ['A brass pan on a chain, and a\nbox of little weights.',
      'The smallest weight is missing.\nIt has been missing for years\nand the mill has coped.'],
  },

  decorate(kit, R) {
    const H = R.H, HW = R.HW, HD = R.HD;

    // the machine: the stones in their tun, the hopper over them, and — where a child can actually SEE it —
    // the great gear, upright on its shaft, turning all day.
    kit.millstones(SPOTS.stones.x, SPOTS.stones.z, { r: 1.0 });
    kit.millGear(SPOTS.stones.x - 0.2, SPOTS.stones.z + 2.7, Math.PI / 2, { r: 0.92, teeth: 20, speed: 0.42, y: 1.0 });
    kit.floorPatch(SPOTS.stones.x, SPOTS.stones.z + 1.5, { rx: 1.1, rz: 0.8, color: PAL.plaster.mid, seed: 7 });
    kit.floorPatch(SPOTS.sacks.x - 0.6, SPOTS.sacks.z + 1.8, { rx: 0.55, rz: 0.45, color: PAL.plaster.mid, seed: 11 });

    // the sacks: full ones stacked, empty ones folded, flour on everything
    kit.sackPile(SPOTS.sacks.x, SPOTS.sacks.z, 0.2, { n: 4, seed: 11 });
    kit.sackPile(SPOTS.sacks.x - 1.3, SPOTS.sacks.z + 1.1, -0.6, { n: 3, seed: 17, s: 0.94 });
    kit.sackPile(-2.2, 4.0, 0.5, { n: 2, seed: 23, s: 0.9, color: mixHex(PAL.cloth.cream, PAL.dirt.light, 0.3) });
    kit.roomBarrel(SPOTS.barrels.x, SPOTS.barrels.z, 0.2, { s: 1.1 });
    kit.roomBarrel(SPOTS.barrels.x + 0.85, SPOTS.barrels.z + 0.5, -0.3, { s: 0.95 });

    // the bench under the west window, the scales, a crate of odds
    kit.workbench(SPOTS.bench.x, SPOTS.bench.z, Math.PI / 2, { w: 2.4, d: 0.78, rack: true, seed: 29 });
    kit.urn(SPOTS.scales.x, SPOTS.scales.z, { r: 0.26, h: 0.5, color: PAL.paint.iron, rim: false });
    kit.crateStack(SPOTS.scales.x - 0.1, SPOTS.scales.z - 0.05, 0.1, { n: 1, seed: 31, s: 1.1 });

    // the stair to the bin floor
    kit.roomStair(SPOTS.stair.x, SPOTS.stair.z + 1.3, 0, { w: 1.6, rise: 0.27, run: 0.36, n: 7, rail: true });

    // light and air: a lantern on a beam, and flour hanging in the window light
    kit.roomLamp(0.4, -0.2, H - 0.3, {});
    kit.wallSconce(-HW + 0.22, 3.0, Math.PI / 2, { y: 1.7, lantern: true });
    kit.dustMotes(-3.4, HD - 2.6, { n: 30, w: 2.2, h: 2.0, d: 2.6, y: 0.6 });
    kit.dustMotes(SPOTS.stones.x, SPOTS.stones.z + 1.0, { n: 16, w: 1.6, h: 1.6, d: 1.6, y: 0.7 });

    void HD;
  },
});
