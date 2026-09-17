/**
 * weather.js — the ENVIRONMENT every outdoor surface reads (time-of-day weights, sun / moon, haze, light tint,
 * overcast, wet, snow) and gentle weather: soft rain and drifting snow.        (P02, owner: src/art/weather.js)
 *
 * ONE shared set of uniforms (ENV.u) is referenced by the sky dome, the clouds, the hill rings, Highfeather, the ground
 * and the water, so a single update per frame re-lights the whole world beyond. Nothing here draws on its own: the
 * sky dome (src/art/sky.js buildSky) calls ENV.sync(rig, scene) from its onBeforeRender, so a map that builds a sky
 * gets time of day and weather with no extra wiring.
 *
 *   import { ENV, setWeather } from '../art/weather.js';
 *   ENV.sync(rig, scene)            once per frame (the sky does it): reads rig.preset / rig.dir, eases the weather
 *   ENV.setHours(h, rig)            0..24 -> rig.apply / rig.blend exactly like the field's schedule (day, dusk, night)
 *   ENV.setWeather(kind, {instant}) 'clear' | 'cloudy' | 'rain' | 'snow'   (precipitation follows the camera)
 *   ENV.describe()                  JSON summary -> __DQ.state().sky
 *   installEnvDebug()               __DQ.weather(kind, {instant}) + state().sky (idempotent; buildSky calls it)
 *
 * TIME OF DAY without a shared-file edit: the field's __DQ.timeOfDay(h) blends the light rig ('day', 'dusk', 'night',
 * or 'a>b@t'). ENV parses rig.preset each frame into weights {day, dusk, night}, so stars, the moon, the sunset disc,
 * night clouds, hazy hills and dark water all follow whatever set the rig.
 *
 * WEATHER keeps the lit:shade rule: overcast lowers the sun and lifts the hemisphere fill a little (flatter, never
 * grey-black), tracked against whatever the rig was last set to so it never compounds.
 */
import * as THREE from 'three';
import { PAL, C3, mixHex, scaleHex, lerp, smooth, clamp01 } from './palette.js';
import { App } from '../engine/app.js';
import { Bus } from '../engine/events.js';
import { Debug, reportError } from '../engine/debug.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

/** Light directions per preset (must match toon.js RIG_PRESETS dirs; the disc sits where the light comes from). */
const DIR = {
  day: V3(0.55, 0.72, 0.42),
  dusk: V3(0.8, 0.13, 0.3),          // the sunset disc sits low over the hills on the dusk light's bearing
  duskLight: V3(0.8, 0.34, 0.3),
  night: V3(-0.35, 0.8, 0.45),
  set: V3(0.8, -0.3, 0.3),           // below the horizon after dusk
  rise: V3(-0.55, -0.25, 0.42),      // below the horizon before dawn
  moon: V3(-0.42, 0.25, -0.88),      // art-directed: low over the north-west hills, in view of the opening camera
  moonDown: V3(-0.42, -0.12, -0.88),
};

/**
 * The moon's night: it rises in the south-east, crosses low and big (a storybook moon, never overhead) and sets
 * in the north-west. `t` = 0 at 18:00, 1 at 06:00. At 22:00 it sits exactly where the art direction put it.
 */
const MOON_AZ0 = Math.atan2(-0.88, -0.42);       // the art-directed bearing at 22:00
const MOON_SWEEP = 1.72;                         // radians travelled across the whole night
const MOON_T22 = 4 / 12;
function moonDirAt(t, out) {
  const k = Math.max(0, Math.min(1, t));
  const az = MOON_AZ0 + (k - MOON_T22) * MOON_SWEEP;
  const el = -0.05 + 0.34 * Math.sin(Math.PI * k);
  const ch = Math.cos(el);
  return out.set(Math.cos(az) * ch, Math.sin(el), Math.sin(az) * ch).normalize();
}

// ── palette sets per time of day (linear colours, built once) ────────────────────────────────────────────────
/**
 * AERIAL PERSPECTIVE, not fog. The haze a far layer fades into is pushed off milky white-grey toward the blue of
 * the farthest ranges, so the three landscape tiers read as DISTANCE. (PAL.sky.haze itself stays the palette's.)
 */
