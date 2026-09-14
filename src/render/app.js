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

function drawView(container, plan) {
  const graphics = new Graphics();
  // The plan is already ordered furthest-first, so emitting it in sequence gives
  // correct occlusion with no depth test.
  for (const shape of plan.shapes) {
    graphics.poly(shape.points).fill(shapeColour(shape));
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
    const colour =
      edge.kind === EdgeKind.SECRET_DOOR
        ? PALETTE.map.secret
        : edge.kind === EdgeKind.DOOR || edge.kind === EdgeKind.LOCKED_DOOR
          ? PALETTE.map.door
          : PALETTE.map.wall;
    const { px, py } = edge;
    const ends = {
      [Direction.NORTH]: [px, py, px + size, py],
      [Direction.SOUTH]: [px, py + size, px + size, py + size],
      [Direction.WEST]: [px, py, px, py + size],
      [Direction.EAST]: [px + size, py, px + size, py + size],
    }[edge.direction];
    graphics.moveTo(ends[0], ends[1]).lineTo(ends[2], ends[3]).stroke({ width: 2, color: colour });
  }

  for (const enemy of plan.enemies) {
    graphics.circle(enemy.px + size / 2, enemy.py + size / 2, size * 0.3).fill(PALETTE.map.enemy);
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

function drawHud(container, plan, { onAnswer }) {
  if (!plan.prompt) return;

  const { width, height } = plan.viewport;
  const boxWidth = Math.min(width * 0.7, 420);
  const boxHeight = 130;
  const x = (width - boxWidth) / 2;
  const y = height - boxHeight - height * 0.12;

  const graphics = new Graphics();
  graphics.rect(x, y, boxWidth, boxHeight).fill({ color: 0x0b0906, alpha: 0.92 });
  graphics.rect(x, y, boxWidth, boxHeight).stroke({ width: 2, color: PALETTE.map.door });
  container.addChild(graphics);

  const label = new Text({
    text: 'A staircase leads down.\nDescend?',
    style: { fill: 0xe8d9a8, fontSize: 18, fontFamily: 'monospace', align: 'center' },
  });
  label.x = x + boxWidth / 2 - label.width / 2;
  label.y = y + 18;
  container.addChild(label);

  for (const [text, accepted, offset] of [
    ['[Enter] Descend', true, 0.28],
    ['[Esc] Stay', false, 0.72],
  ]) {
    const button = new Text({
      text,
      style: { fill: 0xd8b46a, fontSize: 15, fontFamily: 'monospace' },
    });
    button.x = x + boxWidth * offset - button.width / 2;
    button.y = y + boxHeight - 38;
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.on('pointerdown', (event) => {
      event.stopPropagation();
      onAnswer(accepted);
    });
    container.addChild(button);
  }
}

export async function createRenderer(mount, { onAnswer }) {
  const app = new Application();
  await app.init({ ...PIXI_APP_OPTIONS, resizeTo: mount });
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
      if (name === 'view') drawView(container, plan);
      if (name === 'map') drawMap(container, plan);
      if (name === 'fight') drawFight(container, plan);
      if (name === 'hud') drawHud(container, plan, { onAnswer });
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
  const graphics = new Graphics();
  graphics.rect(x, y, width, height).fill({ color: FIGHT_COLOURS.panel, alpha: 0.9 });
  graphics.moveTo(x, y).lineTo(x + width, y).stroke({ width: 2, color: FIGHT_COLOURS.frame });
  container.addChild(graphics);

  const cardW = Math.min(120, width / 6);
  const cardH = 44;
  const pad = 8;

  const drawRank = (group, topY, downColour, upColour) => {
    group.forEach((member, i) => {
      const cx = x + pad + i * (cardW + pad);
      graphics.rect(cx, topY, cardW, cardH).fill(member.down ? downColour : upColour);
      graphics.rect(cx, topY, cardW, cardH).stroke({ width: 1, color: FIGHT_COLOURS.frame });

      const name = label(member.name.slice(0, 12), 11, member.down ? FIGHT_COLOURS.dim : FIGHT_COLOURS.text);
      name.x = cx + 5;
      name.y = topY + 5;
      container.addChild(name);

      const hp = label(
        member.down ? 'down' : `${member.hitPoints}/${member.maxHitPoints}`,
        11,
        member.down ? FIGHT_COLOURS.dim : FIGHT_COLOURS.text,
      );
      hp.x = cx + 5;
      hp.y = topY + 23;
      container.addChild(hp);
    });
  };

  const byRow = (list, row) => list.filter((m) => m.row === row);
  let cursor = y + pad;
  drawRank(byRow(plan.enemies, 'BACK'), cursor, FIGHT_COLOURS.enemyDown, FIGHT_COLOURS.enemy);
  cursor += cardH + pad;
  drawRank(byRow(plan.enemies, 'FRONT'), cursor, FIGHT_COLOURS.enemyDown, FIGHT_COLOURS.enemy);
  cursor += cardH + pad * 2;
  drawRank(byRow(plan.party, 'FRONT'), cursor, FIGHT_COLOURS.allyDown, FIGHT_COLOURS.ally);
  cursor += cardH + pad;
  drawRank(byRow(plan.party, 'BACK'), cursor, FIGHT_COLOURS.allyDown, FIGHT_COLOURS.ally);
  cursor += cardH + pad;

  // What this character may do, numbered as the keys that pick them.
  if (plan.pending) {
    const who = plan.party.find((c) => c.id === plan.pending.characterId);
    const choices = plan.pending.targets
      ? plan.pending.targets.map((t, i) => `[${i + 1}] ${t.name}`)
      : plan.pending.options.map((o, i) => `[${i + 1}] ${o.label}`);

    const prompt = label(
      `${who?.name ?? plan.pending.characterId}: ${plan.pending.targets ? 'at whom?' : 'what will you do?'}`,
      14, FIGHT_COLOURS.text,
    );
    prompt.x = x + pad;
    prompt.y = cursor;
    container.addChild(prompt);

    const row = label(`${choices.join('   ')}    [Esc] back`, 13, FIGHT_COLOURS.banner);
    row.x = x + pad;
    row.y = cursor + 20;
    container.addChild(row);
    cursor += 44;
  }

  for (const [i, line] of plan.log.entries()) {
    const entry = label(line, 12, FIGHT_COLOURS.dim);
    entry.x = x + pad;
    entry.y = cursor + i * 15;
    container.addChild(entry);
  }

  // @spec PRESENT-FIGHT-014
  if (plan.banner) {
    const text = plan.banner.pot
      ? `${plan.banner.outcome} — the party learns ${plan.banner.pot}`
      : plan.banner.outcome;
    const banner = label(`${text}    [Enter]`, 18, FIGHT_COLOURS.banner);
    banner.x = x + width / 2 - banner.width / 2;
    banner.y = y + height / 2;
    container.addChild(banner);
  }
}
