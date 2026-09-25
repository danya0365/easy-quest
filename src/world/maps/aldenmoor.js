/**
 * aldenmoor.js — ALDENMOOR: the overworld stub (Act I breadth).                           (P23 night breadth)
 * CANON §2: green hills, a cold sea, a desert in the south, a castle in the clouds — later.
 * For now: a wide green so B3-adjacent travel and B8 moor beats have somewhere to stand.
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'aldenmoor',
  name: 'Aldenmoor',
  kind: 'field',
  size: [64, 52],
  theme: 'grass',
  music: 'overworld',
  seed: 91,
  armLabel: 'WORLD',
  landmarks: marks([
    { id: 'puddlewick', az: 2.4 },
    { id: 'saltmarrow', az: -0.5 },
    { id: 'coddleston', az: 1.1 },
  ]),
  landmarkType: 'hill',
  landmarkName: 'a green hill',
  landmarkLine: ['The moor rolls away until the\nsky takes over.',
    'Somewhere out there is every\nplace the signposts ever named.'],
  signLine: ['{gold}PUDDLEWICK{/gold} — a day\'s walk.\n{gold}SALTMARROW{/gold} — follow the Beck.\n{gold}CODDLESTON{/gold} — the copper spires.',
    'The fourth arm is blank. The\nworld is still being drawn.'],
  exitTo: 'meadow',
  encounters: { rate: 0.45, table: [['gloop', 5], ['peckish', 4], ['flapjack', 3], ['bumbleblunder', 2]] },
  hills: [{ x: -18, z: -12, r: 14, h: 1.8 }, { x: 16, z: 10, r: 12, h: 1.5 }, { x: 4, z: -18, r: 10, h: 1.3 }],
  dress(kit) {
    try { kit.lantern(1.5, 3.0, 0); } catch (_) {}
  },
  flowers: [{ x: -3, z: 3, hue: PAL.flower.yellow, n: 14 }, { x: 8, z: -2, hue: PAL.flower.blue, n: 12 }],
});
