export type TeamId = 'blue' | 'red';
export type DifficultyId = 'rookie' | 'pro' | 'allstar';

/** High-level phase mirrored from the XState chart for rendering. */
export type Phase = 'menu' | 'countdown' | 'playing' | 'setover' | 'matchover' | 'paused';

export interface Score {
  blue: number;
  red: number;
}

export interface Difficulty {
  id: DifficultyId;
  label: string;
  /** Seconds of hesitation before the AI trusts a fresh target. */
  reaction: number;
  aimError: number;
  catchChance: number;
  dodge: number;
  speed: number;
  dashChance: number;
  throwDelay: number;
  lead: number;
  wantCatch: number;
}

export interface TeamPalette {
  name: string;
  main: string;
  light: string;
  dark: string;
  deep: string;
  glow: string;
  tint: string;
}

export interface RosterEntry {
  name: string;
  number: number;
  human: boolean;
  /** Norris wears the spectacles that can be knocked off. */
  glasses?: boolean;
}

/** Per-frame movement / action request handed to a player. */
export interface Intent {
  mx: number;
  my: number;
  aim: number;
  charge: boolean;
  release: boolean;
  dash: boolean;
  catch: boolean;
}

export interface HudPlayer {
  id: string;
  number: number;
  alive: boolean;
  human: boolean;
  entering: boolean;
}

export interface ShotClock {
  team: TeamId | null;
  timeLeft: number;
}

/** Everything the renderer needs to know about the match itself. */
export interface Hud {
  phase: Phase;
  /** Seconds spent in the current phase — drives countdown + banners. */
  phaseElapsed: number;
  score: Score;
  set: number;
  difficulty: Difficulty;
  lastSetWinner: TeamId | null;
  matchWinner: TeamId | null;
  roster: Record<TeamId, HudPlayer[]>;
  outQueue: Record<TeamId, HudPlayer[]>;
  shot: ShotClock;
  suddenDeath: boolean;
  rushActive: boolean;
  setElapsed: number;
  /** Larger type + shorter hints for phones. */
  compact: boolean;
}
