// BATTLE-START STINGER (MUSIC-BIBLE §5.1) · 0.55 s · fires on the same frame as the swirl
// Crash + timpani 32nd roll; a three-chord whole-tone shove upward in the horns (0.16 s each, staccato);
// a chiptune wink at 0.48 s. The battle theme then begins exactly on its first downbeat at 0.55 s.
// bpm 60 so one beat is one second and the recipe's times can be typed as-is.
import { Theme } from './_lib.js';

export function build() {
  const T = Theme({ id: 'battle_start', title: 'Draw!', key: 'D minor', bpm: 60, meter: 4, pulse: [0], bars: 1, space: 'HALL', gain: 1.0, kind: 'oneshot' });
  const horns = T.part('horns', { voice: 'horns', bus: 'melody', o: { tight: true, rel: 0.06 } });
  const cym = T.part('cym', { voice: 'cymbal', bus: 'perc' });
  const timp = T.part('timp', { voice: 'timp', bus: 'perc' });
  const tw = T.part('twinkle', { voice: 'twinkle', bus: 'counter' });
  cym.note(0, 'C5', 2, { dyn: 'ff' });
  timp.roll(0, 0.55, 'D2', { from: 'mf', to: 'ff', perBeat: 1 / 0.048, bpm: 60 });
  [['Bb4', 'D5', 'F5'], ['B4', 'D#5', 'F#5'], ['C5', 'E5', 'G5']].forEach((ch, k) => horns.chord(k * 0.16, ch, 0.16, { dyn: 'ff', art: 1 }));
  tw.note(0.48, 'D5', 0.12, { dyn: 'mp', o: { arp: [0, 3, 7] } });
  return T.build();
}
