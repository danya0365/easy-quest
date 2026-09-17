/**
 * toon.js — the DQV cel look as reusable code.                                        (F3, owner: src/art/toon.js)
 *
 * Implements docs/ART-DIRECTION.md §3-6 (+ the §18 "next steps" wind sway). Read that doc for the why.
 *
 *   import { Toon, makeToon, withOutline, makeLightRig, makeFog, makeBlobShadows } from '../art/toon.js';
 *
 * ── Materials ────────────────────────────────────────────────────────────────────────────────────────────────
 *   makeToon(opts, toon?, extra?, key?)   (alias dqToon) MeshToonMaterial with the custom 3-band ramp + saturated,
 *        tinted shade. `opts` = MeshToonMaterial params. `toon` = {edge, soft, mid, midEdge, shadeSat, wind,
 *        windBase, windSpeed} or a preset name from TOON_PRESETS ('plaster', 'canopy', 'ground', ...).
 *        wind = sway per unit of local height above windBase (canopy ~0.02, tufts ~0.12); NEGATIVE wind hangs
 *        from windBase and sways more below it (laundry, banners). Outlines need the same wind values.
 *        `extra` = shader patch fn(shader, material) or an array of them (Toon.worldPlanar(), Toon.aoPatch()).
 *        Materials share one GPU program per key+patches (customProgramCacheKey), so make as many as you like.
 *   Toon.surface(texName, {vertexColors, color, preset, side, alphaTest, worldPlanar})
 *        cached textured material for a Tex recipe: Toon.surface('thatch', {vertexColors: true})
 *   Toon.gradientMap([levels]) / Toon.stock(opts, levels)   classic gradientMap toon (fallback / special cases).
 *        In three r180 gradientMap reads only .r, so coloured shade is impossible that way — prefer makeToon.
 *   Toon.tune(key, value)   live-tune every toon material (edge soft mid midEdge shadeSat wind)
 *   Toon.tick(seconds)      advance the shared wind clock (call once per frame with App.clock.time)
 *
 * ── Outlines (inverted hull; organic silhouettes only — characters, monsters, trees, bushes) ────────────────
 *   outlineMaterial(hex = PAL.outline.char, {wind, windBase})   cached BackSide basic material
 *   hullGeometry(geo, thickness)       clone pushed out along normals (cached per geometry+thickness)
 *   withOutline(mesh, thickness?, mat?) adds the hull as a child; returns mesh
 *   outlineInstanced(inst, thickness, mat)  hull InstancedMesh sharing the SAME instanceMatrix attribute
 *   Toon.setOutlines(bool)             show/hide every outline
 *   OUTLINE  thickness table (char 0.018, head 0.02, slime 0.018, canopy 0.04)
 *   Rules: never on boxes (hulls crack at hard edges), never on buildings/props/terrain, never pure black.
 *
 * ── Normals tricks ───────────────────────────────────────────────────────────────────────────────────────────
 *   spherizeNormals(geo, center?, amount)  bend normals toward a centre -> one big soft terminator (canopies)
 *   normalsUp(geo)                          cards lit exactly like the ground under them (tufts, flowers)
 *
 * ── Light rig + fog ──────────────────────────────────────────────────────────────────────────────────────────
 *   makeLightRig({scene?, preset='day', shadowMapSize?, extent=30, shadows=true})
 *        -> rig {sun, hemi, group, dir, apply(preset), blend(a, b, t), follow(focusVec3), setExtent(e), state()}
 *        Warm sun PAL.light.sun @1.9 from SUN_DIR + lavender/tan hemisphere @1.55; NO ambient light. Shadow camera is
 *        texel-snapped in follow() so shadows don't swim while the camera moves.
 *   RIG_PRESETS  day (tuned) | dusk | night | interior | cave
 *   makeFog(scene, presetOrParams)  THREE.Fog(PAL.sky.haze, 40, 300) for 'day'
 *
 * ── Contact shadows ──────────────────────────────────────────────────────────────────────────────────────────
 *   makeAOMask({span, size, center})  paint soft AO under static things into a world-space mask:
 *        mask.disc(x, z, r, strength)  mask.box(x, z, w, d, rotY, margin, strength)  mask.texture()
 *        Then add Toon.aoPatch(mask) to the ground material. Costs no draw calls, follows terrain, can't z-fight.
 *   makeBlobShadows(capacity, {opacity, color})  instanced soft blob quads for MOVING things:
 *        blobs.set(i, x, y, z, size) / blobs.hide(i) / blobs.commit()
 *   makeContactShadow(size, {opacity})   one blob quad (shared geo/material) for a static prop on a flat floor
 *
 * Never throws from shader patches: failures go to __DQ.errors and the material renders as plain toon.
 */
import * as THREE from 'three';
import { App } from '../engine/app.js';
import { Assets } from '../engine/assets.js';
import { reportError } from '../engine/debug.js';
import { PAL, C3, smooth } from './palette.js';
import { Tex } from './tex.js';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. Toon material — 3 bands (shade, mid, full) + painters' shade saturation (ART-DIRECTION §5, verbatim GLSL)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const TOON_PARS = /* glsl */`
varying vec3 vViewPosition;
uniform float uEdge; uniform float uSoft; uniform float uMid; uniform float uMidEdge; uniform float uShadeSat;
struct ToonMaterial { vec3 diffuseColor; };
float dqBand( float d ){
  float w = max( uSoft, fwidth( d ) * 0.75 );
  float a = smoothstep( uEdge - w, uEdge + w, d );          // shade -> mid
  float b = smoothstep( uMidEdge - w, uMidEdge + w, d );    // mid   -> full
  return a * mix( uMid, 1.0, b );
}
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  float d = dot( geometryNormal, directLight.direction );
  reflectedLight.directDiffuse += dqBand( d ) * directLight.color * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 dc = material.diffuseColor;
  float l = dot( dc, vec3( 0.2126, 0.7152, 0.0722 ) );
  dc = max( mix( vec3( l ), dc, uShadeSat ), vec3( 0.0 ) );   // painters' shadows are MORE saturated, never grey
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( dc );
}
#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;

