import { describe, expect, it } from 'vitest';
import { bounds, outerCount, rotate } from '../src/engine/geom';
import { defaultProject, DEFAULT_ROLE, newId } from '../src/engine/model';
import type { BadgeProject, GraphicElement, TextElement } from '../src/engine/model';
import { resolveBadge } from '../src/engine/resolve';
import { fakeProvider, font } from './helpers/fonts';

const cinzel = () => fakeProvider([font('cinzel-700-normal')]);

const svgUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

function graphic(patch: Partial<GraphicElement>): GraphicElement {
  return {
    kind: 'graphic',
    id: newId(),
    name: 'Graphic',
    x: 0,
    y: 0,
    rotationDeg: 0,
    role: { ...DEFAULT_ROLE },
    dataUrl: svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>'),
    vector: true,
    widthMm: 40,
    heightMm: 20,
    ...patch,
  };
}

const withOnly = (p: BadgeProject, ...els: BadgeProject['elements']) => {
  p.elements = els;
  return p;
};

describe('resolveBadge', () => {
  it('places text at its cap height and position', () => {
    const p = defaultProject(); p.elements[0].x = 10; p.elements[0].y = -5;
    const r = resolveBadge(p, fakeProvider([font('cinzel-700-normal')]), 0.05);
    const e = r.elements[0];
    expect(e.ink.x + e.ink.w / 2).toBeCloseTo(10, 1);
    expect(e.ink.y + e.ink.h / 2).toBeCloseTo(-5, 1);
    expect(e.ink.h).toBeCloseTo(7.62, 0);   // 'YOUR NAME' in caps: ink height is the cap height
  });
  it('skips a text element the font cannot draw and warns', () => {
    const p = defaultProject(); (p.elements[0] as TextElement).text.text = 'A😀';
    const r = resolveBadge(p, fakeProvider([font('cinzel-700-normal')]), 0.05);
    expect(r.elements).toHaveLength(0);
    expect(r.warnings[0]).toMatchObject({ code: 'missingFont', elementId: p.elements[0].id });
    expect(r.warnings[0].message).toContain('😀');
  });
  it('hugText makes one piece with no holes around two lines of text', () => {
    const p = defaultProject(); p.shape.kind = 'hugText'; p.shape.hugMm = 3;
    (p.elements[0] as TextElement).text.text = 'BOB\nSMITH';
    const r = resolveBadge(p, fakeProvider([font('cinzel-700-normal')]), 0.05);
    expect(outerCount(r.outline)).toBe(1);
    expect(r.outline).toHaveLength(1);
  });
  it('warns about a floating counter for a cut-out O', () => {
    const p = defaultProject(); const t = p.elements[0] as TextElement; t.text.text = 'O'; t.role.laser = 'cutout';
    const r = resolveBadge(p, fakeProvider([font('cinzel-700-normal')]), 0.05);
    expect(r.warnings.some(w => w.code === 'floatingCounter')).toBe(true);
  });
  it('warns when an element crosses the fillet in 3D mode', () => {
    const p = defaultProject(); p.mode = 'print3d'; p.elements[0].x = 48;
    const r = resolveBadge(p, fakeProvider([font('cinzel-700-normal')]), 0.05);
    expect(r.warnings.some(w => w.code === 'outsideFlat')).toBe(true);
  });

  it('gives a centered default badge no warnings and an inset flat', () => {
    const p = defaultProject();
    const r = resolveBadge(p, cinzel(), 0.05);
    expect(r.warnings).toEqual([]);
    const outline = bounds(r.outline)!;
    expect(outline.w).toBeCloseTo(101.6, 2);
    const flat = bounds(r.flat)!;
    expect(flat.w).toBeCloseTo(101.6 - 2 * p.relief.edgeMm, 1);
    expect(r.border.bands.length).toBeGreaterThan(0);
  });
  it('places an uploaded SVG to fill its box at its position', () => {
    const p = withOnly(defaultProject(), graphic({ x: 5, y: 3 }));
    const r = resolveBadge(p, cinzel(), 0.05);
    const e = r.elements[0];
    expect(e.raster).toBe(false);
    expect(e.ink).toEqual({ x: -15, y: -7, w: 40, h: 20 });
    const b = bounds(e.poly)!;
    expect(b.x).toBeCloseTo(-15, 2);
    expect(b.y).toBeCloseTo(-7, 2);
    expect(b.w).toBeCloseTo(40, 2);
    expect(b.h).toBeCloseTo(20, 2);
  });
  it('fits an SVG into its box without stretching it', () => {
    const p = withOnly(defaultProject(), graphic({ widthMm: 40, heightMm: 40 }));
    const b = bounds(resolveBadge(p, cinzel(), 0.05).elements[0].poly)!;
    expect(b.w).toBeCloseTo(40, 2);
    expect(b.h).toBeCloseTo(20, 2);
    expect(b.y + b.h / 2).toBeCloseTo(0, 2);
  });
  it('keeps an upscaled SVG curve within the tolerance on the badge', () => {
    // A circle of radius 1 in its viewBox drawn 40 mm wide: radius 20 mm on the badge.
    const dataUrl = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><circle cx="1" cy="1" r="1"/></svg>');
    const p = withOnly(defaultProject(), graphic({ dataUrl, widthMm: 40, heightMm: 40 }));
    const poly = resolveBadge(p, cinzel(), 0.05).elements[0].poly;
    // Parsed at 0.05 viewBox units the chords would sag 1 mm; the SVG's 0.001-unit grid adds up to 0.02 mm here.
    for (const contour of poly) {
      for (let i = 0; i < contour.length; i++) {
        const a = contour[i];
        const b = contour[(i + 1) % contour.length];
        const mid = Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2);
        expect(20 - mid).toBeLessThan(0.05 + 0.02);
      }
    }
  });
  it('gives a raster graphic its box and no polygon', () => {
    const p = withOnly(defaultProject(), graphic({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=', vector: false, x: -10, y: 4, widthMm: 30, heightMm: 12, rotationDeg: 30 }));
    p.mode = 'print3d';
    const r = resolveBadge(p, cinzel(), 0.05);
    expect(r.elements[0]).toMatchObject({ poly: [], raster: true, ink: { x: -25, y: -2, w: 30, h: 12 } });
    expect(r.warnings).toEqual([]);
  });
  it('warns about a stroke-only SVG and keeps it without area', () => {
    const dataUrl = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10" fill="none" stroke="black"/></svg>');
    const el = graphic({ dataUrl, widthMm: 20, heightMm: 20 });
    const r = resolveBadge(withOnly(defaultProject(), el), cinzel(), 0.05);
    expect(r.elements[0]).toMatchObject({ id: el.id, poly: [], raster: false });
    expect(r.warnings).toEqual([expect.objectContaining({ code: 'strokeOnlySvg', elementId: el.id })]);
  });
  it('skips text while its fonts load and says so', () => {
    const p = defaultProject();
    const r = resolveBadge(p, fakeProvider(null), 0.05);
    expect(r.elements).toEqual([]);
    expect(r.warnings).toEqual([expect.objectContaining({ code: 'fontLoading', elementId: p.elements[0].id })]);
  });
  it('rotates text about its center but keeps the unrotated ink box', () => {
    const p = defaultProject(); p.elements[0].x = 3; p.elements[0].y = 2;
    const flat = resolveBadge(p, cinzel(), 0.05).elements[0];
    p.elements[0].rotationDeg = 30;
    const turned = resolveBadge(p, cinzel(), 0.05).elements[0];
    expect(turned.ink).toEqual(flat.ink);
    const b = bounds(turned.poly)!;
    expect(b.h).toBeGreaterThan(turned.ink.h + 10);
    // The turn is about the ink box center, (3, 2).
    const expected = bounds(rotate(flat.poly, 30, 3, 2))!;
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(b[k]).toBeCloseTo(expected[k], 2);
  });
  it('gives clusters in mm along the line, rotated with the text', () => {
    const p = defaultProject();
    const e = resolveBadge(p, cinzel(), 0.05).elements[0];
    expect(e.clusters).toHaveLength('YOUR NAME'.length);
    expect(e.clusters[0].x).toBeCloseTo(e.ink.x, 0);
    // The baseline of caps-only text is the bottom of its ink.
    for (const c of e.clusters) expect(c.y).toBeCloseTo(e.ink.y + e.ink.h, 0);
    p.elements[0].rotationDeg = 90;
    const turned = resolveBadge(p, cinzel(), 0.05).elements[0];
    for (const c of turned.clusters) expect(c.x).toBeCloseTo(-e.ink.h / 2, 0);
    expect(turned.clusters[1].y).toBeGreaterThan(turned.clusters[0].y);
  });
  it('warns when the border inset leaves nothing of the badge', () => {
    const p = defaultProject(); p.border.insetMm = 30;
    const r = resolveBadge(p, cinzel(), 0.05);
    expect(r.border.tooDeep).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(['borderTooDeep']);
  });
  it('hugText with no elements falls back to a rectangle of the badge size', () => {
    const p = withOnly(defaultProject()); p.shape.kind = 'hugText';
    const r = resolveBadge(p, cinzel(), 0.05);
    expect(bounds(r.outline)).toEqual({ x: -50.8, y: -25.4, w: 101.6, h: 50.8 });
    expect(r.warnings.map((w) => w.code)).toEqual(['noElements']);
  });
  it('hugText bridges two far-apart words and says so', () => {
    const a = defaultProject().elements[0] as TextElement;
    const b = { ...a, id: newId(), text: { ...a.text, text: 'BOB' }, x: 0, y: 20 } as TextElement;
    a.text.text = 'AL'; a.y = -20;
    const p = withOnly(defaultProject(), a, b); p.shape.kind = 'hugText'; p.shape.hugMm = 2;
    const r = resolveBadge(p, cinzel(), 0.05);
    expect(outerCount(r.outline)).toBe(1);
    expect(r.warnings.map((w) => w.code)).toEqual(['bridged']);
  });
  it('hugText reports islands it cannot join', () => {
    const a = defaultProject().elements[0] as TextElement;
    const b = { ...a, id: newId(), text: { ...a.text, text: 'BOB' }, x: 0, y: 40 } as TextElement;
    a.text.text = 'AL'; a.y = -40;
    const p = withOnly(defaultProject(), a, b); p.shape.kind = 'hugText'; p.shape.hugMm = 1; p.shape.heightMm = 10;
    const r = resolveBadge(p, cinzel(), 0.05);
    expect(outerCount(r.outline)).toBe(2);
    expect(r.warnings.map((w) => w.code)).toContain('islands');
  });
  it('raises no floating counter for a cut-out letter without a counter, nor outside laser mode', () => {
    const p = defaultProject(); const t = p.elements[0] as TextElement; t.text.text = 'L'; t.role.laser = 'cutout';
    expect(resolveBadge(p, cinzel(), 0.05).warnings).toEqual([]);
    t.text.text = 'O'; p.mode = 'print3d';
    expect(resolveBadge(p, cinzel(), 0.05).warnings.some((w) => w.code === 'floatingCounter')).toBe(false);
  });
  it('raises no outside-flat warning in laser mode', () => {
    const p = defaultProject(); p.elements[0].x = 48;
    expect(resolveBadge(p, cinzel(), 0.05).warnings.some((w) => w.code === 'outsideFlat')).toBe(false);
  });
});
