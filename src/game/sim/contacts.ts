import { EcsWorld } from '../../ecs/core';
import { sfx } from '../audio';
import { PHYS } from '../constants/physics';
import { NEAR_MISS } from '../constants/pitch';
import { TEAMS } from '../constants/teams';
import { addFloater } from '../effects/floaters';
import { dropGlasses } from '../effects/glasses';
import { burst, ring } from '../effects/particles';
import { dist, rand } from '../math';
import { balls, isOpponentSide, playerView, players } from '../queries';
import type { BallView, PlayerView } from '../queries';
import { landBall } from './ball';
import { eliminate, reenter } from './out';
import { doPickup } from './throwing';

// ------------------------------------------------------------------ contacts

export function resolveCollisions(world: EcsWorld): void {
  if (world.resource('set').resolved) return;

  for (const ball of balls(world)) {
    if (ball.held.by !== null) continue;
    if (ball.state.live) checkAttempt(world, ball);

    for (const player of players(world)) {
      if (!player.condition.alive || player.condition.enteringTime > 0) continue;
      if (ball.state.ignore === player.entity && ball.state.ignoreTime > 0) continue;

      const rr = player.transform.radius + ball.transform.radius;
      const dx = ball.transform.x - player.transform.x;
      const dy = ball.transform.y - player.transform.y;
      if (dx * dx + dy * dy > rr * rr) continue;

      if (ball.state.live) {
        if (ball.state.team === player.tag.team) continue;
        if (player.cooldowns.catchWindow > 0) doCatch(world, player, ball);
        else if (ball.state.canOut) doHit(world, player, ball);
        if (world.resource('set').resolved) return;
      } else if (
        player.carry.ball === null &&
        ball.state.pickupCd <= 0 &&
        player.cooldowns.pickupCd <= 0
      ) {
        // Rule 13.6.1: during the rush you may only take your own three.
        if (
          world.resource('rush').active &&
          ball.state.rush &&
          isOpponentSide(player.tag.team, ball.transform.x)
        ) {
          continue;
        }
        doPickup(world, player, ball);
      }
    }
  }
}

/**
 * Rule 16.1: a valid attempt lands or passes within a metre of an opponent,
 * or of where an opponent stood when the ball was released.
 */
export function checkAttempt(world: EcsWorld, ball: BallView): void {
  if (!ball.state.live || ball.state.validAttempt) return;
  for (const pos of ball.state.releasePositions) {
    if (dist(ball.transform.x, ball.transform.y, pos.x, pos.y) < NEAR_MISS) {
      ball.state.validAttempt = true;
      return;
    }
  }
  for (const player of players(world)) {
    if (!player.condition.alive || player.tag.team === ball.state.throwerTeam) continue;
    if (
      dist(ball.transform.x, ball.transform.y, player.transform.x, player.transform.y) < NEAR_MISS
    ) {
      ball.state.validAttempt = true;
      return;
    }
  }
}

export function doHit(world: EcsWorld, player: PlayerView, ball: BallView): void {
  const color = ball.state.team ? TEAMS[ball.state.team].main : '#fbbf24';
  ball.state.validAttempt = true;
  landBall(world, ball);
  ball.state.pickupCd = 0.3;

  if (ball.state.thrower !== null) {
    const stats = world.get(ball.state.thrower, 'stats');
    if (stats) stats.outs += 1;
  }

  burst(world, player.transform.x, player.transform.y, color, 18, 1.15, 'spark');
  ring(world, player.transform.x, player.transform.y, color, 24);
  const feedback = world.resource('feedback');
  feedback.shake = Math.max(feedback.shake, 10);
  feedback.flash = Math.max(feedback.flash, 0.2);

  if (player.condition.hasGlasses) {
    player.condition.hasGlasses = false;
    dropGlasses(world, player);
    addFloater(world, player.transform.x, player.transform.y - 62, 'HEADSHOT!', '#ffe9a8', 1.9, 34);
    addFloater(world, player.transform.x, player.transform.y - 30, 'GLASSES OFF', '#e2e8f0', 1.5, 17);
    feedback.shake = Math.max(feedback.shake, 15);
    feedback.flash = Math.max(feedback.flash, 0.34);
    sfx.headshot();
  } else {
    sfx.hit();
  }

  eliminate(world, player, 'hit');
}

export function doCatch(world: EcsWorld, player: PlayerView, ball: BallView): void {
  player.cooldowns.catchWindow = 0;

  // Rule 21: a ball in hand is a shield, not a free catch.
  if (player.carry.ball !== null) {
    if (world.resource('set').suddenDeath) return; // Rule 9.7.1: no blocking in sudden death
    doBlock(world, player, ball);
    return;
  }

  const thrower = ball.state.thrower;
  const palette = ball.state.team ? TEAMS[ball.state.team] : TEAMS[player.tag.team];

  ball.state.live = false;
  ball.state.team = player.tag.team;
  ball.state.thrower = null;
  ball.state.throwerTeam = null;
  ball.transform.vx = 0;
  ball.transform.vy = 0;
  ball.trail.points = [];
  ball.held.by = player.entity;
  ball.state.armed = true;
  ball.state.rush = false;
  ball.state.canOut = true;
  ball.state.validAttempt = true;
  player.carry.ball = ball.entity;
  player.stats.catches += 1;

  burst(world, player.transform.x, player.transform.y, palette.light, 18, 1.1, 'spark');
  ring(world, player.transform.x, player.transform.y, palette.light, 26);
  addFloater(world, player.transform.x, player.transform.y - 40, 'CAUGHT!', palette.light, 1.2);
  const feedback = world.resource('feedback');
  feedback.shake = Math.max(feedback.shake, 7);
  feedback.flash = Math.max(feedback.flash, 0.16);
  sfx.catchBall();

  // Rule 23.1: the thrower is out. Rule 23.4: a queued teammate re-enters.
  if (thrower !== null) {
    const throwerView = playerView(world, thrower);
    if (throwerView.condition.alive) {
      addFloater(
        world,
        throwerView.transform.x,
        throwerView.transform.y - 36,
        'OUT',
        TEAMS[throwerView.tag.team].light,
        1.1,
      );
      eliminate(world, throwerView, 'caught');
      if (!world.resource('set').resolved) reenter(world, player.tag.team);
    }
  }
}

/** Rule 21.2: a blocked ball remains live. */
export function doBlock(world: EcsWorld, player: PlayerView, ball: BallView): void {
  player.cooldowns.catchWindow = 0;
  const angle = Math.atan2(ball.transform.vy, ball.transform.vx) + Math.PI + rand(-0.55, 0.55);
  const speed = Math.max(
    PHYS.blockMinSpeed,
    Math.hypot(ball.transform.vx, ball.transform.vy) * PHYS.blockRetain,
  );
  ball.transform.vx = Math.cos(angle) * speed;
  ball.transform.vy = Math.sin(angle) * speed;
  ball.state.ignore = player.entity;
  ball.state.ignoreTime = 0.26;
  ball.state.validAttempt = true;
  ball.state.pickupCd = 0.2;

  burst(world, player.transform.x, player.transform.y, '#dbeafe', 9, 0.8, 'spark');
  ring(world, player.transform.x, player.transform.y, '#dbeafe', 18);
  addFloater(world, player.transform.x, player.transform.y - 38, 'BLOCK', '#dbeafe', 0.9);
  const feedback = world.resource('feedback');
  feedback.shake = Math.max(feedback.shake, 4);
  sfx.block();
}
