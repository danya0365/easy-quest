# The World Bible — Aldenmoor
**Piece P23 owns the map files. This document is the authority on geography, place, people and wayfinding.
Everything here is original to us. Nothing is copied from Square Enix. Where a name rhymes with a memory,
that is affection, not theft.**

The world is called **Aldenmoor**: a green, damp, sheep-bothered land of low hills and long lanes, ringed by a
cold sea, with a desert biting at its southern heel and a castle in the clouds nobody quite believes in.
It is fond of you. It rains, but only prettily.

Our hero is a boy of Puddlewick (default name **Corin**), son of the wandering knight **Sir Aldous Braye**.
The story runs boy → man → father across three chapters. The bride candidates are **Wren Thistlethwaite** of
Larkinbeck (childhood friend), **Lady Odile Gilderoy** of Marbleford (the rich one), and her younger sister
**Prudence "Pru" Gilderoy** (the sharp one). The retainer is **Mungo Pell**, cook. The villain is
**Archdeacon Vexil** of the Order of the Hollow Bell. The first monster friend is a saber-kitten, **Nutmeg**.

---

## 1. The World Map

Overworld map id `aldenmoor`, kind `world`, **192 × 160 tiles**, `theme: 'grass'`, `music: 'overworld'`.
The grid below is the *region schematic* at 1 cell = 14 × 13 overworld tiles. A builder tiles each cell with
that region's terrain rules, then hand-places the numbered entrances.

```
         c1   c2   c3   c4   c5   c6   c7   c8   c9  c10  c11  c12  c13  c14
      +-------------------------------------------------------------------------+
 r1   | ~~   ~~   ^^   ^^   **   **   **   ^^   ~~   ~~   ~~   ~~   ~~   ~~ |  THE COLD SHOULDER SEA
 r2   | ~~   ^^   **   **  [11]  **  [12]  ^^   ^^   ~~   ~~   ~~   ~~   ~~ |  THE FROSTBOTTOM
 r3   | ~~   ^^   ^^   ^^   ##   ^^   ^^   ^^   ~~   ~~   ~~   ~~   ~~   ~~ |  ~ Wolfscarf Pass at c5 ~
 r4   | ~~   TT   TT  [04]  ##   TT   TT   //   //   ~~   ~~   ~~   ~~   ~~ |  THE WHISPERING WEALD
 r5   | ..   TT   ""  [03]  ##   ""   //  [07]  //   ~~   ~~   ~~   ~~   ~~ |  PUDDLEWICK VALE / DOWNS
 r6   | ..   ""  [01]  ##   ##   ##   ##  [06]  ##   ##   >>   ~~  [10]  ~~ |  THE LONG LANE (main road)
 r7   | ..   ""   ##  [05]  //   //   ##   //   //   ,,   ..   ~~   ..   ~~ |  MARCHMOUNT DOWNS
 r8   | ..   ..   ##   //   ,,   ,,   ##   ,,   %%   %%  [09]  ~~   ~~   ~~ |  THE SOGGLEMARSH
 r9   | ~~   ..  [08]  ##   ,,   ,,   ##   ,,   %%   %%   ..   ~~   ~~   ~~ |  BRACK COAST
 r10  | ~~   ~~   >>   ..   ::   ::   ##   ::   ::   ..   ~~   ~~   ~~  [16]|  SUNDERSCORCH SANDS
 r11  | ~~   ~~   ~~   ::  [13]  ::   ##   ::   ::   ~~   ~~   ~~   ~~   .. |
 r12  | ~~   ~~   ~~   ::   ::   ::  [14]  ::   ~~   ~~   ~~   ~~   ~~   ~~ |
      +-------------------------------------------------------------------------+
      [15] THE HIGH ROOST — a separate sky layer, directly above r6c7. Reachable only in flight.
```

**Legend.** `~~` deep sea (impassable on foot) · `..` shore, walkable, low encounters · `,,` plain ·
`""` meadow (Puddlewick Vale, the softest green in the game) · `//` downs/hills · `TT` forest ·
`%%` marsh (slow walk, 1.4× encounter rate) · `::` sand · `**` snowfield · `^^` mountain wall (impassable)
· `##` road: **half encounter rate, always leads somewhere, always has a signpost at every fork** ·
`>>` harbour berth · `[n]` a location entrance.

**Locations.** [01] Puddlewick · [03] Larkinbeck · [04] Nettlecombe Manor · [05] Gogglestone Caves ·
[06] Castle Marchmount · [07] Bellhollow Abbey · [08] Port Bracklesby · [09] Quaggerton · [10] Marbleford ·
[11] Coldcomfort · [12] The Glasswing Grotto · [13] Parchmouth · [14] Grimhold Quarry · [15] The High Roost ·
[16] Hollowbell Keep. ([02] Hollybank Cottage is an interior inside [01]; [17] Wagonwright's Rest is a
one-room waystation on the road at r7c7.)

### Travel connections and what gates them

