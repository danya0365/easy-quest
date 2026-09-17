/**
 * menu.js — the field command menu: press Menu (Tab / C / Start) in the field and the Dragon Quest command window
 * unrolls, with the party and gold windows beside it.                                     (P13 seam, first cut)
 *
 *   import { registerFieldMenu } from './ui/menu.js';
 *   registerFieldMenu();                      // Scenes.register('menu', ...)
 *   Scenes.push('menu', { talk(), search(), near })   // the field pushes it; talk/search run after the menu closes
 *
 * Talk     closes the menu and talks to whatever the hero faces (ctx.talk)
 * Spells   a gentle "not yet" line
 * Status   Bram's numbers from src/data/growth.js (the Steady Oak at the party's level)
 * Items    the bag, with Use / Give / Drop on each item
 * Equip    what he is wearing
 * Search   closes the menu and searches the ground at his feet (ctx.search)
 * Cancel backs out one window at a time; Menu again closes everything. Nothing traps you.
 *
 * __DQ.state().menu = {open, stage, windows}
 *
 * PLUGIN: main.js imports this file once and calls install(ctx) (which registers the 'menu' scene). P13 fills this
 * file (Spells, Items, Equip, Status, Party, Settings) and it is live in the real game with no shared-file edit.
 */
import { UI } from './window.js';
import { Text } from './text.js';
import { Scenes } from '../engine/states.js';
import { Debug, reportError } from '../engine/debug.js';
import { Bus } from '../engine/events.js';
import { personalityAt } from '../data/growth.js';

const HERO = 'Bram';
const LINES = {
  spells: `${HERO} doesn’t know any spells yet.{p}He has been practising the face for it, though.`,
  equip: `${HERO} is wearing everything he owns,{n}and most of it is {green}cloak{/green}.`,
};
const BAG = [
  { id: 'herb', label: 'Herb', right: '×2',
    use: `${HERO} sniffs the Herb.{n}He is already {green}in the pink{/green}, so it goes back in the bag.`,
    give: `${HERO} offers the Herb to a passing bee.{n}The bee is honoured, but has its own.` },
  { id: 'bread', label: 'Crusty Roll', right: '×1',
    use: `${HERO} saves the Crusty Roll for later.{n}Later is a very important time for rolls.`,
    give: 'Nobody here wants it. Their loss.' },
  { id: 'papas_boots', label: 'Papa’s Boots', color: 'gold', key: true,
    use: `${HERO} hugs Papa’s boots.{n}They smell of the road, and of Papa.`,
    give: 'These are for Papa.{n}Nobody else’s feet will do.' },
  '-',
  { id: 'stick', label: 'Stout Stick', right: 'E', use: `${HERO} gives the Stout Stick a practice swish.{wait:250} Very heroic.`, give: 'The stick stays. It is a good stick.' },
  { id: 'cloak', label: 'Travelling Cloak', right: 'E', use: `The cloak is a bit big.{n}${HERO} will grow into it, says everybody.`, give: 'It is far too cosy to give away.' },
];
const IDS = ['fieldcmd', 'fieldparty', 'fieldgold', 'fieldbag', 'fielduse', 'fieldstatus'];

function heroStats(lvl = 1) {
  try { return personalityAt('steady_oak', lvl); } catch (e) { reportError('menu stats', e); return { hp: 20, mp: 0, might: 10, nimble: 8, resil: 9, wis: 4, luck: 8 }; }
}
function goldNow() {
  try { const s = window.__DQ && window.__DQ.state && window.__DQ.state(); return s && Number.isFinite(+s.gold) ? +s.gold : 0; } catch (_) { return 0; }
}

