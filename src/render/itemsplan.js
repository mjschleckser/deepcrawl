/**
 * The Items screen's page: one character's worn items and the party's pack, laid out
 * whole before anything is drawn.
 *
 * Pure, like every other plan. It reads the party at the moment it is asked and keeps
 * nothing; the page, the highlighted row, and whether a fight is on are handed in, and
 * those are the controller's.
 */

import { packOf, roster } from '../sim/party.js';
import { ItemKind, Slot, wieldableBy } from '../sim/items.js';
import { MIN_TAP_PX, uiScale, contentColumn, stampRoom } from './geometry.js';
import { pageFor } from './partyplan.js';

/** What a control on the page does. */
export const ItemsControl = {
  PREVIOUS: 'PREVIOUS', NEXT: 'NEXT', CLOSE: 'CLOSE', WORN: 'WORN', PACK: 'PACK',
};

/** A name as a player reads it: `HEAVY_ARMOUR` is Heavy Armour. */
const titled = (key) => key.toLowerCase().split('_')
  .map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');

export const SLOT_LABELS = { [Slot.MAIN_HAND]: 'Main hand', [Slot.OFF_HAND]: 'Off hand', [Slot.BODY]: 'Body' };

/**
 * The numbers an item carries, in a line: where it goes, what it trains, and what it
 * adds.
 *
 * @spec PRESENT-ITEMS-007
 */
export function itemDetail(item) {
  const parts = [SLOT_LABELS[item.slot] ?? titled(item.slot)];
  if (item.kind === ItemKind.WEAPON) {
    if (item.skill) parts.push(titled(item.skill));
    parts.push(`damage ${item.damage}`, `accuracy ${item.accuracy}`);
  } else if (item.kind === ItemKind.ARMOUR) {
    if (item.skill) parts.push(titled(item.skill));
    parts.push(`armour ${item.armour}`);
  } else if (item.kind === ItemKind.SHIELD) {
    parts.push(`defence ${item.defence}`);
  }
  return parts.join(' · ');
}

/**
 * Who may wield an item, said in place of its numbers when the character on the page
 * may not.
 *
 * @spec PRESENT-ITEMS-008
 */
export function wieldersOf(item) {
  const names = (item.classes ?? []).map(titled);
  return `${SLOT_LABELS[item.slot] ?? titled(item.slot)} · ${names.join(', ')} only`;
}

/**
 * Every row a highlight can rest on, in order: the worn slots, then the pack. Shared by
 * the plan and the controller, so the row a key reaches and the row drawn highlighted
 * are the same row.
 *
 * @spec PRESENT-ITEMS-017
 */
export function itemRows(party, characterId) {
  const c = roster(party).find((m) => m.id === characterId);
  if (!c) return [];
  const worn = Object.values(Slot).map((slot) => ({
    role: ItemsControl.WORN, slot, item: c.equipment[slot] ?? null,
  }));
  const carried = packOf(party).map((item, packIndex) => ({
    role: ItemsControl.PACK, packIndex, item,
  }));
  return [...worn, ...carried];
}

/** A highlight kept within the rows there are. @spec PRESENT-ITEMS-021 */
export function clampRow(rows, selected) {
  if (rows.length === 0) return 0;
  return Math.min(Math.max(0, Number.isInteger(selected) ? selected : 0), rows.length - 1);
}

/**
 * Whether a press on a row would do anything: put on a pack item the character may
 * wield, or, out of a fight, take off something worn.
 *
 * @spec PRESENT-ITEMS-008
 * @spec PRESENT-ITEMS-012
 * @spec PRESENT-ITEMS-016
 */
export function rowActs(row, c, { inFight }) {
  if (!row.item) return false;
  if (row.role === ItemsControl.WORN) return !inFight;
  return wieldableBy(row.item, c.characterClass);
}

/**
 * @spec PRESENT-ITEMS-005
 * @spec PRESENT-ITEMS-006
 * @spec PRESENT-ITEMS-007
 * @spec PRESENT-ITEMS-008
 * @spec PRESENT-ITEMS-012
 * @spec PRESENT-ITEMS-013
 * @spec PRESENT-ITEMS-016
 * @spec PRESENT-ITEMS-019
 */
