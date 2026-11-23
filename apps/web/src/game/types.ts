export type TeamId = 'blue' | 'red';
export type DifficultyId = 'rookie' | 'pro' | 'allstar';

/** Top-level phase, owned by the Rust `phase` resource. */
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
