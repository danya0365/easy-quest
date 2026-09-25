/** grey_ruins.npcs.js — quiet until B9; a watcher keeps the stones company.       (P11) */
export default function greyRuinsPeople() {
  return {
    npcs: [
      {
        id: 'gr_watcher', name: 'a stone-watcher', char: 'villager', variant: 'granny',
        voice: 'high:0.88', wear: 'slate',
        x: -1.5, z: -2.0, facing: 200, idle: 'stand', radius: 0.65,
        script: [{
          first: [
            'The grey stones remember loud things.\nSpeak softly. They answer in dust.',
          ],
          again: [{ cycle: [
            'Pip used to run between the arches.\nThe arches still lean the same way.',
            'If a ruin sighs, it is only wind.\nUsually.',
          ] }],
        }],
      },
    ],
  };
}