export const TOON_DEFAULT = Object.freeze({ edge: 0.02, soft: 0.02, mid: 0.72, midEdge: 0.30, shadeSat: 1.35, wind: 0, windBase: 0, windSpeed: 1.7 });

/** Per-family parameters used in the tuned frame (ART-DIRECTION §5 table) + F3 additions (sand, snow, cloth). */
export const TOON_PRESETS = Object.freeze({
  default:   {},
  stone: {}, wood: {}, tile: {}, paint: {}, character: {},
  plaster:   { mid: 0.80 },
  thatch:    { mid: 0.78 },
  ground:    { soft: 0.10, mid: 0.80, midEdge: 0.25, shadeSat: 1.05 },
  groundRing:{ soft: 0.15, mid: 0.82, midEdge: 0.25, shadeSat: 1.05 },
  tuft:      { soft: 0.10, mid: 0.80, midEdge: 0.25, shadeSat: 1.05 },
  flower:    { soft: 0.10, mid: 0.90 },
  // canopy: ART-DIRECTION §5 tuned soft .06 / mid .74 / midEdge .38 for the default camera (sun behind it). Under the
  // 360° field orbit, side/back light shrank the full band to a hard straight stripe across the blobs; these values
  // are identical at gameplay distance and turn that stripe into a soft sweep (evidence: shots/F3-tree-a vs -f).
  canopy:    { edge: 0.05, soft: 0.10, mid: 0.80, midEdge: 0.22, shadeSat: 1.15 },
  canopyTuned: { edge: 0.05, soft: 0.06, mid: 0.74, midEdge: 0.38, shadeSat: 1.15 },
  farForest: { soft: 0.06, mid: 0.78, midEdge: 0.35, shadeSat: 1.10 },
  hill:      { soft: 0.25, mid: 0.86, midEdge: 0.30, shadeSat: 1.10 },
  skin:      { mid: 0.85 },
  slime:     { mid: 0.78, midEdge: 0.35, shadeSat: 1.20 },
  // F3 additions, tuned in demos/F3.html
  sand:      { soft: 0.08, mid: 0.82, midEdge: 0.28, shadeSat: 1.15 },
  snow:      { soft: 0.08, mid: 0.86, midEdge: 0.28, shadeSat: 1.00 },
  cloth:     { soft: 0.05, mid: 0.78 },
  water:     { soft: 0.10, mid: 0.90, shadeSat: 1.10 },
});

// Shared clock for wind sway (one uniform object referenced by every swaying material).
const SHARED = { uTime: { value: 0 } };
const TOON_MATS = new Set();
const OUTLINE_MATS = new Set();
let outlinesVisible = true;
let anonPatchId = 0;
const patchIds = new WeakMap();

function patchKey(fn) {
  if (fn.key) return fn.key;
  if (!patchIds.has(fn)) patchIds.set(fn, 'p' + (++anonPatchId));
  return patchIds.get(fn);
}

const WIND_DECL = /* glsl */`
uniform float uTime; uniform float uWind; uniform float uWindBase; uniform float uWindSpeed;`;
const WIND_VERT = /* glsl */`
#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec3 dqRoot = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  #else
    vec3 dqRoot = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  #endif
  float dqH = max( ( transformed.y - uWindBase ) * sign( uWind ), 0.0 );   // wind < 0: hangs, sways more BELOW base
  float dqPh = uTime * uWindSpeed + dqRoot.x * 0.35 + dqRoot.z * 0.27;
  float dqGust = 0.65 + 0.35 * sin( uTime * 0.37 + dqRoot.x * 0.05 + dqRoot.z * 0.04 );
  transformed.x += sin( dqPh ) * abs( uWind ) * dqH * dqGust;
  transformed.z += cos( dqPh * 0.77 + 1.3 ) * abs( uWind ) * 0.6 * dqH * dqGust;
}`;

function applyWind(sh, p) {
  sh.uniforms.uTime = SHARED.uTime;
  sh.uniforms.uWind = { value: p.wind };
  sh.uniforms.uWindBase = { value: p.windBase };
  sh.uniforms.uWindSpeed = { value: p.windSpeed };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + WIND_DECL)
    .replace('#include <begin_vertex>', WIND_VERT);
}

/**
 * The toon material factory (ART-DIRECTION §5 `dqToon`, extended with presets, patch arrays and wind).
 */
