/**
 * puddlewick_inn.js — THE INN at Puddlewick: one warm common room.                     (P23 base map, art P05)
 *
 * The second door in the village that a child can actually walk through (P23 gap #6): once two of the ten doors
 * are real, a six-year-old learns that doors HERE are real and tries the rest. WORLD-BIBLE §3's village plan puts
 * the inn on the green with its hanging sign; this is what is behind that sign — a fire, a plank counter, three
 * tables, a stack of kegs, and a stair to the rooms a party can sleep in later.
 *
 * Local +z is SOUTH (the front wall, where the door is), the same convention the building kit uses outside.
 * Its people and words are src/world/maps/puddlewick_inn.npcs.js (P11); its treasure would be .chests.js (P30).
 */
import * as THREE from 'three';
import { PAL, C3, mixHex } from '../../art/palette.js';
import { makeAOMask } from '../../art/toon.js';
import { reportError } from '../../engine/debug.js';
import { createKit } from '../scenery.js';
import { interiorRecipes, indoorContacts, interiorRig } from '../../art/interior.js';
import { puddlewickDoorstep } from './puddlewick.js';

// Roomy on purpose — see the note in hollybank.js: P09's fade ghosts anything within 2.2 units of the lens, and
// the lens rides two units behind the boy, so a cramped room puts a translucent wall over the whole frame.
const W = 12.6, D = 10.6, H = 2.6;
const HW = W / 2, HD = D / 2;
const T = 0.34;
const DX = 0.6, DW = 1.32, DH = 2.15;

const SPOTS = {
  door: { x: DX, z: 0.9, facing: Math.PI },        // where you arrive: two steps in, facing the room
  counter: { x: -1.8, z: -4.3, rot: 0 },
  keeper: { x: -1.8, z: -3.25, facing: 0 },        // behind the bar, looking at the room
  fire: { x: -6.15, z: 0.2, rot: Math.PI / 2 },    // on the west wall
  tables: [{ x: 3.3, z: -2.3 }, { x: 3.7, z: 1.7 }, { x: -3.4, z: 2.0 }],
  fireside: { x: -4.6, z: 0.2, facing: 270 },
  stair: { x: 5.3, z: -3.6 },
  kegs: { x: -5.4, z: -4.0 },
};

