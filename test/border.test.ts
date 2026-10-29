import { describe, expect, it } from 'vitest';
import { area, bounds, contains, offset, outerCount, pathLength } from '../src/engine/geom';
import type { Poly, Pt } from '../src/engine/geom';
import { buildShape, DEFAULT_SHAPE } from '../src/engine/shapes';
import { buildBorder, clampBorder, dashPath, DEFAULT_BORDER, scoresBorder } from '../src/engine/border';
import { CORNER_MOTIFS, motifPoly } from '../src/engine/cornerArt';

const badge = buildShape({ ...DEFAULT_SHAPE, kind: 'rounded' }, 0.01);

describe('buildBorder', () => {
  it('single border is one ring with the asked width', () => {
    const g = buildBorder(badge, DEFAULT_BORDER, 0.01);
    expect(g.bands).toHaveLength(2);
    expect(g.centerlines).toHaveLength(1);
    expect(g.closedLines).toBe(true);
    expect(area(g.bands)).toBeCloseTo(0.5 * pathLength(g.centerlines[0], true), 0);
  });

  it('double border has two rings', () => {
    expect(buildBorder(badge, { ...DEFAULT_BORDER, style: 'double' }, 0.01).bands).toHaveLength(4);
  });

  it('dashes fit the perimeter evenly', () => {
    const g = buildBorder(badge, { ...DEFAULT_BORDER, style: 'dashed' }, 0.01);
    const L = pathLength(offset(badge, -3.175, 0.01)[0], true);
    expect(g.centerlines).toHaveLength(Math.round(L / 6));
    expect(g.closedLines).toBe(false);
  });

  it('corner art puts four ornaments in the corners and breaks the line', () => {
    const g = buildBorder(badge, { ...DEFAULT_BORDER, style: 'corners' }, 0.01);
    expect(outerCount(g.ornaments)).toBeGreaterThanOrEqual(4);
    expect(g.centerlines).toHaveLength(4);
  });

  it('an inset deeper than the badge is reported, not thrown', () => {
    const g = buildBorder(badge, { ...DEFAULT_BORDER, insetMm: 30 }, 0.01);
    expect(g.tooDeep).toBe(true);
    expect(g.bands).toHaveLength(0);
  });

  it('style none draws nothing', () => {
    const g = buildBorder(badge, { ...DEFAULT_BORDER, style: 'none' }, 0.01);
    expect(g.bands).toHaveLength(0);
    expect(g.centerlines).toHaveLength(0);
    expect(g.ornaments).toHaveLength(0);
    expect(g.tooDeep).toBe(false);
  });

  it('keeps the double border second ring one width plus gap inside the first', () => {
    const g = buildBorder(badge, { ...DEFAULT_BORDER, style: 'double' }, 0.01);
    expect(g.centerlines).toHaveLength(2);
    const [outer, inner] = g.centerlines;
    expect(pathLength(inner, true)).toBeLessThan(pathLength(outer, true));
    // Both rings sit inside the badge, and the pair is wider than one ring alone.
    expect(area(g.bands)).toBeGreaterThan(0.9 * 0.5 * (pathLength(outer, true) + pathLength(inner, true)));
  });

  it('reports a double border whose second ring does not fit', () => {
    const g = buildBorder(badge, { ...DEFAULT_BORDER, style: 'double', insetMm: 24 }, 0.01);
    expect(g.tooDeep).toBe(true);
    expect(g.bands).toHaveLength(0);
  });

  it('leaves corner runs clear of the motif squares', () => {
    const g = buildBorder(badge, { ...DEFAULT_BORDER, style: 'corners' }, 0.01);
    const box = bounds(offset(badge, -3.175, 0.01))!;
    const reach = DEFAULT_BORDER.motifSizeMm + 1;
    for (const run of g.centerlines) {
      for (const p of run) {
        const nearX = Math.min(p.x - box.x, box.x + box.w - p.x) < reach - 1e-6;
        const nearY = Math.min(p.y - box.y, box.y + box.h - p.y) < reach - 1e-6;
        expect(nearX && nearY).toBe(false);
      }
    }
  });

  it('drops a corner run shorter than 1 mm', () => {
    // 28.85 mm wide: the top and bottom runs between the motifs are 28.85 − 2 · 3.175 − 2 · 11 = 0.5 mm.
    const narrow = buildShape({ ...DEFAULT_SHAPE, kind: 'rect', widthMm: 28.85, heightMm: 60 }, 0.01);
    const g = buildBorder(narrow, { ...DEFAULT_BORDER, style: 'corners' }, 0.01);
    expect(g.tooDeep).toBe(false);
    expect(g.centerlines).toHaveLength(2);
    for (const run of g.centerlines) expect(pathLength(run, false)).toBeGreaterThan(30);
    const wider = buildBorder(buildShape({ ...DEFAULT_SHAPE, kind: 'rect', widthMm: 30.5, heightMm: 60 }, 0.01), { ...DEFAULT_BORDER, style: 'corners' }, 0.01);
    expect(wider.centerlines).toHaveLength(4);
  });

  it('places a motif in every corner of the inset contour', () => {
    const g = buildBorder(badge, { ...DEFAULT_BORDER, style: 'corners' }, 0.01);
    const box = bounds(offset(badge, -3.175, 0.01))!;
    const b = bounds(g.ornaments)!;
    expect(b.x).toBeCloseTo(box.x, 1);
    expect(b.y).toBeCloseTo(box.y, 1);
    expect(b.x + b.w).toBeCloseTo(box.x + box.w, 1);
    expect(b.y + b.h).toBeCloseTo(box.y + box.h, 1);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const quadrant = g.ornaments.filter((c) => c.every((p) => Math.sign(p.x - cx) === sx && Math.sign(p.y - cy) === sy));
      expect(outerCount(quadrant)).toBeGreaterThanOrEqual(1);
    }
  });

  it.each(['ellipse', 'pill'] as const)('slides corner art into a %s so it stays inside the badge', (kind) => {
    const outline = buildShape({ ...DEFAULT_SHAPE, kind }, 0.01);
    const g = buildBorder(outline, { ...DEFAULT_BORDER, style: 'corners' }, 0.01);
    expect(g.tooDeep).toBe(false);
    expect(outerCount(g.ornaments)).toBeGreaterThanOrEqual(4);
    expect(contains(outline, g.ornaments)).toBe(true);
    expect(g.centerlines).toHaveLength(4);
    expect(g.closedLines).toBe(false);
  });

  it('moves a motif inward on a curved badge, and not at all on a rectangle', () => {
    const box = (shape: Poly) => bounds(offset(shape, -3.175, 0.01))!;
    const ellipse = buildShape({ ...DEFAULT_SHAPE, kind: 'ellipse' }, 0.01);
    const ornamentBox = bounds(buildBorder(ellipse, { ...DEFAULT_BORDER, style: 'corners' }, 0.01).ornaments)!;
    expect(ornamentBox.w).toBeLessThan(box(ellipse).w - 5);
    const rect = buildShape({ ...DEFAULT_SHAPE, kind: 'rect' }, 0.01);
    const rectBox = bounds(buildBorder(rect, { ...DEFAULT_BORDER, style: 'corners' }, 0.01).ornaments)!;
    expect(rectBox.w).toBeCloseTo(box(rect).w, 1);
  });

  it('reports corner art that fits nowhere', () => {
    const g = buildBorder(badge, { ...DEFAULT_BORDER, style: 'corners', motifSizeMm: 60 }, 0.01);
    expect(g.tooDeep).toBe(true);
    expect(g.bands).toHaveLength(0);
    expect(g.centerlines).toHaveLength(0);
    expect(g.ornaments).toHaveLength(0);
  });
});

