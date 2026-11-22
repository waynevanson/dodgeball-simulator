import type { EcsWorld, System } from '../ecs/core';
import { sfx } from './audio';
import {
  COUNTDOWN_SECONDS,
  DIFFICULTIES,
  SUDDEN_DEATH_AFTER,
  VIEW_H,
  VIEW_W,
} from './constants';
import { celebrate, punch, updateEffects } from './effects';
import { players, playerView } from './queries';
import { render } from './renderer';
import {
  buildIntents,
  enterSuddenDeath,
  simulate,
  updateArming,
  updateRush,
  updateShotClock,
} from './sim';
import { drawUi } from './ui';
import type { Hud, HudPlayer, Phase, TeamId } from './types';

/**
 * The frame, as an ordered schedule:
 *
 *   ui-input -> match-flow -> phase-effects -> simulation -> countdown-audio
 *            -> hud -> render -> input-frame
 *
 * Flow owns match state; phase-effects maps a phase change onto the canvas UI
 * and the audio; simulation advances the world; the rest reads and draws it.
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

const toHudPlayer = (world: EcsWorld, entity: number): HudPlayer => {
  const view = playerView(world, entity);
  return {
    id: String(entity),
    number: view.tag.number,
    alive: view.condition.alive,
    human: view.tag.isHuman,
    entering: view.condition.enteringTime > 0,
  };
};

function buildHud(world: EcsWorld): Hud {
  const phase = world.resource('phase');
  const match = world.resource('match');
  const input = world.resource('input');
  const set = world.resource('set');
  const shot = world.resource('shot');
  const rush = world.resource('rush');
  const queues = world.resource('queues');

  const roster: Record<TeamId, HudPlayer[]> = { blue: [], red: [] };
  for (const view of players(world)) {
    roster[view.tag.team].push({
      id: String(view.entity),
      number: view.tag.number,
      alive: view.condition.alive,
      human: view.tag.isHuman,
      entering: view.condition.enteringTime > 0,
    });
  }

  return {
    phase: phase.id,
    phaseElapsed: phase.elapsed,
    score: match.score,
    set: match.set,
    difficulty: DIFFICULTIES[match.difficulty],
    lastSetWinner: match.lastSetWinner,
    matchWinner: match.matchWinner,
    roster,
    outQueue: {
      blue: queues.blue.map((entity) => toHudPlayer(world, entity)),
      red: queues.red.map((entity) => toHudPlayer(world, entity)),
    },
    shot: { team: shot.team, timeLeft: shot.clock },
    suddenDeath: set.suddenDeath,
    rushActive: rush.active,
    setElapsed: set.elapsed,
    compact: input.usingTouch || window.innerWidth < 980,
  };
}

export function hudSystem(): System {
  return {
    name: 'hud',
    run({ world }) {
      world.setResource('hud', buildHud(world));
    },
  };
}

export function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(2, Math.round(rect.width * dpr));
  const height = Math.max(2, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

export function renderSystem(): System {
  return {
    name: 'render',
    run({ world, now }) {
      const { canvas, ctx } = world.resource('view');
      resizeCanvas(canvas);
      ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
      render(ctx, world, world.resource('hud'), world.resource('input'), now);
      drawUi(ctx, world);
      canvas.style.cursor = world.resource('ui').hover ? 'pointer' : 'crosshair';
    },
  };
}

/** Consume one-shot input edges after every system that reads input. */
export function inputFrameSystem(): System {
  return {
    name: 'input-frame',
    run({ world }) {
      world.resource('input').endFrame();
    },
  };
}
