import type { Input } from '../input';
import type { FlowQueue, MatchState, PhaseState } from '../match';
import type { Hud, Intent } from '../types';
import type { UiState } from '../ui/state';
import type { BallState, BallTag, BallTrail, Held } from './ball';
import type { Floater, Glasses, Particle } from './effects';
import type { Action, Brain, Carry, Condition, Cooldowns, Human, PlayerTag, Trail } from './player';
import type { PlayerStats, Transform } from './shared';
import type { Claims, Clock, Feedback, LastSet, LastThrow, Lineup, Queues, Rush, SetState, Shot, Warnings } from './world';

// ---------------------------------------------------------------- schema

export interface GameComponents {
  transform: Transform;
  player: PlayerTag;
  condition: Condition;
  carry: Carry;
  action: Action;
  cooldowns: Cooldowns;
  intent: Intent;
  brain: Brain;
  trail: Trail;
  stats: PlayerStats;
  human: Human;

  ball: BallTag;
  ballState: BallState;
  held: Held;
  ballTrail: BallTrail;

  particle: Particle;
  floater: Floater;
  glasses: Glasses;
}

export interface GameResources {
  clock: Clock;
  feedback: Feedback;
  set: SetState;
  rush: Rush;
  shot: Shot;
  queues: Queues;
  warnings: Warnings;
  lineup: Lineup;
  lastThrow: LastThrow;
  lastSet: LastSet;
  claims: Claims;

  phase: PhaseState;
  match: MatchState;
  flow: FlowQueue;

  input: Input;
  view: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
  hud: Hud;
  ui: UiState;
}
