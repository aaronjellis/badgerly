import type { DisplayUnit } from '../../engine/model';

/** A length in mm to at most three decimals, with no trailing zeros. */
const fmt = (n: number): string => Number(n.toFixed(3)).toString();

/** The unit helpers every section reads. */
export function unitHelpers(displayUnit: DisplayUnit) {
  const isInch = displayUnit === 'in';
  const uLabel = isInch ? 'in' : 'mm';
  const fmtDim = (mm: number, inDecimals = 2): string => (isInch ? (mm / 25.4).toFixed(inDecimals) : fmt(mm));
  return { isInch, uLabel, fmtDim };
}
