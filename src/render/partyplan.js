/**
 * The party screen's page: one character, laid out whole before anything is drawn.
 *
 * Pure, like every other plan. It reads the party at the moment it is asked and keeps
 * nothing; the page shown is the only thing handed in, and that is the controller's.
 */

import {
  Attribute, Condition, SKILL_GROUPS, Skill, chargesLeft, roster, skillProgress, skillRank, totalLevel, RANK_CAP,
} from '../sim/party.js';
import { Slot } from '../sim/items.js';
import { MIN_TAP_PX, uiScale, contentColumn, stampRoom } from './geometry.js';
import { hungerStage, HungerStage } from '../sim/food.js';
import { buffText } from './campplan.js';
import { itemDetail } from './itemsplan.js';
import { rarityColour } from './appconfig.js';

/** How each stage is named on a character's page. */
const STAGE_NAMES = {
  [HungerStage.FED]: 'Fed',
  [HungerStage.HUNGRY]: 'Hungry',
  [HungerStage.VERY_HUNGRY]: 'Very hungry',
  [HungerStage.FAMISHED]: 'Famished',
  [HungerStage.RAVENOUS]: 'Ravenous',
  [HungerStage.STARVING]: 'Starving',
};

/** What a control on the page does. Only a slot changes a character, by way of its list. */
export const PartyControl = {
  PREVIOUS: 'PREVIOUS', NEXT: 'NEXT', CLOSE: 'CLOSE', NEW_CAMPAIGN: 'NEW_CAMPAIGN', TESTING: 'TESTING',
  SLOT: 'SLOT',
};

/** A name as a player reads it: `HEAVY_ARMOUR` is Heavy Armour. */
const titled = (key) => key.toLowerCase().split('_')
  .map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');

const ATTRIBUTE_ORDER = [
  Attribute.MIGHT, Attribute.CONSTITUTION, Attribute.DEXTERITY,
  Attribute.INTELLECT, Attribute.RESOLVE,
];

const SLOT_LABELS = { [Slot.MAIN_HAND]: 'Main hand', [Slot.OFF_HAND]: 'Off hand', [Slot.BODY]: 'Body' };

/**
 * Which page a requested one lands on. A page past the end of the party goes back to
 * the first, so a party that shrank under an open screen still shows somebody.
 */
export function pageFor(party, page) {
  const count = roster(party).length;
  if (count === 0) return null;
  return Number.isInteger(page) && page >= 0 && page < count ? page : 0;
}

/**
 * @spec PRESENT-PARTY-007
 * @spec PRESENT-PARTY-012
 * @spec PRESENT-PARTY-013
 * @spec PRESENT-PARTY-014
 * @spec PRESENT-PARTY-015
 * @spec PRESENT-PARTY-016
 * @spec PRESENT-PARTY-026
 * @spec PRESENT-PARTY-018
 * @spec PRESENT-PARTY-019
 * @spec PRESENT-PARTY-027
 */
