import { describe, it, expect } from 'vitest';
import { makeRng } from './rng.js';
import {
  createParty, createCharacter, addCharacter, character, applyDamage, stow, packOf,
  serializeParty, restoreParty, CharacterClass, Condition, Skill,
} from './party.js';
import { createItem, ItemKind, armourOf, baseDamageWith, Slot } from './items.js';
import { createSpell, spellMagnitude, SpellTarget, CastWhere, Learned } from './magic.js';
import {
  FULLNESS_MAX, HungerStage, Trait, hungerStage, hungerPenalty, damageFactor, spellFactor,
  armourBonus, dexterityBonus,
} from './food.js';
import { passHunger, potPreview, cookPot, clearBuffs, forage } from './meals.js';

const food = (id, nourish, heal, traits = {}) => createItem({
  id, name: id, kind: ItemKind.FOOD, nourish, heal, traits,
});
const ration = () => food('ration', 600, 2);
const haunch = () => food('goblin_haunch', 450, 8, { [Trait.HEARTY]: 3 });
const glowcap = () => food('glowcap', 150, 2, { [Trait.ARCANE]: 3 });
const honeycomb = () => food('honeycomb', 300, 16, { [Trait.HALE]: 2 });
const moss = () => food('cave_moss', 200, 6, { [Trait.HALE]: 1, [Trait.WARMING]: 1 });
const pepper = () => food('dragonpepper', 50, 0, { [Trait.HEARTY]: 4, [Trait.WARMING]: 3 });

function party() {
  const p = createParty();
  for (const [id, cls] of [
    ['bram', CharacterClass.FIGHTER], ['isolde', CharacterClass.MAGE], ['wren', CharacterClass.CLERIC],
  ]) {
    addCharacter(p, createCharacter({
      id, name: id, characterClass: cls, attack: { skill: Skill.BLADE, baseDamage: 10 },
    }));
  }
  // Wren's Intercession is spent, so a knock-out in these tests stays one.
  character(p, 'wren').spentCharges = 1;
  return p;
}

describe('hunger', () => {
  // @spec FOOD-HUNGER-001
  it('starts every character full, and takes one fullness a tick from the living', () => {
    const p = party();
    expect(character(p, 'bram').fullness).toBe(FULLNESS_MAX);

    passHunger(p, 100);

    expect(character(p, 'bram').fullness).toBe(FULLNESS_MAX - 100);
  });

  // @spec FOOD-HUNGER-003
  it('sets the stage from fullness: Fed, four Hungry stages, then Starving', () => {
    const at = (fullness) => hungerStage({ fullness });
    expect(at(2000)).toBe(HungerStage.FED);
    expect(at(1000)).toBe(HungerStage.FED);
    expect(at(999)).toBe(HungerStage.HUNGRY);
    expect(at(749)).toBe(HungerStage.VERY_HUNGRY);
    expect(at(499)).toBe(HungerStage.FAMISHED);
    expect(at(249)).toBe(HungerStage.RAVENOUS);
    expect(at(1)).toBe(HungerStage.RAVENOUS);
    expect(at(0)).toBe(HungerStage.STARVING);
  });

  // @spec FOOD-HUNGER-004
  // @spec ITEM-NUM-008
  // @spec MAGIC-CAST-010
  it('cuts damage and spell magnitude more at every stage', () => {
    const penalties = [2000, 900, 600, 300, 100, 0].map((fullness) => hungerPenalty({ fullness }));
    expect(penalties).toEqual([0, 0.05, 0.1, 0.15, 0.2, 0.25]);

    const p = party();
    const bram = character(p, 'bram');
    const full = baseDamageWith(bram);
    bram.fullness = 600;
    expect(baseDamageWith(bram)).toBeCloseTo(full * 0.9, 5);

    const missile = createSpell({
      id: 'm', name: 'M', school: Skill.EVOCATION, rank: 1, classes: [CharacterClass.MAGE],
      target: SpellTarget.ENEMY, effect: { damage: 20 }, where: [CastWhere.COMBAT], learned: Learned.CLASS,
    });
    const isolde = character(p, 'isolde');
    const before = spellMagnitude(isolde, missile);
    isolde.fullness = 0;
    expect(spellMagnitude(isolde, missile)).toBe(Math.round(before * 0.75));
  });

  // @spec FOOD-HUNGER-005
  it('drains a starving character a hit point every thirty ticks, never below one', () => {
    const p = party();
    const bram = character(p, 'bram');
    bram.fullness = 0;
    const hp = bram.hitPoints;

    passHunger(p, 90);
    expect(bram.hitPoints).toBe(hp - 3);

    passHunger(p, 30 * 200);
    expect(bram.hitPoints).toBe(1);
    expect(bram.condition).toBe(Condition.OK);
  });

  // @spec FOOD-HUNGER-006
  it('reports who grew hungrier, and the stage they reached, once per step down', () => {
    const p = party();
    for (const c of p.members) c.fullness = 1010;
    character(p, 'wren').fullness = 2000;

    const notices = passHunger(p, 20);

    expect(notices).toEqual([
      { id: 'bram', name: 'bram', stage: HungerStage.HUNGRY },
      { id: 'isolde', name: 'isolde', stage: HungerStage.HUNGRY },
    ]);
    expect(passHunger(p, 20)).toEqual([]);
  });
});

