/**
 * Hunger as time passes, the pot at camp, and foraging: everything about food that
 * changes a character, and so goes through the party's own operations.
 */

import {
  Condition, Skill, applyHealing, character, drainHitPoints, packOf, skillRank, stow, trainSkill,
} from './party.js';
import {
  FULLNESS_MAX, TRAIT_ORDER, Trait, haleBonus, hungerStage, stageDepth, warmingSlowing,
} from './food.js';

/** Ticks a starving character goes between each hit point lost. */
const STARVE_TICKS = 30;

const alive = (c) => c.condition === Condition.OK || c.condition === Condition.UNCONSCIOUS;
const awake = (c) => c.condition === Condition.OK;

/**
 * Run the party's hunger on by some ticks of the exploration clock, and say who grew
 * hungrier. A fight never calls this: its clock is stopped.
 *
 * @spec FOOD-HUNGER-001
 * @spec FOOD-HUNGER-002
 * @spec FOOD-HUNGER-005
 * @spec FOOD-HUNGER-006
 * @spec FOOD-BUFF-007
 */
export function passHunger(party, ticks) {
  const notices = [];
  for (const c of party.members) {
    if (!alive(c)) continue;
    const was = hungerStage(c);
    const rate = 1 - warmingSlowing(c);
    for (let t = 0; t < ticks; t++) {
      if (c.fullness > 0) {
        c.fullness = Math.max(0, c.fullness - rate);
        continue;
      }
      // Starving: a hit point at a time, never the last one.
      c.starveTicks = (c.starveTicks ?? 0) + 1;
      if (c.starveTicks >= STARVE_TICKS) {
        c.starveTicks = 0;
        drainHitPoints(party, c.id, 1);
      }
    }
    // Whole ticks of fullness are what the party sees; the fraction a warm meal
    // spared is kept so the slowing is exact.
    c.fullness = Math.round(c.fullness * 1000) / 1000;
    const now = hungerStage(c);
    if (stageDepth(now) > stageDepth(was)) notices.push({ id: c.id, name: c.name, stage: now });
  }
  return notices;
}

/** Whoever cooks or forages: the best rank of a skill among those awake. */
function best(party, skill) {
  let who = null;
  for (const c of party.members) {
    if (!awake(c)) continue;
    if (!who || skillRank(c, skill) > skillRank(who, skill)) who = c;
  }
  return who;
}

/**
 * What a pot would make, without using anything up: every eater's nourishment and
 * healing, and the buffs. The sum the pot is cooked by.
 *
 * @spec FOOD-POT-002
 * @spec FOOD-POT-004
 * @spec FOOD-POT-006
 */
export function potPreview(party, items) {
  const cook = best(party, Skill.COOKING);
  const rank = cook ? skillRank(cook, Skill.COOKING) : 0;
  const factor = 1 + 0.1 * rank;
  let nourish = 0;
  let heal = 0;
  const traits = {};
  for (const item of items) {
    nourish += item.nourish ?? 0;
    heal += item.heal ?? 0;
    for (const [trait, points] of Object.entries(item.traits ?? {})) {
      traits[trait] = (traits[trait] ?? 0) + points;
    }
  }
  // The strongest traits, ties in trait order, as many as the cook can bring out.
  const count = Math.max(1, Math.ceil(rank / 5));
  const buffs = TRAIT_ORDER
    .filter((trait) => (traits[trait] ?? 0) > 0)
    .sort((a, b) => traits[b] - traits[a] || TRAIT_ORDER.indexOf(a) - TRAIT_ORDER.indexOf(b))
    .slice(0, count)
    .map((trait) => ({ trait, points: traits[trait] * factor }));

  return {
    cook: cook?.id ?? null,
    eaters: party.members.filter(awake).map((c) => c.id),
    nourish: Math.round(nourish * factor),
    heal: Math.round(heal * factor),
    buffs,
  };
}

/** Take a character's meal buffs away, and the hit points a hale one lent them. */
function clearOne(c) {
  if (c.hale) {
    c.maxHitPoints = Math.max(1, c.maxHitPoints - c.hale);
    if (c.hitPoints > c.maxHitPoints) c.hitPoints = c.maxHitPoints;
    if (c.condition === Condition.OK) c.hitPoints = Math.max(1, c.hitPoints);
  }
  c.hale = 0;
  c.buffs = [];
}

/**
 * Clear every meal buff the party carries. Camp asks, before the pot is offered.
 *
 * @spec FOOD-BUFF-005
 */
export function clearBuffs(party) {
  for (const c of party.members) clearOne(c);
}

/**
 * Cook the pot: the items are used up, every conscious character eats the whole meal,
 * takes its buffs in place of any they carried, and the cook practises. Answers the meal.
 *
 * @spec FOOD-POT-001
 * @spec FOOD-POT-003
 * @spec FOOD-POT-005
 * @spec FOOD-POT-007
 */
export function cookPot(party, items) {
  const meal = potPreview(party, items);
  const pack = packOf(party);
  for (const item of items) {
    const at = pack.indexOf(item);
    if (at >= 0) pack.splice(at, 1);
  }
  for (const id of meal.eaters) {
    const c = character(party, id);
    clearOne(c);
    c.buffs = meal.buffs.map((b) => ({ ...b }));
    const hale = meal.buffs.find((b) => b.trait === Trait.HALE);
    if (hale) {
      c.hale = haleBonus(hale.points);
      c.maxHitPoints += c.hale;
    }
    c.fullness = Math.min(FULLNESS_MAX, c.fullness + meal.nourish);
    if (meal.heal > 0) applyHealing(party, id, meal.heal);
  }
  if (meal.cook) trainSkill(party, meal.cook, Skill.COOKING);
  return meal;
}

/**
 * The best forager awake searches while the party rests, and what they find goes into
 * the pack.
 *
 * @spec FOOD-FORAGE-001
 */
export function forage(party, list, rng) {
  const forager = best(party, Skill.FORAGING);
  if (!forager || list.length === 0) return [];
  const count = 1 + Math.floor(skillRank(forager, Skill.FORAGING) / 2);
  const found = [];
  for (let i = 0; i < count; i++) {
    const item = { ...rng.pick(list) };
    stow(party, item);
    found.push(item);
  }
  trainSkill(party, forager.id, Skill.FORAGING);
  return found;
}
