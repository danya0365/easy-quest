/**
 * quiet_quarry.js — THE QUIET QUARRY (Act II start).                              (P23 + P25 night breadth)
 * CANON §2: black-stone works where Bram and Bertie spent ten years. Walkable stub so B10 is a place.
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'quiet_quarry',
  name: 'the Quiet Quarry',
  kind: 'dungeon',
  theme: 'dirt',
  music: 'dungeon',
  ambience: 'amb_meadow',
  hours: 10,
  seed: 91,
  armLabel: 'QUARRY',
  landmarks: marks([{ id: 'coddleston', az: 1.2 }, { id: 'puddlewick', az: 2.8 }]),
  landmarkType: 'ruin',
  landmarkName: 'a black stone gate',
  landmarkH: 3.4,
  landmarkR: 1.4,
  landmarkLine: ['The gate is shut from the outside.\nIt always was.',
    'Black stone, and the kind of silence\nthat has been practising.'],
  signLine: ['{gold}THE QUIET QUARRY{/gold}\nChores. Breakfast. Do not look at the gate.',
    'Underneath, scratched by a small knife:\n"3652 mornings — B."'],
  exitTo: 'meadow',
  exitLanding: { x: 3.6, z: 28.0 },
  exitLine: 'The hole Digby dug smells of rain.\nOut, toward the wind.',
  encounters: { rate: 0.4, table: [['quietling', 4], ['gloop', 3], ['grumpleroot', 2]] },
  spots: {
    bertie: { x: 1.2, z: -3.0, facing: Math.PI },
    digby: { x: -2.5, z: -5.5, facing: 0.4 },
    wall: { x: -3.0, z: -7.0 },
  },
  lines: {
    'to-caves': 'The wall Digby softened opens onto\nwind and whistling stone.',
  },
  extra: {
    exits: [
      { x: 0, z: 18.5, w: 6.0, h: 4.0, to: 'meadow', tx: 3.6, tz: 28.0, kind: 'edge',
        name: 'the hole Digby dug', line: 'lane-out', back: { x: 0, z: 10 }, facing: 0 },
      { x: -2.5, z: -9.5, w: 4.0, h: 3.5, to: 'whistling_caves', tx: 0, tz: 8, kind: 'door',
        name: 'a soft place in the wall', line: 'to-caves', back: { x: -2.0, z: -6.0 }, facing: Math.PI },
    ],
  },
  dress(kit) {
    try { kit.lantern(1.0, 3.0, 0); } catch (_) {}
    try { kit.drystoneWall([[-7, -2], [-5, -6], [-2, -8]], { seed: 91 }); } catch (_) {}
    try { kit.drystoneWall([[2, -7], [5, -5], [6, -2]], { seed: 93 }); } catch (_) {}
    try { kit.rock(-4.5, -4.0, 1.5, 11); } catch (_) {}
    try { kit.rock(4.0, -3.5, 1.2, 13); } catch (_) {}
    try { kit.crate(-1.0, 1.5, 0.2); } catch (_) {}
    try { kit.barrel(0.5, 2.0, 1); } catch (_) {}
  },
  colliders: [
    { type: 'capsule', pts: [[-7, -2], [-5, -6], [-2, -8]], r: 0.4, tag: 'wall' },
    { type: 'capsule', pts: [[2, -7], [5, -5], [6, -2]], r: 0.4, tag: 'wall' },
    { type: 'circle', x: -4.5, z: -4.0, r: 0.75, tag: 'rock' },
    { type: 'circle', x: 4.0, z: -3.5, r: 0.6, tag: 'rock' },
  ],
  flowers: [],
  tufts: { count: 200, radius: 14 },
});
