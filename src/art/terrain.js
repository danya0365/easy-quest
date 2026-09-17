/**
 * terrain.js — the ground a map stands on: lane / stream masks, distance fields, the painted ground mesh, and water.
 *                                                                                   (P03, owner: src/art/terrain.js)
 *
 * Recipes are docs/ART-DIRECTION.md §10 expressed ONLY through F3's foundation (PAL, Tex, makeToon, AO masks).
 * Moved verbatim out of src/world/scenery.js (the vertical slice's kit); signatures are a contract maps rely on.
 *
 *   curvePoints(pts, step)                      dense [[x, z]] along a Catmull-Rom (lanes, streams)
 *   paintMasks({N, span, center, strokes, discs}) -> {sample(ch, x, z), texture(), rect, ...}
 *        channel 0 = worn path / lane · 1 = water + banks · 2 = stone or cobble paving (a village green, a quay, a yard)
 *   distanceGrid({N, span, center, lines, discs, maxR}) -> {sample(x, z)}            exact distance, for shaping
 *   buildGround(scene, {heightAt, masks, ao, shade, inner, step, outer, rings, tone, ruts}) -> Mesh   one draw call
 *   terrainRecipes(kit)                          adds kit.water({stream, width, ponds, y, joinPonds, shoreDepth})
 *
 * The ground follows the sky: src/art/weather.js ENV gives it the hour's light through wet lanes, puddles that mirror
 * the sky, and a settling of snow, so __DQ.timeOfDay / __DQ.weather change the ground with no map edit.
 *
 * Kit contract used here (src/art/props.js createPropsKit): kit.scene, kit.heightAt, kit.animators.push(fn(t, dt, cam)).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, lerp, smooth, clamp01, mixHex } from './palette.js';
import { Tex } from './tex.js';
import { makeToon, worldPlanar, aoPatch } from './toon.js';
import { ENV } from './weather.js';

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
 * strokes: [{pts: dense [[x,z]], w: width, falloff?, channel: 0|1|2}]   discs: [{x, z, r, falloff?, channel}]
 * value = clamp01(0.5 + (halfWidth - distance) / (2 * falloff)) -> exactly 0.5 on the edge, max over strokes.
 * Channels: 0 path, 1 water, 2 stone/cobble paving.
 * Returns {N, span, center, ch: [Float32Array x3], sample(ch, x, z), texture()}
 */
