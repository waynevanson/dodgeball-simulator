import type { World } from '../ecs';
import { sfx } from '../audio';
import { ATTACK_DIST } from '../constants/pitch';
import { SHOT_CLOCK, SHOT_CLOCK_WARN } from '../constants/rules';
import { TEAMS } from '../constants/teams';
import { COURT } from '../constants/view';
import { addFloater } from '../effects/floaters';
import { burst, ring } from '../effects/particles';
import { rand } from '../math';
import { advantageTeam, balls, behindAttackLine, carriedBall, players, resetShotClock } from '../queries';
import { SPAWNS } from '../spawn/formation';
import type { TeamId } from '../types';

// -------------------------------------------------------------------- rules

/** Rule 13.7.1: a rushed ball arms once it fully crosses the attack line. */
export function updateArming(world: World): void {
  for (const player of players(world)) {
    const ball = carriedBall(world, player);
    if (!player.condition.alive || !ball || ball.state.armed) continue;
    if (behindAttackLine(player)) {
      ball.state.armed = true;
      addFloater(world, player.transform.x, player.transform.y - 42, 'ARMED', '#ffe9a8', 0.85);
      ring(world, player.transform.x, player.transform.y, '#fbbf24', 18);
      sfx.pickup();
    }
  }
}

export function updateRush(world: World): void {
  if (!world.resource('rush').active) return;
  if (balls(world).every((ball) => ball.state.touched)) endRush(world);
}

export function endRush(world: World): void {
  const rush = world.resource('rush');
  if (!rush.active) return;
  rush.active = false;
  for (const ball of balls(world)) {
    // Balls still on the floor are ordinary dead balls now.
    if (ball.held.by === null) {
      ball.state.rush = false;
      ball.state.armed = true;
    }
  }
}

export function updateShotClock(world: World, dt: number): void {
  const shot = world.resource('shot');
  const advantage = advantageTeam(world);
  if (advantage !== shot.team) {
    shot.team = advantage;
    shot.clock = SHOT_CLOCK;
    shot.beep = 99;
  }
  if (!advantage) return;

  shot.clock = Math.max(0, shot.clock - dt);
  const secs = Math.ceil(shot.clock);
  if (secs !== shot.beep && secs <= SHOT_CLOCK_WARN && secs > 0) {
    shot.beep = secs;
    sfx.beep(secs === 1);
  }
  if (shot.clock <= 0) forfeitPossession(world, advantage);
}

/** Rule 17.3.3: ten seconds without an attempt forfeits every held ball. */
export function forfeitPossession(world: World, team: TeamId): void {
  const opponent: TeamId = team === 'blue' ? 'red' : 'blue';
  const dropX = opponent === 'blue' ? COURT.cx - ATTACK_DIST - 80 : COURT.cx + ATTACK_DIST + 80;

  for (const player of players(world)) {
    if (player.tag.team !== team) continue;
    const ball = carriedBall(world, player);
    if (!ball) continue;
    player.carry.ball = null;
    player.action.charging = false;
    player.action.charge = 0;
    ball.held.by = null;
    ball.state.live = false;
    ball.state.team = null;
    ball.state.armed = true;
    ball.state.rush = false;
    ball.state.thrower = null;
    ball.state.throwerTeam = null;
    ball.transform.x = dropX;
    ball.transform.y = rand(COURT.y + 90, COURT.bottom - 90);
    ball.transform.vx = 0;
    ball.transform.vy = 0;
    ball.state.pickupCd = 0.2;
    burst(world, ball.transform.x, ball.transform.y, TEAMS[opponent].light, 8, 0.7, 'spark');
  }

  lineUp(world);
  addFloater(world, COURT.cx, COURT.cy - 10, '10s — BALLS FORFEITED', '#fbbf24', 1.8);
  addFloater(world, COURT.cx, COURT.cy + 24, 'LINE UP', '#e2e8f0', 1.6);
  const feedback = world.resource('feedback');
  feedback.shake = Math.max(feedback.shake, 8);
  sfx.whistle();
  resetShotClock(world);
}

export function lineUp(world: World): void {
  for (const player of players(world)) {
    if (!player.condition.alive) continue;
    const [x, y] = SPAWNS[player.tag.team][player.tag.slot];
    player.transform.x = x;
    player.transform.y = y;
    player.transform.vx = 0;
    player.transform.vy = 0;
    player.action.charging = false;
    player.action.charge = 0;
    player.cooldowns.catchWindow = 0;
    player.trail.points = [];
  }
}

export function enterSuddenDeath(world: World): void {
  world.resource('set').suddenDeath = true;
  addFloater(world, COURT.cx, COURT.cy - 40, 'SUDDEN DEATH', '#ff8a9a', 2.4);
  addFloater(world, COURT.cx, COURT.cy + 2, 'BLOCKING DISABLED', 'rgba(255,194,202,0.9)', 2.4);
  const feedback = world.resource('feedback');
  feedback.shake = Math.max(feedback.shake, 7);
  sfx.whistle();
}
