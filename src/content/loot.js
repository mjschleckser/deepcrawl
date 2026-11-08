/**
 * Reading the authored loot tables.
 *
 * Each table is a file of its own under `src/game-data/loot`, read like an item or a
 * combatant: what a goblin drops is changed by editing a table, not a module. A table
 * names items by identifier, and they are resolved here, once, so a find holds the item
 * itself.
 *
 * A mistake in a hand-edited table is reported by file and value, here, rather than
 * turning up later as a chest that holds nothing.
 */

import { itemDefinitions } from './items.js';
import { Rarity } from '../sim/items.js';
import { TIERS_TOP_DOWN, createLootTable } from '../sim/loot.js';

const LOOT_FILES = import.meta.glob('../game-data/loot/*.json', { eager: true, import: 'default' });

const isChance = (value) => typeof value === 'number' && value >= 0 && value <= 1;
const isCount = (value) => Number.isInteger(value) && value >= 0;

/**
 * An authored table, checked and resolved.
 *
 * @spec LOOT-TABLE-001
 * @spec LOOT-TABLE-002
 * @spec LOOT-DATA-001
 */
export function buildLootTable(file, data, catalogue = itemDefinitions()) {
  if (data?.id === undefined) throw new Error(`${file}: no id`);

  const odds = data.odds ?? {};
  for (const [tier, chance] of Object.entries(odds)) {
    if (!TIERS_TOP_DOWN.includes(tier)) {
      throw new Error(`${file}: odds "${tier}" is not one of ${TIERS_TOP_DOWN.join(', ')}`);
    }
    if (!isChance(chance)) throw new Error(`${file}: odds ${tier} ${chance} is not between 0 and 1`);
  }

  const gold = data.gold ?? { min: 0, max: 0 };
  if (!isCount(gold.min) || !isCount(gold.max) || gold.min > gold.max) {
    throw new Error(`${file}: gold ${gold.min} to ${gold.max} is not a range of whole numbers from 0`);
  }

  const draws = data.draws ?? { count: 0, chance: 1 };
  if (!isCount(draws.count)) throw new Error(`${file}: draw count ${draws.count} is not a whole number from 0`);
  if (!isChance(draws.chance)) throw new Error(`${file}: draw chance ${draws.chance} is not between 0 and 1`);

  const items = (data.items ?? []).map((id) => {
    const item = catalogue[id];
    if (!item) throw new Error(`${file}: item "${id}" does not exist`);
    return item;
  });
  // Falling through the tiers has to end somewhere.
  if (!items.some((item) => item.rarity === Rarity.COMMON)) throw new Error(`${file}: no common item`);

  return createLootTable({ id: data.id, odds, gold, draws, items });
}

/**
 * Every table, by identifier.
 *
 * @spec LOOT-TABLE-001
 */
export function lootTables() {
  const catalogue = itemDefinitions();
  const built = {};
  for (const [file, data] of Object.entries(LOOT_FILES)) {
    const table = buildLootTable(file, data, catalogue);
    built[table.id] = table;
  }
  return built;
}

/** One table by identifier, or nothing where none was authored. */
export function lootTableById(id) {
  return lootTables()[id] ?? null;
}
