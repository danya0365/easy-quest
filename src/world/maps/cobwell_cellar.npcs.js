/**
 * cobwell_cellar.npcs.js — nobody lives in the cellar.       (P23B people layer of cobwell_cellar.js)
 * That is the point of the cellar. The Chandelier Cat comes down here though, because cats go where you do
 * not want them, and it is the only warm thing in the room.
 */
export default function cellarPeople() {
  return {
    npcs: [
      {
        id: 'cellar-cat', name: 'the Chandelier Cat', animal: 'cat', tint: 'white', voice: 'monster:1.36',
        ghost: true,
        x: 3.4, z: 0.4, facing: 250, idle: 'curl', wander: 1.4, radius: 1.2,
        script: [{ cycle: [
          'Mrrp.',
          '(It is sitting between you and\nthe roots. It does this every\ntime and it is not an accident.)',
          '(It looks at the roots. It looks\nat you. It does not move.)',
        ] }],
      },
    ],
    lines: {},
  };
}
