import { ATTACK_DIST, BALL_RADIUS, COURT } from './constants';
import { angleTo, clamp, closestApproach, dist, norm, rand } from './math';
import type { Player } from './entities';
import type { Intent } from './types';
import type { GameWorld } from './world';

interface Threat {
  ball: { id: string; x: number; y: number; vx: number; vy: number };
  t: number;
  d: number;
}

const baseIntent = (aim: number): Intent => ({
  mx: 0,
  my: 0,
  aim,
  charge: false,
  release: false,
  dash: false,
  catch: false,
});

/** The incoming ball most likely to ruin this player's day. */
function findThreat(player: Player, world: GameWorld): Threat | null {
  let best: Threat | null = null;
  for (const ball of world.balls) {
    if (!ball.live || ball.heldBy || ball.team === player.team) continue;
    const approach = closestApproach(
      player.x,
      player.y,
      ball.x,
      ball.y,
      ball.vx,
      ball.vy,
      0.85,
    );
    if (approach.t <= 0.04) continue;
    const clearance = player.radius + BALL_RADIUS + 13;
    if (approach.d > clearance) continue;
    if (!best || approach.t < best.t) best = { ball, t: approach.t, d: approach.d };
  }
  return best;
}

function chooseTarget(player: Player, foes: Player[]): Player {
  let best = foes[0];
  let bestScore = Infinity;
  for (const foe of foes) {
    let score = dist(player.x, player.y, foe.x, foe.y);
    if (foe.ball) score -= 130;
    if (foe.charging) score -= 70;
    score += rand(-70, 70);
    if (score < bestScore) {
      bestScore = score;
      best = foe;
    }
  }
  return best;
}

/** Sidestep perpendicular to the incoming ball's path. */
function dodgeDirection(
  player: Player,
  ball: Threat['ball'],
  world: GameWorld,
): { x: number; y: number } {
  const angle = Math.atan2(ball.vy, ball.vx);
  const perpA = angle + Math.PI / 2;
  const perpB = angle - Math.PI / 2;
  const relX = player.x - ball.x;
  const relY = player.y - ball.y;
  const dotA = Math.cos(perpA) * relX + Math.sin(perpA) * relY;
  const perp = dotA >= 0 ? perpA : perpB;

  let dx = Math.cos(perp);
  let dy = Math.sin(perp);
  const away = norm(relX, relY);
  dx += away.x * 0.45;
  dy += away.y * 0.45;

  const bounds = world.bounds(player.team);
  if (player.x + dx * 90 < bounds.minX + 26) dx = Math.abs(dx) + 0.7;
  if (player.x + dx * 90 > bounds.maxX - 26) dx = -Math.abs(dx) - 0.7;
  if (player.y + dy * 90 < COURT.y + 34) dy = Math.abs(dy) + 0.7;
  if (player.y + dy * 90 > COURT.bottom - 34) dy = -Math.abs(dy) - 0.7;

  const n = norm(dx, dy);
  return { x: n.x, y: n.y };
}

/**
 * Decide what an AI player wants to do this frame: where to move, where to
 * aim, and whether to charge, throw, dash or catch.
 *
 * Rule-aware behaviour:
 *  - 13.6/13.7: race for a centre ball, then carry it behind the attack line
 *  - 17.3: hurry the throw when our team is on the shot clock
 *  - 21 / 9.7.1: only block with a ball, never during sudden death
 */
