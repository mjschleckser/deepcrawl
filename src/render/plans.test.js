import { describe, it, expect } from 'vitest';
import { LightLevel, TileFeature, EdgeKind, Direction } from '../sim/floor.js';
import {
  depthFrames, tapRegionsFor, hitTest, TouchLayout, contentColumn, Anchor,
} from './geometry.js';
import { buildViewPlan } from './viewplan.js';
import { buildMapPlan } from './mapplan.js';

const viewport = { width: 800, height: 600 };

const slice = (over = {}) => ({
  depth: 0,
  level: LightLevel.BRIGHT,
  feature: TileFeature.NONE,
  walledLeft: true,
  walledRight: true,
  closedAhead: false,
  portalAhead: null,
  ...over,
});

const door = (over = {}) => ({ kind: EdgeKind.DOOR, open: false, ...over });

const kinds = (plan, kind) => plan.shapes.filter((s) => s.kind === kind);

describe('depth frames', () => {
  // @spec PRESENT-VIEW-001
  it('nests each frame inside the one before it, toward a vanishing point', () => {
    const frames = depthFrames(viewport, 4);

    expect(frames).toHaveLength(4);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].width).toBeLessThan(frames[i - 1].width);
      expect(frames[i].height).toBeLessThan(frames[i - 1].height);
    }
  });

  // @spec PRESENT-VIEW-001
  it('centres every frame on the same vanishing point', () => {
    const frames = depthFrames(viewport, 5);

    for (const frame of frames) {
      expect(frame.x + frame.width / 2).toBeCloseTo(viewport.width / 2);
      expect(frame.y + frame.height / 2).toBeCloseTo(viewport.height / 2);
    }
  });

  // @spec PRESENT-INPUT-005
  it('rescales with the viewport', () => {
    const small = depthFrames({ width: 400, height: 300 }, 3);
    const large = depthFrames({ width: 800, height: 600 }, 3);

    expect(large[0].width).toBeCloseTo(small[0].width * 2);
    expect(large[2].width).toBeCloseTo(small[2].width * 2);
  });
});

