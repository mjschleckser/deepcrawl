import { describe, it, expect } from 'vitest';
import { TileFeature, EdgeKind, Direction } from '../sim/floor.js';
import {
  depthFrames, tapRegionsFor, hitTest, TouchLayout, contentColumn, Anchor,
} from './geometry.js';
import { buildViewPlan, shadeAt } from './viewplan.js';
import { shade } from './appconfig.js';
import { MapMode, buildMapPlan } from './mapplan.js';

const viewport = { width: 800, height: 600 };

const slice = (over = {}) => ({
  depth: 0,
  feature: TileFeature.NONE,
  walledLeft: true,
  walledRight: true,
  closedAhead: false,
  portalAhead: null,
  enemyHere: false,
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
  it('shades every shape by its depth alone, a fixed step darker each depth further', () => {
    const plan = buildViewPlan([0, 1, 2, 3, 4, 5, 6].map((depth) => slice({ depth })), viewport);

    for (const shape of plan.shapes) expect(shape.shade).toBe(shadeAt(shape.depth));
    const steps = [1, 2, 3, 4, 5, 6].map((d) => shadeAt(d - 1) - shadeAt(d));
    for (const step of steps) expect(step).toBeCloseTo(steps[0]);
    expect(shadeAt(0)).toBe(1);
    expect(shadeAt(6)).toBeGreaterThan(0);
  });

  // @spec PRESENT-VIEW-007
  it('darkens a colour in proportion, leaving it untouched at full shade', () => {
    expect(shade(0x6b5640, 1)).toBe(0x6b5640);
    expect(shade(0x6b5640, 0)).toBe(0x000000);
    expect(shade(0x804020, 0.5)).toBe(0x402010);
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

  // @spec PRESENT-VIEW-014
  it('draws a figure where the simulation reports an enemy', () => {
    const plan = buildViewPlan([slice(), slice({ depth: 1, enemyHere: true })], viewport);

    const [figure] = kinds(plan, 'figure');
    expect(figure).toBeDefined();
    expect(figure.depth).toBe(1);
    expect(kinds(buildViewPlan([slice()], viewport), 'figure')).toHaveLength(0);
  });

  // @spec PRESENT-VIEW-014
  it('stands the figure on the floor of the depth it is at, scaled to that frame', () => {
    const frames = depthFrames(viewport, 3);
    const plan = buildViewPlan([slice(), slice({ depth: 1, enemyHere: true })], viewport);

    const [figure] = kinds(plan, 'figure');
    // Its feet are on the floor of the frame it stands at, not floating in the middle.
    expect(figure.body.y + figure.body.height).toBeCloseTo(frames[2].y + frames[2].height);
    expect(figure.body.height).toBeLessThan(frames[2].height);
  });

  // @spec PRESENT-VIEW-014
  it('draws a nearer figure larger than a further one', () => {
    const near = buildViewPlan([slice(), slice({ depth: 1, enemyHere: true })], viewport);
    const far = buildViewPlan(
      [slice(), slice({ depth: 1 }), slice({ depth: 2 }), slice({ depth: 3, enemyHere: true })],
      viewport,
    );

    expect(kinds(near, 'figure')[0].body.height)
      .toBeGreaterThan(kinds(far, 'figure')[0].body.height);
  });

  // @spec PRESENT-VIEW-015
  it('gives the figure the horned head the automap marks an enemy with', () => {
    const plan = buildViewPlan([slice(), slice({ depth: 1, enemyHere: true })], viewport);

    const [figure] = kinds(plan, 'figure');
    expect(figure.head.radius).toBeGreaterThan(0);
    expect(figure.horns).toHaveLength(2);
    expect(figure.eyes).toHaveLength(2);
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
      { x: 1, y: 1, feature: TileFeature.NONE, edges: { NORTH: { kind: EdgeKind.WALL, open: false }, EAST: { kind: EdgeKind.OPEN, open: false }, SOUTH: { kind: EdgeKind.DOOR, open: false }, WEST: { kind: EdgeKind.DOOR, open: true } } },
      { x: 2, y: 1, feature: TileFeature.STAIRS_DOWN, edges: { NORTH: { kind: EdgeKind.WALL, open: false }, EAST: { kind: EdgeKind.WALL, open: false }, SOUTH: { kind: EdgeKind.OPEN, open: false }, WEST: { kind: EdgeKind.OPEN, open: false } } },
    ],
    party: { x: 1, y: 1, facing: Direction.NORTH },
    enemies: [{ id: 'r1', x: 2, y: 1 }],
  };

  // @spec PRESENT-MAP-001
  it('draws a cell for each discovered tile and no others', () => {
    const plan = buildMapPlan(view, viewport, { mode: MapMode.MINI });

    expect(plan.cells).toHaveLength(2);
    expect(plan.cells.map((c) => `${c.x},${c.y}`).sort()).toEqual(['1,1', '2,1']);
  });

  // @spec PRESENT-MAP-002
  it('sits in the top-left corner as a minimap, and grows when expanded', () => {
    const collapsed = buildMapPlan(view, viewport, { mode: MapMode.MINI });
    const expanded = buildMapPlan(view, viewport, { mode: MapMode.EXPANDED });

    expect(collapsed.bounds.width).toBeLessThan(viewport.width / 2);
    expect(collapsed.bounds.x).toBeLessThan(viewport.width / 4);
    expect(collapsed.bounds.y).toBeLessThan(viewport.height / 4);
    expect(expanded.bounds.width).toBeGreaterThan(collapsed.bounds.width);
  });

  // @spec PRESENT-MAP-002
  // @spec PRESENT-MAP-014
  it('lies under no control in either state, on any shape of screen', () => {
    const square = { ...view, width: 20, height: 20 };
    const tall = { ...view, width: 12, height: 30 };
    const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
      && a.y < b.y + b.height && a.y + a.height > b.y;
    const hidesUnder = new Set(['MAP', 'PARTY_BAR', 'ITEMS', 'SPELL_ICON']);

    for (const screen of [
      { width: 1258, height: 1279 }, { width: 390, height: 844 }, { width: 375, height: 667 },
      { width: 1920, height: 1080 }, { width: 800, height: 600 },
    ]) {
      const controls = tapRegionsFor(screen).filter((r) => hidesUnder.has(r.region));
      for (const floor of [square, tall]) {
        for (const mode of [MapMode.MINI, MapMode.EXPANDED]) {
          const { bounds } = buildMapPlan(floor, screen, { mode });
          for (const control of controls) expect(overlaps(bounds, control)).toBe(false);
        }
      }
    }
  });

  // @spec PRESENT-MAP-014
  it('fits the whole floor into the centred column when expanded, as large as it will go', () => {
    const screen = { width: 1258, height: 1279 };
    const column = contentColumn(screen);
    const { bounds } = buildMapPlan({ ...view, width: 20, height: 20 }, screen, { mode: MapMode.EXPANDED });

    expect(bounds.x).toBeGreaterThanOrEqual(column.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(column.x + column.width);
    // Bounded by one side of the free space, not shrunk for no reason.
    expect(bounds.width).toBeGreaterThan(column.width * 0.5);
  });

  // @spec PRESENT-MAP-004
  it('draws the same content at both scales, differing only in size', () => {
    const collapsed = buildMapPlan(view, viewport, { mode: MapMode.MINI });
    const expanded = buildMapPlan(view, viewport, { mode: MapMode.EXPANDED });

    expect(expanded.cells.map((c) => [c.x, c.y])).toEqual(collapsed.cells.map((c) => [c.x, c.y]));
    expect(expanded.cellSize).toBeGreaterThan(collapsed.cellSize);
  });

  // @spec PRESENT-MAP-005
  it('draws a party marker carrying its facing', () => {
    const plan = buildMapPlan(view, viewport, { mode: MapMode.MINI });

    expect(plan.party).toMatchObject({ x: 1, y: 1, facing: Direction.NORTH });
  });

  // @spec PRESENT-MAP-007
  it('emits a stroke per drawn edge, carrying the edge kind', () => {
    const plan = buildMapPlan(view, viewport, { mode: MapMode.MINI });

    const north = plan.edges.find((e) => e.x === 1 && e.y === 1 && e.direction === Direction.NORTH);
    const south = plan.edges.find((e) => e.x === 1 && e.y === 1 && e.direction === Direction.SOUTH);
    expect(north.kind).toBe(EdgeKind.WALL);
    expect(south.kind).toBe(EdgeKind.DOOR);
    // An open edge is nothing to draw.
    expect(plan.edges.some((e) => e.kind === EdgeKind.OPEN)).toBe(false);
  });

  // @spec PRESENT-MAP-010
  it('leaves a gap in an open door and bars a closed one', () => {
    const plan = buildMapPlan(view, viewport, { mode: MapMode.MINI });
    const find = (direction) =>
      plan.edges.find((e) => e.x === 1 && e.y === 1 && e.direction === direction);

    // A closed door is one unbroken run along the edge; an open one is its two posts.
    expect(find(Direction.SOUTH).segments).toHaveLength(1);
    expect(find(Direction.WEST).segments).toHaveLength(2);
    expect(find(Direction.WEST).open).toBe(true);
  });

  // @spec PRESENT-MAP-007
  it('draws every edge from segments decided in the plan', () => {
    const plan = buildMapPlan(view, viewport, { mode: MapMode.MINI });

    for (const edge of plan.edges) {
      expect(edge.segments.length).toBeGreaterThan(0);
      for (const [x1, y1, x2, y2] of edge.segments) {
        for (const n of [x1, y1, x2, y2]) expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  // @spec PRESENT-MAP-008
  it('marks features, and carries no trap mark', () => {
    const plan = buildMapPlan(view, viewport, { mode: MapMode.MINI });

    expect(plan.cells.find((c) => c.x === 2).feature).toBe(TileFeature.STAIRS_DOWN);
    for (const cell of plan.cells) expect(cell).not.toHaveProperty('trapKnown');
  });

  // @spec PRESENT-MAP-009
  it('draws an enemy marker only where the view reports one', () => {
    const plan = buildMapPlan(view, viewport, { mode: MapMode.MINI });

    expect(plan.enemies).toHaveLength(1);
    expect(plan.enemies[0]).toMatchObject({ x: 2, y: 1 });

    expect(buildMapPlan({ ...view, enemies: [] }, viewport, { mode: MapMode.MINI }).enemies).toEqual([]);
  });

  // @spec PRESENT-MAP-011
  it('carries one shared creature marker for every enemy, decided in the plan', () => {
    const two = { ...view, enemies: [{ id: 'r1', x: 2, y: 1 }, { id: 'r2', x: 1, y: 1 }] };
    const plan = buildMapPlan(two, viewport, { mode: MapMode.MINI });

    for (const enemy of plan.enemies) {
      // A head, horns, and eyes: more than the party's triangle, and
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
      (r) => !['FORWARD', 'TURN_LEFT', 'TURN_RIGHT'].includes(r.region),
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

  // @spec PRESENT-CTRL-002
  it('draws the Map control short, about as tall as it is wide on a phone', () => {
    const phone = { width: 400, height: 800 };
    const map = tapRegionsFor(phone).find((r) => r.region === 'MAP');
    expect(map.height).toBeLessThanOrEqual(map.width * 1.25);
  });

  // @spec PRESENT-CTRL-014
  it('draws no backward zone, and gives the forward zone the whole centre', () => {
    const regions = tapRegionsFor(viewport);
    const forward = regions.find((r) => r.region === 'FORWARD');
    const left = regions.find((r) => r.region === 'TURN_LEFT');

    expect(regions.map((r) => r.region)).not.toContain('BACKWARD');
    // As tall as the turn zones beside it, so the lower centre walks on too.
    expect(forward.y).toBe(left.y);
    expect(forward.height).toBe(left.height);
    expect(hitTest(viewport, viewport.width / 2, forward.y + forward.height * 0.9)).toBe('FORWARD');
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
