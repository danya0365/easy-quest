// T9 · TENSION — "Something in the Trees" · C minor · 4/4 · ♩=104 · 8 bars, loops until the story lets go
// A chromatic climb in the celli, tremolo strings above, a sparse solo violin. It grows 3 dB per loop to an mf ceiling,
// and G7♭9 → Cm at the seam resolves *and* restarts, so the dread renews instead of releasing.
import { Theme } from './_lib.js';

const VIOLIN = [['R', 3], ['G4', 1], ['Ab4', 2], ['G4', 2],
  ['R', 3], ['Bb4', 1], ['B4', 2], ['Bb4', 2],
  ['R', 3], ['C5', 1], ['Db5', 2], ['C5', 2],
  ['Eb5', 1], ['D5', 1], ['Db5', 1], ['C5', 1], ['B4', 4]];
const HARM = ['Cm', 'Abmaj7', 'Cm', 'Bdim7', 'Cm', 'Db(N6)', 'Ddim7', 'G7b9'];

export function build() {
  const T = Theme({ id: 'tension', title: 'Something in the Trees', key: 'C minor', bpm: 104, meter: 4, pulse: [0, 2], loop: 8, space: 'HALL', gain: 1.25,
    loopDb: { per: 3, max: 6 }, enter: { fade: 0.25 } });
  const celli = T.part('celli', { voice: 'strings', bus: 'bass', pan: -0.3, o: { attack: 0.03, rel: 0.12 } });
  T.part('trem', { voice: 'strings', bus: 'harmony', o: { trem: 60 / 104 / 4 } });
  const vn = T.part('violin', { voice: 'violin', bus: 'melody' });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const h = T.chords(0, HARM);
  ['C2', 'Db2', 'D2', 'Eb2', 'E2', 'F2', 'F#2', 'G2'].forEach((n, bar) => { for (let q = 0; q < 4; q++) celli.note(T.bar(bar, q), n, 1, { dyn: q === 0 ? 'mp' : 'p', art: 0.62 }); });
  T.pad('trem', h, { n: 4, lo: 'G3', hi: 'Eb5', dyn: 'p' });
  vn.seq(0, VIOLIN, { dyn: 'mp', legato: true });
  timp.roll(T.bar(6), T.bar(8), 'C2', { from: 'pp', to: 'mp', rate: 12 });
  return T.build();
}
