/**
 * hud.js — the field HUD: the place card, the "where do I go" ribbon, the map, and the little prompt that tells
 * you what the thing in front of you is.                                          (P32, owner: src/ui/hud.js)
 *
 * Four quiet things, and nothing else — the world is the beautiful part, so the HUD keeps out of its way:
 *
 *   1. PLACE CARD.  Arrive anywhere and a DQ window slides down from the top with the name of the place and one
 *      warm line about it, holds for a breath, and goes. Never twice for the same place inside a minute.
 *   2. THE RIBBON.  One slim line, low on the left: what a six-year-old should do next, taken from the ONE
 *      authority on that — P26's src/story/quests.js at __DQ.state().quest.hint, one entry per CANON §4 beat —
 *      with a small table of its own only as the fallback for a build with no story module. It comes in behind
 *      the place card and fades out; the Map button brings it back whenever you have forgotten, and it comes
 *      back by itself the moment the story turns ('quest.change').
 *   3. THE MAP.  Press Map (M / the touch ⛶) and a little painted plan of the place unrolls top right: the
 *      ground as it really is with the trees and walls in shade, the ways out as gold gates, people as pale
 *      blue dots, treasure as gold ones, an N in the corner, and YOU as a big white arrow on a soft halo that
 *      turns as you turn. Two small lines underneath say which mark is which. Press it again and it rolls up.
 *      Every mark is authored in DESIGN px and multiplied once by K (the canvas is drawn at 2x): get that wrong
 *      and the arrow comes out smaller than a full stop, which is exactly what it used to do.
 *   4. THE PROMPT.  Stand in front of something you can use and a small pill says what it is and which button:
 *      "Z — Talk to Old Hob", "Z — Read the sign", "Z — Open it".
 *
 * All four hide themselves the moment a conversation, a menu, a shop or a battle is on top, and come back after.
 * ONE THING AT A TIME along the top of the screen: showing a card dismisses the ribbon and showing a ribbon
 * dismisses the card, so the two can never land on top of each other.
 *
 * __DQ: state().hud = {shown, card, ribbon, nextStep, nextStepFrom, prompt, hidden,
 *                       map:{open, of, tiles, px, marks:{you, folk, treasure, ways}}};   nextStepFrom says whether
 *       the sentence came from the story ('story (beat)') or from the fallback table, so a critic can prove it;
 *       __DQ.hudCard('Puddlewick'), __DQ.hudRibbon(), __DQ.minimap(true|false), __DQ.hudShow(false).
 *
 * PLUGIN: main.js imports this file once and calls install(ctx) — so it is live in /index.html with no
 * shared-file edit. It reaches the world only through ctx (Bus, Field, UI, Debug, Input).
 */
