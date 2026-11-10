import { describe, it, expect, vi } from 'vitest';
import { createFloor, Direction } from '../sim/floor.js';
import { createExploration, partyPosition, tickCount } from '../sim/exploration.js';
import {
  createParty, createCharacter, addCharacter, character, packOf, stow, equip,
  CharacterClass, Skill, addGold, applyDamage,
} from '../sim/party.js';
import { ItemCategory, ItemKind, Rarity, Slot, createItem } from '../sim/items.js';
import { RARITY_COLOURS } from './appconfig.js';
import { beginEncounter, createEnemy, createEnemyGroup, readinessOf } from '../sim/combat.js';
import { makeRng } from '../sim/rng.js';
import { MIN_TAP_PX } from './geometry.js';
import {
  createController, pressKey, pressPointer, releasePointer, dragPointer, scrollItems, layers,
} from './controller.js';
import { MapMode } from './mapplan.js';
import {
  buildItemsPlan, buildItemPagePlan, itemDetail, ItemsControl, ItemsSection,
} from './itemsplan.js';
import {
  createFightController, chooseOption, FightAction, FightPhase, OPTION_SLOTS,
} from './fight.js';

const viewport = { width: 800, height: 600 };
const phone = { width: 390, height: 780 };

const sword = () => createItem({
  id: 'shortsword', name: 'Shortsword', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
  skill: Skill.BLADE, damage: 9,
});
const dagger = () => createItem({
  id: 'dagger', name: 'Dagger', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND,
  skill: Skill.BLADE, damage: 6,
});
const mail = () => createItem({
  id: 'chainmail', name: 'Chainmail', kind: ItemKind.ARMOUR, slot: Slot.BODY,
  category: ItemCategory.HEAVY_ARMOUR, armour: 5,
});
const shield = () => createItem({
  id: 'round_shield', name: 'Round shield', kind: ItemKind.SHIELD, slot: Slot.OFF_HAND, armour: 1,
});

/** Bram the fighter holding a sword, and a pack of a dagger and chainmail. */
function fourOf() {
  const party = createParty();
  for (const [id, cls] of [
    ['bram', CharacterClass.FIGHTER], ['tam', CharacterClass.THIEF],
    ['isolde', CharacterClass.MAGE], ['wren', CharacterClass.CLERIC],
  ]) addCharacter(party, createCharacter({ id, name: id, characterClass: cls }));
  // Wren's Intercession is spent, so a knock-out in these tests stays one.
  character(party, 'wren').spentCharges = 1;
  const blade = sword();
  stow(party, blade);
  equip(party, 'bram', blade);
  stow(party, dagger());
  stow(party, mail());
  return party;
}

function harness() {
  const floor = createFloor({ id: 'f1', width: 7, height: 7 });
  const state = createExploration({
    floors: [floor], floorId: 'f1', tile: { x: 3, y: 3 }, facing: Direction.NORTH,
  });
  const party = fourOf();
  const campaign = { encounter: null, state, party };
  const onDraw = vi.fn();
  const controller = createController({ state, campaign, viewport, onDraw });
  return { controller, state, party, campaign };
}

const screen = (controller) => layers(controller).find((l) => l.name === 'items').plan;
const tapTab = (controller, section) =>
  tap(controller, screen(controller).tabs.find((t) => t.section === section));
const tapChoice = (controller, name) => tap(controller, rowFor(controller, name).box);
const rows = (controller) => screen(controller).entries.filter((e) => e.kind === 'ROW');
const rowFor = (controller, name) => rows(controller).find((r) => r.name === name);
const tap = (controller, box) => {
  const pressed = pressPointer(controller, box.x + box.width / 2, box.y + box.height / 2);
  const released = releasePointer(controller);
  return pressed || released;
};
const tapRow = (controller, name) => tap(controller, rowFor(controller, name).box);
const tapControl = (controller, role) =>
  tap(controller, screen(controller).controls.find((c) => c.role === role));

