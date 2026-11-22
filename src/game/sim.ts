import type { EcsWorld } from '../ecs/core';
import { buildAIIntent } from './ai';
import { sfx } from './audio';
import {
  ATTACK_DIST,
  COURT,
  NEAR_MISS,
  PHYS,
  SHOT_CLOCK,
  SHOT_CLOCK_WARN,
  TEAMS,
} from './constants';
import { addFloater, burst, dropGlasses, onDash, ring } from './effects';
import type { Input } from './input';
import { angleTo, clamp, dist, norm, rand } from './math';
import {
  advantageTeam,
  balls,
  behindAttackLine,
  bounds,
  carriedBall,
  halves,
  isOpponentSide,
  players,
  playerView,
  resetShotClock,
  type BallView,
  type PlayerView,
} from './queries';
import { reenterPlayer, SPAWNS } from './spawn';
import type { Intent, TeamId } from './types';

/**
 * The simulation, as plain functions over ECS state. `simulate` runs at a fixed
 * substep; everything else is called from it or from the frame systems in
 * `systems.ts`.
 */

// ------------------------------------------------------------------- intents

export function buildIntents(world: EcsWorld, input: Input, dt: number): void {
  assignClaims(world);
  for (const view of players(world)) {
    if (!view.condition.alive) continue;
    const intent = view.tag.isHuman
      ? humanIntent(world, view, input)
      : buildAIIntent(world, view, dt);
    Object.assign(view.intent, intent);
  }
}

/** Nearest eligible ball per player, rebuilt every frame for the AI. */
function assignClaims(world: EcsWorld): void {
  const claims = world.resource('claims');
  claims.byPlayer.clear();
  claims.balls.clear();

  const seekers = players(world).filter(
    (view) => view.condition.alive && view.carry.ball === null && !view.tag.isHuman,
  );
  const free = balls(world).filter((ball) => ball.held.by === null && !ball.state.live);
  if (!seekers.length || !free.length) return;

  const pairs: Array<{ player: PlayerView; ball: BallView; cost: number }> = [];
  for (const player of seekers) {
    const area = halves(player.tag.team);
    for (const ball of free) {
      if (ball.transform.x < area.minX - 6 || ball.transform.x > area.maxX + 6) continue;
      let cost = dist(
        player.transform.x,
        player.transform.y,
        ball.transform.x,
        ball.transform.y,
      );
      if (player.brain.seek === ball.entity) cost -= 70;
      pairs.push({ player, ball, cost });
    }
  }

  pairs.sort((a, b) => a.cost - b.cost);
  for (const { player, ball } of pairs) {
    if (claims.byPlayer.has(player.entity) || claims.balls.has(ball.entity)) continue;
    claims.byPlayer.set(player.entity, ball.entity);
    claims.balls.add(ball.entity);
    player.brain.seek = ball.entity;
  }
}

function humanIntent(world: EcsWorld, view: PlayerView, input: Input): Intent {
  const intent: Intent = {
    mx: 0,
    my: 0,
    aim: view.transform.facing,
    charge: false,
    release: false,
    dash: false,
    catch: false,
  };
  if (!view.condition.alive) return intent;

  if (input.usingTouch) {
    intent.mx = input.touch.mx;
    intent.my = input.touch.my;
    intent.aim = autoAim(world, view);
    intent.charge = input.touch.throwDown;
    intent.release = !input.touch.throwDown;
    if (input.takeTouchAction('dash')) intent.dash = true;
    if (input.takeTouchAction('catch')) intent.catch = true;
    return intent;
  }

  let mx = 0;
  let my = 0;
  if (input.isDown('KeyD', 'ArrowRight')) mx += 1;
  if (input.isDown('KeyA', 'ArrowLeft')) mx -= 1;
  if (input.isDown('KeyS', 'ArrowDown')) my += 1;
  if (input.isDown('KeyW', 'ArrowUp')) my -= 1;
  intent.mx = mx;
  intent.my = my;

  intent.aim = input.mouse.used
    ? Math.atan2(input.mouse.y - view.transform.y, input.mouse.x - view.transform.x)
    : view.transform.facing;
  intent.charge = input.mouse.left;
  intent.release = !input.mouse.left;
  intent.dash = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
  intent.catch = input.pressed('Space') || input.pressed('KeyE') || input.mouse.rightPressed;
  return intent;
}

