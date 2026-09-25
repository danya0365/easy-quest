/**
 * quiet_quarry.npcs.js — Bertie and Digby keep you company in the works.              (P11 + P25)
 * Cleared by story when ch2.quarry_escape is set (they leave with you).
 */
export default function quietQuarryPeople() {
  return {
    npcs: [
      {
        id: 'qq_bertie', name: 'Bertie', char: 'villager', variant: 'boy', age: 'child',
        x: 1.2, z: -3.0, facing: 180, idle: 'stand', radius: 0.7,
        when: '!ch2.quarry_escape',
        script: [{
          first: [
            'Chore one: barrows.\nChore two: stones.\nChore three: do not look at the gate.',
            'I have been counting the mornings.\nThree thousand, six hundred and\nfifty-two. Give or take a birthday.',
          ],
          again: [{ cycle: [
            'The wall Digby is digging at\nis softer than it looks.',
            'Do not look at the gate.\nI mean it. Looking is chore four.',
          ] }],
        }],
      },
      {
        id: 'qq_digby', name: 'Digby', monster: 'barrowmole',
        x: -2.5, z: -5.5, facing: 40, idle: 'stand', radius: 0.9,
        when: '!ch2.quarry_escape',
        script: [{
          first: [
            'Digby dug.\nDigby dug a long time.\nThe wall is soft now.',
          ],
          again: [{ cycle: [
            'Digby likes nods.\nDigby dug more.',
            'Soft wall. Soft wall.\nDigby knows soft walls.',
          ] }],
        }],
      },
    ],
  };
}
