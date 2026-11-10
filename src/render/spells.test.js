import { describe, it, expect, vi } from 'vitest';
import { createFloor, Direction } from '../sim/floor.js';
import { createExploration, tickCount } from '../sim/exploration.js';
import {
  createParty, createCharacter, addCharacter, character, applyDamage, stow, packOf, CharacterClass,
} from '../sim/party.js';
import { createItem, ItemKind } from '../sim/items.js';
import { camp } from '../sim/camp.js';
import { beginEncounter, createEnemy, createEnemyGroup } from '../sim/combat.js';
import { makeRng } from '../sim/rng.js';
import { playEnemyTurn } from './fight.js';
import { spellDefinitions } from '../content/spells.js';
import { createSpell, CastWhere, Learned, SpellTarget } from '../sim/magic.js';
import { createController, pressKey, pressPointer, layers } from './controller.js';
import { SpellsControl } from './spellsplan.js';

const viewport = { width: 390, height: 844 };

function harness({ roamers = [] } = {}) {
  const party = createParty();
  for (const [id, cls] of [
    ['bram', CharacterClass.FIGHTER], ['isolde', CharacterClass.MAGE], ['wren', CharacterClass.CLERIC],
  ]) addCharacter(party, createCharacter({ id, name: id, characterClass: cls }));
  const floor = createFloor({ id: 'f1', width: 13, height: 13 });
  let state;
  state = createExploration({
    floors: [floor], floorId: 'f1', tile: { x: 6, y: 6 }, facing: Direction.NORTH, roamers,
    hooks: { onCamp: () => camp(state, party) },
  });
  // A mage's spell cast out of a fight, which nothing authored offers yet.
  const mend = createSpell({
    id: 'mend', name: 'Mend', school: 'ALTERATION', rank: 1, target: SpellTarget.ALLY,
    effect: { heal: 5 }, where: [CastWhere.EXPLORATION], learned: Learned.TOME,
  });
  const campaign = { encounter: null, state, party, spells: { ...spellDefinitions(), mend } };
  const onDraw = vi.fn();
  const controller = createController({ state, campaign, viewport, onDraw });
  return { controller, state, party };
}

const plan = (controller, name) => layers(controller).find((l) => l.name === name)?.plan ?? null;
const rows = (controller) => plan(controller, 'spells').entries.filter((e) => e.kind === 'ROW');
const rowFor = (controller, name) => rows(controller).find((r) => r.name === name);
const tap = (controller, box) => pressPointer(controller, box.x + box.width / 2, box.y + box.height / 2);
const tapControl = (controller, role) =>
  tap(controller, plan(controller, 'spells').controls.find((c) => c.role === role));

