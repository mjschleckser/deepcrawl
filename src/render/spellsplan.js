/**
 * The Spells screen's draw plan: one character's spells, or, once one is chosen, whom
 * to cast it on.
 *
 * Laid out in the Items screen's shape — the name across the head, rows down the page,
 * previous, Close and next along the foot — so one drawing serves both and the two
 * screens read alike.
 */

import { Condition, roster, character } from '../sim/party.js';
import {
  CastRefusal, CastWhere, SpellEffect, SpellTarget,
  castPayment, castRefusal, healPreview, knownSpells, slotsAt, slotsLeft, spellMagnitude,
} from '../sim/magic.js';
import { MIN_TAP_PX, uiScale, contentColumn, stampRoom } from './geometry.js';

export const SpellsControl = {
  PREVIOUS: 'PREVIOUS', NEXT: 'NEXT', CLOSE: 'CLOSE', SPELL: 'SPELL', TARGET: 'TARGET',
};

/** What a spell does, in the words a row has room for. */
export function spellEffectText(caster, spell) {
  const magnitude = spellMagnitude(caster, spell);
  if (spell.effect[SpellEffect.HEAL]) return `Heals ${magnitude}`;
  return spell.effect.ignoresArmour ? `${magnitude} damage, ignores armour` : `${magnitude} damage`;
}

const REASONS = {
  [CastRefusal.NO_SLOTS]: 'No slots left',
  [CastRefusal.TOO_HURT]: 'Too hurt to pay',
  [CastRefusal.NOT_HERE]: 'In a fight only',
  [CastRefusal.UNHURT]: 'Unhurt',
  [CastRefusal.UNCONSCIOUS]: 'Unconscious',
};

/**
 * The rows a page offers: the character's spells, or the party to cast one on.
 *
 * @spec PRESENT-SPELLS-004
 * @spec PRESENT-SPELLS-005
 * @spec PRESENT-SPELLS-006
 */
export function spellRows(party, characterId, spells, spellId = null) {
  const c = character(party, characterId);
  if (!c) return [];
  if (spellId) {
    const spell = spells[spellId];
    // Only a heal is cast out of a fight, and only on the party.
    if (spell.target !== SpellTarget.ALLY) return [];
    return roster(party)
      .filter((t) => t.condition === Condition.OK || t.condition === Condition.UNCONSCIOUS)
      .map((t) => {
        const refusal = castRefusal(party, characterId, spell, { where: CastWhere.EXPLORATION, targetId: t.id });
        const hp = `${t.hitPoints}/${t.maxHitPoints}`;
        return {
          role: SpellsControl.TARGET, id: t.id, name: t.name,
          detail: refusal ? `${hp} · ${REASONS[refusal] ?? 'Not now'}` : `${hp} · Heals ${healPreview(party, characterId, spell, t.id)}`,
          available: refusal === null,
        };
      });
  }
  return knownSpells(c, spells).map((spell) => {
    const refusal = castRefusal(party, characterId, spell, { where: CastWhere.EXPLORATION });
    // A mage out of slots pays in hit points, and is told how many.
    const payment = castPayment(c, spell, spells);
    const slots = payment.slot || payment.hitPoints === null
      ? `${slotsLeft(c, spell.rank, spells)}/${slotsAt(c, spell.rank, spells)} slots`
      : `${payment.hitPoints} HP`;
    return {
      role: SpellsControl.SPELL, id: spell.id, name: spell.name,
      detail: refusal ? (REASONS[refusal] ?? 'Not now') : `${spellEffectText(c, spell)} · ${slots}`,
      available: refusal === null,
    };
  });
}

/**
 * The first character who can cast something out of a fight, or the first character.
 *
 * @spec PRESENT-SPELLS-001
 */
export function openingSpellsPage(party, spells) {
  const members = roster(party);
  const at = members.findIndex((c) => knownSpells(c, spells).some((s) => s.where.includes(CastWhere.EXPLORATION)));
  return at < 0 ? 0 : at;
}

/**
 * @spec PRESENT-SPELLS-002
 * @spec PRESENT-SPELLS-004
 * @spec PRESENT-SPELLS-005
 * @spec PRESENT-SPELLS-006
 */
export function buildSpellsPlan(party, viewport, { page = 0, selected = 0, spellId = null, spells = {} } = {}) {
  const members = roster(party);
  const c = members[page];
  if (!c) return null;

  const scale = uiScale(viewport);
  const column = contentColumn(viewport);
  const margin = 8 * scale;
  const pad = 12 * scale;
  const gap = 10 * scale;
  const rowHeight = Math.max(MIN_TAP_PX, 44 * scale);
  const bounds = {
    x: column.x + margin,
    y: margin,
    width: column.width - margin * 2,
    height: viewport.height - margin - stampRoom(scale),
  };
  const inner = { x: bounds.x + pad, width: bounds.width - pad * 2 };

  // Previous, Close and next along the foot, as on the Items screen.
  const tap = Math.max(MIN_TAP_PX, 48 * scale);
  const closeWidth = Math.max(MIN_TAP_PX, 76 * scale);
  const footY = bounds.y + bounds.height - pad - tap;
  const controls = [
    { role: SpellsControl.PREVIOUS, label: '<', hint: 'A', x: inner.x, y: footY, width: tap, height: tap },
    { role: SpellsControl.NEXT, label: '>', hint: 'D', x: inner.x + inner.width - tap, y: footY, width: tap, height: tap },
    {
      role: SpellsControl.CLOSE, label: spellId ? 'Back' : 'Close', hint: 'Esc',
      x: inner.x + (inner.width - closeWidth) / 2, y: footY, width: closeWidth, height: tap,
    },
  ].map((control) => ({ ...control, kind: 'BUTTON' }));

  const title = {
    name: c.name,
    position: spellId ? `${spells[spellId].name}: whom?` : `${page + 1} / ${members.length}`,
    box: { x: inner.x, y: bounds.y + pad, width: inner.width, height: tap },
  };
  const area = { x: inner.x, y: title.box.y + tap + gap, width: inner.width };
  area.height = Math.max(0, footY - gap - area.y);

  const rows = spellRows(party, c.id, spells, spellId);
  const entries = [];
  if (rows.length === 0) {
    entries.push({
      kind: 'NOTE', text: 'Knows no spells',
      box: { x: area.x, y: area.y, width: area.width, height: rowHeight },
    });
  }
  rows.forEach((row, index) => {
    const top = area.y + index * rowHeight;
    // Only what fits whole is drawn, and only what is drawn can be pressed.
    if (top + rowHeight > area.y + area.height + 0.5) return;
    const box = { x: area.x, y: top, width: area.width, height: rowHeight };
    entries.push({
      kind: 'ROW', index, role: row.role, id: row.id, name: row.name, detail: row.detail,
      available: row.available, greyed: !row.available, selected: index === selected, box,
    });
    controls.push({ kind: 'ROW', role: row.role, index, available: row.available, ...box });
  });

  return {
    characterId: c.id, page, scale, bounds, title, area, entries, controls, spellId,
  };
}
