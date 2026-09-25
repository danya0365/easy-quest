/**
 * cobwell_cellar.js — COBWELL MANOR, the cellar (WORLD-BIBLE §4 A10).                        (P23B base map)
 *
 * "Mud, roots, a black knot of root wearing a groom's coat. MUSIC BOX 3 is *inside* the roots.
 *  THE SCARE, part 2 — the roots move when the candle is low."
 *
 * One room, low, wet and root-bound, reached down eleven steps from the manor kitchen. It is the smallest map in
 * the manor and it is the one a child will remember: the roots in here are the boss upstairs, two hundred years
 * younger and still growing, and the coat is his.
 */
import { manorFloor, room, THREE, PAL, mixHex, mulberry } from './cobwell_common.js';
import { MANOR_CELLAR_FOOT } from './cobwell_manor.js';

const ROOMS = [
  room('a10', -9, -7, 9, 5, { name: 'the cellar', H: 2.9, floor: 'stone', wall: 'stone',
    wallTint: mixHex(PAL.stone.dark, PAL.interior.dark, 0.42),
    openings: [{ side: 'south', at: 0, w: 1.8, h: 2.3, kind: 'door' }] }),
];

const ROOTS = { x: -2.0, z: -3.6 };

const cellar = manorFloor({
  id: 'cobwell_cellar',
  name: 'Cobwell Manor — the cellar',
  size: [30, 28],
  rooms: ROOMS,
  links: [],
  spawn: { x: 0, z: 2.4, facing: Math.PI },
  camera: { mode: 'world', orbit: 0, pitch: 50, dist: 9.4, fov: 55, lookUp: 1.3 },
  fogNear: 6, fogFar: 22,
  sun: 0.9, hemi: 1.1,
  theme: 'cave',
  ambience: 'amb_cave',
  encounters: { rate: 1.2, table: [['boohoo', 4], ['toadstooligan', 3], ['flapjack', 2]] },

  sconces: [{ x: 0, z: 4.6, rot: Math.PI }, { x: -8.8, z: -1.0, rot: Math.PI / 2 }, { x: 8.8, z: -1.0, rot: -Math.PI / 2 },
    { x: 4.0, z: -6.8, rot: 0 }],

  colliders: [
    { type: 'circle', x: ROOTS.x, z: ROOTS.z, r: 1.35, tag: 'roots' },
    { type: 'box', x: 0, z: 4.8, w: 2.6, d: 0.6, rot: 0, tag: 'steps' },
    { type: 'circle', x: 6.6, z: 2.6, r: 0.6, tag: 'barrels' },
    { type: 'circle', x: -7.2, z: 3.0, r: 0.6, tag: 'crates' },
    { type: 'box', x: 7.4, z: -5.4, w: 2.2, d: 0.7, rot: 0, tag: 'rack' },
  ],

  exits: [
    { x: 0, z: 4.1, w: 2.6, h: 0.8, to: 'cobwell_manor', tx: MANOR_CELLAR_FOOT.x, tz: MANOR_CELLAR_FOOT.z,
      kind: 'stairs', name: 'the cellar steps, up', line: 'up-kitchen', back: { x: 0, z: 2.6 } },
  ],

  spots: {
    roots: ROOTS,
    musicbox3: { x: ROOTS.x, z: ROOTS.z - 0.6 },
    coat: { x: ROOTS.x + 0.3, z: ROOTS.z + 0.4 },
    containers: [{ x: 6.6, z: 2.6, kind: 'barrel' }, { x: -7.2, z: 3.0, kind: 'crate' }, { x: 7.4, z: -5.4, kind: 'rack' }],
  },

  props: [
    { type: 'roots', name: 'the roots', x: ROOTS.x, z: ROOTS.z + 1.6, line: 'roots', reach: 2.2, height: 2.0 },
    { type: 'coat', name: 'a groom’s coat', x: ROOTS.x + 1.0, z: ROOTS.z + 1.4, line: 'coat', reach: 1.8, height: 1.4 },
    { type: 'stairs', name: 'the cellar steps', x: 0, z: 2.6, line: 'steps', reach: 2.0, height: 1.8 },
    { type: 'water', name: 'the wet corner', x: -6.4, z: -5.4, line: 'wet', reach: 2.0, height: 0.4 },
  ],

  lines: {
    'up-kitchen': 'Back up into the kitchen, where\nthe plates are.',
    roots: ['A knot of black root the size of\na pony, come up through the floor\nand stopped.',
      'Deep inside it, wound about with\nroot, there is something small\nand square and painted.',
      '{wait:400}It moves. Not much. Just enough.'],
    coat: ['A groom’s coat, good cloth, laid\nover the roots the way you lay a\ncoat over a chair.',
      'The roots have grown through both\nsleeves. They were not in a hurry\nabout it.'],
    steps: ['Eleven steps up, and the eleventh\nis under water. It always has\nbeen. Nobody knows why.'],
    wet: ['A puddle that has been here\nlonger than the house, quietly\nnot drying.'],
  },

  dress(kit) {
    const r = mulberry(1213);
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const M = (x, y, z, rot = 0) => new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);

    // ── the mud: patches trodden across a stone floor, not a sheet laid over it ──
    for (let k = 0; k < 9; k++) {
      const px = -7.4 + (k % 5) * 3.6 + (r() - 0.5) * 1.6, pz = -5.6 + ((k / 5) | 0) * 4.4 + (r() - 0.5) * 1.6;
      kit.floorPatch(px, pz, { rx: 1.5 + r(), rz: 1.2 + r() * 0.8, color: mixHex(PAL.dirt.base, PAL.stone.dark, 0.5), lift: 0.014, seed: k * 7 });
    }

    // ── the steps down, at the south wall ──
    kit.roomStair(0, 4.6, 0, { w: 2.2, rise: 0.28, run: 0.34, n: 7, rail: true });

    // ── THE ROOTS: a black knot, with the music box wound into it and the coat laid over it ──
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + r() * 0.3, len = 1.1 + r() * 1.5, rad = 0.09 + r() * 0.1;
      kit.addTo('bark', new THREE.CylinderGeometry(rad, rad * 0.6, len, 6),
        M(ROOTS.x + Math.cos(a) * len * 0.34, 0.16 + r() * 0.3, ROOTS.z + Math.sin(a) * len * 0.34, -a)
          .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 - 0.3 - r() * 0.5)), PAL.foliage.trunkDark);
    }
    kit.addTo('bark', new THREE.IcosahedronGeometry(0.95, 1), M(ROOTS.x, 0.72, ROOTS.z), PAL.foliage.trunkDark);
    kit.addTo('bark', new THREE.IcosahedronGeometry(0.55, 1), M(ROOTS.x + 0.7, 1.16, ROOTS.z - 0.3), PAL.foliage.trunk);
    // the groom's coat over it
    kit.addTo('paint', new THREE.ConeGeometry(0.66, 1.1, 10, 1, true), M(ROOTS.x + 0.2, 0.9, ROOTS.z + 0.5, 0.4), PAL.cloth.purpleDark);
    kit.addTo('paint', B(0.9, 0.16, 0.2), M(ROOTS.x + 0.2, 1.42, ROOTS.z + 0.5, 0.4), PAL.cloth.purpleDark);
    // MUSIC BOX 3, inside the roots, just visible
    kit.addTo('paint', B(0.34, 0.24, 0.26), M(ROOTS.x - 0.2, 0.54, ROOTS.z - 0.7, 0.5), PAL.paint.gold);
    kit.addTo('glow', new THREE.SphereGeometry(0.06, 7, 6), M(ROOTS.x - 0.2, 0.68, ROOTS.z - 0.7), PAL.cave.glow);
    kit.contact(ROOTS.x, ROOTS.z, 1.7, 0.7);

    // ── the cellar's own things: barrels, crates, a rack of bottles, mushrooms in the wet corner ──
    kit.roomBarrel(6.6, 2.6, 0.2, { s: 1.1 });
    kit.roomBarrel(7.2, 1.4, -0.3, { s: 1.0 });
    kit.crateStack(-7.2, 3.0, 0.3, { n: 3, seed: 5 });
    kit.shelf(7.4, -5.6, Math.PI, { w: 2.2, y: 1.1, n: 2, seed: 17 });
    kit.urn(-8.0, -3.0, { r: 0.3, h: 0.66, color: PAL.tile.dark });
    kit.urn(-8.0, -4.2, { r: 0.26, h: 0.58, color: PAL.tile.dark });
    kit.potGroup(4.4, -2.0, { n: 3, seed: 9 });
    kit.mushrooms(-6.4, -5.4, 6, 33, 0.9);
    kit.mushrooms(-4.6, -6.2, 4, 34, 0.7);
    kit.mushrooms(3.0, -6.4, 5, 35, 0.8);
    kit.floorPatch(-6.2, -5.2, { rx: 1.9, rz: 1.4, color: mixHex(PAL.water.deep, PAL.interior.dark, 0.55), lift: 0.016, seed: 5 });
    // roots creeping out of every wall, so the room feels GROWN and not built
    for (let k = 0; k < 10; k++) {
      const wallX = k % 2 ? 8.6 : -8.6, wz = -6.0 + (k / 2 | 0) * 2.6;
      kit.addTo('bark', new THREE.CylinderGeometry(0.1, 0.05, 1.4 + r(), 5),
        M(wallX, 0.4 + r() * 1.2, wz, k % 2 ? 0.3 : -0.3).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), PAL.foliage.trunkDark);
    }
    kit.candle(2.0, 0.9, 2.0, { h: 0.22, stick: true });
  },
});

export default cellar;
