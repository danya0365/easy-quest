/**
 * main.js — bootstrap: publish the palette, start input + the engine, register scenes, boot into the field.
 *                                                                                           (integrator-owned)
 *
 * Boot order (each step guarded; a failure lands in __DQ.errors and the rest still boots):
 *   1. applyCssVars()                 the palette as --pal-* custom properties (ui.css and the touch pad read them)
 *   2. Input.init()                   keyboard / gamepad / touch + __DQ.press/hold/release through real input
 *   3. App.start({beforeUpdate: Input.update})   renderer, Debug (__DQ), the fixed 60 Hz loop over the scene stack
 *   4. Save.init() + newGame() + autosave on map.enter   (P01's title will own newGame / load when it lands)
 *   5. Audio: one AudioContext; the score plays on its music bus; the map's theme + ambience start on map.enter
 *   6. Maps.register(meadow); Field.install(); the 'dialogue' scene; Scenes.push('field', {map: 'meadow'})
 *
 * The 'dialogue' scene here is the thin placeholder for P12 (src/ui/dialogue.js): it is a real F4 MessageBox with
 * typing, glyph ticks, ▼ and page turns, pushed over the field (which keeps rendering underneath), and it reports
 * itself as __DQ.state().dialogue = {open, text, page, pages, typing, speaker, voice}.
 */
import { App } from './engine/app.js';
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
import meadow from './world/maps/meadow.js';
import { registerFieldMenu } from './ui/menu.js';

export const VERSION = '0.2.0-slice';
const HERO_VARS = { HERO: 'Bram' };

const step = (name, fn) => { try { return fn(); } catch (e) { reportError('boot: ' + name, e); return undefined; } };

// ── the dialogue scene (P12 seam) ────────────────────────────────────────────────────────────────────────────
function dialogueScene() {
  let box = null, ctx = null, closing = false, sayDone = false;
  const describe = () => {
    if (!box) return { open: false, text: '' };
    const d = box.describeText();
    return { open: !closing && (d.open || box.state === 'opening'), text: d.text, full: d.full, page: d.page, pages: d.pages, typing: d.typing,
      waitingForConfirm: d.waitingForConfirm, speaker: ctx && ctx.speaker || null, voice: ctx && ctx.voice || 'narrator', closing };
  };
  return {
    opaque: false,
    updateBelow: true,     // the field keeps its camera alive underneath (it does not move the player while we are up)
    enter(c = {}) {
      ctx = c;
      closing = false; sayDone = false;
      Debug.provide('dialogue', describe);
      const text = c.text ?? c.pages ?? 'The wind says nothing in particular.\nIt says it nicely, though.';
      box = Text.box();
      box.say(text, { voice: c.voice || 'narrator', vars: Object.assign({}, HERO_VARS, c.vars || {}) }).then((finished) => {
        sayDone = true;
        if (!finished || closing) return;
        closing = true;
        box.close().then(() => { if (Scenes.top() === 'dialogue') Scenes.pop(); });
      });
      Bus.emit('dialogue.start', { speaker: c.speaker || null });
    },
    exit() {
      closing = true;
      try { if (box && box.state !== 'closed') box.close({ instant: !sayDone }); } catch (e) { reportError('dialogue exit', e); }
      Debug.provide('dialogue', () => null);
      Bus.emit('dialogue.end', { speaker: ctx && ctx.speaker || null });
      try { if (ctx && typeof ctx.onClose === 'function') ctx.onClose(); } catch (e) { reportError('dialogue onClose', e); }
    },
    update() {},
    render() {},
    onInput(btn) {
      if (UI.input(btn)) return true;
      if (btn === 'cancel' && sayDone && !closing) { closing = true; box.close().then(() => { if (Scenes.top() === 'dialogue') Scenes.pop(); }); }
      return true;   // modal: the field under a dialogue never sees a button
    },
  };
}

// ── boot ─────────────────────────────────────────────────────────────────────────────────────────────────────
step('palette css vars', () => applyCssVars());
step('input', () => Input.init());
step('app', () => App.start({ canvas: document.getElementById('game-canvas'), version: VERSION, beforeUpdate: Input.update }));
Debug.provide('dialogue', () => null);

step('save', () => {
  Save.init();
  Save.newGame();
  Save.enableAutosave({ events: ['map.enter'] });
});

// One AudioContext for everything (docs/ARCHITECTURE.md): sfx + the score share Audio's mixer. It unlocks on the first
// gesture; until then nothing plays and nothing blocks. The score module is loaded lazily so a slow synth never holds
// up the first frame.
let music = null;
step('audio', () => {
  Audio.init();
  const wantTheme = { id: null };
  const startTheme = () => {
    if (!wantTheme.id) return;
    const go = (M) => { try { M.play(wantTheme.id, { fade: 1.5 }); } catch (e) { reportError('music play', e); } };
    if (music) { go(music); return; }
    import('./audio/music.js').then((m) => {
      music = m.Music;
      music.init({ ctx: Audio.ctx, output: Audio.bus('music'), reverbSend: Audio.reverbSend, setSpace: (n, ms) => Audio.setSpace(n, ms), quality: App.quality });
      go(music);
    }).catch((e) => reportError('music load', e));
  };
  Bus.on('map.enter', (m) => {
    wantTheme.id = m && m.music;
    const def = m && Maps.get(m.id);
    Audio.onUnlock(() => {
      startTheme();
      if (def && def.ambience) Sfx.ambience(def.ambience);
      Audio.setSpace('open', 800);
    });
  });
  Debug.provide('audio', () => ({ ctx: Audio.ctx ? Audio.ctx.state : 'none', theme: wantTheme.id, music: music ? music.state().theme : null, sfx: Sfx.state() }));
});

step('world', () => {
  Maps.register(meadow);
  Field.install();
  Scenes.register('dialogue', dialogueScene);
  registerFieldMenu();
  Scenes.push('field', { map: 'meadow' });
});
