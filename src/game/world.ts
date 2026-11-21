import {
  ATTACK_DIST,
  BALL_COUNT,
  BALL_MARK_SPACING,
  COURT,
  DIFFICULTIES,
  NEAR_MISS,
  PHYS,
  PLAYER_RADIUS,
  ROSTER_DATA,
  SHOT_CLOCK,
  SHOT_CLOCK_WARN,
  SUDDEN_DEATH_AFTER,
  TEAMS,
} from './constants';
import { Ball, Player } from './entities';
import { buildAIIntent } from './ai';
import { angleTo, clamp, dist, pick, rand, TAU } from './math';
import { sfx } from './audio';
import type { Difficulty, DifficultyId, Intent, Phase, TeamId } from './types';
import type { Input } from './input';

export type ParticleType = 'spark' | 'dust' | 'ring' | 'confetti';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
  type: ParticleType;
  spin: number;
  spinV: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
}

const ZERO_INTENT: Intent = {
  mx: 0,
  my: 0,
  aim: NaN,
  charge: false,
  release: false,
  dash: false,
  catch: false,
};

const EMPTY_INTENTS = new Map<string, Intent>();
const CONFETTI_COLORS = ['#5b93ff', '#ff5f73', '#fbbf24', '#7dd3fc', '#f472b6', '#a3e635'];

/**
 * Rule 13.1 / 9.3: both teams line up with a foot on the back line.
 * Slot order matches the roster, so the human starts in the middle.
 */
