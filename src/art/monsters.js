/**
 * monsters.js — every monster model, rigged and alive.                              (P16, owner: src/art/monsters.js)
 *
 * Construction specs: docs/MONSTER-BIBLE.md (§0 kit, §1-§6b entries). Names: docs/CANON.md. House style: the
 * owner-locked look (docs/ART-DIRECTION.md, docs/approved/*.png) through F3's foundation only — colours are PAL
 * (derived with mixHex/scaleHex until F3 adds a PAL.monster family, which is picked up automatically), materials
 * are makeToon, contact shadows are Toon's blob quad.
 *
 *   import { Monsters } from '../art/monsters.js';
 *   const m = Monsters.build('gloop');           // -> monster (below); unknown ids build a Gloop and report it
 *   scene.add(m.root); m.root.position.set(x, y, z);
 *   m.update(dt)                                 // every tick (seconds)
 *   m.play('attack', {distance: 1.4, onImpact}) // -> Promise<boolean> (true = finished, false = interrupted)
 *   m.onHit(worldPoint?)                         // flinch + white flash, knocked away from the point
 *   m.dispose()
 *   Monsters.list() -> ['gloop', 'bobble', ...]  Monsters.info(id) -> {id, name, family, boss, death, height, radius}
 *
 * THE FACE LAYER (§6) — the thing that makes them monsters rather than plush toys:
 *   Every face is a state machine, not a sticker. A wild monster is sly: half-lidded painted eyes (a body-coloured lid
 *   slides down over them, with an ink lash), a brow wedge, pupils that glance sideways, and a lopsided smirk. It
 *   squints and grits its teeth to wind up, yells as it lunges, squeezes its eyes shut (> <) when hit, goes dizzy
 *   (spirals, tongue out) as it poofs — and on 'join' the lids snap open into the big beaming face it keeps for good
 *   (mood 'friend'). Every state is tuned per species in `spec.face`; `monster.mood` / `setMood()` switch wild/friend,
 *   and `monster.state().face` reports {state, eyes, mouth, lids} so a critic can see it.
 *
 * The monster object:
 *   root        THREE.Group, origin = ground contact, faces +Z (toward the battle camera)
 *   radius      half-width in world units (formation spacing, targeting)    height  top of the body at rest
 *   play(clip, opts?)   'idle' | 'attack' | 'cast' | 'hurt' | 'defeat' | 'join' | 'taunt'
 *        attack opts: {distance = lunge gap (default ~1.2 u), dir: Vector3 (local, default +Z), onImpact()}
 *        hurt opts:   {dir: Vector3 knock direction (local)}      defeat opts: {vanish: true} forces the poof on
 *        story bosses that normally stay (the Sunmane lies down, Bogwallop sulks)
 *   update(dt)  onHit(point?)  dispose()
 *   mood        'wild' (the sly enemy face) | 'friend' (after it joins you); also setMood(m)
 *   clip / defeated / visible (getters)   state() -> JSON summary   center() -> local Vector3 (mid-body)
 *   top() -> local Vector3 (above the head: damage numbers)   on(event, fn) events: 'impact', 'end', 'defeated'
 *
 * How a monster is built (cheap on purpose: <= 6 draw calls, geometry shared per species):
 *   Parts are authored in monster space and bound RIGIDLY (or blended) to named bones. Everything that shares a
 *   material is merged into ONE SkinnedMesh per bucket, all sharing one skeleton:
 *     toon  (vertex-coloured makeToon, casts the sun shadow)   unlit (eyes, highlights, mouths, glow dots)
 *     trans (ghosts, lenses, wings; per-vertex alpha)          hull  (inverted-hull outline, per-part colour)
 *   + one contact-shadow quad, + two instanced FX meshes (puffs/chunks, sparkles) only while effects are alive.
 *   Animation = bone transforms: an idle layer (per species), a clip layer (lunge, flinch, cast, taunt, join,
 *   eight death styles), blinks, and a white flash on the materials. Never throws: failures go to __DQ.errors.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, C3, css, mixHex, scaleHex, lerp, clamp01, smooth } from './palette.js';
import { makeToon, makeContactShadow } from './toon.js';
import { reportError } from '../engine/debug.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 0. Colours — MONSTER-BIBLE §9, derived from PAL (no hex lives here). NEEDS F3: a PAL.monster family with these
//    keys; when it exists its values win automatically.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const mx = (a, b, t) => mixHex(a, b, t);
const sc = (a, k) => scaleHex(a, k);
const pick = (key, derived) => (PAL.monster && typeof PAL.monster[key] === 'string') ? PAL.monster[key] : derived;
const MON = Object.freeze(Object.fromEntries(Object.entries({
  gloop: PAL.slime.body, gloopLight: PAL.slime.light, gloopDeep: sc('slime.body', 0.72),
  gloopG: sc('paint.shutterGreen', 1.3), gloopR: mx('cloth.purple', 'flower.red', 0.7),
  bloop: mx('cloth.purple', 'cloth.pink', 0.9), glop: mx('stone.moss', 'thatch.dark', 0.42),
  glimmer: mx('sky.sunGlow', 'hill.far', 0.8), glimmerDeep: mx('hill.far', 'cloud.core', 0.55),
  bat: mx('cloth.purple', 'hill.mid', 0.2), batWing: mx('cloth.purpleDark', 'shadow.aoCool', 0.35), batBelly: mx('cloth.pink', 'cloth.purple', 0.35),
  chick: mx('stone.light', 'flower.yellow', 0.75), chickLight: mx('flower.yellow', 'plaster.light', 0.55), beak: mx('stone.cobbleA', 'char.carrot', 0.85),
  root: mx('animal.woolShade', 'sand.shell', 0.45), rootPurple: mx('flower.pink', 'flower.blue', 0.4), leaf: sc('foliage.bush', 1.3), leafDark: 'foliage.mid',
  cap: mx('tile.ridge', 'flower.red', 0.6), cream: mx('cloud.lit', 'animal.cheek', 0.1), stem: mx('dirt.light', 'char.white', 0.65), gill: mx('dirt.light', 'tile.light', 0.25),
  beeY: mx('flower.yellow', 'flower.center', 0.35), beeDark: mx('stone.mortar', 'char.hair', 0.75), fuzz: mx('plaster.light', 'flower.yellow', 0.25),
  blade: mx('cloud.lit', 'hill.far', 0.55), bladeDark: mx('water.mid', 'brick.dark', 0.3),
  steel: mx('sky.page', 'brick.dark', 0.25), steelDark: mx('water.mid', 'brick.dark', 0.45), steelLight: mx('sky.page', 'plaster.light', 0.55),
  glowDot: mx('sky.sunGlow', 'flower.yellow', 0.25), ember: mx('flower.yellow', 'flower.red', 0.5), visor: mx('char.hair', 'char.eye', 0.5),
  ghost: mx('sky.haze', 'snow.mid', 0.6), ghostEye: mx('char.eye', 'paint.glass', 0.75), ghostIris: mx('slime.light', 'snow.ice', 0.15),
  wood: mx('thatch.dark', 'slime.mouth', 0.2), woodDark: sc('wood.dark', 0.9), iron: mx('char.belt', 'slime.body', 0.35), gold: mx('cloth.mustard', 'flower.yellow', 0.1),
  mouthIn: mx('char.hair', 'slime.mouth', 0.65), tongue: mx('slime.tongue', 'paint.shutterBlue', 0.1), tooth: mx('cloud.lit', 'animal.cheek', 0.1),
  stone: mx('thatch.dark', 'hill.farLow', 0.45), stoneLight: mx('stone.mid', 'hill.farLow', 0.3), moss: mx('stone.moss', 'paint.shutterGreen', 0.3), glowstone: mx('flower.yellow', 'flower.pink', 0.3),
  socket: mx('char.hair', 'stone.mortar', 0.4),
  cactus: mx('grass.light', 'paint.shutterGreen', 0.45), cactusTop: mx('grass.tip', 'paint.shutterGreen', 0.25), spine: mx('light.hemiGround', 'plaster.light', 0.7), flowerP: mx('flower.pink', 'flower.red', 0.45),
  sunspot: mx('char.carrot', 'thatch.light', 0.45), sunspotDark: mx('char.carrot', 'tile.dark', 0.35), muzzle: mx('plaster.light', 'thatch.pale', 0.4), nose: mx('flower.pink', 'tile.dark', 0.3),
  mane: mx('cloth.mustard', 'flower.yellow', 0.1), maneDeep: mx('char.carrot', 'cloth.mustard', 0.45), ribbon: 'cloth.red',
  toad: mx('stone.moss', 'paint.shutterGreen', 0.3), toadBelly: mx('foliage.bush', 'sand.light', 0.85), wart: mx('foliage.dark', 'brick.moss', 0.5), reed: sc('foliage.bush', 1.3),
  mouth: mx('char.hair', 'outline.char', 0.5), pupil: 'char.eye', eyebrow: mx('dirt.dark', 'stone.dark', 0.25),
  ruby: mx('flower.red', 'slime.mouth', 0.35), blush: mx('flower.pink', 'animal.cheek', 0.5), white: 'char.white', lens: 'snow.ice',
  spark: 'ui.cursor', puff: 'cloud.lit', coin: mx('cloth.mustard', 'flower.yellow', 0.3),
  // tier two + the Act I story creatures (MONSTER-BIBLE §2 #12-15, §6b)
  crab: mx('tile.light', 'tile.mid', 0.3), crabLight: mx('tile.light', 'flower.yellow', 0.25), crabBelly: mx('sand.shell', 'tile.light', 0.28),
  crabEar: mx('animal.cheek', 'char.skin', 0.45), earInner: mx('flower.pink', 'animal.cheek', 0.35), clawIn: mx('slime.tongue', 'tile.dark', 0.35),
  owl: mx('wood.light', 'stone.dark', 0.3), owlDark: mx('wood.mid', 'bark.dark', 0.35), owlFace: mx('plaster.mid', 'animal.woolShade', 0.45),
  owlBelly: mx('plaster.dark', 'thatch.pale', 0.3), velvet: mx('cloth.purpleDark', 'flower.red', 0.22), velvetDeep: mx('cloth.purpleDark', 'char.hair', 0.45),
  moth: mx('thatch.mid', 'stone.light', 0.35), mothDark: mx('wood.mid', 'thatch.dark', 0.5), mothFuzz: mx('plaster.light', 'thatch.pale', 0.4),
  mothWing: mx('plaster.dark', 'thatch.pale', 0.35), mothEdge: mx('wood.light', 'thatch.dark', 0.45), eyespot: mx('char.hair', 'stone.mortar', 0.3),
  eyespotRing: mx('flower.center', 'cloth.mustard', 0.4), glove: mx('cloth.red', 'flower.red', 0.45), cuff: 'plaster.light',
  bark: mx('bark.mid', 'bark.dark', 0.35), barkLight: mx('bark.light', 'bark.mid', 0.3), barkDark: mx('bark.dark', 'bark.furrow', 0.4),
  twine: mx('cloth.rope', 'thatch.pale', 0.3), woodCut: mx('dirt.light', 'thatch.pale', 0.35), woodRing: mx('wood.light', 'dirt.dark', 0.35),
  robe: mx('cloud.shade', 'stone.mid', 0.2), robeLight: mx('cloud.mid', 'plaster.light', 0.35), robeShade: mx('cloud.core', 'cloth.purple', 0.12),
  porcelain: mx('plaster.light', 'animal.cheek', 0.12), hood: mx('char.hair', 'shadow.aoCool', 0.35), rope: mx('cloth.rope', 'stone.mid', 0.55),
  coat: mx('char.hair', 'paint.glass', 0.35), coatLight: mx('paint.glass', 'cloud.core', 0.25), satin: mx('paint.glass', 'cloud.core', 0.45),
  shirt: 'plaster.light', breath: mx('cloud.mid', 'snow.ice', 0.4), wilt: mx('flower.pink', 'stone.mid', 0.35),
  chrome: mx('snow.light', 'sky.page', 0.18), chromeSky: mx('sky.page', 'snow.ice', 0.35), chromeGround: mx('stone.dark', 'bark.dark', 0.35), chromeDeep: mx('water.deep', 'char.hair', 0.45),
  ghostLit: mx('snow.light', 'sky.haze', 0.25), ghostShade: mx('snow.shade', 'cloud.shade', 0.5),
  tabard: 'cloth.blue', tabardDark: 'cloth.blueDark', lighthouse: 'plaster.light', lamp: mx('flower.yellow', 'sky.sunGlow', 0.4),
  // tier three / four / five (MONSTER-BIBLE §9: M_SHADOW, M_CATEYE, M_CLOUD, M_BOLT, M_CHITIN, M_JEST_*, M_MOLE, M_FLAME, …)
  shadow: mx('cloth.purpleDark', 'char.hair', 0.45), shadowLit: mx('cloth.purple', 'char.hair', 0.35), catEye: mx('grass.tip', 'snow.ice', 0.45),
  cloud: mx('cloud.lit', 'sky.page', 0.22), cloudDark: mx('cloud.shade', 'hill.farLow', 0.4), bolt: mx('flower.yellow', 'cloud.lit', 0.42),
  chitin: mx('water.deep', 'paint.shutterBlue', 0.5), chitinLight: mx('paint.shutterBlue', 'sky.page', 0.35), stripe: mx('char.carrot', 'flower.yellow', 0.4),
  jestA: 'cloth.red', jestB: mx('cloth.mustard', 'flower.yellow', 0.3), jestDark: mx('cloth.purpleDark', 'char.hair', 0.25), jestGold: mx('cloth.mustard', 'char.carrot', 0.22),
  skinPale: mx('char.skin', 'plaster.light', 0.35), mole: mx('cloth.purpleDark', 'stone.mid', 0.42), moleBelly: mx('animal.cheek', 'plaster.light', 0.42),
  flame: mx('flower.yellow', 'char.carrot', 0.45), flameCore: mx('flower.yellow', 'char.white', 0.55), wax: mx('plaster.light', 'sand.light', 0.3),
  brass: mx('cloth.mustard', 'char.carrot', 0.28), silver: mx('snow.light', 'sky.page', 0.3), bronze: mx('wood.mid', 'cloth.mustard', 0.45),
  darkGold: mx('cloth.mustard', 'bark.dark', 0.42), frost: mx('snow.light', 'water.light', 0.22), iceBlue: mx('water.light', 'snow.ice', 0.45),
  squid: mx('cloth.purpleDark', 'water.mid', 0.38), dragon: mx('foliage.mid', 'paint.shutterGreen', 0.35), belly: mx('sand.light', 'plaster.light', 0.35),
  cassock: mx('char.hair', 'water.deep', 0.3), cardinal: mx('cloth.red', 'char.hair', 0.35), wingDark: mx('char.hair', 'cloth.purpleDark', 0.35),
}).map(([k, v]) => [k, pick(k, v.startsWith('#') ? v : mixHex(v, v, 0))])));

const outlineOf = (hex) => mixHex(scaleHex(hex, 0.45), PAL.outline.char, 0.6);

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. Maths + easing
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInQuad = (t) => clamp01(t) * clamp01(t);
const easeInOutQuad = (t) => { t = clamp01(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
const easeOutBack = (t, s = 1.70158) => { t = clamp01(t) - 1; return t * t * ((s + 1) * t + s) + 1; };
/** progress of t through [a, b] as 0..1 */
const seg = (t, a, b) => clamp01((t - a) / (b - a));
/** 0 -> 1 -> 0 hump over [a, b] */
const hump = (t, a, b) => { const k = seg(t, a, b); return k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k); };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Matrix from position, rotation (radians, applied Z then X then Y) and scale. */
function MT(p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  const S = Array.isArray(s) ? s : [s, s, s];
  return new THREE.Matrix4().compose(V3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'YXZ')), V3(S[0], S[1], S[2]));
}

function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. Geometry helpers
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const v2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));

/** Catmull-Rom resample of a lathe profile (bottom -> top), endpoints kept exact, radius never negative. */
function smoothProfile(pts, n = 26) {
  const curve = new THREE.SplineCurve(v2(pts));
  const out = curve.getSpacedPoints(n);
  out[0].set(pts[0][0], pts[0][1]); out[out.length - 1].set(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  for (const p of out) p.x = Math.max(0, p.x);
  return out;
}
/** Lathe with the seam at the back (-Z) so no vertex seam faces the camera. */
function lathe(profile, segs = 24) { return new THREE.LatheGeometry(profile, segs, Math.PI, TAU); }

/** radius of an origin-centred ellipse (semi-axes a along X, b along Z) in the direction theta (from +Z toward +X) */
function ellipseR(a, b, th) { const s = Math.sin(th), c = Math.cos(th); return 1 / Math.sqrt((s * s) / (a * a + 1e-9) + (c * c) / (b * b + 1e-9)); }

/** Surface of a (scaled) lathe profile, for putting eyes, mouths and decals ON a body. */
function latheSurf(profile, { sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0 } = {}) {
  const P = profile;
  const rAtLocal = (ly) => {
    if (ly <= P[0].y) return P[0].x;
    for (let i = 1; i < P.length; i++) if (P[i].y >= ly) { const a = P[i - 1], b = P[i]; return lerp(a.x, b.x, (ly - a.y) / Math.max(1e-6, b.y - a.y)); }
    return P[P.length - 1].x;
  };
  return {
    c: V3(x, y, z),
    r(Y, th) { const rr = rAtLocal((Y - y) / sy); return rr <= 0 ? 0 : ellipseR(rr * sx, rr * sz, th); },
  };
}
/** Surface of a vertical elliptic cylinder (semi-axes rx, rz) centred on c (for bundles of sticks). */
function cylSurf(rx, rz, c = [0, 0, 0]) {
  return { c: V3(c[0], c[1], c[2]), r(Y, th) { return ellipseR(rx, rz, th); } };
}
/** Surface of an ellipsoid (semi-axes rx, ry, rz) centred at c. */
function ellSurf(rx, ry, rz, c = [0, 0, 0]) {
  return {
    c: V3(c[0], c[1], c[2]),
    r(Y, th) { const k = 1 - Math.pow((Y - c[1]) / ry, 2); if (k <= 0) return 0; const q = Math.sqrt(k); return ellipseR(rx * q, rz * q, th); },
  };
}
/**
 * A nearly FLAT surface for painting a face on a flat part (a sword's guard, a chest lid, a mask): a huge sphere sitting
 * just behind the plane z = zAt, so decals wrap with almost no curvature. (A thin ellipsoid would smear them round its edge.)
 */
function flatSurf(zAt, yc = 0, x = 0, R = 1.6) { return ellSurf(R, R, R, [x, yc, zAt - R]); }

/** Angle theta at height Y whose surface point has the given x offset from the surface centre. */
function thetaFor(surf, Y, x) {
  let th = 0;
  for (let i = 0; i < 6; i++) { const r = Math.max(1e-3, surf.r(Y, th)); th = Math.asin(THREE.MathUtils.clamp(x / r, -0.999, 0.999)); }
  return th;
}
function surfPoint(surf, Y, th, lift = 0) { const r = surf.r(Y, th) + lift; return V3(surf.c.x + Math.sin(th) * r, Y, surf.c.z + Math.cos(th) * r); }

/** Wrap a flat decal (built in XY, +Z out of the surface) onto a surface around height Yc, angle thc. */
function wrapOn(geo, surf, Yc, thc, lift = 0.004) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const r0 = Math.max(0.02, surf.r(Yc, thc));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), Y = Yc + y;
    const th = thc + x / r0;
    const R = Math.max(0.005, surf.r(Y, th)) + lift + z;
    p.setXYZ(i, surf.c.x + Math.sin(th) * R, Y, surf.c.z + Math.cos(th) * R);
  }
  g.computeVertexNormals();
  return g;
}

function grinShape(w, h, { upper = 0.22 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.quadraticCurveTo(0, -h * upper, w / 2, 0);
  s.quadraticCurveTo(0, -h * 2.0, -w / 2, 0);
  return s;
}
function ovalShape(rx, ry, cy = 0, cx = 0) { const s = new THREE.Shape(); s.absellipse(cx, cy, rx, ry, 0, TAU, false, 0); return s; }
function extrude(shape, depth = 0.02, bevel = 0.006, curveSegments = 10) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** Rounded box (extruded rounded rect with a bevel) centred on the origin. */
function roundBox(w, h, d, r = 0.03) {
  const s = new THREE.Shape(), x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
  s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.lineTo(x, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}
/** A shape swept around a curve of points (tube with a round section). */
function tube(points, radius = 0.01, radial = 6, segs = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => V3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, segs, radius, radial, false);
}
/** A petal / leaf lozenge in XY pointing +Y from the origin. */
function petalShape(len, wid, tip = 0.35) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(wid * 0.9, len * 0.15, wid * 0.7, len * (1 - tip), 0, len);
  s.bezierCurveTo(-wid * 0.7, len * (1 - tip), -wid * 0.9, len * 0.15, 0, 0);
  return s;
}
/** Bat / moth wing: a fan of `n` scallops along the lower edge, spanning +X from the hinge. */
function scallopWing(span, chord, n = 3) {
  const s = new THREE.Shape();
  s.moveTo(0, chord * 0.18);
  s.quadraticCurveTo(span * 0.45, chord * 0.75, span, chord * 0.42);
  const step = span / n;
  for (let i = 0; i < n; i++) {
    const x1 = span - step * (i + 1), xm = span - step * (i + 0.5);
    s.quadraticCurveTo(xm, chord * (0.02 - 0.12 * (i === 0 ? 0.3 : 0)) - chord * 0.3, x1, i === n - 1 ? -chord * 0.12 : chord * 0.06);
  }
  s.lineTo(0, chord * 0.18);
  return s;
}
/**
 * A finely tessellated elliptical disc in XY (concentric rings of vertices). A wrapped decal must have interior
 * vertices: a plain ShapeGeometry disc has only rim vertices, its chords sink into a dome and only the rim shows.
 */
function discGeo(rx, ry, segs = 20, rings = 4) {
  const g = new THREE.RingGeometry(0, 1, segs, rings);
  g.scale(rx, ry, 1);
  return g;
}
/** A capsule from point a to point b (monster space), radius r. */
function capsuleAB(a, b, r, capSegs = 4, radial = 12) {
  const A = V3(a[0], a[1], a[2]), E = V3(b[0], b[1], b[2]), d = E.clone().sub(A), len = Math.max(1e-4, d.length());
  const g = new THREE.CapsuleGeometry(r, len, capSegs, radial);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()));
  g.translate((A.x + E.x) / 2, (A.y + E.y) / 2, (A.z + E.z) / 2);
  return g;
}
/** A tube along a smooth curve through points whose radius follows rFn(u), u 0..1 from the first point. */
function taperTube(points, rFn, radial = 8, segs = 32) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => V3(p[0], p[1], p[2])), false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.attributes.position, n = g.attributes.normal, c = V3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c); const r = rFn(i / segs);
    for (let j = 0; j <= radial; j++) { const v = i * (radial + 1) + j; p.setXYZ(v, c.x + n.getX(v) * r, c.y + n.getY(v) * r, c.z + n.getZ(v) * r); }
  }
  return g;
}
/** Weld a geometry's seams (drop uv/normal, merge, recompute) so reshaped spheres and lathes shade without a crease. */
function smoothNormals(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  return g;
}
/** Piecewise-linear radius along u: stops [[u, r], ...]. */
const taper = (stops) => (u) => { for (let i = 1; i < stops.length; i++) if (u <= stops[i][0]) return lerp(stops[i - 1][1], stops[i][1], (u - stops[i - 1][0]) / Math.max(1e-6, stops[i][0] - stops[i - 1][0])); return stops[stops.length - 1][1]; };
/** A comb / feathered-antenna shape pointing +Y: a leaf with `n` soft teeth down each side. */
function combShape(len, wid, n = 5) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  for (let i = 0; i < n; i++) { const y0 = len * (i + 0.2) / n, y1 = len * (i + 0.7) / n, k = Math.sin(Math.PI * (i + 0.5) / n); s.lineTo(wid * 0.25 * k, y0); s.lineTo(wid * k, y1); }
  s.lineTo(0, len);
  for (let i = n - 1; i >= 0; i--) { const y0 = len * (i + 0.2) / n, y1 = len * (i + 0.7) / n, k = Math.sin(Math.PI * (i + 0.5) / n); s.lineTo(-wid * k, y1); s.lineTo(-wid * 0.25 * k, y0); }
  s.lineTo(0, 0);
  return s;
}
// ── face shapes (all in XY, +Z out of the face, y = 0 on the mouth line / eye centre) ─────────────────────────────
/** A thick stroke along a polyline [[x,y]..] with round caps. hw: half-width, a number or a function of u (0..1). */
function strokeShape(pts, hw) {
  const n = pts.length, f = typeof hw === 'function' ? hw : () => hw, L = [], R = [], ang = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const w = f(i / (n - 1));
    L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]); R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
    ang.push(Math.atan2(tx, -ty));
  }
  const s = new THREE.Shape();
  s.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) s.lineTo(L[i][0], L[i][1]);
  s.absarc(pts[n - 1][0], pts[n - 1][1], f(1), ang[n - 1], ang[n - 1] - Math.PI, true);
  for (let i = n - 1; i >= 0; i--) s.lineTo(R[i][0], R[i][1]);
  s.absarc(pts[0][0], pts[0][1], f(0), ang[0] + Math.PI, ang[0], true);
  return s;
}
const sample = (n, fn) => Array.from({ length: n }, (_, i) => fn(i / (n - 1)));
/** Flat decal geometry from shapes. depth 0 = a single-sided sheet (cheapest; used for everything that lies flat). */
function flatGeo(shapes, depth = 0.004, curveSegments = 8) {
  if (depth <= 0) return new THREE.ShapeGeometry(shapes, curveSegments);
  const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** Squeezed-shut eye ">" (left eye) / "<" (right eye), unit eye radius. */
function shutEyeShape(r, side) {
  const P0 = [-side * 0.72 * r, 0.5 * r], P1 = [side * 0.95 * r, 0.04 * r], P2 = [-side * 0.72 * r, -0.46 * r];
  const pts = sample(15, (t) => [(1 - t) * (1 - t) * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0], (1 - t) * (1 - t) * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]]);
  return strokeShape(pts, (u) => r * (0.13 + 0.03 * Math.sin(Math.PI * u)));
}
/** Happy closed eye "^" arch. */
function happyEyeShape(r) { return strokeShape(sample(15, (u) => { const x = lerp(-0.74, 0.74, u); return [x * r, (0.42 * (1 - (x * x) / 0.55) - 0.12) * r]; }), r * 0.14); }
/** Dizzy spiral. */
function spiralShape(r, side, rot = 0) {
  return strokeShape(sample(34, (u) => { const a = side * u * 2.25 * TAU + 0.6 + rot, rr = r * (0.1 + 0.7 * u); return [Math.cos(a) * rr, Math.sin(a) * rr]; }), (u) => r * (0.075 + 0.045 * u));
}
/** An eyebrow for the eye on `side`: inner end thicker, a small arch. Centred on the origin. */
function browShape(r, side, len = 1.3) {
  return strokeShape(sample(9, (u) => [lerp(-side * 0.5, side * 0.5, u) * len * r, 0.12 * r * Math.sin(Math.PI * u)]), (u) => r * lerp(0.17, 0.095, u));
}
/** Upper lip height of a smirk at x (for hanging fangs on it). */
function smirkLipY(w, h, lop, x) {
  const yl = lop > 0 ? h * 0.08 : h * 0.5, yr = lop > 0 ? h * 0.5 : h * 0.08, t = clamp01(x / w + 0.5);
  return (1 - t) * (1 - t) * yl + 2 * (1 - t) * t * (-h * 0.3) + t * t * yr;
}
/**
 * The mouth set. Each kind -> [{shape(s), color key, lift layer, dy}]. w, h = the species' grin size; lop = +1 the right
 * corner (viewer's right) rides up, -1 the left. Colours: 'in' mouth interior, 'line' ink, 'tongue', 'tooth'.
 */
function mouthLayers(kind, w, h, lop = 1) {
  const L = [];
  const add = (shape, col, layer = 0, dy = 0) => L.push({ shape, col, layer, dy });
  const tongue = (x, y, rx, ry) => add(ovalShape(rx, ry, y, x), 'tongue', 1);
  const fangs = (xs, lipY, len) => xs.forEach((x) => { const s = new THREE.Shape(), y0 = lipY(x) + h * 0.06, fw = Math.max(w * 0.045, h * 0.2); s.moveTo(x - fw, y0); s.lineTo(x + fw, y0); s.quadraticCurveTo(x + fw * 0.2, y0 - len * 0.7, x, y0 - len); s.quadraticCurveTo(x - fw * 0.2, y0 - len * 0.7, x - fw, y0); add(s, 'tooth', 2); });
  // a tongue lolling out: a fat petal pointing down from (x, y), with an ink crease down the middle
  const hangTongue = (x, y, len, wid, rot = 0) => {
    const pts = petalShape(len, wid * 1.6, 0.5).extractPoints(8).shape, c = Math.cos(Math.PI + rot), sn = Math.sin(Math.PI + rot), p = new THREE.Shape();
    const T = (qx, qy) => [x + qx * c - qy * sn, y + qx * sn + qy * c];
    pts.forEach((q, i) => { const [X, Y] = T(q.x, q.y); i ? p.lineTo(X, Y) : p.moveTo(X, Y); });
    add(p, 'tongue', 1);
    add(strokeShape([T(0, len * 0.3), T(0, len * 0.72)], Math.max(0.0022, wid * 0.12)), 'inkSoft', 2);
  };
  switch (kind) {
    case 'beam': { add(grinShape(w, h), 'in'); tongue(0, -h * 0.78, w * 0.2, h * 0.32); break; }
    case 'smirk': case 'fang': case 'fangTongue': {
      const s = new THREE.Shape(), yl = lop > 0 ? h * 0.08 : h * 0.5, yr = lop > 0 ? h * 0.5 : h * 0.08;
      s.moveTo(-w / 2, yl); s.quadraticCurveTo(0, -h * 0.3, w / 2, yr); s.quadraticCurveTo(lop * w * 0.12, -h * 2.05, -w / 2, yl);
      add(s, 'in');
      if (kind !== 'fangTongue') tongue(-lop * w * 0.1, -h * 0.72, w * 0.16, h * 0.26);
      // the dimple at the high corner: the smirk's whole attitude
      const cx = lop * w / 2, cy = lop > 0 ? yr : yl;
      add(strokeShape(sample(6, (u) => [cx + lop * (0.01 + u * 0.05) * w * 1.2, cy + (u * 0.55 - 0.1) * h - u * u * 0.3 * h]), Math.max(0.0035, h * 0.1)), 'line', 1);
      if (kind === 'fang' || kind === 'fangTongue') fangs(kind === 'fang' ? [lop * w * 0.2] : [-w * 0.2, w * 0.2], (x) => smirkLipY(w, h, lop, x), h * 0.62);
      if (kind === 'fangTongue') hangTongue(-lop * w * 0.06, -h * 0.55, h * 1.35, w * 0.13, -lop * 0.12);
      break;
    }
    case 'fangUp': {
      // the hooligan grin: a lopsided smirk with two little teeth poking UP from the lower lip
      const s = new THREE.Shape(), yl = lop > 0 ? h * 0.08 : h * 0.45, yr = lop > 0 ? h * 0.45 : h * 0.08;
      s.moveTo(-w / 2, yl); s.quadraticCurveTo(0, -h * 0.25, w / 2, yr); s.quadraticCurveTo(lop * w * 0.1, -h * 1.9, -w / 2, yl);
      add(s, 'in');
      for (const x of [-w * 0.2, w * 0.14]) { const t = new THREE.Shape(), fw = Math.max(w * 0.05, h * 0.2), yb = -h * 0.72 + Math.abs(x) * h * 1.2; t.moveTo(x - fw, yb - h * 0.1); t.lineTo(x + fw, yb - h * 0.1); t.quadraticCurveTo(x + fw * 0.2, yb + h * 0.35, x, yb + h * 0.55); t.quadraticCurveTo(x - fw * 0.2, yb + h * 0.35, x - fw, yb - h * 0.1); add(t, 'tooth', 1); }
      break;
    }
    case 'grimace': {
      const W = w * 0.84, H = h * 1.25, rr = H * 0.34, y0 = -h * 0.5, s = new THREE.Shape();
      s.moveTo(-W / 2 + rr, y0 - H / 2); s.lineTo(W / 2 - rr, y0 - H / 2); s.quadraticCurveTo(W / 2, y0 - H / 2, W / 2, y0 - H / 2 + rr); s.lineTo(W / 2, y0 + H / 2 - rr);
      s.quadraticCurveTo(W / 2, y0 + H / 2, W / 2 - rr, y0 + H / 2); s.lineTo(-W / 2 + rr, y0 + H / 2); s.quadraticCurveTo(-W / 2, y0 + H / 2, -W / 2, y0 + H / 2 - rr); s.lineTo(-W / 2, y0 - H / 2 + rr); s.quadraticCurveTo(-W / 2, y0 - H / 2, -W / 2 + rr, y0 - H / 2);
      add(s, 'line');
      const i = Math.max(0.004, H * 0.16), s2 = new THREE.Shape(), W2 = W - 2 * i, H2 = H - 2 * i, r2 = Math.max(0.002, rr - i);
      s2.moveTo(-W2 / 2 + r2, y0 - H2 / 2); s2.lineTo(W2 / 2 - r2, y0 - H2 / 2); s2.quadraticCurveTo(W2 / 2, y0 - H2 / 2, W2 / 2, y0 - H2 / 2 + r2); s2.lineTo(W2 / 2, y0 + H2 / 2 - r2);
      s2.quadraticCurveTo(W2 / 2, y0 + H2 / 2, W2 / 2 - r2, y0 + H2 / 2); s2.lineTo(-W2 / 2 + r2, y0 + H2 / 2); s2.quadraticCurveTo(-W2 / 2, y0 + H2 / 2, -W2 / 2, y0 + H2 / 2 - r2); s2.lineTo(-W2 / 2, y0 - H2 / 2 + r2); s2.quadraticCurveTo(-W2 / 2, y0 - H2 / 2, -W2 / 2 + r2, y0 - H2 / 2);
      add(s2, 'tooth', 1);
      const lw = Math.max(0.0025, H * 0.07);
      add(strokeShape([[-W2 / 2 + r2 * 0.3, y0], [W2 / 2 - r2 * 0.3, y0]], lw), 'line', 2);
      for (const x of [-0.24, 0, 0.24]) add(strokeShape([[x * W, y0 - H2 / 2 + lw], [x * W, y0 + H2 / 2 - lw]], lw), 'line', 2);
      break;
    }
    case 'shout': {
      const s = new THREE.Shape();
      s.moveTo(-w * 0.44, h * 0.12); s.quadraticCurveTo(0, h * 0.3, w * 0.44, h * 0.12); s.quadraticCurveTo(w * 0.46, -h * 2.6, 0, -h * 2.1); s.quadraticCurveTo(-w * 0.46, -h * 2.6, -w * 0.44, h * 0.12);
      add(s, 'in');
      tongue(0, -h * 1.45, w * 0.2, h * 0.36);
      fangs([-w * 0.22, w * 0.22], (x) => h * 0.12 + h * 0.18 * (1 - Math.pow(x / (w * 0.44), 2)) - h * 0.1, h * 0.55);
      break;
    }
    case 'ow': add(strokeShape(sample(22, (u) => [lerp(-0.33, 0.33, u) * w, -h * 0.35 + h * 0.3 * Math.sin(u * 1.5 * TAU)]), Math.max(0.0035, h * 0.15)), 'line'); break;
    case 'worry': add(strokeShape(sample(22, (u) => { const x = lerp(-0.3, 0.3, u); return [x * w, -h * 0.42 * (1 - (x * x) / 0.09) + h * 0.07 * Math.sin(u * 3 * Math.PI)]; }), Math.max(0.0035, h * 0.14)), 'line'); break;
    case 'dizzy': {
      const s = new THREE.Shape(); s.absellipse(lop * w * 0.06, -h * 0.55, w * 0.26, h * 0.78, 0, TAU, false, 0.3);
      add(s, 'in');
      hangTongue(lop * w * 0.14, -h * 0.9, h * 1.5, w * 0.15, lop * 0.35);
      break;
    }
    case 'tongue': {
      add(strokeShape(sample(18, (u) => { const x = lerp(-0.36, 0.36, u); return [x * w, -h * 0.4 * (1 - (x * x) / 0.13) + h * 0.05]; }), Math.max(0.0035, h * 0.13)), 'line', 1);
      hangTongue(lop * w * 0.05, -h * 0.28, h * 1.45, w * 0.15, -lop * 0.1);
      break;
    }
    case 'cat': {
      add(strokeShape(sample(24, (u) => [lerp(-0.34, 0.34, u) * w, -h * 0.55 * Math.pow(Math.sin(2 * Math.PI * u) ** 2, 0.85)]), Math.max(0.003, h * 0.12)), 'line');
      break;
    }
    case 'line': add(ovalShape(w / 2, Math.max(0.006, h / 2)), 'line'); break;
    case 'frown': add(grinShape(w, -Math.abs(h)), 'in'); break;
    case 'oh': default: { add(ovalShape(w * 0.22, h * 0.72, -h * 0.35), 'in'); add(ovalShape(w * 0.1, h * 0.22, -h * 0.72), 'tongue', 1); break; }
  }
  return L;
}

function starGeometry() {
  const s = new THREE.Shape(), N = 4, R = 1, r = 0.34;
  for (let i = 0; i < N * 2; i++) { const a = i / (N * 2) * TAU + Math.PI / 2, rr = i % 2 ? r : R; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  const a = new THREE.ShapeGeometry(s), b = a.clone().rotateY(Math.PI / 2), c = a.clone().rotateX(Math.PI / 2);
  return mergeGeometries([a.toNonIndexed(), b.toNonIndexed(), c.toNonIndexed()]);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. The builder: bones + parts -> merged skinned buckets
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const BUCKETS = ['toon', 'unlit', 'trans', 'hull'];
const LID_LEVELS = [0.22, 0.4, 0.58, 0.76, 1.0];

class Builder {
  constructor(id) {
    this.id = id;
    this.bones = [];
    this.byName = new Map();
    this.parts = { toon: [], unlit: [], trans: [], hull: [] };
    this.meta = { eyes: [], mouths: [], ohs: [], face: { eyes: [], mouths: {} } };
    this.skin = null; this.brows = false; this.browColor = null;
    this.bone('root', null, [0, 0, 0]);
    this.bone('body', 'root', [0, 0, 0]);
  }
  has(name) { return this.byName.has(name); }
  /** Declare a bone at an absolute rest position (monster space). restScale 0 = hidden until a clip shows it. */
  bone(name, parent = 'body', pos = [0, 0, 0], restScale = 1) {
    if (this.byName.has(name)) return name;
    const pi = parent == null ? -1 : (this.byName.has(parent) ? this.byName.get(parent) : 1);
    this.byName.set(name, this.bones.length);
    this.bones.push({ name, parent: pi, pos: V3(pos[0], pos[1], pos[2]), scale: restScale });
    return name;
  }
  /** Move a bone's rest pivot (only before any child bone is declared under it). */
  setBone(name, pos) { const i = this.byName.get(name); if (i != null) this.bones[i].pos.set(pos[0], pos[1], pos[2]); return name; }
  bonePos(name) { const i = this.byName.get(name); return i == null ? V3() : this.bones[i].pos.clone(); }
  idx(name) { const i = this.byName.get(name); return i == null ? 1 : i; }

  _attrs(g, bucket, color, alpha, bone, weights, vcol) {
    const n = g.attributes.position.count, p = g.attributes.position, nr = g.attributes.normal;
    const itemSize = bucket === 'trans' ? 4 : 3;
    const col = new Float32Array(n * itemSize), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const base = C3(color), tmp = new THREE.Color(), bi = this.idx(bone);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let c = base;
      if (vcol) { c = vcol(x, y, z, nr ? nr.getY(i) : 0, tmp, nr ? nr.getX(i) : 0, nr ? nr.getZ(i) : 0) || base; }
      col[i * itemSize] = c.r; col[i * itemSize + 1] = c.g; col[i * itemSize + 2] = c.b;
      if (itemSize === 4) col[i * 4 + 3] = alpha;
      const w = weights ? weights(x, y, z) : null;
      if (!w || !w.length) { si[i * 4] = bi; sw[i * 4] = 1; }
      else {
        let tot = 0; const ws = w.slice(0, 4);
        for (const [, wt] of ws) tot += Math.max(0, wt);
        ws.forEach(([nm, wt], k) => { si[i * 4 + k] = this.idx(nm); sw[i * 4 + k] = tot > 0 ? Math.max(0, wt) / tot : (k === 0 ? 1 : 0); });
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, itemSize));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    return g;
  }

  /**
   * Add a part. o: {m: Matrix4, bone, color, alpha, outline: thickness|0, ocolor, weights(x,y,z)->[[bone,w]..],
   * vcol(x,y,z,ny,tmpColor)->Color, noHull}
   */
  add(bucket, geo, o = {}) {
    try {
      const { m = null, bone = 'body', color = MON.white, alpha = 1, outline = 0, ocolor = null, weights = null, vcol = null } = o;
      let g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.morphAttributes = {};
      if (!g.attributes.normal) g.computeVertexNormals();
      if (m) g.applyMatrix4(m);
      this.parts[bucket].push(this._attrs(g, bucket, color, alpha, bone, weights, vcol));
      if (outline > 0) this.hull(geo, { m, th: outline, color: ocolor || outlineOf(color), bone, weights });
      return g;
    } catch (e) { reportError(`Monsters.build(${this.id}) part`, e); return null; }
  }
  /** Inverted-hull outline shell for a part (smoothed normals, so boxes and extrusions don't crack). */
  hull(geo, { m = null, th = 0.02, color = PAL.outline.char, bone = 'body', weights = null } = {}) {
    try {
      let g = geo.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
      g.morphAttributes = {};
      if (m) g.applyMatrix4(m);
      g = mergeVertices(g, 1e-4);
      g.computeVertexNormals();
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * th, p.getY(i) + n.getY(i) * th, p.getZ(i) + n.getZ(i) * th);
      g = g.toNonIndexed();
      this.parts.hull.push(this._attrs(g, 'hull', color, 1, bone, weights, null));
    } catch (e) { reportError(`Monsters.build(${this.id}) hull`, e); }
  }
  toon(geo, o) { return this.add('toon', geo, o); }
  unlit(geo, o) { return this.add('unlit', geo, o); }
  trans(geo, o) { return this.add('trans', geo, o); }

  /**
   * The eye rig (MONSTER-BIBLE §0 + the face-state layer). A sclera ball SUNK into the body so only a cap bulges (no
   * sticker look at 3/4), converging pupils on their own bone so they can glance, a highlight, and — the expression —
   * a body-coloured upper LID with an ink lash on its own bone (closure 0 open .. 1 shut, tilt), an optional BROW, and
   * hidden face decals for squeezed-shut (> <), dizzy (spirals) and happy (^ ^) eyes. The face driver (§6) animates them.
   * o: {surf, y, gap, r, tilt (deg, + = angry inward: the lid's resting slant), parent, pupil (ratio), hl, xOff, pitch,
   *     lid (colour | false; default the species skin), brows (bool), browColor, pupilShape 'round'|'slit'|'bar'|'none',
   *     pupilColor, scleraColor, outline, forward (extra push), bulge (0..1 of the ball that shows), names}
   */
  eyes(o) {
    if (!o.ball) return this.paintedEyes(o);
    // ball eyes on a surface: r is the radius the eye SHOWS; the ball behind it is bigger and sunk so only a dome bulges
    const { surf, y, gap, r, xOff = 0, forward = 0, bulge = 0.3, zScale = 0.84, names = ['eyeL', 'eyeR'] } = o;
    const R = r / Math.sqrt(1 - (1 - bulge) * (1 - bulge));
    const pts = [-1, 1].map((side) => {
      const x = side * gap / 2 + xOff;
      const th = thetaFor(surf, y, x - surf.c.x);
      const push = (bulge - 1) * R * zScale + forward;
      const c = surfPoint(surf, y, th, push);
      return { pos: [c.x, c.y, c.z], yaw: th, side, Y: y, th, x, lift: Math.max(0.002, forward * 0.5) };
    });
    return this.eyesAt(pts, Object.assign({ zScale }, o, { names, surf, r: R, rVis: r }));
  }
  /**
   * PAINTED eyes — the Dragon Quest way: they lie ON the body as gently domed decals (an ink rim, a white oval, a pupil
   * that glances, two highlights), so nothing floats past the outline at 3/4. The expression is a body-coloured LID that
   * slides down over them (six closures, each with its ink lash; the driver picks one and slants it) plus the brows and
   * the > <, spiral and ^ ^ decals from _eyeExtras. o: {surf, y, gap, r, xOff, forward, sy (oval), pupil (ratio),
   * pupilShape 'round'|'slit'|'bar', rim (ink rim, eye radii), tilt (resting lid slant), lid (colour), lidVcol, brows...}
   */
  paintedEyes(o) {
    const { surf, y, gap, r, xOff = 0, forward = 0, names = ['eyeL', 'eyeR'], parent = 'body', sy = 1.16, pupil = 0.5, hl = true,
      pupilColor = MON.pupil, scleraColor = MON.white, rim = 0.09, rimColor = PAL.outline.char, tilt = 0, pupilShape = 'round',
      lash = PAL.outline.char, dome = 0.12, lidVcol = null } = o;
    const lidCol = o.lid === false ? null : (o.lid || this.skin || null);
    const d = Math.max(0.0011, r * 0.028), L0 = 0.0025 + forward;
    const domeZ = (X, Yy) => r * dome * Math.sqrt(Math.max(0, 1 - (X / (r * 1.04)) ** 2 - (Yy / (r * sy * 1.04)) ** 2));
    const out = [];
    [-1, 1].forEach((side, k) => {
      const x = side * gap / 2 + xOff, th = thetaFor(surf, y, x - surf.c.x), c = surfPoint(surf, y, th, 0);
      const name = this.bone(names[k] || ('eye' + k), parent, [c.x, c.y, c.z]);
      this.meta.eyes.push(name);
      // a lid must clear its neighbour's dome too (touching eyes are the Gloop look)
      const nx = -side * gap, both = (X, Yy) => Math.max(domeZ(X, Yy), domeZ(X - nx, Yy));
      const put = (geo, layer, { at = [0, 0], clampY = null, over = false } = {}) => {
        const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          let X = p.getX(i) + at[0], Yy = p.getY(i) + at[1];
          if (clampY != null && Yy < clampY) Yy = clampY;
          p.setXYZ(i, X, Yy, p.getZ(i) + (over ? both(X, Yy) : domeZ(X, Yy)));
        }
        return wrapOn(g, surf, y, th, L0 + layer * d);
      };
      if (rim > 0) this.unlit(put(discGeo(r * (1 + rim), r * sy + r * rim, 24, 3), 0), { bone: name, color: rimColor });
      this.unlit(put(discGeo(r, r * sy, 24, 4), 1), { bone: name, color: scleraColor });
      const pupilBone = this.bone(name + 'Pupil', name, [c.x, c.y, c.z]);
      const pr = r * pupil, px = -side * r * 0.08, py = -r * 0.06;
      const [pw, ph] = pupilShape === 'slit' ? [0.3, 1.3] : pupilShape === 'bar' ? [1.35, 0.62] : [1, 1.14];
      this.unlit(put(discGeo(pr * pw, pr * ph, 20, 2), 2, { at: [px, py] }), { bone: pupilBone, color: pupilColor });
      if (hl) {
        this.unlit(put(discGeo(pr * 0.36, pr * 0.4, 12, 1), 3, { at: [px - pr * 0.36, py + pr * 0.44] }), { bone: pupilBone, color: MON.white });
        this.unlit(put(discGeo(pr * 0.15, pr * 0.15, 8, 1), 3, { at: [px + pr * 0.34, py - pr * 0.42] }), { bone: pupilBone, color: MON.white });
      }
      const lids = [];
      const tn = [Math.cos(th), 0, -Math.sin(th)];
      const lidShear = (inner, outer) => (X, Y2, Z) => { const xl = (X - c.x) * tn[0] + (Z - c.z) * tn[2]; const wi = clamp01(0.5 - side * xl / (2 * r * 1.2)); return [[inner, wi], [outer, 1 - wi]]; };
      if (lidCol) {
        const E = 1.2;
        for (const lv of LID_LEVELS) {
          const lb = this.bone(`${name}Lid${Math.round(lv * 100)}`, name, [c.x, c.y, c.z], 0);
          const lI = this.bone(lb + 'I', lb, [c.x, c.y, c.z]), lO = this.bone(lb + 'O', lb, [c.x, c.y, c.z]);
          lids.push(lb);
          const yc = lv >= 1 ? -r * sy * E : r * sy * (1 - 2 * lv);
          const vc = lidVcol ? ((X, Y2, Z, ny, tmp) => lidVcol(X, Y2, Z, ny, tmp)) : null;
          const wts = lidShear(lI, lO);
          this.toon(put(discGeo(r * E, r * sy * E, 20, 4), 4, { clampY: yc, over: true }), { bone: lb, color: lidCol, vcol: vc, weights: wts });
          // the lash: the lid's edge, a touch of sag; a closed lid is one soft curve across the middle
          const closed = lv >= 1, yl = closed ? -r * sy * 0.28 : yc, hw = closed ? r * 1.04 : r * Math.sqrt(Math.max(0.02, 1 - (yc / (r * sy)) ** 2)) * 1.06;
          const sag = closed ? r * 0.2 : r * 0.07;
          const lg = flatGeo(strokeShape(sample(9, (u) => { const X = lerp(-hw, hw, u); return [X, yl - sag * (1 - (X / hw) ** 2)]; }), (u) => r * (0.085 + 0.05 * Math.sin(Math.PI * u))), 0, 5);
          this.unlit(put(lg, 5, { over: true }), { bone: lb, color: lash, weights: wts });
        }
      }
      const e = this._eyeExtras(name, { pos: [c.x, c.y, c.z], side, parent, Y: y, th, x, r, zScale: 0.84, lift: L0 + d * 2 }, Object.assign({}, o, { surf, sy }));
      Object.assign(e, { pupil: pupilBone, lids, lidHalf: r * 1.2, kind: 'painted', baseTilt: tilt, R: r, zs: 0, sy, th });
      out.push({ name, pos: V3(c.x, c.y, c.z), th });
    });
    return out;
  }
  /** Eyes at explicit points: [{pos:[x,y,z], yaw, pitch?, side, parent?}] (lids, stalks, sockets). Same options as eyes(). */
  eyesAt(points, o) {
    const { r, tilt = 0, parent = 'body', pupil = 0.46, hl = true, pitch = 0,
      pupilShape = 'round', pupilColor = MON.pupil, scleraColor = MON.white, outline = 0.008, names = ['eyeL', 'eyeR'],
      hlColor = MON.white, zScale = 0.84, sy = 1.1, sclera = true } = o;
    const rVis = o.rVis || r;
    const lid = o.lid === false || !sclera ? null : (o.lid || this.skin || null);
    const out = [];
    points.forEach((P, k) => {
      const side = P.side ?? (k === 0 ? -1 : 1), c = P.pos, par = P.parent || parent;
      const name = this.bone(names[k] || ('eye' + k), par, c);
      this.meta.eyes.push(name);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-(P.pitch ?? pitch) * DEG, P.yaw || 0, 0, 'YXZ'));
      const base = new THREE.Matrix4().compose(V3(c[0], c[1], c[2]), q, V3(1, 1, 1));
      const at = (p, s = [1, 1, 1], rz = 0) => base.clone().multiply(MT(p, [0, 0, rz], s));
      if (sclera) this.unlit(new THREE.SphereGeometry(r, 20, 16), { m: at([0, 0, 0], [1, sy, zScale]), bone: name, color: scleraColor, outline, ocolor: PAL.outline.char });
      const pupilBone = this.bone(name + 'Pupil', name, c);
      const pr = rVis * pupil, px = -side * rVis * 0.1, pz = r * zScale * 0.97;
      if (pupilShape !== 'none') {
        let pg;
        if (pupilShape === 'slit') pg = at([px, 0, pz], [0.26, 1.55, 0.35]);
        else if (pupilShape === 'bar') pg = at([px * 0.5, -r * 0.04, pz], [1.38, 0.8, 0.4]);
        else pg = at([px, -r * 0.04, pz], [1, 1.1, 0.45]);
        this.unlit(new THREE.SphereGeometry(pr, 14, 10), { m: pg, bone: pupilBone, color: pupilColor });
        if (hl) {
          this.unlit(new THREE.SphereGeometry(pr * 0.36, 10, 8), { m: at([px - pr * 0.42, pr * 0.46, pz + pr * 0.5], [1, 1, 0.5]), bone: pupilBone, color: hlColor });
          this.unlit(new THREE.SphereGeometry(pr * 0.15, 8, 6), { m: at([px + pr * 0.36, -pr * 0.4, pz + pr * 0.45], [1, 1, 0.5]), bone: pupilBone, color: hlColor });
        }
      }
      let lidBone = null;
      if (lid) {
        lidBone = this.bone(name + 'Lid', name, c);
        const rl = r + Math.max(0.0015, outline * 0.4);
        this.toon(new THREE.SphereGeometry(rl, 24, 8, 0, TAU, 0, Math.PI / 2), { m: at([0, 0, 0], [1, sy, zScale]), bone: lidBone, color: lid, outline: 0 });
        const lashR = Math.max(0.0035, r * 0.13);
        const lash = new THREE.TorusGeometry(rl, lashR, 6, 26, Math.PI); lash.rotateX(Math.PI / 2);
        this.unlit(lash, { m: at([0, 0, 0], [1, sy, zScale]), bone: lidBone, color: o.lash || PAL.outline.char });
        for (const sx of [-1, 1]) this.unlit(new THREE.SphereGeometry(lashR, 6, 5), { m: at([sx * rl, 0, 0]), bone: lidBone, color: o.lash || PAL.outline.char });
      }
      const e = this._eyeExtras(name, Object.assign({}, P, { side, parent: par, q, r: rVis, zScale }), o);
      Object.assign(e, { pupil: pupilBone, lid: lidBone, kind: sclera ? 'ball' : 'flat', baseTilt: tilt, zs: zScale, sy, R: r });
      out.push({ name, pos: V3(c[0], c[1], c[2]), th: P.yaw || 0 });
    });
    return out;
  }
  /**
   * Register an eye with the face layer and build its brow + hidden decals (> <, spirals, ^ ^). Used by eyesAt and by
   * species whose eyes are not balls (Glimmergloop's slits, Boohoo's holes, glowstones). P: {pos, side, parent, q?, yaw?,
   * pitch?, Y?, th? (surface placement), r}. o: {surf, brows, browColor, browLen, browLift, decalColor, decals, kind}
   */
  _eyeExtras(name, P, o = {}) {
    const side = P.side, r = P.r ?? o.r, par = P.parent || 'body', c = P.pos, zs = P.zScale ?? 0.84;
    const q = P.q || new THREE.Quaternion().setFromEuler(new THREE.Euler(-(P.pitch || 0) * DEG, P.yaw || 0, 0, 'YXZ'));
    const surf = o.surf && P.Y != null ? o.surf : null;
    const ink = o.decalColor || PAL.outline.char, depth = 0, lift = (P.lift || 0.002) + r * 0.05;
    const decal = (bone, shape, color, dy = 0, fwd = 0.45, dth = 0) => {
      const g = flatGeo(shape, depth);
      if (surf) this.unlit(wrapOn(g, surf, P.Y + dy, P.th + dth, lift), { bone, color });
      else { const m = new THREE.Matrix4().compose(V3(c[0], c[1], c[2]), q, V3(1, 1, 1)).multiply(MT([0, dy, r * zs * fwd])); this.unlit(g, { m, bone, color }); }
    };
    // the local frame the driver moves things in: on a body, "up" follows the surface (a vertical move also slides in
    // or out by the slope, so a slanted lid or brow never sinks into a sloping body); off a body, the eye's own up
    const fr = surf ? (() => { const e2 = 0.004, sl = (surf.r(P.Y + e2, P.th) - surf.r(P.Y - e2, P.th)) / (2 * e2); return { up: [Math.sin(P.th) * sl, 1, Math.cos(P.th) * sl], tan: [Math.cos(P.th), 0, -Math.sin(P.th)] }; })()
      : (() => { const u = V3(0, 1, 0).applyQuaternion(q), t = V3(1, 0, 0).applyQuaternion(q); return { up: [u.x, u.y, u.z], tan: [t.x, t.y, t.z] }; })();
    const entry = { eye: name, side, r, q: [q.x, q.y, q.z, q.w], pupil: null, lid: null, brow: null, shut: null, dizzy: null, happy: null, kind: o.kind || 'flat', baseTilt: 0, zs, sy: 1, up: fr.up, tan: fr.tan };
    /** skin weights that split a part between an inner-end bone and an outer-end bone by its local x (a slant = a shear) */
    const shear = (pivot, half, inner, outer) => (x, y, z) => { const xl = (x - pivot[0]) * fr.tan[0] + (y - pivot[1]) * fr.tan[1] + (z - pivot[2]) * fr.tan[2]; const wi = clamp01(0.5 - side * xl / (2 * half)); return [[inner, wi], [outer, 1 - wi]]; };
    entry.shear = shear;
    const brows = o.brows ?? this.brows;
    if (brows) {
      const bl = o.browLift ?? 1.38, dy = r * bl, len = o.browLen ?? 1.25;
      const dth = surf ? (thetaFor(surf, P.Y + dy, (P.x ?? Math.sin(P.th) * surf.r(P.Y, P.th)) + side * r * 0.1 - surf.c.x) - P.th) : 0;
      const pos = surf ? surfPoint(surf, P.Y + dy, P.th + dth, 0) : V3(c[0], c[1], c[2]).add(V3(0, dy, r * zs * 0.55).applyQuaternion(q));
      const pv = [pos.x, pos.y, pos.z];
      entry.brow = this.bone(name + 'Brow', par, pv);
      entry.browI = this.bone(name + 'BrowI', entry.brow, pv); entry.browO = this.bone(name + 'BrowO', entry.brow, pv);
      entry.browHalf = 0.5 * len * r;
      const bc = o.browColor || this.browColor || mixHex(this.skin || PAL.outline.char, PAL.outline.char, 0.72);
      const wts = shear(pv, entry.browHalf, entry.browI, entry.browO);
      entry.browWeights = wts; entry.browPos = pv;
      if (o.browShape !== false) {
        const g = flatGeo(browShape(r, side, len), depth);
        if (surf) this.unlit(wrapOn(g, surf, P.Y + dy, P.th + dth, lift + 0.0012), { bone: entry.brow, color: bc, weights: wts });
        else this.unlit(g, { m: new THREE.Matrix4().compose(V3(c[0], c[1], c[2]), q, V3(1, 1, 1)).multiply(MT([side * r * 0.1, dy, r * zs * 0.55])), bone: entry.brow, color: bc, weights: wts });
      }
    }
    if (o.decals !== false) {
      const pos = surf ? surfPoint(surf, P.Y, P.th, 0) : V3(c[0], c[1], c[2]).add(V3(0, 0, r * zs * 0.45).applyQuaternion(q));
      const at = [pos.x, pos.y, pos.z];
      entry.shut = this.bone(name + 'Shut', par, at, 0); decal(entry.shut, shutEyeShape(r, side), ink);
      entry.happy = this.bone(name + 'Happy', par, at, 0); decal(entry.happy, happyEyeShape(r), ink);
      // dizzy spirals spin by flipping through four pre-turned frames (a turning decal would sink into a curved body)
      entry.dizzy = [0, 1, 2, 3].map((f) => { const bn = this.bone(name + 'Dizzy' + f, par, at, 0); decal(bn, spiralShape(r, side, -side * f * Math.PI / 2), ink); return bn; });
    }
    this.meta.face.eyes.push(entry);
    return entry;
  }

  /**
   * The mouth set for the face layer: every expression the species can pull, each a decal on its own bone (only one is
   * shown at a time). kinds: beam (the befriended grin) · smirk · fang · fangTongue · grimace · shout · ow · worry ·
   * dizzy · tongue · cat · line · frown · oh. `beam` names which kind is the resting 'mouth' bone.
   */
  faceMouths(o) {
    const { surf, y, w = 0.16, h = 0.055, xOff = 0, parent = 'body', prefix = '', lop = 1, lift = 0.003,
      kinds = ['beam', 'smirk', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'worry', 'oh'], beam = 'beam', colors = {}, sizes = {} } = o;
    const th = thetaFor(surf, y, xOff - surf.c.x), c = surfPoint(surf, y, th, 0);
    const COL = Object.assign({ in: PAL.slime.mouth, line: MON.mouth, tongue: MON.tongue, tooth: MON.tooth, inkSoft: mixHex(MON.tongue, PAL.slime.mouth, 0.55) }, colors);
    const depth = Math.max(0.003, h * 0.1);
    for (const kind of kinds) {
      const bone = kind === beam ? prefix + 'mouth' : kind === 'oh' ? prefix + 'mouthOh' : `${prefix}mouth_${kind}`;
      this.bone(bone, parent, [c.x, c.y, c.z], kind === beam ? 1 : 0);
      this.meta.face.mouths[kind] = bone;
      if (kind === beam) { if (!this.meta.mouths.includes(bone)) this.meta.mouths.push(bone); } else if (kind === 'oh') this.meta.ohs.push(bone);
      const [kw, kh] = sizes[kind] || [1, 1];
      for (const Ly of mouthLayers(kind, w * kw, h * kh, lop)) {
        this.unlit(wrapOn(flatGeo(Ly.shape, depth), surf, y + Ly.dy, th, lift + Ly.layer * depth * 0.95), { bone, color: COL[Ly.col] || COL.line });
      }
    }
    return this.meta.face.mouths;
  }

  /** Mouth decal(s) on a surface. kind 'grin' | 'frown' | 'oh' | 'line' | 'fang'. Returns the bone name. */
  mouth(kind, o) {
    const { surf, y, w = 0.16, h = 0.055, xOff = 0, bone = kind === 'oh' ? 'mouthOh' : 'mouth', parent = 'body', color = PAL.slime.mouth,
      tongue = kind === 'grin', teeth = 0, teethUp = false, lift = 0.003, hidden = false, depth = 0.02 } = o;
    const th = thetaFor(surf, y, xOff - surf.c.x);
    const c = surfPoint(surf, y, th, 0);
    this.bone(bone, parent, [c.x, c.y, c.z], hidden ? 0 : 1);
    if (kind === 'oh') this.meta.ohs.push(bone); else if (!this.meta.mouths.includes(bone)) this.meta.mouths.push(bone);
    const put = (geo, col, extraLift = 0, dy = 0) => this.unlit(wrapOn(geo, surf, y + dy, th, lift + extraLift), { bone, color: col });
    if (kind === 'oh') {
      put(extrude(ovalShape(w / 2, h / 2), depth, 0.005), color);
      put(extrude(ovalShape(w * 0.24, h * 0.18, -h * 0.18), depth, 0.003), MON.tongue, 0.004);
    } else if (kind === 'line') {
      put(extrude(ovalShape(w / 2, Math.max(0.006, h / 2)), depth, 0.003), color);
    } else {
      const hh = kind === 'frown' ? -Math.abs(h) : Math.abs(h);
      put(extrude(grinShape(w, hh), depth, 0.005), color);
      if (tongue && hh > 0) put(extrude(ovalShape(w * 0.2, hh * 0.32, -hh * 0.78), depth, 0.003), MON.tongue, 0.004);
      for (let i = 0; i < teeth; i++) {
        const tx = (teeth === 1 ? 0 : lerp(-w * 0.26, w * 0.26, i / (teeth - 1)));
        const ty = teethUp ? -hh * 1.0 : -hh * 0.12;
        const cone = new THREE.ConeGeometry(Math.max(0.012, w * 0.07), Math.max(0.03, hh * 0.75), 8);
        cone.rotateZ(teethUp ? 0 : Math.PI);
        cone.translate(tx, ty + (teethUp ? hh * 0.3 : -hh * 0.3), 0.012);
        put(cone, MON.tooth, 0.006);
      }
    }
    return bone;
  }

  /** Glossy highlight decal (unlit) wrapped on a surface. */
  gloss(surf, y, th, w, h, { bone = 'body', dot = true, color = MON.white, rot = 0.35, lift = 0.004 } = {}) {
    const g = discGeo(w / 2, h / 2, 20, 5); g.rotateZ(rot);
    this.unlit(wrapOn(g, surf, y, th, lift), { bone, color });
    if (dot) { const d = discGeo(w * 0.16, w * 0.16, 12, 2); this.unlit(wrapOn(d, surf, y + h * 0.62, th + (w * 0.9) / Math.max(0.05, surf.r(y, th)), lift), { bone, color }); }
  }

  build() {
    const geos = {};
    for (const k of BUCKETS) {
      if (!this.parts[k].length) continue;
      try {
        const g = mergeGeometries(this.parts[k], false);
        if (g) { g.userData.shared = true; g.computeBoundingSphere(); geos[k] = g; }
      } catch (e) { reportError(`Monsters.build(${this.id}) merge ${k}`, e); }
      this.parts[k].length = 0;
    }
    return geos;
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 4. Shared FX geometry / materials (lazy)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
let FXRES = null;
function fxRes() {
  if (FXRES) return FXRES;
  const blobGeo = new THREE.IcosahedronGeometry(1, 2); blobGeo.userData.shared = true;
  const starGeo = starGeometry(); starGeo.userData.shared = true;
  const blobMat = makeToon({ color: C3(PAL.char.white), emissive: C3(PAL.cloud.mid).multiplyScalar(0.28) }, { mid: 0.9, midEdge: 0.25, shadeSat: 1.0 }); blobMat.userData.shared = true;
  const starMat = new THREE.MeshBasicMaterial({ color: C3(PAL.char.white), side: THREE.DoubleSide }); starMat.userData.shared = true;
  FXRES = { blobGeo, starGeo, blobMat, starMat };
  return FXRES;
}

/** The little speech bubble a monster says one line in ("Sorry!", "…typical."): a canvas card, cached per line. */
const BUBBLES = new Map();
function bubbleTexture(text) {
  if (BUBBLES.has(text)) return BUBBLES.get(text);
  let tex = null;
  try {
    const W = 512, H = 208, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const font = (px) => `800 ${px}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`;
    let px = 68; g.font = font(px);
    while (g.measureText(text).width > W - 120 && px > 28) { px -= 4; g.font = font(px); }
    const tw = g.measureText(text).width, bw = Math.min(W - 28, tw + 84), bh = 132, bx = (W - bw) / 2, by = 14, r = 52;
    const card = () => { g.beginPath(); g.moveTo(bx + r, by); g.arcTo(bx + bw, by, bx + bw, by + bh, r); g.arcTo(bx + bw, by + bh, bx, by + bh, r); g.arcTo(bx, by + bh, bx, by, r); g.arcTo(bx, by, bx + bw, by, r); g.closePath(); };
    const tail = () => { g.beginPath(); g.moveTo(bx + bw * 0.26, by + bh - 6); g.quadraticCurveTo(bx + bw * 0.22, by + bh + 34, bx + bw * 0.1, by + bh + 52); g.quadraticCurveTo(bx + bw * 0.3, by + bh + 38, bx + bw * 0.42, by + bh - 6); g.closePath(); };
    g.lineJoin = 'round'; g.strokeStyle = css(PAL.outline.char); g.lineWidth = 20;
    card(); g.stroke(); tail(); g.stroke();
    g.fillStyle = css(PAL.cloud.lit); card(); g.fill(); tail(); g.fill();
    g.fillStyle = css(PAL.outline.char); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, by + bh / 2 + 4);
    tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.userData.shared = true;
    tex.userData.aspect = W / H;
  } catch (e) { reportError('Monsters say-bubble', e); }
  BUBBLES.set(text, tex);
  return tex;
}

const _gm = new THREE.Matrix4();
/**
 * Pose `target` (a bone under root whose rest pivot equals the last bone of `chain`) exactly as the chain root>a>b..
 * poses it. Lets a part ride the body in every clip and still be let go of on its own in a death (a Crabbit's ears,
 * Hoot Couture's cape, a Quietling's mask, Mumbleroot's coat).
 */
function glue(ctx, target, chain) {
  const t = ctx.b[target]; if (!t) return;
  _gm.identity();
  for (const n of chain) { const bn = ctx.b[n]; if (!bn) return; bn.updateMatrix(); _gm.multiply(bn.matrix); }
  _gm.decompose(t.position, t.quaternion, t.scale);
}

class Fx {
  constructor(parent) {
    const R = fxRes();
    this.blobs = new THREE.InstancedMesh(R.blobGeo, R.blobMat, 48);
    this.stars = new THREE.InstancedMesh(R.starGeo, R.starMat, 32);
    for (const m of [this.blobs, this.stars]) {
      m.frustumCulled = false; m.visible = false; m.count = 0; m.castShadow = false; m.name = 'monster-fx';
      m.setColorAt(0, C3(PAL.char.white));
      parent.add(m);
    }
    this.list = [];
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = V3(); this.col = new THREE.Color();
  }
  /** kind: 'blob' | 'star'. p: {pos, vel, life, s0, s1, color, grav, drag, spin, flat, sway, delay, shrinkAt} */
  spawn(kind, p) {
    if (this.list.length > 78) return;
    this.list.push(Object.assign({ kind, t: 0, life: 0.5, s0: 0.1, s1: 0, grav: 0, drag: 0, spin: 0, rot: Math.random() * TAU, flat: 1, sway: 0, delay: 0, pos: V3(), vel: V3(), color: PAL.char.white, shape: null }, p, { pos: p.pos.clone(), vel: (p.vel || V3()).clone(), c: C3(p.color || PAL.char.white) }));
  }
  puff(center, n, radius, size, { color = MON.puff, up = 0.6, life = 0.5, delay = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + Math.random() * 0.4, d = V3(Math.cos(a), 0.25 + Math.random() * 0.5, Math.sin(a) * 0.6 + 0.35);
      this.spawn('blob', { pos: center.clone().addScaledVector(d, radius * 0.35), vel: d.multiplyScalar(radius * 2.2).add(V3(0, up, 0)), drag: 3.2, life: life * (0.8 + Math.random() * 0.4), s0: size * 0.5, s1: size * (0.9 + Math.random() * 0.5), color, pop: true, delay });
    }
  }
  chunks(center, n, radius, color, { speed = 2.6, size = 0.05, life = 0.55 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + Math.random() * 0.5, d = V3(Math.cos(a), 0.9 + Math.random() * 0.8, Math.sin(a) * 0.7 + 0.3).normalize();
      this.spawn('blob', { pos: center.clone().addScaledVector(d, radius * 0.4), vel: d.multiplyScalar(speed * (0.7 + Math.random() * 0.5)), grav: 7.5, life, s0: size, s1: size * 0.2, color, flat: 0.45, spin: 8 });
    }
  }
  sparkle(center, n, radius, { size = 0.09, life = 0.6, color = MON.spark, alt = MON.white, speed = 1.1, up = 0.4, delay = 0, ring = false } = {}) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + (ring ? 0 : Math.random() * 0.6);
      const d = ring ? V3(Math.cos(a), 0, Math.sin(a) * 0.5 + 0.2) : V3(Math.cos(a), 0.3 + Math.random() * 0.9, Math.sin(a) * 0.6 + 0.4).normalize();
      this.spawn('star', { pos: center.clone().addScaledVector(d, radius * 0.5), vel: d.multiplyScalar(speed * (0.6 + Math.random() * 0.6)).add(V3(0, up, 0)), drag: 2.4, life: life * (0.8 + Math.random() * 0.4), s0: size, s1: size, spin: (Math.random() < 0.5 ? -1 : 1) * 7, color: i % 2 ? alt : color, twinkle: true, delay: delay + (ring ? i * 0.02 : Math.random() * 0.08) });
    }
  }
  update(dt) {
    const L = this.list;
    let nb = 0, ns = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      if (p.t >= p.life) { L.splice(i, 1); continue; }
      p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.floor != null && p.pos.y < p.floor) { p.pos.y = p.floor; p.vel.set(p.vel.x * 0.4, 0, p.vel.z * 0.4); p.grav = 0; }
      p.rot += p.spin * dt;
    }
    for (const p of L) {
      if (p.delay > 0) continue;
      const k = p.t / p.life;
      let s;
      if (p.twinkle) s = p.s0 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 + 0.25 * Math.sin(p.t * 30));
      else if (p.pop) s = k < 0.3 ? lerp(p.s0, p.s1, easeOutCubic(k / 0.3)) : p.s1 * (1 - easeInQuad((k - 0.3) / 0.7));
      else s = lerp(p.s0, p.s1, k);
      s = Math.max(0.0001, s);
      const sway = p.sway ? Math.sin(p.t * 5) * p.sway : 0;
      this.e.set(p.kind === 'star' ? 0 : p.rot * 0.5 + sway, 0, p.rot); this.q.setFromEuler(this.e);
      if (p.kind === 'star') { this.s.set(s, s, s); this.m4.compose(p.pos, this.q, this.s); this.stars.setMatrixAt(ns, this.m4); this.stars.setColorAt(ns, p.c); ns++; }
      else { this.s.set(s * (p.sx || 1), s * p.flat, s * (p.sz || 1)); this.m4.compose(p.pos, this.q, this.s); this.blobs.setMatrixAt(nb, this.m4); this.blobs.setColorAt(nb, p.c); nb++; }
      if (nb >= 48 || ns >= 32) break;
    }
    this.blobs.count = nb; this.stars.count = ns;
    this.blobs.visible = nb > 0; this.stars.visible = ns > 0;
    if (nb) { this.blobs.instanceMatrix.needsUpdate = true; if (this.blobs.instanceColor) this.blobs.instanceColor.needsUpdate = true; }
    if (ns) { this.stars.instanceMatrix.needsUpdate = true; if (this.stars.instanceColor) this.stars.instanceColor.needsUpdate = true; }
  }
  get alive() { return this.list.length; }
  dispose() { for (const m of [this.blobs, this.stars]) { m.removeFromParent(); m.dispose(); } this.list.length = 0; }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 5. Species. Each: {name, family, build(B) -> {height, radius, shadow?}, idle(ctx, t, dt), death, toon preset,
//    hooks: attackPose(ctx, phase, k), taunt(ctx, ct) -> done, cast, joinPose, defeat(ctx, ct, o) -> done}
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const SPECIES = new Map();
const TEMPLATES = new Map();
function species(id, spec) { SPECIES.set(id, Object.assign({ id, family: 'wild', boss: false, death: 'pop', toon: 'character', winky: false, hover: 0 }, spec)); }

// ── shared bodies ────────────────────────────────────────────────────────────────────────────────────────────
const GLOOP_PTS = [[0, 0], [0.2, 0.0], [0.285, 0.025], [0.315, 0.09], [0.305, 0.18], [0.265, 0.27], [0.2, 0.355], [0.125, 0.43], [0.06, 0.485], [0.022, 0.515], [0, 0.535]];
const GLOOP_PROF = smoothProfile(GLOOP_PTS, 30);

/**
 * A Gloop body at a scale, with its tip bone, eyes, grin and gloss. o: {s:[sx,sy,sz], color, prefix, parent, at:[x,y,z],
 * eyes:{r,gap,tilt,y}, mouth:{w,h,xOff}, dotEyes, outline, face=true, drip, lid}
 */
function gloopBody(B, o = {}) {
  const { s = [1, 1, 1], color = MON.gloop, prefix = '', parent = 'body', at = [0, 0, 0], face = true, outline = 0.02, dotEyes = false, drip = 0, ocolor = null } = o;
  const [sx, sy, sz] = s;
  const bodyBone = prefix ? B.bone(prefix + 'body', parent, at) : 'body';
  const tipBone = B.bone(prefix + 'tip', bodyBone, [at[0], at[1] + 0.33 * sy, at[2]]);
  const geo = lathe(GLOOP_PROF, 28);
  if (drip) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(x, z), k = 1 - smooth(0.02, 0.2, y);
      const bulge = 1 + k * drip * (0.35 + 0.65 * Math.max(0, Math.sin(th * 5 + 0.6)));
      p.setXYZ(i, x * bulge, y, z * bulge);
    }
    geo.computeVertexNormals();
  }
  const light = C3(color).lerp(C3(MON.white), 0.12), deep = C3(color).multiplyScalar(0.86);
  const topY = 0.535 * sy;
  B.toon(geo, {
    m: MT(at, [0, 0, 0], [sx, sy, sz]), color, outline, ocolor, bone: bodyBone,
    weights: (x, y) => { const k = smooth(0.30 * sy + at[1], 0.47 * sy + at[1], y); return [[bodyBone, 1 - k], [tipBone, k]]; },
    vcol: o.vcol || ((x, y, z, ny, tmp) => tmp.copy(deep).lerp(light, smooth(0.0, topY + at[1], y))),
  });
  const surf = latheSurf(GLOOP_PROF, { sx, sy, sz, x: at[0], y: at[1], z: at[2] });
  if (face) {
    const E = Object.assign({ r: 0.075, gap: 0.135, tilt: 0, y: 0.30 }, o.eyes || {});
    if (dotEyes) {
      for (const side of [-1, 1]) {
        const Y = at[1] + E.y * sy, th = thetaFor(surf, Y, side * E.gap * sx / 2);
        const c = surfPoint(surf, Y, th, 0.0);
        B.unlit(new THREE.SphereGeometry(E.r, 10, 8), { m: MT([c.x, c.y, c.z], [0, th, 0], [1, 1.2, 0.6]), bone: bodyBone, color: MON.pupil });
        B.unlit(new THREE.SphereGeometry(E.r * 0.32, 6, 5), { m: MT([c.x - E.r * 0.3, c.y + E.r * 0.4, c.z + E.r * 0.5], [0, th, 0], [1, 1, 0.5]), bone: bodyBone, color: MON.white });
      }
    } else {
      // the lid is the body's own colour at eye height, so a half-shut eye reads as the body closing over it
      const Y = at[1] + E.y * sy, vc = o.vcol || ((x, y, z, ny, tmp) => tmp.copy(deep).lerp(light, smooth(0.0, topY + at[1], y)));
      const skin = '#' + (vc(at[0], Y, at[2] + 0.3, 0, new THREE.Color()) || C3(color)).getHexString();
      B.eyes(Object.assign({ surf, y: Y, gap: E.gap * sx, r: E.r * Math.cbrt(sx * sy * sz), tilt: E.tilt, parent: bodyBone, lid: o.lid === false ? false : skin, lidVcol: vc, brows: o.brows ?? B.brows,
        browColor: o.browColor || mixHex(scaleHex(color, 0.62), PAL.outline.char, 0.45) }, prefix ? { names: [prefix + 'eyeL', prefix + 'eyeR'] } : {}, o.eyeOpts || {}));
    }
    const Mo = Object.assign({ w: 0.16, h: 0.055, xOff: 0, y: 0.2 }, o.mouth || {});
    if (dotEyes) {
      B.mouth(Mo.kind || 'grin', { surf, y: at[1] + Mo.y * sy, w: Mo.w * sx, h: Mo.h * sy, xOff: at[0] + Mo.xOff, bone: prefix + 'mouth', parent: bodyBone, color: Mo.color || PAL.slime.mouth, tongue: Mo.tongue ?? true });
    } else {
      B.faceMouths({ surf, y: at[1] + Mo.y * sy, w: Mo.w * sx, h: Mo.h * sy, xOff: at[0] + Mo.xOff, parent: bodyBone, prefix, lop: Mo.lop ?? 1, beam: Mo.beam || 'beam',
        kinds: Mo.kinds || ['beam', 'smirk', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'worry', 'oh'], sizes: Mo.sizes || {} });
    }
  }
  if (o.gloss !== false) B.gloss(surf, at[1] + 0.38 * sy, -0.62, 0.075 * sx, 0.13 * sy, { bone: bodyBone, color: o.glossColor || MON.white });
  return { surf, bodyBone, tipBone, height: at[1] + topY, radius: 0.315 * Math.max(sx, sz) };
}

// ── idle helpers ─────────────────────────────────────────────────────────────────────────────────────────────
/** The default squash-and-stretch hop. Returns the hop height. */
function hop(ctx, t, { period = 1.15, amp = 0.11, squash = 1, rootName = 'root', bodyName = 'body', phase = 0, weight = 1 } = {}) {
  const w = ctx.idleW * weight, A = amp * ctx.height * w;
  const s = Math.abs(Math.sin(Math.PI * (t + phase) / period));
  const y = A * s;
  const r = ctx.b[rootName], b = ctx.b[bodyName];
  if (r) r.position.y += y;
  const sq = (1 - smooth(0, 0.3, s)) * w * squash, st = smooth(0.35, 0.95, s) * w * squash;
  if (b) b.scale.multiply(V3(1 + 0.09 * sq - 0.03 * st, 1 - 0.12 * sq + 0.06 * st, 1 + 0.09 * sq - 0.03 * st));
  if (rootName === 'root') { ctx.hopY = y; ctx.hopMax = Math.max(1e-4, amp * ctx.height); }
  return y;
}
/** Jelly tip lag: a damped spring driven by the body's vertical motion (the Gloop whip). */
function tipSpring(ctx, dt, name, y, gain = 1) {
  const st = ctx.springs[name] || (ctx.springs[name] = { x: 0, v: 0, py: y, pvy: 0 });
  const vy = dt > 0 ? (y - st.py) / dt : 0, ay = dt > 0 ? (vy - st.pvy) / dt : 0;
  st.py = y; st.pvy = vy;
  st.v += (-90 * st.x - 9 * st.v - ay * 0.02 * gain) * dt; st.x += st.v * dt;
  st.x = THREE.MathUtils.clamp(st.x, -0.35, 0.35);
  const b = ctx.b[name];
  if (b) { b.scale.y *= 1 + st.x * 0.9; b.scale.x *= 1 - st.x * 0.3; b.scale.z *= 1 - st.x * 0.3; b.rotation.z += -6 * DEG * (ctx.vx || 0) * 3 + Math.sin(ctx.t * 2.1) * 2 * DEG; }
  return st.x;
}
function hover(ctx, t, base, amp, period) { const y = (base + amp * Math.sin(TAU * t / period)); ctx.b.root.position.y += y * (0.35 + 0.65 * ctx.idleW) ; ctx.hopY = y; ctx.hopMax = base + amp; ctx.flying = true; return y; }

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 5a. THE GLOOP FAMILY
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
species('gloop', {
  name: 'Gloop', family: 'gloop', toon: 'slime', death: 'pop',
  // the default face set IS the Gloop: sly smirk, heavy lids, shifty glance (FACE_STATES)
  build(B) { const g = gloopBody(B); return { height: g.height, radius: g.radius }; },
  idle(ctx, t, dt) {
    // every fourth hop goes sideways by 0.1 and has to come back, embarrassed
    const P = 1.15, n = Math.floor(t / P), k = (t / P) - n;
    const side = (n % 4 === 2) ? easeInOutQuad(k) : (n % 4 === 3) ? 1 - easeInOutQuad(k) : 0;
    const x = 0.1 * side * ctx.idleW, px = ctx._sx || 0;
    ctx.vx = dt > 0 ? (x - px) / dt : 0; ctx._sx = x;
    ctx.b.root.position.x += x;
    if (n % 4 === 3) { ctx.eyeTilt -= 10 * DEG * Math.sin(Math.PI * k) * ctx.idleW; ctx.b.root.rotation.z += 4 * DEG * Math.sin(Math.PI * k) * ctx.idleW; }
    const y = hop(ctx, t, { period: P });
    tipSpring(ctx, dt, 'tip', y);
  },
});

species('bobble', {
  name: 'Bobble', family: 'gloop', toon: 'slime', death: 'pop', story: true,
  // pompous: the monocle eye held wide under a raised brow, the other squinting, a "Frankly—" smirk
  face: {
    wild: { lid: [0.1, 0.56], tilt: 6, brow: [[0.4, -14], [-0.08, 16]], look: [0.2, 0.05], glance: 0.3, glancePeriod: 4.4, mouth: 'smirk' },
    taunt: { eyes: ['open', 'happy'], lid: [0.05, 1], tilt: 4, brow: [[0.42, -16], [0.1, 6]], look: [-0.3, 0.1], mouth: 'tongue' },
    bothered: { lid: [0.3, 0.3], tilt: -10, brow: [[0.3, -22], [0.3, -22]], look: [-0.5, -0.6], mouth: 'worry' },   // where did it go
  },
  build(B) {
    const g = gloopBody(B, { eyes: { r: 0.078 }, mouth: { w: 0.17, h: 0.06 } });
    // the monocle he does not need and cannot keep on: over his right eye (viewer's left)
    const eye = B.meta.eyes[0], ep = B.bonePos(eye);
    const mono = B.bone('monocle', 'body', [ep.x, ep.y, ep.z + 0.045]);
    const th = Math.atan2(ep.x, ep.z);
    const mm = MT([ep.x, ep.y, ep.z + 0.045], [0, th, 0]);
    B.toon(new THREE.TorusGeometry(0.092, 0.011, 8, 28), { m: mm, bone: mono, color: MON.gold, outline: 0.006 });
    B.trans(new THREE.CircleGeometry(0.088, 24), { m: mm.clone().multiply(MT([0, 0, -0.002])), bone: mono, color: MON.lens, alpha: 0.28 });
    B.unlit(new THREE.CircleGeometry(0.022, 10), { m: mm.clone().multiply(MT([-0.04, 0.045, 0.004], [0, 0, 0], [1, 1.5, 1])), bone: mono, color: MON.white });
    // the thin gold chain, from the rim down to a pin on his side; it swings with the monocle
    const chain = B.bone('chain', 'body', [ep.x - 0.02, ep.y - 0.09, ep.z]);
    const pts = [[ep.x - 0.06, ep.y - 0.07, ep.z + 0.05], [ep.x - 0.13, ep.y - 0.16, ep.z + 0.03], [ep.x - 0.17, ep.y - 0.19, ep.z - 0.02], [-0.25, 0.14, 0.08]];
    B.toon(tube(pts, 0.006, 5, 14), { bone: chain, color: MON.gold, weights: (x, y) => { const k = smooth(ep.y - 0.2, ep.y - 0.06, y); return [['body', 1 - k], [mono, k]]; } });
    B.toon(new THREE.SphereGeometry(0.014, 8, 6), { m: MT([-0.25, 0.14, 0.08]), bone: 'body', color: MON.gold });
    return { height: g.height, radius: g.radius };
  },
  idle(ctx, t, dt) {
    SPECIES.get('gloop').idle(ctx, t, dt);
    // every ~8 s the monocle drops, dangles on its chain, and pops back on at the next hop
    const P = 8.2, k = (t % P), mono = ctx.b.monocle;
    if (!mono || ctx.idleW < 0.5) return;
    if (k > 5.6 && k < 7.5) {
      const f = seg(k, 5.6, 5.95), dang = easeOutBack(f, 2.2);
      const back = seg(k, 7.15, 7.5);
      const drop = dang * (1 - easeOutBack(back, 1.6));
      mono.position.y -= 0.1 * drop; mono.position.x -= 0.07 * drop; mono.position.z += 0.03 * drop;
      mono.rotation.z += Math.sin((k - 5.6) * 9) * 0.35 * drop * (1 - seg(k, 6.2, 7.1) * 0.7);
      ctx.eyeScale *= 1 + 0.12 * hump(k, 5.62, 6.4);
      if (k > 5.62 && k < 6.3) { ctx.showOh = true; ctx.faceKey = 'surprise'; }
      else if (k >= 6.3 && k < 7.15) ctx.faceKey = 'bothered';
    }
  },
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 5b. The rest of the first-build roster (MONSTER-BIBLE §1-§6b)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
species('bloop', {
  name: 'Bloop', family: 'gloop', toon: 'slime', death: 'deflate', say: 'Sorry!', color: MON.bloop, keepShape: ['hat'],
  // a worrier: brows up in the middle, eyes darting, a wobbly little smile
  face: {
    wild: { lid: 0.2, tilt: -14, brow: [[0.28, -28], [0.24, -24]], look: [0, 0.12], glance: 0.8, glancePeriod: 1.7, mouth: 'worry' },
    windup: { lid: 0.52, tilt: 10, brow: [[0.02, 18], [0.02, 18]], mouth: 'grimace' },
    taunt: { eyes: ['happy', 'open'], lid: [1, 0.2], tilt: -8, brow: [[0.1, -10], [0.34, -24]], mouth: 'tongue' },
    friend: { lid: 0, tilt: -8, brow: [[0.34, -16], [0.34, -16]], mouth: 'beam' },
  },
  build(B) {
    const S = [1.02, 0.94, 1.02];
    const g = gloopBody(B, { s: S, color: MON.bloop, eyes: { r: 0.08, gap: 0.15, y: 0.3 }, eyeOpts: { browLift: 1.22 }, browColor: mx(sc(MON.bloop, 0.45), PAL.outline.char, 0.35),
      mouth: { w: 0.11, h: 0.045, xOff: -0.02, y: 0.185, lop: -1, sizes: { worry: [1.3, 1.1], beam: [1.2, 1.1] } } });
    // the nurse's cap, perched on the tip (the tip hides inside it), with a little red cross
    const capY = 0.415;
    const hat = B.bone('hat', 'tip', [0, capY, 0]);
    const cap = new THREE.Shape(); cap.moveTo(-0.075, 0); cap.lineTo(0.075, 0); cap.lineTo(0.105, 0.085); cap.quadraticCurveTo(0, 0.1, -0.105, 0.085); cap.lineTo(-0.075, 0);
    const tiltM = MT([0.01, capY, 0.0], [-10 * DEG, 0, -9 * DEG]);
    B.toon(extrude(cap, 0.13, 0.018), { m: tiltM, bone: hat, color: MON.cream, outline: 0.012 });
    B.toon(roundBox(0.19, 0.022, 0.15, 0.01), { m: tiltM.clone().multiply(MT([0, 0.004, 0])), bone: hat, color: sc(MON.cream, 0.93) });
    const cross = (w, h) => new THREE.BoxGeometry(w, h, 0.012);
    const cm = tiltM.clone().multiply(MT([0, 0.052, 0.085]));
    B.toon(cross(0.05, 0.016), { m: cm, bone: hat, color: MON.cap });
    B.toon(cross(0.016, 0.05), { m: cm, bone: hat, color: MON.cap });
    // rosy cheeks — she worries so hard she's always a bit pink
    for (const side of [-1, 1]) { const Y = 0.22 * S[1], th = thetaFor(g.surf, Y, side * 0.14); B.unlit(wrapOn(discGeo(0.03, 0.017, 20, 4), g.surf, Y, th, 0.003), { color: MON.blush }); }
    return { height: g.height, radius: g.radius };
  },
  idle(ctx, t, dt) {
    const y = hop(ctx, t, { period: 1.15 });
    tipSpring(ctx, dt, 'tip', y);
    const k = t % 3;
    if (k < 0.2) ctx.b.root.rotation.z += 3 * DEG * Math.sin(k * 14 * TAU) * ctx.idleW;
  },
});

species('grumbleglop', {
  name: 'Grumbleglop', family: 'gloop', toon: 'slime', death: 'deflate', color: MON.glop,
  // in a mood since the marsh: heavy lids, low brows, a flat unamused line; befriended, a grudging little smile
  face: {
    wild: { lid: 0.62, tilt: 18, brow: [[-0.14, 26], [-0.1, 20]], look: [0, -0.25], glance: 0.3, glancePeriod: 5.5, mouth: 'line' },
    recover: { lid: 0.6, tilt: 18, brow: [[-0.14, 26], [-0.1, 20]], mouth: 'line' },
    taunt: { lid: 0.72, tilt: 20, brow: [[-0.16, 30], [-0.16, 30]], look: [0, 0], mouth: 'tongue' },
    friend: { lid: 0.34, tilt: 2, brow: [[0.1, -6], [0.14, -10]], look: [0, 0], mouth: 'worry' },
  },
  build(B) {
    const g = gloopBody(B, { s: [1.2, 0.86, 1.2], color: MON.glop, drip: 0.16, eyes: { r: 0.068, gap: 0.16, y: 0.29 }, browColor: mx(sc(MON.glop, 0.45), PAL.outline.char, 0.5),
      mouth: { w: 0.15, h: 0.05, y: 0.165, kinds: ['beam', 'line', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'worry', 'oh'], sizes: { line: [1.2, 0.42] } }, glossColor: mx(MON.glop, 'char.white', 0.55) });
    return { height: g.height, radius: g.radius * 1.12, shadow: g.radius * 2.5 };
  },
  idle(ctx, t, dt) {
    const y = hop(ctx, t, { period: 1.6, amp: 0.075, squash: 1.8 });
    tipSpring(ctx, dt, 'tip', y, 1.4);
    ctx._drip = (ctx._drip || 0) + dt;
    if (ctx._drip > 2 && ctx.idleW > 0.5) {
      ctx._drip = 0;
      const a = (ctx.rand() - 0.5) * 2.2, r = ctx.radius * 0.9;
      ctx.fx.spawn('blob', { pos: V3(Math.sin(a) * r, 0.12 + ctx.rand() * 0.08, Math.cos(a) * r), vel: V3(0, -0.2, 0), grav: 3.5, life: 0.7, s0: 0.03, s1: 0.022, color: sc(MON.glop, 0.85), sx: 0.9, flat: 1.25, floor: 0.0 });
    }
  },
});

species('sir_gloopalot', {
  name: 'Sir Gloopalot', family: 'gloop', toon: 'slime', color: MON.gloopG,
  // the steed is not listening: gazing up and away, tongue out; only a hit gets its attention
  face: {
    wild: { lid: 0.3, tilt: -8, brow: [[0.2, -8], [0.32, -16]], look: [0.55, 0.7], glance: 0, mouth: 'tongue' },
    recover: { lid: 0.3, tilt: -8, brow: [[0.2, -8], [0.32, -16]], look: [0.55, 0.7], mouth: 'tongue' },
    friend: { lid: 0.1, tilt: -6, look: [0.3, 0.4], mouth: 'beam' },
  },
  build(B) {
    const g = gloopBody(B, { s: [1.15, 1.15, 1.15], color: MON.gloopG, eyes: { r: 0.072, gap: 0.14, y: 0.26 }, mouth: { w: 0.15, h: 0.05, y: 0.165 } });
    const y0 = 0.5;
    const rider = B.bone('rider', 'root', [0, y0, -0.02]);
    const steel = MON.steel, dark = MON.steelDark;
    // seat + legs straddling the Gloop
    for (const side of [-1, 1]) B.toon(new THREE.CapsuleGeometry(0.034, 0.07, 4, 10), { m: MT([side * 0.1, y0 + 0.03, 0.04], [0.4, 0, side * 1.0]), bone: rider, color: dark, outline: 0.012 });
    B.toon(new THREE.CapsuleGeometry(0.09, 0.12, 6, 14), { m: MT([0, y0 + 0.14, -0.01], [0, 0, 0], [1, 1, 0.85]), bone: rider, color: steel, outline: 0.014 });
    B.toon(new THREE.TorusGeometry(0.088, 0.016, 6, 18), { m: MT([0, y0 + 0.08, -0.01], [Math.PI / 2, 0, 0], [1, 0.85, 1]), bone: rider, color: MON.wood });
    // helm: the bucket, the visor slot and the two warm dots that are his whole face
    const helm = B.bone('helm', rider, [0, y0 + 0.26, 0]);
    const hp = smoothProfile([[0, 0], [0.105, 0], [0.118, 0.07], [0.112, 0.13], [0.075, 0.17], [0, 0.182]], 18);
    const hy = y0 + 0.235;
    B.toon(lathe(hp, 22), { m: MT([0, hy, 0]), bone: helm, color: steel, outline: 0.014, vcol: (x, y, z, ny, tmp) => tmp.copy(C3(dark)).lerp(C3(MON.steelLight), smooth(hy, hy + 0.17, y)) });
    const hs = latheSurf(hp, { y: hy });
    B.unlit(wrapOn(extrude(ovalShape(0.068, 0.017), 0.01, 0.003), hs, hy + 0.085, 0, 0.002), { bone: helm, color: MON.visor });
    for (const side of [-1, 1]) {
      const p = surfPoint(hs, hy + 0.085, side * 0.24, 0.006);
      B.unlit(new THREE.SphereGeometry(0.018, 10, 8), { m: MT([p.x, p.y, p.z]), bone: helm, color: MON.glowDot });
    }
    B.toon(new THREE.TorusGeometry(0.108, 0.012, 6, 22), { m: MT([0, hy + 0.035, 0], [Math.PI / 2, 0, 0]), bone: helm, color: MON.gold });
    // plume: three flattened cones that trail
    const plume = B.bone('plume', helm, [0, hy + 0.18, -0.02]);
    [[-0.3, 0.9], [0, 1.0], [0.3, 0.85]].forEach(([a, l], i) => {
      const c = new THREE.ConeGeometry(0.035, 0.17 * l, 10); c.translate(0, 0.085 * l, 0);
      B.toon(c, { m: MT([0, hy + 0.17, -0.02], [-0.9 - i * 0.12, 0, a], [1, 1, 0.45]), bone: plume, color: MON.cap, outline: 0.008 });
    });
    // lance (right hand, viewer's left) and shield (left)
    const lance = B.bone('lance', rider, [-0.12, y0 + 0.14, 0.04]);
    const lm = MT([-0.13, y0 + 0.14, 0.05], [1.05, -0.12, 0]);
    const shaft = new THREE.CylinderGeometry(0.012, 0.024, 0.46, 10); shaft.translate(0, 0.12, 0);
    B.toon(shaft, { m: lm, bone: lance, color: MON.cream, outline: 0.006 });
    const tipc = new THREE.ConeGeometry(0.03, 0.08, 10); tipc.translate(0, 0.39, 0);
    B.toon(tipc, { m: lm, bone: lance, color: MON.steelLight, outline: 0.006 });
    B.toon(new THREE.ConeGeometry(0.045, 0.05, 12).translate(0, -0.08, 0), { m: lm, bone: lance, color: steel });
    B.toon(new THREE.SphereGeometry(0.03, 10, 8), { m: MT([-0.13, y0 + 0.14, 0.05]), bone: lance, color: steel, outline: 0.008 });
    const shield = B.bone('shield', rider, [0.13, y0 + 0.14, 0.06]);
    const hs2 = new THREE.Shape(); hs2.moveTo(-0.07, 0.07); hs2.lineTo(0.07, 0.07); hs2.quadraticCurveTo(0.075, -0.03, 0, -0.1); hs2.quadraticCurveTo(-0.075, -0.03, -0.07, 0.07);
    B.toon(extrude(hs2, 0.02, 0.008), { m: MT([0.135, y0 + 0.14, 0.08], [0, 0.35, 0]), bone: shield, color: MON.cap, outline: 0.01 });
    B.toon(new THREE.SphereGeometry(0.028, 10, 8), { m: MT([0.143, y0 + 0.145, 0.1], [0, 0.35, 0], [1, 1, 0.6]), bone: shield, color: MON.gold });
    return { height: y0 + 0.44, radius: g.radius * 1.05, color: MON.gloopG };
  },
  idle(ctx, t, dt) {
    const P = 1.15;
    const y = hop(ctx, t, { period: P, amp: 0.1 });
    tipSpring(ctx, dt, 'tip', y);
    // the knight is NOT parented to the hop: he lags 90 ms and re-seats himself on landing
    const A = 0.1 * ctx.height * ctx.idleW, lagY = A * Math.abs(Math.sin(Math.PI * (t - 0.09) / P));
    const r = ctx.b.rider;
    if (r) {
      r.position.y += lagY - y;
      const since = ((t - 0.09) % P + P) % P;
      const fix = since < 0.18 ? Math.sin(since / 0.18 * Math.PI) : 0;
      r.rotation.z += fix * 5 * DEG * ctx.idleW; r.position.y += fix * 0.012 * ctx.idleW;
      if (ctx.b.plume) ctx.b.plume.rotation.x += (Math.sin(t * 5.2) * 0.12 + (y - lagY) * 1.5);
    }
  },
  attackPose(ctx, ct) {
    const l = ctx.b.lance; if (!l) return;
    l.rotation.x += ct < 0.14 ? -0.35 * seg(ct, 0, 0.14) : ct < 0.33 ? -0.35 + 0.75 * seg(ct, 0.14, 0.25) : 0.4 * (1 - seg(ct, 0.33, 0.7));
  },
  defeat(ctx, ct, o) {
    const r = ctx.b.rider, S = ctx.size;
    // flung off: a 400 ms parabola, a clatter
    const f = seg(ct, 0, 0.4);
    r.position.x += 0.55 * f; r.position.z += 0.1 * f;
    r.position.y += (0.5 * 4 * f * (1 - f)) - 0.46 * easeInQuad(f);
    r.rotation.z -= 1.4 * easeOutCubic(f) * (1 - seg(ct, 0.75, 1.0));
    if (ct >= 0.4 && !o._clatter) { o._clatter = true; ctx.fx.puff(V3(0.55, 0.05, 0.1), 5, 0.3, 0.07, { color: PAL.dirt.light, up: 0.2, life: 0.4 }); ctx.fx.sparkle(V3(0.55, 0.15, 0.1), 3, 0.2, { size: 0.05, life: 0.3 }); }
    // the Gloop pops out from under him
    if (ct >= 0.45 && ct < 0.54) { const k = seg(ct, 0.45, 0.54); ctx.b.body.scale.multiplyScalar(lerp(1, 1.25, k)); ctx.showOh = true; }
    if (ct >= 0.54 && !o._pop1) { o._pop1 = true; ctx.fx.puff(V3(0, 0.3, 0), 7, 0.35, 0.1, { life: 0.5 }); ctx.fx.chunks(V3(0, 0.3, 0), 8, 0.3, MON.gloopG, { size: 0.045 }); ctx.fx.sparkle(V3(0, 0.3, 0), 4, 0.5, { size: 0.08 }); }
    if (ct >= 0.54) ctx.b.body.scale.setScalar(0.0001);
    // he sits up in the empty space, blinks, and then he pops too
    if (ct >= 0.75 && ct < 1.2) ctx.eyeScale *= 1;
    if (ct >= 1.25 && !o._pop2) { o._pop2 = true; ctx.fx.puff(V3(0.55, 0.15, 0.1), 6, 0.25, 0.08, { life: 0.45 }); ctx.fx.sparkle(V3(0.55, 0.2, 0.1), 5, 0.4, { size: 0.08 }); ctx.setVisible(false); ctx.emit('poof', o); }
    return ct >= 1.6;
  },
});

species('glimmergloop', {
  name: 'Glimmergloop', family: 'gloop', death: 'unwind', color: MON.glimmer, brows: false,
  // restraint: slits and a flat line — busy, not unkind. It still squeezes shut, goes dizzy, and smiles when it joins.
  face: {
    wild: { mouth: 'line', glance: 0 }, windup: { mouth: 'line' }, strike: { mouth: 'oh' }, recover: { mouth: 'line' },
    taunt: { eyes: ['happy', 'open'], mouth: 'line' }, castIn: { mouth: 'line' }, castOut: { mouth: 'oh' },
    friend: { mouth: 'worry' }, surprise: { mouth: 'oh' },
  },
  toon: { edge: 0.06, soft: 0.02, mid: 0.97, midEdge: 0.04, shadeSat: 1.05 },
  build(B) {
    const S = [0.9, 0.9, 0.9], H = 0.535 * 0.9;
    const deep = C3(sc(MON.glimmerDeep, 0.72)), lit = C3(MON.glimmer), wh = C3(MON.white);
    const g = gloopBody(B, { s: S, color: MON.glimmer, face: false, gloss: false, outline: 0.018, ocolor: PAL.outline.char,
      vcol: (x, y, z, ny, tmp) => tmp.copy(deep).lerp(lit, smooth(0.1 * H, 0.62 * H, y)).lerp(wh, smooth(0.8 * H, 0.815 * H, y)) });
    // slit eyes on blink bones, a single flat mouth, a hotspot, and a glint band that sweeps
    const eyes = [];
    for (const side of [-1, 1]) {
      const Y = 0.3 * S[1], th = thetaFor(g.surf, Y, side * 0.06);
      const c = surfPoint(g.surf, Y, th, 0.004);
      const name = B.bone(side < 0 ? 'eyeL' : 'eyeR', 'body', [c.x, c.y, c.z]);
      B.meta.eyes.push(name);
      const geo = extrude(ovalShape(0.046, 0.011), 0.012, 0.004); geo.rotateZ(side * -8 * DEG);
      B.unlit(wrapOn(geo, g.surf, Y, th, 0.004), { bone: name, color: MON.pupil });
      eyes.push(name);
      B._eyeExtras(name, { pos: [c.x, c.y, c.z], side, parent: 'body', Y, th, r: 0.048, lift: 0.004 }, { surf: g.surf, brows: false });
    }
    B.faceMouths({ surf: g.surf, y: 0.19 * S[1], w: 0.08, h: 0.03, beam: 'line', kinds: ['line', 'ow', 'dizzy', 'oh', 'worry'], sizes: { line: [0.9, 0.5] }, lift: 0.004 });
    B.gloss(g.surf, 0.3, -0.72, 0.06, 0.12, { rot: 0.4 });
    B.unlit(wrapOn(discGeo(0.022, 0.05, 20, 4), g.surf, 0.14, 0.95, 0.005), { color: MON.white });
    const glint = B.bone('glint', 'body', [0, 0, 0], 0);
    const band = discGeo(0.018, 0.2, 20, 4); band.rotateZ(0.5);
    B.unlit(wrapOn(band, g.surf, 0.24, 0, 0.006), { bone: glint, color: MON.white });
    return { height: g.height, radius: g.radius };
  },
  idle(ctx, t, dt) {
    const y = hop(ctx, t, { period: 0.55, amp: 0.06 });
    tipSpring(ctx, dt, 'tip', y, 0.6);
    const k = t % 2.5, gl = ctx.b.glint;
    if (gl && k < 0.4) { gl.scale.setScalar(1); gl.rotation.y = lerp(-1.3, 1.3, easeInOutQuad(k / 0.4)); }
  },
});

species('gloopold', {
  name: 'Gloopold the Grand', family: 'gloop', toon: 'slime', color: MON.gloop, winky: true,
  // eight Gloops voting, one face: regal, one brow up, looking down its nose
  face: {
    wild: { lid: [0.52, 0.3], tilt: 6, brow: [[-0.05, 12], [0.36, -14]], look: [0, -0.3], glance: 0.35, glancePeriod: 4.8, mouth: 'smirk' },
  },
  build(B) {
    const small = 0.85;
    const spots = [[-0.5, 0, 0.14], [0, 0, 0.2], [0.5, 0, 0.14], [-0.26, 0.02, -0.28], [0.26, 0.02, -0.28], [-0.27, 0.36, -0.04], [0.27, 0.36, -0.04]];
    spots.forEach((p, i) => {
      gloopBody(B, { s: [small, small, small], at: p, prefix: `g${i}`, color: i % 2 ? MON.gloopR : MON.gloop, dotEyes: true, eyes: { r: 0.03, gap: 0.14, y: 0.3 }, oh: false,
        mouth: { w: 0.08, h: 0.025, y: 0.2, tongue: false } });
    });
    const top = [0, 0.6, 0.02], S = 1.6;
    const g = gloopBody(B, { s: [S, S, S], at: top, prefix: 'g7', color: MON.gloop, eyes: { r: 0.082, gap: 0.15, y: 0.3 }, mouth: { w: 0.19, h: 0.07, y: 0.19 } });
    // the crown, which wobbles on a lag spring
    const cy = top[1] + 0.45 * S;
    const crown = B.bone('crown', 'g7tip', [0, cy, top[2]]);
    const band = v2([[0.16, 0], [0.19, 0], [0.195, 0.1], [0.165, 0.1], [0.16, 0]]);
    B.toon(new THREE.LatheGeometry(band, 30), { m: MT([0, cy, top[2]]), bone: crown, color: MON.gold, outline: 0.012 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const cone = new THREE.ConeGeometry(0.045, 0.12, 10); cone.translate(0, 0.06, 0);
      B.toon(cone, { m: MT([Math.sin(a) * 0.178, cy + 0.095, top[2] + Math.cos(a) * 0.178]), bone: crown, color: MON.gold, outline: 0.008 });
      B.toon(new THREE.SphereGeometry(0.02, 8, 6), { m: MT([Math.sin(a) * 0.178, cy + 0.225, top[2] + Math.cos(a) * 0.178]), bone: crown, color: MON.gold });
      const aj = a + TAU / 10;
      B.unlit(new THREE.SphereGeometry(0.026, 10, 8), { m: MT([Math.sin(aj) * 0.198, cy + 0.05, top[2] + Math.cos(aj) * 0.198], [0, aj, 0], [1, 1, 0.5]), bone: crown, color: MON.ruby });
    }
    return { height: cy + 0.25, radius: 0.78, shadow: 1.9 };
  },
  idle(ctx, t, dt) {
    for (let i = 0; i < 8; i++) {
      const y = hop(ctx, t, { rootName: `g${i}body`, bodyName: `g${i}body`, phase: i * 0.13, period: 1.05, amp: i === 7 ? 0.05 : 0.06 });
      tipSpring(ctx, dt, `g${i}tip`, y, 0.5);
    }
    const c = ctx.b.crown;
    if (c) { const st = ctx.springs.g7tip; c.rotation.z += -(st ? st.x : 0) * 0.6 + Math.sin(t * 2.3) * 0.04; c.rotation.x += Math.sin(t * 1.7 + 1) * 0.03; }
  },
  defeat(ctx, ct, o) {
    const order = [0, 2, 1, 3, 4, 5, 6];
    order.forEach((i, k) => {
      const t0 = k * 0.1, bn = ctx.b[`g${i}body`]; if (!bn) return;
      if (ct >= t0 && ct < t0 + 0.06) bn.scale.multiplyScalar(lerp(1, 1.25, seg(ct, t0, t0 + 0.06)));
      if (ct >= t0 + 0.06) {
        bn.scale.setScalar(0.0001);
        if (!o['_p' + i]) { o['_p' + i] = true; const p = ctx.boneRest[`g${i}body`]; const c = V3(p.x, p.y + 0.2, p.z); ctx.fx.puff(c, 4, 0.3, 0.08, { life: 0.4 }); ctx.fx.chunks(c, 4, 0.2, i % 2 ? MON.gloopR : MON.gloop, { size: 0.035 }); }
      }
    });
    const top = ctx.b.g7body, crown = ctx.b.crown;
    if (ct >= 0.72) {
      const k = easeInQuad(seg(ct, 0.72, 0.92));
      top.position.y -= 0.6 * k;
      if (crown) { crown.position.y += 0.25 * hump(ct, 0.72, 1.0); crown.rotation.z += 0.4 * hump(ct, 0.8, 1.05); }
      if (ct > 0.9 && ct < 1.0) scaleBody(ctx, 1.12, 0.88);
      if (ct >= 1.0 && ct < 1.35) { const w = hump(ct, 1.0, 1.35); top.scale.multiply(V3(1 - 0.06 * w, 1 + 0.14 * w, 1 - 0.06 * w)); ctx.eyeScale *= 1 + 0.2 * w; }
    }
    if (ct >= 1.4 && !o._poof) { o._poof = true; poof(ctx, o, { at: V3(0, 0.6, 0.02) }); }
    return ct >= 1.9;
  },
});

species('flapjack', {
  name: 'Flapjack', family: 'bat', death: 'fold', hover: 0.55, color: MON.bat, winky: true,
  // a pancake with ambition: a cheeky fanged grin with its tongue hanging out
  face: {
    wild: { lid: 0.36, tilt: 12, brow: [[0.0, 16], [0.14, 2]], look: [0, 0], glance: 0.55, glancePeriod: 2.6, mouth: 'fangTongue' },
    recover: { lid: 0.3, tilt: 10, mouth: 'fangTongue' },
    friend: { lid: 0, tilt: -4, brow: [[0.3, -10], [0.3, -10]], mouth: 'beam' },
  },
  build(B) {
    const cy = 0.2;
    B.setBone('body', [0, cy, 0]);
    const R = [0.2, 0.2 * 0.72, 0.2 * 0.9];
    B.toon(new THREE.SphereGeometry(0.2, 26, 18), { m: MT([0, cy, 0], [0, 0, 0], [1, 0.72, 0.9]), color: MON.bat, outline: 0.016,
      vcol: (x, y, z, ny, tmp) => tmp.copy(C3(sc(MON.bat, 0.85))).lerp(C3(mx(MON.bat, 'char.white', 0.12)), smooth(cy - 0.12, cy + 0.14, y)) });
    const surf = ellSurf(R[0], R[1], R[2], [0, cy, 0]);
    // pale pancake belly
    B.unlit(wrapOn(discGeo(0.085, 0.045, 20, 4), surf, cy - 0.075, 0, 0.003), { color: MON.batBelly });
    // ears: rounded cones, rotated out
    for (const side of [-1, 1]) {
      const ear = B.bone(side < 0 ? 'earL' : 'earR', 'body', [side * 0.09, cy + 0.12, -0.01]);
      const c = new THREE.ConeGeometry(0.055, 0.15, 14); c.translate(0, 0.075, 0);
      const m = MT([side * 0.09, cy + 0.1, -0.01], [0, 0, -side * 22 * DEG], [1, 1, 0.6]);
      B.toon(c, { m, bone: ear, color: MON.bat, outline: 0.012 });
      B.toon(new THREE.SphereGeometry(0.018, 8, 6), { m: m.clone().multiply(MT([0, 0.15, 0])), bone: ear, color: MON.bat });
      const inner = new THREE.ConeGeometry(0.03, 0.09, 10); inner.translate(0, 0.05, 0);
      B.toon(inner, { m: m.clone().multiply(MT([0, 0.01, 0.02], [0, 0, 0], [1, 1, 0.5])), bone: ear, color: MON.batBelly });
    }
    B.eyes({ surf, y: cy + 0.045, gap: 0.105, r: 0.062, forward: 0.004, browLift: 1.3, browColor: mx(sc(MON.bat, 0.4), PAL.outline.char, 0.5) });
    B.faceMouths({ surf, y: cy - 0.035, w: 0.1, h: 0.034, kinds: ['beam', 'fangTongue', 'fang', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'oh'], sizes: { fangTongue: [1.15, 1.1] } });
    // wings: a scallop of three arcs, hinged at the shoulder
    for (const side of [-1, 1]) {
      const name = B.bone(side < 0 ? 'wingL' : 'wingR', 'body', [side * 0.16, cy + 0.03, -0.03]);
      const wg = extrude(scallopWing(0.3, 0.22, 3), 0.015, 0.005);
      const m = MT([side * 0.15, cy + 0.02, -0.03], [0, side < 0 ? Math.PI : 0, 0.12]);
      B.toon(wg, { m, bone: name, color: MON.batWing, outline: 0.01 });
    }
    // dangling feet
    const feet = B.bone('feet', 'body', [0, cy - 0.13, 0.02]);
    for (const side of [-1, 1]) B.toon(new THREE.SphereGeometry(0.03, 10, 8), { m: MT([side * 0.05, cy - 0.155, 0.03]), bone: feet, color: sc(MON.bat, 0.8), outline: 0.008 });
    B.gloss(surf, cy + 0.1, -0.7, 0.05, 0.035, { rot: 0.9 });
    return { height: cy + 0.25, radius: 0.46, shadow: 0.55 };
  },
  idle(ctx, t) {
    hover(ctx, t, 0.55, 0.06, 0.9);
    const f = 4.2 * TAU * t, w = ctx.b;
    if (w.wingL) w.wingL.rotation.z -= 34 * DEG * Math.sin(f);
    if (w.wingR) w.wingR.rotation.z += 34 * DEG * Math.sin(f + 0.08 * TAU);
    if (w.feet) w.feet.rotation.x += Math.sin(f * 0.5 - 1) * 0.25;
    if (w.earL) w.earL.rotation.z += Math.sin(f + 1) * 0.05;
    if (w.earR) w.earR.rotation.z -= Math.sin(f + 1.3) * 0.05;
    const k = t % 5;
    if (k < 0.5 && ctx.idleW > 0.5) w.body.rotation.z += TAU * easeInOutQuad(k / 0.5);
    w.body.rotation.x += Math.sin(t * 1.6) * 0.06;
  },
  attackPose(ctx, ct) {
    // Flittersmack: two quick smacks — a second dip after the first impact
    const w = ctx.b, f = 9 * TAU * ct;
    if (w.wingL) w.wingL.rotation.z -= 20 * DEG * Math.sin(f);
    if (w.wingR) w.wingR.rotation.z += 20 * DEG * Math.sin(f);
    if (ct > 0.36 && ct < 0.5) { const k = hump(ct, 0.36, 0.5); ctx.mover.position.z += 0.25 * k; ctx.mover.rotation.x += 0.3 * k; }
  },
});

species('peckish', {
  name: 'Peckish', family: 'bird', death: 'pop', color: MON.chick,
  // 40% beak and 100% certain it is enormous: a cocky squint under a determined brow
  face: {
    wild: { lid: 0.44, tilt: 16, brow: [[-0.06, 22], [-0.02, 18]], look: [0, 0.1], glance: 0.4, glancePeriod: 2.2 },
    friend: { lid: 0, tilt: -4, brow: [[0.3, -8], [0.3, -8]] },
  },
  build(B) {
    const cy = 0.215, r = 0.19;
    const surf = ellSurf(r, r, r, [0, cy, 0]);
    B.toon(new THREE.SphereGeometry(r, 26, 20), { m: MT([0, cy, 0]), color: MON.chick, outline: 0.016,
      vcol: (x, y, z, ny, tmp) => tmp.copy(C3(MON.chick)).lerp(C3(MON.chickLight), smooth(cy - 0.05, cy - r, y) * smooth(-0.05, 0.12, z)) });
    // beak: two halves on hinges, 40% of the chick
    for (const [name, sy, dy, len] of [['beakU', 0.55, 0.02, 0.2], ['beakL', 0.42, -0.017, 0.17]]) {
      const bn = B.bone(name, 'body', [0, cy - 0.02, 0.15]);
      const c = new THREE.ConeGeometry(0.08, len, 4); c.rotateY(Math.PI / 4); c.rotateX(Math.PI / 2); c.scale(1, sy, 1); c.translate(0, dy, len / 2);
      B.toon(c, { m: MT([0, cy - 0.02, 0.15]), bone: bn, color: name === 'beakU' ? MON.beak : sc(MON.beak, 0.88), outline: 0.01 });
    }
    B.eyes({ surf, y: cy + 0.065, gap: 0.12, r: 0.052, forward: 0.003, browLift: 1.35, browColor: mx(MON.beak, PAL.outline.char, 0.55) });
    for (const side of [-1, 1]) { const Y = cy + 0.005, th = thetaFor(surf, Y, side * 0.12); B.unlit(wrapOn(discGeo(0.028, 0.016, 20, 4), surf, Y, th, 0.003), { color: MON.blush }); }
    // wings
    for (const side of [-1, 1]) {
      const name = B.bone(side < 0 ? 'wingL' : 'wingR', 'body', [side * 0.17, cy + 0.05, -0.01]);
      B.toon(new THREE.SphereGeometry(0.08, 14, 10), { m: MT([side * 0.18, cy - 0.01, -0.01], [0, 0, side * 0.35], [0.35, 0.9, 1]), bone: name, color: sc(MON.chick, 0.95), outline: 0.01 });
    }
    // a curl of head fluff
    const tuft = B.bone('tuft', 'body', [0, cy + r, 0.0]);
    B.toon(new THREE.TorusGeometry(0.028, 0.011, 8, 16, Math.PI * 1.4), { m: MT([0, cy + r + 0.022, -0.005], [0, Math.PI / 2, 0.6]), bone: tuft, color: MON.chick, outline: 0.006 });
    // feet: legs + three toes
    for (const side of [-1, 1]) {
      B.toon(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 6), { m: MT([side * 0.06, 0.045, 0.02]), bone: 'root', color: MON.beak });
      for (const a of [-0.5, 0, 0.5]) { const toe = new THREE.CylinderGeometry(0.01, 0.012, 0.05, 6); toe.rotateX(Math.PI / 2); toe.translate(0, 0, 0.022); B.toon(toe, { m: MT([side * 0.06, 0.012, 0.02], [0, a, 0]), bone: 'root', color: MON.beak }); }
    }
    B.gloss(surf, cy + 0.1, -0.75, 0.045, 0.06, { rot: 0.5 });
    return { height: cy + r + 0.04, radius: 0.21, shadow: 0.42 };
  },
  idle(ctx, t) {
    const P = 0.9, y = hop(ctx, t, { period: P, amp: 0.14 });
    const since = (t % P);
    const tip = Math.exp(-since * 9) * (since < 0.5 ? 1 : 0);
    ctx.b.body.rotation.x += 12 * DEG * tip * ctx.idleW * Math.sin(Math.min(1, since / 0.12) * Math.PI / 2);
    const flap = hump(since, 0.08, 0.4) * ctx.idleW;
    if (ctx.b.wingL) ctx.b.wingL.rotation.z -= 0.7 * flap * Math.abs(Math.sin(since * 30));
    if (ctx.b.wingR) ctx.b.wingR.rotation.z += 0.7 * flap * Math.abs(Math.sin(since * 30));
    if (ctx.b.tuft) ctx.b.tuft.rotation.z += Math.sin(t * 7) * 0.15 + y * 2;
    ctx.showOh = false;
  },
  attackPose(ctx, ct) {
    const open = ct < 0.25 ? 18 * DEG * seg(ct, 0.05, 0.2) : ct < 0.3 ? 0 : 0;
    if (ctx.b.beakU) ctx.b.beakU.rotation.x -= open / 2 + 0.25 * seg(ct, 0.05, 0.2) * (ct < 0.25 ? 1 : 0);
    if (ctx.b.beakL) ctx.b.beakL.rotation.x += open / 2 + 0.2 * seg(ct, 0.05, 0.2) * (ct < 0.25 ? 1 : 0);
    ctx.b.body.rotation.x += 0.35 * hump(ct, 0.14, 0.4);
  },
  hurtPose(ctx, ct) { if (ctx.b.beakU) ctx.b.beakU.rotation.x -= 0.3 * hump(ct, 0, 0.3); if (ctx.b.beakL) ctx.b.beakL.rotation.x += 0.3 * hump(ct, 0, 0.3); },
  castPose(ctx, ct) { if (ctx.b.beakU) ctx.b.beakU.rotation.x -= 0.25 * hump(ct, 0.2, 0.8); },
  post(ctx, t, dt, clip) {
    if (clip === 'defeat' && ctx._feather !== true && !ctx.visible) {
      ctx._feather = true;
      ctx.fx.spawn('blob', { pos: ctx.center().add(V3(0, 0.1, 0)), vel: V3(0.2, 0.9, 0.2), grav: 0.9, drag: 1.6, life: 2.2, s0: 0.05, s1: 0.05, color: MON.chick, flat: 0.12, sx: 1.8, sz: 0.8, sway: 0.9, spin: 1.5, floor: 0.02 });
    }
    if (clip !== 'defeat' && clip !== 'dead') ctx._feather = false;
  },
});

species('grumpleroot', {
  name: 'Grumpleroot', family: 'plant', death: 'topple', say: '…typical.', color: MON.root,
  // a vegetable with a grievance: a scowl that deepens; befriended, the grievance lifts (a little)
  face: {
    wild: { lid: 0.46, tilt: 16, brow: [[-0.08, 26], [-0.08, 26]], look: [0, -0.1], glance: 0.25, glancePeriod: 5, mouth: 'frown' },
    recover: { lid: 0.46, tilt: 16, brow: [[-0.08, 26], [-0.08, 26]], mouth: 'frown' },
    taunt: { lid: 0.58, tilt: 22, brow: [[-0.18, 34], [-0.18, 34]], look: [0, 0], mouth: 'grimace' },
    friend: { lid: 0.3, tilt: 4, brow: [[0.06, 6], [0.1, 2]], mouth: 'worry' },
  },
  build(B) {
    const lift = 0.07;
    const prof = smoothProfile([[0, 0], [0.12, 0.012], [0.22, 0.06], [0.245, 0.18], [0.21, 0.29], [0.15, 0.36], [0.06, 0.42], [0, 0.44]], 26);
    const purple = C3(MON.rootPurple), cream = C3(MON.root);
    B.toon(lathe(prof, 26), { m: MT([0, lift, 0]), color: MON.root, outline: 0.016, vcol: (x, y, z, ny, tmp) => tmp.copy(purple).lerp(cream, smooth(lift + 0.1, lift + 0.2, y)) });
    // a wisp of root tail and two stubby root legs
    B.toon(new THREE.ConeGeometry(0.025, 0.07, 8).rotateX(Math.PI), { m: MT([0.02, lift - 0.01, -0.03], [0.3, 0, 0.3]), color: MON.rootPurple });
    for (const side of [-1, 1]) {
      const leg = B.bone(side < 0 ? 'legL' : 'legR', 'root', [side * 0.08, 0.08, 0]);
      B.toon(new THREE.CapsuleGeometry(0.035, 0.05, 4, 10), { m: MT([side * 0.085, 0.05, 0.01], [0, 0, side * 0.18]), bone: leg, color: mx(MON.rootPurple, MON.root, 0.3), outline: 0.01 });
    }
    const surf = latheSurf(prof, { y: lift });
    // leaves: three lozenges splayed from the crown, pre-curved
    const crownY = lift + 0.42;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.35;
      const leaf = B.bone('leaf' + i, 'body', [0, crownY, 0]);
      const lg = extrude(petalShape(0.26, 0.1, 0.3), 0.012, 0.004);
      const p = lg.attributes.position; for (let k = 0; k < p.count; k++) { const yy = p.getY(k); p.setZ(k, p.getZ(k) - 0.9 * yy * yy); } lg.computeVertexNormals();
      B.toon(lg, { m: MT([0, crownY - 0.02, 0], [30 * DEG, a, 0]), bone: leaf, color: MON.leaf, outline: 0.01,
        vcol: (x, y, z, ny, tmp) => tmp.copy(C3(PAL.foliage.mid)).lerp(C3(MON.leaf), smooth(crownY, crownY + 0.15, y)) });
    }
    B.eyes({ surf, y: lift + 0.25, gap: 0.125, r: 0.056, forward: 0.003, browLift: 1.5, browLen: 1.55, browColor: MON.eyebrow });
    B.faceMouths({ surf, y: lift + 0.15, w: 0.12, h: 0.04, beam: 'frown', kinds: ['frown', 'beam', 'grimace', 'shout', 'ow', 'dizzy', 'worry', 'oh', 'tongue'] });
    B.gloss(surf, lift + 0.3, -0.8, 0.04, 0.08, { dot: false });
    return { height: crownY + 0.2, radius: 0.25, shadow: 0.5 };
  },
  idle(ctx, t) {
    const w = ctx.idleW;
    const br = 0.5 + 0.5 * Math.sin(TAU * t / 2.6);
    ctx.b.root.position.y -= 0.04 * br * w * 0.6;
    ctx.b.body.scale.multiply(V3(1 + 0.02 * br * w, 1 - 0.015 * br * w, 1 + 0.02 * br * w));
    for (let i = 0; i < 3; i++) { const l = ctx.b['leaf' + i]; if (l) { l.rotation.z += Math.sin(TAU * 1.6 * t + i * 2.1) * 0.08; l.rotation.x += Math.sin(TAU * 0.8 * t + i) * 0.05; } }
    // the scowl deepens over 4 s, then resets (only while it is still wild)
    const scowl = ((t % 4) / 4) * (ctx.mood === 'wild' ? 1 : 0);
    for (const n of ['eyeLBrow', 'eyeRBrow']) if (ctx.b[n]) ctx.b[n].position.y -= 0.012 * scowl * w;
    for (const n of ['eyeLBrowI', 'eyeRBrowI']) if (ctx.b[n]) ctx.b[n].position.y -= 0.01 * scowl * w;
    ctx.eyeTilt += 8 * DEG * scowl * w;
  },
  attackPose(ctx, ct) {
    // Root Wallop: the leaves whip down at the impact
    for (let i = 0; i < 3; i++) { const l = ctx.b['leaf' + i]; if (l) l.rotation.x += -0.6 * seg(ct, 0.0, 0.14) * (ct < 0.25 ? 1 : 0) + 0.9 * hump(ct, 0.22, 0.45); }
  },
});

species('toadstooligan', {
  name: 'Toadstooligan', family: 'plant', death: 'pop', color: MON.cap,
  // a hooligan in a big hat: one brow up, one down, eyes shifting with the cap, the tooth-poking grin
  face: {
    wild: { lid: 0.5, tilt: 12, brow: [[0.24, -8], [-0.06, 20]], look: [0.2, 0], glance: 0.85, glancePeriod: 2, mouth: 'fangUp' },
    recover: { lid: 0.45, tilt: 12, mouth: 'fangUp' },
    friend: { lid: 0, tilt: -4, brow: [[0.28, -8], [0.28, -8]], mouth: 'beam' },
  },
  build(B) {
    const stemP = smoothProfile([[0, 0], [0.12, 0.0], [0.132, 0.04], [0.12, 0.13], [0.102, 0.22], [0.09, 0.27], [0, 0.275]], 20);
    B.toon(lathe(stemP, 24), { color: MON.stem, outline: 0.014, vcol: (x, y, z, ny, tmp) => tmp.copy(C3(MON.stem)).multiplyScalar(lerp(0.86, 1, smooth(0.0, 0.1, y))) });
    const stem = latheSurf(stemP);
    // the cap: a closed dome on its own bone so it can look shiftily about
    const cy = 0.235;
    const cap = B.bone('cap', 'body', [0, cy + 0.02, 0]);
    const capP = smoothProfile([[0, -0.03], [0.14, -0.01], [0.245, 0.012], [0.272, 0.045], [0.26, 0.1], [0.215, 0.165], [0.13, 0.215], [0.05, 0.237], [0, 0.24]], 24);
    B.toon(lathe(capP, 30), { m: MT([0, cy, 0]), bone: cap, color: MON.cap, outline: 0.016,
      vcol: (x, y, z, ny, tmp) => ny < -0.35 ? tmp.copy(C3(MON.gill)) : tmp.copy(C3(sc(MON.cap, 0.9))).lerp(C3(mx(MON.cap, 'char.white', 0.12)), smooth(cy + 0.02, cy + 0.22, y)) });
    const cs = latheSurf(capP, { y: cy });
    [[cy + 0.17, 0.0, 0.05], [cy + 0.1, 0.95, 0.045], [cy + 0.1, -0.95, 0.042], [cy + 0.06, 2.0, 0.045], [cy + 0.07, -2.1, 0.04], [cy + 0.16, 2.9, 0.045], [cy + 0.2, -0.6, 0.03]].forEach(([Y, th, rr]) => {
      B.unlit(wrapOn(discGeo(rr, rr * 0.8, 20, 4), cs, Y, th, 0.004), { bone: cap, color: MON.cream });
    });
    B.skin = MON.stem;
    B.eyes({ surf: stem, y: 0.158, gap: 0.12, r: 0.056, forward: 0.003, browLift: 1.28, browColor: mx(MON.gill, PAL.outline.char, 0.7) });
    B.faceMouths({ surf: stem, y: 0.078, w: 0.11, h: 0.036, kinds: ['beam', 'fangUp', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'oh'] });
    // tiny arms that fold
    for (const side of [-1, 1]) {
      const arm = B.bone(side < 0 ? 'armL' : 'armR', 'body', [side * 0.115, 0.13, 0.02]);
      const c = new THREE.CapsuleGeometry(0.025, 0.08, 4, 10); c.translate(0, -0.05, 0);
      B.toon(c, { m: MT([side * 0.115, 0.13, 0.02], [-0.5, 0, side * 0.5]), bone: arm, color: MON.stem, outline: 0.008 });
    }
    B.gloss(cs, cy + 0.13, -0.6, 0.06, 0.035, { bone: cap, rot: 1.1 });
    return { height: cy + 0.25, radius: 0.27, shadow: 0.55 };
  },
  idle(ctx, t) {
    hop(ctx, t, { period: 1.1, amp: 0.055 });
    if (ctx.b.cap) ctx.b.cap.rotation.y += 10 * DEG * Math.sin(TAU * 0.5 * t);
    if (ctx.b.armL) ctx.b.armL.rotation.z -= 0.25 * ctx.idleW;
    if (ctx.b.armR) ctx.b.armR.rotation.z += 0.25 * ctx.idleW;
  },
  attackPose(ctx, ct) {
    // Cap Bonk: the cap tips forward into the hit, arms swing
    if (ctx.b.cap) ctx.b.cap.rotation.x += -0.2 * seg(ct, 0, 0.14) * (ct < 0.25 ? 1 : 0) + 0.45 * hump(ct, 0.2, 0.45);
    const sw = hump(ct, 0.1, 0.5);
    if (ctx.b.armL) ctx.b.armL.rotation.x -= 1.4 * sw;
    if (ctx.b.armR) ctx.b.armR.rotation.x -= 1.4 * sw;
  },
  castPose(ctx, ct) { if (ct > 0.3 && ct < 0.7 && !ctx._spores) { ctx._spores = true; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.fx.spawn('blob', { pos: V3(Math.sin(a) * 0.2, 0.45, Math.cos(a) * 0.2), vel: V3(Math.sin(a) * 0.4, 0.3, Math.cos(a) * 0.4 + 0.3), drag: 1.2, life: 1.2, s0: 0.02, s1: 0.03, color: MON.cream }); } } if (ct < 0.2) ctx._spores = false; },
  post(ctx, t, dt, clip) {
    if (clip === 'defeat' && !ctx.visible && !ctx._sporePoof) {
      ctx._sporePoof = true;
      for (let i = 0; i < 14; i++) { const a = ctx.rand() * TAU; ctx.fx.spawn('blob', { pos: V3(Math.sin(a) * 0.15, 0.25 + ctx.rand() * 0.2, Math.cos(a) * 0.15), vel: V3(Math.sin(a) * 0.35, 0.15 + ctx.rand() * 0.3, Math.cos(a) * 0.35), drag: 1.4, life: 1.4 + ctx.rand() * 0.5, s0: 0.018, s1: 0.03, color: i % 2 ? MON.cream : MON.cap }); }
    }
    if (clip !== 'defeat' && clip !== 'dead') ctx._sporePoof = false;
  },
});

species('bumbleblunder', {
  name: 'Bumbleblunder', family: 'bug', death: 'deflate', hover: 0.5, color: MON.beeY, transDouble: true, scale: 1.4,
  // extremely apologetic about the stinging: brows up, a sheepish wobble of a smile; it goes WIDE-eyed as it charges
  face: {
    wild: { lid: 0.24, tilt: -12, brow: [[0.26, -26], [0.26, -26]], look: [0, -0.15], glance: 0.5, glancePeriod: 2.4, mouth: 'worry' },
    windup: { lid: 0.56, tilt: 14, brow: [[-0.08, 20], [-0.08, 20]], mouth: 'grimace' },
    strike: { lid: 0, tilt: -6, brow: [[0.4, -20], [0.4, -20]], look: [0, 0], mouth: 'shout', eyeScale: 1.12 },
    recover: { lid: 0.2, tilt: -14, brow: [[0.3, -28], [0.3, -28]], mouth: 'worry' },
  },
  build(B) {
    const cy = 0.16;
    B.setBone('body', [0, cy, 0]);
    // fuzzy abdomen in real stripes (sphere slices), lying along Z behind the head
    const bands = [[0, 0.3, MON.beeY], [0.3, 0.2, MON.beeDark], [0.5, 0.18, MON.beeY], [0.68, 0.14, MON.beeDark], [0.82, 0.18, MON.beeY]];
    for (const [a, l, c] of bands) {
      const g = new THREE.SphereGeometry(0.16, 22, 6, 0, TAU, a * Math.PI, l * Math.PI); g.rotateX(-Math.PI / 2);
      B.toon(g, { m: MT([0, cy - 0.01, -0.13], [0.25, 0, 0], [1, 1, 1.18]), color: c });
    }
    B.hull(new THREE.SphereGeometry(0.16, 22, 16), { m: MT([0, cy - 0.01, -0.13], [0.25, 0, 0], [1, 1, 1.18]), th: 0.014, color: outlineOf(MON.beeDark) });
    B.toon(new THREE.ConeGeometry(0.03, 0.07, 10).rotateX(-Math.PI / 2), { m: MT([0, cy - 0.06, -0.33], [0.25, 0, 0]), color: MON.beeDark });
    // fuzz collar
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; B.toon(new THREE.SphereGeometry(0.045, 10, 8), { m: MT([Math.sin(a) * 0.1, cy + 0.02 + Math.cos(a) * 0.07, 0.0]), color: MON.fuzz }); }
    // head
    const hc = [0, cy + 0.07, 0.1], hr = 0.13;
    B.toon(new THREE.SphereGeometry(hr, 24, 18), { m: MT(hc), color: MON.beeY, outline: 0.014 });
    const hs = ellSurf(hr, hr, hr, hc);
    B.eyes({ surf: hs, y: hc[1] + 0.03, gap: 0.11, r: 0.055, forward: 0.003, browLift: 1.32, browColor: mx(MON.beeDark, PAL.outline.char, 0.3) });
    B.faceMouths({ surf: hs, y: hc[1] - 0.05, w: 0.075, h: 0.03, kinds: ['beam', 'worry', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'oh'], sizes: { worry: [1.2, 1.1] } });
    for (const side of [-1, 1]) { const Y = hc[1] - 0.025, th = thetaFor(hs, Y, side * 0.085); B.unlit(wrapOn(discGeo(0.022, 0.013, 20, 4), hs, Y, th, 0.003), { color: MON.blush }); }
    B.gloss(hs, hc[1] + 0.08, -0.7, 0.03, 0.04, { dot: false });
    // antennae that wobble with lag
    for (const side of [-1, 1]) {
      const ant = B.bone(side < 0 ? 'antL' : 'antR', 'body', [side * 0.04, hc[1] + 0.11, hc[2]]);
      const st = new THREE.CylinderGeometry(0.006, 0.006, 0.1, 6); st.translate(0, 0.05, 0);
      const m = MT([side * 0.04, hc[1] + 0.1, hc[2]], [-0.3, 0, -side * 0.35]);
      B.toon(st, { m, bone: ant, color: MON.beeDark });
      B.toon(new THREE.SphereGeometry(0.02, 10, 8), { m: m.clone().multiply(MT([0, 0.1, 0])), bone: ant, color: MON.beeDark, outline: 0.006 });
    }
    // wings: pale blur discs
    for (const side of [-1, 1]) {
      const wing = B.bone(side < 0 ? 'wingL' : 'wingR', 'body', [side * 0.05, cy + 0.12, -0.08]);
      const g = new THREE.CircleGeometry(0.13, 18); g.translate(0.12, 0, 0);
      B.trans(g, { m: MT([side * 0.05, cy + 0.13, -0.08], [-Math.PI / 2 + 0.3, side < 0 ? Math.PI : 0, side * -0.4], [1, 0.45, 1]), bone: wing, color: MON.white, alpha: 0.4 });
    }
    // little legs
    for (const [x, z] of [[-0.06, 0.02], [0.06, 0.02], [-0.07, -0.1], [0.07, -0.1]]) B.toon(new THREE.CapsuleGeometry(0.012, 0.05, 3, 6), { m: MT([x, cy - 0.14, z], [0.4, 0, 0]), color: MON.beeDark });
    return { height: cy + 0.25, radius: 0.24, shadow: 0.5 };
  },
  idle(ctx, t) {
    const y = 0.5 + 0.05 * Math.sin(TAU * t / 0.7) + 0.02 * Math.sin(TAU * t / 0.23);
    ctx.b.root.position.y += y; ctx.hopY = y; ctx.flying = true;
    ctx.b.root.position.x += 0.08 * Math.sin(TAU * t / 3.1) * ctx.idleW;
    ctx.b.body.rotation.z += Math.sin(TAU * t / 1.3) * 0.08;
    const f = 18 * TAU * t;
    if (ctx.b.wingL) ctx.b.wingL.rotation.x += 0.5 * Math.sin(f);
    if (ctx.b.wingR) ctx.b.wingR.rotation.x += 0.5 * Math.sin(f + 0.6);
    if (ctx.b.antL) ctx.b.antL.rotation.z += Math.sin(t * 6 - 0.4) * 0.12;
    if (ctx.b.antR) ctx.b.antR.rotation.z += Math.sin(t * 6 - 0.9) * 0.12;
  },
  post(ctx, t, dt, clip) {
    if (clip === 'defeat' && !ctx.visible && !ctx._comb) { ctx._comb = true; ctx.fx.spawn('blob', { pos: ctx.center(), vel: V3(0.3, 1.2, 0.4), grav: 6, life: 1.4, s0: 0.05, s1: 0.05, color: MON.beeY, flat: 0.45, floor: 0.02, spin: 3 }); }
    if (clip !== 'defeat' && clip !== 'dead') ctx._comb = false;
  },
});

species('boohoo', {
  name: 'Boohoo', family: 'ghost', death: 'wisp', hover: 0.35, color: MON.ghost, ghostGlow: MON.ghost, transShadow: false,
  // a ghost, drawn properly: ONE clean translucent layer (a depth pre-pass, so no sorting band through the body), a soft
  // outline of its own, a deep wavy hem, tapered sleeves — and a face that is sad about being a ghost
  ghost: true, brows: true, ghostOpacity: (t) => 0.86 + 0.08 * (0.5 + 0.5 * Math.sin(TAU * t / 2.8)),
  face: {
    wild: { lid: 0, tilt: 0, brow: [[0.16, -26], [0.1, -20]], look: [0.05, -0.1], glance: 0.4, glancePeriod: 3.2, mouth: 'oh' },
    windup: { lid: 0, brow: [[-0.06, 16], [-0.06, 16]], mouth: 'shout' },
    strike: { lid: 0, brow: [[-0.12, 20], [-0.12, 20]], mouth: 'shout' },
    recover: { lid: 0, brow: [[0.18, -26], [0.14, -22]], mouth: 'oh' },
    hurt: { eyes: 'shut', brow: [[0.22, -30], [0.22, -30]], mouth: 'ow' },
    stunned: { lid: 0, brow: [[0.26, -26], [0.26, -26]], mouth: 'oh' },
    taunt: { eyes: 'shut', brow: [[0.24, -30], [0.24, -30]], mouth: 'ow' },            // it cries at you. that is the taunt
    castIn: { eyes: 'shut', brow: [[0.1, -14], [0.1, -14]], mouth: 'worry' },
    castOut: { lid: 0, brow: [[0.2, -8], [0.2, -8]], mouth: 'shout' },
    defeat: { eyes: 'happy', brow: [[0.2, -18], [0.2, -18]], mouth: 'worry' },          // relieved, not frightened
    dizzy: { eyes: 'happy', brow: [[0.2, -18], [0.2, -18]], mouth: 'worry' },
    friend: { lid: 0, tilt: -4, brow: [[0.24, -12], [0.24, -12]], look: [0, 0.05], mouth: 'worry' },
  },
  build(B) {
    const prof = smoothProfile([[0.19, 0], [0.252, 0.035], [0.238, 0.16], [0.224, 0.36], [0.2, 0.5], [0.13, 0.605], [0, 0.635]], 30);
    const geo = lathe(prof, 44);
    const p = geo.attributes.position;
    // the hem: five deep rounded lobes, points hanging down — a sheet, not a bucket
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(x, z);
      const k = 1 - smooth(0.0, 0.26, y), lobe = Math.pow(Math.abs(Math.cos(2.5 * th)), 0.7) * Math.sign(Math.cos(2.5 * th));
      const f = 1 + 0.2 * k * Math.max(0, lobe) - 0.05 * k * Math.max(0, -lobe);
      p.setXYZ(i, x * f, y + k * (0.075 * lobe - 0.02), z * f);
    }
    geo.computeVertexNormals();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; B.bone('hem' + i, 'body', [Math.sin(a) * 0.23, 0.02, Math.cos(a) * 0.23]); }
    const hemWeights = (x, y, z) => {
      const f = 1 - smooth(0.0, 0.3, y); if (f <= 0) return [['body', 1]];
      let a = Math.atan2(x, z) / TAU * 10; a = (a % 10 + 10) % 10; const i0 = Math.floor(a) % 10, i1 = (i0 + 1) % 10, u = a - Math.floor(a);
      return [['body', 1 - f], ['hem' + i0, f * (1 - u)], ['hem' + i1, f * u]];
    };
    const vcol = (x, y, z, ny, tmp) => tmp.copy(C3(mx(MON.ghost, 'hill.farLow', 0.3))).lerp(C3(MON.white), smooth(0.02, 0.5, y));
    B.trans(geo, { color: MON.ghost, alpha: 1, weights: hemWeights, vcol });
    B.hull(geo, { th: 0.016, color: mx(sc(MON.ghost, 0.6), PAL.outline.char, 0.35), weights: hemWeights });
    const surf = latheSurf(prof);
    // eyes are holes with a pale light adrift inside each; the face layer adds the brows and the > < / ^ ^ decals
    for (const side of [-1, 1]) {
      const Y = 0.43, th = thetaFor(surf, Y, side * 0.082), c = surfPoint(surf, Y, th, 0.004);
      const name = B.bone(side < 0 ? 'eyeL' : 'eyeR', 'body', [c.x, c.y, c.z]);
      B.meta.eyes.push(name);
      B.unlit(wrapOn(discGeo(0.056, 0.07, 22, 5), surf, Y, th, 0.006), { bone: name, color: MON.ghostEye });
      const iris = B.bone(side < 0 ? 'irisL' : 'irisR', name, [c.x, c.y, c.z + 0.01]);
      const ig = discGeo(0.021, 0.024, 14, 3);
      B.unlit(wrapOn(ig, surf, Y + 0.006, th + side * -0.03, 0.009), { bone: iris, color: MON.ghostIris });
      B.unlit(wrapOn(discGeo(0.008, 0.009, 10, 2), surf, Y + 0.026, th + side * -0.07, 0.011), { bone: iris, color: MON.white });
      B._eyeExtras(name, { pos: [c.x, c.y, c.z], side, parent: 'body', Y, th, x: side * 0.082, r: 0.062, lift: 0.006 },
        { surf, brows: true, browColor: mx(MON.ghostEye, MON.ghost, 0.25), browLift: 1.15, browLen: 1.15, decalColor: MON.ghostEye });
    }
    B.faceMouths({ surf, y: 0.3, w: 0.09, h: 0.055, beam: 'oh', kinds: ['oh', 'ow', 'worry', 'shout', 'dizzy', 'beam'], lift: 0.006,
      colors: { in: MON.ghostEye, line: MON.ghostEye, tongue: mx(MON.ghostIris, 'flower.pink', 0.35), tooth: MON.white, inkSoft: MON.ghostEye },
      sizes: { oh: [0.85, 1.5], shout: [0.9, 0.8], worry: [1.1, 1.1] } });
    // sleeves: tapered, with a soft mitten tip — not stub capsules
    for (const side of [-1, 1]) {
      const arm = B.bone(side < 0 ? 'armL' : 'armR', 'body', [side * 0.19, 0.4, 0.02]);
      const pts = [[side * 0.2, 0.42, 0.02], [side * 0.255, 0.35, 0.05], [side * 0.285, 0.27, 0.07], [side * 0.28, 0.21, 0.08]];
      B.trans(taperTube(pts, taper([[0, 0.055], [0.45, 0.045], [0.8, 0.036], [1, 0.012]]), 10, 16), { bone: arm, color: MON.ghost, alpha: 1, vcol });
      B.trans(new THREE.SphereGeometry(0.036, 12, 10), { m: MT([side * 0.281, 0.213, 0.08]), bone: arm, color: MON.ghost, alpha: 1, vcol });
    }
    return { height: 0.64, radius: 0.28, shadow: 0.44 };
  },
  idle(ctx, t) {
    hover(ctx, t, 0.35, 0.07, 2.2);
    for (let i = 0; i < 10; i++) { const h = ctx.b['hem' + i]; if (!h) continue; const ph = TAU * 0.8 * t - i * TAU / 5; h.position.y += 0.03 * Math.sin(ph); const a = i / 10 * TAU; h.position.x += Math.sin(a) * 0.014 * Math.cos(ph); h.position.z += Math.cos(a) * 0.014 * Math.cos(ph); }
    const lag = Math.sin(TAU * (t - 0.2) / 2.2);
    if (ctx.b.armL) ctx.b.armL.rotation.z -= 0.18 * lag + 0.12;
    if (ctx.b.armR) ctx.b.armR.rotation.z += 0.18 * lag + 0.12;
    for (const n of ['irisL', 'irisR']) { const b = ctx.b[n]; if (b) { b.position.x += 0.008 * Math.sin(t * 0.9 + (n === 'irisL' ? 0 : 1)); b.position.y += 0.006 * Math.sin(t * 1.3); } }
    ctx._tear = (ctx._tear || 0) + (ctx.dt || 0);
    if (ctx._tear > 6 && ctx.idleW > 0.5) {
      ctx._tear = 0;
      const e = ctx.boneRest.eyeR;
      ctx.fx.spawn('blob', { pos: V3(e.x + 0.02, e.y - 0.05 + ctx.b.root.position.y, e.z + 0.02), vel: V3(0.05, -0.1, 0.05), grav: 2.2, life: 1.1, s0: 0.018, s1: 0.016, color: MON.ghostIris, flat: 1.4, floor: 0.01 });
    }
  },
  attackPose(ctx, ct) { const k = hump(ct, 0.1, 0.45); if (ctx.b.armL) ctx.b.armL.rotation.x -= 1.4 * k; if (ctx.b.armR) ctx.b.armR.rotation.x -= 1.4 * k; },
  castPose(ctx, ct) { const k = hump(ct, 0.15, 0.85); if (ctx.b.armL) ctx.b.armL.rotation.z -= 1.2 * k; if (ctx.b.armR) ctx.b.armR.rotation.z += 1.2 * k; },
  taunt(ctx, ct) {
    // it sobs: a shudder, a wipe of a sleeve, two tears
    ctx.faceKey = 'taunt';
    const sh = hump(ct, 0.05, 0.95);
    ctx.mover.rotation.z += Math.sin(ct * 26) * 4 * DEG * sh;
    ctx.b.root.position.y -= 0.05 * sh;
    if (ctx.b.armL) ctx.b.armL.rotation.x -= 1.1 * hump(ct, 0.15, 0.6);
    if (ct > 0.2 && !ctx._sob) {
      ctx._sob = true;
      for (const sx of [-1, 1]) ctx.fx.spawn('blob', { pos: ctx.center().add(V3(sx * 0.08, 0.06, 0.2)), vel: V3(sx * 0.25, 0.3, 0.35), grav: 2.4, life: 1.0, s0: 0.022, s1: 0.018, color: MON.ghostIris, flat: 1.4, floor: 0.01, delay: sx > 0 ? 0.12 : 0 });
    }
    if (ct < 0.1) ctx._sob = false;
    return ct >= 1.05;
  },
});

species('chestnut', {
  name: 'Chestnut', family: 'mimic', death: 'snap', coins: true, winky: true, color: MON.wood,
  // nuts, and knows it: shifty wooden lids over eyes that dart, a wink for the reveal
  face: {
    wild: { lid: 0.52, tilt: 16, brow: [[0.02, 20], [0.24, -6]], look: [0, -0.1], glance: 0.8, glancePeriod: 1.8 },
    taunt: { eyes: ['open', 'happy'], lid: [0, 1], tilt: 0, brow: [[0.34, -10], [0.1, 6]], look: [0, 0], eyeScale: 1.12 },
  },
  build(B) {
    const W = 0.46, H = 0.28, D = 0.34;
    const wood = C3(MON.wood), woodD = C3(MON.woodDark);
    const planks = (x, y, z, ny, tmp) => { const band = Math.abs(((y * 22) % 1 + 1) % 1 - 0.5); return tmp.copy(wood).lerp(woodD, (1 - smooth(0.0, 0.07, band)) * 0.55); };
    B.toon(roundBox(W, H, D, 0.03), { m: MT([0, H / 2, 0]), color: MON.wood, outline: 0.014, vcol: planks });
    // iron straps and the rim band
    for (const x of [-0.15, 0.15]) B.toon(new THREE.BoxGeometry(0.05, H + 0.01, D + 0.014), { m: MT([x, H / 2, 0]), color: MON.iron });
    B.toon(new THREE.BoxGeometry(W + 0.014, 0.035, D + 0.014), { m: MT([0, H - 0.02, 0]), color: MON.iron });
    for (const x of [-0.2, 0.2]) B.toon(new THREE.SphereGeometry(0.018, 8, 6), { m: MT([x, 0.03, D / 2 + 0.005]), color: MON.gold });
    // mouth interior + four lower teeth
    B.toon(new THREE.BoxGeometry(W - 0.04, 0.012, D - 0.04), { m: MT([0, H + 0.003, 0]), color: MON.mouthIn });
    for (const x of [-0.15, -0.05, 0.05, 0.15]) B.toon(new THREE.ConeGeometry(0.026, 0.065, 8), { m: MT([x, H + 0.035, D / 2 - 0.035]), color: MON.tooth, outline: 0.005 });
    // tongue
    const tongue = B.bone('tongue', 'body', [0, H + 0.01, -0.02]);
    const tg = new THREE.CapsuleGeometry(0.06, 0.2, 4, 12); tg.rotateX(Math.PI / 2); tg.scale(1, 0.35, 1.0); tg.translate(0, 0, 0.12);
    B.toon(tg, { m: MT([0, H + 0.02, -0.03]), bone: tongue, color: MON.tongue, outline: 0.006 });
    // lock plate with a keyhole
    const lock = new THREE.Shape(); lock.moveTo(-0.045, -0.05); lock.lineTo(0.045, -0.05); lock.lineTo(0.045, 0.04); lock.quadraticCurveTo(0, 0.07, -0.045, 0.04); lock.lineTo(-0.045, -0.05);
    const hole = new THREE.Path(); hole.absarc(0, 0.012, 0.014, 0, TAU, false); lock.holes.push(hole);
    const hole2 = new THREE.Path(); hole2.moveTo(-0.008, 0.004); hole2.lineTo(0.008, 0.004); hole2.lineTo(0.012, -0.03); hole2.lineTo(-0.012, -0.03); hole2.lineTo(-0.008, 0.004); lock.holes.push(hole2);
    B.toon(extrude(lock, 0.014, 0.004), { m: MT([0, H - 0.055, D / 2 + 0.01]), color: MON.gold, outline: 0.005 });
    // lid: a half-cylinder hinged at the back edge; eyes ride on it
    const lid = B.bone('lid', 'body', [0, H, -D / 2]);
    const lg = new THREE.CylinderGeometry(D / 2, D / 2, W, 20, 1, false, 0, Math.PI); lg.rotateZ(Math.PI / 2);
    B.toon(lg, { m: MT([0, H, 0]), bone: lid, color: MON.wood, outline: 0.014, vcol: (x, y, z, ny, tmp) => ny < -0.5 ? tmp.copy(C3(MON.mouthIn)) : planks(x, z * 0.8 + 0.3, z, ny, tmp) });
    for (const x of [-0.15, 0.15]) { const band = new THREE.CylinderGeometry(D / 2 + 0.007, D / 2 + 0.007, 0.05, 20, 1, true, 0, Math.PI); band.rotateZ(Math.PI / 2); B.toon(band, { m: MT([x, H, 0]), bone: lid, color: MON.iron }); }
    for (const x of [-0.1, 0.0, 0.1]) { const c = new THREE.ConeGeometry(0.026, 0.065, 8); c.rotateZ(Math.PI); B.toon(c, { m: MT([x + 0.05 * (x === 0 ? -1 : 0), H - 0.03, D / 2 - 0.035]), bone: lid, color: MON.tooth, outline: 0.005 }); }
    B.toon(new THREE.ConeGeometry(0.026, 0.065, 8).rotateZ(Math.PI), { m: MT([0.2, H - 0.03, D / 2 - 0.035]), bone: lid, color: MON.tooth, outline: 0.005 });
    const ang = 50 * DEG, ey = H + Math.sin(ang) * (D / 2) + 0.01, ez = Math.cos(ang) * (D / 2) + 0.012;
    B.eyesAt([{ pos: [-0.1, ey, ez], yaw: 0, pitch: 38, side: -1 }, { pos: [0.1, ey, ez], yaw: 0, pitch: 38, side: 1 }], { r: 0.06, parent: lid, forward: 0, zScale: 0.9, browColor: MON.woodDark, browLift: 1.5 });
    return { height: H + D / 2 + 0.06, radius: 0.26, shadow: 0.62 };
  },
  idle(ctx, t) {
    const open = 22 * DEG * (0.5 + 0.5 * Math.sin(TAU * 1.1 * t)) * ctx.idleW;
    if (ctx.b.lid) ctx.b.lid.rotation.x -= open;
    if (ctx.b.tongue) { ctx.b.tongue.rotation.x += open * 0.8 - 0.05; ctx.b.tongue.rotation.y += Math.sin(t * 5) * 0.15 * ctx.idleW; }
    const clack = Math.max(0, -Math.sin(TAU * 1.1 * t));
    ctx.b.root.position.y += 0.012 * Math.pow(clack, 8) * ctx.idleW;
  },
  attackPose(ctx, ct) {
    // Chomp: gape wide, SNAP at the impact
    const gape = ct < 0.25 ? 60 * DEG * easeOutCubic(ct / 0.25) : ct < 0.3 ? 60 * DEG * (1 - seg(ct, 0.25, 0.28)) : 0;
    if (ctx.b.lid) ctx.b.lid.rotation.x -= gape;
    if (ctx.b.tongue) ctx.b.tongue.rotation.x += gape * 0.6;
  },
  taunt(ctx, ct) {
    // the reveal: slams open, tongue rolls out, then a cackling chatter
    const open = ct < 0.14 ? 70 * DEG * easeOutCubic(ct / 0.14) : lerp(70 * DEG, 20 * DEG, seg(ct, 0.4, 0.6)) + 16 * DEG * Math.sin(ct * 40) * seg(ct, 0.6, 0.62) * (1 - seg(ct, 0.9, 1.0));
    if (ctx.b.lid) ctx.b.lid.rotation.x -= open;
    if (ctx.b.tongue) { ctx.b.tongue.rotation.x += open * 0.9; ctx.b.tongue.scale.z *= 1 + 0.4 * hump(ct, 0.1, 0.6); }
    ctx.b.root.position.y += 0.05 * Math.abs(Math.sin(ct * 18)) * seg(ct, 0.55, 0.6) * (1 - seg(ct, 0.9, 1.0));
    ctx.eyeScale *= 1 + 0.2 * hump(ct, 0, 0.5);
    return ct >= 1.0;
  },
  snap(ctx, k) { if (ctx.b.lid) ctx.b.lid.rotation.set(0, 0, 0); if (ctx.b.tongue) ctx.b.tongue.scale.setScalar(k < 1 ? 1 - k : 0.0001); },
});

species('clankworthy', {
  name: 'Clankworthy', family: 'knight', death: 'crumble', noBlink: true, color: MON.steel,
  // no eyes, no mouth: the two embers in the visor do all of it — narrowed on watch, slits to strike, out when it falls
  face: {
    wild: { lid: 0.42, tilt: 0, look: [0, 0], glance: 0.3, glancePeriod: 7 },
    windup: { lid: 0.68, tilt: 0 }, strike: { lid: 0.0, eyeScale: 1.35 }, recover: { lid: 0.4 },
    hurt: { lid: 0.9, eyes: 'open', eyeScale: 0.8 }, stunned: { lid: 0.2, eyeScale: 1.1 },
    taunt: { lid: 0.55 }, castIn: { lid: 0.8 }, castOut: { lid: 0, eyeScale: 1.4 },
    dizzy: { lid: 0.75, eyes: 'open', eyeScale: 0.85 },
    surprise: { lid: 0, eyeScale: 1.3 }, happy: { lid: 0.25, eyeScale: 1.25 }, friend: { lid: 0.12, eyeScale: 1.2 },
  },
  crumbleOrder: ['helm', 'armR', 'armL', 'body', 'legL', 'legR'], rollPart: 'helm', crumbleEnd: 1.25,
  build(B) {
    const steel = MON.steel, dark = MON.steelDark, lightS = MON.steelLight;
    const shade = (lo, hi) => (x, y, z, ny, tmp) => tmp.copy(C3(dark)).lerp(C3(lightS), smooth(lo, hi, y) * 0.8 + 0.2 * smooth(-0.2, 0.9, ny));
    B.setBone('body', [0, 0.72, 0]);
    // legs (children of root) with a visible gap at every joint
    for (const side of [-1, 1]) {
      const leg = B.bone(side < 0 ? 'legL' : 'legR', 'root', [side * 0.1, 0.4, 0]);
      B.toon(roundBox(0.15, 0.09, 0.22, 0.035), { m: MT([side * 0.11, 0.045, 0.03]), bone: leg, color: dark, outline: 0.012 });
      B.toon(new THREE.CapsuleGeometry(0.072, 0.13, 4, 12), { m: MT([side * 0.1, 0.21, 0]), bone: leg, color: steel, outline: 0.012, vcol: shade(0.1, 0.35) });
      B.toon(new THREE.SphereGeometry(0.07, 14, 10), { m: MT([side * 0.1, 0.4, 0.01]), bone: leg, color: dark, outline: 0.01 });
      B.toon(new THREE.CapsuleGeometry(0.078, 0.12, 4, 12), { m: MT([side * 0.1, 0.58, 0]), bone: leg, color: steel, outline: 0.012, vcol: shade(0.48, 0.72) });
    }
    // torso: a rounded box, a chest ridge, pauldrons, a belt of plates
    B.toon(roundBox(0.36, 0.36, 0.26, 0.07), { m: MT([0, 0.91, 0]), color: steel, outline: 0.014, vcol: shade(0.74, 1.08) });
    B.toon(roundBox(0.06, 0.26, 0.05, 0.02), { m: MT([0, 0.93, 0.125]), color: lightS });
    B.toon(roundBox(0.38, 0.07, 0.28, 0.03), { m: MT([0, 0.75, 0]), color: dark, outline: 0.01 });
    for (const side of [-1, 1]) B.toon(new THREE.SphereGeometry(0.15, 18, 10, 0, TAU, 0, Math.PI * 0.5), { m: MT([side * 0.235, 1.03, 0], [0, 0, side * -0.35], [1, 0.9, 1.0]), color: steel, outline: 0.012, vcol: shade(0.98, 1.14) });
    // helm, floating 0.02 above the collar, with the only face: a visor slot and two glow dots
    const hy = 1.1;
    const helm = B.bone('helm', 'root', [0, hy, 0]);
    const hp = smoothProfile([[0, 0], [0.13, 0.012], [0.152, 0.08], [0.15, 0.15], [0.11, 0.215], [0, 0.235]], 20);
    B.toon(lathe(hp, 26), { m: MT([0, hy, 0]), bone: helm, color: steel, outline: 0.014, vcol: shade(hy, hy + 0.22) });
    const hs = latheSurf(hp, { y: hy });
    B.unlit(wrapOn(extrude(ovalShape(0.085, 0.02), 0.012, 0.004), hs, hy + 0.11, 0, 0.002), { bone: helm, color: MON.visor });
    B.toon(new THREE.TorusGeometry(0.128, 0.012, 6, 24), { m: MT([0, hy + 0.05, 0], [Math.PI / 2, 0, 0]), bone: helm, color: dark });
    const plumeC = new THREE.ConeGeometry(0.03, 0.12, 10); plumeC.translate(0, 0.06, 0);
    B.toon(plumeC, { m: MT([0, hy + 0.21, -0.02], [-0.5, 0, 0], [1, 1, 0.5]), bone: helm, color: MON.cap, outline: 0.008 });
    for (const side of [-1, 1]) {
      const p = surfPoint(hs, hy + 0.11, side * 0.3, 0.008);
      const dot = B.bone(side < 0 ? 'eyeL' : 'eyeR', helm, [p.x, p.y, p.z]);
      B.meta.eyes.push(dot);
      B.unlit(new THREE.SphereGeometry(0.021, 10, 8), { m: MT([p.x, p.y, p.z], [0, side * 0.3, 0], [1, 1, 0.7]), bone: dot, color: MON.glowDot });
      B.trans(new THREE.CircleGeometry(0.05, 16), { m: MT([p.x, p.y, p.z + 0.004], [0, side * 0.3, 0]), bone: dot, color: MON.ember, alpha: 0.35 });
      B._eyeExtras(dot, { pos: [p.x, p.y, p.z], side, parent: helm, r: 0.022, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side * 0.3, 0)) }, { brows: false, decals: false, kind: 'glow' });
    }
    // arms: shoulder -> elbow -> gauntlet, sword in the right hand (viewer's left)
    for (const side of [-1, 1]) {
      const arm = B.bone(side < 0 ? 'armR' : 'armL', 'root', [side * 0.26, 0.98, 0]);
      const fore = B.bone(side < 0 ? 'foreR' : 'foreL', arm, [side * 0.285, 0.72, 0.02]);
      B.toon(new THREE.CapsuleGeometry(0.066, 0.12, 4, 12), { m: MT([side * 0.27, 0.86, 0.0], [0, 0, side * 0.1]), bone: arm, color: steel, outline: 0.012, vcol: shade(0.76, 0.96) });
      B.toon(new THREE.SphereGeometry(0.066, 14, 10), { m: MT([side * 0.285, 0.72, 0.02]), bone: arm, color: dark, outline: 0.01 });
      B.toon(new THREE.CapsuleGeometry(0.064, 0.1, 4, 12), { m: MT([side * 0.29, 0.6, 0.06], [0.5, 0, 0]), bone: fore, color: steel, outline: 0.012 });
      B.toon(new THREE.SphereGeometry(0.075, 14, 10), { m: MT([side * 0.29, 0.49, 0.12]), bone: fore, color: dark, outline: 0.01 });
      if (side < 0) {
        const sw = new THREE.Shape(); sw.moveTo(-0.032, 0); sw.lineTo(0.032, 0); sw.lineTo(0.03, 0.54); sw.quadraticCurveTo(0, 0.62, -0.03, 0.54); sw.lineTo(-0.032, 0);
        const blade = extrude(sw, 0.014, 0.006);
        const sm = MT([side * 0.29, 0.49, 0.12], [0.55, 0, 0]);
        B.toon(blade.translate(0, 0.07, 0), { m: sm, bone: fore, color: MON.blade, outline: 0.008, vcol: (x, y, z, ny, tmp) => tmp.copy(C3(MON.blade)).lerp(C3(MON.white), 0.3 * smooth(0.4, 1.0, ny)) });
        B.toon(roundBox(0.17, 0.03, 0.05, 0.012), { m: sm.clone().multiply(MT([0, 0.07, 0])), bone: fore, color: MON.gold, outline: 0.006 });
        B.toon(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), { m: sm.clone().multiply(MT([0, 0.0, 0])), bone: fore, color: MON.wood });
        B.toon(new THREE.SphereGeometry(0.028, 10, 8), { m: sm.clone().multiply(MT([0, -0.07, 0])), bone: fore, color: MON.gold });
      }
    }
    return { height: 1.34, radius: 0.34, shadow: 0.75 };
  },
  idle(ctx, t) {
    const w = ctx.idleW, br = Math.sin(TAU * 0.25 * t);
    ctx.b.body.scale.multiply(V3(1 + 0.015 * br * w / 0.3 * 0.3, 1 + 0.008 * br * w, 1 + 0.015 * br * w));
    ctx.b.root.rotation.z += Math.sin(TAU * t / 5.5) * 0.015 * w;
    const k = t % 7;
    if (ctx.b.helm && k < 0.9) ctx.b.helm.rotation.y += 25 * DEG * hump(k, 0, 0.9) * w;
    if (ctx.b.armR) ctx.b.armR.rotation.x -= 0.05 + 0.03 * br * w;
    if (ctx.b.foreR) ctx.b.foreR.rotation.x -= 0.1;
  },
  attackPose(ctx, ct) {
    // Sword Swing: raise the blade high in the anticipation, chop through at the impact
    const up = ct < 0.2 ? easeOutCubic(ct / 0.2) : ct < 0.28 ? 1 - easeInQuad(seg(ct, 0.2, 0.28)) * 1.6 : ct < 0.5 ? -0.6 : -0.6 * (1 - seg(ct, 0.5, 0.75));
    if (ctx.b.armR) { ctx.b.armR.rotation.x -= 1.9 * up; ctx.b.armR.rotation.z -= 0.3 * Math.max(0, up); }
    if (ctx.b.foreR) ctx.b.foreR.rotation.x -= 0.6 * Math.max(0, up);
    if (ctx.b.helm) ctx.b.helm.rotation.x += 0.12 * hump(ct, 0.2, 0.5);
  },
  castPose(ctx, ct) { const k = hump(ct, 0.1, 0.9); if (ctx.b.armR) ctx.b.armR.rotation.x -= 2.6 * k; },
});

species('boulderdash', {
  name: 'Boulderdash', family: 'golem', death: 'crumble', color: MON.stone, crumbleOrder: ['armR', 'armL', 'head', 'body', 'pebbles', 'legL', 'legR', 'eyeL', 'eyeR'], crumbleEnd: 1.5,
  // enormous, slow, and hugely embarrassed about it: stone brow-slabs that tilt, and a crack of a mouth that can smile
  face: {
    wild: { lid: 0.34, tilt: 6, brow: [[0.12, -14], [0.08, -10]], look: [0, -0.15], glance: 0.25, glancePeriod: 6, mouth: 'line' },
    windup: { lid: 0.62, tilt: 22, brow: [[-0.22, 28], [-0.22, 28]], mouth: 'grimace' },
    strike: { lid: 0, tilt: 10, brow: [[-0.1, 20], [-0.1, 20]], mouth: 'grimace', eyeScale: 1.15 },
    recover: { lid: 0.3, tilt: 4, brow: [[0.14, -16], [0.1, -12]], mouth: 'line' },
    hurt: { lid: 0.85, tilt: -10, brow: [[0.2, -26], [0.2, -26]], mouth: 'ow', eyes: 'open' },
    stunned: { lid: 0.1, brow: [[0.26, -20], [0.26, -20]], mouth: 'oh' },
    taunt: { lid: 0.5, tilt: -8, brow: [[0.2, -22], [0.2, -22]], look: [0, -0.3], mouth: 'worry' },
    dizzy: { lid: 0.7, tilt: -6, brow: [[0.24, -18], [0.1, -8]], mouth: 'ow', eyes: 'open' },
    friend: { lid: 0.08, tilt: -6, brow: [[0.28, -18], [0.28, -18]], look: [0, 0], mouth: 'worry', eyeScale: 1.1 },
  },
  build(B) {
    const stone = C3(MON.stone), stoneL = C3(MON.stoneLight), moss = C3(MON.moss);
    const rock = (x, y, z, ny, tmp) => tmp.copy(stone).lerp(stoneL, smooth(-0.6, 0.6, ny) * 0.5).lerp(moss, smooth(0.55, 0.85, ny) * 0.85);
    const piece = (geo, m, bone, th = 0.028) => B.toon(geo, { m, bone, color: MON.stone, outline: th, vcol: rock });
    B.setBone('body', [0, 0.62, 0]);
    for (const side of [-1, 1]) {
      const leg = B.bone(side < 0 ? 'legL' : 'legR', 'root', [side * 0.3, 0.3, 0]);
      piece(new THREE.DodecahedronGeometry(0.26, 0), MT([side * 0.32, 0.17, 0.05], [0.3, side * 0.5, 0], [1.1, 0.72, 1.2]), leg);
      piece(new THREE.DodecahedronGeometry(0.2, 0), MT([side * 0.3, 0.44, 0], [0.5, side, 0.2], [1, 0.9, 1]), leg);
    }
    piece(new THREE.DodecahedronGeometry(0.55, 0), MT([0, 1.2, 0], [0.2, 0.3, 0.1], [1.2, 1, 0.9]), 'body', 0.035);
    piece(new THREE.IcosahedronGeometry(0.2, 0), MT([0, 0.72, 0.1], [0.4, 0, 0.2], [1.4, 0.7, 1]), 'body');
    const pebbles = B.bone('pebbles', 'root', [0, 0.62, 0]);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; piece(new THREE.IcosahedronGeometry(0.05, 0), MT([Math.sin(a) * 0.36, 0.6 + (i % 2) * 0.05, Math.cos(a) * 0.36], [a, a, 0]), pebbles, 0.012); }
    const head = B.bone('head', 'body', [0, 1.78, 0.08]);
    piece(new THREE.IcosahedronGeometry(0.28, 0), MT([0, 1.84, 0.12], [0.1, 0.4, 0], [1.15, 0.9, 1]), head, 0.028);
    // eyes: two glowstones deep in dark sockets, soft halos
    for (const side of [-1, 1]) {
      const e = B.bone(side < 0 ? 'eyeL' : 'eyeR', head, [side * 0.1, 1.86, 0.39]);
      B.meta.eyes.push(e);
      B.unlit(new THREE.CircleGeometry(0.085, 16), { m: MT([side * 0.1, 1.86, 0.382], [-0.1, side * 0.15, 0]), bone: e, color: MON.socket });
      B.unlit(new THREE.SphereGeometry(0.055, 14, 10), { m: MT([side * 0.1, 1.86, 0.39], [0, 0, 0], [1, 1, 0.55]), bone: e, color: MON.glowstone });
      B.unlit(new THREE.SphereGeometry(0.016, 8, 6), { m: MT([side * 0.1 - 0.018, 1.878, 0.42]), bone: e, color: MON.white });
      B.trans(new THREE.CircleGeometry(0.1, 18), { m: MT([side * 0.1, 1.86, 0.4], [-0.1, side * 0.15, 0]), bone: e, color: MON.glowstone, alpha: 0.28 });
      // register the glowstone with the face layer: brow SLABS of stone on the brow bones, and the > < / ^ ^ decals
      const ent = B._eyeExtras(e, { pos: [side * 0.1, 1.86, 0.39], side, parent: head, r: 0.085, q: new THREE.Quaternion(), lift: 0.012 },
        { brows: true, browShape: false, browLift: 1.5, browLen: 1.5, decalColor: MON.socket, kind: 'glow' });
      const bp = ent.browPos;
      for (const [dx, sc2] of [[-0.055, 0.9], [0.055, 0.8]]) {
        B.toon(new THREE.DodecahedronGeometry(0.075, 0), { m: MT([bp[0] + dx, bp[1] + 0.01, bp[2] - 0.03], [0.2, dx * 6, side * 0.2], [1.35 * sc2, 0.5, 0.8]), bone: ent.brow, color: MON.stone, outline: 0.02,
          weights: ent.browWeights, vcol: rock });
      }
    }
    // the mouth is a crack in the stone: flat when it is being careful, curved when it is pleased, jagged when it heaves
    const crack = B.bone('crack', head, [0, 1.73, 0.37]);
    B.unlit(extrude(ovalShape(0.09, 0.008), 0.01, 0.002), { m: MT([0, 1.72, 0.405], [-0.25, 0, 0.1]), bone: crack, color: MON.socket });
    const mouthAt = (kind, layers, rest = 0) => {
      const bn = B.bone('gmouth_' + kind, head, [0, 1.71, 0.4], rest);
      B.meta.face.mouths[kind] = bn;
      if (kind === 'line') B.meta.mouths.push(bn); else if (kind === 'oh') B.meta.ohs.push(bn);
      for (const Ly of layers) B.unlit(flatGeo(Ly.shape, 0.012), { m: MT([0, 1.71, 0.404 + Ly.layer * 0.006], [-0.25, 0, 0.1]), bone: bn, color: Ly.col });
    };
    mouthAt('line', [{ shape: ovalShape(0.095, 0.009), col: MON.socket, layer: 0 }], 1);
    mouthAt('worry', [{ shape: strokeShape(sample(13, (u) => { const x = lerp(-0.085, 0.085, u); return [x, -0.03 * (1 - (x * x) / 0.0072)]; }), 0.011), col: MON.socket, layer: 0 }]);
    mouthAt('grimace', [{ shape: strokeShape(sample(15, (u) => [lerp(-0.12, 0.12, u), 0.022 * Math.sin(u * 3 * Math.PI)]), 0.016), col: MON.socket, layer: 0 }]);
    mouthAt('ow', [{ shape: strokeShape(sample(18, (u) => [lerp(-0.075, 0.075, u), 0.022 * Math.sin(u * 1.5 * TAU)]), 0.013), col: MON.socket, layer: 0 }]);
    mouthAt('oh', [{ shape: ovalShape(0.045, 0.055), col: MON.socket, layer: 0 }]);
    for (const side of [-1, 1]) {
      const arm = B.bone(side < 0 ? 'armR' : 'armL', 'root', [side * 0.76, 1.48, 0]);
      piece(new THREE.DodecahedronGeometry(0.25, 0), MT([side * 0.74, 1.46, 0], [0.3, 0.2, side * 0.4]), arm);
      piece(new THREE.DodecahedronGeometry(0.19, 0), MT([side * 0.82, 1.12, 0.04], [0.8, 0.1, 0.3]), arm);
      piece(new THREE.DodecahedronGeometry(0.22, 0), MT([side * 0.85, 0.8, 0.08], [0.2, 0.6, 0.1]), arm);
      piece(new THREE.DodecahedronGeometry(0.28, 0), MT([side * 0.86, 0.42, 0.14], [0.4, 0.9, 0.3], [1.05, 0.95, 1.1]), arm, 0.03);
    }
    return { height: 2.1, radius: 1.08, shadow: 2.1 };
  },
  idle(ctx, t) {
    const w = ctx.idleW;
    ctx.b.root.rotation.z += 6 * DEG * Math.sin(TAU * t / 2.6) * w;
    ctx.b.root.position.x += 0.02 * Math.sin(TAU * t / 2.6) * w;
    if (ctx.b.pebbles) { ctx.b.pebbles.rotation.y += t * 1.1; ctx.b.pebbles.position.y += 0.03 * Math.sin(t * 2); }
    if (ctx.b.armR) ctx.b.armR.rotation.z -= 0.04 * Math.sin(TAU * t / 2.6 + 0.6) * w;
    if (ctx.b.armL) ctx.b.armL.rotation.z -= 0.04 * Math.sin(TAU * t / 2.6 + 0.6) * w;
    if (ctx.b.head) ctx.b.head.rotation.y += 0.08 * Math.sin(t * 0.5);
  },
  attackPose(ctx, ct) {
    const up = ct < 0.2 ? easeOutCubic(ct / 0.2) : ct < 0.28 ? 1 - 1.4 * easeInQuad(seg(ct, 0.2, 0.28)) : ct < 0.5 ? -0.4 : -0.4 * (1 - seg(ct, 0.5, 0.75));
    if (ctx.b.armR) ctx.b.armR.rotation.x -= 2.2 * up;
    if (ctx.b.armL) ctx.b.armL.rotation.x -= 2.2 * up;
    if (ctx.b.crack) ctx.b.crack.scale.y *= 1 + 3 * hump(ct, 0.15, 0.4);
  },
  taunt(ctx, ct) {
    // Sit Down Heavily
    const k = hump(ct, 0.0, 1.0);
    ctx.b.root.position.y -= 0.25 * k;
    if (ctx.b.legL) ctx.b.legL.scale.y *= 1 - 0.5 * k;
    if (ctx.b.legR) ctx.b.legR.scale.y *= 1 - 0.5 * k;
    if (ct > 0.45 && ct < 0.55 && !ctx._thud) { ctx._thud = true; ctx.fx.puff(V3(0, 0.05, 0.3), 8, 1.2, 0.14, { color: PAL.dirt.light, up: 0.2, life: 0.55 }); }
    if (ct < 0.2) ctx._thud = false;
    ctx.eyeScale *= 1 - 0.5 * hump(ct, 0.4, 0.8);
    return ct >= 1.0;
  },
});

/** The Sunspot Cub rig (Pip). k = scale; mane for the grown Sunmane. */
function catRig(B, { k = 1, mane = false, bell = true, coat = null, eye = null, whiskers = false }) {
  const K = (a) => a.map(v => v * k);
  const C = Object.assign({ body: MON.sunspot, dark: MON.sunspotDark, muzzle: MON.muzzle, nose: MON.nose, tooth: MON.tooth }, coat || {});
  const E = Object.assign({ pupilShape: 'round', pupilColor: MON.pupil, sclera: MON.white, rim: 0.09 }, eye || {});
  const orange = C.body, dark = C.dark, cream = C.muzzle;
  const th = 0.012 * Math.max(1, k * 0.85);
  const fur = (lo, hi) => (x, y, z, ny, tmp) => tmp.copy(C3(orange)).lerp(C3(cream), smooth(-0.3, -0.8, ny) * 0.9).multiplyScalar(lerp(0.94, 1.04, smooth(lo, hi, y)));
  // body along Z
  const bodyG = new THREE.CapsuleGeometry(0.085, 0.13, 6, 16); bodyG.rotateX(Math.PI / 2);
  B.setBone('body', K([0, 0.14, 0]));
  B.toon(bodyG, { m: MT(K([0, 0.14, -0.03]), [0, 0, 0], [k, k * 0.95, k]), color: orange, outline: th, vcol: fur(0.06 * k, 0.22 * k) });
  for (const [x, z, s] of [[0.06, -0.05, 1], [-0.055, -0.1, 0.8], [0.02, -0.12, 0.7], [-0.07, 0.01, 0.75]]) B.toon(new THREE.SphereGeometry(0.028, 10, 8), { m: MT(K([x, 0.2, z]), [0, 0, 0], [k * s, k * s * 0.35, k * s]), color: dark });
  // legs + paws
  for (const [x, z, n] of [[-0.052, 0.06, 'legFL'], [0.052, 0.06, 'legFR'], [-0.058, -0.12, 'legBL'], [0.058, -0.12, 'legBR']]) {
    const leg = B.bone(n, 'root', K([x, 0.11, z]));
    B.toon(new THREE.CapsuleGeometry(0.03, 0.07, 4, 10), { m: MT(K([x, 0.07, z]), [0, 0, 0], k), bone: leg, color: orange, outline: th });
    B.toon(new THREE.SphereGeometry(0.036, 12, 8), { m: MT(K([x, 0.028, z + 0.012]), [0, 0, 0], [k * 1.05, k * 0.7, k * 1.2]), bone: leg, color: cream, outline: th * 0.8 });
  }
  // tail: a four-bone chain curling up, lion's tuft at the end
  let parent = 'body';
  const tailPts = [[0, 0.15, -0.14], [0.01, 0.17, -0.2], [0.03, 0.21, -0.245], [0.055, 0.26, -0.26], [0.08, 0.3, -0.25]];
  for (let i = 0; i < 4; i++) {
    const a = tailPts[i], b = tailPts[i + 1];
    const name = B.bone('tail' + i, parent, K(a)); parent = name;
    const len = Math.hypot(b[1] - a[1], b[2] - a[2]) * k;
    const seg2 = new THREE.CapsuleGeometry((0.022 - i * 0.003) * k, len, 4, 8);
    const ang = Math.atan2(b[2] - a[2], b[1] - a[1]);
    B.toon(seg2, { m: MT(K([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]), [ang, 0, 0]), bone: name, color: orange, outline: th * 0.8 });
  }
  B.toon(new THREE.SphereGeometry(mane ? 0.034 : 0.024, 12, 10), { m: MT(K(tailPts[4]), [0, 0, 0], k), bone: 'tail3', color: mane ? MON.mane : dark, outline: th * 0.8 });
  // head
  const hc = [0, 0.255, 0.1], hr = 0.13;
  const head = B.bone('head', 'body', K([0, 0.2, 0.08]));
  // the grown Sunmane's head is framed by the mane, so it takes NO outline shell of its own (that shell read as a
  // stack of rings across its face); the kitten keeps its outline.
  B.toon(new THREE.SphereGeometry(hr, 28, 20), { m: MT(K(hc), [0, 0, 0], [k * 1.08, k * 0.95, k * 0.95]), bone: head, color: orange, outline: mane ? 0 : th * 1.1, vcol: fur(0.18 * k, 0.36 * k) });
  const hs = ellSurf(hr * k * 1.08, hr * k * 0.95, hr * k * 0.95, K(hc));
  for (const [dx, a] of [[-0.03, -0.2], [0, 0], [0.03, 0.2]]) B.unlit(wrapOn(discGeo(0.008 * k, 0.03 * k, 20, 4), hs, (hc[1] + 0.1) * k, dx * k / 0.13 + a * 0.2, 0.003 * k), { bone: head, color: dark });
  for (const side of [-1, 1]) {
    B.toon(new THREE.SphereGeometry(0.046, 14, 10), { m: MT(K([side * 0.034, 0.212, 0.205]), [0, 0, 0], [k, k * 0.82, k * 0.75]), bone: head, color: cream, outline: th * 0.6 });
    const ear = B.bone(side < 0 ? 'earL' : 'earR', head, K([side * 0.08, 0.34, 0.07]));
    // the lion's ears are small and round and tucked into the mane; the kitten's are proper tufty triangles
    const eh = mane ? 0.075 : 0.1, er = mane ? 0.062 : 0.052;
    const eg = new THREE.ConeGeometry(er, eh, 14); eg.translate(0, eh / 2, 0);
    const em = MT(K([side * 0.08, mane ? 0.315 : 0.33, mane ? 0.03 : 0.07]), [-0.1, 0, -side * (mane ? 0.5 : 0.35)], [k, k, k * (mane ? 0.75 : 0.55)]);
    B.toon(eg, { m: em, bone: ear, color: orange, outline: mane ? 0 : th * 0.8 });
    B.toon(new THREE.SphereGeometry(mane ? er * 0.85 : 0.014, 10, 8), { m: em.clone().multiply(MT([0, eh, 0], [0, 0, 0], mane ? [1, 0.7, 1] : 1)), bone: ear, color: orange, outline: mane ? 0 : 0 });
    const ei = new THREE.ConeGeometry(er * 0.55, eh * 0.62, 10); ei.translate(0, eh * 0.34, 0.012);
    B.toon(ei, { m: em, bone: ear, color: C.nose });
    // sabre teeth (the Sunmane's are 0.25 u)
    const tl = mane ? 0.25 / k : 0.05;
    const tooth = new THREE.ConeGeometry(0.012 * (mane ? 1.6 : 1), tl, 10); tooth.rotateZ(Math.PI); tooth.translate(0, -tl / 2, 0);
    B.toon(tooth, { m: MT(K([side * 0.03, 0.2, 0.225]), [0, 0, side * 0.05], k), bone: head, color: C.tooth, outline: th * 0.5 });
  }
  B.toon(new THREE.SphereGeometry(0.022, 10, 8), { m: MT(K([0, 0.245, 0.232]), [0, 0, 0], [k * 1.2, k * 0.8, k * 0.8]), bone: head, color: C.nose, outline: th * 0.5 });
  if (whiskers) for (const side of [-1, 1]) for (const [dy, a] of [[0.012, 0.1], [-0.004, -0.02], [-0.02, -0.14]]) {
    const A = K([side * 0.045, 0.225 + dy, 0.2]), M = K([side * 0.11, 0.225 + dy + a * 0.3, 0.225]), Bp = K([side * 0.165, 0.225 + dy + a * 0.9, 0.225]);
    B.unlit(taperTube([A, M, Bp], taper([[0, 0.0035 * k], [0.7, 0.0025 * k], [1, 0.001 * k]]), 5, 8), { bone: head, color: mx(C.muzzle, 'stone.mid', 0.35) });
  }
  // painted eyes on the head (the grown Sunmane's are smaller under heavy brows: a lion, not a bug-eyed kitten)
  B.eyes({ surf: hs, y: (mane ? 0.285 : 0.28) * k, gap: (mane ? 0.112 : 0.105) * k, r: (mane ? 0.038 : 0.046) * k, parent: head, forward: 0.003 * k, pupil: mane ? 0.56 : 0.52,
    lidVcol: fur(0.18 * k, 0.36 * k), browLift: mane ? 1.25 : 1.3, browLen: mane ? 1.7 : 1.25, browColor: mane ? MON.maneDeep : mx(dark, PAL.outline.char, 0.35), rim: E.rim,
    pupilShape: E.pupilShape, pupilColor: E.pupilColor, scleraColor: E.sclera });
  // the mouth lives on the muzzle, just under the nose
  const ms = ellSurf(0.085 * k, 0.04 * k, 0.04 * k, [0, 0.212 * k, 0.207 * k]);
  B.faceMouths({ surf: ms, y: 0.2 * k, w: 0.07 * k, h: 0.024 * k, parent: head, lift: 0.003 * k, beam: 'cat', kinds: ['cat', 'beam', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'oh', 'smirk'],
    sizes: { beam: [0.9, 1.2], shout: [1.1, 1.1], oh: [1.2, 1.1], grimace: [1.1, 1.1] } });
  // collar + bell
  const neck = MT(K([0, 0.205, 0.075]), [1.25, 0, 0], k);
  if (bell) B.toon(new THREE.TorusGeometry(0.075, 0.014, 8, 22), { m: neck, bone: 'body', color: MON.ribbon, outline: th * 0.6 });
  if (bell) { B.toon(new THREE.SphereGeometry(0.024, 12, 10), { m: MT(K([0, 0.155, 0.135]), [0, 0, 0], k), bone: 'body', color: MON.gold, outline: th * 0.6 }); B.unlit(new THREE.BoxGeometry(0.03 * k, 0.004 * k, 0.01 * k), { m: MT(K([0, 0.148, 0.158])), color: MON.woodDark }); }
  else if (!mane) B.toon(new THREE.TorusGeometry(0.075, 0.014, 8, 22), { m: MT(K([0, 0.205, 0.075]), [1.25, 0, 0], k), bone: 'body', color: C.dark, outline: th * 0.6 });
  if (mane) {
    const maneB = B.bone('mane', head, K(hc));
    const ring = (n, rad, len, wid, z, col, rot = 0) => {
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + rot;
        const pg = extrude(ovalShape(wid * 0.5, len * 0.55, len * 0.45), 0.03, 0.012);
        const dir = V3(Math.sin(a), Math.cos(a), 0);
        const m = MT(K([hc[0] + dir.x * rad, hc[1] + dir.y * rad * 0.95, hc[2] + z]), [0, 0, -a], k).multiply(MT([0, 0, 0], [-0.55, 0, 0]));
        B.toon(pg, { m, bone: maneB, color: col, outline: th * 0.7 });
      }
    };
    // the ruff and the backing sphere sit INSIDE the mane: no outline shells (theirs cut rings across the face)
    const ruff = new THREE.TorusGeometry(0.115, 0.065, 12, 28);
    B.toon(ruff, { m: MT(K([hc[0], hc[1] - 0.005, hc[2] - 0.05]), [0, 0, 0], [k, k * 0.95, k * 0.9]), bone: maneB, color: MON.maneDeep, outline: 0 });
    B.toon(new THREE.SphereGeometry(0.16, 18, 12), { m: MT(K([hc[0], hc[1], hc[2] - 0.08]), [0, 0, 0], [k, k * 0.95, k * 0.6]), bone: maneB, color: MON.maneDeep });
    ring(12, 0.135, 0.085, 0.085, -0.055, MON.mane);
    ring(9, 0.12, 0.06, 0.07, -0.025, MON.maneDeep, 0.35);
  }
  B.gloss(hs, 0.34 * k, -0.6, 0.03 * k, 0.02 * k, { bone: head, rot: 1.0, dot: false });
  return { height: (mane ? 0.43 : 0.4) * k, radius: (mane ? 0.2 : 0.12) * k };
}
function catIdle(ctx, t, big) {
  const w = ctx.idleW, b = ctx.b;
  const br = Math.sin(TAU * t / (big ? 2.4 : 1.6));
  b.body.scale.multiply(V3(1 + 0.02 * br, 1 + 0.03 * br, 1));
  for (let i = 0; i < 4; i++) { const tb = b['tail' + i]; if (tb) { tb.rotation.y += 0.28 * Math.sin(TAU * 0.4 * t - i * 0.7) * w; tb.rotation.x += 0.08 * Math.sin(TAU * 0.4 * t - i * 0.5 + 1); } }
  if (b.head) { b.head.rotation.z += 0.08 * Math.sin(t * 0.7) * w; b.head.rotation.x -= 0.04 * br; }
  const flick = t % 3.3;
  if (b.earL && flick < 0.25) b.earL.rotation.z += 0.4 * hump(flick, 0, 0.25);
  if (b.earR && (t + 1.4) % 4.1 < 0.25) b.earR.rotation.z -= 0.4 * hump((t + 1.4) % 4.1, 0, 0.25);
  if (b.mane) { const m = 1 + 0.03 * Math.sin(t * 1.9); b.mane.scale.multiplyScalar(m); b.mane.rotation.z += 0.03 * Math.sin(t * 1.3); }
  if (!big) { const y = hop(ctx, t, { period: 1.3, amp: 0.05, squash: 0.6 }); void y; }
}
function catAttack(ctx, ct) {
  const b = ctx.b, S = ctx.size;
  const crouch = ct < 0.14 ? easeOutCubic(ct / 0.14) : 1 - seg(ct, 0.14, 0.2);
  b.root.position.y -= 0.03 * S * crouch;
  b.root.position.y += 0.22 * S * hump(ct, 0.14, 0.33);
  for (const n of ['legFL', 'legFR']) if (b[n]) b[n].rotation.x -= 1.2 * hump(ct, 0.14, 0.4);
  for (const n of ['legBL', 'legBR']) if (b[n]) b[n].rotation.x += 0.8 * hump(ct, 0.14, 0.33);
}
function catRoar(ctx, ct) {
  const b = ctx.b, k = hump(ct, 0.05, 0.95);
  if (ct > 0.05 && ct < 0.92) ctx.faceKey = 'roar';
  if (b.head) { b.head.rotation.x -= 0.35 * k; b.head.rotation.z += 0.05 * Math.sin(ct * 50) * k; }
  if (b.mane) b.mane.scale.multiplyScalar(1 + 0.18 * k);
  for (const n of ['legFL', 'legFR']) if (b[n]) b[n].rotation.x -= 0.2 * k;
  if (ct > 0.2 && !ctx._roar) { ctx._roar = true; ctx.fx.sparkle(ctx.center().add(V3(0, ctx.height * 0.3, ctx.radius)), 6, ctx.radius * 1.2, { size: 0.08 * Math.sqrt(ctx.size), life: 0.5, speed: 2 }); }
  if (ct < 0.1) ctx._roar = false;
  return ct >= 1.0;
}
species('pip', {
  name: 'Pip', family: 'cat', death: 'pop', story: true, color: MON.sunspot,
  // a mischief of a kitten: sly half-lids, a little ω smirk under the nose
  face: {
    wild: { lid: 0.42, tilt: 10, brow: [[0.0, 14], [0.2, -6]], look: [0.1, 0], glance: 0.6, glancePeriod: 3, mouth: 'cat' },
    recover: { lid: 0.4, tilt: 10, mouth: 'cat' },
    roar: { lid: 0.2, tilt: 16, brow: [[-0.1, 22], [-0.1, 22]], look: [0, 0], mouth: 'shout' },
    friend: { lid: 0, tilt: -4, brow: [[0.28, -8], [0.28, -8]], mouth: 'beam' },
  },
  build(B) { return catRig(B, { k: 1.25, mane: false, bell: true }); },
  idle(ctx, t) { catIdle(ctx, t, false); },
  attackPose: catAttack,
  taunt: catRoar,
});
species('sunmane', {
  name: 'The Sunmane', family: 'cat', boss: true, story: true, death: 'pop', color: MON.sunspot,
  // wild and grand: a heavy-browed glare and a snarl — until it sees the ribbon, and its whole face remembers
  face: {
    wild: { lid: 0.46, tilt: 20, brow: [[-0.12, 26], [-0.12, 26]], look: [0, 0.05], glance: 0.25, glancePeriod: 4, mouth: 'grimace' },
    windup: { lid: 0.6, tilt: 24, brow: [[-0.2, 32], [-0.2, 32]], mouth: 'grimace' },
    strike: { lid: 0.2, tilt: 20, brow: [[-0.18, 30], [-0.18, 30]], mouth: 'shout' },
    recover: { lid: 0.46, tilt: 20, brow: [[-0.12, 26], [-0.12, 26]], mouth: 'grimace' },
    roar: { lid: 0.3, tilt: 22, brow: [[-0.2, 32], [-0.2, 32]], look: [0, 0], mouth: 'shout' },
    defeat: { eyes: 'happy', brow: [[0.24, -14], [0.24, -14]], mouth: 'cat' },
    dead: { lid: 0.64, tilt: -12, brow: [[0.2, -14], [0.2, -14]], mouth: 'cat' },
    friend: { lid: 0.1, tilt: -6, brow: [[0.24, -10], [0.24, -10]], mouth: 'beam' },
  },
  build(B) { const r = catRig(B, { k: 4.5, mane: true, bell: false }); return { height: r.height, radius: r.radius * 1.15, shadow: 2.2 }; },
  idle(ctx, t) { catIdle(ctx, t, true); },
  attackPose: catAttack,
  taunt: catRoar,
  // it never dies: it sees the ribbon, sits, and lies down (defeat {vanish:true} forces a poof)
  defeat(ctx, ct, o) {
    const k = easeInOutQuad(seg(ct, 0, 0.9)), b = ctx.b;
    catLie(ctx, k, ctx.t);
    if (ct > 0.9 && !o._hearts) { o._hearts = true; ctx.fx.sparkle(ctx.center().add(V3(0, ctx.height * 0.2, 0.5)), 8, ctx.radius * 1.6, { size: 0.12, life: 0.9, speed: 0.8, up: 0.8, color: MON.spark, alt: MON.blush }); }
    return ct >= 1.3;
  },
  deadPose(ctx, t) { catLie(ctx, 1, t); },
});
function catLie(ctx, k, t) {
  const b = ctx.b, S = ctx.size;
  b.root.position.y -= 0.075 * S * k;
  for (const n of ['legFL', 'legFR']) if (b[n]) { b[n].rotation.x -= 1.35 * k; b[n].position.z += 0.02 * S * k; }
  for (const n of ['legBL', 'legBR']) if (b[n]) { b[n].scale.y *= 1 - 0.6 * k; }
  if (b.head) { b.head.rotation.x += 0.28 * k; b.head.rotation.z += 0.12 * k * Math.sin(t * 0.8); b.head.position.y -= 0.02 * S * k; }
  for (let i = 0; i < 4; i++) { const tb = b['tail' + i]; if (tb) tb.rotation.y += 0.35 * k * Math.sin(t * 1.4 - i * 0.6); }
  ctx.eyeScale *= 1 - 0.8 * k;
  b.body.scale.y *= 1 + 0.02 * Math.sin(t * 1.8) * k;
}

species('bogwallop', {
  name: 'Bogwallop the Bulbous', family: 'toad', boss: true, death: 'deflate', winkAll: true, color: MON.toad, brows: false,
  // enormous and lonely: sleepy heavy lids, a lopsided grin; defeated, a sulk (and he stays to talk)
  face: {
    wild: { lid: 0.5, tilt: -6, look: [0, -0.1], glance: 0.3, glancePeriod: 5, mouth: 'smirk' },
    recover: { lid: 0.46, tilt: -6, mouth: 'smirk' },
    taunt: { lid: [0.2, 0.2], tilt: 0, look: [0, 0.2], mouth: 'oh' },
    defeat: { lid: 0.72, tilt: -18, look: [0, -0.4], mouth: 'frown' },
    burp: { lid: 0.9, tilt: -4, look: [0, 0], mouth: 'oh' },
    dead: { lid: 0.72, tilt: -18, look: [0.3, -0.4], mouth: 'frown' },
  },
  build(B) {
    const bc = [0, 0.95, 0], R = [1.61, 1.0, 1.4];
    const toad = C3(MON.toad), toadL = C3(mx(MON.toad, 'grass.light', 0.35));
    B.toon(new THREE.SphereGeometry(1, 40, 28), { m: MT(bc, [0, 0, 0], R), color: MON.toad, outline: 0.05, vcol: (x, y, z, ny, tmp) => tmp.copy(toad).lerp(toadL, smooth(0.6, 1.9, y) * 0.8) });
    const surf = ellSurf(R[0], R[1], R[2], bc);
    // belly
    B.toon(new THREE.SphereGeometry(1.4, 32, 22), { m: MT([0, 0.62, 0.52], [0, 0, 0], [0.82, 0.62, 0.62]), color: MON.toadBelly, outline: 0.03 });
    // warts on the back and shoulders
    const rw = rng(42);
    for (let i = 0; i < 24; i++) {
      const th = (rw() < 0.5 ? -1 : 1) * (0.9 + rw() * 2.2), Y = 0.95 + (rw() - 0.1) * 0.85, rr = 0.06 + rw() * 0.06;
      const p = surfPoint(surf, Y, th, -rr * 0.35);
      B.toon(new THREE.SphereGeometry(rr, 10, 8), { m: MT([p.x, p.y, p.z]), color: MON.wart });
    }
    // throat sac under the jaw
    const sac = B.bone('sac', 'body', [0, 0.52, 1.1]);
    B.toon(new THREE.SphereGeometry(0.55, 24, 16), { m: MT([0, 0.52, 1.02], [0, 0, 0], [1, 0.8, 0.75]), bone: sac, color: mx(MON.toadBelly, 'flower.pink', 0.18), outline: 0.03 });
    // the enormous grin across the whole head, with a lolling tongue
    B.faceMouths({ surf, y: 1.0, w: 1.5, h: 0.2, lift: 0.01, kinds: ['beam', 'smirk', 'frown', 'grimace', 'shout', 'ow', 'dizzy', 'oh', 'worry'],
      sizes: { oh: [0.5, 1.4], ow: [0.7, 1], worry: [0.8, 1], dizzy: [0.6, 1], grimace: [0.8, 0.8], shout: [0.8, 0.8] } });
    const tongue = B.bone('tongue', 'body', [0.42, 0.92, 1.3]);
    const tg = new THREE.CapsuleGeometry(0.07, 0.18, 4, 10); tg.translate(0, -0.12, 0);
    B.toon(tg, { m: MT([0.42, 0.93, 1.33], [0.5, 0, 0.1], [1, 1, 0.45]), bone: tongue, color: MON.tongue, outline: 0.015 });
    for (const side of [-1, 1]) { const Y = 1.12, th = thetaFor(surf, Y, side * 0.95); B.unlit(wrapOn(discGeo(0.16, 0.08, 20, 4), surf, Y, th, 0.006), { color: MON.blush }); }
    // eyes on top in raised sockets; toad pupils are bars, and they read as friendly
    const pts = [];
    for (const side of [-1, 1]) {
      const sp = surfPoint(surf, 1.72, side * 0.62, -0.12);
      B.toon(new THREE.SphereGeometry(0.34, 22, 16), { m: MT([sp.x, sp.y, sp.z]), color: MON.toad, outline: 0.04 });
      pts.push({ pos: [sp.x * 1.02, sp.y + 0.2, sp.z + 0.2], yaw: side * 0.22, pitch: 6, side });
    }
    B.eyesAt(pts, { r: 0.3, pupilShape: 'bar', outline: 0.022, pupil: 0.46, zScale: 0.85, brows: false });
    // legs: front pair, and the big folded back pair
    for (const side of [-1, 1]) {
      const fl = B.bone(side < 0 ? 'legFL' : 'legFR', 'root', [side * 0.95, 0.5, 0.85]);
      B.toon(new THREE.CapsuleGeometry(0.17, 0.36, 4, 12), { m: MT([side * 1.0, 0.36, 0.95], [0.35, 0, side * 0.35]), bone: fl, color: MON.toad, outline: 0.035 });
      B.toon(new THREE.SphereGeometry(0.22, 18, 12), { m: MT([side * 1.08, 0.07, 1.2], [0, side * 0.3, 0], [1.35, 0.35, 1.5]), bone: fl, color: MON.toad, outline: 0.03 });
      for (const a of [-0.45, 0, 0.45]) B.toon(new THREE.SphereGeometry(0.075, 10, 8), { m: MT([side * 1.08 + Math.sin(a + side * 0.3) * 0.3, 0.06, 1.2 + Math.cos(a + side * 0.3) * 0.3]), bone: fl, color: MON.toadBelly });
      const bl = B.bone(side < 0 ? 'legBL' : 'legBR', 'root', [side * 1.45, 0.45, -0.2]);
      B.toon(new THREE.SphereGeometry(0.55, 22, 16), { m: MT([side * 1.45, 0.45, -0.2], [0, side * 0.3, 0], [0.8, 0.72, 1.2]), bone: bl, color: MON.toad, outline: 0.04 });
      B.toon(new THREE.SphereGeometry(0.24, 16, 10), { m: MT([side * 1.6, 0.07, 0.42], [0, side * 0.4, 0], [1.2, 0.35, 1.6]), bone: bl, color: MON.toad, outline: 0.03 });
    }
    // crown of reeds
    const reeds = B.bone('reeds', 'body', [0, 1.9, 0.1]);
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.38, c = new THREE.ConeGeometry(0.05, 0.5 + (i % 2) * 0.15, 8); c.translate(0, 0.25, 0);
      B.toon(c, { m: MT([Math.sin(a) * 0.3, 1.85, 0.1 + Math.cos(a) * 0.05], [-0.2, 0, -a * 0.9]), bone: reeds, color: MON.reed, outline: 0.02 });
    }
    B.gloss(surf, 1.38, -1.05, 0.2, 0.1, { rot: 1.2 });
    return { height: 2.25, radius: 1.75, shadow: 3.6 };
  },
  idle(ctx, t) {
    const P = 1.7, ph = (t % P) / P, w = ctx.idleW;
    const infl = ph < 0.82 ? easeInOutQuad(ph / 0.82) : 1 - easeOutCubic((ph - 0.82) / 0.18);
    if (ctx.b.sac) ctx.b.sac.scale.multiplyScalar(0.6 + 0.65 * infl);
    ctx.b.body.scale.multiply(V3(1 + 0.015 * infl * w, 1 + 0.03 * infl * w, 1 + 0.015 * infl * w));
    if (ctx.b.tongue) { ctx.b.tongue.rotation.x += 0.15 * Math.sin(t * 1.5); ctx.b.tongue.rotation.z += 0.1 * Math.sin(t * 1.1); }
    if (ctx.b.reeds) ctx.b.reeds.rotation.z += 0.05 * Math.sin(t * 1.3);
  },
  attackPose(ctx, ct) {
    // Belly Flop: up, and DOWN
    const S = ctx.size;
    ctx.b.root.position.y += 0.9 * hump(ct, 0.1, 0.3) - 0.0;
    if (ct > 0.25 && ct < 0.4) ctx.b.body.scale.multiply(V3(1 + 0.15 * hump(ct, 0.25, 0.4), 1 - 0.2 * hump(ct, 0.25, 0.4), 1 + 0.15 * hump(ct, 0.25, 0.4)));
    if (ct > 0.25 && !ctx._flop) { ctx._flop = true; ctx.fx.puff(V3(0, 0.1, 1.2), 10, 2.2, 0.3, { color: PAL.dirt.light, up: 0.3, life: 0.6 }); }
    if (ct < 0.1) ctx._flop = false;
    ctx.showOh = ct > 0.1 && ct < 0.3;
    void S;
  },
  taunt(ctx, ct) {
    // Enormous Burp (does nothing at all)
    const k = hump(ct, 0.1, 0.9);
    if (ctx.b.sac) ctx.b.sac.scale.multiplyScalar(1 + 0.9 * hump(ct, 0.0, 0.55));
    ctx.showOh = ct > 0.5 && ct < 0.85; if (ct > 0.5 && ct < 0.9) ctx.faceKey = 'burp';
    ctx.b.body.scale.multiply(V3(1 + 0.05 * k, 1 - 0.04 * k, 1));
    if (ct > 0.55 && !ctx._burp) { ctx._burp = true; ctx.fx.puff(V3(0, 1.1, 1.6), 5, 0.6, 0.18, { up: 0.8, life: 0.7 }); }
    if (ct < 0.1) ctx._burp = false;
    return ct >= 1.1;
  },
  // he does not vanish: he deflates into a sulk and stays to talk to you ({vanish:true} forces the poof)
  defeat(ctx, ct, o) { bogSulk(ctx, easeInOutQuad(seg(ct, 0, 0.8)), ctx.t); if (ct > 0.3 && !o._sigh) { o._sigh = true; ctx.fx.puff(V3(0, 1.0, 1.7), 4, 0.4, 0.14, { up: 0.3, life: 0.8 }); } return ct >= 1.0; },
  deadPose(ctx, t) { bogSulk(ctx, 1, t); },
});
function bogSulk(ctx, k, t) {
  const b = ctx.b;
  b.body.scale.multiply(V3(1 + 0.12 * k, 1 - 0.22 * k + 0.02 * Math.sin(t * 1.2) * k, 1 + 0.08 * k));
  b.root.position.y -= 0.05 * k;
  if (b.sac) b.sac.scale.multiplyScalar(1 - 0.35 * k);
  if (b.reeds) b.reeds.rotation.z += 0.35 * k;
}

species('cactuddle', {
  name: 'Cactuddle', family: 'plant', death: 'deflate', color: MON.cactus,
  // wants a hug more than anything: hopeful brows, big soft eyes, a wobbly smile; its attack is a hug (eyes shut, beaming)
  face: {
    wild: { lid: 0.1, tilt: -14, brow: [[0.3, -28], [0.3, -28]], look: [0, 0.18], glance: 0.3, glancePeriod: 4, mouth: 'worry' },
    windup: { lid: 0.2, tilt: -10, brow: [[0.34, -24], [0.34, -24]], look: [0, 0.2], mouth: 'worry', eyeScale: 1.08 },
    strike: { eyes: 'happy', brow: [[0.3, -16], [0.3, -16]], mouth: 'beam' },
    recover: { eyes: 'shut', brow: [[0.2, -26], [0.2, -26]], mouth: 'ow' },
    taunt: { lid: 0.05, tilt: -16, brow: [[0.36, -30], [0.36, -30]], look: [0, 0.3], mouth: 'oh', eyeScale: 1.1 },
    friend: { lid: 0, tilt: -8, brow: [[0.34, -14], [0.34, -14]], look: [0, 0.1], mouth: 'beam' },
  },
  build(B) {
    const prof = smoothProfile([[0, 0], [0.22, 0.03], [0.25, 0.24], [0.24, 0.52], [0.18, 0.62], [0, 0.64]], 26);
    const rib = (geo, amp = 0.018) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z); if (r < 1e-4) continue; const th = Math.atan2(x, z), f = (r + amp * Math.sin(12 * th)) / r; p.setXYZ(i, x * f, y, z * f); } geo.computeVertexNormals(); return geo; };
    const green = C3(MON.cactus), top = C3(MON.cactusTop);
    const col = (h0) => (x, y, z, ny, tmp) => tmp.copy(green).multiplyScalar(0.92).lerp(top, smooth(h0 * 0.45, h0 * 0.95, y));
    B.toon(rib(lathe(prof, 48)), { color: MON.cactus, outline: 0.016, vcol: col(0.64) });
    const surf = latheSurf(prof);
    // arms: OPEN for a hug — out from the shoulder, then the forearm swung forward, ending in a soft round paw
    for (const side of [-1, 1]) {
      const arm = B.bone(side < 0 ? 'armL' : 'armR', 'body', [side * 0.22, 0.34, 0]);
      const segA = rib(lathe(smoothProfile([[0, 0], [0.09, 0.02], [0.1, 0.1], [0.09, 0.2], [0, 0.22]], 12), 24), 0.008);
      B.toon(segA, { m: MT([side * 0.2, 0.34, 0.02], [0, 0, -side * 1.22], [1, 0.95, 1]), bone: arm, color: MON.cactus, outline: 0.012 });
      const segB = rib(lathe(smoothProfile([[0, 0], [0.082, 0.02], [0.088, 0.1], [0.072, 0.2], [0, 0.22]], 12), 24), 0.007);
      const elbow = [side * 0.4, 0.412, 0.02];
      const rz = -side * 0.16, rx = 1.0;
      const dir = V3(0, 1, 0).applyEuler(new THREE.Euler(rx, 0, rz, 'YXZ'));
      B.toon(segB, { m: MT(elbow, [rx, 0, rz]), bone: arm, color: MON.cactusTop, outline: 0.012 });
      B.toon(new THREE.SphereGeometry(0.075, 16, 12), { m: MT([elbow[0] + dir.x * 0.21, elbow[1] + dir.y * 0.21, elbow[2] + dir.z * 0.21], [0, 0, 0], [1, 0.94, 0.94]), bone: arm, color: MON.cactusTop, outline: 0.012 });
    }
    // spines: little three-needle tufts, short and soft-tipped — not toothpicks
    const rs = rng(7);
    for (let i = 0; i < 17; i++) {
      const k = Math.floor(rs() * 12), th = (Math.PI / 2 + TAU * k) / 12, Y = 0.1 + rs() * 0.46;
      if (Math.abs(Math.sin(th)) < 0.42 && Math.cos(th) > 0 && Y > 0.2 && Y < 0.52) continue;
      const p = surfPoint(surf, Y, th, 0.012);
      for (const [ax, ay] of [[-0.5, 0.25], [0, 0.55], [0.5, 0.2]]) {
        const dir = V3(Math.sin(th) + Math.cos(th) * ax * 0.5, ay, Math.cos(th) - Math.sin(th) * ax * 0.5).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir);
        const m = new THREE.Matrix4().compose(p, q, V3(1, 1, 1));
        const c = new THREE.ConeGeometry(0.0105, 0.03, 5); c.translate(0, 0.015, 0);
        B.toon(c, { m, color: MON.spine });
        B.toon(new THREE.SphereGeometry(0.0042, 5, 4), { m: m.clone().multiply(MT([0, 0.03, 0])), color: MON.spine });
      }
    }
    // the flower: a real five-petal bloom on a short stalk, yellow-hearted — it droops when sad and lifts when happy
    const flower = B.bone('flower', 'body', [0, 0.62, 0]);
    B.toon(new THREE.CylinderGeometry(0.014, 0.018, 0.05, 8), { m: MT([0, 0.645, 0]), bone: flower, color: MON.cactusTop, outline: 0.008 });
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + 0.3;
      const pet = extrude(petalShape(0.105, 0.062, 0.45), 0.014, 0.005);
      const pp = pet.attributes.position;
      for (let v = 0; v < pp.count; v++) { const yy = pp.getY(v); pp.setZ(v, pp.getZ(v) - 0.55 * yy * yy); }   // cup the petal
      pet.computeVertexNormals();
      B.toon(pet, { m: MT([Math.sin(a) * 0.03, 0.668, Math.cos(a) * 0.03], [1.02, a, 0]), bone: flower, color: MON.flowerP, outline: 0.008,
        vcol: (x, y, z, ny, tmp) => tmp.copy(C3(sc(MON.flowerP, 0.9))).lerp(C3(mx(MON.flowerP, 'char.white', 0.3)), smooth(0.66, 0.73, y)) });
    }
    B.toon(new THREE.SphereGeometry(0.032, 14, 12), { m: MT([0, 0.686, 0], [0, 0, 0], [1, 0.72, 1]), bone: flower, color: PAL.flower.yellow, outline: 0.006 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; B.unlit(new THREE.SphereGeometry(0.006, 5, 4), { m: MT([Math.sin(a) * 0.016, 0.706, Math.cos(a) * 0.016]), bone: flower, color: mx('flower.center', 'flower.yellow', 0.3) }); }
    B.eyes({ surf, y: 0.43, gap: 0.158, r: 0.076, pupil: 0.58, forward: 0.021, browLift: 1.36, browColor: mx(sc(MON.cactus, 0.45), PAL.outline.char, 0.5) });
    B.faceMouths({ surf, y: 0.3, w: 0.1, h: 0.038, lift: 0.022, kinds: ['beam', 'worry', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'oh'], sizes: { worry: [1.25, 1.2] } });
    for (const side of [-1, 1]) { const Y = 0.33, th = thetaFor(surf, Y, side * 0.15); B.unlit(wrapOn(discGeo(0.032, 0.018, 20, 4), surf, Y, th, 0.022), { color: MON.blush }); }
    B.gloss(surf, 0.5, -0.65, 0.03, 0.09, { dot: false, lift: 0.02 });
    return { height: 0.7, radius: 0.42, shadow: 0.7 };
  },
  idle(ctx, t) {
    const w = ctx.idleW, b = ctx.b;
    b.root.rotation.z += 3 * DEG * Math.sin(TAU * t / 2.2) * w;
    if (b.armL) b.armL.rotation.z += (0.12 * Math.sin(TAU * t / 1.4) - 0.05) * w;
    if (b.armR) b.armR.rotation.z -= (0.12 * Math.sin(TAU * t / 1.4 + 0.5) - 0.05) * w;
    const k = t % 4;
    const step = hump(k, 2.6, 3.8);
    b.root.position.z += 0.12 * step * w;
    b.root.position.y += 0.03 * hump(k, 2.6, 2.95) * w + 0.03 * hump(k, 3.45, 3.8) * w;
    if (b.flower) b.flower.rotation.x += (0.15 * step - 0.05 * hump(k, 3.2, 3.9)) * w;
    ctx.eyeScale *= 1 + 0.1 * step;
    if (b.flower) b.flower.rotation.z += 0.05 * Math.sin(t * 1.7);
  },
  attackPose(ctx, ct) {
    // Cuddle: arms close round you at the impact — and it hurts it too
    const hug = hump(ct, 0.14, 0.5);
    if (ctx.b.armL) ctx.b.armL.rotation.y -= 1.0 * hug;
    if (ctx.b.armR) ctx.b.armR.rotation.y += 1.0 * hug;
    if (ct > 0.3 && ct < 0.4) ctx.flash = Math.max(ctx.flash, 0.3);
  },
  hurtPose(ctx, ct) { if (ctx.b.flower) ctx.b.flower.rotation.x -= 0.35 * hump(ct, 0, 0.42); },
  joinPose(ctx, ct) { if (ctx.b.flower) ctx.b.flower.rotation.x += 0.3 * hump(ct, 0.2, 1.35); },
  post(ctx, t, dt, clip) {
    // sad flower while defeated / deflating
    if ((clip === 'defeat' || clip === 'dead') && ctx.b.flower) ctx.b.flower.rotation.x -= 20 * DEG;
  },
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 5c. TIER TWO — the Whispering Wood, Saltmarrow Coast, Cobwell Manor (MONSTER-BIBLE §2 #12-15)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const dying = (clip) => clip === 'defeat' || clip === 'dead';
/** Options a BOSS sets before reusing a smaller monster's build (MONSTER-BIBLE §6/§6b build on the same rigs). */
let REUSE = {};

/** Skin weights along a chain of bones laid from point a (bones[0]) to point b (last bone); beyond b = last bone. */
function chainWeights(a, b, bones) {
  const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2], L2 = (ax * ax + ay * ay + az * az) || 1, n = bones.length;
  return (x, y, z) => {
    const t = clamp01(((x - a[0]) * ax + (y - a[1]) * ay + (z - a[2]) * az) / L2) * (n - 1);
    const i = Math.min(n - 2, Math.floor(t)), u = smooth(0.15, 0.85, t - i);
    return [[bones[i], 1 - u], [bones[i + 1], u]];
  };
}
/** Radially reshape a geometry laid along +Y: radius multiplied by f(y). */
function shapeAlongY(geo, f) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = f(p.getY(i)); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  return geo;
}

// ── 12. CRABBIT ───────────────────────────────────────────────────────────────────────────────────────────────
species('crabbit', {
  name: 'Crabbit', family: 'crab', color: MON.crab,
  // sidles everywhere, including towards things it is trying to leave: eyes on stalks that dart, a crooked grin
  face: {
    wild: { lid: 0.36, tilt: 12, brow: [[0.02, 14], [0.18, -4]], look: [0, 0], glance: 0.85, glancePeriod: 1.5, mouth: 'smirk' },
    recover: { lid: 0.34, tilt: 12, mouth: 'smirk' },
    taunt: { lid: 0.25, tilt: -6, brow: [[0.24, -18], [0.24, -18]], look: [0.6, 0], glance: 0.9, glancePeriod: 0.7, mouth: 'oh' },
    friend: { lid: 0, tilt: -6, brow: [[0.3, -10], [0.3, -10]], mouth: 'beam' },
  },
  build(B) {
    const cy = 0.25, R = [0.3, 0.15, 0.24];
    B.setBone('body', [0, 0.1, 0]);
    // the shell: a squashed sphere, flat on top, pale underneath, a darker rim at its waist
    const shell = new THREE.SphereGeometry(1, 36, 22);
    { const p = shell.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.78) p.setY(i, 0.78 + (y - 0.78) * 0.3); if (y < -0.85) p.setY(i, -0.85 + (y + 0.85) * 0.3); } }
    const crab = C3(MON.crab), light = C3(MON.crabLight), belly = C3(MON.crabBelly), rim = C3(sc(MON.crab, 0.84));
    B.toon(smoothNormals(shell), { m: MT([0, cy, 0], [0, 0, 0], R), color: MON.crab, outline: 0.016,
      vcol: (x, y, z, ny, tmp) => ny < -0.4 ? tmp.copy(belly) : tmp.copy(rim).lerp(crab, smooth(-0.35, 0.05, ny)).lerp(light, smooth(0.6, 0.97, ny) * 0.6) });
    const surf = ellSurf(R[0], R[1], R[2], [0, cy, 0]);
    for (const [Y, th, rr] of [[cy + 0.07, -1.05, 0.03], [cy + 0.05, -1.55, 0.022], [cy + 0.07, 1.1, 0.028], [cy + 0.04, 1.6, 0.02]]) B.unlit(wrapOn(discGeo(rr, rr * 0.8, 16, 3), surf, Y, th, 0.004), { color: MON.crabLight });
    B.faceMouths({ surf, y: cy - 0.035, w: 0.12, h: 0.042, lop: -1, kinds: ['beam', 'smirk', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'worry', 'oh'] });
    for (const side of [-1, 1]) { const Y = cy - 0.01, th = thetaFor(surf, Y, side * 0.165); B.unlit(wrapOn(discGeo(0.032, 0.018, 18, 3), surf, Y, th, 0.004), { color: MON.blush }); }
    B.gloss(surf, cy + 0.075, -0.62, 0.055, 0.03, { rot: 1.3, dot: false });
    // eyes on stalks, which wobble with a lag and cross when it is confused
    const eyePts = [];
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R', base = [side * 0.075, 0.33, 0.1], top = [side * 0.088, 0.47, 0.118];
      const st = B.bone('stalk' + S, 'body', base);
      B.toon(capsuleAB(base, top, 0.02, 3, 10), { bone: st, color: sc(MON.crab, 0.95), outline: 0.008 });
      eyePts.push({ pos: [side * 0.09, 0.505, 0.124], yaw: -side * 0.08, side, parent: st });
    }
    B.eyesAt(eyePts, { r: 0.066, zScale: 0.9, pupil: 0.5, outline: 0.009 });
    // long soft rabbit ears on a 3-bone chain each, riding the body (glued) until the death lets them go
    const earBase = B.bone('earBase', 'root', [0, 0.1, 0]);
    for (const side of (REUSE.ears === false ? [] : [-1, 1])) {
      const S = side < 0 ? 'L' : 'R', base = [side * 0.1, 0.33, -0.07];
      const m = MT(base, [-0.24, 0, -side * 0.34]);
      const dir = V3(0, 1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(m));
      const P = (t) => [base[0] + dir.x * t, base[1] + dir.y * t, base[2] + dir.z * t];
      const e0 = B.bone('ear' + S + '0', earBase, P(0)), e1 = B.bone('ear' + S + '1', e0, P(0.12)), e2 = B.bone('ear' + S + '2', e1, P(0.24));
      const L = 0.36, taperEar = (y) => { const t = clamp01(y / L); return 0.62 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (t < 0.85 ? 1 : 1 - (t - 0.85) * 1.2); };
      const outer = new THREE.CapsuleGeometry(0.05, L - 0.1, 6, 16); outer.translate(0, L / 2, 0); shapeAlongY(outer, taperEar); outer.scale(1, 1, 0.5);
      const inner = new THREE.CapsuleGeometry(0.03, L - 0.16, 4, 12); inner.translate(0, L / 2 + 0.01, 0); shapeAlongY(inner, taperEar); inner.scale(1, 1, 0.3); inner.translate(0, 0, 0.017);
      const wts = chainWeights(P(0), P(0.24), [e0, e1, e2]);
      B.toon(outer, { m, bone: e0, color: MON.crabEar, outline: 0.011, weights: wts, vcol: (x, y, z, ny, tmp) => tmp.copy(C3(sc(MON.crabEar, 0.9))).lerp(C3(MON.crabEar), smooth(0.33, 0.55, y)) });
      B.toon(inner, { m, bone: e0, color: MON.earInner, weights: wts });
    }
    // two claws: each a sphere split into hinged halves (the top half opens), on a short arm
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R', yaw = side * 0.28, cr = 0.094, SC = [1, 0.74, 1.28];
      const sh = [side * 0.24, 0.21, 0.1], cc = [side * 0.37, 0.235, 0.27];
      const arm = B.bone('arm' + S, 'body', sh);
      B.toon(capsuleAB(sh, [side * 0.345, 0.228, 0.2], 0.03, 4, 10), { bone: arm, color: sc(MON.crab, 0.93), outline: 0.009 });
      const tipLight = (x, y, z, ny, tmp) => tmp.copy(crab).lerp(light, smooth(cc[2] + 0.02, cc[2] + 0.12, z) * 0.7);
      B.toon(new THREE.SphereGeometry(cr, 20, 8, 0, TAU, Math.PI / 2, Math.PI / 2), { m: MT(cc, [0, yaw, 0], SC), bone: arm, color: MON.crab, outline: 0.011, vcol: tipLight });
      B.toon(new THREE.CircleGeometry(cr * 0.97, 20).rotateX(-Math.PI / 2), { m: MT([cc[0], cc[1] + 0.001, cc[2]], [0, yaw, 0], SC), bone: arm, color: MON.clawIn });
      const back = [cc[0] - Math.sin(yaw) * cr * 1.0, cc[1], cc[2] - Math.cos(yaw) * cr * 1.0];
      const pin = B.bone('pin' + S, arm, back);
      B.toon(new THREE.SphereGeometry(cr, 20, 8, 0, TAU, 0, Math.PI / 2), { m: MT(cc, [0, yaw, 0], SC), bone: pin, color: MON.crab, outline: 0.011, vcol: tipLight });
      B.toon(new THREE.CircleGeometry(cr * 0.97, 20).rotateX(Math.PI / 2), { m: MT([cc[0], cc[1] - 0.001, cc[2]], [0, yaw, 0], SC), bone: pin, color: MON.clawIn });
      B.gloss(ellSurf(cr * SC[0], cr * SC[1], cr * SC[2], cc), cc[1] + 0.035, -0.4, 0.03, 0.016, { bone: pin, rot: 1.2, dot: false, lift: 0.006 });
    }
    // six legs, two joints each, walking in alternating tripods
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1, j = i % 3, z = 0.1 - j * 0.1, zo = (1 - j) * 0.05;
      const hip = [side * 0.19, 0.17, z], knee = [side * 0.315, 0.19, z + zo], foot = [side * 0.37, 0.016, z + zo * 1.5];
      const leg = B.bone('leg' + i, 'root', hip);
      B.toon(taperTube([hip, [side * 0.26, 0.2, z + zo * 0.6], knee, [side * 0.36, 0.1, z + zo * 1.3], foot], taper([[0, 0.026], [0.5, 0.022], [1, 0.015]]), 8, 18), { bone: leg, color: sc(MON.crab, 0.88), outline: 0.008 });
      B.toon(new THREE.SphereGeometry(0.021, 10, 8), { m: MT(foot), bone: leg, color: sc(MON.crab, 0.88) });
    }
    return { height: 0.6, radius: 0.36, shadow: 0.8 };
  },
  idle(ctx, t) {
    const w = ctx.idleW, b = ctx.b, P = 2.8;
    // it sidles, ±0.12 over 1.4 s, the ears trailing 180 ms behind
    const vAt = (tt) => 0.12 * (TAU / P) * Math.cos(TAU * tt / P) * w;
    b.root.position.x += 0.12 * Math.sin(TAU * t / P) * w;
    const speed = Math.abs(Math.cos(TAU * t / P)), g = TAU * 2.4 * t;
    for (let i = 0; i < 6; i++) {
      const L = b['leg' + i]; if (!L) continue;
      const side = i < 3 ? -1 : 1, grp = ((i % 3) + (side > 0 ? 1 : 0)) % 2, s = Math.sin(g + grp * Math.PI);
      L.rotation.z += side * Math.max(0, s) * (0.12 + 0.32 * speed) * w;
      L.rotation.y += side * 0.12 * Math.cos(g + grp * Math.PI) * speed * w;
    }
    const bob = Math.abs(Math.sin(g));
    b.body.position.y += 0.014 * bob * w;
    b.body.scale.multiply(V3(1 + 0.035 * (1 - bob) * w, 1 - 0.05 * (1 - bob) * w, 1 + 0.035 * (1 - bob) * w));
    b.body.rotation.z -= 0.35 * vAt(t);
    const lag = vAt(t - 0.18);
    for (const [S, side] of [['L', -1], ['R', 1]]) {
      const k = side * 0.08 * Math.sin(t * 1.7 + side);
      if (b['ear' + S + '0']) { b['ear' + S + '0'].rotation.z += 0.5 * lag + k; b['ear' + S + '0'].rotation.x += 0.05 * Math.sin(t * 2.3 + side); }
      if (b['ear' + S + '1']) { b['ear' + S + '1'].rotation.z += 0.8 * lag + k * 0.8; b['ear' + S + '1'].rotation.x -= 0.12 + 0.08 * bob * w; }
      if (b['ear' + S + '2']) { b['ear' + S + '2'].rotation.z += 1.0 * lag; b['ear' + S + '2'].rotation.x -= 0.22 + 0.1 * bob * w; }
      // claws open and close at 0.7 Hz, a little out of step with each other
      const op = 0.5 + 0.5 * Math.sin(TAU * 0.7 * t + (side > 0 ? 0.9 : 0));
      if (b['pin' + S]) b['pin' + S].rotation.x -= 0.62 * op * w;
      if (b['arm' + S]) { b['arm' + S].rotation.x -= 0.08 * op * w; b['arm' + S].rotation.y -= side * 0.06 * Math.sin(TAU * 0.35 * t) * w; }
      if (b['stalk' + S]) { b['stalk' + S].rotation.z -= 0.6 * vAt(t - 0.15); b['stalk' + S].rotation.x += 0.06 * Math.sin(t * 2.9 + side) * w; }
    }
  },
  attackPose(ctx, ct) {
    // Pinch: claws up and open in the wind-up, SNAP shut on the impact
    const b = ctx.b, up = ct < 0.14 ? easeOutCubic(ct / 0.14) : ct < 0.26 ? 1 : 1 - seg(ct, 0.26, 0.55);
    const open = ct < 0.245 ? 0.85 * seg(ct, 0.0, 0.18) : 0;
    for (const S of ['L', 'R']) {
      if (b['arm' + S]) b['arm' + S].rotation.x -= 0.55 * up;
      if (b['pin' + S]) b['pin' + S].rotation.x -= open;
      if (b['ear' + S + '0']) b['ear' + S + '0'].rotation.x -= 0.55 * hump(ct, 0.14, 0.55);
    }
  },
  hurtPose(ctx, ct) { for (const S of ['L', 'R']) { const e = ctx.b['ear' + S + '0']; if (e) e.rotation.x -= 0.7 * hump(ct, 0, 0.38); const st = ctx.b['stalk' + S]; if (st) st.rotation.x -= 0.4 * hump(ct, 0, 0.3); } },
  castPose(ctx, ct) {
    // Sand Kick: the back legs scrabble and a spray of sand flies forward
    const b = ctx.b, k = hump(ct, 0.15, 0.7);
    for (let i = 0; i < 6; i++) { const L = b['leg' + i]; if (L) L.rotation.x += Math.sin(ct * 60 + i) * 0.35 * k; }
    if (ct > 0.3 && !ctx._sand) { ctx._sand = true; for (let i = 0; i < 8; i++) ctx.fx.spawn('blob', { pos: V3((Math.random() - 0.5) * 0.3, 0.06, 0.25), vel: V3((Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.8, 1.2 + Math.random()), grav: 5, life: 0.6, s0: 0.03, s1: 0.02, color: PAL.sand.mid, floor: 0.01 }); }
    if (ct < 0.2) ctx._sand = false;
  },
  taunt(ctx, ct) {
    // confused: it scuttles on the spot, the eye-stalks cross, the claws clack
    const b = ctx.b, k = hump(ct, 0, 1.1);
    if (b.stalkL) b.stalkL.rotation.z -= 0.5 * k;
    if (b.stalkR) b.stalkR.rotation.z += 0.5 * k;
    b.root.position.x += 0.07 * Math.sin(ct * 16) * k;
    for (let i = 0; i < 6; i++) { const L = b['leg' + i]; if (L) L.rotation.z += (i < 3 ? -1 : 1) * Math.max(0, Math.sin(ct * 32 + (i % 2) * Math.PI)) * 0.4 * k; }
    for (const S of ['L', 'R']) if (b['pin' + S]) b['pin' + S].rotation.x -= 0.55 * Math.abs(Math.sin(ct * 13)) * k;
    ctx.showOh = ct > 0.15 && ct < 0.85;
    return ct >= 1.1;
  },
  post(ctx, t, dt, clip) { if (!dying(clip)) glue(ctx, 'earBase', ['body']); },
  // POP — and the two ears fall off last, landing separately, which is funnier than it should be
  defeat(ctx, ct, o) {
    const b = ctx.b;
    if (ct < 0.09) {
      const k = easeOutCubic(ct / 0.09);
      b.body.scale.multiplyScalar(lerp(1, 1.25, k)); ctx.eyeScale *= 1.25; ctx.showOh = true; ctx.flash = 0.25 * k;
      glue(ctx, 'earBase', ['body']);
      return false;
    }
    if (!o._pop) {
      o._pop = true;
      const c = V3(0, 0.3, 0);
      ctx.fx.puff(c, 9, 0.46, 0.12, { life: 0.5 });
      ctx.fx.chunks(c, 8, 0.36, MON.crab, { size: 0.05, speed: 2.4 });
      ctx.fx.sparkle(c, 6, 0.7, { size: 0.09, life: 0.65, speed: 1.4, up: 0.8, delay: 0.06 });
      ctx.emit('poof', o);
    }
    b.body.scale.setScalar(0.0001);
    for (let i = 0; i < 6; i++) if (b['leg' + i]) b['leg' + i].scale.setScalar(0.0001);
    ctx.shadowK = 0.35;
    for (const [S, side, t0, t1] of [['L', -1, 0.09, 0.62], ['R', 1, 0.2, 0.86]]) {
      const e0 = b['ear' + S + '0']; if (!e0) continue;
      const rest = ctx.boneRest['ear' + S + '0'];
      const k = seg(ct, t0, t1), fall = easeInQuad(k);
      e0.position.x += side * 0.3 * k; e0.position.z += 0.16 * k;
      e0.position.y += (0.05 - rest.y) * fall + 0.42 * 4 * k * (1 - k) * (1 - fall * 0.4);
      e0.rotation.z -= side * 1.5 * easeOutCubic(k);
      e0.rotation.x += 0.4 * Math.sin(k * 7) * (1 - k);
      const land = ct > t1 ? Math.exp(-(ct - t1) * 10) * Math.abs(Math.sin((ct - t1) * 26)) : 0;
      e0.position.y += 0.05 * land;
      const e1 = b['ear' + S + '1'], e2 = b['ear' + S + '2'], flop = ct > t1 ? 1 : Math.sin(k * 12) * (1 - k);
      if (e1) e1.rotation.x += 0.35 * flop; if (e2) e2.rotation.x += 0.45 * flop;
      if (ct > t1 && !o['_land' + S]) { o['_land' + S] = true; ctx.fx.puff(V3(side * 0.42, 0.04, 0.16), 3, 0.16, 0.045, { color: PAL.dirt.light, up: 0.15, life: 0.35 }); }
    }
    if (ct >= 1.3 && !o._gone) {
      o._gone = true;
      for (const side of [-1, 1]) { const c = V3(side * 0.5, 0.06, 0.16); ctx.fx.puff(c, 4, 0.16, 0.06, { life: 0.4 }); ctx.fx.sparkle(c, 3, 0.25, { size: 0.06, life: 0.45 }); }
      ctx.setVisible(false);
    }
    return ct >= 1.75;
  },
});

// ── 13. HOOT COUTURE ──────────────────────────────────────────────────────────────────────────────────────────
species('hoot_couture', {
  name: 'Hoot Couture', family: 'bird', color: MON.owl, noWinkDefault: true,
  // thinks your outfit is fine, dear, for what it is: heavy lids, brows up, looking just past you
  face: {
    wild: { lid: 0.34, tilt: -8, brow: [[0.32, -14], [0.26, -10]], look: [0.2, -0.22], glance: 0.25, glancePeriod: 5.5 },
    windup: { lid: 0.6, tilt: 18, brow: [[-0.12, 22], [-0.12, 22]] },
    strike: { lid: 0.12, tilt: 14, brow: [[-0.06, 18], [-0.06, 18]], eyeScale: 1.1 },
    recover: { lid: 0.34, tilt: -8, brow: [[0.32, -14], [0.26, -10]], look: [0.2, -0.22] },
    friend: { lid: 0.06, tilt: -6, brow: [[0.32, -12], [0.32, -12]], look: [0, 0] },
  },
  build(B) {
    const lift = 0.045, neck = lift + 0.3, hem = lift + 0.03;
    const prof = smoothProfile([[0, 0], [0.14, 0.005], [0.2, 0.05], [0.228, 0.15], [0.225, 0.27], [0.195, 0.37], [0.13, 0.44], [0.05, 0.475], [0, 0.48]], 30);
    const head = B.bone('head', 'body', [0, neck, 0]);
    const owl = C3(MON.owl), owlL = C3(mx(MON.owl, 'plaster.light', 0.2));
    B.toon(lathe(prof, 34), { m: MT([0, lift, 0]), color: MON.owl, outline: 0.016,
      weights: (x, y) => { const k = smooth(neck - 0.02, neck + 0.05, y); return [['body', 1 - k], ['head', k]]; },
      vcol: (x, y, z, ny, tmp) => tmp.copy(owl).multiplyScalar(0.88).lerp(owlL, smooth(lift + 0.04, lift + 0.46, y)) });
    const surf = latheSurf(prof, { y: lift });
    // belly: a pale bib with little chevron feathers
    B.unlit(wrapOn(discGeo(0.12, 0.115, 22, 5), surf, lift + 0.135, 0, 0.003), { color: MON.owlBelly });
    for (const [dx, dy] of [[-0.05, 0.19], [0.05, 0.19], [-0.085, 0.13], [0, 0.135], [0.085, 0.13], [-0.045, 0.075], [0.045, 0.075]]) {
      for (const s2 of [-1, 1]) { const g = discGeo(0.019, 0.0055, 10, 2); g.rotateZ(s2 * 0.62); g.translate(s2 * 0.012, 0, 0); const th = thetaFor(surf, lift + dy, dx); B.unlit(wrapOn(g, surf, lift + dy, th, 0.005), { color: MON.owlDark }); }
    }
    // the heart-shaped face: two cream discs round the eyes and a chin
    const eyeY = lift + 0.36, gap = 0.165, er = 0.08;
    for (const side of [-1, 1]) { const th = thetaFor(surf, eyeY, side * gap / 2); B.unlit(wrapOn(discGeo(0.098, 0.104, 24, 5), surf, eyeY + 0.004, th, 0.003 + (side > 0 ? 0.0006 : 0)), { bone: head, color: MON.owlFace }); }
    B.unlit(wrapOn(discGeo(0.06, 0.05, 18, 4), surf, lift + 0.295, 0, 0.0025), { bone: head, color: MON.owlFace });
    const eyes = B.eyes({ surf, y: eyeY, gap, r: er, tilt: -6, pupil: 0.32, parent: head, forward: 0.004, lid: MON.owlFace, browLift: 1.2, browColor: mx(MON.owlDark, PAL.outline.char, 0.4) });
    // gold spectacles, because one must
    eyes.forEach((e) => {
      const d = V3(Math.sin(e.th), 0, Math.cos(e.th)), c = e.pos.clone().addScaledVector(d, er * 0.42);
      B.toon(new THREE.TorusGeometry(er * 1.17, 0.0105, 8, 30), { m: MT([c.x, c.y, c.z], [0, e.th, 0]), bone: head, color: MON.gold, outline: 0.004 });
    });
    { const a = eyes[0].pos, c = eyes[1].pos; B.toon(tube([[a.x + er * 1.1, a.y + 0.012, a.z + 0.05], [0, a.y + 0.03, a.z + 0.075], [c.x - er * 1.1, c.y + 0.012, c.z + 0.05]], 0.007, 6, 10), { bone: head, color: MON.gold }); }
    // beak, pointing down between the eyes
    { const bz = surf.r(lift + 0.3, 0); const c = new THREE.ConeGeometry(0.036, 0.085, 10); c.rotateX(Math.PI); c.translate(0, -0.03, 0); B.toon(c, { m: MT([0, lift + 0.325, bz + 0.012], [0.38, 0, 0], [1, 1, 0.8]), bone: head, color: MON.beak, outline: 0.008 }); }
    B.faceMouths({ surf, y: lift + 0.255, w: 0.05, h: 0.045, parent: head, beam: 'oh', kinds: ['oh'], lift: 0.006 });
    // ear tufts
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R', p = [side * 0.105, lift + 0.425, -0.005];
      const tuft = B.bone('tuft' + S, head, p);
      const c = new THREE.ConeGeometry(0.042, 0.12, 12); c.translate(0, 0.06, 0);
      const m = MT(p, [-0.15, 0, -side * 0.55], [1, 1, 0.55]);
      B.toon(c, { m, bone: tuft, color: MON.owlDark, outline: 0.008 });
      B.toon(new THREE.SphereGeometry(0.012, 8, 6), { m: m.clone().multiply(MT([0, 0.118, 0])), bone: tuft, color: MON.owlDark });
    }
    B.gloss(surf, lift + 0.43, -0.75, 0.035, 0.02, { bone: head, rot: 0.9, dot: false });
    // folded wings peeking out of the cape
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R', p = [side * 0.2, lift + 0.27, 0.0];
      const wing = B.bone('wing' + S, 'body', p);
      const g = new THREE.SphereGeometry(0.11, 16, 12); g.translate(0, -0.08, 0);
      B.toon(g, { m: MT(p, [0.1, 0, side * 0.12], [0.34, 1, 0.6]), bone: wing, color: MON.owlDark, outline: 0.009 });
    }
    // feet: three orange toes each
    for (const side of [-1, 1]) for (const a of [-0.45, 0, 0.45]) B.toon(new THREE.SphereGeometry(0.024, 10, 8), { m: MT([side * 0.075 + Math.sin(a) * 0.035, 0.02, 0.11 + Math.cos(a) * 0.035], [0, a, 0], [0.8, 0.7, 1.5]), bone: 'root', color: MON.beak, outline: 0.006 });
    // the velvet cape: a thin lathe shell round the back, gold-hemmed, on its own bones (glued to the body)
    const capeBase = B.bone('capeBase', 'root', [0, 0, 0]);
    const capeB = B.bone('capeB', capeBase, [0, neck, -0.22]), capeL = B.bone('capeL', capeBase, [-0.2, neck, -0.05]), capeR = B.bone('capeR', capeBase, [0.2, neck, -0.05]);
    const loop = v2([[0.272, hem], [0.264, lift + 0.16], [0.246, lift + 0.25], [0.222, neck], [0.205, neck + 0.004], [0.232, lift + 0.25], [0.25, lift + 0.16], [0.258, hem + 0.007], [0.272, hem]]);
    const capeG = new THREE.LatheGeometry(loop, 44, Math.PI * 0.29, Math.PI * 1.42);
    { const p = capeG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y < hem + 0.012) { const th = Math.atan2(x, z); p.setY(i, y + 0.012 * Math.abs(Math.sin(th * 5))); } } }
    const velvet = C3(MON.velvet), deep = C3(MON.velvetDeep), gold = C3(MON.gold);
    B.toon(capeG, { color: MON.velvet, outline: 0.009,
      weights: (x, y) => { const k = 1 - smooth(hem, neck, y), l = clamp01(-x / 0.24), r = clamp01(x / 0.24), c = Math.max(0, 1 - l - r); return [[capeBase, 1 - k], [capeL, k * l], [capeR, k * r], [capeB, k * c]]; },
      vcol: (x, y, z, ny, tmp, nx, nz) => { const rad = Math.hypot(x, z) || 1, inward = (nx * x + nz * z) / rad < 0; if (y < hem + 0.028 && !inward) return tmp.copy(gold); return tmp.copy(inward ? deep : velvet).multiplyScalar(lerp(0.9, 1.06, smooth(hem, neck, y))); } });
    // a gold cord across the chest with a ruby clasp
    B.toon(tube([[-0.2, lift + 0.24, 0.14], [-0.1, lift + 0.215, 0.228], [0, lift + 0.205, 0.25], [0.1, lift + 0.215, 0.228], [0.2, lift + 0.24, 0.14]], 0.009, 6, 18), { bone: capeBase, color: MON.gold, outline: 0.004 });
    B.toon(new THREE.TorusGeometry(0.03, 0.01, 8, 18), { m: MT([0, lift + 0.205, 0.256]), bone: capeBase, color: MON.gold, outline: 0.005 });
    B.unlit(new THREE.SphereGeometry(0.017, 10, 8), { m: MT([0, lift + 0.205, 0.258], [0, 0, 0], [1, 1, 0.6]), bone: capeBase, color: MON.ruby });
    return { height: lift + 0.52, radius: 0.28, shadow: 0.62 };
  },
  idle(ctx, t) {
    const w = ctx.idleW, b = ctx.b;
    // the head turns 140° over 1.2 s, holds 0.8 s, and snaps back in 120 ms. The body does not move. It does not need to.
    const P = 4.4, n = Math.floor(t / P), k = t - n * P, dir = n % 2 ? -1 : 1;
    const turn = k < 1.2 ? easeInOutQuad(k / 1.2) : k < 2.0 ? 1 : k < 2.12 ? 1 - easeInQuad((k - 2.0) / 0.12) : 0;
    const snap = hump(k, 2.1, 2.5);
    if (b.head) { b.head.rotation.y += dir * 140 * DEG * turn * w; b.head.rotation.z += (0.04 * Math.sin(t * 1.3) - dir * 0.08 * snap) * w; }
    // a tiny indignant ruffle when the head snaps home
    b.body.scale.multiply(V3(1 + 0.05 * snap * w, 1 - 0.035 * snap * w, 1 + 0.05 * snap * w));
    const br = Math.sin(TAU * t / 2.6);
    b.body.scale.multiply(V3(1 + 0.012 * br * w, 1 + 0.016 * br * w, 1 + 0.012 * br * w));
    if (b.tuftL) b.tuftL.rotation.z += (0.45 * snap + 0.05 * Math.sin(t * 3.1)) * w;
    if (b.tuftR) b.tuftR.rotation.z -= (0.45 * snap + 0.05 * Math.sin(t * 2.7)) * w;
    // the cape sways
    if (b.capeB) b.capeB.rotation.x += (0.05 + 0.05 * Math.sin(TAU * t / 2.3) + 0.12 * snap) * w;
    if (b.capeL) b.capeL.rotation.z -= (0.03 + 0.04 * Math.sin(TAU * t / 2.3 + 0.8) + 0.1 * snap) * w;
    if (b.capeR) b.capeR.rotation.z += (0.03 + 0.04 * Math.sin(TAU * t / 2.3 + 1.6) + 0.1 * snap) * w;
    ctx.lids[0] = ctx.lids[1] = 0.12 * turn;
  },
  attackPose(ctx, ct) {
    // Whiffle: wings out and the cape billows on the gust
    const b = ctx.b, k = hump(ct, 0.08, 0.55);
    if (b.wingL) b.wingL.rotation.z -= 1.2 * k * (1 + 0.3 * Math.sin(ct * 40));
    if (b.wingR) b.wingR.rotation.z += 1.2 * k * (1 + 0.3 * Math.sin(ct * 40));
    if (b.capeB) b.capeB.rotation.x += 0.55 * k;
    if (b.capeL) b.capeL.rotation.z -= 0.4 * k;
    if (b.capeR) b.capeR.rotation.z += 0.4 * k;
    if (b.head) b.head.rotation.x -= 0.15 * hump(ct, 0.0, 0.2);
  },
  castPose(ctx, ct) {
    // Muddle: the head goes all the way round. Owls can. It is upsetting.
    const b = ctx.b;
    if (b.head) b.head.rotation.y += TAU * easeInOutQuad(seg(ct, 0.18, 0.72));
    const k = hump(ct, 0.15, 0.85);
    if (b.capeL) b.capeL.rotation.z -= 0.5 * k;
    if (b.capeR) b.capeR.rotation.z += 0.5 * k;
    if (b.wingL) b.wingL.rotation.z -= 0.6 * k;
    if (b.wingR) b.wingR.rotation.z += 0.6 * k;
  },
  hurtPose(ctx, ct) { const k = hump(ct, 0, 0.35); if (ctx.b.tuftL) ctx.b.tuftL.rotation.z -= 0.6 * k; if (ctx.b.tuftR) ctx.b.tuftR.rotation.z += 0.6 * k; ctx.b.body.scale.multiplyScalar(1 + 0.06 * k); },
  taunt(ctx, ct) {
    // "Fine, dear. For what it is." — a slow head tilt, a look down the beak, the lids lower
    const b = ctx.b, k = smooth(0, 0.3, ct) * (1 - smooth(0.9, 1.25, ct));
    if (b.head) { b.head.rotation.z += 0.32 * k; b.head.rotation.x -= 0.14 * k; }
    ctx.lids[0] = ctx.lids[1] = 0.45 * k;
    if (b.tuftL) b.tuftL.rotation.z -= 0.25 * k;
    if (b.tuftR) b.tuftR.rotation.z -= 0.1 * k;
    b.body.scale.multiply(V3(1, 1 + 0.04 * k, 1));
    return ct >= 1.3;
  },
  post(ctx, t, dt, clip) { if (!dying(clip)) glue(ctx, 'capeBase', ['body']); },
  // WISP — the owl drifts away upward; the cape falls to the ground last and folds itself neatly
  defeat(ctx, ct, o) {
    const b = ctx.b;
    const k = seg(ct, 0, 0.7), ek = easeInQuad(k);
    if (ct < 0.7) {
      b.body.position.y += 0.42 * ek;
      b.body.scale.multiply(V3(1 - 0.85 * ek, 1 + 0.25 * k - 0.95 * ek, 1 - 0.85 * ek));
      ctx.showOh = ct < 0.3; ctx.eyeScale *= 1 + 0.25 * hump(ct, 0, 0.3);
      if (!o._wisps) { o._wisps = true; for (let i = 0; i < 12; i++) ctx.fx.spawn('blob', { pos: V3((Math.random() - 0.5) * 0.4, 0.15 + Math.random() * 0.35, (Math.random() - 0.5) * 0.25), vel: V3((Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.9, 0), life: 0.6 + Math.random() * 0.25, s0: 0.05, s1: 0, color: i % 3 ? MON.owl : MON.white, delay: i * 0.035 }); }
    } else {
      b.body.scale.setScalar(0.0001);
      if (!o._up) { o._up = true; ctx.fx.sparkle(V3(0, 0.75, 0), 6, 0.5, { size: 0.08, life: 0.6, up: 1.0 }); ctx.emit('poof', o); }
    }
    for (const n of ['wingL', 'wingR']) if (b[n]) b[n].scale.multiplyScalar(1 - ek);
    const c = b.capeBase;
    if (c) {
      const drop = easeInQuad(seg(ct, 0.38, 0.72)), fold = easeInOutQuad(seg(ct, 0.9, 1.15));
      const bounce = ct > 0.72 ? 0.25 * Math.exp(-(ct - 0.72) * 12) * Math.abs(Math.sin((ct - 0.72) * 30)) : 0;
      c.scale.y *= lerp(1, 0.07, drop) * (1 + 3 * bounce) * lerp(1, 1.8, fold);
      c.scale.x *= lerp(1, 1.1, drop) * lerp(1, 0.52, fold);
      c.scale.z *= lerp(1, 1.05, drop);
      c.position.x -= 0.06 * fold;
      if (ct > 0.72 && !o._flump) { o._flump = true; ctx.fx.puff(V3(0, 0.03, 0), 6, 0.5, 0.06, { color: PAL.dirt.light, up: 0.12, life: 0.4 }); }
    }
    ctx.shadowK = lerp(1, 0.45, seg(ct, 0.3, 0.72));
    if (ct >= 1.6 && !o._gone) { o._gone = true; ctx.fx.puff(V3(-0.05, 0.05, 0), 6, 0.35, 0.08, { life: 0.45 }); ctx.fx.sparkle(V3(-0.05, 0.1, 0), 5, 0.5, { size: 0.08, life: 0.55 }); ctx.setVisible(false); }
    return ct >= 2.0;
  },
});

// ── 14. BATTERFLY ─────────────────────────────────────────────────────────────────────────────────────────────
function mothUpperWing() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.03);
  s.bezierCurveTo(0.06, 0.2, 0.24, 0.27, 0.3, 0.19);
  s.quadraticCurveTo(0.335, 0.08, 0.24, -0.015);
  s.quadraticCurveTo(0.12, -0.05, 0, -0.01);
  s.lineTo(0, 0.03);
  return s;
}
function mothLowerWing() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.005);
  s.quadraticCurveTo(0.12, 0.0, 0.2, -0.06);
  s.quadraticCurveTo(0.225, -0.1, 0.19, -0.14);
  s.quadraticCurveTo(0.17, -0.17, 0.13, -0.16);
  s.quadraticCurveTo(0.1, -0.19, 0.07, -0.16);
  s.quadraticCurveTo(0.03, -0.14, 0, -0.06);
  s.lineTo(0, -0.005);
  return s;
}
species('batterfly', {
  name: 'Batterfly', family: 'bug', hover: 0.55, color: MON.moth,
  // a moth built like a boxer: chin down, brows in, and a grin that has taken a few
  face: {
    wild: { lid: 0.38, tilt: 16, brow: [[-0.06, 20], [-0.02, 16]], look: [0, 0.12], glance: 0.45, glancePeriod: 2.2, mouth: 'smirk' },
    windup: { lid: 0.66, tilt: 24, brow: [[-0.2, 30], [-0.2, 30]], mouth: 'grimace' },
    recover: { lid: 0.36, tilt: 16, mouth: 'smirk' },
    friend: { lid: 0.02, tilt: -4, brow: [[0.28, -10], [0.28, -10]], mouth: 'beam' },
  },
  build(B) {
    const cy = 0.2;
    B.setBone('body', [0, cy, 0]);
    const moth = C3(MON.moth), mothL = C3(mx(MON.moth, 'plaster.light', 0.3)), dark = C3(MON.mothDark);
    // a big round fuzzy head
    const hc = [0, cy + 0.1, 0.03], hr = 0.108;
    B.toon(new THREE.SphereGeometry(hr, 28, 20), { m: MT(hc), color: MON.moth, outline: 0.014, vcol: (x, y, z, ny, tmp) => tmp.copy(moth).lerp(mothL, smooth(hc[1] - 0.02, hc[1] + 0.1, y) * 0.8) });
    const hs = ellSurf(hr, hr, hr, hc);
    // a fluffy ruff and a round striped body below it (boxer's stance: upright)
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; B.toon(new THREE.SphereGeometry(0.044, 12, 9), { m: MT([Math.sin(a) * 0.085, cy - 0.02 + 0.012 * Math.cos(a * 2), Math.cos(a) * 0.07 + 0.01]), color: MON.mothFuzz, outline: 0.006 }); }
    const stripes = (x, y, z, ny, tmp) => { const f = ((y * 26) % 1 + 1) % 1; return tmp.copy(moth).lerp(dark, f < 0.36 ? 0.55 : 0).multiplyScalar(lerp(0.9, 1.04, smooth(-0.6, 0.8, ny))); };
    B.toon(new THREE.SphereGeometry(0.085, 20, 14), { m: MT([0, cy - 0.09, -0.02], [0, 0, 0], [1, 1.02, 0.94]), color: MON.moth, outline: 0.012, vcol: stripes });
    B.toon(new THREE.SphereGeometry(0.066, 18, 12), { m: MT([0, cy - 0.18, -0.045]), color: MON.moth, outline: 0.011, vcol: stripes });
    // boxing trunks, obviously
    B.toon(new THREE.SphereGeometry(0.07, 22, 6, 0, TAU, Math.PI * 0.36, Math.PI * 0.3), { m: MT([0, cy - 0.175, -0.045]), color: MON.glove, outline: 0.006 });
    B.toon(new THREE.TorusGeometry(0.066, 0.008, 6, 22), { m: MT([0, cy - 0.152, -0.045], [Math.PI / 2, 0, 0]), color: MON.cuff });
    // eyes (determined), brows, a small game grin
    B.eyes({ surf: hs, y: hc[1] + 0.022, gap: 0.118, r: 0.064, tilt: 8, forward: 0.004, pupil: 0.48 });
    for (const side of [-1, 1]) {
      const th = thetaFor(hs, hc[1] + 0.098, side * 0.058), p = surfPoint(hs, hc[1] + 0.098, th, 0.012);
      const brow = new THREE.Shape(); brow.moveTo(-0.034, -0.006); brow.quadraticCurveTo(0, 0.012, 0.034, 0.004); brow.lineTo(0.03, 0.016); brow.quadraticCurveTo(0, 0.026, -0.034, 0.008); brow.lineTo(-0.034, -0.006);
      B.toon(extrude(brow, 0.012, 0.004), { m: MT([p.x, p.y, p.z], [0, th, side * 0.28]), color: MON.mothDark });
    }
    B.faceMouths({ surf: hs, y: hc[1] - 0.055, w: 0.062, h: 0.026, kinds: ['beam', 'smirk', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'oh'] });
    B.gloss(hs, hc[1] + 0.07, -0.78, 0.028, 0.02, { rot: 0.9, dot: false });
    // feathered antennae that trail with lag
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R', base = [side * 0.035, hc[1] + 0.098, hc[2] + 0.01];
      const ant = B.bone('ant' + S, 'body', base);
      const top = [side * 0.105, hc[1] + 0.2, hc[2] + 0.02];
      B.toon(tube([base, [side * 0.06, hc[1] + 0.15, hc[2] + 0.03], top], 0.006, 5, 10), { bone: ant, color: MON.mothDark });
      const comb = extrude(combShape(0.11, 0.032, 5), 0.008, 0.003);
      B.toon(comb, { m: MT([side * 0.07, hc[1] + 0.14, hc[2] + 0.02], [0, 0, -side * 0.62]), bone: ant, color: MON.mothDark, outline: 0.004 });
    }
    // four wings, hinged at the back of the thorax, each upper with an eyespot
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R', hinge = [side * 0.04, cy - 0.03, -0.075];
      const wing = B.bone('wing' + S, 'body', hinge);
      const wm = MT(hinge, [0, side < 0 ? Math.PI : 0, 0]).multiply(MT([0, 0, 0], [0, 0.22, 0.08]));
      const edge = (x, y, z, ny, tmp) => { const d = Math.hypot(x - hinge[0], (y - hinge[1]) * 1.1); return tmp.copy(C3(MON.mothWing)).lerp(C3(MON.mothEdge), smooth(0.16, 0.3, d)); };
      B.toon(extrude(mothUpperWing(), 0.012, 0.004), { m: wm, bone: wing, color: MON.mothWing, outline: 0.008, vcol: edge });
      B.toon(extrude(mothLowerWing(), 0.012, 0.004), { m: wm.clone().multiply(MT([0.01, -0.012, -0.004], [0, 0, -0.1])), bone: wing, color: MON.mothWing, outline: 0.008, vcol: edge });
      for (const face of [1, -1]) {
        const fm = wm.clone().multiply(MT([0.19, 0.12, face * 0.0105], [0, face < 0 ? Math.PI : 0, 0]));
        B.toon(new THREE.CircleGeometry(0.047, 18), { m: fm, bone: wing, color: MON.eyespot });
        B.toon(new THREE.CircleGeometry(0.024, 14), { m: fm.clone().multiply(MT([0.004, 0.004, 0.001])), bone: wing, color: MON.eyespotRing });
        B.toon(new THREE.CircleGeometry(0.02, 12), { m: wm.clone().multiply(MT([0.12, -0.1, face * 0.0105], [0, face < 0 ? Math.PI : 0, 0])), bone: wing, color: MON.eyespot });
      }
    }
    // short arms and big red boxing gloves, held up in a guard
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R', sh = [side * 0.062, cy - 0.06, 0.04], gc = [side * 0.1, cy - 0.035, 0.155];
      const glove = B.bone('glove' + S, 'body', sh);
      B.toon(capsuleAB(sh, [side * 0.09, cy - 0.045, 0.115], 0.017, 3, 8), { bone: glove, color: MON.mothDark, outline: 0.006 });
      B.toon(new THREE.SphereGeometry(0.054, 18, 14), { m: MT(gc, [0, 0, 0], [1, 0.95, 1.08]), bone: glove, color: MON.glove, outline: 0.01, vcol: (x, y, z, ny, tmp) => tmp.copy(C3(MON.glove)).lerp(C3(mx(MON.glove, 'char.white', 0.25)), smooth(0.3, 0.95, ny) * 0.6) });
      B.toon(new THREE.SphereGeometry(0.022, 10, 8), { m: MT([gc[0] - side * 0.04, gc[1] + 0.02, gc[2] - 0.005]), bone: glove, color: MON.glove, outline: 0.005 });
      B.toon(new THREE.TorusGeometry(0.034, 0.012, 8, 18), { m: MT([gc[0] - side * 0.012, gc[1] - 0.006, gc[2] - 0.048], [0.2, -side * 0.35, 0]), bone: glove, color: MON.cuff, outline: 0.004 });
      B.unlit(wrapOn(discGeo(0.014, 0.008, 10, 2), ellSurf(0.054, 0.051, 0.058, gc), gc[1] + 0.03, -side * 0.35, 0.002), { bone: glove, color: MON.white });
    }
    // two little dangling feet
    const feet = B.bone('feet', 'body', [0, cy - 0.22, -0.03]);
    for (const side of [-1, 1]) { B.toon(capsuleAB([side * 0.03, cy - 0.21, -0.03], [side * 0.04, cy - 0.27, -0.01], 0.011, 3, 6), { bone: feet, color: MON.mothDark }); B.toon(new THREE.SphereGeometry(0.018, 8, 6), { m: MT([side * 0.04, cy - 0.28, -0.005]), bone: feet, color: MON.mothDark }); }
    return { height: cy + 0.26, radius: 0.36, shadow: 0.55 };
  },
  idle(ctx, t) {
    const w = ctx.idleW, b = ctx.b, P = 2.4;
    // figure-of-eight hover; wings at 6 Hz; a boxer's bob in the gloves and a one-two every few seconds
    const y = 0.55 + 0.06 * Math.sin(2 * TAU * t / P);
    b.root.position.y += y * (0.35 + 0.65 * w); ctx.hopY = y; ctx.hopMax = 0.61; ctx.flying = true;
    b.root.position.x += 0.14 * Math.sin(TAU * t / P) * w;
    b.body.rotation.z -= 0.14 * Math.cos(TAU * t / P) * w;
    const f = 6 * TAU * t, s = 0.5 + 0.5 * Math.sin(f);
    if (b.wingR) { b.wingR.rotation.y += 0.1 + 0.9 * s; b.wingR.rotation.z += 0.12 * Math.sin(f + 0.5); }
    if (b.wingL) { b.wingL.rotation.y -= 0.1 + 0.9 * Math.max(0, 0.5 + 0.5 * Math.sin(f + 0.35)); b.wingL.rotation.z -= 0.12 * Math.sin(f + 0.85); }
    b.body.scale.multiply(V3(1 + 0.02 * s * w, 1 - 0.025 * s * w, 1));
    const k = t % 3.4, jabL = hump(k, 2.5, 2.7), jabR = hump(k, 2.78, 2.98);
    for (const [S, side, jab, ph] of [['L', -1, jabL, 0], ['R', 1, jabR, Math.PI]]) {
      const g = b['glove' + S]; if (!g) continue;
      g.position.y += 0.014 * Math.sin(TAU * 2 * t + ph) * w;
      g.position.z += 0.1 * jab * w; g.position.x -= side * 0.03 * jab * w;
      g.rotation.x -= 0.3 * jab * w;
    }
    b.body.rotation.y += (0.18 * jabL - 0.18 * jabR) * w;
    if (b.antL) b.antL.rotation.z += 0.12 * Math.sin(TAU * (t - 0.12) / 0.9) * w;
    if (b.antR) b.antR.rotation.z -= 0.12 * Math.sin(TAU * (t - 0.2) / 0.9) * w;
    if (b.feet) b.feet.rotation.x += 0.2 * Math.sin(TAU * t / 1.2);
  },
  attackPose(ctx, ct) {
    // Wing Batter: a left on the first impact, the right on a second dip
    const b = ctx.b, f = 10 * TAU * ct;
    if (b.wingR) b.wingR.rotation.y += 0.6 * (0.5 + 0.5 * Math.sin(f));
    if (b.wingL) b.wingL.rotation.y -= 0.6 * (0.5 + 0.5 * Math.sin(f));
    const l = hump(ct, 0.16, 0.34), r = hump(ct, 0.34, 0.52);
    if (b.gloveL) { b.gloveL.position.z += 0.14 * l; b.gloveL.position.x += 0.04 * l; }
    if (b.gloveR) { b.gloveR.position.z += 0.14 * r; b.gloveR.position.x -= 0.04 * r; }
    b.body.rotation.y += 0.3 * l - 0.3 * r;
    if (ct > 0.36 && ct < 0.5) { const k = hump(ct, 0.36, 0.5); ctx.mover.position.z += 0.22 * k; }
  },
  castPose(ctx, ct) {
    // Dustup: wings clap and throw a cloud of wing-dust
    const b = ctx.b, k = hump(ct, 0.15, 0.8), f = Math.sin(ct * 55);
    if (b.wingR) b.wingR.rotation.y -= 0.9 * k * (0.5 + 0.5 * f);
    if (b.wingL) b.wingL.rotation.y += 0.9 * k * (0.5 + 0.5 * f);
    if (ct > 0.45 && !ctx._dust) { ctx._dust = true; ctx.fx.puff(V3(0, 0.62, 0.3), 8, 0.45, 0.06, { color: MON.mothWing, up: 0.1, life: 0.8 }); ctx.fx.sparkle(V3(0, 0.62, 0.35), 5, 0.4, { size: 0.05, life: 0.6, color: MON.mothWing, alt: MON.white }); }
    if (ct < 0.2) ctx._dust = false;
  },
  taunt(ctx, ct) {
    // the gloves tap together — tap, tap, tap — with a boxer's shuffle
    const b = ctx.b, k = smooth(0, 0.15, ct) * (1 - smooth(0.95, 1.15, ct)), tap = Math.abs(Math.sin(ct * 3 * Math.PI / 0.9));
    if (b.gloveL) { b.gloveL.position.x += 0.045 * tap * k; b.gloveL.position.z += 0.02 * k; }
    if (b.gloveR) { b.gloveR.position.x -= 0.045 * tap * k; b.gloveR.position.z += 0.02 * k; }
    b.root.position.x += 0.05 * Math.sin(ct * 14) * k;
    b.root.position.y += 0.03 * Math.abs(Math.sin(ct * 14)) * k;
    return ct >= 1.15;
  },
  // FOLD — the wings close like a book, then away it spins
  defeat(ctx, ct, o) {
    const b = ctx.b, k = easeInOutQuad(seg(ct, 0, 0.2));
    if (b.wingR) b.wingR.rotation.y -= 1.45 * k;
    if (b.wingL) b.wingL.rotation.y += 1.45 * k;
    if (ct < 0.22) { ctx.showOh = true; ctx.eyeScale *= 1 + 0.3 * k; return false; }
    return DEATHS.fold(ctx, ct - 0.22, o);
  },
});

// ── 15. TWIGLET ───────────────────────────────────────────────────────────────────────────────────────────────
species('twiglet', {
  name: 'Twiglet', family: 'plant',
  // sincerely believes you cannot see it: eyes wide and still, then one worried blink
  face: {
    wild: { lid: 0.12, tilt: 0, brow: [[0.22, -16], [0.2, -14]], look: [0, 0], glance: 0.15, glancePeriod: 6.5, mouth: 'line' },
    windup: { lid: 0.5, tilt: 20, brow: [[-0.1, 26], [-0.1, 26]], mouth: 'grimace' },
    recover: { lid: 0.16, tilt: 0, mouth: 'line' },
    friend: { lid: 0, tilt: -6, brow: [[0.28, -12], [0.28, -12]], mouth: 'beam' },
  }, color: MON.bark, noBlinkWhileRigid: true,
  build(B) {
    const base = 0.1;
    B.setBone('body', [0, base, 0]);
    const rs = rng(1515);
    const bark = C3(MON.bark), barkL = C3(MON.barkLight), barkD = C3(MON.barkDark);
    // nine chunky sticks in a bundle, each on its own bone (pivot at its foot) so the death can scatter them
    const ring = [[0, 0]];
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU; ring.push([Math.sin(a) * 0.086, Math.cos(a) * 0.086]); }
    ring.forEach(([x, z], i) => {
      const h = 0.44 + (rs() - 0.5) * 0.09 + (i === 0 ? 0.05 : 0), r0 = 0.034 + rs() * 0.006;
      const tx = (rs() - 0.5) * 0.14 * (i ? 1 : 0.4), tz = (rs() - 0.5) * 0.1, ox = (rs() - 0.5) * 0.012, oz = (rs() - 0.5) * 0.012;
      const p = [x + ox, base, z + oz];
      const bone = B.bone('s' + i, 'body', p);
      const g = new THREE.CylinderGeometry(r0 * 0.86, r0, h, 10, 4); g.translate(0, h / 2, 0);
      const bend = (rs() - 0.5) * 0.03;
      { const q = g.attributes.position; for (let k = 0; k < q.count; k++) q.setX(k, q.getX(k) + bend * Math.sin(Math.PI * q.getY(k) / h)); }
      const tone = 0.9 + rs() * 0.2, yaw = rs() * TAU;
      const m = MT(p, [tz, yaw, tx]);
      B.toon(g, { m, bone, color: MON.bark, outline: 0.011, vcol: (xx, yy, zz, ny, tmp, nx, nz) => tmp.copy(bark).multiplyScalar(tone).lerp(barkD, 0.45 * smooth(0.55, 0.95, Math.sin(Math.atan2(nx, nz) * 3 + yy * 9 + i))).lerp(barkL, 0.35 * smooth(0.4, 0.9, ny)) });
      // the cut end on top, pale with a ring
      const top = m.clone().multiply(MT([bend * 0, h, 0]));
      B.toon(new THREE.SphereGeometry(r0 * 0.86, 12, 5, 0, TAU, 0, Math.PI / 2), { m: top.clone().multiply(MT([0, -0.004, 0], [0, 0, 0], [1, 0.35, 1])), bone, color: MON.woodCut });
      B.unlit(new THREE.RingGeometry(r0 * 0.35, r0 * 0.5, 14).rotateX(-Math.PI / 2), { m: top.clone().multiply(MT([0, r0 * 0.86 * 0.35 - 0.002, 0])), bone, color: MON.woodRing });
      if (i % 3 === 1) { const c = new THREE.ConeGeometry(0.014, 0.07, 8); c.translate(0, 0.035, 0); B.toon(c, { m: m.clone().multiply(MT([0, h * (0.35 + rs() * 0.3), 0], [0, rs() * TAU, 1.0])).multiply(MT([r0 * 0.7, 0, 0])), bone, color: MON.bark }); }
      if (i % 4 === 2) B.toon(new THREE.SphereGeometry(0.013, 8, 6), { m: m.clone().multiply(MT([0, h * 0.6, 0], [0, rs() * TAU, 0])).multiply(MT([0, 0, r0 * 0.92])), bone, color: MON.barkDark });
    });
    // a leafy sprig out of the middle stick
    const sprig = B.bone('sprig', 's0', [0, base + 0.49, 0]);
    for (const [a, rz, len] of [[0.3, -0.55, 0.11], [2.4, 0.6, 0.09]]) {
      const lg = extrude(petalShape(len, 0.045, 0.3), 0.008, 0.003);
      B.toon(lg, { m: MT([0, base + 0.485, 0], [0.2, a, rz]), bone: sprig, color: MON.leaf, outline: 0.006, vcol: (x, y, z, ny, tmp) => tmp.copy(C3(PAL.foliage.mid)).lerp(C3(MON.leaf), smooth(base + 0.49, base + 0.56, y)) });
    }
    // twine bands, with a little bow at the front of the lower one
    const twine = B.bone('twine', 'body', [0, base + 0.25, 0]);
    for (const y of [base + 0.1, base + 0.385]) B.toon(new THREE.TorusGeometry(0.125, 0.016, 8, 30), { m: MT([0, y, 0], [Math.PI / 2, 0, 0], [1, 1.02, 1]), bone: twine, color: MON.twine, outline: 0.006 });
    for (const side of [-1, 1]) { const c = new THREE.TorusGeometry(0.022, 0.009, 6, 14); B.toon(c, { m: MT([side * 0.026, base + 0.1, 0.14], [0, side * 0.35, side * 0.5], [1.2, 0.8, 1]), bone: twine, color: MON.twine, outline: 0.004 }); }
    B.toon(new THREE.SphereGeometry(0.013, 8, 6), { m: MT([0, base + 0.1, 0.142]), bone: twine, color: MON.twine });
    // the face: googly eyes squeezed between the sticks, a slot of a mouth, a twig moustache that lifts when it speaks
    const face = B.bone('face', 'body', [0, base + 0.26, 0.12]);
    const fs = cylSurf(0.118, 0.118);
    B.eyes({ surf: fs, y: base + 0.275, gap: 0.104, r: 0.056, parent: face, forward: 0.006, pupil: 0.5 });
    B.faceMouths({ surf: fs, y: base + 0.185, w: 0.075, h: 0.028, parent: face, lift: 0.012, beam: 'line',
      kinds: ['line', 'beam', 'ow', 'dizzy', 'oh', 'worry', 'grimace'], colors: { in: MON.barkDark, line: MON.barkDark }, sizes: { line: [0.95, 0.5] } });
    const lip = B.bone('lip', face, [0.05, base + 0.215, 0.135]);
    B.toon(capsuleAB([-0.055, base + 0.212, 0.138], [0.058, base + 0.222, 0.132], 0.013, 3, 8), { bone: lip, color: MON.barkLight, outline: 0.005 });
    // the hiding twig: a leafy twig across one eye, because it is DEFINITELY hiding
    const hider = B.bone('hider', face, [-0.02, base + 0.16, 0.14]);
    B.toon(taperTube([[-0.02, base + 0.16, 0.14], [-0.05, base + 0.25, 0.165], [-0.085, base + 0.33, 0.17]], taper([[0, 0.013], [1, 0.007]]), 6, 12), { bone: hider, color: MON.bark, outline: 0.005 });
    B.toon(extrude(petalShape(0.07, 0.034, 0.3), 0.006, 0.002), { m: MT([-0.083, base + 0.325, 0.17], [0.1, 0, 0.55]), bone: hider, color: MON.leaf, outline: 0.005 });
    // two twig arms and two stick legs
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R', sh = [side * 0.115, base + 0.22, -0.01];
      const arm = B.bone('arm' + S, 'body', sh);
      B.toon(taperTube([sh, [side * 0.18, base + 0.26, 0.0], [side * 0.25, base + 0.33, 0.01]], taper([[0, 0.018], [1, 0.01]]), 7, 10), { bone: arm, color: MON.bark, outline: 0.006 });
      B.toon(taperTube([[side * 0.2, base + 0.28, 0.004], [side * 0.23, base + 0.26, 0.02], [side * 0.265, base + 0.265, 0.03]], taper([[0, 0.009], [1, 0.006]]), 6, 6), { bone: arm, color: MON.bark });
      if (side > 0) B.toon(extrude(petalShape(0.055, 0.028, 0.3), 0.006, 0.002), { m: MT([0.25, base + 0.33, 0.01], [0, 0, -0.5]), bone: arm, color: MON.leaf, outline: 0.004 });
      const hip = [side * 0.045, base + 0.02, 0.0];
      const leg = B.bone('leg' + S, 'root', hip);
      B.toon(capsuleAB(hip, [side * 0.07, 0.02, 0.025], 0.022, 3, 8), { bone: leg, color: MON.barkLight, outline: 0.007 });
      B.toon(new THREE.SphereGeometry(0.026, 10, 8), { m: MT([side * 0.075, 0.018, 0.04], [0, 0, 0], [1, 0.7, 1.4]), bone: leg, color: MON.barkDark, outline: 0.006 });
    }
    return { height: base + 0.52, radius: 0.2, shadow: 0.5 };
  },
  idle(ctx, t) {
    const w = ctx.idleW, b = ctx.b, P = 5.0, n = Math.floor(t / P), k = t - n * P;
    // absolutely rigid… except the eyes, which dart about to see whether you have noticed
    const looks = n % 2 ? [[0.35, -1], [1.2, 1], [1.95, 0.2], [2.6, -0.7]] : [[0.5, 1], [1.4, -1], [2.2, 0], [2.9, 1]];
    let look = 0, prev = 0; for (const [at, v] of looks) { look += (v - prev) * smooth(at, at + 0.07, k); prev = v; }
    look *= 1 - smooth(3.15, 3.3, k);
    for (const e of ['eyeL', 'eyeR']) if (b[e]) b[e].rotation.y += 0.42 * look * w;
    // the scratch: one twig reaches round to its back — bliss — then it FREEZES again
    const sc = smooth(3.25, 3.45, k) * (1 - smooth(4.05, 4.25, k)), osc = Math.sin(TAU * 8 * k);
    if (b.armR) { b.armR.rotation.z += 1.5 * sc * w; b.armR.rotation.y -= 1.0 * sc * w; b.armR.rotation.x += 0.28 * osc * sc * w; }
    b.body.rotation.z += 0.045 * osc * sc * w;
    b.body.rotation.y -= 0.12 * sc * w;
    if (b.legL) b.legL.rotation.z -= 0.3 * sc * w * (0.6 + 0.4 * osc);
    ctx.lids[0] = ctx.lids[1] = 0.55 * sc * w;
    if (b.sprig) b.sprig.rotation.z += 0.3 * sc * osc * w;
    const fr = hump(k, 4.22, 4.5);
    b.body.scale.multiply(V3(1 + 0.06 * fr * w, 1 - 0.08 * fr * w, 1 + 0.06 * fr * w));
    ctx.eyeScale *= 1 + 0.28 * fr * w;
    // the leaves don't know they are supposed to be keeping still
    if (b.sprig) { b.sprig.rotation.z += 0.1 * Math.sin(t * 4.1) * w; b.sprig.rotation.x += 0.07 * Math.sin(t * 2.7); }
    if (b.hider) b.hider.rotation.z += 0.03 * Math.sin(t * 3.3) * w;
    b.body.scale.multiply(V3(1, 1 + 0.008 * Math.sin(TAU * t / 3.1) * w, 1));
  },
  attackPose(ctx, ct) {
    // Whippy Branch: the twig arm draws back and WHIPS
    const b = ctx.b, back = ct < 0.14 ? easeOutCubic(ct / 0.14) : 1 - seg(ct, 0.14, 0.24);
    const whip = hump(ct, 0.2, 0.46);
    if (b.armR) { b.armR.rotation.y += 0.9 * back - 1.9 * whip; b.armR.rotation.z += 0.5 * back + 0.3 * whip; }
    if (b.lip) b.lip.rotation.z += 0.3 * whip;
    ctx.lids[1] = 0.6 * whip;
  },
  castPose(ctx, ct) { const k = hump(ct, 0.15, 0.85); if (ctx.b.lip) { ctx.b.lip.position.y += 0.02 * Math.abs(Math.sin(ct * 30)) * k; ctx.b.lip.rotation.z += 0.2 * Math.sin(ct * 22) * k; } if (ctx.b.armL) ctx.b.armL.rotation.z -= 1.1 * k; if (ctx.b.armR) ctx.b.armR.rotation.z += 1.1 * k; },
  hurtPose(ctx, ct) {
    // the bundle splays with the knock and snaps back
    const k = hump(ct, 0, 0.32);
    for (let i = 1; i < 9; i++) { const s = ctx.b['s' + i]; if (!s) continue; const a = (i - 0.5) / 8 * TAU; s.rotation.z -= Math.sin(a) * 0.22 * k; s.rotation.x += Math.cos(a) * 0.22 * k; }
  },
  taunt(ctx, ct) {
    // Stand Very Still: it crouches, shuts its eyes very tight… and one eye peeks
    const b = ctx.b, k = smooth(0, 0.18, ct) * (1 - smooth(1.2, 1.4, ct));
    b.root.position.y -= 0.035 * k;
    if (b.legL) b.legL.scale.y *= 1 - 0.55 * k;
    if (b.legR) b.legR.scale.y *= 1 - 0.55 * k;
    if (b.armL) b.armL.rotation.z -= 0.9 * k;
    if (b.armR) b.armR.rotation.z += 0.9 * k;
    const peek = smooth(0.62, 0.7, ct) * (1 - smooth(0.98, 1.05, ct));
    ctx.lids[0] = k; ctx.lids[1] = k * (1 - peek * 0.85);
    b.body.rotation.z += 0.012 * Math.sin(ct * 70) * k * (1 - peek);
    return ct >= 1.4;
  },
  // CRUMBLE — the twine gives, and it falls apart into loose sticks that clatter
  defeat(ctx, ct, o) {
    const b = ctx.b;
    if (!o._sticks) { const r = rng(ctx.id.length * 97 + 11); o._sticks = Array.from({ length: 9 }, (_, i) => ({ a: (i ? (i - 0.5) / 8 * TAU : r() * TAU) + (r() - 0.5) * 0.9, d: 0.1 + r() * 0.22, dist: 0.12 + r() * 0.28, spin: (r() - 0.5) * 1.4 })); }
    if (ct < 0.12) { ctx.eyeScale *= 1.35; ctx.showOh = true; b.root.position.y += 0.05 * hump(ct, 0, 0.12); }
    if (b.twine) { b.twine.scale.multiplyScalar(Math.max(0.0001, 1 - seg(ct, 0.08, 0.22))); b.twine.position.y -= 0.1 * seg(ct, 0.08, 0.22); }
    if (ct > 0.09 && !o._snap) { o._snap = true; ctx.fx.sparkle(V3(0, 0.3, 0.15), 4, 0.3, { size: 0.06, life: 0.35, speed: 1.6 }); }
    const q = new THREE.Quaternion(), axis = V3();
    o._sticks.forEach((s, i) => {
      const bn = b['s' + i]; if (!bn) return;
      const tt = ct - s.d; if (tt <= 0) return;
      const fall = easeInQuad(clamp01(tt / 0.3)), after = Math.max(0, tt - 0.3);
      const bounce = 0.05 * Math.exp(-after * 8) * Math.abs(Math.sin(after * 24));
      axis.set(Math.cos(s.a), 0, -Math.sin(s.a));
      q.setFromAxisAngle(axis, 1.5 * fall + 0.12 * bounce / 0.05 * (after > 0 ? 0.3 : 0));
      bn.quaternion.premultiply(q);
      bn.rotation.y += s.spin * fall;
      bn.position.x += Math.sin(s.a) * s.dist * fall; bn.position.z += Math.cos(s.a) * s.dist * fall;
      bn.position.y += (0.03 - 0.1) * fall + bounce;
      if (after > 0 && !o['_c' + i]) { o['_c' + i] = true; if (i % 3 === 0) ctx.fx.puff(V3(Math.sin(s.a) * (s.dist + 0.2), 0.03, Math.cos(s.a) * (s.dist + 0.2)), 2, 0.1, 0.04, { color: PAL.dirt.light, up: 0.15, life: 0.3 }); }
    });
    for (const [n, side] of [['armL', -1], ['armR', 1], ['legL', -1], ['legR', 1]]) {
      const bn = b[n]; if (!bn) continue; const f = easeInQuad(seg(ct, 0.12, 0.42));
      bn.position.y -= (n.startsWith('arm') ? 0.3 : 0.08) * f; bn.position.x += side * 0.15 * f; bn.rotation.z -= side * 1.2 * f;
    }
    if (b.face) { const f = easeInQuad(seg(ct, 0.2, 0.55)); b.face.position.y -= 0.32 * f; b.face.position.z += 0.1 * f; b.face.scale.multiplyScalar(Math.max(0.0001, 1 - seg(ct, 0.75, 1.0))); }
    if (b.hider) { const f = seg(ct, 0.15, 0.5); b.hider.rotation.z += 1.6 * easeInQuad(f); b.hider.position.y -= 0.1 * f; }
    if (ct > 0.42 && !o._clatter) { o._clatter = true; ctx.fx.puff(V3(0, 0.05, 0.05), 7, 0.55, 0.07, { color: PAL.dirt.light, up: 0.2, life: 0.5 }); }
    ctx.shadowK = lerp(1, 1.3, seg(ct, 0.2, 0.5));
    if (ct >= 1.3 && !o._poof) { o._poof = true; ctx.fx.puff(V3(0, 0.08, 0.05), 9, 0.6, 0.09, { life: 0.5 }); ctx.fx.sparkle(V3(0, 0.15, 0.05), 6, 0.7, { size: 0.08, life: 0.6, up: 0.7 }); ctx.setVisible(false); ctx.emit('poof', o); }
    return ct >= 1.75;
  },
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 5d. ACT I STORY CREATURES — the Order's footsoldier and the manor's grief (MONSTER-BIBLE §6b)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** The Quietling rig: a small grey hooded robe, a porcelain mask, mitten hands. pose 'shh' | 'hark'. */
function quietlingRig(B, { pose = 'shh', sleepy = true } = {}) {
  const robe = C3(MON.robe), robeL = C3(MON.robeLight), robeS = C3(MON.robeShade);
  // the robe: a round bell, a soft scalloped hem
  const prof = smoothProfile([[0, 0], [0.2, 0.0], [0.262, 0.018], [0.27, 0.07], [0.252, 0.2], [0.222, 0.34], [0.2, 0.44], [0.17, 0.52], [0.1, 0.58], [0, 0.6]], 30);
  const rg = lathe(prof, 36);
  { const p = rg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y < 0.05) { const th = Math.atan2(x, z), k = 1 - y / 0.05; p.setY(i, y + 0.014 * k * (0.5 + 0.5 * Math.cos(th * 7))); } } }
  B.toon(rg, { color: MON.robe, outline: 0.016, vcol: (x, y, z, ny, tmp) => tmp.copy(robeS).lerp(robe, smooth(0.0, 0.25, y)).lerp(robeL, smooth(0.3, 0.6, y) * 0.5) });
  const surf = latheSurf(prof);
  // rope belt with a knot and two tassels
  const beltY = 0.31, br = surf.r(beltY, 0) + 0.008;
  B.toon(new THREE.TorusGeometry(br, 0.017, 8, 34), { m: MT([0, beltY, 0], [Math.PI / 2, 0, 0], [1, 1, 1]), color: MON.rope, outline: 0.005 });
  const knotP = surfPoint(surf, beltY, 0.45, 0.02);
  B.toon(new THREE.SphereGeometry(0.026, 10, 8), { m: MT([knotP.x, knotP.y, knotP.z]), color: MON.rope, outline: 0.005 });
  const tassel = B.bone('tassel', 'body', [knotP.x, knotP.y, knotP.z]);
  for (const dx of [-0.018, 0.02]) { B.toon(capsuleAB([knotP.x + dx * 0.5, knotP.y - 0.01, knotP.z + 0.01], [knotP.x + dx, knotP.y - 0.12, knotP.z + 0.03], 0.009, 3, 6), { bone: tassel, color: MON.rope }); B.toon(new THREE.SphereGeometry(0.016, 8, 6), { m: MT([knotP.x + dx, knotP.y - 0.13, knotP.z + 0.03]), bone: tassel, color: MON.rope }); }
  // the hood, with a floppy nightcap tip (the Order's footsoldiers are very, very tired)
  const head = B.bone('head', 'body', [0, 0.5, 0.0]);
  const hc = [0, 0.64, 0], HR = [0.205, 0.215, 0.205];
  const hood = new THREE.SphereGeometry(1, 30, 20, 0, TAU, 0, Math.PI * 0.64);
  B.toon(hood, { m: MT(hc, [0, 0, 0], HR), bone: head, color: MON.robe, outline: 0.016, vcol: (x, y, z, ny, tmp) => tmp.copy(robe).lerp(robeL, smooth(0.62, 0.84, y) * 0.55) });
  const hs = ellSurf(HR[0], HR[1], HR[2], hc);
  B.unlit(wrapOn(discGeo(0.14, 0.15, 26, 6), hs, 0.625, 0, 0.002), { bone: head, color: MON.hood });
  B.toon(new THREE.TorusGeometry(0.143, 0.026, 10, 32), { m: MT([0, 0.625, 0.162], [-0.12, 0, 0], [1, 1.07, 0.7]), bone: head, color: MON.robe, outline: 0.008, vcol: (x, y, z, ny, tmp) => tmp.copy(robeL).lerp(robe, 0.35) });
  const tipBase = [0, 0.83, -0.05];
  const t0 = B.bone('tip0', head, tipBase), t1 = B.bone('tip1', t0, [0, 0.9, -0.12]), t2 = B.bone('tip2', t1, [0, 0.9, -0.2]);
  const cone = lathe(smoothProfile([[0, 0], [0.11, 0.0], [0.095, 0.07], [0.06, 0.15], [0.03, 0.21], [0, 0.24]], 14), 20);
  const cm = MT(tipBase, [-1.05, 0, 0.08]);
  const tipEnd = V3(0, 0.24, 0).applyMatrix4(cm);
  B.toon(cone, { m: cm, bone: t0, color: MON.robe, outline: 0.012, weights: chainWeights(tipBase, [tipEnd.x, tipEnd.y, tipEnd.z], [t0, t1, t2]), vcol: (x, y, z, ny, tmp) => tmp.copy(robeL).lerp(robe, 0.4) });
  B.toon(new THREE.SphereGeometry(0.038, 12, 10), { m: MT([tipEnd.x, tipEnd.y - 0.01, tipEnd.z - 0.01]), bone: t2, color: MON.robeLight, outline: 0.008 });
  // the porcelain mask (on its own bone, glued to the head, so it can sit on the folded robe at the end)
  const maskBase = B.bone('maskBase', 'root', [0, 0.5, 0.0]);
  const mc = [0, 0.625, 0.14], MR = [0.118, 0.13, 0.062];
  const maskG = new THREE.SphereGeometry(1, 26, 16, 0, TAU, 0, Math.PI * 0.42); maskG.rotateX(Math.PI / 2);
  B.toon(maskG, { m: MT(mc, [0, 0, 0], MR), bone: maskBase, color: MON.porcelain, outline: 0.008 });
  const ms = ellSurf(MR[0], MR[1], MR[2], mc);
  const eyes = [];
  for (const side of [-1, 1]) {
    const S = side < 0 ? 'L' : 'R', Y = 0.645, th = thetaFor(ms, Y, side * 0.043), c = surfPoint(ms, Y, th, 0.003);
    const name = B.bone('eye' + S, maskBase, [c.x, c.y, c.z]); B.meta.eyes.push(name); eyes.push(name);
    if (sleepy) {
      const slit = new THREE.Shape(); slit.moveTo(-0.03, 0.004); slit.quadraticCurveTo(0, -0.02, 0.03, 0.004); slit.quadraticCurveTo(0, 0.004, -0.03, 0.004);
      B.unlit(wrapOn(extrude(slit, 0.004, 0.003).rotateZ(side * -0.12), ms, Y, th, 0.004), { bone: name, color: MON.hood });
      B.unlit(wrapOn(discGeo(0.006, 0.006, 8, 1), ms, Y - 0.006, th + side * -0.06, 0.008), { bone: name, color: MON.white });
    } else {
      B.unlit(wrapOn(discGeo(0.022, 0.026, 16, 3), ms, Y, th, 0.004), { bone: name, color: MON.hood });
      B.unlit(wrapOn(discGeo(0.007, 0.007, 8, 1), ms, Y + 0.008, th + side * -0.08, 0.007), { bone: name, color: MON.white });
    }
  }
  for (const side of [-1, 1]) { const Y = 0.61, th = thetaFor(ms, Y, side * 0.075); B.unlit(wrapOn(discGeo(0.02, 0.011, 14, 2), ms, Y, th, 0.004), { bone: maskBase, color: mx(MON.porcelain, MON.blush, 0.45) }); }
  B.faceMouths({ surf: ms, y: 0.58, w: 0.045, h: 0.04, parent: maskBase, beam: 'oh', kinds: ['oh'], lift: 0.004, colors: { in: MON.hood, tongue: MON.hood } });
  B.gloss(ms, 0.675, -0.5, 0.026, 0.015, { bone: maskBase, rot: 0.8, dot: false, lift: 0.004 });
  // hands: one raised to the mask (a finger to the lips: shh — or cupped to the ear: hark), one at the side
  const handMain = B.bone('handMain', 'body', [-0.17, 0.44, 0.02]);
  if (pose === 'hark') {
    const hand = [-0.2, 0.62, 0.05];
    B.toon(capsuleAB([-0.17, 0.44, 0.02], [-0.215, 0.575, 0.03], 0.046, 4, 10), { bone: handMain, color: MON.robe, outline: 0.012 });
    B.toon(new THREE.SphereGeometry(0.055, 14, 10, 0, TAU, 0, Math.PI * 0.62), { m: MT(hand, [0.0, -0.4, -1.45], [1, 0.8, 1.05]), bone: handMain, color: MON.robeLight, outline: 0.008 });
  } else {
    const hand = [-0.035, 0.53, 0.225];
    B.toon(capsuleAB([-0.17, 0.44, 0.02], [-0.07, 0.505, 0.18], 0.046, 4, 10), { bone: handMain, color: MON.robe, outline: 0.012 });
    B.toon(new THREE.TorusGeometry(0.043, 0.013, 8, 18), { m: MT([-0.08, 0.508, 0.19], [0.9, 0.9, 0]), bone: handMain, color: MON.robeLight });
    B.toon(new THREE.SphereGeometry(0.048, 14, 10), { m: MT(hand, [0, 0, 0], [1, 0.9, 0.9]), bone: handMain, color: MON.robeLight, outline: 0.009 });
    B.toon(capsuleAB([hand[0] + 0.012, hand[1] + 0.03, hand[2] + 0.028], [hand[0] + 0.03, hand[1] + 0.1, hand[2] + 0.024], 0.014, 3, 8), { bone: handMain, color: MON.robeLight, outline: 0.006 });
  }
  const handOff = B.bone('handOff', 'body', [0.17, 0.44, 0.0]);
  B.toon(capsuleAB([0.17, 0.44, 0.0], [0.245, 0.3, 0.04], 0.046, 4, 10), { bone: handOff, color: MON.robe, outline: 0.012 });
  B.toon(new THREE.SphereGeometry(0.046, 14, 10), { m: MT([0.26, 0.26, 0.055]), bone: handOff, color: MON.robeLight, outline: 0.009 });
  return { height: 0.86, radius: 0.28, shadow: 0.62, eyes };
}
function quietlingIdle(ctx, t, { big = false } = {}) {
  const w = ctx.idleW, b = ctx.b;
  b.root.rotation.z += 3 * DEG * Math.sin(TAU * t / 2.9) * w;
  hop(ctx, t, { period: big ? 1.9 : 1.45, amp: big ? 0.02 : 0.04, squash: 0.7 });
  const P = 7.3, n = Math.floor(t / P), k = t - n * P;
  // nodding off… slowly… and then awake with a jerk
  const nod = k < 3.4 ? easeInQuad(seg(k, 0.6, 3.4)) : k < 3.55 ? 1 - easeOutCubic(seg(k, 3.4, 3.55)) : 0;
  const jerk = hump(k, 3.4, 3.8);
  if (b.head) b.head.rotation.x += (0.3 * nod - 0.08 * jerk) * w;
  ctx.lids[0] = ctx.lids[1] = 0.75 * nod * w;
  ctx.eyeScale *= 1 + 0.3 * jerk * w;
  b.root.position.y += 0.025 * jerk * w;
  // …and a huge yawn every other cycle: arms up, mask back, the hand forgets its shh
  if (n % 2 === 1) {
    const y = smooth(4.4, 4.9, k) * (1 - smooth(5.9, 6.4, k));
    b.body.scale.multiply(V3(1 - 0.04 * y * w, 1 + 0.09 * y * w, 1 - 0.04 * y * w));
    if (b.head) b.head.rotation.x -= 0.26 * y * w;
    if (b.handMain) { b.handMain.rotation.z -= 0.35 * y * w; b.handMain.rotation.x += 0.25 * y * w; }
    if (b.handOff) b.handOff.rotation.z += 1.5 * y * w;
    ctx.lids[0] = ctx.lids[1] = Math.max(ctx.lids[0], y * w);
    if (y > 0.35 && w > 0.5) ctx.showOh = true;
  }
  for (let i = 0; i < 3; i++) { const tb = b['tip' + i]; if (tb) { tb.rotation.x += 0.1 * Math.sin(TAU * (t - 0.12 * (i + 1)) / (big ? 1.9 : 1.45)) * w + 0.04 * nod; tb.rotation.z += 0.08 * Math.sin(t * 1.3 - i * 0.6) * w; } }
  if (b.tassel) b.tassel.rotation.z += 0.18 * Math.sin(TAU * t / 1.45 - 0.5) * w;
}
const QUIETLING_CLIPS = {
  attackPose(ctx, ct) {
    // Poke
    const b = ctx.b, k = hump(ct, 0.14, 0.42);
    if (b.handMain) { b.handMain.position.z += 0.1 * k; b.handMain.rotation.x -= 0.4 * k; }
    ctx.lids[0] = ctx.lids[1] = 0.4 * (1 - k);
  },
  castPose(ctx, ct) {
    // Shush: the finger to the lips, a big SHH, and rings of hush roll outward
    const b = ctx.b, k = hump(ct, 0.1, 0.9);
    if (b.handMain) b.handMain.position.z += 0.03 * k;
    if (b.head) b.head.rotation.x -= 0.1 * k;
    for (const at of [0.35, 0.55]) if (ct > at && !ctx['_shh' + at]) { ctx['_shh' + at] = true; ctx.fx.sparkle(ctx.center().add(V3(0, ctx.height * 0.25, ctx.radius)), 8, ctx.radius * 1.6, { ring: true, size: 0.05 * Math.sqrt(ctx.size), life: 0.7, speed: 0.9 * Math.sqrt(ctx.size), color: MON.robeLight, alt: MON.white }); }
    if (ct < 0.2) { ctx['_shh0.35'] = false; ctx['_shh0.55'] = false; }
  },
  taunt(ctx, ct) {
    // an enormous, contagious yawn
    const b = ctx.b, y = smooth(0, 0.35, ct) * (1 - smooth(1.0, 1.35, ct));
    b.body.scale.multiply(V3(1 - 0.05 * y, 1 + 0.11 * y, 1 - 0.05 * y));
    if (b.head) b.head.rotation.x -= 0.3 * y;
    if (b.handOff) b.handOff.rotation.z += 1.6 * y;
    if (b.handMain) { b.handMain.rotation.z -= 0.35 * y; b.handMain.rotation.x += 0.25 * y; }
    ctx.lids[0] = ctx.lids[1] = y;
    ctx.showOh = y > 0.3;
    return ct >= 1.4;
  },
  post(ctx, t, dt, clip) { if (!dying(clip)) glue(ctx, 'maskBase', ['body', 'head']); },
  // FOLD — the robe folds itself neatly, and the mask comes to rest on top
  defeat(ctx, ct, o) {
    const b = ctx.b;
    if (ct < 0.14) { ctx.eyeScale *= 1.35; ctx.showOh = true; b.root.position.y += 0.06 * hump(ct, 0, 0.14); glue(ctx, 'maskBase', ['body', 'head']); return false; }
    const f = easeInOutQuad(seg(ct, 0.14, 0.52)), f2 = easeInOutQuad(seg(ct, 0.5, 0.74));
    b.body.scale.multiply(V3(lerp(1, 1.02, f) * lerp(1, 0.6, f2), lerp(1, 0.15, f), lerp(1, 0.8, f)));
    for (const n of ['handMain', 'handOff', 'tassel', 'tip0']) if (b[n]) b[n].scale.multiplyScalar(Math.max(0.0001, 1 - f));
    const m = b.maskBase;
    if (m) {
      const d = easeInOutQuad(seg(ct, 0.2, 0.74)), rest = ctx.boneRest.maskBase;
      m.position.y += lerp(0, 0.115 - rest.y, d) + 0.05 * hump(ct, 0.2, 0.5);
      m.position.z -= 0.155 * d;
      m.rotation.x -= 1.42 * d;
      const settle = ct > 0.74 ? Math.exp(-(ct - 0.74) * 12) * Math.sin((ct - 0.74) * 30) : 0;
      m.rotation.z += 0.12 * settle; m.position.y += 0.012 * Math.abs(settle);
    }
    ctx.lids[0] = ctx.lids[1] = seg(ct, 0.5, 0.8);
    if (ct > 0.74 && !o._pat) { o._pat = true; ctx.fx.puff(V3(0, 0.03, 0), 5, 0.4, 0.05 * Math.sqrt(ctx.size), { color: PAL.dirt.light, up: 0.1, life: 0.35 }); }
    ctx.shadowK = lerp(1, 0.85, f);
    if (ct >= 1.3 && !o._poof) { o._poof = true; poof(ctx, o, { scale: 0.6, chunks: 0, at: V3(0, 0.1 * ctx.size, 0) }); }
    return ct >= 1.75;
  },
};
species('quietling', {
  // more sleepy than cruel: lids always half down, a yawn on the taunt
  face: {
    wild: { lid: 0.52, tilt: -6, brow: [[0.16, -12], [0.12, -10]], look: [0, -0.1], glance: 0.2, glancePeriod: 6 },
    windup: { lid: 0.7, tilt: 14, brow: [[-0.08, 18], [-0.08, 18]] },
    strike: { lid: 0.2, tilt: 10, eyeScale: 1.08 },
    recover: { lid: 0.55, tilt: -6 },
    friend: { lid: 0.1, tilt: -8, brow: [[0.26, -14], [0.26, -14]] },
  },
  name: 'Quietling', family: 'quiet', color: MON.robe, noBlink: false,
  build(B) { return quietlingRig(B, { pose: 'shh', sleepy: true }); },
  idle(ctx, t) { quietlingIdle(ctx, t); },
  ...QUIETLING_CLIPS,
});

// ── MUMBLEROOT THE GRUDGE (Act I boss, Cobwell Manor belfry) ─────────────────────────────────────────────────
species('mumbleroot', {
  // grief that grew roots: a low, slow glare that never quite looks at you
  face: {
    wild: { lid: 0.54, tilt: 16, brow: [[-0.1, 22], [-0.06, 18]], look: [0, -0.3], glance: 0.2, glancePeriod: 7, mouth: 'frown' },
    windup: { lid: 0.68, tilt: 26, brow: [[-0.2, 30], [-0.2, 30]], mouth: 'grimace' },
    recover: { lid: 0.54, tilt: 16, mouth: 'frown' },
    friend: { lid: 0.3, tilt: 0, brow: [[0.1, -4], [0.12, -6]], mouth: 'worry' },
  },
  name: 'Mumbleroot the Grudge', family: 'root', boss: true, story: true, color: MON.bark,
  build(B) {
    const bark = C3(MON.bark), barkL = C3(MON.barkLight), barkD = C3(MON.barkDark);
    const HC = [0, 1.47, 0.0], HR = 0.25, OL = 0.03;
    const head = B.bone('head', 'body', [0, 1.24, 0.0]);
    const woody = (x, y, z, ny, tmp, nx, nz) => tmp.copy(bark).lerp(barkD, 0.5 * smooth(0.5, 0.95, Math.sin(Math.atan2(nx, nz) * 5 + y * 13))).lerp(barkL, 0.45 * smooth(0.35, 0.9, ny));
    // eight roots rise from the floor, twist up through the coat and wrap the head, then droop like a willow
    const lons = [70, 290, 101, 259, 133, 227, 164, 196].map(d => d * DEG);
    const feet = [];
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) / 8 * TAU + (k % 2 ? 0.12 : -0.1);
      const at = (r, y, da = 0) => [Math.sin(a + da) * r, y, Math.cos(a + da) * r];
      const L = lons.slice().sort((p, q) => Math.abs(Math.atan2(Math.sin(p - a - 1.2), Math.cos(p - a - 1.2))) - Math.abs(Math.atan2(Math.sin(q - a - 1.2), Math.cos(q - a - 1.2))))[0];
      lons.splice(lons.indexOf(L), 1);
      const sp = (lat, lon, rr = HR + 0.03) => [HC[0] + Math.sin(lon) * Math.cos(lat) * rr, HC[1] + Math.sin(lat) * rr, HC[2] + Math.cos(lon) * Math.cos(lat) * rr];
      const pts = [at(0.7, 0.03), at(0.5, 0.06), at(0.3, 0.22, 0.25), at(0.17, 0.55, 0.55), at(0.13, 0.9, 0.85), at(0.12, 1.16, 1.1),
        sp(-40 * DEG, L - 0.25 * Math.sign(Math.sin(L))), sp(10 * DEG, L), sp(55 * DEG, L * 0.92 + 0.08 * Math.PI), sp(80 * DEG, L, HR + 0.02),
        [Math.sin(L) * 0.26, HC[1] + HR + 0.02, Math.cos(L) * 0.26], [Math.sin(L) * 0.38, HC[1] + 0.12, Math.cos(L) * 0.38]];
      const foot = B.bone('foot' + k, 'root', pts[1]); feet.push(foot);
      const rOf = taper([[0, 0.02], [0.08, 0.05], [0.2, 0.06], [0.5, 0.058], [0.72, 0.048], [0.9, 0.03], [1, 0.014]]);
      B.toon(taperTube(pts, rOf, 8, 64), { color: MON.bark, outline: OL, vcol: woody,
        weights: (x, y, z) => { const rad = Math.hypot(x, z), f = (1 - smooth(0.08, 0.2, y)) * smooth(0.36, 0.5, rad), h = smooth(1.2, 1.3, y); return [[foot, f], ['body', Math.max(0, 1 - f - h)], ['head', h]]; } });
    }
    // the knot: a trunk core, and the head core the roots are wound round
    B.toon(lathe(smoothProfile([[0, 0.12], [0.22, 0.14], [0.17, 0.4], [0.13, 0.8], [0.12, 1.15], [0, 1.2]], 16), 18), { color: MON.barkDark, vcol: woody });
    B.toon(new THREE.SphereGeometry(HR, 30, 22), { m: MT(HC), bone: head, color: MON.bark, outline: OL, vcol: woody });
    const hs = ellSurf(HR, HR, HR, HC);
    // two warm, sad, glowing eyes deep in the knot, sad root-brows over them, a small crack of a mouth
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R', Y = HC[1] + 0.015, th = thetaFor(hs, Y, side * 0.092), c = surfPoint(hs, Y, th, -0.01);
      const e = B.bone('eye' + S, head, [c.x, c.y, c.z]); B.meta.eyes.push(e);
      B.unlit(wrapOn(discGeo(0.07, 0.062, 20, 4), hs, Y, th, 0.003), { bone: head, color: MON.socket });
      const em = MT([c.x, c.y, c.z], [0, th, side * -0.3]);
      B.unlit(new THREE.SphereGeometry(0.044, 16, 12), { m: em.clone().multiply(MT([0, -0.004, 0.012], [0, 0, 0], [1, 0.78, 0.5])), bone: e, color: MON.glowstone });
      B.unlit(new THREE.SphereGeometry(0.012, 8, 6), { m: em.clone().multiply(MT([-side * 0.012 - 0.008, 0.012, 0.032], [0, 0, 0], [1, 1, 0.4])), bone: e, color: MON.white });
      B.trans(discGeo(0.1, 0.085, 20, 3), { m: MT([c.x, c.y, c.z + 0.02], [0, th, 0]), bone: e, color: MON.glowstone, alpha: 0.26 });
      B.toon(taperTube([sp2(hs, HC, Y + 0.085, side * 0.02), sp2(hs, HC, Y + 0.098, side * 0.09), sp2(hs, HC, Y + 0.07, side * 0.165)], taper([[0, 0.024], [1, 0.012]]), 7, 10), { bone: head, color: MON.barkLight, outline: 0.012 });
    }
    B.faceMouths({ surf: hs, y: HC[1] - 0.105, w: 0.105, h: 0.032, parent: head, beam: 'frown', lift: 0.004,
      kinds: ['frown', 'beam', 'grimace', 'shout', 'ow', 'dizzy', 'oh', 'worry'], colors: { in: MON.socket, line: MON.socket } });
    for (const [Y, th, r] of [[HC[1] + 0.17, -0.5, 0.035], [HC[1] - 0.06, 0.62, 0.028], [HC[1] + 0.12, 0.85, 0.024]]) { const p = surfPoint(hs, Y, th, -0.01); B.toon(new THREE.SphereGeometry(r, 10, 8), { m: MT([p.x, p.y, p.z]), bone: head, color: MON.barkDark, outline: 0.01 }); }
    // the battered top hat of a groom who waited
    const hatBase = B.bone('hatBase', 'root', [0, 1.24, 0.0]);
    const hatP = [0.06, HC[1] + HR - 0.02, -0.02];
    const hat = B.bone('hat', hatBase, hatP);
    const hm = MT(hatP, [-0.05, 0.2, -0.22]);
    B.toon(new THREE.CylinderGeometry(0.2, 0.21, 0.025, 28), { m: hm, bone: hat, color: MON.coat, outline: 0.012, vcol: (x, y, z, ny, tmp) => tmp.copy(C3(MON.coat)).lerp(C3(MON.coatLight), smooth(0.5, 1, ny) * 0.5) });
    B.toon(new THREE.CylinderGeometry(0.12, 0.13, 0.24, 26), { m: hm.clone().multiply(MT([0, 0.13, 0], [0, 0, 0.05])), bone: hat, color: MON.coat, outline: 0.012, vcol: (x, y, z, ny, tmp) => tmp.copy(C3(MON.coat)).lerp(C3(MON.coatLight), smooth(0.6, 1, ny) * 0.6) });
    B.toon(new THREE.CylinderGeometry(0.133, 0.134, 0.05, 26, 1, true), { m: hm.clone().multiply(MT([0, 0.045, 0], [0, 0, 0.05])), bone: hat, color: MON.wilt });
    // the groom's tail-coat: a round chest, lapels, shirt front, bow tie, two gold buttons, and a wilted buttonhole
    const coatBase = B.bone('coatBase', 'root', [0, 0, 0]);
    const cp = smoothProfile([[0.25, 0.72], [0.285, 0.8], [0.315, 0.93], [0.325, 1.05], [0.305, 1.16], [0.24, 1.23], [0.15, 1.27]], 22);
    const coatC = C3(MON.coat), coatL = C3(MON.coatLight);
    B.toon(lathe(cp, 36), { bone: coatBase, color: MON.coat, outline: OL, vcol: (x, y, z, ny, tmp) => tmp.copy(coatC).lerp(coatL, smooth(0.3, 0.95, ny) * 0.55 + smooth(1.0, 1.25, y) * 0.15) });
    const cs = latheSurf(cp);
    B.toon(new THREE.TorusGeometry(0.155, 0.045, 10, 30), { m: MT([0, 1.25, 0], [Math.PI / 2 - 0.12, 0, 0]), bone: coatBase, color: MON.coat, outline: 0.015 });
    const shirt = new THREE.Shape(); shirt.moveTo(-0.09, 0.12); shirt.lineTo(0.09, 0.12); shirt.lineTo(0.0, -0.13); shirt.lineTo(-0.09, 0.12);
    B.unlit(wrapOn(extrude(shirt, 0.004, 0.002), cs, 1.1, 0, 0.004), { bone: coatBase, color: MON.shirt });
    for (const side of [-1, 1]) {
      const lap = new THREE.Shape(); lap.moveTo(0, 0.13); lap.lineTo(side * 0.05, 0.13); lap.lineTo(side * 0.105, 0.02); lap.lineTo(side * 0.02, -0.14); lap.lineTo(0, 0.13);
      B.unlit(wrapOn(extrude(lap, 0.004, 0.002), cs, 1.1, side * 0.2, 0.007), { bone: coatBase, color: MON.satin });
    }
    for (const side of [-1, 1]) { const c = new THREE.ConeGeometry(0.035, 0.07, 10); c.rotateZ(side * Math.PI / 2); B.toon(c, { m: MT([side * 0.032, 1.215, 0.25], [0, 0, 0], [1, 1, 0.55]), bone: coatBase, color: MON.coat, outline: 0.006 }); }
    B.toon(new THREE.SphereGeometry(0.02, 10, 8), { m: MT([0, 1.215, 0.265]), bone: coatBase, color: MON.coat });
    for (const Y of [0.93, 0.82]) { const p = surfPoint(cs, Y, 0.0, 0.012); B.toon(new THREE.SphereGeometry(0.024, 12, 10), { m: MT([p.x, p.y, p.z], [0, 0, 0], [1, 1, 0.6]), bone: coatBase, color: MON.gold, outline: 0.006 }); }
    { const p = surfPoint(cs, 1.1, 0.46, 0.02); const fl = B.bone('flower', coatBase, [p.x, p.y, p.z]);
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const pg = discGeo(0.026, 0.017, 12, 2); pg.translate(0.02, 0, 0); B.toon(pg, { m: MT([p.x, p.y, p.z], [0.9, 0.46, a], [1, 1, 1]).multiply(MT([0, 0, 0], [0.5, 0, 0])), bone: fl, color: MON.wilt }); B.toon(pg.clone().rotateY(Math.PI), { m: MT([p.x, p.y, p.z], [0.9, 0.46, a]).multiply(MT([0, 0, 0], [0.5, 0, 0])), bone: fl, color: sc(MON.wilt, 0.85) }); }
      B.toon(new THREE.SphereGeometry(0.014, 8, 6), { m: MT([p.x, p.y, p.z + 0.01]), bone: fl, color: PAL.flower.center }); }
    // tails, split at the back
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R', top = [side * 0.1, 0.8, -0.27];
      const tail = B.bone('tail' + S, coatBase, top);
      const sh = new THREE.Shape(); sh.moveTo(-0.09, 0); sh.lineTo(0.09, 0); sh.quadraticCurveTo(0.08, -0.3, side * 0.03 + 0.02, -0.5); sh.lineTo(side * 0.03 - 0.05, -0.47); sh.quadraticCurveTo(-0.09, -0.25, -0.09, 0);
      B.toon(extrude(sh, 0.022, 0.01), { m: MT(top, [0.12, side * 0.28, 0]), bone: tail, color: MON.coat, outline: 0.012, vcol: (x, y, z, ny, tmp, nx, nz) => tmp.copy(coatC).lerp(coatL, smooth(0.2, 0.9, -nz) * 0.25) });
    }
    // sleeves (part of the coat) and knotted root fists hanging out of the cuffs
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R', sh = [side * 0.29, 1.13, 0.0], el = [side * 0.4, 0.88, 0.06], cu = [side * 0.39, 0.68, 0.14];
      const arm = B.bone('arm' + S, coatBase, sh), fore = B.bone('fore' + S, arm, el);
      B.toon(capsuleAB(sh, el, 0.085, 4, 14), { bone: arm, color: MON.coat, outline: 0.02, vcol: (x, y, z, ny, tmp) => tmp.copy(coatC).lerp(coatL, smooth(0.3, 1, ny) * 0.5) });
      B.toon(capsuleAB(el, cu, 0.075, 4, 14), { bone: fore, color: MON.coat, outline: 0.02, vcol: (x, y, z, ny, tmp) => tmp.copy(coatC).lerp(coatL, smooth(0.3, 1, ny) * 0.5) });
      B.toon(new THREE.TorusGeometry(0.065, 0.02, 8, 20), { m: MT([cu[0] * 0.99, cu[1] + 0.01, cu[2] - 0.01], [Math.PI / 2 - 0.3, 0, side * 0.05]), bone: fore, color: MON.shirt, outline: 0.006 });
      const hand = B.bone('hand' + S, fore, cu);
      B.toon(new THREE.SphereGeometry(0.075, 16, 12), { m: MT([cu[0], cu[1] - 0.07, cu[2] + 0.02], [0.3, 0, 0], [1, 1.1, 0.9]), bone: hand, color: MON.bark, outline: 0.018, vcol: woody });
      B.toon(taperTube([[cu[0], cu[1] - 0.12, cu[2] + 0.03], [cu[0] + side * 0.03, cu[1] - 0.22, cu[2] + 0.06], [cu[0] - side * 0.01, cu[1] - 0.3, cu[2] + 0.1], [cu[0] - side * 0.05, cu[1] - 0.27, cu[2] + 0.13]], taper([[0, 0.035], [1, 0.01]]), 7, 14), { bone: hand, color: MON.bark, outline: 0.012, vcol: woody });
    }
    return { height: 1.95, radius: 0.72, shadow: 1.6, color: MON.bark };
  },
  idle(ctx, t) {
    const w = ctx.idleW, b = ctx.b;
    // the sigh: a long breath in, a heavy breath out, the head bowing on it
    const P = 3.4, n = Math.floor(t / P), k = t - n * P;
    const inh = k < 2.5 ? easeInOutQuad(k / 2.5) : 1 - easeOutCubic((k - 2.5) / 0.9);
    b.body.scale.multiply(V3(1 + 0.022 * inh * w, 1 + 0.035 * inh * w, 1 + 0.022 * inh * w));
    if (b.head) { b.head.rotation.x += (0.1 - 0.13 * inh) * w; b.head.rotation.z += 0.05 * Math.sin(TAU * t / 5.1) * w; }
    for (const [S, side] of [['L', -1], ['R', 1]]) {
      if (b['arm' + S]) b['arm' + S].rotation.z += side * 0.05 * inh * w;
      if (b['fore' + S]) b['fore' + S].rotation.x -= (0.08 + 0.05 * Math.sin(TAU * t / 3.9 + side)) * w;
      if (b['hand' + S]) b['hand' + S].rotation.z += side * 0.12 * Math.sin(TAU * t / 2.7 + side) * w;
      if (b['tail' + S]) b['tail' + S].rotation.x += (0.06 + 0.05 * Math.sin(TAU * (t - 0.3) / 4.6 + side)) * w;
    }
    b.root.rotation.z += 2.2 * DEG * Math.sin(TAU * t / 4.6) * w;
    // the roots on the floor writhe, very slowly
    for (let i = 0; i < 8; i++) { const f = b['foot' + i]; if (!f) continue; const a = (i + 0.5) / 8 * TAU; f.rotation.y += 0.14 * Math.sin(t * 1.1 + i * 0.9) * w; f.rotation.x += -Math.cos(a) * 0.1 * (0.5 + 0.5 * Math.sin(t * 1.7 + i)) * w; f.rotation.z += Math.sin(a) * 0.1 * (0.5 + 0.5 * Math.sin(t * 1.7 + i)) * w; }
    // a mumbled breath on each out-breath
    if (k >= 2.55 && ctx._sighed !== n && w > 0.5) { ctx._sighed = n; ctx.fx.puff(V3(0, 1.36, 0.3), 3, 0.18, 0.055, { color: MON.breath, up: 0.35, life: 0.9 }); }
    ctx.eyeScale *= 1 + 0.06 * Math.sin(t * 2.3);
    ctx.showOh = k >= 2.5 && k < 2.85 && w > 0.5;
    if (b.hat) b.hat.rotation.z += 0.04 * Math.sin(t * 0.9) * w;
    if (b.flower) b.flower.rotation.x += 0.1 * Math.sin(t * 1.2) * w;
  },
  attackPose(ctx, ct) {
    // Bind: the front roots whip up off the floor and the root-fists reach
    const b = ctx.b, k = hump(ct, 0.12, 0.5);
    for (const i of [0, 7, 1, 6]) { const f = b['foot' + i]; if (!f) continue; const a = (i + 0.5) / 8 * TAU; f.rotation.x += -Math.cos(a) * 0.9 * k; f.rotation.z += Math.sin(a) * 0.9 * k; }
    for (const S of ['L', 'R']) { if (b['arm' + S]) b['arm' + S].rotation.x -= 0.8 * k; if (b['fore' + S]) b['fore' + S].rotation.x -= 0.5 * k; }
  },
  castPose(ctx, ct) {
    // Cold Draught: a long breath in, then out it blows, and the candles would go out
    const b = ctx.b, draw = hump(ct, 0.05, 0.45), blow = hump(ct, 0.4, 0.9);
    if (b.head) b.head.rotation.x -= 0.25 * draw - 0.2 * blow;
    b.body.scale.multiply(V3(1 + 0.04 * draw, 1 + 0.05 * draw, 1 + 0.04 * draw));
    ctx.showOh = ct > 0.4 && ct < 0.9;
    if (ct > 0.45 && !ctx._draught) { ctx._draught = true; for (let i = 0; i < 9; i++) ctx.fx.spawn('blob', { pos: V3((Math.random() - 0.5) * 0.1, 1.36, 0.32), vel: V3((Math.random() - 0.5) * 0.9, (Math.random() - 0.4) * 0.4, 2.2 + Math.random() * 1.2), drag: 1.6, life: 0.9, s0: 0.05, s1: 0.13, color: MON.breath, pop: true, delay: i * 0.04 }); }
    if (ct < 0.2) ctx._draught = false;
  },
  taunt(ctx, ct) {
    // mumbles: a slow grumbling no-no-no, fists trembling
    const b = ctx.b, k = smooth(0, 0.2, ct) * (1 - smooth(1.2, 1.5, ct));
    if (b.head) { b.head.rotation.y += 0.3 * Math.sin(ct * 7) * k; b.head.rotation.x += 0.12 * k; }
    for (const S of ['L', 'R']) if (b['hand' + S]) b['hand' + S].rotation.x += 0.08 * Math.sin(ct * 50) * k;
    ctx.lids[0] = ctx.lids[1] = 0.4 * k;
    if (ct > 0.3 && !ctx._mum) { ctx._mum = true; for (let i = 0; i < 3; i++) ctx.fx.puff(V3(0, 1.4, 0.32), 1, 0.05, 0.05, { color: MON.breath, up: 0.5, life: 0.7, delay: i * 0.25 }); }
    if (ct < 0.2) ctx._mum = false;
    return ct >= 1.5;
  },
  post(ctx, t, dt, clip) { if (!dying(clip)) { glue(ctx, 'coatBase', ['body']); glue(ctx, 'hatBase', ['body', 'head']); } },
  // UNWIND — the roots unwind into nothing and leave a plain black coat lying on the floor ({vanish:true} poofs it)
  defeat(ctx, ct, o) {
    mumbleGone(ctx, ct, o);
    return ct >= 1.9;
  },
  deadPose(ctx) { mumbleGone(ctx, 1.9, { _p: true, _thump: true, _glow: true, _rise: 99 }); },
});
function sp2(surf, c, Y, x) { const th = thetaFor(surf, Y, x); const p = surfPoint(surf, Y, th, 0.012); return [p.x, p.y, p.z]; }
function mumbleGone(ctx, ct, o) {
  const b = ctx.b;
  if (ct < 0.15) { ctx.eyeScale *= 1.3; ctx.showOh = true; b.body.scale.multiplyScalar(1 + 0.05 * hump(ct, 0, 0.15)); glue(ctx, 'coatBase', ['body']); glue(ctx, 'hatBase', ['body', 'head']); return; }
  const k = seg(ct, 0.15, 1.05);
  b.body.rotation.y += 9 * Math.PI * k * k;
  const sh = k >= 1 ? 0.0001 : Math.max(0.0001, 1 - easeInQuad(k));
  b.body.scale.multiply(V3(sh, k >= 1 ? 0.0001 : lerp(1, 0.5, easeInQuad(k)), sh));
  for (let i = 0; i < 8; i++) if (b['foot' + i]) b['foot' + i].scale.multiplyScalar(sh);
  for (const S of ['L', 'R']) if (b['hand' + S]) b['hand' + S].scale.multiplyScalar(Math.max(0.0001, 1 - easeInQuad(seg(ct, 0.15, 0.7))));
  const due = Math.floor(k * 8);
  if (ct < 1.05 && (o._rise ?? -1) < due) { o._rise = due; const a = k * 20; ctx.fx.sparkle(V3(Math.sin(a) * 0.4, 0.3 + k * 1.3, Math.cos(a) * 0.4), 2, 0.2, { size: 0.09, life: 0.5, up: 0.6, color: MON.glowstone, alt: MON.white }); }
  if (ct >= 1.0 && !o._glow) { o._glow = true; for (const side of [-1, 1]) ctx.fx.spawn('blob', { pos: V3(side * 0.09, 1.45, 0.25), vel: V3(side * 0.05, 0.5, 0.05), drag: 0.8, life: 1.0, s0: 0.05, s1: 0.0, color: MON.glowstone }); ctx.emit('poof', o); }
  // the coat is left behind: it hangs a moment, empty, then falls flat on its back, sleeves out
  const c = b.coatBase, d = easeInQuad(seg(ct, 0.75, 1.1));
  if (c) {
    const bounce = ct > 1.1 ? 0.18 * Math.exp(-(ct - 1.1) * 10) * Math.abs(Math.sin((ct - 1.1) * 24)) : 0;
    c.rotation.x = -Math.PI / 2 * d * (1 - 0.1 * bounce);
    c.scale.z *= lerp(1, 0.2, d);
    c.position.y += 0.08 * d + 0.06 * bounce;
    c.position.z += 0.72 * d;
    for (const [S, side] of [['L', -1], ['R', 1]]) { if (b['arm' + S]) b['arm' + S].rotation.z += side * 0.9 * d; if (b['tail' + S]) b['tail' + S].rotation.y -= side * 0.3 * d; }
  }
  const h = b.hatBase, hd = easeInQuad(seg(ct, 0.6, 1.0));
  if (h) {
    const rest = ctx.boneRest.hatBase;
    h.position.y += (0.12 - rest.y - 0.25) * hd + 0.25 * hump(ct, 0.6, 0.85);
    h.position.x += 0.55 * seg(ct, 0.6, 1.3); h.position.z += 0.35 * seg(ct, 0.6, 1.3);
    h.rotation.z -= 1.35 * hd; h.rotation.y += 1.2 * seg(ct, 0.6, 1.4);
  }
  if (ct >= 1.1 && !o._thump) { o._thump = true; ctx.fx.puff(V3(0, 0.05, 0.3), 9, 1.1, 0.12, { color: PAL.dirt.light, up: 0.2, life: 0.55 }); }
  ctx.shadowK = lerp(1, 0.9, d);
  if (o.vanish && ct > 1.45 && !o._vanish) { o._vanish = true; poof(ctx, o, { at: V3(0, 0.2, 0.3), chunks: 0 }); }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 5d. TIER THREE / FOUR / FIVE and the rest of the story creatures (MONSTER-BIBLE §3-§6b), built on the shared rigs
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════

// ── 31. GRIMALKITTEN — a cat-shaped hole in the light ─────────────────────────────────────────────────────────
species('grimalkitten', {
  name: 'Grimalkitten', family: 'cat', color: MON.shadow, death: 'wisp', winky: true,
  toon: { edge: 0.05, soft: 0.05, mid: 0.86, midEdge: 0.5, shadeSat: 1.05, rim: 0.4 },
  // purrs, and will sit on the map you are reading: slit eyes that widen when it pounces
  face: {
    wild: { lid: 0.44, tilt: 12, brow: [[0.0, 14], [0.18, -4]], look: [0.15, 0], glance: 0.7, glancePeriod: 2.8, mouth: 'cat' },
    windup: { lid: 0.62, tilt: 22, brow: [[-0.16, 28], [-0.16, 28]], mouth: 'grimace' },
    strike: { lid: 0, tilt: 8, brow: [[-0.08, 18], [-0.08, 18]], mouth: 'shout', eyeScale: 1.25 },
    recover: { lid: 0.4, tilt: 12, mouth: 'cat' },
    taunt: { eyes: 'shut', brow: [[0.24, -16], [0.24, -16]], mouth: 'shout' },          // the enormous yawn
    friend: { lid: 0.06, tilt: -6, brow: [[0.28, -10], [0.28, -10]], mouth: 'beam' },
  },
  build(B) {
    B.skin = MON.shadow;
    const r = catRig(B, { k: 1.6, mane: false, bell: false, whiskers: true,
      coat: { body: MON.shadow, dark: sc(MON.shadow, 0.72), muzzle: mx(MON.shadow, 'cloth.purple', 0.35), nose: mx('cloth.purple', 'flower.pink', 0.35), tooth: MON.white },
      eye: { pupilShape: 'slit', pupilColor: sc(MON.shadow, 0.5), sclera: MON.catEye, rim: 0.12 } });
    return { height: r.height, radius: r.radius * 1.2, shadow: r.radius * 3.4 };
  },
  idle(ctx, t) {
    catIdle(ctx, t, false);
    // it sits. The tail describes a slow S. Every 8 s: one enormous yawn.
    const k = t % 8.2;
    if (k > 7.2 && ctx.idleW > 0.5) { ctx.faceKey = 'taunt'; if (ctx.b.head) ctx.b.head.rotation.x -= 0.25 * hump(k, 7.2, 8.0); }
  },
  attackPose: catAttack,
  taunt: catRoar,
});

// ── B5b. HUSH & HARK, THE QUIET TWINS — Whistfell Abbey (Act III) ─────────────────────────────────────────────
const TWIN_FACE = {
  wild: { lid: 0.5, tilt: -4, brow: [[0.18, -12], [0.14, -10]], look: [0.2, -0.1], glance: 0.3, glancePeriod: 5 },
  windup: { lid: 0.68, tilt: 16, brow: [[-0.1, 20], [-0.1, 20]] },
  strike: { lid: 0.15, tilt: 10, eyeScale: 1.1 },
  recover: { lid: 0.52, tilt: -4 },
  friend: { lid: 0.08, tilt: -8, brow: [[0.26, -14], [0.26, -14]] },
};
species('hush', {
  name: 'Hush', family: 'quiet', boss: true, color: MON.robe, scale: 2.4, face: TWIN_FACE,
  build(B) { const r = quietlingRig(B, { pose: 'shh', sleepy: false }); return { height: r.height, radius: r.radius, shadow: r.shadow }; },
  idle(ctx, t) { quietlingIdle(ctx, t, { big: true }); },
  ...QUIETLING_CLIPS,
});
species('hark', {
  name: 'Hark', family: 'quiet', boss: true, color: MON.robe, scale: 2.4, face: TWIN_FACE,
  build(B) { const r = quietlingRig(B, { pose: 'hark', sleepy: false }); return { height: r.height, radius: r.radius, shadow: r.shadow }; },
  idle(ctx, t) { quietlingIdle(ctx, t + 1.7, { big: true }); },
  ...QUIETLING_CLIPS,
});

// ── 29. THUNDERPUFF — a small cloud with a big grudge and a lovely singing voice ──────────────────────────────
species('thunderpuff', {
  name: 'Thunderpuff', family: 'cloud', death: 'deflate', hover: 0.62, color: MON.cloud, winky: true,
  toon: { edge: 0.03, soft: 0.06, mid: 0.86, midEdge: 0.3, shadeSat: 1.0 },
  face: {
    wild: { lid: 0.42, tilt: 20, brow: [[-0.1, 26], [-0.06, 22]], look: [0, -0.05], glance: 0.35, glancePeriod: 3.4, mouth: 'frown' },
    windup: { lid: 0.66, tilt: 26, brow: [[-0.22, 32], [-0.22, 32]], mouth: 'grimace' },
    strike: { lid: 0.1, tilt: 18, brow: [[-0.12, 26], [-0.12, 26]], mouth: 'shout', eyeScale: 1.1 },
    recover: { lid: 0.44, tilt: 20, mouth: 'frown' },
    taunt: { lid: 0.2, tilt: -8, brow: [[0.3, -14], [0.3, -14]], look: [0, 0.2], mouth: 'beam', eyeScale: 1.1 },   // Fluff Up: enormously pleased
    friend: { lid: 0.04, tilt: -6, brow: [[0.28, -12], [0.28, -12]], mouth: 'beam' },
  },
  build(B) {
    const cy = 0.3;
    B.setBone('body', [0, cy, 0]);
    const lit = C3(MON.cloud), dark = C3(MON.cloudDark);
    // seven lumps merged into one cloud, dark underneath
    const lobes = [[0, 0.02, 0, 0.3], [-0.26, -0.02, 0.02, 0.22], [0.26, -0.01, 0.0, 0.23], [-0.14, 0.14, -0.04, 0.2], [0.15, 0.15, -0.03, 0.19], [-0.05, -0.06, 0.16, 0.18], [0.08, -0.07, -0.16, 0.17]];
    for (const [x, y, z, r] of lobes) {
      B.toon(new THREE.SphereGeometry(r, 20, 14), { m: MT([x, cy + y, z], [0, 0, 0], [1, 0.92, 1]), color: MON.cloud, outline: 0.018,
        vcol: (X, Y, Z, ny, tmp) => tmp.copy(dark).lerp(lit, smooth(cy - 0.2, cy + 0.12, Y)) });
    }
    const surf = ellSurf(0.3, 0.27, 0.3, [0, cy + 0.02, 0.02]);
    B.eyes({ surf, y: cy + 0.06, gap: 0.2, r: 0.075, forward: 0.006, browLift: 1.3, browColor: mx(MON.cloudDark, PAL.outline.char, 0.55), lid: MON.cloud });
    B.faceMouths({ surf, y: cy - 0.09, w: 0.15, h: 0.05, lift: 0.005, beam: 'beam',
      kinds: ['beam', 'frown', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'oh', 'worry'] });
    for (const side of [-1, 1]) B.toon(new THREE.SphereGeometry(0.055, 14, 10), { m: MT([side * 0.215, cy - 0.055, 0.17], [0, 0, 0], [1, 0.85, 0.8]), color: mx('flower.pink', 'cloud.lit', 0.5), outline: 0.008 });
    // the bolt it throws: a hard-edged zigzag, three frames long, never a particle system
    const bolt = B.bone('bolt', 'root', [0, cy, 0.5], 0);
    const zz = new THREE.Shape();
    zz.moveTo(-0.06, 0.5); zz.lineTo(0.05, 0.16); zz.lineTo(-0.02, 0.14); zz.lineTo(0.08, -0.28); zz.lineTo(-0.01, -0.06); zz.lineTo(-0.075, -0.02); zz.lineTo(-0.02, 0.2); zz.lineTo(-0.06, 0.5);
    B.unlit(extrude(zz, 0.02, 0.006), { m: MT([0, cy - 0.05, 0.42], [0, 0, 0], [1.6, 1.6, 1]), bone: bolt, color: MON.bolt });
    B.unlit(extrude(zz, 0.024, 0.004), { m: MT([0, cy - 0.05, 0.4], [0, 0, 0], [2.1, 1.75, 1]), bone: bolt, color: mx(MON.bolt, 'char.white', 0.6) });
    return { height: cy + 0.36, radius: 0.5, shadow: 0.95 };
  },
  idle(ctx, t) {
    // drifts in a slow figure eight, the lobes counter-rotating; every 6 s a flash inside and a distant rumble
    const w = ctx.idleW;
    const y = 0.62 + 0.05 * Math.sin(TAU * t / 3.1);
    ctx.b.root.position.y += y; ctx.hopY = y; ctx.hopMax = 0.67; ctx.flying = true;
    ctx.b.root.position.x += 0.16 * Math.sin(TAU * t / 6.2) * w;
    ctx.b.body.rotation.y += 0.1 * Math.sin(TAU * t / 5.3);
    ctx.b.body.rotation.z += 0.05 * Math.sin(TAU * t / 3.7);
    ctx.b.body.scale.multiply(V3(1 + 0.02 * Math.sin(t * 1.3), 1 - 0.02 * Math.sin(t * 1.3), 1));
    const k = t % 6;
    if (k < 0.12 && w > 0.5) { ctx.glow = 0.5 * (1 - k / 0.12); ctx.flash = Math.max(ctx.flash, 0.25 * (1 - k / 0.12)); }
  },
  attackPose(ctx, ct) {
    // Zapple: the bolt snaps into being for three frames at the impact
    const b = ctx.b.bolt;
    if (b) b.scale.setScalar(ct > 0.24 && ct < 0.33 ? 1 : 0.0001);
    if (ct > 0.24 && ct < 0.36) ctx.glow = 0.6;
    ctx.b.body.scale.multiply(V3(1 + 0.06 * hump(ct, 0.0, 0.2), 1 - 0.05 * hump(ct, 0.0, 0.2), 1));
  },
  castPose(ctx, ct) {
    const b = ctx.b.bolt;
    if (b) b.scale.setScalar(ct > 0.62 && ct < 0.72 ? 1.4 : 0.0001);
    if (ct > 0.6 && ct < 0.8) ctx.glow = Math.max(ctx.glow, 0.55);
  },
  taunt(ctx, ct) {
    // Fluff Up: it doubles in fluff and looks enormously pleased about it
    const k = ct < 0.3 ? easeOutBack(ct / 0.3, 2.4) : 1 - easeInOutQuad(seg(ct, 0.75, 1.05));
    ctx.b.body.scale.multiplyScalar(1 + 0.3 * k);
    ctx.b.root.position.y += 0.06 * k;
    if (ct > 0.28 && !ctx._fluff) { ctx._fluff = true; ctx.fx.puff(ctx.center(), 7, 0.6, 0.12, { color: MON.cloud, up: 0.4, life: 0.6 }); }
    if (ct < 0.1) ctx._fluff = false;
    return ct >= 1.1;
  },
  post(ctx, t, dt, clip) {
    if (clip === 'defeat' && !ctx.visible && !ctx._rain) {
      ctx._rain = true;
      // DEFLATE into rain — and then a tiny rainbow, which children will farm deliberately
      for (let i = 0; i < 18; i++) {
        const a = ctx.rand() * TAU, r = ctx.rand() * 0.45;
        ctx.fx.spawn('blob', { pos: V3(Math.cos(a) * r, 0.5 + ctx.rand() * 0.2, Math.sin(a) * r * 0.6), vel: V3(0, -1.2 - ctx.rand(), 0), grav: 3, life: 0.9, s0: 0.022, s1: 0.02, color: mx('water.mid', 'cloud.lit', 0.45), flat: 2.4, floor: 0.015, delay: ctx.rand() * 0.25 });
      }
      for (let i = 0; i < 9; i++) { const a = Math.PI * (i / 8); ctx.fx.spawn('star', { pos: V3(Math.cos(a) * 0.55, 0.06 + Math.sin(a) * 0.5, 0), vel: V3(0, 0, 0), life: 0.9, s0: 0.07, s1: 0.07, color: [PAL.flower.red, PAL.char.carrot, PAL.flower.yellow, PAL.grass.light, PAL.water.mid, PAL.cloth.purple, PAL.flower.pink][i % 7], delay: 0.5 + i * 0.03, twinkle: true }); }
    }
    if (clip !== 'defeat' && clip !== 'dead') ctx._rain = false;
  },
});

// ── 21. JINGLEBOTTOM — the jester (part one). One joke, told constantly, and he is having a lovely time ───────
function jesterRig(B, { k = 1, colA = MON.jestA, colB = MON.jestB, bells = 3, cracked = false, teeth = 0, grin = 0.14, hl = true }) {
  const K = (a) => a.map(v => v * k), th = 0.014 * Math.max(1, k * 0.8);
  // the harlequin body: the same lathe swept twice, one half each colour
  const prof = smoothProfile([[0, 0], [0.12, 0.02], [0.17, 0.1], [0.19, 0.3], [0.145, 0.44], [0.1, 0.54], [0.085, 0.57]], 24);
  for (const [phi, col] of [[0, colA], [Math.PI, colB]]) {
    B.toon(new THREE.LatheGeometry(prof.map(p => p.clone()), 18, phi, Math.PI), { m: MT([0, 0, 0], [0, 0, 0], k), color: col, outline: th,
      vcol: (x, y, z, ny, tmp) => tmp.copy(C3(col)).multiplyScalar(lerp(0.88, 1.05, smooth(0, 0.57 * k, y))) });
  }
  const surf = latheSurf(prof, { sx: k, sy: k, sz: k });
  // the scalloped ruff
  const ruffY = 0.55 * k;
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; B.toon(new THREE.SphereGeometry(0.062 * k, 12, 10), { m: MT([Math.sin(a) * 0.115 * k, ruffY, Math.cos(a) * 0.115 * k], [0, 0, 0], [1, 0.8, 1]), color: MON.cream, outline: th * 0.7 }); }
  // head + hat
  const head = B.bone('head', 'body', K([0, 0.62, 0]));
  const hc = [0, 0.71 * k, 0], hr = 0.16 * k;
  B.toon(new THREE.SphereGeometry(hr, 26, 18), { m: MT(hc), bone: head, color: MON.skinPale, outline: th, vcol: (x, y, z, ny, tmp) => tmp.copy(C3(MON.skinPale)).multiplyScalar(lerp(0.94, 1.04, smooth(hc[1] - hr, hc[1] + hr, y))) });
  const hs = ellSurf(hr, hr, hr, hc);
  // the painted diamonds round the eyes, then the eyes themselves
  const eyeY = hc[1] + 0.03 * k, gap = 0.13 * k, er = 0.058 * k;
  for (const side of [-1, 1]) {
    const thh = thetaFor(hs, eyeY, side * gap / 2);
    const dia = new THREE.Shape(); dia.moveTo(0, 0.095 * k); dia.lineTo(0.052 * k, 0); dia.lineTo(0, -0.105 * k); dia.lineTo(-0.052 * k, 0); dia.lineTo(0, 0.095 * k);
    B.unlit(wrapOn(flatGeo(dia, 0), hs, eyeY, thh, 0.002 * k), { bone: head, color: side < 0 ? colA : colB });
  }
  B.skin = MON.skinPale;
  B.eyes({ surf: hs, y: eyeY, gap, r: er, parent: head, forward: 0.002 * k, hl, browLift: 1.35, browColor: mx(MON.jestDark, PAL.outline.char, 0.4) });
  B.faceMouths({ surf: hs, y: hc[1] - 0.07 * k, w: grin * k, h: 0.036 * k, parent: head, lift: 0.002 * k,
    kinds: ['beam', 'smirk', 'fang', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'worry', 'oh'], sizes: teeth ? { smirk: [1, 1], fang: [1, 1.1] } : {} });
  // the hat: S-curved cones, each with a bell on a two-segment pendulum
  const hatBase = B.bone('hat', head, K([0, 0.86, 0]));
  for (let i = 0; i < bells; i++) {
    const a = (i - (bells - 1) / 2) * 0.62, lean = 0.5 + Math.abs(a) * 0.35;
    const bn = B.bone('bell' + i, hatBase, K([Math.sin(a) * 0.2, 0.96, Math.cos(a) * 0.1 - 0.04]));
    const c = new THREE.ConeGeometry(0.055 * k, 0.26 * k, 10); c.translate(0, 0.13 * k, 0);
    const cm = MT(K([0, 0.84, -0.01]), [-0.1, a, -a * lean * 1.4]);
    B.toon(c, { m: cm, bone: hatBase, color: i % 2 ? colB : colA, outline: th * 0.8 });
    const tip = V3(0, 0.26 * k, 0).applyMatrix4(cm);
    const bell = cracked && i === 2 ? new THREE.SphereGeometry(0.042 * k, 12, 10, 0, Math.PI * 1.8) : new THREE.SphereGeometry(0.042 * k, 12, 10);
    B.toon(bell, { m: MT([tip.x, tip.y, tip.z]), bone: bn, color: MON.gold, outline: th * 0.7 });
  }
  // arms and legs: striped capsules, oversized hands, curled-toe shoes
  for (const side of [-1, 1]) {
    const S = side < 0 ? 'L' : 'R';
    const arm = B.bone('arm' + S, 'body', K([side * 0.16, 0.46, 0.02]));
    B.toon(capsuleAB(K([side * 0.16, 0.46, 0.02]), K([side * 0.3, 0.3, 0.06]), 0.036 * k, 4, 10), { bone: arm, color: side < 0 ? colB : colA, outline: th * 0.8 });
    B.toon(new THREE.SphereGeometry(0.062 * k, 14, 10), { m: MT(K([side * 0.33, 0.26, 0.07])), bone: arm, color: MON.cream, outline: th * 0.8 });
    const leg = B.bone('leg' + S, 'root', K([side * 0.09, 0.2, 0]));
    B.toon(capsuleAB(K([side * 0.09, 0.2, 0]), K([side * 0.11, 0.06, 0.01]), 0.04 * k, 4, 10), { bone: leg, color: side < 0 ? colA : colB, outline: th * 0.8 });
    const shoe = lathe(smoothProfile([[0, 0], [0.05, 0.005], [0.055, 0.04], [0.03, 0.07], [0, 0.075]], 10), 14);
    B.toon(shoe, { m: MT(K([side * 0.11, 0.015, 0.05]), [-1.3, 0, 0], [k, k * 1.5, k]), bone: leg, color: side < 0 ? colB : colA, outline: th * 0.7 });
    B.toon(new THREE.SphereGeometry(0.028 * k, 10, 8), { m: MT(K([side * 0.11, 0.075, 0.12])), bone: leg, color: MON.gold, outline: th * 0.6 });
  }
  return { height: 1.06 * k, radius: 0.3 * k, shadow: 0.62 * k, surf };
}
function jesterIdle(ctx, t, { big = false } = {}) {
  const w = ctx.idleW, b = ctx.b, S = ctx.size;
  // weight foot to foot at 1.2 Hz, the three bells jingling a triplet (120 ms of lag each)
  const sh = Math.sin(TAU * 1.2 * t);
  b.root.position.x += 0.035 * sh * w * S * 0.5;
  b.root.rotation.z += 4 * DEG * sh * w;
  if (b.head) b.head.rotation.z -= 6 * DEG * sh * w;
  for (let i = 0; i < 5; i++) { const bn = b['bell' + i]; if (!bn) continue; const l = Math.sin(TAU * 1.2 * (t - i * 0.12)); bn.rotation.z += 0.3 * l * w; bn.rotation.x += 0.12 * Math.sin(TAU * 0.7 * t - i) * w; }
  if (b.armL) b.armL.rotation.z += (0.2 + 0.25 * sh) * w;
  if (b.armR) b.armR.rotation.z -= (0.2 - 0.25 * sh) * w;
  const y = hop(ctx, t, { period: 1 / 1.2, amp: big ? 0.02 : 0.035, squash: 0.6 });
  void y;
  // every 5 s: a cartwheel in place
  const P = 5, k = t % P;
  if (k < 0.9 && w > 0.5) {
    const f = easeInOutQuad(k / 0.9);
    ctx.mover.rotation.z += TAU * f;
    ctx.mover.position.y += 0.22 * S * Math.sin(Math.PI * f);
  }
}
species('jinglebottom', {
  name: 'Jinglebottom', family: 'jester', death: 'unwind', color: MON.jestA, winky: true,
  // one joke, told constantly. It is not a good joke.
  face: {
    wild: { lid: 0.3, tilt: 14, brow: [[0.02, 16], [0.26, -10]], look: [0.3, 0], glance: 0.7, glancePeriod: 2, mouth: 'smirk' },
    windup: { lid: 0.6, tilt: 22, brow: [[-0.14, 26], [-0.14, 26]], mouth: 'grimace' },
    strike: { lid: 0.08, tilt: 12, brow: [[0.1, 14], [0.1, 14]], mouth: 'shout', eyeScale: 1.1 },
    recover: { lid: 0.26, tilt: 14, mouth: 'smirk' },
    taunt: { eyes: ['happy', 'open'], lid: [1, 0.1], tilt: 8, brow: [[-0.06, 14], [0.36, -14]], look: [0.5, 0], mouth: 'tongue' },
    friend: { lid: 0, tilt: -4, brow: [[0.3, -10], [0.3, -10]], mouth: 'beam' },
  },
  build(B) { const r = jesterRig(B, { k: 1 }); return { height: r.height, radius: r.radius, shadow: r.shadow }; },
  idle(ctx, t) { jesterIdle(ctx, t); },
  attackPose(ctx, ct) {
    // Bell Bonk: he swings the whole hat at you
    const b = ctx.b, k = hump(ct, 0.08, 0.45);
    if (b.hat) { b.hat.rotation.x -= 1.2 * k; b.hat.rotation.z += 0.4 * Math.sin(ct * 30) * k; }
    if (b.armR) b.armR.rotation.x -= 1.6 * k;
    for (let i = 0; i < 5; i++) { const bn = b['bell' + i]; if (bn) bn.rotation.z += 1.1 * Math.sin(ct * 26 - i * 0.6) * k; }
  },
  castPose(ctx, ct) { const b = ctx.b, k = hump(ct, 0.1, 0.9); if (b.armL) b.armL.rotation.x -= 2.2 * k; if (b.armR) b.armR.rotation.x -= 2.2 * k; if (b.hat) b.hat.rotation.x -= 0.3 * k; },
});

// ── 26. MIRTHQUAKE — the jester (part two). Laughing at something that was not funny then either ─────────────
species('mirthquake', {
  name: 'Mirthquake', family: 'jester', boss: true, death: 'unwind', color: MON.jestDark, scale: 1.9, winky: false, noBlink: false,
  face: {
    // no highlight in the eye: the one monster in the book allowed to be wrong
    wild: { lid: 0.34, tilt: 20, brow: [[-0.06, 24], [0.2, -6]], look: [0, 0.05], glance: 0.2, glancePeriod: 4.5, mouth: 'fang' },
    windup: { lid: 0.62, tilt: 28, brow: [[-0.2, 32], [-0.2, 32]], mouth: 'grimace' },
    strike: { lid: 0.05, tilt: 18, brow: [[0.05, 20], [0.05, 20]], mouth: 'shout', eyeScale: 1.12 },
    recover: { lid: 0.3, tilt: 20, mouth: 'fang' },
    taunt: { eyes: 'shut', brow: [[-0.05, 22], [-0.05, 22]], mouth: 'shout' },     // the Belly Laugh
    friend: { lid: 0.08, tilt: 0, brow: [[0.28, -8], [0.28, -8]], mouth: 'beam' },
  },
  build(B) { const r = jesterRig(B, { k: 1, colA: MON.jestDark, colB: MON.jestGold, bells: 5, cracked: true, teeth: 4, grin: 0.22, hl: false }); return { height: r.height, radius: r.radius * 1.1, shadow: r.shadow * 1.1 }; },
  idle(ctx, t) {
    // holds his sides and shakes with silent laughter, 3 Hz, growing over 8 s, then resetting
    const w = ctx.idleW, b = ctx.b, P = 8, k = (t % P) / P;
    const amp = 0.3 + 0.7 * k;
    ctx.mover.rotation.z += 3 * DEG * Math.sin(TAU * 3 * t) * amp * w;
    ctx.b.root.position.y += 0.012 * Math.abs(Math.sin(TAU * 3 * t)) * amp * w * ctx.size;
    ctx.b.body.scale.multiply(V3(1 + 0.02 * amp * Math.sin(TAU * 3 * t), 1 - 0.02 * amp * Math.sin(TAU * 3 * t), 1));
    if (b.armL) { b.armL.rotation.z += 0.9 * w; b.armL.rotation.x -= 0.5 * w; }
    if (b.armR) { b.armR.rotation.z -= 0.9 * w; b.armR.rotation.x -= 0.5 * w; }
    if (b.head) b.head.rotation.x -= (0.12 + 0.08 * Math.sin(TAU * 3 * t)) * amp * w;
    for (let i = 0; i < 5; i++) { const bn = b['bell' + i]; if (bn) bn.rotation.z += 0.5 * Math.sin(TAU * 3 * (t - i * 0.1)) * amp * w; }
  },
  attackPose(ctx, ct) { const b = ctx.b, k = hump(ct, 0.08, 0.45); if (b.armR) { b.armR.rotation.x -= 2.0 * k; b.armR.rotation.z -= 0.6 * k; } if (b.hat) b.hat.rotation.x -= 0.8 * k; },
  taunt(ctx, ct) {
    // Belly Laugh: the ground shakes
    ctx.faceKey = 'taunt';
    const k = hump(ct, 0.05, 1.0), b = ctx.b;
    ctx.mover.rotation.z += 6 * DEG * Math.sin(ct * 40) * k;
    ctx.b.root.position.y += 0.05 * Math.abs(Math.sin(ct * 22)) * k * ctx.size;
    if (b.head) b.head.rotation.x -= 0.4 * k;
    if (ct > 0.2 && !ctx._quake) { ctx._quake = true; ctx.fx.puff(V3(0, 0.05, 0.4), 10, 1.2, 0.16, { color: PAL.dirt.light, up: 0.3, life: 0.7 }); }
    if (ct < 0.1) ctx._quake = false;
    return ct >= 1.15;
  },
});

// ── 20. DUNE BUGGY — a beetle the size of a footstool with racing stripes it painted on itself ────────────────
species('dune_buggy', {
  name: 'Dune Buggy', family: 'bug', death: 'topple', color: MON.chitin,
  face: {
    wild: { lid: 0.4, tilt: 16, brow: [[-0.04, 20], [0.0, 16]], look: [0, 0.05], glance: 0.5, glancePeriod: 2.4, mouth: 'smirk' },
    windup: { lid: 0.64, tilt: 24, brow: [[-0.18, 30], [-0.18, 30]], mouth: 'grimace' },
    strike: { lid: 0.1, tilt: 16, mouth: 'shout', eyeScale: 1.1 },
    recover: { lid: 0.38, tilt: 16, mouth: 'smirk' },
    friend: { lid: 0.02, tilt: -4, brow: [[0.28, -10], [0.28, -10]], mouth: 'beam' },
  },
  build(B) {
    const cy = 0.3, R = [0.37, 0.2, 0.46];
    B.setBone('body', [0, cy, 0]);
    const chit = C3(MON.chitin), lit = C3(MON.chitinLight);
    const shade = (x, y, z, ny, tmp) => tmp.copy(chit).lerp(lit, smooth(-0.1, 0.9, ny) * 0.75);
    // two elytra, hinged down the middle, that pop open when it burrows
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R';
      const el = B.bone('elytra' + S, 'body', [0, cy + 0.02, -0.05]);
      const half = new THREE.SphereGeometry(1, 22, 14, side < 0 ? Math.PI : 0, Math.PI, 0, Math.PI * 0.62);
      B.toon(half, { m: MT([0, cy, 0], [0, 0, 0], R), bone: el, color: MON.chitin, outline: 0.02, vcol: shade });
      const strip = roundBox(0.075, 0.03, 0.52, 0.012);
      B.toon(strip, { m: MT([side * 0.12, cy + 0.185, -0.02], [0.06, 0, side * 0.2], [1, 1, 1]), bone: el, color: MON.stripe, outline: 0.008 });
    }
    // the underside, so it reads when it topples onto its back
    B.toon(new THREE.SphereGeometry(1, 20, 10, 0, TAU, Math.PI * 0.5, Math.PI * 0.5), { m: MT([0, cy, 0], [0, 0, 0], [R[0] * 0.95, R[1], R[2] * 0.95]), color: sc(MON.chitin, 0.8), outline: 0.014 });
    // head, horns, headlamps
    const hc = [0, cy - 0.01, 0.42], hr = 0.14;
    const head = B.bone('head', 'body', hc);
    B.toon(new THREE.SphereGeometry(hr, 22, 16), { m: MT(hc, [0, 0, 0], [1.05, 0.9, 0.95]), bone: head, color: sc(MON.chitin, 0.92), outline: 0.016, vcol: shade });
    const hs = ellSurf(hr * 1.05, hr * 0.9, hr * 0.95, hc);
    for (const side of [-1, 1]) {
      const pts = [[side * 0.07, cy + 0.03, 0.5], [side * 0.1, cy + 0.1, 0.6], [side * 0.06, cy + 0.15, 0.7], [side * 0.02, cy + 0.16, 0.76]];
      B.toon(taperTube(pts, taper([[0, 0.032], [0.6, 0.02], [1, 0.006]]), 8, 14), { bone: head, color: MON.stripe, outline: 0.01 });
    }
    B.skin = sc(MON.chitin, 0.92);
    B.eyes({ surf: hs, y: cy + 0.03, gap: 0.14, r: 0.052, parent: head, forward: 0.004, browLift: 1.3, browColor: mx(MON.chitin, PAL.outline.char, 0.5) });
    B.faceMouths({ surf: hs, y: cy - 0.07, w: 0.08, h: 0.03, parent: head, kinds: ['beam', 'smirk', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'oh'] });
    for (const side of [-1, 1]) B.unlit(new THREE.CircleGeometry(0.055, 16), { m: MT([side * 0.17, cy + 0.06, 0.33], [0, side * 0.5, 0]), color: mx(MON.lamp, 'char.white', 0.3) });
    // six legs, three joints, in two alternating tripods
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1, j = i % 3, z = 0.2 - j * 0.22;
      const hip = [side * 0.24, cy - 0.04, z], knee = [side * 0.42, cy + 0.02, z + 0.04], foot = [side * 0.46, 0.02, z + 0.08];
      const leg = B.bone('leg' + i, 'root', hip);
      B.toon(taperTube([hip, [side * 0.34, cy - 0.02, z + 0.02], knee, [side * 0.46, cy * 0.5, z + 0.07], foot], taper([[0, 0.03], [0.5, 0.024], [1, 0.014]]), 8, 16), { bone: leg, color: sc(MON.chitin, 0.82), outline: 0.009 });
      B.toon(new THREE.SphereGeometry(0.024, 10, 8), { m: MT(foot), bone: leg, color: sc(MON.chitin, 0.82) });
    }
    B.gloss(ellSurf(R[0], R[1], R[2], [0, cy, 0]), cy + 0.13, -0.6, 0.1, 0.05, { rot: 1.1, dot: false });
    return { height: cy + 0.24, radius: 0.5, shadow: 1.05 };
  },
  idle(ctx, t) {
    const w = ctx.idleW, b = ctx.b, g = TAU * 0.9 * t;
    // the legs cycle even standing still, and the shell lifts and settles
    for (let i = 0; i < 6; i++) {
      const L = b['leg' + i]; if (!L) continue;
      const side = i < 3 ? -1 : 1, grp = ((i % 3) + (side > 0 ? 1 : 0)) % 2, sN = Math.sin(g + grp * Math.PI);
      L.rotation.x -= Math.max(0, sN) * 0.35 * w;
      L.rotation.y += side * 0.1 * Math.cos(g + grp * Math.PI) * w;
      if (Math.max(0, sN) > 0.95 && ctx.rand() < 0.02 && w > 0.5) ctx.fx.puff(V3(side * 0.46, 0.03, 0.2 - (i % 3) * 0.22), 2, 0.1, 0.03, { color: PAL.sand.mid, up: 0.1, life: 0.3 });
    }
    b.body.position.y += 0.02 * (0.5 + 0.5 * Math.sin(g)) * w;
    b.body.rotation.z += 0.03 * Math.sin(g * 0.5) * w;
    if (b.head) b.head.rotation.y += 0.12 * Math.sin(TAU * t / 3.7) * w;
  },
  attackPose(ctx, ct) {
    // Barge: head down, shell flat, and shove
    const b = ctx.b, k = hump(ct, 0.0, 0.3);
    if (b.head) b.head.rotation.x += 0.3 * k;
    b.body.rotation.x += 0.12 * k;
  },
  castPose(ctx, ct) {
    // Sandspray: the elytra pop open 30° and a sheet of sand goes up
    const b = ctx.b, k = hump(ct, 0.1, 0.8);
    if (b.elytraL) b.elytraL.rotation.z += 0.52 * k;
    if (b.elytraR) b.elytraR.rotation.z -= 0.52 * k;
    if (ct > 0.3 && !ctx._spray) { ctx._spray = true; for (let i = 0; i < 10; i++) ctx.fx.spawn('blob', { pos: V3((ctx.rand() - 0.5) * 0.5, 0.35, 0.3), vel: V3((ctx.rand() - 0.5) * 1.2, 1.4 + ctx.rand(), 1.6 + ctx.rand()), grav: 6, life: 0.7, s0: 0.035, s1: 0.02, color: PAL.sand.mid, floor: 0.01 }); }
    if (ct < 0.2) ctx._spray = false;
  },
  taunt(ctx, ct) {
    // Burrow: it digs in, vanishes to the eyebrows, and pops back out
    const k = hump(ct, 0.1, 0.95), b = ctx.b;
    ctx.b.root.position.y -= 0.3 * k;
    if (b.elytraL) b.elytraL.rotation.z += 0.4 * k;
    if (b.elytraR) b.elytraR.rotation.z -= 0.4 * k;
    ctx.shadowK = 1 - 0.5 * k;
    if (ct > 0.15 && !ctx._dig) { ctx._dig = true; ctx.fx.puff(V3(0, 0.05, 0.1), 9, 0.7, 0.1, { color: PAL.sand.mid, up: 0.5, life: 0.6 }); }
    if (ct < 0.1) ctx._dig = false;
    return ct >= 1.1;
  },
});

// ── 22. BARROWMOLE — a blind miner with a barrow, cross about the interruption, glad of the company ──────────
species('barrowmole', {
  name: 'Barrowmole', family: 'mole', death: 'pop', color: MON.mole, coins: true,
  face: {
    // it never opens its eyes… until the moment it decides to come with you
    wild: { lid: 1, tilt: -6, brow: [[0.06, 14], [0.02, 10]], look: [0, 0], glance: 0, mouth: 'line' },
    windup: { lid: 1, tilt: 16, brow: [[-0.16, 26], [-0.16, 26]], mouth: 'grimace' },
    strike: { lid: 1, tilt: 14, brow: [[-0.1, 22], [-0.1, 22]], mouth: 'shout' },
    recover: { lid: 1, tilt: -4, brow: [[0.04, 12], [0.02, 10]], mouth: 'line' },
    hurt: { eyes: 'shut', brow: [[0.16, -24], [0.16, -24]], mouth: 'ow' },
    stunned: { lid: 0.85, brow: [[0.24, -18], [0.24, -18]], mouth: 'oh' },
    taunt: { lid: 1, tilt: -8, brow: [[0.2, -14], [0.2, -14]], mouth: 'worry' },
    dizzy: { eyes: 'dizzy', brow: [[0.2, -16], [0.08, -8]], mouth: 'dizzy' },
    friend: { lid: 0.12, tilt: -8, brow: [[0.3, -16], [0.3, -16]], look: [0, 0.1], mouth: 'beam', eyeScale: 1.05 },
  },
  build(B) {
    const cy = 0.26, hy = 0.56;
    B.setBone('body', [0, 0.2, 0]);
    const mole = C3(MON.mole), moleL = C3(mx(MON.mole, 'plaster.light', 0.22));
    const fur = (x, y, z, ny, tmp) => tmp.copy(mole).lerp(moleL, smooth(cy - 0.24, hy + 0.1, y) * 0.8);
    B.toon(new THREE.CapsuleGeometry(0.19, 0.16, 8, 22), { m: MT([0, cy, -0.02], [0.08, 0, 0], [1, 1, 0.92]), color: MON.mole, outline: 0.016, vcol: fur });
    B.toon(new THREE.SphereGeometry(0.14, 18, 12), { m: MT([0, cy - 0.02, 0.13], [0, 0, 0], [1, 1.1, 0.45]), color: MON.moleBelly, outline: 0.01 });
    // the head: no neck, a big soft muzzle, and the eyes it never opens
    const head = B.bone('head', 'body', [0, hy - 0.07, 0]);
    const HR = 0.165;
    B.toon(new THREE.SphereGeometry(HR, 24, 18), { m: MT([0, hy, 0.01], [0, 0, 0], [1, 0.95, 1]), bone: head, color: MON.mole, outline: 0.016, vcol: fur });
    const surf = ellSurf(HR, HR * 0.95, HR, [0, hy, 0.01]);
    // the snout: it twitches at 3 Hz, because it is smelling you
    const snout = B.bone('snout', head, [0, hy - 0.02, 0.15]);
    const sn = new THREE.ConeGeometry(0.072, 0.13, 14); sn.rotateX(Math.PI / 2); sn.translate(0, 0, 0.065);
    B.toon(sn, { m: MT([0, hy - 0.025, 0.13]), bone: snout, color: mx(MON.moleBelly, 'flower.pink', 0.5), outline: 0.01 });
    B.toon(new THREE.SphereGeometry(0.028, 12, 10), { m: MT([0, hy - 0.025, 0.195], [0, 0, 0], [1.2, 0.8, 1]), bone: snout, color: mx('flower.pink', 'char.hair', 0.25), outline: 0.008 });
    B.skin = MON.mole;
    B.eyes({ surf, y: hy + 0.05, gap: 0.135, r: 0.048, parent: head, forward: 0.004, browLift: 1.3, browColor: mx(sc(MON.mole, 0.5), PAL.outline.char, 0.4) });
    B.faceMouths({ surf, y: hy - 0.095, w: 0.08, h: 0.028, parent: head, beam: 'line', kinds: ['line', 'beam', 'grimace', 'shout', 'ow', 'dizzy', 'worry', 'oh'], sizes: { line: [0.9, 0.5] } });
    // the miner's helmet, with a lamp — the only monster carrying a light
    const helm = new THREE.SphereGeometry(0.175, 20, 10, 0, TAU, 0, Math.PI * 0.52);
    B.toon(helm, { m: MT([0, hy + 0.075, -0.02], [-0.12, 0, 0], [1.08, 0.8, 1.08]), bone: head, color: MON.iron, outline: 0.014 });
    B.toon(new THREE.TorusGeometry(0.185, 0.016, 6, 24), { m: MT([0, hy + 0.072, -0.02], [Math.PI / 2 - 0.12, 0, 0], [1.02, 1.02, 1]), bone: head, color: sc(MON.iron, 0.85) });
    B.toon(new THREE.CylinderGeometry(0.03, 0.036, 0.05, 14), { m: MT([0, hy + 0.13, 0.1], [1.3, 0, 0]), bone: head, color: MON.brass, outline: 0.008 });
    B.unlit(new THREE.CircleGeometry(0.028, 16), { m: MT([0, hy + 0.14, 0.126], [-0.3, 0, 0]), bone: head, color: mx(MON.lamp, 'char.white', 0.4) });
    B.trans(new THREE.ConeGeometry(0.15, 0.46, 14, 1, true), { m: MT([0, hy + 0.22, 0.38], [1.35, 0, 0]), bone: head, color: MON.lamp, alpha: 0.16 });
    // claws
    for (const side of [-1, 1]) {
      const arm = B.bone(side < 0 ? 'armL' : 'armR', 'body', [side * 0.16, cy + 0.02, 0.06]);
      B.toon(new THREE.SphereGeometry(0.072, 14, 10), { m: MT([side * 0.19, cy, 0.1], [0, 0, side * 0.3], [1, 0.9, 1]), bone: arm, color: MON.mole, outline: 0.012 });
      for (const a of [-0.4, 0, 0.4]) { const c = new THREE.ConeGeometry(0.017, 0.07, 8); c.rotateX(Math.PI / 2); c.translate(0, 0, 0.037); B.toon(c, { m: MT([side * 0.19 + Math.sin(a) * 0.05, cy - 0.012, 0.145], [0.25, a, 0]), bone: arm, color: MON.cream, outline: 0.006 }); }
    }
    // the barrow: a tray, a wheel, two handles — and it squeaks
    const barrow = B.bone('barrow', 'root', [0, 0.16, -0.3]);
    B.toon(roundBox(0.34, 0.16, 0.28, 0.035), { m: MT([0, 0.24, -0.38], [0.18, 0, 0]), bone: barrow, color: MON.wood, outline: 0.014 });
    B.toon(roundBox(0.3, 0.02, 0.24, 0.01), { m: MT([0, 0.3, -0.36], [0.18, 0, 0]), bone: barrow, color: MON.woodDark });
    for (const c of [[-0.06, 0.32, -0.34], [0.05, 0.33, -0.39], [0.0, 0.335, -0.3]]) B.toon(new THREE.SphereGeometry(0.036, 12, 10), { m: MT(c, [0, 0, 0], [1, 0.7, 1]), bone: barrow, color: MON.stone, outline: 0.008 });
    B.toon(new THREE.TorusGeometry(0.1, 0.022, 8, 22), { m: MT([0, 0.1, -0.24], [0, Math.PI / 2, 0]), bone: barrow, color: MON.iron, outline: 0.01 });
    for (const side of [-1, 1]) B.toon(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 8), { m: MT([side * 0.13, 0.22, -0.46], [1.35, 0, 0]), bone: barrow, color: MON.wood, outline: 0.008 });
    return { height: hy + 0.24, radius: 0.34, shadow: 0.82 };
  },
  idle(ctx, t) {
    const w = ctx.idleW, b = ctx.b;
    // it pushes the barrow forward 0.1 and back, snuffling, the wheel squeaking
    const P = 2.6, k = Math.sin(TAU * t / P);
    ctx.b.root.position.z += 0.05 * k * w;
    b.body.rotation.x += 0.05 * (0.5 + 0.5 * k) * w;
    if (b.barrow) { b.barrow.position.z += 0.05 * k * w; b.barrow.rotation.z += 0.03 * Math.sin(TAU * t / P * 2) * w; }
    if (b.snout) { b.snout.rotation.x += 0.09 * Math.sin(TAU * 3 * t) * w; b.snout.position.z += 0.004 * Math.sin(TAU * 3 * t) * w; }
    if (b.armL) b.armL.rotation.x -= (0.15 + 0.1 * k) * w;
    if (b.armR) b.armR.rotation.x -= (0.15 + 0.1 * k) * w;
    hop(ctx, t, { period: P / 2, amp: 0.02, squash: 0.5 });
  },
  attackPose(ctx, ct) {
    // Shovel Swing: both claws up and over
    const b = ctx.b, up = ct < 0.2 ? easeOutCubic(ct / 0.2) : ct < 0.3 ? 1 - 1.6 * easeInQuad(seg(ct, 0.2, 0.3)) : -0.6 * (1 - seg(ct, 0.5, 0.75));
    for (const n of ['armL', 'armR']) if (b[n]) b[n].rotation.x -= 1.8 * up;
    if (b.snout) b.snout.rotation.x -= 0.2 * hump(ct, 0.2, 0.5);
  },
  castPose(ctx, ct) { const k = hump(ct, 0.1, 0.85); if (ctx.b.barrow) { ctx.b.barrow.rotation.x -= 0.5 * k; ctx.b.barrow.position.y += 0.06 * k; } },
});

// ── 23. CANDELABRACADABRA — learned magic by listening at the door, now dangerously overqualified ────────────
species('candelabracadabra', {
  name: 'Candelabracadabra', family: 'object', death: 'wisp', hover: 0.4, color: MON.brass,
  face: {
    wild: { lid: 0.42, tilt: 14, brow: [[0.0, 18], [0.22, -6]], look: [0.2, -0.15], glance: 0.35, glancePeriod: 4, mouth: 'smirk' },
    windup: { lid: 0.62, tilt: 24, brow: [[-0.16, 28], [-0.16, 28]], mouth: 'grimace' },
    strike: { lid: 0.08, tilt: 14, brow: [[0.1, 16], [0.1, 16]], mouth: 'shout', eyeScale: 1.12 },
    recover: { lid: 0.4, tilt: 14, mouth: 'smirk' },
    castIn: { lid: 1, tilt: 6, brow: [[-0.1, 16], [-0.1, 16]], mouth: 'oh' },
    castOut: { lid: 0, tilt: 12, brow: [[0.26, 10], [0.26, 10]], mouth: 'shout', eyeScale: 1.15 },
    friend: { lid: 0.04, tilt: -6, brow: [[0.3, -10], [0.3, -10]], mouth: 'beam' },
  },
  build(B) {
    const prof = smoothProfile([[0, 0], [0.14, 0.015], [0.09, 0.06], [0.062, 0.1], [0.08, 0.18], [0.05, 0.3], [0.105, 0.44], [0.1, 0.5], [0.045, 0.56], [0.055, 0.62], [0, 0.63]], 32);
    B.toon(lathe(prof, 26), { color: MON.brass, outline: 0.014,
      vcol: (x, y, z, ny, tmp) => tmp.copy(C3(sc(MON.brass, 0.85))).lerp(C3(mx(MON.brass, 'char.white', 0.25)), smooth(0.05, 0.55, y)) });
    const surf = latheSurf(prof);
    B.skin = MON.brass;
    B.eyes({ surf, y: 0.475, gap: 0.1, r: 0.043, forward: 0.006, browLift: 1.4, browLen: 1.4, browColor: mx(MON.darkGold, PAL.outline.char, 0.35) });
    B.faceMouths({ surf, y: 0.395, w: 0.08, h: 0.026, lift: 0.006, kinds: ['beam', 'smirk', 'grimace', 'shout', 'ow', 'dizzy', 'tongue', 'oh'] });
    // three arms, three candles, three flames — and never the same height
    const H = [0.24, 0.3, 0.2];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + 0.5, arm = B.bone('arm' + i, 'body', [Math.sin(a) * 0.18, 0.4, Math.cos(a) * 0.18]);
      B.toon(new THREE.TorusGeometry(0.15, 0.019, 8, 18, Math.PI * 0.8), { m: MT([Math.sin(a) * 0.02, 0.34, Math.cos(a) * 0.02], [0, a, -1.3]), bone: arm, color: MON.brass, outline: 0.009 });
      const cx = Math.sin(a) * 0.19, cz = Math.cos(a) * 0.19;
      B.toon(lathe(smoothProfile([[0, 0], [0.05, 0.0], [0.055, 0.025], [0.035, 0.03], [0.032, 0.05], [0, 0.05]], 10), 14), { m: MT([cx, 0.39, cz]), bone: arm, color: MON.brass, outline: 0.008 });
      B.toon(new THREE.CylinderGeometry(0.028, 0.03, H[i], 12), { m: MT([cx, 0.42 + H[i] / 2, cz]), bone: arm, color: MON.wax, outline: 0.008 });
      const fl = B.bone('flame' + i, arm, [cx, 0.44 + H[i], cz]);
      const cone = new THREE.ConeGeometry(0.035, 0.11, 10); cone.translate(0, 0.055, 0);
      B.unlit(cone, { m: MT([cx, 0.43 + H[i], cz]), bone: fl, color: MON.flame });
      const inner = new THREE.ConeGeometry(0.018, 0.06, 8); inner.translate(0, 0.03, 0);
      B.unlit(inner, { m: MT([cx, 0.44 + H[i], cz]), bone: fl, color: MON.flameCore });
      B.trans(new THREE.SphereGeometry(0.07, 12, 10), { m: MT([cx, 0.47 + H[i], cz]), bone: fl, color: MON.flame, alpha: 0.18 });
    }
    return { height: 0.78, radius: 0.24, shadow: 0.5 };
  },
  idle(ctx, t) {
    const w = ctx.idleW;
    const y = 0.4 + 0.03 * Math.sin(TAU * t / 2.6);
    ctx.b.root.position.y += y; ctx.hopY = y; ctx.hopMax = 0.43; ctx.flying = true;
    ctx.b.body.rotation.y += t * 0.21 * w;
    for (let i = 0; i < 3; i++) { const f = ctx.b['flame' + i]; if (!f) continue; const hz = [7.3, 8.1, 6.7][i]; f.scale.set(1 + 0.12 * Math.sin(hz * t), 1 + 0.22 * Math.sin(hz * t + 1), 1 + 0.12 * Math.sin(hz * t + 2)); f.rotation.z += 0.08 * Math.sin(hz * 0.4 * t); }
    // wax drips
    ctx._wax = (ctx._wax || 0) + (ctx.dt || 0);
    if (ctx._wax > 3 && w > 0.5) { ctx._wax = 0; const a = ctx.rand() * TAU; ctx.fx.spawn('blob', { pos: V3(Math.sin(a) * 0.19, 0.5 + ctx.b.root.position.y, Math.cos(a) * 0.19), vel: V3(0, -0.15, 0), grav: 2.4, life: 0.9, s0: 0.016, s1: 0.013, color: MON.wax, flat: 1.5, floor: 0.01 }); }
  },
  attackPose(ctx, ct) { for (let i = 0; i < 3; i++) { const f = ctx.b['flame' + i]; if (f) f.scale.multiplyScalar(1 + 1.1 * hump(ct, 0.1, 0.45)); } if (ct > 0.2 && ct < 0.4) ctx.glow = 0.5; },
  castPose(ctx, ct) {
    for (let i = 0; i < 3; i++) { const f = ctx.b['flame' + i]; if (f) f.scale.multiplyScalar(1 + 1.6 * hump(ct, 0.15, 0.85)); }
    if (ct > 0.55) ctx.glow = Math.max(ctx.glow, 0.6 * hump(ct, 0.55, 0.9));
    if (ct > 0.6 && !ctx._fire) { ctx._fire = true; for (let i = 0; i < 9; i++) { const a = ctx.rand() * TAU; ctx.fx.spawn('blob', { pos: V3(Math.sin(a) * 0.2, 0.62, Math.cos(a) * 0.2), vel: V3(Math.sin(a) * 0.5, 0.9 + ctx.rand() * 0.6, Math.cos(a) * 0.5 + 0.4), drag: 1.4, life: 0.6, s0: 0.05, s1: 0.02, color: i % 2 ? MON.flame : MON.flameCore }); } }
    if (ct < 0.3) ctx._fire = false;
  },
  post(ctx, t, dt, clip) {
    // WISP: the three flames blow out one by one, left, right, centre, and then the brass falls
    if (clip === 'defeat' || clip === 'dead') {
      const ct = ctx.spec._t || 0; void ct;
      for (let i = 0; i < 3; i++) { const f = ctx.b['flame' + i]; if (f) f.scale.multiplyScalar(Math.max(0.0001, 1 - clamp01((ctx.clipT || 0) * 3 - i * 0.6))); }
    }
  },
});

// ── 32. HEXCALIBUR — a sword that got tired of being held ─────────────────────────────────────────────────────
species('hexcalibur', {
  name: 'Hexcalibur', family: 'blade', death: 'unwind', hover: 0.75, color: MON.blade, noBlink: false,
  face: {
    // the face is in the guard: two ruby eyes and no mouth at all — its words simply appear
    wild: { lid: 0.44, tilt: 20, brow: [[-0.1, 26], [-0.06, 22]], look: [0.1, 0], glance: 0.3, glancePeriod: 3.4 },
    windup: { lid: 0.68, tilt: 28, brow: [[-0.22, 34], [-0.22, 34]] },
    strike: { lid: 0.0, tilt: 18, brow: [[-0.08, 24], [-0.08, 24]], eyeScale: 1.2 },
    recover: { lid: 0.42, tilt: 20 },
    friend: { lid: 0.06, tilt: -4, brow: [[0.26, -10], [0.26, -10]], eyeScale: 1.1 },
  },
  build(B) {
    // authored POINT-DOWN: the tip is at the bottom, the guard is the face, the grip and pommel are above it
    const GY = 0.86;
    B.setBone('body', [0, GY, 0]);
    const blade = new THREE.Shape();
    blade.moveTo(-0.07, 0); blade.lineTo(0.07, 0); blade.lineTo(0.062, -0.72); blade.quadraticCurveTo(0, -0.96, -0.062, -0.72); blade.lineTo(-0.07, 0);
    B.toon(extrude(blade, 0.042, 0.012), { m: MT([0, GY - 0.02, 0]), color: MON.blade, outline: 0.012,
      vcol: (x, y, z, ny, tmp) => tmp.copy(C3(MON.bladeDark)).lerp(C3(MON.blade), smooth(-0.4, 0.5, ny)).lerp(C3(MON.white), smooth(0.75, 1, ny) * 0.5) });
    const fuller = new THREE.Shape(); fuller.moveTo(-0.018, -0.06); fuller.lineTo(0.018, -0.06); fuller.lineTo(0.014, -0.68); fuller.lineTo(-0.014, -0.68); fuller.lineTo(-0.018, -0.06);
    B.toon(extrude(fuller, 0.05, 0.004), { m: MT([0, GY - 0.02, 0]), color: MON.bladeDark });
    // the guard: a crescent, and the eyes set into it
    const cres = new THREE.Shape();
    cres.moveTo(-0.3, -0.02); cres.quadraticCurveTo(0, -0.17, 0.3, -0.02); cres.quadraticCurveTo(0.34, 0.14, 0.24, 0.15); cres.quadraticCurveTo(0, 0.02, -0.24, 0.15); cres.quadraticCurveTo(-0.34, 0.14, -0.3, -0.02);
    B.toon(extrude(cres, 0.07, 0.014), { m: MT([0, GY, 0]), color: MON.darkGold, outline: 0.014 });
    // the face is painted on the flat front of the guard
    const gs = flatSurf(0.036, GY + 0.01);
    B.skin = MON.darkGold;
    B.eyes({ surf: gs, y: GY + 0.025, gap: 0.21, r: 0.058, forward: 0.004, pupil: 0.5, scleraColor: mx(MON.ruby, 'char.white', 0.42), pupilColor: sc(MON.ruby, 0.4),
      browLift: 1.15, browLen: 1.3, browColor: mx(MON.darkGold, PAL.outline.char, 0.5), rim: 0.13, lid: MON.darkGold });
    // grip + pommel, above the guard
    B.toon(new THREE.CylinderGeometry(0.035, 0.03, 0.2, 12), { m: MT([0, GY + 0.13, 0]), color: MON.wood, outline: 0.008 });
    for (let i = 0; i < 7; i++) B.toon(new THREE.TorusGeometry(0.037, 0.008, 6, 14), { m: MT([0, GY + 0.05 + i * 0.026, 0], [Math.PI / 2, 0, 0]), color: MON.darkGold });
    const pom = B.bone('pommel', 'body', [0, GY + 0.26, 0]);
    B.unlit(new THREE.OctahedronGeometry(0.055, 0), { m: MT([0, GY + 0.26, 0]), bone: pom, color: MON.ruby });
    B.trans(new THREE.SphereGeometry(0.1, 12, 10), { m: MT([0, GY + 0.26, 0]), bone: pom, color: MON.ruby, alpha: 0.2 });
    return { height: GY + 0.34, radius: 0.22, shadow: 0.42 };
  },
  idle(ctx, t) {
    // hangs point-down in the air, turning slowly on its own axis, bobbing; the pommel gem pulses
    const w = ctx.idleW;
    const y = 0.12 + 0.05 * Math.sin(TAU * t / 2.4);
    ctx.b.root.position.y += y; ctx.hopY = y; ctx.hopMax = 0.17; ctx.flying = true;
    ctx.b.body.rotation.y += t * 0.35 * w;
    ctx.b.body.rotation.z += 0.05 * Math.sin(TAU * t / 3.1) * w;
    const p = ctx.b.pommel;
    if (p) p.scale.multiplyScalar(1 + 0.12 * Math.sin(TAU * 0.5 * t));
    ctx.glow = 0.08 + 0.06 * Math.sin(TAU * 0.5 * t);
  },
  attackPose(ctx, ct) {
    // Rebuke: it turns point-first and stabs
    ctx.b.body.rotation.x -= 0.9 * hump(ct, 0.05, 0.5);
    ctx.b.body.rotation.y += 12 * ct * hump(ct, 0.1, 0.6);
    if (ct > 0.24 && ct < 0.34) ctx.glow = 0.6;
  },
  castPose(ctx, ct) { ctx.b.body.rotation.y += 10 * hump(ct, 0.1, 0.9); ctx.glow = Math.max(ctx.glow, 0.5 * hump(ct, 0.4, 0.9)); },
});

// ── 25. SIR CUMFERENCE — the roundest knight in the world, unfailingly courteous ──────────────────────────────
species('sir_cumference', {
  name: 'Sir Cumference', family: 'knight', death: 'topple', color: MON.steel, noBlink: true,
  face: {
    // two warm embers behind a visor that pings open a crack, because a knight does not stare
    wild: { lid: 0.4, tilt: 0, look: [0, 0], glance: 0.25, glancePeriod: 6 },
    windup: { lid: 0.66 }, strike: { lid: 0, eyeScale: 1.3 }, recover: { lid: 0.38 },
    hurt: { lid: 0.88, eyes: 'open', eyeScale: 0.85 }, stunned: { lid: 0.15, eyeScale: 1.1 },
    taunt: { lid: 0.3 }, castIn: { lid: 0.8 }, castOut: { lid: 0, eyeScale: 1.3 },
    dizzy: { lid: 0.7, eyes: 'open', eyeScale: 0.9 }, surprise: { lid: 0, eyeScale: 1.25 },
    happy: { lid: 0.3, eyeScale: 1.2 }, friend: { lid: 0.15, eyeScale: 1.15 },
  },
  build(B) {
    const steel = MON.steel, dark = MON.steelDark, lightS = MON.steelLight, cy = 0.66, R = 0.62;
    B.setBone('body', [0, cy, 0]);
    const shade = (x, y, z, ny, tmp) => tmp.copy(C3(dark)).lerp(C3(lightS), smooth(-0.5, 0.8, ny) * 0.85);
    B.toon(new THREE.SphereGeometry(R, 30, 22), { m: MT([0, cy, 0], [0, 0, 0], [1, 0.92, 1]), color: steel, outline: 0.03, vcol: shade });
    for (const [y, r] of [[cy + 0.26, 0.57], [cy - 0.02, 0.62], [cy - 0.3, 0.52]]) B.toon(new THREE.TorusGeometry(r, 0.018, 8, 34), { m: MT([0, y, 0], [Math.PI / 2, 0, 0], [1, 1, 1]), color: dark });
    // the helm: sunk into the body. No neck, ever.
    const helm = B.bone('helm', 'body', [0, cy + 0.5, 0]);
    const hp = smoothProfile([[0, 0], [0.2, 0.01], [0.225, 0.13], [0.21, 0.24], [0.15, 0.32], [0, 0.34]], 22);
    const hy = cy + 0.44;
    B.toon(lathe(hp, 26), { m: MT([0, hy, 0]), bone: helm, color: steel, outline: 0.024, vcol: shade });
    const hs = latheSurf(hp, { y: hy });
    // the visor: a slot on its own bone, so it can ping open a crack
    const visor = B.bone('visor', helm, [0, hy + 0.17, 0]);
    B.unlit(wrapOn(extrude(ovalShape(0.125, 0.026), 0.012, 0.004), hs, hy + 0.17, 0, 0.002), { bone: visor, color: MON.visor });
    B.skin = steel;
    const dots = [];
    for (const side of [-1, 1]) {
      const p = surfPoint(hs, hy + 0.17, side * 0.28, 0.006);
      const dot = B.bone(side < 0 ? 'eyeL' : 'eyeR', helm, [p.x, p.y, p.z]);
      B.meta.eyes.push(dot); dots.push(dot);
      B.unlit(new THREE.SphereGeometry(0.03, 10, 8), { m: MT([p.x, p.y, p.z], [0, side * 0.28, 0], [1, 1, 0.7]), bone: dot, color: MON.glowDot });
      B.trans(new THREE.CircleGeometry(0.07, 16), { m: MT([p.x, p.y, p.z + 0.006], [0, side * 0.28, 0]), bone: dot, color: MON.ember, alpha: 0.32 });
      B._eyeExtras(dot, { pos: [p.x, p.y, p.z], side, parent: helm, r: 0.032, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side * 0.28, 0)) }, { brows: false, decals: false, kind: 'glow' });
    }
    // the plume: five bent cones that trail
    const plume = B.bone('plume', helm, [0, hy + 0.36, -0.06]);
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.22, c = new THREE.ConeGeometry(0.045, 0.3 + (i % 2) * 0.08, 10); c.translate(0, 0.16, 0);
      B.toon(c, { m: MT([Math.sin(a) * 0.1, hy + 0.3, -0.05 + Math.cos(a) * 0.02], [-0.55 - Math.abs(a) * 0.3, 0, -a * 1.1], [1, 1, 0.5]), bone: plume, color: MON.cap, outline: 0.014 });
    }
    // arms that barely reach past the belly, and legs that are frankly a joke
    for (const side of [-1, 1]) {
      const arm = B.bone(side < 0 ? 'armR' : 'armL', 'body', [side * 0.6, cy + 0.12, 0.05]);
      B.toon(new THREE.CapsuleGeometry(0.1, 0.17, 6, 14), { m: MT([side * 0.63, cy + 0.02, 0.1], [0.3, 0, side * 0.5]), bone: arm, color: steel, outline: 0.02, vcol: shade });
      B.toon(new THREE.SphereGeometry(0.115, 16, 12), { m: MT([side * 0.7, cy - 0.14, 0.18]), bone: arm, color: dark, outline: 0.018 });
      const leg = B.bone(side < 0 ? 'legL' : 'legR', 'root', [side * 0.19, 0.16, 0]);
      B.toon(new THREE.CapsuleGeometry(0.085, 0.1, 5, 12), { m: MT([side * 0.19, 0.11, 0.02]), bone: leg, color: dark, outline: 0.016 });
      B.toon(roundBox(0.19, 0.08, 0.26, 0.035), { m: MT([side * 0.19, 0.045, 0.08]), bone: leg, color: steel, outline: 0.016, vcol: shade });
    }
    // the lance: comically longer than he is, with a spiral groove
    const lance = B.bone('lance', 'armR', [-0.7, cy - 0.14, 0.18]);
    const lm = MT([-0.72, cy - 0.12, 0.2], [1.25, -0.1, 0]);
    const shaft = new THREE.CylinderGeometry(0.03, 0.055, 1.7, 12); shaft.translate(0, 0.62, 0);
    B.toon(shaft, { m: lm, bone: lance, color: MON.cream, outline: 0.014 });
    for (let i = 0; i < 12; i++) B.toon(new THREE.TorusGeometry(0.046 - i * 0.0015, 0.008, 5, 12), { m: lm.clone().multiply(MT([0, 0.1 + i * 0.07, 0], [Math.PI / 2 + i * 0.1, 0, 0])), bone: lance, color: MON.cap });
    const tip = new THREE.ConeGeometry(0.065, 0.2, 12); tip.translate(0, 1.52, 0);
    B.toon(tip, { m: lm, bone: lance, color: MON.steelLight, outline: 0.012 });
    // the shield, with an engraved family crest of three circles
    const shield = B.bone('shield', 'armL', [0.7, cy - 0.14, 0.18]);
    const sh = new THREE.Shape(); sh.moveTo(-0.16, 0.17); sh.lineTo(0.16, 0.17); sh.quadraticCurveTo(0.175, -0.06, 0, -0.2); sh.quadraticCurveTo(-0.175, -0.06, -0.16, 0.17);
    B.toon(extrude(sh, 0.05, 0.014), { m: MT([0.72, cy - 0.06, 0.24], [0, 0.4, 0]), bone: shield, color: MON.cap, outline: 0.018 });
    for (const [dx, dy] of [[0, 0.06], [-0.06, -0.04], [0.06, -0.04]]) B.toon(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14), { m: MT([0.72 + dx, cy - 0.06 + dy, 0.27], [Math.PI / 2, 0.4, 0]), bone: shield, color: MON.gold, outline: 0.006 });
    return { height: cy + 0.8, radius: 0.8, shadow: 1.5 };
  },
  idle(ctx, t) {
    // rocks fore and aft like a weeble; the plume sways; every 6 s the visor pings open a crack and shuts
    const w = ctx.idleW, b = ctx.b;
    ctx.mover.rotation.x += 5 * DEG * Math.sin(TAU * t / 2.8) * w;
    ctx.b.body.scale.multiply(V3(1 + 0.008 * Math.sin(TAU * t / 2.8), 1 - 0.008 * Math.sin(TAU * t / 2.8), 1));
    if (b.plume) { b.plume.rotation.x += (0.08 + 0.1 * Math.sin(TAU * t / 2.4)) * w; b.plume.rotation.z += 0.05 * Math.sin(TAU * t / 3.1) * w; }
    if (b.lance) b.lance.rotation.x += 0.03 * Math.sin(TAU * t / 2.8 + 0.6) * w;
    const k = t % 6;
    if (b.visor && k < 0.4) { b.visor.position.y += 0.03 * hump(k, 0, 0.4) * w; b.visor.rotation.x -= 0.25 * hump(k, 0, 0.4) * w; }
  },
  attackPose(ctx, ct) {
    // Grand Charge: he leans the whole lance in — and then needs a moment to turn round again
    const b = ctx.b;
    const k = ct < 0.3 ? easeOutCubic(ct / 0.3) : 1 - seg(ct, 0.45, 0.75);
    if (b.lance) b.lance.rotation.x -= 0.9 * k;
    ctx.mover.rotation.x -= 0.12 * k;
    if (b.plume) b.plume.rotation.x -= 0.5 * k;
  },
  taunt(ctx, ct) {
    // Bow Politely. It raises nothing at all. It is very charming.
    const k = ct < 0.35 ? easeOutCubic(ct / 0.35) : 1 - easeInOutQuad(seg(ct, 0.6, 1.0));
    ctx.mover.rotation.x -= 0.4 * k;
    ctx.b.root.position.y -= 0.06 * k;
    if (ctx.b.plume) ctx.b.plume.rotation.x -= 0.9 * k;
    if (ctx.b.armL) ctx.b.armL.rotation.x -= 0.5 * k;
    return ct >= 1.15;
  },
});

// ── 27. LADY MOTHBONNET — still waiting for a partner. Will absolutely settle for you ────────────────────────
species('lady_mothbonnet', {
  name: 'Lady Mothbonnet', family: 'ghost', death: 'wisp', hover: 0.1, color: MON.ghostLit, ghost: true, transShadow: false,
  ghostOpacity: (t) => 0.84 + 0.08 * (0.5 + 0.5 * Math.sin(TAU * t / 3.4)),
  face: {
    wild: { lid: 0.38, tilt: -6, brow: [[0.22, -14], [0.18, -12]], look: [0.25, -0.1], glance: 0.3, glancePeriod: 4.6, mouth: 'worry' },
    windup: { lid: 0.62, tilt: 12, brow: [[-0.06, 18], [-0.06, 18]], mouth: 'grimace' },
    strike: { lid: 0.1, tilt: 8, brow: [[0.1, 12], [0.1, 12]], mouth: 'shout', eyeScale: 1.1 },
    recover: { lid: 0.36, tilt: -6, mouth: 'worry' },
    taunt: { lid: 0.5, tilt: -10, brow: [[0.26, -16], [0.26, -16]], look: [0.4, -0.2], mouth: 'smirk' },
    defeat: { eyes: 'happy', brow: [[0.24, -14], [0.24, -14]], mouth: 'worry' },
    dizzy: { eyes: 'happy', brow: [[0.24, -14], [0.24, -14]], mouth: 'worry' },
    friend: { lid: 0.05, tilt: -8, brow: [[0.26, -12], [0.26, -12]], mouth: 'beam' },
  },
  build(B) {
    // the gown: a tall bell with a scalloped hem
    const prof = smoothProfile([[0, 0], [0.34, 0.02], [0.4, 0.06], [0.33, 0.28], [0.24, 0.5], [0.185, 0.68], [0.16, 0.82], [0.13, 0.9]], 32);
    const g = lathe(prof, 40);
    { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(x, z), k = 1 - smooth(0.0, 0.2, y); const f = 1 + 0.1 * k * Math.sin(6 * th); p.setXYZ(i, x * f, y + k * 0.03 * Math.cos(6 * th), z * f); } g.computeVertexNormals(); }
    const lit = C3(MON.ghostLit), shade = C3(MON.ghostShade);
    const vcol = (x, y, z, ny, tmp) => tmp.copy(shade).lerp(lit, smooth(0.05, 0.75, y));
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; B.bone('hem' + i, 'body', [Math.sin(a) * 0.36, 0.03, Math.cos(a) * 0.36]); }
    const hemW = (x, y, z) => { const f = 1 - smooth(0.02, 0.34, y); if (f <= 0) return [['body', 1]]; let a = Math.atan2(x, z) / TAU * 8; a = (a % 8 + 8) % 8; const i0 = Math.floor(a) % 8, i1 = (i0 + 1) % 8, u = a - Math.floor(a); return [['body', 1 - f], ['hem' + i0, f * (1 - u)], ['hem' + i1, f * u]]; };
    B.trans(g, { color: MON.ghostLit, alpha: 1, weights: hemW, vcol });
    B.hull(g, { th: 0.016, color: mx(sc(MON.ghostLit, 0.62), PAL.outline.char, 0.3), weights: hemW });
    const surf = latheSurf(prof);
    // the moth wings on her back: still, except one slow flutter every nine seconds
    for (const side of [-1, 1]) {
      const wing = B.bone(side < 0 ? 'wingL' : 'wingR', 'body', [side * 0.1, 0.62, -0.1]);
      const sh = scallopWing(0.56, 0.4, 3);
      B.trans(extrude(sh, 0.012, 0.004), { m: MT([side * 0.08, 0.62, -0.13], [0.12, side < 0 ? Math.PI : 0, side * 0.42], [1, 1, 1]), bone: wing, color: mx(MON.ghostShade, 'cloth.purple', 0.35), alpha: 0.6 });
      for (const [dx, dy] of [[0.24, 0.1], [0.34, -0.02]]) { const d = discGeo(0.035, 0.035, 12, 2); B.unlit(d.clone().translate(side * dx, 0.6 + dy, -0.1 + side * 0.06), { bone: wing, color: mx(MON.eyespot, MON.ghostShade, 0.35) }); }
    }
    // the bonnet, with a ribbon
    const head = B.bone('head', 'body', [0, 0.86, 0]);
    const bon = lathe(smoothProfile([[0, 0], [0.16, 0.01], [0.175, 0.07], [0.15, 0.13], [0.07, 0.17], [0, 0.175]], 18), 24);
    B.toon(bon, { m: MT([0, 0.9, -0.01]), bone: head, color: mx(MON.ghostLit, 'cloth.purple', 0.12), outline: 0.014 });
    B.toon(new THREE.TorusGeometry(0.15, 0.016, 8, 26), { m: MT([0, 0.92, -0.01], [Math.PI / 2 - 0.1, 0, 0]), bone: head, color: mx('cloth.purple', 'cloud.lit', 0.45), outline: 0.006 });
    const rib = B.bone('ribbon', head, [-0.13, 0.9, -0.05]);
    B.trans(extrude(petalShape(0.3, 0.06, 0.4), 0.008, 0.003), { m: MT([-0.14, 0.86, -0.08], [0.3, -0.4, 2.6]), bone: rib, color: mx('cloth.purple', 'cloud.lit', 0.5), alpha: 0.8 });
    // the face: a dark oval with hole eyes and two pale glints, under the bonnet's brim
    const fs = ellSurf(0.14, 0.15, 0.1, [0, 0.86, 0.04]);
    B.unlit(wrapOn(discGeo(0.105, 0.115, 22, 5), fs, 0.86, 0, 0.004), { bone: head, color: mx(MON.ghostShade, 'char.hair', 0.2) });
    for (const side of [-1, 1]) {
      const Y = 0.885, th = thetaFor(fs, Y, side * 0.05), c = surfPoint(fs, Y, th, 0.006);
      const name = B.bone(side < 0 ? 'eyeL' : 'eyeR', head, [c.x, c.y, c.z]);
      B.meta.eyes.push(name);
      B.unlit(wrapOn(discGeo(0.034, 0.042, 16, 3), fs, Y, th, 0.008), { bone: name, color: mx('char.hair', 'cloth.purpleDark', 0.35) });
      B.unlit(wrapOn(discGeo(0.014, 0.016, 10, 2), fs, Y + 0.01, th + side * -0.06, 0.011), { bone: name, color: MON.white });
      B.unlit(wrapOn(discGeo(0.007, 0.008, 8, 1), fs, Y - 0.012, th + side * 0.05, 0.011), { bone: name, color: mx(MON.white, MON.iceBlue, 0.4) });
      B._eyeExtras(name, { pos: [c.x, c.y, c.z], side, parent: head, Y, th, x: side * 0.05, r: 0.036, lift: 0.008 },
        { surf: fs, brows: true, browColor: mx(MON.ghostShade, 'char.hair', 0.5), browLift: 1.2, browLen: 1.1, decalColor: mx(MON.ghostShade, 'char.hair', 0.7) });
    }
    B.faceMouths({ surf: fs, y: 0.8, w: 0.07, h: 0.03, parent: head, lift: 0.008,
      kinds: ['beam', 'worry', 'smirk', 'grimace', 'shout', 'ow', 'dizzy', 'oh'], colors: { in: mx(MON.ghostShade, 'char.hair', 0.7), line: mx(MON.ghostShade, 'char.hair', 0.7), tongue: mx('flower.pink', 'cloud.lit', 0.4) } });
    // thin sleeves ending in nothing, and the feather fan she raises when she casts
    for (const side of [-1, 1]) {
      const arm = B.bone(side < 0 ? 'armL' : 'armR', 'body', [side * 0.16, 0.66, 0.02]);
      B.trans(taperTube([[side * 0.17, 0.68, 0.02], [side * 0.24, 0.56, 0.08], [side * 0.26, 0.44, 0.12]], taper([[0, 0.05], [0.7, 0.036], [1, 0.012]]), 9, 14), { bone: arm, color: MON.ghostLit, alpha: 1, vcol });
    }
    const fan = B.bone('fan', 'armR', [0.26, 0.44, 0.12]);
    const fsh = new THREE.Shape(); fsh.moveTo(0, 0); fsh.absarc(0, 0, 0.19, 0.2, Math.PI - 0.2, false); fsh.lineTo(0, 0);
    B.trans(extrude(fsh, 0.008, 0.003), { m: MT([0.28, 0.46, 0.14], [0.2, -0.3, -0.5]), bone: fan, color: mx('cloud.lit', 'cloth.pink', 0.3), alpha: 0.85 });
    return { height: 1.08, radius: 0.42, shadow: 0.8 };
  },
  idle(ctx, t) {
    // she waltzes: one-two-three, drifting in a small circle, the hem trailing
    const w = ctx.idleW, b = ctx.b, P = 2.4;
    const ph = TAU * t / P;
    ctx.b.root.position.x += Math.sin(ph) * 0.18 * w;
    ctx.b.root.position.z += Math.cos(ph) * 0.1 * w;
    ctx.b.root.position.y += 0.03 + 0.025 * Math.abs(Math.sin(ph * 1.5)) * w;
    ctx.mover.rotation.y += ph * 0.45 * w;
    ctx.b.body.rotation.z += 4 * DEG * Math.sin(ph) * w;
    ctx.flying = true; ctx.hopY = 0.05; ctx.hopMax = 0.1;
    for (let i = 0; i < 8; i++) { const h = b['hem' + i]; if (!h) continue; const a = i / 8 * TAU; const lag = Math.sin(ph - 0.5 + a * 0.5); h.position.x += Math.sin(a) * 0.03 * lag * w; h.position.z += Math.cos(a) * 0.03 * lag * w; h.position.y += 0.015 * Math.sin(ph * 2 + a) * w; }
    if (b.armL) b.armL.rotation.z -= (0.25 + 0.12 * Math.sin(ph)) * w;
    if (b.armR) b.armR.rotation.z += (0.2 + 0.12 * Math.cos(ph)) * w;
    if (b.ribbon) b.ribbon.rotation.z += 0.12 * Math.sin(ph - 0.8) * w;
    const k = t % 9;
    if (k < 0.8) { const f = hump(k, 0, 0.8); if (b.wingL) b.wingL.rotation.z -= 0.5 * f; if (b.wingR) b.wingR.rotation.z += 0.5 * f; }
  },
  attackPose(ctx, ct) { const k = hump(ct, 0.1, 0.5); if (ctx.b.armR) ctx.b.armR.rotation.x -= 1.5 * k; if (ctx.b.fan) ctx.b.fan.rotation.z += 0.8 * k; },
  castPose(ctx, ct) { const k = hump(ct, 0.15, 0.85); if (ctx.b.armR) { ctx.b.armR.rotation.x -= 1.9 * k; } if (ctx.b.fan) ctx.b.fan.rotation.x -= 1.2 * k; if (ctx.b.armL) ctx.b.armL.rotation.z -= 0.6 * k; },
  taunt(ctx, ct) {
    // she curtsies, and waits. (She will wait a long time.)
    const k = ct < 0.4 ? easeOutCubic(ct / 0.4) : 1 - easeInOutQuad(seg(ct, 0.7, 1.1));
    ctx.b.root.position.y -= 0.12 * k;
    ctx.b.body.scale.multiply(V3(1 + 0.06 * k, 1 - 0.08 * k, 1 + 0.06 * k));
    ctx.b.body.rotation.x += 0.18 * k;
    if (ctx.b.armL) ctx.b.armL.rotation.z -= 0.9 * k;
    if (ctx.b.armR) ctx.b.armR.rotation.z += 0.9 * k;
    return ct >= 1.2;
  },
  defeat(ctx, ct, o) {
    // the curtsy first. The curtsy is non-negotiable.
    if (ct < 0.55) {
      const k = easeOutCubic(seg(ct, 0, 0.35)) * (1 - seg(ct, 0.45, 0.55));
      ctx.b.root.position.y -= 0.12 * k;
      ctx.b.body.rotation.x += 0.2 * k;
      if (ctx.b.armL) ctx.b.armL.rotation.z -= 0.9 * k;
      if (ctx.b.armR) ctx.b.armR.rotation.z += 0.9 * k;
      return false;
    }
    return DEATHS.wisp(ctx, ct - 0.55, o);
  },
});

// ── 28. SQUIDGEON — a squid that has decided it is a pigeon. Bobs its head when it swims. Coos. ──────────────
species('squidgeon', {
  name: 'Squidgeon', family: 'squid', death: 'pop', hover: 0.5, color: MON.squid,
  face: {
    wild: { lid: 0.34, tilt: 8, brow: [[0.06, 12], [0.2, -4]], look: [0.2, -0.05], glance: 0.6, glancePeriod: 1.9, mouth: 'smirk' },
    windup: { lid: 0.62, tilt: 20, brow: [[-0.14, 26], [-0.14, 26]], mouth: 'grimace' },
    strike: { lid: 0.08, tilt: 12, mouth: 'shout', eyeScale: 1.12 },
    recover: { lid: 0.32, tilt: 8, mouth: 'smirk' },
    taunt: { lid: 0.5, tilt: -6, brow: [[0.24, -14], [0.24, -14]], look: [0, 0.2], mouth: 'oh' },
    friend: { lid: 0.02, tilt: -6, brow: [[0.28, -10], [0.28, -10]], mouth: 'beam' },
  },
  build(B) {
    const cy = 0.5;
    B.setBone('body', [0, cy, 0]);
    const prof = smoothProfile([[0, 0], [0.19, 0.03], [0.225, 0.16], [0.215, 0.3], [0.17, 0.45], [0.09, 0.56], [0, 0.6]], 28);
    const squid = C3(MON.squid), lit = C3(mx(MON.squid, 'cloud.lit', 0.3));
    B.toon(lathe(prof, 30), { m: MT([0, cy - 0.16, 0]), color: MON.squid, outline: 0.018,
      vcol: (x, y, z, ny, tmp) => tmp.copy(squid).multiplyScalar(0.92).lerp(lit, smooth(cy - 0.16, cy + 0.4, y)) });
    const surf = latheSurf(prof, { y: cy - 0.16 });
    // two fins at the top, flapping like a pigeon that has misunderstood
    for (const side of [-1, 1]) {
      const fin = B.bone(side < 0 ? 'finL' : 'finR', 'body', [side * 0.1, cy + 0.3, -0.02]);
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.14, 0.06, 0.2, -0.04); sh.quadraticCurveTo(0.12, -0.08, 0, 0);
      B.toon(extrude(sh, 0.014, 0.005), { m: MT([side * 0.09, cy + 0.28, -0.02], [0.2, side < 0 ? Math.PI : 0, side * 0.3]), bone: fin, color: mx(MON.squid, 'cloth.purpleDark', 0.35), outline: 0.01 });
    }
    // the iridescent pigeon collar, and two entirely useless orange feet
    B.toon(new THREE.TorusGeometry(0.2, 0.045, 10, 30), { m: MT([0, cy - 0.12, 0], [Math.PI / 2, 0, 0], [1, 1, 0.9]), color: mx('paint.shutterGreen', 'cloth.purple', 0.45), outline: 0.012,
      vcol: (x, y, z, ny, tmp) => tmp.copy(C3(mx('paint.shutterGreen', 'cloth.purple', 0.3))).lerp(C3(mx('cloth.purple', 'paint.shutterBlue', 0.4)), smooth(-0.2, 0.9, ny)) });
    for (const side of [-1, 1]) B.toon(new THREE.SphereGeometry(0.03, 10, 8), { m: MT([side * 0.07, cy - 0.28, 0.06], [0, 0, 0], [1, 0.7, 1.6]), color: MON.beak, outline: 0.008 });
    // enormous eyes on the SIDES of the mantle, so they nearly point away from you
    B.skin = MON.squid;
    B.eyes({ surf, y: cy + 0.05, gap: 0.3, r: 0.085, forward: 0.006, pupil: 0.44, browLift: 1.25, browColor: mx(sc(MON.squid, 0.5), PAL.outline.char, 0.4) });
    B.faceMouths({ surf, y: cy - 0.1, w: 0.1, h: 0.035, kinds: ['beam', 'smirk', 'grimace', 'shout', 'ow', 'dizzy', 'oh'] });
    // the beak: two small cones
    B.toon(new THREE.ConeGeometry(0.035, 0.07, 10).rotateX(Math.PI / 2), { m: MT([0, cy - 0.06, 0.21], [-0.3, 0, 0]), color: MON.beak, outline: 0.008 });
    // eight tentacles, a travelling sine wave down each
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + 0.2, r0 = 0.16;
      const t0 = [Math.sin(a) * r0, cy - 0.28, Math.cos(a) * r0];
      const name = B.bone('tent' + i, 'body', t0);
      const pts = [t0, [Math.sin(a) * (r0 + 0.06), cy - 0.42, Math.cos(a) * (r0 + 0.06)], [Math.sin(a) * (r0 + 0.1), cy - 0.54, Math.cos(a) * (r0 + 0.1) + 0.02], [Math.sin(a) * (r0 + 0.08), cy - 0.64, Math.cos(a) * (r0 + 0.08) + 0.05]];
      B.toon(taperTube(pts, taper([[0, 0.035], [0.5, 0.026], [1, 0.01]]), 8, 14), { bone: name, color: sc(MON.squid, 0.94), outline: 0.01 });
    }
    B.gloss(surf, cy + 0.22, -0.6, 0.06, 0.1, { rot: 0.6, dot: false });
    return { height: cy + 0.46, radius: 0.34, shadow: 0.62 };
  },
  idle(ctx, t) {
    // the mantle pulses; the tentacles trail in a travelling wave; the head bobs like a pigeon's, wholly out of character
    const w = ctx.idleW, b = ctx.b;
    const y = 0.5 + 0.04 * Math.sin(TAU * 0.8 * t);
    ctx.b.root.position.y += y; ctx.hopY = y; ctx.hopMax = 0.54; ctx.flying = true;
    b.body.scale.multiply(V3(1 + 0.05 * (0.5 + 0.5 * Math.sin(TAU * 0.8 * t)), 1 - 0.06 * (0.5 + 0.5 * Math.sin(TAU * 0.8 * t)), 1 + 0.05 * (0.5 + 0.5 * Math.sin(TAU * 0.8 * t))));
    const bob = Math.sin(TAU * 1.4 * t);
    b.body.position.z += 0.035 * bob * w;
    b.body.rotation.x += 0.06 * bob * w;
    for (let i = 0; i < 8; i++) { const tn = b['tent' + i]; if (!tn) continue; const a = i / 8 * TAU; tn.rotation.x += 0.4 * Math.sin(TAU * t / 1.6 + i * 0.5) * w; tn.rotation.z += 0.3 * Math.cos(TAU * t / 1.6 + i * 0.5) * Math.sin(a) * w; }
    for (const [n, side] of [['finL', -1], ['finR', 1]]) { const f = b[n]; if (f) f.rotation.z += side * 0.25 * Math.sin(TAU * 1.4 * t) * w; }
  },
  attackPose(ctx, ct) {
    // Tentacle Slap: three of them come at you in sequence
    const b = ctx.b;
    for (let i = 0; i < 8; i++) { const tn = b['tent' + i]; if (!tn) continue; const ph = (i % 3) * 0.12; tn.rotation.x -= 1.5 * hump(ct, 0.08 + ph, 0.42 + ph); }
  },
  castPose(ctx, ct) {
    // Inkblot
    const b = ctx.b, k = hump(ct, 0.1, 0.9);
    for (let i = 0; i < 8; i++) { const tn = b['tent' + i]; if (tn) tn.rotation.x += 0.5 * k; }
    if (ct > 0.55 && !ctx._ink) { ctx._ink = true; for (let i = 0; i < 10; i++) { const a = ctx.rand() * TAU; ctx.fx.spawn('blob', { pos: V3(0, 0.45, 0.22), vel: V3(Math.cos(a) * 0.8, 0.5 + ctx.rand() * 0.6, 1.4 + ctx.rand()), drag: 1.2, life: 0.8, s0: 0.06, s1: 0.1, color: mx('char.hair', 'cloth.purpleDark', 0.4) }); } }
    if (ct < 0.3) ctx._ink = false;
  },
  taunt(ctx, ct) {
    // it coos. A squid should not be able to coo.
    const k = hump(ct, 0.05, 1.0), b = ctx.b;
    b.body.position.z += 0.06 * Math.sin(ct * 18) * k;
    b.body.rotation.x += 0.12 * Math.sin(ct * 18) * k;
    b.body.scale.multiply(V3(1 + 0.08 * k, 1 + 0.02 * k, 1 + 0.08 * k));
    return ct >= 1.05;
  },
});

// ── 30. WYRMSLEY — a dragon the size of a butler, and a butler to his bones ─────────────────────────────────
species('wyrmsley', {
  name: 'Wyrmsley', family: 'dragon', death: 'topple', color: MON.dragon,
  face: {
    // perfect butler condescension: heavy lids at 30%, brows level, a small polite fang
    wild: { lid: 0.46, tilt: -4, brow: [[0.16, -8], [0.12, -6]], look: [0.15, -0.2], glance: 0.2, glancePeriod: 6, mouth: 'fang' },
    windup: { lid: 0.64, tilt: 18, brow: [[-0.12, 24], [-0.12, 24]], mouth: 'grimace' },
    strike: { lid: 0.12, tilt: 14, brow: [[-0.04, 18], [-0.04, 18]], mouth: 'shout', eyeScale: 1.08 },
    recover: { lid: 0.44, tilt: -4, mouth: 'fang' },
    taunt: { lid: 0.6, tilt: -8, brow: [[0.2, -12], [0.2, -12]], look: [0.3, -0.3], mouth: 'smirk' },
    friend: { lid: 0.12, tilt: -6, brow: [[0.26, -12], [0.26, -12]], look: [0, 0], mouth: 'beam' },
  },
  build(B) {
    const cy = 0.62;
    B.setBone('body', [0, cy * 0.7, 0]);
    const dragon = C3(MON.dragon), lit = C3(mx(MON.dragon, 'grass.light', 0.3));
    B.toon(new THREE.CapsuleGeometry(0.28, 0.34, 8, 24), { m: MT([0, cy, 0], [0.06, 0, 0], [1, 1, 0.92]), color: MON.dragon, outline: 0.018,
      vcol: (x, y, z, ny, tmp) => tmp.copy(dragon).multiplyScalar(0.94).lerp(lit, smooth(cy - 0.3, cy + 0.4, y) * 0.7) });
    // belly plates
    for (let i = 0; i < 7; i++) B.toon(roundBox(0.26 - Math.abs(i - 3) * 0.03, 0.07, 0.06, 0.02), { m: MT([0, cy - 0.28 + i * 0.1, 0.25 - Math.abs(i - 3) * 0.012], [0.1, 0, 0]), color: MON.belly, outline: 0.008 });
    // the waistcoat, buttons and bow tie
    B.toon(new THREE.SphereGeometry(0.3, 22, 16, 0, TAU, 0, Math.PI * 0.52), { m: MT([0, cy + 0.02, -0.02], [-0.1, 0, 0], [1.04, 0.9, 1.0]), color: MON.velvet, outline: 0.014 });
    for (let i = 0; i < 3; i++) B.toon(new THREE.SphereGeometry(0.022, 10, 8), { m: MT([0, cy + 0.06 - i * 0.1, 0.28]), color: MON.gold, outline: 0.006 });
    for (const side of [-1, 1]) B.toon(new THREE.ConeGeometry(0.05, 0.08, 10).rotateZ(side * Math.PI / 2), { m: MT([side * 0.05, cy + 0.3, 0.24]), color: MON.jestDark, outline: 0.008 });
    B.toon(new THREE.SphereGeometry(0.022, 10, 8), { m: MT([0, cy + 0.3, 0.25]), color: MON.jestDark });
    // head: a snout, two swept horns, and the butler's eyes
    const head = B.bone('head', 'body', [0, cy + 0.36, 0]);
    const hc = [0, cy + 0.48, 0.02], hr = 0.24;
    B.toon(new THREE.SphereGeometry(hr, 26, 18), { m: MT(hc, [0, 0, 0], [1, 0.95, 1]), bone: head, color: MON.dragon, outline: 0.018,
      vcol: (x, y, z, ny, tmp) => tmp.copy(dragon).lerp(lit, smooth(hc[1] - hr, hc[1] + hr, y) * 0.6) });
    B.toon(roundBox(0.19, 0.14, 0.2, 0.05), { m: MT([0, cy + 0.42, 0.22], [0.1, 0, 0]), bone: head, color: mx(MON.dragon, 'grass.light', 0.15), outline: 0.014 });
    for (const side of [-1, 1]) B.toon(new THREE.SphereGeometry(0.022, 8, 6), { m: MT([side * 0.05, cy + 0.44, 0.31]), bone: head, color: sc(MON.dragon, 0.7) });
    for (const side of [-1, 1]) { const c = new THREE.ConeGeometry(0.04, 0.13, 10); c.translate(0, 0.065, 0); B.toon(c, { m: MT([side * 0.13, cy + 0.63, -0.04], [-0.7, 0, -side * 0.5]), bone: head, color: MON.belly, outline: 0.01 }); }
    const hs = ellSurf(hr, hr * 0.95, hr, hc);
    B.skin = MON.dragon;
    B.eyes({ surf: hs, y: cy + 0.55, gap: 0.19, r: 0.058, parent: head, forward: 0.004, browLift: 1.3, browColor: mx(sc(MON.dragon, 0.55), PAL.outline.char, 0.35) });
    const ms = ellSurf(0.12, 0.085, 0.12, [0, cy + 0.42, 0.18]);
    B.faceMouths({ surf: ms, y: cy + 0.385, w: 0.13, h: 0.035, parent: head, lift: 0.004, kinds: ['beam', 'fang', 'smirk', 'grimace', 'shout', 'ow', 'dizzy', 'oh'] });
    // vestigial wings that flutter uselessly
    for (const side of [-1, 1]) {
      const wing = B.bone(side < 0 ? 'wingL' : 'wingR', 'body', [side * 0.24, cy + 0.2, -0.16]);
      B.toon(extrude(scallopWing(0.2, 0.14, 3), 0.012, 0.004), { m: MT([side * 0.24, cy + 0.2, -0.18], [0.1, side < 0 ? Math.PI : 0, side * 0.6]), bone: wing, color: mx(MON.dragon, 'char.hair', 0.25), outline: 0.009 });
    }
    // a six-segment tail with a lag spring
    let parent = 'body';
    const tp = [[0, cy - 0.16, -0.22], [0, cy - 0.24, -0.38], [0.02, cy - 0.3, -0.52], [0.05, cy - 0.3, -0.64], [0.08, cy - 0.24, -0.72]];
    for (let i = 0; i < 4; i++) {
      const name = B.bone('tail' + i, parent, tp[i]); parent = name;
      B.toon(taperTube([tp[i], tp[i + 1]], taper([[0, 0.075 - i * 0.014], [1, 0.062 - i * 0.014]]), 8, 6), { bone: name, color: MON.dragon, outline: 0.012 });
    }
    B.toon(new THREE.SphereGeometry(0.05, 12, 10), { m: MT(tp[4]), bone: 'tail3', color: MON.belly, outline: 0.01 });
    // legs, one claw behind the back, and the TRAY — which stays perfectly level, whatever the body does
    for (const side of [-1, 1]) {
      const leg = B.bone(side < 0 ? 'legL' : 'legR', 'root', [side * 0.14, 0.2, 0]);
      B.toon(new THREE.CapsuleGeometry(0.08, 0.14, 5, 12), { m: MT([side * 0.14, 0.17, 0]), bone: leg, color: MON.dragon, outline: 0.014 });
      B.toon(new THREE.SphereGeometry(0.09, 14, 10), { m: MT([side * 0.14, 0.055, 0.06], [0, 0, 0], [1.1, 0.5, 1.5]), bone: leg, color: MON.belly, outline: 0.012 });
    }
    const armBack = B.bone('armBack', 'body', [-0.28, cy + 0.06, -0.06]);
    B.toon(taperTube([[-0.27, cy + 0.12, -0.04], [-0.33, cy - 0.02, -0.16], [-0.2, cy - 0.06, -0.24]], taper([[0, 0.07], [1, 0.05]]), 8, 10), { bone: armBack, color: MON.dragon, outline: 0.014 });
    const armTray = B.bone('armTray', 'body', [0.28, cy + 0.06, 0.02]);
    B.toon(taperTube([[0.27, cy + 0.12, 0.02], [0.34, cy - 0.02, 0.1], [0.3, cy, 0.22]], taper([[0, 0.07], [1, 0.05]]), 8, 10), { bone: armTray, color: MON.dragon, outline: 0.014 });
    const tray = B.bone('tray', 'root', [0.32, cy + 0.02, 0.26]);
    B.toon(new THREE.CylinderGeometry(0.17, 0.17, 0.016, 26), { m: MT([0.32, cy + 0.04, 0.26]), bone: tray, color: MON.silver, outline: 0.01 });
    B.toon(lathe(smoothProfile([[0, 0], [0.07, 0.005], [0.075, 0.05], [0.055, 0.085], [0.03, 0.095], [0.028, 0.115], [0, 0.118]], 14), 18), { m: MT([0.3, cy + 0.048, 0.24], [0, 0, 0], [1, 1, 1]), bone: tray, color: MON.chrome, outline: 0.008 });
    B.toon(new THREE.TorusGeometry(0.035, 0.008, 6, 14, Math.PI), { m: MT([0.38, cy + 0.085, 0.24], [0, 0, -0.4]), bone: tray, color: MON.chrome });
    for (const [dx, dz] of [[0.39, 0.3], [0.27, 0.33]]) B.toon(lathe(smoothProfile([[0, 0], [0.032, 0.002], [0.035, 0.03], [0.03, 0.04], [0, 0.042]], 8), 14), { m: MT([dx, cy + 0.048, dz]), bone: tray, color: MON.chrome, outline: 0.006 });
    return { height: cy + 0.76, radius: 0.42, shadow: 0.92 };
  },
  idle(ctx, t) {
    const w = ctx.idleW, b = ctx.b;
    const br = Math.sin(TAU * t / 3.2);
    b.body.scale.multiply(V3(1 + 0.012 * br * w, 1 + 0.016 * br * w, 1 + 0.012 * br * w));
    b.body.rotation.z += 1.5 * DEG * Math.sin(TAU * t / 4.1) * w;
    if (b.head) { b.head.rotation.y += 0.1 * Math.sin(TAU * t / 5.2) * w; b.head.rotation.x -= 0.04 * br * w; }
    for (let i = 0; i < 4; i++) { const tl = b['tail' + i]; if (tl) tl.rotation.y += 0.12 * Math.sin(TAU * t / 2.6 - i * 0.6) * w; }
    const fl = t % 4;
    if (fl < 0.4) for (let i = 0; i < 4; i++) { const tl = b['tail' + i]; if (tl) tl.rotation.y += 0.5 * hump(fl, 0, 0.4) * (1 - i * 0.15) * w; }
    for (const [n, side] of [['wingL', -1], ['wingR', 1]]) { const wg = b[n]; if (wg) wg.rotation.z += side * (0.12 + 0.1 * Math.sin(t * 7)) * w; }
    // the tray stays level no matter what the body does — this is the joke, and it is worth the code
    glue(ctx, 'tray', ['body', 'armTray']);
    const tr = b.tray;
    if (tr) { tr.rotation.set(0, 0, 0); tr.position.y = ctx.boneRest.tray.y - ctx.b.root.position.y * 0 + 0.0; tr.position.x = ctx.boneRest.tray.x; tr.position.z = ctx.boneRest.tray.z; }
  },
  attackPose(ctx, ct) {
    // Tail Sweep, executed without spilling anything
    const b = ctx.b, k = hump(ct, 0.08, 0.5);
    for (let i = 0; i < 4; i++) { const tl = b['tail' + i]; if (tl) tl.rotation.y -= 1.4 * k * (1 - i * 0.1); }
    b.body.rotation.y -= 0.3 * k;
    if (b.head) b.head.rotation.y -= 0.2 * k;
    glue(ctx, 'tray', ['body', 'armTray']);
    if (b.tray) { b.tray.rotation.set(0, 0, 0); b.tray.position.copy(ctx.boneRest.tray); }
  },
  castPose(ctx, ct) { const k = hump(ct, 0.1, 0.9); if (ctx.b.armBack) ctx.b.armBack.rotation.x -= 1.4 * k; if (ctx.b.head) ctx.b.head.rotation.x -= 0.2 * k; },
  taunt(ctx, ct) {
    // Serve Tea. The tea is genuinely good.
    const k = ct < 0.35 ? easeOutCubic(ct / 0.35) : 1 - easeInOutQuad(seg(ct, 0.7, 1.1));
    const b = ctx.b;
    if (b.armTray) b.armTray.rotation.x -= 0.5 * k;
    b.body.rotation.x += 0.1 * k;
    if (b.head) b.head.rotation.x += 0.15 * k;
    if (ct > 0.4 && !ctx._steam) { ctx._steam = true; for (let i = 0; i < 5; i++) ctx.fx.spawn('blob', { pos: V3(0.3, ctx.height * 0.72, 0.26), vel: V3(0.02, 0.35, 0.05), drag: 1.5, life: 0.9, s0: 0.02, s1: 0.06, color: MON.breath, delay: i * 0.12 }); }
    if (ct < 0.2) ctx._steam = false;
    return ct >= 1.2;
  },
  // he sets the tray down carefully first. Do not skip the tray.
  defeat(ctx, ct, o) {
    if (ct < 0.5) {
      const k = easeInOutQuad(seg(ct, 0, 0.45));
      const tr = ctx.b.tray;
      if (tr) { tr.position.set(ctx.boneRest.tray.x + 0.1 * k, ctx.boneRest.tray.y - (ctx.boneRest.tray.y - 0.08) * k, ctx.boneRest.tray.z + 0.16 * k); tr.rotation.set(0, 0, 0); }
      if (ctx.b.armTray) ctx.b.armTray.rotation.x -= 0.9 * k;
      ctx.b.body.rotation.x += 0.18 * k;
      if (ct > 0.44 && !o._set) { o._set = true; ctx.fx.sparkle(V3(0.42, 0.12, 0.42), 3, 0.2, { size: 0.05, life: 0.4 }); }
      return false;
    }
    const tr = ctx.b.tray;
    if (tr) { tr.position.set(ctx.boneRest.tray.x + 0.1, 0.08, ctx.boneRest.tray.z + 0.16); tr.rotation.set(0, 0, 0); }
    return DEATHS.topple(ctx, ct - 0.5, o);
  },
});

// ── 33. VESPERLING — a bat that took holy orders, and is not sure any more that it agrees ────────────────────
species('vesperling', {
  name: 'Vesperling', family: 'bat', death: 'wisp', hover: 0.75, color: MON.cassock,
  face: {
    wild: { lid: 0.44, tilt: -4, brow: [[0.18, -10], [0.14, -8]], look: [0, -0.1], glance: 0.2, glancePeriod: 5.5, mouth: 'line' },
    windup: { lid: 0.64, tilt: 18, brow: [[-0.12, 24], [-0.12, 24]], mouth: 'grimace' },
    strike: { lid: 0.1, tilt: 12, mouth: 'shout', eyeScale: 1.1 },
    recover: { lid: 0.42, tilt: -4, mouth: 'line' },
    castIn: { eyes: 'shut', brow: [[0.1, -10], [0.1, -10]], mouth: 'oh' },     // Evensong
    castOut: { lid: 0, tilt: 6, brow: [[0.24, -6], [0.24, -6]], mouth: 'oh', eyeScale: 1.15 },
    taunt: { eyes: 'shut', brow: [[0.16, -12], [0.16, -12]], mouth: 'oh' },
    defeat: { eyes: 'happy', brow: [[0.2, -12], [0.2, -12]], mouth: 'worry' },
    dizzy: { eyes: 'happy', brow: [[0.2, -12], [0.2, -12]], mouth: 'worry' },
    friend: { lid: 0.06, tilt: -8, brow: [[0.26, -14], [0.26, -14]], mouth: 'beam' },
  },
  build(B) {
    const cy = 0.72;
    B.setBone('body', [0, cy, 0]);
    // the cassock: a bell over the bat's body
    const prof = smoothProfile([[0, 0], [0.26, 0.02], [0.3, 0.08], [0.24, 0.34], [0.18, 0.56], [0.14, 0.68]], 26);
    const cass = C3(MON.cassock), cassL = C3(mx(MON.cassock, 'cloth.purple', 0.28));
    B.toon(lathe(prof, 30), { m: MT([0, cy - 0.5, 0]), color: MON.cassock, outline: 0.018,
      vcol: (x, y, z, ny, tmp) => tmp.copy(cass).lerp(cassL, smooth(cy - 0.5, cy + 0.2, y) * 0.8) });
    B.toon(new THREE.SphereGeometry(0.2, 22, 16), { m: MT([0, cy + 0.06, 0], [0, 0, 0], [1, 0.82, 0.92]), color: MON.bat, outline: 0.016 });
    // the hood: a dome open at the front, the face in its shadow
    const hood = new THREE.SphereGeometry(0.235, 24, 16, 0, TAU, 0, Math.PI * 0.62);
    B.toon(hood, { m: MT([0, cy + 0.05, -0.1], [-0.2, 0, 0], [1.08, 1.0, 0.9]), color: MON.cassock, outline: 0.016,
      vcol: (x, y, z, ny, tmp) => tmp.copy(cass).lerp(cassL, smooth(cy, cy + 0.26, y) * 0.6) });
    // the hood's brim, arching over a face that sits proud of it — the face is in shadow, not in hiding
    B.toon(new THREE.TorusGeometry(0.2, 0.026, 10, 26, Math.PI * 1.1), { m: MT([0, cy + 0.06, -0.04], [-0.35, 0, -Math.PI * 0.05], [1.05, 1, 1]), color: MON.cassock, outline: 0.012,
      vcol: (x, y, z, ny, tmp) => tmp.copy(cassL).lerp(cass, 0.3) });
    const fs = ellSurf(0.155, 0.15, 0.15, [0, cy + 0.04, 0.02]);
    B.unlit(wrapOn(discGeo(0.125, 0.125, 22, 5), fs, cy + 0.05, 0, 0.004), { color: mx(MON.cassock, 'char.hair', 0.5) });
    B.skin = mx(MON.cassock, 'char.hair', 0.5);
    B.eyes({ surf: fs, y: cy + 0.075, gap: 0.105, r: 0.042, forward: 0.01, scleraColor: mx(MON.ember, 'char.white', 0.3), pupilColor: sc(MON.ember, 0.4),
      browLift: 1.2, browLen: 1.05, browColor: mx('char.hair', MON.cassock, 0.35), rim: 0.1 });
    B.faceMouths({ surf: fs, y: cy - 0.015, w: 0.07, h: 0.026, lift: 0.01, beam: 'beam',
      kinds: ['beam', 'line', 'grimace', 'shout', 'ow', 'dizzy', 'worry', 'oh'], colors: { in: mx('char.hair', MON.cassock, 0.3), line: mx('char.hair', MON.cassock, 0.3) }, sizes: { line: [0.9, 0.5] } });
    // ears, and wings of five scallops
    for (const side of [-1, 1]) {
      const ear = B.bone(side < 0 ? 'earL' : 'earR', 'body', [side * 0.11, cy + 0.2, -0.04]);
      const c = new THREE.ConeGeometry(0.06, 0.17, 12); c.translate(0, 0.085, 0);
      B.toon(c, { m: MT([side * 0.11, cy + 0.18, -0.04], [0, 0, -side * 0.3], [1, 1, 0.55]), bone: ear, color: MON.bat, outline: 0.012 });
      const wing = B.bone(side < 0 ? 'wingL' : 'wingR', 'body', [side * 0.2, cy + 0.06, -0.06]);
      B.toon(extrude(scallopWing(0.62, 0.42, 5), 0.016, 0.005), { m: MT([side * 0.19, cy + 0.04, -0.06], [0, side < 0 ? Math.PI : 0, 0.1]), bone: wing, color: MON.batWing, outline: 0.014,
        vcol: (x, y, z, ny, tmp) => tmp.copy(C3(MON.batWing)).lerp(C3(mx(MON.batWing, 'cloth.purple', 0.4)), smooth(cy - 0.2, cy + 0.2, y)) });
    }
    // the censer, swinging on a three-link chain, trailing smoke
    const c0 = B.bone('censer0', 'body', [0.16, cy - 0.06, 0.16]);
    const c1 = B.bone('censer1', c0, [0.18, cy - 0.24, 0.2]);
    B.toon(tube([[0.16, cy - 0.06, 0.16], [0.17, cy - 0.16, 0.18], [0.18, cy - 0.24, 0.2]], 0.006, 5, 8), { bone: c0, color: MON.brass });
    B.toon(new THREE.TorusGeometry(0.05, 0.014, 8, 18), { m: MT([0.18, cy - 0.29, 0.2], [Math.PI / 2, 0, 0]), bone: c1, color: MON.brass, outline: 0.008 });
    B.toon(new THREE.SphereGeometry(0.045, 14, 10, 0, TAU, Math.PI * 0.45, Math.PI * 0.55), { m: MT([0.18, cy - 0.29, 0.2]), bone: c1, color: MON.brass, outline: 0.008 });
    return { height: cy + 0.4, radius: 0.5, shadow: 0.7 };
  },
  idle(ctx, t) {
    // it hangs UPSIDE DOWN from nothing, hood down, hands folded, swaying — and nobody expects the flip
    const w = ctx.idleW, b = ctx.b;
    const y = 0.75 + 0.03 * Math.sin(TAU * t / 3.4);
    ctx.b.root.position.y += y; ctx.hopY = y; ctx.hopMax = 0.78; ctx.flying = true;
    // it hangs upside down from nothing for a few seconds at a time and then rights itself with one wing-snap.
    // Nobody expects the flip. (Once it has joined you it stays the right way up, out of politeness.)
    const P = 8.4, k = t % P;
    const flip = ctx.mood === 'friend' ? 0 : smooth(2.6, 3.2, k) * (1 - smooth(6.0, 6.28, k));
    b.body.rotation.x += Math.PI * 0.97 * flip;
    ctx.b.root.position.y += 0.16 * flip;
    if (flip > 0.02 && flip < 0.98) for (const [n, side] of [['wingL', -1], ['wingR', 1]]) { const wg = b[n]; if (wg) wg.rotation.z -= side * 0.6; }
    ctx._flip = flip;
    b.body.rotation.z += (4 * DEG) * Math.sin(TAU * t / 3.4) * w;
    for (const [n, side] of [['earL', -1], ['earR', 1]]) { const e = b[n]; if (e) e.rotation.z += side * 0.06 * Math.sin(t * 1.7) * w; }
    for (const [n, side] of [['wingL', -1], ['wingR', 1]]) { const wg = b[n]; if (wg) wg.rotation.z += side * (0.9 + 0.06 * Math.sin(t * 1.3)) * w; }   // folded, hands in sleeves
    if (b.censer0) b.censer0.rotation.z += 0.35 * Math.sin(TAU * t / 2.1) * w;
    if (b.censer1) b.censer1.rotation.z += 0.25 * Math.sin(TAU * (t - 0.18) / 2.1) * w;
    ctx._smoke = (ctx._smoke || 0) + (ctx.dt || 0);
    if (ctx._smoke > 1.1 && w > 0.4) { ctx._smoke = 0; ctx.fx.spawn('blob', { pos: V3(0.2, ctx.height * 0.45, 0.24), vel: V3(0.04, 0.22, 0.05), drag: 1.2, life: 1.4, s0: 0.03, s1: 0.09, color: mx(MON.breath, 'stone.mid', 0.35) }); }
  },
  attackPose(ctx, ct) {
    // it rights itself with a single wing-snap, and only then hits you
    const b = ctx.b, up = smooth(0, 0.16, ct);
    b.body.rotation.x -= Math.PI * 0.97 * up * (ctx._flip || 0);
    for (const [n, side] of [['wingL', -1], ['wingR', 1]]) { const wg = b[n]; if (wg) wg.rotation.z -= side * (0.9 * up - 1.1 * hump(ct, 0.1, 0.5)); }
    ctx.b.root.position.y += 0.1 * hump(ct, 0.05, 0.4);
  },
  castPose(ctx, ct) {
    const b = ctx.b, up = smooth(0, 0.2, ct);
    b.body.rotation.x -= Math.PI * 0.97 * up * (ctx._flip || 0);
    for (const [n, side] of [['wingL', -1], ['wingR', 1]]) { const wg = b[n]; if (wg) wg.rotation.z -= side * (0.9 * up - 1.4 * hump(ct, 0.2, 0.9)); }
    if (ct > 0.55) ctx.glow = Math.max(ctx.glow, 0.35 * hump(ct, 0.55, 0.95));
  },
  taunt(ctx, ct) {
    // it sings the evening prayer. It is not sure any more that it agrees.
    const b = ctx.b, up = smooth(0, 0.25, ct) * (1 - smooth(0.85, 1.05, ct));
    b.body.rotation.x -= Math.PI * 0.97 * up * (ctx._flip || 0);
    ctx.b.root.position.y += 0.08 * up;
    if (b.censer0) b.censer0.rotation.z += 0.8 * Math.sin(ct * 9) * up;
    if (ct > 0.3 && !ctx._sing) { ctx._sing = true; ctx.fx.sparkle(ctx.center().add(V3(0, 0.2, 0.2)), 6, 0.5, { size: 0.07, life: 0.9, speed: 0.5, up: 0.7, color: MON.ember, alt: MON.white }); }
    if (ct < 0.15) ctx._sing = false;
    return ct >= 1.15;
  },
});

// ── §6b. THE TIDEWARDEN — a huge old hermit crab wearing a lighthouse as a shell (Act II, the Sighing Grotto) ──
species('tidewarden', {
  name: 'The Tidewarden', family: 'crab', boss: true, color: MON.crab, scale: 4, shadowZ: 0.8,
  face: {
    wild: { lid: 0.5, tilt: 16, brow: [[-0.1, 22], [-0.06, 18]], look: [0, -0.1], glance: 0.2, glancePeriod: 6, mouth: 'line' },
    windup: { lid: 0.7, tilt: 26, brow: [[-0.2, 30], [-0.2, 30]], mouth: 'grimace' },
    strike: { lid: 0.16, tilt: 18, mouth: 'shout', eyeScale: 1.1 },
    recover: { lid: 0.48, tilt: 16, mouth: 'line' },
    taunt: { lid: 0.62, tilt: 20, brow: [[-0.14, 26], [-0.14, 26]], mouth: 'grimace' },
    dead: { lid: 0.85, tilt: 8, brow: [[0.1, 10], [0.1, 10]], mouth: 'line' },
    friend: { lid: 0.2, tilt: 0, brow: [[0.14, -6], [0.16, -8]], mouth: 'worry' },
  },
  build(B) {
    REUSE = { ears: false };
    let r = { height: 0.6, radius: 0.36 };
    try { r = SPECIES.get('crabbit').build(B) || r; } finally { REUSE = {}; }
    // the lighthouse it wears instead of a shell: striped, with a lit lamp room and a rail
    const tower = B.bone('tower', 'body', [0, 0.42, -0.12]);
    const prof = smoothProfile([[0, 0], [0.26, 0.02], [0.24, 0.16], [0.2, 0.4], [0.17, 0.6], [0.165, 0.66]], 24);
    const white = C3(MON.lighthouse), red = C3(MON.cap);
    B.toon(lathe(prof, 28), { m: MT([0, 0.34, -0.14], [-0.22, 0, 0]), bone: tower, color: MON.lighthouse, outline: 0.016,
      vcol: (x, y, z, ny, tmp) => tmp.copy(((y - 0.34) * 6.5 | 0) % 2 ? red : white) });
    B.toon(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20), { m: MT([0, 0.94, -0.28], [-0.22, 0, 0]), bone: tower, color: MON.iron, outline: 0.01 });
    B.unlit(new THREE.SphereGeometry(0.11, 14, 10), { m: MT([0, 1.02, -0.3], [0, 0, 0], [1, 0.9, 1]), bone: tower, color: mx(MON.lamp, 'char.white', 0.35) });
    B.trans(new THREE.SphereGeometry(0.16, 14, 10), { m: MT([0, 1.02, -0.3]), bone: tower, color: MON.lamp, alpha: 0.2 });
    B.toon(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 16), { m: MT([0, 1.12, -0.32], [-0.22, 0, 0]), bone: tower, color: MON.iron });
    B.toon(new THREE.ConeGeometry(0.14, 0.13, 16), { m: MT([0, 1.2, -0.34], [-0.22, 0, 0]), bone: tower, color: MON.cap, outline: 0.012 });
    return { height: Math.max(r.height, 1.3), radius: r.radius * 1.15, shadow: r.radius * 2.6 };
  },
  idle(ctx, t) {
    SPECIES.get('crabbit').idle(ctx, t);
    const tw = ctx.b.tower;
    if (tw) tw.rotation.z += 0.03 * Math.sin(TAU * t / 3.4) * ctx.idleW;
  },
  attackPose(ctx, ct) { SPECIES.get('crabbit').attackPose(ctx, ct); },
  castPose(ctx, ct) { SPECIES.get('crabbit').castPose(ctx, ct); },
  // it does not die: it shuts its door and sulks, and the Tide Pearl rolls out
  defeat(ctx, ct, o) {
    const k = easeInOutQuad(seg(ct, 0, 0.7)), b = ctx.b;
    ctx.b.root.position.y -= 0.12 * k * ctx.size * 0.25;
    for (let i = 0; i < 6; i++) { const L = b['leg' + i]; if (L) L.scale.y *= 1 - 0.55 * k; }
    for (const S of ['L', 'R']) { const st = b['stalk' + S]; if (st) st.rotation.x += 0.9 * k; const pn = b['pin' + S]; if (pn) pn.rotation.x -= 0.1 * k; }
    ctx.eyeScale *= 1 - 0.15 * k;
    if (ct > 0.55 && !o._pearl) {
      o._pearl = true;
      ctx.fx.spawn('blob', { pos: ctx.center().add(V3(0.1, -0.1, 0.3)), vel: V3(0.35, 0.25, 0.9), grav: 5, life: 1.6, s0: 0.1, s1: 0.1, color: mx('snow.light', 'water.foam', 0.4), floor: 0.05, spin: 3 });
      ctx.fx.sparkle(ctx.center().add(V3(0.2, -0.1, 0.5)), 5, 0.5, { size: 0.1, life: 0.8, delay: 0.3 });
    }
    return ct >= 1.2;
  },
  deadPose(ctx, t) {
    const b = ctx.b;
    for (let i = 0; i < 6; i++) { const L = b['leg' + i]; if (L) L.scale.y *= 0.45; }
    for (const S of ['L', 'R']) { const st = b['stalk' + S]; if (st) st.rotation.x += 0.9; }
    ctx.b.root.position.y -= 0.03 * ctx.size;
    void t;
  },
});

// ── §6b. HOARFAX THE NINEFOLD — a nine-tailed frost fox (Act III, the Glasswing Grotto) ──────────────────────
species('hoarfax', {
  name: 'Hoarfax the Ninefold', family: 'cat', boss: true, color: MON.frost, death: 'wisp',
  toon: { edge: 0.04, soft: 0.05, mid: 0.9, midEdge: 0.4, shadeSat: 1.0 },
  face: {
    wild: { lid: 0.44, tilt: 18, brow: [[-0.1, 24], [-0.06, 20]], look: [0.1, 0], glance: 0.3, glancePeriod: 3.6, mouth: 'cat' },
    windup: { lid: 0.64, tilt: 26, brow: [[-0.2, 30], [-0.2, 30]], mouth: 'grimace' },
    strike: { lid: 0.06, tilt: 16, mouth: 'shout', eyeScale: 1.2 },
    recover: { lid: 0.42, tilt: 18, mouth: 'cat' },
    taunt: { lid: 0.3, tilt: -6, brow: [[0.24, -14], [0.24, -14]], look: [0, 0.1], mouth: 'smirk' },
    defeat: { eyes: 'happy', brow: [[0.24, -14], [0.24, -14]], mouth: 'cat' },
    dizzy: { eyes: 'happy', brow: [[0.24, -14], [0.24, -14]], mouth: 'cat' },
    friend: { lid: 0.08, tilt: -6, brow: [[0.28, -12], [0.28, -12]], mouth: 'beam' },
  },
  build(B) {
    B.skin = MON.frost;
    const k = 3.4;
    const r = catRig(B, { k, mane: false, bell: false, whiskers: true,
      coat: { body: MON.frost, dark: mx(MON.frost, 'water.light', 0.45), muzzle: MON.white, nose: mx(MON.iceBlue, 'flower.pink', 0.3), tooth: MON.white },
      eye: { pupilShape: 'slit', pupilColor: mx(MON.iceBlue, 'char.eye', 0.45), sclera: mx(MON.white, MON.iceBlue, 0.25), rim: 0.11 } });
    // eight more tails, each of which vanishes with a sparkle as it loses a move
    for (let i = 0; i < 8; i++) {
      const a = (i - 3.5) * 0.19, spread = 0.1 + Math.abs(i - 3.5) * 0.03;
      const base = [Math.sin(a) * 0.1 * k, 0.16 * k, -0.14 * k];
      const name = B.bone('xtail' + i, 'body', base);
      const pts = [base, [Math.sin(a) * 0.2 * k, (0.19 + spread * 0.6) * k, -0.3 * k], [Math.sin(a) * 0.32 * k, (0.24 + spread * 1.3) * k, -0.46 * k], [Math.sin(a) * 0.4 * k, (0.3 + spread * 1.8) * k, -0.56 * k]];
      B.toon(taperTube(pts, taper([[0, 0.032 * k], [0.55, 0.026 * k], [1, 0.012 * k]]), 8, 14), { bone: name, color: MON.frost, outline: 0.012 * k * 0.5,
        vcol: (x, y, z, ny, tmp) => tmp.copy(C3(MON.frost)).lerp(C3(MON.white), smooth(0.2 * k, 0.42 * k, y)) });
      B.toon(new THREE.SphereGeometry(0.05 * k, 12, 10), { m: MT(pts[3], [0, 0, 0], [1, 0.9, 0.9]), bone: name, color: MON.white, outline: 0.012 * k * 0.5 });
    }
    return { height: r.height, radius: r.radius * 1.6, shadow: r.radius * 4.2 };
  },
  idle(ctx, t) {
    catIdle(ctx, t, true);
    for (let i = 0; i < 8; i++) { const tn = ctx.b['xtail' + i]; if (!tn) continue; tn.rotation.z += 0.12 * Math.sin(TAU * t / 2.8 + i * 0.6) * ctx.idleW; tn.rotation.x += 0.08 * Math.sin(TAU * t / 3.4 + i) * ctx.idleW; }
    ctx._frost = (ctx._frost || 0) + (ctx.dt || 0);
    if (ctx._frost > 1.4 && ctx.idleW > 0.5) {
      ctx._frost = 0;
      const a = ctx.rand() * TAU;
      ctx.fx.spawn('star', { pos: ctx.center().add(V3(Math.cos(a) * ctx.radius, ctx.height * 0.4 * ctx.rand(), Math.sin(a) * ctx.radius * 0.6)), vel: V3(0, -0.12, 0), life: 1.4, s0: 0.06, s1: 0.06, color: mx(MON.white, MON.iceBlue, 0.4), twinkle: true });
    }
  },
  attackPose: catAttack,
  taunt: catRoar,
});

// ── B2. SEXTON SOOTBELL — the bellringer who kept ringing after everyone had gone (Act II, Bellhollow Belfry) ─
species('sootbell', {
  name: 'Sexton Sootbell', family: 'ghost', boss: true, color: MON.ghostShade, death: 'wisp', ghost: true, transShadow: false, scale: 2.9,
  ghostOpacity: (t) => 0.86 + 0.07 * (0.5 + 0.5 * Math.sin(TAU * t / 3.2)),
  face: {
    wild: { lid: 0.4, tilt: -6, brow: [[0.2, -16], [0.16, -14]], look: [0, -0.15], glance: 0.2, glancePeriod: 6.4, mouth: 'ow' },
    windup: { lid: 0.62, tilt: 12, brow: [[-0.04, 16], [-0.04, 16]], mouth: 'shout' },
    strike: { lid: 0.1, tilt: 6, brow: [[0.08, 10], [0.08, 10]], mouth: 'shout', eyeScale: 1.1 },
    recover: { lid: 0.4, tilt: -6, mouth: 'ow' },
    taunt: { eyes: 'shut', brow: [[0.24, -22], [0.24, -22]], mouth: 'ow' },
    defeat: { eyes: 'happy', brow: [[0.2, -16], [0.2, -16]], mouth: 'worry' },
    dizzy: { eyes: 'happy', brow: [[0.2, -16], [0.2, -16]], mouth: 'worry' },
    friend: { lid: 0.08, tilt: -8, brow: [[0.24, -14], [0.24, -14]], mouth: 'worry' },
  },
  build(B) {
    let r = { height: 0.64, radius: 0.28, shadow: 0.44 };
    try { r = SPECIES.get('boohoo').build(B) || r; } finally { REUSE = {}; }
    // the stole across his shoulders, mitten hands — and the rope he hauls on that is not there
    B.toon(new THREE.TorusGeometry(0.205, 0.038, 8, 26, Math.PI * 1.25), { m: MT([0, 0.385, 0.035], [0.4, 0, -Math.PI * 0.12], [1, 1, 0.85]), color: mx('char.hair', 'cloth.purpleDark', 0.3), outline: 0.012 });
    for (const side of [-1, 1]) B.trans(extrude(petalShape(0.24, 0.05, 0.3), 0.01, 0.004), { m: MT([side * 0.12, 0.36, 0.17], [0.2, 0, Math.PI]), color: mx('char.hair', 'cloth.purpleDark', 0.35), alpha: 0.9 });
    const rope = B.bone('rope', 'body', [0.02, 0.62, 0.18]);
    const pts = [[0.02, 0.98, 0.2], [0.02, 0.86, 0.19], [0.03, 0.74, 0.18], [0.03, 0.6, 0.17]];
    B.toon(taperTube(pts, taper([[0, 0.016], [1, 0.02]]), 6, 12), { bone: rope, color: MON.rope, outline: 0.008 });
    B.toon(new THREE.SphereGeometry(0.05, 12, 10), { m: MT([0.03, 0.56, 0.17], [0, 0, 0], [1, 1.3, 1]), bone: rope, color: MON.rope, outline: 0.01 });
    for (const side of [-1, 1]) {
      const hand = B.bone(side < 0 ? 'handL' : 'handR', side < 0 ? 'armL' : 'armR', [side * 0.07, 0.58, 0.19]);
      B.trans(new THREE.SphereGeometry(0.058, 14, 10), { m: MT([side * 0.055, 0.6, 0.18], [0, 0, 0], [1, 1.1, 1]), bone: hand, color: MON.ghost, alpha: 1 });
    }
    // the great bell above him, swinging silently in time
    const bell = B.bone('bell', 'root', [0, 1.28, 0.05]);
    // NOTE the profile runs bottom-to-top: a lathe built top-down comes out inside-out (you see its dark interior)
    const bp = smoothProfile([[0.17, 0.0], [0.205, 0.004], [0.195, 0.055], [0.16, 0.19], [0.09, 0.29], [0, 0.3]], 22);
    // the bell hangs above him with its shaded side toward you, so it is painted BRASS: dark bronze read as a brown hole
    const brassLit = mx(MON.brass, 'flower.yellow', 0.3), brassMid = mx(MON.brass, 'cloth.mustard', 0.35);
    B.toon(lathe(bp, 26), { m: MT([0, 1.04, 0.05]), bone: bell, color: brassMid, outline: 0.016,
      vcol: (x, y, z, ny, tmp) => tmp.copy(C3(brassMid)).lerp(C3(brassLit), smooth(-0.5, 0.6, ny) * 0.6 + smooth(1.04, 1.34, y) * 0.4) });
    // cap the bell's mouth: without it you see the inside of its own outline shell, which reads as a brown hole
    B.toon(new THREE.CircleGeometry(0.2, 26).rotateX(Math.PI / 2), { m: MT([0, 1.045, 0.05]), bone: bell, color: mx(MON.brass, 'char.hair', 0.3) });
    B.toon(new THREE.SphereGeometry(0.05, 12, 10), { m: MT([0, 1.02, 0.05]), bone: bell, color: mx(MON.bronze, 'char.hair', 0.25), outline: 0.01 });
    B.toon(new THREE.TorusGeometry(0.042, 0.012, 8, 18), { m: MT([0, 1.36, 0.05], [Math.PI / 2, 0, 0]), bone: bell, color: mx(MON.bronze, 'cloth.mustard', 0.35) });
    return { height: 1.36, radius: r.radius * 1.1, shadow: r.shadow * 1.2 };
  },
  idle(ctx, t) {
    SPECIES.get('boohoo').idle(ctx, t);
    // he hauls on a rope that is not there, and the bell above him swings in time — silently
    const w = ctx.idleW, P = 3.0, ph = TAU * t / P;
    const haul = 0.5 - 0.5 * Math.cos(ph);
    if (ctx.b.rope) ctx.b.rope.position.y -= 0.12 * haul * w;
    for (const n of ['armL', 'armR']) { const a = ctx.b[n]; if (a) a.rotation.x -= (0.5 + 0.9 * haul) * w; }
    for (const n of ['handL', 'handR']) { const h = ctx.b[n]; if (h) h.position.y -= 0.12 * haul * w; }
    if (ctx.b.bell) { ctx.b.bell.rotation.z += 0.18 * Math.sin(ph - 0.5) * w; ctx.b.bell.rotation.x += 0.05 * Math.cos(ph - 0.5) * w; }
    // thirty slow dust motes
    ctx._dust = (ctx._dust || 0) + (ctx.dt || 0);
    if (ctx._dust > 0.5 && w > 0.5) {
      ctx._dust = 0;
      const a = ctx.rand() * TAU, rr = ctx.radius * (0.4 + ctx.rand());
      ctx.fx.spawn('blob', { pos: V3(Math.cos(a) * rr, 0.2 + ctx.rand() * ctx.height, Math.sin(a) * rr * 0.6), vel: V3(0.01, -0.05 - ctx.rand() * 0.05, 0), life: 2.2, s0: 0.014, s1: 0.012, color: mx(MON.ghost, 'stone.mid', 0.35) });
    }
  },
  attackPose(ctx, ct) { SPECIES.get('boohoo').attackPose(ctx, ct); if (ctx.b.bell) ctx.b.bell.rotation.z += 0.5 * hump(ct, 0.05, 0.5); },
  castPose(ctx, ct) { SPECIES.get('boohoo').castPose(ctx, ct); if (ctx.b.bell) ctx.b.bell.rotation.z += 0.8 * hump(ct, 0.1, 0.9); },
  taunt(ctx, ct) {
    // Toll: he rings the bell that was taken, and the room goes quiet
    ctx.faceKey = 'taunt';
    const k = hump(ct, 0.05, 1.0);
    for (const n of ['armL', 'armR']) { const a = ctx.b[n]; if (a) a.rotation.x -= 1.6 * k; }
    if (ctx.b.bell) ctx.b.bell.rotation.z += 0.9 * Math.sin(ct * 9) * k;
    if (ctx.b.rope) ctx.b.rope.position.y -= 0.3 * k;
    if (ct > 0.25 && !ctx._toll) { ctx._toll = true; ctx.fx.sparkle(ctx.center().add(V3(0, ctx.height * 0.8, 0)), 8, ctx.radius * 2.2, { ring: true, size: 0.1, life: 1.0, speed: 1.6, up: 0.1, color: mx(MON.bronze, 'char.white', 0.4), alt: MON.white }); }
    if (ct < 0.15) ctx._toll = false;
    return ct >= 1.2;
  },
  // WISP — and as he goes the ghost bell rings once, properly, for the first time since it was taken
  defeat(ctx, ct, o) {
    if (ctx.b.bell) { ctx.b.bell.rotation.z += 0.5 * Math.sin(ct * 7) * (1 - seg(ct, 0.6, 1.2)); }
    if (ct > 0.15 && !o._ring) { o._ring = true; ctx.fx.sparkle(ctx.center().add(V3(0, ctx.height * 0.85, 0)), 10, ctx.radius * 2.6, { ring: true, size: 0.11, life: 1.3, speed: 1.2, up: 0.05, color: mx(MON.bronze, 'char.white', 0.5), alt: MON.white }); }
    return DEATHS.wisp(ctx, ct, o);
  },
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 6. The face layer — what the monster FEELS, per clip, tuned per species
//    A wild monster is sly (half-lidded, glancing, a lopsided smirk); it squints and grits its teeth to wind up, yells
//    as it lunges, squeezes its eyes shut when hit, goes dizzy as it poofs — and on 'join' its lids snap open into the
//    big beaming face it keeps from then on (mood 'friend'). Species override any state in spec.face.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** lid: closure 0 open .. 1 shut ([L, R] or one), tilt: lid slant deg (+ inner corners down = cross/sly, - = sad),
 *  brow: [[raise (eye radii), angle deg (+ inner end down)] L, R], look: pupils [x, y] (-1..1), glance: sideways
 *  pupil flicks, eyes: 'open' | 'shut' | 'dizzy' | 'happy', mouth: a faceMouths kind, eyeScale. */
const FACE_STATES = {
  wild: { lid: 0.46, tilt: 10, brow: [[-0.04, 12], [0.16, -4]], look: [0.1, -0.12], glance: 0.6, mouth: 'smirk' },
  friend: { lid: 0.0, tilt: -4, brow: [[0.28, -8], [0.28, -8]], look: [0, 0.05], glance: 0, mouth: 'beam' },
  windup: { lid: 0.66, tilt: 22, brow: [[-0.2, 30], [-0.2, 30]], look: [0, 0.12], mouth: 'grimace', eyeScale: 0.96 },
  strike: { lid: 0.34, tilt: 18, brow: [[-0.16, 26], [-0.16, 26]], look: [0, 0.05], mouth: 'shout' },
  recover: { lid: 0.42, tilt: 10, brow: [[-0.02, 12], [0.12, 0]], look: [0, 0], mouth: 'smirk' },
  hurt: { eyes: 'shut', brow: [[0.14, -26], [0.14, -26]], mouth: 'ow' },
  stunned: { lid: 0.0, tilt: -8, brow: [[0.36, -16], [0.36, -16]], look: [0, 0], mouth: 'oh', eyeScale: 1.08 },
  taunt: { eyes: ['happy', 'open'], lid: [1, 0.12], tilt: 6, brow: [[-0.08, 14], [0.34, -12]], look: [0.45, 0], mouth: 'tongue' },
  castIn: { lid: 1, tilt: 6, brow: [[-0.12, 16], [-0.12, 16]], mouth: 'oh' },
  castOut: { lid: 0, tilt: 12, brow: [[0.24, 12], [0.24, 12]], look: [0, 0], mouth: 'shout', eyeScale: 1.12 },
  dizzy: { eyes: 'dizzy', brow: [[0.26, -18], [0.06, -6]], mouth: 'dizzy' },
  surprise: { lid: 0, tilt: -2, brow: [[0.38, -10], [0.38, -10]], look: [0, 0], mouth: 'oh', eyeScale: 1.14 },
  happy: { eyes: 'happy', brow: [[0.32, -10], [0.32, -10]], mouth: 'beam' },
};
const FACE_SNAP = new Set(['hurt', 'strike', 'castOut', 'dizzy', 'surprise', 'happy', 'stunned']);
const MOUTH_FALLBACK = { smirk: ['beam'], fang: ['smirk', 'beam'], fangTongue: ['fang', 'tongue', 'smirk', 'beam'], grimace: ['shout', 'line', 'oh', 'beam'],
  shout: ['oh', 'beam'], ow: ['oh', 'beam'], worry: ['beam'], dizzy: ['oh', 'ow', 'beam'], tongue: ['smirk', 'beam'], cat: ['smirk', 'beam'],
  line: ['frown', 'beam'], frown: ['line', 'beam'], oh: ['beam'], beam: [] };
const LID_OPEN = -54 * DEG, LID_SHUT = 52 * DEG;

function faceConf(spec) {
  if (spec._faceConf) return spec._faceConf;
  const out = {}, over = spec.face || {};
  for (const k of new Set([...Object.keys(FACE_STATES), ...Object.keys(over)])) out[k] = Object.assign({}, FACE_STATES[k] || FACE_STATES.wild, over[k] || {});
  spec._faceConf = out;
  return out;
}
/** Which face state a clip is in at clip time ct. Species hooks can force one with ctx.faceKey. */
function faceKeyFor(ctx, conf, clipName, ct) {
  if (ctx.faceKey && conf[ctx.faceKey]) return ctx.faceKey;
  const mood = ctx.mood === 'friend' ? 'friend' : 'wild';
  switch (clipName) {
    case 'attack': return ct < 0.15 ? 'windup' : ct < 0.36 ? 'strike' : ct < 0.56 ? (mood === 'friend' ? 'friend' : 'recover') : mood;
    case 'hurt': return ct < 0.27 ? 'hurt' : ct < 0.42 ? 'stunned' : mood;
    case 'taunt': return ct < 0.08 ? mood : ct < 0.92 ? 'taunt' : mood;
    case 'cast': return ct < 0.6 ? 'castIn' : ct < 0.9 ? 'castOut' : mood;
    case 'defeat': return conf.defeat ? 'defeat' : 'dizzy';
    case 'dead': return conf.dead ? 'dead' : 'dizzy';
    case 'join': return ct < 0.58 ? 'surprise' : ct < 0.88 ? 'friend' : ct < 1.3 ? 'happy' : 'friend';
    default: return mood;
  }
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _n = new THREE.Vector3();

/** Move a bone along a (surface-following) up vector. */
function slide(bn, up, d) { if (bn) { bn.position.x += up[0] * d; bn.position.y += up[1] * d; bn.position.z += up[2] * d; } }
/** Drive lids, pupils, brows, eye decals and the mouth set from the face state. F persists per instance. */
function driveFace(ctx, T, F, dt, clipName, ct, blinkClose) {
  const face = T.meta.face, b = ctx.b, conf = faceConf(ctx.spec);
  const key = faceKeyFor(ctx, conf, clipName, ct), g = conf[key];
  const snap = key !== F.key && (FACE_SNAP.has(key) || (key === 'friend' && clipName === 'join') || F.key === '');
  F.key = key;
  const k = snap ? 1 : 1 - Math.exp(-dt * (g.rate || 16));
  for (let i = 0; i < 2; i++) {
    const lt = Array.isArray(g.lid) ? g.lid[i] : (g.lid ?? 0);
    F.lid[i] += (lt - F.lid[i]) * k;
    const bt = (g.brow && g.brow[i]) || [0, 0];
    F.brow[i][0] += (bt[0] - F.brow[i][0]) * k; F.brow[i][1] += (bt[1] - F.brow[i][1]) * k;
  }
  F.tilt += ((g.tilt ?? 0) - F.tilt) * k;
  let lx = (g.look && g.look[0]) || 0, ly = (g.look && g.look[1]) || 0;
  if (g.glance) lx += g.glance * Math.tanh(4 * Math.sin(TAU * ctx.t / (g.glancePeriod || 3.6) + ctx.seedA));
  const kl = snap ? 1 : 1 - Math.exp(-dt * 14);
  F.look[0] += (clamp01((lx + 1) / 2) * 2 - 1 - F.look[0]) * kl; F.look[1] += (Math.max(-1, Math.min(1, ly)) - F.look[1]) * kl;
  const modes = Array.isArray(g.eyes) ? g.eyes : [g.eyes || 'open', g.eyes || 'open'];
  F.eyes = modes[0] === modes[1] ? modes[0] : modes.join('/');
  const eyeScale = ctx.eyeScale * (g.eyeScale || 1);
  const tiltExtra = ctx.eyeTilt / DEG;
  for (const e of face.eyes) {
    const eb = b[e.eye]; if (!eb) continue;
    const si = e.side < 0 ? 0 : 1, side = e.side, mode = modes[si];
    const qe = e._q || (e._q = new THREE.Quaternion(e.q[0], e.q[1], e.q[2], e.q[3]));
    _n.set(0, 0, 1).applyQuaternion(qe);
    for (const m of ['shut', 'happy']) {
      const bn = e[m] && b[e[m]]; if (!bn) continue;
      const on = mode === m;
      bn.scale.setScalar(on ? eyeScale : 0.0001);
      if (on && m === 'happy') bn.position.y += 0.06 * e.r * Math.abs(Math.sin(ctx.t * 9));
    }
    if (e.dizzy) { const fi = Math.floor(ctx.t * 15) % e.dizzy.length; e.dizzy.forEach((n, j) => { const bn = b[n]; if (bn) bn.scale.setScalar(mode === 'dizzy' && j === fi ? eyeScale : 0.0001); }); }
    if (mode !== 'open' && e.shut) { eb.scale.setScalar(0.0001); }
    else {
      eb.scale.multiplyScalar(eyeScale);
      const close = clamp01(Math.max(F.lid[si], blinkClose[si], ctx.lids[si]));
      const lb = e.lid && b[e.lid];
      if (e.lids && e.lids.length) {
        let idx = -1;
        for (let j = 0; j < LID_LEVELS.length; j++) if (close >= LID_LEVELS[j] - 0.07) idx = j;
        for (let j = 0; j < e.lids.length; j++) {
          const bn = b[e.lids[j]]; if (!bn) continue;
          if (j !== idx) { bn.scale.setScalar(0.0001); continue; }
          bn.scale.setScalar(1);
          const t = Math.tan(THREE.MathUtils.clamp((F.tilt + (e.baseTilt || 0) + tiltExtra) * DEG, -0.9, 0.9)) * e.lidHalf;
          slide(b[e.lids[j] + 'I'], e.up, -t); slide(b[e.lids[j] + 'O'], e.up, t);
        }
      } else if (lb) {
        if (close < 0.02) lb.scale.setScalar(0.0001);
        else {
          _e.set(lerp(LID_OPEN, LID_SHUT, close), 0, side * (F.tilt + (e.baseTilt || 0) + tiltExtra) * DEG, 'ZYX');
          _qb.setFromEuler(_e);
          _qc.copy(qe).invert();
          lb.quaternion.copy(qe).multiply(_qb).multiply(_qc);
        }
      } else if (e.kind === 'ball' || e.kind === 'flat' || e.kind === 'glow') {
        eb.scale.y *= Math.max(0.05, 1 - 0.95 * close);
        eb.rotation.z += side * ctx.eyeTilt;
      }
      const pb = e.pupil && b[e.pupil];
      if (pb && e.kind === 'painted') {
        const dx = F.look[0] * e.r * 0.36, dy = F.look[1] * e.r * 0.34;
        pb.position.add(_v.set(e.tan[0] * dx + e.up[0] * dy, e.tan[1] * dx + e.up[1] * dy, e.tan[2] * dx + e.up[2] * dy));
      } else if (pb) {
        const r = e.r, R = e.R || r, dx = F.look[0] * r * 0.34, dy = F.look[1] * r * 0.3;
        const dz = (e.zs || 0.84) * R * 0.97 * (Math.sqrt(Math.max(0, 1 - (dx * dx + dy * dy) / (R * R))) - 1);
        pb.position.add(_v.set(dx, dy, dz).applyQuaternion(qe));
      }
    }
    const bb = e.brow && b[e.brow];
    if (bb) {
      slide(bb, e.up, F.brow[si][0] * e.r);
      const t = Math.tan(THREE.MathUtils.clamp(F.brow[si][1] * DEG, -0.9, 0.9)) * e.browHalf;
      slide(b[e.browI], e.up, -t); slide(b[e.browO], e.up, t);
    }
  }
  // the mouth: exactly one shown
  const M = face.mouths, have = (m) => M[m] && b[M[m]];
  let want = ctx.showOh ? 'oh' : (g.mouth || 'beam');
  if (!have(want)) want = (MOUTH_FALLBACK[want] || []).find(have) || Object.keys(M).find(have);
  F.mouth = want;
  for (const kind in M) { const bn = b[M[kind]]; if (bn) bn.scale.setScalar(kind === want ? 1 : 0.0001); }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 7. Clips
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const CLIP_IDLE_W = { idle: 1, attack: 0, hurt: 0.25, cast: 0, taunt: 0, join: 0, defeat: 0, dead: 0 };

function applyLean(ctx, dir, angle) {
  const axis = V3(dir.z, 0, -dir.x); if (axis.lengthSq() < 1e-6) return;
  axis.normalize();
  ctx.mover.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
}
function scaleBody(ctx, x, y, z = x) { ctx.b.body.scale.multiply(V3(x, y, z)); }

const CLIPS = {
  attack(ctx, ct, o) {
    const S = ctx.size, gap = o.distance ?? ctx.lunge, dir = o.dir || V3(0, 0, 1);
    let z = 0, sx = 1, sy = 1, lean = 0;
    const tiltK = ctx.hasFace ? 0 : 14 * DEG;   // face monsters squint with their lids instead
    if (ct < 0.14) { const k = easeOutCubic(ct / 0.14); z = -0.25 * S * k; sx = lerp(1, 1.12, k); sy = lerp(1, 0.9, k); ctx.eyeTilt += tiltK * k; ctx.mover.rotation.z += Math.sin(ct * 90) * 1.6 * DEG * k; }
    else if (ct < 0.25) { const k = easeOutCubic((ct - 0.14) / 0.11); z = lerp(-0.25 * S, 0.7 * gap, k); sx = 0.9; sy = 1.15; lean = 18 * DEG * k; ctx.eyeTilt += tiltK; }
    else if (ct < 0.33) {
      z = 0.7 * gap; const k = 1 - seg(ct, 0.25, 0.33); sx = 1 + 0.12 * k; sy = 1 - 0.12 * k; lean = 18 * DEG * k; ctx.eyeTilt += tiltK;
      if (!o._hit) { o._hit = true; ctx.emit('impact', o); if (typeof o.onImpact === 'function') { try { o.onImpact(); } catch (e) { reportError('Monsters onImpact', e); } } ctx.fx.sparkle(ctx.center().add(dir.clone().multiplyScalar(0.7 * gap + ctx.radius * 0.8)), 4, 0.2 * S, { size: 0.07 * Math.sqrt(S), life: 0.3, speed: 1.6 }); }
    } else if (ct < 0.51) { const k = seg(ct, 0.33, 0.51); z = 0.7 * gap - 0.08 * S * Math.sin(k * Math.PI); sx = 1 + 0.05 * Math.sin(k * TAU * 1.5) * (1 - k); sy = 1 - 0.05 * Math.sin(k * TAU * 1.5) * (1 - k); }
    else if (ct < 0.73) { const k = easeInOutQuad(seg(ct, 0.51, 0.73)); z = lerp(0.7 * gap, 0, k); ctx.b.root.position.y += Math.sin(k * Math.PI) * 0.06 * S; }
    else { const k = seg(ct, 0.73, 0.75); sx = 1 + 0.06 * (1 - k); sy = 1 - 0.06 * (1 - k); }
    ctx.mover.position.addScaledVector(dir, z);
    applyLean(ctx, dir, lean);
    scaleBody(ctx, sx, sy);
    if (ctx.spec.attackPose) ctx.spec.attackPose(ctx, ct, o);
    return ct >= 0.75;
  },
  hurt(ctx, ct, o) {
    const S = ctx.size, dir = o.dir || V3(0, 0, -1), side = o.side || 1;
    ctx.flash = ct < 0.09 ? 0.8 : (ct > 0.15 && ct < 0.21 ? 0.35 : 0);
    const k = ct < 0.08 ? easeOutCubic(ct / 0.08) : 1 - easeInOutQuad(seg(ct, 0.14, 0.42));
    ctx.mover.position.addScaledVector(dir, 0.12 * S * k);
    ctx.mover.rotation.z += 6 * DEG * k * side;
    const ph = seg(ct, 0, 0.42), w = Math.sin(ph * TAU) * (1 - ph);
    scaleBody(ctx, 1 + 0.12 * w, 1 - 0.15 * w);
    if (ctx.hasFace) ctx.mover.position.x += Math.sin(ct * 70) * 0.012 * S * (1 - seg(ct, 0.05, 0.26));   // the "ow!" shudder
    else { ctx.eyeScale *= lerp(1, 0.25, hump(ct, 0.0, 0.34)); if (ct < 0.3) ctx.showOh = true; }
    if (ctx.spec.hurtPose) ctx.spec.hurtPose(ctx, ct, o);
    return ct >= 0.42;
  },
  cast(ctx, ct, o) {
    // eyes squeezed shut in concentration, a rising shiver that builds, then the release: a pop, a glow, a ring of stars
    const S = ctx.size;
    if (ct < 0.18) { const k = easeOutCubic(ct / 0.18); scaleBody(ctx, 1 + 0.1 * k, 1 - 0.1 * k); }
    else if (ct < 0.6) {
      const k = seg(ct, 0.18, 0.6);
      ctx.mover.position.y += 0.16 * S * easeOutCubic(k);
      ctx.mover.rotation.z += Math.sin(ct * 80) * (1.5 + 4 * k) * DEG;
      scaleBody(ctx, 1 - 0.05 * k + 0.02 * Math.sin(ct * 60), 1 + 0.08 * k);
      ctx.glow = 0.12 * k * (0.5 + 0.5 * Math.sin(ct * 40));
      if (!o._motes) { o._motes = true; ctx.fx.sparkle(ctx.center(), 5, ctx.radius * 1.1, { ring: true, size: 0.05 * Math.sqrt(S), life: 0.5, speed: -0.3, up: 0.5 }); }
    } else if (ctx.flying ? ct < 0.85 : ct < 0.8) {
      const k = seg(ct, 0.6, 0.7);
      ctx.mover.position.y += 0.16 * S; ctx.glow = hump(ct, 0.58, 0.82) * 0.45;
      scaleBody(ctx, 1 + 0.12 * hump(ct, 0.6, 0.72), 1 + 0.1 * hump(ct, 0.6, 0.72)); void k;
      if (!o._ring) { o._ring = true; ctx.fx.sparkle(ctx.center(), 10, ctx.radius * 2.6, { ring: true, size: 0.08 * Math.sqrt(S), life: 0.7, speed: 1.4, up: 0.2 }); }
      if (!ctx.hasFace) ctx.eyeScale *= 1.12;
    }
    else { const k = seg(ct, 0.8, 1.0); ctx.mover.position.y += 0.16 * S * (1 - easeInQuad(k)); if (k > 0.9) scaleBody(ctx, 1.06, 0.94); }
    if (ctx.spec.castPose) ctx.spec.castPose(ctx, ct, o);
    return ct >= 1.0;
  },
  taunt(ctx, ct, o) {
    if (ctx.spec.taunt) return ctx.spec.taunt(ctx, ct, o);
    // "nyah!": a cheeky side-to-side hop, a wink and a tongue out, then a smug waggle
    const S = ctx.size;
    const h1 = hump(ct, 0.06, 0.3), h2 = hump(ct, 0.32, 0.56);
    ctx.b.root.position.y += (h1 + h2) * 0.1 * S;
    ctx.mover.rotation.z += (h1 - h2) * 14 * DEG;
    ctx.b.root.position.x += (h1 - h2) * 0.07 * S;
    const wag = seg(ct, 0.58, 0.92);
    ctx.mover.rotation.y += Math.sin(wag * TAU * 2.5) * 16 * DEG * (wag > 0 && wag < 1 ? 1 - wag * 0.6 : 0);
    const boing = seg(ct, 0.9, 1.1), w = Math.sin(boing * TAU * 1.5) * (1 - boing) * (boing > 0 ? 1 : 0);
    scaleBody(ctx, 1 - 0.08 * w, 1 + 0.12 * w);
    if (!ctx.hasFace && ct < 0.56) { ctx.showOh = true; ctx.eyeScale *= 1.15; }
    return ct >= 1.1;
  },
  join(ctx, ct, o) {
    const S = ctx.size;
    if (!o._shown) { o._shown = true; ctx.setVisible(true); ctx.defeated = false; ctx.mood = 'friend'; ctx.fx.sparkle(ctx.center(), 6, ctx.radius * 1.6, { ring: true, size: 0.07 * Math.sqrt(S), life: 0.5, speed: 0.6 }); }
    let pop = 1;
    if (ct < 0.26) { const k = ct / 0.26; pop = k < 0.62 ? lerp(0.0, 1.18, easeOutCubic(k / 0.62)) : lerp(1.18, 1.0, easeInOutQuad((k - 0.62) / 0.38)); }
    ctx.mover.scale.multiplyScalar(pop);
    const b1 = seg(ct, 0.26, 0.58), b2 = seg(ct, 0.58, 0.9);
    const H = 0.35 * Math.sqrt(S);
    if (ct >= 0.26 && ct < 0.58) { ctx.b.root.position.y += H * 4 * b1 * (1 - b1); if (!ctx.hasFace) { ctx.showOh = true; ctx.eyeScale *= 1.15; } const st = Math.sin(b1 * Math.PI); scaleBody(ctx, 1 - 0.06 * st, 1 + 0.1 * st); }
    if (ct >= 0.58 && ct < 0.9) { ctx.b.root.position.y += H * 4 * b2 * (1 - b2); const st = Math.sin(b2 * Math.PI); scaleBody(ctx, 1 - 0.06 * st, 1 + 0.1 * st); }
    const land = Math.max(hump(ct, 0.56, 0.64), hump(ct, 0.88, 0.98));
    scaleBody(ctx, 1 + 0.12 * land, 1 - 0.14 * land);
    if (ct >= 0.9 && !o._spark) { o._spark = true; ctx.fx.sparkle(ctx.center().add(V3(0, ctx.height * 0.3, 0)), 3, ctx.radius * 1.2, { size: 0.12 * Math.sqrt(S), life: 0.45, speed: 1.8, up: 0.8 }); ctx.fx.sparkle(ctx.center(), 5, ctx.radius * 1.8, { size: 0.06 * Math.sqrt(S), life: 0.6, speed: 1.0, up: 0.5, delay: 0.05 }); }
    if (ct >= 0.9) { const k = seg(ct, 0.9, 1.35); ctx.mover.rotation.z += Math.sin(k * TAU * 2) * 6 * DEG * (1 - k); if (!ctx.hasFace) ctx.eyeScale *= lerp(0.55, 1, easeInOutQuad(k)); }
    if (ctx.spec.joinPose) ctx.spec.joinPose(ctx, ct, o);
    return ct >= 1.35;
  },
  defeat(ctx, ct, o) {
    const style = (ctx.spec.defeat && !o.vanish) ? 'custom' : (o.style || ctx.spec.death || 'pop');
    if (style === 'custom') return ctx.spec.defeat(ctx, ct, o);
    return (DEATHS[style] || DEATHS.pop)(ctx, ct, o);
  },
};

/**
 * The dizzy beat a face monster has before it goes: spiral eyes, tongue out, a woozy sway and a sag. Returns how long
 * the beat is (0 for monsters without a face layer), so a death style can start after it.
 */
function dizzyBeat(ctx, ct, o, len) {
  if (!ctx.hasFace || o.quick) return 0;
  if (ct < len) {
    const k = ct / len, S = ctx.size;
    ctx.faceKey = 'dizzy';
    ctx.mover.rotation.z += Math.sin(ct * 19) * 9 * DEG * (0.6 + 0.4 * k);
    ctx.mover.rotation.y += Math.sin(ct * 13) * 10 * DEG;
    ctx.b.root.position.y -= 0.025 * S * easeOutCubic(k);
    scaleBody(ctx, 1 + 0.05 * k, 1 - 0.07 * k);
    if (!o._dizzyStars) { o._dizzyStars = true; ctx.fx.sparkle(ctx.center().add(V3(0, ctx.height * 0.45, 0)), 4, ctx.radius * 0.9, { ring: true, size: 0.05 * Math.sqrt(S), life: len + 0.15, speed: 0.5, up: 0.05 }); }
  }
  return len;
}
/** Keep named parts (a hat, a monocle) their own shape while the body squashes: undo the inherited scale. */
function keepShape(ctx, names) {
  if (!names) return;
  for (const n of names) {
    const bn = ctx.b[n]; if (!bn) continue;
    let sx = 1, sy = 1, sz = 1, p = bn.parent;
    while (p && p.isBone) { sx *= p.scale.x; sy *= p.scale.y; sz *= p.scale.z; p = p.parent; }
    bn.scale.set(bn.scale.x / Math.max(0.05, sx), bn.scale.y / Math.max(0.05, sy), bn.scale.z / Math.max(0.05, sz));
  }
}

/** The poof: puffs + body-colour chunks + sparkles, then the body is gone. */
function poof(ctx, o, { scale = 1, chunks = 8, at = null } = {}) {
  const S = ctx.size * scale, c = at || ctx.center();
  const pr = Math.max(0.06, ctx.radius * 0.34) * scale;
  // the puff carries the monster's own colour, so a Gloop's poof is not a Peckish's
  ctx.fx.puff(c, 6, ctx.radius * 1.3 * scale, pr, { life: 0.42 });
  ctx.fx.puff(c, 4, ctx.radius * 1.1 * scale, pr * 0.8, { color: mixHex(MON.puff, ctx.bodyColor, 0.5), life: 0.36, up: 0.75, delay: 0.04 });
  if (chunks) ctx.fx.chunks(c, chunks, ctx.radius * scale, ctx.bodyColor, { size: Math.max(0.035, ctx.radius * 0.16) * scale, speed: 2.4 * Math.sqrt(S) });
  ctx.fx.sparkle(c, 6, ctx.radius * 2 * scale, { size: 0.085 * Math.sqrt(S), life: 0.65, speed: 1.3 * Math.sqrt(S), up: 0.8, delay: 0.06 });
  ctx.setVisible(false);
  ctx.emit('poof', o);
  if (ctx.spec.say) ctx.say(ctx.spec.say);
}
const DEATHS = {
  pop(ctx, ct, o) {
    const d = dizzyBeat(ctx, ct, o, 0.3);
    if (ct < d) return false;
    const t = ct - d;
    if (t < 0.09) { const k = easeOutCubic(t / 0.09); ctx.mover.scale.multiplyScalar(lerp(1, 1.25, k)); ctx.eyeScale *= 1.25; ctx.showOh = true; ctx.faceKey = 'surprise'; ctx.flash = 0.25 * k; }
    else if (!o._poof) { o._poof = true; poof(ctx, o); }
    return t >= 0.7;
  },
  deflate(ctx, ct, o) {
    const d = dizzyBeat(ctx, ct, o, 0.24);
    if (ct < d) { keepShape(ctx, ctx.spec.keepShape); return false; }
    const t = ct - d;
    if (t < 0.26) { const k = easeInQuad(t / 0.26); scaleBody(ctx, lerp(1, 1.4, k), lerp(1, 0.1, k)); if (!ctx.hasFace) { ctx.eyeScale *= lerp(1, 1.3, k); ctx.showOh = true; } }
    else if (t < 0.33) { const k = seg(t, 0.26, 0.33); scaleBody(ctx, 1.4 * (1 + 0.15 * k), 0.1); }
    else if (!o._poof) { o._poof = true; poof(ctx, o, { scale: 0.7, at: ctx.center().setY(0.08 * ctx.size) }); }
    keepShape(ctx, ctx.spec.keepShape);
    return t >= 0.9;
  },
  fold(ctx, ct, o) {
    const S = ctx.size;
    if (ct < 0.12) { const k = easeOutCubic(ct / 0.12); scaleBody(ctx, lerp(1, 1.25, k), lerp(1, 0.2, k), lerp(1, 1.25, k)); }
    else if (ct < 0.42) {
      const k = seg(ct, 0.12, 0.42);
      scaleBody(ctx, 1.25, 0.2, 1.25);
      ctx.mover.rotation.x -= 3 * Math.PI * easeInOutQuad(k);
      ctx.mover.position.y += 0.9 * S * 4 * k * (1 - k) * 0.8;
      ctx.mover.position.z -= 0.6 * S * k; ctx.mover.position.x += 0.25 * S * k;
      ctx.mover.scale.multiplyScalar(1 - 0.6 * easeInQuad(k));
    } else if (!o._poof) { o._poof = true; poof(ctx, o, { scale: 0.6, chunks: 0, at: ctx.center().add(V3(0.25 * S, 0.1 * S, -0.6 * S)) }); }
    return ct >= 0.8;
  },
  wisp(ctx, ct, o) {
    const S = ctx.size;
    if (ct < 0.6) {
      const k = seg(ct, 0, 0.6);
      ctx.mover.position.y += 0.45 * S * easeInQuad(k);
      scaleBody(ctx, 1 - 0.85 * easeInQuad(k), 1 + 0.3 * k - 1.2 * easeInQuad(k) * 0.7);
      ctx.fade = 1 - easeInQuad(k);
      if (!o._wisps) { o._wisps = true; for (let i = 0; i < 12; i++) ctx.fx.spawn('blob', { pos: ctx.center().add(V3((Math.random() - 0.5) * ctx.radius * 1.6, (Math.random() - 0.3) * ctx.height * 0.6, (Math.random() - 0.5) * ctx.radius)), vel: V3((Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.9, 0).multiplyScalar(Math.sqrt(S)), life: 0.6 + Math.random() * 0.25, s0: 0.05 * Math.sqrt(S), s1: 0.0, color: i % 3 ? ctx.bodyColor : MON.white, delay: i * 0.03 }); }
    } else if (!o._poof) { o._poof = true; ctx.fx.sparkle(ctx.center().add(V3(0, 0.45 * S, 0)), 6, ctx.radius * 1.6, { size: 0.08 * Math.sqrt(S), life: 0.6, up: 1.0 }); ctx.setVisible(false); ctx.emit('poof', o); }
    return ct >= 1.1;
  },
  crumble(ctx, ct, o) {
    const S = ctx.size, parts = ctx.spec.crumbleOrder || ctx.boneNames.filter(n => n !== 'root' && n !== 'body');
    const st = o._crumble || (o._crumble = parts.map((n, i) => ({ n, d: i * (0.42 / Math.max(1, parts.length)), vx: (Math.random() - 0.5) * 1.2, vz: 0.4 + Math.random() * 0.8, spin: (Math.random() - 0.5) * 8 })));
    for (const p of st) {
      const b = ctx.b[p.n]; if (!b) continue;
      const tt = Math.max(0, ct - p.d);
      if (tt <= 0) continue;
      const wp = ctx.boneRest[p.n];
      const fall = Math.min(Math.max(0, wp.y - (ctx.spec.crumbleFloor?.[p.n] ?? 0.08 * S)), 4.5 * tt * tt * S);
      if (p.n === ctx.spec.rollPart) {
        b.position.y -= fall; const roll = Math.max(0, tt - 0.25);
        b.position.z += 0.9 * S * easeOutCubic(roll / 0.6); b.rotation.x += 5.5 * easeOutCubic(roll / 0.6);
        if (tt > 0.85) b.scale.multiplyScalar(Math.max(0.001, 1 - (tt - 0.85) * 3));
        continue;
      }
      b.position.y -= fall; b.position.x += p.vx * tt * 0.5 * S; b.position.z += p.vz * tt * 0.5 * S;
      b.rotation.x += p.spin * tt * 0.5; b.rotation.z += p.spin * tt * 0.3;
      if (tt > 0.45) b.scale.multiplyScalar(Math.max(0.001, 1 - (tt - 0.45) * 2.2));
    }
    if (ct > 0.55 && !o._dust) { o._dust = true; ctx.fx.puff(V3(0, 0.08 * S, 0), 9, ctx.radius * 1.4, Math.min(0.22, Math.max(0.06, ctx.radius * 0.2)), { color: PAL.dirt.light, up: 0.25, life: 0.6 }); }
    const end = ctx.spec.crumbleEnd || 1.0;
    if (ct > end && !o._poof) { o._poof = true; ctx.fx.puff(V3(0, 0.15 * S, 0), 6, ctx.radius, Math.max(0.06, ctx.radius * 0.25), { life: 0.45 }); ctx.fx.sparkle(ctx.center().setY(ctx.height * 0.3), 6, ctx.radius * 1.8, { size: 0.09 * Math.sqrt(S), life: 0.6, up: 0.7 }); ctx.setVisible(false); ctx.emit('poof', o); }
    return ct >= end + 0.45;
  },
  snap(ctx, ct, o) {
    const S = ctx.size;
    ctx.snapK = ct < 0.08 ? easeInQuad(ct / 0.08) : 1;
    if (ctx.spec.snap) ctx.spec.snap(ctx, ctx.snapK, ct);
    if (ct >= 0.28 && ct < 0.5) { const k = seg(ct, 0.28, 0.5); ctx.b.root.position.y += 0.18 * S * 4 * k * (1 - k); ctx.eyeScale *= 1.3; ctx.showOh = true; }
    if (ct < 0.14) { const k = hump(ct, 0.06, 0.14); scaleBody(ctx, 1 + 0.1 * k, 1 - 0.1 * k); }
    if (ct >= 0.5 && ct < 0.58) ctx.mover.scale.multiplyScalar(lerp(1, 1.2, seg(ct, 0.5, 0.58)));
    if (ct >= 0.58 && !o._poof) { o._poof = true; poof(ctx, o); if (ctx.spec.coins) for (let i = 0; i < 10; i++) { const a = Math.random() * TAU; ctx.fx.spawn('blob', { pos: ctx.center(), vel: V3(Math.cos(a) * 1.5, 2.2 + Math.random() * 1.5, Math.sin(a) * 0.8 + 0.9).multiplyScalar(Math.sqrt(S)), grav: 9, life: 0.9, s0: 0.045 * Math.sqrt(S), s1: 0.04 * Math.sqrt(S), flat: 0.25, spin: 12, color: MON.coin, floor: 0.02 }); } }
    return ct >= 1.1;
  },
  topple(ctx, ct, o) {
    const S = ctx.size, w = ctx.radius * 0.9, side = o.side || 1;
    const k = easeInQuad(seg(ct, 0, 0.38)), a = -82 * DEG * k * side;
    // rotate about the ground edge at x = side * w
    const px = side * w;
    ctx.mover.rotation.z += a;
    ctx.mover.position.x += px - (px * Math.cos(a));
    ctx.mover.position.y += -(px * Math.sin(a));
    if (ct >= 0.38 && !o._thud) { o._thud = true; ctx.fx.puff(V3(side * (w + ctx.height * 0.5), 0.05 * S, 0), 6, ctx.height * 0.6, Math.min(0.2, Math.max(0.05, ctx.radius * 0.28)), { color: PAL.dirt.light, up: 0.2, life: 0.5 }); }
    if (ct >= 0.38 && ct < 0.5) { const q = hump(ct, 0.38, 0.5); scaleBody(ctx, 1 + 0.1 * q, 1 - 0.12 * q); }
    if (ct >= 0.62 && !o._poof) { o._poof = true; poof(ctx, o, { at: V3(side * (w + ctx.height * 0.4), ctx.radius * 0.6, 0) }); }
    return ct >= 1.1;
  },
  unwind(ctx, ct, o) {
    const S = ctx.size;
    if (ct < 0.6) {
      const k = seg(ct, 0, 0.6);
      ctx.mover.rotation.y += 14 * Math.PI * k * k;
      scaleBody(ctx, Math.max(0.001, 1 - easeInQuad(k)), Math.max(0.001, 1 + 0.2 * k - easeInQuad(Math.max(0, (k - 0.3) / 0.7))));
      ctx.mover.position.y += 0.1 * S * k;
    } else if (!o._poof) { o._poof = true; ctx.fx.sparkle(ctx.center(), 12, ctx.radius * 2.4, { size: 0.09 * Math.sqrt(S), life: 0.7, speed: 1.8 * Math.sqrt(S), up: 0.6 }); ctx.fx.puff(ctx.center(), 4, ctx.radius, 0.1 * Math.sqrt(S), { life: 0.35 }); ctx.setVisible(false); ctx.emit('poof', o); }
    return ct >= 1.1;
  },
};
// face monsters get a dizzy beat before the card-flip, the lid-snap and the topple too
for (const [k, len] of [['fold', 0.2], ['snap', 0.22], ['topple', 0.24]]) {
  const f = DEATHS[k];
  DEATHS[k] = (ctx, ct, o) => { const d = dizzyBeat(ctx, ct, o, len); return ct < d ? false : f(ctx, ct - d, o); };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 7. Templates + instances
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
function template(id) {
  if (TEMPLATES.has(id)) return TEMPLATES.get(id);
  const spec = SPECIES.get(id);
  const B = new Builder(id);
  let info = {};
  B.skin = spec.color || null; B.brows = spec.brows !== false;
  try { info = spec.build(B) || {}; } catch (e) { reportError(`Monsters.build(${id})`, e); }
  const k = spec.scale || 1;
  if (k !== 1) {
    for (const part of Object.values(B.parts)) for (const g of part) g.scale(k, k, k);
    for (const bn of B.bones) bn.pos.multiplyScalar(k);
    if (info.height) info.height *= k; if (info.radius) info.radius *= k; if (info.shadow) info.shadow *= k;
  }
  const geos = B.build();
  let height = info.height, radius = info.radius;
  if (!(height > 0) || !(radius > 0)) {
    const bs = new THREE.Box3();
    for (const g of Object.values(geos)) { g.computeBoundingBox(); bs.union(g.boundingBox); }
    height = height > 0 ? height : Math.max(0.2, bs.max.y);
    radius = radius > 0 ? radius : Math.max(0.1, (bs.max.x - bs.min.x) / 2);
  }
  const T = { id, spec, bones: B.bones, geos, meta: B.meta, height, radius, shadow: info.shadow ?? radius * 2.1, bodyColor: info.color || spec.color || MON.gloop,
    tris: Object.values(geos).reduce((n, g) => n + g.attributes.position.count / 3, 0) | 0 };
  TEMPLATES.set(id, T);
  return T;
}

let instanceCounter = 0;
const IDENTITY = new THREE.Matrix4();

function instantiate(T) {
  const spec = T.spec, seed = 1000 + (++instanceCounter) * 7919;
  const rand = rng(seed);
  const root = new THREE.Group(); root.name = `monster:${T.id}`;
  const bodyGroup = new THREE.Group(); bodyGroup.name = 'monster-body'; root.add(bodyGroup);
  const mover = new THREE.Group(); mover.name = 'monster-mover'; bodyGroup.add(mover);

  // skeleton: bind with every bone at scale 1 (a zero-scale bone would make a singular inverse)
  const bones = T.bones.map(b => { const bn = new THREE.Bone(); bn.name = b.name; return bn; });
  const rest = {}, restScale = {}, worldRest = {};
  T.bones.forEach((b, i) => {
    const p = b.pos.clone(); if (b.parent >= 0) p.sub(T.bones[b.parent].pos);
    bones[i].position.copy(p);
    rest[b.name] = p.clone(); restScale[b.name] = b.scale; worldRest[b.name] = b.pos.clone();
    if (b.parent >= 0) bones[b.parent].add(bones[i]);
  });
  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mover.add(bones[0]);

  const preset = spec.toon;
  const mats = {
    toon: makeToon({ vertexColors: true }, preset),
    unlit: new THREE.MeshBasicMaterial({ vertexColors: true }),
    trans: makeToon({ vertexColors: true, transparent: true, depthWrite: false, side: spec.transDouble ? THREE.DoubleSide : THREE.FrontSide }, preset),
    hull: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }),
  };
  if (spec.ghostGlow) mats.trans.emissive = C3(spec.ghostGlow).multiplyScalar(0.22);
  const baseEmissive = { toon: mats.toon.emissive.clone(), trans: mats.trans.emissive.clone() };
  const meshes = {};
  for (const k of BUCKETS) {
    const g = T.geos[k]; if (!g) continue;
    const mesh = new THREE.SkinnedMesh(g, mats[k]);
    mesh.bind(skeleton, IDENTITY);
    mesh.frustumCulled = false; mesh.name = `monster:${T.id}:${k}`;
    mesh.castShadow = k === 'toon' || (k === 'trans' && spec.transShadow);
    mesh.receiveShadow = false;
    if (k === 'trans') mesh.renderOrder = 2;
    bodyGroup.add(mesh); meshes[k] = mesh;
  }
  // A ghost is ONE clean layer: a depth-only pre-pass writes the nearest surface, so the colour pass can never blend the
  // body's far side over its near side (that was the sorting band through Boohoo), and the outline shell behind it is
  // depth-rejected instead of showing through.
  if (spec.ghost && meshes.trans) {
    mats.prepass = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true });
    const pre = new THREE.SkinnedMesh(meshes.trans.geometry, mats.prepass);
    pre.bind(skeleton, IDENTITY);
    pre.frustumCulled = false; pre.name = `monster:${T.id}:prepass`; pre.renderOrder = 1;
    bodyGroup.add(pre); meshes.prepass = pre;
    if (meshes.hull) { mats.hull.transparent = true; meshes.hull.renderOrder = 1.5; }
  }
  for (const [n, s] of Object.entries(restScale)) if (s !== 1) bones.find(b => b.name === n).scale.setScalar(s);

  const shadow = makeContactShadow(1);
  shadow.name = 'monster-shadow';
  bodyGroup.add(shadow);

  const fx = new Fx(root);
  const listeners = new Map();
  const bubbleMat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false });
  const bubble = new THREE.Sprite(bubbleMat); bubble.visible = false; bubble.renderOrder = 30; bubble.name = 'monster-say'; bubble.frustumCulled = false;
  root.add(bubble);
  const say = { t: -1, text: '', x: 0, y: 0, z: 0 };
  const b = Object.fromEntries(bones.map(x => [x.name, x]));
  const size = Math.max(0.6, T.height / 0.535);

  const ctx = {
    id: T.id, spec, b, mover, fx, rand, size, springs: {},
    height: T.height, radius: T.radius, bodyColor: T.bodyColor,
    boneNames: bones.map(x => x.name), boneRest: worldRest,
    lunge: Math.max(0.9, 0.9 + T.radius * 1.2),
    t: rand() * 10, idleW: 1, hopY: 0, hopMax: 1, flying: false, vx: 0, seedA: rand() * TAU,
    mood: spec.mood || 'wild', faceKey: null, hasFace: T.meta.face.eyes.length > 0 || Object.keys(T.meta.face.mouths).length > 0,
    eyeScale: 1, eyeTilt: 0, showOh: false, flash: 0, glow: 0, fade: 1, snapK: 0, lids: [0, 0], shadowK: 1,
    defeated: false, visible: true,
    emit(evt, payload) { const set = listeners.get(evt); if (set) for (const fn of Array.from(set)) { try { fn(payload); } catch (e) { reportError(`Monsters ${T.id} on(${evt})`, e); } } },
    setVisible(v) { ctx.visible = !!v; bodyGroup.visible = !!v; },
    /** Say one short line in a bubble above the head (also emitted as the 'say' event). */
    say(text) {
      const tex = bubbleTexture(String(text)); ctx.emit('say', text); if (!tex) return;
      bubbleMat.map = tex; bubbleMat.needsUpdate = true; say.t = 0; say.text = String(text);
      say.x = mover.position.x + b.root.position.x; say.y = Math.max(0.25, mover.position.y + b.root.position.y) + T.height * 0.92 + 0.1 * Math.sqrt(size); say.z = mover.position.z + b.root.position.z + T.radius * 0.3;
    },
    center() { return V3(mover.position.x + b.root.position.x, mover.position.y + b.root.position.y + T.height * 0.5, mover.position.z + b.root.position.z); },
  };
  const blink = { at: 1 + rand() * 3, t: -1, wink: 0 };
  const faceEyeSet = new Set(T.meta.face.eyes.map(e => e.eye));
  const face = { key: '', lid: [0.4, 0.4], brow: [[0, 0], [0, 0]], tilt: 0, look: [0, 0], mouth: '', eyes: 'open' };
  const clip = { name: 'idle', t: 0, opts: {}, resolve: null };

  function resetPose() {
    for (const bn of bones) { const r = rest[bn.name]; bn.position.copy(r); bn.rotation.set(0, 0, 0); bn.scale.setScalar(restScale[bn.name]); }
    mover.position.set(0, 0, 0); mover.rotation.set(0, 0, 0); mover.scale.set(1, 1, 1);
    ctx.eyeScale = 1; ctx.eyeTilt = 0; ctx.showOh = false; ctx.flash = 0; ctx.glow = 0; ctx.snapK = 0; ctx.flying = !!spec.hover; ctx.fade = 1;
    ctx.hopY = 0; ctx.hopMax = 1; ctx.lids[0] = 0; ctx.lids[1] = 0; ctx.shadowK = 1; ctx.faceKey = null;
  }
  function finish(ok) {
    const r = clip.resolve; clip.resolve = null;
    if (r) { try { r(ok); } catch (_) {} }
  }

  function update(dt) {
    try {
      dt = Math.max(0, Math.min(0.1, +dt || 0));
      ctx.t += dt; clip.t += dt;
      ctx.dt = dt;
      const wantW = CLIP_IDLE_W[clip.name] ?? 1;
      ctx.idleW += (wantW - ctx.idleW) * Math.min(1, dt * (wantW > ctx.idleW ? 6 : 18));
      resetPose();
      if (clip.name !== 'dead') {
        try { if (spec.idle) spec.idle(ctx, ctx.t, dt); else hop(ctx, ctx.t); } catch (e) { reportError(`Monsters ${T.id} idle`, e); }
      }
      if (clip.name !== 'idle' && clip.name !== 'dead') {
        let done = false;
        try { done = CLIPS[clip.name](ctx, clip.t, clip.opts); } catch (e) { reportError(`Monsters ${T.id} clip ${clip.name}`, e); done = true; }
        if (done) {
          const was = clip.name;
          if (was === 'defeat') { ctx.defeated = true; clip.name = 'dead'; ctx.emit('defeated', clip.opts); }
          else { clip.name = 'idle'; clip.t = 0; clip.opts = {}; }
          ctx.emit('end', was);
          finish(true);
        }
      } else if (clip.name === 'dead' && ctx.visible && spec.deadPose) {
        try { spec.deadPose(ctx, ctx.t, clip.opts); } catch (e) { reportError(`Monsters ${T.id} deadPose`, e); }
      }
      // blinks
      if (ctx.t >= blink.at) { blink.t = 0; blink.wink = (spec.winkAll || (spec.winky && rand() < 0.2)) ? (rand() < 0.5 ? -1 : 1) : 0; blink.at = ctx.t + 2.5 + rand() * 2.5; }
      let blinkY = 1;
      if (blink.t >= 0) { blink.t += dt; const k = blink.t < 0.06 ? blink.t / 0.06 : 1 - (blink.t - 0.06) / 0.06; blinkY = 1 - 0.94 * clamp01(k); if (blink.t > 0.12) blink.t = -1; }
      if (spec.noBlink) blinkY = 1;
      const blinkClose = [(blink.wink === 0 || blink.wink === -1) ? 1 - blinkY : 0, (blink.wink === 0 || blink.wink === 1) ? 1 - blinkY : 0];
      const eyes = T.meta.eyes;
      for (let i = 0; i < eyes.length; i++) {
        if (faceEyeSet.has(eyes[i])) continue;
        const e = b[eyes[i]]; if (!e) continue;
        const side = /L$/.test(eyes[i]) ? -1 : 1;
        const by = ((blink.wink === 0 || blink.wink === side) ? blinkY : 1) * Math.max(0.04, 1 - 0.96 * clamp01(ctx.lids[side < 0 ? 0 : 1]));
        e.scale.x *= ctx.eyeScale; e.scale.y *= ctx.eyeScale * by; e.scale.z *= ctx.eyeScale;
        e.rotation.z += side * ctx.eyeTilt;
      }
      if (ctx.hasFace) {
        try { driveFace(ctx, T, face, dt, clip.name, clip.t, blinkClose); } catch (e) { reportError(`Monsters ${T.id} face`, e); }
      } else if (T.meta.ohs.length) {
        for (const n of T.meta.ohs) if (b[n]) b[n].scale.setScalar(ctx.showOh ? 1 : 0);
        if (ctx.showOh) for (const n of T.meta.mouths) if (b[n]) b[n].scale.multiplyScalar(0.0001);
      }
      if (spec.post) { try { spec.post(ctx, ctx.t, dt, clip.name); } catch (e) { reportError(`Monsters ${T.id} post`, e); } }
      // flash + glow + fade
      const fl = Math.max(ctx.flash, 0);
      mats.toon.emissive.copy(baseEmissive.toon).lerp(WHITE, fl);
      if (ctx.glow > 0) mats.toon.emissive.lerp(GLOW, ctx.glow);
      mats.trans.emissive.copy(baseEmissive.trans).lerp(WHITE, fl);
      if (spec.ghostOpacity) mats.trans.opacity = Math.min(1, spec.ghostOpacity(ctx.t) + fl * 0.5) * ctx.fade;
      else if (ctx.fade < 1) mats.trans.opacity = ctx.fade;
      else mats.trans.opacity = 1;
      // contact shadow follows the body on the ground and shrinks as it rises
      const hx = mover.position.x + b.root.position.x, hz = mover.position.z + b.root.position.z;
      const lift = Math.max(0, mover.position.y + b.root.position.y);
      const k = ctx.flying ? 1 - 0.45 * clamp01(lift / (1.2 * size)) : 1 - 0.38 * clamp01(lift / Math.max(1e-4, ctx.hopMax));
      shadow.position.set(hx, 0.02, hz);
      const sz = T.shadow * Math.max(0.2, k) * Math.max(0.05, mover.scale.x) * Math.max(0.01, ctx.shadowK);
      shadow.scale.set(sz, 1, sz * (spec.shadowZ || 0.85));
      shadow.visible = ctx.visible;
      fx.update(dt);
      // the say-bubble: pops in above the head, drifts up, fades
      if (say.t >= 0) {
        say.t += dt;
        const L = 1.7, k2 = say.t / L;
        if (k2 >= 1) { say.t = -1; bubble.visible = false; }
        else {
          const w = 0.62 * Math.sqrt(size) * (say.t < 0.22 ? easeOutBack(say.t / 0.22, 2.2) : 1);
          bubble.scale.set(w, w / (bubbleMat.map?.userData.aspect || 2.46), 1);
          bubble.position.set(say.x + T.radius * 0.35, say.y + 0.12 * Math.sqrt(size) * easeOutCubic(k2), say.z);
          bubbleMat.opacity = 1 - smooth(0.78, 1, k2);
          bubble.visible = true;
        }
      }
    } catch (e) { reportError(`Monsters ${T.id} update`, e); }
  }

  function play(name, opts = {}) {
    try {
      const n = String(name || 'idle');
      if (!CLIPS[n] && n !== 'idle') { reportError('Monsters.play', new Error(`unknown clip "${n}" for ${T.id}`)); return Promise.resolve(false); }
      finish(false);
      if (n === 'idle') {
        if (ctx.defeated || !ctx.visible) { ctx.defeated = false; ctx.setVisible(true); }
        clip.name = 'idle'; clip.t = 0; clip.opts = {};
        return Promise.resolve(true);
      }
      if (ctx.defeated && n !== 'join' && n !== 'defeat') { ctx.defeated = false; ctx.setVisible(true); }
      if (n === 'defeat' && ctx.defeated) return Promise.resolve(true);
      clip.name = n; clip.t = 0; clip.opts = Object.assign({}, opts || {});
      return new Promise((res) => { clip.resolve = res; });
    } catch (e) { reportError('Monsters.play', e); return Promise.resolve(false); }
  }

  const monster = {
    id: T.id, name: spec.name, root, radius: T.radius, height: T.height,
    play, update,
    onHit(point) {
      try {
        let dir = V3(0, 0, -1), side = rand() < 0.5 ? -1 : 1;
        if (point && Number.isFinite(point.x)) {
          root.updateMatrixWorld(true);
          const lp = root.worldToLocal(V3(point.x, point.y ?? T.height * 0.5, point.z));
          const d = V3(-lp.x, 0, -lp.z); if (d.lengthSq() > 1e-6) dir = d.normalize();
          side = lp.x >= 0 ? -1 : 1;
          const sp = lp.clone(); sp.y = THREE.MathUtils.clamp(sp.y, 0.05, T.height * 1.1);
          const flat = V3(sp.x, 0, sp.z); if (flat.length() > T.radius * 1.1) flat.setLength(T.radius * 1.1); sp.x = flat.x; sp.z = flat.z;
          fx.sparkle(sp, 4, 0.15 * size, { size: 0.08 * Math.sqrt(size), life: 0.28, speed: 2.0, up: 0.2, color: MON.white, alt: MON.spark });
        } else fx.sparkle(ctx.center().add(V3(0, 0, T.radius * 0.8)), 4, 0.15 * size, { size: 0.08 * Math.sqrt(size), life: 0.28, speed: 2.0, up: 0.2, color: MON.white, alt: MON.spark });
        return play('hurt', { dir, side });
      } catch (e) { reportError('Monsters.onHit', e); return Promise.resolve(false); }
    },
    on(evt, fn) { if (typeof fn !== 'function') return () => {}; if (!listeners.has(evt)) listeners.set(evt, new Set()); listeners.get(evt).add(fn); return () => listeners.get(evt).delete(fn); },
    get clip() { return clip.name; },
    get defeated() { return ctx.defeated; },
    get visible() { return ctx.visible; },
    center() { return ctx.center(); },
    top() { return V3(mover.position.x + b.root.position.x, mover.position.y + b.root.position.y + T.height + 0.15 * size, mover.position.z + b.root.position.z); },
    say(text) { try { ctx.say(text); } catch (e) { reportError('Monsters.say', e); } },
    state() { return { id: T.id, name: spec.name, clip: clip.name, t: +clip.t.toFixed(2), mood: ctx.mood, face: ctx.hasFace ? { state: face.key, eyes: face.eyes, mouth: face.mouth, lids: face.lid.map(v => +v.toFixed(2)) } : null, defeated: ctx.defeated, visible: ctx.visible, fx: fx.alive, say: say.t >= 0 ? say.text : null, height: +T.height.toFixed(3), radius: +T.radius.toFixed(3) }; },
    /** 'wild' (sly enemy face) | 'friend' (the beaming face a monster keeps once it has joined). */
    get mood() { return ctx.mood; },
    set mood(m) { ctx.mood = m === 'friend' ? 'friend' : 'wild'; },
    setMood(m) { ctx.mood = m === 'friend' ? 'friend' : 'wild'; return ctx.mood; },
    dispose() {
      try {
        finish(false);
        root.removeFromParent();
        for (const m of Object.values(mats)) m.dispose();
        bubbleMat.dispose();
        for (const m of Object.values(meshes)) { m.removeFromParent(); }
        skeleton.dispose();
        fx.dispose();
        listeners.clear();
      } catch (e) { reportError('Monsters.dispose', e); }
    },
    _ctx: ctx, _meshes: meshes, _template: T,
  };
  update(0);
  return monster;
}
const WHITE = new THREE.Color(1, 1, 1);
const GLOW = C3(PAL.ui.cursor).multiplyScalar(0.9);

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 8. Public API
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const Monsters = {
  /** Build a monster instance. Unknown ids build a Gloop (and say so in __DQ.errors). */
  build(id) {
    try {
      let key = String(id || '').toLowerCase();
      if (!SPECIES.has(key)) { reportError('Monsters.build', new Error(`unknown monster "${id}" — building a Gloop`)); key = 'gloop'; }
      return instantiate(template(key));
    } catch (e) {
      reportError('Monsters.build', e);
      const root = new THREE.Group();
      return { id, name: String(id), root, radius: 0.3, height: 0.5, play: () => Promise.resolve(false), update() {}, onHit: () => Promise.resolve(false), on: () => () => {}, center: () => V3(0, 0.25, 0), top: () => V3(0, 0.6, 0), state: () => ({ id, error: true }), dispose() { root.removeFromParent(); } };
    }
  },
  list() { return Array.from(SPECIES.keys()); },
  has(id) { return SPECIES.has(String(id)); },
  info(id) {
    const s = SPECIES.get(String(id)); if (!s) return null;
    const T = template(s.id);
    return { id: s.id, name: s.name, family: s.family, boss: !!s.boss, story: !!s.story, death: s.defeat ? 'custom' : s.death, height: +T.height.toFixed(3), radius: +T.radius.toFixed(3), tris: T.tris, bones: T.bones.length, buckets: Object.keys(T.geos) };
  },
  /** Pre-build geometry for ids (e.g. a battle's formation) so the first frame doesn't hitch. */
  prewarm(ids = null) { const t0 = performance.now(); for (const id of (ids || Monsters.list())) { try { template(id); } catch (e) { reportError('Monsters.prewarm', e); } } return Math.round(performance.now() - t0); },
  clips: ['idle', 'attack', 'cast', 'hurt', 'defeat', 'join', 'taunt'],
  colors: MON,
};
export default Monsters;
