import { describe, it, expect, vi } from 'vitest';
import { createFloor, setEdge, EdgeKind, Direction } from './floor.js';
import {
  createExploration,
  perform,
  tickCount,
  advanceForCamp,
  setCombatActive,
  setMenuOpen,
  Verb,
  PartyAction,
} from './exploration.js';

// 3x3, fully open interior, party in the middle facing north.
function explorationAt(tile = { x: 1, y: 1 }, extra = {}) {
  const floor = createFloor({ id: 'f1', width: 3, height: 3 });
  return createExploration({
    floors: [floor],
    floorId: 'f1',
    tile,
    facing: Direction.NORTH,
    ...extra,
  });
}

describe('the clock', () => {
  // @spec EXPLORE-CLOCK-001
  it('advances one tick when the party enters a new tile', () => {
    const state = explorationAt();
    const before = tickCount(state);

    perform(state, { verb: Verb.STEP_FORWARD });

    expect(tickCount(state)).toBe(before + 1);
  });

  // @spec EXPLORE-CLOCK-002
  it('advances one tick when the party searches its current tile', () => {
    const state = explorationAt();

    perform(state, { partyAction: PartyAction.SEARCH, commit: true });

    expect(tickCount(state)).toBe(1);
  });

  // @spec EXPLORE-CLOCK-003
  it('advances one tick when the party relights a doused source', () => {
    const state = explorationAt();

    perform(state, { relight: true });

    expect(tickCount(state)).toBe(1);
  });

  // @spec EXPLORE-CLOCK-004
  it('advances by the number of ticks the camp segment specifies', () => {
    const state = explorationAt();

    advanceForCamp(state, 8);

    expect(tickCount(state)).toBe(8);
  });

  // @spec EXPLORE-CLOCK-005
  it('does not advance for any reason while combat is active', () => {
    const state = explorationAt();
    setCombatActive(state, true);

    perform(state, { verb: Verb.STEP_FORWARD });
    perform(state, { partyAction: PartyAction.SEARCH, commit: true });
    perform(state, { relight: true });

    expect(tickCount(state)).toBe(0);
  });

  // @spec EXPLORE-CLOCK-006
  it('does not advance when the party turns, in any direction', () => {
    const state = explorationAt();

    perform(state, { verb: Verb.TURN_LEFT });
    perform(state, { verb: Verb.TURN_RIGHT });
    perform(state, { verb: Verb.TURN_AROUND });

    expect(tickCount(state)).toBe(0);
  });

  // @spec EXPLORE-CLOCK-007
  it('does not advance when a step is blocked', () => {
    // Facing north from (1,0) walks into the border wall.
    const state = explorationAt({ x: 1, y: 0 });

    const result = perform(state, { verb: Verb.STEP_FORWARD });

    expect(result.blocked).toBe(true);
    expect(tickCount(state)).toBe(0);
  });

  // @spec EXPLORE-CLOCK-008
  it('does not advance while the automap, inventory, or a menu is open', () => {
    const state = explorationAt();
    setMenuOpen(state, true);

    perform(state, { partyAction: PartyAction.TOGGLE_MAP });
    perform(state, { partyAction: PartyAction.INVENTORY });
    perform(state, { partyAction: PartyAction.PARTY });

    expect(tickCount(state)).toBe(0);
  });

  // @spec EXPLORE-CLOCK-009
  it('routes the camp segment through exploration rather than letting it write the counter', () => {
    const state = explorationAt();

    // The counter is not writable from outside; camp must ask for an advance.
    expect(() => {
      state.ticks = 500;
    }).toThrow();

    advanceForCamp(state, 3);
    expect(tickCount(state)).toBe(3);
  });

  // @spec EXPLORE-BOUND-006
  it('notifies the hunger segment of every tick advanced', () => {
    const onTick = vi.fn();
    const state = explorationAt({ x: 1, y: 1 }, { hooks: { onTick } });

    perform(state, { verb: Verb.STEP_FORWARD });
    advanceForCamp(state, 6);

    expect(onTick).toHaveBeenNthCalledWith(1, 1);
    expect(onTick).toHaveBeenNthCalledWith(2, 6);
  });
});

describe('party actions and the clock', () => {
  // @spec EXPLORE-ACTION-002
  it('charges nothing for opening a party action', () => {
    const state = explorationAt();

    perform(state, { partyAction: PartyAction.INVENTORY });
    perform(state, { partyAction: PartyAction.PARTY });
    perform(state, { partyAction: PartyAction.SPELLS });

    expect(tickCount(state)).toBe(0);
  });

  // @spec EXPLORE-ACTION-003
  it('charges one tick for committing to a party action', () => {
    const state = explorationAt();

    perform(state, { partyAction: PartyAction.INVENTORY, commit: true });

    expect(tickCount(state)).toBe(1);
  });

  // @spec EXPLORE-ACTION-004
  it('never charges a tick for toggling the map, even when committed', () => {
    const state = explorationAt();

    perform(state, { partyAction: PartyAction.TOGGLE_MAP });
    perform(state, { partyAction: PartyAction.TOGGLE_MAP, commit: true });

    expect(tickCount(state)).toBe(0);
  });

  // @spec EXPLORE-ACTION-001
  it('accepts exactly the six defined party actions', () => {
    expect(Object.values(PartyAction).sort()).toEqual(
      ['PARTY', 'INVENTORY', 'SPELLS', 'SEARCH', 'INTERACT', 'TOGGLE_MAP'].sort(),
    );
  });

  // @spec EXPLORE-ACTION-006
  it('accepts no movement verb or party action while in combat', () => {
    const state = explorationAt();
    setCombatActive(state, true);

    expect(perform(state, { verb: Verb.STEP_FORWARD }).rejected).toBe(true);
    expect(perform(state, { partyAction: PartyAction.SEARCH }).rejected).toBe(true);
  });

  // @spec EXPLORE-BOUND-009
  it('routes each party action to its owning segment rather than handling it', () => {
    const onPartyAction = vi.fn();
    const state = explorationAt({ x: 1, y: 1 }, { hooks: { onPartyAction } });

    perform(state, { partyAction: PartyAction.SPELLS, commit: true });

    expect(onPartyAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: PartyAction.SPELLS }),
    );
  });
});
