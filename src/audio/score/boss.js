// T11 · BOSS BATTLE — "The One Who Waits" · C minor · 4/4 · ♩=168 · Intro(4) → A(8) → B(8) → A(8) → loop to A
// An eighth-note ostinato under everything; horns with the organ; the choir doubling below makes it bigger without a new note.
import { Theme } from './_lib.js';

const A_MELODY = [
  ['C5', 1], ['Eb5', 1], ['D5', 1], ['C5', 1],
  ['B4', 2], ['G4', 2],
  ['Ab4', 1], ['C5', 1], ['B4', 1], ['Ab4', 1],
  ['G4', 4],
  ['C5', 1], ['Eb5', 1], ['F5', 1], ['G5', 1],
  ['Ab5', 2], ['G5', 2],
  ['F5', 1], ['Eb5', 1], ['D5', 1], ['C5', 1],
  ['B4', 2], ['R', 2],
];
// bible: Cm | G7 | Fm | G7 | Cm | Ab | Fm|G7 | G7 — bar 3 turns to G7 on its B, bar 6 walks the bass down under the G
const A_HARM = ['Cm', 'G7', 'Fm|G7', 'G7', 'Cm', 'Ab|Eb/G', 'Fm|G7', 'G7'];
// B: a soaring string counter-melody (the bible leaves the notes to us), horns on pedal tones
const B_MELODY = [
  ['Eb5', 1], ['Ab5', 1], ['C6', 2],
  ['Bb5', 2], ['F5', 2],
  ['G5', 1], ['Bb5', 1], ['D6', 2],
  ['C6', 3], ['R', 1],
  ['Ab5', 1], ['C6', 1], ['F6', 2],
  ['D6', 2], ['Bb5', 2],
  ['Eb6', 2], ['Bb5', 1], ['G5', 1],
  ['B5', 4],
];
const B_HARM = ['Ab', 'Bb', 'Gm', 'Cm', 'Fm', 'Bb', 'Eb', 'G7'];

