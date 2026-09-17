// FINALE — "Welcome Home" · D major · 3/4 · ♩=72 · CANON §9 `finale` (the coronation portrait and the credits)
// Intro(4) → the family theme turned to major, with Queen Elowen's lullaby as a counter-melody underneath (8) →
// its B strain, full (8) → the Puddlewick tune in full brass (8) → a grand Hearth Cell coda (4) → loop to the family theme.
import { Theme } from './_lib.js';
import { A_MELODY as PUDDLEWICK } from './village.js';

// family A in D major: minor degrees 5 1 b7 5 | b6 5 4 5 ... become 5 1 7 5 | 6 5 4 5 — which is the Hearth Cell
const FAM_A = [['A4', 2], ['D5', 1], ['C#5', 2], ['A4', 1], ['B4', 1], ['A4', 1], ['G4', 1], ['A4', 3],
  ['F#4', 2], ['A4', 1], ['D5', 2], ['C#5', 1], ['B4', 1], ['A4', 1], ['G4', 1], ['F#4', 3]];
const FAM_A_HARM = ['D', 'A7|D', 'Bm', 'D/A|A', 'D', 'G|D/F#', 'Em|A7', 'D'];
const FAM_B = [['D5', 2], ['E5', 1], ['F#5', 2], ['G5', 1], ['F#5', 1], ['E5', 1], ['D5', 1], ['E5', 3],
  ['C#5', 2], ['D5', 1], ['E5', 2], ['F#5', 1], ['E5', 1], ['D5', 1], ['C#5', 1], ['B4', 3]];
const FAM_B_HARM = ['D', 'Gmaj7', 'Em7', 'A', 'F#m', 'G', 'Em|F#7', 'Bm'];
const PUD_HARM = ['D', 'A7|D', 'Bm', 'Gmaj7|A', 'D', 'G|D/F#', 'Em|A7', 'D'];

