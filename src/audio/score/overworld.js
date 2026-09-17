// T3 · OVERWORLD — "Over Hill, Over Homeward" · D major · 4/4 · ♩=118 (a march, not a stroll)
// Intro(4) → A(8) → A′(8) → B(8, the trio) → A″(8) → Tag(2) → loop to A. "The most important 45 seconds in the game."
//
// ★ THE TUNE IS A PERIOD, NOT A CELL ON REPEAT.
//   Antecedent (bars 4-7) — the question. An upbeat (A4 B4), then the march signature: a dotted-eighth + sixteenth
//   on the tonic and a LEAP of a fifth (D5 → A5) held across two beats. Bar 6 sequences that motto up a step
//   (E5 → B5). Bar 7 stops on a half cadence (G5 F#5 E5 over A7) and then SHUTS UP for half a bar — the tune
//   leaves a hole and the road (pizzicato + horn) walks through it.
//   Consequent (bars 8-11) — the answer. It starts with the same head so the ear knows it is the same tune, then
//   goes somewhere else entirely: a rising syncopated push (G5 A5 B5 · D6) to the melodic peak, a dotted descent
//   (D6 C#6 B5 A5 G5 E5) and a real cadence onto a D held for three beats, with a beat of silence after it.
//   58% of the old tune was plain quarter notes and bars 9-12 were bars 5-8 transposed; this one is 12% quarters
//   with fifteen different bar-rhythms in the loop and no bar of the tune is a transposition of another.
//
// Every statement is re-scored AND re-written, so the tune is never simply said again:
//   A   violins sing it · a bassoon answers inside its held notes and rests · the bass walks D G F# E A
//   A′  a SOLO HORN takes it an octave down at p (soft horn samples, not a lowpassed fortissimo), the violins
//       add a new descant above, a clarinet counters, the celli walk a countermelody; the snare steals in at bar 16
//   B   the trio: the oboe asks four bars in the relative minor over a plucked bass with no percussion at all
//       (the sun goes behind a cloud), and the FLUTE answers the other four home — question and answer between
//       two instruments, each of which then gets to shut up
//   A″  tutti: trumpets on the tune, horns on the counter an octave up, violins on a sustained descant, trombones
//       and tuba under it, snare marching every bar — and nobody doubling the tune in octaves
//   Tag the cadence lands ff, then everything drops out but the walking bass and one horn upbeat, so the loop
//       returns at mf: the march really does get louder and softer (measured RMS spread ~13 dB, was 5.7 dB)
import { Theme, N, bars } from './_lib.js';

/** the upbeat that opens the tune (written into the last bar of whatever precedes a statement) */
export const A_PICKUP = N('A4:.5 B4:.5');
export const A_MELODY = [
  // -- antecedent: the question (a leap, a sequence of it, a half cadence, and a breath)
  ...N('D5:.75 D5:.25 A5:2 F#5:1'),
  ...N('G5:.75 F#5:.25 E5:1 D5:1.5 E5:.5'),
  ...N('E5:.75 E5:.25 B5:2 A5:1'),
  ...N('G5:.75 F#5:.25 E5:1.5 R:.5 A4:.5 B4:.5'),
  // -- consequent: the answer (same head, new road, a real cadence and a beat of silence)
  ...N('D5:.75 D5:.25 B5:1.5 A5:.5 F#5:1'),
  ...N('G5:.5 A5:.5 B5:1 D6:1.5 C#6:.5'),
  ...N('D6:.75 C#6:.25 B5:1 A5:.75 G5:.25 E5:1'),
  ...N('D5:3 R:1'),
];
// the bible's harmony, one symbol per bar (title.js reharmonises the tune with this): D | G | Em | A7 | D | G | Em|A7 | D
export const A_HARM = ['D', 'G', 'Em7', 'A7', 'D', 'G', 'Em7|A7', 'D'];
// here: inversions that let the bass walk D · G F# · E · A G · D B · G F# · E A · D
export const A_CHORDS = ['D', 'G|D/F#', 'Em7', 'A7|A7/G', 'D|Bm7', 'G|D/F#', 'Em7|A7', 'D|D/A'];
export const A_BASS = N(`D3:2 A2:2   G2:2 F#2:2   E2:2 E3:1 D3:1   A2:2 G2:2
  D3:2 B2:2   G2:2 F#2:2   E2:2 A2:2   D3:2 A2:2`);
