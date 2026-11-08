/**
 * Loot: what a find is, rolled from a table.
 *
 * A table lists items and says how likely each rarity tier is. A roll draws gold from
 * the table's range and makes the table's draws. Each draw tries the tiers from the top
 * down, legendary first and common last, so every tier's odds are a number someone wrote
 * down and adding another common item never makes a legendary scarcer.
 *
 * Nothing here holds state, and nothing here knows where a find came from. A defeated
 * band and an opened chest both ask for a roll and hand what comes back to the party.
 */

import { Rarity, RARITY_ORDER, createItem } from './items.js';

/** The tiers a draw tries, in the order it tries them. Common is what remains. */
export const TIERS_TOP_DOWN = [Rarity.LEGENDARY, Rarity.EPIC, Rarity.RARE, Rarity.UNCOMMON];

/**
 * What every draw reads from the generator: whether it yields, one value per tier
 * above common, and the pick. A draw reads all of them whatever it finds, so what one
 * draw found never shifts the next.
 *
 * @spec LOOT-ROLL-006
 */
export const VALUES_PER_DRAW = 2 + TIERS_TOP_DOWN.length;

/**
 * A loot table, with its items already resolved.
 *
 * @spec LOOT-TABLE-001
 * @spec LOOT-TABLE-002
 */
export function createLootTable({
  id, odds = {}, gold = { min: 0, max: 0 }, draws = { count: 0, chance: 1 }, items = [],
}) {
  return {
    id,
    odds: Object.fromEntries(TIERS_TOP_DOWN.map((tier) => [tier, odds[tier] ?? 0])),
    gold: { min: gold.min, max: gold.max },
    draws: { count: draws.count, chance: draws.chance },
    items: items.map((item) => createItem(item)),
  };
}

/**
 * The items a draw on this tier can take: the tier's own, or the nearest lower tier's
 * that holds any. A table always holds a common item, so falling through ends somewhere.
 *
 * @spec LOOT-ROLL-004
 */
function poolFor(table, tier) {
  for (let i = RARITY_ORDER.indexOf(tier); i >= 0; i--) {
    const pool = table.items.filter((item) => item.rarity === RARITY_ORDER[i]);
    if (pool.length > 0) return pool;
  }
  // A table reaching here holds nothing below the tier rolled; anything it holds will do.
  return table.items;
}

/**
 * Roll a table: gold from its range, then each of its draws.
 *
 * @spec LOOT-ROLL-001
 * @spec LOOT-ROLL-002
 * @spec LOOT-ROLL-003
 * @spec LOOT-ROLL-005
 * @spec LOOT-ROLL-006
 * @spec LOOT-ROLL-007
 */
export function rollLoot(table, rng) {
  const gold = rng.int(table.gold.min, table.gold.max);
  const items = [];

  for (let i = 0; i < table.draws.count; i++) {
    // Every value is read before any is looked at, so each draw costs the same.
    const yields = rng.next() < table.draws.chance;
    const hits = TIERS_TOP_DOWN.map((tier) => rng.next() < table.odds[tier]);
    const pick = rng.next();
    if (!yields || table.items.length === 0) continue;

    const hit = hits.indexOf(true);
    const tier = hit === -1 ? Rarity.COMMON : TIERS_TOP_DOWN[hit];
    const pool = poolFor(table, tier);
    items.push(createItem(pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))]));
  }

  return { gold, items };
}

/** Two finds as one, as a fight that several enemies paid out is reported. */
export function mergeFinds(finds) {
  return {
    gold: finds.reduce((sum, find) => sum + find.gold, 0),
    items: finds.flatMap((find) => find.items),
  };
}
