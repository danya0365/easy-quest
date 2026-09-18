/**
 * hollybank.chests.js — Bram's own house: the chest at the foot of his bed, and the places a boy hides things.
 *                                                              (P30 discovery; layer of hollybank.js)
 *
 * Registered by src/world/treasure.js. hollybank.js (P23) already places the five containers CANON §5 B1 asks a
 * six-year-old to search; this layer says what they HOLD (`rewards`), gives the chest at the foot of the bed a lid
 * that really opens over the one the room draws (`ax/az/y` pin the art to the room's own chest spot), and adds the
 * two things the room never told anybody about: the gap behind the shelf, and the loose board under the bed.
 */

/** Props hollybank.js already builds, made searchable where they stand. */
export const searches = [
  { id: 'hb_dresser', name: 'the dresser', kind: 'drawer' },
  { id: 'hb_shelf', name: 'the shelf', kind: 'bookshelf', item: 'lucky_acorn',
    found: ['Behind the books the boards\ndo not quite meet.{wait:300}{n}There is a gap, and in the gap\nthere is an acorn.',
      'He has kept it since he was four.\nHe had forgotten. It has not.'] },
];

/** What the room's own five containers hold. The base map file never has to change. */
export const rewards = {
  // the chest at the foot of the bed: the room draws a shut box at SPOTS.chest, so the opening one goes exactly there
  hollybank_sword: { ax: 4.15, az: -1.5, y: 1.15, rot: 0, size: { w: 0.99, h: 0.7, d: 0.74 } },
  hollybank_crock: { item: 'nutcake', found: 'Oatcakes, and one of them has\nbeen wrapped for a journey.' },
};

export default {
  chests: [
    { id: 'hb_floorboard', x: 3.0, z: -4.3, kind: 'hidden', gold: 7, name: 'a loose board', line: 't-board', reach: 1.7 },
  ],

  lines: {
    't-board': ['The third board under the bed\nhas never been nailed down.{wait:350}{n}Under it: a tobacco tin.',
      'Seven coins, a blue marble and\na tooth. His own tooth.'],
  },
};
