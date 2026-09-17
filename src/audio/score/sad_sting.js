// SAD STING — "Oh." · E minor · ≈5 s · for small sorrows (a door that will not open, a goodbye, bad news)
// The Hearth Cell turned downward on the oboe, low strings swelling under it, one low harp note.
import { Theme } from './_lib.js';

export function build() {
  const T = Theme({ id: 'sad_sting', title: 'Oh.', key: 'E minor', bpm: 72, meter: 4, pulse: [0, 2], bars: 2, space: 'CHAPEL', gain: 2.0, kind: 'oneshot' });
  const oboe = T.part('oboe', { voice: 'oboe', bus: 'melody' });
  T.part('strings', { voice: 'strings', bus: 'harmony', o: { attack: 0.9 } });
  const harp = T.part('harp', { voice: 'harp', bus: 'counter' });
  const h = T.chords(0, ['Em', 'Cmaj7|Em']);
  oboe.seq(0, [['E5', 1.5], ['D5', 0.5], ['B4', 2], ['C5', 1], ['B4', 3]], { cresc: ['mp', 'pp'] });
  T.pad('strings', h, { n: 3, lo: 'E3', hi: 'E4', dyn: 'p', overlap: 1 });
  harp.note(0, 'E2', 4, { dyn: 'mp' });
  harp.note(T.bar(1, 2), 'E3', 4, { dyn: 'p' });
  return T.build();
}
