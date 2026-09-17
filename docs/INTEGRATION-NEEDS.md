# Integration needs & known gaps — Foundation wave (2026-09-17)
Every request the foundation authors could not do themselves because the file was not theirs, plus their honest known gaps.
The smoothing agent works through ALL of these.

## Canon keeper (self-score 80)
### Needs
- Integrator: update docs/PIECES.md piece descriptions to canon names (P07: Bram, Halvard, Willow, Sera, Barty; P23: Puddlewick, Saltmarrow, Coddleston, overworld, Cobwell Manor, caves; P24: Halvard, Willow, Cobwell Manor, Pip).
- Integrator: in ARCHITECTURE.md, change the map music enum to the CANON §9 ids (keep 'sad' as an alias) and the example map id from 'whealbrook' to 'puddlewick'.
- F3: add M_SUNSPOT #E8A04A (Pip) along with the other MONSTER §9 palette tokens.
- P16/P17/P23/P24–P27: treat docs/CANON.md as the naming authority and copy flag names exactly from CANON §4.
### Known gaps
- docs/PIECES.md and docs/ARCHITECTURE.md are owned by the integrator, so I did not edit them. They still use placeholder names (Pankraz, Bianca, Nera, Sancho, Whealbrook, Roundbeck, Uptaten Towers, Gotha) and the map-format example id `whealbrook`. ARCHITECTURE's music list still says `sad`, which works only because MUSIC and CANON now treat it as an alias of `family`.
- The new story creatures in MONSTER §6b (Quietling, Mumbleroot, the Sunmane, the Tidewarden, Hoarfax, Hush & Hark) have shorter build notes than the original 38 monsters. The Sunlark, Clover the Featherhorse and the Stone Garden statues have no build specs at all.
- The wedding, finale and quiet_hand music cues are described as changes to existing melodies, not written out note by note. Only the lullaby and befriend have literal note arrays.
- The four new WORLD locations (Ambergarde, the Grey Ruins with the Stone Garden, the Sighing Grotto, the Whistling Caves) have fewer NPCs and less room detail than the original entries. The Sighing Grotto and Highfeather have no room-by-room plans.
- In SYSTEMS I renamed the ten money stages for canon places in story order but did not re-tune the gold numbers. Queen Elowen's growth has only two anchor levels. Willow and Sera as children in Cobwell Manor just use their Lv 3 row.
- I kept STORY's structure where the wife is stone from B19 until after the final boss. She is a full party member only for B17–B19 and the epilogue, unlike Dragon Quest V, where she fights in the finale. The choice's lasting effect in play is the mother's spell gift to the twins.
- Dragon Quest V's fairy realm and time-travel moments are cut on purpose for scope; this is noted in CANON §12.
- VOICE's 30 background NPC lines are not yet assigned to specific towns, and the empty-container lines are split between WORLD §5 and VOICE §3, which don't cross-reference each other.
- No code exists yet that uses these names (src/data/strings.js, monsters.js, spells.js and the map files are all still unwritten).

## Art director (self-score 72)
### Needs
- F3 (palette, toon, textures): port the palette, toon material, outline and canvas texture recipes from docs/ART-DIRECTION.md sections 5-9.
- P03 terrain: use the mask-based ground shader, height function and baked contact shadows (section 10).
- P02 sky: use the sky dome, cloud atlas and three hill layers (section 11).
- P04 props: use the tree, bush, forest-belt, tuft and flower recipes (section 12).
- P05 buildings: use the house, roof and per-material merging recipes (section 13).
- P34 performance: add a low quality tier (1024 shadow map, pixel ratio 1, 800 tufts, no tree outlines) and near/far splitting for foliage.
### Known gaps
- Trees and bushes show faceted polygons within about 4 units of the camera; the gameplay camera never gets that close.
- No motion: no wind sway on trees or grass, no chimney smoke or butterflies.
- The hero is a placeholder; only its material and outline settings are meant to carry over.
- Triangles are at 89% of the 150k limit, so adding NPCs needs the cuts listed in the doc (fewer oaks, lighter terrain, a low quality tier).
- Performance measured on Apple Metal in headless Chromium, not on integrated Intel or AMD graphics.
- Midday only; dusk and night need colour changes that keep the lit-to-shade ratio.
- Clouds lean toward stylized round puffs rather than painterly brushwork; they drift but do not change shape.
- Shadows cover only 60x60 units around the camera target; farther trees rely on the baked contact shadows.

