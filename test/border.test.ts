import { describe, expect, it } from 'vitest';
import { area, bounds, offset, outerCount, pathLength } from '../src/engine/geom';
import type { Pt } from '../src/engine/geom';
import { buildShape, DEFAULT_SHAPE } from '../src/engine/shapes';
import { buildBorder, dashPath, DEFAULT_BORDER, scoresBorder } from '../src/engine/border';
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

  it('keeps the whole line when the corners are far from the contour', () => {
    const ellipse = buildShape({ ...DEFAULT_SHAPE, kind: 'ellipse' }, 0.01);
    const g = buildBorder(ellipse, { ...DEFAULT_BORDER, style: 'corners' }, 0.01);
    expect(g.centerlines.length).toBeGreaterThanOrEqual(1);
    expect(g.closedLines).toBe(false);
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

  it('scales so the 100-unit box is the asked size', () => {
    const plain = CORNER_MOTIFS.find((m) => m.id === 'plain-l')!;
    const b = bounds(motifPoly(plain.svg, 20, 0.01))!;
    expect(b.w).toBeCloseTo(20, 6);
    expect(b.h).toBeCloseTo(20, 6);
  });
});
