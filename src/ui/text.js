/**
 * text.js — the typewriter: markup, wrap, pages, ▼ caret, glyph ticks, and the message window.
 *                                                                                 (F4, owner: src/ui/text.js)
 *
 *   import { MessageBox, Text } from './ui/text.js';
 *
 *   const box = new MessageBox();                      // bottom-centre DQ message window, 3 lines
 *   await box.say('Halvard: "Up you get, lad."{p}Halvard: "Boots on, if you would."', { voice: 'halvard' });
 *   await box.say(['page one', 'page two']);            // an array is pages
 *   await box.say('Eight gold?', { wait: false });      // resolves as soon as the last page has typed (for prompts)
 *   const yes = await UI.yesNo();
 *   await box.close();
 *
 *   say(markup, opts)  opts: {voice, vars:{HERO:'Bram'}, wait=true, caret=true, speed (glyphs/sec), close=false,
 *                             onGlyph(ch, info), onPage(i)}
 *   Confirm or cancel while typing completes the page at once; confirm on a finished page turns it; confirm on the
 *   last page resolves say(). A page never holds more than `lines` lines and never overflows: pages are laid out by
 *   measuring the real DOM text, so wrapping is exact for any font the browser picks.
 *
 * MARKUP (inline, nestable):
 *   {p}                      page break (also \f)            \n or {n}   line break
 *   {gold}…{/gold}           colour: gold red green blue pink purple grey orange   ({/} closes the latest style)
 *   {shake}…{/}  {wave}…{/}  {bounce}…{/}                     per-glyph motion
 *   {big} {small} {quiet} {bold} {name}                       size / weight / the speaker-name tint
 *   {wait:400}               pause 400 ms while typing        {speed:2}…{/speed}   faster (or {slow} / {fast} / {instant})
 *   {voice:barty}            switch the glyph-tick voice mid-page (two speakers on one page)
 *   %HERO% %ITEM% …          substituted from opts.vars (CANON §10 tokens); unknown tokens are left as written
 *   {{                       a literal "{"
 *
 *   Text.speed / Text.setSpeed(gps)   global default typing speed (35 glyphs/sec; P33 "How fast should the words come?")
 *   Text.parse(markup, vars) -> glyph tokens      Text.strip(markup, vars) -> plain text
 *   Typewriter                        the engine without a window (any host element)
 */
import { UI, Window, CARET_SVG } from './window.js';
import { reportError } from '../engine/debug.js';

const STYLE = {
  gold: 'dq-c-gold', yellow: 'dq-c-gold', red: 'dq-c-red', green: 'dq-c-green', blue: 'dq-c-blue', pink: 'dq-c-pink',
  purple: 'dq-c-purple', grey: 'dq-c-grey', gray: 'dq-c-grey', orange: 'dq-c-orange',
  big: 'dq-s-big', small: 'dq-s-small', quiet: 'dq-s-quiet', bold: 'dq-s-bold', name: 'dq-s-name',
  shake: 'dq-fx-shake', wave: 'dq-fx-wave', bounce: 'dq-fx-bounce',
};
const SPEED_TAGS = { fast: 2, slow: 0.5, instant: Infinity };
const PUNCT_PAUSE = { ',': 0.1, ';': 0.12, ':': 0.12, '.': 0.24, '!': 0.24, '?': 0.24, '…': 0.3, '—': 0.14 };
const CLOSERS = new Set(['"', "'", ')', '”', '’', ']']);
const AUDIBLE = /[\p{L}\p{N}]/u;
// Minimum gap between glyph ticks. Frame-quantised reveals at 35 gps land 25 or 33 ms apart at 120 Hz, so the
// limit sits just under that: every letter ticks, and a burst (skip, fast text) can never machine-gun.
const TICK_GAP = 0.022;

const settings = { speed: 35 };
const warnings = [];

function warn(msg) {
  if (warnings.includes(msg)) return;
  warnings.push(msg);
  if (warnings.length > 50) warnings.shift();
  try { console.warn('[text]', msg); } catch (_) {}
}

