/**
 * int_rooms.js — the door table for the eight new Puddlewick interiors.            (P06, owner: maps/int_*.js)
 *
 * WHAT THIS FILE IS NOW. Plain data: which building plot on the green opens into which interior map id, plus the
 * ten-door table demos and critics read. **It imports nothing.** That is the whole point of the rewrite.
 *
 * WHY (2026-09-18, and it had broken the entire game for a while). This module used to import all eight room
 * modules and register them with Maps by hand, because `src/world/maps/index.js` (P23) did not list them. That
 * made a circular import:
 *     int_shop.js -> int_common.js -> puddlewick.js -> int_rooms.js -> int_bakery.js -> int_common.js (in flight)
 * and `int_bakery.js`'s module body then read `WALLS` out of a half-evaluated int_common.js. While index.js
 * listed only four maps the cycle always happened to be entered through puddlewick.js, which resolved in an
 * order that worked. The moment P23 listed twelve maps, Maps.loadAll() imported them in PARALLEL, the cycle got
 * entered through a room instead, and every map that touches puddlewick.js — the village, Hollybank, the inn and
 * all eight rooms — failed to register with `TypeError: Cannot access 'WALLS' before initialization`. Measured:
 * __DQ.listMaps() returned 4 of 12 ids and Puddlewick was unreachable.
 *
 * P23's index.js now lists all eight rooms with their npcs/chests layers, so Maps.loadAll() registers them, and
 * this file no longer needs to. `ensureInteriors()` below is the belt and braces for a demo or a test that did
 * not go through index.js: it registers by dynamic import, after module evaluation, so it cannot make a cycle.
 */
import { Maps } from '../map.js';

/** Puddlewick building plot id (puddlewick.js L.plots) -> the interior map id behind its door. */
export const ROOM_OF = Object.freeze({
  puddlewick_bakery: 'int_bakery',
  puddlewick_shop: 'int_shop',
  puddlewick_chapel: 'int_chapel',
  puddlewick_mill: 'int_mill',
  hollybank_barn: 'int_barn',
  puddlewick_twins: 'int_twins',
  puddlewick_hob: 'int_hob',
  puddlewick_cottage: 'int_cottage',
});

/** Display names, so the door table needs no import of the room modules (they must match each map's `name`). */
const ROOM_NAME = Object.freeze({
  int_bakery: "Nan Puddifoot's bakery",
  int_shop: "Mr Hammond's shop",
  int_chapel: 'the chapel of Saint Alden',
  int_mill: 'the mill',
  int_barn: "Hollybank's barn",
  int_twins: "Dot and Bel's house",
  int_hob: "Old Hob's cottage",
  int_cottage: "the Pottles' cottage",
});

/** Every interior map id P06 owns, in door order. */
export const INTERIOR_IDS = Object.freeze(Object.values(ROOM_OF));
/** How many rooms P06 owns (the two P23 built are not counted here — see DOORS). */
export const INTERIOR_COUNT = INTERIOR_IDS.length;

/** Every Puddlewick door and the room behind it, including the two P23 built (for the demo and for critics). */
export const DOORS = Object.freeze([
  { plot: 'hollybank', room: 'hollybank', name: 'Hollybank Cottage', owner: 'P23' },
  { plot: 'puddlewick_inn', room: 'puddlewick_inn', name: 'the inn', owner: 'P23' },
  ...Object.keys(ROOM_OF).map(plot => ({ plot, room: ROOM_OF[plot], name: ROOM_NAME[ROOM_OF[plot]], owner: 'P06' })),
]);

/**
 * Register any of the ten rooms that is not in the registry yet, by dynamic import (so it can never be part of
 * an import cycle). Safe to call twice; resolves the ids it had to load. Demos and tests call this after
 * Maps.loadAll(); /index.html needs it only if index.js ever stops listing the rooms.
 */
export async function ensureInteriors(ids = DOORS.map(d => d.room)) {
  const missing = ids.filter(id => !Maps.has(id));
  if (!missing.length) return [];
  await Promise.all(missing.map(id => Maps.loadModule({ id, layers: ['npcs', 'chests'] })));
  return missing;
}

export default ROOM_OF;
