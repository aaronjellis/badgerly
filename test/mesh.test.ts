import { describe, expect, it } from 'vitest';
import { difference, offset, union } from '../src/engine/geom';
import type { Poly } from '../src/engine/geom';
import {
  RingMismatchError,
  capMesh,
  edgeProfile,
  isClosed,
  loftMesh,
  mergeMeshes,
  signedVolume,
  wallMesh,
} from '../src/engine/mesh';
import { meshToBinaryStl } from '../src/engine/stlBinary';

const sq = (s: number): Poly => [[{x:-s/2,y:-s/2},{x:s/2,y:-s/2},{x:s/2,y:s/2},{x:-s/2,y:s/2}]];
const sqAt = (s: number, cx: number, cy: number): Poly => [[{x:cx-s/2,y:cy-s/2},{x:cx+s/2,y:cy-s/2},{x:cx+s/2,y:cy+s/2},{x:cx-s/2,y:cy+s/2}]];

describe('mesh', () => {
  it('a capped extrusion is closed with the right volume', () => {
    const m = mergeMeshes([capMesh(sq(10), 0, false), wallMesh(sq(10), 0, 3), capMesh(sq(10), 3, true)]);
    expect(isClosed(m)).toBe(true);
    expect(signedVolume(m)).toBeCloseTo(300, 3);
  });
  it('a loft between a square and its inset closes a frustum', () => {
    const top = offset(sq(10), -2, 0.01);
    const m = mergeMeshes([capMesh(sq(10), 0, false), loftMesh(sq(10), 0, top, 2), capMesh(top, 2, true)]);
    expect(isClosed(m)).toBe(true);
    expect(signedVolume(m)).toBeGreaterThan(100); expect(signedVolume(m)).toBeLessThan(200);
  });
  it('a loft with a hole ring stays closed', () => {
    const ring = difference(sq(10), sq(4)); const inner = offset(ring, -1, 0.01);
    const m = mergeMeshes([capMesh(ring, 0, false), loftMesh(ring, 0, inner, 1), capMesh(inner, 1, true)]);
    expect(isClosed(m)).toBe(true);
  });
  it('loft refuses rings of different counts', () => {
    expect(() => loftMesh(sq(10), 0, union([sq(2), [[{x:3,y:3},{x:4,y:3},{x:4,y:4}]]]), 1)).toThrow(RingMismatchError);
  });
  it('fillet profile steps at most 0.02 mm and ends at the fillet size', () => {
    const prof = edgeProfile('fillet', 2);
    expect(prof[0]).toEqual({ insetMm: 0, riseMm: 0 });
    expect(prof[prof.length - 1].insetMm).toBeCloseTo(2); expect(prof[prof.length - 1].riseMm).toBeCloseTo(2);
    expect(prof.length).toBe(7);
  });
  it('binary STL has 84 + 50·n bytes', () => {
    const m = capMesh(sq(10), 0, true);
    expect(meshToBinaryStl(m).byteLength).toBe(84 + 50 * (m.positions.length / 9));
  });

  it('a loft between a rounded square and its inset (different point counts) is closed', () => {
    const lower = offset(sq(6), 2, 0.01);
    // The geometric inset by 1 mm (radius-1 corners), sampled finer so the point counts differ.
    const upper = offset(sq(6), 1, 0.002);
    expect(lower[0].length).not.toBe(upper[0].length);
    const m = mergeMeshes([capMesh(lower, 0, false), loftMesh(lower, 0, upper, 1), capMesh(upper, 1, true)]);
    expect(isClosed(m)).toBe(true);
    expect(signedVolume(m)).toBeGreaterThan(0);
  });
  it('a walled ring with a hole, capped, is closed with the ring volume', () => {
    const ring = difference(sq(10), sq(4));
    const m = mergeMeshes([capMesh(ring, 0, false), wallMesh(ring, 0, 3), capMesh(ring, 3, true)]);
    expect(isClosed(m)).toBe(true);
    expect(signedVolume(m)).toBeCloseTo((100 - 16) * 3, 3);
  });
  it('caps several islands, each with its own hole', () => {
    const poly = union([difference(sqAt(10, 0, 0), sqAt(4, 0, 0)), difference(sqAt(10, 20, 0), sqAt(4, 20, 0))]);
    const m = mergeMeshes([capMesh(poly, 0, false), wallMesh(poly, 0, 2), capMesh(poly, 2, true)]);
    expect(isClosed(m)).toBe(true);
    expect(signedVolume(m)).toBeCloseTo(2 * (100 - 16) * 2, 3);
  });
  it('stacks a wall and a loft into one closed solid', () => {
    const top = offset(sq(10), -1, 0.01);
    const m = mergeMeshes([
      capMesh(sq(10), 0, false),
      wallMesh(sq(10), 0, 2),
      loftMesh(sq(10), 2, top, 3),
      capMesh(top, 3, true),
    ]);
    expect(isClosed(m)).toBe(true);
    expect(signedVolume(m)).toBeGreaterThan(200 + 64);
    expect(signedVolume(m)).toBeLessThan(200 + 100);
  });
  it('isClosed is false for a single open quad', () => {
    const quad = { positions: [0,0,0, 1,0,0, 1,1,0,  0,0,0, 1,1,0, 0,1,0] };
    expect(isClosed(quad)).toBe(false);
  });
  it('chamfer and none profiles', () => {
    expect(edgeProfile('chamfer', 1.5)).toEqual([{ insetMm: 0, riseMm: 0 }, { insetMm: 1.5, riseMm: 1.5 }]);
    expect(edgeProfile('none', 1.5)).toEqual([{ insetMm: 0, riseMm: 0 }]);
  });
  it('binary STL carries the header, triangle count, and a computed normal', () => {
    const m = capMesh(sq(10), 0, true);
    const n = m.positions.length / 9;
    const view = new DataView(meshToBinaryStl(m));
    const header = new TextDecoder().decode(new Uint8Array(view.buffer, 0, 8));
    expect(header).toBe('Badgerly');
    expect(view.getUint32(80, true)).toBe(n);
    expect(view.getFloat32(84 + 8, true)).toBeCloseTo(1);
    expect(view.getUint16(84 + 48, true)).toBe(0);
  });
});
