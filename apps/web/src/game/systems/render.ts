import type { Frame, Hud } from '../frame';
import type { Input } from '../input';
import { VIEW_H, VIEW_W } from '../constants/view';
import { render } from '../renderer';
import { drawUi } from '../ui';
import type { UiState } from '../ui/state';

export function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(2, Math.round(rect.width * dpr));
  const height = Math.max(2, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/** Draw one frame of the Rust snapshot plus the canvas UI on top. */
export function renderFrame(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  hud: Hud,
  input: Input,
  ui: UiState,
  time: number,
): void {
  resizeCanvas(canvas);
  ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
  render(ctx, frame, hud, input, time);
  drawUi(ctx, frame, ui, input);
  canvas.style.cursor = ui.hover ? 'pointer' : 'crosshair';
}
