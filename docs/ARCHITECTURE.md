# Dragon Quest V (browser) — Architecture Contract
**This file is law. Every agent reads it before touching code. Do not change it without being told to.**

## Hard rules
1. **No build step.** Plain ES modules + the import map in `index.html`. `import * as THREE from 'three'` and
   `import {X} from 'three/addons/...'` both work. Never add bundlers, TypeScript, JSX, or npm runtime deps.
2. **No external network at runtime.** No CDNs, no runtime downloads from other hosts. Art is **procedural**:
   geometry built in code, textures drawn to `<canvas>`, fonts = CSS system stack or a canvas-drawn bitmap font.
   **Exception — music instruments (owner decision 2026-09-17: "use real recorded instruments, like PS2"):**
   the score plays through **real recorded, multisampled instruments** vendored locally under
   `vendor/samples/<library>/` — see "Sampled instruments" below. SFX stay synthesised (they may reuse the
   vendored instrument samples, e.g. a harp gliss or a bell). The game must still run offline from static hosting.
3. **Never throw inside the frame loop.** Wrap risky work; push failures to `__DQ.errors` and keep rendering.
   A black screen is the single worst failure mode in this project.
4. **60 fps at 1280x720 on integrated graphics.** Budget: < 400 draw calls, < 150k triangles on screen.
   Share materials/geometry, use `InstancedMesh` for foliage/crowds.
5. **File ownership.** You may only edit files listed as yours in `docs/PIECES.md`, plus files you create inside
   your own directory. To change a shared file, you must instead ask for it in your report. This is what makes
   parallel work safe.
6. **Every module is side-effect-light**: export a factory/class; do not run work at import time except
   registering data.
7. `console.error` and unhandled rejections are **build failures** — the harness fails the run on them.
8. **Kid-playable** (ages ~6-12): readable text, forgiving difficulty, no unwinnable states, no reading-heavy
   walls, no gore. Warm, gentle, funny.

## Directory map
```
index.html            boot + import map                       (owner: integrator only)
src/main.js           bootstrap: engine, audio, maps, hero, plugin installs, boot   (owner: integrator only)
src/engine/           loop, app, input, states, events, save, rng, debug, assets
src/art/              palette, toon, tex (F3) · sky, terrain, props, buildings (scenery recipes) · chars, anim ·
                      monsters · interior, fx, weather  (procedural art factories)
src/world/            field, map, scenery (integrator) · camera, player, npc, encounter, treasure, party ·
                      maps/index.js, maps/<id>.js, maps/<id>.npcs.js, maps/<id>.chests.js
src/battle/           battle, actions, ai, formulas (rules) · scene (the 'battle' scene) · present · recruit
src/ui/               ui.css, window, text, font (F4) · dialogue, menu, hud, transitions, title, shop, access
src/data/             items, monsters, spells, growth, shops, strings
src/audio/            audio, sfx (P28) · music, instruments, sampler, score/* (P27)
src/story/            flags, script, quests, chapters/*.js
docs/                 contracts + rubric + progress
tools/                server.mjs, shoot.mjs, audio-probe.mjs, progress.mjs  (owner: orchestrator only)
scenarios/            *.json inspection scripts (anyone may ADD; never edit another's)
```
Who owns which file: `docs/PIECES.md`.

## Core contracts

### `src/engine/app.js`
```js
export const App = {
  renderer, scene, camera, clock,
  width, height, dpr, quality,        // quality: 'low'|'med'|'high', auto-detected
  init(canvas), resize(), render(),
  layers: { world, fx, ui3d },
}
```

### `src/engine/loop.js`
Fixed-timestep simulation at 60 Hz with render interpolation.
`Loop.start(update, render)`, `Loop.stop()`, `Loop.setTimeScale(n)`, `Loop.step(ms)` (deterministic, for tests).

### `src/engine/app.js` boot one-liner
`App.start({canvas?, version?, beforeUpdate?(dt, tick), update?(dt, tick), render?(alpha)})` = Debug.install +
App.init + the fixed-step loop over the scene stack. `beforeUpdate` runs each tick BEFORE the scenes (main.js passes
`Input.update`); every hook is individually guarded. Every demo boots with it too (`demos/_TEMPLATE.html`).

