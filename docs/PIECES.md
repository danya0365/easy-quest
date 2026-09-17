# The Pieces — file ownership map
Each piece is small enough to build, run and judge on its own. **Edit only the files listed as yours.**
If you need a change in someone else's file, put it under `NEEDS:` in your report instead. Files you create
inside a directory you own are yours. `docs/progress.json` is written only via `tools/progress.mjs`.
Names (characters, places, flags, items, spells, music ids) come from `docs/CANON.md` — never invent a second version.

## How a piece goes live without touching a shared file
The between-waves smoothing carved the seams so the pieces below can work in parallel:
- **Scene plugins.** `src/main.js` imports each plugin file once and calls its `install(ctx)` (see ARCHITECTURE
  "Scene plugins"). Fill your plugin file and it is live in the real game at `/index.html`. Plugins today:
  `src/ui/transitions.js` (P29) · `src/ui/dialogue.js` (P12) · `src/ui/menu.js` (P13) · `src/ui/hud.js` (P32) ·
  `src/world/npc.js` (P11) · `src/world/encounter.js` (P31) · `src/battle/present.js` (P15) ·
  `src/battle/scene.js` (P14) · `src/ui/title.js` (P01, may re-point the boot at its title scene).
- **Field hooks.** `Field.on('load'|'unload'|'update'|'render', fn)`, `Field.world()`, `Field.setTransition(fn)`,
  `Field.talk({text, voice, name})` — plus the Bus events `map.enter` / `map.leave` / `dialogue.start|end` / `menu.open|close`.
- **Camera and player** are their own modules behind a small interface the field calls (`camera.js`, `player.js`).
- **Art recipes** live with the art pieces; `src/world/scenery.js` is only a thin composer the maps call.
- **Map layers.** A map `src/world/maps/<id>.js` (P23) is merged at load with `<id>.npcs.js` (P11: people and every
  line anything in the map says) and `<id>.chests.js` (P30: containers and treasure). See ARCHITECTURE "Map layers".

## Foundation (built first, everything depends on it)
| id | piece | owns |
|----|-------|------|
| F1 | Engine core: loop, app, states, events, rng, debug API | `src/engine/{app,loop,states,events,rng,debug,assets}.js` |
| F2 | Input: keyboard, gamepad, touch, virtual buttons | `src/engine/input.js` |
| F3 | Art foundation: palette, toon materials, outlines, canvas textures | `src/art/{palette,toon,tex}.js` |
| F4 | UI shell: DQ window widget, bitmap-ish font, text engine, css | `src/ui/{window,text,font}.js`, `src/ui/ui.css` |
| F5 | Save/load + slots + title continue | `src/engine/save.js` |

