import { describe, expect, it } from 'vitest';
import { addPairEm, alongText, fallbackInk, kerningDeltaEm, kerningHandles, pieceSlots, round2, scaleFactor } from '../src/ui/stageMath';
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

describe('kerningDeltaEm', () => {
  it('converts mm along the text to em at the render size', () => {
    // Caps 10 mm tall on an outline whose caps are 70 px tall at 100 px per em: 1 em is 100/70*10 mm (14.29).
    expect(kerningDeltaEm(10, 10, 70)).toBeCloseTo(0.7);
    expect(kerningDeltaEm(-5, 10, 70)).toBeCloseTo(-0.35);
  });

  it('is zero when a size is not known yet', () => {
    expect(kerningDeltaEm(3, 0, 70)).toBe(0);
    expect(kerningDeltaEm(3, 10, 0)).toBe(0);
  });
});

describe('alongText', () => {
  it('projects a pointer move onto the text direction', () => {
    expect(alongText(4, 3, 0)).toBeCloseTo(4);
    expect(alongText(4, 3, 90)).toBeCloseTo(3);
    expect(alongText(4, 3, 180)).toBeCloseTo(-4);
  });
});

describe('kerningHandles', () => {
  const clusters = [
    { line: 0, index: 0, x: 1, y: 5 },
    { line: 0, index: 1, x: 2, y: 5 },
    { line: 0, index: 2, x: 3, y: 5 },
    { line: 1, index: 0, x: 1, y: 9 },
    { line: 1, index: 1, x: 2.5, y: 9 },
  ];

  it('skips each line\'s first cluster and keys a handle by the pair it widens', () => {
    expect(kerningHandles(clusters)).toEqual([
      { key: '0:0', x: 2, y: 5 },
      { key: '0:1', x: 3, y: 5 },
      { key: '1:0', x: 2.5, y: 9 },
    ]);
  });

  it('follows the cluster index, not the position, when ligatures skip indexes', () => {
    const lig = [
      { line: 0, index: 0, x: 0, y: 0 },
      { line: 0, index: 2, x: 4, y: 0 },
    ];
    expect(kerningHandles(lig)).toEqual([{ key: '0:0', x: 4, y: 0 }]);
  });
});

describe('addPairEm', () => {
  it('adds to the current value and rounds away float noise', () => {
    expect(addPairEm(undefined, 0.01)).toBe(0.01);
    expect(addPairEm(0.1, 0.2)).toBe(0.3);
    expect(addPairEm(0.01, -0.01)).toBe(0);
  });
});

describe('round2', () => {
  it('rounds to the hundredth', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(7.620000000001)).toBe(7.62);
  });
});
