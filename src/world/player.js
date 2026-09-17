/**
 * player.js — the hero on the field: camera-relative analog movement, turn-in-place, run, wall sliding, facing,
 * what he can talk to, exits, footsteps, and the adapter that drives his model.   (P10, owner: src/world/player.js)
 *
 *   import { createPlayer, installPlayerDebug, heroModel } from './player.js';
 *   const pl = createPlayer({ map, cameraYaw, onExit });
 *     map()        -> the live GameMap (move / resolve / walkY / groundAt / nearestInteractable / exitAt) or null
 *     cameraYaw()  -> the camera's yaw in radians (Up walks away from the lens)
 *     onExit(ex)   -> called when he steps on an exit rectangle (the field decides: load a map or speak)
 *   pl.p / pl.prev          SIM state {x, y, z, yaw, yawT, vx, vz, speed, run, blocked, ground, ...} and last tick's
 *   pl.place(x, z, yaw?, stop?)   put him somewhere (collision-resolved; stop zeroes velocity)
 *   pl.update(dt)           fixed 60 Hz while the field is the top scene
 *   pl.hold(dt)             fixed 60 Hz while something is over the field (dialogue): stand, finish turning
 *   pl.halt()               stop dead (a menu opened, he started talking)
 *   pl.faceToward(x, z)     turn (eased) to face a point
 *   pl.face(deg)            snap facing (debug)
 *   pl.attach(scene) / pl.detach()   add / remove his model (built on first attach)
 *   pl.render(alpha, dt, t, active) -> {x, y, z}   once per frame: interpolate, pose and animate the model
 *   pl.near                 {target, dist, dot} | null — the interactable he faces
 *   pl.hero                 the model adapter {group, animate(dt, t, motion), snap(yaw), nod(), state(), kind}
 *   pl.describe()           state().player
 *
 * THE MODEL ADAPTER. heroModel() builds the real Bram from src/art/chars.js (P07) animated by src/art/anim.js (P08):
 * Chars.build('hero', {age: 'boy'}) driven through setMove / setFacing / play / update. If chars.js is missing, mid-edit
 * or throws, it falls back to src/world/placeholder-hero.js so the field always has a hero. Both expose one shape:
 *   {kind: 'chars'|'placeholder', group, animate(dt, t, {speed, run, yaw, onStep}), snap(yaw), nod(), state()}
 * Chars is loaded with a dynamic import (preloadHero()); main.js awaits it before the field is pushed, so a broken
 * chars.js can never stop the game from booting.
 */
import { Debug, reportError } from '../engine/debug.js';
import { Input } from '../engine/input.js';
import { Sfx } from '../audio/sfx.js';
import { PLAYER_RADIUS } from './map.js';
import { buildPlaceholderHero } from './placeholder-hero.js';

const DEG = Math.PI / 180;
export const WALK = 3.3, RUN = 5.7, PIVOT = 0.1;
const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const r3 = (v) => Math.round(v * 1000) / 1000;
const deg360 = (rad) => r3(((rad / DEG) % 360 + 360) % 360);

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the model adapter
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
let CharsLib = null;
let charsPromise = null;
/** Start loading src/art/chars.js (idempotent). Resolves true when the real hero can be built. Never rejects. */
export function preloadHero() {
  if (!charsPromise) {
    charsPromise = import('../art/chars.js')
      .then((m) => { CharsLib = m && (m.Chars || m.default) || null; return !!CharsLib; })
      .catch((e) => { reportError('player: src/art/chars.js failed to load (placeholder hero in use)', e); return false; });
  }
  return charsPromise;
}

function placeholderAdapter() {
  const h = buildPlaceholderHero();
  return {
    kind: 'placeholder', group: h.group, height: h.height,
    animate(dt, t, motion) { h.group.rotation.y = motion.yaw; h.animate(dt, t, motion); },
    snap() {},
    nod() { h.nod(); },
    state() { return Object.assign({ model: 'placeholder' }, h.state()); },
  };
}

function charsAdapter(ch) {
  let stepFn = null;
  ch.onStep = (side, kind) => { if (stepFn) stepFn(side, kind); };
  return {
    kind: 'chars', group: ch.root, height: ch.height, character: ch,
    animate(dt, t, motion) {
      stepFn = motion.onStep || null;
      ch.setFacing(motion.yaw);
      ch.setMove(motion.speed, { run: !!motion.run });
      ch.update(dt);
    },
    snap(yaw) { ch.setFacing(yaw, true); },
    nod() { ch.play('nod'); },
    state() { const s = ch.state(); return { model: 'chars', clip: s.clip, action: s.action ? s.action.name : null, speed: s.speed, run: s.run, turning: s.turning, blinking: s.blinking }; },
  };
}

