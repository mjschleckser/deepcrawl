import { describe, it, expect, vi } from 'vitest';
import { Direction, TileFeature } from '../sim/floor.js';
import {
  computeSight,
  partyPosition,
  automapView,
  corridorAhead,
  isTileDiscovered,
  litSource,
} from '../sim/exploration.js';
import { createController, pressKey, layers } from '../render/controller.js';
import { createStarterGame, STARTER_START } from './starter-floor.js';

const viewport = { width: 800, height: 600 };

function booted() {
  const state = createStarterGame();
  computeSight(state);
  const onDraw = vi.fn();
  const controller = createController({ state, viewport, onDraw });
  return { state, controller, onDraw };
}

describe('the starter floor', () => {
  it('puts the party somewhere lit, with a torch and a spare', () => {
    const { state } = booted();

    expect(partyPosition(state).tile).toEqual({ x: STARTER_START.x, y: STARTER_START.y });
    expect(litSource(state).id).toBe('torch-1');
    expect(state.lightSources).toHaveLength(2);
  });

  it('gives the party something to see from where it starts', () => {
    const { state } = booted();

    expect(corridorAhead(state).length).toBeGreaterThan(1);
    expect(automapView(state).tiles.length).toBeGreaterThan(0);
  });

  it('draws a non-empty first-person view and map on the first frame', () => {
    const { controller } = booted();

    const [view, map] = layers(controller);
    expect(view.plan.shapes.length).toBeGreaterThan(0);
    expect(map.plan.cells.length).toBeGreaterThan(0);
  });

  it('is walkable: the party can leave its starting tile', () => {
    const { state, controller } = booted();

    // The entrance corridor runs north from the start.
    pressKey(controller, 'w');

    expect(partyPosition(state).tile).not.toEqual({ x: STARTER_START.x, y: STARTER_START.y });
  });

  it('reveals new ground as the party turns and walks', () => {
    const { state, controller } = booted();
    const before = automapView(state).tiles.length;

    pressKey(controller, 'w');
    pressKey(controller, 'd');
    pressKey(controller, 'w');

    expect(automapView(state).tiles.length).toBeGreaterThan(before);
  });

  it('holds a staircase and a pit to fall down', () => {
    const { state } = booted();
    const floor = state.floors.get('vestibule');

    const features = floor.tiles.map((tile) => tile.feature);
    expect(features).toContain(TileFeature.STAIRS_DOWN);
    expect(features).toContain(TileFeature.PIT);
  });

  it('keeps the secret door secret until it is searched for', () => {
    const { state } = booted();

    // Walk the party around a little, then confirm nothing revealed the chamber behind
    // the secret door by sight alone.
    expect(isTileDiscovered(state, 'vestibule', 7, 2)).toBe(false);
  });
});
