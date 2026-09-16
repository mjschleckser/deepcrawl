/**
 * The first-person draw plan: the corridor the simulation reports, turned into flat
 * polygons in screen space.
 *
 * Pure data. Nothing here touches a renderer — the plan is a list of shapes, ordered
 * so that drawing it in sequence produces correct occlusion with no depth test.
 */

import { LightLevel, TileFeature } from '../sim/floor.js';
import { depthFrames } from './geometry.js';

const quad = (a, b, c, d) => [a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y];

/** How much of the frame a door takes: narrower than the corridor, and not as tall. */
const DOOR_WIDTH = 0.66;
const DOOR_HEIGHT = 0.86;

/**
 * The door standing in a frame, as a rectangle on the floor of it with a handle on the
 * side away from its hinge. An open door keeps the rectangle and loses the leaf: what
 * is drawn is the frame, and the corridor shows through it.
 *
 * @spec PRESENT-VIEW-012
 * @spec PRESENT-VIEW-013
 */
function doorShape(frame, band, portal) {
  const width = frame.width * DOOR_WIDTH;
  const height = frame.height * DOOR_HEIGHT;
  const rect = {
    x: frame.x + (frame.width - width) / 2,
    // Standing on the floor of the frame rather than floating in the middle of it.
    y: frame.y + frame.height - height,
    width,
    height,
  };
  return {
    ...band,
    kind: 'door',
    open: portal.open,
    kindOfDoor: portal.kind,
    rect,
    thickness: Math.max(1, width * 0.08),
    handle: portal.open
      ? null
      : {
        x: rect.x + rect.width * 0.84,
        y: rect.y + rect.height * 0.55,
        radius: Math.max(1, width * 0.05),
      },
  };
}

const corners = (frame) => ({
  topLeft: { x: frame.x, y: frame.y },
  topRight: { x: frame.x + frame.width, y: frame.y },
  bottomRight: { x: frame.x + frame.width, y: frame.y + frame.height },
  bottomLeft: { x: frame.x, y: frame.y + frame.height },
});

/**
 * Build the shapes for one corridor report.
 *
 * Shapes come out furthest-first, so a nearer wall paints over a further one and
 * occlusion needs no depth buffer.
 *
 * @spec PRESENT-VIEW-001
 * @spec PRESENT-VIEW-002
 * @spec PRESENT-VIEW-003
 * @spec PRESENT-VIEW-004
 * @spec PRESENT-VIEW-005
 * @spec PRESENT-VIEW-006
 * @spec PRESENT-VIEW-007
 * @spec PRESENT-VIEW-008
 * @spec PRESENT-VIEW-009
 * @spec PRESENT-VIEW-012
 * @spec PRESENT-VIEW-013
 */
export function buildViewPlan(slices, viewport) {
  if (slices.length === 0) return { shapes: [] };

  // One frame per slice, plus the frame the deepest band closes against.
  const frames = depthFrames(viewport, slices.length + 1);
  const shapes = [];

  // Furthest first.
  for (const slice of [...slices].reverse()) {
    const near = corners(frames[slice.depth]);
    const far = corners(frames[slice.depth + 1]);
    const { depth, level, feature } = slice;

    // A dark depth is the boundary the corridor fades into; it is drawn as darkness
    // and nothing else, so the player sees the edge of their light rather than a wall.
    if (level === LightLevel.DARK) {
      shapes.push({
        kind: 'darkness',
        depth,
        level,
        points: quad(near.topLeft, near.topRight, near.bottomRight, near.bottomLeft),
      });
      continue;
    }

    const band = { depth, level };

    shapes.push({
      ...band,
      kind: 'ceiling',
      points: quad(near.topLeft, near.topRight, far.topRight, far.topLeft),
    });
    shapes.push({
      ...band,
      kind: 'floor',
      points: quad(near.bottomLeft, near.bottomRight, far.bottomRight, far.bottomLeft),
    });

    // Each side is decided on its own: a tile can be walled to the left and open to
    // the right, and a side passage should be visible from the corridor.
    shapes.push({
      ...band,
      kind: slice.walledLeft ? 'leftWall' : 'leftOpening',
      points: quad(near.topLeft, far.topLeft, far.bottomLeft, near.bottomLeft),
    });
    shapes.push({
      ...band,
      kind: slice.walledRight ? 'rightWall' : 'rightOpening',
      points: quad(near.topRight, far.topRight, far.bottomRight, near.bottomRight),
    });

    if (feature !== TileFeature.NONE) {
      shapes.push({
        ...band,
        kind: 'feature',
        feature,
        points: quad(far.bottomLeft, far.bottomRight, near.bottomRight, near.bottomLeft),
      });
    }

    if (slice.closedAhead) {
      shapes.push({
        ...band,
        kind: 'frontWall',
        points: quad(far.topLeft, far.topRight, far.bottomRight, far.bottomLeft),
      });
    }

    // After the wall it stands in, so a closed door is not painted over by it.
    if (slice.portalAhead) {
      shapes.push(doorShape(frames[slice.depth + 1], band, slice.portalAhead));
    }
  }

  return { shapes };
}
