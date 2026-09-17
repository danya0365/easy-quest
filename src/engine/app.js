/**
 * app.js — renderer, default scene/camera, frame protocol, quality tier.          (F1, owner: src/engine/app.js)
 *
 *   import { App } from './engine/app.js';
 *   App.start({ canvas, version })   // one-liner boot used by main.js and every demo:
 *                                    //   Debug.install + App.init + Loop.start(Scenes.update, Scenes.render)
 *
 * Contract (docs/ARCHITECTURE.md):
 *   App.renderer  THREE.WebGLRenderer (sRGB output, NoToneMapping, PCFSoft shadows — docs/ART-DIRECTION.md §3)
 *   App.scene     default THREE.Scene. Contains App.layers.world and App.layers.fx.
 *   App.camera    default THREE.PerspectiveCamera(45, aspect, 0.3, 1400). Aspect is kept in sync on resize.
 *   App.clock     DETERMINISTIC sim clock: {time (s), dt (s), tick, alpha, frame, getElapsedTime(), getDelta()}.
 *                 Driven by the loop; advances under __DQ.advance, stops under __DQ.freeze. Animate from this.
 *   App.width / App.height (CSS px), App.dpr (pixel ratio in use), App.quality 'low'|'med'|'high'
 *   App.tier      {pixelRatioCap, shadowMapSize, shadows, antialias} for the current quality
 *   App.init(canvas?), App.resize(), App.render(scene?, camera?)
 *   App.layers    { world: Group, fx: Group, ui3d: Scene }
 *                   world — static + dynamic world content of the default scene
 *                   fx    — particles/effects of the default scene
 *                   ui3d  — a separate overlay scene drawn LAST each frame, after a depth clear, with App.ui3dCamera
 *                           or else the most recent PERSPECTIVE camera given to App.render (floating damage numbers,
 *                           3D cursors). Never occluded. Skipped when empty.
 *
 * Frame protocol (App.start wires it; call it yourself only if you run your own loop):
 *   App.beginFrame()  ->  scenes call App.render(threeScene, camera) bottom-up  ->  App.endFrame()
 *   The first App.render of a frame clears colour+depth (and draws the scene background); every later one in the
 *   same frame only clears depth, so overlay scenes draw over the ones below. Overlay THREE.Scenes must leave
 *   `background` null — a Color background force-clears in three r180.
 *
 * Quality: ?quality=low|med|high in the URL, else localStorage 'dqv.quality', else auto-detected from the GPU string.
 * Resize: tracks the canvas' CSS box (ResizeObserver + window resize). Listeners: App.onResize(fn) or Bus 'app.resize'.
 * Never throws: renderer creation failure / context loss go to __DQ.errors and App.render becomes a no-op.
 */
import * as THREE from 'three';
import { Loop } from './loop.js';
import { Scenes } from './states.js';
import { Bus } from './events.js';
import { Debug, reportError } from './debug.js';

const TIERS = {
  low:  { pixelRatioCap: 1.0,  shadowMapSize: 1024, shadows: true, antialias: true },
  med:  { pixelRatioCap: 1.25, shadowMapSize: 2048, shadows: true, antialias: true },
  high: { pixelRatioCap: 1.5,  shadowMapSize: 2048, shadows: true, antialias: true },
};

let frameCleared = false;
let frameDrew = false;
let lastCamera = null;
let resizeObserver = null;
const resizeHooks = new Set();
const frameStats = { calls: 0, triangles: 0, points: 0, lines: 0 };

function readQualityOverride() {
  try {
    const q = new URLSearchParams(location.search).get('quality');
    if (q && TIERS[q]) return q;
  } catch (_) {}
  try {
    const q = localStorage.getItem('dqv.quality');
    if (q && TIERS[q]) return q;
  } catch (_) {}
  return null;
}

function detectQuality(renderer) {
  const forced = readQualityOverride();
  if (forced) return { quality: forced, gpu: 'forced' };
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
  } catch (_) {}
  const g = gpu.toLowerCase();
  let coarse = false;
  try { coarse = matchMedia('(pointer: coarse)').matches; } catch (_) {}
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  let quality = 'med';
  if (/swiftshader|llvmpipe|software|basic render|mesa offscreen/.test(g)) quality = 'low';
  else if (/adreno|mali|powervr|videocore/.test(g)) quality = 'low';
  else if (/apple m\d|apple gpu|nvidia|geforce|rtx|quadro|radeon rx|radeon pro|arc a\d/.test(g)) quality = 'high';
  else if (/intel|iris|uhd|hd graphics|radeon\(tm\) graphics|radeon graphics/.test(g)) quality = 'med';
  if (coarse && quality === 'high') quality = 'med';
  if (cores <= 2 && quality !== 'low') quality = 'low';
  return { quality, gpu };
}

