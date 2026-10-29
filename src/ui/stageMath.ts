/** Pure geometry for the 2D stage: scale-handle math, the loading-text box, and kerning handles. The stacked layout's slots are the export's `pieceSlots`. */
import type { Rect } from '../engine/geom';
import type { TextElement } from '../engine/model';
import { splitLines, TEXT_RENDER_SIZE_PX } from '../engine/textOutline';

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

/** The lines of a text element, split as its outline is, so a line number means the same line in both. */
export const textLines = (el: TextElement): string[] => splitLines(el.text.text);

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
 * How many em a drag of `dxMm` along the text moves a letter pair. The outline is built at one em of
 * `TEXT_RENDER_SIZE_PX` px, and scaled so its caps are `capHeightMm` tall instead of `outlineCapPx`.
 */
export function kerningDeltaEm(dxMm: number, capHeightMm: number, outlineCapPx: number): number {
  if (!(capHeightMm > 0) || !(outlineCapPx > 0)) return 0;
  return dxMm / ((capHeightMm / outlineCapPx) * TEXT_RENDER_SIZE_PX);
}

/** A pointer move of (`dxMm`, `dyMm`) on the stage, measured along text turned `rotationDeg`. */
export function alongText(dxMm: number, dyMm: number, rotationDeg: number): number {
  const a = (rotationDeg * Math.PI) / 180;
  return dxMm * Math.cos(a) + dyMm * Math.sin(a);
}

/**
 * A pair value after a change, to the ten-thousandth of an em so repeated 0.01 steps do not
 * collect float noise.
 */
export const addPairEm = (current: number | undefined, deltaEm: number): number => Math.round(((current ?? 0) + deltaEm) * 1e4) / 1e4;

export interface KerningHandle {
  /** The `pairAdjustEm` key this handle edits: the line and the index where the pair starts. */
  key: string;
  /** The line, and the index in it of the cluster the handle sits on (the one it moves). */
  line: number;
  index: number;
  x: number;
  y: number;
}

/**
 * One handle per cluster except each line's first, at that cluster's start. It edits the pair that
 * begins at the cluster before it, so dragging it moves that cluster and every one after it.
 */
export function kerningHandles(clusters: { line: number; index: number; x: number; y: number }[]): KerningHandle[] {
  const handles: KerningHandle[] = [];
  clusters.forEach((c, i) => {
    const prev = clusters[i - 1];
    if (prev && prev.line === c.line) handles.push({ key: `${c.line}:${prev.index}`, line: c.line, index: c.index, x: c.x, y: c.y });
  });
  return handles;
}

/**
 * Where an element's center goes so the leading edge of its ink stays put while its width changes. The ink box is
 * centered on the element, so its leading edge sits `offset` (-width / 2) from the center along the text, which runs
 * `rotationDeg` from the x axis. `startOffset` is the offset when the edge was recorded at `center0`.
 */
export function anchoredCenter(center0: { x: number; y: number }, startOffset: number, offset: number, rotationDeg: number): { x: number; y: number } {
  const a = (rotationDeg * Math.PI) / 180;
  const shift = startOffset - offset;
  return { x: round2(center0.x + shift * Math.cos(a)), y: round2(center0.y + shift * Math.sin(a)) };
}
