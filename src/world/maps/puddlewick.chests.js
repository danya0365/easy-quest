/**
 * puddlewick.chests.js — the home village's TREASURE layer.            (P30 discovery; layer of puddlewick.js)
 *
 * Registered by src/world/treasure.js (maps/index.js, P23's file, does not list a chests layer for this map yet).
 *   default export {chests, lines}   things that are NEW in the village
 *   export searches                  search behaviour bolted onto props puddlewick.js already draws (the well, the
 *                                    rain barrels, the pot at the dead end, the pies) — no second interactable on
 *                                    the same spot, so the prompt never picks the wrong one.
 *   export rewards                   what the village's OWN five containers hold (puddlewick.js line 892 puts a
 *                                    crate behind the shop, a crate and a barrel at the mill, the flour sacks and
 *                                    the hay by the barn; this file only says what is in them, so P23's file and
 *                                    P11's words both stay exactly as they are).
 *
 * WORLD-BIBLE §5 says the pot at the dead end is always worth a look. It is: that is where the Rusty Key lives,
 * and the Rusty Key opens the locked chest behind the barn and the locked one out in the vale.
 */

/** Props the village already stands in the street, made searchable where they stand. */
export const searches = [
  { id: 'pw_well', name: 'the well', kind: 'well', gold: 8,
    found: 'Somebody wished on these and\nthen rather wanted them back.' },
  { id: 'pw_deadend_pot', name: 'a pot at the dead end', kind: 'pot', item: 'rusty_key',
    found: 'In the bottom of the pot, under\nthe leaves, on a loop of string.' },
  { id: 'pw_green_pot', name: 'a pot on the green', kind: 'pot' },
  { id: 'pw_barrel_inn', type: 'barrel', at: [12.3, -2.2], kind: 'barrel' },
  { id: 'pw_barrel_cottage', type: 'barrel', at: [-9.6, -4.8], kind: 'barrel' },
  { id: 'pw_pies', name: 'the pies', kind: 'pan' },
];

/** What the village's own five containers hold. One in five: the hay, and the barrel at the mill. */
export const rewards = {
  pw_hay: { item: 'herb', found: 'Wrapped in a cloth, put there by\nsomebody who meant to come\nback for it.' },
  pw_barrel_mill: { gold: 14, found: 'Coins in the bottom of the water,\nlooking up at him.' },
};

export default {
  chests: [
    // ── two real chests ────────────────────────────────────────────────────────────────────────────────────
    { id: 'pw_chapel_chest', x: 9.5, z: -21.0, kind: 'chest', item: 'antidote_drop',
      name: 'a chest on the shrine path', line: 't-chapel' },
    { id: 'pw_barn_chest', x: -19.0, z: 5.0, kind: 'chest', locked: 'rusty_key', item: 'leather_cap',
      name: 'a locked chest behind the barn', line: 't-barn-chest' },

    // ── the secrets: behind the mill wheel, and a flagstone at the shrine ──────────────────────────────────
    { id: 'pw_mill_stone', x: -19.6, z: -10.9, kind: 'hidden', item: 'strong_herb',
      name: 'behind the mill wheel', line: 't-mill', reach: 1.8 },
    { id: 'pw_flagstone', x: 19.4, z: -22.4, kind: 'hidden', gold: 30,
      name: 'a loose flagstone', line: 't-flagstone', reach: 1.8 },

    // ── three more things to rummage in, where the village left a container and no words ───────────────────
    { id: 'pw_crate_shop2', x: 18.3, z: 7.2, kind: 'crate', name: 'the other crate', line: 't-crate-2' },
    { id: 'pw_hay_b', x: -18.4, z: 2.6, kind: 'hay', name: 'the second bale', line: 't-hay-2', reach: 1.8 },
    { id: 'pw_woodpile', x: -16.8, z: -4.6, kind: 'log', name: 'the woodpile', line: 't-woodpile', reach: 1.9 },
  ],

  lines: {
    't-chapel': 'It stands on the path to the\nshrine, and the deacon has never\nonce opened it.',
    't-barn-chest': 'It has stood in the long grass\nbehind the barn since before\nBram was born.',
    't-mill': ['The millrace runs behind the\nwheel, and behind the race\nthere is a dry gap.',
      'Somebody keeps their medicine\nwhere the water is loudest.'],
    't-flagstone': ['One flagstone by the stones\nrocks when he stands on it.{wait:350}{n}It comes up in his hands.',
      'A purse, and a note.\nThe note says: FOR LATER.'],
    't-crate-2': 'Straw, and a great deal of\nnothing wrapped up in it.',
    't-hay-2': 'Bram searches the second bale.{p}A hen has beaten him to it,\nand left the evidence.',
    't-woodpile': ['Logs, split and stacked, and one\nof them is a wasp’s house.',
      'Bram puts that one back very\ncarefully indeed.'],
  },
};
