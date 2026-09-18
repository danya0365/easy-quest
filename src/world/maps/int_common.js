/**
 * int_common.js — the shared body of every Puddlewick interior.                 (P06, owner: src/world/maps/int_*)
 *
 * Ten doors face the green. Two of them had rooms behind them; the other eight said a line of text and pushed a
 * child back out, ten times in a row. This file is the room every one of those eight now opens into: the shell,
 * the doorway with daylight in it, the interior camera, the way back to your own doorstep, and the standard
 * interior light. A map file then only has to say what is IN its room.
 *
 *   import { interiorMap } from './int_common.js';
 *   export default interiorMap({
 *     id: 'int_bakery', name: "Nan Puddifoot's bakery", plot: 'puddlewick_bakery',
 *     W: 12.6, D: 10.6, doorX: 0.4, music: 'village',
 *     windows: [...], colliders: [...], props: [...], lines: {...},
 *     decorate(kit, R) { ...the furniture, from src/art/interior.js and P05's room recipes... },
 *   });
 *
 * CONVENTIONS (the same ones hollybank.js and puddlewick_inn.js were measured into)
 *  - Local +z is SOUTH: the front wall, the wall the door is in. `rot` therefore means the same indoors as out.
 *  - You ARRIVE in the middle of the room, not on the mat. Measured: at pitch 50 the lens sits ~3.9 units back
 *    along the ground, so a child who lands two steps inside the door puts the camera outside the south wall and
 *    the first frame of the room is the OUTSIDE of it. `arrive` (default 4.5 units in from the south wall) keeps
 *    the whole boom inside the room.
 *  - The exit trigger sits in the doorway; the arrival point is >= 3 units clear of it, so walking out and walking
 *    back in are each one clean step and never a bounce.
 *  - Rooms are generous (>= 11 x 10). P09's fade ghosts anything within ~2.2 units of the lens, so a cramped room
 *    puts a translucent wall over the whole frame.
 */
import * as THREE from 'three';
import { PAL, mixHex } from '../../art/palette.js';
import { makeAOMask } from '../../art/toon.js';
import { Sfx } from '../../audio/sfx.js';
import { reportError } from '../../engine/debug.js';
import { createKit } from '../scenery.js';
import { interiorRecipes, indoorContacts, interiorRig, holdInteriorRig, ROOM } from '../../art/interior.js';
import { puddlewickDoorstep } from './puddlewick.js';

/** Where a window's light lands on the floor, per wall, in the room's own frame. */
const SHAFT = {
  south: (at, HW, HD) => ({ x: at, z: HD - 0.2, rot: Math.PI }),
  north: (at, HW, HD) => ({ x: at, z: -HD + 0.2, rot: 0 }),
  east: (at, HW, HD) => ({ x: HW - 0.2, z: -at, rot: -Math.PI / 2 }),
  west: (at, HW, HD) => ({ x: -HW + 0.2, z: at, rot: Math.PI / 2 }),
};

/**
 * Build a complete interior map def. Everything below has a sane default; a room file overrides what it cares
 * about and fills `decorate`.
 */
