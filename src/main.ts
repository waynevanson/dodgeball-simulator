import './styles/global.css';
import { createActor, type SnapshotFrom } from 'xstate';
import { gameMachine } from './machine/gameMachine';
import { GameWorld } from './game/world';
import { Input } from './game/input';
import { render } from './game/renderer';
import { sfx } from './game/audio';
import { Shell } from './ui/shell';
import { COUNTDOWN_SECONDS, DIFFICULTIES, VIEW_H, VIEW_W } from './game/constants';
import type { DifficultyId, Hud, HudPlayer, Phase, TeamId } from './game/types';
import type { Player } from './game/entities';

// --------------------------------------------------------------------- settings

const SETTINGS_KEY = 'dodgeball.settings';

interface Settings {
  difficulty: DifficultyId;
  muted: boolean;
}

const DEFAULT_SETTINGS: Settings = { difficulty: 'pro', muted: false };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const difficulty =
      parsed.difficulty && DIFFICULTIES[parsed.difficulty]
        ? parsed.difficulty
        : DEFAULT_SETTINGS.difficulty;
    return { difficulty, muted: parsed.muted === true };
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

// ------------------------------------------------------------------------ setup

const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('Canvas #game not found');
const canvas: HTMLCanvasElement = canvasEl;

const context2d = canvas.getContext('2d', { alpha: false });
if (!context2d) throw new Error('2D canvas context unavailable');
const ctx: CanvasRenderingContext2D = context2d;

const shell = new Shell();
const input = new Input(canvas);
const world = new GameWorld();

sfx.muted = settings.muted;
shell.setDifficulty(settings.difficulty);
shell.setMuted(settings.muted);

const actor = createActor(gameMachine, {
  input: { difficulty: settings.difficulty },
});

// --------------------------------------------------------------- fullscreen

async function enterFullscreen(): Promise<void> {
  try {
    const app = document.getElementById('app');
    if (!app || document.fullscreenElement) return;
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

async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* ignore */
  }
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void exitFullscreen();
  else void enterFullscreen();
}

type Snapshot = SnapshotFrom<typeof gameMachine>;

function phaseOf(snapshot: Snapshot): Phase {
  if (snapshot.matches({ active: 'paused' })) return 'paused';
  if (snapshot.matches({ active: { running: 'countdown' } })) return 'countdown';
  if (snapshot.matches({ active: { running: 'playing' } })) return 'playing';
  if (snapshot.matches({ active: { running: 'setOver' } })) return 'setover';
  if (snapshot.matches({ active: { running: 'matchOver' } })) return 'matchover';
  return 'menu';
}

const toHudPlayer = (player: Player): HudPlayer => ({
  id: player.id,
  number: player.number,
  alive: player.alive,
  human: player.isHuman,
  entering: player.isEntering,
});

const rosterFor = (team: TeamId): HudPlayer[] =>
  world.players.filter((p) => p.team === team).map(toHudPlayer);

const queueFor = (team: TeamId): HudPlayer[] => world.queues[team].map(toHudPlayer);

// The world only reports results; the chart decides what happens next.
world.onSetEnd = (winner) => actor.send({ type: 'SET_OVER', winner });

/**
 * Run the side effects for a phase change. Kept in one place so the statechart
 * stays declarative and the DOM/audio/simulation stay in sync with it.
 */
function applyPhase(next: Phase, previous: Phase | null, snapshot: Snapshot): void {
  const machineContext = snapshot.context;

  if (previous === 'paused') shell.showScreen(null);
  shell.setPlaying(next === 'playing' || next === 'countdown');

  switch (next) {
    case 'menu':
      world.toMenu();
      shell.showScreen('menu');
      break;

    case 'countdown':
      world.setDifficulty(machineContext.difficulty);
      world.startSet();
      shell.showScreen(null);
      break;

    case 'playing':
      sfx.whistle();
      break;

    case 'setover':
      world.punch();
      if (machineContext.lastSetWinner === 'blue') sfx.roundWin();
      else if (machineContext.lastSetWinner === 'red') sfx.roundLose();
      else sfx.whistle();
      break;

    case 'paused':
      shell.showScreen('pause');
      sfx.ui();
      break;

    case 'matchover': {
      const winner: TeamId =
        machineContext.matchWinner ??
        (machineContext.score.blue > machineContext.score.red ? 'blue' : 'red');
      world.celebrate(winner);
      if (winner === 'blue') sfx.matchWin();
      else sfx.matchLose();
      shell.showResults(winner === 'blue', machineContext.score, machineContext.difficulty);
      break;
    }
  }
}

