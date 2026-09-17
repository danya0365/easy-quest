// T10 · BATTLE — "Draw Steel!" · D minor · 4/4 · ♩=156 · Intro(2) → A(8) → A′(8) → B(8) → A(8) → loop to A
import { Theme } from './_lib.js';

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
// bible: Dm | Gm | A7 | A7 | Dm | Bb | Gm|A7 | Dm — bars 6 and 8 split so the held E5 and the E5 downbeat are chord tones
export const A_HARM = ['Dm', 'Gm', 'A7', 'A7', 'Dm', 'Bb|C', 'Gm|A7', 'A7|Dm'];
const B_MELODY = [
  ['A4', 0.5], ['Bb4', 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 2],
  ['C5', 0.5], ['C#5', 0.5], ['D5', 0.5], ['Eb5', 0.5], ['E5', 2],
  ['F5', 1], ['E5', 1], ['D5', 1], ['C#5', 1],
  ['D5', 2], ['R', 2],
  ['D5', 0.5], ['Eb5', 0.5], ['E5', 0.5], ['F5', 0.5], ['G5', 2],
  ['F5', 0.5], ['F#5', 0.5], ['G5', 0.5], ['Ab5', 0.5], ['A5', 2],
  ['Bb5', 1], ['A5', 1], ['G5', 1], ['F5', 1],
  ['E5', 2], ['A4', 2],
];
// bible: Dm | Ddim7 | A7 | Dm | Gm | Gdim7 | A7 | A7 — the diminished chords are the leading-tone ones (C#°7, F#°7)
const B_HARM = ['Dm', 'C#dim7', 'A7', 'Dm', 'Gm', 'F#dim7', 'A7', 'A7'];

