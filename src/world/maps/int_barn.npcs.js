/**
 * int_barn.npcs.js — who is in the barn.                          (P06 seed; P11 owns people/lines from here on)
 *
 * Barty is on the cottage doorstep and Papa is at the lane, so the barn has the old farmhand who does the
 * animals, and a hen who has laid somewhere she should not have.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function barnPeople(base = {}) {
  const hand = spot(base, 'hand', { x: -0.6, z: 2.2, facing: 340 });
  const hay = spot(base, 'hay', { x: 4.4, z: -3.2, facing: 180 });

  return {
    npcs: [
      {
        id: 'bn-dodder', name: 'Old Dodder', char: 'villager', variant: 'farmer', voice: 'low:0.76',
        wear: 'moss', scale: 0.96, girth: 1.1, hold: 'none',
        x: hand.x, z: hand.z, facing: hand.facing, idle: 'sit', radius: 1.0,
        script: [
          { first: [
            'Mind the fork, young sir. It\nminds nobody.',
            'I do the beasts. Your father\ndoes the roads. Everybody has\na thing.',
          ], again: [{ cycle: [
            'Parsnip is out with the wagon.\nHe knows the way better than\nyour father does.{p}Do not tell him I said so.\nEither of them.',
            'Forty years mending harness.\nMy hands have gone the shape\nof a buckle.',
            'There is a hen laying somewhere\nin here and she will not tell\nme where.{p}We are at war and she is\nwinning.',
            '*He pulls a straw out of the\nbale, looks at it, and puts it\nback in a slightly better\nplace.*',
          ] }] },
        ],
      },
      {
        id: 'bn-hen', name: 'a hen with a secret', animal: 'hen', tint: 'speckled', voice: 'monster:1.3',
        x: hay.x - 1.8, z: hay.z + 1.9, facing: 120, idle: 'hen', radius: 1.5,
        script: [{ cycle: [
          'Bok.\n(She is standing on something.\nShe will stand on it all day if\nshe has to.)',
          '*The hen takes one step to the\nleft, then immediately back.*\n(Nothing here. Move along.)',
        ] }],
      },
      {
        // the barn cat, asleep in the warm patch: P11's animal, so it breathes, grooms and can be talked to
        id: 'bn-tabby', name: 'Nutmeg', animal: 'cat', tint: 'tan', voice: 'monster:1.2',
        x: 3.0, z: -1.6, facing: 150, idle: 'curl', radius: 1.2,
        script: [{ cycle: [
          'Mrrrow.\n(She has the warm patch. There is\none warm patch. It is hers.)',
          '*Nutmeg rolls over into the exact\nspot you were about to put your\nfoot.*\n(Your problem now.)',
          'Prrp.\n(She knows where the hen is\nlaying. She is not telling\neither of you.)',
        ] }],
      },
    ],
    lines: {},
  };
}
