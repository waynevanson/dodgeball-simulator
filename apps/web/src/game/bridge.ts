import { Game } from '../../../../crates/sim/src/lib.rs';
import { playSfxEvents, type RawSfxEvent } from './audio/events';
import type { Frame } from './frame';
import type { InputFrame } from './input';
import type { DifficultyId } from './types';
import type { Commands } from './ui/actions';

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
    playSfxEvents(events);
  }
}