describe('custom corner motif', () => {
  // A 30 × 30 unit square in the 100-unit motif box: at 10 mm it is a 3 × 3 mm square per corner.
  const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0H30V30H0Z"/></svg>';

  it('draws the uploaded SVG in place of the catalog motif', () => {
    const corners = { ...DEFAULT_BORDER, style: 'corners' as const };
    const custom = buildBorder(badge, { ...corners, motifSvg: square }, 0.01);
    expect(outerCount(custom.ornaments)).toBe(4);
    expect(area(custom.ornaments)).toBeCloseTo(4 * 9, 1);
    expect(area(buildBorder(badge, corners, 0.01).ornaments)).not.toBeCloseTo(4 * 9, 0);
  });

  it('ignores the chip selection while a custom motif is set', () => {
    const a = buildBorder(badge, { ...DEFAULT_BORDER, style: 'corners', motifId: 'custom', motifSvg: square }, 0.01);
    const b = buildBorder(badge, { ...DEFAULT_BORDER, style: 'corners', motifId: 'deco-fan', motifSvg: square }, 0.01);
    expect(area(a.ornaments)).toBeCloseTo(area(b.ornaments), 6);
  });
});

describe('clampBorder', () => {
  const rounded = DEFAULT_SHAPE;
  const scallop = { ...DEFAULT_SHAPE, kind: 'scallop' as const, scallopMm: 5 };

  it('keeps the line from crossing the badge edge', () => {
    expect(clampBorder({ ...DEFAULT_BORDER, insetMm: 0.1, widthMm: 2 }, rounded).insetMm).toBe(1);
  });

  it('keeps a scallop badge inset at least one scallop deep', () => {
    expect(clampBorder({ ...DEFAULT_BORDER, insetMm: 3 }, scallop).insetMm).toBe(5);
  });

  it('does not apply the scallop floor to other shapes', () => {
    expect(clampBorder({ ...DEFAULT_BORDER, insetMm: 3 }, { ...scallop, kind: 'rounded' }).insetMm).toBe(3);
  });

  it('returns the border it was given when nothing is limited', () => {
    expect(clampBorder(DEFAULT_BORDER, rounded)).toBe(DEFAULT_BORDER);
  });
});

