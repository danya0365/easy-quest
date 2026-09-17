# THE VOICE BIBLE
**How everything in this game speaks.** Design document. No code.
Owner: writing. Consumers: P12 dialogue, P22 shops, P24–P26 story, `src/data/strings.js`, every NPC in `src/world/maps/*.js`.

> The reference is the celebrated English localisation of *Dragon Quest V* on PS2 — warm, witty, gently British,
> every monster punningly named, every passer-by a whole person in two lines. We are **not** copying its text,
> names or characters. We are building our own cast in that spirit. Nothing in this file may be lifted from
> Square Enix. If a line here reminds you of a specific line from the real game, rewrite it.

---

## 0. The hard frame every line lives inside

- **The box.** Three lines maximum. **34 characters per line** at the standard text size (the F4 font is
  proportional; 34 is the safe count for lowercase with capitals — treat 30 as comfortable, 34 as the wall).
- **A "page" is one boxful.** `▼` means another page follows. A speech may run to several pages; **three pages
  is the polite maximum** for an ordinary NPC, and only story scenes may go longer.
- **Never break a word across pages.** Never end a page on "the", "a", "and", "of", "to", "is".
  Break at a comma, a full stop or a beat.
- **A page is a unit of comedy or feeling.** The last word on the last line of a page is the loudest word in it.
  Put the joke there. Put the knife there.
- **Spelling is British.** colour, favourite, realise, travelled, marvellous, apologise, grey, plough, mum.
  Currency is **gold coins** (shortened to **G** in menus). Distance in leagues, ale in tankards.
- **Punctuation.** Em dash for interruption ( — with spaces). Ellipsis is three dots, used for hesitation, once
  per page at most. No semicolons anywhere: a six-year-old has never met one. Exclamation marks are rationed
  (see Rule 3). Question marks are free.
- **Names are capitalised as written here and never abbreviated by the system.** Every name comes from
  `docs/CANON.md`. The hero's name is player-entered (default **Bram**, 8 characters max) and appears in system
  strings as `%HERO%`. Other tokens: `%WIFE%` (the chosen bride), `%SON%` (Rowan), `%DAUGHTER%` (Linnet), `%PIP%`.

### The cast, once, so nobody invents a second version
| Role | Name | One line |
|---|---|---|
| The hero | **%HERO%** (default *Bram*) | Silent. Speaks in choices and in what he does. |
| The father | **Sir Halvard Bellwether** | Enormous, dry, on a long quiet errand. Secretly a king. |
| Childhood friend / bride | **Willow Pye** | Fearless, teasing, climbs everything. "Right then." |
| Childhood friend / bride | **Sera Fairweather** (Serafina) | Painfully polite, accidentally devastating. |
| Sera's sister (not a bride) | **Pru Fairweather** (Prudence) | Blunt as a brick, twice as loyal. "Noted." |
| The old retainer | **Barty Marrow** (Bartleby) | Soup, sobbing, sixty years of service. "Little master." |
| The mother | **Queen Elowen** | Barely there, and the whole story. |
| The twins (Act III) | **Rowan** and **Linnet** | He worries, she charges. |
| First monster friend | **Bobble**, a Gloop | "Frankly—". Third person. Wants to be called brave. |
| The cat | **Pip**, a Sunspot Cub | Mews, subtitled. Grows into a lion; still mews. |
| The prince | **Bertie** (Adalbert of Coddleston) | The royal "we", and a title that shrinks. |
| The villain | **Bishop Mortmain** | Never raises his voice. Never needs to. |
| Travelling merchant | **Fennick Quiddle** | Sells you your own hat back. |

