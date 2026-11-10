import { describe, it, expect, vi } from 'vitest';
import { createCampaign } from '../content/campaign.js';
import { Outcome, createEnemy, createEnemyGroup, beginEncounter } from '../sim/combat.js';
import { setCombatActive } from '../sim/exploration.js';
import { applyDamage, roster } from '../sim/party.js';
import { makeRng } from '../sim/rng.js';
import {
  createController, layers, pressKey, pressPointer, replaceCampaign, setSaveNote, tick,
} from './controller.js';
import { MapMode } from './mapplan.js';
import { PartyControl } from './partyplan.js';
import { MIN_TAP_PX } from './geometry.js';

const viewport = { width: 390, height: 844 };

function setUp() {
  const campaign = createCampaign({ seed: 21 });
  const onBeginAgain = vi.fn();
  const onDraw = vi.fn();
  const controller = createController({
    state: campaign.state, campaign, viewport, onDraw, onBeginAgain,
  });
  return { campaign, controller, onBeginAgain, onDraw };
}

const layer = (controller, name) => layers(controller).find((l) => l.name === name).plan;
const centre = (c) => [c.x + c.width / 2, c.y + c.height / 2];

function openNewCampaign(controller) {
  pressKey(controller, 'p');
  const control = layer(controller, 'party').controls.find((c) => c.role === PartyControl.NEW_CAMPAIGN);
  pressPointer(controller, ...centre(control));
}

/** A fight the party has already lost, standing on its banner. */
function wiped() {
  const set = setUp();
  const { campaign, controller } = set;
  campaign.encounter = beginEncounter({
    party: campaign.party,
    enemies: createEnemyGroup([createEnemy({ id: 'g', name: 'Goblin', maxHitPoints: 9, potValue: 1 })]),
    rng: makeRng(1),
    origin: { floorId: campaign.state.party.floorId, x: 0, y: 0 },
  });
  setCombatActive(campaign.state, true);
  // Every Intercession spent first, so the wipe is a wipe.
  for (const c of roster(campaign.party)) c.spentCharges = 1;
  for (const c of roster(campaign.party)) applyDamage(campaign.party, c.id, 9999);
  tick(controller, 1);
  return set;
}

