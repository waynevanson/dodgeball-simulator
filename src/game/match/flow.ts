import type { World } from '../ecs';
import type { System } from '../ecs';
import { COUNTDOWN_MS, SET_BREAK_MS } from '../constants/rules';
import type { FlowContext, FlowStep, Transition, Trigger } from './state';
import { ENTER, MATCH_FLOW } from './table';

// ------------------------------------------------------------------ execution

export function send(world: World, trigger: Trigger): void {
  world.resource('flow').pending.push(trigger);
}

export function resolve(context: FlowContext, trigger: Trigger): Transition | undefined {
  return MATCH_FLOW.find((candidate) => {
    if (candidate.from !== context.phase.id) return false;
    if (candidate.on !== trigger.type) return false;
    return candidate.guard ? candidate.guard(context, trigger) : true;
  });
}

export function apply(world: World, trigger: Trigger): void {
  const context: FlowContext = {
    world,
    phase: world.resource('phase'),
    match: world.resource('match'),
  };
  const transition = resolve(context, trigger);
  if (!transition) return;

  const from = context.phase.id;
  const to = typeof transition.to === 'function' ? transition.to(context) : transition.to;
  context.phase.id = to;
  context.phase.elapsed = 0;

  const step: FlowStep = { context, trigger, from, to };
  transition.effect?.(step);
  ENTER[to]?.(step);
}

/**
 * Time-based transitions, plus the one result the world owns: a resolved set
 * raises `setOver`. The world never calls back into flow; systems read state.
 */
export function poll(world: World, dt: number): void {
  const phase = world.resource('phase');
  const flow = world.resource('flow');

  switch (phase.id) {
    case 'countdown':
      phase.elapsed += dt;
      if (phase.elapsed * 1000 >= COUNTDOWN_MS) flow.pending.push({ type: 'countdownDone' });
      break;

    case 'playing':
      phase.elapsed += dt;
      // The world resolved the set; claim the result on its behalf.
      if (world.resource('set').resolved) flow.pending.push({ type: 'setOver' });
      break;

    case 'setover':
      phase.elapsed += dt;
      if (phase.elapsed * 1000 >= SET_BREAK_MS) flow.pending.push({ type: 'setBreakDone' });
      break;

    default:
      break;
  }
}

export function flowSystem(): System {
  return {
    name: 'match-flow',
    run({ world, dt }) {
      const flow = world.resource('flow');
      let polled = false;

      // Drain the queue, letting one transition's consequences queue another
      // (countdown -> playing -> setOver) without waiting a frame each time.
      for (let budget = 0; budget < 16; budget += 1) {
        if (flow.pending.length === 0) {
          if (polled) break;
          polled = true;
          poll(world, dt);
          if (flow.pending.length === 0) break;
        }

        const trigger = flow.pending.shift();
        if (!trigger) break;
        apply(world, trigger);
      }
    },
  };
}
