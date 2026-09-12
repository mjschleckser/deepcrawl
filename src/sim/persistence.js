/**
 * Saving and restoring exploration state.
 *
 * Everything is saved, including floors the party is not standing on: a floor is
 * generated once and never generated again, so its layout and the discovery record
 * laid over it have to survive the save that outlives the session.
 */

import { createFloor } from './floor.js';

export const SAVE_VERSION = 1;

/**
 * Discovery is one bit per tile. Floors accumulate for the life of a campaign and
 * every tile of every one of them carries this flag, so it is the one field worth
 * packing rather than storing as objects.
 *
 * @spec EXPLORE-SAVE-006
 */
function packDiscovery(width, height, keys) {
  const bytes = new Uint8Array(Math.ceil((width * height) / 8));
  for (const key of keys) {
    const [x, y] = key.split(',').map(Number);
    const bit = y * width + x;
    bytes[bit >> 3] |= 1 << (bit & 7);
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function unpackDiscovery(width, height, encoded) {
  const binary = atob(encoded);
  const keys = new Set();
  for (let bit = 0; bit < width * height; bit++) {
    const byte = binary.charCodeAt(bit >> 3);
    if (byte & (1 << (bit & 7))) keys.add(`${bit % width},${Math.floor(bit / width)}`);
  }
  return keys;
}

/**
 * @spec EXPLORE-SAVE-001
 * @spec EXPLORE-SAVE-003
 * @spec EXPLORE-SAVE-004
 * @spec EXPLORE-SAVE-005
 */
export function serialize(state) {
  const floors = [];
  const discovery = {};
  const knownTraps = {};

  for (const [id, floor] of state.floors) {
    floors.push({
      id,
      width: floor.width,
      height: floor.height,
      depthLabel: floor.depthLabel,
      horizontalEdges: floor.horizontalEdges,
      verticalEdges: floor.verticalEdges,
      tiles: floor.tiles,
    });
    discovery[id] = packDiscovery(
      floor.width,
      floor.height,
      state.discoveredTiles.get(id) ?? new Set(),
    );
    const traps = state.knownTraps.get(id);
    if (traps && traps.size > 0) knownTraps[id] = [...traps];
  }

  return {
    version: SAVE_VERSION,
    ticks: state.ticks,
    party: { ...state.party, tile: { ...state.party.tile } },
    keys: [...state.keys],
    floors,
    discovery,
    knownTraps,
    // Secret doors the party has found, and the edges sight has recorded.
    discoveredEdges: [...state.discoveredEdges],
    departedAt: Object.fromEntries(state.departedAt),
    lightSources: state.lightSources.map((source) => ({ ...source })),
    roamers: state.roamers.map((roamer) => ({ ...roamer })),
    restockMinElapsedTicks: state.restockMinElapsedTicks,
    dousedSourceId: state.dousedSourceId ?? null,
  };
}

/**
 * Rebuild a campaign from a save. Floors are restored exactly as they were laid down,
 * never regenerated from a seed, so a party's own record of a floor still matches it.
 *
 * @spec EXPLORE-SAVE-001
 * @spec EXPLORE-SAVE-002
 */
export function restore(saved, createExploration) {
  const floors = saved.floors.map((data) => {
    const floor = createFloor({
      id: data.id,
      width: data.width,
      height: data.height,
      depthLabel: data.depthLabel,
    });
    floor.horizontalEdges = data.horizontalEdges.map((edge) => ({ ...edge }));
    floor.verticalEdges = data.verticalEdges.map((edge) => ({ ...edge }));
    floor.tiles = data.tiles.map((tile) => ({ ...tile }));
    return floor;
  });

  const state = createExploration({
    floors,
    floorId: saved.party.floorId,
    tile: saved.party.tile,
    facing: saved.party.facing,
    keys: saved.keys,
    lightSources: saved.lightSources,
    roamers: saved.roamers,
    restockMinElapsedTicks: saved.restockMinElapsedTicks,
  });

  state._advanceTicks(saved.ticks);
  state.discoveredEdges = new Set(saved.discoveredEdges);
  state.dousedSourceId = saved.dousedSourceId;
  state.departedAt = new Map(Object.entries(saved.departedAt));

  for (const floor of floors) {
    state.discoveredTiles.set(
      floor.id,
      unpackDiscovery(floor.width, floor.height, saved.discovery[floor.id]),
    );
    if (saved.knownTraps[floor.id]) {
      state.knownTraps.set(floor.id, new Set(saved.knownTraps[floor.id]));
    }
  }

  // A restored source keeps the lit flag it was saved with, rather than being
  // re-derived; the party picks up exactly where it put the game down.
  state.lightSources.forEach((source, i) => {
    source.lit = saved.lightSources[i].lit;
  });

  return state;
}
