/**
 * The Items screen's pages — the pack a section at a time, one item close up with who
 * may take it — and the party screen's list of what fits a slot. Each is laid out whole
 * before anything is drawn.
 *
 * Pure, like every other plan. It reads the party at the moment it is asked and keeps
 * nothing; the section, the highlighted row, the open item and whether a fight is on
 * are handed in, and those are the controller's.
 */

import {
  classesCasting, classesWielding, character, packOf, purseOf, roster, useRefusal, UseRefusal,
} from '../sim/party.js';
import {
  CASTING, Effect, ItemKind, MAGIC_SKILL, Rarity, Slot, fitsSlot, isConsumable, wieldableBy,
} from '../sim/items.js';
import { rarityColour } from './appconfig.js';
import { ReadRefusal, readRefusal, tomeSpell } from '../sim/magic.js';
import { MIN_TAP_PX, uiScale, contentColumn, stampRoom } from './geometry.js';

/** What a control on these pages does. */
export const ItemsControl = {
  PREVIOUS: 'PREVIOUS', NEXT: 'NEXT', CLOSE: 'CLOSE', BACK: 'BACK', TAB: 'TAB', ROW: 'ROW',
};

/**
 * The pack's sections, in the order their tabs run.
 *
 * @spec PRESENT-ITEMS-005
 */
export const ItemsSection = {
  ALL: 'ALL', EQUIPMENT: 'EQUIPMENT', CONSUMABLES: 'CONSUMABLES', FOOD: 'FOOD',
};
export const SECTION_ORDER = [
  ItemsSection.ALL, ItemsSection.EQUIPMENT, ItemsSection.CONSUMABLES, ItemsSection.FOOD,
];
const SECTION_LABELS = {
  [ItemsSection.ALL]: 'All',
  [ItemsSection.EQUIPMENT]: 'Equipment',
  [ItemsSection.CONSUMABLES]: 'Consumables',
  [ItemsSection.FOOD]: 'Food',
};

/** A name as a player reads it: `HEAVY_ARMOUR` is Heavy Armour. */
const titled = (key) => key.toLowerCase().split('_')
  .map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');

export const SLOT_LABELS = { [Slot.MAIN_HAND]: 'Main hand', [Slot.OFF_HAND]: 'Off hand', [Slot.BODY]: 'Body' };

/** Which section an item is listed under, besides All. */
export function sectionOf(item) {
  if (item.kind === ItemKind.FOOD) return ItemsSection.FOOD;
  if (isConsumable(item)) return ItemsSection.CONSUMABLES;
  return ItemsSection.EQUIPMENT;
}

/**
 * The numbers an item carries, in a line: where it goes, what kind of thing it is, and
 * what it adds.
 *
 * @spec PRESENT-ITEMS-007
 * @spec PRESENT-ITEMS-025
 */
