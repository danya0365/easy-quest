/**
 * cobwell_manor.js — COBWELL MANOR, the ground floor.                                       (P23B base map)
 *
 * WORLD-BIBLE §4 DUNGEON A, rooms A1-A6: the haunted house every child needs to survive once.
 *
 *   A1 PORCH & FRONT HALL — Barnaby the Butler-shade, two sconces, a coat-stand with four coats and one is warm.
 *                            The Candle and the Retreat Bell are here (the first Retreat Bell in the game).
 *   A2 PORTRAIT GALLERY   — eleven portraits. Nine watch you. TWO DO NOT — those two are doors.  **PUZZLE 1**
 *   A3 KITCHEN            — the dinner service marching in single file across the floor, forever.  **THE SCARE**
 *   A4 LARDER (hidden)    — behind the third barrel in the kitchen. Four containers, three of them full.
 *   A5 THE LONG STAIR     — Master Fen, the boy hiding under the stairs. The ribbon beat (`ch1.ribbon`).
 *   A6 NURSERY            — a cot, a rocking horse that rocks, Music Box 1 on the shelf, and a hatbox that mews.
 *
 * The plan (INNER faces, x east, z south; the front door is at the south):
 *
 *        x -21..-16      x -15..-3        x -2..2        x 3..13
 *   z -7 [A4 LARDER]   [                A3 KITCHEN / A5 STAIR / A6 NURSERY               ]
 *   z  1               [     the north range: kitchen | stairwell | nursery              ]
 *   z  1..9                        [        A2 PORTRAIT GALLERY  x -11..11               ]
 *   z  9..19                       [        A1 FRONT HALL        x -7..7                 ]
 *
 * PUZZLE 1 is unfailable (DQV-RUBRIC "CLARITY: a six-year-old cannot get stuck"): examining a portrait that does
 * not watch you opens its door, and examining ALL eleven opens both — so a child who simply looks at everything
 * gets in either way. Nothing here can be missed and nothing can be locked behind a thing you did not notice.
 *
 * Its ghosts and every word are src/world/maps/cobwell_manor.npcs.js; its treasure cobwell_manor.chests.js.
 */
import { manorFloor, room, link, openGate, gateShut, markSolved, isSolved, THREE, PAL, mixHex, mulberry } from './cobwell_common.js';

// ── the rooms ────────────────────────────────────────────────────────────────────────────────────────────────
const HALL_TINT = mixHex(PAL.plaster.dark, PAL.stone.dark, 0.45);
const ROOMS = [
  room('a1', -7, 9, 7, 19, { name: 'the front hall', H: 4.2, floor: 'stone', wallTint: HALL_TINT,
    openings: [{ side: 'south', at: 0, w: 1.9, h: 2.7, kind: 'door' }, { side: 'north', at: 0, w: 2.0, h: 2.6, kind: 'door' }],
    windows: [{ side: 'east', at: 0, y: 2.1, w: 1.1, h: 1.5, shutter: PAL.wood.dark },
      { side: 'west', at: 0, y: 2.1, w: 1.1, h: 1.5, shutter: PAL.wood.dark }] }),
  // NOTE on `at`: roomShell puts a wall's openings along the wall's own local axis, and for the NORTH wall that
  // axis runs the other way (SIDES.north = PI), so `at` is the NEGATED local x there. Same for east (at = -local z)
  // and west (at = +local z). Every number below is measured against the LINKS beneath it, not guessed.
  room('a2', -11, 1, 11, 9, { name: 'the portrait gallery', H: 3.8, floor: 'wood', wallTint: mixHex(PAL.plaster.dark, PAL.cloth.red, 0.18),
    openings: [{ side: 'south', at: 0, w: 2.0, h: 2.6, kind: 'door' },
      { side: 'north', at: 0, w: 1.6, h: 2.4, kind: 'door' },
      { side: 'north', at: 8, w: 1.6, h: 2.4, kind: 'door' },        // local x -8: the WEST portrait door
      { side: 'north', at: -8, w: 1.6, h: 2.4, kind: 'door' }] }),   // local x +8: the EAST portrait door
  room('a3', -15, -7, -3, 1, { name: 'the kitchen', H: 3.4, floor: 'stone',
    openings: [{ side: 'south', at: 1, w: 1.6, h: 2.4, kind: 'door' }, { side: 'west', at: 0.3, w: 1.4, h: 2.2, kind: 'door' }] }),
  room('a4', -21, -6, -16, 0, { name: 'the larder', H: 2.9, floor: 'stone', wallTint: mixHex(PAL.plaster.grime, PAL.stone.dark, 0.5),
    openings: [{ side: 'east', at: -0.3, w: 1.4, h: 2.2, kind: 'door' }] }),
  room('a5', -2, -7, 2, 1, { name: 'the Long Stair', H: 5.0, floor: 'wood', wallTint: mixHex(PAL.plaster.dark, PAL.stone.dark, 0.6),
    openings: [{ side: 'south', at: 0, w: 1.6, h: 2.4, kind: 'door' }] }),
  room('a6', 3, -7, 13, 1, { name: 'the nursery', H: 3.4, floor: 'wood', wallTint: mixHex(PAL.plaster.light, PAL.cloth.blue, 0.22),
    openings: [{ side: 'south', at: 0, w: 1.6, h: 2.4, kind: 'door' }] }),
];

