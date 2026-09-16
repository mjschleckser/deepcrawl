/**
 * The PixiJS adapter: turns draw plans into a scene graph.
 *
 * Deliberately thin and deliberately dumb. Every decision about what appears and where
 * it goes was made by the plan builders, which are pure and tested; this file only
 * emits the shapes. It is the one part of the segment that cannot be tested without a
 * renderer, so it is kept small enough to verify by reading.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { Direction, EdgeKind, TileFeature } from '../sim/floor.js';
import { PIXI_APP_OPTIONS, PALETTE } from './appconfig.js';

const WALL_KINDS = new Set(['leftWall', 'rightWall', 'frontWall']);

function shapeColour(shape) {
  const tones = PALETTE[shape.level] ?? PALETTE.DARK;
  if (shape.kind === 'darkness') return PALETTE.darkness;
  if (shape.kind === 'feature') return PALETTE.feature;
  if (WALL_KINDS.has(shape.kind)) return tones.wall;
  if (shape.kind === 'floor') return tones.floor;
  if (shape.kind === 'ceiling') return tones.ceiling;
  return tones.opening;
}

/**
 * A door on the frame the corridor stops at. Closed, it is a leaf of timber with a
 * handle; open, it is the frame alone, with whatever lies beyond showing through.
 *
 * @spec PRESENT-VIEW-012
 * @spec PRESENT-VIEW-013
 */
function drawDoor(graphics, shape) {
  const tones = PALETTE[shape.level] ?? PALETTE.DARK;
  const { x, y, width, height } = shape.rect;

  if (shape.open) {
    graphics.rect(x, y, width, height).stroke({ width: shape.thickness, color: tones.doorFrame });
    return;
  }

  graphics.rect(x, y, width, height).fill(tones.door);
  graphics.rect(x, y, width, height).stroke({ width: shape.thickness, color: tones.doorFrame });
  graphics.circle(shape.handle.x, shape.handle.y, shape.handle.radius).fill(tones.handle);
}

/**
 * An enemy standing in the passage: a body, and the horned head the automap marks the
 * same creature with.
 *
 * @spec PRESENT-VIEW-014
 * @spec PRESENT-VIEW-015
 */
function drawFigure(graphics, shape) {
  const tones = PALETTE[shape.level] ?? PALETTE.DARK;
  const { x, y, width, height } = shape.body;
  const edge = Math.max(1, width * 0.06);

  graphics.roundRect(x, y, width, height, width * 0.35).fill(tones.figure);
  graphics.roundRect(x, y, width, height, width * 0.35)
    .stroke({ width: edge, color: tones.figureEdge });

  for (const horn of shape.horns) graphics.poly(horn).fill(tones.figure);
  graphics.circle(shape.head.x, shape.head.y, shape.head.radius).fill(tones.figure);
  graphics.circle(shape.head.x, shape.head.y, shape.head.radius)
    .stroke({ width: edge, color: tones.figureEdge });
  for (const eye of shape.eyes) graphics.circle(eye.x, eye.y, eye.radius).fill(tones.eye);
}

function drawView(container, plan) {
  const graphics = new Graphics();
  // The plan is already ordered furthest-first, so emitting it in sequence gives
  // correct occlusion with no depth test.
  for (const shape of plan.shapes) {
    if (shape.kind === 'door') drawDoor(graphics, shape);
    else if (shape.kind === 'figure') drawFigure(graphics, shape);
    else graphics.poly(shape.points).fill(shapeColour(shape));
  }
  container.addChild(graphics);
}

