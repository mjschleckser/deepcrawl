/**
 * Wiring a campaign: a dungeon plan, a party, and the provider that builds a floor
 * the first time the party would arrive on it.
 *
 * This is the seam between generation and exploration. Exploration is handed a
 * function that answers "give me floor X" and never learns that a generator exists.
 */

import { setTileLight, LightLevel } from '../sim/floor.js';
import { createLightSource } from '../sim/light.js';
import { createExploration, generateFloor, generatePlan, resolveArrival } from '../sim/exploration.js';

export function createCampaign({ seed = Date.now() >>> 0 } = {}) {
  const plan = generatePlan({ seed });
  const descriptors = new Map(plan.floors.map((f) => [f.id, f]));

  // Floors are built lazily and cached by exploration, so a campaign never pays to
  // build levels nobody visits.
  const floorProvider = (id) => {
    const descriptor = descriptors.get(id);
    if (!descriptor) throw new Error(`no floor in the plan with id ${id}`);
    return generateFloor({
      id: descriptor.id,
      seed: descriptor.seed,
      archetype: descriptor.archetype,
      depthLabel: descriptor.depthLabel,
      links: descriptor.links,
    });
  };

  const entrance = floorProvider(plan.entrance.floorId);

  const state = createExploration({
    floors: [entrance],
    floorProvider,
    floorId: entrance.id,
    // Placed on the arrival tile the entrance floor's own rule resolves to.
    tile: { x: 0, y: 0 },
    lightSources: [
      createLightSource({ id: 'torch-1', brightRadius: 1, dimRadius: 4, remainingTicks: 400, lit: true }),
      createLightSource({ id: 'torch-2', brightRadius: 1, dimRadius: 4, remainingTicks: 400 }),
      createLightSource({ id: 'torch-3', brightRadius: 1, dimRadius: 4, remainingTicks: 400 }),
    ],
  });

  const start = resolveArrival(state, plan.entrance);
  state.party.tile = { x: start.x, y: start.y };
  // The way out is always visible, so losing every torch is a crisis rather than a
  // dead end.
  // @spec GEN-PLACE-006
  setTileLight(entrance, start.x, start.y, LightLevel.DIM);

  return { state, plan, floorProvider };
}
