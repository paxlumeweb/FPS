// Map registry. Maps are built lazily and cached (they are pure data).
import { buildDowntown } from './downtown.js';
import { buildFoundry } from './foundry.js';
import { buildDustline } from './dustline.js';

const builders = { downtown: buildDowntown, foundry: buildFoundry, dustline: buildDustline };
const cache = new Map();

export const MAP_LIST = [
  { id: 'downtown', name: 'Downtown', desc: 'Urban streets at golden hour. Long main street, tight alleys, a parking deck and two footbridges.' },
  { id: 'foundry', name: 'Foundry', desc: 'Industrial warehouse. Catwalk ring over a cluttered floor, container yards outside.' },
  { id: 'dustline', name: 'Dustline', desc: 'Desert compound. Open ground and rooftops outside, watch towers and tight rooms inside the walls.' },
];
export const MAP_IDS = MAP_LIST.map((m) => m.id);

export function getMap(id) {
  if (!builders[id]) id = MAP_IDS[0];
  if (!cache.has(id)) cache.set(id, builders[id]());
  return cache.get(id);
}
