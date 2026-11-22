import { VIEW_H, VIEW_W } from '../constants/view';
import { Input } from '../input';
import { TAU, roundRect } from '../math';
import { rotateLayout } from './hit';
import { button, label } from './shapes';
import { CATCH_BTN, DASH_BTN, FONT, INK, INK_DIM, STICK, THROW_BTN } from './state';
import type { UiState } from './state';

export function drawTouchControls(ctx: CanvasRenderingContext2D, input: Input): void {
  // Stick base and knob.
  ctx.save();
  ctx.beginPath();
  ctx.arc(STICK.x, STICK.y, STICK.r, 0, TAU);
  ctx.fillStyle = 'rgba(8, 14, 26, 0.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const knobX = STICK.x + input.touch.mx * STICK.r;
  const knobY = STICK.y + input.touch.my * STICK.r;
  ctx.beginPath();
  ctx.arc(knobX, knobY, STICK.knob, 0, TAU);
  ctx.fillStyle = 'rgba(226, 232, 240, 0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();

  // THROW: hold to charge.
  ctx.save();
  ctx.beginPath();
  ctx.arc(THROW_BTN.x, THROW_BTN.y, THROW_BTN.r, 0, TAU);
  ctx.fillStyle = input.touch.throwDown ? 'rgba(251, 191, 36, 0.34)' : 'rgba(8, 14, 26, 0.4)';
  ctx.fill();
  ctx.strokeStyle = input.touch.throwDown ? '#fbbf24' : 'rgba(226, 232, 240, 0.4)';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  label(ctx, 'THROW', THROW_BTN.x, THROW_BTN.y + 1, `900 15px ${FONT}`, INK);

  for (const [def, text] of [
    [DASH_BTN, 'DASH'],
    [CATCH_BTN, 'CATCH'],
  ] as const) {
    ctx.beginPath();
    ctx.arc(def.x, def.y, def.r, 0, TAU);
    ctx.fillStyle = 'rgba(8, 14, 26, 0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.32)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    label(ctx, text, def.x, def.y + 1, `900 10px ${FONT}`, INK_DIM);
  }
  ctx.restore();
}

export function drawRotate(ctx: CanvasRenderingContext2D, ui: UiState): void {
  ctx.fillStyle = 'rgba(4, 6, 11, 0.95)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // A little phone, rotating.
  ctx.save();
  ctx.translate(VIEW_W / 2, 250);
  ctx.rotate(Math.sin(Date.now() / 700) * 0.25);
  ctx.beginPath();
  roundRect(ctx, -34, -58, 68, 116, 12);
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.7)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  const cx = VIEW_W / 2;
  label(ctx, 'ROTATE YOUR PHONE', cx, 360, `900 26px ${FONT}`, INK);
  label(ctx, 'Dodgeball needs a wide court. Turn your phone sideways.', cx, 392, `500 12px ${FONT}`, INK_DIM);

  const layout = rotateLayout();
  button(ctx, layout.play, 'PLAY ANYWAY', 'ghost', false, ui.hover === 'portrait-ok');
}
