import type { World, Entity } from './ecs';
import type {
  Action,
  BallState,
  BallTag,
  BallTrail,
  Brain,
  Carry,
  Condition,
  Cooldowns,
  Held,
  PlayerStats,
  PlayerTag,
  Trail,
  Transform,
} from './components';
import { ATTACK_DIST, COURT, SHOT_CLOCK } from './constants';
import type { Intent, TeamId } from './types';

/** A player entity's components, gathered so systems can read them by name. */
export interface PlayerView {
  readonly entity: Entity;
  readonly transform: Transform;
  readonly tag: PlayerTag;
  readonly condition: Condition;
  readonly carry: Carry;
  readonly action: Action;
  readonly cooldowns: Cooldowns;
  readonly intent: Intent;
  readonly brain: Brain;
  readonly trail: Trail;
  readonly stats: PlayerStats;
}

export interface BallView {
  readonly entity: Entity;
  readonly transform: Transform;
  readonly tag: BallTag;
  readonly state: BallState;
  readonly held: Held;
  readonly trail: BallTrail;
}

export function playerView(world: World, entity: Entity): PlayerView {
  return {
    entity,
    transform: world.get(entity, 'transform')!,
    tag: world.get(entity, 'player')!,
    condition: world.get(entity, 'condition')!,
    carry: world.get(entity, 'carry')!,
    action: world.get(entity, 'action')!,
    cooldowns: world.get(entity, 'cooldowns')!,
    intent: world.get(entity, 'intent')!,
    brain: world.get(entity, 'brain')!,
    trail: world.get(entity, 'trail')!,
    stats: world.get(entity, 'stats')!,
  };
}

export function players(world: World): PlayerView[] {
  return world.query('player').map((entity) => playerView(world, entity));
}

export function ballView(world: World, entity: Entity): BallView {
  return {
    entity,
    transform: world.get(entity, 'transform')!,
    tag: world.get(entity, 'ball')!,
    state: world.get(entity, 'ballState')!,
    held: world.get(entity, 'held')!,
    trail: world.get(entity, 'ballTrail')!,
  };
}

export function balls(world: World): BallView[] {
  return world.query('ball').map((entity) => ballView(world, entity));
}

export function human(world: World): PlayerView | null {
  const [entity] = world.query('player', 'human');
  return entity === undefined ? null : playerView(world, entity);
}

export function carriedBall(world: World, view: PlayerView): BallView | null {
  return view.carry.ball === null ? null : ballView(world, view.carry.ball);
}

// ------------------------------------------------------------------ geometry

const HALVES: Record<TeamId, { minX: number; maxX: number }> = {
  blue: { minX: COURT.x, maxX: COURT.cx - 2 },
  red: { minX: COURT.cx + 2, maxX: COURT.right },
};

export function bounds(world: World, team: TeamId): { minX: number; maxX: number } {
  if (!world.resource('rush').active) return HALVES[team];
  // Rule 13.6.2: you may touch or cross the centre line during the rush.
  return team === 'blue'
    ? { minX: COURT.x, maxX: COURT.cx + 26 }
    : { minX: COURT.cx - 26, maxX: COURT.right };
}

export function attackLineX(team: TeamId): number {
  return team === 'blue' ? COURT.cx - ATTACK_DIST : COURT.cx + ATTACK_DIST;
}

/** Rule 13.7.1: a rushed ball arms once it fully crosses the attack line. */
export function behindAttackLine(view: PlayerView): boolean {
  return view.tag.team === 'blue'
    ? view.transform.x < attackLineX('blue')
    : view.transform.x > attackLineX('red');
}

export function isOpponentSide(team: TeamId, x: number): boolean {
  return team === 'blue' ? x > COURT.cx : x < COURT.cx;
}

// -------------------------------------------------------------------- counts

export function aliveCount(world: World, team: TeamId): number {
  let alive = 0;
  for (const view of players(world)) {
    if (view.condition.alive && view.tag.team === team) alive += 1;
  }
  return alive;
}

export function heldCount(world: World, team: TeamId): number {
  let held = 0;
  for (const view of players(world)) {
    if (view.condition.alive && view.tag.team === team && view.carry.ball !== null) held += 1;
  }
  return held;
}

/** Rule 17.3: who holds the ball advantage right now. */
export function advantageTeam(world: World): TeamId | null {
  const heldBlue = heldCount(world, 'blue');
  const heldRed = heldCount(world, 'red');
  if (heldBlue + heldRed === 0) return null;

  if (heldBlue !== heldRed) return heldBlue > heldRed ? 'blue' : 'red';

  const aliveBlue = aliveCount(world, 'blue');
  const aliveRed = aliveCount(world, 'red');
  if (aliveBlue !== aliveRed) return aliveBlue > aliveRed ? 'blue' : 'red';

  const lastThrow = world.resource('lastThrow').team;
  if (lastThrow) return lastThrow === 'blue' ? 'red' : 'blue';

  const lastSet = world.resource('lastSet').winner;
  if (lastSet) return lastSet === 'blue' ? 'red' : 'blue';
  return null;
}

export function resetShotClock(world: World): void {
  const shot = world.resource('shot');
  shot.team = null;
  shot.clock = SHOT_CLOCK;
  shot.beep = 99;
}

/** Court halves, ignoring the opening-rush leeway. */
export function halves(team: TeamId): { minX: number; maxX: number } {
  return HALVES[team];
}
