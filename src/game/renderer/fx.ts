import type { World } from '../ecs';
import { TAU, clamp } from '../math';
import { FONT } from './style';

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  world: World,
  layer: 'under' | 'over',
): void {
  ctx.save();
  for (const entity of world.query('particle')) {
    const p = world.get(entity, 'transform')!;
    const particle = world.get(entity, 'particle')!;
    if (layer === 'under' && particle.type !== 'dust') continue;
    if (layer === 'over' && particle.type === 'dust') continue;
    const t = clamp(particle.life / particle.max, 0, 1);

    if (particle.type === 'ring') {
      const k = 1 - t;
      ctx.beginPath();
      ctx.arc(p.x, p.y, particle.size + k * 46, 0, TAU);
      ctx.strokeStyle = particle.color;
      ctx.globalAlpha = t * 0.7;
      ctx.lineWidth = 3 * t + 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }

    if (particle.type === 'confetti') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(particle.spin);
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.fillStyle = particle.color;
      ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      ctx.restore();
      ctx.globalAlpha = 1;
      continue;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, particle.size * (0.35 + t * 0.85), 0, TAU);
    ctx.globalAlpha = particle.type === 'dust' ? t * 0.5 : t;
    ctx.fillStyle = particle.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function drawFloaters(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const entity of world.query('floater')) {
    const f = world.get(entity, 'transform')!;
    const floater = world.get(entity, 'floater')!;
    const t = clamp(floater.life / floater.max, 0, 1);
    const pop = 1 + (1 - t) * 0.18;
    ctx.globalAlpha = Math.min(1, t * 1.6);
    ctx.font = `900 ${(floater.size ?? 15) * pop}px ${FONT}`;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(4, 7, 12, 0.72)';
    ctx.strokeText(floater.text, f.x, f.y);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, f.x, f.y);
  }
  ctx.restore();
}
