/**
 * Every piece of mutable state in the game, declared as a component (per
 * entity) or a resource (per run). Nothing here has behaviour: systems read and
 * write these records, and module augmentation below makes
 * `world.get(entity, 'transform')` / `world.resource('set')` type-safe.
 */
import type { Entity } from '../ecs/core';
import type { Input } from './input';
import type { FlowQueue, MatchState, PhaseState } from './match';
import type { Difficulty, Hud, Intent, TeamId } from './types';

export interface TrailPoint {
  x: number;
  y: number;
  a: number;
}

export interface PlayerStats {
  throws: number;
  catches: number;
  outs: number;
}

export type ParticleType = 'spark' | 'dust' | 'ring' | 'confetti';

// ----------------------------------------------------------------- components

/** Shared by players, balls and effects. `facing` is only meaningful for players. */
export interface Transform {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  facing: number;
}

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

/** Ball-specific visuals: spin and idle bob. */
export interface BallTag {
  spin: number;
  spinV: number;
  bob: number;
  age: number;
}

/**
 * The ball lifecycle. `rush` / `armed` / `canOut` are the statechart the ball
 * has always been: spawned -> rushed -> armed -> in flight -> dead or held.
 */
export interface BallState {
  live: boolean;
  armed: boolean;
  rush: boolean;
  canOut: boolean;
  team: TeamId | null;
  thrower: Entity | null;
  throwerTeam: TeamId | null;
  touched: boolean;
  validAttempt: boolean;
  warningIssued: boolean;
  ignore: Entity | null;
  ignoreTime: number;
  bounces: number;
  pickupCd: number;
  releasePositions: Array<{ x: number; y: number }>;
}

/** Who is carrying this ball. Null when it is loose or in flight. */
export interface Held {
  by: Entity | null;
}

export interface BallTrail {
  points: TrailPoint[];
}

export interface Particle {
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
  type: ParticleType;
  spin: number;
  spinV: number;
}

export interface Floater {
  text: string;
  color: string;
  life: number;
  max: number;
  size?: number;
}

export interface Glasses {
  rot: number;
  spin: number;
}

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

// ---------------------------------------------------------------- vocabulary

declare module '../ecs/core' {
  interface ComponentMap {
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

  interface ResourceMap {
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
  }
}
