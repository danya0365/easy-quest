/**
 * cobwell_common.js — the shared body of COBWELL MANOR's four floors.           (P23B, owner: maps/cobwell*.js)
 *
 * WORLD-BIBLE §4 DUNGEON A is a room-by-room plan: a porch and front hall, a portrait gallery whose two
 * unwatching portraits are doors, a kitchen the dinner service marches across, a hidden larder, the Long Stair
 * where the candle blows out and Willow ties half her ribbon on your wrist, the nursery with the hatbox that
 * mews, Ottilie's room, the ballroom and its dance step, the study with the guest book, the cellar in the roots,
 * and the belfry where Mumbleroot waits. Four maps, twelve rooms — so the ROOM is the unit here:
 *
 *   manorFloor({
 *     id, name, rooms: [room('a1', -7, 9, 7, 19, {...})], links: [link(-2, 8.3, 2, 9.7)],
 *     gates: [{ tag: 'portrait-east', x, z, w, d }],       // colliders a puzzle can REMOVE at runtime
 *     sconces: [{x, z, rot}], props, chests, exits, lines, spots, dress(kit, R), tick(t, dt, c, api),
 *   })
 *
 * Rooms are axis-aligned rectangles given by their INNER faces, so two rooms that share a face really do share a
 * wall, and a `link` is the walkable slot through it. Collision is therefore exact and authored, never inferred:
 * you can stand anywhere inside a room or inside a link, and nowhere else. That is what stops a dungeon from
 * having a hole in it, which is the one thing a dungeon must never have.
 *
 * The candle. WORLD-BIBLE's gimmick is a five-tile light radius. A genuinely black screen is the worst failure
 * mode this project has (ARCHITECTURE rule 3), so the manor is built the other way round: the F3 'cave' light
 * rig with tight fog, a dark surround, and a lit sconce in every room — dark, close and unfriendly, and always
 * READABLE. The candle radius is a later pass (P23B known gap), not a black frame now.
 */
import * as THREE from 'three';
import { PAL, C3, mixHex, smooth } from '../../art/palette.js';
import { mulberry } from '../../art/tex.js';
import { makeAOMask } from '../../art/toon.js';
import { Sfx } from '../../audio/sfx.js';
import { Debug, reportError } from '../../engine/debug.js';
import { createKit } from '../scenery.js';
import { interiorRecipes, indoorContacts } from '../../art/interior.js';

export const T = 0.34;                       // wall thickness (ROOM.T)

/** A room from its INNER faces. `floor`: 'stone' | 'wood' | 'dirt'. */
export function room(id, x0, z0, x1, z1, o = {}) {
  const ax = Math.min(x0, x1), az = Math.min(z0, z1), bx = Math.max(x0, x1), bz = Math.max(z0, z1);
  return Object.assign({}, o, {
    id, x0: ax, z0: az, x1: bx, z1: bz,
    x: (ax + bx) / 2, z: (az + bz) / 2, W: bx - ax, D: bz - az,
    H: o.H ?? 3.4, floor: o.floor || 'stone', wall: o.wall || 'stone',
    wallTint: o.wallTint || mixHex(PAL.plaster.mid, PAL.stone.dark, 0.34),
    openings: o.openings || [], windows: o.windows || [], name: o.name || id,
    beams: o.beams ?? false, ceiling: o.ceiling ?? false,
  });
}

/** A walkable slot between two rooms (world rectangle, by its corners). */
export function link(x0, z0, x1, z1, tag) {
  return { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), tag: tag || null };
}

/**
 * Remove every collider a gate registered, so a puzzle can OPEN a door at runtime.
 * Returns the number of colliders removed (0 = already open, or the wrong map).
 */
export function openGate(map, tag) {
  try {
    if (!map || !Array.isArray(map.colliders)) return 0;
    let n = 0;
    for (let i = map.colliders.length - 1; i >= 0; i--) {
      if (map.colliders[i] && map.colliders[i].tag === `gate:${tag}`) { map.colliders.splice(i, 1); n++; }
    }
    if (n) { try { Sfx.play('door_open', { vol: 0.5 }); } catch (_) { /* it is only a sound */ } }
    return n;
  } catch (e) { reportError('cobwell openGate', e); return 0; }
}

/** Is a gate still shut? (the props' words change when it is open) */
export function gateShut(map, tag) {
  try { return !!(map && map.colliders || []).some(c => c && c.tag === `gate:${tag}`); }
  catch (_) { return false; }
}

