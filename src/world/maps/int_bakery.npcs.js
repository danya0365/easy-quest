/**
 * int_bakery.npcs.js — who is in the bakery.                      (P06 seed; P11 owns people/lines from here on)
 *
 * Nan Puddifoot herself stands at her own door out on the green (puddlewick.npcs.js), so behind the counter is
 * her grandson, who is nine, covered in flour, and in charge. Nobody in here is a second copy of anybody outside.
 * Facings are DEGREES (0 = +z / south, 180 = north); the base map publishes radians and `spot()` converts.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function bakeryPeople(base = {}) {
  const keeper = spot(base, 'keeper', { x: 2.7, z: -0.9, facing: 0 });
  const bench = spot(base, 'bench', { x: -4.9, z: 1.5, facing: 90 });

  return {
    npcs: [
      {
        id: 'bk-fen', name: 'Fen Puddifoot', char: 'villager', variant: 'child', voice: 'high:1.42',
        wear: 'mustard', scale: 0.9, girth: 0.98, hold: 'basket',
        x: keeper.x, z: keeper.z, facing: keeper.facing, idle: 'sell', radius: 0.6,
        emotes: ['love'],
        script: [
          { first: [
            'Nan is at the door saying hello.\nI am doing the SHOP.',
            'That is the whole job. Saying\nhello is a different job.',
          ], again: [{ cycle: [
            'Three gold a loaf. I am not\nallowed to do deals.{p}...One gold off if you do not\ntell her I told you.',
            'I have been up since four. Ask\nme anything. I know everything\nnow.',
            'The oven has a name. It is\nMargaret. Do not laugh, she can\nhear you.',
            '*He wipes his hands on his apron,\nwhich makes both worse.*{p}There. Professional.',
          ] }] },
        ],
      },
      {
        id: 'bk-hen', name: 'a hen', animal: 'hen', tint: 'brown', voice: 'monster:1.26',
        x: bench.x + 1.3, z: bench.z + 1.6, facing: 200, idle: 'hen', radius: 1.4,
        script: [{ cycle: [
          'Bok.\n(She is not supposed to be in\nhere and she knows it.)',
          '*The hen looks at the flour, then\nat you, then at the flour.*\n(You have seen nothing.)',
        ] }],
      },
      {
        // the cat asleep on the warm flags by the oven. P11's animal, not a static prop, so she breathes,
        // grooms, strolls and can be talked to — a merged mesh of a curled cat reads as an orange blob.
        id: 'bk-dumpling', name: 'Dumpling', animal: 'cat', tint: 'ginger', voice: 'monster:1.22',
        x: -1.5, z: -3.2, facing: 120, idle: 'curl', radius: 1.2,
        script: [{ cycle: [
          'Mrrrp.\n(The flags in front of the oven\nare the warmest thing in\nPuddlewick and she got here\nfirst.)',
          '*Dumpling opens one eye, decides\nyou do not smell of fish, and\nshuts it again.*',
          'Prrp.\n(She has never caught a mouse.\nShe has never needed to. She\nsimply looks at them.)',
        ] }],
      },
    ],
    lines: {},
  };
}
