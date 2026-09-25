/**
 * marbleford.js — MARBLEFORD / Fairweather Hall approach (Act II stub).           (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'marbleford',
  name: 'Marbleford',
  kind: 'town',
  theme: 'grass',
  music: 'castle',
  hours: 12,
  seed: 103,
  armLabel: 'MARBLE',
  landmarks: marks([{ id: 'saltmarrow', az: -1.8 }, { id: 'puddlewick', az: 2.9 }]),
  landmarkType: 'house',
  landmarkName: 'Fairweather Hall gates',
  landmarkH: 3.0,
  landmarkLine: ['The gates are very clean.\nSomebody has opinions about mud.',
    'A crest of a fish and a feather\nsits above the latch.'],
  signLine: ['{gold}MARBLEFORD{/gold}\nPacket boat. Chapel. Lists.',
    'Rudolpho’s conditions are posted\non the notice board. There are four.'],
  exitTo: 'saltmarrow',
  exitLanding: { x: 0, z: 6 },
  exitLine: 'The packet boat back toward Saltmarrow.',
  encounters: null,
  spots: { sera: { x: -1.5, z: -4.0, facing: Math.PI * 0.2 } },
  lines: {
    'to-grotto': 'The cliffs drop to a sighing mouth\nof sea-cave. Rudolpho’s third condition.',
    'to-hall': 'Fairweather Hall’s gates. Lists live here.',
    'to-chapel': 'The chapel path. Everybody is waiting.',
  },
  extra: {
    exits: [
      { x: 0, z: 18.5, w: 6.0, h: 4.0, to: 'saltmarrow', tx: 0, tz: 6, kind: 'edge',
        name: 'the packet quay', line: 'lane-out', back: { x: 0, z: 10 }, facing: 0 },
      { x: -4, z: -8, w: 4.0, h: 3.5, to: 'sighing_grotto', tx: 0, tz: 8, kind: 'door',
        name: 'the cliff path', line: 'to-grotto', back: { x: -3, z: -5 }, facing: Math.PI },
      { x: 3, z: -8, w: 4.0, h: 3.5, to: 'fairweather_hall', tx: 0, tz: 8, kind: 'door',
        name: 'the hall gates', line: 'to-hall', back: { x: 2, z: -5 }, facing: Math.PI },
      { x: 0, z: -10, w: 3.5, h: 3.0, to: 'marbleford_chapel', tx: 0, tz: 8, kind: 'door',
        name: 'the chapel path', line: 'to-chapel', back: { x: 0, z: -6 }, facing: Math.PI },
    ],
  },
  dress(kit) {
    try { kit.lantern(2.0, 3.0, 0); } catch (_) {}
    try { kit.lantern(-2.0, 3.0, 0); } catch (_) {}
  },
  flowers: [{ x: 3, z: 1, hue: PAL.flower.pink, n: 12 }, { x: -4, z: -2, hue: PAL.flower.white, n: 10 }],
});
