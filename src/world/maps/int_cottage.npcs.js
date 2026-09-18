/**
 * int_cottage.npcs.js — who is in the Pottles' cottage.           (P06 seed; P11 owns people/lines from here on)
 *
 * Mrs Pottle is out on the green telling everybody everything (puddlewick.npcs.js). Mr Pottle is in here, in the
 * chair, asleep, and talks in his sleep, which is the joke.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function cottagePeople(base = {}) {
  const sleeper = spot(base, 'sleeper', { x: 2.2, z: -2.1, facing: 200 });

  return {
    npcs: [
      {
        id: 'ct-pottle', name: 'Mr Pottle', char: 'villager', variant: 'farmer', voice: 'low:0.78',
        wear: 'teal', scale: 1.0, girth: 1.14, hold: 'none',
        x: sleeper.x, z: sleeper.z + 0.12, facing: sleeper.facing, idle: 'sit', radius: 0.25, fixed: true,
        script: [
          { first: [
            '*Mr Pottle is asleep in the\nchair with his mouth open.*',
            '"...mm. Yes. Entirely agree."',
            '*He has not woken up. He does\nthis. The village finds it\nuseful.*',
          ], again: [{ cycle: [
            '"...no, the OTHER field."',
            '"...tell her I said it first."',
            '*He shifts, and one boot falls\noff.*\n"...that was on purpose."',
            '"...soup."{p}*A long, contented pause.*\n"...good soup."',
          ] }] },
        ],
      },
      {
        id: 'ct-girl', name: 'a girl doing her letters', char: 'villager', variant: 'child', voice: 'high:1.36',
        wear: 'sky', scale: 0.92, girth: 0.95, hold: 'none',
        x: -1.4, z: 0.3, facing: 170, idle: 'sit', radius: 0.4,
        script: [{ cycle: [
          'I am doing my letters. I am on\nP. P is a hard one.{p}It is just a B that has given\nup.',
          'That is Grandad. He is not dead,\nhe is asleep.{p}We check. Sometimes we check\ntwice.',
          'Gran is out. Gran is always out.\nGran is out at people.',
        ] }],
      },
      {
        id: 'ct-marmalade', name: 'Marmalade', animal: 'cat', tint: 'ginger', voice: 'monster:1.28',
        x: 1.2, z: -3.0, facing: 210, idle: 'curl', radius: 1.2,
        script: [{ cycle: [
          'Mrrp.\n(She sleeps here because it is\nwarm and because he snores in\ntime, which she finds soothing.)',
          '*Marmalade stretches one leg out\nto an implausible length and\nholds it there.*',
        ] }],
      },
    ],
    lines: {},
  };
}
