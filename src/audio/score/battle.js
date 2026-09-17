// T10 · BATTLE — "Draw Steel!" · D minor · 4/4 · ♩=156 · Intro(2) → A(8) → A′(8) → B(8) → A(8) → loop to A
//
// What drives it is not the tune: it is a running eighth-note line in the low strings that walks by step, brass stabs
// that land off the beat, and violin runs that fight the tune in its held notes. The legato B section takes the snare
// away and sets a descending cello line against the melody's chromatic climb, then it all crashes back in at ff.
// A′ keeps the hook but answers it with a new second phrase, so the opening motif is not simply said six times.
import { Theme, N } from './_lib.js';

export const A_MELODY = [
  ['D5', 0.5], ['D5', 0.5], ['F5', 0.5], ['A5', 0.5], ['D6', 1], ['A5', 1],
  ['Bb5', 0.5], ['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['E5', 2],
  ['E5', 0.5], ['E5', 0.5], ['G5', 0.5], ['Bb5', 0.5], ['A5', 1], ['F5', 1],
  ['E5', 1], ['D5', 1], ['C#5', 2],
  ['D5', 0.5], ['D5', 0.5], ['F5', 0.5], ['A5', 0.5], ['D6', 1], ['A5', 1],
  ['Bb5', 0.5], ['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['E5', 2],
  ['E5', 0.5], ['E5', 0.5], ['G5', 0.5], ['Bb5', 0.5], ['A5', 1], ['F5', 1],
  ['E5', 1], ['C#5', 1], ['D5', 2],
];
// the bible's harmony (quiet_hand.js minor-ises the tune with this): Dm | Gm | A7 | A7 | Dm | Bb | Gm|A7 | Dm
export const A_HARM = ['Dm', 'Gm', 'A7', 'A7', 'Dm', 'Bb|C', 'Gm|A7', 'A7|Dm'];
// here: a lament descent (D C Bb A) under the first phrase, and a running bass that moves by step under all of it
const A_CHORDS = ['Dm|Dm7/C', 'Bb|A7', 'A7|A7/G', 'A7', 'Dm|Dm7/C', 'Bb|C', 'Gm6|A7', 'A7|Dm'];
const A_RUN = N(`D2:.5 E2:.5 F2:.5 G2:.5 A2:.5 G2:.5 F2:.5 E2:.5   F2:.5 G2:.5 A2:.5 Bb2:.5 A2:.5 G2:.5 F2:.5 E2:.5
  E2:.5 F2:.5 G2:.5 A2:.5 G2:.5 F2:.5 E2:.5 D2:.5   C#2:.5 D2:.5 E2:.5 G2:.5 A2:.5 G2:.5 E2:.5 C#2:.5
  D2:.5 E2:.5 F2:.5 G2:.5 A2:.5 G2:.5 F2:.5 E2:.5   Bb1:.5 C2:.5 D2:.5 F2:.5 C2:.5 D2:.5 E2:.5 G2:.5
  G2:.5 F2:.5 E2:.5 D2:.5 C#2:.5 D2:.5 E2:.5 G2:.5   A2:.5 G2:.5 F2:.5 E2:.5 D2:.5 E2:.5 F2:.5 A2:.5`);
// the violins: they hold while the tune hammers and run against it while the tune holds
const A_COUNTER = N(`A4:4   Bb4:2 C#5:.5 D5:.5 E5:.5 F5:.5   C#5:4   E5:2 G5:.5 A5:.5 Bb5:.5 A5:.5
  F5:4   F5:2 E5:.5 F5:.5 G5:.5 A5:.5   G4:2 C#5:2   C#5:2 E5:.5 F5:.5 G5:.5 A5:.5`);
// horn stabs: never on the beat except where a phrase lands
const A_STABS = [
  [1.5, ['A3', 'D4'], 0.4], [3.5, ['D4', 'F4'], 0.4],
  [6.5, ['C#4', 'G4'], 0.4],
  [9.5, ['C#4', 'E4'], 0.4], [11.5, ['E4', 'G4'], 0.4],
  [14, ['E4', 'A4'], 0.4], [14.5, ['E4', 'G4'], 0.4], [15, ['E4', 'A4'], 0.75],
  [17.5, ['A3', 'D4'], 0.4], [19.5, ['D4', 'F4'], 0.4],
  [22.5, ['E4', 'G4'], 0.4],
  [24.5, ['D4', 'G4'], 0.4], [25.5, ['E4', 'Bb4'], 0.4], [26.5, ['E4', 'A4'], 0.4],
  [28, ['E4', 'A4'], 1.5], [30, ['A3', 'D4'], 2],
];
// violas, two notes per half bar: the inner harmony
const A_VLA = [
  [0, ['A3', 'F4'], 4], [4, ['Bb3', 'F4'], 2], [6, ['A3', 'E4'], 2],
  [8, ['A3', 'E4'], 2], [10, ['G3', 'E4'], 2], [12, ['A3', 'C#4'], 4],
  [16, ['A3', 'F4'], 4], [20, ['Bb3', 'F4'], 2], [22, ['C4', 'E4'], 2],
  [24, ['Bb3', 'E4'], 2], [26, ['A3', 'C#4'], 2], [28, ['A3', 'E4'], 2], [30, ['A3', 'F4'], 2],
];
// A′'s new second phrase: the hook, then a rising answer instead of the same four bars again
const A2_MELODY = N(`D5:.5 D5:.5 F5:.5 A5:.5 D6:1 A5:1   Bb5:.5 C6:.5 D6:.5 Bb5:.5 G5:2
  C6:.5 Bb5:.5 A5:.5 G5:.5 F5:1 E5:1   E5:1 G5:1 A5:2`);
const A2_CHORDS = ['Dm|Dm7/C', 'Gm|A7', 'Dm7|Bb', 'A7'];
const A2_TRUMPET = N('R:4  R:2 Bb4:.5 A4:.5 G4:1   R:4   A4:1 A4:1 A4:2');
// A′'s second phrase has its own harmony, so it gets its own running bass
const A2_RUN = N(`D2:.5 E2:.5 F2:.5 G2:.5 A2:.5 G2:.5 F2:.5 E2:.5   G2:.5 A2:.5 Bb2:.5 A2:.5 E2:.5 F2:.5 G2:.5 A2:.5
  D2:.5 E2:.5 F2:.5 A2:.5 Bb2:.5 A2:.5 G2:.5 F2:.5   E2:.5 F2:.5 G2:.5 A2:.5 G2:.5 E2:.5 C#2:.5 E2:.5`);

const B_MELODY = N(`A4:.5 Bb4:.5 B4:.5 C5:.5 D5:2   C5:.5 C#5:.5 D5:.5 Eb5:.5 E5:2
  F5:1 E5:1 D5:1 C#5:1   D5:2 R:2
  D5:.5 Eb5:.5 E5:.5 F5:.5 G5:2   F5:.5 F#5:.5 G5:.5 Ab5:.5 A5:2
  Bb5:1 A5:1 G5:1 F5:1   E5:2 A4:2`);
// the leading-tone diminished sevenths of the bible, with a bass that steps down under the climb
const B_CHORDS = ['Dm', 'C#dim7', 'A7', 'Dm', 'Gm', 'F#dim7', 'A7', 'A7'];
const B_BASS = N('D2:4 C#2:4 A1:4 D2:4 G2:4 F#2:4 E2:4 A1:4');
const B_COUNTER = N('A3:4  G3:2 E3:2  G3:4  F3:4  D3:2 Bb2:2  C3:2 A2:2  C#3:4  E3:2 A2:2');
const B_HORN1 = N('F4:4 E4:4 E4:4 F4:4 D4:4 C4:4 C#4:4 E4:4');
const B_HORN2 = N('D4:4 C#4:4 C#4:4 D4:4 Bb3:4 A3:4 A3:4 C#4:4');

export function build() {
  const T = Theme({ id: 'battle', title: 'Draw Steel!', key: 'D minor', bpm: 156, meter: 4, pulse: [0, 2], intro: 2, loop: 32, space: 'HALL', gain: 0.8 });
  const trumpets = T.part('trumpets', { voice: 'trumpet', bus: 'melody', gain: 1.12, o: { tight: true } });
  const trumpet2 = T.part('trumpet2', { voice: 'trumpet', bus: 'counter', gain: 0.75, o: { tight: true } });
  const vlns = T.part('violins', { voice: 'strings', bus: 'melody', gain: 1.1 });
  const vlnCtr = T.part('violinsCtr', { voice: 'strings', bus: 'counter', gain: 0.85 });
  const hn1 = T.part('horn1', { voice: 'horns', bus: 'harmony', gain: 0.95, pan: -0.3, o: { tight: true, rel: 0.09 } });
  const hn2 = T.part('horn2', { voice: 'horns', bus: 'harmony', gain: 0.85, pan: -0.38, o: { tight: true, rel: 0.09 } });
  const hnPad = T.part('hornPad', { voice: 'horns', bus: 'harmony', gain: 0.7, o: { attack: 0.08 } });
  const hnPad2 = T.part('hornPad2', { voice: 'horns', bus: 'harmony', gain: 0.6, o: { attack: 0.08 } });
  const bones = T.part('bones', { voice: 'trombone', bus: 'harmony', gain: 0.8, o: { tight: true } });
  const tuba = T.part('tuba', { voice: 'tuba', bus: 'bass', gain: 0.65 });
  const run = T.part('lowStrings', { voice: 'strings', bus: 'bass', pan: 0.25, gain: 1.0 });
  const pizz = T.part('pizz', { voice: 'pizz', bus: 'bass', gain: 0.8 });
  const vla = T.part('violas', { voice: 'strings', bus: 'harmony', gain: 0.85 });
  const trem = T.part('tremolo', { voice: 'strings', bus: 'harmony', gain: 0.8, o: { trem: 60 / 156 / 4 } });
  const celli = T.part('celli', { voice: 'strings', bus: 'counter', pan: 0.3, gain: 1.0 });
  const flute = T.part('flute', { voice: 'flute', bus: 'counter', gain: 0.9 });
  const clar = T.part('clarinet', { voice: 'clarinet', bus: 'counter', gain: 0.85 });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const snare = T.part('snare', { voice: 'snare', bus: 'perc' });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });
  const bar = (b, beat = 0) => T.bar(b, beat);

  /** the running eighths, with the pizzicato basses spiking the first eighth of beats 1 and 3 */
  const runLine = (start, dyn, pdyn, line = A_RUN) => {
    run.seq(start, line, { dyn, art: 'staccato', shape: false, jitV: 0.08 });
    for (let b = 0; b * 8 < line.length; b++) for (const bt of [0, 2]) {
      const e = line[b * 8 + bt * 2];
      pizz.note(bar(start + b, bt), e[0], 0.4, { dyn: pdyn, gain: 0.85 });
    }
  };
  const stabs = (start, list, dyn) => {
    for (const [off, ns, d] of list) {
      hn1.note(bar(start) + off, ns[1], d, { dyn, art: 'marcato' });
      hn2.note(bar(start) + off, ns[0], d, { dyn, art: 'marcato' });
    }
  };
  const violas = (start, list, dyn, part = vla) => { for (const [off, ns, d] of list) part.chord(bar(start) + off, ns, d, { dyn }); };
  /** snare: eighths with a syncopated accent and a sixteenth fill at the end of every fourth bar */
  const snareBars = (start, n, dyn = 'mp', fills = [3, 7]) => {
    for (let k = 0; k < n; k++) {
      const b = start + k, fill = fills.includes(k);
      for (let e = 0; e < 8; e++) {
        if (fill && e >= 6) continue;
        const accent = e === 0 || e === 3 || e === 4 ? 'mf' : dyn;
        snare.note(bar(b, e * 0.5), 'D4', 0.25, { dyn: accent, gain: e % 2 ? 0.7 : 1 });
      }
      if (fill) for (let s2 = 0; s2 < 4; s2++) snare.note(bar(b, 3 + s2 * 0.25), 'D4', 0.25, { dyn: 'mf', gain: 0.75 + s2 * 0.1 });
    }
  };
  /** timpani: the downbeat and an off-beat push, tuned to whatever chord is over it */
  const timpDrive = (h, start, dyn = 'mf') => {
    for (let b = 0; b < 8; b++) for (const bt of (b % 2 ? [0, 2.5] : [0, 1.5, 3])) {
      const x = bar(start + b, bt); const c = h.find((q) => x >= q.b - 1e-6 && x < q.b + q.d - 1e-6); if (!c) continue;
      timp.note(x, c.pcs.has(2) ? 'D2' : 'A2', 0.4, { dyn: bt === 0 ? dyn : (dyn === 'ff' ? 'mf' : 'mp') });
    }
  };

  // ---- Intro (bars 0-1): a timpani roll and a string run up, two brass stabs, then the engine starts
  T.chords(0, ['Dm', 'Dm']);
  timp.roll(bar(0, 0), bar(0, 2), 'D2', { from: 'mf', to: 'ff', perBeat: 4 });
  vlns.seq(0, N('D4:.25 E4:.25 F4:.25 G4:.25 A4:.25 Bb4:.25 C#5:.25 D5:.25'), { dyn: 'f', art: 'staccato', shape: false });
  for (const bt of [2, 3]) {
    hn1.chord(bar(0, bt), ['D4', 'A4'], bt === 2 ? 0.5 : 0.75, { dyn: 'ff', art: 'marcato' });
    hn2.chord(bar(0, bt), ['D3', 'A3'], bt === 2 ? 0.5 : 0.75, { dyn: 'ff', art: 'marcato' });
    trumpets.note(bar(0, bt), 'D5', bt === 2 ? 0.5 : 0.75, { dyn: 'f', art: 'marcato' });
  }
  cym.note(bar(0, 2), 'C5', 2, { dyn: 'f' });
  run.seq(1, N('D2:.5 E2:.5 F2:.5 G2:.5 A2:.5 G2:.5 F2:.5 E2:.5'), { cresc: ['mp', 'f'], art: 'staccato', shape: false });
  trem.chord(bar(1), ['A3', 'D4', 'F4'], 4, { dyn: 'mp' });
  snareBars(1, 1, 'p', []);
  timp.note(bar(1, 0), 'D2', 0.5, { dyn: 'mf' }); timp.note(bar(1, 2), 'A2', 0.5, { dyn: 'mf' });
  trumpets.seq(1, N('R:3 A4:1'), { dyn: 'f', art: 'marcato' });

  // ---- A (bars 2-9): trumpets hammer the tune, the low strings run, the horns stab off the beat,
  //      the violins answer with runs in the tune's held notes
  let s = 2;
  const hA = T.chords(s, A_CHORDS);
  trumpets.seq(s, A_MELODY, { dyn: 'f', art: 'marcato' });
  vlnCtr.seq(s, A_COUNTER, { dyn: 'mf' });
  runLine(s, 'mf', 'mp');
  stabs(s, A_STABS, 'f');
  violas(s, A_VLA, 'mp');
  timpDrive(hA, s, 'mf');
  snareBars(s, 8, 'mp');
  cym.note(bar(s), 'C5', 2, { dyn: 'mf' });
  bones.chord(bar(s), ['D3', 'A3'], 1, { dyn: 'f', art: 'marcato' });
  bones.chord(bar(s + 4), ['D3', 'A3'], 1, { dyn: 'f', art: 'marcato' });

  // ---- A′ (bars 10-17): the violins take the tune, a trumpet answers it, and the second phrase rises somewhere new
  s = 10;
  T.chords(s, A_CHORDS.slice(0, 4));
  T.chords(s + 4, A2_CHORDS);
  vlns.seq(s, A_MELODY.slice(0, 20), { dyn: 'f', art: 'marcato' });
  vlns.seq(s + 4, A2_MELODY, { dyn: 'f', art: 'marcato' });
  trumpet2.seq(s, N('R:4  R:2 A4:.5 Bb4:.5 C#5:1   R:4  E4:1 E4:1 E4:2'), { dyn: 'mf', art: 'marcato' });
  trumpet2.seq(s + 4, A2_TRUMPET, { dyn: 'mf', art: 'marcato' });
  runLine(s, 'mf', 'mp', A_RUN.slice(0, 32));
  runLine(s + 4, 'mf', 'mp', A2_RUN);
  stabs(s, A_STABS.slice(0, 6), 'f');
  stabs(s + 4, [[1.5, ['D4', 'G4'], 0.4], [3.5, ['D4', 'F4'], 0.4], [5.5, ['C#4', 'G4'], 0.4],
    [9.5, ['D4', 'F4'], 0.4], [11.5, ['D4', 'F4'], 0.4], [13, ['E4', 'A4'], 0.5], [14, ['E4', 'G4'], 0.5], [15, ['E4', 'A4'], 1]], 'f');
  violas(s, A_VLA.slice(0, 6), 'mp');
  violas(s + 4, [[0, ['A3', 'F4'], 2], [2, ['A3', 'E4'], 2], [4, ['Bb3', 'D4'], 2], [6, ['C#4', 'E4'], 2],
    [8, ['A3', 'F4'], 2], [10, ['Bb3', 'D4'], 2], [12, ['A3', 'C#4'], 4]], 'mp');
  timpDrive(hA, s, 'mf');
  snareBars(s, 8, 'mp');
  clar.seq(s + 5, N('R:2 D4:.5 E4:.5 F4:.5 G4:.5'), { dyn: 'mf' });
  flute.seq(s + 7, N('R:2 A5:.5 Bb5:.5 C6:.5 D6:.5'), { dyn: 'mf' });
  bones.chord(bar(s), ['D3', 'A3'], 1, { dyn: 'f', art: 'marcato' });
  bones.chord(bar(s + 4), ['D3', 'A3'], 1, { dyn: 'f', art: 'marcato' });
  cym.note(bar(s), 'C5', 2, { dyn: 'f' });

  // ---- B (bars 18-25): the snare stops, everything slurs. The tune climbs chromatically while the celli walk down
  //      against it; horns hold, violas tremble, and the last bar hauls the whole thing back up to ff.
  s = 18;
  T.chords(s, B_CHORDS);
  vlns.seq(s, B_MELODY, { dyn: 'mf' });
  celli.seq(s, B_COUNTER, { dyn: 'mf' });
  hnPad.seq(s, B_HORN1, { dyn: 'mp', shape: false });
  hnPad2.seq(s, B_HORN2, { dyn: 'p', shape: false });
  run.seq(s, B_BASS, { dyn: 'mp', shape: false });
  B_BASS.forEach(([n], b) => pizz.note(bar(s + b), n, 0.5, { dyn: 'p' }));
  trem.chord(bar(s), ['A3', 'D4'], 4, { dyn: 'pp' });
  trem.chord(bar(s + 1), ['G3', 'Bb3'], 4, { dyn: 'pp' });
  trem.chord(bar(s + 2), ['A3', 'C#4'], 4, { dyn: 'pp' });
  trem.chord(bar(s + 3), ['A3', 'D4'], 4, { dyn: 'pp' });
  trem.chord(bar(s + 4), ['Bb3', 'D4'], 4, { dyn: 'p' });
  trem.chord(bar(s + 5), ['A3', 'C4'], 4, { dyn: 'p' });
  trem.chord(bar(s + 6), ['A3', 'C#4'], 8, { dyn: 'mp' });
  flute.seq(s + 4, N('R:2 D5:.5 Eb5:.5 E5:.5 F5:.5'), { dyn: 'mp' });
  clar.seq(s + 6, N('R:2 E4:.5 F4:.5 G4:.5 A4:.5'), { dyn: 'mp' });
  timp.note(bar(s), 'D2', 1, { dyn: 'mp' });
  timp.note(bar(s + 4), 'D2', 1, { dyn: 'mp' });
  timp.roll(bar(s + 7, 0), bar(s + 8, 0), 'A2', { from: 'p', to: 'ff', perBeat: 6 });
  snare.roll(bar(s + 7, 2), bar(s + 8, 0), 'D4', { from: 'mp', to: 'ff', perBeat: 8, alt: 0.8 });

  // ---- A at ff (bars 26-33): everything at once; the last D is left ringing under a crash across the loop seam
  s = 26;
  T.chords(s, A_CHORDS);
  trumpets.seq(s, A_MELODY, { dyn: 'ff', art: 'marcato' });
  vlnCtr.seq(s, A_COUNTER, { dyn: 'f' });
  celli.seq(s, N(`A3:4  Bb3:2 A3:2  G3:2 E3:2  A3:4
    F3:4  F3:2 E3:2  D3:2 C#3:2  C#3:2 D3:2`), { dyn: 'f', shape: false });
  runLine(s, 'f', 'mf');
  stabs(s, A_STABS, 'ff');
  violas(s, A_VLA, 'mf', trem);
  timpDrive(hA, s, 'ff');
  snareBars(s, 8, 'mf');
  bones.seq(s, N('D3:2 C3:2  Bb2:2 A2:2  A2:2 G2:2  A2:4  D3:2 C3:2  Bb2:2 C3:2  Bb2:2 A2:2  A2:2 D3:2'), { dyn: 'f', art: 'tenuto', shape: false });
  tuba.seq(s, N('D2:2 C2:2  Bb1:2 A1:2  A1:2 G1:2  A1:4  D2:2 C2:2  Bb1:2 C2:2  G1:2 A1:2  A1:2 D2:2'), { dyn: 'f', shape: false });
  flute.seq(s + 3, N('R:2 A5:.5 Bb5:.5 C6:.5 D6:.5'), { dyn: 'f' });
  cym.note(bar(s), 'C5', 2, { dyn: 'f' });
  cym.note(bar(s + 7, 2), 'C5', 3, { dyn: 'f' });
  return T.build();
}