export function buildItemsPlan(party, viewport, { page = 0, characterId = null, selected = 0, inFight = false } = {}) {
  const members = roster(party);
  const at = characterId !== null
    ? members.findIndex((m) => m.id === characterId)
    : pageFor(party, page);
  if (at === null || at < 0) return null;
  const c = members[at];

  const scale = uiScale(viewport);
  const column = contentColumn(viewport);
  const margin = 8 * scale;
  const pad = 12 * scale;
  const gap = 10 * scale;
  const heading = 20 * scale;
  const rowHeight = Math.max(MIN_TAP_PX, 44 * scale);

  const bounds = {
    x: column.x + margin,
    y: margin,
    width: column.width - margin * 2,
    height: viewport.height - margin - stampRoom(scale),
  };
  const inner = { x: bounds.x + pad, width: bounds.width - pad * 2 };
  let y = bounds.y + pad;

  // In a fight the page belongs to whoever is acting, so there is nobody to turn to.
  // @spec PRESENT-ITEMS-013
  const tap = Math.max(MIN_TAP_PX, 48 * scale);
  const closeWidth = Math.max(MIN_TAP_PX, 76 * scale);
  const controls = [];
  if (!inFight) {
    controls.push(
      { role: ItemsControl.PREVIOUS, label: '<', hint: 'A', x: inner.x, y, width: tap, height: tap },
      {
        role: ItemsControl.NEXT, label: '>', hint: 'D',
        x: inner.x + inner.width - closeWidth - gap - tap, y, width: tap, height: tap,
      },
    );
  }
  controls.push({
    role: ItemsControl.CLOSE, label: 'Close', hint: 'Esc',
    x: inner.x + inner.width - closeWidth, y, width: closeWidth, height: tap,
  });
  for (const control of controls) control.kind = 'BUTTON';

  const titleLeft = inFight ? inner.x : inner.x + tap + gap;
  const title = {
    name: c.name,
    position: inFight ? 'Takes their turn' : `${at + 1} / ${members.length}`,
    box: {
      x: titleLeft,
      y,
      width: Math.max(0, inner.x + inner.width - closeWidth - gap - (inFight ? 0 : tap + gap) - titleLeft),
      height: tap,
    },
  };
  y += tap + gap;

  // The list scrolls inside whatever is left of the page.
  const area = { x: inner.x, y, width: inner.width, height: bounds.y + bounds.height - pad - y };

  const rows = itemRows(party, c.id);
  const highlight = clampRow(rows, selected);
  const pack = packOf(party);

  // Laid out top to bottom as though there were room for all of it, then moved up just
  // far enough that the highlighted row is in view.
  const laid = [];
  let cursor = 0;
  laid.push({ kind: 'HEADING', text: 'Wearing', top: cursor, height: heading });
  cursor += heading;
  rows.forEach((row, index) => {
    if (row.role === ItemsControl.PACK && row.packIndex === 0) {
      laid.push({ kind: 'HEADING', text: 'Pack', top: cursor + gap / 2, height: heading });
      cursor += heading + gap / 2;
    }
    const acts = rowActs(row, c, { inFight });
    const wieldable = row.role === ItemsControl.WORN || wieldableBy(row.item, c.characterClass);
    laid.push({
      kind: 'ROW',
      index,
      role: row.role,
      slot: row.slot ?? row.item?.slot ?? null,
      packIndex: row.packIndex ?? null,
      label: row.role === ItemsControl.WORN ? SLOT_LABELS[row.slot] : null,
      name: row.item?.name ?? null,
      detail: row.item ? (wieldable ? itemDetail(row.item) : wieldersOf(row.item)) : null,
      available: acts,
      // A worn item drawn in a fight is shown as it is, just not pressable; only an
      // item the character cannot wield is greyed for what it is.
      greyed: !wieldable,
      selected: index === highlight,
      top: cursor,
      height: rowHeight,
    });
    cursor += rowHeight;
  });
  if (pack.length === 0) {
    laid.push({ kind: 'HEADING', text: 'Pack', top: cursor + gap / 2, height: heading });
    cursor += heading + gap / 2;
    laid.push({ kind: 'NOTE', text: 'Nothing carried', top: cursor, height: heading });
    cursor += heading;
  }

  // @spec PRESENT-ITEMS-019
  const chosen = laid.find((entry) => entry.kind === 'ROW' && entry.selected);
  const scroll = chosen ? Math.max(0, chosen.top + chosen.height - area.height) : 0;

  const entries = [];
  for (const entry of laid) {
    const top = entry.top - scroll;
    // Only what fits whole is drawn, and only what is drawn can be pressed.
    if (top < -0.5 || top + entry.height > area.height + 0.5) continue;
    entries.push({ ...entry, box: { x: area.x, y: area.y + top, width: area.width, height: entry.height } });
  }

  for (const entry of entries) {
    if (entry.kind !== 'ROW') continue;
    controls.push({
      kind: 'ROW', role: entry.role, index: entry.index, slot: entry.slot,
      packIndex: entry.packIndex, available: entry.available, ...entry.box,
    });
  }

  return {
    characterId: c.id,
    page: at,
    inFight,
    scale,
    bounds,
    title,
    area,
    entries,
    selected: highlight,
    rowCount: rows.length,
    controls,
  };
}
