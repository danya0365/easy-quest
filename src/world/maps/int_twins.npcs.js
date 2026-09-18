/**
 * int_twins.npcs.js — who is in the twins' house.                 (P06 seed; P11 owns people/lines from here on)
 * Dot and Bel are out on the green being It. Their mother is in here, sewing, at the end of her patience and
 * enjoying it.
 */
const DEG = 180 / Math.PI;
function spot(base, name, fallback) {
  const s = base && base.spots && base.spots[name];
  if (s && Number.isFinite(+s.x)) return { x: +s.x, z: +s.z, facing: Number.isFinite(+s.facing) ? +s.facing * DEG : (fallback && fallback.facing) || 0 };
  return fallback || { x: 0, z: 0, facing: 0 };
}

export default function twinsPeople(base = {}) {
  const mother = spot(base, 'mother', { x: -1.2, z: 1.6, facing: 60 });

  return {
    npcs: [
      {
        id: 'tw-pipkin', name: 'Mrs Pipkin', char: 'villager', variant: 'granny', voice: 'high:0.92',
        wear: 'berry', scale: 1.0, girth: 1.08, hold: 'none',
        x: mother.x, z: mother.z, facing: mother.facing, idle: 'sit', radius: 0.8,
        script: [
          { first: [
            'Oh — hello, love. Have you seen\nmy two?',
            'Do not tell me. I do not want to\nknow. I want to sit down for\nnine more minutes.',
          ], again: [{ cycle: [
            'They have a game. It has rules.\nThe rules change.{p}I have asked. I have been told.\nI am none the wiser.',
            'Whose blanket is whose changes\nevery Tuesday and I have stopped\nintervening.',
            'There is chalk on my floor.\nThere is chalk on everything.\nThere is chalk on the CAT.',
            'You are a good sort. If you see\nthem, tell them their tea exists.{p}Not that it is ready. That it\nexists.',
          ] }] },
        ],
      },
      {
        id: 'tw-chalk', name: 'Chalk', animal: 'cat', tint: 'grey', voice: 'monster:1.4',
        x: -2.4, z: -2.6, facing: 200, idle: 'curl', radius: 1.1,
        script: [{ cycle: [
          'Mrrp.\n(There is chalk on her. She has\nbeen It. She does not know what\nthat means and it happened\nanyway.)',
          '*Chalk yawns enormously and then\nlooks embarrassed about it.*',
        ] }],
      },
    ],
    lines: {},
  };
}
