// HIGHFEATHER — "The Castle in the Clouds" · E lydian · 4/4 · ♩=66 · 16 bars, loops · CANON §9 `highfeather`
// Choir, harp, no percussion, and it never resolves its last chord (Asus2 → back to E). The raised fourth (A#) is the
// wonder note. The tune is the Hearth Cell stretched out long: B E D# C# B.
import { Theme } from './_lib.js';

const MELODY = [
  ['B4', 2], ['E5', 2],
  ['C#5', 2], ['A#4', 2],
  ['B4', 4],
  ['C#5', 2], ['F#5', 2],
  ['E5', 4],
  ['C#5', 2], ['E5', 2],
  ['B4', 2], ['G#4', 2],
  ['A#4', 4],
  ['C#5', 2], ['E5', 2],
  ['F#5', 4],
  ['D#5', 2], ['B4', 2],
  ['E5', 2], ['G#5', 2],
  ['E5', 2], ['C#5', 2],
  ['A#4', 2], ['C#5', 2],
  ['E5', 4],
  ['B4', 4],
];
const HARM = ['E', 'F#/E', 'E', 'F#/E', 'C#m', 'A', 'E/G#', 'F#', 'A', 'B', 'G#m', 'C#m', 'A', 'F#/A#', 'Bsus4', 'Asus2'];

export function build() {
  const T = Theme({ id: 'highfeather', title: 'The Castle in the Clouds', key: 'E lydian', bpm: 66, meter: 4, pulse: [0, 2], loop: 16, space: 'CHAPEL', gain: 1.5 });
  const voice = T.part('choirLead', { voice: 'pad', bus: 'melody', gain: 1.9, o: { attack: 0.35, rel: 0.9 } });
  const alto = T.part('choirAlto', { voice: 'vox', bus: 'counter', gain: 0.6 });
  T.part('choir', { voice: 'pad', bus: 'harmony', o: { attack: 1.2 } });
  T.part('harp', { voice: 'harp', bus: 'counter' });
  T.part('bassChoir', { voice: 'pad', bus: 'bass', o: { attack: 1.5 } });
  const cel = T.part('celesta', { voice: 'celesta', bus: 'counter', gain: 0.7 });
  const h = T.chords(0, HARM);
  voice.seq(0, MELODY, { dyn: 'mp' });
  alto.seq(8, MELODY.slice(13, 21), { dyn: 'p', oct: -1, legato: 'bar' });
  T.pad('choir', h, { n: 4, lo: 'E3', hi: 'B4', dyn: 'pp' });
  T.bass('bassChoir', h, { pat: [[0, 'B', 4.2]], base: 'E2', dyn: 'p' });
  T.arp('harp', h, { pat: ['1', '5', '8', '9', '10', '8', '5', '8'], step: 0.5, base: 'E3', dyn: 'p', len: 2.5, cycle: 4 });
  // sparkles high above, like light on cloud
  [[1, 3.5, 'B6'], [3, 1.5, 'F#6'], [5, 3.5, 'E6'], [7, 1.5, 'A#6'], [9, 3.5, 'F#6'], [11, 1.5, 'G#6'], [13, 3.5, 'C#7'], [15, 2.5, 'D#6']]
    .forEach(([bar, bt, n]) => cel.note(T.bar(bar, bt), n, 2, { dyn: 'p' }));
  return T.build();
}
