import { Game } from '../../../../crates/sim/src/lib.rs';
import { sfx } from './audio';
import type { Frame } from './frame';
import type { InputFrame } from './input';
import type { DifficultyId } from './types';
import type { Commands } from './ui/actions';

/** Sound events emitted by the Rust simulation (`SfxEvent` in `types.rs`). */
interface RawSfxEvent {
  type: string;
  value?: number | boolean;
}

export interface BridgeSettings {
  difficulty: DifficultyId;
  playerSlot: number;
  playerName: string;
}

/**
 * The whole wasm boundary: a command object for the UI, one snapshot per tick,
 * and a drained list of sound events. Nothing else in the app talks to Rust.
 */
export class Bridge implements Commands {
  readonly #game: Game;

  constructor(settings: BridgeSettings) {
    const seed = Math.floor(Math.random() * 2 ** 32);
    this.#game = new Game(seed, settings.difficulty, settings.playerSlot, settings.playerName);
  }

  tick(dt: number, input: InputFrame): Frame {
    const frame = this.#game.tick(dt, input) as Frame;
    this.#playEvents(this.#game.takeEvents() as RawSfxEvent[]);
    return frame;
  }

  frame(): Frame {
    return this.#game.frame() as Frame;
  }

  startMatch(): void {
    this.#game.startMatch();
  }

  pause(): void {
    this.#game.pause();
  }

  resume(): void {
    this.#game.resume();
  }

  toMenu(): void {
    this.#game.toMenu();
  }

  setDifficulty(id: DifficultyId): void {
    this.#game.setDifficulty(id);
  }

  setLineup(slot: number, name: string): void {
    this.#game.setLineup(slot, name);
  }

  #playEvents(events: RawSfxEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'throw':
          sfx.throwBall(Number(event.value));
          break;
        case 'hit':
          sfx.hit();
          break;
        case 'headshot':
          sfx.headshot();
          break;
        case 'catch':
          sfx.catchBall();
          break;
        case 'block':
          sfx.block();
          break;
        case 'pickup':
          sfx.pickup();
          break;
        case 'bounce':
          sfx.bounce(Number(event.value));
          break;
        case 'dash':
          sfx.dash();
          break;
        case 'catchStart':
          sfx.catchStart();
          break;
        case 'beep':
          sfx.beep(event.value === true);
          break;
        case 'whistle':
          sfx.whistle();
          break;
        case 'roundWin':
          sfx.roundWin();
          break;
        case 'roundLose':
          sfx.roundLose();
          break;
        case 'matchWin':
          sfx.matchWin();
          break;
        case 'matchLose':
          sfx.matchLose();
          break;
        case 'ui':
          sfx.ui();
          break;
        default:
          break;
      }
    }
  }
}