function drawMap(container, plan) {
  const graphics = new Graphics();
  const size = plan.cellSize;

  graphics
    .rect(plan.bounds.x - 4, plan.bounds.y - 4, plan.bounds.width + 8, plan.bounds.height + 8)
    .fill({ color: PALETTE.map.backdrop, alpha: 0.72 });

  for (const cell of plan.cells) {
    graphics.rect(cell.px, cell.py, size, size).fill(PALETTE.map.cell);
    if (cell.trapKnown) {
      graphics.circle(cell.px + size / 2, cell.py + size / 2, size * 0.18).fill(PALETTE.map.trap);
    }
    if (cell.feature !== TileFeature.NONE) {
      graphics
        .rect(cell.px + size * 0.3, cell.py + size * 0.3, size * 0.4, size * 0.4)
        .fill(PALETTE.map.door);
    }
  }

  for (const edge of plan.edges) {
    const door = edge.kind === EdgeKind.DOOR || edge.kind === EdgeKind.LOCKED_DOOR;
    const colour =
      edge.kind === EdgeKind.SECRET_DOOR
        ? PALETTE.map.secret
        : door
          ? PALETTE.map.door
          : PALETTE.map.wall;
    // The plan decided where the strokes go; an open door is already two of them.
    for (const [x1, y1, x2, y2] of edge.segments) {
      graphics.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: door ? 3 : 2, color: colour });
    }
  }

  for (const { marker } of plan.enemies) {
    for (const horn of marker.horns) graphics.poly(horn).fill(PALETTE.map.enemy);
    graphics.circle(marker.head.x, marker.head.y, marker.head.radius).fill(PALETTE.map.enemy);
    for (const eye of marker.eyes) {
      graphics.circle(eye.x, eye.y, eye.radius).fill(PALETTE.map.eye);
    }
  }

  if (plan.party) {
    const cx = plan.party.px + size / 2;
    const cy = plan.party.py + size / 2;
    const r = size * 0.38;
    const points = {
      [Direction.NORTH]: [cx, cy - r, cx - r, cy + r, cx + r, cy + r],
      [Direction.SOUTH]: [cx, cy + r, cx + r, cy - r, cx - r, cy - r],
      [Direction.EAST]: [cx + r, cy, cx - r, cy - r, cx - r, cy + r],
      [Direction.WEST]: [cx - r, cy, cx + r, cy + r, cx + r, cy - r],
    }[plan.party.facing];
    graphics.poly(points).fill(PALETTE.map.party);
  }

  container.addChild(graphics);
}

/**
 * One drawn control: a panel, the action it performs, and any key as quieter text
 * beside it. The plan decided where it sits; nothing here registers a handler, because
 * the controller hit-tests that same plan.
 *
 * @spec PRESENT-CTRL-001
 * @spec PRESENT-CTRL-003
 * @spec PRESENT-CTRL-006
 */
function drawControl(container, control, { alpha = 0.55, scale = 1 } = {}) {
  const ghost = control.kind === 'ZONE';
  const graphics = new Graphics();
  // Over the dungeon a control is its label alone, and shows its edges only under a
  // finger. On a panel of its own there is nothing behind it to hide, so it keeps them.
  if (!ghost) {
    graphics.roundRect(control.x, control.y, control.width, control.height, 6)
      .fill({ color: 0x0b0906, alpha });
  }
  if (!ghost || control.pressed) {
    graphics.roundRect(control.x, control.y, control.width, control.height, 6)
      .stroke({ width: 1.5, color: PALETTE.map.wall, alpha: ghost ? 0.85 : 0.9 });
  }
  container.addChild(graphics);

  const name = new Text({
    text: control.label,
    style: { fill: 0xe8d9a8, fontSize: Math.round(14 * scale), fontFamily: 'monospace' },
  });
  name.x = control.x + control.width / 2 - name.width / 2;
  name.y = control.y + control.height / 2 - name.height / 2 - (control.hint ? 6 * scale : 0);
  container.addChild(name);

  // The key is a hint, never the label: a phone has no Enter to press.
  if (control.hint) {
    const hint = new Text({
      text: control.hint,
      style: { fill: PALETTE.map.wall, fontSize: Math.round(10 * scale), fontFamily: 'monospace' },
    });
    hint.x = control.x + control.width / 2 - hint.width / 2;
    hint.y = control.y + control.height - hint.height - 4 * scale;
    container.addChild(hint);
  }
}