export function buildPartyPlan(party, viewport, {
  page = 0, testing = false, selectedSlot = 0, scroll: wanted = 0, follow = false,
} = {}) {
  const at = pageFor(party, page);
  if (at === null) return null;
  const members = roster(party);
  const c = members[at];

  const scale = uiScale(viewport);
  const column = contentColumn(viewport);
  const margin = 8 * scale;
  const pad = 12 * scale;
  const gap = 10 * scale;
  const line = 18 * scale;

  const bounds = {
    x: column.x + margin,
    y: margin,
    width: column.width - margin * 2,
    // Short of the foot of the screen, which is the build stamp's.
    height: viewport.height - margin - stampRoom(scale),
  };
  const inner = { x: bounds.x + pad, width: bounds.width - pad * 2 };
  let y = bounds.y + pad;

  // Previous, Close and next in one row along the foot, where a thumb holding a phone
  // already is; the name runs across the head, where reading starts.
  // @spec PRESENT-PARTY-009
  // @spec PRESENT-PARTY-010
  // @spec PRESENT-PARTY-024
  const tap = Math.max(MIN_TAP_PX, 48 * scale);
  const closeWidth = Math.max(MIN_TAP_PX, 76 * scale);
  const footY = bounds.y + bounds.height - pad - tap;
  const controls = [
    { role: PartyControl.PREVIOUS, label: '<', hint: 'A', x: inner.x, y: footY, width: tap, height: tap },
    {
      role: PartyControl.NEXT, label: '>', hint: 'D',
      x: inner.x + inner.width - tap, y: footY, width: tap, height: tap,
    },
    {
      role: PartyControl.CLOSE, label: 'Close', hint: 'Esc',
      x: inner.x + (inner.width - closeWidth) / 2, y: footY, width: closeWidth, height: tap,
    },
  ].map((control) => ({ ...control, kind: 'BUTTON' }));
  const title = { x: inner.x, y, width: inner.width, height: tap };
  y += tap + gap / 2;

  // Everything under the name scrolls, within the window between it and the row of
  // controls along the foot, so a page longer than a phone is still all there.
  // @spec PRESENT-PARTY-034
  const area = { x: inner.x, y, width: inner.width, height: Math.max(0, footY - gap / 2 - y) };
  const layOut = (top) => {
    const content = [];
    y = top;

    // Who this is, and where they sit among the others.
    const portraitSize = 56 * scale;
    const heading = {
      name: c.name,
      characterClass: titled(c.characterClass),
      totalLevel: totalLevel(c),
      position: `${at + 1} / ${members.length}`,
      portrait: c.portrait ?? null,
      title,
      box: { x: inner.x, y, width: inner.width, height: portraitSize },
      portraitBox: { x: inner.x, y, size: portraitSize },
    };
    y += portraitSize + gap;

    // A bar at zero cannot tell an unconscious character from a dead one, so the
    // condition is named whenever it is anything but conscious.
    const health = {
      hitPoints: c.hitPoints,
      maxHitPoints: c.maxHitPoints,
      share: c.maxHitPoints > 0 ? Math.max(0, c.hitPoints) / c.maxHitPoints : 0,
      condition: c.condition === Condition.OK ? null : titled(c.condition),
      box: { x: inner.x, y, width: inner.width, height: line },
    };
    y += line;
    health.bar = { x: inner.x, y, width: inner.width, height: 10 * scale };
    y += 10 * scale + gap / 2;

    // How hungry they are, and what their last meal still does for them.
    // @spec PRESENT-HUNGER-002
    const hunger = {
      stage: STAGE_NAMES[hungerStage(c)],
      buffs: (c.buffs ?? []).map(buffText),
      box: { x: inner.x, y, width: inner.width, height: line },
    };
    y += line + gap / 2;

    // Every slot there is, empty ones included, so a gap in the kit is visible as a gap.
    // First on the page after the hit points: it is what a player comes here to change.
    // Each is pressed to open what the pack holds for it.
    const slotHeight = Math.max(MIN_TAP_PX, 40 * scale);
    const equipment = Object.values(Slot).map((s, i) => {
      const item = c.equipment[s] ?? null;
      return {
        slot: s,
        label: SLOT_LABELS[s] ?? titled(s),
        item: item?.name ?? null,
        colour: item ? rarityColour(item) : null,
        detail: item ? itemDetail(item) : null,
        selected: i === selectedSlot,
        box: { x: inner.x, y: y + i * slotHeight, width: inner.width, height: slotHeight },
      };
    });
    for (const e of equipment) {
      content.push({ kind: 'SLOT', role: PartyControl.SLOT, slot: e.slot, ...e.box });
    }
    y += equipment.length * slotHeight + gap;

    // The attributes, two to a row.
    const half = (inner.width - gap) / 2;
    const cell = (index, top, height) => ({
      x: inner.x + (index % 2) * (half + gap),
      y: top + Math.floor(index / 2) * height,
      width: half,
      height,
    });
    const attributes = ATTRIBUTE_ORDER.map((attribute, i) => ({
      attribute,
      label: titled(attribute),
      score: c.attributes[attribute],
      box: cell(i, y, line),
    }));
    y += Math.ceil(ATTRIBUTE_ORDER.length / 2) * line + gap;

    // Skills, in the party segment's groups and order, only where something is held.
    const skillRow = 16 * scale;
    const barHeight = 4 * scale;
    const slot = skillRow + barHeight + 4 * scale;
    const skills = [];
    for (const { group, skills: inGroup } of SKILL_GROUPS) {
      const held = inGroup.filter((s) => skillRank(c, s) >= 1);
      if (held.length === 0) continue;
      const box = { x: inner.x, y, width: inner.width, height: skillRow };
      y += skillRow;
      const top = y;
      skills.push({
        group,
        label: titled(group),
        box,
        skills: held.map((skill, i) => {
          const place = cell(i, top, slot);
          const rank = skillRank(c, skill);
          return {
            skill,
            label: titled(skill),
            rank,
            progress: skillProgress(c, skill),
            atCap: rank >= RANK_CAP,
            // How many falls a cleric can still catch, beside the skill that catches them.
            // @spec PRESENT-PARTY-026
            ...(skill === Skill.INTERCESSION ? { charges: chargesLeft(c) } : {}),
            box: { ...place, height: skillRow },
            bar: { x: place.x, y: place.y + skillRow, width: place.width, height: barHeight },
          };
        }),
      });
      y += Math.ceil(held.length / 2) * slot + gap / 2;
    }
    y += gap / 2;

    // At the end of the page, after everything about the character: it is about the
    // campaign rather than anybody on it, and it should never be pressed on the way to
    // something else. To the right, the side a page's rows leave emptier.
    // @spec PRESENT-PARTY-020
    const campaignWidth = Math.max(MIN_TAP_PX, 120 * scale);
    content.push({
      kind: 'BUTTON', role: PartyControl.NEW_CAMPAIGN, label: 'New campaign',
      x: inner.x + inner.width - campaignWidth,
      y,
      width: campaignWidth,
      height: tap,
    });
    // Beside it, whether testing mode is on, and the way to switch it.
    // @spec PRESENT-PARTY-025
    content.push({
      kind: 'BUTTON', role: PartyControl.TESTING, label: `Testing: ${testing ? 'on' : 'off'}`,
      x: inner.x + inner.width - campaignWidth * 2 - gap,
      y,
      width: campaignWidth,
      height: tap,
    });
    y += tap;
    return { heading, health, hunger, equipment, attributes, skills, content, bottom: y };
  };

  // Laid out once from the top to learn how long the page is, then again where the
  // scroll puts it. With `follow`, the highlighted slot is kept in view.
  const whole = layOut(area.y);
  const maxScroll = Math.max(0, whole.bottom - (area.y + area.height));
  let scroll = wanted ?? 0;
  if (follow) {
    const chosen = whole.equipment[selectedSlot]?.box;
    if (chosen) {
      if (chosen.y - area.y < scroll) scroll = chosen.y - area.y;
      if (chosen.y + chosen.height - area.y > scroll + area.height) scroll = chosen.y + chosen.height - area.y - area.height;
    }
  }
  scroll = Math.min(maxScroll, Math.max(0, scroll));
  const {
    heading, health, hunger, equipment, attributes, skills, content,
  } = layOut(area.y - scroll);

  // Only what the window shows any of is drawn and pressed, clipped to the window; a
  // press outside the window is not a press on what scrolled under the foot.
  for (const control of content) {
    const top = Math.max(area.y, control.y);
    const bottom = Math.min(area.y + area.height, control.y + control.height);
    if (bottom - top >= 1) controls.push({ ...control, scrolls: true });
  }
  const barWidth = 3 * scale;
  const track = { x: area.x + area.width - barWidth, y: area.y, width: barWidth, height: area.height };
  const total = area.height + maxScroll;
  const thumbHeight = maxScroll > 0 ? Math.max(16 * scale, area.height * (area.height / total)) : 0;
  const scrollbar = maxScroll > 0
    ? { track, thumb: { ...track, y: track.y + (track.height - thumbHeight) * (scroll / maxScroll), height: thumbHeight } }
    : null;

  return {
    area,
    clip: area,
    scroll,
    maxScroll,
    scrollbar,
    title: { name: c.name, position: `${at + 1} / ${members.length}`, box: title },
    characterId: c.id,
    page: at,
    scale,
    bounds,
    heading,
    health,
    hunger,
    attributes,
    skills,
    equipment,
    controls,
  };
}