describe('the Spells screen', () => {
  // @spec PRESENT-SPELLS-001
  // @spec PRESENT-SPELLS-003
  it('opens on the first character who can cast out of a fight, as a menu that holds the clock', () => {
    const { controller, state } = harness();

    pressKey(controller, 'c');

    expect(plan(controller, 'spells').title.name).toBe('wren');
    expect(state.menuOpen).toBe(true);
    expect(tickCount(state)).toBe(0);
  });

  // @spec PRESENT-SPELLS-002
  it('pages like the Items screen, with its controls along the foot, and closes', () => {
    const { controller, state } = harness();
    pressKey(controller, 'c');

    pressKey(controller, 'd');
    expect(plan(controller, 'spells').title.name).toBe('bram');
    tapControl(controller, SpellsControl.PREVIOUS);
    expect(plan(controller, 'spells').title.name).toBe('wren');

    const { controls, bounds } = plan(controller, 'spells');
    for (const c of controls.filter((x) => x.kind === 'BUTTON')) {
      expect(c.y).toBeGreaterThan(bounds.y + bounds.height / 2);
    }

    tapControl(controller, SpellsControl.CLOSE);
    expect(plan(controller, 'spells')).toBeNull();
    expect(state.menuOpen).toBe(false);
  });

  // @spec PRESENT-SPELLS-004
  // @spec PRESENT-SPELLS-005
  it('lists the spells known, with what they do and the slots left, greying what cannot be cast here', () => {
    const { controller } = harness();
    pressKey(controller, 'c');

    expect(rowFor(controller, 'Heal')).toMatchObject({ available: true, detail: 'Heals 10 · 3/3 slots' });

    pressKey(controller, 'a');
    expect(plan(controller, 'spells').title.name).toBe('isolde');
    expect(rowFor(controller, 'Magic Missile')).toMatchObject({ available: false, greyed: true, detail: 'In a fight only' });

    pressKey(controller, 'a');
    expect(plan(controller, 'spells').entries.find((e) => e.kind === 'NOTE').text).toBe('Knows no spells');
  });

  // @spec PRESENT-SPELLS-006
  // @spec PRESENT-SPELLS-007
  it('asks whom, then casts on the one chosen for a tick and a slot', () => {
    const { controller, state, party } = harness();
    character(party, 'bram').hitPoints -= 6;
    pressKey(controller, 'c');

    tap(controller, rowFor(controller, 'Heal').box);

    expect(rowFor(controller, 'wren')).toMatchObject({ available: false, detail: expect.stringContaining('Unhurt') });
    expect(rowFor(controller, 'bram')).toMatchObject({ available: true, detail: expect.stringContaining('Heals 6') });

    tap(controller, rowFor(controller, 'bram').box);

    expect(character(party, 'bram').hitPoints).toBe(character(party, 'bram').maxHitPoints);
    expect(tickCount(state)).toBe(1);
    expect(rowFor(controller, 'Heal').detail).toBe('Heals 10 · 2/3 slots');
  });

  // @spec PRESENT-SPELLS-004
  // @spec PRESENT-SPELLS-005
  it('shows a mage\'s Overchannel price for a spell out of slots, or greys it too hurt to pay', () => {
    const { controller, party } = harness();
    const isolde = character(party, 'isolde');
    isolde.learnedSpells = ['mend'];
    isolde.spentSlots = { 1: 3 };
    pressKey(controller, 'c');
    pressKey(controller, '2');
    expect(rowFor(controller, 'Mend')).toMatchObject({ available: true, detail: expect.stringContaining('6 HP') });

    isolde.hitPoints = 6;
    pressKey(controller, 'd');
    pressKey(controller, 'a');
    expect(rowFor(controller, 'Mend')).toMatchObject({ available: false, detail: 'Too hurt to pay' });
  });

  // @spec PRESENT-SPELLS-006
  it('greys an unconscious target with the reason', () => {
    const { controller, party } = harness();
    character(party, 'wren').spentCharges = 1;
    applyDamage(party, 'bram', 999);
    character(party, 'isolde').hitPoints -= 2;
    pressKey(controller, 'c');
    pressKey(controller, 'Enter');

    expect(rowFor(controller, 'bram')).toMatchObject({ available: false, detail: expect.stringContaining('Unconscious') });
  });

  // @spec PRESENT-SPELLS-008
  it('backs out of choosing a target to the list of spells, casting nothing', () => {
    const { controller, state } = harness();
    pressKey(controller, 'c');
    pressKey(controller, 'Enter');
    expect(rowFor(controller, 'wren')).toBeTruthy();

    pressKey(controller, 'Escape');

    expect(rowFor(controller, 'Heal')).toBeTruthy();
    expect(plan(controller, 'spells')).not.toBeNull();
    expect(tickCount(state)).toBe(0);
  });
});

