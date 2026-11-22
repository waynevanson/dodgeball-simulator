import { EcsWorld } from '../../ecs/core';
import { sfx } from '../audio';
import { DEFAULT_CUSTOM_NAME } from '../constants/roster';
import { send } from '../match/flow';
import { setLineup } from '../spawn/match';
import type { DifficultyId } from '../types';
import { commitName } from './flow';
import type { UiState } from './state';

export function act(world: EcsWorld, ui: UiState, id: string): void {
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
