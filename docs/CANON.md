# CANON — *The Lark and the Quiet Hand*
**The single source of truth for names, ages, places, acts, flags, items and spells.**
If any other document disagrees with this file, **this file wins** and the other document has a bug.
The six bibles (STORY, WORLD, MONSTER, SYSTEMS, VOICE, MUSIC) have been edited to agree with it.
Builders: when you need a name, copy it from here. Never invent a second version.

**How ties were broken.** When bibles disagreed we chose (1) the name a six-year-old can read aloud,
(2) the more charming / more Dragon-Quest-sounding option, (3) the version with the most built detail behind it.
Every choice is noted in one line in §11.

**Words used everywhere.** The story is in three **Acts** (prose). Flags use `ch1.` / `ch2.` / `ch3.` for Acts
I / II / III; the save's `chapter` field is 1, 2 or 3. The world is **Aldenmoor**. Money is **gold coins**
(**G** in menus). Spelling is British.

---

## 1. The cast

Ages are **Act I / Act II / Act III** (Act II starts ten years after Act I; Act III starts nine years after B19). "—" means not present in that Act.
The hero is **silent**; everyone else's voice must be recognisable with the name hidden.

### The family
| Name (display) | char id | Ages | Look (one line) | Voice (one line) |
|---|---|---|---|---|
| **Bram** — the hero (player-nameable, max 8 letters) | `hero` | 6 / 16 (17 by B17) / 26 | Round-headed boy in a too-big green travelling cloak, half a green ribbon knotted on his left wrist; grows into a broad, sun-browned man still wearing that frayed ribbon. | Never speaks. Nods twice, fast, to agree; grips his own left wrist when frightened. People say aloud what he does. |
| **Sir Halvard Bellwether** — the father, secretly King of Ambergarde | `halvard` | 41 / — / — | Enormous shaggy bear of a man in a patched blue surcoat, grey at the temples, greatsword carried like a walking stick. | Calls Bram **"lad"**, never "son"; ends orders with **"if you would"**; a cave-in is "a spot of bother". Never says "I love you". |
| **Queen Elowen** — the mother, last of the Skyborne | `elowen` | (taken when Bram was a baby, aged 25) / — / still 25 inside the lantern | Slight woman with feather-pale hair, a robe that moves as if there were wind indoors, glowing faintly like a candle behind a window. | Present tense, very few words, as if already remembering: *"There you are."* Thinks Bram is still a baby asleep upstairs. |
| **Willow Pye** — childhood friend, bride choice #1 | `willow` | 8 / 18 / 28 | Straw-blonde plait with one green ribbon (the other half is on Bram's wrist), sunburnt, scabby-kneed, slingshot in her pocket; grown, she runs the inn in an apron with a whip on the hook. | Dares, questions, instructions. Says **"Right then"** before anything brave or daft; "Come ON." Deflects kindness within one breath. |
| **Sera Fairweather** (Serafina) — childhood friend, bride choice #2 | `sera` | 7 / 17 / 27 | Small and dark-eyed in good clothes you cannot climb in, always a step ahead of her chaperone; grown, gracious and trapped in lace. | Painfully polite: apologises, then says something devastatingly true — **"I'm sorry, that was rude of me."** Never raises her voice. |
| **Barty Marrow** (Bartleby) — the old retainer, once a palace guard of Ambergarde | `barty` | 58 / 68 / 78 | Small, wide, bald old man in an apron worn over armour, a ladle in his belt where a dagger should be. | Cooking metaphors for everything, cheerful wrong words ("a catastrophy of onions"), calls Bram **"little master"** even when Bram is king. "I am not weeping. It is the onions." |
| **Rowan** — the son (nameable) | `rowan` | — / — / 9 | Solemn little boy in his father's old green cloak cut down, sword too big for him. | The careful twin: worries in full sentences and asks questions. Deflates bosses flatly: *"That's very sad. Are you nearly done, though?"* **Draws the Larksteel Sword.** |
| **Linnet** — the daughter (nameable) | `linnet` | — / — / 9 | Wild-haired girl with grazed knees and a rock in her fist, a feather tucked behind one ear. | The bold twin: three words, then charges. *"Oh, he's lovely."* Plays the Stone Garden scene. |

### Friends, rivals and the villain
| Name (display) | char id | Ages | Look | Voice |
|---|---|---|---|---|
| **Bobble** — a Gloop, the first monster friend | `bobble` | "400" (possibly 4) | A blue, teardrop-shaped Gloop with a monocle he does not need and cannot keep on. | Talks about himself in the third person; starts one sentence in four with **"Frankly—"**; short words, one big word used *almost* right. Everybody gets his name wrong (Bubble, Wobble, Bobbin) and he corrects them: *"BOBBLE."* |
| **Pip** — a Sunspot Cub (a sabre-toothed sunspot lion; nameable) | `pip` | kitten / huge wild Sunmane / pony-sized | Act I: a ginger kitten with two tiny sabre teeth and a little brass bell. Act II–III: a great golden lion who still tries to sit on Bram's lap. | Mews, always subtitled, and the subtitle is a lie or a demand: *"Mrrp. (I have been abandoned for nine hours.)"* |
| **Prince Bertie** (Adalbert of Coddleston), later King Bertie | `bertie` | 8 / 18 / 28 | A pear-shaped boy in ermine two sizes too grand; a pear-shaped man in armour that finally fits. | The royal **"we"** and a title he recites in full — shorter every time — until it is just "Bertie." |
| **Pru Fairweather** (Prudence) — Sera's younger sister (not a bride choice) | `pru` | — / 14 / 24 | Sharp-chinned, ink on her fingers, hat on backwards. | Blunt as a brick: *"You've got hay on you. Don't move it, it's the most interesting thing here."* Never says thank you — says **"Noted."** |
| **Lord Rudolpho Fairweather** — Sera's father, merchant prince | `rudolpho` | 44 / 54 / 64 | Vast, loud, weeping, generous; hugs strangers; rings on every finger. | Speaks at VOLUME. *"WHO. Speak up. WHO ARE YOU."* Weeps for forty seconds while you cannot move. |
| **Bishop Mortmain** of the Order of the Quiet Hand — the villain | `mortmain` | 60s / 70s / 80s | Thin, kind-faced old priest in dove-grey with soft hands and a small glass lantern at his belt. | Never raises his voice; talks like a nurse: **"there now", "gently", "that's better"**; calls everyone **"child"**. Never says "kill" or "dead" — says "kept", "lost", "quiet". Never gloats. |
| **Malgrim the Unlit** — the thing under the world that grants Mortmain's wish | `malgrim` | ancient | A vast smooth grey cocoon with eight shut eyes; inside, a small thin figure made of folded dark. | Only ever whispers. Is not angry. Wants everything to stop being so *loud*. |
| **Fennick Quiddle** — travelling merchant (every Act) | `quiddle` | 30 / 40 / 50 | Thin man under a mountain of pans. | Alliteration, prices, guarantees he weakens at once; calls Bram **"squire"**. |
| **Grandmother Nettle** — ghost lady of Cobwell Manor | `nettle` | dead 200 years | Towering grey ghost in a lace cap, holding a feather duster like a sceptre. | Furious about *dust*: *"In MY day a spectre had dado rails."* |
| **Tobin** — Mortmain's son, died aged 7 | — | (memory only) | Seen only in a small portrait in Mortmain's study. | — |

