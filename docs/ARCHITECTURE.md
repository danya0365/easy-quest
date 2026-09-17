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
src/main.js           bootstrap: build App, register scenes   (owner: integrator only)
src/engine/           loop, app, input, states, events, save, rng, debug, assets
src/art/              palette, toon, chars, props, sky, fx, text3d  (procedural art factories)
src/world/            map, field, camera, player, npc, encounter, maps/*.js
src/battle/           battle, actions, ai, present, formulas
src/ui/               ui.css, window, text, menu, hud, dialogue, transitions, title
src/data/             items, monsters, spells, growth, shops, strings
src/audio/            audio, music, sfx
src/story/            flags, script, chapters/*.js
docs/                 contracts + rubric + progress
tools/                server.mjs, shoot.mjs, progress.mjs  (owner: orchestrator only)
scenarios/            *.json inspection scripts (anyone may ADD; never edit another's)
```

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

### `src/engine/states.js` — scene stack
```js
Scenes.register(name, {enter(ctx), exit(), update(dt), render(alpha), onInput(btn)})
Scenes.push(name, ctx) / Scenes.pop() / Scenes.replace(name, ctx) / Scenes.top()
```
Scene names in use: `title`, `field`, `battle`, `menu`, `dialogue`, `shop`, `cutscene`, `gameover`.
Pushed scenes render **over** the ones below (field keeps rendering under a menu).

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

### `src/world/map.js` — map data format
Maps are authored one-per-file in `src/world/maps/<id>.js`, default-exporting:
```js
export default {
  id: 'whealbrook', name: 'Whealbrook', kind: 'town'|'field'|'interior'|'dungeon'|'world',
  size: [w, h],                       // in tiles, 1 tile = 1 world unit
  tiles: { ground: Uint8Array|fn, height: Float32Array|fn, solid: Uint8Array|fn },
  theme: 'grass'|'stone'|'wood'|'cave'|'snow'|'sand',
  props: [{type, x, z, rot?, ...opts}],
  npcs:  [{id, char, x, z, facing?, wander?, script}],
  exits: [{x, z, w?, h?, to, tx, tz, kind:'door'|'stairs'|'edge'}],
  encounters: {rate, table:[{id, weight, lvl}]} | null,
  music: 'town'|'overworld'|'castle'|'dungeon'|'sad'|'battle',
  light: {ambient, sun, fog}, weather?: 'clear'|'rain'|'snow',
  onEnter?(ctx), chests?: [{x,z,item}],
}
```
Collision is **tile-based with a circular player radius** (0.35) — smooth sliding along walls, no corner snags.

### Art conventions (the DQV look)
- **Toon/cel shading**, 2–3 flat light bands, warm key light, cool sky fill, soft ambient occlusion contact
  shadows. Rounded, chunky, friendly silhouettes. Slight outline on characters and key props.
- Everything sits on a gentle **height field**, never flat. Rolling hills, no cliffs at the border of towns.
- Colour comes from `src/art/palette.js` — **never hardcode a hex outside that file.**
- Characters are ~1.6 units tall, big heads (~1/3.2 body), small hands, no fingers. Akira Toriyama proportions.
- Camera: high-ish third person, ~28-34° pitch, FOV 45-52, gentle spring follow, free 360° orbit on the field.

### Audio conventions
- One `AudioContext`, unlocked on first user gesture; **never** autoplay-block the game.
- `Music.play(themeId, {fade})`, `Music.duck(n)`, `Sfx.play(id, {vol,pitch})`.
- Music is sequenced (notes + synth voices), not sampled. Themes must be *hummable* — 8-16 bar melodies with a
  clear singing line, DQ-style: brass/strings pomp for overworld, harpsichord/flute for towns, timpani + horns
  for battle. Loop seamlessly.

### Save format
`localStorage['dqv.save.<slot>']` — JSON `{v, at, playtime, chapter, flags, party, inventory, gold, map, pos}`.
Bump `v` and write a migration if you change the shape.

## Per-piece demos (required)
Every piece owns `demos/<ID>.html` and `scenarios/<ID>.json` — a standalone page that shows that piece at its
best, in isolation, with `window.__DQ` exposed so a critic can drive it. Copy `demos/_TEMPLATE.html`.
This is how a piece gets judged on its own. See `docs/HARNESS.md`.

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
