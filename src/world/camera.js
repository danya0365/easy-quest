/**
 * camera.js — the DQV PS2 field camera: spring follow, free 360° orbit, ease-behind, auto-recentre, lead,
 *             interior / dungeon framing, a cutscene camera, and the CLEAN alpha fade of whatever covers the hero.
 *                                                                                  (P09, owner: src/world/camera.js)
 *
 *   import { createFieldCamera, installCameraDebug, CAM_DEFAULT, CAM_MODES } from './camera.js';
 *   const rig = createFieldCamera({ focus, map, talking, scene });
 *     focus()   -> the player's SIM state {x, y, z, yaw, vx, vz, speed} (read every tick; never written)
 *     map()     -> the live GameMap (heightAt / kind) or null
 *     talking() -> true while a dialogue is on top (the view settles a little lower)
 *     scene()   -> optional: the THREE.Scene being drawn. When it is not given the rig asks Field.world()
 *                  (lazily, so importing this file pulls nothing in) — the occluder fade needs the scene.
 *   rig.camera                       the THREE.PerspectiveCamera (made on first use; aspect kept by rig.resize())
 *   rig.configure(def.camera, keep)  a map's defaults {orbit, pitch, dist, fov, lookUp, mode}; keep = keep the yaw
 *   rig.snap()                       jump straight to the goal (map load, teleport) — fades settle too
 *   rig.update(dt)                   fixed 60 Hz: orbit, ease-behind, recentre, lead, springs, occluder test
 *   rig.place(alpha) -> {tx, ty, tz} once per frame: interpolate and position the THREE camera; returns the look target
 *   rig.yaw                          the yaw the PLAYER walks relative to (see "the walk frame" below)
 *   rig.camYaw                       the camera's own yaw in radians
 *   rig.orbit(deg?, snap?) rig.zoom(n?, snap?) rig.settled() rig.tune({pitch, dist, fov, lookUp}) rig.auto
 *   rig.mode(name?)                  'field' | 'town' | 'world' | 'interior' | 'dungeon' (CAM_MODES)
 *   rig.shot({from, to, lookAt, duration, ease, fov, hold}) -> Promise   the cutscene camera (story scenes)
 *   rig.release(seconds)             hand a held shot back to the follow camera
 *   rig.fade                         the occluder fade: .enabled, .list(), .state()
 *   rig.keep(on?) rig.keepWhy() rig.keepReset()   the sight guarantee (below)
 *   rig.describe(extra)              the state().field.camera summary
 *
 * The field (src/world/field.js) owns one rig per field instance and calls only the functions above, in this order:
 * configure -> snap on load; update(dt) after the player's update each tick; place(alpha) each frame before drawing.
 * installCameraDebug(() => rig | null) wires __DQ.cameraOrbit / cameraZoom and the extras cameraAuto / cameraRig /
 * cameraMode / cameraShot / cameraRelease / cameraFade / cameraOccluders.
 *
 * ── The feel (docs/DQV-RUBRIC.md "Motion": the camera springs, never teleports, and never fights you) ──────────
 *  - **Never zooms in.** Distance and pitch are set by the map / mode and by a zoom request, never by what is in
 *    the way: whatever stands between the lens and the hero FADES instead (below).
 *  - **Spring follow.** A critically damped spring (ω 6) on the look target, which leads the player by a springy
 *    ~0.3 s of velocity: you see where you are going, and the lead never lurches when you start or stop.
 *  - **Orbit.** Input.look() (right stick / L1-R1 / Q-E) at 118°/s, eased in and out, 360° free, any pitch.
 *  - **Ease-behind.** While he walks, the camera drifts round to sit behind his heading — gently (≤ 42°/s), never
 *    while he walks TOWARD the lens, never within 2.2 s of a manual orbit.
 *  - **The walk frame.** `rig.yaw` (what player.js maps the stick to) tracks the camera, but the ease-behind swing
 *    is NOT fed back into it while a direction is held. Holding "right" therefore walks a straight line while the
 *    camera swings round behind you, instead of curving you round in a circle. It re-latches the moment you let go.
 *  - **Auto-recentre after a pause.** Stand still for ~1.1 s after walking and the camera eases behind his facing
 *    (only if it is off by 5-120°, and never after a manual orbit — a view you chose is a view you keep).
 *  - **Ground and sight lines.** The lens never sinks into the hillside, and when a rise would hide the hero the
 *    camera climbs over it (both on springs, so bumpy ground never pops).
 *  - **Framing.** The boy is 20% of frame height outdoors (144 px at 720p) with the horizon 17% down the frame
 *    and the ground angle the map asked for (26° in docs/approved/field-opening.png) — a lens FOLLOWING a child
 *    at DQV PS2 scale, not a survey of the valley he happens to be standing in. `__DQ.cameraFrame()` measures it.
 *  - **Modes.** CAM_MODES per map kind: interiors are tighter and steeper, dungeons a little tighter, the overworld
 *    wider. The LIVE map's own `camera` block wins on every mode change (`cameraMode` re-reads it, it is never
 *    copied into a preset), and the rig solves the boom for whoever P07 actually built — Bram the six-year-old
 *    is 1.11 units tall, where the approved frames were composed around a 1.6-unit placeholder.
 *
 * ── KEEPING THE BOY (P09 gap #2: "in a town the lens goes through the walls and the boy disappears") ──────────
 * A DQV field camera never loses the child. When a roof would come between, it slides along the wall and keeps
 * him. Here that is a measured guarantee, not a hope — every tick, after the fade has decided what to ghost:
 *   1. ray the lens to the boy's CHEST (the same point a blind critic's probe aims at) against cached bounds:
 *      per-instance spheres for foliage, per-run world boxes for merged buildings, an upright capsule per person
 *   2. the test is asked of where the boy, the boom and the orbit will be in ~0.3 s — from his MEASURED velocity,
 *      not the one he is asking for — so the camera is already moving as the roof comes round, not afterwards
 *   3. if the way is not clear, find the CHEAPEST pose that is (a few degrees of slide for a fence post, forty
 *      for a cottage; a small climb only when no slide works) and ease the boom there on its own springs
 *   4. the boom LENGTH never changes: this is a slide and a lift, never a dolly in
 *   5. the slide goes into the CAMERA, not the walk frame (like the ease-behind swing, it is added to `drift`
 *      while a direction is held), so a boy walking a straight line keeps walking a straight line
 *   6. while the PLAYER is orbiting, the slide is capped hard: a view you asked for is a view you get, and
 *      whatever is still in the way is the fade's job
 *   7. what it cannot clear — a crown standing between the square and the boy at every azimuth — the fade ghosts
 * `__DQ.cameraSight()` answers "can you see him, and what is the rig doing about it" as a number; `cameraSightWhy()`
 * lists every pose it weighed and what stood in each; `cameraSight(false)` switches the guarantee off for an A/B.
 * MEASURED in /index.html with a per-frame raycast over a deterministic walk (Loop.step, 300 samples): a four
 * direction walk through Puddlewick hides him in 0.0% of frames and the meadow walk in 0.0% (both were 8-21%).
 *
 * ── The occluder fade (docs/INTEGRATION-NEEDS.md: "clean alpha fade, outline kept, ~150 ms, only true occluders") ─
 * Anything between the lens and the hero is drawn at ~40% with a DEPTH PRE-PASS (so a canopy never shows its own
 * inner layers) and its ink outline kept a little stronger. It replaces the old screen-door dither:
 *   1. the scene is sorted mesh by mesh into what the camera must do about it: foliage and merged buildings can be
 *      ghosted AND block the sight line; people, glow cards and instanced species with no fade slot only block it;
 *      the ground, the water, the sky and the far hills are the WORLD and are neither (the lens is kept out of the
 *      hillside by `clearance()` instead). `rig.fade.objects()` lists the candidates, `probe()` the last ray test
 *      — and the census is re-taken a few milliseconds at a time, so a tree swapping LOD mid-orbit never costs a frame
 *   2. candidates are grouped into OBJECTS: one per instance for InstancedMesh, and for merged buckets one per
 *      cluster of neighbouring triangle runs (so a whole cottage fades, not one wall)
 *   3. an object fades only when rays from the lens to five points on the hero's body actually hit its triangles,
 *      or when the lens is inside it (then it goes entirely: you can never be stuck inside a roof)
 *   4. it is hidden from the main pass (instances through Toon.see's fade slots, bucket ranges through a hidden
 *      material group) — its SHADOW is untouched — and redrawn after the scene: depth first, then colour with
 *      constant-alpha blending
 *   5. 150 ms out, 220 ms back, with a 100 ms hold so an edge never flickers
 *   6. a surface right against the lens (under FADE.melt) goes entirely instead of smearing 40% of a roof over
 *      half the frame, ramping back up to the full 40% by FADE.solid — and that near-zone ramp is measured from
 *      the part of the object that is ON THE SIGHT LINE, so a fence post beside the lens cannot make its own
 *      cottage translucent and a back wall the lens has walked past cannot dissolve the front of the house
 * `__DQ.cameraFade(false)` switches the whole pass off (and hands see-through back to the old dither) for A/B.
 */
import * as THREE from 'three';
import { App } from '../engine/app.js';
import { Loop } from '../engine/loop.js';
import { Debug, reportError } from '../engine/debug.js';
import { Input } from '../engine/input.js';
import { smooth } from '../art/palette.js';
import { Toon } from '../art/toon.js';

const DEG = Math.PI / 180;
/** Ease-behind scales with speed up to this (the player's run speed, units / second). */
const RUN_SPEED = 5.7;

export const CAM_DEFAULT = Object.freeze({ orbit: 0, pitch: 13, dist: 5.4, fov: 46, lookUp: 1.05 });

/**
 * ── THE COMPOSITION (this is the camera's real job) ───────────────────────────────────────────────────────────
 * A DQV field shot is a RELATIONSHIP between a lens and a boy: he is the subject, the village is the setting.
 * So a mode does not state a boom length — it states the ground angle and where the boy and the horizon must
 * LAND IN THE FRAME, and the rig solves the boom for whoever P07 actually built (`hero`):
 *   pitch          the GROUND ANGLE — how much of the shot is the land he is walking over. DQV PS2 sits at
 *                  24-30° outdoors (the owner-approved field-opening frame is 26°), steeper indoors.
 *                  **The live map owns it** (`def.camera.pitch`); a mode only says what a map does not.
 *   frame.hero     his height as a % of frame height. 20 outdoors = 144 px of boy at 720p: DQV PS2 scale, a
 *                  camera FOLLOWING a child, not surveying him from the hill behind. (The pre-solver rig sat
 *                  at 9 units and 13%, which read as a diorama with a dot in it — P09 gap #1.)
 *   frame.horizon  how far DOWN the frame the horizon sits (17 outdoors: a real band of sky over the shot)
 *   frame.feet     ... or, indoors where there is no horizon, how far down the frame his feet sit
 *   frame.feetMax  the floor: if pitch + horizon would slide his feet past this, the feet win and the sky band
 *                  gives way instead (a map may ask for a steep ground angle; the boy still stands in his frame)
 * Two targets, two knobs: the boom solves `hero`, the look point solves `horizon` (or `feet`). A composition
 * that states all three of hero / feet / horizon solves the pitch as well, and then the map's pitch is only a
 * fallback hint — so a map that wants to dictate the ground angle simply states two, not three.
 * `talk` is the same thing for a conversation — the camera steps in and up for the beat, and steps back after.
 * It states `feet` (not a horizon) because the boy must land ABOVE the message window, which fills the bottom
 * ~31% of the frame in docs/approved/dialogue.png: feet at 63-64% keeps all of him in the clear.
 * `__DQ.cameraFrame()` measures all of it through the live projection matrix: never eyeballed, always a number.
 *
 * `behind` and `lead` scale the ease-behind and the walking lead (interiors barely swing: rooms are small and
 * the walls are the frame). `floor` is how far the lens stays clear of the hillside.
 */
export const CAM_MODES = Object.freeze({
  field:    Object.freeze({ pitch: 26, fov: 47, frame: Object.freeze({ hero: 20, horizon: 17, feetMax: 82 }),
    talk: Object.freeze({ hero: 27, feet: 64, pitch: 22 }), behind: 1.0, lead: 1.0, floor: 0.8 }),
  town:     Object.freeze({ pitch: 25, fov: 47, frame: Object.freeze({ hero: 22, horizon: 19, feetMax: 80 }),
    talk: Object.freeze({ hero: 29, feet: 63, pitch: 21 }), behind: 0.9, lead: 0.85, floor: 0.8 }),
  world:    Object.freeze({ pitch: 28, fov: 48, frame: Object.freeze({ hero: 18, horizon: 18, feetMax: 82 }),
    talk: Object.freeze({ hero: 27, feet: 64, pitch: 23 }), behind: 1.0, lead: 1.2, floor: 0.85 }),
  interior: Object.freeze({ pitch: 42, fov: 45, frame: Object.freeze({ hero: 26, feet: 74 }),
    talk: Object.freeze({ hero: 32, feet: 63, pitch: 41 }), behind: 0.4, lead: 0.5, floor: 0.5 }),
  dungeon:  Object.freeze({ pitch: 30, fov: 47, frame: Object.freeze({ hero: 24, feet: 78 }),
    talk: Object.freeze({ hero: 30, feet: 64, pitch: 28 }), behind: 0.75, lead: 0.8, floor: 0.6 }),
});
const MODE_OF_KIND = { field: 'field', town: 'town', world: 'world', interior: 'interior', dungeon: 'dungeon', cave: 'dungeon' };

/** Hard limits on anything the solver or a map may ask for. */
const FRAME = Object.freeze({ minFov: 45, maxFov: 52, minPitch: 6, maxPitch: 62, minDist: 1.9, maxDist: 26, fovScale: 0.94 });
/** The boom's own rise above the look target (see lensAt): the lens sits a little over the hero's line. */
const EYE = 0.5;
/** A six-year-old, until the real model reports its height. */
const HERO_H = 1.35;

/**
 * Where the hero and the horizon land, for a pose — the same projection the renderer does, in closed form.
 * (Verified against __DQ.cameraFrame() to 3 decimals: this is the maths the screen is actually doing.)
 *   y is a height above the hero's feet; the frame's centre is the look point (lookUp above his feet).
 */
function frameOf(pitchDeg, dist, lookUp, fovDeg, heroH, lift = 0) {
  const T = Math.tan(clamp(fovDeg, 10, 80) / 2 * DEG);
  const cx = Math.max(1e-3, Math.cos(pitchDeg * DEG) * dist);
  const cy = Math.sin(pitchDeg * DEG) * dist + EYE + lift;
  const s = (cy - lookUp) / cx;
  const F = (y) => {
    const depth = cx + s * (cy - y);
    return depth < 0.05 ? (y > lookUp ? -9 : 9) : 0.5 * (1 - (y - lookUp) / (T * depth));
  };
  const feet = F(0), head = F(heroH);
  return { hero: (feet - head) * 100, feet: feet * 100, head: head * 100, horizon: 0.5 * (1 - s / T) * 100 };
}
/** Solve the look point for the secondary target (horizon outdoors, feet indoors). Both are monotone in lookUp. */
function solveLookUp(pitchDeg, dist, fovDeg, heroH, want, iter = 46) {
  const key = Number.isFinite(+want.horizon) ? 'horizon' : 'feet';
  const goal = +want[key];
  let lo = -2.5, hi = Math.max(5, dist * 1.6);
  for (let i = 0; i < iter; i++) {
    const u = (lo + hi) / 2;
    if (frameOf(pitchDeg, dist, u, fovDeg, heroH)[key] > goal) hi = u; else lo = u;
  }
  return (lo + hi) / 2;
}
/** Solve the boom length so the hero reads at `want.hero` % of frame height, keeping the secondary target. */
function solveDist(pitchDeg, fovDeg, heroH, want, iter = 40) {
  let lo = FRAME.minDist, hi = FRAME.maxDist;
  for (let i = 0; i < iter; i++) {
    const d = (lo + hi) / 2;
    const u = solveLookUp(pitchDeg, d, fovDeg, heroH, want, iter === 40 ? 46 : 26);
    if (frameOf(pitchDeg, d, u, fovDeg, heroH).hero > want.hero) lo = d; else hi = d;
  }
  return (lo + hi) / 2;
}
/**
 * Solve the boom PITCH — how much of the shot is the ground he walks over — when a composition states all three
 * (hero size, feet, horizon). Monotone: a higher boom pushes his feet further down the frame.
 */
function solvePitch(fovDeg, heroH, want, hint) {
  let lo = FRAME.minPitch, hi = FRAME.maxPitch;
  for (let i = 0; i < 24; i++) {
    const p = (lo + hi) / 2;
    const d = solveDist(p, fovDeg, heroH, want, 26);
    const u = solveLookUp(p, d, fovDeg, heroH, want, 30);
    if (frameOf(p, d, u, fovDeg, heroH).feet > want.feet) hi = p; else lo = p;
  }
  const p = (lo + hi) / 2;
  return (p <= FRAME.minPitch + 0.02 || p >= FRAME.maxPitch - 0.02) && Number.isFinite(+hint) ? clamp(+hint, FRAME.minPitch, FRAME.maxPitch) : p;
}

/**
 * A full pose for a composition: {pitch, dist, lookUp, fov} plus the framing it measures out to.
 * A composition with all three of hero / feet / horizon solves the pitch too; otherwise `pitchDeg` stands.
 */