export function makeToon(opts = {}, toon = {}, extra = null, key = 'dqtoon') {
  const params = typeof toon === 'string' ? (TOON_PRESETS[toon] || {}) : (toon || {});
  const p = Object.assign({}, TOON_DEFAULT, params);
  const m = new THREE.MeshToonMaterial(opts);
  const extras = Array.isArray(extra) ? extra.filter(Boolean) : (extra ? [extra] : []);
  const windOn = p.wind !== 0;
  m.userData.toon = p;
  m.onBeforeCompile = (sh, renderer) => {
    sh.uniforms.uEdge = { value: p.edge }; sh.uniforms.uSoft = { value: p.soft };
    sh.uniforms.uMid = { value: p.mid }; sh.uniforms.uMidEdge = { value: p.midEdge }; sh.uniforms.uShadeSat = { value: p.shadeSat };
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_toon_pars_fragment>', TOON_PARS);
    try {
      if (windOn) applyWind(sh, p);
      for (const fn of extras) fn(sh, m, renderer);
    } catch (e) { reportError('Toon shader patch', e); }
    m.userData.shader = sh;
  };
  const fullKey = [key, windOn ? 'wind' : '', ...extras.map(patchKey)].filter(Boolean).join('|');
  m.customProgramCacheKey = () => fullKey;
  TOON_MATS.add(m);
  m.addEventListener('dispose', () => TOON_MATS.delete(m));
  return m;
}
export const dqToon = makeToon;

/** Live-tune one toon parameter on every toon material (and future compiles of them). */
export function tune(k, v) {
  const U = { edge: 'uEdge', soft: 'uSoft', mid: 'uMid', midEdge: 'uMidEdge', shadeSat: 'uShadeSat', wind: 'uWind', windBase: 'uWindBase', windSpeed: 'uWindSpeed' }[k];
  if (!U) return null;
  let n = 0;
  for (const m of TOON_MATS) {
    if (k.startsWith('wind') && !m.userData.toon.wind) continue;
    m.userData.toon[k] = v;
    const u = m.userData.shader && m.userData.shader.uniforms[U];
    if (u) u.value = v;
    n++;
  }
  return { key: k, value: v, materials: n };
}

/** Classic three.js gradient-map ramp (RedFormat, nearest). levels = brightness per band, dark -> lit. */
export function gradientMap(levels = [0.45, 0.72, 1.0]) {
  return Assets.texture('toon:gradient:' + levels.join(','), () => {
    const data = new Uint8Array(levels.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)));
    const t = new THREE.DataTexture(data, levels.length, 1, THREE.RedFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  });
}
/** Stock MeshToonMaterial with a gradient map — no tinted shade. Use only where makeToon can't go. */
export function stockToon(opts = {}, levels) { return new THREE.MeshToonMaterial(Object.assign({ gradientMap: gradientMap(levels) }, opts)); }

const SURFACE_PRESET = { plaster: 'plaster', thatch: 'thatch', grass: 'ground', dirt: 'ground', sand: 'sand', snow: 'snow', cobble: 'ground', water: 'water' };
/**
 * Cached textured toon material for a Tex recipe name ('stone', 'thatch', ...). Shared: never dispose it.
 *   opts: {vertexColors=false, color, preset, side, alphaTest, worldPlanar=false|{scale,...}, wind, key}
 */
export function surface(texName, opts = {}) {
  const { vertexColors = false, color = null, preset = SURFACE_PRESET[texName] || 'default', side = THREE.FrontSide,
    alphaTest = 0, worldPlanar: wp = false, wind = 0, windBase = 0 } = opts;
  const key = `toon:surface:${texName}:${vertexColors ? 1 : 0}:${color || '-'}:${preset}:${side}:${alphaTest}:${wp ? JSON.stringify(wp) : 0}:${wind}:${windBase}`;
  return Assets.material(key, () => {
    const map = Tex.get(texName);
    const params = { map, vertexColors, side };
    if (color) params.color = C3(color);
    if (alphaTest) params.alphaTest = alphaTest;
    const extras = [];
    if (wp) extras.push(worldPlanar(Object.assign({ scale: 1 / Tex.worldSize(texName) }, wp === true ? {} : wp)));
    const m = makeToon(params, Object.assign({}, TOON_PRESETS[preset] || {}, wind ? { wind, windBase } : {}), extras);
    m.name = key;
    return m;
  });
}

// ── shader patches ───────────────────────────────────────────────────────────────────────────────────────────
function ensureWorldPos(sh) {
  if (sh.vertexShader.includes('vDqWorld')) return;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDqWorld;')
    .replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_INSTANCING
    vDqWorld = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
  #else
    vDqWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  #endif`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDqWorld;');
}

const WP_MAP = /* glsl */`
#ifdef USE_MAP
  vec2 dqUV = vDqWorld.xz * uDqWP.x;
  vec4 dqT1 = texture2D( map, dqUV );
  vec4 dqT2 = texture2D( map, mat2( 0.8, -0.6, 0.6, 0.8 ) * dqUV * 0.61 + vec2( 0.37, 0.11 ) );
  vec3 dqN = texture2D( tDqNoise, vDqWorld.xz * uDqWP.w ).rgb;
  vec4 dqTex = mix( dqT1, dqT2, smoothstep( 0.42, 0.58, dqN.g ) * uDqWP.y );
  dqTex.rgb *= 1.0 + ( dqN.r - 0.5 ) * 2.0 * uDqWP.z;
  dqTex.rgb = mix( dqTex.rgb, uDqWPTint, smoothstep( 0.55, 0.9, texture2D( tDqNoise, vDqWorld.xz * uDqWP.w * 2.3 + vec2( 0.61, 0.29 ) ).b ) * uDqWPTintAmt );
  diffuseColor *= dqTex;
#endif`;

/**
 * World-planar (XZ) texturing that never shows its tile: a second rotated sample swapped in by macro noise, plus
 * a gentle macro brightness wobble. For ground-like surfaces (lawns, sand, snowfields, floors).
 *   scale: repeats per world unit (1 / Tex.worldSize(name))   breakup 0..1   macro: ±brightness   macroScale
 *   tint / tintAmount: drift toward a palette colour in big world-scale patches (sun-bleached grass: PAL.grass.sun)
 */
