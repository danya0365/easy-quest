/**
 * camera.js — the field follow camera: spring follow, free orbit, zoom, ease-behind, talk framing, terrain floor.
 *                                                                                  (P09, owner: src/world/camera.js)
 *
 *   import { createFieldCamera, installCameraDebug, CAM_DEFAULT } from './camera.js';
 *   const rig = createFieldCamera({ focus, map, talking });
 *     focus()   -> the player's SIM state {x, y, z, vx, vz, speed} (read every tick; never written)
 *     map()     -> the live GameMap (heightAt for the terrain floor) or null
 *     talking() -> true while a dialogue is on top (the view settles a little lower)
 *   rig.camera                       the THREE.PerspectiveCamera (made on first use; aspect kept by rig.resize())
 *   rig.configure(def.camera, keep)  a map's defaults {orbit, pitch, dist, fov, lookUp} (degrees); keep = keep the yaw
 *   rig.snap()                       jump straight to the goal (map load, teleport)
 *   rig.update(dt)                   fixed 60 Hz: Input.look() orbit, ease-behind, zoom spring, target spring
 *   rig.place(alpha) -> {tx, ty, tz} once per frame: interpolate and position the THREE camera; returns the look target
 *   rig.yaw                          current yaw in radians (the player walks camera-relative)
 *   rig.orbit(deg?, snap?) rig.zoom(n?, snap?) rig.settled() rig.tune({pitch, dist, fov, lookUp}) rig.auto
 *   rig.describe(extra) -> the state().field.camera summary
 *
 * The field (src/world/field.js) owns one rig per field instance and calls only the functions above, in this order:
 * configure -> snap on load; update(dt) after the player's update each tick; place(alpha) each frame before drawing.
 * installCameraDebug(() => rig | null) wires __DQ.cameraOrbit / cameraZoom and the extras cameraAuto / cameraRig.
 *
 * Behaviour (tuned in the vertical slice; P09 improves it here without touching field.js):
 *  - The lens NEVER zooms in to dodge a tree or a roof: distance and pitch stay put and whatever stands in the way
 *    dissolves instead (Toon.see / the map view). Only a zoom request changes distance.
 *  - Manual orbit (right stick, L1/R1, Q/E) at 115°/s; the camera eases behind the player only while walking away from
 *    it, and never within 2.5 s of a manual orbit.
 *  - Critically damped spring (w = 6) on the look target, which leads the player by 0.22 s of velocity.
 */
import * as THREE from 'three';
import { App } from '../engine/app.js';
import { Loop } from '../engine/loop.js';
import { Debug } from '../engine/debug.js';
import { Input } from '../engine/input.js';
import { smooth } from '../art/palette.js';

const DEG = Math.PI / 180;
/** Ease-behind scales with speed up to this (the player's run speed, units / second). */
const RUN_SPEED = 5.7;
export const CAM_DEFAULT = Object.freeze({ orbit: 0, pitch: 30, dist: 10.5, fov: 46, lookUp: 1.05 });

const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const r3 = (v) => Math.round(v * 1000) / 1000;
const deg360 = (rad) => r3(((rad / DEG) % 360 + 360) % 360);

