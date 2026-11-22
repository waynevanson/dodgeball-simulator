import { TEAMS } from '../constants/teams';
import { COURT } from '../constants/view';
import { TAU } from '../math';
import type { Hud } from '../types';
import { FONT, MONO } from './style';

export function drawQueues(ctx: CanvasRenderingContext2D, hud: Hud, time: number): void {
  for (const team of ['blue', 'red'] as const) {
    const queue = hud.outQueue[team];
    if (!queue.length) continue;
    const palette = TEAMS[team];
    const x = team === 'blue' ? COURT.x - 22 : COURT.right + 22;
    const dir = team === 'blue' ? -1 : 1;

    ctx.save();
    ctx.font = `800 7px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.fillText('QUEUE', x + dir * 2, COURT.cy - 76);

    queue.forEach((player, index) => {
      const y = COURT.cy - 44 + index * (hud.compact ? 48 : 42);
      const next = index === 0;
      ctx.beginPath();
      ctx.arc(x, y, hud.compact ? 15 : 12, 0, TAU);
      ctx.fillStyle = 'rgba(9, 13, 22, 0.9)';
      ctx.fill();
      ctx.strokeStyle = next ? palette.light : 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = next ? 2 : 1.5;
      if (next) {
        const pulse = 0.4 + Math.sin(time * 3.4) * 0.2;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.stroke();
      }
      ctx.font = `800 ${hud.compact ? 11 : 9}px ${FONT}`;
      ctx.fillStyle = next ? palette.light : 'rgba(148, 163, 184, 0.55)';
      ctx.fillText(String(player.number), x, y + 0.5);
    });

    // Re-entry arrow for the next player in.
    if (queue.length) {
      const y = COURT.cy - 44;
      ctx.beginPath();
      ctx.moveTo(x + dir * 14, y);
      ctx.lineTo(x + dir * 20, y);
      ctx.strokeStyle = palette.main;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}
