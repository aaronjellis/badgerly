/**
 * SVG path data to flattened polylines, in the path's own units. Every command is read, absolute
 * and relative; curves and arcs flatten so no chord is further than the tolerance from the curve.
 */
import type { Pt } from './geom';

/** One number as SVG writes it; global, so `matchAll` works, and copied into a sticky pattern to scan. */
export const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

const MAX_SEGMENTS = 4096;

/** Segments needed for a chord bound: a quadratic strays at most |p0 − 2p1 + p2| / (4n²). */
function quadSegments(second: number, tol: number): number {
  return Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(Math.sqrt(second / (4 * tol)))));
}

/** A cubic strays at most 3 · max|second difference| / (4n²). */
function cubicSegments(second: number, tol: number): number {
  return Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(Math.sqrt((3 * second) / (4 * tol)))));
}

/** Reads path data one token at a time, so compact forms such as `1-2`, `.5.5` and `a1 1 0 00 2 0` work. */
class Scanner {
  private i = 0;
  constructor(private readonly s: string) {}

  private skipSeparators() {
    while (this.i < this.s.length && /[\s,]/.test(this.s[this.i])) this.i++;
  }

  /** The next command letter, or null when the next token is not one. */
  command(): string | null {
    this.skipSeparators();
    const c = this.s[this.i];
    if (c !== undefined && 'MmLlHhVvCcSsQqTtAaZz'.includes(c)) {
      this.i++;
      return c;
    }
    return null;
  }

  atNumber(): boolean {
    this.skipSeparators();
    return /[-+.\d]/.test(this.s[this.i] ?? '');
  }

  number(): number | null {
    this.skipSeparators();
    const re = new RegExp(NUMBER.source, 'y');
    re.lastIndex = this.i;
    const m = re.exec(this.s);
    if (!m) return null;
    this.i = re.lastIndex;
    return Number(m[0]);
  }

  /** An arc flag is a single 0 or 1 character, with or without a separator after it. */
  flag(): 0 | 1 | null {
    this.skipSeparators();
    const c = this.s[this.i];
    if (c !== '0' && c !== '1') return null;
    this.i++;
    return c === '1' ? 1 : 0;
  }

  /** `count` numbers, or null if the data ends first. */
  numbers(count: number): number[] | null {
    const out: number[] = [];
    for (let k = 0; k < count; k++) {
      const n = this.number();
      if (n === null) return null;
      out.push(n);
    }
    return out;
  }
}

/**
 * Points along an SVG arc from (`x1`, `y1`) to (`x2`, `y2`), ending exactly at the endpoint, with
 * no chord further than `tol` from the arc. Uses the endpoint-to-center conversion of the SVG
 * implementation notes (F.6.5).
 */
function arcPoints(x1: number, y1: number, rxIn: number, ryIn: number, rotDeg: number, large: number, sweep: number, x2: number, y2: number, tol: number): Pt[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if ((x1 === x2 && y1 === y2) || rx === 0 || ry === 0) return [{ x: x2, y: y2 }];
  const phi = (rotDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const [dx, dy] = [(x1 - x2) / 2, (y1 - y2) / 2];
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const theta1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
  const theta2 = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx);
  let dTheta = theta2 - theta1;
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  // The ellipse is a circle of radius max(rx, ry) squeezed by an affine map, which never moves a
  // chord further from its arc than that circle's sagitta does.
  const step = 2 * Math.acos(Math.min(1, Math.max(-1, 1 - tol / Math.max(rx, ry))));
  const n = Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(Math.abs(dTheta) / Math.max(step, 1e-6))));
  const out: Pt[] = [];
  for (let k = 1; k < n; k++) {
    const t = theta1 + (dTheta * k) / n;
    const [ex, ey] = [rx * Math.cos(t), ry * Math.sin(t)];
    out.push({ x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy });
  }
  out.push({ x: x2, y: y2 });
  return out;
}

/**
 * Path data as flattened subpaths, every command absolute or relative. Data that turns malformed
 * ends the path there, keeping what came before, as SVG renderers do.
 */
