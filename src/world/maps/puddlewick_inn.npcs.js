/**
 * puddlewick_inn.npcs.js — the common room's people.         (P11 people · P12 words; layer of puddlewick_inn.js)
 * Seeded by P05/P23 so the second real door in the village opens on somebody rather than on furniture.
 *
 * Nobody here is a second copy of anybody on the green: Mr Hammond keeps the door outside (puddlewick.npcs.js),
 * so behind the bar is his daughter Tansy, and the only customer at this hour is a drover who has been on the
 * road since Tuesday. Facings are DEGREES; the base map publishes radians and `spot()` converts.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function innPeople(base = {}) {
  const bar = spot(base, 'keeper', { x: -1.2, z: -2.35, facing: 0 });
  const fire = spot(base, 'fireside', { x: -3.6, z: 0.4, facing: 270 });
  const tables = (base && base.spots && base.spots.tables) || [{ x: 2.6, z: -1.6 }];

  return {
    npcs: [
      {
        id: 'inn-tansy', name: 'Tansy Hammond', char: 'villager', variant: 'innkeeper', voice: 'high:1.06',
        x: bar.x, z: bar.z, facing: bar.facing, idle: 'stand', radius: 0.5,
        script: [
          { first: ['Afternoon! Mind the step, every-\nbody minds the step, nobody\nremembers the step.'],
            again: [{ cycle: [
              'Bed and breakfast, six gold.{p}Breakfast on its own, two.\nBreakfast is the good bit.',
              'Dad stands out front all day\nsaying hello to people.{p}I do the actual inn.',
              'If you are going up the lane,\ntake a coat. The Beck makes its\nown weather.',
            ] }] },
        ],
      },
      {
        id: 'inn-drover', name: 'Ned Furlong', char: 'villager', variant: 'farmer', voice: 'low:0.82',
        x: tables[0].x - 0.95, z: tables[0].z + 0.1, facing: 90, idle: 'sit', radius: 0.4,
        script: [{ cycle: [
          'Forty sheep out of Saltmarrow and\nthirty-nine of them have opinions.',
          'I have been walking since Tuesday\nand my feet have written me a\nletter.',
          '*He shifts an acorn across the\ntable with one finger, very\nslowly, while nobody is looking.*',
        ] }],
      },
      {
        id: 'inn-bramble2', name: 'a very small boy', char: 'villager', variant: 'child', voice: 'high:1.5',
        x: fire.x, z: fire.z + 0.7, facing: fire.facing, idle: 'sit', radius: 0.4,
        script: [{ cycle: [
          'I am not under the table. That\nis a different boy.',
          'When I am big I am going to\nlive in the wood and be a bear.{p}My mum says I can.',
          'Shh. The fire is telling me\nsomething.',
        ] }],
      },
    ],
    lines: {
      bar: ['A plank counter worn to a shine\nby elbows.', 'Four tankards in a row, all of\nthem upside down, which is how\nyou know it is early.'],
      fire: ['Banked up high on a warm after-\nnoon, because an inn is not\nabout the weather.',
        'Somebody has toasted something\nhere and will deny it.'],
    },
  };
}
