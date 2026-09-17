// T4 · CASTLE — "The King's Small Kindnesses" · C major · 3/4 minuet · ♩=96 · A A B A → loop
// The harpsichord is the sound of a throne room: full chord on beat 1, a two-note upper voicing on beats 2 and 3.
import { Theme, voiceChord } from './_lib.js';

const A_MELODY = [
  ['G4', 1], ['C5', 1], ['E5', 1],
  ['D5', 2], ['G4', 1],
  ['C5', 1], ['E5', 1], ['G5', 1],
  ['F5', 2], ['E5', 1],
  ['D5', 1], ['F5', 1], ['A5', 1],
  ['G5', 2], ['E5', 1],
  ['F5', 1], ['E5', 1], ['D5', 1],
  ['C5', 3],
];
const A_HARM = ['C', 'G', 'C', 'F', 'Dm', 'G', 'G7', 'C'];
// B: to A minor. The bible gives the first six notes; the rest keeps the A rhythm. Horn asks (bars 1-2, 5-6), oboe answers.
const B_MELODY = [
  ['E5', 1], ['A5', 1], ['G5', 1],
  ['F5', 2], ['E5', 1],
  ['C5', 1], ['E5', 1], ['A5', 1],
  ['A5', 2], ['G5', 1],
  ['D5', 1], ['F5', 1], ['A5', 1],
  ['G#5', 2], ['B5', 1],
  ['C6', 1], ['B5', 1], ['A5', 1],
  ['D5', 2], ['B4', 1],
];
const B_HARM = ['Am', 'E7', 'Am', 'F', 'Dm', 'E7', 'Am', 'G7'];

export function build() {
  const T = Theme({ id: 'castle', title: "The King's Small Kindnesses", key: 'C major', bpm: 96, meter: 3, pulse: [0], loop: 32, space: 'HALL', gain: 1.45 });
  const oboe = T.part('oboe', { voice: 'oboe', bus: 'melody' });
  const horn = T.part('horn', { voice: 'hornSolo', bus: 'melody' });
  const hornDbl = T.part('hornDbl', { voice: 'hornSolo', bus: 'counter', gain: 0.8 });
  const hc = T.part('harpsi', { voice: 'harpsi', bus: 'harmony', gain: 1.1 });
  T.part('pizz', { voice: 'pizz', bus: 'bass' });
  T.part('strings', { voice: 'strings', bus: 'harmony', o: { attack: 0.35 } });

  const court = (h) => {
    let prev = null;
    for (const c of h) {
      const v = voiceChord(c, 4, 'C3', 'C5', prev); prev = v;
      hc.chord(c.b, v, 0.9, { dyn: 'mp' });
      hc.chord(c.b + 1, v.slice(2), 0.45, { dyn: 'p' });
      hc.chord(c.b + 2, v.slice(2), 0.45, { dyn: 'p' });
    }
    T.bass('pizz', h, { pat: [[0, '1', 1], [2, '5', 1, 0.8]], base: 'E2', dyn: 'mp' });
  };

  // A (0-7): oboe alone over the court; strings arrive at bar 4
  const h1 = T.chords(0, A_HARM); oboe.seq(0, A_MELODY, { dyn: 'mf' }); court(h1);
  T.pad('strings', h1.slice(4), { n: 3, lo: 'E3', hi: 'E4', dyn: 'p' });
  // A (8-15): the solo horn doubles an octave below
  const h2 = T.chords(8, A_HARM); oboe.seq(8, A_MELODY, { dyn: 'mf' }); hornDbl.seq(8, A_MELODY, { dyn: 'mp', oct: -1 }); court(h2);
  T.pad('strings', h2, { n: 3, lo: 'E3', hi: 'E4', dyn: 'p' });
  // B (16-23): A minor — the horn takes the lead, the oboe answers
  const h3 = T.chords(16, B_HARM); court(h3);
  horn.seq(16, B_MELODY.slice(0, 5), { dyn: 'mf', oct: -1 });
  oboe.seq(18, B_MELODY.slice(5, 10), { dyn: 'mf' });
  horn.seq(20, B_MELODY.slice(10, 15), { dyn: 'mf', oct: -1 });
  oboe.seq(22, B_MELODY.slice(15), { dyn: 'mf' });
  T.pad('strings', h3, { n: 3, lo: 'E3', hi: 'E4', dyn: 'mp' });
  // A (24-31): home again; the last harpsichord chord leads straight back to bar 1
  const h4 = T.chords(24, A_HARM); oboe.seq(24, A_MELODY, { dyn: 'mf' }); court(h4);
  T.pad('strings', h4, { n: 3, lo: 'E3', hi: 'E4', dyn: 'p' });
  return T.build();
}
