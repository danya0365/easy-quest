/** highfeather.npcs.js */
export default function highfeatherPeople() {
  return {
    npcs: [{
      id: 'hf_polite', name: 'a polite cloud', char: 'villager', variant: 'child',
      voice: 'high:1.2', wear: 'sky',
      x: 0.5, z: -3.0, facing: 180, idle: 'stand', radius: 0.55,
      script: [{ first: ['The bird-dragon says hello\nby not eating you.\nThat is the greeting.'],
        again: [{ cycle: ['The cloak is woven of sky.\nDo not sneeze into it.'] }] }],
    }],
  };
}
