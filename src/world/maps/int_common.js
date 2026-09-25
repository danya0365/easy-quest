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

  /** The door, as something to press Z at. `field` comes from field.js's interact(). */
  const doorProp = () => ({
    type: 'door', name: o.doorName || 'the door', solid: false,
    x: DX, z: HD - 0.75, ix: DX, iz: HD - 1.9, reach: 2.6, height: DH * 0.9,
    talk({ field }) {
      const b = puddlewickDoorstep(o.plot);
      // Field.teleport takes facing in degrees; doorstep.facing is radians (face out of the house).
      const deg = Number.isFinite(+b.facing) ? (+b.facing * 180 / Math.PI) : undefined;
      try { field.teleport('puddlewick', b.x, b.z, deg); } catch (e) { reportError(`${o.id}: door out`, e); }
      return null;                                   // the door just opens; no window in the way
    },
  });

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
    // THE DOOR IS A THING YOU CAN TALK TO, as well as a line you can walk over. Measured (shots/P06-hb2): a
    // party follower is solid and lines up between you and the front door you just came in by, and a child
    // holding one direction walks into it and stops short of the wall. Walking round it works; being told
    // "Z — the front door" while you stand there works every time. It is also plain DQV clarity: the way out is
    // labelled. (Filed against P18 as well: followers should yield to the player.)
    props: [doorProp(), ...(o.props || [])],
    chests: o.chests || [],

    /**
     * The way out: the same doorway, back onto this building's own doorstep on the green.
     *
     * Sized from the spawn, not a fixed z. Measured (shots/P06-debug): int_barn is D=12.6 so spawn sits at
     * z=1.8; a fixed exit at z=2.6/h=2.9 covered spawn and bounced every entry straight back to Puddlewick.
     * The pad starts 0.55 past spawn and runs to the south wall — arrival is safe, one step south leaves.
     */
    get exits() {
      const back = puddlewickDoorstep(o.plot);
      const z0 = spawn.z + 0.55, z1 = HD - 0.25;
      const zMid = (z0 + z1) / 2, h = Math.max(1.4, z1 - z0);
      return [{
        x: DX, z: zMid, w: Math.min(W - 0.8, DW + 6.0), h,
        to: 'puddlewick', tx: back.x, tz: back.z, facing: back.facing,
        kind: 'door', name: o.doorName || 'the door', line: 'door-out',
        back: { x: DX, z: HD - 2.3 },
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

      safe('rig', () => interiorRig({ rig, scene, dir: o.sunDir || [0.22, 0.96, 0.26], sun: o.sun ?? 1.7,
        hemi: o.hemi ?? 1.45, extent: Math.max(W, D) + 6, surround: o.surround ?? 0.55, fill: o.fill ?? 0.5 }));

      const ao = makeAOMask({ span: Math.max(W, D) + 18, size: 512, center: [0, 0] });
      const kit = createKit({ scene, heightAt: () => 0, ao });
      safe('recipes', () => { interiorRecipes(kit); indoorContacts(kit); });

      // P06 gap #3: the warm gloom the room stands in, BEFORE the room, so a lens that leaves the shell finds a
      // lit dollhouse on a warm dark table and never the clear colour. Costs two unlit draw calls.
      safe('backdrop', () => kit.roomBackdrop({ W, D, H, floor: floorKind === 'stone' ? PAL.stone.dark : PAL.wood.dark }));

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

      // P06 gap #3: the storey above the wall tops. Every part of it leans AWAY from the room, so it fills the
      // strip of frame that used to be a hole without ever standing over one board of the floor.
      if (o.upper !== false) safe('upper', () => {
        const wall = o.wall || 'plaster';
        const tint = o.upperTint || o.wallTint || PAL.plaster.light;
        const roof = o.roof || (wall === 'stone' ? 'stone' : 'thatch');
        kit.roomUpper({ W, D, H, T: ROOM.T, wall, tint, roof,
          up: o.upperUp ?? 1.2, out: o.upperOut ?? 0.42, seed: (o.seed || 3) + 4 });
        // The DOOR wall gets a LOW course and no eaves. A full storey there lands right under the lens and
        // fills the bottom quarter of the frame with brown (shots/P06-r1/08-bakery); nothing at all leaves a
        // wedge of gloom whenever the boom swings south of the room and looks back in
        // (shots/P06-g1/03-back-on-the-green). Half a storey, capped by its plate, is both.
        kit.roomUpper({ W, D, H, T: ROOM.T, wall, tint, roof: false, sides: ['south'],
          up: o.upperSouth ?? 0.52, out: (o.upperOut ?? 0.42) * 0.7, spacing: 2.4, seed: (o.seed || 3) + 9 });
      });

      safe('door', () => kit.roomDoorway(DX, HD, 0, { w: DW, h: DH, swing: o.doorSwing ?? 0.66, color: o.doorColor || PAL.paint.doorRed }));

      // every window with `shaft: true` lays a patch of afternoon on the boards (and a faint volume over it)
      safe('shafts', () => {
        for (const wn of windows) {
          if (!wn.shaft) continue;
          const f = SHAFT[wn.side]; if (!f) continue;
          const p = f(wn.at ?? 0, HW, HD);
          // clamped so the beam can never reach the wall opposite and show as a pale zigzag on it (gap #2)
          const room = (wn.side === 'south' || wn.side === 'north') ? D : W;
          const len = Math.min(wn.len ?? 3.4, room - 1.4);
          kit.lightShaft(p.x, p.z, p.rot, { w: (wn.w ?? 1.0) * 0.95, y: wn.y ?? 1.4, len });
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
