import type { System } from '../../ecs/core';
import { VIEW_H, VIEW_W } from '../constants/view';
import { render } from '../renderer';
import { drawUi } from '../ui';

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

export function renderSystem(): System {
  return {
    name: 'render',
    run({ world, now }) {
      const { canvas, ctx } = world.resource('view');
      resizeCanvas(canvas);
      ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
      render(ctx, world, world.resource('hud'), world.resource('input'), now);
      drawUi(ctx, world);
      canvas.style.cursor = world.resource('ui').hover ? 'pointer' : 'crosshair';
    },
  };
}
