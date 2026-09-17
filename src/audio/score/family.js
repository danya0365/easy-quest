// T14 · FAMILY / SAD — "What Your Father Would Say" · E minor (→ G major in B) · 3/4 · ♩=60 · A B A′ Coda → loop
// "The one that makes a grown-up's throat tighten." Plus its story variants:
//   family.short  — A only, for dialogue underscoring
//   family.broken — B9: the oboe's four notes, the last a semitone flat, then nothing
//   family.whole  — B20: the same notes resolved, in full strings for the first time
import { Theme } from './_lib.js';

export const A_MELODY = [
  ['B4', 2], ['E5', 1],
  ['D5', 2], ['B4', 1],
  ['C5', 1], ['B4', 1], ['A4', 1],
  ['B4', 3],
  ['G4', 2], ['B4', 1],
  ['E5', 2], ['D5', 1],
  ['C5', 1], ['B4', 1], ['A4', 1],
  ['G4', 3],
];
export const A_HARM = ['Em', 'G', 'Am', 'B7', 'Em', 'C', 'Am', 'G'];
export const B_MELODY = [
  ['G5', 2], ['A5', 1],
  ['B5', 2], ['C6', 1],
  ['B5', 1], ['A5', 1], ['G5', 1],
  ['A5', 3],
  ['F#5', 2], ['G5', 1],
  ['A5', 2], ['B5', 1],
  ['A5', 1], ['G5', 1], ['F#5', 1],
  ['E5', 3],
];
export const B_HARM = ['G', 'Cmaj7', 'Am7', 'D', 'Bm', 'C', 'Am|B7', 'Em'];
const CODA_HARM = ['Am', 'Em/B', 'C', 'Em'];
const HARP8 = { pat: ['1', '5', '8', '10', '8', '5'], step: 0.5, base: 'E3', dyn: 'p', len: 2, cycle: 3 };

