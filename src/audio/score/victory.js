// T12 · VICTORY FANFARE — "Well Fought!" · D major · 4/4 · ♩=132 · one-shot, 6 bars ≈ 11 s, ff
// The last D rings its four beats and the hall is allowed to finish ringing before the tally opens.
import { Theme } from './_lib.js';

export const MELODY = [
  ['D5', 0.5], ['D5', 0.5], ['D5', 0.5], ['D5', 0.5], ['F#5', 1], ['A5', 1],
  ['D6', 3], ['A5', 1],
  ['B5', 1], ['A5', 1], ['F#5', 1], ['D5', 1],
  ['E5', 2], ['A4', 1], ['A4', 1],
  ['F#5', 1], ['G5', 1], ['A5', 1], ['B5', 1],
  ['D6', 4],
];
// bible D | D | G | A | D/A|A7 | D — bar 3 turns to D under its F#-D half
const HARM = ['D', 'D', 'G|D', 'A', 'D/A|A7', 'D'];

export function build() {
  const T = Theme({ id: 'victory', title: 'Well Fought!', key: 'D major', bpm: 132, meter: 4, pulse: [0, 2], bars: 6, space: 'HALL', gain: 0.9, kind: 'oneshot' });
  const horns = T.part('horns', { voice: 'horns', bus: 'melody' });
  const hornsLo = T.part('hornsLo', { voice: 'horns', bus: 'counter', gain: 0.7 });
  const str = T.part('strings', { voice: 'strings', bus: 'counter', gain: 0.75 });
  T.part('pad', { voice: 'strings', bus: 'harmony' });
  T.part('hornPad', { voice: 'horns', bus: 'harmony', gain: 0.6 });
  const celli = T.part('celli', { voice: 'strings', bus: 'bass', pan: -0.3, gain: 0.8 });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });
  const snare = T.part('snare', { voice: 'snare', bus: 'perc' });
  const harp = T.part('harp', { voice: 'harp', bus: 'counter' });
  const cel = T.part('celesta', { voice: 'celesta', bus: 'counter' });
  const h = T.chords(0, HARM);

  horns.seq(0, MELODY, { dyn: 'ff', art: 'tenuto' });
  hornsLo.seq(0, MELODY, { dyn: 'f', oct: -1, art: 'tenuto' });
  str.seq(2, MELODY.slice(10), { dyn: 'f', oct: 1 });
  T.pad('pad', h, { n: 4, lo: 'D3', hi: 'A4', dyn: 'mf' });
  T.pad('hornPad', T.chords(1, ['D', 'G|D', 'A', 'D/A|A7'], false), { n: 3, lo: 'D3', hi: 'D4', dyn: 'mf' });
  celli.seq(0, [['D2', 8], ['G2', 2], ['D2', 2], ['A1', 4], ['A1', 2], ['A1', 2], ['D2', 4]], { dyn: 'f' });
  // timpani: four in bar 1, then 1 and 3; a roll through bar 5; D and A together on the last downbeat
  for (let q = 0; q < 4; q++) timp.note(q, 'D2', 1, { dyn: q ? 'f' : 'ff' });
  for (let bar = 1; bar < 4; bar++) for (const q of [0, 2]) timp.note(T.bar(bar, q), bar === 3 ? 'A2' : 'D2', 1, { dyn: 'f' });
  timp.roll(T.bar(4), T.bar(5), 'A2', { from: 'mf', to: 'ff' });
  timp.note(T.bar(5), 'D2', 2, { dyn: 'ff' }); timp.note(T.bar(5), 'A2', 2, { dyn: 'f' });
  cym.note(0, 'C5', 3, { dyn: 'f' }); cym.note(T.bar(5), 'C5', 4, { dyn: 'ff' });
  for (let bar = 0; bar < 4; bar++) for (let e = 0; e < 8; e++) snare.note(T.bar(bar, e * 0.5), 'D4', 0.25, { dyn: e % 4 ? 'mp' : 'f', gain: e % 2 ? 0.7 : 1 });
  snare.roll(T.bar(4), T.bar(5), 'D4', { from: 'mf', to: 'ff', perBeat: 8, alt: 0.8 });
  harp.gliss(T.bar(4), 'D', 'D3', 'D6', { dyn: 'mf', spacing: (4 * 60 / 132) / 24, fall: 1 });
  cel.seq(5, [['D6', 4]], { dyn: 'f', oct: 1 });
  cel.chord(T.bar(5, 0.5), ['F#6', 'A6'], 3, { dyn: 'mp', o: { strum: 0.05 } });
  return T.build();
}
