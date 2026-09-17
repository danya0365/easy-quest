// T5 · TOWN — "Market Morning" · F major · 2/4 · ♩=120 · A A B A (32 bars ≈ 32 s) → loop
// Light and never insistent. The oboe sells the tune; a bassoon answers it in every second bar (it moves where the
// tune stands still, and stands still where the tune runs); the harpsichord's alberti and the pizzicato bass are
// written out by hand so the bass walks F E D C Bb instead of bouncing on roots; and a chiptune twinkle winks at you
// on the last eighth of bars 4 and 8.
import { Theme, N } from './_lib.js';

const A_MELODY = [
  ['F4', 0.5], ['G4', 0.5], ['A4', 0.5], ['C5', 0.5],
  ['A4', 1], ['F4', 1],
  ['G4', 0.5], ['A4', 0.5], ['Bb4', 0.5], ['D5', 0.5],
  ['C5', 1], ['A4', 1],
  ['Bb4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F4', 0.5],
  ['E4', 1], ['G4', 1],
  ['F4', 0.5], ['G4', 0.5], ['A4', 0.5], ['Bb4', 0.5],
  ['A4', 1.5], ['R', 0.5],
];
// bible: F | Dm | Bb | C7 | Bb | C7 | F | C7 — bar 3 as Gm7 (its G4 downbeat), bar 8 stays home for the wink
const A_HARM = ['F', 'Dm', 'Gm7', 'C7', 'Bb', 'C7', 'F', 'F'];
// the bassoon's answer: it holds under the tune's runs and sings in its long notes
const A_COUNTER = N(`A2:2   F3:.5 E3:.5 D3:.5 C3:.5   Bb2:2   E3:.5 F3:.5 G3:.5 Bb3:.5
  F3:2   G3:.5 F3:.5 E3:.5 D3:.5   A2:2   C3:.5 Bb2:.5 A2:.5 G2:.5`);
// pizzicato: a line that steps down through the bar changes instead of bouncing on roots
const A_BASS = N('F2:1 E2:1  D2:1 C2:1  Bb1:1 D2:1  C2:1 E2:1  F2:1 D2:1  C2:1 G2:1  F2:1 A2:1  C2:1 C2:1');
// the harpsichord's alberti, voiced by hand for every chord
const A_ALBERTI = [
  ['F3', 'A3', 'C4', 'A3'], ['D3', 'F3', 'A3', 'F3'], ['G3', 'Bb3', 'D4', 'Bb3'], ['C3', 'E3', 'G3', 'Bb3'],
  ['Bb2', 'D3', 'F3', 'D3'], ['C3', 'G3', 'Bb3', 'G3'], ['F3', 'A3', 'C4', 'A3'], ['F3', 'C4', 'A3', 'C4'],
];

const B_MELODY = [
  ['D5', 0.5], ['Eb5', 0.5], ['F5', 0.5], ['Bb5', 0.5],
  ['G5', 1], ['D5', 1],
  ['Eb5', 0.5], ['F5', 0.5], ['G5', 0.5], ['Bb5', 0.5],
  ['A5', 1], ['F5', 1],
  ['Bb5', 0.5], ['A5', 0.5], ['F5', 0.5], ['D5', 0.5],
  ['G4', 0.5], ['Bb4', 0.5], ['D5', 1],
  ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['G5', 0.5],
  ['F5', 1], ['C5', 0.5], ['R', 0.5],
];
const B_HARM = ['Bb', 'Gm', 'Eb', 'F7', 'Bb', 'Gm', 'C7', 'F7'];
const B_COUNTER = N('F4:2  Bb4:.5 A4:.5 G4:.5 F4:.5  G4:2  C5:1 Eb5:1  D5:2  D5:2  E4:1 G4:1  C5:1 A4:1');
const B_BASS = N('Bb1:1 D2:1  G2:1 F2:1  Eb2:1 G2:1  F2:1 A2:1  Bb1:1 F2:1  G2:1 Bb2:1  C2:1 E2:1  F2:1 C2:1');
const B_CHORDS = [['Bb3', 'D4', 'F4'], ['G3', 'Bb3', 'D4'], ['Eb3', 'G3', 'Bb3'], ['F3', 'A3', 'C4'],
  ['Bb3', 'D4', 'F4'], ['G3', 'Bb3', 'D4'], ['C4', 'E4', 'G4'], ['F3', 'A3', 'C4']];
