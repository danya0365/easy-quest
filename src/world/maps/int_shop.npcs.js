/**
 * int_shop.npcs.js — who is in the shop.                          (P06 seed; P11 owns people/lines from here on)
 *
 * Mr Hammond stands out on the green all day taking a sword off a wall for boys who cannot afford it
 * (puddlewick.npcs.js). Inside, his wife runs the actual shop, and has views about that arrangement.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function shopPeople(base = {}) {
  const keeper = spot(base, 'keeper', { x: 0.2, z: -2.8, facing: 0 });
  const bench = spot(base, 'bench', { x: 4.6, z: -2.2, facing: 270 });

  return {
    npcs: [
      {
        id: 'sh-ivy', name: 'Ivy Hammond', char: 'villager', variant: 'merchant', voice: 'high:0.94',
        wear: 'slate', scale: 1.0, girth: 1.06, hold: 'jar',
        x: keeper.x, z: keeper.z, facing: keeper.facing, idle: 'sell', radius: 0.7,
        script: [
          { first: [
            'Morning. He is outside being\nimpressive at children.',
            'I am in here being the shop.\nWhat do you need?',
          ], again: [{ cycle: [
            'Nails, oil, rope, cloth, hooks.\nThat is the shop. The sword is\nscenery.',
            'He has sold that sword eleven\ntimes and never once handed it\nover.{p}I have stopped correcting him.',
            'Your father buys rope. Nothing\nbut rope. Never says what for.',
            'If you break something of\nsomebody else\'s, come here\nfirst. Not last. FIRST.',
          ] }] },
        ],
      },
      {
        id: 'sh-boy', name: 'a boy counting nails', char: 'villager', variant: 'child', voice: 'high:1.3',
        wear: 'rust', scale: 0.95, girth: 0.96, hold: 'none',
        x: bench.x - 1.6, z: bench.z + 1.5, facing: 300, idle: 'stand', radius: 0.5,
        script: [{ cycle: [
          'Forty-one. Forty-two. Forty—{p}...I have lost it. Go away.\nNo, stay. Help.',
          'A dozen is twelve. I know that\nbit. It is the rest.',
          '*He puts one nail in his pocket,\nvery slowly, looking at the\nceiling.*',
        ] }],
      },
    ],
    lines: {},
  };
}
