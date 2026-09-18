/**
 * dialogue.js — the 'dialogue' scene: Dragon Quest conversations over the living field.
 *                                                                               (P12, owner: src/ui/dialogue.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx). It registers the 'dialogue' scene, the villager glyph
 * voices, __DQ.state().dialogue and __DQ.say(). Built on F4: the shared MessageBox (typing, ▼, pages) and UI.menu.
 *
 *   Scenes.push('dialogue', {
 *     text | pages | script,          what is said (markup string, page array, or a SCRIPT — see below)
 *     name?,                          the speaker's name for the tab ("Old Hob"); `speaker` is used when it looks like a
 *                                     name (starts with a capital). Lower-case speakers ('signpost', 'rain barrel')
 *                                     are ids and get no tab. nameplate: false hides it anyway.
 *     voice?,                         glyph voice: a CANON char id ('halvard'), or 'low:0.8' | 'high:1.3' | 'monster:1.2'
 *     npc?, talks?, who?(id),         set by src/world/npc.js: whose conversation this is, how many times you have
 *                                     talked before, and a lookup {name, voice} for the other people in the map
 *     vars?, onClose?()
 *   })
 *   Field.talk({text, voice, name}) still works unchanged (the field pushes this scene).
 *
 * SCRIPT — a list of steps, run in order (a bare string or page array is one step):
 *   'markup{p}more'                         say it as the current speaker (one say, any number of pages)
 *   {say: text|pages, as?: npcId, name?, voice?}   switch speaker (persists) and say
 *   {as: npcId} / {name, voice}             switch speaker without saying anything
 *   {narrate: text}                         no tab, narrator voice ('%HERO% looks at his boots.')
 *   {choice: ['Buy a bun', 'Just looking'], then: [steps0, steps1], cancel?: index}
 *   {choice: [{label, then}, ...], cancel?}                   the text before it stays up while you pick
 *   {yesNo: true, yes: steps, no: steps}    labels: {yesNo: ['Aye', 'No']}
 *   {if: cond, then: steps, else: steps}    cond: 'flag' | '!flag' | 'flag=value' | 'act>=2' | 'talks>0' | 'gold>=10'
 *                                           | 'hour>=18' | fn(api) | [cond, cond] (all)
 *   {first: steps, again: steps}            the first conversation, then every later one
 *   {cycle: [steps, steps, ...]}            a different one each time you talk (by talk count)
 *   {act: {1: steps, 2: steps, 3: steps}}   by story Act (ch2.start / ch3.start)
 *   {set: {'flag': value}}  {emote: 'happy', who?}  {anim: 'nod', who?}  {sfx: 'id'}  {wait: ms}
 *   {look: 'npcId' | false, who?}           turn the speaker's head to look at somebody named (or back to work)
 *   {nod: true}                             the hero nods twice, fast, to agree (CANON §1: he never speaks).
 *                                           A {yesNo} nods on Yes by itself; pass nod: false to stop it, and
 *                                           nod: true on a {choice} (or on one of its options) to nod there too.
 *   {do: fn(api)} / fn(api)                 may return more steps
 * api = {flag(k, v?), gold(), act(), hour(), talks, npc, vars, who(id)}.
 *
 * Bus: dialogue.start {speaker, npc, name} · dialogue.say {who, name, voice} · dialogue.typing {who, on} ·
 *      dialogue.choice {items} · dialogue.chose {index, label, of} · dialogue.cue {who, emote?, anim?, look?} ·
 *      dialogue.end {speaker, npc}
 * npc.js listens to say/typing/cue/end: the named speaker stops what they are doing, turns to the hero and talks,
 * the hero turns to them, and a cue aimed at 'hero' reaches player.js instead (that is how the nod happens).
 * __DQ.state().dialogue = {open, text, full, page, pages, typing, waitingForConfirm, speaker, name, voice, npc, choice,
 *                          steps, closing} | null.        __DQ.say(script, opts) pushes a conversation.
 *
 * VOICE-BIBLE §0: three lines, ~34 characters, the joke on the strong word. Tokens %HERO% %WIFE% %SON% %DAUGHTER% %PIP%.
 */
import { Scenes } from '../engine/states.js';
import { Bus } from '../engine/events.js';
import { Debug, reportError } from '../engine/debug.js';
import { UI } from './window.js';
import { Text } from './text.js';
import { Sfx } from '../audio/sfx.js';
import { STR } from '../data/strings.js';

