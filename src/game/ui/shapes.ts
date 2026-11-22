import { VIEW_H, VIEW_W } from '../constants/view';
import { roundRect } from '../math';
import type { Rect } from './layout';
import { FONT, INK, INK_DIM, PANEL_FILL, PANEL_LINE } from './state';

// -------------------------------------------------------------------- render

export function panel(ctx: CanvasRenderingContext2D, rect: Rect, radius = 20): void {
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fillStyle = PANEL_FILL;
  ctx.fill();
  ctx.strokeStyle = PANEL_LINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export function overlay(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.4, 80, VIEW_W / 2, VIEW_H * 0.4, 760);
  g.addColorStop(0, 'rgba(22, 31, 52, 0.76)');
  g.addColorStop(1, 'rgba(4, 6, 11, 0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = 'center',
): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

export function button(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  text: string,
  kind: 'cta' | 'ghost' | 'pill',
  active = false,
  hot = false,
): void {
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);

  if (kind === 'cta') {
    const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    g.addColorStop(0, hot ? '#e9f1ff' : '#d9e7ff');
    g.addColorStop(0.45, '#94b9ff');
    g.addColorStop(1, '#5b93ff');
    ctx.fillStyle = g;
    ctx.fill();
    label(
      ctx,
      text,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2 + 1,
      `900 ${Math.round(rect.h * 0.34)}px ${FONT}`,
      '#06101f',
    );
  } else if (kind === 'pill') {
    if (active) {
      const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
      g.addColorStop(0, '#cfe0ff');
      g.addColorStop(1, '#8fb6ff');
      ctx.fillStyle = g;
      ctx.fill();
      label(
        ctx,
        text,
        rect.x + rect.w / 2,
        rect.y + rect.h / 2 + 1,
        `700 ${Math.round(rect.h * 0.38)}px ${FONT}`,
        '#08111f',
      );
    } else {
      ctx.fillStyle = hot ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.05)';
      ctx.fill();
      label(
        ctx,
        text,
        rect.x + rect.w / 2,
        rect.y + rect.h / 2 + 1,
        `700 ${Math.round(rect.h * 0.38)}px ${FONT}`,
        hot ? INK : INK_DIM,
      );
    }
  } else {
    ctx.fillStyle = hot ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.06)';
    ctx.fill();
    ctx.strokeStyle = hot ? 'rgba(148, 163, 184, 0.4)' : PANEL_LINE;
    ctx.lineWidth = 1;
    ctx.stroke();
    label(
      ctx,
      text,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2 + 1,
      `800 ${Math.round(rect.h * 0.3)}px ${FONT}`,
      hot ? INK : INK_DIM,
    );
  }

  ctx.restore();
}

export function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