function autoAim(world: EcsWorld, view: PlayerView): number {
  let best: PlayerView | null = null;
  let bestDistance = Infinity;
  for (const other of players(world)) {
    if (!other.condition.alive || other.tag.team === view.tag.team) continue;
    const d = dist(view.transform.x, view.transform.y, other.transform.x, other.transform.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = other;
    }
  }
  if (!best) return view.transform.facing;
  const flight = bestDistance / 1150;
  return angleTo(
    view.transform.x,
    view.transform.y,
    best.transform.x + best.transform.vx * flight * 0.85,
    best.transform.y + best.transform.vy * flight * 0.85,
  );
}

// ---------------------------------------------------------------- simulation

export function simulate(world: EcsWorld, dt: number, frozen: boolean): void {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    if (!frozen) {
      for (const view of players(world)) {
        if (!view.condition.alive) continue;
        stepPlayer(world, view, sdt);
      }
      separatePlayers(world);
    }
    for (const ball of balls(world)) stepBall(world, ball, sdt);
    if (!frozen && !world.resource('set').resolved) resolveCollisions(world);
  }
}

function stepPlayer(world: EcsWorld, view: PlayerView, dt: number): void {
  const P = PHYS;
  const { transform, action, cooldowns, condition, intent } = view;

  condition.enteringTime = Math.max(0, condition.enteringTime - dt);
  action.dashCd = Math.max(0, action.dashCd - dt);
  cooldowns.throwCd = Math.max(0, cooldowns.throwCd - dt);
  cooldowns.catchCd = Math.max(0, cooldowns.catchCd - dt);
  cooldowns.catchWindow = Math.max(0, cooldowns.catchWindow - dt);
  cooldowns.pickupCd = Math.max(0, cooldowns.pickupCd - dt);
  condition.hitFlash = Math.max(0, condition.hitFlash - dt * 3);

  const canPlay = condition.enteringTime <= 0;

  if (Number.isFinite(intent.aim)) transform.facing = intent.aim;
  if (intent.catch && canPlay) startCatch(view);

  const direction = norm(intent.mx, intent.my);
  const moving = direction.l > 0.06;

  if (intent.dash && canPlay && action.dashCd <= 0) {
    action.dashCd = P.dashCd;
    action.dashTime = P.dashTime;
    action.dashX = moving ? direction.x : Math.cos(transform.facing);
    action.dashY = moving ? direction.y : Math.sin(transform.facing);
    onDash(world, view);
  }

  // --- charge / throw
  if (canPlay && action.charging && intent.release && view.carry.ball !== null) {
    throwBall(world, view);
  } else if (canPlay && intent.charge && view.carry.ball !== null) {
    action.charging = true;
    action.charge = Math.min(1, action.charge + dt / P.chargeTime);
  } else if (action.charging) {
    action.charging = false;
    action.charge = 0;
  }

  // --- movement
  const slow = (action.charging ? 0.68 : 1) * (cooldowns.catchWindow > 0 ? 0.6 : 1);
  if (action.dashTime > 0) {
    action.dashTime = Math.max(0, action.dashTime - dt);
    const k = action.dashTime / P.dashTime;
    const mul = 0.35 + 0.65 * k;
    transform.vx = action.dashX * P.dashSpeed * mul;
    transform.vy = action.dashY * P.dashSpeed * mul;
    view.trail.points.push({ x: transform.x, y: transform.y, a: 0.8 });
    if (view.trail.points.length > 12) view.trail.points.shift();
  } else {
    const maxV = P.speed * speedMultiplier(view) * slow;
    transform.vx = damp(transform.vx, direction.x * maxV, 15, dt);
    transform.vy = damp(transform.vy, direction.y * maxV, 15, dt);
  }

  for (const t of view.trail.points) t.a -= dt * 3.5;
  if (view.trail.points.length) {
    view.trail.points = view.trail.points.filter((t) => t.a > 0);
  }

  transform.x += transform.vx * dt;
  transform.y += transform.vy * dt;

  // --- stay in your own half (with a little leeway during the opening rush)
  const area = bounds(world, view.tag.team);
  const r = transform.radius;
  if (transform.x < area.minX + r) {
    transform.x = area.minX + r;
    if (transform.vx < 0) transform.vx = 0;
  } else if (transform.x > area.maxX - r) {
    transform.x = area.maxX - r;
    if (transform.vx > 0) transform.vx = 0;
  }
  if (transform.y < COURT.y + r) {
    transform.y = COURT.y + r;
    if (transform.vy < 0) transform.vy = 0;
  } else if (transform.y > COURT.bottom - r) {
    transform.y = COURT.bottom - r;
    if (transform.vy > 0) transform.vy = 0;
  }
}

