/**
 * puddlewick.npcs.js — the home village's PEOPLE layer: everyone who lives in Puddlewick, in all three Acts.
 *                                                                (P11 people · P12 words; layer of puddlewick.js)
 *
 * WORLD-BIBLE §3 is the plan (a green with a well and the chestnut tree, seven houses in a ring, the Beck across the
 * top third, the shrine of Saint Alden in the north-east corner, the sheep pen west, the lane out east) and CANON §1
 * is the cast. VOICE-BIBLE §5b gives the four constant villagers a line per Act; those lines are quoted here as
 * written, including the two that must never change ("Warm one, love." and Old Hob's Act II line).
 *
 * WHERE EVERYONE STANDS — this layer is a FUNCTION of the base map, so P23 owns the coordinates. It reads
 * puddlewick.js's published `def.spots`: hob · nan · barty · dot · bel · innkeeper · shopkeeper · smithBoy ·
 * gateGuard · deacon · cat · duck · cactuddle · green · play · doors{id}. Facings there are radians; this file
 * writes degrees, and converts. Anything a base has not published falls back to a fraction of the map rectangle,
 * and src/world/npc.js settles anybody who lands somewhere they cannot stand and reports how far they moved in
 * __DQ.state().npcs — so a bad guess is visible rather than invisible.
 *
 * WHO IS OUT, BY ACT (WORLD-BIBLE §3 Visit 1 / 2 / 3):
 *   Act I   eleven villagers, a cat, a duck, two hens, the smith's dog, and the potted Cactuddle on the green
 *   Act II  three only — Old Hob at the well and the squatter family, the Pooles, who are frightened of you
 *           until you have spoken to them twice (Barty is indoors at Hollybank: that is P24's scene)
 *   Act III Old Hob, Watchman Nodd, Bernard grown, Dot and Bel grown and bored, and Nan Puddifoot back at her
 *           oven once `ch3.elowen` is set, saying exactly what she said in Act I
 *
 * The full NPC entry shape is at the top of src/world/npc.js; the script format is in src/ui/dialogue.js.
 */

/**
 * Where somebody stands: P23 publishes `def.spots` (see puddlewick.js), whose facings are RADIANS in the
 * atan2(dx, dz) convention; this layer authors facings in DEGREES, so they are converted. Anything a base map has
 * not published falls back to a fraction of the map rectangle (u east, v south) and src/world/npc.js settles
 * whoever lands somewhere they cannot stand, reporting how far they moved in __DQ.state().npcs.
 */
const DEG = 180 / Math.PI;
function spot(base, name, u, v, facing) {
  const S = base && (base.spots || base.markers || base.anchors || base.npcSpots);
  const m = S && S[name];
  if (m && Number.isFinite(+m.x)) {
    return { x: +m.x, z: +m.z, y: Number.isFinite(+m.y) ? +m.y : undefined,
      facing: Number.isFinite(+m.facing) ? +m.facing * DEG : facing };
  }
  if (Array.isArray(m)) return { x: +m[0], z: +m[1], facing: Number.isFinite(+m[2]) ? +m[2] : facing };
  const size = Array.isArray(base?.size) ? base.size : [40, 34];
  const origin = Array.isArray(base?.origin) ? base.origin : [-size[0] / 2, -size[1] / 2];
  return { x: origin[0] + u * size[0], z: origin[1] + v * size[1], facing };
}
/** The standing spot outside a door (P23's spots.doors), for going home at night. */
function door(base, id, fallback) {
  const d = base && base.spots && base.spots.doors && base.spots.doors[id];
  return d && Number.isFinite(+d.x) ? { x: +d.x, z: +d.z, facing: Number.isFinite(+d.facing) ? +d.facing * DEG : 0 } : fallback;
}
/** A spot nudged by (dx, dz) — so a stall and its keeper are not standing in each other. */
const near = (s, dx, dz, facing) => ({ x: s.x + dx, z: s.z + dz, facing: facing ?? s.facing });

