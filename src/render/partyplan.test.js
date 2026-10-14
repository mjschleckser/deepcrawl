import { describe, it, expect } from 'vitest';
import {
  createParty, createCharacter, addCharacter, applyDamage, changeClass, equip, character,
  trainSkill, totalLevel, CharacterClass, Skill, Condition, RANK_CAP,
} from '../sim/party.js';
import { ItemKind, Slot, createItem } from '../sim/items.js';
import { MIN_TAP_PX, contentColumn } from './geometry.js';
import { buildPartyPlan, PartyControl } from './partyplan.js';

const phone = { width: 390, height: 780 };
const desktop = { width: 1600, height: 900 };

const sword = createItem({
  id: 'shortsword', name: 'Shortsword', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
  skill: Skill.BLADE, damage: 8, accuracy: 20,
});

function fourOf() {
  const party = createParty();
  addCharacter(party, createCharacter({
    id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER,
    attributes: { DEXTERITY: 13 }, portrait: 'fighter.png',
  }));
  addCharacter(party, createCharacter({ id: 'tam', name: 'Tam', characterClass: CharacterClass.THIEF }));
  addCharacter(party, createCharacter({ id: 'isolde', name: 'Isolde', characterClass: CharacterClass.MAGE }));
  addCharacter(party, createCharacter({ id: 'wren', name: 'Wren', characterClass: CharacterClass.CLERIC }));
  equip(party, 'bram', sword);
  return party;
}

const inside = (inner, outer) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5
  && inner.x + inner.width <= outer.x + outer.width + 0.5
  && inner.y + inner.height <= outer.y + outer.height + 0.5;

