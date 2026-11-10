/**
 * The Items screen's page: one character's worn items and the party's pack, laid out
 * whole before anything is drawn.
 *
 * Pure, like every other plan. It reads the party at the moment it is asked and keeps
 * nothing; the page, the highlighted row, and whether a fight is on are handed in, and
 * those are the controller's.
 */

import {
  classesCasting, classesWielding, packOf, purseOf, roster, useRefusal, UseRefusal,
} from '../sim/party.js';
import {
  Effect, ItemKind, Rarity, Slot, isConsumable, wieldableBy,
} from '../sim/items.js';
import { rarityColour } from './appconfig.js';
import { ReadRefusal, readRefusal, tomeSpell } from '../sim/magic.js';
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
  // What a potion does is the whole of what there is to say about it.
  // @spec PRESENT-ITEMS-025
  if (isConsumable(item)) return withTier(item, `Heals ${item.effect?.[Effect.HEAL] ?? 0}`);
  // Food says what it adds to the pot, which is the only place it goes.
  if (item.kind === ItemKind.FOOD) return withTier(item, foodDetail(item));
  const parts = [SLOT_LABELS[item.slot] ?? titled(item.slot)];
  if (item.kind === ItemKind.WEAPON) {
    if (item.skill) parts.push(titled(item.skill));
    parts.push(`damage ${item.damage}`);
  } else if (item.kind === ItemKind.ARMOUR) {
    // Light or heavy is what tells one body armour from another, and who may wear it.
    if (item.category) parts.push(titled(item.category));
    parts.push(`armour ${item.armour}`);
  } else if (item.kind === ItemKind.SHIELD) {
    parts.push(`armour ${item.armour}`);
  }
  return withTier(item, parts.join(' · '));
}

/** What a food item adds to the pot, in a line. */
export function foodDetail(item) {
  const parts = [`fullness ${item.nourish ?? 0}`];
  if (item.heal) parts.push(`heals ${item.heal}`);
  for (const [trait, points] of Object.entries(item.traits ?? {})) parts.push(`${trait} ${points}`);
  return parts.join(' · ');
}

/**
 * The tier written ahead of an item's line, for anything above common, so that rarity
 * never rests on colour alone.
 *
 * @spec PRESENT-RARITY-003
 */
function withTier(item, line) {
  if (!item.rarity || item.rarity === Rarity.COMMON) return line;
  return `${titled(item.rarity)} · ${line}`;
}

/**
 * Why a character cannot drink a potion, in place of what it does.
 *
 * @spec PRESENT-ITEMS-027
 */
const REFUSALS = {
  [UseRefusal.FULL_HEALTH]: 'At full health',
  [UseRefusal.UNCONSCIOUS]: 'Unconscious',
  [UseRefusal.DEAD]: 'Dead',
  [UseRefusal.ASHES]: 'Ashes',
  [UseRefusal.LOST]: 'Lost',
};

/**
 * Who may wield an item, said in place of its numbers when the character on the page
 * may not.
 *
 * @spec PRESENT-ITEMS-008
 */
export function wieldersOf(item) {
  const names = classesWielding(item.category).map(titled);
  return withTier(item, `${SLOT_LABELS[item.slot] ?? titled(item.slot)} · ${names.join(', ')} only`);
}

/**
 * Every row a highlight can rest on, in order: the worn slots, then the pack. Shared by
 * the plan and the controller, so the row a key reaches and the row drawn highlighted
 * are the same row.
 *
 * Potions sharing an identifier are one row, where the first of them stands, carrying
 * their count; a piece of equipment is always a row of its own.
 *
 * @spec PRESENT-ITEMS-017
 * @spec PRESENT-ITEMS-024
 */
