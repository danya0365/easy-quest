# The Pieces — file ownership map
Each piece is small enough to build, run and judge on its own. **Edit only the files listed as yours.**
If you need a change in someone else's file, put it under `NEEDS:` in your report instead. Files you create
inside a directory you own are yours. `docs/progress.json` is written only via `tools/progress.mjs`.

## Foundation (built first, everything depends on it)
| id | piece | owns |
|----|-------|------|
| F1 | Engine core: loop, app, states, events, rng, debug API | `src/engine/{app,loop,states,events,rng,debug,assets}.js` |
| F2 | Input: keyboard, gamepad, touch, virtual buttons | `src/engine/input.js` |
| F3 | Art foundation: palette, toon materials, outlines, canvas textures | `src/art/{palette,toon,tex}.js` |
| F4 | UI shell: DQ window widget, bitmap-ish font, text engine, css | `src/ui/{window,text,ui.css,font.js}` |
| F5 | Save/load + slots + title continue | `src/engine/save.js` |

## Pieces
| id | piece | owns |
|----|-------|------|
| P01 | Title screen & intro (logo, sky, music, New/Continue) | `src/ui/title.js` |
| P02 | Sky, sun/moon, clouds, day-night, weather | `src/art/sky.js`, `src/art/weather.js` |
| P03 | Terrain: heightfield, grass, paths, water, cliffs, LOD | `src/art/terrain.js` |
| P04 | Props & set dressing: trees, rocks, flowers, fences, signs, wells, lamps | `src/art/props.js` |
| P05 | Buildings: houses, inn, church, shop, castle exteriors | `src/art/buildings.js` |
| P06 | Interiors: furniture, beds, pots, barrels, shelves, rugs, fireplaces | `src/art/interior.js` |
| P07 | Character models: hero(boy/man), Pankraz, Bianca, Nera, Sancho, villagers | `src/art/chars.js` |
| P08 | Character animation rig: idle, walk, run, talk, attack, celebrate, sit | `src/art/anim.js` |
| P09 | Camera: spring follow, orbit, framing, cutscene camera, collision | `src/world/camera.js` |
| P10 | Player: movement feel, collision, interaction ray, footsteps | `src/world/player.js` |
| P11 | NPC life: wander, schedules, facing, animals, crowd chatter | `src/world/npc.js` |
| P12 | Dialogue: box, typewriter, choices, portraits, voice/wit | `src/ui/dialogue.js` |
| P13 | Menus: main, items, equip, spells, status, party, misc, settings | `src/ui/menu.js` |
| P14 | Battle core: turn order, targeting, action resolution, flow | `src/battle/{battle,actions,ai}.js` |
| P15 | Battle presentation: backdrop, camera, hits, damage pops, shake, victory | `src/battle/present.js` |
| P16 | Monster roster & models (slimes, drackies, healslimes, bosses) | `src/art/monsters.js`, `src/data/monsters.js` |
| P17 | Monster recruitment: the join moment, naming, roster, wagon | `src/battle/recruit.js`, `src/world/companions.js` |
| P18 | Party & wagon: order, swap in battle, followers trailing you | `src/world/party.js` |
| P19 | Stats, growth curves, EXP, level-up ceremony | `src/data/growth.js`, `src/battle/formulas.js` |
| P20 | Spells & abilities + spell VFX | `src/data/spells.js`, `src/art/fx.js` |
| P21 | Items, equipment, inventory, bag | `src/data/items.js` |
| P22 | Shops, inns, churches, banks, economy balance | `src/ui/shop.js`, `src/data/shops.js` |
| P23 | World maps: Whealbrook, Roundbeck, Gotha, overworld, Uptaten Towers, caves | `src/world/maps/*.js` |
| P24 | Story ch.1 — childhood: Pankraz, Bianca, the ghost tower, the kitten | `src/story/chapters/ch1*.js` |
| P25 | Story ch.2-3 — adulthood, the bride choice, becoming a father | `src/story/chapters/ch2*.js`, `ch3*.js` |
| P26 | Cutscene scripting DSL + story flags + quest log | `src/story/{script,flags,quests}.js` |
| P27 | Music: procedural symphonic score, all themes, seamless loops | `src/audio/music.js` |
| P28 | SFX: full library, mixer, footstep materials | `src/audio/{sfx,audio}.js` |
| P29 | Transitions & screen FX: wipes, battle swirl, fades, flash, vignette | `src/ui/transitions.js` |
| P30 | Discovery: chests, searchables, hidden paths, secrets, treasure ceremony | `src/world/treasure.js` |
| P31 | Encounters: rate, ambush, escape, terrain tables, boss triggers | `src/world/encounter.js` |
| P32 | Field HUD + minimap + signposts + "where do I go" clarity | `src/ui/hud.js` |
| P33 | Accessibility & kid-mode: text size, colourblind-safe, no dead ends, hints | `src/ui/access.js` |
| P34 | Performance: instancing, culling, quality tiers, memory | `src/engine/perf.js` |

## Shared files — integrator only
`index.html`, `src/main.js`, `src/world/field.js`, `src/world/map.js`, `src/data/strings.js`,
`docs/*`, `tools/*`.

Added by the integrator for the first vertical slice (request changes via `NEEDS:` like any shared file):
- `src/world/scenery.js` — the scenery kit hand-built maps use (sky dome, hill rings, painted ground, cottages, trees
  with chunked LOD, fences, rocks, water, signposts, smoke, butterflies, birds, instanced critters). P02/P03/P04/P05
  replace pieces of it with their own modules; keep its function signatures working while they do.
- `src/world/placeholder-hero.js` — the stand-in Bram (model + procedural idle/walk/run/nod). P07/P08 replace it; the
  field calls only `buildPlaceholderHero() -> {group, animate(dt, t, {speed, run, onStep}), nod(), state()}`.
- `src/world/maps/meadow.js` — Puddlewick Vale, the opening meadow. Authored by the integrator inside P23's
  directory; P23 owns it from here (keep `layout()` data and `view()` art separate).
Everyone else requests changes to these via `NEEDS:` in their report.