export function worldPlanar({ scale = 0.16, breakup = 1, macro = 0.08, macroScale = 0.017, tint = null, tintAmount = 0.5 } = {}) {
  const fn = (sh) => {
    ensureWorldPos(sh);
    sh.uniforms.tDqNoise = { value: Tex.noise() };
    sh.uniforms.uDqWP = { value: new THREE.Vector4(scale, breakup, macro, macroScale) };
    sh.uniforms.uDqWPTint = { value: C3(tint || PAL.mask.on) };
    sh.uniforms.uDqWPTintAmt = { value: tint ? tintAmount : 0 };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tDqNoise; uniform vec4 uDqWP; uniform vec3 uDqWPTint; uniform float uDqWPTintAmt;')
      .replace('#include <map_fragment>', WP_MAP);
  };
  fn.key = 'wp';
  return fn;
}

/**
 * Darken a material by a painted world-space AO mask (from makeAOMask). The contact-shadow technique of
 * ART-DIRECTION §1.6: col = mix(col, col * PAL.shadow.ao, mask).
 */
export function aoPatch(mask, { color = PAL.shadow.ao } = {}) {
  const fn = (sh) => {
    ensureWorldPos(sh);
    sh.uniforms.tDqAO = { value: mask.texture() };
    sh.uniforms.uDqAORect = { value: new THREE.Vector4(...mask.rect) };
    sh.uniforms.uDqAOCol = { value: C3(color) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tDqAO; uniform vec4 uDqAORect; uniform vec3 uDqAOCol;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 dqAoUv = ( vDqWorld.xz - uDqAORect.xy ) / uDqAORect.zw;
    float dqIn = step( 0.0, dqAoUv.x ) * step( dqAoUv.x, 1.0 ) * step( 0.0, dqAoUv.y ) * step( dqAoUv.y, 1.0 );
    float dqAo = texture2D( tDqAO, dqAoUv ).r * dqIn;
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * uDqAOCol, dqAo );
  }`);
  };
  fn.key = 'ao';
  return fn;
}

// ── see-through: the follow camera never zooms into trees — whatever stands between the lens and the hero
//    dissolves instead (ordered dither, so no sorting and no transparency pass) ────────────────────────────────
/**
 * Three shared rules, all driven by uniforms every see-through material references (one update per frame):
 *   1. faded instances  — Toon.see.setFades([{x, z, keep}]): an INSTANCED mesh whose instance origin is at (x, z)
 *                         keeps only `keep` of its pixels (0.25 = the classic "tree between camera and hero" fade)
 *   2. the hero window  — Toon.see.setHero(pos, camera, renderer): anything nearer the lens than the hero, inside a
 *                         soft ellipse around him on screen, keeps ~22% (roofs, fences, trunks you walk behind)
 *   3. near dissolve    — anything within ~3 units of the lens fades out (the lens can never sit inside a canopy)
 * Materials opt in with the patch: makeToon(opts, preset, [Toon.see.patch]) / outlineMaterial(hex, {see: true}).
 * Shadows are untouched (the depth pass is not patched): a faded tree still shades the grass.
 */
const SEE_SLOTS = 16;
const SEE = {
  uDqSee: { value: Array.from({ length: SEE_SLOTS }, () => new THREE.Vector4(0, 0, 0, 1)) },
  uDqSeeN: { value: 0 },
  uDqHero: { value: new THREE.Vector4(0, 0, 0, 0) },      // px x, px y (drawing buffer, bottom-left), view depth, on
  uDqHeroR: { value: new THREE.Vector2(60, 100) },        // ellipse half-size in px
  uDqNear: { value: new THREE.Vector2(1.2, 3.2) },         // gone below x, whole above y (view depth)
};
const SEE_VERT_DECL = /* glsl */`
varying vec2 vDqSeeRoot; varying float vDqSeeZ;`;
const SEE_VERT = /* glsl */`
#include <project_vertex>
  vDqSeeZ = -mvPosition.z;
  #ifdef USE_INSTANCING
    vDqSeeRoot = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xz;
  #else
    vDqSeeRoot = vec2( 1e6 );
  #endif`;
const SEE_FRAG_DECL = /* glsl */`
varying vec2 vDqSeeRoot; varying float vDqSeeZ;
uniform vec4 uDqSee[ ${SEE_SLOTS} ]; uniform int uDqSeeN; uniform vec4 uDqHero; uniform vec2 uDqHeroR; uniform vec2 uDqNear;
float dqBayer4( vec2 p ){
  ivec2 q = ivec2( mod( floor( p ), 4.0 ) );
  int i = q.x + q.y * 4;
  float b[ 16 ] = float[ 16 ]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
  return ( b[ i ] + 0.5 ) / 16.0;
}`;
const SEE_FRAG = /* glsl */`
#include <clipping_planes_fragment>
{
  float dqKeep = 1.0;
  for ( int i = 0; i < ${SEE_SLOTS}; i ++ ) {
    if ( i >= uDqSeeN ) break;
    vec4 s = uDqSee[ i ];
    if ( abs( vDqSeeRoot.x - s.x ) < 0.25 && abs( vDqSeeRoot.y - s.z ) < 0.25 ) dqKeep = min( dqKeep, s.w );
  }
  if ( uDqHero.w > 0.5 && vDqSeeZ < uDqHero.z - 0.9 ) {
    float e = length( ( gl_FragCoord.xy - uDqHero.xy ) / uDqHeroR );
    dqKeep = min( dqKeep, mix( 0.22, 1.0, smoothstep( 0.8, 1.2, e ) ) );
  }
  dqKeep = min( dqKeep, smoothstep( uDqNear.x, uDqNear.y, vDqSeeZ ) );
  if ( dqKeep < 0.999 && dqBayer4( gl_FragCoord.xy ) > dqKeep ) discard;
}`;
function seePatch(sh) {
  if (sh.fragmentShader.includes('dqBayer4')) return;
  Object.assign(sh.uniforms, SEE);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + SEE_VERT_DECL).replace('#include <project_vertex>', SEE_VERT);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + SEE_FRAG_DECL).replace('#include <clipping_planes_fragment>', SEE_FRAG);
}
seePatch.key = 'see';

