/**
 * field.js — the field scene: renders a map, moves the player over it, follows with the camera rig, and talks to
 * whatever is in front of you.                                                               (integrator-owned)
 *
 *   import { Field } from './world/field.js';
 *   Field.install();                          // registers scene 'field', __DQ hooks, Save 'map' + 'pos' handlers
 *   Scenes.push('field', { map: 'meadow' });  // or {map, x, z, facing}
 *   Field.teleport('meadow', x, z)            // load a map (or move within the current one) — instant, for debug/story
 *
 * THE SEAMS — pieces plug in here without editing this file:
 *   P09 camera      -> src/world/camera.js   createFieldCamera(): configure / snap / update(dt) / place(alpha) / orbit / zoom
 *   P10 player      -> src/world/player.js   createPlayer(): place / update(dt) / hold(dt) / render(alpha) / describe
 *   P07/P08 model   -> player.js heroModel(): Chars.build('hero', {age:'boy'}) with the placeholder as fallback
 *   P12 dialogue    -> Field.talk() pushes scene 'dialogue' with {text|pages, voice, speaker, onClose} (src/ui/dialogue.js)
 *   P13 menu        -> the Menu button pushes scene 'menu' with {near, talk(), search()} (src/ui/menu.js)
 *   P29 transitions -> Field.setTransition(fn(info, swap)): exits to a built map run through it (fade out, swap(), fade in)
 *   P11 / P31 / P32 -> Field.on('load' | 'unload' | 'update' | 'render', fn) — per-map and per-tick hooks, plus
 *                      Field.world() -> {scene, camera, map, player, cameraRig, blobs, lightRig, view} for adding meshes
 *   Those pieces install themselves from their own plugin files (main.js calls install(ctx); ARCHITECTURE "Scene
 *   plugins"). What a map's things SAY comes from its layer files (<id>.npcs.js lines; Menu > Search reads lines.search).
 *   Bus             -> map.leave {id} before a map is torn down, map.enter {id, name, kind, music, x, z} after it is built
 *
 * Input (F2): movement reads Input.axis() / Input.down('run') every tick (player.js); orbit reads Input.look()
 * (camera.js); confirm and menu arrive through onInput here. Everything is simulated in update() at 60 Hz and
 * interpolated in render(alpha), so __DQ.freeze stops the world and __DQ.advance(ms) steps it deterministically.
 *
 * __DQ: state().map, state().player, state().field; teleport, cameraOrbit, cameraZoom, listMaps, timeOfDay,
 * screenshotReady (false while a map builds or the camera is still swinging); extras __DQ.cameraAuto(bool),
 * __DQ.cameraRig({...}), __DQ.face(deg), __DQ.walkTo(x, z), __DQ.talkNear(), __DQ.meshStats(n, {inView}), __DQ.shadows(bool).
 *
 * Camera: it NEVER pulls in to dodge trees or roofs. Distance and pitch stay put; whatever stands between the lens and
 * the hero dissolves instead (Toon.see — the map view fades whole canopies, see-through materials open a dithered
 * window around the hero, anything inside ~3 units of the lens melts). state().field.camera.seeThrough reports it.
 */
import * as THREE from 'three';
import { App } from '../engine/app.js';
import { Scenes } from '../engine/states.js';
import { Bus } from '../engine/events.js';
import { Loop } from '../engine/loop.js';
import { Debug, reportError } from '../engine/debug.js';
import { Input } from '../engine/input.js';
import { Save } from '../engine/save.js';
import { Assets } from '../engine/assets.js';
import { PAL, C3, css, smooth } from '../art/palette.js';
import { Toon, makeLightRig, makeBlobShadows } from '../art/toon.js';
import { mkCanvas, ctx2 } from '../art/tex.js';
import { UI } from '../ui/window.js';
import { Maps } from './map.js';
import { createFieldCamera, installCameraDebug } from './camera.js';
import { createPlayer, installPlayerDebug } from './player.js';

const DEG = Math.PI / 180;
const SEARCH_LINES = [
  'Bram searches the grass at his feet.{wait:350}{n}A beetle searches him back.',
  'Bram looks under a dandelion.{n}Nothing, unless you count the dandelion.',
  'Bram finds a very good stick.{wait:300}{n}He already has one. He leaves it for somebody else.',
];
const r3 = (v) => Math.round(v * 1000) / 1000;
const FOCUS = new THREE.Vector3();

