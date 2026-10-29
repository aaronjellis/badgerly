import { describe, expect, it } from 'vitest';
import { bounds } from '../src/engine/geom';
import { defaultProject } from '../src/engine/model';
import { resolveBadge } from '../src/engine/resolve';
import { guideLines, snapMove } from '../src/engine/snapping';
import { fakeProvider, font } from './helpers/fonts';

const cinzel = () => fakeProvider([font('cinzel-700-normal')]);
const box = { x: 0, y: 0, w: 10, h: 4 };

describe('snapMove', () => {
  it('snaps the ink center to the badge center within the threshold', () => {
    const r = snapMove({ x: -5, y: -2, w: 10, h: 4 }, 0.4, -0.3, { xs: [0], ys: [0] }, 0.5);
    expect(r).toEqual({ dx: 0, dy: 0, hitX: 0, hitY: 0 });
  });

  it('snaps an edge to another element edge and leaves the other axis alone', () => {
    const r = snapMove(box, 2.3, 5, { xs: [12.5], ys: [] }, 0.5);
    expect(r.dx).toBeCloseTo(2.5);
    expect(r.hitX).toBe(12.5);
    expect(r.dy).toBe(5);
    expect(r.hitY).toBeNull();
  });

  it('picks the nearest of several guides', () => {
    // Moved box spans x 3..13 (center 8): right edge is 0.3 from 13.3, center 0.6 from 7.4.
    const r = snapMove(box, 3, 0, { xs: [7.4, 13.3, 3.5], ys: [] }, 1);
    expect(r.hitX).toBe(13.3);
    expect(r.dx).toBeCloseTo(3.3);
  });

  it('ignores a guide just outside the threshold', () => {
    const r = snapMove(box, 2, 3, { xs: [12.51], ys: [5.5] }, 0.5);
    // Right edge at 12 is 0.51 from 12.51; middle at 5 is 0.5 from 5.5 (the 4 mm box's middle is y 5).
    expect(r.hitX).toBeNull();
    expect(r.dx).toBe(2);
    expect(r.hitY).toBe(5.5);
    expect(r.dy).toBeCloseTo(3.5);
  });

  it('snaps top and bottom edges on the y axis', () => {
    // Moved box spans y 1..5; its bottom is 0.2 from 5.2.
    const r = snapMove(box, 0, 1, { xs: [], ys: [5.2] }, 0.5);
    expect(r.hitY).toBe(5.2);
    expect(r.dy).toBeCloseTo(1.2);
  });
});

describe('guideLines', () => {
  const resolved = resolveBadge(defaultProject(), cinzel(), 0.05);

  it('collects guides from the badge and the other elements', () => {
    const g = guideLines(resolved, null);
    expect(g.xs).toContain(0);
    expect(g.xs).toContain(-50.8);
    expect(g.xs).toContain(50.8);
    expect(g.ys).toContain(0);
    const ink = resolved.elements[0].ink;
    expect(g.xs).toContain(Math.round(ink.x * 100) / 100);
    expect(g.ys).toContain(Math.round((ink.y + ink.h) * 100) / 100);
  });

  it('sorts ascending and deduplicates to 0.01 mm', () => {
    const g = guideLines(resolved, null);
    expect(g.xs).toEqual([...g.xs].sort((a, b) => a - b));
    expect(new Set(g.xs).size).toBe(g.xs.length);
  });

  it('drops the excluded element guides', () => {
    const ink = resolved.elements[0].ink;
    const all = guideLines(resolved, null);
    const without = guideLines(resolved, resolved.elements[0].id);
    const left = Math.round(ink.x * 100) / 100;
    expect(all.xs).toContain(left);
    expect(without.xs).not.toContain(left);
    expect(without.xs.length).toBeLessThan(all.xs.length);
  });

  it('includes the border inner edge for a single border and omits it for none', () => {
    // Default border: inset 3.175 mm, width 0.5 mm, so the ring's inner edge is 47.385 mm from the center.
    const withBorder = guideLines(resolved, null);
    expect(withBorder.xs).toContain(-47.38);
    expect(withBorder.xs).toContain(47.38);
    // The badge is not square: the inner edge sits 3.425 mm inside the outline's top and bottom.
    const o = bounds(resolved.outline)!;
    expect(withBorder.ys.some((y) => Math.abs(y - (o.y + 3.425)) < 0.006)).toBe(true);
    expect(withBorder.ys.some((y) => Math.abs(y - (o.y + o.h - 3.425)) < 0.006)).toBe(true);

    const p = defaultProject();
    p.border = { ...p.border, style: 'none' };
    const none = guideLines(resolveBadge(p, cinzel(), 0.05), null);
    expect(none.xs).not.toContain(-47.38);
    expect(none.xs).not.toContain(47.38);
  });
});
