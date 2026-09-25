/**
 * map.js — map data format, the map registry, map LAYERS, tile collision and interaction queries.  (integrator-owned)
 *
 *   import { Maps, GameMap, PLAYER_RADIUS } from './world/map.js';
 *   await Maps.loadAll();                     // imports src/world/maps/index.js, every map and its layer files
 *   Maps.register(meadowDef);                 // (or register a def object by hand: demos, tests)
 *   const map = Maps.load('meadow');          // -> a fresh GameMap: the base def with its layers merged in
 *   const p = map.move(x, z, dx, dz);         // -> {x, z, blocked, nx, nz}  circle r = 0.35, smooth wall sliding
 *
 * ── Files and layers (so the pieces that fill a map never edit the same file) ─────────────────────────────────
 *   src/world/maps/index.js        [{id, layers?}]  every map the game knows (P23). layers defaults to ['npcs', 'chests'].
 *   src/world/maps/<id>.js         the BASE def (P23): ground, props, colliders, exits, camera, music, view() art.
 *   src/world/maps/<id>.npcs.js    the PEOPLE layer (P11): {npcs: [...], lines: {key: text}} — who stands where, what
 *                                  every person, sign, door, animal and lane end says. Base entities name a line with
 *                                  `line: 'key'`; the layer supplies the words.
 *   src/world/maps/<id>.chests.js  the TREASURE layer (P30): {chests: [...], props?: [...], lines?: {...}}.
 *   A layer module default-exports an object, or fn(baseDef) -> object. Every listed layer file must exist (an empty
 *   `export default {}` is fine) — a missing one is a 404, which the harness counts as a failure. Maps.addLayer(id,
 *   kind, layer) registers one by hand. Merge at load: arrays (npcs, chests, props, exits, colliders, occluders) are
 *   appended after the base's; `lines` objects are merged (later layers win); everything else comes from the base.
 *
 * ── The def (ARCHITECTURE.md, plus the extensions marked +) ──────────────────────────────────────────────────
 *   id, name, kind, size: [w, h] (tiles; 1 tile = 1 world unit), theme, music, light, weather, encounters
 *   + origin: [x0, z0]      world position of the corner of tile (0, 0). Default [0, 0]. A centred map uses [-w/2, -h/2].
 *   + res: n                collision cells per tile along each axis (default 1). 4 = quarter-tile cells, for
 *                           organic edges like stream banks. `tiles.solid` is then sampled per cell.
 *   tiles: {
 *     height: fn(x, z) -> y (world coords)  |  Float32Array((w+1)*(h+1)) vertex heights, bilinear
 *     solid:  fn(x, z, i, j) -> bool, called once per CELL CENTRE at load (i, j = cell indices)  |  Uint8Array(cells)
 *     ground: fn(x, z) -> 'grass'|'dirt'|'stone'|'wood'|'sand'|'snow'|'water'  |  Uint8Array(w*h) of GROUND_IDS index
 *   }
 *   props:  [{type, x, z, rot?, solid?: {r} | {w, d} | {pts, r}, text?, talk?, line?, voice?, name?, reach?}]
 *           A prop with `text` (markup string or page array), `talk(ctx)`, or a `line` its layers fill is
 *           INTERACTABLE: confirm near it talks.
 *   npcs:   [{id, char, x, z, facing?, wander?, script?, text?, line?, voice?, name?}]   (P11 brings them to life)
 *   + chests: [{id, x, z, item?, gold?, kind?, text?, talk?, line?, flag?}]             (P30 opens them)
 *   exits:  [{x, z, w?, h?, to, tx, tz, kind, text?, line?, back?}]
 *   + lines: {key: text | pages[] | {text, voice?, name?}}      words for anything above that names a `line`
 *   + colliders: [{type:'circle', x, z, r} | {type:'box', x, z, w, d, rot} | {type:'capsule', pts:[[x,z]...], r}]
 *   + spawn: {x, z, facing}     default arrival point (facing: radians, 0 = toward -z / "north")
 *   + camera: {orbit, pitch, dist, fov, lookUp}                  default field camera for this map (degrees)
 *   + walkY(x, z, heightAt) -> y  the surface you stand on (bridges, decks); default = terrain height
 *   + occluders: [{type:'sphere', x, y, z, r}]   volumes the follow camera must not sit behind or inside (canopies,
 *                           roofs); map.cameraClearance() tests them
 *   + ambience: 'amb_meadow' | ...   the Sfx ambience bed main.js starts on map.enter
 *   + view(ctx) -> {update?(t, dt, ctx), dispose?(), state?()}   the art: builds meshes into ctx.scene. ctx has
 *                           {THREE, scene, rig, map, camera, App, blobs}. Recipes come from src/art/* via scenery.js.
 *   onEnter?(ctx)
 *
 * ── Collision ────────────────────────────────────────────────────────────────────────────────────────────────
 * The player is a circle (PLAYER_RADIUS = 0.35) moving over a grid of solid cells (tiles x res) plus static
 * circle / oriented-box / capsule colliders. Movement is sub-stepped (<= 0.15 u per step, no tunnelling) and each
 * step is resolved by repeatedly pushing out of the DEEPEST contact first. Pushing out along the contact normal
 * keeps the tangential part of the motion, which is what makes walls slide smoothly; deepest-first means the face
 * of a wall always wins over the corner of the next cell along it, so there are no corner snags on flat runs, and
 * outside corners are rounded by the circle itself. Everything outside the map rectangle is solid.
 */
