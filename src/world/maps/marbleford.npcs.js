/**
 * marbleford.npcs.js — quay gossip while Rudolpho’s lists wait.                   (P11 + P25)
 */
export default function marblefordPeople() {
  return {
    npcs: [
      {
        id: 'mf_porter', name: 'Quay Porter Nell', char: 'villager', variant: 'merchant',
        voice: 'high:1.05', wear: 'sky',
        x: 1.2, z: 2.0, facing: 200, idle: 'stand', radius: 0.7,
        script: [{
          first: [
            'Packet boat’s on time.\nRudolpho’s lists are not.\nMind the cliff path.',
          ],
          again: [{ cycle: [
            'Fairweather Hall will not let mud\npast the latch. Wipe your boots twice.',
            'The chapel bells practise every hour.\nBarty cries on the half-hour.',
          ] }],
        }],
      },
      {
        id: 'mf_boy', name: 'a boy with a list', char: 'villager', variant: 'child',
        voice: 'high:1.35', wear: 'teal',
        x: -2.0, z: -1.5, facing: 160, idle: 'stand', radius: 0.55,
        script: [{
          first: [
            'Condition three is a pearl.\nCondition four is a secret.\nI am only allowed to say three.',
          ],
          again: [{ cycle: [
            'Do not ask me about four.\nI will invent something worse.',
          ] }],
        }],
      },
    ],
  };
}
