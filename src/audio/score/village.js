// T2 · HOME VILLAGE (Puddlewick) — "Under the Low Roofs" · G major · 6/8 (dotted quarter = 66) · intro(1) A B A′ C → loop A
// The C section is Queen Elowen's lullaby, played by the oboe; a music box answers it. Nothing bad happens here: no
// percussion, ever.
//
// Written as LINES that talk to each other, not a tune over a machine bed:
//   · the tune (flute, then oboe, then violins, then oboe) — the Puddlewick melody keeps its first eight notes (canon)
//   · a counter-melody that sings in the tune's held notes and rests (bassoon in A, celli in A′, clarinet in C):
//     it holds while the tune moves and moves while the tune holds, and resolves its own sevenths and suspensions
//   · a bass that walks DOWN the scale by step (G F# E D C · B A) under inversions, then climbs back through a
//     4-3-2-5-1 cadence (C B A D G) — no root-fifth pattern anywhere
//   · B has its own tune in a siciliano lilt (♩♪) that climbs to a high E and sighs down, with a solo horn in contrary
//     motion underneath; every harp figure is voiced by hand for its chord.
import { Theme, N } from './_lib.js';

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
// bible harmony (other cues — lullaby, finale — reharmonise the tune with this): G | D7 | Em | C|D | G | C | Am|D7 | G
export const A_HARM = ['G', 'D7|G', 'Em', 'Cmaj7|D', 'G', 'C|G/B', 'Am|D7', 'G'];
// here: the descending bass G F# E D C (C) B A, then B D C B A D G
const A_CHORDS = ['G|Bm/F#', 'Am/E|G/D', 'Cmaj7|D7/C', 'G/B|D7/A', 'G/B|G/D', 'C|G/B', 'Am7|D7', 'G'];
const A_BASS = N('G2:1.5 F#2:1.5 E2:1.5 D2:1.5 C2:1.5 C2:1.5 B1:1.5 A1:1.5 B1:1.5 D2:1.5 C2:1.5 B1:1.5 A1:1.5 D2:1.5 G2:1.5 D2:1 F#2:.5');
// the counter-melody: silent while the tune states its first three notes, then answers under every held note
const A_COUNTER = N(`R:1.5 D4:1 B3:.5   C4:2 B3:1   G3:1.5 F#3:1.5   G3:1.5 F#3:.5 A3:.5 C4:.5
  B3:2 A3:.5 G3:.5   G3:2 A3:.5 B3:.5   C4:3   B3:1.5 A3:.5 G3:.5 F#3:.5`);

// B: its own tune (oboe), a siciliano lilt that climbs to E6 and sighs home
const B_MELODY = N(`B4:1 E5:.5 G5:1 F#5:.5   F#5:1.5 D5:1.5   E5:1 G5:.5 C6:1 B5:.5   A5:2 R:.5 D5:.5
  G5:1 F#5:.5 G5:.5 A5:.5 B5:.5   E6:2 D6:1   C6:1 B5:.5 A5:1 F#5:.5   G5:3`);
const B_CHORDS = ['Em|Em/G', 'Bm/F#|Bm/D', 'C|C/E', 'D|D/F#', 'Em/G|Em', 'C|Cmaj7/B', 'Am|D7', 'G'];
const B_BASS = N('E2:1.5 G2:1.5 F#2:1.5 D2:1.5 C2:1.5 E2:1.5 D2:1.5 F#2:1.5 G2:1.5 E2:1.5 C2:1.5 B1:1.5 A1:1.5 D2:1.5 G2:1.5 D2:1.5');
// the solo horn: contrary motion to the oboe, one note per dotted quarter
const B_HORN = N('E4:2 B3:1  D4:1 F#4:2  G4:2 E4:1  F#4:3  B4:1.5 E4:1.5  G4:2 E4:1  A4:1 C5:2  B4:3');

