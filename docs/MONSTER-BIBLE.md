# THE MONSTER BIBLE
**Owner: P16 (roster & models) + P17 (recruitment).** Reads as law for `src/data/monsters.js`, `src/art/monsters.js`,
`src/battle/recruit.js`. Serves rubric feelings **CHARM**, **CEREMONY**, **WARMTH**, **DISCOVERY**.

Thirty-eight monsters. Every one is round. Every one has a joke in it. Every one can be built from primitives
and lathes with no image files, and every one must be buildable from the paragraph marked **BUILD** alone.

**Canon.** Names, places, Acts and flags follow `docs/CANON.md`. A monster's `Lv` below is its **danger rank**,
not the party's level — each tier header gives the party level and Act where it is met. The mascot is the
**Gloop**; the first monster friend, **Bobble**, is a Gloop; the designed favourite is **Cactuddle** (§8).
Story creatures that are not in the wild roster (Quietlings, the Sunmane, Mumbleroot, the Tidewarden, Hoarfax,
Hush & Hark) are in §6b.

---

## 0. THE CONSTRUCTION KIT (read before any BUILD paragraph)

All monsters are a `THREE.Group` whose origin is **ground contact**, facing `+Z` (toward the battle camera).
Reference scale: the hero is **1.6 units** tall. A Gloop is **0.62** wide. Nothing is spiky; every silhouette
must be readable as a filled black shape at 30% zoom.

**Material.** `Toon.mat(hex, {bands:3, rim:0.15})` — three flat light bands, warm key, cool sky fill.
Never a hex outside `src/art/palette.js` (proposed additions in §8).

**Outline.** Every monster gets an inverted-hull shell: same geometry, `side: THREE.BackSide`,
vertices pushed 0.035 along the normal, colour = body colour multiplied by 0.45. Bosses use 0.055.

**Eye rig** — `Kit.eyes({r, gap, tilt, bulge})`. This is 80% of the charm; get it exact.
- *Sclera*: `SphereGeometry(r, 16, 12)` scaled `(1, 1.12, 0.6)`, pure `#FFFFFF`, unlit-ish (bands:1). It is
  **pushed into** the body so ~62% protrudes — the bulge is the whole point.
- *Pupil*: `SphereGeometry(r*0.46, 12, 10)` in `#1B1A22`, parented to the sclera, pushed forward to `z = r*0.55`.
  Pupils **converge** slightly (toe-in 6°) so the monster always looks at *you*, not past you.
- *Highlight*: `SphereGeometry(r*0.15)` pure white, `MeshBasicMaterial`, at 40° up-and-left on the pupil,
  billboarded to camera every frame. Without this the monster looks dead. With it, it looks delighted.
- *Blink*: sclera `scale.y` 1 → 0.06 → 1 over 120 ms, both eyes, random interval 2.5–5.0 s.
  Comic monsters (Jinglebottom, Mirthquake, Chestnut) blink one eye alone 20% of the time.
- `tilt` rotates the eye pair inward (angry: +14°) or outward (sad/dopey: −10°). This is the only "expression"
  dial most monsters need.

**Mouth.** A `THREE.Shape` swept with `ExtrudeGeometry {depth: 0.02, bevelEnabled: true, bevelSize: 0.008}`,
laid flush on the body surface, colour `#2A1E24`. Three stock shapes, all built from two quadratic curves:
- `Kit.mouthGrin(w, h)` — the Gloop smile: upper curve flat, lower curve bulging down. The default.
- `Kit.mouthOh(r)` — a squashed circle, used for surprise and for the recruit "!" beat.
- `Kit.mouthFang(w, h, n)` — grin plus `n` small `ConeGeometry(0.02, 0.05, 4)` teeth pointing down from the
  upper lip. Never more than four teeth; four is funny, eight is frightening.

**Contact shadow.** `Art.shadowDisc()` — a flat disc at `y = 0.01`, `MeshBasicMaterial`, black, opacity 0.28,
radius = 0.9 × body half-width. It **scales with the hop**: `s = 1 − 0.38 × (hopHeight / hopMax)`. Nothing floats.

**Idle bounce** (default, unless the entry overrides): the body hops with
`y = A · |sin(π·t/P)|`, `A = 0.11 × height`, `P = 1.15 s`, with squash-and-stretch:
apex `scale(0.97, 1.06, 0.97)`, ground-contact `scale(1.09, 0.88, 1.09)` eased over 70 ms.
A monster that only translates and does not squash looks like a bug, not a creature.

**Lunge** (default attack, five phases, 750 ms total):
1. **Anticipate** 140 ms — slide back 0.25 u, squash `(1.12, 0.90, 1.12)`, eyes tilt +14°.
2. **Launch** 110 ms — travel 70% of the gap to the target, `easeOutCubic`, stretch `(0.90, 1.15, 0.90)`
   and lean 18° into the direction of travel.
3. **Impact** — hard stop on frame 1. Target flashes white 60 ms, screen shake 0.12 u for 90 ms,
   damage number pops. **WEIGHT**: never ease through the impact.
4. **Recover** 180 ms — overshoot back 0.08 u, wobble.
5. **Return** 220 ms — `easeInOutQuad` home, land with one small squash.

**Flinch on hit.** Knock back 0.12 u, roll 6°, tint 80% white for 90 ms, one extra squash cycle.

**Death animation library** — every entry names one:
- **POP** — inflate to 1.25 over 90 ms, then vanish; spawn 8 flat quads of body colour flying outward on
  gravity, fading over 400 ms. The DQ standard.
- **DEFLATE** — squash to `(1.4, 0.05, 1.4)` over 260 ms with a descending whistle, then POP small.
- **FOLD** — flatten on one axis and spin away out of frame like a dropped card (280 ms).
- **WISP** — body dissolves upward: 12 small spheres detach and drift up, shrinking, over 600 ms.
- **CRUMBLE** — the body separates into its own construction primitives which fall and shrink (420 ms).
- **SNAP** — hinged parts slam closed once, hold 200 ms, then POP.
- **TOPPLE** — rotate 82° about the ground-contact edge over 380 ms, land with a thud and a dust ring, then POP.
- **UNWIND** — for anything on a spiral: spin up, shrink to a point, sparkle.

**Stat block key.** `Lv · HP · MP · ATK · DEF · AGI · EXP · Gold · Recruit`.
Recruit is the base chance rolled once per battle in which the monster was defeated (see §7).

---

## 1. TIER ONE — Puddlewick Vale, the Long Lane, the Beck (danger rank 1–5 · party Lv 1–5 · Act I)
*Encounter rate 1 step in 26. Nothing here can kill a child who is paying no attention.*

