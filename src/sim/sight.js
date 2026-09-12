/**
 * Sight and discovery for the exploration segment.
 *
 * What the party has seen is a fact about the party, not about the map. This module
 * works out what is currently visible and writes it into the discovery record; the
 * automap is a reader of that record, never its owner.
 */

import {
  Direction,
  EdgeKind,
  LightLevel,
  contains,
  edgeDetail,
  edgeKey,
  getEdge,
  getTile,
  isEdgeOpen,
} from './floor.js';

const ALL_DIRECTIONS = Object.values(Direction);

const NEIGHBOUR = {
  [Direction.NORTH]: { dx: 0, dy: -1 },
  [Direction.EAST]: { dx: 1, dy: 0 },
  [Direction.SOUTH]: { dx: 0, dy: 1 },
  [Direction.WEST]: { dx: -1, dy: 0 },
};

/**
 * Whether an edge stops sight. A closed door is as opaque as a wall, so a room cannot
 * be mapped before it is entered, and an undiscovered secret door is indistinguishable
 * from the wall it imitates.
 *
 * @spec EXPLORE-SIGHT-002
 */
export function isOpaque(discoveredEdges, floor, x, y, direction) {
  const kind = getEdge(floor, x, y, direction);
  if (kind === EdgeKind.WALL) return true;
  if (kind === EdgeKind.DOOR || kind === EdgeKind.LOCKED_DOOR) {
    return !isEdgeOpen(floor, x, y, direction);
  }
  if (kind === EdgeKind.SECRET_DOOR) {
    return !discoveredEdges.has(edgeKey(floor, x, y, direction));
  }
  return false;
}

/**
 * Whether an offset from the party falls inside the forward cone: 45 degrees either
 * side of facing, so the sideways component never exceeds the forward one.
 *
 * @spec EXPLORE-SIGHT-001
 */
export function inCone(dx, dy, facing) {
  switch (facing) {
    case Direction.NORTH:
      return dy < 0 && Math.abs(dx) <= -dy;
    case Direction.SOUTH:
      return dy > 0 && Math.abs(dx) <= dy;
    case Direction.EAST:
      return dx > 0 && Math.abs(dy) <= dx;
    case Direction.WEST:
      return dx < 0 && Math.abs(dy) <= -dx;
    default:
      return false;
  }
}

/**
 * Every tile the party can presently see, nearest first.
 *
 * Visibility spreads outward from the party through edges that are not opaque, staying
 * inside the cone and inside the reach of the party's light. A spreading flood rather
 * than a ray cast per tile: with walls on edges and a 90 degree cone, the flood is
 * exactly "what the corridor lets through", it is deterministic, and it has no
 * grazing-ray corner cases to arbitrate.
 *
 * @spec EXPLORE-SIGHT-001
 * @spec EXPLORE-SIGHT-002
 */
function visibleTiles(state, floor, origin, facing, reach) {
  const seen = new Set([`${origin.x},${origin.y}`]);
  const ordered = [];
  let frontier = [origin];

  for (let ring = 0; ring < reach; ring++) {
    const next = [];
    for (const tile of frontier) {
      for (const dir of ALL_DIRECTIONS) {
        const { dx, dy } = NEIGHBOUR[dir];
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        const key = `${nx},${ny}`;

        if (seen.has(key)) continue;
        if (!contains(floor, nx, ny)) continue;
        // Only tiles the party is actually looking at.
        if (!inCone(nx - origin.x, ny - origin.y, facing)) continue;
        if (isOpaque(state.discoveredEdges, floor, tile.x, tile.y, dir)) continue;

        seen.add(key);
        next.push({ x: nx, y: ny });
        ordered.push({ x: nx, y: ny });
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return ordered;
}

function discoverTile(state, floor, x, y) {
  const tiles = state.discoveredTiles.get(floor.id) ?? new Set();
  tiles.add(`${x},${y}`);
  state.discoveredTiles.set(floor.id, tiles);

  // Discovering a tile discovers its edges — except a secret door, which stays hidden
  // until the search mechanics find it. Without that carve-out, merely looking at a
  // tile would give up its secrets and searching would never be worth an action.
  for (const dir of ALL_DIRECTIONS) {
    if (edgeDetail(floor, x, y, dir).kind === EdgeKind.SECRET_DOOR) continue;
    state.discoveredEdges.add(edgeKey(floor, x, y, dir));
  }
}

export function isTileDiscovered(state, floorId, x, y) {
  return state.discoveredTiles.get(floorId)?.has(`${x},${y}`) ?? false;
}

export function isEdgeKnown(state, floorId, x, y, direction) {
  const floor = state.floors.get(floorId);
  return state.discoveredEdges.has(edgeKey(floor, x, y, direction));
}

/**
 * Traps live in their own segment, but whether the party *knows* about one is part of
 * what the party has discovered, so it is recorded here with the rest of the map.
 *
 * @spec EXPLORE-SIGHT-010
 */
export function recordTrapDetected(state, floorId, x, y) {
  const traps = state.knownTraps.get(floorId) ?? new Set();
  traps.add(`${x},${y}`);
  state.knownTraps.set(floorId, traps);
}

export function isTrapKnown(state, floorId, x, y) {
  return state.knownTraps.get(floorId)?.has(`${x},${y}`) ?? false;
}

/**
 * Work out what the party sees from where it stands, record it, and offer the result
 * to the trap segment for detection.
 *
 * @spec EXPLORE-SIGHT-003
 * @spec EXPLORE-SIGHT-004
 * @spec EXPLORE-SIGHT-005
 * @spec EXPLORE-SIGHT-008
 * @spec EXPLORE-SIGHT-009
 * @spec EXPLORE-BOUND-008
 */
export function computeSight(state, { resolveLight, litReach, enemiesVisibleAt }) {
  const floor = state.floors.get(state.party.floorId);
  const origin = state.party.tile;
  const tiles = [];

  const record = (x, y) => {
    const level = resolveLight(x, y);
    // Nothing is learned about a dark tile, and nothing standing on it is revealed.
    if (level === LightLevel.DARK) return;
    discoverTile(state, floor, x, y);
    tiles.push({
      x,
      y,
      level,
      feature: getTile(floor, x, y).feature,
      enemiesVisible: enemiesVisibleAt(level),
    });
  };

  // The party always sees the ground under its own feet and the walls around it,
  // whichever way it happens to be facing — unless it is standing in the dark.
  record(origin.x, origin.y);

  for (const tile of visibleTiles(state, floor, origin, state.party.facing, litReach())) {
    record(tile.x, tile.y);
  }

  state.hooks.onTrapDetect({ floorId: floor.id, tiles, deliberate: false });

  return { floorId: floor.id, tiles };
}
