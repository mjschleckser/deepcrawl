/**
 * Camp: where the party stops to recover what it has spent.
 *
 * Camping takes a long stretch of the exploration clock, during which roaming enemies
 * move as they would had the party walked; it is refused with an enemy in sight, and an
 * enemy that reaches the party while it rests breaks the camp. A camp that is not broken
 * restores spell slots, clears the last meal's buffs, and forages; the pot is offered after.
 */

import { canSee } from './sight.js';
import { restForCamp } from './exploration.js';
import { Condition } from './party.js';
import { restoreSlots } from './magic.js';
import { clearBuffs, forage } from './meals.js';

/** How long a rest takes, in ticks: many steps' worth. A placeholder to tune. */
export const CAMP_TICKS = 120;

export const CampOutcome = { RESTED: 'RESTED', BROKEN: 'BROKEN', REFUSED: 'REFUSED' };

/** Those still living rest; the dead, the ashes and the lost do not. */
const rests = (c) => c.condition === Condition.OK || c.condition === Condition.UNCONSCIOUS;

/**
 * Whether any roaming enemy on the party's floor is in sight, by the automap's rule:
 * within the sight distance with nothing opaque between.
 *
 * @spec CAMP-REST-001
 */
export function enemyInSight(state) {
  const floor = state.getFloor(state.party.floorId);
  return state.roamers.some((r) => r.floorId === floor.id && canSee(state, floor, r.x, r.y));
}

/**
 * Make camp, and say how it ended.
 *
 * @spec CAMP-REST-001
 * @spec CAMP-REST-002
 * @spec CAMP-REST-003
 * @spec CAMP-REST-004
 * @spec CAMP-REST-005
 * @spec CAMP-REST-006
 */
export function camp(state, party, { ticks = CAMP_TICKS, forageList = [], rng = null } = {}) {
  if (enemyInSight(state)) return { outcome: CampOutcome.REFUSED };

  // The rest's hunger is spent as the party sleeps, through the clock's own hook.
  // @spec CAMP-HUNGER-001
  restForCamp(state, ticks);
  // Something walked in while the party slept: the fight is on and the rest is lost.
  if (state.combatActive) return { outcome: CampOutcome.BROKEN };

  for (const c of party.members) if (rests(c)) restoreSlots(c);
  // The last meal's buffs are gone; the pot is what replaces them.
  // @spec CAMP-FOOD-001
  clearBuffs(party);
  // @spec CAMP-FOOD-002
  const foraged = rng ? forage(party, forageList, rng) : [];
  return { outcome: CampOutcome.RESTED, foraged };
}
