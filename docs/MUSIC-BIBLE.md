# The Music Bible — a symphonic score synthesised from nothing
**Owner: P27 (`src/audio/music.js`). Voice designs are shared with P28 (`src/audio/{audio,sfx}.js`).
Every note in this document is original. Nothing here is sampled, downloaded, or transcribed from anyone.**

The brief: a Sugiyama-shaped orchestral score — pomp, tenderness, punning good humour — produced entirely by
`OscillatorNode`, `BufferSource` noise, `BiquadFilterNode` and one `ConvolverNode` fed an impulse response we
generate ourselves at boot. No network. No assets. Under 40 KB of code and under 3 MB of generated buffers.

**Canon.** Theme ids are fixed by `docs/CANON.md` §9: the fourteen themes below plus the story cues in §3.15–§3.21
(`befriend`, `lullaby`, `wedding`, `highfeather`, `quiet_hand`, `finale`, `silence`) and the variants
`family.short`, `family.broken`, `family.whole`, `inn.sleep`. **`sad` is an alias of `family`** (ARCHITECTURE.md's
map `music` field still says `sad`). `village` is Puddlewick only; every other town uses `town`.

---

## 0. Conventions a builder can type

**Tuning.** A4 = 440 Hz. `freq(name)` parses `"C#4"`/`"Eb5"`; MIDI 69 = A4; `f = 440 * 2**((m-69)/12)`.

**Note arrays.** Every melody below is written as `[name, beats]` pairs, where **1 beat = one quarter note**.
`"R"` is a rest. A `~` suffix on a name means *tie into the previous note of the same pitch* (extend, don't
re-attack). Durations: `4` whole, `3` dotted half, `2` half, `1.5` dotted quarter, `1` quarter, `0.5` eighth,
`0.25` sixteenth, `0.333` eighth-triplet.

```js
// A phrase is literally this:
const A = [["A4",1],["D5",1],["F#5",1],["A5",1], ["G5",2],["F#5",1],["E5",1]];
```

**Chord arrays** are one symbol per bar unless split with `|`, e.g. `"G|A"` = two beats each in 4/4.

**Seconds per beat** = `60 / bpm`. All scheduling is in absolute `AudioContext.currentTime`, never `setTimeout`
for the note itself. Scheduler: a `setInterval(25ms)` pump that schedules every event starting in the next
**150 ms** window. A theme is a list of tracks; each track is `{voice, notes, octave, gain, pan, humanise}`.

**Velocity.** Dynamics map to a linear gain multiplier applied to the voice's peak:
`ppp .10 · pp .18 · p .30 · mp .45 · mf .60 · f .78 · ff .92 · fff 1.0`.

**Humanise.** Solo voices (solo horn, solo violin, flute, oboe) get `t += rand(-0.009, +0.009)` seconds and
`gain *= rand(0.94, 1.06)`. Section voices get half that. Percussion gets ±3 ms only. Harpsichord gets ±5 ms
plus a 6 ms per-string spread inside chords (that is what makes it sound plucked by a hand).

---

## 1. The orchestra — sixteen synth voices

Every voice is a factory: `mkVoice(ctx, buses)` returning `play(freq, tStart, durBeats, velocity, opts)`.
Each voice ends in its own `outGain → busDry` plus `outGain → sendGain → busVerb`. **Send** values below are
that `sendGain` (0..1). Filter envelope values are cutoff in Hz. ADSR is in seconds unless marked "×beat"
(scaled by tempo, so a slow theme breathes).

Unless stated, every oscillator is stopped at `tEnd + release + 0.05` and its nodes dropped — **no node is ever
reused**, and the voice pool caps at 24 simultaneous voices on `quality:'high'`, 14 on `'low'` (oldest, quietest
voice is stolen first).

### 1.1 HORN SECTION — `horns` (the DQ pomp voice)
The single most important sound in the game. Four detuned saws through a low-passed formant.
- **Osc:** 4 × `sawtooth` at detune `-14, -5, +6, +15` cents; a 5th oscillator `triangle` at **−1 octave**, gain 0.35 (the "bore").
- **Per-osc drift:** each saw's detune is modulated by its own 0.11–0.19 Hz LFO, ±3 cents. Never static.
- **Filter:** `lowpass`, Q = 2.2. Env: start 380 Hz → **attack to 2100 Hz over 0.10 s** → decay to **1250 Hz over 0.28 s** → on release fall to 500 Hz over 0.20 s. Hz values scale ×(1 + 0.35·(velocity−0.6)).
- **Second filter:** fixed `peaking` at 900 Hz, gain +6 dB, Q 1.1 — the brass honk.
- **ADSR:** A 0.045 · D 0.12 · S 0.72 · R 0.22.
- **Vibrato:** 5.2 Hz, depth ramps 0 → 9 cents between 0.35 s and 0.75 s after onset (players only vibrate on held notes).
- **Send:** 0.30 (HALL).
- **Note:** for unison lines, spread the section across 3 pans (−0.35, 0, +0.35) and add ±11 ms of onset spread. That spread *is* the section.

### 1.2 SOLO HORN — `hornSolo`
- **Osc:** 2 × `sawtooth` detune ±4 cents + 1 × `sine` at fundamental, gain 0.5.
- **Filter:** `lowpass` Q 1.4, env 300 → 1500 Hz over 0.14 s, decay to 900 Hz over 0.5 s.
- **ADSR:** A 0.08 · D 0.20 · S 0.65 · R 0.35. Softer, rounder, later peak than the section.
- **Vibrato:** 4.8 Hz, delayed 0.30 s, depth 12 cents, itself modulated ±2 cents by a 0.3 Hz LFO.
- **Extra:** a 0.06 s noise "breath" burst (bandpass 1.8 kHz, Q 3) at 8 % gain on every attack. Send 0.42.

### 1.3 STRINGS (section) — `strings`
- **Osc:** 3 × `sawtooth` (detune −11, 0, +11) + 2 × `sawtooth` one octave down at −7/+7 cents, gain 0.30.
- **Filter:** `lowpass` Q 0.8, env 700 → 3200 Hz over **0.35 s** (slow bow), sustain 2400 Hz; release glide to 800 Hz over 0.5 s.
- **Highpass** at 120 Hz to keep the mid clear.
- **ADSR:** A 0.22 (×beat, min 0.12, max 0.45) · D 0.25 · S 0.85 · R 0.55.
- **Vibrato:** 5.6 Hz, delay 0.4 s, depth 7 cents, plus a shared 0.7 Hz amplitude shimmer of ±4 %.
- **Send:** 0.45. Pan: violins +0.25, violas 0, celli −0.30.
- **Tremolo variant** (`stringsTrem`, used in Tension/Boss): retrigger the note as 16ths at the current tempo with A 0.01 · R 0.04, random ±12 % gain per stroke.

### 1.4 SOLO VIOLIN — `violin`
- **Osc:** `sawtooth` + `sawtooth` detune +6 cents, plus a `square` at −24 dB for rosin bite.
- **Filter:** `lowpass` Q 3.0 with a resonant peak that tracks pitch: cutoff = `clamp(f*4.5, 900, 5200)`, env from `f*1.4` up over 0.18 s.
- **Body resonators:** two `peaking` biquads, 460 Hz +5 dB Q 2, 1.15 kHz +4 dB Q 2.5.
- **ADSR:** A 0.10 · D 0.18 · S 0.80 · R 0.40.
- **Vibrato:** 6.1 Hz, delay 0.22 s, depth 18 cents (wide — it must sing over an orchestra). Send 0.50.
- **Portamento:** if two consecutive notes are ≤ 3 semitones apart and the gap is 0, glide the frequency over 40 ms. This one trick is 80 % of "that sounds like a violin".

