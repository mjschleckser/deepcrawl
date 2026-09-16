/**
 * The automap draw plan: the simulation's automap view placed in screen space.
 *
 * Pure data, and pure placement. Every decision about *what* may appear was already
 * made by exploration; this decides only where it lands and how big it is.
 */

import { Direction, EdgeKind } from '../sim/floor.js';
import { hornedHead } from './geometry.js';

const COLLAPSED_FRACTION = 0.22;
const EXPANDED_FRACTION = 0.9;
const MARGIN_FRACTION = 0.02;

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
 * @spec PRESENT-MAP-006
 * @spec PRESENT-MAP-007
 * @spec PRESENT-MAP-008
 * @spec PRESENT-MAP-009
 * @spec PRESENT-MAP-010
 * @spec PRESENT-MAP-011
 */
export function buildMapPlan(view, viewport, { expanded = false } = {}) {
  const fraction = expanded ? EXPANDED_FRACTION : COLLAPSED_FRACTION;
  const available = Math.min(viewport.width, viewport.height) * fraction;
  const cellSize = available / Math.max(view.width, view.height);

  const width = cellSize * view.width;
  const height = cellSize * view.height;

  // Collapsed, the map tucks into the top-left corner; expanded, it centres.
  const margin = Math.min(viewport.width, viewport.height) * MARGIN_FRACTION;
  const originX = expanded ? (viewport.width - width) / 2 : margin;
  const originY = expanded ? (viewport.height - height) / 2 : margin;

  const place = (x, y) => ({ px: originX + x * cellSize, py: originY + y * cellSize });

  const cells = view.tiles.map((tile) => ({
    x: tile.x,
    y: tile.y,
    ...place(tile.x, tile.y),
    feature: tile.feature,
    trapKnown: tile.trapKnown,
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
    expanded,
    cellSize,
    bounds: { x: originX, y: originY, width, height },
    cells,
    edges,
    // Absent entirely when the party stands in the dark; the map itself stays drawn.
    party: view.party ? { ...view.party, ...place(view.party.x, view.party.y) } : null,
    enemies: view.enemies.map((enemy) => {
      const { px, py } = place(enemy.x, enemy.y);
      return { ...enemy, px, py, marker: enemyMarker(px, py, cellSize) };
    }),
  };
}
