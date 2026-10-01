/**
 * Items: what a character carries, and the numbers a fight reads off it.
 *
 * This module says what an item *is*. The party says which item sits in which slot;
 * combat says what happens when one is swung. Nothing here holds state — a definition
 * is a value, and the only mutable thing is the slot pointing at it.
 *
 * The three formulas live here because a weapon, a rank and an attribute meet in
 * exactly one place, and the party and combat both read them rather than each keeping
 * a copy to drift from.
 */

import { Attribute, skillRank } from './party.js';

/** @spec ITEM-DEF-002 */
export const ItemKind = { WEAPON: 'WEAPON', ARMOUR: 'ARMOUR', SHIELD: 'SHIELD' };

/**
 * Where a thing is worn or held. A shield takes the off hand, which is what makes a
 * shield and a second weapon one decision rather than two unrelated ones.
 *
 * @spec ITEM-DEF-003
 */
export const Slot = { MAIN_HAND: 'MAIN_HAND', OFF_HAND: 'OFF_HAND', BODY: 'BODY' };

/** The base everybody is hit against before anything they are or carry is counted. */
export const BASE_DEFENCE = 20;

const ACCURACY_PER_RANK = 5;
const ACCURACY_PER_PERCEPTION = 2;
const DEFENCE_PER_DEXTERITY = 2;
const DEFENCE_PER_ARMOUR_RANK = 3;
const DAMAGE_PER_RANK = 0.1;
const DAMAGE_PER_ATTRIBUTE = 0.04;

/**
 * An item, as authored or as handed over.
 *
 * Every field it behaves by is carried on it: nothing anywhere asks what it is called
 * to decide what it does.
 *
 * @spec ITEM-DEF-001
 * @spec ITEM-DEF-004
 * @spec ITEM-DEF-005
 * @spec ITEM-DEF-006
 * @spec ITEM-DEF-007
 */
export function createItem({
  id, name, kind, slot,
  skill = null, damage = 0, accuracy = 0, governs = Attribute.MIGHT,
  armour = 0, defence = 0, classes = null,
}) {
  return {
    id,
    name,
    kind,
    slot,
    // A weapon's skill, or the skill a piece of armour is worn under.
    skill,
    damage,
    accuracy,
    // Might by default; a finesse weapon names Dexterity and trains the same skill.
    // @spec ITEM-DEF-008
    governs,
    armour,
    defence,
    // Nothing named means anybody may hold it.
    // @spec ITEM-DATA-004
    classes: classes ? [...classes] : null,
  };
}

const held = (combatant, slot) => combatant?.equipment?.[slot] ?? null;

/**
 * What a combatant swings: whatever is in the main hand, or the attack they were
 * authored with.
 *
 * The fallback is not a special case for monsters. It is what a natural weapon is, and
 * a character who has been disarmed reaches it by the same route a goblin always does.
 *
 * @spec ITEM-HOLD-001
 * @spec ITEM-HOLD-003
 */
export function weaponOf(combatant) {
  const wielded = held(combatant, Slot.MAIN_HAND);
  if (wielded) return wielded;

  const natural = combatant?.attack;
  if (!natural) return null;
  return {
    skill: natural.skill ?? null,
    damage: natural.baseDamage ?? 0,
    accuracy: natural.accuracy ?? 0,
    governs: natural.governs ?? Attribute.MIGHT,
  };
}

/**
 * What a combatant turns: what is on the body, or what they were authored to turn.
 *
 * @spec ITEM-HOLD-002
 * @spec ITEM-HOLD-003
 */
export function armourOf(combatant) {
  const worn = held(combatant, Slot.BODY);
  return worn ? worn.armour : (combatant?.armour ?? 0);
}

const score = (combatant, attribute) => combatant?.attributes?.[attribute] ?? 10;

/**
 * Accuracy is practice and eyesight: the weapon in hand, the rank behind it, and how
 * much the wielder notices.
 *
 * Perception governs for every weapon whatever its damage draws on, so that a mighty
 * character hits harder rather than more often — one attribute compounding twice in
 * the same swing is the thing this avoids.
 *
 * @spec ITEM-NUM-001
 * @spec ITEM-NUM-004
 * @spec ITEM-NUM-006
 */
export function accuracyWith(combatant) {
  const weapon = weaponOf(combatant);
  if (!weapon) return 0;

  return weapon.accuracy
    + ACCURACY_PER_RANK * skillRank(combatant, weapon.skill)
    + ACCURACY_PER_PERCEPTION * (score(combatant, Attribute.PERCEPTION) - 10);
}

/**
 * Defence is what it takes to avoid being hit, which is a different thing entirely
 * from what it takes to survive being hit.
 *
 * Armour is deliberately not in this line: it reduces the damage of a blow that landed
 * and does nothing else. A shield is here because turning a blow aside is the whole of
 * what a shield does.
 *
 * @spec ITEM-NUM-002
 * @spec ITEM-NUM-005
 * @spec ITEM-NUM-006
 */
export function defenceOf(combatant) {
  const worn = held(combatant, Slot.BODY);
  const offHand = held(combatant, Slot.OFF_HAND);
  // Only a shield adds; a second weapon in the same slot adds nothing.
  // @spec ITEM-HOLD-004
  const shield = offHand?.kind === ItemKind.SHIELD ? offHand.defence : 0;

  return BASE_DEFENCE
    + DEFENCE_PER_DEXTERITY * (score(combatant, Attribute.DEXTERITY) - 10)
    + DEFENCE_PER_ARMOUR_RANK * (worn ? skillRank(combatant, worn.skill) : 0)
    + shield;
}

/**
 * Damage is practice and force, and the attribute is the weapon's to name.
 *
 * @spec ITEM-NUM-003
 * @spec ITEM-NUM-006
 */
export function baseDamageWith(combatant) {
  const weapon = weaponOf(combatant);
  if (!weapon) return 0;

  return weapon.damage
    * (1 + DAMAGE_PER_RANK * skillRank(combatant, weapon.skill))
    * (1 + DAMAGE_PER_ATTRIBUTE * (score(combatant, weapon.governs) - 10));
}

/** @spec ITEM-WIELD-001 */
export function fitsSlot(item, slot) {
  return Boolean(item) && item.slot === slot;
}

/**
 * Whether a class may hold this, asked of the item rather than of the class.
 *
 * Content has to flow one way: adding a weapon must not mean editing four classes. And
 * what a class may *train* is a different question from what it may *hold*, so nothing
 * here reads a skill table.
 *
 * @spec ITEM-WIELD-002
 * @spec ITEM-WIELD-003
 */
export function wieldableBy(item, characterClass) {
  if (!item) return false;
  if (!item.classes) return true;
  return item.classes.includes(characterClass);
}