## F1 engine spine (self-score 80)
### Needs
- Integrator (docs/ARCHITECTURE.md): please document the F1 extension points so every piece uses them: Debug.implement(name, fn) replaces a __DQ stub, Debug.provide(key, fn) extends __DQ.state(), Debug.expose(name, fn) adds demo controls, Debug.busy(token, on) holds screenshotReady() false, reportError(where, err) is the only way to log caught errors, and App.start({beforeUpdate, update, render}) is the boot one-liner. Also document these semantics: update(dt) gets dt = 1/60 s; Scenes.top() returns a name; scene flags are opaque and updateBelow; onInput returning false passes the button down; rng.int(min, max) includes both ends.
- Integrator (demos/_TEMPLATE.html): tell pieces to boot with App.start() and add controls with Debug.expose() instead of assigning window.__DQ themselves. If a demo overwrites window.__DQ after App.start, it loses the whole contract.
- F2 (input.js): register Debug.implement('press'|'hold'|'release', ...) using Input.inject. main.js should then poll Input in App.start({beforeUpdate}) and call Scenes.input(btn) for each newly pressed button.
- F3 (palette.js/toon.js): once PAL exists, main.js's placeholder PAL block gets deleted and the placeholder field switches to dqToon.
- P09 camera, P23 maps, P26 flags, P02 sky, P13/P18 party, P21 items, P29 transitions: each should replace its stub with Debug.implement (cameraOrbit/cameraZoom, teleport/listMaps, flag, timeOfDay, party/setLevel/heal, give/gold, screenshotReady) and fill its own state() key with Debug.provide (map, player, party, gold, flags, dialogue, battle). state().stubs shows what is still missing.
- Any scene that renders an overlay THREE.Scene must leave scene.background null: in three r180 a Color background clears the screen, which would wipe the scenes below.
### Known gaps
- main.js hardcodes a placeholder copy of the ART-DIRECTION §7 hex colours because src/art/palette.js (F3) does not exist yet. It should import PAL once F3 lands (rule: never hardcode a hex outside palette.js). demos/F1.html also has demo-only hex colours.
- The placeholder field uses plain MeshToonMaterial (2 bands), not the 3-band dqToon from ART-DIRECTION §5. That shader belongs to F3; the field is only there to prove the engine.
- No keyboard input reaches scenes yet: input.js (F2) does not exist. Until then __DQ.press/hold fall back to sending the button straight to the top scene (Scenes.input), and they are listed as stubs.
- Quality auto-detection has only been checked on Apple M2 Max under headless ANGLE/Metal (it picked 'high'). The Intel/Adreno/SwiftShader branches are untested heuristics.
- __DQ.hold's fallback releases the button with setTimeout (wall-clock, not sim time). That is fine as a stub, but F2's real version should release on sim ticks.
- Loop runs at most 8 fixed steps per frame, so timeScale above about 8 at 60 Hz rAF drops time (counted in Loop.droppedMs) instead of catching up.
- WebGL context loss is caught and reported, and rendering stops safely, but nothing is rebuilt when the context comes back (only the app.contextrestored event fires).