const potion = (over = {}) => createItem({
  id: 'minor_healing_potion', name: 'Minor Healing Potion', kind: ItemKind.CONSUMABLE,
  effect: { heal: 8 }, ...over,
});
const ration = () => createItem({ id: 'ration', name: 'Ration', kind: ItemKind.FOOD, nourish: 600, heal: 2 });

/** A pack with something in every section. */
function stocked() {
  const party = fourOf();
  stow(party, potion());
  stow(party, ration());
  stow(party, potion());
  return party;
}
const names = (plan) => plan.entries.filter((e) => e.kind === 'ROW').map((e) => e.name);

describe('the Items screen\'s sections', () => {
  // @spec PRESENT-ITEMS-005
  // @spec PRESENT-ITEMS-006
  it('sorts the pack into All, Equipment, Consumables and Food, and lists nothing worn', () => {
    const party = stocked();
    const plan = (section) => buildItemsPlan(party, viewport, { section });

    expect(plan(ItemsSection.ALL).tabs.map((t) => t.label)).toEqual(['All', 'Equipment', 'Consumables', 'Food']);
    expect(plan(ItemsSection.ALL).tabs.find((t) => t.selected).section).toBe(ItemsSection.ALL);
    expect(names(plan(ItemsSection.ALL))).toEqual(['Dagger', 'Chainmail', 'Minor Healing Potion ×2', 'Ration']);
    expect(names(plan(ItemsSection.EQUIPMENT))).toEqual(['Dagger', 'Chainmail']);
    expect(names(plan(ItemsSection.CONSUMABLES))).toEqual(['Minor Healing Potion ×2']);
    expect(names(plan(ItemsSection.FOOD))).toEqual(['Ration']);
    // Bram's sword is worn, so it is not in the pack.
    expect(names(plan(ItemsSection.ALL))).not.toContain('Shortsword');
  });

  // @spec PRESENT-ITEMS-006
  it('says when a section holds nothing', () => {
    const plan = buildItemsPlan(fourOf(), viewport, { section: ItemsSection.FOOD });
    expect(plan.entries.find((e) => e.kind === 'NOTE').text).toBe('Nothing here');
  });

  // @spec PRESENT-ITEMS-007
  // @spec PRESENT-ITEMS-025
  // @spec PRESENT-ITEMS-008
  it('writes each item\'s numbers beneath it, and greys nothing', () => {
    const party = stocked();
    const plan = buildItemsPlan(party, viewport, { section: ItemsSection.ALL });
    const row = (name) => plan.entries.find((e) => e.name === name);

    expect(row('Dagger').detail).toBe(itemDetail(dagger()));
    expect(row('Chainmail').detail).toBe('Body · Heavy Armour · armour 5');
    expect(row('Minor Healing Potion ×2').detail).toBe('Heals 8');
    expect(row('Ration').detail).toBe('fullness 600 · heals 2');
    expect(plan.entries.filter((e) => e.kind === 'ROW').every((e) => !e.greyed)).toBe(true);
  });

  // @spec PRESENT-ITEMS-023
  it('puts the purse on every section\'s heading', () => {
    const party = stocked();
    addGold(party, 37);
    for (const section of Object.values(ItemsSection)) {
      const heading = buildItemsPlan(party, viewport, { section }).entries.find((e) => e.kind === 'HEADING');
      expect(heading.aside).toBe('37 gold');
    }
  });

  // @spec PRESENT-ITEMS-024
  it('stacks consumables and food sharing a name, and never equipment', () => {
    const party = fourOf();
    stow(party, potion());
    stow(party, dagger());
    stow(party, potion());

    expect(names(buildItemsPlan(party, viewport, {}))).toEqual([
      'Dagger', 'Chainmail', 'Minor Healing Potion ×2', 'Dagger',
    ]);
  });

  // @spec PRESENT-ITEMS-030
  it('draws previous, Close and next along the foot, every one thumb-sized', () => {
    const plan = buildItemsPlan(fourOf(), phone, {});
    const buttons = plan.controls.filter((c) => c.kind === 'BUTTON');
    expect(buttons.map((c) => c.role)).toEqual([ItemsControl.PREVIOUS, ItemsControl.NEXT, ItemsControl.CLOSE]);
    for (const c of buttons) {
      expect(c.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
      expect(c.y + c.height).toBeLessThanOrEqual(plan.bounds.y + plan.bounds.height);
    }
  });

  // @spec PRESENT-ITEMS-019
  it('scrolls a long section to keep the highlighted row on the page', () => {
    const party = fourOf();
    for (let i = 0; i < 30; i++) stow(party, dagger());
    const plan = buildItemsPlan(party, phone, { selected: 31 });
    const chosen = plan.entries.find((e) => e.kind === 'ROW' && e.selected);

    expect(chosen.index).toBe(31);
    expect(chosen.box.y + chosen.box.height).toBeLessThanOrEqual(plan.area.y + plan.area.height + 0.5);
  });
});

describe('the Items screen out of a fight', () => {
  // @spec PRESENT-ITEMS-001
  // @spec PRESENT-ITEMS-003
  it('opens on All on I, telling exploration a menu is up', () => {
    const { controller, state } = harness();

    pressKey(controller, 'i');

    expect(screen(controller).section).toBe(ItemsSection.ALL);
    expect(state.menuOpen).toBe(true);
    expect(tickCount(state)).toBe(0);
  });

  // @spec PRESENT-ITEMS-001
  it('opens from the Items control on the action bar', () => {
    const { controller } = harness();
    const control = layers(controller).find((l) => l.name === 'hud').plan.controls
      .find((c) => c.region === 'ITEMS');

    tap(controller, control);

    expect(screen(controller).mode).toBe('LIST');
  });

  // @spec PRESENT-ITEMS-002
  it('closes on I, Escape, or Close', () => {
    for (const close of [
      (c) => pressKey(c, 'i'), (c) => pressKey(c, 'Escape'), (c) => tapControl(c, ItemsControl.CLOSE),
    ]) {
      const { controller, state } = harness();
      pressKey(controller, 'i');
      close(controller);
      expect(screen(controller)).toBeNull();
      expect(state.menuOpen).toBe(false);
    }
  });

  // @spec PRESENT-ITEMS-004
  it('swallows walking while open', () => {
    const { controller, state } = harness();
    pressKey(controller, 'i');
    const before = partyPosition(state);

    pressKey(controller, 'ArrowUp');

    expect(partyPosition(state)).toEqual(before);
    expect(layers(controller).find((l) => l.name === 'hud').plan.controls).toEqual([]);
  });

  // @spec PRESENT-ITEMS-009
  it('turns between sections by tab, number, arrows and the foot\'s controls, wrapping', () => {
    const { controller, party } = harness();
    stow(party, ration());
    pressKey(controller, 'i');

    tapTab(controller, ItemsSection.FOOD);
    expect(screen(controller).section).toBe(ItemsSection.FOOD);
    pressKey(controller, 'd');
    expect(screen(controller).section).toBe(ItemsSection.ALL);
    pressKey(controller, 'ArrowLeft');
    expect(screen(controller).section).toBe(ItemsSection.FOOD);
    pressKey(controller, '2');
    expect(screen(controller).section).toBe(ItemsSection.EQUIPMENT);
    tapControl(controller, ItemsControl.NEXT);
    expect(screen(controller).section).toBe(ItemsSection.CONSUMABLES);
    tapControl(controller, ItemsControl.PREVIOUS);
    expect(screen(controller).section).toBe(ItemsSection.EQUIPMENT);
  });

  // @spec PRESENT-ITEMS-017
  // @spec PRESENT-ITEMS-018
  // @spec PRESENT-ITEMS-021
  it('moves a highlight with W, S and the arrows, stopping at the ends, and keeps it within a new section', () => {
    const { controller, party } = harness();
    stow(party, ration());
    pressKey(controller, 'i');

    pressKey(controller, 'w');
    expect(screen(controller).selected).toBe(0);
    for (let i = 0; i < 10; i++) pressKey(controller, 'ArrowDown');
    expect(screen(controller).selected).toBe(2);
    pressKey(controller, '4');
    expect(screen(controller).selected).toBe(0);

    pressKey(controller, 'Enter');
    expect(screen(controller)).toMatchObject({ mode: 'ITEM' });
    expect(screen(controller).item.name).toBe('Ration');
  });

  // @spec PRESENT-ITEMS-010
  it('opens an item\'s page when its row is pressed', () => {
    const { controller } = harness();
    pressKey(controller, 'i');

    tapRow(controller, 'Chainmail');

    expect(screen(controller).mode).toBe('ITEM');
    expect(screen(controller).item.name).toBe('Chainmail');
  });

  // @spec PRESENT-ITEMS-016
  it('goes back to the list from an item\'s page on Escape or Back, changing nothing', () => {
    for (const back of [(c) => pressKey(c, 'Escape'), (c) => tapControl(c, ItemsControl.BACK)]) {
      const { controller, state, party } = harness();
      pressKey(controller, 'i');
      tapRow(controller, 'Chainmail');

      back(controller);

      expect(screen(controller).mode).toBe('LIST');
      expect(packOf(party).map((i) => i.name)).toEqual(['Dagger', 'Chainmail']);
      expect(tickCount(state)).toBe(0);
    }
  });

  // @spec PRESENT-ITEMS-014
  // @spec PRESENT-ITEMS-015
  it('equips on the character pressed for a tick, the worn one going to the pack, back on the list', () => {
    const { controller, state, party } = harness();
    pressKey(controller, 'i');
    tapRow(controller, 'Dagger');

    tapChoice(controller, 'bram');

    expect(character(party, 'bram').equipment[Slot.MAIN_HAND].name).toBe('Dagger');
    expect(packOf(party).map((i) => i.name)).toContain('Shortsword');
    expect(tickCount(state)).toBe(1);
    expect(screen(controller).mode).toBe('LIST');
  });

  // @spec PRESENT-ITEMS-012
  it('does nothing for a character greyed on an item\'s page', () => {
    const { controller, state, party } = harness();
    pressKey(controller, 'i');
    tapRow(controller, 'Chainmail');

    tapChoice(controller, 'isolde');

    expect(character(party, 'isolde').equipment[Slot.BODY]).toBeUndefined();
    expect(tickCount(state)).toBe(0);
    expect(screen(controller).mode).toBe('ITEM');
  });

  // @spec PRESENT-ITEMS-014
  // @spec PRESENT-ITEMS-015
  it('has the character pressed drink a potion, for a tick', () => {
    const { controller, state, party } = harness();
    stow(party, potion());
    stow(party, potion());
    applyDamage(party, 'tam', 10);
    const hurt = character(party, 'tam').hitPoints;
    pressKey(controller, 'i');
    tapRow(controller, 'Minor Healing Potion ×2');

    tapChoice(controller, 'tam');

    expect(character(party, 'tam').hitPoints).toBe(hurt + 8);
    expect(tickCount(state)).toBe(1);
    expect(screen(controller).mode).toBe('LIST');
    expect(rowFor(controller, 'Minor Healing Potion')).toBeDefined();
  });
});

describe('an item\'s page', () => {
  // @spec PRESENT-ITEMS-011
  it('names the item in its colour, its tier and kind, every number, and its description', () => {
    const party = fourOf();
    const staff = createItem({
      id: 'elder', name: 'Elder Staff', kind: ItemKind.WEAPON, slot: Slot.MAIN_HAND, rarity: Rarity.EPIC,
      category: ItemCategory.LIGHT_WEAPON, skill: Skill.POLEARM, damage: 11,
      description: 'Black wood, carved with sigils.',
    });
    stow(party, staff);
    const plan = buildItemPagePlan(party, viewport, staff);
    const lines = Object.fromEntries(plan.entries.filter((e) => e.kind === 'LINE').map((e) => [e.label, e.value]));

    expect(plan.title).toMatchObject({ name: 'Elder Staff', colour: RARITY_COLOURS[Rarity.EPIC], position: 'Epic weapon' });
    expect(lines).toMatchObject({
      Slot: 'Main hand', Category: 'Light Weapon', Trains: 'Polearm', Damage: '11, with Might',
    });
    expect(lines['Wielded by']).toMatch(/Fighter/);
    expect(plan.entries.find((e) => e.kind === 'TEXT' && e.flavour).text).toBe('Black wood, carved with sigils.');
    // Nothing is drawn for enchantments it does not carry.
    expect(plan.entries.some((e) => e.text === 'Enchantments')).toBe(false);
  });

  // @spec PRESENT-ITEMS-011
  it('says how many the pack holds, and lists any enchantments', () => {
    const party = fourOf();
    const charmed = potion({ id: 'charmed' });
    charmed.enchantments = [{ name: 'Bottomless' }];
    stow(party, charmed);
    stow(party, potion({ id: 'charmed' }));
    const plan = buildItemPagePlan(party, viewport, charmed);

    expect(plan.entries.find((e) => e.label === 'Carried').value).toBe('2');
    expect(plan.entries.some((e) => e.text === 'Enchantments')).toBe(true);
    expect(plan.entries.some((e) => e.text === 'Bottomless')).toBe(true);
  });

  // @spec PRESENT-ITEMS-012
  it('offers every character to equip, saying what each replaces or why they cannot', () => {
    const party = fourOf();
    const chainmail = packOf(party).find((i) => i.name === 'Chainmail');
    const plan = buildItemPagePlan(party, viewport, chainmail);
    const choice = (name) => plan.entries.find((e) => e.kind === 'ROW' && e.name === name);

    expect(plan.entries.find((e) => e.kind === 'HEADING').text).toBe('Equip to');
    expect(plan.entries.filter((e) => e.kind === 'ROW').map((e) => e.name)).toEqual(['bram', 'tam', 'isolde', 'wren']);
    expect(choice('bram')).toMatchObject({ available: true, greyed: false, detail: 'body empty' });
    expect(choice('isolde')).toMatchObject({ available: false, greyed: true });
    expect(choice('isolde').detail).toMatch(/only$/);

    const dag = packOf(party).find((i) => i.name === 'Dagger');
    const daggerPlan = buildItemPagePlan(party, viewport, dag);
    expect(daggerPlan.entries.find((e) => e.name === 'bram').detail).toBe('replaces Shortsword');
  });

  // @spec PRESENT-ITEMS-012
  it('offers a potion to whoever can drink it, greying the rest with why', () => {
    const party = fourOf();
    const drink = potion();
    stow(party, drink);
    applyDamage(party, 'bram', 5);
    applyDamage(party, 'tam', 9999);
    const plan = buildItemPagePlan(party, viewport, drink);
    const choice = (name) => plan.entries.find((e) => e.kind === 'ROW' && e.name === name);

    expect(plan.entries.find((e) => e.kind === 'HEADING').text).toBe('Use on');
    expect(choice('bram').available).toBe(true);
    expect(choice('tam')).toMatchObject({ available: false, detail: 'Unconscious' });
    expect(choice('isolde')).toMatchObject({ available: false, detail: 'At full health' });
  });

  // @spec PRESENT-ITEMS-013
  it('offers food to nobody, saying it is eaten at camp', () => {
    const party = fourOf();
    const food = ration();
    stow(party, food);
    const plan = buildItemPagePlan(party, viewport, food);

    expect(plan.entries.filter((e) => e.kind === 'ROW')).toEqual([]);
    expect(plan.entries.find((e) => e.kind === 'NOTE').text).toMatch(/camp/);
  });

  // @spec PRESENT-ITEMS-030
  it('has Back alone at its foot', () => {
    const party = fourOf();
    const plan = buildItemPagePlan(party, viewport, packOf(party)[0]);
    expect(plan.controls.filter((c) => c.kind === 'BUTTON').map((c) => c.role)).toEqual([ItemsControl.BACK]);
  });
});

describe('the Items screen in a fight', () => {
  function fighting({ hurt = true, packed = true } = {}) {
    const floor = createFloor({ id: 'f1', width: 7, height: 7 });
    const state = createExploration({
      floors: [floor], floorId: 'f1', tile: { x: 3, y: 3 }, facing: Direction.NORTH,
    });
    const party = createParty();
    addCharacter(party, createCharacter({
      id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, attributes: { DEXTERITY: 30 },
      attack: { skill: Skill.BLADE, baseDamage: 5 },
    }));
    addCharacter(party, createCharacter({ id: 'wren', name: 'Wren', characterClass: CharacterClass.CLERIC }));
    if (packed) {
      stow(party, potion());
      stow(party, dagger());
    }
    if (hurt) {
      applyDamage(party, 'bram', 10);
      applyDamage(party, 'wren', 3);
    }
    const encounter = beginEncounter({
      party,
      enemies: createEnemyGroup([createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 40, potValue: 10, attributes: { DEXTERITY: 1 } })]),
      rng: makeRng(3), origin: { floorId: 'f1', x: 3, y: 3 },
    });
    const campaign = {
      encounter, state, party,
      concludeEncounter: () => { campaign.encounter = null; }, fleeEncounter: () => {},
    };
    const controller = createController({ state, campaign, viewport, onDraw: vi.fn() });
    return { controller, state, party, encounter };
  }
  const itemsKey = String(OPTION_SLOTS.findIndex((o) => o.action === FightAction.ITEMS) + 1);
  const option = (controller) => controller.fight.pending.options.find((o) => o.action === FightAction.ITEMS);

  // @spec PRESENT-FIGHT-036
  it('offers Items for a potion the character can drink, and says why not otherwise', () => {
    expect(option(fighting().controller).available).toBe(true);
    expect(option(fighting({ hurt: false }).controller)).toMatchObject({ available: false, reason: 'Nothing to use' });
    expect(option(fighting({ packed: false }).controller)).toMatchObject({ available: false, reason: 'Pack is empty' });
  });

  // @spec PRESENT-ITEMS-026
  it('opens over the fight on the consumables alone, with no tabs and no paging', () => {
    const { controller } = fighting();

    pressKey(controller, itemsKey);
    const plan = screen(controller);

    expect(plan).toMatchObject({ inFight: true, section: ItemsSection.CONSUMABLES, tabs: [] });
    expect(names(plan)).toEqual(['Minor Healing Potion']);
    expect(plan.controls.filter((c) => c.kind === 'BUTTON').map((c) => c.role)).toEqual([ItemsControl.CLOSE]);
    expect(layers(controller).find((l) => l.name === 'fight').plan).not.toBeNull();
    pressKey(controller, '3');
    expect(screen(controller).section).toBe(ItemsSection.CONSUMABLES);
  });

  // @spec PRESENT-ITEMS-027
  it('offers an item to the acting character alone', () => {
    const { controller } = fighting();
    pressKey(controller, itemsKey);
    tapRow(controller, 'Minor Healing Potion');

    expect(screen(controller).entries.filter((e) => e.kind === 'ROW').map((e) => e.name)).toEqual(['Bram']);
  });

  // @spec PRESENT-ITEMS-028
  it('closes on Escape from the list with the turn still waiting and nothing spent', () => {
    const { controller, encounter } = fighting();
    const before = readinessOf(encounter, 'bram');
    pressKey(controller, itemsKey);

    pressKey(controller, 'Escape');

    expect(screen(controller)).toBeNull();
    expect(controller.fight.pending.characterId).toBe('bram');
    expect(readinessOf(encounter, 'bram')).toBe(before);
  });

  // @spec PRESENT-ITEMS-029
  // @spec COMBAT-ACTION-013
  it('takes a drink as the turn, closes the screen, and goes on', () => {
    const { controller, party } = fighting();
    const before = character(party, 'bram').hitPoints;
    pressKey(controller, itemsKey);
    tapRow(controller, 'Minor Healing Potion');

    tapChoice(controller, 'Bram');

    expect(character(party, 'bram').hitPoints).toBe(before + 8);
    expect(screen(controller)).toBeNull();
    expect(controller.fight.turnsTaken).toBe(1);
    expect(controller.fight.log.at(-1)).toMatch(/drinks the Minor Healing Potion/);
  });
});

