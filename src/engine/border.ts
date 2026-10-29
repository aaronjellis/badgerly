/**
 * The inset border. It is drawn on the stage, engraved on the laser, and embossed on the 3D
 * version, so every style produces the same three things: filled `bands` at the border's width,
 * the `centerlines` the bands follow, and the corner `ornaments`.
 */
import { bounds, contains, difference, offset, offsetOpen, pathLength, union } from './geom';
import type { Poly, Pt, Rect } from './geom';
import { CORNER_MOTIFS, motifPoly } from './cornerArt';
import type { ShapeConfig } from './shapes';

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
  /** The catalog motif, or any id (the editor uses `custom`) while `motifSvg` is set. */
  motifId: string;
  /** An uploaded corner motif, an SVG document drawn for the top-left corner; it replaces the catalog motif. */
  motifSvg?: string;
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

/**
 * Keeps the border line inside the badge: its middle sits at least half a line width from the
 * edge, on a scallop badge at least one scallop deep, since a shallower line breaks into pieces
 * at the notches, and on a 3D badge with an edge of `edgeMm` all of the line on the flat top.
 * Returns `border` itself when nothing needs limiting.
 */
export function clampBorder(border: BorderConfig, shape: ShapeConfig, edgeMm = 0): BorderConfig {
  const floor = borderInsetFloor(border, shape, edgeMm);
  return border.insetMm >= floor ? border : { ...border, insetMm: floor };
}

/** The shallowest inset `clampBorder` allows for this line width, shape, and 3D edge. */
export function borderInsetFloor(border: BorderConfig, shape: ShapeConfig, edgeMm = 0): number {
  return Math.max(border.widthMm / 2, shape.kind === 'scallop' ? shape.scallopMm : 0, edgeMm > 0 ? edgeMm + border.widthMm / 2 : 0);
}

export interface BorderGeometry {
  /** Filled rings, dash bands, or run bands at `widthMm`: what gets engraved or raised. */
  bands: Poly;
  /** The middle line of each band: closed contours when `closedLines`, open polylines (dashes, corner runs) otherwise. */
  centerlines: Pt[][];
  closedLines: boolean;
  /** The four placed corner motifs; empty for every style but `corners`. */
  ornaments: Poly;
  /** True when the inset leaves nothing of the badge, so there is no border to draw. */
  tooDeep: boolean;
}

/** How far a corner run stops short of its motif, so the line never touches the art. */
const MOTIF_CLEARANCE_MM = 1;
/** A corner run shorter than this between two motifs is a speck, not a line, so it is left out. */
const MIN_RUN_MM = 1;

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

/** How far a motif slides toward the badge center between checks. */
const SLIDE_STEP_MM = 0.25;

const square = (x: number, y: number, size: number): Poly => [
  [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }],
];

/**
 * The point where a motif's corner sits for one corner of `box`. It starts at the corner of the
 * bounding box and slides toward the box center along the corner-to-center diagonal, in
 * `SLIDE_STEP_MM` steps, until the motif's square lies inside `room`. Null when it never fits.
 */
function fitCorner(room: Poly, box: Rect, right: boolean, bottom: boolean, size: number): Pt | null {
  const corner = { x: right ? box.x + box.w : box.x, y: bottom ? box.y + box.h : box.y };
  const half = Math.hypot(box.w, box.h) / 2;
  const ux = ((right ? -1 : 1) * box.w) / 2 / half;
  const uy = ((bottom ? -1 : 1) * box.h) / 2 / half;
  for (let k = 0; k * SLIDE_STEP_MM <= half; k++) {
    const p = { x: corner.x + ux * k * SLIDE_STEP_MM, y: corner.y + uy * k * SLIDE_STEP_MM };
    if (contains(room, square(right ? p.x - size : p.x, bottom ? p.y - size : p.y, size))) return p;
  }
  return null;
}

/**
 * The four placed motifs and the squares that clear the line around them, or null when a motif
 * fits nowhere. Each motif starts at its corner of the inset contour's bounding box, and slides
 * inward only as far as it must: on a rectangle that is not at all, on an ellipse or a pill it
 * clears the curve. A motif counts as inside when its square lies within the outline pulled in by
 * half the inset, so the ornament may overhang the inset line by up to half the inset (a rounded
 * rectangle's corner, whose motif sits just outside the rounded line) but never the badge edge.
 */
function placeMotifs(outline: Poly, center: Poly, border: BorderConfig, tolMm: number): { ornaments: Poly; squares: Rect[] } | null {
  const box = bounds(center);
  if (!box) return null;
  const motifSvg = border.motifSvg ?? (CORNER_MOTIFS.find((m) => m.id === border.motifId) ?? CORNER_MOTIFS[0]).svg;
  const size = border.motifSizeMm;
  const art = motifPoly(motifSvg, size, tolMm);
  const room = offset(outline, -border.insetMm / 2, tolMm);
  const placed: Poly[] = [];
  const squares: Rect[] = [];
  for (const right of [false, true]) {
    for (const bottom of [false, true]) {
      const at = fitCorner(room, box, right, bottom, size);
      if (!at) return null;
      // The motif is drawn for the top-left corner; the others are its mirror images.
      placed.push(art.map((contour) => contour.map((p) => ({ x: right ? at.x - p.x : at.x + p.x, y: bottom ? at.y - p.y : at.y + p.y }))));
      squares.push({
        x: (right ? at.x - size : at.x) - MOTIF_CLEARANCE_MM,
        y: (bottom ? at.y - size : at.y) - MOTIF_CLEARANCE_MM,
        w: size + 2 * MOTIF_CLEARANCE_MM,
        h: size + 2 * MOTIF_CLEARANCE_MM,
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
      const placed = placeMotifs(outline, center, border, tolMm);
      // A motif that fits nowhere means the badge is too small for the art: report it, draw nothing.
      if (!placed) return nothing(border, true);
      const { ornaments, squares } = placed;
      const runs = center.flatMap((contour) => cutLoop(contour, squares)).filter((run) => pathLength(run, false) >= MIN_RUN_MM);
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