export function paintMasks({ N = 1024, span = 96, center = [0, 0], strokes = [], discs = [] } = {}) {
  const pxu = N / span, ox = center[0] - span / 2, oz = center[1] - span / 2;
  const ch = [new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N)];
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
      for (let k = 0; k < N * N; k++) { data[k * 4] = ch[0][k] * 255; data[k * 4 + 1] = ch[1][k] * 255; data[k * 4 + 2] = ch[2][k] * 255; data[k * 4 + 3] = 255; }
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
export function buildGround(scene, { heightAt, masks, ao, shade = null, inner = 40, step = 0.8, outer = 128, rings = 16, tone = 0.38, ruts = 0.55, cobbleScale = 5.0 } = {}) {
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
    // painterly tone: the big four-green macro mix of ART-DIRECTION §10, laid over the tuned grass texture as TONE
    // only (the texture keeps its own light and shade), so the lawn drifts between greens and never tiles
    sh.uniforms.uGDeep = { value: C3(PAL.grass.deep) }; sh.uniforms.uGMid = { value: C3(PAL.grass.mid) };
    sh.uniforms.uGLight = { value: C3(PAL.grass.light) }; sh.uniforms.uGSun = { value: C3(PAL.grass.sun) };
    sh.uniforms.uTone = { value: tone }; sh.uniforms.uRuts = { value: ruts };
    sh.uniforms.tCobbleMap = { value: Tex.cobble() }; sh.uniforms.uCobbleScale = { value: 1 / cobbleScale };
    sh.uniforms.uKerb = { value: C3(PAL.stone.dark) }; sh.uniforms.uSnowLit = { value: C3(PAL.snow.light) };
    sh.uniforms.uSnowShade = { value: C3(PAL.snow.shade) }; sh.uniforms.uPuddle = { value: C3(PAL.water.mid) };
    for (const k of ['uEnvWet', 'uEnvSnow', 'uEnvPrecip', 'uEnvTime', 'uEnvNight']) sh.uniforms[k] = ENV.u[k];
    sh.uniforms.uEnvHorizon = ENV.u.uEnvHorizon;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGMask, tDirtMap, tDqShade, tCobbleMap; uniform vec4 uGMaskRect, uDqShadeRect; uniform float uDqShadeOn, uTone, uRuts, uCobbleScale, uEnvWet, uEnvSnow, uEnvPrecip, uEnvTime, uEnvNight; uniform vec3 uDry, uLip, uCrown, uBank, uLush, uClump, uDqShadeCol, uGDeep, uGMid, uGLight, uGSun, uKerb, uSnowLit, uSnowShade, uPuddle, uEnvHorizon;')
      .replace('#include <color_fragment>', /* glsl */`
  {
    vec2 mUv = ( vDqWorld.xz - uGMaskRect.xy ) / uGMaskRect.zw;
    float mIn = step( 0.0, mUv.x ) * step( mUv.x, 1.0 ) * step( 0.0, mUv.y ) * step( mUv.y, 1.0 );
    vec4 mk = texture2D( tGMask, mUv ) * mIn;
    vec3 nA = texture2D( tDqNoise, vDqWorld.xz * 0.017 ).rgb;
    vec3 nB = texture2D( tDqNoise, vDqWorld.xz * 0.061 + vec2( 0.31, 0.67 ) ).rgb;
    float edgeN = ( texture2D( tDqNoise, vDqWorld.xz * 0.21 + vec2( 0.13, 0.41 ) ).r - 0.5 ) * 0.16 + ( texture2D( tDqNoise, vDqWorld.xz * 0.85 ).g - 0.5 ) * 0.10;
    // painterly grass TONE: big soft patches between four greens, brightness kept from the grass texture
    vec3 macro = mix( uGDeep, uGMid, smoothstep( 0.22, 0.58, nA.r ) );
    macro = mix( macro, uGLight, smoothstep( 0.48, 0.80, nB.g ) * 0.75 );
    macro = mix( macro, uGSun, smoothstep( 0.58, 0.90, nA.g * 0.55 + nB.b * 0.45 ) * 0.5 );
    float lum = dot( diffuseColor.rgb, vec3( 0.3333 ) ), mlum = max( dot( macro, vec3( 0.3333 ) ), 0.002 );
    diffuseColor.rgb = mix( diffuseColor.rgb, macro * ( lum / mlum ), uTone );
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
    dirt = mix( dirt, mix( dirt, uCrown, 0.45 ), smoothstep( 0.74, 0.98, mk.r ) * ( 0.4 + 0.6 * nB.r ) );
    dirt = mix( dirt, uLip * 0.92, ( 1.0 - smoothstep( 0.5, 0.58, pd ) ) * 0.45 );
    // cart ruts: two worn bands either side of the crown, broken up so they never look drawn with a ruler
    float rut = smoothstep( 0.60, 0.78, pd ) * ( 1.0 - smoothstep( 0.78, 0.94, pd ) );
    dirt = mix( dirt, dirt * 0.80, rut * uRuts * ( 0.45 + 0.55 * texture2D( tDqNoise, vDqWorld.xz * 0.33 ).b ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, dirt, isPath );
    // stone / cobble paving (mask B): a crisp edge with a darker kerb and a scuffed rim of dry grass outside it
    float cd = mk.b + edgeN * 0.5;
    float aaC = fwidth( cd ) * 0.8 + 0.003;
    float isCob = smoothstep( 0.5 - aaC, 0.5 + aaC, cd );
    float cobRim = smoothstep( 0.26, 0.5, cd ) * ( 1.0 - isCob );
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, uDry, 0.5 ), cobRim * 0.7 );
    // two rotated samples swapped by close noise + earth worn through between the stones, so the paving never tiles
    vec2 cUv = vDqWorld.xz * uCobbleScale;
    vec3 cNoise = texture2D( tDqNoise, vDqWorld.xz * 0.19 + vec2( 0.53, 0.17 ) ).rgb;
    vec3 cob = mix( texture2D( tCobbleMap, cUv ).rgb, texture2D( tCobbleMap, mat2( 0.8, -0.6, 0.6, 0.8 ) * cUv * 0.71 + vec2( 0.37, 0.61 ) ).rgb, smoothstep( 0.38, 0.62, cNoise.g ) );
    cob *= 0.88 + 0.24 * nA.r;
    cob = mix( cob, mix( cob, dirt, 0.75 ), smoothstep( 0.52, 0.86, cNoise.r * 0.6 + nB.b * 0.4 ) * 0.7 );
    cob = mix( cob, cob * 0.82, ( 1.0 - smoothstep( 0.5, 0.62, cd ) ) * 0.7 );
    cob = mix( cob, mix( cob, uKerb, 0.45 ), ( 1.0 - smoothstep( 0.5, 0.56, cd ) ) * 0.8 );
    diffuseColor.rgb = mix( diffuseColor.rgb, cob, isCob );
    float hard = max( isPath, isCob );
    // rain: everything darkens, the lanes go properly dark, shallow puddles mirror the sky — and the grass
    // itself takes a wet sheen, brightest where the ground is seen at a grazing angle (the far lawn gleams)
    if ( uEnvWet > 0.002 ) {
      float w = uEnvWet;
      diffuseColor.rgb *= mix( 1.0, mix( 0.74, 0.58, hard ), w );
      vec3 vdirG = normalize( vDqWorld - cameraPosition );
      float grazeG = pow( 1.0 - clamp( abs( vdirG.y ), 0.0, 1.0 ), 3.0 );
      float sheen = grazeG * w * ( 0.55 + 0.45 * smoothstep( 0.35, 0.8, nB.g ) );
      diffuseColor.rgb = mix( diffuseColor.rgb, mix( uEnvHorizon, uPuddle, 0.3 ), sheen * 0.30 );
      float pud = smoothstep( 0.62, 0.88, texture2D( tDqNoise, vDqWorld.xz * 0.12 + vec2( 0.7, 0.2 ) ).r ) * hard * w;
      diffuseColor.rgb = mix( diffuseColor.rgb, mix( uEnvHorizon * 0.7, uPuddle, 0.35 ), pud * 0.55 );
    }
    // snow: a dusting that settles on the grass first and keeps off the trodden lanes longest
    if ( uEnvSnow > 0.002 ) {
      float cover = clamp( uEnvSnow * ( 0.45 + 0.8 * texture2D( tDqNoise, vDqWorld.xz * 0.11 + vec2( 0.13, 0.83 ) ).r ) - hard * 0.35 * ( 1.0 - uEnvSnow * 0.7 ) - smoothstep( 0.3, 0.5, wet ), 0.0, 1.0 );
      vec3 sn = mix( uSnowLit, uSnowShade, ( 1.0 - smoothstep( 0.3, 0.72, nB.g * 0.6 + nA.b * 0.4 ) ) * 0.45 );
      diffuseColor.rgb = mix( diffuseColor.rgb, sn, smoothstep( 0.08, 0.85, cover ) * 0.94 );
    }
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
      sh.uniforms.uDqDeep = { value: C3(PAL.water.deep) }; sh.uniforms.uDqSand = { value: C3(mixHex(PAL.dirt.pebble, PAL.water.light, 0.45)) };
      sh.uniforms.uDqShore = { value: shoreDepth }; sh.uniforms.tDqNoise = { value: Tex.noise() };
      // the water is unlit (MeshBasic), so it takes the hour from ENV: the sky sits in it, and rain dimples it
      for (const k of ['uEnvLight', 'uEnvHorizon', 'uEnvNight', 'uEnvPrecip', 'uEnvTime', 'uEnvSun', 'uEnvMoonVis', 'uEnvSunDir',
        'uEnvMoonDir', 'uEnvTwilight', 'uEnvTwilightCol', 'uEnvSunVis', 'uEnvDusk', 'uEnvWindXZ']) sh.uniforms[k] = ENV.u[k];
      sh.uniforms.uEnvZenith = ENV.sky.uZenith;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDepth; varying float vDqDepth; varying vec2 vDqWXZ; varying vec3 vDqWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDqDepth = aDepth; vDqWPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz; vDqWXZ = vDqWPos.xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDqDepth; varying vec2 vDqWXZ; varying vec3 vDqWPos; uniform sampler2D tDqNoise; uniform vec3 uDqShallow, uDqFoam, uDqDeep, uDqSand, uEnvLight, uEnvHorizon, uEnvSun, uEnvSunDir, uEnvMoonDir, uEnvTwilightCol, uEnvZenith; uniform float uDqShore, uEnvNight, uEnvPrecip, uEnvTime, uEnvMoonVis, uEnvSunVis, uEnvTwilight, uEnvDusk; uniform vec2 uEnvWindXZ;')
        .replace('#include <map_fragment>', `#include <map_fragment>
  {
    // ── the bed, read through the water ────────────────────────────────────────────────────────────────────
    // Two ripple fields crossing at an angle (never one printed pattern), drifting on the wind.
    vec2 w1 = vDqWXZ * 0.34 + uEnvWindXZ * uEnvTime * 0.012;
    vec2 w2 = mat2( 0.83, -0.56, 0.56, 0.83 ) * vDqWXZ * 0.57 - uEnvWindXZ * uEnvTime * 0.021;
    float n1 = texture2D( tDqNoise, w1 ).g, n2 = texture2D( tDqNoise, w2 ).r;
    float ripple = ( n1 - 0.5 ) * 0.62 + ( n2 - 0.5 ) * 0.38;
    float d = max( vDqDepth, 0.0 ) + ripple * 0.06;
    // depth: a proper gradient from sand, through shallow, to deep — not a flat plane of blue
    float shallow = 1.0 - smoothstep( 0.04, uDqShore * 2.4, d );
    float deep = smoothstep( uDqShore * 1.6, uDqShore * 5.5, d );
    diffuseColor.rgb = mix( diffuseColor.rgb, uDqSand, shallow * shallow * 0.78 );
    diffuseColor.rgb = mix( diffuseColor.rgb, uDqDeep, deep * 0.62 );
    diffuseColor.rgb = mix( diffuseColor.rgb, uDqShallow, ( 1.0 - deep ) * ( 1.0 - shallow ) * 0.3 );
    // ── the sky lying in it ───────────────────────────────────────────────────────────────────────────────
    // A flat sheet reflects the sky hard at grazing angles and the bed straight down (Fresnel, cheap and honest).
    vec3 vdir = normalize( vDqWPos - cameraPosition );
    float graze = 1.0 - clamp( abs( vdir.y ) + ripple * 0.10, 0.0, 1.0 );
    float fres = pow( graze, 3.4 );
    vec3 skyCol = mix( uEnvHorizon, uEnvZenith, 0.35 );
    diffuseColor.rgb = mix( diffuseColor.rgb, skyCol, fres * ( 0.66 - 0.3 * shallow ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, uEnvTwilightCol, uEnvTwilight * fres * 0.34 );
    // ── the sun (or the moon) on the water: a broken, moving glitter path ─────────────────────────────────
    vec3 L = normalize( mix( uEnvSunDir, uEnvMoonDir, uEnvNight ) );
    vec3 R = reflect( vdir, normalize( vec3( ripple * 0.22, 1.0, ripple * 0.18 ) ) );
    float spec = pow( max( dot( R, L ), 0.0 ), 34.0 );
    float glitter = smoothstep( 0.52, 0.92, n1 * 0.6 + n2 * 0.4 );
    diffuseColor.rgb += uEnvSun * spec * ( 0.35 + 1.5 * glitter ) * mix( uEnvSunVis, uEnvMoonVis * 0.8, uEnvNight );
    // ── the waterline: wet sand, a soft ragged foam, and a dark seam right at the bank ────────────────────
    float edgeN = ( texture2D( tDqNoise, vDqWXZ * 1.7 ).b - 0.5 ) * 0.055;
    float de = d + edgeN;
    float foam = ( 1.0 - smoothstep( 0.0, 0.10, de ) ) * ( 0.45 + 0.55 * texture2D( tDqNoise, vDqWXZ * 2.6 + vec2( uEnvTime * 0.05, 0.0 ) ).g );
    diffuseColor.rgb = mix( diffuseColor.rgb, uDqFoam, clamp( foam, 0.0, 1.0 ) * 0.62 );
    diffuseColor.rgb = mix( diffuseColor.rgb, uDqDeep * 0.55, ( 1.0 - smoothstep( 0.0, 0.035, de ) ) * 0.35 );
    // ── the hour ──────────────────────────────────────────────────────────────────────────────────────────
    diffuseColor.rgb *= uEnvLight;
    diffuseColor.rgb = mix( diffuseColor.rgb, uEnvHorizon * mix( 1.0, 0.5, uEnvNight ), 0.10 + 0.22 * uEnvNight );
    if ( uEnvPrecip > 0.01 ) {                        // rain rings, one per metre cell, each on its own beat
      vec2 cell = vDqWXZ * 1.4;
      vec2 id = floor( cell ), f = fract( cell ) - 0.5;
      float hsh = fract( sin( dot( id, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      float tt = fract( uEnvTime * 1.35 + hsh );
      float rr = 0.06 + tt * 0.4, r = length( f );
      float ring = smoothstep( rr, rr - 0.07, r ) - smoothstep( rr - 0.05, rr - 0.13, r );
      diffuseColor.rgb = mix( diffuseColor.rgb, uDqFoam, clamp( ring, 0.0, 1.0 ) * ( 1.0 - tt ) * uEnvPrecip * 0.55 );
    }
    // the foam line and the glitter must not be dimmed away by the alpha-free basic material's own map
    diffuseColor.a = 1.0;
  }`);
    };
    mat.customProgramCacheKey = () => 'kitwater|shore|env|depth2';
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'water'; mesh.renderOrder = 0; scene.add(mesh);
    animators.push((t) => { Tex.water().offset.set(t * 0.012, -t * 0.03); });
    return mesh;
  };

  return kit;
}
