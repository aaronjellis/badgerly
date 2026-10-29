/**
 * The laser SVG: a 1:1 file in mm with one named group per laser operation, so xTool Studio or
 * LightBurn reads cut, score, engrave and print as separate operations with no cleanup.
 *
 * `laserPieces` splits a project into pieces, each the geometry for one sheet of material;
 * `exportLaserSvg` writes the pieces out. Single material and print and cut make one piece; stacked
 * makes the backing plus one piece per top layer.
 */
import { bounds, difference, polyToSvgPath, rotate, translate, union } from './geom';
import type { Poly, Pt, Rect } from './geom';
import { scoresBorder } from './border';
import type { BadgeElement, BadgeProject, GraphicElement, TextElement } from './model';
import type { ResolvedBadge } from './resolve';

export const CUT = '#ff0000';
export const SCORE = '#0000ff';
export const ENGRAVE = '#000000';

/** The margin around the layout, in mm. */
const MARGIN_MM = 1;
/** The gap between pieces laid side by side, in mm. */
const GAP_MM = 5;
/** Stroke width for cut and score lines, in mm: a hairline that laser software replaces with its own. */
const STROKE_MM = 0.1;

/** One sheet of material: everything cut, scored, engraved or printed on it, in badge coordinates. */
export interface SvgPiece {
  id: string;
  cut: Poly;
  score: Pt[][];
  /** Whether every score line is a closed loop; an open line (a dash or a corner run) is not closed. */
  scoreClosed: boolean;
  engrave: Poly;
  print: { el: GraphicElement | TextElement; poly: Poly; fill: string }[];
  /** Raster elements and the boxes they fill; each goes in the print group when `isPrinted`, else in engrave. */
  images: { el: GraphicElement; box: Rect }[];
}

/** Whether the element is printed rather than engraved: only in print and cut, and only an engraved element. */
function isPrinted(project: BadgeProject, el: BadgeElement): boolean {
  return project.laserVariant === 'printcut' && el.role.printColor && el.role.laser === 'engrave';
}

/** The pieces of a project. Single material and print and cut are one piece, the badge; stacked is one per layer. */
export function laserPieces(project: BadgeProject, resolved: ResolvedBadge): SvgPiece[] {
  if (project.laserVariant === 'stacked') return stackedPieces(project, resolved);
  return [badgePiece(project, resolved, 'badge', null, [])];
}

/** `layer-<slug of the name>`: lowercase, runs of other characters become one `-`, ends trimmed. */
function layerSlug(name: string, fallback: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `layer-${slug || fallback}`;
}

/** The backing, with a score line where every top piece lands, then one cut-only piece per top layer that has any. */
function stackedPieces(project: BadgeProject, resolved: ResolvedBadge): SvgPiece[] {
  const byId = new Map(project.elements.map((el) => [el.id, el]));
  const [, ...tops] = project.layers;
  // An element on a layer that no longer exists stays on the backing rather than vanishing.
  const topIds = new Set(tops.map((l) => l.id));
  const layerOf = (id: string) => {
    const layerId = byId.get(id)?.role.layerId;
    return layerId && topIds.has(layerId) ? layerId : null;
  };

  const topPieces: SvgPiece[] = [];
  const used = new Set(['backing']);
  const landings: Pt[][] = [];
  tops.forEach((layer, i) => {
    const polys = resolved.elements.filter((r) => layerOf(r.id) === layer.id && r.poly.length > 0).map((r) => r.poly);
    if (polys.length === 0) return;
    landings.push(...polys.flat());
    const base = layerSlug(layer.name, i + 1);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    // A lone element is already a clean outline; a union would only snap it to the clipper grid.
    topPieces.push({ id, cut: polys.length === 1 ? polys[0] : union(polys), score: [], scoreClosed: true, engrave: [], print: [], images: [] });
  });

  const onBacking = new Set(resolved.elements.filter((r) => layerOf(r.id) === null).map((r) => r.id));
  return [badgePiece(project, resolved, 'backing', onBacking, landings), ...topPieces];
}

/**
 * One piece with the outline, border and the elements in `only` (all of them when null).
 * `extraScore` are closed outlines scored on top of that, such as where a stacked top piece lands.
 */
function badgePiece(project: BadgeProject, resolved: ResolvedBadge, id: string, only: Set<string> | null, extraScore: Pt[][]): SvgPiece {
  const { border } = resolved;
  const byId = new Map(project.elements.map((el) => [el.id, el]));

  const cutouts: Poly[] = [];
  const scoreContours: Pt[][] = [];
  const engraves: Poly[] = [];
  const print: SvgPiece['print'] = [];
  const images: SvgPiece['images'] = [];

  for (const r of resolved.elements) {
    const el = byId.get(r.id);
    if (!el || (only && !only.has(r.id))) continue;
    if (r.raster) {
      // A raster has no outline to cut or score, so it is only ever engraved or printed.
      if (el.kind === 'graphic' && el.role.laser !== 'cutout') images.push({ el, box: r.ink });
      continue;
    }
    if (r.poly.length === 0) continue;
    if (el.role.laser === 'cutout') cutouts.push(r.poly);
    else if (el.role.laser === 'score') scoreContours.push(...r.poly);
    else if (isPrinted(project, el)) print.push({ el, poly: r.poly, fill: el.role.fill });
    else engraves.push(r.poly);
  }

  // The border: scored as centerlines when it is thin enough, else engraved as bands. Ornaments are always engraved.
  const borderScored = scoresBorder(project.border);
  const borderLines = borderScored ? border.centerlines : [];
  if (!borderScored) engraves.push(border.bands);
  engraves.push(border.ornaments);

  const scoreClosed = borderLines.length === 0 || border.closedLines;
  // Lines are written open when any are open, so a closed contour repeats its first point to stay closed.
  const closedLines = [...scoreContours, ...extraScore];
  const elementLines = scoreClosed ? closedLines : closedLines.map((c) => (c.length > 0 ? [...c, c[0]] : c));

  return {
    id,
    cut: cutouts.length > 0 ? difference(resolved.outline, union(cutouts)) : resolved.outline,
    score: [...borderLines, ...elementLines],
    scoreClosed,
    engrave: union(engraves.filter((p) => p.length > 0)),
    print,
    images,
  };
}

