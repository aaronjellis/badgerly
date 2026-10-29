import { imageAspect, svgAspect } from '../../engine/artworkImage';
import { parseSvgShape } from '../../engine/svgShape';

/** The largest graphic accepted: the data URL is saved in every project file. */
export const MAX_GRAPHIC_BYTES = 2 * 1024 * 1024;

export type GraphicRead = { dataUrl: string; vector: boolean; /** height / width */ aspect: number } | { error: string };

type PickedFile = Pick<File, 'name' | 'size' | 'text' | 'arrayBuffer'> & { type?: string };

const RASTER_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** The aspect (height / width) of a raster data URL, from the browser's decoder; null if it cannot decode it. */
export function measureRaster(dataUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(imageAspect(img, dataUrl));
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Reads a picked file as a graphic: an SVG as a vector (its text kept in a data URL), or a PNG, JPG,
 * or WebP as a raster. Says in a short message why a file cannot be one. `measure` finds a raster's aspect.
 */
export async function readGraphicFile(file: PickedFile, measure: (dataUrl: string) => Promise<number | null> = measureRaster): Promise<GraphicRead> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isSvg = ext === 'svg' || file.type === 'image/svg+xml';
  const rasterType = RASTER_TYPES[ext] ?? Object.values(RASTER_TYPES).find((t) => t === file.type);
  if (!isSvg && !rasterType) return { error: 'Use an SVG, PNG, JPG, or WebP file.' };
  if (file.size > MAX_GRAPHIC_BYTES) return { error: 'That file is too large (limit 2 MB).' };
  try {
    if (isSvg) {
      const text = await file.text();
      if (!/<svg[\s>]/i.test(text)) return { error: 'That file is not an SVG.' };
      const shape = parseSvgShape(text, 0.1);
      const aspect = svgAspect(text) ?? (shape && shape.viewBox.w > 0 && shape.viewBox.h > 0 ? shape.viewBox.h / shape.viewBox.w : null);
      if (!shape || aspect === null) return { error: 'That SVG has no size. Add a viewBox and try again.' };
      return { dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`, vector: true, aspect };
    }
    const dataUrl = `data:${rasterType};base64,${base64(new Uint8Array(await file.arrayBuffer()))}`;
    const aspect = await measure(dataUrl);
    return aspect === null ? { error: 'Could not read that image.' } : { dataUrl, vector: false, aspect };
  } catch {
    return { error: 'Could not read that file.' };
  }
}
