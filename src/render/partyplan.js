/**
 * The party screen's page: one character, laid out whole before anything is drawn.
 *
 * Pure, like every other plan. It reads the party at the moment it is asked and keeps
 * nothing; the page shown is the only thing handed in, and that is the controller's.
 */

import {
  Attribute, Condition, SKILL_GROUPS, roster, skillProgress, skillRank, totalLevel, RANK_CAP,
} from '../sim/party.js';
import { Slot } from '../sim/items.js';
import { MIN_TAP_PX, uiScale, contentColumn } from './geometry.js';

/** What a control on the page does. None of them changes a character. */
export const PartyControl = { PREVIOUS: 'PREVIOUS', NEXT: 'NEXT', CLOSE: 'CLOSE' };

/** A name as a player reads it: `HEAVY_ARMOUR` is Heavy Armour. */
const titled = (key) => key.toLowerCase().split('_')
  .map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');

const ATTRIBUTE_ORDER = [
  Attribute.MIGHT, Attribute.CONSTITUTION, Attribute.DEXTERITY,
  Attribute.INTELLECT, Attribute.PERCEPTION, Attribute.RESOLVE,
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
 * @spec PRESENT-PARTY-017
 * @spec PRESENT-PARTY-018
 * @spec PRESENT-PARTY-019
 */
export function buildPartyPlan(party, viewport, { page = 0 } = {}) {
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
    height: viewport.height - margin * 2,
  };
  const inner = { x: bounds.x + pad, width: bounds.width - pad * 2 };
  let y = bounds.y + pad;

  // Previous and next either side of the name, Close at the far end: the page turns
  // from the top, where the name it is turning to is.
  // @spec PRESENT-PARTY-009
  // @spec PRESENT-PARTY-010
  const tap = Math.max(MIN_TAP_PX, 48 * scale);
  const closeWidth = Math.max(MIN_TAP_PX, 76 * scale);
  const controls = [
    { role: PartyControl.PREVIOUS, label: '<', hint: 'A', x: inner.x, y, width: tap, height: tap },
    {
      role: PartyControl.NEXT, label: '>', hint: 'D',
      x: inner.x + inner.width - closeWidth - gap - tap, y, width: tap, height: tap,
    },
    {
      role: PartyControl.CLOSE, label: 'Close', hint: 'Esc',
      x: inner.x + inner.width - closeWidth, y, width: closeWidth, height: tap,
    },
  ].map((control) => ({ ...control, kind: 'BUTTON' }));
  const title = {
    x: inner.x + tap + gap,
    y,
    width: Math.max(0, inner.width - tap * 2 - closeWidth - gap * 3),
    height: tap,
  };
  y += tap + gap;

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
  y += 10 * scale + gap;

  // Six attributes, two to a row.
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
          // A rank kept from another career still counts, and will not move again.
          advancing: c.trainable.includes(skill),
          box: { ...place, height: skillRow },
          bar: { x: place.x, y: place.y + skillRow, width: place.width, height: barHeight },
        };
      }),
    });
    y += Math.ceil(held.length / 2) * slot + gap / 2;
  }
  y += gap / 2;

  // Every slot there is, empty ones included, so a gap in the kit is visible as a gap.
  const equipment = Object.values(Slot).map((s, i) => ({
    slot: s,
    label: SLOT_LABELS[s] ?? titled(s),
    item: c.equipment[s]?.name ?? null,
    box: { x: inner.x, y: y + i * line, width: inner.width, height: line },
  }));

  return {
    characterId: c.id,
    page: at,
    scale,
    bounds,
    heading,
    health,
    attributes,
    skills,
    equipment,
    controls,
  };
}
