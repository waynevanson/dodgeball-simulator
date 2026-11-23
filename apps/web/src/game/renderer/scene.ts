import type { Frame } from '../frame';
import { VIEW_H, VIEW_W } from '../constants/view';
import { Input } from '../input';
import type { Hud } from '../frame';
import { drawBackdrop } from './backdrop';
import { drawActiveBalls, drawFallenGlasses, drawGroundBalls } from './balls';
import { drawPhaseOverlay } from './banners';
import { drawCourt } from './court';
import { drawAimCursor } from './cursor';
import { drawFloaters, drawParticles } from './fx';
import { drawHud } from './hud';
import { drawEliminated, drawPlayers } from './players';
import { drawQueues } from './queues';

export function render(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  hud: Hud,
  input: Input,
  time: number,
): void {
  const feedback = frame.feedback;
  ctx.save();

  if (feedback.shake > 0.4) {
    const s = feedback.shake * 0.42;
    ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
  }

  drawBackdrop(ctx, time);
  drawCourt(ctx, time);
  drawQueues(ctx, hud, time);
  drawParticles(ctx, frame, 'under');
  drawGroundBalls(ctx, frame);
  drawFallenGlasses(ctx, frame);
  drawEliminated(ctx, frame);
  drawPlayers(ctx, frame, time);
  drawActiveBalls(ctx, frame);
  drawParticles(ctx, frame, 'over');
  drawFloaters(ctx, frame);
  drawHud(ctx, frame, hud, input, time);
  drawPhaseOverlay(ctx, hud);
  drawAimCursor(ctx, hud, input);

  ctx.restore();
  drawFlash(ctx, frame);
}

export function drawFlash(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const flash = frame.feedback.flash;
  if (flash <= 0.01) return;
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.3, flash * 0.28)})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
