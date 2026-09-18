/**
 * int_twins.js — DOT AND BEL'S HOUSE, inside.                                (P06 interior; art src/art/interior.js)
 *
 * The twins of seven who play a chasing game with rules they invent live (WORLD-BIBLE §3) are out on the green.
 * This is where they sleep: two small beds pushed together, a toy box, a chalked rule on the floorboards, and
 * their mother, sewing, who would very much like to know where they are. `puddlewick_twins`'s door opens here.
 */
import { interiorMap, WALLS } from './int_common.js';
import { PAL, mixHex } from '../../art/palette.js';

const SPOTS = {
  hearth: { x: -3.6, z: -3.9 },
  hearthside: { x: -3.6, z: -2.5, facing: 180 },
  table: { x: -2.6, z: -0.6 },
  beds: { x: 3.4, z: -2.6 },
  toybox: { x: 4.3, z: 0.2 },
  wardrobe: { x: 5.5, z: -4.2 },
  dresser: { x: -5.6, z: -0.4 },
  mother: { x: -1.2, z: 1.6, facing: 60 },
  cat: { x: -2.4, z: -2.6 },
};

export default interiorMap({
  id: 'int_twins',
  name: "Dot and Bel's house",
  plot: 'puddlewick_twins',
  doorName: 'the front door',
  W: 12.6, D: 10.6,
  doorX: 0.8,
  music: 'village',
  wallTint: WALLS.sage,
  doorColor: PAL.paint.shutterBlue,
  seed: 19,
  spots: SPOTS,
  windows: [
    { side: 'south', at: -3.4, y: 1.38, w: 1.0, h: 0.9, shutter: PAL.paint.shutterBlue, shaft: true, len: 3.4 },
    { side: 'south', at: 4.2, y: 1.38, w: 1.0, h: 0.9, shutter: PAL.paint.shutterBlue },
    { side: 'east', at: 0.6, y: 1.4, w: 0.9, h: 0.85, shutter: PAL.paint.shutterBlue },
  ],
  outLine: 'Out onto the green, where the\nrules are different.',

  colliders: [
    { type: 'box', x: SPOTS.hearth.x, z: SPOTS.hearth.z + 0.2, w: 2.8, d: 1.3, rot: 0, tag: 'hearth' },
    { type: 'box', x: SPOTS.table.x, z: SPOTS.table.z, w: 1.9, d: 1.1, rot: 0, tag: 'table' },
    { type: 'box', x: SPOTS.beds.x - 0.6, z: SPOTS.beds.z, w: 1.2, d: 2.1, rot: 0, tag: 'bed' },
    { type: 'box', x: SPOTS.beds.x + 0.8, z: SPOTS.beds.z, w: 1.2, d: 2.1, rot: 0, tag: 'bed' },
    { type: 'box', x: SPOTS.wardrobe.x, z: SPOTS.wardrobe.z, w: 0.6, d: 1.2, rot: 0, tag: 'wardrobe' },
    { type: 'box', x: SPOTS.dresser.x, z: SPOTS.dresser.z, w: 0.55, d: 1.6, rot: 0, tag: 'dresser' },
    { type: 'circle', x: SPOTS.toybox.x, z: SPOTS.toybox.z, r: 0.5, tag: 'toybox' },
  ],

  props: [
    { type: 'hearth', name: 'the hearth', x: SPOTS.hearth.x, z: SPOTS.hearth.z + 0.9, line: 'hearth', reach: 1.9, height: 1.6 },
    { type: 'bed', name: 'the two beds', x: SPOTS.beds.x - 1.4, z: SPOTS.beds.z, line: 'beds', reach: 1.8, height: 1.0 },
    { type: 'wardrobe', name: 'the wardrobe', x: SPOTS.wardrobe.x - 0.7, z: SPOTS.wardrobe.z, line: 'wardrobe', reach: 1.7, height: 1.9 },
    { type: 'sign', name: 'the chalk on the floor', x: 1.2, z: 2.4, line: 'chalk', reach: 1.8, height: 0.5 },
  ],

  lines: {
    hearth: ['The fire is low and there is a\nkettle on it, because there is\nalways a kettle on it.',
      'Two small pairs of boots are\ndrying in front of it, both\nsoaked.'],
    beds: ['Two small beds pushed right up\ntogether, which is against the\nrules and always has been.',
      'One has a blue blanket and one\nhas a red one and they have been\nswapped at least once.'],
    toybox: ['A box with a lid that does not\nshut because of what is in it.',
      'A wooden horse, a hoop, forty\nsmooth stones and a very good\nstick.'],
    wardrobe: ['The wardrobe smells of cedar and\nsomebody has been hiding in it\nrecently.',
      'There is a chalk mark inside the\ndoor: "SAFE HERE".{p}It has been crossed out and\nwritten again three times.'],
    chalk: ['Rules, chalked on the boards in\ntwo different hands:',
      '"1. THE WELL IS SAFE.\n2. THE WELL IS NOT SAFE.\n3. YOU ARE IT.\n4. NO YOU ARE."',
      'Rule 4 has been added in a\nthird, much neater hand, which\nis their mother\'s.'],
  },

  decorate(kit, R) {
    const H = R.H, HW = R.HW, HD = R.HD;

    kit.hearth(SPOTS.hearth.x, SPOTS.hearth.z, 0, { w: 1.8, h: 1.45, kettle: true });
    kit.roomTable(SPOTS.table.x, SPOTS.table.z, 0.08, { w: 1.9, d: 1.05, top: 0.76,
      things: [{ kind: 'bowl', x: -0.4, z: 0 }, { kind: 'bowl', x: 0.35, z: 0.06, color: PAL.tile.mid }, { kind: 'candle', x: 0, z: -0.3 }] });
    kit.chair(SPOTS.table.x - 1.35, SPOTS.table.z + 0.2, Math.PI / 2, {});
    kit.chair(SPOTS.table.x + 1.35, SPOTS.table.z - 0.1, -Math.PI / 2, {});
    kit.stool(SPOTS.table.x + 0.1, SPOTS.table.z + 1.0, 0.2, {});

    // the two beds, pushed together, one blue blanket and one red
    kit.bed(SPOTS.beds.x - 0.6, SPOTS.beds.z, 0, { w: 0.9, l: 1.8, small: true, blanket: PAL.cloth.blue });
    kit.bed(SPOTS.beds.x + 0.8, SPOTS.beds.z, 0, { w: 0.9, l: 1.8, small: true, blanket: PAL.cloth.red });
    kit.wardrobe(SPOTS.wardrobe.x, SPOTS.wardrobe.z, -Math.PI / 2, { w: 1.2, h: 1.95, d: 0.55 });
    kit.dresser(SPOTS.dresser.x, SPOTS.dresser.z, Math.PI / 2, { w: 1.5, h: 1.85 });

    // The toy box is NOT drawn here: src/world/maps/int_twins.chests.js declares it as a real chest, and P30's
    // treasure.js gives it a body, iron straps, a lid on a hinge and an opening ceremony. Drawing one as well put
    // two chests a metre apart in a child's bedroom (measured, shots/P06-final/06-twins).
    kit.potGroup(3.0, 3.2, { n: 3, seed: 23, spread: 0.4 });
    kit.roomBarrel(-5.8, 3.6, 0.2, { s: 0.95 });

    kit.rug(0.4, 1.4, 0.05, { w: 3.0, d: 1.9, color: PAL.cloth.mustard, seed: 21 });
    kit.wallPicture(-HW + 0.24, -2.4, Math.PI / 2, { y: 1.62, w: 0.54, h: 0.42, color: mixHex(PAL.cloth.cream, PAL.flower.pink, 0.2) });
    kit.hangingHerbs(-1.2, -1.9, H - 0.32, { n: 2, seed: 27, spread: 0.32 });
    kit.roomLamp(SPOTS.table.x + 0.6, SPOTS.table.z + 0.3, H - 0.26, {});
    kit.wallSconce(HW - 0.22, -0.6, -Math.PI / 2, { y: 1.62 });

    kit.dustMotes(-3.2, HD - 2.2, { n: 18, w: 1.5, h: 1.4, d: 1.7, y: 0.45 });
  },
});