export function itemRows(party, characterId) {
  const c = roster(party).find((m) => m.id === characterId);
  if (!c) return [];
  const worn = Object.values(Slot).map((slot) => ({
    role: ItemsControl.WORN, slot, item: c.equipment[slot] ?? null,
  }));
  const carried = [];
  const stacks = new Map();
  // Potions and food stack; equipment never does.
  const stacks_ = (item) => isConsumable(item) || item.kind === ItemKind.FOOD;
  packOf(party).forEach((item, packIndex) => {
    if (stacks_(item) && stacks.has(item.id)) {
      stacks.get(item.id).count += 1;
      return;
    }
    const row = { role: ItemsControl.PACK, packIndex, item, count: 1 };
    if (stacks_(item)) stacks.set(item.id, row);
    carried.push(row);
  });
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
export function rowActs(row, c, { inFight, party = null, spells = {} }) {
  if (!row.item) return false;
  if (row.role === ItemsControl.WORN) return !inFight;
  // Food is eaten at camp, from the pot, and never from here.
  if (row.item.kind === ItemKind.FOOD) return false;
  // A tome is read by whoever's page it is, out of a fight, if they could cast its spell.
  if (tomeSpell(row.item, spells)) return Boolean(party) && readRefusal(party, c.id, row.item, spells, { inFight }) === null;
  // A potion is drunk by whoever's page it is, when they can drink it.
  // @spec PRESENT-ITEMS-026
  // @spec PRESENT-ITEMS-027
  if (isConsumable(row.item)) return Boolean(party) && useRefusal(party, c.id, row.item) === null;
  return wieldableBy(row.item, c.characterClass);
}

/** The line beneath a row: its numbers, who may wield it, or why it cannot be drunk. */
function rowDetail(row, c, party, spells = {}) {
  if (!row.item) return null;
  const taught = tomeSpell(row.item, spells);
  if (row.role === ItemsControl.PACK && taught) {
    const refusal = readRefusal(party, c.id, row.item, spells, { inFight: false });
    const words = {
      [ReadRefusal.WRONG_CLASS]: `${classesCasting(taught.school).map(titled).join(', ')} only`,
      [ReadRefusal.RANK_TOO_LOW]: `Needs ${titled(taught.school)} ${taught.rank}`,
      [ReadRefusal.ALREADY_KNOWN]: 'Already known',
      [ReadRefusal.NOT_CONSCIOUS]: 'Unconscious',
    };
    return withTier(row.item, refusal ? (words[refusal] ?? 'Cannot be read') : `Teaches ${taught.name}`);
  }
  if (row.role === ItemsControl.PACK && isConsumable(row.item)) {
    const refusal = useRefusal(party, c.id, row.item);
    return refusal ? withTier(row.item, REFUSALS[refusal] ?? 'Cannot be used') : itemDetail(row.item);
  }
  const wieldable = row.role === ItemsControl.WORN || wieldableBy(row.item, c.characterClass);
  return wieldable ? itemDetail(row.item) : wieldersOf(row.item);
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
 * @spec PRESENT-ITEMS-022
 * @spec PRESENT-ITEMS-032
 *
 * `scroll` is where the list was left, in pixels; with `follow` the view moves the least
 * it must to show the highlighted row, and without it stays where the finger put it.
 */
export function buildItemsPlan(party, viewport, {
  page = 0, characterId = null, selected = 0, inFight = false, spells = {},
  scroll: wanted = 0, follow = true,
} = {}) {
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

  // The controls sit in a row along the foot, where a thumb holding a phone already is:
  // previous at the left, Close in the middle, next at the right. In a fight the page
  // belongs to whoever is acting, so there is nobody to turn to and Close stands alone.
  // @spec PRESENT-ITEMS-013
  // @spec PRESENT-ITEMS-030
  const tap = Math.max(MIN_TAP_PX, 48 * scale);
  const closeWidth = Math.max(MIN_TAP_PX, 76 * scale);
  const footY = bounds.y + bounds.height - pad - tap;
  const controls = [];
  if (!inFight) {
    controls.push(
      { role: ItemsControl.PREVIOUS, label: '<', hint: 'A', x: inner.x, y: footY, width: tap, height: tap },
      {
        role: ItemsControl.NEXT, label: '>', hint: 'D',
        x: inner.x + inner.width - tap, y: footY, width: tap, height: tap,
      },
    );
  }
  controls.push({
    role: ItemsControl.CLOSE, label: 'Close', hint: 'Esc',
    x: inner.x + (inner.width - closeWidth) / 2, y: footY, width: closeWidth, height: tap,
  });
  for (const control of controls) control.kind = 'BUTTON';

  // The name runs across the head of the page, where reading starts.
  const title = {
    name: c.name,
    position: inFight ? 'Takes their turn' : `${at + 1} / ${members.length}`,
    box: { x: inner.x, y, width: inner.width, height: tap },
  };
  y += tap + gap;

  // The list scrolls inside whatever is left between the name and the row of controls.
  const area = { x: inner.x, y, width: inner.width, height: Math.max(0, footY - gap - y) };

  const rows = itemRows(party, c.id);
  const highlight = clampRow(rows, selected);
  const pack = packOf(party);
  // The purse belongs to the party as the pack does, so it rides on the pack's heading.
  // @spec PRESENT-ITEMS-023
  const gold = purseOf(party);
  const packHeading = (top) => ({ kind: 'HEADING', text: 'Pack', aside: `${gold} gold`, top, height: heading });

  // Laid out top to bottom as though there were room for all of it, then moved up just
  // far enough that the highlighted row is in view.
  const laid = [];
  let cursor = 0;
  laid.push({ kind: 'HEADING', text: 'Wearing', top: cursor, height: heading });
  cursor += heading;
  rows.forEach((row, index) => {
    if (row.role === ItemsControl.PACK && row.packIndex === 0) {
      laid.push(packHeading(cursor + gap / 2));
      cursor += heading + gap / 2;
    }
    const acts = rowActs(row, c, { inFight, party, spells });
    const usable = row.role === ItemsControl.WORN
      || (isConsumable(row.item) ? acts : wieldableBy(row.item, c.characterClass));
    laid.push({
      kind: 'ROW',
      index,
      role: row.role,
      slot: row.slot ?? row.item?.slot ?? null,
      packIndex: row.packIndex ?? null,
      label: row.role === ItemsControl.WORN ? SLOT_LABELS[row.slot] : null,
      name: row.item ? (row.count > 1 ? `${row.item.name} ×${row.count}` : row.item.name) : null,
      // @spec PRESENT-RARITY-001
      rarity: row.item?.rarity ?? null,
      colour: row.item ? rarityColour(row.item) : null,
      detail: inFight && tomeSpell(row.item, spells) ? withTier(row.item, 'Not in a fight') : rowDetail(row, c, party, spells),
      available: acts,
      // A worn item drawn in a fight is shown as it is, just not pressable; only an
      // item the character cannot wield or drink is greyed for what it is.
      greyed: !usable,
      selected: index === highlight,
      top: cursor,
      height: rowHeight,
    });
    cursor += rowHeight;
  });
  if (pack.length === 0) {
    laid.push(packHeading(cursor + gap / 2));
    cursor += heading + gap / 2;
    laid.push({ kind: 'NOTE', text: 'Nothing carried', top: cursor, height: heading });
    cursor += heading;
  }

  // @spec PRESENT-ITEMS-019
  const chosen = laid.find((entry) => entry.kind === 'ROW' && entry.selected);
  const maxScroll = Math.max(0, cursor - area.height);
  let scroll = wanted ?? 0;
  if (follow && chosen) {
    if (chosen.top < scroll) scroll = chosen.top;
    if (chosen.top + chosen.height > scroll + area.height) scroll = chosen.top + chosen.height - area.height;
  }
  scroll = Math.min(maxScroll, Math.max(0, scroll));

  // Anything the list's window shows any of is drawn, clipped to the window; only the
  // part in view can be pressed.
  const entries = [];
  for (const entry of laid) {
    const top = entry.top - scroll;
    if (top + entry.height <= 0.5 || top >= area.height - 0.5) continue;
    entries.push({ ...entry, box: { x: area.x, y: area.y + top, width: area.width, height: entry.height } });
  }

  for (const entry of entries) {
    if (entry.kind !== 'ROW') continue;
    const y = Math.max(area.y, entry.box.y);
    const bottom = Math.min(area.y + area.height, entry.box.y + entry.box.height);
    controls.push({
      kind: 'ROW', role: entry.role, index: entry.index, slot: entry.slot,
      packIndex: entry.packIndex, available: entry.available,
      x: entry.box.x, y, width: entry.box.width, height: bottom - y,
    });
  }

  // A thin bar down the list's right edge, there only when there is more than fits.
  // @spec PRESENT-ITEMS-032
  const barWidth = 3 * scale;
  const track = { x: area.x + area.width - barWidth, y: area.y, width: barWidth, height: area.height };
  const thumbHeight = maxScroll > 0 ? Math.max(16 * scale, area.height * (area.height / cursor)) : 0;
  const scrollbar = maxScroll > 0
    ? {
      track,
      thumb: { ...track, y: track.y + (track.height - thumbHeight) * (scroll / maxScroll), height: thumbHeight },
    }
    : null;

  return {
    characterId: c.id,
    page: at,
    inFight,
    gold,
    scale,
    bounds,
    title,
    area,
    clip: area,
    scroll,
    maxScroll,
    scrollbar,
    entries,
    selected: highlight,
    rowCount: rows.length,
    controls,
  };
}
