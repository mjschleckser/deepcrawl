/**
 * The corridor ahead: what stands in front of the party, depth by depth.
 *
 * A projection of exploration state, in the same sense the automap view is one. It
 * answers what may be shown; the presentation segment decides what that looks like.
 */

import { Direction, STEP_DELTA, contains, getTile } from './floor.js';

/**
 * How many tiles of corridor are ever drawn. A limit on the drawing rather than on
 * the seeing, and deliberately further than the party maps: a passage that visibly
 * goes on past where the map stops is what invites a player to walk it. Nested frames
 * past a handful of depths are narrower than a pixel.
 */
export const MAX_DRAWN_DEPTH = 6;

/** Clockwise, so the tile to the party's left is one turn anticlockwise of facing. */
const LEFT_OF = {
  [Direction.NORTH]: Direction.WEST,
  [Direction.EAST]: Direction.NORTH,
  [Direction.SOUTH]: Direction.EAST,
  [Direction.WEST]: Direction.SOUTH,
};

const RIGHT_OF = {
  [Direction.NORTH]: Direction.EAST,
  [Direction.EAST]: Direction.SOUTH,
  [Direction.SOUTH]: Direction.WEST,
  [Direction.WEST]: Direction.NORTH,
};

/**
 * Walk forward from the party, reporting each tile until the way is closed or the
 * drawing limit is reached.
 *
 * @spec EXPLORE-VIEW-001
 * @spec EXPLORE-VIEW-002
 * @spec EXPLORE-VIEW-004
 * @spec EXPLORE-VIEW-005
 * @spec EXPLORE-VIEW-007
 * @spec EXPLORE-VIEW-008
 * @spec EXPLORE-VIEW-009
 * @spec EXPLORE-VIEW-010
 * @spec EXPLORE-VIEW-011
 * @spec EXPLORE-VIEW-012
 */
export function buildCorridorAhead(
  state,
  {
    isOpaque,
    portalAt = () => null,
    canSee = () => false,
    maxDepth = MAX_DRAWN_DEPTH,
  },
) {
  const floor = state.getFloor(state.party.floorId);
  const facing = state.party.facing;
  const { dx, dy } = STEP_DELTA[facing];
  const slices = [];

  let x = state.party.tile.x;
  let y = state.party.tile.y;

  for (let depth = 0; depth <= maxDepth; depth++) {
    // Left and right are the party's, not the map's, so the same gap reads as a left
    // opening walking north and a right opening walking back south.
    const slice = {
      depth,
      feature: getTile(floor, x, y).feature,
      walledLeft: isOpaque(floor, x, y, LEFT_OF[facing]),
      walledRight: isOpaque(floor, x, y, RIGHT_OF[facing]),
      closedAhead: false,
      // A door is a landmark whether or not it is in the way, so it is reported
      // alongside the blocking flag rather than being implied by it.
      portalAhead: null,
      // The same rule the automap draws a roamer by, so the map and the passage
      // cannot disagree about what is standing on a tile. The walk has already stopped
      // at the first opaque edge, so nothing reported here is seen through a wall.
      enemyHere:
        canSee(x, y)
        && state.roamers.some((r) => r.floorId === floor.id && r.x === x && r.y === y),
    };

    const ahead = { x: x + dx, y: y + dy };
    const blocked = !contains(floor, ahead.x, ahead.y) || isOpaque(floor, x, y, facing);
    slice.closedAhead = blocked;
    slice.portalAhead = contains(floor, ahead.x, ahead.y)
      ? portalAt(floor, x, y, facing)
      : null;
    slices.push(slice);

    if (blocked) return slices;
    x = ahead.x;
    y = ahead.y;
  }

  return slices;
}