describe('the first-person draw plan', () => {
  // @spec PRESENT-VIEW-002
  it('orders shapes from the furthest depth to the nearest', () => {
    const plan = buildViewPlan([slice({ depth: 0 }), slice({ depth: 1 }), slice({ depth: 2 })], viewport);

    const depths = plan.shapes.map((s) => s.depth);
    expect(depths).toEqual([...depths].sort((a, b) => b - a));
  });

  // @spec PRESENT-VIEW-003
  it('draws a wall panel on each side reported walled', () => {
    const plan = buildViewPlan([slice({ walledLeft: true, walledRight: true })], viewport);

    expect(kinds(plan, 'leftWall')).toHaveLength(1);
    expect(kinds(plan, 'rightWall')).toHaveLength(1);
    expect(kinds(plan, 'leftOpening')).toHaveLength(0);
  });

  // @spec PRESENT-VIEW-004
  it('draws an opening on each side not reported walled, independently', () => {
    const plan = buildViewPlan([slice({ walledLeft: false, walledRight: true })], viewport);

    expect(kinds(plan, 'leftOpening')).toHaveLength(1);
    expect(kinds(plan, 'leftWall')).toHaveLength(0);
    expect(kinds(plan, 'rightWall')).toHaveLength(1);
    expect(kinds(plan, 'rightOpening')).toHaveLength(0);
  });

  // @spec PRESENT-VIEW-005
  it('closes the corridor with a panel where the way ahead is barred', () => {
    const plan = buildViewPlan([slice({ depth: 0 }), slice({ depth: 1, closedAhead: true })], viewport);

    const front = kinds(plan, 'frontWall');
    expect(front).toHaveLength(1);
    expect(front[0].depth).toBe(1);
  });

  // @spec PRESENT-VIEW-005
  it('draws no closing panel down an open corridor', () => {
    const plan = buildViewPlan([slice({ depth: 0 }), slice({ depth: 1 })], viewport);

    expect(kinds(plan, 'frontWall')).toHaveLength(0);
  });

  // @spec PRESENT-VIEW-006
  it('draws floor and ceiling bands at every depth', () => {
    const plan = buildViewPlan([slice({ depth: 0 }), slice({ depth: 1 })], viewport);

    expect(kinds(plan, 'floor')).toHaveLength(2);
    expect(kinds(plan, 'ceiling')).toHaveLength(2);
  });

  // @spec PRESENT-VIEW-007
  it('carries the light level of its depth on every shape', () => {
    const plan = buildViewPlan(
      [slice({ depth: 0, level: LightLevel.BRIGHT }), slice({ depth: 1, level: LightLevel.DIM })],
      viewport,
    );

    for (const shape of plan.shapes) {
      expect([LightLevel.BRIGHT, LightLevel.DIM]).toContain(shape.level);
    }
    expect(plan.shapes.filter((s) => s.depth === 1).every((s) => s.level === LightLevel.DIM)).toBe(true);
  });

  // @spec PRESENT-VIEW-007
  it('draws nothing for a depth reported dark, beyond the boundary itself', () => {
    const plan = buildViewPlan(
      [slice({ depth: 0 }), slice({ depth: 1, level: LightLevel.DARK })],
      viewport,
    );

    expect(plan.shapes.some((s) => s.depth === 1 && s.kind !== 'darkness')).toBe(false);
    expect(kinds(plan, 'darkness')).toHaveLength(1);
  });

  // @spec PRESENT-VIEW-008
  it('draws a feature within the band of the depth that holds it', () => {
    const plan = buildViewPlan(
      [slice({ depth: 0 }), slice({ depth: 1, feature: TileFeature.STAIRS_DOWN })],
      viewport,
    );

    const features = kinds(plan, 'feature');
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({ depth: 1, feature: TileFeature.STAIRS_DOWN });
  });

  // @spec PRESENT-VIEW-009
  it('draws only the depths it was given', () => {
    const plan = buildViewPlan([slice({ depth: 0 }), slice({ depth: 1 })], viewport);

    expect(Math.max(...plan.shapes.map((s) => s.depth))).toBe(1);
  });

  // @spec PRESENT-VIEW-012
  it('draws a closed door as a panel on the frame, with a handle', () => {
    const plan = buildViewPlan([slice({ closedAhead: true, portalAhead: door() })], viewport);

    const [panel] = kinds(plan, 'door');
    expect(panel).toBeDefined();
    expect(panel.open).toBe(false);
    expect(panel.handle.radius).toBeGreaterThan(0);
  });

  // @spec PRESENT-VIEW-012
  it('puts the door inside the frame the corridor stops at, not across the screen', () => {
    const frames = depthFrames(viewport, 2);
    const plan = buildViewPlan([slice({ closedAhead: true, portalAhead: door() })], viewport);

    const [panel] = kinds(plan, 'door');
    expect(panel.rect.width).toBeLessThan(frames[1].width);
    expect(panel.rect.x).toBeGreaterThanOrEqual(frames[1].x);
    expect(panel.rect.x + panel.rect.width).toBeLessThanOrEqual(frames[1].x + frames[1].width);
  });

  // @spec PRESENT-VIEW-012
  it('draws the door after the wall it stands in, so it is not painted over', () => {
    const plan = buildViewPlan([slice({ closedAhead: true, portalAhead: door() })], viewport);

    const wall = plan.shapes.findIndex((sh) => sh.kind === 'frontWall');
    const panel = plan.shapes.findIndex((sh) => sh.kind === 'door');
    expect(wall).toBeGreaterThanOrEqual(0);
    expect(panel).toBeGreaterThan(wall);
  });

  // @spec PRESENT-VIEW-013
  it('draws an open door as its frame, with nothing filling the doorway', () => {
    const plan = buildViewPlan(
      [slice({ closedAhead: false, portalAhead: door({ open: true }) }), slice({ depth: 1 })],
      viewport,
    );

    const [panel] = kinds(plan, 'door');
    expect(panel.open).toBe(true);
    expect(panel.handle).toBeNull();
    expect(panel.thickness).toBeGreaterThan(0);
    // Nothing closes the corridor, so the way on is still visible through it.
    expect(kinds(plan, 'frontWall')).toHaveLength(0);
  });

  // @spec PRESENT-VIEW-005
  it('draws no door where the simulation reports none', () => {
    const plan = buildViewPlan([slice({ closedAhead: true })], viewport);

    expect(kinds(plan, 'door')).toHaveLength(0);
    expect(kinds(plan, 'frontWall')).toHaveLength(1);
  });

  // @spec PRESENT-VIEW-001
  it('draws nothing at all from an empty report', () => {
    expect(buildViewPlan([], viewport).shapes).toEqual([]);
  });
});

