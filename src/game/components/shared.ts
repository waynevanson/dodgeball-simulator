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