| # | Connection | Gate | Flag / item |
|---|---|---|---|
| T1 | Puddlewick ↔ Larkinbeck (the Beck Bridge, r5-r6 c4) | none — open from minute one | — |
| T2 | Puddlewick Vale ↔ Whispering Weald | none, but Manor door is barred | `ch1.manor_invite` |
| T3 | Vale ↔ Marchmount Downs (**Coppermill Pass**, r6c5-c7) | a rockfall until Father clears it | `ch1.pass_open` |
| T4 | Downs ↔ Brack Coast (the Long Lane south) | none | — |
| T5 | Coast ↔ Sogglemarsh (**the Duckboard Causeway**) | needs `item.stiltboots` from Quaggerton's ferryman | `item.stiltboots` |
| T6 | Bracklesby harbour → Parchmouth (coastal packet ferry) | pay 40 gold, one-way, story only in Ch.1 | — |
| T7 | **The ship *Merry Wren*** — all `..` shores | given by King Alverd after Ch.2's rescue | `ch2.ship` |
| T8 | Straits of Brack → Marbleford | ship only | `ch2.ship` |
| T9 | Wolfscarf Pass → Frostbottom | blizzard blows you back without the **Wolfscarf** | `item.wolfscarf` |
| T10 | Glasswing Grotto mouth | frozen shut; the **Emberbell** thaws it | `item.emberbell` |
| T11 | Grimhold Quarry | you do not walk in. Ch.1 ends by dragging you there. Later a back stair opens | `ch2.begin` |
| T12 | The Gullet (whirlpool ring around [16]) | the **Tide-Bell** stills it | `item.tidebell` |
| T13 | **The High Roost** | flight on **Pomfret the Featherhorse** | `ch3.featherhorse` |
| T14 | The wagon | follows on `##` and `,,` `""` `..` only; waits outside towns, dungeons and marsh | — |

**Rule for the builder:** a gate is never a locked door with no explanation. Every gate has a *person or
a thing standing there telling you what it wants*, in one line, forever, even after you have opened it.

---

## 2. Every Location

Format: id · kind · size · job · landmark · music · four NPCs · searchables · the pull onward.

### [01] `puddlewick` — town — 40 × 34
See §3. The emotional anchor. Visited three times, different each time.

### [02] `hollybank` — interior — 14 × 12
The hero's house inside Puddlewick. See §3.

### [03] `larkinbeck` — town — 44 × 36
**Job:** the first *bigger* place. Puddlewick is home; Larkinbeck is the world beginning. It has the first
shop, the first inn bed, and the first girl who is braver than you.
**Landmark:** a waterwheel the size of a house, turning, audible from four tiles into the meadow.
**Music:** `town`, but the flute enters only when you cross the bridge — so arriving *sounds* like arriving.
**NPCs:**
- **Wren Thistlethwaite** — nine, fearless, has already decided you are her friend. "You're the boy from over the beck. You look like you need someone brave." / "There's a ghost house in the wood. I'm going. You can come if you don't cry."
- **Bramwell Thistlethwaite, innkeeper** — Wren's father, kind, permanently apologising for his daughter. "Six gold a bed, and I'll not charge the cat." / "If our Wren has told you about the manor, she's told you a *version* of it."
- **Ozzy Kettleby, the mill-boy** — thirteen, thinks he is a bandit chief. "Toll to cross. That's two gold. ...Fine, nothing. Don't tell." / "One day I'll have a *proper* gang. Currently it's me and a duck."
- **Goodwife Sump** — sells vegetables, gossips at extraordinary speed. "Turnips, turnips, and — no, that's a turnip too." / "Sir Aldous walked through at dawn. Grim as a Monday, that man."
**Searchable:** 11 barrels, 6 pots, the mill hopper (hides 30 gold under the flour), the inn's wardrobe
(a **Chimera Wing**), a bookshelf that reads out the first hint about the Manor's music boxes.
**Pulled onward by:** Wren, physically. She walks to the north gate, stops, waits, and calls your name once
every twenty seconds until you follow.

### [04] `nettlecombe_manor` — dungeon — 48 × 44 across three floors
Full room-by-room in §4. Short version: the haunted house every child needs to survive once.
**Landmark:** a single lit window in a black house, visible from the Vale road at night.
**Music:** `dungeon` — but it is a *waltz* played on one music box, too slow, with a stuck note.
**NPCs (ghosts, all four are talkable and none of them attack):**
- **Barnaby the Butler-shade** — dead 200 years, still on duty, deeply embarrassed by the dust. "Madam is not receiving. Madam has not received since the Tuesday she died." / "If you must wander, do wipe your feet. Some of us have standards and no legs."
- **Ottilie, the Waiting Bride** — sad, gentle, does not know she is dead. "Is it evening? He said before evening." / "You've a kind face. Would you tell the band to start? Nobody will start."
- **The Chandelier Cat** — a cat. Ghost. Still a cat. "Mrrp." / "(It rolls over. It is transparent. It wants its tummy rubbed and there is nothing to rub.)"
- **Master Fen, the boy who hid** — a child ghost under the stairs, the game's first quiet gut-punch. "I'm winning. I've been winning for ever such a long time." / "Don't find me. If you find me, the game's over, and then what have I got?"
**Searchable:** 21 containers; the Manor is deliberately *rich* (35% hit rate) so the scary place rewards you.
**Pulled onward by:** Wren goes on ahead every time you dawdle, and you can hear her whistling one room away.

