import { describe, expect, it } from 'vitest';
import { area, union } from '../src/engine/geom';
import type { Poly } from '../src/engine/geom';
import { isClosed, signedVolume } from '../src/engine/mesh';
import { defaultProject, DEFAULT_ROLE, newId } from '../src/engine/model';
import type { BadgeProject, GraphicElement } from '../src/engine/model';
import { buildRelief, clampRelief, reliefPolys } from '../src/engine/relief';
import { resolveBadge } from '../src/engine/resolve';
import type { ResolvedBadge } from '../src/engine/resolve';
import { fakeProvider, font } from './helpers/fonts';

const r3d = (patch: (p: BadgeProject) => void = () => {}, tol = 0.01) => {
  const p = defaultProject();
  p.mode = 'print3d';
  patch(p);
  return { p, r: resolveBadge(p, fakeProvider([font('cinzel-700-normal')]), tol) };
};

const png = (): GraphicElement => ({
  kind: 'graphic',
  id: newId(),
  name: 'Photo',
  x: 0,
  y: 0,
  rotationDeg: 0,
  role: { ...DEFAULT_ROLE },
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  vector: false,
  widthMm: 20,
  heightMm: 20,
});

/** A vector graphic `w` × `h` mm drawn from `body`, at (40, 0). */
const svgGraphic = (body: string, w: number, h: number): GraphicElement => ({
  ...png(),
  name: 'Bar',
  x: 40,
  dataUrl: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 40">${body}</svg>`)}`,
  vector: true,
  widthMm: w,
  heightMm: h,
});

const rect = (x0: number, y0: number, x1: number, y1: number): Poly =>
  [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]];

/** Two blocks joined by a 1.2 mm neck, which a 1 mm edge pinches off: its rings split partway up. */
const dumbbell = (): ResolvedBadge => {
  const outline = union([rect(-20, -10, -5, 10), rect(5, -10, 20, 10), rect(-5, -0.6, 5, 0.6)]);
  return {
    outline,
    flat: outline,
    border: { bands: [], centerlines: [], closedLines: true, ornaments: [], tooDeep: false },
    elements: [],
    warnings: [],
  };
};

