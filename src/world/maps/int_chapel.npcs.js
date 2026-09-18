/**
 * int_chapel.npcs.js — who is in the chapel.                      (P06 seed; P11 owns people/lines from here on)
 *
 * Sister Candlewick is out on the green (puddlewick.npcs.js), so inside is the man who keeps the candles and has
 * opinions about draughts, and one very small girl practising for something.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function chapelPeople(base = {}) {
  const deacon = spot(base, 'deacon', { x: -1.5, z: -4.6, facing: 90 });
  const pews = spot(base, 'pews', { x: 0, z: -1.6, facing: 180 });

  return {
    npcs: [
      {
        id: 'ch-tallow', name: 'Brother Tallow', char: 'villager', variant: 'nun', voice: 'low:0.9',
        wear: 'ink', scale: 1.03, girth: 1.02, hold: 'none',
        x: deacon.x, z: deacon.z, facing: deacon.facing, idle: 'wander', radius: 1.6,
        script: [
          { first: [
            'Ah. Come in, come in, and shut\nthe — thank you.',
            'Sit anywhere. Nobody owns a pew.\nSeveral people think they do.',
          ], again: [{ cycle: [
            'Saint Alden was kind to a bird.\nThat is the whole of it.{p}People want more. There is\nnot more.',
            'Put a coin in the box if you\nhave one. If you have not, put\nin a good intention. They\ncount.',
            'The candles are mine. The bell\nis the village\'s. The draught\nis everybody\'s.',
            'Your father comes in here. Not\nto pray. He sits at the back and\nlooks at the ceiling.{p}That is praying. I have not\ntold him.',
          ] }] },
        ],
      },
      {
        id: 'ch-piper', name: 'a small girl', char: 'villager', variant: 'child', voice: 'high:1.48',
        wear: 'sky', scale: 0.86, girth: 0.93, hold: 'none',
        x: pews.x + 2.3, z: pews.z + 1.1, facing: 175, idle: 'sit', radius: 0.4,
        emotes: ['love'],
        script: [{ cycle: [
          'I am practising being quiet.{p}I am the best at it in my\nfamily. That is not a high bar.',
          'There is a beetle in the third\nhymn book. He has been in there\nsince Sunday.{p}I think it is his book now.',
          'If you ring the bell you get\nshouted at by four people at\nonce.{p}...It is worth it once.',
        ] }],
      },
    ],
    lines: {},
  };
}
