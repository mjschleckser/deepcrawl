import { describe, it, expect, vi } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { actionForKey } from '../sim/input.js';
import { perform, resolveConfirmation } from '../sim/exploration.js';
import { TileFeature } from '../sim/floor.js';
import { character, packOf, purseOf, roster, takeOff } from '../sim/party.js';
import { readinessOf } from '../sim/combat.js';
import {
  chooseOption, createFightController, playEnemyTurn, FightPhase,
} from '../render/fight.js';
import { createCampaign } from './campaign.js';
import { itemById } from './items.js';
import { enemyDefinitions } from './combatants.js';
import {
  SAVE_FORMAT, SAVE_KEY, TESTING_KEY, WRITE_DELAY_MS, createAutosave, encodeCampaign, migrate, openCampaign,
  startCampaign, readTestingMode, writeTestingMode,
} from './savegame.js';

const fakeStorage = (seeded = {}) => {
  const items = new Map(Object.entries(seeded));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
  };
};

/** Through JSON and back, as a save really travels. */
const reloaded = (campaign) =>
  createCampaign({ saved: JSON.parse(encodeCampaign(campaign)) });

/** Wander, the same way for the same generator, stopping if a fight begins. */
function walk(campaign, steps, rng) {
  for (let i = 0; i < steps && !campaign.encounter; i++) {
    perform(campaign.state, actionForKey(rng.pick(['w', 'w', 'w', 'a', 'd', 's'])));
    if (campaign.state.pendingConfirmation) resolveConfirmation(campaign.state, false);
  }
  return campaign;
}

/** A campaign walked into its first fight, from whichever seed reaches one soonest. */
function campaignInAFight() {
  for (let seed = 1; seed <= 60; seed++) {
    const campaign = walk(createCampaign({ seed }), 600, makeRng(seed));
    if (campaign.encounter) return campaign;
  }
  throw new Error('no seed walked into a fight');
}

/** Play a fight by the same simple choices, and report what happened. */
function playOn(campaign, turns) {
  const fight = createFightController({ encounter: campaign.encounter, viewport: { width: 390, height: 844 }, onDraw: vi.fn() });
  for (let i = 0; i < turns && fight.phase === FightPhase.ACTING; i++) {
    if (fight.pending) {
      chooseOption(fight, 0);
      if (fight.pending?.targets) chooseOption(fight, 0);
    } else {
      playEnemyTurn(fight);
    }
  }
  return {
    log: fight.log,
    actor: fight.actor?.id ?? null,
    party: roster(campaign.party).map((c) => [c.id, c.hitPoints, c.condition]),
    enemies: campaign.encounter.enemies.members.map((e) => [e.id, e.hitPoints, e.condition]),
  };
}

