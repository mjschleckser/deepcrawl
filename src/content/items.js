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

import { Attribute, CharacterClass, Skill } from '../sim/party.js';
import { Effect, ItemKind, Rarity, Slot, createItem } from '../sim/items.js';
import { spellDefinitions } from './spells.js';

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
 * @spec ITEM-DATA-004
 * @spec ITEM-DATA-005
 * @spec ITEM-DATA-006
 */
export function buildItem(file, data) {
  for (const required of ['id', 'name', 'kind']) {
    if (data?.[required] === undefined) throw new Error(`${file}: no ${required}`);
  }
  const kind = oneOf(file, 'kind', data.kind, ItemKind);
  const consumable = kind === ItemKind.CONSUMABLE;
  if (consumable && data.slot !== undefined) throw new Error(`${file}: a consumable has no slot`);
  if (!consumable && data.slot === undefined) throw new Error(`${file}: no slot`);
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
    // A weapon's skill, or the skill a piece of armour is worn under. A shield has
    // neither, and says so by omitting it.
    skill: data.skill === undefined ? null : oneOf(file, 'skill', data.skill, Skill),
    damage: data.damage ?? 0,
    governs: data.governs === undefined
      ? Attribute.MIGHT
      : oneOf(file, 'attribute', data.governs, Attribute),
    armour: data.armour ?? 0,
    // Naming nobody means anybody may hold it.
    classes: data.classes
      ? data.classes.map((name) => oneOf(file, 'class', name, CharacterClass))
      : null,
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