## Pieces
| id | piece | owns |
|----|-------|------|
| P01 | Title screen & intro (logo, sky, music `title`, A New Tale / Carry On) — takes over the boot via `ctx.boot` | `src/ui/title.js` |
| P02 | Sky, sun/moon, clouds, hill rings, day-night, weather, birds, Highfeather in the clouds | `src/art/sky.js`, `src/art/weather.js` |
| P03 | Terrain: heightfield helpers, lane/stream masks, painted ground, water, cliffs, LOD | `src/art/terrain.js` |
| P04 | Props & set dressing: trees, forests, bushes, rocks, fences, signposts, flowers, tufts, wells, lamps, bridges, critters — **and the scenery kit core** (buckets, footprints, see-through, flush) | `src/art/props.js` |
| P05 | Buildings: cottages, roofs, chimney smoke, inn, church, shop, castle exteriors | `src/art/buildings.js` |
| P06 | Interiors: furniture, beds, pots, barrels, shelves, rugs, fireplaces | `src/art/interior.js` |
| P07 | Character models: Bram (boy / man), Halvard, Willow, Sera, Barty, the twins, villagers | `src/art/chars.js` |
| P08 | Character animation rig: idle, walk, run, talk, nod, attack, celebrate, sit | `src/art/anim.js` |
| P09 | Camera: spring follow, orbit, framing, talk framing, cutscene camera, terrain floor | `src/world/camera.js` |
| P10 | Player: movement feel, collision response, interaction target, footsteps, the hero model adapter | `src/world/player.js` |
| P11 | NPC life: people and animals from map.npcs, wander, schedules, facing — and every map's people/lines layer | `src/world/npc.js`, `src/world/maps/*.npcs.js` |
| P12 | Dialogue: box, typewriter, choices, portraits, nameplates, voice/wit | `src/ui/dialogue.js` |
| P13 | Menus: main, items, equip, spells, status, party, misc, settings | `src/ui/menu.js` |
| P14 | Battle core: turn order, targeting, action resolution, flow, and the `battle` scene | `src/battle/{battle,actions,ai,scene}.js`, `tests/battle/*` |
| P15 | Battle presentation: backdrop, camera, hits, damage pops, shake, victory, monster-joins moment | `src/battle/present.js` |
| P16 | Monster roster & models (Gloops, Flapjacks, Peckish, bosses) | `src/art/monsters.js`, `src/data/monsters.js` |
| P17 | Monster recruitment: the join moment, naming, roster, the wagon and the Hollybank paddock | `src/battle/recruit.js`, `src/world/companions.js` |
| P18 | Party & wagon: order, swap in battle, followers trailing you, Parsnip | `src/world/party.js` |
| P19 | Stats, growth curves, EXP, level-up ceremony | `src/data/growth.js`, `src/battle/formulas.js` |
| P20 | Spells & abilities + spell VFX (CANON §7 names) | `src/data/spells.js`, `src/art/fx.js` |
| P21 | Items, equipment, inventory, bag | `src/data/items.js` |
| P22 | Shops, inns, churches, banks, economy balance | `src/ui/shop.js`, `src/data/shops.js` |
| P23 | World maps: Puddlewick, Hollybank Cottage, Saltmarrow, Coddleston, Aldenmoor (the overworld), Cobwell Manor, Gogglestone Caves — base map files + the map index | `src/world/maps/<id>.js`, `src/world/maps/index.js` |
| P24 | Story Act I — childhood: Halvard, Willow, Sera, Cobwell Manor, Pip, the Grey Ruins | `src/story/chapters/ch1*.js` |
| P25 | Story Acts II–III — the Quiet Quarry, the bride choice, Ambergarde, Rowan & Linnet | `src/story/chapters/ch2*.js`, `ch3*.js` |
| P26 | Cutscene scripting DSL + story flags (CANON §4) + quest log | `src/story/{script,flags,quests}.js` |
| P27 | Music: the score on real recorded multisampled instruments, all CANON §9 themes, seamless loops | `src/audio/{music,instruments,sampler}.js`, `src/audio/score/*`, `vendor/samples/*` |
| P28 | SFX: full library, mixer, footstep materials, ambience beds, glyph voices | `src/audio/{sfx,audio}.js` |
| P29 | Transitions & screen FX: wipes, battle swirl, fades, flash, vignette, the boot fade-in | `src/ui/transitions.js` |
| P30 | Discovery: chests, searchables, hidden paths, secrets, treasure ceremony — and every map's treasure layer | `src/world/treasure.js`, `src/world/maps/*.chests.js` |
| P31 | Encounters: rate, ambush, escape, terrain tables, boss triggers | `src/world/encounter.js` |
| P32 | Field HUD + minimap + place cards + "where do I go" clarity | `src/ui/hud.js` |
| P33 | Accessibility & kid-mode: text size, colourblind-safe, no dead ends, hints | `src/ui/access.js` |
| P34 | Performance: instancing, culling, quality tiers, memory | `src/engine/perf.js` |

## Shared files — integrator only
`index.html`, `src/main.js`, `src/world/field.js`, `src/world/map.js`, `src/world/scenery.js`,
`src/world/placeholder-hero.js`, `src/data/strings.js`, `docs/*`, `tools/*`, `demos/_TEMPLATE.html`.

What they are now (request changes via `NEEDS:` like any shared file):
- `src/main.js` — boots the engine, audio, maps and hero, builds the plugin context, installs every plugin, boots
  `ctx.boot` (the field, `{map: 'meadow'}`, until P01's title takes over). `?hero=placeholder` boots the stand-in hero.
- `src/world/field.js` — the `field` scene: loads a map, owns one camera rig (P09) and one player (P10), talks to the
  thing you face, the Menu button, time of day, Save `map` + `pos`, `__DQ` field hooks. Plugins reach it through
  `Field.on / world / talk / setTransition / teleport`.
- `src/world/map.js` — the map format, registry, layer merge (`Maps.loadAll`, `Maps.addLayer`), collision, queries.
- `src/world/scenery.js` — a thin composer: `createKit()` = P04's kit core + P03/P05/P02 recipes, and a re-export of
  every recipe so older imports keep working.
- `src/world/placeholder-hero.js` — the stand-in Bram (model + procedural idle/walk/run/nod). Only a fallback now:
  `player.js heroModel()` builds the real one with `Chars.build('hero', {age: 'boy'})` and falls back to this if
  `src/art/chars.js` is missing or throws.
- `src/world/maps/meadow.js` (+ `meadow.npcs.js`, `meadow.chests.js`) — Puddlewick Vale, the opening meadow. The base
  file is P23's, its lines/people layer P11's, its treasure layer P30's (keep `layout()` data separate from `view()` art).
