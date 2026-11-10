import { Effect, fitsSlot, isConsumable, wieldableBy } from './items.js';
import { FULLNESS_MAX } from './food.js';
/**
 * The party: characters, what they can do, and what has happened to them.
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
  RESOLVE: 'RESOLVE',
};

/** @spec PARTY-SKILL-015 */
export const Skill = {
  IRONCLAD: 'IRONCLAD', BACKSTAB: 'BACKSTAB', OVERCHANNEL: 'OVERCHANNEL', INTERCESSION: 'INTERCESSION',
  BLADE: 'BLADE', BLUNT: 'BLUNT', POLEARM: 'POLEARM', BOW: 'BOW',
  EVOCATION: 'EVOCATION', ALTERATION: 'ALTERATION',
  HEALING: 'HEALING', RESTORATION: 'RESTORATION',
  DETECTION: 'DETECTION', DISARM: 'DISARM', LOCKS: 'LOCKS',
  CARTOGRAPHY: 'CARTOGRAPHY', COOKING: 'COOKING', FORAGING: 'FORAGING',
};

export const CharacterClass = {
  FIGHTER: 'FIGHTER', MAGE: 'MAGE', CLERIC: 'CLERIC', THIEF: 'THIEF',
};

/**
 * How skills are grouped when they are shown. Presentation only: nothing that decides
 * anything reads the grouping.
 *
 * @spec PARTY-SKILL-013
 */
export const SkillGroup = {
  CLASS: 'CLASS', WEAPON: 'WEAPON', ARCANE: 'ARCANE',
  DIVINE: 'DIVINE', STEALTH: 'STEALTH', SURVIVAL: 'SURVIVAL',
};

/**
 * The skills that each belong to one class and no other. Only a class's own file can
 * name one, and nobody of another class can ever hold it.
 *
 * @spec PARTY-CSKILL-001
 */
export const CLASS_SKILLS = [Skill.IRONCLAD, Skill.BACKSTAB, Skill.OVERCHANNEL, Skill.INTERCESSION];

export const SKILL_GROUPS = [
  { group: SkillGroup.CLASS, skills: CLASS_SKILLS },
  { group: SkillGroup.WEAPON, skills: [Skill.BLADE, Skill.BLUNT, Skill.POLEARM, Skill.BOW] },
  { group: SkillGroup.ARCANE, skills: [Skill.EVOCATION, Skill.ALTERATION] },
  { group: SkillGroup.DIVINE, skills: [Skill.HEALING, Skill.RESTORATION] },
  { group: SkillGroup.STEALTH, skills: [Skill.DETECTION, Skill.DISARM, Skill.LOCKS] },
  { group: SkillGroup.SURVIVAL, skills: [Skill.CARTOGRAPHY, Skill.COOKING, Skill.FORAGING] },
];

/** Skills every class carries, so nobody is useless at anything basic. */
export const BASE_SKILLS = [Skill.CARTOGRAPHY, Skill.COOKING, Skill.FORAGING];

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

export const MAX_PARTY = 4;

/**
 * Past this many distinct skills the pot stops growing, so a party cannot inflate it
 * by dragging a fight out until everyone has touched everything.
 */
export const POT_SKILL_CEILING = 4;

/**
 * What leaving a rank costs, and how high a rank goes.
 *
 * Leaving rank r costs three hundred times r, so each rank is dearer than the one
 * before it. A linear cost per rank decays farming gently rather than sharply: floor
 * one stays worth something at rank 2 and is plainly not worth it at rank 9, without
 * the last ranks becoming a grind measured in hundreds of fights.
 *
 * @spec PARTY-SKILL-006
 * @spec PARTY-SKILL-007
 */
export const RANK_STEP = 300;
export const RANK_CAP = 10;

/**
 * The experience a skill must hold to stand at a rank, counted from rank zero.
 *
 * Counting from zero means a rank a class granted free costs its holder no less to
 * leave than one they earned: the grant moves the rank, never the ledger. A Fighter
 * opening at Blade 2 and a Mage climbing to Blade 2 have both spent the same by the
 * time either reaches 3.
 *
 * @spec PARTY-SKILL-007
 * @spec PARTY-SKILL-011
 */
export function experienceForRank(rank) {
  return (RANK_STEP * rank * (rank - 1)) / 2;
}

/**
 * The rank a given total of experience has bought, never past the cap.
 *
 * @spec PARTY-SKILL-006
 * @spec PARTY-SKILL-011
 */
