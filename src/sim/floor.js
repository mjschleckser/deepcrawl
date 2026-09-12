/**
 * Floor representation for the exploration segment.
 *
 * Simulation core: no renderer, no DOM. A floor is a grid of tiles with walls on the
 * edges between them, and each edge is stored exactly once so two adjoining tiles can
 * never disagree about the wall they share.
 */

export const EdgeKind = {
  OPEN: 'OPEN',
  WALL: 'WALL',
  DOOR: 'DOOR',
  LOCKED_DOOR: 'LOCKED_DOOR',
  SECRET_DOOR: 'SECRET_DOOR',
};

export const TileFeature = {
  NONE: 'NONE',
  STAIRS_UP: 'STAIRS_UP',
  STAIRS_DOWN: 'STAIRS_DOWN',
  PIT: 'PIT',
};

export const LightLevel = {
  BRIGHT: 'BRIGHT',
  DIM: 'DIM',
  DARK: 'DARK',
};

export const Direction = {
  NORTH: 'NORTH',
  EAST: 'EAST',
  SOUTH: 'SOUTH',
  WEST: 'WEST',
};

/** Clockwise, so a right turn is +1 and a left turn is -1. */
export const FACINGS = [Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST];

export const STEP_DELTA = {
  [Direction.NORTH]: { dx: 0, dy: -1 },
  [Direction.EAST]: { dx: 1, dy: 0 },
  [Direction.SOUTH]: { dx: 0, dy: 1 },
  [Direction.WEST]: { dx: -1, dy: 0 },
};

/**
 * Locate the single stored slot for an edge.
 *
 * Horizontal edges run along the top of each tile: the slot at row `y` is the edge
 * between tile (x, y-1) and tile (x, y). Vertical edges run down the left of each
 * tile. Naming an edge from either of its two tiles lands on the same slot, which is
 * the whole point of storing them this way.
 *
 * @spec EXPLORE-FLOOR-002
 */
function edgeSlot(floor, x, y, direction) {
  switch (direction) {
    case Direction.NORTH:
      return { array: floor.horizontalEdges, index: y * floor.width + x };
    case Direction.SOUTH:
      return { array: floor.horizontalEdges, index: (y + 1) * floor.width + x };
    case Direction.WEST:
      return { array: floor.verticalEdges, index: y * (floor.width + 1) + x };
    case Direction.EAST:
      return { array: floor.verticalEdges, index: y * (floor.width + 1) + x + 1 };
    default:
      throw new Error(`unknown direction: ${direction}`);
  }
}

/**
 * A stable identity for an edge, the same from either side. Used to record which
 * secret doors the party has discovered without duplicating the record per tile.
 *
 * @spec EXPLORE-FLOOR-002
 */
export function edgeKey(floor, x, y, direction) {
  const { array, index } = edgeSlot(floor, x, y, direction);
  const plane = array === floor.horizontalEdges ? 'H' : 'V';
  return `${floor.id}:${plane}:${index}`;
}

/**
 * Build a floor: an empty grid of the given size, walled around its outside.
 *
 * @spec EXPLORE-FLOOR-001
 * @spec EXPLORE-FLOOR-003
 * @spec EXPLORE-FLOOR-006
 * @spec EXPLORE-FLOOR-007
 * @spec EXPLORE-FLOOR-008
 * @spec EXPLORE-FLOOR-009
 */
export function createFloor({ id, width, height, depthLabel = null }) {
  const horizontalEdges = [];
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x < width; x++) {
      // The top and bottom rows of horizontal edges are the floor's outer boundary.
      const onBorder = y === 0 || y === height;
      horizontalEdges.push({ kind: onBorder ? EdgeKind.WALL : EdgeKind.OPEN, open: false });
    }
  }

  const verticalEdges = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x <= width; x++) {
      const onBorder = x === 0 || x === width;
      verticalEdges.push({ kind: onBorder ? EdgeKind.WALL : EdgeKind.OPEN, open: false });
    }
  }

  const tiles = [];
  for (let i = 0; i < width * height; i++) {
    tiles.push({ feature: TileFeature.NONE, intrinsicLight: LightLevel.DARK });
  }

  return { id, width, height, depthLabel, horizontalEdges, verticalEdges, tiles };
}

export function contains(floor, x, y) {
  return x >= 0 && y >= 0 && x < floor.width && y < floor.height;
}

/** @spec EXPLORE-FLOOR-004 */
export function getEdge(floor, x, y, direction) {
  const { array, index } = edgeSlot(floor, x, y, direction);
  return array[index].kind;
}

/** @spec EXPLORE-FLOOR-004 */
export function setEdge(floor, x, y, direction, kind, { open = false, keyId } = {}) {
  const { array, index } = edgeSlot(floor, x, y, direction);
  array[index] = { kind, open, keyId };
  return array[index];
}

/**
 * Doors carry their open state on the shared edge, so opening one from either side
 * opens it for both.
 *
 * @spec EXPLORE-FLOOR-005
 */
export function isEdgeOpen(floor, x, y, direction) {
  const { array, index } = edgeSlot(floor, x, y, direction);
  return array[index].open === true;
}

/** @spec EXPLORE-FLOOR-005 */
export function openEdge(floor, x, y, direction) {
  const { array, index } = edgeSlot(floor, x, y, direction);
  array[index].open = true;
}

export function edgeDetail(floor, x, y, direction) {
  const { array, index } = edgeSlot(floor, x, y, direction);
  return array[index];
}

export function getTile(floor, x, y) {
  return floor.tiles[y * floor.width + x];
}

/**
 * @spec EXPLORE-FLOOR-006
 * @spec EXPLORE-FLOOR-008
 * @spec EXPLORE-FLOOR-011
 */
export function setTileFeature(floor, x, y, feature, { target } = {}) {
  const tile = getTile(floor, x, y);
  tile.feature = feature;
  // A connector names its destination; one with no return connector is ordinary,
  // which is how a pit drops the party somewhere it cannot climb back from.
  if (target !== undefined) tile.target = target;
  return tile;
}

/** @spec EXPLORE-FLOOR-007 */
export function setTileLight(floor, x, y, level) {
  getTile(floor, x, y).intrinsicLight = level;
  return getTile(floor, x, y);
}

export function isConnector(feature) {
  return (
    feature === TileFeature.PIT ||
    feature === TileFeature.STAIRS_UP ||
    feature === TileFeature.STAIRS_DOWN
  );
}

export function isStairs(feature) {
  return feature === TileFeature.STAIRS_UP || feature === TileFeature.STAIRS_DOWN;
}
