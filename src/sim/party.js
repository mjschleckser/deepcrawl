/**
 * The party: characters, where they stand, what they can do, and what has happened to
 * them.
 *
 * Both combat and exploration change character state, so neither writes it. Every
 * change comes through an operation here, which is what keeps the floor at zero, the
 * condition chain, and the roster limits enforced in exactly one place.
 */


export const Condition = {
  OK: 'OK',
  UNCONSCIOUS: 'UNCONSCIOUS',
  DEAD: 'DEAD',
  ASHES: 'ASHES',
  LOST: 'LOST',
};

export const Attribute = {
  MIGHT: 'MIGHT',
  CONSTITUTION: 'CONSTITUTION',
  DEXTERITY: 'DEXTERITY',
  INTELLECT: 'INTELLECT',
  PERCEPTION: 'PERCEPTION',
  RESOLVE: 'RESOLVE',
};

export const Skill = {
  BLADE: 'BLADE', BLUNT: 'BLUNT', POLEARM: 'POLEARM', BOW: 'BOW',
  HEAVY_ARMOUR: 'HEAVY_ARMOUR', LIGHT_ARMOUR: 'LIGHT_ARMOUR', SHIELD: 'SHIELD',
  EVOCATION: 'EVOCATION', ALTERATION: 'ALTERATION',
  HEALING: 'HEALING', RESTORATION: 'RESTORATION',
  DETECTION: 'DETECTION', DISARM: 'DISARM', LOCKS: 'LOCKS',
  CARTOGRAPHY: 'CARTOGRAPHY', COOKING: 'COOKING', FORAGING: 'FORAGING',
};

export const CharacterClass = {
  FIGHTER: 'FIGHTER', MAGE: 'MAGE', CLERIC: 'CLERIC', THIEF: 'THIEF',
};

/** Skills every class carries, so nobody is useless at anything basic. */
export const BASE_SKILLS = [Skill.LIGHT_ARMOUR, Skill.CARTOGRAPHY, Skill.COOKING, Skill.FORAGING];

/**
 * Ticks to cross one tile. Bounded at both ends so no party is ever twice the speed of
 * another, and derived from average Dexterity so speed is something the player chose
 * when they assembled the party rather than a number in a fight.
 *
 * @spec EXPLORE-CLOCK-010
 * @spec EXPLORE-CLOCK-011
 */
export const MIN_STEP_COST = 5;
export const MAX_STEP_COST = 10;

export function partyStepCost(party) {
  const able = party.members.filter((c) => c.condition === Condition.OK);
  if (able.length === 0) return MAX_STEP_COST;

  const average = able.reduce((sum, c) => sum + c.attributes[Attribute.DEXTERITY], 0) / able.length;
  const span = MAX_STEP_COST - MIN_STEP_COST;
  const scaled = MAX_STEP_COST - Math.round(((average - 6) / 12) * span);
  return Math.min(MAX_STEP_COST, Math.max(MIN_STEP_COST, scaled));
}

export const MAX_PARTY = 5;

/**
 * Past this many distinct skills the pot stops growing, so a party cannot inflate it
 * by dragging a fight out until everyone has touched everything.
 */
export const POT_SKILL_CEILING = 4;

/** Experience for one rank. Content data in waiting; the curve is not designed yet. */
const RANK_COST = 240;

/** Rates are multipliers; a skill absent from a class's table cannot be trained. */
const CLASS_TABLE = {
  [CharacterClass.FIGHTER]: {
    start: { [Skill.BLADE]: 2, [Skill.BLUNT]: 1, [Skill.POLEARM]: 1, [Skill.HEAVY_ARMOUR]: 2, [Skill.SHIELD]: 1 },
    rates: {
      [Skill.BLADE]: 2, [Skill.BLUNT]: 2, [Skill.POLEARM]: 2, [Skill.BOW]: 1,
      [Skill.HEAVY_ARMOUR]: 2, [Skill.SHIELD]: 2, [Skill.LIGHT_ARMOUR]: 1,
      [Skill.DETECTION]: 1, [Skill.CARTOGRAPHY]: 1, [Skill.COOKING]: 1, [Skill.FORAGING]: 1,
    },
  },
  [CharacterClass.MAGE]: {
    start: { [Skill.EVOCATION]: 2, [Skill.ALTERATION]: 2, [Skill.BLADE]: 1 },
    rates: {
      [Skill.EVOCATION]: 2, [Skill.ALTERATION]: 2, [Skill.BLADE]: 1, [Skill.BLUNT]: 1,
      [Skill.LIGHT_ARMOUR]: 1, [Skill.DETECTION]: 1,
      [Skill.CARTOGRAPHY]: 2, [Skill.COOKING]: 1, [Skill.FORAGING]: 1,
    },
  },
  [CharacterClass.CLERIC]: {
    start: { [Skill.HEALING]: 2, [Skill.RESTORATION]: 1, [Skill.BLUNT]: 1 },
    rates: {
      [Skill.HEALING]: 2, [Skill.RESTORATION]: 2, [Skill.BLUNT]: 2, [Skill.POLEARM]: 1,
      [Skill.HEAVY_ARMOUR]: 1, [Skill.LIGHT_ARMOUR]: 1, [Skill.SHIELD]: 1,
      [Skill.CARTOGRAPHY]: 1, [Skill.COOKING]: 1, [Skill.FORAGING]: 1,
    },
  },
  [CharacterClass.THIEF]: {
    start: { [Skill.DETECTION]: 2, [Skill.DISARM]: 2, [Skill.LOCKS]: 2, [Skill.BLADE]: 1 },
    rates: {
      [Skill.DETECTION]: 2, [Skill.DISARM]: 2, [Skill.LOCKS]: 2, [Skill.BLADE]: 2,
      [Skill.BOW]: 1, [Skill.LIGHT_ARMOUR]: 2,
      [Skill.CARTOGRAPHY]: 2, [Skill.COOKING]: 1, [Skill.FORAGING]: 1,
    },
  },
};