describe('the pot', () => {
  // @spec FOOD-POT-001
  // @spec FOOD-POT-003
  it('feeds every conscious character the whole of the meal, using the food up', () => {
    const p = party();
    for (const c of p.members) { c.fullness = 500; c.hitPoints = 5; }
    applyDamage(p, 'wren', 999);
    stow(p, ration());
    stow(p, haunch());

    const meal = cookPot(p, [...packOf(p)]);

    // Cooking 1 everywhere: × 1.1.
    expect(meal.nourish).toBe(1155);
    expect(meal.heal).toBe(11);
    expect(packOf(p)).toHaveLength(0);
    for (const id of ['bram', 'isolde']) {
      expect(character(p, id).fullness).toBe(1655);
      expect(character(p, id).hitPoints).toBe(16);
    }
    // Unconscious, so not fed.
    expect(character(p, 'wren').fullness).toBe(500);
  });

  // @spec FOOD-POT-003
  it('fills nobody past full', () => {
    const p = party();
    stow(p, ration());
    cookPot(p, [...packOf(p)]);
    expect(character(p, 'bram').fullness).toBe(FULLNESS_MAX);
  });

  // @spec FOOD-POT-002
  it('scales the meal by the best Cooking rank among the conscious', () => {
    const p = party();
    character(p, 'isolde').ranks[Skill.COOKING] = 4;
    expect(potPreview(p, [ration()])).toMatchObject({ nourish: 840, heal: 3, cook: 'isolde' });

    applyDamage(p, 'isolde', 999);
    expect(potPreview(p, [ration()]).cook).not.toBe('isolde');
  });

  // @spec FOOD-POT-004
  it('gives the strongest traits as buffs, one per five Cooking ranks rounded up, ties in trait order', () => {
    const p = party();
    // Hearty 3 + 4, arcane 3, warming 3.
    const pot = [haunch(), glowcap(), pepper()];
    expect(potPreview(p, pot).buffs.map((b) => b.trait)).toEqual([Trait.HEARTY]);

    character(p, 'wren').ranks[Skill.COOKING] = 6;
    const two = potPreview(p, pot).buffs;
    // Arcane and warming tie at 3; arcane comes first.
    expect(two.map((b) => b.trait)).toEqual([Trait.HEARTY, Trait.ARCANE]);
    expect(two[0].points).toBeCloseTo(7 * 1.6, 5);

    expect(potPreview(p, [ration(), ration()]).buffs).toEqual([]);
  });

  // @spec FOOD-POT-005
  // @spec FOOD-BUFF-001
  it('gives every eater the buffs, replacing what they carried', () => {
    const p = party();
    const bram = character(p, 'bram');
    const plain = baseDamageWith(bram);
    stow(p, glowcap());
    cookPot(p, [...packOf(p)]);
    expect(bram.buffs.map((b) => b.trait)).toEqual([Trait.ARCANE]);

    stow(p, haunch());
    cookPot(p, [...packOf(p)]);

    expect(bram.buffs.map((b) => b.trait)).toEqual([Trait.HEARTY]);
    // Hearty 3.3 × 2% = 6.6%.
    expect(damageFactor(bram)).toBeCloseTo(1.066, 5);
    expect(baseDamageWith(bram)).toBeCloseTo(plain * 1.066, 5);
  });

  // @spec FOOD-POT-006
  it('reports what a pot would make without using anything up', () => {
    const p = party();
    stow(p, haunch());
    const before = JSON.stringify(p);

    const preview = potPreview(p, [...packOf(p)]);

    expect(preview).toMatchObject({ nourish: 495, heal: 9 });
    expect(preview.eaters).toEqual(['bram', 'isolde', 'wren']);
    expect(JSON.stringify(p)).toBe(before);
  });

  // @spec FOOD-POT-007
  it('trains the cook\'s Cooking', () => {
    const p = party();
    stow(p, ration());
    const cook = potPreview(p, [...packOf(p)]).cook;
    const before = character(p, cook).skillExperience[Skill.COOKING] ?? 0;

    cookPot(p, [...packOf(p)]);

    expect(character(p, cook).skillExperience[Skill.COOKING]).toBeGreaterThan(before);
  });
});

