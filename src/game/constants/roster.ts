import type { RosterEntry, TeamId } from '../types';

export const ROSTER = 6;

export const PLAYER_NAME_MAX = 12;

export const DEFAULT_CUSTOM_NAME = 'Crispy';

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
export const RED_NAMES = [
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

export function shuffled<T>(values: readonly T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function randomRedLineup(): RosterEntry[] {
  const names = shuffled(RED_NAMES).slice(0, ROSTER);
  const numbers = shuffled(Array.from({ length: 90 }, (_, i) => i + 10)).slice(0, ROSTER);
  return names.map((name, index) => ({ name, number: numbers[index], human: false }));
}

export const ROSTER_DATA: Record<TeamId, RosterEntry[]> = {
  blue: BLUE_LINEUP,
  red: randomRedLineup(),
};