export const AERIAL_HAZE = mixHex(PAL.sky.haze, PAL.hill.farLow, 0.34);

function sets() {
  const L = (h) => C3(h);
  const sky = (P) => ({ zenith: L(P.zenith), upper: L(P.upper), horizon: L(P.horizon), haze: L(P.haze), sunGlow: L(P.sunGlow) });
  return {
    day: Object.assign(sky(PAL.sky), { haze: L(AERIAL_HAZE) }, {
      cLit: L(PAL.cloud.lit), cMid: L(mixHex(PAL.cloud.mid, PAL.cloud.warm, 0.45)), cShade: L(PAL.cloud.shade), cBase: L(PAL.cloud.core),
      sun: L(mixHex(PAL.cloud.lit, PAL.sky.sunGlow, 0.35)), twilight: L(PAL.sky.sunGlow), light: L(PAL.mask.on),
      range: L(mixHex(PAL.hill.farLow, PAL.sky.horizon, 0.28)),      // aerial blue, not milky grey
    }),
    dusk: Object.assign(sky(PAL.dusk), {
      cLit: L(mixHex(PAL.dusk.sunGlow, PAL.cloud.lit, 0.3)), cMid: L(mixHex(PAL.dusk.horizon, PAL.dusk.hemiSky, 0.45)),
      cShade: L(mixHex(PAL.dusk.hemiSky, PAL.dusk.upper, 0.55)), cBase: L(mixHex(PAL.dusk.upper, PAL.dusk.zenith, 0.35)),
      sun: L(mixHex(PAL.dusk.sunGlow, PAL.flower.center, 0.3)), twilight: L(mixHex(PAL.dusk.sunGlow, PAL.dusk.horizon, 0.4)),
      light: L(scaleHex(mixHex(PAL.dusk.sun, PAL.mask.on, 0.35), 0.92)), range: L(mixHex(PAL.dusk.hemiSky, PAL.dusk.horizon, 0.3)),
    }),
    night: Object.assign(sky(PAL.night), {
      cLit: L(scaleHex(mixHex(PAL.night.hemiSky, PAL.cloud.shade, 0.35), 0.86)), cMid: L(scaleHex(mixHex(PAL.night.upper, PAL.night.hemiSky, 0.45), 0.9)),
      cShade: L(mixHex(PAL.night.upper, PAL.night.zenith, 0.45)), cBase: L(mixHex(PAL.night.zenith, PAL.night.upper, 0.2)),
      sun: L(PAL.night.sunGlow), twilight: L(mixHex(PAL.dusk.horizon, PAL.night.horizon, 0.6)),
      light: L(scaleHex(PAL.night.hemiSky, 0.62)), range: L(mixHex(PAL.night.horizon, PAL.night.upper, 0.45)),
    }),
    overcast: {
      zenith: L(mixHex(PAL.cloud.core, PAL.sky.upper, 0.25)), upper: L(mixHex(PAL.cloud.shade, PAL.cloud.core, 0.4)),
      horizon: L(mixHex(PAL.cloud.mid, PAL.cloud.shade, 0.5)), haze: L(mixHex(PAL.cloud.shade, PAL.sky.haze, 0.5)),
      deck: L(mixHex(PAL.cloud.shade, PAL.cloud.core, 0.35)), deckLit: L(mixHex(PAL.cloud.mid, PAL.cloud.shade, 0.4)),
    },
    snowSky: { horizon: L(mixHex(PAL.snow.mid, PAL.cloud.mid, 0.5)), haze: L(PAL.snow.mid) },
    // dawn is not dusk run backwards with the warmth taken out: there is rose in it, low and cool above
    dawn: {
      horizon: L(mixHex(PAL.dusk.horizon, PAL.flower.pink, 0.40)), upper: L(mixHex(PAL.dusk.upper, PAL.flower.pink, 0.34)),
      haze: L(mixHex(PAL.dusk.haze, PAL.flower.pink, 0.40)), glow: L(mixHex(PAL.sky.sunGlow, PAL.flower.pink, 0.34)),
      twilight: L(mixHex(PAL.dusk.sunGlow, PAL.flower.pink, 0.38)),
    },
  };
}

