/**
 * The campaign save: what is written, when, and what happens on reading it back.
 *
 * Storage is handed in rather than reached for, so the rules can be tested against a
 * fake and the simulation below stays free of the browser.
 */

import { createCampaign } from './campaign.js';
import { ArrivalRule } from '../sim/generation.js';
import { TileFeature } from '../sim/floor.js';

export const SAVE_KEY = 'deepcrawl.save';

/** The schema a save is written in. Raise it, and add a migration, when the shape changes. */
export const SAVE_FORMAT = 3;

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

/** Each step takes a save from the version it is keyed by to the next. */
const MIGRATIONS = { 1: addWaysBack, 2: addPack };

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
export function createAutosave({ storage, read, onStatus = () => {}, canWrite = true }) {
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

  return { touch, flush };
}
