import type { System } from '../ecs';
import { SUDDEN_DEATH_AFTER } from '../constants/rules';
import { updateEffects } from '../effects/update';
import { buildIntents } from '../sim/intents';
import { simulate } from '../sim/loop';
import { enterSuddenDeath, updateArming, updateRush, updateShotClock } from '../sim/rules';

/**
 * The update schedule, in order:
 *
 *   ui-input -> match-flow -> phase-effects -> simulation -> countdown-audio
 *            -> hud -> render -> input-frame
 *
 * Startup has already built the world; flow owns match state; phase-effects
 * maps a phase change onto the canvas UI and the audio; simulation advances the
 * world; the rest reads and draws it.
 */

export function simulationSystem(): System {
  return {
    name: 'simulation',
    run({ world, dt }) {
      const phase = world.resource('phase').id;
      if (phase === 'paused') return;

      const clock = world.resource('clock');
      const feedback = world.resource('feedback');
      const set = world.resource('set');

      const step = Math.min(dt, 0.05);
      clock.sim += step;
      feedback.shake = Math.max(0, feedback.shake - step * 34);
      feedback.flash = Math.max(0, feedback.flash - step * 2.6);

      let simDt = step;
      if (feedback.slowmo > 0) {
        feedback.slowmo = Math.max(0, feedback.slowmo - step);
        simDt = step * 0.36;
      }

      switch (phase) {
        case 'menu':
        case 'countdown':
          simulate(world, simDt, true);
          break;

        case 'playing': {
          set.elapsed += step;
          if (!set.suddenDeath && set.elapsed >= SUDDEN_DEATH_AFTER) enterSuddenDeath(world);
          buildIntents(world, world.resource('input'), step);
          simulate(world, simDt, false);
          if (!set.resolved) {
            updateArming(world);
            updateRush(world);
            updateShotClock(world, step);
          }
          break;
        }

        default:
          simulate(world, simDt, true);
          break;
      }

      updateEffects(world, step);
    },
  };
}
