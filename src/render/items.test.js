import { describe, it, expect, vi } from 'vitest';
import { createFloor, Direction } from '../sim/floor.js';
import { createExploration, partyPosition, tickCount } from '../sim/exploration.js';
import {
  createParty, createCharacter, addCharacter, character, packOf, stow, equip,
  CharacterClass, Skill, addGold, applyDamage,
} from '../sim/party.js';
import { ItemKind, Rarity, Slot, createItem } from '../sim/items.js';
import { RARITY_COLOURS } from './appconfig.js';
import { beginEncounter, createEnemy, createEnemyGroup, readinessOf } from '../sim/combat.js';
import { makeRng } from '../sim/rng.js';
import { MIN_TAP_PX } from './geometry.js';
import { createController, pressKey, pressPointer, layers } from './controller.js';
import { buildItemsPlan, itemDetail, ItemsControl } from './itemsplan.js';
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
  skill: Skill.HEAVY_ARMOUR, armour: 5, classes: [CharacterClass.FIGHTER, CharacterClass.CLERIC],
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
const rows = (controller) => screen(controller).entries.filter((e) => e.kind === 'ROW');
const rowFor = (controller, name) => rows(controller).find((r) => r.name === name);
const tap = (controller, box) => pressPointer(controller, box.x + box.width / 2, box.y + box.height / 2);
const tapRow = (controller, name) => tap(controller, rowFor(controller, name).box);
const tapControl = (controller, role) =>
  tap(controller, screen(controller).controls.find((c) => c.role === role));

