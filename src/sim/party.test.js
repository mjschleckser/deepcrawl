import { describe, it, expect } from 'vitest';
import {
  createParty,
  createCharacter,
  addCharacter,
  applyDamage,
  applyHealing,
  attemptRevival,
  awardEncounter,
  trainSkill,
  changeClass,
  skillRank,
  character,
  roster,
  living,
  totalLevel,
  Condition,
  Attribute,
  Skill,
  CharacterClass,
  BASE_SKILLS,
  POT_SKILL_CEILING,
  partyStepCost,
  MIN_STEP_COST,
  MAX_STEP_COST,
  serializeParty,
  restoreParty,
  experienceForRank,
  RANK_CAP,
} from './party.js';

const fighter = (over = {}) =>
  createCharacter({ id: 'f1', name: 'Bram', characterClass: CharacterClass.FIGHTER, ...over });
const cleric = (over = {}) =>
  createCharacter({ id: 'c1', name: 'Wren', characterClass: CharacterClass.CLERIC, ...over });

function partyOf(...characters) {
  const party = createParty();
  for (const c of characters) addCharacter(party, c);
  return party;
}

describe('the roster', () => {
  // @spec PARTY-ROSTER-001
  it('holds at most five characters', () => {
    const party = createParty();
    for (let i = 0; i < 5; i++) {
      expect(addCharacter(party, fighter({ id: `f${i}` }))).toBe(true);
    }

    expect(addCharacter(party, fighter({ id: 'sixth' }))).toBe(false);
    expect(roster(party)).toHaveLength(5);
  });

  // @spec PARTY-ROSTER-006
  it('gives a character no position among the others', () => {
    const party = partyOf(fighter({ id: 'a' }), cleric({ id: 'b' }));

    for (const c of roster(party)) {
      expect(c.row).toBeUndefined();
      expect(c.position).toBeUndefined();
    }
  });

  // @spec PARTY-ROSTER-003
  it('leaves the party untouched when an operation would break a limit', () => {
    const party = createParty();
    for (let i = 0; i < 5; i++) addCharacter(party, fighter({ id: `f${i}` }));
    const before = roster(party).map((c) => c.id);

    addCharacter(party, fighter({ id: 'overflow' }));

    expect(roster(party).map((c) => c.id)).toEqual(before);
  });
});

describe('total level', () => {
  // @spec PARTY-CHAR-009
  it("is the sum of a character's skill ranks", () => {
    const c = fighter();
    const summed = Object.values(c.ranks).reduce((a, b) => a + b, 0);

    expect(totalLevel(c)).toBe(summed);
    expect(totalLevel(c)).toBeGreaterThan(0);
  });

  // @spec PARTY-CHAR-010
  it('moves when a rank moves, having never been stored', () => {
    const party = partyOf(fighter());
    const before = totalLevel(character(party, 'f1'));

    // Train until the rank actually turns over; the level follows the rank, not the hours.
    const startingRank = skillRank(character(party, 'f1'), Skill.BLADE);
    while (skillRank(character(party, 'f1'), Skill.BLADE) === startingRank) {
      trainSkill(party, 'f1', Skill.BLADE);
    }

    const after = totalLevel(character(party, 'f1'));
    expect(after).toBe(before + 1);
    expect(character(party, 'f1').totalLevel).toBeUndefined();
  });

  // @spec PARTY-CHAR-011
  it('sums anything holding ranks, whichever side it belongs to', () => {
    const goblin = { id: 'g', name: 'Goblin', ranks: { BLADE: 2, LIGHT_ARMOUR: 1 } };

    expect(totalLevel(goblin)).toBe(3);
  });

  // @spec PARTY-CHAR-011
  it('counts nothing for something with no ranks at all', () => {
    expect(totalLevel({ id: 'rock', name: 'Rock' })).toBe(0);
  });
});

