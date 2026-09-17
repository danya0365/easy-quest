// T13 · LEVEL-UP JINGLE — "A Bit Taller" · D major · 4/4 · ♩=144 · one-shot, 3 bars ≈ 3.4 s
// Celesta sings, the harp ripples sixteenths, the solo horn joins the last D, one choked cymbal. Plays over silence.
import { Theme } from './_lib.js';

const MELODY = [['D5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['G5', 0.5], ['A5', 1], ['B5', 1],
  ['D6', 1.5], ['B5', 0.5], ['A5', 1], ['F#5', 1],
  ['D6', 4]];

export function build() {
  const T = Theme({ id: 'levelup', title: 'A Bit Taller', key: 'D major', bpm: 144, meter: 4, pulse: [0, 2], bars: 3, space: 'HALL', gain: 1.5, kind: 'oneshot' });
  const cel = T.part('celesta', { voice: 'celesta', bus: 'melody' });
  T.part('harp', { voice: 'harp', bus: 'harmony' });
  const horn = T.part('horn', { voice: 'hornSolo', bus: 'counter' });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });
  const pizz = T.part('pizz', { voice: 'pizz', bus: 'bass' });
  const h = T.chords(0, ['D', 'G|A7', 'D']);
  cel.seq(0, MELODY, { dyn: 'f' });
  cel.seq(2, [['A5', 4]], { dyn: 'mp' });
  T.arp('harp', h.slice(0, 3), { pat: ['1', '3', '5', '8', '10', '12', '10', '8'], step: 0.25, base: 'D4', dyn: 'mp', len: 1, cycle: 2 });
  T.parts.harp.chord(T.bar(2), ['D3', 'A3', 'D4', 'F#4'], 4, { dyn: 'mf', o: { strum: 0.05 } });
  horn.seq(2, [['D5', 4]], { dyn: 'mf' });
  horn.seq(2, [['A4', 4]], { dyn: 'mp', gain: 0.6 });
  pizz.note(0, 'D3', 1, { dyn: 'mf' }); pizz.note(T.bar(1), 'G2', 1, { dyn: 'mf' }); pizz.note(T.bar(1, 2), 'A2', 1, { dyn: 'mf' }); pizz.note(T.bar(2), 'D2', 1, { dyn: 'f' });
  cym.note(0, 'C5', 1, { dyn: 'mf', o: { choke: true } });
  return T.build();
}
