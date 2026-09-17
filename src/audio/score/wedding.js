// WEDDING — "Bells Over Bellhollow" · F major · 4/4 · ♩=76 · Intro(2) → A(8) → B(8) → A′(8) → loop to A · CANON §9 `wedding`
// It opens on the Hearth Cell in F (C F E D C), so a wedding sounds like the same family. Bells ring down the scale,
// the organ holds the room, and the last A brings the horns and every bell in the tower.
import { Theme } from './_lib.js';

const A_MELODY = [
  ['C5', 1], ['F5', 1], ['E5', 1], ['D5', 1],
  ['C5', 2], ['Bb4', 1], ['A4', 1],
  ['G4', 1], ['C5', 1], ['Bb4', 1], ['A4', 1],
  ['A4', 3], ['R', 1],
  ['D5', 1], ['G5', 1], ['F5', 1], ['E5', 1],
  ['F5', 2], ['D5', 1], ['F5', 1],
  ['D5', 1.5], ['E5', 0.5], ['F5', 1], ['G5', 1],
  ['F5', 3], ['R', 1],
];
const A_HARM = ['F', 'F/A|Bb', 'Gm7|C7', 'F', 'Gm|C7', 'F|Dm', 'Bb|C7', 'F'];
const B_MELODY = [
  ['A5', 2], ['F5', 1], ['D5', 1],
  ['F5', 2], ['D5', 1], ['Bb4', 1],
  ['Bb4', 1], ['D5', 1], ['G5', 1], ['F5', 1],
  ['E5', 3], ['R', 1],
  ['A5', 1.5], ['G5', 0.5], ['F5', 1], ['A5', 1],
  ['Bb5', 2], ['F5', 2],
  ['G5', 1], ['F5', 1], ['E5', 1], ['C5', 1],
  ['F5', 2], ['R', 2],
];
const B_HARM = ['Dm', 'Bb', 'Gm', 'C', 'Dm', 'Bb', 'Gm7|C7', 'F'];

export function build() {
  const T = Theme({ id: 'wedding', title: 'Bells Over Bellhollow', key: 'F major', bpm: 76, meter: 4, pulse: [0, 2], intro: 2, loop: 24, space: 'CHAPEL', gain: 1.15 });
  const bells = T.part('bells', { voice: 'bell', bus: 'counter', gain: 0.8 });
  const organ = T.part('organ', { voice: 'organ', bus: 'harmony', gain: 0.8 });
  const pedal = T.part('pedal', { voice: 'organ', bus: 'bass', o: { pedal: true } });
  const vns = T.part('violins', { voice: 'strings', bus: 'melody' });
  const flute = T.part('flute', { voice: 'flute', bus: 'melody' });
  const horns = T.part('horns', { voice: 'horns', bus: 'melody' });
  T.part('harp', { voice: 'harp', bus: 'counter' });
  T.part('pizz', { voice: 'pizz', bus: 'bass' });
  T.part('strPad', { voice: 'strings', bus: 'harmony' });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });
  const roots = (h, dyn) => T.bass('pedal', h, { pat: [[0, 'B', 4]], base: 'C2', dyn, art: 'legato' });

  // Intro (0-1): change-ringing down the scale, twice, over the organ's F chord
  const peal = ['F5', 'E5', 'D5', 'C5', 'Bb4', 'A4', 'G4', 'F4'];
  for (const bar of [0, 1]) peal.forEach((n, k) => bells.note(T.bar(bar, k * 0.5), n, 2, { dyn: k ? 'mp' : 'mf', o: { len: 0.7 } }));
  const hI = T.chords(0, ['F', 'F']);
  T.pad('organ', hI, { n: 4, lo: 'F3', hi: 'C5', dyn: 'mp' }); roots(hI, 'mp');

  // A (2-9): violins sing, organ and pizzicato underneath, a harp ripple
  const hA = T.chords(2, A_HARM);
  vns.seq(2, A_MELODY, { dyn: 'mf' });
  T.pad('organ', hA, { n: 3, lo: 'F3', hi: 'F4', dyn: 'p' }); roots(hA, 'mp');
  T.bass('pizz', hA, { pat: [[0, '1', 1], [2, '5', 1, 0.8]], base: 'E2', dyn: 'mp' });
  T.arp('harp', hA, { pat: ['1', '5', '8', '10', '12', '10', '8', '5'], step: 0.5, base: 'F3', dyn: 'pp', len: 1.5, cycle: 4 });
  // B (10-17): the flute, gentler, the harp carries it
  const hB = T.chords(10, B_HARM);
  flute.seq(10, B_MELODY, { dyn: 'mp' });
  T.pad('strPad', hB, { n: 3, lo: 'D3', hi: 'D4', dyn: 'p' }); roots(hB, 'p');
  T.arp('harp', hB, { pat: ['1', '5', '8', '10', '12', '10', '8', '5'], step: 0.5, base: 'D3', dyn: 'p', len: 1.5, cycle: 4 });
  // A′ (18-25): everyone — horns and violins, full organ, a bell on every downbeat, timpani
  const hA2 = T.chords(18, A_HARM);
  horns.seq(18, A_MELODY, { dyn: 'f' });
  vns.seq(18, A_MELODY, { dyn: 'f', oct: 1, gain: 0.7 });
  T.pad('organ', hA2, { n: 4, lo: 'F3', hi: 'C5', dyn: 'mf' }); roots(hA2, 'mf');
  T.pad('strPad', hA2, { n: 3, lo: 'C4', hi: 'C5', dyn: 'mp' });
  for (let bar = 18; bar < 26; bar++) { bells.note(T.bar(bar), bar % 2 ? 'C5' : 'F4', 3, { dyn: 'mf' }); timp.note(T.bar(bar), bar % 2 ? 'C2' : 'F2', 1, { dyn: 'mf' }); timp.note(T.bar(bar, 2), 'C2', 1, { dyn: 'mp' }); }
  cym.note(T.bar(18), 'C5', 3, { dyn: 'mf' });
  peal.forEach((n, k) => bells.note(T.bar(25, k * 0.5), n, 2, { dyn: 'mp', o: { len: 0.7 } }));
  return T.build();
}
