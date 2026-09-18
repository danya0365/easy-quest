/**
 * main.js — bootstrap: publish the palette, start input + the engine, wire audio, load the maps, install every
 * scene plugin, then boot the first scene.                                                  (integrator-owned)
 *
 * Boot order (each step guarded; a failure lands in __DQ.errors and the rest still boots):
 *   1. applyCssVars()                   the palette as --pal-* custom properties (ui.css and the touch pad read them)
 *   2. Input.init()                     keyboard / gamepad / touch + __DQ.press/hold/release through real input
 *   3. App.start({beforeUpdate})        renderer, Debug (__DQ), the fixed 60 Hz loop over the scene stack
 *   4. Save.init() + autosave on map.enter
 *   5. Audio.init() (unlocks itself on the first gesture) + Audio.bindEvents(Bus) (dialogue / menu ducks); the score
 *      (src/audio/music.js, loaded lazily) plays each map's CANON §9 theme and its ambience bed on map.enter
 *   6. await: Maps.loadAll() (src/world/maps/index.js + every <id>.js / .npcs.js / .chests.js) and preloadHero()
 *      (src/art/chars.js — the real Bram; the placeholder stands in if it is missing or broken)
 *   7. Field.install(), then every PLUGIN in order: import once, call install(ctx)
 *   8. boot ctx.boot: Save.newGame() when asked, Scenes.push(boot.scene, boot.ctx); Bus 'app.booted'
 *
 * THE PLUGIN CONTEXT — what every plugin's install(ctx) receives (a piece fills its own file; nobody edits this one):
 *   ctx = { version, App, Loop, Scenes, Bus, Debug, reportError, Input, UI, Text, Save, Audio, Sfx,
 *           Music() -> Promise<Music> (lazy, shared), Field, Maps, vars: {HERO}, boot: {scene, ctx, newGame} }
 *   Plugins, in install order: src/ui/transitions.js (P29) · src/ui/dialogue.js (P12) · src/ui/menu.js (P13) ·
 *   src/ui/hud.js (P32) · src/world/npc.js (P11) · src/world/encounter.js (P31) · src/battle/present.js (P15) ·
 *   src/battle/scene.js (P14) · src/ui/title.js (P01, last: it may point ctx.boot at 'title').
 *   A plugin that fails to import or install is reported and skipped; __DQ.state().boot lists what happened.
 */
import { App } from './engine/app.js';
import { Loop } from './engine/loop.js';
import { Scenes } from './engine/states.js';
import { Bus } from './engine/events.js';
import { Debug, reportError } from './engine/debug.js';
import { Input } from './engine/input.js';
import { Save } from './engine/save.js';
import { applyCssVars } from './art/palette.js';
import { UI } from './ui/window.js';
import { Text } from './ui/text.js';
import { Audio } from './audio/audio.js';
import { Sfx } from './audio/sfx.js';
import { Maps } from './world/map.js';
import { Field } from './world/field.js';
import { preloadHero } from './world/player.js';
import { PLUGINS as PLUGIN_MANIFEST } from './plugins.js';

export const VERSION = '0.3.0-seams';

const step = (name, fn) => { try { return fn(); } catch (e) { reportError('boot: ' + name, e); return undefined; } };
const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((res) => setTimeout(() => res(fallback), ms))]);

const PLUGINS = PLUGIN_MANIFEST;

const BOOT = { phase: 'starting', plugins: {}, maps: [], hero: null, booted: null, ms: 0 };
/** ?hero=placeholder boots with the stand-in hero (before/after comparisons, or when chars.js is being rebuilt). */
const URLQ = (() => { try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(); } })();
const T0 = performance.now();

// ── engine ───────────────────────────────────────────────────────────────────────────────────────────────────
step('palette css vars', () => applyCssVars());
step('input', () => Input.init());
step('app', () => App.start({ canvas: document.getElementById('game-canvas'), version: VERSION, beforeUpdate: Input.update }));
Debug.busy('boot', true);
Debug.provide('boot', () => Object.assign({}, BOOT, { plugins: Object.assign({}, BOOT.plugins) }));

step('save', () => {
  Save.init();
  Save.enableAutosave({ events: ['map.enter'] });
});

