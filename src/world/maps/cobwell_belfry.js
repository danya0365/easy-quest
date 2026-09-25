/**
 * cobwell_belfry.js — COBWELL MANOR, the belfry (WORLD-BIBLE §4 A11-A12).                    (P23B base map)
 *
 * "BOSS: Mumbleroot the Grudge. A tangle of root and grief in a wedding coat, 180 HP, two attacks. It never
 *  targets Willow. Beaten, it unravels into a plain black coat lying on the floor. No death rattle."
 *
 * The room: a bell frame with no bell in it (the bell went to Bellhollow's story, not this one — this frame holds
 * a WEATHER VANE and three hundred years of rain), a stair down, a rope by the frame that drops you straight to
 * the front hall if you want out (the bible's own escape hatch, so this room can never trap a child), and the
 * boss circle in the middle.
 *
 * The fight is not scripted here. It is a BOSS DOOR (`bossDoors`, src/world/encounter.js): step into the circle
 * and the game asks "Something is waiting past this door. Go on?" with a Yes/No — never a surprise, never a
 * corridor you cannot back out of. The enemy, its level and the party come from tests/battle/areas.js
 * `cobwell_manor.boss`, which is Mumbleroot at Lv 7 with Bram, Willow, Sera and Bobble.
 */
import { manorFloor, room, THREE, PAL, mixHex, mulberry } from './cobwell_common.js';

const ROOMS = [
  room('a11', -7, -7, 7, 7, { name: 'the belfry', H: 6.4, floor: 'stone', wall: 'stone',
    wallTint: mixHex(PAL.stone.mid, PAL.interior.dark, 0.3),
    openings: [{ side: 'south', at: 0, w: 1.8, h: 2.4, kind: 'door' }],
    windows: [{ side: 'north', at: 0, y: 3.4, w: 2.2, h: 2.4, shutter: PAL.wood.dark },
      { side: 'east', at: 0, y: 3.4, w: 2.2, h: 2.4, shutter: PAL.wood.dark },
      { side: 'west', at: 0, y: 3.4, w: 2.2, h: 2.4, shutter: PAL.wood.dark }] }),
];

const BOSS = { x: 0, z: -2.6 };

