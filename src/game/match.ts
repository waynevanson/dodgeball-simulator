import type { EcsWorld, System } from '../ecs/core';
import { COUNTDOWN_MS, SET_BREAK_MS, WINS_NEEDED } from './constants';
import { startSet, toMenu } from './spawn';
import type { DifficultyId, Phase, Score, TeamId } from './types';

/**
 * Match flow as ECS state: a `phase` resource holding the current state, a
 * `match` resource holding the score, and a transition table that names every
 * legal move between them.
 *
 *   menu ──start──▶ countdown ──3.1s──▶ playing
 *                      ▲                  │
 *                      │    setOver       │
 *                      │                  ▼
 *                      └───3s─── setover ──▶ matchover
 *
 * Pause records the phase it froze and resume returns there, replacing the
 * deep-history state the old chart needed: nothing is exited, the simulation
 * simply stops advancing.
 *
 * VDL notes:
 *  - Rule 10.2.2: winning a set in the Foam format grants 1 point.
 *  - Rule 10.2.1: a set is won by eliminating every opponent.
 *  - Rule 29.3.2: simultaneous all-out voids the set (no point awarded), which
 *    is represented by `winner: null`.
 */

export interface PhaseState {
  id: Phase;
  /** Seconds spent in this phase, in simulation time so pause freezes it. */
  elapsed: number;
  /** Where `resume` should drop the player back into. */
  resumeFrom: Phase | null;
}

export interface MatchState {
  difficulty: DifficultyId;
  score: Score;
  set: number;
  lastSetWinner: TeamId | null;
  matchWinner: TeamId | null;
}

/** Triggers are queued by the UI and by the polling step below. */
export type Trigger =
  | { type: 'start'; difficulty: DifficultyId }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'menu' }
  | { type: 'countdownDone' }
  | { type: 'setOver' }
  | { type: 'setBreakDone' };

export type TriggerType = Trigger['type'];

export interface FlowQueue {
  pending: Trigger[];
}

interface FlowContext {
  readonly world: EcsWorld;
  readonly phase: PhaseState;
  readonly match: MatchState;
}

interface FlowStep {
  readonly context: FlowContext;
  readonly trigger: Trigger;
  readonly from: Phase;
  readonly to: Phase;
}

type Target = Phase | ((context: FlowContext) => Phase);

interface Transition {
  readonly from: Phase;
  readonly on: TriggerType;
  readonly to: Target;
  readonly guard?: (context: FlowContext, trigger: Trigger) => boolean;
  /** Runs once the phase id has changed. */
  readonly effect?: (step: FlowStep) => void;
}

// ------------------------------------------------------------------- effects

const newMatch = ({ context, trigger }: FlowStep): void => {
  if (trigger.type !== 'start') return;
  context.match.difficulty = trigger.difficulty;
  context.match.score = { blue: 0, red: 0 };
  context.match.set = 1;
  context.match.lastSetWinner = null;
  context.match.matchWinner = null;
};

const freezePhase = ({ context, from }: FlowStep): void => {
  context.phase.resumeFrom = from;
};

/** Rule 10.2.2: a set is worth one point; a voided set awards none. */
const awardSet = ({ context }: FlowStep): void => {
  const winner = context.world.resource('set').winner;
  const score: Score = { ...context.match.score };
  if (winner) score[winner] += 1;
  context.match.score = score;
  context.match.lastSetWinner = winner;
};

const nextSet = ({ context }: FlowStep): void => {
  context.match.set += 1;
};

const recordMatchWinner = ({ context }: FlowStep): void => {
  context.match.matchWinner =
    context.match.score.blue > context.match.score.red ? 'blue' : 'red';
};

const matchDecided = (context: FlowContext): boolean =>
  context.match.score.blue >= WINS_NEEDED || context.match.score.red >= WINS_NEEDED;

// -------------------------------------------------------------- entry actions

/**
 * What *being in* a phase means for the simulation. Entry actions live with
 * the definition of the state rather than in the presentation system, so the
 * flow can be exercised without a canvas or a DOM.
 */
const ENTER: Partial<Record<Phase, (step: FlowStep) => void>> = {
  menu: (step) => {
    toMenu(step.context.world);
    step.context.match.lastSetWinner = null;
    step.context.match.matchWinner = null;
  },

  countdown: (step) => {
    startSet(step.context.world);
  },
};

// ----------------------------------------------------------------- definition

const MATCH_FLOW: readonly Transition[] = [
  { from: 'menu', on: 'start', to: 'countdown', effect: newMatch },
  { from: 'matchover', on: 'start', to: 'countdown', effect: newMatch },
  { from: 'countdown', on: 'start', to: 'countdown', effect: newMatch },
  { from: 'playing', on: 'start', to: 'countdown', effect: newMatch },
  { from: 'paused', on: 'start', to: 'countdown', effect: newMatch },

  { from: 'countdown', on: 'pause', to: 'paused', effect: freezePhase },
  { from: 'playing', on: 'pause', to: 'paused', effect: freezePhase },
  { from: 'paused', on: 'resume', to: (context) => context.phase.resumeFrom ?? 'playing' },

  { from: 'countdown', on: 'menu', to: 'menu' },
  { from: 'playing', on: 'menu', to: 'menu' },
  { from: 'paused', on: 'menu', to: 'menu' },

  { from: 'countdown', on: 'countdownDone', to: 'playing' },
  { from: 'playing', on: 'setOver', to: 'setover', effect: awardSet },
  {
    from: 'setover',
    on: 'setBreakDone',
    guard: matchDecided,
    to: 'matchover',
    effect: recordMatchWinner,
  },
  { from: 'setover', on: 'setBreakDone', to: 'countdown', effect: nextSet },
];

// ------------------------------------------------------------------ execution

export function send(world: EcsWorld, trigger: Trigger): void {
  world.resource('flow').pending.push(trigger);
}

function resolve(context: FlowContext, trigger: Trigger): Transition | undefined {
  return MATCH_FLOW.find((candidate) => {
    if (candidate.from !== context.phase.id) return false;
    if (candidate.on !== trigger.type) return false;
    return candidate.guard ? candidate.guard(context, trigger) : true;
  });
}

function apply(world: EcsWorld, trigger: Trigger): void {
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
function poll(world: EcsWorld, dt: number): void {
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
