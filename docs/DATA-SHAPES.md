# DATA SHAPES — monsters, spells, items, characters, battle events
**Owner: P14/P19 (the battle rules engine). Law for `src/data/monsters.js` (P16), `src/data/spells.js` (P20),
`src/data/items.js` (P21), the party/wagon/save shapes (P18, F5), `src/battle/recruit.js` (P17) and the
presentation layer `src/battle/present.js` (P15).**
Names are CANON (`docs/CANON.md`). Numbers are SYSTEMS-BIBLE / MONSTER-BIBLE, **except where the balance pass (§9)
supersedes a stat block** — `tests/battle/balance.js` holds those, measured end to end. When this file and the engine
disagree, the engine is the bug — report it.

The engine is `src/battle/battle.js` (pure logic, runs under plain node). A working, complete example of every shape
below is `tests/battle/data.js` (all 33 MONSTER-BIBLE monsters + every CANON boss, the 28 CANON spells, the SYSTEMS
§4 items) with `tests/battle/balance.js` applied on top — copy the *balanced* numbers (print them with
`node -e "import('./tests/battle/data.js').then(m => console.log(m.default.monsters.gloop))"`). Run
`node --test tests/battle` after changing data, and **`node tests/battle/journey.mjs`** — whole playthroughs with EXP
carried, every kind of child, exit code 1 if the difficulty contract breaks — before calling a number done.

Contents: §1 conventions · §2 monsters · §3 spells · §4 items · §5 party members · §6 battle API & events ·
§7 the result object · §8 open numbers the bibles do not give · §9 what the simulator says.

---

## 1. Conventions
- **ids** are `snake_case` and stable forever (saves store them). Display names live in `name`.
- Every data module exports **a plain object keyed by id** (`export const MONSTERS = { gloop: {...} }`); arrays of
  objects with `id` are also accepted by `createBattle`.
- No functions in data. Everything must survive `JSON.stringify`.
- Rates are numbers `0..1`; `"1/8"` strings are accepted for `recruit` and drop `rate`.
- Text templates use `%ACTOR%`, `%TARGET%`, `%MOVE%`, `%N%`… (CANON §10 tokens). Write the name mid-sentence as it
  should read (the engine supplies "the Gloop" / "Gloop B" / "Mumbleroot the Grudge") and it capitalises the
  first letter of the sentence for you.
- Anything you had to invent: add `provisional: true` (or a list of field names) so it can be found and tuned.

