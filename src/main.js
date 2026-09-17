/**
 * main.js — bootstrap. Builds the App, registers scenes, starts the loop.         (integrator; F1 placeholder)
 *
 * Right now it boots a PLACEHOLDER field scene that proves the engine spine end to end: fixed-step loop with
 * interpolation, scene stack, deterministic sim clock, Assets cache, __DQ debug API and error trapping.
 * It is replaced by the real title/field scenes as those pieces land.
 */
import * as THREE from 'three';
import { App } from './engine/app.js';
import { Scenes } from './engine/states.js';
import { Debug, reportError } from './engine/debug.js';
import { Assets } from './engine/assets.js';
import { makeRng } from './engine/rng.js';

// PLACEHOLDER colours, copied from docs/ART-DIRECTION.md §7 (PAL). Delete this block and import PAL from
// src/art/palette.js as soon as F3 lands — no other file may hardcode colour.
const PAL = {
  sky:     { zenith: '#2a74d0', upper: '#4f9ae2', horizon: '#bfe2f2', haze: '#cbdfe8' },
  light:   { sun: '#fff0d2', hemiSky: '#c3cff0', hemiGround: '#bba374' },
  grass:   { deep: '#3f7a3a', mid: '#62a04a', light: '#86b85a', sun: '#a9c36a' },
  dirt:    { base: '#b98d5d', light: '#dcbc8a' },
  foliage: { dark: '#2d5a2b', mid: '#4a8a3a', light: '#78b048', trunk: '#7d5433' },
  slime:   { body: '#3b8fea', mouth: '#7a1f2e' },
  char:    { eye: '#1c1418', white: '#ffffff' },
  outline: { char: '#2b1d1a', leaf: '#1e3219' },
};
const C3 = (hex) => new THREE.Color(hex);

// ── placeholder world helpers ────────────────────────────────────────────────────────────────────────────────
const heightAt = (x, z) =>
  0.55 * Math.sin(x * 0.11 + 0.6) * Math.cos(z * 0.09) + 0.35 * Math.sin((x + z) * 0.19) + 0.00045 * (x * x + z * z) * 2.2;
const pathCenterX = (z) => 1.6 * Math.sin(z * 0.12) - 0.5;

const GROUND = 140;
function groundTexture() {
  // Colour is painted, not vertex-interpolated, so the worn path has a clean wobbly edge. (Assets.canvasTexture)
  return Assets.canvasTexture('placeholder:ground', {
    w: 1024, h: 1024, wrap: 'clamp', anisotropy: 8,
    draw(ctx, w, h) {
      const rng = makeRng('placeholder-ground');
      const px = (x) => (x / GROUND + 0.5) * w, pz = (z) => (z / GROUND + 0.5) * h;
      ctx.fillStyle = PAL.grass.mid; ctx.fillRect(0, 0, w, h);
      const blob = (x, y, r, col, a) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      };
      for (let i = 0; i < 90; i++) blob(rng.float(0, w), rng.float(0, h), rng.float(40, 140), PAL.grass.deep, 0.35);
      for (let i = 0; i < 110; i++) blob(rng.float(0, w), rng.float(0, h), rng.float(30, 110), PAL.grass.light, 0.35);
      for (let i = 0; i < 60; i++) blob(rng.float(0, w), rng.float(0, h), rng.float(20, 60), PAL.grass.sun, 0.25);
      ctx.globalAlpha = 1;
      const path = (width, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let z = 20; z >= -70; z -= 1) {
          const x = pathCenterX(z) + 0.18 * Math.sin(z * 1.3);
          if (z === 20) ctx.moveTo(px(x), pz(z)); else ctx.lineTo(px(x), pz(z));
        }
        ctx.stroke();
      };
      const unit = w / GROUND;
      path(unit * 3.0, PAL.grass.sun);
      path(unit * 2.3, PAL.dirt.base);
      path(unit * 1.2, PAL.dirt.light);
    },
  });
}

function buildGround() {
  const seg = 110;
  const geo = new THREE.PlaneGeometry(GROUND, GROUND, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ map: groundTexture() });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'placeholder-ground';
  return mesh;
}

function buildSkyDome() {
  const geo = new THREE.SphereGeometry(600, 32, 16);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const z = C3(PAL.sky.zenith), u = C3(PAL.sky.upper), h = C3(PAL.sky.horizon), hz = C3(PAL.sky.haze), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 600;
    if (y < 0) c.copy(hz);
    else if (y < 0.18) c.copy(h).lerp(u, THREE.MathUtils.smoothstep(y, 0.0, 0.18));
    else c.copy(u).lerp(z, THREE.MathUtils.smoothstep(y, 0.18, 0.75));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10; m.frustumCulled = false; m.name = 'placeholder-sky';
  return m;
}