const SPAWNS: Record<TeamId, Array<[number, number]>> = {
  blue: [
    [COURT.x + PLAYER_RADIUS + 2, COURT.cy],
    [COURT.x + PLAYER_RADIUS + 2, COURT.cy - 170],
    [COURT.x + PLAYER_RADIUS + 2, COURT.cy + 170],
  ],
  red: [
    [COURT.right - PLAYER_RADIUS - 2, COURT.cy],
    [COURT.right - PLAYER_RADIUS - 2, COURT.cy - 170],
    [COURT.right - PLAYER_RADIUS - 2, COURT.cy + 170],
  ],
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

/**
 * The simulation. Owns players, balls, particles and the set clock; knows
 * nothing about match score or which screen is visible. Game flow is modelled
 * by the XState chart in `machine/gameMachine.ts`, which this world reports to
 * through `onSetEnd`.
 *
 * Rules implemented here follow the VDL / WDBF Foam Playing Format:
 *  - opening rush, attack-line activation (13.7)
 *  - hits and catches, catch re-entry from the queue (23.4 / 25)
 *  - blocking stays live (21.2), disarming simplified
 *  - the 10 second advantage clock (17.3)
 *  - all-out simultaneous play voids the set (29.3)
 */
export class GameWorld {
  readonly players: Player[] = [];
  readonly human: Player;
  readonly balls: Ball[] = [];

  particles: Particle[] = [];
  floaters: Floater[] = [];

  time = 0;
  difficulty: Difficulty = DIFFICULTIES.pro;

  setId = 0;
  setResolved = true;
  setElapsed = 0;
  suddenDeath = false;

  rushActive = false;
  lastSetWinner: TeamId | null = null;
  lastThrowTeam: TeamId | null = null;

  shotTeam: TeamId | null = null;
  shotClock = SHOT_CLOCK;
  shotBeep = 99;
  warnings: Record<TeamId, number> = { blue: 0, red: 0 };
  readonly queues: Record<TeamId, Player[]> = { blue: [], red: [] };

  shake = 0;
  flash = 0;
  slowmo = 0;

  onSetEnd: ((winner: TeamId | null) => void) | null = null;

  private readonly halves: Record<TeamId, { minX: number; maxX: number }> = {
    blue: { minX: COURT.x, maxX: COURT.cx - 2 },
    red: { minX: COURT.cx + 2, maxX: COURT.right },
  };

  private readonly claimByPlayer = new Map<string, Ball>();
  private readonly claimedBalls = new Set<string>();

  constructor() {
    for (const team of ['blue', 'red'] as const) {
      ROSTER_DATA[team].forEach((data, slot) => {
        this.players.push(
          new Player({
            id: `${team}-${slot}`,
            team,
            slot,
            name: data.name,
            number: data.number,
            human: data.human,
          }),
        );
      });
    }

    const human = this.players.find((p) => p.isHuman);
    if (!human) throw new Error('GameWorld: roster is missing a human player');
    this.human = human;

    for (let i = 0; i < BALL_COUNT; i++) this.balls.push(new Ball());

    this.setupFormation();
    this.setDifficulty('pro');
  }

  // ------------------------------------------------------------------ set up

  bounds(team: TeamId): { minX: number; maxX: number } {
    if (!this.rushActive) return this.halves[team];
    // Rule 13.6.2: you may touch or cross the centre line during the rush.
    return team === 'blue'
      ? { minX: COURT.x, maxX: COURT.cx + 26 }
      : { minX: COURT.cx - 26, maxX: COURT.right };
  }

  attackLineX(team: TeamId): number {
    return team === 'blue' ? COURT.cx - ATTACK_DIST : COURT.cx + ATTACK_DIST;
  }

  behindAttackLine(player: Player): boolean {
    return player.team === 'blue'
      ? player.x < this.attackLineX('blue')
      : player.x > this.attackLineX('red');
  }

  aliveCount(team: TeamId): number {
    let alive = 0;
    for (const p of this.players) if (p.alive && p.team === team) alive++;
    return alive;
  }

  heldCount(team: TeamId): number {
    let held = 0;
    for (const p of this.players) if (p.alive && p.team === team && p.ball) held++;
    return held;
  }

  setDifficulty(id: DifficultyId): void {
    this.difficulty = DIFFICULTIES[id];
    for (const p of this.players) {
      p.ai.diff = p.isHuman ? null : this.difficulty;
    }
  }

  startSet(): void {
    this.setId += 1;
    this.setResolved = false;
    this.setElapsed = 0;
    this.suddenDeath = false;
    this.rushActive = true;
    this.lastThrowTeam = null;
    this.shotTeam = null;
    this.shotClock = SHOT_CLOCK;
    this.shotBeep = 99;
    this.warnings = { blue: 0, red: 0 };
    this.queues.blue = [];
    this.queues.red = [];
    this.slowmo = 0;
    this.shake = 0;
    this.flash = 0;
    this.particles = [];
    this.floaters = [];
    this.claimByPlayer.clear();
    this.claimedBalls.clear();
    this.setupFormation();
    for (const p of this.players) {
      p.ai.diff = p.isHuman ? null : this.difficulty;
    }
  }

  toMenu(): void {
    this.setId = 0;
    this.setResolved = true;
    this.setElapsed = 0;
    this.suddenDeath = false;
    this.rushActive = false;
    this.lastThrowTeam = null;
    this.shotTeam = null;
    this.shotClock = SHOT_CLOCK;
    this.warnings = { blue: 0, red: 0 };
    this.queues.blue = [];
    this.queues.red = [];
    this.slowmo = 0;
    this.shake = 0;
    this.flash = 0;
    this.particles = [];
    this.floaters = [];
    this.claimByPlayer.clear();
    this.claimedBalls.clear();
    this.setupFormation();
  }

  private setupFormation(): void {
    for (const p of this.players) {
      const [x, y] = SPAWNS[p.team][p.slot];
      p.reset(x, y);
    }
    this.balls.forEach((ball, index) => {
      const [x, y] = BALL_SPAWNS[index % BALL_SPAWNS.length];
      ball.place(x, y);
    });
  }

  // ------------------------------------------------------------------ update

  update(dt: number, input: Input, phase: Phase): void {
    if (phase === 'paused') return;

    const step = Math.min(dt, 0.05);
    this.time += step;
    this.shake = Math.max(0, this.shake - step * 34);
    this.flash = Math.max(0, this.flash - step * 2.6);

    let simDt = step;
    if (this.slowmo > 0) {
      this.slowmo = Math.max(0, this.slowmo - step);
      simDt = step * 0.36;
    }

    switch (phase) {
      case 'menu':
      case 'countdown':
        this.simulate(simDt, EMPTY_INTENTS, true);
        break;

      case 'playing': {
        this.setElapsed += step;
        if (!this.suddenDeath && this.setElapsed >= SUDDEN_DEATH_AFTER) {
          this.enterSuddenDeath();
        }
        this.simulate(simDt, this.buildIntents(input, step), false);
        if (!this.setResolved) {
          this.updateArming();
          this.updateRush();
          this.updateShotClock(step);
        }
        break;
      }

      default:
        this.simulate(simDt, EMPTY_INTENTS, true);
        break;
    }

    this.updateEffects(step);
  }

  private buildIntents(input: Input, dt: number): Map<string, Intent> {
    this.assignBalls();
    const intents = new Map<string, Intent>();
    for (const p of this.players) {
      if (!p.alive) continue;
      intents.set(p.id, p.isHuman ? this.humanIntent(input) : buildAIIntent(this, p, dt));
    }
    return intents;
  }

  private simulate(dt: number, intents: Map<string, Intent>, frozen: boolean): void {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (!frozen) {
        for (const p of this.players) {
          if (!p.alive) continue;
          p.step(this, intents.get(p.id) ?? ZERO_INTENT, sdt);
        }
        this.separatePlayers();
      }
      for (const ball of this.balls) ball.step(this, sdt);
      if (!frozen && !this.setResolved) this.resolveBallCollisions();
    }
  }

  private humanIntent(input: Input): Intent {
    const player = this.human;
    const intent: Intent = {
      mx: 0,
      my: 0,
      aim: player.facing,
      charge: false,
      release: false,
      dash: false,
      catch: false,
    };
    if (!player.alive) return intent;

    if (input.usingTouch) {
      intent.mx = input.touch.mx;
      intent.my = input.touch.my;
      intent.aim = this.autoAim(player);
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
      ? Math.atan2(input.mouse.y - player.y, input.mouse.x - player.x)
      : player.facing;
    intent.charge = input.mouse.left;
    intent.release = !input.mouse.left;
    intent.dash = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
    intent.catch = input.pressed('Space') || input.pressed('KeyE') || input.mouse.rightPressed;
    return intent;
  }

  private autoAim(player: Player): number {
    let best: Player | null = null;
    let bestDistance = Infinity;
    for (const other of this.players) {
      if (!other.alive || other.team === player.team) continue;
      const d = dist(player.x, player.y, other.x, other.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = other;
      }
    }
    if (!best) return player.facing;
    const flight = bestDistance / 1150;
    return angleTo(
      player.x,
      player.y,
      best.x + best.vx * flight * 0.85,
      best.y + best.vy * flight * 0.85,
    );
  }

  // ------------------------------------------------------- opening rush (13)

  private isOpponentSide(team: TeamId, x: number): boolean {
    return team === 'blue' ? x > COURT.cx : x < COURT.cx;
  }

  private updateRush(): void {
    if (!this.rushActive) return;
    if (this.balls.every((ball) => ball.touched)) this.endRush();
  }

  private endRush(): void {
    if (!this.rushActive) return;
    this.rushActive = false;
    for (const ball of this.balls) {
      // Balls still on the floor are ordinary dead balls now.
      if (!ball.heldBy) {
        ball.rushBall = false;
        ball.armed = true;
      }
    }
  }

  /** Rule 13.7.1: a rushed ball arms once it fully crosses the attack line. */
  private updateArming(): void {
    for (const player of this.players) {
      const ball = player.ball;
      if (!player.alive || !ball || ball.armed) continue;
      if (this.behindAttackLine(player)) {
        ball.armed = true;
        this.addFloater(player.x, player.y - 42, 'ARMED', '#ffe9a8', 0.85);
        this.ring(player.x, player.y, '#fbbf24', 18);
        sfx.pickup();
      }
    }
  }

  // ------------------------------------------------- rule 17.3 shot clock

  private advantageTeam(): TeamId | null {
    const heldBlue = this.heldCount('blue');
    const heldRed = this.heldCount('red');
    if (heldBlue + heldRed === 0) return null;

    if (heldBlue !== heldRed) return heldBlue > heldRed ? 'blue' : 'red';

    const aliveBlue = this.aliveCount('blue');
    const aliveRed = this.aliveCount('red');
    if (aliveBlue !== aliveRed) return aliveBlue > aliveRed ? 'blue' : 'red';

    if (this.lastThrowTeam) return this.lastThrowTeam === 'blue' ? 'red' : 'blue';
    if (this.lastSetWinner) return this.lastSetWinner === 'blue' ? 'red' : 'blue';
    return null;
  }

  private updateShotClock(dt: number): void {
    const advantage = this.advantageTeam();
    if (advantage !== this.shotTeam) {
      this.shotTeam = advantage;
      this.shotClock = SHOT_CLOCK;
      this.shotBeep = 99;
    }
    if (!advantage) return;

    this.shotClock = Math.max(0, this.shotClock - dt);
    const secs = Math.ceil(this.shotClock);
    if (secs !== this.shotBeep && secs <= SHOT_CLOCK_WARN && secs > 0) {
      this.shotBeep = secs;
      sfx.beep(secs === 1);
    }
    if (this.shotClock <= 0) this.forfeitPossession(advantage);
  }

  /** Rule 17.3.3: ten seconds without an attempt forfeits every held ball. */
  private forfeitPossession(team: TeamId): void {
    const opponent: TeamId = team === 'blue' ? 'red' : 'blue';
    const dropX =
      opponent === 'blue' ? COURT.cx - ATTACK_DIST - 80 : COURT.cx + ATTACK_DIST + 80;

    for (const player of this.players) {
      if (player.team !== team) continue;
      const ball = player.ball;
      if (!ball) continue;
      player.ball = null;
      player.charging = false;
      player.charge = 0;
      ball.heldBy = null;
      ball.live = false;
      ball.team = null;
      ball.armed = true;
      ball.rushBall = false;
      ball.thrower = null;
      ball.throwerTeam = null;
      ball.x = dropX;
      ball.y = rand(COURT.y + 90, COURT.bottom - 90);
      ball.vx = 0;
      ball.vy = 0;
      ball.pickupCd = 0.2;
      this.burst(ball.x, ball.y, TEAMS[opponent].light, 8, 0.7, 'spark');
    }

    this.lineUp();
    this.addFloater(COURT.cx, COURT.cy - 10, '10s — BALLS FORFEITED', '#fbbf24', 1.8);
    this.addFloater(COURT.cx, COURT.cy + 24, 'LINE UP', '#e2e8f0', 1.6);
    this.shake = Math.max(this.shake, 8);
    sfx.whistle();
    this.shotTeam = null;
    this.shotClock = SHOT_CLOCK;
    this.shotBeep = 99;
  }

  private lineUp(): void {
    for (const player of this.players) {
      if (!player.alive) continue;
      const [x, y] = SPAWNS[player.team][player.slot];
      player.x = x;
      player.y = y;
      player.vx = 0;
      player.vy = 0;
      player.charging = false;
      player.charge = 0;
      player.catchWindow = 0;
      player.trail = [];
    }
  }

  private enterSuddenDeath(): void {
    this.suddenDeath = true;
    this.addFloater(COURT.cx, COURT.cy - 40, 'SUDDEN DEATH', '#ff8a9a', 2.4);
    this.addFloater(COURT.cx, COURT.cy + 2, 'BLOCKING DISABLED', 'rgba(255,194,202,0.9)', 2.4);
    this.shake = Math.max(this.shake, 7);
    sfx.whistle();
  }

  // -------------------------------------------------------------- ball logic

  private assignBalls(): void {
    this.claimByPlayer.clear();
    this.claimedBalls.clear();

    const seekers = this.players.filter((p) => p.alive && !p.ball && !p.isHuman);
    const free = this.balls.filter((b) => !b.heldBy && !b.live);
    if (!seekers.length || !free.length) return;

    interface Pair {
      player: Player;
      ball: Ball;
      cost: number;
    }
    const pairs: Pair[] = [];
    for (const player of seekers) {
      const bounds = this.halves[player.team];
      for (const ball of free) {
        if (ball.x < bounds.minX - 6 || ball.x > bounds.maxX + 6) continue;
        let cost = dist(player.x, player.y, ball.x, ball.y);
        if (player.ai.seekId === ball.id) cost -= 70;
        pairs.push({ player, ball, cost });
      }
    }

    pairs.sort((a, b) => a.cost - b.cost);
    for (const { player, ball } of pairs) {
      if (this.claimByPlayer.has(player.id) || this.claimedBalls.has(ball.id)) continue;
      this.claimByPlayer.set(player.id, ball);
      this.claimedBalls.add(ball.id);
      player.ai.seekId = ball.id;
    }
  }

  claimFor(player: Player): Ball | null {
    return this.claimByPlayer.get(player.id) ?? null;
  }

  throwBall(player: Player): void {
    const ball = player.ball;
    if (!ball) return;

    const power = clamp(player.charge, 0, 1);
    const speed = PHYS.throwMin + (PHYS.throwMax - PHYS.throwMin) * power;
    const cos = Math.cos(player.facing);
    const sin = Math.sin(player.facing);

    ball.heldBy = null;
    ball.x = player.x + cos * (player.radius + ball.radius + 1);
    ball.y = player.y + sin * (player.radius + ball.radius + 1);
    ball.vx = cos * speed + player.vx * 0.25;
    ball.vy = sin * speed + player.vy * 0.25;
    ball.live = true;
    ball.team = player.team;
    ball.thrower = player;
    ball.throwerTeam = player.team;
    ball.age = 0;
    ball.pickupCd = 0.18;
    ball.trail = [];
    ball.canOut = ball.armed;
    ball.rushBall = false;
    ball.validAttempt = false;
    ball.warningIssued = false;
    ball.releasePositions = this.players
      .filter((p) => p.alive && p.team !== player.team)
      .map((p) => ({ x: p.x, y: p.y }));
    ball.ignore = null;
    ball.ignoreTime = 0;

    player.ball = null;
    player.charge = 0;
    player.charging = false;
    player.throwCd = PHYS.throwCd;
    player.stats.throws++;

    // Any throw ends the opening rush (Rule 13.6) and resets the shot clock
    // (Rule 17.3.1).
    this.endRush();
    this.lastThrowTeam = player.team;
    this.shotClock = SHOT_CLOCK;
    this.shotBeep = 99;

    this.burst(ball.x, ball.y, TEAMS[player.team].light, 5, 0.5, 'spark');
    sfx.throwBall(power);
  }

  private doPickup(player: Player, ball: Ball): void {
    ball.heldBy = player;
    ball.live = false;
    ball.team = player.team;
    ball.thrower = null;
    ball.touched = true;
    ball.armed = !ball.rushBall;
    ball.canOut = true;
    ball.throwerTeam = null;
    ball.validAttempt = false;
    ball.warningIssued = false;
    ball.vx = 0;
    ball.vy = 0;
    ball.trail = [];
    player.ball = ball;
    player.charging = false;
    player.charge = 0;
    this.burst(ball.x, ball.y, '#fcd34d', 5, 0.4, 'spark');
    sfx.pickup();
  }

  private dropBall(ball: Ball, x: number, y: number): void {
    ball.heldBy = null;
    ball.live = false;
    ball.team = null;
    ball.thrower = null;
    ball.throwerTeam = null;
    ball.x = x;
    ball.y = y;
    ball.vx = rand(-90, 90);
    ball.vy = rand(-90, 90);
    ball.pickupCd = 0.4;
    ball.armed = true;
    ball.rushBall = false;
  }

  private resolveBallCollisions(): void {
    if (this.setResolved) return;

    for (const ball of this.balls) {
      if (ball.heldBy) continue;
      if (ball.live) this.checkAttempt(ball);

      for (const player of this.players) {
        if (!player.alive || player.isEntering) continue;
        if (ball.ignore === player && ball.ignoreTime > 0) continue;

        const rr = player.radius + ball.radius;
        const dx = ball.x - player.x;
        const dy = ball.y - player.y;
        if (dx * dx + dy * dy > rr * rr) continue;

        if (ball.live) {
          if (ball.team === player.team) continue;
          if (player.catchWindow > 0) this.doCatch(player, ball);
          else if (ball.canOut) this.doHit(player, ball);
          if (this.setResolved) return;
        } else if (!player.ball && ball.pickupCd <= 0 && player.pickupCd <= 0) {
          // Rule 13.6.1: during the rush you may only take your own three.
          if (this.rushActive && ball.rushBall && this.isOpponentSide(player.team, ball.x)) {
            continue;
          }
          this.doPickup(player, ball);
        }
      }
    }
  }

  /**
   * Rule 16.1: a valid attempt lands or passes within a metre of an opponent,
   * or of where an opponent stood when the ball was released.
   */
  private checkAttempt(ball: Ball): void {
    if (!ball.live || ball.validAttempt) return;
    for (const pos of ball.releasePositions) {
      if (dist(ball.x, ball.y, pos.x, pos.y) < NEAR_MISS) {
        ball.validAttempt = true;
        return;
      }
    }
    for (const player of this.players) {
      if (!player.alive || player.team === ball.throwerTeam) continue;
      if (dist(ball.x, ball.y, player.x, player.y) < NEAR_MISS) {
        ball.validAttempt = true;
        return;
      }
    }
  }

  private doHit(player: Player, ball: Ball): void {
    const color = ball.team ? TEAMS[ball.team].main : '#fbbf24';
    ball.validAttempt = true;
    ball.land(this);
    ball.pickupCd = 0.3;

    if (ball.thrower) ball.thrower.stats.outs++;
    this.burst(player.x, player.y, color, 18, 1.15, 'spark');
    this.ring(player.x, player.y, color, 24);
    this.shake = Math.max(this.shake, 10);
    this.flash = Math.max(this.flash, 0.2);
    sfx.hit();
    this.eliminate(player, 'hit');
  }

  private doCatch(player: Player, ball: Ball): void {
    player.catchWindow = 0;

    // Rule 21: a ball in hand is a shield, not a free catch.
    if (player.ball) {
      if (this.suddenDeath) return; // Rule 9.7.1: no blocking in sudden death
      this.doBlock(player, ball);
      return;
    }

    const thrower = ball.thrower;
    const palette = ball.team ? TEAMS[ball.team] : TEAMS[player.team];

    ball.live = false;
    ball.team = player.team;
    ball.thrower = null;
    ball.throwerTeam = null;
    ball.vx = 0;
    ball.vy = 0;
    ball.trail = [];
    ball.heldBy = player;
    ball.armed = true;
    ball.rushBall = false;
    ball.canOut = true;
    ball.validAttempt = true;
    player.ball = ball;
    player.stats.catches++;

    this.burst(player.x, player.y, palette.light, 18, 1.1, 'spark');
    this.ring(player.x, player.y, palette.light, 26);
    this.addFloater(player.x, player.y - 40, 'CAUGHT!', palette.light, 1.2);
    this.shake = Math.max(this.shake, 7);
    this.flash = Math.max(this.flash, 0.16);
    sfx.catchBall();

    // Rule 23.1: the thrower is out. Rule 23.4: a queued teammate re-enters.
    if (thrower && thrower.alive) {
      this.addFloater(thrower.x, thrower.y - 36, 'OUT', TEAMS[thrower.team].light, 1.1);
      this.eliminate(thrower, 'caught');
      if (!this.setResolved) this.reenter(player.team);
    }
  }

  /** Rule 21.2: a blocked ball remains live. */
  private doBlock(player: Player, ball: Ball): void {
    player.catchWindow = 0;
    const angle = Math.atan2(ball.vy, ball.vx) + Math.PI + rand(-0.55, 0.55);
    const speed = Math.max(PHYS.blockMinSpeed, ball.speed * PHYS.blockRetain);
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.ignore = player;
    ball.ignoreTime = 0.26;
    ball.validAttempt = true;
    ball.pickupCd = 0.2;

    this.burst(player.x, player.y, '#dbeafe', 9, 0.8, 'spark');
    this.ring(player.x, player.y, '#dbeafe', 18);
    this.addFloater(player.x, player.y - 38, 'BLOCK', '#dbeafe', 0.9);
    this.shake = Math.max(this.shake, 4);
    sfx.block();
  }

  private eliminate(player: Player, cause: 'hit' | 'caught'): void {
    if (!player.alive) return;
    player.alive = false;
    player.outAt = this.time;
    player.outX = player.x;
    player.outY = player.y;
    player.charging = false;
    player.charge = 0;
    player.catchWindow = 0;
    if (player.ball) {
      this.dropBall(player.ball, player.x, player.y);
      player.ball = null;
    }

    if (!this.queues[player.team].includes(player)) this.queues[player.team].push(player);

    const palette = TEAMS[player.team];
    this.burst(player.x, player.y, palette.main, 20, 1.4, 'spark');
    this.ring(player.x, player.y, palette.light, 30);
    if (!player.isHuman) this.addFloater(player.x, player.y - 40, 'OUT!', palette.light, 1);
    this.shake = Math.max(this.shake, cause === 'caught' ? 8 : 11);
    this.flash = Math.max(this.flash, 0.24);

    this.checkSetEnd();
  }

  /** Rule 25: re-entry from the queue, over the back line. */
  private reenter(team: TeamId): void {
    const queue = this.queues[team];
    const player = queue.shift();
    if (!player) return;
    const [x, y] = SPAWNS[team][player.slot];
    player.reenter(x, y);
    this.burst(player.x, player.y, TEAMS[team].light, 14, 0.9, 'spark');
    this.ring(player.x, player.y, TEAMS[team].light, 22);
    this.addFloater(player.x, player.y - 36, `${player.name.toUpperCase()} IN`, TEAMS[team].light, 1.2);
    sfx.pickup();
  }

  /** Rule 29.3.2: simultaneous all-out voids the set in the Foam format. */
  private checkSetEnd(): void {
    if (this.setResolved) return;
    const blue = this.aliveCount('blue');
    const red = this.aliveCount('red');
    if (blue > 0 && red > 0) return;

    this.setResolved = true;
    const winner: TeamId | null = blue === red ? null : blue > red ? 'blue' : 'red';
    if (winner) this.lastSetWinner = winner;
    this.shotClock = SHOT_CLOCK;
    this.shotTeam = null;
    this.onSetEnd?.(winner);
  }

  celebrate(winner: TeamId): void {
    if (winner === 'blue') this.confetti(110);
  }

  punch(): void {
    this.shake = Math.max(this.shake, 11);
    this.flash = Math.max(this.flash, 0.26);
    this.slowmo = 0.3;
  }

  // -------------------------------------------------------------- world tick

  private separatePlayers(): void {
    const list = this.players;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d >= min) continue;
        if (d < 0.001) {
          dx = rand(-1, 1);
          dy = rand(-1, 1);
          d = Math.hypot(dx, dy) || 1;
        }
        const push = (min - d) * 0.5;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }

    for (const p of list) {
      if (!p.alive) continue;
      const bounds = this.bounds(p.team);
      p.x = clamp(p.x, bounds.minX + p.radius, bounds.maxX - p.radius);
      p.y = clamp(p.y, COURT.y + p.radius, COURT.bottom - p.radius);
    }
  }

  // ------------------------------------------------------------------ events

  onDash(player: Player): void {
    sfx.dash();
    for (let i = 0; i < 7; i++) {
      this.particles.push({
        x: player.x + rand(-6, 6),
        y: player.y + rand(-6, 6),
        vx: -player.dashX * rand(30, 120) + rand(-40, 40),
        vy: -player.dashY * rand(30, 120) + rand(-40, 40),
        life: rand(0.2, 0.45),
        max: 0.45,
        size: rand(2, 5),
        color: 'rgba(203,213,225,0.55)',
        drag: 4,
        type: 'dust',
        spin: 0,
        spinV: 0,
      });
    }
  }

  onCatchStart(): void {
    sfx.catchStart();
  }

  /** Rule 15.6: a live ball dies when it touches a surface. */
  onBallSurface(x: number, y: number, speed: number): void {
    sfx.bounce(speed / 1300);
    if (speed > 500) {
      this.burst(x, y, 'rgba(226,232,240,0.7)', 4, 0.35, 'dust');
      this.shake = Math.max(this.shake, 2);
    }
  }

  onBallLanded(ball: Ball): void {
    if (!ball.validAttempt && !ball.warningIssued && ball.throwerTeam) {
      ball.warningIssued = true;
      this.warnings[ball.throwerTeam] += 1;
      if (ball.thrower?.isHuman) {
        this.addFloater(ball.x, ball.y - 22, 'NO TOUCH', '#fca5a5', 1);
      }
    }
  }

  // --------------------------------------------------------------- particles

  burst(
    x: number,
    y: number,
    color: string,
    count = 12,
    power = 1,
    type: ParticleType = 'spark',
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, TAU);
      const speed = rand(50, 340) * power;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.22, 0.62),
        max: 0.62,
        size: rand(1.6, 4.2),
        color,
        drag: 3.6,
        type,
        spin: 0,
        spinV: 0,
      });
      if (this.particles.length > 700) this.particles.shift();
    }
  }

  ring(x: number, y: number, color: string, size = 26): void {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.42,
      max: 0.42,
      size,
      color,
      drag: 0,
      type: 'ring',
      spin: 0,
      spinV: 0,
    });
  }

  confetti(count = 80): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: rand(0, 1280),
        y: rand(-80, 120),
        vx: rand(-70, 70),
        vy: rand(70, 240),
        life: rand(1.6, 3.2),
        max: 3.2,
        size: rand(3, 7),
        color: pick(CONFETTI_COLORS),
        drag: 0.25,
        type: 'confetti',
        spin: rand(0, TAU),
        spinV: rand(-8, 8),
      });
    }
  }

  addFloater(x: number, y: number, text: string, color: string, life = 1): void {
    this.floaters.push({ x, y, text, color, life, max: life });
    if (this.floaters.length > 30) this.floaters.shift();
  }

  private updateEffects(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      if (p.type === 'confetti') {
        p.vy += 150 * dt;
        p.vx *= 1 - 0.6 * dt;
        p.spin += p.spinV * dt;
      }
    }
    if (this.particles.length) this.particles = this.particles.filter((p) => p.life > 0);

    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 30 * dt;
    }
    if (this.floaters.length) this.floaters = this.floaters.filter((f) => f.life > 0);
  }
}