### 1.5 FLUTE — `flute`
- **Osc:** `sine` (fundamental) + `sine` at ×2 gain 0.12 + `triangle` at ×3 gain 0.05.
- **Breath:** white noise → `bandpass` centred on `f*2.0`, Q 6 → gain env: 0.22 at attack, decays to 0.05 sustain. Always present. Without it, the flute is a test tone.
- **Filter:** `lowpass` 5.5 kHz Q 0.7, fixed.
- **ADSR:** A 0.07 · D 0.10 · S 0.90 · R 0.18.
- **Vibrato:** 5.0 Hz, delay 0.25 s, depth 14 cents, and a *pitch scoop*: start 22 cents flat, correct over 0.09 s.
- **Send:** 0.40.

### 1.6 OBOE — `oboe` (the sad-theme voice)
- **Osc:** `square` at 0.55 + `sawtooth` at 0.45, detune +3 cents apart.
- **Filter:** `bandpass` centred 1500 Hz Q 2.4, in series with `lowpass` 3800 Hz; env moves the bandpass 1100 → 1600 Hz over 0.12 s.
- **Formant peaks:** +7 dB at 1.4 kHz Q 3, +4 dB at 2.9 kHz Q 4. Nasal is correct.
- **ADSR:** A 0.055 · D 0.14 · S 0.78 · R 0.25.
- **Vibrato:** 5.4 Hz, delay 0.30 s, depth 11 cents. Send 0.45.

### 1.7 HARPSICHORD — `harpsi` (towns and castles)
- **Osc:** `sawtooth` + `square` (0.6/0.4) + a `sawtooth` at ×2.005 (the second choir, gain 0.28, detuned so it beats).
- **Filter:** `highpass` 220 Hz, then `lowpass` with env **4800 → 900 Hz over 0.45 s**, Q 1.
- **ADSR:** A **0.002** · D 0.9 · S 0.0 · R 0.12. There is no sustain on a harpsichord; the key release adds a tiny `pluck-off` click (8 ms noise burst, highpass 3 kHz, gain 0.04).
- **Vibrato:** none. Ever.
- **Send:** 0.28. Chord notes get 4–9 ms of stagger, low to high.

### 1.8 HARP — `harp`
- **Osc:** `triangle` (0.7) + `sine` ×2 (0.2) + `sine` ×3 (0.1), all decaying at different rates (×3 fastest).
- **Filter:** `lowpass` 6 kHz, env sagging to 1.6 kHz over 1.2 s.
- **ADSR:** A 0.004 · D 1.6 (scaled: low notes 2.4 s, top notes 0.7 s) · S 0 · R 0.25.
- **Send:** 0.50. Arpeggios stagger 55–70 ms per note; a *glissando* is 14 notes at 38 ms with gain falling 1.0 → 0.4.

### 1.9 TIMPANI — `timp`
- **Body:** `sine` at `f`, pitch dropping **−90 cents over 0.35 s** (real timpani sag), plus a `sine` at ×1.5 gain 0.25 and ×2.83 gain 0.12 (inharmonic drumhead partials).
- **Stick:** 18 ms noise burst through `bandpass` 220 Hz Q 1.2, gain 0.45.
- **ADSR:** A 0.006 · D 1.4 · S 0 · R 0.3. Roll = 14 strokes/second, gain rising per the crescendo curve, ±15 % random.
- **Range used:** D2–A2 (tonic/dominant only). Send 0.55.

### 1.10 SNARE — `snare`
- White noise → `highpass` 1.6 kHz + `bandpass` 3.4 kHz Q 0.9; parallel `triangle` at 185 Hz gain 0.25 with a 12 ms decay (the shell).
- **ADSR:** A 0.001 · D 0.13 · S 0 · R 0.02. Roll = 32nds with alternating gain 1.0/0.72 and ±10 % jitter. Send 0.22.

### 1.11 CYMBAL — `cymbal`
- White noise → `highpass` 5 kHz → three `peaking` bells at 3.9/6.8/9.5 kHz (+5 dB, Q 8) for metallic ring.
- **ADSR:** A 0.002 · D **2.6** · S 0 · R 0.4 (crash); `choke` variant D 0.35. Send 0.60. Pan +0.2.

### 1.12 PIZZICATO — `pizz`
- **Osc:** `triangle` + `sawtooth` at 0.35, both through `lowpass` env **2600 → 400 Hz over 0.16 s**, Q 2.5.
- **ADSR:** A 0.003 · D 0.30 · S 0 · R 0.08. Adds a 10 ms noise tick, bandpass 900 Hz, gain 0.10.
- **Send:** 0.30. The workhorse bass for every gentle theme.

### 1.13 CELESTA — `celesta` (magic, level-ups, night)
- **Osc:** `sine` at `f` + `sine` ×4.02 gain 0.30 + `sine` ×10.1 gain 0.08 (bell partials, slightly stretched).
- **Filter:** `highpass` 400 Hz so it never muddies.
- **ADSR:** A 0.004 · D 1.1 (partials decay 3× faster than the fundamental) · S 0 · R 0.4.
- **Send:** 0.55, and celesta alone also feeds the **long** send at 0.25.

### 1.14 CHURCH ORGAN — `organ`
- **Ranks (additive sines/triangles), gains:** 16′ ×0.5 → 0.30 · 8′ ×1 → 1.00 · 5⅓′ ×1.5 → 0.18 · 4′ ×2 → 0.55 · 2⅔′ ×3 → 0.22 · 2′ ×4 → 0.30 · mixture ×6 → 0.10. Use `triangle` for 8′ and 4′, `sine` for the rest.
- **Filter:** `lowpass` 4.2 kHz Q 0.6.
- **ADSR:** A 0.09 · D 0.0 · S 1.0 · R **0.55** (a room emptying). No decay: an organ holds forever.
- **Chiff:** 25 ms noise burst, bandpass at `f*3`, gain 0.06, on attack only.
- **Vibrato:** none; instead a 0.9 Hz ±1.5 cent tremulant on the 4′ and 2′ ranks only. Send **0.65** (CHAPEL).

### 1.15 CHIPTUNE TWINKLE — `twinkle` (secrets, chests, the wink in the score)
- **Osc:** single `square` with duty faked by summing two `square`s 25 % out of phase via a 1/(4f)-second delay.
- **Filter:** none. Deliberately raw.
- **ADSR:** A 0.001 · D 0.06 · S 0.45 · R 0.05.
- **Arpeggio:** retrigger the pitch every **1/60 s** through a 3-note chord, NES-style. Vibrato 7 Hz, depth 25 cents, delay 0.1 s. Send 0.18. Always mixed at `mp` or below — it is seasoning.

### 1.16 CHOIR PAD — `pad` (unlisted bonus; used in Church, Title, Family)
Three `sawtooth` detuned ±9 cents through a `lowpass` at 1.4 kHz + formant peaks at 730/1090/2440 Hz (an "ah").
A 0.9 · D 0.4 · S 0.85 · R 1.2. Send 0.70. Never louder than `p`.

---

## 2. Reverb and mix architecture

**Decision: convolution with a procedurally generated impulse response** on `quality:'high'|'med'`, with a
**feedback-delay-network fallback** on `'low'` (and on any device where the convolver pushes frame time past
2 ms). Convolution wins because a real IR gives the diffuse tail that makes four saw oscillators read as
"orchestra in a hall" — the single biggest realism-per-byte trade in the whole audio system.