function drawHud(container, plan) {
  const scale = plan.scale ?? 1;
  // Which build this is, for telling a fix that did not work from one that has not
  // arrived. Drawn first of the HUD, so a prompt or a control covers it rather than the
  // other way round, and on a plate of its own — it sits over whatever the floor
  // happens to be, and a stamp nobody can read answers nothing.
  // @spec PRESENT-BUILD-001
  if (plan.stamp) {
    const { x, y, size, text } = plan.stamp;
    const label = new Text({
      text,
      style: { fill: 0xe8d9a8, fontSize: size, fontFamily: 'monospace' },
    });
    const inset = Math.round(size * 0.4);
    const plate = new Graphics();
    plate
      .roundRect(x - inset, y - inset * 0.6, label.width + inset * 2, size + inset * 1.4, 3)
      .fill({ color: 0x0b0906, alpha: 0.62 });
    container.addChild(plate);

    label.x = x;
    label.y = y;
    label.alpha = 0.85;
    container.addChild(label);
  }
  // A button hides almost nothing, so it can afford to be solid — and needs to be, or
  // it washes out over a brightly lit floor. A zone ignores this and draws no panel.
  for (const control of plan.controls ?? []) drawControl(container, control, { alpha: 0.88, scale });
  if (!plan.prompt) return;

  const { bounds, text, controls } = plan.prompt;
  const graphics = new Graphics();
  graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height).fill({ color: 0x0b0906, alpha: 0.94 });
  graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height).stroke({ width: 2, color: PALETTE.map.door });
  container.addChild(graphics);

  const label = new Text({
    text,
    style: { fill: 0xe8d9a8, fontSize: Math.round(17 * scale), fontFamily: 'monospace', align: 'center' },
  });
  label.x = bounds.x + bounds.width / 2 - label.width / 2;
  label.y = bounds.y + 20 * scale;
  container.addChild(label);

  for (const control of controls) drawControl(container, control, { alpha: 0.75, scale });
}

export async function createRenderer(mount) {
  const app = new Application();
  // No resizeTo: the surface is sized from the visible viewport, and two things
  // deciding a size means one of them is wrong.
  await app.init({ ...PIXI_APP_OPTIONS });
  // Nothing is real-time, so nothing redraws on a clock.
  app.ticker.stop();
  mount.appendChild(app.canvas);

  const layerContainers = {
    view: new Container(),
    map: new Container(),
    fight: new Container(),
    hud: new Container(),
  };
  // Added in order, so the view sits beneath everything and the HUD above it.
  app.stage.addChild(
    layerContainers.view, layerContainers.map, layerContainers.fight, layerContainers.hud,
  );

  const draw = (layers) => {
    for (const { name, plan } of layers) {
      const container = layerContainers[name];
      container.removeChildren().forEach((child) => child.destroy());
      // A null plan is a layer with nothing to show: cleared, then left alone.
      if (!plan) continue;
      if (name === 'view') drawView(container, plan);
      if (name === 'map') drawMap(container, plan);
      if (name === 'fight') drawFight(container, plan);
      if (name === 'hud') drawHud(container, plan);
    }
    app.render();
  };

  return { app, draw, viewport: () => ({ width: app.screen.width, height: app.screen.height }) };
}

const FIGHT_COLOURS = {
  panel: 0x0b0906,
  frame: 0x6b5640,
  enemy: 0x6b3a2c,
  enemyDown: 0x241713,
  ally: 0x3a4a30,
  allyDown: 0x1a1d16,
  text: 0xe8d9a8,
  dim: 0x8a7354,
  banner: 0xd8b46a,
};

const label = (text, size, colour) =>
  new Text({ text, style: { fill: colour, fontSize: size, fontFamily: 'monospace' } });

