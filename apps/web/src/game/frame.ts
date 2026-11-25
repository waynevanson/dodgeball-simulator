import type { DifficultyId, Phase, Score, TeamId } from './types';

/**
 * The read-only view of the Rust world published by SpacetimeDB each tick.
 * Shapes mirror the snapshot structs in `crates/sim/src/snapshot.rs`; the
 * renderer and the canvas UI read only this, never the simulation.
 */

export interface TrailPointView {
  x: number;
  y: number;
  a: number;
}

export interface TransformView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  facing: number;
}

export interface PlayerTagView {
  name: string;
  number: number;
  team: TeamId;
  slot: number;
  owner: number | null;
  isHuman: boolean;
  /** True for the local client's own player. */
  isYou: boolean;
  glasses: boolean;
}

export interface ConditionView {
  alive: boolean;
  hasGlasses: boolean;
  enteringTime: number;
  hitFlash: number;
  outAt: number;
  outX: number;
  outY: number;
}

export interface ActionView {
  charge: number;
  charging: boolean;
  dashTime: number;
  dashCd: number;
  dashX: number;
  dashY: number;
}

export interface CooldownsView {
  catchWindow: number;
  catchCd: number;
  throwCd: number;
  pickupCd: number;
}

export interface StatsView {
  throws: number;
  catches: number;
  outs: number;
}

export interface PlayerView {
  /** Entity index; stable for the life of the match. */
  id: number;
  transform: TransformView;
  tag: PlayerTagView;
  condition: ConditionView;
  carry: { ball: number | null };
  action: ActionView;
  cooldowns: CooldownsView;
  trail: { points: TrailPointView[] };
  stats: StatsView;
}

export interface BallStateView {
  live: boolean;
  armed: boolean;
  rush: boolean;
  canOut: boolean;
  team: TeamId | null;
  touched: boolean;
  validAttempt: boolean;
  warningIssued: boolean;
}

export interface BallView {
  id: number;
  transform: TransformView;
  tag: { spin: number; spinV: number; bob: number; age: number };
  state: BallStateView;
  held: { by: number | null };
  trail: { points: TrailPointView[] };
}

export interface ParticleView {
  x: number;
  y: number;
  size: number;
  color: string;
  life: number;
  max: number;
  type: 'spark' | 'dust' | 'ring' | 'confetti';
  spin: number;
}

export interface FloaterView {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number | null;
}

export interface GlassesView {
  x: number;
  y: number;
  rot: number;
}

export interface HudPlayerView {
  id: number;
  number: number;
  alive: boolean;
  human: boolean;
  you: boolean;
  entering: boolean;
}

export interface TeamLists<T> {
  blue: T[];
  red: T[];
}

export interface Frame {
  phase: Phase;
  phaseElapsed: number;
  time: number;
  clock: { sim: number };
  feedback: { shake: number; flash: number; slowmo: number };
  score: Score;
  set: number;
  difficulty: { id: DifficultyId; label: string };
  lineup: { humanSlot: number; customName: string };
  lastSetWinner: TeamId | null;
  matchWinner: TeamId | null;
  roster: TeamLists<HudPlayerView>;
  outQueue: TeamLists<HudPlayerView>;
  shot: { team: TeamId | null; timeLeft: number };
  suddenDeath: boolean;
  rushActive: boolean;
  setElapsed: number;
  players: PlayerView[];
  balls: BallView[];
  particles: ParticleView[];
  floaters: FloaterView[];
  glasses: GlassesView[];
  connection?: 'connecting' | 'online' | 'offline' | 'spectating' | 'error';
}

/** The HUD view model handed to the renderer; adds presentation-only fields. */
export interface Hud extends Frame {
  /** Larger type + shorter hints for phones. */
  compact: boolean;
}

export function toHud(frame: Frame, compact: boolean): Hud {
  return { ...frame, compact };
}
