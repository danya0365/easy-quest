/**
 * quiet_deep.js — the Quiet Deep (Act III stub).                                              (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'quiet_deep',
  name: "the Quiet Deep",
  kind: 'dungeon',
  theme: 'dirt',
  music: 'dungeon',
  hours: 8,
  seed: 157,
  armLabel: 'DEEP',
  landmarks: marks([{ id: 'puddlewick', az: 2.5 }, { id: 'saltmarrow', az: -0.5 }]),
  landmarkType: 'ruin',
  landmarkName: "a library of sleeping stone",
  landmarkH: 3,
  landmarkLine: ["Stone people sleep in shelves.\nDo not wake them by accident.","Malgrim is somewhere that is also\ninside an ordinary old man."],
  signLine: ["{gold}THE QUIET DEEP{/gold}\nCut the dream. Keep the people.","Bishop Mortmain waits between\nsadness and something worse."],
  exitTo: 'whistfell_abbey',
  exitLanding: { x: 0, z: 6 },
  exitLine: "Up toward the whirl and the grey abbey.",
  encounters: {"rate":0.4,"table":[["quietling",4],["gloop",2]]},
  lines: {

  },
  extra: {
    exits: [
      { x: 0, z: 18.5, w: 6.0, h: 4.0, to: 'whistfell_abbey', tx: 0, tz: 6, kind: 'edge',
        name: 'the way back', line: 'lane-out', back: { x: 0, z: 10 }, facing: 0 },
    ],
  },
  dress(kit) { try { kit.lantern(1.5, 2.5, 0); } catch (_) {} },
  flowers: [{ x: 3, z: 1, hue: PAL.flower.white, n: 6 }],
});
