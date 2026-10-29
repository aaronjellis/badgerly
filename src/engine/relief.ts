/**
 * The 3D badge: a plate whose top edge is chamfered or filleted, with text, graphics, and the
 * border raised (emboss) or sunk (deboss) on its flat top, and an optional multi-color split into
 * a recessed plate and drop-in parts. Every solid is built from 2D polygons with the caps, walls,
 * and lofts of `mesh.ts`, so pieces that meet share their exact ring points and the result is
 * watertight without any 3D boolean.
 *
 * Heights: z = 0 is the bed and the flat top is at `plateMm`. Every poly that is capped comes
 * straight out of Clipper (on its 1/1000 mm grid), which keeps a poly's points exactly when it
 * passes through another boolean that does not cut it. The top is a set of disjoint cells: the
 * plate top and one cell per feature height. Cells never touch each other or the flat top's
 * edge (see `separate`), so the plate top's holes and islands are exactly the cells' contours and
 * every wall between them shares its points with both caps.
 */
import { area, bounds, contains, difference, intersect, offset, union } from './geom';
import type { Poly, Pt } from './geom';
import { capMesh, mergeMeshes, wallMesh } from './mesh';
import type { Mesh } from './mesh';
import type { BadgeProject, ReliefConfig } from './model';
import { plateBody } from './plate';
import type { ResolvedBadge, Warning } from './resolve';

export interface ReliefResult {
  plate: Mesh;
  /** The drop-in parts of a split badge, standing on the bed; null without a split. */
  parts: Mesh | null;
  /** The sizes used where the project's did not fit, else null. */
  clamped: { edgeMm: number | null; debossMm: number | null; recessMm: number | null };
  warnings: Warning[];
}

/** The least plate left under an edge or a deboss. */
const MIN_FLOOR_MM = 0.4;
/** The least flat top left across the badge's short side, per side. */
const EDGE_MARGIN_MM = 0.5;
/**
 * The plate top left between cells of different heights, and between a cell and the flat top's
 * edge: wide enough that Clipper's rounding never lets them touch, far below print resolution.
 */
const GAP_MM = 0.01;
/**
 * Half the narrowest feature that reliably prints (0.5 mm), less 5 µm so a feature exactly
 * 0.5 mm wide, such as the default border, does not vanish when pulled in by it.
 */
const THIN_HALF_MM = 0.245;
/**
 * The share of a feature an opening may remove before it counts as thin. Opening also rounds
 * every sharp corner: on the default Cinzel 700 text at 7.62 mm caps that alone removes 5%;
 * at 5 mm caps, where hairlines and serifs are genuinely under 0.5 mm, it removes 14%.
 */
const THIN_LOSS = 0.1;

const maxDebossMm = (relief: ReliefConfig) => Math.max(0, relief.plateMm - MIN_FLOOR_MM);

/**
 * Limits the edge to what the badge can take: at most half its short side less 0.5 mm, and at
 * most the plate less 0.4 mm. The split recess is held to the plate less 0.4 mm as well.
 */
export function clampRelief(relief: ReliefConfig, outline: Poly): ReliefConfig {
  const b = bounds(outline);
  let maxEdge = maxDebossMm(relief);
  if (b) maxEdge = Math.min(maxEdge, Math.min(b.w, b.h) / 2 - EDGE_MARGIN_MM);
  return {
    ...relief,
    edgeMm: Math.max(0, Math.min(relief.edgeMm, maxEdge)),
    recessMm: Math.max(0, Math.min(relief.recessMm, maxDebossMm(relief))),
  };
}

/** A raised or sunk region; `elementId` is unset for the border. */
type Feature = { poly: Poly; mm: number; elementId?: string };

/**
 * Every raised and sunk feature: each element by its role, and the border (bands and ornaments)
 * by its own relief, clipped to `flat`, with each deboss held to the plate less 0.4 mm. Raster
 * graphics have no outline and are left out. `flat` defaults to the resolved flat top;
 * `buildRelief` passes the one its edge actually leaves, and the border poly it already has.
 */
