# THE SYSTEMS BIBLE
### Numbers, rules and ceremonies for a browser Dragon Quest V, tuned for a six-year-old and a twelve-year-old playing on the same sofa.

**Status:** law for `src/data/growth.js`, `src/battle/formulas.js`, `src/data/spells.js`, `src/data/items.js`,
`src/data/shops.js`, `src/world/encounter.js`, `src/battle/*`. Everything here is a real number. If a builder
finds themselves inventing a value, that is a bug in this document — report it under `NEEDS:`.

**Original world note.** Every name below is ours. Our cast is Alder, Wynn, Nettle, Bosco, Tam and Ellie; our
places are Havenbrook, Barleymow, Port Pelican, Castle Marrowgate, Coldkettle Peaks, Grandhollow Keep; our
monsters are Puddleslime, Munchroom, Hobbleghast and friends. Nothing is transcribed from Square Enix.

**The two children this is tuned for.** *Rosie, 6* — cannot reliably read a long sentence, presses Confirm
because it makes a nice noise, will not understand "your attack missed", cries at a Game Over screen. *Ivo, 12* —
reads everything, wants to feel clever, will notice if the game is patronising him and will absolutely find the
overpowered item. Every rule below has to serve both: **Rosie must never be stuck; Ivo must never see the
training wheels.**

---

## 1. The stat model and every formula

### 1.1 The seven stats
| Stat | Shown to the player as | What it does |
|---|---|---|
| HP | **Hit Points** | Life. 0 = knocked out (never "dead" — the word is "worn out"). |
| MP | **Magic Points** | Spell fuel. |
| Str | **Might** | Physical damage. |
| Agi | **Nimbleness** | Turn order, flee chance, dodge. |
| Res | **Resilience** | Defence, status resistance. |
| Wis | **Wisdom** | Spell damage and healing power, magic resistance. |
| Luck | **Luck** | Crit rate, status landing/resisting, treasure jitter. |

### 1.2 Derived values
```
ATK = Might + weapon.power + (bonus from Bluster/attack buffs)
DEF = floor(Resilience / 2) + armour.def + shield.def + helm.def + accessory.def
MAG = Wisdom                              // spell offence & healing
MDEF = floor(Wisdom / 3) + gear.mdef      // magic resistance
SPD = Nimbleness
```

### 1.3 Physical damage
```
raw   = ATK - (DEF / 2)
if raw <= 3:  dmg = 1 + rng.int(0, 2)              // the "chip floor" — a hit is never 0
else:         dmg = raw * 0.60 * rng.float(0.90, 1.12)
dmg   = max(1, round(dmg))
```
The chip floor exists so that a six-year-old attacking a boss she should not be attacking still sees a number
pop and a monster flinch. **Zero is never printed in this game.**

**Worked example.** Alder at Lv 5: Might 20, Copper Sword (+11) → ATK 31. A Munchroom has DEF 9.
`raw = 31 - 4.5 = 26.5`; `26.5 * 0.60 = 15.9`; variance roll 1.04 → 16.5 → **17 damage**. Munchroom has 26 HP,
so it dies in two hits. That is the target shape for ordinary encounters all game: **two to three hits per
common monster, four to six turns per battle.**

### 1.4 Hitting and missing
Kids hate missing. Player physical attacks are **hit-first**:
```
missChance = enemy.evade + (attacker.blinded ? 0.25 : 0)      // enemy.evade is 0.00–0.06, most are 0.00
missChance -= min(0.03, Luck / 1000)
if lastActionWasAMiss(attacker): missChance = 0                // never two misses in a row, ever
```
Only four monsters in the whole game have `evade > 0` (Flitterbug 0.06, Pickpocket Imp 0.05, Hobbleghast 0.04,
Old Grumbletusk 0.03). A miss prints **"Alder swishes through thin air!"** with a comedy *whiff* — it reads as a
joke, not a punishment. Enemies miss the player on the same maths using the player's Nimbleness/1000.

### 1.5 Critical hits ("**A terrific whack!**")
```
critChance = 0.031 + Luck / 512          // Lv1 ≈ 4.6%, Lv30 Alder ≈ 15.6%
critChance = min(critChance, 0.16)
critChance += 0.03  if the hidden struggle score S >= 40   (see §6.4)
critDmg = ATK * 0.90 * rng.float(0.95, 1.15)     // ignores DEF entirely
critDmg = max(critDmg, normalHitAverage * 1.75)  // a crit always *looks* like a crit
```
Crits also fire the crit presentation: white flash, 180 ms screen shake at 6 px, damage number 1.6× size in
gold, and a bright *shing–crunch*. Enemies **can** crit, at a flat 1/64, and **cannot** crit at all while
S ≥ 30.

### 1.6 Spell damage
```
base   = spell.base + MAG * spell.k
dmg    = base * elementMult * (1 - min(0.60, target.MDEF / 200)) * rng.float(0.92, 1.08)
dmg    = max(1, round(dmg))
```
`elementMult` is 1.0 normally, **1.5 if weak** (ice on a fire-thing), **0.5 if resistant**, **0.0 → prints
"It has no effect at all!"** and refunds half the MP (Rosie insurance). Group spells apply to each target
independently; there is **no** damage reduction for hitting several enemies — big spells are meant to feel big.

**Worked example.** Ellie at Lv 20: Wisdom 116. She casts *Kanip* (base 40, k = 0.55, ice, all enemies).
`base = 40 + 116*0.55 = 103.8`. A Frostnip is ice-resistant (×0.5), MDEF 30: `103.8 * 0.5 * (1-0.15) = 44.1`,
roll 1.02 → **45**. A Munchroom next to it takes `103.8 * 1.0 * (1-0.05) * 0.99 = 97.6` → **98**. Ellie feels
enormous, which is the point of Ellie.

### 1.7 Healing
```
heal = spell.base + MAG * spell.k
heal = round(heal * rng.float(0.95, 1.10))
heal = min(heal, target.maxHP - target.HP)      // never print an overheal number
```
If the target is already at full HP the spell is **not consumed**: the cursor refuses with a soft *bonk* and
"Nettle is already in the pink!" No MP lost, no turn lost. (Rosie will do this at least forty times.)

**Worked example.** Nettle at Lv 20: Wisdom 80. *Mendmore* (base 45, k = 0.45): `45 + 36 = 81`, roll 1.03 → 83.
Alder at Lv 20 has 182 max HP, so one Mendmore is 46% of his bar — always worth a turn, never a full top-up.

