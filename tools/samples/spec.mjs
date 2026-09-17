/**
 * tools/samples/spec.mjs — WHICH recorded samples the score uses, and how each instrument is cut.   (P27)
 *
 * Every source is a real recording from a library whose licence file we copy verbatim into vendor/samples/<lib>/:
 *   vsco2ce — VSCO 2: Community Edition (Versilian Studios)          CC0 1.0   (LICENSE verified: CC0 legal code)
 *   vcsl    — Versilian Community Sample Library (Versilian Studios)  CC0 1.0   (LICENSE verified: CC0 legal code)
 *   iowa    — University of Iowa Musical Instrument Samples (L. Fritts) "may be downloaded and used for any
 *             projects, without restrictions" (terms page copied to vendor/samples/iowa/LICENSE.txt). Used only
 *             for the French horn (VSCO's horn has no samples between C4 and D5, the register the section sings in) and
 *             two trombone notes VSCO skips (G3, B-flat3).
 * Libraries are pinned to a commit so a rebuild fetches byte-identical sources.
 *
 * Names in the libraries use different octave conventions; `oct` shifts the written octave to scientific pitch
 * (C4 = middle C = MIDI 60). build.mjs never trusts a name: it measures every root (harmonic-sieve octave check +
 * guided YIN for the cents) and logs any sample that disagrees with its name.
 *
 * Instrument fields:
 *   kind   'loop'   sustain: attack head + a crossfade loop baked into the file (FLAC, sample-accurate)
 *          'shot'   one-shot, trimmed with a faded tail (MP3)
 *   short  a one-word name for UIs      layers number of velocity layers (0 = softest)      step  keep a root only if >= step semitones from the last kept
 *   loop   {from,to} loop-start search window (s), {min,max} loop length (s), xf crossfade (s)
 *   len    one-shot max length (s)      fade   tail fade (s)     sr  output sample rate    pitch 'yin' (named octave, measured cents)|'peak'|'timp'|'named'|'none'
 *   src    [{lib, dir, re (named groups n=note, v=velocity, r=round-robin), oct, lo, hi, layer(v), rr(r)}]
 */
export const LIBS = {
  vsco2ce: {
    name: 'VSCO 2: Community Edition', by: 'Versilian Studios — Sam Gossner, Simon Dalzell (sample cutting: Elan Hickler/Soundemote)',
    home: 'https://github.com/sgossner/VSCO-2-CE', license: 'CC0-1.0', sha: '440300901dfe9275fd84e0b7763af1f8443ae62e',
    git: 'sgossner/VSCO-2-CE',
  },
  vcsl: {
    name: 'Versilian Community Sample Library (VCSL)', by: 'Versilian Studios — Sam Gossner and contributors',
    home: 'https://github.com/sgossner/VCSL', license: 'CC0-1.0', sha: 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e',
    git: 'sgossner/VCSL',
  },
  iowa: {
    name: 'University of Iowa Musical Instrument Samples (MIS)', by: 'Lawrence Fritts, University of Iowa Electronic Music Studios',
    home: 'https://theremin.music.uiowa.edu/MIS.html', license: 'Iowa MIS terms: free to use for any project, without restrictions',
    base: 'https://theremin.music.uiowa.edu/',
  },
};

const N = '(?<n>[A-G]#?-?\\d)';
const lay = (map) => (v) => (v in map ? map[v] : -1);
const one = () => 0;
const rr1 = (r) => (r == null || +r === 1 ? 0 : -1);
const rr2 = (r) => (r == null ? 0 : +r <= 2 ? +r - 1 : -1);

/** MIDI numbers for readability */
export const M = (name) => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(name); const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return pc + (+m[3] + 1) * 12; };

// Iowa files are listed explicitly (no git tree)
const IOWA_HORN = ['A2', 'C3', 'Eb3', 'Gb3', 'A3', 'C4', 'Eb4', 'Gb4', 'A4', 'C5', 'Eb5', 'F5'].map((n) => ({
  path: `sound files/MIS Pitches - 2014/Brass/Horn/Horn.ff.${n}.stereo.aif`, n,
}));

