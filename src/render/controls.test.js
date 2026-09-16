import { describe, it, expect, vi } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { Row, CharacterClass, createParty, createCharacter, addCharacter } from '../sim/party.js';
import { beginEncounter, createEnemy, createEnemyGroup } from '../sim/combat.js';
import {
  tapRegionsFor, MIN_TAP_PX, controlsFor, ControlKind,
  uiScale, contentColumn, MAX_UI_SCALE,
} from './geometry.js';
import { buildFightPlan, createFightController, FightPhase } from './fight.js';
import { buildPromptPlan } from './promptplan.js';
import { createController, pressPointer, layers } from './controller.js';
import { createExploration } from '../sim/exploration.js';
import { createFloor, Direction } from '../sim/floor.js';
import { createLightSource } from '../sim/light.js';
import { readFile } from 'node:fs/promises';

// A phone held upright: the smallest thing anyone will actually play on.
const phone = { width: 390, height: 844 };
const desktop = { width: 1440, height: 900 };

const allControls = (plan) => plan.controls ?? [];

function fightOf(viewport) {
  const party = createParty();
  addCharacter(party, createCharacter({ id: 'bram', name: 'Bram', characterClass: CharacterClass.FIGHTER, row: Row.FRONT }));
  const encounter = beginEncounter({
    party,
    enemies: createEnemyGroup([
      createEnemy({ id: 'g1', name: 'Goblin', row: Row.FRONT, hitPoints: 9, potValue: 10 }),
      createEnemy({ id: 'g2', name: 'Goblin', row: Row.FRONT, hitPoints: 9, potValue: 10 }),
    ]),
    light: 'BRIGHT',
    awareness: { party: true, enemies: true },
    rng: makeRng(1),
    origin: { floorId: 'f1', x: 1, y: 1 },
  });
  const fight = createFightController({ encounter, viewport, onDraw: vi.fn() });
  return { encounter, fight };
}

