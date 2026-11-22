import type { EcsWorld } from '../ecs/core';
import {
  BALL_COUNT,
  BALL_MARK_SPACING,
  BALL_RADIUS,
  BLUE_LINEUP,
  COURT,
  CUSTOM_SLOT,
  DEFAULT_CUSTOM_NAME,
  DIFFICULTIES,
  ENTER_GRACE,
  PLAYER_NAME_MAX,
  PLAYER_RADIUS,
  ROSTER_DATA,
  SHOT_CLOCK,
} from './constants';
import type { Intent, TeamId } from './types';

/**
 * Rule 13.1 / 9.3: both teams line up with a foot on the back line.
 * Six players per team spread along the line; the chosen human keeps a slot.
 */
const BACKLINE_Y = [-225, -135, -45, 45, 135, 225];

export const SPAWNS: Record<TeamId, Array<[number, number]>> = {
  blue: BACKLINE_Y.map((offset) => [COURT.x + PLAYER_RADIUS + 2, COURT.cy + offset]),
  red: BACKLINE_Y.map((offset) => [COURT.right - PLAYER_RADIUS - 2, COURT.cy + offset]),
};

/**
 * Rule 12.1.2 (Foam): three balls per team on the centre line, 1.5m apart,
 * sitting on each team's side of the line.
 */
const BALL_SPAWNS: Array<[number, number]> = [
  [COURT.cx - 22, COURT.cy - BALL_MARK_SPACING],
  [COURT.cx - 22, COURT.cy],
  [COURT.cx - 22, COURT.cy + BALL_MARK_SPACING],
  [COURT.cx + 22, COURT.cy - BALL_MARK_SPACING],
  [COURT.cx + 22, COURT.cy],
  [COURT.cx + 22, COURT.cy + BALL_MARK_SPACING],
];

export const ZERO_INTENT: Intent = {
  mx: 0,
  my: 0,
  aim: NaN,
  charge: false,
  release: false,
  dash: false,
  catch: false,
};

/** Facing is towards the opposition at the start of a set. */
const homeFacing = (team: TeamId): number => (team === 'blue' ? 0 : Math.PI);

// ------------------------------------------------------------------- spawning

