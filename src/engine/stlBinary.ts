/** Binary STL serialization: little-endian, 84-byte preamble, 50 bytes per triangle. */
import type { Mesh } from './mesh';

const HEADER = 'Badgerly';

export function meshToBinaryStl(mesh: Mesh): ArrayBuffer {
  const p = mesh.positions;
  const count = Math.floor(p.length / 9);
  const buffer = new ArrayBuffer(84 + 50 * count);
  const view = new DataView(buffer);
  // The rest of the 80-byte header stays zero.
  for (let k = 0; k < HEADER.length; k++) view.setUint8(k, HEADER.charCodeAt(k));
  view.setUint32(80, count, true);
  let off = 84;
  for (let t = 0; t < count * 9; t += 9) {
    // Normal from the winding: (b − a) × (c − a), normalized; zero for a degenerate triangle.
    const ux = p[t + 3] - p[t];
    const uy = p[t + 4] - p[t + 1];
    const uz = p[t + 5] - p[t + 2];
    const vx = p[t + 6] - p[t];
    const vy = p[t + 7] - p[t + 1];
    const vz = p[t + 8] - p[t + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    view.setFloat32(off, nx, true);
    view.setFloat32(off + 4, ny, true);
    view.setFloat32(off + 8, nz, true);
    off += 12;
    for (let k = 0; k < 9; k++) {
      view.setFloat32(off, p[t + k], true);
      off += 4;
    }
    view.setUint16(off, 0, true);
    off += 2;
  }
  return buffer;
}
