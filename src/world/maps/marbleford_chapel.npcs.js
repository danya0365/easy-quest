/** marbleford_chapel.npcs.js — the wedding waiting room. */
export default function marblefordChapelPeople() {
  return {
    npcs: [
      {
        id: 'mc_sexton', name: 'Sexton Sootbell', char: 'villager', variant: 'man',
        x: 0.5, z: -3.5, facing: 180, idle: 'stand', radius: 0.7,
        when: 'ch2.bride',
        script: [{
          first: [
            'Everybody is waiting.\nBarty is already crying.\nI have the rings. Probably.',
          ],
          again: [{ cycle: [
            'The bells are practising.\nThey know one tune.',
            'Do not trip on the way in.\nI mean that kindly.',
          ] }],
        }],
      },
    ],
  };
}
