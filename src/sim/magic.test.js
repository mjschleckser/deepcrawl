import { describe, it, expect } from 'vitest';
import {
  createParty, createCharacter, addCharacter, character, applyDamage, stow, packOf,
  serializeParty, restoreParty, CharacterClass, Condition, Skill,
} from './party.js';
import { createItem, ItemKind, Effect } from './items.js';
import {
  createSpell, knows, knownSpells, slotsAt, slotsLeft, spellMagnitude,
  castRefusal, CastRefusal, castOnAlly, healPreview, spendSlot, restoreSlots,
  readRefusal, ReadRefusal, readTome, SpellTarget, CastWhere, Learned, SpellEffect,
} from './magic.js';

const missile = createSpell({
  id: 'magic_missile', name: 'Magic Missile', school: Skill.EVOCATION, rank: 1,
  target: SpellTarget.ENEMY,
  effect: { [SpellEffect.DAMAGE]: 6, ignoresArmour: true }, where: [CastWhere.COMBAT], learned: Learned.CLASS,
});
const heal = createSpell({
  id: 'heal', name: 'Heal', school: Skill.HEALING, rank: 1,
  target: SpellTarget.ALLY,
  effect: { [SpellEffect.HEAL]: 8 }, where: [CastWhere.COMBAT, CastWhere.EXPLORATION], learned: Learned.CLASS,
});
const fireBolt = createSpell({
  id: 'fire_bolt', name: 'Fire Bolt', school: Skill.EVOCATION, rank: 1,
  target: SpellTarget.ENEMY,
  effect: { [SpellEffect.DAMAGE]: 10 }, where: [CastWhere.COMBAT], learned: Learned.TOME,
});
const deep = createSpell({
  id: 'deep', name: 'Deep', school: Skill.EVOCATION, rank: 4,
  target: SpellTarget.ENEMY,
  effect: { [SpellEffect.DAMAGE]: 20 }, where: [CastWhere.COMBAT], learned: Learned.CLASS,
});
const spells = { magic_missile: missile, heal, fire_bolt: fireBolt, deep };

const tome = () => createItem({
  id: 'tome_of_fire_bolt', name: 'Tome of Fire Bolt', kind: ItemKind.CONSUMABLE, rarity: 'RARE',
  effect: { [Effect.TEACH]: 'fire_bolt' },
});

function party() {
  const p = createParty();
  addCharacter(p, createCharacter({ id: 'isolde', name: 'Isolde', characterClass: CharacterClass.MAGE }));
  addCharacter(p, createCharacter({ id: 'wren', name: 'Wren', characterClass: CharacterClass.CLERIC }));
  addCharacter(p, createCharacter({ id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER }));
  // Wren's Intercession is spent, so a knock-out in these tests stays one.
  character(p, 'wren').spentCharges = 1;
  return p;
}

describe('what a spell is', () => {
  // @spec MAGIC-SPELL-001
  it('carries everything a cast needs', () => {
    expect(missile).toMatchObject({
      id: 'magic_missile', name: 'Magic Missile', school: Skill.EVOCATION, rank: 1,
      target: SpellTarget.ENEMY,
      where: [CastWhere.COMBAT], learned: Learned.CLASS,
    });
    expect(missile.effect).toEqual({ damage: 6, ignoresArmour: true });
  });
});

describe('who knows a spell', () => {
  // @spec MAGIC-KNOW-001
  it('knows a class spell once class and school rank allow it', () => {
    const p = party();
    expect(knows(character(p, 'isolde'), missile)).toBe(true);
    expect(knows(character(p, 'wren'), heal)).toBe(true);
    // Not the class's spell, however good the rank.
    expect(knows(character(p, 'wren'), missile)).toBe(false);
    expect(knows(character(p, 'bram'), heal)).toBe(false);
    // The class's, but practice has not reached it.
    expect(knows(character(p, 'isolde'), deep)).toBe(false);
    character(p, 'isolde').ranks[Skill.EVOCATION] = 4;
    expect(knows(character(p, 'isolde'), deep)).toBe(true);
  });

  // @spec MAGIC-KNOW-002
  it('knows a tome spell only once its tome has been read', () => {
    const p = party();
    const isolde = character(p, 'isolde');
    expect(knows(isolde, fireBolt)).toBe(false);
    expect(knownSpells(isolde, spells).map((s) => s.id)).toEqual(['magic_missile']);

    stow(p, tome());
    expect(readTome(p, 'isolde', packOf(p)[0], spells)).toBe(true);

    expect(knows(isolde, fireBolt)).toBe(true);
    expect(knownSpells(isolde, spells).map((s) => s.id)).toEqual(['magic_missile', 'fire_bolt']);
  });
});

