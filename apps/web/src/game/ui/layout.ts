import { VIEW_W } from '../constants/view';
import { MENU_PANEL, PAUSE_PANEL, RESULTS_PANEL, RULES_PANEL } from './state';

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

export function menuLayout(): {
  panel: Rect;
  name: Rect;
  play: Rect;
  rules: Rect;
} {
  const cx = VIEW_W / 2;
  return {
    panel: MENU_PANEL,
    name: { x: cx - 170, y: 366, w: 340, h: 36 },
    play: centered(cx, 442, 200, 50),
    rules: centered(cx, 512, 200, 22),
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
