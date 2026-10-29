import { Download, Frame, Layers, Mountain, Shapes, Square, type LucideIcon } from 'lucide-react';
import type { Mode } from '../engine/model';
import type { SectionId } from './sections/types';

/** The inspector's sections are its parts: `Section` and `PartsRow` take them by these names. */
export type PartId = SectionId;

export interface PartDef {
  id: PartId;
  label: string;
  /** Space-separated search words; the settings search matches against these. */
  keywords: string;
  icon: LucideIcon;
}

const DEFS: Record<PartId, PartDef> = {
  shape: {
    id: 'shape',
    label: 'Shape',
    keywords: 'badge outline size width height corner radius rounded oval ticket scallop chamfer hug text units mm in inches',
    icon: Square,
  },
  border: {
    id: 'border',
    label: 'Border',
    keywords: 'line frame inset double dashed dotted width gap corner art',
    icon: Frame,
  },
  elements: {
    id: 'elements',
    label: 'Elements',
    keywords: 'text graphic logo svg image font size position move rotate align color name add duplicate delete',
    icon: Shapes,
  },
  layers: {
    id: 'layers',
    label: 'Layers',
    keywords: 'stacked acrylic mdf backing thickness material single print and cut laser engrave score cut out',
    icon: Layers,
  },
  relief: {
    id: 'relief',
    label: 'Relief',
    keywords: '3d print plate thickness edge chamfer fillet emboss deboss raised recess clearance two color split',
    icon: Mountain,
  },
  export: {
    id: 'export',
    label: 'Export',
    keywords: 'download save file svg stl laser 3d print warnings',
    icon: Download,
  },
};

/** The inspector's steps in order; the fourth is layers in laser mode and relief in 3D print mode. */
export function partsForMode(mode: Mode): PartDef[] {
  const ids: PartId[] = ['shape', 'border', 'elements', mode === 'laser' ? 'layers' : 'relief', 'export'];
  return ids.map((id) => DEFS[id]);
}
