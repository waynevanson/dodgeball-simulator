import type { System } from '../../ecs/core';
import { sfx } from '../audio';
import { COUNTDOWN_SECONDS } from '../constants/rules';

/** Count-in beeps are driven by the same clock that draws the numbers. */
export function countdownAudioSystem(): System {
  let lastNumber = 99;

  return {
    name: 'countdown-audio',
    run({ world }) {
      const phase = world.resource('phase');
      if (phase.id !== 'countdown') {
        lastNumber = 99;
        return;
      }

      const number = Math.ceil(COUNTDOWN_SECONDS - phase.elapsed);
      if (number === lastNumber || number < 1 || number > 3) return;
      lastNumber = number;
      sfx.beep(number === 1);
    },
  };
}