describe('dashPath', () => {
  const square: Pt[] = [{ x: 0, y: 0 }, { x: 31, y: 0 }, { x: 31, y: 29 }, { x: 0, y: 29 }];

  it('fits n = round(L / (dash + gap)) dashes around a loop', () => {
    expect(dashPath(square, 4, 2)).toHaveLength(20);
  });

  it('stretches the pitch so the dashes close the loop evenly', () => {
    // 120 mm around, 20 dashes: pitch 6 mm, dash 4 mm, gap 2 mm.
    const dashes = dashPath(square, 4, 2);
    for (const d of dashes) expect(pathLength(d, false)).toBeCloseTo(4, 6);
    expect(dashes[1][0].x).toBeCloseTo(6, 6);
  });

  it('scales dash and gap together when the loop is not a whole number of pitches', () => {
    // 120 mm, pitch 6.5 would give 18.46, so n = 18, pitch 6.667, dash 4.444.
    const dashes = dashPath(square, 4.5, 2);
    expect(dashes).toHaveLength(18);
    for (const d of dashes) expect(pathLength(d, false)).toBeCloseTo((120 / 18) * (4.5 / 6.5), 6);
  });

  it('bends a dash around a corner', () => {
    const dashes = dashPath(square, 4, 2);
    // The dash that starts at 30 mm turns the corner at (31, 0): three points, ending 3 mm down.
    const turn = dashes.find((d) => d.length === 3 && d[1].x === 31 && d[1].y === 0);
    expect(turn).toBeDefined();
    expect(turn![0]).toEqual({ x: 30, y: 0 });
    expect(turn![2].x).toBeCloseTo(31, 6);
    expect(turn![2].y).toBeCloseTo(3, 6);
  });

  it('returns one dash when the loop is shorter than a pitch', () => {
    const tiny: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expect(dashPath(tiny, 4, 2)).toHaveLength(1);
  });
});