### 2.1 Generating the impulse responses (at boot, off the critical path)
Build three IRs into `AudioBuffer`s, stereo, at `ctx.sampleRate`. Generate lazily on the first `Music.play`,
inside a `requestIdleCallback`, and swap the convolver in when ready (dry-only for the first second is fine).

```
makeIR(seconds, decayExp, tiltHz, taps)
  n = sampleRate * seconds
  for ch in 0..1:
    for i in 0..n:
      t = i / n
      s = (random()*2 - 1) * (1 - t)^decayExp        // exponential-ish decay
      s *= 1 - 0.25*ch                                // slight L/R level decorrelation
      lp = lp + a*(s - lp);  a = coef(tiltHz * (1 - 0.75*t))   // tail gets darker over time
      buf[ch][i] = lp
    for (time, gain) in taps:                         // early reflections, added on top
      buf[ch][round(time*sr) + ch*13] += gain * (random() < 0.5 ? -1 : 1)
  remove DC (subtract running mean), then normalise so RMS = 0.06
```

| IR | seconds | decayExp | tiltHz | early taps `(ms, gain)` | used by |
|----|---------|----------|--------|--------------------------|---------|
| `HALL` | 2.6 | 2.4 | 7000 | (11,.35) (17,.28) (23,.24) (31,.19) (43,.14) (59,.10) | default bus for everything |
| `ROOM` | 1.1 | 3.1 | 5200 | (7,.40) (13,.30) (19,.22) (27,.15) | interiors, inn, town, shops |
| `CHAPEL` | 4.2 | 1.7 | 4200 | (23,.30) (37,.26) (53,.22) (71,.18) (97,.13) (127,.09) | church, title, family theme |

Pre-delay: a `DelayNode` of **18 ms** (HALL), **8 ms** (ROOM), **34 ms** (CHAPEL) *before* the convolver.
Feed the convolver through a `highpass` at 180 Hz and a `lowpass` at 6.5 kHz so the tail never fogs the bass or
hisses. Each map's `light.fog`-ish "space" is chosen by map `kind`: `world/field → HALL`, `town/interior →
ROOM`, `dungeon → HALL with predelay 42 ms and lowpass 3.4 kHz`, church → `CHAPEL`.

### 2.2 FDN fallback (quality 'low')
Four `DelayNode`s at **29.7, 37.1, 41.3, 53.9 ms** (mutually prime), each with a one-pole `lowpass` at 4.5 kHz
in its loop, cross-fed by a 4×4 Hadamard matrix scaled by **0.78** (RT60 ≈ 2.1 s). Outputs: lines 1+2 → L,
3+4 → R, with line 3 inverted for width. 12 ms pre-delay. Costs ~1/8th of the convolver.

### 2.3 The graph
```
voice ──► voiceGain ──┬─────────────────────────────► BUS[part]
                      └─► sendGain ─► REVERB_IN ─► predelay ─► HP180 ─► convolver ─► LP6.5k ─► verbGain(0.9) ─► MUSIC_SUM
BUS.melody(0.95) ┐
BUS.counter(0.62)├─► MUSIC_SUM ─► musicGain(0.85) ─► DUCK(1.0) ─► MASTER_SUM
BUS.harmony(0.55)│
BUS.bass(0.70)   │
BUS.perc(0.66)  ─┘
SFX voices ─► sfxGain(0.9) ──────────────────────────► MASTER_SUM
MASTER_SUM ─► compressor(thresh -14 dB, knee 8, ratio 3, attack 0.006, release 0.18)
           ─► masterGain(0.80) ─► destination
```
`Music.duck(n)` ramps `DUCK.gain` to `n` over **0.12 s** and back to 1.0 over **0.40 s**.
User sliders write `musicGain` and `sfxGain` (0..1, stored in the save; default music 0.75, sfx 0.9).
**Never** connect anything to `destination` directly — the compressor is what stops eight horns from clipping.

**Stereo.** Every voice has a `StereoPannerNode`. Fixed seating: flute +0.15, oboe −0.15, solo horn −0.40,
horn section spread ±0.35, violins +0.25, celli −0.30, harp +0.45, harpsichord −0.25, celesta +0.35,
timpani −0.15, snare +0.10, cymbal +0.20, organ 0 (with the 4′ rank panned ±0.5), pizz −0.20.

**One `AudioContext`,** created on the first user gesture (title screen "Press any key"), `latencyHint:
'interactive'`. If `ctx.state === 'suspended'` on any input event, resume it. Music never blocks the game.

---

## 3. The score — fourteen themes and seven story cues

The tempo, key, form, melody, harmony, orchestration, dynamics and loop point of each. **Every melody below is
a literal array.** Where only the A section is written out, the derived sections are specified as
transformations precise enough to generate.

### 3.0 The Hearth Cell (the score's DNA)
> **Scale degrees 5 → 1 (leap up a fourth), then 1 → 7 → 6 → 5 (walk back down).**
> In D major: `A4 D5 C#5 B4 A4`.

It opens the Title fanfare, opens the Overworld, is inverted in the Battle theme, is minor-ised in the Boss
theme, and is the answering phrase of the Family theme. A child who plays for ten hours will hum this shape
without ever knowing why the game feels like one thing.

---

### T1 · TITLE — *"Overture: The Long Road Home"* · `id: 'title'`
**Key** D major · **Time** 4/4 · **Tempo** free fanfare (♩≈ 60), then ♩= 84 · **Form** Fanfare (5 bars, once) → **Grand A** (8) → **Grand A′** (8) → **Coda** (4) → *loop to Grand A*.

**Fanfare (horn section ff, timpani roll under, cymbal on the last chord):**
```js
[["A4",0.5],["D5",0.5],["F#5",0.5],["A5",0.5], ["D6",2],["R",1],
 ["A5",0.5],["G5",0.5],["F#5",0.5],["E5",0.5], ["D5",3],["R",1],
 ["D5",4]]
```
Chords: `D | D | A7 | D | D`. Timpani: D2 roll 2 bars crescendo `pp→ff`, then D2/A2 quarters in bar 3, cymbal crash on the downbeat of bar 5, decaying under silence.

**Grand A** = the Overworld A melody (§T3) at ♩= 84, played by **strings** in octaves with **horn section**
doubling the lower octave at `mf`, **harp** rolling a chord per bar (6 notes, 60 ms apart), **timpani** on beats
1 and 3. **Grand A′** repeats it a third higher (transpose +4 semitones to F# major for 6 bars, then bend back
via `E7 | A7` into D).

**Coda (4 bars):** solo horn alone, `p`, plays the Hearth Cell twice, `rit.` to ♩= 66; harp glissando D2→D6;
final `D` chord held by strings + pad for 6 seconds, send 0.70 into CHAPEL.
**Loop:** at the end of the Coda, the sustained D is left ringing and the Grand A restatement begins on top of
it — the seam is inside a held chord, so it is inaudible. Fanfare never repeats.

---

### T2 · HOME VILLAGE — *"Under the Low Roofs"* · `id: 'village'`
**Key** G major · **Time** 6/8 (dotted-quarter = 66) · **Tempo** ♩= 198 eighths, i.e. set `bpm = 66` with a beat = dotted quarter and write durations in quarters as below · **Form** A(8) B(8) A(8) C(8) → loop to bar 1 · **Dynamics** `mp` throughout, C section `p`.