const B_VLN2 = N('F5:2 D5:2 Bb4:2 C5:2 D5:2 D5:2 E5:2 C5:2');
const B_VLA = N('Bb3:2 Bb3:2 G3:2 A3:2 F3:2 G3:2 G3:2 A3:2');

export function build() {
  const T = Theme({ id: 'town', title: 'Market Morning', key: 'F major', bpm: 120, meter: 2, pulse: [0, 1], loop: 32, space: 'ROOM', gain: 1.95 });
  const oboe = T.part('oboe', { voice: 'oboe', bus: 'melody' });
  const flute = T.part('flute', { voice: 'flute', bus: 'melody' });
  const bsn = T.part('bassoon', { voice: 'bassoon', bus: 'counter', gain: 1.05 });
  const oboeCtr = T.part('oboeCounter', { voice: 'oboe', bus: 'counter', gain: 0.8 });
  const hc = T.part('harpsi', { voice: 'harpsi', bus: 'harmony' });
  const pizz = T.part('pizz', { voice: 'pizz', bus: 'bass' });
  const vn2 = T.part('violins2', { voice: 'strings', bus: 'harmony', gain: 0.8, o: { attack: 0.3 } });
  const vla = T.part('violas', { voice: 'strings', bus: 'harmony', gain: 0.8, o: { attack: 0.3 } });
  const tw = T.part('twinkle', { voice: 'twinkle', bus: 'counter' });

  const alberti = (start, table) => {
    table.forEach((ns, b) => hc.figs([[T.bar(start + b), ns, 'up']], { dyn: 'p', step: 0.5, len: 0.6 }));
  };
  const wink = (bar) => {
    tw.note(T.bar(bar + 3, 1.5), 'E5', 0.4, { dyn: 'pp' });
    tw.note(T.bar(bar + 7, 1.5), 'E5', 0.4, { dyn: 'p' });
  };

  // A (0-7): the oboe sells it, the bassoon answers, the harpsichord chatters
  T.chords(0, A_HARM);
  oboe.seq(0, A_MELODY, { dyn: 'mp' });
  bsn.seq(0, A_COUNTER, { dyn: 'mp' });
  pizz.seq(0, A_BASS, { dyn: 'mp', shape: false });
  alberti(0, A_ALBERTI); wink(0);

  // A (8-15): the flute joins the oboe a third above (not an octave), the bassoon answers again
  T.chords(8, A_HARM);
  oboe.seq(8, A_MELODY, { dyn: 'mp' });
  flute.seq(8, N(`A4:.5 Bb4:.5 C5:.5 E5:.5   D5:1 A4:1   Bb4:.5 C5:.5 D5:.5 F5:.5   E5:1 C5:1
    D5:.5 C5:.5 Bb4:.5 A4:.5   G4:1 Bb4:1   A4:.5 Bb4:.5 C5:.5 D5:.5   C5:1.5 R:.5`), { dyn: 'mp', oct: 1, gain: 0.75 });
  bsn.seq(8, A_COUNTER, { dyn: 'mp' });
  pizz.seq(8, A_BASS, { dyn: 'mp', shape: false });
  alberti(8, A_ALBERTI); wink(8);

  // B (16-23): to B-flat. The flute leads, an oboe answers underneath, the harpsichord thins to chords, strings arrive
  T.chords(16, B_HARM);
  flute.seq(16, B_MELODY, { dyn: 'mf' });
  oboeCtr.seq(16, B_COUNTER, { dyn: 'mp' });
  pizz.seq(16, B_BASS, { dyn: 'mf', shape: false });
  B_CHORDS.forEach((ns, b) => hc.chord(T.bar(16 + b), ns, 0.6, { dyn: 'mp' }));
  vn2.seq(16, B_VLN2, { dyn: 'mp', shape: false });
  vla.seq(16, B_VLA, { dyn: 'mp', shape: false });

  // A (24-31): home, as it started
  T.chords(24, A_HARM);
  oboe.seq(24, A_MELODY, { dyn: 'mp' });
  bsn.seq(24, A_COUNTER, { dyn: 'mp' });
  pizz.seq(24, A_BASS, { dyn: 'mp', shape: false });
  alberti(24, A_ALBERTI); wink(24);
  return T.build();
}