const puddlewickInn = {
  id: 'puddlewick_inn',
  name: 'the Puddlewick inn',
  kind: 'interior',
  size: [14, 12],
  origin: [-7, -6],
  res: 4,
  theme: 'wood',
  music: 'inn',                                  // CANON §9
  hours: 15.6,
  light: { preset: 'interior' },
  weather: 'clear',
  encounters: null,
  spawn: { x: SPOTS.door.x, z: SPOTS.door.z, facing: Math.PI },
  // A room is looked DOWN into, not along (see hollybank.js): 52 degrees clears the wall the lens sits behind, and
  // the wide preset frames the room rather than a close portrait of the boy.
  camera: { mode: 'world', orbit: 0, pitch: 52, dist: 6.2, fov: 52, lookUp: 1.25 },

  tiles: {
    height: () => 0,
    solid(x, z) { return Math.abs(x) > HW - 0.02 || Math.abs(z) > HD - 0.02; },
    ground() { return 'wood'; },
  },

  spots: SPOTS,

  colliders: [
    { type: 'box', x: SPOTS.counter.x, z: SPOTS.counter.z, w: 4.6, d: 0.95, rot: 0, tag: 'counter' },
    { type: 'box', x: SPOTS.fire.x + 0.35, z: SPOTS.fire.z, w: 1.2, d: 2.4, rot: 0, tag: 'hearth' },
    { type: 'circle', x: SPOTS.kegs.x, z: SPOTS.kegs.z, r: 0.75, tag: 'kegs' },
    { type: 'box', x: SPOTS.stair.x, z: SPOTS.stair.z, w: 1.7, d: 2.4, rot: 0, tag: 'stair' },
    ...SPOTS.tables.map(t => ({ type: 'circle', x: t.x, z: t.z, r: 0.78, tag: 'table' })),
  ],

  get exits() {
    const back = puddlewickDoorstep('puddlewick_inn');
    // Same spawn-relative pad as int_common — never cover the arrival spot.
    const z0 = SPOTS.door.z + 0.55, z1 = HD - 0.25;
    return [{ x: DX, z: (z0 + z1) / 2, w: Math.min(W - 0.8, DW + 6.0), h: Math.max(1.4, z1 - z0),
      to: 'puddlewick', tx: back.x, tz: back.z, facing: back.facing,
      kind: 'door', name: 'the inn door', line: 'door-out', back: { x: DX, z: HD - 2.3 } }];
  },

  props: [
    // press Z at the door to leave, as well as walking into it (see int_common.js and shots/P06-hb2)
    { type: 'door', name: 'the inn door', solid: false, x: DX, z: HD - 0.75, ix: DX, iz: HD - 1.9, reach: 2.6, height: DH * 0.9,
      talk({ field }) {
        const b = puddlewickDoorstep('puddlewick_inn');
        const deg = Number.isFinite(+b.facing) ? (+b.facing * 180 / Math.PI) : undefined;
        try { field.teleport('puddlewick', b.x, b.z, deg); } catch (e) { reportError('inn: door out', e); }
        return null;
      } },
    { type: 'counter', name: 'the bar', x: SPOTS.counter.x, z: SPOTS.counter.z + 0.7, line: 'bar', reach: 2.0, height: 1.3 },
    { type: 'hearth', name: 'the fire', x: SPOTS.fire.x + 1.1, z: SPOTS.fire.z, line: 'fire', reach: 1.9, height: 1.6 },
    { type: 'barrel', name: 'the kegs', x: SPOTS.kegs.x + 0.6, z: SPOTS.kegs.z + 0.6, line: 'kegs', reach: 1.7, height: 1.2 },
    { type: 'stairs', name: 'the stair', x: SPOTS.stair.x - 1.0, z: SPOTS.stair.z + 1.0, line: 'stair', reach: 1.9, height: 2.0 },
    { type: 'table', name: 'a table', x: SPOTS.tables[0].x, z: SPOTS.tables[0].z, line: 'table', reach: 1.7, height: 1.0 },
    { type: 'sign', name: 'the price board', x: SPOTS.counter.x + 2.6, z: SPOTS.counter.z + 0.5, line: 'prices', reach: 1.8, height: 1.9 },
  ],

  chests: [
    { id: 'inn_pot', x: -5.4, z: 3.2, kind: 'pot', name: 'a pot by the door', line: 'search-pot', reach: 1.5 },
    { id: 'inn_shelf', x: SPOTS.counter.x + 1.9, z: SPOTS.counter.z + 0.15, kind: 'shelf', name: 'the back shelf', line: 'search-shelf', reach: 1.6 },
  ],

  lines: {
    'door-out': 'Back out onto the green.',
    bar: ['A plank counter worn to a shine\nby elbows.', 'Four tankards stand in a row,\nexactly wrong side up.'],
    fire: ['The fire is banked up high for a\nwarm afternoon, because that is\nwhat an inn is for.',
      'Somebody has toasted something\nand denied it.'],
    kegs: 'Three kegs, stacked the way a\nman stacks kegs when he is\nbeing watched.',
    stair: ['The stair goes up to the rooms.', 'A rope is across it, and the rope\nmeans it more than a door would.'],
    table: ['Two bowls, a spoon and a very\nserious game of something with\nacorns for pieces.',
      'You are almost certain somebody\nis cheating. You are certain it\nis working.'],
    prices: ['{gold}BED AND BREAKFAST{/gold} — 6 G\n{gold}BREAKFAST{/gold} — 2 G\n{gold}BED{/gold} — 5 G',
      'Underneath, in a different hand:\n"Breakfast is the good bit."'],
    'search-pot': ['Bram looks in the pot by the\ndoor.{n}Umbrellas. Four of them. It has\nnot rained in a fortnight.'],
    'search-shelf': ['Bram peers along the back shelf.{n}Bottles, a jar of pickles, and a\nhorseshoe nailed up for luck.',
      'The horseshoe is upside down.\nNobody has the heart.'],
    search: ['Bram searches the common room.{n}Crumbs, and a spoon under a\nbench.',
      'Bram looks under the table.{n}Somebody has hidden an acorn\nhere. This is cheating.'],
  },

  view({ scene, rig }) {
    const t0 = performance.now();
    const safe = (name, fn) => { try { return fn(); } catch (e) { reportError(`inn: ${name}`, e); return null; } };
    // the SHARED interior rig (src/art/interior.js): the 'interior' preset lifted, plus the warm ambient fill
    // makeLightRig has none of, and the warm gloom the room stands in instead of a flat clear colour (gap #3)
    safe('rig', () => interiorRig({ rig, scene, dir: [-0.3, 0.95, 0.22], sun: 1.66, hemi: 1.45, extent: 16, fill: 0.5 }));

    const ao = makeAOMask({ span: 30, size: 512, center: [0, 0] });
    const kit = createKit({ scene, heightAt: () => 0, ao });
    safe('recipes', () => { interiorRecipes(kit); indoorContacts(kit); });
    safe('backdrop', () => kit.roomBackdrop({ W, D, H, floor: PAL.wood.dark }));

    safe('shell', () => kit.roomShell({
      x: 0, z: 0, rot: 0, W, D, H, wall: 'plaster', wallTint: PAL.plaster.mid, floor: 'wood', beams: false, ceiling: false,
      openings: [{ side: 'south', at: DX, w: DW, h: DH, kind: 'door' }],
      windows: [
        { side: 'south', at: -4.0, y: 1.42, w: 1.05, h: 0.9, shutter: PAL.paint.shutterBlue },
        { side: 'south', at: 4.2, y: 1.42, w: 1.05, h: 0.9, shutter: PAL.paint.shutterBlue },
        { side: 'east', at: 1.4, y: 1.42, w: 0.95, h: 0.85, shutter: PAL.paint.shutterBlue },
        { side: 'west', at: -3.2, y: 1.42, w: 0.95, h: 0.85, shutter: PAL.paint.shutterBlue },
      ],
    }));

    // the storey above the wall tops (the inn has bedrooms up there), leaning away so it never covers the floor
    safe('upper', () => kit.roomUpper({ W, D, H, T, sides: ['north', 'east', 'west'], tint: PAL.plaster.mid,
      roof: 'thatch', up: 1.3, out: 0.42, seed: 11 }));
    // and a patch of afternoon on the boards from the west window
    safe('shaft', () => kit.lightShaft(-HW + 0.2, 3.2, Math.PI / 2, { w: 0.95, y: 1.4, len: 3.2 }));

    safe('door', () => {
      const day = mixHex(PAL.sky.horizon, PAL.plaster.light, 0.55);
      kit.addGlow(new THREE.BoxGeometry(DW - 0.06, DH - 0.06, 0.08), new THREE.Matrix4().setPosition(DX, (DH - 0.06) / 2, HD + T * 0.72), day);
      const leaf = new THREE.Matrix4().setPosition(DX + DW / 2, 0, HD + 0.02)
        .multiply(new THREE.Matrix4().makeRotationY(0.66)).multiply(new THREE.Matrix4().setPosition(-DW / 2, DH / 2, 0));
      kit.addTo('wood', new THREE.BoxGeometry(DW, DH, 0.09), leaf, PAL.wood.mid);
    });

    safe('bar', () => {
      kit.counter(SPOTS.counter.x, SPOTS.counter.z, SPOTS.counter.rot, { w: 4.5, d: 0.9, h: 1.04 });
      kit.shelf(SPOTS.counter.x + 1.4, -HD + 0.18, 0, { w: 2.4, y: 1.35, n: 2, seed: 21 });
      kit.shelf(SPOTS.counter.x - 1.6, -HD + 0.18, 0, { w: 1.8, y: 1.35, n: 2, seed: 22 });
      kit.kegs(SPOTS.kegs.x, SPOTS.kegs.z, 0.2, { n: 3, seed: 9 });
    });

    safe('fire', () => kit.hearth(SPOTS.fire.x + 0.45, SPOTS.fire.z, SPOTS.fire.rot, { w: 1.8, h: 1.5, kettle: false }));

    safe('tables', () => {
      const R = [0.15, -0.35, 0.6];
      SPOTS.tables.forEach((t, i) => {
        kit.roomTable(t.x, t.z, R[i], { w: 1.35, d: 0.95, top: 0.76, things: i === 0
          ? [{ kind: 'bowl', x: -0.28, z: 0 }, { kind: 'bowl', x: 0.28, z: 0.1, color: PAL.tile.mid }, { kind: 'cup', x: 0, z: -0.28 }]
          : i === 1 ? [{ kind: 'candle', x: 0, z: 0 }, { kind: 'cup', x: 0.32, z: 0.2 }]
            : [{ kind: 'loaf', x: 0.1, z: 0 }, { kind: 'cup', x: -0.3, z: 0.16 }] });
        for (const [dx, dz] of [[-0.95, 0.1], [0.95, -0.1], [0.05, 0.9]]) kit.stool(t.x + dx, t.z + dz, R[i], {});
      });
    });

    // the stair to the rooms: it goes up, it is roped off, and it promises an upstairs
    safe('stair', () => {
      const x0 = SPOTS.stair.x - 0.9, z1 = SPOTS.stair.z + 1.3, n = 7, rise = 0.28, run = 0.34;
      for (let k = 0; k < n; k++) {
        const z = z1 - (k + 0.5) * run, y = (k + 1) * rise;
        kit.addTo('wood', new THREE.BoxGeometry(1.7, 0.08, run + 0.02), new THREE.Matrix4().setPosition(x0 + 0.85, y - 0.04, z), k % 2 ? PAL.wood.light : PAL.wood.mid);
        kit.addTo('wood', new THREE.BoxGeometry(1.62, rise, 0.06), new THREE.Matrix4().setPosition(x0 + 0.85, y - rise / 2, z - run / 2), PAL.wood.dark);
      }
      kit.addTo('wood', new THREE.BoxGeometry(0.12, 1.1, 0.12), new THREE.Matrix4().setPosition(x0, 0.55, z1 - 0.1), PAL.wood.beam);
      kit.addTo('paint', new THREE.CylinderGeometry(0.03, 0.03, 1.7, 6), new THREE.Matrix4().setPosition(x0 + 0.85, 0.85, z1 - 0.1).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), PAL.cloth.rope);
      kit.contact(SPOTS.stair.x, SPOTS.stair.z, 1.0, 0.5, { rx: 0.9, rz: 1.2 });
    });

    safe('dressing', () => {
      kit.rug(0.2, 1.4, 0, { w: 3.0, d: 1.9, color: PAL.cloth.blue, seed: 6 });
      kit.roomLamp(0.0, -1.0, H - 0.22, {});
      kit.roomLamp(3.6, 1.6, H - 0.22, {});
      const pot = (x, z, r, h, col) => {
        kit.addTo('tile', new THREE.CylinderGeometry(r * 0.86, r * 0.7, h, 14), new THREE.Matrix4().setPosition(x, h / 2, z), col);
        kit.contact(x, z, r * 1.2, 0.55);
      };
      pot(-5.4, 3.2, 0.3, 0.7, PAL.tile.mid);
      for (let k = 0; k < 3; k++) kit.addTo('paint', new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5),
        new THREE.Matrix4().setPosition(-5.4 + (k - 1) * 0.09, 1.0, 3.2).multiply(new THREE.Matrix4().makeRotationZ((k - 1) * 0.1)), PAL.wood.dark);
    });

    kit.flushInterior();

    const buildMs = Math.round(performance.now() - t0);
    return {
      update(t, dt, c) {
        if (rig && rig.preset !== 'interior') { try { rig.apply('interior'); } catch (e) { reportError('inn rig', e); } }
        kit.update(t, dt, c && c.camera, c && c.player);
      },
      state() { return { buildMs, room: { W, D, H }, counts: Object.assign({}, kit.counts) }; },
    };
  },
};

export default puddlewickInn;
