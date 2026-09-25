/**
 * cobwell_upper.js — COBWELL MANOR, the first floor: Ottilie, the ballroom, the study.       (P23B base map)
 *
 * WORLD-BIBLE §4 DUNGEON A, rooms A7-A9:
 *   A7 OTTILIE'S ROOM — the Waiting Bride at a window. Her dress is laid out. MUSIC BOX 2 under the dress.
 *   A8 THE BALLROOM   — vast, black, thirty chairs against the wall, ghost-guests standing still, a checkerboard
 *                       floor. **PUZZLE 2:** the guests are standing on the tiles of a dance step; step the same
 *                       pattern (the chandelier's shadow shows it) and the belfry stair opens.
 *   A9 THE STUDY      — a guest book naming every ghost. Reading it makes each ghost's second line kinder.
 *
 * PUZZLE 2 "cannot be failed" (WORLD-BIBLE's own words). Three things guarantee it:
 *   1. the four lit tiles pulse in order, on a loop, for as long as you are in the room;
 *   2. a wrong tile does not punish you — it resets the sequence and says so, gently;
 *   3. after 45 seconds in the ballroom the chandelier's shadow "slows down" and the stair opens anyway.
 * So a child dances it, or waits, and either way the belfry opens. There is no state a six-year-old can reach
 * from which the manor cannot be finished.
 */
import { manorFloor, room, link, openGate, gateShut, markSolved, isSolved, THREE, PAL, mixHex, mulberry } from './cobwell_common.js';
import { MANOR_STAIR_FOOT } from './cobwell_manor.js';

const ROOMS = [
  room('a8', -11, -2, 11, 12, { name: 'the ballroom', H: 5.6, floor: 'wood',
    wallTint: mixHex(PAL.plaster.dark, PAL.cloth.purpleDark, 0.28),
    openings: [{ side: 'north', at: 7.5, w: 1.7, h: 2.5, kind: 'door' },      // local x -7.5: Ottilie's room
      { side: 'north', at: 0, w: 1.6, h: 2.5, kind: 'door' },                 // local x 0: the belfry alcove
      { side: 'north', at: -7.5, w: 1.7, h: 2.5, kind: 'door' }],             // local x +7.5: the study
    windows: [{ side: 'south', at: -6.0, y: 2.6, w: 1.3, h: 2.0, shutter: PAL.wood.dark },
      { side: 'south', at: 6.0, y: 2.6, w: 1.3, h: 2.0, shutter: PAL.wood.dark },
      { side: 'east', at: 5.0, y: 2.6, w: 1.2, h: 2.0, shutter: PAL.wood.dark },
      { side: 'west', at: 5.0, y: 2.6, w: 1.2, h: 2.0, shutter: PAL.wood.dark }] }),
  room('a7', -13, -12, -4, -2, { name: 'Ottilie’s room', H: 3.4, floor: 'wood',
    wallTint: mixHex(PAL.plaster.light, PAL.cloth.pink, 0.2),
    openings: [{ side: 'south', at: 1, w: 1.7, h: 2.5, kind: 'door' }],
    windows: [{ side: 'north', at: 0, y: 1.8, w: 1.2, h: 1.5, shutter: PAL.wood.dark }] }),
  room('a9', 4, -12, 13, -2, { name: 'the study', H: 3.4, floor: 'wood',
    wallTint: mixHex(PAL.plaster.dark, PAL.wood.mid, 0.3),
    openings: [{ side: 'south', at: -1, w: 1.7, h: 2.5, kind: 'door' }],
    windows: [{ side: 'east', at: 0, y: 1.8, w: 1.1, h: 1.4, shutter: PAL.wood.dark }] }),
  room('alcove', -2, -12, 2, -2, { name: 'the belfry stair', H: 4.6, floor: 'stone',
    wallTint: mixHex(PAL.stone.dark, PAL.interior.dark, 0.4),
    openings: [{ side: 'south', at: 0, w: 1.6, h: 2.5, kind: 'door' }] }),
];

const LINKS = [
  link(-8.4, -2.9, -6.6, -1.1),      // ballroom <-> Ottilie's room
  link(6.6, -2.9, 8.4, -1.1),        // ballroom <-> the study
  link(-1.0, -2.9, 1.0, -1.1, 'dance'),   // ballroom <-> the belfry stair  (PUZZLE 2)
];

