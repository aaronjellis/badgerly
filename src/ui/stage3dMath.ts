/** Pure helpers for the 3D stage: the badge's mesh frame to the scene's, the box around it, and the camera's fit. */

/** The room left around the model when the camera fits it. */
const FIT_MARGIN = 1.15;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * A mesh from the engine as scene triangles. The engine's frame has x and y as badge mm (y down, as in
 * the 2D view) and z up from the bed. The scene is y-up with the badge's top edge away from the viewer,
 * so scene (x, y, z) is the mesh's (x, z, y): a reflection, which also turns a badge that would read
 * mirrored from above into one that reads upright. The reflection flips every triangle's winding, so
 * the second and third vertices swap to keep it outward. `liftMm` raises the whole mesh.
 */
export function toSceneTriangles(positions: ArrayLike<number>, liftMm: number): Float32Array {
  const triangles = Math.floor(positions.length / 9);
  const out = new Float32Array(triangles * 9);
  const order = [0, 2, 1];
  for (let t = 0; t < triangles; t++) {
    for (let slot = 0; slot < 3; slot++) {
      const from = t * 9 + order[slot] * 3;
      const to = t * 9 + slot * 3;
      out[to] = positions[from];
      out[to + 1] = positions[from + 2] + liftMm;
      out[to + 2] = positions[from + 1];
    }
  }
  return out;
}

/** The box around scene positions: its middle and its size on each axis. Zero for no points. */
export function meshBounds(positions: ArrayLike<number>): { center: Vec3; size: Vec3 } {
  if (positions.length < 3) return { center: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } };
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], positions[i + k]);
      hi[k] = Math.max(hi[k], positions[i + k]);
    }
  }
  return {
    center: { x: (lo[0] + hi[0]) / 2, y: (lo[1] + hi[1]) / 2, z: (lo[2] + hi[2]) / 2 },
    size: { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2] },
  };
}

/**
 * How far from its middle a camera must stand to see a model whole from any side: the model's bounding
 * sphere inside the narrower of the camera's two view angles, plus a margin. `fovDeg` is the vertical angle.
 */
export function fitDistance(size: Vec3, fovDeg: number, aspect: number): number {
  const radius = Math.max(Math.hypot(size.x, size.y, size.z) / 2, 0.5);
  const half = (fovDeg * Math.PI) / 360;
  const halfWide = Math.atan(Math.tan(half) * Math.max(aspect, 0.01));
  return (radius / Math.sin(Math.min(half, halfWide))) * FIT_MARGIN;
}

/** How far the split parts rise from the bed to sit in their recess: the plate less the recess depth. */
export function partsLiftMm(plateMm: number, recessMm: number): number {
  return Math.max(0, plateMm - recessMm);
}
