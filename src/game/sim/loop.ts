import type { World } from '../ecs';
import { COURT } from '../constants/view';
import { clamp, rand } from '../math';
import { balls, bounds, players } from '../queries';
import { stepBall } from './ball';
import { resolveCollisions } from './contacts';
import { stepPlayer } from './player';

// ---------------------------------------------------------------- simulation

export function simulate(world: World, dt: number, frozen: boolean): void {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    if (!frozen) {
      for (const view of players(world)) {
        if (!view.condition.alive) continue;
        stepPlayer(world, view, sdt);
      }
      separatePlayers(world);
    }
    for (const ball of balls(world)) stepBall(world, ball, sdt);
    if (!frozen && !world.resource('set').resolved) resolveCollisions(world);
  }
}

export function separatePlayers(world: World): void {
  const list = players(world);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.condition.alive) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.condition.alive) continue;
      let dx = b.transform.x - a.transform.x;
      let dy = b.transform.y - a.transform.y;
      let d = Math.hypot(dx, dy);
      const min = a.transform.radius + b.transform.radius;
      if (d >= min) continue;
      if (d < 0.001) {
        dx = rand(-1, 1);
        dy = rand(-1, 1);
        d = Math.hypot(dx, dy) || 1;
      }
      const push = (min - d) * 0.5;
      const ux = dx / d;
      const uy = dy / d;
      a.transform.x -= ux * push;
      a.transform.y -= uy * push;
      b.transform.x += ux * push;
      b.transform.y += uy * push;
    }
  }

  for (const player of list) {
    if (!player.condition.alive) continue;
    const area = bounds(world, player.tag.team);
    player.transform.x = clamp(
      player.transform.x,
      area.minX + player.transform.radius,
      area.maxX - player.transform.radius,
    );
    player.transform.y = clamp(
      player.transform.y,
      COURT.y + player.transform.radius,
      COURT.bottom - player.transform.radius,
    );
  }
}
