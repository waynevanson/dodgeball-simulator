import type { EcsWorld, System } from '../ecs/core';
import { sfx } from './audio';
import {
  BLUE_LINEUP,
  CUSTOM_SLOT,
  DEFAULT_CUSTOM_NAME,
  DIFFICULTIES,
  PLAYER_NAME_MAX,
  VIEW_H,
  VIEW_W,
  WINS_NEEDED,
} from './constants';
import type { Input } from './input';
import { send } from './match';
import { roundRect, TAU } from './math';
import { setLineup } from './spawn';
import type { DifficultyId } from './types';

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

declare module '../ecs/core' {
  interface ResourceMap {
    ui: UiState;
  }
}

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

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

const INK = '#e8eefc';
const INK_DIM = '#9aa8c2';
const INK_FAINT = '#64748b';
const PANEL_FILL = 'rgba(11, 16, 27, 0.94)';
const PANEL_LINE = 'rgba(148, 163, 184, 0.18)';

const DIFFICULTY_ORDER: DifficultyId[] = ['rookie', 'pro', 'allstar'];
const DIFFICULTY_LABELS: Record<DifficultyId, string> = {
  rookie: 'Rookie',
  pro: 'Pro',
  allstar: 'All-star',
};

const MENU_PANEL: Rect = { x: 300, y: 40, w: 680, h: 640 };
const PAUSE_PANEL: Rect = { x: 420, y: 200, w: 440, h: 320 };
const RESULTS_PANEL: Rect = { x: 400, y: 160, w: 480, h: 400 };
const RULES_PANEL: Rect = { x: 250, y: 40, w: 780, h: 560 };

const STICK = { x: 150, y: 552, r: 86, knob: 36 };
const THROW_BTN = { x: 1120, y: 556, r: 62 };
const DASH_BTN = { x: 1000, y: 646, r: 34 };
const CATCH_BTN = { x: 1190, y: 630, r: 34 };

const TOP_Y = 94;
const TOP_X = [1142, 1186, 1230];

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

// --------------------------------------------------------------------- layout

function centered(cx: number, y: number, w: number, h: number): Rect {
  return { x: cx - w / 2, y, w, h };
}

