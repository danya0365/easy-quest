// QUEEN ELOWEN'S LULLABY — "Hush Now, Little Lark" · G major · 6/8 (dotted quarter = 54) · CANON §9 `lullaby`
// The game's secret spine: the first two lines are the Puddlewick melody (heard as `village`'s C section, the Cobwell
// Manor music boxes, a fisherwoman's humming). Here it is finally heard whole — sung by a single wordless voice over
// harp — and the third and fourth lines, which nobody has heard before, finish it.
import { Theme } from './_lib.js';
import { A_MELODY, A_HARM } from './village.js';

const LINES_3_4 = [
  ['B4', 0.5], ['A4', 0.5], ['B4', 0.5], ['E5', 1.5],
  ['E5', 0.5], ['D5', 0.5], ['C5', 0.5], ['G4', 1.5],
  ['D5', 0.5], ['B4', 0.5], ['G4', 0.5], ['B4', 1.5],
  ['A4', 1.5], ['R', 1.5],
  ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['C5', 1.5],
  ['D5', 0.5], ['C5', 0.5], ['B4', 0.5], ['D5', 1.5],
  ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['F#4', 0.5], ['A4', 0.5], ['C5', 0.5],
  ['G4', 3],
];
const HARM_3_4 = ['Em', 'C', 'G', 'D', 'C', 'G/B', 'Am|D7', 'G'];

export function build() {
  const T = Theme({ id: 'lullaby', title: 'Hush Now, Little Lark', key: 'G major', bpm: 81, meter: 3, sig: '6/8', pulse: [0, 1.5], intro: 2, loop: 20, space: 'CHAPEL', gain: 2.1 });
  const vox = T.part('vox', { voice: 'vox', bus: 'melody' });
  T.part('harp', { voice: 'harp', bus: 'harmony' });
  const cel = T.part('celesta', { voice: 'celesta', bus: 'counter' });
  T.part('strings', { voice: 'strings', bus: 'harmony', o: { attack: 1.2 } });
  const harp = { pat: ['1', '5', '8', '10', '8', '5'], step: 0.5, base: 'C3', dyn: 'p', len: 2, cycle: 3 };

  // intro: the music box, alone, then the harp
  const hI = T.chords(0, ['G', 'C/G']);
  cel.seq(0, A_MELODY.slice(0, 4), { dyn: 'mp', oct: 1 });
  T.arp('harp', hI.slice(1), { ...harp, dyn: 'pp' });
  // lines 1-2 (bars 2-9): the melody everyone already knows without knowing
  const h1 = T.chords(2, A_HARM);
  vox.seq(2, A_MELODY, { dyn: 'mp', legato: 'bar' });
  T.arp('harp', h1, harp); T.pad('strings', h1, { n: 3, lo: 'D3', hi: 'D4', dyn: 'ppp' });
  // lines 3-4 (bars 10-17): the part she was still singing when they took her
  const h2 = T.chords(10, HARM_3_4);
  vox.seq(10, LINES_3_4, { cresc: ['mp', 'mf'], legato: 'bar' });
  T.arp('harp', h2, harp); T.pad('strings', h2, { n: 3, lo: 'D3', hi: 'D4', dyn: 'pp' });
  // outro (bars 18-21): the music box remembers, the harp rocks the cradle, and it begins again
  const h3 = T.chords(18, ['C', 'G', 'C', 'D7']);
  cel.seq(18, [['D5', 0.5], ['G5', 0.5], ['A5', 0.5], ['B5', 1.5], ['A5', 0.5], ['B5', 0.5], ['A5', 0.5], ['G5', 1.5]], { dyn: 'p', oct: 1 });
  T.arp('harp', h3, { ...harp, dyn: 'pp' }); T.pad('strings', h3, { n: 3, lo: 'D3', hi: 'D4', dyn: 'ppp' });
  return T.build();
}
