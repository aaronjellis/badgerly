/**
 * The inset border. It is drawn on the stage, scored or engraved on the laser, and embossed on
 * the 3D version, so every style produces the same three things: filled `bands` at the border's
 * width, the `centerlines` to score, and the corner `ornaments`.
 */
import { bounds, difference, offset, offsetOpen, pathLength, union } from './geom';
import type { Poly, Pt, Rect } from './geom';
import { CORNER_MOTIFS, motifPoly } from './cornerArt';

export type BorderStyle = 'none' | 'single' | 'double' | 'dashed' | 'corners';

export interface BorderConfig {
  style: BorderStyle;
  /** Distance from the badge edge to the middle of the line. */
  insetMm: number;
  widthMm: number;
  /** Space between the two lines of a double border. */
  gapMm: number;
  dashMm: number;
  dashGapMm: number;
  motifId: string;
  motifSizeMm: number;
  relief: 'emboss' | 'deboss';
  reliefMm: number;
}

export const DEFAULT_BORDER: BorderConfig = {
  style: 'single',
  insetMm: 3.175,
  widthMm: 0.5,
  gapMm: 1,
  dashMm: 4,
  dashGapMm: 2,
  motifId: 'deco-fan',
  motifSizeMm: 10,
  relief: 'emboss',
  reliefMm: 0.6,
};

export interface BorderGeometry {
  /** Filled rings, dash bands, or run bands at `widthMm`: what gets engraved or raised. */
  bands: Poly;
  /** The lines to score: closed contours when `closedLines`, open polylines otherwise. */
  centerlines: Pt[][];
  closedLines: boolean;
  /** The four placed corner motifs; empty for every style but `corners`. */
  ornaments: Poly;
  /** True when the inset leaves nothing of the badge, so there is no border to draw. */
  tooDeep: boolean;
}

/** The widest line a laser scores as a single pass; wider borders are engraved. */
const MAX_SCORE_WIDTH_MM = 0.5;
/** How far a corner run stops short of its motif, so the line never touches the art. */
const MOTIF_CLEARANCE_MM = 1;

export function scoresBorder(border: BorderConfig): boolean {
  return (border.style === 'single' || border.style === 'dashed' || border.style === 'corners') && border.widthMm <= MAX_SCORE_WIDTH_MM;
}

/** The ring `widthMm` wide whose middle is the outline pulled in by `insetMm`. */
function ring(outline: Poly, insetMm: number, widthMm: number, tolMm: number): Poly {
  return difference(offset(outline, -(insetMm - widthMm / 2), tolMm), offset(outline, -(insetMm + widthMm / 2), tolMm));
}

/**
 * Splits a closed loop into dashes. The loop is cut into n = max(1, round(L / (dash + gap)))
 * equal periods, each a dash followed by a gap, so dash and gap stretch together and the dashes
 * close the loop evenly. The first dash starts at the first point; a dash bends round corners.
 */
export function dashPath(path: Pt[], dashMm: number, gapMm: number): Pt[][] {
  const length = pathLength(path, true);
  if (path.length < 2 || dashMm <= 0 || !(length > 0)) return [];
  const loop = [...path, path[0]];
  const cumulative = [0];
  for (let i = 1; i < loop.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(loop[i].x - loop[i - 1].x, loop[i].y - loop[i - 1].y));
  }
  const pitch = length / Math.max(1, Math.round(length / (dashMm + Math.max(0, gapMm))));
  const dashLength = (pitch * dashMm) / (dashMm + Math.max(0, gapMm));
  const count = Math.round(length / pitch);

  const at = (s: number, i: number): Pt => {
    const span = cumulative[i + 1] - cumulative[i];
    const t = span > 0 ? (s - cumulative[i]) / span : 0;
    return { x: loop[i].x + (loop[i + 1].x - loop[i].x) * t, y: loop[i].y + (loop[i + 1].y - loop[i].y) * t };
  };

  const dashes: Pt[][] = [];
  let segment = 0;
  for (let k = 0; k < count; k++) {
    const start = k * pitch;
    const end = Math.min(length, start + dashLength);
    while (segment < loop.length - 2 && cumulative[segment + 1] <= start) segment++;
    const dash: Pt[] = [at(start, segment)];
    let i = segment;
    while (i < loop.length - 2 && cumulative[i + 1] < end) {
      i++;
      dash.push(loop[i]);
    }
    dash.push(at(end, i));
    dashes.push(dash);
  }
  return dashes;
}

/** Whether `p` is strictly inside `r`. */
const inside = (p: Pt, r: Rect) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

/**
 * Cuts a closed loop at the rectangles and keeps the parts outside them, as open polylines. It is
 * a geometric walk rather than Clipper's open-path difference: it splits each segment where it
 * crosses a rectangle edge, drops the pieces inside, and joins the last run to the first when the
 * loop's start point lies in a kept part, so the result has one polyline per gap-free run.
 */
