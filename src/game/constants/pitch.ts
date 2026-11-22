import { PX_PER_METRE } from './view';

export const PLAYER_RADIUS = 17;

export const BALL_RADIUS = 10;

/**
 * Foam Playing Format (VDL Rules 1.3.4, 2.1.2, 12.1.2):
 *  - six balls, three placed on each team's side of the centre line
 *  - attack line 3m back from the centre line
 *  - a ball picked up in the opening rush must fully cross the attack line
 *    before it is a live ball
 */
export const ATTACK_DIST = Math.round(3 * PX_PER_METRE);

 // ~199px
export const BALL_MARK_SPACING = Math.round(1.5 * PX_PER_METRE);

 // ~100px
export const NEAR_MISS = Math.round(1 * PX_PER_METRE);

 // ~66px (Rule 16.1)
export const RUSH_CROSS = 26;
