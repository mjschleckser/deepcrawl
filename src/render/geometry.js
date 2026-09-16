/**
 * Screen geometry for the presentation segment: the receding frames the corridor is
 * drawn between, and the tap regions laid over them.
 *
 * Everything here is a function of the viewport, so a resize is a recomputation rather
 * than a special case.
 */

/** How much each depth frame shrinks toward the vanishing point. */
export const FRAME_RATIO = 0.62;

/**
 * Nested rectangles receding toward the centre of the screen. Frame 0 is the whole
 * viewport; the band between consecutive frames is one tile's worth of corridor.
 *
 * @spec PRESENT-VIEW-001
 * @spec PRESENT-INPUT-005
 */
export function depthFrames(viewport, count, ratio = FRAME_RATIO) {
  const centreX = viewport.width / 2;
  const centreY = viewport.height / 2;
  const frames = [];

  for (let depth = 0; depth < count; depth++) {
    const scale = ratio ** depth;
    const width = viewport.width * scale;
    const height = viewport.height * scale;
    frames.push({ depth, x: centreX - width / 2, y: centreY - height / 2, width, height });
  }
  return frames;
}

/**
 * The smallest a tappable control may be drawn. In real pixels, not a fraction: a
 * thumb does not shrink with the viewport.
 *
 * @spec PRESENT-CTRL-002
 */
export const MIN_TAP_PX = 48;

/**
 * The viewport the layout was designed against: a phone held upright.
 */
export const BASE_VIEWPORT = { width: 390, height: 780 };

/** How much larger than that layout anything may be drawn. */
export const MAX_UI_SCALE = 2;

/**
 * How large to draw everything, given the screen it is being drawn on.
 *
 * The smaller of the two ratios, so a wide short window does not inflate the controls
 * until they fall off the bottom of it. Never below 1, because the phone layout is
 * already at the floor of what a thumb can use; never above 2, because past that the
 * game stops looking like a bigger version of itself.
 *
 * @spec PRESENT-CTRL-012
 */
export function uiScale(viewport) {
  const ratio = Math.min(
    viewport.width / BASE_VIEWPORT.width,
    viewport.height / BASE_VIEWPORT.height,
  );
  return Math.min(MAX_UI_SCALE, Math.max(1, ratio));
}

/** How wide a column of content may be at scale 1. */
export const MAX_CONTENT_WIDTH = 560;

/**
 * A centred column to lay content out in. A phone gets its whole width; a desktop gets
 * a column with the dungeon showing either side, because a button spanning a third of
 * a monitor is not a bigger button and a line of text spanning all of it is not an
 * easier read.
 *
 * @spec PRESENT-FIGHT-020
 */
export function contentColumn(viewport) {
  const width = Math.min(viewport.width, MAX_CONTENT_WIDTH * uiScale(viewport));
  return { x: (viewport.width - width) / 2, width };
}

/**
 * The horned head an enemy is drawn with, wherever it is drawn: a head, two horns, and
 * a pair of eyes around a given centre. One shape in one place, so the mark on the map
 * and the figure down the corridor are recognisably the same creature.
 *
 * @spec PRESENT-MAP-011
 * @spec PRESENT-VIEW-015
 */
export function hornedHead(cx, cy, radius) {
  const brow = cy - radius * 0.55;
  const horn = (side) => [
    cx + side * radius * 1.05, brow - radius * 0.95,
    cx + side * radius * 0.15, brow + radius * 0.2,
    cx + side * radius * 0.95, brow + radius * 0.5,
  ];
  return {
    head: { x: cx, y: cy, radius },
    horns: [horn(-1), horn(1)],
    eyes: [
      { x: cx - radius * 0.4, y: cy, radius: Math.max(0.5, radius * 0.2) },
      { x: cx + radius * 0.4, y: cy, radius: Math.max(0.5, radius * 0.2) },
    ],
  };
}

/**
 * A zone is a large area of the view and draws as a bare label, because a panel that
 * size would hide the corridor. A button is small and discrete and keeps its panel,
 * because hiding almost nothing buys almost nothing.
 *
 * @spec PRESENT-CTRL-011
 */
export const ControlKind = { ZONE: 'ZONE', BUTTON: 'BUTTON' };

/** What each region does, named for the player rather than for the key. */
const CONTROL_LABELS = {
  FORWARD: { label: 'Forward', hint: 'W', kind: ControlKind.ZONE },
  BACKWARD: { label: 'Back', hint: 'S', kind: ControlKind.ZONE },
  TURN_LEFT: { label: 'Left', hint: 'A', kind: ControlKind.ZONE },
  TURN_RIGHT: { label: 'Right', hint: 'D', kind: ControlKind.ZONE },
  PARTY_BAR: { label: 'Party', hint: 'P', kind: ControlKind.BUTTON },
  PACK: { label: 'Pack', hint: 'I', kind: ControlKind.BUTTON },
  SPELL_ICON: { label: 'Spells', hint: 'C', kind: ControlKind.BUTTON },
  SEARCH_CONTROL: { label: 'Search', hint: 'F', kind: ControlKind.BUTTON },
  INTERACT_PROMPT: { label: 'Use', hint: 'E', kind: ControlKind.BUTTON },
  MAP: { label: 'Map', hint: 'M', kind: ControlKind.BUTTON },
};

