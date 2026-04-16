export const SNAP_POINTS = [25, 33, 50, 66, 75, 100] as const;

export type SnapPoint = (typeof SNAP_POINTS)[number];

/**
 * Default width percentages when widthPercent is null, keyed by layout.
 */
export const LAYOUT_WIDTH_DEFAULTS: Record<string, number> = {
  'default': 100,
  'float-left': 40,
  'float-right': 40,
  'centered': 80,
  'full-width': 100,
};

/**
 * Snap a raw percentage to the nearest allowed snap point.
 * Always returns a valid snap value — no freeform intermediate widths.
 */
export function snapToPercent(raw: number): SnapPoint {
  const clamped = Math.max(25, Math.min(100, raw));
  return SNAP_POINTS.reduce((prev, curr) =>
    Math.abs(curr - clamped) < Math.abs(prev - clamped) ? curr : prev
  ) as SnapPoint;
}
