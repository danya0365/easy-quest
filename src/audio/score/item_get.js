// TREASURE FANFARE — "You Found It!" · D major · three notes (SYSTEMS-BIBLE §10.4) · ≈1.6 s + ring
// Leading tone to tonic, bright and certain: A — C# — D, horns under a celesta octave, a harp roll and a chiptune wink.
import { Theme } from './_lib.js';

export function build() {
  const T = Theme({ id: 'item_get', title: 'You Found It!', key: 'D major', bpm: 150, meter: 4, pulse: [0, 2], bars: 1, space: 'HALL', gain: 1.555, kind: 'oneshot' });
  const horns = T.part('horns', { voice: 'horns', bus: 'melody' });
  const cel = T.part('celesta', { voice: 'celesta', bus: 'counter' });
  const harp = T.part('harp', { voice: 'harp', bus: 'counter' });
  const tw = T.part('twinkle', { voice: 'twinkle', bus: 'counter' });
  const pad = T.part('pad', { voice: 'strings', bus: 'harmony', o: { attack: 0.08 } });
  T.chords(0, ['A|D']);
  const call = [['A4', 0.5], ['C#5', 0.5], ['D5', 2.5]];
  horns.seq(0, call, { dyn: 'f', art: 'tenuto' });
  cel.seq(0, call, { dyn: 'f', oct: 1 });
  pad.chord(1, ['D3', 'A3', 'F#4'], 2.5, { dyn: 'mf' });
  harp.chord(1, ['D3', 'F#3', 'A3', 'D4', 'F#4', 'A4'], 3, { dyn: 'mf', o: { strum: 0.03 } });
  tw.note(1.5, 'D6', 0.35, { dyn: 'mp', o: { arp: [0, 4, 7] } });
  return T.build();
}
