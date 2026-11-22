import { VIEW_W } from '../constants/view';
import { TAU } from '../math';
import { rulesLayout } from './layout';
import { button, label, panel, wrap } from './shapes';
import { FONT, INK, INK_DIM, INK_FAINT, MONO } from './state';
import type { UiState } from './state';

export const RULES: Array<[string, string]> = [
  ['Six balls, three per team.', 'They start on the centre line, 1.5m apart (Rule 12).'],
  ['Opening rush.', 'Everyone starts on the back line. Sprint in, take your three balls, and get out (Rule 13). You may touch the centre line only during the rush.'],
  ['Arm your ball.', 'A ball picked up in the rush must fully cross the 3m attack line before it can get anyone out (Rule 13.7.1).'],
  ['A hit is an out.', 'A live, armed ball that touches any part of a player eliminates them (Rule 19).'],
  ['Catch = thrower out.', 'Catch a live ball and the thrower is eliminated; your first queued teammate re-enters over the back line (Rules 23.4, 25).'],
  ['Catching is for empty hands.', 'With a ball in hand your timed press is a block: the ball deflects and stays live (Rule 21.2).'],
  ['Ball advantage.', 'The team holding the advantage has 10 seconds to make an attempt. Fail and every ball they hold is forfeited to the other team (Rule 17.3).'],
  ['Stay in your half.', 'Crossing the centre line is out of bounds (Rule 26.5); out players queue behind their back line.'],
  ['Simultaneous all-out voids the set', 'and it is replayed with no point (Rule 29.3.2).'],
  ['Sets.', 'Eliminate the whole opposition to win a set. First to 3 sets wins the match (Rule 10).'],
  ['Sudden death.', 'After two minutes of set time, blocking is no longer in effect (Rule 9.7.1).'],
];

export function drawRules(ctx: CanvasRenderingContext2D, ui: UiState): void {
  const layout = rulesLayout();
  panel(ctx, layout.panel);
  const cx = VIEW_W / 2;

  label(ctx, 'DODGEBALL VICTORIA \u00b7 WDBF', cx, 74, `800 11px ${MONO}`, INK_FAINT);
  label(ctx, 'RULES', cx, 106, `900 34px ${FONT}`, INK);
  label(
    ctx,
    'Foam Playing Format, implemented as a 6v6 arcade simulation.',
    cx,
    136,
    `500 12px ${FONT}`,
    INK_DIM,
  );

  const left = layout.panel.x + 30;
  const columnGap = 26;
  const columnWidth = (layout.panel.w - 60 - columnGap) / 2;
  const columns = [RULES.slice(0, 6), RULES.slice(6)];

  columns.forEach((column, columnIndex) => {
    let y = 172;
    const x = left + columnIndex * (columnWidth + columnGap);

    for (const [title, body] of column) {
      ctx.beginPath();
      ctx.arc(x + 3, y - 1, 2.2, 0, TAU);
      ctx.fillStyle = '#5b93ff';
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 11.5px ${FONT}`;
      ctx.fillStyle = INK;
      ctx.fillText(title, x + 12, y);

      ctx.font = `500 11px ${FONT}`;
      ctx.fillStyle = INK_DIM;
      let lineY = y + 14;
      for (const line of wrap(ctx, body, columnWidth - 14)) {
        ctx.fillText(line, x + 12, lineY);
        lineY += 13.5;
      }
      y = lineY + 10;
    }
  });

  ctx.textAlign = 'center';
  ctx.font = `500 10.5px ${FONT}`;
  ctx.fillStyle = 'rgba(100, 116, 139, 0.9)';
  const note =
    "Not modelled: uniforms, cards, timeouts, ball retrievers, referees and other administrative rules. Missed throws are logged as warnings rather than outs, matching the referee's discretion in Rule 16.3.";
  wrap(ctx, note, layout.panel.w - 80).forEach((line, index) => {
    ctx.fillText(line, cx, 508 + index * 14);
  });

  button(ctx, layout.back, 'GOT IT', 'cta', false, ui.hover === 'back');
}