export function interiorMap(o) {
  const W = +o.W || 12.6, D = +o.D || 10.6, H = +o.H || ROOM.H;
  const HW = W / 2, HD = D / 2;
  const DX = o.doorX ?? 0, DW = o.doorW ?? ROOM.DOOR_W, DH = o.doorH ?? ROOM.DOOR_H;
  const size = [Math.round(W) + 1, Math.round(D) + 1];
  const origin = [-size[0] / 2, -size[1] / 2];
  const arrive = o.arrive ?? 4.5;
  const spawn = { x: DX, z: HD - arrive, facing: Math.PI };            // facing 0 = +z (south); PI = into the room
  const windows = o.windows || [];
  const floorKind = o.floor || 'wood';
  const stoneAt = typeof o.stoneFloor === 'function' ? o.stoneFloor : null;

  /** Everything a scenario, a critic or a layer file needs to know about this room. */
  const R = { W, D, H, HW, HD, T: ROOM.T, DX, DW, DH, spawn, spots: o.spots || {} };

  const def = {
    id: o.id,
    name: o.name,
    kind: 'interior',
    size,
    origin,
    res: 4,
    theme: floorKind === 'stone' ? 'stone' : 'wood',
    music: o.music || 'village',                     // CANON §9 — 'village' is Puddlewick's own motif
    hours: o.hours ?? 15.6,
    light: { preset: 'interior' },
    weather: 'clear',
    encounters: null,
    ambience: o.ambience || null,
    spawn,
    // Tighter and steeper than the field, as an interior should be: CAM_MODES.interior at a 50-degree ground
    // angle, framed so a child sees the ROOM and not a portrait of himself on some floorboards.
    camera: Object.assign({}, ROOM.CAMERA, o.camera || null),

    tiles: {
      height: () => 0,
      solid(x, z) { return Math.abs(x) > HW - 0.02 || Math.abs(z) > HD - 0.02; },
      ground(x, z) {
        if (stoneAt && stoneAt(x, z)) return 'stone';
        return floorKind === 'stone' ? 'stone' : 'wood';
      },
    },

    room: R,
    spots: o.spots || {},
    colliders: o.colliders || [],
    props: o.props || [],
    chests: o.chests || [],

    /** The way out: the same doorway, back onto this building's own doorstep on the green. */
    get exits() {
      const back = puddlewickDoorstep(o.plot);
      return [{
        x: DX, z: HD - 0.5, w: DW + 0.2, h: 0.9,
        to: 'puddlewick', tx: back.x, tz: back.z, kind: 'door',
        name: o.doorName || 'the door', line: 'door-out',
        back: { x: DX, z: HD - 2.1 },
      }];
    },

    lines: Object.assign({
      'door-out': o.outLine || 'Back out into the afternoon.',
      search: o.searchLines || [
        '%HERO% has a good look round.{n}It is somebody else\'s room, and\nit is very tidy about it.',
        '%HERO% looks behind the door.{n}A broom, and one boot.',
      ],
    }, o.lines || null),

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // the art
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    view(ctx) {
      const t0 = performance.now();
      const { scene, rig } = ctx;
      const safe = (name, fn) => { try { return fn(); } catch (e) { reportError(`${o.id}: ${name}`, e); return null; } };

      safe('rig', () => interiorRig({ rig, scene, dir: o.sunDir || [0.22, 0.96, 0.26], sun: o.sun ?? 1.3,
        hemi: o.hemi ?? 1.12, extent: Math.max(W, D) + 6, surround: o.surround ?? 0.55 }));

      const ao = makeAOMask({ span: Math.max(W, D) + 18, size: 512, center: [0, 0] });
      const kit = createKit({ scene, heightAt: () => 0, ao });
      safe('recipes', () => { interiorRecipes(kit); indoorContacts(kit); });

      safe('shell', () => kit.roomShell({
        x: 0, z: 0, rot: 0, W, D, H,
        wall: o.wall || 'plaster', wallTint: o.wallTint || PAL.plaster.light,
        floor: floorKind, beams: false, ceiling: false,
        openings: [{ side: 'south', at: DX, w: DW, h: DH, kind: 'door' }],
        windows,
      }));

      // the plaster-and-beam walls the village is built of, seen from the inside
      if (o.timbers !== false) safe('timbers', () => kit.wallTimbers({ W, D, H, sides: o.timberSides || ['north', 'east', 'west'],
        windows, openings: [{ side: 'south', at: DX, w: DW }], seed: o.seed || 3 }));

      safe('door', () => kit.roomDoorway(DX, HD, 0, { w: DW, h: DH, swing: o.doorSwing ?? 0.66, color: o.doorColor || PAL.paint.doorRed }));

      // every window with `shaft: true` throws a slab of afternoon across the floor
      safe('shafts', () => {
        for (const wn of windows) {
          if (!wn.shaft) continue;
          const f = SHAFT[wn.side]; if (!f) continue;
          const p = f(wn.at ?? 0, HW, HD);
          kit.lightShaft(p.x, p.z, p.rot, { w: (wn.w ?? 1.0) * 0.95, y: wn.y ?? 1.4, len: wn.len ?? 3.4, k: 0.13 });
        }
      });

      safe('dressing', () => { if (typeof o.decorate === 'function') o.decorate(kit, R, { THREE, scene, rig, ctx }); });

      safe('flush', () => kit.flushInterior());

      const buildMs = Math.round(performance.now() - t0);
      return {
        update(t, dt, c) {
          holdInteriorRig(rig, o.id);
          kit.update(t, dt, c && c.camera, c && c.player);
        },
        state() { return { buildMs, room: { W, D, H }, counts: Object.assign({}, kit.counts) }; },
      };
    },

    onEnter() { try { Sfx.play('door_open', { vol: 0.32 }); } catch (_) { /* the door you just came through */ } },
  };

  return def;
}

/** A plain plaster-and-beam window set for a cottage front. */
export function cottageWindows({ HW, HD, shutter = PAL.paint.shutterGreen, south = [], west = [], east = [], north = [], y = 1.38 } = {}) {
  const mk = (side, list) => list.map(at => ({ side, at: Array.isArray(at) ? at[0] : at, y, w: 1.0, h: 0.9, shutter,
    shaft: Array.isArray(at) ? !!at[1] : false }));
  void HW; void HD;
  return [...mk('south', south), ...mk('west', west), ...mk('east', east), ...mk('north', north)];
}

/** A tint a room can wash its plaster with, so eight rooms are not one room eight times. */
export const WALLS = Object.freeze({
  cream: PAL.plaster.light,
  oat: mixHex(PAL.plaster.light, PAL.plaster.dark, 0.35),
  ochre: mixHex(PAL.plaster.mid, PAL.thatch.mid, 0.3),
  sage: mixHex(PAL.plaster.light, PAL.foliage.mid, 0.16),
  rose: mixHex(PAL.plaster.light, PAL.cloth.red, 0.12),
  smoke: mixHex(PAL.plaster.mid, PAL.stone.mid, 0.4),
});

export { THREE };
