import { EcsWorld } from '../../ecs/core';
import { dist, rand } from '../math';
import { carriedBall } from '../queries';
import type { PlayerView } from '../queries';
import type { Intent } from '../types';

export const baseIntent = (aim: number): Intent => ({
  mx: 0,
  my: 0,
  aim,
  charge: false,
  release: false,
  dash: false,
  catch: false,
});

export function chooseTarget(world: EcsWorld, view: PlayerView, foes: PlayerView[]): PlayerView {
  let best = foes[0];
  let bestScore = Infinity;
  for (const foe of foes) {
    let score = dist(view.transform.x, view.transform.y, foe.transform.x, foe.transform.y);
    if (carriedBall(world, foe)) score -= 130;
    if (foe.action.charging) score -= 70;
    score += rand(-70, 70);
    if (score < bestScore) {
      bestScore = score;
      best = foe;
    }
  }
  return best;
}
