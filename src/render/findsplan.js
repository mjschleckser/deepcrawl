/**
 * A find, as it is listed: on a victory's banner and in a chest's report.
 *
 * The gold, then each item once, named in its rarity's colour and with a count when
 * there are several of it. A band of twenty can drop a great deal, and a list that
 * names the same potion five times is a list nobody reads.
 */

import { rarityColour } from './appconfig.js';
import { contentColumn, uiScale } from './geometry.js';

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

/** A line of a chest's report, in the panel's own measure. */
const REPORT_LINE = 20;

/**
 * The report drawn over the view when a chest is opened: what it held, in a panel of its
 * own, sized to the lines it has.
 *
 * @spec PRESENT-CHEST-001
 */
export function buildChestReportPlan(found, viewport) {
  if (!found) return null;
  const scale = uiScale(viewport);
  const column = contentColumn(viewport);
  const find = describeFind(found, { nothing: 'Nothing' });
  const lines = (find.gold ? 1 : 0) + find.items.length + (find.nothing ? 1 : 0);
  const width = Math.min(column.width - 24 * scale, 360 * scale);
  const height = Math.min(viewport.height * 0.8, (64 + lines * REPORT_LINE + 34) * scale);
  return {
    title: 'The chest held',
    find,
    hint: 'Enter to go on',
    scale,
    lineHeight: REPORT_LINE * scale,
    bounds: {
      x: column.x + (column.width - width) / 2,
      y: (viewport.height - height) / 2,
      width,
      height,
    },
  };
}
