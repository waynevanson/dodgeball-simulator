import type { World } from '../ecs';
import { TAU } from '../math';
import { balls } from '../queries';
import type { BallView } from '../queries';
import { drawSpectacles } from './style';

export function drawFallenGlasses(ctx: CanvasRenderingContext2D, world: World): void {
  for (const entity of world.query('glasses')) {
    const transform = world.get(entity, 'transform')!;
    const glasses = world.get(entity, 'glasses')!;
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.rotate(glasses.rot);

    ctx.beginPath();
    ctx.ellipse(1.5, 4.5, 13, 5, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();

    drawSpectacles(ctx, 1.25);
    ctx.restore();
  }
}

export function drawBallShape(ctx: CanvasRenderingContext2D, ball: BallView): void {
  const { transform: body, state, tag, held } = ball;
  const r = body.radius;

  ctx.beginPath();
  ctx.ellipse(body.x + 2, body.y + r * 0.62, r * 0.95, r * 0.5, 0, 0, TAU);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.fill();

  // Only a live, armed ball can eliminate anyone: that is the one that glows
  // hot. Everything else (dead balls on the floor and inactive throws) is
  // rendered cold so it reads as safe to pick up.
  const dangerous = state.live && state.canOut;
  const warm = dangerous || (held.by !== null && state.armed);
  if (dangerous) {
    ctx.save();
    ctx.shadowColor = 'rgba(251, 191, 36, 0.8)';
    ctx.shadowBlur = 18;
  }

  const g = ctx.createRadialGradient(
    body.x - r * 0.36,
    body.y - r * 0.42,
    r * 0.12,
    body.x,
    body.y,
    r * 1.15,
  );
  if (warm) {
    g.addColorStop(0, '#fff6cf');
    g.addColorStop(0.42, '#fbbf24');
    g.addColorStop(1, '#b96c08');
  } else {
    g.addColorStop(0, '#f8fafc');
    g.addColorStop(0.45, '#94a3b8');
    g.addColorStop(1, '#3f4c60');
  }
  ctx.beginPath();
  ctx.arc(body.x, body.y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  if (dangerous) ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(body.x, body.y, r, 0, TAU);
  ctx.clip();
  ctx.translate(body.x, body.y);
  ctx.rotate(tag.spin);
  ctx.fillStyle = warm ? 'rgba(40, 26, 6, 0.5)' : 'rgba(15, 23, 42, 0.45)';
  ctx.fillRect(-r * 1.6, -r * 0.2, r * 3.2, r * 0.4);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(body.x, body.y, r, 0, TAU);
  ctx.strokeStyle = warm ? 'rgba(255, 255, 255, 0.3)' : 'rgba(226, 232, 240, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (!state.armed) {
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(body.x, body.y, r + 5, 0, TAU);
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.65)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawGroundBalls(ctx: CanvasRenderingContext2D, world: World): void {
  const clock = world.resource('clock');
  for (const ball of balls(world)) {
    if (ball.held.by !== null || ball.state.live) continue;
    // Dead balls are loot: a soft pulsing ring says "pick me up".
    const pulse = 0.5 + Math.sin(clock.sim * 2.3 + ball.tag.bob) * 0.5;
    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.arc(ball.transform.x, ball.transform.y, 16 + pulse * 3.5, 0, TAU);
    ctx.strokeStyle = `rgba(226, 232, 240, ${0.1 + pulse * 0.14})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    drawBallShape(ctx, ball);
  }
}

export function drawActiveBalls(ctx: CanvasRenderingContext2D, world: World): void {
  for (const ball of balls(world)) {
    if (ball.held.by !== null || !ball.state.live) continue;
    for (const trail of ball.trail.points) {
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, ball.transform.radius * 0.85, 0, TAU);
      ctx.fillStyle = ball.state.canOut
        ? `rgba(251, 191, 36, ${0.04 + trail.a * 0.16})`
        : `rgba(148, 163, 184, ${0.03 + trail.a * 0.1})`;
      ctx.fill();
    }
    drawBallShape(ctx, ball);
  }
  for (const ball of balls(world)) {
    if (ball.held.by !== null) drawBallShape(ctx, ball);
  }
}
