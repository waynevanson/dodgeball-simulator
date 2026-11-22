import './styles/global.css';
import './game/components';
import type { System } from './ecs/core';
import { EcsWorld } from './ecs/core';
import { sfx } from './game/audio';
import { CUSTOM_SLOT, DIFFICULTIES, PLAYER_NAME_MAX, ROSTER } from './game/constants';
import { Input } from './game/input';
import { flowSystem, send } from './game/match';
import { applyDifficulty, setLineup, spawnMatch } from './game/spawn';
import {
  countdownAudioSystem,
  hudSystem,
  inputFrameSystem,
  phaseEffectsSystem,
  renderSystem,
  resizeCanvas,
  simulationSystem,
} from './game/systems';
import { createUi, uiSystem } from './game/ui';
import type { DifficultyId } from './game/types';

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

/** Persist whatever the canvas UI changed, once per dirty frame. */
function settingsSystem(): System {
  return {
    name: 'settings',
    run({ world }) {
      const ui = world.resource('ui');
      if (!ui.dirty) return;
      ui.dirty = false;
      settings.difficulty = world.resource('match').difficulty;
      settings.playerSlot = world.resource('lineup').humanSlot;
      settings.playerName = world.resource('lineup').customName;
      settings.muted = sfx.muted;
      saveSettings();
    },
  };
}

// ------------------------------------------------------------------------ boot

const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('Canvas #game not found');
const canvas: HTMLCanvasElement = canvasEl;

const context2d = canvas.getContext('2d', { alpha: false });
if (!context2d) throw new Error('2D canvas context unavailable');
const ctx: CanvasRenderingContext2D = context2d;

const ecs = new EcsWorld();
const input = new Input(canvas);

spawnMatch(ecs);

ecs.setResource('input', input);
ecs.setResource('view', { canvas, ctx });
ecs.setResource('ui', createUi());
ecs.setResource('phase', { id: 'menu', elapsed: 0, resumeFrom: null });
ecs.setResource('match', {
  difficulty: settings.difficulty,
  score: { blue: 0, red: 0 },
  set: 1,
  lastSetWinner: null,
  matchWinner: null,
});
ecs.setResource('flow', { pending: [] });

sfx.muted = settings.muted;
setLineup(ecs, settings.playerSlot, settings.playerName);
applyDifficulty(ecs);

ecs
  .addSystem(uiSystem())
  .addSystem(flowSystem())
  .addSystem(phaseEffectsSystem())
  .addSystem(simulationSystem())
  .addSystem(countdownAudioSystem())
  .addSystem(hudSystem())
  .addSystem(renderSystem())
  .addSystem(settingsSystem())
  .addSystem(inputFrameSystem());

const currentPhase = () => ecs.resource('phase').id;

// ------------------------------------------------------------------ shortcuts

window.addEventListener('keydown', (e) => {
  // Text entry owns the keyboard while a player name is being typed.
  if (ecs.resource('ui').editingName && e.code !== 'Escape') return;

  if (e.code === 'KeyM') {
    sfx.setMuted(!sfx.muted);
    ecs.resource('ui').dirty = true;
    return;
  }

  if (e.code === 'Escape' || e.code === 'KeyP') {
    const current = currentPhase();
    if (current === 'playing' || current === 'countdown') {
      e.preventDefault();
      send(ecs, { type: 'pause' });
    } else if (current === 'paused') {
      e.preventDefault();
      send(ecs, { type: 'resume' });
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  const current = currentPhase();
  if (current === 'playing' || current === 'countdown') {
    send(ecs, { type: 'pause' });
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
resizeCanvas(canvas);

// ------------------------------------------------------------------ game loop

// Handy for debugging in the browser console during development.
if (import.meta.env.DEV) {
  Object.assign(window, { __dodgeball: { ecs, input } });
}

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ecs.tick(dt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
