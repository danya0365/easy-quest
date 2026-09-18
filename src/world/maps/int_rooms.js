/**
 * int_rooms.js — the eight new Puddlewick interiors, registered.                    (P06, owner: maps/int_*.js)
 *
 * WHY THIS FILE EXISTS. `src/world/maps/index.js` (P23) is the list Maps.loadAll() imports, and P06 does not own
 * it. ARCHITECTURE rule 6 allows exactly one thing at import time — "registering data" — so this module imports
 * the eight rooms and registers each one plus its two layers with the map registry. `src/world/maps/puddlewick.js`
 * imports it beside its `exits` block, which is what makes the rooms exist by the time a door is walked through.
 *
 * NEEDS (P23): please move these eight ids into src/world/maps/index.js with layers ['npcs', 'chests'] and delete
 * the one import from puddlewick.js. Nothing else about the rooms changes when you do.
 *
 * Together with hollybank (P23) and puddlewick_inn (P23) this makes all TEN doors on the green real, which was
 * the point: the critic's verdict on Puddlewick was "it makes a child want to go in, then refuses, ten times".
 */
import { Maps } from '../map.js';

import bakery from './int_bakery.js';
import bakeryNpcs from './int_bakery.npcs.js';
import bakeryChests from './int_bakery.chests.js';
import shop from './int_shop.js';
import shopNpcs from './int_shop.npcs.js';
import shopChests from './int_shop.chests.js';
import chapel from './int_chapel.js';
import chapelNpcs from './int_chapel.npcs.js';
import chapelChests from './int_chapel.chests.js';
import mill from './int_mill.js';
import millNpcs from './int_mill.npcs.js';
import millChests from './int_mill.chests.js';
import barn from './int_barn.js';
import barnNpcs from './int_barn.npcs.js';
import barnChests from './int_barn.chests.js';
import twins from './int_twins.js';
import twinsNpcs from './int_twins.npcs.js';
import twinsChests from './int_twins.chests.js';
import hob from './int_hob.js';
import hobNpcs from './int_hob.npcs.js';
import hobChests from './int_hob.chests.js';
import cottage from './int_cottage.js';
import cottageNpcs from './int_cottage.npcs.js';
import cottageChests from './int_cottage.chests.js';

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

const ROOMS = [
  [bakery, bakeryNpcs, bakeryChests],
  [shop, shopNpcs, shopChests],
  [chapel, chapelNpcs, chapelChests],
  [mill, millNpcs, millChests],
  [barn, barnNpcs, barnChests],
  [twins, twinsNpcs, twinsChests],
  [hob, hobNpcs, hobChests],
  [cottage, cottageNpcs, cottageChests],
];

let registered = 0;
for (const [def, npcs, chests] of ROOMS) {
  if (!def || !def.id) continue;
  Maps.register(def);
  if (npcs) Maps.addLayer(def.id, 'npcs', npcs);
  if (chests) Maps.addLayer(def.id, 'chests', chests);
  registered++;
}

/** How many rooms this module put in the registry (demos and critics read it). */
export const INTERIOR_COUNT = registered;
/** Every interior map id P06 owns, in the order they are registered. */
export const INTERIOR_IDS = Object.freeze(ROOMS.map(([d]) => d.id));
/** Every Puddlewick door and the room behind it, including the two P23 built (for the demo and for critics). */
export const DOORS = Object.freeze([
  { plot: 'hollybank', room: 'hollybank', name: 'Hollybank Cottage', owner: 'P23' },
  { plot: 'puddlewick_inn', room: 'puddlewick_inn', name: 'the inn', owner: 'P23' },
  ...ROOMS.map(([d]) => ({ plot: Object.keys(ROOM_OF).find(k => ROOM_OF[k] === d.id), room: d.id, name: d.name, owner: 'P06' })),
]);

export default ROOM_OF;
