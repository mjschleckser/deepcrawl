import { describe, it, expect } from 'vitest';
import { formatVersion, resolveVersion, APP_VERSION } from '../version.js';
import { versionStamp, MIN_TAP_PX } from './geometry.js';
import { createController, layers } from './controller.js';
import { createExploration } from '../sim/exploration.js';
import { createFloor, Direction } from '../sim/floor.js';
import { createLightSource } from '../sim/light.js';

const viewport = { width: 800, height: 600 };

describe('the version a build stamps in', () => {
  // @spec PRESENT-BUILD-004
  it('takes its major and minor from the package and its patch from the commit count', () => {
    expect(formatVersion({ version: '0.1.0', commits: 148, sha: 'f2f4a49' }))
      .toBe('0.1.148+f2f4a49');
  });

  // @spec PRESENT-BUILD-004
  it('rises with every commit, so a newer build always reads higher', () => {
    const before = formatVersion({ version: '0.1.0', commits: 148 });
    const after = formatVersion({ version: '0.1.0', commits: 149 });

    expect(after).not.toBe(before);
    expect(Number(after.split('.')[2])).toBeGreaterThan(Number(before.split('.')[2]));
  });

  // @spec PRESENT-BUILD-004
  it('still composes a version where git could not be asked', () => {
    expect(formatVersion({ version: '0.1.0', commits: NaN, sha: '' })).toBe('0.1.0');
    expect(formatVersion()).toBe('0.0.0');
  });

  // @spec PRESENT-BUILD-005
  it('falls back to a stand-in when no build stamped one in', () => {
    expect(resolveVersion(null)).toBe('dev');
    expect(resolveVersion('')).toBe('dev');
    expect(resolveVersion('0.1.148+f2f4a49')).toBe('0.1.148+f2f4a49');
  });

  // @spec PRESENT-BUILD-003
  it('reads a version from the build rather than working one out', () => {
    // Whatever the build put in, there is always something to show.
    expect(APP_VERSION).toBeTruthy();
    expect(APP_VERSION === 'dev' || /^\d+\.\d+\.\d+/.test(APP_VERSION)).toBe(true);
  });
});

describe('where the stamp sits', () => {
  // @spec PRESENT-BUILD-001
  it('sits in the bottom-left corner of the viewport', () => {
    const stamp = versionStamp({ viewport, text: '0.1.148+f2f4a49' });

    expect(stamp.x).toBeLessThan(viewport.width * 0.1);
    expect(stamp.y + stamp.size).toBeLessThanOrEqual(viewport.height);
    expect(stamp.y).toBeGreaterThan(viewport.height * 0.8);
  });

  // @spec PRESENT-BUILD-002
  it('moves above whatever occupies that corner rather than over it', () => {
    const control = { x: 0, y: viewport.height - 60, width: 120, height: 60 };
    const stamp = versionStamp({ viewport, controls: [control], text: '0.1.148' });

    expect(stamp.y + stamp.size).toBeLessThanOrEqual(control.y);
  });

  // @spec PRESENT-BUILD-002
  it('stays where it is for something that does not reach the corner', () => {
    const far = { x: viewport.width - 100, y: viewport.height - 60, width: 100, height: 60 };
    const clear = versionStamp({ viewport, text: '0.1.148' });

    expect(versionStamp({ viewport, controls: [far], text: '0.1.148' }).y).toBe(clear.y);
  });

  // @spec PRESENT-BUILD-002
  it('clears a stack of controls in that corner, not merely the last one read', () => {
    const lower = { x: 0, y: viewport.height - 40, width: 200, height: 40 };
    const upper = { x: 0, y: viewport.height - 120, width: 200, height: 80 };
    const stamp = versionStamp({ viewport, controls: [lower, upper], text: '0.1.148' });

    expect(stamp.y + stamp.size).toBeLessThanOrEqual(upper.y);
  });

  // @spec PRESENT-CTRL-012
  it('grows with the viewport, like everything else drawn', () => {
    const small = versionStamp({ viewport, text: '0.1.148', scale: 1 });
    const large = versionStamp({ viewport: { width: 1600, height: 1200 }, text: '0.1.148', scale: 2 });

    expect(large.size).toBeGreaterThan(small.size);
    expect(MIN_TAP_PX).toBeGreaterThan(0);
  });
});

describe('the stamp on a drawn screen', () => {
  const phone = { width: 390, height: 844 };

  function exploring(viewport) {
    const floor = createFloor({ id: 'f1', width: 7, height: 7 });
    const state = createExploration({
      floors: [floor], floorId: 'f1', tile: { x: 3, y: 3 }, facing: Direction.NORTH,
      lightSources: [createLightSource({ id: 'l', brightRadius: 1, dimRadius: 4, remainingTicks: 99, lit: true })],
    });
    return createController({ state, viewport, onDraw: () => {} });
  }

  // @spec PRESENT-BUILD-006
  it('carries the stamp and its position on the plan, not in the drawing', () => {
    const hud = layers(exploring(phone)).find((l) => l.name === 'hud').plan;

    expect(hud.stamp.text).toBe(APP_VERSION);
    expect(Number.isFinite(hud.stamp.x)).toBe(true);
    expect(Number.isFinite(hud.stamp.y)).toBe(true);
    expect(hud.stamp.size).toBeGreaterThan(0);
  });

  // @spec PRESENT-BUILD-002
  it('keeps clear of the controls it shares the bottom of the screen with', () => {
    const hud = layers(exploring(phone)).find((l) => l.name === 'hud').plan;

    for (const control of hud.controls) {
      const overlaps =
        control.x < hud.stamp.x + hud.stamp.width
        && control.x + control.width > hud.stamp.x
        && control.y < hud.stamp.y + hud.stamp.size
        && control.y + control.height > hud.stamp.y;
      expect(overlaps).toBe(false);
    }
  });
});
