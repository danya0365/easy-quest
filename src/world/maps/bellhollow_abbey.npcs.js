/**
 * bellhollow_abbey.npcs.js — kind abbey folk under an empty bell.                 (P11 + P25)
 */
export default function bellhollowAbbeyPeople() {
  return {
    npcs: [
      {
        id: 'bh_novice', name: 'Novice Lark', char: 'villager', variant: 'nun',
        voice: 'high:1.1', wear: 'sky',
        x: -1.5, z: -3.0, facing: 180, idle: 'stand', radius: 0.65,
        script: [{
          first: [
            'The bell is elsewhere.\nThe frame is still honest.\nLook up when you are ready.',
          ],
          again: [{ cycle: [
            'Save here. Heal here.\nThe Cloud Stair is not a metaphor.',
            'Whistfell is past the grey wind.\nMind Hush & Hark on the stairs.',
          ] }],
        }],
      },
    ],
  };
}
