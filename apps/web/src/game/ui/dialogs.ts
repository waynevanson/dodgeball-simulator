import type { Frame } from '../frame';
import { WINS_NEEDED } from '../constants/rules';
import { VIEW_W } from '../constants/view';
import { pauseLayout, resultsLayout } from './layout';
import { button, label, panel } from './shapes';
import { FONT, INK, INK_DIM, INK_FAINT, MONO } from './state';
import type { UiState } from './state';

export function drawPause(ctx: CanvasRenderingContext2D, ui: UiState): void {
  const layout = pauseLayout();
  panel(ctx, layout.panel);
  const cx = VIEW_W / 2;
  label(ctx, 'TIME OUT', cx, 250, `800 11px ${MONO}`, INK_FAINT);
  label(ctx, 'PAUSED', cx, 294, `900 40px ${FONT}`, INK);
  button(ctx, layout.resume, 'RESUME', 'cta', false, ui.hover === 'resume');
  button(ctx, layout.restart, 'RESTART MATCH', 'ghost', false, ui.hover === 'restart');
  button(ctx, layout.menu, 'MAIN MENU', 'ghost', false, ui.hover === 'menu');
  label(ctx, 'Press Esc to get back in.', cx, 500, `500 11px ${FONT}`, INK_FAINT);
}

export function drawResults(ctx: CanvasRenderingContext2D, frame: Frame, ui: UiState): void {
  const layout = resultsLayout();
  const win =
    (frame.matchWinner ?? (frame.score.blue > frame.score.red ? 'blue' : 'red')) === 'blue';
  const cx = VIEW_W / 2;

  panel(ctx, layout.panel);
  label(ctx, 'FINAL WHISTLE', cx, 212, `800 11px ${MONO}`, INK_FAINT);
  label(ctx, win ? 'VICTORY' : 'DEFEAT', cx, 262, `900 48px ${FONT}`, win ? '#8fb6ff' : '#ff8a9a');
  label(
    ctx,
    `${frame.score.blue} \u2013 ${frame.score.red}`,
    cx,
    314,
    `800 34px ${MONO}`,
    INK,
  );
  label(
    ctx,
    win ? 'Blue team takes the series. Nice dodging.' : 'Red team takes the series. Run it back?',
    cx,
    348,
    `500 12px ${FONT}`,
    INK_DIM,
  );
  button(ctx, layout.again, 'PLAY AGAIN', 'cta', false, ui.hover === 'again');
  button(ctx, layout.menu, 'MAIN MENU', 'ghost', false, ui.hover === 'menu');
  label(
    ctx,
    `First to ${WINS_NEEDED} sets \u00b7 ${frame.difficulty.label}`,
    cx,
    522,
    `700 10px ${MONO}`,
    INK_FAINT,
  );
}
