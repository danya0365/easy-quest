// T1 · TITLE — "Overture: The Long Road Home" · D major · 4/4
// Fanfare (5 bars, once, free ♩≈72) → Grand A (8, ♩=84) → Grand A′ (8, up a third to F#) → Coda (4, rit. to 66) → loop.
// The seam sits inside the coda's held D chord, so it is inaudible.
// The Grand A is literally the overworld's A — its tune, its counter-melody and its walking bass — so the first
// fifteen seconds of the game teach the player the theme they will walk to for ten hours. Nothing is doubled in
// octaves: the fanfare's second voice moves in thirds and sixths, and the violas carry the counter-melody.
import { Theme, N, degree, bars } from './_lib.js';
import { A_MELODY, A_CHORDS, A_BASS, A_COUNTER } from './overworld.js';

const FAN_TRUMPET = N('A4:.5 D5:.5 F#5:.5 A5:.5 D6:2 R:1 A5:.5 G5:.5 F#5:.5 E5:.5 D5:3 R:1 D5:4');
const FAN_HORN = N('F#3:.5 A3:.5 D4:.5 F#4:.5 A4:2 R:1 F#4:.5 E4:.5 D4:.5 C#4:.5 A3:3 R:1 F#3:4');
// Grand A′: the same tune a third higher, then E7 | A7 bends home
const A2_CHORDS = ['F#', 'B', 'F#', 'C#', 'G#m', 'C#7', 'E7', 'A7'];
const A2_BASS = N('F#2:4 B2:4 A#2:4 C#3:4 B2:4 C#3:4 E2:4 A2:4');
const A2_DESCANT = N('A#5:4  B5:2 C#6:2  A#5:2 F#5:2  C#6:4  B5:4  G#5:2 B5:2  B4:2 E5:2  C#5:2 A4:2');