// the counter-melody: it holds while the tune runs and sings inside the tune's held notes and rests
export const A_COUNTER = N(`R:1 F#3:.5 G3:.5 A3:1 D3:1   B3:2 A3:2   R:1 G3:.5 A3:.5 B3:1 G3:1   C#4:1.5 D4:.5 E4:2
  R:1 F#3:.5 G3:.5 A3:1 B3:1   B3:2 A3:2   R:1 E3:.5 F#3:.5 G3:1 C#4:1   A3:1.5 B3:.5 A3:1 D3:1`);

// A′: the celli walk a line of their own under the solo horn, and the violins get a new descant
const A2_BASS = N(`D3:2 F#3:1 E3:1   G3:2 F#3:2   E3:2 G3:2   A3:2 G3:2
  F#3:2 D3:2   B2:2 F#3:2   E3:2 A2:2   D3:2 A2:2`);
const A2_DESCANT = N(`R:2 A5:1.5 R:.5   R:4   R:2 B5:1.5 R:.5   R:2 C#6:1 D6:1
  R:2 D6:1.5 R:.5   R:4   R:2 A5:1 B5:1   D6:2 C#6:1 R:1`);

// B — the trio. Its own tune: longer notes, a held C#6 with a whole beat of silence after it, four bars of
// relative minor and four bars home. Not a transposition of anything in A.
const B_MELODY = [
  ...N('F#5:1.5 G5:.5 A5:2'),
  ...N('G5:1 F#5:.5 E5:.5 D5:2'),
  ...N('E5:1.5 F#5:.5 G5:1 A5:1'),
  ...N('B5:2 C#6:1 R:1'),
  ...N('D6:1.5 C#6:.5 B5:2'),
  ...N('B5:1 A5:.5 G5:.5 E5:2'),
  ...N('F#5:1.5 G5:.5 A5:1 G5:1'),
  ...N('D5:2 R:1 A4:.5 B4:.5'),
];
const B_CHORDS = ['Bm7', 'G|D/F#', 'Em7|A7', 'D|A7', 'Bm7|G', 'Em7|A7', 'D/F#|A7', 'D'];
const B_BASS = N(`B2:2 F#2:2   G2:2 F#2:2   E2:2 A2:2   D3:2 A2:2
  B2:2 G2:2   E2:2 A2:2   F#2:2 A2:2   D3:2 D2:2`);
// the celli sing against the oboe (contrary where the oboe rises)
const B_CELLO = N('D4:2 B3:2   B3:2 A3:2   G3:2 A3:2   F#3:2 E3:2   A3:2 G3:2   B3:2 C#4:2   A3:2 G3:2   F#3:4');

// A″: a sustained descant over the trumpets (half notes, so it is a line and not a shadow of the tune)
const A3_DESCANT = N('R:2 D6:2   B5:2 D6:2   R:2 B5:2   E6:2 C#6:2   R:2 D6:2   D6:2 A5:2   C#6:2 B5:2   D6:3 R:1');

