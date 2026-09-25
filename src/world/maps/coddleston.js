/**
 * coddleston.js — CODDLESTON: Bertie's castle town (Act I stub).                         (P23 night breadth)
 * CANON §2 [06]: four green copper spires. Full sculpt later; this is a place B8 can stand in.
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'coddleston',
  name: 'Coddleston',
  kind: 'town',
  theme: 'grass',
  music: 'castle',
  seed: 61,
  armLabel: 'CASTLE',
  landmarks: marks([{ id: 'puddlewick', az: 2.8 }, { id: 'saltmarrow', az: -1.0 }]),
  landmarkType: 'tower',
  landmarkName: 'a copper spire',
  landmarkLine: ['One of four green copper spires.\nThe other three are somewhere\nbehind the roofs.',
    'Prince Bertie lives up there.\nHe is having a birthday.'],
  signLine: ['{gold}CODDLESTON{/gold} — you are in it.\n{gold}THE MOOR{/gold} — north, and careful.',
    'Somebody has tied a ribbon to\nthe post. It is the colour of\na birthday.'],
  exitTo: 'meadow',
  spots: {
    bertie: { x: -1.0, z: -1.0, facing: Math.PI * 0.2 },
    gate: { x: 0, z: 10 },
    yard: { x: -3.0, z: -4.0 },
  },
  dress(kit, L) {
    try { kit.lantern(-2.2, 3.0, 0); } catch (_) {}
    try { kit.lantern(2.4, 3.2, 0); } catch (_) {}
    try { kit.drystoneWall([[-8.0, -2.0], [-5.0, -6.0], [-1.5, -7.5]], { seed: 61 }); } catch (_) {}
    try { kit.fieldGate(-3.2, -6.8, -0.5, { w: 2.4 }); } catch (_) {}
  },
  colliders: [
    // birthday yard wall + a couple of "house" pads so the stub is not empty cardboard
    { type: 'capsule', pts: [[-8.0, -2.0], [-5.0, -6.0], [-1.5, -7.5]], r: 0.32, tag: 'wall' },
    { type: 'box', x: -6.5, z: 1.5, w: 4.2, d: 3.6, rot: 0.2, tag: 'house' },
    { type: 'box', x: 5.5, z: -1.0, w: 3.8, d: 3.4, rot: -0.35, tag: 'house' },
    { type: 'box', x: 2.0, z: -8.5, w: 5.0, d: 4.0, rot: 0.1, tag: 'hall' },
  ],
  flowers: [{ x: -5, z: 1, hue: PAL.flower.pink, n: 12 }, { x: 4, z: -3, hue: PAL.flower.white, n: 10 }],
});
