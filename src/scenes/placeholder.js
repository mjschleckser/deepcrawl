import { Container, Graphics, Text } from 'pixi.js';

const TILE_SIZE = 48;

// 0 = floor, 1 = wall
const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export function createPlaceholderScene(app) {
  const world = new Container();
  app.stage.addChild(world);

  const mapContainer = new Container();
  world.addChild(mapContainer);

  for (let y = 0; y < MAP.length; y++) {
    for (let x = 0; x < MAP[y].length; x++) {
      const tile = new Graphics();
      const isWall = MAP[y][x] === 1;
      tile
        .rect(0, 0, TILE_SIZE, TILE_SIZE)
        .fill(isWall ? 0x3a2e26 : 0x0f0c09)
        .stroke({ width: 1, color: 0x000000, alpha: 0.4 });
      tile.x = x * TILE_SIZE;
      tile.y = y * TILE_SIZE;
      mapContainer.addChild(tile);
    }
  }

  const player = new Graphics();
  player.circle(0, 0, TILE_SIZE * 0.3).fill(0xd8b46a);
  player.x = 1 * TILE_SIZE + TILE_SIZE / 2;
  player.y = 1 * TILE_SIZE + TILE_SIZE / 2;
  world.addChild(player);

  const gridPos = { x: 1, y: 1 };

  const label = new Text({
    text: 'WASD / arrows to move — placeholder scene, replace with real game logic',
    style: { fill: 0xd8b46a, fontSize: 14, fontFamily: 'monospace' },
  });
  label.x = 8;
  label.y = 8;
  app.stage.addChild(label);

  function canMoveTo(x, y) {
    return MAP[y] && MAP[y][x] === 0;
  }

  function tryMove(dx, dy) {
    const nx = gridPos.x + dx;
    const ny = gridPos.y + dy;
    if (canMoveTo(nx, ny)) {
      gridPos.x = nx;
      gridPos.y = ny;
      player.x = nx * TILE_SIZE + TILE_SIZE / 2;
      player.y = ny * TILE_SIZE + TILE_SIZE / 2;
    }
  }

  const keyMap = {
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
    ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  };

  window.addEventListener('keydown', (e) => {
    const move = keyMap[e.key];
    if (move) {
      e.preventDefault();
      tryMove(move[0], move[1]);
    }
  });

  function centerWorld() {
    world.x = app.screen.width / 2 - (MAP[0].length * TILE_SIZE) / 2;
    world.y = app.screen.height / 2 - (MAP.length * TILE_SIZE) / 2;
  }

  centerWorld();
  app.renderer.on('resize', centerWorld);
}
