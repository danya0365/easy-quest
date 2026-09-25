/**
 * title.js — the title screen and the way into the game: a sweeping golden-hour camera over Puddlewick Vale, our
 * own logo drawn in code, the title theme, A New Tale / Carry On / Settings, hero naming, and a storybook intro
 * that fades into the game.                                                        (P01, owner: src/ui/title.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx) AFTER every other plugin, then boots whatever
 * ctx.boot says — so install() re-points ctx.boot at the 'title' scene and the game opens here.
 *
 * WHAT THE SCENE IS
 *   Its own THREE.Scene, built from the REAL map art: Maps.load('meadow') (CANON: Puddlewick Vale) and that map's
 *   own view() — sky dome, painted skyline places, hill rings, hedgerow and mixed wood, the lane, the Beck and its
 *   footbridge, the thatched cottage, sheep, ducks, butterflies. Then sky.setHours(18.25): the whole backdrop and the
 *   light rig blend to golden hour on exactly the schedule the field uses. No player, no HUD, no map.enter — so the
 *   title theme owns the speakers and nothing autosaves behind your back.
 *   The camera flies three slow cinematic legs on a loop (CAM_LEGS), eased and drifting, ~13 s each, joined by
 *   5 s hinges (CAM_PATH) so the flight never cuts or jumps — one continuous 54 s move.
 *   If the map or its art cannot be built, buildSky + two hill rings stand in, so the frame is never black.
 *
 * THE FLOW (phases)
 *   sweep   the logo fades up, "Press Enter" pulses            confirm -> menu
 *   menu    A New Tale / Carry On / Settings in a DQ window    cancel  -> back to sweep
 *   slots   Carry On: one entry per Save slot, with who and where and how long
 *   options Settings: words speed, big text, music, sound — confirm cycles a value, cancel goes back
 *   naming  the letter grid (Bram offered, 8 letters)           cancel  -> menu
 *   intro   four storybook pages, skippable with cancel        then a white fade into the field
 *
 * __DQ  state().title = {phase, name, camera, leg, music, slots, hasSave, settings}
 *       __DQ.title(phase?)   read the state, or jump straight to a phase ('sweep' 'menu' 'slots' 'options'
 *                            'naming' 'intro' 'game')
 *       __DQ.titleName(s)    set the hero's name (also used by the naming grid)
 *       __DQ.toTitle()       Save.endGame() + Scenes.reset('title') — the way back here from anywhere
 *       __DQ.goto('title')   works, because the scene is registered
 *       ?title=0 / ?skiptitle in the URL boots straight into the field, the way main.js did before P01
 */
import * as THREE from 'three';
import { PAL, C3, css, mixHex, smooth } from '../art/palette.js';
import { Toon, makeLightRig, makeBlobShadows } from '../art/toon.js';
import { Assets } from '../engine/assets.js';
import { buildSky, ringHill } from '../world/scenery.js';
import { Font } from './font.js';
import { MessageBox } from './text.js';
import { Transitions } from './transitions.js';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// words and numbers
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const GAME_TITLE = { tag: 'A TALE OF ALDENMOOR', line1: 'The Lark', line2: 'and the Quiet Hand' };
const DEFAULT_NAME = 'Bram';
const MAX_NAME = 8;
const GOLDEN_HOUR = 18.25;             // measured against the running build: warm peach sky, lanterns just lit,
                                       // long raking shadows, grass still green. 17.4 read as plain midday; 18.8 goes flat.

/** The storybook opening (CANON §3 / §4 B1, in the localisation's voice). Four pages, skippable. */
const INTRO = [
  'Aldenmoor is a green and gentle place,{n}and the softest green in all of it{n}is the vale below Puddlewick.',
  'A wagon comes down the Long Lane{n}most summers. A cart-horse called{n}Parsnip pulls it, grumbling.',
  'The very large man driving it is{n}{gold}Sir Halvard Bellwether{/gold}.{n}Nobody here knows he is a king.',
  'The small boy beside him, boots off,{n}is {gold}%HERO%{/gold}.{p}He does not know either.{n}{quiet}This is the summer he finds out.{/}',
];

/** The camera's three legs over the vale. Coordinates: +x east, -z north (meadow.js); the village is north. */
const CAM_LEGS = [
  // 1. high and wide over the south lane, looking north up the vale: the cottage, the Beck and its footbridge, both
  //    ponds, and Puddlewick itself painted on the skyline — the establishing shot, and the one a child opens on
  { from: [7.5, 18.5, 35], to: [2.5, 15, 26], look: [-1, 4.5, -8], fov: 47, secs: 13 },
  // 2. a crane west across the meadow toward the thatched cottage and its washing, far enough back to keep the vale in
  { from: [-30, 16.5, 25], to: [-25.5, 13.5, 16.5], look: [-12.6, 3.2, 0.4], fov: 44, secs: 13 },
  // 3. low over the Beck, swinging back south-east INTO the low sun (ENV dusk sun bearing: +x, +z)
  { from: [-6, 12, -17], to: [2, 13.5, -9], look: [14, 5.5, 13], fov: 48, secs: 13 },
];

/**
 * One continuous flight path, not three shots cut together: after each leg's slow dolly comes a HINGE that glides
 * from where that leg ended to where the next one begins, swinging the look target (and the lens) across with it.
 * Without the hinge the camera JUMPED thirty units at every leg boundary, which reads as a glitch, not a cut.
 */