/**
 * Tap regions as fractions of the viewport, so the same layout holds on a phone and
 * in a desktop window. Ordered most specific first: the controls along the bottom and
 * the map widget are hit-tested before the broad turn and step areas behind them.
 *
 * @spec PRESENT-INPUT-004
 */
/**
 * What a region's fractions are measured against. A row of buttons belongs to the
 * centred column, so it stays a row rather than spreading across a monitor. A corner
 * widget belongs to the corner it sits in, and a zone belongs to the whole screen.
 */
export const Anchor = { VIEWPORT: 'VIEWPORT', COLUMN: 'COLUMN' };

export const TouchLayout = [
  { region: 'MAP', fx: 0.78, fy: 0.02, fw: 0.2, fh: 0.2, anchor: Anchor.VIEWPORT },
  { region: 'PARTY_BAR', fx: 0.02, fy: 0.86, fw: 0.18, fh: 0.12, anchor: Anchor.COLUMN },
  { region: 'PACK', fx: 0.22, fy: 0.86, fw: 0.18, fh: 0.12, anchor: Anchor.COLUMN },
  { region: 'SPELL_ICON', fx: 0.42, fy: 0.86, fw: 0.18, fh: 0.12, anchor: Anchor.COLUMN },
  { region: 'SEARCH_CONTROL', fx: 0.62, fy: 0.86, fw: 0.16, fh: 0.12, anchor: Anchor.COLUMN },
  { region: 'INTERACT_PROMPT', fx: 0.8, fy: 0.86, fw: 0.18, fh: 0.12, anchor: Anchor.COLUMN },
  { region: 'TURN_LEFT', fx: 0.0, fy: 0.18, fw: 0.26, fh: 0.66, anchor: Anchor.VIEWPORT },
  { region: 'TURN_RIGHT', fx: 0.74, fy: 0.18, fw: 0.26, fh: 0.66, anchor: Anchor.VIEWPORT },
  // The centre splits: walking on above, giving ground below. Forward takes the larger
  // share, being the one used on almost every step.
  { region: 'FORWARD', fx: 0.26, fy: 0.18, fw: 0.48, fh: 0.44, anchor: Anchor.VIEWPORT },
  { region: 'BACKWARD', fx: 0.26, fy: 0.62, fw: 0.48, fh: 0.22, anchor: Anchor.VIEWPORT },
];

/**
 * @spec PRESENT-INPUT-005
 * @spec PRESENT-CTRL-002
 * @spec PRESENT-CTRL-012
 */
export function tapRegionsFor(viewport) {
  const column = contentColumn(viewport);
  const scale = uiScale(viewport);
  // The most a discrete button may grow to. A zone is meant to cover the screen; a
  // button is meant to be pressed, and past this it is only a larger target for the
  // same tap.
  const maxButton = MIN_TAP_PX * 4 * scale;

  return TouchLayout.map(({ region, fx, fy, fw, fh, anchor }) => {
    // A zone spans whatever it is measured against, because covering ground is its
    // job. A button is bounded, because past a point it is only a larger target for
    // the same tap.
    const zone = CONTROL_LABELS[region].kind === ControlKind.ZONE;
    const basis = anchor === Anchor.COLUMN ? column : { x: 0, width: viewport.width };

    const natural = fw * basis.width;
    const width = Math.min(
      viewport.width,
      Math.max(MIN_TAP_PX, zone ? natural : Math.min(natural, maxButton)),
    );
    const naturalHeight = fh * viewport.height;
    const height = Math.min(
      viewport.height,
      Math.max(MIN_TAP_PX, zone ? naturalHeight : Math.min(naturalHeight, maxButton)),
    );

    // A bounded button keeps the centre of the share it was given, so a row that no
    // longer fills its basis stays evenly spread across it.
    const left = zone
      ? basis.x + fx * basis.width
      : basis.x + fx * basis.width + (natural - width) / 2;

    return {
      region,
      x: Math.max(0, Math.min(left, viewport.width - width)),
      y: Math.max(0, Math.min(fy * viewport.height, viewport.height - height)),
      width,
      height,
    };
  });
}

/**
 * The same regions, with what to draw in them. A control nobody can see is a control
 * only a keyboard player has.
 *
 * @spec PRESENT-CTRL-001
 * @spec PRESENT-CTRL-003
 * @spec PRESENT-CTRL-004
 */
export function controlsFor(viewport, { pressedRegion = null } = {}) {
  return tapRegionsFor(viewport).map((area) => ({
    ...area,
    ...CONTROL_LABELS[area.region],
    // Drawn as a bare label until a finger is on it: a panel big enough to tap is a
    // panel big enough to hide the corridor.
    pressed: area.region === pressedRegion,
  }));
}

/**
 * Which region a press landed in, or null when it landed in none.
 *
 * @spec PRESENT-INPUT-002
 * @spec PRESENT-INPUT-003
 */
export function hitTest(viewport, px, py) {
  for (const area of tapRegionsFor(viewport)) {
    if (
      px >= area.x &&
      px <= area.x + area.width &&
      py >= area.y &&
      py <= area.y + area.height
    ) {
      return area.region;
    }
  }
  return null;
}
