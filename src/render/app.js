/**
 * The PixiJS adapter: turns draw plans into a scene graph.
 *
 * Deliberately thin and deliberately dumb. Every decision about what appears and where
 * it goes was made by the plan builders, which are pure and tested; this file only
 * emits the shapes. It is the one part of the segment that cannot be tested without a
 * renderer, so it is kept small enough to verify by reading.
 */

import { Application, Assets, Container, Graphics, Sprite, Text } from 'pixi.js';
import { Direction, EdgeKind } from '../sim/floor.js';
import { PIXI_APP_OPTIONS, PALETTE, shade } from './appconfig.js';
import { weaponSymbol } from './symbols.js';
import { STAMP_NOTICE_GAP } from './geometry.js';
import { MapMark } from './mapplan.js';

const WALL_KINDS = new Set(['leftWall', 'rightWall', 'frontWall']);

/**
 * The corridor's tones at a shape's depth: the one palette, darkened by distance alone.
 *
 * @spec PRESENT-VIEW-007
 */
function tonesFor(shape) {
  const tones = {};
  for (const [name, colour] of Object.entries(PALETTE.view)) tones[name] = shade(colour, shape.shade ?? 1);
  return tones;
}

function shapeColour(shape) {
  const tones = tonesFor(shape);
  if (shape.kind === 'feature') return shade(PALETTE.feature, shape.shade ?? 1);
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
  const tones = tonesFor(shape);
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
  const tones = tonesFor(shape);
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

/**
 * A chest on the floor: a box of timber with a gold band, and a lid shut on it or thrown
 * back to show the dark inside.
 *
 * @spec PRESENT-VIEW-016
 */
function drawChest(graphics, shape) {
  const tones = tonesFor(shape);
  const { x, y, width, height } = shape.body;
  const edge = Math.max(1, width * 0.04);
  if (shape.opened) {
    graphics.poly(shape.lid).fill(tones.chestInside);
    graphics.poly(shape.lid).stroke({ width: edge, color: tones.chestBand });
  }
  graphics.rect(x, y, width, height).fill(tones.chest);
  graphics.rect(x, y + height * 0.42, width, height * 0.14).fill(tones.chestBand);
  graphics.rect(x, y, width, height).stroke({ width: edge, color: tones.doorFrame });
  if (!shape.opened) {
    graphics.poly(shape.lid).fill(tones.chest);
    graphics.poly(shape.lid).stroke({ width: edge, color: tones.doorFrame });
    graphics.circle(x + width / 2, y, Math.max(1.5, width * 0.05)).fill(tones.chestBand);
  }
}

/**
 * What an opened chest held, in a panel over the view: the gold and each item in its
 * rarity's colour. Any key or press puts it away.
 *
 * @spec PRESENT-CHEST-001
 */
function drawChestReport(container, plan) {
  const scale = plan.scale ?? 1;
  const b = plan.bounds;
  const panel = new Graphics();
  panel.roundRect(b.x, b.y, b.width, b.height, 6 * scale).fill({ color: FIGHT_COLOURS.panel, alpha: 0.97 });
  panel.roundRect(b.x, b.y, b.width, b.height, 6 * scale).stroke({ width: 2, color: FIGHT_COLOURS.banner });
  container.addChild(panel);

  const title = label(plan.title, Math.round(18 * scale), FIGHT_COLOURS.banner);
  title.x = b.x + b.width / 2 - title.width / 2;
  title.y = b.y + 16 * scale;
  container.addChild(title);

  const lines = [
    ...(plan.find.gold ? [{ text: plan.find.gold, colour: FIGHT_COLOURS.banner }] : []),
    ...plan.find.items.map((item) => ({ text: item.text, colour: item.colour })),
    ...(plan.find.nothing ? [{ text: plan.find.nothing, colour: FIGHT_COLOURS.dim }] : []),
  ];
  let y = b.y + 52 * scale;
  for (const line of lines) {
    const t = label(line.text, Math.round(14 * scale), line.colour);
    fitWithin(t, b.width - 24 * scale);
    t.x = b.x + b.width / 2 - t.width / 2;
    t.y = y;
    container.addChild(t);
    y += plan.lineHeight;
  }

  const hint = label(plan.hint, Math.round(11 * scale), FIGHT_COLOURS.dim);
  hint.x = b.x + b.width / 2 - hint.width / 2;
  hint.y = b.y + b.height - hint.height - 10 * scale;
  container.addChild(hint);
}

function drawView(container, plan) {
  const graphics = new Graphics();
  // The plan is already ordered furthest-first, so emitting it in sequence gives
  // correct occlusion with no depth test.
  for (const shape of plan.shapes) {
    if (shape.kind === 'door') drawDoor(graphics, shape);
    else if (shape.kind === 'figure') drawFigure(graphics, shape);
    else if (shape.kind === 'chest') drawChest(graphics, shape);
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
    // A staircase is something to walk to and a pit is something to walk round, so
    // they are not one mark: a square for the one, a ring for the other. A chest is a
    // low box of its own colour, solid until opened and hollow after.
    // @spec PRESENT-MAP-008
    // @spec PRESENT-MAP-012
    if (cell.mark === MapMark.PIT) {
      graphics
        .circle(cell.px + size / 2, cell.py + size / 2, size * 0.3)
        .stroke({ width: Math.max(1, size * 0.14), color: PALETTE.map.door });
    } else if (cell.mark === MapMark.STAIRS) {
      graphics
        .rect(cell.px + size * 0.3, cell.py + size * 0.3, size * 0.4, size * 0.4)
        .fill(PALETTE.map.door);
    } else if (cell.mark === MapMark.CHEST || cell.mark === MapMark.OPENED_CHEST) {
      const box = [cell.px + size * 0.2, cell.py + size * 0.34, size * 0.6, size * 0.36];
      if (cell.mark === MapMark.CHEST) graphics.rect(...box).fill(PALETTE.map.chest);
      else graphics.rect(...box).stroke({ width: Math.max(1, size * 0.1), color: PALETTE.map.chest });
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

/** Shrink a line of text that would otherwise spill out of the control it sits on. */
function fitWithin(text, width) {
  if (text.width > width) text.scale.set(width / text.width);
}

/**
 * One drawn control: a panel, the action it performs, and any key as quieter text
 * beside it. The plan decided where it sits; nothing here registers a handler, because
 * the controller hit-tests that same plan.
 *
 * @spec PRESENT-CTRL-001
 * @spec PRESENT-CTRL-003
 * @spec PRESENT-CTRL-006
 * @spec PRESENT-CTRL-007
 * @spec PRESENT-CTRL-010
 */
function drawControl(container, control, { alpha = 0.55, scale = 1 } = {}) {
  const ghost = control.kind === 'ZONE';
  // An option that cannot be taken is drawn in its own place, dimmed rather than
  // omitted, so the row keeps its shape and its numbering.
  // @spec PRESENT-FIGHT-034
  const dim = control.available === false;
  const graphics = new Graphics();
  // Over the dungeon a control is its label alone, and shows its edges only under a
  // finger. On a panel of its own there is nothing behind it to hide, so it keeps them.
  if (!ghost) {
    graphics.roundRect(control.x, control.y, control.width, control.height, 6)
      .fill({ color: 0x0b0906, alpha: dim ? alpha * 0.55 : alpha });
  }
  if (!ghost || control.pressed) {
    // The option a menu rose from stays marked, so the question keeps its source.
    // @spec PRESENT-MENU-005
    graphics.roundRect(control.x, control.y, control.width, control.height, 6)
      .stroke({
        width: control.open ? 2.5 : 1.5,
        color: control.open ? FIGHT_COLOURS.banner : PALETTE.map.wall,
        alpha: dim ? 0.35 : (ghost ? 0.85 : 0.9),
      });
  }
  container.addChild(graphics);

  // The reason takes the slot the key hint occupies, a greyed control's key doing
  // nothing anyway.
  // @spec PRESENT-FIGHT-041
  const footnote = dim ? control.reason : control.hint;

  const name = new Text({
    text: control.label,
    style: {
      fill: dim ? 0x6b6252 : 0xe8d9a8,
      fontSize: Math.round(14 * scale),
      fontFamily: 'monospace',
    },
  });
  fitWithin(name, control.width - 6 * scale);
  name.x = control.x + control.width / 2 - name.width / 2;
  name.y = control.y + control.height / 2 - name.height / 2 - (footnote ? 6 * scale : 0);
  container.addChild(name);

  // The key is a hint, never the label: a phone has no Enter to press.
  // @spec PRESENT-FIGHT-040
  if (footnote) {
    const hint = new Text({
      text: footnote,
      style: {
        fill: dim ? 0x6b6252 : PALETTE.map.wall,
        fontSize: Math.round(10 * scale),
        fontFamily: 'monospace',
      },
    });
    fitWithin(hint, control.width - 6 * scale);
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
    const { x, y, size, text, notice } = plan.stamp;
    const label = new Text({
      text,
      style: { fill: 0xe8d9a8, fontSize: size, fontFamily: 'monospace' },
    });
    // A newer build waiting for a refresh, on the same line in a colour of its own, so
    // it reads as news rather than as part of the number.
    // @spec PRESENT-BUILD-008
    const news = notice
      ? new Text({
        text: notice,
        style: { fill: 0x8fd16a, fontSize: size, fontFamily: 'monospace', fontWeight: 'bold' },
      })
      : null;
    const gap = news ? label.width / Math.max(1, text.length) * STAMP_NOTICE_GAP.length : 0;
    const inset = Math.round(size * 0.4);
    const width = label.width + (news ? gap + news.width : 0);
    const plate = new Graphics();
    plate
      .roundRect(x - inset, y - inset * 0.6, width + inset * 2, size + inset * 1.4, 3)
      .fill({ color: 0x0b0906, alpha: news ? 0.8 : 0.62 });
    container.addChild(plate);

    label.x = x;
    label.y = y;
    label.alpha = 0.85;
    container.addChild(label);
    if (news) {
      news.x = x + label.width + gap;
      news.y = y;
      container.addChild(news);
    }
  }
  // Only there when something is wrong with the save, so it can afford to stand out.
  // @spec PRESENT-SAVE-001
  // @spec PRESENT-SAVE-002
  if (plan.note) {
    const { x, y, size, text } = plan.note;
    const warning = new Text({
      text,
      style: { fill: 0xd8a33a, fontSize: size, fontFamily: 'monospace' },
    });
    const inset = Math.round(size * 0.4);
    const plate = new Graphics();
    plate
      .roundRect(x - inset, y - inset * 0.6, warning.width + inset * 2, size + inset * 1.4, 3)
      .fill({ color: 0x0b0906, alpha: 0.75 });
    container.addChild(plate);
    warning.x = x;
    warning.y = y;
    container.addChild(warning);
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
    party: new Container(),
    items: new Container(),
    chest: new Container(),
    hud: new Container(),
  };
  // Added in order, so the view sits beneath everything and the HUD above it.
  app.stage.addChild(
    layerContainers.view, layerContainers.map, layerContainers.fight,
    layerContainers.party, layerContainers.items, layerContainers.chest, layerContainers.hud,
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
      if (name === 'party') drawParty(container, plan);
      if (name === 'items') drawItems(container, plan);
      if (name === 'chest') drawChestReport(container, plan);
      if (name === 'hud') drawHud(container, plan);
    }
    app.render();
  };

  // A portrait that lands after the frame that wanted it redraws that frame.
  let lastLayers = null;
  const drawAndRemember = (layers) => {
    lastLayers = layers;
    draw(layers);
  };
  onPortraitArrived = () => {
    if (lastLayers) draw(lastLayers);
  };

  return {
    app,
    draw: drawAndRemember,
    viewport: () => ({ width: app.screen.width, height: app.screen.height }),
  };
}

const FIGHT_COLOURS = {
  panel: 0x0b0906,
  frame: 0x6b5640,
  // Each side's card on a subdued ground, and the brighter shade that marks a side.
  enemy: 0x3a211a,
  enemyReady: 0x8a4a35,
  enemyDown: 0x241713,
  ally: 0x232d1d,
  allyReady: 0x56703f,
  allyDown: 0x1a1d16,
  // Hit points, by how bad it is.
  healthy: 0x6fae4f,
  wounded: 0xd8a33a,
  critical: 0xc8412e,
  text: 0xe8d9a8,
  dim: 0x8a7354,
  banner: 0xd8b46a,
};

/**
 * Portraits, fetched once and kept. A picture arrives after the frame that wanted it,
 * so the fight is drawn without it and drawn again when it lands; one that never
 * arrives is simply absent, because a missing image must not cost the player a fight.
 *
 * @spec PRESENT-FIGHT-023
 * @spec PRESENT-FIGHT-024
 */
const PORTRAIT_CACHE = new Map();
let onPortraitArrived = () => {};

function portraitTexture(url) {
  if (!url) return null;
  if (!PORTRAIT_CACHE.has(url)) {
    PORTRAIT_CACHE.set(url, null);
    Assets.load(url)
      .then((texture) => {
        PORTRAIT_CACHE.set(url, texture);
        onPortraitArrived();
      })
      .catch(() => {});
  }
  return PORTRAIT_CACHE.get(url);
}

const label = (text, size, colour) =>
  new Text({ text, style: { fill: colour, fontSize: size, fontFamily: 'monospace' } });

/**
 * Paint a weapon symbol into a square. The shapes are the symbol's; this only scales
 * them to the square and strokes them.
 *
 * @spec PRESENT-MENU-018
 */
function drawWeaponSymbol(container, skill, x, y, size, scale) {
  const { lines, curves, circles, polygons } = weaponSymbol(skill);
  const at = (value, origin) => origin + value * size;
  const ink = { width: 2 * scale, color: FIGHT_COLOURS.text, cap: 'round' };
  const art = new Graphics();

  for (const [x1, y1, x2, y2] of lines) {
    art.moveTo(at(x1, x), at(y1, y)).lineTo(at(x2, x), at(y2, y)).stroke(ink);
  }
  for (const [x1, y1, cx, cy, x2, y2] of curves) {
    art.moveTo(at(x1, x), at(y1, y))
      .quadraticCurveTo(at(cx, x), at(cy, y), at(x2, x), at(y2, y))
      .stroke(ink);
  }
  for (const [cx, cy, radius] of circles) {
    art.circle(at(cx, x), at(cy, y), radius * size).fill(FIGHT_COLOURS.text);
  }
  for (const points of polygons) {
    art.poly(points.map((value, i) => at(value, i % 2 === 0 ? x : y))).fill(FIGHT_COLOURS.text);
  }
  container.addChild(art);
}

/**
 * Draw a fight over the corridor. Both sides in their columns, the fallen still in
 * place, the options on offer, and the log — which is how an action that lands in one
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

  // Everything below was placed by the plan; this only paints it, at whatever offset
  // the plan gave it.
  const drawCombatant = (card, colours) => {
    const at = card.y + (card.offsetY ?? 0);
    const bars = card.bars;
    const tone = card.down ? FIGHT_COLOURS.dim : FIGHT_COLOURS.text;

    // The portrait: a picture is recognised faster than a name is read.
    // @spec PRESENT-FIGHT-023
    const box = card.portraitBox;
    graphics.rect(box.x, at, box.size, box.size).fill(colours.ground);
    const texture = portraitTexture(card.portrait);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.x = box.x;
      sprite.y = at;
      sprite.width = box.size;
      sprite.height = box.size;
      sprite.alpha = card.down ? 0.35 : 1;
      container.addChild(sprite);
    }

    // Who they are: name, total level, and a condition worth naming.
    // @spec PRESENT-READY-029
    const identity = bars.identity;
    const identityY = at + (identity.y - card.y);
    graphics.rect(identity.x, identityY, identity.width, identity.height)
      .fill({ color: colours.ground, alpha: 0.65 });
    const size = Math.max(8, Math.round(identity.height * 0.74));
    const name = label(card.name.slice(0, 14), size, tone);
    name.x = identity.x + 3 * scale;
    name.y = identityY + (identity.height - name.height) / 2;
    container.addChild(name);

    const trailing = card.status ? `${card.status.toLowerCase()}` : `Lv ${card.level}`;
    const right = label(trailing, size, card.status ? FIGHT_COLOURS.critical : FIGHT_COLOURS.dim);
    right.x = identity.x + identity.width - right.width - 3 * scale;
    right.y = identityY + (identity.height - right.height) / 2;
    container.addChild(right);

    // How they are doing: hit points, coloured by how much is left.
    // @spec PRESENT-READY-022
    // @spec PRESENT-READY-023
    const health = bars.health;
    const healthY = at + (health.y - card.y);
    graphics.rect(health.x, healthY, health.width, health.height)
      .fill({ color: 0x000000, alpha: 0.5 });
    if (!card.down) {
      const colour = {
        HEALTHY: FIGHT_COLOURS.healthy,
        WOUNDED: FIGHT_COLOURS.wounded,
        CRITICAL: FIGHT_COLOURS.critical,
      }[card.wound];
      graphics.rect(health.x, healthY, health.width * card.health, health.height).fill(colour);
    }
    const hp = label(card.down ? 'down' : `${card.hitPoints}/${card.maxHitPoints}`, size, tone);
    hp.x = health.x + 3 * scale;
    hp.y = healthY + (health.height - hp.height) / 2;
    container.addChild(hp);

    // Something has to say "this one, now", or a fight resolved one at a time reads as
    // a log that writes itself.
    // @spec PRESENT-READY-003
    graphics.rect(card.x, at, card.width, card.height)
      .stroke({
        width: card.acting ? 2.5 : 1,
        color: card.acting ? FIGHT_COLOURS.banner : FIGHT_COLOURS.frame,
      });
  };

  for (const member of plan.enemies) {
    drawCombatant(member, {
      ground: member.down ? FIGHT_COLOURS.enemyDown : FIGHT_COLOURS.enemy,
    });
  }
  for (const member of plan.party) {
    drawCombatant(member, {
      ground: member.down ? FIGHT_COLOURS.allyDown : FIGHT_COLOURS.ally,
    });
  }

  // The turn order, read and never pressed. Every tile was placed by the plan; a tile
  // whose picture has not arrived still stands for its combatant by frame and mark.
  // @spec PRESENT-STRIP-001
  // @spec PRESENT-STRIP-003
  // @spec PRESENT-STRIP-004
  // @spec PRESENT-STRIP-005
  // @spec PRESENT-STRIP-006
  const stripArt = new Graphics();
  container.addChild(stripArt);
  for (const tile of plan.strip.tiles) {
    const party = tile.side === 'PARTY';
    stripArt.rect(tile.x, tile.y, tile.size, tile.size)
      .fill({ color: party ? FIGHT_COLOURS.ally : FIGHT_COLOURS.enemy, alpha: 0.95 });

    const texture = portraitTexture(tile.portrait);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.x = tile.x;
      sprite.y = tile.y;
      sprite.width = tile.size;
      sprite.height = tile.size;
      container.addChild(sprite);
    }

    const frame = new Graphics();
    frame.rect(tile.x, tile.y, tile.size, tile.size).stroke({
      width: tile.current ? 3 * scale : 2 * scale,
      color: tile.current
        ? FIGHT_COLOURS.banner
        : (party ? FIGHT_COLOURS.allyReady : FIGHT_COLOURS.enemyReady),
    });
    container.addChild(frame);

    if (tile.mark) {
      const size = Math.round(tile.size * 0.34);
      const plate = new Graphics();
      plate.rect(tile.x + tile.size - size - 2 * scale, tile.y + tile.size - size - 2 * scale, size, size)
        .fill({ color: FIGHT_COLOURS.panel, alpha: 0.85 });
      container.addChild(plate);
      const mark = label(tile.mark, Math.round(size * 0.9), FIGHT_COLOURS.text);
      mark.x = tile.x + tile.size - size - 2 * scale + (size - mark.width) / 2;
      mark.y = tile.y + tile.size - size - 2 * scale + (size - mark.height) / 2;
      container.addChild(mark);
    }
  }

  // The log is a box of its own and keeps its place, whatever is in it.
  // @spec PRESENT-FIGHT-025
  // @spec PRESENT-FIGHT-029
  const box = plan.logBox;
  graphics.roundRect(box.x, box.y, box.width, box.height, 3 * scale)
    .fill({ color: 0x000000, alpha: 0.35 });
  graphics.roundRect(box.x, box.y, box.width, box.height, 3 * scale)
    .stroke({ width: 1, color: FIGHT_COLOURS.frame, alpha: 0.5 });

  for (const [i, line] of plan.log.entries()) {
    const entry = label(line, Math.round(12 * scale), FIGHT_COLOURS.dim);
    entry.x = box.x + pad / 2;
    entry.y = box.y + pad / 2 + i * 15 * scale;
    container.addChild(entry);
  }

  // How much there is, and where in it the player is looking.
  // @spec PRESENT-FIGHT-030
  if (plan.scrollbar) {
    const { track, thumb } = plan.scrollbar;
    graphics.roundRect(track.x, track.y, track.width, track.height, track.width / 2)
      .fill({ color: 0x000000, alpha: 0.4 });
    graphics.roundRect(thumb.x, thumb.y, thumb.width, thumb.height, thumb.width / 2)
      .fill({ color: FIGHT_COLOURS.frame, alpha: 0.9 });
  }

  // The line that names who is up keeps its room whether or not anybody is.
  // @spec PRESENT-READY-013
  // @spec PRESENT-READY-014
  // @spec PRESENT-FIGHT-027
  if (plan.prompt) {
    const line = plan.regions.promptLine;
    const prompt = label(plan.prompt, Math.round(14 * scale), FIGHT_COLOURS.text);
    prompt.x = line.x;
    prompt.y = line.y + (line.height - prompt.height) / 2;
    container.addChild(prompt);
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

    // What the band left, a line each, every item in its rarity's colour.
    // @spec PRESENT-FIGHT-050
    const finds = plan.banner.finds;
    if (finds) {
      const lines = [
        ...(finds.gold ? [{ text: finds.gold, colour: FIGHT_COLOURS.banner }] : []),
        ...finds.items.map((item) => ({ text: item.text, colour: item.colour })),
        ...(finds.nothing ? [{ text: finds.nothing, colour: FIGHT_COLOURS.dim }] : []),
      ];
      let y = b.y + 72 * scale;
      for (const line of lines) {
        const t = label(line.text, Math.round(13 * scale), line.colour);
        fitWithin(t, b.width - 24 * scale);
        t.x = b.x + b.width / 2 - t.width / 2;
        t.y = y;
        container.addChild(t);
        y += 18 * scale;
      }
    }
  }

  // The four first, then anything laid over them, so a Pass turn control covers the
  // greyed options it is explaining rather than being buried under them.
  // @spec PRESENT-FIGHT-017
  // @spec PRESENT-FIGHT-042
  const controls = plan.controls ?? [];
  for (const control of controls.filter((c) => !c.overlay && c.role !== 'TARGET')) {
    drawControl(container, control, { alpha: 0.7, scale });
  }
  for (const control of controls.filter((c) => c.overlay)) {
    drawControl(container, control, { alpha: 0.95, scale });
  }

  // Over everything else, because it covers whatever it rose in front of: a name, the
  // hit points and the blow that decide the choice, and the number that picks it.
  // @spec PRESENT-MENU-004
  // @spec PRESENT-MENU-006
  // @spec PRESENT-MENU-008
  if (plan.menu) {
    const b = plan.menu.box;
    const panel = new Graphics();
    panel.roundRect(b.x, b.y, b.width, b.height, 6).fill({ color: FIGHT_COLOURS.panel, alpha: 0.97 });
    panel.roundRect(b.x, b.y, b.width, b.height, 6).stroke({ width: 2, color: FIGHT_COLOURS.banner });
    container.addChild(panel);

    for (const entry of controls.filter((c) => c.role === 'TARGET')) {
      const frame = new Graphics();
      frame.roundRect(entry.x, entry.y, entry.width, entry.height, 4)
        .stroke({ width: 1, color: FIGHT_COLOURS.frame });
      container.addChild(frame);

      const middle = entry.y + entry.height / 2;

      // Laid out from the right edge: name, damage, weapon, hit points, so the two
      // figures sit either side of the symbol and neither needs a label.
      // @spec PRESENT-MENU-016
      // @spec PRESENT-MENU-018
      const detail = label(entry.detail, Math.round(13 * scale), FIGHT_COLOURS.dim);
      detail.x = entry.x + entry.width - detail.width - 7 * scale;
      detail.y = middle - detail.height / 2;
      container.addChild(detail);

      const symbolSize = 22 * scale;
      const symbolX = detail.x - symbolSize - 7 * scale;
      drawWeaponSymbol(container, entry.weapon, symbolX, middle - symbolSize / 2, symbolSize, scale);

      // What a hit is worth is the number being chosen by, so it is the brighter one.
      const preview = label(entry.preview, Math.round(14 * scale), FIGHT_COLOURS.banner);
      preview.x = symbolX - preview.width - 5 * scale;
      preview.y = middle - preview.height / 2;
      container.addChild(preview);

      const name = label(entry.label, Math.round(13 * scale), FIGHT_COLOURS.text);
      fitWithin(name, preview.x - entry.x - 12 * scale);
      name.x = entry.x + 6 * scale;
      name.y = middle - name.height / 2;
      container.addChild(name);
    }
  }
}

/**
 * Draw one character's page of the party screen. Every box was placed by the plan; this
 * only paints into them.
 *
 * @spec PRESENT-PARTY-007
 * @spec PRESENT-PARTY-012
 * @spec PRESENT-PARTY-013
 * @spec PRESENT-PARTY-014
 * @spec PRESENT-PARTY-015
 * @spec PRESENT-PARTY-016
 * @spec PRESENT-PARTY-017
 * @spec PRESENT-PARTY-018
 */
function drawParty(container, plan) {
  const scale = plan.scale ?? 1;
  const text = Math.round(13 * scale);
  const small = Math.round(11 * scale);
  const { bounds } = plan;
  const graphics = new Graphics();
  graphics.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 6 * scale)
    .fill({ color: FIGHT_COLOURS.panel, alpha: 0.96 });
  graphics.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 6 * scale)
    .stroke({ width: 2, color: FIGHT_COLOURS.frame });
  container.addChild(graphics);

  const put = (content, size, colour, x, y) => {
    const t = label(content, size, colour);
    t.x = x;
    t.y = y;
    container.addChild(t);
    return t;
  };
  const middle = (box, t) => box.y + (box.height - t.height) / 2;

  // The name between the arrows that turn to the next one.
  const { heading } = plan;
  const name = label(heading.name, Math.round(17 * scale), FIGHT_COLOURS.banner);
  name.x = heading.title.x + (heading.title.width - name.width) / 2;
  name.y = heading.title.y + heading.title.height / 2 - name.height + 2 * scale;
  container.addChild(name);
  const place = label(heading.position, small, FIGHT_COLOURS.dim);
  place.x = heading.title.x + (heading.title.width - place.width) / 2;
  place.y = heading.title.y + heading.title.height / 2 + 2 * scale;
  container.addChild(place);

  const box = heading.portraitBox;
  graphics.rect(box.x, box.y, box.size, box.size).fill(FIGHT_COLOURS.ally);
  const texture = portraitTexture(heading.portrait);
  if (texture) {
    const sprite = new Sprite(texture);
    sprite.x = box.x;
    sprite.y = box.y;
    sprite.width = box.size;
    sprite.height = box.size;
    container.addChild(sprite);
  }
  const besideX = box.x + box.size + 10 * scale;
  put(heading.characterClass, Math.round(15 * scale), FIGHT_COLOURS.text, besideX, box.y + 6 * scale);
  put(`Total level ${heading.totalLevel}`, text, FIGHT_COLOURS.dim, besideX, box.y + 28 * scale);

  // Hit points, and the condition in words when the bar alone could not say it.
  const { health } = plan;
  const hpLine = put(`Hit points ${health.hitPoints} / ${health.maxHitPoints}`, text, FIGHT_COLOURS.text, health.box.x, health.box.y);
  hpLine.y = middle(health.box, hpLine);
  if (health.condition) {
    const state = label(health.condition, text, FIGHT_COLOURS.critical);
    state.x = health.box.x + health.box.width - state.width;
    state.y = middle(health.box, state);
    container.addChild(state);
  }
  const bar = health.bar;
  graphics.rect(bar.x, bar.y, bar.width, bar.height).fill({ color: 0x000000, alpha: 0.5 });
  const hpColour = health.share > 0.5 ? FIGHT_COLOURS.healthy
    : health.share > 0.25 ? FIGHT_COLOURS.wounded : FIGHT_COLOURS.critical;
  if (health.share > 0) graphics.rect(bar.x, bar.y, bar.width * health.share, bar.height).fill(hpColour);

  for (const a of plan.attributes) {
    const t = put(a.label, text, FIGHT_COLOURS.dim, a.box.x, a.box.y);
    t.y = middle(a.box, t);
    const score = label(String(a.score), text, FIGHT_COLOURS.text);
    score.x = a.box.x + a.box.width - score.width - 6 * scale;
    score.y = middle(a.box, score);
    container.addChild(score);
  }

  // Each skill: its rank, and under it how far it is toward the next.
  for (const group of plan.skills) {
    const groupLabel = put(group.label, small, FIGHT_COLOURS.banner, group.box.x, group.box.y);
    groupLabel.y = middle(group.box, groupLabel);
    for (const s of group.skills) {
      const tone = s.advancing ? FIGHT_COLOURS.text : FIGHT_COLOURS.dim;
      const t = put(s.label, small, tone, s.box.x, s.box.y);
      t.y = middle(s.box, t);
      const note = s.atCap ? `${s.rank} max` : (s.advancing ? String(s.rank) : `${s.rank} stopped`);
      const rank = label(note, small, s.advancing ? FIGHT_COLOURS.text : FIGHT_COLOURS.dim);
      rank.x = s.box.x + s.box.width - rank.width - 6 * scale;
      rank.y = middle(s.box, rank);
      container.addChild(rank);

      const b = s.bar;
      const width = b.width - 6 * scale;
      graphics.rect(b.x, b.y, width, b.height).fill({ color: 0x000000, alpha: 0.5 });
      if (s.progress > 0) {
        graphics.rect(b.x, b.y, width * s.progress, b.height)
          .fill(s.advancing ? FIGHT_COLOURS.allyReady : FIGHT_COLOURS.frame);
      }
    }
  }

  for (const e of plan.equipment) {
    const slot = put(e.label, text, FIGHT_COLOURS.dim, e.box.x, e.box.y);
    slot.y = middle(e.box, slot);
    const item = label(e.item ?? '—', text, e.item ? FIGHT_COLOURS.text : FIGHT_COLOURS.dim);
    item.x = e.box.x + e.box.width * 0.28;
    item.y = middle(e.box, item);
    container.addChild(item);
  }

  for (const control of plan.controls) drawControl(container, control, { alpha: 0.85, scale });
}

/**
 * Draw the Items screen. Every box was placed by the plan; this only paints into them.
 *
 * @spec PRESENT-ITEMS-005
 * @spec PRESENT-ITEMS-006
 * @spec PRESENT-ITEMS-007
 * @spec PRESENT-ITEMS-008
 * @spec PRESENT-ITEMS-012
 */
function drawItems(container, plan) {
  const scale = plan.scale ?? 1;
  const text = Math.round(13 * scale);
  const small = Math.round(11 * scale);
  const { bounds } = plan;
  const graphics = new Graphics();
  graphics.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 6 * scale)
    .fill({ color: FIGHT_COLOURS.panel, alpha: 0.96 });
  graphics.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 6 * scale)
    .stroke({ width: 2, color: FIGHT_COLOURS.frame });
  container.addChild(graphics);

  // The name, and where this page sits, or that it is this character's turn.
  const { title } = plan;
  const name = label(title.name, Math.round(17 * scale), FIGHT_COLOURS.banner);
  fitWithin(name, title.box.width);
  name.x = title.box.x + (title.box.width - name.width) / 2;
  name.y = title.box.y + title.box.height / 2 - name.height + 2 * scale;
  container.addChild(name);
  const place = label(title.position, small, FIGHT_COLOURS.dim);
  place.x = title.box.x + (title.box.width - place.width) / 2;
  place.y = title.box.y + title.box.height / 2 + 2 * scale;
  container.addChild(place);

  const inset = 8 * scale;
  for (const entry of plan.entries) {
    const { box } = entry;
    if (entry.kind === 'HEADING') {
      const t = label(entry.text, small, FIGHT_COLOURS.banner);
      t.x = box.x;
      t.y = box.y + (box.height - t.height) / 2;
      container.addChild(t);
      // The purse, on the far side of the pack's heading.
      // @spec PRESENT-ITEMS-023
      if (entry.aside) {
        const aside = label(entry.aside, small, FIGHT_COLOURS.banner);
        aside.x = box.x + box.width - aside.width - inset;
        aside.y = t.y;
        container.addChild(aside);
      }
      continue;
    }
    if (entry.kind === 'NOTE') {
      const t = label(entry.text, text, FIGHT_COLOURS.dim);
      t.x = box.x + inset;
      t.y = box.y + (box.height - t.height) / 2;
      container.addChild(t);
      continue;
    }

    // A row: a quiet panel, outlined when it is the highlighted one.
    graphics.roundRect(box.x, box.y + 1, box.width, box.height - 2, 4 * scale)
      .fill({ color: entry.selected ? FIGHT_COLOURS.ally : 0x000000, alpha: entry.selected ? 0.9 : 0.35 });
    if (entry.selected) {
      graphics.roundRect(box.x, box.y + 1, box.width, box.height - 2, 4 * scale)
        .stroke({ width: 1.5, color: FIGHT_COLOURS.banner });
    }

    const tone = entry.greyed ? FIGHT_COLOURS.dim : FIGHT_COLOURS.text;
    const nameLeft = entry.label ? box.x + box.width * 0.3 : box.x + inset;
    if (entry.label) {
      const slot = label(entry.label, text, FIGHT_COLOURS.dim);
      fitWithin(slot, nameLeft - box.x - inset * 2);
      slot.x = box.x + inset;
      slot.y = box.y + 4 * scale;
      container.addChild(slot);
    }
    // A name in its rarity's colour, unless the row is greyed.
    // @spec PRESENT-RARITY-001
    const nameTone = !entry.name || entry.greyed ? FIGHT_COLOURS.dim : (entry.colour ?? tone);
    const itemName = label(entry.name ?? '—', text, nameTone);
    fitWithin(itemName, box.x + box.width - inset - nameLeft);
    itemName.x = nameLeft;
    itemName.y = box.y + 4 * scale;
    container.addChild(itemName);
    if (entry.detail) {
      const detail = label(entry.detail, small, entry.greyed ? FIGHT_COLOURS.critical : FIGHT_COLOURS.dim);
      fitWithin(detail, box.x + box.width - inset - nameLeft);
      detail.x = nameLeft;
      detail.y = box.y + box.height - detail.height - 5 * scale;
      container.addChild(detail);
    }
  }

  for (const control of plan.controls) {
    if (control.kind === 'BUTTON') drawControl(container, control, { alpha: 0.85, scale });
  }
}
