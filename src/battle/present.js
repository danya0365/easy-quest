/**
 * present.js — battle presentation: terrain-matched backdrop, battle camera, monsters idling, hits, damage pops,
 * shake, flashes, the victory tally and the monster-joins moment.                (P15, owner: src/battle/present.js)
 *
 * PLUGIN: main.js imports this file once and calls install(ctx). The battle scene (src/battle/scene.js) then calls
 * `createPresenter(...)` for each fight, so the scene holds the rules and this file holds every mesh, pixel and pop.
 *
 * THE STAGE — "a backdrop matching the terrain you were on"
 *   There is no painted backdrop: the fight happens on the map you were standing on. The presenter borrows the live
 *   field world (Field.world(): its THREE.Scene, its map, its light rig and its map `view` animation) and puts the
 *   monsters in an arc four or five paces in front of the hero, standing on real ground (map.walkY). The battle
 *   camera sits just in front of the hero's shoulder at about 13 degrees, so you are looking at the monsters out of
 *   the party's own eyes — classic DQ framing — with the real sky, the real hills and the real grass behind them.
 *   When there is no field (a demo, __DQ.goto('battle')), a small sky + ground diorama stands in so a fight is
 *   never a black screen.
 *
 * THE BEATS (docs/SYSTEMS-BIBLE §7, §10; the event shapes are docs/DATA-SHAPES §6.1)
 *   monsters drop in from above with a 90 ms stagger and land with a squash · gentle camera drift, always moving
 *   · the camera pushes 8% toward the acting pair · lunges (Monsters.play('attack')) · white hit flash and a flinch
 *   (Monsters.onHit) · damage numbers that spring to 1.15x and float up · gold and 1.6x on a crit, with a 6 px
 *   screen shake and a white frame · misses whiff with no number · defeat poofs · HP bars that ease, never snap
 *   · the red telegraph chevron at 2 Hz with the big-attack cooldown dots · the target cursor over the monster the
 *   cursor is on · the victory tally, the SYSTEMS §10.2 level-up panel (gains one per 220 ms, a star at +5) and its
 *   spell card · the monster hopping back on to ask to join.
 *
 *   const P = createPresenter({ ctx, area, terrain });
 *   P.setEnemies(snapshot.enemies); P.setParty(snapshot); P.play(event); P.update(dt); P.render(alpha);
 *   await P.levelUp(ev);  P.join(ev);  P.dispose();
 *
 * Art comes from the pieces that own it and nothing else: Monsters.build (P16), PAL (F3), the .dq-win look (F4).
 */