describe('what a save holds', () => {
  // @spec SAVE-HOLD-001
  it('carries everything a campaign is made of', () => {
    const saved = JSON.parse(encodeCampaign(createCampaign({ seed: 5 })));

    expect(saved.version).toBe(SAVE_FORMAT);
    for (const part of ['plan', 'rng', 'exploration', 'party']) expect(saved[part]).toBeDefined();
    expect(saved.encounter).toBeNull();
  });

  // @spec SAVE-HOLD-002
  it('keeps the plan it saved, whatever the seed would generate now', () => {
    const saved = JSON.parse(encodeCampaign(createCampaign({ seed: 5 })));
    saved.plan.marker = 'from the save';

    expect(createCampaign({ saved }).plan.marker).toBe('from the save');
  });

  // @spec SAVE-HOLD-003
  it('rebuilds a generator from where it had reached', () => {
    const rng = makeRng(99);
    rng.next();
    rng.next();
    const copy = makeRng(rng.position());

    expect([copy.next(), copy.next()]).toEqual([rng.next(), rng.next()]);
  });

  // @spec SAVE-HOLD-004
  // @spec SAVE-HOLD-009
  it('gives every restored roamer a working generator', () => {
    const restored = reloaded(createCampaign({ seed: 5 }));

    expect(restored.state.roamers.length).toBeGreaterThan(0);
    for (const roamer of restored.state.roamers) expect(typeof roamer.rng.shuffle).toBe('function');
  });

  // @spec SAVE-HOLD-005
  it('restores a fight with its bars, its beats and what has been used', () => {
    const campaign = campaignInAFight();
    playOn(campaign, 3);
    const before = campaign.encounter;

    const after = reloaded(campaign).encounter;

    expect([...after.readiness]).toEqual([...before.readiness]);
    expect(after.beats).toBe(before.beats);
    expect(after.potBanked).toBe(before.potBanked);
    expect(after.roamerId).toBe(before.roamerId);
    expect(after.origin).toEqual(before.origin);
    expect([...after.skillsUsed]).toEqual([...before.skillsUsed]);
    expect([...after.skillsByActor.keys()]).toEqual([...before.skillsByActor.keys()]);
    expect(after.enemies.members.map((e) => e.hitPoints))
      .toEqual(before.enemies.members.map((e) => e.hitPoints));
  });

  // @spec SAVE-HOLD-006
  it('points a restored fight at the restored party, not a copy of it', () => {
    const restored = reloaded(campaignInAFight());

    expect(restored.encounter.party).toBe(restored.party);
  });

  // @spec SAVE-HOLD-007
  it('keeps a standing prompt and a pending fall', () => {
    const campaign = createCampaign({ seed: 5 });
    campaign.state.pendingConfirmation = { kind: 'STAIRS' };
    campaign.state.pendingFall = { x: 1, y: 2 };

    const { state } = reloaded(campaign);

    expect(state.pendingConfirmation).toEqual({ kind: 'STAIRS' });
    expect(state.pendingFall).toEqual({ x: 1, y: 2 });
  });

  // @spec SAVE-HOLD-008
  it('saves neither the log nor whether a menu is open', () => {
    const campaign = campaignInAFight();
    const text = encodeCampaign(campaign);

    expect(text).not.toContain('"log"');
    expect(text).not.toContain('"pending"');
  });

  // @spec SAVE-HOLD-009
  it('saves what a character has earned and carries', () => {
    const campaign = createCampaign({ seed: 5 });
    const [first] = roster(campaign.party);
    first.hitPoints -= 3;

    const restored = character(reloaded(campaign).party, first.id);

    expect(restored).toEqual(JSON.parse(JSON.stringify(first)));
  });
});

