/** The editor's project state: the reducer, the selection, and the resolved geometry the stage draws. */
import { useEffect, useMemo, useReducer, useState } from 'react';
import type { Dispatch } from 'react';
import { createFontProvider } from '../engine/fontProvider';
import type { FontProvider } from '../engine/fontProvider';
import { PREVIEW_TOL_MM } from '../engine/geom';
import type { BadgeProject } from '../engine/model';
import { resolveBadge } from '../engine/resolve';
import type { ResolvedBadge } from '../engine/resolve';
import { reduce } from './reducer';
import type { Action } from './reducer';
import { newProject, saveUnit } from './unitPreference';

/** One provider for the session, so loaded fonts are shared and cached. */
const fonts = createFontProvider();

export interface ProjectState {
  project: BadgeProject;
  dispatch: Dispatch<Action>;
  /** The selected element's id, or null; an id whose element is gone reads as null. */
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  /** The project resolved at preview tolerance; resolves again when a font loads. */
  resolved: ResolvedBadge;
  fonts: FontProvider;
}

export function useProject(): ProjectState {
  const [project, dispatch] = useReducer(reduce, undefined, () => newProject());
  const [pickedId, setSelectedId] = useState<string | null>(null);
  const [fontTick, setFontTick] = useState(0);

  useEffect(() => fonts.onChange(() => setFontTick((n) => n + 1)), []);

  // The unit in use is the one a new project starts in, this visit and the next.
  useEffect(() => saveUnit(project.unit), [project.unit]);

  // Ask for the fonts the text elements need; each load that lands re-resolves through `onChange`.
  const textKey = JSON.stringify(project.elements.map((el) => (el.kind === 'text' ? el.text : null)));
  useEffect(() => {
    for (const el of project.elements) {
      if (el.kind === 'text') void fonts.load(el.text).catch(() => undefined);
    }
    // `textKey` stands for the text configs; `project` itself changes on every drag.
  }, [textKey]);

  const resolved = useMemo(() => resolveBadge(project, fonts, PREVIEW_TOL_MM), [project, fontTick]);

  const selectedId = pickedId !== null && project.elements.some((el) => el.id === pickedId) ? pickedId : null;

  return { project, dispatch, selectedId, setSelectedId, resolved, fonts };
}
