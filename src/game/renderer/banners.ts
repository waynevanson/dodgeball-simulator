import { COUNTDOWN_SECONDS, SET_BREAK_MS } from '../constants/rules';
import { TEAMS } from '../constants/teams';
import { COURT, VIEW_H, VIEW_W } from '../constants/view';
import { TAU, clamp, easeOutCubic, roundRect } from '../math';
import type { Hud } from '../types';
import { FONT, MONO } from './style';

// ------------------------------------------------------------------ overlays
// ------------------------------------------------------------------ overlays

export interface BannerStyle {
  text: string;
  sub: string;
  color: string;
  alpha: number;
  pop: number;
  big: boolean;
}

export function drawBannerPanel(ctx: CanvasRenderingContext2D, banner: BannerStyle): void {
  ctx.save();
  ctx.globalAlpha = banner.alpha;
  ctx.translate(VIEW_W / 2, COURT.cy - 10);
  ctx.scale(0.92 + banner.pop * 0.08, 0.92 + banner.pop * 0.08);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const size = banner.big ? 64 : 34;
  ctx.font = `900 ${size}px ${FONT}`;
  const textWidth = ctx.measureText(banner.text).width;
  const panelWidth = Math.max(textWidth + 72, 320);
  const panelHeight = banner.sub ? 116 : 92;

  roundRect(ctx, -panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 18);
  ctx.fillStyle = 'rgba(5, 8, 14, 0.78)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = banner.color;
  ctx.fillText(banner.text, 0, banner.sub ? -16 : 0);

  if (banner.sub) {
    ctx.font = `700 20px ${MONO}`;
    ctx.fillStyle = 'rgba(232, 238, 252, 0.85)';
    ctx.fillText(banner.sub, 0, 28);
  }
  ctx.restore();
}

export function drawPhaseOverlay(ctx: CanvasRenderingContext2D, hud: Hud): void {
  if (hud.phase === 'countdown') {
    drawCountdown(ctx, hud);
    return;
  }

  if (hud.phase === 'playing' && hud.phaseElapsed < 0.9) {
    const k = hud.phaseElapsed / 0.9;
    drawBannerPanel(ctx, {
      text: 'GO!',
      sub: '',
      color: '#e8eefc',
      alpha: clamp(Math.min(hud.phaseElapsed * 8, (1 - k) * 4), 0, 1),
      pop: easeOutCubic(clamp(hud.phaseElapsed * 6, 0, 1)),
      big: true,
    });
    return;
  }

  if (hud.phase === 'setover') {
    const duration = SET_BREAK_MS / 1000;
    const elapsed = hud.phaseElapsed;
    const winner = hud.lastSetWinner;
    const color = winner ? TEAMS[winner].main : '#cbd5e1';
    const text = winner
      ? `${TEAMS[winner].name.toUpperCase()} TAKES THE SET`
      : 'ALL OUT — SET VOID';
    drawBannerPanel(ctx, {
      text,
      sub: `${hud.score.blue} — ${hud.score.red}`,
      color,
      alpha: clamp(Math.min(elapsed * 7, (1 - elapsed / duration) * 3.2), 0, 1),
      pop: easeOutCubic(clamp(elapsed * 5.5, 0, 1)),
      big: false,
    });
    return;
  }

  if (hud.phase === 'matchover') {
    ctx.fillStyle = 'rgba(4, 6, 11, 0.32)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

export function drawCountdown(ctx: CanvasRenderingContext2D, hud: Hud): void {
  const remaining = Math.max(0.001, COUNTDOWN_SECONDS - hud.phaseElapsed);
  const n = clamp(Math.ceil(remaining - 0.1), 1, 3);
  const into = 1 - (((remaining - 0.1) % 1) + 1) % 1;
  const pop = easeOutCubic(clamp(into / 0.22, 0, 1));
  const scale = 1.32 - 0.32 * pop;
  const alpha = 0.25 + 0.75 * pop;

  ctx.save();
  ctx.translate(VIEW_W / 2, COURT.cy - 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `800 ${hud.compact ? 15 : 12}px ${MONO}`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
  ctx.fillText('LINE UP ON THE BACK LINE', 0, -104);

  ctx.beginPath();
  ctx.arc(0, 0, 92, -Math.PI / 2, -Math.PI / 2 + TAU * (remaining / COUNTDOWN_SECONDS));
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.globalAlpha = alpha;
  ctx.scale(scale, scale);
  ctx.font = `900 128px ${FONT}`;
  ctx.fillStyle = 'rgba(232, 238, 252, 0.94)';
  ctx.fillText(String(n), 0, 6);
  ctx.restore();
}
