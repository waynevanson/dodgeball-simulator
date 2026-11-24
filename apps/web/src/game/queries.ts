import type { BallView, Frame, PlayerView } from './frame';

/** Typed views over the Rust snapshot, mirroring the old ECS queries. */
export function players(frame: Frame): PlayerView[] {
  return frame.players;
}

export function balls(frame: Frame): BallView[] {
  return frame.balls;
}

export function human(frame: Frame): PlayerView | null {
  return frame.players.find((player) => player.tag.isYou) ?? null;
}

export function carriedBall(frame: Frame, player: PlayerView): BallView | null {
  const id = player.carry.ball;
  if (id === null) return null;
  return frame.balls.find((ball) => ball.id === id) ?? null;
}
