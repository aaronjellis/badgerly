/** The 3D badge, built at preview tolerance whenever the project is in 3D print mode. */
import { useDeferredValue, useMemo } from 'react';
import { PREVIEW_TOL_MM } from '../engine/geom';
import type { BadgeProject } from '../engine/model';
import { buildRelief } from '../engine/relief';
import type { ReliefResult } from '../engine/relief';
import type { ResolvedBadge } from '../engine/resolve';

/**
 * Null outside 3D mode, and for a badge the builder cannot solidify (the error is logged), so a bad
 * badge loses its 3D preview and nothing else. The project is an input along with `resolved` because
 * the elements' roles and the border's relief are not in `resolved`. The build takes about 0.1 s, so it
 * runs after the urgent update: a drag on the 2D stage keeps its pace and the 3D badge follows.
 */
export function useRelief(project: BadgeProject, resolved: ResolvedBadge): ReliefResult | null {
  const input = useMemo(() => ({ project, resolved }), [project, resolved]);
  const later = useDeferredValue(input);
  const print3d = later.project.mode === 'print3d';
  const built = useMemo(() => {
    if (!print3d) return null;
    try {
      return buildRelief(later.project, later.resolved, PREVIEW_TOL_MM);
    } catch (error) {
      console.error('The 3D badge could not be built.', error);
      return null;
    }
  }, [print3d, later]);
  // The deferred value can trail a switch back to laser by a render.
  return project.mode === 'print3d' ? built : null;
}
