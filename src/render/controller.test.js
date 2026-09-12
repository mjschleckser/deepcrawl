import { describe, it, expect, vi } from 'vitest';
import { createFloor, setEdge, setTileFeature, EdgeKind, TileFeature, Direction } from '../sim/floor.js';
import { createLightSource } from '../sim/light.js';
import { createExploration, partyPosition, tickCount } from '../sim/exploration.js';
import { PIXI_APP_OPTIONS } from './appconfig.js';
import { createController, pressKey, pressPointer, resize, layers } from './controller.js';

const viewport = { width: 800, height: 600 };
const lamp = () =>
  createLightSource({ id: 'l', brightRadius: 2, dimRadius: 5, remainingTicks: 99, lit: true });

function harness({ withStairs = false } = {}) {
  const floor = createFloor({ id: 'f1', width: 7, height: 7 });
  if (withStairs) {
    setTileFeature(floor, 3, 2, TileFeature.STAIRS_DOWN, {
      target: { floorId: 'f1', x: 0, y: 0 },
    });
  }
  const state = createExploration({
    floors: [floor],
    floorId: 'f1',
    tile: { x: 3, y: 3 },
    facing: Direction.NORTH,
    lightSources: [lamp()],
  });
  const onDraw = vi.fn();
  const controller = createController({ state, viewport, onDraw });
  onDraw.mockClear(); // ignore the initial draw
  return { floor, state, controller, onDraw };
}

describe('the scene', () => {
  // @spec PRESENT-SCENE-001
  it('presents three layers, view then map then HUD', () => {
    const { controller } = harness();

    expect(layers(controller).map((l) => l.name)).toEqual(['view', 'map', 'hud']);
  });

  // @spec PRESENT-SCENE-002
  it('starts the renderer with its ticker stopped', () => {
    expect(PIXI_APP_OPTIONS.autoStart).toBe(false);
  });

  // @spec PRESENT-SCENE-007
  it('keeps no game state of its own', () => {
    const { controller } = harness();

    // Only what is needed to draw: the viewport and whether the map is expanded.
    expect(Object.keys(controller).sort()).toEqual(['expanded', 'onDraw', 'state', 'viewport']);
  });

  // @spec PRESENT-SCENE-006
  it('rebuilds its layers on every draw rather than reusing the last ones', () => {
    const { controller } = harness();

    const first = layers(controller);
    const second = layers(controller);

    expect(second).not.toBe(first);
    expect(second[0].plan).not.toBe(first[0].plan);
  });
});

