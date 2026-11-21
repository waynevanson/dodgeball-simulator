import {
  ATTACK_DIST,
  BALL_MARK_SPACING,
  COUNTDOWN_SECONDS,
  COURT,
  PHYS,
  SET_BREAK_MS,
  TEAMS,
  VIEW_H,
  VIEW_W,
  WINS_NEEDED,
} from './constants';
import { clamp, easeOutCubic, roundRect, TAU } from './math';
import type { Ball } from './entities';
import type { GameWorld } from './world';
import type { Hud, TeamId } from './types';
import type { Input } from './input';

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

export function render(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  hud: Hud,
  input: Input,
  time: number,
): void {
  ctx.save();

  if (world.shake > 0.4) {
    const s = world.shake * 0.42;
    ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
  }

  drawBackdrop(ctx, time);
  drawCourt(ctx, time);
  drawQueues(ctx, hud, time);
  drawParticles(ctx, world, 'under');
  drawGroundBalls(ctx, world);
  drawEliminated(ctx, world);
  drawPlayers(ctx, world, time);
  drawActiveBalls(ctx, world);
  drawParticles(ctx, world, 'over');
  drawFloaters(ctx, world);
  drawHud(ctx, world, hud, input, time);
  drawPhaseOverlay(ctx, hud);
  drawAimCursor(ctx, hud, input);

  ctx.restore();
  drawFlash(ctx, world);
}

// ------------------------------------------------------------------ world art

