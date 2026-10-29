/** Pure geometry for the 2D stage: scale-handle math, the loading-text box, and the stacked layout's slots. */
import type { Rect } from '../engine/geom';
import type { TextElement } from '../engine/model';

/** A capital letter's height as a share of the font size, for text drawn before its outline arrives. */
export const FALLBACK_CAP_EM = 0.7;
/** The average glyph width as a share of the font size, for text drawn before its outline arrives. */
const FALLBACK_ADVANCE_EM = 0.65;

/**
 * The factor a corner handle scales its element by: the pointer's distance from the element center now over
 * its distance when the drag began. Never so small that the element's smaller side, `minSideMm` now, drops below `floorMm`.
 */
export function scaleFactor(startDistMm: number, distMm: number, minSideMm: number, floorMm: number): number {
  const raw = distMm / Math.max(startDistMm, 1e-6);
  return Math.max(raw, floorMm / Math.max(minSideMm, 1e-6));
}

/** Millimeters to the hundredth, so a scale drag does not write 7.620000000001 into the inspector. */
export const round2 = (v: number): number => Math.round(v * 100) / 100;

/** The lines of a text element, as the stage draws them while the font loads. */
export function textLines(el: TextElement): string[] {
  const lines = el.text.text.split(/\r?\n/).filter((l, i, all) => l.length > 0 || all.length === 1);
  return lines.length > 0 ? lines : ['TEXT'];
}

/** Font size in mm that gives the text its cap height. */
export const fallbackFontMm = (el: TextElement): number => el.capHeightMm / FALLBACK_CAP_EM;

/** A guess at the ink box of text whose outline has not arrived, centered on the element: enough to select and drag it. */
export function fallbackInk(el: TextElement): Rect {
  const font = fallbackFontMm(el);
  const lines = textLines(el);
  const longest = Math.max(...lines.map((l) => l.length));
  const w = longest * font * (FALLBACK_ADVANCE_EM + el.text.letterSpacingEm);
  const h = el.capHeightMm + (lines.length - 1) * font * el.text.lineHeight;
  return { x: el.x - w / 2, y: el.y - h / 2, w, h };
}

/**
 * Where the stacked layout puts each piece: left to right with `gapMm` between their bounds, sharing the
 * coordinates they already have vertically (the export's layout, without its margin). `dx[i]` moves piece i.
 */
export function pieceSlots(rects: (Rect | null)[], gapMm: number): { dx: number[]; bounds: Rect | null } {
  let cursor = 0;
  let top = Infinity;
  let bottom = -Infinity;
  const dx = rects.map((b) => {
    if (!b) return 0;
    const shift = cursor - b.x;
    cursor += b.w + gapMm;
    top = Math.min(top, b.y);
    bottom = Math.max(bottom, b.y + b.h);
    return shift;
  });
  const placed = rects.some((b) => b !== null);
  return { dx, bounds: placed ? { x: 0, y: top, w: cursor - gapMm, h: bottom - top } : null };
}