const seeTmp = { v: new THREE.Vector3(), s: new THREE.Vector2(), h: new THREE.Vector3(), f: new THREE.Vector3() };
export const See = {
  SLOTS: SEE_SLOTS,
  patch: seePatch,
  uniforms: SEE,
  /** Faded instances: [{x, z, keep}] (lowest keep wins the slots). */
  setFades(list = []) {
    const L = list.filter(f => f && f.keep < 0.999).sort((a, b) => a.keep - b.keep).slice(0, SEE_SLOTS);
    L.forEach((f, i) => SEE.uDqSee.value[i].set(f.x, 0, f.z, Math.max(0, Math.min(1, f.keep))));
    SEE.uDqSeeN.value = L.length;
    return L.length;
  },
  /** Keep the hero visible: pos = feet {x, y, z}; height = how tall he stands. Pass null to switch it off. */
  setHero(pos, camera, renderer, { height = 1.6 } = {}) {
    try {
      if (!pos || !camera || !renderer) { SEE.uDqHero.value.w = 0; return; }
      camera.updateMatrixWorld();
      renderer.getDrawingBufferSize(seeTmp.s);
      const W = seeTmp.s.x, H = seeTmp.s.y;
      const mid = seeTmp.v.set(pos.x, pos.y + height * 0.52, pos.z).project(camera);
      const px = (mid.x * 0.5 + 0.5) * W, py = (mid.y * 0.5 + 0.5) * H;
      const head = seeTmp.h.set(pos.x, pos.y + height * 1.05, pos.z).project(camera);
      const feet = seeTmp.f.set(pos.x, pos.y - 0.05, pos.z).project(camera);
      const halfH = Math.max(24, Math.abs(head.y - feet.y) * 0.5 * H * 0.5 * 1.35);
      const view = seeTmp.v.set(pos.x, pos.y + height * 0.5, pos.z).applyMatrix4(camera.matrixWorldInverse);
      SEE.uDqHero.value.set(px, py, -view.z, mid.z < 1 ? 1 : 0);
      SEE.uDqHeroR.value.set(halfH * 0.72, halfH);
    } catch (e) { reportError('Toon.see.setHero', e); }
  },
  clear() { SEE.uDqSeeN.value = 0; SEE.uDqHero.value.w = 0; },
  state() { return { fades: SEE.uDqSeeN.value, hero: SEE.uDqHero.value.w > 0.5, heroPx: [Math.round(SEE.uDqHero.value.x), Math.round(SEE.uDqHero.value.y)], heroDepth: +SEE.uDqHero.value.z.toFixed(2) }; },
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. Outlines — inverted hull, warm dark, never pure black (ART-DIRECTION §6)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const OUTLINE = Object.freeze({ char: 0.018, head: 0.02, slime: 0.018, canopy: 0.04, prop: 0.025 });

export function outlineMaterial(hex = PAL.outline.char, { wind = 0, windBase = 0, windSpeed = TOON_DEFAULT.windSpeed, see = false } = {}) {
  return Assets.material(`toon:outline:${hex}:${wind}:${windBase}:${windSpeed}:${see ? 1 : 0}`, () => {
    const m = new THREE.MeshBasicMaterial({ color: C3(hex), side: THREE.BackSide });
    m.name = 'outline';
    if (wind !== 0 || see) {
      const p = { wind, windBase, windSpeed };
      m.onBeforeCompile = (sh) => {
        try {
          if (wind !== 0) applyWind(sh, p);
          // a dissolving tree's ink line goes quicker than its leaves, so a faded canopy never leaves a dotted ring
          if (see) { seePatch(sh); sh.fragmentShader = sh.fragmentShader.replace('if ( dqKeep < 0.999', 'dqKeep *= dqKeep; if ( dqKeep < 0.999'); }
        } catch (e) { reportError('Toon outline patch', e); }
      };
      const key = ['dqoutline', wind !== 0 ? 'wind' : '', see ? 'see' : ''].filter(Boolean).join('|');
      m.customProgramCacheKey = () => key;
    }
    m.visible = outlinesVisible;
    OUTLINE_MATS.add(m);
    return m;
  });
}
export const outlineMat = outlineMaterial;

const hullCache = new WeakMap();   // geometry -> Map(thickness -> hull)
export function hullGeometry(geo, th = OUTLINE.char) {
  let byTh = hullCache.get(geo);
  if (!byTh) { byTh = new Map(); hullCache.set(geo, byTh); }
  if (byTh.has(th)) return byTh.get(th);
  const g = geo.clone(), p = g.attributes.position;
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * th, p.getY(i) + n.getY(i) * th, p.getZ(i) + n.getZ(i) * th);
  p.needsUpdate = true;
  g.computeBoundingSphere(); g.computeBoundingBox();
  g.userData.shared = !!(geo.userData && geo.userData.shared);
  byTh.set(th, g);
  return g;
}
export const hullGeo = hullGeometry;

