import { describe, it, expect } from 'vitest';
import * as partyModule from './party.js';
import {
  createParty, createCharacter, addCharacter, character, applyDamage, applyHealing, payHitPoints,
  awardEncounter, trainSkill, serializeParty, restoreParty, totalLevel, skillRank,
  ironcladArmourFactor, targetWeight, backstabMultiplier, overchannelCostPerRank,
  intercessionCharges, chargesLeft, restoreCharges, castingAttribute,
  CharacterClass, Condition, Skill, SkillGroup, SKILL_GROUPS, BASE_SKILLS, Attribute,
  CLASS_SKILLS, experienceForRank,
} from './party.js';

const make = (id, characterClass, over = {}) => createCharacter({ id, name: id, characterClass, ...over });

function party(...members) {
  const p = createParty();
  for (const m of members) addCharacter(p, m);
  return p;
}

describe('the skill list', () => {
  // @spec PARTY-SKILL-015
  it('offers exactly these skills, and none for wearing armour', () => {
    expect(Object.values(Skill).sort()).toEqual([
      'ALTERATION', 'BACKSTAB', 'BLADE', 'BLUNT', 'BOW', 'CARTOGRAPHY', 'COOKING', 'DETECTION',
      'DISARM', 'EVOCATION', 'FORAGING', 'HEALING', 'INTERCESSION', 'IRONCLAD', 'LOCKS',
      'OVERCHANNEL', 'POLEARM', 'RESTORATION',
    ]);
  });

  // @spec PARTY-SKILL-013
  it('groups them Class first, then Weapon, Arcane, Divine, Stealth, Survival', () => {
    expect(SKILL_GROUPS.map((g) => g.group)).toEqual([
      SkillGroup.CLASS, SkillGroup.WEAPON, SkillGroup.ARCANE, SkillGroup.DIVINE, SkillGroup.STEALTH, SkillGroup.SURVIVAL,
    ]);
    expect(SKILL_GROUPS[0].skills).toEqual(CLASS_SKILLS);
    expect(CLASS_SKILLS).toEqual([Skill.IRONCLAD, Skill.BACKSTAB, Skill.OVERCHANNEL, Skill.INTERCESSION]);
  });
});

describe('creating a classed character', () => {
  // @spec PARTY-SKILL-002
  it('opens with the shared base skills and the ranks the class file names, its class skill among them', () => {
    const bram = make('bram', CharacterClass.FIGHTER);
    for (const skill of BASE_SKILLS) expect(bram.ranks[skill]).toBe(1);
    expect(bram.ranks).toMatchObject({ [Skill.IRONCLAD]: 1, [Skill.BLADE]: 2, [Skill.BLUNT]: 1, [Skill.POLEARM]: 1 });
    expect(make('tam', CharacterClass.THIEF).ranks[Skill.BACKSTAB]).toBe(1);
    expect(make('isolde', CharacterClass.MAGE).ranks[Skill.OVERCHANNEL]).toBe(1);
    expect(make('wren', CharacterClass.CLERIC).ranks[Skill.INTERCESSION]).toBe(1);
  });

  // @spec PARTY-CHAR-006
  it('takes the hit-point base from the class file', () => {
    expect(make('isolde', CharacterClass.MAGE).maxHitPoints).toBe(18);
    expect(make('bram', CharacterClass.FIGHTER, { attributes: { [Attribute.CONSTITUTION]: 14 } }).maxHitPoints).toBe(36);
  });

  // @spec PARTY-CHAR-013
  it('casts with the attribute the class names, or none', () => {
    expect(castingAttribute(make('isolde', CharacterClass.MAGE))).toBe(Attribute.INTELLECT);
    expect(castingAttribute(make('wren', CharacterClass.CLERIC))).toBe(Attribute.RESOLVE);
    expect(castingAttribute(make('bram', CharacterClass.FIGHTER))).toBe(null);
  });

  // @spec PARTY-CSKILL-001
  it('never holds another class\'s class skill, even if handed one', () => {
    const tam = make('tam', CharacterClass.THIEF, { ranks: { [Skill.IRONCLAD]: 4 } });
    expect(tam.ranks[Skill.IRONCLAD]).toBeUndefined();
  });

  // @spec PARTY-CLASS-008
  it('offers no way to change class', () => {
    expect(partyModule.changeClass).toBeUndefined();
  });
});

