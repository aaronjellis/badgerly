import { describe, expect, it } from 'vitest';
import { svgTextFromDataUrl } from '../src/engine/artworkImage';
import { MAX_GRAPHIC_BYTES, readGraphicFile } from '../src/ui/sections/graphicFile';

const rect = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('readGraphicFile', () => {
  it('reads an SVG as a vector with its own aspect, keeping the text recoverable', async () => {
    const read = await readGraphicFile(new File([rect], 'logo.svg', { type: 'image/svg+xml' }));
    expect(read).toMatchObject({ vector: true, aspect: 0.5 });
    expect('dataUrl' in read && svgTextFromDataUrl(read.dataUrl)).toBe(rect);
  });

  it('keeps non-ASCII SVG text intact', async () => {
    const text = rect.replace('<rect', '<title>Café ✓</title><rect');
    const read = await readGraphicFile(new File([text], 'a.svg'));
    expect('dataUrl' in read && svgTextFromDataUrl(read.dataUrl)).toBe(text);
  });

  it('reads a raster as a base64 data URL and measures it with the given function', async () => {
    const read = await readGraphicFile(new File([png], 'photo.png', { type: 'image/png' }), async (url) => (url.startsWith('data:image/png;base64,') ? 1.5 : null));
    expect(read).toEqual({ dataUrl: `data:image/png;base64,${Buffer.from(png).toString('base64')}`, vector: false, aspect: 1.5 });
  });

  it('takes the type from the extension when the browser gives none', async () => {
    const read = await readGraphicFile(new File([png], 'photo.JPEG'), async () => 1);
    expect(read).toMatchObject({ vector: false });
    expect('dataUrl' in read && read.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('rejects other file types', async () => {
    expect(await readGraphicFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toEqual({
      error: 'Use an SVG, PNG, JPG, or WebP file.',
    });
  });

  it('rejects a file over 2 MB without reading it', async () => {
    let read = false;
    const big = { name: 'big.png', type: 'image/png', size: MAX_GRAPHIC_BYTES + 1, text: async () => ((read = true), ''), arrayBuffer: async () => ((read = true), new ArrayBuffer(0)) };
    expect(await readGraphicFile(big)).toEqual({ error: 'That file is too large (limit 2 MB).' });
    expect(read).toBe(false);
  });

  it('rejects an SVG that is not SVG text or has no drawable size', async () => {
    expect(await readGraphicFile(new File(['hello'], 'a.svg'))).toEqual({ error: 'That file is not an SVG.' });
    expect(await readGraphicFile(new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'a.svg'))).toEqual({
      error: 'That SVG has no size. Add a viewBox and try again.',
    });
  });

  it('rejects a raster the browser cannot decode', async () => {
    expect(await readGraphicFile(new File([png], 'a.png'), async () => null)).toEqual({ error: 'Could not read that image.' });
  });

  it('reports a file that cannot be read instead of throwing', async () => {
    const broken = { name: 'a.png', type: 'image/png', size: 10, text: () => Promise.reject(new Error('gone')), arrayBuffer: () => Promise.reject(new Error('gone')) };
    expect(await readGraphicFile(broken)).toEqual({ error: 'Could not read that file.' });
  });
});
