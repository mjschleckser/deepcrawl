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

/** What each region does, named for the player rather than for the key. */
const CONTROL_LABELS = {
  FORWARD: { label: 'Forward', hint: 'W' },
  TURN_LEFT: { label: 'Left', hint: 'A' },
  TURN_RIGHT: { label: 'Right', hint: 'D' },
  TURN_AROUND: { label: 'About', hint: 'S' },
  PARTY_BAR: { label: 'Party', hint: 'P' },
  PACK: { label: 'Pack', hint: 'I' },
  SPELL_ICON: { label: 'Spells', hint: 'C' },
  SEARCH_CONTROL: { label: 'Search', hint: 'F' },
  INTERACT_PROMPT: { label: 'Use', hint: 'E' },
  MAP: { label: 'Map', hint: 'M' },
};

/**
 * Tap regions as fractions of the viewport, so the same layout holds on a phone and
 * in a desktop window. Ordered most specific first: the controls along the bottom and
 * the map widget are hit-tested before the broad turn and step areas behind them.
 *
 * @spec PRESENT-INPUT-004
 */
export const TouchLayout = [
  { region: 'MAP', fx: 0.78, fy: 0.02, fw: 0.2, fh: 0.2 },
  { region: 'PARTY_BAR', fx: 0.02, fy: 0.86, fw: 0.18, fh: 0.12 },
  { region: 'PACK', fx: 0.22, fy: 0.86, fw: 0.18, fh: 0.12 },
  { region: 'SPELL_ICON', fx: 0.42, fy: 0.86, fw: 0.18, fh: 0.12 },
  { region: 'SEARCH_CONTROL', fx: 0.62, fy: 0.86, fw: 0.16, fh: 0.12 },
  { region: 'INTERACT_PROMPT', fx: 0.8, fy: 0.86, fw: 0.18, fh: 0.12 },
  { region: 'TURN_AROUND', fx: 0.35, fy: 0.66, fw: 0.3, fh: 0.18 },
  { region: 'TURN_LEFT', fx: 0.0, fy: 0.22, fw: 0.25, fh: 0.62 },
  { region: 'TURN_RIGHT', fx: 0.75, fy: 0.22, fw: 0.25, fh: 0.62 },
  { region: 'FORWARD', fx: 0.25, fy: 0.1, fw: 0.5, fh: 0.56 },
];

/**
 * @spec PRESENT-INPUT-005
 * @spec PRESENT-CTRL-002
 */
export function tapRegionsFor(viewport) {
  return TouchLayout.map(({ region, fx, fy, fw, fh }) => {
    // Proportions from the fractions, but never below a thumb, and never pushed off
    // the edge by the growing.
    const width = Math.min(viewport.width, Math.max(MIN_TAP_PX, fw * viewport.width));
    const height = Math.min(viewport.height, Math.max(MIN_TAP_PX, fh * viewport.height));
    return {
      region,
      x: Math.max(0, Math.min(fx * viewport.width, viewport.width - width)),
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
export function controlsFor(viewport) {
  return tapRegionsFor(viewport).map((area) => ({ ...area, ...CONTROL_LABELS[area.region] }));
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
