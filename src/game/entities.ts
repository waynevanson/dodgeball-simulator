import { BALL_RADIUS, COURT, ENTER_GRACE, PHYS, PLAYER_RADIUS } from './constants';
import { damp, norm } from './math';
import type { Difficulty, Intent, TeamId } from './types';
import type { GameWorld } from './world';

export interface AIState {
  diff: Difficulty | null;
  seekId: string | null;
  target: Player | null;
  targetTimer: number;
  aimTimer: number;
  aimError: number;
  releaseDelay: number;
  catchBallId: string | null;
  willCatch: boolean;
  strafe: number;
  strafeTimer: number;
  phase: number;
  anchorX: number;
  anchorY: number;
  anchorTimer: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  a: number;
}

export interface PlayerStats {
  throws: number;
  catches: number;
  outs: number;
}

export interface PlayerConfig {
  id: string;
  team: TeamId;
  slot: number;
  name: string;
  number: number;
  human: boolean;
}

export class Player {
  readonly id: string;
  readonly team: TeamId;
  readonly slot: number;
  readonly name: string;
  readonly number: number;
  readonly isHuman: boolean;
  readonly radius = PLAYER_RADIUS;

  readonly ai: AIState = {
    diff: null,
    seekId: null,
    target: null,
    targetTimer: 0,
    aimTimer: 0,
    aimError: 0,
    releaseDelay: 0,
    catchBallId: null,
    willCatch: false,
    strafe: 1,
    strafeTimer: 0,
    phase: Math.random() * 10,
    anchorX: 0,
    anchorY: 0,
    anchorTimer: 0,
  };

  x = 0;
  y = 0;
  homeX = 0;
  homeY = 0;
  vx = 0;
  vy = 0;
  facing = 0;
  alive = true;
  ball: Ball | null = null;
  charge = 0;
  charging = false;
  dashTime = 0;
  dashCd = 0;
  dashX = 1;
  dashY = 0;
  catchWindow = 0;
  catchCd = 0;
  throwCd = 0;
  pickupCd = 0;
  hitFlash = 0;
  /** Rule 25: entering players are immune and cannot make plays. */
  enteringTime = 0;
  outAt = 0;
  outX = 0;
  outY = 0;
  trail: TrailPoint[] = [];
  stats: PlayerStats = { throws: 0, catches: 0, outs: 0 };

  constructor(config: PlayerConfig) {
    this.id = config.id;
    this.team = config.team;
    this.slot = config.slot;
    this.name = config.name;
    this.number = config.number;
    this.isHuman = config.human;
    this.reset(0, 0);
  }

  get speedMultiplier(): number {
    if (this.isHuman) return 1;
    return this.ai.diff ? this.ai.diff.speed : 1;
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = this.team === 'blue' ? 0 : Math.PI;
    this.alive = true;
    this.ball = null;
    this.charge = 0;
    this.charging = false;
    this.dashTime = 0;
    this.dashCd = 0;
    this.catchWindow = 0;
    this.catchCd = 0;
    this.throwCd = 0;
    this.pickupCd = 0;
    this.hitFlash = 0;
    this.enteringTime = 0;
    this.outAt = 0;
    this.outX = x;
    this.outY = y;
    this.trail = [];
    this.stats = { throws: 0, catches: 0, outs: 0 };

    const ai = this.ai;
    ai.seekId = null;
    ai.target = null;
    ai.targetTimer = 0;
    ai.aimTimer = 0;
    ai.releaseDelay = 0;
    ai.catchBallId = null;
    ai.willCatch = false;
    ai.anchorX = x;
    ai.anchorY = y;
    ai.anchorTimer = 0;
  }

  /** Rule 25.2: return from the queue over the back line. */
  reenter(x: number, y: number): void {
    this.alive = true;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.ball = null;
    this.charge = 0;
    this.charging = false;
    this.dashTime = 0;
    this.dashCd = 0.2;
    this.catchWindow = 0;
    this.catchCd = 0.4;
    this.throwCd = 0;
    this.pickupCd = 0.3;
    this.hitFlash = 0;
    this.enteringTime = ENTER_GRACE;
    this.trail = [];
    this.outAt = 0;
    const ai = this.ai;
    ai.seekId = null;
    ai.target = null;
    ai.targetTimer = 0;
    ai.releaseDelay = 0;
    ai.catchBallId = null;
    ai.willCatch = false;
  }

