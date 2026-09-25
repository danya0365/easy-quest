/**
 * marbleford_chapel.js — Marbleford Chapel (B17).                                              (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'marbleford_chapel',
  name: 'Marbleford Chapel',
  kind: 'town',
  theme: 'grass',
  music: 'church',
  hours: 12,
  seed: 119,
  armLabel: 'CHAPEL',
  landmarks: marks([{ id: 'puddlewick', az: 2.5 }, { id: 'saltmarrow', az: -0.5 }]),
  landmarkType: 'ruin',
  landmarkName: 'the chapel doors',
  landmarkH: 3.0,
  landmarkLine: ['Barty is already crying.\nThe bells are practising.'],
  signLine: ['{gold}MARBLEFORD CHAPEL{/gold}\nEverybody is waiting.'],
  exitTo: 'fairweather_hall',
  exitLanding: { x: 0, z: 6 },
  exitLine: 'The road back.',
  encounters: null,
  dress(kit) { try { kit.lantern(1.5, 2.5, 0); } catch (_) {} },
  flowers: [{ x: 3, z: 1, hue: PAL.flower.white, n: 8 }],
});
