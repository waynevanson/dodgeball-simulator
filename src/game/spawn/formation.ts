import { EcsWorld } from '../../ecs/core';
import { BALL_MARK_SPACING, PLAYER_RADIUS } from '../constants/pitch';
import { ENTER_GRACE } from '../constants/rules';
import { COURT } from '../constants/view';
import type { TeamId } from '../types';

/**
 * Rule 13.1 / 9.3: both teams line up with a foot on the back line.
 * Six players per team spread along the line; the chosen human keeps a slot.
 */
export const BACKLINE_Y = [-225, -135, -45, 45, 135, 225];

export const SPAWNS: Record<TeamId, Array<[number, number]>> = {
  blue: BACKLINE_Y.map((offset) => [COURT.x + PLAYER_RADIUS + 2, COURT.cy + offset]),
  red: BACKLINE_Y.map((offset) => [COURT.right - PLAYER_RADIUS - 2, COURT.cy + offset]),
};

/**
 * Rule 12.1.2 (Foam): three balls per team on the centre line, 1.5m apart,
 * sitting on each team's side of the line.
 */
export const BALL_SPAWNS: Array<[number, number]> = [
  [COURT.cx - 22, COURT.cy - BALL_MARK_SPACING],
  [COURT.cx - 22, COURT.cy],
  [COURT.cx - 22, COURT.cy + BALL_MARK_SPACING],
  [COURT.cx + 22, COURT.cy - BALL_MARK_SPACING],
  [COURT.cx + 22, COURT.cy],
  [COURT.cx + 22, COURT.cy + BALL_MARK_SPACING],
];

/** Facing is towards the opposition at the start of a set. */
export const homeFacing = (team: TeamId): number => (team === 'blue' ? 0 : Math.PI);

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

export function clearEffects(world: EcsWorld): void {
  for (const key of ['particle', 'floater', 'glasses'] as const) {
    for (const entity of world.query(key)) world.despawn(entity);
  }
}