// ── the one debug control the scenario and a critic drive the manor's two puzzles with ──────────────────────
const SOLVED = { portraits: false, dance: false };
let exposed = false;
function installDebug() {
  if (exposed) return;
  exposed = true;
  try {
    /** __DQ.cobwell() -> what is solved · __DQ.cobwell('portraits'|'dance') -> solve it now. */
    Debug.expose('cobwell', (what) => {
      if (what === undefined) return Object.assign({}, SOLVED);
      const key = String(what);
      if (key !== 'portraits' && key !== 'dance') return { ok: false, reason: 'portraits | dance' };
      SOLVED[key] = true;
      return { ok: true, solved: Object.assign({}, SOLVED), note: 'takes effect on this floor at once, and on load' };
    });
  } catch (e) { reportError('cobwell debug', e); }
}
/** A puzzle the player (or a critic) has solved: remembered across map loads, so a floor never re-locks. */
export function markSolved(key) { SOLVED[key] = true; return true; }
export function isSolved(key) { return !!SOLVED[key]; }

/**
 * Build one floor of the manor.
 */
export function manorFloor(o) {
  const W = (o.size && o.size[0]) || 52, H = (o.size && o.size[1]) || 52;
  const rooms = o.rooms || [];
  const links = o.links || [];
  installDebug();

  const inRoom = (x, z) => {
    for (const r of rooms) if (x > r.x0 + 0.02 && x < r.x1 - 0.02 && z > r.z0 + 0.02 && z < r.z1 - 0.02) return r;
    return null;
  };
  const inLink = (x, z) => {
    for (const l of links) if (x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1) return l;
    return null;
  };

  /** Everything a scenario, a critic or a layer needs to know about this floor. */
  const R = { rooms, links, roomAt: inRoom, spots: o.spots || {} };

  const def = {
    id: o.id,
    name: o.name,
    kind: 'dungeon',                             // kind 'dungeon' -> the 'cave' encounter rate and the dungeon camera
    size: [W, H],
    origin: [-W / 2, -H / 2],
    res: 4,
    theme: o.theme || 'stone',
    music: o.music || 'dungeon',                 // CANON §9
    ambience: o.ambience || 'amb_cave',
    hours: 20,
    light: { preset: 'cave' },
    weather: 'clear',
    encounters: o.encounters === undefined ? { rate: 1, table: [['boohoo', 4], ['flapjack', 3], ['toadstooligan', 2]] } : o.encounters,
    spawn: Object.assign({ x: 0, z: 0, facing: Math.PI }, o.spawn || null),
    camera: Object.assign({ mode: 'world', orbit: 0, pitch: 48, dist: 10.4, fov: 54, lookUp: 1.5 }, o.camera || null),
    bossDoors: o.bossDoors || undefined,

    tiles: {
      height: () => 0,
      solid(x, z) { return !inRoom(x, z) && !inLink(x, z); },
      ground(x, z) {
        const r = inRoom(x, z);
        if (r) return r.floor === 'dirt' ? 'dirt' : r.floor === 'wood' ? 'wood' : 'stone';
        return o.linkFloor || 'stone';
      },
    },

    room: R,
    spots: o.spots || {},
    props: o.props || [],
    chests: o.chests || [],
    exits: o.exits || [],
    lines: o.lines || {},
    npcs: [],

    /** Fixed colliders plus one per GATE — the gate ones carry `tag: 'gate:<name>'` so openGate() can lift them. */
    get colliders() {
      const out = (o.colliders || []).slice();
      for (const g of (o.gates || [])) {
        if (g.solvedBy && isSolved(g.solvedBy)) continue;      // a puzzle already solved stays solved
        out.push({ type: 'box', x: g.x, z: g.z, w: g.w, d: g.d, rot: g.rot || 0, tag: `gate:${g.tag}` });
      }
      return out;
    },

    // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
    // the art
    // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
    view(ctx) {
      const t0 = performance.now();
      const { scene, rig } = ctx;
      const safe = (name, fn) => { try { return fn(); } catch (e) { reportError(`${o.id}: ${name}`, e); return null; } };

      // the manor's own light: F3's cave rig, one warm key from the sconces, and a black-brown surround
      const applyRig = () => {
        if (!rig) return;
        rig.apply('cave');
        if (rig.dir && rig.dir.set) rig.dir.set(0.25, 0.94, 0.3).normalize();
        if (rig.sun) rig.sun.intensity *= o.sun ?? 0.98;
        if (rig.hemi) rig.hemi.intensity *= o.hemi ?? 1.06;
        if (rig.setExtent) rig.setExtent(Math.max(W, H) * 0.7);
      };
      safe('rig', applyRig);
      safe('surround', () => {
        scene.background = C3(mixHex(PAL.shadow.contact, PAL.interior.dark, 0.72));
        scene.fog = new THREE.Fog(C3(mixHex(PAL.cave.haze, PAL.interior.dark, 0.5)), o.fogNear ?? 8, o.fogFar ?? 34);
      });

      const ao = makeAOMask({ span: Math.max(W, H) + 16, size: 1024, center: [0, 0] });
      const kit = createKit({ scene, heightAt: () => 0, ao });
      safe('recipes', () => { interiorRecipes(kit); indoorContacts(kit); });

      // ── the shells ──
      for (const r of rooms) {
        safe(`room ${r.id}`, () => kit.roomShell({
          x: r.x, z: r.z, rot: 0, W: r.W, D: r.D, H: r.H,
          wall: r.wall, wallTint: r.wallTint, floor: r.floor === 'dirt' ? 'stone' : r.floor,
          beams: r.beams, ceiling: r.ceiling, T,
          openings: r.openings, windows: r.windows,
        }));
        // the floor a room stands on, painted so twelve rooms are not one room twelve times
        if (r.floor === 'stone') safe(`flags ${r.id}`, () => kit.flagFloor(r.x, r.z, { w: r.W - 0.2, d: r.D - 0.2, seed: (r.x * 7 + r.z * 3) | 0, flag: 0.8 }));
        if (r.floor === 'dirt') safe(`mud ${r.id}`, () => kit.floorPatch(r.x, r.z, { rx: r.W * 0.48, rz: r.D * 0.48, color: mixHex(PAL.dirt.base, PAL.stone.dark, 0.34), lift: 0.02, rect: true, seed: 3 }));
      }

      // ── the doorways drawn into the walls, so a link is visibly a door ──
      safe('doorways', () => {
        for (const d of (o.doorways || [])) {
          const w = d.w ?? 1.4, h = d.h ?? 2.3, c = Math.cos(d.rot || 0), s = Math.sin(d.rot || 0);
          // the leaf, swung back flat against the wall on one side of the opening (no daylight panel indoors)
          const off = (w / 2 + 0.06);
          const lx = d.x + off * c, lz = d.z - off * s;
          kit.addTo('wood', new THREE.BoxGeometry(w * 0.92, h, 0.08),
            new THREE.Matrix4().makeRotationY((d.rot || 0) + 1.45).setPosition(lx + 0.42 * s, h / 2, lz + 0.42 * c), d.color || PAL.wood.dark);
          kit.addTo('paint', new THREE.SphereGeometry(0.06, 8, 6),
            new THREE.Matrix4().setPosition(lx + 0.78 * s, h * 0.48, lz + 0.78 * c), PAL.paint.iron);
        }
      });

      // ── one lit sconce per room at least: the manor is dark, never black ──
      safe('sconces', () => {
        for (const s of (o.sconces || [])) kit.wallSconce(s.x, s.z, s.rot || 0, { y: s.y ?? 1.9, lantern: s.lantern !== false });
      });

      safe('dress', () => { if (typeof o.dress === 'function') o.dress(kit, R, ctx); });

      // ── dust: a two-hundred-year-old house has weather of its own ──
      safe('motes', () => {
        for (const r of rooms) kit.dustMotes(r.x, r.z, { n: 18, w: Math.min(6, r.W * 0.7), h: 2.2, d: Math.min(6, r.D * 0.7), y: 1.2 });
      });

      safe('flush', () => kit.flushInterior());

      const buildMs = Math.round(performance.now() - t0);
      const api = { kit, rooms, links, openGate: (tag) => openGate(ctx.map, tag), map: ctx.map };
      return {
        update(t, dt, c) {
          if (rig && rig.preset !== 'cave') safe('rig hold', applyRig);
          kit.update(t, dt, c && c.camera, c && c.player);
          if (typeof o.tick === 'function') { try { o.tick(t, dt, c, api); } catch (e) { reportError(`${o.id}: tick`, e); } }
        },
        state() {
          return { buildMs, rooms: rooms.length, links: links.length,
            gates: (o.gates || []).map(g => g.tag), solved: Object.assign({}, SOLVED),
            counts: Object.assign({}, kit.counts) };
        },
      };
    },

    onEnter() { try { Sfx.play('door_open', { vol: 0.26 }); } catch (_) { /* the door behind you */ } },
  };

  def.floor = () => R;
  return def;
}

export { THREE, PAL, C3, mixHex, smooth, mulberry };
