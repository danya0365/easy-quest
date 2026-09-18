/**
 * meadow.chests.js — Puddlewick Vale's TREASURE layer: chests, secrets and everything a boy can rummage in.
 *                                                                               (P30 discovery; layer of meadow.js)
 *
 * Merged into src/world/maps/meadow.js at load by src/world/map.js (see its header, "Files and layers"):
 *   chests: [{id, x, z, kind?: 'chest'|'pot'|'barrel'|'crate'|'hay'|'well'|'hidden', item?, gold?, locked?, mimic?,
 *             line? | text?, found?, reach?}]
 *   lines:  {key: text | pages[]}            the words for everything above
 *   export searches                          search behaviour bolted onto props meadow.js ALREADY draws
 *
 * THIS FILE IS ALSO THE IGNITION. src/world/maps/index.js (P23's file) only lists a `chests` layer for the meadow,
 * so importing this one boots src/world/treasure.js, which registers the other maps' treasure layers and installs
 * the opening ceremony into the field. That is why the whole of P30 is live in /index.html with no shared-file edit.
 */
import { Treasure } from '../treasure.js';

/** Props meadow.js already stands in the grass — the rain barrel by the cottage — made searchable in place. */
export const searches = [
  { id: 'm_rain_barrel', name: 'rain barrel', kind: 'barrel', gold: 6,
    found: 'Under the boot, of all places,\nsix coins gone green.' },
];

Treasure.boot({ searches: { meadow: searches } });

export default {
  chests: [
    // ── chests you can see across the grass, with a lid that really opens ───────────────────────────────────
    { id: 'meadow_lane_chest', x: 2.8, z: 16.6, kind: 'chest', item: 'herb', name: 'a chest on the lane', line: 't-lane' },
    { id: 'meadow_orchard_chest', x: 16.2, z: 18.9, kind: 'chest', item: 'straw_hat', name: 'a chest in the orchard', line: 't-orchard' },
    { id: 'meadow_hay_chest', x: 22.9, z: 22.2, kind: 'chest', gold: 24, name: 'a chest behind the hay', line: 't-hay-chest' },
    { id: 'meadow_locked_chest', x: 21.2, z: 25.4, kind: 'chest', locked: 'rusty_key', item: 'cypress_stick',
      name: 'a locked chest', line: 't-locked' },
    // the Chestnut (MONSTER-BIBLE): a chest, until it is not. It sits in the dark corner of the north wood.
    { id: 'meadow_mimic', x: -18.2, z: -23.6, kind: 'chest', mimic: true, name: 'a chest among the stumps', line: 't-mimic' },

    // ── secrets: nothing marks them, they are simply there if you search the right thing ────────────────────
    { id: 'meadow_log_seed', x: -19.9, z: -20.2, kind: 'hidden', item: 'seed_of_life', name: 'the fallen oak', line: 't-log', reach: 1.7 },
    { id: 'meadow_bridge_stone', x: -4.6, z: -10.4, kind: 'hidden', gold: 18, name: 'under the footbridge', line: 't-bridge', reach: 1.7 },

    // ── things to rummage in ────────────────────────────────────────────────────────────────────────────────
    { id: 'm_barrel_b', x: -9.4, z: -3.3, kind: 'barrel', name: 'the other rain barrel', line: 't-barrel-b' },
    { id: 'm_well', x: -14.4, z: 8.7, kind: 'well', name: 'the field well', line: 't-well', reach: 1.9 },
    { id: 'm_hay_a', x: -27.4, z: 16.2, kind: 'hay', name: 'a hay bale', line: 't-hay-a', reach: 1.9 },
    { id: 'm_hay_b', x: -20.4, z: 8.9, kind: 'hay', item: 'herb', name: 'a hay bale', line: 't-hay-b', reach: 1.9,
      found: 'Under the third bale, dry as\na biscuit and twice as green.' },
    { id: 'm_scarecrow', x: -8.1, z: 15.6, kind: 'scarecrow', name: 'the scarecrow', line: 't-scarecrow', reach: 1.7 },
    { id: 'm_crate_a', x: 17.4, z: 17.6, kind: 'crate', name: 'an apple crate', line: 't-crate-a' },
    { id: 'm_crate_b', x: 18.5, z: 18.7, kind: 'crate', gold: 9, name: 'an apple crate', line: 't-crate-b',
      found: 'Under the apples, in a cloth,\nsomebody’s entire savings.' },
    { id: 'm_stump', x: -20.5, z: -22.8, kind: 'stump', name: 'a hollow stump', line: 't-stump', reach: 1.7 },
    { id: 'm_barrel_out', x: 6.0, z: 30.0, kind: 'barrel', name: 'a barrel on the south lane', line: 't-barrel-out' },
    { id: 'm_barrel_far', x: -18.4, z: -15.5, kind: 'barrel', name: 'a barrel by the track', line: 't-barrel-far' },
    { id: 'm_hay_out', x: 14.4, z: 22.8, kind: 'hay', name: 'a hay bale', line: 't-hay-out', reach: 1.9 },
  ],

  lines: {
    't-lane': 'Somebody left it on the lane,\nwhich is a very trusting place\nto leave a box.',
    't-orchard': 'It was under the apple crates,\nand it has been under the apple\ncrates a good while.',
    't-hay-chest': 'Behind the hay, where a boy\nwould look and a farmer\nwould not.',
    't-locked': 'The lock is older than the stile\nit is hiding behind.',
    't-mimic': 'A chest, out here, among the\nstumps. Nobody carried it here.',
    't-log': ['The fallen oak is hollow.{wait:350}{n}Inside, wrapped in a rag,\nsomebody has hidden a seed.'],
    't-bridge': ['One stone under the footbridge\nsits proud of the others.{wait:300}{n}It lifts.',
      'A purse. Wet through, and\nstill counting.'],
    't-barrel-b': 'Rainwater, and the other boot.\nThey are not a pair.',
    't-well': ['Bram shouts into the well.{n}The well shouts back, eventually.', 'He tries a rude word.{n}The well is scrupulously fair\nabout it.'],
    't-hay-a': ['Bram searches the hay, the way\nyou are meant to.{p}Hay. A great deal of hay.'],
    't-hay-b': 'Nothing left in this one but the\nsmell of last summer.',
    't-scarecrow': ['Bram goes through the\nscarecrow’s pockets.{p}Straw. It is always straw.'],
    't-crate-a': 'Apples. All of them bruised in\nexactly the same place.',
    't-crate-b': 'Apples, and the ones at the\nbottom have opinions.',
    't-stump': ['The stump is full of beetles\nholding a meeting.{p}Bram does not interrupt.'],
    't-barrel-out': 'Empty. It has been empty so long\nit has forgotten what it was for.',
    't-barrel-far': 'Rainwater, one frog, and the\nfrog is clearly in charge.',
    't-hay-out': 'A hen got here first. She is\nstill here. She is not moving.',
  },
};
