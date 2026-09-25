/**
 * contented_herring.js — THE CONTENTED HERRING: Dodd Pye's inn in Saltmarrow.            (P23 / P06 night)
 * CANON: first inn bed; parrot; Willow/Sera beats use this place. Shell via int_common; dressing minimal.
 */
import { interiorMap } from './int_common.js';
import { saltmarrowDoorstep } from './saltmarrow.js';
import { reportError } from '../../engine/debug.js';

const SPOTS = {
  bar: { x: -3.2, z: -1.0 },
  hearth: { x: 3.4, z: -2.2 },
  table: { x: 0.2, z: 1.4 },
  parrot: { x: -4.5, z: 2.0 },
};

export default interiorMap({
  id: 'contented_herring',
  name: 'the Contented Herring',
  plot: 'contented_herring',
  doorName: 'the inn door',
  W: 13.0, D: 11.0, doorX: 0.2,
  music: 'inn',
  hours: 19,
  doorstep: () => saltmarrowDoorstep('contented_herring'),
  exitTo: 'saltmarrow',
  outLine: 'Back to the quay, and the smell\nof the tide.',
  windows: [
    { wall: 'east', at: -1.0 },
    { wall: 'west', at: 1.2 },
    { wall: 'north', at: 0.0 },
  ],
  spots: SPOTS,
  props: [
    { type: 'bar', name: 'the bar', x: SPOTS.bar.x, z: SPOTS.bar.z, line: 'bar', reach: 2.0, height: 1.2 },
    { type: 'hearth', name: 'the hearth', x: SPOTS.hearth.x, z: SPOTS.hearth.z, line: 'hearth', reach: 2.2, height: 1.6 },
    { type: 'table', name: 'a parlour table', x: SPOTS.table.x, z: SPOTS.table.z, line: 'table', reach: 1.8, height: 1.0 },
    { type: 'perch', name: 'the parrot\'s perch', x: SPOTS.parrot.x, z: SPOTS.parrot.z, line: 'parrot', reach: 1.8, height: 1.8 },
  ],
  colliders: [
    { type: 'box', x: SPOTS.bar.x, z: SPOTS.bar.z, w: 3.2, d: 0.9, rot: 0, tag: 'bar' },
    { type: 'circle', x: SPOTS.hearth.x, z: SPOTS.hearth.z, r: 0.85, tag: 'hearth' },
    { type: 'circle', x: SPOTS.table.x, z: SPOTS.table.z, r: 0.75, tag: 'table' },
    { type: 'circle', x: SPOTS.parrot.x, z: SPOTS.parrot.z, r: 0.35, tag: 'perch' },
  ],
  lines: {
    bar: ['The bar smells of salt and\nsoap. Both are intentional.'],
    hearth: ['A small fire, kept for guests\nwho swear they are not cold.'],
    table: ['A parlour table with a ring of\nwet from somebody\'s mug.'],
    parrot: ['The perch is empty. The parrot\nis elsewhere, being content.'],
    search: ['%HERO% looks round the common\nroom.{n}Twelve gold a bed, and the beds\nare upstairs.'],
    'door-out': 'Back to the quay, and the smell\nof the tide.',
  },
  decorate(kit) {
    const safe = (name, fn) => { try { return fn(); } catch (e) { reportError(`contented_herring: ${name}`, e); return null; } };
    safe('bar', () => kit.bar && kit.bar(SPOTS.bar.x, SPOTS.bar.z, 0, { w: 3.2 }));
    safe('hearth', () => kit.hearth && kit.hearth(SPOTS.hearth.x, SPOTS.hearth.z, 0));
    safe('table', () => kit.table && kit.table(SPOTS.table.x, SPOTS.table.z, 0.2, { w: 1.6 }));
    safe('stool', () => {
      if (!kit.stool) return;
      kit.stool(-2.0, 0.2, 0); kit.stool(-1.0, 0.6, 0.3); kit.stool(1.2, 1.8, -0.2);
    });
    safe('lantern', () => kit.lantern && kit.lantern(0, -0.5, 0, { h: 2.4, hanging: true }));
  },
});