const KINDS = {
  clear:  { overcast: 0, precip: 0, wet: 0, snow: 0 },
  cloudy: { overcast: 0.55, precip: 0, wet: 0, snow: 0 },
  rain:   { overcast: 0.88, precip: 1, wet: 1, snow: 0 },
  snow:   { overcast: 0.6, precip: 1, wet: 0, snow: 1 },
};
/** Seconds to go all the way (rain wets the lanes faster than the sun dries them; snow settles slowly). */
const RATE = { overcast: 4, precip: 3, wetUp: 9, wetDown: 25, snowUp: 16, snowDown: 30 };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ENV — the shared environment
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
/** The celestial pole the stars turn about — tilted, so they rise and set instead of sliding sideways. */
const SKY_AXIS = V3(0.34, 0.90, -0.27), SKY_AXIS_M4 = new THREE.Matrix4();

/** Invert smoothstep: the hour that produced a blend factor. */
const unsmooth = (y) => 0.5 - Math.sin(Math.asin(1 - 2 * clamp01(y)) / 3);
/**
 * Read the hour back out of a light-rig preset, inverting the day schedule (day 8-16.5, dusk to 19.5, night to 5,
 * dawn 5-8). The plateaus (plain 'day', plain 'night', a saturated blend) cannot say WHERE in the plateau they are,
 * so they answer with the middle of it — enough that 21:30 and 03:00 are never the same sky.
 */
function hoursFromPreset(a, b, raw) {
  if (a === 'day' && b === 'dusk') return raw >= 0.999 ? 19.0 : 16.5 + unsmooth(raw) * 2;
  if (a === 'dusk' && b === 'night') return raw >= 0.999 ? 22.4 : 19.5 + unsmooth(raw) * 1.5;
  if (a === 'night' && b === 'day') return raw >= 0.999 ? 8.4 : 5 + unsmooth(raw) * 3;
  if (a === 'dusk') return 18.6;
  if (a === 'night') return 2.4;
  return 12;
}
/** The preset that hour produces (the same schedule the field uses) — so a known hour is never thrown away. */
function presetFor(H) {
  if (H > 16.5 && H < 19.5) return ['day', 'dusk', smooth(16.5, 18.5, H)];
  if (H >= 19.5) return ['dusk', 'night', smooth(19.5, 21, H)];
  if (H < 5) return ['night', 'night', 0];
  if (H < 8) return ['night', 'day', smooth(5, 8, H)];
  return ['day', 'day', 0];
}
const hoursFit = (a, b, raw, h) => {
  if (h == null || !Number.isFinite(h)) return false;
  const [pa, pb, pr] = presetFor(h);
  return pa === a && pb === b && Math.abs(pr - raw) < 0.02;
};