/** The live field instance (null when the field is not on the stack). */
let F = null;
let installed = false;
const pending = { map: null, pos: null };      // Save.load before the field exists
let transitionHook = null;                     // P29: fn(info, swap) -> void | Promise
const HOOKS = { load: new Set(), unload: new Set(), update: new Set(), render: new Set() };
const fire = (name, ...args) => {
  for (const fn of HOOKS[name]) { try { fn(...args); } catch (e) { reportError(`field hook "${name}"`, e); } }
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the prompt bubble: a tiny DQ window with a bouncing ▼ over whatever you can talk to
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function promptSprite() {
  const tex = Assets.texture('field:prompt-bubble', () => {
    const W = 128, H = 112, c = mkCanvas(W, H), g = ctx2(c);
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    g.fillStyle = css(PAL.ui.shadow, 0.35); rr(14, 14, 100, 70, 18); g.fill();
    const grad = g.createLinearGradient(0, 8, 0, 76); grad.addColorStop(0, PAL.ui.winTop); grad.addColorStop(1, PAL.ui.winBottom);
    g.fillStyle = grad; rr(10, 8, 100, 70, 18); g.fill();
    g.lineWidth = 7; g.strokeStyle = PAL.ui.border; rr(10, 8, 100, 70, 18); g.stroke();
    g.lineWidth = 2; g.strokeStyle = css(PAL.ui.textDim, 0.6); rr(17, 15, 86, 56, 12); g.stroke();
    // tail
    g.fillStyle = PAL.ui.border; g.beginPath(); g.moveTo(48, 74); g.lineTo(60, 102); g.lineTo(72, 74); g.closePath(); g.fill();
    g.fillStyle = PAL.ui.winBottom; g.beginPath(); g.moveTo(53, 72); g.lineTo(60, 91); g.lineTo(67, 72); g.closePath(); g.fill();
    // three dots
    g.fillStyle = PAL.ui.text;
    for (const x of [40, 60, 80]) { g.beginPath(); g.arc(x, 43, 7.5, 0, Math.PI * 2); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
    return t;
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false }));
  sp.scale.set(0.62, 0.54, 1); sp.renderOrder = 60; sp.visible = false; sp.name = 'talk-prompt';
  return sp;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the scene
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function createFieldScene() {
  const S = {
    scene: null, rig: null, blobs: null, view: null, map: null, prompt: null,
    loading: false, loadCount: 0, offResize: null, transit: false,
    lastTalk: null, searchCount: 0, renderT: -1, hours: 9,
  };
  // P10 + P09: the player and the camera rig, each in its own module, talking only through these callbacks
  const player = createPlayer({ map: () => S.map, cameraYaw: () => cam.yaw, onExit: (ex) => { if (!S.loading && !S.transit) onExit(ex); } });
  const cam = createFieldCamera({ focus: () => player.p, map: () => S.map, talking: () => Scenes.top() === 'dialogue' });

  // ── map loading ──────────────────────────────────────────────────────────────────────────────────────────
  function disposeWorld(keepActors = true) {
    if (S.map) fire('unload', { map: S.map, scene: S.scene, field: Field });
    try { if (S.view && S.view.dispose) S.view.dispose(); } catch (e) { reportError('field view dispose', e); }
    // the hero and the prompt outlive a map change: take them out before the old scene is torn down
    if (keepActors) { player.detach(); if (S.prompt) S.prompt.removeFromParent(); }
    if (S.scene) { try { if (S.rig) S.rig.dispose(); Assets.disposeObject(S.scene); } catch (e) { reportError('field dispose', e); } }
    S.view = null; S.scene = null; S.rig = null; S.blobs = null;
    Toon.see.clear();
  }

  function loadMap(id, x, z, facing) {
    const t0 = performance.now();
    S.loading = true;
    Debug.busy('field.load', true);
    Input.block('field.load', true);
    try {
      const map = Maps.load(id);
      if (!map) return { ok: false, reason: `unknown map "${id}"`, maps: Maps.list() };
      if (S.map) Bus.emit('map.leave', { id: S.map.id, to: map.id });
      disposeWorld();
      S.map = map;
      const scene = new THREE.Scene(); scene.name = 'field:' + map.id;
      S.scene = scene;
      const camera = cam.camera;
      const rig = makeLightRig({ scene, preset: 'day', shadowMapSize: App.quality === 'low' ? 1024 : undefined });
      S.rig = rig;
      // the hero (Chars, or the placeholder) + blob shadows for everything that moves
      player.attach(scene);
      S.blobs = makeBlobShadows(12);
      scene.add(S.blobs.mesh);
      if (!S.prompt) S.prompt = promptSprite();
      scene.add(S.prompt);
      // the map's art
      const def = map.def;
      if (typeof def.view === 'function') {
        try { S.view = def.view({ THREE, scene, rig, map, camera, App, blobs: S.blobs }) || null; }
        catch (e) { reportError(`map "${map.id}" view`, e); S.view = null; }
      }
      // camera defaults for this map (a move within a map keeps the orbit)
      const sp = map.spawn;
      const hasPos = Number.isFinite(+x);
      cam.configure(def.camera, hasPos);
      // place the player
      const px = hasPos ? +x : sp.x, pz = Number.isFinite(+z) ? +z : sp.z;
      const face = Number.isFinite(+facing) ? +facing : (hasPos ? player.p.yaw : (sp.facing ?? 0));
      player.place(px, pz, face, true);
      cam.snap();
      if (S.hours !== 9 || def.hours != null) applyTime(def.hours ?? S.hours);
      S.loadCount++;
      map.buildMs = Math.round(performance.now() - t0);
      try { if (typeof def.onEnter === 'function') def.onEnter({ map, field: Field }); } catch (e) { reportError(`map "${map.id}" onEnter`, e); }
      fire('load', { map, scene, camera, field: Field });
      Bus.emit('map.enter', { id: map.id, name: map.name, kind: map.kind, music: map.music, x: player.p.x, z: player.p.z });
      return { ok: true, map: map.id, x: r3(player.p.x), z: r3(player.p.z), buildMs: map.buildMs };
    } catch (e) {
      reportError('field loadMap', e);
      return { ok: false, error: String(e && e.message || e) };
    } finally {
      S.loading = false;
      Debug.busy('field.load', false);
      Input.block('field.load', false);
    }
  }

  /** Run a map change through the transition hook (P29) if one is installed; otherwise swap at once. */
  function changeMap(info, doLoad) {
    if (!transitionHook) return doLoad();
    if (S.transit) return null;
    S.transit = true;
    let swapped = false, result = null;
    const swap = () => { if (swapped) return result; swapped = true; result = doLoad(); return result; };
    const finish = () => { if (!swapped) swap(); S.transit = false; };
    try {
      const r = transitionHook(info, swap);
      if (r && typeof r.then === 'function') r.then(finish, (e) => { reportError('field transition', e); finish(); });
      else finish();
    } catch (e) { reportError('field transition', e); finish(); }
    return result;
  }

  function onExit(ex) {
    if (ex.to && Maps.has(ex.to)) {
      // Prefer the exit's own facing (e.g. doorsteps face out of the house) so a held stick does not
      // walk a child straight back through the door they just left.
      const face = Number.isFinite(+ex.facing) ? +ex.facing : (Number.isFinite(+ex.tfacing) ? +ex.tfacing : undefined);
      changeMap({ kind: ex.kind || 'edge', from: S.map ? S.map.id : null, to: ex.to, exit: ex },
        () => loadMap(ex.to, ex.tx, ex.tz, face));
      return;
    }
    // an exit to somewhere not built yet speaks instead, and nudges you back the way you came
    const p = player.p;
    const back = ex.back || { x: p.x - Math.sin(p.yaw) * 1.2, z: p.z - Math.cos(p.yaw) * 1.2 };
    player.place(back.x, back.z, p.yaw + Math.PI, true);
    if (ex.text) talk({ text: ex.text, voice: ex.voice || 'narrator', name: ex.name || 'lane end' });
  }

  // ── talking ──────────────────────────────────────────────────────────────────────────────────────────────
  function interact() {
    const m = S.map; if (!m) return false;
    const p = player.p;
    const hit = m.nearestInteractable(p.x, p.z, Math.sin(p.yawT), Math.cos(p.yawT));
    if (!hit) return false;
    const t = hit.target, tx = t.ix ?? t.x, tz = t.iz ?? t.z;
    // turn to face it (eased by the player's hold(), which keeps running under the dialogue)
    player.faceToward(tx, tz);
    player.halt();
    if (typeof t.talk === 'function') {
      try { const r = t.talk({ field: Field, map: m, player: Field.player() }); if (r && (r.text || r.pages)) talk(Object.assign({ name: t.name || t.type }, r)); }
      catch (e) { reportError(`talk "${t.name || t.type}"`, e); }
    } else talk({ text: t.text, voice: t.voice || 'narrator', name: t.name || t.type, nod: t.type === 'sign' });
    return true;
  }

  function talk({ text, pages, voice = 'narrator', name = null, nod = false, onClose = null } = {}) {
    if (!Scenes.has('dialogue')) { reportError('field talk', new Error('no dialogue scene registered')); return false; }
    S.lastTalk = { name, at: Loop.tick };
    Scenes.push('dialogue', { text: pages || text, voice, speaker: name,
      onClose: () => { if (nod && player.hero) player.hero.nod(); try { onClose && onClose(); } catch (e) { reportError('talk onClose', e); } } });
    return true;
  }

  function searchLine() {
    const own = S.map && S.map.lines && S.map.lines.search;
    const list = own ? [].concat(own.text ?? own) : SEARCH_LINES;
    return list[S.searchCount++ % list.length];
  }

  // ── time of day (the sky belongs to the map view until P02) ────────────────────────────────────────────
  function applyTime(h) {
    S.hours = ((+h % 24) + 24) % 24;
    const H = S.hours;
    let a = 'day', b = 'day', k = 0;
    if (H > 16.5 && H < 19.5) { b = 'dusk'; k = smooth(16.5, 18.5, H); }
    else if (H >= 19.5) { a = 'dusk'; b = 'night'; k = smooth(19.5, 21, H); }
    else if (H < 5) { a = b = 'night'; }
    else if (H < 8) { a = 'night'; b = 'day'; k = smooth(5, 8, H); }
    if (S.rig) { if (a === b) S.rig.apply(a); else S.rig.blend(a, b, k); }
    const sky = S.view && S.view.sky;
    if (sky && sky.uniforms) {
      const skyOf = (n) => (n === 'day' ? PAL.sky : PAL[n]), kk = smooth(0, 1, k);
      for (const key of ['zenith', 'upper', 'horizon', 'haze', 'sunGlow']) sky.uniforms['u' + key[0].toUpperCase() + key.slice(1)].value.copy(C3(skyOf(a)[key])).lerp(C3(skyOf(b)[key]), kk);
      const night = (a === 'night' ? 1 - kk : 0) + (b === 'night' ? kk : 0), dusk = (a === 'dusk' ? 1 - kk : 0) + (b === 'dusk' ? kk : 0);
      if (sky.clouds) sky.clouds.material.color.copy(C3(PAL.mask.on)).lerp(C3(PAL.dusk.sunGlow), dusk * 0.5).lerp(C3(PAL.night.hemiSky), night * 0.8);
    }
    return S.hours;
  }

  // ── scene hooks ──────────────────────────────────────────────────────────────────────────────────────────
  const scene = {
    opaque: true,
    enter(ctx = {}) {
      F = api;
      S.offResize = App.onResize(() => cam.resize());
      const mapId = ctx.map || pending.map || (Maps.list()[0] ?? null);
      const pos = pending.pos || {};
      pending.map = null; pending.pos = null;
      if (!mapId) { reportError('field enter', new Error('no maps registered')); return; }
      loadMap(mapId, ctx.x ?? pos.x, ctx.z ?? pos.z, ctx.facing ?? pos.facing);
      cam.resize();
    },
    exit() {
      if (S.offResize) S.offResize();
      disposeWorld(false);
      if (F === api) F = null;
    },
    pause() { player.halt(); },
    resume() {},
    update(dt) {
      if (!S.map || S.loading) return;
      // under a dialogue (which sets updateBelow) the world holds still but the camera can still be turned
      const top = Scenes.top() === 'field';
      if (top) player.update(dt);
      else player.hold(dt);
      cam.update(dt);
      if (HOOKS.update.size) fire('update', dt, { top, field: Field });
    },
    render(alpha) {
      if (!S.scene) return;
      const camera = cam.camera;
      const t = App.clock.time + (Loop.alpha || 0) * (Loop.stepMs / 1000);
      const dt = S.renderT < 0 ? 0 : Math.max(0, Math.min(0.1, t - S.renderT));
      S.renderT = t;
      Toon.tick(t);
      // player (interpolated, posed and animated)
      const active = Scenes.top() === 'field';
      const { x, y, z } = player.render(alpha, dt, t, active);
      const p = player.p;
      if (S.blobs) { S.blobs.set(0, x, y, z, 1.0 + Math.min(0.15, p.speed * 0.02)); S.blobs.commit(); }
      const focus = cam.place(alpha);
      if (S.rig) S.rig.follow(FOCUS.set(focus.tx, focus.ty, focus.tz));
      Toon.see.setHero({ x, y, z }, camera, App.renderer);
      // prompt over whatever you can talk to
      if (S.prompt) {
        const n = active ? player.near : null;
        S.prompt.visible = !!n;
        if (n) {
          const tg = n.target, tx = tg.ix ?? tg.x, tz = tg.iz ?? tg.z;
          const ty = (tg.promptY != null ? tg.promptY : (S.map.heightAt(tx, tz) + (tg.height ?? 2.3)));
          S.prompt.position.set(tx, ty + Math.abs(Math.sin(t * 3.2)) * 0.12, tz);
          const pop = Math.min(1, (S.prompt.userData.k = Math.min(1, (S.prompt.userData.k || 0) + dt * 6)));
          S.prompt.scale.set(0.62 * pop, 0.54 * pop, 1);
        } else S.prompt.userData.k = 0;
      }
      try { if (S.view && S.view.update) S.view.update(t, dt, { camera, player: { x, y, z }, field: api }); }
      catch (e) { reportError('map view update', e); }
      if (HOOKS.render.size) fire('render', alpha, dt, t, { player: { x, y, z }, camera, field: Field });
      App.render(S.scene, camera);
    },
    onInput(btn) {
      if (UI.input(btn)) return true;
      if (btn === 'confirm' && Scenes.top() === 'field') { interact(); return true; }
      if (btn === 'menu' && Scenes.top() === 'field' && Scenes.has('menu')) {
        player.halt();
        Scenes.push('menu', {
          near: player.near ? (player.near.target.name || player.near.target.type) : null,
          talk: () => { if (!interact()) talk({ text: 'There is nobody here to talk to.{n}A bee says hello, though.', name: 'nobody' }); },
          search: () => talk({ text: searchLine(), name: 'search' }),
        });
        return true;
      }
      return true;
    },
  };

  // ── the instance API used by Field / __DQ ─────────────────────────────────────────────────────────────────
  const api = {
    S, scene, player, cam, loadMap, talk, interact, applyTime,
    placePlayer: (x, z, yaw, stop) => player.place(x, z, yaw, stop),
    snapCamera: () => cam.snap(),
    describeField() {
      const see = Toon.see.state(), vs = S.view && S.view.state ? (S.view.state().see || null) : null;
      return { camera: cam.describe({ occluded: !!(vs && vs.occluding), seeThrough: { fading: see.fades, occluding: vs ? vs.occluding : 0, heroWindow: see.hero } }),
        loading: S.loading, loads: S.loadCount, hours: S.hours, rig: S.rig ? S.rig.state() : null,
        prompt: !!(S.prompt && S.prompt.visible), lastTalk: S.lastTalk, view: S.view && S.view.state ? S.view.state() : null,
        toon: Toon.stats() };
    },
  };
  return scene;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// public facade
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const Field = {
  get active() { return !!F; },
  get map() { return F ? F.S.map : null; },
  player() { return F ? F.player.describe() : null; },
  talk(o) { return F ? F.talk(o) : false; },
  /** Everything a plugin needs to add to the live world, or null when the field is not on the stack. */
  world() {
    if (!F) return null;
    return { scene: F.S.scene, camera: F.cam.camera, map: F.S.map, player: F.player, cameraRig: F.cam, blobs: F.S.blobs, lightRig: F.S.rig, view: F.S.view };
  },
  /** Per-map / per-tick hooks: 'load' ({map, scene, camera, field}) · 'unload' ({map, scene, field}) ·
   *  'update' (dt, {top, field}) · 'render' (alpha, dt, t, {player, camera, field}). Returns off(). */
  on(name, fn) {
    if (!HOOKS[name] || typeof fn !== 'function') { reportError('Field.on', new Error(`unknown hook "${name}" (load, unload, update, render)`)); return () => {}; }
    HOOKS[name].add(fn);
    return () => HOOKS[name].delete(fn);
  },
  /** P29: fn({kind, from, to, exit}, swap) — call swap() once, mid-transition, to build the new map. null clears. */
  setTransition(fn) { transitionHook = typeof fn === 'function' ? fn : null; return !!transitionHook; },
  /** Load a map (or move within the current one). Instant. Works whether or not the field is on the stack. */
  teleport(mapId, x, z, facing) {
    const id = mapId == null ? (F && F.S.map ? F.S.map.id : Maps.list()[0]) : String(mapId);
    if (!Maps.has(id)) return { ok: false, reason: `unknown map "${id}"`, maps: Maps.list() };
    if (!F) {
      const ok = Scenes.reset('field', { map: id, x, z, facing });
      return { ok: !!ok && !!F, map: id, player: Field.player() };
    }
    // anything pushed over the field (a dialogue) is closed first
    while (Scenes.top() && Scenes.top() !== 'field') Scenes.pop();
    if (F.S.map && F.S.map.id === id && Number.isFinite(+x) && Number.isFinite(+z)) {
      F.placePlayer(+x, +z, Number.isFinite(+facing) ? +facing * DEG : F.player.p.yaw, true);
      F.snapCamera();
      return { ok: true, map: id, moved: true, player: Field.player() };
    }
    const r = F.loadMap(id, x, z, Number.isFinite(+facing) ? +facing * DEG : undefined);
    return Object.assign(r, { player: Field.player() });
  },

  install() {
    if (installed) return Field;
    installed = true;
    Scenes.register('field', createFieldScene);

    Debug.implement('teleport', (mapId, x, z) => Field.teleport(mapId, x, z));
    Debug.implement('listMaps', () => Maps.list());
    installCameraDebug(() => (F ? F.cam : null));
    installPlayerDebug(() => (F ? F.player : null));
    Debug.implement('timeOfDay', (h) => {
      if (!F) return h === undefined ? 9 : { ok: false, reason: 'the field is not on the scene stack' };
      return h === undefined ? F.S.hours : F.applyTime(h);
    });
    Debug.implement('screenshotReady', () => !F || (!F.S.loading && !F.S.transit && F.cam.settled()));
    Debug.provide('map', () => (F && F.S.map ? Object.assign(F.S.map.describe(), { buildMs: F.S.map.buildMs }) : null));
    Debug.provide('player', () => (F ? F.player.describe() : null));
    Debug.provide('field', () => (F ? F.describeField() : null));
    Debug.expose('talkNear', () => (F ? F.interact() : false));
    /** Sun shadows on/off (perf probing): __DQ.shadows(false). */
    Debug.expose('shadows', (on) => { if (!F || !F.S.rig) return null; if (on !== undefined) F.S.rig.sun.castShadow = !!on; return F.S.rig.sun.castShadow; });
    /** Triangle hogs: [{name, tris (x instances), instances, shadow}] sorted, top n. */
    Debug.expose('meshStats', (n = 25, { inView = false } = {}) => {
      if (!F || !F.S.scene) return null;
      const out = [];
      const camera = F.cam.camera;
      const frustum = new THREE.Frustum(), sph = new THREE.Sphere();
      if (inView && camera) { camera.updateMatrixWorld(); frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); }
      F.S.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (inView) {
          let vis = o.visible && (!o.material || o.material.visible !== false); for (let q = o.parent; q && vis; q = q.parent) vis = q.visible;
          if (!vis) return;
          if (o.frustumCulled !== false) {
            if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); sph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld); }
            else { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); }
            if (!frustum.intersectsSphere(sph)) return;
          }
          if (o.material && o.material.colorWrite === false) return;
        }
        const g = o.geometry, idx = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
        const inst = o.isInstancedMesh ? o.count : 1;
        out.push({ name: o.name || (o.parent && o.parent.name) || o.type, tris: Math.round(idx / 3) * inst, instances: inst, shadow: !!o.castShadow, visible: o.visible });
      });
      out.sort((a, b) => b.tris - a.tris);
      const total = out.reduce((s, m) => s + m.tris, 0), shadow = out.filter(m => m.shadow).reduce((s, m) => s + m.tris, 0);
      return { total, shadowCasters: shadow, meshes: out.length, top: out.slice(0, n) };
    });

    // Save: the field owns 'map' and 'pos' until P23 / P10 take them (docs/SYSTEMS-BIBLE §6)
    Save.register('map', {
      save: () => (F && F.S.map ? F.S.map.id : pending.map),
      load: (id) => { if (!Maps.has(id)) return; if (F) F.loadMap(id); else pending.map = id; },
      summary: (id) => ({ place: id }),
      reset: () => { pending.map = null; },
    });
    Save.register('pos', {
      save: () => (F ? { x: r3(F.player.p.x), z: r3(F.player.p.z), facing: r3(F.player.p.yaw) } : pending.pos),
      load: (p) => { if (!p) return; if (F) { F.placePlayer(p.x, p.z, p.facing ?? 0, true); F.snapCamera(); } else pending.pos = p; },
      reset: () => { pending.pos = null; },
    });
    return Field;
  },
};

export default Field;
