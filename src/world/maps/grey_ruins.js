/**
 * grey_ruins.js — THE GREY RUINS: broken abbey on Coddleston Moor (Act I stub).           (P23 night breadth)
 * CANON §2 [19]: where Halvard falls (B9). Walkable ruin so the beat is a place, not a road card.
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'grey_ruins',
  name: 'the Grey Ruins',
  kind: 'field',
  theme: 'grass',
  music: 'dungeon',
  ambience: 'amb_meadow',
  hours: 17.5,
  seed: 77,
  armLabel: 'RUINS',
  landmarks: marks([{ id: 'coddleston', az: 0.4 }, { id: 'puddlewick', az: 2.6 }]),
  landmarkType: 'ruin',
  landmarkName: 'a broken arch',
  landmarkH: 3.2,
  landmarkLine: ['A stone arch that forgot what\nit was holding up.',
    'The wind goes through it and\ncomes out colder.'],
  signLine: ['{gold}THE GREY RUINS{/gold}\nNo further without a lantern.',
    'Underneath, in a careful hand:\n"Look at the sky."'],
  exitTo: 'coddleston',
  exitLanding: { x: 0, z: 6 },
  exitLine: 'Back toward Coddleston, and the\nbirthday banners still flying.',
  encounters: { rate: 0.55, table: [['quietling', 5], ['gloop', 2], ['grumpleroot', 2]] },
  spots: {
    mortmain: { x: -2.0, z: -6.0, facing: Math.PI * 0.15 },
    halvard: { x: 1.5, z: -5.0, facing: Math.PI },
    bertie: { x: 0.2, z: -3.5, facing: Math.PI },
  },
  dress(kit) {
    try { kit.lantern(-1.5, 2.0, 0); } catch (_) {}
    try { kit.drystoneWall([[-6.5, -4.0], [-3.0, -7.2], [0.5, -7.8]], { seed: 41 }); } catch (_) {}
    try { kit.drystoneWall([[2.0, -6.5], [5.5, -5.0]], { seed: 43 }); } catch (_) {}
    try { kit.rock(-5.2, -3.2, 1.4, 7); } catch (_) {}
    try { kit.rock(3.8, -4.6, 1.1, 9); } catch (_) {}
    try { kit.stump(-1.2, -1.5, 0.4, { s: 1.0, seed: 3 }); } catch (_) {}
  },
  colliders: [
    { type: 'capsule', pts: [[-6.5, -4.0], [-3.0, -7.2], [0.5, -7.8]], r: 0.35, tag: 'rubble' },
    { type: 'capsule', pts: [[2.0, -6.5], [5.5, -5.0]], r: 0.35, tag: 'rubble' },
    { type: 'circle', x: -5.2, z: -3.2, r: 0.7, tag: 'rock' },
    { type: 'circle', x: 3.8, z: -4.6, r: 0.55, tag: 'rock' },
    { type: 'circle', x: -1.2, z: -1.5, r: 0.4, tag: 'stump' },
  ],
  flowers: [{ x: 2, z: 2, hue: PAL.flower.white, n: 6 }],
});