/** Add an inverted-hull outline child to a mesh. Returns the mesh. */
export function withOutline(mesh, th = OUTLINE.char, mat = null) {
  try {
    const o = new THREE.Mesh(hullGeometry(mesh.geometry, th), mat || outlineMaterial(PAL.outline.char));
    o.userData.isOutline = true; o.name = (mesh.name || 'mesh') + ':outline';
    o.castShadow = false; o.receiveShadow = false;
    mesh.add(o);
  } catch (e) { reportError('Toon.withOutline', e); }
  return mesh;
}

/** Hull outline for an InstancedMesh; shares the instanceMatrix attribute, so matrix updates apply to both. */
export function outlineInstanced(inst, th = OUTLINE.canopy, mat = null) {
  const hull = new THREE.InstancedMesh(hullGeometry(inst.geometry, th), mat || outlineMaterial(PAL.outline.leaf), inst.count);
  hull.instanceMatrix = inst.instanceMatrix;
  hull.count = inst.count;
  hull.userData.isOutline = true; hull.name = (inst.name || 'instanced') + ':outline';
  hull.castShadow = false; hull.receiveShadow = false;
  hull.frustumCulled = inst.frustumCulled;
  inst.add(hull);
  return hull;
}

export function setOutlines(on) {
  outlinesVisible = !!on;
  for (const m of OUTLINE_MATS) m.visible = outlinesVisible;
  return outlinesVisible;
}

