// T7 · INN — "Rest Your Boots" · C major · 6/8 (dotted quarter = 72) · 8 bars, loops · celesta + harp only
// plus inn.sleep, the 5-second sleep cue: two bars, a rising celesta figure over a harp glissando, fading to nothing.
import { Theme } from './_lib.js';

const MELODY = [
  ['G5', 1.5], ['E5', 1.5],
  ['F5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 1.5],
  ['E5', 1.5], ['D5', 1.5],
  ['C5', 3],
  ['A4', 1.5], ['C5', 1.5],
  ['D5', 0.5], ['E5', 0.5], ['F5', 0.5], ['E5', 1.5],
  ['D5', 1.5], ['B4', 1.5],
  ['C5', 3],
];
const HARM = ['C', 'F', 'C|G7', 'C', 'Am', 'Fmaj7', 'G7', 'C'];
const HARP = { pat: ['1', '5', '8', '10', '8', '5'], step: 0.5, base: 'C3', dyn: 'pp', len: 1.8, cycle: 3 };

export function build() {
  const T = Theme({ id: 'inn', title: 'Rest Your Boots', key: 'C major', bpm: 108, meter: 3, sig: '6/8', pulse: [0, 1.5], loop: 8, space: 'ROOM', gain: 9.225 });
  T.part('celesta', { voice: 'celesta', bus: 'melody' }).seq(0, MELODY, { dyn: 'p' });
  T.part('harp', { voice: 'harp', bus: 'harmony' });
  T.arp('harp', T.chords(0, HARM), HARP);

  const S = Theme({ id: 'inn.sleep', title: 'Sleep Tight', key: 'C major', bpm: 108, meter: 3, sig: '6/8', pulse: [0, 1.5], space: 'ROOM', gain: 17.659, kind: 'oneshot' });
  const cel = S.part('celesta', { voice: 'celesta', bus: 'melody' });
  S.part('harp', { voice: 'harp', bus: 'harmony' });
  cel.seq(0, MELODY.slice(0, 5), { cresc: ['p', 'pp'] });
  S.arp('harp', S.chords(0, ['C', 'F']), HARP);
  cel.seq(2, [['C5', 0.5], ['E5', 0.5], ['G5', 0.5], ['C6', 0.5], ['E6', 2]], { cresc: ['pp', 'ppp'] });
  S.parts.harp.gliss(S.bar(2), 'C', 'C3', 'C6', { dyn: 'pp', spacing: 0.05, fall: 0.15 });
  return [T.build(), S.build()];
}
