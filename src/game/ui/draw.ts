import type { World } from '../ecs';
import { drawPause, drawResults } from './dialogs';
import { isPortrait, showingControls, showingTopBar } from './hit';
import { drawMenu } from './menu';
import { drawRules } from './rules';
import { overlay } from './shapes';
import { drawTopBar } from './topbar';
import { drawRotate, drawTouchControls } from './touch';

export function drawUi(ctx: CanvasRenderingContext2D, world: World): void {
  const ui = world.resource('ui');
  const input = world.resource('input');

  if (ui.screen !== null) {
    overlay(ctx);
    switch (ui.screen) {
      case 'menu':
        drawMenu(ctx, world, ui);
        break;
      case 'pause':
        drawPause(ctx, ui);
        break;
      case 'results':
        drawResults(ctx, world, ui);
        break;
      case 'rules':
        drawRules(ctx, ui);
        break;
    }
  }

  if (showingTopBar(world, ui)) drawTopBar(ctx, ui);
  if (showingControls(world, ui)) drawTouchControls(ctx, input);
  if (input.usingTouch && isPortrait() && !ui.portraitOk) drawRotate(ctx, ui);
}