describe('reading a tome', () => {
  // @spec MAGIC-KNOW-003
  it('teaches its spell for good and is used up', () => {
    const p = party();
    stow(p, tome());
    const book = packOf(p)[0];

    expect(readRefusal(p, 'isolde', book, spells)).toBeNull();
    expect(readTome(p, 'isolde', book, spells)).toBe(true);
    expect(packOf(p)).toHaveLength(0);
    expect(character(p, 'isolde').learnedSpells).toEqual(['fire_bolt']);
  });

  // @spec MAGIC-KNOW-004
  it('is refused and kept by somebody who could not cast it, or knows it already', () => {
    const p = party();
    stow(p, tome());
    const book = packOf(p)[0];

    expect(readRefusal(p, 'wren', book, spells)).toBe(ReadRefusal.WRONG_CLASS);
    character(p, 'isolde').ranks[Skill.EVOCATION] = 0;
    expect(readRefusal(p, 'isolde', book, spells)).toBe(ReadRefusal.RANK_TOO_LOW);
    character(p, 'isolde').ranks[Skill.EVOCATION] = 2;
    character(p, 'isolde').learnedSpells.push('fire_bolt');
    expect(readRefusal(p, 'isolde', book, spells)).toBe(ReadRefusal.ALREADY_KNOWN);

    expect(readTome(p, 'isolde', book, spells)).toBe(false);
    expect(readTome(p, 'wren', book, spells)).toBe(false);
    expect(packOf(p)).toHaveLength(1);
  });

  // @spec MAGIC-KNOW-005
  it('cannot be read in a fight', () => {
    const p = party();
    stow(p, tome());
    expect(readRefusal(p, 'isolde', packOf(p)[0], spells, { inFight: true })).toBe(ReadRefusal.IN_A_FIGHT);
  });

  // @spec MAGIC-KNOW-006
  // @spec MAGIC-SLOT-006
  it('keeps what was learned, and the slots spent, through a save', () => {
    const p = party();
    stow(p, tome());
    readTome(p, 'isolde', packOf(p)[0], spells);
    spendSlot(character(p, 'isolde'), 1);

    const back = restoreParty(JSON.parse(JSON.stringify(serializeParty(p))));

    expect(character(back, 'isolde').learnedSpells).toEqual(['fire_bolt']);
    expect(slotsLeft(character(back, 'isolde'), 1, spells)).toBe(2);
  });
});

describe('spell slots', () => {
  // @spec MAGIC-SLOT-001
  it('gives three rank-1 slots to a caster, one more per two points of Intellect, none to others', () => {
    const p = party();
    expect(slotsAt(character(p, 'isolde'), 1, spells)).toBe(3);
    expect(slotsAt(character(p, 'wren'), 1, spells)).toBe(3);
    expect(slotsAt(character(p, 'bram'), 1, spells)).toBe(0);
    // No slot at a rank they know no spell of.
    expect(slotsAt(character(p, 'isolde'), 2, spells)).toBe(0);

    character(p, 'isolde').attributes.INTELLECT = 15;
    expect(slotsAt(character(p, 'isolde'), 1, spells)).toBe(5);
    character(p, 'isolde').attributes.INTELLECT = 8;
    expect(slotsAt(character(p, 'isolde'), 1, spells)).toBe(3);
  });

  // @spec MAGIC-SLOT-002
  // @spec MAGIC-SLOT-003
  // @spec MAGIC-SLOT-004
  it('spends one per cast, refuses a cast with none left, and comes back whole when restored', () => {
    const p = party();
    applyDamage(p, 'bram', 20);
    for (let i = 0; i < 3; i++) {
      character(p, 'bram').hitPoints = 1;
      expect(castOnAlly(p, 'wren', heal, 'bram', { where: CastWhere.EXPLORATION })).not.toBeNull();
    }
    expect(slotsLeft(character(p, 'wren'), 1, spells)).toBe(0);

    character(p, 'bram').hitPoints = 1;
    expect(castRefusal(p, 'wren', heal, { where: CastWhere.EXPLORATION, targetId: 'bram', spells }))
      .toBe(CastRefusal.NO_SLOTS);
    expect(castOnAlly(p, 'wren', heal, 'bram', { where: CastWhere.EXPLORATION, spells })).toBeNull();
    expect(character(p, 'bram').hitPoints).toBe(1);

    restoreSlots(character(p, 'wren'));
    expect(slotsLeft(character(p, 'wren'), 1, spells)).toBe(3);
  });
});