describe('one rate for every skill', () => {
  // @spec PARTY-SKILL-014
  it('advances the same skill by the same amount for every class', () => {
    const p = party(make('bram', CharacterClass.FIGHTER), make('isolde', CharacterClass.MAGE));
    awardEncounter(p, 'bram', { pot: 100, skillsUsed: [Skill.BLUNT] });
    awardEncounter(p, 'isolde', { pot: 100, skillsUsed: [Skill.BLUNT] });
    expect(character(p, 'bram').skillExperience[Skill.BLUNT]).toBe(100);
    expect(character(p, 'isolde').skillExperience[Skill.BLUNT]).toBe(100);
  });

  // @spec PARTY-SKILL-014
  it('bars no class from practising a skill', () => {
    const p = party(make('isolde', CharacterClass.MAGE));
    trainSkill(p, 'isolde', Skill.LOCKS, experienceForRank(2));
    expect(skillRank(character(p, 'isolde'), Skill.LOCKS)).toBe(2);
  });

  // @spec PARTY-CSKILL-001
  it('gives no experience in a class skill to anyone of another class', () => {
    const p = party(make('isolde', CharacterClass.MAGE));
    trainSkill(p, 'isolde', Skill.IRONCLAD, 5000);
    awardEncounter(p, 'isolde', { pot: 900, skillsUsed: [Skill.BACKSTAB] });
    const isolde = character(p, 'isolde');
    expect(isolde.ranks[Skill.IRONCLAD]).toBeUndefined();
    expect(isolde.skillExperience[Skill.IRONCLAD]).toBeUndefined();
    expect(isolde.skillExperience[Skill.BACKSTAB]).toBeUndefined();
  });

  // @spec PARTY-CSKILL-002
  it('ranks and counts a class skill like any other', () => {
    const p = party(make('bram', CharacterClass.FIGHTER));
    const before = totalLevel(character(p, 'bram'));
    awardEncounter(p, 'bram', { pot: experienceForRank(3), skillsUsed: [Skill.IRONCLAD] });
    expect(skillRank(character(p, 'bram'), Skill.IRONCLAD)).toBe(3);
    expect(totalLevel(character(p, 'bram'))).toBe(before + 2);
    trainSkill(p, 'bram', Skill.IRONCLAD, 1e9);
    expect(skillRank(character(p, 'bram'), Skill.IRONCLAD)).toBe(10);
  });
});

describe('what the class skills are worth', () => {
  const at = (characterClass, skill, rank) => {
    const c = make('x', characterClass);
    c.ranks[skill] = rank;
    return c;
  };

  // @spec PARTY-CSKILL-003
  it('grows a fighter\'s armour a twentieth per Ironclad rank', () => {
    expect(ironcladArmourFactor(at(CharacterClass.FIGHTER, Skill.IRONCLAD, 1))).toBeCloseTo(1.05);
    expect(ironcladArmourFactor(at(CharacterClass.FIGHTER, Skill.IRONCLAD, 10))).toBeCloseTo(1.5);
    expect(ironcladArmourFactor(make('m', CharacterClass.MAGE))).toBe(1);
  });

  // @spec PARTY-CSKILL-004
  it('weights a fighter as a target a fifth more per Ironclad rank, and everyone else as one', () => {
    expect(targetWeight(at(CharacterClass.FIGHTER, Skill.IRONCLAD, 1))).toBeCloseTo(1.2);
    expect(targetWeight(at(CharacterClass.FIGHTER, Skill.IRONCLAD, 10))).toBeCloseTo(3);
    expect(targetWeight(make('t', CharacterClass.THIEF))).toBe(1);
  });

  // @spec PARTY-CSKILL-005
  it('multiplies a thief\'s backstab from twice at rank 1 to 2.9 at rank 10', () => {
    expect(backstabMultiplier(at(CharacterClass.THIEF, Skill.BACKSTAB, 1))).toBeCloseTo(2);
    expect(backstabMultiplier(at(CharacterClass.THIEF, Skill.BACKSTAB, 10))).toBeCloseTo(2.9);
    expect(backstabMultiplier(make('f', CharacterClass.FIGHTER))).toBe(1);
  });

  // @spec PARTY-CSKILL-006
  it('prices Overchannel at seven less half the rank, rounded up, per spell rank', () => {
    const costs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      .map((r) => overchannelCostPerRank(at(CharacterClass.MAGE, Skill.OVERCHANNEL, r)));
    expect(costs).toEqual([6, 6, 5, 5, 4, 4, 3, 3, 2, 2]);
    expect(overchannelCostPerRank(make('w', CharacterClass.CLERIC))).toBe(null);
  });

  // @spec PARTY-CSKILL-007
  it('gives a cleric one charge, and one more for every four ranks', () => {
    const charges = [1, 3, 4, 7, 8, 10].map((r) => intercessionCharges(at(CharacterClass.CLERIC, Skill.INTERCESSION, r)));
    expect(charges).toEqual([1, 1, 2, 2, 3, 3]);
    expect(intercessionCharges(make('f', CharacterClass.FIGHTER))).toBe(0);
  });
});

