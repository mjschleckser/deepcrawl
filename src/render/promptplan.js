/**
 * The prompt a pending confirmation draws, and the two controls that answer it.
 *
 * Pure placement, like the other plans. The labels name what happens rather than the
 * key that triggers it: "[Enter] Descend" tells a player holding a phone to press a
 * key they do not have.
 */

import { MIN_TAP_PX, ControlKind } from './geometry.js';

const PROMPTS = {
  STAIRS: { text: 'A staircase leads down.', confirm: 'Descend', decline: 'Stay' },
};

const DEFAULT_PROMPT = { text: 'Are you sure?', confirm: 'Yes', decline: 'No' };

/**
 * @spec PRESENT-PROMPT-001
 * @spec PRESENT-PROMPT-002
 * @spec PRESENT-PROMPT-005
 * @spec PRESENT-CTRL-002
 * @spec PRESENT-CTRL-003
 * @spec PRESENT-CTRL-004
 */
export function buildPromptPlan(pending, viewport) {
  if (!pending) return null;

  const wording = PROMPTS[pending.kind] ?? DEFAULT_PROMPT;
  const width = Math.min(viewport.width * 0.88, 440);
  const height = 150;
  const x = (viewport.width - width) / 2;
  const y = viewport.height - height - viewport.height * 0.1;

  const gap = 12;
  const buttonWidth = Math.max(MIN_TAP_PX, (width - gap * 3) / 2);
  const buttonHeight = Math.max(MIN_TAP_PX, 52);
  const buttonY = y + height - buttonHeight - gap;

  return {
    kind: pending.kind,
    text: wording.text,
    bounds: { x, y, width, height },
    controls: [
      {
        kind: ControlKind.BUTTON, role: 'CONFIRM', accepted: true, label: wording.confirm, hint: 'Enter',
        x: x + gap, y: buttonY, width: buttonWidth, height: buttonHeight,
      },
      {
        kind: ControlKind.BUTTON, role: 'DECLINE', accepted: false, label: wording.decline, hint: 'Esc',
        x: x + gap * 2 + buttonWidth, y: buttonY, width: buttonWidth, height: buttonHeight,
      },
    ],
  };
}