## F2 input (self-score 80)
### Needs
- main.js (integrator): import { Input } from './engine/input.js'; call Input.init(); then App.start({ canvas, version, beforeUpdate: Input.update }), so __DQ.press/hold/release and scene onInput run through real input every tick.
- F4 ui.css: define --dq-win-top, --dq-win-bot, --dq-win-hi, --dq-win-edge, --dq-win-line, --dq-ink, --dq-gold and --dq-font so the touch pad matches the real DQ windows. Otherwise F3 or the integrator calls Input.setSkin({...}) with PAL values.
- P12/P13/P22 (dialogue, menus, shops): move cursors with Input.repeat(dir), or with onInput, which also receives repeats; Input.current().repeat tells them apart. Use pressed('confirm') and pressed('cancel') for choices.
- P10 player: Input.axis() is {x: right+, y: forward+} with |v| <= 1, and analog on stick and touch. Run is Input.down('run'), which Shift, the X button, L2/R2 and pushing the touch stick past its rim all set.
- P09 camera: Input.look() for orbit (right stick, L1/R1, Q/E).
- P29 transitions and battle intro: wrap wipes in Input.block('transition', true) and Input.block('transition', false). Held buttons then wait for a fresh press.
- P33 accessibility: expose Input.setRepeat({delay, interval}), Input.bind(btn, codes) and Input.setTouchMode('auto'|'on'|'off') in settings.
### Known gaps
- No physical gamepad was tested. A virtual pad drives the same polling, dead-zone and hysteresis code, but only the standard mapping is handled; non-standard pads fall back to the same button indices.
- Real iOS Safari and Android devices were not tested, only headless Chromium mobile emulation with CDP touch events. Haptics (navigator.vibrate) only works on Android Chrome.
- Touch pad colours are placeholder hex in input.js SKIN (the F1/P28 DQ window values) until F3/F4 land. They already defer to --dq-win-top/--dq-win-bot/--dq-win-hi/--dq-win-edge/--dq-win-line/--dq-ink/--dq-gold/--dq-font if ui.css defines them, and Input.setSkin() can override them.
- Touch has no Map button and no separate Run button; on touch, run means pushing the stick past its rim.
- The frame-fallback driver polls once per frame, not once per tick, so edge timing is approximate until main.js passes beforeUpdate: Input.update.
- Touch buttons make no sound themselves; the confirm/cancel blips belong to the menus (P13/P28).
- demos/F2.html uses demo-only hex colours in its own CSS, as the F1 and P28 demos do.

## F3 art foundation (self-score 74)
### Needs
- Integrator (src/main.js): delete the placeholder PAL block and import { PAL, C3 } from './art/palette.js'; call applyCssVars() once at boot.
- F4 (src/ui/ui.css): use the published CSS variables (var(--pal-ui-win-top), --pal-ui-win-bottom, --pal-ui-border, --pal-ui-border-shade, --pal-ui-text, --pal-ui-cursor) instead of hex colours. ui.css currently hardcodes #000 for the background.
- All art pieces (P02–P07, P16, P20): materials from makeToon(opts, 'presetName') or Toon.surface('stone', {vertexColors:true}); surfaces from Tex.*(); colours only from PAL; outlines via withOutline / outlineInstanced (pass the same wind values as the leaf material); call Toon.tick(App.clock.time) once per frame when anything sways.
- P03 terrain / P09 camera / field scene: build the scene light with makeLightRig({scene, preset:'day'}) and call rig.follow(player or camera target) every frame; use rig.blend() for time of day. Paint static contact shadows with makeAOMask().disc/box and add Toon.aoPatch(mask) to the ground material; use makeBlobShadows() for hero, NPCs and monsters.
- P02 sky: day/dusk/night sky colours are PAL.sky / PAL.dusk / PAL.night, and Tex.clouds() is the 2×2 cloud atlas. The sky dome shader and hill rings in demos/F3.html are a working reference.
- P34 performance: when quality is 'low', pass shadowMapSize 1024 to makeLightRig, call Toon.setOutlines(false) for foliage (or skip outlineInstanced), and reduce tuft counts.
- Art director: review the canopy preset change (shots/F3-tree-a vs shots/F3-tree-f) and update ART-DIRECTION.md §5 if you accept it.
### Known gaps
- The dusk, night, interior and cave light presets were only checked by eye at dusk and night in the demo; interior and cave haven't been seen in a real interior or dungeon. Only the day preset is the art director's tuned rig.
- The canopy preset now differs from ART-DIRECTION §5 (soft 0.10, mid 0.80, midEdge 0.22 instead of 0.06/0.74/0.38) to remove a straight light stripe under side or back light. The doc values are kept as TOON_PRESETS.canopyTuned. The art director should confirm, and the doc may need regenerating.
- Tex.grass() and Tex.dirt() are baked tiles. Large terrain should still use the mask-driven ground shader (P03), or Toon.worldPlanar() with its tint option. A plain repeat of Tex.grass() shows its tile at distance.
- Wind sway is vertex-only: shadow maps and tree shadow proxies don't sway, so shadows stay still under swaying leaves and cloth.
- Tex.water() is one shared texture, so scrolling its offset moves every body of water together; clone it for independent flow. The pond's painted ripples still look a little like squiggles, as in the prototype.
- The low quality tier (1024 shadow map, no tree outlines, fewer tufts) isn't applied automatically; the rig only reads App.tier.shadowMapSize. Performance was measured on Apple Metal, not integrated Intel/AMD.
- The demo's set dressing (cottage, shed, trees, sky dome, hill rings, Gloop) is demo-local code ported from the prototype, not a reusable module. Those belong to P02/P04/P05/P07/P16.
- Sign text is drawn with the system rounded font on canvas, so it may look different on machines without ui-rounded.

