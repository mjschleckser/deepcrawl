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
import { ItemKind, Slot, createItem } from '../sim/items.js';

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
 */
export function buildItem(file, data) {
  for (const required of ['id', 'name', 'kind', 'slot']) {
    if (data?.[required] === undefined) throw new Error(`${file}: no ${required}`);
  }

  return createItem({
    id: data.id,
    name: data.name,
    kind: oneOf(file, 'kind', data.kind, ItemKind),
    slot: oneOf(file, 'slot', data.slot, Slot),
    // A weapon's skill, or the skill a piece of armour is worn under. A shield has
    // neither, and says so by omitting it.
    skill: data.skill === undefined ? null : oneOf(file, 'skill', data.skill, Skill),
    damage: data.damage ?? 0,
    accuracy: data.accuracy ?? 0,
    governs: data.governs === undefined
      ? Attribute.MIGHT
      : oneOf(file, 'attribute', data.governs, Attribute),
    armour: data.armour ?? 0,
    defence: data.defence ?? 0,
    // Naming nobody means anybody may hold it.
    classes: data.classes
      ? data.classes.map((name) => oneOf(file, 'class', name, CharacterClass))
      : null,
  });
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
