/**
 * meadow.npcs.js — Puddlewick Vale's PEOPLE layer: who is out in the meadow, and what everything in it says.
 *                                                                        (P11 people · P12 words; layer of meadow.js)
 *
 * Merged into src/world/maps/meadow.js at load by src/world/map.js (see its header, "Files and layers"):
 *   npcs:  [{id, name, char/variant | animal, x, z, facing, idle, voice, script, ...}]   appended to the base's npcs
 *          — the full entry shape is documented at the top of src/world/npc.js, the script format in src/ui/dialogue.js
 *   lines: {key: text | pages[] | {text, voice?, name?}}   words for every base entity that names `line: 'key'`
 *
 * Markup is src/ui/text.js (VOICE-BIBLE §0: three lines, 34 characters, the joke on the strong word). `voice` is a
 * CANON char id ('halvard') or a timbre ('low:0.9', 'high:1.35', 'monster:1.4'); anything without one is the narrator.
 *
 * Out here, a mile from the village: Mrs Pell sweeping her step with her husband singing to the kettle indoors, her
 * three hens, Tansy chasing a cat who is not running away, Mr Gudgeon and the boot he has caught four times, and
 * Fennick Quiddle selling Mr Budge a pan he has already bought, with Mr Budge's dog deciding to come with you.
 */