export function build() {
  const T = Theme({ id: 'finale', title: 'Welcome Home', key: 'D major', bpm: 72, meter: 3, pulse: [0], intro: 4, loop: 28, space: 'HALL', gain: 0.9 });
  const vns = T.part('violins', { voice: 'strings', bus: 'melody', gain: 1.25 });
  const lull = T.part('lullaby', { voice: 'hornSolo', bus: 'counter' });
  const flute = T.part('flute', { voice: 'flute', bus: 'counter' });
  const horns = T.part('horns', { voice: 'horns', bus: 'melody' });
  const hornsLo = T.part('hornsLo', { voice: 'horns', bus: 'counter', gain: 0.7 });
  T.part('strPad', { voice: 'strings', bus: 'harmony' });
  T.part('hornPad', { voice: 'horns', bus: 'harmony', gain: 0.6 });
  const celli = T.part('celli', { voice: 'strings', bus: 'bass', pan: -0.3, gain: 0.8 });
  T.part('harp', { voice: 'harp', bus: 'counter' });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });
  const snare = T.part('snare', { voice: 'snare', bus: 'perc' });
  const cel = T.part('celesta', { voice: 'celesta', bus: 'counter' });
  const roots = (h, dyn) => T.bass('celli', h, { pat: [[0, 'B', 3]], base: 'D2', dyn });
  const harp = (h, dyn = 'p') => T.arp('harp', h, { pat: ['1', '5', '8', '10', '8', '5'], step: 0.5, base: 'D3', dyn, len: 2, cycle: 3 });
  const downbeats = (bar0, n, dyn) => { for (let k = 0; k < n; k++) timp.note(T.bar(bar0 + k), k % 2 ? 'A2' : 'D2', 1, { dyn }); };

  // Intro (0-3): a timpani roll, then the Hearth Cell in the horns
  const hI = T.chords(0, ['D', 'D', 'D', 'G|A7']);
  timp.roll(0, T.bar(2), 'D2', { from: 'pp', to: 'f', bpm: 72 });
  horns.seq(2, [['A4', 1], ['D5', 1], ['C#5', 1], ['B4', 1], ['A4', 2]], { dyn: 'f' });
  hornsLo.seq(2, [['A3', 1], ['D4', 1], ['C#4', 1], ['B3', 1], ['A3', 2]], { dyn: 'f' });
  T.pad('strPad', hI, { n: 4, lo: 'D3', hi: 'A4', cresc: ['p', 'f'] }); roots(hI, 'mf');
  cym.note(T.bar(2), 'C5', 3, { dyn: 'mf' });

  // Family, major (4-11): violins in octaves; the lullaby underneath in the solo horn; harp
  const h1 = T.chords(4, FAM_A_HARM);
  vns.seq(4, FAM_A, { dyn: 'mf' }); vns.seq(4, FAM_A, { dyn: 'mp', oct: 1, gain: 0.6 });
  lull.seq(4, PUDDLEWICK, { dyn: 'mp', tr: -5 });
  T.pad('strPad', h1, { n: 3, lo: 'D3', hi: 'D4', dyn: 'p' }); roots(h1, 'mp'); harp(h1);
  // Family B (12-19): full strings, horns warm underneath, flute above
  const h2 = T.chords(12, FAM_B_HARM);
  vns.seq(12, FAM_B, { cresc: ['mf', 'f'] }); vns.seq(12, FAM_B, { cresc: ['mp', 'mf'], oct: -1, gain: 0.7 });
  flute.seq(12, FAM_B, { dyn: 'mp', oct: 1, gain: 0.7 });
  T.pad('hornPad', h2, { n: 3, lo: 'D3', hi: 'D4', cresc: ['mp', 'mf'] }); roots(h2, 'mf'); harp(h2, 'mp');
  downbeats(16, 4, 'mp');
  // Puddlewick in full brass (20-27)
  const h3 = T.chords(20, PUD_HARM);
  horns.seq(20, PUDDLEWICK, { dyn: 'ff', tr: 7 });
  hornsLo.seq(20, PUDDLEWICK, { dyn: 'f', tr: -5 });
  vns.seq(20, PUDDLEWICK, { dyn: 'f', tr: 19, gain: 0.6 });
  T.pad('strPad', h3, { n: 4, lo: 'D3', hi: 'A4', dyn: 'f' }); roots(h3, 'f');
  downbeats(20, 8, 'mf'); cym.note(T.bar(20), 'C5', 3, { dyn: 'f' });
  for (let bar = 24; bar < 28; bar++) for (const x of [0, 1, 1.5, 2]) snare.note(T.bar(bar, x), 'D4', 0.25, { dyn: x ? 'mp' : 'mf' });
  // Coda (28-31): the Hearth Cell, grand; the last D rings on into the loop
  const hC = T.chords(28, ['D', 'G|A7', 'D', 'D']);
  const cell = [['A4', 1], ['D5', 1], ['C#5', 1], ['B4', 1], ['A4', 2], ['D5', 3], ['D5', 3.5]];
  horns.seq(28, cell, { dyn: 'ff' }); hornsLo.seq(28, cell, { dyn: 'f', oct: -1 }); vns.seq(28, cell, { dyn: 'f', oct: 1 });
  T.pad('strPad', hC, { n: 4, lo: 'D3', hi: 'A4', dyn: 'f', overlap: 2 }); roots(hC, 'f');
  timp.roll(T.bar(29), T.bar(30), 'A2', { from: 'mf', to: 'ff', bpm: 72 }); timp.note(T.bar(30), 'D2', 3, { dyn: 'ff' });
  cym.note(T.bar(30), 'C5', 4, { dyn: 'f' });
  T.parts.harp.gliss(T.bar(30), 'D', 'D3', 'D6', { dyn: 'mf' });
  cel.seq(30, [['D6', 1], ['F#6', 1], ['A6', 4]], { dyn: 'mp' });
  return T.build();
}
