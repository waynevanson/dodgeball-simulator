import type { World } from '../ecs';
import type { ParticleType } from '../components';
import { TAU, pick, rand } from '../math';

export const CONFETTI_COLORS = ['#5b93ff', '#ff5f73', '#fbbf24', '#7dd3fc', '#f472b6', '#a3e635'];

export const MAX_PARTICLES = 700;

export const MAX_FLOATERS = 30;

/**
 * Effects are ordinary entities: a transform plus a particle/floater/glasses
 * component. Systems age them, the renderer draws whatever the query returns.
 */

export function burst(
  world: World,
  x: number,
  y: number,
  color: string,
  count = 12,
  power = 1,
  type: ParticleType = 'spark',
): void {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, TAU);
    const speed = rand(50, 340) * power;
    const entity = world.spawn();
    world.add(entity, 'transform', {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 0,
      facing: 0,
    });
    world.add(entity, 'particle', {
      life: rand(0.22, 0.62),
      max: 0.62,
      size: rand(1.6, 4.2),
      color,
      drag: 3.6,
      type,
      spin: 0,
      spinV: 0,
    });
  }
}

export function ring(world: World, x: number, y: number, color: string, size = 26): void {
  const entity = world.spawn();
  world.add(entity, 'transform', { x, y, vx: 0, vy: 0, radius: 0, facing: 0 });
  world.add(entity, 'particle', {
    life: 0.42,
    max: 0.42,
    size,
    color,
    drag: 0,
    type: 'ring',
    spin: 0,
    spinV: 0,
  });
}

export function confetti(world: World, count = 80): void {
  for (let i = 0; i < count; i++) {
    const entity = world.spawn();
    world.add(entity, 'transform', {
      x: rand(0, 1280),
      y: rand(-80, 120),
      vx: rand(-70, 70),
      vy: rand(70, 240),
      radius: 0,
      facing: 0,
    });
    world.add(entity, 'particle', {
      life: rand(1.6, 3.2),
      max: 3.2,
      size: rand(3, 7),
      color: pick(CONFETTI_COLORS),
      drag: 0.25,
      type: 'confetti',
      spin: rand(0, TAU),
      spinV: rand(-8, 8),
    });
  }
}