import * as THREE from 'three';
import { App } from '../engine/app.js';
import { reportError } from '../engine/debug.js';
import { PAL, C3 } from '../art/palette.js';
import { Toon, makeLightRig } from '../art/toon.js';
import { Monsters } from '../art/monsters.js';
import { UI } from '../ui/window.js';
import { Transitions } from '../ui/transitions.js';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const guard = (where, fn) => { try { return fn(); } catch (e) { reportError('P15 ' + where, e); return undefined; } };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the overlay CSS — the F4 window look (.dq-win from ui.css) plus the things only a battle has
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const BATTLE_CSS = `
.dqb{position:absolute;inset:0;z-index:20;pointer-events:none;overflow:hidden;--u:1px;
  font-family:var(--dq-font);color:var(--dq-ink);-webkit-font-smoothing:antialiased;user-select:none}
.dqb *{box-sizing:border-box}
.dqb .dq-win{white-space:nowrap}
/* party status along the top */
.dqb-party{position:absolute;left:calc(14 * var(--u));right:calc(14 * var(--u));top:calc(12 * var(--u));
  display:flex;gap:calc(9 * var(--u));align-items:flex-start;justify-content:flex-start}
.dqb-pm{position:relative!important;flex:0 1 calc(224 * var(--u));min-width:calc(150 * var(--u));
  padding:calc(9 * var(--u)) calc(16 * var(--u))!important;font-size:calc(24 * var(--u));line-height:1.26;
  transition:transform .16s ease-out;animation:dqbWinIn .18s ease-out}
.dqb-pm .nm{display:flex;justify-content:space-between;align-items:baseline;gap:calc(8 * var(--u))}
.dqb-pm .nm .n{overflow:hidden;text-overflow:ellipsis}
.dqb-pm .nm small{font-size:.62em;color:var(--dq-label);flex:0 0 auto}
.dqb-pm .row{display:flex;justify-content:space-between;align-items:baseline}
.dqb-pm .row .lab{color:var(--dq-label);font-size:.76em;letter-spacing:.08em}
.dqb-pm .row .v{font-variant-numeric:tabular-nums}
.dqb-pm .bar{height:calc(6 * var(--u));border-radius:calc(3 * var(--u));background:var(--dq-rim);
  margin:calc(2 * var(--u)) 0 calc(3 * var(--u));overflow:hidden}
.dqb-pm .bar i{display:block;height:100%;background:var(--dq-green);transition:width .26s ease-out}
.dqb-pm .tac{font-size:.6em;letter-spacing:.06em;color:var(--dq-gold);min-height:1.25em;overflow:hidden;text-overflow:ellipsis}
.dqb-pm .tac.st{color:var(--dq-purple)}
.dqb-pm.low .v.hp{color:var(--dq-orange)} .dqb-pm.low .bar i{background:var(--dq-orange)}
.dqb-pm.ko{filter:grayscale(.85) brightness(.74)} .dqb-pm.ko .v.hp{color:var(--dq-red)}
.dqb-pm.active{transform:translateY(calc(7 * var(--u))) scale(1.04)}
.dqb-pm.hit{animation:dqbHit .24s linear}
.dqb-pm.healed{animation:dqbHeal .5s ease-out}
.dqb-pm.lvup{animation:dqbLv 1.3s ease-out}
.dqb-wagon{flex:0 0 calc(150 * var(--u))!important;font-size:calc(19 * var(--u))!important;opacity:.94}
.dqb-wagon .wl{font-size:.7em;color:var(--dq-title-ink);letter-spacing:.09em}
.dqb-wagon .wr{display:flex;justify-content:space-between;gap:calc(6 * var(--u))}
.dqb-wagon .wr.ko{color:var(--dq-dim)}
@keyframes dqbWinIn{from{transform:scale(.94) translateY(calc(-6 * var(--u)));opacity:.2}to{transform:none;opacity:1}}
@keyframes dqbHit{0%,100%{translate:0}20%{translate:calc(-7 * var(--u)) 0}60%{translate:calc(6 * var(--u)) 0}}
@keyframes dqbHeal{50%{filter:brightness(1.35) saturate(1.3)}}
@keyframes dqbLv{0%,100%{filter:none}20%,60%{filter:brightness(1.45) sepia(.3) saturate(1.6)}}
/* who is out there: the monster name-and-count window */
.dqb-foes{position:absolute!important;right:calc(14 * var(--u));top:calc(120 * var(--u));
  padding:calc(12 * var(--u)) calc(18 * var(--u))!important;font-size:calc(23 * var(--u));line-height:1.34;
  animation:dqbWinIn .18s ease-out;max-width:calc(300 * var(--u))}
.dqb-foes .fr{display:flex;justify-content:space-between;gap:calc(14 * var(--u))}
.dqb-foes .fr .c{color:var(--dq-label)}
.dqb-foes .fr.gone{color:var(--dq-dim);text-decoration:line-through}
/* over the monsters */
.dqb-plate{position:absolute;transform:translate(-50%,0);font-size:calc(19 * var(--u));white-space:nowrap;
  letter-spacing:.04em;text-shadow:0 calc(2 * var(--u)) 0 var(--dq-ink-shadow),0 0 calc(5 * var(--u)) var(--dq-ink-shadow)}
.dqb-plate .dots{display:flex;gap:calc(4 * var(--u));justify-content:center;height:calc(9 * var(--u))}
.dqb-plate .dots i{width:calc(7 * var(--u));height:calc(7 * var(--u));border-radius:50%;background:var(--dq-ink);
  box-shadow:0 0 0 calc(1.5 * var(--u)) var(--dq-ink-shadow)}
.dqb-chev{position:absolute;transform:translate(-50%,0);font-size:calc(42 * var(--u));line-height:1;color:var(--pal-flower-red);
  text-shadow:0 calc(3 * var(--u)) 0 var(--dq-edge),calc(2.5 * var(--u)) 0 0 var(--dq-edge),
    calc(-2.5 * var(--u)) 0 0 var(--dq-edge),0 calc(-2.5 * var(--u)) 0 var(--dq-edge),
    0 0 calc(12 * var(--u)) var(--dq-ink-shadow);animation:dqbChev .5s infinite}
.dqb-pick{position:absolute;transform:translate(-50%,-100%);width:0;height:0;
  border-left:calc(17 * var(--u)) solid transparent;border-right:calc(17 * var(--u)) solid transparent;
  border-top:calc(26 * var(--u)) solid var(--dq-gold);
  filter:drop-shadow(0 calc(2 * var(--u)) 0 var(--dq-ink-shadow));animation:dqbChev .6s infinite}
@keyframes dqbChev{50%{translate:0 calc(-11 * var(--u));opacity:.78}}
.dqb-pop{position:absolute;transform:translate(-50%,0);font-size:calc(50 * var(--u));font-weight:900;
  color:var(--dq-ink);font-variant-numeric:tabular-nums;white-space:nowrap;
  text-shadow:0 calc(3 * var(--u)) 0 var(--dq-ink-shadow),0 0 calc(8 * var(--u)) var(--dq-ink-shadow);
  animation:dqbPop 1.15s ease-out forwards}
.dqb-pop.crit{color:var(--dq-gold);font-size:calc(80 * var(--u))}
.dqb-pop.heal{color:var(--dq-green)}
.dqb-pop.hurt{color:var(--dq-orange)}
.dqb-pop.miss{font-size:calc(27 * var(--u));color:var(--dq-label)}
.dqb-pop.lv{color:var(--dq-gold);font-size:calc(29 * var(--u));letter-spacing:.09em}
@keyframes dqbPop{0%{transform:translate(-50%,calc(14 * var(--u))) scale(.4)}
  13%{transform:translate(-50%,calc(-8 * var(--u))) scale(1.15)}
  24%{transform:translate(-50%,calc(-12 * var(--u))) scale(1)}
  64%{transform:translate(-50%,calc(-26 * var(--u))) scale(1);opacity:1}
  100%{transform:translate(-50%,calc(-52 * var(--u))) scale(.96);opacity:0}}
/* the level-up panel (SYSTEMS §10.2) */
.dqb-lv{position:absolute!important;right:calc(16 * var(--u));bottom:calc(250 * var(--u));
  width:calc(356 * var(--u));padding:calc(26 * var(--u)) calc(22 * var(--u)) calc(14 * var(--u))!important;
  font-size:calc(24 * var(--u));animation:dqbPanelIn .2s ease-out}
@keyframes dqbPanelIn{from{transform:translateX(calc(44 * var(--u)));opacity:0}to{transform:none;opacity:1}}
.dqb-lv .r{display:flex;align-items:baseline;gap:calc(10 * var(--u));line-height:calc(33 * var(--u))}
.dqb-lv .r .lab{color:var(--dq-label);flex:1}
.dqb-lv .r .tot{font-variant-numeric:tabular-nums;min-width:calc(54 * var(--u));text-align:right}
.dqb-lv .r .up{color:var(--dq-gold);min-width:calc(58 * var(--u));text-align:right}
.dqb-lv .r .up.none{color:var(--dq-dim)}
.dqb-lv .r .up.big::after{content:" \\2605";font-size:.8em}
.dqb-lv .r.hide{visibility:hidden}
.dqb-lv .card{text-align:center;padding:calc(8 * var(--u)) 0 calc(4 * var(--u))}
.dqb-lv .card .nm{font-size:calc(34 * var(--u));color:var(--dq-gold)}
.dqb-lv .card .mp{color:var(--dq-label);font-size:calc(19 * var(--u))}
.dqb-lv .card .bl{white-space:normal;font-size:calc(21 * var(--u));line-height:1.32;margin-top:calc(7 * var(--u))}
`;

let styled = false;
function injectCss() {
  if (styled) return;
  styled = true;
  guard('css', () => {
    const st = document.createElement('style');
    st.id = 'dq-battle-css';
    st.textContent = BATTLE_CSS;
    document.head.appendChild(st);
  });
}

/**
 * The species P16 has not modelled yet stand in as the nearest shape it has, so a fight is never a blank space; the
 * nameplate still says who it really is and state().stage marks it `standIn`. (NEEDS P16: models for these.)
 */