function cutLoop(loop: Pt[], rects: Rect[]): Pt[][] {
  const pieces: { from: Pt; to: Pt; keep: boolean }[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ts = [0, 1];
    for (const r of rects) {
      if (dx !== 0) {
        for (const x of [r.x, r.x + r.w]) {
          const t = (x - a.x) / dx;
          const y = a.y + dy * t;
          if (t > 0 && t < 1 && y >= r.y && y <= r.y + r.h) ts.push(t);
        }
      }
      if (dy !== 0) {
        for (const y of [r.y, r.y + r.h]) {
          const t = (y - a.y) / dy;
          const x = a.x + dx * t;
          if (t > 0 && t < 1 && x >= r.x && x <= r.x + r.w) ts.push(t);
        }
      }
    }
    ts.sort((p, q) => p - q);
    for (let k = 0; k + 1 < ts.length; k++) {
      if (ts[k + 1] - ts[k] < 1e-9) continue;
      const point = (t: number): Pt => (t === 0 ? a : t === 1 ? b : { x: a.x + dx * t, y: a.y + dy * t });
      const from = point(ts[k]);
      const to = point(ts[k + 1]);
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      pieces.push({ from, to, keep: !rects.some((r) => inside(mid, r)) });
    }
  }

  const runs: Pt[][] = [];
  let run: Pt[] | null = null;
  for (const piece of pieces) {
    if (!piece.keep) {
      run = null;
    } else if (run) {
      run.push(piece.to);
    } else {
      run = [piece.from, piece.to];
      runs.push(run);
    }
  }
  const wraps = pieces.length > 0 && pieces[0].keep && pieces[pieces.length - 1].keep;
  if (wraps && runs.length > 1) {
    const first = runs.shift()!;
    runs[runs.length - 1].push(...first.slice(1));
  }
  return runs.filter((r) => r.length >= 2);
}

function placeMotifs(center: Poly, border: BorderConfig, tolMm: number): { ornaments: Poly; squares: Rect[] } {
  const box = bounds(center);
  if (!box) return { ornaments: [], squares: [] };
  const motif = CORNER_MOTIFS.find((m) => m.id === border.motifId) ?? CORNER_MOTIFS[0];
  const size = border.motifSizeMm;
  const art = motifPoly(motif.svg, size, tolMm);
  const placed: Poly[] = [];
  const squares: Rect[] = [];
  for (const right of [false, true]) {
    for (const bottom of [false, true]) {
      // The motif is drawn for the top-left corner; the others are its mirror images.
      const x = (u: number) => (right ? box.x + box.w - u : box.x + u);
      const y = (v: number) => (bottom ? box.y + box.h - v : box.y + v);
      placed.push(art.map((contour) => contour.map((p) => ({ x: x(p.x), y: y(p.y) }))));
      const reach = size + MOTIF_CLEARANCE_MM;
      squares.push({
        x: right ? box.x + box.w - reach : box.x - MOTIF_CLEARANCE_MM,
        y: bottom ? box.y + box.h - reach : box.y - MOTIF_CLEARANCE_MM,
        w: reach + MOTIF_CLEARANCE_MM,
        h: reach + MOTIF_CLEARANCE_MM,
      });
    }
  }
  // Mirroring flips a contour's winding, and the union puts every outer contour back to positive.
  return { ornaments: union(placed), squares };
}

function nothing(border: BorderConfig, tooDeep: boolean): BorderGeometry {
  return { bands: [], centerlines: [], closedLines: border.style === 'single' || border.style === 'double' || border.style === 'none', ornaments: [], tooDeep };
}

export function buildBorder(outline: Poly, border: BorderConfig, tolMm: number): BorderGeometry {
  if (border.style === 'none') return nothing(border, false);
  const { insetMm, widthMm } = border;
  const center = offset(outline, -insetMm, tolMm);
  if (center.length === 0) return nothing(border, true);

  switch (border.style) {
    case 'single':
      return { bands: ring(outline, insetMm, widthMm, tolMm), centerlines: center, closedLines: true, ornaments: [], tooDeep: false };
    case 'double': {
      const innerInset = insetMm + widthMm + border.gapMm;
      const inner = offset(outline, -innerInset, tolMm);
      // A second line that does not fit leaves half a border, so report it instead.
      if (inner.length === 0) return nothing(border, true);
      return {
        bands: union([ring(outline, insetMm, widthMm, tolMm), ring(outline, innerInset, widthMm, tolMm)]),
        centerlines: [...center, ...inner],
        closedLines: true,
        ornaments: [],
        tooDeep: false,
      };
    }
    case 'dashed': {
      const dashes = center.flatMap((contour) => dashPath(contour, border.dashMm, border.dashGapMm));
      return {
        bands: union(dashes.map((dash) => offsetOpen(dash, widthMm / 2, tolMm))),
        centerlines: dashes,
        closedLines: false,
        ornaments: [],
        tooDeep: false,
      };
    }
    case 'corners': {
      const { ornaments, squares } = placeMotifs(center, border, tolMm);
      const runs = center.flatMap((contour) => cutLoop(contour, squares));
      return {
        bands: union(runs.map((run) => offsetOpen(run, widthMm / 2, tolMm))),
        centerlines: runs,
        closedLines: false,
        ornaments,
        tooDeep: false,
      };
    }
  }
}