describe('characters', () => {
  // @spec PARTY-CHAR-001
  it('gives every character the six attributes', () => {
    const c = fighter();

    for (const attribute of Object.values(Attribute)) {
      expect(c.attributes[attribute]).toBeGreaterThan(0);
    }
    expect(Object.keys(c.attributes).sort()).toEqual(Object.values(Attribute).sort());
  });

  // @spec PARTY-CHAR-004
  it('gives every character a class and a set of equipment slots', () => {
    const c = fighter();

    expect(c.characterClass).toBe(CharacterClass.FIGHTER);
    expect(c.equipment).toBeDefined();
  });

  // @spec PARTY-SKILL-002
  it('starts every class with the shared base skills at rank one', () => {
    for (const cls of Object.values(CharacterClass)) {
      const c = createCharacter({ id: 'x', name: 'X', characterClass: cls });
      for (const skill of BASE_SKILLS) {
        expect(skillRank(c, skill)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  // @spec PARTY-SKILL-002
  it('starts a class with its own skills, so nobody is useless on the first descent', () => {
    // A fresh thief can already look for traps; a fresh cleric can already try a revival.
    expect(skillRank(createCharacter({ id: 't', name: 'T', characterClass: CharacterClass.THIEF }), Skill.DETECTION)).toBeGreaterThanOrEqual(1);
    expect(skillRank(cleric(), Skill.RESTORATION)).toBeGreaterThanOrEqual(1);
    expect(skillRank(fighter(), Skill.BLADE)).toBeGreaterThanOrEqual(1);
  });
});

describe('the condition chain', () => {
  // @spec PARTY-COND-001
  it('drops a character to unconscious at zero hit points, never below', () => {
    const party = partyOf(fighter());

    applyDamage(party, 'f1', 9999);

    expect(character(party, 'f1').hitPoints).toBe(0);
    expect(character(party, 'f1').condition).toBe(Condition.UNCONSCIOUS);
  });

  // @spec PARTY-COND-002
  // @spec PARTY-COND-010
  it('kills a character struck while unconscious, resolving at once rather than at end of round', () => {
    const party = partyOf(fighter());
    applyDamage(party, 'f1', 9999);

    applyDamage(party, 'f1', 1);

    expect(character(party, 'f1').condition).toBe(Condition.DEAD);
  });

  // @spec PARTY-COND-003
  it('wakes an unconscious character on any healing', () => {
    const party = partyOf(fighter());
    applyDamage(party, 'f1', 9999);

    applyHealing(party, 'f1', 1);

    expect(character(party, 'f1').condition).toBe(Condition.OK);
    expect(character(party, 'f1').hitPoints).toBe(1);
  });

  // @spec PARTY-COND-004
  it('will not heal the dead', () => {
    const party = partyOf(fighter());
    applyDamage(party, 'f1', 9999);
    applyDamage(party, 'f1', 1);

    applyHealing(party, 'f1', 50);

    expect(character(party, 'f1').condition).toBe(Condition.DEAD);
    expect(character(party, 'f1').hitPoints).toBe(0);
  });

  // @spec PARTY-COND-008
  it('never heals above maximum', () => {
    const party = partyOf(fighter());
    const max = character(party, 'f1').maxHitPoints;
    applyDamage(party, 'f1', 1);

    applyHealing(party, 'f1', 9999);

    expect(character(party, 'f1').hitPoints).toBe(max);
  });

  // @spec PARTY-COND-005
  it('restores the dead on a successful revival and degrades them to ashes on a failure', () => {
    const revived = partyOf(fighter());
    applyDamage(revived, 'f1', 9999);
    applyDamage(revived, 'f1', 1);
    attemptRevival(revived, 'f1', { succeeds: true });
    expect(character(revived, 'f1').condition).toBe(Condition.OK);

    const failed = partyOf(fighter());
    applyDamage(failed, 'f1', 9999);
    applyDamage(failed, 'f1', 1);
    attemptRevival(failed, 'f1', { succeeds: false });
    expect(character(failed, 'f1').condition).toBe(Condition.ASHES);
  });

  // @spec PARTY-COND-006
  // @spec PARTY-COND-007
  it('loses a character whose restoration from ashes fails, and accepts nothing after', () => {
    const party = partyOf(fighter());
    applyDamage(party, 'f1', 9999);
    applyDamage(party, 'f1', 1);
    attemptRevival(party, 'f1', { succeeds: false }); // dead -> ashes
    attemptRevival(party, 'f1', { succeeds: false }); // ashes -> lost

    expect(character(party, 'f1').condition).toBe(Condition.LOST);
    expect(attemptRevival(party, 'f1', { succeeds: true })).toBe(false);
    expect(character(party, 'f1').condition).toBe(Condition.LOST);
  });

  // @spec PARTY-COND-009
  it('leaves an unconscious character in the party, acting and defending not at all', () => {
    const party = partyOf(fighter(), cleric());
    applyDamage(party, 'f1', 9999);

    expect(roster(party).map((c) => c.id)).toContain('f1');
    expect(living(party).map((c) => c.id)).toEqual(['c1']);
  });

  // @spec PARTY-ROSTER-005
  it('keeps a lost character in the save without counting them against the roster', () => {
    const party = createParty();
    addCharacter(party, fighter());
    applyDamage(party, 'f1', 9999);
    applyDamage(party, 'f1', 1);
    attemptRevival(party, 'f1', { succeeds: false });
    attemptRevival(party, 'f1', { succeeds: false });

    expect(character(party, 'f1').condition).toBe(Condition.LOST);
    expect(roster(party).filter((c) => c.condition !== Condition.LOST)).toHaveLength(0);
    // The seat they held is free again.
    expect(addCharacter(party, cleric())).toBe(true);
  });

});

describe('advancement', () => {
  const encounter = (skills, pot = 60) => ({ pot, skillsUsed: skills });

  // @spec PARTY-XP-001
  // @spec PARTY-XP-005
  it('divides the pot equally among the distinct skills used, and awards nothing else', () => {
    const party = partyOf(fighter());

    awardEncounter(party, 'f1', encounter([Skill.BLADE, Skill.SHIELD]));

    const c = character(party, 'f1');
    expect(c.skillExperience[Skill.BLADE]).toBe(c.skillExperience[Skill.SHIELD]);
    expect(c.skillExperience[Skill.BOW] ?? 0).toBe(0);
  });

  // @spec PARTY-XP-003
  it('awards the same however many times a skill was used', () => {
    const once = partyOf(fighter());
    const many = partyOf(fighter());

    awardEncounter(once, 'f1', encounter([Skill.BLADE]));
    awardEncounter(many, 'f1', { pot: 60, skillsUsed: [Skill.BLADE, Skill.BLADE, Skill.BLADE] });

    expect(many.members[0].skillExperience[Skill.BLADE]).toBe(once.members[0].skillExperience[Skill.BLADE]);
  });

  // @spec PARTY-XP-002
  it('counts a skill whose action failed', () => {
    const party = partyOf(fighter());

    awardEncounter(party, 'f1', { pot: 60, skillsUsed: [Skill.BLADE], missed: [Skill.BLADE] });

    expect(character(party, 'f1').skillExperience[Skill.BLADE]).toBeGreaterThan(0);
  });

  // @spec PARTY-XP-004
  it('grows the pot with distinct skills, so using the whole kit is not a penalty', () => {
    const party = partyOf(fighter());

    const one = awardEncounter(party, 'f1', encounter([Skill.BLADE]));
    const two = awardEncounter(party, 'f1', encounter([Skill.BLADE, Skill.SHIELD]));

    expect(two.pot).toBeGreaterThan(one.pot);
  });

  // @spec PARTY-XP-004
  it('stops growing the pot past the ceiling, so a long fight cannot inflate it', () => {
    const party = partyOf(fighter());
    const everything = [Skill.BLADE, Skill.BLUNT, Skill.POLEARM, Skill.BOW, Skill.SHIELD,
                        Skill.HEAVY_ARMOUR, Skill.LIGHT_ARMOUR, Skill.DETECTION];

    const atCeiling = awardEncounter(party, 'f1', encounter(everything.slice(0, POT_SKILL_CEILING)));
    const wellPast = awardEncounter(party, 'f1', encounter(everything));

    // Touching twice as many skills buys no more pot at all.
    expect(wellPast.pot).toBe(atCeiling.pot);
    // And each skill's share is correspondingly thinner, so spreading never gains.
    expect(wellPast.share).toBeLessThan(atCeiling.share);
  });

  // @spec PARTY-XP-006
  it('awards a smaller pot for a weaker enemy, without awarding nothing', () => {
    const weak = partyOf(fighter());
    const strong = partyOf(fighter());

    awardEncounter(weak, 'f1', encounter([Skill.BLADE], 4));
    awardEncounter(strong, 'f1', encounter([Skill.BLADE], 400));

    expect(character(weak, 'f1').skillExperience[Skill.BLADE]).toBeGreaterThan(0);
    expect(character(strong, 'f1').skillExperience[Skill.BLADE])
      .toBeGreaterThan(character(weak, 'f1').skillExperience[Skill.BLADE]);
  });

  // @spec PARTY-SKILL-003
  it('advances nothing in a skill the class cannot train', () => {
    const party = partyOf(fighter());

    awardEncounter(party, 'f1', encounter([Skill.EVOCATION]));

    expect(character(party, 'f1').skillExperience[Skill.EVOCATION] ?? 0).toBe(0);
    expect(skillRank(character(party, 'f1'), Skill.EVOCATION)).toBe(0);
  });

  // @spec PARTY-SKILL-004
  it('advances a favoured skill faster than a tolerated one', () => {
    const party = partyOf(fighter());

    awardEncounter(party, 'f1', encounter([Skill.BLADE]));
    awardEncounter(party, 'f1', encounter([Skill.LIGHT_ARMOUR]));

    const c = character(party, 'f1');
    expect(c.skillExperience[Skill.BLADE]).toBeGreaterThan(c.skillExperience[Skill.LIGHT_ARMOUR]);
  });

  // @spec PARTY-SKILL-005
  it('never reduces a rank', () => {
    const party = partyOf(fighter());
    for (let i = 0; i < 40; i++) awardEncounter(party, 'f1', encounter([Skill.BLADE], 400));
    const high = skillRank(character(party, 'f1'), Skill.BLADE);

    changeClass(party, 'f1', CharacterClass.MAGE, { meetsRequirements: true });

    expect(skillRank(character(party, 'f1'), Skill.BLADE)).toBe(high);
  });

  // @spec PARTY-XP-007
  it('advances a skill used outside combat, which the clock has already charged for', () => {
    const party = partyOf(fighter());

    trainSkill(party, 'f1', Skill.COOKING);

    expect(character(party, 'f1').skillExperience[Skill.COOKING]).toBeGreaterThan(0);
  });

  // @spec PARTY-SKILL-001
  it('raises a rank once enough experience has accumulated', () => {
    const party = partyOf(fighter());
    const before = skillRank(character(party, 'f1'), Skill.BLADE);

    for (let i = 0; i < 30; i++) awardEncounter(party, 'f1', encounter([Skill.BLADE], 400));

    expect(skillRank(character(party, 'f1'), Skill.BLADE)).toBeGreaterThan(before);
  });
});

describe('class', () => {
  // @spec PARTY-CLASS-001
  it('defines for every class what it may train', () => {
    for (const cls of Object.values(CharacterClass)) {
      const c = createCharacter({ id: 'x', name: 'X', characterClass: cls });
      const trainable = Object.values(Skill).filter((s) => c.trainable.includes(s));
      expect(trainable.length).toBeGreaterThan(0);
      expect(trainable.length).toBeLessThan(Object.values(Skill).length);
    }
  });

  // @spec PARTY-CLASS-002
  it('keeps every rank across a class change, including ones the new class cannot train', () => {
    const party = partyOf(fighter());
    for (let i = 0; i < 30; i++) awardEncounter(party, 'f1', encounter([Skill.HEAVY_ARMOUR], 400));
    const earned = skillRank(character(party, 'f1'), Skill.HEAVY_ARMOUR);

    changeClass(party, 'f1', CharacterClass.MAGE, { meetsRequirements: true });

    // A mage cannot train heavy armour, but what was learned is not unlearned.
    expect(skillRank(character(party, 'f1'), Skill.HEAVY_ARMOUR)).toBe(earned);
    expect(character(party, 'f1').trainable).not.toContain(Skill.HEAVY_ARMOUR);
  });

  // @spec PARTY-CLASS-003
  it('refuses a class change when the requirements are not met', () => {
    const party = partyOf(fighter());

    expect(changeClass(party, 'f1', CharacterClass.MAGE, { meetsRequirements: false })).toBe(false);
    expect(character(party, 'f1').characterClass).toBe(CharacterClass.FIGHTER);
  });

  const encounter = (skills, pot = 60) => ({ pot, skillsUsed: skills });
});

describe('persistence', () => {
  // @spec PARTY-SAVE-001
  // @spec PARTY-SAVE-002
  it('round-trips the roster with condition, ranks, and experience intact', () => {
    const party = partyOf(fighter(), cleric());
    awardEncounter(party, 'f1', { pot: 400, skillsUsed: [Skill.BLADE] });
    applyDamage(party, 'c1', 9999);

    const restored = restoreParty(JSON.parse(JSON.stringify(serializeParty(party))));

    expect(roster(restored)).toHaveLength(2);
    expect(character(restored, 'c1').condition).toBe(Condition.UNCONSCIOUS);
    expect(character(restored, 'f1').skillExperience[Skill.BLADE])
      .toBe(character(party, 'f1').skillExperience[Skill.BLADE]);
    expect(skillRank(character(restored, 'f1'), Skill.BLADE))
      .toBe(skillRank(character(party, 'f1'), Skill.BLADE));
  });
});

describe('who may bring someone back', () => {
  // @spec PARTY-COND-011
  it('treats every route to revival the same, so losing the only cleric is not a dead end', () => {
    // A party cleric, a town temple, a hired cleric and a consumed scroll all arrive
    // here as the same call; only whether it worked differs.
    for (const source of ['PARTY_CLERIC', 'TOWN_TEMPLE', 'HIRED_CLERIC', 'SCROLL']) {
      const party = partyOf(fighter());
      applyDamage(party, 'f1', 9999);
      applyDamage(party, 'f1', 1);

      expect(attemptRevival(party, 'f1', { succeeds: true, source })).toBe(true);
      expect(character(party, 'f1').condition).toBe(Condition.OK);
    }
  });

  // @spec PARTY-COND-011
  it('degrades identically whichever route failed', () => {
    const byCleric = partyOf(fighter());
    const byScroll = partyOf(fighter());
    for (const party of [byCleric, byScroll]) {
      applyDamage(party, 'f1', 9999);
      applyDamage(party, 'f1', 1);
    }

    attemptRevival(byCleric, 'f1', { succeeds: false, source: 'PARTY_CLERIC' });
    attemptRevival(byScroll, 'f1', { succeeds: false, source: 'SCROLL' });

    expect(character(byCleric, 'f1').condition).toBe(character(byScroll, 'f1').condition);
    expect(character(byCleric, 'f1').condition).toBe(Condition.ASHES);
  });
});

describe('how fast a party moves', () => {
  // @spec EXPLORE-CLOCK-010
  it('costs a number of ticks to cross a tile, bounded at both ends', () => {
    const slow = partyOf(fighter({ attributes: { DEXTERITY: 1 } }));
    const quick = partyOf(fighter({ attributes: { DEXTERITY: 30 } }));

    for (const p of [slow, quick]) {
      expect(partyStepCost(p)).toBeGreaterThanOrEqual(MIN_STEP_COST);
      expect(partyStepCost(p)).toBeLessThanOrEqual(MAX_STEP_COST);
    }
    expect(partyStepCost(quick)).toBeLessThan(partyStepCost(slow));
  });

  // @spec EXPLORE-CLOCK-011
  it('never charges a nimbler party more than a slower one', () => {
    let previous = Infinity;
    for (let dex = 1; dex <= 24; dex++) {
      const cost = partyStepCost(partyOf(fighter({ attributes: { DEXTERITY: dex } })));
      expect(cost).toBeLessThanOrEqual(previous);
      previous = cost;
    }
  });

  // @spec EXPLORE-CLOCK-010
  it('averages across the party, so one slow member slows everyone', () => {
    const nimble = partyOf(
      fighter({ id: 'a', attributes: { DEXTERITY: 18 } }),
      fighter({ id: 'b', attributes: { DEXTERITY: 18 } }),
    );
    const burdened = partyOf(
      fighter({ id: 'a', attributes: { DEXTERITY: 18 } }),
      fighter({ id: 'b', attributes: { DEXTERITY: 4 } }),
    );

    expect(partyStepCost(burdened)).toBeGreaterThan(partyStepCost(nimble));
  });

  // @spec EXPLORE-CLOCK-010
  it('ignores the unconscious, who are being carried rather than walking', () => {
    const party = partyOf(
      fighter({ id: 'a', attributes: { DEXTERITY: 18 } }),
      fighter({ id: 'b', attributes: { DEXTERITY: 2 } }),
    );
    const laden = partyStepCost(party);

    applyDamage(party, 'b', 9999);

    expect(partyStepCost(party)).toBeLessThan(laden);
  });
});

describe('hit points from class and Constitution', () => {
  const at = (characterClass, constitution) => createCharacter({
    id: 'x', name: 'X', characterClass, attributes: { CONSTITUTION: constitution },
  }).maxHitPoints;

  // @spec PARTY-CHAR-006
  it('gives each class its own base at an ordinary Constitution', () => {
    expect(at(CharacterClass.FIGHTER, 10)).toBe(30);
    expect(at(CharacterClass.CLERIC, 10)).toBe(26);
    expect(at(CharacterClass.THIEF, 10)).toBe(22);
    expect(at(CharacterClass.MAGE, 10)).toBe(18);
  });

  // @spec PARTY-CHAR-006
  it('scales the class base by a twentieth per point of Constitution over ten', () => {
    // 30 x (1 + 0.05 x 8) = 42
    expect(at(CharacterClass.FIGHTER, 18)).toBe(42);
    // 18 x (1 + 0.05 x 8) = 25.2
    expect(at(CharacterClass.MAGE, 18)).toBe(Math.round(18 * 1.4));
  });

  // @spec PARTY-CHAR-006
  it('takes hit points off a Constitution below ten', () => {
    expect(at(CharacterClass.FIGHTER, 6)).toBe(Math.round(30 * 0.8));
    expect(at(CharacterClass.MAGE, 6)).toBeLessThan(at(CharacterClass.MAGE, 10));
  });

  // @spec PARTY-CHAR-006
  it('keeps the classes apart at every Constitution', () => {
    // Multiplicative, so a tough fighter gains more absolute points than a tough mage
    // and the gap between them holds rather than closing.
    const low = at(CharacterClass.FIGHTER, 6) / at(CharacterClass.MAGE, 6);
    const high = at(CharacterClass.FIGHTER, 18) / at(CharacterClass.MAGE, 18);
    expect(Math.abs(low - high)).toBeLessThan(0.1);
  });

  // @spec PARTY-CHAR-006
  it('derives them rather than taking whatever it was handed', () => {
    const c = createCharacter({
      id: 'x', name: 'X', characterClass: CharacterClass.MAGE, maxHitPoints: 999,
    });

    expect(c.maxHitPoints).toBe(18);
    expect(c.hitPoints).toBe(18);
  });

  // @spec PARTY-CHAR-006
  it('does not move them as the character advances', () => {
    const party = partyOf(createCharacter({
      id: 'x', name: 'X', characterClass: CharacterClass.FIGHTER,
    }));
    const before = character(party, 'x').maxHitPoints;

    for (let i = 0; i < 40; i++) trainSkill(party, 'x', Skill.BLADE, 300);

    expect(character(party, 'x').maxHitPoints).toBe(before);
  });
});

describe('what a rank costs', () => {
  const trained = (amount) => {
    const party = partyOf(createCharacter({
      id: 'x', name: 'X', characterClass: CharacterClass.FIGHTER,
    }));
    // Blade trains at the Fighter's own rate, so ask for the rate back out of it.
    trainSkill(party, 'x', Skill.BLADE, amount);
    return character(party, 'x');
  };

  // @spec PARTY-SKILL-007
  // @spec PARTY-SKILL-011
  it('raises a rank at three hundred times the rank being left', () => {
    // Counting from rank zero: 0 to stand at 1, 300 to stand at 2, 900 to stand at 3.
    expect(experienceForRank(1)).toBe(0);
    expect(experienceForRank(2)).toBe(300);
    expect(experienceForRank(3)).toBe(900);
    expect(experienceForRank(4)).toBe(1800);
  });

  // @spec PARTY-SKILL-007
  it('costs more to leave each rank than the one before it', () => {
    for (let r = 1; r < 10; r++) {
      const step = experienceForRank(r + 1) - experienceForRank(r);
      expect(step).toBe(300 * r);
    }
  });

  // @spec PARTY-SKILL-011
  it('charges the same for a rank a class granted as for one that was earned', () => {
    // A Fighter opens Blade at 2 without paying for it, but leaving 2 still costs what
    // leaving 2 costs anybody.
    const fighter = createCharacter({ id: 'f', name: 'F', characterClass: CharacterClass.FIGHTER });
    expect(fighter.ranks[Skill.BLADE]).toBeGreaterThanOrEqual(2);
    expect(fighter.skillExperience[Skill.BLADE] ?? 0).toBe(0);
  });

  // @spec PARTY-SKILL-006
  it('caps a rank at ten however much is poured into it', () => {
    const c = trained(1000000);

    expect(c.ranks[Skill.BLADE]).toBe(10);
  });

  // @spec PARTY-SKILL-006
  it('caps a rank a file tried to author above ten', () => {
    const c = createCharacter({
      id: 'x', name: 'X', characterClass: CharacterClass.FIGHTER, ranks: { [Skill.BLADE]: 40 },
    });

    expect(c.ranks[Skill.BLADE]).toBe(10);
  });

  // @spec PARTY-SKILL-006
  it('keeps accumulating experience past the cap without awarding a rank', () => {
    const c = trained(1000000);
    const banked = c.skillExperience[Skill.BLADE];

    expect(banked).toBeGreaterThan(experienceForRank(10));
    expect(c.ranks[Skill.BLADE]).toBe(10);
  });
});

describe('what total level decides', () => {
  // @spec PARTY-CHAR-012
  it('decides no reward: the pot is the enemies, not the party that beat them', () => {
    const green = partyOf(createCharacter({
      id: 'x', name: 'X', characterClass: CharacterClass.FIGHTER,
    }));
    const veteran = partyOf(createCharacter({
      id: 'x', name: 'X', characterClass: CharacterClass.FIGHTER,
      ranks: { [Skill.BLADE]: 9, [Skill.HEAVY_ARMOUR]: 9, [Skill.SHIELD]: 9 },
    }));
    expect(totalLevel(character(veteran, 'x'))).toBeGreaterThan(totalLevel(character(green, 'x')));

    const award = { pot: 400, skillsUsed: [Skill.BLADE] };
    awardEncounter(green, 'x', award);
    awardEncounter(veteran, 'x', award);

    // The same fight pays the same experience to both.
    expect(character(veteran, 'x').skillExperience[Skill.BLADE])
      .toBe(character(green, 'x').skillExperience[Skill.BLADE]);
  });

  // @spec PARTY-CHAR-012
  it('decides no body: hit points come from class and Constitution alone', () => {
    const green = createCharacter({ id: 'a', name: 'A', characterClass: CharacterClass.MAGE });
    const veteran = createCharacter({
      id: 'b', name: 'B', characterClass: CharacterClass.MAGE,
      ranks: { [Skill.ARCANA]: 10, [Skill.BLADE]: 10 },
    });

    expect(totalLevel(veteran)).toBeGreaterThan(totalLevel(green));
    expect(veteran.maxHitPoints).toBe(green.maxHitPoints);
  });

  // @spec PARTY-CHAR-010
  // @spec PARTY-CHAR-012
  it('is a summary that follows the ranks rather than a number anything is spent on', () => {
    const party = partyOf(createCharacter({
      id: 'x', name: 'X', characterClass: CharacterClass.FIGHTER,
    }));
    const before = totalLevel(character(party, 'x'));

    for (let i = 0; i < 20; i++) trainSkill(party, 'x', Skill.BLADE, 300);

    // It moved because a rank moved, and for no other reason.
    const c = character(party, 'x');
    expect(totalLevel(c)).toBe(Object.values(c.ranks).reduce((sum, r) => sum + r, 0));
    expect(totalLevel(c)).toBeGreaterThan(before);
  });
});