describe('resuming', () => {
  // @spec SAVE-READ-002
  // @spec SAVE-HOLD-009
  it('walks on exactly as the campaign it was saved from would have', () => {
    const original = walk(createCampaign({ seed: 21 }), 60, makeRng(1));
    if (original.encounter) throw new Error('pick a seed that stays out of a fight');
    const restored = reloaded(original);

    walk(original, 120, makeRng(2));
    walk(restored, 120, makeRng(2));

    expect(encodeCampaign(restored)).toBe(encodeCampaign(original));
  });

  // @spec SAVE-READ-003
  it('resumes a fight on the turn it was saved on', () => {
    const campaign = campaignInAFight();
    const fight = createFightController({ encounter: campaign.encounter, viewport: { width: 390, height: 844 }, onDraw: vi.fn() });
    const whose = fight.actor.id;

    const restored = reloaded(campaign);
    const resumed = createFightController({ encounter: restored.encounter, viewport: { width: 390, height: 844 }, onDraw: vi.fn() });

    expect(resumed.actor.id).toBe(whose);
    expect(readinessOf(restored.encounter, whose)).toBe(readinessOf(campaign.encounter, whose));
  });

  // @spec SAVE-READ-004
  it('plays a resumed fight out exactly as if nothing had been saved', () => {
    const campaign = campaignInAFight();
    playOn(campaign, 2);
    const restored = reloaded(campaign);

    expect(playOn(restored, 12)).toEqual(playOn(campaign, 12));
  });

  // @spec SAVE-READ-001
  it('begins a new campaign when there is no save', () => {
    const { campaign, setAside } = openCampaign(fakeStorage());

    expect(campaign.state).toBeTruthy();
    expect(setAside).toBe(false);
  });

  // @spec SAVE-READ-002
  it('resumes what storage holds', () => {
    const first = walk(createCampaign({ seed: 21 }), 30, makeRng(1));
    const storage = fakeStorage({ [SAVE_KEY]: encodeCampaign(first) });

    const { campaign } = openCampaign(storage);

    expect(campaign.state.party).toEqual(first.state.party);
    expect(campaign.state.ticks).toBe(first.state.ticks);
  });

  // @spec SAVE-READ-005
  it('walks an old save up through every migration, in order', () => {
    const seen = [];
    const steps = {
      1: (save) => { seen.push(1); return { ...save, one: true }; },
      2: (save) => { seen.push(2); return { ...save, two: true }; },
    };

    const migrated = migrate({ version: 1 }, steps, 3);

    expect(seen).toEqual([1, 2]);
    expect(migrated).toEqual({ version: 3, one: true, two: true });
  });

  /** A save as version 1 wrote it: a floor below the entrance built, no way back up. */
  function versionOneSave() {
    const campaign = createCampaign({ seed: 5 });
    campaign.state.getFloor(campaign.plan.floors[1].id);
    const saved = JSON.parse(encodeCampaign(campaign));
    saved.version = 1;
    for (const floor of saved.plan.floors) delete floor.up;
    for (const floor of saved.exploration.floors) {
      for (const tile of floor.tiles) {
        if (tile.feature === TileFeature.STAIRS_UP) delete tile.target;
      }
    }
    return saved;
  }

  const upstairs = (floor) => floor.tiles.find((t) => t.feature === TileFeature.STAIRS_UP);

  // @spec SAVE-READ-005
  // @spec GEN-PLAN-009
  it('gives a version 1 save its ways back up, on built floors and on those still to come', () => {
    const resumed = createCampaign({ saved: migrate(versionOneSave()) });
    const [first, second, third] = resumed.plan.floors;

    expect(upstairs(resumed.state.getFloor(first.id)).target).toBeUndefined();
    expect(upstairs(resumed.state.getFloor(second.id)).target)
      .toEqual({ floorId: first.id, arriveAt: 'STAIRS_DOWN' });
    expect(upstairs(resumed.state.getFloor(third.id)).target)
      .toEqual({ floorId: second.id, arriveAt: 'STAIRS_DOWN' });
  });

  // @spec SAVE-READ-005
  it('drops a version 1 prompt over a staircase that still leads nowhere', () => {
    const saved = versionOneSave();
    saved.exploration.pendingConfirmation = {
      kind: 'STAIRS', feature: TileFeature.STAIRS_UP, tile: { x: 1, y: 1 },
    };

    expect(migrate(saved).exploration.pendingConfirmation).toBeNull();
  });

  // @spec SAVE-READ-005
  // @spec PARTY-SAVE-003
  it('gives a version 2 save an empty pack, and resumes it', () => {
    const saved = JSON.parse(encodeCampaign(createCampaign({ seed: 5 })));
    saved.version = 2;
    delete saved.party.pack;

    const migrated = migrate(saved);
    const resumed = createCampaign({ saved: migrated });

    expect(migrated.version).toBe(SAVE_FORMAT);
    expect(migrated.party.pack).toEqual([]);
    expect(packOf(resumed.party)).toEqual([]);
  });

  /** A save as version 3 wrote it: no purse, no opened chests, nothing carrying a table or a rarity. */
  function versionThreeSave() {
    const campaign = createCampaign({ seed: 5 });
    const bram = roster(campaign.party)[0];
    takeOff(campaign.party, bram.id, 'MAIN_HAND');
    const saved = JSON.parse(encodeCampaign(campaign));
    saved.version = 3;
    delete saved.party.purse;
    delete saved.exploration.openedChests;
    for (const item of [...saved.party.pack, ...saved.party.members.flatMap((c) => Object.values(c.equipment))]) {
      delete item.rarity;
      delete item.effect;
    }
    for (const roamer of saved.exploration.roamers) {
      for (const member of roamer.band.members) delete member.loot;
    }
    saved.encounter = {
      enemies: { members: [{ id: 'GOBLIN_ARCHER-1', name: 'Goblin Archer' }, { id: 'WOLF-0', name: 'Wolf' }] },
    };
    return saved;
  }

  // @spec SAVE-READ-005
  // @spec SAVE-READ-008
  it('gives a version 3 save an empty purse and no chest opened', () => {
    const migrated = migrate(versionThreeSave());

    expect(migrated.version).toBe(SAVE_FORMAT);
    expect(migrated.party.purse).toBe(0);
    expect(migrated.exploration.openedChests).toEqual({});
  });

  // @spec SAVE-READ-009
  it('gives enemies already placed the table their roster entry names, and none to a stranger', () => {
    const migrated = migrate(versionThreeSave());

    const members = migrated.exploration.roamers.flatMap((r) => r.band.members);
    expect(members.length).toBeGreaterThan(0);
    const roster = enemyDefinitions();
    for (const member of members) expect(member.loot).toBe(roster[member.id]?.loot ?? roster[member.id.replace(/-\d+$/, '')].loot);
    expect(migrated.encounter.enemies.members.map((e) => e.loot)).toEqual(['goblin_archer', null]);
  });

  // @spec SAVE-READ-010
  it('reads every item from before rarity as common', () => {
    const migrated = migrate(versionThreeSave());

    const items = [...migrated.party.pack, ...migrated.party.members.flatMap((c) => Object.values(c.equipment))];
    expect(items.length).toBeGreaterThan(1);
    for (const item of items) expect(item.rarity).toBe('COMMON');
  });

  function versionFourSave() {
    const campaign = createCampaign({ seed: 5 });
    const bram = roster(campaign.party)[0];
    takeOff(campaign.party, bram.id, 'MAIN_HAND');
    const saved = JSON.parse(encodeCampaign(campaign));
    saved.version = 4;
    const items = [...saved.party.pack, ...saved.party.members.flatMap((c) => Object.values(c.equipment))];
    for (const item of items) {
      if (item.kind === 'WEAPON') item.accuracy = 22;
      if (item.kind === 'SHIELD') { delete item.armour; item.defence = 4; }
    }
    saved.party.pack.push({ id: 'lost_buckler', name: 'Lost buckler', kind: 'SHIELD', slot: 'OFF_HAND', defence: 9 });
    for (const c of saved.party.members) {
      c.attributes.PERCEPTION = 12;
      if (c.attack) c.attack.accuracy = 30;
    }
    for (const roamer of saved.exploration.roamers) {
      for (const member of roamer.band.members) {
        member.attributes.PERCEPTION = 4;
        member.attack.accuracy = 24;
      }
    }
    saved.encounter = {
      enemies: { members: [{ id: 'GOBLIN-0', attributes: { DEXTERITY: 7, PERCEPTION: 4 }, attack: { baseDamage: 5, accuracy: 24 } }] },
    };
    return saved;
  }

  // @spec SAVE-READ-011
  it('drops accuracy and Perception from a version 4 save, and arms its shields with armour', () => {
    const migrated = migrate(versionFourSave());
    const text = JSON.stringify(migrated);

    expect(migrated.version).toBe(SAVE_FORMAT);
    expect(text).not.toMatch(/"accuracy"|"PERCEPTION"|"defence"/);

    const items = [...migrated.party.pack, ...migrated.party.members.flatMap((c) => Object.values(c.equipment))];
    const shields = items.filter((i) => i.kind === 'SHIELD');
    expect(shields.length).toBeGreaterThan(1);
    for (const shield of shields) {
      expect(shield.armour).toBe(itemById(shield.id)?.armour ?? 0);
    }
    expect(shields.find((i) => i.id === 'round_shield').armour).toBeGreaterThan(0);
    expect(shields.find((i) => i.id === 'lost_buckler').armour).toBe(0);
  });

  // @spec SAVE-READ-011
  it('resumes a version 4 save', () => {
    const saved = versionFourSave();
    saved.encounter = null;
    const resumed = createCampaign({ saved: migrate(saved) });
    expect(Object.keys(roster(resumed.party)[0].attributes)).not.toContain('PERCEPTION');
  });

  // @spec SAVE-READ-008
  it('resumes a version 3 save with the purse empty', () => {
    const saved = versionThreeSave();
    saved.encounter = null;

    const resumed = createCampaign({ saved: migrate(saved) });
    expect(purseOf(resumed.party)).toBe(0);
  });

  // @spec PARTY-SAVE-003
  it('keeps what the pack holds through a save', () => {
    const campaign = createCampaign({ seed: 5 });
    const bram = roster(campaign.party)[0];
    takeOff(campaign.party, bram.id, 'MAIN_HAND');

    const resumed = createCampaign({ saved: JSON.parse(encodeCampaign(campaign)) });

    expect(packOf(resumed.party).map((i) => i.id)).toEqual(packOf(campaign.party).map((i) => i.id));
    // Six rations to start, and the sword taken off.
    expect(packOf(resumed.party)).toHaveLength(7);
  });

  // @spec SAVE-READ-006
  // @spec SAVE-READ-007
  it.each([
    ['broken JSON', '{not a save'],
    ['a later version', JSON.stringify({ version: SAVE_FORMAT + 1 })],
    ['a save missing its contents', JSON.stringify({ version: SAVE_FORMAT })],
  ])('sets aside %s rather than overwriting it', (_, raw) => {
    const storage = fakeStorage({ [SAVE_KEY]: raw });

    const { campaign, setAside, canWrite } = openCampaign(storage, { now: () => 123 });

    expect(campaign.state).toBeTruthy();
    expect(setAside).toBe(true);
    expect(canWrite).toBe(true);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(storage.getItem(`${SAVE_KEY}.unreadable.123`)).toBe(raw);
  });

  // @spec SAVE-READ-007
  it('writes nothing over an unreadable save it could not move', () => {
    const storage = fakeStorage({ [SAVE_KEY]: '{not a save' });
    storage.setItem = () => { throw new Error('full'); };

    const { campaign, canWrite } = openCampaign(storage);
    const onStatus = vi.fn();
    const autosave = createAutosave({ storage, read: () => campaign, canWrite, onStatus });
    autosave.flush();

    expect(canWrite).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe('{not a save');
    expect(onStatus).toHaveBeenCalledWith(false);
  });
});

