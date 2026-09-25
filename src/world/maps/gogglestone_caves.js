/**
 * gogglestone_caves.js — GOGGLESTONE CAVES (Act II B11b — the Sunmane).           (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'gogglestone_caves',
  name: 'Gogglestone Caves',
  kind: 'dungeon',
  theme: 'dirt',
  music: 'dungeon',
  ambience: 'amb_meadow',
  hours: 16,
  seed: 99,
  armLabel: 'GOGGLE',
  landmarks: marks([{ id: 'puddlewick', az: 2.5 }, { id: 'saltmarrow', az: -0.2 }]),
  landmarkType: 'ruin',
  landmarkName: 'a golden scrape on the stone',
  landmarkH: 2.6,
  landmarkLine: ['Something large has been sharpening\nits claws on this wall.',
    'Gold hair catches in the cracks.'],
  signLine: ['{gold}GOGGLESTONE CAVES{/gold}\nPuddlewick folk will not come here.',
    'They say a great golden beast lives\ninside. They are right.'],
  exitTo: 'puddlewick',
  exitLanding: { x: 14.8, z: 20.0 },
  exitLine: 'Back toward Puddlewick, and the folk\nwho were frightened of a kitten.',
  encounters: { rate: 0.45, table: [['batterfly', 3], ['twiglet', 3], ['gloop', 2]] },
  spots: {
    sunmane: { x: 0.0, z: -6.0, facing: Math.PI },
  },
  lines: {
    'to-home': 'The caves open onto the lane home.\nHollybank is waiting.',
  },
  extra: {
    exits: [
      { x: 0, z: 18.5, w: 6.0, h: 4.0, to: 'puddlewick', tx: 14.8, tz: 20.0, kind: 'edge',
        name: 'the cave mouth', line: 'lane-out', back: { x: 0, z: 10 }, facing: 0 },
      { x: 0, z: -9.5, w: 4.0, h: 3.5, to: 'hollybank', tx: 0, tz: 2, kind: 'door',
        name: 'a crack toward home', line: 'to-home', back: { x: 0, z: -6 }, facing: Math.PI },
    ],
  },
  dress(kit) {
    try { kit.lantern(1.5, 2.0, -0.2); } catch (_) {}
    try { kit.rock(-4.0, -4.5, 1.7, 23); } catch (_) {}
    try { kit.rock(4.2, -5.2, 1.4, 25); } catch (_) {}
    try { kit.stump(-1.5, -1.0, 0.5, { s: 1.1, seed: 5 }); } catch (_) {}
  },
  colliders: [
    { type: 'circle', x: -4.0, z: -4.5, r: 0.85, tag: 'rock' },
    { type: 'circle', x: 4.2, z: -5.2, r: 0.7, tag: 'rock' },
    { type: 'circle', x: -1.5, z: -1.0, r: 0.45, tag: 'stump' },
  ],
  flowers: [],
});
