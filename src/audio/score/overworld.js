// T3 · OVERWORLD — "Over Hill, Over Homeward" · D major · 4/4 · ♩=108
// Intro(4) → A(8) → A′(8) → B(8) → A″(8) → Tag(2) → loop to A. "The most important 45 seconds in the game."
import { Theme } from './_lib.js';

export const A_MELODY = [
  ['A4', 1], ['D5', 1], ['F#5', 1], ['A5', 1],
  ['G5', 2], ['F#5', 1], ['E5', 1],
  ['D5', 1.5], ['E5', 0.5], ['F#5', 1], ['D5', 1],
  ['E5', 3], ['A4', 1],
  ['B4', 1], ['E5', 1], ['G5', 1], ['B5', 1],
  ['A5', 2], ['G5', 1], ['F#5', 1],
  ['E5', 1.5], ['F#5', 0.5], ['G5', 1], ['E5', 1],
  ['D5', 3], ['R', 1],
];
export const A_HARM = ['D', 'G', 'D', 'A', 'Em', 'A7', 'G|A7', 'D'];
// A′ walks the bass down under the same tune (the celli counter-line is that bass): D C# B A G A B C# D
const A2_HARM = ['D', 'A7/C#', 'Bm', 'A', 'Em/G', 'A7', 'G/B|A7/C#', 'D'];
const B_MELODY = [
  ['D5', 1], ['G5', 1], ['F#5', 0.5], ['G5', 0.5], ['A5', 1],
  ['B5', 2], ['A5', 2],
  ['G5', 1], ['F#5', 1], ['E5', 1], ['D5', 1],
  ['E5', 3], ['R', 1],
  ['A4', 1], ['D5', 1], ['C5', 1], ['B4', 1],
  ['A4', 2], ['D5', 1], ['E5', 1],
  ['F#5', 1], ['E5', 1], ['D5', 1], ['C#5', 1],
  ['D5', 2], ['A4', 1], ['A4', 1],
];
const B_HARM = ['G', 'Em|D', 'Am7', 'D', 'C', 'D/F#', 'Bm|A', 'D|A7'];

