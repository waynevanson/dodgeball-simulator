import type { World } from '../ecs';
import { sfx } from '../audio';
import { PHYS } from '../constants/physics';
import { COURT } from '../constants/view';
import { addFloater } from '../effects/floaters';
import type { BallView } from '../queries';

// --------------------------------------------------------------------- balls

export function stepBall(world: World, ball: BallView, dt: number): void {
  const { transform, state, tag } = ball;
  tag.age += dt;
  tag.bob += dt * 2;
  tag.spin += tag.spinV * dt;
  state.pickupCd = Math.max(0, state.pickupCd - dt);
  state.ignoreTime = Math.max(0, state.ignoreTime - dt);
  if (state.ignoreTime <= 0) state.ignore = null;

  if (ball.held.by !== null) {
    const holder = world.get(ball.held.by, 'transform');
    if (holder) {
      const offset = holder.radius + 5;
      transform.x = holder.x + Math.cos(holder.facing) * offset;
      transform.y = holder.y + Math.sin(holder.facing) * offset;
      tag.spinV = 0;
      ball.trail.points = [];
      return;
    }
    ball.held.by = null;
  }

  const preSpeed = Math.hypot(transform.vx, transform.vy);
  const drag = state.live ? PHYS.ballDrag : PHYS.ballDragFree;
  const friction = Math.exp(-drag * dt);
  transform.vx *= friction;
  transform.vy *= friction;

  transform.x += transform.vx * dt;
  transform.y += transform.vy * dt;

  if (state.live && preSpeed > 260) {
    ball.trail.points.push({ x: transform.x, y: transform.y, a: 0.9 });
    if (ball.trail.points.length > 9) ball.trail.points.shift();
  }
  for (const t of ball.trail.points) t.a -= dt * 4;
  if (ball.trail.points.length) {
    ball.trail.points = ball.trail.points.filter((t) => t.a > 0);
  }

  // --- walls are "surfaces": a live ball dies on contact (Rule 15.6)
  const C = COURT;
  const r = transform.radius;
  let hitSurface = false;

  if (transform.x < C.x + r) {
    transform.x = C.x + r;
    if (transform.vx < 0) transform.vx = -transform.vx * PHYS.wallDamp;
    transform.vy *= 0.7;
    hitSurface = true;
  } else if (transform.x > C.right - r) {
    transform.x = C.right - r;
    if (transform.vx > 0) transform.vx = -transform.vx * PHYS.wallDamp;
    transform.vy *= 0.7;
    hitSurface = true;
  }
  if (transform.y < C.y + r) {
    transform.y = C.y + r;
    if (transform.vy < 0) transform.vy = -transform.vy * PHYS.wallDamp;
    transform.vx *= 0.7;
    hitSurface = true;
  } else if (transform.y > C.bottom - r) {
    transform.y = C.bottom - r;
    if (transform.vy > 0) transform.vy = -transform.vy * PHYS.wallDamp;
    transform.vx *= 0.7;
    hitSurface = true;
  }

  const speed = Math.hypot(transform.vx, transform.vy);
  if (hitSurface) {
    if (state.live) onBallSurface(preSpeed);
    landBall(world, ball);
  } else if (state.live && speed < PHYS.ballLiveSpeed) {
    landBall(world, ball);
  }

  if (speed < 6) {
    transform.vx = 0;
    transform.vy = 0;
  }
  tag.spinV = speed * 0.012;
}

/** A live ball becomes dead on contact with any surface (Rule 15.6). */
export function landBall(world: World, ball: BallView): void {
  const wasLive = ball.state.live;
  ball.state.live = false;
  ball.state.team = null;
  ball.state.rush = false;
  ball.state.armed = true;
  // Keep the thrower reference for the attempt-validity check (Rule 16.1).
  if (wasLive) onBallLanded(world, ball);
  ball.state.thrower = null;
}

export function onBallSurface(speed: number): void {
  sfx.bounce(speed / 1300);
}

export function onBallLanded(world: World, ball: BallView): void {
  if (ball.state.validAttempt || ball.state.warningIssued || !ball.state.throwerTeam) return;
  ball.state.warningIssued = true;
  world.resource('warnings')[ball.state.throwerTeam] += 1;

  const thrower = ball.state.thrower;
  const throwerTag = thrower === null ? null : world.get(thrower, 'player');
  if (throwerTag?.isHuman) {
    addFloater(world, ball.transform.x, ball.transform.y - 22, 'NO TOUCH', '#fca5a5', 1);
  }
}