// ── the walkable slots between them ──────────────────────────────────────────────────────────────────────────
const LINKS = [
  link(-1.1, 8.2, 1.1, 9.8),            // hall <-> gallery
  link(-0.9, 0.2, 0.9, 1.8),            // gallery <-> the Long Stair
  link(-9.3, 0.2, -6.7, 1.8),           // gallery <-> kitchen      (PORTRAIT DOOR, west)
  link(6.7, 0.2, 9.3, 1.8),             // gallery <-> nursery      (PORTRAIT DOOR, east)
  link(-16.7, -3.6, -14.3, -1.8),       // kitchen <-> larder       (hidden behind the third barrel)
];

// ── the two doors the gallery hides, as removable colliders ──────────────────────────────────────────────────
const GATES = [
  { tag: 'portrait-west', x: -8.0, z: 1.0, w: 2.8, d: 1.0, solvedBy: 'portraits' },
  { tag: 'portrait-east', x: 8.0, z: 1.0, w: 2.8, d: 1.0, solvedBy: 'portraits' },
];

const DOOR_IN = { x: 0, z: 16.6 };                   // where you arrive, two steps inside the front door
export const MANOR_PORCH = { x: 0, z: 16.6, facing: Math.PI };
/** Where the cellar stair and the Long Stair put you back down on this floor. */
export const MANOR_CELLAR_FOOT = { x: -12.6, z: -1.2 };
export const MANOR_STAIR_FOOT = { x: 0, z: -2.6 };

// ── PUZZLE 1: eleven portraits. Nine watch you; two do not, and those two are doors. ────────────────────────
const PORTRAITS = [
  { id: 'p1', x: -9.6, z: 1.3, wall: 'north', watches: true, who: 'a man in a very high collar' },
  { id: 'p2', x: -5.6, z: 1.3, wall: 'north', watches: true, who: 'a woman with a hawk' },
  { id: 'p3', x: -2.8, z: 1.3, wall: 'north', watches: true, who: 'three identical brothers' },
  { id: 'p4', x: 2.8, z: 1.3, wall: 'north', watches: true, who: 'a horse, alone, in oils' },
  { id: 'p5', x: 5.6, z: 1.3, wall: 'north', watches: true, who: 'a bishop who is not Mortmain' },
  { id: 'p6', x: -9.6, z: 8.7, wall: 'south', watches: true, who: 'a boy with a hoop' },
  { id: 'p7', x: -5.0, z: 8.7, wall: 'south', watches: true, who: 'somebody’s awful aunt' },
  { id: 'p8', x: 5.0, z: 8.7, wall: 'south', watches: true, who: 'a dog in a waistcoat' },
  { id: 'p9', x: 9.6, z: 8.7, wall: 'south', watches: true, who: 'a lady with forty rings' },
  // the two that never turn — the doors
  { id: 'west', x: -8.0, z: 1.4, wall: 'north', watches: false, gate: 'portrait-west', who: 'a grey door painted to look like a portrait' },
  { id: 'east', x: 8.0, z: 1.4, wall: 'north', watches: false, gate: 'portrait-east', who: 'a grey door painted to look like a portrait' },
];

