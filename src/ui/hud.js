/**
 * hud.js — the field HUD: the place card, the "where do I go" ribbon, the map, and the little prompt that tells
 * you what the thing in front of you is.                                          (P32, owner: src/ui/hud.js)
 *
 * Four quiet things, and nothing else — the world is the beautiful part, so the HUD keeps out of its way:
 *
 *   1. PLACE CARD.  Arrive anywhere and a DQ window slides down from the top with the name of the place and one
 *      warm line about it, holds for a breath, and goes. Never twice for the same place inside a minute.
 *   2. THE RIBBON.  One slim line, low on the left: what a six-year-old should do next, read off the story flags
 *      (CANON §4) and the map you are standing on. It comes in behind the place card and fades out; the Map
 *      button brings it back whenever you have forgotten.
 *   3. THE MAP.  Press Map (M / the touch ⛶) and a little painted plan of the place unrolls top right: the
 *      ground as it really is, the doors and lanes in gold, people as pale dots, treasure as gold dots, and you
 *      as a white arrow that turns with you. Press it again and it rolls up.
 *   4. THE PROMPT.  Stand in front of something you can use and a small pill says what it is and which button:
 *      "Z — Talk to Old Hob", "Z — Read the sign", "Z — Open it".
 *
 * All four hide themselves the moment a conversation, a menu, a shop or a battle is on top, and come back after.
 *
 * __DQ: state().hud = {shown, card, ribbon, map:{open, map, tiles}, prompt, hidden};
 *       __DQ.hudCard('Puddlewick'), __DQ.hudRibbon(), __DQ.minimap(true|false), __DQ.hudShow(false).
 *
 * PLUGIN: main.js imports this file once and calls install(ctx) — so it is live in /index.html with no
 * shared-file edit. It reaches the world only through ctx (Bus, Field, UI, Debug, Input).
 */
import { PAL, css } from '../art/palette.js';

const DESIGN = { w: 1280, h: 720 };
const CARD_HOLD = 3.4;          // seconds the place card stays up
const RIBBON_HOLD = 5.0;
const CARD_COOLDOWN = 45;       // seconds before the same place announces itself again

// ── words ───────────────────────────────────────────────────────────────────────────────────────────────────
/** One warm line per place (CANON §2 names; the map supplies the name itself). */
const PLACE_WORDS = {
  meadow: 'the lane runs through it',
  puddlewick: 'the village on the Beck',
  hollybank: 'home',
  puddlewick_inn: 'a bed, a fire and a landlord',
  saltmarrow: 'where the Beck meets the tide',
  contented_herring: 'the Pye family inn',
  aldenmoor: 'the Long Lane',
  cobwell_manor: 'in the Whispering Wood',
  gogglestone_caves: 'small, wet and full of echoes',
  coddleston: 'four green copper spires',
  grey_ruins: 'on Coddleston Moor',
  stone_garden: 'a walled garden of quiet people',
  bellhollow_abbey: 'the abbey with no bell',
  wagonwrights_rest: 'an inn with a wagon on the roof',
  quiet_quarry: 'where the Order puts people to work',
  whistling_caves: 'the wind knows the way',
  parchmouth: 'one palm tree and a deep well',
  port_pelican: 'cranes, gulls and a whale’s ribcage',
  quaggerton: 'a town on stilts',
  marbleford: 'white stone and good manners',
  ambergarde: 'amber roofs on a green headland',
  coldcomfort: 'cold outside, absurdly warm in',
  highfeather: 'the castle in the clouds',
  whistfell_abbey: 'grey, and much too quiet',
  quiet_deep: 'under everything',
};
const KIND_WORDS = { town: 'a town', interior: 'indoors', dungeon: 'mind your step', field: 'out in the open', world: 'the wide world' };

/**
 * The ribbon: the first line whose `when` is true wins. CANON §4 flag names. Nothing here ever names a place the
 * player has not heard said aloud (CANON §10 rule 6).
 */