**A — flute lead:**
```js
[["D4",0.5],["G4",0.5],["A4",0.5],["B4",1.5],
 ["A4",0.5],["B4",0.5],["A4",0.5],["G4",1.5],
 ["B4",0.5],["D5",0.5],["B4",0.5],["A4",0.5],["G4",0.5],["A4",0.5],
 ["B4",1.5],["R",1.5],
 ["D5",0.5],["B4",0.5],["C5",0.5],["D5",1.5],
 ["E5",0.5],["D5",0.5],["C5",0.5],["B4",1.5],
 ["A4",0.5],["B4",0.5],["C5",0.5],["B4",0.5],["A4",0.5],["G4",0.5],
 ["G4",3]]
```
**Harmony (one per bar):** `G | D7 | Em | C|D | G | C | Am|D7 | G`
**Orchestration:** harp plays a continuous 6-eighth arpeggio of each chord (root-5-8-10-8-5), `p`, send 0.50.
Pizzicato on eighths 1 and 4 of each bar (root, then fifth). Strings enter at bar 5 as a soft pad, `pp`.
Celesta doubles the flute an octave up **only in the C section**. No percussion, ever — this is a place where
nothing bad happens.
**B section:** same rhythm, melody transposed to start on `B4` over `Em | Bm | C | D | Em | C | Am|D7 | G`.
**C section:** flute drops out; solo oboe plays **Queen Elowen's lullaby** (§3.16, the melody verbatim) over
sustained strings, then the flute answers the last two bars an octave up. This is the "someone is waiting for you
at home" moment — and nobody tells the player whose song it is until Act III (STORY-BIBLE T3).
**Loop:** 32 bars, seam on the G downbeat. Harp is mid-arpeggio at the seam and simply continues — never let
the harp resolve at the loop point or the join will click in the listener's mind.

---

### T3 · OVERWORLD — *"Over Hill, Over Homeward"* · `id: 'overworld'`
**The most important 45 seconds in the game.**
**Key** D major · **Time** 4/4 · **Tempo** ♩= 108 (a walking pace slightly faster than the player walks) ·
**Form** Intro(4) → **A**(8) → **A′**(8) → **B**(8) → **A″**(8) → Tag(2) → *loop to A* · **Dynamics** A `f`, B `mp`, A″ `ff`.

**Intro (4 bars):** timpani D2 on beats 1 & 3, snare a 2-beat roll into bar 3, horns play the Hearth Cell in
octaves `f`: `[["A3",1],["D4",1],["C#4",1],["B3",1],["A3",4],["R",4],["A4",2],["R",2]]`.

**A — horn section (melody), strings doubling an octave below:**
```js
[["A4",1],["D5",1],["F#5",1],["A5",1],
 ["G5",2],["F#5",1],["E5",1],
 ["D5",1.5],["E5",0.5],["F#5",1],["D5",1],
 ["E5",3],["A4",1],
 ["B4",1],["E5",1],["G5",1],["B5",1],
 ["A5",2],["G5",1],["F#5",1],
 ["E5",1.5],["F#5",0.5],["G5",1],["E5",1],
 ["D5",3],["R",1]]
```
**Harmony:** `D | G | D | A | Em | A | G|A | D`
**A′:** identical melody; add flute doubling two octaves up at `mp`, and a counter-line in the celli:
`[["D3",2],["C#3",2],["B2",2],["A2",2],["G2",2],["A2",2],["B2",1],["C#3",1],["D3",2]]`.

**B — strings lead, horns drop to sustained pads, flute answers:**
```js
[["D5",1],["G5",1],["F#5",0.5],["G5",0.5],["A5",1],
 ["B5",2],["A5",2],
 ["G5",1],["F#5",1],["E5",1],["D5",1],
 ["E5",3],["R",1],
 ["A4",1],["D5",1],["C5",1],["B4",1],
 ["A4",2],["D5",1],["E5",1],
 ["F#5",1],["E5",1],["D5",1],["C#5",1],
 ["D5",2],["A4",1],["A4",1]]
```
**Harmony:** `G | Em | Am7 | D | G | D/F# | Em|A | D|A7`
**A″:** A section at `ff`, horns + strings + flute in three octaves, timpani on all four beats of bars 7–8,
cymbal crash on the bar-1 downbeat, snare marching eighths from bar 5.
**Tag (2 bars):** `| A7 | D |` — horns `[["E5",1],["F#5",1],["G5",1],["A5",1],["D5",4]]`, cymbal, timpani D2.
**Loop:** the Tag's final D is a *whole note held into the loop seam*; the A section's first note (A4) begins
on that same downbeat while the D still rings and the reverb tail carries across. **Total 38 bars ≈ 84 s.**

**Percussion rule:** bass drum (timpani D2, `mp`) on beats 1 & 3 for the entire theme — it is the footfall the
child's walking matches.

---

### T4 · CASTLE — *"The King's Small Kindnesses"* · `id: 'castle'`
**Key** C major · **Time** 3/4 · **Tempo** ♩= 96 (a minuet, stately but not pompous) · **Form** A(8) A(8) B(8) A(8) → loop · **Dynamics** `mf`.

**A — oboe lead:**
```js
[["G4",1],["C5",1],["E5",1],
 ["D5",2],["G4",1],
 ["C5",1],["E5",1],["G5",1],
 ["F5",2],["E5",1],
 ["D5",1],["F5",1],["A5",1],
 ["G5",2],["E5",1],
 ["F5",1],["E5",1],["D5",1],
 ["C5",3]]
```
**Harmony:** `C | G | C | F | Dm | G | G7 | C`
**Orchestration:** harpsichord plays the full chord on beat 1 and a two-note upper voicing on beats 2 & 3, every
bar, `mp` — this is the sound of a throne room. Pizzicato bass on beat 1 (root) and beat 3 (fifth). Strings pad
from bar 5 at `p`. Solo horn doubles the melody an octave lower in the second A, `mp`. No drums.
**B:** modulate to A minor — same rhythm, melody `[["E5",1],["A5",1],["G5",1],["F5",2],["E5",1], …]` over
`Am | E7 | Am | F | Dm | E7 | Am | G7`, with the solo horn taking the lead and the oboe answering.
**Loop:** 32 bars; the harpsichord's beat-3 chord in the final bar leads straight into the A downbeat.

---

### T5 · TOWN — *"Market Morning"* · `id: 'town'`
**Key** F major · **Time** 2/4 · **Tempo** ♩= 120 (bustling but not frantic) · **Form** A(8) A(8) B(8) A(8) → loop · **Dynamics** `mp`, B `mf`.

**A — oboe lead (flute doubles up an octave on the repeat):**
```js
[["F4",0.5],["G4",0.5],["A4",0.5],["C5",0.5],
 ["A4",1],["F4",1],
 ["G4",0.5],["A4",0.5],["Bb4",0.5],["D5",0.5],
 ["C5",1],["A4",1],
 ["Bb4",0.5],["A4",0.5],["G4",0.5],["F4",0.5],
 ["E4",1],["G4",1],
 ["F4",0.5],["G4",0.5],["A4",0.5],["Bb4",0.5],
 ["A4",1.5],["R",0.5]]
```
**Harmony:** `F | Dm | Bb | C7 | Bb | C7 | F | C7`
**Orchestration:** harpsichord on **every eighth** as a running alberti figure (root-5-8-5), `p` — the market
chatter. Pizzicato on beat 1 of each bar. A single `twinkle` note (chiptune) on the last eighth of bars 4 and 8
at `pp`, a fifth above the melody: the game winking at you. Strings pad only in B.
**B:** to Bb major, flute leads, harpsichord thins to beat 1 only, `Bb | Gm | Eb | F7 | Bb | Gm | C7 | F7`.
**Loop:** 32 bars ≈ 32 s. Deliberately short — you hear it many times, so it must be light and never insist.

---

