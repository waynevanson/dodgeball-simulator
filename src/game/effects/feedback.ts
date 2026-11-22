import { EcsWorld } from '../../ecs/core';
import { sfx } from '../audio';
import { rand } from '../math';
import type { PlayerView } from '../queries';
import { confetti } from './particles';

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