export function itemDetail(item, spells = {}) {
  const taught = tomeSpell(item, spells);
  if (taught) return withTier(item, `Teaches ${taught.name}`);
  // What a potion does is the whole of what there is to say about it.
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

/** Why a character cannot drink a potion. */
const REFUSALS = {
  [UseRefusal.FULL_HEALTH]: 'At full health',
  [UseRefusal.UNCONSCIOUS]: 'Unconscious',
  [UseRefusal.DEAD]: 'Dead',
  [UseRefusal.ASHES]: 'Ashes',
  [UseRefusal.LOST]: 'Lost',
};

/** The classes whose files name an item's category, as a reason. */
const onlyFor = (item) => `${classesWielding(item.category).map(titled).join(', ')} only`;

/**
 * Who may wield an item, said in place of its numbers to somebody who may not.
 *
 * @spec PRESENT-PARTY-030
 */
export function wieldersOf(item) {
  return withTier(item, `${SLOT_LABELS[item.slot] ?? titled(item.slot)} · ${onlyFor(item)}`);
}

/** Why a character cannot read a tome, or nothing when they can. */
function readWords(party, characterId, item, spells, inFight) {
  const taught = tomeSpell(item, spells);
  const refusal = readRefusal(party, characterId, item, spells, { inFight });
  if (!refusal) return null;
  return {
    [ReadRefusal.WRONG_CLASS]: `${classesCasting(taught.school).map(titled).join(', ')} only`,
    [ReadRefusal.RANK_TOO_LOW]: `Needs ${titled(taught.school)} ${taught.rank}`,
    [ReadRefusal.ALREADY_KNOWN]: 'Already known',
    [ReadRefusal.NOT_CONSCIOUS]: 'Unconscious',
    [ReadRefusal.IN_A_FIGHT]: 'Not in a fight',
  }[refusal] ?? 'Cannot be read';
}

/**
 * Every row of a section, in the pack's order. Shared by the plan and the controller, so
 * the row a key reaches and the row drawn highlighted are the same row.
 *
 * Consumables and food sharing an identifier are one row, where the first of them
 * stands, carrying their count; a piece of equipment is always a row of its own.
 *
 * @spec PRESENT-ITEMS-006
 * @spec PRESENT-ITEMS-024
 */
export function itemRows(party, section = ItemsSection.ALL) {
  const rows = [];
  const stacks = new Map();
  const stacking = (item) => isConsumable(item) || item.kind === ItemKind.FOOD;
  packOf(party).forEach((item, packIndex) => {
    if (section !== ItemsSection.ALL && sectionOf(item) !== section) return;
    if (stacking(item) && stacks.has(item.id)) {
      stacks.get(item.id).count += 1;
      return;
    }
    const row = { packIndex, item, count: 1 };
    if (stacking(item)) stacks.set(item.id, row);
    rows.push(row);
  });
  return rows;
}

/** How many of an item the pack holds, counting a stack as the one row it is. */
export function countInPack(party, item) {
  if (!stacksWith(item)) return packOf(party).includes(item) ? 1 : 0;
  return packOf(party).filter((p) => p.id === item.id).length;
}
const stacksWith = (item) => isConsumable(item) || item.kind === ItemKind.FOOD;

/**
 * The item a page is open on, still in the pack: the very one, or, for a stack, another
 * of the same once the first is used.
 */
export function stillCarried(party, item) {
  if (!item) return null;
  const pack = packOf(party);
  if (pack.includes(item)) return item;
  return stacksWith(item) ? (pack.find((p) => p.id === item.id) ?? null) : null;
}

/** A highlight kept within the rows there are. @spec PRESENT-ITEMS-021 */
export function clampRow(rows, selected) {
  if (rows.length === 0) return 0;
  return Math.min(Math.max(0, Number.isInteger(selected) ? selected : 0), rows.length - 1);
}

/** What each kind of item asks of the character pressed for it. */
export const ChoiceKind = { EQUIP: 'EQUIP', USE: 'USE', READ: 'READ', NONE: 'NONE' };
const CHOICE_HEADINGS = {
  [ChoiceKind.EQUIP]: 'Equip to', [ChoiceKind.USE]: 'Use on', [ChoiceKind.READ]: 'Read',
};

export function choiceKind(item, spells = {}) {
  if (item.kind === ItemKind.FOOD) return ChoiceKind.NONE;
  if (tomeSpell(item, spells)) return ChoiceKind.READ;
  if (isConsumable(item)) return ChoiceKind.USE;
  return ChoiceKind.EQUIP;
}

/**
 * Who may take an item, each saying what taking it would do, or why they cannot. In a
 * fight the only one asked is whoever's turn it is.
 *
 * @spec PRESENT-ITEMS-012
 * @spec PRESENT-ITEMS-027
 */
export function itemChoices(party, item, { inFight = false, actingId = null, spells = {} } = {}) {
  const kind = choiceKind(item, spells);
  if (kind === ChoiceKind.NONE) return [];
  const members = inFight ? roster(party).filter((m) => m.id === actingId) : roster(party);
  return members.map((c) => {
    let note = null;
    let refusal = null;
    if (kind === ChoiceKind.EQUIP) {
      if (!wieldableBy(item, c.characterClass)) refusal = onlyFor(item);
      else {
        const worn = c.equipment[item.slot];
        note = worn ? `replaces ${worn.name}` : `${(SLOT_LABELS[item.slot] ?? titled(item.slot)).toLowerCase()} empty`;
      }
    } else if (kind === ChoiceKind.READ) {
      refusal = readWords(party, c.id, item, spells, inFight);
      if (!refusal) note = `learns ${tomeSpell(item, spells).name}`;
    } else {
      const why = useRefusal(party, c.id, item);
      if (why) refusal = REFUSALS[why] ?? 'Cannot use it';
      else note = `${c.hitPoints} / ${c.maxHitPoints} hit points`;
    }
    return { characterId: c.id, name: c.name, note: refusal ?? note, available: refusal === null };
  });
}

/** The frame every one of these pages shares: a panel down the centred column. */
function pageFrame(viewport) {
  const scale = uiScale(viewport);
  const column = contentColumn(viewport);
  const margin = 8 * scale;
  const pad = 12 * scale;
  const bounds = {
    x: column.x + margin,
    y: margin,
    width: column.width - margin * 2,
    height: viewport.height - margin - stampRoom(scale),
  };
  const tap = Math.max(MIN_TAP_PX, 48 * scale);
  return {
    scale,
    bounds,
    pad,
    gap: 10 * scale,
    heading: 20 * scale,
    line: 18 * scale,
    rowHeight: Math.max(MIN_TAP_PX, 44 * scale),
    tap,
    inner: { x: bounds.x + pad, width: bounds.width - pad * 2 },
    footY: bounds.y + bounds.height - pad - tap,
  };
}

/** Back, alone at the foot. */
function backControl(frame) {
  const width = Math.max(MIN_TAP_PX, 76 * frame.scale);
  return {
    kind: 'BUTTON', role: ItemsControl.BACK, label: 'Back', hint: 'Esc',
    x: frame.inner.x + (frame.inner.width - width) / 2, y: frame.footY, width, height: frame.tap,
  };
}

/**
 * Entries laid out top to bottom as though there were room for all of them, then shown
 * through a window: scrolled where the finger left it, or, with `follow`, the least it
 * must be to show the highlighted row. Anything the window shows any of is drawn,
 * clipped to it; only the part in view can be pressed.
 *
 * @spec PRESENT-ITEMS-019
 * @spec PRESENT-ITEMS-022
 * @spec PRESENT-ITEMS-032
 */
export function scrollWindow(laid, area, { scroll: wanted = 0, follow = true, scale = 1 } = {}) {
  const total = laid.reduce((end, entry) => Math.max(end, entry.top + entry.height), 0);
  const chosen = laid.find((entry) => entry.kind === 'ROW' && entry.selected);
  const maxScroll = Math.max(0, total - area.height);
  let scroll = wanted ?? 0;
  if (follow && chosen) {
    if (chosen.top < scroll) scroll = chosen.top;
    if (chosen.top + chosen.height > scroll + area.height) scroll = chosen.top + chosen.height - area.height;
  }
  scroll = Math.min(maxScroll, Math.max(0, scroll));

  const entries = [];
  for (const entry of laid) {
    const top = entry.top - scroll;
    if (top + entry.height <= 0.5 || top >= area.height - 0.5) continue;
    entries.push({ ...entry, box: { x: area.x, y: area.y + top, width: area.width, height: entry.height } });
  }
  const controls = [];
  for (const entry of entries) {
    if (entry.kind !== 'ROW') continue;
    const y = Math.max(area.y, entry.box.y);
    const bottom = Math.min(area.y + area.height, entry.box.y + entry.box.height);
    controls.push({
      kind: 'ROW', role: ItemsControl.ROW, index: entry.index, available: entry.available,
      x: entry.box.x, y, width: entry.box.width, height: bottom - y,
    });
  }

  // A thin bar down the window's right edge, there only when there is more than fits.
  const barWidth = 3 * scale;
  const track = { x: area.x + area.width - barWidth, y: area.y, width: barWidth, height: area.height };
  const thumbHeight = maxScroll > 0 ? Math.max(16 * scale, area.height * (area.height / total)) : 0;
  const scrollbar = maxScroll > 0
    ? { track, thumb: { ...track, y: track.y + (track.height - thumbHeight) * (scroll / maxScroll), height: thumbHeight } }
    : null;

  return { entries, controls, scroll, maxScroll, scrollbar, clip: area };
}

/** A row naming an item, as every list of items draws one. */
function itemEntry(item, { index, count = 1, detail, greyed = false, available = true, selected = false }) {
  return {
    kind: 'ROW',
    index,
    name: count > 1 ? `${item.name} ×${count}` : item.name,
    // @spec PRESENT-RARITY-001
    rarity: item.rarity ?? null,
    colour: rarityColour(item),
    detail,
    available,
    greyed,
    selected,
  };
}

/**
 * The pack, a section at a time.
 *
 * @spec PRESENT-ITEMS-005
 * @spec PRESENT-ITEMS-006
 * @spec PRESENT-ITEMS-007
 * @spec PRESENT-ITEMS-008
 * @spec PRESENT-ITEMS-023
 * @spec PRESENT-ITEMS-026
 * @spec PRESENT-ITEMS-030
 */
export function buildItemsPlan(party, viewport, {
  section = ItemsSection.ALL, selected = 0, inFight = false, actingId = null, spells = {},
  scroll = 0, follow = true,
} = {}) {
  if (!party) return null;
  const frame = pageFrame(viewport);
  const { scale, bounds, inner, gap, heading, rowHeight, tap, footY } = frame;
  // A fight asks only what can be drunk.
  const open = inFight ? ItemsSection.CONSUMABLES : (SECTION_ORDER.includes(section) ? section : ItemsSection.ALL);
  let y = bounds.y + frame.pad;

  // Previous, Close and next along the foot, where the thumb already is; Close alone in
  // a fight, where there are no other sections to turn to.
  const closeWidth = Math.max(MIN_TAP_PX, 76 * scale);
  const controls = [];
  if (!inFight) {
    controls.push(
      { role: ItemsControl.PREVIOUS, label: '<', hint: 'A', x: inner.x, y: footY, width: tap, height: tap },
      { role: ItemsControl.NEXT, label: '>', hint: 'D', x: inner.x + inner.width - tap, y: footY, width: tap, height: tap },
    );
  }
  controls.push({
    role: ItemsControl.CLOSE, label: 'Close', hint: 'Esc',
    x: inner.x + (inner.width - closeWidth) / 2, y: footY, width: closeWidth, height: tap,
  });
  for (const control of controls) control.kind = 'BUTTON';

  const acting = inFight ? character(party, actingId) : null;
  const title = {
    name: 'Items',
    position: acting ? `${acting.name}'s turn` : '',
    box: { x: inner.x, y, width: inner.width, height: tap },
  };
  y += tap;

  // The sections across the head, the open one marked.
  const tabs = [];
  if (!inFight) {
    const tabHeight = Math.max(MIN_TAP_PX * 0.75, 34 * scale);
    const widths = SECTION_ORDER.map((s) => SECTION_LABELS[s].length + 2);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = inner.x;
    SECTION_ORDER.forEach((s, i) => {
      const width = inner.width * (widths[i] / total);
      const tab = {
        kind: 'TAB', role: ItemsControl.TAB, section: s, label: SECTION_LABELS[s], hint: String(i + 1),
        selected: s === open, x, y, width, height: tabHeight,
      };
      tabs.push(tab);
      controls.push(tab);
      x += width;
    });
    y += tabHeight;
  }
  y += gap / 2;

  const area = { x: inner.x, y, width: inner.width, height: Math.max(0, footY - gap - y) };
  const rows = itemRows(party, open);
  const highlight = clampRow(rows, selected);

  // The purse belongs to the party as the pack does, so it rides on the section's heading.
  const gold = purseOf(party);
  const laid = [{ kind: 'HEADING', text: SECTION_LABELS[open], aside: `${gold} gold`, top: 0, height: heading }];
  let cursor = heading;
  rows.forEach((row, index) => {
    laid.push({
      ...itemEntry(row.item, {
        index, count: row.count, detail: itemDetail(row.item, spells), selected: index === highlight,
      }),
      packIndex: row.packIndex,
      top: cursor,
      height: rowHeight,
    });
    cursor += rowHeight;
  });
  if (rows.length === 0) {
    laid.push({ kind: 'NOTE', text: inFight ? 'Nothing to use' : 'Nothing here', top: cursor, height: heading });
  }

  const shown = scrollWindow(laid, area, { scroll, follow, scale });
  return {
    mode: 'LIST',
    section: open,
    inFight,
    gold,
    scale,
    bounds,
    title,
    tabs,
    area,
    ...shown,
    selected: highlight,
    rowCount: rows.length,
    controls: [...controls, ...shown.controls],
  };
}

/** How the text of a description is broken over lines, roughly, to know its height. */
function wrappedLines(text, width, fontSize) {
  // The page's text is monospace, so a character's width is close to a fixed share.
  const perLine = Math.max(8, Math.floor(width / (fontSize * 0.6)));
  let lines = 0;
  let current = 0;
  for (const word of text.split(/\s+/)) {
    if (current === 0) current = word.length;
    else if (current + 1 + word.length <= perLine) current += 1 + word.length;
    else { lines += 1; current = word.length; }
  }
  return lines + (current > 0 ? 1 : 0);
}

/** Every number an item carries, each a line of its own and named in full. */
export function itemFacts(item, spells = {}) {
  const facts = [];
  const add = (label, value) => facts.push({ label, value: String(value) });
  if (item.kind === ItemKind.FOOD) {
    add('Fullness', item.nourish ?? 0);
    if (item.heal) add('Heals', item.heal);
    for (const [trait, points] of Object.entries(item.traits ?? {})) add(titled(trait), points);
    return facts;
  }
  const taught = tomeSpell(item, spells);
  if (taught) {
    add('Teaches', taught.name);
    add('School', `${titled(taught.school)} ${taught.rank}`);
    add('Read by', classesCasting(taught.school).map(titled).join(', '));
    return facts;
  }
  if (isConsumable(item)) {
    add('Heals', item.effect?.[Effect.HEAL] ?? 0);
    return facts;
  }
  add('Slot', SLOT_LABELS[item.slot] ?? titled(item.slot));
  if (item.category) add('Category', titled(item.category));
  if (item.kind === ItemKind.WEAPON) {
    if (item.skill) add('Trains', item.skill === MAGIC_SKILL ? 'Magic school' : titled(item.skill));
    const drive = item.governs === CASTING ? 'casting attribute' : titled(item.governs);
    add('Damage', `${item.damage}, with ${drive}`);
  } else {
    add('Armour', item.armour);
  }
  add('Wielded by', classesWielding(item.category).map(titled).join(', '));
  return facts;
}

const KIND_NAMES = {
  [ItemKind.WEAPON]: 'weapon', [ItemKind.ARMOUR]: 'armour', [ItemKind.SHIELD]: 'shield',
  [ItemKind.CONSUMABLE]: 'potion', [ItemKind.FOOD]: 'food',
};

/**
 * One item close up, and who may take it.
 *
 * @spec PRESENT-ITEMS-011
 * @spec PRESENT-ITEMS-012
 * @spec PRESENT-ITEMS-013
 * @spec PRESENT-ITEMS-027
 * @spec PRESENT-ITEMS-030
 */
export function buildItemPagePlan(party, viewport, item, {
  selected = 0, inFight = false, actingId = null, spells = {}, scroll = 0, follow = true,
} = {}) {
  if (!party || !item) return null;
  const frame = pageFrame(viewport);
  const { scale, bounds, inner, gap, heading, line, rowHeight, tap, footY } = frame;
  let y = bounds.y + frame.pad;

  const kindName = tomeSpell(item, spells) ? 'tome' : KIND_NAMES[item.kind] ?? titled(item.kind);
  const tier = titled(item.rarity ?? Rarity.COMMON);
  const title = {
    name: item.name,
    colour: rarityColour(item),
    position: `${tier} ${kindName}`,
    box: { x: inner.x, y, width: inner.width, height: tap },
  };
  y += tap + gap / 2;

  const area = { x: inner.x, y, width: inner.width, height: Math.max(0, footY - gap - y) };
  const laid = [];
  let cursor = 0;
  for (const fact of itemFacts(item, spells)) {
    laid.push({ kind: 'LINE', label: fact.label, value: fact.value, top: cursor, height: line });
    cursor += line;
  }
  const count = countInPack(party, item);
  if (count > 1) {
    laid.push({ kind: 'LINE', label: 'Carried', value: `${count}`, top: cursor, height: line });
    cursor += line;
  }
  // Enchantments, when an item carries any; nothing is drawn for one that carries none.
  const enchantments = item.enchantments ?? [];
  if (enchantments.length > 0) {
    cursor += gap / 2;
    laid.push({ kind: 'HEADING', text: 'Enchantments', top: cursor, height: heading });
    cursor += heading;
    for (const enchantment of enchantments) {
      laid.push({ kind: 'TEXT', text: String(enchantment.name ?? enchantment), top: cursor, height: line });
      cursor += line;
    }
  }
  if (item.description) {
    cursor += gap / 2;
    const fontSize = Math.round(12 * scale);
    const height = wrappedLines(item.description, area.width, fontSize) * fontSize * 1.35;
    laid.push({ kind: 'TEXT', text: item.description, flavour: true, top: cursor, height });
    cursor += height;
  }
  cursor += gap;

  const kind = choiceKind(item, spells);
  const choices = itemChoices(party, item, { inFight, actingId, spells });
  const highlight = clampRow(choices, selected);
  if (kind === ChoiceKind.NONE) {
    laid.push({ kind: 'NOTE', text: 'Eaten at camp, from the pot', top: cursor, height: heading });
  } else {
    laid.push({ kind: 'HEADING', text: CHOICE_HEADINGS[kind], top: cursor, height: heading });
    cursor += heading;
    choices.forEach((choice, index) => {
      laid.push({
        kind: 'ROW',
        index,
        characterId: choice.characterId,
        name: choice.name,
        detail: choice.note,
        available: choice.available,
        greyed: !choice.available,
        selected: index === highlight,
        top: cursor,
        height: rowHeight,
      });
      cursor += rowHeight;
    });
  }

  const shown = scrollWindow(laid, area, { scroll, follow, scale });
  return {
    mode: 'ITEM',
    item,
    choiceKind: kind,
    inFight,
    scale,
    bounds,
    title,
    tabs: [],
    area,
    ...shown,
    selected: highlight,
    rowCount: choices.length,
    controls: [backControl(frame), ...shown.controls],
  };
}

/**
 * What fits a slot: taking off what is worn, then every pack item for that slot.
 * Shared by the plan and the controller, so a key and a press reach the same row.
 *
 * @spec PRESENT-PARTY-029
 */
export function slotRows(party, characterId, slot) {
  const c = character(party, characterId);
  if (!c) return [];
  const rows = [];
  if (c.equipment[slot]) rows.push({ takeOff: true, item: c.equipment[slot] });
  packOf(party).forEach((item, packIndex) => {
    if (fitsSlot(item, slot)) rows.push({ takeOff: false, item, packIndex });
  });
  return rows;
}

/**
 * The list over a character's page, of what fits one slot.
 *
 * @spec PRESENT-PARTY-029
 * @spec PRESENT-PARTY-030
 * @spec PRESENT-PARTY-033
 */
export function buildSlotListPlan(party, viewport, {
  characterId, slot, selected = 0, scroll = 0, follow = true,
} = {}) {
  const c = character(party, characterId);
  if (!c) return null;
  const frame = pageFrame(viewport);
  const { scale, bounds, inner, gap, heading, rowHeight, tap, footY } = frame;
  let y = bounds.y + frame.pad;
  const slotName = SLOT_LABELS[slot] ?? titled(slot);
  const title = { name: c.name, position: slotName, box: { x: inner.x, y, width: inner.width, height: tap } };
  y += tap + gap / 2;

  const area = { x: inner.x, y, width: inner.width, height: Math.max(0, footY - gap - y) };
  const rows = slotRows(party, characterId, slot);
  const highlight = clampRow(rows, selected);
  const laid = [];
  let cursor = 0;
  rows.forEach((row, index) => {
    const may = row.takeOff || wieldableBy(row.item, c.characterClass);
    const entry = itemEntry(row.item, {
      index,
      detail: row.takeOff ? 'Back into the pack' : (may ? itemDetail(row.item) : wieldersOf(row.item)),
      greyed: !may,
      available: may,
      selected: index === highlight,
    });
    if (row.takeOff) entry.name = `Take off ${row.item.name}`;
    laid.push({ ...entry, takeOff: row.takeOff, top: cursor, height: rowHeight });
    cursor += rowHeight;
  });
  if (rows.length === 0) {
    laid.push({ kind: 'NOTE', text: `Nothing in the pack for the ${slotName.toLowerCase()}`, top: cursor, height: heading });
  }

  const shown = scrollWindow(laid, area, { scroll, follow, scale });
  return {
    mode: 'SLOT',
    characterId,
    slot,
    scale,
    bounds,
    title,
    tabs: [],
    area,
    ...shown,
    selected: highlight,
    rowCount: rows.length,
    controls: [backControl(frame), ...shown.controls],
  };
}
