// THE QUIET HAND — "Whistfell Abbey" · D minor · 4/4 · ♩=46 · 16 bars, loops · CANON §9 `quiet_hand`
// The villain's theme is your battle theme, ruined: the "Draw Steel!" melody played slow and sacred on the organ,
// a choir breathing under it, and the stolen Bellhollow bell tolling slightly out of tune.
import { Theme } from './_lib.js';
import { A_MELODY, A_HARM } from './battle.js';

const B_MELODY = [
  ['A4', 0.5], ['Bb4', 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 2],
  ['C5', 0.5], ['C#5', 0.5], ['D5', 0.5], ['Eb5', 0.5], ['E5', 2],
  ['F5', 1], ['E5', 1], ['D5', 1], ['C#5', 1],
  ['D5', 4],
];
const B_HARM = ['Dm', 'C#dim7', 'A7', 'Dm'];

export function build() {
  const T = Theme({ id: 'quiet_hand', title: 'The Quiet Hand', key: 'D minor', bpm: 46, meter: 4, pulse: [0, 2], loop: 12, space: 'CHAPEL', gain: 2.514 });
  const mel = T.part('organMel', { voice: 'organ', bus: 'melody', o: { rel: 0.4 } });
  T.part('organ', { voice: 'organ', bus: 'harmony', gain: 0.75 });
  T.part('pedal', { voice: 'organ', bus: 'bass', o: { pedal: true } });
  const choir = T.part('choir', { voice: 'strings', bus: 'counter', gain: 0.8, o: { attack: 0.5 } });
  const bell = T.part('bell', { voice: 'bell', bus: 'perc', gain: 0.9 });

  const hA = T.chords(0, A_HARM);
  mel.seq(0, A_MELODY, { dyn: 'mp', oct: -1, art: 'tenuto' });
  choir.seq(0, A_MELODY, { dyn: 'pp', oct: -2 });
  T.pad('organ', hA, { n: 3, lo: 'F3', hi: 'D4', dyn: 'p', art: 'legato' });
  T.bass('pedal', hA, { pat: [[0, '1', 4]], base: 'D2', dyn: 'mp', art: 'legato' });
  const hB = T.chords(8, B_HARM);
  mel.seq(8, B_MELODY, { cresc: ['mp', 'mf'], oct: -1, art: 'tenuto' });
  choir.seq(8, B_MELODY, { dyn: 'pp', oct: -2 });
  T.pad('organ', hB, { n: 3, lo: 'F3', hi: 'D4', cresc: ['p', 'mp'], art: 'legato' });
  T.bass('pedal', hB, { pat: [[0, '1', 4]], base: 'D2', dyn: 'mp', art: 'legato' });
  for (let bar = 0; bar < 12; bar += 2) bell.note(T.bar(bar), 'D3', 4, { dyn: bar % 4 ? 'p' : 'mp', o: { wrong: true, len: 1.4 } });
  return T.build();
}
