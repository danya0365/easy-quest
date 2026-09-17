/**
 * meadow.npcs.js — Puddlewick Vale's PEOPLE layer: who stands in the meadow and what everything in it says.
 *                                                                        (P11 people · P24 words; layer of meadow.js)
 *
 * Merged into src/world/maps/meadow.js at load by src/world/map.js (see its header, "Files and layers"):
 *   npcs:  [{id, char, x, z, facing?, wander?, script? | text? | line?, voice?, name?}]   appended to the base's npcs
 *   lines: {key: text | pages[] | {text, voice?, name?}}   words for every base entity that names `line: 'key'`
 *
 * Markup is src/ui/text.js (VOICE-BIBLE: three lines, ~34 characters, the joke on the strong word). `voice` is a CANON
 * char id (Sfx.glyph picks the glyph tick from it); anything without one speaks as the narrator.
 */
export default {
  // Nobody lives out in the vale yet: P11 puts the first people here (someone at the cottage, a child with a net).
  npcs: [],

  lines: {
    // the signpost at the fork (meadow.js prop, line 'signpost')
    signpost: [
      '{gold}Puddlewick{/gold} — over the bridge,\nround the bend. Wipe your boots.',
      '{gold}Saltmarrow{/gold} — along the Beck,\na morning\'s walk. A whole day,\nif you stop for every frog.',
      'Somebody has carved a very small\ndragon into the post.\nIt is smiling.',
    ],
    'cottage-door': 'Somebody inside is singing to\na kettle. The kettle is winning.',
    'rain-barrel': 'Barrel of rainwater. And one boot.\nJust the one.',
    sheep: 'Baa.\n(She has had a very long morning.)',
    duck: 'Quack.\n(This is his pond. You may look.)',

    // the lane ends (meadow.js exits): places not built yet say so kindly and turn you round
    'lane-sheep': ['The lane is full of sheep.\nThey are not in a hurry.', 'Nobody in Puddlewick has ever\nhurried a sheep. Not twice.'],
    'lane-east': ['The lane follows the Beck\nall the way down to the sea.', 'That is a grown-up sort of walk.\nPapa would want to come.'],
    'lane-south': ['The Long Lane goes on for ever.', 'Best not start on for ever\nwithout telling somebody.'],

    // Menu > Search anywhere in the vale (src/world/field.js reads map.lines.search, one per search, in turn)
    search: [
      'Bram searches the grass at his feet.{wait:350}{n}A beetle searches him back.',
      'Bram looks under a dandelion.{n}Nothing, unless you count the dandelion.',
      'Bram finds a very good stick.{wait:300}{n}He already has one. He leaves it for somebody else.',
    ],
  },
};
