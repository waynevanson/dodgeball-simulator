import type { World } from '../ecs';
import type { DifficultyId, Phase, Score, TeamId } from '../types';

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

export interface FlowContext {
  readonly world: World;
  readonly phase: PhaseState;
  readonly match: MatchState;
}

export interface FlowStep {
  readonly context: FlowContext;
  readonly trigger: Trigger;
  readonly from: Phase;
  readonly to: Phase;
}

export type Target = Phase | ((context: FlowContext) => Phase);

export interface Transition {
  readonly from: Phase;
  readonly on: TriggerType;
  readonly to: Target;
  readonly guard?: (context: FlowContext, trigger: Trigger) => boolean;
  /** Runs once the phase id has changed. */
  readonly effect?: (step: FlowStep) => void;
}