describe('when the screen redraws', () => {
  // @spec PRESENT-SCENE-003
  it('redraws after a step, which changes position', () => {
    const { controller, onDraw } = harness();

    pressKey(controller, 'w');

    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  // @spec PRESENT-SCENE-003
  it('redraws after a turn, which changes facing without advancing the clock', () => {
    const { controller, state, onDraw } = harness();
    const before = tickCount(state);

    pressKey(controller, 'a');

    expect(tickCount(state)).toBe(before);
    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  // @spec PRESENT-SCENE-005
  it('does not redraw when a step is blocked and nothing changes', () => {
    const { floor, controller, onDraw } = harness();
    setEdge(floor, 3, 3, Direction.NORTH, EdgeKind.WALL);

    pressKey(controller, 'w');

    expect(onDraw).not.toHaveBeenCalled();
  });

  // @spec PRESENT-SCENE-005
  it('does not redraw for a key bound to nothing', () => {
    const { controller, onDraw } = harness();

    pressKey(controller, 'z');

    expect(onDraw).not.toHaveBeenCalled();
  });

  // @spec PRESENT-SCENE-004
  it('redraws when the window is resized, and rescales with it', () => {
    const { controller, onDraw } = harness();

    resize(controller, { width: 1200, height: 900 });

    expect(onDraw).toHaveBeenCalledTimes(1);
    expect(layers(controller)[1].plan.bounds.width).toBeGreaterThan(0);
  });

  // @spec PRESENT-SCENE-004
  // @spec PRESENT-MAP-003
  it('expands and collapses the map, redrawing each time', () => {
    const { controller, onDraw } = harness();

    pressKey(controller, 'm');
    expect(controller.expanded).toBe(true);

    pressKey(controller, 'm');
    expect(controller.expanded).toBe(false);
    expect(onDraw).toHaveBeenCalledTimes(2);
  });
});

describe('input routing', () => {
  // @spec PRESENT-INPUT-001
  it('performs the action a key resolves to', () => {
    const { controller, state } = harness();

    pressKey(controller, 'w');

    expect(partyPosition(state).tile).toEqual({ x: 3, y: 2 });
  });

  // @spec PRESENT-INPUT-002
  it('performs the action a pointer press resolves to', () => {
    const { controller, state } = harness();

    // Upper centre of the view is the forward region.
    pressPointer(controller, viewport.width / 2, viewport.height * 0.3);

    expect(partyPosition(state).tile).toEqual({ x: 3, y: 2 });
  });

  // @spec PRESENT-INPUT-003
  it('discards a press that lands in no region', () => {
    const { controller, state } = harness();

    pressPointer(controller, -50, -50);

    expect(partyPosition(state).tile).toEqual({ x: 3, y: 3 });
  });

  // @spec PRESENT-INPUT-006
  it('produces identical results from the keyboard and from touch', () => {
    const viaKey = harness();
    const viaTouch = harness();

    pressKey(viaKey.controller, 'w');
    pressPointer(viaTouch.controller, viewport.width / 2, viewport.height * 0.3);

    expect(partyPosition(viaKey.state)).toEqual(partyPosition(viaTouch.state));
    expect(tickCount(viaKey.state)).toBe(tickCount(viaTouch.state));
  });
});

describe('prompts', () => {
  // @spec PRESENT-PROMPT-002
  it('draws no prompt while the simulation holds none', () => {
    const { controller } = harness();

    expect(layers(controller)[2].plan.prompt).toBeNull();
  });

  // @spec PRESENT-PROMPT-001
  it('draws a prompt describing the confirmation the simulation is holding', () => {
    const { controller } = harness({ withStairs: true });

    pressKey(controller, 'w'); // steps toward the staircase

    expect(layers(controller)[2].plan.prompt).toMatchObject({ kind: 'STAIRS' });
  });

  // @spec PRESENT-PROMPT-003
  it('discards movement and party actions while a prompt is up', () => {
    const { controller, state } = harness({ withStairs: true });
    pressKey(controller, 'w');

    pressKey(controller, 'a'); // a turn, which would otherwise be accepted
    pressKey(controller, 'f'); // a search, which would otherwise cost a tick

    expect(partyPosition(state).facing).toBe(Direction.NORTH);
    expect(tickCount(state)).toBe(0);
    expect(layers(controller)[2].plan.prompt).not.toBeNull();
  });

  // @spec PRESENT-PROMPT-004
  // @spec PRESENT-PROMPT-005
  it('confirms on Enter, taking the party through', () => {
    const { controller, state } = harness({ withStairs: true });
    pressKey(controller, 'w');

    pressKey(controller, 'Enter');

    expect(partyPosition(state).tile).toEqual({ x: 0, y: 0 });
    expect(layers(controller)[2].plan.prompt).toBeNull();
  });

  // @spec PRESENT-PROMPT-004
  // @spec PRESENT-PROMPT-005
  it('declines on Escape, leaving the party where it stood at no cost', () => {
    const { controller, state } = harness({ withStairs: true });
    pressKey(controller, 'w');

    pressKey(controller, 'Escape');

    expect(partyPosition(state).tile).toEqual({ x: 3, y: 3 });
    expect(tickCount(state)).toBe(0);
    expect(layers(controller)[2].plan.prompt).toBeNull();
  });

  // @spec PRESENT-PROMPT-004
  it('redraws when a prompt is answered', () => {
    const { controller, onDraw } = harness({ withStairs: true });
    pressKey(controller, 'w');
    onDraw.mockClear();

    pressKey(controller, 'Enter');

    expect(onDraw).toHaveBeenCalledTimes(1);
  });
});
