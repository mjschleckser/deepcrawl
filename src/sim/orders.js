/**
 * Standing orders: what a character usually does, said once.
 *
 * Pure rule evaluation over a described situation. This module knows nothing about an
 * encounter, a party, or a floor — combat assembles the situation and reads the answer
 * back, which is what lets the whole vocabulary be tested flat.
 */

/** What a rule may ask about before it proposes anything. */
export const When = {
  ALWAYS: 'ALWAYS',
  ALLY_BELOW: 'ALLY_BELOW',
  NO_ALLY_BELOW: 'NO_ALLY_BELOW',
  ONCE: 'ONCE',
  SLOT_REMAINS: 'SLOT_REMAINS',
  FRONT_BROKEN: 'FRONT_BROKEN',
};

/** What a rule may aim at. */
export const Aim = {
  WEAKEST_ENEMY: 'WEAKEST_ENEMY',
  FRONT_ENEMY: 'FRONT_ENEMY',
  WEAKEST_ALLY: 'WEAKEST_ALLY',
  NAMED_ALLY: 'NAMED_ALLY',
  SELF: 'SELF',
};

/**
 * One line of an order list.
 *
 * @spec COMBAT-ORDER-001
 */
export function createRule({ when, action, aim, share = 0.5, allyId = null }) {
  return { when, action, aim, share, allyId };
}

/**
 * A character is one of their own allies, so a cleric alone still has somebody to heal.
 *
 * @spec COMBAT-ORDER-015
 */
const conscious = (situation) => situation.allies.filter((a) => a.conscious);

/**
 * @spec COMBAT-ORDER-008
 * @spec COMBAT-ORDER-009
 */
function holds(rule, index, situation) {
  switch (rule.when) {
    case When.ALWAYS:
      return true;
    case When.ALLY_BELOW:
      return conscious(situation).some((a) => a.hitPoints < a.maxHitPoints * rule.share);
    case When.NO_ALLY_BELOW:
      return !conscious(situation).some((a) => a.hitPoints < a.maxHitPoints * rule.share);
    case When.ONCE:
      return !situation.taken.has(index);
    case When.SLOT_REMAINS:
      return (situation.slots?.[rule.action.rank] ?? 0) > 0;
    case When.FRONT_BROKEN:
      return situation.frontBroken;
    default:
      return false;
  }
}

/**
 * Whoever the rule points at, or null where it points at nobody.
 *
 * Candidates are read in the order the situation lists them, which combat builds in the
 * order it acts combatants in — so two enemies on the same hit points are separated the
 * same way every time rather than by a roll.
 *
 * @spec COMBAT-ORDER-010
 * @spec COMBAT-ORDER-011
 * @spec COMBAT-ORDER-016
 */
function aimOf(rule, situation) {
  const fewest = (candidates) =>
    candidates.reduce((best, c) => (best === null || c.hitPoints < best.hitPoints ? c : best), null);

  switch (rule.aim) {
    case Aim.WEAKEST_ENEMY:
      return fewest(situation.enemies.filter((e) => e.targetable))?.id ?? null;
    case Aim.FRONT_ENEMY:
      return situation.enemies.find((e) => e.targetable && e.row === 'FRONT')?.id ?? null;
    case Aim.WEAKEST_ALLY:
      return fewest(conscious(situation))?.id ?? null;
    case Aim.NAMED_ALLY:
      return rule.allyId;
    case Aim.SELF:
      return situation.actorId;
    default:
      return null;
  }
}

/**
 * The first rule that holds and offers something legal, or null when none does.
 *
 * A rule that cannot be taken is passed over rather than offered and refused: an order
 * never proposes a thing the player would only be told no about.
 *
 * @spec COMBAT-ORDER-003
 * @spec COMBAT-ORDER-004
 * @spec COMBAT-ORDER-005
 */
export function proposeFrom(rules, situation) {
  for (const [index, rule] of rules.entries()) {
    if (!holds(rule, index, situation)) continue;

    const targetId = aimOf(rule, situation);
    if (targetId === null) continue;
    if (!situation.isLegal(rule.action, targetId)) continue;

    return { ruleIndex: index, action: rule.action, targetId };
  }
  return null;
}
