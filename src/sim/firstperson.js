/**
 * The corridor ahead: what stands in front of the party, depth by depth.
 *
 * A projection of exploration state, in the same sense the automap view is one. It
 * answers what may be shown; the presentation segment decides what that looks like.
 */

import { Direction, LightLevel, STEP_DELTA, contains, getTile } from './floor.js';

/**
 * How many tiles of corridor are ever drawn. A limit on the drawing rather than on
 * the seeing: a party whose light reaches forty tiles still maps forty tiles, but
 * nested frames past a handful of depths are narrower than a pixel.
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
 * Walk forward from the party, reporting each tile until the way is closed, the light
 * runs out, or the drawing limit is reached.
 *
 * @spec EXPLORE-VIEW-001
 * @spec EXPLORE-VIEW-002
 * @spec EXPLORE-VIEW-003
 * @spec EXPLORE-VIEW-004
 * @spec EXPLORE-VIEW-005
 * @spec EXPLORE-VIEW-006
 * @spec EXPLORE-VIEW-007
 * @spec EXPLORE-VIEW-008
 */
export function buildCorridorAhead(state, { isOpaque, resolveLight, maxDepth = MAX_DRAWN_DEPTH }) {
  const floor = state.floors.get(state.party.floorId);
  const facing = state.party.facing;
  const { dx, dy } = STEP_DELTA[facing];
  const slices = [];

  let x = state.party.tile.x;
  let y = state.party.tile.y;

  for (let depth = 0; depth <= maxDepth; depth++) {
    const level = resolveLight(x, y);

    // Left and right are the party's, not the map's, so the same gap reads as a left
    // opening walking north and a right opening walking back south.
    const slice = {
      depth,
      level,
      feature: getTile(floor, x, y).feature,
      walledLeft: isOpaque(floor, x, y, LEFT_OF[facing]),
      walledRight: isOpaque(floor, x, y, RIGHT_OF[facing]),
      closedAhead: false,
    };

    // The dark boundary is reported rather than omitted, so the view has somewhere to
    // fade to instead of ending abruptly on a lit frame.
    if (level === LightLevel.DARK) {
      slices.push(slice);
      return slices;
    }

    const ahead = { x: x + dx, y: y + dy };
    const blocked = !contains(floor, ahead.x, ahead.y) || isOpaque(floor, x, y, facing);
    slice.closedAhead = blocked;
    slices.push(slice);

    if (blocked) return slices;
    x = ahead.x;
    y = ahead.y;
  }

  return slices;
}