### `src/engine/states.js` — scene stack
```js
Scenes.register(name, {enter(ctx), exit(), pause(), resume(), update(dt), render(alpha), onInput(btn), opaque, updateBelow})
Scenes.register(name, () => ({...}))            // a factory: a fresh instance per push
Scenes.push(name, ctx) / Scenes.pop() / Scenes.replace(name, ctx) / Scenes.reset(name, ctx) / Scenes.top() -> name|null
```
Scene names in use: `title`, `field`, `battle`, `menu`, `dialogue`, `shop`, `cutscene`, `gameover`.
Pushed scenes render **over** the ones below (field keeps rendering under a menu). Semantics: `update(dt)` gets
`dt = 1/60` s; `Scenes.top()` returns a NAME; `opaque: true` stops the scenes below from rendering; `updateBelow: true`
keeps the scene below updating; `onInput(btn)` returning `false` passes the button down to the scene below. A scene
that renders its own overlay `THREE.Scene` must leave `scene.background` null (three r180 clears the screen otherwise).
`rng.int(min, max)` includes BOTH ends.

### `src/engine/input.js` — virtual buttons only
Buttons: `up down left right confirm cancel menu run map`.
Keyboard: arrows/WASD, `Enter`/`Space`/`Z` = confirm, `Escape`/`X`/`Backspace` = cancel, `Shift` = run,
`Tab`/`C` = menu. Gamepad d-pad+A/B. Touch: on-screen stick + buttons (auto-shown on coarse pointers).
```js
Input.down(btn) / Input.pressed(btn) / Input.released(btn) / Input.axis() -> {x,y}
Input.inject(btn, ms)          // used by the debug API and the test harness
```

### `src/engine/events.js`
`Bus.on(evt, fn)`, `Bus.off`, `Bus.emit(evt, payload)`. Events are lowercase dotted: `battle.start`,
`party.join`, `flag.set`, `dialogue.end`, `map.enter`.

### `src/engine/debug.js` — **`window.__DQ`. Critics depend on this. Keep it working.**
```js
window.__DQ = {
  ready: bool,                       // true once the first frame has drawn
  version: string,
  state(): {scene, sceneStack, map, player:{x,y,z,facing}, party:[{name,hp,mhp,mp,lvl}],
            gold, flags:{}, fps, errors:number, dialogue:{open,text}|null,
            battle:{turn,enemies:[],phase}|null},
  errors: string[],                  // every caught runtime error, newest last
  goto(sceneName, opts?),            // jump straight to a scene
  teleport(mapId, x?, z?),           // load a map and place the player
  battle(monsterIds[]),              // force an encounter
  press(btn, ms?),                   // inject a virtual button
  hold(btn, ms), release(btn),
  give(itemId, n?), gold(n), setLevel(n), heal(),
  flag(name, value?),                // get or set a story flag
  party(add?: charId),
  timeOfDay(hours?),                 // 0..24, get or set
  advance(ms),                       // step the simulation deterministically
  freeze(bool),                      // pause sim but keep rendering (for clean screenshots)
  cameraOrbit(deg), cameraZoom(n),
  screenshotReady(): boolean,        // false while a transition/fade is mid-flight
  listMaps(): string[], listScenes(): string[],
}
```
Every new subsystem **must** extend `state()` with its own readable summary. A critic who cannot observe your
system will judge it broken.

**The extension points (use these; never assign `window.__DQ` yourself — a page that overwrites it after
`App.start` loses the whole contract):**
```js
import { Debug, reportError } from '../engine/debug.js';
reportError(where, err)        // the ONLY way to log a caught error: pushes to __DQ.errors (console.warn, never .error)
Debug.implement(name, fn)      // replace a contract stub: goto teleport battle press hold release give gold setLevel heal
                               //   flag party timeOfDay cameraOrbit cameraZoom screenshotReady listMaps
Debug.provide(key, fn)         // extend state(): state()[key] = fn()  (contract keys: map player party gold flags
                               //   dialogue battle; anything else is yours, e.g. 'audio', 'boot', 'menu', 'hud')
Debug.expose(name, fn)         // an extra control for critics/demos: __DQ.<name>(...)  (cannot shadow the contract)
Debug.busy(token, on)          // hold screenshotReady() false while a transition / load / fade is mid-flight
```
`__DQ.state().stubs` lists every contract accessor and state key that is still a stand-in.

