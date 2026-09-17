/**
 * scenery.js — the scenery kit hand-authored maps build with: a THIN composer over the art recipe modules.
 *                                                                                           (integrator-owned)
 *
 * The recipes themselves live with the pieces that own them (moved here verbatim in the between-waves smoothing,
 * signatures unchanged), so P02 / P03 / P04 / P05 each edit their own file and never this one:
 *   src/art/sky.js        P02  buildSky · ringHill · kit.birds · kit.skyCastle
 *   src/art/terrain.js    P03  curvePoints · paintMasks · distanceGrid · buildGround · kit.water
 *   src/art/props.js      P04  THE KIT CORE (buckets, footprints, see-through, update, flush) + every prop recipe
 *                             (trees, forests, bushes, rocks, fences, signposts, flowers, tufts, bridges, critters...)
 *                             + geometry helpers M4 boxUV scaleUV wrapUV prep and the canopy blobs OAK POPLAR BUSH ...
 *   src/art/buildings.js  P05  kit.gableRoof · kit.cottage · kit.smoke
 *
 *   import { createKit, buildSky, ringHill, buildGround, paintMasks } from '../scenery.js';   // or from the art modules
 *   const kit = createKit({ scene, heightAt, ao });      // ao = makeAOMask({...}) painted as things are placed
 *   kit.cottage({...}); kit.rock(x, z, s); kit.fence(pts); kit.forest('oak', OAK, list, {...});
 *   kit.flush();                                         // merge every bucket into one mesh per material
 *   kit.update(t, dt, camera, focus)                     // animated bits (smoke, butterflies, water, birds) + see-through
 *
 * A recipe module that throws while installing is reported to __DQ.errors and the rest of the kit still works.
 */
import { createPropsKit } from '../art/props.js';
import { terrainRecipes } from '../art/terrain.js';
import { buildingRecipes } from '../art/buildings.js';
import { skyRecipes } from '../art/sky.js';
import { reportError } from '../engine/debug.js';

export * from '../art/props.js';
export * from '../art/terrain.js';
export * from '../art/buildings.js';
export * from '../art/sky.js';

/** The full kit: the props core with the terrain, building and sky recipes installed on it. */
export function createKit(opts) {
  const kit = createPropsKit(opts);
  for (const [name, install] of [['terrain', terrainRecipes], ['buildings', buildingRecipes], ['sky', skyRecipes]]) {
    try { install(kit); } catch (e) { reportError(`scenery kit: ${name} recipes`, e); }
  }
  return kit;
}

export default createKit;
