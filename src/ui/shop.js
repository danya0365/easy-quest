/**
 * shop.js — the counters: the shop, the inn, the bank, and the way a child reaches them.
 *                                                                              (P22, owner: src/ui/shop.js)
 *
 * PLUGIN: `install(ctx)` registers the `shop` scene and the talk hook, so once main.js imports this file the
 * counters are live in /index.html. It is also safe to call `install()` with no context at all (the demo does).
 *
 * HOW A CHILD GETS HERE. Every counter in src/data/shops.js names the map NPC who stands behind it
 * (`npc: 'hammond'`). When a conversation with that NPC ends, the counter opens. Nothing in the map files or in
 * P11's people layer has to change: talk to Mr Hammond and he sells you a sword, talk to Mrs Pottle and she
 * offers you a bed, talk to Sister Candlewick and the book comes out.
 *
 *   Shop.open('puddlewick_shop')      -> Promise, resolves when the counter closes
 *   Shop.counterFor(npcId)            -> the counter that NPC keeps, or null
 *   __DQ.shop('puddlewick_shop')      open it        __DQ.shopPick('buy')   drive the cursor
 *   __DQ.state().shop = {open, id, kind, stage, gold, keeper, stock:[{id,name,price,have,afford}], cursor,
 *                        windows:[{id,left,top,w,h,over,spill}], last}
 *
 * THE BEATS (docs/SYSTEMS-BIBLE §5, docs/VOICE-BIBLE §4 20-31)
 *   shop   greeting in the keeper's own voice, Buy / Sell / Leave, a list with prices and "you have N", the
 *          green up / red down stat change against what each of the family already wears, "I'll take it!",
 *          the gold counting down coin by coin, equip-on-buy, the old one taken in part-exchange, the
 *          out-of-money line, and a farewell.
 *   inn    price by party size, "Sleep well", a fade to night, the rest jingle, everyone wakes mended.
 *   bank   gold in and out in hundreds, and it survives being knocked over.
 *   church lives in src/ui/church.js and is opened through the same door.
 */
import { UI, h } from './window.js';
import { MessageBox } from './text.js';
import { Scenes } from '../engine/states.js';
import { Debug, reportError } from '../engine/debug.js';
import { Bus } from '../engine/events.js';
import { Sfx } from '../audio/sfx.js';
import { Roster } from '../battle/scene.js';
import { derive } from '../battle/formulas.js';
import { statsFor, CHARACTERS } from '../data/growth.js';
import {
  Shops, itemOf, buyPrice, sellPrice, tradeInPrice, innPrice, SHOP_WORDS, INN_WORDS, BANK_WORDS, Economy,
  canEquip, statLine, traitWords,
} from '../data/shops.js';
import { runChurch } from './church.js';

const DESIGN = { w: 1280, h: 720 };
const SLOTS = [['weapon', 'Weapon'], ['armour', 'Armour'], ['shield', 'Shield'], ['helm', 'Hat'], ['accessory', 'Trinket']];
const BAG_MAX = 64;

let CTX = {};                                     // the plugin context, when there is one
const G = { open: false, id: null, kind: null, stage: 'closed', last: null, fit: [], cursor: null, shown: 0 };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the purse, the bag and the family — all of it lives on P14's Roster; there is no second copy here
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const guard = (where, fn, fallback) => { try { return fn(); } catch (e) { reportError('shop: ' + where, e); return fallback; } };

function party() { return guard('roster', () => Roster.ensure() || [], []); }
function everyone() { return party().concat(Array.isArray(Roster.wagon) ? Roster.wagon : []); }
function family() { return everyone().filter((m) => m && m.kind === 'family'); }
function bag() { if (!Roster.bag || typeof Roster.bag !== 'object') Roster.bag = {}; return Roster.bag; }
const have = (id) => bag()[id] || 0;
const gold = () => Math.max(0, Math.round(Number(Roster.gold) || 0));

function bagAdd(id, n = 1) {
  const m = bag();
  if (!m[id] && Object.keys(m).length >= BAG_MAX) return 0;
  m[id] = (m[id] || 0) + n;
  return n;
}
function bagTake(id, n = 1) {
  const m = bag();
  const took = Math.min(n, m[id] || 0);
  if (!took) return 0;
  m[id] -= took;
  if (m[id] <= 0) delete m[id];
  return took;
}
const bagFull = () => Object.keys(bag()).length >= BAG_MAX;

/** Everything a member is wearing, as one bundle of numbers (the same sum menu.js and the battle make). */
function gearOf(m, over = null) {
  const g = { power: 0, def: 0, mdef: 0, agi: 0, wis: 0, luck: 0, resil: 0, maxHp: 0, maxMp: 0 };
  if (!m) return g;
  if (m.gear) Object.assign(g, m.gear);
  const kit = Object.assign({}, m.equip || {}, over || {});
  for (const [slot] of SLOTS) {
    const it = itemOf(kit[slot]);
    if (!it) continue;
    for (const k of Object.keys(g)) if (Number.isFinite(+it[k])) g[k] += +it[k];
  }
  return g;
}
function numbersOf(m, over = null) {
  return guard('numbers', () => derive(statsFor(m), gearOf(m, over)),
    { maxHp: 1, maxMp: 0, atk: 0, def: 0, mag: 0, mdef: 0, spd: 1, luck: 0 });
}
/** Who may wear a thing: family only, and only if P21's "Who" column names them. Guests fight with their own kit. */
function fits(it, m) {
  if (!it || !it.slot || !m || m.kind !== 'family') return false;
  return guard('canEquip', () => canEquip(it.id, m.charId || m.id), true);
}
const nameOf = (id) => (CHARACTERS[id] ? CHARACTERS[id].name : id);

