/**
 * sighing_grotto.npcs.js — tide talk while the pearl sulks.                       (P11 + P25)
 */
export default function sighingGrottoPeople() {
  return {
    npcs: [
      {
        id: 'sg_diver', name: 'Old Brine', char: 'villager', variant: 'farmer',
        voice: 'low:0.78', wear: 'moss',
        x: -1.2, z: -2.5, facing: 200, idle: 'stand', radius: 0.7,
        script: [{
          first: [
            'The pearl is on the cold shelf.\nIt sighs when you look at it.\nRudolpho will not notice.',
          ],
          again: [{ cycle: [
            'Tide pools keep coins for luck.\nLuck keeps the coins for itself.',
            'Do not apologise to the sea.\nIt is already disappointed.',
          ] }],
        }],
      },
    ],
  };
}