export function flattenPath(d: string, tol: number): Pt[][] {
  const subpaths: Pt[][] = [];
  const sc = new Scanner(d);
  let cur: Pt[] | null = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // The previous curve's last control point, for S and T to reflect.
  const curve: { ctrl: Pt | null; kind: 'C' | 'Q' | null } = { ctrl: null, kind: null };
  let cmd = '';

  const lineTo = (px: number, py: number) => {
    if (!cur) {
      cur = [{ x, y }];
      subpaths.push(cur);
    }
    const last = cur[cur.length - 1];
    if (last.x !== px || last.y !== py) cur.push({ x: px, y: py });
    x = px;
    y = py;
  };
  const quad = (x1: number, y1: number, px: number, py: number) => {
    const n = quadSegments(Math.hypot(x - 2 * x1 + px, y - 2 * y1 + py), tol);
    const [x0, y0] = [x, y];
    for (let k = 1; k <= n; k++) {
      const [t, u] = [k / n, 1 - k / n];
      lineTo(u * u * x0 + 2 * u * t * x1 + t * t * px, u * u * y0 + 2 * u * t * y1 + t * t * py);
    }
    curve.ctrl = { x: x1, y: y1 };
    curve.kind = 'Q';
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, px: number, py: number) => {
    const second = Math.max(Math.hypot(x - 2 * x1 + x2, y - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + px, y1 - 2 * y2 + py));
    const n = cubicSegments(second, tol);
    const [x0, y0] = [x, y];
    for (let k = 1; k <= n; k++) {
      const [t, u] = [k / n, 1 - k / n];
      lineTo(
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * px,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * py
      );
    }
    curve.ctrl = { x: x2, y: y2 };
    curve.kind = 'C';
  };

  for (;;) {
    const letter = sc.command();
    if (letter) cmd = letter;
    else if (!cmd || !sc.atNumber() || cmd === 'Z' || cmd === 'z') break;
    // A relative command measures from the current point.
    const rel = cmd === cmd.toLowerCase();
    const [ox, oy] = rel ? [x, y] : [0, 0];
    const upper = cmd.toUpperCase();
    if (upper === 'Z') {
      if (cur) {
        x = startX;
        y = startY;
        cur = null;
      }
      curve.ctrl = null;
      curve.kind = null;
      continue;
    }
    if (!cur && !subpaths.length && upper !== 'M') break;
    const wasCtrl = curve.ctrl;
    const wasKind = curve.kind;
    curve.ctrl = null;
    curve.kind = null;
    if (upper === 'M') {
      const v = sc.numbers(2);
      if (!v) break;
      [x, y] = [ox + v[0], oy + v[1]];
      [startX, startY] = [x, y];
      cur = [{ x, y }];
      subpaths.push(cur);
      cmd = rel ? 'l' : 'L';
    } else if (upper === 'L') {
      const v = sc.numbers(2);
      if (!v) break;
      lineTo(ox + v[0], oy + v[1]);
    } else if (upper === 'H') {
      const v = sc.numbers(1);
      if (!v) break;
      lineTo(ox + v[0], y);
    } else if (upper === 'V') {
      const v = sc.numbers(1);
      if (!v) break;
      lineTo(x, oy + v[0]);
    } else if (upper === 'C') {
      const v = sc.numbers(6);
      if (!v) break;
      cubic(ox + v[0], oy + v[1], ox + v[2], oy + v[3], ox + v[4], oy + v[5]);
    } else if (upper === 'S') {
      const v = sc.numbers(4);
      if (!v) break;
      const first = wasKind === 'C' && wasCtrl ? { x: 2 * x - wasCtrl.x, y: 2 * y - wasCtrl.y } : { x, y };
      cubic(first.x, first.y, ox + v[0], oy + v[1], ox + v[2], oy + v[3]);
    } else if (upper === 'Q') {
      const v = sc.numbers(4);
      if (!v) break;
      quad(ox + v[0], oy + v[1], ox + v[2], oy + v[3]);
    } else if (upper === 'T') {
      const v = sc.numbers(2);
      if (!v) break;
      const c = wasKind === 'Q' && wasCtrl ? { x: 2 * x - wasCtrl.x, y: 2 * y - wasCtrl.y } : { x, y };
      quad(c.x, c.y, ox + v[0], oy + v[1]);
    } else {
      const radii = sc.numbers(3);
      const large = radii ? sc.flag() : null;
      const sweep = large === null ? null : sc.flag();
      const end = sweep === null ? null : sc.numbers(2);
      if (!radii || large === null || sweep === null || !end) break;
      const [px, py] = [ox + end[0], oy + end[1]];
      if (!cur) lineTo(x, y);
      for (const p of arcPoints(x, y, radii[0], radii[1], radii[2], large, sweep, px, py, tol)) lineTo(p.x, p.y);
    }
  }
  return subpaths;
}
