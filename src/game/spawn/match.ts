import type { World } from '../ecs';
import { DIFFICULTIES } from '../constants/difficulty';
import { BALL_RADIUS, PLAYER_RADIUS } from '../constants/pitch';
import { BLUE_LINEUP, CUSTOM_SLOT, DEFAULT_CUSTOM_NAME, PLAYER_NAME_MAX, ROSTER_DATA } from '../constants/roster';
import { BALL_COUNT, SHOT_CLOCK } from '../constants/rules';
import type { Intent } from '../types';
import { BALL_SPAWNS, SPAWNS, homeFacing, placeBall } from './formation';

export const ZERO_INTENT: Intent = {
  mx: 0,
  my: 0,
  aim: NaN,
  charge: false,
  release: false,
  dash: false,
  catch: false,
};

// ------------------------------------------------------------------- spawning

export function spawnMatch(world: World): void {
  world.setResource('clock', { sim: 0 });
  world.setResource('feedback', { shake: 0, flash: 0, slowmo: 0 });
  world.setResource('set', {
    id: 0,
    resolved: true,
    winner: null,
    elapsed: 0,
    suddenDeath: false,
  });
  world.setResource('rush', { active: false });
  world.setResource('shot', { team: null, clock: SHOT_CLOCK, beep: 99 });
  world.setResource('queues', { blue: [], red: [] });
  world.setResource('warnings', { blue: 0, red: 0 });
  world.setResource('lineup', { humanSlot: CUSTOM_SLOT, customName: DEFAULT_CUSTOM_NAME });
  world.setResource('lastThrow', { team: null });
  world.setResource('lastSet', { winner: null });
  world.setResource('claims', {
    byPlayer: new Map<number, number>(),
    balls: new Set<number>(),
  });

  for (const team of ['blue', 'red'] as const) {
    ROSTER_DATA[team].forEach((data, slot) => {
      const entity = world.spawn();
      const [x, y] = SPAWNS[team][slot];
      world.add(entity, 'transform', {
        x,
        y,
        vx: 0,
        vy: 0,
        radius: PLAYER_RADIUS,
        facing: homeFacing(team),
      });
      world.add(entity, 'player', {
        name: data.name,
        number: data.number,
        team,
        slot,
        isHuman: data.human,
        glasses: data.glasses === true,
      });
      world.add(entity, 'condition', {
        alive: true,
        hasGlasses: data.glasses === true,
        enteringTime: 0,
        hitFlash: 0,
        outAt: 0,
        outX: x,
        outY: y,
      });
      world.add(entity, 'carry', { ball: null });
      world.add(entity, 'action', {
        charge: 0,
        charging: false,
        dashTime: 0,
        dashCd: 0,
        dashX: 1,
        dashY: 0,
      });
      world.add(entity, 'cooldowns', {
        catchWindow: 0,
        catchCd: 0,
        throwCd: 0,
        pickupCd: 0,
      });
      world.add(entity, 'intent', { ...ZERO_INTENT });
      world.add(entity, 'brain', {
        diff: null,
        seek: null,
        target: null,
        targetTimer: 0,
        aimTimer: 0,
        aimError: 0,
        releaseDelay: 0,
        catchBall: null,
        willCatch: false,
        strafe: 1,
        strafeTimer: 0,
        phase: Math.random() * Math.PI * 2,
        anchorX: x,
        anchorY: y,
        anchorTimer: 0,
      });
      world.add(entity, 'trail', { points: [] });
      world.add(entity, 'stats', { throws: 0, catches: 0, outs: 0 });
      if (data.human) world.add(entity, 'human', {});
    });
  }

  for (let i = 0; i < BALL_COUNT; i++) {
    const entity = world.spawn();
    const [x, y] = BALL_SPAWNS[i % BALL_SPAWNS.length];
    world.add(entity, 'transform', { x, y, vx: 0, vy: 0, radius: BALL_RADIUS, facing: 0 });
    world.add(entity, 'ball', {
      spin: Math.random() * Math.PI * 2,
      spinV: 0,
      bob: Math.random() * Math.PI * 2,
      age: 0,
    });
    world.add(entity, 'held', { by: null });
    world.add(entity, 'ballTrail', { points: [] });
    world.add(entity, 'ballState', {
      live: false,
      armed: false,
      rush: true,
      canOut: true,
      team: null,
      thrower: null,
      throwerTeam: null,
      touched: false,
      validAttempt: false,
      warningIssued: false,
      ignore: null,
      ignoreTime: 0,
      bounces: 0,
      pickupCd: 0,
      releasePositions: [],
    });
    placeBall(world, entity, x, y);
  }

  setLineup(world, CUSTOM_SLOT, DEFAULT_CUSTOM_NAME);
}

// -------------------------------------------------------------------- lineup

/**
 * Choose which blue player the human controls and apply a custom sixth name.
 * Blank/whitespace custom names fall back to Crispy.
 */
export function setLineup(world: World, humanSlot: number, customName: string): void {
  const lineup = world.resource('lineup');
  const requested = Number.isFinite(humanSlot) ? Math.floor(humanSlot) : CUSTOM_SLOT;
  lineup.humanSlot = Math.min(BLUE_LINEUP.length - 1, Math.max(0, requested));
  const cleaned = customName.trim().replace(/\s+/g, ' ').slice(0, PLAYER_NAME_MAX);
  lineup.customName = cleaned || DEFAULT_CUSTOM_NAME;

  for (const entity of world.query('player')) {
    const tag = world.get(entity, 'player');
    if (!tag || tag.team !== 'blue') continue;
    tag.name =
      tag.slot === CUSTOM_SLOT ? lineup.customName : (BLUE_LINEUP[tag.slot]?.name ?? tag.name);
    tag.isHuman = tag.slot === lineup.humanSlot;
    if (tag.isHuman) world.add(entity, 'human', {});
    else world.remove(entity, 'human');
  }
}

/** Push the match difficulty onto every AI brain. */
export function applyDifficulty(world: World): void {
  const difficulty = DIFFICULTIES[world.resource('match').difficulty];
  for (const entity of world.query('player')) {
    const brain = world.get(entity, 'brain');
    if (!brain) continue;
    const tag = world.get(entity, 'player');
    brain.diff = tag?.isHuman ? null : difficulty;
  }
}