function rankFromExperience(experience) {
  let rank = 0;
  while (rank < RANK_CAP && experienceForRank(rank + 1) <= experience) rank += 1;
  return rank;
}

/**
 * The classes, as their own files define them, by identifier. The simulation holds no
 * class's numbers or lists: whoever reads the files hands them in once, before any
 * character is made, and every rule that depends on a class asks here.
 *
 * @spec PARTY-CLASS-005
 */
let classCatalogue = {};

export function useClasses(definitions) {
  classCatalogue = { ...definitions };
}

/** A class's definition, by identifier or from the character who holds it. */
export function classOf(characterClassOrCharacter) {
  const id = typeof characterClassOrCharacter === 'string'
    ? characterClassOrCharacter
    : characterClassOrCharacter?.characterClass;
  return classCatalogue[id] ?? null;
}

/** The classes whose files pass a test, in the game's own order of classes. */
const classesWhere = (test) => Object.values(CharacterClass).filter((id) => classCatalogue[id] && test(classCatalogue[id]));

/** Every class whose file names the item's category among those it wields. */
export function classesWielding(category) {
  return classesWhere((k) => k.wields.includes(category));
}

/** Every class whose file names this school among those it casts. */
export function classesCasting(school) {
  return classesWhere((k) => k.schools.includes(school));
}

/**
 * The attribute a character's magic draws on, or nothing for a class that casts nothing
 * and for anything without a class.
 *
 * @spec PARTY-CHAR-013
 */
export function castingAttribute(c) {
  return classOf(c)?.castsWith ?? null;
}

/**
 * A character's hit points: their class's base, moved a twentieth per point of
 * Constitution away from ten.
 *
 * Multiplicative rather than flat so the classes stay distinct at every score — a
 * tough fighter gains more absolute hit points than a tough mage, and the gap between
 * them holds instead of closing as Constitution rises. Nothing in play moves this:
 * there are no levels to grow it with, and tying it to a skill rank would mean
 * practising a weapon made a body harder to kill.
 *
 * @spec PARTY-CHAR-006
 */
export function hitPointsFor(characterClass, constitution) {
  const base = classOf(characterClass)?.hitPoints;
  if (base === undefined) return null;
  return Math.round(base * (1 + 0.05 * (constitution - 10)));
}

/** Whether a character may ever hold a skill: anything but another class's own. */
function mayHold(c, skill) {
  return !CLASS_SKILLS.includes(skill) || classOf(c)?.classSkill === skill;
}

export const DEFAULT_ATTRIBUTES = {
  [Attribute.MIGHT]: 10, [Attribute.CONSTITUTION]: 10, [Attribute.DEXTERITY]: 10,
  [Attribute.INTELLECT]: 10, [Attribute.RESOLVE]: 10,
};

/**
 * @spec PARTY-CHAR-001
 * @spec PARTY-CHAR-004
 * @spec PARTY-SKILL-002
 * @spec PARTY-CLASS-001
 */
export function createCharacter({
  id, name, characterClass, attributes: given = {}, ranks: authored = {},
  attack = null, armour = 0, portrait = null,
}) {
  const startingRanks = classOf(characterClass)?.startingRanks ?? {};
  const ranks = {};
  // Every class shares a floor of competence, then its own specialities on top, its
  // class skill among them.
  for (const skill of BASE_SKILLS) ranks[skill] = 1;
  for (const [skill, rank] of Object.entries(startingRanks)) {
    ranks[skill] = Math.max(ranks[skill] ?? 0, rank);
  }
  // An authored character may say what it is better at than its class alone makes it,
  // but no authored number reaches past the ceiling either, and nobody is handed
  // another class's own skill.
  // @spec PARTY-SKILL-006
  // @spec PARTY-CSKILL-001
  const self = { characterClass };
  for (const [skill, rank] of Object.entries(authored)) if (mayHold(self, skill)) ranks[skill] = rank;
  for (const skill of Object.keys(ranks)) ranks[skill] = Math.min(RANK_CAP, ranks[skill]);

  // Derived, never handed in: hit points are what the class and the Constitution make
  // them, so no file can quietly award a mage a fighter's body.
  // @spec PARTY-CHAR-006
  const attributes = { ...DEFAULT_ATTRIBUTES, ...given };
  const maxHitPoints = hitPointsFor(characterClass, attributes[Attribute.CONSTITUTION]);

  return {
    id,
    name,
    characterClass,
    attributes,
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
    // Spells learned from tomes, and slots spent since the last camp, by rank.
    // @spec MAGIC-KNOW-006
    // @spec MAGIC-SLOT-006
    learnedSpells: [],
    spentSlots: {},
    // Intercession charges spent since the last camp.
    // @spec PARTY-CSKILL-011
    spentCharges: 0,
    // How many ticks of food are in them, the buffs their last meal left, and the hit
    // points a hale buff lent. Starts full: nobody sets off hungry.
    // @spec FOOD-HUNGER-001
    // @spec PARTY-SAVE-005
    fullness: FULLNESS_MAX,
    buffs: [],
    hale: 0,
  };
}

