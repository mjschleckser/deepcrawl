import './style.css';
import { createCampaign } from './content/campaign.js';
import { createAutosave, startCampaign, writeTestingMode } from './content/savegame.js';
import { computeSight } from './sim/exploration.js';
import { createRenderer } from './render/app.js';
import { playableViewport } from './render/viewport.js';
import {
  createController, pressKey, pressPointer, releasePointer, replaceCampaign, resize, layers,
  setSaveNote, setNewBuild, tick, isPlaying, scrollFightLog, scrollItems, dragPointer,
} from './render/controller.js';
import { watchForUpdates } from './content/updates.js';

/** Local storage can refuse even to be looked at, in a private window for one. */
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function bootstrap() {
  const mount = document.querySelector('#app');
  const storage = browserStorage();
  // In testing mode every load is a new testing campaign, and nothing is saved.
  const { campaign, setAside, canWrite, testing: startedTesting } = startCampaign(storage);
  let testing = startedTesting;
  // Exposed for driving the game from a browser smoke test. Development only.
  if (import.meta.env.DEV) window.__campaign = campaign;
  // Record what the party can see from where it stands, before anything is drawn.
  computeSight(campaign.state);

  let controller;
  let autosave;
  let saving = true;
  const renderer = await createRenderer(mount);

  const showSaveNote = () => {
    if (!controller) return;
    // @spec SAVE-TEST-003
    const note = testing ? 'Testing mode' : !saving ? 'Not saving' : setAside ? 'Old save set aside' : null;
    setSaveNote(controller, note);
  };

  /**
   * Replace the campaign, and its save with it, at once: the old one is gone by the
   * player's own choice, and nothing should bring it back on a reload.
   *
   * @spec SAVE-NEW-001
   */
  const beginAgain = () => {
    const fresh = createCampaign({ testing });
    computeSight(fresh.state);
    if (import.meta.env.DEV) window.__campaign = fresh;
    replaceCampaign(controller, fresh);
    autosave.flush();
  };

  /**
   * Switch testing mode: remember the new setting, and begin a new campaign in it, which
   * is saved only when testing mode is off.
   *
   * @spec SAVE-TEST-005
   */
  const toggleTesting = () => {
    testing = !testing;
    writeTestingMode(storage, testing);
    autosave.setCanWrite(!testing);
    beginAgain();
    showSaveNote();
  };

  // A redraw is the one thing every change to the campaign has in common, a fight's
  // blows included, and a redraw that changed nothing writes nothing.
  // @spec SAVE-WRITE-001
  // @spec SAVE-WRITE-003
  controller = createController({
    state: campaign.state,
    campaign,
    viewport: renderer.viewport(),
    onDraw: (drawn) => {
      renderer.draw(drawn);
      autosave?.touch();
    },
    onBeginAgain: beginAgain,
    onToggleTesting: () => toggleTesting(),
  });

  autosave = createAutosave({
    storage,
    canWrite,
    read: () => controller.campaign,
    onStatus: (ok) => {
      saving = ok;
      showSaveNote();
    },
  });
  autosave.flush();
  showSaveNote();

  // Hiding is the last moment that can be relied on: a phone may never say it closed.
  // @spec SAVE-WRITE-002
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autosave.flush();
  });
  window.addEventListener('pagehide', () => autosave.flush());

  // A built app is served through a service worker, and an open one has to be told when
  // that worker has a newer build. The development server has no worker to ask.
  // @spec PRESENT-BUILD-007
  if (import.meta.env.PROD) {
    watchForUpdates({
      container: navigator.serviceWorker,
      document,
      onAvailable: () => setNewBuild(controller),
      url: `${import.meta.env.BASE_URL}sw.js`,
      scope: import.meta.env.BASE_URL,
    });
  }

  if (import.meta.env.DEV) {
    controller.__layers = () => layers(controller);
    window.__controller = controller;
  }

  /**
   * The ticker runs while, and only while, a fight has something to play out on its
   * own. A stopped ticker is a rule about not redrawing an unchanged screen; a screen
   * changing by itself is the one case it was never written for.
   *
   * @spec PRESENT-SCENE-002
   * @spec PRESENT-SCENE-011
   */
  const pump = () => {
    if (isPlaying(controller)) {
      if (!renderer.app.ticker.started) renderer.app.ticker.start();
    } else if (renderer.app.ticker.started) {
      renderer.app.ticker.stop();
    }
  };

  renderer.app.ticker.add((ticker) => {
    tick(controller, ticker.deltaMS);
    pump();
  });

  // A wheel over a fight walks back through its log and means nothing anywhere else.
  // A notch moves a few lines rather than one, so a long fight is walked back through
  // rather than crawled through.
  renderer.app.canvas.addEventListener('wheel', (event) => {
    const lines = Math.max(1, Math.min(5, Math.round(Math.abs(event.deltaY) / 40)));
    if (scrollFightLog(controller, event.deltaY > 0 ? -lines : lines)) event.preventDefault();
    // Over the Items screen it scrolls the list.
    // @spec PRESENT-ITEMS-022
    else if (controller.itemsScreen || controller.partyScreen || controller.fight?.pending?.items) {
      scrollItems(controller, event.deltaY);
      event.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (pressKey(controller, event.key)) event.preventDefault();
    pump();
  });

  renderer.app.canvas.addEventListener('pointerdown', (event) => {
    const bounds = renderer.app.canvas.getBoundingClientRect();
    pressPointer(controller, event.clientX - bounds.left, event.clientY - bounds.top);
    pump();
  });

  // The outline is shown for as long as the finger is down, and no longer.
  // A finger dragged over the Items screen's list scrolls it.
  // @spec PRESENT-ITEMS-022
  renderer.app.canvas.addEventListener('pointermove', (event) => {
    const bounds = renderer.app.canvas.getBoundingClientRect();
    dragPointer(controller, event.clientX - bounds.left, event.clientY - bounds.top);
  });
  // Only a finger lifted is a tap; one taken away by the browser or off the canvas is not.
  renderer.app.canvas.addEventListener('pointerup', () => { releasePointer(controller); pump(); });
  for (const ending of ['pointercancel', 'pointerleave']) {
    renderer.app.canvas.addEventListener(ending, () => releasePointer(controller, { cancelled: true }));
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
  pump();
  window.visualViewport?.addEventListener('resize', fit);
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
}

bootstrap();
