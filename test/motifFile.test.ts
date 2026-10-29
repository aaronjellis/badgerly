import { describe, expect, it } from 'vitest';
import { MAX_MOTIF_BYTES, readMotifFile } from '../src/ui/sections/motifFile';

const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0H30V30H0Z"/></svg>';

describe('readMotifFile', () => {
  it('returns the text of a valid SVG', async () => {
    expect(await readMotifFile(new File([square], 'c.svg'))).toEqual({ svg: square });
  });

  it('rejects a file over the size limit without reading it', async () => {
    let read = false;
    const big = { size: MAX_MOTIF_BYTES + 1, text: async () => ((read = true), square) };
    expect(await readMotifFile(big)).toEqual({ error: 'That SVG is too large (limit 256 KB).' });
    expect(read).toBe(false);
  });

  it('reports a file that cannot be read instead of throwing', async () => {
    const broken = { size: 10, text: () => Promise.reject(new Error('gone')) };
    expect(await readMotifFile(broken)).toEqual({ error: 'Could not read that file.' });
  });

  it('rejects non-SVG text and an SVG with no filled shapes', async () => {
    expect(await readMotifFile(new File(['hello'], 'c.svg'))).toEqual({ error: 'That file is not an SVG.' });
    expect(await readMotifFile(new File(['<svg viewBox="0 0 100 100"></svg>'], 'c.svg'))).toEqual({ error: 'That SVG has no filled shapes to use.' });
  });
});
