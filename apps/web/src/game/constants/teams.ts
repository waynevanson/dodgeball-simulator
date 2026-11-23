import type { TeamId, TeamPalette } from '../types';

export const TEAMS: Record<TeamId, TeamPalette> = {
  blue: {
    name: 'Blue',
    main: '#5b93ff',
    light: '#c3d5ff',
    dark: '#1d3f8f',
    deep: '#0b1a3a',
    glow: 'rgba(91, 147, 255, 0.55)',
    tint: 'rgba(91, 147, 255, 0.055)',
  },
  red: {
    name: 'Red',
    main: '#ff5f73',
    light: '#ffc2ca',
    dark: '#8f1b2d',
    deep: '#3d0b14',
    glow: 'rgba(255, 95, 115, 0.55)',
    tint: 'rgba(255, 95, 115, 0.055)',
  },
};