const QUESTS = [
  { when: (f) => !f['ch1.awake'] && false, text: 'Get up, and find Papa his boots.' },
  { when: (f, m) => m === 'hollybank' && !f['ch1.left_home'], text: 'Take Papa his boots, then out to the lane.' },
  { when: (f, m) => m === 'puddlewick_inn', text: 'A bed costs money. Ask Papa.' },
  { when: (f, m) => (m === 'meadow' || m === 'aldenmoor') && !f['ch1.left_home'], text: 'Follow the lane to Puddlewick.' },
  { when: (f, m) => m === 'puddlewick' && !f['ch1.left_home'], text: 'Find Papa in the village, then climb into the wagon.' },
  { when: (f) => f['ch1.left_home'] && !f['ch1.met_willow'], text: 'Take the Long Lane to Saltmarrow.' },
  { when: (f) => f['ch1.dare_taken'] && !f['ch1.manor_cleared'], text: 'Cobwell Manor, after dark. Willow dared you.' },
  { when: (f) => f['ch1.manor_cleared'] && !f['ch1.bertie_taken'], text: 'Papa is wanted at Coddleston Castle.' },
  { when: (f) => f['ch2.start'] && !f['ch2.quarry_escape'], text: 'Do your chores. Watch for a way out.' },
  { when: (f) => f['ch3.awake'] && !f['ch3.sword_drawn'], text: 'The sword in the stone at Ambergarde Keep.' },
];
const DEFAULT_RIBBON = { meadow: 'Follow the lane to Puddlewick.', puddlewick: 'Have a look round. Everybody has something to say.' };