function compose(pitchDeg, fovDeg, heroH, want) {
  const fov = clamp(fovDeg, FRAME.minFov, FRAME.maxFov);
  const full = Number.isFinite(+want.hero) && Number.isFinite(+want.feet) && Number.isFinite(+want.horizon);
  const pitch = clamp(full ? solvePitch(fov, heroH, want, pitchDeg) : pitchDeg, FRAME.minPitch, FRAME.maxPitch);
  let dist = clamp(solveDist(pitch, fov, heroH, want), FRAME.minDist, FRAME.maxDist);
  let lookUp = solveLookUp(pitch, dist, fov, heroH, want);
  let measured = frameOf(pitch, dist, lookUp, fov, heroH);
  // THE FLOOR GUARD. Pitch and the horizon together decide where his feet land, so a map that asks for a steep
  // ground angle (Puddlewick: 28°) slides the boy toward the bottom edge until there is nothing in front of him.
  // When that happens the boy keeps his place in the frame — and the GROUND ANGLE gives way before the sky does:
  // we re-solve the pitch for all three targets, so Puddlewick ends up at 24.6° with its band of sky over the
  // roofs instead of 28° with 11% of sky and the boy jammed against the bottom edge. Only if no ground angle in
  // the DQV band can hold all three does the horizon finally give way (the boy is always the subject).
  const cap = +want.feetMax;
  let solvedPitch = pitch;
  if (Number.isFinite(cap) && Number.isFinite(+want.horizon) && measured.feet > cap) {
    const w3 = { hero: want.hero, feet: cap, horizon: want.horizon };
    const p3 = solvePitch(fov, heroH, w3, pitch);
    const d3 = clamp(solveDist(p3, fov, heroH, w3), FRAME.minDist, FRAME.maxDist);
    const u3 = solveLookUp(p3, d3, fov, heroH, w3);
    const m3 = frameOf(p3, d3, u3, fov, heroH);
    if (p3 > FRAME.minPitch + 0.05 && p3 < FRAME.maxPitch - 0.05 &&
        Math.abs(m3.feet - cap) < 0.6 && Math.abs(m3.horizon - want.horizon) < 0.6 && Math.abs(m3.hero - want.hero) < 0.6) {
      solvedPitch = p3; dist = d3; lookUp = u3; measured = m3;
    } else {
      const w2 = { hero: want.hero, feet: cap };
      dist = clamp(solveDist(pitch, fov, heroH, w2), FRAME.minDist, FRAME.maxDist);
      lookUp = solveLookUp(pitch, dist, fov, heroH, w2);
      measured = frameOf(pitch, dist, lookUp, fov, heroH);
    }
  }
  return { pitch: solvedPitch, dist, lookUp, fov, measured };
}

/** Occluder fade tuning (docs/INTEGRATION-NEEDS.md). Live-tunable through __DQ.cameraFade(true, {alpha, ...}). */
const FADE = ({
  alpha: 0.42,         // ~40%: the DQ see-through level (the brief says 35-45%)
  outline: 0.8,        // the ink line stays stronger than the fill, so the shape still reads
  outMs: 150,          // fade out over ~150 ms ...
  inMs: 220,           // ... and back a touch slower
  hold: 0.1,           // keep fading 100 ms after the last hit: no flicker at the edge of a canopy
  gap: 1.7,            // merged-bucket segmentation: a new piece starts when the triangles jump this far
  span: 6.5,           // ... and a piece is capped this wide (a bucket of scattered props is not one occluder)
  join: 0.55,          // ... and pieces this close to each other are ONE object (a cottage, not a wall)
  cluster: 10,         // ... up to this wide, so a long hedge or fence never vanishes in one lump
  slots: 14,           // instanced hides borrow Toon.see's fade slots (16)
  ghosts: 12,          // at most this many objects are ghosted in a frame
  rays: 5,             // hero sample points per object
  lens: 0.78,          // the lens counts as INSIDE a canopy inside this fraction of its radius
  melt: 0.3,           // a surface this close to the lens goes entirely (the lens is never pressed into a wall)
  solid: 1.25,         // ... ramping up to the full 40% by here, so a real occluder is the 35-45% the brief asks
                       //     for and only the last hand's width before the lens dissolves it
  near: 2.2,           // ... and anything whose surface is inside this fades WHETHER OR NOT it covers the hero:
                       //     a canopy the lens has walked under never becomes an opaque plate over the frame
});
const FADE_KEYS = ['alpha', 'outline', 'outMs', 'inMs', 'hold', 'ghosts', 'slots', 'lens', 'melt', 'solid', 'near'];

const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r3 = (v) => Math.round(v * 1000) / 1000;
const deg360 = (rad) => r3(((rad / DEG) % 360 + 360) % 360);
const lerp = (a, b, t) => a + (b - a) * t;
const vec3of = (v, d = null) => {
  if (!v) return d;
  if (Array.isArray(v)) return { x: +v[0] || 0, y: +v[1] || 0, z: +v[2] || 0 };
  if (Number.isFinite(+v.x) && Number.isFinite(+v.z)) return { x: +v.x, y: +v.y || 0, z: +v.z };
  return d;
};
const EASES = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => t * t * (3 - 2 * t),
  smooth: (t) => t * t * t * (t * (t * 6 - 15) + 10),
};
const easeFn = (e) => (typeof e === 'function' ? e : EASES[e] || EASES.inOut);

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// The occluder fade
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const SEE = (() => { try { return Toon && Toon.see ? Toon.see : null; } catch (_) { return null; } })();
const RUNS = new WeakMap();      // geometry -> [{start, count, box}]  (merged-bucket segmentation, computed once)
const SEE_MAT = new WeakMap();   // material -> is it a see-through material?
const HIDDEN_MATS = new Map();   // side -> the material that hides a bucket range from the colour pass only
const CLASS = new WeakMap();     // mesh -> its candidate class (recomputed only when the scan re-traverses)

/**
 * THE WORLD ITSELF is never an occluder to slide around: the ground, the water, the sky, the far hills and the
 * flat decals painted on the floor. The lens is kept out of the hillside by `clearance()` on its own spring —
 * a camera that tried to dodge the terrain would have nowhere to stand.
 */
const WORLD_NAME = /^(ground|terrain|water|river|sea|sky|skydome|cloud|hill-|fog|haze|horizon|blobShadow|contactShadow|prompt|selection|weather|rain|snow)/i;
/** An actor: a person, an animal, a monster. It can hide the boy, but it is never ghosted — people are not glass. */
function isActorPart(o) {
  if (o.isSkinnedMesh) return true;
  for (let a = o.parent, n = 0; a && n < 6; a = a.parent, n++) {
    if (a.userData && (a.userData.actor || a.userData.isCharacter)) return true;
    if (/^(char:|npc:|monster|party:|follower)/i.test(a.name || '')) return true;
  }
  return false;
}
function isUnder(o, root) { for (let a = o; a; a = a.parent) if (a === root) return true; return false; }

/** A material opts into see-through by carrying Toon.see.patch — its program cache key then contains "see". */
function isSeeMaterial(m) {
  if (!m || Array.isArray(m)) return false;
  if (SEE_MAT.has(m)) return SEE_MAT.get(m);
  let yes = false;
  try {
    const k = typeof m.customProgramCacheKey === 'function' ? String(m.customProgramCacheKey()) : '';
    yes = /(^|\|)see(\||$)/.test(k);
  } catch (_) { yes = false; }
  SEE_MAT.set(m, yes);
  return yes;
}
const isOutlinePart = (mesh) => !!(mesh.userData && mesh.userData.isOutline) || (mesh.material && mesh.material.side === THREE.BackSide);
/**
 * A one-instance stand-in geometry for an InstancedMesh, so a SINGLE tree / card can be drawn out of the herd.
 * Painted treetop cards carry their own per-instance attributes (`aCard`: atlas variant + haze), so the clone
 * shares every plain attribute and the index buffer and gets a 1-wide copy of each instanced one, refilled per
 * frame from the instance being ghosted. Without this, every forestCards instance was un-ghostable.
 */
const GHOST_GEOS = new WeakMap();      // source geometry -> [clone]
function ghostGeometry(geo, slot) {
  let list = GHOST_GEOS.get(geo);
  if (!list) { list = []; GHOST_GEOS.set(geo, list); }
  if (list[slot]) return list[slot];
  const names = Object.keys(geo.attributes).filter((k) => geo.attributes[k].isInstancedBufferAttribute);
  let out;
  if (!names.length) out = { geo, inst: null };
  else {
    const clone = new THREE.BufferGeometry();
    clone.name = (geo.name || 'geo') + ':ghost';
    if (geo.index) clone.setIndex(geo.index);
    const inst = [];
    for (const k of Object.keys(geo.attributes)) {
      const a = geo.attributes[k];
      if (a.isInstancedBufferAttribute) {
        const one = new THREE.InstancedBufferAttribute(new Float32Array(a.itemSize), a.itemSize);
        one.setUsage(THREE.DynamicDrawUsage);
        clone.setAttribute(k, one);
        inst.push(k);
      } else clone.setAttribute(k, a);
    }
    if (geo.groups && geo.groups.length) clone.groups = geo.groups;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (geo.boundingSphere) clone.boundingSphere = geo.boundingSphere.clone();
    out = { geo: clone, inst };
  }
  list[slot] = out;
  return out;
}
function hiddenMaterial(side) {
  let m = HIDDEN_MATS.get(side);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ side, colorWrite: false, depthWrite: false });
    m.name = 'camera:hidden-range';
    m.userData.shared = true;                 // Assets.disposeObject must never take this one with a scene
    HIDDEN_MATS.set(side, m);
  }
  return m;
}

/**
 * Split a merged bucket geometry into pieces: runs of triangles that stay together in space.
 * Straight off the typed arrays (no BufferAttribute accessors, no Vector3 churn) — a 29 000-triangle village
 * bucket is segmented in a couple of milliseconds instead of twenty, which is what used to make the rescan
 * visible as a dropped frame. Cached per GEOMETRY, so it is paid once per map however often the scan re-runs.
 */