export function build() {
  const T = Theme({ id: 'battle', title: 'Draw Steel!', key: 'D minor', bpm: 156, meter: 4, pulse: [0, 2], intro: 2, loop: 32, space: 'HALL', gain: 0.95 });
  const horns = T.part('horns', { voice: 'horns', bus: 'melody', gain: 1.3, o: { tight: true } });
  const hornsLo = T.part('hornsLo', { voice: 'horns', bus: 'counter', gain: 0.65, o: { tight: true } });
  const strMel = T.part('strMel', { voice: 'strings', bus: 'counter', gain: 0.85 });
  T.part('trem', { voice: 'strings', bus: 'harmony', o: { trem: 60 / 156 / 4 } });
  const stabs = T.part('stabs', { voice: 'horns', bus: 'harmony', gain: 0.8, o: { tight: true, rel: 0.08 } });
  T.part('violas', { voice: 'strings', bus: 'harmony', gain: 0.8 });
  T.part('pizz', { voice: 'pizz', bus: 'bass' });
  T.part('celli', { voice: 'strings', bus: 'bass', pan: -0.3, gain: 0.7 });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const snare = T.part('snare', { voice: 'snare', bus: 'perc' });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });

  const drive = { pat: [[0, '1', 0.5], [0.5, '1', 0.5, 0.8], [1, '5', 0.5], [1.5, '1', 0.5, 0.8], [2, '1', 0.5], [2.5, '1', 0.5, 0.8], [3, '5', 0.5], [3.5, '8', 0.5, 0.9]], base: 'D2', cycle: 4 };
  const snareBars = (b0, n, dyn = 'mp', fills = [3, 7]) => {
    for (let k = 0; k < n; k++) {
      const bar = b0 + k;
      const fill = fills.includes(k);
      for (let e = 0; e < 8; e++) {
        if (fill && e >= 6) continue;
        snare.note(T.bar(bar, e * 0.5), 'D4', 0.25, { dyn: e % 4 === 0 ? 'mf' : dyn, gain: e % 2 ? 0.7 : 1 });
      }
      if (fill) for (let s = 0; s < 4; s++) snare.note(T.bar(bar, 3 + s * 0.25), 'D4', 0.25, { dyn: 'mf', gain: 0.75 + s * 0.1 });
    }
  };
  const timpBeats = (h, dyn = 'mf') => {
    for (const c of h) for (let x = c.b; x < c.b + c.d - 1e-6; x += 2) timp.note(x, c.pcs.has(2) ? 'D2' : 'A2', 0.5, { dyn: x % 4 ? 'mp' : dyn });
  };
  const section = (bar, mel, harm, { dyn = 'f', trem = false } = {}) => {
    const h = T.chords(bar, harm);
    horns.seq(bar, mel, { dyn, oct: -1, art: 'marcato' });
    strMel.seq(bar, mel, { dyn: dyn === 'ff' ? 'f' : 'mf' });
    T.bass('pizz', h, { ...drive, dyn: 'mp' });
    T.bass('celli', h, { pat: [[0, '1', 2], [2, '1', 2]], base: 'D2', dyn: 'mp', cycle: 4 });
    if (trem) T.pad('trem', h, { n: 3, lo: 'A3', hi: 'A4', dyn: 'mp' });
    else T.pad('violas', h, { n: 3, lo: 'A3', hi: 'A4', dyn: 'mp' });
    timpBeats(h);
    return h;
  };

  // Intro (0-1): timpani roll, two horn stabs with a crash, then the engine starts
  timp.roll(T.bar(0, 0), T.bar(0, 2), 'D2', { from: 'mf', to: 'ff', perBeat: 4 });
  stabs.chord(T.bar(0, 2), ['D4', 'A4', 'D5'], 0.5, { dyn: 'ff', art: 'marcato' });
  stabs.chord(T.bar(0, 3), ['D4', 'A4', 'D5'], 0.75, { dyn: 'ff', art: 'marcato' });
  cym.note(T.bar(0, 2), 'C5', 2, { dyn: 'f' });
  const hI = T.chords(1, ['Dm']);
  T.bass('pizz', hI, { ...drive, cresc: ['mp', 'f'] });
  T.pad('trem', hI, { n: 3, lo: 'A3', hi: 'A4', cresc: ['p', 'mf'] });
  snareBars(1, 1, 'p', []);
  timp.note(T.bar(1, 0), 'D2', 0.5, { dyn: 'mf' }); timp.note(T.bar(1, 2), 'A2', 0.5, { dyn: 'mf' });
  hornsLo.seq(1, [['R', 3], ['A3', 1]], { dyn: 'f', art: 'marcato' });

  // A (2-9)
  section(2, A_MELODY, A_HARM); snareBars(2, 8);
  cym.note(T.bar(2, 0), 'C5', 2, { dyn: 'mf' });
  // A′ (10-17): add the low horn octave and a crash at the top
  section(10, A_MELODY, A_HARM); snareBars(10, 8);
  hornsLo.seq(10, A_MELODY, { dyn: 'f', oct: -2, art: 'marcato' });
  cym.note(T.bar(10, 0), 'C5', 2, { dyn: 'f' });
  // B (18-25): chromatic climb, horns in unison, strings tremolo
  section(18, B_MELODY, B_HARM, { dyn: 'mf', trem: true }); snareBars(18, 8, 'p');
  hornsLo.seq(18, B_MELODY, { dyn: 'mf', oct: -2 });
  snare.roll(T.bar(25, 2), T.bar(26, 0), 'D4', { from: 'mp', to: 'f', perBeat: 8, alt: 0.8 });
  // A (26-33) at ff; the last bar's D is held under a crash and the reverb carries the seam
  section(26, A_MELODY, A_HARM, { dyn: 'ff' }); snareBars(26, 8, 'mf');
  hornsLo.seq(26, A_MELODY, { dyn: 'f', oct: -2, art: 'marcato' });
  cym.note(T.bar(26, 0), 'C5', 2, { dyn: 'f' });
  cym.note(T.bar(33, 2), 'C5', 3, { dyn: 'f' });
  return T.build();
}
