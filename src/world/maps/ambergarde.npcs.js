/**
 * ambergarde.npcs.js — headland folk before the keep kneels.                      (P11 + P25)
 */
export default function ambergardePeople() {
  return {
    npcs: [
      {
        id: 'ag_watch', name: 'Headland Watch', char: 'villager', variant: 'farmer',
        voice: 'low:0.9', wear: 'slate',
        x: -1.5, z: 1.0, facing: 180, idle: 'stand', radius: 0.7,
        script: [{
          first: [
            'Ambergarde Keep is up the crest.\nThe sword is already late for you.',
          ],
          again: [{ cycle: [
            'The Stone Garden is behind the keep.\nChip softly. The stones listen.',
            'Nine years is a long wait for a chip.\nTake your time. They did.',
          ] }],
        }],
      },
      {
        id: 'ag_lass', name: 'Crest Lass', char: 'villager', variant: 'child',
        voice: 'high:1.3', wear: 'plum',
        x: 2.2, z: -2.0, facing: 220, idle: 'stand', radius: 0.55,
        script: [{
          first: [
            'If you kneel at the keep,\nthe court will kneel back.\nIt is very confusing.',
          ],
          again: [{ cycle: [
            'Rowan says the sword will not come.\nLinnet says it is shy.',
          ] }],
        }],
      },
    ],
  };
}
