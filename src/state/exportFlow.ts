/** Exports: which formats a badge offers, and the steps from a click to the files, free of the DOM. */
import { EXPORT_TOL_MM } from '../engine/geom';
import type { FontProvider } from '../engine/fontProvider';
import { exportLaserSvg } from '../engine/laserExport';
import type { BadgeProject } from '../engine/model';
import { buildRelief } from '../engine/relief';
import { resolveBadge } from '../engine/resolve';
import type { ResolvedBadge, Warning } from '../engine/resolve';
import { meshToBinaryStl } from '../engine/stlBinary';
import { runExport } from '../ui/analytics';

export type ExportFormatId = 'svg' | 'stl' | 'stl-two-files';

export interface ExportFormat {
  id: ExportFormatId;
  label: string;
  hint: string;
  /** What analytics records the export under: the mode, and the laser variant or split. */
  template: string;
}

export interface ExportFile {
  filename: string;
  blob: Blob;
}

/** Where files go and how long to wait between two of them, so tests and the browser can differ. */
export interface ExportIo {
  save: (file: ExportFile) => void | Promise<void>;
  pause: (ms: number) => Promise<void>;
}

/** How a click on an export ended: a file was saved, the badge was refused or failed (the status says why), or another export was running. */
export type ExportResult = 'downloaded' | 'refused' | 'busy';

export interface ExportOutcome {
  ok: boolean;
  /** One sentence for the status line: what was downloaded, or why nothing was. */
  message: string;
}

/** The wait between two downloads, which browsers otherwise tend to block as a burst. */
export const SECOND_DOWNLOAD_DELAY_MS = 250;

/**
 * The project name as a file name: lowercase, letters and digits of any script kept (accents composed
 * first, so an é typed as e and an accent stays one letter), runs of anything else become one `-`,
 * ends trimmed; `badge` when nothing is left.
 */
export function projectSlug(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'badge';
}

/** The formats this badge offers in its mode. */
export function exportFormats(project: BadgeProject): ExportFormat[] {
  if (project.mode === 'laser') {
    const { laserVariant } = project;
    return [
      {
        id: 'svg',
        label: 'SVG',
        hint:
          laserVariant === 'stacked'
            ? 'A backing and one piece per layer'
            : laserVariant === 'printcut'
              ? 'Cut, score, engrave, and print groups'
              : 'Cut, score, and engrave groups',
        template: `laser-${laserVariant}`,
      },
    ];
  }
  if (project.relief.split) {
    return [{ id: 'stl-two-files', label: 'STL, two files', hint: 'Two downloads: plate and parts', template: 'print3d-split' }];
  }
  return [{ id: 'stl', label: 'STL', hint: 'One closed solid, in millimeters', template: 'print3d' }];
}

/** Warnings that mean the outlines are not final, so a file made now would be wrong. */
export function blockingWarning(resolved: ResolvedBadge): Warning | null {
  return resolved.warnings.find((w) => w.code === 'missingFont' || w.code === 'fontLoading') ?? null;
}

const SVG_TYPE = 'image/svg+xml';
const STL_TYPE = 'model/stl';

/** The files for a format, or a sentence on why the badge has none. Throws only for a badge the builder cannot solidify. */
function buildFiles(format: ExportFormat, project: BadgeProject, resolved: ResolvedBadge): ExportFile[] | string {
  const slug = projectSlug(project.name);
  if (format.id === 'svg') return [{ filename: `${slug}.svg`, blob: new Blob([exportLaserSvg(project, resolved)], { type: SVG_TYPE }) }];

  const { plate, parts } = buildRelief(project, resolved, EXPORT_TOL_MM);
  const stl = (mesh: typeof plate) => new Blob([meshToBinaryStl(mesh)], { type: STL_TYPE });
  if (format.id === 'stl') return [{ filename: `${slug}.stl`, blob: stl(plate) }];
  if (!parts) return 'There are no raised parts to split off. Raise an element or turn off the multi-color split.';
  return [
    { filename: `${slug}-plate.stl`, blob: stl(plate) },
    { filename: `${slug}-parts.stl`, blob: stl(parts) },
  ];
}

/**
 * Makes one export of `project` as it is now. It loads every text element's font and resolves again at
 * export tolerance, so the file never comes from the preview's rougher or half-loaded outlines. A font
 * that is missing or still loading refuses the export; nothing is saved then.
 */
export async function exportBadge(id: ExportFormatId, project: BadgeProject, fonts: FontProvider, io: ExportIo): Promise<ExportOutcome> {
  const format = exportFormats(project).find((f) => f.id === id);
  if (!format) return { ok: false, message: 'This badge cannot export in that format.' };

  await Promise.all(project.elements.map((el) => (el.kind === 'text' ? fonts.load(el.text).catch(() => null) : null)));
  const resolved = resolveBadge(project, fonts, EXPORT_TOL_MM);
  const blocked = blockingWarning(resolved);
  if (blocked) return { ok: false, message: blocked.message };

  let files: ExportFile[] | string;
  try {
    files = buildFiles(format, project, resolved);
  } catch (error) {
    console.error('The export could not be built.', error);
    return { ok: false, message: 'The badge could not be built for export. Check the warnings and try again.' };
  }
  if (typeof files === 'string') return { ok: false, message: files };

  const saved = await runExport(format.id, format.template, async () => {
    for (const [i, file] of files.entries()) {
      if (i > 0) await io.pause(SECOND_DOWNLOAD_DELAY_MS);
      await io.save(file);
    }
  });
  return saved
    ? { ok: true, message: `Downloaded ${files.map((f) => f.filename).join(' and ')}.` }
    : { ok: false, message: 'The download failed. Try again.' };
}