export const DEFAULT_ATTRIBUTES = {
  [Attribute.MIGHT]: 10, [Attribute.CONSTITUTION]: 10, [Attribute.DEXTERITY]: 10,
  [Attribute.INTELLECT]: 10, [Attribute.PERCEPTION]: 10, [Attribute.RESOLVE]: 10,
};

/**
 * @spec PARTY-CHAR-001
 * @spec PARTY-CHAR-004
 * @spec PARTY-SKILL-002
 * @spec PARTY-CLASS-001
 */
export function createCharacter({
  id, name, characterClass, attributes = {}, ranks: authored = {},
  maxHitPoints = 20, attack = null, armour = 0, portrait = null,
}) {
  const table = CLASS_TABLE[characterClass];
  const ranks = {};
  // Every class shares a floor of competence, then its own specialities on top.
  for (const skill of BASE_SKILLS) ranks[skill] = 1;
  for (const [skill, rank] of Object.entries(table.start)) {
    ranks[skill] = Math.max(ranks[skill] ?? 0, rank);
  }
  // An authored character may say what it is better at than its class alone makes it.
  for (const [skill, rank] of Object.entries(authored)) ranks[skill] = rank;

  return {
    id,
    name,
    characterClass,
    attributes: { ...DEFAULT_ATTRIBUTES, ...attributes },
    maxHitPoints,
    // What this one swings, until weapons carry it instead. Both sides of a fight
    // carry it in the same field, so nothing resolving an attack asks which side.
    // @spec COMBAT-ACTION-008
    attack: attack ? { ...attack } : null,
    armour,
    // The image this one is drawn with, or nothing, in which case they are drawn
    // without one.
    // @spec PRESENT-FIGHT-023
    portrait,
    hitPoints: maxHitPoints,
    condition: Condition.OK,
    ranks,
    skillExperience: {},
    equipment: {},
    trainable: Object.keys(table.rates),
  };
}

export function createParty() {
  return { members: [] };
}

export function roster(party) {
  return party.members;
}

export function character(party, id) {
  return party.members.find((c) => c.id === id) ?? null;
}

/**
 * Characters who can actually do something this round. The rest keep their place and
 * their place in the party; they simply do nothing in it.
 *
 * @spec PARTY-COND-009
 */
export function living(party) {
  return party.members.filter((c) => c.condition === Condition.OK);
}

/** A lost character keeps their record but frees the seat they held. */
function counts(c) {
  return c.condition !== Condition.LOST;
}

/**
 * @spec PARTY-ROSTER-001
 * @spec PARTY-ROSTER-006
 * @spec PARTY-ROSTER-003
 * @spec PARTY-ROSTER-005
 */
export function addCharacter(party, newcomer) {
  if (party.members.filter(counts).length >= MAX_PARTY) return false;
  party.members.push(newcomer);
  return true;
}

/**
 * How much of a combatant there is, in one number: the sum of the ranks they hold.
 *
 * Derived on every reading rather than stored, so it cannot drift from the ranks it
 * claims to summarise, and read the same way for anything holding ranks — a character,
 * a goblin — because both are the same kind of thing.
 *
 * @spec PARTY-CHAR-009
 * @spec PARTY-CHAR-010
 * @spec PARTY-CHAR-011
 */
export function totalLevel(combatant) {
  return Object.values(combatant?.ranks ?? {}).reduce((sum, rank) => sum + rank, 0);
}

/**
 * @spec PARTY-COND-001
 * @spec PARTY-COND-002
 * @spec PARTY-COND-010
 */
export function applyDamage(party, id, amount) {
  const c = character(party, id);
  if (!c) return false;

  // Struck while already down: the chain moves on rather than the number going lower.
  if (c.condition === Condition.UNCONSCIOUS) {
    c.condition = Condition.DEAD;
    return true;
  }
  if (c.condition !== Condition.OK) return false;

  c.hitPoints = Math.max(0, c.hitPoints - amount);
  if (c.hitPoints === 0) c.condition = Condition.UNCONSCIOUS;
  return true;
}

