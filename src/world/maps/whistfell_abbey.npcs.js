/**
 * whistfell_abbey.npcs.js — grey Order hush before the undercroft.                (P11 + P25)
 */
export default function whistfellAbbeyPeople() {
  return {
    npcs: [
      {
        id: 'wf_porter', name: 'a grey porter', char: 'villager', variant: 'man',
        voice: 'low:0.85', wear: 'slate',
        x: 1.0, z: -2.5, facing: 200, idle: 'stand', radius: 0.7,
        script: [{
          first: [
            'Hush on the left. Hark on the right.\nThe undercroft is down.\nOne lantern is lit.',
          ],
          again: [{ cycle: [
            'A hundred dark glass lanterns.\nDo not light the wrong one.',
            'Queen Elowen put someone down\nfor a minute. It has been years.',
          ] }],
        }],
      },
    ],
  };
}
