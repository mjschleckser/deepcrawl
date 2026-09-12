import { describe, it, expect } from 'vitest';
import { createFloor, setTileLight, LightLevel, Direction } from './floor.js';
import { createLightSource, projectedLevel, brighter } from './light.js';
import {
  createExploration,
  perform,
  advanceForCamp,
  setCombatActive,
  enterCamp,
  breakCamp,
  douseLight,
  lightSources,
  litSource,
  resolveTileLight,
  Verb,
} from './exploration.js';

const torch = (over = {}) =>
  createLightSource({ id: 'torch', brightRadius: 1, dimRadius: 3, remainingTicks: 5, lit: true, ...over });

function lit(sources, opts = {}) {
  const floor = createFloor({ id: 'f1', width: 7, height: 7 });
  return {
    floor,
    state: createExploration({
      floors: [floor],
      floorId: 'f1',
      tile: { x: 3, y: 3 },
      facing: Direction.NORTH,
      lightSources: sources,
      ...opts,
    }),
  };
}

describe('light sources', () => {
  // @spec EXPLORE-LIGHT-004
  it('refuses a source whose bright radius is not smaller than its dim radius', () => {
    expect(() => createLightSource({ id: 'bad', brightRadius: 3, dimRadius: 3 })).toThrow();
    expect(() => createLightSource({ id: 'bad', brightRadius: 4, dimRadius: 2 })).toThrow();
    expect(() => createLightSource({ id: 'ok', brightRadius: 1, dimRadius: 2 })).not.toThrow();
  });

  // @spec EXPLORE-LIGHT-003
  it('projects bright within the bright radius and dim beyond it', () => {
    const source = torch(); // bright 1, dim 3

    expect(projectedLevel(0, source)).toBe(LightLevel.BRIGHT);
    expect(projectedLevel(1, source)).toBe(LightLevel.BRIGHT);
    expect(projectedLevel(2, source)).toBe(LightLevel.DIM);
    expect(projectedLevel(3, source)).toBe(LightLevel.DIM);
    expect(projectedLevel(4, source)).toBe(LightLevel.DARK);
  });

  // @spec EXPLORE-LIGHT-003
  it('projects nothing from an unlit source', () => {
    expect(projectedLevel(0, torch({ lit: false }))).toBe(LightLevel.DARK);
  });

  // @spec EXPLORE-LIGHT-005
  it('tracks each carried source as its own instance', () => {
    const { state } = lit([torch({ id: 'a', lit: true }), torch({ id: 'b', remainingTicks: 9 })]);
    const [a, b] = lightSources(state);

    expect(a.id).toBe('a');
    expect(b.id).toBe('b');
    expect(a.remainingTicks).toBe(5);
    expect(b.remainingTicks).toBe(9);
    expect(a.lit).toBe(true);
    expect(b.lit).toBe(false);
  });

  // @spec EXPLORE-LIGHT-006
  it('keeps at most one source lit, even when handed several already lit', () => {
    const { state } = lit([
      torch({ id: 'a', lit: true }),
      torch({ id: 'b', lit: true }),
      torch({ id: 'c', lit: true }),
    ]);

    expect(lightSources(state).filter((s) => s.lit)).toHaveLength(1);
    expect(litSource(state).id).toBe('a');
  });
});

describe('light levels on tiles', () => {
  // @spec EXPLORE-LIGHT-001
  it('resolves every tile to exactly one of the three levels', () => {
    const { state, floor } = lit([torch({ lit: true })]);
    const levels = Object.values(LightLevel);

    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        expect(levels).toContain(resolveTileLight(state, x, y));
      }
    }
  });

  // @spec EXPLORE-LIGHT-002
  it('takes the brighter of the tile intrinsic level and what the party projects', () => {
    const { state, floor } = lit([torch({ lit: true })]); // party at (3,3), bright 1, dim 3

    // Far corner, beyond the torch, but intrinsically lit by the dungeon itself.
    setTileLight(floor, 0, 0, LightLevel.BRIGHT);
    expect(resolveTileLight(state, 0, 0)).toBe(LightLevel.BRIGHT);

    // Adjacent tile is dark in itself, but sits inside the bright ring.
    expect(resolveTileLight(state, 3, 2)).toBe(LightLevel.BRIGHT);
  });

  // @spec EXPLORE-LIGHT-002
  it('leaves a tile dark when neither the dungeon nor the party lights it', () => {
    const { state } = lit([torch({ lit: false })]);

    expect(resolveTileLight(state, 0, 0)).toBe(LightLevel.DARK);
    expect(resolveTileLight(state, 3, 3)).toBe(LightLevel.DARK);
  });

  // @spec EXPLORE-LIGHT-002
  it('ranks the three levels so brighter always wins', () => {
    expect(brighter(LightLevel.DARK, LightLevel.DIM)).toBe(LightLevel.DIM);
    expect(brighter(LightLevel.DIM, LightLevel.BRIGHT)).toBe(LightLevel.BRIGHT);
    expect(brighter(LightLevel.BRIGHT, LightLevel.DARK)).toBe(LightLevel.BRIGHT);
  });
});

