import { ATTACK_DIST, BALL_MARK_SPACING } from '../constants/pitch';
import { COURT } from '../constants/view';
import { TAU, roundRect } from '../math';
import { FONT, MONO } from './style';

export function drawCourt(ctx: CanvasRenderingContext2D, time: number): void {
  const C = COURT;

  roundRect(ctx, C.x - 4, C.y + 8, C.w + 8, C.h + 6, 28);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();

  roundRect(ctx, C.x, C.y, C.w, C.h, 24);
  const floor = ctx.createLinearGradient(C.x, C.y, C.x, C.bottom);
  floor.addColorStop(0, '#172032');
  floor.addColorStop(0.45, '#121b2c');
  floor.addColorStop(1, '#0c1421');
  ctx.fillStyle = floor;
  ctx.fill();

  ctx.save();
  roundRect(ctx, C.x, C.y, C.w, C.h, 24);
  ctx.clip();

  const blueTint = ctx.createLinearGradient(C.x, 0, C.cx, 0);
  blueTint.addColorStop(0, 'rgba(91, 147, 255, 0.11)');
  blueTint.addColorStop(1, 'rgba(91, 147, 255, 0.01)');
  ctx.fillStyle = blueTint;
  ctx.fillRect(C.x, C.y, C.w / 2, C.h);

  const redTint = ctx.createLinearGradient(C.right, 0, C.cx, 0);
  redTint.addColorStop(0, 'rgba(255, 95, 115, 0.11)');
  redTint.addColorStop(1, 'rgba(255, 95, 115, 0.01)');
  ctx.fillStyle = redTint;
  ctx.fillRect(C.cx, C.y, C.w / 2, C.h);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
  ctx.lineWidth = 1;
  for (let x = C.x + 26; x < C.right; x += 62) {
    ctx.beginPath();
    ctx.moveTo(x, C.y);
    ctx.lineTo(x, C.bottom);
    ctx.stroke();
  }
  for (let y = C.y + 26; y < C.bottom; y += 74) {
    ctx.beginPath();
    ctx.moveTo(C.x, y);
    ctx.lineTo(C.right, y);
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 156px ${FONT}`;
  ctx.fillStyle = 'rgba(91, 147, 255, 0.05)';
  ctx.fillText('BLUE', C.x + C.w * 0.25, C.cy + 8);
  ctx.fillStyle = 'rgba(255, 95, 115, 0.05)';
  ctx.fillText('RED', C.x + C.w * 0.75, C.cy + 8);

  ctx.restore();

  // --- attack lines (Rule 1.3.4 / 13.7.1)
  const attackBlue = C.cx - ATTACK_DIST;
  const attackRed = C.cx + ATTACK_DIST;
  ctx.save();
  ctx.setLineDash([9, 9]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(91, 147, 255, 0.28)';
  ctx.beginPath();
  ctx.moveTo(attackBlue, C.y + 10);
  ctx.lineTo(attackBlue, C.bottom - 10);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 95, 115, 0.28)';
  ctx.beginPath();
  ctx.moveTo(attackRed, C.y + 10);
  ctx.lineTo(attackRed, C.bottom - 10);
  ctx.stroke();
  ctx.restore();

  ctx.font = `800 9px ${MONO}`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
  ctx.textAlign = 'center';
  ctx.fillText('ATTACK', attackBlue, C.y + 24);
  ctx.fillText('ATTACK', attackRed, C.y + 24);
  ctx.fillText('BACK LINE', C.x + 46, C.bottom - 16);
  ctx.fillText('BACK LINE', C.right - 46, C.bottom - 16);

  // --- centre line + ball markings (Rule 1.3.6)
  const pulse = 0.5 + Math.sin(time * 1.6) * 0.5;
  ctx.strokeStyle = `rgba(226, 232, 240, ${0.1 + pulse * 0.05})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(C.cx, C.y + 8);
  ctx.lineTo(C.cx, C.bottom - 8);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(226, 232, 240, 0.22)';
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    const y = C.cy + i * BALL_MARK_SPACING;
    ctx.beginPath();
    ctx.moveTo(C.cx - 9, y);
    ctx.lineTo(C.cx + 9, y);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(C.cx, C.cy, 86, 0, TAU);
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.07)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // --- boundary
  roundRect(ctx, C.x, C.y, C.w, C.h, 24);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  roundRect(ctx, C.x + 6, C.y + 6, C.w - 12, C.h - 12, 19);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
