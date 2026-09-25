/**
 * quiet_deep.npcs.js — stone library hush before the unravelling.                 (P11 + P25)
 */
export default function quietDeepPeople() {
  return {
    npcs: [
      {
        id: 'qd_librarian', name: 'a stone librarian', char: 'villager', variant: 'granny',
        voice: 'high:0.9', wear: 'clay',
        x: -0.8, z: -3.5, facing: 180, idle: 'stand', radius: 0.65,
        script: [{
          first: [
            'People sleep in the shelves.\nBishop Mortmain is sadder than he looks.\nCut the dream. Keep the man.',
          ],
          again: [{ cycle: [
            'Rowan would say: you could have\njust been sad. Everyone else is.',
            'The Larksteel Sword is for dreams.\nOrdinary old men go free.',
          ] }],
        }],
      },
    ],
  };
}
