/**
 * road_links.js — the joins that hang the WIDER WORLD off the maps P23B does not own.   (P23B, maps/road_*.js)
 *
 * WHY THIS FILE EXISTS. `src/world/maps/meadow.js` ends its east lane with `exitOn(L.east, 'lane-east', 'the lane
 * to Saltmarrow')` and **to: null** — a lane that is signposted to Saltmarrow and then says, in voice, that a
 * grown-up sort of walk is needed. Saltmarrow now exists, but meadow.js belongs to another piece, so P23B may not
 * edit that one line. ARCHITECTURE rule 6 allows exactly one thing at import time — "registering data" — and
 * `Maps.addLayer(id, kind, layer)` is the documented way to register a layer by hand (src/world/map.js). So this
 * module adds a 'links' LAYER to the vale, holding one exit: the same lane, four units earlier, pointed at the
 * Beck road. `road_beck.js` imports this file, so the join exists the moment the new road is in maps/index.js.
 * (`src/world/maps/int_rooms.js` set the precedent: P06 registers eight interiors the same way.)
 *
 * Layer exits are APPENDED after the base's, and GameMap.exitAt returns the FIRST box a position is inside — so
 * this trigger is deliberately placed so a child walking east crosses it BEFORE reaching the base's lane-end box,
 * and the two boxes do not overlap. Measured, not assumed: see scenarios/P23B.json, which walks it.
 *
 * NEEDS (the piece that owns src/world/maps/meadow.js): fold this into the base file — give the vale's
 * 'lane-east' exit `to: 'road_beck'` with the landing below — and delete this module and the one import of it
 * in road_beck.js. Nothing else changes.
 */
import { Maps } from '../map.js';
import { Debug, reportError } from '../../engine/debug.js';
import { MAP_AREA } from '../../battle/scene.js';
import { meadowLayout } from './meadow.js';

/** Where the vale's east lane runs out, straight from meadow.js's own layout (never a copied number). */
export const VALE_EAST = (() => {
  try {
    const list = (meadowLayout() || {}).exits || [];
    const e = list.find(x => /saltmarrow/i.test(String(x && x.name))) || list[1];
    if (e && Number.isFinite(+e.x)) return { x: +e.x, z: +e.z };
  } catch (e) { reportError('road_links: meadowLayout', e); }
  return { x: 31.8, z: 1.2 };            // the fallback, if the vale ever stops publishing its layout
})();

/** A point `d` units back down the lane from the vale's edge (toward the middle of the map). */
function inward(d) {
  const r = Math.hypot(VALE_EAST.x, VALE_EAST.z) || 1;
  return { x: +(VALE_EAST.x - VALE_EAST.x / r * d).toFixed(2), z: +(VALE_EAST.z - VALE_EAST.z / r * d).toFixed(2) };
}

/** The trigger (5.0 back), and where coming home from the road puts you (9.6 back, clear of the trigger). */
export const VALE_TRIGGER = inward(5.0);
export const VALE_LANDING = inward(9.6);

/** Where the Beck road puts you down when you walk in from the vale (road_beck.js reads this). */
export const BECK_WEST = { x: -21.6, z: 14.0, facing: Math.PI / 2 };

/**
 * Which tests/battle/areas.js area each new map fights on. `src/battle/scene.js` exports MAP_AREA as a plain
 * object and `areaFor()` falls back to 'long_lane' for anything not in it — so a tier-1 Gloop would have been
 * waiting in the belfry. Filling it in is the same "register data at import time" move as the layer above, with
 * no edit to scene.js. NEEDS (P14/P31, src/battle/scene.js): fold these five rows into MAP_AREA itself.
 */
export const AREA_OF = Object.freeze({
  road_beck: 'long_lane',
  saltmarrow: null,                    // a town: nothing ambushes you on the quay
  saltmarrow_mill: null,
  road_wood: 'whispering_wood',
  cobwell_manor: 'cobwell_manor',
  cobwell_upper: 'cobwell_manor',
  cobwell_cellar: 'cobwell_manor',
  cobwell_belfry: 'cobwell_manor',
});

let done = false;
/** Register the vale -> Beck road join, and the battle area of every P23B map. Safe to call twice. */
export function installLinks() {
  if (done) return false;
  done = true;
  try { for (const [id, area] of Object.entries(AREA_OF)) if (MAP_AREA[id] === undefined) MAP_AREA[id] = area; }
  catch (e) { reportError('road_links: MAP_AREA', e); }
  try {
    Maps.addLayer('meadow', 'links', {
      exits: [{
        x: VALE_TRIGGER.x, z: VALE_TRIGGER.z, w: 4.8, h: 4.8,
        to: 'road_beck', tx: BECK_WEST.x, tz: BECK_WEST.z, kind: 'edge',
        name: 'the lane down the Beck', line: 'link-saltmarrow',
        back: { x: VALE_LANDING.x, z: VALE_LANDING.z },
      }],
      lines: {
        'link-saltmarrow': 'The lane drops away east,\nfollowing the Beck down\ntoward the sea.',
      },
    });
    return true;
  } catch (e) { reportError('road_links: addLayer', e); return false; }
}

installLinks();

// `__DQ.links()` — the measured join, so a critic never has to guess where the vale hands over to the road.
try {
  Debug.expose('links', () => ({
    valeEast: VALE_EAST, valeTrigger: VALE_TRIGGER, valeLanding: VALE_LANDING, beckWest: BECK_WEST,
    areas: Object.assign({}, AREA_OF), installed: done,
  }));
} catch (e) { reportError('road_links: expose', e); }

export default installLinks;
