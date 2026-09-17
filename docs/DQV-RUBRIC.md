# The Standard — Dragon Quest V (PlayStation 2, 2004)
**Read this before you build anything and before you judge anything. This is the bar. Not "a nice browser RPG".
The bar is: a child sits down, and within ninety seconds they feel the same warmth, curiosity and wonder that
DQV PS2 gives them.**

## What the reference actually is
*Dragon Quest V: Hand of the Heavenly Bride*, PS2 remake (ArtePiazza, 2004). Fully 3D, cel-shaded, free-rotating
camera. Akira Toriyama character design. Koichi Sugiyama symphonic score. It is the most *tender* game in the
series: you play a boy travelling with his father, then a young man, then a husband and father yourself. Its
signature mechanic is befriending monsters, who hop along behind you and ride in your wagon.
(Where wording/voice is concerned the target is the celebrated English localization of the same story: warm,
witty, gently British, every monster punningly named, every NPC with a personality in two lines.)

## The eight feelings — the whole rubric
A piece is only finished when it serves at least one of these, and breaks none of them.

1. **WARMTH.** Sunlight on grass. Round shapes. Nobody is spiky. The world seems fond of you.
2. **DISCOVERY.** Every pot, barrel, drawer, wardrobe and bookshelf can be searched, and enough of them hold
   something that searching stays worth it. Paths curve so you cannot see everything at once.
3. **CHARM.** Every NPC is a person in two lines. Jokes land. Names are puns. Animals wander. A child laughs.
4. **WEIGHT.** Menus land with a *thunk*. Hits connect. The screen shakes. Text arrives at reading pace with a
   sound per glyph. Nothing is floaty, nothing is instant.
5. **CEREMONY.** Level-ups, chests, new spells, monsters joining, and arriving somewhere new all get a *moment*:
   a fanfare, a pause, a camera beat. The game celebrates you.
6. **CONTINUITY.** No load screens that break the spell. Transitions wipe, swirl or fade with intent. Music
   crossfades. You are never dumped anywhere.
7. **HEART.** The story is about a family. Characters remember. NPCs change what they say as the story turns.
   At least one moment should make a grown-up's throat tighten.
8. **CLARITY.** A six-year-old always knows where to go, what a button does, and that they cannot get stuck.

## Dimension checklists (the harsh version)

### Visual
- [ ] Cel/toon banding with a warm key and cool fill — **not** default Lambert/Phong grey.
- [ ] Silhouettes readable at 30% zoom. Big heads, round bodies, no thin spindly limbs.
- [ ] The ground is never a flat plane. Rolling height, varied grass tone, worn dirt paths that *lead* somewhere.
- [ ] Sky is a real sky: gradient, big soft clouds that drift, a sun that casts a direction.
- [ ] Contact shadows under everything that stands. No object floats.
- [ ] Colour is saturated and warm but never neon. Greens are grass-green, not lime.
- [ ] Depth: fog/haze on far geometry, layered hills behind the playable area.
- [ ] Nothing z-fights, nothing pops in, no visible seams between tiles.

### Motion
- [ ] Idle animation on **every** living thing — breathing, blinking, a tail flick. Nothing is a statue.
- [ ] Walk cycles with weight transfer and arm swing; run is a different cycle, not the same one faster.
- [ ] Turning is animated, not instant snapping.
- [ ] Camera springs, never teleports; it eases behind the player without fighting them.
- [ ] Everything that appears/disappears animates in and out.

### Interface
- [ ] The DQ command window: deep blue gradient fill, thick white/pale border with an inner line, soft drop
      shadow, rounded corners. Opens with a quick scale/slide, closes the same way.
- [ ] Cursor is a chunky arrow/hand that *moves* between entries with a blip sound.
- [ ] Text types out at ~30-45 glyphs/sec with a per-glyph tick, "▼" to continue, and never overflows.
- [ ] Font is chunky and warm, generously spaced, high contrast, big enough for a child across a room.
- [ ] Every menu can be left with cancel. Nothing traps you.

### World & discovery
- [ ] Towns have a real plan: a square, a well, an inn with a sign, a church, a shop, houses with interiors.
- [ ] Interiors are furnished — beds, tables, pots, barrels, bookshelves, a cat.
- [ ] Searchable containers everywhere; ~1 in 4 rewards you; the rest have a funny line.
- [ ] Chests: opening animation, item held aloft, fanfare, "You found X!" in the window.
- [ ] NPCs move, face you when spoken to, and say different things after story flags flip.

### Battle
- [ ] Classic DQ framing: monsters facing you on a backdrop matched to the terrain, command window bottom-left.
- [ ] Monsters idle-bounce and animate on attack, flinch on hit, and disappear with a satisfying pop.
- [ ] Damage numbers pop with weight. Screen shake on crits. Flash on hit.
- [ ] Spells have distinct, readable VFX with sound.
- [ ] Victory: fanfare, EXP/gold tally, level-up jingle, and — the signature — **monsters asking to join you.**
- [ ] You cannot lose by accident; defeat is gentle (wake up at the church, half gold), never a wall.