export function build() {
  const T = Theme({ id: 'village', title: 'Under the Low Roofs', key: 'G major', bpm: 99, meter: 3, sig: '6/8', pulse: [0, 1.5], intro: 1, loop: 32, space: 'HALL', gain: 2.26 });
  const flute = T.part('flute', { voice: 'flute', bus: 'melody', oct: 1 });
  const oboe = T.part('oboe', { voice: 'oboe', bus: 'melody' });
  const vlnTune = T.part('violins', { voice: 'strings', bus: 'melody', gain: 0.85, o: { attack: 0.05 } });
  const bsn = T.part('bassoon', { voice: 'bassoon', bus: 'counter', gain: 1.1 });
  const vc = T.part('celli', { voice: 'strings', bus: 'counter', pan: 0.25, gain: 0.95 });
  const clar = T.part('clarinet', { voice: 'clarinet', bus: 'counter' });
  const horn = T.part('horn', { voice: 'hornSolo', bus: 'counter', send: 0.5, gain: 0.9 });
  const flDesc = T.part('fluteDescant', { voice: 'flute', bus: 'counter', gain: 0.8 });
  const cel = T.part('celesta', { voice: 'celesta', bus: 'counter', gain: 0.75 });
  const harp = T.part('harp', { voice: 'harp', bus: 'harmony', send: 0.5 });
  const pizz = T.part('pizz', { voice: 'pizz', bus: 'bass' });
  const vcBass = T.part('celliBass', { voice: 'strings', bus: 'bass', gain: 0.8, o: { attack: 0.3 } });
  const vla = T.part('violas', { voice: 'strings', bus: 'harmony', gain: 0.8, o: { attack: 0.4 } });
  const vn2 = T.part('violins2', { voice: 'strings', bus: 'harmony', gain: 0.75, o: { attack: 0.4 } });
  const horns = T.part('horns', { voice: 'horns', bus: 'harmony', gain: 0.6, o: { attack: 0.25 } });
  const bar = (b, beat = 0) => T.bar(b, beat);

  // ---- intro (bar 0): the harp alone climbs a G chord over one pizzicato G
  T.chords(0, ['G']);
  harp.figs([[bar(0), ['G3', 'B3', 'D4', 'G4', 'B4', 'D5'], 'up']], { dyn: 'p', step: 0.5, len: 2 });
  pizz.note(bar(0), 'G2', 1.5, { dyn: 'mp' });

  // ---- A (bars 1-8): flute tune, bassoon answers, the bass walks down
  let s = 1;
  T.chords(s, A_CHORDS);
  flute.seq(s, A_MELODY, { dyn: 'mp' });
  bsn.seq(s, A_COUNTER, { dyn: 'mp', shape: true });
  pizz.seq(s, A_BASS, { dyn: 'mp', shape: false });
  harp.figs([
    [bar(s, 0), ['G4', 'B4', 'D5'], 'up'], [bar(s, 1.5), ['F#4', 'B4', 'D5'], 'up'],
    [bar(s + 1, 0), ['E4', 'A4', 'C5'], 'up'], [bar(s + 1, 1.5), ['D4', 'G4', 'B4'], 'up'],
    [bar(s + 2, 0), ['E4', 'G4', 'B4'], 'up'], [bar(s + 2, 1.5), ['F#4', 'A4', 'C5'], 'up'],
    [bar(s + 3, 0), ['D4', 'G4', 'B4'], 'up'], [bar(s + 3, 1.5), ['F#4', 'A4', 'C5', 'D5'], 'roll'],
  ], { dyn: 'p', step: 0.5, len: 1.4 });
  harp.figs([
    [bar(s + 4, 0), ['B3', 'D4', 'G4']], [bar(s + 4, 1.5), ['D4', 'G4', 'B4']],
    [bar(s + 5, 0), ['C4', 'E4', 'G4']], [bar(s + 5, 1.5), ['B3', 'D4', 'G4']],
    [bar(s + 6, 0), ['C4', 'E4', 'A4']], [bar(s + 6, 1.5), ['C4', 'F#4', 'A4']],
    [bar(s + 7, 0), ['B3', 'D4', 'G4'], 'up'], [bar(s + 7, 1.5), ['B4', 'D5', 'G5'], 'up'],
  ], { dyn: 'p', d: 1.6, step: 0.5, len: 1.4 });
  // the strings steal in at the second phrase: two quiet inner lines, each resolving by step
  vn2.seq(s + 4, N('G4:3 G4:3 G4:1.5 A4:1.5 B4:3'), { cresc: ['pp', 'p'], shape: false });
  vla.seq(s + 5, N('C4:1.5 D4:1.5 E4:1.5 F#4:1.5 D4:3'), { cresc: ['pp', 'p'], shape: false });

  // ---- B (bars 9-16): the oboe's own tune, the horn answers in contrary motion, the harp flows
  s = 9;
  T.chords(s, B_CHORDS);
  oboe.seq(s, B_MELODY, { dyn: 'mp', cresc: ['mp', 'mf'] });
  horn.seq(s, B_HORN, { dyn: 'p', shape: false });
  pizz.seq(s, B_BASS, { dyn: 'mp', shape: false });
  harp.figs([
    [bar(s, 0), ['E4', 'G4', 'B4', 'E5', 'B4', 'G4'], 'up'],
    [bar(s + 1, 0), ['D4', 'F#4', 'B4', 'D5', 'B4', 'F#4'], 'up'],
    [bar(s + 2, 0), ['E4', 'G4', 'C5', 'E5', 'C5', 'G4'], 'up'],
    [bar(s + 3, 0), ['D4', 'F#4', 'A4', 'D5', 'A4', 'F#4'], 'up'],
    [bar(s + 4, 0), ['G4', 'B4', 'E5', 'G5', 'E5', 'B4'], 'up'],
    [bar(s + 5, 0), ['E4', 'G4', 'C5', 'E5', 'B4', 'G4'], 'up'],
    [bar(s + 6, 0), ['C4', 'E4', 'A4', 'C4', 'F#4', 'A4'], 'up'],
    [bar(s + 7, 0), ['D4', 'G4', 'B4', 'D5', 'G5', 'D5'], 'up'],
  ], { dyn: 'p', step: 0.5, len: 1.2 });
  // a soft string floor under the climb to the high E (bars 13-16)
  vla.seq(s + 4, N('E4:3 E4:1.5 B3:1.5 C4:1.5 A3:1.5 B3:3'), { cresc: ['pp', 'p'], shape: false });
  vcBass.seq(s + 4, N('B3:1.5 B3:1.5 G3:3 E3:1.5 F#3:1.5 D3:3'), { cresc: ['pp', 'p'], shape: false });

  // ---- A′ (bars 17-24): the violins take the tune, the celli sing the counter-melody, horns glow underneath,
  //      the flute slips an answer into the tune's rest and its last held note
  s = 17;
  T.chords(s, A_CHORDS);
  vlnTune.seq(s, A_MELODY, { dyn: 'mf', oct: 1 });
  vc.seq(s, A_COUNTER, { dyn: 'mp' });
  pizz.seq(s, A_BASS, { dyn: 'mf', shape: false });
  horns.seq(s, N('B4:3 C5:1.5 B4:1.5 G4:1.5 F#4:1.5 G4:1.5 A4:1.5 B4:3 G4:3 G4:1.5 F#4:1.5 B4:3'), { dyn: 'p', shape: false });
  horns.seq(s, N('G4:1.5 F#4:1.5 E4:1.5 D4:1.5 E4:1.5 D4:1.5 D4:1.5 C4:1.5 G4:3 E4:1.5 D4:1.5 C4:3 D4:3'), { dyn: 'p', shape: false });
  flDesc.seq(s + 3, N('R:1.5 A5:.5 D6:.5 C6:.5 D6:1.5'), { dyn: 'mp' });
  flDesc.seq(s + 7, N('R:1.5 D6:.5 B5:.5 G5:.5'), { dyn: 'mp' });
  harp.figs([
    [bar(s, 0), ['G3', 'D4', 'G4', 'B4']], [bar(s + 1, 0), ['E3', 'A3', 'C4', 'E4']], [bar(s + 1, 1.5), ['D3', 'G3', 'B3', 'D4']],
    [bar(s + 2, 0), ['C3', 'G3', 'B3', 'E4']], [bar(s + 2, 1.5), ['C3', 'F#3', 'A3', 'D4']],
    [bar(s + 3, 0), ['B2', 'G3', 'B3', 'D4']], [bar(s + 4, 0), ['B2', 'D3', 'G3', 'D4']], [bar(s + 5, 0), ['C3', 'G3', 'C4', 'E4']],
    [bar(s + 6, 0), ['A2', 'E3', 'G3', 'C4']], [bar(s + 6, 1.5), ['D3', 'F#3', 'C4', 'D4']], [bar(s + 7, 0), ['G2', 'D3', 'G3', 'B3']],
  ], { dyn: 'p', d: 2.5, spread: 0.06 });

  // ---- C (bars 25-32): the lullaby — the oboe sings it, the clarinet breathes the counter-melody low, the celli hold
  //      the walking bass, and a music box answers each held note from far above
  s = 25;
  T.chords(s, A_CHORDS);
  oboe.seq(s, A_MELODY, { dyn: 'p', oct: 1 });
  clar.seq(s, A_COUNTER, { dyn: 'p' });
  vcBass.seq(s, A_BASS.map(([n, d]) => [n === 'R' ? n : n.replace(/(\d)$/, (m) => String(+m + 1)), d]), { dyn: 'pp', shape: false });
  vla.seq(s, N('B3:3 C4:1.5 B3:1.5 B3:1.5 A3:1.5 B3:1.5 C4:1.5 D4:3 G4:1.5 D4:1.5 E4:1.5 F#4:1.5 D4:3'), { dyn: 'pp', shape: false });
  pizz.hits([s, s + 2, s + 4, s + 6], [0], 'G2', 1.5, { dyn: 'pp' });
  cel.seq(s, N('R:1.5 D6:.5 F#6:.5 B6:.5   R:1.5 D6:.5 G6:.5 B6:.5   R:3   R:1.5 C7:.5 A6:.5 F#6:.5'), { dyn: 'p', shape: false });
  cel.seq(s + 4, N('R:1.5 G6:.5 B6:.5 D7:.5   R:1.5 D7:.5 B6:.5 G6:.5   R:3   R:1.5 G6:.5 B6:.5 D7:.5'), { dyn: 'pp', shape: false });
  harp.figs([[bar(s + 7, 0), ['G2', 'D3', 'G3', 'B3', 'D4']]], { dyn: 'pp', d: 3, spread: 0.08 });
  return T.build();
}
