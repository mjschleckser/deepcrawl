import { describe, it, expect, vi } from 'vitest';
import { createCampaign } from '../content/campaign.js';
import { itemById } from '../content/items.js';
import { computeSight, tickCount } from '../sim/exploration.js';
import { packOf, roster, stow, applyDamage } from '../sim/party.js';
import { createController, pressKey, pressPointer, layers } from './controller.js';
import { CampControl } from './campplan.js';

const viewport = { width: 390, height: 844 };

function harness() {
  const campaign = createCampaign({ seed: 11 });
  computeSight(campaign.state);
  campaign.state.roamers = [];
  const onDraw = vi.fn();
  const controller = createController({ state: campaign.state, campaign, viewport, onDraw });
  return { controller, campaign, state: campaign.state, party: campaign.party };
}

const plan = (controller, name) => layers(controller).find((l) => l.name === name)?.plan ?? null;
const rows = (controller) => plan(controller, 'camp').entries.filter((e) => e.kind === 'ROW');
const rowFor = (controller, name) => rows(controller).find((r) => r.name === name);
const tap = (controller, box) => pressPointer(controller, box.x + box.width / 2, box.y + box.height / 2);
const tapControl = (controller, role) =>
  tap(controller, plan(controller, 'camp').controls.find((c) => c.role === role));
const notes = (controller) => plan(controller, 'camp').entries.filter((e) => e.kind === 'NOTE').map((e) => e.text);

describe('the camp screen', () => {
  // @spec PRESENT-CAMP-004
  it('opens when a camp rests, saying what the rest did and what was foraged, and holds the input', () => {
    const { controller, state } = harness();

    pressKey(controller, 'r');

    const camp = plan(controller, 'camp');
    expect(camp.title.position).toBe('The party rests. Spell slots are restored.');
    expect(camp.entries.find((e) => e.kind === 'HEADING' && e.text.startsWith('Foraged:'))).toBeTruthy();
    expect(state.menuOpen).toBe(true);

    const at = { ...state.party.tile };
    pressKey(controller, 'w');
    expect(state.party.tile).toEqual(at);
  });

  // @spec PRESENT-CAMP-005
  it('lists the food carried, and puts one more in the pot per press, back to none from all', () => {
    const { controller } = harness();
    pressKey(controller, 'r');

    expect(rowFor(controller, 'Ration').detail).toContain('0 of 6 in the pot');
    tap(controller, rowFor(controller, 'Ration').box);
    tap(controller, rowFor(controller, 'Ration').box);
    expect(rowFor(controller, 'Ration').detail).toContain('2 of 6 in the pot');

    for (let i = 0; i < 4; i++) tap(controller, rowFor(controller, 'Ration').box);
    expect(rowFor(controller, 'Ration').detail).toContain('6 of 6 in the pot');
    tap(controller, rowFor(controller, 'Ration').box);
    expect(rowFor(controller, 'Ration').detail).toContain('0 of 6 in the pot');
  });

  // @spec PRESENT-CAMP-006
  it('adds and takes out with the keys', () => {
    const { controller } = harness();
    pressKey(controller, 'r');
    const ration = rows(controller).findIndex((r) => r.name === 'Ration');
    for (let i = 0; i < ration; i++) pressKey(controller, 's');

    pressKey(controller, 'd');
    pressKey(controller, 'ArrowRight');
    pressKey(controller, 'a');

    expect(rowFor(controller, 'Ration').detail).toContain('1 of 6 in the pot');
  });

  // @spec PRESENT-CAMP-007
  it('says what the pot would make, as the food segment reports it', () => {
    const { controller, party } = harness();
    stow(party, { ...itemById('goblin_haunch') });
    pressKey(controller, 'r');

    expect(notes(controller)).toEqual(['Nothing in the pot yet']);
    tap(controller, rowFor(controller, 'Goblin Haunch').box);

    // Cooking 1: 450 × 1.1, 8 × 1.1, hearty 3.3 × 2%.
    expect(notes(controller)).toEqual(['Each eats: +495 fullness, heals 9', 'Hearty: +7% damage']);
  });

  // @spec PRESENT-CAMP-008
  it('cooks on Cook, closes the screen and reports the meal', () => {
    const { controller, party, state } = harness();
    for (const c of roster(party)) { c.fullness = 300; c.hitPoints = 3; }
    pressKey(controller, 'r');
    tap(controller, rowFor(controller, 'Ration').box);

    tapControl(controller, CampControl.COOK);

    expect(plan(controller, 'camp')).toBeNull();
    expect(packOf(party).filter((i) => i.id === 'ration')).toHaveLength(5);
    for (const c of roster(party)) expect(c.fullness).toBeGreaterThan(300);
    const report = plan(controller, 'chest');
    expect(report.title).toBe('The party eats');
    expect(report.find.items[0].text).toBe('Each eats: +660 fullness, heals 2');
    expect(state.menuOpen).toBe(false);
  });

  // @spec PRESENT-CAMP-008
  it('cooks on Enter too', () => {
    const { controller, party } = harness();
    pressKey(controller, 'r');
    const ration = rows(controller).findIndex((r) => r.name === 'Ration');
    for (let i = 0; i < ration; i++) pressKey(controller, 's');
    pressKey(controller, 'd');

    pressKey(controller, 'Enter');

    expect(packOf(party).filter((i) => i.id === 'ration')).toHaveLength(5);
  });

  // @spec PRESENT-CAMP-009
  it('leaves without eating on Leave or Escape', () => {
    const { controller, party, state } = harness();
    pressKey(controller, 'r');
    tap(controller, rowFor(controller, 'Ration').box);

    pressKey(controller, 'Escape');

    expect(plan(controller, 'camp')).toBeNull();
    expect(packOf(party).filter((i) => i.id === 'ration')).toHaveLength(6);
    expect(state.menuOpen).toBe(false);
    // The pot is gone with the camp.
    expect(controller.campaign.cook([packOf(party)[0]])).toBeNull();
  });
});