// ── audio: one AudioContext for everything (docs/ARCHITECTURE.md) ───────────────────────────────────────────
// Sfx and the score share Audio's mixer. The context unlocks itself on the first gesture; until then nothing plays and
// nothing blocks. The score module loads lazily (and every call into it is guarded) so a slow or mid-edit music.js can
// never hold up the first frame or stop the game.
let musicPromise = null, musicLib = null;
function loadMusic() {
  if (!musicPromise) {
    musicPromise = import('./audio/music.js').then((m) => {
      const M = m.Music || m.default;
      M.init({ ctx: Audio.ctx, output: Audio.bus('music'), reverbSend: Audio.reverbSend, setSpace: (n, ms) => Audio.setSpace(n, ms), quality: App.quality });
      musicLib = M;
      return M;
    }).catch((e) => { reportError('music: src/audio/music.js did not load (the game runs silent)', e); musicPromise = null; return null; });
  }
  return musicPromise;
}
const want = { theme: null, ambience: null };
step('audio', () => {
  Audio.init();
  Audio.bindEvents(Bus);                                    // dialogue ducks the music to 0.55, the menu to 0.8
  Bus.on('dialogue.end', () => { try { Sfx.textDone(); } catch (e) { reportError('sfx textDone', e); } });
  Bus.on('map.enter', (m) => {
    const def = m && Maps.get(m.id);
    want.theme = (m && m.music) || null;                   // CANON §9 id: village, overworld, town, dungeon ...
    want.ambience = (def && def.ambience) || null;
    Audio.onUnlock(() => {
      if (want.theme) loadMusic().then((M) => { try { if (M && want.theme) M.play(want.theme, { fade: 1.5 }); } catch (e) { reportError('music play', e); } });
      try { Sfx.ambience(want.ambience); } catch (e) { reportError('ambience', e); }
      try { Audio.setSpace('open', 800); } catch (e) { reportError('audio space', e); }
    });
  });
  Debug.provide('audio', () => {
    let music = null, sfx = null;
    try { music = musicLib ? musicLib.state().theme : null; } catch (_) { music = 'error'; }
    try { sfx = Sfx.state(); } catch (_) { sfx = 'error'; }
    return { ctx: Audio.ctx ? Audio.ctx.state : 'none', theme: want.theme, ambience: want.ambience, music, sfx };
  });
});

// ── the plugin context ───────────────────────────────────────────────────────────────────────────────────────
const ctx = {
  version: VERSION,
  App, Loop, Scenes, Bus, Debug, reportError, Input, UI, Text, Save, Audio, Sfx, Field, Maps,
  Music: loadMusic,
  vars: { HERO: 'Bram' },
  boot: { scene: 'field', ctx: { map: 'meadow' }, newGame: true },
};

async function boot() {
  BOOT.phase = 'loading';
  const [maps, hero] = await Promise.all([
    Maps.loadAll().catch((e) => { reportError('boot: maps', e); return []; }),
    URLQ.get('hero') === 'placeholder' ? Promise.resolve(false) : withTimeout(preloadHero(), 6000, false),
  ]);
  BOOT.maps = maps; BOOT.hero = hero ? 'chars' : 'placeholder';

  step('field', () => Field.install());

  BOOT.phase = 'plugins';
  const mods = await Promise.all(PLUGINS.map(([name, load]) => load().then((m) => m, (e) => { reportError(`plugin "${name}" did not load`, e); return null; })));
  PLUGINS.forEach(([name], i) => {
    const m = mods[i];
    const install = m && (m.install || (typeof m.default === 'function' ? m.default : null));
    if (typeof install !== 'function') { BOOT.plugins[name] = m ? 'no install()' : 'failed to load'; return; }
    try { install(ctx); BOOT.plugins[name] = 'installed'; }
    catch (e) { BOOT.plugins[name] = 'install threw'; reportError(`plugin "${name}" install`, e); }
  });

  BOOT.phase = 'boot';
  const b = ctx.boot || {};
  step('new game', () => { if (b.newGame) Save.newGame(); });
  const scene = Scenes.has(b.scene) ? b.scene : 'field';
  if (scene !== b.scene) reportError('boot', new Error(`boot scene "${b.scene}" is not registered; booting the field`));
  step('first scene', () => Scenes.push(scene, scene === b.scene ? (b.ctx || {}) : { map: 'meadow' }));
  BOOT.booted = scene; BOOT.phase = 'running'; BOOT.ms = Math.round(performance.now() - T0);
  Debug.busy('boot', false);
  Bus.emit('app.booted', { scene, ms: BOOT.ms });
}

boot().catch((e) => {
  reportError('boot', e);
  Debug.busy('boot', false);
  if (!Scenes.top() && Scenes.has('field')) step('fallback field', () => Scenes.push('field', { map: 'meadow' }));
});
