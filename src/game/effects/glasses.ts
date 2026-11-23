import type { World } from '../ecs';
import { rand } from '../math';
import type { PlayerView } from '../queries';

/** Send Norris's spectacles flying off his face and onto the court. */
export function dropGlasses(world: World, view: PlayerView): void {
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