export const ENV = {
  /** Shared uniform objects: reference these (never copy) from any material that should follow the sky. */
  u: {
    uEnvTime: { value: 0 },
    uEnvDay: { value: 1 }, uEnvDusk: { value: 0 }, uEnvNight: { value: 0 }, uEnvTwilight: { value: 0 },
    uEnvSunDir: { value: DIR.day.clone() }, uEnvMoonDir: { value: DIR.moon.clone() },
    uEnvSunVis: { value: 1 }, uEnvMoonVis: { value: 0 },
    uEnvOvercast: { value: 0 }, uEnvWet: { value: 0 }, uEnvSnow: { value: 0 }, uEnvPrecip: { value: 0 },
    uEnvHaze: { value: C3(PAL.sky.haze) }, uEnvHorizon: { value: C3(PAL.sky.horizon) },
    uEnvLight: { value: new THREE.Color(1, 1, 1) },
    uEnvSun: { value: new THREE.Color(1, 1, 1) }, uEnvTwilightCol: { value: C3(PAL.sky.sunGlow) },
    uEnvCloudLit: { value: new THREE.Color() }, uEnvCloudMid: { value: new THREE.Color() },
    uEnvCloudShade: { value: new THREE.Color() }, uEnvCloudBase: { value: new THREE.Color() },
    uEnvRange: { value: new THREE.Color() }, uEnvDeck: { value: new THREE.Color() }, uEnvDeckLit: { value: new THREE.Color() },
    uEnvWindXZ: { value: new THREE.Vector2(0.6, -0.25) },
    /** The night sky's own rotation about the pole: the stars are not painted on, they turn with the hours. */
    uEnvSkyRot: { value: new THREE.Matrix3() },
  },
  /** The five colours the field's applyTime lerps (buildSky's `uniforms` point at these same objects). */
  sky: { uZenith: { value: C3(PAL.sky.zenith) }, uUpper: { value: C3(PAL.sky.upper) }, uHorizon: null, uHaze: null, uSunGlow: { value: C3(PAL.sky.sunGlow) } },
  weights: { day: 1, dusk: 0, night: 0 },
  pair: ['day', 'day'], k: 0,
  twilight: 0, dawn: 0,
  hours: 9,                              // the opening hour of the game, until someone sets the clock
  preset: 'day',
  weather: { kind: 'clear', overcast: 0, precip: 0, wet: 0, snow: 0 },
  scene: null,
  _sets: null, _lastPreset: undefined, _lastTime: null, _mods: new WeakMap(), _pendingHours: null,

  /** Per-frame: time-of-day weights from the rig, weather easing, shared uniforms, rig/fog modulation. */
  sync(rig, scene) {
    try {
      const S = this._sets || (this._sets = sets());
      const t = App.clock ? App.clock.time : performance.now() / 1000;
      const dt = this._lastTime == null ? 0 : Math.max(0, Math.min(0.25, t - this._lastTime));
      this._lastTime = t;
      this.u.uEnvTime.value = t;
      if (scene) this.scene = scene;

      // ── time of day from the rig ──
      const preset = rig ? rig.preset : this.preset;
      if (preset !== this._lastPreset) { this._lastPreset = preset; this._parse(preset); }
      const w = this.weights;
      this.twilight = clamp01(w.dusk + 4 * w.night * w.day);
      // dawn: the night->day blend only. Rose in the east, strongest halfway up.
      this.dawn = (this.pair[0] === 'night' && this.pair[1] === 'day') ? Math.pow(Math.sin(Math.PI * clamp01(this.k)), 0.8) : 0;

      // ── weather easing ──
      this._easeWeather(dt);
      const W = this.weather, oc = W.overcast;

      // ── shared uniforms ──
      const U = this.u;
      U.uEnvDay.value = w.day; U.uEnvDusk.value = w.dusk; U.uEnvNight.value = w.night; U.uEnvTwilight.value = this.twilight;
      U.uEnvOvercast.value = oc; U.uEnvWet.value = W.wet; U.uEnvSnow.value = W.snow; U.uEnvPrecip.value = W.precip;
      const mix3 = (key, out) => {
        const A = S.day[key], B = S.dusk[key], C = S.night[key];
        out.setRGB(A.r * w.day + B.r * w.dusk + C.r * w.night, A.g * w.day + B.g * w.dusk + C.g * w.night, A.b * w.day + B.b * w.dusk + C.b * w.night);
        return out;
      };
      for (const k of ['cLit', 'cMid', 'cShade', 'cBase']) mix3(k, U['uEnvCloud' + k.slice(1)].value);
      mix3('sun', U.uEnvSun.value); mix3('twilight', U.uEnvTwilightCol.value); mix3('light', U.uEnvLight.value); mix3('range', U.uEnvRange.value);
      // dawn is a sunset run backwards: pull the glow colour toward the warm dusk one whenever it is twilight at all
      U.uEnvTwilightCol.value.lerp(S.dusk.twilight, this.twilight * 0.7);
      mix3('zenith', this.sky.uZenith.value); mix3('upper', this.sky.uUpper.value); mix3('horizon', U.uEnvHorizon.value);
      mix3('haze', U.uEnvHaze.value); mix3('sunGlow', this.sky.uSunGlow.value);
      // ...and dawn has rose in it, which a night->day lerp on its own does not
      if (this.dawn > 0.002) {
        const D = S.dawn, dk = this.dawn;
        U.uEnvHorizon.value.lerp(D.horizon, dk * 0.60);
        this.sky.uUpper.value.lerp(D.upper, dk * 0.30);
        U.uEnvHaze.value.lerp(D.haze, dk * 0.52);
        this.sky.uSunGlow.value.lerp(D.glow, dk * 0.62);
        U.uEnvTwilightCol.value.lerp(D.twilight, dk * 0.80);
      }
      // overcast greys the dome (a lit grey by day, a dimmer blue-grey at dusk and night) and cools the light
      if (oc > 0) {
        const dim = lerp(1, 0.42, w.night) * lerp(1, 0.78, w.dusk);
        const grey = (c, key, k) => c.lerp(tmpC.copy(S.overcast[key]).multiplyScalar(dim), k);
        grey(this.sky.uZenith.value, 'zenith', oc * 0.85); grey(this.sky.uUpper.value, 'upper', oc * 0.85);
        grey(U.uEnvHorizon.value, 'horizon', oc * 0.7); grey(U.uEnvHaze.value, 'haze', oc * 0.65);
        if (W.snow > 0 || this.weather.kind === 'snow') { const ks = oc * 0.5 * (this.weather.kind === 'snow' ? 1 : W.snow); U.uEnvHorizon.value.lerp(tmpC.copy(S.snowSky.horizon).multiplyScalar(dim), ks); U.uEnvHaze.value.lerp(tmpC.copy(S.snowSky.haze).multiplyScalar(dim), ks); }
        U.uEnvLight.value.multiplyScalar(1 - 0.22 * oc);
        for (const k of ['Lit', 'Mid']) U['uEnvCloud' + k].value.lerp(tmpC.copy(S.overcast.deckLit).multiplyScalar(dim), oc * 0.55);
        for (const k of ['Shade', 'Base']) U['uEnvCloud' + k].value.lerp(tmpC.copy(S.overcast.deck).multiplyScalar(dim * 0.8), oc * 0.5);
      }
      U.uEnvDeck.value.copy(S.overcast.deck).multiplyScalar(lerp(1, 0.34, w.night) * lerp(1, 0.8, w.dusk));
      U.uEnvDeckLit.value.copy(S.overcast.deckLit).multiplyScalar(lerp(1, 0.38, w.night) * lerp(1, 0.85, w.dusk));
      // the field lerps uHorizon / uHaze itself: they are the same objects as the shared ones
      this.sky.uHorizon = U.uEnvHorizon; this.sky.uHaze = U.uEnvHaze;

      // ── sun and moon ──
      this._celestial(rig);
      U.uEnvSunVis.value = clamp01(1 - w.night) * (1 - 0.92 * oc);
      U.uEnvMoonVis.value = clamp01(w.night + 0.3 * w.dusk) * (1 - 0.85 * oc);

      // ── overcast flattens the light (tracked against the rig's own values so it never compounds) ──
      if (rig && rig.sun && rig.hemi) {
        this._mod(rig.sun, 'intensity', 1 - 0.5 * oc);
        this._mod(rig.hemi, 'intensity', 1 + 0.1 * oc);
      }
      // the scene fog IS the aerial haze: every far layer that fades (the mid ring, the wooded hill cards) fades
      // into the same blue the dome's horizon band does, so distance reads as distance and not as weather
      const fog = scene && scene.fog;
      if (fog && fog.isFog) {
        this._modColor(fog, U.uEnvHaze.value, 0.78 + 0.22 * oc);
        this._mod(fog, 'far', 1 - 0.35 * W.precip);
      }
    } catch (e) { reportError('ENV.sync', e); }
  },

  _parse(preset) {
    const w = { day: 0, dusk: 0, night: 0 };
    let a = 'day', b = 'day', k = 0, raw = 0;
    const m = typeof preset === 'string' && preset.match(/^(\w+)>(\w+)@([\d.]+)$/);
    if (m) { a = m[1]; b = m[2]; raw = +m[3]; k = smooth(0, 1, raw); }
    else if (typeof preset === 'string' && (preset === 'dusk' || preset === 'night')) { a = b = preset; }
    if (!(a in w)) a = 'day';
    if (!(b in w)) b = 'day';
    w[a] += 1 - k; w[b] += k;
    this.weights = w; this.pair = [a, b]; this.k = k; this.preset = preset;
    // The CLOCK. ENV.setHours knows the hour exactly; anything else (the field's own applyTime, a bare rig.apply)
    // only leaves a preset behind, so read the hour back out of it — otherwise every hour of the night would show
    // the same moon in the same place and the same stars, which is the one thing a night must not do.
    this.hours = this._pendingHours != null ? this._pendingHours
      : hoursFit(a, b, raw, this.hours) ? this.hours : hoursFromPreset(a, b, raw);
    this._pendingHours = null;
  },

  _celestial(rig) {
    const w = this.weights, [a, b] = this.pair, k = this.k, U = this.u;
    // the sun disc: the day light, the low sunset, sinking after dusk; before dawn it rises on the day side
    const at = (p, other) => (p === 'day' ? DIR.day : p === 'dusk' ? DIR.dusk : (other === 'day' && (a === 'night' && b === 'day') ? DIR.rise : DIR.set));
    tmpV.copy(at(a, b)).multiplyScalar(1 - k).addScaledVector(at(b, a), k);
    if (tmpV.lengthSq() < 1e-6) tmpV.copy(DIR.day);
    U.uEnvSunDir.value.copy(tmpV.normalize());
    // the moon TRAVELS: it rises, crosses low and big, and sets — so no two hours of the night look the same.
    // With no clock (a rig-driven preset only) it falls back to climbing in as night falls.
    if (this.hours != null) moonDirAt(((this.hours + 6) % 24) / 12, U.uEnvMoonDir.value);
    else U.uEnvMoonDir.value.copy(DIR.moonDown).lerp(DIR.moon, smooth(0, 1, w.night + 0.35 * w.dusk)).normalize();
    // and the whole star field turns about the pole with the hours
    const hh = this.hours != null ? this.hours : 22;
    SKY_AXIS_M4.makeRotationAxis(SKY_AXIS, (hh / 24) * Math.PI * 2);
    U.uEnvSkyRot.value.setFromMatrix4(SKY_AXIS_M4);
    void rig;
  },

  _easeWeather(dt) {
    const W = this.weather, T = KINDS[W.kind] || KINDS.clear;
    const step = (key, target, up, down) => {
      const r = target > W[key] ? up : down;
      W[key] = r <= 0 ? target : (target > W[key] ? Math.min(target, W[key] + dt / r) : Math.max(target, W[key] - dt / r));
    };
    step('overcast', T.overcast, RATE.overcast, RATE.overcast);
    step('precip', T.precip, RATE.precip, RATE.precip);
    step('wet', T.wet, RATE.wetUp, RATE.wetDown);
    step('snow', T.snow, RATE.snowUp, RATE.snowDown);
  },

  /** Multiply a numeric property, re-basing whenever someone else (the field's applyTime) changed it. */
  _mod(obj, key, factor) {
    let m = this._mods.get(obj); if (!m) this._mods.set(obj, m = {});
    const cur = obj[key], rec = m[key];
    const base = rec && Math.abs(cur - rec.set) < 1e-6 ? rec.base : cur;
    const v = base * factor;
    obj[key] = v; m[key] = { base, set: v };
  },
  _modColor(fog, target, k) {
    let m = this._mods.get(fog); if (!m) this._mods.set(fog, m = {});
    const rec = m.color;
    const base = rec && fog.color.equals(rec.set) ? rec.base : fog.color.clone();
    fog.color.copy(base).lerp(target, clamp01(k));
    m.color = { base, set: fog.color.clone() };
  },

  /** 0..24 -> blend the rig like the field does (day 8-16.5, dusk to 19.5, night to 5, dawn 5-8). */
  setHours(h, rig) {
    const H = ((+h % 24) + 24) % 24;
    if (!Number.isFinite(H)) return this.hours;
    this.hours = H; this._pendingHours = H;
    let a = 'day', b = 'day', k = 0;
    if (H > 16.5 && H < 19.5) { b = 'dusk'; k = smooth(16.5, 18.5, H); }
    else if (H >= 19.5) { a = 'dusk'; b = 'night'; k = smooth(19.5, 21, H); }
    else if (H < 5) { a = b = 'night'; }
    else if (H < 8) { a = 'night'; b = 'day'; k = smooth(5, 8, H); }
    if (rig && rig.apply) { if (a === b) rig.apply(a); else rig.blend(a, b, k); }
    else { this._lastPreset = undefined; this.preset = a === b ? a : `${a}>${b}@${k.toFixed(2)}`; }
    return H;
  },

  /** 'clear' | 'cloudy' | 'rain' | 'snow'.  {instant: true} jumps straight there (screenshots). */
  setWeather(kind = 'clear', { instant = false } = {}) {
    const K = String(kind || 'clear').toLowerCase();
    if (!KINDS[K]) return { ok: false, reason: `unknown weather "${kind}"`, kinds: Object.keys(KINDS) };
    this.weather.kind = K;
    if (instant) { Object.assign(this.weather, KINDS[K], { kind: K }); this._easeWeather(0); }
    return { ok: true, weather: K, instant };
  },

  describe() {
    const r = (v) => Math.round(v * 1000) / 1000, U = this.u, W = this.weather;
    return {
      preset: this.preset, hours: this.hours, weights: { day: r(this.weights.day), dusk: r(this.weights.dusk), night: r(this.weights.night) },
      twilight: r(this.twilight), dawn: r(this.dawn), skyTurn: r((((this.hours ?? 22) / 24) * 360) % 360),
      sunDir: U.uEnvSunDir.value.toArray().map(r), moonDir: U.uEnvMoonDir.value.toArray().map(r),
      sunVisible: r(U.uEnvSunVis.value), moonVisible: r(U.uEnvMoonVis.value), stars: r(U.uEnvNight.value),
      weather: { kind: W.kind, overcast: r(W.overcast), precip: r(W.precip), wet: r(W.wet), snow: r(W.snow) },
      particles: PARTICLES.size ? Array.from(PARTICLES).map(p => ({ kind: p.kind, count: p.count })) : [],
    };
  },
};
ENV.sky.uHorizon = ENV.u.uEnvHorizon; ENV.sky.uHaze = ENV.u.uEnvHaze;