const LOOKED = new Set();

/** Examining a portrait. The two that do not watch you swing inward; looking at all eleven opens both anyway. */
function lookAt(p, ctx) {
  const map = ctx && ctx.map;
  LOOKED.add(p.id);
  if (p.gate) {
    const shut = gateShut(map, p.gate);
    if (shut) {
      markSolved('portraits');
      openGate(map, 'portrait-west');
      openGate(map, 'portrait-east');
      return { pages: ['This one does not look at you.\nIt has not looked at anything\nfor two hundred years.',
        '%HERO% pushes it.{wait:400}{n}It is not a portrait. It is a\n{gold}DOOR{/gold}, and it swings inward on\none complaining hinge.'], name: 'a portrait', voice: 'narrator' };
    }
    return { pages: ['The painted door stands open,\nbeing a door about it.'], name: 'a door', voice: 'narrator' };
  }
  // the ninth watching portrait a child examines opens both doors regardless: nobody gets stuck in a gallery
  const watched = PORTRAITS.filter(q => q.watches && LOOKED.has(q.id)).length;
  if (watched >= 9 && gateShut(map, 'portrait-west')) {
    markSolved('portraits');
    openGate(map, 'portrait-west');
    openGate(map, 'portrait-east');
    return { pages: [`${p.who}. It turns to watch you.`,
      '%HERO% has now looked at every\nportrait in the room — and two\nof them never looked back.',
      '{wait:300}He puts both hands on the two\nthat did not, and they open\nlike doors, because they are.'], name: 'a portrait', voice: 'narrator' };
  }
  return { pages: [`${p.who}. It turns to watch you.`,
    watched >= 5 ? 'Nine of the eleven turn. Two\nnever do.{p}Two is a strange number of\npaintings to be rude.'
      : 'You can hear the canvas creak\nwhen it does it.'], name: 'a portrait', voice: 'narrator' };
}

// ── props ────────────────────────────────────────────────────────────────────────────────────────────────────
const PROPS = [
  { type: 'door', name: 'the front door', x: 0, z: 18.3, line: 'front-door', reach: 2.0, height: 2.8 },
  { type: 'coatstand', name: 'the coat-stand', x: -5.2, z: 16.4, line: 'coats', reach: 1.8, height: 2.0 },
  { type: 'sign', name: 'the visitors’ book', x: 5.4, z: 16.4, line: 'book', reach: 1.8, height: 1.4 },
  { type: 'stairs', name: 'the Long Stair', x: 0, z: -4.3, line: 'long-stair', reach: 2.6, height: 3.0 },
  { type: 'stairs', name: 'the cellar steps', x: -12.6, z: -0.5, line: 'cellar-steps', reach: 2.0, height: 1.6 },
  { type: 'oven', name: 'the great range', x: -12.6, z: -4.8, line: 'range', reach: 2.0, height: 1.8 },
  { type: 'table', name: 'the kitchen table', x: -8.4, z: -3.2, line: 'kitchen-table', reach: 2.0, height: 1.0 },
  { type: 'barrel', name: 'the third barrel', x: -13.6, z: -3.9, line: 'third-barrel', reach: 1.7, height: 1.2 },
  { type: 'shelf', name: 'the larder shelves', x: -18.4, z: -4.4, line: 'larder-shelf', reach: 1.8, height: 1.9 },
  { type: 'bed', name: 'the cot', x: 6.4, z: -4.4, line: 'cot', reach: 1.8, height: 1.0 },
  { type: 'horse', name: 'the rocking horse', x: 9.8, z: -4.6, line: 'horse', reach: 1.9, height: 1.3 },
  { type: 'shelf', name: 'the nursery shelf', x: 11.6, z: -1.2, line: 'nursery-shelf', reach: 1.8, height: 1.8 },
  ...PORTRAITS.map(p => ({
    type: 'picture', name: p.watches ? 'a portrait' : 'a portrait that does not look at you',
    x: p.x, z: p.z + (p.wall === 'north' ? 0.9 : -0.9), reach: 1.9, height: 1.8,
    talk: (ctx) => lookAt(p, ctx),
  })),
];