Places (ids in CANON.md §2): **Puddlewick** (home village), **Saltmarrow** (Willow's town, the Contented Herring),
**Cobwell Manor** (the haunted one), **Coddleston** (Bertie's castle), **Port Pelican** (the harbour),
**Marbleford** (the rich town), **Ambergarde** (the kingdom), **Coldcomfort** (the snow village with hot springs),
**the Quiet Quarry** (the terrible place at the start of Act II), **Whistfell Abbey** (the Bishop's).

---

## 1. The house style in ten rules

**R1 — A person in two boxes.**
Every speaker wants something, fears something, or is wrong about something, and it shows immediately.
- GOOD: "I've told our Bernard: no more sword. / He's got a lovely hand for pastry."
- BAD: "Hello traveller! Welcome to our village. / It is a nice village."

**R2 — Concrete nouns beat adjectives.**
Name the object, the smell, the weather, the amount. Never "a terrible monster" — say what it did to the fence.
- GOOD: "Something ate the gate. The whole gate. / Left the hinges, mind. Fussy."
- BAD: "There are very scary and dangerous monsters outside the village."

**R3 — Understatement. Ration the exclamation mark.**
One `!` per NPC speech, at most. System fanfares may have one. The bigger the event, the flatter the line —
the fanfare is doing the shouting for you.
- GOOD: "That's the sky gone dark, then. / Well. I'd best bring the washing in."
- BAD: "Oh no!! The sky has gone dark!! This is terrible!!"

**R4 — A pun must love its target.**
Monster names, shop signs and innkeepers are puns. The joke is affectionate — we are laughing *with* the world,
never sneering at anyone in it.
- GOOD: A shop called **Sword & Sundry**. A slime called a **Gloop**. A crab called a **Prawnbroker**.
- BAD: A fat innkeeper called Mr Wobble. Punching down is not a pun, it's just unkind.

**R5 — Never explain the joke. Never explain the feeling.**
Cut the last sentence of nearly every speech. That is where the explaining hides.
- GOOD: "He always sat in that chair. / I've started putting my bag on it."
- BAD: "He always sat in that chair, and now that he's gone I feel so lonely and sad."

**R6 — Feelings arrive as objects and habits.**
Grief is a cold second cup of tea. Love is somebody carrying your bag without mentioning it.
Nobody in this game announces their own emotion.
- GOOD: "I keep making two. / Then I drink them both, and I'm up all night."
- BAD: "I am extremely sad because my husband died last winter."

**R7 — The machine speaks in-voice too.**
There is no computer in this world. No "ERROR", no "OK", no "INVALID", no "PRESS START TO CONTINUE".
Every system string is written by the same hand as the dialogue.
- GOOD: "The pot holds nothing but a spider, / and the spider is not for sale."
- BAD: "Empty. Nothing found."

**R8 — Gently British, never cod-dialect.**
Register, not accent. Allowed and encouraged: *rather*, *dare say*, *bother*, *blimey*, *good grief*, *mind you*,
*I shouldn't wonder*, *lovely*, *quite*, *proper*. Forbidden: phonetic spellings, dropped-letter apostrophes
by the fistful, "Ye Olde", pirate-speak, anything that needs decoding.
- GOOD: "It's not that I mind the ghosts. / It's the *hours* they keep."
- BAD: "Oi guv'nor, 'tis a roight ol' spooky 'ouse innit, arrr."

**R9 — One idea per page. End on the strong word.**
Rearrange the sentence so the funny noun or the heavy noun is last.
- GOOD: "Our well's been dry for a month. / The bucket comes up full of frogs."
- BAD: "The bucket comes up full of frogs from our well, which has been dry for about a month now."

**R10 — The player is never the butt, and the world is fond of you.**
Characters may tease the hero (Willow lives to). Nothing ever mocks the *player* for being lost, slow, weak or
bad at the game. Failure lines are kind. Retry lines are kind. Even the villain is courteous.
- GOOD (on defeat): "You are dreaming of somewhere warm. / Somebody is carrying you."
- BAD (on defeat): "You died! Try being better at fighting."

---

## 2. How each cast member speaks

Each entry gives the **fingerprint** (the things only they do), what they **never** say, and five lines.
Test: hide the name; a reader should still know who is talking.

### %HERO% — the boy, then the man
He never speaks. His voice is (a) what he chooses, (b) what the world says he did.
- Choices are always **short, active, and both valid**: "Take her hand." / "Wait a moment."
  Never "Yes / No" when the moment matters; name the action instead.
- Yes/No is reserved for shopkeeping, inns and saves.
- Reaction beats are written as stage lines in the box with no speaker tag:
  `%HERO% looks at his boots.` — used sparingly, three or four times per chapter, at real moments.
- Everyone talks *about* him constantly. That is how we build him.

### Halvard Bellwether — the father
**Fingerprint:** calls him "lad", never "son". Practical instruction at the end of every speech. Road, weather
and tool metaphors. Understates injury and danger by exactly one size. Praises the hero only to other people,
never to his face. Never finishes a sentence about the boy's mother.
**Never:** "I love you." "I'm proud of you." "Be careful." (He says "Mind the step.")
1. "Eat. A hero on an empty stomach / is just a boy holding a sword."
2. "That's a fine bruise. Keep it. / Bruises are cheaper than lessons."
3. "We'll walk till the light goes. / Then we'll walk a bit further."
4. "Your mother would have laughed at that. / She laughed at most of my ideas."
5. "Stand behind me, lad. Not because / you're small. I want the exercise."

### Willow Pye — the friend
**Fingerprint:** contractions, questions, dares; **"Right then"** before anything brave or daft; answers a question
with an instruction ("Are you scared?" — "Hold my hand and mind the third step."). Interrupts herself. Volunteers the hero for things.
Deflects any kindness aimed at her within one page. Short sentences when frightened, long ones when showing off.
**Never:** apologises in Act I. Never says "I'm scared" — she says what she'll do about it.
1. "You're doing the thinking face. / We haven't got time for the face."
2. "Ladders are for people who can't fall properly."
3. "I'm not crying, it's the wind, and if / you say otherwise I'll push you in the well."
4. "Right. You take the big one. / I'll take the two behind it."
5. "Come ON."

### Sera Fairweather — the merchant's daughter
**Fingerprint:** apologises for existing, then says something devastatingly accurate — and then **"I'm sorry,
that was rude of me."** Long polite front half,
tiny flat back half. Trails off with "..." then answers her own question. Notices small physical details
because she has been indoors her whole life.
**Never:** raises her voice. Never uses slang.
1. "I'm sorry — was that my turn? / I'd rather hoped it wasn't."
2. "Father says the sea is business. / I think it's mostly water."
3. "You needn't hold my hand. / ...You may, though."
4. "I've never been rained on before. / It's very thorough, isn't it."
5. "Oh — sorry — I've just remembered / that I'm frightened."

### Pru Fairweather — her younger sister (not a bride choice)
**Fingerprint:** imperatives. Declares her feelings as decisions ("I have decided to be brave"). Keeps a mental
ledger and mentions it. Insults that are secretly compliments. (She never talks in the third person — that is
Bobble's.)
**Never:** says thank you plainly. She says "Noted."
1. "I have decided to be brave. Do keep up."
2. "That monster looked at me. At ME."
3. "I don't do mud. I have made / an exception. Write it down."
4. "You're common, you're damp, and you'll do."
5. "Don't die. It would ruin my entire month."

### Barty Marrow — the old retainer
**Fingerprint:** food metaphors, always. Cheerful malapropisms ("a catastrophy of onions"). Calls the hero
"little master" even when the hero is forty and a foot taller. Announces his own weeping and denies it in the
same page. Repeats a word for warmth ("sit, sit").
**Never:** speaks ill of anyone. Never uses one word where nine will do.
1. "Little master! You are grown like / a marrow in a wet July!"
2. "Sit, sit. I have made the soup with / the good beans, not the sulky ones."
3. "Oh, my heart. It is doing the drum thing."
4. "Your father, he never knocked. / He arrived."
5. "I am not weeping. It is the onions. / There are always onions."

### Queen Elowen — the mother
**Fingerprint:** present tense, second person, very few words. Speaks as if she is already remembering this.
Uses the hero's name. Never explains where she is or what is being done to her. Her sense of time is broken:
at first she thinks Bram is still a baby asleep upstairs.
**Never:** asks to be rescued.
1. "There you are."
2. "You have your father's way of standing."
3. "It is not dark where I am. / It is only quiet."
4. "Don't run. I want to look at you."
5. "Oh. Oh, you got so tall. / I only put you down for a minute."

### Bobble — the first monster friend (a Gloop, with a monocle)
**Fingerprint:** third person, always. Starts about one sentence in four with **"Frankly—"**. Short clauses, with
**one** enormous word per scene, used *almost* right ("Bobble is *magnanimous* at the big one."). Parenthetical
honest afterthoughts. Loves pots. Volunteers for guard duty and is bad at it. Corrects anyone who gets his name
wrong (Bubble, Wobble, Bobbin): "BOBBLE." Wants, one day, to be called "the brave one".
**Never:** understands sarcasm. Never admits he is scared without also going first.
1. "Bobble is here! Bobble is ALWAYS here!"
2. "Bobble bounced at the big one. / The big one did not enjoy it."
3. "Is that a pot? Bobble loves pots."
4. "Bobble will guard the wagon. / Bobble is very serious now."
5. "Bobble missed you a normal amount. / (Bobble missed you lots.)"
6. "Frankly, Bobble is terrified. / Bobble is going in first. / These facts are related."

### Pip — the cat (a Sunspot Cub; a great golden lion by Act III)
Always two lines: the mew, then the subtitle in brackets, which is always a lie or a demand. When Pip is a lion
the mew gets deeper ("Rrrowr.") and the subtitles do not change at all.
1. "Mrrp. / (I have been abandoned for nine hours.)"
2. "Prrrt. / (You may continue stroking. Briefly.)"
3. "Mrow. / (There is a monster in the barn. Yours now.)"
4. "*silence* / (She is pretending she can't hear you.)"
5. "Mrrrrow! / (The dish. Look at the dish. LOOK AT IT.)"

### Bishop Mortmain — the villain
**Fingerprint:** flawless courtesy, like a nurse at a bedside: **"there now", "gently", "that's better"**. Calls
everyone "child", including grown men. Present tense. Speaks of terrible things in the language of housekeeping
and gardening. Never says "kill" or "dead" — says "kept", "lost", "quiet". Never threatens; describes.
Never shouts, never gloats, never monologues past three pages.
**Never:** "fool", "pathetic", "you cannot stop me". No villain boilerplate ever.
1. "Kneel, child. It's kinder on the knees / than pride is."
2. "You have your father's chin. / He kept it up too long as well."
3. "I take nothing. People hand me things."
4. "How lovely. Hope. Bring it indoors, / it spoils in the rain."
5. "There now. Put it down. That's better."

### Fennick Quiddle — the travelling merchant
**Fingerprint:** alliteration, prices, and a guarantee he immediately weakens. Speaks in threes.
Calls the hero "squire".
1. "Pots, pans, potions and portable pity! / Two hundred gold, squire, and a smile."
2. "Guaranteed unbreakable. / Guaranteed-ish."
3. "I don't ask where you got it. / I ask what you want for it."
4. "Best price in the province. / It is also the only price in the province."
5. "Buy the lantern. You'll thank me / in about four minutes."

### Rowan and Linnet — the twins (Act III)
Rowan worries in full sentences and asks questions; Linnet answers in three words. They finish each other's
business. Rowan flattens bosses with one plain sentence ("That's very sad. Are you nearly done, though?").
1. Linnet: "I fought a bat." Rowan: "It was a moth." Linnet: "It was a BAT."
2. Rowan: "If we get lost, Grandad's letter says —" Linnet: "We won't."
3. Linnet: "Dad's crying." Rowan: "Dad's *thinking*."
4. Rowan: "I've packed rope, flint, bandages —" Linnet: "I packed a rock."
5. Both: "We're coming. / You can be cross on the way."

### Prince Bertie — the rival who becomes a friend
**Fingerprint:** the royal **"we"**, and his full title — which gets shorter every time he recites it across the
quarry chores, until it is just "Bertie." Pompous as a boy, decent as a man, still slightly pompous about being decent.
1. "We are Adalbert Ludovic Fitzhugh, Ninth of Coddleston, / Keeper of the Shallow Ford—"
2. "We are Adalbert of Coddleston. / Hand us the other end of the rock."
3. "…Bertie. It's Bertie. / Pass me the shovel, would you."
4. "We have brought you a fleet. / We did not bring a speech. We are growing."

### House voices (reusable)
- **Innkeeper:** hospitable, mercenary, one beat of gossip. "%N% gold the pair of you. / A bit more if the pudding snores."
- **Priest:** calm, plural, kindly formal. "Rest here a moment. The book keeps its place."
- **Shopkeeper:** eager, chatty, invested in your purchases. "Ooh, good eye. That one's got history."
- **Village child:** runs on, no punctuation discipline, one factual error. "My dad fought a dragon it had four heads and he *won*."
- **Old villager:** long memory, short patience, weather. "Rained like this in '09. / We ate the goat."
- **Livestock:** "Moo." then a bracketed subtitle only if it's funny. Sheep say "Baa." Never "Baa-humbug."

---

## 3. The system strings, written in-voice

These are the exact strings for `src/data/strings.js`. `%X%` are substitutions.
House rules for system voice: present perfect for things that happened ("has learnt"), no jargon, no ALL CAPS
except a monster's roar, and **the fanfare does the shouting** so the words stay calm.

**Ceremony**
1. `level.up` — "%NAME% is now level %N%! / Looking rather pleased about it."
2. `level.stats` — "Strength up by %N%. / And a bit more room for supper."
3. `spell.learn` — "%NAME% has learnt %SPELL%! / It tingles all the way to the elbows."
4. `spell.learn.first` — "Something new is rattling about / in %NAME%'s head. It's %SPELL%."
5. `chest.open` — "%HERO% opens the chest. / Inside: %ITEM%."
6. `chest.gold` — "%N% gold coins. Someone hid these / and then forgot. Their loss."
7. `chest.empty` — "The chest is empty, and somehow / smug about it."
8. `chest.already` — "This chest has already given / everything it had. Let it rest."
9. `item.get` — "%HERO% has got the %ITEM%!"
10. `item.get.key` — "%HERO% has got the %ITEM%. / Doors everywhere shift uneasily."
11. `item.use` — "%NAME% uses the %ITEM%."
12. `item.full` — "The bag is full. Something in there / would have to go, and nothing wants to."
13. `gold.found` — "%N% gold coins, found in a boot."
14. `map.enter` — "%PLACE%"  *(name only, on the place-card; no verb, no fuss)*

**Church, inn, shop**
15. `inn.greet` — "A bed each, and breakfast if you're up / before the bread's gone. %N% gold?"
16. `inn.yes` — "Sleep well. Mind the third stair."
17. `inn.wake` — "Morning. Everyone's mended. / The pudding snored."
18. `inn.poor` — "Come back when your purse is heavier. / The pillows will wait."
19. `inn.no` — "Suit yourself. The bench outside / is free, and very honest about it."
20. `church.greet` — "Welcome. Would you like the book, / the blessing, or the quiet?"
21. `church.save` — "Your journey has been written down. / It won't be lost now."
22. `church.saved` — "Rest as long as you like. / The page is keeping your place."
23. `church.heal` — "There. Hold still. / ...There."
24. `church.uncurse` — "Whatever that ring was whispering, / it has stopped."
25. `church.blessing` — "Go carefully. Come back muddy."
26. `shop.greet` — "Morning! Buying, selling, or sheltering / from the weather?"
27. `shop.buy` — "Lovely choice. That'll be %N% gold."
28. `shop.poor` — "Ah. You're %N% gold short. / I'd give you it, but my wife counts."
29. `shop.sell` — "I'll give you %N% for it. / I'll regret it by Thursday."
30. `shop.bye` — "Mind how you go. Take the lantern."
31. `shop.equip.no` — "%NAME% gives it a hopeful wobble. / It doesn't fit anybody."

**Battle**
32. `enc.start` — "%MONSTER% draws near!"
33. `enc.group` — "A %MONSTER% and friends draw near!"
34. `enc.ambush` — "They came out of nowhere!"
35. `enc.first` — "You've caught them napping!"
36. `atk.hit` — "%NAME% hits %TARGET% for %N% damage."
37. `atk.crit` — "A terrific whack! %N% damage!"
38. `atk.miss` — "%NAME% swings at the air. / The air is unharmed."
39. `spell.cast` — "%NAME% casts %SPELL%!"
40. `spell.nomp` — "%NAME% hasn't the puff for it."
41. `spell.fizzle` — "The spell coughs, thinks better of it, / and goes out."
42. `heal` — "%NAME% is looking much better."
42a. `heal.full` — "%NAME% is already in the pink!"  *(spell refused, no MP spent — SYSTEMS §1.7)*
42b. `ko` — "%NAME% is worn out."  *(never "dead", never "died" — that word is kept for the story)*
43. `revive` — "%NAME% sits up, blinking. / 'What did I miss?'"
44. `status.sleep` — "%NAME% is fast asleep. / Rude, mid-fight."
45. `status.poison` — "%NAME% is looking rather green."
46. `status.confuse` — "%NAME% has forgotten which way / is which."
47. `flee.ok` — "Everybody runs. Nobody mentions it again."
48. `flee.fail` — "%HERO% turns to run, thinks about it, / and turns back."
49. `enemy.flee` — "The %MONSTER% has had enough / and legs it."
50. `enemy.down` — "The %MONSTER% is beaten."
51. `victory` — "Victory!"
52. `victory.exp` — "%N% experience points. / %G% gold coins."
53. `defeat` — "You are dreaming of somewhere warm. / Somebody is carrying you."
54. `defeat.church` — "You wake on a church bench. / Your purse is lighter. You are not."

**Monsters joining, wagon, party**
55. `recruit.ask` — "The %MONSTER% is still here. / It appears to have decided something."
56. `recruit.join` — "%MONSTER% wants to be your friend! / Shall it come along?"
57. `recruit.name` — "What will you call it?"
58. `recruit.joined` — "%NAME% has joined the party. / %NAME% is thrilled about the wagon."
59. `recruit.decline` — "The %MONSTER% nods, entirely fine about it, / and wanders off to tell its mother."
60. `recruit.full` — "The wagon is full of monsters and / opinions. %NAME% trots off to the / paddock at home to wait."
61. `party.swap` — "%NAME% climbs down. %OTHER% climbs up."
62. `party.wagon.no` — "No wagon down here. It's all stairs."

**Searching the world** *(the discovery voice — 1 in 4 gives an item, the rest earn a laugh)*
63. `pot.empty` — "The pot holds nothing but a spider, / and the spider is not for sale."
64. `barrel.empty` — "Barrel of rainwater. And one boot. / Just the one."
65. `drawer.empty` — "Socks. Somebody's whole life in socks."
66. `wardrobe` — "%HERO% stands in the wardrobe / for a bit. It's nice in here."
67. `bookshelf` — "A book about turnips. / It is longer than it needs to be."
68. `bookshelf.2` — "'Monsters of the Realm, Volume Nine.' / Volumes one to eight are missing."
69. `cupboard` — "Jam. Nine jars of jam. / Someone here has a plan."
70. `sack` — "Flour. %HERO% is now slightly grey."
71. `well` — "%HERO% shouts into the well. / The well shouts back, eventually."
72. `bed.other` — "It's somebody else's bed. / They'd notice."
73. `search.nothing` — "Nothing. But it was worth a look."
74. `door.locked` — "Locked. The handle rattles / in a disappointed sort of way."
75. `door.needkey` — "Locked, and it wants a proper key. / Not a hairpin. It's seen hairpins."
76. `door.unlock` — "The key turns. The door forgives you."
77. `door.barred` — "Barred from the other side. / Someone in there does not want Tuesday."
78. `sign` — "%TEXT%"  *(signposts carry their own words; always with a joke on the second line)*

**System, saves and settings**
79. `title.new` — "A New Tale"
80. `title.continue` — "Carry On"
81. `name.prompt` — "And what shall we call the boy?"
82. `save.confirm` — "Write the tale down here?"
83. `save.done` — "Written down, and safe."
84. `save.over` — "There's a tale here already. / Shall we write over it?"
85. `quit` — "Close the book for now?"
86. `settings.text` — "How fast should the words come?"
87. `hint` — "Where were we, then?"  *(the P33 kid-mode nudge, always phrased as a question)*
88. `quest.new` — "Something to do: %TEXT%"

**Weather and time** (barks from the world, not the UI)
89. `night` — "The lamps are being lit."
90. `dawn` — "Somewhere, a cockerel is very pleased with itself."
91. `rain` — "Rain. The good sort, for staying in."

---

## 4. Thirty background NPC lines

Two lines or fewer. Each is a whole person. Assign freely across towns.

1. "I'm not lost. The village is lost. / I've been here since Tuesday."
2. "My husband went to fight a dragon. / He's gone to fight a *hedge*, but let him have it."
3. "We named the baby after the king. / Turns out the king's called Nigel."
4. "There's a monster in our cellar. / He pays rent, so."
5. "Don't go north. Or do. / I'm a signpost, not your mother."
6. "The blacksmith's gone deaf from the hammering. / HE'S GONE DEAF FROM THE HAMMERING."
7. "I've read every book in this castle. / Two of them were good."
8. "Priest says pray for rain. / Farmer says pray for sun. I pray for both, quietly."
9. "I sell hats. Nobody here has a head / worth the money, but I sell hats."
10. "You can't get lost in this town. / You can get *stuck*. Behind Mrs Pell."
11. "My cat brings me presents. / I'd prefer flowers. I get mice."
12. "Been guarding this door eleven years. / Nothing's ever come out. That's the worry."
13. "Everyone says I look like my father. / My father says nothing. He's a horse."
14. "The soup is famous. / The recipe is a secret. The secret is turnip."
15. "I fell down the well as a boy. / Best three days of my life."
16. "The wizard up the hill is very wise. / He is also on fire quite often."
17. "Aye, I've travelled. Been to the coast. / Didn't care for the amount of sea."
18. "My son wants to be a hero. / I've told him: heroes don't get pensions."
19. "There's treasure buried in this village. / Under the church. Under the *floor*. Anyway."
20. "I do the funerals and the weddings. / I've started getting them mixed up."
21. "Nice sword. My grandad had one like that. / Grandad's not with us. Neither's the sword."
22. "The inn's clean, the food's hot, / and the innkeeper is only slightly a thief."
23. "I keep bees. They keep me, mostly."
24. "That's not a statue. / That's Bernard. He's thinking."
25. "Big monster came through last week. / Ate the fence. Left a thank-you note."  *(it did not)*
26. "I'm the town crier. / TOWN'S FINE."
27. "Careful in the cave. It's dark. / That's the whole warning. It's just very dark."
28. "My wife says I talk too much. / She's right. She usually is. She's often right. / Mind you —"
29. "I've got nothing to tell you. / I've been practising saying it nicely."
30. "You're that lad with the sword. / Everyone's talking about you. Mostly about the hair."

---

## 5. Talking to a child without talking down

Our readers are six to twelve. Six is sounding words out. Twelve wants to be respected. Both are served by the
same trick: **simple sentences carrying grown-up meaning.**

**Vocabulary ceiling.**
- Default register: words a confident seven-year-old meets in a picture book — *bruise, lantern, bother,
  supper, muddy, brave, quiet, gone*.
- **One hard word per scene is a gift, never an obstacle.** A hard word is allowed when the sentence around it
  makes it obvious, when it is *fun in the mouth*, and when not knowing it costs nothing.
  - GOOD: "The bridge is *derelict*. Fallen in. Don't." — the meaning arrives free with the next two words.
  - GOOD: Barty's "a catastrophy of onions" — a wrong word, delightful, harmless.
  - BAD: "The suzerain's fealty is contingent." — three obstacles, no gift.
- Never gloss a hard word in brackets. Let the sentence do it, or cut the word.
- **Never require reading to survive.** Anything a player must do to progress is also shown by an arrow,
  a light, a sound or an NPC standing where you must go. Words are the joy, never the gate.

**Sentence length.**
- Aim for **8–12 words per sentence**. Under 6 for action and fear. Up to 18 only for a character whose
  long-windedness is the joke (Barty, Quiddle) and never twice in a row.
- One clause per line where you can. Two is the ceiling.
- Read every line aloud. If you run out of breath, or your voice flattens, it is too long.

**What "not talking down" actually means.**
- Do not soften real things. Somebody dies in this game. The word is *died*, not "went away".
  What we protect is not the fact — it is the child's footing: we show grief through a chair and a cup,
  and we never leave the child stranded in it. The next scene has soup in it.
- Never use a baby voice, never use "little one" from the narrator, never add "Yay!" or "Oh no!" for the
  child's benefit. They can tell.
- Jokes are allowed to go over a six-year-old's head **as long as they are not the only joke on screen.**
  Layer: a pratfall for the six-year-old, a dry aside for the twelve-year-old, one weary parent joke for whoever
  is holding the controller at bedtime.
- The child is the cleverest person in the room. Set up; never punchline twice.

**Fear, calibrated.**
- Scary = dread, not gore. Dark, quiet, wrong-shaped, too polite. No blood, no cruelty shown, no animals hurt
  on screen. Bishop Mortmain is terrifying because he is *nice*.
- Every frightening scene is followed within two minutes by something warm — a fire, a joke, a cat.
- The player is never told they failed. They are told what happened next.

### 5b. The same NPC across the three acts
Every named background NPC gets a line per act. Same person, same tic, three ages of the world.
This is the cheapest heart in the whole game — budget one rewrite per NPC per act, minimum.

**Old Hob (Puddlewick, by the well)**
- Act I: "Off up the hill again with your father? / Take a coat. He never takes a coat."
- Act II: "Well. You came back, and he didn't. / ...Barty's kept the fire in. Go on."
- Act III: "Bring the little ones here. / I'll tell them lies about their grandad."

**Bernard the blacksmith's boy**
- Act I: "One day I'll make a proper sword. / Today I made a hook. It's a good hook."
- Act II: "That's my sword on your belt, that is. / Don't chip it. I'll know."
- Act III: "My lad does the hammering now. / I do the standing about and the sighing."

**The gate guard, Puddlewick**
- Act I: "Nothing ever happens here. / Best job in the world."
- Act II: "Nothing's happened here in ten years. / You'd think that'd be a comfort."
- Act III: "Something's finally happened here. / I've decided I preferred the other thing."

**The innkeeper, Coddleston** (Act I is Prince Bertie's birthday)
- Act I: "No rooms. There's a whole *festival* on."
- Act II: "Rooms? All of them. Take your pick. / Nobody comes any more."
- Act III: "You'll want the big room. / I kept it. I don't know why I kept it."

---

## 6. Five worked scenes, as pages

Each `page` below is one boxful: at most three lines, at most 34 characters each.
The ruler `|--------------------------------|` is 34 wide — never write past it.

### 6.1 FUNNY — Bobble joins the party (Act I, B3, on the Long Lane)
```box
|--------------------------------|
The Gloop has not gone away.
It is sitting in the road, being
round at you.                    ▼

Bobble: "Bobble watched you fight.
Bobble thought: those are MY
people. Frankly, Bobble has
decided."                        ▼

Papa: "It's decided at us, lad."
Papa: "A pudding with a plan.
Keep it, if you would."          ▼

> Let it come along.
> Not just now.

(if kept)
Bobble has joined the party!
Bobble immediately gets in the
wagon and refuses to discuss it. ▼
```

### 6.2 TENDER — the first evening home (Act II, B12, Hollybank Cottage)
```box
|--------------------------------|
Barty: "Sit, sit. Eat something.
You have been walking with your
face like that for two days."    ▼

Barty: "Your father, he came here
once, in the rain, with you
under his coat. Very small."     ▼

Barty: "He said: mind this one,
Barty. I said: of course.
He said: no. Mind him."          ▼

%HERO% looks at his boots.

Barty: "I am not weeping.
It is the onions.
There are always onions."        ▼
```

### 6.3 SCARY — Bishop Mortmain at the coronation (Act II, B19, Ambergarde Keep)
```box
|--------------------------------|
The candles are all still lit.
Nobody has been in this room
for a very long time.            ▼

Mortmain: "There you are, child.
Do go on. I shan't be a moment.
I only came for a feather."      ▼

Mortmain: "Your father was here
too, once. He stood exactly
there. He was very polite."      ▼

%WIFE%: "Don't listen to him."
Mortmain: "No, don't. Listening
is how it starts."               ▼

Mortmain: "There now. Gently.
Nothing you love will ever be
lost again. That's better."      ▼
```

### 6.4 MUNDANE BUT CHARMING — buying a lantern
```box
|--------------------------------|
Quiddle: "Pots, pans, potions and
portable pity! What'll it be,
squire?"                         ▼

Quiddle: "The lantern. Take the
lantern. Guaranteed unbreakable.
Guaranteed-ish."                 ▼

> Buy the lantern. (35 gold)
> Just looking.

(bought)
%HERO% has got the Brass Lantern!

Quiddle: "You'll thank me in about
four minutes. Everyone does.
Mind how you go."                ▼
```

### 6.5 HEROIC — the gate of Whistfell Abbey (Act III, B24)
```box
|--------------------------------|
The doors are twelve feet of oak
and somebody has been knocking
for nine years.                  ▼

Linnet: "That's the door."
Rowan: "That's a *fortress*."
Linnet: "That's the door, Rowan."▼

Rowan: "I've never done anything
brave. I'd like to start with
something quite large."          ▼

%HERO% puts his hand on the door.

Behind you: a pudding, a lion,
two children with a sword too
big, and an old man with soup.   ▼

Halvard's voice, from memory:
"We'll walk till the light goes.
Then we'll walk a bit further."  ▼

> Open it.
```

---

## 7. What our writing must NEVER do

1. **Never copy Square Enix.** No character, place, monster, spell or line from the real *Dragon Quest*.
   If it feels familiar, it goes.
2. **Never mock the player.** Not on defeat, not on a wrong turn, not in a tutorial, not ever.
3. **Never write filler.** "Hello." "Welcome to the village." "I have nothing to say." If a person has nothing
   to say, they say something funny about having nothing to say (see NPC line 29).
4. **Never explain the joke or the feeling.** Cut the last sentence. Cut it again.
5. **Never let the machine speak like a machine.** No "ERROR", "INVALID", "Are you sure? Y/N", "Loading...".
6. **Never gate progress behind reading.** Words are a reward, not a lock.
7. **Never use cod-dialect, phonetic accents, or "Ye Olde" anything.**
8. **Never punch down.** No jokes about bodies, poverty, illness, disability, or an NPC's accent.
   Nobody in this world is a joke to the world.
9. **Never let the villain gloat.** No "you fool", no "you cannot stop me", no laughing. Courtesy is scarier.
10. **Never be cruel to animals, children or the dead** — on screen or in a line.
11. **Never break the box.** No page over three lines, no line over 34 characters, no orphaned word.
12. **Never use modern or internet register.** No "okay", no "awesome", no "epic", no memes, no winking at the
    audience, no fourth wall. This world does not know we exist.
13. **Never make grief tidy.** No "he's in a better place", no lesson at the end of a sad scene. Just soup.
14. **Never write more than three pages for a passer-by.** Respect the child's thumb.
15. **Never repeat a line verbatim across two NPCs.** If two people say the same thing, one of them is wrong
    about it, and that is the joke.