export function build() {
  const T = Theme({ id: 'overworld', title: 'Over Hill, Over Homeward', key: 'D major', bpm: 108, meter: 4, pulse: [0, 2], intro: 4, loop: 34, space: 'HALL', gain: 0.643 });
  // Real brass: the tune sits A4-B5, above a horn's comfortable top, so the horn section sings it an octave down (warm,
  // noble), the violins carry it at pitch, and the trumpets join at pitch only for the ff return.
  const horns = T.part('horns', { voice: 'horns', bus: 'melody', gain: 1.1 });
  const trumpets = T.part('trumpets', { voice: 'trumpet', bus: 'melody', gain: 0.8 });
  const hornsLo = T.part('hornsLo', { voice: 'horns', bus: 'counter', gain: 0.7 });
  const bones = T.part('bones', { voice: 'trombone', bus: 'harmony', gain: 0.8 });
  const tuba = T.part('tuba', { voice: 'tuba', bus: 'bass', gain: 0.7 });
  const strMel = T.part('strMel', { voice: 'strings', bus: 'counter', gain: 0.9 });
  const flute = T.part('flute', { voice: 'flute', bus: 'counter' });
  const strLead = T.part('strLead', { voice: 'strings', bus: 'melody', gain: 1.1 });
  const strPad = T.part('strPad', { voice: 'strings', bus: 'harmony' });
  const hornPad = T.part('hornPad', { voice: 'horns', bus: 'harmony', gain: 0.75 });
  const celli = T.part('celli', { voice: 'strings', bus: 'bass', pan: -0.3 });
  const pizz = T.part('pizz', { voice: 'pizz', bus: 'bass' });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const snare = T.part('snare', { voice: 'snare', bus: 'perc' });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });
  const harp = T.part('harp', { voice: 'harp', bus: 'harmony' });

  const timpFor = (c) => (c.pcs.has(2) ? 'D2' : c.pcs.has(9) ? 'A2' : 'E2');
  const footfall = (h, beats = [0, 2], dyn = 'mp') => {
    for (let bar = Math.floor(h[0].b / 4); bar < Math.ceil((h[h.length - 1].b + h[h.length - 1].d) / 4); bar++) {
      for (const bt of beats) { const x = bar * 4 + bt; const c = h.find((q) => x >= q.b - 1e-6 && x < q.b + q.d - 1e-6); if (c) timp.note(x, timpFor(c), 0.5, { dyn }); }
    }
  };

  // ---- Intro (bars 0-3): the Hearth Cell in horn octaves over a D pedal; snare roll into bar 2
  const hi = T.chords(0, ['D', 'D', 'D', 'A7']);
  const cell = [['A3', 1], ['D4', 1], ['C#4', 1], ['B3', 1], ['A3', 4], ['R', 4], ['A4', 2], ['R', 2]];
  horns.seq(0, cell, { dyn: 'f', oct: 1, art: 'tenuto' });
  hornsLo.seq(0, cell, { dyn: 'f', art: 'tenuto' });
  T.pad('strPad', hi, { n: 4, lo: 'D3', hi: 'A4', cresc: ['mp', 'f'] });
  celli.seq(0, [['D2', 12], ['A1', 4]], { dyn: 'mf' });
  footfall(hi);
  snare.roll(T.bar(1, 2), T.bar(2, 0), 'D4', { from: 'pp', to: 'f', perBeat: 8, alt: 0.75 });
  snare.note(T.bar(2, 0), 'D4', 0.25, { dyn: 'f' });
  cym.note(T.bar(2, 0), 'C5', 2, { dyn: 'mp' });
  harp.gliss(T.bar(3, 2), 'A7', 'A2', 'A5', { dyn: 'mp' });

  // ---- A (bars 4-11): horn section sings (8vb), violins at pitch
  const hA = T.chords(4, A_HARM);
  horns.seq(4, A_MELODY, { dyn: 'f', oct: -1 });
  strLead.seq(4, A_MELODY, { dyn: 'mf', gain: 0.8 });
  strMel.seq(4, A_MELODY, { dyn: 'mp', oct: -1, gain: 0.7 });
  T.pad('strPad', hA, { n: 3, lo: 'D3', hi: 'D4', dyn: 'mp' });
  T.bass('celli', hA, { pat: [[0, '1', 2], [2, '5', 2]], base: 'D2', dyn: 'mp' });
  T.bass('pizz', hA, { pat: [[0, '1', 1], [2, '5', 1]], base: 'D2', dyn: 'mp' });
  footfall(hA);
  cym.note(T.bar(4, 0), 'C5', 2, { dyn: 'mp' });

  // ---- A′ (bars 12-19): same tune, flute an octave above, the celli walk down
  const hA2 = T.chords(12, A2_HARM);
  horns.seq(12, A_MELODY, { dyn: 'f', oct: -1 });
  strLead.seq(12, A_MELODY, { dyn: 'mf', gain: 0.8 });
  flute.seq(12, A_MELODY, { dyn: 'mf', oct: 1 });
  T.pad('strPad', hA2, { n: 3, lo: 'E3', hi: 'E4', dyn: 'mp' });
  celli.seq(12, [['D3', 4], ['C#3', 4], ['B2', 4], ['A2', 4], ['G2', 4], ['A2', 4], ['B2', 2], ['C#3', 2], ['D3', 4]], { dyn: 'mf', shape: false });
  T.bass('pizz', hA2, { pat: [[0, 'B', 1], [2, 'B', 1]], base: 'G1', dyn: 'mp' });
  footfall(hA2);

  // ---- B (bars 20-27): strings lead, horns become the organ of the orchestra, flute answers
  const hB = T.chords(20, B_HARM);
  strLead.seq(20, B_MELODY, { dyn: 'mp' });
  strLead.seq(20, B_MELODY, { dyn: 'mp', oct: -1, gain: 0.6 });
  T.pad('hornPad', hB, { n: 3, lo: 'D3', hi: 'D4', dyn: 'p' });
  T.arp('harp', hB, { pat: ['1', '5', '8', '10', '12', '10', '8', '5'], step: 0.5, base: 'D3', dyn: 'p', len: 1.5, cycle: 4 });
  T.bass('pizz', hB, { pat: [[0, 'B', 1], [2, '5', 1]], base: 'D2', dyn: 'mp' });
  T.bass('celli', hB, { pat: [[0, 'B', 4]], base: 'D2', dyn: 'mp' });
  flute.seq(23, [['R', 1], ['D6', 1], ['C6', 1], ['A5', 1]], { dyn: 'mp' });
  flute.seq(27, [['R', 2], ['E6', 1], ['C#6', 1]], { dyn: 'mp' });
  footfall(hB, [0, 2], 'p');

  // ---- A″ (bars 28-35): everyone home, three octaves, snare marching from bar 32
  const hA3 = T.chords(28, A_HARM);
  trumpets.seq(28, A_MELODY, { dyn: 'f' });
  horns.seq(28, A_MELODY, { dyn: 'ff', oct: -1 });
  strMel.seq(28, A_MELODY, { dyn: 'mf', oct: -1, gain: 0.7 });
  strLead.seq(28, A_MELODY, { dyn: 'f', gain: 0.9 });
  flute.seq(28, A_MELODY, { dyn: 'mf', oct: 1 });
  T.pad('strPad', hA3, { n: 4, lo: 'D3', hi: 'D4', dyn: 'mf' });
  T.pad('bones', hA3, { n: 3, lo: 'D3', hi: 'D4', dyn: 'mf', art: 'tenuto' });
  T.bass('tuba', hA3, { pat: [[0, '1', 2]], base: 'D2', dyn: 'mf' });
  T.bass('celli', hA3, { pat: [[0, '1', 2], [2, '5', 2]], base: 'D2', dyn: 'f' });
  T.bass('pizz', hA3, { pat: [[0, '1', 1], [1, '8', 1], [2, '5', 1], [3, '8', 1]], base: 'D2', dyn: 'mf' });
  cym.note(T.bar(28, 0), 'C5', 2, { dyn: 'f' });
  footfall(T.chords(28, A_HARM.slice(0, 6), false), [0, 2], 'mf');
  footfall(T.chords(34, A_HARM.slice(6), false), [0, 1, 2, 3], 'f');
  for (let bar = 32; bar < 36; bar++) for (let k = 0; k < 8; k++) snare.note(T.bar(bar, k * 0.5), 'D4', 0.25, { dyn: k % 4 === 0 ? 'mf' : k % 2 === 0 ? 'mp' : 'p' });

  // ---- Tag (bars 36-37): A7 → D, the final D held into the loop seam
  const hT = T.chords(36, ['A7', 'D']);
  trumpets.seq(36, [['E5', 1], ['F#5', 1], ['G5', 1], ['A5', 1], ['D5', 4.6]], { dyn: 'f' });
  horns.seq(36, [['E4', 1], ['F#4', 1], ['G4', 1], ['A4', 1], ['D4', 4.6]], { dyn: 'ff' });
  T.pad('bones', hT, { n: 3, lo: 'D3', hi: 'D4', dyn: 'f', overlap: 0.6 });
  tuba.seq(36, [['A1', 4], ['D2', 4.6]], { dyn: 'f' });
  strMel.seq(36, [['C#4', 1], ['D4', 1], ['E4', 1], ['C#4', 1], ['D4', 4.6]], { dyn: 'f' });
  T.pad('strPad', hT, { n: 4, lo: 'E3', hi: 'E4', dyn: 'f', overlap: 0.6 });
  celli.seq(36, [['A2', 4], ['D2', 4.6]], { dyn: 'f' });
  cym.note(T.bar(37, 0), 'C5', 3, { dyn: 'f' });
  timp.roll(T.bar(36, 2), T.bar(37, 0), 'A2', { from: 'mp', to: 'f', rate: 14 });
  timp.note(T.bar(37, 0), 'D2', 1, { dyn: 'f' });
  return T.build();
}