function buildTrees(rng) {
  const spots = [];
  for (let i = 0; i < 70 && spots.length < 26; i++) {
    const ang = rng.float(0, Math.PI * 2), r = rng.float(9, 34);
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r - 4;
    if (Math.abs(x - pathCenterX(z)) < 3.2 && z < 18) continue;
    if (Math.hypot(x - 1.5, z - 3) < 6) continue;
    spots.push([x, z, rng.float(0.85, 1.35), rng.float(0, Math.PI * 2)]);
  }
  const canopyGeo = Assets.icosa(1.35, 2);
  const hullGeo = Assets.geometry('placeholder:canopy-hull', () => {
    const g = canopyGeo.clone(); const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * 0.06, p.getY(i) + n.getY(i) * 0.06, p.getZ(i) + n.getZ(i) * 0.06);
    return g;
  });
  const trunkGeo = Assets.cylinder(0.2, 0.3, 1.6, 8);
  const canopyMat = Assets.material('placeholder:leaf', () => new THREE.MeshToonMaterial()); // tinted per instance
  const hullMat = Assets.material('placeholder:leaf-hull', () => new THREE.MeshBasicMaterial({ color: C3(PAL.outline.leaf), side: THREE.BackSide }));
  const trunkMat = Assets.material('placeholder:trunk', () => new THREE.MeshToonMaterial({ color: C3(PAL.foliage.trunk) }));
  const n = spots.length;
  const canopy = new THREE.InstancedMesh(canopyGeo, canopyMat, n);
  const hull = new THREE.InstancedMesh(hullGeo, hullMat, n);
  const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const tint = new THREE.Color(), lightLeaf = C3(PAL.foliage.light), darkLeaf = C3(PAL.foliage.dark);
  spots.forEach(([x, z, s, rot], i) => {
    const y = heightAt(x, z);
    q.setFromAxisAngle(v.set(0, 1, 0), rot);
    m.compose(v.set(x, y + 0.75 * s, z), q, sc.set(s, s, s)); trunk.setMatrixAt(i, m);
    m.compose(v.set(x, y + 2.1 * s, z), q, sc.set(s * 1.05, s * 0.95, s * 1.05));
    canopy.setMatrixAt(i, m); hull.setMatrixAt(i, m);
    tint.set(PAL.foliage.mid).lerp(i % 3 ? lightLeaf : darkLeaf, 0.25 + 0.2 * ((i * 7) % 5) / 5);
    canopy.setColorAt(i, tint);
  });
  canopy.castShadow = trunk.castShadow = true;
  trunk.receiveShadow = true; // canopies don't receive: low-poly blobs self-shadow into hatching
  const g = new THREE.Group(); g.name = 'placeholder-trees';
  g.add(trunk, canopy, hull);
  return g;
}

function buildSlime() {
  const g = new THREE.Group(); g.name = 'placeholder-slime';
  const bodyGeo = Assets.geometry('placeholder:slime-body', () => {
    const geo = new THREE.SphereGeometry(0.62, 32, 20);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < -0.25) y = -0.25 - (y + 0.25) * 0.25;             // flat-ish bottom
      if (y > 0.3) { const k = (y - 0.3) / 0.32; x *= 1 - 0.55 * k; z *= 1 - 0.55 * k; y += 0.22 * k * k; } // the drip tip
      p.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  });
  const body = new THREE.Mesh(bodyGeo, Assets.material('placeholder:slime', () => new THREE.MeshToonMaterial({ color: C3(PAL.slime.body) })));
  body.castShadow = true;
  body.position.y = 0.55;
  const hull = new THREE.Mesh(bodyGeo, Assets.material('placeholder:outline', () => new THREE.MeshBasicMaterial({ color: C3(PAL.outline.char), side: THREE.BackSide })));
  hull.scale.setScalar(1.045);
  body.add(hull);
  const eyeW = Assets.material('placeholder:eye-white', () => new THREE.MeshBasicMaterial({ color: C3(PAL.char.white) }));
  const eyeB = Assets.material('placeholder:eye', () => new THREE.MeshBasicMaterial({ color: C3(PAL.char.eye) }));
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(Assets.sphere(0.13, 16, 12), eyeW); w.scale.set(1, 1.25, 0.6); w.position.set(sx * 0.2, 0.05, 0.52); body.add(w);
    const p = new THREE.Mesh(Assets.sphere(0.07, 12, 10), eyeB); p.position.set(sx * 0.19, 0.03, 0.6); body.add(p);
  }
  const mouth = new THREE.Mesh(Assets.circle(0.16, 20), Assets.material('placeholder:mouth', () => new THREE.MeshBasicMaterial({ color: C3(PAL.slime.mouth), side: THREE.DoubleSide })));
  mouth.scale.set(1, 0.55, 1); mouth.position.set(0, -0.2, 0.575); mouth.rotation.x = -0.25;
  body.add(mouth);
  g.add(body);
  g.userData.body = body;
  return g;
}

