import { EcsWorld } from '../../ecs/core';
import { COURT, VIEW_W } from '../constants/view';
import { Input } from '../input';
import { roundRect } from '../math';
import { carriedBall, human } from '../queries';
import type { Hud } from '../types';
import { FONT, MONO } from './style';

export function drawBottomBar(
  ctx: CanvasRenderingContext2D,
  world: EcsWorld,
  hud: Hud,
  input: Input,
  time: number,
): void {
  const y = 692;
  const compact = hud.compact;
  const player = human(world);
  if (!player) return;
  const ball = carriedBall(world, player);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Rule 20 / 24 / 25: out players wait in the queue for a catch.
  if (!player.condition.alive && (hud.phase === 'playing' || hud.phase === 'setover')) {
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
  if (hud.phase === 'playing' && hud.rushActive && !ball) {
    text = compact ? 'OPENING RUSH — GRAB A BALL!' : 'OPENING RUSH — SPRINT TO THE CENTRE LINE AND GRAB A BALL';
  } else if (hud.phase === 'playing' && ball && !ball.state.armed) {
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
