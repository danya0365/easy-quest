/**
 * terrain.js — the ground a map stands on: lane / stream masks, distance fields, the painted ground mesh, and water.
 *                                                                                   (P03, owner: src/art/terrain.js)
 *
 * Recipes are docs/ART-DIRECTION.md §10 expressed ONLY through F3's foundation (PAL, Tex, makeToon, AO masks).
 * Moved verbatim out of src/world/scenery.js (the vertical slice's kit); signatures are a contract maps rely on.
 *
 *   curvePoints(pts, step)                      dense [[x, z]] along a Catmull-Rom (lanes, streams)
 *   paintMasks({N, span, center, strokes, discs}) -> {sample(ch, x, z), texture(), rect, ...}   R = path, G = water
 *   distanceGrid({N, span, center, lines, discs, maxR}) -> {sample(x, z)}            exact distance, for shaping
 *   buildGround(scene, {heightAt, masks, ao, shade, inner, step, outer, rings}) -> Mesh   one draw call
 *   terrainRecipes(kit)                          adds kit.water({stream, width, ponds, y, joinPonds, shoreDepth})
 *
 * Kit contract used here (src/art/props.js createPropsKit): kit.scene, kit.heightAt, kit.animators.push(fn(t, dt, cam)).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, lerp, smooth, clamp01 } from './palette.js';
import { Tex } from './tex.js';
import { makeToon, worldPlanar, aoPatch } from './toon.js';

/** Dense points along a Catmull-Rom through [[x, z], ...], spaced about `step` world units apart. */
export function curvePoints(pts, step = 0.4) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(8, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map(p => [p.x, p.z]);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// masks: exact distance fields painted into float grids (path / water), sampled by the CPU and the ground shader
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * strokes: [{pts: dense [[x,z]], w: width, falloff?, channel: 0|1}]   discs: [{x, z, r, falloff?, channel}]
 * value = clamp01(0.5 + (halfWidth - distance) / (2 * falloff)) -> exactly 0.5 on the edge, max over strokes.
 * Returns {N, span, center, ch: [Float32Array, Float32Array], sample(ch, x, z), texture()}
 */
export function paintMasks({ N = 1024, span = 96, center = [0, 0], strokes = [], discs = [] } = {}) {
  const pxu = N / span, ox = center[0] - span / 2, oz = center[1] - span / 2;
  const ch = [new Float32Array(N * N), new Float32Array(N * N)];
  const put = (c, k, v) => { if (v > ch[c][k]) ch[c][k] = v; };
  for (const s of strokes) {
    const hw = s.w / 2, fo = s.falloff ?? 1.2, reach = hw + fo, c = s.channel | 0, P = s.pts;
    const widthAt = typeof s.widthAt === 'function' ? s.widthAt : null;
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az] = P[k], [bx, bz] = P[k + 1];
      const hwk = widthAt ? widthAt(k / (P.length - 1)) / 2 : hw, rk = hwk + fo;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - rk - ox) * pxu)), i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + rk - ox) * pxu));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - rk - oz) * pxu)), j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + rk - oz) * pxu));
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1e-9;
      for (let j = j0; j <= j1; j++) {
        const z = oz + (j + 0.5) / pxu;
        for (let i = i0; i <= i1; i++) {
          const x = ox + (i + 0.5) / pxu;
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
          const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
          if (d >= rk) continue;
          put(c, j * N + i, clamp01(0.5 + (hwk - d) / (2 * fo)));
        }
      }
      void reach;
    }
  }
  for (const s of discs) {
    const fo = s.falloff ?? 1.2, rk = s.r + fo, c = s.channel | 0;
    const i0 = Math.max(0, Math.floor((s.x - rk - ox) * pxu)), i1 = Math.min(N - 1, Math.ceil((s.x + rk - ox) * pxu));
    const j0 = Math.max(0, Math.floor((s.z - rk - oz) * pxu)), j1 = Math.min(N - 1, Math.ceil((s.z + rk - oz) * pxu));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = ox + (i + 0.5) / pxu, z = oz + (j + 0.5) / pxu, d = Math.hypot((x - s.x) / (s.sx ?? 1), (z - s.z) / (s.sz ?? 1));
      if (d >= rk) continue;
      put(c, j * N + i, clamp01(0.5 + (s.r - d) / (2 * fo)));
    }
  }
  let tex = null;
  const M = {
    N, span, center, ch, rect: [ox, oz, span, span],
    sample(c, x, z) {
      const fx = (x - ox) * pxu - 0.5, fz = (z - oz) * pxu - 0.5, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = (ii, jj) => (ii < 0 || jj < 0 || ii >= N || jj >= N) ? 0 : ch[c][jj * N + ii];
      return (a(i, j) * (1 - u) + a(i + 1, j) * u) * (1 - v) + (a(i, j + 1) * (1 - u) + a(i + 1, j + 1) * u) * v;
    },
    texture() {
      if (tex) return tex;
      const data = new Uint8Array(N * N * 4);
      for (let k = 0; k < N * N; k++) { data[k * 4] = ch[0][k] * 255; data[k * 4 + 1] = ch[1][k] * 255; data[k * 4 + 3] = 255; }
      tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      tex.colorSpace = THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true; tex.name = 'groundMask';
      return tex;
    },
  };
  return M;
}

