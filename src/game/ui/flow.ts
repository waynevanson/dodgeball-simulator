import { EcsWorld } from '../../ecs/core';
import type { System } from '../../ecs/core';
import { PLAYER_NAME_MAX } from '../constants/roster';
import { setLineup } from '../spawn/match';
import { act } from './actions';
import { hit } from './hit';
import { STICK } from './state';
import type { UiState } from './state';

// --------------------------------------------------------------------- input

export function commitName(world: EcsWorld, ui: UiState): void {
  if (!ui.editingName) return;
  ui.editingName = false;
  const lineup = world.resource('lineup');
  setLineup(world, lineup.humanSlot, ui.draft);
  ui.dirty = true;
}

export function uiSystem(): System {
  return {
    name: 'ui-input',
    run({ world }) {
      const input = world.resource('input');
      const ui = world.resource('ui');

      // Text entry is exclusive: while typing a name, keys are not shortcuts.
      if (ui.editingName) {
        for (const char of input.typed) {
          if (ui.draft.length < PLAYER_NAME_MAX) ui.draft += char;
        }
        if (input.pressed('Backspace')) ui.draft = ui.draft.slice(0, -1);
        if (input.pressed('Enter') || input.pressed('Escape')) commitName(world, ui);
      }

      ui.hover = null;
      if (!input.usingTouch && input.mouse.used) {
        ui.hover = hit(world, ui, input.mouse.x, input.mouse.y)?.id ?? null;
      }

      for (const sample of input.pointerDowns) {
        if (sample.button !== 0) continue;
        const spot = hit(world, ui, sample.x, sample.y);
        if (!spot) {
          commitName(world, ui);
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

        act(world, ui, spot.id);
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
    },
  };
}