### T6 · CHURCH — *"Sanctuary"* · `id: 'church'`
**Key** A minor → A major (picardy) · **Time** 4/4 · **Tempo** ♩= 52 · **Form** one 8-bar chorale, repeated forever · **Dynamics** `p`, swelling to `mp` in bars 5–6 · **Voice:** church organ, four real parts, plus `pad` at `ppp` and nothing else. **No percussion. No vibrato. CHAPEL reverb, send 0.65.**

**Soprano:**
```js
[["A4",2],["C5",2], ["B4",2],["A4",2], ["E5",2],["D5",1],["C5",1], ["B4",4],
 ["C5",2],["E5",2], ["D5",2],["C5",2], ["B4",2],["A4",1],["G#4",1], ["A4",4]]
```
**Alto:** `E4 E4 | G#4 E4 | G4 F4 E4 | F4 | E4 G4 | F4 E4 | D4 E4 | E4`
**Tenor:** `C4 A3 | B3 C4 | C4 A3 | D4 | A3 C4 | A3 G3 | G3 B3 | C4` (all whole/half values matching soprano)
**Bass (organ pedal, 16′):** `A2 | E2 | C3 | E2 | A2 | F2 | D2|E2 | A2`
**Harmony:** `Am | Em | C | E | Am | F | Dm|E7 | Am(add A major third on the very last repeat only)`
**Loop:** the organ's release is 0.55 s and the CHAPEL tail is 4.2 s, so bar 8 bleeds two full seconds into
bar 1. Schedule bar 1 exactly at the bar-8 boundary and let it overlap. Seam: invisible.
**Use:** also the resurrection/save cue. When the player is revived, hold bar 8 for eight seconds with a harp
glissando and one celesta A5.

---

### T7 · INN — *"Rest Your Boots"* · `id: 'inn'`
**Key** C major · **Time** 6/8 · **Tempo** dotted-quarter = 72 · **Form** 8 bars, loops · **Dynamics** `p`. **Voices: celesta + harp only.** Nothing else. That absence is the point.

**Celesta:**
```js
[["G5",1.5],["E5",1.5],
 ["F5",0.5],["E5",0.5],["D5",0.5],["C5",1.5],
 ["E5",1.5],["D5",1.5],
 ["C5",3],
 ["A4",1.5],["C5",1.5],
 ["D5",0.5],["E5",0.5],["F5",0.5],["E5",1.5],
 ["D5",1.5],["B4",1.5],
 ["C5",3]]
```
**Harmony:** `C | F | C|G7 | C | Am | F | G7 | C`
Harp plays the chord as a 6-eighth arpeggio, one octave below, `pp`.
**Sleep cue** (`inn.sleep`, one-shot, 4.5 s): bars 1–4 only, then a rising celesta figure
`[["C5",0.5],["E5",0.5],["G5",0.5],["C6",0.5],["E6",2]]` with a harp glissando under it, fading to silence over
1.5 s as the screen wipes to black. Wake up with the same figure inverted, then the town theme fades in.

---

### T8 · DUNGEON / CAVE — *"The Dark Under the Hill"* · `id: 'dungeon'`
**Key** D phrygian (D Eb F G A Bb C) · **Time** 4/4 · **Tempo** ♩= 60 · **Form** 16 bars, loops · **Dynamics** `pp` to `p`. Ambience, not tune — but it still has a shape a child could hum back, which is what stops it being boring.

**Drone:** strings (celli + basses) hold `D2` and `A2` for all 16 bars, `pp`, with the 0.7 Hz shimmer. Reverb
send raised to 0.65, convolver lowpass dropped to 3.4 kHz, predelay 42 ms.

**Solo oboe fragment (bars 1–8):**
```js
[["R",4],
 ["D4",2],["Eb4",1],["D4",1],
 ["R",2],["F4",2],
 ["Eb4",3],["R",1],
 ["R",4],
 ["A4",2],["G4",1],["F4",1],
 ["Eb4",2],["D4",2],
 ["D4",4]]
```
**Bars 9–16:** the same fragment played by **flute**, transposed up a fourth (start `G4`), with the last bar
falling to `C#4` instead — a question that is never answered.
**Timpani:** a single soft `D2` (`pp`) on beat 1 of bars 1, 5, 9, 13. A heartbeat.
**Celesta:** one note, `A5`, at a *random* moment in bars 4, 11 and 15 (± half a bar, seeded by the map RNG) —
water dripping. This randomisation is why 16 bars do not feel like 16 bars.
**Harmony:** implied `Dm(b9)` throughout; bars 6–7 lean to `Bb`, bar 8 returns to `Dm`.
**Loop:** drone never stops, so there is literally no seam — only the fragment restarts.

---

### T9 · TENSION — *"Something in the Trees"* · `id: 'tension'`
**Key** C minor · **Time** 4/4 · **Tempo** ♩= 104 · **Form** 8 bars, loops indefinitely until the story releases it · **Dynamics** `p` growing 3 dB per loop to a `mf` ceiling.

**Bass (celli, quarter notes, chromatic climb — one pitch per bar, four times):**
`C2 | Db2 | D2 | Eb2 | E2 | F2 | F#2 | G2`
**Tremolo strings** hold the chord above, `stringsTrem`, throughout.
**Solo violin, sparse:**
```js
[["R",3],["G4",1], ["Ab4",2],["G4",2],
 ["R",3],["Bb4",1], ["B4",2],["Bb4",2],
 ["R",3],["C5",1], ["Db5",2],["C5",2],
 ["Eb5",1],["D5",1],["Db5",1],["C5",1], ["B4",4]]
```
**Harmony:** `Cm | Abmaj7 | Cm | Bdim7 | Cm | Db(N6) | Ddim7 | G7b9`
`G7b9 → Cm` at the loop seam resolves *and* restarts, so the dread renews rather than releases.
**Timpani:** a `pp` C2 roll under bars 7–8, crescendo, cut at the seam.
**Use:** ghost tower, before a boss door, the night the story turns.

---

### T10 · BATTLE — *"Draw Steel!"* · `id: 'battle'`
**Key** D minor · **Time** 4/4 · **Tempo** ♩= 156 · **Form** Intro(2) → A(8) → A′(8) → B(8) → A(8) → *loop to A* · **Dynamics** `f`, B `mf`, final A `ff`.

**Intro:** timpani D2 sixteenth roll 2 beats → horns stab `D4/A4/D5` on beats 3 and 4 with a cymbal crash.

**A — horn section melody, doubled by strings an octave up:**
```js
[["D5",0.5],["D5",0.5],["F5",0.5],["A5",0.5],["D6",1],["A5",1],
 ["Bb5",0.5],["A5",0.5],["G5",0.5],["F5",0.5],["E5",2],
 ["E5",0.5],["E5",0.5],["G5",0.5],["Bb5",0.5],["A5",1],["F5",1],
 ["E5",1],["D5",1],["C#5",2],
 ["D5",0.5],["D5",0.5],["F5",0.5],["A5",0.5],["D6",1],["A5",1],
 ["Bb5",0.5],["A5",0.5],["G5",0.5],["F5",0.5],["E5",2],
 ["E5",0.5],["E5",0.5],["G5",0.5],["Bb5",0.5],["A5",1],["F5",1],
 ["E5",1],["C#5",1],["D5",2]]
```
**Harmony:** `Dm | Gm | A7 | A7 | Dm | Bb | Gm|A7 | Dm`
**Bass (pizz + timpani):** driving eighths on the chord root, with the pattern `1 1 5 1 | 1 1 5 8` per bar.
**Snare:** eighths throughout, accent on 1 and 3, plus a 16th fill in the last beat of bars 4 and 8.
**B — chromatic climb, horns in unison, strings tremolo:**
```js
[["A4",0.5],["Bb4",0.5],["B4",0.5],["C5",0.5],["D5",2],
 ["C5",0.5],["C#5",0.5],["D5",0.5],["Eb5",0.5],["E5",2],
 ["F5",1],["E5",1],["D5",1],["C#5",1],
 ["D5",2],["R",2],
 ["D5",0.5],["Eb5",0.5],["E5",0.5],["F5",0.5],["G5",2],
 ["F5",0.5],["F#5",0.5],["G5",0.5],["Ab5",0.5],["A5",2],
 ["Bb5",1],["A5",1],["G5",1],["F5",1],
 ["E5",2],["A4",2]]
```
**Harmony:** `Dm | Ddim7 | A7 | Dm | Gm | Gdim7 | A7 | A7`
**Loop:** 34 bars ≈ 52 s. The final A's bar 8 is a held `Dm` with a cymbal; A restarts on that downbeat.
Cymbal decay (2.6 s) bridges the seam.