describe('hunger', () => {
  // @spec PRESENT-HUNGER-001
  it('announces who grew hungrier across the top, until the next action', () => {
    const { controller, party, state } = harness();
    for (const c of roster(party)) c.fullness = 1003;
    roster(party)[1].fullness = 2000;

    // Turn until a step is possible, then step: a step costs more than three ticks.
    for (let i = 0; i < 4 && tickCount(state) === 0; i++) {
      pressKey(controller, 'w');
      if (tickCount(state) === 0) pressKey(controller, 'd');
    }

    const notice = plan(controller, 'hud').notice;
    const hungry = roster(party).filter((c) => c.fullness < 1000).map((c) => c.name);
    expect(notice.text).toBe(`${hungry.join(', ')} ${hungry.length > 1 ? 'are' : 'is'} hungry.`);

    pressKey(controller, 'd');
    expect(plan(controller, 'hud').notice).toBeNull();
  });

  // @spec PRESENT-HUNGER-002
  it('shows hunger and the meal buffs on the party page', () => {
    const { controller, party } = harness();
    const first = roster(party)[0];
    first.fullness = 600;
    first.buffs = [{ trait: 'tough', points: 4.4 }];
    pressKey(controller, 'p');

    const page = plan(controller, 'party');
    expect(page.hunger.stage).toBe('Very hungry');
    expect(page.hunger.buffs).toEqual(['Tough: +2 armour']);
  });

  it('shows food on the Items screen as what it adds to the pot, and does nothing when pressed', () => {
    const { controller, party } = harness();
    pressKey(controller, 'i');
    const row = plan(controller, 'items').entries.find((e) => e.kind === 'ROW' && e.name === 'Ration ×6');

    expect(row.detail).toBe('fullness 600 · heals 2');
    expect(row.available).toBe(false);
    tap(controller, row.box);
    expect(packOf(party)).toHaveLength(6);
  });
});

describe('an unconscious character at the pot', () => {
  it('is not fed', () => {
    const { controller, party } = harness();
    const [first, second] = roster(party);
    applyDamage(party, first.id, 999);
    first.fullness = 100;
    second.fullness = 100;
    pressKey(controller, 'r');
    tap(controller, rowFor(controller, 'Ration').box);
    pressKey(controller, 'Enter');

    expect(first.fullness).toBeLessThan(100);
    expect(second.fullness).toBeGreaterThan(100);
  });
});