describe('the name', () => {
  // @spec PRESENT-ITEMS-020
  it('is Items on the action bar and in a fight', () => {
    const { controller } = harness();
    const bar = layers(controller).find((l) => l.name === 'hud').plan.controls
      .find((c) => c.region === 'ITEMS');

    expect(bar.label).toBe('Items');
    expect(OPTION_SLOTS.find((o) => o.action === FightAction.ITEMS).label).toBe('Items');
  });
});

describe('the fight controller alone', () => {
  // @spec PRESENT-ITEMS-026
  it('marks the turn as having the Items screen open without spending anything', () => {
    const party = createParty();
    addCharacter(party, createCharacter({ id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, attributes: { DEXTERITY: 30 } }));
    stow(party, potion());
    applyDamage(party, 'bram', 3);
    const encounter = beginEncounter({
      party,
      enemies: createEnemyGroup([createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 9, potValue: 10, attributes: { DEXTERITY: 1 } })]),
      rng: makeRng(3), origin: { floorId: 'f1', x: 3, y: 3 },
    });
    const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });

    expect(chooseOption(fight, OPTION_SLOTS.findIndex((o) => o.action === FightAction.ITEMS))).toBe(true);
    expect(fight.pending.items).toBe(true);
    // The row of four is inert while the screen holds the input.
    expect(chooseOption(fight, 0)).toBe(false);
  });
});

