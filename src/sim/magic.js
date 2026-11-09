/**
 * Magic: what a spell is, who knows it, what it costs, and what a cast does.
 *
 * Combat decides when a spell is cast in a fight and applies a spell's damage to an
 * enemy; exploration decides when one is cast out of a fight. Every change to a
 * character goes through the party's own operations. Spells arrive as a catalogue handed
 * in by whoever read them, so nothing here reads a file.
 */

import {
  Attribute, Condition, character, applyHealing, packOf, skillRank, trainSkill,
} from './party.js';
import { Effect } from './items.js';
import { spellFactor } from './food.js';

export const SpellTarget = { ENEMY: 'ENEMY', ALLY: 'ALLY' };
export const CastWhere = { COMBAT: 'COMBAT', EXPLORATION: 'EXPLORATION' };
export const Learned = { CLASS: 'CLASS', TOME: 'TOME' };
export const SpellEffect = { DAMAGE: 'damage', HEAL: 'heal' };

/** Rank-1 slots every caster holds, and how many points of Intellect buy one more. */
const BASE_SLOTS = 3;
const INTELLECT_PER_SLOT = 2;
const MAGNITUDE_PER_RANK = 0.1;
const MAGNITUDE_PER_INTELLECT = 0.04;

/**
 * A spell, as authored or as handed over.
 *
 * @spec MAGIC-SPELL-001
 */
export function createSpell({
  id, name, school, rank = 1, classes = [], target, effect = {}, where = [], learned = Learned.CLASS,
}) {
  return {
    id, name, school, rank, classes: [...classes], target, effect: { ...effect }, where: [...where], learned,
  };
}

const asList = (spells) => (Array.isArray(spells) ? spells : Object.values(spells ?? {}));

/**
 * A class spell comes with practice; a tome spell only once its tome has been read.
 *
 * @spec MAGIC-KNOW-001
 * @spec MAGIC-KNOW-002
 */
export function knows(c, spell) {
  if (!c || !spell) return false;
  if (spell.learned === Learned.TOME) return (c.learnedSpells ?? []).includes(spell.id);
  return spell.classes.includes(c.characterClass) && skillRank(c, spell.school) >= spell.rank;
}

/** Every spell in the catalogue this character knows, in the catalogue's order. */
export function knownSpells(c, spells) {
  return asList(spells).filter((spell) => knows(c, spell));
}

/** What a caster holds at a rank they know a spell of: Intellect is what buys slots. */
function slotsForCaster(c) {
  const intellect = c.attributes?.[Attribute.INTELLECT] ?? 10;
  return BASE_SLOTS + Math.max(0, Math.floor((intellect - 10) / INTELLECT_PER_SLOT));
}

/**
 * How many slots a character holds at a rank: some if they know a spell of that rank,
 * none otherwise. Only rank 1 has a rule yet.
 *
 * @spec MAGIC-SLOT-001
 */
export function slotsAt(c, rank, spells) {
  if (rank !== 1) return 0;
  return knownSpells(c, spells).some((spell) => spell.rank === rank) ? slotsForCaster(c) : 0;
}

/** How many of a rank's slots are still unspent. */
export function slotsLeft(c, rank, spells) {
  return Math.max(0, slotsAt(c, rank, spells) - (c.spentSlots?.[rank] ?? 0));
}

/** @spec MAGIC-SLOT-002 */
export function spendSlot(c, rank) {
  c.spentSlots = { ...(c.spentSlots ?? {}), [rank]: (c.spentSlots?.[rank] ?? 0) + 1 };
}

/**
 * Every spent slot back. Camp is the only thing that asks.
 *
 * @spec MAGIC-SLOT-004
 * @spec MAGIC-SLOT-005
 */
export function restoreSlots(c) {
  c.spentSlots = {};
}

/**
 * A spell's base grown by practice in its school and by the caster's wit, as a weapon
 * grows by its skill and its attribute. Fixed, so what is shown is what happens.
 *
 * @spec MAGIC-CAST-001
 */
export function spellMagnitude(caster, spell) {
  const base = spell.effect[SpellEffect.DAMAGE] ?? spell.effect[SpellEffect.HEAL] ?? 0;
  const intellect = caster.attributes?.[Attribute.INTELLECT] ?? 10;
  const grown = base
    * (1 + MAGNITUDE_PER_RANK * skillRank(caster, spell.school))
    * (1 + MAGNITUDE_PER_INTELLECT * (intellect - 10))
    // Hunger weakens a spell; an arcane meal strengthens it.
    // @spec MAGIC-CAST-010
    * spellFactor(caster);
  return Math.max(1, Math.round(grown));
}

export const CastRefusal = {
  NOT_KNOWN: 'NOT_KNOWN',
  NOT_HERE: 'NOT_HERE',
  NO_SLOTS: 'NO_SLOTS',
  UNCONSCIOUS: 'UNCONSCIOUS',
  UNHURT: 'UNHURT',
  NO_TARGET: 'NO_TARGET',
};