describe('exploration controls', () => {
  // @spec PRESENT-CTRL-001
  it('draws a control for every region it will accept a tap in', () => {
    for (const viewport of [phone, desktop]) {
      const drawn = controlsFor(viewport).map((c) => c.region).sort();
      const tappable = tapRegionsFor(viewport).map((r) => r.region).sort();

      expect(drawn).toEqual(tappable);
    }
  });

  // @spec PRESENT-CTRL-002
  it('draws nothing smaller than a thumb, even on a narrow phone', () => {
    for (const control of controlsFor(phone)) {
      expect(control.width).toBeGreaterThanOrEqual(MIN_TAP_PX);
      expect(control.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
    }
  });

  // @spec PRESENT-CTRL-002
  it('keeps the floor in real pixels, so it does not shrink with the viewport', () => {
    const tiny = controlsFor({ width: 240, height: 400 });

    for (const control of tiny) {
      expect(control.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
    }
  });

  // @spec PRESENT-CTRL-003
  it('labels a control with its action, and keeps any key as secondary text', () => {
    for (const control of controlsFor(phone)) {
      expect(control.label).toBeTruthy();
      expect(control.label).not.toMatch(/^\[/);
      // A key hint may be present, but it is never the label.
      if (control.hint) expect(control.hint).not.toBe(control.label);
    }
  });

  // @spec PRESENT-CTRL-002
  it('still fits every control inside the viewport at the pixel floor', () => {
    for (const control of controlsFor(phone)) {
      expect(control.x).toBeGreaterThanOrEqual(0);
      expect(control.y).toBeGreaterThanOrEqual(0);
      expect(control.x + control.width).toBeLessThanOrEqual(phone.width + 0.001);
      expect(control.y + control.height).toBeLessThanOrEqual(phone.height + 0.001);
    }
  });
});

describe('combat controls', () => {
  // @spec PRESENT-FIGHT-017
  // @spec PRESENT-CTRL-004
  it('gives every option on offer a control carrying its own hit region', () => {
    const { encounter, fight } = fightOf(phone);

    const plan = buildFightPlan(encounter, phone, { phase: FightPhase.SELECTING, pending: fight.pending });
    const controls = allControls(plan);

    expect(controls.length).toBeGreaterThanOrEqual(fight.pending.options.length);
    for (const [i, option] of fight.pending.options.entries()) {
      const control = controls.find((c) => c.optionIndex === i);
      expect(control).toBeDefined();
      expect(control.label).toBe(option.label);
      expect(control.width).toBeGreaterThanOrEqual(MIN_TAP_PX);
      expect(control.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
    }
  });

  // @spec PRESENT-FIGHT-017
  it('gives every target a control once an attack has been chosen', () => {
    const { encounter, fight } = fightOf(phone);
    // Pick attack, which asks for a target.
    fight.pending = { ...fight.pending, action: 'ATTACK', targets: [{ id: 'g1', name: 'Goblin', row: Row.FRONT }] };

    const plan = buildFightPlan(encounter, phone, { phase: FightPhase.SELECTING, pending: fight.pending });

    expect(allControls(plan).find((c) => c.optionIndex === 0).label).toBe('Goblin');
  });

  // @spec PRESENT-CTRL-003
  it('never labels a combat option with the key that picks it', () => {
    const { encounter, fight } = fightOf(phone);

    for (const control of allControls(buildFightPlan(encounter, phone, { phase: FightPhase.SELECTING, pending: fight.pending }))) {
      expect(control.label).not.toMatch(/^\[?\d/);
    }
  });

  // @spec PRESENT-CTRL-001
  it('offers a back control while a choice is pending', () => {
    const { encounter, fight } = fightOf(phone);

    const back = allControls(buildFightPlan(encounter, phone, { phase: FightPhase.SELECTING, pending: fight.pending }))
      .find((c) => c.role === 'BACK');

    expect(back).toBeDefined();
    expect(back.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
  });

  // @spec PRESENT-CTRL-001
  it('offers a dismiss control on the outcome banner', () => {
    const { encounter } = fightOf(phone);

    const plan = buildFightPlan(encounter, phone, {
      phase: FightPhase.ENDED, outcome: { outcome: 'VICTORY', pot: 20 },
    });

    const dismiss = allControls(plan).find((c) => c.role === 'DISMISS');
    expect(dismiss).toBeDefined();
    expect(dismiss.label).not.toMatch(/Enter/);
  });
});

describe('prompt controls', () => {
  // @spec PRESENT-PROMPT-005
  // @spec PRESENT-CTRL-003
  it('names the two answers rather than the keys that give them', () => {
    const plan = buildPromptPlan({ kind: 'STAIRS' }, phone);
    const labels = plan.controls.map((c) => c.label);

    expect(labels).toContain('Descend');
    expect(labels).toContain('Stay');
    for (const label of labels) expect(label).not.toMatch(/Enter|Esc/);
  });

  // @spec PRESENT-CTRL-002
  it('gives each answer a thumb-sized target', () => {
    for (const control of buildPromptPlan({ kind: 'STAIRS' }, phone).controls) {
      expect(control.width).toBeGreaterThanOrEqual(MIN_TAP_PX);
      expect(control.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
    }
  });

  // @spec PRESENT-CTRL-003
  it('keeps the keyboard hint as secondary text on the control', () => {
    const confirm = buildPromptPlan({ kind: 'STAIRS' }, phone).controls.find((c) => c.accepted === true);

    expect(confirm.hint).toBe('Enter');
    expect(confirm.label).toBe('Descend');
  });

  // @spec PRESENT-PROMPT-002
  it('draws nothing at all when no confirmation is pending', () => {
    expect(buildPromptPlan(null, phone)).toBeNull();
  });

  // @spec PRESENT-CTRL-002
  it('keeps both answers inside a narrow phone', () => {
    for (const control of buildPromptPlan({ kind: 'STAIRS' }, phone).controls) {
      expect(control.x).toBeGreaterThanOrEqual(0);
      expect(control.x + control.width).toBeLessThanOrEqual(phone.width + 0.001);
    }
  });
});

describe('the outcome banner', () => {
  // @spec PRESENT-FIGHT-014
  it('gets its own panel, so it never reads through the formation behind it', () => {
    const { encounter } = fightOf(phone);

    const plan = buildFightPlan(encounter, phone, {
      phase: FightPhase.ENDED, outcome: { outcome: 'VICTORY', pot: 56 },
    });

    expect(plan.banner.bounds.width).toBeGreaterThan(0);
    expect(plan.banner.bounds.height).toBeGreaterThan(0);
    expect(plan.banner.bounds.x).toBeGreaterThanOrEqual(0);
    expect(plan.banner.bounds.x + plan.banner.bounds.width).toBeLessThanOrEqual(phone.width + 0.001);
  });

  // @spec PRESENT-CTRL-001
  it('keeps its dismiss control inside its own panel', () => {
    const { encounter } = fightOf(phone);
    const plan = buildFightPlan(encounter, phone, {
      phase: FightPhase.ENDED, outcome: { outcome: 'VICTORY', pot: 56 },
    });

    const dismiss = plan.controls.find((c) => c.role === 'DISMISS');
    const b = plan.banner.bounds;
    expect(dismiss.x).toBeGreaterThanOrEqual(b.x);
    expect(dismiss.x + dismiss.width).toBeLessThanOrEqual(b.x + b.width + 0.001);
    expect(dismiss.y + dismiss.height).toBeLessThanOrEqual(b.y + b.height + 0.001);
  });
});

describe('tapping a drawn control', () => {
  function fightController() {
    const floor = createFloor({ id: 'f1', width: 7, height: 7 });
    const state = createExploration({
      floors: [floor], floorId: 'f1', tile: { x: 3, y: 3 }, facing: Direction.NORTH,
      lightSources: [createLightSource({ id: 'l', brightRadius: 1, dimRadius: 4, remainingTicks: 99, lit: true })],
    });
    const { encounter } = fightOf(phone);
    const campaign = { encounter, state, concludeEncounter: () => { campaign.encounter = null; }, fleeEncounter: () => {} };
    const controller = createController({ state, campaign, viewport: phone, onDraw: vi.fn() });
    return { controller };
  }

  // @spec PRESENT-CTRL-005
  // @spec PRESENT-FIGHT-017
  it('performs the action of the control a press lands on', () => {
    const { controller } = fightController();
    const attack = layers(controller).find((l) => l.name === 'fight').plan.controls
      .find((c) => c.optionIndex === 0);

    const handled = pressPointer(controller, attack.x + attack.width / 2, attack.y + attack.height / 2);

    expect(handled).toBe(true);
    // Choosing Attack moves on to asking whom.
    expect(controller.fight.pending.targets).not.toBeNull();
  });

  // @spec PRESENT-CTRL-005
  it('ignores a press that lands on no control', () => {
    const { controller } = fightController();

    expect(pressPointer(controller, 2, 2)).toBe(false);
    expect(controller.fight.pending.targets).toBeNull();
  });

  // @spec PRESENT-CTRL-005
  it('steps back when the press lands on the back control', () => {
    const { controller } = fightController();
    const plan = () => layers(controller).find((l) => l.name === 'fight').plan;
    const attack = plan().controls.find((c) => c.optionIndex === 0);
    pressPointer(controller, attack.x + attack.width / 2, attack.y + attack.height / 2);

    const back = plan().controls.find((c) => c.role === 'BACK');
    pressPointer(controller, back.x + back.width / 2, back.y + back.height / 2);

    expect(controller.fight.pending.targets).toBeNull();
  });

  // @spec PRESENT-CTRL-006
  it('registers no input handler on anything it draws', async () => {
    // Hit-testing lives in the plan, which is testable; handlers on drawn objects are
    // not, and would let what is tapped drift from what is drawn.
    const adapter = await readFile(new URL('./app.js', import.meta.url), 'utf8');

    expect(adapter).not.toMatch(/eventMode/);
    expect(adapter).not.toMatch(/\.on\(\s*['"]pointer/);
  });
});

describe('controls over the dungeon', () => {
  // @spec EXPLORE-INPUT-004
  it('no longer offers a control for turning about, which two taps of a turn reach', () => {
    const regions = tapRegionsFor(phone).map((r) => r.region);

    expect(regions).not.toContain('TURN_AROUND');
    expect(regions).toContain('TURN_LEFT');
    expect(regions).toContain('TURN_RIGHT');
  });

  // @spec PRESENT-CTRL-007
  it('is unpressed by default, so it draws as its label alone', () => {
    for (const control of controlsFor(phone)) {
      expect(control.pressed).toBe(false);
    }
  });

  // @spec PRESENT-CTRL-008
  it('marks the control under the finger as pressed', () => {
    const forward = controlsFor(phone).find((c) => c.region === 'FORWARD');

    const held = controlsFor(phone, { pressedRegion: 'FORWARD' });

    expect(held.find((c) => c.region === 'FORWARD').pressed).toBe(true);
    expect(forward.pressed).toBe(false);
  });

  // @spec PRESENT-CTRL-009
  it('marks only the one under the finger, never two at once', () => {
    const held = controlsFor(phone, { pressedRegion: 'TURN_LEFT' });

    expect(held.filter((c) => c.pressed)).toHaveLength(1);
    expect(held.find((c) => c.pressed).region).toBe('TURN_LEFT');
  });

  // @spec PRESENT-CTRL-008
  it('marks nothing once the finger lifts', () => {
    expect(controlsFor(phone, { pressedRegion: null }).some((c) => c.pressed)).toBe(false);
  });
});

describe('the two kinds of control', () => {
  const byRegion = (region) => controlsFor(phone).find((c) => c.region === region);

  // @spec PRESENT-CTRL-011
  it('says on each control which kind it is', () => {
    for (const control of controlsFor(phone)) {
      expect([ControlKind.ZONE, ControlKind.BUTTON]).toContain(control.kind);
    }
  });

  // @spec PRESENT-CTRL-007
  it('makes the movement areas zones, which draw as bare labels', () => {
    for (const region of ['FORWARD', 'TURN_LEFT', 'TURN_RIGHT']) {
      expect(byRegion(region).kind).toBe(ControlKind.ZONE);
    }
  });

  // @spec PRESENT-CTRL-010
  it('makes everything else a button, which keeps its panel', () => {
    for (const region of ['MAP', 'PARTY_BAR', 'PACK', 'SPELL_ICON', 'SEARCH_CONTROL', 'INTERACT_PROMPT']) {
      expect(byRegion(region).kind).toBe(ControlKind.BUTTON);
    }
  });

  // @spec PRESENT-CTRL-010
  it('keeps every combat option a button, panel and all', () => {
    const { encounter, fight } = fightOf(phone);
    const plan = buildFightPlan(encounter, phone, { phase: FightPhase.SELECTING, pending: fight.pending });

    for (const control of plan.controls) {
      expect(control.kind).toBe(ControlKind.BUTTON);
    }
  });

  // @spec PRESENT-CTRL-010
  it('keeps both prompt answers buttons', () => {
    for (const control of buildPromptPlan({ kind: 'STAIRS' }, phone).controls) {
      expect(control.kind).toBe(ControlKind.BUTTON);
    }
  });
});

describe('the formations in a fight', () => {
  const rowOf = (cards, row) => cards.filter((c) => c.row === row);
  const centreOf = (cards) => {
    const left = Math.min(...cards.map((c) => c.x));
    const right = Math.max(...cards.map((c) => c.x + c.width));
    return (left + right) / 2;
  };

  // @spec PRESENT-FIGHT-019
  it('decides every card position in the plan', () => {
    const { encounter } = fightOf(phone);
    const plan = buildFightPlan(encounter, phone, { phase: FightPhase.SELECTING });

    for (const card of [...plan.enemies, ...plan.party]) {
      for (const field of ['x', 'y', 'width', 'height']) {
        expect(typeof card[field]).toBe('number');
      }
    }
  });

  // @spec PRESENT-FIGHT-018
  it('centres each rank across the panel', () => {
    const { encounter } = fightOf(phone);
    const plan = buildFightPlan(encounter, phone, { phase: FightPhase.SELECTING });
    const middle = plan.bounds.x + plan.bounds.width / 2;

    // Two enemies in front, one party member in front: different counts, same centre.
    expect(centreOf(rowOf(plan.enemies, Row.FRONT))).toBeCloseTo(middle, 1);
    expect(centreOf(rowOf(plan.party, Row.FRONT))).toBeCloseTo(middle, 1);
  });

  // @spec PRESENT-FIGHT-018
  it('centres a rank of one as surely as a rank of several', () => {
    const party = createParty();
    addCharacter(party, createCharacter({ id: 'solo', name: 'Solo', characterClass: CharacterClass.FIGHTER, row: Row.FRONT }));
    const encounter = beginEncounter({
      party,
      enemies: createEnemyGroup([
        createEnemy({ id: 'a', name: 'A', row: Row.FRONT, hitPoints: 9, potValue: 1 }),
        createEnemy({ id: 'b', name: 'B', row: Row.FRONT, hitPoints: 9, potValue: 1 }),
        createEnemy({ id: 'c', name: 'C', row: Row.FRONT, hitPoints: 9, potValue: 1 }),
      ]),
      light: 'BRIGHT', awareness: { party: true, enemies: true },
      rng: makeRng(1), origin: { floorId: 'f1', x: 1, y: 1 },
    });
    const plan = buildFightPlan(encounter, phone, { phase: FightPhase.SELECTING });
    const middle = plan.bounds.x + plan.bounds.width / 2;

    expect(centreOf(rowOf(plan.party, Row.FRONT))).toBeCloseTo(middle, 1);
    expect(centreOf(rowOf(plan.enemies, Row.FRONT))).toBeCloseTo(middle, 1);
  });

  // @spec PRESENT-FIGHT-002
  it('keeps every card inside the panel, even a crowded rank on a narrow phone', () => {
    const party = createParty();
    addCharacter(party, createCharacter({ id: 'x', name: 'X', characterClass: CharacterClass.FIGHTER, row: Row.FRONT }));
    const enemies = Array.from({ length: 8 }, (_, i) =>
      createEnemy({ id: `e${i}`, name: 'Goblin', row: Row.FRONT, hitPoints: 9, potValue: 1 }));
    const encounter = beginEncounter({
      party, enemies: createEnemyGroup(enemies),
      light: 'BRIGHT', awareness: { party: true, enemies: true },
      rng: makeRng(1), origin: { floorId: 'f1', x: 1, y: 1 },
    });

    const plan = buildFightPlan(encounter, phone, { phase: FightPhase.SELECTING });

    for (const card of plan.enemies) {
      expect(card.x).toBeGreaterThanOrEqual(plan.bounds.x - 0.001);
      expect(card.x + card.width).toBeLessThanOrEqual(plan.bounds.x + plan.bounds.width + 0.001);
    }
  });
});

describe('scaling to the screen', () => {
  const phone = { width: 390, height: 780 };
  const desktop = { width: 2116, height: 1264 };

  // @spec PRESENT-CTRL-012
  it('draws the phone layout at its own size', () => {
    expect(uiScale(phone)).toBe(1);
  });

  // @spec PRESENT-CTRL-012
  it('grows with the screen, and stops growing', () => {
    expect(uiScale(desktop)).toBeGreaterThan(1);
    expect(uiScale({ width: 8000, height: 6000 })).toBe(MAX_UI_SCALE);
  });

  // @spec PRESENT-CTRL-012
  it('never shrinks below the phone layout, however small the window', () => {
    expect(uiScale({ width: 240, height: 320 })).toBe(1);
  });

  // @spec PRESENT-CTRL-012
  it('takes the smaller dimension, so a wide short window does not inflate', () => {
    // A landscape phone is wide and short; scaling on width alone would push the
    // controls off the bottom of it.
    expect(uiScale({ width: 2000, height: 400 })).toBe(1);
  });

  // @spec PRESENT-FIGHT-020
  it('gives a phone the whole width and a desktop a centred column', () => {
    expect(contentColumn(phone)).toEqual({ x: 0, width: 390 });

    const column = contentColumn(desktop);
    expect(column.width).toBeLessThan(desktop.width);
    // Centred: the margins either side match.
    expect(column.x).toBeCloseTo((desktop.width - column.width) / 2, 5);
  });
});