function menuScene() {
  let gen = 0, ctx = {}, stage = 'closed', after = null, box = null;
  const alive = (g) => g === gen;
  const lvl = 1, st = heroStats(lvl);

  const partyContent = () => UI.cols([[
    UI.h('div.dq-pname', HERO),
    UI.row(UI.label('H'), String(st.hp)),
    UI.row(UI.label('M'), String(st.mp)),
    UI.row(UI.label('Lv'), String(lvl)),
  ]]);
  const goldContent = () => UI.row(UI.label('G'), String(goldNow()));

  async function say(g, markup) {
    try {
      if (!box) box = Text.box();
      await box.say(markup, { voice: 'narrator' });
      if (!alive(g)) return false;
      await box.close();
    } catch (e) { reportError('menu say', e); }
    return alive(g);
  }

  async function closeAll(instant = false) {
    const ws = IDS.map(id => UI.get(id)).filter(w => w && !w.destroyed);
    try { await Promise.all(ws.map(w => w.close(instant ? { instant: true } : undefined))); } catch (e) { reportError('menu close', e); }
  }

  function leave(then = null) {
    if (stage === 'leaving') return;
    stage = 'leaving';
    after = then;
    gen++;
    closeAll().then(() => { if (Scenes.top() === 'menu') Scenes.pop(); });
  }

  async function flowItems(g) {
    stage = 'items';
    const bag = UI.menu({ id: 'fieldbag', title: HERO, left: 300, top: 150, width: 430, maxRows: 5, origin: '0% 0%', destroyOnClose: true, items: BAG });
    for (;;) {
      const it = await bag.choose();
      if (!alive(g)) return false;
      if (!it) { stage = 'command'; return true; }
      const src = BAG.find(b => b && b.id === it.id) || {};
      stage = 'item-use';
      const use = UI.menu({ id: 'fielduse', left: 752, top: 214, slim: true, origin: '0% 0%', destroyOnClose: true,
        items: ['Use', 'Give', { label: 'Drop', disabled: !!src.key }] });
      const act = await use.choose();
      if (!alive(g)) return false;
      stage = 'items';
      if (!act) continue;
      await use.close(); await bag.close();
      await Promise.all(['fieldcmd', 'fieldparty', 'fieldgold'].map(id => UI.get(id) && UI.get(id).close()));
      if (!alive(g)) return false;
      const line = act.id === 'use' ? src.use : act.id === 'give' ? src.give : `${HERO} puts the ${it.label} down,{wait:300} and then picks it up again. Better safe.`;
      return say(g, line);
    }
  }

  async function flowStatus(g) {
    stage = 'status';
    const stat = (k, v) => UI.row(UI.label(k), String(v));
    const win = UI.window({
      id: 'fieldstatus', title: 'Status', left: 300, top: 150, origin: '0% 0%', destroyOnClose: true,
      content: UI.cols([[UI.h('div.dq-pname', HERO), stat('Level', lvl), stat('HP', `${st.hp}/${st.hp}`), stat('MP', `${st.mp}/${st.mp}`), UI.divider(),
        stat('Might', st.might), stat('Nimbleness', st.nimble), stat('Resilience', st.resil), stat('Wisdom', st.wis)]]),
    });
    await win.untilButton(['confirm', 'cancel']);
    if (!alive(g)) return false;
    await win.close();
    stage = 'command';
    return alive(g);
  }

  async function flow(g) {
    let initial = 'talk';
    for (;;) {
      stage = 'command';
      const cmd = UI.get('fieldcmd') && !UI.get('fieldcmd').destroyed ? UI.get('fieldcmd') : UI.menu({
        id: 'fieldcmd', left: 34, top: 30, columns: 2, colGap: 30, origin: '0% 0%',
        items: ['Talk', 'Spells', 'Status', 'Items', 'Equip', 'Search'], initial,
      });
      const pw = UI.get('fieldparty') && !UI.get('fieldparty').destroyed ? UI.get('fieldparty') : UI.window({ id: 'fieldparty', left: 468, top: 30, slim: true, origin: '50% 0%', content: partyContent(), className: 'dq-party' });
      const gw = UI.get('fieldgold') && !UI.get('fieldgold').destroyed ? UI.get('fieldgold') : UI.window({ id: 'fieldgold', left: 34, top: 222, width: 208, slim: true, origin: '0% 0%', content: goldContent() });
      cmd.open(); await UI.wait(0.05); if (!alive(g)) return;
      pw.open(); await UI.wait(0.04); if (!alive(g)) return;
      gw.open();
      const it = await cmd.choose();
      if (!alive(g)) return;
      if (!it) { leave(); return; }
      initial = it.id;
      if (it.id === 'talk') { leave(ctx.talk); return; }
      if (it.id === 'search') { leave(ctx.search); return; }
      if (it.id === 'items') { if (!(await flowItems(g))) return; continue; }
      if (it.id === 'status') { if (!(await flowStatus(g))) return; continue; }
      await Promise.all(['fieldcmd', 'fieldparty', 'fieldgold'].map(id => UI.get(id) && UI.get(id).close()));
      if (!alive(g)) return;
      stage = it.id;
      if (!(await say(g, LINES[it.id] || '…'))) return;
    }
  }

  const describe = () => ({ open: stage !== 'closed', stage, windows: IDS.filter(id => { const w = UI.get(id); return w && !w.destroyed && w.state !== 'closed'; }) });

  return {
    opaque: false,
    updateBelow: true,
    enter(c = {}) {
      ctx = c || {}; after = null;
      const g = ++gen;
      Debug.provide('menu', describe);
      Bus.emit('menu.open', {});
      flow(g).catch((e) => reportError('menu flow', e));
    },
    exit() {
      gen++;
      stage = 'closed';
      for (const id of IDS) { const w = UI.get(id); if (w && !w.destroyed) { try { w.destroy(); } catch (e) { reportError('menu destroy', e); } } }
      try { if (box && box.state !== 'closed') box.close({ instant: true }); } catch (e) { reportError('menu box', e); }
      Debug.provide('menu', () => ({ open: false, stage: 'closed', windows: [] }));
      Bus.emit('menu.close', {});
      const fn = after; after = null;
      if (typeof fn === 'function') { try { fn(); } catch (e) { reportError('menu after', e); } }
    },
    update() {},
    render() {},
    onInput(btn) {
      if (btn === 'menu') { leave(); return true; }
      if (UI.input(btn)) return true;
      return true;   // modal: the field under the menu never sees a button
    },
  };
}

let registered = false;
export function registerFieldMenu() {
  if (registered) return;
  registered = true;
  Scenes.register('menu', menuScene);
  Debug.provide('menu', () => ({ open: false, stage: 'closed', windows: [] }));
}

/** Plugin entry (main.js): register the field menu scene. ctx is the plugin context (see main.js). */
export function install(ctx = {}) { void ctx; registerFieldMenu(); }

export default registerFieldMenu;