/**
 * Coarse exact distance field to polylines / discs (for terrain shaping: valleys, pads). Cells beyond maxR = maxR.
 *   lines: [dense [[x,z]...]]   discs: [{x, z, r, sx?, sz?}]   -> {sample(x, z) -> distance}
 */
export function distanceGrid({ N = 320, span = 96, center = [0, 0], lines = [], discs = [], maxR = 14 } = {}) {
  const pxu = N / span, ox = center[0] - span / 2, oz = center[1] - span / 2, D = new Float32Array(N * N).fill(maxR);
  for (const P of lines) {
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az] = P[k], [bx, bz] = P[k + 1];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - maxR - ox) * pxu)), i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + maxR - ox) * pxu));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - maxR - oz) * pxu)), j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + maxR - oz) * pxu));
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1e-9;
      for (let j = j0; j <= j1; j++) {
        const z = oz + (j + 0.5) / pxu;
        for (let i = i0; i <= i1; i++) {
          const x = ox + (i + 0.5) / pxu, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
          const d = Math.hypot(x - ax - vx * t, z - az - vz * t), q = j * N + i;
          if (d < D[q]) D[q] = d;
        }
      }
    }
  }
  for (const s of discs) {
    const rk = s.r * Math.max(s.sx ?? 1, s.sz ?? 1) + maxR;
    const i0 = Math.max(0, Math.floor((s.x - rk - ox) * pxu)), i1 = Math.min(N - 1, Math.ceil((s.x + rk - ox) * pxu));
    const j0 = Math.max(0, Math.floor((s.z - rk - oz) * pxu)), j1 = Math.min(N - 1, Math.ceil((s.z + rk - oz) * pxu));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = ox + (i + 0.5) / pxu, z = oz + (j + 0.5) / pxu;
      const d = Math.max(0, Math.hypot((x - s.x) / (s.sx ?? 1), (z - s.z) / (s.sz ?? 1)) - s.r), q = j * N + i;
      if (d < D[q]) D[q] = d;
    }
  }
  return {
    D, N, span,
    sample(x, z) {
      const fx = (x - ox) * pxu - 0.5, fz = (z - oz) * pxu - 0.5, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = (ii, jj) => (ii < 0 || jj < 0 || ii >= N || jj >= N) ? maxR : D[jj * N + ii];
      return (a(i, j) * (1 - u) + a(i + 1, j) * u) * (1 - v) + (a(i, j + 1) * (1 - u) + a(i + 1, j + 1) * u) * v;
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ground: fine grid over the playable square + a square-to-round annulus out to the hills, one draw call.
// Grass = Tex.grass world-planar; path + stream banks from the mask (R path, G water); contact AO from the AO mask.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function buildGround(scene, { heightAt, masks, ao, shade = null, inner = 40, step = 0.8, outer = 128, rings = 16 } = {}) {
  const n = Math.round((inner * 2) / step);
  const pos = [], idx = [];
  const vtx = (x, z) => { pos.push(x, heightAt(x, z), z); return pos.length / 3 - 1; };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) vtx(-inner + i * step, -inner + j * step);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + (n + 1), d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // perimeter of the inner grid, counter-clockwise from the top-left (x -> +, z = -inner first)
  const perim = [];
  for (let i = 0; i < n; i++) perim.push([i, 0]);
  for (let j = 0; j < n; j++) perim.push([n, j]);
  for (let i = n; i > 0; i--) perim.push([i, n]);
  for (let j = n; j > 0; j--) perim.push([0, j]);
  let prevRing = perim.map(([i, j]) => j * (n + 1) + i);
  const P = perim.length;
  for (let k = 1; k <= rings; k++) {
    const t = k / rings, r = lerp(inner, outer, Math.pow(t, 1.6)), round = smooth(0, 0.7, t);
    const ring = [];
    for (let q = 0; q < P; q++) {
      const [i, j] = perim[q], sx = -inner + i * step, sz = -inner + j * step;
      const sq = Math.max(Math.abs(sx), Math.abs(sz)) || 1, ang = Math.atan2(sz, sx);
      const bx = sx / sq * r, bz = sz / sq * r, cx = Math.cos(ang) * r * 1.08, cz = Math.sin(ang) * r * 1.08;
      ring.push(vtx(lerp(bx, cx, round), lerp(bz, cz, round)));
    }
    for (let q = 0; q < P; q++) {
      const a = prevRing[q], b = prevRing[(q + 1) % P], c = ring[q], d = ring[(q + 1) % P];
      idx.push(a, b, c, b, d, c);
    }
    prevRing = ring;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();

  const maskTex = masks.texture();
  // forest floor: a big soft mask painted under the woodland ring (makeAOMask) — the grass and the lanes that run
  // into the trees sink into leafy shade instead of stopping in open grass
  const shadeTex = shade ? shade.texture() : null;
  const groundPatch = (sh) => {
    sh.uniforms.tGMask = { value: maskTex };
    sh.uniforms.tDqShade = { value: shadeTex || maskTex };
    sh.uniforms.uDqShadeRect = { value: new THREE.Vector4(...(shade ? shade.rect : [0, 0, 1, 1])) };
    sh.uniforms.uDqShadeOn = { value: shade ? 1 : 0 };
    sh.uniforms.uDqShadeCol = { value: C3(PAL.shadow.contact) };
    sh.uniforms.tDirtMap = { value: Tex.dirt() };
    sh.uniforms.uGMaskRect = { value: new THREE.Vector4(...masks.rect) };
    sh.uniforms.uDry = { value: C3(PAL.grass.dry) }; sh.uniforms.uLip = { value: C3(PAL.dirt.dark) };
    sh.uniforms.uCrown = { value: C3(PAL.dirt.light) }; sh.uniforms.uBank = { value: C3(PAL.dirt.bank) };
    sh.uniforms.uLush = { value: C3(PAL.grass.deep) }; sh.uniforms.uClump = { value: C3(PAL.grass.clump) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGMask, tDirtMap, tDqShade; uniform vec4 uGMaskRect, uDqShadeRect; uniform float uDqShadeOn; uniform vec3 uDry, uLip, uCrown, uBank, uLush, uClump, uDqShadeCol;')
      .replace('#include <color_fragment>', /* glsl */`
  {
    vec2 mUv = ( vDqWorld.xz - uGMaskRect.xy ) / uGMaskRect.zw;
    float mIn = step( 0.0, mUv.x ) * step( mUv.x, 1.0 ) * step( 0.0, mUv.y ) * step( mUv.y, 1.0 );
    vec4 mk = texture2D( tGMask, mUv ) * mIn;
    float edgeN = ( texture2D( tDqNoise, vDqWorld.xz * 0.21 + vec2( 0.13, 0.41 ) ).r - 0.5 ) * 0.16 + ( texture2D( tDqNoise, vDqWorld.xz * 0.85 ).g - 0.5 ) * 0.10;
    // stream banks: lush darker grass, then a bank of wet earth
    float wet = mk.g + edgeN * 0.35;
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, uLush * 0.9, 0.5 ), smoothstep( 0.12, 0.34, wet ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, uBank, smoothstep( 0.44, 0.5, wet ) );
    // worn path
    float pd = mk.r + edgeN;
    float aa = fwidth( pd ) * 0.8 + 0.003;
    float isPath = smoothstep( 0.5 - aa, 0.5 + aa, pd );
    float rim = smoothstep( 0.24, 0.5, pd ) * ( 1.0 - isPath );
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, uDry, 0.65 ), rim * 0.85 );
    vec3 dirt = texture2D( tDirtMap, vDqWorld.xz / 3.3 ).rgb;
    dirt = mix( dirt, mix( dirt, uCrown, 0.45 ), smoothstep( 0.74, 0.98, mk.r ) * ( 0.4 + 0.6 * texture2D( tDqNoise, vDqWorld.xz * 0.061 ).r ) );
    dirt = mix( dirt, uLip * 0.92, ( 1.0 - smoothstep( 0.5, 0.58, pd ) ) * 0.45 );
    diffuseColor.rgb = mix( diffuseColor.rgb, dirt, isPath );
    if ( uDqShadeOn > 0.5 ) {
      vec2 sUv = clamp( ( vDqWorld.xz - uDqShadeRect.xy ) / uDqShadeRect.zw, 0.0, 1.0 );
      float fs = texture2D( tDqShade, sUv ).r;
      fs = clamp( fs + ( texture2D( tDqNoise, vDqWorld.xz * 0.09 ).g - 0.5 ) * 0.25 * fs, 0.0, 1.0 );
      diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb * 0.62, uDqShadeCol, 0.28 ) * mix( vec3( 1.0 ), uLush * 1.6, 0.25 ), fs );
    }
  }
  #include <color_fragment>`);
  };
  groundPatch.key = 'kitground';
  const mat = makeToon({ map: Tex.grass() }, 'ground',
    [worldPlanar({ scale: 1 / Tex.worldSize('grass'), breakup: 1, macro: 0.1, tint: PAL.grass.sun, tintAmount: 0.42 }), groundPatch, aoPatch(ao)], 'dqground');
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'ground'; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// kit recipes (installed by src/world/scenery.js createKit)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function terrainRecipes(kit) {
  const { scene, heightAt, animators } = kit;

  // ── water ──
  /**
   * Stream ribbon + pond discs at one water level, world-planar UVs, Tex.water scrolling.
   * The surfaces are built WIDER than the water (width / pond r are the outer skirt) and the carved terrain decides
   * where the shore is: river and ponds are one level sheet, so they meet with no seam, and the shallows lighten
   * toward a thin foam line wherever the bed rises to the surface (per-vertex depth below the water level).
   *   stream: dense [[x, z]]   width: full ribbon width   ponds: [{x, z, r, sx, sz}]   y: water level
   *   joinPonds: extend the ribbon into the nearest pond at each end (default true)
   */
  kit.water = ({ stream, width = 2.8, ponds = [], y = -0.5, joinPonds = true, shoreDepth = 0.5 } = {}) => {
    const parts = [];
    const depth = (x, z) => y - heightAt(x, z);
    const mkGeo = (pos, idx) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      return g.toNonIndexed();
    };
    if (stream && stream.length > 1) {
      let pts = stream.slice();
      if (joinPonds && ponds.length) {
        const near = (pt) => ponds.map(p => ({ p, d: Math.hypot(pt[0] - p.x, pt[1] - p.z) - p.r * Math.max(p.sx ?? 1, p.sz ?? 1) })).sort((a, b) => a.d - b.d)[0];
        const a = near(pts[0]), b = near(pts[pts.length - 1]);
        if (a && a.d < 4) pts = [[a.p.x, a.p.z], ...pts];
        if (b && b.d < 4) pts = [...pts, [b.p.x, b.p.z]];
      }
      const XS = 6, pos = [], idx = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        const nx = -dz / L, nz = dx / L, w = width / 2;
        for (let k = 0; k <= XS; k++) { const o = -w + (2 * w * k) / XS; pos.push(pts[i][0] + nx * o, y, pts[i][1] + nz * o); }
        if (i) for (let k = 0; k < XS; k++) { const a0 = (i - 1) * (XS + 1) + k, b0 = a0 + XS + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
      }
      parts.push(mkGeo(pos, idx));
    }
    for (const p of ponds) {
      const SEG = 44, RINGS = 8, pos = [p.x, y + 0.002, p.z], idx = [];
      for (let j = 1; j <= RINGS; j++) for (let q = 0; q < SEG; q++) {
        const a = q / SEG * Math.PI * 2, rr = p.r * j / RINGS;
        pos.push(p.x + Math.cos(a) * rr * (p.sx ?? 1), y + 0.002, p.z + Math.sin(a) * rr * (p.sz ?? 1));
      }
      for (let q = 0; q < SEG; q++) idx.push(0, 1 + (q + 1) % SEG, 1 + q);
      for (let j = 1; j < RINGS; j++) for (let q = 0; q < SEG; q++) {
        const a0 = 1 + (j - 1) * SEG + q, a1 = 1 + (j - 1) * SEG + (q + 1) % SEG, b0 = a0 + SEG, b1 = a1 + SEG;
        idx.push(a0, a1, b0, a1, b1, b0);
      }
      parts.push(mkGeo(pos, idx));
    }
    const g = mergeGeometries(parts), P = g.attributes.position, uv = new Float32Array(P.count * 2), dep = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) { uv[i * 2] = P.getX(i) / 7; uv[i * 2 + 1] = P.getZ(i) / 7; dep[i] = depth(P.getX(i), P.getZ(i)); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    // every face up (the ribbon winding flips on tight bends)
    for (let i = 0; i < P.count; i += 3) {
      const ax = P.getX(i), az = P.getZ(i), bx = P.getX(i + 1), bz = P.getZ(i + 1), cx = P.getX(i + 2), cz = P.getZ(i + 2);
      if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0) { P.setXYZ(i + 1, cx, P.getY(i + 2), cz); P.setXYZ(i + 2, bx, P.getY(i + 1), bz);
        const u1 = [uv[(i + 1) * 2], uv[(i + 1) * 2 + 1]]; uv[(i + 1) * 2] = uv[(i + 2) * 2]; uv[(i + 1) * 2 + 1] = uv[(i + 2) * 2 + 1]; uv[(i + 2) * 2] = u1[0]; uv[(i + 2) * 2 + 1] = u1[1];
        const d1 = dep[i + 1]; dep[i + 1] = dep[i + 2]; dep[i + 2] = d1; }
    }
    g.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ map: Tex.water(), fog: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDqShallow = { value: C3(PAL.water.light) }; sh.uniforms.uDqFoam = { value: C3(PAL.water.foam) };
      sh.uniforms.uDqShore = { value: shoreDepth }; sh.uniforms.tDqNoise = { value: Tex.noise() };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDepth; varying float vDqDepth; varying vec2 vDqWXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDqDepth = aDepth; vDqWXZ = ( modelMatrix * vec4( position, 1.0 ) ).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDqDepth; varying vec2 vDqWXZ; uniform vec3 uDqShallow, uDqFoam; uniform float uDqShore; uniform sampler2D tDqNoise;')
        .replace('#include <map_fragment>', `#include <map_fragment>
  {
    float n = texture2D( tDqNoise, vDqWXZ * 0.35 ).g - 0.5;
    float d = vDqDepth + n * 0.05;
    diffuseColor.rgb = mix( mix( diffuseColor.rgb, uDqShallow, 0.55 ), diffuseColor.rgb, smoothstep( 0.03, uDqShore, d ) );
    float foam = 1.0 - smoothstep( 0.0, 0.075, d );
    diffuseColor.rgb = mix( diffuseColor.rgb, uDqFoam, foam * 0.8 );
  }`);
    };
    mat.customProgramCacheKey = () => 'kitwater|shore';
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'water'; mesh.renderOrder = 0; scene.add(mesh);
    animators.push((t) => { Tex.water().offset.set(t * 0.012, -t * 0.03); });
    return mesh;
  };

  return kit;
}
