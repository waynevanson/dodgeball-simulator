import type { Difficulty, DifficultyId } from '../types';

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  rookie: {
    id: 'rookie',
    label: 'Rookie',
    reaction: 0.46,
    aimError: 0.2,
    catchChance: 0.12,
    dodge: 0.5,
    speed: 0.86,
    dashChance: 0.15,
    throwDelay: 0.5,
    lead: 0.35,
    wantCatch: 0.55,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    reaction: 0.27,
    aimError: 0.11,
    catchChance: 0.34,
    dodge: 0.82,
    speed: 0.95,
    dashChance: 0.45,
    throwDelay: 0.28,
    lead: 0.62,
    wantCatch: 0.7,
  },
  allstar: {
    id: 'allstar',
    label: 'All-Star',
    reaction: 0.15,
    aimError: 0.055,
    catchChance: 0.55,
    dodge: 0.97,
    speed: 1.0,
    dashChance: 0.72,
    throwDelay: 0.15,
    lead: 0.85,
    wantCatch: 0.9,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['rookie', 'pro', 'allstar'];