import { reportError } from '../engine/debug.js';

export const PLAYER_RADIUS = 0.35;
export const GROUND_IDS = ['grass', 'dirt', 'stone', 'wood', 'sand', 'snow', 'water'];
/** The layer files a map has unless its index entry says otherwise: src/world/maps/<id>.<kind>.js */
export const LAYER_KINDS = ['npcs', 'chests'];

const STEP = 0.15;
const ITER = 6;
const EPS = 1e-6;

const registry = new Map();

function num(v, d) { return Number.isFinite(+v) ? +v : d; }

export class GameMap {
  constructor(def) {
    this.def = def || {};
    const d = this.def;
    this.id = String(d.id || 'unnamed');
    this.name = d.name || this.id;
    this.kind = d.kind || 'field';
    this.theme = d.theme || 'grass';
    this.music = d.music || null;
    const size = Array.isArray(d.size) ? d.size : [32, 32];
    this.w = Math.max(1, size[0] | 0);
    this.h = Math.max(1, size[1] | 0);
    this.origin = Array.isArray(d.origin) ? [num(d.origin[0], 0), num(d.origin[1], 0)] : [0, 0];
    this.res = Math.max(1, Math.min(8, d.res | 0 || 1));
    this.cw = this.w * this.res;                 // cells across
    this.ch = this.h * this.res;
    this.cell = 1 / this.res;                    // world size of one cell
    this.spawn = Object.assign({ x: this.origin[0] + this.w / 2, z: this.origin[1] + this.h / 2, facing: 0 }, d.spawn || {});
    this.props = Array.isArray(d.props) ? d.props.map((p, i) => Object.assign({ index: i }, p)) : [];
    this.npcs = Array.isArray(d.npcs) ? d.npcs.map(n => Object.assign({}, n)) : [];
    this.chests = Array.isArray(d.chests) ? d.chests.map(c => Object.assign({}, c)) : [];
    this.exits = Array.isArray(d.exits) ? d.exits.map(e => Object.assign({}, e)) : [];
    this.layers = Array.isArray(d.layers) ? d.layers.slice() : [];
    // words from the layers: anything naming a `line` (and saying nothing of its own) gets its text + voice here
    this.lines = Object.assign({}, d.lines || {});
    this.missingLines = [];
    for (const o of [...this.props, ...this.npcs, ...this.chests, ...this.exits]) this._applyLine(o);
    this.colliders = [];
    this.occluders = Array.isArray(d.occluders) ? d.occluders.filter(o => o && Number.isFinite(+o.r)) : [];
    this.stats = { buildMs: 0, solidCells: 0 };
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    this._buildHeight();
    this._buildSolid();
    this._buildGround();
    for (const c of (d.colliders || [])) this.addCollider(c);
    for (const p of this.props) if (p.solid) this.addCollider(propCollider(p));
    this.stats.buildMs = Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0);
  }

  /** Fill an entity's words from this.lines[entity.line] (text / pages, voice, name) unless it has its own. */
  _applyLine(o) {
    if (!o || o.line == null || o.text != null || typeof o.talk === 'function' || o.script != null) return;
    const w = this.lines[o.line];
    if (w == null) { this.missingLines.push(String(o.line)); return; }
    if (typeof w === 'string' || Array.isArray(w)) { o.text = w; return; }
    if (typeof w === 'object') {
      if (w.text != null) o.text = w.text;
      if (w.voice && !o.voice) o.voice = w.voice;
      if (w.name && !o.name) o.name = w.name;
    }
  }

  // ── terrain ───────────────────────────────────────────────────────────────────────────────────────────────
  _buildHeight() {
    const H = this.def.tiles && this.def.tiles.height;
    if (typeof H === 'function') { this._height = H; return; }
    if (H && H.length === (this.w + 1) * (this.h + 1)) {
      const W = this.w + 1, ox = this.origin[0], oz = this.origin[1], mw = this.w, mh = this.h;
      this._height = (x, z) => {
        const fx = Math.max(0, Math.min(mw - 1e-4, x - ox)), fz = Math.max(0, Math.min(mh - 1e-4, z - oz));
        const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
        const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], e = H[(j + 1) * W + i + 1];
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
      };
      return;
    }
    this._height = () => 0;
  }

  heightAt(x, z) {
    try { const y = this._height(x, z); return Number.isFinite(y) ? y : 0; } catch (e) { reportError(`map ${this.id} height`, e); this._height = () => 0; return 0; }
  }

  /** The surface a character stands on (terrain, or a bridge deck / walkway declared by the map). */
  walkY(x, z) {
    const f = this.def.walkY;
    if (typeof f !== 'function') return this.heightAt(x, z);
    try { const y = f(x, z, (a, b) => this.heightAt(a, b)); return Number.isFinite(y) ? y : this.heightAt(x, z); }
    catch (e) { reportError(`map ${this.id} walkY`, e); return this.heightAt(x, z); }
  }

  _buildSolid() {
    const S = this.def.tiles && this.def.tiles.solid;
    const n = this.cw * this.ch;
    const grid = new Uint8Array(n);
    if (typeof S === 'function') {
      const c = this.cell, ox = this.origin[0], oz = this.origin[1];
      try {
        for (let j = 0; j < this.ch; j++) for (let i = 0; i < this.cw; i++) grid[j * this.cw + i] = S(ox + (i + 0.5) * c, oz + (j + 0.5) * c, i, j) ? 1 : 0;
      } catch (e) { reportError(`map ${this.id} solid()`, e); }
    } else if (S && S.length === n) {
      for (let k = 0; k < n; k++) grid[k] = S[k] ? 1 : 0;
    } else if (S && S.length === this.w * this.h && this.res > 1) {
      for (let j = 0; j < this.ch; j++) for (let i = 0; i < this.cw; i++) grid[j * this.cw + i] = S[((j / this.res) | 0) * this.w + ((i / this.res) | 0)] ? 1 : 0;
    }
    let cnt = 0; for (let k = 0; k < n; k++) cnt += grid[k];
    this.stats.solidCells = cnt;
    this.solid = grid;
  }

  _buildGround() {
    const G = this.def.tiles && this.def.tiles.ground;
    if (typeof G === 'function') { this._ground = G; return; }
    if (G && G.length === this.w * this.h) {
      this._ground = (x, z) => {
        const i = Math.floor(x - this.origin[0]), j = Math.floor(z - this.origin[1]);
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) return this.theme;
        return GROUND_IDS[G[j * this.w + i]] || this.theme;
      };
      return;
    }
    this._ground = () => this.theme;
  }

  groundAt(x, z) {
    try { return this._ground(x, z) || this.theme; } catch (e) { reportError(`map ${this.id} ground`, e); this._ground = () => this.theme; return this.theme; }
  }

  // ── grid queries ──────────────────────────────────────────────────────────────────────────────────────────
  inBounds(x, z) {
    return x >= this.origin[0] && z >= this.origin[1] && x < this.origin[0] + this.w && z < this.origin[1] + this.h;
  }

  tileAt(x, z) { return { i: Math.floor(x - this.origin[0]), j: Math.floor(z - this.origin[1]) }; }

  cellSolid(i, j) {
    if (i < 0 || j < 0 || i >= this.cw || j >= this.ch) return true;
    return this.solid[j * this.cw + i] === 1;
  }

  /** Is the point inside a solid cell or collider? (point test, radius 0) */
  solidAt(x, z) {
    const i = Math.floor((x - this.origin[0]) * this.res), j = Math.floor((z - this.origin[1]) * this.res);
    if (this.cellSolid(i, j)) return true;
    for (const c of this.colliders) if (contact(c, x, z, 0.001)) return true;
    return false;
  }

  /** Can a circle of radius r stand here? */
  clear(x, z, r = PLAYER_RADIUS) { return !this._deepest(x, z, r); }

  // ── colliders ─────────────────────────────────────────────────────────────────────────────────────────────
  addCollider(c) {
    if (!c) return null;
    const t = c.type || (c.pts ? 'capsule' : c.w != null ? 'box' : 'circle');
    let out = null;
    if (t === 'circle') out = { type: 'circle', x: num(c.x, 0), z: num(c.z, 0), r: Math.max(0.01, num(c.r, 0.3)) };
    else if (t === 'box') {
      const rot = num(c.rot, 0);
      out = { type: 'box', x: num(c.x, 0), z: num(c.z, 0), hw: Math.max(0.01, num(c.w, 1) / 2), hd: Math.max(0.01, num(c.d, 1) / 2), rot, c: Math.cos(rot), s: Math.sin(rot) };
    } else if (t === 'capsule' && Array.isArray(c.pts) && c.pts.length >= 2) {
      out = { type: 'capsule', pts: c.pts.map(p => [num(p[0], 0), num(p[1], 0)]), r: Math.max(0.01, num(c.r, 0.1)) };
    }
    if (!out) return null;
    out.tag = c.tag || null;
    out.bound = bounds(out);
    this.colliders.push(out);
    return out;
  }

  // ── movement ──────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Move a circle by (dx, dz) with smooth sliding. Returns {x, z, blocked, nx, nz, moved}.
   * `blocked` is true when a wall ate more than a third of the requested motion.
   */
  move(x, z, dx, dz, r = PLAYER_RADIUS, assist = 0.45) {
    const len = Math.hypot(dx, dz);
    let px = x, pz = z, nx = 0, nz = 0, hit = false;
    const steps = Math.max(1, Math.ceil(len / STEP));
    const sx = dx / steps, sz = dz / steps;
    for (let s = 0; s < steps; s++) {
      px += sx; pz += sz;
      const res = this.resolve(px, pz, r);
      px = res.x; pz = res.z;
      if (res.pushed) { hit = true; nx = res.nx; nz = res.nz; }
    }
    let moved = Math.hypot(px - x, pz - z), assisted = 0;
    // corner assist: walking almost straight into the EDGE of something (a post, a tree, a bridge end) nudges you
    // sideways round it instead of stopping dead — but only when a free way past is within `assist` units.
    if (assist > 0 && hit && len > 1e-5 && moved < len * 0.35) {
      const ux = dx / len, uz = dz / len;
      let bestOff = Infinity, bestSide = 0;
      for (const side of [1, -1]) {
        for (const off of [0.08, 0.16, 0.25, 0.35, assist]) {
          if (off > assist || off >= bestOff) break;
          const qx = x - uz * side * off, qz = z + ux * side * off;
          if (!this._deepest(qx, qz, r - 0.01) && !this._deepest(qx + ux * (r + 0.1), qz + uz * (r + 0.1), r - 0.01)) { bestOff = off; bestSide = side; break; }
        }
      }
      if (bestSide) {
        const slide = Math.min(len, bestOff);
        const r2 = this.resolve(px - uz * bestSide * slide, pz + ux * bestSide * slide, r);
        px = r2.x; pz = r2.z; assisted = bestSide;
        moved = Math.hypot(px - x, pz - z);
      }
    }
    return { x: px, z: pz, blocked: hit && moved < len * 0.66, hit, nx, nz, moved, assisted };
  }

  /** Push a circle out of everything it overlaps, deepest contact first. */
  resolve(x, z, r = PLAYER_RADIUS) {
    let px = x, pz = z, pushed = false, nx = 0, nz = 0;
    for (let k = 0; k < ITER; k++) {
      const c = this._deepest(px, pz, r);
      if (!c) break;
      px += c.nx * (c.depth + 1e-4); pz += c.nz * (c.depth + 1e-4);
      pushed = true; nx = c.nx; nz = c.nz;
    }
    return { x: px, z: pz, pushed, nx, nz };
  }

  _deepest(x, z, r) {
    let best = null;
    const ox = this.origin[0], oz = this.origin[1], cs = this.cell, res = this.res;
    const i0 = Math.floor((x - r - ox) * res), i1 = Math.floor((x + r - ox) * res);
    const j0 = Math.floor((z - r - oz) * res), j1 = Math.floor((z + r - oz) * res);
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!this.cellSolid(i, j)) continue;
        const minx = ox + i * cs, maxx = minx + cs, minz = oz + j * cs, maxz = minz + cs;
        const qx = x < minx ? minx : x > maxx ? maxx : x, qz = z < minz ? minz : z > maxz ? maxz : z;
        const ddx = x - qx, ddz = z - qz, d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r2) continue;
        let c;
        if (d2 > EPS) {
          const d = Math.sqrt(d2);
          c = { depth: r - d, nx: ddx / d, nz: ddz / d };
        } else {
          // centre inside the cell: leave through the nearest face that is not itself against a solid neighbour
          const opts = [
            { depth: x - minx + r, nx: -1, nz: 0, ok: !this.cellSolid(i - 1, j) },
            { depth: maxx - x + r, nx: 1, nz: 0, ok: !this.cellSolid(i + 1, j) },
            { depth: z - minz + r, nx: 0, nz: -1, ok: !this.cellSolid(i, j - 1) },
            { depth: maxz - z + r, nx: 0, nz: 1, ok: !this.cellSolid(i, j + 1) },
          ].sort((a, b) => (b.ok - a.ok) || (a.depth - b.depth));
          c = opts[0];
        }
        if (!best || c.depth > best.depth) best = c;
      }
    }
    for (const col of this.colliders) {
      const b = col.bound;
      if (x + r < b[0] || x - r > b[2] || z + r < b[1] || z - r > b[3]) continue;
      const c = contact(col, x, z, r);
      if (c && (!best || c.depth > best.depth)) best = c;
    }
    return best;
  }

  // ── interaction ───────────────────────────────────────────────────────────────────────────────────────────
  /** Props, NPCs (with a script or words) and chests (with words or a talk hook) that can be talked to. */
  interactables() {
    const out = [];
    for (const p of this.props) if (p.text != null || typeof p.talk === 'function') out.push(p);
    for (const n of this.npcs) if (n.script != null || n.text != null || typeof n.talk === 'function') out.push(n);
    for (const c of this.chests) if (c.text != null || typeof c.talk === 'function') out.push(c);
    return out;
  }

  /**
   * The best thing to talk to from (x, z) facing (fx, fz). Forgiving for small hands: anything within `reach`
   * (default 1.9, or the prop's own reach) counts, things in front are preferred, and something right beside
   * you counts even if you face away. Returns {target, dist, dot} or null.
   */
  nearestInteractable(x, z, fx = 0, fz = -1, reach = 1.9) {
    let best = null, bestScore = Infinity;
    const fl = Math.hypot(fx, fz) || 1;
    for (const t of this.interactables()) {
      const tx = t.ix ?? t.x, tz = t.iz ?? t.z;
      const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz), rch = t.reach ?? reach;
      if (d > rch) continue;
      const dot = d > 1e-3 ? (dx * fx + dz * fz) / (d * fl) : 1;
      if (dot < -0.2 && d > 0.9) continue;
      // A door underfoot always wins: a child on a doorstep must go in, not talk to the stall / hen / follower
      // two paces away (shots/P06-zdoors: inn→stall, bakery→hen, chapel→Halvard).
      let score = d * (1.6 - dot * 0.6);
      // Bias ONLY on the doorstep. Any far-range door bonus (even -2) still beat a closer barrel/herb at the
      // mill yard (P30 #6 / shots/P30-face: door d=2.25 scored under barrel d=1.2).
      if (t.type === 'door' && d < 1.2) score -= 20;
      if (score < bestScore) { bestScore = score; best = { target: t, dist: d, dot }; }
    }
    return best;
  }

  /**
   * How far a camera can sit from `origin` along unit direction `dir` (Vector3-likes) before an occluder blocks it.
   * Occluders that already contain the origin are ignored. Returns the free distance (<= maxDist).
   */
  cameraClearance(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    for (const o of this.occluders) {
      const cx = o.x - ox, cy = o.y - oy, cz = o.z - oz, r2 = o.r * o.r;
      const c2 = cx * cx + cy * cy + cz * cz;
      if (c2 <= r2) continue;                             // the player is inside it (walking under a canopy)
      const b = cx * dx + cy * dy + cz * dz;
      if (b <= 0) continue;
      const h = b * b - c2 + r2;
      if (h < 0) continue;
      const t = b - Math.sqrt(h);
      if (t > 0 && t < best) best = t;
    }
    return best;
  }

  exitAt(x, z) {
    // Prefer the nearest matching exit. Axis-aligned door pads can overlap; returning the first in array
    // order sent shop/chapel walkers into int_twins (shots/P06-clean).
    let best = null, bestD = Infinity;
    for (const e of this.exits) {
      const w = (e.w ?? 1) / 2, h = (e.h ?? 1) / 2;
      if (Math.abs(x - e.x) > w || Math.abs(z - e.z) > h) continue;
      const d = Math.hypot(x - e.x, z - e.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  describe() {
    return { id: this.id, name: this.name, kind: this.kind, size: [this.w, this.h], origin: this.origin.slice(), res: this.res,
      solidCells: this.stats.solidCells, colliders: this.colliders.length, occluders: this.occluders.length, props: this.props.length, interactables: this.interactables().length,
      npcs: this.npcs.length, chests: this.chests.length, layers: this.layers.slice(), lines: Object.keys(this.lines).length,
      missingLines: this.missingLines.slice(0, 8), exits: this.exits.length, music: this.music, buildMs: this.stats.buildMs };
  }
}

// ── collider maths ──────────────────────────────────────────────────────────────────────────────────────────
function propCollider(p) {
  const s = p.solid;
  if (s === true) return { type: 'circle', x: p.x, z: p.z, r: 0.35, tag: p.type };
  if (s.pts) return { type: 'capsule', pts: s.pts, r: s.r ?? 0.1, tag: p.type };
  if (s.w != null) return { type: 'box', x: s.x ?? p.x, z: s.z ?? p.z, w: s.w, d: s.d ?? s.w, rot: s.rot ?? p.rot ?? 0, tag: p.type };
  return { type: 'circle', x: s.x ?? p.x, z: s.z ?? p.z, r: s.r ?? 0.35, tag: p.type };
}

function bounds(c) {
  if (c.type === 'circle') return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
  if (c.type === 'box') { const e = Math.hypot(c.hw, c.hd); return [c.x - e, c.z - e, c.x + e, c.z + e]; }
  let a = Infinity, b = Infinity, e = -Infinity, f = -Infinity;
  for (const [x, z] of c.pts) { a = Math.min(a, x); b = Math.min(b, z); e = Math.max(e, x); f = Math.max(f, z); }
  return [a - c.r, b - c.r, e + c.r, f + c.r];
}

function fromPoint(x, z, qx, qz, reach) {
  const dx = x - qx, dz = z - qz, d2 = dx * dx + dz * dz;
  if (d2 >= reach * reach) return null;
  const d = Math.sqrt(d2);
  if (d < EPS) return { depth: reach, nx: 1, nz: 0 };
  return { depth: reach - d, nx: dx / d, nz: dz / d };
}

function contact(c, x, z, r) {
  if (c.type === 'circle') return fromPoint(x, z, c.x, c.z, r + c.r);
  if (c.type === 'box') {
    // to local space: rotation by rot about Y (object.rotation.y convention)
    const dx = x - c.x, dz = z - c.z;
    const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
    const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
    let nlx, nlz, depth;
    const ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
    if (d2 > EPS) {
      if (d2 >= r * r) return null;
      const d = Math.sqrt(d2); nlx = ex / d; nlz = ez / d; depth = r - d;
    } else {
      const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
      if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; depth = px + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; depth = pz + r; }
    }
    // back to world: inverse rotation
    return { depth, nx: nlx * c.c + nlz * c.s, nz: -nlx * c.s + nlz * c.c };
  }
  if (c.type === 'capsule') {
    let best = null;
    const reach = r + c.r;
    for (let k = 0; k < c.pts.length - 1; k++) {
      const [ax, az] = c.pts[k], [bx, bz] = c.pts[k + 1];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      const t = L2 > EPS ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2)) : 0;
      const hit = fromPoint(x, z, ax + vx * t, az + vz * t, reach);
      if (hit && (!best || hit.depth > best.depth)) best = hit;
    }
    return best;
  }
  return null;
}

