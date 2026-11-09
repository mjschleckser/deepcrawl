/**
 * The camp screen's draw plan: what the rest did, what was foraged, the pot, and what the
 * pot would make.
 *
 * Laid out in the Items screen's shape — a head, rows down the page, buttons along the
 * foot — so the same drawing serves it. Every number in the preview comes from the food
 * segment, so what is shown is what cooking does.
 */

import { packOf } from '../sim/party.js';
import { ItemKind } from '../sim/items.js';
import { Trait } from '../sim/food.js';
import { potPreview } from '../sim/meals.js';
import { MIN_TAP_PX, uiScale, contentColumn, stampRoom } from './geometry.js';
import { rarityColour } from './appconfig.js';
import { foodDetail } from './itemsplan.js';

export const CampControl = { FOOD: 'FOOD', COOK: 'COOK', LEAVE: 'LEAVE' };

/**
 * What one meal buff does, in the words a line has room for.
 *
 * @spec PRESENT-CAMP-007
 * @spec PRESENT-HUNGER-002
 */
export function buffText({ trait, points }) {
  switch (trait) {
    case Trait.HEARTY: return `Hearty: +${Math.round(2 * points)}% damage`;
    case Trait.TOUGH: return `Tough: +${Math.floor(points / 2)} armour`;
    case Trait.NIMBLE: return `Nimble: +${Math.floor(points / 2)} Dexterity`;
    case Trait.ARCANE: return `Arcane: +${Math.round(3 * points)}% spell power`;
    case Trait.HALE: return `Hale: +${Math.round(2 * points)} maximum hit points`;
    case Trait.WARMING: return `Warming: hunger ${Math.round(Math.min(50, 5 * points))}% slower`;
    default: return trait;
  }
}

/** The lines that say what a meal does for each eater. */
export function mealLines(meal) {
  if (meal.eaters.length === 0) return ['Nobody is awake to eat'];
  return [`Each eats: +${meal.nourish} fullness, heals ${meal.heal}`, ...meal.buffs.map(buffText)];
}

/** Each kind of food carried, in the order it first stands in the pack, with how many. */
export function foodKinds(party) {
  const kinds = new Map();
  for (const item of packOf(party)) {
    if (item.kind !== ItemKind.FOOD) continue;
    const kind = kinds.get(item.id) ?? { item, carried: 0 };
    kind.carried += 1;
    kinds.set(item.id, kind);
  }
  return [...kinds.values()];
}

/** The actual items the pot holds: so many of each kind, taken from the pack in order. */
export function potItems(party, pot) {
  const items = [];
  const wanted = { ...pot };
  for (const item of packOf(party)) {
    if (item.kind === ItemKind.FOOD && (wanted[item.id] ?? 0) > 0) {
      items.push(item);
      wanted[item.id] -= 1;
    }
  }
  return items;
}

/**
 * @spec PRESENT-CAMP-004
 * @spec PRESENT-CAMP-005
 * @spec PRESENT-CAMP-007
 */
export function buildCampPlan(party, viewport, { pot = {}, selected = 0, foraged = [] } = {}) {
  const scale = uiScale(viewport);
  const column = contentColumn(viewport);
  const margin = 8 * scale;
  const pad = 12 * scale;
  const gap = 10 * scale;
  const line = 20 * scale;
  const rowHeight = Math.max(MIN_TAP_PX, 44 * scale);
  const bounds = {
    x: column.x + margin,
    y: margin,
    width: column.width - margin * 2,
    height: viewport.height - margin - stampRoom(scale),
  };
  const inner = { x: bounds.x + pad, width: bounds.width - pad * 2 };
  const tap = Math.max(MIN_TAP_PX, 48 * scale);
  const half = (inner.width - gap) / 2;
  const footY = bounds.y + bounds.height - pad - tap;

  const controls = [
    { kind: 'BUTTON', role: CampControl.LEAVE, label: 'Leave', hint: 'Esc', x: inner.x, y: footY, width: half, height: tap },
    { kind: 'BUTTON', role: CampControl.COOK, label: 'Cook', hint: 'Enter', x: inner.x + half + gap, y: footY, width: half, height: tap },
  ];

  const title = {
    name: 'Camp',
    position: 'The party rests. Spell slots are restored.',
    box: { x: inner.x, y: bounds.y + pad, width: inner.width, height: tap },
  };

  const entries = [];
  let y = title.box.y + tap + gap;
  const at = (height) => {
    const box = { x: inner.x, y, width: inner.width, height };
    y += height;
    return box;
  };
  entries.push({
    kind: 'HEADING',
    text: foraged.length > 0 ? `Foraged: ${foraged.map((i) => i.name).join(', ')}` : 'Foraged: nothing',
    box: at(line),
  });
  entries.push({ kind: 'HEADING', text: 'The pot', box: at(line) });

  const preview = potPreview(party, potItems(party, pot));
  const previewLines = Object.values(pot).some((n) => n > 0) ? mealLines(preview) : ['Nothing in the pot yet'];
  const previewTop = footY - gap - previewLines.length * line;

  const kinds = foodKinds(party);
  if (kinds.length === 0) entries.push({ kind: 'NOTE', text: 'No food carried', box: at(rowHeight) });
  kinds.forEach(({ item, carried }, index) => {
    // Only what fits whole above the preview is drawn, and only what is drawn is pressed.
    if (y + rowHeight > previewTop - gap) return;
    const inPot = pot[item.id] ?? 0;
    const box = at(rowHeight);
    entries.push({
      kind: 'ROW', index, id: item.id, name: item.name, colour: rarityColour(item),
      detail: `${inPot} of ${carried} in the pot · ${foodDetail(item)}`,
      available: true, greyed: false, selected: index === selected, box,
    });
    controls.push({ kind: 'ROW', role: CampControl.FOOD, index, id: item.id, available: true, ...box });
  });

  // What the pot would make, at the foot of the page above the buttons.
  previewLines.forEach((text, i) => {
    entries.push({ kind: 'NOTE', text, box: { x: inner.x, y: previewTop + i * line, width: inner.width, height: line } });
  });

  return { scale, bounds, title, entries, controls, preview, kinds: kinds.map((k) => k.item.id) };
}