const HINGE = 5;
const CAM_PATH = (() => {
  const out = [];
  CAM_LEGS.forEach((leg, i) => {
    const next = CAM_LEGS[(i + 1) % CAM_LEGS.length];
    out.push({ from: leg.from, to: leg.to, look0: leg.look, look1: leg.look, fov0: leg.fov, fov1: leg.fov, secs: leg.secs, leg: i });
    out.push({ from: leg.to, to: next.from, look0: leg.look, look1: next.look, fov0: leg.fov, fov1: next.fov, secs: HINGE, leg: i });
  });
  return out;
})();

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat('abcdefghijklmnopqrstuvwxyz'.split(''));
const SPEEDS = [{ id: 'slow', label: 'Slow', gps: 20 }, { id: 'normal', label: 'Just right', gps: 35 }, { id: 'fast', label: 'Quick', gps: 62 }];
const VOL_STEPS = 5;                   // 0..5, shown as a little bar

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// module state (one title, whatever happens)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
let CTX = null;
let LIVE = null;                                     // the live instance, or null when the title is off the stack
let heroName = DEFAULT_NAME;
const settings = { speed: 'normal', big: false, music: 4, sfx: 4 };
const SET_KEY = 'dqv.settings';

const oops = (where, e) => { try { CTX && CTX.reportError && CTX.reportError('title: ' + where, e); } catch (_) {} };
const guard = (where, fn, fallback) => { try { return fn(); } catch (e) { oops(where, e); return fallback; } };
/** Fire an async beat and never leave an unhandled rejection behind. */
const run = (p) => { try { Promise.resolve(p).catch((e) => oops('async', e)); } catch (e) { oops('async', e); } };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// settings — kept in localStorage so a child's choices survive a reload
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function loadSettings() {
  guard('load settings', () => {
    const raw = localStorage.getItem(SET_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (SPEEDS.some((s) => s.id === o.speed)) settings.speed = o.speed;
    settings.big = !!o.big;
    for (const k of ['music', 'sfx']) if (Number.isFinite(+o[k])) settings[k] = Math.max(0, Math.min(VOL_STEPS, Math.round(+o[k])));
  });
}
function saveSettings() { guard('save settings', () => localStorage.setItem(SET_KEY, JSON.stringify(settings))); }

function applySettings() {
  const c = CTX || {};
  guard('apply speed', () => c.Text && c.Text.setSpeed((SPEEDS.find((s) => s.id === settings.speed) || SPEEDS[1]).gps));
  guard('apply scale', () => c.UI && c.UI.setScale(settings.big ? 1.16 : 1));
  guard('apply volume', () => {
    if (!c.Audio || !c.Audio.setVolume) return;
    const m = settings.music / VOL_STEPS, s = settings.sfx / VOL_STEPS;
    c.Audio.setVolume('music', m);
    c.Audio.setVolume('ambience', m * 0.9);
    for (const bus of ['sfx', 'ui', 'voice']) c.Audio.setVolume(bus, s);
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the logo — drawn in code: chunky warm type, a gold edge, a dark storybook rim, and the Gloop (CANON §8 mascot)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const LOGO = { W: 1280, H: 470, designW: 640 };

function gloop(g, cx, cy, r) {
  const ink = PAL.outline.char;
  // the blue teardrop: a round body with a drawn-out point at the top
  g.beginPath();
  g.moveTo(cx, cy - r * 1.62);
  g.bezierCurveTo(cx + r * 0.42, cy - r * 0.95, cx + r, cy - r * 0.62, cx + r, cy + r * 0.05);
  g.bezierCurveTo(cx + r, cy + r * 0.82, cx + r * 0.55, cy + r, cx, cy + r);
  g.bezierCurveTo(cx - r * 0.55, cy + r, cx - r, cy + r * 0.82, cx - r, cy + r * 0.05);
  g.bezierCurveTo(cx - r, cy - r * 0.62, cx - r * 0.42, cy - r * 0.95, cx, cy - r * 1.62);
  g.closePath();
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.5, r * 0.1, cx, cy + r * 0.2, r * 1.5);
  grad.addColorStop(0, PAL.slime.light); grad.addColorStop(0.55, PAL.slime.body); grad.addColorStop(1, mixHex(PAL.slime.body, PAL.outline.char, 0.35));
  g.fillStyle = grad; g.fill();
  g.lineJoin = 'round'; g.lineWidth = r * 0.17; g.strokeStyle = ink; g.stroke();
  // a sheen on the shoulder
  g.beginPath(); g.ellipse(cx - r * 0.34, cy - r * 0.34, r * 0.26, r * 0.15, -0.5, 0, Math.PI * 2);
  g.fillStyle = css(PAL.ink.highlight, 0.72); g.fill();
  // eyes, and the monocle he cannot keep on
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(cx + s * r * 0.33, cy - r * 0.06, r * 0.15, r * 0.21, 0, 0, Math.PI * 2);
    g.fillStyle = PAL.char.white; g.fill(); g.lineWidth = r * 0.05; g.strokeStyle = ink; g.stroke();
    g.beginPath(); g.ellipse(cx + s * r * 0.33, cy - r * 0.02, r * 0.075, r * 0.11, 0, 0, Math.PI * 2);
    g.fillStyle = ink; g.fill();
  }
  g.beginPath(); g.arc(cx + r * 0.33, cy - r * 0.06, r * 0.3, 0, Math.PI * 2);
  g.lineWidth = r * 0.07; g.strokeStyle = PAL.ui.gold; g.stroke();
  // the mouth: a wide contented curve
  g.beginPath(); g.moveTo(cx - r * 0.24, cy + r * 0.44); g.quadraticCurveTo(cx, cy + r * 0.66, cx + r * 0.24, cy + r * 0.44);
  g.lineWidth = r * 0.08; g.strokeStyle = ink; g.lineCap = 'round'; g.stroke();
}

function logoCanvas() {
  const c = document.createElement('canvas');
  c.width = LOGO.W; c.height = LOGO.H;
  const g = c.getContext('2d');
  if (!g) return c;
  const CX = 600;
  const deep = mixHex(PAL.ink.shadow, PAL.wood.dark, 0.35);      // a warm dark storybook rim, never flat black
  const rim = mixHex(PAL.ui.gold, PAL.wood.dark, 0.52);          // the gold edge, one shade down so it reads as metal
  // a soft shadow behind the type so it stands off a bright sky
  const halo = g.createRadialGradient(CX, 240, 40, CX, 240, 620);
  halo.addColorStop(0, css(PAL.ink.shadow, 0.42)); halo.addColorStop(0.55, css(PAL.ink.shadow, 0.2)); halo.addColorStop(1, css(PAL.ink.shadow, 0));
  g.fillStyle = halo; g.fillRect(0, 0, LOGO.W, LOGO.H);

  // the tagline, with a tapered gold swash either side
  Font.draw(g, GAME_TITLE.tag, CX, 62, { size: 34, align: 'center', letterSpacing: 11, fill: PAL.ui.gold, fill2: mixHex(PAL.ui.gold, PAL.paint.gold, 0.7), outline: deep, outlineWidth: 7, shadowOffset: 3 });
  const tw = Font.measure(GAME_TITLE.tag, 34, { letterSpacing: 11 }).width;
  for (const s of [-1, 1]) {
    g.beginPath();
    const x0 = CX + s * (tw / 2 + 22), x1 = CX + s * (tw / 2 + 150);
    g.moveTo(x0, 46); g.lineTo(x1, 50); g.lineTo(x1, 56); g.lineTo(x0, 60); g.closePath();
    g.fillStyle = css(PAL.ui.gold, 0.9); g.fill();
    g.lineWidth = 3; g.strokeStyle = css(deep, 0.85); g.stroke();
  }

  // the title itself: a dark rim, then a gold edge, then a cream-to-gold fill (three passes, biggest first)
  const line = (text, y, size) => {
    Font.draw(g, text, CX, y, { size, align: 'center', fill: deep, outline: deep, outlineWidth: size * 0.34, shadowOffset: size * 0.085 });
    Font.draw(g, text, CX, y, { size, align: 'center', fill: rim, outline: rim, outlineWidth: size * 0.19, shadow: false });
    Font.draw(g, text, CX, y, { size, align: 'center', fill: PAL.cloth.cream, fill2: PAL.ui.gold, outline: false, shadow: false });
  };
  line(GAME_TITLE.line1, 214, 136);
  line(GAME_TITLE.line2, 330, 84);
  guard('logo gloop', () => gloop(g, 1148, 300, 78));
  return c;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the DOM overlay: logo, "Press Enter", the storybook hint
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const CSS = `
.dqtitle{position:absolute;inset:0;pointer-events:none;z-index:6;font-family:var(--dq-font)}
.dqtitle .sheen{position:absolute;left:0;right:0;top:0;height:58%;
  background:linear-gradient(180deg,rgba(5,10,32,.34),rgba(5,10,32,.10) 55%,transparent)}
.dqtitle .logo{position:absolute;left:50%;top:calc(46 * var(--u));width:calc(640 * var(--u));height:auto;
  transform:translate(-50%,0) scale(.965);opacity:0;
  transition:opacity 1100ms ease,top 520ms cubic-bezier(.2,.9,.25,1),transform 520ms cubic-bezier(.2,.9,.25,1)}
.dqtitle.up .logo{top:calc(8 * var(--u));transform:translate(-50%,0) scale(.74)}
.dqtitle.shown .logo{opacity:1;transform:translate(-50%,0) scale(1)}
.dqtitle.shown.up .logo{transform:translate(-50%,0) scale(.74)}
.dqtitle .press{position:absolute;left:0;right:0;bottom:calc(96 * var(--u));text-align:center;
  font-size:calc(31 * var(--u));font-weight:700;letter-spacing:calc(1.6 * var(--u));color:var(--dq-ink);
  text-shadow:0 calc(3 * var(--u)) 0 var(--dq-ink-shadow),0 0 calc(10 * var(--u)) var(--dq-ink-shadow);
  opacity:0;transition:opacity 500ms ease}
.dqtitle.shown .press{opacity:1;animation:dqt-pulse 1700ms ease-in-out infinite}
.dqtitle.busy .press{opacity:0;animation:none}
@keyframes dqt-pulse{0%,100%{opacity:.46}50%{opacity:1}}
.dqtitle .foot{position:absolute;right:calc(22 * var(--u));bottom:calc(14 * var(--u));
  font-size:calc(17 * var(--u));color:var(--dq-title-ink);opacity:.72;
  text-shadow:0 calc(2 * var(--u)) 0 var(--dq-ink-shadow)}
.dqtitle .hint{position:absolute;left:0;right:0;bottom:calc(244 * var(--u));text-align:center;
  font-size:calc(19 * var(--u));color:var(--dq-title-ink);opacity:0;transition:opacity 400ms ease;
  text-shadow:0 calc(2 * var(--u)) 0 var(--dq-ink-shadow)}
.dqtitle.hinting .hint{opacity:.9}
.dqt-name{font-size:calc(40 * var(--u));letter-spacing:calc(3 * var(--u));text-align:center;color:var(--dq-ink);
  text-shadow:0 calc(2.4 * var(--u)) 0 var(--dq-ink-shadow)}
.dqt-name i{color:var(--dq-gold);font-style:normal;opacity:.55}
.dqt-grid .dq-item{justify-content:center;min-width:calc(34 * var(--u))}
`;

function ensureCss() {
  guard('css', () => {
    if (document.getElementById('dq-title-css')) return;
    const s = document.createElement('style');
    s.id = 'dq-title-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the backdrop: the real Puddlewick Vale, at golden hour
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function buildBackdrop(ctx) {
  const B = { scene: null, rig: null, view: null, map: null, blobs: null, fallback: false, buildMs: 0 };
  const t0 = performance.now();
  const scene = new THREE.Scene();
  scene.name = 'title:vale';
  scene.background = C3(PAL.dusk.horizon);     // an opaque base scene: a warm sky, so no frame can ever be black
  B.scene = scene;
  B.rig = makeLightRig({ scene, preset: 'day', shadowMapSize: ctx.App && ctx.App.quality === 'low' ? 1024 : undefined });
  try {
    const map = ctx.Maps && ctx.Maps.load ? ctx.Maps.load('meadow') : null;
    const def = map && map.def;
    if (def && typeof def.view === 'function') {
      B.map = map;
      B.blobs = makeBlobShadows(24);
      scene.add(B.blobs.mesh);
      B.view = def.view({ THREE, scene, rig: B.rig, map, camera: null, App: ctx.App, blobs: B.blobs }) || null;
    }
  } catch (e) { oops('vale build', e); B.view = null; }
  if (!B.view) {
    // The stand-in: the sky dome with its painted places, and two hill rings. Beautiful, and cheap, and it means a
    // broken map file can never leave a child looking at nothing.
    B.fallback = true;
    try {
      const sky = buildSky(scene, B.rig, { landmarks: 'vale' });
      ringHill(scene, 'mid', 118, 150, 205, 5, 21, 71, PAL.hill.midLow, PAL.hill.mid, 0.2, { gates: 0.45 });
      ringHill(scene, 'far', 240, 300, 380, 12, 78, 81, PAL.hill.farLow, PAL.hill.far, 0.25, { fogged: false, peaky: 1.8, gates: 0.3 });
      B.view = { sky, update(t, dt, c) { if (c && c.camera) sky.sky.position.copy(c.camera.position); sky.clouds && (sky.clouds.rotation.y = t * 0.0035); }, state: () => ({ fallback: true }), dispose: () => sky.dispose() };
    } catch (e) { oops('fallback sky', e); }
  }
  // golden hour: one call blends the rig AND the whole painted backdrop on the field's own schedule
  guard('golden hour', () => { const s = B.view && B.view.sky; if (s && s.setHours) s.setHours(GOLDEN_HOUR); });
  guard('cloud drift', () => { const s = B.view && B.view.sky; if (s && s.drift) s.drift(1.9); });
  B.buildMs = Math.round(performance.now() - t0);
  return B;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the scene
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function createTitleScene() {
  const ctx = CTX || {};
  const { UI, Scenes, Save, Debug } = ctx;
  const S = {
    phase: 'boot', t: 0, leg: 0, legT: 0, B: null, camera: null, offResize: null,
    dom: null, box: null, menu: null, sub: null, nameWin: null, grid: null,
    seg: 0, skip: null, music: 'off', busy: false, fresh: true, renderT: null,
  };
  const look = new THREE.Vector3();

  // ── the overlay ────────────────────────────────────────────────────────────────────────────────────────────
  function makeDom() {
    ensureCss();
    const host = UI && UI.layer;
    if (!host) return null;
    const root = document.createElement('div');
    root.className = 'dqtitle';
    const sheen = document.createElement('div'); sheen.className = 'sheen';
    const logo = guard('logo', () => logoCanvas(), null);
    if (logo) logo.className = 'logo';
    const press = document.createElement('div'); press.className = 'press'; press.textContent = 'Press Enter';
    const foot = document.createElement('div'); foot.className = 'foot'; foot.textContent = GAME_TITLE.line1 + ' ' + GAME_TITLE.line2 + '  ·  v' + (ctx.version || '0');
    const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Press X to skip';
    root.append(sheen);
    if (logo) root.append(logo);
    root.append(press, foot, hint);
    host.appendChild(root);
    // one frame later, so the CSS transition actually runs
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('shown')));
    return root;
  }
  const cls = (name, on) => { if (S.dom) S.dom.classList.toggle(name, !!on); };

  // ── the camera flight ──────────────────────────────────────────────────────────────────────────────────────
  function flyCamera(dt) {
    const cam = S.camera; if (!cam) return;
    S.legT += dt;
    for (let guardN = 0; guardN < CAM_PATH.length + 1; guardN++) {
      const seg = CAM_PATH[S.seg % CAM_PATH.length];
      if (S.legT < seg.secs) break;
      S.legT -= seg.secs;
      S.seg = (S.seg + 1) % CAM_PATH.length;
    }
    const seg = CAM_PATH[S.seg % CAM_PATH.length];
    S.leg = seg.leg;
    const k = smooth(0, 1, clamp01(S.legT / seg.secs));
    const p = lerp3(seg.from, seg.to, k);
    const l = lerp3(seg.look0, seg.look1, k);
    // a slow drift on top of the dolly, so the frame is never quite still
    const w = S.t * 0.11;
    cam.position.set(p[0] + Math.sin(w) * 1.5, p[1] + Math.sin(w * 0.73 + 1.1) * 0.55, p[2] + Math.cos(w * 0.87) * 1.5);
    look.set(l[0] + Math.sin(w * 0.6) * 1.2, l[1], l[2] + Math.cos(w * 0.52) * 1.2);
    cam.lookAt(look);
    const fov = seg.fov0 + (seg.fov1 - seg.fov0) * k;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  // ── music ──────────────────────────────────────────────────────────────────────────────────────────────────
  function startMusic() {
    if (!ctx.Audio || !ctx.Music) return;
    S.music = 'waiting';
    const play = () => {
      if (S.phase === 'off') return;
      S.music = 'loading';
      ctx.Music().then((M) => {
        if (!M || S.phase === 'off') return;
        guard('music play', () => { M.play('title', { fade: 1.4 }); S.music = 'title'; });
      }, (e) => { oops('music load', e); S.music = 'failed'; });
    };
    guard('music', () => {
      if (ctx.Audio.ready) play();
      else ctx.Audio.onUnlock(play);
    });
    // First Confirm / cursor blip also unlocks — kick the theme then too (P01 gap #1 silent title).
    guard('music kick', () => {
      if (!ctx.Bus || !ctx.Bus.on) return;
      const once = () => { try { play(); } catch (_) {} try { ctx.Bus.off && ctx.Bus.off('ui.select', once); } catch (_) {} };
      ctx.Bus.on('ui.select', once);
    });
  }

  // ── little widgets ─────────────────────────────────────────────────────────────────────────────────────────
  function closeAll() {
    for (const k of ['menu', 'sub', 'grid', 'nameWin', 'box']) {
      const w = S[k];
      S[k] = null;
      if (w) guard('close ' + k, () => w.destroy());
    }
  }

  /** "Bram  Lv 3", or just the name while nobody has told the save what level he is (P14's roster summary). */
  function who(s) { return `${s.hero || DEFAULT_NAME}${s.level != null ? '  Lv ' + s.level : ''}`; }

  function continueWords() {
    const info = guard('continueInfo', () => (Save && Save.continueInfo ? Save.continueInfo() : null), null);
    if (!info || !info.any || !info.latest) return { any: false, right: null, slots: info ? info.slots : [] };
    const L = info.latest;
    return { any: true, right: who(L), slots: info.slots, latest: L };
  }

  // ── phase: the attract sweep ───────────────────────────────────────────────────────────────────────────────
  function toSweep() {
    closeAll();
    S.phase = 'sweep';
    cls('up', false); cls('busy', false); cls('hinting', false);
  }

  // ── phase: the main menu ───────────────────────────────────────────────────────────────────────────────────
  function toMenu(initial) {
    closeAll();
    S.phase = 'menu';
    cls('up', true); cls('busy', true); cls('hinting', false);
    const c = continueWords();
    S.menu = UI.menu({
      id: 'title-menu', centerX: true, bottom: 78, minWidth: 420, origin: '50% 100%', destroyOnClose: true,
      onCancel: () => { S.menu = null; toSweep(); },
      items: [
        { id: 'new', label: 'A New Tale' },
        { id: 'continue', label: 'Carry On', right: c.right || 'no tale yet', disabled: !c.any },
        { id: 'settings', label: 'Settings' },
      ],
      initial: initial || (c.any ? 'continue' : 'new'),
      onSelect: (it) => {
        if (!it) return;
        if (it.id === 'new') toNaming();
        else if (it.id === 'continue') toSlots();
        else if (it.id === 'settings') toOptions();
      },
    });
    S.menu.open();
  }

  // ── phase: Carry On, the slot list ─────────────────────────────────────────────────────────────────────────
  function toSlots() {
    S.phase = 'slots';
    const c = continueWords();
    const items = (c.slots || []).map((s) => ({
      id: 'slot:' + s.slot,
      label: s.label || ('Tale ' + s.slot),
      right: s.loadable ? who(s) : null,
      note: s.loadable ? `${s.placeName || s.place || 'somewhere'} · ${s.act || 'Act I'} · ${s.playtimeText || '0:00'}` : (s.words || ''),
      disabled: !s.loadable,
      data: s,
    }));
    if (!items.length) items.push({ id: 'none', label: 'Nothing is written yet.', disabled: true });
    // The cursor starts on the newest tale that will actually read. UI.menu's `selectable` deliberately lets the
    // cursor sit on a greyed entry (DQ gives you a buzzer, not a locked-out cursor), so without this a child
    // pressing Enter twice from the title landed on the empty "Tale 1" and nothing happened.
    S.sub = UI.menu({
      id: 'title-slots', centerX: true, bottom: 78, minWidth: 620, title: 'Which tale?', origin: '50% 100%',
      items, destroyOnClose: true, initial: c.latest ? 'slot:' + c.latest.slot : undefined,
      onSelect: (it) => { if (it && it.data) carryOn(it.data.slot); },
      // the child closes and focus goes back to the menu underneath it, which is still standing
      onCancel: () => { S.sub = null; if (S.phase === 'slots') S.phase = 'menu'; },
    });
    S.sub.open();
  }

  // ── phase: Settings ────────────────────────────────────────────────────────────────────────────────────────
  function bar(n) { return '●'.repeat(n) + '○'.repeat(Math.max(0, VOL_STEPS - n)); }
  function optionItems() {
    const sp = SPEEDS.find((s) => s.id === settings.speed) || SPEEDS[1];
    return [
      { id: 'speed', label: 'How fast the words come', right: sp.label },
      { id: 'big', label: 'Big text', right: settings.big ? 'On' : 'Off' },
      { id: 'music', label: 'Music', right: bar(settings.music) },
      { id: 'sfx', label: 'Sounds', right: bar(settings.sfx) },
      '-',
      { id: 'back', label: 'That will do' },
    ];
  }
  function toOptions() {
    S.phase = 'options';
    S.sub = UI.menu({
      id: 'title-options', centerX: true, bottom: 70, minWidth: 620, title: 'Settings', origin: '50% 100%',
      items: optionItems(), destroyOnClose: true,
      onSelect: (it) => {
        if (!it) return;
        if (it.id === 'back') { S.sub.cancel(); return; }
        if (it.id === 'speed') { const i = SPEEDS.findIndex((s) => s.id === settings.speed); settings.speed = SPEEDS[(i + 1) % SPEEDS.length].id; }
        else if (it.id === 'big') settings.big = !settings.big;
        else if (it.id === 'music' || it.id === 'sfx') settings[it.id] = (settings[it.id] + 1) % (VOL_STEPS + 1);
        applySettings(); saveSettings();
        guard('options refresh', () => { S.sub.setItems(optionItems(), it.id); S.sub.update(0); });
      },
      onCancel: () => { S.sub = null; if (S.phase === 'options') S.phase = 'menu'; },
    });
    S.sub.open();
  }

  // ── phase: naming the boy ──────────────────────────────────────────────────────────────────────────────────
  function nameMarkup() {
    const n = heroName.slice(0, MAX_NAME);
    return UI.h('div.dqt-name', [n, UI.h('i', '_'.repeat(Math.max(0, MAX_NAME - n.length)))]);
  }
  function refreshName() { guard('name refresh', () => S.nameWin && S.nameWin.setContent(nameMarkup())); }

  function toNaming() {
    closeAll();
    S.phase = 'naming';
    cls('up', true); cls('busy', true); cls('hinting', false);
    heroName = DEFAULT_NAME;
    S.fresh = true;                 // Bram is offered, not typed: the first letter a child picks replaces him
    S.nameWin = UI.window({ id: 'title-name', centerX: true, top: 238, width: 440, title: 'What is the boy called?', titleAlign: 'center', content: nameMarkup(), origin: '50% 0' });
    S.nameWin.open();
    const items = LETTERS.map((L) => ({ id: 'L' + L, label: L, data: L }));
    items.push({ id: 'dash', label: '-', data: '-' }, { id: 'quote', label: '’', data: '’' },
      { id: 'rub', label: 'Rub out' }, { id: 'ok', label: 'Done' });
    // 8 columns x 7 rows fills exactly. The width is EXPLICIT on purpose: a centred window with an auto width is
    // capped at half the frame (it is absolutely positioned at left:50%), which squeezed the eight auto tracks to
    // ~50 design px and drew 'Rub out' straight over 'Done'. 900 gives the two word keys their own room.
    S.grid = UI.menu({
      id: 'title-grid', centerX: true, top: 362, width: 900, columns: 8, className: 'dqt-grid', lineHeight: 40, colGap: 14, origin: '50% 0',
      items, initial: 'ok', destroyOnClose: true,
      onSelect: (it) => {
        if (!it) return;
        if (it.id === 'ok') { if (!heroName) heroName = DEFAULT_NAME; refreshName(); run(toIntro()); return; }
        if (it.id === 'rub') { S.fresh = false; heroName = heroName.slice(0, -1); refreshName(); return; }
        if (it.data) {
          if (S.fresh) { heroName = ''; S.fresh = false; }
          if (heroName.length >= MAX_NAME) { guard('buzz', () => UI.sound && UI.sound('buzzer')); return; }
          heroName += it.data; refreshName();
        }
      },
      onCancel: () => { S.grid = null; toMenu('new'); },
    });
    S.grid.open();
  }

  // ── phase: the storybook intro ─────────────────────────────────────────────────────────────────────────────
  async function toIntro() {
    try {
      closeAll();
      S.phase = 'intro';
      cls('busy', true); cls('hinting', true);
      setHeroName(heroName);
      guard('vignette', () => Transitions.vignette(0.5, { ms: 800 }));
      const box = new MessageBox({ id: 'title-intro', destroyOnClose: true, lines: 3 });
      S.box = box;
      const said = guard('intro say', () => box.say(INTRO.join('{p}'), { voice: 'narrator', vars: { HERO: heroName } }), Promise.resolve(true));
      const skipped = new Promise((res) => { S.skip = res; });
      await Promise.race([said.catch((e) => oops('intro say', e)), skipped]);
      S.skip = null;
      if (S.phase !== 'intro') return;
      cls('hinting', false);
      guard('intro close', () => { S.box = null; box.destroy(); });
      guard('vignette off', () => Transitions.vignette(0, { ms: 300 }));
    } catch (e) { oops('intro', e); }
    if (S.phase !== 'intro') return;
    {
      const keep = heroName;
      await intoTheGame(() => {
        guard('newGame', () => Save && Save.newGame());
        setHeroName(keep);                                    // newGame's hero.reset() puts Bram back — re-paint
        Scenes.replace('field', { map: 'meadow' });
      });
      setHeroName(keep);
    }
  }

  /** Fade to white, swap in the field (which builds the map behind the cover), fade up. */
  async function intoTheGame(swap) {
    if (S.busy) return;
    S.busy = true;
    S.phase = 'leaving';
    cls('busy', true);
    if (S.dom) S.dom.classList.remove('shown');
    guard('busy on', () => Debug && Debug.busy('title.leave', true));
    try {
      await Transitions.cover(async () => { await Promise.resolve(swap()); }, { kind: 'church', out: 760, in: 1000 });
    } catch (e) {
      oops('leave transition', e);
      guard('hard swap', () => swap());
    }
    guard('busy off', () => Debug && Debug.busy('title.leave', false));
  }

  function carryOn(slot) {
    const r = guard('load', () => (Save && Save.load ? Save.load(slot) : null), null);
    if (!r || r.ok === false) {
      const s = guard('summary', () => (Save && Save.summary ? Save.summary(slot) : null), null);
      const words = (s && s.words) || (Save && Save.words && Save.words.loadBroken) || 'That page will not read.';
      const box = new MessageBox({ id: 'title-oops', destroyOnClose: true, lines: 3 });
      S.box = box;
      box.say(words).then(() => { guard('oops close', () => { S.box = null; box.destroy(); }); toSlots(); }, (e) => oops('oops box', e));
      return;
    }
    run(intoTheGame(() => Scenes.replace('field', {})));
  }

  // ── the scene object ───────────────────────────────────────────────────────────────────────────────────────
  const scene = {
    opaque: true,

    enter() {
      LIVE = api;
      guard('busy on', () => Debug && Debug.busy('title.build', true));
      try {
        Toon.see.clear();
        S.camera = new THREE.PerspectiveCamera(CAM_LEGS[0].fov, ctx.App ? ctx.App.aspect() : 16 / 9, 0.4, 1600);
        S.B = buildBackdrop(ctx);
        S.offResize = ctx.App && ctx.App.onResize ? ctx.App.onResize(() => {
          if (!S.camera) return;
          S.camera.aspect = ctx.App.aspect(); S.camera.updateProjectionMatrix();
        }) : null;
        S.leg = 0; S.seg = 0; S.legT = 0; S.t = 0;
        flyCamera(0);
        S.dom = makeDom();
        applySettings();
        startMusic();
        toSweep();
      } catch (e) { oops('enter', e); S.phase = 'sweep'; }
      guard('busy off', () => Debug && Debug.busy('title.build', false));
    },

    exit() {
      S.phase = 'off';
      guard('resize off', () => S.offResize && S.offResize());
      closeAll();
      guard('dom', () => S.dom && S.dom.remove());
      guard('vignette', () => Transitions.vignette(0, { ms: 0 }));
      guard('view dispose', () => S.B && S.B.view && S.B.view.dispose && S.B.view.dispose());
      guard('rig dispose', () => S.B && S.B.rig && S.B.rig.dispose && S.B.rig.dispose());
      guard('scene dispose', () => S.B && S.B.scene && Assets.disposeObject(S.B.scene));
      guard('see clear', () => Toon.see.clear());
      S.B = null; S.camera = null; S.dom = null;
      if (LIVE === api) LIVE = null;
    },

    pause() {},
    resume() {},

    update(dt) {
      S.t += dt;
      if (S.phase === 'off' || S.phase === 'leaving') return;
      flyCamera(dt);
    },

    render(alpha) {
      const B = S.B, cam = S.camera;
      if (!B || !B.scene || !cam) return;
      void alpha;
      const t = ctx.App && ctx.App.clock ? ctx.App.clock.time : S.t;
      const dt = Math.max(0, Math.min(0.1, t - (S.renderT == null ? t : S.renderT)));
      S.renderT = t;
      guard('toon tick', () => Toon.tick(t));
      // focus: null — the see-through pass stays off, so a cinematic never dissolves its own trees
      guard('view update', () => B.view && B.view.update && B.view.update(t, dt, { camera: cam, player: null, field: null }));
      if (B.rig) guard('rig follow', () => B.rig.follow(look));
      if (B.blobs) guard('blobs', () => B.blobs.commit());
      ctx.App.render(B.scene, cam);
    },

    onInput(btn) {
      if (S.busy) return true;
      // the storybook is skippable before anything else gets the button
      if (S.phase === 'intro' && (btn === 'cancel' || btn === 'menu')) { if (S.skip) S.skip(true); return true; }
      if (UI && UI.input(btn)) return true;
      if (S.phase === 'sweep' && (btn === 'confirm' || btn === 'menu')) { toMenu(); return true; }
      if (S.phase === 'menu' && btn === 'cancel') { toSweep(); return true; }
      return true;
    },
  };

  const api = {
    S, scene,
    describe() {
      const cam = S.camera;
      const c = guard('describe continue', () => continueWords(), { any: false });
      return {
        phase: S.phase, name: heroName, leg: S.leg, seg: S.seg, segs: CAM_PATH.length, legT: +S.legT.toFixed(2), music: S.music,
        hours: GOLDEN_HOUR, fallback: !!(S.B && S.B.fallback), buildMs: S.B ? S.B.buildMs : 0,
        camera: cam ? { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2), fov: cam.fov } : null,
        look: { x: +look.x.toFixed(2), y: +look.y.toFixed(2), z: +look.z.toFixed(2) },
        hasSave: !!c.any, slots: (c.slots || []).map((s) => ({ slot: s.slot, status: s.status, hero: s.hero, level: s.level, place: s.placeName })),
        logo: !!(S.dom && S.dom.querySelector('canvas.logo')),
        press: S.phase === 'sweep',
        widgets: ['menu', 'sub', 'grid', 'nameWin', 'box'].filter((k) => !!S[k]),
        settings: Object.assign({}, settings),
      };
    },
    go(phase) {
      if (phase === 'sweep') { toSweep(); return api.describe(); }
      if (phase === 'menu') { toMenu(); return api.describe(); }
      if (phase === 'slots') { toMenu('continue'); toSlots(); return api.describe(); }
      if (phase === 'options') { toMenu('settings'); toOptions(); return api.describe(); }
      if (phase === 'naming') { toNaming(); return api.describe(); }
      if (phase === 'intro') { run(toIntro()); return api.describe(); }
      if (phase === 'game') {
        closeAll();
        const keep = heroName;
        run(intoTheGame(() => {
          guard('newGame', () => Save && Save.newGame());
          setHeroName(keep);
          Scenes.replace('field', { map: 'meadow' });
        }).then(() => { setHeroName(keep); }));
        return { phase: 'leaving' };
      }
      return { ok: false, reason: `no title phase "${phase}"`, phases: ['sweep', 'menu', 'slots', 'options', 'naming', 'intro', 'game'] };
    },
  };
  return scene;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the hero's name
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Set the name everywhere it is read: the dialogue token %HERO%, the party roster, the save summary. */
function setHeroName(name) {
  const clean = String(name || '').replace(/[^\p{L}\p{N}'’-]/gu, '').slice(0, MAX_NAME) || DEFAULT_NAME;
  heroName = clean;
  guard('vars', () => { if (CTX && CTX.vars) CTX.vars.HERO = clean; });
  // Apply now (Roster may already be loaded) and again after a short tick so Save.newGame() cannot wipe it
  // by finishing after this call returns (P01 gap #2).
  const paint = () => {
    import('../battle/scene.js').then((m) => {
      guard('roster rename', () => {
        const R = m && m.Roster;
        if (!R || typeof R.ensure !== 'function') return;
        const party = R.ensure();
        const h = Array.isArray(party) ? (party.find((p) => p && p.id === 'hero') || party[0]) : null;
        if (h) h.name = clean;
      });
    }, (e) => oops('roster import', e));
  };
  paint();
  try { setTimeout(paint, 80); setTimeout(paint, 400); } catch (_) {}
  return clean;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// install
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** ?title=0 | ?title=off | ?title=false | ?skiptitle — boot straight into the field instead of the title. */
function skipTitle() {
  return guard('url', () => {
    const q = new URLSearchParams(location.search);
    if (q.has('skiptitle')) return true;
    const v = (q.get('title') || '').toLowerCase();
    return v === '0' || v === 'off' || v === 'false' || v === 'no';
  }, false);
}

export function install(ctx = {}) {
  CTX = ctx;
  if (!ctx.Scenes || !ctx.Scenes.register) return;
  loadSettings();
  applySettings();

  // the chosen name travels with the save, so Carry On shows the right boy
  guard('save register', () => {
    if (!ctx.Save || typeof ctx.Save.register !== 'function') return;
    ctx.Save.register('hero', {
      save: () => ({ name: heroName }),
      load: (v) => { if (v && typeof v.name === 'string') setHeroName(v.name); },
      summary: (v) => (v && typeof v.name === 'string' ? { hero: v.name } : null),
      reset: () => { heroName = DEFAULT_NAME; guard('vars reset', () => { if (ctx.vars) ctx.vars.HERO = DEFAULT_NAME; }); },
    });
  });

  ctx.Scenes.register('title', createTitleScene);

  // THIS IS THE PIECE THAT DECIDES WHERE THE GAME OPENS. ?title=0 (or ?skiptitle) boots straight into the field
  // exactly as main.js did before P01 landed — an escape hatch for an old scenario or a critic who wants the
  // field in the first frame. The scene stays registered either way, so __DQ.goto('title') and __DQ.toTitle()
  // still work from inside the game.
  if (ctx.boot && !skipTitle()) { ctx.boot.scene = 'title'; ctx.boot.ctx = {}; ctx.boot.newGame = false; }

  const D = ctx.Debug;
  if (D) {
    guard('provide', () => D.provide('title', () => (LIVE ? LIVE.describe() : { phase: 'off', name: heroName, settings: Object.assign({}, settings) })));
    guard('expose title', () => D.expose('title', (phase) => {
      if (!LIVE) return { ok: false, reason: 'the title is not on the scene stack; try __DQ.toTitle() or __DQ.goto("title")' };
      return phase === undefined ? LIVE.describe() : LIVE.go(String(phase));
    }));
    guard('expose titleName', () => D.expose('titleName', (name) => (name === undefined ? heroName : setHeroName(name))));
    guard('expose toTitle', () => D.expose('toTitle', () => {
      // Save.endGame() clears any autosave still waiting on its minimum gap, so write the place down FIRST:
      // going back to the title must never cost a child the ground they walked.
      let kept = false;
      guard('flush autosave', () => {
        if (!ctx.Save || !ctx.Save.inGame || typeof ctx.Save.write !== 'function') return;
        const r = ctx.Save.write('auto', { reason: 'title' });
        kept = !!(r && r.ok);
      });
      guard('endGame', () => ctx.Save && ctx.Save.endGame && ctx.Save.endGame());
      ctx.Scenes.reset('title');
      return { ok: true, scene: ctx.Scenes.top(), autosaved: kept };
    }));
    guard('expose titleSettings', () => D.expose('titleSettings', (o) => {
      if (o && typeof o === 'object') { Object.assign(settings, o); applySettings(); saveSettings(); }
      return Object.assign({}, settings);
    }));
  }
}

export default install;