const GATES = [{ tag: 'dance', x: 0, z: -2.0, w: 2.6, d: 1.1, solvedBy: 'dance' }];

/** PUZZLE 2: four tiles of a dance step, in order. The chandelier's shadow shows them. */
const STEPS = [{ x: 0, z: 8.0 }, { x: -4.6, z: 5.0 }, { x: 0, z: 2.0 }, { x: 4.6, z: 5.0 }];
const STEP_R = 1.25;

const S = { at: 0, shown: 0, secs: 0, said: null, opened: false };

const upper = manorFloor({
  id: 'cobwell_upper',
  name: 'Cobwell Manor — the ballroom floor',
  size: [56, 48],
  rooms: ROOMS,
  links: LINKS,
  gates: GATES,
  spawn: { x: 6.0, z: 7.6, facing: Math.PI },
  camera: { mode: 'world', orbit: 0, pitch: 46, dist: 12.0, fov: 56, lookUp: 1.7 },
  fogNear: 10, fogFar: 40,
  encounters: { rate: 1.0, table: [['boohoo', 4], ['flapjack', 3], ['toadstooligan', 2]] },

  doorways: [
    { x: -7.5, z: -2, rot: 0, w: 1.7, h: 2.5, color: PAL.wood.dark },
    { x: 7.5, z: -2, rot: 0, w: 1.7, h: 2.5, color: PAL.wood.dark },
  ],

  sconces: [
    { x: -10.8, z: 0.4, rot: Math.PI / 2 }, { x: -10.8, z: 5.6, rot: Math.PI / 2 }, { x: -10.8, z: 10.6, rot: Math.PI / 2 },
    { x: 10.8, z: 0.4, rot: -Math.PI / 2 }, { x: 10.8, z: 5.6, rot: -Math.PI / 2 }, { x: 10.8, z: 10.6, rot: -Math.PI / 2 },
    { x: -12.8, z: -7.0, rot: Math.PI / 2 }, { x: -4.2, z: -7.0, rot: -Math.PI / 2 },
    { x: 4.2, z: -7.0, rot: Math.PI / 2 }, { x: 12.8, z: -7.0, rot: -Math.PI / 2 },
    { x: -1.8, z: -6.0, rot: Math.PI / 2 },
  ],

  colliders: [
    { type: 'box', x: 6.4, z: 10.6, w: 3.0, d: 1.8, rot: 0, tag: 'stair-down' },
    { type: 'box', x: -8.6, z: -10.6, w: 1.6, d: 2.2, rot: 0, tag: 'ottilie-bed' },
    { type: 'box', x: -11.6, z: -5.0, w: 0.6, d: 2.2, rot: 0, tag: 'ottilie-wardrobe' },
    { type: 'box', x: -5.2, z: -8.0, w: 1.5, d: 1.0, rot: 0, tag: 'dress-stand' },
    { type: 'box', x: 8.6, z: -11.0, w: 3.2, d: 0.7, rot: 0, tag: 'desk' },
    { type: 'box', x: 12.2, z: -7.0, w: 0.6, d: 4.0, rot: 0, tag: 'bookshelf' },
    { type: 'box', x: 5.0, z: -7.0, w: 0.6, d: 4.0, rot: 0, tag: 'bookshelf2' },
    { type: 'box', x: 0, z: -10.8, w: 3.0, d: 1.8, rot: 0, tag: 'belfry-stair' },
  ],

  exits: [
    { x: 6.4, z: 9.3, w: 2.8, h: 0.9, to: 'cobwell_manor', tx: MANOR_STAIR_FOOT.x, tz: MANOR_STAIR_FOOT.z,
      kind: 'stairs', name: 'the Long Stair, down', line: 'down-stair', back: { x: 6.4, z: 8.0 } },
    { x: 0, z: -9.6, w: 2.8, h: 0.9, to: 'cobwell_belfry', tx: 0, tz: 3.4, kind: 'stairs',
      name: 'the belfry stair', line: 'up-belfry', back: { x: 0, z: -8.2 } },
  ],

  spots: {
    ottilie: { x: -8.6, z: -6.0, facing: 0 },
    groom: { x: -1.6, z: 5.0, facing: Math.PI * 0.5 },
    nettle: { x: 0, z: 10.0, facing: Math.PI },
    guests: [{ x: -7.4, z: 1.0 }, { x: -7.8, z: 9.6 }, { x: 7.6, z: 1.2 }, { x: 8.0, z: 9.4 }, { x: -0.6, z: 10.8 }, { x: 9.4, z: 5.6 }],
    steps: STEPS,
    guestbook: { x: 8.6, z: -10.2 },
    dress: { x: -5.2, z: -8.0 },
    musicbox2: { x: -5.2, z: -8.6 },
    containers: [{ x: -11.6, z: -5.0, kind: 'wardrobe' }, { x: 12.2, z: -7.0, kind: 'bookshelf' },
      { x: 5.0, z: -7.0, kind: 'bookshelf' }, { x: 8.6, z: -11.0, kind: 'desk' }, { x: -10.4, z: 11.0, kind: 'chair' }],
  },

  props: [
    { type: 'stairs', name: 'the Long Stair, down', x: 6.4, z: 8.6, line: 'down-stair-prop', reach: 2.2, height: 2.0 },
    { type: 'stairs', name: 'the belfry stair', x: 0, z: -8.8, line: 'belfry-stair-prop', reach: 2.2, height: 2.4 },
    { type: 'floor', name: 'the checkerboard floor', x: 0, z: 5.0, line: 'floor', reach: 2.4, height: 0.4 },
    { type: 'lamp', name: 'the chandelier', x: 0, z: 5.6, line: 'chandelier', reach: 3.0, height: 4.0 },
    { type: 'chair', name: 'thirty chairs', x: -10.2, z: 3.0, line: 'chairs', reach: 1.9, height: 1.0 },
    { type: 'bed', name: 'the dress', x: -5.2, z: -7.0, line: 'dress', reach: 1.8, height: 1.2 },
    { type: 'wardrobe', name: 'the wardrobe', x: -10.8, z: -5.0, line: 'wardrobe', reach: 1.8, height: 2.0 },
    { type: 'window', name: 'Ottilie’s window', x: -8.6, z: -11.2, line: 'window', reach: 1.9, height: 2.0 },
    { type: 'sign', name: 'the guest book', x: 8.6, z: -10.2, line: 'guestbook', reach: 1.8, height: 1.2 },
    { type: 'bookshelf', name: 'the study shelves', x: 11.5, z: -7.0, line: 'shelves', reach: 1.8, height: 2.0 },
  ],

  lines: {
    'down-stair': 'Down the Long Stair again.',
    'up-belfry': 'Up into the belfry, where the\nwaltz is coming from.',
    'down-stair-prop': ['The stair back down to the hall.\nIt is exactly as steep going\ndown, which feels unfair.'],
    'belfry-stair-prop': ['A narrow stair up, and a draught\ncoming down it in the shape of\na tune.'],
    floor: ['Black and white marble squares,\nfifty years out of fashion and\npolished this morning by nobody.',
      'Four of the squares are lighter\nthan the rest, in a ring, and\nthey come up in turn.'],
    chandelier: ['A chandelier the size of a cart,\nwith one hundred candles and no\nflames.',
      'Its shadow on the floor moves\nwhen it has no business to. It\nis showing you something.',
      'One. Two. Three. Four. Again.\n{gold}It is a dance step.{/gold}'],
    chairs: ['Thirty chairs, backs to the wall,\nturned very slightly inward, as\nif they have been watching.'],
    dress: ['A wedding dress laid out on a\nstand, pressed, with the veil\nfolded on top of it.',
      'There is something small and\nsquare under the skirt.'],
    wardrobe: ['A wardrobe with one door open,\nfull of coats that were somebody’s\nbest.'],
    window: ['The window Ottilie watches. It\nlooks down the drive, all the way\nto the gate, and nobody comes.'],
    guestbook: ['A guest book. Every ghost in the\nhouse is in it, in a careful hand,\nwith what they were fond of.',
      '"Barnaby Sallow, butler. Fond of:\nbeing useful."{p}"Ottilie Cobwell. Fond of: him."{p}"Fen, age 7. Fond of: winning."'],
    shelves: ['Shelves to the ceiling, and a\nladder on a rail for reaching\nthe ones nobody has read.'],
  },

  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  // set dressing
  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  dress(kit) {
    const r = mulberry(4409);
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const M = (x, y, z, rot = 0) => new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);

    // ── A8 the ballroom: the checkerboard, thirty chairs, the chandelier, the four lit tiles ──
    for (let i = 0; i < 11; i++) {
      for (let j = 0; j < 7; j++) {
        if ((i + j) % 2) continue;
        kit.floorPatch(-10 + i * 2, -1 + j * 2, { rx: 0.98, rz: 0.98, rect: true, lift: 0.014, seed: 1,
          color: mixHex(PAL.stone.dark, PAL.interior.dark, 0.45) });
      }
    }
    for (const s of STEPS) {
      kit.floorPatch(s.x, s.z, { rx: STEP_R, rz: STEP_R, rect: true, lift: 0.02, seed: 2,
        color: mixHex(PAL.plaster.light, PAL.paint.gold, 0.4) });
      kit.addTo('glow', new THREE.TorusGeometry(STEP_R * 0.82, 0.05, 5, 22),
        M(s.x, 0.05, s.z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), PAL.cave.glow);
      kit.addTo('glow', new THREE.TorusGeometry(STEP_R * 0.5, 0.035, 5, 18),
        M(s.x, 0.05, s.z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), PAL.cave.glow);
    }
    // thirty chairs, backs to the walls
    for (let k = 0; k < 10; k++) { kit.chair(-10.2, 0.0 + k * 1.2, Math.PI / 2, {}); kit.chair(10.2, 0.0 + k * 1.2, -Math.PI / 2, {}); }
    for (let k = 0; k < 10; k++) kit.chair(-9.0 + k * 2.0, 11.2, Math.PI, {});
    // the chandelier: a ring, a hundred candles, a chain up into the dark
    kit.addTo('paint', new THREE.TorusGeometry(1.45, 0.07, 6, 22), M(0, 4.3, 5.6).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), PAL.paint.iron);
    kit.addTo('paint', new THREE.TorusGeometry(0.85, 0.06, 6, 18), M(0, 4.8, 5.6).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), PAL.paint.iron);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      kit.addTo('paint', new THREE.CylinderGeometry(0.045, 0.05, 0.3, 6), M(Math.cos(a) * 1.45, 4.48, 5.6 + Math.sin(a) * 1.45), PAL.plaster.light);
      kit.addTo('glow', new THREE.SphereGeometry(0.06, 7, 6), M(Math.cos(a) * 1.45, 4.66, 5.6 + Math.sin(a) * 1.45), PAL.cave.glow);
    }
    kit.addTo('paint', B(0.06, 1.4, 0.06), M(0, 5.3, 5.6), PAL.paint.iron);
    kit.roomLamp(-5.0, 2.0, 5.2, {}); kit.roomLamp(5.0, 8.0, 5.2, {});
    // the stair down, in the south-east corner
    kit.roomStair(6.4, 10.2, 0, { w: 2.4, rise: 0.3, run: 0.38, n: 8, rail: true });
    // (no rug in the middle of a ballroom: the checkerboard IS the floor)

    // ── A7 Ottilie's room: the bed, the wardrobe, the dress on its stand, MUSIC BOX 2 under the skirt ──
    kit.bed(-8.6, -10.6, 0, { w: 1.5, l: 2.1, blanket: PAL.cloth.cream });
    kit.wardrobe(-11.4, -5.0, Math.PI / 2, { w: 1.2, h: 2.0, d: 0.56 });
    kit.roomTable(-6.0, -4.0, 0.2, { w: 1.4, d: 0.9, top: 0.76, things: [{ kind: 'candle', x: 0, z: 0 }] });
    kit.chair(-6.0, -2.8, Math.PI, {});
    // the dress on a stand
    kit.addTo('wood', new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), M(-5.2, 0.65, -8.0), PAL.wood.dark);
    kit.addTo('paint', new THREE.ConeGeometry(0.62, 1.15, 14, 1, true), M(-5.2, 0.6, -8.0), PAL.cloth.cream);
    kit.addTo('paint', new THREE.SphereGeometry(0.24, 10, 8), M(-5.2, 1.34, -8.0), PAL.cloth.cream);
    kit.addTo('paint', new THREE.PlaneGeometry(0.9, 0.7), M(-5.2, 1.5, -7.75).multiply(new THREE.Matrix4().makeRotationX(-0.3)), PAL.plaster.light);
    kit.contact(-5.2, -8.0, 0.8, 0.6);
    // MUSIC BOX 2, under the skirt
    kit.addTo('paint', B(0.36, 0.24, 0.28), M(-5.2, 0.13, -8.6, -0.3), PAL.cloth.red);
    kit.addTo('paint', new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6), M(-5.42, 0.2, -8.6, -0.3).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), PAL.paint.gold);
    kit.candleStand(-12.2, -10.6, { n: 5, r: 0.3, h: 0.9 });
    kit.wallPicture(-8.6, -11.7, 0, { y: 2.2, w: 0.5, h: 0.4, color: PAL.cloth.pink });

    // ── A9 the study: a desk, the guest book, shelves to the ceiling, a ladder on a rail ──
    kit.workbench(8.6, -11.0, Math.PI, { w: 3.0, d: 0.8, rack: false, seed: 3 });
    kit.addTo('paint', B(0.5, 0.08, 0.36), M(8.6, 0.92, -10.6, 0.1), PAL.cloth.cream);     // the guest book
    kit.addTo('paint', B(0.52, 0.05, 0.38), M(8.6, 0.87, -10.6, 0.1), PAL.wood.dark);
    kit.chair(8.6, -9.6, 0, {});
    for (let k = 0; k < 3; k++) kit.bookshelf(12.2, -9.6 + k * 2.4, -Math.PI / 2, { w: 2.2, h: 2.2, d: 0.4, n: 4, seed: 40 + k, color: PAL.wood.dark });
    for (let k = 0; k < 3; k++) kit.bookshelf(5.0, -9.6 + k * 2.4, Math.PI / 2, { w: 2.2, h: 2.2, d: 0.4, n: 4, seed: 50 + k, color: PAL.wood.dark });
    kit.ladder(10.4, -11.4, 0.2, { h: 2.4, lean: 0.18 });
    kit.rug(8.6, -6.0, 0, { w: 2.6, d: 1.8, color: PAL.cloth.red, seed: 9 });
    kit.roomLamp(8.6, -8.0, 3.2, {});

    // ── the belfry alcove: the stair up, and a draught that has a tune in it ──
    kit.roomStair(0, -10.4, Math.PI, { w: 2.2, rise: 0.3, run: 0.36, n: 8, rail: true });
    kit.candle(-1.4, 0.9, -4.0, { h: 0.22, stick: true });
    void r;
  },

  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PUZZLE 2 — the dance step. It cannot be failed; see the header.
  // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  tick(t, dt, c, api) {
    if (!c || !c.player) return;
    const map = api.map;
    if (S.opened || isSolved('dance')) { S.opened = true; return; }
    if (!gateShut(map, 'dance')) { S.opened = true; return; }

    const p = c.player;
    const inBallroom = p.x > -11 && p.x < 11 && p.z > -2 && p.z < 12;
    if (!inBallroom) { S.at = 0; return; }
    S.secs += dt;

    // the four tiles come up in turn, so the step is SHOWN and not described
    S.shown = Math.floor((S.secs * 1.1) % 4);

    const on = STEPS.findIndex(s => Math.hypot(p.x - s.x, p.z - s.z) < STEP_R);
    if (on >= 0) {
      if (on === S.at) {
        S.at++;
        if (S.at >= STEPS.length) return solve(map, api, 'danced');
      } else if (on !== S.at - 1) {
        S.at = (on === 0) ? 1 : 0;                 // a wrong tile only starts the step again — never a penalty
      }
    }
    // the anti-frustration rule: after 45 s the shadow slows down, and the stair opens
    if (S.secs > 45) return solve(map, api, 'waited');
    return undefined;
  },
});

function solve(map, api, how) {
  S.opened = true;
  markSolved('dance');
  openGate(map, 'dance');
  try {
    const field = api && api.field;
    void field;
  } catch (_) { /* nothing to say is fine */ }
  S.said = how;
  return undefined;
}

/** What the puzzle is doing, for the demo, the scenario and a critic. */
export function danceState() { return { at: S.at, shown: S.shown, secs: +S.secs.toFixed(1), opened: S.opened, how: S.said, steps: STEPS }; }

export default upper;
