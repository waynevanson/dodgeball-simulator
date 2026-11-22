import { EcsWorld } from '../../ecs/core';

export function addFloater(
  world: EcsWorld,
  x: number,
  y: number,
  text: string,
  color: string,
  life = 1,
  size?: number,
): void {
  const entity = world.spawn();
  world.add(entity, 'transform', { x, y, vx: 0, vy: 0, radius: 0, facing: 0 });
  world.add(entity, 'floater', { text, color, life, max: life, size });
}
