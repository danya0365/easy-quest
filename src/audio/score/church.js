// T6 · CHURCH — "Sanctuary" · A minor · 4/4 · ♩=52 · one 8-bar chorale forever
// Church organ in four real parts + a 16' pedal, a choir pad at ppp, CHAPEL reverb. No percussion. No vibrato.
// The bar-8 tail bleeds two seconds into bar 1; that overlap is the seam.
import { Theme } from './_lib.js';

const SOPRANO = [['A4', 2], ['C5', 2], ['B4', 2], ['A4', 2], ['E5', 2], ['D5', 1], ['C5', 1], ['B4', 4],
  ['C5', 2], ['E5', 2], ['D5', 2], ['C5', 2], ['B4', 2], ['A4', 1], ['G#4', 1], ['A4', 4]];
// bible alto, with bar 4's F4 (a typo against the E chord) as G#4
const ALTO = [['E4', 2], ['E4', 2], ['G#4', 2], ['E4', 2], ['G4', 2], ['F4', 1], ['E4', 1], ['G#4', 4],
  ['E4', 2], ['G4', 2], ['F4', 2], ['E4', 2], ['D4', 2], ['E4', 2], ['E4', 4]];
// bible tenor, bar 6 held on A3 (F maj7) and bar 7 on F3 (D minor sixth) so both chords sound complete
const TENOR = [['C4', 2], ['A3', 2], ['B3', 2], ['C4', 2], ['C4', 2], ['A3', 2], ['D4', 4],
  ['A3', 2], ['C4', 2], ['A3', 4], ['F3', 2], ['B3', 2], ['C4', 4]];
const BASS = [['A2', 4], ['E2', 4], ['C3', 4], ['E2', 4], ['A2', 4], ['F2', 4], ['D2', 2], ['E2', 2], ['A2', 4]];
const HARM = ['Am', 'E|Am/E', 'C|Dm/C', 'E7', 'Am|Am7', 'F', 'Dm6|E', 'Am'];

export function build() {
  const T = Theme({ id: 'church', title: 'Sanctuary', key: 'A minor', bpm: 52, meter: 4, pulse: [0, 2], loop: 8, space: 'CHAPEL', gain: 1.7, enter: { fade: 1.4 } });
  const s = T.part('soprano', { voice: 'organ', bus: 'melody', pan: 0.08 });
  const a = T.part('alto', { voice: 'organ', bus: 'harmony', pan: -0.12 });
  const t = T.part('tenor', { voice: 'organ', bus: 'harmony', pan: 0.14 });
  const b = T.part('pedal', { voice: 'organ', bus: 'bass', o: { pedal: true } });
  T.part('choir', { voice: 'pad', bus: 'harmony' });
  T.chords(0, HARM);
  // p, swelling to mp through bars 5-6 and back
  const sw = { cresc: ['p', 'p'] };
  s.seq(0, SOPRANO.slice(0, 8), { ...sw, art: 'legato', shape: false });
  s.seq(4, SOPRANO.slice(8, 12), { cresc: ['p', 'mp'], art: 'legato', shape: false });
  s.seq(6, SOPRANO.slice(12), { cresc: ['mp', 'p'], art: 'legato', shape: false });
  for (const [P, line, g] of [[a, ALTO, 0.8], [t, TENOR, 0.75], [b, BASS, 0.95]]) {
    const cut = (bars) => { let beats = 0, k = 0; while (k < line.length && beats < bars * 4) { beats += line[k][1]; k++; } return k; };
    const k4 = cut(4), k6 = cut(6);
    P.seq(0, line.slice(0, k4), { dyn: 'p', art: 'legato', shape: false, gain: g });
    P.seq(4, line.slice(k4, k6), { cresc: ['p', 'mp'], art: 'legato', shape: false, gain: g });
    P.seq(6, line.slice(k6), { cresc: ['mp', 'p'], art: 'legato', shape: false, gain: g });
  }
  T.pad('choir', T.chords(0, ['Am', 'E', 'C', 'E', 'Am', 'F', 'Dm|E', 'Am'], false), { n: 3, lo: 'A3', hi: 'E4', dyn: 'ppp' });
  return T.build();
}
