import { sfx } from '../audio';

/** Sound events emitted by the Rust simulation (`SfxEvent` in `types.rs`). */
export interface RawSfxEvent {
  type: string;
  value?: number | boolean;
}

/** Play a batch of simulation sound events in order. */
export function playSfxEvents(events: RawSfxEvent[]): void {
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