function drawBackdrop(ctx: CanvasRenderingContext2D, time: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#0a101d');
  g.addColorStop(0.5, '#070c15');
  g.addColorStop(1, '#04070c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const glow = ctx.createRadialGradient(
    VIEW_W / 2,
    COURT.y + 80,
    30,
    VIEW_W / 2,
    COURT.y + 80,
    820,
  );
  glow.addColorStop(0, 'rgba(91, 147, 255, 0.07)');
  glow.addColorStop(0.55, 'rgba(91, 147, 255, 0.02)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const breathe = 0.5 + Math.sin(time * 0.5) * 0.5;
  ctx.fillStyle = `rgba(255, 95, 115, ${0.02 + breathe * 0.012})`;
  ctx.fillRect(0, VIEW_H - 110, VIEW_W, 110);
}

function drawCourt(ctx: CanvasRenderingContext2D, time: number): void {
  const C = COURT;

  roundRect(ctx, C.x - 4, C.y + 8, C.w + 8, C.h + 6, 28);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();

  roundRect(ctx, C.x, C.y, C.w, C.h, 24);
  const floor = ctx.createLinearGradient(C.x, C.y, C.x, C.bottom);
  floor.addColorStop(0, '#172032');
  floor.addColorStop(0.45, '#121b2c');
  floor.addColorStop(1, '#0c1421');
  ctx.fillStyle = floor;
  ctx.fill();

  ctx.save();
  roundRect(ctx, C.x, C.y, C.w, C.h, 24);
  ctx.clip();

  const blueTint = ctx.createLinearGradient(C.x, 0, C.cx, 0);
  blueTint.addColorStop(0, 'rgba(91, 147, 255, 0.11)');
  blueTint.addColorStop(1, 'rgba(91, 147, 255, 0.01)');
  ctx.fillStyle = blueTint;
  ctx.fillRect(C.x, C.y, C.w / 2, C.h);

  const redTint = ctx.createLinearGradient(C.right, 0, C.cx, 0);
  redTint.addColorStop(0, 'rgba(255, 95, 115, 0.11)');
  redTint.addColorStop(1, 'rgba(255, 95, 115, 0.01)');
  ctx.fillStyle = redTint;
  ctx.fillRect(C.cx, C.y, C.w / 2, C.h);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
  ctx.lineWidth = 1;
  for (let x = C.x + 26; x < C.right; x += 62) {
    ctx.beginPath();
    ctx.moveTo(x, C.y);
    ctx.lineTo(x, C.bottom);
    ctx.stroke();
  }
  for (let y = C.y + 26; y < C.bottom; y += 74) {
    ctx.beginPath();
    ctx.moveTo(C.x, y);
    ctx.lineTo(C.right, y);
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 156px ${FONT}`;
  ctx.fillStyle = 'rgba(91, 147, 255, 0.05)';
  ctx.fillText('BLUE', C.x + C.w * 0.25, C.cy + 8);
  ctx.fillStyle = 'rgba(255, 95, 115, 0.05)';
  ctx.fillText('RED', C.x + C.w * 0.75, C.cy + 8);

  ctx.restore();

  // --- attack lines (Rule 1.3.4 / 13.7.1)
  const attackBlue = C.cx - ATTACK_DIST;
  const attackRed = C.cx + ATTACK_DIST;
  ctx.save();
  ctx.setLineDash([9, 9]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(91, 147, 255, 0.28)';
  ctx.beginPath();
  ctx.moveTo(attackBlue, C.y + 10);
  ctx.lineTo(attackBlue, C.bottom - 10);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 95, 115, 0.28)';
  ctx.beginPath();
  ctx.moveTo(attackRed, C.y + 10);
  ctx.lineTo(attackRed, C.bottom - 10);
  ctx.stroke();
  ctx.restore();

  ctx.font = `800 9px ${MONO}`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
  ctx.textAlign = 'center';
  ctx.fillText('ATTACK', attackBlue, C.y + 24);
  ctx.fillText('ATTACK', attackRed, C.y + 24);
  ctx.fillText('BACK LINE', C.x + 46, C.bottom - 16);
  ctx.fillText('BACK LINE', C.right - 46, C.bottom - 16);

  // --- centre line + ball markings (Rule 1.3.6)
  const pulse = 0.5 + Math.sin(time * 1.6) * 0.5;
  ctx.strokeStyle = `rgba(226, 232, 240, ${0.1 + pulse * 0.05})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(C.cx, C.y + 8);
  ctx.lineTo(C.cx, C.bottom - 8);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(226, 232, 240, 0.22)';
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    const y = C.cy + i * BALL_MARK_SPACING;
    ctx.beginPath();
    ctx.moveTo(C.cx - 9, y);
    ctx.lineTo(C.cx + 9, y);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(C.cx, C.cy, 86, 0, TAU);
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.07)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // --- boundary
  roundRect(ctx, C.x, C.y, C.w, C.h, 24);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  roundRect(ctx, C.x + 6, C.y + 6, C.w - 12, C.h - 12, 19);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawQueues(ctx: CanvasRenderingContext2D, hud: Hud, time: number): void {
  for (const team of ['blue', 'red'] as const) {
    const queue = hud.outQueue[team];
    if (!queue.length) continue;
    const palette = TEAMS[team];
    const x = team === 'blue' ? COURT.x - 22 : COURT.right + 22;
    const dir = team === 'blue' ? -1 : 1;

    ctx.save();
    ctx.font = `800 7px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.fillText('QUEUE', x + dir * 2, COURT.cy - 76);

    queue.forEach((player, index) => {
      const y = COURT.cy - 44 + index * (hud.compact ? 48 : 42);
      const next = index === 0;
      ctx.beginPath();
      ctx.arc(x, y, hud.compact ? 15 : 12, 0, TAU);
      ctx.fillStyle = 'rgba(9, 13, 22, 0.9)';
      ctx.fill();
      ctx.strokeStyle = next ? palette.light : 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = next ? 2 : 1.5;
      if (next) {
        const pulse = 0.4 + Math.sin(time * 3.4) * 0.2;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.stroke();
      }
      ctx.font = `800 ${hud.compact ? 11 : 9}px ${FONT}`;
      ctx.fillStyle = next ? palette.light : 'rgba(148, 163, 184, 0.55)';
      ctx.fillText(String(player.number), x, y + 0.5);
    });

    // Re-entry arrow for the next player in.
    if (queue.length) {
      const y = COURT.cy - 44;
      ctx.beginPath();
      ctx.moveTo(x + dir * 14, y);
      ctx.lineTo(x + dir * 20, y);
      ctx.strokeStyle = palette.main;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBallShape(ctx: CanvasRenderingContext2D, ball: Ball): void {
  const r = ball.radius;

  ctx.beginPath();
  ctx.ellipse(ball.x + 2, ball.y + r * 0.62, r * 0.95, r * 0.5, 0, 0, TAU);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.fill();

  const powered = ball.live && ball.canOut;
  if (powered) {
    ctx.save();
    ctx.shadowColor = 'rgba(251, 191, 36, 0.75)';
    ctx.shadowBlur = 16;
  }

  const g = ctx.createRadialGradient(
    ball.x - r * 0.36,
    ball.y - r * 0.42,
    r * 0.12,
    ball.x,
    ball.y,
    r * 1.15,
  );
  if (ball.armed) {
    g.addColorStop(0, '#fff6cf');
    g.addColorStop(0.42, '#fbbf24');
    g.addColorStop(1, '#b96c08');
  } else {
    // Unarmed balls look cold until they cross the attack line.
    g.addColorStop(0, '#f1f5f9');
    g.addColorStop(0.42, '#94a3b8');
    g.addColorStop(1, '#475569');
  }
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  if (powered) ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, r, 0, TAU);
  ctx.clip();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.spin);
  ctx.fillStyle = ball.armed ? 'rgba(40, 26, 6, 0.5)' : 'rgba(15, 23, 42, 0.45)';
  ctx.fillRect(-r * 1.6, -r * 0.2, r * 3.2, r * 0.4);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, r, 0, TAU);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (!ball.armed) {
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r + 5, 0, TAU);
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.65)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }
}

function drawGroundBalls(ctx: CanvasRenderingContext2D, world: GameWorld): void {
  for (const ball of world.balls) {
    if (ball.heldBy || ball.live) continue;
    const armed = ball.armed;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 15.5, 0, TAU);
    ctx.strokeStyle = armed ? 'rgba(251, 191, 36, 0.1)' : 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawBallShape(ctx, ball);
  }
}

function drawActiveBalls(ctx: CanvasRenderingContext2D, world: GameWorld): void {
  for (const ball of world.balls) {
    if (ball.heldBy || !ball.live) continue;
    for (const trail of ball.trail) {
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, ball.radius * 0.85, 0, TAU);
      ctx.fillStyle = ball.canOut
        ? `rgba(251, 191, 36, ${0.04 + trail.a * 0.16})`
        : `rgba(148, 163, 184, ${0.03 + trail.a * 0.1})`;
      ctx.fill();
    }
    drawBallShape(ctx, ball);
  }
  for (const ball of world.balls) {
    if (ball.heldBy) drawBallShape(ctx, ball);
  }
}

function drawPlayers(ctx: CanvasRenderingContext2D, world: GameWorld, time: number): void {
  for (const p of world.players) {
    if (!p.alive) continue;
    const palette = TEAMS[p.team];
    const entering = p.isEntering;

    for (const trail of p.trail) {
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, p.radius * (0.5 + trail.a * 0.45), 0, TAU);
      ctx.globalAlpha = 0.05 + trail.a * 0.2;
      ctx.fillStyle = palette.main;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.ellipse(p.x + 1, p.y + p.radius * 0.8, p.radius * 0.98, p.radius * 0.46, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.fill();

    if (p.catchWindow > 0) {
      const k = 1 - p.catchWindow / PHYS.catchWindow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 7 + k * 16, 0, TAU);
      ctx.strokeStyle = `rgba(226, 232, 240, ${0.6 * (1 - k)})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.save();
    if (entering) ctx.globalAlpha = 0.55;
    ctx.translate(p.x, p.y);

    ctx.beginPath();
    ctx.arc(0, 0, p.radius + 2.5, 0, TAU);
    ctx.fillStyle = palette.deep;
    ctx.fill();

    const g = ctx.createRadialGradient(
      -p.radius * 0.35,
      -p.radius * 0.45,
      p.radius * 0.1,
      0,
      0,
      p.radius * 1.25,
    );
    g.addColorStop(0, palette.light);
    g.addColorStop(0.42, palette.main);
    g.addColorStop(1, palette.dark);
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();

    if (p.hitFlash > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, TAU);
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.85, p.hitFlash)})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, p.radius * 0.92, p.facing - 0.42, p.facing + 0.42);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fill();

    ctx.font = `800 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8, 14, 26, 0.62)';
    ctx.fillText(String(p.number), 0, 1);

    ctx.restore();

    if (entering) {
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 6, 0, TAU);
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    if (p.charging) {
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        p.radius + 8,
        -Math.PI / 2,
        -Math.PI / 2 + TAU * clamp(p.charge, 0, 1),
      );
      ctx.strokeStyle = p.charge > 0.985 ? '#fff6cf' : '#fbbf24';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.stroke();

      const len = 60 + 250 * clamp(p.charge, 0, 1);
      const offset = p.radius + 11;
      ctx.save();
      ctx.setLineDash([2, 9]);
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.facing) * offset, p.y + Math.sin(p.facing) * offset);
      ctx.lineTo(
        p.x + Math.cos(p.facing) * (offset + len),
        p.y + Math.sin(p.facing) * (offset + len),
      );
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    if (p.isHuman) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 10 + Math.sin(time * 4) * 1.6, 0, TAU);
      ctx.strokeStyle = 'rgba(232, 238, 252, 0.42)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `900 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(232, 238, 252, 0.7)';
      ctx.fillText('YOU', p.x, p.y + p.radius + 20);
    }
  }
}

