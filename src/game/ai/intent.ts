import type { World } from '../ecs';
import { ATTACK_DIST } from '../constants/pitch';
import { COURT } from '../constants/view';
import { angleTo, clamp, dist, norm, rand } from '../math';
import { bounds, carriedBall, playerView, players } from '../queries';
import type { PlayerView } from '../queries';
import type { Intent } from '../types';
import { baseIntent, chooseTarget } from './targets';
import { dodgeDirection, findThreat } from './threats';

/**
 * Decide what an AI player wants to do this frame: where to move, where to
 * aim, and whether to charge, throw, dash or catch.
 *
 * Rule-aware behaviour:
 *  - 13.6/13.7: race for a centre ball, then carry it behind the attack line
 *  - 17.3: hurry the throw when our team is on the shot clock
 *  - 21 / 9.7.1: only block with a ball, never during sudden death
 */
export function buildAIIntent(world: World, view: PlayerView, dt: number): Intent {
  const brain = view.brain;
  const diff = brain.diff;
  const transform = view.transform;
  const intent = baseIntent(transform.facing);
  if (!view.condition.alive || !diff) return intent;

  const everyone = players(world);
  const foes = everyone.filter((p) => p.condition.alive && p.tag.team !== view.tag.team);
  if (!foes.length) return intent;
  const mates = everyone.filter(
    (p) => p.condition.alive && p.tag.team === view.tag.team && p.entity !== view.entity,
  );
  const area = bounds(world, view.tag.team);
  const clock = world.resource('clock').sim;
  const shot = world.resource('shot');
  const rush = world.resource('rush');

  // --- refresh noisy internal state
  brain.strafeTimer -= dt;
  if (brain.strafeTimer <= 0) {
    brain.strafe = Math.random() < 0.5 ? -1 : 1;
    brain.strafeTimer = rand(0.8, 1.8);
  }

  brain.aimTimer -= dt;
  if (brain.aimTimer <= 0) {
    brain.aimError = rand(-1, 1) * diff.aimError;
    brain.aimTimer = rand(0.25, 0.5);
  }

  const currentTarget = brain.target === null ? null : playerView(world, brain.target);
  brain.targetTimer -= dt;
  if (
    brain.targetTimer <= 0 ||
    !currentTarget ||
    !currentTarget.condition.alive ||
    currentTarget.tag.team === view.tag.team
  ) {
    brain.targetTimer = rand(0.45, 0.9);
    brain.target = chooseTarget(world, view, foes).entity;
  }
  const target = brain.target !== null ? playerView(world, brain.target) : foes[0];
  const liveTarget = target.condition.alive ? target : foes[0];

  // --- aim, leading the target's movement
  const throwSpeed = 1150;
  const dTarget = dist(transform.x, transform.y, liveTarget.transform.x, liveTarget.transform.y);
  const timeToTarget = dTarget / throwSpeed;
  const aimX = liveTarget.transform.x + liveTarget.transform.vx * timeToTarget * diff.lead;
  const aimY = liveTarget.transform.y + liveTarget.transform.vy * timeToTarget * diff.lead;
  intent.aim =
    angleTo(transform.x, transform.y, aimX, aimY) + brain.aimError * (0.65 + dTarget / 1100);

  const held = carriedBall(world, view);
  const unarmed = !!held && !held.state.armed;

  // --- attack: charge up, then let fly (only with an armed ball)
  if (held && held.state.armed && dTarget < 1020) {
    const desiredCharge = clamp(0.42 + dTarget / 1500, 0.45, 1);
    if (!view.action.charging) {
      intent.charge = true;
      brain.releaseDelay = diff.throwDelay * rand(0.7, 1.4);
    } else {
      intent.charge = true;
      if (view.action.charge >= desiredCharge) {
        brain.releaseDelay -= dt;
        if (brain.releaseDelay <= 0) {
          intent.release = true;
          brain.releaseDelay = diff.throwDelay * rand(1.5, 3);
        }
      }
    }
    // Rule 17.3: don't get caught holding the ball on the shot clock.
    if (shot.team === view.tag.team && shot.clock <= 3.2) intent.release = true;
  }

  // --- movement defaults by role
  let mx = 0;
  let my = 0;

  if (unarmed) {
    // Rule 13.7.1: carry the ball behind the attack line before throwing.
    const retreatX =
      view.tag.team === 'blue' ? COURT.cx - ATTACK_DIST - 45 : COURT.cx + ATTACK_DIST + 45;
    mx = Math.sign(retreatX - transform.x) || 0;
    my = Math.sin(clock * 1.4 + brain.phase) * 0.45;
    if (view.action.dashCd <= 0 && Math.abs(retreatX - transform.x) > 90 && Math.random() < 0.4) {
      intent.dash = true;
    }
  } else if (held) {
    // Kite: hold a comfortable throwing distance from the target.
    const preferred = 300 + Math.sin(clock * 0.7 + brain.phase) * 70;
    const angle = angleTo(transform.x, transform.y, liveTarget.transform.x, liveTarget.transform.y);
    const closing = clamp((dTarget - preferred) / 240, -1, 1);
    const strafeAngle = angle + brain.strafe * (Math.PI / 2);
    mx = Math.cos(angle) * closing + Math.cos(strafeAngle) * 0.9;
    my = Math.sin(angle) * closing + Math.sin(strafeAngle) * 0.9;
  } else {
    const claims = world.resource('claims');
    const claimedEntity = claims.byPlayer.get(view.entity);
    const claimed = claimedEntity === undefined ? null : world.get(claimedEntity, 'ballState');
    const claimedTransform = claimedEntity === undefined ? null : world.get(claimedEntity, 'transform');
    const claimedHeld = claimedEntity === undefined ? null : world.get(claimedEntity, 'held');
    if (claimed && claimedTransform && claimedHeld && claimedHeld.by === null && !claimed.live) {
      const n = norm(claimedTransform.x - transform.x, claimedTransform.y - transform.y);
      mx = n.x;
      my = n.y;
      const d = dist(transform.x, transform.y, claimedTransform.x, claimedTransform.y);
      const rushUrgency = rush.active ? 6 : 2.2;
      if (d > 140 && view.action.dashCd <= 0 && Math.random() < diff.dashChance * dt * rushUrgency) {
        intent.dash = true;
      }
    } else {
      // Nothing to fetch: hold a line, shuffle sideways, dare them to throw.
      brain.anchorTimer -= dt;
      if (brain.anchorTimer <= 0) {
        brain.anchorTimer = rand(0.6, 1.2);
        const lineX = view.tag.team === 'blue' ? COURT.cx - 175 : COURT.cx + 175;
        let safeX = lineX;
        for (const foe of foes) {
          if (!carriedBall(world, foe)) continue;
          safeX =
            view.tag.team === 'blue'
              ? Math.min(safeX, foe.transform.x - 230)
              : Math.max(safeX, foe.transform.x + 230);
        }
        safeX = clamp(safeX, area.minX + 80, area.maxX - 80);
        brain.anchorX = clamp(safeX + rand(-45, 45), area.minX + 70, area.maxX - 70);
        brain.anchorY = clamp(
          liveTarget.transform.y + Math.sin(clock * 0.9 + brain.phase) * 150,
          COURT.y + 70,
          COURT.bottom - 70,
        );
      }
      const n = norm(brain.anchorX - transform.x, brain.anchorY - transform.y);
      mx = n.x;
      my = n.y;
    }
  }

  // --- personal space
  for (const mate of mates) {
    const d = dist(transform.x, transform.y, mate.transform.x, mate.transform.y);
    if (d < 66 && d > 0.01) {
      mx += ((transform.x - mate.transform.x) / d) * 0.9;
      my += ((transform.y - mate.transform.y) / d) * 0.9;
    }
  }

  // --- incoming ball? catch it, block it, or get out of the way
  const threat = findThreat(world, view);
  if (threat) {
    if (brain.catchBall !== threat.ball.entity) {
      brain.catchBall = threat.ball.entity;
      const canBlock = !world.resource('set').suddenDeath;
      brain.willCatch = (!held || canBlock) && Math.random() < diff.catchChance;
    }
    if (brain.willCatch && view.cooldowns.catchCd <= 0 && threat.t < 0.3) intent.catch = true;

    if (Math.random() < diff.dodge || threat.t < 0.35) {
      const dodge = dodgeDirection(world, view, threat.ball);
      mx = dodge.x;
      my = dodge.y;
      if (threat.t < 0.3 && view.action.dashCd <= 0 && Math.random() < diff.dashChance) {
        intent.dash = true;
      }
    }
  }

  // --- don't scrape the walls
  if (transform.x < area.minX + 46 && mx < 0) mx *= 0.12;
  if (transform.x > area.maxX - 46 && mx > 0) mx *= 0.12;
  if (transform.y < COURT.y + 56 && my < 0) my *= 0.12;
  if (transform.y > COURT.bottom - 56 && my > 0) my *= 0.12;

  const move = norm(mx, my);
  intent.mx = move.x;
  intent.my = move.y;
  return intent;
}