function speedMultiplier(view: PlayerView): number {
  if (view.tag.isHuman) return 1;
  return view.brain.diff ? view.brain.diff.speed : 1;
}

function startCatch(view: PlayerView): void {
  const { cooldowns, condition } = view;
  if (cooldowns.catchCd > 0 || cooldowns.catchWindow > 0 || condition.enteringTime > 0) return;
  cooldowns.catchWindow = PHYS.catchWindow;
  cooldowns.catchCd = PHYS.catchCd;
  sfx.catchStart();
}

function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

// --------------------------------------------------------------------- balls

function stepBall(world: EcsWorld, ball: BallView, dt: number): void {
  const { transform, state, tag } = ball;
  tag.age += dt;
  tag.bob += dt * 2;
  tag.spin += tag.spinV * dt;
  state.pickupCd = Math.max(0, state.pickupCd - dt);
  state.ignoreTime = Math.max(0, state.ignoreTime - dt);
  if (state.ignoreTime <= 0) state.ignore = null;

  if (ball.held.by !== null) {
    const holder = world.get(ball.held.by, 'transform');
    if (holder) {
      const offset = holder.radius + 5;
      transform.x = holder.x + Math.cos(holder.facing) * offset;
      transform.y = holder.y + Math.sin(holder.facing) * offset;
      tag.spinV = 0;
      ball.trail.points = [];
      return;
    }
    ball.held.by = null;
  }

  const preSpeed = Math.hypot(transform.vx, transform.vy);
  const drag = state.live ? PHYS.ballDrag : PHYS.ballDragFree;
  const friction = Math.exp(-drag * dt);
  transform.vx *= friction;
  transform.vy *= friction;

  transform.x += transform.vx * dt;
  transform.y += transform.vy * dt;

  if (state.live && preSpeed > 260) {
    ball.trail.points.push({ x: transform.x, y: transform.y, a: 0.9 });
    if (ball.trail.points.length > 9) ball.trail.points.shift();
  }
  for (const t of ball.trail.points) t.a -= dt * 4;
  if (ball.trail.points.length) {
    ball.trail.points = ball.trail.points.filter((t) => t.a > 0);
  }

  // --- walls are "surfaces": a live ball dies on contact (Rule 15.6)
  const C = COURT;
  const r = transform.radius;
  let hitSurface = false;

  if (transform.x < C.x + r) {
    transform.x = C.x + r;
    if (transform.vx < 0) transform.vx = -transform.vx * PHYS.wallDamp;
    transform.vy *= 0.7;
    hitSurface = true;
  } else if (transform.x > C.right - r) {
    transform.x = C.right - r;
    if (transform.vx > 0) transform.vx = -transform.vx * PHYS.wallDamp;
    transform.vy *= 0.7;
    hitSurface = true;
  }
  if (transform.y < C.y + r) {
    transform.y = C.y + r;
    if (transform.vy < 0) transform.vy = -transform.vy * PHYS.wallDamp;
    transform.vx *= 0.7;
    hitSurface = true;
  } else if (transform.y > C.bottom - r) {
    transform.y = C.bottom - r;
    if (transform.vy > 0) transform.vy = -transform.vy * PHYS.wallDamp;
    transform.vx *= 0.7;
    hitSurface = true;
  }

  const speed = Math.hypot(transform.vx, transform.vy);
  if (hitSurface) {
    if (state.live) onBallSurface(preSpeed);
    landBall(world, ball);
  } else if (state.live && speed < PHYS.ballLiveSpeed) {
    landBall(world, ball);
  }

  if (speed < 6) {
    transform.vx = 0;
    transform.vy = 0;
  }
  tag.spinV = speed * 0.012;
}

