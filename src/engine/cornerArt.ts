/**
 * Corner motifs for the inset border. Each one is drawn for the top-left corner in a 100 × 100
 * box as filled paths only (no strokes), with arms about 6 to 10 units thick, in the stepped,
 * geometric style of art deco frames. The border mirrors it into the other three corners.
 */
import { scale } from './geom';
import type { Poly } from './geom';
import { parseSvgShape } from './svgShape';

export interface CornerMotif {
  id: string;
  label: string;
  /** An SVG document with a `0 0 100 100` viewBox: the motif for the top-left corner. */
  svg: string;
}

/** The side of the motif box, in the units the paths are drawn in. */
const BOX = 100;

/** One `<path>` per piece, so pieces with opposite winding never cancel each other. */
const motif = (id: string, label: string, pieces: string[]): CornerMotif => ({
  id,
  label,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">${pieces.map((d) => `<path d="${d}"/>`).join('')}</svg>`,
});

export const CORNER_MOTIFS: CornerMotif[] = [
  // A quarter disc squared into the corner, an arc band, and five tapered rays at 22.5 degree steps around (3.5, 3.5).
  motif('deco-fan', 'Deco fan', [
    'M3.5 3.5H25.5A22 22 0 0 1 3.5 25.5Z',
    'M0 0H25.5V3.5H0ZM0 0H3.5V25.5H0Z',
    'M63.5 3.5A60 60 0 0 1 3.5 63.5L3.5 55.5A52 52 0 0 0 55.5 3.5Z',
    'M21.5 7L98.5 5.95L98.5 1.05L21.5 0Z',
    'M18.6 14.08L90.2 42.44L92.34 37.27L21.66 6.69Z',
    'M13.4 19.06L68.7 72.66L72.66 68.7L19.06 13.4Z',
    'M6.69 21.66L37.27 92.34L42.44 90.2L14.08 18.6Z',
    'M0 21.5L1.05 98.5L5.95 98.5L7 21.5Z',
  ]),
  // An outer L, and a staircase line inside it that is tied back to the L at both ends.
  motif('deco-step', 'Deco step', [
    'M0 0H100V8H8V100H0Z',
    'M20.5 40.5H25.5V72.5H20.5ZM20.5 40.5H33.5V45.5H20.5ZM28.5 28.5H33.5V45.5H28.5ZM28.5 28.5H45.5V33.5H28.5Z' +
      'M40.5 20.5H45.5V33.5H40.5ZM40.5 20.5H72.5V25.5H40.5ZM5.5 67.5H25.5V72.5H5.5ZM67.5 5.5H72.5V25.5H67.5Z',
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
 * The motif as a polygon set in mm, with its 100-unit box scaled to `sizeMm` and its corner at
 * the origin. Flattening tolerance is `tolMm` measured on the scaled result. A motif that does
 * not parse gives an empty polygon.
 */
export function motifPoly(svg: string, sizeMm: number, tolMm: number): Poly {
  const shape = parseSvgShape(svg, tolMm * (BOX / sizeMm));
  return shape ? scale(shape.poly, sizeMm / BOX) : [];
}