## 2. Monsters — `src/data/monsters.js` (P16)
```js
gloop: {
  id: 'gloop', name: 'Gloop', plural: 'Gloops',      // plural defaults to name+'s' ("Dune Buggies" needs it)
  tier: 1,                                           // MONSTER-BIBLE tier 1..5 (danger band)
  lvl: 2, hp: 18, mp: 0, atk: 11, def: 6, agi: 5,    // the stat block (balance pass r2). atk is total ATK (no weapon)
  exp: 2, gold: 2, recruit: 1/8,                      // recruit 0 = never asks; lvl = danger rank (recruit odds)
  partyLevel: 2,    // WILD MONSTERS: the party level this block is tuned for — its home. An encounter-table entry
                    // met elsewhere carries it there (§6 enemy spec `partyLevel`, formulas.scaleMonster)
  // optional ----------------------------------------------------------------------------------------------
  wis: 10,          // spell power (MAG). default round(5 + lvl*2.5)
  mdef: 2,          // magic resistance. default round(lvl*1.2)
  luck: 2,          // default lvl
  evade: 0.06,      // SYSTEMS §1.4: only Flapjack .06, Grimalkitten .05, Boohoo .04, Bogwallop .03
  elements: { fire: 1.5, ice: 0.5, lightning: 0 },  // x multiplier; 0 = "It has no effect at all!"; default 1
  resist: { sleep: 0.5, confuse: 0 },                // x on status landing; 0 = immune
  group: [3, 3],    // encounter size override (Twiglets and Dune Buggies come in threes) — for P31
  drops: [{ item: 'herb', rate: 0.18 }],            // first success wins; one drop per monster
  joinLine: '"Gloop!"', nameSuggest: 'Dollop', pronoun: 'it', // befriending (MONSTER-BIBLE §7)
  article: 'the',   // how a lone one is introduced; bosses default to 'the', others to a/an
  defeatText: '%TARGET% unravels into a plain black coat.',   // replaces "The X is beaten."
  moves: [ /* §2.1 */ ],
  // bosses -------------------------------------------------------------------------------------------------
  boss: true,       // no fleeing (refused with fleeRefusal, no turn lost), no ambush, no 40% floor
  properName: true, // "Mumbleroot the Grudge draws near!" (no article)
  partyLevel: 7,    // bosses: the level children really arrive at (journey-measured); sets expectedMaxHP for the Big
                    // Attack cap and the EXP keel. Bosses never scale.
  expectedMaxHP: 52,// or give it directly
  actions: 1,       // actions per round (phases can raise it)
  fleeRefusal: 'The belfry door has swung shut…',
  neverTargets: ['willow_child', 'willow'],          // party member ids it will not attack
  minHpPct: 0.5,    // cannot be hurt below this fraction (the Sunmane)
  partnerGivesUp: true, // beat one and every other partnerGivesUp monster sits down (Hush & Hark)
  phases: [ { below: 0.4, text: '%ACTOR% stands up!', set: { atk: 46, actions: 2, name: 'Mortmain Enfolded' },
              addMoves: [ /* moves */ ], removeMoves: ['hush'],
              skipTurn: true, skipText: '"I only wanted someone to hear it."',   // stops for one turn
              spare: true } ],                       // spare = the fight ends kindly here (Malgrim "lets go")
  transformsInto: 'malgrim_unravelling', transformText: '…', // at 0 HP: becomes that monster at full HP (the Cocoon)
  spareAtZero: true, spareText: 'Hoarfax sits down in the snow and sneezes.', // never dies; still rewards/recruit
  scriptedEnd: { round: 2, outcome: 'victory', text: 'The Sunmane stops mid-roar…' },   // ends on its Nth turn
  untouchable: true,// every hit prints "You can't reach him." (B9/B19 — use with options.scripted)
}
```

### 2.1 Moves
`moves` is a list. A string is shorthand for a plain attack (`'attack'`). Common fields:
`id`, `name`, `kind`, `weight` (default 1; relative pick chance), `target`, `text`, `telegraph`, `big`,
`once`, `maxUses`, `cooldown` (rounds), `notTwiceRunning`, `when` (`'round1'|'belowHalf'|'aboveHalf'`),
`then` (move id forced as its next action), `below` (heal moves: only when someone is under this HP fraction).

`target`: `'enemy'` (one hero, position-weighted 35/22/22/22%), `'enemies'` (all heroes), `'random'` (with `hits`,
each hit re-picks), `'self'`, `'ally'` (most-hurt monster), `'allies'` (all monsters).

| kind | fields | notes |
|---|---|---|
| `attack` | `power` (x normal), `hits`, `critRate`, `fixed` (exact damage), `recoil`, `drain`, `element`, `status:{id,chance,turns}`, `lowestHp`, `selfMiss`,`selfMissDamage` | the SYSTEMS §1.3 formula; Cuddle = power 1.4 + recoil 8 |
| `magic` | `base`, `k`, `element`, `pierce`, `fx`, `status` | non-spell magical damage off the monster's `wis` vs MDEF (Toll, Frostbreath) |
| `spell` | `spell: 'scorcha'` | uses §3 and costs the monster MP; falls back to attacking when dry |
| `status` | `status: {id, chance, turns}` | `turns` number or `[min,max]` |
| `heal` | `amount`, `below` | flat heal |
| `buff` | `buff: {stat, step, max, turns}` or `{stat, mult, turns}`, may be a list | `target:'enemy'`/`'enemies'` debuffs the party (Grumble, Dust of Years) |
| `selfStatus` | `status: {id:'hidden'|'fluffed'|'guard', turns}` | Burrow, Vanish, Fluff Up, Clatterguard; pair with `then` |
| `standStill` | `heal` | skips, DEF x2 for the round (Twiglet, Boulderdash) |
| `nothing` | `fx` | Sniffle, Enormous Burp, Bow Politely |
| `flee` | `withGold`, `when` | Glimmergloop, Trundle Away |
| `steal` | `gold:[min,max]`, `fleeChance` | Gold Gobble — beaten thieves give it back |
| `summon` | `monster`, `count` | Rally, Summon Boohoo |
| `swallow` | — | Gulp (one turn, pops back out) |
| `purge` | — | Undo (removes party buffs) |
| `setHp` | — | Nothing At All (everyone to 1 HP; never knocks out) |
| `shuffle` | — | Jinglebottom's Swap (reorders two heroes) |
| `pullBack` | `power` | Undertow: one hero is dragged to the back row (then hit at `power`) |
| `echo` | `partner` (species id) | Hark: repeats the partner's last move (never its Big Attack) |
| `mercy` | `pct` (0.3) | Malgrim's *Listen*: every standing hero gets `pct` of their max HP back ("somewhere, a lullaby") |

