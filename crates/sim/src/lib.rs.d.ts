/* tslint:disable */
/* eslint-disable */

/**
 * The only state the browser holds: a handle to the Rust world. Every command
 * and every snapshot crosses this boundary.
 */
export class Game {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Current snapshot without advancing the world.
     */
    frame(): any;
    constructor(seed: number, difficulty: string, human_slot: number, custom_name: string);
    pause(): void;
    resume(): void;
    setDifficulty(id: string): void;
    setLineup(slot: number, name: string): void;
    startMatch(): void;
    /**
     * Sound events produced since the last call (drained).
     */
    takeEvents(): any;
    /**
     * Advance one frame and return the presentation snapshot.
     */
    tick(dt: number, input: any): any;
    toMenu(): void;
}
