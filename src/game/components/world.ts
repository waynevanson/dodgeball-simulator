import type { Entity } from '../../ecs/core';
import type { TeamId } from '../types';

// ------------------------------------------------------------------ resources

/** Simulation clock. Drives AI wobble, effect timing and banner fades. */
export interface Clock {
  sim: number;
}

/** Camera shake, hit flash and slow motion. */
export interface Feedback {
  shake: number;
  flash: number;
  slowmo: number;
}

/** Per-set state: which set, is it over, how long, sudden death. */
export interface SetState {
  id: number;
  resolved: boolean;
  winner: TeamId | null;
  elapsed: number;
  suddenDeath: boolean;
}

/** Rule 13: the opening rush is live. */
export interface Rush {
  active: boolean;
}

/** Rule 17.3: ball advantage and the ten second clock. */
export interface Shot {
  team: TeamId | null;
  clock: number;
  beep: number;
}

/** Rule 20 / 24: out players waiting to come back in, in order. */
export interface Queues {
  blue: Entity[];
  red: Entity[];
}

/** Rule 16: missed attempts, tracked per team as warnings. */
export interface Warnings {
  blue: number;
  red: number;
}

export interface Lineup {
  humanSlot: number;
  customName: string;
}

/** Rule 17.3.1: the last team to attempt a throw. */
export interface LastThrow {
  team: TeamId | null;
}

/** Rule 17.3: the set may flip the advantage away from the last winner. */
export interface LastSet {
  winner: TeamId | null;
}

/** Nearest eligible ball per player, rebuilt every frame for the AI. */
export interface Claims {
  byPlayer: Map<Entity, Entity>;
  balls: Set<Entity>;
}