Other move fields: `targetCaster` (a single-target move goes for the hero carrying the most MP who isn't already
under that status — Mortmain's *Silence the Choir*, Hoarfax's *Hush*); `then` works after a telegraphed move too
(*Nothing At All* → *Listen*; before balance pass r2 a wind-up swallowed it).

**Telegraphs & Big Attacks (SYSTEMS §6.3).** Any move with `telegraph` spends one turn winding up (event
`telegraph`) and fires on the monster's next turn one round later. `big: true` additionally: damage per target
capped at `0.55 x expectedMaxHP` (0.45 at S>=75) and, the first time it hits each hero in a battle, at 80% of
that hero's current HP (so it can never knock anyone out); after firing it is locked for 3 rounds
(`snapshot().enemies[i].bigCooldown`, the three dots). Every boss gets exactly one `big` move.

Status ids: `sleep` `poison` `dazzle` `confuse` `root` `hiccup` `silence` `swallowed` `hidden` `fluffed` `guard`
`hexed`. Buff stats: `atk` `def` `agi`.

## 3. Spells — `src/data/spells.js` (P20)
```js
mendmore: {
  id: 'mendmore', name: 'Mendmore', mp: 5, tier: 2, school: 'healing',
  kind: 'heal',          // see table
  target: 'ally',        // 'enemy' | 'enemies' | 'ally' | 'allies' | 'fallen' | 'party' | 'self'
  base: 45, k: 0.45,     // SYSTEMS §1.6/§1.7 coefficients
  battle: true,          // false = field only (menu shows it greyed in battle with a reason)
  field: true,           // usable from the field menu (P13)
  blurb: 'heals a friend rather a lot.',   // the one plain-English line on the level-up spell card
}
```
| kind | extra fields | engine behaviour |
|---|---|---|
| `damage` | `element`, `base`, `k`, `pierce` (0.5 = ignores half MDEF) | per-target §1.6; immune target refunds half MP once |
| `heal` | `base`, `k` | refused at full HP before MP is spent ("already in the pink") |
| `healAll` | `base`, `k` | skips anyone full |
| `fullheal` | — | |
| `revive` | `pct` (0.5) | Rouse always works |
| `cure` | `cures: ['poison']` | |
| `buff` | `buff: {stat, step, max, turns}` | Bolster/Bluster: step .25, max 1.5, 5 rounds |
| `debuff` | `buff: {stat, mult, turns}`, `land: {normal, boss}` | Wobble .75 x DEF, 6 rounds, 90%/55% |
| `sleep` | `turns: [2,4]` | lands on `0.55 + (Luck - Res)/120`, clamp .15–.85; wakes on damage |
| `root` | `turns`, `chance` | bosses: 1 round, once per battle |
| `status` | `status`, `chance`, `turns` | generic |
| `escape` | — | Scarper: leaves a normal battle, refused vs bosses |
| `field` | — | never castable in battle |

Who learns what, and at which level, lives in `src/data/growth.js` (`CHARACTERS[id].learn`), not in spells.js.

## 4. Items — `src/data/items.js` (P21)
```js
herb:        { id:'herb', name:'Herb', kind:'consumable', buy:8, field:true,
               battle:{ effect:'heal', amount:30, target:'ally' } },
copper_sword:{ id:'copper_sword', name:'Copper Sword', kind:'weapon', slot:'weapon', power:11, buy:70, who:['hero','rowan'] },
chain_mail:  { id:'chain_mail', name:'Chain Mail', kind:'armour', slot:'armour', def:24, agi:-2, buy:560, who:'anyone' },
```
- `kind`: `consumable` `weapon` `armour` `shield` `helm` `accessory` `key`. `slot` for anything equippable.
- `who`: `'anyone'` or a list of char ids (CANON §1). Sell price is SYSTEMS §5 (`floor(buy/2)`), not stored.
- Battle effects (`battle`): `heal` (`amount` number or `'full'`), `mp` (`amount`), `cure` (`statuses`),
  `revive` (`pct`), `damageAll` (`amount`, `element`). `battle: null` = cannot be used in a fight.
