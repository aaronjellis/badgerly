/** The display unit, remembered between visits so a new project starts in the unit last used. */
import { defaultProject } from '../engine/model';
import type { BadgeProject, DisplayUnit } from '../engine/model';

export const UNIT_KEY = 'badgerly.unit';

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The unit last used, or null when none is stored or storage is blocked. Never throws. */
export function readUnit(storage: Storage | undefined = defaultStorage()): DisplayUnit | null {
  try {
    const unit = storage?.getItem(UNIT_KEY);
    return unit === 'mm' || unit === 'in' ? unit : null;
  } catch {
    return null;
  }
}

/** Remembers the unit. Never throws: blocked storage only means the next visit starts in inches. */
export function saveUnit(unit: DisplayUnit, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(UNIT_KEY, unit);
  } catch {
    // Storage can be full or blocked; the unit still holds for this visit.
  }
}

/** A fresh project in the unit last used. */
export function newProject(storage: Storage | undefined = defaultStorage()): BadgeProject {
  const project = defaultProject();
  return { ...project, unit: readUnit(storage) ?? project.unit };
}
