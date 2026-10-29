/** Alignment guides for the 2D stage and snapping of a dragged element by its ink box. Millimeters, badge coordinates. */
import { area, bounds } from './geom';
import type { Rect } from './geom';
import type { ResolvedBadge } from './resolve';

export interface Guides {
  /** x positions of vertical guides, ascending. */
  xs: number[];
  /** y positions of horizontal guides, ascending. */
  ys: number[];
}

/** Rounds to 0.01 mm, symmetrically about zero so -4.125 and 4.125 round alike; `+ 0` turns -0 into 0. */
const round2 = (v: number): number => Math.sign(v) * Math.round(Math.abs(v) * 100) / 100 + 0;

const sortedUnique = (values: number[]): number[] => [...new Set(values.map(round2))].sort((a, b) => a - b);

/**
 * The guides a moving element can snap to: the badge center, the outline's edges, the border's inner edge, and the
 * ink left/center/right and top/middle/bottom of every element except `excludeId`.
 */
export function guideLines(resolved: ResolvedBadge, excludeId: string | null): Guides {
  const xs = [0];
  const ys = [0];
  const addRect = (r: Rect, withCenter: boolean) => {
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.h);
    if (withCenter) {
      xs.push(r.x + r.w / 2);
      ys.push(r.y + r.h / 2);
    }
  };

  const outline = bounds(resolved.outline);
  if (outline) addRect(outline, false);

  // The bands' own bounds are the ring's outer extent; the holes' bounds are its inner edge.
  const holes = resolved.border.bands.filter((contour) => area([contour]) < 0);
  const inner = bounds(holes);
  if (inner) addRect(inner, false);

  for (const el of resolved.elements) {
    if (el.id !== excludeId) addRect(el.ink, true);
  }
  return { xs: sortedUnique(xs), ys: sortedUnique(ys) };
}

/**
 * The new offset along one axis after landing the nearest of `ink`'s low edge, center, or high edge (at `origin`,
 * `origin + size / 2`, `origin + size`) on a guide within `thresholdMm`, or null when none is that close.
 * `delta` is the offset applied so far; the result is computed from the guide itself so it lands exactly.
 */
function snapAxis(origin: number, size: number, delta: number, guides: number[], thresholdMm: number): { delta: number; hit: number } | null {
  let best: { delta: number; hit: number; dist: number } | null = null;
  for (const guide of guides) {
    for (const off of [0, size / 2, size]) {
      const dist = Math.abs(guide - (origin + delta + off));
      if (dist <= thresholdMm && (best === null || dist < best.dist)) best = { delta: guide - (origin + off), hit: guide, dist };
    }
  }
  return best;
}

/**
 * Snaps the `ink` box moved by (`dx`, `dy`): on each axis, the nearest of its low edge, center, and high edge to a
 * guide within `thresholdMm` lands exactly on that guide.
 */
export function snapMove(
  ink: Rect,
  dx: number,
  dy: number,
  guides: Guides,
  thresholdMm: number
): { dx: number; dy: number; hitX: number | null; hitY: number | null } {
  const sx = snapAxis(ink.x, ink.w, dx, guides.xs, thresholdMm);
  const sy = snapAxis(ink.y, ink.h, dy, guides.ys, thresholdMm);
  return { dx: sx ? sx.delta : dx, dy: sy ? sy.delta : dy, hitX: sx ? sx.hit : null, hitY: sy ? sy.hit : null };
}
