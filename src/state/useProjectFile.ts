/** New, Open and Save for `.badge` files, and whether the badge has changes the file doesn't. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, Dispatch, RefObject } from 'react';
import type { BadgeProject } from '../engine/model';
import { parseProject, PROJECT_EXTENSION, ProjectFileError, serializeProject } from '../engine/projectFile';
import { triggerDownload } from '../ui/download';
import { projectSlug } from './exportFlow';
import { initialFileState, isUnsaved, stepFile } from './projectFileState';
import type { FileEvent, SavedState } from './projectFileState';
import type { Action } from './reducer';
import { newProject } from './unitPreference';

const DISCARD_PROMPT = 'Discard unsaved changes?';

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
  const [saved, setSaved] = useState<SavedState>(() => initialFileState(project).saved);
  const inputRef = useRef<HTMLInputElement>(null);

  // Saved and unsaved JSON-compare only when the project object has changed.
  const unsaved = useMemo(() => isUnsaved(project, saved), [project, saved]);

  // Closing or reloading the tab with unsaved changes asks first, as Kerfuffle does.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  /** Every change to what counts as saved goes through `stepFile`, the step the tests cover. */
  const step = (event: FileEvent) => setSaved((prev) => stepFile({ project, saved: prev }, event).saved);

  const load = (next: BadgeProject, event: 'open' | 'new') => {
    dispatch({ type: 'load', project: next });
    step({ type: event, project: next });
    clearSelection();
  };

  const onNew = () => {
    if (unsaved && !window.confirm(DISCARD_PROMPT)) return;
    // A fresh project gets fresh ids, so it is loaded rather than made by the reducer: that way it is the saved one.
    load(newProject(), 'new');
    setStatus(null);
  };

  const onSave = () => {
    triggerDownload(new Blob([serializeProject(project)], { type: 'application/json' }), `${projectSlug(project.name)}${PROJECT_EXTENSION}`);
    step({ type: 'save' });
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
        const opened = parseProject(await file.text());
        // A file that opens replaces the badge, so it asks first; cancelling leaves everything as it was.
        if (unsaved && !window.confirm(DISCARD_PROMPT)) return;
        load(opened, 'open');
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
