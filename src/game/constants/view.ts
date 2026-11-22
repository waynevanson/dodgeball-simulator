// The whole game is authored in a fixed 1280x720 logical space and scaled to
// the canvas, so every constant below is in "world pixels".
export const VIEW_W = 1280;

export const VIEW_H = 720;

export interface CourtRect {
  x: number;
  y: number;
  w: number;
  h: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
}

export const courtBase = { x: 42, y: 116, w: 1196, h: 544 };

/**
 * Playing court: 18m x 9m (VDL Rule 1.1) mapped onto 1196 x 544 px.
 * 1 metre ~= 66.4px, which drives the attack line and 1m "valid attempt" checks.
 */
export const COURT: CourtRect = {
  ...courtBase,
  right: courtBase.x + courtBase.w,
  bottom: courtBase.y + courtBase.h,
  cx: courtBase.x + courtBase.w / 2,
  cy: courtBase.y + courtBase.h / 2,
};

export const PX_PER_METRE = COURT.w / 18;
