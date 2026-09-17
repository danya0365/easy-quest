# Credits

## Music — recorded instruments

The score (composed for this game; see `docs/MUSIC-BIBLE.md`) is performed by real recorded, multisampled
instruments. The samples are vendored under `vendor/samples/` (≈25 MB), cut and looped by `tools/samples/`
(`fetch.mjs` → `build.mjs` → `flatten.mjs`, sources pinned in `tools/samples/spec.mjs`), and listed zone by zone in
`vendor/samples/manifest.json`. Every library's own licence file is copied next to its samples.

Processing, in order: trim to the attack · measure the real root (harmonic sieve + guided YIN) · find a loop by
normalised cross-correlation and bake a crossfade into the file · **flatten the slow swell inside every loop with a
periodic gain curve** (a bow swell or a breath dip caught inside a 1-2 s loop turns into a mechanical wobble on
repeat; `flatten.mjs` takes 82 loops that swelled more than 3 dB down to 2) · normalise each zone to a common
loudness · encode (FLAC for loops so the loop points stay sample-accurate, MP3 for one-shots).
`tools/samples/loopcheck.mjs` audits the result, and the players load only the zones a cue actually plays.

| Library | Author | Licence | Used for |
|---|---|---|---|
| **VSCO 2: Community Edition** — <https://github.com/sgossner/VSCO-2-CE> (commit `4403009`) | Versilian Studios: Sam Gossner, Simon Dalzell; sample cutting by Elan Hickler / Soundemote | **CC0 1.0** — `vendor/samples/vsco2ce/LICENSE` | string sections (violins, violas, celli: sustain, spiccato, tremolo, pizzicato), solo contrabass (low strings), solo violin, trumpet, tenor trombone, tuba, flute, oboe, clarinet, bassoon, timpani rolls, snare drum, clash cymbals, suspended cymbal, triangle |
| **Versilian Community Sample Library (VCSL)** — <https://github.com/sgossner/VCSL> (commit `c1ea7bc`) | Versilian Studios: Sam Gossner and contributors | **CC0 1.0** — `vendor/samples/vcsl/LICENSE` | church pipe organ, concert harp, harpsichord, vibraphone (soft mallets) and glockenspiel (together the celesta / music-box voice), tubular bells, timpani |
| **University of Iowa Musical Instrument Samples (MIS)** — <https://theremin.music.uiowa.edu/MIS.html> | Lawrence Fritts, University of Iowa Electronic Music Studios | "freely available … may be downloaded and used for any projects, without restrictions" — terms copied to `vendor/samples/iowa/LICENSE.txt` | French horn (VSCO 2 CE's horn has no samples between C4 and D5, the register the horn section sings in); tenor trombone G3 and B♭3 (VSCO's trombone jumps from F3 to C4) |

CC0 asks for nothing, but these libraries are a gift: thank you, Versilian Studios and the University of Iowa.
Versilian also asks that the raw samples not be resold on their own — they are not; they ship only inside this game.

What is *not* sampled: a wordless choir halo (`pad`) and the chiptune "twinkle" wink are synthesised, because no
freely licensed choir multisample exists and the twinkle is meant to be a chip.

## Everything else

Art, geometry, textures, sound effects and fonts are procedural and written for this project.
