/** Tiny WebAudio synth: every sound is generated at runtime, so the game ships
 * with zero audio assets. */
export * from './audio/synth';
export * from './audio/voices';

import { Sfx } from './audio/voices';

/** The one synth the game talks to. */
export const sfx = new Sfx();