**Other named NPCs** (full lists live in WORLD-BIBLE §2–3 and VOICE-BIBLE §5b): King Alverd the Mild of
Coddleston (Bertie's father) · Mr Dodd Pye (Willow's father, innkeeper of the Contented Herring, and his parrot)
· Baron Pomfrey Stodge (comic rival suitor) · Butler Wimm · Old Hob (at the Puddlewick well) · Nan Puddifoot
(Puddlewick baker) · Abbot Hearne & Sister Vellum (Bellhollow Abbey) · Captain Marla Sprat (Port Pelican) ·
Wagonwright Doss & Fenna · Osric (quarry worker, carves the wooden bird) · Overseer Blunt · Ammiel, Keeper of
Feathers (Highfeather) · Digby (a Barrowmole, quarry friend) · Parsnip (the cart-horse) · Barnaby the
Butler-shade, Ottilie the Waiting Bride, Master Fen (Cobwell Manor ghosts) · Deacon Mott (Whistfell).

---

## 2. Places — map ids and display names

Map files are `src/world/maps/<id>.js`. `[n]` is the entrance number on the WORLD-BIBLE §1 schematic.

| [n] | id | Display name | kind | Act(s) | One line |
|---|---|---|---|---|---|
| — | `aldenmoor` | Aldenmoor | world | all | The overworld: green hills, a cold sea, a desert in the south, a castle in the clouds. |
| 01 | `puddlewick` | Puddlewick | town | I, II, III | Home village: a green, a well, a chestnut tree, the Beck. Changes every Act. |
| 02 | `hollybank` | Hollybank Cottage | interior | I, II, III | Bram's home in Puddlewick; loft bed, big chair, a paddock for spare monsters. |
| 03 | `saltmarrow` | Saltmarrow | town | I, II, III | Willow's town where the Beck meets the tide: a tide-mill wheel, a quay, gulls. |
| — | `contented_herring` | The Contented Herring | interior | I, II | The Pye family inn (and its parrot). |
| 04 | `cobwell_manor` | Cobwell Manor | dungeon | I | The haunted house in the Whispering Wood. Three floors and a belfry. |
| 05 | `gogglestone_caves` | Gogglestone Caves | dungeon | I (optional), II | Small wet cave near Puddlewick; in Act II the wild Sunmane (Pip) lives here. |
| 06 | `coddleston` | Coddleston Castle | town | I, III | Bertie's castle with four green copper spires. |
| 19 | `grey_ruins` | The Grey Ruins | dungeon | I, III | Broken abbey on Coddleston Moor where Halvard falls. |
| 19 | `stone_garden` | The Stone Garden | field | III | Walled garden beside the Grey Ruins, full of people turned to stone. |
| 07 | `bellhollow_abbey` | Bellhollow Abbey | interior | all | The kind abbey whose bell was stolen. Save, heal, the Cloud Stair to Highfeather. |
| — | `bellhollow_belfry` | Bellhollow Belfry | dungeon | II (optional) | The empty bell tower, haunted by Sexton Sootbell. |
| 17 | `wagonwrights_rest` | Wagonwright's Rest | interior | all | One-room inn with a wagon on its roof; Doss mends your wagon in Act II. |
| 14 | `quiet_quarry` | The Quiet Quarry | dungeon | I end, II start, III | Where the Order puts people to work building a black stone temple. |
| 21 | `whistling_caves` | The Whistling Caves | dungeon | II | Windy caves from the quarry to the desert; Bobble waits at the mouth. |
| 13 | `parchmouth` | Parchmouth | town | II | Desert town with one palm tree and a deep well. |
| 08 | `port_pelican` | Port Pelican | town | II, III | The big harbour: a crane, a whale-ribcage playground, the monster arena. |
| 09 | `quaggerton` | Quaggerton | town | II, III (optional) | Stilt town in the Sogglemarsh; Bogwallop sits on its only well. |
| 10 | `marbleford` | Marbleford | town | II, III | Rich white town across the strait. |
| — | `fairweather_hall` | Fairweather Hall | interior | II, III | Sera's house: forty windows and a hedge cut into the shape of the family. |
| — | `marbleford_chapel` | Marbleford Chapel | interior | II | The wedding. |
| 20 | `sighing_grotto` | The Sighing Grotto | dungeon | II | Sea-cave under Marbleford's cliffs; home of the Tide Pearl. |
| 18 | `ambergarde` | Ambergarde | town | II, III | Bram's true kingdom: a small amber-roofed town on a green headland. |
| — | `ambergarde_keep` | Ambergarde Keep | interior | II, III | The castle; the Larksteel Sword stands in its stone here. |
| 11 | `coldcomfort` | Coldcomfort | town | III | Snow village in the Frostbottom; every door opens on absurd warmth and hot springs. |
| 12 | `glasswing_grotto` | The Glasswing Grotto | dungeon | III | Ice cave behind a frozen waterfall; the Larksteel Shield. |
| 15 | `highfeather` | Highfeather | dungeon | III | The castle in the clouds, faintly visible in the sky from the first minute. |
| 16 | `whistfell_abbey` | Whistfell Abbey | dungeon | III | The Order's grey abbey on an island inside a whirlpool (the Gullet). |
| — | `whistfell_undercroft` | The Whistfell Undercroft | dungeon | III | A hundred dark glass lanterns and one lit one. |
| — | `quiet_deep` | The Quiet Deep | dungeon | III | The final dungeon under Whistfell: a library of sleeping stone people. |