/** A live ball becomes dead on contact with any surface (Rule 15.6). */
function landBall(world: EcsWorld, ball: BallView): void {
  const wasLive = ball.state.live;
  ball.state.live = false;
  ball.state.team = null;
  ball.state.rush = false;
  ball.state.armed = true;
  // Keep the thrower reference for the attempt-validity check (Rule 16.1).
  if (wasLive) onBallLanded(world, ball);
  ball.state.thrower = null;
}

function onBallSurface(speed: number): void {
  sfx.bounce(speed / 1300);
}

function onBallLanded(world: EcsWorld, ball: BallView): void {
  if (ball.state.validAttempt || ball.state.warningIssued || !ball.state.throwerTeam) return;
  ball.state.warningIssued = true;
  world.resource('warnings')[ball.state.throwerTeam] += 1;

  const thrower = ball.state.thrower;
  const throwerTag = thrower === null ? null : world.get(thrower, 'player');
  if (throwerTag?.isHuman) {
    addFloater(world, ball.transform.x, ball.transform.y - 22, 'NO TOUCH', '#fca5a5', 1);
  }
}

export function throwBall(world: EcsWorld, view: PlayerView): void {
  const ball = carriedBall(world, view);
  if (!ball) return;

  const { transform, action, stats, cooldowns } = view;
  const power = clamp(action.charge, 0, 1);
  const speed = PHYS.throwMin + (PHYS.throwMax - PHYS.throwMin) * power;
  const cos = Math.cos(transform.facing);
  const sin = Math.sin(transform.facing);

  ball.held.by = null;
  ball.transform.x = transform.x + cos * (transform.radius + ball.transform.radius + 1);
  ball.transform.y = transform.y + sin * (transform.radius + ball.transform.radius + 1);
  ball.transform.vx = cos * speed + transform.vx * 0.25;
  ball.transform.vy = sin * speed + transform.vy * 0.25;
  ball.state.live = true;
  ball.state.team = view.tag.team;
  ball.state.thrower = view.entity;
  ball.state.throwerTeam = view.tag.team;
  ball.tag.age = 0;
  ball.state.pickupCd = 0.18;
  ball.trail.points = [];
  ball.state.canOut = ball.state.armed;
  ball.state.rush = false;
  ball.state.validAttempt = false;
  ball.state.warningIssued = false;
  ball.state.releasePositions = players(world)
    .filter((p) => p.condition.alive && p.tag.team !== view.tag.team)
    .map((p) => ({ x: p.transform.x, y: p.transform.y }));
  ball.state.ignore = null;
  ball.state.ignoreTime = 0;

  view.carry.ball = null;
  action.charge = 0;
  action.charging = false;
  cooldowns.throwCd = PHYS.throwCd;
  stats.throws += 1;

  // Any throw ends the opening rush (Rule 13.6) and resets the shot clock
  // (Rule 17.3.1).
  endRush(world);
  world.resource('lastThrow').team = view.tag.team;
  resetShotClock(world);

  burst(world, ball.transform.x, ball.transform.y, TEAMS[view.tag.team].light, 5, 0.5, 'spark');
  sfx.throwBall(power);
}

function doPickup(world: EcsWorld, view: PlayerView, ball: BallView): void {
  ball.held.by = view.entity;
  ball.state.live = false;
  ball.state.team = view.tag.team;
  ball.state.thrower = null;
  ball.state.touched = true;
  ball.state.armed = !ball.state.rush;
  ball.state.canOut = true;
  ball.state.throwerTeam = null;
  ball.state.validAttempt = false;
  ball.state.warningIssued = false;
  ball.transform.vx = 0;
  ball.transform.vy = 0;
  ball.trail.points = [];
  view.carry.ball = ball.entity;
  view.action.charging = false;
  view.action.charge = 0;
  burst(world, ball.transform.x, ball.transform.y, '#fcd34d', 5, 0.4, 'spark');
  sfx.pickup();
}

