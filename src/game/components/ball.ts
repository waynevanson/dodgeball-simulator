import type { Entity } from '../../ecs/core';
import type { TeamId } from '../types';
import type { TrailPoint } from './shared';

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
