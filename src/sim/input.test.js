import { describe, it, expect } from 'vitest';
import {
  actionForKey,
  actionForTouch,
  boundActions,
  TouchRegion,
} from './input.js';
import { Verb, PartyAction } from './exploration.js';

const everyAction = [...Object.values(Verb), ...Object.values(PartyAction)];

describe('the action vocabulary', () => {
  // @spec EXPLORE-INPUT-001
  it('binds every movement verb and party action to a keyboard path', () => {
    const bound = boundActions().map((b) => b.action);

    for (const action of everyAction) {
      expect(bound).toContain(action);
    }
    for (const binding of boundActions()) {
      expect(binding.keys.length).toBeGreaterThan(0);
    }
  });

  // @spec EXPLORE-INPUT-001
  it('binds every movement verb and party action to a touch path', () => {
    for (const binding of boundActions()) {
      expect(binding.region).toBeDefined();
    }
  });

  // @spec EXPLORE-INPUT-001
  it('leaves no touch region bound to two different actions', () => {
    const regions = boundActions().map((b) => b.region);

    expect(new Set(regions).size).toBe(regions.length);
  });

  // @spec EXPLORE-INPUT-001
  it('leaves no key bound to two different actions', () => {
    const keys = boundActions().flatMap((b) => b.keys);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('resolving input', () => {
  // @spec EXPLORE-INPUT-002
  it('produces an identical action from the keyboard and from touch', () => {
    expect(actionForKey('w')).toEqual(actionForTouch(TouchRegion.FORWARD));
    expect(actionForKey('ArrowUp')).toEqual(actionForTouch(TouchRegion.FORWARD));
    expect(actionForKey('s')).toEqual(actionForTouch(TouchRegion.BACKWARD));
    expect(actionForKey('m')).toEqual(actionForTouch(TouchRegion.MAP));
    expect(actionForKey('i')).toEqual(actionForTouch(TouchRegion.PACK));
  });

  // @spec EXPLORE-INPUT-002
  it('resolves the arrow keys and their letter equivalents to the same action', () => {
    expect(actionForKey('ArrowLeft')).toEqual(actionForKey('a'));
    expect(actionForKey('ArrowRight')).toEqual(actionForKey('d'));
    expect(actionForKey('ArrowDown')).toEqual(actionForKey('s'));
  });

  // @spec EXPLORE-INPUT-002
  it('ignores the case of a letter key', () => {
    expect(actionForKey('W')).toEqual(actionForKey('w'));
    expect(actionForKey('E')).toEqual(actionForKey('e'));
  });

  // @spec EXPLORE-INPUT-003
  it('says nothing about which device produced the action', () => {
    const fromKey = actionForKey('w');
    const fromTouch = actionForTouch(TouchRegion.FORWARD);

    for (const resolved of [fromKey, fromTouch]) {
      expect(Object.keys(resolved)).not.toContain('device');
      expect(Object.keys(resolved)).not.toContain('source');
      expect(Object.keys(resolved)).not.toContain('input');
    }
  });

  // @spec EXPLORE-INPUT-002
  it('resolves unbound input to nothing rather than guessing', () => {
    expect(actionForKey('z')).toBeNull();
    expect(actionForKey('F7')).toBeNull();
    expect(actionForTouch('NOWHERE')).toBeNull();
  });

  // @spec EXPLORE-INPUT-001
  it('maps the movement verbs to the expected keys', () => {
    expect(actionForKey('w')).toEqual({ verb: Verb.STEP_FORWARD });
    expect(actionForKey('a')).toEqual({ verb: Verb.TURN_LEFT });
    expect(actionForKey('d')).toEqual({ verb: Verb.TURN_RIGHT });
    expect(actionForKey('s')).toEqual({ verb: Verb.STEP_BACKWARD });
    expect(actionForKey('x')).toEqual({ verb: Verb.TURN_AROUND });
  });

  // @spec EXPLORE-INPUT-001
  it('maps the party actions to the expected keys', () => {
    expect(actionForKey('p')).toEqual({ partyAction: PartyAction.PARTY });
    expect(actionForKey('i')).toEqual({ partyAction: PartyAction.INVENTORY });
    expect(actionForKey('c')).toEqual({ partyAction: PartyAction.SPELLS });
    expect(actionForKey('f')).toEqual({ partyAction: PartyAction.SEARCH });
    expect(actionForKey('e')).toEqual({ partyAction: PartyAction.INTERACT });
    expect(actionForKey('m')).toEqual({ partyAction: PartyAction.TOGGLE_MAP });
  });
});
