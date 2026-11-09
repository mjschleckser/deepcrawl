/**
 * The campaign save: what is written, when, and what happens on reading it back.
 *
 * Storage is handed in rather than reached for, so the rules can be tested against a
 * fake and the simulation below stays free of the browser.
 */

import { createCampaign } from './campaign.js';
import { ArrivalRule, DEFAULT_ARCHETYPE } from '../sim/generation.js';
import { TileFeature } from '../sim/floor.js';
import { enemyDefinitions } from './combatants.js';
import { itemById } from './items.js';

export const SAVE_KEY = 'deepcrawl.save';

/** The schema a save is written in. Raise it, and add a migration, when the shape changes. */
export const SAVE_FORMAT = 5;

/** Where testing mode is remembered, apart from the save. */
export const TESTING_KEY = 'deepcrawl.testing';

/**
 * Whether testing mode is on: on unless it has been stored as off, and on when storage
 * cannot even be asked.
 *
 * @spec SAVE-TEST-001
 */
export function readTestingMode(storage) {
  try {
    return storage?.getItem(TESTING_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** @spec SAVE-TEST-005 */
export function writeTestingMode(storage, on) {
  try {
    storage?.setItem(TESTING_KEY, on ? 'on' : 'off');
  } catch {
    // A setting that cannot be stored is still in force for this load.
  }
}

/** How long a change waits, so a run of steps becomes one write. */
export const WRITE_DELAY_MS = 1000;

/**
 * Version 1 laid stairs up that named no destination. Each is pointed back at the floor
 * whose stairs lead down to it, in the plan and on every floor already built. A prompt
 * left standing over one that still leads nowhere has nothing left to ask.
 */
function addWaysBack(save) {
  const above = new Map();
  for (const floor of save.plan.floors) {
    for (const link of floor.links) {
      if (link.via === TileFeature.STAIRS_DOWN) above.set(link.toFloorId, floor.id);
    }
  }
  const upFrom = (id) => (above.has(id)
    ? { toFloorId: above.get(id), arriveAt: ArrivalRule.STAIRS_DOWN }
    : null);
  const targetFrom = (id) => {
    const up = upFrom(id);
    return up ? { floorId: up.toFloorId, arriveAt: up.arriveAt } : undefined;
  };

  const { exploration } = save;
  const pending = exploration.pendingConfirmation;
  const destination = pending?.target ?? targetFrom(exploration.party.floorId);

  return {
    ...save,
    plan: { ...save.plan, floors: save.plan.floors.map((f) => ({ ...f, up: upFrom(f.id) })) },
    exploration: {
      ...exploration,
      pendingConfirmation: pending && destination ? { ...pending, target: destination } : null,
      floors: exploration.floors.map((floor) => ({
        ...floor,
        tiles: floor.tiles.map((tile) => (
          tile.feature === TileFeature.STAIRS_UP && !tile.target && above.has(floor.id)
            ? { ...tile, target: targetFrom(floor.id) }
            : tile
        )),
      })),
    },
  };
}

/**
 * Version 2 had no pack. The party carried nothing it was not wearing, so it begins
 * carrying nothing.
 *
 * @spec PARTY-SAVE-003
 */
function addPack(save) {
  return { ...save, party: { ...save.party, pack: save.party.pack ?? [] } };
}

/**
 * The roster entry an enemy was placed from. A roamer's member keeps the entry's own
 * identifier; an enemy in a fight carries the member's, which is the entry's with its
 * place in the band after it.
 */
function rosterEntryFor(enemy, roster) {
  if (roster[enemy.id]) return roster[enemy.id];
  const base = String(enemy.id).replace(/-\d+$/, '');
  return roster[base] ?? null;
}

/**
 * Version 3 had no loot. The party opens with an empty purse and every chest unopened,
 * every enemy already placed takes the table its roster entry names now, so a warband
 * standing in an old save drops what a new one would, and every item is common.
 *
 * @spec SAVE-READ-008
 * @spec SAVE-READ-009
 * @spec SAVE-READ-010
 */
function addLoot(save) {
  const roster = enemyDefinitions();
  const withTable = (enemy) => ({
    ...enemy,
    loot: enemy.loot ?? rosterEntryFor(enemy, roster)?.loot ?? null,
  });
  const common = (item) => (item ? { ...item, rarity: item.rarity ?? 'COMMON' } : item);
  const { party, exploration, encounter } = save;

  // A plan holds each floor's archetype whole, so floors not yet built take the chests
  // an archetype lays today.
  const plan = save.plan
    ? {
        ...save.plan,
        floors: save.plan.floors.map((f) => ({
          ...f,
          archetype: f.archetype
            ? {
                ...f.archetype,
                chests: f.archetype.chests ?? DEFAULT_ARCHETYPE.chests,
                chestTable: f.archetype.chestTable ?? DEFAULT_ARCHETYPE.chestTable,
              }
            : f.archetype,
        })),
      }
    : save.plan;

  return {
    ...save,
    plan,
    party: {
      ...party,
      purse: party.purse ?? 0,
      pack: (party.pack ?? []).map(common),
      members: party.members.map((c) => ({
        ...c,
        equipment: Object.fromEntries(Object.entries(c.equipment ?? {}).map(([slot, item]) => [slot, common(item)])),
      })),
    },
    exploration: {
      ...exploration,
      openedChests: exploration.openedChests ?? {},
      roamers: (exploration.roamers ?? []).map((roamer) => ({
        ...roamer,
        band: roamer.band ? { ...roamer.band, members: roamer.band.members.map(withTable) } : roamer.band,
      })),
    },
    encounter: encounter
      ? { ...encounter, enemies: { ...encounter.enemies, members: encounter.enemies.members.map(withTable) } }
      : encounter,
  };
}

/**
 * Version 4 still carried accuracy, defence and Perception. A weapon and an attack lose
 * their accuracy, every combatant loses its Perception, and a shield's defence becomes the
 * armour its own file gives that shield today, or none if no file names it.
 *
 * @spec SAVE-READ-011
 */
function retireToHit(save) {
  const item = (it) => {
    if (!it) return it;
    const { accuracy, defence, ...rest } = it;
    return rest.kind === 'SHIELD' ? { ...rest, armour: itemById(rest.id)?.armour ?? 0 } : rest;
  };
  const combatant = (c) => {
    if (!c) return c;
    const out = { ...c };
    if (c.attributes) {
      const { PERCEPTION, ...attributes } = c.attributes;
      out.attributes = attributes;
    }
    if (c.attack) {
      const { accuracy, ...attack } = c.attack;
      out.attack = attack;
    }
    if (c.equipment) {
      out.equipment = Object.fromEntries(Object.entries(c.equipment).map(([slot, it]) => [slot, item(it)]));
    }
    return out;
  };
  const band = (b) => (b ? { ...b, members: (b.members ?? []).map(combatant) } : b);
  const { party, exploration, encounter } = save;

  return {
    ...save,
    party: { ...party, pack: (party.pack ?? []).map(item), members: party.members.map(combatant) },
    exploration: {
      ...exploration,
      roamers: (exploration.roamers ?? []).map((roamer) => ({ ...roamer, band: band(roamer.band) })),
    },
    encounter: encounter ? { ...encounter, enemies: band(encounter.enemies) } : encounter,
  };
}

/** Each step takes a save from the version it is keyed by to the next. */
const MIGRATIONS = { 1: addWaysBack, 2: addPack, 3: addLoot, 4: retireToHit };

/** @spec SAVE-READ-005 */
export function migrate(save, migrations = MIGRATIONS, current = SAVE_FORMAT) {
  let migrated = save;
  for (let version = save.version; version < current; version++) {
    migrated = { ...migrations[version](migrated), version: version + 1 };
  }
  return migrated;
}

/** @spec SAVE-HOLD-009 */
export function encodeCampaign(campaign) {
  return JSON.stringify({ version: SAVE_FORMAT, ...campaign.snapshot() });
}

/**
 * Open whatever storage holds: resume it, or begin again if there is nothing there or
 * nothing that can be read. A save that cannot be read is moved aside whole, and if even
 * that fails nothing may be written over it, so the answer says so.
 *
 * @spec SAVE-READ-001
 * @spec SAVE-READ-002
 * @spec SAVE-READ-006
 * @spec SAVE-READ-007
 */
export function openCampaign(storage, { create = createCampaign, now = Date.now } = {}) {
  let raw = null;
  try {
    raw = storage?.getItem(SAVE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw === null) return { campaign: create(), setAside: false, canWrite: true };

  try {
    const parsed = JSON.parse(raw);
    if (!Number.isInteger(parsed?.version) || parsed.version > SAVE_FORMAT) {
      throw new Error('not a version this build can read');
    }
    return { campaign: create({ saved: migrate(parsed) }), setAside: false, canWrite: true };
  } catch {
    let moved = false;
    try {
      storage.setItem(`${SAVE_KEY}.unreadable.${now()}`, raw);
      storage.removeItem(SAVE_KEY);
      moved = true;
    } catch {
      moved = false;
    }
    return { campaign: create(), setAside: true, canWrite: moved };
  }
}

/**
 * The campaign the game opens on. In testing mode it is always a new testing campaign,
 * and storage's save is left exactly as it was; the answer says nothing may be written.
 *
 * @spec SAVE-TEST-002
 * @spec SAVE-TEST-003
 */
export function startCampaign(storage, { testing = readTestingMode(storage), create = createCampaign, now = Date.now } = {}) {
  if (testing) return { campaign: create({ testing: true }), setAside: false, canWrite: false, testing: true };
  return { ...openCampaign(storage, { create, now }), testing: false };
}

/**
 * Write the campaign a moment after it changes, and at once when asked. `read` is asked
 * each time, so a campaign begun again is the one that gets saved. A write that fails
 * stops nothing: it is reported, and the next change tries again.
 *
 * @spec SAVE-WRITE-001
 * @spec SAVE-WRITE-002
 * @spec SAVE-WRITE-004
 * @spec SAVE-STORE-001
 * @spec SAVE-STORE-002
 * @spec SAVE-STORE-003
 */
export function createAutosave({ storage, read, onStatus = () => {}, canWrite: initiallyWritable = true }) {
  let canWrite = initiallyWritable;
  let timer = null;
  let written = null;
  let saving = null;

  const report = (ok) => {
    if (ok === saving) return;
    saving = ok;
    onStatus(ok);
  };

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    if (!canWrite) return report(false);

    try {
      const text = encodeCampaign(read());
      if (text !== written) {
        storage.setItem(SAVE_KEY, text);
        written = text;
      }
      report(true);
    } catch {
      report(false);
    }
    return undefined;
  };

  const touch = () => {
    if (timer === null) timer = setTimeout(flush, WRITE_DELAY_MS);
  };

  // Switching testing mode changes whether this campaign may be written.
  // @spec SAVE-TEST-005
  const setCanWrite = (writable) => {
    canWrite = writable;
    written = null;
  };

  return { touch, flush, setCanWrite };
}
