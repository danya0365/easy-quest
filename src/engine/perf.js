/**
 * perf.js — Performance report + quality mirror.                                     (P34, owner: src/engine/perf.js)
 *
 * Wave-2 breadth: one __DQ.state().perf a critic can read — fps, quality tier, draw counts — without inventing
 * a second profiler. Heavy culling/instancing work comes later; this makes the bar measurable.
 *
 *   Perf.install(ctx)
 *   Perf.describe() -> { fps, quality, dpr, calls?, memory? }
 */
import { Debug, reportError } from './debug.js';
import { App } from './app.js';
import { Loop } from './loop.js';
import { Bus } from './events.js';
import { setOutlines } from '../art/toon.js';

const S = { installed: false, longFrames: 0, samples: [] };

function sample() {
  const fps = Loop.fps || 0;
  if (fps > 0) {
    S.samples.push(fps);
    if (S.samples.length > 90) S.samples.shift();
  }
  const ms = Loop.frameMs || 0;
  if (ms > 33) S.longFrames++;
}

export const Perf = {
  describe() {
    sample();
    const samples = S.samples;
    const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : (Loop.fps || 0);
    let mem = null;
    try {
      const p = performance && performance.memory;
      if (p) mem = { usedMB: +(p.usedJSHeapSize / 1048576).toFixed(1), totalMB: +(p.totalJSHeapSize / 1048576).toFixed(1) };
    } catch (_) {}
    let quality = 'med', dpr = 1, size = null, calls = null;
    try {
      quality = App.quality || 'med';
      dpr = App.dpr || 1;
      size = { w: App.width, h: App.height };
      const info = App.renderer && App.renderer.info;
      if (info && info.render) calls = { calls: info.render.calls, tris: info.render.triangles, frames: App.framesDrawn };
    } catch (_) {}
    return {
      fps: +avg.toFixed(1),
      fpsNow: Loop.fps || 0,
      frameMs: Loop.frameMs || 0,
      quality,
      dpr,
      size,
      longFrames: S.longFrames,
      memory: mem,
      render: calls,
      tier: (App.tier && typeof App.tier === 'object') ? {
        pixelRatioCap: App.tier.pixelRatioCap,
        shadowMapSize: App.tier.shadowMapSize,
        shadows: App.tier.shadows,
      } : null,
    };
  },
  install(ctx = {}) {
    if (S.installed) return Perf;
    S.installed = true;
    const D = ctx.Debug || Debug;
    try { Bus.on('app.quality', () => { try { sample(); } catch (_) {} }); }
    catch (e) { reportError('perf bus', e); }
    D.provide('perf', () => Perf.describe());
    D.expose('perf', () => Perf.describe());
    D.expose('quality', (q) => {
      try {
        if (q != null && App.setQuality) App.setQuality(String(q));
        // Low tier: drop foliage hull outlines (P34 / INTEGRATION-NEEDS). Meadow already thins tufts on App.quality==='low'.
        try { setOutlines(App.quality !== 'low'); } catch (_) {}
        sample();
        return { quality: App.quality, tier: App.tier, outlines: App.quality !== 'low' };
      } catch (e) { reportError('perf quality', e); return { error: String(e && e.message || e) }; }
    });
    return Perf;
  },
};

export function install(ctx) { return Perf.install(ctx); }
export default Perf;
