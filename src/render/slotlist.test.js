import { describe, it, expect, vi } from 'vitest';
import { createFloor, Direction } from '../sim/floor.js';
import { createExploration, tickCount } from '../sim/exploration.js';
import {
  createParty, createCharacter, addCharacter, character, packOf, stow, equip, CharacterClass, Skill,
} from '../sim/party.js';
import { ItemCategory, ItemKind, Slot, createItem } from '../sim/items.js';
import {
  createController, pressKey, pressPointer, releasePointer, dragPointer, layers,
} from './controller.js';
import { buildSlotListPlan, ItemsControl } from './itemsplan.js';
import { PartyControl } from './partyplan.js';

const viewport = { width: 800, height: 600 };

const sword = () => createItem({
  id: 'shortsword', name: 'Shortsword', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
  category: ItemCategory.LIGHT_WEAPON, skill: Skill.BLADE, damage: 9,
});
const dagger = () => createItem({
  id: 'dagger', name: 'Dagger', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
  category: ItemCategory.LIGHT_WEAPON, skill: Skill.BLADE, damage: 6,
});
const wand = () => createItem({
  id: 'wand', name: 'Wand', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
  category: ItemCategory.WAND, skill: 'MAGIC', damage: 7,
});
const mail = () => createItem({
  id: 'chainmail', name: 'Chainmail', kind: ItemKind.ARMOUR, slot: Slot.BODY,
  category: ItemCategory.HEAVY_ARMOUR, armour: 5,
});

/** Bram the fighter holding a sword; the pack a dagger, a wand and chainmail. */
function harness() {
  const floor = createFloor({ id: 'f1', width: 7, height: 7 });
  const state = createExploration({
    floors: [floor], floorId: 'f1', tile: { x: 3, y: 3 }, facing: Direction.NORTH,
  });
  const party = createParty();
  for (const [id, cls] of [
    ['bram', CharacterClass.FIGHTER], ['tam', CharacterClass.THIEF],
    ['isolde', CharacterClass.MAGE], ['wren', CharacterClass.CLERIC],
  ]) addCharacter(party, createCharacter({ id, name: id, characterClass: cls }));
  const blade = sword();
  stow(party, blade);
  equip(party, 'bram', blade);
  stow(party, dagger());
  stow(party, wand());
  stow(party, mail());
  const campaign = { encounter: null, state, party };
  const controller = createController({ state, campaign, viewport, onDraw: vi.fn() });
  return { controller, state, party };
}

const sheet = (controller) => layers(controller).find((l) => l.name === 'party').plan;
const list = (controller) => {
  const plan = layers(controller).find((l) => l.name === 'items').plan;
  return plan?.mode === 'SLOT' ? plan : null;
};
const tap = (controller, box) => {
  const pressed = pressPointer(controller, box.x + box.width / 2, box.y + box.height / 2);
  return releasePointer(controller) || pressed;
};
const tapSlot = (controller, slot) =>
  tap(controller, sheet(controller).controls.find((c) => c.role === PartyControl.SLOT && c.slot === slot));
const row = (controller, name) => list(controller).entries.find((e) => e.kind === 'ROW' && e.name === name);

describe('a slot on the party screen', () => {
  // @spec PRESENT-PARTY-027
  it('opens the list of what fits it when pressed', () => {
    const { controller } = harness();
    pressKey(controller, 'p');

    tapSlot(controller, Slot.MAIN_HAND);

    expect(list(controller)).toMatchObject({ characterId: 'bram', slot: Slot.MAIN_HAND });
    expect(list(controller).title).toMatchObject({ name: 'bram', position: 'Main hand' });
    expect(sheet(controller)).toBeNull();
  });

  // @spec PRESENT-PARTY-027
  // @spec PRESENT-PARTY-028
  it('is reached by the keyboard: W and S walk the slots, Enter opens one', () => {
    const { controller } = harness();
    pressKey(controller, 'p');

    pressKey(controller, 'w');
    expect(sheet(controller).equipment[0].selected).toBe(true);
    for (let i = 0; i < 5; i++) pressKey(controller, 's');
    expect(sheet(controller).equipment[2].selected).toBe(true);

    pressKey(controller, 'Enter');
    expect(list(controller).slot).toBe(Slot.BODY);
  });
});

