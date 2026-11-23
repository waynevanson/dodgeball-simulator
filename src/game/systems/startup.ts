import type { System } from '../ecs';
import { sfx } from '../audio';
import type { Input } from '../input';
import { applyDifficulty, setLineup, spawnMatch } from '../spawn';
import type { DifficultyId } from '../types';
import { createUi } from '../ui';

/** Saved settings, loaded by `main` before the startup schedule runs. */
export interface StartupSettings {
  difficulty: DifficultyId;
  muted: boolean;
  playerSlot: number;
  playerName: string;
}

/**
 * Build the world once, before any update: entities, resources, the opening
 * phase and the settings that shape the first set. Registering this instead of
 * doing the work at module scope lets the ECS own its own construction order.
 */
export function gameStartupSystem(settings: StartupSettings): System {
  return {
    name: 'game-startup',
    run({ world }) {
      spawnMatch(world);
      world.setResource('phase', { id: 'menu', elapsed: 0, resumeFrom: null });
      world.setResource('match', {
        difficulty: settings.difficulty,
        score: { blue: 0, red: 0 },
        set: 1,
        lastSetWinner: null,
        matchWinner: null,
      });
      world.setResource('flow', { pending: [] });

      sfx.muted = settings.muted;
      setLineup(world, settings.playerSlot, settings.playerName);
      applyDifficulty(world);
    },
  };
}

/**
 * Attach the DOM handles that `main` built. Kept separate from the game's own
 * startup so the world can be created without a canvas or an input device.
 */
export function presentationStartupSystem(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  input: Input,
): System {
  return {
    name: 'presentation-startup',
    run({ world }) {
      world.setResource('input', input);
      world.setResource('view', { canvas, ctx });
      world.setResource('ui', createUi());
    },
  };
}