// ── parse ───────────────────────────────────────────────────────────────────────────────────────────────────
export function parse(markup, vars = {}) {
  let s = Array.isArray(markup) ? markup.map(String).join('{p}') : String(markup ?? '');
  s = s.replace(/%([A-Z][A-Z0-9_]*)%/g, (m, k) => (vars && (vars[k] ?? vars[k.toLowerCase()])) ?? m);
  const out = [];
  const stack = [];   // [{tag, cls}]
  const speedStack = [];
  let speed = 1;
  let voice = null;
  const cls = () => stack.map(x => x.cls);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') {
      if (s[i + 1] === '{') { out.push({ ch: '{', cls: cls(), speed, voice }); i++; continue; }
      const j = s.indexOf('}', i);
      if (j < 0) { out.push({ ch, cls: cls(), speed, voice }); continue; }
      const raw = s.slice(i + 1, j).trim();
      i = j;
      const [name, arg] = raw.split(':').map(x => x && x.trim());
      const lname = (name || '').toLowerCase();
      if (lname === 'p' || lname === 'page') { out.push({ pb: true }); continue; }
      if (lname === 'n' || lname === 'br') { out.push({ br: true }); continue; }
      if (lname === 'wait' || lname === 'w' || lname === 'pause') { out.push({ pause: Math.max(0, Number(arg) || 0) / 1000 }); continue; }
      if (lname === 'voice') { voice = arg || null; continue; }
      if (lname === 'speed') { speedStack.push(speed); speed = Math.max(0.05, Number(arg) || 1); continue; }
      if (SPEED_TAGS[lname] != null) { speedStack.push(speed); speed = SPEED_TAGS[lname]; continue; }
      if (lname.startsWith('/')) {
        const nm = lname.slice(1);
        if (nm === 'speed' || SPEED_TAGS[nm] != null) { speed = speedStack.length ? speedStack.pop() : 1; continue; }
        if (!nm) { if (stack.length) stack.pop(); continue; }
        for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === nm || STYLE[stack[k].tag] === STYLE[nm]) { stack.splice(k, 1); break; }
        continue;
      }
      if (STYLE[lname]) { stack.push({ tag: lname, cls: STYLE[lname] }); continue; }
      warn(`unknown text tag {${raw}}`);
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') { out.push({ br: true }); continue; }
    if (ch === '\f') { out.push({ pb: true }); continue; }
    if (ch === '\t') { out.push({ ch: ' ', cls: cls(), speed, voice }); continue; }
    out.push({ ch, cls: cls(), speed, voice });
  }
  return out;
}

export function strip(markup, vars) {
  return parse(markup, vars).map(g => (g.pb ? '\n\n' : g.br ? '\n' : g.ch || '')).join('');
}