import { PAL, css } from '../art/palette.js';

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
/** Mix two palette colours. Nothing here invents a hex: it only blends ones palette.js already published. */
function mix(a, b, t) {
  const rd = (s) => [1, 3, 5].map(i => parseInt(String(s).slice(i, i + 2), 16));
  const A = rd(a), B = rd(b);
  return '#' + A.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (B[i] - v) * t))).toString(16).padStart(2, '0')).join('');
}
// The plan is painted, not photographed: every ground colour is lifted a little towards the window's own light
// so the valley reads bright and friendly against the deep blue window, the way a picture map in a book does.
const LIFT = 0.16;
const GROUND = {
  grass: mix(PAL.grass.mid, PAL.ui.text, LIFT), dirt: mix(PAL.dirt.base, PAL.ui.text, LIFT),
  stone: mix(PAL.stone.cobbleA, PAL.ui.text, LIFT), wood: mix(PAL.wood.mid, PAL.ui.text, LIFT),
  sand: mix(PAL.sand.mid, PAL.ui.text, LIFT), snow: PAL.snow.mid, water: mix(PAL.water.mid, PAL.ui.text, LIFT * 0.6),
};
// Where you cannot walk is not a different colour — it is the same ground in shade, the way a tree or a wall
// falls on a painted map. Mixed once per ground colour and kept.
const SHADED = new Map();
const shade = (col) => {
  let c = SHADED.get(col);
  if (!c) { c = mix(col, PAL.ui.shadow, 0.38); SHADED.set(col, c); }
  return c;
};

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
    prompt: null, promptName: null, questFrom: null,
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
      // one thing at a time along the top of the screen: a card never lands on top of a ribbon
      if (S.ribbon && !S.ribbon.destroyed) { try { S.ribbon.close(); } catch (_) {} S.ribbon = null; S.ribbonT = 0; }
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
  /**
   * What a child should do next. P26 publishes the ONE authority — src/story/quests.js, one entry per CANON §4
   * beat, live at __DQ.state().quest.hint — so the sentence on the ribbon is the beat the story is actually on.
   * The little table below is only the fallback for a build with no story module (the demo, an isolated page).
   */
  function ribbonFor() {
    try {
      const q = window.__DQ && window.__DQ.state && window.__DQ.state().quest;
      if (q && q.hint) { S.questFrom = 'story (' + (q.beat || q.id || 'beat') + ')'; return String(q.hint); }
    } catch (_) { /* no story module in this build: fall back to our own table */ }
    const f = flags();
    for (const q of QUESTS) { try { if (q.when(f, S.mapId)) { S.questFrom = 'hud table'; return q.text; } } catch (_) {} }
    S.questFrom = DEFAULT_RIBBON[S.mapId] ? 'hud default' : null;
    return DEFAULT_RIBBON[S.mapId] || null;
  }
  function showRibbon(text, hold = RIBBON_HOLD) {
    try {
      const words = text != null ? text : ribbonFor();
      if (!words) return false;
      if (S.ribbon && !S.ribbon.destroyed) { S.ribbon.destroy(); S.ribbon = null; }
      // ...and a ribbon never lands on top of a card: showing one dismisses the other
      if (S.card && !S.card.destroyed) { try { S.card.close(); } catch (_) {} S.card = null; S.cardT = 0; }
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
  //
  // The plan is 248 DESIGN px wide and the canvas behind it is 2x that, so every mark has to be drawn in
  // canvas pixels = design px * K. Getting that wrong is what made the first version unreadable: an arrow
  // authored at 15 px came out 7 design px tall — smaller than a full stop — and the people were 1 px specks.
  // Everything below is authored in DESIGN px and multiplied by K exactly once, in `mark()`.
  const MAP_PX = 248;                                  // design px of the drawn plan
  const YOU_PX = 15;                                   // the white arrow: half a centimetre on a laptop

  function bakeMap(map) {
    const c = document.createElement('canvas');
    const n = Math.max(map.w, map.h);
    // enough samples that a lane one tile wide still reads as a lane, and never more than the plan can show
    const cells = Math.min(208, Math.max(64, Math.round(n * 1.6)));
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
        g.fillStyle = solid ? shade(col) : col;
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
    const K = W / MAP_PX;                               // canvas px per DESIGN px — every mark is sized by this
    S.mapK = K;
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;                     // a painted plan, not a spreadsheet
    g.drawImage(b.canvas, 0, 0, W, H);
    const px = (x) => ((x - b.ox) / b.w) * W;
    const pz = (z) => ((z - b.oz) / b.h) * H;
    const ink = css(PAL.ui.shadow, 0.85);
    /** A round mark, authored in design px. */
    const mark = (x, z, rPx, fill, ringPx = 1.6) => {
      const r = rPx * K;
      g.beginPath(); g.arc(px(x), pz(z), r, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill();
      g.lineWidth = ringPx * K; g.strokeStyle = ink; g.stroke();
    };

    // ways out: a gold gate with an ink edge, never smaller than a child can aim at
    for (const e of (map.exits || [])) {
      const w = Math.max(9 * K, ((e.w ?? 1) / b.w) * W), hh = Math.max(9 * K, ((e.h ?? 1) / b.h) * H);
      const x0 = px(e.x) - w / 2, y0 = pz(e.z) - hh / 2;
      g.fillStyle = css(PAL.ui.gold, 0.96);
      g.fillRect(x0, y0, w, hh);
      g.lineWidth = 1.8 * K; g.strokeStyle = ink;
      g.strokeRect(x0, y0, w, hh);
    }
    // treasure (gold, with a bright heart) and people (cream)
    for (const c of (map.chests || [])) {
      if (c && c.taken) continue;
      mark(c.x, c.z, 4.2, css(PAL.ui.gold, 0.98), 1.8);
      g.beginPath(); g.arc(px(c.x), pz(c.z), 1.5 * K, 0, Math.PI * 2);
      g.fillStyle = css(PAL.ui.text, 0.9); g.fill();
    }
    // people are pale blue, never the white the arrow is: at a glance you can always tell which one is you
    for (const n of (map.npcs || [])) mark(n.x, n.z, 3.6, css(PAL.ui.textDim, 0.95), 1.7);

    // which way is up
    g.save();
    g.font = `${Math.round(13 * K)}px ${'ui-rounded, Arial Rounded MT Bold, Trebuchet MS, sans-serif'}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3 * K; g.strokeStyle = css(PAL.ui.shadow, 0.6);
    g.strokeText('N', W - 15 * K, 15 * K);
    g.fillStyle = css(PAL.ui.text, 0.8);
    g.fillText('N', W - 15 * K, 15 * K);
    g.restore();

    // you: a big white arrow on a soft halo, turning as you turn
    let p = null;
    try { p = world.player && world.player.p; } catch (_) { p = null; }
    if (p) {
      const x = px(p.x), y = pz(p.z), a = p.yaw || 0;
      const halo = g.createRadialGradient(x, y, 0, x, y, YOU_PX * 1.25 * K);
      halo.addColorStop(0, css(PAL.ui.text, 0.42));
      halo.addColorStop(1, css(PAL.ui.text, 0));
      g.fillStyle = halo;
      g.beginPath(); g.arc(x, y, YOU_PX * 1.25 * K, 0, Math.PI * 2); g.fill();
      g.save();
      g.translate(x, y);
      g.rotate(-a);                                     // yaw 0 faces -z, which is up on the plan
      const s = YOU_PX * K;
      g.beginPath();
      g.moveTo(0, -s * 0.62); g.lineTo(s * 0.44, s * 0.46); g.lineTo(0, s * 0.2); g.lineTo(-s * 0.44, s * 0.46);
      g.closePath();
      g.lineJoin = 'round';
      g.lineWidth = 2.6 * K; g.strokeStyle = ink; g.stroke();
      g.fillStyle = PAL.ui.text;
      g.fill();
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
      canvas.width = MAP_PX * 2; canvas.height = MAP_PX * 2;   // 2x the design size, for a crisp plan
      S.mapCanvas = canvas;
      const key = (glyph, cls, words) => UI.h('span.hud-keyitem', [UI.h('span.hud-glyph.' + cls, glyph), words]);
      S.map = UI.window({
        id: 'hud-map', right: 26, top: 26, origin: '100% 0%', pop: 'left', title, className: 'hud-map',
        destroyOnClose: true, openMs: 300, closeMs: 240,
        content: [
          UI.h('div.hud-mapbox', canvas),
          UI.h('div.hud-maplegend', [
            UI.h('div.hud-keyrow', [key('▲', 'hud-g-you', 'you'), key('●', 'hud-g-folk', 'people')]),
            UI.h('div.hud-keyrow', [key('◆', 'hud-g-gold', 'treasure'), key('■', 'hud-g-gold', 'a way out')]),
          ]),
        ],
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
    if (/door|gate/.test(type)) return 'Open the door';
    if (/stair/.test(type)) return 'Go up';
    if (/pot|barrel|drawer|wardrobe|shelf|sack|crate|basket|urn/.test(type)) return 'Search it';
    if (/well/.test(type)) return 'Look down the well';
    if (/bed/.test(type)) return 'Have a lie down';
    // Map object names carry their own article ('the low wall', 'an old pot'), so the template must not add a
    // second one — that is what used to read 'Look at the the low wall'.
    if (name) return `Look at the ${String(name).replace(/^\s*(?:the|an|a)\s+/i, '')}`;
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
      const cool = now - last < CARD_COOLDOWN;
      S.seen.set(m.id, now);
      // Never ask for the ribbon sentence HERE. Quests.hintOn is keyed by the map you are ON, and on
      // map.enter that module may still be one door behind — caching the answer and showing it 3 s
      // later prints the sentence for the map you just left every time (P32 gap #5). Ask again at
      // show time, after the place card has had its moment (or immediately on a cool re-cross).
      S.ribbonText = null;
      if (!cool) showCard(m.name || m.id);
      const delay = cool ? 80 : (CARD_HOLD + 0.45) * 1000;
      setTimeout(() => {
        try {
          if (S.hidden) return;
          if (!cool && S.cardT > 0) return;
          const words = ribbonFor();
          if (words) showRibbon(words);
        } catch (_) {}
      }, delay);
    } catch (e) { oops('hud map.enter', e); }
  });
  // The story turning is exactly when a child needs telling where to go next: P26 emits 'quest.change' when the
  // beat moves on, and a flag going down is the older, coarser signal for the same thing.
  for (const ev of ['flag.set', 'quest.change']) Bus.on(ev, () => {
    try {
      const words = ribbonFor();
      if (words && words !== S.ribbonText && !S.hidden && onField()) showRibbon(words);
    } catch (e) { oops('hud ' + ev, e); }
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
    nextStep: S.ribbonText, nextStepFrom: S.questFrom || null,
    map: (() => {
      let w = null; try { w = Field.world && Field.world(); } catch (_) {}
      const m = (w && w.map) || null;
      return {
        open: !!(S.mapOpen && S.map && !S.map.destroyed), of: S.mapBakedFor,
        tiles: S.mapBaked ? S.mapBaked.cells : 0,
        // what the plan actually marks, and how big those marks are in DESIGN px (a critic can check by eye)
        marks: { you: YOU_PX, folk: (m && m.npcs ? m.npcs.length : 0), treasure: (m && m.chests ? m.chests.length : 0), ways: (m && m.exits ? m.exits.length : 0) },
        px: MAP_PX,
      };
    })(),
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
.hud-mapbox{position:relative; width: calc(248 * var(--u)); height: calc(248 * var(--u)); border-radius: calc(8 * var(--u));
  overflow:hidden; box-shadow: inset 0 0 0 calc(1.6 * var(--u)) var(--dq-hair)}
.hud-mapcanvas{width:100%; height:100%; display:block}
.hud-maplegend{margin-top: calc(9 * var(--u)); padding-top: calc(7 * var(--u));
  border-top: calc(1.4 * var(--u)) solid var(--dq-hair)}
.hud-keyrow{display:flex; gap: calc(14 * var(--u)); justify-content:space-between; line-height:1.5}
.hud-keyitem{display:inline-flex; align-items:center; gap: calc(6 * var(--u));
  font-size: calc(17 * var(--u)); color: var(--dq-title-ink); white-space:nowrap}
.hud-glyph{font-size: calc(15 * var(--u)); text-shadow: 0 calc(1 * var(--u)) 0 var(--dq-win-bot)}
.hud-g-you{color: var(--dq-ink)}
.hud-g-folk{color: var(--dq-label)}
.hud-g-gold{color: var(--dq-gold)}
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