// ── ground colours for the little map ───────────────────────────────────────────────────────────────────────
const GROUND = {
  grass: PAL.grass.mid, dirt: PAL.dirt.base, stone: PAL.stone.cobbleA, wood: PAL.wood.mid,
  sand: PAL.sand.mid, snow: PAL.snow.mid, water: PAL.water.mid,
};
const SOLID_TINT = PAL.stone.dark;

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function install(ctx = {}) {
  const { Bus, Debug, UI, Field, Scenes, Input, reportError } = ctx;
  if (!Bus || !UI || !Field || !Debug) return;                    // nothing to hang it on: stay a harmless stub
  const oops = (where, e) => { try { reportError ? reportError(where, e) : console.warn(where, e); } catch (_) {} };

  installCss();

  const S = {
    card: null, cardT: 0, cardName: null, seen: new Map(),
    ribbon: null, ribbonT: 0, ribbonText: null,
    map: null, mapCanvas: null, mapBaked: null, mapBakedFor: null, mapOpen: false, mapT: 0,
    prompt: null, promptName: null, promptK: 0,
    hidden: false, forced: false, off: null, mapId: null, mapName: null,
  };

  // ── is the field the thing the player is looking at? ────────────────────────────────────────────────────
  const onField = () => { try { return Scenes && Scenes.top() === 'field'; } catch (_) { return false; } };
  const busy = () => { try { const t = Scenes && Scenes.top(); return !!t && t !== 'field'; } catch (_) { return false; } };
  const flags = () => { try { return window.__DQ.flag() || {}; } catch (_) { return {}; } };
  const confirmGlyph = () => {
    try { const t = Input && Input.describe && Input.describe().touch; if (t && t.visible) return '●'; } catch (_) {}
    return 'Z';
  };

  // ── 1. the place card ───────────────────────────────────────────────────────────────────────────────────
  function showCard(name, sub) {
    try {
      if (!name) return false;
      if (S.card && !S.card.destroyed) { S.card.destroy(); S.card = null; }
      let words = sub != null ? sub : (PLACE_WORDS[S.mapId] || KIND_WORDS[S.mapKind] || '');
      if (words && String(words).toLowerCase() === String(name).toLowerCase()) words = '';
      S.card = UI.window({
        id: 'hud-card', centerX: true, top: 34, origin: '50% 0%', pop: 'down', className: 'hud-card',
        minWidth: 340, destroyOnClose: true, openMs: 380, closeMs: 320,
        content: UI.h('div.hud-cardbody', [
          UI.h('div.hud-place', String(name)),
          words ? UI.h('div.hud-sub', String(words)) : null,
        ]),
      });
      S.cardName = String(name);
      S.cardT = CARD_HOLD;
      S.card.open();
      return true;
    } catch (e) { oops('hud place card', e); return false; }
  }

  // ── 2. the ribbon ───────────────────────────────────────────────────────────────────────────────────────
  function ribbonFor() {
    const f = flags();
    for (const q of QUESTS) { try { if (q.when(f, S.mapId)) return q.text; } catch (_) {} }
    return DEFAULT_RIBBON[S.mapId] || null;
  }
  function showRibbon(text, hold = RIBBON_HOLD) {
    try {
      const words = text != null ? text : ribbonFor();
      if (!words) return false;
      if (S.ribbon && !S.ribbon.destroyed) { S.ribbon.destroy(); S.ribbon = null; }
      S.ribbon = UI.window({
        id: 'hud-ribbon', left: 26, top: 26, origin: '0% 0%', pop: 'right', slim: true, className: 'hud-ribbon',
        destroyOnClose: true, openMs: 300, closeMs: 260,
        content: UI.h('div.hud-ribbonbody', [UI.h('span.hud-star', '✧'), UI.h('span.hud-quest', String(words))]),
      });
      S.ribbonText = String(words);
      S.ribbonT = hold;
      S.ribbon.open();
      return true;
    } catch (e) { oops('hud ribbon', e); return false; }
  }

  // ── 3. the little map ───────────────────────────────────────────────────────────────────────────────────
  const MAP_PX = 232;                                  // design px of the drawn plan

  function bakeMap(map) {
    const c = document.createElement('canvas');
    const n = Math.max(map.w, map.h);
    const cells = Math.min(160, Math.max(24, n));      // never more than 160 samples a side: this is a thumbnail
    c.width = cells; c.height = cells;
    const g = c.getContext('2d');
    g.clearRect(0, 0, cells, cells);
    const ox = map.origin ? map.origin[0] : 0, oz = map.origin ? map.origin[1] : 0;
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const x = ox + ((i + 0.5) / cells) * map.w;
        const z = oz + ((j + 0.5) / cells) * map.h;
        let col = GROUND.grass, solid = false;
        try { col = GROUND[map.groundAt(x, z)] || GROUND.grass; } catch (_) {}
        try { solid = !!map.solidAt(x, z); } catch (_) {}
        g.fillStyle = col;
        g.fillRect(i, j, 1, 1);
        if (solid) g.fillStyle = css(SOLID_TINT, 0.55);
        g.fillRect(i, j, 1, 1);
      }
    }
    return { canvas: c, cells, w: map.w, h: map.h, ox, oz };
  }

  function drawMap() {
    const canvas = S.mapCanvas;
    const world = Field.world && Field.world();
    if (!canvas || !world || !world.map) return;
    const map = world.map;
    if (S.mapBakedFor !== map.id) {
      try { S.mapBaked = bakeMap(map); S.mapBakedFor = map.id; }
      catch (e) { oops('hud minimap bake', e); S.mapBaked = null; S.mapBakedFor = map.id; }
    }
    const b = S.mapBaked;
    if (!b) return;
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    g.drawImage(b.canvas, 0, 0, W, H);
    g.imageSmoothingEnabled = true;
    const px = (x) => ((x - b.ox) / b.w) * W;
    const pz = (z) => ((z - b.oz) / b.h) * H;
    const dot = (x, z, r, fill, ring) => {
      g.beginPath(); g.arc(px(x), pz(z), r, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill();
      if (ring) { g.lineWidth = 1.2; g.strokeStyle = ring; g.stroke(); }
    };
    // doors and lanes out
    for (const e of (map.exits || [])) {
      const w = Math.max(3, ((e.w ?? 1) / b.w) * W), h = Math.max(3, ((e.h ?? 1) / b.h) * H);
      g.fillStyle = css(PAL.ui.gold, 0.92);
      g.fillRect(px(e.x) - w / 2, pz(e.z) - h / 2, w, h);
    }
    // treasure, then people
    for (const c of (map.chests || [])) dot(c.x, c.z, 2.6, css(PAL.ui.gold, 0.95), css(PAL.ui.shadow, 0.6));
    for (const n of (map.npcs || [])) dot(n.x, n.z, 2.2, css(PAL.ui.textDim, 0.85), css(PAL.ui.shadow, 0.45));
    // you
    let p = null;
    try { p = world.player && world.player.p; } catch (_) { p = null; }
    if (p) {
      const x = px(p.x), y = pz(p.z), a = p.yaw || 0;
      g.save();
      g.translate(x, y);
      g.rotate(-a);                                     // yaw 0 faces -z, which is up on the plan
      g.beginPath();
      g.moveTo(0, -7.5); g.lineTo(5.2, 6); g.lineTo(0, 3); g.lineTo(-5.2, 6); g.closePath();
      g.fillStyle = PAL.ui.text;
      g.fill();
      g.lineWidth = 1.8; g.strokeStyle = css(PAL.ui.shadow, 0.75); g.stroke();
      g.restore();
    }
  }

  function openMap(on) {
    const want = on === undefined ? !S.mapOpen : !!on;
    if (want === S.mapOpen && S.map && !S.map.destroyed) return S.mapOpen;
    S.mapOpen = want;
    try {
      if (!want) { if (S.map && !S.map.destroyed) { S.map.close(); S.map = null; S.mapCanvas = null; } return false; }
      const world = Field.world && Field.world();
      const title = (world && world.map && world.map.name) || S.mapName || 'Where you are';
      const canvas = document.createElement('canvas');
      canvas.className = 'hud-mapcanvas';
      canvas.width = 464; canvas.height = 464;          // 2x the design size, for a crisp plan
      S.mapCanvas = canvas;
      S.map = UI.window({
        id: 'hud-map', right: 26, top: 26, origin: '100% 0%', pop: 'left', title, className: 'hud-map',
        destroyOnClose: true, openMs: 300, closeMs: 240,
        content: UI.h('div.hud-mapbox', canvas),
      });
      S.map.open();
      drawMap();
      try { ctx.Sfx && ctx.Sfx.play('map_open', { vol: 0.6 }); } catch (_) {}
      showRibbon(undefined, RIBBON_HOLD);
      return true;
    } catch (e) { oops('hud minimap', e); S.mapOpen = false; return false; }
  }

  // ── 4. the prompt ───────────────────────────────────────────────────────────────────────────────────────
  function verbFor(map, t) {
    if (!t) return null;
    const name = t.name || null;
    try { if (map.npcs && map.npcs.includes(t)) return name ? `Talk to ${name}` : 'Say hello'; } catch (_) {}
    try { if (map.chests && map.chests.includes(t)) return 'Open it'; } catch (_) {}
    const type = String(t.type || t.kind || '').toLowerCase();
    if (/sign/.test(type)) return 'Read the sign';
    if (/door|stair|gate/.test(type)) return 'Go in';
    if (/pot|barrel|drawer|wardrobe|shelf|sack|crate|basket|urn/.test(type)) return 'Search it';
    if (/well/.test(type)) return 'Look down the well';
    if (/bed/.test(type)) return 'Have a lie down';
    if (name) return `Look at the ${name}`;
    return 'Have a look';
  }

  function setPrompt(text) {
    if (text === S.promptName) return;
    S.promptName = text;
    try {
      if (!text) { if (S.prompt && !S.prompt.destroyed) { S.prompt.close(); S.prompt = null; } return; }
      if (!S.prompt || S.prompt.destroyed) {
        S.prompt = UI.window({
          id: 'hud-prompt', centerX: true, bottom: 26, origin: '50% 100%', pop: 'up', slim: true,
          className: 'hud-prompt', destroyOnClose: true, openMs: 220, closeMs: 180, content: ' ',
        });
        S.prompt.open();
      }
      S.prompt.setContent(UI.h('div.hud-promptbody', [
        UI.h('span.hud-key', confirmGlyph()), UI.h('span.hud-verb', text),
      ]));
    } catch (e) { oops('hud prompt', e); }
  }

  // ── show / hide as a set ────────────────────────────────────────────────────────────────────────────────
  function hideAll(why) {
    S.hidden = true;
    void why;
    for (const k of ['card', 'ribbon', 'map', 'prompt']) {
      const w = S[k];
      if (w && !w.destroyed) { try { w.close(); } catch (_) {} }
      if (k !== 'map') S[k] = null;
    }
    if (S.map && !S.map.destroyed) { S.map = null; S.mapCanvas = null; }
    S.promptName = null;
    S.cardT = 0; S.ribbonT = 0;
  }
  function unhide() {
    S.hidden = false;
    if (S.mapOpen) { S.mapOpen = false; openMap(true); }
  }

  // ── the tick ────────────────────────────────────────────────────────────────────────────────────────────
  function tick(dt) {
    try {
      if (S.forced) return;
      const away = busy() || !onField();
      if (away) { if (!S.hidden) hideAll('scene'); return; }
      if (S.hidden) unhide();

      if (S.cardT > 0) { S.cardT -= dt; if (S.cardT <= 0 && S.card && !S.card.destroyed) { S.card.close(); S.card = null; } }
      if (S.ribbonT > 0) { S.ribbonT -= dt; if (S.ribbonT <= 0 && S.ribbon && !S.ribbon.destroyed) { S.ribbon.close(); S.ribbon = null; } }

      const world = Field.world && Field.world();
      if (S.mapOpen && S.map && !S.map.destroyed && world) {
        S.mapT += dt;
        if (S.mapT > 0.08) { S.mapT = 0; drawMap(); }
      }
      // the prompt: only when nothing else is asking for attention
      let verb = null;
      if (world && world.map && world.player && world.player.near && S.cardT <= 0) {
        verb = verbFor(world.map, world.player.near.target);
      }
      setPrompt(verb);
    } catch (e) { oops('hud tick', e); }
  }

  // ── wiring ──────────────────────────────────────────────────────────────────────────────────────────────
  try { S.off = UI.onUpdate(tick); } catch (e) { oops('hud update', e); }

  Bus.on('map.enter', (m) => {
    try {
      if (!m) return;
      S.mapId = m.id; S.mapName = m.name; S.mapKind = m.kind;
      S.mapBakedFor = null;                             // a new plan for a new place
      if (S.mapOpen && S.map && !S.map.destroyed) { S.map.setTitle(m.name || ''); drawMap(); }
      const last = S.seen.get(m.id) || -1e9;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      if (now - last < CARD_COOLDOWN) { S.seen.set(m.id, now); return; }
      S.seen.set(m.id, now);
      showCard(m.name || m.id);
      const words = ribbonFor();
      if (words) { S.ribbonText = words; setTimeout(() => { try { if (!S.hidden) showRibbon(words); } catch (_) {} }, 900); }
    } catch (e) { oops('hud map.enter', e); }
  });
  Bus.on('flag.set', () => {
    try {
      const words = ribbonFor();
      if (words && words !== S.ribbonText && !S.hidden && onField()) showRibbon(words);
    } catch (e) { oops('hud flag.set', e); }
  });
  for (const ev of ['dialogue.start', 'menu.open', 'battle.start', 'shop.open']) Bus.on(ev, () => { if (!S.forced) hideAll(ev); });

  // the Map button, wherever it comes from (keyboard M, the pad, the touch button)
  try {
    Field.on('update', () => {
      try {
        if (!Input || !Input.pressed || !onField() || S.forced) return;
        if (Input.pressed('map')) openMap();
      } catch (_) {}
    });
  } catch (e) { oops('hud map button', e); }

  // ── __DQ ────────────────────────────────────────────────────────────────────────────────────────────────
  Debug.provide('hud', () => ({
    shown: !S.hidden && !S.forced,
    card: S.card && !S.card.destroyed && S.card.state !== 'closed' ? { name: S.cardName, left: Math.max(0, +S.cardT.toFixed(2)) } : null,
    ribbon: S.ribbon && !S.ribbon.destroyed && S.ribbon.state !== 'closed' ? { text: S.ribbonText, left: Math.max(0, +S.ribbonT.toFixed(2)) } : null,
    nextStep: S.ribbonText,
    map: { open: !!(S.mapOpen && S.map && !S.map.destroyed), of: S.mapBakedFor, tiles: S.mapBaked ? S.mapBaked.cells : 0 },
    prompt: S.promptName,
    hidden: S.hidden, forcedOff: S.forced,
    places: Array.from(S.seen.keys()),
  }));
  Debug.expose('hudCard', (name, sub) => showCard(name || S.mapName, sub));
  Debug.expose('hudRibbon', (text) => showRibbon(text));
  Debug.expose('minimap', (on) => openMap(on));
  Debug.expose('hudShow', (on) => {
    S.forced = on === false;
    if (S.forced) hideAll('asked');
    return !S.forced;
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const CSS = `
.hud-card{padding: calc(16 * var(--u)) calc(40 * var(--u)) calc(18 * var(--u)); text-align:center}
.hud-place{font-size: calc(40 * var(--u)); line-height:1.1; color: var(--dq-ink); letter-spacing:.04em}
.hud-sub{margin-top: calc(3 * var(--u)); font-size: calc(21 * var(--u)); color: var(--dq-title-ink); letter-spacing:.06em}
.hud-ribbon{max-width: calc(620 * var(--u)); opacity:.94}
.hud-ribbonbody{display:flex; align-items:baseline; gap: calc(12 * var(--u))}
.hud-star{color: var(--dq-gold); font-size: calc(22 * var(--u))}
.hud-quest{font-size: calc(24 * var(--u)); color: var(--dq-ink); white-space: normal}
.hud-map{padding: calc(14 * var(--u))}
.hud-mapbox{position:relative; width: calc(232 * var(--u)); height: calc(232 * var(--u)); border-radius: calc(8 * var(--u));
  overflow:hidden; box-shadow: inset 0 0 0 calc(1.6 * var(--u)) var(--dq-hair)}
.hud-mapcanvas{width:100%; height:100%; display:block}
.hud-prompt{opacity:.96; padding: calc(9 * var(--u)) calc(20 * var(--u))}
.hud-promptbody{display:flex; align-items:center; gap: calc(12 * var(--u))}
.hud-key{display:inline-flex; align-items:center; justify-content:center; min-width: calc(30 * var(--u));
  height: calc(30 * var(--u)); padding: 0 calc(7 * var(--u)); border-radius: calc(7 * var(--u));
  font-size: calc(19 * var(--u)); color: var(--dq-win-bot); background: var(--dq-edge);
  box-shadow: 0 calc(2 * var(--u)) 0 var(--dq-edge-low); text-shadow:none}
.hud-verb{font-size: calc(24 * var(--u)); color: var(--dq-ink)}
`;
let styled = false;
function installCss() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  try {
    const el = document.createElement('style');
    el.id = 'dq-hud-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  } catch (_) { /* a page with no head is no place for a HUD */ }
}

export default install;
