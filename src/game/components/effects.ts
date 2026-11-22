import type { ParticleType } from './shared';

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
