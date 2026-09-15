import { describe, it, expect } from 'vitest';
import { visibleViewport, safeAreaInsets, playableViewport } from './viewport.js';

const style = (values) => ({ getPropertyValue: (name) => values[name] ?? '' });
const noInsets = style({});

describe('the visible viewport', () => {
  // @spec PRESENT-SCENE-008
  it('prefers what the browser says it is actually showing', () => {
    // A phone browser: the layout viewport is taller than the visible one, because the
    // address bar is sitting over the bottom of it.
    const win = { innerWidth: 390, innerHeight: 844, visualViewport: { width: 390, height: 730 } };

    expect(visibleViewport(win)).toEqual({ width: 390, height: 730 });
  });

  // @spec PRESENT-SCENE-008
  it('falls back to the window when the browser offers no report', () => {
    expect(visibleViewport({ innerWidth: 1440, innerHeight: 900 }))
      .toEqual({ width: 1440, height: 900 });
  });

  // @spec PRESENT-SCENE-008
  it('ignores a report of nothing, which some browsers give before first paint', () => {
    const win = { innerWidth: 390, innerHeight: 844, visualViewport: { width: 0, height: 0 } };

    expect(visibleViewport(win)).toEqual({ width: 390, height: 844 });
  });

  // @spec PRESENT-SCENE-008
  it('rounds, so the surface is never a fraction of a pixel', () => {
    const win = { innerWidth: 390, innerHeight: 844, visualViewport: { width: 389.6, height: 729.4 } };

    expect(visibleViewport(win)).toEqual({ width: 390, height: 729 });
  });
});

describe('safe areas', () => {
  // @spec PRESENT-SCENE-008
  it('reads the insets the device reports', () => {
    const insets = safeAreaInsets(style({
      '--safe-top': '47px', '--safe-bottom': '34px', '--safe-left': '0px', '--safe-right': '0px',
    }));

    expect(insets).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
  });

  // @spec PRESENT-SCENE-008
  it('treats a missing or unreadable inset as nothing', () => {
    expect(safeAreaInsets(style({ '--safe-bottom': '' }))).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(safeAreaInsets(undefined)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});

describe('what the game may draw in', () => {
  // @spec PRESENT-SCENE-008
  it('is what can be seen, less what it may not have', () => {
    const win = { innerWidth: 390, innerHeight: 844, visualViewport: { width: 390, height: 730 } };
    const insets = style({ '--safe-top': '47px', '--safe-bottom': '34px' });

    expect(playableViewport(win, insets)).toEqual({ width: 390, height: 730 - 47 - 34 });
  });

  // @spec PRESENT-SCENE-008
  it('leaves a desktop window untouched, having neither chrome overlay nor insets', () => {
    expect(playableViewport({ innerWidth: 1440, innerHeight: 900 }, noInsets))
      .toEqual({ width: 1440, height: 900 });
  });

  // @spec PRESENT-SCENE-008
  it('never collapses to nothing, however aggressive the insets', () => {
    const win = { innerWidth: 320, innerHeight: 200, visualViewport: { width: 320, height: 200 } };
    const insets = style({ '--safe-top': '500px', '--safe-bottom': '500px' });

    const playable = playableViewport(win, insets);
    expect(playable.height).toBeGreaterThan(0);
    expect(playable.width).toBeGreaterThan(0);
  });

  // @spec PRESENT-SCENE-009
  it('shrinks as the browser chrome slides in', () => {
    const win = { innerWidth: 390, innerHeight: 844, visualViewport: { width: 390, height: 844 } };
    const chromeHidden = playableViewport(win, noInsets);

    win.visualViewport.height = 730;
    const chromeShown = playableViewport(win, noInsets);

    expect(chromeShown.height).toBeLessThan(chromeHidden.height);
  });
});