## F4 UI shell (self-score 78)
### Needs
- Integrator (src/main.js): boot with `App.start({ beforeUpdate: Input.update })` plus `Input.init()`. Every scene that owns windows (P12 dialogue, P13 menu, P22 shop, battle) must pass buttons on with `onInput(btn) { if (UI.input(btn)) return; ... }`. Once F2 is running, UI only receives input through the scene stack.
- P12 / P13 / P22 / P15: build on `MessageBox.say(markup, {voice})`, `UI.menu({...}).choose()`, `UI.yesNo()` and `UI.window({content})`. Voice ids are the CANON char ids that Sfx.glyph knows. Use `{p}` for hand-placed page breaks and `%HERO%` tokens with `opts.vars`.
- F3 (palette.js): please add `ui.winMid`, `ui.titleInk`, `ui.label` and inline-text colours (`ui.purple`, `ui.grey`, `ui.orange`) so ui.css can read them directly instead of mixing. Also decide whether `ui.cursor` should really be yellow, since the Dragon Quest cursor is white.
- P28 (sfx.js): optional `window_open` and `window_close` sounds. window.js would play them through `UI.sound('open'|'close')` in `defaultSound` once they exist.
- P33 (kid mode): `UI.setScale(n)` and `Text.setSpeed(gps)` are the settings to hook up for 'bigger words' and 'How fast should the words come?'.
### Known gaps
- Only exercised in headless Chromium on macOS, where Arial Rounded MT Bold exists. Windows machines without Office and Linux fall back to Trebuchet or Verdana and have not been looked at.
- Mouse is only lightly handled: hovering selects a menu entry and clicking confirms. Nothing was tested together with F2's touch overlay, which listens for pointerdown on the whole window.
- Automatic page cutting is a safety net only. It does not apply VOICE-BIBLE's rule against ending a page on a weak word like 'the' or 'a'; writers still need to place {p} by hand.
- The window-open animation is 150 ms, so the cascade screenshot catches the windows almost fully open. The 'opening' state is proven by an assertion rather than shown clearly.
- `--dq-title-ink`, `--dq-purple`, `--dq-grey` and `--dq-orange` are approximated by mixing existing palette colours (cloth cream + ui gold, cloth purple, ui textDim, flower centre); the palette has no ui entries for them.
- The cursor is white, following Dragon Quest, instead of PAL.ui.cursor (a pale yellow).
- The demo backdrop is a flat painted 2D picture, not a 3D scene.
- No window-close sound: Sfx has none, so closing relies on the cancel/confirm sounds only.

