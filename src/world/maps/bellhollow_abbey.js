/**
 * bellhollow_abbey.js — Bellhollow Abbey (Act III stub).                                              (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'bellhollow_abbey',
  name: "Bellhollow Abbey",
  kind: 'town',
  theme: 'grass',
  music: 'church',
  hours: 12,
  seed: 141,
  armLabel: 'BELL',
  landmarks: marks([{ id: 'puddlewick', az: 2.5 }, { id: 'saltmarrow', az: -0.5 }]),
  landmarkType: 'ruin',
  landmarkName: "an empty bell frame",
  landmarkH: 3,
  landmarkLine: ["The bell is gone.\nThe frame still waits for a song.","Stand under it with the right sword\nand the sky remembers stairs."],
  signLine: ["{gold}BELLHOLLOW ABBEY{/gold}\nSave. Heal. Look up.","The Cloud Stair is not a metaphor.\nIt is a staircase."],
  exitTo: 'saltmarrow',
  exitLanding: { x: 0, z: 6 },
  exitLine: "The road back toward Saltmarrow.",
  encounters: null,
  lines: {
    'to-whist': "A grey wind points over the Gullet.\nWhistfell waits inside the whirl.",
    'to-high': "Stand under the empty frame.\nThe Cloud Stair remembers.",
  },
  extra: {
    exits: [
      { x: 0, z: 18.5, w: 6.0, h: 4.0, to: 'saltmarrow', tx: 0, tz: 6, kind: 'edge',
        name: 'the way back', line: 'lane-out', back: { x: 0, z: 10 }, facing: 0 },
      { x: -3.5, z: -9.5, w: 3.5, h: 3.5, to: 'whistfell_abbey', tx: 0, tz: 8, kind: 'door',
        name: 'the cloud path', line: 'to-whist', back: { x: -2.5, z: -6 }, facing: Math.PI },
      { x: 3.5, z: -9.5, w: 3.5, h: 3.5, to: 'highfeather', tx: 0, tz: 8, kind: 'door',
        name: 'the Cloud Stair', line: 'to-high', back: { x: 2.5, z: -6 }, facing: Math.PI },
    ],
  },
  dress(kit) { try { kit.lantern(1.5, 2.5, 0); } catch (_) {} },
  flowers: [{ x: 3, z: 1, hue: PAL.flower.white, n: 6 }],
});
