import type { World } from '../ecs';
import { sfx } from '../audio';
import { PHYS } from '../constants/physics';
import { TEAMS } from '../constants/teams';
import { burst } from '../effects/particles';
import { clamp, rand } from '../math';
import { carriedBall, players, resetShotClock } from '../queries';
import type { BallView, PlayerView } from '../queries';
import { endRush } from './rules';

export function throwBall(world: World, view: PlayerView): void {
  const ball = carriedBall(world, view);
  if (!ball) return;

  const { transform, action, stats, cooldowns } = view;
  const power = clamp(action.charge, 0, 1);
  const speed = PHYS.throwMin + (PHYS.throwMax - PHYS.throwMin) * power;
  const cos = Math.cos(transform.facing);
  const sin = Math.sin(transform.facing);

  ball.held.by = null;
  ball.transform.x = transform.x + cos * (transform.radius + ball.transform.radius + 1);
  ball.transform.y = transform.y + sin * (transform.radius + ball.transform.radius + 1);
  ball.transform.vx = cos * speed + transform.vx * 0.25;
  ball.transform.vy = sin * speed + transform.vy * 0.25;
  ball.state.live = true;
  ball.state.team = view.tag.team;
  ball.state.thrower = view.entity;
  ball.state.throwerTeam = view.tag.team;
  ball.tag.age = 0;
  ball.state.pickupCd = 0.18;
  ball.trail.points = [];
  ball.state.canOut = ball.state.armed;
  ball.state.rush = false;
  ball.state.validAttempt = false;
  ball.state.warningIssued = false;
  ball.state.releasePositions = players(world)
    .filter((p) => p.condition.alive && p.tag.team !== view.tag.team)
    .map((p) => ({ x: p.transform.x, y: p.transform.y }));
  ball.state.ignore = null;
  ball.state.ignoreTime = 0;

  view.carry.ball = null;
  action.charge = 0;
  action.charging = false;
  cooldowns.throwCd = PHYS.throwCd;
  stats.throws += 1;

  // Any throw ends the opening rush (Rule 13.6) and resets the shot clock
  // (Rule 17.3.1).
  endRush(world);
  world.resource('lastThrow').team = view.tag.team;
  resetShotClock(world);

  burst(world, ball.transform.x, ball.transform.y, TEAMS[view.tag.team].light, 5, 0.5, 'spark');
  sfx.throwBall(power);
}

export function doPickup(world: World, view: PlayerView, ball: BallView): void {
  ball.held.by = view.entity;
  ball.state.live = false;
  ball.state.team = view.tag.team;
  ball.state.thrower = null;
  ball.state.touched = true;
  ball.state.armed = !ball.state.rush;
  ball.state.canOut = true;
  ball.state.throwerTeam = null;
  ball.state.validAttempt = false;
  ball.state.warningIssued = false;
  ball.transform.vx = 0;
  ball.transform.vy = 0;
  ball.trail.points = [];
  view.carry.ball = ball.entity;
  view.action.charging = false;
  view.action.charge = 0;
  burst(world, ball.transform.x, ball.transform.y, '#fcd34d', 5, 0.4, 'spark');
  sfx.pickup();
}

export function dropBall(ball: BallView, x: number, y: number): void {
  ball.held.by = null;
  ball.state.live = false;
  ball.state.team = null;
  ball.state.thrower = null;
  ball.state.throwerTeam = null;
  ball.transform.x = x;
  ball.transform.y = y;
  ball.transform.vx = rand(-90, 90);
  ball.transform.vy = rand(-90, 90);
  ball.state.pickupCd = 0.4;
  ball.state.armed = true;
  ball.state.rush = false;
}
