import type { World } from '../ecs';
import { BALL_RADIUS } from '../constants/pitch';
import { COURT } from '../constants/view';
import { closestApproach, norm } from '../math';
import { balls, bounds } from '../queries';
import type { BallView, PlayerView } from '../queries';

export interface Threat {
  ball: BallView;
  t: number;
  d: number;
}

/** The incoming ball most likely to ruin this player's day. */
export function findThreat(world: World, view: PlayerView): Threat | null {
  let best: Threat | null = null;
  for (const ball of balls(world)) {
    if (!ball.state.live || ball.held.by !== null || ball.state.team === view.tag.team) continue;

    const approach = closestApproach(
      view.transform.x,
      view.transform.y,
      ball.transform.x,
      ball.transform.y,
      ball.transform.vx,
      ball.transform.vy,
      0.85,
    );
    if (approach.t <= 0.04) continue;
    const clearance = view.transform.radius + BALL_RADIUS + 13;
    if (approach.d > clearance) continue;
    if (!best || approach.t < best.t) best = { ball, t: approach.t, d: approach.d };
  }
  return best;
}

/** Sidestep perpendicular to the incoming ball's path. */
export function dodgeDirection(
  world: World,
  view: PlayerView,
  ball: BallView,
): { x: number; y: number } {
  const angle = Math.atan2(ball.transform.vy, ball.transform.vx);
  const perpA = angle + Math.PI / 2;
  const perpB = angle - Math.PI / 2;
  const relX = view.transform.x - ball.transform.x;
  const relY = view.transform.y - ball.transform.y;
  const dotA = Math.cos(perpA) * relX + Math.sin(perpA) * relY;
  const perp = dotA >= 0 ? perpA : perpB;

  let dx = Math.cos(perp);
  let dy = Math.sin(perp);
  const away = norm(relX, relY);
  dx += away.x * 0.45;
  dy += away.y * 0.45;

  const area = bounds(world, view.tag.team);
  if (view.transform.x + dx * 90 < area.minX + 26) dx = Math.abs(dx) + 0.7;
  if (view.transform.x + dx * 90 > area.maxX - 26) dx = -Math.abs(dx) - 0.7;
  if (view.transform.y + dy * 90 < COURT.y + 34) dy = Math.abs(dy) + 0.7;
  if (view.transform.y + dy * 90 > COURT.bottom - 34) dy = -Math.abs(dy) - 0.7;

  const n = norm(dx, dy);
  return { x: n.x, y: n.y };
}