## F5 save (self-score 74)
### Needs
- main.js / integrator: call `Save.init()` at boot and `Save.enableAutosave({events:['map.enter']})` once; call `Save.newGame()` on 'A New Tale', `Save.load(slot)` on 'Carry On', and `Save.endGame()` when returning to the title.
- P01 title.js: use `Save.continueInfo()` / `Save.latest()` for Carry On and `Save.slots()` for the slot list (hero, level, act, placeName, playtimeText, party, status, words, loadable).
- P26 flags, P18 party, P21 items, P22 gold/bank, P10/P23 map and pos: each call `Save.register('<contract key>', {save, load, reset})` in their own module. Party members should look like `{id:'hero', name, lvl}` so summaries work, or supply a `summary()`.
- P22 church: `Save.write(slot)` shows `Save.words.done`, or `.full` / `.blocked` when `ok` is false; use `Save.words.over` for the overwrite yes/no prompt.
- P13 settings: offer 'Copy the code' / 'Paste a code' through `Save.copyCode(slot)` / `Save.importCode(slot, text)` as the escape hatch.
- Integrator: consider moving `Save.words` and `PLACE_NAMES` into src/data/strings.js, keeping them available on the Save object.
- F4 window.js: expose a documented factory, e.g. `createWindow({title}) -> {el}`, so demos can use the shared window widget.
### Known gaps
- The demo uses its own windows: src/ui/window.js had not landed, and its API is unknown, so the adapter only guesses at a few factory names.
- The demo hardcodes hex colours copied from ART-DIRECTION §7 (as F1's demo does); they should come from src/art/palette.js once F3 exists.
- Keyboard input is a demo-local key listener, not F2's input module (not built yet); `__DQ.press` still works through Scenes.input.
- The in-voice strings and the CANON place-name table live in save.js (`Save.words`, `PLACE_NAMES`); they probably belong in src/data/strings.js.
- Status words on the slot badges are short, but a critic may still find 'Read from the second copy. All there.' too technical for a six-year-old.
- Handling a second open tab is limited to a `save.external` event; two tabs writing the same slot are not coordinated beyond last-write-wins with the spare kept.
- The Chromium clipboard write usually falls back to 'manual' in headless runs; the code panel then shows the code for copying by hand, and a real clipboard copy is untested.
- Playtime counts while `__DQ.freeze` is on (only hidden tabs and gaps over 1 s are excluded).

## Vertical-slice integrator (self-score 72)
### Needs
- P07/P08: replace src/world/placeholder-hero.js with the real hero model and animation rig, keeping the interface field.js calls: {group, animate(dt, t, {speed, run, onStep}), nod(), state()}.
- P09: take over the CAMERA block in src/world/field.js (spring follow, orbit, ease-behind, map.cameraClearance() occluder pull-in); map defs publish `occluders`.
- P10: take over the PLAYER block in field.js; map.move(x, z, dx, dz) already gives circle collision, wall sliding and corner assist.
- P11: put NPCs in the meadow through map.npcs (someone at the cottage, a child chasing butterflies); nearestInteractable already handles npcs with a script.
- P12: build src/ui/dialogue.js to replace the 'dialogue' scene in main.js. Same context shape {text|pages, voice, speaker, onClose}; keep updateBelow so the field camera stays alive; add portraits and choices.
- P23: take ownership of src/world/maps/meadow.js (keep layout() data separate from view() art). Build puddlewick.js and point the meadow's village-lane exit at it (to:'puddlewick', tx, tz) instead of the sheep-jam text.
- P01: a title scene calling Save.newGame() / Save.load(); main.js then pushes 'title' instead of 'field' and stops calling newGame at boot.
- P02/P03/P04/P05: replace the recipes in src/world/scenery.js (buildSky/ringHill, paintMasks/buildGround, rock/fence/signpost, cottage) with your own modules, keeping their signatures working while you do.
- P27: keep the VOICES table in instruments.js consistent while editing; the slice plays 'village' on boot, and a missing voice lands in __DQ.errors and fails the slice's no-errors check.
- F2: add a touch camera-orbit control (a two-finger drag or small edge buttons feeding Input.look()).
- P29: a fade and Debug.busy around Field.teleport/loadMap, and a boot fade-in over the ~1 s first build.
- P32: a place card on map.enter ('Puddlewick Vale') and a first quest ribbon ('Follow the lane to the village').
- P34: check the low tier on integrated GPUs; consider chunked tufts and flowers and a far LOD for the rim forest belt.
### Known gaps
- Bram is a placeholder model with procedural animation (P07/P08). The meadow has animals but no people yet (P11).
- Neither Puddlewick nor Saltmarrow exists yet, so all three lanes end in gentle in-voice blocks (the sheep in the lane, 'a grown-up sort of walk', 'the Long Lane goes on for ever').
- There is no title screen: main.js calls Save.newGame() on boot, and every boot autosaves to the 'auto' slot on map.enter.
- The dialogue scene in main.js is a thin P12 stand-in: typing, page turns, the ▼ caret and a __DQ.state().dialogue report, but no portraits, choices or speaker nameplate.
- Touch controls have no way to orbit the camera: Input.look() has no touch source.
- Camera occlusion only checks tree canopies and cottages (approximated as spheres). Bushes, signposts and fences can still sit in front of the lens for a moment.
- 'Morning' comes from the sky, clouds and smoke. The light is the tuned F3 'day' preset, not a lower, warmer sun.
- The first frame appears about 1 s after load (map build ~0.5 s plus texture recipes) with no loading fade (P29).
- The opening view uses about 130–145k triangles across all passes against a 150k budget. It was measured only on an Apple M2; the low tier (no foliage outlines, fewer tufts, 1024 shadow map) is untested on Intel or AMD integrated graphics.
- Deferred cosmetic requests: extra F3 palette entries for F4 (ui.winMid, titleInk, label and text colours), an F4 createWindow alias (UI.window already exists), and moving Save.words / PLACE_NAMES into src/data/strings.js.
- Not caused by this work: the P28 demo fails its own audio-level checks (sword_crit too hot, hits not 6 dB over the battle theme), which had already failed in two earlier P28 runs. One slice run also logged '[music] village/strings: no voice strings' while the P27 agent was mid-edit of instruments.js. It cleared once that file was saved again, and the final run is error-free.

## Final blind-critic gaps on the slice (round 2: look 74, feel 72)
- Puddlewick Vale is fenced in by a thick ring of about 100 copies of the same low-poly oak. Turn the camera any way but north, or walk to any edge, and the screen fills with a wall of canopy: faceted blobs, dark trunks, dither ghosts, hard-edged polygon shadows. You can't see out. The fix: cut the edge ring down to 2-3 staggered rows of mixed tree clumps at different sizes, and past them raise the ground into 2-3 rolling hill layers that fade into haze, like the approved field-opening frame and F3's own sampler. Then every view out shows hills, sky and distance, and the valley reads as part of a bigger world instead of a boxed-in diorama. (The ledger note is a shorter version of this.)
- Rebuild the camera see-through (the seeThrough fading). Right now, any tree or cottage near the camera is drawn as a screen-door checkerboard: a grid of dots you can see across 20–50% of the frame. It even does this to objects that are not in front of the hero (the tree in front of the cottage at x=-15, the trees to the left of and ahead of the hero while walking right). Change it to a clean alpha fade: draw the object's depth first, then render it semi-transparent at about 35–45% with its ink outline kept, and fade it in and out over about 150ms. Only apply it to meshes that actually cover the hero's area on screen. Nearby trees that don't block the hero should stay fully solid.