const manor = manorFloor({
  id: 'cobwell_manor',
  name: 'Cobwell Manor',
  size: [56, 52],
  rooms: ROOMS,
  links: LINKS,
  gates: GATES,
  spawn: { x: DOOR_IN.x, z: DOOR_IN.z, facing: Math.PI },
  camera: { mode: 'world', orbit: 0, pitch: 47, dist: 11.0, fov: 55, lookUp: 1.6 },
  fogNear: 9, fogFar: 36,
  music: 'dungeon',                                  // CANON §9 — one music box, too slow, with a stuck note
  encounters: { rate: 1.0, table: [['boohoo', 4], ['flapjack', 3], ['toadstooligan', 2], ['chestnut', 0.5]] },

  doorways: [
    { x: 0, z: 9, rot: 0, w: 2.0, h: 2.6, color: PAL.wood.dark },
    { x: 0, z: 1, rot: 0, w: 1.6, h: 2.4, color: PAL.wood.dark },
    { x: -15.5, z: -2.7, rot: Math.PI / 2, w: 1.4, h: 2.2, color: PAL.wood.dark, open: false },
  ],

  sconces: [
    { x: -6.8, z: 12.0, rot: Math.PI / 2 }, { x: 6.8, z: 12.0, rot: -Math.PI / 2 },
    { x: -6.8, z: 16.0, rot: Math.PI / 2 }, { x: 6.8, z: 16.0, rot: -Math.PI / 2 },
    { x: -10.8, z: 5.0, rot: Math.PI / 2 }, { x: 10.8, z: 5.0, rot: -Math.PI / 2 },
    { x: 0, z: 8.8, rot: Math.PI },
    { x: -14.8, z: -3.4, rot: Math.PI / 2 }, { x: -3.2, z: -3.4, rot: -Math.PI / 2 },
    { x: -20.8, z: -3.0, rot: Math.PI / 2 },
    { x: -1.8, z: -5.0, rot: Math.PI / 2 },
    { x: 3.2, z: -3.4, rot: Math.PI / 2 }, { x: 12.8, z: -3.4, rot: -Math.PI / 2 },
  ],

  colliders: [
    { type: 'box', x: -12.6, z: -6.1, w: 2.8, d: 1.5, rot: 0, tag: 'range' },
    { type: 'box', x: -8.4, z: -3.2, w: 3.0, d: 1.3, rot: 0, tag: 'kitchen-table' },
    { type: 'circle', x: -14.4, z: -5.0, r: 0.5, tag: 'barrel' },
    { type: 'circle', x: -14.4, z: -6.1, r: 0.5, tag: 'barrel' },
    { type: 'circle', x: -14.3, z: -3.9, r: 0.5, tag: 'barrel' },
    { type: 'box', x: -19.6, z: -4.6, w: 2.4, d: 0.6, rot: 0, tag: 'larder-shelf' },
    { type: 'box', x: 6.4, z: -5.2, w: 1.5, d: 2.2, rot: 0, tag: 'cot' },
    { type: 'circle', x: 9.8, z: -5.2, r: 0.7, tag: 'rocking-horse' },
    { type: 'box', x: 12.2, z: -1.2, w: 0.6, d: 2.4, rot: 0, tag: 'nursery-shelf' },
    { type: 'circle', x: -5.2, z: 17.0, r: 0.4, tag: 'coat-stand' },
    { type: 'box', x: 0, z: -6.1, w: 3.4, d: 1.9, rot: 0, tag: 'stair' },
  ],

  exits: [
    { x: 0, z: 18.7, w: 2.2, h: 1.0, to: 'road_wood', tx: 0, tz: -19.6, kind: 'door',
      name: 'the front door', line: 'out-front', back: { x: 0, z: 16.6 } },
    { x: 0, z: -4.75, w: 2.8, h: 0.9, to: 'cobwell_upper', tx: 6.0, tz: 7.6, kind: 'stairs',
      name: 'the Long Stair', line: 'up-stair', back: { x: 0, z: -3.4 } },
    { x: -12.6, z: 0.5, w: 2.2, h: 0.8, to: 'cobwell_cellar', tx: 0, tz: 2.4, kind: 'stairs',
      name: 'the cellar steps', line: 'down-cellar', back: { x: -12.6, z: -1.2 } },
  ],

  spots: {
    porch: MANOR_PORCH,
    barnaby: { x: 0, z: 14.4, facing: 0 },
    fen: { x: 1.2, z: -5.6, facing: Math.PI * 0.8 },
    cat: { x: -4.0, z: 5.0 },
    willow: { x: -2.4, z: 15.2, facing: Math.PI * 0.2 },
    sera: { x: 2.6, z: 15.4, facing: Math.PI * 1.8 },
    hatbox: { x: 11.4, z: -5.4 },
    musicbox: { x: 11.6, z: -2.0 },
    stairFoot: MANOR_STAIR_FOOT,
    cellarFoot: MANOR_CELLAR_FOOT,
    portraits: PORTRAITS.map(p => ({ id: p.id, x: p.x, z: p.z, door: !p.watches })),
    containers: [{ x: -14.4, z: -5.0, kind: 'barrel' }, { x: -14.3, z: -3.9, kind: 'barrel' },
      { x: -19.6, z: -4.6, kind: 'shelf' }, { x: -5.2, z: 17.0, kind: 'coats' }, { x: 11.6, z: -2.0, kind: 'shelf' }],
  },

  props: PROPS,

  lines: {
    'out-front': 'Back out under the dripping\nporch. The door never locks.\nBarnaby says so.',
    'up-stair': 'Up the Long Stair, into the\ndraught.',
    'down-cellar': 'Down the cellar steps, where\nthe air is older.',
    'front-door': ['A black door with a brass knocker\nshaped like a rather sad face.',
      'It is unlocked. It has always\nbeen unlocked. That is somehow\nworse.'],
    coats: ['Four coats on a stand, in a\nhouse where nobody has arrived\nfor two hundred years.',
      '{wait:400}One of them is warm.'],
    book: ['A visitors’ book, open, with a\npen laid across it.',
      'The last name was written in\n1102. There is room for yours.'],
    'long-stair': ['The stair goes up into a draught\nyou can hear before you feel.',
      'Halfway up, the candle will not\nlike it.'],
    'cellar-steps': ['Eleven steps down. The eleventh\nis under water and always has\nbeen.'],
    range: ['A range you could roast an ox in.\nIt is cold, and it is clean, and\nsomething has been using it.'],
    'kitchen-table': ['A scrubbed table. Down the middle\nof it, single file, the dinner\nservice is marching.',
      '{wait:300}A gravy boat goes past at knee\nheight and does not look up.'],
    'third-barrel': ['Three barrels. The third one is\nnot against the wall.',
      '{wait:300}Behind it there is a door, and\nbehind the door there is a\n{gold}LARDER{/gold}.'],
    'larder-shelf': ['Jars. Hundreds of them, labelled\nin a lovely hand.',
      '"DAMSONS, 1101." They are still\nperfectly good, which is the\nmost frightening thing yet.'],
    cot: ['A cot with the blankets turned\ndown, as if for tonight.'],
    horse: ['A rocking horse.{wait:500}{n}It is rocking.',
      '%HERO% puts a hand on it, and\nit stops, and it lets him.'],
    'nursery-shelf': ['A shelf of nursery things: nine\nwooden animals, and one small\npainted box with a handle.'],
  },

  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  // set dressing
  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  dress(kit) {
    const r = mulberry(7717);
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const M = (x, y, z, rot = 0) => new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);

    // ── A1 the front hall: a rug, the coat-stand, two great chairs, a chandelier's ghost of a shadow ──
    for (let k = 0; k < 5; k++) kit.floorPatch(0, 12.2 + k * 1.05, { rx: 1.5, rz: 0.55, rect: true, lift: 0.012, seed: 5, color: PAL.cloth.purpleDark });
    kit.chair(-5.6, 11.4, 0.5, { big: true });
    kit.chair(5.6, 11.4, -0.5, { big: true });
    kit.candleStand(-3.0, 17.6, { n: 7, r: 0.36, h: 0.9 });
    kit.candleStand(3.0, 17.6, { n: 5, r: 0.3, h: 0.9 });
    // the coat-stand: a post, four pegs, four coats
    kit.addTo('wood', B(0.12, 2.0, 0.12), M(-5.2, 1.0, 17.0), PAL.wood.dark);
    kit.addTo('wood', new THREE.CylinderGeometry(0.28, 0.34, 0.1, 10), M(-5.2, 0.05, 17.0), PAL.wood.dark);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      kit.addTo('wood', B(0.42, 0.06, 0.06), M(-5.2 + Math.cos(a) * 0.2, 1.86, 17.0 + Math.sin(a) * 0.2, -a), PAL.wood.beam);
      kit.addTo('paint', B(0.5, 1.0, 0.16), M(-5.2 + Math.cos(a) * 0.36, 1.25, 17.0 + Math.sin(a) * 0.36, -a),
        [PAL.cloth.red, PAL.cloth.blue, PAL.cloth.purple, PAL.cloth.leather][k]);
    }
    kit.contact(-5.2, 17.0, 0.6, 0.7);
    kit.wallPicture(0, 10.7, 0, { y: 2.6, w: 1.4, h: 1.0, color: PAL.cloth.cream });
    kit.roomLamp(0, 14.0, 4.0, { drop: 0.5 });

    // ── A2 the gallery: eleven pictures, a runner carpet, two urns ──
    const PAINT = [PAL.cloth.red, PAL.paint.shutterBlue, PAL.cloth.purpleDark, PAL.thatch.dark, PAL.foliage.dark,
      PAL.cloth.leather, PAL.tile.dark, PAL.paint.shutterGreen, PAL.brick.dark];
    let pk = 0;
    for (const p of PORTRAITS) {
      const rot = p.wall === 'north' ? 0 : Math.PI;
      const zw = p.wall === 'north' ? 1 + 0.18 : 9 - 0.18, face = p.wall === 'north' ? 1 : -1;
      if (!p.watches) {
        // a door painted to look like a portrait: man-height, grey, and the wrong shape for a picture
        kit.addTo('wood', B(1.5, 2.5, 0.12), M(p.x, 1.25, zw + face * 0.02), PAL.wood.dark);
        kit.addTo('plaster', B(1.22, 2.2, 0.06), M(p.x, 1.24, zw + face * 0.09), mixHex(PAL.stone.dark, PAL.plaster.grime, 0.45));
        kit.addTo('paint', new THREE.SphereGeometry(0.07, 8, 6), M(p.x + 0.52, 1.2, zw + face * 0.14), PAL.paint.iron);
        continue;
      }
      const w = 1.0 + (pk % 3) * 0.14, h = 1.3 + (pk % 2) * 0.22;
      kit.addTo('wood', B(w + 0.22, h + 0.22, 0.1), M(p.x, 2.0, zw + face * 0.02), PAL.wood.dark);
      kit.addTo('paint', B(w, h, 0.05), M(p.x, 2.0, zw + face * 0.08), PAINT[pk % PAINT.length]);
      // a pale oval where a face is, and a gold plate under the frame with a name nobody reads
      kit.addTo('paint', new THREE.SphereGeometry(w * 0.22, 10, 8), M(p.x, 2.0 + h * 0.16, zw + face * 0.12), PAL.char.skin);
      kit.addTo('paint', B(w * 0.5, 0.09, 0.04), M(p.x, 2.0 - h / 2 - 0.16, zw + face * 0.1), PAL.paint.gold);
      pk++;
    }
    void r;
    // a narrow runner down the middle of the gallery, not a bullseye in the middle of it
    for (let k = 0; k < 7; k++) kit.floorPatch(0, 2.0 + k * 1.0, { rx: 0.95, rz: 0.52, rect: true, lift: 0.012, seed: 3, color: PAL.cloth.red });
    for (let k = 0; k < 7; k++) kit.floorPatch(0, 2.0 + k * 1.0, { rx: 0.7, rz: 0.36, rect: true, lift: 0.014, seed: 4, color: mixHex(PAL.cloth.red, PAL.plaster.light, 0.28) });
    kit.urn(-10.2, 2.2, { r: 0.34, h: 0.8, color: PAL.tile.dark });
    kit.urn(10.2, 2.2, { r: 0.34, h: 0.8, color: PAL.tile.dark });
    kit.urn(-10.2, 7.8, { r: 0.3, h: 0.7, color: PAL.tile.dark });
    kit.roomLamp(-5.0, 5.0, 3.6, {}); kit.roomLamp(5.0, 5.0, 3.6, {});

    // ── A3 the kitchen: the range, the table, THE DINNER SERVICE, barrels, hanging herbs ──
    kit.oven(-12.6, -6.0, 0, { w: 2.5, h: 2.0, d: 1.3, lit: false, peel: true });
    kit.roomTable(-8.4, -3.2, 0, { w: 3.0, d: 1.2, top: 0.8, things: [] });
    kit.cauldron(-11.2, -2.2, { r: 0.34, h: 0.4, fire: false, hook: true });
    kit.hangingHerbs(-9.0, -5.8, 2.5, { n: 4, seed: 13 });
    kit.onionRope(-6.0, -6.4, 2.1, { n: 5, seed: 19 });
    kit.roomBarrel(-14.4, -5.0, 0, { s: 1.05 });
    kit.roomBarrel(-14.4, -6.1, 0.3, { s: 1.0 });
    kit.roomBarrel(-14.3, -3.9, -0.3, { s: 0.95 });
    kit.crateStack(-4.4, -5.8, 0.2, { n: 3, seed: 7 });
    kit.potGroup(-5.0, -1.2, { n: 4, seed: 9 });
    // the dinner service, marching single file across the floor for ever (THE SCARE, part 1)
    for (let k = 0; k < 14; k++) {
      const px = -14.0 + k * 0.82, pz = -3.2 + Math.sin(k * 0.9) * 0.18;
      const kind = k % 4;
      if (kind === 0) kit.addTo('tile', new THREE.CylinderGeometry(0.19, 0.16, 0.05, 12), M(px, 0.84, pz), PAL.plaster.light);
      else if (kind === 1) kit.addTo('tile', new THREE.CylinderGeometry(0.1, 0.08, 0.13, 10), M(px, 0.88, pz), PAL.plaster.light);
      else if (kind === 2) kit.addTo('tile', new THREE.SphereGeometry(0.13, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), M(px, 0.82, pz), PAL.plaster.light);
      else kit.addTo('paint', B(0.05, 0.02, 0.24), M(px, 0.82, pz, 0.2), PAL.stone.light);
    }
    kit.roomLamp(-9.0, -3.2, 3.2, {});

    // ── A4 the larder: shelves of jars ──
    kit.bookshelf(-19.8, -4.6, 0, { w: 2.2, h: 1.9, d: 0.4, n: 4, seed: 21, color: PAL.wood.dark });
    kit.shelf(-20.6, -1.4, Math.PI / 2, { w: 1.8, y: 1.2, n: 2, seed: 23 });
    kit.sackPile(-17.4, -1.0, 0.2, { n: 3, seed: 27 });
    kit.urn(-17.6, -5.0, { r: 0.28, h: 0.62, color: PAL.tile.mid });

    // ── A5 the Long Stair: a real stair going up, and a dark place under it ──
    kit.roomStair(0, -5.6, Math.PI, { w: 2.6, rise: 0.3, run: 0.38, n: 9, rail: true });
    kit.addTo('wood', B(3.4, 0.14, 2.0), M(0, 2.9, -6.2), PAL.wood.dark);          // the landing overhead
    kit.wallSword(-1.8, -1.6, Math.PI / 2, { y: 2.0, len: 1.1, mark: true });
    kit.addTo('paint', B(0.9, 0.7, 0.06), M(1.3, 0.4, -6.6, -0.2), PAL.cloth.purpleDark);   // the boy's blanket
    kit.floorPatch(0.9, -6.5, { rx: 0.9, rz: 0.5, color: PAL.interior.dark, lift: 0.015, seed: 11 });
    kit.candle(0, 0.9, -0.4, { h: 0.24, stick: true });
    // the cellar steps: a dark hole in the kitchen floor with stone treads going down into it
    kit.addTo('stone', B(2.0, 0.06, 1.3), M(-12.6, 0.02, 0.2), PAL.interior.dark);
    for (let k = 0; k < 4; k++) kit.addTo('stone', B(1.9, 0.14, 0.3), M(-12.6, -0.08 - k * 0.14, -0.2 + k * 0.3), PAL.stone.dark);
    for (const s of [-1, 1]) kit.addTo('stone', B(0.22, 0.5, 1.4), M(-12.6 + s * 1.05, 0.25, 0.2), PAL.stone.mid);

    // ── A6 the nursery: the cot, the rocking horse, the shelf with the music box, the HATBOX THAT MEWS ──
    kit.bed(6.4, -5.2, 0, { w: 1.3, l: 2.0, small: true, blanket: PAL.cloth.cream });
    kit.rug(8.0, -2.4, 0, { w: 3.0, d: 2.0, color: PAL.cloth.blue, seed: 4 });
    // the rocking horse: two rockers, a body, a head, a mane
    const hx = 9.8, hz = -5.2;
    for (const s of [-1, 1]) kit.addTo('wood', B(0.09, 0.3, 1.7), M(hx + s * 0.3, 0.18, hz, 0.0), PAL.wood.mid);
    kit.addTo('wood', new THREE.CapsuleGeometry(0.26, 0.7, 4, 8), M(hx, 0.78, hz).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), PAL.plaster.light);
    kit.addTo('wood', new THREE.SphereGeometry(0.2, 10, 8), M(hx, 1.06, hz - 0.52), PAL.plaster.light);
    kit.addTo('paint', B(0.1, 0.34, 0.34), M(hx, 1.12, hz - 0.3), PAL.cloth.red);
    kit.addTo('wood', B(0.06, 0.5, 0.06), M(hx, 0.5, hz + 0.5), PAL.wood.dark);
    kit.contact(hx, hz, 1.0, 0.6, { rx: 0.5, rz: 1.0 });
    kit.shelf(12.2, -1.2, -Math.PI / 2, { w: 2.4, y: 1.4, n: 2, seed: 31 });
    // the hatbox, on the floor at the end of the shelf: a round box with a lid, and a small sound
    kit.addTo('paint', new THREE.CylinderGeometry(0.42, 0.44, 0.44, 14), M(11.4, 0.22, -5.4), PAL.cloth.pink || PAL.flower.pink);
    kit.addTo('paint', new THREE.CylinderGeometry(0.47, 0.47, 0.07, 14), M(11.4, 0.47, -5.4), PAL.cloth.cream);
    kit.addTo('paint', new THREE.TorusGeometry(0.2, 0.03, 5, 12), M(11.4, 0.53, -5.4).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), PAL.cloth.rope);
    kit.contact(11.4, -5.4, 0.66, 0.6);
    // the music box on the shelf: a small painted box with a brass handle
    kit.addTo('paint', B(0.4, 0.26, 0.3), M(11.6, 1.53, -2.0, 0.2), PAL.paint.shutterBlue);
    kit.addTo('paint', new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), M(11.85, 1.6, -2.0, 0.2).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), PAL.paint.gold);
    for (let k = 0; k < 9; k++) kit.addTo('paint', new THREE.IcosahedronGeometry(0.08, 0), M(11.0 + (k % 5) * 0.34, 1.5 + ((k / 5) | 0) * 0.62, -2.6 + (k % 3) * 0.3), [PAL.cloth.red, PAL.foliage.mid, PAL.thatch.mid][k % 3]);
    kit.roomLamp(8.0, -3.4, 3.2, {});
    kit.wallSconce(12.8, -5.6, -Math.PI / 2, { y: 1.8, lantern: true });
  },
});

export default manor;
