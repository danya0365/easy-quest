/**
 * saltmarrow_mill.js — INSIDE THE TIDE MILL: white, loud, and full of flour.               (P23B base map)
 *
 * WORLD-BIBLE §2 [03] gives Saltmarrow one landmark — "a tide-mill wheel the size of a house, turning, audible
 * from four tiles into the meadow" — and one of its best searchables: "the mill hopper (hides 30 gold under the
 * flour)". A landmark a child can only look at is scenery; this is the room behind its door, so the biggest thing
 * in the village is a place you can go IN. The great gear turns overhead, the stones turn under it, flour hangs in
 * the light from the loft door, and the hopper is exactly where the bible put the money.
 *
 * Local +z is SOUTH (the front wall, where the door is) — the same convention every other interior uses.
 * Its people are src/world/maps/saltmarrow_mill.npcs.js; its treasure saltmarrow_mill.chests.js.
 */
import * as THREE from 'three';
import { PAL, mixHex } from '../../art/palette.js';
import { makeAOMask } from '../../art/toon.js';
import { Sfx } from '../../audio/sfx.js';
import { reportError } from '../../engine/debug.js';
import { createKit } from '../scenery.js';
import { interiorRecipes, indoorContacts, interiorRig, holdInteriorRig } from '../../art/interior.js';
import { saltmarrowDoorstep } from './saltmarrow.js';

const W = 12.6, D = 10.6, H = 3.1;
const HW = W / 2, HD = D / 2;
const DX = 0, DW = 1.28, DH = 2.12;

const SPOTS = {
  door: { x: DX, z: HD - 4.4, facing: Math.PI },
  stones: { x: -2.6, z: -2.2 },
  gear: { x: -2.6, z: -4.2 },
  hopper: { x: 0.9, z: -3.6 },
  sacks: { x: 3.6, z: -3.4 },
  bench: { x: 4.8, z: 0.6 },
  ladder: { x: 5.4, z: -4.2 },
  hay: { x: -5.0, z: 2.6 },
  ozzy: { x: 2.0, z: -0.6, facing: Math.PI * 1.2 },
  miller: { x: -1.0, z: -1.0, facing: Math.PI * 0.85 },
};

