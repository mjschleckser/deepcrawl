import './style.css';
import { createCampaign } from './content/campaign.js';
import { computeSight } from './sim/exploration.js';
import { createRenderer } from './render/app.js';
import { playableViewport } from './render/viewport.js';
import { createController, pressKey, pressPointer, releasePointer, resize, layers } from './render/controller.js';

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

  // The outline is shown for as long as the finger is down, and no longer.
  for (const ending of ['pointerup', 'pointercancel', 'pointerleave']) {
    renderer.app.canvas.addEventListener(ending, () => releasePointer(controller));
  }

  /**
   * Follow the visible viewport rather than the layout one, and keep following it: the
   * address bar slides in and out as the player taps and scrolls.
   *
   * @spec PRESENT-SCENE-008
   * @spec PRESENT-SCENE-009
   */
  const fit = () => {
    const viewport = playableViewport(window, getComputedStyle(document.documentElement));
    renderer.app.renderer.resize(viewport.width, viewport.height);
    resize(controller, viewport);
  };

  fit();
  window.visualViewport?.addEventListener('resize', fit);
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
}

bootstrap();
