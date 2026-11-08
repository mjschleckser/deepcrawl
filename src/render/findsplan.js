/**
 * A find, as it is listed: on a victory's banner and in a chest's report.
 *
 * The gold, then each item once, named in its rarity's colour and with a count when
 * there are several of it. A band of twenty can drop a great deal, and a list that
 * names the same potion five times is a list nobody reads.
 */

import { rarityColour } from './appconfig.js';

/**
 * @spec PRESENT-FIGHT-050
 * @spec PRESENT-CHEST-001
 * @spec PRESENT-RARITY-001
 */
export function describeFind(find, { nothing = 'No items found' } = {}) {
  const groups = new Map();
  for (const item of find?.items ?? []) {
    const group = groups.get(item.id);
    if (group) group.count += 1;
    else groups.set(item.id, { item, count: 1 });
  }
  const items = [...groups.values()].map(({ item, count }) => ({
    text: count > 1 ? `${item.name} ×${count}` : item.name,
    rarity: item.rarity,
    colour: rarityColour(item),
  }));
  const gold = find?.gold > 0 ? `${find.gold} gold` : null;
  return { gold, items, nothing: items.length === 0 ? nothing : null };
}
