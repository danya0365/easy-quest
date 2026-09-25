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
 *
 * And on the near band of the Long Lane — inside twelve paces of where the game starts, because a child's first
 * ninety seconds must not be an empty valley — Nib Tolley sitting on the bank with a newt in a jar, Marigold the
 * hen who has left home, Mrs Thurl walking the men's tea out to the field and back, Nib's father Wat on his
 * fence counting sheep he is not worried about, and Dimity Rowe selling flowers out of Mrs Pell's garden.
 * Fifteen souls, none of them further than twelve units from the spawn's camera, the nearest five at 4-8.
 */
export default {
  npcs: [
    // ── the cottage: Mrs Pell, her hens, and the kettle singing indoors ─────────────────────────────────────
    {
      id: 'pell', name: 'Mrs Pell', char: 'villager', variant: 'granny', voice: 'high:0.92', wear: 'sky', scale: 0.96, girth: 1.06,
      x: -9.7, z: 0.95, facing: 100, idle: 'sweep', radius: 1.0, when: '!ch2.start',
      schedule: [
        { from: 6, to: 11, at: [-9.7, 0.95], idle: 'sweep', facing: 100 },
        { from: 11, to: 15, at: [-13.9, -4.0], idle: 'stand', facing: 180 },
        { from: 15, to: 20, at: [-10.0, 0.95], idle: 'sit', facing: 90 },
      ],
      home: [-10.4, 0.8],
      script: [
        { if: ['hour>=11', 'hour<15'], then: [
          'Nine shirts on the line.{p}The wind has gone and sat down.',
        ], else: [
          { first: [
            'Mind the wet step.\nOr don\'t, and I will sweep you\noff it with everything else.',
            { if: '!ch1.left_home', say: 'Off to the village, is it?\nUp the lane and over the bridge.\nYou can smell the bread from here.' },
          ], again: [
            { cycle: [
              'My husband is in there singing\nto the kettle.{p}He says it boils quicker for it.\nIt does not.',
              'You have grown. Stand still\nand let me be wrong about it.',
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
      script: 'Buk.\n(This one is thinking about\na worm. Only the one worm.)' },

    // ── the lane: a child, and a cat who is going somewhere fast ───────────────────────────────────────────
    {
      id: 'tansy', name: 'Tansy', char: 'villager', variant: 'child', voice: 'high:1.42', wear: 'teal', scale: 1.02, girth: 0.95,
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
      id: 'gudgeon', name: 'Mr Gudgeon', char: 'villager', variant: 'farmer', voice: 'low:0.92', wear: 'slate', scale: 1.01, girth: 0.9,
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
      id: 'quiddle', name: 'Fennick Quiddle', char: 'villager', variant: 'merchant', voice: 'low:1.3', scale: 1.05, girth: 0.92,
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
      // he is holding the pan. He has been holding the pan since Tuesday. That is the joke, and now you can see it.
      id: 'budge', name: 'Mr Budge', char: 'villager', variant: 'innkeeper', voice: 'low:1.02', wear: 'moss', scale: 0.99, girth: 1.13, hold: 'pan',
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

    // ── the Long Lane, within twenty paces of the front door ────────────────────────────────────────────────
    // A child boots the game here and gets ninety seconds to fall in love with the place. If the first frame is
    // an empty valley, nobody falls in love with anything — so the near band of the lane has people in it, doing
    // things, close enough to read a face: a boy on the bank, a hen who has left home, the washing going up to
    // the village, a drover leaning on his fence, and a girl selling flowers she did not entirely buy.
    {
      id: 'nib', name: 'Nib Tolley', char: 'villager', variant: 'child', voice: 'high:1.38', wear: 'clay', scale: 0.93, girth: 0.96, hold: 'jar',
      emotes: ['love', 'question'],
      x: -2.6, z: 15.4, facing: 74, idle: 'sit', radius: 0.5, when: '!ch2.start',
      schedule: [{ from: 7, to: 19, at: [-2.6, 15.4], idle: 'sit', facing: 74 }],
      home: [-1.2, -14.0],
      script: [
        { first: [
          'I have got a newt.',
          'His name is Sir Newt.\nHe does not know that yet.',
        ], again: [
          { cycle: [
            'Dad says a newt is not a pet.\nDad says that about everything\nthat lives in a jar.',
            'I am going to be a knight.\nI have done the sitting-still bit.\nThat is the hard bit.',
            'There is a big one in the pond.\nA big NEWT, not a fish.{p}Fish are only wet birds.',
            { emote: 'love', say: 'You can hold him.{p}Two hands. He is mostly tail\nand he knows it.' },
          ] },
        ] },
      ],
    },
    { id: 'marigold', name: 'Marigold', animal: 'hen', tint: 'brown', voice: 'monster:1.28',
      x: 3.2, z: 14.6, facing: 200, radius: 2.4, idle: 'hen', when: '!ch2.start',
      script: [{ cycle: [
        'Buk.\n(She has left home. She will be\nback by supper, and not sorry.)',
        'Buk buk buk.\n(She knows the way to the village.\nShe is going the other way.)',
        '*Marigold looks at your boots.*\n(She has decided they are not\nfood. It took her a while.)',
      ] }] },
    {
      // THE WASHERWOMAN, not the baker: she walks the men's tea out to the field in a jug and brings the jug back.
      // A pastry toque and a bun in her fist made her a second Nan Puddifoot who talked about collars.
      id: 'thurl', name: 'Mrs Thurl', char: 'villager', variant: 'farmer', voice: 'high:0.94', wear: 'sky', scale: 1.0, girth: 1.05, hold: 'jug',
      x: 5.4, z: 12.4, facing: 200, idle: 'wander', radius: 3.4,      // east of the lane: never in front of the signpost
      schedule: [
        { from: 6, to: 12, at: [5.4, 12.4], idle: 'wander' },
        { from: 12, to: 19, at: [-6.0, 12.6], idle: 'stand', facing: 120 },   // pegging out on the far bank
      ],
      home: [-1.4, -14.6],
      script: [
        { act: {
          1: [
            { first: [
              'Mind the lane, love. I have got\nthe jug and I am not stopping.',
            ], again: [
              { cycle: [
                'Out at six with the jug, back\nat eight with the jug.{p}That jug has seen more of this\nvalley than I have.',
                'I wash for this whole village.{p}I know every one of them\nby their collars.',
                'Tell your father the big shirt\nis done.{p}Tell him it was not easy.',
                'That boy on the bank has a newt\nin a jar.{p}I have said nothing. I am\nsaying nothing beautifully.',
              ] },
            ] },
          ],
          2: [
            'You are the big shirt.{p}Well. You were.',
            'Go on up.{p}Barty has kept the fire in.\nHe always did.',
          ],
          3: [
            'Two of them now.{p}Both of them muddy.',
            'Send them down the lane to me.{p}I have thirty years of collars\nand nothing left to be told.',
          ],
        } },
      ],
    },
    {
      id: 'wat', name: 'Wat Tolley', char: 'villager', variant: 'farmer', voice: 'low:0.88', wear: 'moss', scale: 1.07, girth: 1.02,
      x: 5.6, z: 8.0, facing: 290, idle: 'lean', radius: 0.6, look: [1.6, 9.0],
      schedule: [
        { from: 6, to: 16, at: [5.6, 8.0], idle: 'lean', facing: 290 },
        { from: 16, to: 20, at: [8.2, 10.4], idle: 'stand', facing: 340 },
      ],
      home: [-1.8, -13.4],
      script: [
        { act: {
          1: [
            { first: [
              'Sheep in the lane again.\nMine.',
              'Every last one of them\nis somebody else\'s idea.',
            ], again: [
              { cycle: [
                'You cannot hurry a sheep.{p}You can walk behind one\nand think about your life.',
                'That is my boy on the bank\nwith the jar.{p}He will be a knight, he says.\nI have said worse.',
                'Forty sheep this morning.\nThirty-nine now.{p}I am not worried. I am counting\nagain, but I am not worried.',
                'Your father carried a ewe up\nthis lane once.{p}She bit him. He said it was\nfair enough.',
              ] },
            ] },
          ],
          2: [
            'Ten years of sheep, lad.{p}Same lane. Same sheep, near\nenough. You got taller.',
          ],
          3: [
            'Your girl counted my sheep\nfor me.{p}She got forty-one. I have only\ngot thirty-nine sheep.',
          ],
        } },
      ],
    },
    {
      id: 'dimity', name: 'Dimity Rowe', char: 'villager', variant: 'child', voice: 'high:1.12', wear: 'plum', scale: 0.99, girth: 0.94, hold: 'posy',
      x: -0.9, z: 7.4, facing: 20, idle: 'stand', radius: 0.8, when: '!ch2.start',
      look: [2.9, 10.8],                                  // watching the signpost for somebody with a penny
      schedule: [
        { from: 7, to: 14, at: [-0.9, 7.4], idle: 'stand', facing: 20 },
        { from: 14, to: 19, at: [-4.0, 7.6], idle: 'wander', radius: 2.6 },
      ],
      home: [-2.2, -14.2],
      script: [
        { first: [
          'Flowers, a penny a bunch.',
          'They are free.{p}The penny is what makes them\nspecial.',
        ], again: [
          { cycle: [
            'I picked these out of Mrs Pell\'s\ngarden.{p}She says I may. She has not\nsaid it out loud.',
            'This one is a dandelion.\nI call it a small sun.{p}It sells much better.',
            { emote: 'question', say: 'Who are they for?{p}Say a name and I will pick\nthe right colour.' },
            'Nobody has bought one yet.{p}I have made four pennies\nin compliments.',
          ] },
        ] },
      ],
    },

    // ── Act I: Bobble on the Long Lane bank before he joins (B3) ───────────────────────────────────────────
    {
      id: 'meadow-bobble', name: 'a blue Gloop', monster: 'gloop', voice: 'bobble',
      x: 3.4, z: -8.2, facing: 200, idle: 'idle', radius: 0.55,
      when: ['ch1.left_home', '!party.bobble'],
      script: [{
        first: [
          'Frankly— Bobble was here first.\nBobble is excellent at waiting.',
          'Bobble is not an ambush.\nBobble is a greeting that has\nnot happened yet.',
        ],
        again: [{ cycle: [
          'Bobble. Not Bubble. Not Wobble.\nBOBBLE.',
          'Frankly— the wagon looks roomy.\nBobble has measured it with\nhis eyes.',
        ] }],
      }],
    },
  ],

  lines: {
    // the signpost at the fork (meadow.js prop, line 'signpost')
    signpost: [
      '{gold}Puddlewick{/gold} — over the bridge,\nround the bend. Wipe your boots.',
      '{gold}Saltmarrow{/gold} — along the Beck,\na morning\'s walk. A whole day,\nif you stop for every frog.',
      'Somebody has carved a very small\ndragon into the post.\nIt is smiling.',
    ],
    'cottage-door': 'Somebody inside is singing\nto a kettle.\nThe kettle is winning.',
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
      '%HERO% finds a very good stick.{wait:300}{n}He has one already. He leaves\nit for somebody else.',
      '%HERO% checks the hedge.{n}The hedge is full of hedge.',
      'A feather, a snail shell,\nand half an acorn.{wait:250}{n}He puts the snail back.',
    ],
  },
};
