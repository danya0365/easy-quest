/**
 * buildings.js — cottages, roofs and chimney smoke (inns, churches, shops and castles land here too).
 *                                                                                 (P05, owner: src/art/buildings.js)
 *
 * Recipes are docs/ART-DIRECTION.md §13 expressed ONLY through F3's foundation (PAL, Tex; materials come from the
 * kit's merge buckets). Moved verbatim out of src/world/scenery.js; signatures are a contract maps rely on.
 *
 *   buildingRecipes(kit) adds:
 *     kit.gableRoof(baseMatrix, W, D, H0, pitch, ovx, ovz, t, kind, gable?, gableColor?) -> ridgeY
 *     kit.cottage({x, z, rot, W, D, H, roof, pitch, doorX, doorColor, frontWindows, sideWindows, backWindow, shutter,
 *                  chimney, chimneyX, braces}) -> {y, chimneyTop, door: {x, z}, ridgeY}
 *     kit.smoke([Vector3 chimney tops]) -> InstancedMesh
 *
 * Kit contract used here (src/art/props.js createPropsKit): kit.scene, kit.heightAt, kit.ao, kit.animators,
 * kit.addTo(bucket, geo, matrix, color) with buckets stone | plaster | wood | thatch | tile | brick | bark | paint,
 * kit.footBox(x, z, w, d, rot, pad).
 */
