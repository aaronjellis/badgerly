import React from 'react';
import { PREVIEW_TOL_MM, polyToSvgPath } from '../engine/geom';
import { buildShape, DEFAULT_SHAPE, SHAPE_OPTIONS } from '../engine/shapes';
import type { ShapeKind } from '../engine/shapes';

const W = 40;
const H = 24;

/** `hugText` has no outline of its own, so its thumbnail is a blob that follows a line of lettering. */
const HUG_BLOB = 'M-14 0C-14-6-8-8-4-6C-1-9 5-9 8-6C13-7 16-3 14 2C15 7 9 9 5 7C2 10-4 10-7 7C-12 7-14 4-14 0Z';

const paths = new Map<ShapeKind, string>();

/** The outline path of `kind` at 40 × 24 mm, centered on the origin, with the secondary sizes scaled to the thumbnail. */
function thumbPath(kind: ShapeKind): string {
  let d = paths.get(kind);
  if (d === undefined) {
    d =
      kind === 'hugText'
        ? HUG_BLOB
        : polyToSvgPath(
            buildShape({ ...DEFAULT_SHAPE, kind, widthMm: W, heightMm: H, cornerMm: 4, scallopMm: 2.5, depthMm: 3 }, PREVIEW_TOL_MM),
            2,
          );
    paths.set(kind, d);
  }
  return d;
}

interface ShapeThumbProps {
  kind: ShapeKind;
  selected: boolean;
  onClick: () => void;
}

/** One choice in the shape picker: the outline drawn at 40 × 24 px, named for screen readers and as a tooltip. */
export const ShapeThumb: React.FC<ShapeThumbProps> = ({ kind, selected, onClick }) => {
  const label = SHAPE_OPTIONS.find((o) => o.kind === kind)?.label ?? kind;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      className="shape-tile"
      data-ph-capture-attribute-shape={kind}
      onClick={onClick}
    >
      {/* A half-pixel margin keeps the outline's edge from clipping. */}
      <svg width={W} height={H} viewBox={`${-W / 2 - 0.5} ${-H / 2 - 0.5} ${W + 1} ${H + 1}`} aria-hidden="true">
        <path d={thumbPath(kind)} fillRule="evenodd" />
      </svg>
    </button>
  );
};