/** The one stat a piece of kit is really about, for the ▲ / ▼ next to each face. */
function keyStat(it) {
  if (!it || !it.slot) return null;
  if (it.slot === 'weapon') return ['atk', 'Attack'];
  if (it.slot === 'accessory') return it.agi ? ['spd', 'Speed'] : it.luck ? ['luck', 'Luck'] : ['def', 'Defence'];
  return ['def', 'Defence'];
}

/** The average level of the walking party, for the price of a bed. */
function partyLevel() {
  const p = party().filter((m) => m && m.kind !== 'monster');
  if (!p.length) return 1;
  return Math.max(1, Math.round(p.reduce((s, m) => s + (m.lvl || 1), 0) / p.length));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the counter's own furniture: one purse window that counts, one message box, a list and a preview
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const CSS = `
.dq-shop-gold .dq-num{font-size: calc(34 * var(--u)); letter-spacing: calc(1 * var(--u))}
.dq-shop-preview .dq-note{white-space: normal; line-height: 1.34; padding: calc(2 * var(--u)) 0}
.dq-shop-preview .dq-row{min-height: calc(30 * var(--u))}
.dq-shop-who{display:flex; gap: calc(10 * var(--u)); align-items:baseline}
.dq-shop-who > .dq-grow{flex: 1 1 auto; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.dq-shop-delta{min-width: calc(96 * var(--u)); text-align:right; white-space:nowrap}
.dq-shop-list .dq-item{min-width: calc(330 * var(--u))}
/* Name, "you have N", price. The price and the count must NEVER be squeezed — a clipped "20" reads as "2", and a
   child would believe it. So only the name gives way, and it gives way with an ellipsis. */
.dq-shop-list .dq-item > .dq-note, .dq-shop-list .dq-item > .dq-right{flex:0 0 auto; white-space:nowrap}
.dq-shop-list .dq-item > .dq-label-text{flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis}
/* The inn's night. It lives INSIDE the UI layer (z-index 10), because P29's screen fade is a sibling at z-index 40
   and nothing in the UI layer can be drawn over it — and the beds window has to be readable through the dark. */
.dq-shop-night{position:absolute; inset:0; z-index:5; opacity:0; pointer-events:none;
  background: var(--pal-ui-shadow, #050a20)}
`;
let styled = false;
function installCss() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  guard('css', () => {
    const el = document.createElement('style');
    el.id = 'dq-shop-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  });
}

/** " / " in a bible line is where the line breaks. %N% %ITEM% %NAME% are filled in here. */
function words(t, vars = {}) {
  let s = String(t == null ? '' : t).split(' / ').join('{n}');
  for (const [k, v] of Object.entries(vars)) s = s.split('%' + k + '%').join(String(v));
  return s;
}

function counterRuntime(counter) {
  const owned = new Set();
  let box = null, purse = null, shownGold = gold(), goldStop = null, alive = true;

  const track = (w) => { owned.add(w); return w; };
  const mkWin = (o) => track(UI.window({ destroyOnClose: true, ...o }));
  const mkMenu = (o) => track(UI.menu({ destroyOnClose: true, ...o }));
  const closeWin = (w) => { if (w && !w.destroyed) { owned.delete(w); return w.close(); } return Promise.resolve(); };

  function msg() {
    if (!box || box.destroyed) box = track(new MessageBox({ id: 's-say', zIndex: 60, destroyOnClose: false }));
    return box;
  }
  async function say(markup, o = {}) {
    if (!alive) return false;
    await guard('say', () => msg().say(markup, { voice: counter.voice || 'narrator', ...o }), null);
    return alive;
  }
  /**
   * The keeper talks WHILE the window opens over him, DQ-style: one line in his voice, no ▼, nothing to press.
   * Never awaited — the caller opens its menu straight away and that menu takes the focus.
   */
  function patter(markup, vars) {
    if (!alive) return;
    guard('patter', () => { const p = msg().say(words(markup, vars), { voice: counter.voice || 'narrator', wait: false, caret: false }); if (p && p.catch) p.catch(() => {}); });
  }
  const hush = () => guard('hush', () => (box && !box.destroyed && box.state !== 'closed' ? box.close() : null), null);

  /**
   * Yes / No, but OURS: UI.yesNo() builds a window this runtime does not own, and a stray one left behind when
   * the counter closes keeps the keyboard focus and locks the field. This one is tracked and dies with the scene.
   */
  function yesNo({ yes = 'Yes', no = 'No' } = {}) {
    const m = mkMenu({ id: 's-yesno', right: 'calc(50% - 515 * var(--u))', bottom: 234, slim: true,
      origin: '100% 100%', minWidth: 160, closeOnSelect: true, cancelValue: null, initial: 'yes',
      items: [{ id: 'yes', label: yes }, { id: 'no', label: no }] });
    return m.choose().then((it) => { owned.delete(m); return !!(it && it.id === 'yes'); });
  }

  // ── the purse: a number that counts, coin by coin, so a child sees the money move ──────────────────────────
  function purseContent() {
    return h('div.dq-row', [h('span.dq-grow', UI.label('G')), h('span.dq-num.dq-c-gold', String(Math.round(shownGold)))]);
  }
  function refreshPurse() { guard('purse', () => { if (purse && !purse.destroyed) purse.setContent(purseContent()); }); }
  function countTo(target, { ms = 460, sound = true } = {}) {
    if (goldStop) { goldStop(); goldStop = null; }
    const from = shownGold;
    const to = Math.round(target);
    if (from === to) { shownGold = to; refreshPurse(); return Promise.resolve(); }
    if (sound) guard('coins', () => Sfx.play('gold_coins', { vol: 0.75 }));
    G.shown = from;
    return new Promise((res) => {
      let t = 0;
      const dur = Math.max(0.16, ms / 1000);
      const off = UI.onUpdate((dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        shownGold = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        G.shown = shownGold;
        refreshPurse();
        if (k >= 1) { off(); goldStop = null; res(); }
      });
      goldStop = () => { off(); shownGold = to; G.shown = to; refreshPurse(); res(); };
    });
  }
  async function pay(n) { Roster.gold = Math.max(0, gold() - Math.round(n)); await countTo(Roster.gold); }
  async function take(n) { Roster.gold = Math.min(9999999, gold() + Math.round(n)); await countTo(Roster.gold); }

  function openPurse() {
    shownGold = gold();
    purse = mkWin({ id: 's-gold', right: 26, top: 30, minWidth: 210, slim: true, origin: '100% 0%',
      className: 'dq-shop-gold', content: purseContent(), destroyOnClose: false });
    purse.open();
  }

  function destroyAll() {
    alive = false;
    if (goldStop) { goldStop(); goldStop = null; }
    for (const w of Array.from(owned)) guard('destroy', () => { if (!w.destroyed) w.destroy(); });
    owned.clear();
    // Safety net: anything of ours still standing (a Yes/No mid-answer, a prompt) goes too. A window left behind
    // keeps the focus and would lock a child out of the field — the worst bug this piece could ship.
    guard('sweep', () => { for (const w of UI.all()) if (w && typeof w.id === 'string' && w.id.startsWith('s-')) w.destroy(); });
    box = null; purse = null;
  }

  /** Every open window measured in the 1280x720 design frame, so a critic can prove nothing runs off-screen. */
  function fitReport() {
    const out = [];
    guard('fit', () => {
      for (const w of owned) {
        if (!w || w.destroyed || w.state === 'closed' || !w.el) continue;
        const u = w.u || 1;
        const b = { id: w.id, left: Math.round((w.el.offsetLeft || 0) / u), top: Math.round((w.el.offsetTop || 0) / u),
          w: Math.round((w.el.offsetWidth || 0) / u), h: Math.round((w.el.offsetHeight || 0) / u) };
        // A centred window sits at left:50% and is pulled back by a CSS transform, which offsetLeft cannot see.
        if (w.center && w.center.x) b.left -= Math.round(b.w / 2);
        if (w.center && w.center.y) b.top -= Math.round(b.h / 2);
        b.right = b.left + b.w; b.bottom = b.top + b.h;
        b.over = Math.round(Math.max(0, b.bottom - DESIGN.h, b.right - DESIGN.w, -b.top, -b.left));
        let spill = 0;
        const wr = w.el.getBoundingClientRect();
        for (const el of w.el.querySelectorAll('*')) {
          if (el.children.length || !(el.textContent || '').trim()) continue;
          const r = el.getBoundingClientRect();
          if (!r.width) continue;
          spill = Math.max(spill, (r.right - wr.right) / u, (wr.left - r.left) / u);
        }
        b.spill = Math.max(0, Math.round(spill));
        out.push(b);
      }
    });
    return out;
  }

  return { counter, mkWin, mkMenu, closeWin, say, patter, yesNo, hush, msg, pay, take, countTo, openPurse, refreshPurse,
    destroyAll, fitReport, get alive() { return alive; }, kill() { alive = false; }, track,
    get shownGold() { return shownGold; } };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SHOP
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function stockRows(counter) {
  return counter.stock.map((id) => {
    const it = itemOf(id);
    const price = buyPrice(id);
    const n = have(id);
    return { id, label: it.name, right: String(price), data: { item: it, price },
      note: n > 0 ? 'you have ' + n : '', color: gold() >= price ? undefined : 'grey' };
  });
}

/** The preview panel: what the thing does, and the green ▲ / red ▼ against what each of the family wears. */
function previewContent(it) {
  if (!it) return h('div.dq-note.dq-c-grey', 'Nothing to look at just yet.');
  const kids = [];
  kids.push(h('div.dq-header', it.name));
  kids.push(h('div.dq-note', blurbOf(it)));
  const nums = numbersLine(it);
  if (nums) kids.push(h('div.dq-note.dq-c-gold', nums));
  const n = have(it.id);
  kids.push(UI.divider());
  if (!it.slot) {
    kids.push(h('div.dq-row', [h('span.dq-grow', 'In the bag'), h('span.dq-num', String(n))]));
    return h('div', kids);
  }
  const [stat, statLabel] = keyStat(it) || ['def', 'Defence'];
  kids.push(h('div.dq-row', [h('span.dq-grow.dq-c-grey', statLabel), h('span.dq-num.dq-c-grey', 'now → with it')]));
  const fam = family();
  let any = false;
  for (const m of fam) {
    if (!fits(it, m)) {
      kids.push(h('div.dq-row.dq-shop-who', [h('span.dq-grow.dq-c-grey', m.name),
        h('span.dq-shop-delta.dq-c-grey', 'not for them')]));
      continue;
    }
    any = true;
    const now = numbersOf(m)[stat];
    const next = numbersOf(m, { [it.slot]: it.id })[stat];
    const d = next - now;
    const mark = d > 0 ? '▲ +' + d : d < 0 ? '▼ ' + d : '—';
    const cls = d > 0 ? '.dq-c-green' : d < 0 ? '.dq-c-red' : '.dq-c-grey';
    kids.push(h('div.dq-row.dq-shop-who', [
      h('span.dq-grow', m.name),
      h('span.dq-shop-delta' + cls, `${now} → ${next}  ${mark}`),
    ]));
  }
  if (!fam.length || !any) kids.push(h('div.dq-note.dq-c-grey', 'Nobody in the family can hold this one.'));
  if (n > 0) { kids.push(UI.divider()); kids.push(h('div.dq-row', [h('span.dq-grow', 'You already have'), h('span.dq-num', String(n))])); }
  return h('div', kids);
}

/** P21 writes a line of voice for every single row; the numbers and the traits come from the same table. */
function blurbOf(it) {
  if (!it) return '';
  return it.blurb || 'Useful, one way or another.';
}
function numbersLine(it) {
  if (!it) return '';
  const stats = guard('statLine', () => statLine(it.id), '') || '';
  const traits = guard('traits', () => traitWords(it.id), []) || [];
  const who = it.who && it.who !== 'anyone' ? 'Only ' + [].concat(it.who).map(nameOf).join(' or ') + ' can hold it.' : '';
  return [stats, traits.join('. '), who].filter(Boolean).join('  \u00b7  ');
}

async function runShop(R) {
  const c = R.counter;
  R.openPurse();
  R.patter(c.lines.greet, { N: gold() });

  while (R.alive) {
    G.stage = 'command';
    const cmd = R.mkMenu({ id: 's-cmd', left: 34, top: 30, minWidth: 250, origin: '0% 0%',
      items: [{ id: 'buy', label: 'Buy' }, { id: 'sell', label: 'Sell' }, { id: 'leave', label: 'Leave' }],
      cancelValue: { id: 'leave' } });
    const pick = await cmd.choose();
    await R.closeWin(cmd);
    if (!R.alive) return;
    const what = pick && pick.id;
    if (!what || what === 'leave') break;
    if (what === 'buy') await buyFlow(R);
    else await sellFlow(R);
  }
  G.stage = 'leaving';
  await R.say(words(c.lines.bye));
  await R.hush();
}

async function buyFlow(R) {
  const c = R.counter;
  G.stage = 'buy';
  R.patter(c.lines.buyWhat || SHOP_WORDS.buyWhat);

  let preview = null;
  const showPreview = (it) => guard('preview', () => { if (preview && !preview.destroyed) preview.setContent(previewContent(it)); });

  const first = stockRows(c);
  if (!first.length) { await R.say('The shelves are bare today.{n}Come back Tuesday.'); await R.hush(); return; }
  // The list and the preview stay up for the whole visit, as they do in Dragon Quest: you buy, the purse counts
  // down beside them, and the cursor is still where you left it.
  const list = R.mkMenu({ id: 's-stock', left: 34, top: 150, minWidth: 500, maxWidth: 548, maxRows: 6, lineHeight: 44,
    origin: '0% 0%', className: 'dq-shop-list', title: c.name, items: first,
    onChange: (row) => { G.cursor = row && row.id; showPreview(row && row.data && row.data.item); } });
  preview = R.mkWin({ id: 's-preview', left: 570, top: 150, width: 676, origin: '0% 0%', destroyOnClose: false,
    className: 'dq-shop-preview', content: previewContent(first[0].data.item) });
  preview.open();
  // The Yes/No sits just above the message box on the right, where Dragon Quest puts it — which is where the
  // stat panel's bottom rows are. The panel rolls away while he asks and rolls back when you answer, so the
  // question is never asked on top of the numbers it is about.
  const panel = (on) => guard('panel', () => {
    if (!preview || preview.destroyed) return null;
    return on ? preview.open() : preview.close();
  }, null);
  const ask = async (opts) => {
    await panel(false);
    const yes = await R.yesNo(opts);
    if (R.alive) panel(true);
    return yes;
  };

  while (R.alive) {
    const pick = await list.choose();
    if (!R.alive) return;
    if (!pick) break;

    const it = pick.data.item;
    const price = pick.data.price;
    if (gold() < price) {
      guard('buzz', () => Sfx.play('buzzer', { vol: 0.6 }));
      await R.say(words(c.lines.poor, { N: price - gold(), ITEM: it.name }));
      await R.hush();
      continue;
    }
    if (bagFull() && !have(it.id)) { await R.say(words(SHOP_WORDS.full)); await R.hush(); continue; }

    await R.say(words(c.lines.ask || SHOP_WORDS.ask, { ITEM: it.name, N: price }), { wait: false });
    const yes = await ask({ yes: "I'll take it!", no: 'Maybe not' });
    if (!R.alive) return;
    if (!yes) { await R.hush(); continue; }

    await R.pay(price);
    bagAdd(it.id, 1);
    guard('got', () => Sfx.play('item_get', { vol: 0.8 }));
    await R.say(words(c.lines.buy, { N: price, ITEM: it.name }));
    if (!R.alive) return;
    await R.hush();
    if (it.slot) await equipOnBuy(R, it, { onWorn: () => refresh(pick.id), ask, panel });
    if (!R.alive) return;
    refresh(pick.id);
  }
  await R.closeWin(list);
  await R.closeWin(preview);
  preview = null;
  await R.hush();

  /** Prices do not change, but "you have N" and every ▲ / ▼ does the moment somebody puts the thing on. */
  function refresh(keepId) {
    guard('refresh', () => {
      const rows = stockRows(c);
      list.setItems(rows, keepId);
      const row = rows.find((r) => r.id === keepId) || rows[0];
      showPreview(row && row.data.item);
    });
  }
}

/** "Shall Bram put it on now?" — and the old one goes over the counter in part-exchange. */
async function equipOnBuy(R, it, { onWorn = null, ask = null, panel = null } = {}) {
  const prompt = typeof ask === 'function' ? ask : (o) => R.yesNo(o);
  const hide = typeof panel === 'function' ? panel : () => null;
  const who = family().filter((m) => fits(it, m));
  if (!who.length) { await R.say(words(SHOP_WORDS.equipNo, { NAME: 'Nobody here' })); await R.hush(); return; }
  let m = who[0];
  if (who.length > 1) {
    await hide(false);
    const pickWho = R.mkMenu({ id: 's-who', left: 570, top: 150, minWidth: 400, origin: '0% 0%', title: 'Who wears it?',
      items: who.map((x) => {
        const now = numbersOf(x)[keyStat(it)[0]];
        const next = numbersOf(x, { [it.slot]: it.id })[keyStat(it)[0]];
        const d = next - now;
        return { id: x.id, label: x.name, right: d > 0 ? '▲ +' + d : d < 0 ? '▼ ' + d : '—',
          color: d > 0 ? 'green' : d < 0 ? 'red' : 'grey' };
      }) });
    await R.say(words(SHOP_WORDS.wearIt, { NAME: 'somebody' }), { wait: false });
    const p = await pickWho.choose();
    await R.closeWin(pickWho);
    hide(true);
    if (!R.alive) return;
    if (!p) { await R.hush(); return; }
    m = who.find((x) => x.id === p.id) || who[0];
  } else {
    await R.say(words(SHOP_WORDS.wearIt, { NAME: m.name }), { wait: false });
    const yes = await prompt({ yes: 'Yes please', no: 'Not yet' });
    if (!R.alive) return;
    if (!yes) { await R.hush(); return; }
  }

  const old = m.equip && m.equip[it.slot];
  if (!m.equip) m.equip = {};
  m.equip[it.slot] = it.id;
  bagTake(it.id, 1);
  guard('confirm', () => Sfx.play('confirm'));
  if (typeof onWorn === 'function') guard('worn refresh', onWorn);      // the ▲ / ▼ must not still show the old kit
  await R.say(words(SHOP_WORDS.worn, { NAME: m.name, ITEM: it.name }));
  if (!R.alive) return;
  await R.hush();

  if (old && tradeInPrice(old) > 0) {
    const back = tradeInPrice(old);
    const oldIt = itemOf(old);
    await R.say(words(SHOP_WORDS.tradeIn, { N: back, ITEM: oldIt ? oldIt.name : 'old one' }), { wait: false });
    const yes = await prompt({ yes: 'Take it', no: 'I’ll keep it' });
    if (!R.alive) return;
    if (yes) { await R.take(back); }
    else bagAdd(old, 1);
    await R.hush();
  } else if (old) bagAdd(old, 1);
}

function sellRows() {
  const rows = [];
  for (const [id, n] of Object.entries(bag())) {
    const it = itemOf(id);
    if (!it || n <= 0) continue;
    const price = sellPrice(id, { outgrown: isOutgrown(id) });
    rows.push({ id, label: it.name, right: price > 0 ? String(price) : '—',
      note: n > 1 ? '×' + n : '', disabled: price <= 0, color: price <= 0 ? 'grey' : undefined,
      data: { item: it, price, n } });
  }
  return rows;
}

async function sellFlow(R) {
  const c = R.counter;
  G.stage = 'sell';
  const first = sellRows();
  if (!first.length) { await R.say(words(SHOP_WORDS.nothingToSell)); await R.hush(); return; }
  R.patter(c.lines.sellWhat || SHOP_WORDS.sellWhat);
  const list = R.mkMenu({ id: 's-sell', left: 34, top: 150, minWidth: 460, maxWidth: 520, maxRows: 6, lineHeight: 44,
    origin: '0% 0%', title: 'The bag', items: first,
    onChange: (row) => { G.cursor = row && row.id; },
    onDisabled: () => guard('buzz', () => Sfx.play('buzzer', { vol: 0.5 })) });
  while (R.alive) {
    const pick = await list.choose();
    if (!R.alive) return;
    if (!pick) break;
    const { item: it, price } = pick.data;
    if (price <= 0) { await R.say(words(SHOP_WORDS.wontBuy)); await R.hush(); continue; }
    await R.say(words(isOutgrown(pick.id) ? SHOP_WORDS.sellOld : SHOP_WORDS.sell, { N: price, ITEM: it.name }), { wait: false });
    const yes = await R.yesNo({ yes: 'Sold', no: 'On second thoughts' });
    if (!R.alive) return;
    if (!yes) { await R.hush(); continue; }
    bagTake(pick.id, 1);
    await R.take(price);
    await R.hush();
    const rows = sellRows();
    if (!rows.length) { await R.closeWin(list); await R.say(words(SHOP_WORDS.nothingToSell)); await R.hush(); return; }
    guard('sell refresh', () => list.setItems(rows, pick.id));
  }
  await R.closeWin(list);
  await R.hush();
}

/** SYSTEMS §5: gear two tiers below the family's best in that slot fetches 65% instead of 50%. */
function isOutgrown(id) {
  const it = itemOf(id);
  if (!it || !it.slot) return false;
  const mine = family().map((m) => itemOf(m.equip && m.equip[it.slot])).filter(Boolean);
  if (!mine.length) return false;
  const stat = it.slot === 'weapon' ? 'power' : 'def';
  const best = Math.max(...mine.map((x) => +x[stat] || 0));
  return (+it[stat] || 0) * 2 <= best;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE INN
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function runInn(R) {
  const c = R.counter;
  const heads = Math.max(1, party().filter((m) => m && m.kind !== 'monster').length);
  const price = innPrice({ level: partyLevel(), size: heads });
  R.openPurse();
  await R.say(words(c.lines.greet, { N: price }), { wait: false });
  if (!R.alive) return;
  const yes = await R.yesNo({ yes: 'Yes please', no: 'Not tonight' });
  if (!R.alive) return;
  if (!yes) { await R.say(words(c.lines.no || INN_WORDS.no)); await R.hush(); return; }
  if (gold() < price) {
    guard('buzz', () => Sfx.play('buzzer', { vol: 0.6 }));
    await R.say(words(c.lines.poor || INN_WORDS.poor, { N: price - gold() }));
    await R.hush();
    return;
  }
  await R.pay(price);
  await R.say(words(c.lines.yes || INN_WORDS.yes));
  if (!R.alive) return;
  await R.hush();
  G.stage = 'sleeping';
  await sleep(R);
  if (!R.alive) return;
  G.stage = 'morning';
  await R.say(words(c.lines.morning || INN_WORDS.morning));
  await R.hush();
}

/** The fade to night, the rest jingle, and everybody wakes mended. */
/** Everyone in a row, with their HP and MP — so a child watches the numbers fill up while the jingle plays. */
function bedsContent(asleep) {
  const rows = everyone().filter((m) => m && m.kind !== 'guest').map((m) => {
    const mx = numbersOf(m);
    const hp = Math.max(0, Math.round(m.hp ?? mx.maxHp));
    const mp = Math.max(0, Math.round(m.mp ?? mx.maxMp));
    const full = hp >= mx.maxHp && mp >= mx.maxMp;
    return h('div.dq-row', [
      h('span.dq-grow', m.name),
      h('span.dq-num' + (full ? '.dq-c-green' : ''), `${hp}/${mx.maxHp}`),
      UI.vdiv(),
      h('span.dq-num' + (full ? '.dq-c-green' : ''), `${mp}/${mx.maxMp}`),
    ]);
  });
  return h('div', [h('div.dq-row', [h('span.dq-grow.dq-c-grey', asleep ? 'Zzz…' : 'Up and about'),
    h('span.dq-num.dq-c-grey', 'HP'), UI.vdiv(), h('span.dq-num.dq-c-grey', 'MP')]), UI.divider(), ...rows]);
}

/** Fade one element's opacity on the SIM clock, so __DQ.freeze holds the night still for a screenshot. */
function fadeEl(el, from, to, dur) {
  el.style.opacity = String(from);
  return new Promise((res) => {
    let t = 0;
    const off = UI.onUpdate((dt) => {
      t += dt;
      const k = dur > 0 ? Math.min(1, t / dur) : 1;
      el.style.opacity = String(from + (to - from) * k);
      if (k >= 1) { off(); res(); }
    });
  });
}

async function sleep(R) {
  let veil = null, beds = null;
  Debug.busy('shop.night', true);
  try {
    veil = guard('veil', () => { const el = document.createElement('div'); el.className = 'dq-shop-night'; UI.layer.appendChild(el); return el; }, null);
    await R.hush();
    if (veil) await fadeEl(veil, 0, 1, 0.6);
    if (!R.alive) return;
    // The screen is dark, but it is never EMPTY: one little window glows in the middle with everyone in bed.
    beds = R.mkWin({ id: 's-beds', centerX: true, centerY: true, minWidth: 460, zIndex: 20, origin: '50% 50%',
      title: R.counter.name, content: bedsContent(true) });
    beds.open();
    guard('inn sfx', () => Sfx.play('inn_sleep', { vol: 0.85 }));
    // The classic rest jingle, fired and forgotten: if the instruments are still decoding, the night carries on.
    loadMusic().then((M) => guard('inn jingle', () => { if (M && M.stinger) M.stinger('inn'); })).catch(() => {});
    await UI.wait(2.0);
    guard('rest', () => Roster.heal());
    guard('clock', () => { const q = typeof window !== 'undefined' && window.__DQ; if (q && q.timeOfDay) q.timeOfDay(7.5); });
    Bus.emit('inn.rest', { counter: R.counter.id });
    guard('beds', () => { if (beds && !beds.destroyed) beds.setContent(bedsContent(false)); });
    guard('wake sfx', () => Sfx.play('heal', { vol: 0.55 }));
    await UI.wait(1.6);
    await R.closeWin(beds);
    beds = null;
    if (veil) await fadeEl(veil, 1, 0, 0.7);
  } finally {
    if (veil) guard('veil out', () => veil.remove());
    Debug.busy('shop.night', false);
  }
}

let musicPromise = null;
/**
 * The score, if anyone has wired one. main.js hands it over as ctx.Music; a bare demo page gets it lazily here.
 * NEVER awaited on the critical path — a slow instrument load must not hold a child inside the inn.
 */
function loadMusic() {
  if (CTX && typeof CTX.Music === 'function') return Promise.resolve(CTX.Music()).catch(() => null);
  if (!musicPromise) {
    musicPromise = (async () => {
      const [mm, am] = await Promise.all([import('../audio/music.js'), import('../audio/audio.js')]);
      const M = mm.Music || mm.default;
      const A = am.Audio;
      A.init();
      M.init({ ctx: A.ctx, output: A.bus('music'), reverbSend: A.reverbSend });
      return M;
    })().catch(() => null);
  }
  return musicPromise;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE BANK — gold in hundreds, and it survives being knocked over (SYSTEMS §5).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const Bank = { held: 0 };

async function runBank(R) {
  const c = R.counter;
  const unit = c.unit || 100;
  R.openPurse();
  R.patter(c.lines.greet || BANK_WORDS.greet);
  while (R.alive) {
    const held = R.mkWin({ id: 's-bank', left: 34, top: 250, minWidth: 320, origin: '0% 0%', title: 'Behind the counter',
      content: h('div.dq-row', [h('span.dq-grow', UI.label('G')), h('span.dq-num.dq-c-gold', String(Bank.held))]) });
    held.open();
    const cmd = R.mkMenu({ id: 's-bankcmd', left: 34, top: 30, minWidth: 280, origin: '0% 0%',
      items: [{ id: 'in', label: 'Put some in', disabled: gold() < unit },
        { id: 'out', label: 'Take some out', disabled: Bank.held < unit },
        { id: 'leave', label: 'Leave' }], cancelValue: { id: 'leave' } });
    const pick = await cmd.choose();
    await R.closeWin(cmd);
    await R.closeWin(held);
    if (!R.alive) return;
    if (!pick || pick.id === 'leave') break;
    const max = pick.id === 'in' ? Math.floor(gold() / unit) : Math.floor(Bank.held / unit);
    if (max <= 0) { await R.say(words(BANK_WORDS.none)); await R.hush(); continue; }
    const amounts = [];
    for (const n of [1, 2, 5, 10, 25, 50, 100]) if (n <= max) amounts.push({ id: String(n), label: String(n * unit) + ' gold', data: n });
    if (max > 1 && !amounts.some((a) => a.data === max)) amounts.push({ id: 'all', label: 'All of it (' + max * unit + ')', data: max });
    const howMany = R.mkMenu({ id: 's-bankamt', left: 34, top: 180, minWidth: 300, origin: '0% 0%', maxRows: 6,
      title: pick.id === 'in' ? 'How much in?' : 'How much out?', items: amounts });
    const amt = await howMany.choose();
    await R.closeWin(howMany);
    if (!R.alive) return;
    if (!amt) continue;
    const g = amt.data * unit;
    if (pick.id === 'in') { Bank.held += g; await R.pay(g); await R.say(words(BANK_WORDS.in, { N: g })); }
    else { Bank.held = Math.max(0, Bank.held - g); await R.take(g); await R.say(words(BANK_WORDS.out, { N: g })); }
    if (!R.alive) return;
    await R.hush();
  }
  await R.say(words(BANK_WORDS.bye));
  await R.hush();
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the scene
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function counterScene() {
  let R = null, gen = 0, done = null;
  return {
    opaque: false,
    updateBelow: true,
    enter(c = {}) {
      const g = ++gen;
      const counter = (c && c.counter) || Shops.get(c && c.id) || null;
      done = c && typeof c.done === 'function' ? c.done : null;
      if (!counter) { reportError('shop', new Error('no counter "' + (c && c.id) + '"')); Promise.resolve().then(() => { if (Scenes.top() === 'shop') Scenes.pop(); }); return; }
      installCss();
      R = counterRuntime(counter);
      G.open = true; G.id = counter.id; G.kind = counter.kind; G.stage = 'greeting'; G.cursor = null;
      G.last = { id: counter.id, kind: counter.kind, at: Date.now() };
      Debug.provide('shop', describe);
      Bus.emit('shop.open', { id: counter.id, kind: counter.kind });
      const run = counter.kind === 'inn' ? runInn : counter.kind === 'bank' ? runBank
        : counter.kind === 'church' ? (rt) => runChurch(rt, { words, gold, party: everyone, Roster }) : runShop;
      Promise.resolve()
        .then(() => run(R))
        .catch((e) => reportError('shop flow', e))
        .then(() => { if (g === gen && Scenes.top() === 'shop') Scenes.pop(); });
    },
    exit() {
      gen++;
      if (R) R.destroyAll();
      R = null;
      G.open = false; G.stage = 'closed'; G.id = null; G.kind = null; G.cursor = null;
      Debug.provide('shop', describe);
      Bus.emit('shop.close', {});
      const fn = done; done = null;
      if (typeof fn === 'function') guard('shop done', fn);
    },
    update() {},
    render() {},
    onInput(btn) {
      if (UI.input(btn)) return true;
      return true;                 // modal: the field under the counter never sees a button
    },
    get runtime() { return R; },
  };
}

function describe() {
  const c = G.id ? Shops.get(G.id) : null;
  const scene = Scenes.top && Scenes.top();
  const out = {
    open: !!G.open && scene === 'shop',
    id: G.id, kind: G.kind, stage: G.stage,
    gold: gold(), shownGold: Math.round(G.shown || gold()),
    keeper: c ? (c.keeper || c.priest || null) : null,
    name: c ? c.name : null,
    cursor: G.cursor,
    last: G.last,
  };
  if (c && c.kind === 'shop') {
    out.stock = c.stock.map((id) => ({ id, name: itemOf(id) ? itemOf(id).name : id, price: buyPrice(id),
      have: have(id), afford: gold() >= buyPrice(id) }));
  }
  if (c && c.kind === 'inn') {
    out.price = innPrice({ level: partyLevel(), size: Math.max(1, party().filter((m) => m && m.kind !== 'monster').length) });
  }
  if (c && c.kind === 'bank') out.held = Bank.held;
  out.party = family().map((m) => ({ id: m.id, name: m.name, lvl: m.lvl, hp: m.hp, mp: m.mp,
    atk: numbersOf(m).atk, def: numbersOf(m).def, equip: Object.assign({}, m.equip || {}) }));
  out.bag = Object.entries(bag()).map(([id, n]) => (itemOf(id) ? itemOf(id).name : id) + (n > 1 ? ' x' + n : ''));
  const inst = currentScene();
  out.windows = inst && inst.runtime ? inst.runtime.fitReport() : [];
  out.offscreen = out.windows.filter((w) => w.over > 0 || w.spill > 0).map((w) => w.id);
  return out;
}

let SCENE_INSTANCE = null;
function currentScene() { return SCENE_INSTANCE; }

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// public API + the plugin
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const Shop = {
  Shops, Economy, Bank,
  counterFor: (npcId) => Shops.forNpc(npcId),
  /** Open a counter. Resolves when it closes. */
  open(id) {
    const counter = typeof id === 'object' && id ? id : Shops.get(id);
    if (!counter) return Promise.resolve({ ok: false, reason: 'no counter "' + id + '"' });
    if (!Scenes.has('shop')) registerShop();
    if (Scenes.top() === 'shop') return Promise.resolve({ ok: false, reason: 'a counter is already open' });
    return new Promise((res) => {
      Scenes.push('shop', { counter, done: () => res({ ok: true, id: counter.id, gold: gold() }) });
    });
  },
  state: describe,
  prices: { buyPrice, sellPrice, tradeInPrice, innPrice },
};

let registered = false;
export function registerShop() {
  if (registered) return;
  registered = true;
  installCss();
  Scenes.register('shop', () => (SCENE_INSTANCE = counterScene()));
  Debug.provide('shop', describe);
  Debug.expose('shop', (id) => {
    if (id == null) return { counters: Shops.ids(), npcs: Shops.npcs() };
    Shop.open(id);
    return { ok: true, opening: typeof id === 'string' ? id : (id && id.id) };
  });
  /**
   * Walk the cursor to an entry and confirm — the same path a child's thumb takes. A keeper's line that is still
   * up is read first (confirm), exactly as a child would, so a critic can name an entry and get it.
   */
  Debug.expose('shopPick', async (idOrLabel, tries = 10) => {
    if (!describe().open) return { ok: false, reason: 'no counter open' };
    let seen = null;
    for (let k = 0; k < tries; k++) {
      const w = UI.focused;
      if (w && Array.isArray(w.items)) {
        seen = w.items.map((it) => it && it.id);
        const i = w.items.findIndex((it) => it && (it.id === idOrLabel || it.label === idOrLabel || String(it.id) === String(idOrLabel)));
        if (i >= 0) { w.setIndex(i); await UI.wait(0.08); UI.input('confirm'); return { ok: true, picked: idOrLabel, from: w.id }; }
        return { ok: false, reason: 'no entry "' + idOrLabel + '"', window: w.id, items: seen };
      }
      UI.input('confirm');                                  // a line of the keeper's is up: read it and carry on
      await UI.wait(0.16);
      if (!describe().open) return { ok: false, reason: 'the counter closed', items: seen };
    }
    return { ok: false, reason: 'nothing to pick', items: seen };
  });
  /**
   * Back out of n windows the way a thumb does: cancel closes a menu, but a line the keeper is still saying has
   * to be read first (a MessageBox treats cancel as "go on" — which is why a child can never be trapped here).
   */
  Debug.expose('shopBack', async (n = 1) => {
    for (let k = 0; k < n * 3 && describe().open; k++) {
      const w = UI.focused;
      UI.input(w && Array.isArray(w.items) ? 'cancel' : 'confirm');
      await UI.wait(0.2);
      if (w && Array.isArray(w.items)) n--;
      if (n <= 0) break;
    }
    return { ok: true, stage: G.stage, open: describe().open };
  });
  /** The blunt one: shut the counter now (a critic resetting between beats). Play never needs it. */
  Debug.expose('shopClose', () => {
    if (Scenes.top() === 'shop') Scenes.pop();
    return { ok: true, open: describe().open, scene: Scenes.top() };
  });
  Debug.expose('economy', () => Economy.nextBuyCheck());
  Debug.expose('economyAudit', () => Economy.audit());
}

/** Talk to the person behind a counter and the counter opens. No map file has to know about us. */
function hookTalk(Bs) {
  Bs.on('dialogue.end', (e) => {
    const npc = e && e.npc;
    if (!npc) return;
    const counter = Shops.forNpc(npc);
    if (!counter) return;
    if (Scenes.top() === 'shop') return;
    // A story scene or a fight is not shopping hours: the keeper's cutscene lines must not pop a till open.
    const stack = guard('stack', () => Scenes.stack ? Scenes.stack() : [], []) || [];
    const names = Array.isArray(stack) ? stack.map((x) => (typeof x === 'string' ? x : x && x.name)) : [];
    if (names.some((n) => n === 'cutscene' || n === 'battle' || n === 'gameover' || n === 'title')) return;
    // A microtask after the conversation's own exit, so the dialogue scene is fully off the stack first.
    Promise.resolve().then(() => guard('open after talk', () => { if (Scenes.top() !== 'shop') Shop.open(counter); }));
  });
}

export function install(ctx = {}) {
  CTX = ctx || {};
  registerShop();
  hookTalk(ctx && ctx.Bus ? ctx.Bus : Bus);
  // What the bank is holding has to survive a defeat AND a reload — that is the whole point of it (SYSTEMS §5).
  const Sv = (ctx && ctx.Save) || null;
  if (Sv && typeof Sv.register === 'function') {
    guard('save register', () => Sv.register('bank', {
      save: () => ({ held: Bank.held }),
      load: (v) => { Bank.held = Math.max(0, Math.round((v && Number(v.held)) || 0)); },
      reset: () => { Bank.held = 0; },
    }));
  }
  return Shop;
}

export default install;