const DEFAULT_VARS = { HERO: 'Bram' };
const FALLBACK_TEXT = 'The wind says nothing in particular.\nIt says it nicely, though.';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// voices: every speaker's glyph tick. CANON ids go straight to Sfx.glyph; villagers use 'low:0.8' style specs,
// which pick the nearest canon voice of that timbre and re-pitch it.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const BASE_REF = { low: 'mortmain', high: 'narrator', monster: 'monster' };
let speakerTable = null;
function speakers() {
  if (!speakerTable) { try { speakerTable = Sfx.speakers ? Sfx.speakers() : {}; } catch (_) { speakerTable = {}; } }
  return speakerTable;
}
/** 'low:0.8' -> {ref: 'mortmain', pitch: 0.8 / 0.9}; canon ids and unknown strings -> null (the default tick). */
export function voiceSpec(voice) {
  if (typeof voice !== 'string') return null;
  const m = /^(low|high|monster)(?::([\d.]+))?$/.exec(voice);
  if (!m) return null;
  const ref = BASE_REF[m[1]], entry = speakers()[ref];
  const refPitch = entry && Number.isFinite(entry[1]) ? entry[1] : 1;
  const want = Number.isFinite(+m[2]) && +m[2] > 0 ? +m[2] : 1;
  return { ref, pitch: want / refPitch };
}
let soundHooked = false;
function hookVoices() {
  if (soundHooked) return;
  soundHooked = true;
  try {
    UI.setSound((kind, opts = {}) => {
      if (kind === 'glyph') {
        const v = voiceSpec(opts.voice);
        if (v) return Sfx.glyph(v.ref, { pitch: v.pitch });
      }
      return UI.defaultSound(kind, opts);
    });
  } catch (e) { reportError('dialogue voices', e); }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the world the words can see: flags, gold, the Act, the hour
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const DQ = () => (typeof window !== 'undefined' && window.__DQ) || null;
function flag(name, value) {
  try {
    const q = DQ(); if (!q || typeof q.flag !== 'function') return null;
    return value === undefined ? q.flag(name) : q.flag(name, value);
  } catch (e) { reportError('dialogue flag', e); return null; }
}
const truthy = (v) => !(v == null || v === false || v === 0 || v === '' || (v && typeof v === 'object' && v.stub));
function gold() { try { const s = DQ() && DQ().state(); return s && Number.isFinite(+s.gold) ? +s.gold : 0; } catch (_) { return 0; } }
function hour() { try { const h = DQ() && DQ().timeOfDay(); return Number.isFinite(+h) ? +h : 12; } catch (_) { return 12; } }
/** Act I / II / III from the CANON flags (the save's chapter mirrors these). */
export function currentAct() { return truthy(flag('ch3.start')) ? 3 : truthy(flag('ch2.start')) ? 2 : 1; }

const OPS = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '!=': (a, b) => a != b, '=': (a, b) => a == b }; // eslint-disable-line eqeqeq
/** Evaluate a condition (see the header). Never throws. */
export function cond(c, api) {
  try {
    if (c == null) return true;
    if (typeof c === 'boolean') return c;
    if (typeof c === 'function') return !!c(api);
    if (Array.isArray(c)) return c.every(x => cond(x, api));
    const s = String(c).trim();
    if (s.startsWith('!')) return !cond(s.slice(1), api);
    const m = /^([\w.]+)\s*(>=|<=|!=|=|>|<)\s*(.+)$/.exec(s);
    const local = { act: () => api.act(), talks: () => api.talks, gold: () => api.gold(), hour: () => api.hour() };
    if (m) {
      const [, key, op, raw] = m;
      const left = local[key] ? local[key]() : flag(key);
      const num = Number(raw), right = Number.isFinite(num) && raw.trim() !== '' ? num : raw.replace(/^['"]|['"]$/g, '');
      const l = typeof right === 'number' ? Number(left) || 0 : left;
      return OPS[op](l, right);
    }
    if (local[s]) return truthy(local[s]());
    return truthy(flag(s));
  } catch (e) { reportError('dialogue cond', e); return false; }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the name tab (our own element on the shared box, so the window never changes height between speakers)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const SYSTEM_NAMES = new Set(['nobody', 'search', 'lane end', 'narrator', 'system']);
export function displayName(c = {}) {
  if (c.nameplate === false) return null;
  if (typeof c.nameplate === 'string' && c.nameplate) return c.nameplate;
  if (typeof c.name === 'string' && c.name) return c.name;
  const s = c.speaker;
  if (typeof s === 'string' && /^[A-Z]/.test(s) && !SYSTEM_NAMES.has(s.toLowerCase())) return s;
  return null;
}
function nameTab(box) {
  let el = box.el.querySelector(':scope > .dq-nameplate');
  if (!el) {
    el = document.createElement('div');
    el.className = 'dq-title dq-nameplate';
    el.style.display = 'none';
    box.el.appendChild(el);
  }
  return el;
}
function setName(box, name) {
  try {
    const el = nameTab(box);
    if (!name) { el.style.display = 'none'; el.textContent = ''; return; }
    const changed = el.textContent !== name || el.style.display === 'none';
    el.textContent = name;
    el.style.display = '';
    if (changed && el.animate && box.state === 'open') {
      el.animate([{ transform: 'translateY(calc(8 * var(--u))) scale(0.72)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 190, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
  } catch (e) { reportError('dialogue name tab', e); }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the scene
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function dialogueScene(baseVars = DEFAULT_VARS) {
  let box = null, c = null, closing = false, gen = 0, menu = null, choice = null, steps = 0, said = 0;
  let cur = { name: null, voice: 'narrator', who: null };   // the current speaker
  let lastTyping = false, done = false;

  const vars = () => {
    const bride = flag('ch2.bride');
    return Object.assign({ SON: 'Rowan', DAUGHTER: 'Linnet', PIP: 'Pip', WIFE: bride === 'sera' ? 'Sera' : 'Willow' },
      DEFAULT_VARS, baseVars || {}, (c && c.vars) || {});
  };
  const api = {
    flag, gold, hour, act: currentAct,
    get talks() { return (c && c.talks) | 0; },
    get npc() { return c ? c.npc || null : null; },
    get vars() { return vars(); },
    who(id) { try { return c && typeof c.who === 'function' ? c.who(id) : null; } catch (e) { reportError('dialogue who', e); return null; } },
  };

  const describe = () => {
    if (!box) return { open: false, text: '' };
    const d = box.describeText();
    return {
      open: !closing && (d.open || box.state === 'opening'), text: d.text, full: d.full, page: d.page, pages: d.pages, typing: d.typing,
      waitingForConfirm: d.waitingForConfirm, speaker: (c && c.speaker) || null, name: cur.name, voice: cur.voice, npc: (c && c.npc) || null,
      choice: choice ? { items: choice.items.slice(), index: menu && !menu.destroyed ? menu.index : 0 } : null, steps, said, closing,
    };
  };

  // ── primitives ──
  async function say(markup, g, beforeChoice = false) {
    if (g !== gen || closing) return false;
    steps++;
    said++;
    setName(box, cur.name);
    Bus.emit('dialogue.say', { who: cur.who, name: cur.name, voice: cur.voice });
    const ok = await box.say(markup, { voice: cur.voice || 'narrator', vars: vars(), wait: !beforeChoice });
    return ok && g === gen && !closing;
  }

  /** The hero is silent: he answers by nodding twice, fast (CANON §1). npc.js hands the cue to player.js. */
  function heroNods() { Bus.emit('dialogue.cue', { who: 'hero', anim: 'nod' }); }

  async function choose(labels, cancelIndex, g) {
    if (g !== gen || closing) return -1;
    steps++;
    const items = labels.map((l, i) => ({ id: 'c' + i, label: Text.strip(String(l), vars()) }));
    choice = { items: items.map(it => it.label) };
    Bus.emit('dialogue.choice', { items: choice.items });
    try {
      menu = UI.menu({ id: 'dialogue-choice', right: 'calc(50% - 515 * var(--u))', bottom: 234, slim: true, origin: '100% 100%', minWidth: 170,
        items, closeOnSelect: true, destroyOnClose: true, cancelValue: null, initial: 0 });
      const it = await menu.choose();
      menu = null; choice = null;
      if (g !== gen || closing) return -1;
      if (it) return items.findIndex(x => x.id === it.id);
      return Number.isInteger(cancelIndex) ? cancelIndex : labels.length - 1;
    } catch (e) { reportError('dialogue choice', e); menu = null; choice = null; return Number.isInteger(cancelIndex) ? cancelIndex : labels.length - 1; }
  }

  const speakAs = (s) => {
    if (s.as) {
      const w = api.who(s.as) || {};
      cur = { name: w.name ?? s.name ?? cur.name, voice: w.voice || s.voice || cur.voice, who: s.as };
    } else if ('name' in s || 'voice' in s) {
      cur = { name: s.name !== undefined ? s.name : cur.name, voice: s.voice || cur.voice, who: s.who || null };
    }
  };

  /** Run a list of steps. Resolves true when it ran to the end, false when the conversation was closed. */
  async function run(list, g, depth = 0) {
    if (depth > 24) { reportError('dialogue script', new Error('steps nested too deep')); return true; }
    const seq = list == null ? [] : (Array.isArray(list) && !isPageArray(list) ? list : [list]);
    for (let i = 0; i < seq.length; i++) {
      if (g !== gen || closing) return false;
      let s = seq[i];
      const next = seq[i + 1];
      const nextIsChoice = next && typeof next === 'object' && !Array.isArray(next) && (next.choice || next.yesNo);
      try {
        if (typeof s === 'function') { s = s(api); if (s == null) continue; }
        if (typeof s === 'string' || isPageArray(s)) { if (!(await say(s, g, nextIsChoice))) return false; continue; }
        if (Array.isArray(s)) { if (!(await run(s, g, depth + 1))) return false; continue; }
        if (typeof s !== 'object') continue;

        if (s.narrate != null) {
          const keep = cur;
          cur = { name: null, voice: 'narrator', who: null };
          const ok = await say(typeof s.narrate === 'function' ? s.narrate(api) : s.narrate, g, nextIsChoice);
          cur = keep;
          if (!ok) return false;
          continue;
        }
        if (s.if !== undefined) {
          const yes = cond(s.if, api);
          // {if, then, else} branches; a bare {if, say: '...'} simply says it (or does not)
          if (s.then !== undefined || s.else !== undefined) { if (!(await run(yes ? s.then : s.else, g, depth + 1))) return false; continue; }
          if (!yes) continue;
        }
        if (s.first !== undefined || s.again !== undefined) {
          if (!(await run(api.talks === 0 ? (s.first ?? s.again) : (s.again ?? s.first), g, depth + 1))) return false; continue;
        }
        if (Array.isArray(s.cycle)) { if (!(await run(s.cycle[api.talks % Math.max(1, s.cycle.length)], g, depth + 1))) return false; continue; }
        if (s.act && typeof s.act === 'object') {
          const a = api.act(); const pick = s.act[a] ?? s.act[a - 1] ?? s.act[1];
          if (!(await run(pick, g, depth + 1))) return false; continue;
        }
        if (s.set && typeof s.set === 'object') { for (const [k, v] of Object.entries(s.set)) flag(k, v); }
        if (s.emote || s.anim || s.look !== undefined) {
          Bus.emit('dialogue.cue', { who: s.who || cur.who || api.npc, emote: s.emote || null, anim: s.anim || null, look: s.look });
        }
        if (s.nod === true && !s.choice && !s.yesNo) heroNods();   // a stage beat: %HERO% nods.
        if (s.sfx) { try { Sfx.play(s.sfx); } catch (e) { reportError('dialogue sfx', e); } }
        if (Number.isFinite(+s.wait) && s.wait > 0) { await UI.wait(+s.wait / 1000); if (g !== gen || closing) return false; }
        if (typeof s.do === 'function') { const more = s.do(api); if (more != null && !(await run(more, g, depth + 1))) return false; }
        speakAs(s);
        const words = s.say ?? s.text ?? s.pages;
        if (words != null) {
          const w = typeof words === 'function' ? words(api) : words;
          if (w != null && !(await say(w, g, !!(s.choice || s.yesNo) || nextIsChoice))) return false;
        }
        if (s.choice) {
          const opts = s.choice.map(o => (typeof o === 'object' && o ? o : { label: o }));
          const k = await choose(opts.map(o => o.label), s.cancel, g);
          if (k < 0) return false;
          const branch = opts[k].then ?? (Array.isArray(s.then) ? s.then[k] : null);
          if (s.flag) flag(s.flag, opts[k].value ?? k);
          Bus.emit('dialogue.chose', { index: k, label: opts[k].label, of: opts.length });
          if (opts[k].nod !== false && opts[k].nod !== undefined ? opts[k].nod : s.nod) heroNods();
          if (!(await run(branch, g, depth + 1))) return false;
          continue;
        }
        if (s.yesNo) {
          const labels = Array.isArray(s.yesNo) ? s.yesNo : ['Yes', 'No'];
          const k = await choose(labels, 1, g);
          if (k < 0) return false;
          Bus.emit('dialogue.chose', { index: k, label: labels[k], of: 2 });
          if (k === 0 && s.nod !== false) heroNods();     // he nods twice, fast, to agree
          if (!(await run(k === 0 ? s.yes : s.no, g, depth + 1))) return false;
          continue;
        }
      } catch (e) { reportError('dialogue step', e); }
    }
    return true;
  }

  function finish(g) {
    if (g !== gen || closing) return;
    closing = true;
    try { box.close().then(() => { if (Scenes.top() === 'dialogue' && sceneObj.alive) Scenes.pop(); }); }
    catch (e) { reportError('dialogue close', e); if (Scenes.top() === 'dialogue') Scenes.pop(); }
  }

  const sceneObj = {
    alive: false,
    opaque: false,
    updateBelow: true,     // the field keeps rendering and its camera stays alive underneath (it holds the player still)
    enter(ctx = {}) {
      c = ctx; closing = false; done = false; steps = 0; said = 0; lastTyping = false; sceneObj.alive = true;
      const g = ++gen;
      Debug.provide('dialogue', describe);
      cur = { name: displayName(ctx), voice: ctx.voice || 'narrator', who: ctx.npc || null };
      box = Text.box();
      setName(box, null);
      const script = ctx.script ?? ctx.pages ?? ctx.text ?? FALLBACK_TEXT;
      Bus.emit('dialogue.start', { speaker: ctx.speaker || null, npc: ctx.npc || null, name: cur.name });
      run(script, g).then(async (ok) => {
        // A CONVERSATION ALWAYS HAS WORDS IN IT. A script whose turn is only a stage direction — an {emote} on its
        // own inside a {cycle}, a {set} that flipped a flag, an {if} that matched nothing — used to open the window
        // and shut it again in the same frame, so the third time you spoke to Dimity Rowe you got a silent flicker
        // and no text at all. If a run said nothing, it says something now.
        if (ok && !said && !closing) ok = await say(STR['talk.nothing'] || FALLBACK_TEXT, g);
        done = true;
        if (ok) finish(g);
      }, (e) => { reportError('dialogue run', e); finish(g); });
    },
    exit() {
      gen++;
      closing = true; sceneObj.alive = false;
      try { if (menu && !menu.destroyed) menu.destroy(); } catch (e) { reportError('dialogue menu exit', e); }
      menu = null; choice = null;
      try { if (box) { setName(box, null); if (box.state !== 'closed') box.close({ instant: !done }); } } catch (e) { reportError('dialogue exit', e); }
      if (lastTyping) Bus.emit('dialogue.typing', { who: cur.who, on: false });
      Debug.provide('dialogue', () => null);
      Bus.emit('dialogue.end', { speaker: (c && c.speaker) || null, npc: (c && c.npc) || null });
      try { if (c && typeof c.onClose === 'function') c.onClose(); } catch (e) { reportError('dialogue onClose', e); }
    },
    update() {
      if (!box) return;
      try {
        const typing = !closing && !!box.tw && box.tw.page != null && !box.tw.pageDone && !box.finished;
        if (typing !== lastTyping) { lastTyping = typing; Bus.emit('dialogue.typing', { who: cur.who, on: typing }); }
      } catch (e) { reportError('dialogue update', e); }
    },
    render() {},
    onInput(btn) {
      if (UI.input(btn)) return true;
      if (btn === 'cancel' && done && !closing) finish(gen);
      return true;   // modal: the field under a dialogue never sees a button
    },
  };
  return sceneObj;
}

function isPageArray(x) { return Array.isArray(x) && x.length > 0 && x.every(p => typeof p === 'string'); }

/** A small facade other pieces may use: Dialogue.say(script, opts) pushes a conversation over whatever is on top. */
export const Dialogue = {
  say(script, opts = {}) {
    if (!Scenes.has('dialogue')) return false;
    Scenes.push('dialogue', Object.assign({}, opts, { script }));
    return true;
  },
  cond, currentAct, voiceSpec, displayName,
};

/** Plugin entry: register the 'dialogue' scene, the villager voices, and the __DQ hooks. */
export function install(ctx = {}) {
  const vars = ctx.vars || DEFAULT_VARS;
  Scenes.register('dialogue', () => dialogueScene(vars));
  hookVoices();
  Debug.provide('dialogue', () => null);
  /** __DQ.say(script, {name, voice, ...}) — push a conversation (critics / demos). */
  Debug.expose('say', (script, opts = {}) => Dialogue.say(script, opts));
}

export default install;