describe('Intercession', () => {
  const crew = () => party(
    make('bram', CharacterClass.FIGHTER),
    make('wren', CharacterClass.CLERIC),
    make('wynn', CharacterClass.CLERIC),
  );

  // @spec PARTY-CSKILL-008
  it('leaves a falling member at one hit point and spends the first cleric\'s charge', () => {
    const p = crew();
    const result = applyDamage(p, 'bram', 500);
    expect(character(p, 'bram')).toMatchObject({ hitPoints: 1, condition: Condition.OK });
    expect(result).toEqual({ intercededBy: 'wren' });
    expect(chargesLeft(character(p, 'wren'))).toBe(0);
    expect(chargesLeft(character(p, 'wynn'))).toBe(1);
    // The next fall is caught by the next cleric with a charge, then by nobody.
    applyDamage(p, 'bram', 500);
    expect(chargesLeft(character(p, 'wynn'))).toBe(0);
    applyDamage(p, 'bram', 500);
    expect(character(p, 'bram').condition).toBe(Condition.UNCONSCIOUS);
  });

  // @spec PARTY-CSKILL-008
  it('catches the cleric too, and needs the cleric awake', () => {
    const p = party(make('wren', CharacterClass.CLERIC), make('bram', CharacterClass.FIGHTER));
    applyDamage(p, 'wren', 500);
    expect(character(p, 'wren')).toMatchObject({ hitPoints: 1, condition: Condition.OK });
    applyDamage(p, 'wren', 500);
    expect(character(p, 'wren').condition).toBe(Condition.UNCONSCIOUS);
    restoreCharges(character(p, 'wren'));
    applyDamage(p, 'bram', 500);
    expect(character(p, 'bram').condition).toBe(Condition.UNCONSCIOUS);
  });

  // @spec PARTY-CSKILL-008
  it('does nothing for damage that does not fell', () => {
    const p = crew();
    applyDamage(p, 'bram', 3);
    expect(chargesLeft(character(p, 'wren'))).toBe(1);
  });

  // @spec PARTY-CSKILL-009
  it('does not intercede for someone already down', () => {
    const p = crew();
    character(p, 'wren').spentCharges = 1;
    character(p, 'wynn').spentCharges = 1;
    applyDamage(p, 'bram', 500);
    restoreCharges(character(p, 'wren'));
    applyDamage(p, 'bram', 1);
    expect(character(p, 'bram').condition).toBe(Condition.DEAD);
    expect(chargesLeft(character(p, 'wren'))).toBe(1);
  });

  // @spec PARTY-CSKILL-010
  it('trains Intercession when it spends a charge outside a fight, and not inside one', () => {
    const p = crew();
    applyDamage(p, 'bram', 500);
    expect(character(p, 'wren').skillExperience[Skill.INTERCESSION]).toBeGreaterThan(0);
    const q = crew();
    applyDamage(q, 'bram', 500, { inFight: true });
    expect(character(q, 'wren').skillExperience[Skill.INTERCESSION]).toBeUndefined();
  });

  // @spec PARTY-CSKILL-011
  it('returns every spent charge only when restored', () => {
    const p = crew();
    applyDamage(p, 'bram', 500);
    applyHealing(p, 'bram', 50);
    expect(chargesLeft(character(p, 'wren'))).toBe(0);
    restoreCharges(character(p, 'wren'));
    expect(chargesLeft(character(p, 'wren'))).toBe(1);
  });
});

describe('paying hit points', () => {
  // @spec PARTY-OP-009
  it('lowers hit points without condition change or Intercession', () => {
    const p = party(make('isolde', CharacterClass.MAGE), make('wren', CharacterClass.CLERIC));
    expect(payHitPoints(p, 'isolde', 6)).toBe(true);
    expect(character(p, 'isolde')).toMatchObject({ hitPoints: 12, condition: Condition.OK });
    expect(chargesLeft(character(p, 'wren'))).toBe(1);
  });

  // @spec PARTY-OP-010
  it('refuses a cost that would bring the character to zero', () => {
    const p = party(make('isolde', CharacterClass.MAGE));
    character(p, 'isolde').hitPoints = 6;
    expect(payHitPoints(p, 'isolde', 6)).toBe(false);
    expect(character(p, 'isolde').hitPoints).toBe(6);
    expect(payHitPoints(p, 'isolde', 5)).toBe(true);
    expect(character(p, 'isolde').hitPoints).toBe(1);
  });
});

describe('saving class state', () => {
  // @spec PARTY-SAVE-006
  it('saves spent charges, and the class by its identifier only', () => {
    const p = party(make('bram', CharacterClass.FIGHTER), make('wren', CharacterClass.CLERIC));
    applyDamage(p, 'bram', 500);
    const saved = JSON.parse(JSON.stringify(serializeParty(p)));
    expect(saved.members[1].characterClass).toBe('CLERIC');
    expect(JSON.stringify(saved)).not.toMatch(/hitPoints":26,"classSkill/);
    expect(chargesLeft(character(restoreParty(saved), 'wren'))).toBe(0);
  });

  // @spec PARTY-SAVE-007
  it('drops ranks and experience in skills that no longer exist', () => {
    const p = party(make('bram', CharacterClass.FIGHTER));
    const saved = JSON.parse(JSON.stringify(serializeParty(p)));
    saved.members[0].ranks.HEAVY_ARMOUR = 2;
    saved.members[0].skillExperience.HEAVY_ARMOUR = 300;
    saved.members[0].trainable = ['BLADE'];
    const back = character(restoreParty(saved), 'bram');
    expect(back.ranks.HEAVY_ARMOUR).toBeUndefined();
    expect(back.skillExperience.HEAVY_ARMOUR).toBeUndefined();
    expect(back.trainable).toBeUndefined();
  });
});