const belfry = manorFloor({
  id: 'cobwell_belfry',
  name: 'Cobwell Manor — the belfry',
  size: [24, 24],
  rooms: ROOMS,
  links: [],
  spawn: { x: 0, z: 3.4, facing: Math.PI },
  camera: { mode: 'world', orbit: 0, pitch: 44, dist: 10.0, fov: 55, lookUp: 1.9 },
  fogNear: 8, fogFar: 26,
  sun: 1.25, hemi: 1.3,
  // the belfry itself is quiet: the waltz is what you can hear, and the fight brings its own music
  encounters: false,

  // WORLD-BIBLE §4 A11: the boss of Cobwell Manor, asked for with a window and a Yes / No
  bossDoors: [{ x: BOSS.x, z: BOSS.z, r: 2.4, area: 'cobwell_manor', boss: 1,
    name: 'Mumbleroot the Grudge',
    ask: 'Something in a wedding coat is\nstanding in the bell frame, and\nit has not moved in two hundred\nyears.' }],

  sconces: [{ x: -6.8, z: 3.0, rot: Math.PI / 2 }, { x: 6.8, z: 3.0, rot: -Math.PI / 2 },
    { x: -6.8, z: -4.0, rot: Math.PI / 2 }, { x: 6.8, z: -4.0, rot: -Math.PI / 2 }],

  colliders: [
    { type: 'box', x: 0, z: 6.1, w: 2.6, d: 0.6, rot: 0, tag: 'steps' },
    { type: 'circle', x: -5.2, z: -5.2, r: 0.42, tag: 'post' },
    { type: 'circle', x: 5.2, z: -5.2, r: 0.42, tag: 'post' },
    { type: 'circle', x: -5.2, z: 1.4, r: 0.42, tag: 'post' },
    { type: 'circle', x: 5.2, z: 1.4, r: 0.42, tag: 'post' },
  ],

  exits: [
    { x: 0, z: 5.3, w: 2.6, h: 0.8, to: 'cobwell_upper', tx: 0, tz: -7.0, kind: 'stairs',
      name: 'the belfry stair, down', line: 'down-belfry', back: { x: 0, z: 3.4 } },
  ],

  spots: {
    boss: BOSS,
    rope: { x: 4.6, z: 3.4 },
    frame: { x: 0, z: -2.6 },
    nettle: { x: -2.4, z: 2.0, facing: Math.PI * 1.2 },
    containers: [{ x: -5.6, z: 4.2, kind: 'crate' }, { x: 5.6, z: -2.0, kind: 'urn' }],
  },

  props: [
    { type: 'rope', name: 'the rope by the frame', x: 4.6, z: 3.4, line: 'rope', reach: 1.9, height: 2.4,
      talk: (ctx) => {
        // the bible's escape hatch: "a rope by the belfry drops you straight to A1 if you want out"
        try {
          const f = ctx && ctx.field;
          if (f && typeof f.teleport === 'function') {
            setTimeout(() => { try { f.teleport('cobwell_manor', 0, 14.6); } catch (_) { /* the rope frays */ } }, 700);
            return { pages: ['%HERO% pulls the rope.{wait:400}{n}Somewhere a long way down,\nsomething accepts this.'], name: 'the rope', voice: 'narrator' };
          }
        } catch (_) { /* fall through to the words */ }
        return { pages: ['A rope through a hole in the\nfloor, with a knot in it every\ntwo feet.', 'For guests who find they must\nleave. Barnaby thinks of\neverything.'], name: 'the rope', voice: 'narrator' };
      } },
    { type: 'frame', name: 'the bell frame', x: 0, z: -0.6, line: 'frame', reach: 2.4, height: 3.4 },
    { type: 'stairs', name: 'the belfry stair', x: 0, z: 4.2, line: 'steps', reach: 2.0, height: 1.8 },
    { type: 'window', name: 'the open arches', x: 0, z: -6.2, line: 'arches', reach: 2.2, height: 3.0 },
  ],

  lines: {
    'down-belfry': 'Down the narrow stair, into the\nballroom.',
    rope: ['A rope through a hole in the\nfloor, with a knot in it every\ntwo feet.'],
    frame: ['A great oak frame with no bell in\nit — only a weather vane, and\nthree hundred years of rain.',
      'Standing under it, in a wedding\ncoat, is a shape made of root.',
      '{wait:400}It has been waiting. You can tell,\nbecause it is still waiting.'],
    steps: ['The stair down. It is exactly as\nnarrow as it was coming up.'],
    arches: ['Three open arches, and through\nthem the whole of the Whispering\nWood, black and moving.',
      'You can see the Beck from here.\nYou can nearly see home.'],
  },

  dress(kit) {
    const r = mulberry(8831);
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const M = (x, y, z, rot = 0) => new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);

    kit.roomStair(0, 5.8, 0, { w: 2.2, rise: 0.28, run: 0.34, n: 6, rail: true });

    // ── the bell frame: four posts, two cross-beams, and a weather vane where the bell should be ──
    for (const [px, pz] of [[-5.2, -5.2], [5.2, -5.2], [-5.2, 1.4], [5.2, 1.4]]) {
      kit.addTo('wood', B(0.34, 5.4, 0.34), M(px, 2.7, pz), PAL.wood.dark);
      kit.contact(px, pz, 0.6, 0.7);
    }
    for (const pz of [-5.2, 1.4]) kit.addTo('wood', B(10.8, 0.34, 0.34), M(0, 4.9, pz), PAL.wood.dark);
    for (const px of [-5.2, 5.2]) kit.addTo('wood', B(0.34, 0.34, 6.9), M(px, 4.9, -1.9), PAL.wood.dark);
    kit.addTo('wood', B(3.4, 0.3, 0.3), M(0, 4.6, -1.9), PAL.wood.beam);
    // the vane
    kit.addTo('paint', new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), M(0, 5.6, -1.9), PAL.paint.iron);
    kit.addTo('paint', B(0.9, 0.34, 0.03), M(0, 6.0, -1.9, 0.6), PAL.paint.iron);
    kit.addTo('paint', new THREE.ConeGeometry(0.16, 0.4, 5), M(0.5, 6.0, -1.9, 0.6).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2)), PAL.paint.gold);
    // the hook the bell hung from, and the empty chain
    kit.addTo('paint', new THREE.TorusGeometry(0.16, 0.035, 5, 12), M(0, 4.3, -1.9), PAL.paint.iron);

    // ── the rope through the floor ──
    kit.addTo('paint', new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), M(4.6, 1.2, 3.4), PAL.cloth.rope);
    for (let k = 0; k < 5; k++) kit.addTo('paint', new THREE.SphereGeometry(0.09, 7, 6), M(4.6, 0.3 + k * 0.5, 3.4), PAL.cloth.rope);
    kit.addTo('stone', new THREE.CylinderGeometry(0.42, 0.42, 0.08, 14), M(4.6, 0.02, 3.4), PAL.interior.dark);

    // ── the roots that got in through the arches, and the floor that has been rained on for ever ──
    for (let k = 0; k < 8; k++) {
      const a = Math.PI + (k / 8) * Math.PI, rr = 6.4;
      kit.addTo('bark', new THREE.CylinderGeometry(0.1, 0.05, 1.6 + r(), 5),
        M(Math.cos(a) * rr, 0.3 + r() * 1.4, -1.9 + Math.sin(a) * rr, a)
          .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 - 0.4)), PAL.foliage.trunkDark);
    }
    kit.floorPatch(0, -2.6, { rx: 2.4, rz: 2.0, color: mixHex(PAL.stone.dark, PAL.foliage.trunkDark, 0.35), lift: 0.016, seed: 3 });
    kit.crateStack(-5.6, 4.2, 0.3, { n: 2, seed: 7 });
    kit.urn(5.6, -2.0, { r: 0.3, h: 0.66, color: PAL.tile.dark });
    kit.candleStand(-2.4, 4.2, { n: 5, r: 0.3, h: 0.9 });
    kit.strawScatter(1.4, -4.6, { n: 12, r: 1.1, seed: 5, color: PAL.foliage.trunk });
  },
});

export default belfry;
