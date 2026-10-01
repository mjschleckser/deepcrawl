import { describe, it, expect } from 'vitest';
import {
  ItemKind, Slot, createItem,
  weaponOf, armourOf, accuracyWith, defenceOf, baseDamageWith,
  fitsSlot, wieldableBy,
} from './items.js';
import { Attribute, CharacterClass, Skill, createCharacter } from './party.js';

const sword = (over = {}) => createItem({
  id: 'sword', name: 'Sword', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
  skill: Skill.BLADE, damage: 10, accuracy: 20, governs: Attribute.MIGHT, ...over,
});

const mail = (over = {}) => createItem({
  id: 'mail', name: 'Mail', kind: ItemKind.ARMOUR, slot: Slot.BODY,
  skill: Skill.HEAVY_ARMOUR, armour: 4, ...over,
});

const buckler = (over = {}) => createItem({
  id: 'buckler', name: 'Buckler', kind: ItemKind.SHIELD, slot: Slot.OFF_HAND,
  defence: 5, ...over,
});

/** A combatant shaped the way both sides are shaped, with nothing held. */
const bare = (over = {}) => ({
  id: 'x', name: 'X',
  attributes: { ...{ MIGHT: 10, CONSTITUTION: 10, DEXTERITY: 10, INTELLECT: 10, PERCEPTION: 10, RESOLVE: 10 } },
  ranks: {}, equipment: {}, attack: null, armour: 0, ...over,
});

describe('what an item is', () => {
  // @spec ITEM-DEF-001
  // @spec ITEM-DEF-004
  it('carries its own numbers rather than deriving them from its name', () => {
    const w = sword();

    expect(w).toMatchObject({
      id: 'sword', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
      skill: Skill.BLADE, damage: 10, accuracy: 20, governs: Attribute.MIGHT,
    });
  });

  // @spec ITEM-DEF-008
  it('lets a finesse weapon train the same skill as a heavy one', () => {
    const dagger = sword({ id: 'dagger', governs: Attribute.DEXTERITY });

    expect(dagger.governs).toBe(Attribute.DEXTERITY);
    expect(dagger.skill).toBe(sword().skill);
  });

  // @spec ITEM-DATA-004
  it('is wieldable by anyone when it names no classes', () => {
    expect(wieldableBy(sword(), CharacterClass.MAGE)).toBe(true);
  });
});

describe('what a combatant fights with', () => {
  // @spec ITEM-HOLD-001
  it('takes the weapon from the main hand when one is held', () => {
    const c = bare({ equipment: { [Slot.MAIN_HAND]: sword() } });

    expect(weaponOf(c).id).toBe('sword');
  });

  // @spec ITEM-HOLD-001
  // @spec ITEM-HOLD-003
  it('falls back to the attack a combatant was authored with', () => {
    const goblin = bare({
      equipment: {}, attack: { skill: Skill.BLADE, baseDamage: 5, accuracy: 24 },
    });

    // Its claws are its weapon: the same fields, read the same way.
    expect(weaponOf(goblin)).toMatchObject({ skill: Skill.BLADE, damage: 5, accuracy: 24 });
  });

  // @spec ITEM-HOLD-002
  it('takes armour from the body slot, and failing that from what was authored', () => {
    expect(armourOf(bare({ equipment: { [Slot.BODY]: mail() } }))).toBe(4);
    expect(armourOf(bare({ armour: 2 }))).toBe(2);
  });

  // @spec ITEM-HOLD-004
  it('counts a shield only while it is in the off hand', () => {
    const held = bare({ equipment: { [Slot.OFF_HAND]: buckler() } });
    const none = bare();

    expect(defenceOf(held) - defenceOf(none)).toBe(5);
  });
});