### `src/world/map.js` — map data format
Maps are authored one-per-file in `src/world/maps/<id>.js` (ids from CANON §2), listed in `src/world/maps/index.js`,
default-exporting:
```js
export default {
  id: 'puddlewick', name: 'Puddlewick', kind: 'town'|'field'|'interior'|'dungeon'|'world',
  size: [w, h],                       // in tiles, 1 tile = 1 world unit
  tiles: { ground: Uint8Array|fn, height: Float32Array|fn, solid: Uint8Array|fn },
  theme: 'grass'|'stone'|'wood'|'cave'|'snow'|'sand',
  props: [{type, x, z, rot?, ...opts}],
  npcs:  [{id, char, x, z, facing?, wander?, script}],
  exits: [{x, z, w?, h?, to, tx, tz, kind:'door'|'stairs'|'edge'}],
  encounters: {rate, table:[{id, weight, lvl}]} | null,
  music: 'village'|'overworld'|'town'|'castle'|'church'|'inn'|'dungeon'|'tension'|'family'|'highfeather'|
         'quiet_hand'|'silence'|...,     // a CANON §9 music id; 'sad' is an alias of 'family'
  ambience?: 'amb_meadow'|'amb_town'|'amb_cave'|'amb_night',
  light: {ambient, sun, fog}, weather?: 'clear'|'rain'|'snow',
  onEnter?(ctx), chests?: [{x,z,item}], lines?: {key: text},
}
```
Collision is **tile-based with a circular player radius** (0.35) — smooth sliding along walls, no corner snags.
The full def (origin, res, colliders, occluders, spawn, camera, walkY, view) is documented at the top of `map.js`.

### Map layers — `<id>.npcs.js` and `<id>.chests.js`
So the people who fill a map never edit the map file, every map id in `src/world/maps/index.js` is loaded as
**three files merged at load** by `Maps.loadAll()` / `Maps.load(id)`:
```
src/world/maps/index.js            [{id, layers?: ['npcs', 'chests']}]                          (P23)
src/world/maps/<id>.js             the base: ground, props, colliders, exits, camera, music, view()  (P23)
src/world/maps/<id>.npcs.js        {npcs: [...], lines: {key: text | pages[] | {text, voice, name}}}  (P11)
src/world/maps/<id>.chests.js      {chests: [...], props?: [...], lines?: {...}}                 (P30)
```
A layer default-exports an object or `fn(baseDef) -> object`. Arrays (`npcs chests props exits colliders occluders`)
are appended to the base's; `lines` objects merge (later layers win). A base entity (prop, npc, chest, exit) that
names `line: 'key'` and has no `text`/`talk`/`script` of its own gets its words (and `voice`, `name`) from `lines`, so
the map file holds WHERE things are and the people layer holds WHAT THEY SAY. `lines.search` feeds Menu > Search.
Every listed layer file must exist (`export default {}` is fine): a missing file is a 404, which fails the harness.
`Maps.addLayer(id, kind, layer)` registers one by hand (demos, tests); `__DQ.state().map` reports `layers`, `npcs`,
`chests`, `lines` and any `missingLines`.

### Scene plugins — `install(ctx)`
`src/main.js` imports each plugin module ONCE and calls its `install(ctx)` in this order, then boots `ctx.boot`:
`src/ui/transitions.js` · `src/ui/dialogue.js` · `src/ui/menu.js` · `src/ui/hud.js` · `src/world/npc.js` ·
`src/world/encounter.js` · `src/battle/present.js` · `src/battle/scene.js` · `src/ui/title.js` (last).
```js
export function install(ctx) { ... }     // register scenes, Field hooks, Bus listeners, Debug.provide/expose/implement
ctx = { version, App, Loop, Scenes, Bus, Debug, reportError, Input, UI, Text, Save, Audio, Sfx,
        Music: () => Promise<Music|null>,  // the shared score, loaded lazily and already wired to Audio's music bus
        Field, Maps,                       // Field.on('load'|'unload'|'update'|'render', fn) · Field.world() ·
                                           // Field.talk({text, voice, name}) · Field.setTransition(fn) · Field.teleport
        vars: {HERO: 'Bram'},              // text tokens for dialogue
        boot: {scene: 'field', ctx: {map: 'meadow'}, newGame: true} }   // a plugin (the title) may re-point this
```
A plugin must be harmless when empty, must never throw out of `install` (it is caught, reported and skipped), and
must reach shared systems only through `ctx` and its own imports. Fill your plugin file and it is live in
`/index.html` with no shared-file edit. `__DQ.state().boot` shows each plugin's status. The field itself is not a
plugin: `src/world/field.js` calls `src/world/camera.js` (`createFieldCamera`) and `src/world/player.js`
(`createPlayer`, `heroModel`) through their documented interfaces, so P09 and P10 edit only their own files.

