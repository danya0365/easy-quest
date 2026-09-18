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
export function buildGround(scene, { heightAt, masks, ao, shade = null, inner = 40, step = 0.8, outer = 128, rings = 16, tone = 0.38, ruts = 0.55, cobbleScale = 2.4, cobbleFlat = 0.34 } = {}) {
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
    sh.uniforms.uCobFlat = { value: cobbleFlat };
    sh.uniforms.uCobMidL = { value: (() => { const c = C3(PAL.stone.mid); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; })() };
    sh.uniforms.uKerb = { value: C3(PAL.stone.dark) }; sh.uniforms.uSnowLit = { value: C3(PAL.snow.light) };
    sh.uniforms.uSnowShade = { value: C3(PAL.snow.shade) }; sh.uniforms.uPuddle = { value: C3(PAL.water.mid) };
    for (const k of ['uEnvWet', 'uEnvSnow', 'uEnvPrecip', 'uEnvTime', 'uEnvNight']) sh.uniforms[k] = ENV.u[k];
    sh.uniforms.uEnvHorizon = ENV.u.uEnvHorizon;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGMask, tDirtMap, tDqShade, tCobbleMap; uniform vec4 uGMaskRect, uDqShadeRect; uniform float uDqShadeOn, uTone, uRuts, uCobbleScale, uCobFlat, uCobMidL, uEnvWet, uEnvSnow, uEnvPrecip, uEnvTime, uEnvNight; uniform vec3 uDry, uLip, uCrown, uBank, uLush, uClump, uDqShadeCol, uGDeep, uGMid, uGLight, uGSun, uKerb, uSnowLit, uSnowShade, uPuddle, uEnvHorizon;')
      .replace('#include <color_fragment>', /* glsl */`
  {
    vec2 mUv = ( vDqWorld.xz - uGMaskRect.xy ) / uGMaskRect.zw;
    float mIn = step( 0.0, mUv.x ) * step( mUv.x, 1.0 ) * step( 0.0, mUv.y ) * step( mUv.y, 1.0 );
    vec4 mk = texture2D( tGMask, mUv ) * mIn;
    vec3 nA = texture2D( tDqNoise, vDqWorld.xz * 0.017 ).rgb;
    vec3 nB = texture2D( tDqNoise, vDqWorld.xz * 0.061 + vec2( 0.31, 0.67 ) ).rgb;
    float edgeN = ( texture2D( tDqNoise, vDqWorld.xz * 0.21 + vec2( 0.13, 0.41 ) ).r - 0.5 ) * 0.16 + ( texture2D( tDqNoise, vDqWorld.xz * 0.85 ).g - 0.5 ) * 0.10;
    // painterly grass TONE: big soft patches between four greens, brightness kept from the grass texture
    vec3 macro = mix( uGDeep, uGMid, smoothstep( 0.18, 0.60, nA.r ) );
    macro = mix( macro, uGLight, smoothstep( 0.44, 0.82, nB.g ) * 0.92 );
    macro = mix( macro, uGSun, smoothstep( 0.54, 0.92, nA.g * 0.55 + nB.b * 0.45 ) * 0.70 );
    macro = mix( macro, uGDeep * 0.86, smoothstep( 0.62, 0.90, texture2D( tDqNoise, vDqWorld.xz * 0.0072 + vec2( 0.61, 0.23 ) ).b ) * 0.55 );
    float lum = dot( diffuseColor.rgb, vec3( 0.3333 ) ), mlum = max( dot( macro, vec3( 0.3333 ) ), 0.002 );
    diffuseColor.rgb = mix( diffuseColor.rgb, macro * ( lum / mlum ), uTone );
    // PAINTERLY LIGHT, at three scales. The macro mix above only moves the HUE (it keeps the texture's own
    // brightness), so a lawn could drift between four greens and still measure as one flat slab — which is what
    // it did: macro SD 15.1 / micro 3.36 against 21.2 / 4.95 on the approved frame, and 8.3 / 1.17 with the
    // camera close, where the baked tile is magnified into mush. These are brightness, in world space, so they
    // survive any magnification: cloud-sized drifts of sun and shade, a metre-scale mottle, and the fine
    // broken-up tone a brush leaves.
    float drift = texture2D( tDqNoise, vDqWorld.xz * 0.0135 + vec2( 0.17, 0.83 ) ).r;
    float mott = texture2D( tDqNoise, vDqWorld.xz * 0.115 + vec2( 0.53, 0.29 ) ).g;
    float fine = texture2D( tDqNoise, vDqWorld.xz * 0.62 + vec2( 0.11, 0.47 ) ).b;
    float fine2 = texture2D( tDqNoise, vDqWorld.xz * 1.9 + vec2( 0.71, 0.13 ) ).r;
    float paint = ( drift - 0.5 ) * 0.30 + ( mott - 0.5 ) * 0.24 + ( fine - 0.5 ) * 0.17 + ( fine2 - 0.5 ) * 0.11;
    // and a GRAIN, only where the camera is close enough to see it. The foreground lawn measured a micro
    // high-pass of 0.86 against 4.25 on the approved frame — a featureless slab under the hero's feet — because
    // every other term above is metres wide and the baked tile is magnified into mush. This one is a hand's
    // breadth across and fades out by 22 m, so it never aliases into shimmer on the far lawn.
    float nearG = 1.0 - smoothstep( 7.0, 24.0, length( vDqWorld - cameraPosition ) );
    if ( nearG > 0.004 ) {
      float g1 = texture2D( tDqNoise, vDqWorld.xz * 5.3 + vec2( 0.29, 0.61 ) ).g;
      float g2 = texture2D( tDqNoise, mat2( 0.7, -0.71, 0.71, 0.7 ) * vDqWorld.xz * 11.7 + vec2( 0.83, 0.07 ) ).r;
      paint += ( ( g1 - 0.5 ) * 0.42 + ( g2 - 0.5 ) * 0.30 ) * nearG;
    }
    diffuseColor.rgb *= clamp( 1.0 + paint * uTone * 2.6, 0.55, 1.46 );
    // and the greens themselves warm where the light pools and cool where it does not
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * mix( vec3( 0.92, 0.97, 0.90 ), vec3( 1.10, 1.05, 0.86 ), smoothstep( 0.35, 0.72, drift * 0.6 + mott * 0.4 ) ), uTone );
    // stream banks: lush damp grass, then a REAL bank — wet earth with shingle in it, and a dark damp seam
    // right at the waterline. Water that just stops on green grass is the thing that reads as a sticker.
    float wet = mk.g + edgeN * 0.35;
    // the bank's WIDTH wanders, so it is a shore and not a drawn outline round a blue shape
    // The bank's width wanders on TWO scales — a long 6 m swell plus a 2 m ripple — so the two sides of the
    // Beck stop being a pair of ruled brown ribbons. Total wander is about +/- 0.95 m of shore on each side.
    float wetB = wet + ( texture2D( tDqNoise, vDqWorld.xz * 0.17 + vec2( 0.41, 0.13 ) ).r - 0.5 ) * 0.42
                     + ( texture2D( tDqNoise, vDqWorld.xz * 0.55 + vec2( 0.21, 0.77 ) ).r - 0.5 ) * 0.17;
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, uLush * 0.88, 0.60 ), smoothstep( 0.02, 0.26, wetB ) );
    vec3 bankCol = mix( uBank, mix( uBank, uCrown, 0.55 ), smoothstep( 0.42, 0.88, texture2D( tDirtMap, vDqWorld.xz / 1.7 ).r ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, bankCol, smoothstep( 0.13, 0.45, wetB ) * 0.90 );
    diffuseColor.rgb = mix( diffuseColor.rgb, uBank * 0.68, smoothstep( 0.45, 0.55, wetB ) );
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
    // setts, not eggs: the tile's own round highlights are compressed back toward a mid stone value, so the
    // paving reads as small worn stones bedded in earth instead of a heap of pebbles lying on the ground
    float cl = max( dot( cob, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.02 );
    cob *= mix( 1.0, uCobMidL / cl, uCobFlat );
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
  kit.water = ({ stream, width = 2.8, ponds = [], y = -0.5, joinPonds = true, shoreDepth = 0.5, skirt = 1.9 } = {}) => {
    const parts = [];
    // The SKIRT is what makes a pond stop looking like a blue sticker: the sheet is laid `skirt` metres wider
    // than the caller asked for, all round, and its alpha fades out where the carved bed reaches the water
    // level. So the shoreline is the terrain's, ragged and per-centimetre, and the mesh edge is never seen —
    // it is always under ground that is higher than the water. Callers keep passing the width of the WATER.
    const halfW = width / 2 + Math.max(0, skirt);
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
        const nx = -dz / L, nz = dx / L, w = halfW;
        for (let k = 0; k <= XS; k++) { const o = -w + (2 * w * k) / XS; pos.push(pts[i][0] + nx * o, y, pts[i][1] + nz * o); }
        if (i) for (let k = 0; k < XS; k++) { const a0 = (i - 1) * (XS + 1) + k, b0 = a0 + XS + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
      }
      parts.push(mkGeo(pos, idx));
    }
    for (const p of ponds) {
      const SEG = 44, RINGS = 8, pos = [p.x, y + 0.002, p.z], idx = [];
      for (let j = 1; j <= RINGS; j++) for (let q = 0; q < SEG; q++) {
        const a = q / SEG * Math.PI * 2, rr = (p.r + Math.max(0, skirt)) * j / RINGS;
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
    // transparent so the sheet can dissolve into the bank instead of ending on a rim; depthWrite stays on so
    // the hero, reeds and lilies still sort against it
    const mat = new THREE.MeshBasicMaterial({ map: Tex.water(), fog: true, transparent: true, depthWrite: true, alphaTest: 0.02 });
    // WHO IS IN THE WATER. kit.focus is the hero's position (src/world/field.js passes it to kit.update each
    // frame), so the sheet knows where he is standing and can ring him with ripples instead of being a plane he
    // passes through. x, z, how deep he is in it, and how long ago he stepped in.
    const actor = { value: new THREE.Vector4(0, 0, 0, 99) };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDqShallow = { value: C3(PAL.water.light) }; sh.uniforms.uDqFoam = { value: C3(PAL.water.foam) };
      sh.uniforms.uDqDeep = { value: C3(PAL.water.deep) }; sh.uniforms.uDqMid = { value: C3(PAL.water.mid) }; sh.uniforms.uDqSand = { value: C3(mixHex(PAL.dirt.pebble, PAL.water.light, 0.45)) };
      // what lies in the low reflections: the bank, the reeds and the trees on the far side
      sh.uniforms.uDqBank = { value: C3(mixHex(PAL.foliage.dark, PAL.water.deep, 0.42)) };
      sh.uniforms.uDqShore = { value: shoreDepth }; sh.uniforms.tDqNoise = { value: Tex.noise() };
      sh.uniforms.uDqActor = actor;
      // the water is unlit (MeshBasic), so it takes the hour from ENV: the sky sits in it, and rain dimples it
      for (const k of ['uEnvLight', 'uEnvHorizon', 'uEnvNight', 'uEnvPrecip', 'uEnvTime', 'uEnvSun', 'uEnvMoonVis', 'uEnvSunDir',
        'uEnvMoonDir', 'uEnvTwilight', 'uEnvTwilightCol', 'uEnvSunVis', 'uEnvDusk', 'uEnvWindXZ']) sh.uniforms[k] = ENV.u[k];
      sh.uniforms.uEnvZenith = ENV.sky.uZenith;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDepth; varying float vDqDepth; varying vec2 vDqWXZ; varying vec3 vDqWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDqDepth = aDepth; vDqWPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz; vDqWXZ = vDqWPos.xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDqDepth; varying vec2 vDqWXZ; varying vec3 vDqWPos; uniform sampler2D tDqNoise; uniform vec3 uDqShallow, uDqFoam, uDqDeep, uDqSand, uDqMid, uDqBank, uEnvLight, uEnvHorizon, uEnvSun, uEnvSunDir, uEnvMoonDir, uEnvTwilightCol, uEnvZenith; uniform float uDqShore, uEnvNight, uEnvPrecip, uEnvTime, uEnvMoonVis, uEnvSunVis, uEnvTwilight, uEnvDusk; uniform vec2 uEnvWindXZ; uniform vec4 uDqActor;\nfloat dqN( vec2 p ){ return texture2D( tDqNoise, p ).g; }')
        .replace('#include <map_fragment>', `#include <map_fragment>
  {
    // ════ A SURFACE, NOT A FILL ════════════════════════════════════════════════════════════════════════════
    // The old sheet was one blue colour with a printed ripple tile on it: luminance SD 3.94 against 19.4 for the
    // grass beside it. Everything below exists to put STRUCTURE in it — a moving surface with a real normal, the
    // sky and the bank lying in that normal, a glitter path where the sun is, light on the bed, and rings round
    // whoever is standing in it.
    vec2 W = vDqWXZ, wind = uEnvWindXZ;
    // three crossing wave trains, each on its own heading and speed; the gradient of their sum is the normal
    vec2 a1 = W * 0.21 + wind * uEnvTime * 0.016;
    vec2 a2 = mat2( 0.78, -0.63, 0.63, 0.78 ) * W * 0.40 - wind * uEnvTime * 0.026;
    vec2 a3 = mat2( 0.32, 0.95, -0.95, 0.32 ) * W * 0.95 + vec2( uEnvTime * 0.042, -uEnvTime * 0.024 );
    // a fourth, fine train: without it the water is smooth glass wherever the camera is CLOSE to it (the near
    // half of the Beck measured micro 0.34 against 2.5 for the grass beside it), because every other octave is
    // metres wide on screen
    vec2 a4 = mat2( 0.62, 0.78, -0.78, 0.62 ) * W * 3.05 + vec2( -uEnvTime * 0.085, uEnvTime * 0.058 );
    float e = 0.045;
    float h0 = dqN( a1 ) * 0.44 + dqN( a2 ) * 0.28 + dqN( a3 ) * 0.16 + dqN( a4 ) * 0.12;
    float hx = dqN( a1 + vec2( e, 0.0 ) ) * 0.44 + dqN( a2 + vec2( e, 0.0 ) ) * 0.28 + dqN( a3 + vec2( e, 0.0 ) ) * 0.16 + dqN( a4 + vec2( e, 0.0 ) ) * 0.12;
    float hz = dqN( a1 + vec2( 0.0, e ) ) * 0.44 + dqN( a2 + vec2( 0.0, e ) ) * 0.28 + dqN( a3 + vec2( 0.0, e ) ) * 0.16 + dqN( a4 + vec2( 0.0, e ) ) * 0.12;
    vec2 grad = vec2( hx - h0, hz - h0 ) / e;
    float fineRip = dqN( a4 ) * 0.55 + dqN( a4 * 2.4 + vec2( 0.31, 0.77 ) ) * 0.45;
    // ── the hero wading: expanding rings from where he stands, and a burst when he steps in ──
    float toActor = length( W - uDqActor.xy );
    float wade = uDqActor.z, ringAmt = 0.0;
    if ( wade > 0.001 ) {
      float rings = sin( toActor * 6.2 - uEnvTime * 4.2 ) * exp( -toActor * 1.05 ) * wade;
      float splash = exp( -max( 0.0, toActor - uDqActor.w * 2.6 ) * 5.0 ) * exp( -uDqActor.w * 2.2 );
      grad += normalize( W - uDqActor.xy + vec2( 1e-4 ) ) * ( rings * 5.5 + splash * 8.0 );
      h0 += ( rings * 0.07 + splash * 0.12 );
      ringAmt = max( 0.0, rings ) + splash * 0.8;
    }
    float amp = 0.048;
    vec3 N = normalize( vec3( -grad.x * amp, 1.0, -grad.y * amp ) );
    float ripple = ( h0 - 0.5 ) * 1.3;
    // ── the bed, read through the water ───────────────────────────────────────────────────────────────────
    float d = max( vDqDepth, 0.0 ) + ripple * 0.05;
    float shallow = 1.0 - smoothstep( 0.02, uDqShore * 1.3, d );
    float deep = smoothstep( uDqShore * 1.05, uDqShore * 4.2, d );
    // the painted tile is only a hint now; the light on the bed comes from real caustics
    // The ramp used to put 34 percent of a very pale blue (PAL.water.light) through the whole middle of a beck
    // 0.6 m deep, which is why it measured flatter and paler than anything else in the game. Now the body of the
    // water is the palette's MID blue going to DEEP as the bed drops, and only the last hand's breadth of
    // shallows lightens toward wet shingle.
    vec3 bed = mix( uDqMid, diffuseColor.rgb, 0.18 ) * 0.80;
    bed = mix( bed, uDqSand, shallow * shallow * 0.55 );
    bed = mix( bed, uDqDeep, smoothstep( uDqShore * 0.55, uDqShore * 2.6, d ) * 0.74 );
    bed = mix( bed, mix( uDqMid, uDqShallow, 0.45 ), ( 1.0 - deep ) * ( 1.0 - shallow ) * 0.16 );
    // caustics: the net of light the surface throws on the bottom, brightest where it is shallow
    float caus = smoothstep( 0.46, 0.86, dqN( a1 * 1.8 + grad * 0.02 ) * 0.5 + dqN( a2 * 1.6 - grad * 0.02 ) * 0.5 );
    bed *= 1.0 + caus * ( 0.13 + 0.20 * shallow ) * uEnvSunVis;
    bed *= 0.87 + 0.17 * smoothstep( 0.2, 0.8, dqN( W * 0.21 ) );        // gravel and weed in the bottom
    // ── what lies in the surface ──────────────────────────────────────────────────────────────────────────
    vec3 vdir = normalize( vDqWPos - cameraPosition );
    vec3 R = reflect( vdir, N );
    float ry = clamp( R.y, -1.0, 1.0 );
    vec3 refl = mix( uEnvHorizon, uEnvZenith, smoothstep( 0.0, 0.52, ry ) );
    refl = mix( uDqBank, refl, smoothstep( -0.05, 0.13, ry ) );          // the bank and its trees, upside down
    refl = mix( refl, uEnvTwilightCol, uEnvTwilight * 0.45 );
    // Fresnel off the REAL normal, so the reflection breaks up across the wavelets instead of being one wash
    float fres = 0.025 + 0.975 * pow( 1.0 - clamp( dot( -vdir, N ), 0.0, 1.0 ), 4.2 );
    vec3 col = mix( bed, refl, clamp( fres * ( 0.66 - 0.34 * shallow ), 0.0, 0.72 ) );
    // ── the glitter path: the sun (or the moon) broken over the wavelets, and it moves with the hour ──────
    vec3 L = normalize( mix( uEnvSunDir, uEnvMoonDir, uEnvNight ) );
    float toSun = max( dot( R, L ), 0.0 );
    float lit = mix( uEnvSunVis, uEnvMoonVis * 0.85, uEnvNight );
    // A GLITTER PATH, not a white patch. The lobe is tight and it is CUT UP by the fine wave train, so the sun
    // on the water is a scatter of sparks that travels with the hour instead of one blown-out smear.
    float glint = pow( toSun, 150.0 ) * ( 0.22 + 1.45 * smoothstep( 0.50, 0.92, fineRip ) );
    col += uEnvSun * glint * 1.5 * lit;
    col += uEnvSun * pow( toSun, 11.0 ) * 0.09 * lit;                    // the sheen round the path
    // one very fine train, about a hand's breadth across, so there is still something happening on the surface
    // when the camera is right down on it — and so the sun path sparkles instead of being a sheet
    float spark = dqN( W * 9.5 + vec2( uEnvTime * 0.26, -uEnvTime * 0.19 ) );
    col *= 0.972 + 0.054 * spark;
    // and a last, very fine chop for when the camera is right down on the water: without it the near half of the
    // Beck measured a micro high-pass of 0.56 against 3.9 for the grass beside it — glass, not water. It fades
    // out by 18 m so it can never alias into shimmer on the far surface.
    float nearW = 1.0 - smoothstep( 5.0, 18.0, length( vDqWPos - cameraPosition ) );
    if ( nearW > 0.004 ) {
      // 5.5 and 12 cycles a metre, not 24 and 41: a noise tile squeezed below a few pixels is minified back to
      // flat grey by the GPU, so pushing the frequency higher buys nothing and costs a fetch.
      float chop = dqN( W * 5.5 + vec2( -uEnvTime * 0.16, uEnvTime * 0.12 ) ) * 0.58
                 + dqN( mat2( 0.6, 0.8, -0.8, 0.6 ) * W * 12.0 - vec2( uEnvTime * 0.21, 0.0 ) ) * 0.42;
      col *= 1.0 + ( chop - 0.5 ) * 0.26 * nearW;
      col += uEnvSun * smoothstep( 0.84, 1.0, chop ) * pow( toSun, 6.0 ) * 0.35 * lit * nearW;
    }
    col += uEnvSun * smoothstep( 0.80, 0.99, spark ) * pow( toSun, 7.0 ) * 0.55 * lit;
    col = min( col, vec3( 1.12 ) );
    // ── the waterline ─────────────────────────────────────────────────────────────────────────────────────
    float edgeN = ( texture2D( tDqNoise, W * 1.7 ).b - 0.5 ) * 0.045;
    float de = d + edgeN;
    float foam = ( 1.0 - smoothstep( 0.008, 0.06, de ) ) * ( 0.30 + 0.70 * texture2D( tDqNoise, W * 3.4 + vec2( uEnvTime * 0.05, 0.0 ) ).g );
    foam = max( foam, exp( -max( 0.0, toActor - 0.26 ) * 16.0 ) * wade * ( 0.10 + 0.30 * smoothstep( 0.55, 0.95, h0 ) ) );
    col = mix( col, uDqFoam, clamp( foam, 0.0, 1.0 ) * 0.34 );
    col += uDqFoam * ringAmt * 0.30;                  // the crest of each ring catches the light
    // the fine train also shades the colour directly, so a wavelet reads even when it is too small to tilt
    col *= 0.905 + 0.195 * fineRip;
    // keep the blue BLUE: the reflection, the caustics and the foam all pull toward white, and a river that goes
    // grey stops reading as water at all
    col = mix( vec3( dot( col, vec3( 0.2126, 0.7152, 0.0722 ) ) ), col, 1.22 );
    col = mix( col, uDqDeep * 0.62, ( 1.0 - smoothstep( 0.0, 0.03, de ) ) * 0.28 );
    // ── the hour ──────────────────────────────────────────────────────────────────────────────────────────
    col *= uEnvLight;
    col = mix( col, uEnvHorizon * mix( 1.0, 0.5, uEnvNight ), 0.05 + 0.20 * uEnvNight );
    if ( uEnvPrecip > 0.01 ) {                        // rain rings, one per metre cell, each on its own beat
      vec2 cell = W * 1.4;
      vec2 id = floor( cell ), f = fract( cell ) - 0.5;
      float hsh = fract( sin( dot( id, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      float tt = fract( uEnvTime * 1.35 + hsh );
      float rr = 0.06 + tt * 0.4, r = length( f );
      float ring = smoothstep( rr, rr - 0.07, r ) - smoothstep( rr - 0.05, rr - 0.13, r );
      col = mix( col, uDqFoam, clamp( ring, 0.0, 1.0 ) * ( 1.0 - tt ) * uEnvPrecip * 0.55 );
    }
    diffuseColor.rgb = col;
    // the sheet dissolves into the bank over the last ~7 cm of depth, so there is no rim and no seam: the
    // shore is wherever the carved bed rises to the water level, and nothing hangs over the grass
    diffuseColor.a = smoothstep( -0.015, 0.085, vDqDepth + edgeN * 0.8 );
  }`);
    };
    mat.customProgramCacheKey = () => 'kitwater|surface10';
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'water'; mesh.renderOrder = 0; scene.add(mesh);
    // Each frame: where is the hero, and is he in the water? `wade` eases in and out so stepping in and climbing
    // out both animate; `since` counts the seconds from the moment he entered, which drives the entry splash.
    let wade = 0, since = 99;
    animators.push((t, dt) => {
      Tex.water().offset.set(t * 0.012, -t * 0.03);
      const f = kit.focus;
      const D = f ? y - heightAt(f.x, f.z) : -1;                       // how deep the ground is under him
      const inWater = !!f && D > 0.05;
      if (inWater && wade < 0.02) since = 0; else since += (dt || 0.016);
      wade += ((inWater ? Math.min(1, D / 0.45) : 0) - wade) * Math.min(1, (dt || 0.016) * 6);
      if (f) actor.value.set(f.x, f.z, wade, Math.min(9, since));
      else actor.value.set(0, 0, 0, 9);
    });
    mesh.userData.wade = () => ({ x: +actor.value.x.toFixed(2), z: +actor.value.y.toFixed(2),
      wading: +actor.value.z.toFixed(3), since: +actor.value.w.toFixed(2) });
    return mesh;
  };

  return kit;
}
