/** aldenmoor.npcs.js — travellers (stub). */
export default function aldenmoorPeople() {
  return {
    npcs: [
      {
        id: 'moor-walker', name: 'a walker', char: 'villager', variant: 'farmer', voice: 'mid:1.0',
        wear: 'moss', x: -2.0, z: 2.0, facing: 90, idle: 'stand', radius: 0.45,
        script: [{ cycle: [
          'Big place. Bring a sandwich.',
          'If you see a copper spire, you\nare nearly at Coddleston.',
        ] }],
      },
    ],
  };
}