function dropBall(ball: BallView, x: number, y: number): void {
  ball.held.by = null;
  ball.state.live = false;
  ball.state.team = null;
  ball.state.thrower = null;
  ball.state.throwerTeam = null;
  ball.transform.x = x;
  ball.transform.y = y;
  ball.transform.vx = rand(-90, 90);
  ball.transform.vy = rand(-90, 90);
  ball.state.pickupCd = 0.4;
  ball.state.armed = true;
  ball.state.rush = false;
}

// ------------------------------------------------------------------ contacts

function resolveCollisions(world: EcsWorld): void {
  if (world.resource('set').resolved) return;

  for (const ball of balls(world)) {
    if (ball.held.by !== null) continue;
    if (ball.state.live) checkAttempt(world, ball);

    for (const player of players(world)) {
      if (!player.condition.alive || player.condition.enteringTime > 0) continue;
      if (ball.state.ignore === player.entity && ball.state.ignoreTime > 0) continue;

      const rr = player.transform.radius + ball.transform.radius;
      const dx = ball.transform.x - player.transform.x;
      const dy = ball.transform.y - player.transform.y;
      if (dx * dx + dy * dy > rr * rr) continue;

      if (ball.state.live) {
        if (ball.state.team === player.tag.team) continue;
        if (player.cooldowns.catchWindow > 0) doCatch(world, player, ball);
        else if (ball.state.canOut) doHit(world, player, ball);
        if (world.resource('set').resolved) return;
      } else if (
        player.carry.ball === null &&
        ball.state.pickupCd <= 0 &&
        player.cooldowns.pickupCd <= 0
      ) {
        // Rule 13.6.1: during the rush you may only take your own three.
        if (
          world.resource('rush').active &&
          ball.state.rush &&
          isOpponentSide(player.tag.team, ball.transform.x)
        ) {
          continue;
        }
        doPickup(world, player, ball);
      }
    }
  }
}

/**
 * Rule 16.1: a valid attempt lands or passes within a metre of an opponent,
 * or of where an opponent stood when the ball was released.
 */
function checkAttempt(world: EcsWorld, ball: BallView): void {
  if (!ball.state.live || ball.state.validAttempt) return;
  for (const pos of ball.state.releasePositions) {
    if (dist(ball.transform.x, ball.transform.y, pos.x, pos.y) < NEAR_MISS) {
      ball.state.validAttempt = true;
      return;
    }
  }
  for (const player of players(world)) {
    if (!player.condition.alive || player.tag.team === ball.state.throwerTeam) continue;
    if (
      dist(ball.transform.x, ball.transform.y, player.transform.x, player.transform.y) < NEAR_MISS
    ) {
      ball.state.validAttempt = true;
      return;
    }
  }
}

function doHit(world: EcsWorld, player: PlayerView, ball: BallView): void {
  const color = ball.state.team ? TEAMS[ball.state.team].main : '#fbbf24';
  ball.state.validAttempt = true;
  landBall(world, ball);
  ball.state.pickupCd = 0.3;

  if (ball.state.thrower !== null) {
    const stats = world.get(ball.state.thrower, 'stats');
    if (stats) stats.outs += 1;
  }

  burst(world, player.transform.x, player.transform.y, color, 18, 1.15, 'spark');
  ring(world, player.transform.x, player.transform.y, color, 24);
  const feedback = world.resource('feedback');
  feedback.shake = Math.max(feedback.shake, 10);
  feedback.flash = Math.max(feedback.flash, 0.2);

  if (player.condition.hasGlasses) {
    player.condition.hasGlasses = false;
    dropGlasses(world, player);
    addFloater(world, player.transform.x, player.transform.y - 62, 'HEADSHOT!', '#ffe9a8', 1.9, 34);
    addFloater(world, player.transform.x, player.transform.y - 30, 'GLASSES OFF', '#e2e8f0', 1.5, 17);
    feedback.shake = Math.max(feedback.shake, 15);
    feedback.flash = Math.max(feedback.flash, 0.34);
    sfx.headshot();
  } else {
    sfx.hit();
  }

  eliminate(world, player, 'hit');
}

