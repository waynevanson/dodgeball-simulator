import { EcsWorld } from '../../ecs/core';
import { COURT } from '../constants';
import { MAX_FLOATERS, MAX_PARTICLES } from './particles';

export function updateEffects(world: EcsWorld, dt: number): void {
  const particles = world.query('particle');
  for (const entity of particles) {
    const transform = world.get(entity, 'transform')!;
    const particle = world.get(entity, 'particle')!;
    particle.life -= dt;
    transform.x += transform.vx * dt;
    transform.y += transform.vy * dt;
    const drag = Math.exp(-particle.drag * dt);
    transform.vx *= drag;
    transform.vy *= drag;
    if (particle.type === 'confetti') {
      transform.vy += 150 * dt;
      transform.vx *= 1 - 0.6 * dt;
      particle.spin += particle.spinV * dt;
    }
    if (particle.life <= 0) world.despawn(entity);
  }
  if (particles.length > MAX_PARTICLES) {
    const live = world.query('particle');
    const excess = live.length - MAX_PARTICLES;
    for (let i = 0; i < excess; i++) world.despawn(live[i]);
  }

  for (const entity of world.query('glasses')) {
    const transform = world.get(entity, 'transform')!;
    const glasses = world.get(entity, 'glasses')!;
    transform.x += transform.vx * dt;
    transform.y += transform.vy * dt;
    const drag = Math.exp(-4.2 * dt);
    transform.vx *= drag;
    transform.vy *= drag;
    glasses.rot += glasses.spin * dt;
    glasses.spin *= Math.exp(-3.4 * dt);
    transform.x = Math.max(COURT.x + 22, Math.min(COURT.right - 22, transform.x));
    transform.y = Math.max(COURT.y + 22, Math.min(COURT.bottom - 22, transform.y));
  }

  const floaters = world.query('floater');
  for (const entity of floaters) {
    const transform = world.get(entity, 'transform')!;
    const floater = world.get(entity, 'floater')!;
    floater.life -= dt;
    transform.y -= 30 * dt;
    if (floater.life <= 0) world.despawn(entity);
  }
  if (floaters.length > MAX_FLOATERS) {
    const live = world.query('floater');
    const excess = live.length - MAX_FLOATERS;
    for (let i = 0; i < excess; i++) world.despawn(live[i]);
  }
}
