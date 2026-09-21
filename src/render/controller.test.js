import { describe, it, expect, vi } from 'vitest';
import { createFloor, setEdge, setTileFeature, EdgeKind, TileFeature, Direction } from '../sim/floor.js';
import { createLightSource } from '../sim/light.js';
import { createExploration, partyPosition, tickCount } from '../sim/exploration.js';
import { createParty, createCharacter, addCharacter, CharacterClass, Row } from '../sim/party.js';
import { beginEncounter, createEnemy, createEnemyGroup } from '../sim/combat.js';
import { makeRng } from '../sim/rng.js';
import { PIXI_APP_OPTIONS } from './appconfig.js';
import { createController, pressKey, pressPointer, releasePointer, resize, layers } from './controller.js';

const viewport = { width: 800, height: 600 };

const hud = (controller) => layers(controller).find((l) => l.name === 'hud').plan;
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
  // @spec PRESENT-SCENE-010
  it('names every layer in every drawing, in order, whether or not it has anything to show', () => {
    const { controller } = harness();

    expect(layers(controller).map((l) => l.name)).toEqual(['view', 'map', 'fight', 'hud']);
    // Nothing is fighting, so that layer is named and empty rather than left out.
    expect(layers(controller).find((l) => l.name === 'fight').plan).toBeNull();
  });

  // @spec PRESENT-SCENE-002
  it('starts the renderer with its ticker stopped', () => {
    expect(PIXI_APP_OPTIONS.autoStart).toBe(false);
  });

  // @spec PRESENT-SCENE-007
  it('keeps no copy of game state, only references to it and what it needs to draw', () => {
    const { controller, state } = harness();

    // The simulation is referenced, never duplicated.
    expect(controller.state).toBe(state);
    // Nothing here is a copy of anything the simulation owns.
    for (const key of ['party', 'floors', 'roamers', 'ticks', 'discoveredTiles', 'lightSources']) {
      expect(controller).not.toHaveProperty(key);
    }
    // What it does keep is the view's own business.
    expect(controller.expanded).toBe(false);
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

    expect(hud(controller).prompt).toBeNull();
  });

  // @spec PRESENT-PROMPT-001
  it('draws a prompt describing the confirmation the simulation is holding', () => {
    const { controller } = harness({ withStairs: true });

    pressKey(controller, 'w'); // steps toward the staircase

    expect(hud(controller).prompt).toMatchObject({ kind: 'STAIRS' });
  });

  // @spec PRESENT-PROMPT-003
  it('discards movement and party actions while a prompt is up', () => {
    const { controller, state } = harness({ withStairs: true });
    pressKey(controller, 'w');

    pressKey(controller, 'a'); // a turn, which would otherwise be accepted
    pressKey(controller, 'f'); // a search, which would otherwise cost a tick

    expect(partyPosition(state).facing).toBe(Direction.NORTH);
    expect(tickCount(state)).toBe(0);
    expect(hud(controller).prompt).not.toBeNull();
  });

  // @spec PRESENT-PROMPT-004
  // @spec PRESENT-PROMPT-005
  it('confirms on Enter, taking the party through', () => {
    const { controller, state } = harness({ withStairs: true });
    pressKey(controller, 'w');

    pressKey(controller, 'Enter');

    expect(partyPosition(state).tile).toEqual({ x: 0, y: 0 });
    expect(hud(controller).prompt).toBeNull();
  });

  // @spec PRESENT-PROMPT-004
  // @spec PRESENT-PROMPT-005
  it('declines on Escape, walking onto the staircase instead of through it', () => {
    const { controller, state } = harness({ withStairs: true });
    pressKey(controller, 'w');

    pressKey(controller, 'Escape');

    // The step is taken; the connector is not.
    expect(partyPosition(state).tile).toEqual({ x: 3, y: 2 });
    expect(partyPosition(state).floorId).toBe('f1');
    expect(hud(controller).prompt).toBeNull();
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

describe('input while a fight is on', () => {
  function inFight() {
    const { state } = harness();
    const party = createParty();
    addCharacter(party, createCharacter({ id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, row: Row.FRONT }));

    const encounter = beginEncounter({
      party,
      enemies: createEnemyGroup([createEnemy({ id: 'g1', name: 'Goblin', row: Row.FRONT, hitPoints: 40, potValue: 10 })]),
      light: 'BRIGHT',
      awareness: { party: true, enemies: true },
      rng: makeRng(2),
      origin: { floorId: 'f1', x: 1, y: 1 },
    });

    const campaign = { encounter, state, concludeEncounter: () => { campaign.encounter = null; }, fleeEncounter: () => {} };
    const onDraw = vi.fn();
    const controller = createController({ state, campaign, viewport, onDraw });
    onDraw.mockClear();
    return { controller, state, campaign };
  }

  // @spec PRESENT-FIGHT-012
  it('accepts no movement verb while a fight is running', () => {
    const { controller, state } = inFight();
    const held = partyPosition(state);

    for (const key of ['w', 'a', 'd', 's']) pressKey(controller, key);

    expect(partyPosition(state)).toEqual(held);
    expect(tickCount(state)).toBe(0);
  });

  // @spec PRESENT-FIGHT-012
  it('accepts no party action while a fight is running', () => {
    const { controller, state } = inFight();

    pressKey(controller, 'f'); // search
    pressKey(controller, 'm'); // the map

    expect(tickCount(state)).toBe(0);
    expect(controller.expanded).toBe(false);
  });

  // @spec PRESENT-FIGHT-001
  // @spec PRESENT-SCENE-010
  it('draws the fight and empties the map, naming both either way', () => {
    const { controller } = inFight();
    const drawn = layers(controller);

    expect(drawn.map((l) => l.name)).toEqual(['view', 'map', 'fight', 'hud']);
    expect(drawn.find((l) => l.name === 'fight').plan).not.toBeNull();
    expect(drawn.find((l) => l.name === 'map').plan).toBeNull();
  });
});

describe('when a fight ends', () => {
  // @spec PRESENT-SCENE-010
  it('leaves nothing of the fight behind', () => {
    const { state } = harness();
    const party = createParty();
    addCharacter(party, createCharacter({ id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, row: Row.FRONT }));
    const encounter = beginEncounter({
      party,
      enemies: createEnemyGroup([createEnemy({ id: 'g1', name: 'Goblin', row: Row.FRONT, hitPoints: 40, potValue: 10 })]),
      light: 'BRIGHT',
      awareness: { party: true, enemies: true },
      rng: makeRng(2),
      origin: { floorId: 'f1', x: 1, y: 1 },
    });
    const campaign = { encounter, state, concludeEncounter: () => { campaign.encounter = null; }, fleeEncounter: () => {} };
    const controller = createController({ state, campaign, viewport, onDraw: vi.fn() });

    const named = (name) => layers(controller).find((l) => l.name === name).plan;
    expect(named('fight')).not.toBeNull();

    // The fight is over and the campaign has moved on.
    campaign.encounter = null;

    // Every layer is still named, so the one with nothing to show is cleared rather
    // than left holding its last drawing.
    expect(layers(controller).map((l) => l.name)).toEqual(['view', 'map', 'fight', 'hud']);
    expect(named('fight')).toBeNull();
    expect(named('map')).not.toBeNull();
  });

  // @spec PRESENT-SCENE-010
  it('gives the walking controls back once the fight layer empties', () => {
    const { controller, campaign } = (() => {
      const { state } = harness();
      const party = createParty();
      addCharacter(party, createCharacter({ id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, row: Row.FRONT }));
      const encounter = beginEncounter({
        party,
        enemies: createEnemyGroup([createEnemy({ id: 'g1', name: 'Goblin', row: Row.FRONT, hitPoints: 40, potValue: 10 })]),
        light: 'BRIGHT', awareness: { party: true, enemies: true },
        rng: makeRng(3), origin: { floorId: 'f1', x: 1, y: 1 },
      });
      const campaign = { encounter, state, concludeEncounter: () => { campaign.encounter = null; }, fleeEncounter: () => {} };
      return { controller: createController({ state, campaign, viewport, onDraw: vi.fn() }), campaign };
    })();

    const hudControls = () => layers(controller).find((l) => l.name === 'hud').plan.controls;
    expect(hudControls()).toEqual([]);

    campaign.encounter = null;

    expect(hudControls().length).toBeGreaterThan(0);
  });
});

describe('holding a control', () => {
  const hudControls = (controller) =>
    layers(controller).find((l) => l.name === 'hud').plan.controls;

  // @spec PRESENT-CTRL-008
  it('outlines the one under the finger, and only while it is down', () => {
    const { controller } = harness();
    const forward = hudControls(controller).find((c) => c.region === 'FORWARD');
    expect(forward.pressed).toBe(false);

    pressPointer(controller, forward.x + forward.width / 2, forward.y + forward.height / 2);
    expect(hudControls(controller).find((c) => c.region === 'FORWARD').pressed).toBe(true);

    releasePointer(controller);
    expect(hudControls(controller).some((c) => c.pressed)).toBe(false);
  });

  // @spec PRESENT-CTRL-009
  it('holds at most one at a time', () => {
    const { controller } = harness();
    const left = hudControls(controller).find((c) => c.region === 'TURN_LEFT');
    const right = hudControls(controller).find((c) => c.region === 'TURN_RIGHT');

    pressPointer(controller, left.x + left.width / 2, left.y + left.height / 2);
    pressPointer(controller, right.x + right.width / 2, right.y + right.height / 2);

    const held = hudControls(controller).filter((c) => c.pressed);
    expect(held).toHaveLength(1);
    expect(held[0].region).toBe('TURN_RIGHT');
  });

  // @spec PRESENT-CTRL-008
  it('redraws when the finger lifts, so the outline actually goes', () => {
    const { controller, onDraw } = harness();
    const forward = hudControls(controller).find((c) => c.region === 'FORWARD');
    pressPointer(controller, forward.x + forward.width / 2, forward.y + forward.height / 2);
    onDraw.mockClear();

    releasePointer(controller);

    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  // @spec PRESENT-CTRL-008
  it('shows a control held even when its action changed nothing', () => {
    const { floor, controller } = harness();
    // Walled in, so stepping forward is refused and no state changes.
    setEdge(floor, 3, 3, Direction.NORTH, EdgeKind.WALL);
    const forward = hudControls(controller).find((c) => c.region === 'FORWARD');

    pressPointer(controller, forward.x + forward.width / 2, forward.y + forward.height / 2);

    expect(hudControls(controller).find((c) => c.region === 'FORWARD').pressed).toBe(true);
  });

  // @spec PRESENT-CTRL-008
  it('does nothing on a release when nothing was held', () => {
    const { controller, onDraw } = harness();
    onDraw.mockClear();

    expect(releasePointer(controller)).toBe(false);
    expect(onDraw).not.toHaveBeenCalled();
  });
});
