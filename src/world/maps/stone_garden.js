/**
 * stone_garden.js — the Stone Garden (B20/B26).                                              (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'stone_garden',
  name: 'the Stone Garden',
  kind: 'field',
  theme: 'grass',
  music: 'family',
  hours: 12,
  seed: 127,
  armLabel: 'STONE',
  landmarks: marks([{ id: 'puddlewick', az: 2.5 }, { id: 'saltmarrow', az: -0.5 }]),
  landmarkType: 'ruin',
  landmarkName: 'Papa’s stone',
  landmarkH: 3.0,
  landmarkLine: ['Nine years of quiet.\nOne chip at a time.'],
  signLine: ['{gold}THE STONE GARDEN{/gold}\nChip the stone. Keep hitting it.'],
  exitTo: 'ambergarde_keep',
  exitLanding: { x: 0, z: 6 },
  exitLine: 'The road back.',
  encounters: { rate: 0.25, table: [['gloop', 3], ['peckish', 2]] },
  dress(kit) { try { kit.lantern(1.5, 2.5, 0); } catch (_) {} },
  flowers: [{ x: 3, z: 1, hue: PAL.flower.white, n: 8 }],
});
