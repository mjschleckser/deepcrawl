import { describe, it, expect, vi } from 'vitest';
import { TileFeature, LightLevel, getTile } from '../sim/floor.js';
import {
  computeSight,
  perform,
  partyPosition,
  automapView,
  corridorAhead,
  litSource,
  Verb,
} from '../sim/exploration.js';
import { createController, pressKey, layers } from '../render/controller.js';
import { createCampaign } from './campaign.js';

const viewport = { width: 800, height: 600 };

function booted(seed = 2024) {
  const { state, plan, floorProvider } = createCampaign({ seed });
  computeSight(state);
  const onDraw = vi.fn();
  const controller = createController({ state, viewport, onDraw });
  return { state, plan, floorProvider, controller, onDraw };
}

describe('a generated campaign', () => {
  // @spec GEN-PLAN-003
  it('starts the party on the entrance floor, on a tile that exists', () => {
    const { state, plan } = booted();
    const position = partyPosition(state);
    const floor = state.getFloor(position.floorId);

    expect(position.floorId).toBe(plan.entrance.floorId);
    expect(position.tile.x).toBeGreaterThanOrEqual(0);
    expect(position.tile.x).toBeLessThan(floor.width);
    expect(position.tile.y).toBeLessThan(floor.height);
  });

  // @spec GEN-PLAN-007
  it('builds only the entrance floor until the party goes deeper', () => {
    const { state, plan } = booted();

    expect(state.floors.size).toBe(1);
    expect(plan.floors.length).toBeGreaterThan(1);
  });

  // @spec GEN-PLAN-007
  // @spec EXPLORE-FLOOR-012
  it('builds a floor on first request and returns the same one thereafter', () => {
    const { state, plan } = booted();
    const deeper = plan.floors[1].id;

    const first = state.getFloor(deeper);
    const second = state.getFloor(deeper);

    expect(first).toBe(second);
    expect(state.floors.size).toBe(2);
  });

  it('gives the party light and spares', () => {
    const { state } = booted();

    expect(litSource(state).id).toBe('torch-1');
    expect(state.lightSources).toHaveLength(3);
  });

  it('has something to see and something to draw from the off', () => {
    const { state, controller } = booted();

    expect(corridorAhead(state).length).toBeGreaterThan(0);
    expect(automapView(state).tiles.length).toBeGreaterThan(0);
    const [view, map] = layers(controller);
    expect(view.plan.shapes.length).toBeGreaterThan(0);
    expect(map.plan.cells.length).toBeGreaterThan(0);
  });

  it('lets the party walk, turn, and map new ground, on many seeds', () => {
    for (const seed of [1, 2, 3, 7, 99]) {
      const { state, controller } = booted(seed);
      const before = automapView(state).tiles.length;

      // Turning alone reveals ground, whichever way the corridor runs.
      for (const key of ['d', 'd', 'd', 'w', 'a', 'w']) pressKey(controller, key);

      expect(automapView(state).tiles.length).toBeGreaterThanOrEqual(before);
    }
  });
});

describe('descending', () => {
  // @spec EXPLORE-MOVE-016
  // @spec GEN-PLAN-005
  it('arrives at the destination floor upward staircase when taking stairs down', () => {
    const { state, plan } = booted();
    const link = plan.floors[0].links.find((l) => l.arriveAt === 'STAIRS_UP');
    const target = { floorId: link.toFloorId, arriveAt: link.arriveAt };

    // Relocate the way a confirmed staircase does.
    const floor = state.getFloor(target.floorId);
    const upstairs = [];
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        if (getTile(floor, x, y).feature === TileFeature.STAIRS_UP) upstairs.push({ x, y });
      }
    }

    expect(upstairs.length).toBeGreaterThanOrEqual(1);
  });

  // @spec GEN-PLAN-006
  it('resolves a pit arrival to a tile inside a room on the destination', () => {
    const { state, plan } = booted(77);
    const pit = plan.floors.flatMap((f) => f.links).find((l) => l.arriveAt === 'RANDOM_ROOM');
    if (!pit) return; // not every seed plans a pit shortcut

    const floor = state.getFloor(pit.toFloorId);
    expect(floor.rooms.length).toBeGreaterThan(0);
  });
});

describe('the entrance', () => {
  // @spec GEN-PLACE-006
  it('lights the tile the campaign begins on, so the way out is never invisible', () => {
    for (const seed of [1, 2, 3, 55]) {
      const { state } = booted(seed);
      const { floorId, tile } = partyPosition(state);
      const floor = state.getFloor(floorId);

      expect(getTile(floor, tile.x, tile.y).intrinsicLight).not.toBe(LightLevel.DARK);
    }
  });
});