export function build() {
  const T = Theme({ id: 'boss', title: 'The One Who Waits', key: 'C minor', bpm: 168, meter: 4, pulse: [0, 2], intro: 4, loop: 24, space: 'HALL', gain: 0.792 });
  // horns carry the tune with the organ; trumpets bite on top in the A restatement; trombones double it an octave below
  // (the part the synth choir used to breathe) so the boss is bigger than the battle without a new note
  const horns = T.part('horns', { voice: 'horns', bus: 'melody', o: { tight: true } });
  const trumpets = T.part('trumpets', { voice: 'trumpet', bus: 'melody', gain: 0.7, o: { tight: true } });
  const organ = T.part('organ', { voice: 'organ', bus: 'counter', gain: 0.8, o: { rel: 0.2 } });
  const choir = T.part('choir', { voice: 'trombone', bus: 'counter', gain: 0.85, o: { tight: true } });
  const tuba = T.part('tuba', { voice: 'tuba', bus: 'bass', gain: 0.6 });
  const strLead = T.part('strLead', { voice: 'strings', bus: 'melody', gain: 1.1 });
  T.part('ost', { voice: 'strings', bus: 'bass', pan: -0.25, gain: 0.8, o: { attack: 0.02, rel: 0.08 } });
  T.part('pizz', { voice: 'pizz', bus: 'bass' });
  T.part('trem', { voice: 'strings', bus: 'harmony', o: { trem: 60 / 168 / 4 } });
  T.part('hornPed', { voice: 'horns', bus: 'harmony', gain: 0.8 });
  const pedal = T.part('pedal', { voice: 'organ', bus: 'bass', o: { pedal: true } });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const snare = T.part('snare', { voice: 'snare', bus: 'perc' });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });

  const ostinato = (h, o = {}) => {
    T.bass('ost', h, { pat: [[0, '1', 0.5], [0.5, '1', 0.5, 0.8], [1, '5', 0.5], [1.5, '1', 0.5, 0.8], [2, '10', 0.5], [2.5, '1', 0.5, 0.8], [3, '5', 0.5], [3.5, '1', 0.5, 0.8]], base: 'F2', cycle: 4, art: 0.7, ...o });
    T.bass('pizz', h, { pat: [[0, '1', 1], [2, '1', 1]], base: 'A1', cycle: 4, ...o });
    for (const c of h) for (let x = c.b; x < c.b + c.d - 1e-6; x += 2) timp.note(x, c.pcs.has(0) ? 'C2' : c.pcs.has(7) ? 'G2' : 'F2', 0.5, { dyn: o.dyn === 'pp' ? 'p' : 'mf' });
  };
  const military = (bar, dyn = 'mp') => { for (const [x, acc] of [[0, 1], [0.25, 0], [0.5, 0], [0.75, 0], [1, 1], [1.5, 0], [2, 1], [2.25, 0], [2.5, 0], [2.75, 0], [3, 1], [3.5, 0]]) snare.note(T.bar(bar, x), 'D4', 0.25, { dyn, gain: acc ? 1 : 0.65 }); };

  // Intro (0-3): the organ pedal wakes, the ostinato fades in underneath
  const hI = T.chords(0, ['Cm', 'Cm', 'Cm', 'G7']);
  pedal.note(0, 'C2', 16.2, { dyn: 'pp', o: { pedal: true, swell: 3.2 } });
  T.bass('ost', hI, { pat: [[0, '1', 0.5], [0.5, '1', 0.5, 0.8], [1, '5', 0.5], [1.5, '1', 0.5, 0.8], [2, '10', 0.5], [2.5, '1', 0.5, 0.8], [3, '5', 0.5], [3.5, '1', 0.5, 0.8]], base: 'F2', cycle: 4, cresc: ['pp', 'f'] });
  T.pad('trem', hI, { n: 3, lo: 'G3', hi: 'G4', cresc: ['pp', 'mf'] });
  timp.roll(T.bar(3), T.bar(4), 'G2', { from: 'p', to: 'f' });

  const sectionA = (bar) => {
    const h = T.chords(bar, A_HARM);
    horns.seq(bar, A_MELODY, { dyn: 'ff' });
    if (bar > 4) trumpets.seq(bar, A_MELODY, { dyn: 'f' });
    organ.seq(bar, A_MELODY, { dyn: 'f' });
    choir.seq(bar, A_MELODY, { dyn: 'f', oct: -1 });
    T.bass('tuba', h, { pat: [[0, '1', 1.8], [2, '1', 1.8]], base: 'C2', dyn: 'mf', cycle: 4 });
    T.pad('trem', h, { n: 3, lo: 'G3', hi: 'G4', dyn: 'mf' });
    ostinato(h, { dyn: 'f' });
    cym.note(T.bar(bar), 'C5', 2, { dyn: 'f' });
    pedal.seq(bar, [['C2', 8], ['F2', 2], ['G2', 6], ['C2', 4], ['Ab1', 2], ['G1', 2], ['F1', 2], ['G1', 6]], { dyn: 'mf', art: 'legato' });
  };
  sectionA(4);
  // B (12-19): strings soar; horns hold pedal tones; military snare; mp for two bars then build to a fff roll
  const hB = T.chords(12, B_HARM);
  strLead.seq(12, B_MELODY, { cresc: ['mf', 'ff'] });
  strLead.seq(12, B_MELODY, { cresc: ['mp', 'f'], oct: -1, gain: 0.6 });
  T.pad('hornPed', hB, { n: 2, lo: 'C3', hi: 'C4', cresc: ['mp', 'f'] });
  ostinato(hB.slice(0, 2), { dyn: 'mp' }); ostinato(hB.slice(2), { cresc: ['mf', 'f'] });
  for (let k = 0; k < 6; k++) military(12 + k, k < 2 ? 'p' : 'mp');
  snare.roll(T.bar(18), T.bar(20), 'D4', { from: 'mp', to: 'fff', perBeat: 8, alt: 0.8 });
  sectionA(20);
  return T.build();
}