/**
 * Draw a fight over the corridor. Both formations in their rows, the fallen still in
 * place, the options on offer, and the log — which is how a round that lands in one
 * frame is perceived at all.
 *
 * @spec PRESENT-FIGHT-001
 * @spec PRESENT-FIGHT-002
 * @spec PRESENT-FIGHT-003
 * @spec PRESENT-FIGHT-004
 */
function drawFight(container, plan) {
  const { x, y, width, height } = plan.bounds;
  const scale = plan.scale ?? 1;
  const pad = 8 * scale;
  const graphics = new Graphics();
  graphics.rect(x, y, width, height).fill({ color: FIGHT_COLOURS.panel, alpha: 0.9 });
  graphics.moveTo(x, y).lineTo(x + width, y).stroke({ width: 2, color: FIGHT_COLOURS.frame });
  container.addChild(graphics);

  // Every card was placed by the plan; this only paints it.
  const drawCard = (member, downColour, upColour) => {
    graphics.rect(member.x, member.y, member.width, member.height)
      .fill(member.down ? downColour : upColour);
    graphics.rect(member.x, member.y, member.width, member.height)
      .stroke({ width: 1, color: FIGHT_COLOURS.frame });

    const tone = member.down ? FIGHT_COLOURS.dim : FIGHT_COLOURS.text;
    const name = label(member.name.slice(0, 12), Math.round(11 * scale), tone);
    name.x = member.x + 5 * scale;
    name.y = member.y + 5 * scale;
    container.addChild(name);

    const hp = label(member.down ? 'down' : `${member.hitPoints}/${member.maxHitPoints}`, Math.round(11 * scale), tone);
    hp.x = member.x + 5 * scale;
    hp.y = member.y + member.height - hp.height - 5 * scale;
    container.addChild(hp);
  };

  for (const member of plan.enemies) drawCard(member, FIGHT_COLOURS.enemyDown, FIGHT_COLOURS.enemy);
  for (const member of plan.party) drawCard(member, FIGHT_COLOURS.allyDown, FIGHT_COLOURS.ally);

  let cursor = plan.cardsBottom + pad;

  if (plan.pending) {
    const who = plan.party.find((c) => c.id === plan.pending.characterId);
    const prompt = label(
      `${who?.name ?? plan.pending.characterId}: ${plan.pending.targets ? 'at whom?' : 'what will you do?'}`,
      Math.round(14 * scale), FIGHT_COLOURS.text,
    );
    prompt.x = x + pad;
    prompt.y = cursor;
    container.addChild(prompt);
    cursor += 26 * scale;
  }

  for (const [i, line] of plan.log.entries()) {
    const entry = label(line, Math.round(12 * scale), FIGHT_COLOURS.dim);
    entry.x = x + pad;
    entry.y = cursor + i * 15 * scale;
    container.addChild(entry);
  }

  // @spec PRESENT-FIGHT-014
  if (plan.banner) {
    const b = plan.banner.bounds;
    const panel = new Graphics();
    panel.rect(b.x, b.y, b.width, b.height).fill({ color: FIGHT_COLOURS.panel, alpha: 0.97 });
    panel.rect(b.x, b.y, b.width, b.height).stroke({ width: 2, color: FIGHT_COLOURS.banner });
    container.addChild(panel);

    const outcome = label(plan.banner.outcome, Math.round(20 * scale), FIGHT_COLOURS.banner);
    outcome.x = b.x + b.width / 2 - outcome.width / 2;
    outcome.y = b.y + 18 * scale;
    container.addChild(outcome);

    if (plan.banner.pot) {
      const learned = label(`the party learns ${plan.banner.pot}`, Math.round(13 * scale), FIGHT_COLOURS.text);
      learned.x = b.x + b.width / 2 - learned.width / 2;
      learned.y = b.y + 46 * scale;
      container.addChild(learned);
    }
  }

  // @spec PRESENT-FIGHT-017
  for (const control of plan.controls ?? []) drawControl(container, control, { alpha: 0.7, scale });
}
