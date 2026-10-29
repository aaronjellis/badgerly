import { motifPoly } from '../../engine/cornerArt';

/** The largest corner SVG accepted: the text is saved in every project file and re-parsed on every border build. */
export const MAX_MOTIF_BYTES = 256 * 1024;

export type MotifRead = { svg: string } | { error: string };

/** Reads a picked file as a corner motif, or says in a short message why it cannot be one. */
export async function readMotifFile(file: Pick<File, 'size' | 'text'>): Promise<MotifRead> {
  if (file.size > MAX_MOTIF_BYTES) return { error: 'That SVG is too large (limit 256 KB).' };
  try {
    const svg = await file.text();
    if (!/<svg[\s>]/i.test(svg)) return { error: 'That file is not an SVG.' };
    if (motifPoly(svg, 10, 0.1).length === 0) return { error: 'That SVG has no filled shapes to use.' };
    return { svg };
  } catch {
    return { error: 'Could not read that file.' };
  }
}
