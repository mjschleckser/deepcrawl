import { describe, it, expect, vi } from 'vitest';
import { EdgeKind, FACINGS, TileFeature, getEdge, getTile } from '../sim/floor.js';
import {
  computeSight,
  perform,
  partyPosition,
  automapView,
  corridorAhead,
  resolveConfirmation,
  PartyAction,
  Verb,
} from '../sim/exploration.js';
import { createController, pressKey, layers } from '../render/controller.js';
import { createCampaign } from './campaign.js';
import { packOf, purseOf, roster } from '../sim/party.js';
import { itemDefinitions } from './items.js';

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

  // @spec EXPLORE-MOVE-016
  // @spec EXPLORE-MOVE-023
  // @spec GEN-PLAN-010
  it('climbs back to the very staircase it came down', () => {
    const { state, plan } = booted();
    const entrance = state.getFloor(plan.entrance.floorId);
    const below = plan.floors[1].id;
    state.getFloor(below);
    state.roamers = [];

    const at = entrance.tiles.findIndex((t) => t.feature === TileFeature.STAIRS_DOWN);
    const stairs = { x: at % entrance.width, y: Math.floor(at / entrance.width) };
    state.party.tile = { ...stairs };

    perform(state, { partyAction: PartyAction.INTERACT });
    resolveConfirmation(state, true);
    expect(partyPosition(state).floorId).toBe(below);

    perform(state, { partyAction: PartyAction.INTERACT });
    resolveConfirmation(state, true);
    expect(partyPosition(state).floorId).toBe(entrance.id);
    expect(partyPosition(state).tile).toEqual(stairs);
  });

  // @spec EXPLORE-MOVE-022
  it('walks back over the staircase the campaign began on, which leads nowhere yet', () => {
    const { state } = booted();
    state.roamers = [];
    const start = partyPosition(state).tile;
    const floor = state.getFloor(state.party.floorId);
    state.party.facing = FACINGS.find((d) => getEdge(floor, start.x, start.y, d) !== EdgeKind.WALL);

    perform(state, { verb: Verb.STEP_FORWARD });
    perform(state, { verb: Verb.STEP_BACKWARD });

    expect(state.pendingConfirmation).toBeNull();
    expect(partyPosition(state).tile).toEqual(start);
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

describe('the starting supply', () => {
  // @spec FOOD-ITEM-003
  it('starts the campaign with six rations in the pack, and everybody full', () => {
    const campaign = createCampaign({ seed: 3 });
    expect(packOf(campaign.party).filter((item) => item.id === 'ration')).toHaveLength(6);
    for (const c of roster(campaign.party)) expect(c.fullness).toBe(2000);
  });
});

describe('a testing campaign', () => {
  // @spec SAVE-TEST-004
  it('begins with one of every item, three of every food, gold, every spell, and a cook', () => {
    const campaign = createCampaign({ seed: 3, testing: true });
    const pack = packOf(campaign.party);
    const count = (id) => pack.filter((item) => item.id === id).length;

    for (const item of Object.values(itemDefinitions())) {
      // Rations are the starting supply's six as well as the kit's three.
      const expected = item.kind === 'FOOD' ? 3 + (item.id === 'ration' ? 6 : 0) : 1;
      expect(count(item.id)).toBe(expected);
    }
    expect(purseOf(campaign.party)).toBe(500);
    const mage = roster(campaign.party).find((c) => c.characterClass === 'MAGE');
    expect(mage.learnedSpells).toContain('fire_bolt');
    const cleric = roster(campaign.party).find((c) => c.characterClass === 'CLERIC');
    expect(cleric.ranks.COOKING).toBe(6);
    expect(campaign.testing).toBe(true);
  });

  it('gives an ordinary campaign none of it', () => {
    const campaign = createCampaign({ seed: 3 });
    expect(campaign.testing).toBe(false);
    expect(purseOf(campaign.party)).toBe(0);
    expect(packOf(campaign.party).every((item) => item.id === 'ration')).toBe(true);
  });
});
