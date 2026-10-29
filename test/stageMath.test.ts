import { describe, expect, it } from 'vitest';
import { addPairEm, alongText, anchoredCenter, fallbackInk, kerningDeltaEm, kerningHandles, round2, scaleFactor, textLines } from '../src/ui/stageMath';
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

describe('textLines', () => {
  it('splits as the outline does: blank lines kept, no placeholder for empty text', () => {
    const el = defaultProject().elements[0] as TextElement;
    expect(textLines({ ...el, text: { ...el.text, text: 'A\n\nB' } })).toEqual(['A', '', 'B']);
    expect(textLines({ ...el, text: { ...el.text, text: '' } })).toEqual(['']);
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
      { key: '0:0', line: 0, index: 1, x: 2, y: 5 },
      { key: '0:1', line: 0, index: 2, x: 3, y: 5 },
      { key: '1:0', line: 1, index: 1, x: 2.5, y: 9 },
    ]);
  });

  it('follows the cluster index, not the position, when ligatures skip indexes', () => {
    const lig = [
      { line: 0, index: 0, x: 0, y: 0 },
      { line: 0, index: 2, x: 4, y: 0 },
    ];
    expect(kerningHandles(lig)).toEqual([{ key: '0:0', line: 0, index: 2, x: 4, y: 0 }]);
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

describe('anchoredCenter', () => {
  // The ink box is centered on the element, so its leading edge sits `offset` (= -width / 2) from the center along the text.
  const leadingEdge = (c: { x: number; y: number }, offset: number, deg: number) => ({
    x: c.x + offset * Math.cos((deg * Math.PI) / 180),
    y: c.y + offset * Math.sin((deg * Math.PI) / 180),
  });

  it('moves the center by the whole change of offset, not half of the width change', () => {
    // The text grew 10 mm wider: its leading edge offset went from -20 to -25.
    expect(anchoredCenter({ x: 10, y: 5 }, -20, -25, 0)).toEqual({ x: 15, y: 5 });
  });

  it('keeps the leading edge where it was for any rotation', () => {
    for (const deg of [0, 30, 90, 180, -45]) {
      const c0 = { x: 12.34, y: -7.5 };
      const c1 = anchoredCenter(c0, -20, -26.37, deg);
      const a = leadingEdge(c0, -20, deg);
      const b = leadingEdge(c1, -26.37, deg);
      expect(b.x).toBeCloseTo(a.x, 1);
      expect(b.y).toBeCloseTo(a.y, 1);
    }
  });

  it('rounds to the hundredth of a mm and leaves a text that did not change alone', () => {
    expect(anchoredCenter({ x: 1, y: 2 }, -20, -20.123456, 0)).toEqual({ x: 1.12, y: 2 });
    expect(anchoredCenter({ x: 1, y: 2 }, -20, -20, 33)).toEqual({ x: 1, y: 2 });
  });
});
