// T1 · TITLE — "Overture: The Long Road Home" · D major · 4/4
// Fanfare (5 bars, once, free ♩≈72) → Grand A (8, ♩=84) → Grand A′ (8, up a third to F#) → Coda (4, rit. to 66) → loop to Grand A.
// The seam sits inside the coda's held D chord, so it is inaudible.
import { Theme, degree } from './_lib.js';
import { A_MELODY, A_HARM } from './overworld.js';

export function build() {
  const T = Theme({ id: 'title', title: 'Overture: The Long Road Home', key: 'D major', bpm: 84, meter: 4, pulse: [0, 2], intro: 5, loop: 20, space: 'HALL', gain: 0.686,
    tempo: [{ bar: 0, bpm: 72 }, { bar: 5, bpm: 84 }, { bar: 21, bpm: 84, to: 66, bars: 4 }] });
  const horns = T.part('horns', { voice: 'trumpet', bus: 'melody' });
  const hornsLo = T.part('hornsLo', { voice: 'horns', bus: 'melody', gain: 0.9 });
  const hornsMid = T.part('hornsMid', { voice: 'horns', bus: 'counter', gain: 0.75 });
  const bones = T.part('bones', { voice: 'trombone', bus: 'harmony', gain: 0.75 });
  const strHi = T.part('strHi', { voice: 'strings', bus: 'melody' });
  const strLo = T.part('strLo', { voice: 'strings', bus: 'counter', gain: 0.85 });
  T.part('pad', { voice: 'strings', bus: 'harmony' });
  T.part('hornPad', { voice: 'horns', bus: 'harmony', gain: 0.7 });
  T.part('choir', { voice: 'strings', bus: 'harmony', send: 0.6, o: { attack: 1.2 } });
  const celli = T.part('celli', { voice: 'strings', bus: 'bass', pan: -0.3, gain: 0.8 });
  const harp = T.part('harp', { voice: 'harp', bus: 'counter' });
  const solo = T.part('solo', { voice: 'hornSolo', bus: 'melody', send: 0.55 });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });
  const flute = T.part('flute', { voice: 'flute', bus: 'counter' });

  const rolled = (h, base = 'D3') => { // a harp chord rolled per bar, six notes 60 ms apart
    for (const c of h) ['1', '5', '8', '10', '12', '15'].forEach((tok, k) => harp.push({ b: c.b, sec: k * 0.06, d: Math.max(2, c.d), m: degree(c, tok, base), v: 0.42, shape: false }));
  };
  const timp13 = (h, dyn = 'mp') => { for (const c of h) for (let x = c.b; x < c.b + c.d - 1e-6; x += 2) timp.note(x, c.pcs.has(2) ? 'D2' : c.pcs.has(9) ? 'A2' : 'F#2', 0.5, { dyn }); };

  // ---- Fanfare (bars 0-4): timpani roll pp→ff, horns ring out the rising call, crash on bar 4
  T.chords(0, ['D', 'D', 'D|A7', 'D', 'D']);
  timp.roll(T.bar(0), T.bar(2), 'D2', { from: 'pp', to: 'ff', bpm: 72 });
  ['D2', 'A2', 'D2', 'A2'].forEach((n, k) => timp.note(T.bar(2, k), n, 1, { dyn: 'f' }));
  const fan = [['A4', 0.5], ['D5', 0.5], ['F#5', 0.5], ['A5', 0.5], ['D6', 2], ['R', 1], ['A5', 0.5], ['G5', 0.5], ['F#5', 0.5], ['E5', 0.5], ['D5', 3], ['R', 1], ['D5', 4]];
  horns.seq(1, fan, { beat: 1, dyn: 'f', art: 'tenuto' });
  hornsLo.seq(1, fan, { beat: 1, dyn: 'ff', oct: -1, art: 'tenuto' });
  strHi.seq(2, [['A5', 0.5], ['G5', 0.5], ['F#5', 0.5], ['E5', 0.5], ['D5', 3], ['R', 1], ['D5', 4]], { beat: 2, dyn: 'f' });
  T.pad('bones', T.chords(3, ['D', 'D'], false), { n: 3, lo: 'D3', hi: 'D4', dyn: 'f' });
  T.pad('pad', T.chords(1, ['D', 'D', 'A7', 'D'], false), { n: 4, lo: 'D3', hi: 'A4', cresc: ['p', 'f'] });
  T.pad('hornPad', T.chords(4, ['D'], false), { n: 4, lo: 'D3', hi: 'D4', dyn: 'f' });
  celli.seq(0, [['D2', 8], ['A1', 4], ['D2', 8]], { dyn: 'mf' });
  cym.note(T.bar(4), 'C5', 3, { dyn: 'f' });
  timp.note(T.bar(4), 'D2', 2, { dyn: 'ff' });
  harp.gliss(T.bar(4), 'D', 'D3', 'D6', { dyn: 'mf' });

  // ---- Grand A (bars 5-12): the overworld tune, strings in octaves, horns below, a harp chord every bar
  const hA = T.chords(5, A_HARM);
  strHi.seq(5, A_MELODY, { dyn: 'f' });
  strLo.seq(5, A_MELODY, { dyn: 'mf', oct: -1 });
  hornsMid.seq(5, A_MELODY, { dyn: 'mf', oct: -1 });
  T.pad('pad', hA, { n: 3, lo: 'D3', hi: 'D4', dyn: 'p' });
  T.bass('celli', hA, { pat: [[0, '1', 4]], base: 'D2', dyn: 'mf' });
  rolled(hA); timp13(hA);

  // ---- Grand A′ (bars 13-20): a third higher (F# major) for six bars, then E7 | A7 bends home
  const hA2 = T.chords(13, ['F#', 'B', 'F#', 'C#', 'G#m', 'C#7', 'E7', 'A7']);
  const up = [...A_MELODY.slice(0, 20)];
  const bend = [['G#5', 1.5], ['A5', 0.5], ['B5', 1], ['G#5', 1], ['A5', 2], ['G5', 1], ['E5', 1]];
  strHi.seq(13, up, { dyn: 'f', tr: 4 }); strHi.seq(19, bend, { dyn: 'f' });
  strLo.seq(13, up, { dyn: 'mf', tr: 4 - 12 }); strLo.seq(19, bend, { dyn: 'mf', oct: -1 });
  hornsMid.seq(13, up, { dyn: 'f', tr: 4 - 12 }); hornsMid.seq(19, bend, { dyn: 'f', oct: -1 });
  flute.seq(13, up, { dyn: 'mp', tr: 16 }); flute.seq(19, bend, { dyn: 'mp', oct: 1 });
  T.pad('pad', hA2, { n: 3, lo: 'E3', hi: 'E4', dyn: 'mp' });
  T.bass('celli', hA2, { pat: [[0, '1', 4]], base: 'C#2', dyn: 'mf' });
  rolled(hA2, 'E3'); timp13(hA2, 'mf');
  cym.note(T.bar(13), 'C5', 2, { dyn: 'mf' });

  // ---- Coda (bars 21-24): the solo horn says the Hearth Cell twice, rit.; harp glissando; the D chord rings into the loop
  const hC = T.chords(21, ['D', 'D', 'D|A', 'D']);
  const cell = [['A4', 1], ['D5', 1], ['C#5', 1], ['B4', 1], ['A4', 4]];
  solo.seq(21, cell, { dyn: 'p' }); solo.seq(23, cell, { dyn: 'p' });
  T.pad('pad', hC.slice(0, 4), { n: 3, lo: 'D3', hi: 'D4', dyn: 'pp' });
  celli.seq(21, [['D2', 8], ['B1', 2], ['A1', 2]], { dyn: 'p' });
  harp.gliss(T.bar(23), 'D', 'D2', 'D6', { dyn: 'mp', spacing: 0.07 });
  T.pad('pad', T.chords(24, ['D'], false), { n: 4, lo: 'D3', hi: 'A4', dyn: 'p', overlap: 3 });
  T.pad('choir', T.chords(23, ['D', 'D'], false), { n: 3, lo: 'D4', hi: 'A4', dyn: 'p', overlap: 3 });
  celli.seq(24, [['D2', 7]], { dyn: 'p' });

  return T.build();
}
