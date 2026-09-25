/**
 * highfeather.js — Highfeather (Cloud Stair perch, Act III stub).                 (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'highfeather',
  name: 'Highfeather',
  kind: 'dungeon',
  theme: 'grass',
  music: 'overworld',
  hours: 14,
  seed: 163,
  armLabel: 'HIGH',
  landmarks: marks([{ id: 'puddlewick', az: 2.8 }, { id: 'saltmarrow', az: -0.8 }]),
  landmarkType: 'ruin',
  landmarkName: 'a golden perch',
  landmarkH: 3.2,
  landmarkLine: ['The Sunlark is the size of a cathedral\nand enormously polite.',
    'The Larkweave Cloak waits where\nthe wind is kindest.'],
  signLine: ['{gold}HIGHFEATHER{/gold}\nClouds underfoot. Manners above.'],
  exitTo: 'bellhollow_abbey',
  exitLanding: { x: 0, z: 6 },
  exitLine: 'Down the Cloud Stair to Bellhollow.',
  encounters: { rate: 0.3, table: [['peckish', 3], ['gloop', 2]] },
  lines: {},
  dress(kit) { try { kit.lantern(1.5, 2.5, 0); } catch (_) {} },
  flowers: [{ x: 2, z: 1, hue: PAL.flower.yellow, n: 10 }],
});
