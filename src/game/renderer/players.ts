import type { World } from '../ecs';
import { PHYS } from '../constants/physics';
import { TEAMS } from '../constants/teams';
import { TAU, clamp } from '../math';
import { players } from '../queries';
import { FONT } from './style';
import { drawSpectacles } from './style';

export function drawPlayers(ctx: CanvasRenderingContext2D, world: World, time: number): void {
  for (const view of players(world)) {
    const { transform: p, tag, condition, action, cooldowns } = view;
    if (!condition.alive) continue;
    const palette = TEAMS[tag.team];
    const entering = condition.enteringTime > 0;

    for (const trail of view.trail.points) {
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, p.radius * (0.5 + trail.a * 0.45), 0, TAU);
      ctx.globalAlpha = 0.05 + trail.a * 0.2;
      ctx.fillStyle = palette.main;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.ellipse(p.x + 1, p.y + p.radius * 0.8, p.radius * 0.98, p.radius * 0.46, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.fill();

    if (cooldowns.catchWindow > 0) {
      const k = 1 - cooldowns.catchWindow / PHYS.catchWindow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 7 + k * 16, 0, TAU);
      ctx.strokeStyle = `rgba(226, 232, 240, ${0.6 * (1 - k)})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.save();
    if (entering) ctx.globalAlpha = 0.55;
    ctx.translate(p.x, p.y);

    ctx.beginPath();
    ctx.arc(0, 0, p.radius + 2.5, 0, TAU);
    ctx.fillStyle = palette.deep;
    ctx.fill();

    const g = ctx.createRadialGradient(
      -p.radius * 0.35,
      -p.radius * 0.45,
      p.radius * 0.1,
      0,
      0,
      p.radius * 1.25,
    );
    g.addColorStop(0, palette.light);
    g.addColorStop(0.42, palette.main);
    g.addColorStop(1, palette.dark);
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();

    if (condition.hitFlash > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, TAU);
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.85, condition.hitFlash)})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, p.radius * 0.92, p.facing - 0.42, p.facing + 0.42);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fill();

    ctx.font = `800 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8, 14, 26, 0.62)';
    ctx.fillText(String(tag.number), 0, 1);

    if (condition.hasGlasses) {
      ctx.save();
      ctx.translate(0, -p.radius * 0.56);
      drawSpectacles(ctx, 0.82);
      ctx.restore();
    }

    ctx.restore();

    if (entering) {
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 6, 0, TAU);
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    if (action.charging) {
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        p.radius + 8,
        -Math.PI / 2,
        -Math.PI / 2 + TAU * clamp(action.charge, 0, 1),
      );
      ctx.strokeStyle = action.charge > 0.985 ? '#fff6cf' : '#fbbf24';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.stroke();

      const len = 60 + 250 * clamp(action.charge, 0, 1);
      const offset = p.radius + 11;
      ctx.save();
      ctx.setLineDash([2, 9]);
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.facing) * offset, p.y + Math.sin(p.facing) * offset);
      ctx.lineTo(
        p.x + Math.cos(p.facing) * (offset + len),
        p.y + Math.sin(p.facing) * (offset + len),
      );
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    if (tag.isHuman) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 10 + Math.sin(time * 4) * 1.6, 0, TAU);
      ctx.strokeStyle = 'rgba(232, 238, 252, 0.42)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `900 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(232, 238, 252, 0.7)';
      ctx.fillText('YOU', p.x, p.y + p.radius + 20);
    }
  }
}

export function drawEliminated(ctx: CanvasRenderingContext2D, world: World): void {
  const clock = world.resource('clock');
  for (const view of players(world)) {
    const { condition, tag } = view;
    if (condition.alive) continue;
    const palette = TEAMS[tag.team];
    const x = condition.outX;
    const y = condition.outY;
    const fade = clamp(1 - (clock.sim - condition.outAt) / 2.2, 0.25, 1);
    ctx.save();
    ctx.globalAlpha = 0.3 * fade;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = palette.main;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 6.5, y - 6.5);
    ctx.lineTo(x + 6.5, y + 6.5);
    ctx.moveTo(x + 6.5, y - 6.5);
    ctx.lineTo(x - 6.5, y + 6.5);
    ctx.stroke();
    ctx.restore();
  }
}
