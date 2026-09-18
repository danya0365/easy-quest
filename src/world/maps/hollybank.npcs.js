/**
 * hollybank.npcs.js — who is in Bram's house, and what everything in it says.   (P11 people · P12 words; layer of
 *                                                                               src/world/maps/hollybank.js)
 * Seeded by P05/P23 with the room so the first interior in the game is not an empty box; P11 owns it from here.
 *
 * WHO IS IN, BY ACT (WORLD-BIBLE §3, CANON §5):
 *   Act I   the cat on the hearthstone, and the kettle. Barty is out on the doorstep (puddlewick.npcs.js) and
 *           Papa is at the lane — this is the morning of B1: get up, search four things, take Papa his boots.
 *   Act II  BARTY, who has kept the fire in every night for ten years, and whose first line here is his second
 *           line from Act I. CANON §5 B12, word for word: "I said I'd be here." then "He died, little master."
 *   Act III the hearth lit, four chairs, and nobody in the big one.
 *
 * Facings are DEGREES here (the base map publishes radians); `spot()` converts.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function hollybankPeople(base = {}) {
  const fire = spot(base, 'hearthside', { x: -2.4, z: -2.1, facing: 180 });
  const hearth = spot(base, 'hearth', { x: -2.4, z: -3.42, facing: 180 });
  const chair = spot(base, 'chairA', { x: -2.95, z: 0.7, facing: 0 });

  return {
    npcs: [
      // ── Act I: the cat owns the hearthstone, and says so ──
      {
        id: 'hb-cat', name: 'Bramble', animal: 'cat', tint: 'ginger', voice: 'monster:1.38',
        x: hearth.x + 1.35, z: hearth.z + 0.95, facing: 200, idle: 'curl', radius: 0.5, when: '!ch2.start',
        script: [{ cycle: [
          'Prrrp.\n(This is her hearthstone. You are\nallowed to share it.)',
          '*Bramble stretches to twice her\nown length, and then some.*\n(Nothing in the world is wrong.)',
          'Mrrow.\n(She would like it noted that\nthe kettle started it.)',
        ] }],
      },
      // ── Act II: Barty, who kept the fire in (CANON §5 B12 — do not change these two lines) ──
      {
        id: 'hb-barty', name: 'Barty Marrow', char: 'barty', voice: 'barty', scale: 0.98, girth: 1.06,
        x: fire.x, z: fire.z, facing: fire.facing, idle: 'stand', radius: 0.6, when: 'ch2.start',
        script: [
          { first: [
            '*A small wide old man straightens\nup from the fire, with a ladle in\nhis belt where a dagger should be.*',
            'I said I\'d be here.{p}Ten years I said it, to an empty\nroom, twice a day, like a fool.',
            'Sit down, little master. The\nchair\'s still yours.{p}...He died, little master.',
            '*He does not look away while he\nsays it. Then he puts the kettle\non, because his hands need it.*',
            'I am not weeping. It is the\nonions.{p}There are no onions. It is still\nnot weeping.',
          ], again: [{ cycle: [
            'The fire\'s in. It has been in\nevery night. That was the one\nthing I could do.',
            'Your father used to stand exactly\nwhere you\'re standing and eat\nstraight out of the pot.',
            'Go up the stair when you\'re\nready. He left you things.',
          ] }] },
        ],
      },
      // ── Act III: somebody else's turn in the small chair ──
      {
        id: 'hb-linnet', name: 'Linnet', char: 'villager', variant: 'child', voice: 'high:1.4', wear: 'rust', scale: 1.0, girth: 0.97, hold: 'none',
        x: chair.x, z: chair.z + 0.9, facing: 340, idle: 'sit', radius: 0.5, when: 'ch3.sword_drawn',
        script: [{ cycle: [
          'Papa, the big chair is the best\nchair and nobody sits in it.{p}That is a waste of a chair.',
          '*She has put the wooden sword\nback in the chest, because it\nlives there.*',
          'Barty says you were smaller than\nme.{p}I do not believe Barty.',
        ] }],
      },
    ],
    lines: {
      // the kettle is the village's own joke about this house: the door outside says somebody is losing to it
      hearth: ['The fire is in.{wait:350}{n}It is always in.',
        'A kettle hangs over it, and the\nkettle is singing.',
        'Badly. It is singing badly, and\nit knows all the words.'],
      table: ['Three chairs. One is bigger than\nthe others.', 'Nobody sits in that one but him.',
        'There are crumbs on the table.\nThey are your crumbs.'],
      'big-chair': ["Father's chair.{n}It is the right size for him.",
        'You have measured yourself\nagainst the arm of it since you\ncould stand up.'],
      window: ['Out of the window: the chestnut\ntree, leaning over the well like\nit is listening.',
        'Somebody is already arguing down\nthere. It is only just afternoon.'],
      'loft-window': ['From up here you can see the\nwhole green, the chestnut, the\nchapel and half the Beck.',
        '"Home" is a very small word for\nall of that.'],
      boots: ['{gold}Papa\'s boots{/gold}, dried by the fire and\nleft exactly where he will fall\nover them.',
        'He will want these before he\nwants anything else.'],
      bed: ['Your bed, up under the roof,\nwhere the rain sounds best.',
        'It is made. You did not make it.'],
      'chest-sword': ['The chest at the foot of your\nbed.{wait:400}{n}Inside: a {gold}wooden sword{/gold}.',
        '"Father made it. Badly. On\npurpose."'],
    },
  };
}