// ── layout ──────────────────────────────────────────────────────────────────────────────────────────────────
function mk(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

/**
 * Lay glyphs out inside `host` (which must have its final width) and cut them into pages of `maxLines` lines.
 * Returns [{el, seq:[{el, g, space?} | {pause}], fx:[{el, kind, i}], text}].
 */
function buildPages(host, glyphs, maxLines, lineHeightPx) {
  const chunks = [[]];
  for (const g of glyphs) { if (g.pb) chunks.push([]); else chunks[chunks.length - 1].push(g); }
  const pages = [];
  for (const chunk of chunks) {
    if (!chunk.some(g => g.ch != null || g.br)) {
      if (chunk.some(g => g.pause) && pages.length) for (const g of chunk) if (g.pause) pages[pages.length - 1].seq.push({ pause: g.pause });
      continue;
    }
    const measure = mk('div', 'dq-page dq-measure');
    host.appendChild(measure);
    const nodes = [];
    let word = null;
    for (const g of chunk) {
      if (g.br) { word = null; measure.appendChild(document.createElement('br')); nodes.push({ type: 'br' }); continue; }
      if (g.ch == null) { if (g.pause) nodes.push({ type: 'pause', pause: g.pause }); continue; }
      if (g.ch === ' ') {
        word = null;
        const sp = mk('span', 'dq-g dq-h dq-sp', ' ');
        measure.appendChild(sp);
        nodes.push({ type: 'space', el: sp, g });
        continue;
      }
      if (!word) { word = { type: 'word', el: mk('span', 'dq-word'), glyphs: [] }; measure.appendChild(word.el); nodes.push(word); }
      const gs = mk('span', 'dq-g dq-h' + (g.cls.length ? ' ' + g.cls.join(' ') : ''), g.ch);
      word.el.appendChild(gs);
      word.glyphs.push({ el: gs, g });
      // an em dash is a legal break point, as in print
      if (g.ch === '—') word = null;
    }
    const lh = lineHeightPx || 40;
    const lines = [[]];
    let lineMid = null;
    for (const n of nodes) {
      if (n.type === 'br') { lines.push([]); lineMid = null; continue; }
      if (n.type === 'word') {
        const mid = n.el.offsetTop + n.el.offsetHeight / 2;
        if (lineMid === null) lineMid = mid;
        else if (mid > lineMid + lh * 0.5) { lines.push([]); lineMid = mid; }
      }
      lines[lines.length - 1].push(n);
    }
    measure.remove();
    for (let p = 0; p < lines.length; p += maxLines) {
      const pageEl = mk('div', 'dq-page');
      const seq = [], fx = [];
      const text = [];
      for (const line of lines.slice(p, p + maxLines)) {
        const lineEl = mk('div', 'dq-tline');
        let a = 0, b = line.length;
        while (a < b && line[a].type === 'space') a++;
        while (b > a && line[b - 1].type === 'space') b--;
        let lt = '';
        for (let k = 0; k < line.length; k++) {
          const n = line[k];
          if (n.type === 'pause') { seq.push({ pause: n.pause }); continue; }
          if (k < a || k >= b) continue;
          if (n.type === 'space') { lineEl.appendChild(n.el); seq.push({ el: n.el, g: n.g, space: true }); lt += ' '; continue; }
          lineEl.appendChild(n.el);
          for (const x of n.glyphs) {
            seq.push({ el: x.el, g: x.g });
            lt += x.g.ch;
            const kind = x.g.cls.includes('dq-fx-shake') ? 'shake' : x.g.cls.includes('dq-fx-wave') ? 'wave' : x.g.cls.includes('dq-fx-bounce') ? 'bounce' : null;
            if (kind) fx.push({ el: x.el, kind, i: fx.length, last: '' });
          }
        }
        pageEl.appendChild(lineEl);
        text.push(lt);
      }
      pages.push({ el: pageEl, seq, fx, text: text.join('\n'), lines: text.length });
    }
  }
  if (!pages.length) pages.push({ el: mk('div', 'dq-page'), seq: [], fx: [], text: '', lines: 0 });
  return pages;
}

function hash01(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ── Typewriter ──────────────────────────────────────────────────────────────────────────────────────────────
export class Typewriter {
  /** host: an element with its final width. opts: {lines=3, lineHeight (design px), speed, voice, onGlyph, sound=true} */
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.lines = opts.lines ?? 3;
    this.pages = [];
    this.pi = -1;
    this.pos = 0;
    this.wait = 0;
    this.pageDone = true;
    this.sinceDone = 0;
    this.glyphs = 0;
    this.lastTickAt = -1;
    this.voice = opts.voice || 'narrator';
    this.speed = null;
    this.skipped = false;
  }

  set(markup, o = {}) {
    this.clear();
    this.voice = o.voice || this.opts.voice || 'narrator';
    this.speed = o.speed ?? this.opts.speed ?? null;
    this.onGlyph = o.onGlyph || this.opts.onGlyph || null;
    this.onPage = o.onPage || null;
    this.sound = o.sound ?? this.opts.sound ?? true;
    const glyphs = parse(markup, o.vars);
    const lhPx = (this.opts.lineHeight ?? 48) * (UI.unit || 1);
    this.pages = buildPages(this.host, glyphs, this.lines, lhPx);
    this.showPage(0);
    return this;
  }

  clear() {
    if (this.pages[this.pi]) this.pages[this.pi].el.remove();
    this.host.querySelectorAll(':scope > .dq-page').forEach(e => e.remove());
    this.pages = []; this.pi = -1; this.pos = 0; this.wait = 0; this.pageDone = true; this.sinceDone = 0;
  }

  showPage(i) {
    const cur = this.pages[this.pi];
    if (cur) cur.el.remove();
    this.pi = i;
    const p = this.pages[i];
    if (!p) return false;
    this.host.appendChild(p.el);
    this.pos = 0; this.wait = 0; this.pageDone = p.seq.length === 0; this.sinceDone = 0; this.skipped = false;
    try { this.onPage && this.onPage(i); } catch (e) { reportError('Typewriter onPage', e); }
    return true;
  }

  get page() { return this.pages[this.pi] || null; }
  hasNext() { return this.pi < this.pages.length - 1; }
  next() { return this.hasNext() ? this.showPage(this.pi + 1) : false; }

  /** Reveal the rest of the current page at once (confirm while typing). */
  complete() {
    const p = this.page;
    if (!p) return;
    for (let k = this.pos; k < p.seq.length; k++) if (p.seq[k].el) p.seq[k].el.classList.remove('dq-h');
    this.pos = p.seq.length;
    this.wait = 0;
    this.skipped = true;
    this.pageDone = true;
    this.sinceDone = 0;
  }

  update(dt, t) {
    const p = this.page;
    if (!p) return;
    if (!this.pageDone) {
      const gps = this.speed ?? settings.speed;
      let budget = dt;
      const seq = p.seq;
      while (this.pos < seq.length) {
        if (this.wait > 0) {
          if (budget <= 0) break;
          const use = Math.min(this.wait, budget);
          this.wait -= use; budget -= use;
          if (this.wait > 1e-9) break;
          this.wait = 0;
        }
        const e = seq[this.pos++];
        if (e.pause) { this.wait += e.pause; continue; }
        e.el.classList.remove('dq-h');
        this.glyphs++;
        const g = e.g;
        const sp = gps * (g.speed || 1);
        if (sp === Infinity) continue;
        let w = (e.space ? 0.45 : 1) / sp;
        // natural reading pauses after punctuation (only where a sentence actually breaks)
        const nx = seq[this.pos];
        const brk = !nx || nx.space || (nx.el && nx.el.parentNode !== e.el.parentNode && !nx.pause);
        if (!e.space && brk) {
          let pc = PUNCT_PAUSE[g.ch];
          if (pc == null && CLOSERS.has(g.ch) && this.pos >= 2) { const pv = seq[this.pos - 2]; if (pv && pv.g) pc = PUNCT_PAUSE[pv.g.ch]; }
          if (pc) w += pc / Math.max(0.5, Math.min(2, (g.speed || 1)));
        }
        this.wait += w;
        if (!e.space) {
          const audible = AUDIBLE.test(g.ch);
          try { this.onGlyph && this.onGlyph(g.ch, { index: this.pos - 1, page: this.pi, voice: g.voice || this.voice, audible }); }
          catch (err) { reportError('Typewriter onGlyph', err); }
          if (audible && this.sound && (this.lastTickAt < 0 || t - this.lastTickAt >= TICK_GAP || t < this.lastTickAt)) {
            this.lastTickAt = t;
            UI.sound('glyph', { voice: g.voice || this.voice });
          }
        }
      }
      if (this.pos >= seq.length) { this.pageDone = true; this.sinceDone = 0; }
    } else this.sinceDone += dt;
    this.animate(t);
  }

  animate(t) {
    const p = this.page;
    if (!p || !p.fx.length) return;
    const u = UI.unit || 1;
    for (const f of p.fx) {
      if (f.el.classList.contains('dq-h')) continue;
      let tr;
      if (f.kind === 'shake') {
        const q = Math.floor(t * 22);
        const x = (hash01(f.i * 7 + 3, q) - 0.5) * 3.6 * u, y = (hash01(f.i * 13 + 5, q) - 0.5) * 3.2 * u;
        tr = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      } else if (f.kind === 'wave') {
        tr = `translateY(${(Math.sin(t * 6.5 - f.i * 0.62) * 3.6 * u).toFixed(2)}px)`;
      } else {
        tr = `translateY(${(-Math.abs(Math.sin(t * 4.2 - f.i * 0.45)) * 5 * u).toFixed(2)}px)`;
      }
      if (tr !== f.last) { f.el.style.transform = tr; f.last = tr; }
    }
  }

  describe() {
    const p = this.page;
    const all = this.pages.map(x => x.text);
    let shown = 0, total = 0;
    if (p) for (let k = 0; k < p.seq.length; k++) { const e = p.seq[k]; if (!e.el) continue; total++; if (k < this.pos) shown++; }
    return { page: this.pi + 1, pages: this.pages.length, shown, total, typing: !!p && !this.pageDone, pageDone: this.pageDone,
      skipped: this.skipped, lines: p ? p.lines : 0, text: p ? p.text : '', full: all.join('\n\n'), voice: this.voice,
      speed: this.speed ?? settings.speed };
  }
}

// ── MessageBox ──────────────────────────────────────────────────────────────────────────────────────────────
export class MessageBox extends Window {
  constructor(opts = {}) {
    const lines = opts.lines ?? 3;
    const lineHeight = opts.lineHeight ?? 48;
    super({ kind: 'message', centerX: opts.left == null && opts.right == null, bottom: 24, width: 1030,
      origin: '50% 100%', ...opts });
    this.interactive = true;
    this.el.classList.add('dq-message', 'dq-interactive');
    this.lines = lines;
    this.lineHeight = lineHeight;
    this.el.style.setProperty('--dq-lh', String(lineHeight));
    this.textEl = document.createElement('div');
    this.textEl.className = 'dq-text';
    this.textEl.style.height = `calc(${lines * lineHeight} * var(--u))`;
    this.body.appendChild(this.textEl);
    this.caret = document.createElement('span');
    this.caret.className = 'dq-caret' + (opts.caretAt === 'end' ? ' dq-end' : '');
    this.caret.innerHTML = CARET_SVG;
    this.el.appendChild(this.caret);
    this.tw = new Typewriter(this.textEl, { lines, lineHeight, speed: opts.speed, voice: opts.voice, onGlyph: opts.onGlyph });
    this.sayOpts = { wait: true, caret: true };
    this.finished = true;
    this._sayWaiters = [];
    this.caretT = 0;
    this.caretOn = false;
    this.lastMarkup = null;
    this.el.addEventListener('click', () => { if (UI.focused === this) UI.input('confirm'); });
  }

  say(markup, o = {}) {
    if (this.destroyed) return Promise.resolve(false);
    for (const res of this._sayWaiters.splice(0)) res(false);
    this.sayOpts = { wait: true, caret: true, ...o };
    this.lastMarkup = markup;
    this.finished = false;
    this.tw.set(markup, { voice: o.voice || this.opts.voice, vars: o.vars || this.opts.vars, speed: o.speed ?? this.opts.speed,
      onGlyph: o.onGlyph || this.opts.onGlyph, onPage: o.onPage, sound: o.sound });
    this.setCaret(false);
    if (this.state === 'closed' || this.state === 'closing') this.open(); else this.focus();
    return new Promise((res) => this._sayWaiters.push(res));
  }

  /** Set text instantly (no typing), e.g. a status line. */
  show(markup, o = {}) {
    const p = this.say(markup, { ...o, wait: false });
    this.tw.complete();
    return p;
  }

  clearText() { this.tw.clear(); this.setCaret(false); }

  handle(btn) {
    if (btn === 'confirm' || btn === 'cancel') {
      if (this.finished) return true;
      if (!this.tw.pageDone) { this.tw.complete(); return true; }
      if (this.tw.hasNext()) { this.tw.next(); this.setCaret(false); return true; }
      if (this.sayOpts.wait) { this.finish(); return true; }
      return true;
    }
    return this.opts.modal !== false;
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.setCaret(false);
    const ws = this._sayWaiters.splice(0);
    if (this.sayOpts.close) this.close();
    for (const res of ws) res(true);
  }

  setCaret(on) {
    if (on === this.caretOn) return;
    this.caretOn = on;
    this.caret.classList.toggle('dq-on', on);
    if (!on) this.caretT = 0;
  }

  update(dt, t) {
    // DQ types once the window has landed: hold the typewriter while it is still unrolling
    if (!(this.state === 'opening' && this.k < 0.92)) this.tw.update(dt, t);
    if (this.finished) { this.setCaret(false); return; }
    const done = this.tw.pageDone;
    const last = !this.tw.hasNext();
    if (done && last && !this.sayOpts.wait) { this.finish(); return; }
    const want = done && this.tw.sinceDone > 0.12 && this.state !== 'closing' && (!last || this.sayOpts.caret !== false);
    this.setCaret(want);
    if (this.caretOn) {
      this.caretT += dt;
      const u = UI.unit || 1;
      const ph = (this.caretT * 1.6) % 1;
      const y = Math.sin(ph * Math.PI) * 4.5 * u;
      const tr = `translateY(${y.toFixed(2)}px)`;
      if (tr !== this._caretTr) { this.caret.style.transform = tr; this._caretTr = tr; }
    }
  }

  onClose() { for (const res of this._sayWaiters.splice(0)) res(false); this.finished = true; }

  destroy() { for (const res of this._sayWaiters.splice(0)) res(false); super.destroy(); }

  onResize() {
    // re-lay the current text for the new width, keeping the page and progress
    if (!this.lastMarkup || this.finished) return;
    try {
      const pi = this.tw.pi, done = this.tw.pageDone, pos = this.tw.pos;
      this.tw.set(this.lastMarkup, { voice: this.sayOpts.voice || this.opts.voice, vars: this.sayOpts.vars || this.opts.vars,
        speed: this.sayOpts.speed ?? this.opts.speed, sound: this.sayOpts.sound });
      if (pi > 0) this.tw.showPage(Math.min(pi, this.tw.pages.length - 1));
      if (done) this.tw.complete();
      else {
        // keep what was already typed on screen (silently), then carry on typing from there
        const seq = this.tw.page ? this.tw.page.seq : [];
        const n = Math.min(pos, seq.length);
        for (let k = 0; k < n; k++) if (seq[k].el) seq[k].el.classList.remove('dq-h');
        this.tw.pos = n;
        if (n >= seq.length) this.tw.complete();
      }
    } catch (e) { reportError('MessageBox resize', e); }
  }

  describeText() {
    return { id: this.id, open: this.state === 'open' || this.state === 'opening', focused: this.focused, caret: this.caretOn,
      done: this.finished, waitingForConfirm: !this.finished && this.tw.pageDone, ...this.tw.describe() };
  }

  describe() {
    const d = super.describe();
    d.text = this.describeText();
    return d;
  }
}

// ── facade ──────────────────────────────────────────────────────────────────────────────────────────────────
let shared = null;
export const Text = {
  parse,
  strip,
  Typewriter,
  MessageBox,
  STYLES: Object.keys(STYLE),
  get speed() { return settings.speed; },
  setSpeed(gps) { const v = Number(gps); settings.speed = Number.isFinite(v) && v > 0 ? Math.min(v, 400) : 35; return settings.speed; },
  warnings,
  /** The shared bottom message window (created on first use). */
  box(opts) { if (!shared || shared.destroyed) shared = new MessageBox(opts); return shared; },
  say(markup, opts) { return Text.box().say(markup, opts); },
};

export default Text;