export function build() {
  const T = Theme({ id: 'title', title: 'Overture: The Long Road Home', key: 'D major', bpm: 84, meter: 4, pulse: [0, 2], intro: 5, loop: 20, space: 'HALL', gain: 0.72,
    tempo: [{ bar: 0, bpm: 72 }, { bar: 5, bpm: 84 }, { bar: 21, bpm: 84, to: 66, bars: 4 }] });
  const trumpet = T.part('trumpet', { voice: 'trumpet', bus: 'melody' });
  const hornFan = T.part('hornFanfare', { voice: 'horns', bus: 'counter', gain: 0.95 });
  const bones = T.part('bones', { voice: 'trombone', bus: 'harmony', gain: 0.75 });
  const strHi = T.part('violins', { voice: 'strings', bus: 'melody', gain: 1.1 });
  const vla = T.part('violas', { voice: 'strings', bus: 'counter', gain: 0.95 });
  const hornCtr = T.part('hornCounter', { voice: 'horns', bus: 'counter', gain: 0.9 });
  const pad = T.part('pad', { voice: 'strings', bus: 'harmony' });
  const hornPad = T.part('hornPad', { voice: 'horns', bus: 'harmony', gain: 0.7 });
  const choir = T.part('choir', { voice: 'strings', bus: 'harmony', send: 0.6, o: { attack: 1.2 } });
  const celli = T.part('celli', { voice: 'strings', bus: 'bass', pan: 0.28, gain: 0.9 });
  const harp = T.part('harp', { voice: 'harp', bus: 'counter' });
  const solo = T.part('solo', { voice: 'hornSolo', bus: 'melody', send: 0.55 });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });
  const flute = T.part('flute', { voice: 'flute', bus: 'counter' });

  const rolled = (h, base = 'D3') => { // a harp chord rolled per bar, six notes 60 ms apart
    for (const c of h) ['1', '5', '8', '10', '12', '15'].forEach((tok, k) => harp.push({ b: c.b, sec: k * 0.06, d: Math.max(2, c.d), m: degree(c, tok, base), v: 0.42, shape: false }));
  };
  const tuned = (c) => (c.pcs.has(2) ? 'D2' : c.pcs.has(9) ? 'A2' : c.pcs.has(1) ? 'C#2' : c.pcs.has(6) ? 'F#2' : c.pcs.has(8) ? 'G#2' : 'E2');
  const timp13 = (h, dyn = 'mp') => { for (const c of h) for (let x = c.b; x < c.b + c.d - 1e-6; x += 2) timp.note(x, tuned(c), 0.5, { dyn }); };

  // ---- Fanfare (bars 0-4): timpani roll pp→ff, the trumpet calls and a horn answers a tenth below, crash on bar 4
  T.chords(0, ['D', 'D', 'D|A7', 'D', 'D']);
  timp.roll(T.bar(0), T.bar(2), 'D2', { from: 'pp', to: 'ff', bpm: 72 });
  ['D2', 'A2', 'D2', 'A2'].forEach((n, k) => timp.note(T.bar(2, k), n, 1, { dyn: 'f' }));
  trumpet.seq(1, FAN_TRUMPET, { beat: 1, dyn: 'f', art: 'tenuto' });
  hornFan.seq(1, FAN_HORN, { beat: 1, dyn: 'ff', art: 'tenuto' });
  strHi.seq(2, N('A5:.5 G5:.5 F#5:.5 E5:.5 D5:3 R:1 D5:4'), { beat: 2, dyn: 'f' });
  bones.figs([[T.bar(3), ['D3', 'F#3', 'A3'], 'block', 8]], { dyn: 'f' });
  pad.figs([[T.bar(1), ['D4', 'F#4', 'A4', 'D5'], 'block', 6], [T.bar(2, 2), ['C#4', 'E4', 'G4', 'A4'], 'block', 2],
    [T.bar(3), ['D4', 'F#4', 'A4', 'D5'], 'block', 8]], { dyn: 'mf' });
  hornPad.figs([[T.bar(4), ['D3', 'F#3', 'A3', 'D4'], 'block', 4]], { dyn: 'f' });
  celli.seq(0, N('D2:8 A1:4 D2:8'), { dyn: 'mf', shape: false });
  cym.note(T.bar(4), 'C5', 3, { dyn: 'f' });
  timp.note(T.bar(4), 'D2', 2, { dyn: 'ff' });
  harp.gliss(T.bar(4), 'D', 'D3', 'D6', { dyn: 'mf' });

  // ---- Grand A (bars 5-12): the overworld tune on the violins, its counter-melody in the violas, its walking bass
  const hA = T.chords(5, A_CHORDS);
  strHi.seq(5, A_MELODY, { dyn: 'f' });
  vla.seq(5, A_COUNTER, { dyn: 'mf' });
  celli.seq(5, A_BASS, { dyn: 'mf', shape: false });
  // sustained chords, voiced by hand so the inner voices move by step through the inversions
  pad.figs([[T.bar(5), ['D4', 'F#4', 'A4'], 'block', 4],
    [T.bar(6), ['D4', 'G4', 'B4'], 'block', 2], [T.bar(6, 2), ['D4', 'F#4', 'A4'], 'block', 2],
    [T.bar(7), ['D4', 'G4', 'B4'], 'block', 2], [T.bar(7, 2), ['D4', 'F#4', 'A4'], 'block', 2],
    [T.bar(8), ['E4', 'G4', 'B4'], 'block', 2], [T.bar(8, 2), ['C#4', 'E4', 'G4'], 'block', 2],
    [T.bar(9), ['E4', 'G4', 'B4'], 'block', 4], [T.bar(10), ['C#4', 'E4', 'G4'], 'block', 4],
    [T.bar(11), ['E4', 'G4', 'B4'], 'block', 2], [T.bar(11, 2), ['C#4', 'E4', 'G4'], 'block', 2],
    [T.bar(12), ['D4', 'F#4', 'A4'], 'block', 4]], { dyn: 'p' });
  hornPad.figs([[T.bar(5), ['D3', 'F#3', 'A3'], 'block', 4],
    [T.bar(6), ['D3', 'G3', 'B3'], 'block', 2], [T.bar(6, 2), ['D3', 'F#3', 'A3'], 'block', 2],
    [T.bar(7), ['D3', 'G3', 'B3'], 'block', 2], [T.bar(7, 2), ['D3', 'F#3', 'A3'], 'block', 2],
    [T.bar(8), ['E3', 'G3', 'B3'], 'block', 2], [T.bar(8, 2), ['E3', 'G3', 'A3'], 'block', 2],
    [T.bar(9), ['E3', 'G3', 'B3'], 'block', 4], [T.bar(10), ['E3', 'G3', 'A3'], 'block', 4],
    [T.bar(11), ['E3', 'G3', 'B3'], 'block', 2], [T.bar(11, 2), ['E3', 'G3', 'A3'], 'block', 2],
    [T.bar(12), ['D3', 'F#3', 'A3'], 'block', 4]], { dyn: 'mp' });
  rolled(hA); timp13(hA);

  // ---- Grand A′ (bars 13-20): a third higher (F# major) for six bars, the horns take the counter-melody,
  //      the flute soars above with a descant, then E7 | A7 bends it home
  const hA2 = T.chords(13, A2_CHORDS);
  const up = bars(A_MELODY, 0, 6, 4);          // the first six bars of the overworld period, a third higher
  const bend = N('G#5:1.5 A5:.5 B5:1 G#5:1 A5:2 G5:1 E5:1');
  strHi.seq(13, up, { dyn: 'f', tr: 4 }); strHi.seq(19, bend, { dyn: 'f' });
  hornCtr.seq(13, bars(A_COUNTER, 0, 6, 4), { dyn: 'f', tr: 4 });
  hornCtr.seq(19, N('B3:2 D4:2 A3:2 E4:2'), { dyn: 'f' });
  flute.seq(13, A2_DESCANT, { dyn: 'mf' });
  celli.seq(13, A2_BASS, { dyn: 'mf', shape: false });
  pad.figs([[T.bar(13), ['C#4', 'F#4', 'A#4'], 'block', 4], [T.bar(14), ['D#4', 'F#4', 'B4'], 'block', 4],
    [T.bar(15), ['C#4', 'F#4', 'A#4'], 'block', 4], [T.bar(16), ['C#4', 'E#4', 'G#4'], 'block', 4],
    [T.bar(17), ['D#4', 'G#4', 'B4'], 'block', 4], [T.bar(18), ['E#4', 'G#4', 'B4'], 'block', 4],
    [T.bar(19), ['D4', 'E4', 'G#4'], 'block', 4], [T.bar(20), ['C#4', 'E4', 'G4'], 'block', 4]], { dyn: 'mp' });
  rolled(hA2, 'E3'); timp13(hA2, 'mf');
  cym.note(T.bar(13), 'C5', 2, { dyn: 'mf' });

  // ---- Coda (bars 21-24): the solo horn says the Hearth Cell twice, rit.; harp glissando; the D chord rings into the loop
  const hC = T.chords(21, ['D', 'D', 'D|A', 'D']);
  const cell = N('A4:1 D5:1 C#5:1 B4:1 A4:4');
  solo.seq(21, cell, { dyn: 'p' }); solo.seq(23, cell, { dyn: 'p' });
  pad.figs([[T.bar(21), ['D4', 'F#4', 'A4'], 'block', 8], [T.bar(23), ['D4', 'F#4', 'A4'], 'block', 2],
    [T.bar(23, 2), ['C#4', 'E4', 'A4'], 'block', 2]], { dyn: 'pp' });
  celli.seq(21, N('D2:8 B1:2 A1:2'), { dyn: 'p', shape: false });
  harp.gliss(T.bar(23), 'D', 'D2', 'D6', { dyn: 'mp', spacing: 0.07 });
  pad.figs([[T.bar(24), ['D3', 'A3', 'D4', 'F#4'], 'block', 7]], { dyn: 'p' });
  choir.figs([[T.bar(23), ['D4', 'F#4', 'A4'], 'block', 8]], { dyn: 'p' });
  celli.seq(24, N('D2:7'), { dyn: 'p', shape: false });

  return T.build();
}
