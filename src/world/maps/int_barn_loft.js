/**
 * int_barn_loft.js — Hollybank barn hayloft (up the boarded stair).                      (P23 / P06)
 * P06 gap #1: the loft was only a line of text. Now it is a place.
 */
import { interiorMap } from './int_common.js';
import { PAL, mixHex } from '../../art/palette.js';
import { reportError } from '../../engine/debug.js';

export default interiorMap({
  id: 'int_barn_loft',
  name: 'the hayloft',
  plot: 'hollybank_barn',
  doorName: 'the ladder down',
  W: 11.5, D: 9.0, H: 2.5,
  doorX: 0,
  music: 'village',
  wall: 'planks',
  wallTint: mixHex(PAL.wood.weathered, PAL.plaster.dark, 0.45),
  fill: 0.72,
  upper: false,
  seed: 29,
  exitTo: 'int_barn',
  doorstep: () => ({ x: 3.5, z: 2.0, facing: Math.PI }),
  outLine: 'Down the ladder, into the smell of hay.',
  spots: { hay: { x: -2.0, z: -1.5 }, nest: { x: 3.0, z: 1.2 } },
  props: [
    { type: 'hay', name: 'the loft hay', x: -2.0, z: -1.5, line: 'hay', reach: 2.0, height: 1.3 },
    { type: 'nest', name: 'a swallow nest', x: 3.0, z: 1.2, line: 'nest', reach: 1.8, height: 1.5 },
  ],
  colliders: [
    { type: 'circle', x: -2.0, z: -1.5, r: 1.0, tag: 'hay' },
    { type: 'circle', x: 3.0, z: 1.2, r: 0.45, tag: 'nest' },
  ],
  lines: {
    hay: ['Hay stacked to the rafters. It\nsmells of last summer.'],
    nest: ['A swallow nest under the eaves.\nEmpty. They will be back.'],
    search: ['%HERO% looks along the loft.{n}Hay, dust, and a square of sky\nin the roof.'],
    'door-out': 'Down the ladder, into the smell\nof hay.',
  },
  decorate(kit) {
    const safe = (n, fn) => { try { fn(); } catch (e) { reportError(`int_barn_loft: ${n}`, e); } };
    safe('hay', () => kit.hay && kit.hay(-2.0, -1.5, 0, { s: 1.2 }));
    safe('lantern', () => kit.lantern && kit.lantern(0, 0, 0, { hanging: true }));
  },
});
