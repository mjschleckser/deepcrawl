/**
 * Input mapping: keyboard and touch onto one action vocabulary.
 *
 * Both paths resolve to the same action object, and that object carries no trace of
 * which device produced it — so the simulation cannot behave differently for a player
 * on a keyboard than for one with thumbs.
 */

import { Verb, PartyAction } from './exploration.js';

export const TouchRegion = {
  FORWARD: 'FORWARD',
  BACKWARD: 'BACKWARD',
  TURN_LEFT: 'TURN_LEFT',
  TURN_RIGHT: 'TURN_RIGHT',
  TURN_AROUND: 'TURN_AROUND',
  PARTY_BAR: 'PARTY_BAR',
  PACK: 'PACK',
  SPELL_ICON: 'SPELL_ICON',
  SEARCH_CONTROL: 'SEARCH_CONTROL',
  INTERACT_PROMPT: 'INTERACT_PROMPT',
  MAP: 'MAP',
};

/**
 * Every action the party has during exploration, with both of its paths.
 *
 * @spec EXPLORE-INPUT-001
 */
const BINDINGS = [
  { action: Verb.STEP_FORWARD, keys: ['w', 'ArrowUp'], region: TouchRegion.FORWARD },
  { action: Verb.STEP_BACKWARD, keys: ['s', 'ArrowDown'], region: TouchRegion.BACKWARD },
  { action: Verb.TURN_LEFT, keys: ['a', 'ArrowLeft'], region: TouchRegion.TURN_LEFT },
  { action: Verb.TURN_RIGHT, keys: ['d', 'ArrowRight'], region: TouchRegion.TURN_RIGHT },
  // The four keys under one hand walk the party; turning about is the verb reached by
  // repeating another, so it keeps a key of its own and no control.
  { action: Verb.TURN_AROUND, keys: ['x'], region: TouchRegion.TURN_AROUND },
  { action: PartyAction.PARTY, keys: ['p'], region: TouchRegion.PARTY_BAR },
  { action: PartyAction.INVENTORY, keys: ['i'], region: TouchRegion.PACK },
  { action: PartyAction.SPELLS, keys: ['c'], region: TouchRegion.SPELL_ICON },
  { action: PartyAction.SEARCH, keys: ['f'], region: TouchRegion.SEARCH_CONTROL },
  { action: PartyAction.INTERACT, keys: ['e'], region: TouchRegion.INTERACT_PROMPT },
  { action: PartyAction.TOGGLE_MAP, keys: ['m'], region: TouchRegion.MAP },
];

const VERBS = new Set(Object.values(Verb));

/**
 * Shape an action so both input paths produce exactly the same object, carrying no
 * record of where it came from.
 *
 * @spec EXPLORE-INPUT-002
 * @spec EXPLORE-INPUT-003
 */
function toAction(binding) {
  if (!binding) return null;
  return VERBS.has(binding.action)
    ? { verb: binding.action }
    : { partyAction: binding.action };
}

export function boundActions() {
  return BINDINGS.map((binding) => ({ ...binding, keys: [...binding.keys] }));
}

/**
 * Named keys (ArrowUp) keep their case; letter keys do not, so a player with caps
 * lock on still walks forward.
 *
 * @spec EXPLORE-INPUT-002
 */
export function actionForKey(key) {
  const normalised = key.length === 1 ? key.toLowerCase() : key;
  return toAction(BINDINGS.find((binding) => binding.keys.includes(normalised)));
}

/** @spec EXPLORE-INPUT-002 */
export function actionForTouch(region) {
  return toAction(BINDINGS.find((binding) => binding.region === region));
}