describe('rarity on the Items screen', () => {
  // @spec PRESENT-RARITY-001
  // @spec PRESENT-RARITY-003
  it('colours a name by its rarity, and writes the tier under anything above common', () => {
    const party = fourOf();
    stow(party, createItem({ ...dagger(), id: 'runed', name: 'Runed Dagger', rarity: Rarity.EPIC }));
    const entries = buildItemsPlan(party, viewport, {}).entries;
    const runed = entries.find((e) => e.name === 'Runed Dagger');
    const plain = entries.find((e) => e.name === 'Dagger');

    expect(runed.colour).toBe(RARITY_COLOURS[Rarity.EPIC]);
    expect(runed.detail).toMatch(/^Epic · /);
    expect(plain.colour).toBe(RARITY_COLOURS[Rarity.COMMON]);
    expect(plain.detail).not.toMatch(/Common/);
  });

  // @spec PRESENT-RARITY-002
  it('uses the colours players already know, one per tier', () => {
    expect(new Set(Object.values(RARITY_COLOURS)).size).toBe(5);
    const hue = (c) => {
      const [r, g, b] = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      return { r, g, b };
    };
    const { r: ur, g: ug, b: ub } = hue(RARITY_COLOURS[Rarity.UNCOMMON]);
    const { r: rr, g: rg, b: rb } = hue(RARITY_COLOURS[Rarity.RARE]);
    const { r: er, g: eg, b: eb } = hue(RARITY_COLOURS[Rarity.EPIC]);
    const { r: lr, g: lg, b: lb } = hue(RARITY_COLOURS[Rarity.LEGENDARY]);
    expect(ug).toBeGreaterThan(Math.max(ur, ub));
    expect(rb).toBeGreaterThan(Math.max(rr, rg));
    expect(er).toBeGreaterThan(eg);
    expect(eb).toBeGreaterThan(eg);
    expect(lr).toBeGreaterThan(lg);
    expect(lg).toBeGreaterThan(lb);
  });
});

