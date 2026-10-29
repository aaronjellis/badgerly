import type { BadgeElement, BadgeProject } from '../../engine/model';
import { BACKING_ID } from '../../engine/model';

const LASER_LABEL = { engrave: 'Engrave', score: 'Score', cutout: 'Cut out' } as const;

/** The short name of what an element becomes in the current mode, for its chip in the list. */
export function roleLabel(project: BadgeProject, el: BadgeElement): string {
  if (project.mode === 'print3d') return el.role.relief === 'deboss' ? 'Sunk' : 'Raised';
  if (project.laserVariant === 'stacked') {
    const layer = project.layers.find((l) => l.id === (el.role.layerId ?? BACKING_ID)) ?? project.layers[0];
    return layer?.name ?? 'Backing';
  }
  if (project.laserVariant === 'printcut' && el.role.printColor) return 'Print';
  return LASER_LABEL[el.role.laser];
}
