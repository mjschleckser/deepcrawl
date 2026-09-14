import './style.css';
import { createCampaign } from './content/campaign.js';
import { computeSight } from './sim/exploration.js';
import { createRenderer } from './render/app.js';
import { createController, pressKey, pressPointer, resize, answerPrompt } from './render/controller.js';

async function bootstrap() {
  const mount = document.querySelector('#app');
  const { state } = createCampaign();
  // Record what the party can see from where it starts, before anything is drawn.
  computeSight(state);

  let controller;
  const renderer = await createRenderer(mount, {
    onAnswer: (accepted) => answerPrompt(controller, accepted),
  });

  controller = createController({
    state,
    viewport: renderer.viewport(),
    onDraw: renderer.draw,
  });

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
