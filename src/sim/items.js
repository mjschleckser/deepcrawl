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

import {
  Attribute, Skill, castingAttribute, classOf, ironcladArmourFactor, skillRank,
} from './party.js';
import { armourBonus, damageFactor } from './food.js';

/**
 * A consumable is the one kind that is used up rather than worn, and so the one kind
 * with no slot.
 *
 * @spec ITEM-DEF-002
 */
export const ItemKind = {
  WEAPON: 'WEAPON', ARMOUR: 'ARMOUR', SHIELD: 'SHIELD', CONSUMABLE: 'CONSUMABLE', FOOD: 'FOOD',
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
export const Effect = { HEAL: 'heal', TEACH: 'teach' };

/**
 * Where a thing is worn or held. A shield takes the off hand, which is what makes a
 * shield and a second weapon one decision rather than two unrelated ones.
 *
 * @spec ITEM-DEF-003
 */
export const Slot = { MAIN_HAND: 'MAIN_HAND', OFF_HAND: 'OFF_HAND', BODY: 'BODY' };

/**
 * What kind of thing an item is to wield. A class's file names the categories it may
 * hold, and an item names the one it belongs to, so neither names the other.
 *
 * @spec ITEM-DEF-016
 */
export const ItemCategory = {
  LIGHT_WEAPON: 'LIGHT_WEAPON',
  MARTIAL_BLADE: 'MARTIAL_BLADE',
  MARTIAL_BLUNT: 'MARTIAL_BLUNT',
  WAND: 'WAND',
  LIGHT_ARMOUR: 'LIGHT_ARMOUR',
  HEAVY_ARMOUR: 'HEAVY_ARMOUR',
  SHIELD: 'SHIELD',
};

/**
 * What a weapon names when its damage draws on whatever its wielder casts with.
 *
 * @spec ITEM-DEF-017
 */
export const CASTING = 'CASTING';

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
  armour = 0, category = null, effect = null, nourish = 0, heal = 0, traits = null,
}) {
  // Neither a consumable nor food is worn, so neither names a slot.
  const consumable = kind === ItemKind.CONSUMABLE || kind === ItemKind.FOOD;
  return {
    id,
    name,
    kind,
    // A consumable is used up rather than worn, so it never names a slot.
    slot: consumable ? null : slot,
    // @spec ITEM-DATA-005
    rarity: rarity ?? Rarity.COMMON,
    // What a weapon trains. Armour trains nothing.
    // @spec ITEM-DEF-005
    skill: kind === ItemKind.WEAPON ? skill : null,
    damage,
    // Might by default; a finesse weapon names Dexterity and trains the same skill.
    // @spec ITEM-DEF-008
    governs,
    // What body armour turns, or what a shield adds to it.
    armour,
    // Which kind of thing it is to wield. Nothing worn is without one; nothing used
    // up has one.
    // @spec ITEM-DEF-016
    category: consumable ? null : category,
    // What using it does: only a consumable has one.
    effect: kind === ItemKind.CONSUMABLE && effect ? { ...effect } : null,
    // What food adds to the pot.
    // @spec FOOD-ITEM-001
    ...(kind === ItemKind.FOOD ? { nourish, heal, traits: { ...(traits ?? {}) } } : {}),
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
 * @spec ITEM-NUM-009
 */
export function armourOf(combatant) {
  const worn = held(combatant, Slot.BODY);
  const body = worn ? worn.armour : (combatant?.armour ?? 0);
  // Only a shield adds; a second weapon in the same slot turns nothing.
  const offHand = held(combatant, Slot.OFF_HAND);
  const shield = offHand?.kind === ItemKind.SHIELD ? (offHand.armour ?? 0) : 0;
  // A fighter's Ironclad grows what is strapped on; a tough meal turns blows on top.
  return (body + shield) * ironcladArmourFactor(combatant) + armourBonus(combatant);
}

/**
 * A score by name, where the name may be the wielder's casting attribute: whatever
 * their class casts with, or the default score for a class that casts nothing.
 *
 * @spec ITEM-DEF-017
 */
const score = (combatant, attribute) => {
  const named = attribute === CASTING ? castingAttribute(combatant) : attribute;
  return named ? (combatant?.attributes?.[named] ?? 10) : 10;
};

/**
 * What a wand names as its skill: not one weapon skill, but the wielder's magic.
 *
 * @spec ITEM-DEF-014
 */
export const MAGIC_SKILL = 'MAGIC';

/**
 * The schools a wand may draw on, in the order a tie between them goes. Read when asked
 * rather than at load, because the party module that names them imports this one.
 */
const magicSchools = () => [Skill.EVOCATION, Skill.ALTERATION, Skill.HEALING, Skill.RESTORATION];

/**
 * The skill a combatant's weapon trains and grows with: its own, or for a wand, the
 * wielder's highest-ranked magic school, ties going in school order.
 *
 * @spec ITEM-DEF-014
 * @spec ITEM-NUM-007
 */
export function weaponSkill(combatant, weapon = weaponOf(combatant)) {
  if (!weapon) return null;
  if (weapon.skill !== MAGIC_SKILL) return weapon.skill;
  const schools = magicSchools();
  let best = schools[0];
  for (const school of schools) {
    if (skillRank(combatant, school) > skillRank(combatant, best)) best = school;
  }
  return best;
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
    * (1 + DAMAGE_PER_RANK * skillRank(combatant, weaponSkill(combatant, weapon)))
    * (1 + DAMAGE_PER_ATTRIBUTE * (score(combatant, weapon.governs) - 10))
    // Hunger weakens a blow; a hearty meal strengthens it.
    // @spec ITEM-NUM-008
    * damageFactor(combatant);
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
 * Whether a class may hold this: whether the class's file names the item's category.
 *
 * Content flows one way: adding a weapon names a category and edits no class. And what
 * a character has practised is a different question from what their class may hold, so
 * nothing here reads a skill. Something with no category — a potion — anyone may use.
 *
 * @spec ITEM-WIELD-002
 * @spec ITEM-WIELD-003
 */
export function wieldableBy(item, characterClass) {
  if (!item) return false;
  if (!item.category) return true;
  return classOf(characterClass)?.wields.includes(item.category) ?? false;
}
