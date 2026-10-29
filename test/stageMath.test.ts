import { describe, expect, it } from 'vitest';
import { fallbackInk, pieceSlots, scaleFactor } from '../src/ui/stageMath';
import { defaultProject } from '../src/engine/model';
import type { TextElement } from '../src/engine/model';

describe('scaleFactor', () => {
  it('is the ratio of the pointer distances', () => {
    expect(scaleFactor(10, 15, 7.62, 1)).toBeCloseTo(1.5);
    expect(scaleFactor(10, 5, 7.62, 1)).toBeCloseTo(0.5);
  });

  it('stops where the smaller side reaches the floor', () => {
    expect(scaleFactor(10, 0.1, 7.62, 1)).toBeCloseTo(1 / 7.62);
    expect(scaleFactor(10, 0, 2, 1)).toBeCloseTo(0.5);
  });

  it('survives a drag that started on the center', () => {
    expect(Number.isFinite(scaleFactor(0, 3, 5, 1))).toBe(true);
  });
});

describe('fallbackInk', () => {
  it('is centered on the element and as tall as its cap height', () => {
    const el = defaultProject().elements[0] as TextElement;
    const ink = fallbackInk({ ...el, x: 4, y: -2 });
    expect(ink.x + ink.w / 2).toBeCloseTo(4);
    expect(ink.y + ink.h / 2).toBeCloseTo(-2);
    expect(ink.h).toBeCloseTo(el.capHeightMm);
    expect(ink.w).toBeGreaterThan(ink.h);
  });
});

describe('pieceSlots', () => {
  it('lays pieces left to right with the gap between their bounds', () => {
    const { dx, bounds } = pieceSlots(
      [{ x: -20, y: -5, w: 40, h: 10 }, null, { x: -10, y: -8, w: 20, h: 16 }],
      5
    );
    expect(dx).toEqual([20, 0, 55]);
    expect(bounds).toEqual({ x: 0, y: -8, w: 40 + 5 + 20, h: 16 });
  });

  it('has no bounds when nothing is placed', () => {
    expect(pieceSlots([null], 5).bounds).toBeNull();
  });
});
