// T2 · HOME VILLAGE (Puddlewick) — "Under the Low Roofs" · G major · 6/8 (dotted quarter = 66) · A B A C
// The C section is Queen Elowen's lullaby, played by the oboe with a music-box celesta above it. Nothing bad happens here:
// no percussion, ever.
import { Theme } from './_lib.js';

export const A_MELODY = [
  ['D4', 0.5], ['G4', 0.5], ['A4', 0.5], ['B4', 1.5],
  ['A4', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 1.5],
  ['B4', 0.5], ['D5', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5], ['A4', 0.5],
  ['B4', 1.5], ['R', 1.5],
  ['D5', 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 1.5],
  ['E5', 0.5], ['D5', 0.5], ['C5', 0.5], ['B4', 1.5],
  ['A4', 0.5], ['B4', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5],
  ['G4', 3],
];
// bible harmony G | D7 | Em | C|D | G | C | Am|D7 | G, tuned so every strong-beat melody note is a chord tone
export const A_HARM = ['G', 'D7|G', 'Em', 'Cmaj7|D', 'G', 'C|G/B', 'Am|D7', 'G'];
const B_MELODY = [
  ['B4', 0.5], ['E5', 0.5], ['F#5', 0.5], ['G5', 1.5],
  ['F#5', 0.5], ['G5', 0.5], ['F#5', 0.5], ['D5', 1.5],
  ['E5', 0.5], ['G5', 0.5], ['E5', 0.5], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5],
  ['D5', 1.5], ['R', 1.5],
  ['G5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['G5', 1.5],
  ['C6', 0.5], ['B5', 0.5], ['A5', 0.5], ['G5', 1.5],
  ['A5', 0.5], ['G5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 0.5],
  ['B4', 3],
];
const B_HARM = ['Em', 'Bm', 'C', 'D', 'Em', 'C', 'Am|D7', 'G'];

export function build() {
  const T = Theme({ id: 'village', title: 'Under the Low Roofs', key: 'G major', bpm: 99, meter: 3, pulse: [0, 1.5], loop: 32, space: 'HALL', gain: 1.75 });
  const flute = T.part('flute', { voice: 'flute', bus: 'melody', oct: 1 });
  const oboe = T.part('oboe', { voice: 'oboe', bus: 'melody' });
  const cel = T.part('celesta', { voice: 'celesta', bus: 'counter', gain: 0.8 });
  T.part('harp', { voice: 'harp', bus: 'harmony', send: 0.5 });
  T.part('pizz', { voice: 'pizz', bus: 'bass' });
  T.part('strings', { voice: 'strings', bus: 'harmony', o: { attack: 0.45 } });
  const harpPat = { pat: ['1', '5', '8', '10', '8', '5'], step: 0.5, base: 'C3', dyn: 'p', len: 1.6, cycle: 3 };
  const pizzPat = { pat: [[0, '1', 0.5], [1.5, '5', 0.5]], base: 'E2', dyn: 'mp', cycle: 3 };

  // A (0-7)
  const hA = T.chords(0, A_HARM);
  flute.seq(0, A_MELODY, { dyn: 'mp' });
  T.arp('harp', hA, harpPat); T.bass('pizz', hA, pizzPat);
  T.pad('strings', hA.filter((c) => c.b >= T.bar(4)), { n: 3, lo: 'D3', hi: 'D4', dyn: 'pp' });
  // B (8-15)
  const hB = T.chords(8, B_HARM);
  flute.seq(8, B_MELODY, { dyn: 'mp' });
  T.arp('harp', hB, harpPat); T.bass('pizz', hB, pizzPat);
  T.pad('strings', hB, { n: 3, lo: 'D3', hi: 'D4', dyn: 'pp' });
  // A (16-23)
  const hA2 = T.chords(16, A_HARM);
  flute.seq(16, A_MELODY, { dyn: 'mp' });
  T.arp('harp', hA2, harpPat); T.bass('pizz', hA2, pizzPat);
  T.pad('strings', hA2, { n: 3, lo: 'D3', hi: 'D4', dyn: 'pp' });
  // C (24-31): the lullaby — oboe alone over held strings, a music box above, the flute answers the last two bars
  const hC = T.chords(24, A_HARM);
  oboe.seq(24, A_MELODY.slice(0, 18), { dyn: 'p' });
  flute.seq(30, A_MELODY.slice(18), { dyn: 'p' });
  cel.seq(24, A_MELODY, { dyn: 'pp', oct: 2 });
  T.arp('harp', hC, { ...harpPat, dyn: 'pp' }); T.bass('pizz', hC, { ...pizzPat, dyn: 'p' });
  T.pad('strings', hC, { n: 3, lo: 'D3', hi: 'D4', dyn: 'p' });
  return T.build();
}
