/**
 * stone_garden.npcs.js — the stones remember.                                      (P11 + P25)
 */
export default function stoneGardenPeople() {
  return {
    npcs: [
      {
        id: 'sg_rowan', name: 'Rowan', char: 'villager', variant: 'boy', age: 'child',
        x: -1.5, z: -3.5, facing: 200, idle: 'stand', radius: 0.7,
        when: 'ch3.start',
        script: [{
          first: [
            'Hit the stone, Linnet said.\nKeep hitting it.\nI am watching the sky like Papa said.',
          ],
          again: [{ cycle: [
            'The stone chips.\nSomething moves under it.',
            'Mum is further in.\nPapa is this one.',
          ] }],
        }],
      },
    ],
  };
}
