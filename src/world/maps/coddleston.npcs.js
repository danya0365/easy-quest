/** coddleston.npcs.js — people of Coddleston (stub; P11 fills later). */
export default function coddlestonPeople() {
  return {
    npcs: [
      {
        id: 'cod-guard', name: 'Gate-guard Midge', char: 'villager', variant: 'farmer', voice: 'low:0.9',
        wear: 'slate', scale: 1.05, x: 1.2, z: 9.0, facing: 180, idle: 'stand', radius: 0.46,
        script: [{ cycle: [
          'Birthday today. Try not to\nlook like a kidnapper.',
          'The prince is somewhere in the\nyard. He is small and loud.',
        ] }],
      },
    ],
  };
}
