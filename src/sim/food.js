/**
 * Food's effects on a character: how hungry they are, what that costs them, and what the
 * buffs of their last meal do.
 *
 * Pure reads of a character's fullness and buffs, importing nothing, so the modules that
 * work out damage, armour, spell magnitude and speed can all ask it without a cycle.
 * Hunger passing, the pot and foraging, which change things, live in `meals.js`.
 */

/** How many ticks of food a character can hold. */
export const FULLNESS_MAX = 2000;

export const Trait = {
  HEARTY: 'hearty', TOUGH: 'tough', NIMBLE: 'nimble', ARCANE: 'arcane', HALE: 'hale', WARMING: 'warming',
};

/** The order traits are ranked in when their points tie. */
export const TRAIT_ORDER = [Trait.HEARTY, Trait.TOUGH, Trait.NIMBLE, Trait.ARCANE, Trait.HALE, Trait.WARMING];

export const HungerStage = {
  FED: 'FED',
  HUNGRY: 'HUNGRY',
  VERY_HUNGRY: 'VERY_HUNGRY',
  FAMISHED: 'FAMISHED',
  RAVENOUS: 'RAVENOUS',
  STARVING: 'STARVING',
};

/** Each stage, from best to worst, the fullness it starts at, and what it costs. */
const STAGES = [
  { stage: HungerStage.FED, from: 1000, penalty: 0 },
  { stage: HungerStage.HUNGRY, from: 750, penalty: 0.05 },
  { stage: HungerStage.VERY_HUNGRY, from: 500, penalty: 0.1 },
  { stage: HungerStage.FAMISHED, from: 250, penalty: 0.15 },
  { stage: HungerStage.RAVENOUS, from: 1, penalty: 0.2 },
  { stage: HungerStage.STARVING, from: -Infinity, penalty: 0.25 },
];

const stageFor = (c) => {
  const fullness = c?.fullness ?? FULLNESS_MAX;
  return STAGES.find((s) => fullness >= s.from);
};

/**
 * @spec FOOD-HUNGER-003
 */
export function hungerStage(c) {
  return stageFor(c).stage;
}

/** How far a stage is down the list, so a step down can be told from a step up. */
export function stageDepth(stage) {
  return STAGES.findIndex((s) => s.stage === stage);
}

/**
 * The share hunger takes off damage and spell magnitude.
 *
 * @spec FOOD-HUNGER-004
 */
export function hungerPenalty(c) {
  return stageFor(c).penalty;
}

/** The points of one trait a character's meal left them, or none. */
export function buffPoints(c, trait) {
  return (c?.buffs ?? []).filter((b) => b.trait === trait).reduce((sum, b) => sum + b.points, 0);
}

/**
 * What a weapon blow is multiplied by: less for hunger, more for a hearty meal.
 *
 * @spec FOOD-HUNGER-004
 * @spec FOOD-BUFF-001
 */
export function damageFactor(c) {
  return (1 - hungerPenalty(c)) * (1 + 0.02 * buffPoints(c, Trait.HEARTY));
}

/**
 * What a spell's magnitude is multiplied by: less for hunger, more for an arcane meal.
 *
 * @spec FOOD-HUNGER-004
 * @spec FOOD-BUFF-004
 */
export function spellFactor(c) {
  return (1 - hungerPenalty(c)) * (1 + 0.03 * buffPoints(c, Trait.ARCANE));
}

/** @spec FOOD-BUFF-002 */
export function armourBonus(c) {
  return Math.floor(buffPoints(c, Trait.TOUGH) / 2);
}

/** @spec FOOD-BUFF-003 */
export function dexterityBonus(c) {
  return Math.floor(buffPoints(c, Trait.NIMBLE) / 2);
}

/** @spec FOOD-BUFF-006 */
export function haleBonus(points) {
  return Math.round(2 * points);
}

/**
 * The share of each tick's hunger a warming meal spares, never more than half.
 *
 * @spec FOOD-BUFF-007
 */
export function warmingSlowing(c) {
  return Math.min(0.5, 0.05 * buffPoints(c, Trait.WARMING));
}