// ── registry ────────────────────────────────────────────────────────────────────────────────────────────────
const LAYERS = new Map();        // map id -> Map(kind -> layer object | fn(baseDef))
const LOADED = new Map();        // map id -> {base: bool, layers: {kind: bool}} (what Maps.loadAll managed to import)
const MERGE_ARRAYS = ['npcs', 'chests', 'props', 'exits', 'colliders', 'occluders'];

/** The base def with every registered layer merged in (a prototype-linked copy: the base's getters and view stay live). */
function composeDef(base) {
  const kinds = LAYERS.get(String(base.id));
  if (!kinds || !kinds.size) return base;
  const parts = [];
  for (const [kind, layer] of kinds) {
    try {
      const part = typeof layer === 'function' ? layer(base) : layer;
      if (part && typeof part === 'object') parts.push([kind, part]);
    } catch (e) { reportError(`map "${base.id}" layer "${kind}"`, e); }
  }
  const def = Object.create(base);
  const own = (key, value) => Object.defineProperty(def, key, { value, enumerable: true, writable: true, configurable: true });
  for (const key of MERGE_ARRAYS) {
    const extra = [];
    for (const [, part] of parts) if (Array.isArray(part[key])) extra.push(...part[key]);
    if (extra.length) own(key, [...(Array.isArray(base[key]) ? base[key] : []), ...extra]);
  }
  own('lines', Object.assign({}, base.lines || {}, ...parts.map(([, p]) => p.lines || {})));
  own('layers', parts.map(([kind]) => kind));
  return def;
}