// ── the placeholder field scene ──────────────────────────────────────────────────────────────────────────────
function placeholderField() {
  const scene = new THREE.Scene();
  scene.name = 'placeholder-field';
  scene.fog = new THREE.Fog(C3(PAL.sky.haze), 45, 260);
  scene.background = C3(PAL.sky.horizon);
  const camera = new THREE.PerspectiveCamera(45, App.aspect(), 0.3, 1400);
  let offResize = null;
  const rng = makeRng('placeholder-field');
  const SUN_DIR = new THREE.Vector3(0.55, 0.72, 0.42).normalize();
  let sun, sky, slime;
  const home = new THREE.Vector3(1.5, 0, 3);
  // interpolated sim state: prev/cur hop phase + position
  const cur = { x: home.x, z: home.z, yaw: 0.35, hop: 0 };
  const prev = { ...cur };
  const view = { orbit: 14, pitch: 21, dist: 14, lookUp: 2.6 };
  const tgt = new THREE.Vector3();

  return {
    enter() {
      try {
        sky = buildSkyDome(); scene.add(sky);
        sun = new THREE.DirectionalLight(C3(PAL.light.sun), 1.9);
        sun.castShadow = true;
        sun.shadow.mapSize.set(App.tier.shadowMapSize, App.tier.shadowMapSize);
        Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
        sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
        scene.add(sun, sun.target);
        scene.add(new THREE.HemisphereLight(C3(PAL.light.hemiSky), C3(PAL.light.hemiGround), 1.55));
        scene.add(buildGround());
        scene.add(buildTrees(rng));
        slime = buildSlime(); scene.add(slime);
      } catch (e) { reportError('placeholder field build', e); }
      offResize = App.onResize(() => { camera.aspect = App.aspect(); camera.updateProjectionMatrix(); });
      Debug.implement('cameraOrbit', (deg) => { if (deg !== undefined) view.orbit = Number(deg) || 0; return { ok: true, orbit: view.orbit }; });
      Debug.implement('cameraZoom', (n) => { if (n !== undefined) view.dist = THREE.MathUtils.clamp(Number(n) || 13, 4, 60); return { ok: true, dist: view.dist }; });
      Debug.provide('field', () => ({ placeholder: true, orbit: view.orbit, dist: view.dist, slime: { x: +cur.x.toFixed(3), z: +cur.z.toFixed(3), hop: +cur.hop.toFixed(3) } }));
    },
    exit() {
      if (offResize) offResize();
      Debug.implement('cameraOrbit', null); Debug.implement('cameraZoom', null); Debug.provide('field', null);
      Assets.disposeObject(scene);
    },
    update(dt) {
      Object.assign(prev, cur);
      const t = App.clock.time;
      // a small deterministic wander around home, hopping
      cur.hop = (cur.hop + dt * 1.6) % 1;
      const wx = home.x + Math.sin(t * 0.37) * 1.4, wz = home.z + Math.sin(t * 0.23 + 1) * 1.0;
      cur.x += (wx - cur.x) * Math.min(1, dt * 1.5);
      cur.z += (wz - cur.z) * Math.min(1, dt * 1.5);
      cur.yaw = Math.atan2(wx - cur.x + 0.001, wz - cur.z + 0.6) * 0.5 + 0.2;
    },
    render(alpha) {
      const x = prev.x + (cur.x - prev.x) * alpha;
      const z = prev.z + (cur.z - prev.z) * alpha;
      let hop = prev.hop + (((cur.hop - prev.hop) + 1) % 1) * alpha; hop %= 1;
      if (slime) {
        const up = Math.max(0, Math.sin(hop * Math.PI * 2));           // airborne half
        const squash = Math.max(0, -Math.sin(hop * Math.PI * 2));      // landing half
        slime.position.set(x, heightAt(x, z) + up * 0.32, z);
        slime.rotation.y = cur.yaw;
        const b = slime.userData.body;
        b.scale.set(1 + squash * 0.12, 1 - squash * 0.14 + up * 0.06, 1 + squash * 0.12);
      }
      const t = App.clock.time + alpha / 60;
      const orbit = THREE.MathUtils.degToRad(view.orbit + Math.sin(t * 0.12) * 10);
      const ph = THREE.MathUtils.degToRad(view.pitch);
      tgt.set(x, heightAt(x, z), z);
      camera.position.set(tgt.x + Math.sin(orbit) * Math.cos(ph) * view.dist, tgt.y + Math.sin(ph) * view.dist + 0.5, tgt.z + Math.cos(orbit) * Math.cos(ph) * view.dist);
      camera.lookAt(tgt.x, tgt.y + view.lookUp, tgt.z);
      if (sun) { sun.target.position.copy(tgt); sun.position.copy(tgt).addScaledVector(SUN_DIR, 60); }
      if (sky) sky.position.copy(camera.position);
      App.render(scene, camera);
    },
  };
}

// ── boot ─────────────────────────────────────────────────────────────────────────────────────────────────────
try {
  App.start({ canvas: document.getElementById('game-canvas'), version: '0.1.0-f1' });
  Scenes.register('field', placeholderField);
  Scenes.push('field');
} catch (e) {
  reportError('main boot', e);
}
