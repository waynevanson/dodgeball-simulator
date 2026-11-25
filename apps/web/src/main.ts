import './styles/global.css';
import init, { start } from './wasm/dodgeball_client.js';

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
const database =
  (import.meta.env.VITE_SPACETIME_DB as string | undefined) ?? 'dodgeball-simulator';

await init();

start(
  uri,
  database,
  settings.playerName || 'Player',
  settings.muted,
  new URLSearchParams(window.location.search).has('autostart'),
);

// Keep a tiny debug handle for browser smoke tests and console inspection.
Object.assign(window, { __dodgeball: { transport: 'bevy', uri, database } });
