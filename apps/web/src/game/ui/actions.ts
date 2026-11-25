import { sfx } from '../audio';
import { DEFAULT_CUSTOM_NAME } from '../constants/roster';
import type { Frame } from '../frame';
import type { Input } from '../input';
import { commitName } from './flow';
import type { UiState } from './state';

/** Commands the canvas UI can issue to the Rust simulation. */
export interface Commands {
  setName(name: string): void;
  startMatch(): void;
  pause(): void;
  resume(): void;
  toMenu(): void;
}

export function act(
  frame: Frame,
  ui: UiState,
  id: string,
  commands: Commands,
  input: Input,
): void {
  switch (id) {
    case 'name':
      ui.editingName = true;
      ui.draft = frame.lineup.customName === DEFAULT_CUSTOM_NAME ? '' : frame.lineup.customName;
      sfx.ui();
      break;
    case 'play':
    case 'again':
    case 'restart':
      commitName(ui, commands);
      sfx.resume();
      if (input.usingTouch) void toggleFullscreen();
      commands.startMatch();
      break;
    case 'resume':
      commitName(ui, commands);
      sfx.resume();
      commands.resume();
      break;
    case 'menu':
      commitName(ui, commands);
      sfx.ui();
      commands.toMenu();
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
      commands.pause();
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