/** Deterministic simulation clock, refreshed from the Loop. */
const clock = {
  time: 0, dt: 1 / 60, tick: 0, alpha: 0, frame: 0,
  getElapsedTime() { return this.time; },
  getDelta() { return this.dt; },
  sync() { this.tick = Loop.tick; this.time = Loop.simTime; this.alpha = Loop.alpha; this.frame = Loop.frame; },
};

export const App = {
  renderer: null,
  scene: null,
  camera: null,
  clock,
  canvas: null,
  width: 0,
  height: 0,
  dpr: 1,
  quality: 'med',
  gpu: '',
  tier: TIERS.med,
  layers: { world: null, fx: null, ui3d: null },
  ui3dCamera: null,   // camera for the ui3d pass; null = the last perspective camera passed to App.render this session
  framesDrawn: 0,
  contextLost: false,
  started: false,

  init(canvas) {
    if (this.renderer) return this;
    try {
      if (!canvas && typeof document !== 'undefined') canvas = document.getElementById('game-canvas');
      if (!canvas && typeof document !== 'undefined') {
        canvas = document.createElement('canvas');
        canvas.id = 'game-canvas';
        canvas.style.cssText = 'display:block;width:100%;height:100%';
        document.body.appendChild(canvas);
      }
      this.canvas = canvas;

      // Default scene graph — exists even if WebGL fails, so modules that add to it never crash.
      this.scene = new THREE.Scene();
      this.scene.name = 'App.scene';
      const world = new THREE.Group(); world.name = 'layer:world';
      const fx = new THREE.Group(); fx.name = 'layer:fx';
      this.scene.add(world, fx);
      const ui3d = new THREE.Scene(); ui3d.name = 'layer:ui3d';
      this.layers = { world, fx, ui3d };
      this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.3, 1400);
      this.camera.position.set(0, 7, 12);
      this.camera.lookAt(0, 1, 0);
      lastCamera = this.camera;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.info.autoReset = false;
      this.renderer = renderer;

      const q = detectQuality(renderer);
      this.quality = q.quality; this.gpu = q.gpu; this.tier = TIERS[q.quality];
      renderer.shadowMap.enabled = this.tier.shadows;

      canvas.addEventListener('webglcontextlost', (ev) => {
        ev.preventDefault();
        this.contextLost = true;
        reportError('App', new Error('WebGL context lost'));
        Bus.emit('app.contextlost');
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        this.contextLost = false;
        Bus.emit('app.contextrestored');
      }, false);

      this.resize(true);
      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => this.resize());
        resizeObserver.observe(canvas);
      }
      addEventListener('resize', () => this.resize());
    } catch (e) {
      reportError('App.init', e);
    }
    return this;
  },

  /** Set quality at runtime ('low'|'med'|'high'); persists to localStorage. */
  setQuality(q) {
    if (!TIERS[q]) return this.quality;
    this.quality = q; this.tier = TIERS[q];
    try { localStorage.setItem('dqv.quality', q); } catch (_) {}
    this.resize(true);
    Bus.emit('app.quality', { quality: q, tier: this.tier });
    return q;
  },

  resize(force = false) {
    try {
      const c = this.canvas;
      let w = (c && c.clientWidth) || 0, h = (c && c.clientHeight) || 0;
      if (!w || !h) { w = (typeof innerWidth !== 'undefined' ? innerWidth : 1280); h = (typeof innerHeight !== 'undefined' ? innerHeight : 720); }
      const dpr = Math.min((typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1) || 1, this.tier.pixelRatioCap);
      if (!force && w === this.width && h === this.height && dpr === this.dpr) return false;
      this.width = w; this.height = h; this.dpr = dpr;
      if (this.renderer) { this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false); }
      if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
      const payload = { width: w, height: h, dpr };
      for (const fn of Array.from(resizeHooks)) { try { fn(payload); } catch (e) { reportError('App.onResize hook', e); } }
      Bus.emit('app.resize', payload);
      return true;
    } catch (e) { reportError('App.resize', e); return false; }
  },

  /** fn({width, height, dpr}) on every resize (use it to fix the aspect of your own cameras). Returns unsubscribe. */
  onResize(fn) { if (typeof fn !== 'function') return () => {}; resizeHooks.add(fn); return () => resizeHooks.delete(fn); },

  /** Aspect ratio helper for scene-owned cameras. */
  aspect() { return this.height ? this.width / this.height : 16 / 9; },

  beginFrame() {
    frameCleared = false;
    frameDrew = false;
    clock.sync();
    if (this.renderer) this.renderer.info.reset();
  },

  /**
   * Draw `scene` with `camera` (defaults: App.scene / App.camera). First call of the frame clears everything;
   * later calls clear depth only, so they overlay. Returns true if something was drawn.
   */
  render(scene = this.scene, camera = this.camera, opts = null) {
    const r = this.renderer;
    if (!r || this.contextLost || !scene || !camera) return false;
    if (!frameCleared || (opts && opts.clear)) {
      r.autoClear = true;
      frameCleared = true;
    } else {
      r.autoClear = false;
      if (!(opts && opts.clearDepth === false)) r.clearDepth();
    }
    try { r.render(scene, camera); }
    finally { r.autoClear = true; }
    if (!camera.isOrthographicCamera) lastCamera = camera; // 2D overlay passes don't steal the ui3d camera
    frameDrew = true;
    return true;
  },

  endFrame() {
    const r = this.renderer;
    if (!r || this.contextLost) return;
    try {
      const ui = this.layers.ui3d;
      const uiCam = this.ui3dCamera || lastCamera;
      if (ui && ui.children.length && uiCam) {
        if (frameCleared) { r.autoClear = false; r.clearDepth(); }
        try { r.render(ui, uiCam); } finally { r.autoClear = true; }
        frameCleared = true;
        frameDrew = true;
      }
      if (!frameCleared) r.clear(true, true, true); // empty stack: don't leave a stale frame up
    } catch (e) { reportError('App.endFrame', e); }
    const info = r.info.render;
    frameStats.calls = info.calls; frameStats.triangles = info.triangles; frameStats.points = info.points; frameStats.lines = info.lines;
    if (frameDrew) this.framesDrawn++;
  },

  /** Draw-call/triangle totals of the last completed frame (all passes, shadows included). */
  stats() {
    const m = this.renderer ? this.renderer.info.memory : { geometries: 0, textures: 0 };
    let programs = 0;
    try { programs = this.renderer ? (this.renderer.info.programs || []).length : 0; } catch (_) {}
    return { calls: frameStats.calls, tris: frameStats.triangles, points: frameStats.points, lines: frameStats.lines,
      geometries: m.geometries, textures: m.textures, programs,
      width: this.width, height: this.height, dpr: this.dpr, quality: this.quality, gpu: this.gpu, framesDrawn: this.framesDrawn };
  },

  /**
   * Boot the engine: Debug API, renderer, and the fixed-step loop driving the scene stack.
   *   App.start({ canvas?, version?, beforeUpdate?(dt, tick), update?(dt, tick), render?(alpha) })
   * `beforeUpdate` runs each tick BEFORE the scene stack (poll input there and feed Scenes.input(btn));
   * `update` / `render` run after the scene stack each tick / frame. All are optional and individually guarded.
   */
  start(opts = {}) {
    if (this.started) return this;
    this.started = true;
    Debug.install({ version: opts.version });
    this.init(opts.canvas);
    const preUpdate = typeof opts.beforeUpdate === 'function' ? opts.beforeUpdate : null;
    const extraUpdate = typeof opts.update === 'function' ? opts.update : null;
    const extraRender = typeof opts.render === 'function' ? opts.render : null;
    Loop.start(
      (dt, tick) => {
        clock.sync();
        if (preUpdate) { try { preUpdate(dt, tick); } catch (e) { reportError('App beforeUpdate hook', e); } }
        Scenes.update(dt);
        if (extraUpdate) { try { extraUpdate(dt, tick); } catch (e) { reportError('App update hook', e); } }
      },
      (alpha) => {
        this.beginFrame();
        Scenes.render(alpha);
        if (extraRender) { try { extraRender(alpha); } catch (e) { reportError('App render hook', e); } }
        this.endFrame();
      },
    );
    return this;
  },
};
