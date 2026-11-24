import './styles/global.css';
import { sfx } from './game/audio';
import { Bridge } from './game/bridge';
import type { Frame } from './game/frame';
import { toHud } from './game/frame';
import { CUSTOM_SLOT, DIFFICULTIES, PLAYER_NAME_MAX, ROSTER } from './game/constants';
import { Input } from './game/input';
import { renderFrame, resizeCanvas } from './game/systems';
import { createUi, updateUi } from './game/ui';
import type { DifficultyId, Phase } from './game/types';

// --------------------------------------------------------------------- settings

const SETTINGS_KEY = 'dodgeball.settings';

interface Settings {
  difficulty: DifficultyId;
  muted: boolean;
  playerSlot: number;
  playerName: string;
}

const DEFAULT_SETTINGS: Settings = {
  difficulty: 'pro',
  muted: false,
  playerSlot: CUSTOM_SLOT,
  playerName: '',
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const difficulty =
      parsed.difficulty && DIFFICULTIES[parsed.difficulty]
        ? parsed.difficulty
        : DEFAULT_SETTINGS.difficulty;
    const playerSlot =
      typeof parsed.playerSlot === 'number' &&
      Number.isInteger(parsed.playerSlot) &&
      parsed.playerSlot >= 0 &&
      parsed.playerSlot < ROSTER
        ? parsed.playerSlot
        : DEFAULT_SETTINGS.playerSlot;
    const playerName =
      typeof parsed.playerName === 'string'
        ? parsed.playerName.slice(0, PLAYER_NAME_MAX)
        : DEFAULT_SETTINGS.playerName;
    return { difficulty, muted: parsed.muted === true, playerSlot, playerName };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const settings = loadSettings();

function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage can be unavailable (private mode) */
  }
}

// ------------------------------------------------------------------------ boot

const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('Canvas #game not found');
const canvas: HTMLCanvasElement = canvasEl;

const context2d = canvas.getContext('2d', { alpha: false });
if (!context2d) throw new Error('2D canvas context unavailable');
const ctx: CanvasRenderingContext2D = context2d;

const input = new Input(canvas);
const ui = createUi();
const bridge = new Bridge(settings);
sfx.muted = settings.muted;

let frame: Frame = bridge.frame();
let previousPhase: Phase = frame.phase;

function persistSettings(): void {
  settings.difficulty = frame.difficulty.id;
  settings.playerSlot = frame.lineup.humanSlot;
  settings.playerName = frame.lineup.customName;
  settings.muted = sfx.muted;
  saveSettings();
}

/** Follow phase changes into the canvas UI. Sound comes from the sim. */
function present(next: Frame): void {
  if (next.phase !== previousPhase) {
    previousPhase = next.phase;
    ui.editingName = false;
    ui.screen =
      next.phase === 'menu'
        ? 'menu'
        : next.phase === 'paused'
          ? 'pause'
          : next.phase === 'matchover'
            ? 'results'
            : null;
  }
}

// ------------------------------------------------------------------ shortcuts

window.addEventListener('keydown', (e) => {
  // Text entry owns the keyboard while a player name is being typed.
  if (ui.editingName && e.code !== 'Escape') return;

  if (e.code === 'KeyM') {
    sfx.setMuted(!sfx.muted);
    ui.dirty = true;
    return;
  }

  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (frame.phase === 'playing' || frame.phase === 'countdown') {
      e.preventDefault();
      bridge.pause();
    } else if (frame.phase === 'paused') {
      e.preventDefault();
      bridge.resume();
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (frame.phase === 'playing' || frame.phase === 'countdown') {
    bridge.pause();
  }
});

// Browsers only allow audio to start from a gesture.
window.addEventListener('pointerdown', () => sfx.resume(), { once: true });
window.addEventListener('keydown', () => sfx.resume(), { once: true });

// ---------------------------------------------------------------------- canvas

window.addEventListener('resize', () => resizeCanvas(canvas));
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => resizeCanvas(canvas)).observe(canvas);
}

// ------------------------------------------------------------------ game loop

// Handy for debugging in the browser console during development.
if (import.meta.env.DEV) {
  Object.assign(window, { __dodgeball: { bridge, input, ui } });
}

let last = performance.now();

function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  updateUi(frame, ui, input, bridge);
  frame = bridge.tick(dt, input.snapshot());
  present(frame);

  const compact = input.usingTouch || window.innerWidth < 980;
  renderFrame(canvas, ctx, frame, toHud(frame, compact), input, ui, now / 1000);

  if (ui.dirty) {
    ui.dirty = false;
    persistSettings();
  }

  input.endFrame();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
