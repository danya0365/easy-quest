/**
 * ambergarde.js — AMBERGARDE headland (Act II stub).                              (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'ambergarde',
  name: 'Ambergarde',
  kind: 'town',
  theme: 'grass',
  music: 'castle',
  hours: 15,
  seed: 107,
  armLabel: 'AMBER',
  landmarks: marks([{ id: 'saltmarrow', az: -2.0 }, { id: 'puddlewick', az: 2.4 }]),
  landmarkType: 'ruin',
  landmarkName: 'a door on a green headland',
  landmarkH: 3.2,
  landmarkLine: ['The Ambergarde Crest fits this door\nas if it had been waiting.',
    'Beyond it, a court that kneels before\nit knows your name.'],
  signLine: ['{gold}AMBERGARDE{/gold}\nThe crest opens what blood remembers.',
    'A smaller note: the sword in the keep\nis not for you. Not yet.'],
  exitTo: 'meadow',
  exitLanding: { x: 3.6, z: 28.0 },
  exitLine: 'The road back down the headland.',
  encounters: { rate: 0.3, table: [['gloop', 3], ['peckish', 2]] },
  spots: { court: { x: 0, z: -5.0 } },
  lines: {
    'to-keep': 'The keep door. The sword waits inside.\nIt is not for you. Not yet.',
  },
  extra: {
    exits: [
      { x: 0, z: 18.5, w: 6.0, h: 4.0, to: 'meadow', tx: 3.6, tz: 28.0, kind: 'edge',
        name: 'the headland road', line: 'lane-out', back: { x: 0, z: 10 }, facing: 0 },
      { x: 0, z: -9.5, w: 4.0, h: 3.5, to: 'ambergarde_keep', tx: 0, tz: 8, kind: 'door',
        name: 'the keep door', line: 'to-keep', back: { x: 0, z: -6 }, facing: Math.PI },
    ],
  },
  dress(kit) {
    try { kit.lantern(-2.5, 2.0, 0); } catch (_) {}
    try { kit.lantern(2.5, 2.0, 0); } catch (_) {}
    try { kit.rock(-5.0, -3.0, 1.2, 31); } catch (_) {}
  },
  colliders: [{ type: 'circle', x: -5.0, z: -3.0, r: 0.6, tag: 'rock' }],
  flowers: [{ x: 4, z: 2, hue: PAL.flower.yellow, n: 8 }],
});