export const setWeather = (kind, opts) => ENV.setWeather(kind, opts);

/**
 * A precipitation slot: one instanced particle mesh, created and thrown away as the weather changes.
 * Each sky owns one (buildSky calls update(scene) from the dome's onBeforeRender), so two live scenes never fight.
 */
export function createPrecipitation() {
  let cur = null;
  const slot = {
    get kind() { return cur ? cur.kind : null; },
    update(scene) {
      try {
        const W = ENV.weather;
        const want = W.precip > 0.002 ? (W.kind === 'rain' || W.kind === 'snow' ? W.kind : (cur ? cur.kind : null)) : null;
        if (cur && (cur.kind !== want || cur.scene !== scene)) { PARTICLES.delete(cur); cur.dispose(); cur = null; }
        if (want && !cur && scene) { cur = makePrecip(want, scene); PARTICLES.add(cur); }
        if (cur) cur.amount(W.precip);
      } catch (e) { reportError('weather update', e); }
    },
    dispose() { if (cur) { PARTICLES.delete(cur); cur.dispose(); cur = null; } },
  };
  return slot;
}
const PARTICLES = new Set();

let debugInstalled = false;
/** __DQ.weather(kind?, {instant}) and __DQ.state().sky. Safe to call many times. */
export function installEnvDebug() {
  if (debugInstalled) return;
  debugInstalled = true;
  try {
    Debug.expose('weather', (kind, opts) => (kind === undefined ? ENV.weather.kind : ENV.setWeather(kind, opts)));
    Debug.provide('sky', () => ENV.describe());
    // anyone who announces the clock (the F1 default timeOfDay, a future field / story clock) sets the sky's hour
    Bus.on('time.set', (e) => { if (e && Number.isFinite(+e.hours)) { ENV.hours = ((+e.hours % 24) + 24) % 24; ENV._pendingHours = ENV.hours; } });
  } catch (e) { reportError('ENV debug', e); }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// precipitation: one instanced mesh around the camera, animated entirely on the GPU (one draw call)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const PRECIP = {
  rain: { count: 1500, low: 700, box: [30, 20, 30], speed: 16, len: 0.95, width: 0.027, alpha: 0.6 },
  snow: { count: 1250, low: 600, box: [34, 20, 34], speed: 1.25, len: 0.12, width: 0.125, alpha: 0.95 },
};

