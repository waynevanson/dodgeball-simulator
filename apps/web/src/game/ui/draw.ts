import type { Frame } from '../frame';
import type { Input } from '../input';
import { drawPause, drawResults } from './dialogs';
import { isPortrait, showingControls, showingTopBar } from './hit';
import { drawMenu } from './menu';
import { drawRules } from './rules';
import { overlay } from './shapes';
import { drawTopBar } from './topbar';
import { drawRotate, drawTouchControls } from './touch';
import type { UiState } from './state';

export function drawUi(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  ui: UiState,
  input: Input,
): void {
  if (ui.screen !== null) {
    overlay(ctx);
    switch (ui.screen) {
      case 'menu':
        drawMenu(ctx, frame, ui, input);
        break;
      case 'pause':
        drawPause(ctx, ui);
        break;
      case 'results':
        drawResults(ctx, frame, ui);
        break;
      case 'rules':
        drawRules(ctx, ui);
        break;
    }
  }

  if (showingTopBar(frame, ui)) drawTopBar(ctx, ui);
  if (showingControls(frame, ui, input)) drawTouchControls(ctx, input);
  if (input.usingTouch && isPortrait() && !ui.portraitOk) drawRotate(ctx, ui);
}
