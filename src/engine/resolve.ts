/**
 * A badge project resolved into geometry, in mm with y down and the origin at the badge center:
 * the outline, the inset border, the flat top a 3D edge leaves, every element placed, and the
 * warnings the editor shows. The stage draws this and every export reads it.
 */
import { buildBorder } from './border';
import type { BorderGeometry } from './border';
import { svgTextFromDataUrl } from './artworkImage';
import type { FontProvider } from './fontProvider';
import {
  bounds, closeIslands, contains, difference, dropHoles, offset, outerCount, rotate, scale, translate, union,
} from './geom';
import type { Poly, Rect } from './geom';
import type { BadgeProject, GraphicElement, TextElement } from './model';
import { buildShape, clampShape } from './shapes';
import { parseSvgShape } from './svgShape';
import type { SvgShape } from './svgShape';
import { buildTextOutline, capHeightPx, missingChar, TEXT_RENDER_SIZE_PX } from './textOutline';
import type { TextOutline } from './textOutline';

export type WarningCode =
  | 'missingFont' | 'fontLoading' | 'strokeOnlySvg' | 'islands' | 'bridged'
  | 'borderTooDeep' | 'outsideFlat' | 'floatingCounter' | 'noElements' | 'thin';

export interface Warning {
  code: WarningCode;
  elementId?: string;
  /** A short sentence for display. */
  message: string;
}

/**
 * One placed element. `ink` is its unrotated box centered on (x, y): what the stage snaps and
 * selects. `clusters` (text only) are where each cluster starts on its line's baseline, in mm,
 * rotated with the text.
 */
export interface ResolvedElement {
  id: string;
  poly: Poly;
  ink: Rect;
  raster: boolean;
  clusters: { line: number; index: number; x: number; y: number }[];
}

export interface ResolvedBadge {
  outline: Poly;
  /** The outline pulled in by the 3D edge (the outline itself with no edge); computed in every mode. */
  flat: Poly;
  border: BorderGeometry;
  elements: ResolvedElement[];
  warnings: Warning[];
}

/** A box `w` × `h` centered on (`x`, `y`). */
const boxAt = (x: number, y: number, w: number, h: number): Rect => ({ x: x - w / 2, y: y - h / 2, w, h });

/** Moves a polygon whose box is centered on the origin: rotates it about the origin, then moves it to (x, y). */
const place = (poly: Poly, el: { x: number; y: number; rotationDeg: number }): Poly =>
  translate(rotate(poly, el.rotationDeg), el.x, el.y);

/** Text at its cap height: px scaled so 'H' is `capHeightMm` tall, its ink box centered on (x, y), rotated about that center. */
export function placeText(
  outline: TextOutline,
  el: TextElement
): { poly: Poly; ink: Rect; clusters: ResolvedElement['clusters'] } {
  const s = outline.capHeightPx > 0 ? el.capHeightMm / outline.capHeightPx : 0;
  const cx = outline.ink.x + outline.ink.w / 2;
  const cy = outline.ink.y + outline.ink.h / 2;
  const centered = scale(translate(outline.poly, -cx, -cy), s);
  const points = outline.clusters.map((c) => ({ x: (c.xPx - cx) * s, y: ((outline.baselinesPx[c.line] ?? 0) - cy) * s }));
  const placedPoints = place([points], el)[0];
  return {
    poly: place(centered, el),
    ink: boxAt(el.x, el.y, outline.ink.w * s, outline.ink.h * s),
    clusters: outline.clusters.map((c, i) => ({ line: c.line, index: c.index, x: placedPoints[i].x, y: placedPoints[i].y })),
  };
}

/** The scale that fits a viewBox inside `widthMm` × `heightMm` without stretching it. */
const fitScale = (viewBox: Rect, el: GraphicElement) => Math.min(el.widthMm / viewBox.w, el.heightMm / viewBox.h);

/**
 * An uploaded SVG fitted into its `widthMm` × `heightMm` box without stretching. The fitted
 * viewBox is the ink box, centered on (x, y), and the drawing turns about that center.
 */
export function placeGraphic(shape: SvgShape, el: GraphicElement): { poly: Poly; ink: Rect } {
  const { viewBox } = shape;
  const k = fitScale(viewBox, el);
  const centered = scale(translate(shape.poly, -(viewBox.x + viewBox.w / 2), -(viewBox.y + viewBox.h / 2)), k);
  return { poly: place(centered, el), ink: boxAt(el.x, el.y, viewBox.w * k, viewBox.h * k) };
}

/** Parsed SVGs by tolerance and data URL, so re-resolving on every edit does not re-parse. */
const svgCache = new Map<string, SvgShape | null>();
/** Upscaled graphics are parsed at a tolerance that follows their size, so keep the cache from growing without end. */
const SVG_CACHE_LIMIT = 64;

function parseCached(dataUrl: string, tol: number): SvgShape | null {
  const key = `${tol}|${dataUrl}`;
  if (svgCache.has(key)) return svgCache.get(key)!;
  const text = svgTextFromDataUrl(dataUrl);
  const shape = text === null ? null : parseSvgShape(text, tol);
  if (svgCache.size >= SVG_CACHE_LIMIT) svgCache.delete(svgCache.keys().next().value!);
  svgCache.set(key, shape);
  return shape;
}