### Sound
- [ ] Music at all times, no silence. Themes are hummable and loop seamlessly.
- [ ] Distinct themes: overworld (pomp, brass), town (gentle, pastoral), castle, dungeon (tense, sparse),
      battle (driving), victory fanfare, sad/family theme, title.
- [ ] SFX for: cursor move, confirm, cancel, footstep, door, chest, sword hit, spell cast, heal, monster cry,
      level up, item get, text glyph.
- [ ] Nothing is louder than the music by accident; there is a mixer.

### Story & voice
- [ ] The generational arc is present and readable by a child: boy → man → father.
- [ ] Companions have voices you can tell apart with the name hidden.
- [ ] At least three moments of real feeling, and at least ten genuine laughs.
- [ ] No filler dialogue. If an NPC has nothing to say, they say something *funny* about having nothing to say.

## Blind A/B protocol — how a critic decides
You will be shown screenshots and a state dump from **the running build**. You know DQV PS2. For the matched
moment (title / town at midday / interior / overworld / battle opening / level-up / monster joining / dialogue):

1. Write, from memory and in concrete visual detail, what the DQV PS2 frame of that same moment looks like:
   composition, palette, what fills the frame, what the UI is doing, what you can hear.
2. Look at **our** frame. Describe it just as concretely, with no charity and no credit for effort.
3. Label them A and B without regard to which is which, and answer: **which is more magical and inviting to a
   ten-year-old, and why?** One paragraph. Then reveal.
4. If ours loses — and it will, at first — name **the single biggest gap**: one specific, buildable change that
   would close the most distance. Not a list. The one thing.
5. Score 0-100 where **85 = a child could not tell which was the commercial game**. Be stingy. 60 is
   "competent browser game". 70 is "genuinely nice". 80 is "someone loved this". Above 85 you must be able to
   defend it against a person who has DQV PS2 running on the other monitor.

**Rules for critics:** never read the builder's summary — only the running build. Never give credit for
intent, effort, comments, or code quality. If a screenshot is a black or empty frame, the score is 0.
If you cannot reach the thing you were asked to judge, the score is 0 and the gap is "it is not reachable".

## ★ Owner-approved look — LOCKED (2026-09-17)
The owner looked at the running build and said the visuals and the UI are **much more beautiful than the
original DQV PS2 — keep it exactly like this.** Reference frames: `docs/approved/*.png`
(field-opening, dialogue, menu-nested, cottage-materials, hero-close).

What this changes for everyone:
- **This style is the floor, not a draft.** Warm toon shading, painterly grass, chunky outlined trees, big soft
  clouds, the glossy blue gradient windows with pale double border, the chunky white type with gold highlights.
- **Builders:** never regress toward PS2-era limitations (lower detail, flatter lighting, plainer windows) to
  "match the original". Any visual change must come out at least as beautiful as `docs/approved/`. New art
  (towns, interiors, monsters, battle) must be made *in this style*. Before/after screenshots are mandatory
  for any change that touches how the game looks.
- **Critics:** do NOT score down for being prettier, more detailed or more modern than PS2. The blind A/B is
  about *magic, warmth, charm, discovery and feel* — DQV's soul — delivered at this higher visual fidelity.
  A change that makes a frame less beautiful than the approved references is a regression and scores lower.

## ★ The gap ledger — how iteration must work from 2026-09-18
Scores were oscillating (62→67→66, 50→66→65→64) because every fresh critic named a *different* biggest gap and
nobody re-checked the last one. That is whack-a-mole, not progress. From now on:

**Critics, in this order:**
1. `node tools/gaps.mjs list <PIECE>` — read every gap ever named for this piece.
2. **Re-check every gap not yet `verified-fixed`, by measurement, in the running build.** Record each:
   `node tools/gaps.mjs verify <PIECE> <n> pass|fail "what you measured"`.
   A gap a builder marked `claimed-fixed` that is NOT actually fixed is the most important thing you can find.
3. Only then look for new problems, and open the biggest as a new gap:
   `node tools/gaps.mjs open <PIECE> "short title" "full buildable description"`.
4. Score the piece. **A piece cannot score above 80 while any gap is still open or unverified.** Regressions
   (a `verified-fixed` gap that came back) cap the score at 65 and must be reported as the biggest gap.
5. Keep your StructuredOutput valid JSON: biggestGap under ~1200 chars, blindAB under ~800, at most 6 short
   evidence strings, no backticks or nested quotes.

**Builders, in this order:**
1. `node tools/gaps.mjs list <PIECE>` — you are responsible for EVERY open gap, not only the newest one.
2. Fix the newest biggest gap first, then close as many older open gaps as you can in the same pass.
3. For each one you close: `node tools/gaps.mjs fixed <PIECE> <n> "how you verified it, with numbers"`.
4. Never regress a `verified-fixed` gap. Re-measure the old ones before you finish.
