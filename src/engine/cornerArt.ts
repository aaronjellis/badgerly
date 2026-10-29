/**
 * Corner motifs for the inset border. Each one is drawn for the top-left corner in a 100 × 100
 * box as filled paths only (no strokes), with arms about 6 to 10 units thick, in the stepped,
 * geometric style of art deco frames. The border mirrors it into the other three corners.
 */
import { scale, translate } from './geom';
import type { Poly } from './geom';
import { parseSvgShape, svgViewBox } from './svgShape';

export interface CornerMotif {
  id: string;
  label: string;
  /** An SVG document with a `0 0 100 100` viewBox: the motif for the top-left corner. */
  svg: string;
}

/** The side of the catalog motifs' box, in the units their paths are drawn in. */
const BOX = 100;

/** One `<path>` per piece, so pieces with opposite winding never cancel each other. */
const motif = (id: string, label: string, pieces: string[]): CornerMotif => ({
  id,
  label,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">${pieces.map((d) => `<path d="${d}"/>`).join('')}</svg>`,
});

export const CORNER_MOTIFS: CornerMotif[] = [
  // A quarter disc squared into the corner, an arc band, and four tapered rays at 30 degree steps
  // around (4, 4). The bars are 8 units wide; the rays taper to 6.4 at the tips.
  motif('deco-fan', 'Deco fan', [
    'M4 4H26A22 22 0 0 1 4 26Z',
    'M0 0H26V4H0ZM0 0H4V26H0Z',
    'M64 4A60 60 0 0 1 4 64L4 56A52 52 0 0 0 56 4Z',
    'M22 8L99 7.2L99 0.8L22 0Z',
    'M17.59 16.46L84.67 54.27L87.87 48.73L21.59 9.54Z',
    'M9.54 21.59L48.73 87.87L54.27 84.67L16.46 17.59Z',
    'M0 22L0.8 99L7.2 99L8 22Z',
  ]),
  // An outer L, and a staircase line inside it that is tied back to the L at both ends. The lines
  // are 6.5 units wide.
  motif('deco-step', 'Deco step', [
    'M0 0H100V8H8V100H0Z',
    'M19.75 44.75H26.25V75.25H19.75ZM19.75 44.75H38.25V51.25H19.75ZM31.75 32.75H38.25V51.25H31.75ZM31.75 32.75H50.25V39.25H31.75Z' +
      'M43.75 20.75H50.25V39.25H43.75ZM43.75 20.75H77.25V27.25H43.75ZM4.75 68.75H26.25V75.25H4.75ZM70.75 4.75H77.25V27.25H70.75Z',
  ]),
  // An L with a serif at each end and a ring in the bend.
  motif('bracket', 'Bracket', [
    'M0 0H92V8H8V92H0Z',
    'M92 0H100V20H92ZM0 92H20V100H0Z',
    'M34 20A14 14 0 1 1 6 20A14 14 0 1 1 34 20ZM26 20A6 6 0 1 0 14 20A6 6 0 1 0 26 20Z',
  ]),
  motif('plain-l', 'Plain L', ['M0 0H100V8H8V100H0Z']),
  // A tail along the top that winds into a spiral, ending in a ball.
  motif('curl', 'Curl', [
    'M30 0H100V8H30Z',
    'M30 0A30 30 0 0 0 30 60L30 52A22 22 0 0 1 30 8Z',
    'M30 60A22 22 0 0 0 30 16L30 24A14 14 0 0 1 30 52Z',
    'M30 16A14 14 0 0 0 30 44L30 36A6 6 0 0 1 30 24Z',
    'M36 40A6 6 0 1 1 24 40A6 6 0 1 1 36 40Z',
  ]),
  // A cluster of four discs, the largest in the corner.
  motif('dots', 'Dots', [
    'M20 10A10 10 0 1 1 0 10A10 10 0 1 1 20 10Z',
    'M41 8A7 7 0 1 1 27 8A7 7 0 1 1 41 8Z',
    'M15 34A7 7 0 1 1 1 34A7 7 0 1 1 15 34Z',
    'M33 28A5 5 0 1 1 23 28A5 5 0 1 1 33 28Z',
  ]),
];

/**
 * The motif as a polygon set in mm, with the longer side of its viewBox scaled to `sizeMm` and the
 * viewBox's top-left corner at the origin, so an uploaded motif drawn in any box (24 units, 512,
 * or one that starts away from 0 0) comes out the asked size. Flattening tolerance is `tolMm`
 * measured on the scaled result. A motif that does not parse gives an empty polygon.
 */
export function motifPoly(svg: string, sizeMm: number, tolMm: number): Poly {
  const box = svgViewBox(svg);
  if (!box) return [];
  const side = Math.max(box.w, box.h);
  const shape = parseSvgShape(svg, tolMm * (side / sizeMm));
  return shape ? scale(translate(shape.poly, -box.x, -box.y), sizeMm / side) : [];
}
