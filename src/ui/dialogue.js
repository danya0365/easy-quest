/**
 * dialogue.js — the 'dialogue' scene: a Dragon Quest message window pushed over the field.
 *                                                                               (P12, owner: src/ui/dialogue.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx). Fill THIS file and it is live in the real game —
 * no shared-file edit. ctx = {App, Scenes, Bus, Debug, reportError, Input, UI, Text, Save, Audio, Sfx, Music(),
 * Field, Maps, Loop, vars, boot, version} (see main.js "the plugin context").
 *
 * Current behaviour (the vertical slice's stand-in, moved here from main.js unchanged): a real F4 MessageBox with
 * typing, per-glyph ticks in the speaker's voice (UI.sound('glyph', {voice}) -> Sfx.glyph), ▼ and page turns.
 *   Scenes.push('dialogue', { text | pages, voice?: CANON char id, speaker?: name, vars?: {HERO...}, onClose?() })
 * The field pushes it from Field.talk(); the field below keeps its camera alive (updateBelow) and never sees a button.
 * Emits dialogue.start {speaker} / dialogue.end {speaker} (Audio.bindEvents ducks the music under it).
 * __DQ.state().dialogue = {open, text, full, page, pages, typing, waitingForConfirm, speaker, voice, closing} | null.
 *
 * P12 builds on this: portraits, a speaker nameplate, choices (UI.yesNo / UI.menu), NPC turn-to-face, {p} pages.
 */
import { Scenes } from '../engine/states.js';
import { Bus } from '../engine/events.js';
import { Debug, reportError } from '../engine/debug.js';
import { UI } from './window.js';
import { Text } from './text.js';

const DEFAULT_VARS = { HERO: 'Bram' };

export function dialogueScene(baseVars = DEFAULT_VARS) {
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
      box.say(text, { voice: c.voice || 'narrator', vars: Object.assign({}, baseVars, c.vars || {}) }).then((finished) => {
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

/** Plugin entry: register the 'dialogue' scene. */
export function install(ctx = {}) {
  const vars = ctx.vars || DEFAULT_VARS;
  Scenes.register('dialogue', () => dialogueScene(vars));
  Debug.provide('dialogue', () => null);
}

export default install;