export function createFieldCamera({ focus = () => null, map = () => null, talking = () => false } = {}) {
  // sim state (c) and the previous tick (pc) for render interpolation
  const c = { yaw: 0, yawT: 0, pitch: CAM_DEFAULT.pitch, dist: CAM_DEFAULT.dist, distT: CAM_DEFAULT.dist, fov: CAM_DEFAULT.fov, lookUp: CAM_DEFAULT.lookUp,
    tx: 0, ty: 0, tz: 0, vx: 0, vy: 0, vz: 0, manualT: 99, auto: true, occ: CAM_DEFAULT.dist, occluded: false, talk: 0 };
  const pc = { yaw: 0, tx: 0, ty: 0, tz: 0, dist: CAM_DEFAULT.dist, talk: 0 };
  let camera = null;

  const goal = () => {
    const p = focus() || { x: 0, y: 0, z: 0, vx: 0, vz: 0 };
    return { x: p.x + p.vx * 0.22, y: p.y, z: p.z + p.vz * 0.22 };
  };
  const remember = () => Object.assign(pc, { yaw: c.yaw, tx: c.tx, ty: c.ty, tz: c.tz, dist: c.dist, talk: c.talk });

  const rig = {
    /** sim state — read-only for everyone but this module (exposed for describe/debug) */
    c, prev: pc,
    get camera() {
      if (!camera) camera = new THREE.PerspectiveCamera(CAM_DEFAULT.fov, App.aspect(), 0.3, 1400);
      return camera;
    },
    get yaw() { return c.yaw; },
    get auto() { return c.auto; },
    set auto(on) { c.auto = !!on; },

    resize() { if (camera) { camera.aspect = App.aspect(); camera.updateProjectionMatrix(); } },

    /** Apply a map's camera defaults. Unless keepYaw, the orbit comes from the map too. Returns the merged defaults. */
    configure(def, keepYaw = false) {
      const cd = Object.assign({}, CAM_DEFAULT, def || {});
      c.pitch = cd.pitch; c.dist = c.distT = cd.dist; c.fov = cd.fov; c.lookUp = cd.lookUp;
      c.yaw = c.yawT = (keepYaw ? c.yaw : (cd.orbit ?? 0) * DEG);
      return cd;
    },

    snap() {
      const g = goal();
      c.tx = g.x; c.ty = g.y; c.tz = g.z; c.vx = c.vy = c.vz = 0; c.yaw = c.yawT;
      c.occ = c.distT; c.dist = c.distT;
      remember();
    },

    update(dt) {
      remember();
      // manual orbit: right stick / bumpers / Q E
      const look = Input.look();
      if (Math.abs(look.x) > 0.01) { c.yawT += -look.x * 115 * DEG * dt; c.manualT = 0; }
      else c.manualT += dt;
      // ease behind the player — only while walking away from the camera, and never soon after a manual orbit
      const p = focus();
      if (p && c.auto && c.manualT > 2.5 && p.speed > 1.0) {
        const hx = p.vx / p.speed, hz = p.vz / p.speed, fx = -Math.sin(c.yawT), fz = -Math.cos(c.yawT);
        const along = hx * fx + hz * fz;
        if (along > 0.55) {
          const behind = Math.atan2(-hx, -hz);
          c.yawT += wrapPi(behind - c.yawT) * Math.min(1, dt * 0.9) * smooth(0.55, 0.95, along) * Math.min(1, p.speed / RUN_SPEED);
        }
      }
      c.yawT = wrapPi(c.yawT);
      c.yaw = wrapPi(c.yaw + wrapPi(c.yawT - c.yaw) * (1 - Math.exp(-dt * 7.5)));
      // distance only follows a zoom request (never pulled in by occluders — they dissolve instead)
      c.occ = c.distT;
      c.dist += (c.distT - c.dist) * (1 - Math.exp(-dt * 6));
      // while somebody is talking the view settles a little lower, so the hero stands just above the message window
      const t = !!talking();
      c.talk += ((t ? 1 : 0) - c.talk) * (1 - Math.exp(-dt * (t ? 5 : 3.5)));
      // critically damped spring on the look target
      const g = goal(), w = 6.0, kk = w * w, dd = 2 * w;
      for (const [pk, vk, gk] of [['tx', 'vx', 'x'], ['ty', 'vy', 'y'], ['tz', 'vz', 'z']]) {
        const a = (g[gk] - c[pk]) * kk - c[vk] * dd;
        c[vk] += a * dt; c[pk] += c[vk] * dt;
      }
    },

    place(alpha) {
      const cam = rig.camera;
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
      const m = map();
      if (m) { const floor = m.heightAt(px, pz) + 0.9; if (py < floor) py = floor; }
      if (cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
      cam.position.set(px, py, pz);
      cam.lookAt(tx, ty + lookUp, tz);
      return { tx, ty, tz };
    },

    /** Get (no args) or set the orbit target in degrees; snap jumps there at once. */
    orbit(deg, snap) {
      if (deg === undefined) return deg360(c.yawT);
      c.yawT = wrapPi(Number(deg) * DEG); c.manualT = 0;
      if (snap) { c.yaw = c.yawT; pc.yaw = c.yaw; }
      return deg360(c.yawT);
    },
    zoom(n, snap) {
      if (n === undefined) return r3(c.distT);
      c.distT = Math.max(3, Math.min(40, Number(n) || CAM_DEFAULT.dist));
      if (snap) { c.dist = c.distT; pc.dist = c.dist; }
      return c.distT;
    },
    settled() { return Math.abs(wrapPi(c.yawT - c.yaw)) < 0.6 * DEG && Math.abs(c.distT - c.dist) < 0.05; },
    /** Tune live: {pitch, dist, fov, lookUp} (degrees / world units). */
    tune(o = {}) {
      for (const k of ['pitch', 'fov', 'lookUp']) if (Number.isFinite(+o[k])) c[k] = +o[k];
      if (Number.isFinite(+o.dist)) { c.distT = c.dist = +o.dist; pc.dist = c.dist; }
      return { pitch: c.pitch, dist: c.distT, fov: c.fov, lookUp: c.lookUp };
    },
    /** state().field.camera; `extra` = {occluded, seeThrough} from the field's see-through bookkeeping. */
    describe(extra = {}) {
      return { orbit: rig.orbit(), current: deg360(c.yaw), pitch: c.pitch, dist: r3(c.dist), distTarget: r3(c.distT), fov: c.fov,
        auto: c.auto, settled: rig.settled(), occluded: !!extra.occluded, seeThrough: extra.seeThrough ?? null,
        talkFraming: r3(c.talk), pos: camera ? camera.position.toArray().map(r3) : null };
    },
  };
  return rig;
}

/** __DQ camera controls. getRig() -> the live rig, or null when the field is not on the stack. */
export function installCameraDebug(getRig) {
  const off = { ok: false, reason: 'the field is not on the scene stack' };
  Debug.implement('cameraOrbit', (deg) => {
    const rig = getRig(); if (!rig) return off;
    if (deg === undefined) return rig.orbit();
    const orbit = rig.orbit(deg, Loop.frozen);
    return { ok: true, orbit, snapped: Loop.frozen };
  });
  Debug.implement('cameraZoom', (n) => {
    const rig = getRig(); if (!rig) return off;
    if (n === undefined) return rig.zoom();
    return { ok: true, dist: rig.zoom(n, Loop.frozen) };
  });
  Debug.expose('cameraAuto', (on) => { const rig = getRig(); if (!rig) return null; if (on !== undefined) rig.auto = !!on; return rig.auto; });
  /** Tune the follow camera live: __DQ.cameraRig({pitch, dist, fov, lookUp}) (degrees / world units). */
  Debug.expose('cameraRig', (o = {}) => { const rig = getRig(); return rig ? rig.tune(o) : null; });
}

export default createFieldCamera;
