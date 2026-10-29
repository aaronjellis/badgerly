import { describe, expect, it } from 'vitest';
import { area, bounds, outerCount } from '../src/engine/geom';
import { parseSvgShape } from '../src/engine/svgShape';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`;
const parse = (inner: string, tol = 0.01) => parseSvgShape(wrap(inner), tol)!;
/** A flattened polygon sits inside its curve, short of it by at most `maxLoss` mm². */
const expectInscribed = (actual: number, exact: number, maxLoss: number) => {
  expect(actual).toBeLessThanOrEqual(exact + 1e-6);
  expect(actual).toBeGreaterThan(exact - maxLoss);
};
const box = (inner: string) => bounds(parse(inner).poly)!;

describe('parseSvgShape', () => {
  it('reads a rect and a circle as one union', () => {
    const s = parseSvgShape(wrap('<rect x="0" y="0" width="50" height="50"/><circle cx="50" cy="50" r="10"/>'), 0.01)!;
    expect(area(s.poly)).toBeCloseTo(2500 + Math.PI * 100 - Math.PI * 25, 0);
  });

  it('applies nested transforms in order', () => {
    const s = parseSvgShape(wrap('<g transform="translate(10 0)"><g transform="scale(2)"><rect width="10" height="10"/></g></g>'), 0.01)!;
    expect(bounds(s.poly)).toEqual(expect.objectContaining({ x: 10, y: 0, w: 20, h: 20 }));
  });

  it('handles a path with relative cubics and an arc', () => {
    const s = parseSvgShape(wrap('<path d="M10 10 h40 a20 20 0 0 1 0 40 c-10 0 -40 0 -40 -40 z"/>'), 0.01)!;
    expect(outerCount(s.poly)).toBe(1);
    expect(area(s.poly)).toBeGreaterThan(1200);
  });

  it('flags a stroke-only drawing', () => {
    const s = parseSvgShape(wrap('<path d="M0 0 L100 100" fill="none" stroke="#000"/>'), 0.01)!;
    expect(s.strokeOnly).toBe(true);
    expect(s.poly).toHaveLength(0);
  });

  it('returns null without a viewBox or size', () => {
    expect(parseSvgShape('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>', 0.01)).toBeNull();
  });

  it('returns null for text that is not an SVG', () => {
    expect(parseSvgShape('hello', 0.01)).toBeNull();
  });

  describe('viewBox', () => {
    it('is reported from the viewBox attribute', () => {
      const s = parseSvgShape('<svg viewBox="-5, 2 40,20"><rect width="1" height="1"/></svg>', 0.01)!;
      expect(s.viewBox).toEqual({ x: -5, y: 2, w: 40, h: 20 });
    });
    it('falls back to plain width and height', () => {
      expect(parseSvgShape('<svg width="40" height="20px"><rect width="1" height="1"/></svg>', 0.01)!.viewBox).toEqual({ x: 0, y: 0, w: 40, h: 20 });
    });
    it('does not guess from sizes with real units', () => {
      expect(parseSvgShape('<svg width="10mm" height="10mm"><rect width="1" height="1"/></svg>', 0.01)).toBeNull();
    });
  });

  describe('path data', () => {
    it('reads relative commands', () => {
      expect(box('<path d="m10 10 l20 0 l0 20 l-20 0 z"/>')).toEqual({ x: 10, y: 10, w: 20, h: 20 });
      expect(area(parse('<path d="m10 10 l20 0 l0 20 l-20 0 z"/>').poly)).toBeCloseTo(400, 6);
    });
    it('reads h and v in both cases', () => {
      expect(area(parse('<path d="M0 0 H10 V10 h-10 v-10 z"/>').poly)).toBeCloseTo(100, 6);
    });
    it('repeats implicit commands, treating pairs after m as l', () => {
      expect(area(parse('<path d="M0 0 L10 0 10 10 0 10 Z"/>').poly)).toBeCloseTo(100, 6);
      expect(area(parse('<path d="m0 0 10 0 0 10 -10 0z"/>').poly)).toBeCloseTo(100, 6);
      expect(area(parse('<path d="M0 0 h10 v10 h-10 z m20 0 h10 v10 h-10 z"/>').poly)).toBeCloseTo(200, 6);
    });
    it('reads compact number forms', () => {
      expect(box('<path d="M.5.5L10.5.5 10.5 10.5.5 10.5z"/>')).toEqual({ x: 0.5, y: 0.5, w: 10, h: 10 });
      const tri = parse('<path d="M10 10l5-5 5 5z"/>').poly;
      expect(area(tri)).toBeCloseTo(25, 6);
      expect(bounds(tri)).toEqual({ x: 10, y: 5, w: 10, h: 5 });
      expect(area(parse('<path d="M1e1 0L2E1 0 20 1e1 1.0e+1 10z"/>').poly)).toBeCloseTo(100, 6);
    });
    it('reads arc flags with no separators', () => {
      const s = parse('<path d="M10 10a5 5 0 1010 0a5 5 0 10-10 0z"/>');
      expect(area(s.poly)).toBeCloseTo(Math.PI * 25, 0);
      expect(bounds(s.poly)).toEqual(expect.objectContaining({ x: 10, w: 10 }));
      expect(bounds(s.poly)!.h).toBeCloseTo(10, 1);
    });
    it('scales up a too-small arc radius', () => {
      const s = parse('<path d="M10 10 A1 1 0 0 1 30 10 z"/>');
      expect(area(s.poly)).toBeCloseTo((Math.PI * 100) / 2, 0);
    });
    it('draws large-arc and sweep flags to the right side', () => {
      // From (0,0) to (10,10) with r=10 the centers are (10,0) and (0,10); sweep=1 turns clockwise on screen.
      const centered = (large: number, sweep: number) => {
        const poly = parse(`<path d="M0 0 A10 10 0 ${large} ${sweep} 10 10 z"/>`).poly;
        return { b: bounds(poly)!, a: area(poly) };
      };
      const small = centered(0, 1);
      const large = centered(1, 1);
      expect(small.b.x).toBeCloseTo(0, 2);
      expect(small.b.y).toBeCloseTo(0, 2);
      expect(small.b.w).toBeCloseTo(10, 2);
      // The small arc with sweep 1 bows up and right around center (0,10); the large one wraps the far side.
      expect(large.a).toBeCloseTo(Math.PI * 100 * 0.75 + 50, 0);
      expect(small.a).toBeCloseTo((Math.PI * 100) / 4 - 50, 0);
      expect(centered(0, 0).a).toBeCloseTo(small.a, 0);
      expect(centered(0, 0).b.w).toBeCloseTo(10, 2);
    });
    it('rotates an elliptical arc', () => {
      // Half of an ellipse with semi-axes 20 and 10 turned 90 degrees: it bulges 10 sideways.
      const b = bounds(parse('<path d="M50 30 A20 10 90 0 1 50 70 z"/>').poly)!;
      expect(b.h).toBeCloseTo(40, 1);
      expect(b.w).toBeCloseTo(10, 1);
    });
    it('matches quadratic area and keeps T equal to its reflection', () => {
      expectInscribed(area(parse('<path d="M0 0 Q50 100 100 0 z"/>').poly), (2 / 3) * 100 * 50, 1);
      const t = area(parse('<path d="M0 0 Q25 50 50 0 T100 0 z"/>').poly);
      const q = area(parse('<path d="M0 0 Q25 50 50 0 Q75 -50 100 0 z"/>').poly);
      expect(t).toBeCloseTo(q, 6);
      // A figure of eight: both lobes count under the non-zero rule.
      expectInscribed(t, 2 * (2 / 3) * 50 * 25, 1);
    });
    it('matches cubic area and keeps S equal to its reflection', () => {
      expectInscribed(area(parse('<path d="M0 0 C0 100 100 100 100 0 z"/>').poly), 6000, 1.5);
      const s = area(parse('<path d="M0 0 C0 50 50 50 50 0 S100 -50 100 0 z"/>').poly);
      const c = area(parse('<path d="M0 0 C0 50 50 50 50 0 C50 -50 100 -50 100 0 z"/>').poly);
      expect(s).toBeCloseTo(c, 6);
    });
    it('reads relative quadratic and smooth curves', () => {
      const rel = area(parse('<path d="m0 0 q50 100 100 0 z"/>').poly);
      expectInscribed(rel, (2 / 3) * 100 * 50, 1);
      const c = area(parse('<path d="m0 0 c0 100 100 100 100 0 z"/>').poly);
      expectInscribed(c, 6000, 1.5);
      const s1 = area(parse('<path d="m0 0 c0 50 50 50 50 0 s50 -50 50 0 z"/>').poly);
      const s2 = area(parse('<path d="M0 0 C0 50 50 50 50 0 S100 -50 100 0 z"/>').poly);
      expect(s1).toBeCloseTo(s2, 6);
    });
    it('closes subpaths and restarts from their start point', () => {
      // After z the pen is back at (0,0), so the relative l draws from there.
      const s = parse('<path d="M0 0 h10 v10 z l0 10 h-10 z"/>');
      expect(bounds(s.poly)).toEqual({ x: -10, y: 0, w: 20, h: 10 });
    });
    it('stops at malformed data and keeps what came before', () => {
      expect(area(parse('<path d="M0 0 h10 v10 h-10 z M 5 5 L oops"/>').poly)).toBeCloseTo(100, 6);
    });
    it('makes a hole of a reversed subpath under the non-zero rule', () => {
      expect(area(parse('<path d="M0 0h30v30h-30z M10 10v10h10v-10z"/>').poly)).toBeCloseTo(800, 6);
      expect(area(parse('<path d="M0 0h30v30h-30z M10 10h10v10h-10z"/>').poly)).toBeCloseTo(900, 6);
    });
    it('honors fill-rule evenodd', () => {
      expect(area(parse('<path fill-rule="evenodd" d="M0 0h30v30h-30z M10 10h10v10h-10z"/>').poly)).toBeCloseTo(800, 6);
      expect(area(parse('<path style="fill-rule:evenodd" d="M0 0h30v30h-30z M10 10h10v10h-10z"/>').poly)).toBeCloseTo(800, 6);
    });
    it('does not cancel overlapping elements drawn in opposite directions', () => {
      const s = parse('<path d="M0 0h10v10h-10z"/><path d="M5 0v10h10v-10z"/>');
      expect(area(s.poly)).toBeCloseTo(150, 6);
      expect(outerCount(s.poly)).toBe(1);
    });
  });

  describe('flattening tolerance', () => {
    const circle = '<circle cx="50" cy="50" r="40"/>';
    const worstSagitta = (tol: number) => {
      const poly = parse(circle, tol).poly;
      let worst = 0;
      for (const c of poly) {
        for (let i = 0; i < c.length; i++) {
          const a = c[i];
          const b = c[(i + 1) % c.length];
          worst = Math.max(worst, 40 - Math.hypot((a.x + b.x) / 2 - 50, (a.y + b.y) / 2 - 50));
        }
      }
      return worst;
    };
    it('keeps every chord of a circle within the tolerance', () => {
      expect(worstSagitta(0.01)).toBeLessThanOrEqual(0.01 + 0.002);
      expect(worstSagitta(0.5)).toBeLessThanOrEqual(0.5 + 0.002);
    });
    it('uses fewer points for a coarser tolerance', () => {
      expect(parse(circle, 0.5).poly[0].length).toBeLessThan(parse(circle, 0.01).poly[0].length);
    });
    it('measures the tolerance in viewBox units after a scale', () => {
      const poly = parse('<g transform="scale(10)"><circle cx="5" cy="5" r="4"/></g>', 0.01).poly;
      let worst = 0;
      for (const c of poly) {
        for (let i = 0; i < c.length; i++) {
          const a = c[i];
          const b = c[(i + 1) % c.length];
          worst = Math.max(worst, 40 - Math.hypot((a.x + b.x) / 2 - 50, (a.y + b.y) / 2 - 50));
        }
      }
      expect(worst).toBeLessThanOrEqual(0.012);
    });
  });

  describe('shapes', () => {
    it('reads an ellipse', () => {
      const s = parse('<ellipse cx="50" cy="40" rx="30" ry="10"/>');
      expect(area(s.poly)).toBeCloseTo(Math.PI * 300, 0);
      const b = bounds(s.poly)!;
      expect(b.x).toBeCloseTo(20, 2);
      expect(b.y).toBeCloseTo(30, 1);
      expect(b.w).toBeCloseTo(60, 2);
      expect(b.h).toBeCloseTo(20, 1);
    });
    it('reads a polygon', () => {
      expect(area(parse('<polygon points="0,0 20,0 20,10"/>').poly)).toBeCloseTo(100, 6);
      expect(area(parse('<polygon points="0 0 20 0 20 10"/>').poly)).toBeCloseTo(100, 6);
    });
    it('rounds the corners of a rect with rx', () => {
      expect(area(parse('<rect width="20" height="20" rx="5"/>').poly)).toBeCloseTo(400 - (4 - Math.PI) * 25, 0);
    });
    it('takes a missing ry from rx and the reverse', () => {
      const both = area(parse('<rect width="20" height="20" rx="5" ry="5"/>').poly);
      expect(area(parse('<rect width="20" height="20" rx="5"/>').poly)).toBeCloseTo(both, 6);
      expect(area(parse('<rect width="20" height="20" ry="5"/>').poly)).toBeCloseTo(both, 6);
    });
    it('uses different rx and ry', () => {
      expect(area(parse('<rect width="40" height="20" rx="10" ry="4"/>').poly)).toBeCloseTo(800 - (4 - Math.PI) * 40, 0);
    });
    it('clamps rx and ry to half the size', () => {
      expect(area(parse('<rect width="20" height="20" rx="100"/>').poly)).toBeCloseTo(Math.PI * 100, 0);
    });
    it('places a rect at x and y', () => {
      expect(box('<rect x="5" y="7" width="20" height="10"/>')).toEqual({ x: 5, y: 7, w: 20, h: 10 });
    });
    it('skips empty shapes', () => {
      expect(parse('<rect width="0" height="10"/><circle r="0"/><ellipse rx="3"/>').poly).toHaveLength(0);
    });
    it('ignores line and polyline', () => {
      const s = parse('<line x1="0" y1="0" x2="50" y2="50" stroke="#000"/><polyline points="0,0 50,0 50,50"/><rect width="10" height="10"/>');
      expect(area(s.poly)).toBeCloseTo(100, 6);
    });
  });

  describe('transforms', () => {
    const rect = '<rect width="10" height="10"/>';
    it('applies translate, scale and rotate', () => {
      expect(box(`<g transform="translate(5)">${rect}</g>`)).toEqual({ x: 5, y: 0, w: 10, h: 10 });
      expect(box(`<g transform="scale(2 3)">${rect}</g>`)).toEqual({ x: 0, y: 0, w: 20, h: 30 });
      expect(box(`<g transform="scale(-1 1)">${rect}</g>`)).toEqual({ x: -10, y: 0, w: 10, h: 10 });
    });
    it('rotates about the origin by default', () => {
      const b = box(`<g transform="rotate(90)">${rect}</g>`);
      expect(b).toEqual({ x: -10, y: 0, w: 10, h: 10 });
    });
    it('rotates about a given center', () => {
      const b = box('<rect width="20" height="10" transform="rotate(90 10 5)"/>');
      expect(b).toEqual({ x: 5, y: -5, w: 10, h: 20 });
    });
    it('applies a matrix', () => {
      expect(box(`<g transform="matrix(1 0 0 1 7 9)">${rect}</g>`)).toEqual({ x: 7, y: 9, w: 10, h: 10 });
      expect(box(`<g transform="matrix(2 0 0 3 1 1)">${rect}</g>`)).toEqual({ x: 1, y: 1, w: 20, h: 30 });
    });
    it('applies skewX and skewY', () => {
      expect(box(`<g transform="skewX(45)">${rect}</g>`)).toEqual({ x: 0, y: 0, w: 20, h: 10 });
      expect(box(`<g transform="skewY(45)">${rect}</g>`)).toEqual({ x: 0, y: 0, w: 10, h: 20 });
    });
    it('applies several transforms in one attribute left to right', () => {
      // translate(10 0) scale(2): scale first, then move.
      expect(box(`<g transform="translate(10 0) scale(2)">${rect}</g>`)).toEqual({ x: 10, y: 0, w: 20, h: 20 });
      expect(box(`<g transform="scale(2) translate(10 0)">${rect}</g>`)).toEqual({ x: 20, y: 0, w: 20, h: 20 });
      expect(box(`<g transform="translate(10,0),scale(2)">${rect}</g>`)).toEqual({ x: 10, y: 0, w: 20, h: 20 });
    });
    it('composes a transform on the shape with its groups', () => {
      expect(box('<g transform="translate(10 0)"><rect width="10" height="10" transform="scale(2)"/></g>')).toEqual({ x: 10, y: 0, w: 20, h: 20 });
    });
    it('transforms paths and circles too', () => {
      expect(box('<path transform="translate(3 4)" d="M0 0h10v10h-10z"/>')).toEqual({ x: 3, y: 4, w: 10, h: 10 });
      const b = box('<circle transform="translate(50 50)" r="10"/>');
      expect(b.x).toBeCloseTo(40, 1);
      expect(b.w).toBeCloseTo(20, 1);
    });
  });

  describe('fill and skipped content', () => {
    it('skips fill="none" elements', () => {
      const s = parse('<rect width="10" height="10" fill="none" stroke="#000"/><rect x="20" width="10" height="10"/>');
      expect(area(s.poly)).toBeCloseTo(100, 6);
      expect(bounds(s.poly)!.x).toBe(20);
      expect(s.strokeOnly).toBe(false);
    });
    it('skips fill:none in a style attribute', () => {
      const s = parse('<rect width="10" height="10" style="fill:none;stroke:#000"/><rect x="20" width="10" height="10" style="fill: #f00"/>');
      expect(area(s.poly)).toBeCloseTo(100, 6);
      expect(s.strokeOnly).toBe(false);
    });
    it('lets style override the attribute', () => {
      expect(parse('<rect width="10" height="10" fill="none" style="fill:#000"/>').poly).toHaveLength(1);
    });
    it('flags stroke-only when the style says so', () => {
      const s = parse('<rect width="10" height="10" style="fill:none;stroke:#000"/>');
      expect(s.strokeOnly).toBe(true);
      expect(s.poly).toHaveLength(0);
    });
    it('inherits fill="none" from a group', () => {
      const s = parse('<g fill="none" stroke="#000"><rect width="10" height="10"/><circle cx="50" cy="50" r="5"/></g>');
      expect(s.strokeOnly).toBe(true);
      expect(s.poly).toHaveLength(0);
      const t = parse('<g fill="none"><rect width="10" height="10" fill="#000"/></g>');
      expect(area(t.poly)).toBeCloseTo(100, 6);
    });
    it('is not stroke-only when one drawable is filled or has no stroke', () => {
      expect(parse('<path d="M0 0L9 9" fill="none" stroke="#000"/><rect width="10" height="10"/>').strokeOnly).toBe(false);
      expect(parse('<rect width="10" height="10" fill="none"/>').strokeOnly).toBe(false);
    });
    it('is not stroke-only when nothing is drawn', () => {
      expect(parse('<defs><rect width="5" height="5"/></defs>').strokeOnly).toBe(false);
      expect(parse('').strokeOnly).toBe(false);
    });
    it('skips defs and the other non-rendered containers', () => {
      const hidden = [
        '<defs><rect width="100" height="100"/></defs>',
        '<clipPath id="c"><rect width="100" height="100"/></clipPath>',
        '<mask id="m"><rect width="100" height="100" fill="#fff"/></mask>',
        '<symbol id="s"><rect width="100" height="100"/></symbol>',
        '<metadata><rect width="100" height="100"/></metadata>',
        '<title>x<rect width="100" height="100"/></title>',
        '<defs><g><g><rect width="100" height="100"/></g></g></defs>',
        '<use href="#s"/>',
      ];
      for (const h of hidden) {
        const s = parse(`${h}<rect width="10" height="10"/>`);
        expect(area(s.poly)).toBeCloseTo(100, 6);
      }
    });
    it('draws a shape after a skipped container closes', () => {
      const s = parse('<defs><path id="p" d="M0 0h50v50z"/></defs><g><path d="M0 0h10v10h-10z"/></g>');
      expect(area(s.poly)).toBeCloseTo(100, 6);
    });
    it('reads past a self-closing container', () => {
      expect(area(parse('<defs/><rect width="10" height="10"/>').poly)).toBeCloseTo(100, 6);
    });
    it('ignores comments, the XML prolog and style blocks', () => {
      const text = `<?xml version="1.0"?><!-- <rect width="99" height="99"/> --><svg viewBox="0 0 100 100"><style>.a>b{fill:red}</style><rect width="10" height="10"/></svg>`;
      expect(area(parseSvgShape(text, 0.01)!.poly)).toBeCloseTo(100, 6);
    });
    it('reads attributes that hold a > or use single quotes', () => {
      const s = parse(`<rect data-x="a>b" width='10' height='10'/>`);
      expect(area(s.poly)).toBeCloseTo(100, 6);
    });
  });
});
