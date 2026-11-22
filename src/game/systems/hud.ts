import { EcsWorld } from '../../ecs/core';
import type { System } from '../../ecs/core';
import { DIFFICULTIES } from '../constants/difficulty';
import { playerView, players } from '../queries';
import type { Hud, HudPlayer, TeamId } from '../types';

export const toHudPlayer = (world: EcsWorld, entity: number): HudPlayer => {
  const view = playerView(world, entity);
  return {
    id: String(entity),
    number: view.tag.number,
    alive: view.condition.alive,
    human: view.tag.isHuman,
    entering: view.condition.enteringTime > 0,
  };
};

export function buildHud(world: EcsWorld): Hud {
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
