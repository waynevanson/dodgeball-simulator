import type { Entity } from '../ecs';
import type { Difficulty, TeamId } from '../types';
import type { TrailPoint } from './shared';

/** Identity: a player entity is a person, not a body. */
export interface PlayerTag {
  name: string;
  number: number;
  team: TeamId;
  slot: number;
  isHuman: boolean;
  glasses: boolean;
}

/** In or out, entering from the queue, recently hit. */
export interface Condition {
  alive: boolean;
  hasGlasses: boolean;
  enteringTime: number;
  hitFlash: number;
  outAt: number;
  outX: number;
  outY: number;
}

/** The ball this player is holding, if any. */
export interface Carry {
  ball: Entity | null;
}

/** Throw charge and dash, which move the player faster or slower. */
export interface Action {
  charge: number;
  charging: boolean;
  dashTime: number;
  dashCd: number;
  dashX: number;
  dashY: number;
}

/** Per-player input gates: catch window and the cooldowns that pace it. */
export interface Cooldowns {
  catchWindow: number;
  catchCd: number;
  throwCd: number;
  pickupCd: number;
}

/** Noisy AI memory. Persisted between frames so decisions have inertia. */
export interface Brain {
  diff: Difficulty | null;
  seek: Entity | null;
  target: Entity | null;
  targetTimer: number;
  aimTimer: number;
  aimError: number;
  releaseDelay: number;
  catchBall: Entity | null;
  willCatch: boolean;
  strafe: number;
  strafeTimer: number;
  phase: number;
  anchorX: number;
  anchorY: number;
  anchorTimer: number;
}

export interface Trail {
  points: TrailPoint[];
}

/** Marker component: this player is the one the keyboard controls. */
export interface Human {}
