/**
 * The laser SVG: a 1:1 file in mm with one named group per laser operation, so xTool Studio or
 * LightBurn reads cut, score, engrave and print as separate operations with no cleanup.
 *
 * `laserPieces` splits a project into pieces, each the geometry for one sheet of material;
 * `exportLaserSvg` writes the pieces out. Single material and print and cut make one piece.
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

/** The pieces of a project. Single material and print and cut are one piece, the badge. */
export function laserPieces(project: BadgeProject, resolved: ResolvedBadge): SvgPiece[] {
  // Task 12 adds the stacked variant, which makes one piece per layer; until then it is the single piece.
  return [badgePiece(project, resolved)];
}

function badgePiece(project: BadgeProject, resolved: ResolvedBadge): SvgPiece {
  const { border } = resolved;
  const byId = new Map(project.elements.map((el) => [el.id, el]));

  const cutouts: Poly[] = [];
  const scoreContours: Pt[][] = [];
  const engraves: Poly[] = [];
  const print: SvgPiece['print'] = [];
  const images: SvgPiece['images'] = [];

  for (const r of resolved.elements) {
    const el = byId.get(r.id);
    if (!el) continue;
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
  const elementLines = scoreClosed ? scoreContours : scoreContours.map((c) => (c.length > 0 ? [...c, c[0]] : c));

  return {
    id: 'badge',
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
function pieceBounds(piece: SvgPiece): Rect | null {
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
  // Pieces share one layout: its top-left lands at the margin, and its size sets the file's.
  const rects = pieces.map(pieceBounds).filter((b): b is Rect => b !== null);
  const layout: Rect = rects.length === 0
    ? { x: 0, y: 0, w: 0, h: 0 }
    : {
        x: Math.min(...rects.map((b) => b.x)),
        y: Math.min(...rects.map((b) => b.y)),
        w: Math.max(...rects.map((b) => b.x + b.w)) - Math.min(...rects.map((b) => b.x)),
        h: Math.max(...rects.map((b) => b.y + b.h)) - Math.min(...rects.map((b) => b.y)),
      };
  const dx = MARGIN_MM - layout.x;
  const dy = MARGIN_MM - layout.y;
  const w = ceilTenth(layout.w + 2 * MARGIN_MM).toFixed(1);
  const h = ceilTenth(layout.h + 2 * MARGIN_MM).toFixed(1);
  const body = pieces.map((piece) => pieceGroup(project, piece, dx, dy)).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
}
