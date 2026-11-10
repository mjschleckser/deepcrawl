/**
 * Reading the authored items.
 *
 * Every weapon, every piece of armour and every shield is a file of its own under
 * `src/game-data/items`, which is content rather than code: a sword is edited without
 * opening a module, and adding one is adding a file. This module is the only place
 * that knows the files exist.
 *
 * JSON cannot name an enum, so everything arrives as a string and is checked here
 * against the real ones. A misspelled slot in a hand-edited file should say so by name
 * rather than quietly producing a sword nobody can hold.
 */

import { Attribute, Skill } from '../sim/party.js';
import {
  CASTING, Effect, ItemCategory, ItemKind, MAGIC_SKILL, Rarity, Slot, createItem,
} from '../sim/items.js';
import { spellDefinitions } from './spells.js';
import { Trait } from '../sim/food.js';
import FORAGE from '../game-data/forage.json';

const ITEM_FILES = import.meta.glob('../game-data/items/*.json', { eager: true, import: 'default' });

/**
 * A value that must be one of a known set, or the file is wrong and says which value.
 *
 * @spec ITEM-DATA-002
 */
function oneOf(file, field, value, allowed) {
  if (!Object.prototype.hasOwnProperty.call(allowed, value)) {
    throw new Error(`${file}: ${field} "${value}" is not one of ${Object.keys(allowed).join(', ')}`);
  }
  return value;
}

/**
 * An authored item, built through the same creation the rest of the system uses.
 *
 * @spec ITEM-DATA-001
 * @spec ITEM-DATA-002
 * @spec ITEM-DATA-003
 * @spec ITEM-DATA-005
 * @spec ITEM-DATA-006
 */
export function buildItem(file, data) {
  for (const required of ['id', 'name', 'kind']) {
    if (data?.[required] === undefined) throw new Error(`${file}: no ${required}`);
  }
  const kind = oneOf(file, 'kind', data.kind, ItemKind);
  // Food goes into the pot, never into a hand, so it is read on its own terms.
  if (kind === ItemKind.FOOD) return buildFood(file, data);
  const consumable = kind === ItemKind.CONSUMABLE;
  if (consumable && data.slot !== undefined) throw new Error(`${file}: a consumable has no slot`);
  if (!consumable && data.slot === undefined) throw new Error(`${file}: no slot`);
  // Who may hold it is the class's to say, by category; an item names no classes.
  if (data.classes !== undefined) throw new Error(`${file}: classes "${data.classes}" — name a category instead`);
  if (!consumable && data.category === undefined) throw new Error(`${file}: no category`);
  if (!consumable && data.effect !== undefined) {
    throw new Error(`${file}: only a consumable has an effect`);
  }

  return createItem({
    id: data.id,
    name: data.name,
    kind,
    slot: consumable ? null : oneOf(file, 'slot', data.slot, Slot),
    rarity: data.rarity === undefined ? Rarity.COMMON : oneOf(file, 'rarity', data.rarity, Rarity),
    effect: consumable ? readEffect(file, data.effect) : null,
    category: consumable ? null : oneOf(file, 'category', data.category, ItemCategory),
    // A weapon's skill. Armour and shields train nothing, and a file saying otherwise
    // is wrong. A weapon may name the wielder's magic instead of one skill.
    // @spec ITEM-DEF-005
    // @spec ITEM-DEF-014
    skill: weaponSkillOf(file, kind, data.skill),
    damage: data.damage ?? 0,
    // Any attribute, or whatever the wielder casts with.
    // @spec ITEM-DEF-017
    governs: data.governs === undefined
      ? Attribute.MIGHT
      : oneOf(file, 'attribute', data.governs, { ...Attribute, [CASTING]: CASTING }),
    armour: data.armour ?? 0,
  });
}

/** The skill a weapon trains; nothing else names one. */
function weaponSkillOf(file, kind, skill) {
  if (skill === undefined) return null;
  if (kind !== ItemKind.WEAPON) throw new Error(`${file}: skill "${skill}" on something that is not a weapon`);
  return oneOf(file, 'skill', skill, { ...Skill, [MAGIC_SKILL]: MAGIC_SKILL });
}

const TRAIT_NAMES = Object.fromEntries(Object.values(Trait).map((t) => [t, t]));

/** A whole number of at least nothing, or the file says which field is wrong. */
function amount(file, field, value) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${file}: ${field} ${value} is not a whole number of at least 0`);
  return value;
}

/**
 * A food item: what it adds to the pot, and nothing a hand could hold.
 *
 * @spec FOOD-ITEM-001
 */
function buildFood(file, data) {
  if (data.slot !== undefined) throw new Error(`${file}: food has no slot`);
  const traits = {};
  for (const [trait, points] of Object.entries(data.traits ?? {})) {
    traits[oneOf(file, 'trait', trait, TRAIT_NAMES)] = amount(file, trait, points);
  }
  return createItem({
    id: data.id,
    name: data.name,
    kind: ItemKind.FOOD,
    rarity: data.rarity === undefined ? Rarity.COMMON : oneOf(file, 'rarity', data.rarity, Rarity),
    nourish: amount(file, 'nourish', data.nourish ?? 0),
    heal: amount(file, 'heal', data.heal ?? 0),
    traits,
  });
}

/**
 * What a consumable does: a potion heals at least a point, and a tome teaches a spell
 * somebody has authored.
 *
 * @spec ITEM-DEF-013
 * @spec ITEM-DATA-006
 */
function readEffect(file, effect) {
  if (!effect || typeof effect !== 'object') throw new Error(`${file}: no effect`);
  const known = Object.values(Effect);
  for (const name of Object.keys(effect)) {
    if (!known.includes(name)) throw new Error(`${file}: effect "${name}" is not one of ${known.join(', ')}`);
  }
  if (effect[Effect.TEACH] !== undefined) {
    const spell = effect[Effect.TEACH];
    if (!spellDefinitions()[spell]) throw new Error(`${file}: teach "${spell}" is not a spell anybody authored`);
    return { [Effect.TEACH]: spell };
  }
  const heal = effect[Effect.HEAL];
  if (!Number.isInteger(heal) || heal < 1) throw new Error(`${file}: heal ${heal} is not a whole number of at least 1`);
  return { [Effect.HEAL]: heal };
}

/**
 * The whole catalogue, by identifier.
 *
 * @spec ITEM-DATA-001
 */
export function itemDefinitions() {
  const built = {};
  for (const [file, data] of Object.entries(ITEM_FILES)) {
    const one = buildItem(file, data);
    built[one.id] = one;
  }
  return built;
}

/**
 * One item by identifier, or nothing where none was authored.
 *
 * @spec ITEM-DATA-001
 */
export function itemById(id) {
  return itemDefinitions()[id] ?? null;
}


/**
 * What a forager can find, as items.
 *
 * @spec FOOD-FORAGE-001
 */
export function forageList() {
  return FORAGE.items.map((id) => {
    const item = itemById(id);
    if (!item) throw new Error(`forage.json: "${id}" is not an item anybody authored`);
    return item;
  });
}
