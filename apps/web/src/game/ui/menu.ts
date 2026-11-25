import type { Frame } from '../frame';
import type { Input } from '../input';
import { DEFAULT_CUSTOM_NAME } from '../constants/roster';
import { VIEW_W } from '../constants/view';
import { roundRect } from '../math';
import { menuLayout } from './layout';
import { button, label, panel, wrap } from './shapes';
import { FONT, INK, INK_DIM, INK_FAINT, MONO } from './state';
import type { UiState } from './state';

export function drawBrand(ctx: CanvasRenderingContext2D): void {
  const cx = VIEW_W / 2;
  ctx.textBaseline = 'middle';
  ctx.font = `900 52px ${FONT}`;
  const dodgeWidth = ctx.measureText('DODGE').width;
  const ballWidth = ctx.measureText('BALL').width;
  const gap = 10;
  const brandX = cx - (dodgeWidth + ballWidth + gap) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.fillText('DODGE', brandX, 112);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('BALL', brandX + dodgeWidth + gap, 112);
  ctx.textAlign = 'center';

  ctx.font = `800 12px ${MONO}`;
  ctx.fillStyle = INK_DIM;
  ctx.fillText('S I M U L A T O R', cx, 150);
}

export function drawMenu(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  ui: UiState,
  input: Input,
): void {
  const lineup = frame.lineup;
  const layout = menuLayout();

  panel(ctx, layout.panel);
  drawBrand(ctx);

  const cx = VIEW_W / 2;
  label(ctx, "Six a side. Six balls on the centre line. One hit and you're out.", cx, 190, `500 12.5px ${FONT}`, INK_DIM);
  label(ctx, 'Catch a live ball to send the thrower out and bring a teammate back in.', cx, 208, `500 12.5px ${FONT}`, INK_DIM);

  const state = frame.connection ?? 'connecting';
  const colour = state === 'online' ? '#8fb6ff' : state === 'error' ? '#ff8a9a' : INK_DIM;
  const statusText = state === 'online' ? 'CONNECTED' : state.toUpperCase();
  label(ctx, `ONLINE · ${statusText}`, cx, 250, `800 11px ${MONO}`, colour);
  label(
    ctx,
    state === 'spectating'
      ? 'The arena is full. You are watching this match.'
      : 'You will be placed on the team with fewer players.',
    cx,
    274,
    `500 12.5px ${FONT}`,
    INK_DIM,
  );

  label(ctx, 'CUSTOM PLAYER NAME', cx, 356, `800 9.5px ${MONO}`, INK_FAINT);

  const editing = ui.editingName;
  const nameRect = layout.name;
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, nameRect.x, nameRect.y, nameRect.w, nameRect.h, 9);
  ctx.fillStyle = 'rgba(4, 8, 16, 0.8)';
  ctx.fill();
  ctx.strokeStyle = editing ? 'rgba(91, 147, 255, 0.85)' : 'rgba(148, 163, 184, 0.24)';
  ctx.lineWidth = editing ? 1.8 : 1;
  ctx.stroke();

  const shown = editing ? ui.draft : lineup.customName;
  const placeholder = shown.length === 0;
  ctx.font = `700 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = placeholder ? INK_FAINT : INK;
  ctx.fillText(placeholder ? DEFAULT_CUSTOM_NAME : shown, cx, nameRect.y + nameRect.h / 2 + 1);

  if (editing && Math.floor(Date.now() / 500) % 2 === 0) {
    const width = ctx.measureText(placeholder ? '' : shown).width;
    const cursorX = cx + width / 2 + 3;
    ctx.fillStyle = 'rgba(232, 238, 252, 0.8)';
    ctx.fillRect(cursorX, nameRect.y + 9, 1.6, nameRect.h - 18);
  }
  ctx.restore();

  label(
    ctx,
    'Your name is sent when you join. Teams are balanced automatically.',
    cx,
    418,
    `500 10.5px ${FONT}`,
    INK_FAINT,
  );

  button(
    ctx,
    layout.play,
    frame.connection === 'spectating' ? 'SPECTATING' : 'START MATCH',
    'cta',
    false,
    ui.hover === 'play',
  );

  const rulesHot = ui.hover === 'rules';
  label(ctx, 'Read the rules — VDL / WDBF Foam format', cx, layout.rules.y + 12, `700 11px ${FONT}`, rulesHot ? INK : INK_DIM);
  if (rulesHot) {
    ctx.fillStyle = 'rgba(91, 147, 255, 0.7)';
    const width = ctx.measureText('Read the rules — VDL / WDBF Foam format').width;
    ctx.fillRect(cx - 120, layout.rules.y + 21, Math.min(240, width), 1);
  }

  if (input.usingTouch) {
    label(ctx, 'Stick to move · hold THROW to charge · DASH · CATCH', cx, 560, `700 11px ${FONT}`, INK_DIM);
  } else {
    const rows: Array<[string, string]> = [
      ['W A S D', 'Move'],
      ['Mouse', 'Aim'],
      ['Hold LMB', 'Charge & throw'],
      ['Shift', 'Dash'],
      ['Space / RMB', 'Catch / block'],
      ['Esc', 'Pause'],
    ];
    rows.forEach(([key, value], index) => {
      const column = index < 3 ? 0 : 1;
      const row = index % 3;
      const x = cx - 230 + column * 260;
      const y = 552 + row * 22;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `700 9.5px ${MONO}`;
      ctx.fillStyle = INK_FAINT;
      ctx.fillText(key, x + 74, y);
      ctx.textAlign = 'left';
      ctx.font = `500 11px ${FONT}`;
      ctx.fillStyle = INK_DIM;
      ctx.fillText(value, x + 86, y);
    });
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 10.5px ${FONT}`;
  ctx.fillStyle = 'rgba(100, 116, 139, 0.9)';
  const note =
    'First to 3 sets wins. Grab a ball in the opening rush and carry it behind the attack line to arm it. Empty hands catch; a ball in hand blocks.';
  wrap(ctx, note, 600).forEach((line, index) => {
    ctx.fillText(line, cx, 632 + index * 15);
  });
}
