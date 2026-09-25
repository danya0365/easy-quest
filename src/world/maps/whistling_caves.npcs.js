/**
 * whistling_caves.npcs.js — Bobble waited.                                              (P11 + P25)
 */
export default function whistlingCavesPeople() {
  return {
    npcs: [
      {
        id: 'wc_bobble', name: 'Bobble', monster: 'gloop', voice: 'bobble',
        x: 0.2, z: -4.5, facing: 180, idle: 'stand', radius: 0.8,
        when: '!party.bobble_return',
        script: [{
          first: [
            'Bobble packed a lunch.\nBobble packed it ten years ago.\nIt is mostly philosophy now.',
            'Bobble sat on this rock.\nBobble did not move.\nBobble is very good at sitting.',
          ],
          again: [{ cycle: [
            'Bobble is still here.\nBobble practiced.',
            'The lunch is philosophical.\nBobble recommends not eating it.',
          ] }],
        }],
      },
    ],
  };
}