### [05] `gogglestone_caves` — dungeon — 34 × 30, two floors
**Job:** the small, safe, wet cave that teaches "dark places are fine, actually". Where you find Nutmeg.
**Landmark:** two round white boulders either side of the mouth — the goggles. From a distance the hillside
appears to be squinting at you.
**Music:** `dungeon`, thinned to a low drone and dripping water; the melody only returns in the kitten's room.
**NPCs:**
- **Hollis Grebe, a prospector** — optimistic, wrong. "Copper! Copper everywhere! ...Or possibly wet rock." / "Forty years I've mined this hill. Forty years of nearly."
- **Mrs Grebe** — sits at the mouth with a flask, waiting. "He'll be out at six. He's always out at six." / "Tell him the soup's going cold. Tell him it's been going cold since 1102."
- **A lost sheep named (by its collar) Doris** — wanders, follows you one room, then loses interest. "Baa." / "(Doris considers you at length, and finds you acceptable.)"
- **Wick the echo-boy** — shouts into the deep for fun. "HELLO! ...hello... See? He's still there." / "I asked him once if he was lonely. He said 'lonely'. Which — yeah."
**Searchable:** 8 pots left by miners, 3 ore veins (sparkle points, 100% — copper, then a **Slime Crown**
on the third), and one crack in the wall you can only see if you walk right of the waterfall (**hidden path
→ Nutmeg's nest**).
**Pulled onward by:** a mewing sound that gets louder as you approach the correct fork. The audio *is* the map.

### [06] `castle_marchmount` — town (castle) — 56 × 50, courtyard + two interior floors
**Job:** awe. The first building bigger than your whole village. Where Father kneels to someone.
**Landmark:** four copper spires gone green, visible from six regions.
**Music:** `castle` — brass, ceremonial, and it *ducks to nothing* the moment the King speaks.
**NPCs:**
- **King Alverd the Mild** — a tired, decent man who would rather be gardening. "Sir Aldous. And a small Sir Aldous. Splendid." / "I am told a king should be terrible. I am mostly damp."
- **Chamberlain Pobble** — furious about protocol, three feet of him. "One does not *run* in the Hall of Ancestors. One processes." / "You have tracked meadow into a room that is four hundred years old."
- **Sir Grizel Dunt, guard captain** — enormous, sentimental, weeps at parades. "Halt! ...Oh, it's a small one. Proceed, small one." / "I have stood at this door eleven years. I know every crack in it by name. That one's Kevin."
- **Nib, the kitchen cat** — the castle's true ruler. "Prrrt." / "(Nib has taken your position. Nib is not giving it back.)"
**Searchable:** 26 containers — the castle is the *stingiest* (18%) because you're a guest and it's funny.
The throne-room drawers are all empty and each has a line about how kings keep nothing in drawers.
**Pulled onward by:** the King gives you the errand out loud, and the HUD quest line changes on the word.

### [07] `bellhollow_abbey` — interior — 30 × 26
**Job:** the safe harbour. Save point, revival, confession, and the only place in the game with silence in it.
**Landmark:** a bell tower with no bell — the hollow of Bellhollow. You can see the empty frame from the road.
**Music:** `sad`, played on one voice, very quietly; a single sustained chord when you save.
**NPCs:**
- **Abbot Hearne** — warm, unhurried, has all the time in the world for a child. "Sit. There's no hurry in here; we took it out." / "Whatever it is, it's smaller inside this room. That's rather the point of the room."
- **Sister Vellum, the archivist** — dry as a biscuit, delighted by facts. "Ask me anything. Then let me talk for a while." / "The bell was taken. Not stolen — *taken*. There is a difference and I intend to explain it."
- **Old Tobin, who is always here** — nobody knows if he is staff. "I'm waiting." / "For? Oh. I've stopped asking myself that. Ruins the waiting."
- **Piper, an orphan of six** — draws on the flagstones in chalk. "That's you. I gave you a sword because you looked like you wanted one." / "Is your dad coming back? Mine says he is."
**Searchable:** 9 containers (33%), a poor box you can *give* to (donate 20g → the Abbot blesses you: +1 luck
for the next dungeon, a real mechanic), and the crypt stair, locked until Ch.3.
**Pulled onward by:** the Abbot's second line always names your current objective in gentle, non-quest-y words.

### [08] `port_bracklesby` — town — 52 × 40
**Job:** the smell of the wider world. Gulls, rope, tar, strangers with accents.
**Landmark:** a crane, and a beached whale-ribcage the children play in.
**Music:** `town` in 6/8 with a concertina and a gull sample; it lurches like a deck.
**NPCs:**
- **Captain Marla Sprat** — small, terrifying, twenty-nine ships and no first mate left. "You've sea in you. Or you've eaten something." / "Forty gold to Parchmouth. And if you're sick, you're sick over the *side*, not the cat."
- **Deckhand Bo** — nineteen, homesick, will not admit it. "I've been everywhere. Twice." / "...Is Puddlewick nice? Asking for — for a chart I'm making."
- **Tallowman Crick** — sells lamp oil, smells of it, married to it. "Best oil on the coast. Second best on the sea, but the sea's a liar." / "Burn it slow. Things you burn fast, you regret."
- **The Fish Woman (name withheld, on principle)** — will not tell you her name. "Fish." / "You'll get my name when you've bought forty fish. Nobody has ever bought forty fish."
**Searchable:** 19 containers (25%), plus **crates on the quay** — one in nine contains a live crab that
skitters off and drops 5 gold. Under the third duckboard: a **Mariner's Charm**.
**Pulled onward by:** the harbour signpost lists three destinations, two greyed out, one bright.

### [09] `quaggerton` — town — 46 × 38, all on stilts and walkways
**Job:** weirdness that is friendly. A town where the ground is a lie. Kids adore it.
**Landmark:** a house built in a dead tree, thirty feet up, with a bucket-lift.
**Music:** `town` with a bassoon and frog percussion; the frogs are in time with the beat.
**NPCs:**
- **Ferryman Squelch** — pole, hat, opinions on mud. "There's mud and there's *mud*. This is mud." / "Boots off my boards. That mud's from Tuesday and it's *personal*."
- **Grandma Bogle** — 94, brews something illegal, sharp as a tack. "Drink this. No. Look at me. *Drink it.*" / "I've buried three husbands and one of them's still complaining."
- **Titch, a marsh-boy** — has a pet frog he is convinced is a dragon. "This is Gorgon. He is a dragon of the deep." / "He's a bit small for a dragon. He's *concentrated*."
- **Herbalist Nettle** — sells cures, believes in absolutely all of them. "Marsh-thistle. Cures everything except being wrong." / "You look peaky. Everyone looks peaky. It's the light. It's *always* the light."
**Searchable:** 14 containers (25%). **Under the walkways:** four spots where the boards are loose — drop
through for a small stash, then climb a ladder back. The marsh water hides a **Ring of Wading**.
**Pulled onward by:** Squelch will pole you to the causeway the second you have the Stilt-Boots, chatting.

### [10] `marbleford` — town — 54 × 44
**Job:** wealth, and how funny wealth is. This is where the bride plot happens in Ch.2.
**Landmark:** Gilderoy Hall — white, absurd, forty windows, a hedge cut into the shape of the family.
**Music:** `town`, but strings-and-harpsichord, a minuet, slightly too pleased with itself.
**NPCs:**
- **Lady Odile Gilderoy** — beautiful, sheltered, kinder than her house. "I've read about outside. It sounded loud." / "Everyone who comes here wants something. You want... directions? Oh. How *restful*."
- **Prudence "Pru" Gilderoy** — younger, blunt, the funniest person in the game. "You've got hay on you. Don't move it, it's the most interesting thing here." / "My sister is very good. I'm very *accurate*. People prefer good."
- **Rudolpho Gilderoy** — the father; loud, loving, ridiculous, would die for his daughters. "WHO. Speak up. WHO ARE YOU." / "A ring, boy. Not gold — anyone has gold. Bring me a ring that *cost you something*."
- **Butler Wimm** — has served this family for fifty years and is *so tired*. "Sir will announce you. Sir has announced everyone." / "There is a right fork for everything. Nobody has ever used the right fork."
**Searchable:** 24 containers (25%), but Gilderoy Hall's are gold-heavy (average 80g). The hedge maze hides
a **Golden Comb**. Under Odile's window: a ladder somebody left, and a line about who left it.
**Pulled onward by:** Rudolpho states the ring quest at volume; the HUD line becomes "Find a ring worth a life."

### [11] `coldcomfort` — town — 38 × 32
**Job:** endurance made cosy. Deep snow outside, absurd warmth inside every door.
**Landmark:** a chimney belching orange sparks, seen through the blizzard as a smudge of warm colour.
**Music:** `town` at half tempo, one clarinet, a hearth crackle under it. Outside, wind. Inside a door: melody.
**NPCs:**
- **Elder Fossick** — hospitable to the point of aggression. "You're COLD. Sit. SIT. Soup." / "Nobody leaves this village hungry. It's not a rule, it's a *threat*."
- **Bram the trapper** — laconic, has three words a day and spends them well. "Grotto's shut. Ice." / "You'll want the Emberbell. Nasty little thing. Works."
- **Twin girls, Hettie and Ness** — finish each other's sentences, incorrectly. "There's a fox up the —" / "— chimney. Mountain. She means mountain."
- **The dog, Biscuit** — enormous, warm, will lie on your feet if you stand still. "Whuff." / "(Biscuit has decided you are furniture. This is an honour.)"
**Searchable:** 12 containers (25%). Snowbanks: 6 diggable mounds, 2 hold items, 4 say "Snow. Cold. Snow."
The Emberbell is bought here for 300g or given free if you fed Biscuit earlier.
**Pulled onward by:** Bram walks to the north gate and points. He does not say anything. He points.

### [12] `glasswing_grotto` — dungeon — 44 × 40, three chambers deep
Full room-by-room in §4. The ice cave with the shield in it.
**Landmark:** a frozen waterfall, blue-white, forty feet high, with something glinting behind it.
**Music:** `dungeon` on glass/bell voices; every footstep adds a tiny chime to the mix.

### [13] `parchmouth` — town — 42 × 36
**Job:** somewhere genuinely foreign, and the last soft place before the worst thing.
**Landmark:** a single palm and a well with a rope-worn stone lip.
**Music:** `town` on plucked strings and hand drums; heat shimmer in the visuals timed to the beat.
**NPCs:**
- **Water-Warden Sahil** — controls the well, takes the job seriously, is nine. "One cup each. Rules is rules." / "My grandmother gave me the ladle. That's basically a crown."
- **Merchant Bazzo** — sells anything, mostly sand. "Genuine relic! From the desert! Which is where sand is from!" / "You drive a hard bargain. You said 'no'. Nobody says 'no'."
- **Widow Ashani** — lost a husband to the Quarry, says his name daily. "Kem. His name was Kem. Say it back to me." / "They take men south and send back a wage. I'd rather have the man."
- **Old Fig, under the palm** — has not moved in the memory of the town. "Shade's mine. Sit in it, don't stand in it." / "Everything comes past this tree eventually. Even you. Even them."
**Searchable:** 16 containers (25%). The well (rope down: 200g and a **Sunhat**). Three sand-mounds; one
hides the entrance to a smuggler's tunnel that later becomes your way *out* of the Quarry.
**Pulled onward by:** in Ch.1 you don't leave — the story takes you. Ashani's lines seed the dread.

### [14] `grimhold_quarry` — dungeon — 50 × 30, mostly linear
**Job:** the ten years. The chapter break. Not a place you explore; a place that happens to you.
**Landmark:** a black step-pyramid of cut stone that grows a course taller each cutscene.
**Music:** `sad` reduced to a work-rhythm — one drum, one voice humming the Puddlewick theme wrong.
**NPCs:**
- **Fellow-slave Osric** — became your friend over a decade, in about nine lines total. "New lad. Don't look up. Looking up's how they see you." / "Ten years. You were a boy when you got here. Don't tell me the year."
- **Overseer Blunt** — cruel in a small, bureaucratic, believable way. "Quota. That's all I am. A number with a whistle." / "I don't hate you. That'd take effort."
- **Sister Ilma, smuggled in** — keeps a hidden shrine behind a rock. "Two candles. That's the whole church." / "Pray if you like. I mostly just say people's names."
- **The Bell that is not rung** — the Order's stolen Bellhollow bell, hanging, silent, in the pyramid's mouth. (Examine: "It has no clapper. Somebody took its voice out on purpose.")
**Searchable:** almost nothing, deliberately (4 containers, 3 empty) — poverty is a *level design decision*.
The one that is not empty holds Osric's carved wooden bird, which he gives you, which you keep for the
whole rest of the game as an equippable trinket (+2 defence, description: "Osric made this. It took a year.")
**Pulled onward by:** the escape is a timed run through the smuggler's tunnel from Parchmouth, with Osric.

### [15] `high_roost` — dungeon/castle — 40 × 40, a sky island
**Job:** wonder. The moment a child's mouth opens. It is the reward for everything.
**Landmark:** it *is* the landmark — a white castle on a cloud shelf, faintly visible from every outdoor map
at dawn, at 4% opacity, forever, from the very first minute of the game.
**Music:** a new theme, `roost`: choir pad, harp, no percussion, and it never resolves its last chord.
**NPCs:**
- **The Keeper of Feathers, Ammiel** — ancient, mild, slightly bored of prophecy. "You are late by two hundred years. Nobody is cross." / "The shield, the helm, the sword, the — yes, all of it. It is a *list*. I am sorry it is a list."
- **Pomfret the Featherhorse** — your flying mount, an enormous friendly bird-horse with opinions. "*(Pomfret regards you, then lowers one wing like a staircase.)*" / "*(Pomfret has eaten your hat. Pomfret is not sorry.)*"
- **The Cloudwright** — builds clouds, complains about the weather he makes. "Cumulus today. Ugh. Lumpy." / "Everyone wants dramatic. Nobody wants *maintainable*."
- **A very small angel called Bib** — new to the job, terrified of heights. "I don't — I don't look down. That's the trick. Don't look down." / "How do you *walk* about with all that sky under you?"
**Searchable:** 13 containers (25%) but every reward is rare. Empty ones say celestial nonsense.
**Pulled onward by:** Ammiel physically hands you the list and it appears in the quest log as four bullets.

### [16] `hollowbell_keep` — dungeon — 60 × 52, four floors
**Job:** the last climb, and the reunion. This is where your mother is.
**Landmark:** an iron bell-tower with the stolen Bellhollow bell inside it, ringing wrong.
**Music:** `battle` melody played slow and sacred on organ — the villain's theme is your battle theme, ruined.
**NPCs:** (four, all captives or turncoats)
- **Deacon Mott** — a true believer having doubts, mid-sentence. "The Bell speaks. It — it used to speak." / "You'd think a god would be *warmer*."
- **The Cook, Nan Puddifoot** — captured from Puddlewick years ago; recognises you. "...You've got your mother's chin. Oh. Oh, love." / "I've fed monsters for eleven years. They say please. That's the horror of it."
- **Lady Meriel** — your mother, held in the bell-chamber, and the game's throat-tightening moment. "I knew the shape of you before I knew the face." / "Your father sat you on the wall and said 'that one's ours.' Both of you. He meant both of you."
- **Archdeacon Vexil** — the villain, courteous throughout, which is worse. "You have come a very long way to be told no." / "I don't want the world to end. I want it to be *quiet*."
**Searchable:** 27 containers (30% — endgame generosity). Vexil's study has a diary that explains him in
three entries and makes an eleven-year-old sad.
**Pulled onward by:** the bell gets louder per floor. Volume is the compass.

### [17] `wagonwrights_rest` — interior — 16 × 12
A one-room roadside inn at the Long Lane crossroads. Job: a laugh and a bed. **Landmark:** a wagon on the roof.
**NPCs:** **Wagonwright Doss** ("Wheel's twelve gold. Bed's six. Bed's better value and I hate that."),
his wife **Fenna** ("He's been fixing that wheel four years. It's not a wheel any more, it's a *hobby*."),
a travelling bard **Lull** ("I know one song." / "It's about a wheel. Don't ask."), and a **sleeping dog**
that must be stepped over ("(You step over the dog. The dog acknowledges nothing.)").

---

## 3. Puddlewick — the home village, in loving detail

`puddlewick`, kind `town`, **40 × 34 tiles**, theme `grass`, music `town`.

**The plan.** A stream (the Beck) runs south-west to north-east through the top third, crossed by a
humpbacked stone bridge. South of it: the green, with a well at its centre and a chestnut tree leaning
over the well. Around the green, seven houses in a loose ring, doors facing in. North-east corner:
the shrine of Saint Alden — three stones and a bench, no roof. West edge: sheep pen, six sheep, a gate a
child can open. East edge: the lane out, a signpost, and a low wall the hero sits on in the opening cutscene.
**Hollybank Cottage** (`hollybank`, 14 × 12) is the north-west house: kitchen with a hearth, a table with
three chairs (one is Father's and is bigger), a ladder to a loft with the hero's bed, a chest at its foot,
and a window that looks at the chestnut tree.

**Landmark from outside:** the chestnut tree — the only tall thing for a mile, on a rise, visible from six
tiles into the meadow in every direction. In every generation the tree is drawn slightly differently.

**Music:** the Puddlewick theme is the game's *home motif*: eight bars, oboe over guitar, in G. It is quoted
in the title screen, hummed wrong at Grimhold Quarry, played in full brass at the end of Chapter 3, and it is
the melody the Nettlecombe music boxes play. A child who plays this game will hum it in the car.

### The four constant NPCs (they change across visits — see below)
- **Nan Puddifoot, the baker** — floury, warm, calls everyone "love". *V1:* "Warm one, love. Don't tell your father." / "You've got the look of a boy who's about to do something daft."
- **Old Hob, at the well** — leans on the well, has leaned on it since before the well. "Well's deep. Don't fall in it. That's the whole of my advice." / "Your father were a boy here. Ran everywhere. Same as you."
- **Mungo Pell** — your family's cook, big, gentle, terrible singer, will follow you into hell later. "I've made a stew. It's mostly stew." / "You go on and play. I'll be here. I'm always here, me."
- **Tam and Bel, twins of seven** — play a chasing game with rules they invent live. "You're It. You've been It since Tuesday." / "New rule: the well is safe. New rule: it isn't."
Plus **six wandering sheep**, **a cat on the bakery wall**, and **a duck who has decided the well is his**.

### Visit 1 — Chapter 1, the hero is a boy (flag `ch1.home`)
Time of day: late afternoon, long shadows, warm key light. Weather clear. Sheep: 6. Doors: all seven open.
Props: bunting between four houses (harvest festival prep), a trestle table with pies on the green,
a half-built maypole. NPC count 11 + 3 animals. Encounters: none inside; the surrounding meadow is
`rate: 0.02` and the monsters are Blorbs, which apologise when they die.
Searchables: 18 containers, 5 hold something. The chest at the foot of the hero's bed contains
**a wooden sword** (real, equippable, 2 attack, description: "Father made it. Badly. On purpose.").
Departure: Father calls from the lane. The camera lingers on the cottage window for 1.5s as you leave.

### Visit 2 — Chapter 2, the hero is a man, ten years after the Quarry (flag `ch2.home`)
**What changes, exactly:**
1. **Time of day forced to overcast dawn**; `light.sun` down 40%, fog up, saturation −25% on the palette.
2. Music: the Puddlewick theme, but **only the bass line**, no oboe. The melody is missing and a child will
   feel it before they can say it.
3. **Four of seven houses are burnt shells** — roof props swapped for `ruin_beam`, doors `solid`.
   Nan Puddifoot's bakery is one of them; her oven is cold and searchable and contains nothing, and the
   search line reads: "Cold. Long cold."
4. The chestnut tree is **alive but scorched on one side**, and now has a rope swing that nobody made.
5. The bunting is on the ground, wet. The maypole is a stump. The trestle table is firewood.
6. Sheep: **1**, and it is Doris from the Gogglestone Caves, which the sharp-eyed will notice.
7. NPCs: **3 only** — Old Hob (older, still at the well, "Well's still deep. Some things keep."),
   a squatter family (the Marrows: mother Kit, boy Rill) who are frightened of you until you speak twice,
   and **Mungo Pell**, who has waited here for ten years, and whose first line is his second line from
   Visit 1: "I said I'd be here." He joins the party permanently in this scene.
8. **Hollybank Cottage** is intact but stripped: no chairs, no hearth-fire, dust motes in the light shaft.
   The loft bed is still made. Searching it gives **your mother's hair-ribbon** and the game does not
   explain what it is; it goes in Important Items and it never leaves.
9. Encounters in the surrounding meadow now `rate: 0.06`, table swapped to Grumbleboars.

### Visit 3 — Chapter 3, the hero is a father (flag `ch3.home`)
**What changes, exactly:**
1. Time of day: **noon**, brightest lighting in the game; a rebuild flag makes seven houses whole, with
   **new thatch on four of them** — visibly newer straw, a different colour. The player paid for it in Ch.3
   (300g at Bellhollow) and the game shows exactly where the money went.
2. Music: full Puddlewick theme, oboe **and** a second voice — a child's recorder, slightly flat, doubling it.
3. Nan Puddifoot is back (she was rescued from Hollowbell Keep) and the oven is lit. Her line: "Warm one,
   love." — identical to Visit 1. The repeat is the whole point. Do not change one word of it.
4. **Your two children** play the twins' chasing game on the green, with the twins' exact invented rules,
   now grown-up rules taught to them by Tam and Bel, who are adults with jobs and are visibly bored by it.
5. The maypole is up. The bunting is new and slightly wrong (someone hung it upside down; an NPC mentions it).
6. Sheep: **9**, including Doris, who is old, and lies down a lot.
7. The rope swing from Visit 2 has a proper seat on it now. Your daughter is on it.
8. Hollybank Cottage: hearth lit, four chairs — the big one is at the table and **nobody sits in it**.
   Searching the big chair gives no item and prints: "It's the right size for him. It always was."
9. The chest at the foot of the loft bed now contains the **wooden sword** again — your child put it back.

---

## 4. Two dungeons, room by room

### DUNGEON A — Nettlecombe Manor (Chapter 1, levels 4-7)
Three floors, 48 × 44. You enter with **Wren**, age nine, who is braver than you and says so.
The gimmick: **you carry a candle.** Light radius 5 tiles. Draughts blow it out; you relight at sconces.
This is the only time in the game vision is limited, and it lasts twenty minutes, and it is *thrilling*.

| Room | What is in it | Notes |
|---|---|---|
| **A1 Porch & Front Hall** | Barnaby the Butler-shade blocks you politely until you say your name. Two sconces, a coat-stand with four coats and one is warm. | Teaches: talk to ghosts, they are people. Chest: **Candle** (mandatory). |
| **A2 Portrait Gallery** | Eleven portraits. Nine watch you. Two do not — those two are doors. | **Puzzle 1:** examine all portraits; the two that never turn to face you open when pushed. |
| **A3 Kitchen** | The dinner service marches in single file across the floor, forever. Harmless. | **The scare, part 1** — plates, at knee height, in the dark, with a sound. Nothing attacks. |
| **A4 Larder (hidden)** | Behind the third barrel in A3. 4 containers, 3 of them full. | Rewards the child who searched a scary room anyway. |
| **A5 The Long Stair** | Master Fen, the boy hiding under the stairs. Wind here blows the candle out. | The gut-punch. Wren goes quiet for the next two rooms. |
| **A6 Nursery (1F)** | A cot, a rocking horse that rocks, **Music Box 1** on the shelf. | Take the box. The horse stops. |
| **A7 Ottilie's Room (2F)** | The Waiting Bride at a window. Her dress is laid out. **Music Box 2** under the dress. | She asks you to tell the band to start. Quest line updates: "Find three music boxes." |
| **A8 The Ballroom (2F)** | Vast, black, thirty chairs against the wall. Twelve ghost-guests standing still, waiting. The floor is a checkerboard. | **Puzzle 2:** the guests are standing on the tiles of a dance step. Step the same pattern (shown by a chandelier's shadow) to open the belfry stair. Three attempts, then the shadow slows down. It cannot be failed. |
| **A9 The Study (2F)** | A guest book naming every ghost. Reading it makes each ghost's second line change to something kinder. | Optional, and the best twenty seconds in the dungeon. |
| **A10 Cellar (via A3)** | Mud, roots, a black knot of root wearing a groom's coat. **Music Box 3** is *inside* the roots. | **The scare, part 2** — the roots move when the candle is low. |
| **A11 The Belfry (3F)** | **BOSS: Mumbleroot the Grudge.** A tangle of root and grief in a wedding coat, 180 HP, two attacks (Bind: skip a turn; Cold Draught: blows the candle out and darkens the battle backdrop for one round). It never targets Wren. | Beaten, it unravels into a plain black coat lying on the floor. No death rattle. |
| **A12 The Ballroom, after** | The three boxes wind. The waltz plays *right* for the first time. Ottilie and the groom-shade dance one circuit. Every ghost claps. Barnaby weeps and apologises for weeping. | **Treasure:** the **Silver Nutmeg-Charm** (accessory, +5 luck; description: "Somebody was finally allowed to go home.") plus 400g in the coat pockets, and Wren says the line that makes her the childhood friend for the rest of the game. |

**Exit:** the front door, always unlocked, always visible on the minimap. A rope by the belfry drops you
straight to A1 if you want out.

### DUNGEON B — The Glasswing Grotto (Chapter 3, levels 24-28)
Three chambers, 44 × 40, ice. The gimmick: **ice physics** — on `ice` tiles you slide until you hit
something. Every slide puzzle in this dungeon can be reset by walking back to its entrance.

| Room | What is in it | Notes |
|---|---|---|
| **B1 The Frozen Fall** | The entrance behind a curtain of blue ice. The Emberbell thaws a doorway that refreezes behind you (cosmetic; you can always leave). | Establishes the palette: white, cyan, one warm orange from your own lantern. |
| **B2 The Chime Gallery** | Nine hanging icicles of different lengths. Striking them plays notes. | **Puzzle 1:** play the Puddlewick home motif (eight notes; the sequence is on a plaque in B1, and the *game has been humming it at you for twenty hours*). Opens B3. A child who has been listening solves this and feels like a genius. |
| **B3 The Long Slide** | A 20 × 14 ice field with rock pillars. Sliding puzzle: reach the far ledge. | **Puzzle 2**, three-move solution, and a signposted "wrong" route that dumps you back at the start safely. |
| **B4 The Mirror Pool** | Black ice you can see through; something enormous is under it, moving slowly, and it never comes up. | **The scare.** It is never explained. It is never a monster. It is just *there*, forever. |
| **B5 The Rookery** | Hundreds of ice-butterflies (**Glasswings**) roosting. Walking calmly: they part. Running: they swarm, screen goes white, you take 0 damage and are placed back at the door. | Teaches patience in the gentlest possible way. |
| **B6 The Cracked Span** | A bridge that fractures behind you over eight seconds. Falling drops you into B3 — no damage, no loss, just the walk back. | The only "timed" thing in the game, and it cannot hurt you. |
| **B7 Wintergreen's Nook (hidden)** | Behind the fourth pillar in B3, reachable only by a deliberate mis-slide. A hermit, **Wintergreen**, boiling tea. "I don't get many." / "That's not a complaint. That's a *review*." | Sells three items nobody else sells. Best-kept secret in the game. |
| **B8 The Aerie Shrine** | **BOSS: Hoarfax the Ninefold**, a nine-tailed frost-fox, 900 HP. Each tail it loses removes one of its abilities, visibly — so the fight gets *easier and more beautiful* as it goes. Attacks: Frostbreath (party ice damage), Ninefold Feint (nine weak hits), Hush (silences one caster for 2 turns). Never uses Hush twice running. | It does not die: at 0 HP it sits down, sneezes, and becomes recruitable at 1/8 odds. Named **Foxglove** by default. |
| **B9 The Reliquary** | **Treasure: the Feather-Shield of the Roost** (one of Ammiel's four list items), plus 3 chests: **Ice-Silk Robe**, 2000g, and a **Seed of Life**. | The shield gets a full ceremony: fanfare, held aloft, camera orbit, the `roost` theme's first four bars. |

---

## 5. Discovery rules

**The contract:** every pot, barrel, crate, drawer, wardrobe, cupboard, bookshelf, oven, sack, urn,
sarcophagus and hollow log in Aldenmoor is searchable. There are no decorative containers. Ever.

| Container class | Hit rate | Typical contents |
|---|---|---|
| Pots & barrels (towns) | **1 in 4** | 3-25g (70%), herb/antidote (25%), a rare item (5%) |
| Pots & barrels (dungeons) | **1 in 3** | gold ×2.5 region rate, or a consumable |
| Drawers, wardrobes, cupboards | **1 in 3** | gold, one key item per chapter, a clothing joke |
| Bookshelves | **1 in 1 for text**, 1 in 8 for items | lore, a hint, a pun, occasionally a **Recipe** |
| Sparkle points (a glint on the ground) | **always** | never empty, ever — this is the promise |
| Chests | **always** | full ceremony: open anim, item aloft, fanfare, "You found X!" |
| Ore veins / snow mounds / loose boards | **1 in 2** | region-specific material |
| Castle Marchmount (all classes) | **1 in 6** | it's a joke and the empty lines carry it |
| Grimhold Quarry | **1 in 4 of 4 containers** | poverty as level design |

**Empty-container lines** — the empty ones are where the CHARM budget is spent. Never repeat one within a
map. Minimum 60 in `src/data/strings.js`, keyed by container type. Samples:
- "Nothing. The pot is doing its best."
- "Empty. It has the smell of a pot that once held something marvellous."
- "Just a spider. She looks up. You look away first."
- "Somebody has already been through this drawer. Recently. Hm."
- "Socks. Only socks. Somehow, all left."
- "A barrel of rainwater and one extremely surprised frog."
- "Nothing but a note reading 'I got here first.' It is not signed."
- "Beans. So very many beans. You take none of them, out of respect."
- "The wardrobe is full of coats. None of them are your size and all of them are lovely."
- "Empty — but you can hear the sea in it, and you're four hundred miles inland."
- "A single boot. Its friend has gone on ahead."
- "Dust, arranged with real commitment."

**Where secrets hide** (six recurring patterns — teach each once, then reuse):
1. **Behind the waterfall.** Taught in Gogglestone Caves. Reused in Glasswing (B7) and Hollowbell (F3).
2. **The dead-end alley.** Every town has one lane that goes nowhere; every one has a pot at the end of it,
   and that pot is always full.
3. **The loose board.** Quaggerton teaches it (drop through the walkway). Reused in Bracklesby's quay and
   Hollybank's loft.
4. **The wall that is the wrong colour.** One tile per dungeon, 4% lighter, pushable. The minimap does
   *not* show it.
5. **The pot on the roof.** Reachable by a crate you can push, in three towns. Always 200g+.
6. **The visible unreachable chest.** Placed in view early (the Manor's belfry, seen from A2) to teach that
   the world continues. Always eventually reachable, always in the same chapter it was shown.

**The generosity rule:** a player who searches everything in a town should come out about 15% richer than
one who ignores it — enough to feel clever, never enough that ignoring it punishes you.

---

## 6. Wayfinding — the six-year-old guarantee

**Design axiom: a child is never lost, and never told they were lost.** Five overlapping systems, each of
which alone would be sufficient. Redundancy is the feature.

**1. The quest ribbon (HUD, piece P32).** Top-left, always on, one line, **maximum seven words**, imperative,
present tense, no jargon, no place-names the player hasn't heard spoken aloud yet.
Examples: *"Follow your father to the pass."* · *"Find three music boxes."* · *"Ask Wren about the manor."*
· *"Sail to Marbleford. Bring the ring."* It updates on the *same frame* an NPC finishes the line that
changes it, with a soft chime and a two-second gold pulse.

**2. The chevron.** When the objective is more than 20 tiles away and off-screen, a small gold chevron sits
at the screen edge in that direction, at 60% opacity, with the distance in whole tiles under it. It fades
out entirely when the objective is visible, so the child learns to look at the world, not the arrow.
Toggleable in Settings; **on by default**; auto-strengthens (opacity 100%, plus a trail of gold leaves for
8 seconds) if the player has wandered >90 seconds without reducing the distance. This is the anti-frustration
system and it must never announce itself with a popup.

**3. Signposts.** Physical, wooden, at *every* road fork on the overworld and every town gate — 23 of them.
Read at 2 tiles with `confirm`. They list 2-3 destinations with a hand pointing, and the *current objective's*
destination is carved deeper and catches the light. Signposts also state distance in a friendly unit
("Marchmount — a morning's walk"). A signpost never lists a place you cannot yet reach without also saying
why: "Frostbottom — closed. The snow says no."

**4. Landmark silhouettes.** Every region owns one shape you can see from three regions away, drawn in the
far layer with fog: Puddlewick's **chestnut tree**; Larkinbeck's **waterwheel**; Marchmount's **four green
spires**; Bellhollow's **empty bell frame**; Bracklesby's **crane**; Quaggerton's **tree-house**;
Marbleford's **white hall**; Coldcomfort's **orange chimney-smoke**; Parchmouth's **single palm**;
Grimhold's **black step-pyramid**; Hollowbell's **iron bell tower**; and above them all, at 4% opacity from
the first minute of the game, **the High Roost**. The rule: *if you can see it, you can walk to it.*

**5. People who tell you, in character.** Three tiers:
- **The Town Crier NPC.** Every town has one (Puddlewick: Old Hob; Larkinbeck: Goodwife Sump; Marchmount:
  Sir Grizel; and so on — each named in §2). Their **second line is always the current objective**, rewritten
  in their own voice, and it changes with the flags. This is the single most important authoring rule in the
  whole document: *the Crier's line is generated from the quest state, never hand-written per scene.*
- **Escort NPCs.** In Chapter 1, Wren and Father physically walk to the next place and wait, calling your
  name every 20 seconds. A child follows a person; a child ignores an arrow.
- **The companion point.** Nutmeg (and later any front-of-wagon monster) will, if you stand still for six
  seconds, trot four tiles toward the objective, sit, and look back at you. No text. No sound. Just a cat,
  being right.

**6. Structural guarantees (piece P33 enforces these as tests).**
- **No dungeon can trap you.** Every dungeon has an escape rope item on the floor within 20 tiles of its
  entrance, and the Chimera Wing item works everywhere outdoors.
- **No one-way door closes behind you without a visible way back**, and the way back is on the minimap
  before the door shuts.
- **No missable item.** If a chapter is about to end and something is unclaimed, an NPC hands it to you.
- **No unwinnable state.** Defeat = wake at the nearest church, half your gold, everything else intact, and
  the Abbot says something kind. Gold lost is banked at Bellhollow if you deposited it, which the Abbot
  explains once, in one sentence, the first time you have over 200g.
- **The minimap** (hold `map`) shows the current map, your position, exits, and **NPC dots — but not chests**.
  Finding treasure stays the player's job; finding the door never is.
- **Every locked thing states its key out loud** in the examine text: "Barred. Something about a *bell*."

---

*End of the World Bible. Regions: 9. Enterable locations: 17. Named NPCs: 70+. Every one of them is a person
in two lines, and every one of them is glad you came.*
