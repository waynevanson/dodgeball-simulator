import './styles/global.css';

// The generated wasm glue captures `AudioContext` at module load time, so it is
// imported dynamically after the tracking patch below is installed.
// Browsers keep an AudioContext suspended until the first user gesture. The
// Bevy/rodio audio backend creates its context during wasm startup, so track
// every context created afterwards and resume them on the first interaction.
const audioContexts: AudioContext[] = [];
const NativeAudioContext = window.AudioContext;
if (NativeAudioContext) {
  class TrackedAudioContext extends NativeAudioContext {
    constructor(...args: ConstructorParameters<typeof NativeAudioContext>) {
      super(...args);
      audioContexts.push(this);
    }
  }
  window.AudioContext = TrackedAudioContext;
}

function unlockAudio(): void {
  for (const context of audioContexts) {
    if (context.state === 'suspended') void context.resume();
  }
}

for (const event of ['pointerdown', 'keydown'] as const) {
  // Keep listening: the audio context may be created after the first gesture
  // (for example while the wasm module is still loading).
  window.addEventListener(event, unlockAudio, { passive: true });
}

const SETTINGS_KEY = 'dodgeball.settings';

interface Settings {
  muted: boolean;
  playerName: string;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { muted: false, playerName: '' };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      muted: parsed.muted === true,
      playerName: typeof parsed.playerName === 'string' ? parsed.playerName : '',
    };
  } catch {
    return { muted: false, playerName: '' };
  }
}

const settings = loadSettings();
const uri = (import.meta.env.VITE_SPACETIME_URI as string | undefined) ?? 'ws://localhost:3000';
const database = (import.meta.env.VITE_SPACETIME_DB as string | undefined) ?? 'dodgeball-simulator';

// Keep a tiny debug handle for browser smoke tests and console inspection.
// This must be installed before `start`, which runs the Bevy event loop and
// does not return.
Object.assign(window, {
  __dodgeball: { transport: 'bevy', uri, database, audioContexts },
});

const { default: init, start } = await import('./wasm/dodgeball_client.js');

await init();

start(
  uri,
  database,
  settings.playerName || 'Player',
  settings.muted,
  new URLSearchParams(window.location.search).has('autostart'),
);
