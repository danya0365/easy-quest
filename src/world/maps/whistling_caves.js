/**
 * whistling_caves.js — THE WHISTLING CAVES (Act II B11).                          (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'whistling_caves',
  name: 'the Whistling Caves',
  kind: 'dungeon',
  theme: 'dirt',
  music: 'dungeon',
  ambience: 'amb_meadow',
  hours: 14,
  seed: 95,
  armLabel: 'CAVES',
  landmarks: marks([{ id: 'puddlewick', az: 2.2 }, { id: 'saltmarrow', az: -0.6 }]),
  landmarkType: 'ruin',
  landmarkName: 'a whistling mouth of rock',
  landmarkH: 2.8,
  landmarkLine: ['The wind invents a tune and then\nforgets it, every few seconds.',
    'Follow the note that sounds least\nlike a warning.'],
  signLine: ['{gold}WHISTLING CAVES{/gold}\nMind the drop. Mind the lunch.',
    'Somebody has left a packed lunch\non a rock. It is mostly philosophy.'],
  exitTo: 'meadow',
  exitLanding: { x: 3.6, z: 28.0 },
  exitLine: 'Daylight, and Parchmouth somewhere\nalong the coast.',
  encounters: { rate: 0.5, table: [['gloop', 3], ['ghostie', 3], ['batterfly', 2]] },
  spots: {
    bobble: { x: 0.2, z: -4.5, facing: Math.PI },
    bertie: { x: 2.0, z: -2.5, facing: Math.PI * 0.8 },
  },
  lines: {
    'to-goggle': 'The whistling thins. A warmer cave\nopens ahead — and a golden scrape.',
  },
  extra: {
    exits: [
      { x: 0, z: 18.5, w: 6.0, h: 4.0, to: 'meadow', tx: 3.6, tz: 28.0, kind: 'edge',
        name: 'the cave mouth', line: 'lane-out', back: { x: 0, z: 10 }, facing: 0 },
      { x: 0, z: -9.5, w: 4.0, h: 3.5, to: 'gogglestone_caves', tx: 0, tz: 8, kind: 'door',
        name: 'a warmer passage', line: 'to-goggle', back: { x: 0, z: -6 }, facing: Math.PI },
    ],
  },
  dress(kit) {
    try { kit.lantern(-1.2, 2.5, 0.3); } catch (_) {}
    try { kit.rock(-3.5, -3.0, 1.6, 17); } catch (_) {}
    try { kit.rock(3.2, -5.0, 1.3, 19); } catch (_) {}
    try { kit.rock(0.0, -6.5, 1.8, 21); } catch (_) {}
  },
  colliders: [
    { type: 'circle', x: -3.5, z: -3.0, r: 0.8, tag: 'rock' },
    { type: 'circle', x: 3.2, z: -5.0, r: 0.65, tag: 'rock' },
    { type: 'circle', x: 0.0, z: -6.5, r: 0.9, tag: 'rock' },
  ],
  flowers: [{ x: 2, z: 3, hue: PAL.flower.white, n: 4 }],
});