/** The SVG at a tolerance that keeps chords within `tolMm` on the badge, even when the drawing is scaled up. */
function svgFor(el: GraphicElement, tolMm: number): SvgShape | null {
  const shape = parseCached(el.dataUrl, tolMm);
  if (!shape) return null;
  const ratio = shape.viewBox.w / el.widthMm;
  return ratio < 1 ? parseCached(el.dataUrl, tolMm * ratio) : shape;
}

function resolveText(el: TextElement, fonts: FontProvider, tolMm: number, warn: (w: Warning) => void): ResolvedElement | null {
  const set = fonts.get(el.text);
  if (!set || set.length === 0) {
    warn({ code: 'fontLoading', elementId: el.id, message: `${el.text.family} is still loading.` });
    return null;
  }
  const ch = missingChar(el.text, set);
  if (ch !== null) {
    warn({ code: 'missingFont', elementId: el.id, message: `${el.text.family} has no “${ch}”, so ${el.name} is hidden.` });
    return null;
  }
  // Tolerance in px at the render size that is `tolMm` once scaled to the cap height.
  const capPx = capHeightPx(set[0], TEXT_RENDER_SIZE_PX);
  const tolPx = el.capHeightMm > 0 ? (tolMm * capPx) / el.capHeightMm : tolMm;
  return { id: el.id, raster: false, ...placeText(buildTextOutline(el.text, set, tolPx), el) };
}

function resolveGraphic(el: GraphicElement, tolMm: number, warn: (w: Warning) => void): ResolvedElement {
  const shape = el.vector ? svgFor(el, tolMm) : null;
  // A PNG, or an SVG we cannot read, is drawn as an image in its box with no outline.
  if (!shape) return { id: el.id, poly: [], ink: boxAt(el.x, el.y, el.widthMm, el.heightMm), raster: true, clusters: [] };
  const placed = placeGraphic(shape, el);
  if (shape.strokeOnly) {
    warn({ code: 'strokeOnlySvg', elementId: el.id, message: `${el.name} has only strokes, so there is no shape to cut or raise.` });
    return { id: el.id, poly: [], ink: placed.ink, raster: false, clusters: [] };
  }
  return { id: el.id, ...placed, raster: false, clusters: [] };
}

/** The outline that hugs every element by `hugMm`, bridged into one piece when it can be. */
function hugOutline(project: BadgeProject, elements: ResolvedElement[], tolMm: number, warn: (w: Warning) => void): Poly {
  const shape = clampShape(project.shape);
  const polys = elements.map((e) => e.poly).filter((p) => p.length > 0);
  if (polys.length === 0) {
    warn({ code: 'noElements', message: 'Add text or a graphic for the outline to hug.' });
    return buildShape({ ...shape, kind: 'rect' }, tolMm);
  }
  const grown = dropHoles(offset(union(polys), shape.hugMm, tolMm));
  const closed = closeIslands(grown, Math.max(0.1, shape.hugMm), Math.min(shape.widthMm, shape.heightMm), tolMm);
  if (!closed.joined) {
    warn({ code: 'islands', message: 'The outline is in separate pieces. Move the elements closer together.' });
  } else if (closed.bridgedMm > 0) {
    warn({ code: 'bridged', message: `The outline bridges gaps of up to ${(2 * closed.bridgedMm).toFixed(1)} mm to stay in one piece.` });
  }
  // Closing can enclose a gap between pieces, so drop holes again.
  return dropHoles(closed.poly);
}

export function resolveBadge(project: BadgeProject, fonts: FontProvider, tolMm: number): ResolvedBadge {
  const warnings: Warning[] = [];
  const warn = (w: Warning) => void warnings.push(w);

  const elements: ResolvedElement[] = [];
  for (const el of project.elements) {
    const resolved = el.kind === 'text' ? resolveText(el, fonts, tolMm, warn) : resolveGraphic(el, tolMm, warn);
    if (resolved) elements.push(resolved);
  }

  const outline =
    project.shape.kind === 'hugText' ? hugOutline(project, elements, tolMm, warn) : buildShape(clampShape(project.shape), tolMm);
  const flat = project.relief.edge !== 'none' ? offset(outline, -project.relief.edgeMm, tolMm) : outline;
  const border = buildBorder(outline, project.border, tolMm);
  if (border.tooDeep) {
    warnings.push({ code: 'borderTooDeep', message: 'The border inset is deeper than the badge, so there is no border.' });
  }

  const byId = new Map(project.elements.map((el) => [el.id, el]));
  for (const e of elements) {
    if (e.poly.length === 0) continue;
    const el = byId.get(e.id)!;
    if (project.mode === 'print3d' && !contains(flat, e.poly)) {
      warnings.push({ code: 'outsideFlat', elementId: e.id, message: `${el.name} runs onto the badge's edge. Move it inward.` });
    }
    if (project.mode === 'laser' && el.role.laser === 'cutout' && outerCount(difference(outline, e.poly)) > 1) {
      warnings.push({ code: 'floatingCounter', elementId: e.id, message: `Cutting out ${el.name} leaves loose pieces, such as the middle of an O.` });
    }
  }

  return { outline, flat, border, elements, warnings };
}