/**
 * @spec PARTY-COND-003
 * @spec PARTY-COND-004
 * @spec PARTY-COND-008
 */
export function applyHealing(party, id, amount) {
  const c = character(party, id);
  if (!c) return false;
  // Healing reaches the unconscious. It does not reach the dead; that is what
  // resurrection is for.
  if (c.condition !== Condition.OK && c.condition !== Condition.UNCONSCIOUS) return false;

  c.hitPoints = Math.min(c.maxHitPoints, c.hitPoints + amount);
  if (c.condition === Condition.UNCONSCIOUS && c.hitPoints > 0) c.condition = Condition.OK;
  return true;
}

/**
 * Bring someone back, or fail and lose a little more of them.
 *
 * The caller decides whether the attempt succeeded — a party cleric's Restoration, a
 * temple's fee, a wandering cleric, or a consumed scroll all arrive here the same way.
 *
 * @spec PARTY-COND-005
 * @spec PARTY-COND-006
 * @spec PARTY-COND-007
 * @spec PARTY-COND-011
 */
export function attemptRevival(party, id, { succeeds }) {
  const c = character(party, id);
  if (!c) return false;
  if (c.condition !== Condition.DEAD && c.condition !== Condition.ASHES) return false;

  if (succeeds) {
    c.condition = Condition.OK;
    c.hitPoints = 1;
    return true;
  }
  c.condition = c.condition === Condition.DEAD ? Condition.ASHES : Condition.LOST;
  return true;
}

export function skillRank(c, skill) {
  return c.ranks[skill] ?? 0;
}

/**
 * @spec PARTY-SKILL-003
 * @spec PARTY-SKILL-004
 * @spec PARTY-SKILL-005
 * @spec PARTY-SKILL-001
 */
function advance(c, skill, amount) {
  const rate = CLASS_TABLE[c.characterClass].rates[skill];
  // A class that cannot train a skill gains nothing in it; what was already earned
  // stays earned.
  if (!rate) return;

  c.skillExperience[skill] = (c.skillExperience[skill] ?? 0) + amount * rate;
  const earned = Math.floor(c.skillExperience[skill] / RANK_COST);
  c.ranks[skill] = Math.max(c.ranks[skill] ?? 0, earned);
}

/**
 * Award an encounter's skill experience.
 *
 * The pot belongs to the enemy, so twenty swings and one swing earn the same. It grows
 * with the number of distinct skills used — so using a whole kit is not a penalty —
 * but only up to a ceiling, which is what stops a party inflating it by prolonging a
 * fight until everyone has touched everything.
 *
 * @spec PARTY-XP-001
 * @spec PARTY-XP-002
 * @spec PARTY-XP-003
 * @spec PARTY-XP-004
 * @spec PARTY-XP-005
 * @spec PARTY-XP-006
 */
export function awardEncounter(party, id, { pot, skillsUsed }) {
  const c = character(party, id);
  if (!c) return null;

  // A miss is still use; only never trying teaches nothing.
  const distinct = [...new Set(skillsUsed)];
  if (distinct.length === 0) return null;

  const counted = Math.min(distinct.length, POT_SKILL_CEILING);
  const grown = pot * counted;
  const share = grown / distinct.length;

  for (const skill of distinct) advance(c, skill, share);
  // The pot is reported because the ceiling is a property of the pot, not of the
  // experience each character ends up with — class rates sit between the two.
  return { pot: grown, share, skills: distinct };
}

/**
 * A skill used outside combat. The clock has already charged for it in ticks, and
 * ticks cost food and light, so there is nothing free here either.
 *
 * @spec PARTY-XP-007
 */
export function trainSkill(party, id, skill, amount = RANK_COST / 8) {
  const c = character(party, id);
  if (!c) return false;
  advance(c, skill, amount);
  return true;
}

/**
 * A character is the sum of what they have done, so changing career does not unmake
 * it. Ranks in skills the new class cannot train simply stop advancing.
 *
 * @spec PARTY-CLASS-002
 * @spec PARTY-CLASS-003
 */
export function changeClass(party, id, characterClass, { meetsRequirements }) {
  const c = character(party, id);
  if (!c || !meetsRequirements) return false;

  c.characterClass = characterClass;
  c.trainable = Object.keys(CLASS_TABLE[characterClass].rates);
  return true;
}

/** @spec PARTY-SAVE-001 */
export function serializeParty(party) {
  return { members: party.members.map((c) => ({ ...c, attributes: { ...c.attributes }, ranks: { ...c.ranks }, skillExperience: { ...c.skillExperience }, equipment: { ...c.equipment }, trainable: [...c.trainable] })) };
}

/** @spec PARTY-SAVE-002 */
export function restoreParty(saved) {
  return { members: saved.members.map((c) => ({ ...c })) };
}
