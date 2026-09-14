import './style.css';
import { createCampaign } from './content/campaign.js';
import { computeSight } from './sim/exploration.js';
import { createRenderer } from './render/app.js';
import { createController, pressKey, pressPointer, resize, layers } from './render/controller.js';

async function bootstrap() {
  const mount = document.querySelector('#app');
  const campaign = createCampaign();
  const state = campaign.state;
  // Exposed for driving the game from a browser smoke test. Development only.
  if (import.meta.env.DEV) window.__campaign = campaign;
  // Record what the party can see from where it starts, before anything is drawn.
  computeSight(state);

  let controller;
  const renderer = await createRenderer(mount);

  controller = createController({
    state,
    campaign,
    viewport: renderer.viewport(),
    onDraw: renderer.draw,
  });

  if (import.meta.env.DEV) {
    controller.__layers = () => layers(controller);
    window.__controller = controller;
  }

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (pressKey(controller, event.key)) event.preventDefault();
  });

  renderer.app.canvas.addEventListener('pointerdown', (event) => {
    const bounds = renderer.app.canvas.getBoundingClientRect();
    pressPointer(controller, event.clientX - bounds.left, event.clientY - bounds.top);
  });

  renderer.app.renderer.on('resize', () => resize(controller, renderer.viewport()));
}

bootstrap();
