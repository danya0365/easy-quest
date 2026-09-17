// T8 · DUNGEON / CAVE — "The Dark Under the Hill" · D phrygian · 4/4 · ♩=60 · 16 bars, loops
// A drone that never stops (so there is no seam), an oboe fragment a child can hum back, the flute asking it again a
// fourth higher and never getting an answer, a heartbeat timpani, and water dripping at a random moment.
import { Theme } from './_lib.js';

const FRAGMENT = [
  ['R', 4],
  ['D4', 2], ['Eb4', 1], ['D4', 1],
  ['R', 2], ['F4', 2],
  ['Eb4', 3], ['R', 1],
  ['R', 4],
  ['A4', 2], ['G4', 1], ['F4', 1],
  ['Eb4', 2], ['D4', 2],
  ['D4', 4],
];

export function build() {
  const T = Theme({ id: 'dungeon', title: 'The Dark Under the Hill', key: 'D phrygian', bpm: 60, meter: 4, pulse: [0, 2], loop: 16, space: 'DUNGEON', gain: 2.6, sendAdd: 0.2 });
  const drone = T.part('drone', { voice: 'strings', bus: 'bass', pan: -0.2, o: { attack: 2.5, rel: 2.5, swell: 1 } });
  const oboe = T.part('oboe', { voice: 'oboe', bus: 'melody' });
  const flute = T.part('flute', { voice: 'flute', bus: 'melody' });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const cel = T.part('celesta', { voice: 'celesta', bus: 'counter' });
  T.part('choir', { voice: 'pad', bus: 'harmony', o: { attack: 2 } });
  T.chords(0, ['Dm(b9)', 'Dm(b9)', 'Dm(b9)', 'Dm(b9)', 'Dm(b9)', 'Bb/D', 'Bb/D', 'Dm(b9)']);

  drone.note(0, 'D2', 65.5, { dyn: 'pp' });
  drone.note(0, 'A2', 65.5, { dyn: 'pp', gain: 0.8 });
  oboe.seq(0, FRAGMENT, { dyn: 'p' });
  flute.seq(8, FRAGMENT.slice(0, -1), { dyn: 'p', tr: 5 });
  flute.note(T.bar(15), 'C#4', 4, { dyn: 'p' }); // falls to C#, a question never answered
  for (const bar of [0, 4, 8, 12]) timp.note(T.bar(bar), 'D2', 2, { dyn: 'pp' });
  for (const bar of [3, 10, 14]) cel.note(T.bar(bar), 'A5', 1, { dyn: 'p', jit: 4 });
  // bars 6-7 lean to B-flat under the oboe, bar 8 comes home
  T.pad('choir', T.chords(5, ['Bb/D', 'Bb/D', 'Dm'], false), { n: 3, lo: 'F3', hi: 'D4', dyn: 'ppp' });
  return T.build();
}