export function buildAIIntent(world: GameWorld, player: Player, dt: number): Intent {
  const ai = player.ai;
  const diff = ai.diff;
  const intent = baseIntent(player.facing);
  if (!player.alive || !diff) return intent;

  const foes = world.players.filter((p) => p.alive && p.team !== player.team);
  if (!foes.length) return intent;
  const mates = world.players.filter((p) => p.alive && p.team === player.team && p !== player);
  const bounds = world.bounds(player.team);

  // --- refresh noisy internal state
  ai.strafeTimer -= dt;
  if (ai.strafeTimer <= 0) {
    ai.strafe = Math.random() < 0.5 ? -1 : 1;
    ai.strafeTimer = rand(0.8, 1.8);
  }

  ai.aimTimer -= dt;
  if (ai.aimTimer <= 0) {
    ai.aimError = rand(-1, 1) * diff.aimError;
    ai.aimTimer = rand(0.25, 0.5);
  }

  ai.targetTimer -= dt;
  if (ai.targetTimer <= 0 || !ai.target || !ai.target.alive || ai.target.team === player.team) {
    ai.targetTimer = rand(0.45, 0.9);
    ai.target = chooseTarget(player, foes);
  }
  const target = ai.target && ai.target.alive ? ai.target : foes[0];

  // --- aim, leading the target's movement
  const throwSpeed = 1150;
  const dTarget = dist(player.x, player.y, target.x, target.y);
  const timeToTarget = dTarget / throwSpeed;
  const aimX = target.x + target.vx * timeToTarget * diff.lead;
  const aimY = target.y + target.vy * timeToTarget * diff.lead;
  intent.aim =
    angleTo(player.x, player.y, aimX, aimY) + ai.aimError * (0.65 + dTarget / 1100);

  const unarmed = !!player.ball && !player.ball.armed;

  // --- attack: charge up, then let fly (only with an armed ball)
  if (player.ball && player.ball.armed && dTarget < 1020) {
    const desiredCharge = clamp(0.42 + dTarget / 1500, 0.45, 1);
    if (!player.charging) {
      intent.charge = true;
      ai.releaseDelay = diff.throwDelay * rand(0.7, 1.4);
    } else {
      intent.charge = true;
      if (player.charge >= desiredCharge) {
        ai.releaseDelay -= dt;
        if (ai.releaseDelay <= 0) {
          intent.release = true;
          ai.releaseDelay = diff.throwDelay * rand(1.5, 3);
        }
      }
    }
    // Rule 17.3: don't get caught holding the ball on the shot clock.
    if (world.shotTeam === player.team && world.shotClock <= 3.2) intent.release = true;
  }

  // --- movement defaults by role
  let mx = 0;
  let my = 0;

  if (unarmed) {
    // Rule 13.7.1: carry the ball behind the attack line before throwing.
    const retreatX =
      player.team === 'blue'
        ? COURT.cx - ATTACK_DIST - 45
        : COURT.cx + ATTACK_DIST + 45;
    mx = Math.sign(retreatX - player.x) || 0;
    my = Math.sin(world.time * 1.4 + ai.phase) * 0.45;
    if (player.dashCd <= 0 && Math.abs(retreatX - player.x) > 90 && Math.random() < 0.4) {
      intent.dash = true;
    }
  } else if (player.ball) {
    // Kite: hold a comfortable throwing distance from the target.
    const preferred = 300 + Math.sin(world.time * 0.7 + ai.phase) * 70;
    const angle = angleTo(player.x, player.y, target.x, target.y);
    const closing = clamp((dTarget - preferred) / 240, -1, 1);
    const strafeAngle = angle + ai.strafe * (Math.PI / 2);
    mx = Math.cos(angle) * closing + Math.cos(strafeAngle) * 0.9;
    my = Math.sin(angle) * closing + Math.sin(strafeAngle) * 0.9;
  } else {
    const claimed = world.claimFor(player);
    if (claimed && !claimed.heldBy && !claimed.live) {
      const n = norm(claimed.x - player.x, claimed.y - player.y);
      mx = n.x;
      my = n.y;
      const d = dist(player.x, player.y, claimed.x, claimed.y);
      const rushUrgency = world.rushActive ? 6 : 2.2;
      if (d > 140 && player.dashCd <= 0 && Math.random() < diff.dashChance * dt * rushUrgency) {
        intent.dash = true;
      }
    } else {
      // Nothing to fetch: hold a line, shuffle sideways, dare them to throw.
      ai.anchorTimer -= dt;
      if (ai.anchorTimer <= 0) {
        ai.anchorTimer = rand(0.6, 1.2);
        const lineX = player.team === 'blue' ? COURT.cx - 175 : COURT.cx + 175;
        let safeX = lineX;
        for (const foe of foes) {
          if (!foe.ball) continue;
          safeX =
            player.team === 'blue'
              ? Math.min(safeX, foe.x - 230)
              : Math.max(safeX, foe.x + 230);
        }
        safeX = clamp(safeX, bounds.minX + 80, bounds.maxX - 80);
        ai.anchorX = clamp(safeX + rand(-45, 45), bounds.minX + 70, bounds.maxX - 70);
        ai.anchorY = clamp(
          target.y + Math.sin(world.time * 0.9 + ai.phase) * 150,
          COURT.y + 70,
          COURT.bottom - 70,
        );
      }
      const n = norm(ai.anchorX - player.x, ai.anchorY - player.y);
      mx = n.x;
      my = n.y;
    }
  }

  // --- personal space
  for (const mate of mates) {
    const d = dist(player.x, player.y, mate.x, mate.y);
    if (d < 66 && d > 0.01) {
      mx += ((player.x - mate.x) / d) * 0.9;
      my += ((player.y - mate.y) / d) * 0.9;
    }
  }

  // --- incoming ball? catch it, block it, or get out of the way
  const threat = findThreat(player, world);
  if (threat) {
    const ball = threat.ball;
    if (ai.catchBallId !== ball.id) {
      ai.catchBallId = ball.id;
      const canBlock = !world.suddenDeath;
      ai.willCatch = (!player.ball || canBlock) && Math.random() < diff.catchChance;
    }
    if (ai.willCatch && player.catchCd <= 0 && threat.t < 0.3) intent.catch = true;

    if (Math.random() < diff.dodge || threat.t < 0.35) {
      const dodge = dodgeDirection(player, ball, world);
      mx = dodge.x;
      my = dodge.y;
      if (threat.t < 0.3 && player.dashCd <= 0 && Math.random() < diff.dashChance) {
        intent.dash = true;
      }
    }
  }

  // --- don't scrape the walls
  if (player.x < bounds.minX + 46 && mx < 0) mx *= 0.12;
  if (player.x > bounds.maxX - 46 && mx > 0) mx *= 0.12;
  if (player.y < COURT.y + 56 && my < 0) my *= 0.12;
  if (player.y > COURT.bottom - 56 && my > 0) my *= 0.12;

  const move = norm(mx, my);
  intent.mx = move.x;
  intent.my = move.y;
  return intent;
}
