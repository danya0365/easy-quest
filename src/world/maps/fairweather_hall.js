/**
 * fairweather_hall.js — Fairweather Hall (B16).                                              (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'fairweather_hall',
  name: 'Fairweather Hall',
  kind: 'town',
  theme: 'grass',
  music: 'castle',
  hours: 12,
  seed: 115,
  armLabel: 'HALL',
  landmarks: marks([{ id: 'puddlewick', az: 2.5 }, { id: 'saltmarrow', az: -0.5 }]),
  landmarkType: 'ruin',
  landmarkName: 'the hall doors',
  landmarkH: 3.0,
  landmarkLine: ['Rudolpho is somewhere inside\nwith a numbered list.'],
  signLine: ['{gold}FAIRWEATHER HALL{/gold}\nLists. Conditions. Choices.'],
  exitTo: 'marbleford',
  exitLanding: { x: 0, z: 6 },
  exitLine: 'The road back.',
  encounters: null,
  dress(kit) { try { kit.lantern(1.5, 2.5, 0); } catch (_) {} },
  flowers: [{ x: 3, z: 1, hue: PAL.flower.white, n: 8 }],
  lines: { 'to-chapel': 'The chapel path. Everybody is waiting.' },
  extra: {
    exits: [
      { x: 0, z: 18.5, w: 6.0, h: 4.0, to: 'marbleford', tx: 0, tz: 6, kind: 'edge',
        name: 'the hall gates', line: 'lane-out', back: { x: 0, z: 10 }, facing: 0 },
      { x: 0, z: -9.5, w: 4.0, h: 3.5, to: 'marbleford_chapel', tx: 0, tz: 8, kind: 'door',
        name: 'the chapel path', line: 'to-chapel', back: { x: 0, z: -6 }, facing: Math.PI },
    ],
  },
});