export function spawnMatch(world: EcsWorld): void {
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
export function setLineup(world: EcsWorld, humanSlot: number, customName: string): void {
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
export function applyDifficulty(world: EcsWorld): void {
  const difficulty = DIFFICULTIES[world.resource('match').difficulty];
  for (const entity of world.query('player')) {
    const brain = world.get(entity, 'brain');
    if (!brain) continue;
    const tag = world.get(entity, 'player');
    brain.diff = tag?.isHuman ? null : difficulty;
  }
}

// ---------------------------------------------------------------- set resets

export function startSet(world: EcsWorld): void {
  const set = world.resource('set');
  const shot = world.resource('shot');
  const queues = world.resource('queues');
  const feedback = world.resource('feedback');
  const warnings = world.resource('warnings');
  const claims = world.resource('claims');

  set.id += 1;
  set.resolved = false;
  set.winner = null;
  set.elapsed = 0;
  set.suddenDeath = false;
  world.resource('rush').active = true;
  world.resource('lastThrow').team = null;
  shot.team = null;
  shot.clock = SHOT_CLOCK;
  shot.beep = 99;
  warnings.blue = 0;
  warnings.red = 0;
  queues.blue = [];
  queues.red = [];
  feedback.slowmo = 0;
  feedback.shake = 0;
  feedback.flash = 0;
  claims.byPlayer.clear();
  claims.balls.clear();

  setupFormation(world);
  applyDifficulty(world);
}

export function toMenu(world: EcsWorld): void {
  const set = world.resource('set');
  const shot = world.resource('shot');
  const queues = world.resource('queues');
  const feedback = world.resource('feedback');
  const warnings = world.resource('warnings');
  const claims = world.resource('claims');

  set.id = 0;
  set.resolved = true;
  set.winner = null;
  set.elapsed = 0;
  set.suddenDeath = false;
  world.resource('rush').active = false;
  world.resource('lastThrow').team = null;
  shot.team = null;
  shot.clock = SHOT_CLOCK;
  shot.beep = 99;
  warnings.blue = 0;
  warnings.red = 0;
  queues.blue = [];
  queues.red = [];
  feedback.slowmo = 0;
  feedback.shake = 0;
  feedback.flash = 0;
  claims.byPlayer.clear();
  claims.balls.clear();

  setupFormation(world);
}

export function setupFormation(world: EcsWorld): void {
  clearEffects(world);
  for (const entity of world.query('player')) {
    const tag = world.get(entity, 'player');
    if (!tag) continue;
    const [x, y] = SPAWNS[tag.team][tag.slot];
    resetPlayer(world, entity, x, y);
  }
  const ballEntities = world.query('ball');
  ballEntities.forEach((entity, index) => {
    const [x, y] = BALL_SPAWNS[index % BALL_SPAWNS.length];
    placeBall(world, entity, x, y);
  });
}

export function resetPlayer(world: EcsWorld, entity: number, x: number, y: number): void {
  const transform = world.get(entity, 'transform');
  const tag = world.get(entity, 'player');
  const condition = world.get(entity, 'condition');
  const carry = world.get(entity, 'carry');
  const action = world.get(entity, 'action');
  const cooldowns = world.get(entity, 'cooldowns');
  const trail = world.get(entity, 'trail');
  const stats = world.get(entity, 'stats');
  const brain = world.get(entity, 'brain');
  if (!transform || !tag || !condition || !carry || !action || !cooldowns) return;

  transform.x = x;
  transform.y = y;
  transform.vx = 0;
  transform.vy = 0;
  transform.facing = homeFacing(tag.team);

  condition.alive = true;
  condition.hasGlasses = tag.glasses;
  condition.enteringTime = 0;
  condition.hitFlash = 0;
  condition.outAt = 0;
  condition.outX = x;
  condition.outY = y;

  carry.ball = null;

  action.charge = 0;
  action.charging = false;
  action.dashTime = 0;
  action.dashCd = 0;
  action.dashX = 1;
  action.dashY = 0;

  cooldowns.catchWindow = 0;
  cooldowns.catchCd = 0;
  cooldowns.throwCd = 0;
  cooldowns.pickupCd = 0;

  if (trail) trail.points = [];
  if (stats) {
    stats.throws = 0;
    stats.catches = 0;
    stats.outs = 0;
  }
  if (brain) {
    brain.seek = null;
    brain.target = null;
    brain.targetTimer = 0;
    brain.aimTimer = 0;
    brain.releaseDelay = 0;
    brain.catchBall = null;
    brain.willCatch = false;
    brain.anchorX = x;
    brain.anchorY = y;
    brain.anchorTimer = 0;
  }
}

/** Rule 25.2: return from the queue over the back line. */
export function reenterPlayer(world: EcsWorld, entity: number): void {
  const transform = world.get(entity, 'transform');
  const tag = world.get(entity, 'player');
  const condition = world.get(entity, 'condition');
  const carry = world.get(entity, 'carry');
  const action = world.get(entity, 'action');
  const cooldowns = world.get(entity, 'cooldowns');
  const trail = world.get(entity, 'trail');
  const brain = world.get(entity, 'brain');
  if (!transform || !tag || !condition || !carry || !action || !cooldowns) return;

  const [x, y] = SPAWNS[tag.team][tag.slot];
  condition.alive = true;
  transform.x = x;
  transform.y = y;
  transform.vx = 0;
  transform.vy = 0;
  carry.ball = null;
  action.charge = 0;
  action.charging = false;
  action.dashTime = 0;
  action.dashCd = 0.2;
  cooldowns.catchWindow = 0;
  cooldowns.catchCd = 0.4;
  cooldowns.throwCd = 0;
  cooldowns.pickupCd = 0.3;
  condition.hitFlash = 0;
  condition.enteringTime = ENTER_GRACE;
  condition.outAt = 0;
  if (trail) trail.points = [];
  if (brain) {
    brain.seek = null;
    brain.target = null;
    brain.targetTimer = 0;
    brain.releaseDelay = 0;
    brain.catchBall = null;
    brain.willCatch = false;
  }
}

export function placeBall(world: EcsWorld, entity: number, x: number, y: number): void {
  const transform = world.get(entity, 'transform');
  const state = world.get(entity, 'ballState');
  const held = world.get(entity, 'held');
  const trail = world.get(entity, 'ballTrail');
  const tag = world.get(entity, 'ball');
  if (!transform || !state || !held) return;

  held.by = null;
  state.live = false;
  state.armed = false;
  state.rush = true;
  state.canOut = true;
  state.team = null;
  state.thrower = null;
  state.throwerTeam = null;
  state.touched = false;
  state.validAttempt = false;
  state.warningIssued = false;
  state.ignore = null;
  state.ignoreTime = 0;
  state.bounces = 0;
  state.pickupCd = 0;
  state.releasePositions = [];

  transform.x = x;
  transform.y = y;
  transform.vx = 0;
  transform.vy = 0;
  if (tag) tag.age = 0;
  if (trail) trail.points = [];
}

function clearEffects(world: EcsWorld): void {
  for (const key of ['particle', 'floater', 'glasses'] as const) {
    for (const entity of world.query(key)) world.despawn(entity);
  }
}
