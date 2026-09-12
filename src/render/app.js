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
    hud: new Container(),
  };
  // Added in order, so the view sits beneath the map and the map beneath the HUD.
  app.stage.addChild(layerContainers.view, layerContainers.map, layerContainers.hud);

  const draw = (layers) => {
    for (const { name, plan } of layers) {
      const container = layerContainers[name];
      container.removeChildren().forEach((child) => child.destroy());
      if (name === 'view') drawView(container, plan);
      if (name === 'map') drawMap(container, plan);
      if (name === 'hud') drawHud(container, plan, { onAnswer });
    }
    app.render();
  };

  return { app, draw, viewport: () => ({ width: app.screen.width, height: app.screen.height }) };
}