describe('the slot list', () => {
  // @spec PRESENT-PARTY-029
  // @spec PRESENT-PARTY-030
  it('offers taking off what is worn, then every pack item for the slot, greying what may not be wielded', () => {
    const { party } = harness();
    const plan = buildSlotListPlan(party, viewport, { characterId: 'bram', slot: Slot.MAIN_HAND });
    const rows = plan.entries.filter((e) => e.kind === 'ROW');

    expect(rows.map((r) => r.name)).toEqual(['Take off Shortsword', 'Dagger', 'Wand']);
    expect(rows[1]).toMatchObject({ available: true, greyed: false, detail: 'Main hand · Blade · damage 6' });
    expect(rows[2]).toMatchObject({ available: false, greyed: true });
    expect(rows[2].detail).toMatch(/only$/);
    expect(plan.controls.filter((c) => c.kind === 'BUTTON').map((c) => c.role)).toEqual([ItemsControl.BACK]);
  });

  // @spec PRESENT-PARTY-029
  it('says when nothing fits', () => {
    const { party } = harness();
    const plan = buildSlotListPlan(party, viewport, { characterId: 'bram', slot: Slot.OFF_HAND });

    expect(plan.entries.filter((e) => e.kind === 'ROW')).toEqual([]);
    expect(plan.entries.find((e) => e.kind === 'NOTE').text).toMatch(/Nothing/);
  });

  // @spec PRESENT-PARTY-031
  it('puts an item on for a tick, the worn one into the pack, and closes back to the page', () => {
    const { controller, party, state } = harness();
    pressKey(controller, 'p');
    tapSlot(controller, Slot.MAIN_HAND);

    tap(controller, row(controller, 'Dagger').box);

    expect(character(party, 'bram').equipment[Slot.MAIN_HAND].name).toBe('Dagger');
    expect(packOf(party).map((i) => i.name)).toContain('Shortsword');
    expect(tickCount(state)).toBe(1);
    expect(list(controller)).toBeNull();
    expect(sheet(controller).equipment[0].item).toBe('Dagger');
  });

  // @spec PRESENT-PARTY-031
  it('takes off what is worn for a tick', () => {
    const { controller, party, state } = harness();
    pressKey(controller, 'p');
    tapSlot(controller, Slot.MAIN_HAND);

    tap(controller, row(controller, 'Take off Shortsword').box);

    expect(character(party, 'bram').equipment[Slot.MAIN_HAND]).toBeUndefined();
    expect(packOf(party).map((i) => i.name)).toContain('Shortsword');
    expect(tickCount(state)).toBe(1);
  });

  // @spec PRESENT-PARTY-030
  it('does nothing for an item the character may not wield', () => {
    const { controller, party, state } = harness();
    pressKey(controller, 'p');
    tapSlot(controller, Slot.MAIN_HAND);

    tap(controller, row(controller, 'Wand').box);

    expect(character(party, 'bram').equipment[Slot.MAIN_HAND].name).toBe('Shortsword');
    expect(tickCount(state)).toBe(0);
    expect(list(controller)).not.toBeNull();
  });

  // @spec PRESENT-PARTY-032
  it('closes on Escape or Back, changing nothing', () => {
    for (const back of [
      (c) => pressKey(c, 'Escape'),
      (c) => tap(c, list(c).controls.find((k) => k.role === ItemsControl.BACK)),
    ]) {
      const { controller, state } = harness();
      pressKey(controller, 'p');
      tapSlot(controller, Slot.BODY);

      back(controller);

      expect(list(controller)).toBeNull();
      expect(sheet(controller)).not.toBeNull();
      expect(tickCount(state)).toBe(0);
    }
  });

  // @spec PRESENT-PARTY-033
  it('moves and presses its highlight by the keyboard', () => {
    const { controller, party } = harness();
    pressKey(controller, 'p');
    pressKey(controller, 'Enter');

    for (let i = 0; i < 5; i++) pressKey(controller, 's');
    expect(list(controller).selected).toBe(2);
    pressKey(controller, 'w');
    pressKey(controller, ' ');

    expect(character(party, 'bram').equipment[Slot.MAIN_HAND].name).toBe('Dagger');
  });
});

describe('a long character page', () => {
  // @spec PRESENT-PARTY-034
  it('scrolls by drag, and presses a slot only when a still finger lifts', () => {
    const { controller } = harness();
    controller.viewport = { width: 390, height: 520 };
    pressKey(controller, 'p');
    const page = sheet(controller);
    expect(page.maxScroll).toBeGreaterThan(0);
    const slot = page.controls.find((c) => c.role === PartyControl.SLOT && c.slot === Slot.BODY);
    const [x, y] = [slot.x + slot.width / 2, slot.y + slot.height / 2];

    pressPointer(controller, x, y);
    expect(list(controller)).toBeNull();
    dragPointer(controller, x, y - 50);
    releasePointer(controller);
    expect(list(controller)).toBeNull();
    expect(sheet(controller).scroll).toBeCloseTo(50);

    const moved = sheet(controller).controls.find((c) => c.role === PartyControl.SLOT && c.slot === Slot.BODY);
    tap(controller, moved);
    expect(list(controller).slot).toBe(Slot.BODY);
  });
});
