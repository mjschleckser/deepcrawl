import { describe, it, expect } from 'vitest';
import { TileFeature } from '../sim/floor.js';
import { perform, PartyAction, computeSight } from '../sim/exploration.js';
import { packOf, purseOf } from '../sim/party.js';
import { DEFAULT_ARCHETYPE } from '../sim/generation.js';
import { createLootTable } from '../sim/loot.js';
import { createCampaign } from './campaign.js';
import { encodeCampaign, migrate } from './savegame.js';
import { checkArchetype, chestOutpaysDrops, lootTables } from './loot.js';
import { enemyDefinitions } from './combatants.js';

/** Where each chest on the campaign's first floor stands, in the order they were numbered. */
function chestsOf(campaign) {
  const floor = campaign.state.getFloor(campaign.state.party.floorId);
  return floor.tiles
    .map((t, i) => ({ t, x: i % floor.width, y: Math.floor(i / floor.width) }))
    .filter(({ t }) => t.feature === TileFeature.CHEST)
    .sort((a, b) => a.t.chest - b.t.chest);
}

/** A seed whose first floor holds at least two chests, so order can be tested. */
const SEED = (() => {
  for (let seed = 1; seed < 500; seed++) {
    if (chestsOf(createCampaign({ seed })).length >= 2) return seed;
  }
  throw new Error('no seed with two chests');
})();

/** The campaign's first floor, with the party standing on one of its chests. */
function onAChest(which = 0, campaign = createCampaign({ seed: SEED })) {
  const { x, y } = chestsOf(campaign)[which];
  campaign.state.party.tile = { x, y };
  computeSight(campaign.state);
  return campaign;
}

const open = (campaign) => perform(campaign.state, { partyAction: PartyAction.INTERACT, commit: true });

describe('opening a chest in a campaign', () => {
  // @spec LOOT-CHEST-001
  it('rolls the floor\'s chest table and puts the find in the purse and the pack', () => {
    const campaign = onAChest();
    const carried = packOf(campaign.party).map((i) => i.id);

    const { found } = open(campaign);

    expect(found.gold).toBeGreaterThan(0);
    expect(purseOf(campaign.party)).toBe(found.gold);
    expect(packOf(campaign.party).map((i) => i.id)).toEqual([...carried, ...found.items.map((i) => i.id)]);
  });

  // @spec LOOT-CHEST-002
  it('finds the same thing whatever happened first, and across a save and reload', () => {
    const first = open(onAChest(1)).found;

    // The same chest, opened after another one in a campaign on the same seed.
    const busy = onAChest(0);
    open(busy);
    expect(open(onAChest(1, busy)).found).toEqual(first);

    const reloaded = createCampaign({ saved: JSON.parse(encodeCampaign(createCampaign({ seed: SEED }))) });
    expect(open(onAChest(1, reloaded)).found).toEqual(first);
  });

  // @spec LOOT-CHEST-003
  it('yields nothing the second time', () => {
    const campaign = onAChest();
    const { found } = open(campaign);

    expect(open(campaign).found).toBeUndefined();
    expect(purseOf(campaign.party)).toBe(found.gold);
  });
});

describe('the tables chests and enemies name', () => {
  // @spec LOOT-DATA-002
  it('rejects an archetype naming a table nobody authored', () => {
    expect(() => checkArchetype({ ...DEFAULT_ARCHETYPE, name: 'crypt', chestTable: 'hoard' }, lootTables()))
      .toThrow(/archetype "crypt": loot table "hoard"/);
    expect(() => checkArchetype(DEFAULT_ARCHETYPE, lootTables())).not.toThrow();
  });

  // @spec LOOT-DATA-003
  it('holds the chest table richer than every enemy table on the same floors', () => {
    const tables = lootTables();
    const drops = Object.values(enemyDefinitions()).map((e) => tables[e.loot]).filter(Boolean);

    expect(drops.length).toBeGreaterThan(0);
    expect(chestOutpaysDrops(tables[DEFAULT_ARCHETYPE.chestTable], drops)).toEqual([]);
  });

  // @spec LOOT-DATA-003
  it('names every way a chest table falls short of a drop table', () => {
    const item = lootTables().goblin.items[0];
    const make = (over) => createLootTable({
      id: 'x', odds: { LEGENDARY: 0.01, EPIC: 0.02, RARE: 0.05, UNCOMMON: 0.1 },
      gold: { min: 5, max: 10 }, draws: { count: 2, chance: 1 }, items: [item], ...over,
    });

    const drop = make({ id: 'drop' });
    expect(chestOutpaysDrops(make({ id: 'same' }), [drop])).toHaveLength(1);
    const poor = make({ id: 'poor', odds: { LEGENDARY: 0.5, EPIC: 0, RARE: 0.5, UNCOMMON: 0.5 }, gold: { min: 1, max: 99 }, draws: { count: 1, chance: 1 } });
    const problems = chestOutpaysDrops(poor, [drop]);
    expect(problems.join(' ')).toMatch(/EPIC/);
    expect(problems.join(' ')).toMatch(/gold/);
    expect(problems.join(' ')).toMatch(/draws/);
  });
});

describe('an old save, and chests', () => {
  // @spec SAVE-READ-008
  it('gives floors a version 3 save has not built yet the chests they would have today', () => {
    const saved = JSON.parse(encodeCampaign(createCampaign({ seed: SEED })));
    saved.version = 3;
    for (const floor of saved.plan.floors) {
      delete floor.archetype.chests;
      delete floor.archetype.chestTable;
    }

    const migrated = migrate(saved);

    for (const floor of migrated.plan.floors) {
      expect(floor.archetype.chests).toEqual(DEFAULT_ARCHETYPE.chests);
      expect(floor.archetype.chestTable).toBe(DEFAULT_ARCHETYPE.chestTable);
    }
  });
});

describe('chests and re-stocking', () => {
  // @spec GEN-PLACE-012
  it('neither adds nor removes a chest when a floor is re-stocked', () => {
    const campaign = createCampaign({ seed: SEED });
    const floorId = campaign.state.party.floorId;
    const before = chestsOf(campaign).map(({ x, y, t }) => ({ x, y, chest: t.chest }));

    campaign.restockFloor(floorId, 5000);

    expect(chestsOf(campaign).map(({ x, y, t }) => ({ x, y, chest: t.chest }))).toEqual(before);
  });
});
