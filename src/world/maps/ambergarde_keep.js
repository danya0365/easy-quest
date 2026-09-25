/**
 * ambergarde_keep.js — Ambergarde Keep (B18/B21).                                              (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'ambergarde_keep',
  name: 'Ambergarde Keep',
  kind: 'town',
  theme: 'grass',
  music: 'castle',
  hours: 12,
  seed: 123,
  armLabel: 'KEEP',
  landmarks: marks([{ id: 'puddlewick', az: 2.5 }, { id: 'saltmarrow', az: -0.5 }]),
  landmarkType: 'ruin',
  landmarkName: 'the keep gate',
  landmarkH: 3.0,
  landmarkLine: ['A court that kneels.\nA sword that will not come for you.'],
  signLine: ['{gold}AMBERGARDE KEEP{/gold}\nThe sword waits in the stone.'],
  exitTo: 'ambergarde',
  exitLanding: { x: 0, z: 6 },
  exitLine: 'The road back.',
  encounters: null,
  dress(kit) { try { kit.lantern(1.5, 2.5, 0); } catch (_) {} },
  flowers: [{ x: 3, z: 1, hue: PAL.flower.white, n: 8 }],
  lines: { 'to-garden': 'The Stone Garden path. Chip the stone.' },
  extra: {
    exits: [
      { x: 0, z: 18.5, w: 6.0, h: 4.0, to: 'ambergarde', tx: 0, tz: 6, kind: 'edge',
        name: 'the keep door', line: 'lane-out', back: { x: 0, z: 10 }, facing: 0 },
      { x: 0, z: -9.5, w: 4.0, h: 3.5, to: 'stone_garden', tx: 0, tz: 8, kind: 'door',
        name: 'the garden path', line: 'to-garden', back: { x: 0, z: -6 }, facing: Math.PI },
    ],
  },
});
