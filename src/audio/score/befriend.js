// BEFRIENDING FANFARE — "A New Friend" · D major · 1.7 s (MONSTER-BIBLE §7 beat 5; P27 owns it)
// A soft chime and a harp glissando up; then flute + pizzicato: A4 D5 F#5 A5 — beat — G5 F#5 D5 (held), over a held
// D-add9 in the low strings, and one triangle ping on the last note. Hummable after two hearings.
import { Theme } from './_lib.js';

export function build() {
  const T = Theme({ id: 'befriend', title: 'A New Friend', key: 'D major', bpm: 176, meter: 4, pulse: [0, 2], bars: 2, space: 'HALL', gain: 2.286, kind: 'oneshot' });
  const flute = T.part('flute', { voice: 'flute', bus: 'melody' });
  const pizz = T.part('pizz', { voice: 'pizz', bus: 'counter' });
  const harp = T.part('harp', { voice: 'harp', bus: 'counter' });
  const cel = T.part('celesta', { voice: 'celesta', bus: 'counter' });
  const low = T.part('low', { voice: 'strings', bus: 'harmony', o: { attack: 0.15 } });
  const tri = T.part('tri', { voice: 'tri', bus: 'perc' });
  T.chords(0, ['Dadd9', 'Dadd9']);
  cel.note(0, 'A5', 1.5, { dyn: 'mp' });
  harp.gliss(0, 'D', 'D4', 'D6', { dyn: 'mp', spacing: 0.03 });
  const tune = [['A4', 0.5], ['D5', 0.5], ['F#5', 0.5], ['A5', 0.5], ['R', 0.5], ['G5', 0.5], ['F#5', 0.5], ['D5', 1.5]];
  flute.seq(0, tune, { beat: 1, dyn: 'mf', oct: 1, art: 0.8 });
  pizz.seq(0, tune, { beat: 1, dyn: 'mf' });
  low.chord(1, ['D3', 'A3', 'E4', 'F#4'], 5.5, { dyn: 'mp' });
  tri.note(4.5, 'F#6', 2, { dyn: 'mf' });
  return T.build();
}