function drawEliminated(ctx: CanvasRenderingContext2D, world: GameWorld): void {
  for (const p of world.players) {
    if (p.alive) continue;
    const palette = TEAMS[p.team];
    const { outX: x, outY: y } = p;
    const fade = clamp(1 - (world.time - p.outAt) / 2.2, 0.25, 1);
    ctx.save();
    ctx.globalAlpha = 0.3 * fade;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = palette.main;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 6.5, y - 6.5);
    ctx.lineTo(x + 6.5, y + 6.5);
    ctx.moveTo(x + 6.5, y - 6.5);
    ctx.lineTo(x - 6.5, y + 6.5);
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  layer: 'under' | 'over',
): void {
  ctx.save();
  for (const p of world.particles) {
    if (layer === 'under' && p.type !== 'dust') continue;
    if (layer === 'over' && p.type === 'dust') continue;
    const t = clamp(p.life / p.max, 0, 1);

    if (p.type === 'ring') {
      const k = 1 - t;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + k * 46, 0, TAU);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = t * 0.7;
      ctx.lineWidth = 3 * t + 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }

    if (p.type === 'confetti') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
      ctx.globalAlpha = 1;
      continue;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.35 + t * 0.85), 0, TAU);
    ctx.globalAlpha = p.type === 'dust' ? t * 0.5 : t;
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawFloaters(ctx: CanvasRenderingContext2D, world: GameWorld): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of world.floaters) {
    const t = clamp(f.life / f.max, 0, 1);
    const pop = 1 + (1 - t) * 0.18;
    ctx.globalAlpha = Math.min(1, t * 1.6);
    ctx.font = `900 ${15 * pop}px ${FONT}`;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(4, 7, 12, 0.72)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------- HUD

const formatClock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function drawHud(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  hud: Hud,
  input: Input,
  time: number,
): void {
  const bar = ctx.createLinearGradient(0, 0, 0, 116);
  bar.addColorStop(0, 'rgba(5, 8, 14, 0.9)');
  bar.addColorStop(0.75, 'rgba(5, 8, 14, 0.5)');
  bar.addColorStop(1, 'rgba(5, 8, 14, 0)');
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, VIEW_W, 118);

  drawTeamHud(ctx, hud, 'blue');
  drawTeamHud(ctx, hud, 'red');
  drawCenterHud(ctx, hud, time);
  drawBottomBar(ctx, world, hud, input, time);
}

