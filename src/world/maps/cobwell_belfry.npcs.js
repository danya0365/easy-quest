/**
 * cobwell_belfry.npcs.js — the belfry.                       (P23B people layer of cobwell_belfry.js)
 * Nobody up here but the thing in the frame, and Barnaby — who has come up, at last, after two hundred years of
 * not being able to, because somebody finally arrived and he is not letting them go up alone.
 */
export default function belfryPeople(base = {}) {
  const n = (base.spots && base.spots.nettle) || { x: -2.4, z: 2.0 };
  return {
    npcs: [
      {
        id: 'belfry-barnaby', name: 'Barnaby the Butler-shade', char: 'villager', variant: 'innkeeper',
        voice: 'low:0.9', wear: 'ink', scale: 1.04, girth: 0.94, ghost: true,
        x: n.x, z: n.z, facing: 200, idle: 'stand', radius: 0.44,
        script: [{
          first: ['I have not been up here.{p}In two hundred years. Not once.\nOne does not go up alone.'],
          again: [{ cycle: [
            'That is the groom. Or it is what\nis left when a man waits and\nnobody comes and he will not\nstop.',
            'It has never touched the girl.\nNot once, in all the times\nchildren have come up here.{p}Whatever else it is, it is\nstill somebody’s son.',
            'The rope is behind you. It has\nalways been behind you.',
            'When it is done, madam will want\nthe band. See that she gets the\nband.',
          ] }] }],
      },
    ],
    lines: {},
  };
}