describe('New campaign on the party screen', () => {
  // @spec PRESENT-PARTY-020
  it('draws a thumb-sized control, below the character page', () => {
    const { controller } = setUp();
    pressKey(controller, 'p');
    const plan = layer(controller, 'party');
    const control = plan.controls.find((c) => c.role === PartyControl.NEW_CAMPAIGN);
    const lastLine = plan.equipment.at(-1).box;

    expect(control.label).toBe('New campaign');
    expect(control.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
    expect(control.y).toBeGreaterThanOrEqual(lastLine.y + lastLine.height);
    expect(control.y + control.height).toBeLessThanOrEqual(plan.bounds.y + plan.bounds.height);
  });

  // @spec PRESENT-PARTY-021
  // @spec SAVE-NEW-002
  it('asks first, and changes nothing by asking', () => {
    const { controller, onBeginAgain } = setUp();

    openNewCampaign(controller);

    const prompt = layer(controller, 'hud').prompt;
    expect(prompt.text).toBe('Abandon this campaign?');
    expect(prompt.controls).toHaveLength(2);
    expect(onBeginAgain).not.toHaveBeenCalled();
  });

  // @spec PRESENT-PARTY-022
  it.each([
    ['the decline control', (c) => {
      const decline = layer(c, 'hud').prompt.controls.find((x) => !x.accepted);
      pressPointer(c, ...centre(decline));
    }],
    ['Escape', (c) => pressKey(c, 'Escape')],
  ])('dismisses the question on %s, leaving the screen open', (_, answer) => {
    const { controller, onBeginAgain } = setUp();
    openNewCampaign(controller);

    answer(controller);

    expect(layer(controller, 'hud').prompt).toBeNull();
    expect(controller.partyScreen).not.toBeNull();
    expect(onBeginAgain).not.toHaveBeenCalled();
  });

  // @spec PRESENT-PARTY-022
  it('dismisses the question along with the screen', () => {
    const { controller, onBeginAgain } = setUp();
    openNewCampaign(controller);

    pressKey(controller, 'p');
    expect(controller.partyScreen).toBeNull();

    pressKey(controller, 'p');
    expect(layer(controller, 'hud').prompt).toBeNull();
    expect(onBeginAgain).not.toHaveBeenCalled();
  });

  // @spec PRESENT-PARTY-023
  it('begins again on confirmation, and closes the screen', () => {
    const { controller, onBeginAgain } = setUp();
    openNewCampaign(controller);

    const confirm = layer(controller, 'hud').prompt.controls.find((x) => x.accepted);
    pressPointer(controller, ...centre(confirm));

    expect(onBeginAgain).toHaveBeenCalledTimes(1);
    expect(controller.partyScreen).toBeNull();
  });

  // @spec PRESENT-PARTY-006
  it('lets nothing else through while the question stands', () => {
    const { controller } = setUp();
    openNewCampaign(controller);
    const page = controller.partyScreen.page;

    pressKey(controller, 'ArrowRight');

    expect(controller.partyScreen.page).toBe(page);
  });
});

describe('a wiped party', () => {
  // @spec PRESENT-FIGHT-049
  it('labels the banner Begin again', () => {
    const { controller } = wiped();
    const plan = layer(controller, 'fight');

    expect(plan.banner.outcome).toBe(Outcome.DEFEAT);
    expect(plan.controls.find((c) => c.role === 'DISMISS').label).toBe('Begin again');
  });

  // @spec PRESENT-FIGHT-049
  it('begins a new campaign when it is pressed', () => {
    const { controller, onBeginAgain } = wiped();
    const button = layer(controller, 'fight').controls.find((c) => c.role === 'DISMISS');

    pressPointer(controller, ...centre(button));

    expect(onBeginAgain).toHaveBeenCalledTimes(1);
  });

  // @spec PRESENT-FIGHT-049
  // @spec SAVE-NEW-002
  it('takes more than a stray Escape to end the campaign', () => {
    const { controller, onBeginAgain } = wiped();

    expect(pressKey(controller, 'Escape')).toBe(false);

    expect(onBeginAgain).not.toHaveBeenCalled();
  });
});

describe('what schedules a save', () => {
  // @spec SAVE-WRITE-003
  it('draws when an enemy strikes, which is the signal a save listens for', () => {
    const { campaign, controller, onDraw } = setUp();
    campaign.encounter = beginEncounter({
      party: campaign.party,
      enemies: createEnemyGroup([createEnemy({
        id: 'g', name: 'Goblin', maxHitPoints: 9, potValue: 1, attributes: { DEXTERITY: 99 },
      })]),
      rng: makeRng(1),
      origin: { floorId: campaign.state.party.floorId, x: 0, y: 0 },
    });
    setCombatActive(campaign.state, true);
    tick(controller, 1);
    expect(controller.fight.actor.id).toBe('g');
    onDraw.mockClear();

    tick(controller, 1000);

    expect(controller.fight.turnsTaken).toBeGreaterThan(0);
    expect(onDraw).toHaveBeenCalled();
  });
});

describe('replacing the campaign', () => {
  // @spec SAVE-NEW-001
  it('leaves nothing of the old campaign in play', () => {
    const { controller } = wiped();
    const fresh = createCampaign({ seed: 22 });

    replaceCampaign(controller, fresh);

    expect(controller.campaign).toBe(fresh);
    expect(controller.state).toBe(fresh.state);
    expect(controller.fight).toBeNull();
    expect(controller.partyScreen).toBeNull();
    expect(layer(controller, 'fight')).toBeNull();
  });

  // @spec PRESENT-MAP-013
  it('opens the new campaign with the map expanded', () => {
    const { controller } = wiped();
    controller.mapMode = MapMode.HIDDEN;

    replaceCampaign(controller, createCampaign({ seed: 22 }));

    expect(controller.mapMode).toBe(MapMode.EXPANDED);
  });
});

describe('the save note', () => {
  // @spec PRESENT-SAVE-003
  it('draws nothing while there is nothing to say', () => {
    expect(layer(setUp().controller, 'hud').note).toBeNull();
  });

  // @spec PRESENT-SAVE-001
  // @spec PRESENT-SAVE-002
  it('draws what it is told, by the stamp, in and out of a fight', () => {
    const { controller } = setUp();
    setSaveNote(controller, 'Not saving');
    const { note, stamp } = layer(controller, 'hud');

    expect(note.text).toBe('Not saving');
    // On the stamp's own line, after the number, and the stamp is placed clear of every
    // control at the width of both.
    expect(note.y).toBe(stamp.y);
    expect(note.x).toBeGreaterThan(stamp.x);
    expect(stamp.x + stamp.width).toBeGreaterThanOrEqual(note.x + note.width - 0.5);
    for (const c of layer(controller, 'hud').controls) {
      const overlaps = c.x < note.x + note.width && c.x + c.width > note.x
        && c.y < note.y + note.size && c.y + c.height > note.y;
      expect(overlaps).toBe(false);
    }

    const { controller: fighting } = wiped();
    setSaveNote(fighting, 'Old save set aside');
    expect(layer(fighting, 'hud').note.text).toBe('Old save set aside');
  });

  // @spec PRESENT-SAVE-003
  it('goes when it is cleared', () => {
    const { controller, onDraw } = setUp();
    setSaveNote(controller, 'Not saving');
    onDraw.mockClear();

    setSaveNote(controller, null);

    expect(layer(controller, 'hud').note).toBeNull();
    expect(onDraw).toHaveBeenCalledTimes(1);
  });
});

describe('the Testing control on the party screen', () => {
  function testing(on) {
    const campaign = createCampaign({ seed: 21, testing: on });
    const onToggleTesting = vi.fn();
    const controller = createController({
      state: campaign.state, campaign, viewport, onDraw: vi.fn(), onToggleTesting,
    });
    pressKey(controller, 'p');
    return { controller, onToggleTesting };
  }
  const control = (controller) => layer(controller, 'party').controls.find((c) => c.role === PartyControl.TESTING);

  // @spec PRESENT-PARTY-025
  it('says whether testing mode is on, thumb-sized and clear of the other controls', () => {
    const { controller } = testing(true);
    expect(control(controller).label).toBe('Testing: on');
    expect(control(controller).height).toBeGreaterThanOrEqual(MIN_TAP_PX);
    for (const other of layer(controller, 'party').controls.filter((c) => c.role !== PartyControl.TESTING)) {
      const c = control(controller);
      const overlaps = c.x < other.x + other.width && c.x + c.width > other.x && c.y < other.y + other.height && c.y + c.height > other.y;
      expect(overlaps).toBe(false);
    }
    expect(control(testing(false).controller).label).toBe('Testing: off');
  });

  // @spec PRESENT-PARTY-025
  it('asks before switching, and switches only on a confirmation', () => {
    const { controller, onToggleTesting } = testing(true);
    pressPointer(controller, ...centre(control(controller)));

    expect(layer(controller, 'hud').prompt.text).toBe('Turn testing mode off? This begins a new campaign.');
    pressKey(controller, 'Escape');
    expect(onToggleTesting).not.toHaveBeenCalled();
    expect(layer(controller, 'hud').prompt).toBeNull();

    pressPointer(controller, ...centre(control(controller)));
    pressKey(controller, 'Enter');
    expect(onToggleTesting).toHaveBeenCalledTimes(1);
    expect(layer(controller, 'party')).toBeNull();
  });
});
