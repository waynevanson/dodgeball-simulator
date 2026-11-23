import { BLUE_LINEUP } from '../constants/roster';
import { VIEW_W } from '../constants/view';
import type { DifficultyId } from '../types';
import { DIFFICULTY_ORDER, MENU_PANEL, PAUSE_PANEL, RESULTS_PANEL, RULES_PANEL } from './state';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Hotspot {
  id: string;
  rect: Rect;
}

// --------------------------------------------------------------------- layout

export function centered(cx: number, y: number, w: number, h: number): Rect {
  return { x: cx - w / 2, y, w, h };
}

export function menuLayout(lineupName: string): {
  panel: Rect;
  difficulty: Array<{ id: DifficultyId; rect: Rect }>;
  lineup: Array<{ slot: number; rect: Rect }>;
  name: Rect;
  play: Rect;
  rules: Rect;
  nameValue: string;
} {
  const cx = VIEW_W / 2;
  const difficultyWidth = 124;
  const difficultyGap = 10;
  const diffStart = cx - (difficultyWidth * 3 + difficultyGap * 2) / 2;
  const lineupWidth = 96;
  const lineupGap = 8;
  const lineupStart = cx - (lineupWidth * 6 + lineupGap * 5) / 2;

  return {
    panel: MENU_PANEL,
    difficulty: DIFFICULTY_ORDER.map((id, index) => ({
      id,
      rect: {
        x: diffStart + index * (difficultyWidth + difficultyGap),
        y: 236,
        w: difficultyWidth,
        h: 34,
      },
    })),
    lineup: BLUE_LINEUP.map((_, slot) => ({
      slot,
      rect: {
        x: lineupStart + slot * (lineupWidth + lineupGap),
        y: 304,
        w: lineupWidth,
        h: 30,
      },
    })),
    name: { x: cx - 170, y: 366, w: 340, h: 36 },
    play: centered(cx, 442, 200, 50),
    rules: centered(cx, 512, 200, 22),
    nameValue: lineupName,
  };
}

export function pauseLayout(): { panel: Rect; resume: Rect; restart: Rect; menu: Rect } {
  const cx = VIEW_W / 2;
  return {
    panel: PAUSE_PANEL,
    resume: centered(cx, 330, 240, 46),
    restart: centered(cx, 388, 240, 38),
    menu: centered(cx, 436, 240, 38),
  };
}

export function resultsLayout(): { panel: Rect; again: Rect; menu: Rect } {
  const cx = VIEW_W / 2;
  return {
    panel: RESULTS_PANEL,
    again: centered(cx, 390, 240, 46),
    menu: centered(cx, 448, 240, 38),
  };
}

export function rulesLayout(): { panel: Rect; back: Rect } {
  return { panel: RULES_PANEL, back: centered(VIEW_W / 2, 546, 200, 38) };
}