function drawTeamHud(ctx: CanvasRenderingContext2D, hud: Hud, team: TeamId): void {
  const palette = TEAMS[team];
  const left = team === 'blue';
  const x0 = left ? COURT.x : COURT.right;
  const dir = left ? 1 : -1;

  const compact = hud.compact;
  ctx.textAlign = left ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${compact ? 23 : 18}px ${FONT}`;
  ctx.fillStyle = palette.main;
  ctx.fillText(team.toUpperCase(), x0, compact ? 30 : 28);

  for (let i = 0; i < WINS_NEEDED; i++) {
    const x = x0 + dir * (76 + i * (compact ? 18 : 16));
    ctx.beginPath();
    ctx.arc(x, compact ? 30 : 28, compact ? 5.5 : 4.5, 0, TAU);
    if (i < hud.score[team]) {
      ctx.fillStyle = palette.main;
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  // Rule 16.3 warnings (referee discretion, tracked for transparency).
  if (hud.warnings[team] > 0) {
    const wx = x0 + dir * (compact ? 148 : 132);
    ctx.font = `800 ${compact ? 11 : 8}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(251, 191, 36, 0.85)';
    ctx.fillText(`!${hud.warnings[team]}`, wx, 29);
  }

  const roster = hud.roster[team];
  roster.forEach((p, i) => {
    const px = x0 + dir * ((compact ? 13 : 10) + i * (compact ? 36 : 30));
    const py = compact ? 74 : 64;
    ctx.beginPath();
    ctx.arc(px, py, compact ? 12 : 9, 0, TAU);
    if (p.alive) {
      ctx.fillStyle = palette.main;
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(10, 16, 28, 0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.font = `800 ${compact ? 11 : 9}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.alive ? 'rgba(6, 12, 24, 0.8)' : 'rgba(148, 163, 184, 0.45)';
    ctx.fillText(String(p.number), px, py + 0.5);
    if (p.entering) {
      ctx.beginPath();
      ctx.arc(px, py, compact ? 15 : 12, 0, TAU);
      ctx.strokeStyle = 'rgba(232, 238, 252, 0.5)';
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (p.human) {
      ctx.beginPath();
      ctx.arc(px, py, compact ? 16 : 13, 0, TAU);
      ctx.strokeStyle = 'rgba(232, 238, 252, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  });
}

function drawCenterHud(ctx: CanvasRenderingContext2D, hud: Hud, time: number): void {
  const cx = VIEW_W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const compact = hud.compact;
  ctx.font = `800 ${compact ? 13 : 10}px ${MONO}`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.62)';
  ctx.fillText(`SET ${hud.set} · ${hud.difficulty.label.toUpperCase()}`, cx, 15);

  const shotActive = hud.shot.team !== null && hud.shot.timeLeft > 0;
  const shotColor = hud.shot.team ? TEAMS[hud.shot.team].main : '#e8eefc';
  const warn = shotActive && hud.shot.timeLeft <= 5;
  const pulse = warn ? 1 + Math.sin(time * 12) * 0.09 : 1;

  ctx.save();
  ctx.translate(cx, compact ? 52 : 50);
  ctx.scale(pulse, pulse);
  ctx.font = `800 ${compact ? 44 : 34}px ${MONO}`;
  if (shotActive) {
    ctx.fillStyle = warn ? '#ffb3bd' : shotColor;
    ctx.fillText(String(Math.ceil(hud.shot.timeLeft)), 0, 0);
  } else {
    ctx.fillStyle = '#e8eefc';
    ctx.fillText(hud.phase === 'menu' ? '\u2013\u2013' : formatClock(hud.setElapsed), 0, 0);
  }
  ctx.restore();

  ctx.font = `700 ${compact ? 10 : 8}px ${MONO}`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.fillText(shotActive ? 'SHOT CLOCK' : 'SET TIME', cx, compact ? 82 : 77);

  if (hud.suddenDeath) {
    ctx.font = `900 ${compact ? 11 : 9}px ${MONO}`;
    ctx.fillStyle = 'rgba(255, 138, 154, 0.9)';
    ctx.fillText('SUDDEN DEATH · NO BLOCKING', cx, compact ? 104 : 96);
  } else if (hud.rushActive) {
    ctx.font = `900 ${compact ? 11 : 9}px ${MONO}`;
    ctx.fillStyle = 'rgba(251, 191, 36, 0.85)';
    ctx.fillText('OPENING RUSH', cx, compact ? 104 : 96);
  }
}

function drawBottomBar(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  hud: Hud,
  input: Input,
  time: number,
): void {
  const y = 692;
  const compact = hud.compact;
  const human = world.human;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Rule 20 / 24 / 25: out players wait in the queue for a catch.
  if (!human.alive && (hud.phase === 'playing' || hud.phase === 'setover')) {
    const alpha = 0.55 + Math.sin(time * 3.2) * 0.18;
    ctx.font = `900 ${compact ? 15 : 12}px ${FONT}`;
    ctx.fillStyle = `rgba(255, 138, 154, ${alpha})`;
    ctx.fillText(
      compact
        ? 'YOU ARE OUT — A CATCH PUTS YOU BACK IN'
        : 'YOU ARE OUT — A CATCH BY BLUE PUTS YOU BACK IN',
      VIEW_W / 2,
      y - (compact ? 8 : 10),
    );
    if (!compact) {
      ctx.font = `700 9.5px ${MONO}`;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.fillText('WAITING IN THE QUEUE', VIEW_W / 2, y + 12);
    }
    return;
  }

  let text: string;
  if (hud.phase === 'playing' && hud.rushActive && !human.ball) {
    text = compact ? 'OPENING RUSH — GRAB A BALL!' : 'OPENING RUSH — SPRINT TO THE CENTRE LINE AND GRAB A BALL';
  } else if (hud.phase === 'playing' && human.ball && !human.ball.armed) {
    text = compact
      ? 'CARRY IT BEHIND THE ATTACK LINE TO ARM IT'
      : 'BALL INACTIVE — CARRY IT BEHIND THE ATTACK LINE TO ARM IT';
  } else if (hud.phase === 'playing' && hud.shot.team === 'blue') {
    text = compact ? 'BLUE ADVANTAGE — THROW THE BALL!' : 'BLUE HAS THE BALL ADVANTAGE — SOMEONE MUST THROW';
  } else if (input.usingTouch) {
    text = compact ? 'STICK MOVE · HOLD THROW · DASH · CATCH' : 'STICK: MOVE  ·  HOLD THROW: CHARGE  ·  DASH  ·  CATCH / BLOCK';
  } else {
    text =
      'WASD MOVE  ·  HOLD LMB CHARGE  ·  SHIFT DASH  ·  SPACE CATCH (EMPTY HANDS) / BLOCK (BALL IN HAND)';
  }

  ctx.font = `700 ${compact ? 15 : 10}px ${FONT}`;
  if (compact) {
    const width = ctx.measureText(text).width + 30;
    roundRect(ctx, VIEW_W / 2 - width / 2, y - 15, width, 30, 15);
    ctx.fillStyle = 'rgba(5, 8, 14, 0.6)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.fillText(text, VIEW_W / 2, y);

  if (hud.phase === 'menu' || compact) return;
  ctx.font = `800 9px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.32)';
  ctx.fillText('FIRST TO 3 SETS', COURT.x, y);
  ctx.textAlign = 'right';
  ctx.fillText(`SET ${hud.set}`, COURT.right, y);
}

// ------------------------------------------------------------------ overlays

interface BannerStyle {
  text: string;
  sub: string;
  color: string;
  alpha: number;
  pop: number;
  big: boolean;
}

function drawBannerPanel(ctx: CanvasRenderingContext2D, banner: BannerStyle): void {
  ctx.save();
  ctx.globalAlpha = banner.alpha;
  ctx.translate(VIEW_W / 2, COURT.cy - 10);
  ctx.scale(0.92 + banner.pop * 0.08, 0.92 + banner.pop * 0.08);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const size = banner.big ? 64 : 34;
  ctx.font = `900 ${size}px ${FONT}`;
  const textWidth = ctx.measureText(banner.text).width;
  const panelWidth = Math.max(textWidth + 72, 320);
  const panelHeight = banner.sub ? 116 : 92;

  roundRect(ctx, -panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 18);
  ctx.fillStyle = 'rgba(5, 8, 14, 0.78)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = banner.color;
  ctx.fillText(banner.text, 0, banner.sub ? -16 : 0);

  if (banner.sub) {
    ctx.font = `700 20px ${MONO}`;
    ctx.fillStyle = 'rgba(232, 238, 252, 0.85)';
    ctx.fillText(banner.sub, 0, 28);
  }
  ctx.restore();
}

function drawPhaseOverlay(ctx: CanvasRenderingContext2D, hud: Hud): void {
  if (hud.phase === 'countdown') {
    drawCountdown(ctx, hud);
    return;
  }

  if (hud.phase === 'playing' && hud.phaseElapsed < 0.9) {
    const k = hud.phaseElapsed / 0.9;
    drawBannerPanel(ctx, {
      text: 'GO!',
      sub: '',
      color: '#e8eefc',
      alpha: clamp(Math.min(hud.phaseElapsed * 8, (1 - k) * 4), 0, 1),
      pop: easeOutCubic(clamp(hud.phaseElapsed * 6, 0, 1)),
      big: true,
    });
    return;
  }

  if (hud.phase === 'setover') {
    const duration = SET_BREAK_MS / 1000;
    const elapsed = hud.phaseElapsed;
    const winner = hud.lastSetWinner;
    const color = winner ? TEAMS[winner].main : '#cbd5e1';
    const text = winner
      ? `${TEAMS[winner].name.toUpperCase()} TAKES THE SET`
      : 'ALL OUT — SET VOID';
    drawBannerPanel(ctx, {
      text,
      sub: `${hud.score.blue} — ${hud.score.red}`,
      color,
      alpha: clamp(Math.min(elapsed * 7, (1 - elapsed / duration) * 3.2), 0, 1),
      pop: easeOutCubic(clamp(elapsed * 5.5, 0, 1)),
      big: false,
    });
    return;
  }

  if (hud.phase === 'matchover') {
    ctx.fillStyle = 'rgba(4, 6, 11, 0.32)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawCountdown(ctx: CanvasRenderingContext2D, hud: Hud): void {
  const remaining = Math.max(0.001, COUNTDOWN_SECONDS - hud.phaseElapsed);
  const n = clamp(Math.ceil(remaining - 0.1), 1, 3);
  const into = 1 - (((remaining - 0.1) % 1) + 1) % 1;
  const pop = easeOutCubic(clamp(into / 0.22, 0, 1));
  const scale = 1.32 - 0.32 * pop;
  const alpha = 0.25 + 0.75 * pop;

  ctx.save();
  ctx.translate(VIEW_W / 2, COURT.cy - 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `800 ${hud.compact ? 15 : 12}px ${MONO}`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
  ctx.fillText('LINE UP ON THE BACK LINE', 0, -104);

  ctx.beginPath();
  ctx.arc(0, 0, 92, -Math.PI / 2, -Math.PI / 2 + TAU * (remaining / COUNTDOWN_SECONDS));
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.globalAlpha = alpha;
  ctx.scale(scale, scale);
  ctx.font = `900 128px ${FONT}`;
  ctx.fillStyle = 'rgba(232, 238, 252, 0.94)';
  ctx.fillText(String(n), 0, 6);
  ctx.restore();
}

function drawAimCursor(ctx: CanvasRenderingContext2D, hud: Hud, input: Input): void {
  if (input.usingTouch || !input.mouse.used) return;
  if (hud.phase !== 'playing' && hud.phase !== 'countdown') return;

  const { x, y } = input.mouse;
  ctx.save();
  ctx.strokeStyle = 'rgba(232, 238, 252, 0.6)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, 8.5, 0, TAU);
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (i * TAU) / 4;
    ctx.moveTo(x + Math.cos(angle) * 11.5, y + Math.sin(angle) * 11.5);
    ctx.lineTo(x + Math.cos(angle) * 16, y + Math.sin(angle) * 16);
  }
  ctx.strokeStyle = 'rgba(232, 238, 252, 0.38)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 1.7, 0, TAU);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
  ctx.fill();
  ctx.restore();
}

function drawFlash(ctx: CanvasRenderingContext2D, world: GameWorld): void {
  if (world.flash <= 0.01) return;
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.3, world.flash * 0.28)})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
