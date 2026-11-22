import { EcsWorld } from '../../ecs/core';
import { buildAIIntent } from '../ai';
import { Input } from '../input';
import { angleTo, dist } from '../math';
import { balls, halves, players } from '../queries';
import type { BallView, PlayerView } from '../queries';
import type { Intent } from '../types';

/**
 * The simulation, as plain functions over ECS state. `simulate` runs at a fixed
 * substep; everything else is called from it or from the frame systems in
 * `systems.ts`.
 */

// ------------------------------------------------------------------- intents

export function buildIntents(world: EcsWorld, input: Input, dt: number): void {
  assignClaims(world);
  for (const view of players(world)) {
    if (!view.condition.alive) continue;
    const intent = view.tag.isHuman
      ? humanIntent(world, view, input)
      : buildAIIntent(world, view, dt);
    Object.assign(view.intent, intent);
  }
}

/** Nearest eligible ball per player, rebuilt every frame for the AI. */
export function assignClaims(world: EcsWorld): void {
  const claims = world.resource('claims');
  claims.byPlayer.clear();
  claims.balls.clear();

  const seekers = players(world).filter(
    (view) => view.condition.alive && view.carry.ball === null && !view.tag.isHuman,
  );
  const free = balls(world).filter((ball) => ball.held.by === null && !ball.state.live);
  if (!seekers.length || !free.length) return;

  const pairs: Array<{ player: PlayerView; ball: BallView; cost: number }> = [];
  for (const player of seekers) {
    const area = halves(player.tag.team);
    for (const ball of free) {
      if (ball.transform.x < area.minX - 6 || ball.transform.x > area.maxX + 6) continue;
      let cost = dist(
        player.transform.x,
        player.transform.y,
        ball.transform.x,
        ball.transform.y,
      );
      if (player.brain.seek === ball.entity) cost -= 70;
      pairs.push({ player, ball, cost });
    }
  }

  pairs.sort((a, b) => a.cost - b.cost);
  for (const { player, ball } of pairs) {
    if (claims.byPlayer.has(player.entity) || claims.balls.has(ball.entity)) continue;
    claims.byPlayer.set(player.entity, ball.entity);
    claims.balls.add(ball.entity);
    player.brain.seek = ball.entity;
  }
}

export function humanIntent(world: EcsWorld, view: PlayerView, input: Input): Intent {
  const intent: Intent = {
    mx: 0,
    my: 0,
    aim: view.transform.facing,
    charge: false,
    release: false,
    dash: false,
    catch: false,
  };
  if (!view.condition.alive) return intent;

  if (input.usingTouch) {
    intent.mx = input.touch.mx;
    intent.my = input.touch.my;
    intent.aim = autoAim(world, view);
    intent.charge = input.touch.throwDown;
    intent.release = !input.touch.throwDown;
    if (input.takeTouchAction('dash')) intent.dash = true;
    if (input.takeTouchAction('catch')) intent.catch = true;
    return intent;
  }

  let mx = 0;
  let my = 0;
  if (input.isDown('KeyD', 'ArrowRight')) mx += 1;
  if (input.isDown('KeyA', 'ArrowLeft')) mx -= 1;
  if (input.isDown('KeyS', 'ArrowDown')) my += 1;
  if (input.isDown('KeyW', 'ArrowUp')) my -= 1;
  intent.mx = mx;
  intent.my = my;

  intent.aim = input.mouse.used
    ? Math.atan2(input.mouse.y - view.transform.y, input.mouse.x - view.transform.x)
    : view.transform.facing;
  intent.charge = input.mouse.left;
  intent.release = !input.mouse.left;
  intent.dash = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
  intent.catch = input.pressed('Space') || input.pressed('KeyE') || input.mouse.rightPressed;
  return intent;
}

export function autoAim(world: EcsWorld, view: PlayerView): number {
  let best: PlayerView | null = null;
  let bestDistance = Infinity;
  for (const other of players(world)) {
    if (!other.condition.alive || other.tag.team === view.tag.team) continue;
    const d = dist(view.transform.x, view.transform.y, other.transform.x, other.transform.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = other;
    }
  }
  if (!best) return view.transform.facing;
  const flight = bestDistance / 1150;
  return angleTo(
    view.transform.x,
    view.transform.y,
    best.transform.x + best.transform.vx * flight * 0.85,
    best.transform.y + best.transform.vy * flight * 0.85,
  );
}
