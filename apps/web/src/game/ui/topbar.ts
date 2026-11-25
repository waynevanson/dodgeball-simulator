import { sfx } from '../audio';
import { TAU } from '../math';
import { topLayout } from './hit';
import { INK } from './state';
import type { UiState } from './state';

export function drawTopBar(ctx: CanvasRenderingContext2D, ui: UiState): void {
  for (const spot of topLayout()) {
    if (spot.id === 'pause') continue;
    const cx = spot.rect.x + spot.rect.w / 2;
    const cy = spot.rect.y + spot.rect.h / 2;
    const hot = ui.hover === spot.id;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, TAU);
    ctx.fillStyle = hot ? 'rgba(148, 163, 184, 0.24)' : 'rgba(5, 9, 16, 0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = hot ? INK : 'rgba(226, 232, 240, 0.75)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';

    if (spot.id === 'pause') {
      ctx.fillRect(cx - 3.5, cy - 5.5, 2.4, 11);
      ctx.fillRect(cx + 1.1, cy - 5.5, 2.4, 11);
    } else if (spot.id === 'fullscreen') {
      const d = 5;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d + 2);
      ctx.lineTo(cx - d, cy - d);
      ctx.lineTo(cx - d + 2, cy - d);
      ctx.moveTo(cx + d - 2, cy - d);
      ctx.lineTo(cx + d, cy - d);
      ctx.lineTo(cx + d, cy - d + 2);
      ctx.moveTo(cx - d, cy + d - 2);
      ctx.lineTo(cx - d, cy + d);
      ctx.lineTo(cx - d + 2, cy + d);
      ctx.moveTo(cx + d - 2, cy + d);
      ctx.lineTo(cx + d, cy + d);
      ctx.lineTo(cx + d, cy + d - 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 2.5);
      ctx.lineTo(cx - 2.5, cy - 2.5);
      ctx.lineTo(cx + 1, cy - 6);
      ctx.lineTo(cx + 1, cy + 6);
      ctx.lineTo(cx - 2.5, cy + 2.5);
      ctx.lineTo(cx - 6, cy + 2.5);
      ctx.closePath();
      ctx.fill();
      if (sfx.muted) {
        ctx.beginPath();
        ctx.moveTo(cx + 4, cy - 4);
        ctx.lineTo(cx + 9, cy + 4);
        ctx.moveTo(cx + 9, cy - 4);
        ctx.lineTo(cx + 4, cy + 4);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(cx + 2, cy, 5, -0.9, 0.9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