export function reliefPolys(
  project: BadgeProject,
  resolved: ResolvedBadge,
  flat: Poly = resolved.flat,
  border: Poly = borderPoly(resolved)
): { emboss: Feature[]; deboss: Feature[] } {
  const maxDeboss = maxDebossMm(project.relief);
  const emboss: Feature[] = [];
  const deboss: Feature[] = [];
  const add = (poly: Poly, relief: 'emboss' | 'deboss', mm: number, elementId?: string) => {
    if (poly.length === 0) return;
    const clipped = intersect(poly, flat);
    if (clipped.length === 0) return;
    const id = elementId === undefined ? {} : { elementId };
    if (relief === 'emboss' && mm > 0) emboss.push({ poly: clipped, mm, ...id });
    if (relief === 'deboss' && Math.min(mm, maxDeboss) > 0) deboss.push({ poly: clipped, mm: Math.min(mm, maxDeboss), ...id });
  };
  const roles = new Map(project.elements.map((el) => [el.id, el.role]));
  for (const e of resolved.elements) {
    const role = roles.get(e.id);
    if (role && !e.raster) add(e.poly, role.relief, role.reliefMm, e.id);
  }
  add(border, project.border.relief, project.border.reliefMm);
  return { emboss, deboss };
}

const borderPoly = (resolved: ResolvedBadge): Poly => union([resolved.border.bands, resolved.border.ornaments]);

/**
 * Whether part of `poly` is narrower than 0.5 mm: opening it (pulling in by THIN_HALF_MM, then
 * pushing back out) loses more than THIN_LOSS of its area, or all of it.
 */
function isThin(poly: Poly, tolMm: number): boolean {
  const opened = offset(offset(poly, -THIN_HALF_MM, tolMm), THIN_HALF_MM, tolMm);
  const a = area(poly);
  return opened.length === 0 || a - area(opened) > THIN_LOSS * a;
}

/** A cell of the top: a region and the height of its face. */
type Cell = { poly: Poly; z: number };

/** One poly per distinct height, in the order the heights are listed. */
function groupByHeight(features: Feature[], z: (mm: number) => number): Cell[] {
  const byMm = new Map<number, Poly[]>();
  for (const f of features) byMm.set(f.mm, [...(byMm.get(f.mm) ?? []), f.poly]);
  return [...byMm].map(([mm, polys]) => ({ poly: union(polys), z: z(mm) }));
}

/** The boxes around each contour of a poly, grown by `d`: a cheap cover of everything within `d` of it. */
function boxCover(poly: Poly, d: number): Poly {
  return union(poly.map((contour) => {
    const b = bounds([contour])!;
    const [x0, y0, x1, y1] = [b.x - d, b.y - d, b.x + b.w + d, b.y + b.h + d];
    return [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]];
  }));
}

/** A square `2 · d` across centered on `p`. */
const squareAt = (p: Pt, d: number): Pt[] =>
  [{ x: p.x - d, y: p.y - d }, { x: p.x + d, y: p.y - d }, { x: p.x + d, y: p.y + d }, { x: p.x - d, y: p.y + d }];

/**
 * Parts contours that touch at a point (Clipper returns, say, the rays of a corner motif meeting
 * at their tips that way): each would raise a wall on the same vertical edge, which no closed
 * surface allows. Cuts a GAP_MM square out at every point that appears twice.
 */
function depinch(poly: Poly): Poly {
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Set<string>();
    const pinches: Pt[][] = [];
    for (const contour of poly) for (const p of contour) {
      const key = `${p.x},${p.y}`;
      if (seen.has(key)) pinches.push(squareAt(p, GAP_MM));
      seen.add(key);
    }
    if (pinches.length === 0) break;
    poly = difference(poly, pinches);
  }
  return poly;
}

/**
 * Makes the cells disjoint: earlier cells win, and each later cell loses everything within
 * GAP_MM of the winners, so no two cells touch and their contours never need each other's
 * points, and parts any contours of a cell that touch at a point. With `bound`, every cell is
 * also clipped to it.
 */
function separate(cells: Cell[], bound: Poly | null, tolMm: number): Cell[] {
  const out: Cell[] = [];
  let taken: Poly = [];
  for (const cell of cells) {
    let poly = bound ? intersect(cell.poly, bound) : cell.poly;
    // Growing the winners is costly, so grow only the part of them near the cell: `zone` holds
    // every point of the cell within 2 · GAP_MM of a winner, and `near` every point of a winner
    // within that of `zone`, so taking `near` grown from the cell is the same as taking `taken` grown.
    const zone = taken.length > 0 ? intersect(poly, boxCover(taken, 2 * GAP_MM)) : [];
    if (zone.length > 0) {
      const near = intersect(taken, boxCover(zone, 2 * GAP_MM));
      poly = difference(poly, offset(near, GAP_MM, tolMm));
    }
    poly = depinch(poly);
    if (poly.length === 0) continue;
    out.push({ poly, z: cell.z });
    taken = union([taken, poly]);
  }
  return out;
}