- Gear bonuses the engine reads (all optional, summed across slots): `power` `def` `mdef` `agi` `wis` `luck`
  `resil` `maxHp` `maxMp` `mpRegen` (per round) · `allEnemies` (0.65 boomerang / 0.75 whip: attack hits every
  monster at that power) · `stun` (Thunderfork .12: roots a normal monster 1 round) · `elementBonus: {ice: .25}`
  (Frostbite Sabre; Larksteel Sword `{lightning: .25}` — the wielder's spells of that element hit 25% harder) ·
  `spellGuard: 0.5` (Larkweave Cloak: halves all spell damage taken) · `halves: ['fire']` · `immune: ['sleep']`
  (Larksteel Helm `['confuse']`) · `reflect: ['snoozle','wobble','sleep']` (Mirror Shield).
- Non-battle fields for other pieces: `encounterMult` (Pip's Bell .65, P31), `recruitMult` (Charm Bell 1.5, P17),
  `reusable`, `noSell`, `key`, `blurb`.

## 5. Party members (runtime + save) — P18, F5, P13
One shape for the front line, the wagon, the paddock and the save file.
```js
{ id: 'hero',            // CANON char id; companions: their own unique id ('bobble', 'cactuddle_2')
  name: 'Bram',          // player-chosen display name
  kind: 'family',        // 'family' | 'monster' | 'guest'
  lvl: 12, exp: 1590, hp: 97, mp: 20,          // current values; max values are derived, never stored
  equip: { weapon:'iron_lance', armour:'chain_mail', shield:'iron_shield', helm:'leather_cap', accessory:'osrics_wooden_bird' },
  status: { poison: 99 },                      // only poison persists after a battle
  mother: 'willow',                            // twins only: CANON §7 mother's gift
  // monster companions
  species: 'gloop', template: 'plodder', mult: 1.0, cap: 30,
  // overrides (tests, scripted scenes): stats:{hp,mp,might,nimble,resil,wis,luck} + fixed:true, spells:[...],
  // gear:{power,def,mdef} (guests' fixed kit), control:'player'|'ai'
}
```
Build them with `newMember(id, lvl, extra)` / `newCompanion(monsterData, {id, name, lvl})` from `src/data/growth.js`.
Guests (`halvard`, `willow_child`, `sera_child`, `bertie`, `willow_grown`) are AI-controlled, cannot be equipped,
never level and earn no EXP. A guest with `mentor: true` (Halvard) leaves the children their own fight: he takes a
monster nobody has picked, otherwise steps back with one of his `mentorLines` (event `act` kind `watch`), and stops
holding back when a child is under half HP, from round 4, or against a boss; monsters give him a wide berth (a third
of the usual share of blows). Guests (SYSTEMS §2.4: Halvard and Bertie fixed, the children on their own Lv 3 rows, grown
Willow at the party's level). Queen Elowen (`elowen`) is family on the Lantern curve and knows every healing spell. Stats come from `growth.js`: `statsFor(member)`, `gainsAt(member, L)`,
`spellsKnownAt(member)`, `EXP_TABLE`, `levelForExp`. Derived combat values: `formulas.derive(stats, gear)`.

## 6. The battle API and its events — P15 animates these
```js
import { createBattle } from './src/battle/battle.js';
const battle = createBattle({
  party,            // members; the first 4 fight, the rest ride in the wagon
  wagon,            // more members (up to 8 total in the wagon)
  enemies,          // ['gloop', 'gloop'], or specs: {id, partyLevel, areaLevel, hpMult, ...overrides}
                    //   partyLevel — met at this party level: the species' block is carried there (encounter tables:
                    //                P31's `encounters.table[{id, weight, lvl}]` → `{id, partyLevel: lvl}`)
                    //   areaLevel  — the map's level, for the EXP keel (pass it on every spec, or as options.areaLevel)
                    //   hpMult     — a sturdier one of these (tests/battle/areas.js uses it per area)
                    //   anything else — per-instance overrides ({id:'chestnut', hp: 60})
  rng,              // seed number/string, () => [0,1), or {next()}; same seed = same battle, event for event
  data,             // {monsters, spells, items, strings?}
  emit,             // optional (event) => void, called as each event happens
  options: {
    gold, bag: {herb: 3},            // carried gold (for Gold Gobble / defeat) and the bag
    areaLevel: 12,                   // the map's party level: the invisible EXP keel (formulas.expKeel). Default: the
                                     // specs' areaLevel, else their partyLevel, else a boss's partyLevel. expKeel:false = off
    wagonReachable: true,            // false in caves, towers, interiors and every boss room
    assist: { s: 0 },                // the hidden struggle score (SYSTEMS §6.4)
    ambush: undefined,               // undefined = roll; 'party' | 'enemy' | 'none' to force
    protectedMap: false,             // first three encounters of a new map: no enemy ambush
    recruit: { enabled, kidMode: true, charmBell, joined: {gloop: 1}, misses: {}, battlesSinceRecruit },
    scripted: { rounds: 3, text: "You can't reach him." },  // B9/B19: unwinnable AND unlosable
    guestControl: 'ai', autoPolicy: 'auto', normalHitCap: 0.40, expectedMaxHP, holdResolving: false,
  },
});
battle.opening            // events for the encounter start: appear, ambush, and the enemy free round if any
battle.phase              // 'command' | 'resolving' | 'victory' | 'defeat' | 'fled' | 'scripted'
battle.needsCommand()     // -> {id, name, hp, maxHp, mp, maxMp, spells:[{id,name,mp,usable,field}], canSwap:{ok,text}, …} | null
battle.command(id, cmd)   // cmd: {type:'attack', target} | {type:'spell', id, target} | {type:'item', id, target}
                          //      {type:'defend'} | {type:'flee'} | {type:'swap', target: wagonId, out?: frontId}
                          // -> {ok:true, next} | {ok:false, reason, text}  (never throws; text is kind, show it)
battle.undoCommand()      // back to the previous actor
battle.autoCommands(p)    // fill the rest with an AI policy: 'auto' (the "Fight!" button) | 'smart' | 'mash'
battle.resolveRound()     // -> this round's ordered events (missing commands default to Attack)
battle.autoRound(p)       // autoCommands + resolveRound
battle.validTargets(id, cmd), battle.actor(id), battle.snapshot(), battle.result, battle.log, battle.over
```
Refusals that cost nothing (the child keeps the turn): healing someone at full HP, fleeing a boss, Scarper vs a
boss, a spell without enough MP, an item the bag has run out of, swapping when the wagon can't follow (text:
*"The wagon's outside, waiting in the rain."*).

### 6.1 Events
Every event is `{t, text?, ...}`. `text` is ready to type into the message window (SYSTEMS §7 wording, CANON
§11 choices). Show events in order, one beat each; never batch two `text`s into one line.

| t | fields | presentation beat |
|---|---|---|
| `appear` | `enemies[]`, `boss` | "Two Gloops and a Bloop draw near!" (§7.1) |
| `ambush` | `side` `'party'\|'enemy'` | "You've caught them napping!" / "They came out of nowhere!" |
| `round` | `n` | the 220 ms beat before initiative |
| `act` | `actor`, `kind` `attack\|spell\|item\|move\|defend\|confused\|watch` (a mentor guest stepping back), `spell?`, `item?`, `move?`, `name?`, `element?`, `big?`, `nothing?`, `confused?` | actor steps forward / monster lunges |
| `damage` | `actor`, `target`, `side`, `amount` (shown), `dealt` (HP removed), `crit`, `miss`, `reason?` `miss\|hidden\|fluffed\|blocked\|unreachable\|immune\|swallowed`, `element?`, `poison?`, `hp`, `maxHp` | contact frame, number pop (gold x1.6 + 6 px shake on `crit`), HP bar eases. `miss: true` → whiff, **no number** |
| `heal` | `actor`, `target`, `amount`, `mp?` (MP not HP), `hp`, `maxHp`, `quiet?` | green motes, `+N` |
| `status` | `target`, `status`, `on`, `turns?`, `skip?` (turn lost to it), `resisted?`, `cured?`, `expired?`, `maxed?`, `mult?` | buffs are `atk_up` `def_up` `agi_up` `…_down` |
| `defeat` | `target`, `side`, `species?` | enemy: POP (MONSTER-BIBLE death); party: slump ("worn out") |
| `revive` | `target`, `hp` | Rouse light-fill |
| `telegraph` | `actor`, `move`, `name`, `big` | red chevron at 2 Hz, music drops to percussion for the round (§6.3) |
| `swap` | `out`, `in`, `slot`, `auto` | jump-in from the wagon |
| `reorder` | `order[]` | party positions changed (Jinglebottom) |
| `flee` | `side`, `ok`, `actor?`, `withGold?` | party success ends the battle; enemy flees off-screen |
| `steal` | `actor`, `gold` (negative = given back) | coin puff |
| `summon` | `actor`, `added[]` | new monsters drop in |
| `phase` | `actor`, `index` | boss phase line (candles go out…) |
| `transform` | `actor`, `into`, `name`, `hp`, `maxHp` | new model, full HP bar |
| `spared` | `target` | the monster sits down / lets go — **no pop** |
| `second_wind` | `target` | small gasp + shimmer (reads as luck; never explained) |
| `fx` | `id` (`darken`, `desaturate`), `actor` | screen treatment |
| `message` | `refunded?`, `target?` | a plain line |
| `victory` | `exp`, `gold`, `drops[{item,name,from,monster}]`, `boss`, `allFled?`, `lines[]` | fanfare → tally (§10.1) |
| `recruit_offer` | `monster{id,species,name,lvl}`, `joinLine`, `ask`, `lines[]` | P17's join beat (MONSTER §7); after the tally, before level-ups |
| `levelup` | `who`, `name`, `from`, `level`, `gains{hp,mp,might,nimble,resil,wis,luck}`, `gainsOrdered[{key,label,gain,total}]` (SYSTEMS §10.2 order), `learned[{id,name,mp,blurb}]`, `lines[]` | §10.2 ceremony, one per character |
| `wipe` | `goldBefore`, `goldAfter`, `wakeAt:'church'`, `lines[]` | fade to **white**, family theme, wake at the church. The words "Game Over" never appear |
| `scripted_end` | `endText?` | B9/B19 close |
| `end` | `outcome` | last event of every battle |

### 6.2 Snapshot (`battle.snapshot()`, serialisable)
`{v, round, phase, boss, scripted, ambush, wagonReachable, party[], wagon[], enemies[], commands[], needs, gold,
bag, fleeFails, assist:{s,tier}, rngState, events, errors, result}` — party entries
`{id,name,kind,guest,lvl,exp,hp,maxHp,mp,maxMp,atk,def,agi,alive,status[],buffs{},spells[]}`, enemy entries
`{id,species,name,lvl,hp,maxHp,mp,alive,gone,boss,status[],buffs{},telegraphing:{move,name,big}|null,bigCooldown}`.
`assist` is for `__DQ.state()` and critics only — **never** show it to the player.

## 7. The result (`battle.result`, set when the battle ends)
```js
{ outcome: 'victory'|'defeat'|'fled'|'scripted', rounds,
  exp, gold, drops,                 // earned this battle (exp is per member before catch-up)
  goldAfter, bag, itemsUsed,        // write these back to the save
  party: [member], wagon: [member], // §5 shape with new lvl/exp/hp/mp/status; front/wagon order after swaps
  levelUps: [{who, from, level, learned: [spellIds]}],
  recruit: { offer: {id,species,name,lvl} | null, state: {joined, misses, battlesSinceRecruit} } | null,
  assist: { before, delta, after },  // store `after` as the new S
  boss: [ids]|null, bossDefeated: [ids]|null, bossWipe: [ids]|null,  // P31: two wipes by the same boss → helper NPC
  stats: { damageTaken, maxHitPct, cappedHits, koCount, crits, telegraphs, bigFired, secondWinds, … } }
```
After a `defeat`, the field (not the battle) moves the party to the church and heals them; the battle has already
halved the gold (floor 30) and kept every point of EXP earned before the wipe.
P17 answers the recruit offer: on **Yes** add a companion (`newCompanion`) and `joined[species]++`; on **No**
increment `misses[species]` (the 13th refusal-or-miss is guaranteed to ask).

## 8. Open numbers — what the bibles still do not give (filled provisionally in tests/battle/data.js)
The canon pass (SYSTEMS §2.4/§3/§4, MONSTER §6b) now gives Elowen, Bertie, the child guests, Zapple, Whistle Down,
the Larksteel set and every CANON boss stat block; those are used verbatim. What is left:
| What | Provisional value | Why it matters | Owner |
|---|---|---|---|
| Move numbers the stat blocks only name | `power`/`base`/`k`/`hits` per move in data.js (e.g. Cold Draught base 14, High Tide base 40, Vespers base 80) | damage shape of every named attack | P16 |
| Which move is each boss's one Big Attack, and its telegraph line | Cold Draught, Belly Flop, Toll, High Tide, Frostbreath, Ruler Rap, Hush Now / Echo Strike, Vespers, Unlight, Nothing At All | SYSTEMS §6.3 "exactly one" | P16 |
| Mumbleroot's damaging move | Root Lash (the bible lists only Bind and Cold Draught) | otherwise the first boss cannot hurt anyone | P16 |
| Guest kit (Halvard, Bertie, children, grown Willow) | growth.js `GUESTS[*].gear` | guests "cannot be equipped", but walk in with something | P19 |
| Poison tick | maxHP/12, never below 1 HP | SYSTEMS names poison, no tick | P20 |
| Defend | halves damage for the round | DQ standard, not in SYSTEMS | — |
| Monster `wis`/`mdef` defaults | 5 + 2.5×lvl / 1.2×lvl | MONSTER stat blocks have neither | P16 |
| Glimmergloop spell immunity | all elements 0 | DQ metal-slime convention, not in the bible | P16 |

## 9. What the simulator says (tests/battle/sim.mjs) — for P16 (monsters), P31 (encounters), P22 (economy)
Full run: `node tests/battle/sim.mjs --n 2000 --walks 200` → `shots/P14-sim/sim.txt` (≈2,000 fights per area×level,
smart and attack-only play, 200 no-inn walk-throughs each, every boss). The engine enforces the difficulty contract
(no zero, 40% floor, telegraphs, gentle defeat); these are *data* findings.
- **The Frittering Sands at Act II start is too hard.** With the B11 party (Bram, Digby, Bobble) careful play wins
  74% at Lv 10 / 94% at Lv 11, attack-only 69% / 80%, and a 13-fight walk without an inn wipes 96–99% (60% even at
  Lv 13). Cactuddle (Lv 17) and Dune Buggies in threes (Lv 19) are tier-3 in a leg-4 area. Suggest: Dune Buggies in
  ones or twos until `ch2.wagon`, or a tier-2 desert table until Marbleford.
- **Walks that need the inn once:** the children in the Whispering Wood (walk wipe 17% at Lv 4, 5% at Lv 6 — Sir
  Gloopalot and Hoot Couture are hard on Lv 3 child guests), the Whistling Caves (25% at Lv 9) and Marbleford Downs
  (18% at Lv 13). Fights themselves are still won ≥98%.
- **Monster gold vs SYSTEMS §5:** Acts I–II pay about 2× the leg's gold per battle (Coddleston 35 vs 18, Whistling
  Caves 61 vs 28); the Sogglemarsh / Pelican Coast (23 vs 42) and the Belfry (33 vs 66) pay about half. The next buy
  is still affordable, but the curve is lumpy.
- **Story bosses end fast** against a CANON-level party, all won 100%: Bogwallop 2 rounds, Hoarfax 3.4, the Iron
  Governess 4.0, Sexton Sootbell 4.1, Mumbleroot 5.5, the Tidewarden 5.8. The sim prints "HP for ~8 rounds".
- **The finale is long:** Mortmain (2400 HP, two actions from 60%, Benediction ×3) 18 rounds, Malgrim (1800 + 2700)
  23 rounds. Careful play wins 98% / 100%; the "Fight!" auto-battle 61% / 98%; attack-only 0% (as in DQ — but the
  §6.1.6 helper NPC after two wipes matters here).
