import { describe, it, expect } from 'vitest';
import {
  createParty, createCharacter, addCharacter, applyDamage, equip, character,
  trainSkill, totalLevel, CharacterClass, Skill, Condition, RANK_CAP, stow,
} from '../sim/party.js';
import { ItemKind, Slot, createItem } from '../sim/items.js';
import { MIN_TAP_PX, contentColumn, uiScale, versionStamp } from './geometry.js';
import { buildPartyPlan, PartyControl } from './partyplan.js';

const phone = { width: 390, height: 780 };
const desktop = { width: 1600, height: 900 };

const sword = createItem({
  id: 'shortsword', name: 'Shortsword', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
  skill: Skill.BLADE, damage: 8,
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
  stow(party, sword);
  equip(party, 'bram', sword);
  return party;
}

const inside = (inner, outer) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5
  && inner.x + inner.width <= outer.x + outer.width + 0.5
  && inner.y + inner.height <= outer.y + outer.height + 0.5;

describe('the party screen page', () => {
  // @spec PRESENT-BUILD-002
  it('leaves the foot of the screen to the build stamp', () => {
    for (const viewport of [phone, desktop]) {
      const { bounds } = buildPartyPlan(fourOf(), viewport, { page: 0 });

      const stamp = versionStamp({
        viewport, controls: [bounds], text: 'Build 999', scale: uiScale(viewport),
      });

      expect(stamp.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
      expect(stamp.y + stamp.size).toBeLessThanOrEqual(viewport.height);
    }
  });

  // @spec PRESENT-PARTY-020
  it('puts New campaign at the end of the page, to the right, after everything about the character', () => {
    const short = { width: 390, height: 560 };
    const plan = buildPartyPlan(fourOf(), short, { page: 0, scroll: 1e5 });
    const control = plan.controls.find((c) => c.role === PartyControl.NEW_CAMPAIGN);
    const lastSkill = plan.skills.at(-1).skills.at(-1);

    expect(control.x).toBeGreaterThan(plan.bounds.x + plan.bounds.width / 2);
    expect(inside(control, plan.area)).toBe(true);
    expect(control.y).toBeGreaterThan(lastSkill.bar.y);
  });

  // @spec PRESENT-PARTY-034
  it('scrolls everything under the name within its window, leaving the name and the foot in place', () => {
    const short = { width: 390, height: 560 };
    const top = buildPartyPlan(fourOf(), short, { page: 0 });
    const down = buildPartyPlan(fourOf(), short, { page: 0, scroll: 60 });
    const foot = (plan) => plan.controls.filter((c) => !c.scrolls).map((c) => [c.role, c.y]);

    expect(top.maxScroll).toBeGreaterThan(60);
    expect(down.scroll).toBe(60);
    expect(down.health.box.y).toBeCloseTo(top.health.box.y - 60);
    expect(down.title).toEqual(top.title);
    expect(foot(down)).toEqual(foot(top));
    expect(down.clip).toEqual(down.area);
    expect(down.scrollbar.thumb.y).toBeGreaterThan(top.scrollbar.thumb.y);
    expect(buildPartyPlan(fourOf(), short, { page: 0, scroll: 1e5 }).scroll).toBe(top.maxScroll);
    expect(buildPartyPlan(fourOf(), desktop, { page: 0 }).scrollbar).toBeNull();
  });

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

    character(party, 'wren').spentCharges = 1;
    applyDamage(party, 'bram', 9999);
    const down = buildPartyPlan(party, phone, { page: 0 }).health;
    expect(character(party, 'bram').condition).toBe(Condition.UNCONSCIOUS);
    expect(down.condition).toBe('Unconscious');
  });

  // @spec PRESENT-PARTY-014
  it('shows all five attributes, named in full, with their scores', () => {
    const plan = buildPartyPlan(fourOf(), phone, { page: 0 });

    expect(plan.attributes.map((a) => a.label)).toEqual([
      'Might', 'Constitution', 'Dexterity', 'Intellect', 'Resolve',
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
    expect(plan.skills.map((g) => g.label)).toEqual(['Class', 'Weapon', 'Survival']);
    const blade = plan.skills[1].skills.find((s) => s.skill === Skill.BLADE);
    expect(blade).toMatchObject({ label: 'Blade', rank: 2 });
  });

  // @spec PRESENT-PARTY-016
  it('draws the progress the party segment reports, and marks the cap', () => {
    const party = fourOf();
    // Rank 2 stands at 300 and rank 3 at 900: 600 banked is halfway between.
    trainSkill(party, 'bram', Skill.BLADE, 600);
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

  // @spec PRESENT-PARTY-015
  it('leads the skills with the class skill, in its own group', () => {
    const first = buildPartyPlan(fourOf(), phone, { page: 0 }).skills[0];
    expect(first.group).toBe('CLASS');
    expect(first.skills.map((s) => s.skill)).toEqual([Skill.IRONCLAD]);
  });

  // @spec PRESENT-PARTY-026
  it('shows a cleric the Intercession charges left beside the rank', () => {
    const party = fourOf();
    const wren = buildPartyPlan(party, phone, { page: 3 }).skills[0].skills[0];
    expect(wren).toMatchObject({ skill: Skill.INTERCESSION, charges: 1 });
    applyDamage(party, 'bram', 999);
    expect(buildPartyPlan(party, phone, { page: 3 }).skills[0].skills[0].charges).toBe(0);
    expect(buildPartyPlan(party, phone, { page: 0 }).skills[0].skills[0].charges).toBeUndefined();
  });

  // @spec PRESENT-PARTY-018
  it('shows every equipment slot under the hit points, above the attributes, with its item and numbers', () => {
    const plan = buildPartyPlan(fourOf(), phone, { page: 0 });

    expect(plan.equipment.map((e) => e.slot)).toEqual(Object.values(Slot));
    expect(plan.equipment.find((e) => e.slot === Slot.MAIN_HAND)).toMatchObject({
      label: 'Main hand', item: 'Shortsword', detail: 'Main hand · Blade · damage 8',
    });
    expect(plan.equipment.find((e) => e.slot === Slot.BODY)).toMatchObject({ item: null, detail: null });
    const top = Math.min(...plan.equipment.map((e) => e.box.y));
    const bottom = Math.max(...plan.equipment.map((e) => e.box.y + e.box.height));
    expect(top).toBeGreaterThan(plan.health.bar.y);
    expect(bottom).toBeLessThanOrEqual(Math.min(...plan.attributes.map((a) => a.box.y)));
  });

  // @spec PRESENT-PARTY-027
  // @spec PRESENT-PARTY-028
  it('makes every slot a control, and marks the highlighted one', () => {
    const plan = buildPartyPlan(fourOf(), phone, { page: 0, selectedSlot: 2 });
    const slots = plan.controls.filter((c) => c.role === PartyControl.SLOT);

    expect(slots.map((c) => c.slot)).toEqual(Object.values(Slot));
    expect(plan.equipment.map((e) => e.selected)).toEqual([false, false, true]);
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
  it('offers paging, closing, a new campaign and the slots, every one thumb-sized, and nothing else', () => {
    const plan = buildPartyPlan(fourOf(), phone, { page: 0 });

    expect(plan.controls.map((c) => c.role).sort()).toEqual([
      PartyControl.CLOSE, PartyControl.NEW_CAMPAIGN, PartyControl.NEXT, PartyControl.PREVIOUS, PartyControl.TESTING,
      ...Object.values(Slot).map(() => PartyControl.SLOT),
    ].sort());
    for (const c of plan.controls) {
      expect(c.width).toBeGreaterThanOrEqual(MIN_TAP_PX);
      expect(c.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
    }
    expect(plan.controls.find((c) => c.role === PartyControl.CLOSE).hint).toBe('Esc');
  });
});

describe('where the page controls sit', () => {
  // @spec PRESENT-PARTY-024
  it('puts previous, Close and next in one row along the foot, the name at the head', () => {
    const plan = buildPartyPlan(fourOf(), phone, { page: 0 });
    const of = (role) => plan.controls.find((c) => c.role === role);
    const prev = of(PartyControl.PREVIOUS);
    const close = of(PartyControl.CLOSE);
    const next = of(PartyControl.NEXT);
    const foot = plan.bounds.y + plan.bounds.height;

    for (const c of [prev, close, next]) {
      expect(c.y).toBe(prev.y);
      expect(c.y + c.height).toBeLessThanOrEqual(foot);
      expect(c.y).toBeGreaterThan(plan.bounds.y + plan.bounds.height / 2);
    }
    expect(prev.x).toBeLessThan(close.x);
    expect(close.x + close.width).toBeLessThan(next.x);
    expect(Math.abs((close.x + close.width / 2) - (plan.bounds.x + plan.bounds.width / 2))).toBeLessThan(1);

    // The name runs across the head, above everything else on the page.
    expect(plan.heading.title.y).toBeLessThan(plan.heading.box.y);
    expect(plan.heading.title.width).toBeGreaterThan(plan.bounds.width / 2);

    // New campaign stays clear of the row.
    const fresh = of(PartyControl.NEW_CAMPAIGN);
    expect(fresh.y + fresh.height).toBeLessThanOrEqual(prev.y);
  });
});
