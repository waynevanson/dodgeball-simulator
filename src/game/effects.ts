import type { EcsWorld } from '../ecs/core';
import { sfx } from './audio';
import type { ParticleType } from './components';
import { COURT } from './constants';
import { pick, rand, TAU } from './math';
import type { PlayerView } from './queries';

const CONFETTI_COLORS = ['#5b93ff', '#ff5f73', '#fbbf24', '#7dd3fc', '#f472b6', '#a3e635'];
const MAX_PARTICLES = 700;
const MAX_FLOATERS = 30;

/**
 * Effects are ordinary entities: a transform plus a particle/floater/glasses
 * component. Systems age them, the renderer draws whatever the query returns.
 */

export function burst(
  world: EcsWorld,
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

export function ring(world: EcsWorld, x: number, y: number, color: string, size = 26): void {
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

export function confetti(world: EcsWorld, count = 80): void {
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

/** Send Norris's spectacles flying off his face and onto the court. */
export function dropGlasses(world: EcsWorld, view: PlayerView): void {
  const entity = world.spawn();
  world.add(entity, 'transform', {
    x: view.transform.x + rand(-4, 4),
    y: view.transform.y - view.transform.radius * 0.35,
    vx: rand(-150, 150),
    vy: rand(-220, -90),
    radius: 0,
    facing: 0,
  });
  world.add(entity, 'glasses', { rot: rand(-0.5, 0.5), spin: rand(-12, 12) });
}

export function onDash(world: EcsWorld, view: PlayerView): void {
  sfx.dash();
  for (let i = 0; i < 7; i++) {
    const entity = world.spawn();
    world.add(entity, 'transform', {
      x: view.transform.x + rand(-6, 6),
      y: view.transform.y + rand(-6, 6),
      vx: -view.action.dashX * rand(30, 120) + rand(-40, 40),
      vy: -view.action.dashY * rand(30, 120) + rand(-40, 40),
      radius: 0,
      facing: 0,
    });
    world.add(entity, 'particle', {
      life: rand(0.2, 0.45),
      max: 0.45,
      size: rand(2, 5),
      color: 'rgba(203,213,225,0.55)',
      drag: 4,
      type: 'dust',
      spin: 0,
      spinV: 0,
    });
  }
}

export function punch(world: EcsWorld): void {
  const feedback = world.resource('feedback');
  feedback.shake = Math.max(feedback.shake, 11);
  feedback.flash = Math.max(feedback.flash, 0.26);
  feedback.slowmo = 0.3;
}

export function celebrate(world: EcsWorld, winner: 'blue' | 'red'): void {
  if (winner === 'blue') confetti(world, 110);
}

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