export const STAND_IN = {
  squidgeon: 'flapjack', thunderpuff: 'flapjack', vesperling: 'flapjack', wyrmsley: 'flapjack',
  dune_buggy: 'grumbleglop', barrowmole: 'grumpleroot', tidewarden: 'grumbleglop',
  candelabracadabra: 'clankworthy', jinglebottom: 'clankworthy', sir_cumference: 'clankworthy',
  hexcalibur: 'clankworthy', iron_governess: 'clankworthy',
  lady_mothbonnet: 'boohoo', sexton_sootbell: 'boohoo', mortmain: 'boohoo', mortmain_scripted: 'boohoo',
  mortmain_enfolded: 'boohoo', hush: 'boohoo', hark: 'boohoo', malgrim_cocoon: 'gloopold',
  malgrim_unravelling: 'boohoo', grimalkitten: 'pip', sunspot_cub: 'pip',
  mirthquake: 'boulderdash', hoarfax: 'sunmane',
};
export const modelId = (species) => (Monsters.has(species) ? species
  : (STAND_IN[species] && Monsters.has(STAND_IN[species]) ? STAND_IN[species] : 'gloop'));
export const isStandIn = (species) => !Monsters.has(species);

/** Terrain -> the light preset a fight there is lit with (the map's own rig preset wins when we borrow the field). */
export const TERRAIN_LIGHT = { cave: 'cave', dungeon: 'cave', interior: 'interior', night: 'night', dusk: 'dusk' };

/** The map ground names (map.groundAt) as Tex recipes, for the no-field diorama. */
const DIORAMA_TEX = { grass: 'grass', dirt: 'dirt', stone: 'stone', cobble: 'cobble', wood: 'wood', sand: 'sand', snow: 'snow', water: 'water', cave: 'stone' };

/** The backdrop is the real world, so it is dimmed a touch while a fight is on: the monsters have to pop. */
const BASE_VIG = 0.3;

