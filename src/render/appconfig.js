/**
 * Renderer configuration, kept apart from the Pixi adapter so it can be read without
 * pulling a renderer into a test environment.
 */

/**
 * The ticker is off. The world advances only when the player acts, so a render loop
 * would redraw an unchanged corridor sixty times a second — battery spent on nothing,
 * on the phone this game is built for.
 *
 * @spec PRESENT-SCENE-002
 */
export const PIXI_APP_OPTIONS = {
  autoStart: false,
  resizeTo: undefined,
  background: '#0b0906',
  antialias: false,
  autoDensity: true,
};

/**
 * Darken a colour by a factor from nought (black) to one (unchanged). Distance in the
 * corridor is drawn as shade, so every tone at a depth is darkened alike.
 */
export function shade(colour, factor) {
  const f = Math.min(1, Math.max(0, factor));
  const channel = (shift) => Math.round(((colour >> shift) & 0xff) * f);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Flat fills for the corridor, before distance darkens them. */
export const PALETTE = {
  view: {
    wall: 0x6b5640, floor: 0x2e2418, ceiling: 0x17120c, opening: 0x090705,
    door: 0x7a4a22, doorFrame: 0x3d2510, handle: 0xd8b46a,
    figure: 0x8f3a28, figureEdge: 0x2a120c, eye: 0xf0d48a,
    chest: 0x8a5524, chestBand: 0xd8b46a, chestInside: 0x120c07,
  },
  feature: 0xd8b46a,
  map: {
    cell: 0x1c160f,
    wall: 0x8a7354,
    door: 0xd8b46a,
    secret: 0xc06a4a,
    eye: 0x1c160f,
    party: 0xe8d9a8,
    enemy: 0xc0503a,
    trap: 0xc06a4a,
    chest: 0x5fb3a0,
    backdrop: 0x000000,
  },
};

/**
 * The colour an item's name is drawn in, by rarity: the convention most players already
 * read at a glance. Common is the ordinary text colour, so only a find worth noticing
 * stands out.
 *
 * @spec PRESENT-RARITY-002
 */
export const RARITY_COLOURS = {
  COMMON: 0xe8d9a8,
  UNCOMMON: 0x6cc24a,
  RARE: 0x4f8fe6,
  EPIC: 0xa66be0,
  LEGENDARY: 0xec8a2c,
};

/** The colour for an item's name. @spec PRESENT-RARITY-001 */
export const rarityColour = (item) => RARITY_COLOURS[item?.rarity] ?? RARITY_COLOURS.COMMON;