---

### T11 · BOSS BATTLE — *"The One Who Waits"* · `id: 'boss'`
**Key** C minor · **Time** 4/4 · **Tempo** ♩= 168 · **Form** Intro(4) → A(8) → B(8) → A(8) → *loop to A* · **Dynamics** `ff` throughout; B drops to `mp` for two bars then re-crescendos.

**Ostinato (runs the entire piece):** low strings + pizz basses, eighths:
```js
[["C2",0.5],["C2",0.5],["G2",0.5],["C2",0.5],["Eb3",0.5],["C2",0.5],["G2",0.5],["C2",0.5]]
```
Transpose the ostinato with the harmony (root-5-root-b3 shape). Timpani doubles beats 1 and 3.

**Intro:** organ pedal C1 enters `pp` and crescendos over 4 bars while the ostinato fades in; cymbal crash on
the A downbeat.

**A — horn section in unison with organ 8′+4′:**
```js
[["C5",1],["Eb5",1],["D5",1],["C5",1],
 ["B4",2],["G4",2],
 ["Ab4",1],["C5",1],["B4",1],["Ab4",1],
 ["G4",4],
 ["C5",1],["Eb5",1],["F5",1],["G5",1],
 ["Ab5",2],["G5",2],
 ["F5",1],["Eb5",1],["D5",1],["C5",1],
 ["B4",2],["R",2]]
```
> Bar 1 is the Hearth Cell in the minor, inverted: `1 b3 2 1`.

**Harmony:** `Cm | G7 | Fm | G7 | Cm | Ab | Fm|G7 | G7`
**B:** strings take a soaring counter-melody an octave above while horns hold pedal tones; snare plays a
military 16th pattern; bar 15–16 is a snare crescendo roll `mp → fff` into the A restatement.
**Extras:** `pad` choir at `pp` doubling the horn line an octave down — it makes the boss feel *bigger* than the
battle theme without adding a single new note. Cymbal on every A downbeat.
**Loop:** 28 bars ≈ 40 s. Seam under a cymbal + organ sustain.

---

### T12 · VICTORY FANFARE — *"Well Fought!"* · `id: 'victory'` (one-shot, 6 bars ≈ 11 s)
**Key** D major · **Time** 4/4 · **Tempo** ♩= 132 · **Dynamics** `ff`.

**Horn section (melody), strings doubling an octave up from bar 3:**
```js
[["D5",0.5],["D5",0.5],["D5",0.5],["D5",0.5],["F#5",1],["A5",1],
 ["D6",3],["A5",1],
 ["B5",1],["A5",1],["F#5",1],["D5",1],
 ["E5",2],["A4",1],["A4",1],
 ["F#5",1],["G5",1],["A5",1],["B5",1],
 ["D6",4]]
```
**Harmony:** `D | D | G | A | D/A|A7 | D`
**Timpani:** D2 on all four beats of bar 1, then beats 1 & 3; a full roll in bar 5 crescendoing; D2+A2 hit on
bar 6. **Cymbal:** crash on bar 1 beat 1 and bar 6 beat 1. **Snare:** eighths bars 1–5, 32nd roll in bar 5.
**Harp:** upward glissando D3→D6 across bar 5. **Celesta:** doubles the melody two octaves up in bar 6.
**Ending:** the bar-6 `D6` rings for its full 4 beats and the reverb tail is allowed to run out completely
(≈ 2.6 s more). Do not cut it. Then the EXP tally window opens.

---

### T13 · LEVEL-UP JINGLE — *"A Bit Taller"* · `id: 'levelup'` (one-shot, 3 bars ≈ 3.4 s)
**Key** D major · **Time** 4/4 · **Tempo** ♩= 144 · **Voices:** celesta (lead) + harp (arpeggio) + solo horn (bar 3 only, `mf`) + one cymbal *choke* on bar 1.

```js
[["D5",0.5],["E5",0.5],["F#5",0.5],["G5",0.5],["A5",1],["B5",1],
 ["D6",1.5],["B5",0.5],["A5",1],["F#5",1],
 ["D6",4]]
```
**Harmony:** `D | G|A7 | D`
Harp plays sixteenth arpeggios under bars 1–2. The final `D6` is celesta + solo horn in unison; celesta rings
its full 1.1 s decay. **Plays over silence** — the field theme is ducked to 0 during the tally and comes back
after (see §5).

---

### T14 · FAMILY / SAD — *"What Your Father Would Say"* · `id: 'family'`
**The one that makes a grown-up's throat tighten.**
**Key** E minor (→ G major in B) · **Time** 3/4 · **Tempo** ♩= 60 · **Form** A(8) B(8) A′(8) Coda(4) → loop · **Dynamics** A `p`, B `mf`, A′ `mp` dying to `pp` · **Reverb:** CHAPEL, sends +0.10 on everything.

**A — solo oboe, entirely alone for the first four bars:**
```js
[["B4",2],["E5",1],
 ["D5",2],["B4",1],
 ["C5",1],["B4",1],["A4",1],
 ["B4",3],
 ["G4",2],["B4",1],
 ["E5",2],["D5",1],
 ["C5",1],["B4",1],["A4",1],
 ["G4",3]]
```
> Bars 1–2 are the Hearth Cell in the minor: `5 → 1`, then step down. Everything in this game is this shape.

