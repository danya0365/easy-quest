/**
 * act1_places.js — thin outdoor stubs so Act I beats B8/B9 (and travel) have a PLACE, not only a road card.
 *                                                                                      (P23, night breadth pass)
 *
 * Full sculpt comes later. These are walkable bowls with a lane, a signpost, a landmark prop, an exit home, and
 * enough space for story actors to stand. Maps.has(id) becomes true → ch1.js placeOf() plays the beat on-map.
 */
import { outdoorMap, marks, PAL } from './road_common.js';

/**
 * @param {object} o
 * @param {string} o.id
 * @param {string} o.name
 * @param {string} [o.kind]
 * @param {string} [o.theme]
 * @param {string} [o.music]
 * @param {object} [o.spawn]
 * @param {array}  [o.landmarks]  marks([{id, az}])
 * @param {string} [o.exitTo]
 * @param {object} [o.exitLanding] {x,z}
 * @param {string} [o.signLine]
 * @param {string} [o.landmarkType]
 * @param {string} [o.landmarkName]
 * @param {string} [o.landmarkLine]
 * @param {object} [o.extra]
 */
export function act1Place(o) {
  const spawn = o.spawn || { x: 0, z: 8, facing: Math.PI };
  const exitTo = o.exitTo || 'meadow';
  const land = o.exitLanding || { x: 14.5, z: -25.6 };
  const lane = o.lane || [[0, 14], [0, 6], [0, -2], [0, -10]];
  const sign = o.sign || { x: 1.6, z: 4.0 };
  const mark = o.mark || { x: -4.0, z: -2.0 };
  // props without colliders = walk-through cardboard (grey_ruins had coll=0). Always plant the sign + landmark.
  const baseColliders = [
    { type: 'circle', x: sign.x, z: sign.z, r: 0.22, tag: 'sign' },
    { type: 'circle', x: mark.x, z: mark.z, r: (o.landmarkR ?? 1.1), tag: 'landmark' },
  ];

  return outdoorMap(Object.assign({
    id: o.id,
    name: o.name,
    kind: o.kind || 'field',
    size: o.size || [48, 40],
    ax: 20, az: 16,
    seed: o.seed || 41,
    theme: o.theme || 'grass',
    music: o.music || 'overworld',
    ambience: o.ambience || 'amb_meadow',
    hours: o.hours ?? 11,
    spawn,
    camera: o.camera || { orbit: 90, pitch: 28, dist: 11, fov: 49, lookUp: 2.4 },
    encounters: o.encounters || { rate: 0.35, table: [['gloop', 4], ['peckish', 3], ['bloop', 2]] },
    landmarks: o.landmarks || marks([{ id: 'puddlewick', az: 2.5 }, { id: 'saltmarrow', az: -0.4 }]),
    lanes: [{ pts: lane, w: 2.4 }],
    hills: o.hills || [{ x: -12, z: -10, r: 9, h: 1.2 }, { x: 12, z: 8, r: 8, h: 1.0 }],
    rim: { radius: 22, rows: 2, rowGap: 5.5, seed: o.seed || 41, threshold: 0.28 },
    exits: [
      { x: spawn.x, z: spawn.z + 10.5, w: 6.0, h: 4.0, to: exitTo, tx: land.x, tz: land.z, kind: 'edge',
        name: 'the lane home', line: 'lane-out', back: { x: spawn.x, z: spawn.z + 2.0 },
        facing: 0 },
    ],
    notches: [{ az: Math.atan2(14, 0), k: 0.45, w: 0.3 }],
    spots: Object.assign({
      sign, mark, spawn,
      gate: { x: spawn.x, z: spawn.z + 8 },
    }, o.spots || {}),
    props: [
      { type: 'sign', name: 'the signpost', x: sign.x, z: sign.z, line: 'sign', reach: 3.4, height: 2.5 },
      { type: o.landmarkType || 'ruin', name: o.landmarkName || 'a landmark', x: mark.x, z: mark.z,
        line: 'mark', reach: 2.6, height: o.landmarkH || 2.4 },
    ].concat(o.props || []),
    colliders: baseColliders.concat(o.colliders || []),
    lines: Object.assign({
      'lane-out': o.exitLine || 'The lane turns back toward\nhome, and the wind knows the way.',
      sign: o.signLine || ['A wooden arm points one way.\nThe other arm has fallen off.',
        'Somebody has written HOME on\nthe stump in charcoal.'],
      mark: o.landmarkLine || ['It has been here a long time.\nIt is not going anywhere.'],
      search: ['%HERO% looks around.{n}The place is bigger than it\nlooked from the road.'],
    }, o.lines || {}),
    dress: o.dress || ((kit) => {
      try { kit.lantern(sign.x - 1.4, sign.z + 0.6, 0); } catch (_) {}
    }),
    flowers: o.flowers || [{ x: -6, z: 2, hue: PAL.flower.white, n: 10 }, { x: 5, z: -4, hue: PAL.flower.yellow, n: 8 }],
    tufts: { count: 500, radius: 18 },
  }, o.extra || {}));
}

export default act1Place;
