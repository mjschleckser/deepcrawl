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

const EPSILON = 1e-9;

/**
 * Whether an unobstructed line runs from the middle of one tile to the middle of
 * another. Every edge the line crosses must be transparent.
 *
 * Where the line passes exactly through the corner point shared by four tiles, it is
 * blocked only if both ways around that corner are blocked — a single diagonal slit
 * can be seen through, a solid corner cannot. Blocking whenever either side was
 * blocked would throw spurious shadows across open rooms.
 *
 * @spec EXPLORE-SIGHT-002
 * @spec EXPLORE-SIGHT-012
 * @spec EXPLORE-SIGHT-013
 */
export function hasLineOfSight(discoveredEdges, floor, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return true;

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const alongX = stepX > 0 ? Direction.EAST : Direction.WEST;
  const alongY = stepY > 0 ? Direction.SOUTH : Direction.NORTH;

  // Where the line crosses each grid line, as a fraction of its length. Centre-to-
  // centre means a crossing sits at a half-integer count of whole steps.
  const crossings = [];
  for (let i = 0; i < Math.abs(dx); i++) {
    crossings.push({ t: (i + 0.5) / Math.abs(dx), axis: 'x' });
  }
  for (let i = 0; i < Math.abs(dy); i++) {
    crossings.push({ t: (i + 0.5) / Math.abs(dy), axis: 'y' });
  }
  crossings.sort((a, b) => a.t - b.t);

  const blocked = (x, y, dir) =>
    !contains(floor, x, y) || isOpaque(discoveredEdges, floor, x, y, dir);

  let x = from.x;
  let y = from.y;

  for (let i = 0; i < crossings.length; i++) {
    const here = crossings[i];
    const next = crossings[i + 1];
    const together = next && Math.abs(next.t - here.t) < EPSILON && next.axis !== here.axis;

    if (together) {
      // The line threads a corner point: take it only if some way round is open.
      const viaX = !blocked(x, y, alongX) && !blocked(x + stepX, y, alongY);
      const viaY = !blocked(x, y, alongY) && !blocked(x, y + stepY, alongX);
      if (!viaX && !viaY) return false;
      x += stepX;
      y += stepY;
      i++; // both crossings consumed
      continue;
    }

    if (here.axis === 'x') {
      if (blocked(x, y, alongX)) return false;
      x += stepX;
    } else {
      if (blocked(x, y, alongY)) return false;
      y += stepY;
    }
  }

  return true;
}

/**
 * Every tile the party can presently see.
 *
 * A line is traced to each candidate inside the cone and inside the reach of the
 * party's light. Tracing lines rather than spreading outward is what stops sight going
 * round a corner: ground beyond a turn stays hidden until the party reaches the corner
 * and looks along the new arm.
 *
 * @spec EXPLORE-SIGHT-001
 * @spec EXPLORE-SIGHT-002
 * @spec EXPLORE-SIGHT-012
 */
function visibleTiles(state, floor, origin, facing, reach) {
  const visible = [];

  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = origin.x + dx;
      const y = origin.y + dy;

      if (!contains(floor, x, y)) continue;
      // Only tiles the party is actually looking at.
      if (!inCone(dx, dy, facing)) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > reach) continue;
      if (!hasLineOfSight(state.discoveredEdges, floor, origin, { x, y })) continue;

      visible.push({ x, y });
    }
  }

  return visible;
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