// ── normals ──────────────────────────────────────────────────────────────────────────────────────────────────
/** Bend normals toward (vertex - center): amount 0 = untouched, 1 = a perfect sphere's shading. */
export function spherizeNormals(geo, center = null, amount = 0.6) {
  const p = geo.attributes.position; if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.normal, c = new THREE.Vector3(), v = new THREE.Vector3(), a = new THREE.Vector3();
  if (center) c.copy(center); else { geo.computeBoundingBox(); geo.boundingBox.getCenter(c); }
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(c).normalize(); a.fromBufferAttribute(n, i).lerp(v, amount).normalize();
    n.setXYZ(i, a.x, a.y, a.z);
  }
  n.needsUpdate = true;
  return geo;
}
/** Force every normal to +Y: cards and flat details light exactly like the ground beneath them. */
export function normalsUp(geo) {
  const n = geo.attributes.normal; if (!n) return geo;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  n.needsUpdate = true;
  return geo;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. Light rig + fog (ART-DIRECTION §4). Light sums stay <= ~1 so nothing clips under NoToneMapping.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** From the ground toward the sun: ≈46° elevation, from the south-east, behind-right of the default camera. */
export const SUN_DIR = new THREE.Vector3(0.55, 0.72, 0.42).normalize();

export const RIG_PRESETS = Object.freeze({
  day:      { sun: PAL.light.sun, sunI: 1.9, sky: PAL.light.hemiSky, ground: PAL.light.hemiGround, hemiI: 1.55, dir: [0.55, 0.72, 0.42],
              fog: { color: PAL.sky.haze, near: 40, far: 300 }, extent: 30 },
  dusk:     { sun: PAL.dusk.sun, sunI: 1.75, sky: PAL.dusk.hemiSky, ground: PAL.dusk.hemiGround, hemiI: 1.3, dir: [0.8, 0.34, 0.3],
              fog: { color: PAL.dusk.haze, near: 35, far: 260 }, extent: 30 },
  night:    { sun: PAL.night.sun, sunI: 1.0, sky: PAL.night.hemiSky, ground: PAL.night.hemiGround, hemiI: 1.25, dir: [-0.35, 0.8, 0.45],
              fog: { color: PAL.night.haze, near: 25, far: 220 }, extent: 30 },
  interior: { sun: PAL.interior.lamp, sunI: 1.1, sky: PAL.interior.hemiSky, ground: PAL.interior.hemiGround, hemiI: 1.75, dir: [0.3, 0.9, 0.35],
              fog: null, extent: 14 },
  cave:     { sun: PAL.cave.torch, sunI: 1.0, sky: PAL.cave.hemiSky, ground: PAL.cave.hemiGround, hemiI: 1.1, dir: [0.2, 0.9, 0.4],
              fog: { color: PAL.cave.haze, near: 10, far: 60 }, extent: 20 },
});

export function makeFog(scene, preset = 'day') {
  try {
    const f = typeof preset === 'string' ? (RIG_PRESETS[preset] ? RIG_PRESETS[preset].fog : null) : preset;
    if (!f) { if (scene) scene.fog = null; return null; }
    const fog = new THREE.Fog(C3(f.color), f.near ?? 40, f.far ?? 300);
    if (scene) scene.fog = fog;
    return fog;
  } catch (e) { reportError('Toon.makeFog', e); return null; }
}

export function makeLightRig(opts = {}) {
  const tier = App.tier || {};
  const size = opts.shadowMapSize ?? tier.shadowMapSize ?? 2048;
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.name = 'rig:sun';
  sun.castShadow = opts.shadows !== false && tier.shadows !== false;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.55);
  hemi.name = 'rig:hemi';
  const group = new THREE.Group(); group.name = 'lightRig';
  group.add(sun, sun.target, hemi);
  const tmp = { a: new THREE.Color(), b: new THREE.Color(), d: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), f: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };

  const rig = {
    sun, hemi, group, size,
    dir: SUN_DIR.clone(),
    focus: new THREE.Vector3(),
    distance: 60,
    extent: 30,
    preset: null,
    fogRef: null,
    userExtent: opts.extent ?? null,          // an explicit extent always beats the preset's
    /** Half-size of the shadow frustum in world units (bigger = softer, blurrier shadows over more ground). */
    setExtent(e) { this.userExtent = e; return this._extent(e); },
    _extent(e) {
      this.extent = e;
      Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: this.distance * 2 });
      sun.shadow.camera.updateProjectionMatrix();
      return e;
    },
    /** Apply a preset by name (or a preset-shaped object). Updates the fog made by rig.fog(scene) too. */
    apply(name) {
      const P = typeof name === 'string' ? RIG_PRESETS[name] : name;
      if (!P) return this.preset;
      sun.color.copy(C3(P.sun)); sun.intensity = P.sunI;
      hemi.color.copy(C3(P.sky)); hemi.groundColor.copy(C3(P.ground)); hemi.intensity = P.hemiI;
      this.dir.set(P.dir[0], P.dir[1], P.dir[2]).normalize();
      const ext = this.userExtent ?? P.extent;
      if (ext && ext !== this.extent) this._extent(ext);
      if (this.fogRef && P.fog) { this.fogRef.color.copy(C3(P.fog.color)); this.fogRef.near = P.fog.near; this.fogRef.far = P.fog.far; }
      this.preset = typeof name === 'string' ? name : 'custom';
      this.follow(this.focus);
      return this.preset;
    },
    /** Blend two presets (t 0..1) — dawn/dusk transitions. Colours lerp in linear light; shade stays tinted. */
    blend(a, b, t) {
      const A = RIG_PRESETS[a], B = RIG_PRESETS[b];
      if (!A || !B) return null;
      const k = smooth(0, 1, t);
      sun.color.copy(C3(A.sun)).lerp(tmp.a.copy(C3(B.sun)), k); sun.intensity = A.sunI + (B.sunI - A.sunI) * k;
      hemi.color.copy(C3(A.sky)).lerp(tmp.a.copy(C3(B.sky)), k);
      hemi.groundColor.copy(C3(A.ground)).lerp(tmp.a.copy(C3(B.ground)), k);
      hemi.intensity = A.hemiI + (B.hemiI - A.hemiI) * k;
      this.dir.set(...A.dir).normalize().lerp(tmp.d.set(...B.dir).normalize(), k).normalize();
      if (this.fogRef && A.fog && B.fog) {
        this.fogRef.color.copy(C3(A.fog.color)).lerp(tmp.b.copy(C3(B.fog.color)), k);
        this.fogRef.near = A.fog.near + (B.fog.near - A.fog.near) * k; this.fogRef.far = A.fog.far + (B.fog.far - A.fog.far) * k;
      }
      this.preset = `${a}>${b}@${t.toFixed(2)}`;
      this.follow(this.focus);
      return this.preset;
    },
    /** Centre the shadow frustum on a world point (player / camera target). Texel-snapped: no shadow swimming. */
    follow(target) {
      if (target) this.focus.copy(target);
      const d = this.dir;
      tmp.x.crossVectors(tmp.up, d); if (tmp.x.lengthSq() < 1e-6) tmp.x.set(1, 0, 0); tmp.x.normalize();
      tmp.y.crossVectors(d, tmp.x).normalize();
      const texel = (2 * this.extent) / this.size;
      const fx = Math.round(this.focus.dot(tmp.x) / texel) * texel;
      const fy = Math.round(this.focus.dot(tmp.y) / texel) * texel;
      const fz = this.focus.dot(d);
      tmp.f.copy(tmp.x).multiplyScalar(fx).addScaledVector(tmp.y, fy).addScaledVector(d, fz);
      sun.target.position.copy(tmp.f);
      sun.position.copy(tmp.f).addScaledVector(d, this.distance);
      sun.target.updateMatrixWorld();
      return this;
    },
    /** Create (or re-point) the scene fog for the current preset. */
    fog(scene) {
      const P = RIG_PRESETS[this.preset] || RIG_PRESETS.day;
      this.fogRef = makeFog(scene, P.fog || null);
      return this.fogRef;
    },
    state() {
      return { preset: this.preset, sun: +sun.intensity.toFixed(3), hemi: +hemi.intensity.toFixed(3), dir: this.dir.toArray().map(v => +v.toFixed(3)),
        shadows: sun.castShadow, shadowMap: this.size, extent: this.extent,
        fog: this.fogRef ? { near: this.fogRef.near, far: this.fogRef.far } : null };
    },
    dispose() { try { sun.shadow.dispose(); group.removeFromParent(); } catch (e) { reportError('LightRig.dispose', e); } },
  };
  rig._extent(opts.extent ?? (RIG_PRESETS[opts.preset || 'day'] || RIG_PRESETS.day).extent ?? 30);
  rig.apply(opts.preset || 'day');
  if (opts.scene) { opts.scene.add(group); if (opts.fog !== false) rig.fog(opts.scene); }
  return rig;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 4. Contact shadows
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function blobMaterial(opacity, color) {
  return Assets.material(`toon:blob:${color}:${opacity}`, () => {
    const m = new THREE.MeshBasicMaterial({ map: Tex.blob(), color: C3(color), transparent: true, opacity, depthWrite: false });
    m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -4;
    m.name = 'blobShadow';
    return m;
  });
}
const blobQuad = () => Assets.geometry('toon:blob-quad', () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; });

