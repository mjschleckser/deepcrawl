/**
 * How big the game actually is.
 *
 * The visible viewport, not the layout one. On a phone browser the layout viewport is
 * the height the page would have with the address bar hidden, so anything sized to it
 * puts its bottom edge behind the chrome. Installed as an app the two agree, which is
 * precisely how the fault hides from anyone testing only the installed version.
 */

/**
 * @spec PRESENT-SCENE-008
 */
export function visibleViewport(win) {
  // The browser's own report of what it is actually showing, when it offers one.
  const visual = win.visualViewport;
  if (visual && visual.width > 0 && visual.height > 0) {
    return { width: Math.round(visual.width), height: Math.round(visual.height) };
  }
  return { width: win.innerWidth, height: win.innerHeight };
}

/**
 * Screen the player can see but the game cannot have: a notch, a home indicator, a
 * rounded corner.
 *
 * @spec PRESENT-SCENE-008
 */
export function safeAreaInsets(computedStyle) {
  const read = (name) => {
    const raw = computedStyle?.getPropertyValue?.(name) ?? '';
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  };
  return {
    top: read('--safe-top'),
    right: read('--safe-right'),
    bottom: read('--safe-bottom'),
    left: read('--safe-left'),
  };
}

/**
 * The area the game may draw in: what can be seen, less what it may not have.
 *
 * @spec PRESENT-SCENE-008
 */
export function playableViewport(win, computedStyle) {
  const visible = visibleViewport(win);
  const safe = safeAreaInsets(computedStyle);
  return {
    width: Math.max(1, visible.width - safe.left - safe.right),
    height: Math.max(1, visible.height - safe.top - safe.bottom),
  };
}
