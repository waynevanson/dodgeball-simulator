import { EcsWorld } from '../../ecs/core';
import { WINS_NEEDED } from '../constants/rules';
import { TEAMS } from '../constants/teams';
import { COURT, VIEW_W } from '../constants/view';
import { Input } from '../input';
import { TAU } from '../math';
import type { Hud, TeamId } from '../types';
import { drawBottomBar } from './hint';
import { FONT, MONO } from './style';

// ---------------------------------------------------------------------- HUD
// ---------------------------------------------------------------------- HUD

export const formatClock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export function drawHud(
  ctx: CanvasRenderingContext2D,
  world: EcsWorld,
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

export function drawTeamHud(ctx: CanvasRenderingContext2D, hud: Hud, team: TeamId): void {
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

export function drawCenterHud(ctx: CanvasRenderingContext2D, hud: Hud, time: number): void {
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
