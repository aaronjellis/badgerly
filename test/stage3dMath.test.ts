import { describe, expect, it } from 'vitest';
import { fitDistance, meshBounds, partsLiftMm, toSceneTriangles } from '../src/ui/stage3dMath';

/** (b − a) × (c − a) of the triangle that starts at `t` in a flat position array. */
const normal = (p: ArrayLike<number>, t = 0): [number, number, number] => {
  const u = [p[t + 3] - p[t], p[t + 4] - p[t + 1], p[t + 5] - p[t + 2]];
  const v = [p[t + 6] - p[t], p[t + 7] - p[t + 1], p[t + 8] - p[t + 2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};

describe('toSceneTriangles', () => {
  // A triangle on the bed whose normal is +z (up) in the printer frame.
  const up = [0, 0, 0, 4, 0, 0, 0, 3, 0];

  it('turns the printer frame into the scene: z up, y (the back) away from the viewer', () => {
    const out = toSceneTriangles([0, 0, 0, 1, 0, 0, 0, 2, 5], 0);
    // `+ 0` turns the −0 of a negated zero into 0, which `toEqual` tells apart.
    expect(Array.from(out, (v) => v + 0)).toEqual([0, 0, 0, 1, 0, 0, 0, 5, -2]);
  });

  it('keeps a face that looks up looking up', () => {
    const out = toSceneTriangles(up, 0);
    const [nx, ny, nz] = normal(out);
    expect(ny).toBeGreaterThan(0);
    expect(nx).toBeCloseTo(0);
    expect(nz).toBeCloseTo(0);
  });

  it('keeps a face that looks along +x looking along scene +x', () => {
    // Normal +x in the printer frame: (0,0,0) → (0,1,0) → (0,0,1).
    const out = toSceneTriangles([0, 0, 0, 0, 1, 0, 0, 0, 1], 0);
    const [nx, ny, nz] = normal(out);
    expect(nx).toBeGreaterThan(0);
    expect(ny).toBeCloseTo(0);
    expect(nz).toBeCloseTo(0);
  });

  it('lifts every vertex by the offset', () => {
    const out = toSceneTriangles(up, 2.5);
    expect(out[1]).toBeCloseTo(2.5);
    expect(out[4]).toBeCloseTo(2.5);
    expect(out[7]).toBeCloseTo(2.5);
  });

  it('drops a trailing partial triangle', () => {
    expect(toSceneTriangles([...up, 1, 2], 0)).toHaveLength(9);
  });
});

describe('meshBounds', () => {
  it('spans the scene positions', () => {
    const b = meshBounds(new Float32Array([0, 0, 0, 4, 1, 0, 0, 3, 5]));
    expect(b.center).toEqual({ x: 2, y: 1.5, z: 2.5 });
    expect(b.size).toEqual({ x: 4, y: 3, z: 5 });
  });

  it('is a point at the origin for no triangles', () => {
    const b = meshBounds(new Float32Array());
    expect(b.size).toEqual({ x: 0, y: 0, z: 0 });
    expect(b.center).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('fitDistance', () => {
  it('puts a bounding sphere just inside the narrower view angle', () => {
    // A 60° view, square: the sphere of radius r fits at r / sin 30° = 2r, plus the margin.
    const d = fitDistance({ x: 6, y: 8, z: 0 }, 60, 1);
    expect(d).toBeCloseTo((5 / Math.sin(Math.PI / 6)) * 1.15);
  });

  it('backs off for a narrow stage', () => {
    const size = { x: 100, y: 3, z: 60 };
    expect(fitDistance(size, 40, 0.5)).toBeGreaterThan(fitDistance(size, 40, 2));
  });

  it('grows with the model', () => {
    expect(fitDistance({ x: 200, y: 3, z: 120 }, 40, 1.5)).toBeGreaterThan(fitDistance({ x: 100, y: 3, z: 60 }, 40, 1.5));
  });

  it('stays positive for an empty model', () => {
    expect(fitDistance({ x: 0, y: 0, z: 0 }, 40, 1)).toBeGreaterThan(0);
  });
});

describe('partsLiftMm', () => {
  it('seats the parts on the recess floor', () => {
    expect(partsLiftMm(3, 0.6)).toBeCloseTo(2.4);
  });

  it('never goes below the bed', () => {
    expect(partsLiftMm(1, 4)).toBe(0);
  });
});