/** Build the hero model: the real Bram when src/art/chars.js is loaded and healthy, else the placeholder. */
export function heroModel() {
  if (CharsLib) {
    try {
      const ch = CharsLib.build('hero', { age: 'boy' });
      const st = ch && typeof ch.state === 'function' ? ch.state() : null;
      if (ch && ch.root && st && !st.error) return charsAdapter(ch);
      reportError('player hero', new Error('Chars.build("hero") returned a stand-in; using the placeholder hero'));
    } catch (e) { reportError('player hero (Chars.build)', e); }
  }
  return placeholderAdapter();
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// the player
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function createPlayer({ map = () => null, cameraYaw = () => 0, onExit = () => {} } = {}) {
  const p = { x: 0, z: 0, y: 0, yaw: 0, yawT: 0, holdT: 0, pivot: 0, vx: 0, vz: 0, speed: 0, run: false, blocked: false, ground: 'grass' };
  const pp = { x: 0, z: 0, y: 0, yaw: 0 };
  let hero = null, near = null, bumpCd = 0, stepCount = 0;

  const remember = () => Object.assign(pp, { x: p.x, z: p.z, y: p.y, yaw: p.yaw });

  const pl = {
    p, prev: pp,
    get hero() { return hero; },
    get near() { return near; },
    get steps() { return stepCount; },

    attach(scene) {
      if (!hero) hero = heroModel();
      scene.add(hero.group);
      return hero;
    },
    detach() { if (hero) hero.group.removeFromParent(); },

    place(x, z, yaw = p.yaw, stop = true) {
      const m = map();
      let px = +x, pz = +z;
      if (m) { const r = m.resolve(px, pz, PLAYER_RADIUS); px = r.x; pz = r.z; }
      Object.assign(p, { x: px, z: pz, y: m ? m.walkY(px, pz) : 0, yaw: wrapPi(yaw), yawT: wrapPi(yaw), pivot: 0, ground: m ? m.groundAt(px, pz) : p.ground });
      near = m ? m.nearestInteractable(px, pz, Math.sin(p.yaw), Math.cos(p.yaw)) : null;
      if (stop) { p.vx = 0; p.vz = 0; p.speed = 0; }
      remember();
      if (hero) { try { hero.snap(p.yaw); } catch (e) { reportError('player hero snap', e); } }
    },

    update(dt) {
      const m = map(); if (!m) return;
      remember();
      const ax = Input.axis();
      const run = Input.down('run');
      // camera-relative wish direction: forward is away from the camera
      const yaw = cameraYaw(), fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const wx = rx * ax.x + fx * ax.y, wz = rz * ax.x + fz * ax.y;
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
        bumpCd -= dt;
        const into = mag > 0.5 ? -(wx * res.nx + wz * res.nz) / mag : 0;
        if (into > 0.8 && res.moved < 0.2 * top * dt && bumpCd <= 0) { bumpCd = 0.9; try { Sfx.play('bump_wall', { vol: 0.55 }); } catch (e) { reportError('player bump sfx', e); } }
      } else bumpCd = Math.max(0, bumpCd - dt);
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
      near = m.nearestInteractable(p.x, p.z, Math.sin(p.yawT), Math.cos(p.yawT));
      // exits
      const ex = m.exitAt(p.x, p.z);
      if (ex) onExit(ex);
    },

    hold(dt) {
      remember(); p.vx = p.vz = 0; p.speed = 0; p.pivot = 0; p.holdT = 0;
      const d = wrapPi(p.yawT - p.yaw);          // finish turning to face whoever is talking
      if (Math.abs(d) > 1e-4) p.yaw = wrapPi(p.yaw + Math.sign(d) * Math.min(Math.abs(d), Math.max(Math.abs(d) * Math.min(1, dt * 12), dt * 2.2)));
    },

    halt() { p.vx = p.vz = 0; p.speed = 0; },

    faceToward(tx, tz) { p.yawT = Math.atan2(tx - p.x, tz - p.z); },

    face(deg) {
      p.yaw = p.yawT = wrapPi(Number(deg) * DEG); pp.yaw = p.yaw;
      if (hero) { try { hero.snap(p.yaw); } catch (e) { reportError('player hero snap', e); } }
      return deg360(p.yaw);
    },

    render(alpha, dt, t, active) {
      const x = pp.x + (p.x - pp.x) * alpha, z = pp.z + (p.z - pp.z) * alpha, y = pp.y + (p.y - pp.y) * alpha;
      if (hero) {
        hero.group.position.set(x, y, z);
        const yaw = pp.yaw + wrapPi(p.yaw - pp.yaw) * alpha;
        try {
          hero.animate(dt, t, { speed: active ? p.speed : 0, run: active && p.run, yaw, onStep: (foot, kind) => {
            stepCount++;
            const m = map(), mat = m ? m.groundAt(x, z) : 'grass';
            const vol = (kind === 'shuffle' ? 0.6 : 1) * (p.run ? 0.55 : 0.4);
            try { Sfx.play('footstep', { material: mat === 'water' ? 'dirt' : mat, vol }); } catch (e) { reportError('player footstep sfx', e); }
          } });
        } catch (e) { reportError('player hero animate', e); }
      }
      return { x, y, z };
    },

    describe() {
      const m = map();
      return { x: r3(p.x), y: r3(p.y), z: r3(p.z), facing: deg360(p.yaw), facingTarget: deg360(p.yawT), speed: r3(p.speed), running: !!p.run,
        moving: p.speed > 0.1, blocked: !!p.blocked, ground: p.ground, tile: m ? m.tileAt(p.x, p.z) : null,
        near: near ? { name: near.target.name || near.target.type, dist: r3(near.dist) } : null, steps: stepCount,
        anim: hero ? hero.state() : null };
    },
  };
  return pl;
}

/** __DQ player extras. getPlayer() -> the live player, or null when the field is not on the stack. */
export function installPlayerDebug(getPlayer) {
  Debug.expose('face', (deg) => { const pl = getPlayer(); if (!pl) return null; if (deg !== undefined) pl.face(deg); return pl.describe().facing; });
  Debug.expose('walkTo', (x, z) => { const pl = getPlayer(); if (!pl) return null; pl.place(+x, +z, pl.p.yaw, true); return pl.describe(); });
}

export default createPlayer;
