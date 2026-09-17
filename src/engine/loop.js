/**
 * loop.js — fixed-timestep simulation at 60 Hz with render interpolation.        (F1, owner: src/engine/loop.js)
 *
 *   import { Loop } from './engine/loop.js';
 *   Loop.start(update, render);   // update(dt, tick) at exactly 60 Hz, dt = 1/60 s ALWAYS
 *                                 // render(alpha, frame) once per animation frame, alpha in [0, 1)
 *   Loop.stop();
 *   Loop.setTimeScale(n);         // 0.25 = slow motion, 2 = fast. Changes how many fixed steps run per real second,
 *                                 // never the size of a step, so the simulation stays deterministic.
 *   Loop.step(ms);                // DETERMINISTIC: runs exactly floor((carry + ms) * 60 / 1000) updates, independent
 *                                 // of wall-clock time, timeScale and freeze; carry is kept between calls so
 *                                 // step(1000) === 40 x step(25) === 60 updates. Renders once afterwards.
 *   Loop.freeze(bool);            // pause the simulation but keep rendering (clean screenshots)
 *
 * Read-only: Loop.tick (updates run so far), Loop.simMs (tick * 1000/60), Loop.simTime (seconds), Loop.alpha,
 * Loop.frame (render frames drawn), Loop.fps (measured, 0.5 s window), Loop.frameMs (last real frame gap),
 * Loop.running, Loop.frozen, Loop.timeScale, Loop.hz, Loop.stepMs.
 *
 * Animations that must replay under __DQ.advance should read Loop.simTime / App.clock, NOT performance.now().
 *
 * Safety: the next animation frame is requested BEFORE any work runs, and update/render are each wrapped, so an
 * exception can never stop the loop. Errors go to __DQ.errors. Real-time catch-up is capped (MAX_STEPS per frame,
 * 250 ms max frame gap) so a slow frame or a background tab can't spiral.
 */
import { reportError } from './debug.js';

const HZ = 60;
const STEP_MS = 1000 / HZ;
const MAX_FRAME_GAP_MS = 250;
const MAX_STEPS_PER_FRAME = 8;
const MAX_STEP_CALL_TICKS = HZ * 60 * 10; // Loop.step() hard cap: 10 simulated minutes per call

// Accumulators are kept in "ms x Hz" units so integer-ms advances are exact (1000 units == 1 tick).
let realAcc = 0;
let stepCarry = 0;

let updateFn = null;
let renderFn = null;
let rafId = 0;
let lastT = -1;
let fpsFrames = 0;
let fpsT0 = -1;
const frameHooks = new Set();

function runUpdate() {
  const dt = 1 / HZ;
  try { if (updateFn) updateFn(dt, Loop.tick); }
  catch (e) { reportError('loop update', e); }
  Loop.tick++;
  Loop.simMs = Loop.tick * STEP_MS;
  Loop.simTime = Loop.simMs / 1000;
}

function runRender() {
  try { if (renderFn) renderFn(Loop.alpha, Loop.frame); }
  catch (e) { reportError('loop render', e); }
  Loop.frame++;
  if (frameHooks.size) {
    for (const h of Array.from(frameHooks)) {
      try { h(Loop.alpha, Loop.frame); } catch (e) { reportError('loop frame hook', e); }
    }
  }
}

function onFrame(t) {
  // Schedule first: nothing below may kill the loop.
  rafId = Loop.running ? requestAnimationFrame(onFrame) : 0;
  try {
    if (lastT < 0) lastT = t;
    if (fpsT0 < 0) { fpsT0 = t; fpsFrames = 0; }
    let gap = t - lastT;
    lastT = t;
    if (!(gap >= 0)) gap = 0;
    Loop.frameMs = gap;
    if (gap > MAX_FRAME_GAP_MS) gap = MAX_FRAME_GAP_MS;

    fpsFrames++;
    if (t - fpsT0 >= 500) { // rendered frames per real second; independent of freeze/timeScale
      Loop.fps = Math.round((fpsFrames * 1000) / (t - fpsT0));
      fpsFrames = 0; fpsT0 = t;
    }

    if (!Loop.frozen) {
      realAcc += gap * Loop.timeScale * HZ;
      let steps = 0;
      while (realAcc >= 1000 && steps < MAX_STEPS_PER_FRAME) {
        runUpdate();
        realAcc -= 1000;
        steps++;
      }
      if (realAcc >= 1000) { Loop.droppedMs += (realAcc - realAcc % 1000) / HZ; realAcc %= 1000; }
      Loop.alpha = realAcc / 1000;
    }
    runRender();
  } catch (e) {
    reportError('loop frame', e);
  }
}

export const Loop = {
  hz: HZ,
  stepMs: STEP_MS,
  tick: 0,
  simMs: 0,
  simTime: 0,
  alpha: 0,
  frame: 0,
  fps: 0,
  frameMs: 0,
  droppedMs: 0,
  timeScale: 1,
  running: false,
  frozen: false,

  start(update, render) {
    if (typeof update === 'function') updateFn = update;
    if (typeof render === 'function') renderFn = render;
    if (this.running) return this;
    if (typeof requestAnimationFrame !== 'function') { reportError('loop start', new Error('requestAnimationFrame unavailable')); return this; }
    this.running = true;
    lastT = -1; fpsT0 = -1;
    rafId = requestAnimationFrame(onFrame);
    return this;
  },

  stop() {
    this.running = false;
    if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    rafId = 0;
    lastT = -1;
    return this;
  },

  setTimeScale(n) {
    const v = Number(n);
    this.timeScale = Number.isFinite(v) && v >= 0 ? Math.min(v, 16) : 1;
    return this.timeScale;
  },

  freeze(on = true) {
    const f = !!on;
    if (f !== this.frozen) {
      this.frozen = f;
      if (!f) lastT = -1; // don't dump the frozen wall-clock time into the accumulator
    }
    return this.frozen;
  },

  /** Deterministic advance by `ms` of simulated time. Returns the number of fixed updates run. */
  step(ms = STEP_MS) {
    let v = Number(ms);
    if (!Number.isFinite(v) || v <= 0) return 0;
    stepCarry += v * HZ;
    let n = Math.floor((stepCarry + 1e-6) / 1000);
    stepCarry -= n * 1000;
    if (stepCarry < 0) stepCarry = 0;
    if (n > MAX_STEP_CALL_TICKS) { reportError('loop step', new Error(`step(${ms}) capped at ${MAX_STEP_CALL_TICKS} ticks`)); n = MAX_STEP_CALL_TICKS; }
    for (let i = 0; i < n; i++) runUpdate();
    // Present the result right away (the rAF loop would too, but step() must also work without a running loop).
    runRender();
    return n;
  },

  /** Clear the deterministic step carry (call before a replay so step() chunking starts from zero). */
  resetCarry() { stepCarry = 0; realAcc = 0; this.alpha = 0; },

  /** Reset tick counters (a fresh deterministic run). Does not touch scenes. */
  resetClock() { this.tick = 0; this.simMs = 0; this.simTime = 0; this.resetCarry(); },

  /** fn(alpha, frame) after every rendered frame. Returns unsubscribe. */
  onFrame(fn) { if (typeof fn !== 'function') return () => {}; frameHooks.add(fn); return () => frameHooks.delete(fn); },

  info() {
    return { tick: this.tick, simMs: Math.round(this.simMs * 1000) / 1000, frame: this.frame, fps: this.fps,
      timeScale: this.timeScale, frozen: this.frozen, running: this.running, alpha: Math.round(this.alpha * 1000) / 1000,
      droppedMs: Math.round(this.droppedMs) };
  },
};