**Overworld regions** (names for signposts, encounter tables and monster "Where" lines): Puddlewick Vale ·
the Beck · the Long Lane (the main road) · the Whispering Wood · Saltmarrow Coast · Coddleston Downs ·
Coddleston Moor · Pelican Coast · the Sogglemarsh · Marbleford Downs · the Frittering Sands · Wolfscarf Pass ·
the Frostbottom · the Gullet (whirlpool sea) · the Cold Shoulder Sea · Highfeather's cloud road.

**How you travel** (every gate has a person or a thing standing there saying what it wants):
on foot from the start · **the wagon** follows on roads and grass and waits outside towns and dungeons ·
**packet boats** from Port Pelican to Parchmouth and to Marbleford (40 G, Act II) · **the ship *Merry Lark***
(`ch2.ship`, a wedding gift) · **the Cloud Stair** at Bellhollow Abbey's empty bell frame (`ch3.cloudstair`) ·
**flying on the Sunlark** (`ch3.sunlark`), the only way over the Gullet to Whistfell.

---

## 3. The story in one breath (read this to a six-year-old)

*Bram is a little boy who travels in a wagon with his dad, the strongest man alive. With his two friends,
Willow and Sera, he sneaks into a haunted manor, rescues a kitten called Pip, and Willow ties half her ribbon
round his wrist so the dark knows he belongs to somebody. Then a very polite bishop called Mortmain, who turns
people to stone so nobody can ever be lost, catches Bram's dad — and his dad is gone. Bram grows up working in
the bishop's quarry. He escapes, finds his old friends Bobble and Pip, comes home, learns his dad was really a
king and his mum was taken when he was a baby, and marries Willow or Sera. Then the bishop turns Bram and his
wife to stone. Nine years later their own twins, Rowan and Linnet, chip him free. Rowan can lift the magic sword
that Bram never could. Together they wake the golden Sunlark, fly to the bishop's abbey, find Bram's mum asleep
in a glass lantern, stop Mortmain and the dark thing underneath him, and everyone in stone wakes up.*

---

## 4. Act structure — every beat, its map, its flag

Party-level targets are for a child who never grinds. **Flags are set exactly as written** (`__DQ.flag(name)`).
Two new beats were added to cover Dragon Quest V moments the bibles missed: **B11b** (the sabre-cat
reunion) and the wagon/letter in **B12**.

### ACT I — The Boy and His Father (~80 min · party Lv 1–8)
| Beat | Map(s) | What happens | Flag(s) set |
|---|---|---|---|
| B1 | `hollybank` | Name the hero. Get up, search four containers, take Papa his boots. | `ch1.awake` |
| B2 | `puddlewick` | Nobody sells a penniless boy anything (the gag); Papa hands over 30 G at the lane; climb into **Papa's wagon** (pulled by Parsnip). | `ch1.left_home` |
| B3 | `aldenmoor` (the Long Lane) | First battles with Papa as guest. A Gloop ambushes the wagon, surrenders, and asks to come. **Bobble joins.** | `party.bobble` |
| B4 | `saltmarrow`, `contented_herring` | Meet **Willow** (breaking up a fight she started) and **Sera** (bored politely in the inn parlour). First inn sleep. | `ch1.met_willow`, `ch1.met_sera` |
| B5 | `saltmarrow` (dusk) | Five villagers, five stories about Cobwell Manor. Willow's dare; Sera invites herself. | `ch1.dare_taken` |
| B6 | `cobwell_manor` | Children's party: Bram, Willow, Sera, Bobble. Candle, three music boxes, the ballroom dance. Find **Pip** in a hatbox in the nursery. On the Long Stair, in the dark, **Willow ties half her ribbon on Bram's wrist.** Boss **Mumbleroot the Grudge**; Grandmother Nettle rants about dust and gives the treasure. | `ch1.manor_cleared`, `ch1.ribbon`, `party.pip` |
| B7 | `saltmarrow` (morning) | Goodbyes. Sera's carriage leaves; Willow counts crates on the quay and does not look up. | `ch1.farewell` |
| B8 | `coddleston`, `aldenmoor` (Coddleston Moor) | Papa clears the rockfall; Prince Bertie's birthday; Papa is hired as bodyguard; grey-masked **Quietlings** snatch Bertie on the moor. | `ch1.pass_open`, `ch1.bertie_taken` |
| B9 | `grey_ruins` | **The father's fall.** A scripted fight you cannot lose *or* win (3 turns max; the text says plainly *"You can't reach him."*). Mortmain holds both boys; Halvard kneels — *"Look at the sky, lad."* Mortmain turns him to stone, but Halvard will not stop fighting inside it and the stone cannot hold him: he is gone. Pip runs off into the dark. The quarry gate closes. | `ch1.halvard_fallen`, `ch2.start` |