function runsOf(mesh) {
  const geo = mesh.geometry;
  const hit = RUNS.get(geo);
  if (hit) return hit;
  const out = [];
  try {
    const pos = geo.attributes.position, idx = geo.index;
    const P = pos ? pos.array : null;
    const I = idx ? idx.array : null;
    const total = idx ? idx.count : (pos ? pos.count : 0);
    const given = mesh.userData && Array.isArray(mesh.userData.pieces) ? mesh.userData.pieces : null;
    const at = (t) => (I ? I[t] : t) * 3;
    const push = (start, count) => {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let t = start; t < start + count; t++) {
        const o = at(t), x = P[o], y = P[o + 1], z = P[o + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      out.push({ start, count, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
    };
    if (given) { for (const p of given) push(p.start | 0, p.count | 0); }
    else if (P) {
      let start = 0, count = 0;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      const close = () => {
        if (count) out.push({ start, count, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
        x0 = y0 = z0 = Infinity; x1 = y1 = z1 = -Infinity; count = 0;
      };
      for (let t = 0; t + 2 < total; t += 3) {
        const a = at(t), b = at(t + 1), c2 = at(t + 2);
        const cx = (P[a] + P[b] + P[c2]) / 3, cy = (P[a + 1] + P[b + 1] + P[c2 + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c2 + 2]) / 3;
        if (count) {
          const dx = Math.max(x0 - cx, cx - x1, 0), dy = Math.max(y0 - cy, cy - y1, 0), dz = Math.max(z0 - cz, cz - z1, 0);
          const spanX = Math.max(x1, cx) - Math.min(x0, cx), spanZ = Math.max(z1, cz) - Math.min(z0, cz);
          if (Math.sqrt(dx * dx + dy * dy + dz * dz) > FADE.gap || Math.hypot(spanX, spanZ) > FADE.span) { close(); start = t; }
        } else start = t;
        for (const o of [a, b, c2]) {
          const x = P[o], y = P[o + 1], z = P[o + 2];
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        count += 3;
      }
      close();
    }
  } catch (e) { reportError('camera fade: bucket segmentation', e); }
  RUNS.set(geo, out);
  return out;
}

/**
 * The fade pass. Owns its own scan of the scene, its own occlusion test, the hide-in-the-main-pass bookkeeping
 * and the ghost draw. Everything is guarded: a failure switches the pass off for the frame, never throws.
 */
function createFadePass({ hero = () => null } = {}) {
  const S = {
    enabled: true, scene: null, kids: -1, rescanT: 0, scanMs: 0, scanFrames: 0, pend: null,
    objects: [], groups: [], solids: [], blockers: [],
    fading: [], ghosts: [], hiddenInst: [], hiddenSolid: new Map(),
    ms: 0, tested: 0, occluding: 0, drawn: 0, installed: null, before: null, after: null,
    touched: [], carriers: { byGeo: new Map(), all: [] }, saved: null,
  };
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = true;
  const tmpMesh = new THREE.Mesh();
  const hits = [];
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), P = new THREE.Vector3();
  const M = new THREE.Matrix4(), MI = new THREE.Matrix4();
  const lensV = new THREE.Vector3();
  const localRay = new THREE.Ray();
  const pts = [];

  // ── what a mesh IS ─────────────────────────────────────────────────────────────────────────────────────────
  const heroRootOf = () => { try { return hero() || null; } catch (_) { return null; } };
  function boundsOf(o) {
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingBox) g.computeBoundingBox();
    return g.boundingSphere || null;
  }
  /**
   * Sort a mesh into what the camera must do about it:
   *   'inst'      an instanced see-through species  -> can be ghosted AND counts against the sight line
   *   'solid'     a merged bucket / one-off mesh    -> can be ghosted (hidden range + ghost draw) AND counts
   *   'instBlock' an instanced species we cannot hide (no fade slot, or no see material) -> counts only
   *   'card'      a small glow card or a multi-material mesh                             -> counts only
   *   'actor'     a person, an animal, a monster    -> counts only; people are never drawn as glass
   *   null        the world itself (ground, water, sky, far hills), the hero, a ground decal, a huge haze card
   * The verdict is cached per mesh and re-taken whenever the scan re-traverses with a different material.
   */
  function classifyRaw(o, heroRoot) {
    if (!o.geometry || o.userData.camGhost || o.userData.camIgnore) return null;
    if (o.visible === false) return null;
    if (WORLD_NAME.test(o.name || '')) return null;
    if (heroRoot && isUnder(o, heroRoot)) return null;
    const arr = Array.isArray(o.material);
    const m = arr ? o.material[0] : o.material;
    if (!m || m.colorWrite === false) return null;
    if (isActorPart(o)) return isOutlinePart(o) ? null : 'actor';
    const sph = boundsOf(o);
    const bb = o.geometry.boundingBox;
    const r = sph ? sph.radius : 0;
    const hgt = bb ? bb.max.y - bb.min.y : 0;
    // an additive glow, a multiply-blended contact shadow, a half-transparent card: not a wall. Only a SMALL
    // upright one counts at all (a lantern's halo can sit on the sight line; the haze over the valley cannot).
    // an additive glow, a multiply-blended contact shadow: that is LIGHT, not a wall — it hides nothing, and a
    // camera that slid round a lantern's halo would be a camera with a nervous tic
    if (m.blending !== THREE.NormalBlending) return null;
    if (m.transparent && (m.opacity == null ? 1 : m.opacity) < 0.92) {
      if (!(r <= 1.8 && hgt >= 0.5)) return null;          // a half-transparent card only counts if it is a pane
      return o.isInstancedMesh ? 'instBlock' : 'card';
    }
    const see = isSeeMaterial(o.material);
    if (!see && r > 90) return null;                          // a landscape ring, a map-wide floor
    // something that cannot reach the boy's chest from the ground is not worth tracking: a bed of flowers is
    // not a wall, and 291 of them would cost more to test than every cottage in the village put together
    if (!see && hgt < 0.5) return null;
    if (o.isInstancedMesh) return (see && SEE) ? 'inst' : 'instBlock';
    if (arr) return 'card';                                   // we cannot hide one range of a multi-material mesh
    return 'solid';
  }
  function classify(o, heroRoot) {
    const c = CLASS.get(o);
    if (c !== undefined && c.v === o.visible && c.m === o.material) return c.k;
    let k = null;
    try { k = classifyRaw(o, heroRoot); } catch (_) { k = null; }
    CLASS.set(o, { k, v: o.visible, m: o.material });
    return k;
  }

  // ── scan ───────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Re-take the census of the scene. Segmenting a 29 000-triangle village bucket is real work, so the scan is
   * BUDGETED: it walks the scene once (cheap), then chews through the merged buckets a few milliseconds per
   * frame, and only swaps the new census in when it is complete — the old one keeps working meanwhile. That is
   * what stops a rescan from showing up as a dropped frame in the middle of a town orbit.
   * Returns true when the census is finished.
   */
  function scan(budgetMs = 0) {
    const t0 = performance.now();
    const sc = S.scene;
    if (!sc) { S.pend = null; return true; }
    let P = S.pend;
    if (!P) {
      P = S.pend = { byMatrix: new Map(), solidMeshes: [], blockers: [], all: [], heavy: [], i: 0, ms: 0 };
      const heroRoot = heroRootOf();
      sc.traverse((o) => {
        if (!o.isMesh) return;
        const k = classify(o, heroRoot);
        if (!k) return;
        if (k === 'inst' || k === 'instBlock') {
          let g = P.byMatrix.get(o.instanceMatrix);
          if (!g) { g = { members: [], parts: [], n: o.count, version: -1, cx: [], cy: [], cz: [], r: [], local: null, fadeable: false }; P.byMatrix.set(o.instanceMatrix, g); }
          g.members.push(o);
          g.n = Math.min(g.n, o.count);
          if (k === 'inst') g.fadeable = true;
        } else if (k === 'solid') P.solidMeshes.push(o);
        else P.blockers.push({ kind: k, mesh: o, sph: boundsOf(o), cx: 0, cy: 0, cz: 0, r: 0, ver: -1 });
      });
      P.ms = performance.now() - t0;
      S.scanFrames = 1;
    } else S.scanFrames++;
    // merged buckets: runs in WORLD space (the coarse tests below compare them against the world-space lens)
    while (P.i < P.solidMeshes.length) {
      const mesh = P.solidMeshes[P.i++];
      mesh.updateWorldMatrix(true, false);
      const rs = runsOf(mesh);
      P.heavy.push({ name: mesh.name || 'mesh', runs: rs.length });
      for (const run of rs) P.all.push({ mesh, run, box: run.box.clone().applyMatrix4(mesh.matrixWorld) });
      if (budgetMs > 0 && performance.now() - t0 > budgetMs) { P.ms += performance.now() - t0; S.scanMs = Math.round(P.ms * 10) / 10; return false; }
    }
    S.objects = []; S.groups = []; S.solids = []; S.blockers = P.blockers;
    // instanced objects: one per instance (fadeable ones join the fade census, the rest only block the view)
    for (const g of P.byMatrix.values()) {
      const sph = new THREE.Sphere();
      let first = true;
      for (const m of g.members) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const s = m.geometry.boundingSphere;
        if (!s) continue;
        if (first) { sph.copy(s); first = false; } else sph.union(s);
        // the SOLID parts get their own sphere: a crown 2.5 across and the trunk under it are very different
        // volumes to be "inside", and the union of the two is neither
        if (!isOutlinePart(m)) g.parts.push({ mesh: m, local: s.clone(), cx: [], cy: [], cz: [], r: [] });
      }
      g.local = sph;
      S.groups.push(g);
      for (let i = 0; i < g.n; i++) {
        const ob = { kind: 'inst', g, i, alpha: 1, hitT: 0, inside: false, dist: 0, name: (g.members[0].name || 'instance') + '#' + i };
        if (g.fadeable) S.objects.push(ob); else S.blockers.push(ob);
      }
    }
    const all = P.all;
    // ONE OBJECT PER THING: runs are segmented small (so the per-run tests below are precise about what is
    // actually in the way) and then clustered back together by PROXIMITY, capped at FADE.cluster across, so a
    // whole cottage — walls, roof, chimney — fades as one piece while a bucket three metres away does not.
    // The sweep is x-sorted, so this stays near-linear instead of quadratic over a few hundred runs.
    const order = all.map((_, i) => i).sort((a, b) => all[a].box.min.x - all[b].box.min.x);
    const parent = all.map((_, i) => i);
    const cbox = all.map((it) => it.box.clone());
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const spanOf = (b) => Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    const tryUnion = (i, j) => {
      const a = find(i), b = find(j);
      if (a === b) return;
      const merged = cbox[a].clone().union(cbox[b]);
      if (spanOf(merged) > FADE.cluster) return;
      parent[b] = a;
      cbox[a] = merged;
    };
    const J = FADE.join;
    for (let oi = 0; oi < order.length; oi++) {
      const i = order[oi], a = all[i].box;
      for (let oj = oi + 1; oj < order.length; oj++) {
        const j = order[oj], b = all[j].box;
        if (b.min.x > a.max.x + J) break;                    // x-sorted: nothing further along can touch it
        const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
        const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
        const oy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
        if (ox < -J || oz < -J || oy < -J) continue;
        tryUnion(i, j);
      }
    }
    const clusters = new Map();
    all.forEach((it, i) => {
      const k = find(i);
      let cl = clusters.get(k);
      if (!cl) { cl = { kind: 'solid', runs: [], box: new THREE.Box3(), alpha: 1, hitT: 0, inside: false, dist: 0, name: it.mesh.name || 'bucket' }; clusters.set(k, cl); }
      cl.runs.push(it);
      cl.box.union(it.box);
    });
    for (const cl of clusters.values()) {
      // name it by what it IS, not by which material bucket it was merged into: "stone 5.9x5.8 @-12.6,0.4" is a
      // cottage, "wood 0.6x0.9 @3.1,-7.2" is a bucket, and a critic can tell them apart at a glance
      const b = cl.box;
      const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z), hgt = b.max.y - b.min.y;
      cl.name = `${String(cl.name).replace(/^bucket-/, '')} ${w.toFixed(1)}x${hgt.toFixed(1)}@${((b.min.x + b.max.x) / 2).toFixed(0)},${((b.min.z + b.max.z) / 2).toFixed(0)}`;
      cl.r = Math.hypot(w, hgt) / 2;
      S.solids.push(cl); S.objects.push(cl);
    }
    S.scanMs = Math.round((P.ms + performance.now() - t0) * 10) / 10;
    S.heavy = P.heavy.sort((a, b) => b.runs - a.runs).slice(0, 6);
    S.runs = all.length;
    S.pend = null;
    return true;
  }

  /** A blocker that is not a fade candidate (an actor, a glow card): its world sphere, once a tick. */
  function refreshBlocker(b, dt) {
    const o = b.mesh;
    if (!o.parent || o.visible === false) { b.r = -1; return; }
    o.updateWorldMatrix(true, false);
    const sph = b.sph;
    if (!sph) { b.r = -1; return; }
    V.copy(sph.center).applyMatrix4(o.matrixWorld);
    b.cx = V.x; b.cy = V.y; b.cz = V.z;
    const scale = o.matrixWorld.getMaxScaleOnAxis();
    // a person is an upright capsule as wide as their shoulders, not a ball the size of the air around them:
    // the camera steps aside when someone really stands in front of the boy, and not otherwise
    const bb = o.geometry.boundingBox;
    if (b.kind === 'actor' && bb) {
      b.r = Math.max(0.16, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5 * scale * 1.1);
      b.hy = Math.max(0.1, (bb.max.y - bb.min.y) * 0.5 * scale - b.r * 0.5);
      V.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2).applyMatrix4(o.matrixWorld);
      b.cx = V.x; b.cy = V.y; b.cz = V.z;
    } else { b.r = sph.radius * scale; b.hy = 0; }
    // A PERSON WALKS. The boy's own path is predicted below; a villager's is predicted here, by widening him
    // by as far as he can get in the look-ahead — so the camera is already stepping aside as he walks into
    // the shot, instead of a quarter of a second after he has covered the boy.
    if (b.px !== undefined && dt > 0) {
      const sp = Math.hypot(b.cx - b.px, b.cz - b.pz) / dt;
      b.pad = Math.min(1.1, sp * DODGE.look);
    } else b.pad = 0;
    b.px = b.cx; b.pz = b.cz;
  }

  /** Instance bounds, refreshed whenever the instance matrices change (critters move). */
  function refreshGroup(g) {
    const m0 = g.members[0];
    const attr = m0.instanceMatrix;
    if (g.version === attr.version && g.cx.length === g.n) return;
    g.version = attr.version;
    const c = g.local ? g.local.center : null;
    const rad = g.local ? g.local.radius : 1;
    for (let i = 0; i < g.n; i++) {
      m0.getMatrixAt(i, M);
      M.premultiply(m0.matrixWorld);
      const scale = M.getMaxScaleOnAxis();
      V.copy(c || V.set(0, 0, 0)).applyMatrix4(M);
      g.cx[i] = V.x; g.cy[i] = V.y; g.cz[i] = V.z;
      g.r[i] = rad * scale;
      for (const part of g.parts) {
        V.copy(part.local.center).applyMatrix4(M);
        part.cx[i] = V.x; part.cy[i] = V.y; part.cz[i] = V.z; part.r[i] = part.local.radius * scale;
      }
    }
  }

  // ── the occlusion test ─────────────────────────────────────────────────────────────────────────────────────
  function segDist(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const vx = bx - ax, vy = by - ay, vz = bz - az, L2 = vx * vx + vy * vy + vz * vz || 1e-9;
    let u = ((cx - ax) * vx + (cy - ay) * vy + (cz - az) * vz) / L2;
    u = clamp(u, 0, 1);
    return { u, d: Math.hypot(ax + vx * u - cx, ay + vy * u - cy, az + vz * u - cz) };
  }

  function rayHitsInstance(obj, origin, dir, far) {
    const g = obj.g;
    ray.set(origin, dir);
    ray.near = 0.05; ray.far = far;
    for (const m of g.members) {
      if (isOutlinePart(m)) continue;
      g.members[0].getMatrixAt(obj.i, M);
      tmpMesh.geometry = m.geometry;
      tmpMesh.material = m.material;
      tmpMesh.matrixWorld.copy(m.matrixWorld).multiply(M);
      hits.length = 0;
      try { tmpMesh.raycast(ray, hits); } catch (_) { hits.length = 0; }
      if (hits.length) return true;
    }
    return false;
  }

  function rayHitsSolid(obj, origin, dir, far) {
    return runsHitRay(obj.hitRuns && obj.hitRuns.length ? obj.hitRuns : obj.runs, origin, dir, far);
  }
  function runsHitRay(list, origin, dir, far) {
    for (const it of list) {
      const mesh = it.mesh, geo = mesh.geometry;
      MI.copy(mesh.matrixWorld).invert();
      localRay.origin.copy(origin).applyMatrix4(MI);
      localRay.direction.copy(dir).transformDirection(MI);
      const pos = geo.attributes.position, idx = geo.index;
      const end = it.run.start + it.run.count;
      for (let t = it.run.start; t + 2 < end; t += 3) {
        const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
        A.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
        B.set(pos.getX(i1), pos.getY(i1), pos.getZ(i1));
        C.set(pos.getX(i2), pos.getY(i2), pos.getZ(i2));
        if (localRay.intersectTriangle(A, B, C, false, P) && P.distanceTo(localRay.origin) <= far) return true;
      }
    }
    return false;
  }

  /**
   * Test + ease, once per simulation tick (so __DQ.advance and __DQ.freeze stay deterministic).
   * lens / hero are world positions; camYaw orients the two side samples across the hero's body.
   */
  function update(dt, lens, hero, camYaw) {
    // bounds first, always: the sight guarantee reads them even when the fade itself is switched off
    for (const b of S.blockers) if (b.kind === 'actor' || b.kind === 'card') { try { refreshBlocker(b, dt); } catch (_) { b.r = -1; } }
    for (const g of S.groups) { try { refreshGroup(g); } catch (e) { reportError('camera fade: instance bounds', e); } }
    if (!S.enabled || !S.objects.length) { S.fading.length = 0; return; }
    const t0 = performance.now();
    lensV.set(lens.x, lens.y, lens.z);
    const hx = hero.x, hy = hero.y, hz = hero.z;
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    pts.length = 0;
    pts.push([hx, hy + 0.28, hz], [hx, hy + 0.8, hz], [hx, hy + 1.32, hz],
      [hx + rx * 0.42, hy + 0.85, hz + rz * 0.42], [hx - rx * 0.42, hy + 0.85, hz - rz * 0.42]);
    const heroD = Math.hypot(hx - lens.x, hy + 0.8 - lens.y, hz - lens.z);
    let tested = 0, occluding = 0;
    const probe = [];

    for (const obj of S.objects) {
      let cx, cy, cz, rad;
      if (obj.kind === 'inst') {
        const g = obj.g;
        cx = g.cx[obj.i]; cy = g.cy[obj.i]; cz = g.cz[obj.i]; rad = g.r[obj.i];
        if (!Number.isFinite(cx)) { obj.hitT = 0; obj.inside = false; obj.why = 'no bounds yet'; ease(obj, dt); continue; }
      } else {
        const b = obj.box;
        cx = (b.min.x + b.max.x) / 2; cy = (b.min.y + b.max.y) / 2; cz = (b.min.z + b.max.z) / 2;
        rad = Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) / 2;
      }
      obj.dist = Math.hypot(cx - lens.x, cy - lens.y, cz - lens.z);
      // is the lens inside it? then it goes entirely — you can never be stuck inside a canopy or a roof.
      // Clusters are tested run by run: one cottage's cluster box spans foundation to chimney, and standing
      // behind the house is NOT standing inside it. A piece the HERO is standing inside is a region, not a
      // wall between us, so it never counts (a room's floor slab must not swallow the room).
      let inside = false;
      obj.surf = Math.max(0, obj.dist - rad);
      obj.near = null;
      if (obj.kind === 'inst') {
        // per solid part: the crown and the trunk are separate volumes to be inside
        const g = obj.g, i = obj.i;
        let mn = obj.surf;
        for (const part of g.parts) {
          const d = Math.hypot(part.cx[i] - lensV.x, part.cy[i] - lensV.y, part.cz[i] - lensV.z);
          if (d < part.r[i] * FADE.lens) { inside = true; break; }
          const s2 = d - part.r[i];
          if (s2 < mn) mn = s2;
        }
        obj.surf = inside ? 0 : Math.max(0, mn);
      } else {
        // the cluster's own box is only a bounding hint; every real test is per run
        let mn = 1e9;
        obj.near = null;
        for (const it of obj.runs) {
          const b = it.box, e = 0.25;
          const d = b.distanceToPoint(lensV);
          if (d < mn) { mn = d; obj.near = it; }
          if (d <= 0.001 &&
              lensV.x > b.min.x - e && lensV.x < b.max.x + e && lensV.y > b.min.y - e && lensV.y < b.max.y + e &&
              lensV.z > b.min.z - e && lensV.z < b.max.z + e &&
              !(hx > b.min.x - e && hx < b.max.x + e && hy + 0.8 > b.min.y && hy < b.max.y + e &&
                hz > b.min.z - e && hz < b.max.z + e)) { inside = true; break; }
        }
        obj.surf = inside ? 0 : Math.max(0, mn);
      }
      obj.inside = inside;
      obj.melt = false;
      obj.ramp = obj.surf;                    // which surface distance the 40% ramp is measured from (below)
      // the lens INSIDE it: it goes entirely — you can never be stuck inside a canopy or a roof
      if (inside) { obj.hitT = FADE.hold; occluding++; obj.why = 'lens inside it'; ease(obj, dt); continue; }
      // coarse: does it sit on the segment lens -> hero at all? (per run, so a merged bucket's overall box
      // can never nominate a stone bucket six metres away as the thing covering the hero)
      let seg = null, sightSurf = obj.surf;
      if (obj.kind === 'inst') {
        const s = segDist(lens.x, lens.y, lens.z, hx, hy + 0.8, hz, cx, cy, cz);
        if (s.d <= rad + 0.7 && s.u <= 0.985 && obj.dist <= heroD + rad) seg = { d: s.d, u: s.u, r: rad };
      } else {
        obj.hitRuns = obj.hitRuns || [];
        obj.hitRuns.length = 0;
        // ... and the near-zone ramp below is measured from the runs ON THE SIGHT LINE only. A cluster is a
        // whole cottage: the back wall the lens has already walked past must not dissolve the front of the
        // house, and a fence post beside the lens must not turn its cottage translucent (the round-2 note:
        // "it even does this to objects that are not in front of the hero").
        let mnSight = 1e9;
        for (const it of obj.runs) {
          const b = it.box;
          const rx = (b.min.x + b.max.x) / 2, ry = (b.min.y + b.max.y) / 2, rz = (b.min.z + b.max.z) / 2;
          const rr = Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) / 2;
          const s = segDist(lens.x, lens.y, lens.z, hx, hy + 0.8, hz, rx, ry, rz);
          if (s.d > rr + 0.5 || s.u > 0.985) continue;
          if (Math.hypot(rx - lens.x, ry - lens.y, rz - lens.z) > heroD + rr) continue;
          obj.hitRuns.push(it);
          mnSight = Math.min(mnSight, b.distanceToPoint(lensV));
          if (!seg || s.d < seg.d) seg = { d: s.d, u: s.u, r: rr };
        }
        sightSurf = mnSight < 1e9 ? Math.max(0, mnSight) : obj.surf;
      }
      obj.segD = seg ? r3(seg.d) : null;
      if (!seg) {
        // nothing of it lies between the lens and the boy. The one exception is a surface pressed right against
        // the lens: that is a plate over the frame whatever it is in front of, so it still goes.
        if (obj.surf < FADE.melt) { obj.melt = true; obj.hitT = FADE.hold; occluding++; obj.why = 'pressed against the lens'; ease(obj, dt); continue; }
        obj.hitT = Math.max(0, obj.hitT - dt); obj.why = 'not on the sight line'; ease(obj, dt); continue;
      }
      obj.ramp = sightSurf;
      // right up against the lens, an occluder goes entirely instead of smearing itself over the frame
      if (sightSurf < FADE.melt) { obj.melt = true; obj.hitT = FADE.hold; occluding++; obj.why = 'melted at the lens'; ease(obj, dt); continue; }
      // ... and anything whose surface is INSIDE the near zone fades whether or not its triangles cover him:
      // this is the canopy the lens has just walked under, which would otherwise be an opaque plate
      if (sightSurf < FADE.near) {
        obj.hitT = FADE.hold; occluding++; obj.why = 'at the lens';
        probe.push({ name: obj.name, kind: obj.kind, dist: r3(obj.dist), surf: r3(sightSurf), reason: 'at the lens', hits: -1 });
        ease(obj, dt);
        continue;
      }
      // fine: rays from the lens to five points on his body
      tested++;
      probe.push({ name: obj.name, kind: obj.kind, dist: r3(obj.dist), surf: r3(sightSurf), segD: r3(seg.d), u: r3(seg.u), r: r3(seg.r), hits: 0 });
      let n = 0, centre = false;
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        V2.set(p[0] - lens.x, p[1] - lens.y, p[2] - lens.z);
        const far = V2.length() - 0.3;
        if (far <= 0.1) continue;
        V3.copy(V2).normalize();
        V.copy(lens);
        let hit = false;
        try { hit = obj.kind === 'inst' ? rayHitsInstance(obj, V, V3, far) : rayHitsSolid(obj, V, V3, far); }
        catch (e) { reportError('camera fade: ray', e); }
        if (hit) { n++; if (k === 1) centre = true; }
        if (n >= 2) break;
      }
      if (probe.length) probe[probe.length - 1].hits = n;
      const want = n >= 2 || (n >= 1 && centre);
      obj.why = want ? 'covering him (' + n + '/' + pts.length + ' rays)' : 'clear of him (' + n + '/' + pts.length + ' rays)';
      if (want) { obj.hitT = FADE.hold; occluding++; } else obj.hitT = Math.max(0, obj.hitT - dt);
      ease(obj, dt);
    }
    S.tested = tested; S.occluding = occluding; S.probe = probe;
    // the frame's work lists
    S.fading.length = 0;
    for (const obj of S.objects) if (obj.alpha < 0.999) S.fading.push(obj);
    S.fading.sort((a, b) => a.alpha - b.alpha);
    S.ms = Math.round((performance.now() - t0) * 100) / 100;
  }

  // ── THE SIGHT LINE ─────────────────────────────────────────────────────────────────────────────────────────
  // "Can the lens see the boy's chest from here?" — asked of a POSE THE CAMERA HAS NOT TAKEN YET, dozens of
  // times a tick, so it is answered off the cached bounds (per-instance spheres, per-run world boxes, one sphere
  // per actor) rather than by raycasting the scene. Conservative on purpose: a box says "blocked" a little
  // before the triangles do, so the camera has already stepped aside by the time a wall really crosses the line.
  /**
   * The shortest distance between the sight line and an UPRIGHT CAPSULE — how a person is actually shaped.
   * A villager's bounding sphere is nearly a metre across and swallows the air beside him; a 0.4-wide capsule
   * the height of his body is the difference between "the camera steps aside when someone stands in front of
   * the boy" and "the camera runs away from everyone in the square".
   */
  function segCapsule(ax, ay, az, bx, by, bz, cx, cy, cz, r, hh) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;      // the sight line
    const vy = 2 * hh;                                   // the body, straight up
    const wx = ax - cx, wy = ay - (cy - hh), wz = az - cz;
    const A = ux * ux + uy * uy + uz * uz, B = uy * vy, C = vy * vy;
    const D = ux * wx + uy * wy + uz * wz, E = vy * wy;
    const den = A * C - B * B;
    let sN, sD = den, tN, tD = den;
    if (den < 1e-9) { sN = 0; sD = 1; tN = E; tD = C; }
    else {
      sN = B * E - C * D; tN = A * E - B * D;
      if (sN < 0) { sN = 0; tN = E; tD = C; }
      else if (sN > sD) { sN = sD; tN = E + B; tD = C; }
    }
    if (tN < 0) { tN = 0; if (-D < 0) sN = 0; else if (-D > A) sN = sD; else { sN = -D; sD = A; } }
    else if (tN > tD) { tN = tD; if ((-D + B) < 0) sN = 0; else if ((-D + B) > A) sN = sD; else { sN = -D + B; sD = A; } }
    const sc = Math.abs(sD) < 1e-9 ? 0 : sN / sD, tc = Math.abs(tD) < 1e-9 ? 0 : tN / tD;
    const dx = wx + sc * ux, dy = wy + sc * uy - tc * vy, dz = wz + sc * uz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) <= r;
  }
  /** Does the segment a->b reach inside this sphere? */
  function segSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
    const vx = bx - ax, vy = by - ay, vz = bz - az;
    const L2 = vx * vx + vy * vy + vz * vz || 1e-9;
    let u = ((cx - ax) * vx + (cy - ay) * vy + (cz - az) * vz) / L2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const dx = ax + vx * u - cx, dy = ay + vy * u - cy, dz = az + vz * u - cz;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }
  /** Slab test: does the segment a->b cross this world-space box (grown by `pad`)? */
  function segBox(ax, ay, az, dx, dy, dz, len, box, pad) {
    let t0 = 0, t1 = len;
    const lo = box.min, hi = box.max;
    for (let k = 0; k < 3; k++) {
      const o = k === 0 ? ax : k === 1 ? ay : az;
      const d = k === 0 ? dx : k === 1 ? dy : dz;
      const mn = (k === 0 ? lo.x : k === 1 ? lo.y : lo.z) - pad;
      const mx = (k === 0 ? hi.x : k === 1 ? hi.y : hi.z) + pad;
      if (Math.abs(d) < 1e-7) { if (o < mn || o > mx) return false; continue; }
      let ta = (mn - o) / d, tb = (mx - o) / d;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    return true;
  }
  const inBox = (x, y, z, box, pad) => x > box.min.x - pad && x < box.max.x + pad && y > box.min.y - pad &&
    y < box.max.y + pad && z > box.min.z - pad && z < box.max.z + pad;

  /**
   * What (if anything) stands between `lens` and the point `to`. `skip` is a distance from the lens inside which
   * a surface does not count (nothing is ever perfectly clear of the boy's own contact shadow).
   * Returns null when the way is clear, else {name, kind, big} for the first thing found.
   */
  /**
   * Everything that could possibly sit between a lens on this boom and the boy, gathered once a tick, so the
   * pose search below costs a few dozen sphere tests instead of a walk over the whole village.
   */
  const SHORT = [];
  function shortlist(hx, hy, hz, radius) {
    SHORT.length = 0;
    for (const list of [S.objects, S.blockers]) {
      for (const obj of list) {
        let cx, cy, cz, r;
        if (obj.kind === 'inst') {
          const g = obj.g, i = obj.i;
          if (!Number.isFinite(g.cx[i])) continue;
          cx = g.cx[i]; cy = g.cy[i]; cz = g.cz[i]; r = g.r[i];
        } else if (obj.kind === 'solid') {
          const b = obj.box;
          cx = (b.min.x + b.max.x) / 2; cy = (b.min.y + b.max.y) / 2; cz = (b.min.z + b.max.z) / 2;
          r = obj.r || Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
        } else {
          if (!(obj.r > 0)) continue;
          cx = obj.cx; cy = obj.cy; cz = obj.cz; r = obj.r + (obj.hy || 0);
        }
        const dx = cx - hx, dy = cy - hy, dz = cz - hz, rr = radius + r;
        if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
        SHORT.push(obj);
      }
    }
    return SHORT;
  }

  /**
   * The coarse test is deliberately conservative — a box says "blocked" a little before the triangles do, which
   * is what gives the camera time to step aside BEFORE the boy is actually hidden. `precise` asks the triangles
   * themselves, so the rig can also report the honest truth: was he ever really hidden?
   */
  const HITRUNS = [];
  function preciseHit(obj, lens, to, runs) {
    let dx = to.x - lens.x, dy = to.y - lens.y, dz = to.z - lens.z;
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    const far = len - 0.12;
    if (far <= 0.1) return true;
    V.copy(lens); V3.set(dx / len, dy / len, dz / len);
    try {
      if (obj.kind === 'inst') return rayHitsInstance(obj, V, V3, far);
      if (obj.kind === 'solid') return runsHitRay(runs && runs.length ? runs : obj.runs, V, V3, far);
    } catch (_) { return true; }
    return true;                                   // an actor or a glow card: its sphere IS the test
  }

  function sightBlocked(lens, to, opts = {}) {
    const pad = opts.pad ?? 0.05;
    const wantWorst = !!opts.worst;
    const precise = !!opts.precise;
    // `opaqueOnly` asks the honest question: is anything STILL SOLID in the way? Something the fade is already
    // ghosting at 42% is not hiding him — you can see him through it, which is the whole point of the ghost.
    const solidOnly = !!opts.opaqueOnly;
    const ax = lens.x, ay = lens.y, az = lens.z;
    let dx = to.x - ax, dy = to.y - ay, dz = to.z - az;
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    dx /= len; dy /= len; dz /= len;
    const bx = to.x, by = to.y, bz = to.z;
    const loY = Math.min(ay, by) - pad, hiY = Math.max(ay, by) + pad;
    let worst = null, n = 0;
    const lists = opts.lists || [S.objects, S.blockers];
    for (const list of lists) {
      for (const obj of list) {
        if (obj.kind === 'inst') {
          const g = obj.g, i = obj.i;
          if (!Number.isFinite(g.cx[i])) continue;
          if (solidOnly && obj.alpha < 0.62) continue;
          if (g.cy[i] + g.r[i] < loY || g.cy[i] - g.r[i] > hiY) continue;
          if (!segSphere(ax, ay, az, bx, by, bz, g.cx[i], g.cy[i], g.cz[i], g.r[i] + pad)) continue;
          let hit = !g.parts.length;
          for (const part of g.parts) {
            // the ink hull sits a shaving outside the canopy: 1.04 covers it without inventing a bigger tree
            if (segSphere(ax, ay, az, bx, by, bz, part.cx[i], part.cy[i], part.cz[i], part.r[i] * 1.04 + pad)) { hit = true; break; }
            if (segSphere(ax, ay, az, ax, ay, az, part.cx[i], part.cy[i], part.cz[i], part.r[i] * FADE.lens)) { hit = true; break; }
          }
          if (!hit) continue;
          if (precise && !preciseHit(obj, lens, to)) continue;
          n++;
          if (!worst || g.r[i] > worst.r) worst = { name: obj.name, kind: 'inst', r: g.r[i], big: g.r[i] > 2.2 };
          if (!wantWorst) return worst;
        } else if (obj.kind === 'solid') {
          if (solidOnly && obj.alpha < 0.62) continue;
          if (obj.box.max.y < loY || obj.box.min.y > hiY) continue;
          if (!segBox(ax, ay, az, dx, dy, dz, len, obj.box, pad)) continue;
          let hit = null, inside = false;
          HITRUNS.length = 0;
          for (const it of obj.runs) {
            if (it.box.max.y < loY || it.box.min.y > hiY) continue;
            if (inBox(ax, ay, az, it.box, 0.2)) { hit = it; inside = true; break; }
            if (segBox(ax, ay, az, dx, dy, dz, len, it.box, pad)) { hit = hit || it; HITRUNS.push(it); if (!precise) break; }
          }
          if (!hit) continue;
          if (precise && !inside && !preciseHit(obj, lens, to, HITRUNS)) continue;
          n++;
          const w = Math.max(obj.box.max.x - obj.box.min.x, obj.box.max.z - obj.box.min.z);
          if (!worst || w > worst.r) worst = { name: obj.name, kind: 'solid', r: w, big: w > 3.2 };
          if (!wantWorst) return worst;
        } else {
          if (!(obj.r > 0)) continue;
          const reach = obj.hy ? obj.hy + obj.r : obj.r;
          if (obj.cy + reach < loY || obj.cy - reach > hiY) continue;
          const rr = obj.r + pad + (precise ? 0 : (obj.pad || 0));
          const hit = obj.hy
            ? segCapsule(ax, ay, az, bx, by, bz, obj.cx, obj.cy, obj.cz, rr, obj.hy)
            : segSphere(ax, ay, az, bx, by, bz, obj.cx, obj.cy, obj.cz, rr);
          if (!hit) continue;
          n++;
          if (!worst || obj.r > worst.r) worst = { name: (obj.mesh && obj.mesh.name) || obj.kind, kind: obj.kind, r: obj.r, big: obj.r > 2.2 };
          if (!wantWorst) return worst;
        }
      }
    }
    return worst ? Object.assign(worst, { n }) : null;
  }

  const targetOf = (obj) => ((obj.inside || obj.melt) ? 0 : (obj.hitT > 0 ? FADE.alpha * smooth(FADE.melt, FADE.solid, obj.ramp ?? obj.surf ?? 9) : 1));

  function ease(obj, dt) {
    const target = targetOf(obj);
    if (obj.alpha === target) return;
    const step = dt / ((target < obj.alpha ? FADE.outMs : FADE.inMs) / 1000);
    obj.alpha = clamp(obj.alpha + clamp(target - obj.alpha, -step, step), 0, 1);
    if (Math.abs(target - obj.alpha) < 0.01) obj.alpha = target;
  }

  /** Snap every fade to where it is heading (a camera cut, a teleport, a frozen screenshot). */
  function settle() {
    for (const obj of S.objects) obj.alpha = targetOf(obj);
  }
  const settled = () => !S.objects.some((o) => Math.abs(o.alpha - targetOf(o)) > 0.02);

  // ── carriers: a one-instance stand-in so a single tree can be drawn out of its InstancedMesh ───────────────
  /** How many carriers of each source geometry are already in use this frame (so two ghosts never share one). */
  function carrier(member, needColor, index) {
    const pool = S.carriers.byGeo.get(member.geometry) || [];
    if (!S.carriers.byGeo.has(member.geometry)) S.carriers.byGeo.set(member.geometry, pool);
    let slot = pool.findIndex((k) => !k.userData.camUsed);
    if (slot < 0) slot = pool.length;
    let c = pool[slot];
    const gg = ghostGeometry(member.geometry, slot);
    if (!c) {
      c = new THREE.InstancedMesh(gg.geo, hiddenMaterial(member.material.side), 1);
      c.name = 'camera:ghost';
      c.frustumCulled = false;
      c.matrixAutoUpdate = false;
      c.matrixWorldAutoUpdate = false;
      c.castShadow = false;
      c.userData.camGhost = true;
      c.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array([1, 1, 1]), 3);
      pool[slot] = c;
      S.carriers.all.push(c);
    }
    c.userData.camUsed = true;
    c.geometry = gg.geo;
    c.material = hiddenMaterial(member.material.side);
    c.receiveShadow = member.receiveShadow;
    c.count = 1;
    c.matrixWorld.copy(member.matrixWorld);
    // per-instance attributes (painted cards) come across one instance at a time
    if (gg.inst) {
      for (const k of gg.inst) {
        const src = member.geometry.attributes[k], dst = gg.geo.attributes[k];
        for (let i = 0; i < dst.itemSize; i++) dst.array[i] = src.array[index * src.itemSize + i];
        dst.needsUpdate = true;
      }
    }
    void needColor;
    if (S.scene && c.parent !== S.scene) S.scene.add(c);
    return c;
  }

  // ── hide from the main pass (before the shadow + colour passes) ────────────────────────────────────────────
  function beforeRender(renderer, sc, camera) {
    if (!S.enabled) return;
    try {
      S.ghosts.length = 0;
      S.hiddenInst.length = 0;
      S.hiddenSolid.clear();
      for (const c of S.carriers.all) { c.userData.camUsed = false; c.count = 0; }
      if (!S.fading.length) { neutralise(); return; }
      const order = S.fading.slice().sort((a, b) => b.dist - a.dist);   // far to near: ghosts layer correctly
      let instSlots = 0, ghosts = 0;
      for (const obj of order) {
        const alpha = obj.alpha;
        if (obj.kind === 'inst') {
          const g = obj.g;
          if (instSlots >= FADE.slots) continue;
          const m0 = g.members[0];
          m0.getMatrixAt(obj.i, M);
          V.set(M.elements[12], M.elements[13], M.elements[14]).applyMatrix4(m0.matrixWorld);
          const drawable = alpha > 0.02 && ghosts < FADE.ghosts;
          S.hiddenInst.push({ x: V.x, z: V.z, keep: drawable ? 0 : alpha });     // ghosted -> gone from the main pass
          instSlots++;
          if (!drawable) continue;
          const parts = [];
          for (const member of g.members) {
            if (member.visible === false || !member.material) continue;
            const needColor = !!member.instanceColor;
            const c = carrier(member, needColor, obj.i);
            c.setMatrixAt(0, M);
            c.instanceMatrix.needsUpdate = true;
            if (needColor && c.instanceColor) {
              const src = member.instanceColor;
              c.instanceColor.setXYZ(0, src.getX(obj.i), src.getY(obj.i), src.getZ(obj.i));
              c.instanceColor.needsUpdate = true;
            }
            parts.push({ object: c, geometry: c.geometry, material: member.material, group: null, outline: isOutlinePart(member) });
          }
          if (parts.length) { S.ghosts.push({ parts, alpha }); ghosts++; }
        } else {
          if (alpha > 0.02 && ghosts < FADE.ghosts) {
            const parts = [];
            for (const it of obj.runs) {
              let list = S.hiddenSolid.get(it.mesh);
              if (!list) { list = []; S.hiddenSolid.set(it.mesh, list); }
              list.push({ start: it.run.start, count: it.run.count });
              parts.push({ object: it.mesh, geometry: it.mesh.geometry, material: it.mesh.material, group: { start: it.run.start, count: it.run.count, materialIndex: 0 }, outline: isOutlinePart(it.mesh) });
            }
            if (parts.length) { S.ghosts.push({ parts, alpha }); ghosts++; }
          } else if (alpha <= 0.02) {
            for (const it of obj.runs) {
              let list = S.hiddenSolid.get(it.mesh);
              if (!list) { list = []; S.hiddenSolid.set(it.mesh, list); }
              list.push({ start: it.run.start, count: it.run.count });
            }
          }
        }
      }
      // instanced hides go through Toon.see's fade slots (the depth/shadow pass is not patched: shadows stay)
      neutralise(S.hiddenInst);
      // bucket ranges are hidden with a colour-write-off material group (their shadow is drawn from the same
      // geometry by the shadow pass, so nothing loses its shadow either)
      S.touched.length = 0;
      for (const [mesh, ranges] of S.hiddenSolid) {
        const geo = mesh.geometry;
        const total = geo.index ? geo.index.count : (geo.attributes.position ? geo.attributes.position.count : 0);
        ranges.sort((a, b) => a.start - b.start);
        const merged = [];
        for (const r of ranges) {
          const last = merged[merged.length - 1];
          if (last && r.start <= last.start + last.count) last.count = Math.max(last.count, r.start + r.count - last.start);
          else merged.push({ start: r.start, count: r.count });
        }
        const groups = [];
        let at = 0;
        for (const r of merged) {
          if (r.start > at) groups.push({ start: at, count: r.start - at, materialIndex: 0 });
          groups.push({ start: r.start, count: r.count, materialIndex: 1 });
          at = r.start + r.count;
        }
        if (at < total) groups.push({ start: at, count: total - at, materialIndex: 0 });
        S.touched.push({ mesh, material: mesh.material, groups: geo.groups });
        mesh.material = [mesh.material, hiddenMaterial(mesh.material.side)];
        geo.groups = groups;
      }
    } catch (e) { reportError('camera fade: hide pass', e); restore(); }
  }

  /** Put the meshes back, then draw the ghosts: depth first, then colour at a constant alpha. */
  function afterRender(renderer, sc, camera) {
    if (!S.enabled) return;
    restore();
    S.drawn = 0;
    // our own hide slots must not discard the ghosts as well (the hero window and the near melt stay off)
    if (SEE) { try { SEE.setFades([]); } catch (_) {} }
    try {
      if (S.ghosts.length && renderer && renderer.renderBufferDirect) {
        for (const ghost of S.ghosts) {
          for (const part of ghost.parts) drawPart(renderer, sc, camera, part, 'depth', 1);
          for (const part of ghost.parts) drawPart(renderer, sc, camera, part, 'colour', part.outline ? Math.min(1, ghost.alpha * (FADE.outline / FADE.alpha)) : ghost.alpha);
          S.drawn++;
        }
      }
    } catch (e) { reportError('camera fade: ghost pass', e); }
    unneutralise();
  }

  function drawPart(renderer, sc, camera, part, mode, alpha) {
    const mat = part.material;
    if (!mat) return;
    const save = { blending: mat.blending, blendSrc: mat.blendSrc, blendDst: mat.blendDst, blendAlpha: mat.blendAlpha,
      blendEquation: mat.blendEquation, colorWrite: mat.colorWrite, depthWrite: mat.depthWrite, depthFunc: mat.depthFunc };
    try {
      if (mode === 'depth') { mat.colorWrite = false; mat.depthWrite = true; }
      else {
        mat.colorWrite = true; mat.depthWrite = false;
        mat.blending = THREE.CustomBlending;
        mat.blendEquation = THREE.AddEquation;
        mat.blendSrc = THREE.ConstantAlphaFactor;
        mat.blendDst = THREE.OneMinusConstantAlphaFactor;
        mat.blendAlpha = alpha;
      }
      mat.depthFunc = THREE.LessEqualDepth;
      const obj = part.object;
      obj.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, obj.matrixWorld);
      obj.normalMatrix.getNormalMatrix(obj.modelViewMatrix);
      renderer.renderBufferDirect(camera, sc, part.geometry, mat, obj, part.group || null);
    } catch (e) { reportError('camera fade: draw', e); }
    finally { Object.assign(mat, save); }
  }

  function restore() {
    for (const t of S.touched) {
      try { t.mesh.material = t.material; t.mesh.geometry.groups = t.groups || []; } catch (_) {}
    }
    S.touched.length = 0;
  }

  /** Take over Toon.see's uniforms for the field pass: our own instance hides, no dither window, no near melt. */
  function neutralise(list = null) {
    if (!SEE) return;
    try {
      const U = SEE.uniforms;
      if (!S.saved) S.saved = { hero: U.uDqHero.value.w, near: U.uDqNear.value.clone() };
      SEE.setFades(list || []);
      U.uDqHero.value.w = 0;
      U.uDqNear.value.set(-2, -1);
    } catch (e) { reportError('camera fade: see uniforms', e); }
  }
  function unneutralise() {
    if (!SEE || !S.saved) return;
    try {
      const U = SEE.uniforms;
      SEE.setFades([]);
      U.uDqHero.value.w = S.saved.hero;
      U.uDqNear.value.copy(S.saved.near);
    } catch (_) {}
    S.saved = null;
  }

  // ── attach / detach ────────────────────────────────────────────────────────────────────────────────────────
  function attach(sc) {
    if (S.scene === sc) return;
    detach();
    S.scene = sc || null;
    if (!S.scene) return;
    S.before = S.scene.onBeforeRender;
    S.after = S.scene.onAfterRender;
    const prevB = typeof S.before === 'function' ? S.before : null;
    const prevA = typeof S.after === 'function' ? S.after : null;
    S.scene.onBeforeRender = (renderer, sc2, camera, rt) => {
      if (prevB) { try { prevB(renderer, sc2, camera, rt); } catch (e) { reportError('scene onBeforeRender', e); } }
      beforeRender(renderer, sc2, camera);
    };
    S.scene.onAfterRender = (renderer, sc2, camera) => {
      afterRender(renderer, sc2, camera);
      if (prevA) { try { prevA(renderer, sc2, camera); } catch (e) { reportError('scene onAfterRender', e); } }
    };
    S.installed = S.scene;
    S.kids = -1;
    S.pend = null;
    scan();                                    // a map load is already behind a transition: take the whole census
  }

  function detach() {
    if (S.installed) {
      try {
        S.installed.onBeforeRender = typeof S.before === 'function' ? S.before : (() => {});
        S.installed.onAfterRender = typeof S.after === 'function' ? S.after : (() => {});
      } catch (_) {}
    }
    for (const c of S.carriers.all) { try { c.removeFromParent(); } catch (_) {} }
    S.carriers.all.length = 0;
    S.carriers.byGeo.clear();
    restore();
    unneutralise();
    S.installed = null; S.scene = null; S.objects = []; S.groups = []; S.solids = []; S.blockers = []; S.pend = null;
    S.fading.length = 0; S.ghosts.length = 0; S.hiddenInst.length = 0; S.hiddenSolid.clear();
  }

  /**
   * Once per frame: follow the field's scene, and re-take the census when the scene's contents change — a few
   * milliseconds at a time (the old census stays live until the new one is finished), so a tree LOD swapping
   * tiers mid-orbit can never cost a frame.
   */
  function sync(sc, dt = 0) {
    if (sc !== S.scene) { attach(sc); return; }
    if (!sc) return;
    if (S.pend) { scan(3); return; }
    S.rescanT += dt;
    if (S.rescanT > 0.5) {
      S.rescanT = 0;
      const kids = sc.children.length;
      if (kids !== S.kids) { S.kids = kids; scan(3); }
    }
  }

  return {
    get enabled() { return S.enabled; },
    set enabled(on) {
      const v = !!on;
      if (v === S.enabled) return;
      S.enabled = v;
      if (!v) { restore(); unneutralise(); S.fading.length = 0; S.ghosts.length = 0; for (const c of S.carriers.all) c.count = 0; }
    },
    update, settle, settled, sync, attach, detach,
    /** The sight line: what stands between a lens and a point, off the cached bounds (see sightBlocked). */
    blocked: sightBlocked, shortlist,
    /** What the last tick actually ray-tested, and how many of the five hero rays each object blocked. */
    probe() { return (S.probe || []).slice(0, 12); },
    /**
     * WHY. Every candidate nearest the lens, with the verdict the last tick reached for it and the numbers it
     * reached it from — so "what does the camera think is covering the boy, and what did it decide about the
     * tree it is standing under?" is answerable without reading the code.
     */
    explain(limit = 10) {
      const list = S.objects.filter((o) => Number.isFinite(o.dist)).slice();
      list.sort((a, b) => (a.surf ?? 9e9) - (b.surf ?? 9e9));
      return list.slice(0, Math.max(1, limit | 0)).map((o) => ({
        name: o.name, kind: o.kind, dist: r3(o.dist), surf: r3(o.surf ?? 0), sightSurf: r3(o.ramp ?? o.surf ?? 0),
        segD: o.segD ?? null, verdict: o.why || 'not tested yet', alpha: r3(o.alpha), inside: !!o.inside, melted: !!o.melt,
      }));
    },
    /** Live tuning for A/B work: fade.tune({alpha, outline, outMs, inMs, hold, ghosts}). */
    tune(o = {}) {
      for (const k of FADE_KEYS) if (Number.isFinite(+o[k])) FADE[k] = +o[k];
      return Object.assign({}, FADE);
    },
    list() {
      return S.fading.slice(0, 12).map((o) => ({ name: o.name, alpha: r3(o.alpha), inside: !!o.inside, melted: !!o.melt,
        dist: r3(o.dist), kind: o.kind, ghost: true, surf: r3(o.surf ?? 0) }));
    },
    /** Every candidate the pass knows about, biggest first: what a demo or a critic can walk behind. */
    objects(limit = 40) {
      const out = [];
      for (const o of S.objects) {
        if (o.kind === 'inst') {
          const g = o.g, i = o.i;
          if (!Number.isFinite(g.cx[i])) continue;
          out.push({ name: o.name, kind: 'inst', ghost: true, x: r3(g.cx[i]), y: r3(g.cy[i]), z: r3(g.cz[i]),
            r: r3(g.r[i]), h: r3(g.r[i] * 2), alpha: r3(o.alpha) });
        } else {
          const b = o.box;
          out.push({ name: o.name, kind: 'solid', ghost: true, x: r3((b.min.x + b.max.x) / 2), y: r3((b.min.y + b.max.y) / 2),
            z: r3((b.min.z + b.max.z) / 2), r: r3(Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) / 2),
            h: r3(b.max.y - b.min.y), w: r3(Math.max(b.max.x - b.min.x, b.max.z - b.min.z)),
            runs: o.runs.length, alpha: r3(o.alpha) });
        }
      }
      out.sort((a, b) => b.r - a.r);
      return out.slice(0, Math.max(1, limit | 0));
    },
    state() {
      return { on: S.enabled, objects: S.objects.length, instances: S.objects.length - S.solids.length, groups: S.groups.length, pieces: S.solids.length,
        blockers: S.blockers.length, scanning: !!S.pend, scanFrames: S.scanFrames, runs: S.runs || 0, heavy: S.heavy || [],
        tested: S.tested, occluding: S.occluding, fading: S.fading.length, ghosts: S.drawn, hidden: S.hiddenInst.length + S.hiddenSolid.size,
        alpha: FADE.alpha, ms: S.ms, scanMs: S.scanMs, scene: S.scene ? (S.scene.name || 'scene') : null };
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// The field camera
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const ORBIT_SPEED = 118 * DEG;      // manual orbit, radians / second
const BEHIND_RATE = 1.5;            // ease-behind spring rate
const BEHIND_CAP = 42 * DEG;        // ... never faster than this
const RECENTRE_RATE = 1.1;
const RECENTRE_CAP = 55 * DEG;
const MANUAL_HOLD = 2.2;            // no automatic swing for this long after a manual orbit

/**
 * ── KEEPING THE BOY ────────────────────────────────────────────────────────────────────────────────────────────
 * "When a roof would come between, the camera slides along the wall and keeps him." That is the DQV field camera,
 * and it is a HARD GUARANTEE here, not a courtesy: every tick, after the fade has decided what to ghost, the rig
 * asks whether a straight line from the lens to the boy's chest is clear. If it is not, it looks for the NEAREST
 * pose that is — first by sliding the boom round him (a few degrees for a fence post, forty for a cottage), then,
 * only if no slide works, by lifting the boom over the obstruction. It never dollies in: the boom length is the
 * map's composition and nothing in the way is allowed to change it.
 *
 * The slide goes into the CAMERA, not into the walk frame (the same trick as the ease-behind swing: it is added
 * to `drift` while a direction is held), so a boy walking a straight line keeps walking a straight line while the
 * lens steps round the corner of the house.
 */
const DODGE = ({
  max: 88 * DEG,       // how far round the boom may slide before it gives up and lets the fade have it
  maxManual: 30 * DEG,  // ... and much less while the PLAYER is orbiting: a view you asked for is a view you get,
                        //     and whatever is left in the way is the fade's job, not an argument with the stick
  step: 6 * DEG,        // the search grid
  // The CLIMB is small on purpose, and measured as a FRACTION OF THE BOOM: a lens that rises far enough to see
  // over a roof is no longer the shot the map composed (a 1.8-unit climb on a 6-unit boom measured the boy at
  // 14.6% of frame height instead of 20 — worse than the framing gap this piece already closed). So the
  // guarantee climbs a little and slides a lot; past that, the fade has it.
  lifts: [0, 0.06, 0.12],
  liftCost: 150,        // degrees-equivalent per unit of climb (a fraction of the boom): sliding wins
  stick: 0.42,          // ... and staying where we already are is preferred to either (no flip-flopping)
  hold: 0.35,           // hold a slide this long after the way is clear, so a doorway cannot strobe
  rateIn: 10.0,         // spring rate while he is hidden (fast: he must come back NOW)
  rateOut: 3.6,         // ... and coming home (gentle: a view that settles, not a snap)
  capIn: 300 * DEG,     // never faster than this, even hidden — a slide is a camera move, not a cut
  capOut: 85 * DEG,
  chest: 0.62,          // the aiming point on the boy, as a fraction of his height
  pad: 0.3,             // the warning margin: the camera steps aside before the wall really covers him
  budget: 230,          // at most this many sight tests a tick (two per pose: now, and when it lands)
  look: 0.32,           // seconds of look-ahead: where the boy and the boom will be when the slide lands
  lookYaw: 0.88,        // ... and where the yaw spring will have reached by then
});
/** Every pose the guarantee may consider, cheapest first: a magnitude of slide and a climb. Built once. */
const RINGS = (() => {
  const out = [];
  for (let m = 0; m * DODGE.step <= DODGE.max + 1e-6; m++) {
    for (const lift of DODGE.lifts) out.push({ mag: m * DODGE.step, lift, cost: m * (DODGE.step / DEG) + lift * DODGE.liftCost });
  }
  out.sort((a, b) => a.cost - b.cost);
  return out;
})();

let FieldMod = null;                // src/world/field.js, imported lazily (only to find the scene being drawn)
function fieldWorld(rig) {
  try {
    if (!FieldMod) {
      import('./field.js').then((m) => { FieldMod = m; }, () => { FieldMod = { Field: null }; });
      return null;
    }
    const F = FieldMod.Field;
    if (!F || typeof F.world !== 'function') return null;
    const w = F.world();
    if (!w || w.cameraRig !== rig) return null;      // only the field's own rig fades the field's own scene
    return w;
  } catch (_) { return null; }
}
function fieldScene(rig) { const w = fieldWorld(rig); return w ? (w.scene || null) : null; }
/** The hero's own model root — never an occluder of himself, and never something to slide around. */
function fieldHeroGroup(rig) {
  const w = fieldWorld(rig);
  return (w && w.player && w.player.hero && w.player.hero.group) || null;
}
/** The real hero's model height, so the composer frames whoever P07 actually built (fallback: a six-year-old). */
function fieldHeroHeight(rig) {
  const w = fieldWorld(rig);
  const h = w && w.player && w.player.hero ? +w.player.hero.height : NaN;
  return Number.isFinite(h) && h > 0.4 && h < 4 ? h : 0;
}

export function createFieldCamera({ focus = () => null, map = () => null, talking = () => false, scene = null } = {}) {
  // sim state (c) and the previous tick (pc) for render interpolation
  const c = {
    yaw: 0, yawT: 0, yawCtl: 0, drift: 0, orbVel: 0,
    pitch: CAM_DEFAULT.pitch, pitchT: CAM_DEFAULT.pitch, dist: CAM_DEFAULT.dist, distT: CAM_DEFAULT.dist, base: CAM_DEFAULT.dist,
    fov: CAM_DEFAULT.fov, fovT: CAM_DEFAULT.fov, lookUp: CAM_DEFAULT.lookUp, lookUpT: CAM_DEFAULT.lookUp,
    tx: 0, ty: 0, tz: 0, vx: 0, vy: 0, vz: 0,
    lx: 0, lz: 0,                                   // the lead (spring, world units)
    lift: 0, liftT: 0,
    manualT: 99, moveT: 0, stillT: 99, walked: 0, auto: true, talk: 0, swing: 0, mode: 'field',
    pose: null, talkPose: null, installed: null, solvedFor: null, resolveT: 0,
    dodge: 0, dodgeT: 0, over: 0, overT: 0, clearT: 9, hvx: 0, hvz: 0, hpx: undefined, hpz: undefined, yawTv: 0, yawTp: undefined,
  };
  const pc = { yaw: 0, tx: 0, ty: 0, tz: 0, dist: CAM_DEFAULT.dist, talk: 0, lift: 0, lx: 0, lz: 0, pitch: c.pitch, fov: c.fov, lookUp: c.lookUp, shotT: 0, dodge: 0, over: 0 };
  /** What the sight guarantee did this tick (state().field.camera.keep, and __DQ.cameraSight()). */
  const KEEP = { on: true, blocked: false, blockedBy: null, slide: 0, lift: 0, tests: 0, ms: 0, solved: true, hiddenTicks: 0, ticks: 0 };
  let camera = null;
  let modeDef = CAM_MODES.field;

  /** The cutscene camera. Positions are world points; a held shot keeps its pose until release(). */
  const SHOT = { active: false, t: 0, dur: 0, ease: EASES.inOut, from: null, to: null, look0: null, look1: null,
    lookHero: false, fov0: null, fov1: null, hold: true, done: false, resolve: null, rel: 0, relT: 0, pose: null };

  const heroPos = () => {
    const p = focus() || { x: 0, y: 0, z: 0 };
    return { x: p.x, y: p.y, z: p.z };
  };
  /** How tall the thing we are framing actually is (P07's Bram, when he is built; else a six-year-old). */
  let heroH = 0;
  const heroHeight = () => {
    if (!heroH) heroH = fieldHeroHeight(rig) || 0;
    return heroH || 1.35;
  };

  const goal = () => {
    const p = focus() || { x: 0, y: 0, z: 0, vx: 0, vz: 0 };
    return { x: p.x + c.lx, y: p.y, z: p.z + c.lz };
  };

  const lensAt = (yaw, pitchDeg, dist, tx, ty, tz, lift) => {
    const ph = pitchDeg * DEG;
    return {
      x: tx + Math.sin(yaw) * Math.cos(ph) * dist,
      y: ty + Math.sin(ph) * dist + 0.5 + lift,
      z: tz + Math.cos(yaw) * Math.cos(ph) * dist,
    };
  };

  const remember = () => Object.assign(pc, { yaw: c.yaw, tx: c.tx, ty: c.ty, tz: c.tz, dist: c.dist, talk: c.talk,
    lift: c.lift, lx: c.lx, lz: c.lz, pitch: c.pitch, fov: c.fov, lookUp: c.lookUp, shotT: SHOT.t,
    dodge: c.dodge, over: c.over });

  const fade = createFadePass({ hero: () => fieldHeroGroup(rig) });

  /** Ground clearance + sight line: the lens stays out of the hill, and climbs a rise that would hide him. */
  function clearance(yaw, pitchDeg, dist, g) {
    const m = map();
    if (!m || typeof m.heightAt !== 'function') return 0;
    const floor = modeDef.floor ?? 0.85;
    const L = lensAt(yaw, pitchDeg, dist, g.x, g.y, g.z, 0);
    let need = 0;
    try {
      need = Math.max(need, m.heightAt(L.x, L.z) + floor - L.y);
      const ty = g.y + 1.0;
      for (const u of [0.35, 0.6, 0.82]) {
        const sx = lerp(L.x, g.x, u), sz = lerp(L.z, g.z, u), sy = lerp(L.y, ty, u);
        const h = m.heightAt(sx, sz) + 0.3;
        if (sy < h) need = Math.max(need, (h - sy) / Math.max(0.2, 1 - u));
      }
    } catch (e) { reportError('camera clearance', e); }
    return clamp(need, 0, 7);
  }

  /** Where the lens really is: the boom plus whatever slide and climb the sight guarantee is holding. */
  const camYaw = () => wrapPi(c.yaw + c.dodge);
  const camLift = () => c.lift + c.over * c.dist;
  /** The point on the boy the lens must be able to see: his chest, the same point a critic's probe aims at. */
  const chestOf = (p) => ({ x: p.x, y: p.y + heroHeight() * DODGE.chest, z: p.z });
  /** Ground clearance for a pose the camera has NOT taken (the full sight-line version is clearance()). */
  function groundLift(yaw, pitchDeg, dist, g) {
    const m = map();
    if (!m || typeof m.heightAt !== 'function') return 0;
    const L = lensAt(yaw, pitchDeg, dist, g.x, g.y, g.z, 0);
    try { return clamp(m.heightAt(L.x, L.z) + (modeDef.floor ?? 0.85) - L.y, 0, 7); } catch (_) { return 0; }
  }

  /**
   * THE SIGHT GUARANTEE — run every tick, after the fade has decided what to ghost.
   * Ray from the lens to the boy's chest; if anything opaque is in the way, find the CHEAPEST pose that is clear
   * (slide round him first, climb only if no slide works) and ease the boom there on its own spring. The boom
   * length never changes: this is a slide and a lift, never a dolly in.
   */
  function keepHero(dt, snap = false) {
    KEEP.ticks++;
    const finish = () => {
      if (snap) { c.dodge = c.dodgeT; c.over = c.overT; return 0; }
      const blocked = KEEP.blocked;
      const rate = blocked ? DODGE.rateIn : DODGE.rateOut;
      const cap = (blocked ? DODGE.capIn : DODGE.capOut) * dt;
      const d = wrapPi(c.dodgeT - c.dodge);
      const step = clamp(d * (1 - Math.exp(-dt * rate)), -cap, cap);
      c.dodge = wrapPi(c.dodge + step);
      const dl = c.overT - c.over;
      c.over = clamp(c.over + clamp(dl * (1 - Math.exp(-dt * (dl > 0 ? 8 : 2.6))), -0.9 * dt, 1.2 * dt), 0, 0.2);
      return step;
    };
    if (!KEEP.on || SHOT.active || SHOT.rel > 0 || !fade.blocked) {
      c.dodgeT = 0; c.overT = 0; KEEP.blocked = false; KEEP.blockedBy = null; KEEP.slide = 0; KEEP.lift = 0;
      return finish();
    }
    const t0 = performance.now();
    let step = 0;
    try {
      const p = heroPos();
      const chest = chestOf(p);
      const g = { x: c.tx, y: c.ty, z: c.tz };
      // LOOK AHEAD. The lens takes about a quarter of a second to slide round a corner, so the question is not
      // "is he hidden now" but "will he be hidden by the time I could have moved" — the test is run against
      // where the boy, the boom and the orbit will all be in DODGE.look seconds. That is what turns a camera
      // that catches up after he disappears into one that is already stepping aside as the roof comes round.
      // It runs off his MEASURED velocity, not the one he is asking for: a boy pressed against a wall (or
      // against the villager who is covering him) still reports a full walking speed, and predicting from that
      // sent the camera hunting a clear line to a place he was never going to reach.
      if (dt > 0) {
        const mvx = (p.x - (c.hpx ?? p.x)) / dt, mvz = (p.z - (c.hpz ?? p.z)) / dt;
        c.hvx += (mvx - c.hvx) * 0.4; c.hvz += (mvz - c.hvz) * 0.4;
      }
      c.hpx = p.x; c.hpz = p.z;
      const av = DODGE.look;
      const ax = c.hvx * av, az = c.hvz * av;
      const gA = { x: c.tx + ax, y: c.ty, z: c.tz + az };
      const chestA = { x: chest.x + ax, y: chest.y, z: chest.z + az };
      // ... and the same for the ORBIT: while the player is swinging the view round (or the ease-behind is),
      // the boom is aimed at where the orbit will be, not where it is
      if (dt > 0) {
        const tv = wrapPi(c.yawT - (c.yawTp ?? c.yawT)) / dt;
        c.yawTv += (clamp(tv, -6, 6) - c.yawTv) * 0.4;
      }
      c.yawTp = c.yawT;
      const base = wrapPi(c.yaw + wrapPi(wrapPi(c.yawT + c.yawTv * av) - c.yaw) * DODGE.lookYaw);
      const short = fade.shortlist(p.x + ax * 0.5, p.y + heroHeight() * 0.5, p.z + az * 0.5, c.dist + 4.2);
      const LISTS = [short];
      let tests = 0;
      const poseAt = (off, extra, now = false) => {
        const yaw = wrapPi((now ? c.yaw : base) + off);
        const G = now ? g : gA;
        const lift = Math.max(c.lift, groundLift(yaw, c.pitch, c.dist, G)) + extra * c.dist;
        return lensAt(yaw, c.pitch, c.dist, G.x, G.y, G.z, lift);
      };
      // A pose only counts as clear if it is clear NOW **and** still clear when the slide would land there:
      // during a 360 orbit the two are twenty-odd degrees apart, and a camera that only checked one of them
      // would step neatly behind the tree it was trying to avoid.
      const OPT = { pad: DODGE.pad, lists: LISTS };
      const tryPose = (off, extra) => {
        tests += 2;
        return fade.blocked(poseAt(off, extra, true), chest, OPT) || fade.blocked(poseAt(off, extra), chestA, OPT);
      };
      // the coarse test is the EARLY WARNING (it fires a shade before the triangles really cover him, which is
      // what buys the camera time to step aside); the precise one is the honest tally of whether he was ever
      // actually hidden, which is the number this whole piece is judged on
      const here = tryPose(c.dodge, c.over);              // is the way clear from where the lens IS right now?
      KEEP.blocked = !!here;
      KEEP.blockedBy = here ? here.name : null;
      if (here) {
        const real = fade.blocked(poseAt(c.dodge, c.over, true), chest, { pad: 0, lists: LISTS, precise: true, opaqueOnly: true });
        if (real) { KEEP.hiddenTicks++; KEEP.hiddenBy = real.name; } else KEEP.hiddenBy = null;
      }
      let best = null;
      const sign = c.dodgeT >= 0 ? 1 : -1;
      const lim = (c.manualT < 0.8 ? DODGE.maxManual : DODGE.max) + 1e-6;
      for (const r of RINGS) {
        if (best || tests >= DODGE.budget) break;
        if (r.mag > lim) continue;
        for (const s of (r.mag === 0 ? [0] : [sign, -sign])) {
          if (!tryPose(r.mag * s, r.lift)) { best = { off: r.mag * s, lift: r.lift }; break; }
          if (tests >= DODGE.budget) break;
        }
      }
      KEEP.solved = !!best;
      KEEP.tests = tests;
      if (best) {
        // a way through is clear: hold the slide we have for a beat before coming home, so a doorway or a
        // passing villager cannot make the camera strobe back and forth
        if (best.off === 0 && best.lift === 0 && (Math.abs(c.dodgeT) > 1e-3 || c.overT > 1e-3)) {
          c.clearT += dt;
          if (c.clearT > DODGE.hold) { c.dodgeT = 0; c.overT = 0; }
        } else {
          const lim = c.manualT < 0.8 ? DODGE.maxManual : DODGE.max;
          c.clearT = 0; c.dodgeT = clamp(best.off, -lim, lim); c.overT = best.lift;
        }
      }
      // else: nothing in reach is clear — keep the slide we have and let the fade ghost what is left
      KEEP.slide = r3(c.dodgeT / DEG); KEEP.lift = r3(c.overT * c.dist);
    } catch (e) { reportError('camera sight guarantee', e); KEEP.on = false; }
    step = finish();
    KEEP.ms = Math.round((performance.now() - t0) * 100) / 100;
    return step;
  }

  /**
   * THE LIVE MAP'S OWN FRAMING — `def.camera` on the map that is loaded RIGHT NOW (src/world/maps/<id>.js).
   * The rig reads it on every mode change instead of keeping a private copy, so a map edited under a running
   * game (P23 rebuilding Puddlewick) reframes at once, and `cameraMode(...)` can never fall back to a hardcoded
   * table while a map is asking for something else (P09 gap #1).
   */
  function liveMapCam() {
    try {
      const m = map();
      const d = m && m.def && m.def.camera;
      return d && typeof d === 'object' ? d : null;
    } catch (_) { return null; }
  }

  /**
   * Install a mode's composition. The MAP owns `orbit`, `mode`, `fov`, the ground angle `pitch`, and optionally
   * its own `frame` / `talk` composition targets; the rig solves the boom and the look point for the hero P07
   * actually built. (A map's `dist` / `lookUp` are read as the composition's fallback only — the boom is solved,
   * because the boy's height decides it: the same 10.5 that framed the old 1.6-unit placeholder left P07's
   * 1.11-unit six-year-old reading at 13% of frame height.)
   *
   * Where `def` comes from, in order:
   *   1. the block the caller passed (field.js on map load: `configure(def.camera)`)
   *   2. the LIVE map's own camera block, when the mode asked for is the map's own mode
   *      -> `cameraMode('interior')` then `cameraMode('field')` comes back to THIS map's framing, not a preset
   *   3. otherwise, the live map's LENS only (its fov): the ground angle and the composition belong to the mode
   *      being asked for, because the map authored its pitch for its own kind of place
   * `remember` records which mode the map installed, so step 2 knows what "the map's own mode" is.
   */
  function applyMode(name, def = null, remember = false) {
    const key = CAM_MODES[name] ? name : 'field';
    const live = liveMapCam();
    const installedMode = c.installed ? c.installed.mode : null;
    const isInstalled = !def && (installedMode === key || (!installedMode && key === 'field'));
    const lens = live && Number.isFinite(+live.fov) ? { fov: +live.fov } : {};
    const d = def || (isInstalled ? (live || (c.installed && c.installed.def) || {}) : lens) || {};
    c.mode = key;
    modeDef = CAM_MODES[key];
    const h = heroHeight();
    // the map owns the LENS. (Map camera blocks were authored against the old framing scale, so a map-supplied
    // fov keeps its normalisation — meadow's 50 is the 47 the owner-approved frames were composed with.)
    const fov = clamp(Number.isFinite(+d.fov) ? +d.fov * FRAME.fovScale : modeDef.fov, FRAME.minFov, FRAME.maxFov);
    // a map may state the composition itself: camera.frame = {hero, horizon | feet}
    const want = Object.assign({}, modeDef.frame, (d.frame && typeof d.frame === 'object') ? d.frame : null);
    // The GROUND ANGLE is the map's (26° in the owner-approved field-opening frame). It is only solved for when
    // a composition states all three of hero / feet / horizon, which no built-in mode does.
    const pitch = Number.isFinite(+d.pitch) ? clamp(+d.pitch, FRAME.minPitch, FRAME.maxPitch) : modeDef.pitch;
    const pose = compose(pitch, fov, h, want);
    const talkWant = Object.assign({}, modeDef.talk, (d.talk && typeof d.talk === 'object') ? d.talk : null);
    const talkPose = compose(Number.isFinite(+talkWant.pitch) ? +talkWant.pitch : pose.pitch + 5, fov, h, talkWant);
    c.pose = pose; c.talkPose = talkPose;
    c.pitchT = pose.pitch;
    c.base = pose.dist;
    c.distT = pose.dist;
    c.fovT = pose.fov;
    c.lookUpT = pose.lookUp;
    c.solvedFor = { h, mode: key, fov, want, pitch, talkWant };
    if (remember) c.installed = { mode: key, def: Object.assign({}, d) };
    return { mode: key, pitch: r3(c.pitchT), dist: r3(c.distT), fov: r3(c.fovT), lookUp: r3(c.lookUpT),
      frame: { hero: r3(pose.measured.hero), feet: r3(pose.measured.feet), horizon: r3(pose.measured.horizon) } };
  }

  /** Re-solve the look point for a boom length someone else chose (a debug zoom): the horizon stays put. */
  function recompose(dist) {
    const s = c.solvedFor;
    if (!s) return;
    c.lookUpT = solveLookUp(c.pitchT, dist, c.fovT, s.h, s.want);
  }

  /** The hero model loads asynchronously — re-solve once it reports its real height (the springs ease there). */
  function resolveIfHeroChanged() {
    const s = c.solvedFor;
    if (!s) return false;
    const h = fieldHeroHeight(rig);
    if (!h || Math.abs(h - s.h) < 0.01) return false;
    heroH = h;
    c.resolves = (c.resolves || 0) + 1;
    const keepZoom = Math.abs(c.distT - c.base) > 0.05 ? c.distT : 0;
    applyMode(c.mode);                         // re-reads the live map's framing (see applyMode)
    if (keepZoom) { c.distT = keepZoom; recompose(keepZoom); }
    return true;
  }

  const rig = {
    /** sim state — read-only for everyone but this module (exposed for describe/debug) */
    c, prev: pc, fade,
    get camera() {
      if (!camera) camera = new THREE.PerspectiveCamera(c.fov, App.aspect(), 0.3, 1400);
      return camera;
    },
    /** The frame the PLAYER walks in (see the header: the ease-behind swing is not fed back while a key is held). */
    get yaw() { return c.yawCtl; },
    get camYaw() { return camYaw(); },
    get auto() { return c.auto; },
    set auto(on) { c.auto = !!on; },

    resize() { if (camera) { camera.aspect = App.aspect(); camera.updateProjectionMatrix(); } },

    /**
     * Where the springs are heading this tick: the installed composition, stepped toward the conversation beat
     * by however much of a conversation is on screen. (`distTarget` in describe() reports this, so
     * dist == distTarget stays the promise that the camera never zooms to dodge an occluder.)
     */
    goalPose() {
      const k = c.talk, tp = c.talkPose;
      if (!k || !tp) return { dist: c.distT, pitch: c.pitchT, fov: c.fovT, lookUp: c.lookUpT };
      const zoom = c.base > 0.01 ? clamp(c.distT / c.base, 0.35, 3) : 1;
      return { dist: lerp(c.distT, tp.dist * zoom, k), pitch: lerp(c.pitchT, tp.pitch, k),
        fov: lerp(c.fovT, tp.fov, k), lookUp: lerp(c.lookUpT, tp.lookUp, k) };
    },

    /** Apply a map's camera block over its kind's mode. Unless keepYaw, the orbit comes from the map too. */
    configure(def, keepYaw = false) {
      const m = map();
      const d = def || {};
      const kind = (d.mode && CAM_MODES[d.mode]) ? d.mode : MODE_OF_KIND[(m && m.kind) || 'field'] || 'field';
      heroH = fieldHeroHeight(rig) || heroH;
      const out = applyMode(kind, d, true);
      c.pitch = c.pitchT; c.dist = c.distT; c.fov = c.fovT; c.lookUp = c.lookUpT;
      c.yaw = c.yawT = c.yawCtl = (keepYaw ? c.yaw : wrapPi((Number.isFinite(+d.orbit) ? +d.orbit : 0) * DEG));
      c.drift = 0; c.lx = 0; c.lz = 0; c.lift = c.liftT = 0; c.manualT = 99; c.walked = 0; c.stillT = 99;
      c.dodge = c.dodgeT = 0; c.over = c.overT = 0; c.clearT = 9;
      rig.cut();
      return Object.assign({ orbit: deg360(c.yawT) }, out);
    },

    snap() {
      const g = goal(), gp = rig.goalPose();
      c.tx = g.x; c.ty = g.y; c.tz = g.z; c.vx = c.vy = c.vz = 0; c.yaw = c.yawT;
      c.dist = gp.dist; c.pitch = gp.pitch; c.fov = gp.fov; c.lookUp = gp.lookUp;
      c.lx = 0; c.lz = 0; c.drift = 0; c.dodge = c.dodgeT = 0; c.over = c.overT = 0; c.clearT = 9;
      c.yawCtl = c.yaw;
      c.liftT = clearance(c.yaw, c.pitch, c.dist, g);
      c.lift = c.liftT;
      rig.settleFade();
      keepHero(1 / 60, true);              // arrive already looking at him, even if we arrive behind a wall
      c.liftT = clearance(camYaw(), c.pitch, c.dist, g);
      c.lift = c.liftT;
      c.yawCtl = camYaw();
      remember();
      rig.settleFade();
    },

    /** Run the occluder test once with the current pose and finish every fade (clean frozen screenshots). */
    settleFade() {
      try {
        fade.sync(scene ? scene() : fieldScene(rig), 0);
        const L = lensAt(camYaw(), c.pitch, c.dist, c.tx, c.ty, c.tz, camLift());
        fade.update(1 / 60, L, heroPos(), camYaw());
        fade.settle();
      } catch (e) { reportError('camera settleFade', e); }
    },

    update(dt) {
      remember();
      // ── the cutscene camera runs instead of the follow rig (the follow springs keep tracking underneath) ──
      if (SHOT.active) {
        SHOT.t += dt;
        if (SHOT.t >= SHOT.dur && !SHOT.done) {
          SHOT.done = true;
          const r = SHOT.resolve; SHOT.resolve = null;
          if (r) { try { r({ ok: true, held: !!SHOT.hold }); } catch (_) {} }
          if (!SHOT.hold) rig.release(0.8);
        }
      } else if (SHOT.rel > 0) {
        SHOT.relT += dt;
        if (SHOT.relT >= SHOT.rel) { SHOT.rel = 0; SHOT.relT = 0; SHOT.pose = null; }
      }

      // ── orbit (right stick / L1-R1 / Q-E), eased in and out ──
      let look = { x: 0, y: 0 };
      try { look = Input.look(); } catch (_) { look = { x: 0, y: 0 }; }
      const wantVel = SHOT.active ? 0 : -clamp(look.x, -1, 1) * ORBIT_SPEED;
      c.orbVel += (wantVel - c.orbVel) * (1 - Math.exp(-dt * (wantVel === 0 ? 16 : 11)));
      if (Math.abs(c.orbVel) < 1e-3) c.orbVel = 0;
      let manual = 0;
      if (Math.abs(wantVel) > 1e-3) c.manualT = 0; else c.manualT += dt;
      if (c.orbVel !== 0) { manual = c.orbVel * dt; c.yawT = wrapPi(c.yawT + manual); c.walked = 0; }

      // ── how he is moving ──
      const p = focus();
      const moving = !!p && p.speed > 0.8;
      if (moving) { c.moveT += dt; c.stillT = 0; c.walked = Math.min(3, c.walked + dt); }
      else { c.moveT = 0; c.stillT += dt; }

      // ── ease behind him while he walks, and recentre after a pause ──
      let swing = 0;
      if (p && c.auto && !SHOT.active && c.manualT > MANUAL_HOLD) {
        if (moving && c.moveT > 0.3 && p.speed > 0.01) {
          const hx = p.vx / p.speed, hz = p.vz / p.speed;
          const behind = Math.atan2(-hx, -hz);
          const d = wrapPi(behind - c.yawT), ad = Math.abs(d);
          const gate = 1 - smooth(100 * DEG, 140 * DEG, ad);          // never swing while he walks AT the lens
          const spd = Math.min(1, p.speed / RUN_SPEED);
          const rate = BEHIND_RATE * (modeDef.behind ?? 1) * gate * (0.45 + 0.55 * spd) * smooth(0.3, 0.75, c.moveT);
          if (ad > 2.5 * DEG && rate > 0) {
            const cap = BEHIND_CAP * dt;
            swing = clamp(d * (1 - Math.exp(-dt * rate)), -cap, cap);
            c.yawT = wrapPi(c.yawT + swing);
          }
        } else if (!moving && c.stillT > 1.1 && c.walked > 0.5) {
          const behind = wrapPi(p.yaw + Math.PI);
          const d = wrapPi(behind - c.yawT), ad = Math.abs(d);
          if (ad > 4 * DEG && ad < 120 * DEG) {
            const cap = RECENTRE_CAP * dt;
            swing = clamp(d * (1 - Math.exp(-dt * RECENTRE_RATE * (modeDef.behind ?? 1))), -cap, cap);
            c.yawT = wrapPi(c.yawT + swing);
          }
        }
      }
      c.swing = swing / Math.max(1e-6, dt);

      // ── yaw spring ──
      c.yawT = wrapPi(c.yawT);
      c.yaw = wrapPi(c.yaw + wrapPi(c.yawT - c.yaw) * (1 - Math.exp(-dt * 7.5)));

      // ── A CONVERSATION IS A CAMERA BEAT: the lens steps in and up for the line, and steps back after ──
      const t = !!talking();
      c.talk += ((t ? 1 : 0) - c.talk) * (1 - Math.exp(-dt * (t ? 4 : 3)));
      if (c.talk < 0.002) c.talk = 0;
      if (c.talk > 0.998) c.talk = 1;

      // ── the hero model loads asynchronously; re-solve the composition once it reports its real height ──
      c.resolveT += dt;
      if (c.resolveT > 0.1) { c.resolveT = 0; try { resolveIfHeroChanged(); } catch (e) { reportError('camera recompose', e); } }

      // ── distance / pitch / lens springs (a zoom request, a mode change or the talk beat; NEVER an occluder) ──
      const g0 = rig.goalPose();
      c.dist += (g0.dist - c.dist) * (1 - Math.exp(-dt * 6));
      c.pitch += (g0.pitch - c.pitch) * (1 - Math.exp(-dt * 4));
      c.fov += (g0.fov - c.fov) * (1 - Math.exp(-dt * 4));
      c.lookUp += (g0.lookUp - c.lookUp) * (1 - Math.exp(-dt * 4));

      // ── the lead: the look point runs ahead of him, on its own spring so starting and stopping never lurch ──
      if (p) {
        const k = (modeDef.lead ?? 1) * 0.3;
        // the lead is a fraction of the SHOT, not a fixed distance: on the short DQV boom (≈6 units) a 1.7-unit
        // lead would swing him a fifth of the way off centre, which reads as the camera wandering off the boy
        const cap = clamp(c.dist * 0.22, 0.8, 1.7);
        const wantX = clamp(p.vx * k, -cap, cap), wantZ = clamp(p.vz * k, -cap, cap);
        const kk = 1 - Math.exp(-dt * 3.2);
        c.lx += (wantX - c.lx) * kk; c.lz += (wantZ - c.lz) * kk;
      }

      // ── critically damped spring on the look target ──
      const g = goal(), w = 6.0, kk = w * w, dd = 2 * w;
      for (const [pk, vk, gk] of [['tx', 'vx', 'x'], ['ty', 'vy', 'y'], ['tz', 'vz', 'z']]) {
        const a = (g[gk] - c[pk]) * kk - c[vk] * dd;
        c[vk] += a * dt; c[pk] += c[vk] * dt;
      }

      // ── ground clearance and sight line, on a spring (fast up, gentle down) ──
      c.liftT = SHOT.active ? 0 : clearance(camYaw(), c.pitch, c.dist, { x: c.tx, y: c.ty, z: c.tz });
      c.lift += (c.liftT - c.lift) * (1 - Math.exp(-dt * (c.liftT > c.lift ? 9 : 3.5)));

      // ── who is covering the hero? (sim-time, so freeze and advance stay deterministic) ──
      try {
        fade.sync(scene ? scene() : fieldScene(rig), dt);
        const pose = SHOT.pose && (SHOT.active || SHOT.rel > 0) ? SHOT.pose : null;
        const L = pose ? { x: pose.px, y: pose.py, z: pose.pz } : lensAt(camYaw(), c.pitch, c.dist, c.tx, c.ty, c.tz, camLift());
        fade.update(dt, L, heroPos(), camYaw());
      } catch (e) { reportError('camera fade update', e); }

      // ── AND THEN: KEEP THE BOY. Whatever is still in the way, slide the boom round it (never a dolly in) ──
      const slid = keepHero(dt);

      // ── the walk frame: manual orbit moves it; the ease-behind swing and the slide do not, while a direction
      //    is held (so a boy walking a straight line keeps walking a straight line while the lens steps round) ──
      let stick = 0;
      try { const ax = Input.axis(); stick = Math.hypot(ax.x, ax.y); } catch (_) { stick = 0; }
      const held = stick > 0.15 || moving;
      if (!held) c.drift = 0;
      else if (swing || slid) c.drift = clamp(c.drift + swing + slid, -150 * DEG, 150 * DEG);
      c.yawCtl = wrapPi(camYaw() - c.drift);
      if (Math.abs(wrapPi(camYaw() - c.yawCtl)) > 150 * DEG) { c.drift = 0; c.yawCtl = camYaw(); }
    },

    place(alpha) {
      const cam = rig.camera;
      const tx = pc.tx + (c.tx - pc.tx) * alpha, ty = pc.ty + (c.ty - pc.ty) * alpha, tz = pc.tz + (c.tz - pc.tz) * alpha;
      const yaw = wrapPi(pc.yaw + wrapPi(c.yaw - pc.yaw) * alpha + pc.dodge + wrapPi(c.dodge - pc.dodge) * alpha);
      const dist = pc.dist + (c.dist - pc.dist) * alpha;
      const pitch = pc.pitch + (c.pitch - pc.pitch) * alpha;
      const fov = pc.fov + (c.fov - pc.fov) * alpha;
      const lift = pc.lift + (c.lift - pc.lift) * alpha;
      const over = (pc.over + (c.over - pc.over) * alpha) * dist;
      const talk = pc.talk + (c.talk - pc.talk) * alpha;
      const lookUpBase = pc.lookUp + (c.lookUp - pc.lookUp) * alpha;
      const ph = pitch * DEG;
      // when the lens climbs a rise, the look point comes up with it: the shot keeps the same tilt, so bumpy
      // ground slides the hero gently down the frame instead of swinging the horizon around.
      // The sight guarantee's own climb (`over`) does NOT move the look point at all: the lens rises and the
      // shot tilts down onto the same spot, so the boy keeps his place in the frame while the boom looks over
      // the wall. (Carrying the look point up with it would translate the whole shot and push him off the
      // bottom edge - measured at 107% of frame height before this was split out.)
      const lookUp = lookUpBase + lift * 0.6;
      void talk;
      let px = tx + Math.sin(yaw) * Math.cos(ph) * dist;
      let pz = tz + Math.cos(yaw) * Math.cos(ph) * dist;
      let py = ty + Math.sin(ph) * dist + 0.5 + lift + over;
      let lx = tx, ly = ty + lookUp, lz = tz;
      let useFov = fov;

      // the cutscene camera (or the blend back out of one) wins
      const pose = shotPose(alpha);
      if (pose) {
        px = pose.px; py = pose.py; pz = pose.pz;
        lx = pose.lx; ly = pose.ly; lz = pose.lz;
        if (pose.fov) useFov = pose.fov;
        if (pose.k < 1) {
          const k = pose.k;                                    // releasing: blend back to the follow pose
          px = lerp(px, tx + Math.sin(yaw) * Math.cos(ph) * dist, k);
          py = lerp(py, ty + Math.sin(ph) * dist + 0.5 + lift + over, k);
          pz = lerp(pz, tz + Math.cos(yaw) * Math.cos(ph) * dist, k);
          lx = lerp(lx, tx, k); ly = lerp(ly, ty + lookUp, k); lz = lerp(lz, tz, k);
          useFov = lerp(useFov, fov, k);
        }
      } else {
        // keep the lens out of the hillside even mid-interpolation
        const m = map();
        if (m && typeof m.heightAt === 'function') {
          try { const floor = m.heightAt(px, pz) + (modeDef.floor ?? 0.85); if (py < floor) py = floor; } catch (_) {}
        }
      }
      if (Math.abs(cam.fov - useFov) > 0.01) { cam.fov = useFov; cam.updateProjectionMatrix(); }
      cam.position.set(px, py, pz);
      cam.lookAt(lx, ly, lz);
      cam.updateMatrixWorld();
      return { tx, ty, tz };
    },

    // ── the cutscene camera ───────────────────────────────────────────────────────────────────────────────────
    /**
     * camera.shot({from, to, lookAt, duration, ease, fov, hold}) — a story beat.
     *   from / to   {x,y,z} | [x,y,z] | {orbit, pitch, dist, of?} (degrees / units, around the hero or `of`)
     *   lookAt      {x,y,z} | [x,y,z] | 'hero' | {from, to}       (default: keep looking where the rig looks)
     *   duration    seconds (0 = a cut)      ease  'linear'|'in'|'out'|'inOut'|'smooth'|fn
     *   hold        true (default): the shot holds until release(); false: it eases back on its own
     * Returns a Promise that resolves when the move finishes.
     */
    shot(opts = {}) {
      const o = opts || {};
      const hero = heroPos();
      const lookNow = { x: c.tx, y: c.ty + c.lookUp, z: c.tz };
      const posOf = (v, dflt) => {
        const p = vec3of(v);
        if (p) return p;
        if (v && (Number.isFinite(+v.dist) || Number.isFinite(+v.orbit) || Number.isFinite(+v.pitch))) {
          const around = vec3of(v.of, hero);
          const yaw = wrapPi((Number.isFinite(+v.orbit) ? +v.orbit : deg360(camYaw())) * DEG);
          const pitch = (Number.isFinite(+v.pitch) ? +v.pitch : c.pitch) * DEG;
          const d = Number.isFinite(+v.dist) ? +v.dist : c.dist;
          return { x: around.x + Math.sin(yaw) * Math.cos(pitch) * d, y: around.y + Math.sin(pitch) * d + 0.5, z: around.z + Math.cos(yaw) * Math.cos(pitch) * d };
        }
        return dflt;
      };
      const cam = rig.camera;
      const here = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
      SHOT.from = posOf(o.from, here);
      SHOT.to = posOf(o.to, SHOT.from);
      const la = o.lookAt;
      SHOT.lookHero = la === 'hero' || la === 'player';
      if (SHOT.lookHero) { SHOT.look0 = null; SHOT.look1 = null; }
      else if (la && (la.from || la.to)) { SHOT.look0 = vec3of(la.from, lookNow); SHOT.look1 = vec3of(la.to, SHOT.look0); }
      else { const l = vec3of(la, lookNow); SHOT.look0 = l; SHOT.look1 = l; }
      SHOT.fov0 = Number.isFinite(+o.fovFrom) ? +o.fovFrom : (Number.isFinite(+o.fov) ? c.fov : null);
      SHOT.fov1 = Number.isFinite(+o.fov) ? clamp(+o.fov, 20, 90) : null;
      SHOT.dur = Math.max(0, Number.isFinite(+o.duration) ? +o.duration : 2);
      SHOT.ease = easeFn(o.ease);
      SHOT.hold = o.hold !== false;
      SHOT.t = 0; SHOT.done = SHOT.dur === 0; SHOT.active = true; SHOT.rel = 0; SHOT.relT = 0;
      pc.shotT = 0;
      if (SHOT.resolve) { const r = SHOT.resolve; SHOT.resolve = null; try { r({ ok: true, cancelled: true }); } catch (_) {} }
      const promise = new Promise((res) => { SHOT.resolve = res; });
      if (SHOT.dur === 0) {
        const r = SHOT.resolve; SHOT.resolve = null;
        if (r) setTimeout(() => r({ ok: true, held: SHOT.hold }), 0);
        if (!SHOT.hold) rig.release(0.8);
      }
      return promise;
    },
    /** Hand a held shot back to the follow camera over `seconds` (0 = at once). */
    release(seconds = 0.8) {
      if (!SHOT.active && SHOT.rel <= 0) return false;
      const pose = shotPose(1);
      SHOT.active = false;
      SHOT.pose = pose ? { px: pose.px, py: pose.py, pz: pose.pz, lx: pose.lx, ly: pose.ly, lz: pose.lz, fov: pose.fov } : null;
      SHOT.rel = Math.max(0, +seconds || 0);
      SHOT.relT = 0;
      if (SHOT.resolve) { const r = SHOT.resolve; SHOT.resolve = null; try { r({ ok: true, released: true }); } catch (_) {} }
      if (SHOT.rel === 0) SHOT.pose = null;
      return true;
    },
    /** Drop any shot at once (a map change, a battle). */
    cut() { SHOT.active = false; SHOT.rel = 0; SHOT.relT = 0; SHOT.pose = null; SHOT.t = 0; SHOT.done = true;
      if (SHOT.resolve) { const r = SHOT.resolve; SHOT.resolve = null; try { r({ ok: true, cut: true }); } catch (_) {} } },
    get shooting() { return SHOT.active || SHOT.rel > 0; },

    /**
     * Get (no args) or set the camera mode: 'field' | 'town' | 'world' | 'interior' | 'dungeon'.
     * Going back to the mode the MAP installed restores the map's own framing (its lens, its composition) —
     * it never writes back a preset, so stepping into a house and out again leaves the sky exactly where it was.
     */
    mode(name, snap = false) {
      if (name === undefined) return c.mode;
      const out = applyMode(String(name));
      if (snap) { c.pitch = c.pitchT; c.dist = c.distT; c.fov = c.fovT; c.lookUp = c.lookUpT; rig.snap(); }
      return out;
    },

    /** Get (no args) or set the orbit target in degrees; snap jumps there at once. */
    orbit(deg, snap) {
      if (deg === undefined) return deg360(c.yawT);
      c.yawT = wrapPi(Number(deg) * DEG); c.manualT = 0; c.walked = 0; c.drift = 0;
      if (snap) {
        c.yaw = c.yawT; pc.yaw = c.yaw; c.clearT = 9;
        keepHero(1 / 60, true);                       // the guarantee lands with it, so a frozen frame is honest
        c.yawCtl = camYaw(); pc.dodge = c.dodge; pc.over = c.over;
        rig.settleFade();
      }
      return deg360(c.yawT);
    },
    /** The sight guarantee: read it, or switch it off for an A/B. */
    keep(on) {
      if (on !== undefined) { KEEP.on = !!on; if (!KEEP.on) { c.dodgeT = 0; c.overT = 0; } }
      const p = heroPos();
      const L = lensAt(camYaw(), c.pitch, c.dist, c.tx, c.ty, c.tz, camLift());
      const short = fade.shortlist(p.x, p.y + heroHeight() * 0.5, p.z, c.dist + 3.6);
      const blocker = fade.blocked ? fade.blocked(L, chestOf(p), { pad: DODGE.pad, lists: [short] }) : null;
      // the one that matters: is anything STILL SOLID between the lens and his chest, right now, by triangles?
      const solid = fade.blocked ? fade.blocked(L, chestOf(p), { pad: 0, lists: [short], precise: true, opaqueOnly: true }) : null;
      return { on: KEEP.on, clear: !solid, coarseClear: !blocker, blockedBy: blocker ? blocker.name : null,
        hiddenBy: solid ? solid.name : null,
        slide: r3(c.dodge / DEG), slideTarget: r3(c.dodgeT / DEG), climb: r3(c.over * c.dist), climbTarget: r3(c.overT * c.dist),
        solved: KEEP.solved, tests: KEEP.tests, ms: KEEP.ms,
        hiddenTicks: KEEP.hiddenTicks, ticks: KEEP.ticks, hiddenPct: KEEP.ticks ? r3(100 * KEEP.hiddenTicks / KEEP.ticks) : 0 };
    },
    /** Reset the running hidden-frames tally (a scenario measures one walk at a time). */
    keepReset() { KEEP.hiddenTicks = 0; KEEP.ticks = 0; return true; },
    /**
     * WHY: the poses the guarantee considered this tick and what stood in each one — so "why is the camera
     * over there?" (or "why did it give up?") is answerable from outside without reading the code.
     */
    keepWhy(limit = 16) {
      const p = heroPos();
      const chest = chestOf(p);
      const g = { x: c.tx, y: c.ty, z: c.tz };
      const base = wrapPi(c.yaw);
      const short = fade.shortlist(p.x, p.y + heroHeight() * 0.5, p.z, c.dist + 3.6);
      const out = [];
      const sign = c.dodgeT >= 0 ? 1 : -1;
      for (const r of RINGS) {
        for (const s of (r.mag === 0 ? [0] : [sign, -sign])) {
          const yaw = wrapPi(base + r.mag * s);
          const lift = Math.max(c.lift, groundLift(yaw, c.pitch, c.dist, g)) + r.lift * c.dist;
          const b = fade.blocked(lensAt(yaw, c.pitch, c.dist, g.x, g.y, g.z, lift), chest, { pad: DODGE.pad, lists: [short], worst: true });
          out.push({ slide: r3(r.mag * s / DEG), climb: r3(r.lift * c.dist), cost: r3(r.cost), clear: !b, by: b ? b.name : null, kind: b ? b.kind : null, n: b ? b.n : 0 });
          if (out.length >= limit) return { candidates: short.length, poses: out };
        }
      }
      return { candidates: short.length, poses: out };
    },
    /** Debug zoom. The composition follows: the horizon stays where the mode put it, the hero just reads bigger. */
    zoom(n, snap) {
      if (n === undefined) return r3(c.distT);
      c.distT = clamp(Number(n) || c.base, FRAME.minDist, 40);
      recompose(c.distT);
      if (snap) { c.dist = c.distT; c.lookUp = c.lookUpT; pc.dist = c.dist; pc.lookUp = c.lookUp;
        keepHero(1 / 60, true); pc.dodge = c.dodge; pc.over = c.over; rig.settleFade(); }
      return r3(c.distT);
    },
    settled() {
      const g = rig.goalPose();
      return Math.abs(wrapPi(c.yawT - c.yaw)) < 0.6 * DEG && Math.abs(g.dist - c.dist) < 0.05 &&
        Math.abs(g.pitch - c.pitch) < 0.2 && Math.abs(g.fov - c.fov) < 0.2 && !SHOT.active && SHOT.rel <= 0 &&
        Math.abs(wrapPi(c.dodgeT - c.dodge)) < 2 * DEG && Math.abs(c.overT - c.over) < 0.01 && fade.settled();
    },
    /**
     * Tune live (A/B work and the demo): {mode} picks a mode; {hero, horizon, feet} restate the COMPOSITION and
     * the rig re-solves the boom for it; {pitch, dist, fov, lookUp} force raw values and bypass the solver.
     */
    tune(o = {}) {
      if (o.mode) applyMode(String(o.mode));
      const want = {};
      for (const k of ['hero', 'horizon', 'feet']) if (Number.isFinite(+o[k])) want[k] = +o[k];
      if (Object.keys(want).length && c.solvedFor) {
        const s = c.solvedFor;
        const w = Object.assign({}, s.want, want);
        if (want.feet != null && want.horizon == null) delete w.horizon;
        if (want.horizon != null) delete w.feet;
        const pitch = Number.isFinite(+o.pitch) ? +o.pitch : c.pitchT;
        const fov = Number.isFinite(+o.fov) ? +o.fov : c.fovT;
        const pose = compose(pitch, fov, s.h, w);
        c.pose = pose; c.solvedFor = Object.assign({}, s, { want: w, pitch, fov });
        c.pitchT = pose.pitch; c.base = c.distT = pose.dist; c.fovT = pose.fov; c.lookUpT = pose.lookUp;
      } else {
        for (const [k, t] of [['pitch', 'pitchT'], ['fov', 'fovT'], ['lookUp', 'lookUpT']]) {
          if (Number.isFinite(+o[k])) { c[t] = +o[k]; c[k] = +o[k]; }
        }
        if (Number.isFinite(+o.dist)) { c.base = c.distT = c.dist = +o.dist; pc.dist = c.dist; }
      }
      return { mode: c.mode, pitch: r3(c.pitchT), dist: r3(c.distT), fov: r3(c.fovT), lookUp: r3(c.lookUpT),
        frame: frameOf(c.pitchT, c.distT, c.lookUpT, c.fovT, heroHeight()) };
    },
    /**
     * THE FRAMING PROBE — measured, never eyeballed. Projects the hero and the horizon through the LIVE camera
     * matrix and reports where they land as a fraction of frame height (and in pixels), so "is the boy the
     * subject of this shot?" is a number a critic can read:
     *   heroPct   his height as a % of frame height   (DQV field target: 27-32)
     *   feetPct   how far down the frame his feet are (target ~70-75)
     *   horizonPct how far down the frame the horizon is (target 35-42: a real band of sky)
     */
    frame() {
      try {
        const cam = rig.camera;
        cam.updateMatrixWorld();
        const H = App.height || 720, W = App.width || 1280;
        const h = heroHeight();
        const p = heroPos();
        const V = new THREE.Vector3();
        const toPx = (x, y, z) => {
          V.set(x, y, z).project(cam);
          return { x: (V.x * 0.5 + 0.5) * W, y: (1 - (V.y * 0.5 + 0.5)) * H, ndcX: r3(V.x), ndcY: r3(V.y) };
        };
        const feet = toPx(p.x, p.y, p.z);
        const head = toPx(p.x, p.y + h, p.z);
        // the horizon: a point at eye level, very far along the camera's flat forward direction
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        fwd.y = 0;
        if (fwd.lengthSq() < 1e-9) fwd.set(0, 0, -1);
        fwd.normalize().multiplyScalar(6000);
        const hor = toPx(cam.position.x + fwd.x, cam.position.y, cam.position.z + fwd.z);
        const heroPx = Math.abs(feet.y - head.y);
        return {
          w: W, h: H, heroHeight: r3(h),
          heroPx: Math.round(heroPx), heroPct: r3((heroPx / H) * 100),
          feetPx: Math.round(feet.y), feetPct: r3((feet.y / H) * 100),
          headPct: r3((head.y / H) * 100),
          heroNdcX: feet.ndcX,
          horizonPx: Math.round(hor.y), horizonPct: r3((hor.y / H) * 100),
          pitch: r3(c.pitch), dist: r3(c.dist), fov: r3(c.fov), lookUp: r3(c.lookUp), lift: r3(c.lift),
          eyeAboveFeet: r3((camera ? camera.position.y : 0) - p.y),
        };
      } catch (e) { reportError('camera frame probe', e); return null; }
    },
    /** state().field.camera; `extra` = {occluded, seeThrough} from the field's own bookkeeping (kept for critics). */
    describe(extra = {}) {
      const f = fade.state();
      const g = rig.goalPose();
      const composed = c.pose ? c.pose.measured : null;
      return {
        mode: c.mode, orbit: rig.orbit(), current: deg360(camYaw()), boom: deg360(c.yaw), walk: deg360(c.yawCtl), drift: r3(c.drift / DEG),
        pitch: r3(c.pitch), dist: r3(c.dist), distTarget: r3(g.dist), fov: r3(c.fov), lookUp: r3(c.lookUp),
        auto: c.auto, swing: r3(c.swing / DEG), lift: r3(c.lift), lead: [r3(c.lx), r3(c.lz)],
        keep: { on: KEEP.on, blocked: KEEP.blocked, by: KEEP.blockedBy, solved: KEEP.solved,
          slide: r3(c.dodge / DEG), slideTarget: r3(c.dodgeT / DEG), climb: r3(c.over * c.dist), climbTarget: r3(c.overT * c.dist),
          tests: KEEP.tests, ms: KEEP.ms, hiddenTicks: KEEP.hiddenTicks, ticks: KEEP.ticks,
          hiddenPct: KEEP.ticks ? r3(100 * KEEP.hiddenTicks / KEEP.ticks) : 0 },
        settled: rig.settled(), talkFraming: r3(c.talk),
        heroHeight: r3(heroHeight()), solvedFor: c.solvedFor ? { h: r3(c.solvedFor.h), mode: c.solvedFor.mode } : null,
        resolves: c.resolves || 0,
        composed: composed ? { hero: r3(composed.hero), feet: r3(composed.feet), horizon: r3(composed.horizon) } : null,
        installed: c.installed ? c.installed.mode : null,
        shot: SHOT.active || SHOT.rel > 0 ? { active: SHOT.active, t: r3(SHOT.t), duration: r3(SHOT.dur), releasing: SHOT.rel > 0 } : null,
        fade: f, occluding: f.occluding, fading: f.fading,
        occluded: !!(f.occluding || extra.occluded), seeThrough: extra.seeThrough ?? null,
        pos: camera ? camera.position.toArray().map(r3) : null,
      };
    },
    dispose() { fade.detach(); },
  };

  /** The shot pose for this frame, interpolated; k < 1 means "releasing" (blend back to the follow camera). */
  function shotPose(alpha) {
    if (SHOT.active) {
      const t = SHOT.dur <= 0 ? 1 : clamp((pc.shotT + (SHOT.t - pc.shotT) * alpha) / SHOT.dur, 0, 1);
      const k = SHOT.ease(t);
      const hero = heroPos();
      const l0 = SHOT.lookHero ? { x: hero.x, y: hero.y + 1.1, z: hero.z } : SHOT.look0;
      const l1 = SHOT.lookHero ? l0 : SHOT.look1;
      return {
        px: lerp(SHOT.from.x, SHOT.to.x, k), py: lerp(SHOT.from.y, SHOT.to.y, k), pz: lerp(SHOT.from.z, SHOT.to.z, k),
        lx: lerp(l0.x, l1.x, k), ly: lerp(l0.y, l1.y, k), lz: lerp(l0.z, l1.z, k),
        fov: SHOT.fov1 == null ? null : lerp(SHOT.fov0 == null ? c.fov : SHOT.fov0, SHOT.fov1, k),
        k: 1,
      };
    }
    if (SHOT.rel > 0 && SHOT.pose) {
      const t = clamp((SHOT.relT + (1 / 60) * alpha) / SHOT.rel, 0, 1);
      return Object.assign({}, SHOT.pose, { k: EASES.inOut(t) });
    }
    return null;
  }

  return rig;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// __DQ
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
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
  /** __DQ.cameraMode('interior') — the framing presets (CAM_MODES). */
  Debug.expose('cameraMode', (name, snap) => { const rig = getRig(); return rig ? rig.mode(name, snap === undefined ? Loop.frozen : !!snap) : null; });
  /** __DQ.cameraShot({from, to, lookAt, duration, ease, fov, hold}) — the cutscene camera. */
  Debug.expose('cameraShot', (o = {}) => { const rig = getRig(); if (!rig) return off; rig.shot(o); return Object.assign({ ok: true }, rig.describe().shot || {}); });
  Debug.expose('cameraRelease', (sec) => { const rig = getRig(); return rig ? { ok: rig.release(sec === undefined ? 0.8 : +sec) } : off; });
  /** __DQ.cameraFade(false) — switch the clean occluder fade off (see-through falls back to the old dither). */
  Debug.expose('cameraFade', (on, tune) => {
    const rig = getRig(); if (!rig) return null;
    if (on !== undefined) rig.fade.enabled = !!on;
    if (tune && typeof tune === 'object') rig.fade.tune(tune);
    return Object.assign(rig.fade.state(), { tuning: rig.fade.tune({}) });
  });
  /** __DQ.cameraFrame() — the projection probe: where the hero and the horizon actually land in the frame. */
  Debug.expose('cameraFrame', () => { const rig = getRig(); return rig ? rig.frame() : null; });
  /**
   * __DQ.cameraSight() — THE GUARANTEE, as a number: is the line from the lens to the boy's chest clear right
   * now, what is in the way if not, and how far the boom has slid and climbed to keep him. __DQ.cameraSight(false)
   * switches the guarantee off for an A/B; cameraSight(true) puts it back.
   */
  Debug.expose('cameraSight', (on) => { const rig = getRig(); return rig ? rig.keep(on) : null; });
  Debug.expose('cameraSightReset', () => { const rig = getRig(); return rig ? rig.keepReset() : null; });
  /** __DQ.cameraSightWhy() — every pose the guarantee weighed this tick, and what stood in each one. */
  Debug.expose('cameraSightWhy', (n) => { const rig = getRig(); return rig ? rig.keepWhy(n === undefined ? 16 : n) : null; });
  /** __DQ.cameraOccluders() — what is fading right now, and how far. */
  Debug.expose('cameraOccluders', (probe) => {
    const rig = getRig(); if (!rig) return null;
    return probe ? { fading: rig.fade.list(), tested: rig.fade.probe(), nearest: rig.fade.explain(10) } : rig.fade.list();
  });
}

export default createFieldCamera;