/**
 * Why a cast cannot happen, or nothing when it can. Asked before anything is spent, so a
 * refused cast costs nothing, and so a screen can grey a spell or a target with a reason.
 * An enemy target is the fight's to judge; an ally is judged here.
 *
 * @spec MAGIC-SLOT-003
 * @spec MAGIC-CAST-004
 * @spec MAGIC-CAST-006
 */
export function castRefusal(party, casterId, spell, { where, targetId = null } = {}) {
  const caster = character(party, casterId);
  if (!caster || caster.condition !== Condition.OK || !knows(caster, spell)) return CastRefusal.NOT_KNOWN;
  if (!spell.where.includes(where)) return CastRefusal.NOT_HERE;
  if (slotsLeft(caster, spell.rank, [spell]) <= 0) return CastRefusal.NO_SLOTS;
  if (spell.target === SpellTarget.ALLY && targetId !== null) {
    const target = character(party, targetId);
    if (!target) return CastRefusal.NO_TARGET;
    if (target.condition !== Condition.OK) return CastRefusal.UNCONSCIOUS;
    if (spell.effect[SpellEffect.HEAL] && target.hitPoints >= target.maxHitPoints) return CastRefusal.UNHURT;
  }
  return null;
}

/**
 * What a heal would restore to an ally: its magnitude, but never past their maximum.
 * Nothing is spent and nothing changes.
 *
 * @spec MAGIC-CAST-005
 */
export function healPreview(party, casterId, spell, targetId) {
  const caster = character(party, casterId);
  const target = character(party, targetId);
  if (!caster || !target) return 0;
  return Math.max(0, Math.min(spellMagnitude(caster, spell), target.maxHitPoints - target.hitPoints));
}

/**
 * Cast a spell on one of the caster's own side: spend the slot, apply the effect through
 * the party, and out of a fight count it as the school practised. A refused cast changes
 * nothing and answers null.
 *
 * @spec MAGIC-SLOT-002
 * @spec MAGIC-CAST-003
 * @spec MAGIC-CAST-007
 */
export function castOnAlly(party, casterId, spell, targetId, { where } = {}) {
  if (castRefusal(party, casterId, spell, { where, targetId })) return null;
  const healed = healPreview(party, casterId, spell, targetId);
  spendSlot(character(party, casterId), spell.rank);
  applyHealing(party, targetId, healed);
  // In a fight the school is recorded as a skill used, and advances when the fight ends.
  if (where === CastWhere.EXPLORATION) trainSkill(party, casterId, spell.school);
  return { healed };
}

/** Spend a caster's slot for a spell aimed at an enemy; the fight applies the damage. */
export function payForCast(party, casterId, spell) {
  spendSlot(character(party, casterId), spell.rank);
}

export const ReadRefusal = {
  NOT_A_TOME: 'NOT_A_TOME',
  NOT_IN_PACK: 'NOT_IN_PACK',
  IN_A_FIGHT: 'IN_A_FIGHT',
  NOT_CONSCIOUS: 'NOT_CONSCIOUS',
  WRONG_CLASS: 'WRONG_CLASS',
  RANK_TOO_LOW: 'RANK_TOO_LOW',
  ALREADY_KNOWN: 'ALREADY_KNOWN',
};

/** The spell a tome teaches, if the item is a tome and the spell exists. */
export function tomeSpell(item, spells) {
  const id = item?.effect?.[Effect.TEACH];
  if (!id) return null;
  return asList(spells).find((spell) => spell.id === id) ?? null;
}

/**
 * Why a character cannot read a tome, or nothing when they can. A tome is only worth
 * reading by somebody who could then cast its spell.
 *
 * @spec MAGIC-KNOW-004
 * @spec MAGIC-KNOW-005
 */
export function readRefusal(party, id, item, spells, { inFight = false } = {}) {
  const c = character(party, id);
  const spell = tomeSpell(item, spells);
  if (!spell) return ReadRefusal.NOT_A_TOME;
  if (!c || !packOf(party).includes(item)) return ReadRefusal.NOT_IN_PACK;
  if (inFight) return ReadRefusal.IN_A_FIGHT;
  if (c.condition !== Condition.OK) return ReadRefusal.NOT_CONSCIOUS;
  if (!spell.classes.includes(c.characterClass)) return ReadRefusal.WRONG_CLASS;
  if (skillRank(c, spell.school) < spell.rank) return ReadRefusal.RANK_TOO_LOW;
  if ((c.learnedSpells ?? []).includes(spell.id)) return ReadRefusal.ALREADY_KNOWN;
  return null;
}

/**
 * Read a tome: its spell is learned for good, and the tome is used up.
 *
 * @spec MAGIC-KNOW-003
 */
export function readTome(party, id, item, spells) {
  if (readRefusal(party, id, item, spells)) return false;
  const c = character(party, id);
  const pack = packOf(party);
  pack.splice(pack.indexOf(item), 1);
  c.learnedSpells = [...(c.learnedSpells ?? []), tomeSpell(item, spells).id];
  return true;
}