/**
 * @spec ITEM-PACK-001
 * @spec PARTY-OP-006
 */
export function createParty() {
  return { members: [], pack: [], purse: 0 };
}

/**
 * The gold the party carries, held for the party as a whole as the pack is. A party
 * from before the purse existed carries none.
 *
 * @spec PARTY-OP-006
 */
export function purseOf(party) {
  party.purse ??= 0;
  return party.purse;
}

/**
 * Add a find's gold. The purse only rises: nothing yet spends gold, and a find never
 * takes any away.
 *
 * @spec PARTY-OP-006
 */
export function addGold(party, amount) {
  if (!Number.isInteger(amount) || amount < 0) return false;
  party.purse = purseOf(party) + amount;
  return true;
}

/**
 * What the party carries and nobody is wearing, in the order it went in. A party built
 * before the pack existed simply carries nothing.
 *
 * @spec ITEM-PACK-001
 */
export function packOf(party) {
  party.pack ??= [];
  return party.pack;
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
 * Strike a character. A fall into unconsciousness is caught by the first awake cleric
 * with an Intercession charge left, who spends it to leave the fallen at one hit point;
 * nothing catches a blow on somebody already down.
 *
 * In a fight, Intercession is counted as used there and advances when the fight ends,
 * so the caller is told who interceded; out of one, it is trained here.
 *
 * @spec PARTY-COND-001
 * @spec PARTY-COND-002
 * @spec PARTY-COND-010
 * @spec PARTY-CSKILL-008
 * @spec PARTY-CSKILL-009
 * @spec PARTY-CSKILL-010
 */
export function applyDamage(party, id, amount, { inFight = false } = {}) {
  const c = character(party, id);
  if (!c) return false;

  // Struck while already down: the chain moves on rather than the number going lower.
  if (c.condition === Condition.UNCONSCIOUS) {
    c.condition = Condition.DEAD;
    return true;
  }
  if (c.condition !== Condition.OK) return false;

  if (c.hitPoints - amount <= 0) {
    const cleric = party.members.find((m) => m.condition === Condition.OK && chargesLeft(m) > 0);
    if (cleric) {
      cleric.spentCharges = (cleric.spentCharges ?? 0) + 1;
      c.hitPoints = 1;
      if (!inFight) trainSkill(party, cleric.id, Skill.INTERCESSION);
      return { intercededBy: cleric.id };
    }
  }

  c.hitPoints = Math.max(0, c.hitPoints - amount);
  if (c.hitPoints === 0) c.condition = Condition.UNCONSCIOUS;
  return true;
}

/**
 * Pay hit points as a price rather than take them as a blow: never down to nothing, so
 * no condition changes and nobody intercedes. A price that would fell the payer is
 * refused and nothing is paid.
 *
 * @spec PARTY-OP-009
 * @spec PARTY-OP-010
 */
export function payHitPoints(party, id, amount) {
  const c = character(party, id);
  if (!c || c.condition !== Condition.OK || amount >= c.hitPoints) return false;
  c.hitPoints -= amount;
  return true;
}

/**
 * Take hit points away without ever taking the last one, and without changing the
 * condition: the toll of starving, which weakens but never fells.
 *
 * @spec FOOD-HUNGER-005
 */
export function drainHitPoints(party, id, amount) {
  const c = character(party, id);
  if (!c || c.condition !== Condition.OK) return false;
  c.hitPoints = Math.max(Math.min(1, c.hitPoints), c.hitPoints - amount);
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
 * What each class skill is worth at a character's rank in it. A character without the
 * skill holds rank nothing, which is worth nothing: a factor of one, no cost, no charge.
 */
const rankIn = (c, skill) => c?.ranks?.[skill] ?? 0;

/** @spec PARTY-CSKILL-003 */
export function ironcladArmourFactor(c) {
  return 1 + 0.05 * rankIn(c, Skill.IRONCLAD);
}

/** @spec PARTY-CSKILL-004 */
export function targetWeight(c) {
  return 1 + 0.2 * rankIn(c, Skill.IRONCLAD);
}

/** @spec PARTY-CSKILL-005 */
export function backstabMultiplier(c) {
  const rank = rankIn(c, Skill.BACKSTAB);
  return rank > 0 ? 1.9 + 0.1 * rank : 1;
}

/** @spec PARTY-CSKILL-006 */
export function overchannelCostPerRank(c) {
  const rank = rankIn(c, Skill.OVERCHANNEL);
  return rank > 0 ? 7 - Math.ceil(rank / 2) : null;
}

/** @spec PARTY-CSKILL-007 */
export function intercessionCharges(c) {
  const rank = rankIn(c, Skill.INTERCESSION);
  return rank > 0 ? 1 + Math.floor(rank / 4) : 0;
}

/** How many Intercession charges a cleric has not yet spent since camp. */
export function chargesLeft(c) {
  return Math.max(0, intercessionCharges(c) - (c?.spentCharges ?? 0));
}

/**
 * Every spent charge back. Camp is the only thing that asks.
 *
 * @spec PARTY-CSKILL-011
 */
export function restoreCharges(c) {
  c.spentCharges = 0;
}

/**
 * How far a skill is toward its next rank: the share of that rank's cost the banked
 * experience has covered. Reported here, beside the cost, so nothing that shows it
 * needs the formula. A rank granted free counts as no progress until earned experience
 * catches up with it, because that is how far its holder really is from the next one.
 *
 * @spec PARTY-SKILL-012
 */
export function skillProgress(c, skill) {
  const rank = skillRank(c, skill);
  if (rank >= RANK_CAP) return 1;
  const from = experienceForRank(rank);
  const span = experienceForRank(rank + 1) - from;
  if (span <= 0) return 0;
  const banked = c.skillExperience[skill] ?? 0;
  return Math.min(1, Math.max(0, (banked - from) / span));
}

/**
 * One rate for everyone: a skill used is a skill practised, whatever the class. The
 * only skill a character can never practise is another class's own.
 *
 * @spec PARTY-SKILL-014
 * @spec PARTY-SKILL-005
 * @spec PARTY-SKILL-001
 * @spec PARTY-CSKILL-001
 * @spec PARTY-CSKILL-002
 */
function advance(c, skill, amount) {
  if (!mayHold(c, skill)) return;

  // Experience keeps accruing past the cap; it simply stops buying anything, so that
  // nothing has to decide when to stop recording what a character did.
  // @spec PARTY-SKILL-006
  c.skillExperience[skill] = (c.skillExperience[skill] ?? 0) + amount;
  const earned = rankFromExperience(c.skillExperience[skill]);
  c.ranks[skill] = Math.min(RANK_CAP, Math.max(c.ranks[skill] ?? 0, earned));
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
 * ticks cost food, so there is nothing free here either.
 *
 * @spec PARTY-XP-007
 */
export function trainSkill(party, id, skill, amount = RANK_STEP / 10) {
  const c = character(party, id);
  if (!c) return false;
  advance(c, skill, amount);
  return true;
}

/**
 * Put something from the pack into a character's slot. Whatever held that slot goes into
 * the pack in the same change, so an item is always somewhere and a swap is one decision.
 *
 * The party owns what sits where; the item owns whether it may. A refused equip changes
 * nothing at all, so the player is told no before anything moves rather than
 * discovering a mage in plate by its consequences. Condition is not asked: a body that
 * cannot fight still carries a sword someone else can use.
 *
 * @spec PARTY-OP-003
 * @spec PARTY-OP-005
 * @spec PARTY-CHAR-003
 * @spec ITEM-PACK-002
 * @spec ITEM-PACK-004
 * @spec ITEM-PACK-005
 */
export function equip(party, id, item, slot = item?.slot) {
  const c = character(party, id);
  if (!c || !item || !slot) return false;

  const pack = packOf(party);
  const at = pack.indexOf(item);
  if (at < 0) return false;
  if (!fitsSlot(item, slot)) return false;
  if (!wieldableBy(item, c.characterClass)) return false;

  pack.splice(at, 1);
  const displaced = c.equipment[slot];
  if (displaced) pack.push(displaced);
  c.equipment[slot] = item;
  return true;
}

/**
 * Take what is in a slot off, into the pack.
 *
 * @spec PARTY-OP-005
 * @spec PARTY-CHAR-003
 * @spec ITEM-PACK-003
 * @spec ITEM-PACK-005
 */
export function takeOff(party, id, slot) {
  const c = character(party, id);
  const item = c?.equipment[slot];
  if (!item) return false;

  delete c.equipment[slot];
  packOf(party).push(item);
  return true;
}

/**
 * Put an item into the pack. How loot will reach the party, and how a test hands it
 * something to equip.
 *
 * @spec PARTY-OP-005
 * @spec ITEM-PACK-007
 */
export function stow(party, item) {
  if (!item) return false;
  packOf(party).push(item);
  return true;
}

/**
 * Why a character cannot use an item, or nothing when they can.
 *
 * A potion is drunk, so whoever uses it must be awake to drink it, and must have
 * something for it to heal. Saying why is what lets the screen grey it with a reason.
 */
export const UseRefusal = {
  NOT_IN_PACK: 'NOT_IN_PACK',
  NOT_CONSUMABLE: 'NOT_CONSUMABLE',
  // A tome is read, not drunk: the magic segment says who may read it.
  A_TOME: 'A_TOME',
  FULL_HEALTH: 'FULL_HEALTH',
  UNCONSCIOUS: Condition.UNCONSCIOUS,
  DEAD: Condition.DEAD,
  ASHES: Condition.ASHES,
  LOST: Condition.LOST,
};

/**
 * @spec PARTY-OP-005
 * @spec PARTY-OP-008
 */
export function useRefusal(party, id, item) {
  const c = character(party, id);
  if (!c || !item || !packOf(party).includes(item)) return UseRefusal.NOT_IN_PACK;
  if (!isConsumable(item)) return UseRefusal.NOT_CONSUMABLE;
  if (item.effect?.[Effect.TEACH]) return UseRefusal.A_TOME;
  if (c.condition !== Condition.OK) return UseRefusal[c.condition] ?? c.condition;
  if (c.hitPoints >= c.maxHitPoints) return UseRefusal.FULL_HEALTH;
  return null;
}

/**
 * Drink a potion from the pack. It heals the one who drinks it and nobody else, and a
 * refused use moves nothing.
 *
 * @spec PARTY-OP-005
 * @spec PARTY-OP-007
 * @spec PARTY-OP-008
 * @spec ITEM-USE-001
 */
export function useItem(party, id, item) {
  if (useRefusal(party, id, item)) return false;

  const pack = packOf(party);
  pack.splice(pack.indexOf(item), 1);
  applyHealing(party, id, item.effect?.[Effect.HEAL] ?? 0);
  return true;
}

/**
 * @spec PARTY-SAVE-001
 * @spec PARTY-SAVE-003
 * @spec PARTY-SAVE-004
 * @spec PARTY-SAVE-006
 */
export function serializeParty(party) {
  return {
    purse: purseOf(party),
    members: party.members.map((c) => ({
      ...c, attributes: { ...c.attributes }, ranks: { ...c.ranks }, skillExperience: { ...c.skillExperience },
      equipment: { ...c.equipment },
      learnedSpells: [...(c.learnedSpells ?? [])], spentSlots: { ...(c.spentSlots ?? {}) },
      buffs: (c.buffs ?? []).map((b) => ({ ...b })),
    })),
    pack: packOf(party).map((item) => ({ ...item })),
  };
}

/**
 * @spec PARTY-SAVE-002
 * @spec PARTY-SAVE-003
 */
export function restoreParty(saved) {
  const known = new Set(Object.values(Skill));
  // A skill retired since the save was written leaves nothing behind.
  // @spec PARTY-SAVE-007
  const kept = (table) => Object.fromEntries(Object.entries(table ?? {}).filter(([skill]) => known.has(skill)));
  return {
    members: saved.members.map(({ trainable, ...c }) => ({
      ...c, ranks: kept(c.ranks), skillExperience: kept(c.skillExperience), spentCharges: c.spentCharges ?? 0,
      learnedSpells: [...(c.learnedSpells ?? [])], spentSlots: { ...(c.spentSlots ?? {}) },
      fullness: c.fullness ?? FULLNESS_MAX, buffs: (c.buffs ?? []).map((b) => ({ ...b })), hale: c.hale ?? 0,
    })),
    pack: (saved.pack ?? []).map((item) => ({ ...item })),
    purse: saved.purse ?? 0,
  };
}
