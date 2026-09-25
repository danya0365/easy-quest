/**
 * fairweather_hall.npcs.js — Sera (grown) and the lists.                           (P11 + P25)
 */
export default function fairweatherHallPeople() {
  return {
    npcs: [
      {
        id: 'fh_sera', name: 'Sera', char: 'sera', age: 'adult', voice: 'sera',
        x: -1.5, z: -4.0, facing: 200, idle: 'stand', radius: 0.7,
        when: 'ch2.willow_grown',
        script: [{
          first: [
            'Rudolpho has four conditions.\nI have numbered them.\nYou will hate number three.',
          ],
          again: [{ cycle: [
            'The Tide Pearl is in the grotto\nunder the cliffs.',
            'Do not let Willow choose your\nclothes for the wedding. I mean it.',
          ] }],
        }],
      },
    ],
  };
}
