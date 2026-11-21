import type {
  Difficulty,
  DifficultyId,
  RosterEntry,
  TeamId,
  TeamPalette,
} from './types';

// The whole game is authored in a fixed 1280x720 logical space and scaled to
// the canvas, so every constant below is in "world pixels".
export const VIEW_W = 1280;
export const VIEW_H = 720;

export interface CourtRect {
  x: number;
  y: number;
  w: number;
  h: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
}

const courtBase = { x: 42, y: 116, w: 1196, h: 544 };

/**
 * Playing court: 18m x 9m (VDL Rule 1.1) mapped onto 1196 x 544 px.
 * 1 metre ~= 66.4px, which drives the attack line and 1m "valid attempt" checks.
 */
export const COURT: CourtRect = {
  ...courtBase,
  right: courtBase.x + courtBase.w,
  bottom: courtBase.y + courtBase.h,
  cx: courtBase.x + courtBase.w / 2,
  cy: courtBase.y + courtBase.h / 2,
};

export const PX_PER_METRE = COURT.w / 18;

export const PLAYER_RADIUS = 17;
export const BALL_RADIUS = 10;

export const ROSTER = 6;
export const WINS_NEEDED = 3;
export const BALL_COUNT = 6;
export const PLAYER_NAME_MAX = 12;
export const DEFAULT_CUSTOM_NAME = 'Crispy';

/**
 * Foam Playing Format (VDL Rules 1.3.4, 2.1.2, 12.1.2):
 *  - six balls, three placed on each team's side of the centre line
 *  - attack line 3m back from the centre line
 *  - a ball picked up in the opening rush must fully cross the attack line
 *    before it is a live ball
 */
export const ATTACK_DIST = Math.round(3 * PX_PER_METRE); // ~199px
export const BALL_MARK_SPACING = Math.round(1.5 * PX_PER_METRE); // ~100px
export const NEAR_MISS = Math.round(1 * PX_PER_METRE); // ~66px (Rule 16.1)
export const RUSH_CROSS = 26; // how far over the line you may step during the rush

/** Rule 17.3: the team with advantage has 10s to make an attempt. */
export const SHOT_CLOCK = 10;
export const SHOT_CLOCK_WARN = 5;

/** Rule 9.7.1: sudden death disables the blocking rule. */
export const SUDDEN_DEATH_AFTER = 120;

/** Rule 25.2 / 25.3: entering players cannot be hit out or make plays. */
export const ENTER_GRACE = 0.7;

export const COUNTDOWN_MS = 3100;
export const SET_BREAK_MS = 3000;
export const COUNTDOWN_SECONDS = COUNTDOWN_MS / 1000;

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

export const PHYS = {
  speed: 270,
  dashSpeed: 790,
  dashTime: 0.16,
  dashCd: 1.05,
  chargeTime: 0.6,
  throwMin: 540,
  throwMax: 1330,
  throwCd: 0.26,
  catchWindow: 0.32,
  catchCd: 0.95,
  ballDrag: 1.0,
  ballDragFree: 2.4,
  ballLiveSpeed: 320,
  wallDamp: 0.3,
  blockRetain: 0.8,
  blockMinSpeed: 380,
} as const;

/** The fixed blue lineup. The last slot is the player's custom name. */
export const BLUE_LINEUP: RosterEntry[] = [
  { name: 'Norris', number: 1, human: false, glasses: true },
  { name: 'Wayne', number: 2, human: false },
  { name: 'Alex', number: 3, human: false },
  { name: 'Alycia', number: 4, human: false },
  { name: 'Kurt', number: 5, human: false },
  { name: DEFAULT_CUSTOM_NAME, number: 6, human: false },
];

export const CUSTOM_SLOT = BLUE_LINEUP.length - 1;

/** Ordinary first names used to generate the red team each page load. */
const RED_NAMES = [
  'Jordan',
  'Maya',
  'Ethan',
  'Priya',
  'Lucas',
  'Chloe',
  'Marcus',
  'Sofia',
  'Noah',
  'Grace',
  'Liam',
  'Amara',
  'Oliver',
  'Nina',
  'Caleb',
  'Ruby',
  'Theo',
  'Isla',
  'Isaac',
  'Tara',
] as const;

function shuffled<T>(values: readonly T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomRedLineup(): RosterEntry[] {
  const names = shuffled(RED_NAMES).slice(0, ROSTER);
  const numbers = shuffled(Array.from({ length: 90 }, (_, i) => i + 10)).slice(0, ROSTER);
  return names.map((name, index) => ({ name, number: numbers[index], human: false }));
}

export const ROSTER_DATA: Record<TeamId, RosterEntry[]> = {
  blue: BLUE_LINEUP,
  red: randomRedLineup(),
};

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