### Art conventions (the DQV look)
- **Toon/cel shading**, 2–3 flat light bands, warm key light, cool sky fill, soft ambient occlusion contact
  shadows. Rounded, chunky, friendly silhouettes. Slight outline on characters and key props.
- Everything sits on a gentle **height field**, never flat. Rolling hills, no cliffs at the border of towns.
- Colour comes from `src/art/palette.js` — **never hardcode a hex outside that file.**
- Characters are ~1.6 units tall, big heads (~1/3.2 body), small hands, no fingers. Akira Toriyama proportions.
- Camera: high-ish third person, ~28-34° pitch, FOV 45-52, gentle spring follow, free 360° orbit on the field.

### Audio conventions
- One `AudioContext` (`Audio.init()`), unlocked on first user gesture; **never** autoplay-block the game.
  `Music.init({ctx: Audio.ctx, output: Audio.bus('music'), reverbSend: Audio.reverbSend})` shares it (main.js does
  this; plugins get the wired score from `ctx.Music()`). `Audio.bindEvents(Bus)` ducks the music under
  `dialogue.start`/`menu.open`.
- `Music.play(themeId, {fade})`, `Music.duck(n)`, `Music.stinger(id)`, `Sfx.play(id, {vol,pitch})`,
  `Sfx.glyph(charId)` (text ticks, via `UI.sound('glyph', {voice})`), `Sfx.ambience(id)`,
  `Sfx.play('footstep', {material: map.groundAt(x, z)})`.
- Theme ids are CANON §9: `title village overworld castle town church inn dungeon tension battle boss victory levelup
  befriend family (alias sad) lullaby wedding highfeather quiet_hand finale silence` (+ story variants). A map names
  its theme in `music`.
- Music is sequenced (notes) and played on real recorded multisampled instruments (see "Sampled instruments").
  Themes must be *hummable* — 8-16 bar melodies with a clear singing line, DQ-style: brass/strings pomp for
  overworld, harpsichord/flute for towns, timpani + horns for battle. Loop seamlessly.

### Save format
`localStorage['dqv.save.<slot>']` — JSON `{v, at, playtime, chapter, flags, party, inventory, gold, map, pos}`.
Bump `v` and write a migration if you change the shape.

## Per-piece demos (required)
Every piece owns `demos/<ID>.html` and `scenarios/<ID>.json` — a standalone page that shows that piece at its
best, in isolation, with `window.__DQ` exposed so a critic can drive it. Copy `demos/_TEMPLATE.html`: boot with
`App.start({version})` and add controls with `Debug.expose(name, fn)` — never assign `window.__DQ` yourself.
This is how a piece gets judged on its own. See `docs/HARNESS.md`. A plugin piece is ALSO judged in `/index.html`.

## Sampled instruments (music) — owner decision 2026-09-17
- **Licence:** CC0 / public domain strongly preferred (e.g. VSCO-2 Community Edition, University of Iowa MIS).
  MIT or CC-BY is acceptable only with the exact licence text copied in and an entry in `CREDITS.md`.
  Never CC-BY-NC/ND, "free for personal use", Sampling Plus, or anything with unclear terms. Verify the licence
  file itself, not a README claim.
- **Location:** `vendor/samples/<library>/<instrument>/...` plus `vendor/samples/<library>/LICENSE*`, and a
  generated manifest `vendor/samples/manifest.json` (instrument -> zones: root note, velocity layer, loop
  start/end in samples, file, gain trim).
- **Format:** must decode via `decodeAudioData` in Playwright's headless Chromium, Firefox and Safari. Looped
  sustains must be sample-accurate (FLAC or WAV — never MP3/AAC for loops, their encoder padding breaks loop
  points). One-shots (pizzicato, harp, harpsichord, timpani, percussion) may be MP3.
- **Budget:** <= 30 MB for everything under `vendor/samples/`, mono where stereo adds nothing, trimmed tails,
  zones every minor third (or every major third for a quiet voice), 1-3 velocity layers.
- **Loading:** lazy per instrument, cached; the game never blocks on audio — a theme starts as soon as its
  instruments are decoded, crossfading in. `Music.renderOffline` must use the same samples.
