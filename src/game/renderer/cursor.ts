import { Input } from '../input';
import { TAU } from '../math';
import type { Hud } from '../types';

export function drawAimCursor(ctx: CanvasRenderingContext2D, hud: Hud, input: Input): void {
  if (input.usingTouch || !input.mouse.used) return;
  if (hud.phase !== 'playing' && hud.phase !== 'countdown') return;

  const { x, y } = input.mouse;
  ctx.save();
  ctx.strokeStyle = 'rgba(232, 238, 252, 0.6)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, 8.5, 0, TAU);
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (i * TAU) / 4;
    ctx.moveTo(x + Math.cos(angle) * 11.5, y + Math.sin(angle) * 11.5);
    ctx.lineTo(x + Math.cos(angle) * 16, y + Math.sin(angle) * 16);
  }
  ctx.strokeStyle = 'rgba(232, 238, 252, 0.38)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 1.7, 0, TAU);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
  ctx.fill();
  ctx.restore();
}