describe('burning down', () => {
  // @spec EXPLORE-LIGHT-007
  it('burns only the lit source, one tick at a time', () => {
    const { state } = lit([torch({ id: 'a', lit: true }), torch({ id: 'b' })]);

    perform(state, { verb: Verb.STEP_FORWARD });

    const [a, b] = lightSources(state);
    expect(a.remainingTicks).toBe(4);
    expect(b.remainingTicks).toBe(5);
  });

  // @spec EXPLORE-LIGHT-008
  it('lights the next unspent source when the lit one is spent', () => {
    const { state } = lit([
      torch({ id: 'a', lit: true, remainingTicks: 1 }),
      torch({ id: 'b' }),
    ]);

    perform(state, { verb: Verb.STEP_FORWARD });

    const [a, b] = lightSources(state);
    expect(a.remainingTicks).toBe(0);
    expect(a.spent).toBe(true);
    expect(a.lit).toBe(false);
    expect(b.lit).toBe(true);
  });

  // @spec EXPLORE-LIGHT-008
  it('leaves the party in the dark when the last source is spent', () => {
    const { state } = lit([torch({ id: 'a', lit: true, remainingTicks: 1 })]);

    perform(state, { verb: Verb.STEP_FORWARD });

    expect(litSource(state)).toBeNull();
    expect(resolveTileLight(state, 3, 2)).toBe(LightLevel.DARK);
  });
});

describe('dousing and relighting', () => {
  // @spec EXPLORE-LIGHT-009
  it('does not light another source when an external effect douses the lit one', () => {
    const { state } = lit([torch({ id: 'a', lit: true }), torch({ id: 'b' })]);

    douseLight(state);

    expect(litSource(state)).toBeNull();
    expect(lightSources(state).every((s) => !s.lit)).toBe(true);
  });

  // @spec EXPLORE-LIGHT-013
  it('relights the same doused instance with its fuel intact', () => {
    const { state } = lit([torch({ id: 'a', lit: true, remainingTicks: 4 }), torch({ id: 'b' })]);

    douseLight(state);
    perform(state, { relight: true });

    // The same torch comes back rather than a fresh one being spent; it is down to 3
    // only because the tick the relight costs burns it like any other tick.
    expect(litSource(state).id).toBe('a');
    expect(litSource(state).remainingTicks).toBe(3);
    expect(lightSources(state)[1].remainingTicks).toBe(5);
    expect(lightSources(state)[1].lit).toBe(false);
  });

  // @spec EXPLORE-LIGHT-010
  it('spends a character action rather than a tick when relighting during combat', () => {
    const { state } = lit([torch({ id: 'a', lit: true })]);
    douseLight(state);
    setCombatActive(state, true);

    const result = perform(state, { relight: true });

    expect(result.consumedAction).toBe(true);
    expect(litSource(state).id).toBe('a');
  });
});

describe('light and camp', () => {
  // @spec EXPLORE-LIGHT-014
  it('puts carried light out for the duration of a camp, so camp ticks do not burn it', () => {
    const { state } = lit([torch({ id: 'a', lit: true, remainingTicks: 5 })]);

    enterCamp(state);
    advanceForCamp(state, 8);

    expect(lightSources(state).every((s) => !s.lit)).toBe(true);
    expect(lightSources(state)[0].remainingTicks).toBe(5);
  });

  // @spec EXPLORE-LIGHT-015
  it('relights the source that was burning when camp began', () => {
    const { state } = lit([torch({ id: 'a', lit: true }), torch({ id: 'b' })]);

    enterCamp(state);
    advanceForCamp(state, 8);
    breakCamp(state);

    expect(litSource(state).id).toBe('a');
  });

  // @spec EXPLORE-LIGHT-015
  it('leaves the party dark on breaking camp if the source it had is gone', () => {
    const { state } = lit([torch({ id: 'a', lit: true, remainingTicks: 1 })]);

    // Burn the torch out before camping.
    perform(state, { verb: Verb.STEP_FORWARD });
    enterCamp(state);
    breakCamp(state);

    expect(litSource(state)).toBeNull();
  });
});
