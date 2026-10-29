import type { Dispatch } from 'react';
import type { FontProvider } from '../../engine/fontProvider';
import type { BadgeProject } from '../../engine/model';
import type { ReliefResult } from '../../engine/relief';
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
  /** The 3D badge and its limits and warnings; null outside 3D mode. */
  relief: ReliefResult | null;
  fonts: FontProvider;
  /** Whether the selected text shows a handle for each letter pair on the stage. */
  adjustPairs: boolean;
  setAdjustPairs: (on: boolean) => void;
}