describe('relief', () => {
  // The brief's tests, verbatim.
  it('the default badge is a closed plate with raised text and border', () => {
    const { p, r } = r3d();
    const out = buildRelief(p, r, 0.01);
    expect(isClosed(out.plate)).toBe(true);
    const base = area(r.outline) * 3;
    expect(signedVolume(out.plate)).toBeGreaterThan(base * 0.9);  // the fillet removes little; emboss adds
    expect(out.parts).toBeNull();
  });
  it('a chamfered, debossed badge is closed and smaller than the plain plate', () => {
    const { p, r } = r3d(p => { p.relief.edge = 'chamfer'; p.elements[0].role.relief = 'deboss'; p.border.relief = 'deboss'; });
    const out = buildRelief(p, r, 0.01);
    expect(isClosed(out.plate)).toBe(true);
    expect(signedVolume(out.plate)).toBeLessThan(area(r.outline) * 3);
  });
  it('split gives a recessed plate and separate parts that are both closed', () => {
    const { p, r } = r3d(p => { p.relief.split = true; });
    const out = buildRelief(p, r, 0.01);
    expect(isClosed(out.plate)).toBe(true);
    expect(out.parts && isClosed(out.parts)).toBe(true);
    expect(signedVolume(out.parts!)).toBeCloseTo(area(r.elements[0].poly) * 1.6 + area(union([r.border.bands, r.border.ornaments])) * 1.2, 0);
  });
  it('clamps a deboss deeper than the plate and an oversized fillet', () => {
    const { p, r } = r3d(p => { p.relief.edgeMm = 40; p.elements[0].role.relief = 'deboss'; p.elements[0].role.reliefMm = 5; });
    const out = buildRelief(p, r, 0.01);
    expect(out.clamped.edgeMm).toBe(2.6);
    expect(out.clamped.debossMm).toBe(2.6);
    expect(isClosed(out.plate)).toBe(true);
  });
  it('a wave badge with a fillet stays closed through ring changes', () => {
    const { p, r } = r3d(p => { p.shape.kind = 'wave'; p.relief.edgeMm = 2; });
    expect(isClosed(buildRelief(p, r, 0.01).plate)).toBe(true);
  });

  // Further tests.
  it('a plate with no edge is exactly the outline times the plate plus each emboss', () => {
    const { p, r } = r3d(p => { p.relief.edge = 'none'; });
    const out = buildRelief(p, r, 0.01);
    expect(isClosed(out.plate)).toBe(true);
    const { emboss } = reliefPolys(p, r);
    const raised = emboss.reduce((s, e) => s + area(e.poly) * e.mm, 0);
    expect(raised).toBeGreaterThan(0);
    expect(signedVolume(out.plate)).toBeCloseTo(area(r.outline) * 3 + raised, 0);
  });
  it('a badge with no elements and no border is a plain closed plate', () => {
    const { p, r } = r3d(p => { p.elements = []; p.border.style = 'none'; });
    const out = buildRelief(p, r, 0.01);
    expect(isClosed(out.plate)).toBe(true);
    const base = area(r.outline) * 3;
    expect(signedVolume(out.plate)).toBeLessThan(base);
    expect(signedVolume(out.plate)).toBeGreaterThan(base * 0.98);
    const flat = buildRelief({ ...p, relief: { ...p.relief, edge: 'none' } }, r, 0.01);
    expect(signedVolume(flat.plate)).toBeCloseTo(base, 0);
  });
  it('ignores raster graphics', () => {
    const plain = r3d();
    const withPng = r3d(p => { p.elements.push(png()); });
    expect(withPng.r.elements.some(e => e.raster)).toBe(true);
    const a = buildRelief(plain.p, plain.r, 0.01);
    const b = buildRelief(withPng.p, withPng.r, 0.01);
    expect(isClosed(b.plate)).toBe(true);
    expect(signedVolume(b.plate)).toBeCloseTo(signedVolume(a.plate), 6);
  });
  it('stays closed at the preview tolerance', () => {
    for (const patch of [() => {}, (p: BadgeProject) => { p.relief.split = true; }, (p: BadgeProject) => { p.relief.edge = 'chamfer'; }]) {
      const { p, r } = r3d(patch, 0.05);
      const out = buildRelief(p, r, 0.05);
      expect(isClosed(out.plate)).toBe(true);
      if (out.parts) expect(isClosed(out.parts)).toBe(true);
    }
  });
  it('stays closed when features of different heights overlap or run past the flat top', () => {
    // The text crosses the border and runs off the flat top; first raised, then sunk.
    for (const relief of ['emboss', 'deboss'] as const) {
      const { p, r } = r3d(p => { p.elements[0].y = 22; p.elements[0].role.relief = relief; p.border.relief = 'deboss'; });
      const out = buildRelief(p, r, 0.01);
      expect(isClosed(out.plate)).toBe(true);
      expect(signedVolume(out.plate)).toBeGreaterThan(0);
    }
    const { p, r } = r3d(p => { p.elements[0].y = 22; p.relief.split = true; p.border.reliefMm = 1.5; });
    const out = buildRelief(p, r, 0.01);
    expect(isClosed(out.plate)).toBe(true);
    expect(out.parts && isClosed(out.parts)).toBe(true);
  });
  it('fills an edge span whose rings split with slabs and stays closed', () => {
    const r = dumbbell();
    for (const edge of ['fillet', 'chamfer'] as const) {
      for (const tol of [0.05, 0.01]) {
        const p = defaultProject();
        p.mode = 'print3d';
        p.elements = [];
        p.relief.edge = edge;
        const out = buildRelief(p, r, tol);
        expect(isClosed(out.plate)).toBe(true);
        expect(signedVolume(out.plate)).toBeLessThan(area(r.outline) * 3);
        expect(signedVolume(out.plate)).toBeGreaterThan(area(r.outline) * 3 * 0.9);
      }
    }
  });
  it('clampRelief leaves sizes that fit alone', () => {
    const { p, r } = r3d();
    expect(clampRelief(p.relief, r.outline)).toEqual(p.relief);
    const out = buildRelief(p, r, 0.01);
    expect(out.clamped).toEqual({ edgeMm: null, debossMm: null, recessMm: null });
  });
  it('reports a split recess deeper than the plate allows', () => {
    const { p, r } = r3d(p => { p.relief.split = true; p.relief.recessMm = 4; });
    const out = buildRelief(p, r, 0.01);
    expect(out.clamped.recessMm).toBe(2.6);
    expect(isClosed(out.plate)).toBe(true);
    expect(out.parts && isClosed(out.parts)).toBe(true);
  });
  it('the default badge raises no warnings', () => {
    const { p, r } = r3d();
    expect(buildRelief(p, r, 0.01).warnings).toEqual([]);
  });
  it('warns when the border runs onto the edge', () => {
    const { p, r } = r3d(p => { p.border.insetMm = 0.5; });
    const codes = buildRelief(p, r, 0.01).warnings.map(w => [w.code, w.elementId]);
    expect(codes).toEqual([['outsideFlat', undefined]]);
  });
  it('warns about a raised or sunk element thinner than 0.5 mm', () => {
    for (const relief of ['emboss', 'deboss'] as const) {
      const { p, r } = r3d(p => {
        p.border.style = 'none';
        const bar = svgGraphic('<rect width="3" height="40"/>', 0.3, 4);
        bar.role.relief = relief;
        p.elements.push(bar);
      });
      const thin = buildRelief(p, r, 0.01).warnings.filter(w => w.code === 'thin');
      expect(thin.map(w => w.elementId)).toEqual([p.elements[1].id]);
      expect(thin[0].message).toBe('Part of this element is thinner than 0.5 mm and may not print.');
    }
  });
  it('warns about a border thinner than 0.5 mm', () => {
    const { p, r } = r3d(p => { p.border.widthMm = 0.3; });
    const thin = buildRelief(p, r, 0.01).warnings.filter(w => w.code === 'thin');
    expect(thin).toEqual([{ code: 'thin', message: 'The border is thinner than 0.5 mm and may not print.' }]);
  });
  it('reliefPolys sorts elements and the border by role and clips them to the flat top', () => {
    const { p, r } = r3d(p => { p.border.relief = 'deboss'; p.border.reliefMm = 9; });
    const { emboss, deboss } = reliefPolys(p, r);
    expect(reliefPolys(p, r, r.flat, union([r.border.bands, r.border.ornaments]))).toEqual({ emboss, deboss });
    expect(emboss[0].elementId).toBe(p.elements[0].id);
    expect(deboss[0].elementId).toBeUndefined();
    expect(emboss.map(e => e.mm)).toEqual([1]);
    expect(deboss.map(e => e.mm)).toEqual([2.6]);
    expect(area(emboss[0].poly)).toBeCloseTo(area(r.elements[0].poly), 0);
  });
  it('is y-up like a printer bed: a feature at the upper right of the 2D badge lands back right', () => {
    const { p, r } = r3d(p => {
      p.elements = [{ ...svgGraphic('<rect width="3" height="40"/>', 6, 6), x: 20, y: -10 }];
      p.border.style = 'none';
    }, 0.05);
    const out = buildRelief(p, r, 0.05);
    expect(isClosed(out.plate)).toBe(true);
    expect(signedVolume(out.plate)).toBeGreaterThan(0);
    // The raised face is the only geometry above the 3 mm flat top.
    const top: { x: number; y: number }[] = [];
    for (let k = 0; k < out.plate.positions.length; k += 3) {
      if (out.plate.positions[k + 2] > 3.5) top.push({ x: out.plate.positions[k], y: out.plate.positions[k + 1] });
    }
    expect(top.length).toBeGreaterThan(0);
    const mean = (f: (q: { x: number; y: number }) => number) => top.reduce((a, q) => a + f(q), 0) / top.length;
    expect(mean((q) => q.x)).toBeCloseTo(20, 0);
    expect(mean((q) => q.y)).toBeCloseTo(10, 0);
  });
  it('mirrors the parts of a split the same way', () => {
    const { p, r } = r3d(p => {
      p.elements = [{ ...svgGraphic('<rect width="3" height="40"/>', 6, 6), x: 20, y: -10 }];
      p.border.style = 'none';
      p.relief.split = true;
    }, 0.05);
    const parts = buildRelief(p, r, 0.05).parts!;
    expect(isClosed(parts)).toBe(true);
    expect(signedVolume(parts)).toBeGreaterThan(0);
    const ys: number[] = [];
    for (let k = 1; k < parts.positions.length; k += 3) ys.push(parts.positions[k]);
    expect(Math.min(...ys)).toBeGreaterThan(0);
  });
});
