/** What counts as saved, and when a badge differs from it: pure, so the transitions test without a browser. */
import type { BadgeProject } from '../engine/model';

/** The project as last saved, opened or started: the object itself, and its content as JSON. */
export interface SavedState {
  project: BadgeProject;
  snapshot: string;
}

/** The project's content as JSON. A saved file stamps its save time, so it is not what unsaved compares. */
export const snapshotOf = (project: BadgeProject): string => JSON.stringify(project);

/** The project, taken as the saved one. */
export const savedFrom = (project: BadgeProject): SavedState => ({ project, snapshot: snapshotOf(project) });

/** Whether the project differs from what was saved. The same object needs no comparing. */
export function isUnsaved(project: BadgeProject, saved: SavedState): boolean {
  return project !== saved.project && snapshotOf(project) !== saved.snapshot;
}

/** The editor's project beside what was saved. */
export interface FileState {
  project: BadgeProject;
  saved: SavedState;
}

/** What happens to the saved state: an edit changes the project; a save keeps it; opening or starting replaces both. */
export type FileEvent =
  | { type: 'edit'; project: BadgeProject }
  | { type: 'save' }
  | { type: 'open'; project: BadgeProject }
  | { type: 'new'; project: BadgeProject };

export const initialFileState = (project: BadgeProject): FileState => ({ project, saved: savedFrom(project) });

export function stepFile(state: FileState, event: FileEvent): FileState {
  switch (event.type) {
    case 'edit':
      return { ...state, project: event.project };
    case 'save':
      return { ...state, saved: savedFrom(state.project) };
    case 'open':
    case 'new':
      return initialFileState(event.project);
  }
}