const reversed = (poly: Poly): Poly => poly.map((contour) => [...contour].reverse());

/** A solid standing on the bed: `poly` from z = 0 to `top`. */
function prism(poly: Poly, top: number): Mesh[] {
  return [capMesh(poly, 0, false), wallMesh(poly, 0, top), capMesh(poly, top, true)];
}

/**
 * The flat top at `plateMm` with its cells. A raised cell gets walls facing out from `plateMm`
 * up to its face; a sunk cell gets walls facing into it (its contours reversed, as holes) from
 * its floor up to `plateMm`. The plate top is `flat` minus the cells; because the cells sit
 * strictly inside `flat` and apart from each other, its holes and islands are the cells' own
 * contours, so the walls' rings are exactly the plate top's.
 */
function topMeshes(flat: Poly, cells: Cell[], plateMm: number): Mesh[] {
  const meshes = [capMesh(difference(flat, union(cells.map((c) => c.poly))), plateMm, true)];
  for (const { poly, z } of cells) {
    meshes.push(z > plateMm ? wallMesh(poly, plateMm, z) : wallMesh(reversed(poly), z, plateMm));
    meshes.push(capMesh(poly, z, true));
  }
  return meshes;
}

/**
 * The 3D badge. Raised cells win over lower raised cells and sunk cells over raised ones, deeper
 * over shallower; the loser gives way by GAP_MM. With `split`, the raised features leave the
 * plate: it gets a recess (the raised features grown by `clearanceMm`, `recessMm` deep) and
 * `parts` holds each raised feature as a prism from the bed to `recessMm` plus its height.
 */
export function buildRelief(project: BadgeProject, resolved: ResolvedBadge, tolMm: number): ReliefResult {
  // Through Clipper, so the bottom cap and the wall share points with no collinear runs.
  const outline = union([resolved.outline]);
  const relief = clampRelief(project.relief, outline);
  const { plateMm } = relief;
  const warnings: Warning[] = [];

  const body = plateBody(outline, relief, tolMm);
  const flat = body.flat;
  const border = borderPoly(resolved);
  const { emboss, deboss } = reliefPolys(project, resolved, flat, border);

  if (border.length > 0 && !contains(flat, border)) {
    warnings.push({ code: 'outsideFlat', message: "The border runs onto the badge's edge. Move it inward." });
  }
  for (const f of [...emboss, ...deboss]) {
    if (!isThin(f.poly, tolMm)) continue;
    warnings.push(f.elementId === undefined
      ? { code: 'thin', message: 'The border is thinner than 0.5 mm and may not print.' }
      : { code: 'thin', elementId: f.elementId, message: 'Part of this element is thinner than 0.5 mm and may not print.' });
  }

  const raised = groupByHeight(emboss, (mm) => plateMm + mm).sort((a, b) => b.z - a.z);
  let sunk = deboss;
  let parts: Mesh | null = null;
  if (relief.split && raised.length > 0) {
    const recess = intersect(offset(union(emboss.map((e) => e.poly)), relief.clearanceMm, tolMm), flat);
    sunk = [...deboss, { poly: recess, mm: relief.recessMm }].filter((f) => f.mm > 0);
    const pieces = separate(raised, null, tolMm);
    parts = mergeMeshes(pieces.flatMap((c) => prism(c.poly, relief.recessMm + c.z - plateMm)));
  }
  const sunkCells = groupByHeight(sunk, (mm) => plateMm - mm).sort((a, b) => a.z - b.z);
  const cells = separate([...sunkCells, ...(parts ? [] : raised)], offset(flat, -GAP_MM, tolMm), tolMm);

  const maxDeboss = maxDebossMm(project.relief);
  const byId = new Map(project.elements.map((el) => [el.id, el]));
  const sunkMm = resolved.elements
    .filter((e) => !e.raster && e.poly.length > 0 && byId.get(e.id)?.role.relief === 'deboss')
    .map((e) => byId.get(e.id)!.role.reliefMm);
  if (border.length > 0 && project.border.relief === 'deboss') sunkMm.push(project.border.reliefMm);

  return {
    plate: mergeMeshes([...body.meshes, ...topMeshes(flat, cells, plateMm)]),
    parts,
    clamped: {
      edgeMm: project.relief.edge !== 'none' && relief.edgeMm !== project.relief.edgeMm ? relief.edgeMm : null,
      debossMm: sunkMm.some((mm) => mm > maxDeboss) ? maxDeboss : null,
      recessMm: relief.recessMm !== project.relief.recessMm ? relief.recessMm : null,
    },
    warnings,
  };
}
