import type { System } from '../ecs';
import { sfx } from '../audio';
import { celebrate, punch } from '../effects/feedback';
import type { Phase, TeamId } from '../types';

/** Screens, whistles and visual flourishes when the phase changes. */
export function phaseEffectsSystem(): System {
  let previous: Phase | null = null;

  return {
    name: 'phase-effects',
    run({ world }) {
      const next = world.resource('phase').id;
      if (next === previous) return;
      previous = next;

      const ui = world.resource('ui');
      ui.editingName = false;
      ui.screen =
        next === 'menu'
          ? 'menu'
          : next === 'paused'
            ? 'pause'
            : next === 'matchover'
              ? 'results'
              : null;

      const match = world.resource('match');
      switch (next) {
        case 'playing':
          sfx.whistle();
          break;
        case 'setover':
          punch(world);
          if (match.lastSetWinner === 'blue') sfx.roundWin();
          else if (match.lastSetWinner === 'red') sfx.roundLose();
          else sfx.whistle();
          break;
        case 'paused':
          sfx.ui();
          break;
        case 'matchover': {
          const winner: TeamId =
            match.matchWinner ?? (match.score.blue > match.score.red ? 'blue' : 'red');
          celebrate(world, winner);
          if (winner === 'blue') sfx.matchWin();
          else sfx.matchLose();
          break;
        }
        default:
          break;
      }

    },
  };
}
