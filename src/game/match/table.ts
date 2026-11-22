import { WINS_NEEDED } from '../constants/rules';
import { startSet, toMenu } from '../spawn/sets';
import type { Phase, Score } from '../types';
import type { FlowContext, FlowStep, Transition } from './state';

// ------------------------------------------------------------------- effects

export const newMatch = ({ context, trigger }: FlowStep): void => {
  if (trigger.type !== 'start') return;
  context.match.difficulty = trigger.difficulty;
  context.match.score = { blue: 0, red: 0 };
  context.match.set = 1;
  context.match.lastSetWinner = null;
  context.match.matchWinner = null;
};

export const freezePhase = ({ context, from }: FlowStep): void => {
  context.phase.resumeFrom = from;
};

/** Rule 10.2.2: a set is worth one point; a voided set awards none. */
export const awardSet = ({ context }: FlowStep): void => {
  const winner = context.world.resource('set').winner;
  const score: Score = { ...context.match.score };
  if (winner) score[winner] += 1;
  context.match.score = score;
  context.match.lastSetWinner = winner;
};

export const nextSet = ({ context }: FlowStep): void => {
  context.match.set += 1;
};

export const recordMatchWinner = ({ context }: FlowStep): void => {
  context.match.matchWinner =
    context.match.score.blue > context.match.score.red ? 'blue' : 'red';
};

export const matchDecided = (context: FlowContext): boolean =>
  context.match.score.blue >= WINS_NEEDED || context.match.score.red >= WINS_NEEDED;

// -------------------------------------------------------------- entry actions

/**
 * What *being in* a phase means for the simulation. Entry actions live with
 * the definition of the state rather than in the presentation system, so the
 * flow can be exercised without a canvas or a DOM.
 */
export const ENTER: Partial<Record<Phase, (step: FlowStep) => void>> = {
  menu: (step) => {
    toMenu(step.context.world);
    step.context.match.lastSetWinner = null;
    step.context.match.matchWinner = null;
  },

  countdown: (step) => {
    startSet(step.context.world);
  },
};

// ----------------------------------------------------------------- definition

export const MATCH_FLOW: readonly Transition[] = [
  { from: 'menu', on: 'start', to: 'countdown', effect: newMatch },
  { from: 'matchover', on: 'start', to: 'countdown', effect: newMatch },
  { from: 'countdown', on: 'start', to: 'countdown', effect: newMatch },
  { from: 'playing', on: 'start', to: 'countdown', effect: newMatch },
  { from: 'paused', on: 'start', to: 'countdown', effect: newMatch },

  { from: 'countdown', on: 'pause', to: 'paused', effect: freezePhase },
  { from: 'playing', on: 'pause', to: 'paused', effect: freezePhase },
  { from: 'paused', on: 'resume', to: (context) => context.phase.resumeFrom ?? 'playing' },

  { from: 'countdown', on: 'menu', to: 'menu' },
  { from: 'playing', on: 'menu', to: 'menu' },
  { from: 'paused', on: 'menu', to: 'menu' },

  { from: 'countdown', on: 'countdownDone', to: 'playing' },
  { from: 'playing', on: 'setOver', to: 'setover', effect: awardSet },
  {
    from: 'setover',
    on: 'setBreakDone',
    guard: matchDecided,
    to: 'matchover',
    effect: recordMatchWinner,
  },
  { from: 'setover', on: 'setBreakDone', to: 'countdown', effect: nextSet },
];