describe('the Items page', () => {
  // @spec PRESENT-ITEMS-006
  it('lists every slot, worn or empty, then the pack in its order', () => {
    const plan = buildItemsPlan(fourOf(), viewport, { page: 0 });
    const listed = plan.entries.filter((e) => e.kind === 'ROW');

    expect(plan.characterId).toBe('bram');
    expect(listed.slice(0, 3).map((r) => r.slot)).toEqual(Object.values(Slot));
    expect(listed[0]).toMatchObject({ role: ItemsControl.WORN, name: 'Shortsword' });
    expect(listed[1]).toMatchObject({ role: ItemsControl.WORN, name: null });
    expect(listed.slice(3).map((r) => r.name)).toEqual(['Dagger', 'Chainmail']);
  });

  // @spec PRESENT-ITEMS-006
  it('says the pack is empty when it is', () => {
    const party = createParty();
    addCharacter(party, createCharacter({ id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER }));

    const plan = buildItemsPlan(party, viewport, { page: 0 });

    expect(plan.entries.some((e) => e.kind === 'NOTE')).toBe(true);
  });

  // @spec PRESENT-ITEMS-007
  it('says what each kind of item carries', () => {
    expect(itemDetail(sword())).toBe('Main hand · Blade · damage 9');
    expect(itemDetail(mail())).toBe('Body · Heavy Armour · armour 5');
    expect(itemDetail(shield())).toBe('Off hand · armour 1');
  });

  // @spec PRESENT-ITEMS-008
  it('greys what the character may not wield, naming who may', () => {
    // Isolde is a mage, and chainmail is for fighters and clerics.
    const plan = buildItemsPlan(fourOf(), viewport, { page: 2 });
    const armour = plan.entries.find((e) => e.name === 'Chainmail');

    expect(armour.greyed).toBe(true);
    expect(armour.available).toBe(false);
    expect(armour.detail).toBe('Body · Fighter, Cleric only');
  });

  // @spec PRESENT-ITEMS-013
  it('in a fight shows the acting character alone, with nobody to page to', () => {
    const plan = buildItemsPlan(fourOf(), viewport, { characterId: 'tam', inFight: true });

    expect(plan.characterId).toBe('tam');
    expect(plan.controls.map((c) => c.role)).not.toContain(ItemsControl.NEXT);
    expect(plan.controls.map((c) => c.role)).not.toContain(ItemsControl.PREVIOUS);
  });

  // @spec PRESENT-ITEMS-030
  it('puts previous, Close and next in one row along the foot, under the list', () => {
    const plan = buildItemsPlan(fourOf(), phone, { page: 0 });
    const of = (role) => plan.controls.find((c) => c.role === role);
    const prev = of(ItemsControl.PREVIOUS);
    const close = of(ItemsControl.CLOSE);
    const next = of(ItemsControl.NEXT);

    for (const c of [prev, close, next]) {
      expect(c.y).toBe(prev.y);
      expect(c.y + c.height).toBeLessThanOrEqual(plan.bounds.y + plan.bounds.height);
      expect(c.y).toBeGreaterThanOrEqual(plan.area.y + plan.area.height);
    }
    expect(prev.x).toBeLessThan(close.x);
    expect(close.x + close.width).toBeLessThan(next.x);
    expect(Math.abs((close.x + close.width / 2) - (plan.bounds.x + plan.bounds.width / 2))).toBeLessThan(1);
    expect(plan.title.box.y).toBeLessThan(plan.area.y);
    expect(plan.title.box.width).toBeGreaterThan(plan.bounds.width / 2);
  });

  // @spec PRESENT-ITEMS-030
  it('in a fight puts Close alone at the foot', () => {
    const plan = buildItemsPlan(fourOf(), phone, { characterId: 'tam', inFight: true });
    const close = plan.controls.find((c) => c.role === ItemsControl.CLOSE);

    expect(close.y).toBeGreaterThanOrEqual(plan.area.y + plan.area.height);
    expect(Math.abs((close.x + close.width / 2) - (plan.bounds.x + plan.bounds.width / 2))).toBeLessThan(1);
  });

  // @spec PRESENT-ITEMS-016
  it('in a fight draws worn items as rows nothing happens to', () => {
    const plan = buildItemsPlan(fourOf(), viewport, { characterId: 'bram', inFight: true });

    expect(plan.entries.find((e) => e.name === 'Shortsword').available).toBe(false);
    expect(plan.entries.find((e) => e.name === 'Dagger').available).toBe(true);
  });

  // @spec PRESENT-ITEMS-019
  it('scrolls a long pack to keep the highlighted row on the page', () => {
    const party = fourOf();
    for (let i = 0; i < 30; i++) stow(party, dagger());
    const last = 3 + packOf(party).length - 1;

    const plan = buildItemsPlan(party, phone, { page: 0, selected: last });
    const chosen = plan.entries.find((e) => e.kind === 'ROW' && e.selected);

    expect(chosen.index).toBe(last);
    expect(chosen.box.y + chosen.box.height).toBeLessThanOrEqual(plan.area.y + plan.area.height + 0.5);
    for (const e of plan.entries) expect(e.box.y).toBeGreaterThanOrEqual(plan.area.y - 0.5);
  });

  it('draws no row smaller than a thumb', () => {
    const plan = buildItemsPlan(fourOf(), phone, { page: 0 });
    for (const c of plan.controls) expect(c.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
  });
});

describe('the Items screen out of a fight', () => {
  // @spec PRESENT-ITEMS-001
  // @spec PRESENT-ITEMS-003
  it('opens on the first character on I, telling exploration a menu is up', () => {
    const { controller, state } = harness();

    pressKey(controller, 'i');

    expect(screen(controller).characterId).toBe('bram');
    expect(state.menuOpen).toBe(true);
    expect(tickCount(state)).toBe(0);
  });

  // @spec PRESENT-ITEMS-001
  it('opens from the Items control on the action bar', () => {
    const { controller } = harness();
    const control = layers(controller).find((l) => l.name === 'hud').plan.controls
      .find((c) => c.region === 'ITEMS');

    tap(controller, control);

    expect(screen(controller)).not.toBeNull();
  });

  // @spec PRESENT-ITEMS-002
  it('closes on I, Escape and Close, and lets the clock go again', () => {
    for (const close of [(c) => pressKey(c, 'i'), (c) => pressKey(c, 'Escape'), (c) => tapControl(c, ItemsControl.CLOSE)]) {
      const { controller, state } = harness();
      pressKey(controller, 'i');
      close(controller);
      expect(screen(controller)).toBeNull();
      expect(state.menuOpen).toBe(false);
    }
  });

  // @spec PRESENT-ITEMS-004
  it('holds the input while open', () => {
    const { controller, state } = harness();
    const held = partyPosition(state);
    pressKey(controller, 'i');

    for (const key of ['x', 'e', 'p', 'c', 'm']) pressKey(controller, key);

    expect(partyPosition(state)).toEqual(held);
    expect(controller.expanded).toBe(true);
    expect(controller.partyScreen).toBeNull();
    expect(layers(controller).find((l) => l.name === 'hud').plan.controls).toEqual([]);
  });

  // @spec PRESENT-ITEMS-005
  it('pages like the party screen, wrapping both ways', () => {
    const { controller } = harness();
    pressKey(controller, 'i');

    pressKey(controller, 'd');
    expect(screen(controller).characterId).toBe('tam');
    pressKey(controller, 'ArrowLeft');
    pressKey(controller, 'ArrowLeft');
    expect(screen(controller).characterId).toBe('wren');
    tapControl(controller, ItemsControl.NEXT);
    expect(screen(controller).characterId).toBe('bram');
    pressKey(controller, '3');
    expect(screen(controller).characterId).toBe('isolde');
  });

  // @spec PRESENT-ITEMS-009
  // @spec PRESENT-ITEMS-011
  it('puts a pack item on with one press, costs a tick, and stays open', () => {
    const { controller, state, party } = harness();
    pressKey(controller, 'i');

    tapRow(controller, 'Dagger');

    expect(character(party, 'bram').equipment[Slot.MAIN_HAND].name).toBe('Dagger');
    expect(packOf(party).map((i) => i.name)).toEqual(['Chainmail', 'Shortsword']);
    expect(tickCount(state)).toBe(1);
    expect(screen(controller)).not.toBeNull();
  });

  // @spec PRESENT-ITEMS-010
  // @spec PRESENT-ITEMS-011
  it('takes a worn item off into the pack for a tick', () => {
    const { controller, state, party } = harness();
    pressKey(controller, 'i');

    tapRow(controller, 'Shortsword');

    expect(character(party, 'bram').equipment[Slot.MAIN_HAND]).toBeUndefined();
    expect(packOf(party).map((i) => i.name)).toContain('Shortsword');
    expect(tickCount(state)).toBe(1);
  });

  // @spec PRESENT-ITEMS-008
  // @spec PRESENT-ITEMS-012
  it('does nothing for an item that cannot be wielded or an empty slot', () => {
    const { controller, state, party } = harness();
    pressKey(controller, 'i');
    pressKey(controller, '3');

    tapRow(controller, 'Chainmail');
    tap(controller, rows(controller).find((r) => r.slot === Slot.OFF_HAND && r.role === ItemsControl.WORN).box);

    expect(character(party, 'isolde').equipment[Slot.BODY]).toBeUndefined();
    expect(tickCount(state)).toBe(0);
  });

  // @spec PRESENT-ITEMS-017
  // @spec PRESENT-ITEMS-018
  it('moves a highlight with W, S and the arrows, stopping at the ends, and presses it on Enter', () => {
    const { controller, party } = harness();
    pressKey(controller, 'i');

    pressKey(controller, 'w');
    expect(screen(controller).selected).toBe(0);
    for (const key of ['s', 'ArrowDown', 's']) pressKey(controller, key);
    expect(screen(controller).selected).toBe(3);
    for (let i = 0; i < 10; i++) pressKey(controller, 'ArrowDown');
    expect(screen(controller).selected).toBe(4);
    pressKey(controller, 'ArrowUp');

    pressKey(controller, 'Enter');

    expect(character(party, 'bram').equipment[Slot.MAIN_HAND].name).toBe('Dagger');
  });

  // @spec PRESENT-ITEMS-021
  it('keeps the highlight within the rows when the pack shrinks', () => {
    const { controller } = harness();
    pressKey(controller, 'i');
    for (let i = 0; i < 4; i++) pressKey(controller, 's');
    expect(screen(controller).selected).toBe(4);

    // Chainmail goes on Bram, so the pack is one shorter.
    pressKey(controller, ' ');

    expect(screen(controller).selected).toBeLessThan(screen(controller).rowCount);
  });
});

describe('the Items screen in a fight', () => {
  function fighting({ packed = true } = {}) {
    const floor = createFloor({ id: 'f1', width: 7, height: 7 });
    const state = createExploration({
      floors: [floor], floorId: 'f1', tile: { x: 3, y: 3 }, facing: Direction.NORTH,
    });
    const party = createParty();
    addCharacter(party, createCharacter({
      id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, attributes: { DEXTERITY: 30 },
      attack: { skill: Skill.BLADE, baseDamage: 5 },
    }));
    if (packed) stow(party, dagger());
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
  it('offers Items when the pack holds something the character may wield, and says why not otherwise', () => {
    expect(option(fighting().controller).available).toBe(true);

    const empty = option(fighting({ packed: false }).controller);
    expect(empty.available).toBe(false);
    expect(empty.reason).toBe('Pack is empty');
  });

  // @spec PRESENT-ITEMS-013
  it('opens over the fight on the acting character', () => {
    const { controller } = fighting();

    pressKey(controller, itemsKey);

    expect(screen(controller)).toMatchObject({ characterId: 'bram', inFight: true });
    expect(layers(controller).find((l) => l.name === 'fight').plan).not.toBeNull();
  });

  // @spec PRESENT-ITEMS-014
  it('closes on Escape with the turn still waiting and nothing spent', () => {
    const { controller, encounter } = fighting();
    const before = readinessOf(encounter, 'bram');
    pressKey(controller, itemsKey);

    pressKey(controller, 'Escape');

    expect(screen(controller)).toBeNull();
    expect(controller.fight.pending.characterId).toBe('bram');
    expect(readinessOf(encounter, 'bram')).toBe(before);
  });

  // @spec PRESENT-ITEMS-015
  // @spec COMBAT-ACTION-011
  it('takes equipping as the turn, closes the screen, and goes on', () => {
    const { controller, party } = fighting();
    pressKey(controller, itemsKey);

    tapRow(controller, 'Dagger');

    expect(character(party, 'bram').equipment[Slot.MAIN_HAND].name).toBe('Dagger');
    expect(screen(controller)).toBeNull();
    expect(controller.fight.turnsTaken).toBe(1);
    expect(controller.fight.log.at(-1)).toMatch(/Dagger/);
  });

  // @spec PRESENT-ITEMS-016
  it('does not take anything off in a fight', () => {
    const { controller, party } = fighting();
    const held = sword();
    stow(party, held);
    equip(party, 'bram', held);
    pressKey(controller, itemsKey);

    tapRow(controller, 'Shortsword');

    expect(character(party, 'bram').equipment[Slot.MAIN_HAND]).toBe(held);
    expect(controller.fight.turnsTaken).toBe(0);
    expect(screen(controller)).not.toBeNull();
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
  // @spec PRESENT-ITEMS-013
  it('marks the turn as having the Items screen open without spending anything', () => {
    const party = createParty();
    addCharacter(party, createCharacter({ id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, attributes: { DEXTERITY: 30 } }));
    stow(party, dagger());
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

const potion = (over = {}) => createItem({
  id: 'minor_healing_potion', name: 'Minor Healing Potion', kind: ItemKind.CONSUMABLE,
  effect: { heal: 8 }, ...over,
});

describe('gold, potions and rarity on the Items page', () => {
  // @spec PRESENT-ITEMS-023
  it('shows the gold in the purse on every page', () => {
    const party = fourOf();
    addGold(party, 37);

    for (const page of [0, 1]) {
      const plan = buildItemsPlan(party, viewport, { page });
      expect(plan.gold).toBe(37);
      expect(plan.entries.find((e) => e.kind === 'HEADING' && e.text === 'Pack').aside).toBe('37 gold');
    }
  });

  // @spec PRESENT-ITEMS-024
  it('lists potions sharing a name as one row with a count, and every piece of gear alone', () => {
    const party = fourOf();
    stow(party, potion());
    stow(party, dagger());
    stow(party, potion());
    stow(party, potion());

    const pack = buildItemsPlan(party, viewport, { page: 0 }).entries
      .filter((e) => e.kind === 'ROW' && e.role === ItemsControl.PACK);

    expect(pack.map((r) => r.name)).toEqual([
      'Dagger', 'Chainmail', 'Minor Healing Potion ×3', 'Dagger',
    ]);
  });

  // @spec PRESENT-ITEMS-025
  // @spec PRESENT-ITEMS-027
  it('says what a potion does, or greys it with why it cannot be drunk', () => {
    const party = fourOf();
    stow(party, potion());
    const row = () => buildItemsPlan(party, viewport, { page: 0 }).entries
      .find((e) => e.name === 'Minor Healing Potion');

    expect(row()).toMatchObject({ greyed: true, available: false, detail: 'At full health' });

    applyDamage(party, 'bram', 5);
    expect(row()).toMatchObject({ greyed: false, available: true, detail: 'Heals 8' });

    applyDamage(party, 'bram', 9999);
    expect(row()).toMatchObject({ greyed: true, available: false, detail: 'Unconscious' });
  });

  // @spec PRESENT-ITEMS-026
  // @spec PRESENT-ITEMS-028
  it('drinks a potion pressed out of a fight, for a tick, leaving the screen open', () => {
    const { controller, party, state } = harness();
    stow(party, potion());
    stow(party, potion());
    applyDamage(party, 'bram', 10);
    const hurt = character(party, 'bram').hitPoints;
    pressKey(controller, 'i');
    const ticks = tickCount(state);

    tapRow(controller, 'Minor Healing Potion ×2');

    expect(character(party, 'bram').hitPoints).toBe(hurt + 8);
    expect(tickCount(state)).toBe(ticks + 1);
    expect(screen(controller)).not.toBeNull();
    expect(rowFor(controller, 'Minor Healing Potion')).toBeDefined();
  });

  // @spec PRESENT-ITEMS-027
  it('does nothing when a greyed potion is pressed', () => {
    const { controller, party, state } = harness();
    stow(party, potion());
    pressKey(controller, 'i');
    const ticks = tickCount(state);

    tapRow(controller, 'Minor Healing Potion');

    expect(packOf(party).some((i) => i.id === 'minor_healing_potion')).toBe(true);
    expect(tickCount(state)).toBe(ticks);
  });

  // @spec PRESENT-RARITY-001
  // @spec PRESENT-RARITY-002
  // @spec PRESENT-RARITY-003
  it('colours a name by its rarity, and writes the tier under anything above common', () => {
    const party = fourOf();
    stow(party, createItem({ ...dagger(), id: 'runed', name: 'Runed Dagger', rarity: Rarity.EPIC }));
    const entries = buildItemsPlan(party, viewport, { page: 0 }).entries;
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

describe('drinking in a fight', () => {
  function hurtFight({ hurt = true } = {}) {
    const floor = createFloor({ id: 'f1', width: 7, height: 7 });
    const state = createExploration({
      floors: [floor], floorId: 'f1', tile: { x: 3, y: 3 }, facing: Direction.NORTH,
    });
    const party = createParty();
    addCharacter(party, createCharacter({
      id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, attributes: { DEXTERITY: 30 },
      attack: { skill: Skill.BLADE, baseDamage: 5 },
    }));
    stow(party, potion());
    if (hurt) applyDamage(party, 'bram', 10);
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
    return { controller, party };
  }
  const itemsKey = String(OPTION_SLOTS.findIndex((o) => o.action === FightAction.ITEMS) + 1);
  const option = (controller) => controller.fight.pending.options.find((o) => o.action === FightAction.ITEMS);

  // @spec PRESENT-ITEMS-029
  // @spec COMBAT-ACTION-013
  it('takes a drink as the turn, closes the screen, and goes on', () => {
    const { controller, party } = hurtFight();
    const before = character(party, 'bram').hitPoints;
    pressKey(controller, itemsKey);

    tapRow(controller, 'Minor Healing Potion');

    expect(character(party, 'bram').hitPoints).toBe(before + 8);
    expect(screen(controller)).toBeNull();
    expect(controller.fight.turnsTaken).toBe(1);
    expect(controller.fight.log.at(-1)).toMatch(/drinks the Minor Healing Potion/);
  });

  // @spec PRESENT-FIGHT-036
  it('offers Items for a potion the character can drink, and not for one they cannot', () => {
    expect(option(hurtFight().controller).available).toBe(true);

    const full = option(hurtFight({ hurt: false }).controller);
    expect(full.available).toBe(false);
    expect(full.reason).toBe('Nothing to use');
  });
});
