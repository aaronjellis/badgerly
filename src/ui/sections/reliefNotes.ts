import type { BadgeProject } from '../../engine/model';
import type { ReliefResult } from '../../engine/relief';
import type { ResolvedBadge, WarningCode } from '../../engine/resolve';

export const DASHED_NOTE = 'A dashed raised border becomes many small parts in a split export.';

/** The warnings that matter to a 3D print. The rest belong to other sections. */
const RELIEF_CODES = new Set<WarningCode>(['outsideFlat', 'thin']);

/**
 * What the 3D badge needs to tell you: an element or the border running onto the edge, a feature too thin
 * to print, and, for a dashed raised border in a split, that it becomes many parts. Each appears once.
 */
export function reliefNotes(project: BadgeProject, resolved: ResolvedBadge, relief: ReliefResult | null): string[] {
  const names = new Map(project.elements.map((el) => [el.id, el.name]));
  const notes = new Set<string>();
  // `outsideFlat` for an element comes from the resolve; for the border, and every `thin`, from the relief.
  for (const w of [...resolved.warnings, ...(relief?.warnings ?? [])]) {
    if (!RELIEF_CODES.has(w.code)) continue;
    // Only a thin feature's message talks about "this element" and so needs the name; an outside-flat one already has it.
    const name = w.code === 'thin' && w.elementId !== undefined ? names.get(w.elementId) : undefined;
    notes.add(name ? `${name}: ${w.message}` : w.message);
  }
  const { border, relief: config } = project;
  if (config.split && border.style === 'dashed' && border.relief === 'emboss') notes.add(DASHED_NOTE);
  return [...notes];
}
