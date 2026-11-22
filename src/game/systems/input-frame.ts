import type { System } from '../../ecs/core';

/** Consume one-shot input edges after every system that reads input. */
export function inputFrameSystem(): System {
  return {
    name: 'input-frame',
    run({ world }) {
      world.resource('input').endFrame();
    },
  };
}
