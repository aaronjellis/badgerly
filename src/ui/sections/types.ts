import type { Dispatch } from 'react';
import type { FontProvider } from '../../engine/fontProvider';
import type { BadgeProject } from '../../engine/model';
import type { ResolvedBadge } from '../../engine/resolve';
import type { Action } from '../../state/reducer';

export type SectionId = 'shape' | 'border' | 'elements' | 'layers' | 'relief' | 'export';

/** What every section body reads and edits: the project, how to change it, and the selection. */
export interface SectionProps {
  project: BadgeProject;
  dispatch: Dispatch<Action>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  resolved: ResolvedBadge;
  fonts: FontProvider;
  /** Whether the selected text shows a handle for each letter pair on the stage. */
  adjustPairs: boolean;
  setAdjustPairs: (on: boolean) => void;
}
