/** contented_herring.npcs.js — Dodd behind the bar; parrot later. */
export default function herringPeople(base = {}) {
  const bar = (base.spots && base.spots.bar) || { x: -3.2, z: -1.0 };
  return {
    npcs: [
      {
        id: 'dodd-inn', name: 'Dodd Pye', char: 'villager', variant: 'innkeeper', voice: 'low:0.88',
        wear: 'clay', scale: 1.06, girth: 1.08,
        x: bar.x + 0.4, z: bar.z - 0.8, facing: 0, idle: 'stand', radius: 0.5,
        script: [{ cycle: [
          'Twelve gold a bed. Breakfast if\nyou beat the bread.',
          'Willow\'s outside starting a\nfight she will finish. Go say\nhello carefully.',
          'The parrot is content. That is\nthe whole of our philosophy.',
        ] }],
      },
    ],
  };
}
