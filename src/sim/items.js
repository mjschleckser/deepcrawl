/**
 * Items: what a character carries, and the numbers a fight reads off it.
 *
 * This module says what an item *is*. The party says which item sits in which slot;
 * combat says what happens when one is swung. Nothing here holds state — a definition
 * is a value, and the only mutable thing is the slot pointing at it.
 *
 * Base damage and armour are assembled here because a weapon, a rank and an attribute
 * meet in exactly one place, and the party and combat both read them rather than each
 * keeping a copy to drift from.
 */

import { Attribute, skillRank } from './party.js';

/**
 * A consumable is the one kind that is used up rather than worn, and so the one kind
 * with no slot.
 *
 * @spec ITEM-DEF-002
 */
export const ItemKind = {
  WEAPON: 'WEAPON', ARMOUR: 'ARMOUR', SHIELD: 'SHIELD', CONSUMABLE: 'CONSUMABLE',
};

/**
 * How rare an item is. The tier belongs to the item, so a legendary blade is legendary
 * in every table that holds it and in every place it is drawn.
 *
 * @spec ITEM-DEF-012
 */
export const Rarity = {
  COMMON: 'COMMON', UNCOMMON: 'UNCOMMON', RARE: 'RARE', EPIC: 'EPIC', LEGENDARY: 'LEGENDARY',
};

/** @spec ITEM-DEF-012 */
export const RARITY_ORDER = [
  Rarity.COMMON, Rarity.UNCOMMON, Rarity.RARE, Rarity.EPIC, Rarity.LEGENDARY,
];

/**
 * What using a consumable does. Healing is the only effect so far.
 *
 * @spec ITEM-DEF-013
 */
export const Effect = { HEAL: 'heal' };

/**
 * Where a thing is worn or held. A shield takes the off hand, which is what makes a
 * shield and a second weapon one decision rather than two unrelated ones.
 *
 * @spec ITEM-DEF-003
 */
export const Slot = { MAIN_HAND: 'MAIN_HAND', OFF_HAND: 'OFF_HAND', BODY: 'BODY' };

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
 * @spec ITEM-DEF-012
 * @spec ITEM-DEF-013
 */
export function createItem({
  id, name, kind, slot = null, rarity = Rarity.COMMON,
  skill = null, damage = 0, governs = Attribute.MIGHT,
  armour = 0, classes = null, effect = null,
}) {
  const consumable = kind === ItemKind.CONSUMABLE;
  return {
    id,
    name,
    kind,
    // A consumable is used up rather than worn, so it never names a slot.
    slot: consumable ? null : slot,
    // @spec ITEM-DATA-005
    rarity: rarity ?? Rarity.COMMON,
    // A weapon's skill, or the skill a piece of armour is worn under.
    skill,
    damage,
    // Might by default; a finesse weapon names Dexterity and trains the same skill.
    // @spec ITEM-DEF-008
    governs,
    // What body armour turns, or what a shield adds to it.
    armour,
    // Nothing named means anybody may hold it.
    // @spec ITEM-DATA-004
    classes: classes ? [...classes] : null,
    // What using it does: only a consumable has one.
    effect: consumable && effect ? { ...effect } : null,
  };
}

/** Whether an item is used up rather than worn. */
export const isConsumable = (item) => item?.kind === ItemKind.CONSUMABLE;

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
    governs: natural.governs ?? Attribute.MIGHT,
  };
}

/**
 * What a combatant turns: what is on the body, or what they were authored to turn, and
 * on top of it whatever a shield in the off hand turns. A shield is armour you hold.
 *
 * @spec ITEM-HOLD-002
 * @spec ITEM-HOLD-003
 * @spec ITEM-HOLD-004
 * @spec ITEM-NUM-006
 */
export function armourOf(combatant) {
  const worn = held(combatant, Slot.BODY);
  const body = worn ? worn.armour : (combatant?.armour ?? 0);
  // Only a shield adds; a second weapon in the same slot turns nothing.
  const offHand = held(combatant, Slot.OFF_HAND);
  const shield = offHand?.kind === ItemKind.SHIELD ? (offHand.armour ?? 0) : 0;
  return body + shield;
}

const score = (combatant, attribute) => combatant?.attributes?.[attribute] ?? 10;

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

/**
 * A consumable fits no slot, which is what keeps it out of every hand.
 *
 * @spec ITEM-WIELD-001
 * @spec ITEM-WIELD-004
 */
export function fitsSlot(item, slot) {
  return Boolean(item) && !isConsumable(item) && item.slot === slot;
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