  get isEntering(): boolean {
    return this.enteringTime > 0;
  }

  startCatch(world: GameWorld): void {
    if (this.catchCd > 0 || this.catchWindow > 0 || this.isEntering) return;
    this.catchWindow = PHYS.catchWindow;
    this.catchCd = PHYS.catchCd;
    world.onCatchStart();
  }

  step(world: GameWorld, intent: Intent, dt: number): void {
    const P = PHYS;
    this.enteringTime = Math.max(0, this.enteringTime - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.throwCd = Math.max(0, this.throwCd - dt);
    this.catchCd = Math.max(0, this.catchCd - dt);
    this.catchWindow = Math.max(0, this.catchWindow - dt);
    this.pickupCd = Math.max(0, this.pickupCd - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);

    const canPlay = this.enteringTime <= 0;

    if (Number.isFinite(intent.aim)) this.facing = intent.aim;
    if (intent.catch && canPlay) this.startCatch(world);

    const direction = norm(intent.mx, intent.my);
    const moving = direction.l > 0.06;

    if (intent.dash && canPlay && this.dashCd <= 0) {
      this.dashCd = P.dashCd;
      this.dashTime = P.dashTime;
      this.dashX = moving ? direction.x : Math.cos(this.facing);
      this.dashY = moving ? direction.y : Math.sin(this.facing);
      world.onDash(this);
    }

    // --- charge / throw
    if (canPlay && this.charging && intent.release && this.ball) {
      world.throwBall(this);
    } else if (canPlay && intent.charge && this.ball) {
      this.charging = true;
      this.charge = Math.min(1, this.charge + dt / P.chargeTime);
    } else if (this.charging) {
      this.charging = false;
      this.charge = 0;
    }

    // --- movement
    const slow = (this.charging ? 0.68 : 1) * (this.catchWindow > 0 ? 0.6 : 1);
    if (this.dashTime > 0) {
      this.dashTime = Math.max(0, this.dashTime - dt);
      const k = this.dashTime / P.dashTime;
      const mul = 0.35 + 0.65 * k;
      this.vx = this.dashX * P.dashSpeed * mul;
      this.vy = this.dashY * P.dashSpeed * mul;
      this.trail.push({ x: this.x, y: this.y, a: 0.8 });
      if (this.trail.length > 12) this.trail.shift();
    } else {
      const maxV = P.speed * this.speedMultiplier * slow;
      this.vx = damp(this.vx, direction.x * maxV, 15, dt);
      this.vy = damp(this.vy, direction.y * maxV, 15, dt);
    }

    for (const t of this.trail) t.a -= dt * 3.5;
    if (this.trail.length) this.trail = this.trail.filter((t) => t.a > 0);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // --- stay in your own half (with a little leeway during the opening rush)
    const bounds = world.bounds(this.team);
    const r = this.radius;
    if (this.x < bounds.minX + r) {
      this.x = bounds.minX + r;
      if (this.vx < 0) this.vx = 0;
    } else if (this.x > bounds.maxX - r) {
      this.x = bounds.maxX - r;
      if (this.vx > 0) this.vx = 0;
    }
    if (this.y < COURT.y + r) {
      this.y = COURT.y + r;
      if (this.vy < 0) this.vy = 0;
    } else if (this.y > COURT.bottom - r) {
      this.y = COURT.bottom - r;
      if (this.vy > 0) this.vy = 0;
    }
  }
}

let ballSeq = 0;

export class Ball {
  readonly id: string;
  readonly radius = BALL_RADIUS;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  heldBy: Player | null = null;
  live = false;
  team: TeamId | null = null;
  thrower: Player | null = null;
  throwerTeam: TeamId | null = null;
  age = 0;
  spin = Math.random() * Math.PI * 2;
  spinV = 0;
  bounces = 0;
  trail: TrailPoint[] = [];
  pickupCd = 0;
  bob = Math.random() * Math.PI * 2;