### 1. GLOOP — the one everybody loves
`Lv2 · HP 9 · MP 0 · ATK 10 · DEF 6 · AGI 5 · EXP 3 · Gold 3 · Recruit 1/8`
**Where** Everywhere, forever, at every tier, always politely a little too weak.
**Does** *Squelch* (headbutt, standard lunge).
**Is** Cheerful, slightly damp, has never had a bad idea because it has never had an idea.
**Bobble** (the story's first monster friend, B3) is this build plus a monocle: a `TorusGeometry(0.035, 0.006)`
rim with a `CircleGeometry(0.035)` lens at 20% opacity over the right eye, on a thin gold chain that swings;
every ~8 s it falls off and he catches it on the next hop.
**Idle** Standard hop, but every fourth hop it hops *sideways* by 0.1 u and has to hop back, embarrassed.
**Death** POP.
**Build** One `LatheGeometry` and nothing else. Profile points, rotated 24 segments:
`(0,0) (0.30,0) (0.31,0.10) (0.28,0.24) (0.20,0.36) (0.10,0.44) (0.035,0.50) (0,0.52)` — a teardrop with a
slight belly overhang, 0.62 wide, 0.52 tall. Colour `M_GLOOP` `#4C86D8`. Eyes `r 0.075, gap 0.135, tilt 0`,
placed at `y 0.30, z 0.24`. `Kit.mouthGrin(0.16, 0.055)` at `y 0.20`. No limbs. The tip of the teardrop
**lags**: rotate the top 30% of the lathe by `−6° · velocity` so the point whips when it hops. That whip is
the single detail that makes Gloop alive.

### 2. BLOOP
`Lv3 · HP 14 · MP 6 · ATK 8 · DEF 8 · AGI 7 · EXP 5 · Gold 4 · Recruit 1/10`
**Where** The Beck, meadow flowers, later in every healing-themed dungeon.
**Does** *Mend* (heals an ally 20 HP), *Squelch*.
**Is** A worrier. Heals things that are not hurt. Heals you mid-sentence.
**Idle** Hop, then a small fretful shiver every 3 s (rotate ±3° at 14 Hz for 200 ms).
**Death** DEFLATE — and it apologises, tiny text bubble: *"Sorry!"*
**BUILD** Gloop lathe scaled `(1.02, 0.94, 1.02)`, colour `M_BLOOP` `#E88BB4`. Add a **hat**: a torus-section
lathe like a nurse's cap — profile `(0.14,0) (0.20,0.02) (0.19,0.09) (0.13,0.10)` in `#FFF6EF`, sat at `y 0.44`,
tilted 8°. Eyes larger and dopier: `r 0.085, gap 0.15, tilt −10°`. Mouth a tiny grin, 0.10 wide, offset 0.02
left of centre — the crookedness is the character.

### 3. FLAPJACK — the bat
`Lv2 · HP 11 · MP 0 · ATK 12 · DEF 5 · AGI 20 · EXP 4 · Gold 5 · Recruit 1/12`
**Where** The Long Lane at dusk, every cave in the game, and the rafters of the church (non-hostile cameo).
**Does** *Flittersmack* (fast lunge, two hits of half damage).
**Is** A pancake with ambition. Loves you immediately. Has no plan for what comes after that.
**Idle** Hovers at `y 0.55 + 0.06·sin(2πt/0.9)`; wings flap at 4.2 Hz; every 5 s it does one full barrel roll,
because it can.
**Death** FOLD — it folds into a perfect pancake and flips away like a tossed crêpe. Kids will ask for this
to happen again.
**BUILD** Body: `SphereGeometry(0.20, 16, 12)` scaled `(1, 0.72, 0.9)` in `M_BAT` `#7B5FA8`. Ears: two
`ConeGeometry(0.055, 0.14, 4)` rotated out 22°, at `y 0.16`. Wings: `ExtrudeGeometry` of a `Shape` — a scallop
of three arcs (span 0.30, chord 0.22), depth 0.015, in `#5A4480`, hinged at the shoulder and rotated on Z
±34° with a 0.08 phase offset between them so the flap is never symmetrical. Eyes `r 0.07, gap 0.10`,
huge relative to head. `Kit.mouthFang(0.09, 0.03, 2)`. Feet: two `SphereGeometry(0.03)` dangling.

### 4. PECKISH — the first bird
`Lv1 · HP 7 · MP 0 · ATK 9 · DEF 4 · AGI 12 · EXP 2 · Gold 2 · Recruit 1/6`
**Where** Puddlewick meadows, the henhouse, the whole first hour.
**Does** *Peck*.
**Is** A round chick that is 40% beak and 100% certain it is enormous.
**Idle** Hops on the spot; the beak's weight tips it forward 12° on landing and it corrects with a wing flap.
**Death** POP, leaving one drifting feather quad that lands slowly. **Always** the feather.
**BUILD** Body `SphereGeometry(0.19, 16, 12)` in `M_CHICK` `#F5D467`, no neck. Beak: `ConeGeometry(0.08, 0.20, 4)`
rotated so a flat face is up, in `M_BEAK` `#E8913C`, hinged at `z 0.15` — the top half and bottom half are
separate cones that open 18° when it pecks. Feet: two `CylinderGeometry(0.012, 0.012, 0.07)` plus three
0.04 toe cylinders each, `#E8913C`. Wings: two `SphereGeometry(0.08)` scaled `(0.35, 0.9, 1)`. Eyes
`r 0.055, gap 0.115` set **above** the beak line so it looks up at you.

### 5. GRUMPLEROOT — the plant
`Lv3 · HP 16 · MP 0 · ATK 13 · DEF 11 · AGI 3 · EXP 6 · Gold 4 · Recruit 1/14`
**Where** Turnip fields, hedgerows, anywhere a farmer complains.
**Does** *Root Wallop*, *Grumble* (lowers one hero's ATK 15% for 3 turns).
**Is** A vegetable with a grievance. The grievance is being a vegetable.
**Idle** Does not hop. Sinks 0.04 and rises, breathing; leaves rustle at 1.6 Hz; scowl deepens over 4 s then resets.
**Death** TOPPLE, and on landing it says *"…typical."*
**BUILD** Body: `LatheGeometry`, profile `(0,0) (0.22,0.06) (0.24,0.20) (0.16,0.34) (0.05,0.42) (0,0.44)` —
a turnip, colour `M_ROOT` `#EFE3D0` with the bottom 40% lerped to `#C9A5D8`. Leaves: three `ExtrudeGeometry`
lozenges (length 0.26, width 0.10, depth 0.01) in `M_LEAF` `#5FA544`, splayed from the crown at 30°, each
bent by pre-curving the shape. Legs: two stubby `CapsuleGeometry(0.035, 0.06)` roots. Eyes `r 0.06, gap 0.12,
tilt +14°` with **eyebrows**: two extruded wedges in `#8A6A4A` angled down-inward 22°. Mouth a *downward*
grin — pass a negative `h` to `Kit.mouthGrin`.

### 6. TOADSTOOLIGAN — the mushroom
`Lv4 · HP 18 · MP 4 · ATK 14 · DEF 9 · AGI 8 · EXP 7 · Gold 6 · Recruit 1/12`
**Where** The Whispering Wood's edge, damp corners, under the inn's floorboards.
**Does** *Cap Bonk*, *Spore Snooze* (sleep, 35%).
**Is** A small hooligan in a big hat. Absolutely will nick your lunch.
**Idle** Cap rotates ±10° on Y at 0.5 Hz like a shifty look-around; hops half-height.
**Death** POP into a puff of 14 slow spore quads that hang, then fade.
**BUILD** Cap: `SphereGeometry(0.26, 18, 10, 0, π*2, 0, π*0.52)` (a dome) in `M_CAP` `#D3524C`, with **spots**:
six `CircleGeometry(0.045)` in `#FFF6EF` placed on the dome surface with normals aligned — geometry, not texture.
Stem: `CylinderGeometry(0.10, 0.13, 0.26)` in `#F2E7D5`. Cap sits at `y 0.26` and is a separate child so it
can rotate. Eyes on the *stem*, `r 0.065, gap 0.12, tilt +10°`, half-shadowed by the cap.
`Kit.mouthFang(0.11, 0.04, 2)` with the fangs pointing *up* from the lower lip. Two tiny arm capsules
(`CapsuleGeometry(0.025, 0.08)`) that it folds when idle and swings on attack.

### 7. BUMBLEBLUNDER
`Lv3 · HP 12 · MP 0 · ATK 15 · DEF 6 · AGI 18 · EXP 6 · Gold 5 · Recruit 1/16`
**Where** Meadow flowers, orchard.
**Does** *Blunder Charge* (may miss and hit itself for 3 — the joke is the mechanic).
**Is** Enormous, fuzzy, aerodynamically impossible, extremely apologetic about the stinging.
**Idle** Hovers unsteadily: `y = 0.5 + 0.05·sin(2πt/0.7) + 0.02·sin(2πt/0.23)`, drifting ±0.08 on X.
**Death** DEFLATE with a descending kazoo buzz; drops one honeycomb.
**BUILD** Body: two stacked spheres, `SphereGeometry(0.16)` and `SphereGeometry(0.13)`, in alternating bands —
build the stripe as **separate geometry**: sphere segments `thetaStart/thetaLength` sliced into three bands,
`M_BEE_Y #F2C230` / `#3A3038` / `M_BEE_Y`. Wings: two `CircleGeometry(0.13, 12)` scaled `(1, 0.45, 1)`,
`MeshBasicMaterial` white, opacity 0.35, flapping at 18 Hz (visually a blur). Eyes `r 0.06, gap 0.11`.
Antennae: two `CylinderGeometry(0.006, 0.006, 0.10)` with a `SphereGeometry(0.02)` tip, wobbling with lag.

---

## 2. TIER TWO — the Whispering Wood, Saltmarrow Coast, Cobwell Manor, Coddleston Downs (danger rank 6–13 · party Lv 5–12 · Act I end, Act II start)

### 8. GRUMBLEGLOP
`Lv8 · HP 34 · MP 0 · ATK 26 · DEF 18 · AGI 9 · EXP 15 · Gold 12 · Recruit 1/16`
**Where** Marsh, sewer under the mill.
**Does** *Splat*, *Hiccup Bomb* (one hero hiccups: 25% chance to lose their turn for 2 turns. Kid-safe poison.)
**Is** In a mood. Has been in a mood since the marsh.
**Idle** Slow, heavy hops (P 1.6 s) with a wet landing squash to `scale.y 0.78`. Drips: one small sphere
detaches every 2 s and vanishes at ground.
**Death** DEFLATE into a puddle disc which then evaporates.
**BUILD** Gloop lathe scaled `(1.20, 0.86, 1.20)`, colour `M_GLOP` `#7E6B45`, with a **drip skirt**: append
four extra profile points below the widest ring so the base sags. Eyes `r 0.07, gap 0.16, tilt +16°`,
half-lidded — cover the top 35% of each sclera with a thin lathe cap in the body colour. Mouth wide, flat, unamused.

### 9. SIR GLOOPALOT — the knight (part one)
`Lv11 · HP 46 · MP 5 · ATK 38 · DEF 30 · AGI 14 · EXP 28 · Gold 24 · Recruit 1/32`
**Where** Whispering Wood crossroads, the tourney field, later everywhere as an escort.
**Does** *Lance Poke*, *Bolster* (raises own DEF 25%).
**Is** A very small, very serious knight riding a Gloop that is not listening.
**Idle** The Gloop hops on its own rhythm; the knight is **not** parented to the hop — he lags 90 ms behind
and has to re-seat himself with a small correction each landing. That desync is the whole gag.
**Death** The knight is flung off (a 400 ms parabola, lands with a clatter), then the Gloop POPs, then the
knight sits up in the empty space and *then* POPs.
**BUILD** Mount: a Gloop (see #1) at scale 1.15, colour `M_GLOOP_G` `#5FBF7E`. Rider, total 0.42 tall:
torso `CapsuleGeometry(0.09, 0.14)` in `M_STEEL` `#9AA7B8`; helm a `LatheGeometry` bucket —
`(0,0) (0.11,0) (0.115,0.13) (0.07,0.17) (0,0.18)` — with a **visor slot**: an extruded black bar
0.13 × 0.025 inset 0.01, and two `SphereGeometry(0.018)` glow dots in `#FFE9A8` inside it (that is the face;
no eyes needed). Plume: three flattened cones in `M_PLUME` `#D3524C` that trail with 120 ms lag.
Lance: `CylinderGeometry(0.012, 0.022, 0.46)` plus a `ConeGeometry(0.03, 0.07)` tip. Shield: an extruded
heater-shield `Shape`, 0.16 tall, with a raised boss `SphereGeometry(0.03)`.

### 10. BOOHOO — the ghost
`Lv9 · HP 30 · MP 12 · ATK 24 · DEF 4 (evade 0.04 — slippery, but SYSTEMS §1.4 caps misses: a child never misses twice in a row) · AGI 22 · EXP 22 · Gold 16 · Recruit 1/20`
**Where** Cobwell Manor, the Bellhollow Belfry, any interior after midnight.
**Does** *Cold Hands* (touch damage), *Snoozle* (sleep).
**Is** A ghost so sad about being a ghost that it keeps forgetting to be scary. Cries at nice things.
**Idle** Floats at `y 0.35 + 0.07·sin(2πt/2.2)`, opacity oscillating 0.62↔0.85. The hem ripples: a sine wave
travels along the skirt vertices at 0.8 Hz. Every 6 s, one teardrop sphere runs down and drops.
**Death** WISP, upward, with a small relieved sigh. **Never** a scream. A six-year-old is watching.
**BUILD** One `LatheGeometry` with a **wavy** bottom: profile `(0,0.62) (0.16,0.60) (0.21,0.42) (0.22,0.16)
(0.24,0.02) (0.20,0)`, then in code displace the bottom two rings by `0.03·sin(4θ)` to scallop the hem.
Colour `M_GHOST` `#DCE8F2`, `MeshToonMaterial` with `transparent:true, opacity 0.74, depthWrite:false`.
No outline shell (ghosts get a 0.02 rim glow instead). Arms: two `CapsuleGeometry(0.035, 0.14)` sleeves that
hang and swing with 200 ms lag. Eyes: **holes**, not spheres — two `CircleGeometry(0.055)` in `#2A3448`
placed 0.005 proud of the surface, and inside each a `SphereGeometry(0.02)` in `#9FD6FF` that drifts slowly.
Mouth: a small `Kit.mouthOh(0.05)` that never closes.

### 11. CHESTNUT — the mimic
`Lv12 · HP 52 · MP 0 · ATK 44 · DEF 34 · AGI 6 · EXP 40 · Gold 90 · Recruit 1/48`
**Where** Every dungeon. Roughly one chest in nine, and never the first chest a child ever opens.
**Does** *Chomp* (heavy), *Gold Gobble* (steals 1d20 gold and runs at 20%).
**Is** A treasure chest that is nuts, and knows it, and finds the whole business hilarious.
**Idle** Perfectly still — until spotted. The reveal: lid slams open 140 ms, tongue rolls out, then it settles
into a chattering idle where the lid clacks shut and open at 1.1 Hz, 22° of travel.
**Death** SNAP — the lid slams shut on itself, the chest hops once in surprise, then POP. Coins scatter.
**BUILD** Base: `BoxGeometry(0.46, 0.28, 0.34)` with bevelled edges (use a rounded-box: `ExtrudeGeometry` of a
rounded rect, `bevelSize 0.02`), in `M_WOOD` `#8A5A32`, plus three `BoxGeometry(0.48, 0.05, 0.03)` iron bands
in `M_IRON` `#5B5F6B`. Lid: a **half-cylinder** — `CylinderGeometry(0.17, 0.17, 0.46, 16, 1, false, 0, π)`
rotated on Z, hinged at the back edge. Lock plate: extruded shape in `M_GOLD` `#E3B23C` with a keyhole hole
(`Shape` with a `Path` hole — a circle plus a triangle). Mouth interior: paint the inner box faces `#5E2130`.
Teeth: eight `ConeGeometry(0.028, 0.07, 4)` alternating up from the base rim and down from the lid rim.
Tongue: `CapsuleGeometry(0.06, 0.20)` scaled `(1, 0.35, 1.4)` in `#E07A8E`, animated with two bend bones' worth
of vertex lerp. Eyes: `r 0.06, gap 0.20`, mounted on the **lid**, so they rise and fall as it chatters. Legs:
four `CapsuleGeometry(0.025, 0.07)` that only appear when it runs.

### 12. CRABBIT
`Lv7 · HP 28 · MP 0 · ATK 25 · DEF 22 · AGI 16 · EXP 14 · Gold 11 · Recruit 1/14`
**Where** Saltmarrow Coast, rock pools, the harbour steps.
**Does** *Pinch*, *Sand Kick* (lowers accuracy).
**Is** A crab with long soft ears. Sidles everywhere, including toward things it is trying to leave.
**Idle** Does not hop — it *sidles*: translate ±0.12 X over 1.4 s, ears trailing by 180 ms; claws open/close
at 0.7 Hz.
**Death** POP; the two ears fall off last and land separately, which is funnier than it should be.
**BUILD** Shell: `SphereGeometry(0.24, 16, 12)` scaled `(1.25, 0.62, 1)` in `M_CRAB` `#E2734A`, flat-topped by
clamping the top ring. Ears: two `CapsuleGeometry(0.035, 0.22)` in `#F2C8B0`, tapering, with 3-segment lag so
they flop. Claws: two `SphereGeometry(0.09)` scaled `(1, 0.7, 1.3)` split into two hinged halves, on
`CylinderGeometry(0.02, 0.02, 0.10)` arms. Legs: six `CylinderGeometry(0.012,0.012,0.09)` in two joints,
animated in a 3-phase alternating tripod. Eyes on **stalks**: `CylinderGeometry(0.014,0.014,0.09)` topped by
the standard eye rig at `r 0.05` — stalks wobble with 150 ms lag and cross when the crab is confused.

### 13. HOOT COUTURE
`Lv10 · HP 33 · MP 14 · ATK 28 · DEF 20 · AGI 24 · EXP 26 · Gold 30 · Recruit 1/24`
**Where** Whispering Wood canopy at dusk; sells nothing, judges everything.
**Does** *Whiffle* (wind damage, all), *Muddle* (confusion).
**Is** An owl in a small velvet cape who thinks your outfit is *fine, dear, for what it is.*
**Idle** Head rotates 140° to one side over 1.2 s, holds 0.8 s, snaps back in 120 ms. Body does not move.
Cape sways.
**Death** WISP with the cape falling to the ground last and folding neatly.
**BUILD** Body: `LatheGeometry` egg — `(0,0) (0.19,0.08) (0.21,0.24) (0.16,0.38) (0,0.44)` — in
`M_OWL` `#B08A5E`. Head is the **same mesh's** top third but a separate child group so it can rotate.
Face disc: `CircleGeometry(0.17, 20)` in `#E8DCC4` set 0.02 proud, with two `TorusGeometry(0.06, 0.012)` rings
around the eyes (spectacle effect). Ear tufts: two `ConeGeometry(0.035, 0.10, 4)`. Beak:
`ConeGeometry(0.04, 0.07, 4)` in `M_BEAK`. Cape: `ExtrudeGeometry` of a half-annulus `Shape`, depth 0.01,
`M_VELVET #6B3A6E`, with a `TorusGeometry(0.03,0.008)` gold clasp; the cape hem gets a 3-point verlet sway.
Eyes big, `r 0.085, gap 0.16, tilt −6°`, pupils *tiny* (0.30 ratio) — that is what makes it look supercilious.

### 14. BATTERFLY
`Lv9 · HP 26 · MP 8 · ATK 27 · DEF 14 · AGI 28 · EXP 20 · Gold 14 · Recruit 1/18`
**Where** Woods clearings, the flower road to the coast.
**Does** *Wing Batter* (two hits), *Dustup* (blinds one hero 2 turns).
**Is** A moth built like a boxer. Loves lamps more than it loves winning.
**Idle** Figure-eight hover (Lissajous: `x = 0.14·sin(2πt/2.4)`, `y = 0.55 + 0.06·sin(4πt/2.4)`); wings at 6 Hz.
**Death** FOLD, wings closing like a book.
**BUILD** Body: `CapsuleGeometry(0.06, 0.16)` fuzzy-looking via three stacked `SphereGeometry(0.075)` in
`M_MOTH #C8A96E`. Wings: four `ExtrudeGeometry` shapes — upper pair a rounded triangle span 0.30, lower pair
a scallop span 0.20 — depth 0.012, `M_MOTHWING #E4CFA8` with **eyespot** discs: `CircleGeometry(0.05)` in
`#3A3038` with a `CircleGeometry(0.025)` in `#E9A23B` on top. Antennae: two feathered combs built from a
central cylinder plus eight 0.02 cross-cylinders. Boxing detail: the two front legs end in
`SphereGeometry(0.045)` "gloves" in `M_GLOVE #D3524C`. Eyes `r 0.07, gap 0.11, tilt +8°`.

### 15. TWIGLET
`Lv6 · HP 24 · MP 0 · ATK 22 · DEF 24 · AGI 7 · EXP 12 · Gold 9 · Recruit 1/10`
**Where** Woods paths — always in a group of three, always pretending to be firewood.
**Does** *Whippy Branch*, *Stand Very Still* (skips turn, +100% DEF, 25% chance the party targets someone else).
**Is** A bundle of sticks that believes, sincerely, that you cannot see it.
**Idle** Absolutely rigid for 4 s, then one twig scratches its own back and it freezes again.
**Death** CRUMBLE into loose sticks that clatter.
**BUILD** Nine `CylinderGeometry(0.018, 0.024, 0.44)` in `M_BARK #6E5236`, arranged in a bundle with random
±8° tilts and ±0.03 offsets, bound by two `TorusGeometry(0.09, 0.012)` rings of `M_TWINE #C9B487`.
Legs: two sticks that separate from the bundle at the bottom. Eyes: `r 0.05, gap 0.10`, appearing **between**
two front twigs, half-occluded — the occlusion is the joke. Mouth: a horizontal gap between twigs; when it
speaks, one twig lifts.

---

## 3. TIER THREE — the Whistling Caves, Marbleford Downs, the Frittering Sands, the Sogglemarsh (danger rank 14–23 · party Lv 12–18 · Act II)

### 16. GLIMMERGLOOP — the rare one
`Lv16 · HP 5 · MP 0 · ATK 30 · DEF 240 · AGI 180 · EXP 1050 · Gold 90 · Recruit 1/128`
**Where** One in 96 encounters in Marbleford Downs and the deep Whistling Caves. Flees on turn 1, 75% of the time.
**Does** *Ping* (1 damage, always), *Scarper*.
**Is** Made of something better than you are. Not unkind about it. Simply busy.
**Idle** Hops fast and shallow (P 0.55 s), and **glints**: a specular band sweeps the body every 2.5 s.
**Death** UNWIND with a chime and a shower of sparks, and the EXP tally that follows should make a child shout.
**BUILD** The Gloop lathe at scale 0.9, `MeshToonMaterial` `M_GLIMMER #C9D3DC` with `bands: 2` and a hard
white band covering the top 25% — plus a `CircleGeometry(0.07)` pure-white "hotspot" billboarded on the
upper-left of the body, which slides across the surface as the camera moves. Eyes are **slits**: two extruded
lozenges `#1B1A22`, 0.09 × 0.02, tilted −8°. Mouth a single flat line. Nothing else. Restraint is the design.

### 17. CLANKWORTHY — the knight (part two)
`Lv18 · HP 88 · MP 0 · ATK 64 · DEF 58 · AGI 18 · EXP 70 · Gold 55 · Recruit 1/40`
**Where** Ruined watchtowers, the Whistling Caves' old guardroom, Whistfell Abbey's halls.
**Does** *Sword Swing*, *Clatterguard* (blocks the next physical hit entirely).
**Is** An empty suit of armour still doing the night watch. Nobody has told it. Nobody dares.
**Idle** Stands. Breathes anyway — the chestplate expands 0.015 at 0.25 Hz, which is unsettling and correct.
Every 7 s the helm swivels 25° and back with a small squeal.
**Death** CRUMBLE, piece by piece, top-down, ending with the helm rolling toward camera and stopping.
**BUILD** Entirely lathes and rounded boxes, nothing organic, 1.35 tall. Helm: `LatheGeometry`
`(0,0) (0.13,0.02) (0.14,0.14) (0.10,0.21) (0,0.22)`, plus an extruded visor slot and two `#FF9E5E` glow dots.
Pauldrons: two `SphereGeometry(0.14, 14, 8, 0, π*2, 0, π*0.5)` domes. Torso: rounded box
`0.30 × 0.34 × 0.22` with a raised extruded chest ridge. Arms/legs: `CapsuleGeometry(0.055, 0.16)` segments
with `SphereGeometry(0.06)` joints — **a visible gap of 0.02 at every joint** so you can see there is nothing
inside. All `M_STEEL #9AA7B8` with `M_STEELDARK #6A7484` in the recesses. Sword: extruded blade shape,
0.62 long, `M_BLADE #D9E2EC`. No eyes. No mouth. It is the only monster in the book with neither, and that
is why the glow dots must be perfect.

### 18. BOULDERDASH — the golem
`Lv21 · HP 140 · MP 0 · ATK 72 · DEF 66 · AGI 8 · EXP 95 · Gold 70 · Recruit 1/64`
**Where** Marbleford Downs scree, blocking the road; one specific Boulderdash blocks a bridge and must be
befriended, not beaten, to pass (see DISCOVERY).
**Does** *Rock Fall* (all party, heavy), *Sit Down Heavily* (skips turn, heals itself 20).
**Is** Enormous, slow, and hugely embarrassed about how much space it takes up.
**Idle** Does not hop. Rocks side to side 6° over 2.6 s. Small pebbles orbit slowly in the gap between torso
and hips (four `SphereGeometry(0.04)` on a lazy circular path — this reads as *magic* holding it together).
**Death** CRUMBLE completely, then a long beat, then the two eye-stones fall last and blink out.
**BUILD** 2.1 tall. Every piece is a `DodecahedronGeometry` or `IcosahedronGeometry` with `detail: 0` and
non-uniform scale, colour `M_STONE #8A8578` with mossy `M_MOSS #6E8F52` on upward faces (achieved by a
vertex-colour ramp on world-Y normal, not a texture). Torso: `Dodecahedron(0.55)` scaled `(1.2, 1, 0.9)`.
Head: `Icosahedron(0.26)` sunk into the shoulders — no neck. Arms: three stacked `Dodecahedron(0.20/0.17/0.22)`
per side with 0.04 gaps, ending in a fist `Dodecahedron(0.26)`. Legs: two short stacks. Eyes: two
`SphereGeometry(0.07)` in `M_GLOWSTONE #FFC46B`, `MeshBasicMaterial`, deep inside two carved sockets (boolean
not needed — just place two dark `CircleGeometry(0.10)` discs behind them). No mouth: it speaks by grinding,
and a single crack-line extruded on the head opens 0.03 when it does.

### 19. CACTUDDLE ★
`Lv17 · HP 76 · MP 0 · ATK 55 · DEF 40 · AGI 12 · EXP 58 · Gold 34 · Recruit 1/6 (the kindest odds at its tier)`
**Where** The Frittering Sands. Also, from Act I, one potted Cactuddle stands on the Puddlewick green
and can be talked to for the whole game, saying something different every Act.
**Does** *Cuddle* (heavy damage to one hero **and 8 damage to itself**, and it says sorry), *Sniffle*
(does nothing at all; 12% of turns).
**Is** A cactus that wants a hug more than it wants anything, and has never once managed one.
**Idle** Sways gently, arms open wide. Every 4 s it takes one hopeful step forward, then thinks better of it
and steps back. When at low HP it holds its own arms.
**Death** DEFLATE slowly with a small sad squeak, arms lowering last. Nobody in the room is fine.
**BUILD** Body: `LatheGeometry` barrel — `(0,0) (0.22,0.03) (0.25,0.24) (0.24,0.52) (0.18,0.62) (0,0.64)` —
then **ribbed**: displace vertices radially by `0.018·sin(10θ)` so it has twelve flutes. Colour
`M_CACTUS #6FA65A`, with the top third lerped to `#8FC46E`. Arms: two smaller lathes of the same profile at
0.45 scale, elbowed upward, attached at `y 0.34` — build each as two segments with a 24° bend so they read as
open arms, not spikes. Spines: 40 `ConeGeometry(0.008, 0.045, 4)` in `M_SPINE #E9DCC0` instanced along the
flute ridges — **soft-tipped**: round the tip by capping with a `SphereGeometry(0.008)`. Flower: a hat of
five `CircleGeometry(0.05)` petals in `M_FLOWER #E86FA0` at the crown, which **droops 20° when it is sad and
lifts when it is happy** — this one bone carries its whole emotional life. Eyes `r 0.085, gap 0.15, tilt −12°`
(the sad-hopeful tilt), pupils oversized at 0.55 ratio. Mouth a small wobbling grin, `w 0.09`.

### 20. DUNE BUGGY
`Lv19 · HP 96 · MP 6 · ATK 62 · DEF 52 · AGI 30 · EXP 72 · Gold 44 · Recruit 1/28`
**Where** The Frittering Sands, in threes, burrowing.
**Does** *Barge*, *Sandspray* (all, light), *Burrow* (untargetable one turn, then a surprise hit).
**Is** A beetle the size of a footstool with racing stripes it painted on itself.
**Idle** Legs cycle even standing still; shell lifts 0.02 and settles; a puff of sand at each foot.
**Death** TOPPLE onto its back, legs waving, then POP.
**BUILD** Shell: `SphereGeometry(0.34, 18, 12)` scaled `(1.1, 0.55, 1.35)` in `M_CHITIN #4A6E8A`, split down
the centre into two hinged elytra that pop open 30° when it burrows. Racing stripes: two extruded flat strips
in `M_STRIPE #E9A23B` laid on the shell. Head: `SphereGeometry(0.13)` with two `ConeGeometry(0.04, 0.16, 6)`
horns curving toward each other. Legs: six three-segment cylinder chains, tripod gait, 0.9 Hz. Eyes
`r 0.055, gap 0.13` on the head, plus two fake `CircleGeometry(0.06)` "headlamp" spots on the shell front.

### 21. JINGLEBOTTOM — the jester (part one)
`Lv20 · HP 84 · MP 24 · ATK 58 · DEF 44 · AGI 38 · EXP 84 · Gold 66 · Recruit 1/36`
**Where** The Whistling Caves' abandoned fairground level; Whistfell Abbey's lower halls.
**Does** *Bell Bonk*, *Muddle* (confusion, all), *Swap* (switches two heroes' positions — pure mischief).
**Is** Has one joke. Tells it constantly. It is not a good joke. He is having the time of his life.
**Idle** Cartwheels in place every 5 s; otherwise shifts weight foot to foot at 1.2 Hz with the bells jingling
(three bells, each with 120 ms lag, so the jingle is a triplet, not a chord).
**Death** UNWIND — spins on one toe, faster and faster, shrinks to a point, and the last thing to vanish is
the sound of the bells.
**BUILD** 1.0 tall, all lathes. Body: harlequin lathe `(0,0) (0.17,0.10) (0.19,0.30) (0.12,0.48) (0.09,0.56)`
in **two vertical halves**, `M_JEST_A #D3524C` and `M_JEST_B #E9C23B`, split by rebuilding the lathe as two
180° sweeps. Ruff: `TorusGeometry(0.14, 0.045, 8, 16)` scalloped by scaling alternate segments, in `#FFF6EF`.
Head: `SphereGeometry(0.16)` in `M_SKIN_PALE #F2D9C4`. Hat: three `ConeGeometry(0.06, 0.24, 6)` bent into
S-curves (pre-bend the geometry), splayed, each with a `SphereGeometry(0.035)` gold bell that swings on a
2-segment pendulum. Arms/legs: `CapsuleGeometry(0.035, 0.18)` with striped bands, ending in oversized
`SphereGeometry(0.06)` hands and curled-toe shoes (a lathe with the tip bent up 90°). Eyes `r 0.075, gap 0.13`
with **painted diamonds**: two extruded diamond shapes in `#D3524C` around the eyes. Grin very wide, 0.14.

### 22. BARROWMOLE
`Lv15 · HP 70 · MP 0 · ATK 50 · DEF 38 · AGI 14 · EXP 46 · Gold 120 · Recruit 1/22`
**Where** The Whistling Caves and the Quiet Quarry (Digby, your quarry friend, is one). Carries a wheelbarrow of ore; drop scales with whether you let it keep it.
**Does** *Shovel Swing*, *Trundle Away* (flees with the gold at 30% — chase it, it is worth it).
**Is** A blind miner with a barrow, terribly cross about the interruption, secretly glad of the company.
**Idle** Pushes the barrow forward 0.1 u and back, wheel squeaking; snuffles, nose twitching at 3 Hz.
**Death** POP; the barrow tips and coins roll toward the camera.
**BUILD** Body: `CapsuleGeometry(0.20, 0.22)` upright in `M_MOLE #6B5A6E`, belly patch a lighter
`SphereGeometry(0.15)` scaled flat in `#C9B0A8`. Snout: `ConeGeometry(0.07, 0.12, 8)` with the tip rounded,
in `#E8A0A8`, twitching. Eyes: two tiny closed arcs — extruded curved lines in `#2A1E24` (it never opens them).
Claws: two `SphereGeometry(0.09)` hands with three `ConeGeometry(0.02, 0.09, 4)` each. Helmet: a hemisphere
in `M_IRON` with a `CylinderGeometry(0.03,0.03,0.04)` lamp emitting a real `SpotLight` (intensity 0.6, angle
0.5) — the only monster carrying a light, and in the mine it is a genuinely lovely effect.
Barrow: rounded-box tray + `TorusGeometry(0.10, 0.02)` wheel + two handle cylinders, `M_WOOD`/`M_IRON`.

### 23. CANDELABRACADABRA
`Lv22 · HP 78 · MP 40 · ATK 46 · DEF 42 · AGI 26 · EXP 88 · Gold 58 · Recruit 1/30`
**Where** The Whistling Caves' chapel, the Grey Ruins, abbey corridors.
**Does** *Scorcha* (fire, one), *Kascorcha* (big fire, one, at rank 25+), *Mend*.
**Is** A candelabra that learned magic by listening at the door and is now dangerously overqualified.
**Idle** Floats at `y 0.4`, rotating 12°/s; flames flicker independently; wax drips (a small sphere slides
down an arm and vanishes).
**Death** WISP — the three flames blow out one by one, left, right, centre, and the brass falls.
**BUILD** Stem: `LatheGeometry` with a bobbin profile `(0,0) (0.12,0.02) (0.05,0.06) (0.07,0.16) (0.04,0.30)
(0.06,0.40) (0.03,0.52)` in `M_BRASS #C9973C`. Three arms: `TorusGeometry(0.13, 0.018, 8, 16, π*0.8)` rotated
out at 0°/120°/240°, each ending in a cup lathe with a `CylinderGeometry(0.028, 0.030, 0.14)` candle in
`#F5EAD2` (each a different height — never equal). Flames: `ConeGeometry(0.035, 0.10, 8)` with the tip pulled
to a curve, `MeshBasicMaterial` `M_FLAME #FFB13B`, plus a smaller inner cone in `#FFF0A8`; scale-jitter each
at a different frequency (7.3, 8.1, 6.7 Hz) and add a `PointLight` (0.4, distance 3) at the centre.
Eyes on the stem, `r 0.06, gap 0.11`, with two extruded brass "eyebrow" arcs above them for the smugness.

---

## 4. TIER FOUR — the Sighing Grotto, the Grey Ruins, the Frostbottom, Highfeather's cloud road (danger rank 24–33 · party Lv 17–25 · Act II end, Act III)

### 24. GLOOPOLD THE GRAND
`Lv27 · HP 210 · MP 20 · ATK 92 · DEF 74 · AGI 20 · EXP 260 · Gold 150 · Recruit 1/64`
**Where** Wherever eight Gloops have agreed on something, which is rare and therefore alarming.
**Does** *Royal Squelch* (all), *Rally* (summons two Gloops), *Mend* on itself.
**Is** Eight Gloops in a trenchcoat, except the trenchcoat is a crown and the eight of them are voting.
**Idle** Each of the eight sub-Gloops hops on its **own** phase (offset `i·0.13 s`) so the mass ripples like a
pot boiling. The crown stays almost level, correcting with a lag spring.
**Death** The stack collapses: sub-Gloops POP one at a time bottom-up over 900 ms; the crown falls last,
lands on the final Gloop, and *it* wears it for one triumphant beat before popping too.
**BUILD** Eight Gloop lathes (see #1) at scale 0.85, arranged 3-3-2 in a pyramid inside a 1.4 × 1.5 volume,
each a separate child, colours alternating `M_GLOOP #4C86D8` and `M_GLOOP_R #C24C6E`. The **top** Gloop is
1.6× and carries the face — big eyes `r 0.13, gap 0.24` and a wide grin. Crown: `LatheGeometry` band
`(0.20,0) (0.24,0) (0.24,0.10) (0.20,0.10)` in `M_GOLD` with five `ConeGeometry(0.05, 0.12, 4)` points and
five `SphereGeometry(0.03)` jewels in `M_RUBY #C0304A`. The lower Gloops have simple dot-eyes only
(`SphereGeometry(0.03)` black, no sclera) — hierarchy through detail.

### 25. SIR CUMFERENCE
`Lv29 · HP 240 · MP 0 · ATK 104 · DEF 96 · AGI 12 · EXP 300 · Gold 180 · Recruit 1/56`
**Where** The old tourney yard in the Grey Ruins; challenges you formally before combat.
**Does** *Grand Charge* (heavy, one; he needs a turn to turn around afterwards), *Bow Politely* (skips turn,
raises the whole party's… nothing. He just bows. It is very charming.)
**Is** The roundest knight in the world, unfailingly courteous, physically incapable of standing up if he falls.
**Idle** Rocks fore-and-aft 5° like a weeble; plume sways; every 6 s the visor pings open a crack and shuts.
**Death** TOPPLE, and he **rolls** — 1.5 rotations before stopping on his back with his little legs up. He
laughs. Then POP.
**BUILD** One enormous rounded body: `SphereGeometry(0.62, 20, 16)` scaled `(1, 0.92, 1)` in `M_STEEL`, with
extruded plate seams: three `TorusGeometry(0.6, 0.015)` bands at different latitudes. Helm: `LatheGeometry`
bucket `r 0.22`, sunk 0.08 into the body — **no neck, ever**. Plume: five bent cones in `M_PLUME`, trailing.
Arms: two `CapsuleGeometry(0.09, 0.16)` that barely reach past the belly, ending in mitten spheres. Legs: two
`CapsuleGeometry(0.07, 0.10)` — absurdly short, and 0.9 of his weight is above them. Lance:
2.0 units long (comically longer than he is), extruded with a spiral groove made by 12 small torus segments.
Shield: extruded heater 0.34 tall with a raised boss and an engraved (extruded, 0.006 proud) family crest of
three circles.

### 26. MIRTHQUAKE — the jester (part two)
`Lv31 · HP 265 · MP 60 · ATK 110 · DEF 80 · AGI 46 · EXP 380 · Gold 220 · Recruit 1/72`
**Where** Highfeather's cloud road, and the last hall before Whistfell Abbey's bell tower.
**Does** *Punchline* (heavy, one), *Kascorcha*, *Belly Laugh* (all party, damage + 30% confusion; the ground
literally shakes — 0.3 u screen shake for 700 ms).
**Is** Laughing at something that happened a long time ago and was not funny then either.
**Idle** Holds his sides and shakes with silent laughter, 3 Hz, amplitude growing over 8 s then resetting.
**Death** He laughs harder and harder until he shakes apart — CRUMBLE and UNWIND together, bells last.
**BUILD** Jinglebottom (#21) at 1.9× scale with three changes: colours to `M_JEST_DARK #4A2B52` and
`M_JEST_GOLD #C9973C`; the grin is 0.22 wide and uses `Kit.mouthFang(0.22, 0.08, 4)`; and the hat has **five**
bells instead of three, one of which is cracked (a wedge removed from the sphere by using
`SphereGeometry(r, 12, 8, 0, π*1.8)`). Eyes: no highlight sphere. Removing the highlight is the entire
difference between "funny" and "wrong", and this is the one monster in the book allowed to be wrong.

### 27. LADY MOTHBONNET
`Lv28 · HP 190 · MP 70 · ATK 84 · DEF 66 · AGI 40 · EXP 290 · Gold 165 · Recruit 1/44`
**Where** The Grey Ruins' roofless ballroom, dancing alone.
**Does** *Nipper* (ice, all), *Snoozle*, *Last Dance* (drains 30 HP from one hero to heal herself).
**Is** Still waiting for a partner. Will absolutely settle for you. Has excellent manners and cold hands.
**Idle** Waltzes — a slow 3/4 rotation, one-two-three, drifting in a 0.4 u circle; the dress hem trails.
**Death** WISP, with a curtsy first. The curtsy is non-negotiable.
**BUILD** Gown: a tall `LatheGeometry` bell — `(0,0) (0.42,0.02) (0.30,0.30) (0.16,0.62) (0.13,0.82)` — in
`M_GHOST_B #C9CFE8` at opacity 0.78, hem scalloped by `0.04·sin(6θ)`. Bonnet: a lathe scoop in `#E8E2F0` with
a `TorusGeometry(0.02,0.006)` ribbon and a trailing extruded ribbon strip with 4-point verlet. Moth wings on
her back: two `ExtrudeGeometry` scallops, span 0.5, opacity 0.5, dusty `#B8AEC8`, held **still** except one
slow flutter every 9 s. Arms: two thin `CapsuleGeometry(0.03, 0.20)` sleeves ending in nothing. Face: a
`CircleGeometry(0.11)` dark oval with only the eye-holes and two `SphereGeometry(0.018)` pale glints. Feather
fan: extruded semicircle in `#DCC8D8` she raises when she casts.

### 28. SQUIDGEON
`Lv26 · HP 175 · MP 30 · ATK 88 · DEF 60 · AGI 52 · EXP 240 · Gold 130 · Recruit 1/34`
**Where** The Sighing Grotto and, inexplicably, the rooftops of Marbleford.
**Does** *Tentacle Slap* (three hits), *Inkblot* (blinds all), *Whiffle*.
**Is** A squid that has decided it is a pigeon. Bobs its head when it swims. Coos.
**Idle** Mantle pulses (scale `y` 1↔0.9 at 0.8 Hz) driving a slight forward drift; the eight tentacles trail in
a travelling sine wave; the head **bobs** forward-back like a pigeon's, 1.4 Hz, completely out of character.
**Death** POP inside a spreading dark disc that fades — an ink cloud.
**BUILD** Mantle: `LatheGeometry` cone-dome `(0,0.60) (0.18,0.44) (0.22,0.20) (0.20,0) ` in `M_SQUID #8E6FB8`.
Fins: two `ExtrudeGeometry` triangles at the top, depth 0.01, flapping. Tentacles: eight chains of five
`CapsuleGeometry(0.03→0.012, 0.10)` segments each, driven by `angle = 0.4·sin(2πt/1.6 + i·0.5 + seg·0.6)`.
Beak: two small cones. **Pigeon detail**: a `TorusGeometry(0.12, 0.03)` iridescent collar in a green-purple
two-band toon material, and two `SphereGeometry(0.02)` orange feet dangling under the mantle, uselessly.
Eyes enormous, `r 0.10, gap 0.22`, on the sides of the mantle so they nearly point away from you.

### 29. THUNDERPUFF
`Lv30 · HP 200 · MP 90 · ATK 78 · DEF 58 (immune to physical while "Fluffed") · AGI 44 · EXP 330 · Gold 145 · Recruit 1/48`
**Where** Highfeather's cloud road.
**Does** *Zapple* (lightning, one, heavy), *Kazapple* (all), *Fluff Up* (immune to physical 1 turn, looks
enormously pleased about it).
**Is** A small cloud with a big grudge and a lovely singing voice.
**Idle** Drifts in a slow figure-eight; the puff lobes counter-rotate; every 6 s a tiny internal flash lights
it from inside for 100 ms (a `PointLight` pulse) with a distant rumble.
**Death** DEFLATE into rain — 20 small stretched capsules fall and stop at the ground, then a tiny rainbow arc
(a `TorusGeometry(0.5, 0.02, 6, 24, π)` in a five-band gradient) appears for 500 ms and fades. Kids will
deliberately fight these.
**BUILD** Seven `SphereGeometry(0.16–0.30)` merged into one lumpy cloud, 0.9 wide, in `M_CLOUD #E8EEF6`
with the underside band lerped to `M_CLOUDDARK #A8B4C8` (use a vertex-colour ramp on local Y). Eyes
`r 0.09, gap 0.20, tilt +12°` sunk into the front lobe. Mouth `Kit.mouthGrin(0.16, 0.06)` inverted into a
scowl. Two tiny cheek-puff spheres in `#F0C0C8`. Lightning bolt for the attack: an `ExtrudeGeometry` zigzag
`Shape` (5 points, depth 0.02) in `M_BOLT #FFF08A` that appears for 3 frames, scaled up hard, with a screen
flash — never a particle system; the hard-edged bolt is more DQ.

### 30. WYRMSLEY
`Lv32 · HP 255 · MP 45 · ATK 118 · DEF 92 · AGI 34 · EXP 420 · Gold 260 · Recruit 1/60`
**Where** Whistfell Abbey's east wing, answering the door.
**Does** *Tail Sweep* (all), *Scorcha*, *Serve Tea* (heals all **enemies** 40 — including, on the turn it
joins you, your party. The tea is genuinely good.)
**Is** A dragon the size of a butler, and a butler to his bones. Disapproves of the villain's housekeeping.
**Idle** Stands with one claw behind his back; the other holds a tray perfectly level no matter what the body
does (an IK-ish counter-rotation — this is the joke, spend the code on it). Tail flicks once every 4 s.
**Death** He sets the tray down carefully first (500 ms), then TOPPLE. Do not skip the tray.
**BUILD** 1.5 tall, bipedal, potato-shaped. Body: `CapsuleGeometry(0.28, 0.36)` in `M_DRAGON #4E8C6A`, belly
plates: seven extruded rounded rectangles in `M_BELLY #E4D2A8` stacked down the front. Head:
`SphereGeometry(0.24)` with an extruded snout box `0.18 × 0.14 × 0.20` rounded, two `ConeGeometry(0.035, 0.10)`
horns swept back, and small `Kit.mouthFang(0.14, 0.05, 2)`. Wings: **tiny and vestigial** — two 0.18-span
extruded scallops that flutter uselessly. Tail: six-segment tapered capsule chain with a lag spring.
Waistcoat: an extruded shell shape hugging the torso in `M_VELVET #6B3A6E` with three
`SphereGeometry(0.02)` `M_GOLD` buttons. Bow tie: two flattened cones back to back. Tray:
`CylinderGeometry(0.16, 0.16, 0.015)` in `M_SILVER #C4CBD4` with a lathe teapot and two cups on it.
Eyes `r 0.075, gap 0.16, tilt −4°`, with heavy extruded lids at 30% closed — perfect butler condescension.

### 31. GRIMALKITTEN
`Lv25 · HP 160 · MP 36 · ATK 90 · DEF 55 · AGI 66 · EXP 230 · Gold 110 · Recruit 1/26`
**Where** The Grey Ruins, rooftops, always where a shadow already is.
**Does** *Pounce* (crit chance 25%), *Vanish* (untargetable 1 turn), *Muddle*.
**Is** A cat-shaped hole in the light. Purrs. Will sit on the map you are reading.
**Idle** Sits. Tail describes a slow S at 0.4 Hz. Ears rotate independently toward sounds. Every 8 s: one
enormous yawn (jaw opens 40°, eyes squeeze shut) — and while yawning it takes 1.5× damage, which observant
kids will find and love.
**Death** WISP downward instead of up, pooling into a shadow disc that shrinks to nothing.
**BUILD** Body: `CapsuleGeometry(0.18, 0.22)` lying, plus a `SphereGeometry(0.20)` head with **no neck**, all
in `M_SHADOW #3A3352` under a toon material with only **two** bands and a violet rim light `#8E6FB8` at 0.4 —
the rim is what stops it becoming a black blob. Ears: two `ConeGeometry(0.06, 0.13, 4)`, inner triangle
extruded in `#6B5A82`. Tail: eight-segment chain, 0.7 long, tapering to a point, with a sine-driven S curve.
Legs: four `CapsuleGeometry(0.04, 0.12)`. Eyes: two `SphereGeometry(0.07)` in `M_CATEYE #7FE8B0`
(`MeshBasicMaterial`) with **vertical slit** pupils — an extruded lozenge 0.012 × 0.09 — that widen to a
circle when it pounces. Whiskers: six 0.16 `CylinderGeometry(0.004)`, drooping, with lag.

---

## 5. TIER FIVE — Whistfell Abbey and the Quiet Deep (danger rank 34–45 · party Lv 25–30 · Act III end)

### 32. HEXCALIBUR
`Lv36 · HP 290 · MP 80 · ATK 152 · DEF 105 · AGI 72 · EXP 620 · Gold 300 · Recruit 1/80`
**Where** The armoury of Whistfell Abbey, hanging in mid-air, waiting.
**Does** *Rebuke* (heavy single), *Blade Storm* (four hits, random targets), *Hexed Edge* (halves one hero's
max HP for the fight — the only genuinely nasty move in the game, and it telegraphs for a full turn).
**Is** A sword that got tired of being held. Speaks in short, extremely rude sentences.
**Idle** Hovers point-down at `y 0.7`, rotating slowly on its own axis at 20°/s, bobbing 0.05. The pommel
gemstone pulses at 0.5 Hz.
**Death** UNWIND — spins to a blur, the blade cracks (an extruded jagged line appears down it), and it drops
point-first into the ground and stands there quivering before dissolving.
**BUILD** Blade: `ExtrudeGeometry` of a long tapered shape, 1.1 × 0.14, depth 0.045, with a bevel — plus a
central fuller made by a second, inset extrusion in `M_BLADEDARK #7C8896`. Colour `M_BLADE #D9E2EC` with a
sharp two-band toon and a specular sweep that runs the length every 3 s. Guard: an extruded crescent, 0.34
wide, in `M_DARKGOLD #A07A2C`. Grip: `CylinderGeometry(0.035, 0.030, 0.20)` wrapped by 8 `TorusGeometry(0.037,
0.008)` rings. Pommel: `OctahedronGeometry(0.06)` in `M_RUBY #C0304A`, `MeshBasicMaterial`, with a `PointLight`
(0.5, dist 2.5). **The face is in the guard**: two `SphereGeometry(0.035)` eyes in `M_RUBY` set into the
crescent, and no mouth at all — its text just appears. Trailing: 6 ghost copies of the blade at decreasing
opacity when it moves.

### 33. VESPERLING
`Lv35 · HP 270 · MP 120 · ATK 130 · DEF 92 · AGI 80 · EXP 580 · Gold 240 · Recruit 1/70`
**Where** Whistfell Abbey's bell tower; the Bishop's choir.
**Does** *Kascorcha*, *Nipper*, *Evensong* (heals all allies 60 and sounds, deliberately, beautiful).
**Is** A bat that took holy orders. Sings the villain's evening prayers. Is not sure any more that it agrees.
**Idle** Hangs **upside down** from nothing, hood down, hands folded, swaying 4° — and rights itself with a
single wing-snap only when it acts. Nobody expects the flip. It gets a gasp every time.
**Death** WISP upward with a held choral note that resolves, at the last instant, into a major chord.
**BUILD** Flapjack (#3) at 2.6× with: a `LatheGeometry` cassock bell over the body —
`(0,0) (0.30,0.04) (0.22,0.30) (0.14,0.52)` — in `M_CASSOCK #2E2A44`; a hood built from a
`SphereGeometry(0.22, 16, 12, 0, π*2, 0, π*0.6)` dome, open at the front, with the face in shadow (place a
0.02-proud dark `CircleGeometry(0.14)` behind the eyes); wings 0.9 span with **five** scallops instead of
three; and a hanging `TorusGeometry(0.05, 0.012)` censer on a 3-segment chain that swings with real pendulum
motion and trails four slow smoke spheres. Eyes `r 0.075, gap 0.11` in `M_EMBER #FF9E5E`, `MeshBasicMaterial`.

---

## 6. THE FIVE BIG BOSSES — escalating drama
(Full boss order, with the story bosses, is CANON.md §8.)

### B1. BOGWALLOP THE BULBOUS — *"the one you can beat"* (optional)
`Lv8 · HP 180 · MP 10 · ATK 34 · DEF 24 · AGI 8 · EXP 220 · Gold 150 · Recruit — see below`
**Where** Quaggerton, in the Sogglemarsh — optional in Act II, at the end of a very short, very safe boardwalk
maze. By then the party is well above him; that is the point: this is the boss a six-year-old beats alone.
**Does** *Belly Flop* (all, and he takes 5 recoil), *Gulp* (swallows one hero for one turn — they pop back out
unharmed and slightly sticky), *Enormous Burp* (does nothing; wastes his turn; happens 20% of the time).
**Two phases**: below 40% HP he stands up on his back legs, which is genuinely startling for a frog the size
of a cottage, and his ATK goes to 46.
**Is** Not evil. Enormous, lonely, and sitting on Quaggerton's only well.
**Idle** Breathes hugely — throat sac inflates over 1.4 s and deflates in 0.3 s. Blinks one eye at a time.
Tongue lolls.
**Death** DEFLATE, slowly, into a sulk. He does not vanish — he stays, defeated, and talks to you.
**The tender bit**: after the fight he apologises. If you return in Act III with a Marsh Lily, he asks to
join, and **Bogwallop is the only boss in the game who can be recruited.** Children will tell each other about
this. Guard it: no hint text, one NPC line in the marsh, and that is all.
**BUILD** 3.2 wide, 2.0 tall. Body: `SphereGeometry(1.4, 24, 16)` scaled `(1.15, 0.85, 1)` in
`M_TOAD #6E8F52`, belly a second sphere in `M_BELLY_C #D8D2A0` scaled `(0.9, 0.75, 0.6)` pushed forward.
Warts: 24 `SphereGeometry(0.06–0.12)` in `#5A7842` scattered on the back. Throat sac:
`SphereGeometry(0.55)` beneath the jaw with an animated scale 0.6↔1.25. Eyes: two `SphereGeometry(0.30)`
mounted **on top** of the head in raised sockets, `tilt −8°`, pupils horizontal-bar shaped (extruded lozenges)
— toad pupils, and they read as friendly. Mouth: an enormous `Kit.mouthGrin(1.5, 0.22)` splitting the head.
Tongue: a 10-segment ribbon capsule chain, `#E07A8E`, that whips out 2.5 u on *Gulp* at `easeOutBack`.
Legs: four thick 3-segment capsule chains, back pair much larger, with `SphereGeometry(0.22)` webbed feet
(extrude a webbing shape between the toes). Crown of reeds: five bent cones in `M_LEAF`.

### B2. SEXTON SOOTBELL — *"the one that makes it quiet"* (optional)
`Lv15 · HP 420 · MP 90 · ATK 62 · DEF 48 · AGI 30 · EXP 700 · Gold 400 · Not recruitable`
**Where** The Bellhollow Belfry, optional in Act II — the empty frame the Order stole the abbey's bell from.
He rings a ghost of it. Reward: the **Charm Bell** (§7).
**Does** *Toll* (all, sound damage, and the screen desaturates for 400 ms), *Snoozle* (all), *Summon Boohoo*
(two, once), *Dust of Years* (lowers all party AGI 20%).
**Phases**: at 50% he rings the bell and the room's candles go out one by one — the light rig drops to a
single cold key. At 20% he stops fighting for one full turn and simply says: *"I only wanted someone to hear it."*
**Is** The bellringer who kept ringing after everyone had gone, and is very tired, and is very polite about it.
**Idle** Floats, pulling on a rope that is not there — arms haul down in a slow 3 s cycle, and the great bell
above him swings **silently** in time.
**Death** WISP, and as he goes the ghost bell rings once, properly, for the first time since it was taken. Hold the camera
on the empty tower for 2.5 s before the victory fanfare. That silence is worth more than the fight.
**BUILD** Boohoo (#10) at 3.2×, colour `M_GHOST_GREY #B8C0CC`, plus: a rope of 12 capsule segments with real
verlet sag; a **bell** above him, `LatheGeometry` `(0,0.9) (0.30,0.85) (0.55,0.35) (0.62,0.05) (0.68,0)` in
`M_BRONZE #8A6A3C`, 1.4 wide, swinging on a pivot with pendulum physics; a hunched extruded stole across the
shoulders in `M_STOLE #4A3A5A`; and hands — the only ghost with hands — two `SphereGeometry(0.09)` mittens
gripping the rope. Eyes: the standard hole-eyes at `r 0.16`, but with **two** glints each so he looks
watery-eyed. Around him, 30 slow dust motes: `SphereGeometry(0.012)` `MeshBasicMaterial` drifting on noise.

### B3. THE IRON GOVERNESS (Mistress Ferrilyn) — *"the one that scares them"*
`Lv26 · HP 900 · MP 120 · ATK 118 · DEF 104 · AGI 42 · EXP 2400 · Gold 1200 · Not recruitable`
**Where** The overseer's gantry above the Quiet Quarry works, Act III (B22): you have come back to set the
workers free. She has a list. You are on it. (Never say "slave" anywhere in the build — they are *workers*.)
**Does** *Ruler Rap* (single, heavy, and she says the number of the strike aloud), *Wind the Key* (buffs her
own AGI and ATK 30%, twice per fight), *Kanip* (ice, all), *Inspection* (targets the party member with the
lowest HP — kids learn to heal *before* they need to).
**Phases**: three, marked by her key unwinding. Her clockwork **visibly** slows as she loses HP — the idle
frequency drops from 1.0× to 0.7× to 0.45×, and the ticking sound slows with it. When the ticking stops, so
does she.
**Is** Perfectly calm, perfectly polite, and has never once raised her voice, which is exactly the problem.
**Idle** Stands with hands clasped. Head ticks left, right, centre — 1 tick per second, sharp, no easing.
The key in her back turns continuously and **unwinds** over the fight.
**Death** UNWIND, literally — the key spins free, her arms drop, her head bows, and she folds down into a
neat, dignified, harmless heap. No scream, no explosion. Then a long beat. Then the fanfare.
**BUILD** 3.0 tall, all lathes and rounded boxes, `M_IRON_COLD #7A8290` and `M_PORCELAIN #F0E6DC`.
Skirt: a huge lathe bell `(0,0) (1.0,0.05) (0.72,0.7) (0.44,1.5)` in `M_IRONDRESS #4E5866`, with **six**
extruded vertical panel seams and a `TorusGeometry(0.5, 0.05)` bustle. Torso: a tapered lathe corset with a
brass keyhole plate. Head: `SphereGeometry(0.34)` in `M_PORCELAIN` — porcelain, not metal, with a single
hairline crack (an extruded 0.004 line) that **lengthens** with each phase. Bun: a `TorusKnot`? No —
`SphereGeometry(0.16)` scaled flat, with three `TorusGeometry(0.14, 0.03)` coils. Collar: a stiff extruded
ruff. Arms: four-segment cylinder chains with **visible brass gears** at each elbow — two
`CylinderGeometry(0.07, 0.07, 0.03)` discs with 10 extruded teeth, counter-rotating. Hands: thin three-finger
claws. Ruler: an extruded bar 1.2 long in `M_DARKWOOD #3A2A22`. Key: a `TorusGeometry(0.22, 0.04)` bow plus a
shaft, in her back, rotating. Eyes: `r 0.09, gap 0.20`, painted-doll style — sclera pure white, pupil a flat
`CircleGeometry` in `M_ICEBLUE #7FA8D8`, **no highlight, no blink, ever**. The absence of the blink is the horror.

### B4. BISHOP MORTMAIN → MORTMAIN ENFOLDED — *"the one who took your father"*
`Lv38 · HP 2400 · MP 300 · ATK 158 · DEF 128 · AGI 76 · EXP 9000 · Gold 3000 · Not recruitable`
**Where** Bishop Mortmain (a human: the P07 character model — thin, kind-faced, dove-grey, glass lantern at his
belt) appears, unbeatable and scripted, at the Grey Ruins (B9) and at Ambergarde's coronation (B19). You fight
him for real in the Quiet Deep (B25), to `boss`, after walking through Whistfell Abbey to `quiet_hand` (the
battle melody slowed on organ). **Phase 1 is the Bishop himself, on the human model. At 60% Malgrim's dream
wraps round him like a coat, and he becomes the Enfolded build below.**
**Does** *Vespers* (all, dark, heavy), *Kascorcha*, *Silence the Choir* (seals one hero's spells 3 turns),
*Two actions per turn* from 60% HP, *Benediction* (heals himself 300 — punish it, he telegraphs by folding
his hands for a full turn).
**Phases**: (1) the Bishop, calm, hands folded; (2) at 60% the dream wraps him — a hood of dark comes up and
back, and it has given him a bat's face, and it is beautiful, and that is worse; (3) at 25% the dream's wings
unfurl to their full 6 u span and he stops speaking entirely. Between (1) and (2) he sits on a step and tells you
about his son Tobin (STORY-BIBLE §7).
**Is** Gentle-voiced, unhurried, and absolutely certain he is doing you a kindness. Never gloats. Says your
father's name once, correctly, and that is the cruellest thing in the game.
**Idle** Hovers 0.6 off the ground, cassock hanging still. Only the censer moves.
**Death** Not a death. The dream-coat WISPs upward and slow, wings folding in, and what is left kneeling is an
ordinary, very old man with his hands still folded. He is not killed and he is not hurt.
**Then** ten seconds with no music — and the floor opens: **Malgrim the Unlit** (B5). No fanfare until it lets go.
**BUILD** 4.4 tall. Vesperling (#33) rebuilt at 3× with: cassock `M_CARDINAL #7A1F2E` (deep red) with
`M_DARKGOLD` extruded trim running the full hem and centre seam; a mitre — a `Shape` extrusion of a pointed
arch, 0.9 tall, in `M_CARDINAL` with a gold cross; wings that are **six** scallops per side, span 6.0 at full
unfurl, in `M_WINGDARK #2A2038` with `M_CARDINAL` inner membranes; a crozier 3.5 long — a lathe staff topped
with a spiral built from a 24-segment tube curve; and a face: a long muzzle
(`ConeGeometry(0.18, 0.42, 8)` rounded), `Kit.mouthFang(0.22, 0.07, 2)`, and eyes `r 0.11, gap 0.20` in
`M_EMBER #FF9E5E` with **highlights present** — he is the only monster in the book whose eyes are both kind
and terrible, and the highlight is why. Around him at all times: 40 dark motes falling *upward*.

### B5. MALGRIM THE UNLIT — *"the end"*
`Lv45 · HP 4500 (two forms: 1800 / 2700) · MP ∞ · ATK 175 · DEF 140 · AGI 90 · EXP 0 · Gold 0 · Not recruitable`
**Where** The bottom of the Quiet Deep, under everything, where colour stops. The thing that has been granting
Mortmain's wish for forty years; it rises out of the floor the moment he kneels.
**Form One — The Cocoon.** A vast smooth ovoid, eight closed eyes on its surface, four tendrils.
*Does* **Unlight** (all, and the screen's saturation drops 25% permanently until the fight ends),
*Lash* (three hits), *Open One Eye* (a new attack unlocks for each eye it opens — four total).
**Form Two — The Unravelling.** It breaks open. Inside is a small, thin, almost-childlike figure made of
folded darkness, and it is *this* that is frightening.
*Does* **Nothing At All** (all, and the damage is exactly equal to each hero's current HP minus 1 — nobody
dies, and every child at this point screams), *Kascorcha*, *Undo* (removes all party buffs), and, at 10% HP,
**Ask** — it whispers: *"Wouldn't it be kinder if everything were quiet?"* The hero cannot speak, so the menu
offers the twins' two answers — Rowan's *"No. People are supposed to be loud."* or Linnet's *"We LIKE loud."*
Either one wins: Rowan's makes the last phase a short conversation, Linnet's a short, easy fight. Then the
Larksteel Sword cuts the dream away.
**Is** Never speaks above a whisper. Is not angry. Wants, simply, for things to stop being so *loud*.
**Idle** Form One: rotates 3°/s, tendrils drifting; the closed eyes twitch under their lids.
Form Two: perfectly still, floating, head slightly tilted, as if listening.
**Death** Form One CRUMBLE outward in slow motion over 2 s. Form Two: it does not pop. It **lets go** —
it opens its hands, and colour returns to the world from the centre of the screen outward over 3 s, and it
is gone, and the screen is the brightest it has been in the whole game. Then, and only then, the fanfare.
**BUILD** *Form One*: `SphereGeometry(2.4, 32, 24)` scaled `(1, 1.35, 1)` in `M_VOID #241E33` under a toon
material with **two** bands and a cold rim `#5A4A8C` — plus, laid over the surface, eight closed-eye seams:
extruded lens shapes 0.7 × 0.12, which open by scaling and revealing a `SphereGeometry(0.30)` eye in
`M_VOIDEYE #E8E0FF` (`MeshBasicMaterial`) with a black slit. Tendrils: four 12-segment tapered chains, 4 u
long, sine-driven. Around it, a `TorusGeometry(3.2, 0.03)` ring of 40 tiny cubes orbiting on three different
axes. *Form Two*: 2.0 tall, thin, made only of `CapsuleGeometry(0.06, 0.4)` limbs and a
`SphereGeometry(0.24)` head with **no face at all** except two `CircleGeometry(0.05)` holes; a cloak of
twelve `ExtrudeGeometry` ribbons hanging and drifting in nonexistent wind; and one detail that must not be
skipped — its hands are small, and its fingers are the only fingers on any monster in this game.

---

## 6b. STORY CREATURES — the bosses and friends the plot needs
*Added by the canon pass so every boss in CANON.md §8 has a body. Same kit, same rules: round, readable, no gore.*

### QUIETLING — the Order's footsoldier
`Lv10 · HP 30 · MP 6 · ATK 22 · DEF 16 · AGI 14 · EXP 18 · Gold 20 · Not recruitable`
**Where** Coddleston Moor (Act I), the Stone Garden, Whistfell Abbey. **Does** *Shush* (silences one hero 2 turns),
*Poke*. **Is** A small hooded figure in a grey mask with a finger to its lips; more sleepy than cruel. Yawns.
**Death** FOLD — the robe folds itself neatly and the mask sits on top. **BUILD** A 0.9-tall `LatheGeometry` robe
`(0,0) (0.26,0.02) (0.20,0.50) (0.12,0.78) (0,0.86)` in `M_GHOST_GREY`; a hood dome over a `CircleGeometry(0.13)`
mask in `M_PORCELAIN` with two small dark eye-slits and one raised extruded finger across the mouth; mitten hands.

### MUMBLEROOT THE GRUDGE — Cobwell Manor's belfry (Act I)
`Lv7 · HP 180 · MP 0 · ATK 26 · DEF 18 · AGI 9 · EXP 160 · Gold 400 (in the coat pockets) · Not recruitable`
**Does** *Bind* (one hero skips a turn), *Cold Draught* (blows out the candle; the backdrop darkens one round).
Never targets Willow. **Is** Grief that grew roots, wearing a groom's coat. **Death** UNWIND into a plain black
coat lying on the floor. **BUILD** A knot of eight tapered `TubeGeometry` roots in `M_BARK` rising to 1.8 u, a
lathe tail-coat in `#2A2A36` with two `M_GOLD` buttons, and two glowing `M_GLOWSTONE` eyes deep in the knot.

### THE SUNMANE — Pip, grown wild (Act II, B11b)
`Lv14 · HP 420 · MP 0 · ATK 60 · DEF 40 · AGI 50 · EXP 600 · Gold 0 · Joins by story`
**Does** *Pounce*, *Roar* (lowers party AGI one turn). On its **second turn** it sees the ribbon and the fight ends:
it sits, sniffs Bram's wrist, and lies down. It cannot lose you and you cannot hurt it below 50% HP.
**Is** Pip. **BUILD (kitten, Act I)** a 0.35-tall ginger cat: `SphereGeometry(0.13)` head, capsule body in
`M_SUNSPOT #E8A04A`, two tiny `ConeGeometry(0.012, 0.05)` sabre teeth in `#FFF6EF`, a `SphereGeometry(0.025)`
brass bell on a ribbon collar. **BUILD (Sunmane, Act II–III)** the same rig at 4.5×, with a mane of twelve
extruded flame-shaped petals in `M_GOLD` and the teeth at 0.25 u. Eyes always have highlights: he was never bad.

### THE TIDEWARDEN — the Sighing Grotto (Act II, B15)
`Lv18 · HP 900 · MP 40 · ATK 70 · DEF 55 · AGI 20 · EXP 1500 · Gold 600 · Not recruitable`
**Does** *High Tide* (all, water; its **Big Attack**, telegraphed by the water level rising a full turn),
*Clamp*, *Undertow* (pulls one hero to the back row). **Is** A huge old hermit crab wearing a lighthouse as a
shell, grumpy about visitors, proud of the pearl. **Death** It does not die: it shuts its door and sulks; the
**Tide Pearl** rolls out. **BUILD** Crabbit (#12) at 4× without the ears, plus a lathe lighthouse shell striped
`#FFF6EF`/`M_CAP` with a lit `M_FLAME` lamp-room.

### HOARFAX THE NINEFOLD — the Glasswing Grotto (Act III) — specified in WORLD-BIBLE §4 room B8
`Lv28 · HP 900 · MP 60 · ATK 96 · DEF 70 · AGI 60 · EXP 2400 · Gold 800 · Recruit 1/8 after it sits down`
**BUILD** A nine-tailed frost-fox: Grimalkitten's rig (#31) at 3.5× in `#E8F2FA` with a two-band toon and a
cyan rim; nine tapering tail-chains that each vanish with a sparkle as it loses a move. Default name **Foxglove**.

### HUSH & HARK, THE QUIET TWINS — Whistfell Abbey (Act III)
`Lv34 · HP 1100 each · MP 120 · ATK 120 · DEF 90 · AGI 70 · EXP 3000 · Gold 900 · Not recruitable`
**Does** Hush: *Silence All* (seals spells 2 turns). Hark: *Echo* (repeats Hush's last move). Beat one and the
other gives up and sits down. **Is** Two tall Quietlings who finish each other's sentences, badly — a mirror of
Rowan and Linnet. **BUILD** Quietling at 2.4×, one mask with the finger to its lips, one with a hand cupped to its ear.

---

## 7. THE RECRUITMENT MOMENT
*Owner: P17. This is the signature of the whole game. Get it wrong and nothing else matters.*

**When.** After the victory fanfare and the EXP/gold tally, before the level-up. One monster maximum per
battle. Roll once per eligible defeated monster, highest-rarity first, and stop at the first success.

**Chance.** `p = base × kindness × levelGap × charm`, where
`base` = the entry's Recruit value; `kindness` = 2.0 in Kid Mode (default ON for a new save), 1.0 otherwise;
`levelGap` = `clamp(1 + 0.04 × (heroLv − monsterLv), 0.6, 1.8)`; `charm` = 1.5 if the party carries the
**Charm Bell** (an Act II treasure, guarded by Sexton Sootbell), 1.0 otherwise. (`monsterLv` is the danger rank; the
clamp keeps late tiers fair.) Cap at 1/2. A monster that has *already* joined has
its base halved for duplicates. If the wagon is full (8 in the wagon, 4 in the party), it still asks — and
you get the line *"…the wagon's full? I'll wait in the paddock at Puddlewick!"* and it goes to the Hollybank
Cottage paddock (SYSTEMS §8), where it can be visited and swapped in. **No wild monster can join before the
wagon is back (`ch2.wagon`, B12)**; Bobble, Pip and Digby join by story.
**Pity rule (never tell the player):** after 30 battles with no recruit, multiply by 3 until one lands. No
child should watch a sibling get a monster and go home with nothing. **And** a species defeated 12 times without
joining is guaranteed to ask on the 13th (SYSTEMS §10.3).

**The beat, exactly.**
1. Victory tally window closes with its *thunk*. **0.4 s of nothing.** The pause is the ceremony.
2. A single soft chime. The defeated monster's silhouette **fades back in** at 40% opacity at its old position,
   then snaps to full over 100 ms with a POP-in scale bounce (0 → 1.18 → 1.0, 260 ms, `easeOutBack`).
3. It does its **join hop**: two big bounces (0.35 u, 320 ms each), landing on beat two of the jingle.
   `Kit.mouthOh` for the first bounce, its normal grin for the second.
4. Three white sparkle quads spin outward from it and fade (400 ms). Camera pushes in 12% over 500 ms.
5. **The Befriending Fanfare** (P27 owns it, music id `befriend`; this is the spec): 1.7 s, D major, harp gliss up on the chime,
   then flute + pizzicato strings: **A4 – D5 – F#5 – A5** (each 1/8, brightly) — beat — **G5 – F#5 – D5**
   (the last held 3/8) over a held D-add9 in low strings, with a single triangle ping on the final note.
   It must be hummable by a seven-year-old after two hearings. If it isn't, rewrite it.
6. The DQ window slides up with VOICE-BIBLE string `recruit.join`: **"‹Monster› wants to be your friend!"** typed at 38 glyphs/sec.
   Then the monster's own line (see below), then: **"Shall ‹it› come along?"  ▸ Yes / No."**
   *No* is never punished: **"‹Monster› waves you off cheerfully and wanders home."**

**What they say.** Every monster has one join line and one refusal line. A sample — write all 38 in
`src/data/strings.js`:
- **Gloop** — *"Gloop!"* (That is the entire line. It is enough. It is perfect.)
- **Cactuddle** — *"You didn't run away. Nobody's ever not run away before. Can I come?"*
- **Chestnut** — *"You looked inside me. Nobody ever looks inside me. Well — they do once."*
- **Flapjack** — *"I'll flap along behind! I'm very good at behind!"*
- **Sir Gloopalot** — *"Sir, my steed likes you. My steed likes everyone. But sir — so do I."*
- **Boohoo** — *"You heard me. …Sorry. You heard me, and you didn't run. Sniff."*
- **Clankworthy** — *"…"* then, after a two-second pause, *"…yes."* (An empty helmet, deciding.)
- **Boulderdash** — *"I am very heavy and I break bridges. Will that be a problem? …It usually is."*
- **Wyrmsley** — *"His Grace's tea has been undrinkable for years. I shall require a new employer."*
- **Bogwallop** — *"Room in that wagon for a big lad?"*

**Naming.** A window with the monster's model spinning slowly on the left and the name field on the right.
- The field is **pre-filled with a good default** (Gloop → "Dollop", Flapjack → "Pancake", Cactuddle →
  "Prickle", Chestnut → "Nutty", Boulderdash → "Pebbles", Wyrmsley → "Jenkins"). Confirm accepts it instantly:
  a six-year-old presses A twice and gets a monster with a lovely name.
- Below: a **wheel of eight suggestions** generated from a per-species list, re-rollable with the Menu button.
- Below that: an on-screen alphabet grid, 8 characters max, plus a shuffle-suggest button. Touch and keyboard
  both work. Backspace is always visible.
- Duplicates auto-suffix: a second Dollop becomes **Dollop II**, then **Dollop III**. Kids find this hilarious
  and will farm it deliberately. Let them.
- Confirm → the monster bows/hops/salutes (per-species `joinPose`, 900 ms) → **"‹Name› joined the party!"**
  → the party jingle → back to the field.

**Afterwards (this is what makes it stick).** Recruited monsters walk in a trailing line behind the hero on
the field, hopping in their own idle rhythm, each one 0.55 u behind the last on a recorded path. Pressing
Confirm on one gets a line of dialogue that **changes by Act**. They pile into the wagon on the world map.
In the party menu their portrait is their actual 3D model on a small turntable. And when a monster is in the
wagon and you enter its home region, it says something about home.

---

## 8. THE KIDS' FAVOURITE: **CACTUDDLE**

Not Gloop. Gloop is the mascot — the logo, the plush, the thing on the box. Every child will *like* Gloop
within ten seconds and will never think about it again, because Gloop has no problem.

Cactuddle has a problem, and it is a problem a six-year-old and a twelve-year-old understand equally well:
**it wants a hug and it cannot have one.** Everything about the design serves that single joke-that-is-not-a-joke.
Its attack hurts *it* as well as you, and it apologises. Its idle is a step forward and then a step back. Its
one moving expressive part is a flower that droops when it is losing. It has the friendliest recruit odds in
its entire tier (1/6) because it is *desperate*, and the game should reward a child for being the first person
ever to say yes to it.

Then the long game: a potted Cactuddle stands on the Puddlewick green from Act I, hours before the
player can ever meet a wild one, saying something new each Act. So when the desert finally coughs one up,
the child does not meet a monster — they meet **that one from home**. And when their Cactuddle is walking
behind them across the world map, arms permanently open, never once managing to reach them, that is the whole
game in one silhouette.

Also: it is the easiest of all thirty-eight to draw with a crayon, and that is not a small thing.

---

## 9. PALETTE ADDITIONS — `NEEDS: F3 to add these to src/art/palette.js`
```
M_GLOOP #4C86D8  M_GLOOP_G #5FBF7E  M_GLOOP_R #C24C6E  M_BLOOP #E88BB4  M_GLOP #7E6B45
M_GLIMMER #C9D3DC  M_BAT #7B5FA8  M_CHICK #F5D467  M_BEAK #E8913C  M_ROOT #EFE3D0
M_LEAF #5FA544  M_CAP #D3524C  M_BEE_Y #F2C230  M_STEEL #9AA7B8  M_STEELDARK #6A7484
M_BLADE #D9E2EC  M_BLADEDARK #7C8896  M_PLUME #D3524C  M_GHOST #DCE8F2  M_GHOST_B #C9CFE8
M_GHOST_GREY #B8C0CC  M_WOOD #8A5A32  M_DARKWOOD #3A2A22  M_IRON #5B5F6B  M_IRON_COLD #7A8290
M_IRONDRESS #4E5866  M_GOLD #E3B23C  M_DARKGOLD #A07A2C  M_BRASS #C9973C  M_BRONZE #8A6A3C
M_SILVER #C4CBD4  M_CRAB #E2734A  M_OWL #B08A5E  M_VELVET #6B3A6E  M_MOTH #C8A96E
M_MOTHWING #E4CFA8  M_GLOVE #D3524C  M_BARK #6E5236  M_TWINE #C9B487  M_STONE #8A8578
M_MOSS #6E8F52  M_GLOWSTONE #FFC46B  M_CACTUS #6FA65A  M_SPINE #E9DCC0  M_FLOWER #E86FA0
M_CHITIN #4A6E8A  M_STRIPE #E9A23B  M_JEST_A #D3524C  M_JEST_B #E9C23B  M_JEST_DARK #4A2B52
M_JEST_GOLD #C9973C  M_SKIN_PALE #F2D9C4  M_MOLE #6B5A6E  M_FLAME #FFB13B  M_SQUID #8E6FB8
M_CLOUD #E8EEF6  M_CLOUDDARK #A8B4C8  M_BOLT #FFF08A  M_DRAGON #4E8C6A  M_BELLY #E4D2A8
M_BELLY_C #D8D2A0  M_SHADOW #3A3352  M_CATEYE #7FE8B0  M_CASSOCK #2E2A44  M_EMBER #FF9E5E
M_CARDINAL #7A1F2E  M_WINGDARK #2A2038  M_TOAD #6E8F52  M_STOLE #4A3A5A  M_PORCELAIN #F0E6DC
M_ICEBLUE #7FA8D8  M_RUBY #C0304A  M_VOID #241E33  M_VOIDEYE #E8E0FF  M_SUNSPOT #E8A04A
```

## 10. NEEDS (other owners)
- **P20 / spells**: monsters use the player spell names from SYSTEMS §3 / CANON §7 (`Mend, Mendall, Scorcha,
  Kascorcha, Nip, Nipper, Kanip, Whiffle, Zapple, Kazapple, Snoozle, Bolster, Wobble, Scarper, Wakey`) plus the
  monster-only move `Muddle` (confusion).
- **P27 / music**: the Befriending Fanfare (§7 step 5), `quiet_hand` (the battle melody slowed on organ) for Whistfell and `boss` for B4,
  and ten seconds of scored silence after B4's death.
- **P15 / battle presentation**: the 0.4 s dead beat before a recruit, the 2.5 s held camera after B2, and the
  saturation ramp for B5.
- **P30 / treasure**: Chestnut must be able to *be* a chest on the field map — one chest in nine, never the
  first chest of a new save, never in a story-critical room.
- **P23 / maps**: place names used here (all from CANON.md §2) — Puddlewick Vale, the Long Lane, the Beck, the
  Whispering Wood, Saltmarrow Coast, Cobwell Manor, Coddleston Downs, the Bellhollow Belfry, Quaggerton and the
  Sogglemarsh, the Whistling Caves, Marbleford Downs, the Frittering Sands, the Quiet Quarry, the Sighing Grotto,
  the Grey Ruins, the Frostbottom, Highfeather's cloud road, Whistfell Abbey, the Quiet Deep.
- **F3 / palette**: `M_SUNSPOT #E8A04A` (Pip) is included in §9.