const PRECIP_VERT = /* glsl */`
  attribute vec4 aSeed;
  uniform vec3 uBox, uOffset, uCam, uVel;
  uniform float uLen, uWidth, uTime, uSnow;
  varying vec2 vUv; varying float vFade;
  void main(){
    vec3 origin = uCam - uBox * vec3(0.5, 0.4, 0.5);
    vec3 p = mod(aSeed.xyz * uBox + uOffset * (0.85 + 0.3 * aSeed.w) - origin, uBox) + origin;
    if (uSnow > 0.5) {                          // flakes wander as they fall
      p.x += sin(uTime * (0.6 + aSeed.w) + aSeed.x * 40.0) * 0.45;
      p.z += cos(uTime * (0.5 + aSeed.w * 0.8) + aSeed.z * 40.0) * 0.45;
    }
    vec4 mv = viewMatrix * vec4(p, 1.0);
    if (uSnow > 0.5) {
      mv.xy += position.xy * uWidth * (0.55 + 0.9 * aSeed.w);
    } else {                                    // a streak along the fall direction as the lens sees it
      vec3 vv = (viewMatrix * vec4(uVel, 0.0)).xyz;
      vec2 ax = normalize(vv.xy + vec2(0.0, -1e-4));
      vec2 sd = vec2(-ax.y, ax.x);
      mv.xy += sd * position.x * uWidth + ax * position.y * uLen;
    }
    float d = -mv.z;
    // no drops right on the lens, none past the box edge
    vFade = smoothstep(1.2, 3.2, d) * (1.0 - smoothstep(uBox.x * 0.3, uBox.x * 0.5, length(p.xz - uCam.xz)));
    vUv = position.xy + vec2(0.5);
    gl_Position = projectionMatrix * mv;
  }`;
