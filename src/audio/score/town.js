// T5 · TOWN — "Market Morning" · F major · 2/4 · ♩=120 · A A B A (32 bars ≈ 32 s) → loop
// Light and never insistent: a harpsichord chatters in alberti eighths, pizzicato on the downbeat, and a chiptune
// twinkle winks at you on the last eighth of bars 4 and 8.
import { Theme, voiceChord } from './_lib.js';

const A_MELODY = [
  ['F4', 0.5], ['G4', 0.5], ['A4', 0.5], ['C5', 0.5],
  ['A4', 1], ['F4', 1],
  ['G4', 0.5], ['A4', 0.5], ['Bb4', 0.5], ['D5', 0.5],
  ['C5', 1], ['A4', 1],
  ['Bb4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F4', 0.5],
  ['E4', 1], ['G4', 1],
  ['F4', 0.5], ['G4', 0.5], ['A4', 0.5], ['Bb4', 0.5],
  ['A4', 1.5], ['R', 0.5],
];
// bible: F | Dm | Bb | C7 | Bb | C7 | F | C7 — bar 3 as Gm7 (its G4 downbeat) and bar 8 lands on F (the twinkle's E is its sweet major seventh)
const A_HARM = ['F', 'Dm', 'Gm7', 'C7', 'Bb', 'C7', 'F', 'F'];
const B_MELODY = [
  ['D5', 0.5], ['Eb5', 0.5], ['F5', 0.5], ['Bb5', 0.5],
  ['G5', 1], ['D5', 1],
  ['Eb5', 0.5], ['F5', 0.5], ['G5', 0.5], ['Bb5', 0.5],
  ['A5', 1], ['F5', 1],
  ['Bb5', 0.5], ['A5', 0.5], ['F5', 0.5], ['D5', 0.5],
  ['G4', 0.5], ['Bb4', 0.5], ['D5', 1],
  ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['G5', 0.5],
  ['F5', 1], ['C5', 0.5], ['R', 0.5],
];
const B_HARM = ['Bb', 'Gm', 'Eb', 'F7', 'Bb', 'Gm', 'C7', 'F7'];

export function build() {
  const T = Theme({ id: 'town', title: 'Market Morning', key: 'F major', bpm: 120, meter: 2, pulse: [0, 1], loop: 32, space: 'ROOM', gain: 1.6 });
  const oboe = T.part('oboe', { voice: 'oboe', bus: 'melody' });
  const flute = T.part('flute', { voice: 'flute', bus: 'melody' });
  const hc = T.part('harpsi', { voice: 'harpsi', bus: 'harmony' });
  T.part('harpsiAlb', { voice: 'harpsi', bus: 'harmony' });
  T.part('pizz', { voice: 'pizz', bus: 'bass' });
  T.part('strings', { voice: 'strings', bus: 'harmony', o: { attack: 0.3 } });
  const tw = T.part('twinkle', { voice: 'twinkle', bus: 'counter' });

  const alberti = (h) => { T.arp('harpsiAlb', h, { pat: ['1', '5', '8', '5'], step: 0.5, base: 'F3', dyn: 'p', len: 0.5, cycle: 2 }); T.bass('pizz', h, { pat: [[0, '1', 1]], base: 'F2', dyn: 'mp', cycle: 2 }); };
  const wink = (bar) => {
    tw.note(T.bar(bar + 3, 1.5), 'E5', 0.4, { dyn: 'pp' }); tw.note(T.bar(bar + 7, 1.5), 'E5', 0.4, { dyn: 'p' });
    T.parts.pizz.note(T.bar(bar + 7, 1), 'C3', 0.5, { dyn: 'mp' }); T.parts.pizz.note(T.bar(bar + 7, 1.5), 'E3', 0.5, { dyn: 'mp' }); // turnaround into bar 1
  };

  const h1 = T.chords(0, A_HARM); oboe.seq(0, A_MELODY, { dyn: 'mp' }); alberti(h1); wink(0);
  const h2 = T.chords(8, A_HARM); oboe.seq(8, A_MELODY, { dyn: 'mp' }); flute.seq(8, A_MELODY, { dyn: 'mp', oct: 1, gain: 0.8 }); alberti(h2); wink(8);
  // B (16-23): to B-flat, the flute leads, the harpsichord thins to the downbeat, the strings come in
  const h3 = T.chords(16, B_HARM); flute.seq(16, B_MELODY, { dyn: 'mf' });
  let prev = null; for (const c of h3) { prev = voiceChord(c, 3, 'F3', 'F4', prev); hc.chord(c.b, prev, 0.6, { dyn: 'mp' }); }
  T.bass('pizz', h3, { pat: [[0, '1', 1], [1, '5', 1, 0.7]], base: 'F2', dyn: 'mf', cycle: 2 });
  T.pad('strings', h3, { n: 3, lo: 'D3', hi: 'D4', dyn: 'mp' });
  const h4 = T.chords(24, A_HARM); oboe.seq(24, A_MELODY, { dyn: 'mp' }); alberti(h4); wink(24);
  return T.build();
}
