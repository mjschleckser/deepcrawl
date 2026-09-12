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

/** Flat fills per light level; the corridor fades toward black as the torch fails. */
export const PALETTE = {
  BRIGHT: { wall: 0x6b5640, floor: 0x2e2418, ceiling: 0x17120c, opening: 0x090705 },
  DIM: { wall: 0x3a2f24, floor: 0x1a150e, ceiling: 0x0d0a07, opening: 0x050403 },
  DARK: { wall: 0x000000, floor: 0x000000, ceiling: 0x000000, opening: 0x000000 },
  darkness: 0x000000,
  feature: 0xd8b46a,
  map: {
    cell: 0x1c160f,
    wall: 0x8a7354,
    door: 0xd8b46a,
    secret: 0xc06a4a,
    party: 0xe8d9a8,
    enemy: 0xc0503a,
    trap: 0xc06a4a,
    backdrop: 0x000000,
  },
};