describe('the three numbers', () => {
  // @spec ITEM-NUM-001
  it('assembles accuracy from the weapon, the rank behind it, and Perception', () => {
    const c = bare({
      attributes: { ...bare().attributes, PERCEPTION: 14 },
      ranks: { [Skill.BLADE]: 3 },
      equipment: { [Slot.MAIN_HAND]: sword() },
    });

    // 20 + 5x3 + 2x(14-10)
    expect(accuracyWith(c)).toBe(20 + 15 + 8);
  });

  // @spec ITEM-NUM-004
  it('draws accuracy from Perception whatever the weapon governs', () => {
    const attrs = { ...bare().attributes, PERCEPTION: 14, MIGHT: 18, DEXTERITY: 18 };
    const might = bare({ attributes: attrs, equipment: { [Slot.MAIN_HAND]: sword() } });
    const finesse = bare({
      attributes: attrs,
      equipment: { [Slot.MAIN_HAND]: sword({ governs: Attribute.DEXTERITY }) },
    });

    expect(accuracyWith(finesse)).toBe(accuracyWith(might));
  });

  // @spec ITEM-NUM-002
  it('assembles defence from the base, Dexterity, the armour rank, and the shield', () => {
    const c = bare({
      attributes: { ...bare().attributes, DEXTERITY: 14 },
      ranks: { [Skill.HEAVY_ARMOUR]: 2 },
      equipment: { [Slot.BODY]: mail(), [Slot.OFF_HAND]: buckler() },
    });

    // 20 + 2x(14-10) + 3x2 + 5
    expect(defenceOf(c)).toBe(20 + 8 + 6 + 5);
  });

  // @spec ITEM-NUM-002
  it('reads the armour rank of the skill the worn armour is used under', () => {
    const inLight = bare({
      ranks: { [Skill.HEAVY_ARMOUR]: 5, [Skill.LIGHT_ARMOUR]: 1 },
      equipment: { [Slot.BODY]: mail({ skill: Skill.LIGHT_ARMOUR }) },
    });

    // Light armour worn, so the light rank counts and the heavy rank does not.
    expect(defenceOf(inLight)).toBe(20 + 3 * 1);
  });

  // @spec ITEM-NUM-005
  it('lets armour reduce damage without making anybody harder to hit', () => {
    const plated = bare({ equipment: { [Slot.BODY]: mail({ armour: 40 }) } });

    expect(defenceOf(plated)).toBe(defenceOf(bare()));
    expect(armourOf(plated)).toBe(40);
  });

  // @spec ITEM-NUM-005
  it('lets a shield raise defence without turning any damage', () => {
    const shielded = bare({ equipment: { [Slot.OFF_HAND]: buckler() } });

    expect(armourOf(shielded)).toBe(0);
    expect(defenceOf(shielded)).toBeGreaterThan(defenceOf(bare()));
  });

  // @spec ITEM-NUM-003
  it('assembles base damage from the weapon, the rank, and what the weapon governs', () => {
    const c = bare({
      attributes: { ...bare().attributes, MIGHT: 15 },
      ranks: { [Skill.BLADE]: 4 },
      equipment: { [Slot.MAIN_HAND]: sword() },
    });

    // 10 x (1 + 0.10x4) x (1 + 0.04x5)
    expect(baseDamageWith(c)).toBeCloseTo(10 * 1.4 * 1.2, 5);
  });

  // @spec ITEM-NUM-003
  it('draws damage from the attribute the weapon names, not from a fixed one', () => {
    const attrs = { ...bare().attributes, MIGHT: 10, DEXTERITY: 20 };
    const heavy = bare({ attributes: attrs, equipment: { [Slot.MAIN_HAND]: sword() } });
    const finesse = bare({
      attributes: attrs,
      equipment: { [Slot.MAIN_HAND]: sword({ governs: Attribute.DEXTERITY }) },
    });

    expect(baseDamageWith(finesse)).toBeGreaterThan(baseDamageWith(heavy));
  });

  // @spec ITEM-NUM-006
  it('assembles all three for somebody holding nothing at all', () => {
    const empty = bare();

    expect(accuracyWith(empty)).toBe(0);
    expect(defenceOf(empty)).toBe(20);
    expect(baseDamageWith(empty)).toBe(0);
  });
});

describe('who may hold what', () => {
  // @spec ITEM-WIELD-001
  it('fits an item only to the slot it names', () => {
    expect(fitsSlot(sword(), Slot.MAIN_HAND)).toBe(true);
    expect(fitsSlot(sword(), Slot.BODY)).toBe(false);
    expect(fitsSlot(buckler(), Slot.OFF_HAND)).toBe(true);
  });

  // @spec ITEM-WIELD-002
  it('admits only the classes an item names, once it names any', () => {
    const plate = mail({ classes: [CharacterClass.FIGHTER] });

    expect(wieldableBy(plate, CharacterClass.FIGHTER)).toBe(true);
    expect(wieldableBy(plate, CharacterClass.MAGE)).toBe(false);
  });

  // @spec ITEM-WIELD-003
  it('asks the item rather than what the class can train', () => {
    const mage = createCharacter({ id: 'm', name: 'M', characterClass: CharacterClass.MAGE });
    // Whatever this class cannot train, it may still be permitted to hold.
    const untrainable = Object.values(Skill).find((sk) => !mage.trainable.includes(sk));
    expect(untrainable).toBeDefined();

    const permitted = sword({ skill: untrainable, classes: [CharacterClass.MAGE] });

    expect(wieldableBy(permitted, CharacterClass.MAGE)).toBe(true);
  });
});

describe('the vocabulary an item is built from', () => {
  // @spec ITEM-DEF-002
  it('offers three kinds and no others', () => {
    expect(Object.keys(ItemKind).sort()).toEqual(['ARMOUR', 'SHIELD', 'WEAPON']);
  });

  // @spec ITEM-DEF-003
  it('offers three slots and no others', () => {
    expect(Object.keys(Slot).sort()).toEqual(['BODY', 'MAIN_HAND', 'OFF_HAND']);
  });

  // @spec ITEM-DEF-005
  it('carries on armour the skill it is worn under and the damage it turns', () => {
    expect(mail()).toMatchObject({ skill: Skill.HEAVY_ARMOUR, armour: 4 });
  });

  // @spec ITEM-DEF-006
  it('carries on a shield what it adds to defence', () => {
    expect(buckler()).toMatchObject({ kind: ItemKind.SHIELD, defence: 5 });
  });

  // @spec ITEM-DEF-007
  it('behaves by its fields rather than by what it is called', () => {
    // Same numbers, different names: nothing anywhere reads the identifier.
    const named = sword({ id: 'excalibur', name: 'Excalibur' });
    const plain = sword();
    const wielder = (w) => bare({ equipment: { [Slot.MAIN_HAND]: w } });

    expect(accuracyWith(wielder(named))).toBe(accuracyWith(wielder(plain)));
    expect(baseDamageWith(wielder(named))).toBe(baseDamageWith(wielder(plain)));
  });
});