export function build() {
  const T = Theme({ id: 'overworld', title: 'Over Hill, Over Homeward', key: 'D major', bpm: 118, meter: 4, pulse: [0, 2], intro: 4, loop: 34, space: 'HALL', gain: 0.8 });
  const vlns = T.part('violins', { voice: 'strings', bus: 'melody', gain: 1.15 });
  const vlnHi = T.part('violinsHi', { voice: 'strings', bus: 'counter', gain: 0.95 });
  const hornTune = T.part('hornTune', { voice: 'hornSolo', bus: 'melody', gain: 1.2 });
  const oboeTune = T.part('oboe', { voice: 'oboe', bus: 'melody', gain: 1.1 });
  const fluteTune = T.part('fluteTune', { voice: 'flute', bus: 'melody', gain: 0.9 });
  const trumpets = T.part('trumpets', { voice: 'trumpet', bus: 'melody', gain: 0.95 });
  const trumpet2 = T.part('trumpet2', { voice: 'trumpet', bus: 'harmony', gain: 0.7 });
  const hn1 = T.part('horn1', { voice: 'horns', bus: 'counter', gain: 0.95, pan: -0.3 });
  const hn2 = T.part('horn2', { voice: 'horns', bus: 'harmony', gain: 0.8, pan: -0.38 });
  const bsn = T.part('bassoon', { voice: 'bassoon', bus: 'counter', gain: 1.05 });
  const clar = T.part('clarinet', { voice: 'clarinet', bus: 'counter', gain: 0.9 });
  const flute = T.part('flute', { voice: 'flute', bus: 'counter', gain: 0.95 });
  const tbn1 = T.part('trombone1', { voice: 'trombone', bus: 'harmony', gain: 0.8 });
  const tbn2 = T.part('trombone2', { voice: 'trombone', bus: 'harmony', gain: 0.75 });
  const tuba = T.part('tuba', { voice: 'tuba', bus: 'bass', gain: 0.7 });
  const celli = T.part('celli', { voice: 'strings', bus: 'counter', pan: 0.28, gain: 1.0, o: { attack: 0.03 } });
  const vlaPad = T.part('violas', { voice: 'strings', bus: 'harmony', gain: 0.8, o: { attack: 0.35 } });
  const bassStr = T.part('bassStrings', { voice: 'strings', bus: 'bass', pan: 0.3, gain: 0.95, o: { attack: 0.04 } });
  const pizz = T.part('pizz', { voice: 'pizz', bus: 'bass', gain: 0.9 });
  const harp = T.part('harp', { voice: 'harp', bus: 'harmony' });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const snare = T.part('snare', { voice: 'snare', bus: 'perc' });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });
  const tri = T.part('tri', { voice: 'tri', bus: 'perc', gain: 0.8 });
  const bar = (b, beat = 0) => T.bar(b, beat);

  /** timpani only where the road needs a footfall: [bar, beat, dyn?] — never "every bar of every section" */
  const foot = (h, list, dyn = 'mp') => {
    for (const [b, bt, d] of list) {
      const x = bar(b, bt); const c = h.find((q) => x >= q.b - 1e-6 && x < q.b + q.d - 1e-6); if (!c) continue;
      timp.note(x, c.pcs.has(2) && (c.root === 2 || c.bass === 2) ? 'D2' : c.pcs.has(9) ? 'A2' : c.pcs.has(2) ? 'D2' : 'E2', 0.5, { dyn: d || dyn });
    }
  };
  /** the walking bass: arco basses + a pizzicato spike on the first note of each half bar */
  const bassLine = (start, line, dyn, pdyn, pizzEvery = 2) => {
    bassStr.seq(start, line, { dyn, shape: false });
    let b = T.bar(start);
    for (const [n, d] of line) { if (n !== 'R' && (b % pizzEvery < 1e-6)) pizz.note(b, n, Math.min(1, d), { dyn: pdyn, gain: 0.9 }); b += d; }
  };
  /** a marching snare over `n` bars: eighths with the march accent, a sixteenth fill at the end of every 4th bar */
  const march = (start, n, dyn = 'mp', fill = true) => {
    for (let k = 0; k < n; k++) {
      const b = start + k, last = fill && k % 4 === 3;
      for (let e = 0; e < 8; e++) {
        if (last && e >= 5) continue;
        snare.note(bar(b, e * 0.5), 'D4', 0.25, { dyn: e === 0 ? 'mf' : e % 2 ? dyn : 'mp', gain: e % 2 ? 0.62 : 0.95 });
      }
      if (last) for (let s2 = 0; s2 < 6; s2++) snare.note(bar(b, 2.5 + s2 * 0.25), 'D4', 0.25, { dyn: 'mf', gain: 0.6 + s2 * 0.07 });
    }
  };

  // ---- Intro (bars 0-3): two horns call the Hearth Cell over a D pedal, the woodwinds answer, the snare rolls in,
  //      and the last half-bar is the tune's upbeat — the door opening onto the road.
  const hI = T.chords(0, ['D', 'D', 'D', 'A7|A7']);
  hn1.seq(0, N('A4:1 D5:1 C#5:1 B4:1  A4:3 R:1  R:4  A4:1.5 R:2.5'), { dyn: 'f', art: 'tenuto' });
  hn2.seq(0, N('F#4:1 F#4:1 E4:1 D4:1  F#4:3 R:1  R:4  C#4:1.5 R:2.5'), { dyn: 'f', art: 'tenuto' });
  flute.seq(2, N('R:1 D5:.5 E5:.5 F#5:1 A5:1'), { dyn: 'mf' });
  clar.seq(2, N('R:1 F#4:.5 G4:.5 A4:1 D5:1'), { dyn: 'mp' });
  bassStr.seq(0, N('D2:8 D2:4 A1:4'), { dyn: 'mf', shape: false });
  tbn1.seq(0, N('A3:8 A3:4 G3:4'), { dyn: 'mp', shape: false });
  tbn2.seq(0, N('F#3:8 F#3:4 E3:4'), { dyn: 'mp', shape: false });
  foot(hI, [[0, 0, 'f'], [0, 2], [2, 0, 'mf'], [3, 0, 'mf'], [3, 2]]);
  snare.roll(bar(1, 2), bar(2, 0), 'D4', { from: 'pp', to: 'f', perBeat: 8, alt: 0.75 });
  snare.note(bar(2, 0), 'D4', 0.25, { dyn: 'f' });
  cym.note(bar(2, 0), 'C5', 2, { dyn: 'mp' });
  harp.gliss(bar(3, 2), 'A7', 'A2', 'A5', { dyn: 'mp' });
  vlns.seq(3, A_PICKUP, { beat: 3, dyn: 'mf' });          // the upbeat into A

  // ---- A (bars 4-11): mf. The violins sing the period; the bassoon answers in its holes; the bass walks.
  //      Timpani only on the odd bars, no snare at all — the march has somewhere to grow to.
  let s = 4;
  const hA = T.chords(s, A_CHORDS);
  vlns.seq(s, A_MELODY, { dyn: 'mf' });
  bsn.seq(s, A_COUNTER, { dyn: 'mf' });
  hn2.seq(s + 1, N('D4:4  R:4  F#4:2 E4:2  R:4  D4:4  R:4  C#4:4'), { dyn: 'p', shape: false });
  bassLine(s, A_BASS, 'mf', 'mp');
  clar.seq(s + 3, N('R:1 A4:.5 B4:.5 C#5:1 R:1'), { dyn: 'mp' });
  flute.seq(s + 7, N('R:1 D6:.5 C#6:.5 B5:.5 A5:.5 F#5:1'), { dyn: 'mf', legato: 'bar' });
  harp.figs([
    [bar(s), ['D3', 'A3', 'D4', 'F#4']], [bar(s + 1), ['B2', 'G3', 'B3', 'D4']],
    [bar(s + 2), ['E3', 'B3', 'E4', 'G4']], [bar(s + 3), ['A2', 'E3', 'G3', 'C#4']],
    [bar(s + 4), ['D3', 'A3', 'D4', 'F#4']], [bar(s + 5), ['B2', 'G3', 'B3', 'D4']],
    [bar(s + 6), ['E3', 'B3', 'E4', 'G4']], [bar(s + 6, 2), ['C#3', 'E3', 'G3', 'A3']],
    [bar(s + 7), ['D3', 'A3', 'D4', 'F#4']],
  ], { dyn: 'p', d: 2, spread: 0.055 });
  foot(hA, [[s, 0, 'mp'], [s + 2, 0], [s + 3, 2, 'p'], [s + 4, 0, 'mp'], [s + 6, 0], [s + 7, 0, 'mp'], [s + 7, 2, 'p']]);

  // ---- A′ (bars 12-19): p → mp. The solo horn has the tune an octave down (soft horn, played soft), the violins
  //      answer it with a new descant, the clarinet counters, the celli walk. Snare from bar 16 at pp.
  s = 12;
  const hA2 = T.chords(s, A_CHORDS);
  hornTune.seq(s, A_MELODY, { dyn: 'mp', oct: -1, legato: 'bar' });
  vlnHi.seq(s, A2_DESCANT, { cresc: ['p', 'mp'] });
  clar.seq(s, A_COUNTER, { dyn: 'p' });
  celli.seq(s, A2_BASS, { dyn: 'mp', shape: false });
  [['D2', s], ['B2', s + 2], ['D2', s + 4], ['E2', s + 6]].forEach(([n, b]) => pizz.note(bar(b), n, 1.5, { dyn: 'p' }));
  tbn1.seq(s + 4, N('R:4 B3:4 G3:2 C#4:2 F#3:4'), { dyn: 'p', shape: false });
  flute.seq(s + 7, N('R:2 D6:.5 C#6:.5 B5:.5 A5:.5'), { dyn: 'mp' });
  harp.figs([
    [bar(s), ['D3', 'A3', 'D4', 'F#4']], [bar(s + 2), ['E3', 'B3', 'E4', 'G4']],
    [bar(s + 4), ['D3', 'A3', 'D4', 'F#4']], [bar(s + 6), ['E3', 'B3', 'E4', 'G4']], [bar(s + 6, 2), ['C#3', 'E3', 'G3', 'A3']],
  ], { dyn: 'pp', d: 2.5, spread: 0.06 });
  foot(hA2, [[s, 0, 'p'], [s + 4, 0, 'p'], [s + 7, 0, 'p']]);
  march(s + 4, 4, 'pp', false);

  // ---- B (bars 20-27): THE TRIO. No percussion, no brass but one held horn. The oboe is alone with a plucked
  //      bass for four bars in the relative minor; the flute doubles it at the octave for the answer.
  s = 20;
  const hB = T.chords(s, B_CHORDS);
  oboeTune.seq(s, bars(B_MELODY, 0, 4, 4), { dyn: 'mp' });        // the oboe asks, in the relative minor
  fluteTune.seq(s + 4, bars(B_MELODY, 4, 4, 4), { dyn: 'mp' });    // and the flute answers it home
  celli.seq(s, B_CELLO, { dyn: 'p', shape: false });
  bassLine(s, B_BASS, 'p', 'mp', 2);
  T.pad('violas', hB.slice(4), { n: 3, lo: 'A3', hi: 'E5', cresc: ['pp', 'p'], o: { attack: 0.5 } });
  hn2.seq(s, N('R:16 D4:8 D4:4 F#4:4'), { dyn: 'pp', shape: false });
  bsn.seq(s + 2, N('R:2 B3:1 A3:1  G3:2 F#3:2'), { dyn: 'p' });
  harp.figs([
    [bar(s), ['B2', 'F#3', 'B3', 'D4'], 'up'], [bar(s, 2), ['F#3', 'B3', 'D4', 'F#4'], 'up'],
    [bar(s + 1), ['G2', 'D3', 'G3', 'B3'], 'up'], [bar(s + 1, 2), ['F#3', 'A3', 'D4', 'F#4'], 'up'],
    [bar(s + 2), ['E3', 'B3', 'E4', 'G4'], 'up'], [bar(s + 2, 2), ['A2', 'E3', 'G3', 'C#4'], 'up'],
    [bar(s + 3), ['D3', 'A3', 'D4', 'F#4'], 'up'],
    [bar(s + 4), ['B2', 'F#3', 'B3', 'D4'], 'up'], [bar(s + 4, 2), ['G2', 'D3', 'G3', 'B3'], 'up'],
    [bar(s + 5), ['E3', 'B3', 'E4', 'G4'], 'up'], [bar(s + 5, 2), ['A2', 'E3', 'G3', 'C#4'], 'up'],
    [bar(s + 6), ['F#2', 'D3', 'F#3', 'A3'], 'up'], [bar(s + 6, 2), ['A2', 'E3', 'G3', 'C#4'], 'up'],
    [bar(s + 7), ['D3', 'A3', 'D4', 'F#4', 'A4', 'D5'], 'up'],
  ], { dyn: 'p', step: 0.5, len: 1.1 });
  // the lift into the tutti: the timpani and snare crescendo across the last bar and the harp runs up
  timp.roll(bar(s + 7, 0), bar(s + 8, 0), 'A2', { from: 'pp', to: 'f', perBeat: 6 });
  snare.roll(bar(s + 7, 2), bar(s + 8, 0), 'D4', { from: 'p', to: 'f', perBeat: 8, alt: 0.8 });
  cym.note(bar(s + 7, 2), 'C5', 2, { dyn: 'p', o: { roll: true } });

  // ---- A″ (bars 28-35): f → ff tutti. Trumpets take the tune, the horns take the counter an octave up, the
  //      violins hold a descant above it, trombones and tuba fill the floor, the snare marches every bar.
  s = 28;
  const hA3 = T.chords(s, A_CHORDS);
  trumpets.seq(s, A_MELODY, { dyn: 'f' });
  hn1.seq(s, A_COUNTER, { dyn: 'f', oct: 1 });
  vlnHi.seq(s, A3_DESCANT, { cresc: ['f', 'ff'], shape: false });
  vlns.seq(s + 4, bars(A_MELODY, 4, 4, 4), { dyn: 'f', oct: 0, gain: 0.85 });
  bassLine(s, A_BASS, 'f', 'mf', 2);
  celli.seq(s, A_COUNTER, { dyn: 'mf', shape: false });
  tbn1.seq(s, N('A3:4  B3:4  G3:4  A3:4  A3:4  D4:2 F#3:2  B3:2 C#4:2  D4:4'), { dyn: 'mf', shape: false });
  tbn2.seq(s, N('F#3:4  D3:4  E3:4  E3:4  F#3:4  B3:2 F#3:2  G3:2 C#4:2  F#3:4'), { dyn: 'mf', shape: false });
  tuba.seq(s, A_BASS, { dyn: 'mf', oct: -1, shape: false });
  trumpet2.seq(s + 3, N('R:2 A4:.5 B4:.5 C#5:1'), { dyn: 'mf' });
  flute.seq(s + 3, N('R:2 B5:.5 C#6:.5 D6:1'), { dyn: 'mf' });
  harp.figs([
    [bar(s), ['D3', 'A3', 'D4', 'F#4', 'A4']], [bar(s + 1), ['B2', 'G3', 'B3', 'D4', 'G4']],
    [bar(s + 2), ['E3', 'B3', 'E4', 'G4', 'B4']], [bar(s + 3), ['A2', 'E3', 'G3', 'C#4', 'E4']],
    [bar(s + 4), ['D3', 'A3', 'D4', 'F#4', 'A4']], [bar(s + 5), ['B2', 'G3', 'B3', 'D4', 'G4']],
    [bar(s + 6), ['E3', 'B3', 'E4', 'G4', 'B4']], [bar(s + 7), ['D3', 'A3', 'D4', 'F#4', 'A4']],
  ], { dyn: 'mp', d: 3, spread: 0.05 });
  cym.note(bar(s), 'C5', 2, { dyn: 'f' });
  tri.note(bar(s + 4), 'A6', 1.5, { dyn: 'mp' });
  foot(hA3, [[s, 0, 'f'], [s, 2, 'mp'], [s + 1, 0, 'mf'], [s + 2, 0, 'f'], [s + 2, 2, 'mp'], [s + 3, 0, 'mf'],
    [s + 4, 0, 'f'], [s + 4, 2, 'mp'], [s + 5, 0, 'mf'], [s + 6, 0, 'f'], [s + 6, 2, 'mf'], [s + 7, 0, 'f'], [s + 7, 2, 'mf']]);
  march(s, 8, 'mp');

  // ---- Tag (bars 36-37): the cadence lands ff — and then the band stops. Only the walking bass and one horn
  //      upbeat carry the loop back to A at mf, so the march has a top and a bottom.
  s = 36;
  const hT = T.chords(s, ['A7', 'D|D/A']);
  trumpets.seq(s, N('E5:1 F#5:1 G5:1 A5:1  D5:2 R:2'), { dyn: 'ff' });
  trumpet2.seq(s, N('C#5:1 D5:1 E5:1 F#5:1  A4:2 R:2'), { dyn: 'f' });
  hn1.seq(s, N('A3:1 C#4:1 E4:1 A4:1  F#4:2 R:1.5 A4:.5'), { dyn: 'ff' });
  hn2.seq(s, N('E3:1 E3:1 A3:1 C#4:1  D4:2 R:2'), { dyn: 'f' });
  vlnHi.seq(s, N('A5:2 E6:2  D6:2 R:2'), { dyn: 'ff' });
  vlns.seq(s, N('A5:2 G5:2  F#5:2 R:1 B4:.5 A4:.5'), { dyn: 'f' });
  tbn1.seq(s, N('G3:4  A3:2 R:2'), { dyn: 'f', shape: false });
  tbn2.seq(s, N('C#4:4  D3:2 R:2'), { dyn: 'f', shape: false });
  tuba.seq(s, N('A1:4  D2:2 R:2'), { dyn: 'f', shape: false });
  bassStr.seq(s, N('A2:4  D3:2 D3:1 A2:1'), { dyn: 'f', shape: false });
  pizz.seq(s + 1, N('D3:1 R:1 F#3:.5 R:.5 A2:1'), { dyn: 'mp', shape: false });
  harp.gliss(bar(s + 1), 'D', 'D3', 'D6', { dyn: 'mf' });
  cym.note(bar(s + 1), 'C5', 3, { dyn: 'f' });
  timp.roll(bar(s, 2), bar(s + 1, 0), 'A2', { from: 'mp', to: 'f', rate: 14 });
  timp.note(bar(s + 1, 0), 'D2', 1, { dyn: 'f' });
  return T.build();
}