describe('buffs', () => {
  const carrying = (trait, points) => {
    const p = party();
    const c = character(p, 'bram');
    c.buffs = [{ trait, points }];
    return c;
  };

  // @spec FOOD-BUFF-002
  // @spec ITEM-NUM-008
  it('raises armour by one per two tough points', () => {
    const c = carrying(Trait.TOUGH, 5);
    expect(armourBonus(c)).toBe(2);
    expect(armourOf(c)).toBe(2);
  });

  // @spec FOOD-BUFF-003
  it('raises Dexterity by one per two nimble points', () => {
    expect(dexterityBonus(carrying(Trait.NIMBLE, 4.4))).toBe(2);
  });

  // @spec FOOD-BUFF-004
  it('raises spell magnitude by three percent per arcane point', () => {
    expect(spellFactor(carrying(Trait.ARCANE, 10))).toBeCloseTo(1.3, 5);
  });

  // @spec FOOD-BUFF-006
  // @spec FOOD-BUFF-005
  it('raises maximum hit points by two per hale point, and takes them back when cleared', () => {
    const p = party();
    const bram = character(p, 'bram');
    const max = bram.maxHitPoints;
    stow(p, honeycomb());
    cookPot(p, [...packOf(p)]);
    // Hale 2 × 1.1 = 2.2, so 4 hit points.
    expect(bram.maxHitPoints).toBe(max + 4);
    bram.hitPoints = bram.maxHitPoints;

    clearBuffs(p);

    expect(bram.buffs).toEqual([]);
    expect(bram.maxHitPoints).toBe(max);
    expect(bram.hitPoints).toBe(max);
  });

  // @spec FOOD-BUFF-005
  it('never leaves a cleared character below one hit point', () => {
    const p = party();
    const bram = character(p, 'bram');
    bram.buffs = [{ trait: Trait.HALE, points: 50 }];
    bram.hale = 100;
    bram.maxHitPoints += 100;
    bram.hitPoints = 1;

    clearBuffs(p);

    expect(bram.hitPoints).toBe(1);
  });

  // @spec FOOD-BUFF-007
  it('slows hunger by five percent per warming point, never by more than half', () => {
    const p = party();
    character(p, 'bram').buffs = [{ trait: Trait.WARMING, points: 4 }];
    character(p, 'isolde').buffs = [{ trait: Trait.WARMING, points: 40 }];

    passHunger(p, 100);

    expect(character(p, 'bram').fullness).toBe(FULLNESS_MAX - 80);
    expect(character(p, 'isolde').fullness).toBe(FULLNESS_MAX - 50);
  });

  // @spec PARTY-SAVE-005
  it('keeps fullness and buffs through a save', () => {
    const p = party();
    character(p, 'bram').fullness = 777;
    character(p, 'bram').buffs = [{ trait: Trait.TOUGH, points: 3 }];

    const back = restoreParty(JSON.parse(JSON.stringify(serializeParty(p))));

    expect(character(back, 'bram').fullness).toBe(777);
    expect(character(back, 'bram').buffs).toEqual([{ trait: Trait.TOUGH, points: 3 }]);
  });
});

describe('foraging', () => {
  // @spec FOOD-FORAGE-001
  it('finds one plus one per two Foraging ranks of the best forager awake, and trains them', () => {
    const p = party();
    character(p, 'wren').ranks[Skill.FORAGING] = 5;
    const list = [food('bitterleaf', 100, 10), food('fleetroot', 150, 3)];
    const before = character(p, 'wren').skillExperience[Skill.FORAGING] ?? 0;

    const found = forage(p, list, makeRng(4));

    expect(found).toHaveLength(3);
    expect(packOf(p)).toHaveLength(3);
    for (const item of found) expect(['bitterleaf', 'fleetroot']).toContain(item.id);
    expect(character(p, 'wren').skillExperience[Skill.FORAGING]).toBeGreaterThan(before);
  });

  it('finds nothing when nobody is awake to look', () => {
    const p = party();
    for (const c of p.members) applyDamage(p, c.id, 999);
    expect(forage(p, [food('bitterleaf', 100, 10)], makeRng(4))).toEqual([]);
  });
});

describe('a food item', () => {
  // @spec FOOD-ITEM-001
  it('carries nourishment, healing and trait points, and fits no slot', () => {
    expect(haunch()).toMatchObject({ kind: ItemKind.FOOD, nourish: 450, heal: 8, traits: { hearty: 3 }, slot: null });
    expect(Object.values(Slot)).not.toContain(haunch().slot);
  });
});
