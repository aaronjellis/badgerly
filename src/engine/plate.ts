/**
 * The plate body of a 3D badge: the outline capped on the bed, walled up to where the edge
 * treatment starts, and lofted ring by ring through the edge profile to the flat top. The top
 * cap is left to the caller, which closes the last ring (`flat`) with the plate top and its
 * features.
 */
import { difference, offset, outerCount } from './geom';
import type { Poly } from './geom';
import { capMesh, edgeProfile, loftMesh, RingMismatchError, wallMesh } from './mesh';
import type { Mesh } from './mesh';
import type { ReliefConfig } from './model';

/** The tallest slab in a span whose rings change shape. */
const SLAB_MM = 0.05;
/**
 * The least inset between two slabs' rings, so Clipper's rounding never lets a ring touch the
 * one below it; a span with less inset per slab uses fewer, taller slabs.
 */
const MIN_SLAB_INSET_MM = 0.005;

const sameTopology = (a: Poly, b: Poly) => a.length === b.length && outerCount(a) === outerCount(b);

/**
 * Fills a span whose rings cannot be lofted (a contour splits off or disappears) with slabs:
 * each a vertical wall on its ring and an annular cap facing up between that ring and the next.
 * Each ring is the outline pulled in by its own inset at a tolerance of at most half the inset
 * between slabs. An inset outline is the outline minus a band of bars and inscribed discs, and
 * each band then lies inside the next with room to spare, so each ring sits strictly inside the
 * one below it and the annulus's contours are exactly the two rings. (Pulling in the ring below
 * instead would chain the offsets, which piles up near-duplicate points until Clipper stalls.)
 * Returns the span's top ring, which stands in for the offset at `insetTo`.
 */
function slabs(
  meshes: Mesh[], outline: Poly, ring: Poly, z: number, insetFrom: number, insetTo: number, zTop: number, tolMm: number
): Poly {
  const inset = insetTo - insetFrom;
  const n = Math.max(1, Math.min(Math.ceil((zTop - z) / SLAB_MM - 1e-9), Math.floor(inset / MIN_SLAB_INSET_MM)));
  const tol = Math.min(tolMm, inset / n / 2);
  let lower = ring;
  let z0 = z;
  for (let j = 1; j <= n && lower.length > 0; j++) {
    const z1 = j === n ? zTop : z + ((zTop - z) * j) / n;
    const upper = offset(outline, -(insetFrom + (inset * j) / n), tol);
    meshes.push(wallMesh(lower, z0, z1));
    meshes.push(capMesh(difference(lower, upper), z1, true));
    lower = upper;
    z0 = z1;
  }
  return lower;
}

/**
 * The body from the bed to the flat top, open at the top along `flat`, the last ring. With no
 * edge, the wall rises to `plateMm` and `flat` is the outline. Otherwise the wall rises to
 * `plateMm − edgeMm` and each profile step is a loft from the ring below to
 * `offset(outline, −insetMm)`, ending on `offset(outline, −edgeMm)`; a step whose rings differ in
 * contour count becomes slabs, whose top ring then stands in for that offset.
 */
export function plateBody(outline: Poly, relief: ReliefConfig, tolMm: number): { meshes: Mesh[]; flat: Poly } {
  const edgeMm = relief.edge === 'none' ? 0 : relief.edgeMm;
  const profile = edgeProfile(relief.edge, edgeMm);
  const wallTop = profile.length > 1 ? relief.plateMm - edgeMm : relief.plateMm;
  const meshes = [capMesh(outline, 0, false), wallMesh(outline, 0, wallTop)];
  let ring = outline;
  let z = wallTop;
  // Profile entry 0 is the outline at the wall top, so lofting starts from entry 1.
  for (let k = 1; k < profile.length && ring.length > 0; k++) {
    const last = k === profile.length - 1;
    const zk = last ? relief.plateMm : wallTop + profile[k].riseMm;
    const target = offset(outline, -profile[k].insetMm, tolMm);
    let lofted = false;
    if (sameTopology(ring, target)) {
      try {
        meshes.push(loftMesh(ring, z, target, zk));
        lofted = true;
      } catch (err) {
        if (!(err instanceof RingMismatchError)) throw err;
      }
    }
    ring = lofted ? target : slabs(meshes, outline, ring, z, profile[k - 1].insetMm, profile[k].insetMm, zk, tolMm);
    z = zk;
  }
  return { meshes, flat: ring };
}