describe('scrolling the Items screen by touch', () => {
  /** A phone-sized harness with a pack far longer than the page. */
  function longPack() {
    const h = harness();
    h.controller.viewport = phone;
    for (let i = 0; i < 30; i++) stow(h.party, dagger());
    pressKey(h.controller, 'i');
    return h;
  }
  const listCentre = (controller) => {
    const { area } = screen(controller);
    return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
  };

  // @spec PRESENT-ITEMS-022
  it('scrolls the list with a drag, no further than either end, leaving the highlight', () => {
    const { controller } = longPack();
    const { x, y } = listCentre(controller);
    const before = screen(controller).scroll;
    expect(screen(controller).maxScroll).toBeGreaterThan(0);

    pressPointer(controller, x, y);
    dragPointer(controller, x, y - 120);
    releasePointer(controller);

    expect(screen(controller).scroll).toBeCloseTo(before + 120);
    expect(screen(controller).selected).toBe(0);
    expect(screen(controller).mode).toBe('LIST');

    pressPointer(controller, x, y);
    dragPointer(controller, x, y - 100000);
    releasePointer(controller);
    expect(screen(controller).scroll).toBe(screen(controller).maxScroll);

    scrollItems(controller, -100000);
    expect(screen(controller).scroll).toBe(0);
  });

  // @spec PRESENT-ITEMS-022
  it('lets the wheel scroll the list, and lets the keyboard bring the highlight back', () => {
    const { controller } = longPack();
    expect(scrollItems(controller, 200)).toBe(true);
    expect(screen(controller).scroll).toBeCloseTo(200);

    pressKey(controller, 's');
    const chosen = rows(controller).find((r) => r.selected);
    expect(chosen.box.y).toBeGreaterThanOrEqual(screen(controller).area.y - 0.5);
  });

  // @spec PRESENT-ITEMS-031
  it('opens a row on lifting a still finger, and nothing after a drag', () => {
    const { controller } = longPack();
    const row = rowFor(controller, 'Chainmail');
    const cx = row.box.x + row.box.width / 2;
    const cy = row.box.y + row.box.height / 2;

    pressPointer(controller, cx, cy);
    dragPointer(controller, cx, cy - 40);
    releasePointer(controller);
    expect(screen(controller).mode).toBe('LIST');

    scrollItems(controller, -100000);
    const again = rowFor(controller, 'Chainmail');
    pressPointer(controller, again.box.x + again.box.width / 2, again.box.y + again.box.height / 2);
    expect(screen(controller).mode).toBe('LIST');
    releasePointer(controller);
    expect(screen(controller).item.name).toBe('Chainmail');
  });

  // @spec PRESENT-ITEMS-032
  it('clips rows cut by the list\'s edge, and draws a bar for where the view sits', () => {
    const { controller } = longPack();
    scrollItems(controller, 30);
    const plan = screen(controller);

    expect(plan.clip).toEqual(plan.area);
    expect(plan.entries[0].box.y).toBeLessThan(plan.area.y);
    for (const c of plan.controls.filter((k) => k.kind === 'ROW')) {
      expect(c.y).toBeGreaterThanOrEqual(plan.area.y - 0.5);
      expect(c.y + c.height).toBeLessThanOrEqual(plan.area.y + plan.area.height + 0.5);
    }
    expect(plan.scrollbar.thumb.height).toBeLessThan(plan.scrollbar.track.height);
    expect(plan.scrollbar.thumb.y).toBeGreaterThan(plan.scrollbar.track.y);

    expect(buildItemsPlan(fourOf(), viewport, {}).scrollbar).toBeNull();
  });
});
