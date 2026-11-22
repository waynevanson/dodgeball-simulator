import { EcsWorld } from '../../ecs/core';
import { SHOT_CLOCK } from '../constants/rules';
import { setupFormation } from './formation';
import { applyDifficulty } from './match';

// ---------------------------------------------------------------- set resets

export function startSet(world: EcsWorld): void {
  const set = world.resource('set');
  const shot = world.resource('shot');
  const queues = world.resource('queues');
  const feedback = world.resource('feedback');
  const warnings = world.resource('warnings');
  const claims = world.resource('claims');

  set.id += 1;
  set.resolved = false;
  set.winner = null;
  set.elapsed = 0;
  set.suddenDeath = false;
  world.resource('rush').active = true;
  world.resource('lastThrow').team = null;
  shot.team = null;
  shot.clock = SHOT_CLOCK;
  shot.beep = 99;
  warnings.blue = 0;
  warnings.red = 0;
  queues.blue = [];
  queues.red = [];
  feedback.slowmo = 0;
  feedback.shake = 0;
  feedback.flash = 0;
  claims.byPlayer.clear();
  claims.balls.clear();

  setupFormation(world);
  applyDifficulty(world);
}

export function toMenu(world: EcsWorld): void {
  const set = world.resource('set');
  const shot = world.resource('shot');
  const queues = world.resource('queues');
  const feedback = world.resource('feedback');
  const warnings = world.resource('warnings');
  const claims = world.resource('claims');

  set.id = 0;
  set.resolved = true;
  set.winner = null;
  set.elapsed = 0;
  set.suddenDeath = false;
  world.resource('rush').active = false;
  world.resource('lastThrow').team = null;
  shot.team = null;
  shot.clock = SHOT_CLOCK;
  shot.beep = 99;
  warnings.blue = 0;
  warnings.red = 0;
  queues.blue = [];
  queues.red = [];
  feedback.slowmo = 0;
  feedback.shake = 0;
  feedback.flash = 0;
  claims.byPlayer.clear();
  claims.balls.clear();

  setupFormation(world);
}