### ACT II — The Young Man and the Choice (~110 min · party Lv 9–20)
| Beat | Map(s) | What happens | Flag(s) set |
|---|---|---|---|
| B10 | `quiet_quarry` | Ten years in three short chores. Bertie (guest) and **Digby the Barrowmole** (joins) help dig out. | `ch2.quarry_escape`, `party.digby` |
| B11 | `whistling_caves`, `parchmouth` | Wind puzzles. At the cave mouth **Bobble is sitting on a rock with a packed lunch** — he waited ten years. Rest at Parchmouth. Bertie heads home. | `party.bobble_return` |
| **B11b** | `gogglestone_caves` | Puddlewick folk fear a great golden beast in the caves. Boss **the Sunmane** — it stops mid-roar when it sees the ribbon on Bram's wrist. **It is Pip.** Pip rejoins and drops his old kitten bell at Bram's feet (**Pip's Bell**). | `ch2.pip_return`, `party.pip` |
| B12 | `puddlewick`, `hollybank`, `wagonwrights_rest` | Home is half burnt and moved on. **Barty** has kept the fire in for ten years; he joins, hands over the house key and the **Ambergarde Crest**, and tells Bram plainly: *"He died, little master."* In the loft: **Papa's Letter** (Mum was taken; Papa was looking for her and for the Larksteel set) and **Mum's Feather Hairpin**. Doss mends Papa's old wagon. **Wild monster recruiting opens.** | `ch2.barty_join`, `party.barty`, `ch2.crest`, `ch2.letter`, `ch2.wagon` |
| B13 | `saltmarrow`, `contented_herring` | Willow grown, running the inn with her dad ill upstairs; throw out a debt collector; the other half of the ribbon is nailed above the kitchen range. | `ch2.willow_grown` |
| B14 | `port_pelican`, `marbleford`, `fairweather_hall` | Packet boat to Marbleford. Lord Rudolpho hugs you, weeps, and names four conditions; Sera grown and trapped; Baron Stodge recites poetry; Pru says something true. | `ch2.sera_grown`, `ch2.pearl_quest` |
| B15 | `sighing_grotto` | Tide puzzles. **Willow volunteers as guest for this dungeon only.** Boss **the Tidewarden**. Get the **Tide Pearl**. On the walk out she says the line. | `ch2.pearl` |
| B16 | `fairweather_hall` | **The bride choice** (STORY-BIBLE §6). | `ch2.bride` = `"willow"` \| `"sera"` |
| B17 | `marbleford_chapel` | The wedding; Bertie's toast; the unchosen friend's public blessing. Gifts: the **Larksteel Helm** ("an old hat nobody could wear") and the ship **Merry Lark**. | `ch2.married`, `ch2.ship` |
| B18 | `ambergarde`, `ambergarde_keep` | The crest matches; the court kneels. Bram cannot draw the **Larksteel Sword**. The twins are born. | `ch2.ambergarde`, `ch2.sword_failed`, `ch2.twins_born` |
| B19 | `ambergarde_keep` | Coronation. Mortmain walks in, apologising; takes the **Sunlark's Feather** from the altar; turns Bram and his wife to stone. | `ch2.petrified`, `ch3.start` |

### ACT III — The Parent (~90 min · party Lv 20–28; the twins start at Lv 1 and catch up)
| Beat | Map(s) | What happens | Flag(s) set |
|---|---|---|---|
| B20 | `stone_garden` | **Play as Linnet**, nine, for six minutes. Chip Papa free (eleven presses). Mum's statue will not crack — *"She's held tighter,"* says Barty. *"It'll take more than rocks."* **Halvard's Greatsword** lies by the plinth. | `ch3.awake`, `party.rowan`, `party.linnet` |
| B21 | `ambergarde_keep` | **Rowan draws the Larksteel Sword** first try. | `ch3.sword_drawn` |
| B22 | `saltmarrow`, `port_pelican`, `coddleston`, `coldcomfort`, `glasswing_grotto`, `quiet_quarry` | Open world with the wagon and the ship. The unchosen friend meets your children. King Bertie lends his fleet. Get the **Wolfscarf** and **Emberbell**, clear the Glasswing Grotto (boss **Hoarfax the Ninefold**) for the **Larksteel Shield**; free the Quiet Quarry (boss **the Iron Governess**). | `ch3.old_friends`, `item.wolfscarf`, `item.emberbell`, `ch3.shield`, `ch3.quarry_freed` |
| B23 | `bellhollow_abbey`, `highfeather` | Stand under the empty bell frame with the Larksteel Sword: **the Cloud Stair** appears. Highfeather dungeon; the **Larkweave Cloak**; wake **the Sunlark**, a golden bird-dragon the size of a cathedral and enormously polite. | `ch3.cloudstair`, `ch3.cloak`, `ch3.sunlark` |
| B24 | `whistfell_abbey`, `whistfell_undercroft` | Fly over the Gullet. Mid-boss **Hush & Hark**. Past a hundred dark lanterns to the lit one: **Queen Elowen** wakes (*"Oh, you got so tall. I only put you down for a minute."*). She joins; she gives **Elowen's Shawl**. | `ch3.elowen`, `party.elowen` |
| B25 | `quiet_deep` | **Bishop Mortmain** → **Mortmain Enfolded** (between them he tells you about Tobin; Rowan: *"You could have just been sad. Everyone else is."*) → **Malgrim the Unlit** rises out of him (the Cocoon, then the Unravelling). The Larksteel Sword cuts the dream away; Malgrim lets go. Mortmain lives, an ordinary old man. | `ch3.mortmain_fallen`, `ch3.malgrim_fallen` |
| B26 | `stone_garden` | Elowen spends her Skyborne light; every statue softens at once; **your wife wakes last** and asks whose children those are. The hero points. | `ch3.spouse_freed` |
| B27 | `ambergarde_keep`, `ambergarde`, then anywhere | Coronation and a free-walk epilogue; the ribbon goes on Linnet's wrist. | `game.cleared` |

**Optional beats** (signposted, never required): `bellhollow_belfry` in Act II (boss **Sexton Sootbell**,
reward **the Charm Bell**, flag `ch2.belfry_cleared`) · `quaggerton` well (Stilt-Boots from the ferryman, `item.stiltboots`; boss **Bogwallop the Bulbous**, flag
`ch2.bogwallop_beaten`; bring a **Marsh Lily** in Act III and he asks to join, `party.bogwallop`) · the Port
Pelican monster arena (flags `arena.rank1`…`arena.rank5`) · the eleven socks (`secret.socks` = count).

**Puddlewick's three looks** (WORLD-BIBLE §3): Visit 1 while `chapter==1`; Visit 2 from `ch2.start`; Visit 3
from `ch3.sword_drawn` (Nan Puddifoot is back at her oven only after `ch3.elowen`).

**Guests and the bride.** Guests fight but cannot be equipped and never level: Halvard (B3–B9), Willow and Sera
as children (B6, at child stats), Bertie (B10–B11), Willow as a grown guest (B15). The chosen bride is a full
party member from B17 to B19 and again after B26. The unchosen friend is never lost: she is at every epilogue.

---

## 5. Monster companions and the wagon

| Friend | Species (MONSTER-BIBLE) | Joins | Growth template (SYSTEMS §2.5) | Notes |
|---|---|---|---|---|
| **Bobble** | Gloop | B3 (story); waits out Act I's ending; rejoins B11 | Plodder | The comic voice. Cannot leave the party roster. Announced correctly by the herald at the coronation and has to sit down. |
| **Pip** | Sunspot Cub → **Sunmane** (grown) | B6 (kitten); lost at B9; rejoins B11b | Sprite | The Dragon Quest V sabre-cat. Recognises Bram by Willow's ribbon. Model grows between Acts. |
| **Digby** | Barrowmole | B10 (story) | Brute | Dug the way out of the quarry. |
| **Bogwallop** | Bogwallop the Bulbous | optional, Act III | Plodder | The only boss who can join. |
| any wild monster | the 38 of MONSTER-BIBLE | from `ch2.wagon` onward | per species | Befriending moment: MONSTER-BIBLE §7. |

**The mascot** is the **Gloop** (the blue teardrop — logo, title screen, the thing on the box).
**The designed kids' favourite** is **Cactuddle** (MONSTER-BIBLE §8). A potted Cactuddle stands on the
Puddlewick green from minute one.

**The wagon.** Papa's wagon, pulled by **Parsnip** the cart-horse. Act I: it carries Halvard, Bram and Bobble.
Lost at B9; found in Hollybank's barn at B12 and mended by Wagonwright Doss (`ch2.wagon`). Rules (SYSTEMS §8):
**4 walk, up to 8 ride in the wagon**; anyone beyond 12 goes to **the paddock at Hollybank Cottage**, happy and
visitable. The wagon waits outside towns, caves, towers and boss rooms and says so: *"The wagon's outside,
waiting in the rain."* Wild monsters cannot be befriended before `ch2.wagon` (they have nowhere to ride).

---

## 6. Key items (Important Items — cannot be sold, dropped or lost)

| Item | Found | Does |
|---|---|---|
| **Willow's Ribbon** (half) | B6, tied on in the dark | Worn in every frame. Stops the Sunmane at B11b. Goes on Linnet's wrist at B27. |
| **Candle** | B6, Cobwell Manor A1 | Light radius in the manor. |
| **Music Box** ×3 | B6 | Play Queen Elowen's lullaby (the player does not know that yet). |
| **Retreat Bell** | Given free in the first dungeon; one also stands on a plinth outside every boss door | Reusable: walk out of any dungeon, even a boss room. |
| **Pip's Bell** | B11b (Pip's outgrown kitten bell) | Accessory: encounter rate ×0.65. |
| **Ambergarde Crest** | B12, from Barty | Opens Ambergarde Keep. |
| **Papa's Letter** | B12, Hollybank loft | Reads aloud Halvard's last letter. Re-readable from the item menu forever. |
| **Mum's Feather Hairpin** | B12, Hollybank loft | A Skyborne feather. Elowen asks for it back at B24 and gives it to Linnet. |
| **Tide Pearl** | B15, the Sighing Grotto | Lord Rudolpho's condition. |
| **Charm Bell** | optional, Bellhollow Belfry | Monster befriending ×1.5. |
| **Marsh Lily** | Act III, Sogglemarsh | Lets Bogwallop join. |
| **Stilt-Boots** | Quaggerton's ferryman | Walk the Duckboard Causeway into the Sogglemarsh. |
| **Wolfscarf** | Act III, Coldcomfort | Walk through the Wolfscarf Pass blizzard. |
| **Emberbell** | Act III, Coldcomfort (300 G, or free if you fed Biscuit the dog) | Thaws the Glasswing Grotto door. |
| **Sunlark's Feather** | Altar of Ambergarde Keep; stolen B19; returned B25 | Proof of the Skyborne line. |
| **Osric's Wooden Bird** | Act II start, the Quiet Quarry | Trinket, +2 defence. "Osric made this. It took a year." |
| **The Sock of Considerable Power** | find all eleven socks in searchable containers | Second-best accessory in the game. |

