/** New, Open and Save for `.badge` files, and whether the badge has changes the file doesn't. */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, Dispatch, RefObject } from 'react';
import { defaultProject } from '../engine/model';
import type { BadgeProject } from '../engine/model';
import { parseProject, PROJECT_EXTENSION, ProjectFileError, serializeProject } from '../engine/projectFile';
import { triggerDownload } from '../ui/download';
import { projectSlug } from './exportFlow';
import type { Action } from './reducer';

/** The project as last saved, opened or started: the object itself, and its content as JSON. */
export interface SavedState {
  project: BadgeProject;
  snapshot: string;
}

/** The project's content as JSON. A saved file stamps its save time, so it is not what unsaved compares. */
export const snapshotOf = (project: BadgeProject): string => JSON.stringify(project);

/** Whether the project differs from what was saved. The same object needs no comparing. */
export function isUnsaved(project: BadgeProject, saved: SavedState): boolean {
  return project !== saved.project && snapshotOf(project) !== saved.snapshot;
}

interface Options {
  project: BadgeProject;
  dispatch: Dispatch<Action>;
  clearSelection: () => void;
  /** Where Open reports a file it could not read. */
  setStatus: (message: string | null) => void;
}

export interface ProjectFile {
  unsaved: boolean;
  onNew: () => void;
  /** Opens the file picker. */
  onOpen: () => void;
  onSave: () => void;
  /** Props for the hidden `<input type="file">` that Open clicks. */
  inputRef: RefObject<HTMLInputElement>;
  onFileChosen: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function useProjectFile({ project, dispatch, clearSelection, setStatus }: Options): ProjectFile {
  // The project the editor starts with counts as saved, so it is not unsaved until edited.
  const [saved, setSaved] = useState<SavedState>(() => ({ project, snapshot: snapshotOf(project) }));
  const inputRef = useRef<HTMLInputElement>(null);

  // Saved and unsaved JSON-compare only when the project object has changed.
  const unsaved = useMemo(() => isUnsaved(project, saved), [project, saved]);

  const load = useCallback(
    (next: BadgeProject) => {
      dispatch({ type: 'load', project: next });
      setSaved({ project: next, snapshot: snapshotOf(next) });
      clearSelection();
    },
    [dispatch, clearSelection]
  );

  const onNew = () => {
    if (unsaved && !window.confirm('Discard unsaved changes?')) return;
    // A fresh project gets fresh ids, so it is loaded rather than made by the reducer: that way it is the saved one.
    load(defaultProject());
    setStatus(null);
  };

  const onSave = () => {
    triggerDownload(new Blob([serializeProject(project)], { type: 'application/json' }), `${projectSlug(project.name)}${PROJECT_EXTENSION}`);
    setSaved({ project, snapshot: snapshotOf(project) });
    setStatus(null);
  };

  const onOpen = () => inputRef.current?.click();

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    // Cleared so choosing the same file again still fires a change.
    input.value = '';
    if (!file) return;
    void (async () => {
      try {
        load(parseProject(await file.text()));
        setStatus(null);
      } catch (error) {
        const message = error instanceof ProjectFileError ? error.message : 'The file could not be read.';
        if (!(error instanceof ProjectFileError)) console.error('Open failed', error);
        setStatus(message);
        // The Export section or menu may be closed, where the status line is out of sight.
        window.alert(message);
      }
    })();
  };

  return { unsaved, onNew, onOpen, onSave, inputRef, onFileChosen };
}
