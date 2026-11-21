import { assign, setup } from 'xstate';
import { COUNTDOWN_MS, SET_BREAK_MS, WINS_NEEDED } from '../game/constants';
import type { DifficultyId, Score, TeamId } from '../game/types';

/**
 * Match-level behaviour modelled as an XState chart (VDL Foam Playing Format).
 *
 *   menu ──START──▶ active.running.countdown ──(3.1s)──▶ playing
 *                                   ▲                      │
 *                                   │      SET_OVER        │
 *                                   │                      ▼
 *                                   └────(3s)────────── setOver ──▶ matchOver
 *
 *   active.paused freezes the set via deep history (pause → resume restores
 *   whichever running state you were in).
 *
 * Physics, ball ownership, hits and the 10-second advantage clock live in
 * `GameWorld`; it reports set results back as SET_OVER events. Score, set
 * number and difficulty live here, because they describe the match, not the
 * court.
 *
 * VDL notes:
 *  - Rule 10.2.2: winning a set in the Foam format grants 1 point.
 *  - Rule 10.2.1: a set is won by eliminating every opponent.
 *  - Rule 29.3.2: simultaneous all-out voids the set (no point awarded), which
 *    is represented by `winner: null`.
 *  - A 20-minute half is compressed into "first to 3 sets" for a browser game.
 */
export interface GameContext {
  difficulty: DifficultyId;
  score: Score;
  set: number;
  lastSetWinner: TeamId | null;
  matchWinner: TeamId | null;
}

export type GameEvent =
  | { type: 'START'; difficulty: DifficultyId }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'MENU' }
  | { type: 'SET_OVER'; winner: TeamId | null };

export interface GameMachineInput {
  difficulty: DifficultyId;
}

export const gameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
    input: {} as GameMachineInput,
  },
  guards: {
    matchDecided: ({ context }) =>
      context.score.blue >= WINS_NEEDED || context.score.red >= WINS_NEEDED,
  },
  delays: {
    countdown: COUNTDOWN_MS,
    setBreak: SET_BREAK_MS,
  },
  actions: {
    newMatch: assign(({ event }) => {
      if (event.type !== 'START') return {};
      return {
        difficulty: event.difficulty,
        score: { blue: 0, red: 0 },
        set: 1,
        lastSetWinner: null,
        matchWinner: null,
      };
    }),
    nextSet: assign(({ context }) => ({ set: context.set + 1 })),
    awardSet: assign(({ context, event }) => {
      if (event.type !== 'SET_OVER') return {};
      const score: Score = { ...context.score };
      if (event.winner) score[event.winner] += 1;
      return { score, lastSetWinner: event.winner };
    }),
    recordWinner: assign(({ context }) => {
      const winner: TeamId = context.score.blue > context.score.red ? 'blue' : 'red';
      return { matchWinner: winner };
    }),
    clearMatch: assign({ lastSetWinner: null, matchWinner: null }),
  },
}).createMachine({
  id: 'dodgeball',
  initial: 'menu',
  context: ({ input }) => ({
    difficulty: input.difficulty,
    score: { blue: 0, red: 0 },
    set: 1,
    lastSetWinner: null,
    matchWinner: null,
  }),
  states: {
    menu: {
      on: {
        START: { target: '#countdownState', actions: 'newMatch' },
      },
    },

    active: {
      initial: 'running',
      on: {
        START: { target: '#countdownState', actions: 'newMatch' },
        MENU: { target: 'menu', actions: 'clearMatch' },
      },
      states: {
        running: {
          initial: 'countdown',
          states: {
            // Deep history: pausing exits `running`, which snapshots the round
            // phase so RESUME can drop the player back exactly where they were.
            hist: { type: 'history', history: 'deep', id: 'pausedHistory' },

            countdown: {
              id: 'countdownState',
              after: { countdown: { target: 'playing' } },
              on: { PAUSE: { target: '#pausedState' } },
            },

            playing: {
              on: {
                PAUSE: { target: '#pausedState' },
                SET_OVER: { target: 'setOver', actions: 'awardSet' },
              },
            },

            setOver: {
              after: {
                setBreak: [
                  { guard: 'matchDecided', target: 'matchOver' },
                  { target: 'countdown', actions: 'nextSet' },
                ],
              },
            },

            matchOver: {
              entry: 'recordWinner',
            },
          },
        },

        paused: {
          id: 'pausedState',
          on: {
            RESUME: { target: '#pausedHistory' },
            MENU: { target: '#dodgeball.menu', actions: 'clearMatch' },
          },
        },
      },
    },
  },
});

export type DodgeballMachine = typeof gameMachine;