const mill = {
  id: 'saltmarrow_mill',
  name: 'the tide mill',
  kind: 'interior',
  size: [14, 12],
  origin: [-7, -6],
  res: 4,
  theme: 'wood',
  music: 'village',                                 // CANON §9 — a working room, not an inn and not a church
  hours: 12,
  light: { preset: 'interior' },
  weather: 'clear',
  encounters: null,
  spawn: { x: SPOTS.door.x, z: SPOTS.door.z, facing: Math.PI },
  camera: { mode: 'world', orbit: 0, pitch: 52, dist: 7.8, fov: 54, lookUp: 1.2 },

  tiles: {
    height: () => 0,
    solid(x, z) { return Math.abs(x) > HW - 0.02 || Math.abs(z) > HD - 0.02; },
    ground() { return 'wood'; },
  },

  spots: SPOTS,

  colliders: [
    { type: 'circle', x: SPOTS.stones.x, z: SPOTS.stones.z, r: 1.15, tag: 'millstones' },
    { type: 'box', x: SPOTS.gear.x, z: SPOTS.gear.z, w: 2.2, d: 0.6, rot: 0, tag: 'gear' },
    { type: 'box', x: SPOTS.hopper.x, z: SPOTS.hopper.z, w: 1.3, d: 1.3, rot: 0, tag: 'hopper' },
    { type: 'box', x: SPOTS.sacks.x, z: SPOTS.sacks.z, w: 1.7, d: 1.3, rot: 0, tag: 'sacks' },
    { type: 'box', x: SPOTS.bench.x, z: SPOTS.bench.z, w: 0.9, d: 2.2, rot: 0, tag: 'bench' },
    { type: 'box', x: SPOTS.hay.x, z: SPOTS.hay.z, w: 2.3, d: 1.7, rot: 0, tag: 'hay' },
  ],

  get exits() {
    const back = saltmarrowDoorstep('saltmarrow_mill');
    return [{ x: DX, z: HD - 0.5, w: DW + 0.24, h: 0.9, to: 'saltmarrow', tx: back.x, tz: back.z, kind: 'door',
      name: 'the mill door', line: 'door-out', back: { x: DX, z: HD - 2.2 } }];
  },

  props: [
    { type: 'millstones', name: 'the millstones', x: SPOTS.stones.x, z: SPOTS.stones.z + 1.3, line: 'stones', reach: 2.0, height: 1.0 },
    { type: 'gear', name: 'the great gear', x: SPOTS.gear.x, z: SPOTS.gear.z + 0.9, line: 'gear', reach: 2.0, height: 2.4 },
    { type: 'hopper', name: 'the hopper', x: SPOTS.hopper.x, z: SPOTS.hopper.z + 1.0, line: 'hopper', reach: 1.9, height: 1.8 },
    { type: 'sacks', name: 'the flour sacks', x: SPOTS.sacks.x, z: SPOTS.sacks.z + 1.0, line: 'sacks', reach: 1.8, height: 1.0 },
    { type: 'ladder', name: 'the loft ladder', x: SPOTS.ladder.x - 0.8, z: SPOTS.ladder.z + 0.6, line: 'ladder', reach: 1.9, height: 2.4 },
    { type: 'window', name: 'the loading door', x: 5.9, z: -1.2, line: 'loading', reach: 1.9, height: 2.2 },
  ],

  lines: {
    'door-out': 'Out onto the quay, where it is\nquieter and smells of fish.',
    stones: ['Two stones the size of cart\nwheels, the top one turning,\nand a white dust over everything.',
      'The noise is not a bang. It is\na long patient grinding, like\nthe sea chewing.'],
    gear: ['A wooden gear as tall as a man,\nwith wooden teeth, driven by the\nwheel outside.',
      'One tooth is new and paler than\nthe others. Somebody has looked\nafter this.'],
    hopper: ['A wooden funnel over the stones,\nheaped with grain that trickles\ndown on its own.',
      'The flour under it is very deep\nand very soft.'],
    sacks: ['Eleven sacks, stamped with a\nherring, stacked by somebody who\nenjoys stacking.'],
    ladder: ['Up to the loft, where the grain\nis. The rungs are white with\nflour and so are you now.'],
    loading: ['The loading door, open on the\ncreek, with a rope and a hook\nswinging in it.',
      'You could drop a sack straight\ninto a boat from here. Somebody\nregularly does.'],
    search: ['%HERO% pokes about in the flour.{n}Flour. More flour. A very\nsurprised beetle.',
      '%HERO% looks behind the sacks.{n}A slate with somebody’s sums on\nit, all of them crossed out.'],
  },

  view({ scene, rig }) {
    const t0 = performance.now();
    const safe = (name, fn) => { try { return fn(); } catch (e) { reportError(`saltmarrow_mill: ${name}`, e); return null; } };

    safe('rig', () => interiorRig({ rig, scene, dir: [0.2, 0.95, 0.3], sun: 1.25, hemi: 1.1, extent: Math.max(W, D) + 6, surround: 0.5 }));

    const ao = makeAOMask({ span: Math.max(W, D) + 18, size: 512, center: [0, 0] });
    const kit = createKit({ scene, heightAt: () => 0, ao });
    safe('recipes', () => { interiorRecipes(kit); indoorContacts(kit); });

    safe('shell', () => kit.roomShell({
      x: 0, z: 0, rot: 0, W, D, H,
      wall: 'stone', wallTint: mixHex(PAL.plaster.light, PAL.stone.light, 0.45), floor: 'wood', beams: false, ceiling: false,
      openings: [{ side: 'south', at: DX, w: DW, h: DH, kind: 'door' }],
      windows: [
        { side: 'south', at: -4.2, y: 1.6, w: 1.0, h: 0.9, shutter: PAL.paint.shutterBlue, shaft: true, len: 3.6 },
        { side: 'south', at: 4.2, y: 1.6, w: 1.0, h: 0.9, shutter: PAL.paint.shutterBlue },
        { side: 'west', at: -1.0, y: 1.7, w: 0.95, h: 0.85, shutter: PAL.paint.shutterBlue, shaft: true, len: 3.2 },
        { side: 'north', at: 2.2, y: 1.8, w: 0.9, h: 0.8, shutter: PAL.paint.shutterBlue },
        // the loading door over the creek: a big opening, shuttered back, with the daylight coming through it
        { side: 'east', at: -1.2, y: 1.5, w: 1.5, h: 1.6, shutter: PAL.wood.mid, shaft: true, len: 3.8 },
      ],
    }));
    safe('door', () => kit.roomDoorway(DX, HD, 0, { w: DW, h: DH, swing: 0.72, color: PAL.wood.mid }));

    // the machine: the great gear, the stones, the hopper over them
    safe('machine', () => {
      kit.millGear(SPOTS.gear.x, SPOTS.gear.z, 0, { r: 1.05, teeth: 20, speed: 0.4, y: 1.5 });
      kit.millstones(SPOTS.stones.x, SPOTS.stones.z, { r: 1.0, y: 0, turn: true });
      // the hopper: a wooden funnel on four legs, with grain in it
      const hx = SPOTS.hopper.x, hz = SPOTS.hopper.z;
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        kit.addTo('wood', new THREE.BoxGeometry(0.11, 1.25, 0.11), new THREE.Matrix4().setPosition(hx + sx * 0.52, 0.62, hz + sz * 0.52), PAL.wood.beam);
      }
      kit.addTo('wood', new THREE.CylinderGeometry(0.72, 0.26, 0.85, 4, 1, true), new THREE.Matrix4().setPosition(hx, 1.66, hz).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4)), PAL.wood.mid);
      kit.addTo('paint', new THREE.CylinderGeometry(0.62, 0.62, 0.1, 12), new THREE.Matrix4().setPosition(hx, 1.92, hz), PAL.thatch.light);
      kit.addTo('wood', new THREE.BoxGeometry(0.16, 0.16, 2.0), new THREE.Matrix4().setPosition(hx, 2.05, hz), PAL.wood.beam);
      kit.contact(hx, hz, 1.0, 0.6);
      // the flour on the floor under it
      kit.floorPatch(hx, hz + 0.7, { rx: 0.9, rz: 0.7, color: PAL.plaster.light, lift: 0.02, seed: 4 });
      kit.floorPatch(SPOTS.stones.x, SPOTS.stones.z + 1.0, { rx: 1.0, rz: 0.8, color: PAL.plaster.light, lift: 0.02, seed: 7 });
      kit.floorPatch(-4.0, 0.6, { rx: 0.6, rz: 0.5, color: PAL.plaster.light, lift: 0.02, seed: 9 });
    });

    safe('dressing', () => {
      kit.sackPile(SPOTS.sacks.x, SPOTS.sacks.z, 0.2, { n: 4, seed: 11 });
      kit.sackPile(SPOTS.sacks.x - 0.1, SPOTS.sacks.z + 1.0, -0.4, { n: 3, seed: 13, s: 1.0 });
      kit.hayPile(SPOTS.hay.x, SPOTS.hay.z, 0.3, { w: 2.2, d: 1.6, h: 0.9, seed: 31, fork: true });
      kit.workbench(SPOTS.bench.x, SPOTS.bench.z, -Math.PI / 2, { w: 2.1, d: 0.7, rack: true, seed: 5 });
      kit.toolRack(HW - 0.3, 2.8, -Math.PI / 2, { w: 2.4, h: 2.0, seed: 9 });
      kit.ladder(SPOTS.ladder.x, SPOTS.ladder.z, 0.1, { h: 2.6, lean: 0.2 });
      kit.crateStack(-5.4, -4.0, 0.3, { n: 3, seed: 7 });
      kit.roomBarrel(-5.6, -1.6, 0, { s: 1.05 });
      kit.roomBarrel(-4.7, -0.9, 0.4, { s: 0.92 });
      kit.potGroup(4.9, 3.1, { n: 3, seed: 5 });
      kit.wallSconce(-HW + 0.2, -1.0, Math.PI / 2, { y: 1.9, lantern: true });
      kit.roomLamp(0.4, 0.4, H - 0.3, {});
      kit.strawScatter(-3.4, 2.0, { n: 16, r: 1.0, seed: 5 });
      kit.dustMotes(0.6, -1.6, { n: 26, w: 3.4, h: 2.2, d: 3.0, y: 1.1 });
      kit.dustMotes(-4.2, -1.0, { n: 18, w: 2.0, h: 2.0, d: 2.0, y: 1.2 });
      kit.wallPicture(HW - 0.22, 1.2, -Math.PI / 2, { y: 1.7, w: 0.5, h: 0.4, color: PAL.cloth.blue });
      kit.sleepingCat(-4.4, 2.0, 0.6, { tint: 'ginger', s: 1.2 });
    });

    safe('flush', () => kit.flushInterior());

    const buildMs = Math.round(performance.now() - t0);
    return {
      update(t, dt, c) {
        holdInteriorRig(rig, 'saltmarrow_mill');
        kit.update(t, dt, c && c.camera, c && c.player);
      },
      state() { return { buildMs, room: { W, D, H }, counts: Object.assign({}, kit.counts) }; },
    };
  },

  onEnter() { try { Sfx.play('door_open', { vol: 0.3 }); } catch (_) { /* the door you just came through */ } },
};

export default mill;