describe('what a cast does', () => {
  // @spec MAGIC-CAST-001
  it('grows the base with the school rank and with Intellect, rounded, never below one', () => {
    const p = party();
    const isolde = character(p, 'isolde');
    // 6 × (1 + 0.1 × 2) × 1 = 7.2
    expect(spellMagnitude(isolde, missile)).toBe(7);
    // 8 × 1.2 = 9.6
    expect(spellMagnitude(character(p, 'wren'), heal)).toBe(10);

    isolde.attributes.INTELLECT = 15;
    // 6 × 1.2 × 1.2 = 8.64
    expect(spellMagnitude(isolde, missile)).toBe(9);
    isolde.attributes.INTELLECT = -100;
    expect(spellMagnitude(isolde, missile)).toBe(1);
  });

  // @spec MAGIC-CAST-003
  // @spec MAGIC-CAST-005
  it('heals a conscious ally by what it previewed, never past their maximum', () => {
    const p = party();
    const bram = character(p, 'bram');
    bram.hitPoints = bram.maxHitPoints - 4;

    expect(healPreview(p, 'wren', heal, 'bram')).toBe(4);
    const before = JSON.stringify(p);
    healPreview(p, 'wren', heal, 'bram');
    expect(JSON.stringify(p)).toBe(before);

    expect(castOnAlly(p, 'wren', heal, 'bram', { where: CastWhere.EXPLORATION })).toEqual({ healed: 4, overchannelled: false });
    expect(bram.hitPoints).toBe(bram.maxHitPoints);
  });

  // @spec MAGIC-CAST-004
  it('refuses a heal on the unconscious or the unhurt, spending nothing', () => {
    const p = party();
    expect(castRefusal(p, 'wren', heal, { where: CastWhere.EXPLORATION, targetId: 'bram' })).toBe(CastRefusal.UNHURT);

    applyDamage(p, 'bram', 999);
    expect(character(p, 'bram').condition).toBe(Condition.UNCONSCIOUS);
    expect(castRefusal(p, 'wren', heal, { where: CastWhere.EXPLORATION, targetId: 'bram' })).toBe(CastRefusal.UNCONSCIOUS);
    expect(castOnAlly(p, 'wren', heal, 'bram', { where: CastWhere.EXPLORATION })).toBeNull();
    expect(character(p, 'bram').condition).toBe(Condition.UNCONSCIOUS);
    expect(slotsLeft(character(p, 'wren'), 1, spells)).toBe(3);
  });

  // @spec MAGIC-CAST-006
  it('is cast only where the spell names, and only by someone who knows it', () => {
    const p = party();
    expect(castRefusal(p, 'isolde', missile, { where: CastWhere.EXPLORATION })).toBe(CastRefusal.NOT_HERE);
    expect(castRefusal(p, 'isolde', missile, { where: CastWhere.COMBAT })).toBeNull();
    expect(castRefusal(p, 'bram', heal, { where: CastWhere.COMBAT, targetId: 'bram' })).toBe(CastRefusal.NOT_KNOWN);
  });

  // @spec MAGIC-CAST-007
  it('trains the school when cast out of a fight', () => {
    const p = party();
    character(p, 'bram').hitPoints = 1;
    const before = character(p, 'wren').skillExperience[Skill.HEALING] ?? 0;

    castOnAlly(p, 'wren', heal, 'bram', { where: CastWhere.EXPLORATION });

    expect(character(p, 'wren').skillExperience[Skill.HEALING]).toBeGreaterThan(before);
  });

  it('does not train the school when cast in a fight, where the fight records it', () => {
    const p = party();
    character(p, 'bram').hitPoints = 1;
    const before = character(p, 'wren').skillExperience[Skill.HEALING] ?? 0;

    castOnAlly(p, 'wren', heal, 'bram', { where: CastWhere.COMBAT });

    expect(character(p, 'wren').skillExperience[Skill.HEALING] ?? 0).toBe(before);
  });
});