describe('camping', () => {
  // @spec PRESENT-CAMP-004
  it('restores slots and opens the camp screen on a rest', () => {
    const { controller, party, state } = harness();
    character(party, 'wren').spentSlots = { 1: 2 };

    pressKey(controller, 'r');

    expect(plan(controller, 'camp').title.position).toBe('The party rests. Spell slots are restored.');
    expect(character(party, 'wren').spentSlots).toEqual({});
    expect(tickCount(state)).toBeGreaterThan(0);
  });

  // @spec PRESENT-CAMP-002
  it('reports a camp refused with an enemy in sight', () => {
    const { controller, state } = harness({ roamers: [{ id: 'r1', floorId: 'f1', x: 6, y: 4, band: { members: [] } }] });

    pressKey(controller, 'r');

    expect(plan(controller, 'chest').find.items[0].text).toBe('An enemy is in sight. The party cannot camp here.');
    expect(tickCount(state)).toBe(0);
  });

  // @spec PRESENT-CAMP-003
  it('holds the input until it is put away, then changes nothing', () => {
    const { controller, state } = harness({ roamers: [{ id: 'r1', floorId: 'f1', x: 6, y: 4, band: { members: [] } }] });
    pressKey(controller, 'r');
    const ticks = tickCount(state);

    pressKey(controller, 'w');
    expect(state.party.tile).toEqual({ x: 6, y: 6 });
    expect(plan(controller, 'chest')).not.toBeNull();

    pressKey(controller, 'r');
    expect(plan(controller, 'chest')).toBeNull();
    expect(tickCount(state)).toBe(ticks);
  });
});

describe('a tome on the Items screen', () => {
  const tome = () => createItem({
    id: 'tome_of_fire_bolt', name: 'Tome of Fire Bolt', kind: ItemKind.CONSUMABLE, rarity: 'RARE',
    effect: { teach: 'fire_bolt' },
  });
  const itemRow = (controller, name) =>
    plan(controller, 'items').entries.find((e) => e.kind === 'ROW' && e.name === name);

  // @spec MAGIC-KNOW-003
  // @spec MAGIC-KNOW-004
  it('says what it teaches, greys it for who cannot read it, and teaches who can', () => {
    const { controller, party, state } = harness();
    stow(party, tome());
    pressKey(controller, 'i');

    // Bram's page first: a fighter cannot read it.
    expect(itemRow(controller, 'Tome of Fire Bolt')).toMatchObject({ available: false, detail: 'Rare · Mage only' });

    pressKey(controller, 'd');
    expect(itemRow(controller, 'Tome of Fire Bolt')).toMatchObject({ available: true, detail: 'Rare · Teaches Fire Bolt' });
    tap(controller, itemRow(controller, 'Tome of Fire Bolt').box);

    expect(character(party, 'isolde').learnedSpells).toEqual(['fire_bolt']);
    expect(packOf(party)).toHaveLength(0);
    expect(tickCount(state)).toBe(1);
  });
});

describe('casting in a fight by the keys', () => {
  // @spec PRESENT-MENU-012
  // @spec PRESENT-MENU-017
  it('casts Magic Missile with the number keys: Magic, the spell, then whom', () => {
    const { controller, state, party } = harness();
    const campaign = controller.campaign;
    for (const c of party.members) c.attack = { skill: 'BLADE', baseDamage: 2 };
    campaign.encounter = beginEncounter({
      party,
      enemies: createEnemyGroup([
        createEnemy({ id: 'g1', name: 'Goblin', maxHitPoints: 90, potValue: 14, armour: 3, attack: { baseDamage: 1 } }),
      ]),
      rng: makeRng(3), origin: { floorId: 'f1', x: 6, y: 6 }, spells: campaign.spells,
    });
    state.combatActive = true;

    // Play on until Isolde is asked, everyone else swinging at the goblin or passing.
    pressKey(controller, 'Escape');
    for (let i = 0; i < 60 && controller.fight.pending?.characterId !== 'isolde'; i++) {
      if (!controller.fight.pending) playEnemyTurn(controller.fight);
      else if (controller.fight.pending.mustPass) pressKey(controller, 'Enter');
      else { pressKey(controller, '1'); pressKey(controller, '1'); }
    }
    expect(controller.fight.pending.characterId).toBe('isolde');
    const goblin = campaign.encounter.enemies.members[0];
    const before = goblin.hitPoints;

    pressKey(controller, '2');
    pressKey(controller, '1');
    pressKey(controller, '1');

    expect(goblin.hitPoints).toBe(before - 7);
    expect(character(party, 'isolde').spentSlots[1]).toBe(1);
  });
});