describe('scoresBorder', () => {
  it('scores thin single, dashed, and corner borders only', () => {
    expect(scoresBorder(DEFAULT_BORDER)).toBe(true);
    expect(scoresBorder({ ...DEFAULT_BORDER, style: 'dashed' })).toBe(true);
    expect(scoresBorder({ ...DEFAULT_BORDER, style: 'corners' })).toBe(true);
    expect(scoresBorder({ ...DEFAULT_BORDER, style: 'double' })).toBe(false);
    expect(scoresBorder({ ...DEFAULT_BORDER, style: 'none' })).toBe(false);
    expect(scoresBorder({ ...DEFAULT_BORDER, widthMm: 0.51 })).toBe(false);
  });
});

describe('corner motifs', () => {
  it('lists the six motifs', () => {
    expect(CORNER_MOTIFS.map((m) => m.id)).toEqual(['deco-fan', 'deco-step', 'bracket', 'plain-l', 'curl', 'dots']);
  });

  it('every motif parses to a filled polygon', () => {
    for (const m of CORNER_MOTIFS) expect(area(motifPoly(m.svg, 10, 0.01))).toBeGreaterThan(5);
  });

  it('every motif fits its box and touches the top-left corner', () => {
    for (const m of CORNER_MOTIFS) {
      const b = bounds(motifPoly(m.svg, 10, 0.01))!;
      expect(b.x).toBeGreaterThanOrEqual(-1e-6);
      expect(b.y).toBeGreaterThanOrEqual(-1e-6);
      expect(b.x + b.w).toBeLessThanOrEqual(10 + 1e-6);
      expect(b.y + b.h).toBeLessThanOrEqual(10 + 1e-6);
      expect(b.x).toBeLessThan(1);
      expect(b.y).toBeLessThan(1);
    }
  });

  it('draws every motif with arms at least 6 units wide', () => {
    // Opening by 3 units removes anything narrower than 6, apart from rounding off the corners.
    for (const m of CORNER_MOTIFS) {
      const poly = motifPoly(m.svg, 100, 0.05);
      const opened = offset(offset(poly, -2.9, 0.05), 2.9, 0.05);
      expect(area(opened) / area(poly), m.id).toBeGreaterThan(0.96);
    }
  });

  it('scales an uploaded motif by its own viewBox', () => {
    const filled = (viewBox: string, d: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${d}"/></svg>`;
    for (const [viewBox, d] of [['0 0 512 512', 'M0 0H512V512H0Z'], ['0 0 24 24', 'M0 0H24V24H0Z'], ['10 10 20 20', 'M10 10H30V30H10Z']]) {
      const b = bounds(motifPoly(filled(viewBox, d), 10, 0.01))!;
      expect(b.x, viewBox).toBeCloseTo(0, 6);
      expect(b.y, viewBox).toBeCloseTo(0, 6);
      expect(b.w, viewBox).toBeCloseTo(10, 6);
      expect(b.h, viewBox).toBeCloseTo(10, 6);
    }
    // A wide box scales by its longer side.
    const wide = bounds(motifPoly(filled('0 0 48 24', 'M0 0H48V24H0Z'), 10, 0.01))!;
    expect([wide.w, wide.h]).toEqual([10, 5]);
  });

  it('scales so the 100-unit box is the asked size', () => {
    const plain = CORNER_MOTIFS.find((m) => m.id === 'plain-l')!;
    const b = bounds(motifPoly(plain.svg, 20, 0.01))!;
    expect(b.w).toBeCloseTo(20, 6);
    expect(b.h).toBeCloseTo(20, 6);
  });
});
