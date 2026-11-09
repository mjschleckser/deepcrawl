/**
 * What a testing campaign begins with: enough of everything to try every mechanic without
 * having to find it first.
 */

import {
  CharacterClass, Skill, addGold, experienceForRank, roster, stow,
} from '../sim/party.js';
import { ItemKind } from '../sim/items.js';
import { Learned } from '../sim/magic.js';
import { itemDefinitions } from './items.js';
import { spellDefinitions } from './spells.js';

const FOOD_EACH = 3;
const GOLD = 500;
const COOK_RANK = 6;

/**
 * Fill a fresh party for testing: one of every item, three of every food, gold, every tome
 * spell each character could read, and a cleric who cooks two-buff meals.
 *
 * @spec SAVE-TEST-004
 */
export function applyTestKit(party) {
  for (const item of Object.values(itemDefinitions())) {
    const copies = item.kind === ItemKind.FOOD ? FOOD_EACH : 1;
    for (let i = 0; i < copies; i++) stow(party, { ...item });
  }
  addGold(party, GOLD);

  const tomeSpells = Object.values(spellDefinitions()).filter((s) => s.learned === Learned.TOME);
  for (const c of roster(party)) {
    for (const spell of tomeSpells) {
      const fits = spell.classes.includes(c.characterClass) && (c.ranks[spell.school] ?? 0) >= spell.rank;
      if (fits && !c.learnedSpells.includes(spell.id)) c.learnedSpells.push(spell.id);
    }
    if (c.characterClass === CharacterClass.CLERIC) {
      c.ranks[Skill.COOKING] = COOK_RANK;
      c.skillExperience[Skill.COOKING] = experienceForRank(COOK_RANK);
    }
  }
  return party;
}