**Harmony:** `Em | G | Am | B7 | Em | C | Am | G` — strings enter at bar 5, `pp`, one chord per bar, held.
**B — solo violin an octave above, strings underneath, harp arpeggios in eighths:**
```js
[["G5",2],["A5",1],
 ["B5",2],["C6",1],
 ["B5",1],["A5",1],["G5",1],
 ["A5",3],
 ["F#5",2],["G5",1],
 ["A5",2],["B5",1],
 ["A5",1],["G5",1],["F#5",1],
 ["E5",3]]
```
**Harmony:** `G | C | Am7 | D | Bm | C | Am|B7 | Em`
**A′:** the oboe melody again, now with solo horn answering each 2-bar phrase an octave below (call and
response — the father's voice), strings full, `mp`.
**Coda (4 bars):** `Am | Em/B | C | Em`. Solo violin holds a high `B5` for 6 beats; harp plays one rising
figure; celesta places three notes: `E5`, `G5`, `B5`, 1.2 s apart, over the last chord.
**Loop:** the Coda's final `Em` is held by strings + pad; the oboe's `B4` of bar 1 enters over the top of it,
`p`. Seam invisible. **28 bars ≈ 84 s.**
**Cut-down variant** `family.short` = A only (8 bars, 24 s) for dialogue underscoring.
**Story variant** `family.broken` (STORY-BIBLE T1, the father's fall): solo oboe, no reverb swell, **no other
voice**: `[["B4",2],["E5",1],["D5",2],["Bb4",1]]` — the fourth note a semitone flat — then silence. One-shot.
**Story variant** `family.whole` (T2, the Stone Garden): the same four notes, correct (`B4 E5 D5 B4`), on **full
strings** (`strings` + `violin` doubling), `mf`, then straight into the B section. The first time strings carry
the tune in the whole game.

---

### T15 · BEFRIENDING FANFARE — *"Room in the Wagon"* · `id: 'befriend'` (one-shot, ≈ 1.7 s)
**Key** D major · **Tempo** ♩= 176 · **Voices:** harp glissando up on the chime (D4→D6, 14 notes), then flute
(lead, `f`) doubled by pizzicato, over a held D-add9 in low `strings` (`D2 A2 E3 F#3`, `mp`); one `twinkle`
triangle-ping on the last note. Spec shared with MONSTER-BIBLE §7.
```js
[["A4",0.5],["D5",0.5],["F#5",0.5],["A5",0.5], ["R",0.5], ["G5",0.5],["F#5",0.5],["D5",1.5]]
```
Must be hummable by a seven-year-old after two hearings.

---

### T16 · QUEEN ELOWEN'S LULLABY — *"I Only Put You Down for a Minute"* · `id: 'lullaby'`
**The game's secret spine.** Planted three times before anyone says whose it is: the C section of `village`
(oboe), Cobwell Manor's music boxes (`celesta` alone, slightly too slow, one stuck note on repeat), and a
Saltmarrow fisherwoman humming it (`flute`, `pp`, no accompaniment). Heard whole, with its voice, at B24.
**Key** G major · **Time** 6/8 (written as 3 quarter-beats per bar, like T2) · **Tempo** dotted-quarter = 54 ·
**Form** A(8) A(8) → loop · **Dynamics** `p`.
```js
[["D4",1.5],["G4",1],["A4",0.5],
 ["B4",1.5],["A4",1.5],
 ["G4",1],["A4",0.5],["B4",1],["C5",0.5],
 ["D5",3],
 ["E5",1],["D5",0.5],["C5",1],["B4",0.5],
 ["A4",1.5],["B4",1],["A4",0.5],
 ["G4",1],["F#4",0.5],["E4",1],["F#4",0.5],
 ["G4",3]]
```
**Harmony:** `G | Em | C | D | C | Am|D | C|D7 | G`. It obeys all nine laws of §4 (range D4–E5, one leap D4→G4
in bar 1, breath at bar 4, tonic on the downbeat of bar 8).
**The B24 version:** `pad` (the wordless "ah" voice) sings the melody, `harp` arpeggiates each chord in eighths,
CHAPEL reverb. She starts on **bar 5** (the "third line" she was stuck on), sings to the end, then the whole
song once through. No strings until the second A.

---

### T17 · WEDDING — *"Bold."* · `id: 'wedding'`
**Key** D major · **Time** 4/4 · **Tempo** ♩= 88 · **Form** Bells(2) → A(8) → Tag(2) → loop to A.
**Bells:** `celesta` + `cymbal` choke on `D6 A5 F#5 D5` as quarter notes, twice — a peal.
**A:** the `village` A melody (T2) **transposed up a fifth to D major and re-barred into 4/4**: each 6/8 bar
becomes one 4/4 bar by multiplying every duration by 4/3 (eighths become quarter-note triplets, dotted quarters
become halves). Bar 1 becomes `[["A4",0.667],["D5",0.667],["E5",0.667],["F#5",2]]`; apply the same rule to every
note. Melody on `organ` 8′+4′ with
`horns` doubling at `mf`; `timp` D2/A2 on beats 1 and 3; harp glissando into bar 5.
**Tag:** the Hearth Cell (`A4 D5 C#5 B4 A4`) on horns, `f`, held D chord. Loops under the wedding scene.

---

### T18 · HIGHFEATHER — *"Nobody Is Cross"* · `id: 'highfeather'`
**Key** E major · **Time** 3/4 · **Tempo** ♩= 66 · **Form** A(8) → loop · **Voices:** `pad` choir and `harp`
only. **No percussion, ever. The last chord never resolves.**
```js
[["B4",2],["E5",1], ["D#5",2],["C#5",1], ["B4",3], ["R",3],
 ["C#5",2],["F#5",1], ["E5",2],["D#5",1], ["C#5",3], ["B4",3]]
```
**Harmony:** `E | B/D# | C#m | A | A | F#m | E/G# | Asus2` — the `Asus2` rolls straight back into `E` at the
seam without ever becoming `A`. Harp: one rising 6-note arpeggio per bar, 65 ms apart. Its first four bars are
the fanfare when the Larksteel Shield is held aloft (WORLD-BIBLE §4 B9).

---

### T19 · THE QUIET HAND — *"There Now"* · `id: 'quiet_hand'`
Whistfell Abbey and the Quiet Deep (not the boss fight — that is `boss`).
**Key** D minor · **Time** 4/4 · **Tempo** ♩= 60 · **Form** 16 bars → loop.
**Melody:** the **Battle A melody** (T10) played at a third of its speed — every duration ×2.6, rounded to the
nearest quarter — on `organ` 8′ alone, `p`. The villain's theme is your battle theme, ruined.
**Under it:** `pad` holding `D3/A3`, `ppp`; a single `timp` D2 toll, `pp`, on beat 1 of every second bar. The
stolen Bellhollow bell is that toll: raise it by 1.5 dB per floor you climb (WORLD-BIBLE §2 [16]).

---

### T20 · FINALE — *"Welcome Home"* · `id: 'finale'` (the ending, B27; plays once, then loops the last section)
1. **Family B** (T14 B, G major) on full `strings`, `mf`, with **the lullaby (T16) as a countermelody** on
   `flute` an octave up — both are three beats to the bar, so the lullaby's values fit unchanged at ♩= 60.
2. **Family A′** with the solo horn answering (the father's voice), `mp`.
3. A one-bar `rit.` and a held `D` from `horns`, then the **`village` A melody in full brass** (T2 melody
   transposed to D major and re-barred into 4/4 by the ×4/3 rule in T17), `ff`, with `timp` and a cymbal on the downbeat — the
   sky shot, "Welcome home". Loops sections 1–2 under the credits scroll.

---

### T21 · SILENCE · `id: 'silence'`
A real cue that plays **nothing**: every music bus gain to 0 over 0.12 s, ambience off, and the mixer must not
"helpfully" fade anything else in. Used at B9 (eleven seconds after Mortmain's first word), under the Stone
Garden chipping (B20), and for the ten seconds after Mortmain Enfolded kneels (B25). It is replaced only by an
explicit `Music.play`.


---

## 4. The hummability rule

The reason a child hums a DQ overworld theme after one hearing is not orchestration. It is that the melody
behaves like a **nursery rhyme wearing armour**. Nine laws. Every A section above obeys all nine, and a builder
adding a theme must check it against this list before shipping.

1. **Range under a tenth.** From lowest to highest note of a phrase, no more than 10 scale steps. A child's
   voice cannot follow more, and what you cannot sing, you cannot remember. (Overworld A: `A4`–`B5`, a ninth.)
2. **One leap, early, then walk.** Exactly one interval bigger than a third per phrase, and it lands in the
   first two bars. Everything after it is stepwise. The leap is the hook; the steps are the handrail.
   (Overworld bar 1: the fourth `A4→D5`. Family bar 1: the fourth `B4→E5`.)
3. **Breathe every two bars.** A rest, a held note, or a long note on every second bar boundary. If a child
   cannot take a breath there, the phrase is too long. (Overworld bar 4 `E5` held 3 beats; Village bar 4 rest.)
4. **Land on the tonic on a strong beat within eight bars.** Ambiguity is for grown-ups. Every A section here
   ends on degree 1 on beat 1.
5. **Sequence and answer.** Bars 5–8 restate bars 1–4 a step or third away, then close differently. The brain
   files the second hearing as *confirmation*, and confirmation is memory. (Overworld: bars 5–8 are bars 1–4
   moved up a step and re-cadenced.)
6. **One rhythmic signature, three or four notes long, used at least three times.** Overworld: `♩♩♩♩` bar 1
   then `𝅗𝅥♩♩` bar 2 — that pair recurs in bars 5–6 and in the Victory fanfare. The Village's `♪♪♪♩.` opens
   three of its four sections.
7. **Singable when dropped an octave.** Transpose the tune down 12 semitones: if it does not sit inside
   **D4–E5**, a seven-year-old cannot sing it. Test every melody this way. All of the above pass.
8. **Nothing shorter than an eighth in the tune.** Sixteenths belong to the accompaniment and the drums.
   The tune must be slow enough to *follow with your mouth*.
9. **The same cell everywhere.** The Hearth Cell (§3.0) appears in the first two bars of eight of these
   fourteen themes, in major, minor, inverted and augmented. Fourteen themes then feel like one score.

**The test:** play the A section once to a person, wait sixty seconds, ask them to hum it. If they get the
first four notes and the shape of the rest, it ships. If they get nothing, law 1, 2 or 7 has been broken.

---

## 5. Transitions, ducking, stingers and cutoffs

All fades are **equal-power** (`gain = cos(x·π/2)` out, `sin(x·π/2)` in) on the two themes' bus gains, using
`setValueCurveAtTime` with a 64-point curve. Linear crossfades sag in the middle and sound like a mistake.

| Event | Behaviour |
|---|---|
| **Field → field, same music id** | Nothing. The theme keeps playing across the map load. This is what "no load screens" means for the ears. |
| **Field → town / town → field** | 0.9 s equal-power crossfade, started **on the transition wipe's midpoint**, not on the map load. |
| **Outdoor → interior (door)** | 0.35 s crossfade + the outdoor theme's reverb send is ramped 0.30 → 0.55 over 0.2 s as it leaves (it goes "away"). |
| **Any → church** | 1.4 s crossfade. The organ needs time to arrive. |
| **Any → family theme (story beat)** | Old theme fades out over 1.2 s, **0.6 s of true silence**, then the oboe enters alone. The silence is the whole effect. Never crossfade into grief. |
| **Any → tension** | 0.25 s fade of the old theme under a single timpani `pp` roll; tension starts on the next beat. |
| **Battle start** | See stinger below. |
| **Battle → field (after victory)** | Victory fanfare completes → 0.5 s silence → field theme fades in over 1.2 s, **starting at bar 1**, not where it left off. |
| **Battle → field (fled)** | Battle theme cut over 0.30 s; field theme in over 0.8 s, resuming from its current loop position. |
| **Defeat** (never called "game over") | Battle theme cut over 0.4 s, 1.0 s silence, then `family.short`, once, `pp`, over a soft white fade; the church theme when you wake. |
| **Dialogue open** | `Music.duck(0.55)` — ramp over 0.12 s. Restore to 1.0 over 0.40 s on `dialogue.end`. |
| **Cutscene with important lines** | `Music.duck(0.35)`, and additionally lowpass the music bus at 2.2 kHz (Q 0.5) so speech-rate text ticks read clearly over it. Restore both over 0.5 s. |
| **Menu open** | Duck to 0.80 only. The player should still enjoy the music while shopping. |
| **Inn sleep** | Theme fades over 0.6 s → sleep cue → 1.2 s silence → town theme from bar 1 at full. |

### 5.1 The battle-start stinger (`sfx.battleStart`, 0.55 s)
This fires **at the same frame** the swirl transition starts. Exact recipe:

1. `t+0.00` — Cymbal `crash` at `ff`, and a timpani D2 32nd-note roll at `mf` rising to `ff`.
2. `t+0.00` — Horn section plays a three-chord rising stab, each **0.16 s**, staccato (override R to 0.06):
   `Bb4/D5/F5` → `B4/D#5/F#5` → `C5/E5/G5`. A whole-tone shove upward; deliberately unresolved.
3. `t+0.00` — The field theme's bus gain drops to 0 over **0.06 s**. Its reverb tail is *not* cut, so the town
   you just left is still ringing while the swirl spins. This is the detail that sells continuity.
4. `t+0.48` — one `twinkle` arpeggio burst, `mp`, on `D5/F5/A5`, 60 fps retrigger, 0.12 s. The wink.
5. `t+0.55` — Battle theme begins **exactly on its Intro bar 1 downbeat**, at full `f`. Never fade a battle in.

The battle theme must therefore be pre-warmed: build its voice objects when `battle.start` is emitted but
schedule the first note at `ctx.currentTime + 0.55`.

### 5.2 The victory cutoff
The moment the last enemy's HP hits 0 and the pop animation begins:
- Battle theme bus gain → **0 over 0.06 s** (a hard, confident cut — not a fade; a fade sounds like a mistake).
- Reverb send tail continues (do not disconnect the convolver).
- **0.25 s of silence.**
- Victory fanfare, from bar 1, `ff`. The EXP/gold window slides in on bar 2's downbeat, and each number tallies
  at one digit per 60 ms with a `twinkle` tick.
- Order is canon (SYSTEMS §10.1, MONSTER §7): **fanfare → EXP/gold tally → a monster asks to join (`befriend`)
  → level-ups**. The `befriend` fanfare starts 0.4 s after the tally window closes; each level-up jingle starts
  **0.35 s after the previous fanfare's reverb tail is inaudible** (i.e. its end + 1.2 s). Ceremony is serial.
  Never stack two fanfares.

### 5.3 Seamless looping, mechanically
Never use `AudioBufferSourceNode.loop` or an `ended` event. A theme is a beat-clock:
```
loopLengthBeats = bars * beatsPerBar
themeStartTime  = ctx.currentTime + 0.1
nextBeatToSchedule = 0
every 25 ms: while (beatTime(nextBeatToSchedule) < ctx.currentTime + 0.15) {
   scheduleEventsAtBeat(nextBeatToSchedule % loopLengthBeats)
   nextBeatToSchedule++
}
beatTime(b) = themeStartTime + b * 60/bpm
```
Because the beat counter never resets, there is no arithmetic seam and no drift, and any note whose release or
reverb tail crosses the loop point simply keeps ringing into the next iteration. **That overlap is the loop.**
Tempo changes (rit.) are done by making `beatTime` a lookup into a cumulative-time table, never by mutating bpm
mid-flight.

### 5.4 Budget and failure
- Max 24 concurrent voices (`high`), 14 (`low`); voice stealing is oldest-and-quietest first.
- Scheduling work per pump must stay under 1 ms. If `ctx.baseLatency` suggests trouble, drop to `low`: no
  convolver (FDN), section voices lose one oscillator each, no `pad`, harp arpeggios halve in density.
- Every scheduling call is wrapped; a thrown error pushes to `__DQ.errors` and **mutes only that track**, never
  the music system. Silence is a failure state in this game — `__DQ.state()` exposes
  `audio: {theme, bar, beat, voices, ducked, ctxState}` so a critic can prove the score is running.
