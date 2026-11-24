import type { Frame } from '../frame';
import type { Input } from '../input';
import { VIEW_H, VIEW_W } from '../constants/view';
import { centered, menuLayout, pauseLayout, resultsLayout, rulesLayout } from './layout';
import type { Hotspot, Rect } from './layout';
import { CATCH_BTN, DASH_BTN, STICK, THROW_BTN, TOP_X, TOP_Y } from './state';
import type { UiState } from './state';

export function isPortrait(): boolean {
  return typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
}

export function showingControls(frame: Frame, ui: UiState, input: Input): boolean {
  return (
    input.usingTouch &&
    ui.screen === null &&
    (frame.phase === 'playing' || frame.phase === 'countdown')
  );
}

export function showingTopBar(frame: Frame, ui: UiState): boolean {
  return ui.screen === null && (frame.phase === 'playing' || frame.phase === 'countdown');
}

export function topLayout(): Array<{ id: string; rect: Rect }> {
  const ids = ['pause', 'fullscreen', 'sound'];
  return ids.map((id, index) => ({
    id,
    rect: { x: TOP_X[index] - 16, y: TOP_Y - 16, w: 32, h: 32 },
  }));
}

export function touchLayout(): Array<{ id: string; rect: Rect }> {
  return [
    {
      id: 'stick',
      rect: { x: STICK.x - STICK.r, y: STICK.y - STICK.r, w: STICK.r * 2, h: STICK.r * 2 },
    },
    {
      id: 'throw',
      rect: {
        x: THROW_BTN.x - THROW_BTN.r,
        y: THROW_BTN.y - THROW_BTN.r,
        w: THROW_BTN.r * 2,
        h: THROW_BTN.r * 2,
      },
    },
    {
      id: 'dash',
      rect: { x: DASH_BTN.x - DASH_BTN.r, y: DASH_BTN.y - DASH_BTN.r, w: DASH_BTN.r * 2, h: DASH_BTN.r * 2 },
    },
    {
      id: 'catch',
      rect: {
        x: CATCH_BTN.x - CATCH_BTN.r,
        y: CATCH_BTN.y - CATCH_BTN.r,
        w: CATCH_BTN.r * 2,
        h: CATCH_BTN.r * 2,
      },
    },
  ];
}

export function rotateLayout(): { panel: Rect; play: Rect } {
  return {
    panel: { x: 0, y: 0, w: VIEW_W, h: VIEW_H },
    play: centered(VIEW_W / 2, 430, 220, 46),
  };
}

export function hotspots(frame: Frame, ui: UiState, input: Input): Hotspot[] {
  if (input.usingTouch && isPortrait() && !ui.portraitOk) {
    return [{ id: 'portrait-ok', rect: rotateLayout().play }];
  }

  const found: Hotspot[] = [];
  switch (ui.screen) {
    case 'menu': {
      const layout = menuLayout(frame.lineup.customName);
      if (!frame.online) {
        for (const button of layout.difficulty) {
          found.push({ id: `difficulty:${button.id}`, rect: button.rect });
        }
        for (const button of layout.lineup) {
          found.push({ id: `lineup:${button.slot}`, rect: button.rect });
        }
      }
      found.push({ id: 'name', rect: layout.name });
      found.push({ id: 'play', rect: layout.play });
      found.push({ id: 'rules', rect: layout.rules });
      break;
    }
    case 'pause': {
      const layout = pauseLayout();
      found.push({ id: 'resume', rect: layout.resume });
      found.push({ id: 'restart', rect: layout.restart });
      found.push({ id: 'menu', rect: layout.menu });
      break;
    }
    case 'results': {
      const layout = resultsLayout();
      found.push({ id: 'again', rect: layout.again });
      if (!frame.online) found.push({ id: 'menu', rect: layout.menu });
      break;
    }
    case 'rules': {
      found.push({ id: 'back', rect: rulesLayout().back });
      break;
    }
    default:
      break;
  }

  if (showingTopBar(frame, ui)) {
    found.push(...topLayout().filter((spot) => !frame.online || spot.id !== 'pause'));
  }
  if (showingControls(frame, ui, input)) found.push(...touchLayout());
  return found;
}

export function hit(
  frame: Frame,
  ui: UiState,
  input: Input,
  x: number,
  y: number,
): Hotspot | null {
  for (const spot of hotspots(frame, ui, input)) {
    const { rect } = spot;
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return spot;
  }
  return null;
}