describe('the party screen page', () => {
  // @spec PRESENT-PARTY-007
  it('draws one character at a time, within the centred column', () => {
    for (const viewport of [phone, desktop]) {
      const plan = buildPartyPlan(fourOf(), viewport, { page: 0 });
      const column = contentColumn(viewport);

      expect(plan.characterId).toBe('bram');
      expect(plan.bounds.x).toBeGreaterThanOrEqual(column.x - 0.5);
      expect(plan.bounds.x + plan.bounds.width).toBeLessThanOrEqual(column.x + column.width + 0.5);
      expect(inside(plan.bounds, { x: 0, y: 0, ...viewport })).toBe(true);
    }
  });

  // @spec PRESENT-PARTY-012
  it('heads the page with portrait, name, class, total level and place in the party', () => {
    const party = fourOf();
    const plan = buildPartyPlan(party, phone, { page: 0 });

    expect(plan.heading).toMatchObject({
      name: 'Bram',
      characterClass: 'Fighter',
      totalLevel: totalLevel(character(party, 'bram')),
      position: '1 / 4',
      portrait: 'fighter.png',
    });
    expect(buildPartyPlan(party, phone, { page: 2 }).heading.position).toBe('3 / 4');
  });

  // @spec PRESENT-PARTY-013
  it('shows hit points with a bar, and names any condition but conscious', () => {
    const party = fourOf();
    applyDamage(party, 'bram', 5);
    const hurt = buildPartyPlan(party, phone, { page: 0 }).health;
    const max = character(party, 'bram').maxHitPoints;

    expect(hurt).toMatchObject({ hitPoints: max - 5, maxHitPoints: max, condition: null });
    expect(hurt.share).toBeCloseTo((max - 5) / max);

    applyDamage(party, 'bram', 9999);
    const down = buildPartyPlan(party, phone, { page: 0 }).health;
    expect(character(party, 'bram').condition).toBe(Condition.UNCONSCIOUS);
    expect(down.condition).toBe('Unconscious');
  });

  // @spec PRESENT-PARTY-014
  it('shows all six attributes, named in full, with their scores', () => {
    const plan = buildPartyPlan(fourOf(), phone, { page: 0 });

    expect(plan.attributes.map((a) => a.label)).toEqual([
      'Might', 'Constitution', 'Dexterity', 'Intellect', 'Perception', 'Resolve',
    ]);
    expect(plan.attributes.find((a) => a.label === 'Dexterity').score).toBe(13);
    expect(plan.attributes.find((a) => a.label === 'Might').score).toBe(10);
  });

  // @spec PRESENT-PARTY-015
  it('lists every skill held at rank 1 or more, in the party segment\'s groups and order', () => {
    const party = fourOf();
    const bram = character(party, 'bram');
    const plan = buildPartyPlan(party, phone, { page: 0 });

    const shown = plan.skills.flatMap((g) => g.skills.map((s) => s.skill));
    const held = Object.entries(bram.ranks).filter(([, r]) => r >= 1).map(([s]) => s);
    expect([...shown].sort()).toEqual([...held].sort());

    // Groups appear in the segment's order, and only where something is in them.
    expect(plan.skills.map((g) => g.label)).toEqual(['Weapon', 'Defence', 'Survival']);
    const blade = plan.skills[0].skills.find((s) => s.skill === Skill.BLADE);
    expect(blade).toMatchObject({ label: 'Blade', rank: 2 });
  });

  // @spec PRESENT-PARTY-016
  it('draws the progress the party segment reports, and marks the cap', () => {
    const party = fourOf();
    trainSkill(party, 'bram', Skill.BLADE, 300);
    const skill = (plan, s) => plan.skills.flatMap((g) => g.skills).find((x) => x.skill === s);

    const blade = skill(buildPartyPlan(party, phone, { page: 0 }), Skill.BLADE);
    expect(blade.progress).toBeCloseTo(0.5);
    expect(blade.atCap).toBe(false);

    const capped = createParty();
    addCharacter(capped, createCharacter({
      id: 'old', name: 'Old', characterClass: CharacterClass.FIGHTER, ranks: { [Skill.BLADE]: RANK_CAP },
    }));
    const top = skill(buildPartyPlan(capped, phone, { page: 0 }), Skill.BLADE);
    expect(top).toMatchObject({ rank: RANK_CAP, progress: 1, atCap: true });
  });

  // @spec PRESENT-PARTY-017
  it('marks a skill the class cannot train as no longer advancing', () => {
    const party = fourOf();
    // A Fighter turned Mage keeps Heavy Armour, which a Mage cannot train.
    changeClass(party, 'bram', CharacterClass.MAGE, { meetsRequirements: true });
    const skills = buildPartyPlan(party, phone, { page: 0 }).skills.flatMap((g) => g.skills);

    expect(skills.find((s) => s.skill === Skill.HEAVY_ARMOUR).advancing).toBe(false);
    expect(skills.find((s) => s.skill === Skill.LIGHT_ARMOUR).advancing).toBe(true);
  });

  // @spec PRESENT-PARTY-018
  it('shows every equipment slot, with the item in it or a mark that it is empty', () => {
    const plan = buildPartyPlan(fourOf(), phone, { page: 0 });

    expect(plan.equipment.map((e) => e.slot)).toEqual(Object.values(Slot));
    expect(plan.equipment.find((e) => e.slot === Slot.MAIN_HAND)).toMatchObject({ label: 'Main hand', item: 'Shortsword' });
    expect(plan.equipment.find((e) => e.slot === Slot.BODY).item).toBeNull();
  });

  // @spec PRESENT-PARTY-007
  it('places everything on the page inside it, at phone size', () => {
    const party = fourOf();
    for (let page = 0; page < 4; page++) {
      const plan = buildPartyPlan(party, phone, { page });
      const placed = [
        plan.heading.box, plan.health.box, plan.health.bar,
        ...plan.attributes.map((a) => a.box),
        ...plan.skills.flatMap((g) => [g.box, ...g.skills.flatMap((s) => [s.box, s.bar])]),
        ...plan.equipment.map((e) => e.box),
        ...plan.controls,
      ];
      for (const box of placed) expect(inside(box, plan.bounds)).toBe(true);
    }
  });

  // @spec PRESENT-PARTY-009
  // @spec PRESENT-PARTY-010
  // @spec PRESENT-PARTY-019
  it('offers previous, next and close, every one thumb-sized, and nothing that changes anybody', () => {
    const plan = buildPartyPlan(fourOf(), phone, { page: 0 });

    expect(plan.controls.map((c) => c.role).sort()).toEqual(
      [PartyControl.CLOSE, PartyControl.NEXT, PartyControl.PREVIOUS].sort(),
    );
    for (const c of plan.controls) {
      expect(c.width).toBeGreaterThanOrEqual(MIN_TAP_PX);
      expect(c.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
    }
    expect(plan.controls.find((c) => c.role === PartyControl.CLOSE).hint).toBe('Esc');
  });
});