/** A number with at most 3 decimals and no trailing zeros. */
const num = (v: number) => String(Number(v.toFixed(3)));

/** `M…` polylines, closed with `Z` when `closed`. */
function linesToSvgPath(lines: Pt[][], closed: boolean): string {
  return lines
    .filter((l) => l.length > 1)
    .map((l) => `M${l.map((p) => `${num(p.x)} ${num(p.y)}`).join('L')}${closed ? 'Z' : ''}`)
    .join('');
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The area a piece's content covers, with every image box turned as it is drawn. */
export function pieceBounds(piece: SvgPiece): Rect | null {
  const polys: Poly[] = [piece.cut, piece.score, piece.engrave, ...piece.print.map((p) => p.poly)];
  for (const { el, box } of piece.images) {
    const corners = [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }];
    polys.push(rotate([corners], el.rotationDeg, box.x + box.w / 2, box.y + box.h / 2));
  }
  return bounds(polys.flat());
}

/** Rounds a size up to 0.1 mm; the nudge keeps float noise like 103.60000000000001 from adding a tenth. */
const ceilTenth = (v: number) => Math.ceil(Math.round(v * 1e6) / 1e5) / 10;

function pieceGroup(project: BadgeProject, piece: SvgPiece, dx: number, dy: number): string {
  const { id } = piece;
  const parts: string[] = [];
  const stroke = (d: string, color: string) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${STROKE_MM}"/>`;
  const fill = (d: string, color: string) => `<path d="${d}" fill="${color}" fill-rule="evenodd"/>`;
  const image = ({ el, box }: SvgPiece['images'][number]) => {
    const x = box.x + dx;
    const y = box.y + dy;
    const turn = el.rotationDeg !== 0 ? ` transform="rotate(${num(el.rotationDeg)} ${num(x + box.w / 2)} ${num(y + box.h / 2)})"` : '';
    return `<image href="${escapeAttr(el.dataUrl)}" x="${num(x)}" y="${num(y)}" width="${num(box.w)}" height="${num(box.h)}" preserveAspectRatio="xMidYMid meet"${turn}/>`;
  };
  const group = (name: string, items: string[]) => {
    if (items.length > 0) parts.push(`<g id="${id}-${name}">\n${items.join('\n')}\n</g>`);
  };

  const printed = piece.images.filter(({ el }) => isPrinted(project, el));
  const engraved = piece.images.filter(({ el }) => !isPrinted(project, el));

  group('cut', piece.cut.length > 0 ? [stroke(polyToSvgPath(translate(piece.cut, dx, dy)), CUT)] : []);
  group('score', piece.score.length > 0 ? [stroke(linesToSvgPath(translate(piece.score, dx, dy), piece.scoreClosed), SCORE)] : []);
  group('engrave', [
    ...(piece.engrave.length > 0 ? [fill(polyToSvgPath(translate(piece.engrave, dx, dy)), ENGRAVE)] : []),
    ...engraved.map(image),
  ]);
  group('print', [
    ...piece.print.map((p) => fill(polyToSvgPath(translate(p.poly, dx, dy)), p.fill)),
    ...printed.map(image),
  ]);
  return `<g id="${id}">\n${parts.join('\n')}\n</g>`;
}

/** The SVG for the project's laser variant: 1:1 in mm, a 1 mm margin, one group per operation on each piece. */
export function exportLaserSvg(project: BadgeProject, resolved: ResolvedBadge): string {
  const pieces = laserPieces(project, resolved);
  // Pieces sit left to right with a gap between their bounds. Each keeps its own badge coordinates and is
  // shifted into its slot; they share one top edge, so the layout's top-left lands at the margin.
  const rects = pieces.map(pieceBounds);
  const top = Math.min(...rects.filter((b): b is Rect => b !== null).map((b) => b.y));
  const dy = MARGIN_MM - top;
  let cursor = MARGIN_MM;
  const slots = rects.map((b) => {
    if (!b) return 0;
    const dx = cursor - b.x;
    cursor += b.w + GAP_MM;
    return dx;
  });
  const bottom = Math.max(...rects.filter((b): b is Rect => b !== null).map((b) => b.y + b.h));
  const empty = rects.every((b) => b === null);
  const width = empty ? 0 : cursor - GAP_MM - MARGIN_MM;
  const height = empty ? 0 : bottom - top;
  const w = ceilTenth(width + 2 * MARGIN_MM).toFixed(1);
  const h = ceilTenth(height + 2 * MARGIN_MM).toFixed(1);
  const body = pieces.map((piece, i) => pieceGroup(project, piece, slots[i], dy)).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
}
