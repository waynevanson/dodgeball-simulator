import type { World } from '../ecs';
import { VIEW_H, VIEW_W } from '../constants/view';
import { Input } from '../input';
import type { Hud } from '../types';
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
  world: World,
  hud: Hud,
  input: Input,
  time: number,
): void {
  const feedback = world.resource('feedback');
  ctx.save();

  if (feedback.shake > 0.4) {
    const s = feedback.shake * 0.42;
    ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
  }

  drawBackdrop(ctx, time);
  drawCourt(ctx, time);
  drawQueues(ctx, hud, time);
  drawParticles(ctx, world, 'under');
  drawGroundBalls(ctx, world);
  drawFallenGlasses(ctx, world);
  drawEliminated(ctx, world);
  drawPlayers(ctx, world, time);
  drawActiveBalls(ctx, world);
  drawParticles(ctx, world, 'over');
  drawFloaters(ctx, world);
  drawHud(ctx, world, hud, input, time);
  drawPhaseOverlay(ctx, hud);
  drawAimCursor(ctx, hud, input);

  ctx.restore();
  drawFlash(ctx, world);
}

export function drawFlash(ctx: CanvasRenderingContext2D, world: World): void {
  const flash = world.resource('feedback').flash;
  if (flash <= 0.01) return;
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.3, flash * 0.28)})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