const PRECIP_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uAlpha, uAmount, uSnow;
  varying vec2 vUv; varying float vFade;
  void main(){
    float a;
    if (uSnow > 0.5) { float r = length(vUv - 0.5) * 2.0; a = 1.0 - smoothstep(0.35, 1.0, r); }
    else { a = (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y)); }
    a *= uAlpha * uAmount * vFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }`;

function makePrecip(kind, scene) {
  const P = PRECIP[kind];
  const n = App.quality === 'low' ? P.low : P.count;
  const base = new THREE.PlaneGeometry(1, 1, 1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position);
  const seeds = new Float32Array(n * 4);
  let s = 90210 + (kind === 'snow' ? 7 : 0);
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n * 4; i++) seeds[i] = rnd();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = n;
  const snow = kind === 'snow';
  const U = {
    uBox: { value: new THREE.Vector3(...P.box) }, uOffset: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() },
    uVel: { value: new THREE.Vector3(0.9, -P.speed, -0.35) }, uLen: { value: P.len }, uWidth: { value: P.width },
    uTime: { value: 0 }, uSnow: { value: snow ? 1 : 0 }, uAlpha: { value: P.alpha }, uAmount: { value: 0 },
    uColor: { value: C3(snow ? PAL.snow.light : mixHex(PAL.water.foam, PAL.cloud.shade, 0.35)) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: PRECIP_VERT, fragmentShader: PRECIP_FRAG,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'weather-' + kind; mesh.frustumCulled = false; mesh.renderOrder = 30;
  const baseCol = C3(snow ? PAL.snow.light : mixHex(PAL.water.foam, PAL.cloud.shade, 0.35));
  mesh.onBeforeRender = (renderer, sc, camera) => {
    const t = ENV.u.uEnvTime.value;
    U.uTime.value = t;
    U.uCam.value.copy(camera.position);
    const v = U.uVel.value;
    // the fall offset wrapped per axis on the CPU (double precision), so drops never judder after an hour
    U.uOffset.value.set(((v.x * t) % P.box[0] + P.box[0]) % P.box[0], ((v.y * t) % P.box[1] + P.box[1]) % P.box[1], ((v.z * t) % P.box[2] + P.box[2]) % P.box[2]);
    // drops and flakes pick up the light of the hour
    U.uColor.value.copy(baseCol).multiply(ENV.u.uEnvLight.value);
  };
  scene.add(mesh);
  return {
    kind, scene, mesh, count: n,
    amount(k) { U.uAmount.value = k; },
    dispose() { try { mesh.removeFromParent(); g.dispose(); mat.dispose(); } catch (e) { reportError('weather dispose', e); } },
  };
}

export default ENV;
