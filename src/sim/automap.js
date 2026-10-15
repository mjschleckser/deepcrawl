/**
 * The automap: a second view of exploration state, owning nothing.
 *
 * This builds what the map may show. It reads the discovery record rather than keeping
 * one of its own, so the map and the first-person view are drawn from a single source
 * and cannot disagree about where the party stands.
 */

import {
  Direction, EdgeKind, edgeDetail, edgeKey, getTile, isEdgeOpen,
} from './floor.js';

const ALL_DIRECTIONS = Object.values(Direction);

/**
 * What a discovered edge looks like on the map. An undiscovered secret door is
 * reported as the wall it imitates — the map gives nothing away that the party has
 * not actually found.
 *
 * A door also reports whether it stands open, because a doorway already walked through
 * and one still shut are different things to a party reading its own map.
 *
 * @spec EXPLORE-MAP-003
 * @spec EXPLORE-MAP-011
 */
function drawnEdge(state, floor, x, y, direction) {
  const { kind } = edgeDetail(floor, x, y, direction);
  const open = isEdgeOpen(floor, x, y, direction);
  if (kind !== EdgeKind.SECRET_DOOR) return { kind, open };
  return state.discoveredEdges.has(edgeKey(floor, x, y, direction))
    ? { kind: EdgeKind.SECRET_DOOR, open }
    : { kind: EdgeKind.WALL, open: false };
}

/**
 * Build the automap for the floor the party is on.
 *
 * Needs no item, spell, or class: a party carrying nothing still gets a map of
 * everything it has seen.
 *
 * @spec EXPLORE-MAP-001
 * @spec EXPLORE-MAP-002
 * @spec EXPLORE-MAP-004
 * @spec EXPLORE-MAP-005
 * @spec EXPLORE-MAP-008
 * @spec EXPLORE-MAP-012
 * @spec EXPLORE-MAP-013
 * @spec EXPLORE-MAP-009
 */
export function buildAutomapView(
  state,
  { canSee = () => true } = {},
) {
  const floor = state.getFloor(state.party.floorId);
  const discovered = state.discoveredTiles.get(floor.id) ?? new Set();
  const traps = state.knownTraps.get(floor.id) ?? new Set();

  const tiles = [];
  for (const key of discovered) {
    const [x, y] = key.split(',').map(Number);
    const edges = {};
    for (const dir of ALL_DIRECTIONS) edges[dir] = drawnEdge(state, floor, x, y, dir);
    tiles.push({
      x,
      y,
      feature: getTile(floor, x, y).feature,
      trapKnown: traps.has(key),
      edges,
    });
  }
  tiles.sort((a, b) => a.y - b.y || a.x - b.x);

  const party = { ...state.party.tile, facing: state.party.facing };

  // An enemy appears only where the party can presently see it — never at a position
  // where it was last spotted, which would hand over where a warband is without the
  // party having looked.
  const enemies = state.roamers
    .filter((roamer) => roamer.floorId === floor.id)
    .filter((roamer) => canSee(roamer.x, roamer.y))
    .map(({ id, x, y }) => ({ id, x, y }));

  return { floorId: floor.id, width: floor.width, height: floor.height, tiles, party, enemies };
}
