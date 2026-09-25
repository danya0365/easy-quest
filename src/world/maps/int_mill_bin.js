/**
 * int_mill_bin.js — the mill bin floor (up the boarded stair).                              (P23 / P06)
 * P23 gap #8: a stair needs somewhere to go. This is the bin loft — flour dust and quiet.
 */
import { interiorMap } from './int_common.js';
import { PAL, mixHex } from '../../art/palette.js';
import { reportError } from '../../engine/debug.js';

export default interiorMap({
  id: 'int_mill_bin',
  name: 'the bin floor',
  plot: 'puddlewick_mill',
  doorName: 'the stair down',
  W: 11.0, D: 9.5, H: 2.6,
  doorX: 0,
  music: 'village',
  wall: 'planks',
  wallTint: mixHex(PAL.wood.weathered, PAL.plaster.dark, 0.4),
  fill: 0.7,
  upper: false,
  seed: 17,
  outLine: 'Down the stair, back into the noise.',
  // Exit returns to int_mill, not the village green.
  exitTo: 'int_mill',
  doorstep: () => ({ x: 4.0, z: 2.0, facing: Math.PI }),
  spots: { hopper: { x: 0, z: -1.5 }, sacks: { x: 3.2, z: 1.0 } },
  props: [
    { type: 'sack', name: 'the grain bins', x: 0, z: -1.5, line: 'bins', reach: 2.0, height: 1.4 },
    { type: 'sack', name: 'stacked sacks', x: 3.2, z: 1.0, line: 'sacks', reach: 1.7, height: 1.2 },
  ],
  colliders: [
    { type: 'box', x: 0, z: -1.5, w: 3.4, d: 1.4, rot: 0, tag: 'bins' },
    { type: 'circle', x: 3.2, z: 1.0, r: 0.7, tag: 'sacks' },
  ],
  lines: {
    bins: ['Grain waits its turn in long\nwooden bins. It is very patient\nand slightly dusty.'],
    sacks: ['Sacks stamped with a mill-mark.\nOne has a mouse-hole. The mouse\nis not currently in.'],
    search: ['%HERO% looks along the bins.{n}Flour. More flour. A quiet that\nis made of flour.'],
    'door-out': 'Down the stair, back into the\nnoise of the stones.',
  },
  decorate(kit) {
    const safe = (n, fn) => { try { fn(); } catch (e) { reportError(`int_mill_bin: ${n}`, e); } };
    safe('sacks', () => kit.sacks && kit.sacks(3.2, 1.0, 0, { n: 3 }));
    safe('lantern', () => kit.lantern && kit.lantern(0, 0, 0, { h: 2.2, hanging: true }));
  },
});