function family({ id, title, whole = false, short = false }) {
  const T = Theme({ id, title, key: 'E minor', bpm: 60, meter: 3, pulse: [0], loop: short ? 8 : 28, space: 'CHAPEL', sendAdd: 0.10, gain: whole ? 1.05 : short ? 2.0 : 1.35,
    enter: { fadeOut: 1.2, gap: 0.6 } });
  const oboe = T.part('oboe', { voice: 'oboe', bus: 'melody' });
  const horn = T.part('horn', { voice: 'hornSolo', bus: 'melody' });
  const violin = T.part('violin', { voice: 'violin', bus: 'melody' });
  const vns = T.part('violins', { voice: 'strings', bus: 'melody', gain: 1.1 });
  T.part('strings', { voice: 'strings', bus: 'harmony', o: { attack: 0.8 } });
  T.part('harp', { voice: 'harp', bus: 'counter' });
  const celli = T.part('celli', { voice: 'strings', bus: 'bass', pan: -0.3, o: { attack: 0.6 } });
  const cel = T.part('celesta', { voice: 'celesta', bus: 'counter' });
  T.part('choir', { voice: 'pad', bus: 'harmony' });
  const hornPad = T.part('hornPad', { voice: 'hornSolo', bus: 'harmony', gain: 0.5 });
  const roots = (h, dyn) => T.bass('celli', h, { pat: [[0, 'B', 3]], base: 'D2', dyn });

  // A (0-7): the oboe alone for four bars; strings arrive at bar 4 (in `whole`, the violins carry it from the start)
  const hA = T.chords(0, A_HARM);
  if (whole) {
    vns.seq(0, A_MELODY, { dyn: 'mf' }); vns.seq(0, A_MELODY, { dyn: 'mp', oct: 1, gain: 0.55 });
    T.pad('strings', hA, { n: 3, lo: 'E3', hi: 'E4', dyn: 'mp' }); roots(hA, 'mp');
    T.arp('harp', hA, { ...HARP8, dyn: 'pp' });
  } else {
    oboe.seq(0, A_MELODY, { cresc: ['p', 'p'] });
    T.pad('strings', hA.slice(4), { n: 3, lo: 'E3', hi: 'E4', dyn: 'pp' }); roots(hA.slice(4), 'pp');
  }
  if (short) return T.build();

  // B (8-15): relative major — solo violin (or the whole section) above strings and an eighth-note harp
  const hB = T.chords(8, B_HARM);
  if (whole) { vns.seq(8, B_MELODY, { dyn: 'f' }); vns.seq(8, B_MELODY, { dyn: 'mf', oct: -1, gain: 0.6 }); T.pad('hornPad', hB, { n: 3, lo: 'D3', hi: 'D4', dyn: 'mp' }); }
  else violin.seq(8, B_MELODY, { dyn: 'mf', legato: 'bar' });
  T.pad('strings', hB, { n: 3, lo: 'E3', hi: 'E4', dyn: whole ? 'mf' : 'mp' }); roots(hB, whole ? 'mf' : 'mp');
  T.arp('harp', hB, HARP8);

  // A′ (16-23): call and response — the oboe asks, the solo horn (the father's voice) answers an octave below
  const hA2 = T.chords(16, A_HARM);
  if (whole) {
    vns.seq(16, A_MELODY, { cresc: ['mf', 'mp'] }); horn.seq(18, A_MELODY.slice(4, 8), { dyn: 'mp', oct: -1, gain: 0.8 }); horn.seq(22, A_MELODY.slice(12), { dyn: 'mp', oct: -1, gain: 0.8 });
  } else {
    oboe.seq(16, A_MELODY.slice(0, 4), { dyn: 'mp' });
    horn.seq(18, A_MELODY.slice(4, 8), { dyn: 'mp', oct: -1 });
    oboe.seq(20, A_MELODY.slice(8, 12), { cresc: ['mp', 'p'] });
    horn.seq(22, A_MELODY.slice(12), { cresc: ['p', 'pp'], oct: -1 });
    oboe.seq(23, [['G4', 3]], { dyn: 'pp', gain: 0.7 });
  }
  T.pad('strings', hA2, { n: 4, lo: 'E3', hi: 'G4', cresc: ['mp', 'p'] }); roots(hA2, 'mp');
  T.arp('harp', hA2, { ...HARP8, dyn: 'pp' });

  // Coda (24-27): the violin holds a high B, the harp rises once, the celesta places three notes over the last chord
  const hC = T.chords(24, CODA_HARM);
  (whole ? vns : violin).seq(24, [['B5', 6]], { cresc: ['mp', 'p'] });
  T.pad('strings', hC.slice(0, 3), { n: 3, lo: 'E3', hi: 'E4', cresc: ['p', 'pp'] });
  T.pad('strings', T.chords(27, ['Em'], false), { n: 3, lo: 'E3', hi: 'E4', dyn: 'pp', overlap: 2.5 });
  T.pad('choir', T.chords(26, ['C', 'Em'], false), { n: 3, lo: 'E4', hi: 'B4', dyn: 'pp', overlap: 2.5 });
  celli.seq(24, [['A2', 3], ['B2', 3], ['C3', 3], ['E2', 5]], { dyn: 'pp' });
  T.parts.harp.seq(26, [['E3', 0.5], ['G3', 0.5], ['B3', 0.5], ['E4', 0.5], ['G4', 0.5], ['B4', 0.5]], { dyn: 'p', shape: false });
  ['E5', 'G5', 'B5'].forEach((n, k) => cel.note(T.bar(27, k * 1.2), n, 2, { dyn: 'p' }));
  return T.build();
}

function broken() {
  const T = Theme({ id: 'family.broken', title: 'What Your Father Would Say (broken)', key: 'E minor', bpm: 60, meter: 3, pulse: [0], bars: 3, space: 'CHAPEL', sendAdd: 0.15, gain: 3.0, kind: 'oneshot', enter: { fadeOut: 0.05, gap: 0 } });
  const oboe = T.part('oboe', { voice: 'oboe', bus: 'melody' });
  oboe.seq(0, [['B4', 2], ['E5', 1], ['D5', 2]], { dyn: 'p' });
  oboe.note(T.bar(1, 2), 'Bb4', 2.2, { dyn: 'p', o: { falter: true, rel: 0.6 } }); // a semitone short of home, and it stops
  T.chords(0, ['Em', 'G']);
  return T.build();
}

export function build() {
  return [
    family({ id: 'family', title: 'What Your Father Would Say' }),
    family({ id: 'family.short', title: 'What Your Father Would Say (A only)', short: true }),
    broken(),
    family({ id: 'family.whole', title: 'What Your Father Would Say (whole)', whole: true }),
  ];
}
