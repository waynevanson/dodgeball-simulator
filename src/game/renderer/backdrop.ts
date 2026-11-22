import { COURT, VIEW_H, VIEW_W } from '../constants/view';

// ------------------------------------------------------------------ world art
// ------------------------------------------------------------------ world art

export function drawBackdrop(ctx: CanvasRenderingContext2D, time: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#0a101d');
  g.addColorStop(0.5, '#070c15');
  g.addColorStop(1, '#04070c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const glow = ctx.createRadialGradient(
    VIEW_W / 2,
    COURT.y + 80,
    30,
    VIEW_W / 2,
    COURT.y + 80,
    820,
  );
  glow.addColorStop(0, 'rgba(91, 147, 255, 0.07)');
  glow.addColorStop(0.55, 'rgba(91, 147, 255, 0.02)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const breathe = 0.5 + Math.sin(time * 0.5) * 0.5;
  ctx.fillStyle = `rgba(255, 95, 115, ${0.02 + breathe * 0.012})`;
  ctx.fillRect(0, VIEW_H - 110, VIEW_W, 110);
}