### 1.8 Turn order
Rolled fresh every round:
```
initiative = SPD * rng.float(0.75, 1.25) * (isPlayerSide ? 1.10 : 1.00)
```
Sorted descending. The **+10% player thumb on the scale** means the party usually acts first, which is what
makes a turn-based game feel fair to a child. Ties break toward the player.

**First strike / ambush.** After the encounter roll: 6% chance the party gets a free round ("**You've caught
them napping!**"), 4% chance the enemy does ("**They came out of nowhere!**"). Enemy ambush is **disabled
entirely while S ≥ 25**, and can never happen on the first three encounters of a new map.

### 1.9 Fleeing
```
p = 0.55 + 0.40 * (partyAvgAgi / (partyAvgAgi + enemyAvgAgi))
p += 0.25 * failedFleeAttemptsThisBattle
if failedFleeAttemptsThisBattle >= 2: p = 1.0        // the third try ALWAYS works
```
A failed flee costs the party's turn but the enemy attacks at **×0.75 damage** that round ("you were already
half out of the door"). Bosses refuse flight with a joke rather than a rule ("*Grandhollow plants himself in the
doorway with the calm of a man who has nowhere else to be.*") — and every boss room has a **Retreat Bell** on a
plinth outside it, a free reusable item that walks you back to the church. **No child is ever locked in a room
with a boss they cannot beat.**

**Worked example.** Party avg Agi 26 vs. two Bogling (Agi 11). `p = 0.55 + 0.40*(26/37) = 0.83`. Fails once →
next attempt 1.00. Practically: *running away always works within two tries*.

---

## 2. Levels 1 to 30 — the curve and six growth personalities

### 2.1 One shared EXP table
All six characters share **one** table. This is a deliberate departure from the reference: separate tables
produce a lagging character, and a lagging character produces a stuck child.

| Lv | Total EXP | To next | Lv | Total EXP | To next | Lv | Total EXP | To next |
|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 7 | 11 | 1,170 | 420 | 21 | 13,300 | 2,750 |
| 2 | 7 | 16 | 12 | 1,590 | 530 | 22 | 16,050 | 3,200 |
| 3 | 23 | 24 | 13 | 2,120 | 660 | 23 | 19,250 | 3,700 |
| 4 | 47 | 45 | 14 | 2,780 | 820 | 24 | 22,950 | 4,250 |
| 5 | 92 | 68 | 15 | 3,600 | 1,000 | 25 | 27,200 | 4,850 |
| 6 | 160 | 100 | 16 | 4,600 | 1,200 | 26 | 32,050 | 5,550 |
| 7 | 260 | 140 | 17 | 5,800 | 1,450 | 27 | 37,600 | 6,300 |
| 8 | 400 | 190 | 18 | 7,250 | 1,700 | 28 | 43,900 | 7,100 |
| 9 | 590 | 250 | 19 | 8,950 | 2,000 | 29 | 51,000 | 8,000 |
| 10 | 840 | 330 | 20 | 10,950 | 2,350 | 30 | 59,000 | — |

**The catch-up rule (invisible, essential).** A party member whose level is 3+ below the party's highest earns
**×2 EXP**; 6+ below earns **×3**. This is what lets Tam and Ellie join late and be useful in one dungeon, and
what stops "the character Rosie never puts in the front line" from becoming dead weight.

**Level 30 is the ceiling for the main story.** The final boss is tuned for a party at **Lv 26–28**. Reaching 30
is a reward for the curious, not a requirement.

### 2.2 How to read the growth tables
Each character is defined by **anchor stats** at levels 1, 5, 10, 15, 20, 25, 30 (Nettle also at 18).
```
stat(L) = round( lerp(anchorBelow, anchorAbove, t) )     // t = (L - Lbelow)/(Labove - Lbelow)
gainAtLevel(L) = stat(L) - stat(L-1)                     // this is what the level-up window prints
```
Half rounds up. This is deterministic — **no random stat gains**, because a child who rolls badly and a child
who rolls well must not end up with different games. What varies is *which* stats jump, and that is authored.

### 2.3 Alder — *the Steady Oak* (the hero)
Balanced, no bad levels, no offensive magic, the best HP-to-usefulness ratio in the game, and a real power
spike from 24 onward when his Might curve steepens. Sword and shield. He heals; he does not blast.

**Full table (this is the worked expansion of §2.2 — build the other five the same way):**

| Lv | HP | MP | Might | Nimble | Resil | Wis | Luck || Lv | HP | MP | Might | Nimble | Resil | Wis | Luck |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 20 | 0 | 10 | 8 | 9 | 4 | 8 || 16 | 139 | 44 | 56 | 41 | 53 | 35 | 33 |
| 2 | 26 | 2 | 13 | 10 | 12 | 6 | 10 || 17 | 150 | 49 | 60 | 43 | 56 | 38 | 35 |
| 3 | 32 | 4 | 15 | 12 | 14 | 7 | 11 || 18 | 160 | 53 | 64 | 46 | 60 | 40 | 37 |
| 4 | 38 | 6 | 18 | 13 | 17 | 9 | 13 || 19 | 171 | 58 | 68 | 48 | 63 | 43 | 39 |
| 5 | 44 | 8 | 20 | 15 | 19 | 10 | 14 || 20 | 182 | 62 | 72 | 51 | 67 | 46 | 41 |
| 6 | 52 | 11 | 23 | 17 | 22 | 12 | 16 || 21 | 195 | 67 | 77 | 54 | 71 | 49 | 43 |
| 7 | 59 | 14 | 26 | 19 | 25 | 14 | 17 || 22 | 208 | 72 | 82 | 57 | 75 | 52 | 45 |
| 8 | 67 | 16 | 29 | 22 | 27 | 16 | 19 || 23 | 220 | 78 | 86 | 59 | 80 | 56 | 48 |
| 9 | 74 | 19 | 32 | 24 | 30 | 18 | 20 || 24 | 233 | 83 | 91 | 62 | 84 | 59 | 50 |
| 10 | 82 | 22 | 35 | 26 | 33 | 20 | 22 || 25 | 246 | 88 | 96 | 65 | 88 | 62 | 52 |
| 11 | 91 | 26 | 38 | 28 | 36 | 22 | 24 || 26 | 261 | 94 | 102 | 68 | 93 | 66 | 54 |
| 12 | 100 | 29 | 42 | 31 | 39 | 25 | 26 || 27 | 276 | 100 | 107 | 71 | 98 | 69 | 57 |
| 13 | 110 | 33 | 45 | 33 | 43 | 27 | 27 || 28 | 290 | 106 | 113 | 74 | 102 | 73 | 59 |
| 14 | 119 | 36 | 49 | 36 | 46 | 30 | 29 || 29 | 305 | 112 | 118 | 77 | 107 | 76 | 62 |
| 15 | 128 | 40 | 52 | 38 | 49 | 32 | 31 || 30 | 320 | 118 | 124 | 80 | 112 | 80 | 64 |

### 2.4 The other five — anchors
**Wynn Applegarth — *the Firecracker*.** Childhood friend, red plaits, whip and boomerang, fire magic and one
heal. Front-loaded: for the whole of chapter one she is *better than you*, and she never quite stops being
proud of that. Flattens hard after 20 — she stays the fastest, but Tam overtakes her damage at 22.

| Lv | 1 | 5 | 10 | 15 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|---|
| HP | 17 | 40 | 74 | 105 | 132 | 155 | 175 |
| MP | 6 | 20 | 40 | 58 | 74 | 88 | 100 |
| Might | 9 | 21 | 38 | 52 | 63 | 72 | 79 |
| Nimble | 12 | 26 | 44 | 58 | 69 | 78 | 85 |
| Resil | 7 | 16 | 28 | 38 | 46 | 53 | 59 |
| Wis | 9 | 22 | 40 | 55 | 67 | 77 | 85 |
| Luck | 10 | 18 | 27 | 34 | 40 | 45 | 49 |

**Nettle Quillon — *the Slow Bloom*.** The quiet noblewoman with the sharp tongue. Nearly useless until 15,
then the best healer and the luckiest creature alive. Extra anchor at 18 to make the bloom feel like an event.

| Lv | 1 | 5 | 10 | 15 | **18** | 20 | 25 | 30 |
|---|---|---|---|---|---|---|---|---|
| HP | 15 | 30 | 50 | 74 | **92** | 112 | 152 | 196 |
| MP | 8 | 22 | 42 | 68 | **88** | 108 | 150 | 195 |
| Might | 6 | 11 | 17 | 24 | **29** | 33 | 42 | 51 |
| Nimble | 9 | 16 | 25 | 34 | **40** | 45 | 55 | 65 |
| Resil | 8 | 15 | 24 | 34 | **42** | 48 | 62 | 77 |
| Wis | 11 | 22 | 36 | 54 | **66** | 80 | 106 | 132 |
| Luck | 14 | 26 | 44 | 64 | **76** | 86 | 105 | 120 |

**Bosco Pentola — *the Boulder*.** The family cook who is somehow also seven feet of retired guardsman. Axes
and clubs, zero magic forever, the highest HP and Defence in the game, and the slowest turn. He is the
character Rosie will pick, and he is designed so that picking him is never wrong.

| Lv | 1 | 5 | 10 | 15 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|---|
| HP | 30 | 62 | 108 | 158 | 212 | 270 | 332 |
| MP | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Might | 13 | 26 | 44 | 62 | 80 | 98 | 116 |
| Nimble | 4 | 8 | 13 | 18 | 23 | 27 | 31 |
| Resil | 14 | 30 | 52 | 74 | 96 | 118 | 140 |
| Wis | 2 | 3 | 5 | 7 | 9 | 11 | 13 |
| Luck | 5 | 8 | 12 | 16 | 20 | 24 | 28 |

**Tam — *the Prodigy*.** Your son. Joins at Lv 1 in chapter three and, with the catch-up rule, is level-parity
inside one dungeon. Grows fast in *everything* — the deliberately overpowered character Ivo will find and love.
His only weakness is that he grows into it late enough not to trivialise the middle game.

| Lv | 1 | 5 | 10 | 15 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|---|
| HP | 18 | 42 | 80 | 124 | 174 | 230 | 292 |
| MP | 5 | 20 | 44 | 70 | 98 | 128 | 160 |
| Might | 11 | 24 | 44 | 64 | 86 | 110 | 134 |
| Nimble | 10 | 22 | 38 | 53 | 68 | 82 | 96 |
| Resil | 8 | 19 | 35 | 52 | 70 | 90 | 111 |
| Wis | 8 | 21 | 40 | 60 | 82 | 105 | 128 |
| Luck | 9 | 16 | 25 | 34 | 43 | 52 | 61 |

**Elowen "Ellie" — *the Kite*.** Your daughter. Made of paper and lightning. Biggest MP and Wisdom in the game
by a distance; HP so low that one bad turn worries you. She is where the *tactics* live for a twelve-year-old.

| Lv | 1 | 5 | 10 | 15 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|---|
| HP | 14 | 30 | 52 | 76 | 102 | 130 | 160 |
| MP | 10 | 30 | 60 | 94 | 132 | 172 | 215 |
| Might | 5 | 10 | 16 | 22 | 28 | 34 | 40 |
| Nimble | 11 | 24 | 42 | 57 | 70 | 81 | 90 |
| Resil | 6 | 13 | 22 | 31 | 40 | 49 | 58 |
| Wis | 14 | 32 | 58 | 86 | 116 | 148 | 182 |
| Luck | 11 | 19 | 29 | 38 | 47 | 55 | 63 |

**Guest: Sir Corin Oakenshaw** (Alder's father, chapter one). Does not level and cannot be equipped. Fixed:
HP 260, MP 40, Might 78, Nimble 40, Resil 70, Wis 45, Luck 30. He one-shots everything in chapter one on
purpose — chapter one is about walking beside someone enormous and safe, and about what it costs when he goes.

### 2.5 Monster companions
Recruited monsters (piece P17) use one of four growth templates — **Brute** (Bosco-shaped), **Sprite**
(Wynn-shaped), **Wisp** (Ellie-shaped), **Plodder** (flat, huge HP). Each recruit gets `anchors = template ×
species multiplier (0.7–1.3)` and a personal cap between Lv 20 and Lv 30. Full roster lives in P17's own doc;
the rule that matters here is: **a recruited monster is never better than the family member it displaces.**

---

## 3. Spells — 26 of them

Notation: **MP** cost, **T** tier, target, learner and level. `k` is the Wisdom coefficient from §1.6/§1.7.

### Attack
| Spell | MP | T | Effect | Target | Learned by |
|---|---|---|---|---|---|
| **Flick** | 2 | 1 | Fire. base 8, k 0.35 | 1 enemy | Wynn 3, Ellie 2, Tam 6 |
| **Flicker** | 4 | 2 | Fire. base 22, k 0.42 | 1 enemy | Wynn 11, Ellie 9, Tam 13 |
| **Kaflick** | 10 | 3 | Fire. base 55, k 0.60 | 1 enemy | Ellie 19, Tam 24 |
| **Whiffle** | 3 | 1 | Wind. base 6, k 0.28 | all enemies | Wynn 7, Ellie 5 |
| **Whiffler** | 6 | 2 | Wind. base 16, k 0.36 | all enemies | Wynn 16, Ellie 14 |
| **Kawhiffle** | 14 | 3 | Wind. base 34, k 0.48 | all enemies | Ellie 23, Tam 27 |
| **Nip** | 3 | 1 | Ice. base 10, k 0.30 | 1 enemy | Ellie 7, Tam 10 |
| **Nipper** | 8 | 2 | Ice. base 20, k 0.42 | all enemies | Ellie 15, Tam 19 |
| **Kanip** | 16 | 3 | Ice. base 40, k 0.55 | all enemies | Ellie 22, Tam 29 |
| **Zizzle** | 20 | 4 | Lightning, ignores half of MDEF. base 60, k 0.70 | all enemies | Ellie 28 |

### Healing
| Spell | MP | T | Effect | Target | Learned by |
|---|---|---|---|---|---|
| **Mend** | 2 | 1 | Heal. base 18, k 0.30 | 1 ally | Alder 4, Nettle 1, Wynn 8, Tam 4 |
| **Mendmore** | 5 | 2 | Heal. base 45, k 0.45 | 1 ally | Alder 14, Nettle 9, Tam 15 |
| **Mendall** | 12 | 3 | Heal. base 35, k 0.35 | all allies | Nettle 20, Alder 26 |
| **Fullmend** | 9 | 3 | Restore to full HP | 1 ally | Nettle 24 |
| **Rouse** | 8 | 3 | Revive a worn-out ally at 50% HP. **Always works.** | 1 fallen ally | Alder 18, Nettle 16 |

### Support
| Spell | MP | T | Effect | Target | Learned by |
|---|---|---|---|---|---|
| **Sweeten** | 2 | 1 | Cures poison. Usable on the field. | 1 ally | Nettle 3, Alder 7 |
| **Unbind** | 4 | 2 | Cures sleep, dazzle, paralysis, confusion | 1 ally | Nettle 11, Wynn 13 |
| **Bolster** | 4 | 2 | DEF ×1.25, 5 rounds, stacks twice (×1.5 max) | all allies | Nettle 6, Alder 12 |
| **Bluster** | 5 | 2 | ATK ×1.25, 5 rounds, stacks twice | all allies | Alder 16, Bosco *(as a shout, no MP — Lv 20)* |
| **Dither** | 3 | 1 | DEF ×0.75 on one enemy, 6 rounds. Lands 90% on normals, 55% on bosses | 1 enemy | Wynn 5, Ellie 11 |

### Control
| Spell | MP | T | Effect | Target | Learned by |
|---|---|---|---|---|---|
| **Lullaby** | 4 | 2 | Sleep 2–4 rounds. Land = `0.55 + (caster.Luck - target.Res)/120`, clamp 0.15–0.85. Wakes on damage. | all enemies | Nettle 13, Wynn 18 |
| **Tanglefoot** | 5 | 2 | Roots one enemy: it cannot act 1–3 rounds. Bosses: 1 round, max once per battle. | 1 enemy | Wynn 21, Tam 17 |

### Field & utility
| Spell | MP | T | Effect | Target | Learned by |
|---|---|---|---|---|---|
| **Scarper** | 4 | 2 | Leave a normal battle instantly, no roll | party | Wynn 15, Ellie 17 |
| **Homeward** | 8 | 3 | Field only. Warp to any church already visited (pick from a list). | party | Alder 21, Nettle 22 |
| **Lanternlight** | 3 | 1 | Field only. Lights a dark cave for 250 steps; the light dims visibly at 50 steps left. | party | Wynn 9, Ellie 6 |
| **Sniff** | 2 | 1 | Field only. A little gold arrow points at the nearest unopened container within 40 tiles for 8 s. | party | Nettle 8, Tam 12 |

### 3.1 VFX and sound briefs (for P20 / `src/art/fx.js`)
- **Flick / Flicker / Kaflick.** A tiny orange pip flies from the caster's palm and *pops* into a flat, hand-drawn
  flame cluster on the target — 3 keyframes of billboarded flame with a black cel outline, 260/380/520 ms per
  tier. Kaflick adds a full-screen warm orange wash at 25% for 120 ms and a 4 px shake. Sound: a rising
  filtered-noise *whoosh* into a low resonant *whump*; Kaflick adds a brass stab.
- **Whiffle line.** Curved white speed-crescents sweep across the whole enemy line left→right, 5 arcs staggered
  60 ms. The backdrop scrolls 12 px against the sweep. Sound: airy noise sweep with a pitch bend up, plus paper
  rustle. Kawhiffle tears three visible slashes in the air that hang for 200 ms before snapping shut.
- **Nip line.** Six-pointed flat snow-crystals bloom outward and shatter into shards that fall and fade. Palette
  goes 8% blue for 200 ms. Sound: glass chime + a crisp *crack*. Kanip freezes the whole backdrop pale blue for
  300 ms with frost creeping in from the screen corners.
- **Zizzle.** Screen goes white for 60 ms, then three jagged 4 px-wide lightning polylines drawn top-to-bottom
  in 90 ms each, thunder rolling underneath. The only spell that stops the music for one bar.
- **Mend / Mendmore / Mendall / Fullmend.** Soft green motes spiral *upward* around the target and a warm ring
  expands from their feet. Number pops green with a `+`. Sound: a rising harp arpeggio (3, 5, 7 notes by tier);
  Fullmend adds a choir "ah" and a bell.
- **Rouse.** The fallen character's silhouette fills with light from the feet up over 700 ms, then they stand,
  stretch, and look embarrassed. Sound: a single struck bell, then the family theme's first four notes.
- **Bolster / Bluster.** A translucent shield-shape (Bolster, blue) or a clenched fist glyph (Bluster, orange)
  flashes over each ally and shrinks into their chest. Sound: two-note ascending brass.
- **Dither.** A grey wash drips down the enemy sprite; it visibly slumps 3 px. Sound: a descending trombone
  *wah-wah*. Ivo will use this on every boss; that is correct.
- **Lullaby.** Pink musical notes drift up; sleeping enemies get "Zzz" that bob. Sound: a music-box lullaby, 4
  bars. **Tanglefoot.** Green vines whip up from the battle floor and knot round the target's feet.
- **Lanternlight.** A warm circular gradient mask over the dark-cave shader, radius 6 tiles, flickering ±4%.
- **Homeward.** The party rises off the ground spinning, compresses to a point of light, *pop*. 1,400 ms.

---

## 4. Items and equipment — 48 entries

Prices are the **buy** price. Sell price is `floor(buy * 0.5)`. Nothing in the game sells for more than it cost.

### 4.1 Consumables (12)
| Item | Buy | Effect | Where |
|---|---|---|---|
| Herb | 8 | Heal 30 HP | Everywhere, all game. Common drop (18%). |
| Strong Herb | 32 | Heal 80 HP | Port Pelican onward |
| Fresh Herb | 110 | Heal 200 HP | Coldkettle onward |
| Nutcake | 14 | Restore 12 MP | Barleymow onward. Bosco eats one if you leave it in the bag too long — a joke, no loss. |
| Honeycake | 60 | Restore 40 MP | Marrowgate onward |
| Antidote Drop | 10 | Cures poison | Everywhere |
| Wake-me-up | 12 | Cures sleep/dazzle | Havenbrook onward |
| Angel's Kiss | 180 | Revives one ally at half HP | Churches and Marrowgate |
| Retreat Bell | — | Reusable. Leave any dungeon, including a boss room. **Cannot be lost or sold.** | One outside every boss door |
| Chimaera Feather | 40 | Field: warp to the last church visited | Port Pelican onward |
| Whiff Powder | 25 | Halves the encounter counter rate for 200 steps | Shops from Saltmarsh onward |
| Sunbottle | 90 | Battle: 60 fire damage to all enemies. Anyone can use it. | Chests; sold in Grandhollow's black-market stall |

### 4.2 Weapons (13)
| Weapon | Power | Buy | Who | Where |
|---|---|---|---|---|
| Cypress Stick | +4 | 10 | anyone | Havenbrook |
| Sling | +7 | 55 | Wynn, Ellie | Havenbrook |
| Copper Sword | +11 | 70 | Alder, Tam | Havenbrook |
| Kitchen Cleaver | +14 | 120 | Bosco | Barleymow *(he is delighted)* |
| Oak Boomerang | +16, **hits all enemies at 65% power** | 220 | Wynn | Barleymow |
| Chain Whip | +22, hits all at 75% | 300 | Wynn, Nettle | Port Pelican |
| Iron Lance | +28 | 480 | Alder, Tam, Bosco | Port Pelican |
| Steel Sword | +35 | 900 | Alder, Tam | Castle Marrowgate |
| Woodcutter's Axe | +41, −4 Nimble | 1,150 | Bosco | Castle Marrowgate |
| Ash Staff | +18, **+12 Wisdom** | 700 | Nettle, Ellie | Marrowgate |
| Frostbite Sabre | +48, ice damage +25% | 2,400 | Alder, Tam | Coldkettle Peaks |
| Thunderfork | +54, 12% chance to stun 1 round | 3,600 | Bosco, Alder | Sunken Abbey |
| **Heirloom Blade** | +66 | — | Alder only | Chapter three, the vault under Havenbrook. The story weapon. |

### 4.3 Armour (10)
| Armour | DEF | Buy | Notes | Where |
|---|---|---|---|---|
| Wayfarer's Clothes | +4 | 20 | starting gear | Havenbrook |
| Quilted Coat | +9 | 90 | +2 Resilience | Barleymow |
| Leather Jerkin | +15 | 210 | | Barleymow |
| Cook's Apron | +18 | 260 | Bosco only; +10 max HP | Port Pelican |
| Chain Mail | +24 | 560 | −2 Nimble | Port Pelican |
| Silk Robe | +19 | 640 | +8 MDEF; mages only | Marrowgate |
| Iron Armour | +33 | 1,100 | −4 Nimble | Marrowgate |
| Fur Cloak | +38 | 1,900 | Halves ice damage | Coldkettle |
| Gleaming Plate | +47 | 3,200 | −5 Nimble | Sunken Abbey |
| **Mother's Shawl** | +30 | — | +20 MDEF, immune to fear. Given, not bought. | Chapter three |

### 4.4 Shields (5) and Helms (4)
| Piece | DEF | Buy | Where |
|---|---|---|---|
| Pot Lid | +3 | 25 | Havenbrook (it is a pot lid; Bosco wants it back) |
| Leather Shield | +8 | 130 | Barleymow |
| Iron Shield | +16 | 480 | Port Pelican |
| Mirror Shield | +25 | 1,700 | Marrowgate; reflects Dither and Lullaby back at the caster |
| Dragon-scale Shield | +34 | 4,000 | Sunken Abbey; halves fire |
| Straw Hat | +2 | 18 | Havenbrook |
| Leather Cap | +6 | 95 | Barleymow |
| Iron Helm | +14 | 620 | Marrowgate |
| Crown of Quiet | +21 | 2,600 | Coldkettle; immune to sleep |

### 4.5 Accessories (4)
| Piece | Effect | Buy | Where |
|---|---|---|---|
| Lucky Acorn | +8 Luck | 300 | Barleymow's odd little shop |
| Swiftfoot Anklet | +10 Nimble | 900 | Port Pelican |
| Ring of Patience | MP regen +2 per round in battle | 2,200 | Marrowgate |
| Kitten's Bell | Encounter rate ×0.65. **A gift from the kitten you saved in chapter one.** | — | Story |

The Kitten's Bell is the single most important item in the build. It is the "I want to look at the pretty world
without fighting" button, and a child earns it by being kind to an animal in the first hour.

---

## 5. The economy — you can always afford the next thing

**The contract:** *walking through an area once, opening the chests you happen across, and losing no battles
leaves you able to buy the next area's best weapon plus a full set of Herbs, with 20–40% left over.*
Grinding is therefore never required, and the game never rewards it much either: monster gold has a hard
per-species cap, so re-fighting Puddleslimes at Lv 20 is boring by design.

| Leg | Area | Battles walking through | Gold/battle | Battle gold | Chest gold | Running purse | Big buy at the end | Price | Left over |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Havenbrook meadows | 10 | 4–8 (6) | 60 | 25 | 115 *(start 30)* | Copper Sword | 70 | 45 |
| 2 | The Hollowing Wood | 12 | 8–14 (11) | 132 | 80 | 257 | Quilted Coat + Herbs | 90+24 | 143 |
| 3 | Widdershin Tower | 14 | 14–22 (18) | 252 | 150 | 545 | Oak Boomerang | 220 | 325 |
| 4 | Coast Road → Port Pelican | 13 | 22–34 (28) | 364 | 180 | 869 | Chain Whip | 300 | 569 |
| 5 | Saltmarsh Caves | 15 | 34–50 (42) | 630 | 320 | 1,519 | Iron Lance + Iron Shield | 480+480 | 559 |
| 6 | Marrowgate Downs | 14 | 55–80 (66) | 924 | 400 | 1,883 | Steel Sword | 900 | 983 |
| 7 | Glimmering Wastes | 16 | 90–130 (108) | 1,728 | 700 | 3,411 | Iron Armour + Mirror Shield | 1,100+1,700 | 611 |
| 8 | Coldkettle Peaks | 15 | 140–200 (168) | 2,520 | 1,100 | 4,231 | Frostbite Sabre | 2,400 | 1,831 |
| 9 | The Sunken Abbey | 16 | 210–290 (248) | 3,968 | 1,600 | 7,399 | Gleaming Plate + Thunderfork | 3,200+3,600 | 599 |
| 10 | Grandhollow Keep | 18 | 300–420 (355) | 6,390 | 2,400 | 9,389 | Dragon-scale Shield, spares | 4,000 | 5,389 |

Supporting rules:
- **Inns cost `12 × partyLevel` gold**, rounded to the nearest 5. Always affordable, always a real decision
  early, never a real decision late. **Church healing and revival are free.** (The reference charges; children
  should not be taxed for a mistake.)
- **The Bank of Barleymow** stores gold in units of 100 and is unaffected by defeat. Ivo will discover this and
  feel like a genius; that is the intended lesson, not a punishment for Rosie who never uses it.
- **Sell-back is generous on outgrown gear only**: any weapon or armour two tiers below your current best sells
  at 65% instead of 50%, so upgrading never feels like burning money.
- **Every shop shows a green ▲ / red ▼ next to a piece of gear** comparing it to what the highlighted character
  already wears, with the exact stat delta. No child should have to hold two numbers in their head.
- **Chest gold jitters ±15%** and is *rounded to a pleasing number* (5, 10, 25, 50, 100). "You found 137 gold" is
  worse than "You found 150 gold!"

---

## 6. The difficulty contract

**These are promises. Breaking one is a bug of the highest severity.**

### 6.1 No unwinnable state, ever
1. Herbs are sold in every town from the first, at 8 gold, forever. Gold income per area always exceeds the
   cost of ten Herbs by 4× minimum.
2. Church revive and heal are free. The nearest church is never more than 90 seconds of walking from a boss.
3. **The gold floor: you can never be left with less than 30 gold.** If halving on defeat would take you below
   it, you keep 30. Three Herbs and a walk is always possible.
4. No door locks behind you. No item is missable. No dungeon can be entered without the means to leave (Retreat
   Bell on the plinth, and it cannot be sold, dropped or lost).
5. Save at any church, plus a **rolling autosave** on every map transition into `dqv.save.auto`.
6. If the party is wiped **twice in a row by the same boss**, the third approach adds a plain, unhurried NPC
   outside the door who offers a free full heal, three Strong Herbs, and one line of actual tactical advice
   specific to that boss. She never comments on why she is there.

### 6.2 Defeat is gentle
On a party wipe: screen fades to white (not black), the family theme plays a soft four-bar phrase, the party
wakes on the church floor. **You lose exactly half your carried gold (rounded down, floor of 30). You keep every
item, every level, every point of EXP earned in the battle you just lost, and every story flag.** The priest
says something warm and slightly funny and different each time (12 lines authored). There is no "Game Over"
text anywhere in the build. The word does not appear in `src/data/strings.js`.

### 6.3 Bosses telegraph
Every boss has exactly one **Big Attack**, and it always arrives with a full round of warning:
- **The wind-up turn.** The boss spends its action on a visible tell: it rears up / draws breath / the sky
  darkens / its weapon starts to glow. A line of text names it plainly — *"Old Grumbletusk hauls in a breath
  that rattles the whole cave."* A red chevron appears above its head and pulses at 2 Hz. The battle music
  drops to just percussion for that round.
- **The payoff turn.** The Big Attack resolves. Damage is capped: `min(rolled, 0.55 * expectedMaxHPForChapter)`
  and, the *first* time a given boss uses it in a given battle, additionally `min(rolled, 0.80 * currentHP)` per
  target — so the first Big Attack of any fight cannot knock anyone out.
- After it fires, the boss cannot use it again for **3 rounds**, and the counter is visible as three small dots
  under its HP bar. A twelve-year-old will learn to Bolster on the wind-up turn. A six-year-old will learn to
  press the green Heal button when the man goes red. Both are correct play.

### 6.4 The rubber band (invisible, always)
A hidden **struggle score `S`**, 0–100, held in the save. Never displayed. Never mentioned.
```
+12  party wipe
 +6  a character is knocked out in a battle you still win
 +4  a battle lasts more than 8 rounds
 +3  fleeing a normal battle
 +2  ending a battle with the whole party under 30% HP
 -5  defeating a boss
 -2  gaining a level
 -1  winning a battle with nobody below 60% HP
```
Effects, applied in this order as S rises. Each is small; together they are worth about a 25% swing, which is
roughly one level. They are all *removals of bad luck*, never additions of raw power — the child still wins the
fight, and the fight still looks the same.

| S ≥ | Effect |
|---|---|
| 15 | Enemy physical variance clamps to `rng.float(0.90, 1.00)` instead of `(0.90, 1.12)`. |
| 25 | Enemy ambush disabled. Herb drop rate ×1.5. |
| 30 | Enemies cannot land critical hits. |
| 40 | Player crit chance +3%. Enemy status spells land 25% less often. |
| 60 | **Second wind:** once per battle, the first party member who would drop to 0 HP survives on 1 HP instead, with a small gasp animation and a shimmer. Reads as luck. |
| 75 | Gold and EXP from normal battles ×1.2. Boss Big Attack damage cap tightens to 0.45. |

`S` decays by 1 per five minutes of clean play regardless of anything else, so the game quietly stops helping as
soon as the child stops needing it. **`S` is exposed in `__DQ.state()` as `assist: {s, tier}` for critics and
never in any player-facing surface.**

### 6.5 The floor and the ceiling
- Nothing in a normal encounter can deal more than **40% of a character's max HP** in one hit at the intended
  level for that area. Two hits in a row can hurt; three cannot happen without a warning round.
- **Ivo's ceiling:** an optional monster arena in Port Pelican with five ranked challenges, no rubber band, no
  telegraphs shortened, real difficulty, and a cosmetic prize (a hat for the wagon donkey). Optional difficulty
  lives *outside* the story, never inside it.

---

## 7. Battle flow, beat by beat

Timings are milliseconds from the moment the player presses Confirm on **Attack**. All timings scale by a
global `battleSpeed` setting (**Gentle 1.25× / Normal 1.0× / Brisk 0.7×**, default Normal, remembered per-save;
Brisk is what Ivo will pick in hour three).

### 7.1 Battle start (before any of that)
| ms | Beat |
|---|---|
| 0 | Field freezes. Encounter swirl transition begins (P29): the screen spirals inward, 520 ms. |
| 120 | Field music ducks to 0 over 200 ms. |
| 300 | Battle theme starts on the downbeat — it *never* fades in mid-bar. |
| 520 | Backdrop for the current terrain is on screen. Monsters drop in from above with a 90 ms stagger and a small dust puff each, landing with an ease-out bounce. |
| 760 | "**Two Puddleslimes and a Munchroom draw near!**" types into the message window at 38 glyphs/sec. |
| 1,180 | Command window slides up from the bottom-left over 160 ms with a *thunk*. Cursor lands on **Attack** with a blip. **Player has control.** |

Total: **1.2 s from bump to first input.** Anything slower and a child taps buttons into the void.

### 7.2 The four seconds after the player picks Attack
| ms | What happens | Sound |
|---|---|---|
| 0 | Confirm pressed. | *dink* (confirm) |
| 0–90 | Command window shrinks toward the acting character and vanishes. Target reticle, if targeting was needed, snaps off. | — |
| 90 | Battle camera pushes in 8% toward the acting pair over 220 ms, ease-out. | — |
| 140 | Actor steps forward 0.4 units over 180 ms with a proper weight-shift (P08 `attack_step`). | footfall |
| 320 | **The wind-up.** Weapon raises through 40° over 200 ms. Anticipation squash on the actor: 1.0 → 0.92 vertical. | cloth rustle |
| 520 | **Contact.** Weapon arc completes in 90 ms. On the contact frame: white flash on the target at 70% alpha for 60 ms; a 3-frame hand-drawn slash streak; screen shake 4 px (crit: 6 px) for 180 ms; the target squashes to 0.85 and recoils 0.25 units. | *thwack* (crit: *shing–crunch*) |
| 560 | **The number.** Damage pops at the target's head at 0.4× scale, springs to 1.15× over 120 ms, settles to 1.0×, floats up 22 px, holds, fades from 900 ms. Gold and 1.6× size on a crit. Target HP bar animates down over 260 ms, easing — never a snap. | — |
| 620 | Message window prints "**Alder attacks! 17 damage to the Munchroom!**" at 38 glyphs/sec. Fully typed by ~1,180 ms. | per-glyph tick, ≤1 per 26 ms |
| 700 | Actor steps back to their mark over 240 ms. Camera returns to neutral over 260 ms. | — |
| 1,000 | If the target is at 0 HP: it flashes white, squashes flat, and *pops* into a puff of 8 soft particles over 320 ms. | *pop*, a little descending three-note flourish |
| 1,400 | Hold. This pause is not dead time — it is where the hit lands emotionally. Do not remove it. | — |
| 1,600 | Next actor in the initiative order begins. If it is a player character, the command window slides back in at 1,600 and the player has control at **1,760 ms**. |

So: **an ordinary attack is ~1.6 s of animation and the player is back in control inside 1.8 s.** The "four
seconds" of a full round is four such beats overlapping — a round with four party members and three monsters
resolves in about **10–12 seconds** on Normal.

### 7.3 The rest of the round
- **Spells** follow the same skeleton but the contact beat is replaced by the VFX from §3.1, which run 260–900 ms
  by tier; the number pops on the VFX's peak frame, not its start.
- **Enemy turns** are identical but mirrored, with the camera pushing toward the *player* side, and the party
  member's HP bar flashing red and shaking for 200 ms.
- **A round ends** with a 220 ms beat before the new initiative is rolled. Status ticks (poison, buff expiry)
  resolve in this beat, one line at a time, 400 ms apart, never batched into one wall of text.
- **Auto-battle** (`Fight!` on the party menu) runs the whole round at 0.7× timing with the same visuals, so a
  child who is bored of pressing Attack can watch instead. It never uses items or MP above 50%.

---

## 8. Party and wagon rules

- **Front line: 4.** Wagon: **up to 8 more**, family and monsters together. Anyone over 12 goes to the pen at
  Barleymow farm, where they are visibly happy and can be visited.
- **Everyone in the wagon earns full EXP.** No benched character ever falls behind — combined with the catch-up
  rule in §2.1, the party is always within a couple of levels of itself.
- **Swapping.** On the field: free, instant, from the party menu, with a satisfying shuffle animation of the
  followers reordering behind you. In battle: **swapping costs that character's turn** and the incoming
  character arrives with a jump-in animation and can act next round. If the wagon cannot follow (caves, towers,
  interiors, all boss rooms), a battle-swap simply isn't offered — the option greys out with the reason printed
  ("*The wagon's outside, waiting in the rain.*") rather than vanishing.
- **Followers.** Everyone not in the front line who fits on screen trails the player in a smooth 0.6 s-delayed
  breadcrumb chain, at 1.1 units of spacing, with their own idle animations at stops. Monster companions hop
  rather than walk. This is a core warmth beat — a child should be able to stop, turn around, and see their
  whole strange family standing there looking at them.
- **A knocked-out character** is carried (a small slumped follower model) and revives automatically to 1 HP on
  a map transition to any town, plus free full heal at any church. **Nobody stays broken.**
- **Order matters mildly:** position 1 draws 35% of enemy attacks, positions 2–4 draw ~22% each. Put Bosco in
  front and the game notices.

---

## 9. Encounter rate — exploring should be pleasant

Step-counter model, not per-step dice:
```
counter += 1 * (running ? 1.15 : 1.00) * (KittensBell ? 0.65 : 1.00) * (WhiffPowder ? 0.5 : 1.0)
threshold = triangular(min, mode, max) drawn fresh after every battle
if counter >= threshold: encounter, counter = 0
```
Triangular (not uniform) means encounters cluster around a comfortable average and true back-to-back fights are
vanishingly rare.

| Terrain | min | mode | max | Feels like |
|---|---|---|---|---|
| Overworld field | 22 | 38 | 62 | a fight every ~20 s of walking |
| Forest / wood | 18 | 30 | 50 | denser, matches the closed-in feeling |
| Cave / dungeon | 16 | 26 | 44 | tense |
| Tower interior | 20 | 32 | 52 | |
| Snowfield | 20 | 34 | 55 | |
| Town, interior, bridge, any path within 12 tiles of a town gate | — | — | — | **zero, always** |

**Mercy rules, all of them non-negotiable:**
- **Grace period:** 60 free steps after any battle, 80 after entering a new map, 120 after a party wipe.
- **The gate rule:** no encounter can trigger within 12 tiles of a town entrance, a church, or a save point.
  A hurt child limping home always makes it home.
- **The look-around rule:** standing still, or moving slower than 0.8 units/sec, does not advance the counter.
  A child who stops to look at the sky is never punished for it.
- **Escalating mercy:** every consecutive battle without leaving the map adds +6 to `min` and `mode` (capped at
  +30), and it resets when you leave. Long dungeon crawls thin out on their own.
- **Visible danger tell (accessibility, P32/P33):** an optional small lantern icon in the HUD corner that
  brightens as the counter fills. Off by default; on in Kid Mode. Ivo turns it on to speedrun; Rosie's parent
  turns it on so she can say "here it comes!" and feel clever.

---

## 10. The ceremonies

### 10.1 Victory
| Time | Beat |
|---|---|
| 0.0 s | The last monster pops. Battle music cuts on the beat — a hard stop, not a fade. 200 ms of silence. |
| 0.2 s | **Victory fanfare** begins: 7 bars of brass, the same 8 notes the game will use for every good thing that ever happens to this family. |
| 0.4 s | Party members play `celebrate` — Alder raises the sword, Wynn punches the air, Bosco puts his hands on his hips and laughs, Nettle claps twice, Ellie does a small twirl, Tam copies whoever is next to him. |
| 0.9 s | Message window: "**Victory!**" |
| 1.4 s | "**The party gains 84 experience points.**" The EXP number counts up rather than appearing. |
| 2.0 s | "**...and 27 gold coins.**" A small pile of coins bounces in the window with a *chink*. |
| 2.6 s | Item drop, if any: the item icon rises, spins once, and the line types out. +600 ms per drop. |
| 3.2 s | **The signature beat:** if a monster wants to join, it hops back on screen from the side, does a hopeful little bounce, and asks. See §10.3. |
| 3.2 s *(or after the join)* | Level-ups, one character at a time. See §10.2. |
| — | Then: fade to field over 400 ms, field music resumes *at the bar it left off*, and the player is walking again. |

The player can press Confirm to skip ahead through any of the text beats, but **not** through the fanfare's
first 900 ms and **not** through a level-up. Some moments belong to the game.

### 10.2 Level-up — second by second, per character
| Time | Beat |
|---|---|
| 0.00 s | The level-up jingle stings over the victory fanfare — four rising notes, bright, unmistakable. |
| 0.05 s | A ring of gold light expands from the character's feet to over their head in 350 ms. Sparkles rise. |
| 0.35 s | The character plays `level_up`: a small jump on the spot, landing with both fists down. |
| 0.50 s | "**Alder's level has gone up to 13!**" types out. |
| 1.10 s | The stat panel slides in from the right over 180 ms. Stats list in fixed order: Max HP, Max MP, Might, Nimbleness, Resilience, Wisdom, Luck. |
| 1.30 s | Gains reveal **one per 220 ms**, each as `+3` in bright yellow next to the new value, each with its own small *tick*. A gain of 5 or more gets a slightly bigger tick and a tiny star — so a child learns to look forward to particular levels. A gain of 0 prints `—` in grey, quietly. |
| ~2.9 s | Panel holds for 700 ms. |
| 3.6 s | **If a spell was learned:** the panel wipes and is replaced by a spell card — the spell's icon at 2× scale, its name, its MP cost, and one plain-English line of what it does ("*Mendmore — heals a friend rather a lot.*"). The spell's own VFX plays behind it at 40% opacity. A three-note chime. Holds 1,600 ms. This is the single most exciting thing that happens outside the story, and it must never be rushed. |
| +0.4 s | Panel slides out; next character's level-up, or on to the field. |

Max HP and MP gained are **added to current HP and MP as well**, so levelling up always heals a little. That is
the small kindness that lets a struggling child push one room further.

### 10.3 A monster asks to join
| Time | Beat |
|---|---|
| 0.0 s | Music switches to a curious 4-bar woodwind phrase. |
| 0.3 s | The monster hops in from the right and lands centre-frame, larger than it was in battle, blinking. |
| 0.9 s | "**The Puddleslime is bouncing after you, hopeful as anything. Shall it come along?**" — **Yes / No**, cursor defaulting to **Yes**. |
| on Yes | Confetti of soft shapes, the join fanfare (the victory motif, played sweetly on flute), and "**Name your new friend:**" with a default name already filled in (*Puddle*) so a six-year-old can simply press Confirm. Eight characters, big on-screen keyboard, and the default is always something a child would be happy with. |
| on No | The monster's ears droop for 400 ms, then it shrugs and bounces off cheerfully. **No guilt, no permanent loss** — the same species will ask again. |

Join chance is `species.joinRate` (1/8 for commons down to 1/64 for rares), **but** a species that has been
refused or missed 12 times is guaranteed to ask on the 13th. Nobody's collection stalls on bad luck.

### 10.4 Chests and searching (for completeness, since the economy leans on it)
Chest opening: 200 ms lid rise → the item floats up out of it, held aloft, spinning once over 700 ms →
treasure fanfare (3 notes) → "**You found a Strong Herb!**" Roughly **1 in 4** searchable pots, barrels,
drawers and wardrobes contain something; the other three quarters print an authored joke, never a stock line.

---

## 11. Quick reference for builders
```
DMG_PHYS   = max(1, round((ATK - DEF/2) * 0.60 * U(0.90,1.12)))     floor 1+U(0,2) when raw<=3
DMG_CRIT   = max(ATK * 0.90 * U(0.95,1.15), 1.75 * avgNormalHit)    ignores DEF
DMG_SPELL  = max(1, round((base + MAG*k) * elem * (1 - min(0.6, MDEF/200)) * U(0.92,1.08)))
HEAL       = min(target.missingHP, round((base + MAG*k) * U(0.95,1.10)))
CRIT%      = min(0.16, 0.031 + Luck/512) [+0.03 if S>=40]
MISS%      = max(0, enemy.evade - min(0.03, Luck/1000)); 0 after any miss
INIT       = SPD * U(0.75,1.25) * (player ? 1.10 : 1.00)
FLEE%      = 0.55 + 0.40*(pAgi/(pAgi+eAgi)) + 0.25*fails; = 1.00 at fails>=2
EXP(L)     = table §2.1, shared; x2 if 3+ levels behind, x3 if 6+
SELL       = floor(buy * 0.5)   [0.65 for gear two tiers below your best]
INN        = round5(12 * partyLevel);  church heal & revive = 0
DEFEAT     = gold = max(30, floor(gold/2)); keep items, EXP, flags; wake at church
```

**And the one rule above all the numbers:** if a value in this document ever makes a six-year-old cry or a
twelve-year-old shrug, the value is wrong, not the child.
