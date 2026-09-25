/**
 * sighing_grotto.js — THE SIGHING GROTTO (Act II B15 Tide Pearl).                 (P23 + P25 night breadth)
 */
import { act1Place } from './act1_places.js';
import { marks, PAL } from './road_common.js';

export default act1Place({
  id: 'sighing_grotto',
  name: 'the Sighing Grotto',
  kind: 'dungeon',
  theme: 'dirt',
  music: 'dungeon',
  hours: 11,
  seed: 111,
  armLabel: 'SIGH',
  landmarks: marks([{ id: 'saltmarrow', az: -1.2 }, { id: 'marbleford', az: 0.8 }]),
  landmarkType: 'ruin',
  landmarkName: 'a breathing mouth of sea-cave',
  landmarkH: 2.9,
  landmarkLine: ['The grotto breathes like a sleeping\ngiant. The pearl is further in.',
    'Salt on the air. Somewhere, a drip\nkeeps time.'],
  signLine: ['{gold}THE SIGHING GROTTO{/gold}\nRudolpho’s third condition lives here.',
    'Do not argue with the tide.'],
  exitTo: 'marbleford',
  exitLanding: { x: 0, z: 6 },
  exitLine: 'Back toward Marbleford and its lists.',
  encounters: { rate: 0.5, table: [['gloop', 2], ['ghostie', 3], ['batterfly', 2]] },
  spots: { pearl: { x: 0, z: -6.5 } },
  dress(kit) {
    try { kit.lantern(1.2, 2.0, 0); } catch (_) {}
    try { kit.rock(-3.0, -4.0, 1.5, 41); } catch (_) {}
    try { kit.rock(3.5, -5.0, 1.3, 43); } catch (_) {}
  },
  colliders: [
    { type: 'circle', x: -3.0, z: -4.0, r: 0.75, tag: 'rock' },
    { type: 'circle', x: 3.5, z: -5.0, r: 0.65, tag: 'rock' },
  ],
  flowers: [],
});