function menuLayout(lineupName: string): {
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

function pauseLayout(): { panel: Rect; resume: Rect; restart: Rect; menu: Rect } {
  const cx = VIEW_W / 2;
  return {
    panel: PAUSE_PANEL,
    resume: centered(cx, 330, 240, 46),
    restart: centered(cx, 388, 240, 38),
    menu: centered(cx, 436, 240, 38),
  };
}

function resultsLayout(): { panel: Rect; again: Rect; menu: Rect } {
  const cx = VIEW_W / 2;
  return {
    panel: RESULTS_PANEL,
    again: centered(cx, 390, 240, 46),
    menu: centered(cx, 448, 240, 38),
  };
}

function rulesLayout(): { panel: Rect; back: Rect } {
  return { panel: RULES_PANEL, back: centered(VIEW_W / 2, 546, 200, 38) };
}

function topLayout(): Array<{ id: string; rect: Rect }> {
  const ids = ['pause', 'fullscreen', 'sound'];
  return ids.map((id, index) => ({
    id,
    rect: { x: TOP_X[index] - 16, y: TOP_Y - 16, w: 32, h: 32 },
  }));
}

function touchLayout(): Array<{ id: string; rect: Rect }> {
  return [
    { id: 'stick', rect: { x: STICK.x - STICK.r, y: STICK.y - STICK.r, w: STICK.r * 2, h: STICK.r * 2 } },
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

function rotateLayout(): { panel: Rect; play: Rect } {
  return {
    panel: { x: 0, y: 0, w: VIEW_W, h: VIEW_H },
    play: centered(VIEW_W / 2, 430, 220, 46),
  };
}

function isPortrait(): boolean {
  return typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
}

function showingControls(world: EcsWorld, ui: UiState): boolean {
  const phase = world.resource('phase').id;
  return (
    world.resource('input').usingTouch &&
    ui.screen === null &&
    (phase === 'playing' || phase === 'countdown')
  );
}

function showingTopBar(world: EcsWorld, ui: UiState): boolean {
  const phase = world.resource('phase').id;
  return ui.screen === null && (phase === 'playing' || phase === 'countdown');
}

export function hotspots(world: EcsWorld, ui: UiState): Hotspot[] {
  if (world.resource('input').usingTouch && isPortrait() && !ui.portraitOk) {
    return [{ id: 'portrait-ok', rect: rotateLayout().play }];
  }

  const found: Hotspot[] = [];
  switch (ui.screen) {
    case 'menu': {
      const layout = menuLayout(world.resource('lineup').customName);
      for (const button of layout.difficulty) {
        found.push({ id: `difficulty:${button.id}`, rect: button.rect });
      }
      for (const button of layout.lineup) {
        found.push({ id: `lineup:${button.slot}`, rect: button.rect });
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
      found.push({ id: 'menu', rect: layout.menu });
      break;
    }
    case 'rules': {
      found.push({ id: 'back', rect: rulesLayout().back });
      break;
    }
    default:
      break;
  }

  if (showingTopBar(world, ui)) found.push(...topLayout());
  if (showingControls(world, ui)) found.push(...touchLayout());
  return found;
}

function hit(world: EcsWorld, ui: UiState, x: number, y: number): Hotspot | null {
  for (const spot of hotspots(world, ui)) {
    const { rect } = spot;
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return spot;
  }
  return null;
}

// --------------------------------------------------------------------- input

function commitName(world: EcsWorld, ui: UiState): void {
  if (!ui.editingName) return;
  ui.editingName = false;
  const lineup = world.resource('lineup');
  setLineup(world, lineup.humanSlot, ui.draft);
  ui.dirty = true;
}

function act(world: EcsWorld, ui: UiState, id: string): void {
  const match = world.resource('match');
  const lineup = world.resource('lineup');

  if (id.startsWith('difficulty:')) {
    match.difficulty = id.slice('difficulty:'.length) as DifficultyId;
    ui.dirty = true;
    sfx.ui();
    return;
  }

  if (id.startsWith('lineup:')) {
    const slot = Number(id.slice('lineup:'.length));
    setLineup(world, slot, lineup.customName);
    ui.dirty = true;
    sfx.ui();
    return;
  }

  switch (id) {
    case 'name':
      ui.editingName = true;
      ui.draft = lineup.customName === DEFAULT_CUSTOM_NAME ? '' : lineup.customName;
      sfx.ui();
      break;
    case 'play':
    case 'again':
    case 'restart':
      commitName(world, ui);
      sfx.resume();
      if (world.resource('input').usingTouch) void toggleFullscreen();
      send(world, { type: 'start', difficulty: match.difficulty });
      break;
    case 'resume':
      commitName(world, ui);
      sfx.resume();
      send(world, { type: 'resume' });
      break;
    case 'menu':
      commitName(world, ui);
      sfx.ui();
      send(world, { type: 'menu' });
      break;
    case 'rules':
      ui.screen = 'rules';
      sfx.ui();
      break;
    case 'back':
      ui.screen = 'menu';
      sfx.ui();
      break;
    case 'pause':
      send(world, { type: 'pause' });
      sfx.ui();
      break;
    case 'sound':
      sfx.setMuted(!sfx.muted);
      ui.dirty = true;
      sfx.ui();
      break;
    case 'fullscreen':
      void toggleFullscreen();
      sfx.ui();
      break;
    case 'portrait-ok':
      ui.portraitOk = true;
      break;
    default:
      break;
  }
}

export function uiSystem(): System {
  return {
    name: 'ui-input',
    run({ world }) {
      const input = world.resource('input');
      const ui = world.resource('ui');

      // Text entry is exclusive: while typing a name, keys are not shortcuts.
      if (ui.editingName) {
        for (const char of input.typed) {
          if (ui.draft.length < PLAYER_NAME_MAX) ui.draft += char;
        }
        if (input.pressed('Backspace')) ui.draft = ui.draft.slice(0, -1);
        if (input.pressed('Enter') || input.pressed('Escape')) commitName(world, ui);
      }

      ui.hover = null;
      if (!input.usingTouch && input.mouse.used) {
        ui.hover = hit(world, ui, input.mouse.x, input.mouse.y)?.id ?? null;
      }

      for (const sample of input.pointerDowns) {
        if (sample.button !== 0) continue;
        const spot = hit(world, ui, sample.x, sample.y);
        if (!spot) {
          commitName(world, ui);
          continue;
        }

        if (spot.id === 'stick') {
          ui.stickId = sample.id;
          ui.stickCx = STICK.x;
          ui.stickCy = STICK.y;
          input.touch.mx = 0;
          input.touch.my = 0;
          continue;
        }
        if (spot.id === 'throw') {
          ui.throwId = sample.id;
          input.touch.throwDown = true;
          continue;
        }
        if (spot.id === 'dash') {
          input.addTouchAction('dash');
          continue;
        }
        if (spot.id === 'catch') {
          input.addTouchAction('catch');
          continue;
        }

        act(world, ui, spot.id);
      }

      for (const sample of input.pointerMoves) {
        if (ui.stickId !== sample.id) continue;
        let dx = sample.x - ui.stickCx;
        let dy = sample.y - ui.stickCy;
        const len = Math.hypot(dx, dy);
        if (len > STICK.r) {
          dx = (dx / len) * STICK.r;
          dy = (dy / len) * STICK.r;
        }
        if (Math.hypot(dx, dy) < 6) {
          input.touch.mx = 0;
          input.touch.my = 0;
        } else {
          input.touch.mx = dx / STICK.r;
          input.touch.my = dy / STICK.r;
        }
      }

      for (const sample of input.pointerUps) {
        if (ui.stickId === sample.id) {
          ui.stickId = null;
          input.touch.mx = 0;
          input.touch.my = 0;
        }
        if (ui.throwId === sample.id) {
          ui.throwId = null;
          input.touch.throwDown = false;
        }
      }
    },
  };
}

async function toggleFullscreen(): Promise<void> {
  try {
    const app = document.getElementById('app');
    if (!app) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await app.requestFullscreen({ navigationUI: 'hide' });
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (mode: string) => Promise<void>;
      };
      await orientation.lock?.('landscape');
    } catch {
      /* orientation lock is not supported everywhere (iOS) */
    }
  } catch {
    /* fullscreen is best-effort: iOS Safari does not support it */
  }
}

// -------------------------------------------------------------------- render

function panel(ctx: CanvasRenderingContext2D, rect: Rect, radius = 20): void {
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fillStyle = PANEL_FILL;
  ctx.fill();
  ctx.strokeStyle = PANEL_LINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function overlay(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.4, 80, VIEW_W / 2, VIEW_H * 0.4, 760);
  g.addColorStop(0, 'rgba(22, 31, 52, 0.76)');
  g.addColorStop(1, 'rgba(4, 6, 11, 0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = 'center',
): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function button(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  text: string,
  kind: 'cta' | 'ghost' | 'pill',
  active = false,
  hot = false,
): void {
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);

  if (kind === 'cta') {
    const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    g.addColorStop(0, hot ? '#e9f1ff' : '#d9e7ff');
    g.addColorStop(0.45, '#94b9ff');
    g.addColorStop(1, '#5b93ff');
    ctx.fillStyle = g;
    ctx.fill();
    label(
      ctx,
      text,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2 + 1,
      `900 ${Math.round(rect.h * 0.34)}px ${FONT}`,
      '#06101f',
    );
  } else if (kind === 'pill') {
    if (active) {
      const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
      g.addColorStop(0, '#cfe0ff');
      g.addColorStop(1, '#8fb6ff');
      ctx.fillStyle = g;
      ctx.fill();
      label(
        ctx,
        text,
        rect.x + rect.w / 2,
        rect.y + rect.h / 2 + 1,
        `700 ${Math.round(rect.h * 0.38)}px ${FONT}`,
        '#08111f',
      );
    } else {
      ctx.fillStyle = hot ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.05)';
      ctx.fill();
      label(
        ctx,
        text,
        rect.x + rect.w / 2,
        rect.y + rect.h / 2 + 1,
        `700 ${Math.round(rect.h * 0.38)}px ${FONT}`,
        hot ? INK : INK_DIM,
      );
    }
  } else {
    ctx.fillStyle = hot ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.06)';
    ctx.fill();
    ctx.strokeStyle = hot ? 'rgba(148, 163, 184, 0.4)' : PANEL_LINE;
    ctx.lineWidth = 1;
    ctx.stroke();
    label(
      ctx,
      text,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2 + 1,
      `800 ${Math.round(rect.h * 0.3)}px ${FONT}`,
      hot ? INK : INK_DIM,
    );
  }

  ctx.restore();
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawUi(ctx: CanvasRenderingContext2D, world: EcsWorld): void {
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

function drawBrand(ctx: CanvasRenderingContext2D): void {
  const cx = VIEW_W / 2;
  ctx.textBaseline = 'middle';
  ctx.font = `900 52px ${FONT}`;
  const dodgeWidth = ctx.measureText('DODGE').width;
  const ballWidth = ctx.measureText('BALL').width;
  const gap = 10;
  const brandX = cx - (dodgeWidth + ballWidth + gap) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.fillText('DODGE', brandX, 112);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('BALL', brandX + dodgeWidth + gap, 112);
  ctx.textAlign = 'center';

  ctx.font = `800 12px ${MONO}`;
  ctx.fillStyle = INK_DIM;
  ctx.fillText('S I M U L A T O R', cx, 150);
}

function drawMenu(ctx: CanvasRenderingContext2D, world: EcsWorld, ui: UiState): void {
  const lineup = world.resource('lineup');
  const match = world.resource('match');
  const input = world.resource('input');
  const layout = menuLayout(lineup.customName);

  panel(ctx, layout.panel);
  drawBrand(ctx);

  const cx = VIEW_W / 2;
  label(ctx, "Six a side. Six balls on the centre line. One hit and you're out.", cx, 190, `500 12.5px ${FONT}`, INK_DIM);
  label(ctx, 'Catch a live ball to send the thrower out and bring a teammate back in.', cx, 208, `500 12.5px ${FONT}`, INK_DIM);

  for (const buttonDef of layout.difficulty) {
    const id = `difficulty:${buttonDef.id}`;
    button(
      ctx,
      buttonDef.rect,
      DIFFICULTY_LABELS[buttonDef.id],
      'pill',
      match.difficulty === buttonDef.id,
      ui.hover === id,
    );
  }

  label(ctx, 'PLAY AS', cx, 286, `800 10px ${MONO}`, INK_FAINT);
  for (const buttonDef of layout.lineup) {
    const id = `lineup:${buttonDef.slot}`;
    const name =
      buttonDef.slot === CUSTOM_SLOT
        ? lineup.customName
        : (BLUE_LINEUP[buttonDef.slot]?.name ?? '');
    button(ctx, buttonDef.rect, name, 'pill', lineup.humanSlot === buttonDef.slot, ui.hover === id);
  }

  label(ctx, 'CUSTOM PLAYER NAME', cx, 356, `800 9.5px ${MONO}`, INK_FAINT);

  const editing = ui.editingName;
  const nameRect = layout.name;
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, nameRect.x, nameRect.y, nameRect.w, nameRect.h, 9);
  ctx.fillStyle = 'rgba(4, 8, 16, 0.8)';
  ctx.fill();
  ctx.strokeStyle = editing ? 'rgba(91, 147, 255, 0.85)' : 'rgba(148, 163, 184, 0.24)';
  ctx.lineWidth = editing ? 1.8 : 1;
  ctx.stroke();

  const shown = editing ? ui.draft : lineup.customName;
  const placeholder = shown.length === 0;
  ctx.font = `700 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = placeholder ? INK_FAINT : INK;
  ctx.fillText(placeholder ? DEFAULT_CUSTOM_NAME : shown, cx, nameRect.y + nameRect.h / 2 + 1);

  if (editing && Math.floor(Date.now() / 500) % 2 === 0) {
    const width = ctx.measureText(placeholder ? '' : shown).width;
    const cursorX = cx + width / 2 + 3;
    ctx.fillStyle = 'rgba(232, 238, 252, 0.8)';
    ctx.fillRect(cursorX, nameRect.y + 9, 1.6, nameRect.h - 18);
  }
  ctx.restore();

  label(ctx, 'Type your own name for the sixth player, or leave it blank for Crispy.', cx, 418, `500 10.5px ${FONT}`, INK_FAINT);

  button(ctx, layout.play, 'PLAY BALL', 'cta', false, ui.hover === 'play');

  const rulesHot = ui.hover === 'rules';
  label(ctx, 'Read the rules — VDL / WDBF Foam format', cx, layout.rules.y + 12, `700 11px ${FONT}`, rulesHot ? INK : INK_DIM);
  if (rulesHot) {
    ctx.fillStyle = 'rgba(91, 147, 255, 0.7)';
    const width = ctx.measureText('Read the rules — VDL / WDBF Foam format').width;
    ctx.fillRect(cx - 120, layout.rules.y + 21, Math.min(240, width), 1);
  }

  if (input.usingTouch) {
    label(ctx, 'Stick to move · hold THROW to charge · DASH · CATCH', cx, 560, `700 11px ${FONT}`, INK_DIM);
  } else {
    const rows: Array<[string, string]> = [
      ['W A S D', 'Move'],
      ['Mouse', 'Aim'],
      ['Hold LMB', 'Charge & throw'],
      ['Shift', 'Dash'],
      ['Space / RMB', 'Catch / block'],
      ['Esc', 'Pause'],
    ];
    rows.forEach(([key, value], index) => {
      const column = index < 3 ? 0 : 1;
      const row = index % 3;
      const x = cx - 230 + column * 260;
      const y = 552 + row * 22;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `700 9.5px ${MONO}`;
      ctx.fillStyle = INK_FAINT;
      ctx.fillText(key, x + 74, y);
      ctx.textAlign = 'left';
      ctx.font = `500 11px ${FONT}`;
      ctx.fillStyle = INK_DIM;
      ctx.fillText(value, x + 86, y);
    });
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 10.5px ${FONT}`;
  ctx.fillStyle = 'rgba(100, 116, 139, 0.9)';
  const note =
    'First to 3 sets wins. Grab a ball in the opening rush and carry it behind the attack line to arm it. Empty hands catch; a ball in hand blocks.';
  wrap(ctx, note, 600).forEach((line, index) => {
    ctx.fillText(line, cx, 632 + index * 15);
  });
}

function drawPause(ctx: CanvasRenderingContext2D, ui: UiState): void {
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

function drawResults(ctx: CanvasRenderingContext2D, world: EcsWorld, ui: UiState): void {
  const layout = resultsLayout();
  const match = world.resource('match');
  const win = (match.matchWinner ?? (match.score.blue > match.score.red ? 'blue' : 'red')) === 'blue';
  const cx = VIEW_W / 2;

  panel(ctx, layout.panel);
  label(ctx, 'FINAL WHISTLE', cx, 212, `800 11px ${MONO}`, INK_FAINT);
  label(ctx, win ? 'VICTORY' : 'DEFEAT', cx, 262, `900 48px ${FONT}`, win ? '#8fb6ff' : '#ff8a9a');
  label(
    ctx,
    `${match.score.blue} \u2013 ${match.score.red}`,
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
    `First to ${WINS_NEEDED} sets \u00b7 ${DIFFICULTIES[match.difficulty].label}`,
    cx,
    522,
    `700 10px ${MONO}`,
    INK_FAINT,
  );
}

const RULES: Array<[string, string]> = [
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

function drawRules(ctx: CanvasRenderingContext2D, ui: UiState): void {
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

function drawTopBar(ctx: CanvasRenderingContext2D, ui: UiState): void {
  for (const spot of topLayout()) {
    const cx = spot.rect.x + spot.rect.w / 2;
    const cy = spot.rect.y + spot.rect.h / 2;
    const hot = ui.hover === spot.id;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, TAU);
    ctx.fillStyle = hot ? 'rgba(148, 163, 184, 0.24)' : 'rgba(5, 9, 16, 0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = hot ? INK : 'rgba(226, 232, 240, 0.75)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';

    if (spot.id === 'pause') {
      ctx.fillRect(cx - 3.5, cy - 5.5, 2.4, 11);
      ctx.fillRect(cx + 1.1, cy - 5.5, 2.4, 11);
    } else if (spot.id === 'fullscreen') {
      const d = 5;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d + 2);
      ctx.lineTo(cx - d, cy - d);
      ctx.lineTo(cx - d + 2, cy - d);
      ctx.moveTo(cx + d - 2, cy - d);
      ctx.lineTo(cx + d, cy - d);
      ctx.lineTo(cx + d, cy - d + 2);
      ctx.moveTo(cx - d, cy + d - 2);
      ctx.lineTo(cx - d, cy + d);
      ctx.lineTo(cx - d + 2, cy + d);
      ctx.moveTo(cx + d - 2, cy + d);
      ctx.lineTo(cx + d, cy + d);
      ctx.lineTo(cx + d, cy + d - 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 2.5);
      ctx.lineTo(cx - 2.5, cy - 2.5);
      ctx.lineTo(cx + 1, cy - 6);
      ctx.lineTo(cx + 1, cy + 6);
      ctx.lineTo(cx - 2.5, cy + 2.5);
      ctx.lineTo(cx - 6, cy + 2.5);
      ctx.closePath();
      ctx.fill();
      if (sfx.muted) {
        ctx.beginPath();
        ctx.moveTo(cx + 4, cy - 4);
        ctx.lineTo(cx + 9, cy + 4);
        ctx.moveTo(cx + 9, cy - 4);
        ctx.lineTo(cx + 4, cy + 4);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(cx + 2, cy, 5, -0.9, 0.9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawTouchControls(ctx: CanvasRenderingContext2D, input: Input): void {
  // Stick base and knob.
  ctx.save();
  ctx.beginPath();
  ctx.arc(STICK.x, STICK.y, STICK.r, 0, TAU);
  ctx.fillStyle = 'rgba(8, 14, 26, 0.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const knobX = STICK.x + input.touch.mx * STICK.r;
  const knobY = STICK.y + input.touch.my * STICK.r;
  ctx.beginPath();
  ctx.arc(knobX, knobY, STICK.knob, 0, TAU);
  ctx.fillStyle = 'rgba(226, 232, 240, 0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();

  // THROW: hold to charge.
  ctx.save();
  ctx.beginPath();
  ctx.arc(THROW_BTN.x, THROW_BTN.y, THROW_BTN.r, 0, TAU);
  ctx.fillStyle = input.touch.throwDown ? 'rgba(251, 191, 36, 0.34)' : 'rgba(8, 14, 26, 0.4)';
  ctx.fill();
  ctx.strokeStyle = input.touch.throwDown ? '#fbbf24' : 'rgba(226, 232, 240, 0.4)';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  label(ctx, 'THROW', THROW_BTN.x, THROW_BTN.y + 1, `900 15px ${FONT}`, INK);

  for (const [def, text] of [
    [DASH_BTN, 'DASH'],
    [CATCH_BTN, 'CATCH'],
  ] as const) {
    ctx.beginPath();
    ctx.arc(def.x, def.y, def.r, 0, TAU);
    ctx.fillStyle = 'rgba(8, 14, 26, 0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.32)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    label(ctx, text, def.x, def.y + 1, `900 10px ${FONT}`, INK_DIM);
  }
  ctx.restore();
}

function drawRotate(ctx: CanvasRenderingContext2D, ui: UiState): void {
  ctx.fillStyle = 'rgba(4, 6, 11, 0.95)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // A little phone, rotating.
  ctx.save();
  ctx.translate(VIEW_W / 2, 250);
  ctx.rotate(Math.sin(Date.now() / 700) * 0.25);
  ctx.beginPath();
  roundRect(ctx, -34, -58, 68, 116, 12);
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.7)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  const cx = VIEW_W / 2;
  label(ctx, 'ROTATE YOUR PHONE', cx, 360, `900 26px ${FONT}`, INK);
  label(ctx, 'Dodgeball needs a wide court. Turn your phone sideways.', cx, 392, `500 12px ${FONT}`, INK_DIM);

  const layout = rotateLayout();
  button(ctx, layout.play, 'PLAY ANYWAY', 'ghost', false, ui.hover === 'portrait-ok');
}
