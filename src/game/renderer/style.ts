export const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

import { TAU } from '../math';

export function drawSpectacles(ctx: CanvasRenderingContext2D, scale = 1): void {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.fillStyle = 'rgba(191, 219, 254, 0.38)';
  ctx.strokeStyle = '#08111f';
  ctx.lineWidth = 2.1;
  for (const lensX of [-5, 5]) {
    ctx.beginPath();
    ctx.arc(lensX, 0, 4.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(-0.8, 0);
  ctx.lineTo(0.8, 0);
  ctx.moveTo(-9.2, -0.3);
  ctx.lineTo(-12.6, -2.1);
  ctx.moveTo(9.2, -0.3);
  ctx.lineTo(12.6, -2.1);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(-6.4, -1.5, 1.1, 0, TAU);
  ctx.arc(3.6, -1.5, 1.1, 0, TAU);
  ctx.fill();
  ctx.restore();
}
