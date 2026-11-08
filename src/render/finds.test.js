import { describe, it, expect } from 'vitest';
import { ItemKind, Rarity, Slot, createItem } from '../sim/items.js';
import { makeRng } from '../sim/rng.js';
import { createLootTable } from '../sim/loot.js';
import {
  createParty, createCharacter, addCharacter, CharacterClass, Skill,
} from '../sim/party.js';
import { beginEncounter, createEnemy, createEnemyGroup, Outcome } from '../sim/combat.js';
import { RARITY_COLOURS } from './appconfig.js';
import { describeFind } from './findsplan.js';
import { buildFightPlan, chooseOption, createFightController, FightPhase } from './fight.js';

const potion = () => createItem({ id: 'potion', name: 'Healing Potion', kind: ItemKind.CONSUMABLE, rarity: Rarity.UNCOMMON, effect: { heal: 15 } });
const blade = () => createItem({ id: 'blade', name: 'Runed Dagger', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND, rarity: Rarity.EPIC });

describe('how a find is listed', () => {
  // @spec PRESENT-FIGHT-050
  // @spec PRESENT-CHEST-001
  // @spec PRESENT-RARITY-001
  it('names the gold, then each item once with its count, in its rarity\'s colour', () => {
    const listed = describeFind({ gold: 14, items: [potion(), blade(), potion()] });

    expect(listed.gold).toBe('14 gold');
    expect(listed.items).toEqual([
      { text: 'Healing Potion ×2', rarity: Rarity.UNCOMMON, colour: RARITY_COLOURS[Rarity.UNCOMMON] },
      { text: 'Runed Dagger', rarity: Rarity.EPIC, colour: RARITY_COLOURS[Rarity.EPIC] },
    ]);
    expect(listed.nothing).toBeNull();
  });

  // @spec PRESENT-FIGHT-050
  // @spec PRESENT-CHEST-001
  it('leaves out gold there is none of, and says so when nothing was found', () => {
    const listed = describeFind({ gold: 0, items: [] }, { nothing: 'No items found' });

    expect(listed.gold).toBeNull();
    expect(listed.items).toEqual([]);
    expect(listed.nothing).toBe('No items found');
  });
});

describe('the victory banner', () => {
  // @spec PRESENT-FIGHT-050
  it('lists what the band dropped', () => {
    const party = createParty();
    addCharacter(party, createCharacter({
      id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, attributes: { DEXTERITY: 30 },
      attack: { skill: Skill.BLADE, baseDamage: 50, accuracy: 300 },
    }));
    const pockets = createLootTable({
      id: 'pockets', gold: { min: 4, max: 4 }, draws: { count: 1, chance: 1 }, items: [potion()],
    });
    const encounter = beginEncounter({
      party,
      enemies: createEnemyGroup([createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 1, potValue: 14, loot: 'pockets', attributes: { DEXTERITY: 1 } })]),
      rng: makeRng(3), origin: { floorId: 'f1', x: 3, y: 3 }, lootTables: { pockets },
    });
    const fight = createFightController({ encounter, viewport: { width: 900, height: 640 }, onDraw: () => {} });
    for (let i = 0; i < 5 && fight.phase !== FightPhase.ENDED; i++) {
      chooseOption(fight, 0);
      if (fight.pending?.targets) chooseOption(fight, 0);
    }

    const plan = buildFightPlan(fight.encounter, { width: 900, height: 640 }, { phase: fight.phase, outcome: fight.outcome });

    expect(plan.banner.outcome).toBe(Outcome.VICTORY);
    expect(plan.banner.finds.gold).toBe('4 gold');
    expect(plan.banner.finds.items.map((i) => i.text)).toEqual(['Healing Potion']);
  });
});
