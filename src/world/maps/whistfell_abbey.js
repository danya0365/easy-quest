/**
 * whistfell_abbey.js — Whistfell Abbey (Act III stub).                                              (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'whistfell_abbey',
  name: "Whistfell Abbey",
  kind: 'dungeon',
  theme: 'dirt',
  music: 'dungeon',
  hours: 9,
  seed: 149,
  armLabel: 'WHIST',
  landmarks: marks([{ id: 'puddlewick', az: 2.5 }, { id: 'saltmarrow', az: -0.5 }]),
  landmarkType: 'ruin',
  landmarkName: "a grey abbey in a whirl",
  landmarkH: 3,
  landmarkLine: ["The Gullet turns forever.\nThe abbey pretends not to notice.","A hundred dark lanterns wait below.\nOne is lit."],
  signLine: ["{gold}WHISTFELL ABBEY{/gold}\nThe Order keeps quiet for a living.","Hush & Hark are on the stairs.\nMind your manners."],
  exitTo: 'bellhollow_abbey',
  exitLanding: { x: 0, z: 6 },
  exitLine: "Back toward Bellhollow and kinder bells.",
  encounters: {"rate":0.35,"table":[["gloop",3],["quietling",2]]},
  lines: {
    'to-deep': "The undercroft mouth.\nLanterns. One lit. Keep walking.",
  },
  extra: {
    exits: [
      { x: 0, z: 18.5, w: 6.0, h: 4.0, to: 'bellhollow_abbey', tx: 0, tz: 6, kind: 'edge',
        name: 'the way back', line: 'lane-out', back: { x: 0, z: 10 }, facing: 0 },
      { x: 0, z: -9.5, w: 4.0, h: 3.5, to: 'quiet_deep', tx: 0, tz: 8, kind: 'door',
        name: 'the undercroft stair', line: 'to-deep', back: { x: 0, z: -6 }, facing: Math.PI },
    ],
  },
  dress(kit) { try { kit.lantern(1.5, 2.5, 0); } catch (_) {} },
  flowers: [{ x: 3, z: 1, hue: PAL.flower.white, n: 6 }],
});