// ------------------------------------------------------------------- UI wiring

shell.onStart = () => {
  const current = phaseOf(actor.getSnapshot());
  if (current !== 'menu' && current !== 'matchover') return;
  sfx.resume();
  if (input.usingTouch) void enterFullscreen();
  settings.difficulty = shell.difficulty;
  saveSettings();
  actor.send({ type: 'START', difficulty: shell.difficulty });
};

shell.onPause = () => {
  const current = phaseOf(actor.getSnapshot());
  if (current === 'playing' || current === 'countdown') actor.send({ type: 'PAUSE' });
};

shell.onFullscreen = () => {
  sfx.ui();
  toggleFullscreen();
};

shell.onResume = () => {
  sfx.resume();
  actor.send({ type: 'RESUME' });
};

shell.onRestart = () => {
  sfx.resume();
  settings.difficulty = shell.difficulty;
  saveSettings();
  actor.send({ type: 'START', difficulty: shell.difficulty });
};

shell.onMenu = () => {
  sfx.ui();
  actor.send({ type: 'MENU' });
};

shell.onDifficulty = (difficulty) => {
  sfx.resume();
  sfx.ui();
  settings.difficulty = difficulty;
  saveSettings();
};

shell.onSoundToggle = () => {
  sfx.resume();
  sfx.setMuted(!sfx.muted);
  shell.setMuted(sfx.muted);
  settings.muted = sfx.muted;
  saveSettings();
  sfx.ui();
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    sfx.setMuted(!sfx.muted);
    shell.setMuted(sfx.muted);
    settings.muted = sfx.muted;
    saveSettings();
    return;
  }

  if (e.code === 'Escape' || e.code === 'KeyP') {
    const current = phaseOf(actor.getSnapshot());
    if (current === 'playing' || current === 'countdown') {
      e.preventDefault();
      actor.send({ type: 'PAUSE' });
    } else if (current === 'paused') {
      e.preventDefault();
      actor.send({ type: 'RESUME' });
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  const current = phaseOf(actor.getSnapshot());
  if (current === 'playing' || current === 'countdown') {
    actor.send({ type: 'PAUSE' });
  }
});

window.addEventListener('pointerdown', () => sfx.resume(), { once: true });
window.addEventListener('keydown', () => sfx.resume(), { once: true });

// ---------------------------------------------------------------------- canvas

function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(2, Math.round(rect.width * dpr));
  const height = Math.max(2, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

window.addEventListener('resize', resizeCanvas);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resizeCanvas).observe(canvas);
resizeCanvas();

// ------------------------------------------------------------------ game loop

actor.start();
shell.setPlaying(false);

// Handy for debugging in the browser console during development.
if (import.meta.env.DEV) {
  Object.assign(window, { __dodgeball: { actor, world, input } });
}

let phase: Phase | null = null;
let phaseStart = performance.now();
let countdownNumber = 99;
let last = performance.now();

function frame(now: number): void {
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;

  const snapshot = actor.getSnapshot();
  const nextPhase = phaseOf(snapshot);
  if (nextPhase !== phase) {
    const previous = phase;
    phase = nextPhase;
    phaseStart = now;
    applyPhase(nextPhase, previous, snapshot);
  }

  const phaseElapsed = (now - phaseStart) / 1000;

  if (phase !== 'paused') world.update(raw, input, phase);

  // Count-in beeps are driven by the same clock that draws the numbers.
  if (phase === 'countdown') {
    const number = Math.ceil(COUNTDOWN_SECONDS - phaseElapsed);
    if (number !== countdownNumber && number >= 1 && number <= 3) {
      countdownNumber = number;
      sfx.beep(number === 1);
    }
  } else {
    countdownNumber = 99;
  }

  const current = actor.getSnapshot();
  const hud: Hud = {
    phase,
    phaseElapsed,
    score: current.context.score,
    set: current.context.set,
    difficulty: DIFFICULTIES[current.context.difficulty],
    lastSetWinner: current.context.lastSetWinner,
    matchWinner: current.context.matchWinner,
    roster: { blue: rosterFor('blue'), red: rosterFor('red') },
    outQueue: { blue: queueFor('blue'), red: queueFor('red') },
    shot: { team: world.shotTeam, timeLeft: world.shotClock },
    suddenDeath: world.suddenDeath,
    rushActive: world.rushActive,
    setElapsed: world.setElapsed,
    compact: input.usingTouch || window.innerWidth < 980,
  };

  resizeCanvas();
  ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
  render(ctx, world, hud, input, now / 1000);

  input.endFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