const IOWA_TBN = ['G3', 'Bb3'].flatMap((n) => ['p', 'f'].map((v) => ({ path: `sound files/MIS Pitches - 2014/Brass/Tenor Trombone/TenorTrombone.ff.${n}.stereo.aif`, n, v })));

const STR_LOOP = { from: 0.55, to: 1.4, min: 1.35, max: 2.1, xf: 0.16 };
const SOLO_LOOP = { from: 0.45, to: 1.1, min: 1.05, max: 1.7, xf: 0.13 };
const WIND_LOOP = { from: 0.4, to: 0.9, min: 0.75, max: 1.3, xf: 0.10 };

export const INSTRUMENTS = [
  // ------------------------------------------------------------------ strings
  {
    id: 'strings', short: 'Strings', label: 'String section — violins, violas, celli, bass (sustain, vibrato)', kind: 'loop', layers: 2, sr: 32000,
    loop: STR_LOOP, step: 2,
    src: [
      { lib: 'vsco2ce', dir: 'Strings/Solo Contrabass/SusVib', re: `^BKCtbss_SusVib_${N}_v(?<v>\\d)_rr1\\.wav$`, oct: 1, lo: M('G1'), hi: M('A#1'), layer: lay({ 1: 0, 3: 1 }) },
      { lib: 'vsco2ce', dir: 'Strings/Cello Section/susvib', re: `^susvib_${N}_v(?<v>\\d)_1\\.wav$`, oct: 1, lo: M('C2'), hi: M('C4'), layer: lay({ 1: 0, 3: 1 }) },
      { lib: 'vsco2ce', dir: 'Strings/Viola Section/susvib', re: `^ViolaEns_susvib_${N}_v(?<v>\\d)_1\\.wav$`, oct: 1, lo: M('D4'), hi: M('F4'), layer: lay({ 1: 0, 2: 1 }) },
      { lib: 'vsco2ce', dir: 'Strings/Violin Section/susVib', re: `^VlnEns_susVib_${N}_v(?<v>\\d)\\.wav$`, oct: 1, lo: M('A4'), hi: M('D6'), layer: lay({ 1: 0, 2: 1 }) },
    ],
  },
  {
    id: 'strings_trem', short: 'Strings trem.', label: 'String section — bowed tremolo', kind: 'loop', layers: 1, sr: 32000,
    loop: { from: 0.4, to: 1.0, min: 1.0, max: 1.6, xf: 0.12 }, step: 2,
    src: [
      // the cello tremolo has only a v1 recording of B2: either take is layer 0 (the loud one wins where both exist)
      { lib: 'vsco2ce', dir: 'Strings/Cello Section/trem', re: `^trem_${N}_v(?<v>\\d)_1\\.wav$`, oct: 1, lo: M('C2'), hi: M('C4'), layer: lay({ 2: 0, 1: 0 }) },
      { lib: 'vsco2ce', dir: 'Strings/Viola Section/trem', re: `^Violas_trem_${N}_v(?<v>\\d)_rr1\\.wav$`, oct: 1, lo: M('D4'), hi: M('F4'), layer: lay({ 2: 0 }) },
      { lib: 'vsco2ce', dir: 'Strings/Violin Section/Trem', re: `^VlnEns_Trem_${N}_v(?<v>\\d)\\.wav$`, oct: 1, lo: M('A4'), hi: M('D6'), layer: lay({ 2: 0 }) },
    ],
  },
  {
    id: 'strings_spic', short: 'Strings spicc.', label: 'String section — spiccato', kind: 'shot', layers: 2, sr: 44100, len: 0.75, fade: 0.25, step: 2,
    src: [
      { lib: 'vsco2ce', dir: 'Strings/Solo Contrabass/Spic', re: `^BKCtbss_Spic_${N}_v(?<v>\\d)_rr(?<r>\\d)\\.wav$`, oct: 1, lo: M('G1'), hi: M('B1'), layer: lay({ 1: 0, 3: 1 }), rr: rr1 },
      { lib: 'vsco2ce', dir: 'Strings/Cello Section/spic', re: `^spic_${N}_v(?<v>\\d)_RR(?<r>\\d)\\.wav$`, oct: 1, lo: M('C2'), hi: M('C4'), layer: lay({ 1: 0, 2: 1 }), rr: rr2 },
      { lib: 'vsco2ce', dir: 'Strings/Viola Section/spic', re: `^Violas_spic_${N}_v(?<v>\\d)_rr(?<r>\\d)\\.wav$`, oct: 1, lo: M('D4'), hi: M('F4'), layer: lay({ 1: 0, 2: 1 }), rr: rr2 },
      { lib: 'vsco2ce', dir: 'Strings/Violin Section/Spic', re: `^VlnEns_Spic_${N}_v(?<v>\\d)_rr(?<r>\\d)\\.wav$`, oct: 1, lo: M('A4'), hi: M('D6'), layer: lay({ 1: 0, 2: 1 }), rr: rr2 },
    ],
  },
  {
    id: 'pizz', short: 'Pizzicato', label: 'String section — pizzicato', kind: 'shot', layers: 2, sr: 44100, len: 1.3, fade: 0.45, step: 2,
    src: [
      { lib: 'vsco2ce', dir: 'Strings/Solo Contrabass/Pizz', re: `^BKCtbss_Pizz_${N}_v(?<v>\\d)_rr(?<r>\\d)\\.wav$`, oct: 1, lo: M('F#1'), hi: M('B1'), layer: lay({ 1: 0, 3: 1 }), rr: rr2 },
      { lib: 'vsco2ce', dir: 'Strings/Cello Section/pizzT', re: `^pizzT_${N}_v(?<v>\\d)_RR(?<r>\\d)\\.wav$`, oct: 1, lo: M('C2'), hi: M('C4'), layer: lay({ 1: 0, 2: 1 }), rr: rr2 },
      { lib: 'vsco2ce', dir: 'Strings/Viola Section/pizz', re: `^ViolaEns_pizz_${N}_v(?<v>\\d)_rr(?<r>\\d)\\.wav$`, oct: 1, lo: M('D4'), hi: M('F4'), layer: lay({ 1: 0, 2: 1 }), rr: rr2 },
      { lib: 'vsco2ce', dir: 'Strings/Violin Section/Pizz', re: `^VlnEns_Pizz_${N}_v(?<v>\\d)_rr(?<r>\\d)\\.wav$`, oct: 1, lo: M('A4'), hi: M('D6'), layer: lay({ 1: 0, 2: 1 }), rr: rr2 },
    ],
  },
  {
    id: 'violin', short: 'Solo violin', label: 'Solo violin (arco, vibrato)', kind: 'loop', layers: 2, sr: 32000, loop: SOLO_LOOP, step: 2,
    src: [{ lib: 'vsco2ce', dir: 'Strings/Solo Violin/Arco Vib', re: `^LLVln_ArcoVib_${N}_(?<v>[pf])\\.wav$`, oct: 0, lo: M('G3'), hi: M('C7'), layer: lay({ p: 0, f: 1 }) }],
  },
  // ------------------------------------------------------------------ brass
  {
    id: 'horn', short: 'Horns', label: 'French horn', kind: 'loop', layers: 1, sr: 32000,
    loop: { from: 0.35, to: 0.9, min: 0.6, max: 1.1, xf: 0.09 }, step: 2,
    src: [{ lib: 'iowa', files: IOWA_HORN, oct: 0, lo: M('A2'), hi: M('F5'), layer: one }],
  },
  {
    id: 'trumpet', short: 'Trumpets', label: 'Trumpet', kind: 'loop', layers: 2, sr: 32000, loop: WIND_LOOP, step: 2,
    src: [{ lib: 'vsco2ce', dir: 'Brass/Trumpet/sus', re: `^Sum_SHTrumpet_sus_${N}_v(?<v>\\d)_rr1\\.wav$`, oct: 1, lo: M('F3'), hi: M('C6'), layer: lay({ 1: 0, 3: 1 }) }],
  },
  {
    id: 'trombone', short: 'Trombones', label: 'Tenor trombone', kind: 'loop', layers: 2, sr: 32000, loop: WIND_LOOP, step: 2,
    src: [
      { lib: 'vsco2ce', dir: 'Brass/Tenor Trombone/sus', re: `^tenortbn_sus_${N}_v(?<v>\\d)_1\\.wav$`, oct: 1, lo: M('C#2'), hi: M('F4'), layer: lay({ 1: 0, 3: 1 }) },
      // VSCO's trombone jumps F3 -> C4, right where trombone chords sit: Iowa's G3 and B-flat3 fill it (one take, both layers)
      { lib: 'iowa', files: IOWA_TBN, oct: 0, lo: M('G3'), hi: M('A#3'), layer: lay({ p: 0, f: 1 }) },
    ],
  },
  {
    id: 'tuba', short: 'Tuba', label: 'Tuba', kind: 'loop', layers: 2, sr: 32000, loop: WIND_LOOP, step: 2,
    src: [{ lib: 'vsco2ce', dir: 'Brass/Tuba/sus', re: `^Tuba3_sus_${N}_v(?<v>\\d)_rr1_Mid\\.wav$`, oct: 1, lo: M('F1'), hi: M('A#3'), layer: lay({ 1: 0, 3: 1 }) }],
  },
  // ------------------------------------------------------------------ woodwinds
  {
    id: 'flute', short: 'Flute', label: 'Flute (vibrato)', kind: 'loop', layers: 1, sr: 32000, loop: SOLO_LOOP, step: 2,
    src: [{ lib: 'vsco2ce', dir: 'Woodwinds/Flute/susvib', re: `^LDFlute_susvib_${N}_v1_1\\.wav$`, oct: 1, lo: M('C4'), hi: M('C7'), layer: one }],
  },
  {
    id: 'oboe', short: 'Oboe', label: 'Oboe (vibrato)', kind: 'loop', layers: 2, sr: 32000, loop: SOLO_LOOP, step: 2,
    src: [{ lib: 'vsco2ce', dir: 'Woodwinds/Oboe/Vib', re: `^Oboe_Vib_${N}_v(?<v>\\d)_Main\\.wav$`, oct: 1, lo: M('A#3'), hi: M('F6'), layer: lay({ 1: 0, 3: 1 }) }],
  },
  {
    id: 'clarinet', short: 'Clarinet', label: 'Clarinet', kind: 'loop', layers: 2, sr: 32000, loop: WIND_LOOP, step: 2,
    src: [{ lib: 'vsco2ce', dir: 'Woodwinds/Clarinet/susLong', re: `^DCClar_susLong_${N}_v(?<v>\\d)_rr1_sum\\.wav$`, oct: 1, lo: M('D3'), hi: M('D6'), layer: lay({ 1: 0, 3: 1 }) }],
  },
  {
    id: 'bassoon', short: 'Bassoon', label: 'Bassoon', kind: 'loop', layers: 2, sr: 32000, loop: WIND_LOOP, step: 2,
    src: [
      { lib: 'vsco2ce', dir: 'Woodwinds/Bassoon/sus', re: `^PSBassoon_${N}_v(?<v>\\d)_1\\.wav$`, oct: 1, lo: M('A#1'), hi: M('C3'), layer: lay({ 1: 0, 2: 1 }) },
      { lib: 'vsco2ce', dir: 'Woodwinds/Bassoon/vib', re: `^PSBassoon_${N}_v(?<v>\\d)_1\\.wav$`, oct: 1, lo: M('C#3'), hi: M('C5'), layer: lay({ 1: 0, 2: 1 }) },
    ],
  },
  // ------------------------------------------------------------------ keys, harp
  {
    id: 'organ', short: 'Pipe organ', label: 'Church pipe organ (quiet flues / full open)', kind: 'loop', layers: 2, sr: 32000,
    loop: { from: 0.45, to: 1.0, min: 0.8, max: 1.4, xf: 0.1 }, step: 2,
    src: [
      { lib: 'vcsl', dir: 'Aerophones/Edge-blown Aerophones/Pipe Organ/Quiet Pedal', re: `^NT5_PedalQuiet_${N}_rr1\\.wav$`, oct: 0, lo: M('C1'), hi: M('A1'), layer: () => 0 },
      { lib: 'vcsl', dir: 'Aerophones/Edge-blown Aerophones/Pipe Organ/Loud Pedal', re: `^Rode_Pedal_${N}\\.wav$`, oct: 0, lo: M('C1'), hi: M('A1'), layer: () => 1 },
      { lib: 'vcsl', dir: 'Aerophones/Edge-blown Aerophones/Pipe Organ/Quiet', re: `^NT5_Man3Quiet_${N}_rr1\\.wav$`, oct: 0, lo: M('C2'), hi: M('C6'), layer: () => 0 },
      { lib: 'vcsl', dir: 'Aerophones/Edge-blown Aerophones/Pipe Organ/Loud', re: `^Rode_Man3Open_${N}\\.wav$`, oct: 0, lo: M('C2'), hi: M('C6'), layer: () => 1 },
    ],
  },
  {
    id: 'harp', short: 'Harp', label: 'Concert harp', kind: 'shot', layers: 2, sr: 44100, len: 3.2, fade: 1.2, step: 2,
    src: [{ lib: 'vcsl', dir: 'Chordophones/Composite Chordophones/Concert Harp', re: `^KSHarp_${N}_(?<v>mf|f|mp|p)\\d\\.wav$`, oct: 0, lo: M('E1'), hi: M('F7'), layer: lay({ p: 0, mp: 0, mf: 0, f: 1 }) }],
  },
  {
    id: 'harpsichord', short: 'Harpsichord', label: 'Harpsichord (French, 8′)', kind: 'shot', layers: 1, sr: 44100, len: 2.2, fade: 0.8, step: 3,
    src: [{ lib: 'vcsl', dir: 'Chordophones/Zithers/Harpsichord, French/Sustains', re: `^Harpsi2_Normal_${N}_rr1_Main\\.wav$`, oct: 1, lo: M('C2'), hi: M('F6'), layer: one }],
  },
  {
    id: 'glock', short: 'Glockenspiel', label: 'Glockenspiel (the music-box / celesta voice)', kind: 'shot', layers: 2, sr: 44100, len: 2.2, fade: 0.9, step: 2,
    // VCSL names the glockenspiel an octave below its sounding pitch (measured: 'G4' sounds 789 Hz = G5)
    src: [{ lib: 'vcsl', dir: 'Idiophones/Struck Idiophones/Glockenspiel', re: `^glock_(?<v>soft|medium)_${N}_0\\d\\.wav$`, oct: 1, lo: M('G5'), hi: M('C8'), layer: lay({ soft: 0, medium: 1 }) }],
  },
  {
    // soft mallets, motor off: a pure, round bell tone — the celesta's own sound in the middle register
    id: 'vibes', short: 'Vibraphone', label: 'Vibraphone (soft mallets, no motor)', kind: 'shot', layers: 2, sr: 44100, len: 2.8, fade: 1.2, step: 2,
    src: [{ lib: 'vcsl', dir: 'Idiophones/Struck Idiophones/Vibraphone/Soft Mallets', re: `^Vibes_soft_${N}_v(?<v>\\d)_rr\\d_Main\\.wav$`, oct: 1, lo: M('F3'), hi: M('F6'), layer: lay({ 1: 0, 2: 1 }) }],
  },
  {
    id: 'chimes', short: 'Tubular bells', label: 'Tubular bells', kind: 'shot', layers: 1, sr: 44100, len: 4.5, fade: 2.0, step: 2, pitch: 'named',
    src: [{ lib: 'vcsl', dir: 'Idiophones/Struck Idiophones/Tubular Bells 2', re: `^TB_hit_${N}_v(?<v>\\d)_\\d\\.wav$`, oct: 0, lo: M('C4'), hi: M('F5'), layer: lay({ 4: 0 }) }],
  },
  // ------------------------------------------------------------------ percussion
  {
    id: 'timpani', short: 'Timpani', label: 'Timpani (hits)', kind: 'shot', layers: 2, sr: 44100, len: 2.6, fade: 1.2, step: 1, pitch: 'timp',
    src: [{ lib: 'vcsl', dir: 'Membranophones/Struck Membranophones/Timpani 2/Hit', re: `^Timpani(?<n>\\d[A-D])_hit_v(?<v>\\d)_rr1_main\\.wav$`, oct: 0, lo: M('A1'), hi: M('D3'), layer: lay({ 3: 0, 5: 1 }) }],
  },
  {
    id: 'timpani_roll', short: 'Timpani roll', label: 'Timpani (rolls)', kind: 'loop', layers: 1, sr: 32000, pitch: 'timp',
    loop: { from: 0.8, to: 2.0, min: 1.0, max: 1.8, xf: 0.25 }, step: 1,
    src: [{ lib: 'vsco2ce', dir: 'Percussion/Timpani/Rolls', re: `^Timpani(?<n>\\d)_Roll_v(?<v>[345])_rr1_Sum\\.wav$`, oct: 0, lo: M('A1'), hi: M('D3'), layer: lay({ 3: 0, 4: 0 }) }],
  },
  {
    id: 'snare', short: 'Snare', label: 'Snare drum', kind: 'shot', layers: 4, sr: 44100, len: 0.7, fade: 0.3, pitch: 'none',
    src: [{ lib: 'vsco2ce', dir: 'Percussion', re: '^Snare2-HitSN_v(?<v>\\d)_rr(?<r>\\d)_Sum\\.wav$', layer: lay({ 1: 0, 3: 1, 5: 2, 9: 3 }), rr: rr2 }],
  },
  {
    id: 'snare_roll', short: 'Snare roll', label: 'Snare drum (roll)', kind: 'loop', layers: 1, sr: 32000, pitch: 'none',
    loop: { from: 0.5, to: 1.2, min: 0.8, max: 1.4, xf: 0.2 },
    src: [{ lib: 'vsco2ce', dir: 'Percussion', re: '^Snare2-rollSN_v(?<v>\\d)_rr1_Sum\\.wav$', layer: lay({ 3: 0 }) }],
  },
  {
    id: 'cymbal', short: 'Cymbals', label: 'Clash cymbals', kind: 'shot', layers: 4, sr: 44100, len: 4.0, fade: 2.2, pitch: 'none',
    src: [{ lib: 'vsco2ce', dir: 'Percussion', re: '^cymbal-crash1_(?<v>pp|mp|mf|ff)_rr1\\.wav$', layer: lay({ pp: 0, mp: 1, mf: 2, ff: 3 }) }],
  },
  {
    id: 'cymbal_roll', short: 'Cymbal swell', label: 'Suspended cymbal (swell)', kind: 'shot', layers: 1, sr: 44100, len: 5.0, fade: 1.2, pitch: 'none',
    src: [{ lib: 'vsco2ce', dir: 'Percussion', re: '^susCymb1-cresc-(?<v>Median)_v1\\.wav$', layer: one }],
  },
  {
    id: 'triangle', short: 'Triangle', label: 'Triangle', kind: 'shot', layers: 2, sr: 44100, len: 2.5, fade: 1.4, pitch: 'none',
    src: [{ lib: 'vsco2ce', dir: 'Percussion', re: '^Triangle3-Hit_v(?<v>\\d)_rr1_Sum\\.wav$', layer: lay({ 1: 0, 2: 1 }) }],
  },
];