  /** Rule 13.7: opening-rush balls must cross the attack line to become live. */
  rushBall = false;
  armed = false;
  /** False while an unarmed ball is in flight (Rule 13.7.1). */
  canOut = true;
  touched = false;
  /** Rule 16.1: did the throw pass within 1m of an opponent? */
  validAttempt = false;
  warningIssued = false;
  ignore: Player | null = null;
  ignoreTime = 0;

  constructor() {
    this.id = `b${++ballSeq}`;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  place(x: number, y: number): void {
    this.heldBy = null;
    this.live = false;
    this.team = null;
    this.thrower = null;
    this.throwerTeam = null;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.age = 0;
    this.pickupCd = 0;
    this.bounces = 0;
    this.trail = [];
    this.rushBall = true;
    this.armed = false;
    this.canOut = true;
    this.touched = false;
    this.validAttempt = false;
    this.warningIssued = false;
    this.ignore = null;
    this.ignoreTime = 0;
  }

  /** A live ball becomes dead on contact with any surface (Rule 15.6). */
  land(world: GameWorld): void {
    const wasLive = this.live;
    this.live = false;
    this.team = null;
    this.rushBall = false;
    this.armed = true;
    // Keep the thrower reference for the attempt-validity check (Rule 16.1).
    if (wasLive) world.onBallLanded(this);
    this.thrower = null;
  }

  step(world: GameWorld, dt: number): void {
    this.age += dt;
    this.bob += dt * 2;
    this.spin += this.spinV * dt;
    this.pickupCd = Math.max(0, this.pickupCd - dt);
    this.ignoreTime = Math.max(0, this.ignoreTime - dt);
    if (this.ignoreTime <= 0) this.ignore = null;

    if (this.heldBy) {
      const holder = this.heldBy;
      const offset = holder.radius + 5;
      this.x = holder.x + Math.cos(holder.facing) * offset;
      this.y = holder.y + Math.sin(holder.facing) * offset;
      this.spinV = 0;
      this.trail = [];
      return;
    }

    const preSpeed = this.speed;
    const drag = this.live ? PHYS.ballDrag : PHYS.ballDragFree;
    const friction = Math.exp(-drag * dt);
    this.vx *= friction;
    this.vy *= friction;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.live && preSpeed > 260) {
      this.trail.push({ x: this.x, y: this.y, a: 0.9 });
      if (this.trail.length > 9) this.trail.shift();
    }
    for (const t of this.trail) t.a -= dt * 4;
    if (this.trail.length) this.trail = this.trail.filter((t) => t.a > 0);

    // --- walls are "surfaces": a live ball dies on contact (Rule 15.6)
    const C = COURT;
    const r = this.radius;
    let hitSurface = false;

    if (this.x < C.x + r) {
      this.x = C.x + r;
      if (this.vx < 0) this.vx = -this.vx * PHYS.wallDamp;
      this.vy *= 0.7;
      hitSurface = true;
    } else if (this.x > C.right - r) {
      this.x = C.right - r;
      if (this.vx > 0) this.vx = -this.vx * PHYS.wallDamp;
      this.vy *= 0.7;
      hitSurface = true;
    }
    if (this.y < C.y + r) {
      this.y = C.y + r;
      if (this.vy < 0) this.vy = -this.vy * PHYS.wallDamp;
      this.vx *= 0.7;
      hitSurface = true;
    } else if (this.y > C.bottom - r) {
      this.y = C.bottom - r;
      if (this.vy > 0) this.vy = -this.vy * PHYS.wallDamp;
      this.vx *= 0.7;
      hitSurface = true;
    }

    if (hitSurface) {
      if (this.live) world.onBallSurface(this.x, this.y, preSpeed);
      this.land(world);
    } else if (this.live && this.speed < PHYS.ballLiveSpeed) {
      this.land(world);
    }

    if (this.speed < 6) {
      this.vx = 0;
      this.vy = 0;
    }
    this.spinV = this.speed * 0.012;
  }
}
