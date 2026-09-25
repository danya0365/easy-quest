/**
 * gogglestone_caves.npcs.js — after the golden beast, the echo stays.             (P11 + P25)
 */
export default function gogglestoneCavesPeople() {
  return {
    npcs: [
      {
        id: 'gg_echo', name: 'a quarry echo', char: 'villager', variant: 'granny',
        voice: 'high:0.85', wear: 'clay',
        x: 0.5, z: -3.0, facing: 180, idle: 'stand', radius: 0.65,
        script: [{
          first: [
            'The beast left a warm scrape.\nDigby would have sat in it.\nBobble already did.',
          ],
          again: [{ cycle: [
            'Hollybank is through the bright mouth.\nHome is louder than it used to be.',
            'Coins under claw-marks are honest.\nThe beast never counted them.',
          ] }],
        }],
      },
    ],
  };
}