**The Larksteel set** (the legendary equipment; only **Rowan** can wear the sword, shield and helm):
**Larksteel Sword** (Ambergarde Keep, B21) · **Larksteel Shield** (Glasswing Grotto, B22) · **Larksteel Helm**
(wedding gift, B17) · **Larkweave Cloak** (Highfeather, B23 — worn by Linnet).
**Family gear:** **Halvard's Greatsword** (Bram only, B20) · **Elowen's Shawl** (Queen Elowen's gift, B24) ·
the **wooden sword** in Hollybank's loft chest ("Father made it. Badly. On purpose.").

**Common consumables** (full list SYSTEMS §4): Herb · Strong Herb · Fresh Herb · Nutcake · Honeycake · Antidote
Drop · Wake-me-up · Angel's Kiss · **Homing Feather** (warp to the last church) · Whiff Powder · Sunbottle ·
Seed of Life.

---

## 7. Spells (28) — names are law for `src/data/spells.js`

| School | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| Fire (one enemy) | **Scorcha** | **Scorchalot** | **Kascorcha** | — |
| Wind (all enemies) | **Whiffle** | **Whiffler** | **Kawhiffle** | — |
| Ice (1 / all / all) | **Nip** | **Nipper** | **Kanip** | — |
| Lightning | — | — | **Zapple** (one) | **Kazapple** (all) |
| Healing | **Mend** (one) | **Mendmore** (one) | **Mendall** (all) · **Fullmend** (one, full) | — |
| Revive | — | — | **Rouse** (always works) | — |
| Support | **Sweeten** (cure poison) · **Wobble** (enemy DEF down) | **Wakey** (cure sleep/dazzle/confusion) · **Bolster** (DEF up) · **Bluster** (ATK up) | — | — |
| Control | — | **Snoozle** (sleep) · **Tanglefoot** (root) | — | — |
| Field | **Lanternlight** · **Sniff** | **Scarper** (leave battle) · **Whistle Down** (fewer encounters) | **Homeward** (warp to a church) | — |

**Monster-only moves** (players never learn them): Muddle (confusion), Squelch, Hiccup Bomb, Gulp, Toll,
Belly Laugh, and every named attack in MONSTER-BIBLE entries.
**Who learns what:** SYSTEMS §3. Mother's gift: Willow's children learn the fire line 3 levels earlier and Rowan
learns Whistle Down at 10; Sera's children learn the healing line 3 levels earlier and Linnet learns Rouse at 16.

---

## 8. Bosses in order

| # | Boss | Where | Beat | Party Lv |
|---|---|---|---|---|
| 1 | **Mumbleroot the Grudge** | Cobwell Manor belfry | B6 | 5–7 |
| — | **Bishop Mortmain** (scripted, unwinnable, unlosable) | The Grey Ruins | B9 | 8 |
| 2 | **The Sunmane** (wild Pip; stops, never dies) | Gogglestone Caves | B11b | 11–12 |
| opt | **Bogwallop the Bulbous** | Quaggerton's well | Act II | 12+ |
| opt | **Sexton Sootbell** | Bellhollow Belfry | Act II | 14+ |
| 3 | **The Tidewarden** | The Sighing Grotto | B15 | 17–19 |
| — | **Bishop Mortmain** (scripted petrification) | Ambergarde Keep | B19 | 20 |
| 4 | **Hoarfax the Ninefold** | The Glasswing Grotto | B22 | 22–25 |
| 5 | **The Iron Governess** | The Quiet Quarry | B22 | 23–25 |
| 6 | **Hush & Hark** (the Quiet Twins) | Whistfell Abbey | B24 | 25–26 |
| 7 | **Bishop Mortmain** → **Mortmain Enfolded** | The Quiet Deep | B25 | 26–28 |
| 8 | **Malgrim the Unlit** (the Cocoon → the Unravelling) | The Quiet Deep, bottom | B25 | 26–28 |

The Order's footsoldiers are **Quietlings**: small grey-masked hooded figures who are more sleepy than cruel
(one takes a job in the Ambergarde kitchens in the epilogue).

**Monster "Where" regions by tier** (MONSTER-BIBLE levels are a danger rank, not the party's level):
Tier 1 = Puddlewick Vale, the Long Lane, the Beck (party 1–5) · Tier 2 = the Whispering Wood, Saltmarrow
Coast, Cobwell Manor, Coddleston Downs (party 5–12) · Tier 3 = the Whistling Caves, the Frittering Sands,
Marbleford Downs, the Sogglemarsh (party 12–18) · Tier 4 = the Sighing Grotto, the Grey Ruins, the Frostbottom,
Highfeather's cloud road (party 17–25) · Tier 5 = Whistfell Abbey and the Quiet Deep (party 25–30).

---

## 9. Music ids (MUSIC-BIBLE is the score; these are the names)

`title` · `village` (Puddlewick only) · `overworld` · `castle` · `town` · `church` · `inn` · `dungeon` ·
`tension` · `battle` · `boss` · `victory` · `levelup` · `befriend` (the monster-joins fanfare) · `family`
(the sad/family theme; **`sad` is an alias** so `map.music:'sad'` in ARCHITECTURE.md still works) ·
`lullaby` (Queen Elowen's song) · `wedding` · `highfeather` · `quiet_hand` (Whistfell Abbey) · `finale` ·
`silence` (a real cue that plays nothing and must be respected by the mixer).
Story variants: `family.short`, `family.broken` (B9: the oboe's four notes, the last one a semitone flat, then
nothing), `family.whole` (B20: the same four notes resolved, full strings), `inn.sleep`.

**The two planted melodies.** (1) The **Hearth Cell** (`A4 D5 C#5 B4 A4` in D) is the score's DNA.
(2) **Queen Elowen's lullaby** is the C section of `village`, what Cobwell Manor's music boxes play, and what a
fisherwoman hums in Saltmarrow — heard whole, at last, at B24. The **Puddlewick theme's first eight notes**
are the Glasswing Grotto chime puzzle.

---

## 10. Text tokens, rules for children, and things that must never change

**Tokens in strings:** `%HERO%` (Bram) · `%WIFE%` (the chosen bride's name) · `%SON%` (Rowan) · `%DAUGHTER%`
(Linnet) · `%PIP%` (the cat's name) · `%NAME%` `%MONSTER%` `%ITEM%` `%SPELL%` `%N%` `%G%` `%PLACE%` `%TEXT%`.

**Kid-clarity rules added by the canon pass** (every bible now follows them):
1. **Nobody is a "slave".** The quarry holds *workers*, the Order *puts people to work*.
2. **Death is said plainly, once, gently, by someone who loves you** (Barty at B12: *"He died, little
   master."*), and never shown. The next scene has soup in it.
3. **Every scripted loss says it is scripted.** B9 and B19 print a plain line (*"You can't reach him."*) and end
   within three turns. No child should think they failed.
4. **Every "why can't I?" gets one sentence.** Why Mum's statue won't crack (B20), why Bram can't draw the sword
   (B18: *"It isn't yours to carry, lad. It's yours to pass on."* — from Papa's Letter), why the wagon waits
   outside.
5. **One hard word per scene, as a gift.** No "suzerain", no "dado" without a joke round it.
6. **The quest ribbon** (WORLD §6) never names a place the player has not heard said aloud.
7. **Grown-up magic words get a child's gloss the first time:** *Skyborne* = "the sky people Mum came from";
   *Larksteel* = "the hero's sword, shield, helm and cloak"; *the Quiet Hand* = "the bishop's grey people".

**Never change:** Nan Puddifoot's line "Warm one, love." (identical in Visit 1 and Visit 3) · Halvard's
"Look at the sky, lad." · Elowen's "I only put you down for a minute." · Bobble's join line "Frankly, Bobble
has decided." · the ribbon's journey (Willow → Bram → Linnet).

---

## 11. Choices made, one line each

**Cast**
- Hero **Bram** (STORY) over Corin (WORLD), Alder (SYSTEMS), Ardin (VOICE): four letters, reads itself aloud.
- Father **Sir Halvard Bellwether** (STORY + VOICE agree) over Sir Aldous Braye / Sir Corin Oakenshaw; made secretly King of Ambergarde, as in DQV.
- Mother **Queen Elowen** (STORY name + VOICE's title) over Lady Meriel / Queen Aurelie; "Queen" tells a child she matters.
- Bride #1 **Willow Pye** (VOICE) over Bryony Cobb / Wren Thistlethwaite / Wynn Applegarth: easiest to read, a pie pun, and STORY's inn-keeping, ribbon-tying character is kept whole.
- Bride #2 **Sera Fairweather** (VOICE surname, STORY first name) over Serafina Vermicelli / Lady Odile Gilderoy / Nettle Quillon: "Fairweather" reads aloud; Vermicelli does not.
- **Two brides, not three** (PS2 original has two); VOICE's Roxy and WORLD's Pru become one non-bride sister, **Pru**, the shorter name.
- Retainer **Barty Marrow** (STORY first name, STORY + VOICE surname) over Tobin Marrow / Mungo Pell / Bosco Pentola; STORY's look, SYSTEMS's Boulder stats (the joke is the tiny man with the most HP); VOICE's "little master" kept because it gets funnier as Bram grows.
- Villain **Bishop Mortmain** of the Quiet Hand (STORY) over Archdeacon Vexil / Reverend Ossian Vane / Cardinal Vespertine; VOICE's Vane lines and MONSTER's Vespertine build now belong to him and his Enfolded form.
- Final evil **Malgrim the Unlit** = STORY's Malgrim + MONSTER's Nyxil (same "make it quiet" wish), so there is a real last boss as in DQV.
- Twins **Rowan & Linnet** (STORY) over Elric & Ivy / Tam & Ellie: bird-and-tree names that belong to *The Lark*; VOICE's worrier/charger split kept.
- First monster friend **Bobble, a Gloop** (VOICE name, MONSTER species) over Blancmange the Custardine: a child can say "Bobble"; STORY's "Frankly—", monocle and got-his-name-wrong running gag are kept.
- Cat **Pip** (STORY) over Nutmeg / Marmalade: shortest; VOICE's subtitled mews become his voice; now grows into a sabre-lion and is lost and found again, as in DQV.
- Rich father **Lord Rudolpho Fairweather** over Don Guido Vermicelli: WORLD's volume and STORY's weeping hug merged.

**Places**
- Home **Puddlewick** (WORLD + MONSTER) over Barleymow / Little Nettlebed / Havenbrook: WORLD's three-visit plan is the most built.
- Willow's town **Saltmarrow** (STORY + MONSTER) over Larkinbeck / Brine-on-Sea; WORLD's waterwheel becomes a tide-mill.
- Nettlecombe village folded into Saltmarrow at dusk — one fewer place for a child to track.
- Haunted house **Cobwell Manor** (VOICE's "Cobwell", WORLD's manor layout) over Mouldwarp Hall / Nettlecombe Manor / Hollowbell Tower / Widdershin Tower: "cob-web-well" reads aloud; Mouldwarp does not.
- Bertie's castle **Coddleston** (STORY) with WORLD's Marchmount spires and people.
- Father's fall at **the Grey Ruins** (new id; STORY had it at Whistfell) so Whistfell can stay far away until Act III.
- Hero's kingdom **Ambergarde** (VOICE) over Ellesmere / Gotha placeholder: easier to say, warm colour.
- Rich town **Marbleford** (WORLD) over Portacello / Duskvale / Castle Marrowgate.
- Port **Port Pelican** (SYSTEMS) over Port Bracklesby: a pelican beats a brackle.
- Quarry **the Quiet Quarry** (STORY) over Grimhold Quarry / Coppergrumble Mine / the Wintering House; WORLD's black step-temple kept.
- Villain's seat **Whistfell Abbey** (STORY) absorbs Hollowbell Keep / Castle Kettleblack / Cathedral of Ash / Grandhollow Keep.
- Final dungeon **the Quiet Deep** (STORY) over the Unlit Vault.
- Sky castle **Highfeather** (STORY) over the High Roost / Cloudmarch; reached by the Cloud Stair, not a featherhorse.
- Desert **the Frittering Sands** (MONSTER) over Sunderscorch Sands / Glimmering Wastes: funnier, easier.
- Snow town **Coldcomfort** (WORLD) over Coldkettle Peaks; VOICE's spa town Steamington becomes Coldcomfort's hot springs.
- Wood **the Whispering Wood** (WORLD, "Weald" simplified) over Bramblecombe Woods / the Hollowing Wood.

**Systems & items**
- Spells: SYSTEMS's table is law, renamed for charm: Flick→**Scorcha** line (MONSTER), Zizzle→**Kazapple** (+ new **Zapple**), Lullaby→**Snoozle** (so "lullaby" means only Elowen's song), Dither→**Wobble**, Unbind→**Wakey**; MONSTER's Mendy→Mend, Frostle→Nipper, Kanipper→Kanip, Shielda→Bolster.
- Warp item **Homing Feather** over Chimera Wing / Chimaera Feather: a child can read it.
- Quest item **Tide Pearl** over Tidewheel Pearl / "a ring worth a life".
- Story weapons: SYSTEMS's Heirloom Blade split into **Halvard's Greatsword** (Bram) and the **Larksteel Sword** (Rowan only), as in DQV.
- Encounter charm **Pip's Bell** over the Kitten's Bell; Crown of Quiet renamed **Wide-Awake Crown** so "Quiet" only ever means the villain.
- WORLD's escape rope becomes SYSTEMS's **Retreat Bell**; WORLD's Tide-Bell and Featherhorse are retired (flight is the Sunlark).
- Befriending: MONSTER §7's beat and odds formula (with SYSTEMS's 13th-time guarantee kept); overflow goes to the Hollybank paddock (SYSTEMS) instead of waiting on the map.
- Victory order: fanfare → tally → **monster asks to join** → level-ups (SYSTEMS + MONSTER over MUSIC).
- Wagon animal **Parsnip the cart-horse** over "the wagon donkey".
- Gold banks: **the Bank** counters at Saltmarrow, Port Pelican, Marbleford and Ambergarde (SYSTEMS's Bank of Barleymow + WORLD's Bellhollow deposit, merged).
- Crit text **"A terrific whack!"** (SYSTEMS) over "A terrific blow!"; ambush texts **"You've caught them napping!"** / **"They came out of nowhere!"** (SYSTEMS) — clearer for a six-year-old.

---

## 12. Dragon Quest V moments — where each one lives

| DQV moment | Our beat | Status |
|---|---|---|
| Travelling with your father in a wagon | B2–B9 (Papa's wagon, Parsnip) | in |
| The haunted castle with the childhood friend | B6 Cobwell Manor | in |
| Rescuing the sabre-cat cub, and it remembering the ribbon ten years later | B6 (Pip), B9 (lost), **B11b** (the Sunmane) | **added by canon pass** |
| The father's fall, protecting the boys | B9 the Grey Ruins | in (now says plainly he is gone) |
| Years of forced labour and the prince who grows up | B10 the Quiet Quarry, Bertie | in |
| The father's letter revealing the mother | **B12** Papa's Letter | **added by canon pass** |
| Getting the wagon back; monster befriending opens | **B12** `ch2.wagon` | **added by canon pass** |
| The rich suitor's quest and the bride choice | B14–B16 (one Tide Pearl, not two rings) | in |
| The wedding gift of a ship | **B17** the *Merry Lark* | **added by canon pass** |
| Returning to the ancestral kingdom; the hero cannot draw the legendary sword | B18 Ambergarde | in |
| Hero and wife turned to stone | B19 | in |
| The children free their father | B20 (playable as Linnet) | in |
| The son draws the sword | B21 | in |
| Gathering the legendary equipment | B17 helm, B22 shield, B23 cloak, B21 sword | in |
| The castle in the clouds and the golden dragon | B23 Highfeather, the Sunlark | in |
| Rescuing the mother | B24 | in |
| A true demon lord beneath the human villain | B25 Malgrim the Unlit | **added by canon pass** |
| The fairy realm; travelling back in time to meet your younger self | — | **deliberately cut** for a 4-hour, child-sized game |

---

## 13. Retired names → canon (search-and-replace table for any stray text)

| Retired | Canon |
|---|---|
| Corin, Alder, Ardin | Bram |
| Sir Aldous Braye, Sir Corin Oakenshaw, Pankraz | Sir Halvard Bellwether |
| Lady Elowen Bellwether, Lady Meriel, Queen Aurelie | Queen Elowen |
| Bryony Cobb, Wren Thistlethwaite, Wynn Applegarth, Wilomena "Willow" Pye, Bianca | Willow Pye |
| Serafina Vermicelli, Lady Odile Gilderoy, Nettle Quillon, Seraphine Fairweather, Nera | Sera Fairweather |
| Roxandra "Roxy" Vance, Prudence "Pru" Gilderoy | Pru Fairweather |
| Bartleby Marrow, Tobin Marrow, Mungo Pell, Bosco Pentola, Sancho | Barty Marrow |
| Don Guido Vermicelli, Rudolpho Gilderoy | Lord Rudolpho Fairweather |
| Blancmange the Custardine, Bobble the Bloop | Bobble (a Gloop) |
| Nutmeg, Marmalade, the Sunspot Cub (as a name) | Pip |
| Elric & Ivy, Tam & Ellie (Elowen "Ellie") | Rowan & Linnet |
| Archdeacon Vexil, Reverend Ossian Vane, Cardinal Vespertine | Bishop Mortmain (Vespertine's build = Mortmain Enfolded) |
| Nyxil the Unlit | Malgrim the Unlit |
| Order of the Hollow Bell | Order of the Quiet Hand |
| Barleymow, Little Nettlebed, Havenbrook, Whealbrook | Puddlewick |
| Larkinbeck, Brine-on-Sea, Roundbeck | Saltmarrow |
| Mouldwarp Hall, Nettlecombe Manor, Hollowbell Tower, Widdershin Tower, Cobwell Tower, Uptaten Towers | Cobwell Manor |
| Castle Marchmount, Castle Marrowgate (as Act I castle) | Coddleston Castle |
| Ellesmere, Gotha | Ambergarde |
| Portacello, Duskvale, Castle Marrowgate (shops) | Marbleford |
| Port Bracklesby | Port Pelican |
| Grimhold Quarry, Coppergrumble Mine (slave works), the Wintering House | the Quiet Quarry |
| Coppergrumble Mine (monster region) | the Whistling Caves |
| Hollowbell Keep, Castle Kettleblack, Cathedral of Ash, Grandhollow Keep, Sunken Abbey (as villain seat) | Whistfell Abbey |
| the Unlit Vault | the Quiet Deep |
| The High Roost, Cloudmarch | Highfeather |
| Sunderscorch Sands, Glimmering Wastes | the Frittering Sands |
| Coldkettle Peaks | Coldcomfort / the Frostbottom |
| Bramblecombe Woods, the Hollowing Wood, the Whispering Weald | the Whispering Wood |
| Marrowmarsh | the Sogglemarsh |
| Bittermoor Pass, Marrowgate Downs | Marbleford Downs |
| the Drowsy Deep, Saltmarsh Caves | the Sighing Grotto |
| Ashenvale Ruins | the Grey Ruins |
| Puddleslime, Blorb | Gloop · Munchroom → Toadstooligan · Hobbleghast → Boohoo · Flitterbug → Flapjack · Pickpocket Imp → Grimalkitten · Bogling → Grumbleglop · Frostnip → Lady Mothbonnet · Grumbleboar → Twiglet · Old Grumbletusk → Bogwallop |
| Tidewheel Pearl | Tide Pearl |
| Chimera Wing, Chimaera Feather, escape rope | Homing Feather / Retreat Bell |
| Kitten's Bell | Pip's Bell |
| Heirloom Blade | Halvard's Greatsword (Bram) / Larksteel Sword (Rowan) |
| Feather-Shield of the Roost | Larksteel Shield |
| Mother's Shawl, mother's hair-ribbon | Elowen's Shawl, Mum's Feather Hairpin |
| Merry Wren (ship) | Merry Lark |
| Pomfret the Featherhorse | Clover the Featherhorse (a Highfeather stable animal; not a mount) |
| Tide-Bell | retired (fly over the Gullet on the Sunlark) |
| Flick/Flicker/Kaflick, Zizzle, Lullaby (spell), Dither, Unbind, Mendy/Mendyall, Frostle, Kanipper, Shielda | Scorcha/Scorchalot/Kascorcha, Kazapple, Snoozle, Wobble, Wakey, Mend/Mendall, Nipper, Kanip, Bolster |
| Crown of Quiet | Wide-Awake Crown |