function doCatch(world: EcsWorld, player: PlayerView, ball: BallView): void {
  player.cooldowns.catchWindow = 0;

  // Rule 21: a ball in hand is a shield, not a free catch.
  if (player.carry.ball !== null) {
    if (world.resource('set').suddenDeath) return; // Rule 9.7.1: no blocking in sudden death
    doBlock(world, player, ball);
    return;
  }

  const thrower = ball.state.thrower;
  const palette = ball.state.team ? TEAMS[ball.state.team] : TEAMS[player.tag.team];

  ball.state.live = false;
  ball.state.team = player.tag.team;
  ball.state.thrower = null;
  ball.state.throwerTeam = null;
  ball.transform.vx = 0;
  ball.transform.vy = 0;
  ball.trail.points = [];
  ball.held.by = player.entity;
  ball.state.armed = true;
  ball.state.rush = false;
  ball.state.canOut = true;
  ball.state.validAttempt = true;
  player.carry.ball = ball.entity;
  player.stats.catches += 1;

  burst(world, player.transform.x, player.transform.y, palette.light, 18, 1.1, 'spark');
  ring(world, player.transform.x, player.transform.y, palette.light, 26);
  addFloater(world, player.transform.x, player.transform.y - 40, 'CAUGHT!', palette.light, 1.2);
  const feedback = world.resource('feedback');
  feedback.shake = Math.max(feedback.shake, 7);
  feedback.flash = Math.max(feedback.flash, 0.16);
  sfx.catchBall();

  // Rule 23.1: the thrower is out. Rule 23.4: a queued teammate re-enters.
  if (thrower !== null) {
    const throwerView = playerView(world, thrower);
    if (throwerView.condition.alive) {
      addFloater(
        world,
        throwerView.transform.x,
        throwerView.transform.y - 36,
        'OUT',
        TEAMS[throwerView.tag.team].light,
        1.1,
      );
      eliminate(world, throwerView, 'caught');
      if (!world.resource('set').resolved) reenter(world, player.tag.team);
    }
  }
}

/** Rule 21.2: a blocked ball remains live. */
function doBlock(world: EcsWorld, player: PlayerView, ball: BallView): void {
  player.cooldowns.catchWindow = 0;
  const angle = Math.atan2(ball.transform.vy, ball.transform.vx) + Math.PI + rand(-0.55, 0.55);
  const speed = Math.max(
    PHYS.blockMinSpeed,
    Math.hypot(ball.transform.vx, ball.transform.vy) * PHYS.blockRetain,
  );
  ball.transform.vx = Math.cos(angle) * speed;
  ball.transform.vy = Math.sin(angle) * speed;
  ball.state.ignore = player.entity;
  ball.state.ignoreTime = 0.26;
  ball.state.validAttempt = true;
  ball.state.pickupCd = 0.2;

  burst(world, player.transform.x, player.transform.y, '#dbeafe', 9, 0.8, 'spark');
  ring(world, player.transform.x, player.transform.y, '#dbeafe', 18);
  addFloater(world, player.transform.x, player.transform.y - 38, 'BLOCK', '#dbeafe', 0.9);
  const feedback = world.resource('feedback');
  feedback.shake = Math.max(feedback.shake, 4);
  sfx.block();
}

function eliminate(world: EcsWorld, player: PlayerView, cause: 'hit' | 'caught'): void {
  if (!player.condition.alive) return;
  const clock = world.resource('clock');
  const queues = world.resource('queues');
  const feedback = world.resource('feedback');

  player.condition.alive = false;
  player.condition.outAt = clock.sim;
  player.condition.outX = player.transform.x;
  player.condition.outY = player.transform.y;
  player.action.charging = false;
  player.action.charge = 0;
  player.cooldowns.catchWindow = 0;

  if (player.carry.ball !== null) {
    const ball = carriedBall(world, player);
    if (ball) dropBall(ball, player.transform.x, player.transform.y);
    player.carry.ball = null;
  }

  const queue = queues[player.tag.team];
  if (!queue.includes(player.entity)) queue.push(player.entity);

  const palette = TEAMS[player.tag.team];
  burst(world, player.transform.x, player.transform.y, palette.main, 20, 1.4, 'spark');
  ring(world, player.transform.x, player.transform.y, palette.light, 30);
  if (!player.tag.isHuman && !player.tag.glasses) {
    addFloater(world, player.transform.x, player.transform.y - 40, 'OUT!', palette.light, 1);
  }
  feedback.shake = Math.max(feedback.shake, cause === 'caught' ? 8 : 11);
  feedback.flash = Math.max(feedback.flash, 0.24);

  checkSetEnd(world);
}

