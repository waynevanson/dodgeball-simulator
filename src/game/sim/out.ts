import type { World } from '../ecs';
import { sfx } from '../audio';
import { TEAMS } from '../constants/teams';
import { addFloater } from '../effects/floaters';
import { burst, ring } from '../effects/particles';
import { carriedBall, playerView, players, resetShotClock } from '../queries';
import type { PlayerView } from '../queries';
import { reenterPlayer } from '../spawn/formation';
import type { TeamId } from '../types';
import { dropBall } from './throwing';

export function eliminate(world: World, player: PlayerView, cause: 'hit' | 'caught'): void {
  if (!player.condition.alive) return;
  const clock = world.resource('clock');
  const queues = world.resource('queues');
  const feedback = world.resource('feedback');

  player.condition.alive = false;
  player.condition.outAt = clock.sim;
  player.condition.outX = player.transform.x;
  player.condition.outY = player.transform.y;
  player.action.charging = false;
  player.action.charge = 0;
  player.cooldowns.catchWindow = 0;

  if (player.carry.ball !== null) {
    const ball = carriedBall(world, player);
    if (ball) dropBall(ball, player.transform.x, player.transform.y);
    player.carry.ball = null;
  }

  const queue = queues[player.tag.team];
  if (!queue.includes(player.entity)) queue.push(player.entity);

  const palette = TEAMS[player.tag.team];
  burst(world, player.transform.x, player.transform.y, palette.main, 20, 1.4, 'spark');
  ring(world, player.transform.x, player.transform.y, palette.light, 30);
  if (!player.tag.isHuman && !player.tag.glasses) {
    addFloater(world, player.transform.x, player.transform.y - 40, 'OUT!', palette.light, 1);
  }
  feedback.shake = Math.max(feedback.shake, cause === 'caught' ? 8 : 11);
  feedback.flash = Math.max(feedback.flash, 0.24);

  checkSetEnd(world);
}

/** Rule 25: re-entry from the queue, over the back line. */
export function reenter(world: World, team: TeamId): void {
  const queue = world.resource('queues')[team];
  const entity = queue.shift();
  if (entity === undefined) return;
  reenterPlayer(world, entity);
  const player = playerView(world, entity);
  const palette = TEAMS[team];
  burst(world, player.transform.x, player.transform.y, palette.light, 14, 0.9, 'spark');
  ring(world, player.transform.x, player.transform.y, palette.light, 22);
  addFloater(
    world,
    player.transform.x,
    player.transform.y - 36,
    `${player.tag.name.toUpperCase()} IN`,
    palette.light,
    1.2,
  );
  sfx.pickup();
}

/** Rule 29.3.2: simultaneous all-out voids the set in the Foam format. */
export function checkSetEnd(world: World): void {
  const set = world.resource('set');
  if (set.resolved) return;

  const blue = countAlive(world, 'blue');
  const red = countAlive(world, 'red');
  if (blue > 0 && red > 0) return;

  set.resolved = true;
  const winner: TeamId | null = blue === red ? null : blue > red ? 'blue' : 'red';
  set.winner = winner;
  if (winner) world.resource('lastSet').winner = winner;
  resetShotClock(world);
}

export function countAlive(world: World, team: TeamId): number {
  let alive = 0;
  for (const player of players(world)) {
    if (player.condition.alive && player.tag.team === team) alive += 1;
  }
  return alive;
}
