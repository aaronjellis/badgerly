import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProject } from '../src/engine/model';
import type { BadgeProject } from '../src/engine/model';
import { exportBadge, exportFormats, projectSlug } from '../src/state/exportFlow';
import type { ExportFile } from '../src/state/exportFlow';
import { fakeProvider, font } from './helpers/fonts';

// `runExport` reports to `window.posthog`, which the node test environment lacks.
const capture = vi.fn();
beforeEach(() => {
  capture.mockClear();
  (globalThis as { window?: unknown }).window = { posthog: { capture } };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const provider = () => fakeProvider([font('cinzel-700-normal')]);

/** Runs an export into a list instead of the disk. */
async function run(id: Parameters<typeof exportBadge>[0], project: BadgeProject, fonts = provider()) {
  const saved: ExportFile[] = [];
  const outcome = await exportBadge(id, project, fonts, { save: (f) => void saved.push(f), pause: async () => {} });
  return { outcome, saved };
}

const print3d = (patch: Partial<BadgeProject['relief']> = {}): BadgeProject => {
  const p = defaultProject();
  p.mode = 'print3d';
  p.relief = { ...p.relief, ...patch };
  return p;
};

describe('projectSlug', () => {
  it('lowercases, collapses runs of other characters to one dash, and trims', () => {
    expect(projectSlug('  My Badge #2!! ')).toBe('my-badge-2');
    expect(projectSlug('Badge')).toBe('badge');
  });
  it('falls back to badge when nothing is left', () => {
    expect(projectSlug('')).toBe('badge');
    expect(projectSlug('---')).toBe('badge');
    expect(projectSlug('日本')).toBe('badge');
  });
});

describe('exportFormats', () => {
  it('names the laser groups for each variant', () => {
    const p = defaultProject();
    expect(exportFormats(p).map((f) => [f.id, f.template])).toEqual([['svg', 'laser-single']]);
    expect(exportFormats(p)[0].hint).toMatch(/cut, score, and engrave/i);
    expect(exportFormats({ ...p, laserVariant: 'stacked' })[0].hint).toMatch(/backing and one piece per layer/i);
    expect(exportFormats({ ...p, laserVariant: 'stacked' })[0].template).toBe('laser-stacked');
    expect(exportFormats({ ...p, laserVariant: 'printcut' })[0].hint).toMatch(/cut, score, engrave, and print/i);
    expect(exportFormats({ ...p, laserVariant: 'printcut' })[0].template).toBe('laser-printcut');
  });
  it('offers one STL, or two files with a split', () => {
    expect(exportFormats(print3d()).map((f) => [f.id, f.template])).toEqual([['stl', 'print3d']]);
    const split = exportFormats(print3d({ split: true }));
    expect(split.map((f) => [f.id, f.label, f.template])).toEqual([['stl-two-files', 'STL, two files', 'print3d-split']]);
  });
});

describe('exportBadge', () => {
  it('writes the laser SVG under the project slug', async () => {
    const p = { ...defaultProject(), name: 'My Badge' };
    const { outcome, saved } = await run('svg', p);
    expect(outcome.ok).toBe(true);
    expect(saved.map((f) => f.filename)).toEqual(['my-badge.svg']);
    expect(saved[0].blob.type).toBe('image/svg+xml');
    expect(await saved[0].blob.text()).toContain('id="badge-cut"');
  });

  it('writes one binary STL of the 3D badge', async () => {
    const { outcome, saved } = await run('stl', print3d());
    expect(outcome.ok).toBe(true);
    expect(saved.map((f) => f.filename)).toEqual(['badge.stl']);
    const bytes = new DataView(await saved[0].blob.arrayBuffer());
    expect(bytes.byteLength).toBe(84 + 50 * bytes.getUint32(80, true));
    expect(bytes.getUint32(80, true)).toBeGreaterThan(100);
  });

  it('writes the plate and the parts of a split as two files', async () => {
    const p = print3d({ split: true });
    p.elements[0].role = { ...p.elements[0].role, relief: 'emboss', reliefMm: 1 };
    const { outcome, saved } = await run('stl-two-files', p);
    expect(outcome.ok).toBe(true);
    expect(saved.map((f) => f.filename)).toEqual(['badge-plate.stl', 'badge-parts.stl']);
  });

  it('refuses a split with nothing raised', async () => {
    const p = print3d({ split: true });
    p.elements[0].role = { ...p.elements[0].role, relief: 'deboss' };
    p.border = { ...p.border, relief: 'deboss' };
    const { outcome, saved } = await run('stl-two-files', p);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/no raised parts/i);
    expect(saved).toEqual([]);
  });

  it('awaits the fonts of every text element before it resolves', async () => {
    const p = defaultProject();
    let loaded = false;
    const load = vi.fn(async () => {
      loaded = true;
      return [font('cinzel-700-normal')];
    });
    const fonts = { get: () => (loaded ? [font('cinzel-700-normal')] : null), load, onChange: () => () => {} };
    const { outcome, saved } = await run('svg', p, fonts);
    expect(load).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(true);
    expect(saved).toHaveLength(1);
  });

  it('refuses with the warning when a font will not load, and downloads nothing', async () => {
    const { outcome, saved } = await run('svg', defaultProject(), fakeProvider(null));
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/still loading/i);
    expect(saved).toEqual([]);
  });

  it('refuses when the font lacks a character', async () => {
    const p = defaultProject();
    if (p.elements[0].kind === 'text') p.elements[0].text = { ...p.elements[0].text, text: 'ZZ \u{1F600}' };
    const { outcome, saved } = await run('svg', p);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/has no/i);
    expect(saved).toEqual([]);
  });

  it('reports a failed download and does not count it', async () => {
    const outcome = await exportBadge('svg', defaultProject(), provider(), {
      save: () => {
        throw new Error('blocked');
      },
      pause: async () => {},
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/failed/i);
  });

  it('records a successful export once, with the template', async () => {
    await run('svg', defaultProject());
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('export_downloaded', expect.objectContaining({ format: 'svg', template: 'laser-single' }));
    capture.mockClear();
    await run('svg', defaultProject(), fakeProvider(null));
    expect(capture).not.toHaveBeenCalled();
  });
});