export const Maps = {
  register(def) {
    if (!def || !def.id) { reportError('Maps.register', new Error('a map def needs an id')); return false; }
    registry.set(String(def.id), def);
    return true;
  },
  /** Register a layer for a map (before or after the base): kind 'npcs' | 'chests' | anything; layer = object | fn(base). */
  addLayer(id, kind, layer) {
    if (!id || !kind || !layer) { reportError('Maps.addLayer', new Error(`bad layer ${id}.${kind}`)); return false; }
    if (!LAYERS.has(String(id))) LAYERS.set(String(id), new Map());
    LAYERS.get(String(id)).set(String(kind), layer);
    return true;
  },
  layers(id) { const k = LAYERS.get(String(id)); return k ? Array.from(k.keys()) : []; },
  has(id) { return registry.has(String(id)); },
  /** The BASE def (no layers). */
  get(id) { return registry.get(String(id)) || null; },
  list() { return Array.from(registry.keys()); },
  /** What loadAll imported: {id: {base, layers: {kind: ok}}}. */
  loaded() { return Object.fromEntries(Array.from(LOADED, ([id, v]) => [id, { base: v.base, layers: Object.assign({}, v.layers) }])); },
  /** Build a fresh GameMap (base + layers) from a registered id or a def object. Never throws: returns null on failure. */
  load(idOrDef) {
    try {
      const def = typeof idOrDef === 'string' ? registry.get(idOrDef) : idOrDef;
      if (!def) { reportError('Maps.load', new Error(`unknown map "${idOrDef}" (registered: ${Maps.list().join(', ') || 'none'})`)); return null; }
      return new GameMap(composeDef(def));
    } catch (e) { reportError('Maps.load', e); return null; }
  },
  /**
   * Import one map and its layer files: entry = 'id' | {id, layers?: ['npcs', 'chests']}. Resolves true when the base
   * loaded. Never rejects; a broken file is reported to __DQ.errors and the rest still loads.
   */
  async loadModule(entry) {
    const id = typeof entry === 'string' ? entry : entry && entry.id;
    if (!id) { reportError('Maps.loadModule', new Error('an index entry needs an id')); return false; }
    const kinds = entry && Array.isArray(entry.layers) ? entry.layers : LAYER_KINDS;
    const rec = { base: false, layers: {} };
    LOADED.set(String(id), rec);
    const [base] = await Promise.all([
      import(`./maps/${id}.js`).then((m) => { rec.base = Maps.register(m.default); return rec.base; },
        (e) => { reportError(`map "${id}": src/world/maps/${id}.js did not load`, e); return false; }),
      ...kinds.map(kind => import(`./maps/${id}.${kind}.js`).then(
        (m) => { rec.layers[kind] = m.default ? Maps.addLayer(id, kind, m.default) : false; },
        (e) => { rec.layers[kind] = false; reportError(`map "${id}": layer src/world/maps/${id}.${kind}.js did not load`, e); })),
    ]);
    return base;
  },
  /** Import src/world/maps/index.js (or the given list) and every map + layer in it. Resolves the loaded ids. */
  async loadAll(list) {
    let entries = list;
    if (!Array.isArray(entries)) {
      try { const m = await import('./maps/index.js'); entries = m.default || m.MAPS || []; }
      catch (e) { reportError('Maps.loadAll: src/world/maps/index.js did not load', e); entries = []; }
    }
    await Promise.all(entries.map(e => Maps.loadModule(e)));
    return Maps.list();
  },
};

export default Maps;
