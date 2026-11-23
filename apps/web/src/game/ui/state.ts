import type { DifficultyId } from '../types';
import type { Rect } from './layout';

/**
 * The whole interface, drawn with the 2D canvas API and hit-tested in the same
 * 1280x720 logical space as the court. No DOM widgets, no CSS: a "button" is a
 * rectangle plus an id, and a pointer press is looked up against the rectangles
 * the renderer just drew.
 *
 * Layout is shared: `menuLayout()` etc. are used by both the renderer and the
 * input system, so what you see is exactly what you can click.
 */

export type ScreenId = 'menu' | 'pause' | 'results' | 'rules';

export interface UiState {
  screen: ScreenId | null;
  editingName: boolean;
  draft: string;
  portraitOk: boolean;
  hover: string | null;
  /** Settings changed; the boot layer persists them to localStorage. */
  dirty: boolean;
  stickId: number | null;
  stickCx: number;
  stickCy: number;
  throwId: number | null;
}

export const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

export const INK = '#e8eefc';

export const INK_DIM = '#9aa8c2';

export const INK_FAINT = '#64748b';

export const PANEL_FILL = 'rgba(11, 16, 27, 0.94)';

export const PANEL_LINE = 'rgba(148, 163, 184, 0.18)';

export const DIFFICULTY_ORDER: DifficultyId[] = ['rookie', 'pro', 'allstar'];

export const DIFFICULTY_LABELS: Record<DifficultyId, string> = {
  rookie: 'Rookie',
  pro: 'Pro',
  allstar: 'All-star',
};

export const MENU_PANEL: Rect = { x: 300, y: 40, w: 680, h: 640 };

export const PAUSE_PANEL: Rect = { x: 420, y: 200, w: 440, h: 320 };

export const RESULTS_PANEL: Rect = { x: 400, y: 160, w: 480, h: 400 };

export const RULES_PANEL: Rect = { x: 250, y: 40, w: 780, h: 560 };

export const STICK = { x: 150, y: 552, r: 86, knob: 36 };

export const THROW_BTN = { x: 1120, y: 556, r: 62 };

export const DASH_BTN = { x: 1000, y: 646, r: 34 };

export const CATCH_BTN = { x: 1190, y: 630, r: 34 };

export const TOP_Y = 94;

export const TOP_X = [1142, 1186, 1230];

export function createUi(): UiState {
  return {
    screen: 'menu',
    editingName: false,
    draft: '',
    portraitOk: false,
    hover: null,
    dirty: false,
    stickId: null,
    stickCx: STICK.x,
    stickCy: STICK.y,
    throwId: null,
  };
}
