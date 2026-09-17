/**
 * field.js — the field scene: renders a map, walks the player around it, follows with a spring camera that
 * orbits freely, and talks to whatever is in front of you.                                  (integrator-owned)
 *
 *   import { Field } from './world/field.js';
 *   Field.install();                          // registers scene 'field', __DQ hooks, Save 'map' + 'pos' handlers
 *   Scenes.push('field', { map: 'meadow' });  // or {map, x, z, facing}
 *   Field.teleport('meadow', x, z)            // load a map (or move within the current one)
 *
 * Seams for the pieces still to come — each is one clearly marked block below:
 *   P09 camera   -> the CAMERA block (spring follow, orbit, zoom, ease-behind, terrain clearance)
 *   P10 player   -> the PLAYER block (camera-relative analog movement, run, turn easing, walls, footsteps)
 *   P07/P08      -> placeholder-hero.js (the model + procedural animation)
 *   P12 dialogue -> Field.talk() pushes scene 'dialogue' with {pages, voice, speaker}
 *   P29 transitions -> loadMap() marks Debug.busy('field.load') and Input.block('field.load') while it builds
 *
 * Input (F2): movement reads Input.axis() / Input.down('run') every tick; camera orbit reads Input.look()
 * (right stick, L1/R1, Q/E); confirm arrives through onInput. Everything is simulated in update() at 60 Hz and
 * interpolated in render(alpha), so __DQ.freeze stops the world and __DQ.advance(ms) steps it deterministically.
 *
 * __DQ: state().map, state().player, state().field; teleport, cameraOrbit, cameraZoom, listMaps, timeOfDay,
 * screenshotReady (false while a map builds or the camera is still swinging); extras __DQ.cameraAuto(bool),
 * __DQ.face(deg), __DQ.walkTo(x, z) (sets the player position without animation — use teleport for maps),
 * __DQ.meshStats(n, {inView}) (triangles per mesh, optionally only what the camera can see), __DQ.shadows(bool).
 *
 * Camera: it NEVER pulls in to dodge trees or roofs. Distance and pitch stay put; whatever stands between the lens and
 * the hero dissolves instead (Toon.see — the map view fades whole canopies, see-through materials open a dithered
 * window around the hero, anything inside ~3 units of the lens melts). state().field.camera.seeThrough reports it.
 * Player: a quick tap on a new direction turns the hero in place (the facing target outlives the tap); Menu pushes
 * the 'menu' scene (src/ui/menu.js) with talk/search callbacks.
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
import { Sfx } from '../audio/sfx.js';
import { UI } from '../ui/window.js';
import { Maps, PLAYER_RADIUS } from './map.js';
import { buildPlaceholderHero } from './placeholder-hero.js';

const DEG = Math.PI / 180;
const WALK = 3.3, RUN = 5.7, PIVOT = 0.1;
const SEARCH_LINES = [
  'Bram searches the grass at his feet.{wait:350}{n}A beetle searches him back.',
  'Bram looks under a dandelion.{n}Nothing, unless you count the dandelion.',
  'Bram finds a very good stick.{wait:300}{n}He already has one. He leaves it for somebody else.',
];
const CAM_DEFAULT = { orbit: 0, pitch: 30, dist: 10.5, fov: 46, lookUp: 1.05 };
const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const r3 = (v) => Math.round(v * 1000) / 1000;
const FOCUS = new THREE.Vector3();

/** The live field instance (null when the field is not on the stack). */
let F = null;
let installed = false;
const pending = { map: null, pos: null };      // Save.load before the field exists

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
    scene: null, camera: null, rig: null, blobs: null, hero: null, view: null, map: null, prompt: null,
    loading: false, loadCount: 0, ctxRef: null, offResize: null,
    // PLAYER state (sim) + previous tick for interpolation
    p: { x: 0, z: 0, y: 0, yaw: 0, yawT: 0, holdT: 0, pivot: 0, vx: 0, vz: 0, speed: 0, run: false, blocked: false, ground: 'grass' },
    pp: { x: 0, z: 0, y: 0, yaw: 0 },
    bumpCd: 0, stepCount: 0, near: null, lastTalk: null, searchCount: 0,
    // CAMERA state (sim)
    cam: { yaw: 0, yawT: 0, pitch: CAM_DEFAULT.pitch, dist: CAM_DEFAULT.dist, distT: CAM_DEFAULT.dist, fov: CAM_DEFAULT.fov, lookUp: CAM_DEFAULT.lookUp,
      tx: 0, ty: 0, tz: 0, vx: 0, vy: 0, vz: 0, manualT: 99, auto: true, occ: CAM_DEFAULT.dist, occluded: false, talk: 0 },
    pcam: { yaw: 0, tx: 0, ty: 0, tz: 0, dist: CAM_DEFAULT.dist, talk: 0 },
    renderT: -1, hours: 9,
  };

  // ── map loading ──────────────────────────────────────────────────────────────────────────────────────────
  function disposeWorld(keepActors = true) {
    try { if (S.view && S.view.dispose) S.view.dispose(); } catch (e) { reportError('field view dispose', e); }
    // the hero and the prompt outlive a map change: take them out before the old scene is torn down
    if (keepActors) { if (S.hero) S.hero.group.removeFromParent(); if (S.prompt) S.prompt.removeFromParent(); }
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
      disposeWorld();
      S.map = map;
      const scene = new THREE.Scene(); scene.name = 'field:' + map.id;
      S.scene = scene;
      if (!S.camera) S.camera = new THREE.PerspectiveCamera(CAM_DEFAULT.fov, App.aspect(), 0.3, 1400);
      const rig = makeLightRig({ scene, preset: 'day', shadowMapSize: App.quality === 'low' ? 1024 : undefined });
      S.rig = rig;
      // the hero (placeholder until P07) + blob shadows for everything that moves
      if (!S.hero) S.hero = buildPlaceholderHero();
      scene.add(S.hero.group);
      S.blobs = makeBlobShadows(12);
      scene.add(S.blobs.mesh);
      if (!S.prompt) S.prompt = promptSprite();
      scene.add(S.prompt);
      // the map's art
      const def = map.def;
      if (typeof def.view === 'function') {
        try { S.view = def.view({ THREE, scene, rig, map, camera: S.camera, App, blobs: S.blobs }) || null; }
        catch (e) { reportError(`map "${map.id}" view`, e); S.view = null; }
      }
      // camera defaults for this map
      const cd = Object.assign({}, CAM_DEFAULT, def.camera || {});
      S.cam.pitch = cd.pitch; S.cam.dist = S.cam.distT = cd.dist; S.cam.fov = cd.fov; S.cam.lookUp = cd.lookUp;
      // place the player
      const sp = map.spawn;
      const px = Number.isFinite(+x) ? +x : sp.x, pz = Number.isFinite(+z) ? +z : sp.z;
      const face = Number.isFinite(+facing) ? +facing : (Number.isFinite(+x) ? S.p.yaw : (sp.facing ?? 0));
      placePlayer(px, pz, face, true);
      S.cam.yaw = S.cam.yawT = (Number.isFinite(+x) ? S.cam.yaw : (cd.orbit ?? 0) * DEG);
      snapCamera();
      if (S.hours !== 9 || def.hours != null) applyTime(def.hours ?? S.hours);
      S.loadCount++;
      map.buildMs = Math.round(performance.now() - t0);
      try { if (typeof def.onEnter === 'function') def.onEnter({ map, field: Field }); } catch (e) { reportError(`map "${map.id}" onEnter`, e); }
      Bus.emit('map.enter', { id: map.id, name: map.name, kind: map.kind, music: map.music, x: S.p.x, z: S.p.z });
      return { ok: true, map: map.id, x: r3(S.p.x), z: r3(S.p.z), buildMs: map.buildMs };
    } catch (e) {
      reportError('field loadMap', e);
      return { ok: false, error: String(e && e.message || e) };
    } finally {
      S.loading = false;
      Debug.busy('field.load', false);
      Input.block('field.load', false);
    }
  }

  // ═══ PLAYER (P10 seam) ════════════════════════════════════════════════════════════════════════════════════
  function placePlayer(x, z, yaw = S.p.yaw, stop = true) {
    const m = S.map;
    let px = +x, pz = +z;
    if (m) { const r = m.resolve(px, pz, PLAYER_RADIUS); px = r.x; pz = r.z; }
    Object.assign(S.p, { x: px, z: pz, y: m ? m.walkY(px, pz) : 0, yaw: wrapPi(yaw), yawT: wrapPi(yaw), pivot: 0, ground: m ? m.groundAt(px, pz) : S.p.ground });
    S.near = m ? m.nearestInteractable(px, pz, Math.sin(S.p.yaw), Math.cos(S.p.yaw)) : null;
    if (stop) { S.p.vx = 0; S.p.vz = 0; S.p.speed = 0; }
    Object.assign(S.pp, { x: S.p.x, z: S.p.z, y: S.p.y, yaw: S.p.yaw });
  }

  function updatePlayer(dt) {
    const m = S.map; if (!m) return;
    const p = S.p;
    Object.assign(S.pp, { x: p.x, z: p.z, y: p.y, yaw: p.yaw });
    const ax = Input.axis();
    const run = Input.down('run');
    // camera-relative wish direction: forward is away from the camera
    const yaw = S.cam.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let wx = rx * ax.x + fx * ax.y, wz = rz * ax.x + fz * ax.y;
    const mag = Math.min(1, Math.hypot(wx, wz));
    const top = run ? RUN : WALK;
    // Turn in place, Dragon Quest style: a quick tap on a new direction turns the hero all the way round to face it
    // (the facing target outlives the tap) without taking a step; holding walks. A pivot lasts at most PIVOT seconds
    // or until he faces within ~35° of the new way, so walking still starts at once when you mean it.
    if (mag > 0.08) {
      const target = Math.atan2(wx, wz);
      if (p.holdT === 0 && p.speed < 0.6 && Math.abs(wrapPi(target - p.yaw)) > 50 * DEG) p.pivot = PIVOT;
      p.yawT = target; p.holdT += dt;
    } else { p.holdT = 0; p.pivot = 0; }
    if (p.pivot > 0) { p.pivot -= dt; if (Math.abs(wrapPi(p.yawT - p.yaw)) < 35 * DEG) p.pivot = 0; }
    const go = p.pivot > 0 ? 0 : 1;
    const tvx = wx * top * go, tvz = wz * top * go;
    const accel = mag > 0.05 ? (run ? 11 : 13) : 16;
    const k = Math.min(1, dt * accel);
    p.vx += (tvx - p.vx) * k; p.vz += (tvz - p.vz) * k;
    if (Math.hypot(p.vx, p.vz) < 0.02 && mag < 0.05) { p.vx = 0; p.vz = 0; }
    const res = m.move(p.x, p.z, p.vx * dt, p.vz * dt, PLAYER_RADIUS);
    p.blocked = res.blocked;
    if (res.hit) {
      // slide: drop only the part of the velocity that pushes into the wall
      const vn = p.vx * res.nx + p.vz * res.nz;
      if (vn < 0) { p.vx -= res.nx * vn; p.vz -= res.nz * vn; }
      S.bumpCd -= dt;
      const into = mag > 0.5 ? -(wx * res.nx + wz * res.nz) / mag : 0;
      if (into > 0.8 && res.moved < 0.2 * top * dt && S.bumpCd <= 0) { S.bumpCd = 0.9; Sfx.play('bump_wall', { vol: 0.55 }); }
    } else S.bumpCd = Math.max(0, S.bumpCd - dt);
    p.x = res.x; p.z = res.z;
    p.speed = Math.hypot(p.vx, p.vz);
    p.run = run && p.speed > WALK * 0.8;
    // turn toward the facing target (eased, never snapped, and always finished — even after the stick is released)
    {
      const d = wrapPi(p.yawT - p.yaw);
      if (Math.abs(d) > 1e-4) {
        const step = Math.sign(d) * Math.min(Math.abs(d), Math.max(Math.abs(d) * Math.min(1, dt * (run ? 15 : 12)), dt * 2.2));
        p.yaw = wrapPi(p.yaw + step);
      }
    }
    const gy = m.walkY(p.x, p.z);
    p.y += (gy - p.y) * Math.min(1, dt * 20);
    p.ground = m.groundAt(p.x, p.z);
    // things to talk to: where he is turning to face counts (tap Up, press Confirm — the sign answers)
    S.near = m.nearestInteractable(p.x, p.z, Math.sin(p.yawT), Math.cos(p.yawT));
    // exits
    const ex = m.exitAt(p.x, p.z);
    if (ex && !S.loading) onExit(ex);
  }

  function onExit(ex) {
    if (ex.to && Maps.has(ex.to)) { loadMap(ex.to, ex.tx, ex.tz); return; }
    // an exit to somewhere not built yet speaks instead, and nudges you back the way you came
    const back = ex.back || { x: S.p.x - Math.sin(S.p.yaw) * 1.2, z: S.p.z - Math.cos(S.p.yaw) * 1.2 };
    placePlayer(back.x, back.z, S.p.yaw + Math.PI, true);
    if (ex.text) talk({ text: ex.text, voice: ex.voice || 'narrator', name: ex.name || 'lane end' });
  }

  // ═══ CAMERA (P09 seam) ════════════════════════════════════════════════════════════════════════════════════
  function camGoal() {
    const p = S.p;
    return { x: p.x + p.vx * 0.22, y: p.y, z: p.z + p.vz * 0.22 };
  }
  function snapCamera() {
    const g = camGoal(), c = S.cam;
    c.tx = g.x; c.ty = g.y; c.tz = g.z; c.vx = c.vy = c.vz = 0; c.yaw = c.yawT;
    c.occ = c.distT; c.dist = c.distT;
    Object.assign(S.pcam, { yaw: c.yaw, tx: c.tx, ty: c.ty, tz: c.tz, dist: c.dist, talk: c.talk });
  }
  function updateCamera(dt) {
    const c = S.cam;
    Object.assign(S.pcam, { yaw: c.yaw, tx: c.tx, ty: c.ty, tz: c.tz, dist: c.dist, talk: c.talk });
    // manual orbit: right stick / bumpers / Q E
    const look = Input.look();
    if (Math.abs(look.x) > 0.01) { c.yawT += -look.x * 115 * DEG * dt; c.manualT = 0; }
    else c.manualT += dt;
    // ease behind the player — only while walking away from the camera, and never soon after a manual orbit
    const p = S.p;
    if (c.auto && c.manualT > 2.5 && p.speed > 1.0) {
      const hx = p.vx / p.speed, hz = p.vz / p.speed, fx = -Math.sin(c.yawT), fz = -Math.cos(c.yawT);
      const along = hx * fx + hz * fz;
      if (along > 0.55) {
        const behind = Math.atan2(-hx, -hz);
        c.yawT += wrapPi(behind - c.yawT) * Math.min(1, dt * 0.9) * smooth(0.55, 0.95, along) * Math.min(1, p.speed / RUN);
      }
    }
    c.yawT = wrapPi(c.yawT);
    c.yaw = wrapPi(c.yaw + wrapPi(c.yawT - c.yaw) * (1 - Math.exp(-dt * 7.5)));
    // The lens NEVER zooms in to dodge a tree or a roof (Dragon Quest's camera sits calmly above the world): it keeps
    // its distance and pitch, and whatever stands in the way dissolves instead (Toon.see: the map view fades the
    // canopies, every see-through material opens a window around the hero). Only a zoom request changes distance.
    c.occ = c.distT;
    c.dist += (c.distT - c.dist) * (1 - Math.exp(-dt * 6));
    // while somebody is talking the view settles a little lower, so the hero stands just above the message window
    const talking = Scenes.top() === 'dialogue';
    c.talk += ((talking ? 1 : 0) - c.talk) * (1 - Math.exp(-dt * (talking ? 5 : 3.5)));
    // critically damped spring on the look target
    const g = camGoal(), w = 6.0, kk = w * w, dd = 2 * w;
    for (const [pk, vk, gk] of [['tx', 'vx', 'x'], ['ty', 'vy', 'y'], ['tz', 'vz', 'z']]) {
      const a = (g[gk] - c[pk]) * kk - c[vk] * dd;
      c[vk] += a * dt; c[pk] += c[vk] * dt;
    }
  }
  function placeCamera(alpha) {
    const c = S.cam, pc = S.pcam, cam = S.camera;
    const yaw = pc.yaw + wrapPi(c.yaw - pc.yaw) * alpha;
    const tx = pc.tx + (c.tx - pc.tx) * alpha, ty = pc.ty + (c.ty - pc.ty) * alpha, tz = pc.tz + (c.tz - pc.tz) * alpha;
    const dist = pc.dist + (c.dist - pc.dist) * alpha;
    const talk = (pc.talk ?? c.talk) + (c.talk - (pc.talk ?? c.talk)) * alpha;
    // zoomed in, the look point comes down to the hero's chest (the default lookUp frames a whole vale, not a face);
    // a little steeper too, so the hero's head never fills the bottom of the frame
    const zk = smooth(3, CAM_DEFAULT.dist, dist);
    const ph = (c.pitch + (1 - zk) * 2) * DEG;
    let lookUp = 1.3 + (c.lookUp - 1.3) * zk;
    lookUp += (Math.min(lookUp, 1.35) - lookUp) * talk;
    let px = tx + Math.sin(yaw) * Math.cos(ph) * dist, pz = tz + Math.cos(yaw) * Math.cos(ph) * dist, py = ty + Math.sin(ph) * dist + 0.5;
    // keep the lens out of the hillside
    if (S.map) { const floor = S.map.heightAt(px, pz) + 0.9; if (py < floor) py = floor; }
    if (cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    cam.position.set(px, py, pz);
    cam.lookAt(tx, ty + lookUp, tz);
    return { tx, ty, tz };
  }

  // ── talking ──────────────────────────────────────────────────────────────────────────────────────────────
  function interact() {
    const m = S.map; if (!m) return false;
    const p = S.p;
    const hit = m.nearestInteractable(p.x, p.z, Math.sin(p.yawT), Math.cos(p.yawT));
    if (!hit) return false;
    const t = hit.target, tx = t.ix ?? t.x, tz = t.iz ?? t.z;
    // turn to face it (eased by updatePlayer's turn, which keeps running under the dialogue)
    p.yawT = Math.atan2(tx - p.x, tz - p.z);
    p.vx = p.vz = 0; p.speed = 0;
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
      onClose: () => { if (nod && S.hero) S.hero.nod(); try { onClose && onClose(); } catch (e) { reportError('talk onClose', e); } } });
    return true;
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
      S.offResize = App.onResize(() => { if (S.camera) { S.camera.aspect = App.aspect(); S.camera.updateProjectionMatrix(); } });
      const mapId = ctx.map || pending.map || (Maps.list()[0] ?? null);
      const pos = pending.pos || {};
      pending.map = null; pending.pos = null;
      if (!mapId) { reportError('field enter', new Error('no maps registered')); return; }
      loadMap(mapId, ctx.x ?? pos.x, ctx.z ?? pos.z, ctx.facing ?? pos.facing);
      if (S.camera) { S.camera.aspect = App.aspect(); S.camera.updateProjectionMatrix(); }
    },
    exit() {
      if (S.offResize) S.offResize();
      disposeWorld(false);
      if (F === api) F = null;
    },
    pause() { S.p.vx = S.p.vz = 0; S.p.speed = 0; },
    resume() {},
    update(dt) {
      if (!S.map || S.loading) return;
      // under a dialogue (which sets updateBelow) the world holds still but the camera can still be turned
      if (Scenes.top() === 'field') updatePlayer(dt);
      else {
        Object.assign(S.pp, { x: S.p.x, z: S.p.z, y: S.p.y, yaw: S.p.yaw }); S.p.vx = S.p.vz = 0; S.p.speed = 0; S.p.pivot = 0; S.p.holdT = 0;
        const d = wrapPi(S.p.yawT - S.p.yaw);          // finish turning to face whoever is talking
        if (Math.abs(d) > 1e-4) S.p.yaw = wrapPi(S.p.yaw + Math.sign(d) * Math.min(Math.abs(d), Math.max(Math.abs(d) * Math.min(1, dt * 12), dt * 2.2)));
      }
      updateCamera(dt);
    },
    render(alpha) {
      if (!S.scene || !S.camera) return;
      const t = App.clock.time + (Loop.alpha || 0) * (Loop.stepMs / 1000);
      const dt = S.renderT < 0 ? 0 : Math.max(0, Math.min(0.1, t - S.renderT));
      S.renderT = t;
      Toon.tick(t);
      // player (interpolated)
      const p = S.p, pp = S.pp, hero = S.hero;
      const x = pp.x + (p.x - pp.x) * alpha, z = pp.z + (p.z - pp.z) * alpha, y = pp.y + (p.y - pp.y) * alpha;
      if (hero) {
        hero.group.position.set(x, y, z);
        hero.group.rotation.y = pp.yaw + wrapPi(p.yaw - pp.yaw) * alpha;
        const upd = Scenes.top() === 'field';
        hero.animate(dt, t, { speed: upd ? p.speed : 0, run: upd && p.run, onStep: (foot) => {
          S.stepCount++;
          const mat = S.map ? S.map.groundAt(x, z) : 'grass';
          Sfx.play('footstep', { material: mat === 'water' ? 'dirt' : mat, vol: p.run ? 0.55 : 0.4 });
        } });
      }
      if (S.blobs) { S.blobs.set(0, x, y, z, 1.0 + Math.min(0.15, p.speed * 0.02)); S.blobs.commit(); }
      const focus = placeCamera(alpha);
      if (S.rig) S.rig.follow(FOCUS.set(focus.tx, focus.ty, focus.tz));
      Toon.see.setHero({ x, y, z }, S.camera, App.renderer);
      // prompt over whatever you can talk to
      if (S.prompt) {
        const n = Scenes.top() === 'field' ? S.near : null;
        S.prompt.visible = !!n;
        if (n) {
          const tg = n.target, tx = tg.ix ?? tg.x, tz = tg.iz ?? tg.z;
          const ty = (tg.promptY != null ? tg.promptY : (S.map.heightAt(tx, tz) + (tg.height ?? 2.3)));
          S.prompt.position.set(tx, ty + Math.abs(Math.sin(t * 3.2)) * 0.12, tz);
          const pop = Math.min(1, (S.prompt.userData.k = Math.min(1, (S.prompt.userData.k || 0) + dt * 6)));
          S.prompt.scale.set(0.62 * pop, 0.54 * pop, 1);
        } else S.prompt.userData.k = 0;
      }
      try { if (S.view && S.view.update) S.view.update(t, dt, { camera: S.camera, player: { x, y, z }, field: api }); }
      catch (e) { reportError('map view update', e); }
      App.render(S.scene, S.camera);
    },
    onInput(btn) {
      if (UI.input(btn)) return true;
      if (btn === 'confirm' && Scenes.top() === 'field') { interact(); return true; }
      if (btn === 'menu' && Scenes.top() === 'field' && Scenes.has('menu')) {
        S.p.vx = S.p.vz = 0; S.p.speed = 0;
        Scenes.push('menu', {
          near: S.near ? (S.near.target.name || S.near.target.type) : null,
          talk: () => { if (!interact()) talk({ text: 'There is nobody here to talk to.{n}A bee says hello, though.', name: 'nobody' }); },
          search: () => talk({ text: SEARCH_LINES[S.searchCount++ % SEARCH_LINES.length], name: 'search' }),
        });
        return true;
      }
      return true;
    },
  };

  // ── the instance API used by Field / __DQ ─────────────────────────────────────────────────────────────────
  const api = {
    S, scene, loadMap, placePlayer, talk, interact, applyTime, snapCamera,
    orbit(deg, snap) {
      if (deg === undefined) return r3(((S.cam.yawT / DEG) % 360 + 360) % 360);
      S.cam.yawT = wrapPi(Number(deg) * DEG); S.cam.manualT = 0;
      if (snap) { S.cam.yaw = S.cam.yawT; S.pcam.yaw = S.cam.yaw; }
      return r3(((S.cam.yawT / DEG) % 360 + 360) % 360);
    },
    zoom(n, snap) {
      if (n === undefined) return r3(S.cam.distT);
      S.cam.distT = Math.max(3, Math.min(40, Number(n) || CAM_DEFAULT.dist));
      if (snap) { S.cam.dist = S.cam.distT; S.pcam.dist = S.cam.dist; }
      return S.cam.distT;
    },
    settled() { return Math.abs(wrapPi(S.cam.yawT - S.cam.yaw)) < 0.6 * DEG && Math.abs(S.cam.distT - S.cam.dist) < 0.05; },
    describePlayer() {
      const p = S.p;
      return { x: r3(p.x), y: r3(p.y), z: r3(p.z), facing: r3(((p.yaw / DEG) % 360 + 360) % 360), facingTarget: r3(((p.yawT / DEG) % 360 + 360) % 360), speed: r3(p.speed), running: !!p.run,
        moving: p.speed > 0.1, blocked: !!p.blocked, ground: p.ground, tile: S.map ? S.map.tileAt(p.x, p.z) : null,
        near: S.near ? { name: S.near.target.name || S.near.target.type, dist: r3(S.near.dist) } : null, steps: S.stepCount,
        anim: S.hero ? S.hero.state() : null };
    },
    describeField() {
      const c = S.cam;
      const see = Toon.see.state(), vs = S.view && S.view.state ? (S.view.state().see || null) : null;
      return { camera: { orbit: api.orbit(), current: r3(((c.yaw / DEG) % 360 + 360) % 360), pitch: c.pitch, dist: r3(c.dist), distTarget: r3(c.distT), fov: c.fov,
          auto: c.auto, settled: api.settled(), occluded: !!(vs && vs.occluding), seeThrough: { fading: see.fades, occluding: vs ? vs.occluding : 0, heroWindow: see.hero },
          talkFraming: r3(c.talk), pos: S.camera ? S.camera.position.toArray().map(r3) : null },
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
  player() { return F ? F.describePlayer() : null; },
  talk(o) { return F ? F.talk(o) : false; },
  /** Load a map (or move within the current one). Works whether or not the field is on the stack. */
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
      F.placePlayer(+x, +z, Number.isFinite(+facing) ? +facing * DEG : F.S.p.yaw, true);
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
    Debug.implement('cameraOrbit', (deg) => {
      if (!F) return { ok: false, reason: 'the field is not on the scene stack' };
      if (deg === undefined) return F.orbit();
      const orbit = F.orbit(deg, Loop.frozen);
      return { ok: true, orbit, snapped: Loop.frozen };
    });
    Debug.implement('cameraZoom', (n) => {
      if (!F) return { ok: false, reason: 'the field is not on the scene stack' };
      if (n === undefined) return F.zoom();
      return { ok: true, dist: F.zoom(n, Loop.frozen) };
    });
    Debug.implement('timeOfDay', (h) => {
      if (!F) return h === undefined ? 9 : { ok: false, reason: 'the field is not on the scene stack' };
      return h === undefined ? F.S.hours : F.applyTime(h);
    });
    Debug.implement('screenshotReady', () => !F || (!F.S.loading && F.settled()));
    Debug.provide('map', () => (F && F.S.map ? Object.assign(F.S.map.describe(), { buildMs: F.S.map.buildMs }) : null));
    Debug.provide('player', () => (F ? F.describePlayer() : null));
    Debug.provide('field', () => (F ? F.describeField() : null));
    Debug.expose('cameraAuto', (on) => { if (!F) return null; if (on !== undefined) F.S.cam.auto = !!on; return F.S.cam.auto; });
    /** Tune the follow camera live: __DQ.cameraRig({pitch, dist, fov, lookUp}) (degrees / world units). */
    Debug.expose('cameraRig', (o = {}) => {
      if (!F) return null;
      const c = F.S.cam;
      for (const k of ['pitch', 'fov', 'lookUp']) if (Number.isFinite(+o[k])) c[k] = +o[k];
      if (Number.isFinite(+o.dist)) { c.distT = c.dist = +o.dist; F.S.pcam.dist = c.dist; }
      return { pitch: c.pitch, dist: c.distT, fov: c.fov, lookUp: c.lookUp };
    });
    Debug.expose('face', (deg) => { if (!F) return null; if (deg !== undefined) { F.S.p.yaw = F.S.p.yawT = wrapPi(Number(deg) * DEG); F.S.pp.yaw = F.S.p.yaw; } return F.describePlayer().facing; });
    Debug.expose('walkTo', (x, z) => (F ? (F.placePlayer(+x, +z, F.S.p.yaw, true), F.describePlayer()) : null));
    Debug.expose('talkNear', () => (F ? F.interact() : false));
    /** Sun shadows on/off (perf probing): __DQ.shadows(false). */
    Debug.expose('shadows', (on) => { if (!F || !F.S.rig) return null; if (on !== undefined) F.S.rig.sun.castShadow = !!on; return F.S.rig.sun.castShadow; });
    /** Triangle hogs: [{name, tris (x instances), instances, shadow}] sorted, top n. */
    Debug.expose('meshStats', (n = 25, { inView = false } = {}) => {
      if (!F || !F.S.scene) return null;
      const out = [];
      const frustum = new THREE.Frustum(), sph = new THREE.Sphere();
      if (inView && F.S.camera) { F.S.camera.updateMatrixWorld(); frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(F.S.camera.projectionMatrix, F.S.camera.matrixWorldInverse)); }
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
      save: () => (F ? { x: r3(F.S.p.x), z: r3(F.S.p.z), facing: r3(F.S.p.yaw) } : pending.pos),
      load: (p) => { if (!p) return; if (F) { F.placePlayer(p.x, p.z, p.facing ?? 0, true); F.snapCamera(); } else pending.pos = p; },
      reset: () => { pending.pos = null; },
    });
    return Field;
  },
};

export default Field;