export default {
  npcs: [
    // ── the cottage: Mrs Pell, her hens, and the kettle singing indoors ─────────────────────────────────────
    {
      id: 'pell', name: 'Mrs Pell', char: 'villager', variant: 'granny', voice: 'high:0.92',
      x: -9.7, z: 0.95, facing: 100, idle: 'sweep', radius: 1.0, when: '!ch2.start',
      schedule: [
        { from: 6, to: 11, at: [-9.7, 0.95], idle: 'sweep', facing: 100 },
        { from: 11, to: 15, at: [-13.9, -4.0], idle: 'stand', facing: 180 },
        { from: 15, to: 20, at: [-10.0, 0.95], idle: 'sit', facing: 90 },
      ],
      home: [-10.4, 0.8],
      script: [
        { if: ['hour>=11', 'hour<15'], then: [
          'Nine shirts on the line, and the\nwind has gone and sat down.',
        ], else: [
          { first: [
            'Mind the wet step.\nOr don\'t, and I\'ll sweep you off\nit with everything else.',
            { if: '!ch1.left_home', say: 'Off to the village, is it?\nUp the lane and over the bridge.\nYou can smell the bread from here.' },
          ], again: [
            { cycle: [
              'My husband is in there singing\nto the kettle.{p}He says it boils quicker for it.\nIt does not.',
              'You have grown. Stand still and\nlet me be wrong about it.',
              'I have swept this step since I\nwas your size.{p}It has never once thanked me.',
            ] },
          ] },
        ] },
      ],
    },
    { id: 'hen1', name: 'a brown hen', animal: 'hen', tint: 'brown', voice: 'monster:1.25', x: -8.4, z: -1.4, radius: 1.5, idle: 'hen', when: '!ch2.start',
      script: 'Buk.\n(She has laid an egg, and would\nlike it mentioned.)' },
    { id: 'hen2', name: 'a hen', animal: 'hen', voice: 'monster:1.35', x: -7.7, z: -2.2, radius: 1.5, idle: 'hen', when: '!ch2.start',
      script: 'Buk buk.\n(This is her grass. All of it.)' },
    { id: 'hen3', name: 'a hen', animal: 'hen', tint: 'speckled', voice: 'monster:1.15', x: -8.9, z: -0.5, radius: 1.4, idle: 'hen', when: '!ch2.start',
      script: 'Buk.\n(This one is thinking about a\nworm. Only the one worm.)' },

    // ── the lane: a child, and a cat who is going somewhere fast ───────────────────────────────────────────
    {
      id: 'tansy', name: 'Tansy', char: 'villager', variant: 'child', voice: 'high:1.42',
      x: 4.2, z: 14.2, facing: 240, idle: 'chase', with: 'sausage', radius: 5.5, when: '!ch2.start',
      schedule: [{ from: 7, to: 19, at: [4.2, 14.2], idle: 'chase' }],
      home: [-2.0, -15.5],                                  // up the lane towards the village, at bedtime
      script: [
        { first: [
          'I am not chasing him. We are\nBOTH chasing. He is just winning.',
        ], again: [
          { cycle: [
            'Sausage is nine and he can count\nto four and he bit a wasp once\nand the wasp said sorry.',
            'Mum says a cat comes when it\nwants.{p}He has wanted for a whole hour.\nI am being very patient at him.',
          ] },
        ] },
      ],
    },
    {
      id: 'sausage', name: 'Sausage', animal: 'cat', voice: 'monster:1.5',
      x: 6.2, z: 13.0, facing: 60, idle: 'cat', radius: 5.5, when: '!ch2.start',
      script: [{ cycle: [
        'Mrrp.\n(He was not running away.\nHe was going somewhere, fast.)',
        'Prrrt.\n(Two strokes. He is counting.)',
        '*Sausage looks past you at\nsomething that is not there.*\n(It is there.)',
      ] }],
    },

    // ── the pond: Mr Gudgeon and the same boot, four times ─────────────────────────────────────────────────
    {
      id: 'gudgeon', name: 'Mr Gudgeon', char: 'villager', variant: 'farmer', voice: 'low:0.92',
      x: -20.4, z: -7.4, facing: 270, idle: 'fish', water: -0.4, radius: 0.6,
      script: [
        { if: 'ch2.start', then: [
          'Ten years. Same boot.\nNeither of us has given up.',
        ], else: [
          { first: [
            'Forty years at this pond.\nI have caught the same boot\nfour times.',
            'We have an understanding, him\nand me. I throw him back.\nHe waits.',
          ], again: [
            { cycle: [
              'Quiet, now. The fish can hear\nyour boots thinking.',
              'There is a big one in here.\nI have never seen him.{p}That is how I know he is big.',
              'My wife says it is not fishing\nif you never catch anything.{p}She calls it sitting down\nwith a stick.',
            ] },
          ] },
        ] },
      ],
    },

    // ── the spur lane: a pan, a man who will not buy it, and a man who already has ─────────────────────────
    {
      id: 'quiddle', name: 'Fennick Quiddle', char: 'villager', variant: 'merchant', voice: 'low:1.3',
      x: -5.2, z: 2.3, facing: 250, idle: 'chat', with: 'budge', radius: 0.8, when: '!ch2.start',
      schedule: [
        { from: 6, to: 13, at: [-5.2, 2.3], idle: 'chat' },
        { from: 13, to: 20, at: [1.6, 9.2], idle: 'sell', facing: 170 },   // round the signpost, hoping for trade
      ],
      home: [13.0, 7.4],
      script: [
        { first: [
          { as: 'quiddle', say: 'Pots, pans, potions and portable\npity! Best price in the vale,\nsquire.' },
          'It is also the only price\nin the vale.',
          { as: 'budge', say: 'He has been selling me that pan\nsince Tuesday.' },
          'I have a pan.',
        ], again: [
          { as: 'quiddle', say: 'A lantern, squire? Brass, bright,\nand guaranteed unbreakable.{p}Guaranteed-ish.' },
          { choice: ['Buy the lantern.', 'Just looking.'], then: [
            [{ if: 'gold>=35', then: [
              'Thirty-five gold and it is yours.{p}I shall not tell your father,\nand neither will the lantern.',
            ], else: [
              'Ah. You are thirty-five short,\nsquire.{p}I can do you a very good look\nat it for nothing.',
            ] }],
            [{ as: 'quiddle', say: 'Look away. Looking is free.\nIt is the only thing I have\nnever put a price on.' }],
          ] },
        ] },
      ],
    },
    {
      id: 'budge', name: 'Mr Budge', char: 'villager', variant: 'innkeeper', voice: 'low:1.02',
      x: -6.7, z: 1.8, facing: 70, idle: 'chat', with: 'quiddle', radius: 0.8, when: '!ch2.start',
      schedule: [
        { from: 6, to: 14, at: [-6.7, 1.8], idle: 'chat' },
        { from: 14, to: 20, at: [-15.4, 10.6], idle: 'lean', facing: 250 },   // leaning on the paddock fence
      ],
      home: [-10.8, -1.2],
      script: [
        { first: [
          { as: 'budge', say: 'Don\'t buy the pan.' },
          'I bought the pan.',
        ], again: [
          { cycle: [
            { as: 'budge', say: 'I have been standing here since\nbreakfast.{p}He talks. I stand. It suits us\nboth down to the ground.' },
            { as: 'budge', say: 'That is my dog. Crumpet.\nHe will follow you a little way\nand then think better of it.' },
          ] },
        ] },
      ],
    },
    {
      id: 'crumpet', name: 'Crumpet', animal: 'dog', voice: 'monster:1.05',
      x: -7.6, z: 3.0, facing: 30, idle: 'dog', radius: 3.2, when: '!ch2.start',
      script: [{ cycle: [
        'Whuff.\n(He has decided to come with you\nfor a bit. Just to the gate.)',
        'Whuff whuff.\n(He is telling you about a stick.\nIt was the best stick.)',
        '*A tail, going.*\n(You are the most interesting\nthing that has happened today.)',
      ] }],
    },
  ],

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
      '%HERO% searches the grass.{wait:350}{n}A beetle searches him back.',
      '%HERO% looks under a dandelion.{n}Nothing, unless you are counting\nthe dandelion.',
      '%HERO% finds a very good stick.{wait:300}{n}He has one. He leaves it\nfor somebody else.',
      '%HERO% checks the hedge.{n}The hedge is full of hedge.',
      'A feather, a snail shell and\nhalf an acorn.{wait:250}{n}He puts the snail back.',
    ],
  },
};