export default function puddlewickPeople(base = {}) {
  const well = spot(base, 'well', 0.50, 0.58, 180);
  const hobSpot = spot(base, 'hob', 0.50, 0.58, 180);
  const nanSpot = spot(base, 'nan', 0.30, 0.72, 20);
  const bartySpot = spot(base, 'barty', 0.28, 0.36, 90);
  const dotSpot = spot(base, 'dot', 0.46, 0.62, 0);
  const belSpot = spot(base, 'bel', 0.54, 0.66, 180);
  const shopSpot = spot(base, 'shopkeeper', 0.70, 0.73, 340);
  const smithBoy = spot(base, 'smithBoy', 0.66, 0.70, 320);
  const innSpot = spot(base, 'innkeeper', 0.60, 0.44, 200);
  const gateSpot = spot(base, 'gateGuard', 0.93, 0.55, 270);
  const deaconSpot = spot(base, 'deacon', 0.82, 0.22, 200);
  const green = spot(base, 'green', 0.50, 0.66, 0);
  const catSpot = spot(base, 'cat', 0.34, 0.68, 200);
  const duckSpot = spot(base, 'duck', 0.47, 0.62, 90);
  const potSpot = spot(base, 'cactuddle', 0.55, 0.64, 0);
  const papaSpot = spot(base, 'halvard', 0.72, 0.48, 200);
  const wagonSpot = spot(base, 'wagon', 0.78, 0.52, 140);
  const homeBakery = door(base, 'puddlewick_bakery', nanSpot);
  const homeTwins = door(base, 'puddlewick_twins', dotSpot);
  const homeHob = door(base, 'puddlewick_hob', hobSpot);
  const homeInn = door(base, 'puddlewick_inn', innSpot);
  const homeShop = door(base, 'puddlewick_shop', shopSpot);

  const notAct2 = (api) => api.act() !== 2;

  const npcs = [
    // ── Act I: Papa at the lane with the wagon (between B1 and B2) ─────────────────────────────────────────
    {
      id: 'pw-halvard', name: 'Papa', char: 'halvard', voice: 'halvard', scale: 1.08, girth: 1.1,
      x: papaSpot.x, z: papaSpot.z, facing: papaSpot.facing, idle: 'stand', radius: 0.75,
      look: [wagonSpot.x, wagonSpot.z], when: '!ch1.left_home',
      script: [{
        first: [
          'There you are. Boots?',
          'Climb up when you are ready.\nParsnip has opinions about late\nstarts, and I share them.',
        ],
        again: [{ cycle: [
          'The Long Lane is waiting, lad.\nIf you would.',
          'Barty will keep the fire. He\nalways does. That is not an\nexcuse to dawdle.',
          'We are for Saltmarrow by dusk.\nOr we are not, and I shall be\ncross in either case.',
        ] }],
      }],
    },
    // ── the four constant villagers (VOICE-BIBLE §5b) ──────────────────────────────────────────────────────
    {
      // both hands on the well he has leaned on since before the well: no pitchfork to get in the way of it
      id: 'hob', name: 'Old Hob', char: 'villager', variant: 'farmer', voice: 'low:0.74', wear: 'clay', scale: 0.94, girth: 1.08, hold: 'none',
      x: hobSpot.x, z: hobSpot.z, facing: hobSpot.facing, idle: 'lean', look: [well.x, well.z], radius: 0.8,
      schedule: [{ from: 6, to: 21, at: [hobSpot.x, hobSpot.z], idle: 'lean' }],
      home: [homeHob.x, homeHob.z],
      script: [
        { act: {
          1: [
            { first: [
              'Off up the hill again with your\nfather?{p}Take a coat. He never takes\na coat.',
              // the town crier's second line is always the next thing to do (WORLD-BIBLE §6)
              { if: '!ch1.left_home', then: ['Your father is at the lane with\nthe wagon.{p}He is the big one. You cannot\nmiss him.'],
                else: ['You are off out, then.{p}The lane east goes to the sea.\nThe lane south goes for ever.'] },
            ], again: [
              { cycle: [
                'Well is deep. Don\'t fall in it.\nThat is the whole of my advice.',
                'Your father was a boy here.\nRan everywhere. Same as you.',
                'I have leaned on this well\nsince before the well.',
              ] },
            ] },
          ],
          2: [
            { first: ['Well. You came back, and he\ndidn\'t.{p}...Barty has kept the fire in.\nGo on.'],
              again: ['Well is still deep.\nSome things keep.'] },
          ],
          3: [
            { first: ['Bring the little ones here.\nI will tell them lies about\ntheir grandad.'],
              again: ['Three hundred gold, the new\nthatch. You paid for all of it.{p}I told them it was me.'] },
          ],
        } },
      ],
    },
    {
      id: 'nan', name: 'Nan Puddifoot', char: 'villager', variant: 'baker', voice: 'high:0.9', scale: 1.0, girth: 1.1,
      x: nanSpot.x, z: nanSpot.z, facing: nanSpot.facing, idle: 'sell', radius: 1.0, when: '!ch2.start',
      schedule: [
        { from: 5, to: 12, at: [nanSpot.x, nanSpot.z], idle: 'sell', facing: nanSpot.facing },
        { from: 12, to: 17, at: [green.x - 1.4, green.z + 1.2], idle: 'sell', facing: 20 },   // out by the pies
        { from: 17, to: 21, at: [nanSpot.x, nanSpot.z], idle: 'stand', facing: nanSpot.facing },
      ],
      home: [homeBakery.x, homeBakery.z],
      script: [
        { first: [
          'Warm one, love.\nDon\'t tell your father.',
          'You have the look of a boy who\nis about to do something daft.',
        ], again: [
          { cycle: [
            'The oven has been going since\nfour.{p}I have been going since three.',
            { say: 'Two gold a bun.{p}For you, nothing. Don\'t tell\nthe others it was nothing.' },
            'There is flour in your hair.\nThere is flour in everybody\'s\nhair. It is that sort of village.',
          ] },
        ] },
      ],
    },
    {
      id: 'nan3', name: 'Nan Puddifoot', char: 'villager', variant: 'baker', voice: 'high:0.9', scale: 1.0, girth: 1.12,
      x: nanSpot.x, z: nanSpot.z, facing: nanSpot.facing, idle: 'sell', radius: 1.0, when: 'ch3.elowen',
      script: [
        { first: ['Warm one, love.', 'Sit down. You are a king and\nyou are covered in road.'] },
        { again: [{ cycle: [
          'They kept me in a grey room\nfor nine years, love.{p}First thing I did was light\nthe oven.',
          'Your girl has had three buns\nand is working on a fourth.{p}She is her grandmother\'s\ngranddaughter.',
        ] }] },
      ],
    },
    {
      id: 'barty', name: 'Barty Marrow', char: 'barty', voice: 'barty', scale: 0.98, girth: 1.06,
      x: bartySpot.x, z: bartySpot.z, facing: bartySpot.facing, idle: 'stand', radius: 0.8, when: '!ch2.start',
      script: [
        { first: [
          'Little master! I have made\na stew.{p}It is mostly stew. That is\nthe secret of stew.',
          'You go on and play.{p}I will be here. I am always\nhere.',
        ], again: [
          { cycle: [
            'Your father, he never knocks.\nHe arrives.',
            'Eat something before the road.\nA hero on an empty stomach is\njust a boy holding a stick.',
            'I have put a little cake in\nyour pack.{p}I have put a little cake in\neverybody\'s pack.',
          ] },
        ] },
      ],
    },
    {
      id: 'dot', name: 'Dot', char: 'villager', variant: 'child', voice: 'high:1.45', wear: 'berry', scale: 1.04, girth: 1.0, hold: 'none',
      x: dotSpot.x, z: dotSpot.z, facing: dotSpot.facing, idle: 'tag', with: 'bel', it: true, radius: 3.4, when: '!ch2.start',
      schedule: [{ from: 7, to: 19.5, at: [dotSpot.x, dotSpot.z], idle: 'tag' }],
      home: [homeTwins.x, homeTwins.z],
      script: [
        { first: ['You are It.\nYou have been It since Tuesday.'], again: [
          { cycle: [
            'New rule: the well is safe.{p}New rule: it is not.',
            'A new rule is a penny.{p}I have sold four rules today\nand I am very rich.',
            'We are not allowed in the Beck.{p}We are allowed to look at it\nfrom the bridge. For hours.',
          ] },
        ] },
      ],
    },
    {
      id: 'bel', name: 'Bel', char: 'villager', variant: 'child', voice: 'high:1.32', wear: 'mustard', scale: 0.95, girth: 1.05, hold: 'none',
      x: belSpot.x, z: belSpot.z, facing: belSpot.facing, idle: 'tag', with: 'dot', radius: 3.4, when: '!ch2.start',
      schedule: [{ from: 7, to: 19.5, at: [belSpot.x, belSpot.z], idle: 'tag' }],
      home: [homeTwins.x, homeTwins.z],
      script: [
        { first: ['I am not It. Dot is It.{p}Dot has been It so long she\nlives there now.'], again: [
          { cycle: [
            'I can hold my breath longer\nthan Dot.{p}Dot says that is not a game.\nIt is a game.',
            'If you stand very still,\nyou are a tree and you cannot\nbe got. Those are the rules.',
          ] },
        ] },
      ],
    },

    // ── the other villagers, all with something to sell and nothing you can afford (STORY-BIBLE §5.2) ──────
    {
      // THE IRONMONGER. A big bald ruddy man in a leather apron is exactly the right body for him — but he was
      // holding the innkeeper's tankard of ale while the narration had him taking a sword down off the wall.
      id: 'hammond', name: 'Mr Hammond', char: 'villager', variant: 'farmer', voice: 'low:0.86', wear: 'ink', scale: 1.06, girth: 1.14, hold: 'hammer',
      x: shopSpot.x, z: shopSpot.z, facing: shopSpot.facing, idle: 'sell', radius: 0.8, when: '!ch2.start',
      schedule: [{ from: 7, to: 19, at: [shopSpot.x, shopSpot.z], idle: 'sell', facing: shopSpot.facing }],
      home: [homeShop.x, homeShop.z],
      script: [
        { first: [
          { anim: 'wave' },
          { narrate: 'Mr Hammond puts the hammer down\nand takes a sword off the wall.' },
          { anim: 'nod' },
          { narrate: 'He looks at %HERO%\'s face.{wait:700}{p}He puts the sword back,\nslowly, and picks the hammer\nup again.' },
          'Mind you. Your father was never\ntall enough for his, either.',
        ], again: [
          { cycle: [
            'Eleven gold, that one.{p}You have a stick and a ribbon\nand a face like a church mouse.',
            'Our Bernard made a hook today.{p}I have told him: no more sword.\nHe has a lovely hand for pastry.',
          ] },
        ] },
      ],
    },
    {
      // 'Today I made a hook. It is a good hook.' He is holding the hook.
      id: 'bernard', name: 'Bernard', char: 'villager', variant: 'child', voice: 'high:1.2', wear: 'rust', scale: 1.07, girth: 1.03, hold: 'hook',
      x: smithBoy.x, z: smithBoy.z, facing: smithBoy.facing, idle: 'wander', radius: 1.4, when: '!ch2.start',
      script: [
        { first: [
          'One day I will make a proper\nsword.{p}Today I made a hook.\nIt is a good hook.',
        ], again: [
          { cycle: [
            'Two gold for the hook.{p}...Or a look at your father\'s\nsword. A long look.',
            'Dad says hooks are honest work.{p}Nobody ever sang a song about\na hook.',
          ] },
        ] },
      ],
    },
    {
      id: 'bernard3', name: 'Bernard', char: 'villager', variant: 'innkeeper', voice: 'low:0.98', wear: 'rust', scale: 1.09, girth: 1.16, hold: 'hammer',
      x: smithBoy.x, z: smithBoy.z, facing: smithBoy.facing, idle: 'stand', radius: 0.8, when: 'ch3.sword_drawn',
      script: [
        { first: ['My lad does the hammering now.{p}I do the standing about and\nthe sighing.'],
          again: ['That hook is still on the barn\ndoor, you know.{p}Twenty years. Not a wobble.'] },
      ],
    },
    {
      id: 'nodd', name: 'Watchman Nodd', char: 'villager', variant: 'guard', voice: 'low:1.06', scale: 1.02, girth: 0.97,
      x: gateSpot.x, z: gateSpot.z, facing: gateSpot.facing, idle: 'stand', radius: 0.6, when: notAct2,
      script: [
        { act: {
          1: [{ first: ['Nothing ever happens here.\nBest job in the world.'], again: [
            { cycle: [
              'I would sell you a look at the\nroad.{p}First look is free. Go on.\nLook.',
              'Eleven years on this gate.{p}Nothing has ever come out of\nthat wood. That is the worry.',
            ] },
          ] }],
          2: [{ say: 'Nothing has happened here in\nten years.{p}You would think that would be\na comfort.' }],
          3: [{ first: ['Something has finally happened\nhere.{p}I have decided I preferred the\nother thing.'],
            again: ['They are calling you king down\nthe lane.{p}You still walk like a boy who\nis late for his supper.'] }],
        } },
      ],
    },
    {
      id: 'pottle', name: 'Mrs Pottle', char: 'villager', variant: 'granny', voice: 'high:0.98', wear: 'teal', scale: 1.03, girth: 1.12,
      x: innSpot.x, z: innSpot.z, facing: innSpot.facing, idle: 'sell', radius: 0.9, when: '!ch2.start',
      schedule: [
        { from: 6, to: 20, at: [innSpot.x, innSpot.z], idle: 'sell', facing: innSpot.facing },
      ],
      home: [homeInn.x, homeInn.z],
      script: [
        { first: [
          'Two beds, six gold, and the soup\nis not optional.',
          'You are nine.\nYou live up the lane.\nGo home, love.',
        ], again: [
          { cycle: [
            'Nobody stays here. They stop here.{p}There is a difference, and it is\nabout four hours.',
            'The soup is famous.{p}The recipe is a secret.\nThe secret is turnip.',
          ] },
        ] },
      ],
    },
    {
      id: 'candlewick', name: 'Sister Candlewick', char: 'villager', variant: 'nun', voice: 'high:1.0', scale: 1.0, girth: 0.95,
      x: deaconSpot.x, z: deaconSpot.z, facing: deaconSpot.facing, idle: 'sweep', radius: 1.1, when: '!ch2.start',
      script: [
        { first: [
          'Saint Alden kept sheep, one bell\nand his temper.',
          'We keep the bench swept.\nIt is the same job, mostly.',
        ], again: [
          { cycle: [
            'The blessing is free.\nThe candle is two gold.{p}Most people find the blessing\ngoes further with a candle.',
            'There is no roof on the shrine.{p}Saint Alden did not hold with\nroofs. We think he was wrong.',
            'Rest here a moment.\nThe book keeps its place.',
          ] },
        ] },
      ],
    },
    {
      id: 'brim', name: 'Mr Brim', char: 'villager', variant: 'merchant', voice: 'low:1.22', wear: 'berry', scale: 0.97, girth: 1.08,
      x: green.x + 3.4, z: green.z - 3.2, facing: 200, idle: 'sell', radius: 0.8, when: '!ch2.start',
      script: [
        { first: [
          'Hats. Hats for every head in\nPuddlewick.{p}There are nine heads in\nPuddlewick.',
        ], again: [
          { say: 'Try the big one on. Go on.\nIt is free to try.' },
          { choice: ['Try on the big one.', 'Just looking.'], cancel: 1, then: [
            [{ narrate: 'The hat comes down over\n%HERO%\'s eyes.{p}Somewhere in there, he is\nsmiling.' },
              'It fits. That is the trouble\nwith a boy and a big hat.{p}Everyone can see where he is\ngoing before he does.'],
            ['Look all you like.{p}Looking has never once put\nbread on this stall.'],
          ] },
        ] },
      ],
    },
    {
      // 'Honey is two gold a pot. The bees set the price. I only carry it.' She is carrying it.
      id: 'honeysett', name: 'Mrs Honeysett', char: 'villager', variant: 'granny', voice: 'high:0.86', wear: 'mustard', scale: 0.92, girth: 0.98, hold: 'honeypot',
      x: green.x - 3.2, z: green.z + 2.6, facing: 300, idle: 'wander', radius: 1.8, when: '!ch2.start',
      script: [
        { first: [
          'I keep bees.\nThey keep me, mostly.',
          'Honey is two gold a pot.\nThe bees set the price.\nI only carry it.',
        ], again: [
          { cycle: [
            'Do not run past the hives.{p}Walk past them like you have\nnothing to hide. It works on\nbees and on mothers.',
            'One of mine stung the tax man\nlast spring.{p}I have never worked out how\nto reward a bee.',
          ] },
        ] },
      ],
    },

    // ── Act II: the village is half burnt and the Pooles are living in it (WORLD-BIBLE §3 Visit 2) ─────────
    {
      id: 'kit', name: 'Kit Poole', char: 'villager', variant: 'baker', voice: 'high:0.96', wear: 'ink', scale: 0.98, girth: 0.97, hold: 'basket',
      x: green.x - 2.0, z: green.z - 1.2, facing: 150, idle: 'stand', radius: 0.9, when: ['ch2.start', '!ch3.start'],
      // frightened of you until you have spoken to her twice (WORLD-BIBLE §3 Visit 2)
      script: [
        { if: 'talks>=2', then: [
          { cycle: [
            'You are him. The one who went\nto the quarry.{p}...Sit down. There is nothing\nto sit on, but sit down.',
            'Rill has never seen a whole\nroof.{p}He thinks houses are meant to\nbe open at the top.',
          ] },
        ], else: [
          { first: [
            { narrate: 'She stands in front of the boy\nand does not move.' },
            'We are not stopping. We were\ntold nobody was coming back.',
          ], again: [
            'You keep looking at that house.{p}...It is yours, isn\'t it.',
          ] },
        ] },
      ],
    },
    {
      id: 'rill', name: 'Rill', char: 'villager', variant: 'child', voice: 'high:1.5', wear: 'slate', scale: 0.88, girth: 0.92, hold: 'none',
      x: green.x - 1.0, z: green.z - 0.4, facing: 150, idle: 'wander', radius: 1.6, when: ['ch2.start', '!ch3.start'],
      script: [
        { first: ['*He gets behind his mother\nvery quickly.*'], again: [
          { cycle: [
            'Are you the one in the stories?{p}You are shorter than the\nstories.',
            'There is a man in that house\nwho keeps a fire in for\nsomebody.{p}Every night. I have counted.',
          ] },
        ] },
      ],
    },

    // ── Act III: Dot and Bel, grown, watching your children play their game ───────────────────────────────
    {
      id: 'dot3', name: 'Dot', char: 'villager', variant: 'baker', voice: 'high:1.04', wear: 'berry', scale: 1.0, girth: 1.06,
      x: dotSpot.x, z: dotSpot.z, facing: dotSpot.facing, idle: 'chat', with: 'bel3', radius: 0.8, when: 'ch3.sword_drawn',
      script: [
        { first: [
          { as: 'dot3', say: 'Your two are playing our game.{p}They have got the rules right\nand it is somehow worse.' },
          { as: 'bel3', say: 'We were never that loud.' },
          { as: 'dot3', say: 'We were exactly that loud.' },
        ], again: [{ as: 'dot3', say: 'I am the one who keeps the\nvillage book now.{p}There is a page in it with\nyour name and no facts.' }] },
      ],
    },
    {
      id: 'bel3', name: 'Bel', char: 'villager', variant: 'innkeeper', voice: 'low:1.16', wear: 'teal', scale: 1.02, girth: 1.09,
      x: belSpot.x, z: belSpot.z, facing: belSpot.facing, idle: 'chat', with: 'dot3', radius: 0.8, when: 'ch3.sword_drawn',
      script: [
        { first: ['I can still hold my breath\nlonger than Dot.'],
          again: ['New rule: the well is safe.{p}...We are far too old for the\nnew rules. Tell your girl\nthat one, though.'] },
      ],
    },

    // ── the animals, and the pot on the green that has been waiting since the first minute ────────────────
    {
      id: 'sultana', name: 'Sultana', animal: 'cat', tint: 'grey', voice: 'monster:1.45',
      x: catSpot.x, z: catSpot.z, y: 1.1, facing: catSpot.facing, idle: 'perch', radius: 0.4, fixed: true, when: '!ch2.start',
      script: [{ cycle: [
        'Mrrow.\n(She lives on this wall.\nThe bakery is hers as well.)',
        '*Sultana watches the oven door\nwithout blinking.*\n(Any minute now.)',
      ] }],
    },
    {
      id: 'admiral', name: 'the well duck', animal: 'duck', voice: 'monster:1.3',
      x: duckSpot.x, z: duckSpot.z, facing: duckSpot.facing, idle: 'duck', radius: 1.8, when: '!ch2.start',
      script: [{ cycle: [
        'Quack.\n(He has decided the well is his.\nNobody has told the well.)',
        'Quack quack.\n(He would like it known that he\nwas here first.)',
      ] }],
    },
    { id: 'pw-hen1', name: 'a hen', animal: 'hen', tint: 'brown', voice: 'monster:1.22', x: nanSpot.x - 1.8, z: nanSpot.z + 1.5, radius: 1.6, idle: 'hen', when: '!ch2.start',
      script: 'Buk.\n(Nan\'s hen. She knows it.)' },
    { id: 'pw-hen2', name: 'a hen', animal: 'hen', voice: 'monster:1.36', x: nanSpot.x - 0.8, z: nanSpot.z + 2.2, radius: 1.6, idle: 'hen', when: '!ch2.start',
      script: 'Buk buk buk.\n(An egg. In the middle of the\ngreen. Deal with it.)' },
    {
      id: 'anvil', name: 'Anvil', animal: 'dog', tint: 'brown', voice: 'monster:0.95',
      x: shopSpot.x + 1.6, z: shopSpot.z + 1.4, facing: 300, idle: 'dog', radius: 3.6, when: '!ch2.start',
      script: [{ cycle: [
        'Whuff.\n(The smith\'s dog. He is coming\nwith you as far as the gate.)',
        '*Anvil leans his whole weight\nagainst your leg.*\n(This is a gift. Accept it.)',
      ] }],
    },
    {
      // the pot itself is P23's prop on the green; the Cactuddle just stands in it
      id: 'cactuddle', name: 'a potted cactus', monster: 'cactuddle', y: 0.34, voice: 'monster:0.92',
      x: potSpot.x, z: potSpot.z, facing: 0, idle: 'stand', radius: 0, fixed: true,
      script: [
        { act: {
          1: [{ first: [
            '*The potted cactus turns its\narms towards you.*',
            'Hello. Are you a hugger?{p}...No. No, quite right.\nVery sensible.',
          ], again: [{ cycle: [
            'It is very nice in this pot.{p}I would show you round, but\nit is a pot.',
            'Somebody waters me on Tuesdays.{p}I have never seen who.\nI keep my arms out, just in case.',
          ] }] }],
          2: [{ say: 'You went away.\nI stayed exactly here.{p}I am very good at this.' }],
          3: [{ first: ['Your daughter hugged me.{p}She is wearing plasters and\nshe says it was worth it.'],
            again: ['I have been in this pot for\nnineteen years.{p}Frankly, it has all gone\nrather well.'] }],
        } },
      ],
    },
  ];

  const lines = {
    // P23's puddlewick.js already gives the well, the chestnut, the shrine, the maypole, the pies and every door
    // their own words, and they are good ones. A people layer only overrides where a PERSON owns the joke.
    // The sword gag belongs to Mr Hammond in person (STORY-BIBLE §5.2), so the shop door says something else.
    'door-puddlewick_shop': 'Iron, oil, and Mr Hammond\ndeciding, very slowly, that you\nare not ready for any of it.',
    // ...and the searching voice uses the hero's real name, whatever the player called him
    search: [
      '%HERO% looks under the trestle\ntable.{wait:350}{p}A pie has been counted twice.\nBy him.',
      '%HERO% searches the green.{n}Three chestnuts, still in their\nshells.{p}He puts two back.',
      '%HERO% checks the well bucket.{n}Empty. Somebody drank the rain.',
      '%HERO% looks up at the bunting.{n}One triangle is upside down.{p}He leaves it.\nIt is not his bunting.',
    ],
  };

  return { npcs, lines };
}
