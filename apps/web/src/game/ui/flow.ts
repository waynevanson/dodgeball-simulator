import { PLAYER_NAME_MAX } from '../constants/roster';
import type { Frame } from '../frame';
import type { Input } from '../input';
import { act } from './actions';
import type { Commands } from './actions';
import { hit } from './hit';
import { STICK } from './state';
import type { UiState } from './state';

// --------------------------------------------------------------------- input

export function commitName(ui: UiState, commands: Commands): void {
  if (!ui.editingName) return;
  ui.editingName = false;
  commands.setName(ui.draft);
  ui.dirty = true;
}

/**
 * Canvas UI input: text entry, hover and pointer gestures. Runs before the
 * simulation tick, so a click that starts a match takes effect this frame.
 */
export function updateUi(frame: Frame, ui: UiState, input: Input, commands: Commands): void {
  // Text entry is exclusive: while typing a name, keys are not shortcuts.
  if (ui.editingName) {
    for (const char of input.typed) {
      if (ui.draft.length < PLAYER_NAME_MAX) ui.draft += char;
    }
    if (input.pressed('Backspace')) ui.draft = ui.draft.slice(0, -1);
    if (input.pressed('Enter') || input.pressed('Escape')) commitName(ui, commands);
  }

  ui.hover = null;
  if (!input.usingTouch && input.mouse.used) {
    ui.hover = hit(frame, ui, input, input.mouse.x, input.mouse.y)?.id ?? null;
  }

  for (const sample of input.pointerDowns) {
    if (sample.button !== 0) continue;
    const spot = hit(frame, ui, input, sample.x, sample.y);
    if (!spot) {
      commitName(ui, commands);
      continue;
    }

    if (spot.id === 'stick') {
      ui.stickId = sample.id;
      ui.stickCx = STICK.x;
      ui.stickCy = STICK.y;
      input.touch.mx = 0;
      input.touch.my = 0;
      continue;
    }
    if (spot.id === 'throw') {
      ui.throwId = sample.id;
      input.touch.throwDown = true;
      continue;
    }
    if (spot.id === 'dash') {
      input.addTouchAction('dash');
      continue;
    }
    if (spot.id === 'catch') {
      input.addTouchAction('catch');
      continue;
    }

    act(frame, ui, spot.id, commands, input);
  }

  for (const sample of input.pointerMoves) {
    if (ui.stickId !== sample.id) continue;
    let dx = sample.x - ui.stickCx;
    let dy = sample.y - ui.stickCy;
    const len = Math.hypot(dx, dy);
    if (len > STICK.r) {
      dx = (dx / len) * STICK.r;
      dy = (dy / len) * STICK.r;
    }
    if (Math.hypot(dx, dy) < 6) {
      input.touch.mx = 0;
      input.touch.my = 0;
    } else {
      input.touch.mx = dx / STICK.r;
      input.touch.my = dy / STICK.r;
    }
  }

  for (const sample of input.pointerUps) {
    if (ui.stickId === sample.id) {
      ui.stickId = null;
      input.touch.mx = 0;
      input.touch.my = 0;
    }
    if (ui.throwId === sample.id) {
      ui.throwId = null;
      input.touch.throwDown = false;
    }
  }
}
