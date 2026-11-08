/**
 * The automap draw plan: the simulation's automap view placed in screen space.
 *
 * Pure data, and pure placement. Every decision about *what* may appear was already
 * made by exploration; this decides only where it lands and how big it is.
 */

import { Direction, EdgeKind, TileFeature } from '../sim/floor.js';
import { Anchor, TouchLayout, contentColumn, hornedHead, tapRegionsFor } from './geometry.js';

/**
 * The three ways the map is shown. The Map control steps through them in this order and
 * back to the start: each press smaller, and from hidden straight back to the whole map.
 *
 * @spec PRESENT-MAP-003
 */
export const MapMode = { EXPANDED: 'EXPANDED', MINI: 'MINI', HIDDEN: 'HIDDEN' };
export const MAP_MODE_ORDER = [MapMode.EXPANDED, MapMode.MINI, MapMode.HIDDEN];

/** The mode the Map control moves to from this one. */
export function nextMapMode(mode) {
  return MAP_MODE_ORDER[(MAP_MODE_ORDER.indexOf(mode) + 1) % MAP_MODE_ORDER.length];
}

const MINI_FRACTION = 0.22;
const MARGIN_FRACTION = 0.02;

/** The row of buttons along the foot, which the map must stay above. */
const FOOT_ROW = new Set(TouchLayout.filter((r) => r.anchor === Anchor.COLUMN).map((r) => r.region));

/**
 * Where the map may be drawn without lying under a control: the box an expanded map is
 * fitted into, and the square a minimap may grow to.
 *
 * @spec PRESENT-MAP-002
 * @spec PRESENT-MAP-014
 */
function freeSpace(viewport) {
  const regions = tapRegionsFor(viewport);
  const margin = Math.min(viewport.width, viewport.height) * MARGIN_FRACTION;
  const mapControl = regions.find((r) => r.region === 'MAP');
  const footTop = Math.min(viewport.height, ...regions.filter((r) => FOOT_ROW.has(r.region)).map((r) => r.y));
  const column = contentColumn(viewport);

  const top = mapControl.y + mapControl.height + margin;
  const expanded = {
    x: column.x + margin,
    y: top,
    width: Math.max(0, column.width - margin * 2),
    height: Math.max(0, footTop - margin - top),
  };
  // The minimap holds the top-left corner, short of the Map control and the foot row.
  const mini = Math.max(0, Math.min(
    Math.min(viewport.width, viewport.height) * MINI_FRACTION,
    mapControl.x - margin * 2,
    footTop - margin * 2,
  ));
  return { margin, expanded, mini };
}

/** How much of an open door's edge is left as a gap between its two posts. */
const DOORWAY_GAP = 0.44;

/**
 * The line an edge is drawn along, as [x1, y1, x2, y2] in screen space.
 *
 * @spec PRESENT-MAP-007
 */
function edgeLine(px, py, size, direction) {
  return {
    [Direction.NORTH]: [px, py, px + size, py],
    [Direction.SOUTH]: [px, py + size, px + size, py + size],
    [Direction.WEST]: [px, py, px, py + size],
    [Direction.EAST]: [px + size, py, px + size, py + size],
  }[direction];
}

/**
 * What to stroke for one edge. A wall or a shut door is the whole line; an open door is
 * its two posts with the gap the party walked through left between them.
 *
 * @spec PRESENT-MAP-007
 * @spec PRESENT-MAP-010
 */
function edgeSegments(line, open) {
  const [x1, y1, x2, y2] = line;
  if (!open) return [[x1, y1, x2, y2]];
  const post = (1 - DOORWAY_GAP) / 2;
  const at = (t) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
  return [[...at(0), ...at(post)], [...at(1 - post), ...at(1)]];
}

/**
 * One enemy's mark: a head with two horns and a pair of eyes. Every enemy gets the same
 * one, and it is decided here rather than while drawing, so the map's shapes all come
 * from one place.
 *
 * @spec PRESENT-MAP-011
 */
function enemyMarker(px, py, size) {
  return hornedHead(px + size / 2, py + size * 0.56, size * 0.26);
}

/**
 * @spec PRESENT-MAP-001
 * @spec PRESENT-MAP-002
 * @spec PRESENT-MAP-004
 * @spec PRESENT-MAP-005
 * @spec PRESENT-MAP-007
 * @spec PRESENT-MAP-008
 * @spec PRESENT-MAP-009
 * @spec PRESENT-MAP-010
 * @spec PRESENT-MAP-011
 */
/**
 * The mark a cell carries for what stands on it. A staircase is something to walk to and
 * a pit something to walk round; a chest still to open is something to come back for,
 * and an opened one a record of having been.
 *
 * @spec PRESENT-MAP-008
 * @spec PRESENT-MAP-012
 */
export const MapMark = {
  STAIRS: 'STAIRS', PIT: 'PIT', CHEST: 'CHEST', OPENED_CHEST: 'OPENED_CHEST',
};

function markFor(tile) {
  if (tile.feature === TileFeature.PIT) return MapMark.PIT;
  if (tile.feature === TileFeature.STAIRS_UP || tile.feature === TileFeature.STAIRS_DOWN) return MapMark.STAIRS;
  if (tile.feature === TileFeature.CHEST) return tile.chestOpened ? MapMark.OPENED_CHEST : MapMark.CHEST;
  return null;
}

/**
 * The map placed for one of its visible states. Hidden is not a placement: whoever asks
 * for the map draws nothing then.
 *
 * @spec PRESENT-MAP-002
 * @spec PRESENT-MAP-004
 * @spec PRESENT-MAP-014
 */
export function buildMapPlan(view, viewport, { mode = MapMode.MINI } = {}) {
  const expanded = mode === MapMode.EXPANDED;
  const space = freeSpace(viewport);

  // Expanded, the whole floor at the largest scale the free space allows, centred in
  // it; as a minimap, the floor fitted into a small square in the top-left corner.
  const cellSize = expanded
    ? Math.min(space.expanded.width / view.width, space.expanded.height / view.height)
    : space.mini / Math.max(view.width, view.height);

  const width = cellSize * view.width;
  const height = cellSize * view.height;

  const originX = expanded ? space.expanded.x + (space.expanded.width - width) / 2 : space.margin;
  const originY = expanded ? space.expanded.y + (space.expanded.height - height) / 2 : space.margin;

  const place = (x, y) => ({ px: originX + x * cellSize, py: originY + y * cellSize });

  const cells = view.tiles.map((tile) => ({
    x: tile.x,
    y: tile.y,
    ...place(tile.x, tile.y),
    feature: tile.feature,
    mark: markFor(tile),
  }));

  // An open edge is nothing to draw; only something that stands there gets a stroke.
  const edges = [];
  for (const tile of view.tiles) {
    for (const [direction, edge] of Object.entries(tile.edges)) {
      if (edge.kind === EdgeKind.OPEN) continue;
      const { px, py } = place(tile.x, tile.y);
      edges.push({
        x: tile.x,
        y: tile.y,
        direction,
        kind: edge.kind,
        open: edge.open,
        px,
        py,
        segments: edgeSegments(edgeLine(px, py, cellSize, direction), edge.open),
      });
    }
  }

  return {
    floorId: view.floorId,
    mode,
    expanded,
    cellSize,
    bounds: { x: originX, y: originY, width, height },
    cells,
    edges,
    party: { ...view.party, ...place(view.party.x, view.party.y) },
    enemies: view.enemies.map((enemy) => {
      const { px, py } = place(enemy.x, enemy.y);
      return { ...enemy, px, py, marker: enemyMarker(px, py, cellSize) };
    }),
  };
}
