/**
 * The automap draw plan: the simulation's automap view placed in screen space.
 *
 * Pure data, and pure placement. Every decision about *what* may appear was already
 * made by exploration; this decides only where it lands and how big it is.
 */

import { EdgeKind } from '../sim/floor.js';

const COLLAPSED_FRACTION = 0.22;
const EXPANDED_FRACTION = 0.9;
const MARGIN_FRACTION = 0.02;

/**
 * @spec PRESENT-MAP-001
 * @spec PRESENT-MAP-002
 * @spec PRESENT-MAP-004
 * @spec PRESENT-MAP-005
 * @spec PRESENT-MAP-006
 * @spec PRESENT-MAP-007
 * @spec PRESENT-MAP-008
 * @spec PRESENT-MAP-009
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
    for (const [direction, kind] of Object.entries(tile.edges)) {
      if (kind === EdgeKind.OPEN) continue;
      edges.push({ x: tile.x, y: tile.y, direction, kind, ...place(tile.x, tile.y) });
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
    enemies: view.enemies.map((enemy) => ({ ...enemy, ...place(enemy.x, enemy.y) })),
  };
}
