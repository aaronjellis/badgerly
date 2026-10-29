/**
 * The laser SVG: a 1:1 file in mm with one named group per laser operation, so xTool Studio or
 * LightBurn reads cut, score, border, engrave and print as separate operations with no cleanup. The
 * border is written as filled bands (the stroke flattened to its outline), in a group of its own
 * apart from the engraved elements, so it can be engraved as a shape: a scored centerline would
 * fill the whole badge when set to engrave.
 *
 * `laserPieces` splits a project into pieces, each the geometry for one sheet of material;
 * `exportLaserSvg` writes the pieces out. Single material and print and cut make one piece; stacked
 * makes the backing plus one piece per top layer.
 */
import { bounds, difference, polyToSvgPath, rotate, translate, union } from './geom';
import type { Poly, Pt, Rect } from './geom';
import { svgTextFromDataUrl } from './artworkImage';
import type { BadgeElement, BadgeProject, GraphicElement, TextElement } from './model';
import type { ResolvedBadge } from './resolve';
import { inlineSvgArtwork } from './svgInline';

export const CUT = '#ff0000';
export const SCORE = '#0000ff';
export const ENGRAVE = '#000000';

/** The margin around the layout, in mm. */
const MARGIN_MM = 1;
/** The gap between pieces laid side by side, in mm; the stage's layout view uses the same. */
export const STACK_GAP_MM = 5;
/** Stroke width for cut and score lines, in mm: a hairline that laser software replaces with its own. */
const STROKE_MM = 0.1;

/** One sheet of material: everything cut, scored, engraved or printed on it, in badge coordinates. */
export interface SvgPiece {
  id: string;
  cut: Poly;
  score: Pt[][];
  /** The border's bands and corner ornaments, filled: engraved apart from the elements. */
  border: Poly;
  /** The engraved elements. */
  engrave: Poly;
  /** Printed elements: text in its fill, a vector graphic in its own colors, drawn in its ink `box`. */
  print: { el: GraphicElement | TextElement; poly: Poly; fill: string; box: Rect }[];
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
    // A lone element can skip the union: resolve has already merged each element into one clean outline (text
    // through `mergeContours`, an SVG through `union(regions)`), so a union would only snap it to the Clipper grid.
    topPieces.push({ id, cut: polys.length === 1 ? polys[0] : union(polys), score: [], border: [], engrave: [], print: [], images: [] });
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
    else if (isPrinted(project, el)) print.push({ el, poly: r.poly, fill: el.role.fill, box: r.ink });
    else engraves.push(r.poly);
  }

  return {
    id,
    cut: cutouts.length > 0 ? difference(resolved.outline, union(cutouts)) : resolved.outline,
    score: [...scoreContours, ...extraScore],
    border: union([border.bands, border.ornaments].filter((p) => p.length > 0)),
    engrave: union(engraves.filter((p) => p.length > 0)),
    print,
    images,
  };
}

/** A number with at most 3 decimals and no trailing zeros. */
const num = (v: number) => String(Number(v.toFixed(3)));

/** `M…Z` closed polylines. */
function linesToSvgPath(lines: Pt[][]): string {
  return lines
    .filter((l) => l.length > 1)
    .map((l) => `M${l.map((p) => `${num(p.x)} ${num(p.y)}`).join('L')}Z`)
    .join('');
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The area a piece's content covers, with every image box turned as it is drawn. */
export function pieceBounds(piece: SvgPiece): Rect | null {
  const polys: Poly[] = [piece.cut, piece.score, piece.border, piece.engrave, ...piece.print.map((p) => p.poly)];
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
  group('score', piece.score.length > 0 ? [stroke(linesToSvgPath(translate(piece.score, dx, dy)), SCORE)] : []);
  group('border', piece.border.length > 0 ? [fill(polyToSvgPath(translate(piece.border, dx, dy)), ENGRAVE)] : []);
  group('engrave', [
    ...(piece.engrave.length > 0 ? [fill(polyToSvgPath(translate(piece.engrave, dx, dy)), ENGRAVE)] : []),
    ...engraved.map(image),
  ]);
  // A printed vector graphic keeps its own colors: its markup goes in, placed in its ink box, rather than its outline in one fill.
  const printItem = ({ el, poly, fill: color, box }: SvgPiece['print'][number]) => {
    const svg = el.kind === 'graphic' ? svgTextFromDataUrl(el.dataUrl) : null;
    const art = svg && inlineSvgArtwork(svg, `${id}-${el.id}-`, { ...box, x: box.x + dx, y: box.y + dy }, el.rotationDeg);
    return art ?? fill(polyToSvgPath(translate(poly, dx, dy)), color);
  };
  group('print', [...piece.print.map(printItem), ...printed.map(image)]);
  return `<g id="${id}">\n${parts.join('\n')}\n</g>`;
}

/**
 * Where the layout puts each piece: left to right with `gapMm` between their bounds, each keeping its own
 * badge coordinates vertically, the first starting at x = 0. `dx[i]` moves piece i; `bounds` is the whole
 * layout, null when nothing is placed. The export adds its margin; the stage's layout view draws it as is.
 */
export function pieceSlots(rects: (Rect | null)[], gapMm = STACK_GAP_MM): { dx: number[]; bounds: Rect | null } {
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

/** The SVG for the project's laser variant: 1:1 in mm, a 1 mm margin, one group per operation on each piece. */
export function exportLaserSvg(project: BadgeProject, resolved: ResolvedBadge): string {
  const pieces = laserPieces(project, resolved);
  // Pieces sit in their slots; they share one top edge, so the layout's top-left lands at the margin.
  const { dx, bounds: layout } = pieceSlots(pieces.map(pieceBounds));
  const dy = MARGIN_MM - (layout?.y ?? 0);
  const w = ceilTenth((layout?.w ?? 0) + 2 * MARGIN_MM).toFixed(1);
  const h = ceilTenth((layout?.h ?? 0) + 2 * MARGIN_MM).toFixed(1);
  const body = pieces.map((piece, i) => pieceGroup(project, piece, dx[i] + MARGIN_MM, dy)).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
}
