/**
 * contented_herring / saltmarrow already have Willow — add grown Willow flag line on saltmarrow if needed.
 * ambergarde_keep: a courtier stub.
 */
export default function ambergardeKeepPeople() {
  return {
    npcs: [
      {
        id: 'ak_steward', name: 'a steward', char: 'villager', variant: 'man',
        x: 1.0, z: -3.0, facing: 180, idle: 'stand', radius: 0.7,
        when: 'ch2.married',
        script: [{
          first: [
            'The keep is ready for you.\nThe sword is not.\nThat is someone else’s problem.',
          ],
          again: [{ cycle: [
            'The court kneels before it knows\nyour name. Practice looking surprised.',
            'Rowan and Linnet are… lively.',
          ] }],
        }],
      },
    ],
  };
}
