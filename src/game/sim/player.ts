import { EcsWorld } from '../../ecs/core';
import { sfx } from '../audio';
import { PHYS } from '../constants/physics';
import { COURT } from '../constants/view';
import { onDash } from '../effects/feedback';
import { norm } from '../math';
import { bounds } from '../queries';
import type { PlayerView } from '../queries';
import { throwBall } from './throwing';

export function stepPlayer(world: EcsWorld, view: PlayerView, dt: number): void {
  const P = PHYS;
  const { transform, action, cooldowns, condition, intent } = view;

  condition.enteringTime = Math.max(0, condition.enteringTime - dt);
  action.dashCd = Math.max(0, action.dashCd - dt);
  cooldowns.throwCd = Math.max(0, cooldowns.throwCd - dt);
  cooldowns.catchCd = Math.max(0, cooldowns.catchCd - dt);
  cooldowns.catchWindow = Math.max(0, cooldowns.catchWindow - dt);
  cooldowns.pickupCd = Math.max(0, cooldowns.pickupCd - dt);
  condition.hitFlash = Math.max(0, condition.hitFlash - dt * 3);

  const canPlay = condition.enteringTime <= 0;

  if (Number.isFinite(intent.aim)) transform.facing = intent.aim;
  if (intent.catch && canPlay) startCatch(view);

  const direction = norm(intent.mx, intent.my);
  const moving = direction.l > 0.06;

  if (intent.dash && canPlay && action.dashCd <= 0) {
    action.dashCd = P.dashCd;
    action.dashTime = P.dashTime;
    action.dashX = moving ? direction.x : Math.cos(transform.facing);
    action.dashY = moving ? direction.y : Math.sin(transform.facing);
    onDash(world, view);
  }

  // --- charge / throw
  if (canPlay && action.charging && intent.release && view.carry.ball !== null) {
    throwBall(world, view);
  } else if (canPlay && intent.charge && view.carry.ball !== null) {
    action.charging = true;
    action.charge = Math.min(1, action.charge + dt / P.chargeTime);
  } else if (action.charging) {
    action.charging = false;
    action.charge = 0;
  }

  // --- movement
  const slow = (action.charging ? 0.68 : 1) * (cooldowns.catchWindow > 0 ? 0.6 : 1);
  if (action.dashTime > 0) {
    action.dashTime = Math.max(0, action.dashTime - dt);
    const k = action.dashTime / P.dashTime;
    const mul = 0.35 + 0.65 * k;
    transform.vx = action.dashX * P.dashSpeed * mul;
    transform.vy = action.dashY * P.dashSpeed * mul;
    view.trail.points.push({ x: transform.x, y: transform.y, a: 0.8 });
    if (view.trail.points.length > 12) view.trail.points.shift();
  } else {
    const maxV = P.speed * speedMultiplier(view) * slow;
    transform.vx = damp(transform.vx, direction.x * maxV, 15, dt);
    transform.vy = damp(transform.vy, direction.y * maxV, 15, dt);
  }

  for (const t of view.trail.points) t.a -= dt * 3.5;
  if (view.trail.points.length) {
    view.trail.points = view.trail.points.filter((t) => t.a > 0);
  }

  transform.x += transform.vx * dt;
  transform.y += transform.vy * dt;

  // --- stay in your own half (with a little leeway during the opening rush)
  const area = bounds(world, view.tag.team);
  const r = transform.radius;
  if (transform.x < area.minX + r) {
    transform.x = area.minX + r;
    if (transform.vx < 0) transform.vx = 0;
  } else if (transform.x > area.maxX - r) {
    transform.x = area.maxX - r;
    if (transform.vx > 0) transform.vx = 0;
  }
  if (transform.y < COURT.y + r) {
    transform.y = COURT.y + r;
    if (transform.vy < 0) transform.vy = 0;
  } else if (transform.y > COURT.bottom - r) {
    transform.y = COURT.bottom - r;
    if (transform.vy > 0) transform.vy = 0;
  }
}

export function speedMultiplier(view: PlayerView): number {
  if (view.tag.isHuman) return 1;
  return view.brain.diff ? view.brain.diff.speed : 1;
}

export function startCatch(view: PlayerView): void {
  const { cooldowns, condition } = view;
  if (cooldowns.catchCd > 0 || cooldowns.catchWindow > 0 || condition.enteringTime > 0) return;
  cooldowns.catchWindow = PHYS.catchWindow;
  cooldowns.catchCd = PHYS.catchCd;
  sfx.catchStart();
}

export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