describe('the automap draw plan', () => {
  const view = {
    floorId: 'f1',
    width: 5,
    height: 5,
    tiles: [
      { x: 1, y: 1, feature: TileFeature.NONE, trapKnown: false, edges: { NORTH: { kind: EdgeKind.WALL, open: false }, EAST: { kind: EdgeKind.OPEN, open: false }, SOUTH: { kind: EdgeKind.DOOR, open: false }, WEST: { kind: EdgeKind.DOOR, open: true } } },
      { x: 2, y: 1, feature: TileFeature.STAIRS_DOWN, trapKnown: true, edges: { NORTH: { kind: EdgeKind.WALL, open: false }, EAST: { kind: EdgeKind.WALL, open: false }, SOUTH: { kind: EdgeKind.OPEN, open: false }, WEST: { kind: EdgeKind.OPEN, open: false } } },
    ],
    party: { x: 1, y: 1, facing: Direction.NORTH },
    enemies: [{ id: 'r1', x: 2, y: 1 }],
  };

  // @spec PRESENT-MAP-001
  it('draws a cell for each discovered tile and no others', () => {
    const plan = buildMapPlan(view, viewport, { expanded: false });

    expect(plan.cells).toHaveLength(2);
    expect(plan.cells.map((c) => `${c.x},${c.y}`).sort()).toEqual(['1,1', '2,1']);
  });

  // @spec PRESENT-MAP-002
  it('sits in a corner while collapsed and fills the viewport when expanded', () => {
    const collapsed = buildMapPlan(view, viewport, { expanded: false });
    const expanded = buildMapPlan(view, viewport, { expanded: true });

    expect(collapsed.bounds.width).toBeLessThan(viewport.width / 2);
    expect(expanded.bounds.width).toBeGreaterThan(collapsed.bounds.width);
  });

  // @spec PRESENT-MAP-004
  it('draws the same content at both scales, differing only in size', () => {
    const collapsed = buildMapPlan(view, viewport, { expanded: false });
    const expanded = buildMapPlan(view, viewport, { expanded: true });

    expect(expanded.cells.map((c) => [c.x, c.y])).toEqual(collapsed.cells.map((c) => [c.x, c.y]));
    expect(expanded.cellSize).toBeGreaterThan(collapsed.cellSize);
  });

  // @spec PRESENT-MAP-005
  it('draws a party marker carrying its facing', () => {
    const plan = buildMapPlan(view, viewport, { expanded: false });

    expect(plan.party).toMatchObject({ x: 1, y: 1, facing: Direction.NORTH });
  });

  // @spec PRESENT-MAP-006
  it('drops the party marker in the dark while keeping every discovered cell', () => {
    const plan = buildMapPlan({ ...view, party: null }, viewport, { expanded: false });

    expect(plan.party).toBeNull();
    expect(plan.cells).toHaveLength(2);
  });

  // @spec PRESENT-MAP-007
  it('emits a stroke per drawn edge, carrying the edge kind', () => {
    const plan = buildMapPlan(view, viewport, { expanded: false });

    const north = plan.edges.find((e) => e.x === 1 && e.y === 1 && e.direction === Direction.NORTH);
    const south = plan.edges.find((e) => e.x === 1 && e.y === 1 && e.direction === Direction.SOUTH);
    expect(north.kind).toBe(EdgeKind.WALL);
    expect(south.kind).toBe(EdgeKind.DOOR);
    // An open edge is nothing to draw.
    expect(plan.edges.some((e) => e.kind === EdgeKind.OPEN)).toBe(false);
  });

  // @spec PRESENT-MAP-010
  it('leaves a gap in an open door and bars a closed one', () => {
    const plan = buildMapPlan(view, viewport, { expanded: false });
    const find = (direction) =>
      plan.edges.find((e) => e.x === 1 && e.y === 1 && e.direction === direction);

    // A closed door is one unbroken run along the edge; an open one is its two posts.
    expect(find(Direction.SOUTH).segments).toHaveLength(1);
    expect(find(Direction.WEST).segments).toHaveLength(2);
    expect(find(Direction.WEST).open).toBe(true);
  });

  // @spec PRESENT-MAP-007
  it('draws every edge from segments decided in the plan', () => {
    const plan = buildMapPlan(view, viewport, { expanded: false });

    for (const edge of plan.edges) {
      expect(edge.segments.length).toBeGreaterThan(0);
      for (const [x1, y1, x2, y2] of edge.segments) {
        for (const n of [x1, y1, x2, y2]) expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  // @spec PRESENT-MAP-008
  it('marks known traps and features', () => {
    const plan = buildMapPlan(view, viewport, { expanded: false });

    expect(plan.cells.find((c) => c.x === 2).trapKnown).toBe(true);
    expect(plan.cells.find((c) => c.x === 2).feature).toBe(TileFeature.STAIRS_DOWN);
    expect(plan.cells.find((c) => c.x === 1).trapKnown).toBe(false);
  });

  // @spec PRESENT-MAP-009
  it('draws an enemy marker only where the view reports one', () => {
    const plan = buildMapPlan(view, viewport, { expanded: false });

    expect(plan.enemies).toHaveLength(1);
    expect(plan.enemies[0]).toMatchObject({ x: 2, y: 1 });

    expect(buildMapPlan({ ...view, enemies: [] }, viewport, { expanded: false }).enemies).toEqual([]);
  });

  // @spec PRESENT-MAP-011
  it('carries one shared creature marker for every enemy, decided in the plan', () => {
    const two = { ...view, enemies: [{ id: 'r1', x: 2, y: 1 }, { id: 'r2', x: 1, y: 1 }] };
    const plan = buildMapPlan(two, viewport, { expanded: false });

    for (const enemy of plan.enemies) {
      // A head, horns, and eyes: more than the party's triangle or a trap's dot, and
      // every enemy gets the same one.
      expect(enemy.marker.head.radius).toBeGreaterThan(0);
      expect(enemy.marker.horns).toHaveLength(2);
      expect(enemy.marker.eyes).toHaveLength(2);
    }
    const [a, b] = plan.enemies;
    expect(a.marker.head.radius).toBe(b.marker.head.radius);
    expect(a.marker.head.x).not.toBe(b.marker.head.x);
  });
});

describe('tap regions', () => {
  // @spec PRESENT-INPUT-004
  it('defines every region as a fraction of the viewport', () => {
    for (const region of TouchLayout) {
      expect(region.fx).toBeGreaterThanOrEqual(0);
      expect(region.fx + region.fw).toBeLessThanOrEqual(1.000001);
      expect(region.fy + region.fh).toBeLessThanOrEqual(1.000001);
    }
  });

  // @spec PRESENT-INPUT-005
  it('scales a zone with the viewport, covering the screen being its job', () => {
    const at = (vp, name) => tapRegionsFor(vp).find((r) => r.region === name);

    expect(at({ width: 800, height: 600 }, 'FORWARD').width)
      .toBeCloseTo(at({ width: 400, height: 300 }, 'FORWARD').width * 2);
  });

  // @spec PRESENT-CTRL-012
  it('bounds every button, so none of them spans a wide window', () => {
    const wide = { width: 2400, height: 1000 };
    const column = contentColumn(wide);
    const buttons = tapRegionsFor(wide).filter(
      (r) => !['FORWARD', 'BACKWARD', 'TURN_LEFT', 'TURN_RIGHT'].includes(r.region),
    );

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button.width).toBeLessThan(column.width);
  });

  // @spec PRESENT-CTRL-012
  it('keeps the row along the bottom inside the centred column', () => {
    const wide = { width: 2400, height: 1000 };
    const column = contentColumn(wide);
    const inColumn = TouchLayout.filter((r) => r.anchor === Anchor.COLUMN).map((r) => r.region);
    const regions = tapRegionsFor(wide).filter((r) => inColumn.includes(r.region));

    expect(regions.length).toBeGreaterThan(0);
    for (const region of regions) {
      expect(region.x).toBeGreaterThanOrEqual(column.x - 1);
      expect(region.x + region.width).toBeLessThanOrEqual(column.x + column.width + 1);
    }
  });

  // @spec PRESENT-CTRL-012
  it('leaves a corner widget in its corner rather than dragging it inward', () => {
    const wide = { width: 2400, height: 1000 };
    const map = tapRegionsFor(wide).find((r) => r.region === 'MAP');

    // Still over on the right, where the automap's opposite number belongs.
    expect(map.x + map.width).toBeGreaterThan(wide.width * 0.9);
  });

  // @spec PRESENT-CTRL-014
  it('puts the backward zone under the forward one, neither taking room from the other', () => {
    const forward = tapRegionsFor(viewport).find((r) => r.region === 'FORWARD');
    const back = tapRegionsFor(viewport).find((r) => r.region === 'BACKWARD');

    expect(back).toBeDefined();
    expect(back.y).toBeGreaterThanOrEqual(forward.y + forward.height);
    expect(hitTest(viewport, viewport.width / 2, back.y + back.height / 2)).toBe('BACKWARD');
  });

  // @spec PRESENT-INPUT-002
  it('hit-tests a press to the region under it', () => {
    const centre = hitTest(viewport, viewport.width / 2, viewport.height * 0.3);

    expect(centre).toBe('FORWARD');
  });

  // @spec PRESENT-INPUT-003
  it('resolves a press outside every region to nothing', () => {
    expect(hitTest(viewport, -10, -10)).toBeNull();
  });
});
