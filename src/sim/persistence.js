/**
 * Saving and restoring exploration state.
 *
 * Everything is saved, including floors the party is not standing on: a floor is
 * generated once and never generated again, so its layout and the discovery record
 * laid over it have to survive the save that outlives the session.
 */

import { createFloor } from './floor.js';
import { makeRng } from './rng.js';

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
 */
export function serialize(state) {
  const floors = [];
  const discovery = {};
  // @spec EXPLORE-SAVE-008
  const openedChests = {};

  for (const [id, floor] of state.floors) {
    floors.push({
      id,
      width: floor.width,
      height: floor.height,
      depthLabel: floor.depthLabel,
      horizontalEdges: floor.horizontalEdges,
      verticalEdges: floor.verticalEdges,
      tiles: floor.tiles,
      rooms: floor.rooms ?? null,
      seed: floor.seed ?? null,
    });
    discovery[id] = packDiscovery(
      floor.width,
      floor.height,
      state.discoveredTiles.get(id) ?? new Set(),
    );
    const opened = state.openedChests?.get(id);
    if (opened && opened.size > 0) openedChests[id] = [...opened];
  }

  return {
    version: SAVE_VERSION,
    ticks: state.ticks,
    party: { ...state.party, tile: { ...state.party.tile } },
    keys: [...state.keys],
    floors,
    discovery,
    openedChests,
    // The edges sight has recorded.
    discoveredEdges: [...state.discoveredEdges],
    departedAt: Object.fromEntries(state.departedAt),
    // @spec EXPLORE-RETURN-011
    restockCounts: Object.fromEntries(state.restockCounts),
    // A roamer's generator is a closure, so where it has reached is what is written.
    // @spec SAVE-HOLD-004
    roamers: state.roamers.map(({ rng, ...roamer }) => ({ ...roamer, rngPosition: rng?.position() })),
    restockMinElapsedTicks: state.restockMinElapsedTicks,
    // A prompt left standing and a pit not yet fallen into both outlive a reload.
    // @spec SAVE-HOLD-007
    pendingConfirmation: state.pendingConfirmation,
    pendingFall: state.pendingFall,
  };
}

/**
 * Rebuild a campaign from a save. Floors are restored exactly as they were laid down,
 * never regenerated from a seed, so a party's own record of a floor still matches it.
 *
 * A save from an earlier version may still carry tile light levels and light sources.
 * Neither is read; the save loads as though they were never there.
 *
 * @spec EXPLORE-SAVE-001
 * @spec EXPLORE-SAVE-002
 * @spec EXPLORE-SAVE-007
 */
export function restore(saved, createExploration, { floorProvider = null, hooks = {}, stepCost } = {}) {
  const floors = saved.floors.map((data) => {
    const floor = createFloor({
      id: data.id,
      width: data.width,
      height: data.height,
      depthLabel: data.depthLabel,
    });
    floor.horizontalEdges = data.horizontalEdges.map((edge) => ({ ...edge }));
    floor.verticalEdges = data.verticalEdges.map((edge) => ({ ...edge }));
    floor.tiles = data.tiles.map(({ intrinsicLight, ...tile }) => tile);
    if (data.rooms) floor.rooms = data.rooms;
    if (data.seed !== null && data.seed !== undefined) floor.seed = data.seed;
    return floor;
  });

  const state = createExploration({
    floors,
    floorProvider,
    hooks,
    ...(stepCost ? { stepCost } : {}),
    floorId: saved.party.floorId,
    tile: saved.party.tile,
    facing: saved.party.facing,
    keys: saved.keys,
    roamers: saved.roamers.map(({ rngPosition, ...roamer }) => (
      rngPosition === undefined || rngPosition === null
        ? roamer
        : { ...roamer, rng: makeRng(rngPosition) }
    )),
    restockMinElapsedTicks: saved.restockMinElapsedTicks,
  });

  state.pendingConfirmation = saved.pendingConfirmation ?? null;
  state.pendingFall = saved.pendingFall ?? null;
  state._advanceTicks(saved.ticks);
  state.discoveredEdges = new Set(saved.discoveredEdges);
  state.departedAt = new Map(Object.entries(saved.departedAt));
  state.restockCounts = new Map(Object.entries(saved.restockCounts ?? {}));

  for (const floor of floors) {
    state.discoveredTiles.set(
      floor.id,
      unpackDiscovery(floor.width, floor.height, saved.discovery[floor.id]),
    );
    // A save from before chests opens none of them.
    // @spec EXPLORE-SAVE-008
    if (saved.openedChests?.[floor.id]) {
      state.openedChests.set(floor.id, new Set(saved.openedChests[floor.id]));
    }
  }

  return state;
}