/** Instanced soft blob shadows for things that move (hero, monsters, NPCs). size = diameter in world units. */
export function makeBlobShadows(capacity = 16, { opacity = 0.55, color = PAL.shadow.contact } = {}) {
  const mesh = new THREE.InstancedMesh(blobQuad(), blobMaterial(opacity, color), capacity);
  mesh.name = 'blobShadows'; mesh.frustumCulled = false; mesh.renderOrder = 1;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, zero);
  const api = {
    mesh, capacity,
    set(i, x, y, z, size = 1, stretch = 1) {
      if (i < 0 || i >= capacity) return;
      m4.compose(v.set(x, y + 0.02, z), q, s.set(size * stretch, 1, size)); mesh.setMatrixAt(i, m4);
    },
    hide(i) { if (i >= 0 && i < capacity) mesh.setMatrixAt(i, zero); },
    commit() { mesh.instanceMatrix.needsUpdate = true; },
  };
  return api;
}

/** A single static contact-shadow quad (shared geometry/material). Place it at the prop's feet. */
export function makeContactShadow(size = 1, { opacity = 0.5, color = PAL.shadow.contact } = {}) {
  const m = new THREE.Mesh(blobQuad(), blobMaterial(opacity, color));
  m.scale.set(size, 1, size); m.position.y = 0.02; m.renderOrder = 1; m.name = 'contactShadow';
  return m;
}

/**
 * World-space AO mask painted at build time (ART-DIRECTION §10: paintAO / paintAORect, generalised).
 *   span: world units covered; size: pixels; center: [x, z]
 */
export function makeAOMask({ span = 104, size = 1024, center = [0, 0] } = {}) {
  const N = size | 0, pxu = N / span, ox = center[0] - span / 2, oz = center[1] - span / 2;
  const data = new Float32Array(N * N);
  let tex = null, dirty = true;
  const toPx = (v, o) => (v - o) * pxu;
  const mask = {
    data, size: N, span, pxu, rect: [ox, oz, span, span],
    /** Soft round AO disc of radius r (world units). */
    disc(x, z, r, strength = 0.6) {
      const cx = toPx(x, ox), cz = toPx(z, oz), R = r * pxu;
      for (let j = Math.max(0, cz - R | 0); j <= Math.min(N - 1, cz + R | 0); j++)
        for (let i = Math.max(0, cx - R | 0); i <= Math.min(N - 1, cx + R | 0); i++) {
          const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cz) / R; if (d >= 1) continue;
          const a = strength * Math.pow(1 - smooth(0, 1, d), 1.4), k = j * N + i; if (a > data[k]) data[k] = a;
        }
      dirty = true; return mask;
    },
    /** Soft rounded-rectangle AO around a footprint w x d rotated like `object.rotation.y = rotY`. */
    box(x, z, w, d, rotY = 0, margin = 1.3, strength = 0.75) {
      const c = Math.cos(rotY), s = Math.sin(rotY), R = (Math.hypot(w, d) / 2 + margin) * pxu, cx = toPx(x, ox), cz = toPx(z, oz);
      for (let j = Math.max(0, cz - R | 0); j <= Math.min(N - 1, cz + R | 0); j++)
        for (let i = Math.max(0, cx - R | 0); i <= Math.min(N - 1, cx + R | 0); i++) {
          const dx = (i + 0.5 - cx) / pxu, dz = (j + 0.5 - cz) / pxu, lx = dx * c - dz * s, lz = dx * s + dz * c;
          const qx = Math.abs(lx) - w / 2, qz = Math.abs(lz) - d / 2;
          const sd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
          if (sd > margin) continue;
          const a = strength * (1 - smooth(-0.1, margin, sd)), k = j * N + i; if (a > data[k]) data[k] = a;
        }
      dirty = true; return mask;
    },
    sample(x, z) {
      const fx = toPx(x, ox) - 0.5, fz = toPx(z, oz) - 0.5, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = (ii, jj) => data[Math.max(0, Math.min(N - 1, jj)) * N + Math.max(0, Math.min(N - 1, ii))];
      return (a(i, j) * (1 - u) + a(i + 1, j) * u) * (1 - v) + (a(i, j + 1) * (1 - u) + a(i + 1, j + 1) * u) * v;
    },
    clear() { data.fill(0); dirty = true; return mask; },
    /** Upload (or re-upload) as a single-channel DataTexture. Safe to call every frame; only uploads when dirty. */
    texture() {
      if (!tex) {
        tex = new THREE.DataTexture(new Uint8Array(N * N), N, N, THREE.RedFormat);
        tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.NoColorSpace; tex.name = 'aoMask';
      }
      if (dirty) { const img = tex.image.data; for (let k = 0; k < N * N; k++) img[k] = Math.min(255, data[k] * 255); tex.needsUpdate = true; dirty = false; }
      return tex;
    },
  };
  return mask;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const Toon = {
  TOON_PARS, DEFAULT: TOON_DEFAULT, PRESETS: TOON_PRESETS, OUTLINE, SUN_DIR, RIG_PRESETS,
  make: makeToon, surface, tune, gradientMap, stock: stockToon,
  worldPlanar, aoPatch, see: See,
  outlineMaterial, hullGeometry, withOutline, outlineInstanced, setOutlines,
  spherizeNormals, normalsUp,
  lightRig: makeLightRig, fog: makeFog,
  blobShadows: makeBlobShadows, contactShadow: makeContactShadow, aoMask: makeAOMask,
  /** Advance the shared wind clock (seconds). Call once per frame with App.clock.time for replayable sway. */
  tick(t) { SHARED.uTime.value = t; return t; },
  get time() { return SHARED.uTime.value; },
  outlinesVisible() { return outlinesVisible; },
  stats() { return { toonMaterials: TOON_MATS.size, outlineMaterials: OUTLINE_MATS.size, outlines: outlinesVisible, windTime: +SHARED.uTime.value.toFixed(3) }; },
};

export default Toon;