const HOLD_SFX = { fire: 'fire', ice: 'ice', wind: 'wind', lightning: 'lightning' };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the presenter
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function createPresenter({ ctx = {}, terrain = 'grass', light = null, onSfx = null } = {}) {
  injectCss();
  const Sfx = ctx.Sfx;
  const sfx = (id, opts) => {
    if (typeof onSfx === 'function') { try { onSfx(id, opts); } catch (_) { /* logged by the caller */ } }
    guard('sfx ' + id, () => { if (Sfx && ctx.Audio && ctx.Audio.ready) Sfx.play(id, opts); });
  };

  const S = {
    scene: null, camera: null, borrowed: false, own: null, rig: null, map: null, terrain, light,
    origin: new THREE.Vector3(), anchor: null, range: 5, yaw: 0, models: new Map(), fitTop: 0.9, dist: 6, look: 1.2,
    shake: 0, push: 0, pushTo: 0, drift: 0, t: 0, activeId: null, targetId: null, vm: {},
    order: { party: [], wagon: [], enemies: [] }, partyKey: '', foeKey: '', built: false, buildMs: 0,
    panel: null, dropped: 0, disposed: false, layer: null, els: {}, pops: 0, instant: false,
  };

  // ── the overlay layer ──────────────────────────────────────────────────────────────────────────────────────
  guard('layer', () => {
    UI.install();
    let host = document.getElementById('ui-root');
    if (!host) { host = document.createElement('div'); host.id = 'ui-root'; host.style.cssText = 'position:absolute;inset:0;pointer-events:none'; document.body.appendChild(host); }
    const el = document.createElement('div');
    el.className = 'dqb';
    el.innerHTML = '<div class="dqb-party"></div><div class="dqb-marks"></div>';
    host.appendChild(el);
    S.layer = el;
    S.els = { party: el.querySelector('.dqb-party'), marks: el.querySelector('.dqb-marks') };
    fitUnits();
  });

  function fitUnits() {
    if (!S.layer) return;
    const u = UI.unit || Math.min(innerWidth / 1280, innerHeight / 720);
    S.layer.style.setProperty('--u', u + 'px');
    S.u = u;
  }

  // ── the stage: borrow the field, or build a small diorama ──────────────────────────────────────────────────
  function buildStage() {
    const t0 = performance.now();
    const w = guard('field world', () => (ctx.Field && typeof ctx.Field.world === 'function' ? ctx.Field.world() : null));
    if (w && w.scene && w.map) {
      S.scene = w.scene; S.map = w.map; S.rig = w.lightRig; S.view = w.view; S.borrowed = true;
      const p = w.player && w.player.p ? w.player.p : { x: 0, z: 0, yaw: 0 };
      S.playerPos = { x: p.x, y: p.y || 0, z: p.z };
      // stand the monsters in the first clear direction, starting with the way the hero is facing
      // Monsters stand on ground you could walk on: not inside a wall, not out in the stream.
      const standable = (x, z) => {
        try { return S.map.clear(x, z, 2.0) && !S.map.solidAt(x, z) && S.map.groundAt(x, z) !== 'water'; }
        catch (_) { return true; }
      };
      let yaw = p.yaw || 0;
      for (let i = 0; i < 12; i++) {
        const a = yaw + (i ? ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 30 * DEG) : 0);
        const cx = p.x + Math.sin(a) * 5.0, cz = p.z + Math.cos(a) * 5.0;
        if ((standable(cx, cz) && standable(p.x + Math.sin(a) * 3.2, p.z + Math.cos(a) * 3.2)) || i === 11) { yaw = a; break; }
      }
      S.yaw = yaw;
      S.anchor = { x: p.x, z: p.z };
      setOrigin(5.0);
      S.terrain = guard('ground', () => S.map.groundAt(p.x, p.z)) || terrain;
    } else {
      buildDiorama();
    }
    S.camera = new THREE.PerspectiveCamera(44, App.aspect(), 0.3, 1400);
    S.built = true;
    S.buildMs = Math.round(performance.now() - t0);
    placeCamera(1);
  }

  /** No field on the stack (a demo page, __DQ.goto('battle')): a warm little diorama, never a black screen. */
  function buildDiorama() {
    const scene = S.own = new THREE.Scene();
    scene.background = C3(PAL.sky.page);
    S.scene = scene;
    S.borrowed = false;
    S.playerPos = { x: 0, y: 0, z: 6.5 };
    S.yaw = Math.PI;                                   // facing -z, monsters at the origin
    S.anchor = { x: 0, z: 6.5 };
    S.origin.set(0, 0, 0);
    guard('diorama light', () => { S.rig = makeLightRig({ scene, preset: (light || 'day'), extent: 16 }); });
    guard('diorama ground', () => {
      const geo = new THREE.CircleGeometry(64, 56);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, Toon.surface(DIORAMA_TEX[S.terrain] || 'grass', { worldPlanar: true }));
      mesh.receiveShadow = true;
      mesh.name = 'battle-diorama-ground';
      scene.add(mesh);
      const back = new THREE.Mesh(new THREE.SphereGeometry(320, 28, 18),
        new THREE.MeshBasicMaterial({ color: C3(PAL.sky.upper), side: THREE.BackSide, fog: false }));
      back.name = 'battle-diorama-sky';
      scene.add(back);
    });
    S.map = null;
  }

  const groundAt = (x, z) => (S.map ? (guard('walkY', () => S.map.walkY(x, z)) || 0) : 0);

  /** Put the monster line `range` paces in front of the party, on real ground. */
  function setOrigin(range) {
    const a = S.anchor || { x: 0, z: 0 };
    S.range = range;
    S.origin.set(a.x + Math.sin(S.yaw) * range, 0, a.z + Math.cos(S.yaw) * range);
    S.origin.y = groundAt(S.origin.x, S.origin.z);
  }

  /**
   * DQ framing: the party windows own the top of the screen and the command / message windows the bottom, so the
   * monsters live in the band between. A slime fills about a quarter of the frame's height, something the size of a
   * boss nearly half of it — and the whole line is stood far enough out that the camera never ends up behind the
   * hero's head.
   */
  function frame(W, top) {
    const tanH = Math.tan((S.camera ? S.camera.fov : 44) / 2 * DEG);
    const tanW = tanH * Math.max(0.6, App.aspect());
    const hFrac = clamp(0.26 + 0.05 * top, 0.26, 0.36);
    S.dist = Math.max(2.9, (top * 0.5) / tanH / hFrac, (W * 0.5 + 0.5) / tanW / 0.68);
    return Math.max(5.0, S.dist + 1.5);
  }

  // ── monsters ───────────────────────────────────────────────────────────────────────────────────────────────
  /** Lay the enemies out in a gentle arc facing the camera and fit the camera to them (DQ framing). */
  function setEnemies(snapEnemies, { drop = true } = {}) {
    if (S.disposed) return;
    for (const v of S.models.values()) guard('dispose model', () => { if (v.m.root.parent) v.m.root.parent.remove(v.m.root); v.m.dispose(); });
    S.models.clear();
    const list = (snapEnemies || []).filter((e) => e.alive);
    const built = [];
    for (const e of list) {
      const m = guard('build ' + e.species, () => Monsters.build(modelId(e.species)));
      if (!m) continue;
      const scale = e.boss ? Math.max(1.4, 1.7 / Math.max(0.35, m.height)) : 1;
      m.root.scale.setScalar(scale);
      built.push({ e, m, scale, r: Math.max(0.25, m.radius * scale), h: m.height * scale });
    }
    const gap = 0.55;
    let W = 0, top = 0;
    built.forEach((b, i) => {
      W += b.r * 2 + (i ? gap : 0);
      const hover = guard('hover', () => (b.m._template && b.m._template.spec && b.m._template.spec.hover) || 0) || 0;
      b.top = b.h + hover * b.scale;
      top = Math.max(top, b.top);
    });
    S.groupW = W;
    S.fitTop = Math.max(0.55, top);
    setOrigin(frame(W, S.fitTop));
    let x = -W / 2;
    const fwd = { x: Math.sin(S.yaw), z: Math.cos(S.yaw) };
    const right = { x: Math.cos(S.yaw), z: -Math.sin(S.yaw) };
    built.forEach((b, i) => {
      if (i) x += gap;
      const cx = x + b.r; x += b.r * 2;
      const t = W > 0 ? cx / (W / 2 + 1e-6) : 0;
      const back = 0.42 * t * t * Math.min(1, W / 3);                 // the ends of the arc stand a touch further off
      const wx = S.origin.x + right.x * cx + fwd.x * back;
      const wz = S.origin.z + right.z * cx + fwd.z * back;
      const wy = groundAt(wx, wz);
      b.m.root.position.set(wx, wy + (drop ? 3.4 + i * 0.55 : 0), wz);
      b.m.root.rotation.y = S.yaw + Math.PI + (Math.random() - 0.5) * 0.12;   // facing the camera / the party
      S.scene.add(b.m.root);
      S.models.set(b.e.id, { m: b.m, species: b.e.species, x: wx, y: wy, z: wz, local: cx,
        dropT: drop ? -i * 0.14 : 1, scale: b.scale, h: b.h, gone: false, landed: !drop });
    });
    S.dropped = drop ? 0 : 1;
    if (drop) sfx('wagon_rattle', { vol: 0.35 });
    placeCamera(1);
    renderFoes(true);
  }

  // ── camera ─────────────────────────────────────────────────────────────────────────────────────────────────
  // Where the middle of the monster band sits, as a fraction of the half-frame above centre: a slime sits a touch
  // high (there is a lot of empty grass under it), something boss-sized sits lower so its head — and the red
  // telegraph chevron over it — is clear of the party windows.
  const band = () => 0.13 - Math.min(0.075, Math.max(0, (S.fitTop - 0.9)) * 0.035);
  const V = new THREE.Vector3();
  function placeCamera(dt) {
    if (!S.camera) return;
    S.push += ((S.pushTo || 0) - S.push) * Math.min(1, dt * 6);
    S.shake = Math.max(0, S.shake - dt * 2.7);
    S.drift += dt;
    const d = S.dist * (1 - 0.08 * S.push);
    const sway = Math.sin(S.drift * 0.38) * 2.6 * DEG + Math.sin(S.drift * 0.21 + 1.1) * 1.4 * DEG;
    const bob = Math.sin(S.drift * 0.53) * 0.035;
    const pitch = (13 + Math.sin(S.drift * 0.27) * 1.1) * DEG;
    const s = S.shake * S.shake * 0.075;
    const sx = s * (Math.random() - 0.5), sy = s * (Math.random() - 0.5);
    const tanH = Math.tan(S.camera.fov / 2 * DEG);
    const centreY = S.origin.y + S.fitTop * 0.52;
    const lookY = centreY - band() * tanH * d + bob;
    S.look = lookY;
    const yaw = S.yaw + Math.PI + sway;              // stand behind the monsters' front, looking back at them
    const cx = S.origin.x + Math.sin(yaw) * Math.cos(pitch) * d;
    const cz = S.origin.z + Math.cos(yaw) * Math.cos(pitch) * d;
    S.camera.position.set(cx + sx, lookY + Math.sin(pitch) * d + sy, cz);
    S.camera.lookAt(S.origin.x, lookY, S.origin.z);
    S.camera.aspect = App.aspect();
    S.camera.updateProjectionMatrix();
  }

  /** Screen position (design px) of a point on a monster: 'top' (clear of the head), 'head', 'center' or 'base'. */
  function screenOf(id, where = 'top') {
    const v = S.models.get(id);
    if (!v || !S.camera) return null;
    if (where === 'head') V.set(0, v.h, 0).add(v.m.root.position);
    else {
      const local = where === 'top' ? guard('top', () => v.m.top()) : where === 'center' ? guard('center', () => v.m.center()) : new THREE.Vector3();
      V.copy(local || new THREE.Vector3()).multiplyScalar(v.scale).add(v.m.root.position);
    }
    V.project(S.camera);
    if (V.z > 1) return null;
    const u = S.u || UI.unit || 1;
    const W = S.layer ? S.layer.clientWidth : innerWidth;
    const H = S.layer ? S.layer.clientHeight : innerHeight;
    const y = (1 - V.y) / 2 * H / u;
    return { x: (V.x + 1) / 2 * W / u, y: where === 'top' ? Math.max(178, y) : Math.min(462, y) };
  }

  // ── DOM: party status, the foe window, plates, pops ────────────────────────────────────────────────────────
  const cssId = (id) => (window.CSS && window.CSS.escape ? window.CSS.escape(String(id)) : String(id).replace(/[^\w-]/g, '\\$&'));
  const elOf = (id) => (S.layer ? S.layer.querySelector(`[data-id="${cssId(id)}"]`) : null);
  function pulse(node, cls, ms) {
    if (!node) return;
    node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
    setTimeout(() => { try { node.classList.remove(cls); } catch (_) {} }, ms);
  }
  function popAt(x, y, text, cls) {
    if (!S.els.marks || S.instant) return;
    const s = document.createElement('div');
    s.className = 'dqb-pop ' + (cls || '');
    s.textContent = text;
    s.style.left = `calc(${x.toFixed(1)} * var(--u))`;
    s.style.top = `calc(${y.toFixed(1)} * var(--u))`;
    S.els.marks.appendChild(s);
    S.pops++;
    setTimeout(() => { try { s.remove(); } catch (_) {} }, 1200);
  }
  function popOn(id, text, cls) {
    if (S.models.has(id)) {
      const p = screenOf(id, 'top');
      if (p) popAt(p.x, p.y - 12, text, cls);
      return;
    }
    const node = elOf(id);
    if (!node || !S.layer) return;
    const r = node.getBoundingClientRect(), b = S.layer.getBoundingClientRect(), u = S.u || 1;
    popAt((r.left + r.width / 2 - b.left) / u, (r.bottom - b.top) / u - 6, text, cls);
  }

  function setParty(snap) {
    if (!snap || !S.els.party) return;
    for (const p of (snap.party || []).concat(snap.wagon || [])) {
      S.vm[p.id] = Object.assign({}, S.vm[p.id] || {}, p, { tags: new Set(p.status || []) });
    }
    for (const e of snap.enemies || []) {
      const old = S.vm[e.id] || {};
      S.vm[e.id] = Object.assign({}, old, e, { tele: !!e.telegraphing,
        state: e.alive ? '' : (old.state || (e.gone === 'spared' ? 'spared' : e.gone === 'fled' ? 'fled' : 'gone')) });
    }
    S.order.party = (snap.party || []).map((p) => p.id);
    S.order.wagon = (snap.wagon || []).map((p) => p.id);
    S.order.enemies = (snap.enemies || []).map((e) => e.id);
    S.wagonReachable = snap.wagonReachable !== false;
    renderParty();
    renderFoes();
  }

  const tacticName = (t) => (ctx.tacticName ? ctx.tacticName(t) : '');
  function renderParty() {
    const bar = S.els.party;
    if (!bar) return;
    const key = S.order.party.join(',') + '|' + S.order.wagon.join(',');
    if (key !== S.partyKey) {
      S.partyKey = key;
      const box = (id) => `<div class="dq-win dq-shown dqb-pm" data-id="${esc(id)}">
        <div class="nm"><span class="n"></span><small class="lv"></small></div>
        <div class="row"><span class="lab">HP</span><span class="v hp"></span></div>
        <div class="bar"><i></i></div>
        <div class="row mp"><span class="lab">MP</span><span class="v mp"></span></div>
        <div class="tac"></div></div>`;
      const row = (id) => `<div class="wr" data-id="${esc(id)}"><span class="n"></span><span class="hpv"></span></div>`;
      bar.innerHTML = S.order.party.map(box).join('')
        + (S.order.wagon.length ? `<div class="dq-win dq-shown dqb-pm dqb-wagon"><div class="wl">WAGON${S.wagonReachable ? '' : ' · OUTSIDE'}</div>${S.order.wagon.map(row).join('')}</div>` : '');
    }
    for (const id of S.order.party.concat(S.order.wagon)) {
      const m = S.vm[id], node = elOf(id);
      if (!m || !node) continue;
      const pct = clamp(100 * m.hp / Math.max(1, m.maxHp), 0, 100);
      const n = node.querySelector('.n'); if (n) n.textContent = m.name;
      const lv = node.querySelector('.lv'); if (lv) lv.textContent = m.guest ? 'guest' : 'Lv ' + m.lvl;
      const hp = node.querySelector('.v.hp') || node.querySelector('.hpv'); if (hp) hp.textContent = m.hp;
      const mp = node.querySelector('.v.mp'); if (mp) mp.textContent = m.maxMp ? `${m.mp}` : '—';
      const bar2 = node.querySelector('.bar i'); if (bar2) bar2.style.width = pct + '%';
      const tac = node.querySelector('.tac');
      if (tac) {
        const st = Array.from(m.tags || []).filter((s) => !/_up$|_down$/.test(s));
        tac.classList.toggle('st', st.length > 0);
        tac.textContent = st.length ? st.join(' · ') : m.guest ? '' : m.leader ? 'Follow Orders' : tacticName(m.tactic);
      }
      node.classList.toggle('ko', m.hp <= 0);
      node.classList.toggle('low', m.hp > 0 && pct < 25);
      node.classList.toggle('active', S.activeId === id);
    }
  }

  /** The monster name-and-count window: "Gloop x2" — who you are actually looking at. */
  function renderFoes(force) {
    if (!S.layer) return;
    const groups = new Map();
    for (const id of S.order.enemies) {
      const e = S.vm[id];
      if (!e) continue;
      const k = e.name.replace(/\s+[A-Z]$/, '');
      const g = groups.get(k) || { n: 0, alive: 0 };
      g.n++; if (e.alive !== false) g.alive++;
      groups.set(k, g);
    }
    const standing = Array.from(groups.values()).reduce((n, g) => n + g.alive, 0);
    const key = Array.from(groups, ([k, g]) => `${k}:${g.alive}/${g.n}`).join('|');
    if (!force && key === S.foeKey) return;
    S.foeKey = key;
    let win = S.layer.querySelector('.dqb-foes');
    if (!groups.size || !standing) { if (win) win.remove(); return; }
    if (!win) {
      win = document.createElement('div');
      win.className = 'dq-win dq-shown dqb-foes';
      S.layer.appendChild(win);
    }
    // Only what is still standing: a beaten species leaves the window, it does not sit there struck through.
    win.innerHTML = Array.from(groups).filter(([, g]) => g.alive > 0).map(([k, g]) =>
      `<div class="fr"><span>${esc(k)}</span>${g.alive > 1 ? `<span class="c">×${g.alive}</span>` : ''}</div>`).join('');
  }

  /** The plates, the telegraph chevrons and the target cursor, re-laid every frame (the camera drifts). */
  function renderMarks() {
    const ov = S.els.marks;
    if (!ov || !S.camera) return;
    let html = '';
    for (const id of S.order.enemies) {
      const e = S.vm[id], v = S.models.get(id);
      if (!e || !v || v.gone || e.alive === false) continue;
      const top = screenOf(id, 'top'), base = screenOf(id, 'base'), head = screenOf(id, 'head');
      if (!top || !base || !head) continue;
      const dots = e.bigCooldown > 0 ? '<i></i>'.repeat(Math.min(3, e.bigCooldown)) : '';
      const stagger = (S.order.enemies.indexOf(id) % 2) * 24;
      html += `<div class="dqb-plate" style="left:calc(${base.x.toFixed(1)} * var(--u));top:calc(${(base.y + 6 + stagger).toFixed(1)} * var(--u))">${esc(e.name)}<div class="dots">${dots}</div></div>`;
      if (e.tele) html += `<div class="dqb-chev" style="left:calc(${top.x.toFixed(1)} * var(--u));top:calc(${Math.max(172, top.y - 46).toFixed(1)} * var(--u))">▼</div>`;
      if (S.targetId === id) html += `<div class="dqb-pick" style="left:calc(${top.x.toFixed(1)} * var(--u));top:calc(${(top.y - 8).toFixed(1)} * var(--u))"></div>`;
    }
    const keep = Array.from(ov.querySelectorAll('.dqb-pop'));
    ov.innerHTML = html;
    for (const p of keep) ov.appendChild(p);
  }

  // ── events -> pictures and sound ───────────────────────────────────────────────────────────────────────────
  const toward = () => new THREE.Vector3(S.camera ? S.camera.position.x : 0, 0.5, S.camera ? S.camera.position.z : 0);

  function play(ev) {
    if (S.disposed || !ev) return;
    const model = (id) => S.models.get(id);
    switch (ev.t) {
      case 'appear': sfx(ev.boss ? 'monster_cry_big' : 'monster_cry_small'); break;
      case 'ambush': sfx(ev.side === 'party' ? 'confirm' : 'monster_cry_big'); break;
      case 'round': S.activeId = null; break;
      case 'act': {
        const v = model(ev.actor);
        if (v) {
          guard('anim', () => v.m.play(ev.kind === 'spell' || ev.nothing ? 'cast' : ev.kind === 'defend' ? 'taunt' : 'attack', { distance: 1.15 }));
          if (S.vm[ev.actor] && ev.big) S.vm[ev.actor].tele = false;
          S.activeId = null; S.pushTo = 0.55;
        } else {
          S.activeId = ev.actor;
          S.pushTo = ev.kind === 'attack' ? 1 : 0.4;
        }
        setTimeout(() => { S.pushTo = 0; }, 440);
        if (ev.kind === 'spell') { sfx('spell_cast'); if (HOLD_SFX[ev.element]) setTimeout(() => sfx(HOLD_SFX[ev.element]), 180); }
        if (ev.kind === 'defend') sfx('buff');
        if (ev.kind === 'item') sfx('item_get', { vol: 0.7 });
        break;
      }
      case 'damage': {
        const t = S.vm[ev.target];
        if (!t) break;
        if (ev.miss) {
          popOn(ev.target, ev.reason === 'immune' ? 'no effect' : ev.reason === 'blocked' ? 'blocked' : 'miss', 'miss');
          sfx('miss');
          break;
        }
        t.hp = ev.hp;
        if (ev.side === 'party') {
          pulse(elOf(ev.target), 'hit', 250);
          popOn(ev.target, String(ev.amount), 'hurt');
          sfx(ev.poison ? 'poison' : 'player_hurt');
          if (!ev.poison) S.shake = Math.max(S.shake, 0.6);
        } else {
          const v = model(ev.target);
          if (v) guard('hit', () => v.m.onHit(toward()));
          popOn(ev.target, String(ev.amount), ev.crit ? 'crit' : '');
          sfx(ev.crit ? 'sword_crit' : ev.element ? 'monster_hurt' : 'sword_hit');
          S.shake = Math.max(S.shake, ev.crit ? 1 : 0.42);
          if (ev.crit) guard('flash', () => Transitions.flash({ ms: 130, alpha: 0.5 }));
        }
        break;
      }
      case 'heal': {
        const t = S.vm[ev.target];
        if (!t) break;
        if (ev.mp) t.mp = Math.min(t.maxMp, (t.mp || 0) + ev.amount);
        else { t.hp = ev.hp; popOn(ev.target, '+' + ev.amount, 'heal'); }
        if (!ev.quiet) sfx('heal');
        pulse(elOf(ev.target), 'healed', 500);
        break;
      }
      case 'revive': {
        const t = S.vm[ev.target];
        if (t) { t.hp = ev.hp; t.alive = true; pulse(elOf(ev.target), 'healed', 520); sfx('heal'); }
        break;
      }
      case 'defeat': {
        const t = S.vm[ev.target];
        if (!t) break;
        t.alive = false; t.hp = 0;
        if (ev.side === 'enemy') {
          t.state = 'gone';
          const v = model(ev.target);
          if (v) { v.gone = true; guard('defeat', () => v.m.play('defeat', { vanish: true })); }
          setTimeout(() => sfx('monster_defeat'), 130);
          renderFoes(true);
        } else sfx('player_hurt', { pitch: 0.7 });
        break;
      }
      case 'spared': {
        const t = S.vm[ev.target];
        if (t) { t.alive = false; t.state = 'spared'; t.tele = false; }
        const v = model(ev.target);
        if (v) { v.gone = true; guard('spare', () => v.m.play('hurt')); }
        renderFoes(true);
        break;
      }
      case 'flee':
        if (ev.side === 'enemy' && S.vm[ev.actor]) {
          S.vm[ev.actor].alive = false; S.vm[ev.actor].state = 'fled';
          const v = model(ev.actor);
          if (v) { v.gone = true; guard('flee', () => v.m.play('defeat', { vanish: true })); }
          sfx('flee');
          renderFoes(true);
        }
        if (ev.side === 'party') sfx(ev.ok ? 'flee' : 'run_away_fail');
        break;
      case 'status': {
        const t = S.vm[ev.target];
        if (!t) break;
        if (t.tags) {
          if (ev.on && !ev.resisted) t.tags.add(ev.status);
          else if (!ev.on) String(ev.status).split(',').forEach((x) => t.tags.delete(x));
        }
        if (ev.on && !ev.resisted && !ev.skip) {
          sfx(/_down$/.test(ev.status) ? 'debuff' : /_up$/.test(ev.status) ? 'buff' : ev.status === 'poison' ? 'poison' : 'debuff');
        }
        break;
      }
      case 'telegraph': {
        const t = S.vm[ev.actor];
        if (t) t.tele = true;
        const v = model(ev.actor);
        if (v) guard('taunt', () => v.m.play('taunt'));
        sfx('monster_cry_big');
        guard('vignette', () => Transitions.vignette(0.58, { ms: 420 }));
        setTimeout(() => { if (!S.disposed) guard('vignette', () => Transitions.vignette(BASE_VIG, { ms: 700 })); }, 1400);
        break;
      }
      case 'swap': {
        const i = S.order.party.indexOf(ev.out), j = S.order.wagon.indexOf(ev.in);
        if (i >= 0 && j >= 0) { S.order.party[i] = ev.in; S.order.wagon[j] = ev.out; S.partyKey = ''; }
        sfx('wagon_rattle');
        break;
      }
      case 'levelup':
        sfx('level_up_sparkle');
        pulse(elOf(ev.who), 'lvup', 1350);
        popOn(ev.who, 'LEVEL UP!', 'lv');
        break;
      case 'victory': {
        // SYSTEMS §10.1: the tally is a moment. The lines type into the window; the numbers also land on the party.
        const first = S.order.party[0];
        if (ev.exp) setTimeout(() => popOn(first, '+' + ev.exp + ' EXP', 'lv'), 520);
        if (ev.gold) setTimeout(() => { sfx('gold_coins'); popOn(S.order.party[Math.min(1, S.order.party.length - 1)], '+' + ev.gold + ' G', 'crit'); }, 900);
        if (ev.drops && ev.drops.length) setTimeout(() => sfx('item_get'), 1400);
        guard('vignette', () => Transitions.vignette(0.12, { ms: 700 }));
        break;
      }
      case 'wipe': guard('white', () => Transitions.white(true, { ms: 1200 })); break;
      case 'fx': if (ev.id === 'darken' || ev.id === 'desaturate') guard('fx', () => Transitions.vignette(0.68, { ms: 500 })); break;
      default: break;
    }
    renderParty();
  }

  // ── the join beat (MONSTER-BIBLE §7 / SYSTEMS §10.3) ───────────────────────────────────────────────────────
  /** SYSTEMS §10.3: it pops back in where it fell, a little larger than it was, and does two hopeful hops. */
  function join(ev) {
    guard('join', () => {
      const species = ev && ev.monster ? ev.monster.species : null;
      if (!species) return;
      const m = Monsters.build(modelId(species));
      const scale = 1.12;
      const wy = groundAt(S.origin.x, S.origin.z);
      m.root.position.set(S.origin.x, wy, S.origin.z);
      m.root.rotation.y = S.yaw + Math.PI;
      m.root.scale.setScalar(scale);
      if (m.setMood) m.setMood('friend');
      S.scene.add(m.root);
      S.models.set('join', { m, species, x: S.origin.x, y: wy, z: S.origin.z, dropT: 1, scale, h: m.height * scale, gone: false, landed: true });
      // give it room: the battle framing was cut for a whole line of monsters, this is one face asking a question
      S.fitTop = Math.max(S.fitTop, m.height * scale);
      S.dist = Math.max(S.dist, frame(m.radius * 2 * scale, S.fitTop) - 1.5) * 1.1;
      setTimeout(() => guard('join anim', () => m.play('join')), 320);
    });
    sfx('item_get', { vol: 0.8 });
  }
  function joinAnswer(yes) {
    const v = S.models.get('join');
    if (!v) return;
    if (yes) guard('join yes', () => v.m.play('join'));
    else { v.gone = true; guard('join no', () => v.m.play('defeat', { vanish: true })); }
  }

  // ── the level-up ceremony (SYSTEMS §10.2) ──────────────────────────────────────────────────────────────────
  function openPanel() {
    let node = S.layer && S.layer.querySelector('.dqb-lv');
    if (!node && S.layer) {
      node = document.createElement('div');
      node.className = 'dq-win dq-shown dq-titled dqb-lv';
      S.layer.appendChild(node);
    }
    return node;
  }
  function closePanel() {
    S.panel = null;
    const node = S.layer && S.layer.querySelector('.dqb-lv');
    if (node) node.remove();
  }
  /**
   * The panel slides in from the right, the gains reveal one per 220 ms (a gain of 5 or more gets a star and a
   * bigger tick), then — the best thing that happens outside the story — a card for every spell just learnt.
   * Resolves when the ceremony is over. Confirm skips forward a step, never past the whole thing.
   */
  function levelUp(ev) {
    if (S.disposed || !ev || !ev.gainsOrdered) return Promise.resolve(false);
    const node = openPanel();
    if (!node) return Promise.resolve(false);
    node.innerHTML = `<div class="dq-title">${esc(ev.name)} · Level ${ev.level}</div>`
      + ev.gainsOrdered.map((g, i) => `<div class="r hide" data-i="${i}"><span class="lab">${esc(g.label)}</span>`
        + `<span class="tot">${g.total}</span><span class="up ${g.gain > 0 ? (g.gain >= 5 ? 'big' : '') : 'none'}">${g.gain > 0 ? '+' + g.gain : '—'}</span></div>`).join('');
    return new Promise((resolve) => {
      S.panel = { ev, t: 0, shown: 0, phase: 'stats', card: 0, node, resolve, learned: ev.learned || [] };
    });
  }
  function tickPanel(dt) {
    const P = S.panel;
    if (!P) return;
    P.t += dt;
    if (P.phase === 'stats') {
      const want = Math.min(P.ev.gainsOrdered.length, Math.floor(P.t / 0.22));
      while (P.shown < want) {
        const row = P.node.querySelector(`.r[data-i="${P.shown}"]`);
        if (row) row.classList.remove('hide');
        const g = P.ev.gainsOrdered[P.shown];
        if (g && g.gain > 0) sfx(g.gain >= 5 ? 'level_up_sparkle' : 'cursor', { vol: g.gain >= 5 ? 0.85 : 0.6 });
        P.shown++;
      }
      if (P.shown >= P.ev.gainsOrdered.length && P.t > 0.22 * P.shown + 0.7) nextPanelPhase();
      return;
    }
    if (P.phase === 'spell' && P.t > 1.8) nextPanelPhase();
  }
  function nextPanelPhase() {
    const P = S.panel;
    if (!P) return;
    if (P.phase === 'stats') {
      if (P.learned.length) { P.phase = 'spell'; P.t = 0; P.card = 0; spellCard(P.learned[0]); return; }
      const r = P.resolve; closePanel(); r(true); return;
    }
    P.card++;
    if (P.learned[P.card]) { P.t = 0; spellCard(P.learned[P.card]); return; }
    const r = P.resolve; closePanel(); r(true);
  }
  function spellCard(sp) {
    const P = S.panel;
    if (!P || !sp) return;
    P.node.style.animation = 'none'; void P.node.offsetWidth; P.node.style.animation = '';
    P.node.innerHTML = `<div class="dq-title">A new spell!</div><div class="card"><div class="nm">${esc(sp.name)}</div>`
      + `<div class="mp">${sp.mp} MP</div><div class="bl">${esc(sp.blurb || '')}</div></div>`;
    sfx('level_up_sparkle');
  }

  // ── per-frame ──────────────────────────────────────────────────────────────────────────────────────────────
  function update(dt) {
    if (S.disposed) return;
    S.t += dt;
    if (S.panel) tickPanel(dt);
    for (const v of S.models.values()) {
      if (v.dropT < 1) {
        v.dropT += dt / 0.34;
        const t = clamp(v.dropT, 0, 1);
        const bounce = t < 1 ? (1 - t) * (1 - t) * 3.4 - Math.sin(t * Math.PI) * 0.1 : 0;
        v.m.root.position.y = v.y + Math.max(-0.05, bounce);
        if (v.dropT >= 1 && !v.landed) {
          v.landed = true;
          v.m.root.position.y = v.y;
          S.dropped++;
          sfx('footstep_grass', { vol: 0.5, pitch: 0.8 });
        }
      }
      guard('monster update', () => v.m.update(dt));
    }
    placeCamera(dt);
  }

  function render(alpha) {
    if (S.disposed || !S.scene || !S.camera) return;
    const t = App.clock ? App.clock.time : S.t;
    guard('toon tick', () => Toon.tick(t));
    if (S.rig) guard('rig', () => S.rig.follow(V.set(S.origin.x, S.origin.y, S.origin.z)));
    if (S.borrowed && S.view && S.view.update) {
      guard('map view', () => S.view.update(t, 1 / 60, { camera: S.camera, player: S.playerPos, field: ctx.Field }));
    }
    guard('see', () => { if (Toon.see && Toon.see.setHero) Toon.see.setHero({ x: S.origin.x, y: S.origin.y + 0.9, z: S.origin.z }, S.camera, App.renderer); });
    renderMarks();
    App.render(S.scene, S.camera);
  }

  function dispose() {
    if (S.disposed) return;
    S.disposed = true;
    for (const v of S.models.values()) guard('dispose', () => { if (v.m.root.parent) v.m.root.parent.remove(v.m.root); v.m.dispose(); });
    S.models.clear();
    if (S.own) guard('dispose diorama', () => {
      S.own.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose && m.dispose());
      });
    });
    if (S.layer) guard('layer remove', () => S.layer.remove());
    S.layer = null; S.els = {}; S.scene = null; S.own = null;
  }

  buildStage();
  guard('vignette', () => Transitions.vignette(BASE_VIG, { ms: 420 }));

  const P = {
    get scene() { return S.scene; },
    get camera() { return S.camera; },
    get built() { return S.built; },
    get dropping() { return S.dropped < S.models.size; },
    get panelOpen() { return !!S.panel; },
    setEnemies, setParty, play, join, joinAnswer, levelUp, update, render, dispose, fitUnits,
    setActive(id) { S.activeId = id || null; renderParty(); },
    /** While a fight is being resolved with no animation (a simulation, a critic's autoplay), draw no pops. */
    setInstant(v) { S.instant = !!v; if (S.instant && S.els.marks) for (const n of S.els.marks.querySelectorAll('.dqb-pop')) n.remove(); },
    setTarget(id) { S.targetId = id || null; },
    shake(n = 1) { S.shake = Math.max(S.shake, n); },
    flash(o) { return Transitions.flash(o); },
    skipPanel() { if (!S.panel) return false; if (S.panel.t < 0.55) return true; nextPanelPhase(); return true; },
    clearFx() { guard('clear fx', () => Transitions.vignette(BASE_VIG, { ms: 300 })); },
    state() {
      return {
        built: S.built, buildMs: S.buildMs, borrowed: S.borrowed, terrain: S.terrain,
        camera: { dist: Math.round(S.dist * 10) / 10, range: Math.round((S.range || 0) * 10) / 10, height: Math.round(S.fitTop * 100) / 100,
          drift: Math.round(S.drift * 10) / 10, shake: Math.round(S.shake * 100) / 100 },
        origin: { x: Math.round(S.origin.x * 10) / 10, y: Math.round(S.origin.y * 10) / 10, z: Math.round(S.origin.z * 10) / 10 },
        dropped: S.dropped, pops: S.pops, panel: S.panel ? { who: S.panel.ev.name, level: S.panel.ev.level, phase: S.panel.phase, shown: S.panel.shown, learned: S.panel.learned.map((l) => l.name) } : null,
        target: S.targetId, active: S.activeId,
        models: Array.from(S.models, ([id, v]) => ({ id, species: v.species, model: modelId(v.species), standIn: isStandIn(v.species), gone: !!v.gone, landed: !!v.landed })),
      };
    },
  };
  return P;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the plugin — the scene (src/battle/scene.js) is what actually drives a presenter; this only publishes the state
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const LIVE = { presenter: null };
export function setLivePresenter(p) { LIVE.presenter = p || null; }

export function install(ctx = {}) {
  injectCss();
  if (ctx.Debug) {
    ctx.Debug.provide('battlePresent', () => (LIVE.presenter ? LIVE.presenter.state() : null));
  }
  return { createPresenter };
}

export default install;