describe('writing a save', () => {
  const setUp = () => {
    vi.useFakeTimers();
    const campaign = createCampaign({ seed: 21 });
    const storage = fakeStorage();
    const onStatus = vi.fn();
    return { campaign, storage, onStatus, autosave: createAutosave({ storage, read: () => campaign, onStatus }) };
  };

  // @spec SAVE-WRITE-001
  it('writes once, a moment after a run of changes', () => {
    const { storage, autosave } = setUp();
    const setItem = vi.spyOn(storage, 'setItem');

    autosave.touch();
    vi.advanceTimersByTime(WRITE_DELAY_MS / 2);
    autosave.touch();
    expect(setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WRITE_DELAY_MS);
    expect(setItem).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  // @spec SAVE-WRITE-002
  it('writes at once when told the page is going', () => {
    const { storage, autosave } = setUp();

    autosave.touch();
    autosave.flush();

    expect(storage.getItem(SAVE_KEY)).toBeTruthy();
    vi.useRealTimers();
  });

  // @spec SAVE-WRITE-004
  it('writes nothing when nothing has changed since the last write', () => {
    const { storage, autosave } = setUp();
    autosave.flush();
    const setItem = vi.spyOn(storage, 'setItem');

    autosave.touch();
    autosave.flush();

    expect(setItem).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  // @spec SAVE-STORE-001
  it('keeps the whole campaign under one key', () => {
    const { storage, autosave } = setUp();

    autosave.flush();

    expect([...storage.items.keys()]).toEqual([SAVE_KEY]);
    vi.useRealTimers();
  });

  // @spec SAVE-STORE-002
  // @spec SAVE-STORE-003
  it('carries on through a failed write, reports it, and reports recovery', () => {
    const { campaign, storage, onStatus, autosave } = setUp();
    const realSet = storage.setItem;
    storage.setItem = () => { throw new Error('quota'); };

    expect(() => autosave.flush()).not.toThrow();
    expect(onStatus).toHaveBeenLastCalledWith(false);

    storage.setItem = realSet;
    campaign.state.party.facing = 'SOUTH';
    autosave.flush();
    expect(onStatus).toHaveBeenLastCalledWith(true);
    vi.useRealTimers();
  });

  // @spec SAVE-STORE-002
  it('reports not saving when there is no storage at all', () => {
    const campaign = createCampaign({ seed: 21 });
    const onStatus = vi.fn();

    createAutosave({ storage: null, read: () => campaign, onStatus }).flush();

    expect(onStatus).toHaveBeenCalledWith(false);
  });
});

describe('testing mode', () => {
  // @spec SAVE-TEST-001
  it('is on until it is stored as off, and is stored apart from the save', () => {
    const storage = fakeStorage();
    expect(readTestingMode(storage)).toBe(true);
    expect(readTestingMode(null)).toBe(true);

    writeTestingMode(storage, false);
    expect(readTestingMode(storage)).toBe(false);
    expect(storage.items.has(SAVE_KEY)).toBe(false);
    expect(storage.items.get(TESTING_KEY)).toBe('off');
  });

  // @spec SAVE-TEST-002
  // @spec SAVE-TEST-003
  it('begins a testing campaign, leaving any save in storage untouched, and writes nothing', () => {
    const text = encodeCampaign(createCampaign({ seed: 5 }));
    const storage = fakeStorage({ [SAVE_KEY]: text });
    const getItem = vi.spyOn(storage, 'getItem');
    const fresh = createCampaign({ seed: 9 });
    const create = vi.fn(() => fresh);

    const opened = startCampaign(storage, { testing: true, create });

    expect(getItem).not.toHaveBeenCalledWith(SAVE_KEY);
    expect(create).toHaveBeenCalledWith({ testing: true });
    expect(opened).toMatchObject({ campaign: fresh, canWrite: false, setAside: false, testing: true });

    const autosave = createAutosave({ storage, read: () => opened.campaign, canWrite: opened.canWrite });
    autosave.flush();
    expect([...storage.items.keys()]).toEqual([SAVE_KEY]);
    expect(storage.items.get(SAVE_KEY)).toBe(text);
  });

  it('opens the save as before when testing mode is off', () => {
    const saved = createCampaign({ seed: 5 });
    const storage = fakeStorage({ [SAVE_KEY]: encodeCampaign(saved), [TESTING_KEY]: 'off' });

    const opened = startCampaign(storage);

    expect(opened).toMatchObject({ canWrite: true, testing: false });
    expect(JSON.stringify(opened.campaign.snapshot())).toBe(JSON.stringify(saved.snapshot()));
  });

  // @spec SAVE-TEST-005
  it('lets an autosave be told it may write again', () => {
    const storage = fakeStorage();
    const campaign = createCampaign({ seed: 5 });
    const autosave = createAutosave({ storage, read: () => campaign, canWrite: false });
    autosave.flush();
    expect(storage.items.has(SAVE_KEY)).toBe(false);

    autosave.setCanWrite(true);
    autosave.flush();
    expect(storage.items.has(SAVE_KEY)).toBe(true);
  });
});