/** Rule 25: re-entry from the queue, over the back line. */
function reenter(world: EcsWorld, team: TeamId): void {
  const queue = world.resource('queues')[team];
  const entity = queue.shift();
  if (entity === undefined) return;
  reenterPlayer(world, entity);
  const player = playerView(world, entity);
  const palette = TEAMS[team];
  burst(world, player.transform.x, player.transform.y, palette.light, 14, 0.9, 'spark');
  ring(world, player.transform.x, player.transform.y, palette.light, 22);
  addFloater(
    world,
    player.transform.x,
    player.transform.y - 36,
    `${player.tag.name.toUpperCase()} IN`,
    palette.light,
    1.2,
  );
  sfx.pickup();
}

/** Rule 29.3.2: simultaneous all-out voids the set in the Foam format. */
function checkSetEnd(world: EcsWorld): void {
  const set = world.resource('set');
  if (set.resolved) return;

  const blue = countAlive(world, 'blue');
  const red = countAlive(world, 'red');
  if (blue > 0 && red > 0) return;

  set.resolved = true;
  const winner: TeamId | null = blue === red ? null : blue > red ? 'blue' : 'red';
  set.winner = winner;
  if (winner) world.resource('lastSet').winner = winner;
  resetShotClock(world);
}

function countAlive(world: EcsWorld, team: TeamId): number {
  let alive = 0;
  for (const player of players(world)) {
    if (player.condition.alive && player.tag.team === team) alive += 1;
  }
  return alive;
}

// -------------------------------------------------------------------- rules

/** Rule 13.7.1: a rushed ball arms once it fully crosses the attack line. */
export function updateArming(world: EcsWorld): void {
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

export function updateRush(world: EcsWorld): void {
  if (!world.resource('rush').active) return;
  if (balls(world).every((ball) => ball.state.touched)) endRush(world);
}

export function endRush(world: EcsWorld): void {
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

export function updateShotClock(world: EcsWorld, dt: number): void {
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
function forfeitPossession(world: EcsWorld, team: TeamId): void {
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

function lineUp(world: EcsWorld): void {
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

export function enterSuddenDeath(world: EcsWorld): void {
  world.resource('set').suddenDeath = true;
  addFloater(world, COURT.cx, COURT.cy - 40, 'SUDDEN DEATH', '#ff8a9a', 2.4);
  addFloater(world, COURT.cx, COURT.cy + 2, 'BLOCKING DISABLED', 'rgba(255,194,202,0.9)', 2.4);
  const feedback = world.resource('feedback');
  feedback.shake = Math.max(feedback.shake, 7);
  sfx.whistle();
}

function separatePlayers(world: EcsWorld): void {
  const list = players(world);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.condition.alive) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.condition.alive) continue;
      let dx = b.transform.x - a.transform.x;
      let dy = b.transform.y - a.transform.y;
      let d = Math.hypot(dx, dy);
      const min = a.transform.radius + b.transform.radius;
      if (d >= min) continue;
      if (d < 0.001) {
        dx = rand(-1, 1);
        dy = rand(-1, 1);
        d = Math.hypot(dx, dy) || 1;
      }
      const push = (min - d) * 0.5;
      const ux = dx / d;
      const uy = dy / d;
      a.transform.x -= ux * push;
      a.transform.y -= uy * push;
      b.transform.x += ux * push;
      b.transform.y += uy * push;
    }
  }

  for (const player of list) {
    if (!player.condition.alive) continue;
    const area = bounds(world, player.tag.team);
    player.transform.x = clamp(
      player.transform.x,
      area.minX + player.transform.radius,
      area.maxX - player.transform.radius,
    );
    player.transform.y = clamp(
      player.transform.y,
      COURT.y + player.transform.radius,
      COURT.bottom - player.transform.radius,
    );
  }
}