import * as THREE from 'three';
import { PAL, C3, css, smooth } from './palette.js';
import { Tex, mulberry, mkCanvas, ctx2 } from './tex.js';
import { M4, boxUV, scaleUV, hashJ } from './props.js';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// kit recipes (installed by src/world/scenery.js createKit)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function buildingRecipes(kit) {
  const { scene, heightAt, ao, animators, addTo } = kit;

  // ── roofs and cottages (ART-DIRECTION §13) ──
  kit.gableRoof = (base, W, D, H0, pitch, ovx, ovz, t, kind, gable = 'plaster', gableColor) => {
    const run = D / 2 + ovz, L = run / Math.cos(pitch), ridgeY = H0 + (D / 2) * Math.tan(pitch);
    const texS = Tex.worldSize(kind);
    for (const side of [0, 1]) {
      const slab = boxUV(W + 2 * ovx, t, L, texS);
      const cy = ridgeY - (L / 2) * Math.sin(pitch) + (t / 2) * Math.cos(pitch), cz = (L / 2) * Math.cos(pitch) + (t / 2) * Math.sin(pitch);
      const m = new THREE.Matrix4().makeRotationX(pitch).setPosition(0, cy, cz);
      if (side) m.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
      addTo(kind, slab, base.clone().multiply(m));
      if (kind === 'thatch') {
        const roll = new THREE.CylinderGeometry(t * 0.62, t * 0.62, W + 2 * ovx + 0.1, 10); scaleUV(roll, 0.35);
        const ey = ridgeY - L * Math.sin(pitch) + (t * 0.45) * Math.cos(pitch), ez = L * Math.cos(pitch) + (t * 0.45) * Math.sin(pitch);
        const rm = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, ey, ez);
        if (side) rm.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
        addTo('thatch', roll, base.clone().multiply(rm));
      }
    }
    const shape = new THREE.Shape(); shape.moveTo(-D / 2, 0); shape.lineTo(D / 2, 0); shape.lineTo(0, ridgeY - H0); shape.closePath();
    for (const sx of [-1, 1]) {
      const gab = scaleUV(new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false }), Tex.worldSize(gable));
      addTo(gable, gab, base.clone().multiply(M4(sx * (W / 2) + (sx < 0 ? 0 : -0.14), H0, 0, Math.PI / 2)), gableColor);
    }
    if (kind === 'thatch') {
      const ridge = new THREE.CylinderGeometry(t * 0.95, t * 0.95, W + 2 * ovx + 0.2, 12); scaleUV(ridge, 0.4);
      addTo('thatch', ridge, base.clone().multiply(M4(0, ridgeY + t * 0.55, 0, 0, 0, Math.PI / 2)));
    } else {
      const ridge = new THREE.CylinderGeometry(0.17, 0.17, W + 2 * ovx + 0.1, 10); scaleUV(ridge, 0.5);
      addTo('tile', ridge, base.clone().multiply(M4(0, ridgeY + t * 0.75, 0, 0, 0, Math.PI / 2)), PAL.tile.ridge);
    }
    return ridgeY;
  };

  /**
   * A half-timbered cottage. o: {x, z, rot, W, D, H, roof:'tile'|'thatch', pitch, doorX, doorColor, frontWindows:[],
   * sideWindows:[], backWindow, shutter, chimney:'brick'|'stone'|null, chimneyX, braces}
   * Returns {chimneyTop: Vector3 | null, door: {x, z}, y}
   */
  kit.cottage = (o) => {
    const y = Math.min(heightAt(o.x - o.W / 2, o.z), heightAt(o.x + o.W / 2, o.z), heightAt(o.x, o.z - o.D / 2), heightAt(o.x, o.z + o.D / 2), heightAt(o.x, o.z)) - 0.05;
    const base = M4(o.x, y, o.z, o.rot);
    const { W, D, H } = o, P = 0.5, beam = PAL.wood.beam;
    const add = (b, g, m, c) => addTo(b, g, base.clone().multiply(m), c);
    add('stone', boxUV(W + 0.2, P + 0.1, D + 0.2, Tex.worldSize('stone')), M4(0, (P + 0.1) / 2 - 0.05, 0));
    const wg = addTo('plaster', boxUV(W, H, D, Tex.worldSize('plaster'), [2, 4, 2]), base.clone().multiply(M4(0, P + H / 2, 0)));
    { const p = wg.attributes.position, c = wg.attributes.color, gr = C3(PAL.plaster.grime), wh = C3(PAL.mask.on), t = new THREE.Color();
      for (let i = 0; i < p.count; i++) { t.copy(gr).lerp(wh, smooth(0, 1.0, p.getY(i) - y - P)); c.setXYZ(i, t.r, t.g, t.b); } }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood', boxUV(0.22, H, 0.22, 1.2), M4(sx * W / 2, P + H / 2, sz * D / 2), beam);
    for (const sz of [-1, 1]) add('wood', boxUV(W + 0.14, 0.22, 0.24, 1.2), M4(0, P + H - 0.05, sz * D / 2), beam);
    for (const sx of [-1, 1]) add('wood', boxUV(0.24, 0.22, D + 0.14, 1.2), M4(sx * W / 2, P + H - 0.05, 0), beam);
    for (const sz of [-1, 1]) add('wood', boxUV(W + 0.1, 0.16, 0.22, 1.2), M4(0, P + 0.08, sz * D / 2), beam);
    const dx = o.doorX || 0;
    if (o.braces !== false) for (const s of [-1, 1]) {
      const bx = dx + s * 1.3;
      if (Math.abs(bx) < W / 2 - 0.3 && !(o.frontWindows || []).some(wx => Math.abs(wx - bx) < 0.9)) add('wood', boxUV(0.16, 1.6, 0.14, 1.2), M4(bx, P + H * 0.5, D / 2 + 0.02, 0, 0, s * 0.62), beam);
    }
    add('wood', boxUV(1.14, 1.9, 0.16, 1.2), M4(dx, P + 0.95, D / 2 + 0.02), beam);
    add('wood', boxUV(0.88, 1.74, 0.12, 1.0), M4(dx, P + 0.87, D / 2 + 0.07), o.doorColor || PAL.paint.doorRed);
    add('paint', new THREE.SphereGeometry(0.06, 8, 6), M4(dx + 0.3, P + 0.9, D / 2 + 0.15), PAL.paint.iron);
    add('stone', boxUV(1.4, 0.2, 0.7, 1.2), M4(dx, 0.1, D / 2 + 0.45));
    const win = (lx, ly, face) => {
      const fm = face === 'front' ? M4(lx, ly, D / 2) : face === 'back' ? M4(lx, ly, -D / 2, Math.PI) : face === 'left' ? M4(-W / 2, ly, lx, -Math.PI / 2) : M4(W / 2, ly, lx, Math.PI / 2);
      const a = (b, g, m, c) => add(b, g, fm.clone().multiply(m), c);
      a('wood', boxUV(0.96, 0.9, 0.14, 1.2), M4(0, 0, 0.04), beam);
      a('paint', new THREE.BoxGeometry(0.72, 0.66, 0.1), M4(0, 0, 0.08), PAL.paint.glass);
      a('wood', boxUV(0.07, 0.66, 0.08, 1), M4(0, 0, 0.14), beam); a('wood', boxUV(0.72, 0.07, 0.08, 1), M4(0, 0, 0.14), beam);
      for (const s of [-1, 1]) a('paint', new THREE.BoxGeometry(0.4, 0.8, 0.06), M4(s * 0.7, 0, 0.1, s * 0.25), o.shutter || PAL.paint.shutterGreen);
      a('wood', boxUV(1.0, 0.2, 0.3, 0.8), M4(0, -0.55, 0.16), PAL.wood.light);
      const r = mulberry(Math.abs(lx * 100 + ly * 7 + o.x * 13 + o.z * 3) | 0);
      for (let k = 0; k < 5; k++) a('paint', new THREE.IcosahedronGeometry(0.095, 0), M4(-0.36 + k * 0.18, -0.4 + r() * 0.05, 0.16 + (r() - 0.5) * 0.12), [PAL.flower.pink, PAL.flower.yellow, PAL.flower.white, PAL.flower.red][r() * 4 | 0]);
      for (let k = 0; k < 3; k++) a('paint', new THREE.IcosahedronGeometry(0.12, 0), M4(-0.3 + k * 0.3, -0.46, 0.2), PAL.foliage.mid);
    };
    for (const wx of (o.frontWindows || [])) win(wx, P + 1.25, 'front');
    for (const wx of (o.sideWindows || [])) { win(wx, P + 1.25, 'left'); win(wx, P + 1.25, 'right'); }
    if (o.backWindow !== false) win(0, P + 1.25, 'back');
    const roof = o.roof || 'tile';
    const ridgeY = kit.gableRoof(base, W, D, P + H, o.pitch ?? 0.62, 0.45, 0.6, roof === 'thatch' ? 0.34 : 0.16, roof);
    let chimneyTop = null;
    if (o.chimney) {
      const kind = o.chimney === 'stone' ? 'stone' : 'brick', cxl = o.chimneyX ?? W * 0.3, czl = -D * 0.2;
      add(kind, boxUV(0.8, 2.3, 0.8, Tex.worldSize(kind)), M4(cxl, ridgeY - 0.45, czl));
      add(kind, boxUV(0.96, 0.18, 0.96, Tex.worldSize(kind)), M4(cxl, ridgeY + 0.74, czl));
      chimneyTop = new THREE.Vector3(cxl, ridgeY + 0.85, czl).applyMatrix4(base);
    }
    ao.box(o.x, o.z, W + 0.2, D + 0.2, o.rot, 1.3, 0.75);
    kit.footBox(o.x, o.z, W + 0.5, D + 0.5, o.rot);
    const door = new THREE.Vector3(dx, 0, D / 2 + 0.9).applyMatrix4(base);
    kit.footBox(door.x, door.z, 1.2, 1.2, o.rot, 0);
    return { y, chimneyTop, door: { x: door.x, z: door.z }, ridgeY: y + ridgeY };
  };

  // ── moving charm ──
  /** Soft chimney smoke: puffs rise, swell, drift with the wind and fade. */
  kit.smoke = (points) => {
    if (!points.length) return null;
    const S = 128, c = mkCanvas(S), g = ctx2(c);
    const puff = (x, y, r, a) => { const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r); gr.addColorStop(0, css(PAL.cloud.lit, a)); gr.addColorStop(0.45, css(PAL.cloud.warm, a * 0.8)); gr.addColorStop(0.8, css(PAL.cloud.mid, a * 0.3)); gr.addColorStop(1, css(PAL.cloud.mid, 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); };
    puff(64, 70, 50, 0.9); puff(46, 58, 30, 0.6); puff(84, 54, 32, 0.6);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const per = 6, total = points.length * per;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade; varying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade;');
    };
    mat.customProgramCacheKey = () => 'kitsmoke';
    const geo = new THREE.PlaneGeometry(1, 1);
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
    geo.setAttribute('aFade', fade);
    const mesh = new THREE.InstancedMesh(geo, mat, total); mesh.name = 'smoke'; mesh.frustumCulled = false; mesh.renderOrder = 2;
    scene.add(mesh);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qz = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
    const jitter = Array.from({ length: total }, (_, k) => [hashJ(k, 1), hashJ(k, 2), hashJ(k, 3)]);
    animators.push((t, dt, cam) => {
      if (cam) q.copy(cam.quaternion);
      let k = 0;
      for (let pi = 0; pi < points.length; pi++) {
        const p = points[pi];
        for (let i = 0; i < per; i++, k++) {
          const [j1, j2, j3] = jitter[k];
          const life = ((t * 0.11 + i / per + pi * 0.37 + j1 * 0.08) % 1);
          const rise = life * 4.2, drift = life * life * 2.6;
          v.set(p.x + drift * 0.85 + Math.sin(t * 0.6 + i * 2.1 + pi) * 0.22 * life, p.y + rise, p.z - drift * 0.35 + (j2 - 0.5) * 0.3 * life);
          const s = (0.5 + life * 2.1) * (0.85 + j3 * 0.3);
          sc.set(s, s, s);
          qz.setFromAxisAngle(zAxis, j1 * 6.283 + life * (j2 - 0.5) * 1.5);
          m4.compose(v, q.clone().multiply(qz), sc); mesh.setMatrixAt(k, m4);
          fade.array[k] = smooth(0, 0.15, life) * (1 - smooth(0.3, 1, life)) * 0.62;
        }
      }
      mesh.instanceMatrix.needsUpdate = true; fade.needsUpdate = true;
    });
    return mesh;
  };

  return kit;
}
