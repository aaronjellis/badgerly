import { describe, expect, it } from 'vitest';
import { exportLaserSvg, laserPieces } from '../src/engine/laserExport';
import { defaultProject, DEFAULT_ROLE, newId } from '../src/engine/model';
import type { BadgeProject, GraphicElement } from '../src/engine/model';
import { resolveBadge } from '../src/engine/resolve';
import { fakeProvider, font } from './helpers/fonts';

const resolve = (p: BadgeProject) => resolveBadge(p, fakeProvider([font('cinzel-700-normal')]), 0.01);

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function raster(patch: Partial<GraphicElement> = {}): GraphicElement {
  return {
    kind: 'graphic', id: newId(), name: 'Logo', x: 10, y: 5, rotationDeg: 30, role: { ...DEFAULT_ROLE },
    dataUrl: PNG, vector: false, widthMm: 12, heightMm: 8, ...patch,
  };
}

/** The `d` of the first path inside the group `id`. */
function pathIn(svg: string, id: string): string {
  const m = svg.match(new RegExp(`<g id="${id}">\\s*<path d="([^"]*)"`));
  if (!m) throw new Error(`no path in ${id}`);
  return m[1];
}

describe('exportLaserSvg', () => {
  it('single: the badge cut, the border score, the text engraved', () => {
    const p = defaultProject();
    const svg = exportLaserSvg(p, resolve(p));
    expect(svg).toContain('viewBox="0 0 103.6 52.8"');
    expect(svg).toContain('width="103.6mm" height="52.8mm"');
    expect(svg).toMatch(/<g id="badge-cut">[\s\S]*stroke="#ff0000"/);
    expect(svg).toMatch(/<g id="badge-score">[\s\S]*stroke="#0000ff"/);
    expect(svg).toMatch(/<g id="badge-engrave">[\s\S]*fill="#000000"/);
    expect(svg).not.toContain('id="badge-print"');
  });

  it('a 1 mm border engraves instead of scoring', () => {
    const p = defaultProject(); p.border.widthMm = 1;
    const svg = exportLaserSvg(p, resolve(p));
    expect(svg).not.toContain('id="badge-score"');
    // The border band joins the text in the engrave group.
    expect(svg).toContain('id="badge-engrave"');
  });

  it('a cut-out element leaves holes in the cut path', () => {
    const p = defaultProject(); p.elements[0].role.laser = 'cutout';
    const pieces = laserPieces(p, resolve(p));
    expect(pieces[0].cut.length).toBeGreaterThan(1);
    expect(pieces[0].engrave).toEqual([]);
  });

  it('print and cut puts a colored element in the print group only', () => {
    const p = defaultProject(); p.laserVariant = 'printcut'; p.elements[0].role.printColor = true; p.elements[0].role.fill = '#1e40af';
    const svg = exportLaserSvg(p, resolve(p));
    expect(svg).toMatch(/<g id="badge-print">[\s\S]*fill="#1e40af"/);
    expect(svg).not.toContain('id="badge-engrave"');
  });

  it('single material ignores the print color', () => {
    const p = defaultProject(); p.elements[0].role.printColor = true; p.elements[0].role.fill = '#1e40af';
    const svg = exportLaserSvg(p, resolve(p));
    expect(svg).not.toContain('id="badge-print"');
    expect(svg).not.toContain('#1e40af');
    expect(svg).toContain('id="badge-engrave"');
  });

  it('balances its group tags and has one root', () => {
    const p = defaultProject(); p.border.widthMm = 1; p.laserVariant = 'printcut';
    p.elements.push(raster({ role: { ...DEFAULT_ROLE, printColor: true } }), raster());
    for (const q of [defaultProject(), p]) {
      const svg = exportLaserSvg(q, resolve(q));
      expect(svg.match(/<g[\s>]/g)?.length).toBe(svg.match(/<\/g>/g)?.length);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
      expect(svg.match(/<svg[\s>]/g)).toHaveLength(1);
    }
  });

  it('translates the outline so its top-left is at (1, 1)', () => {
    const p = defaultProject();
    const svg = exportLaserSvg(p, resolve(p));
    const nums = [...pathIn(svg, 'badge-cut').matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(Math.min(...nums.map((n) => n[0]))).toBeCloseTo(1, 3);
    expect(Math.min(...nums.map((n) => n[1]))).toBeCloseTo(1, 3);
    expect(Math.max(...nums.map((n) => n[0]))).toBeCloseTo(102.6, 3);
    expect(Math.max(...nums.map((n) => n[1]))).toBeCloseTo(51.8, 3);
  });

  it('prints coordinates with at most 3 decimals', () => {
    const p = defaultProject();
    const svg = exportLaserSvg(p, resolve(p));
    expect(svg).not.toMatch(/\d\.\d{4,}/);
  });

  it('writes a raster element as an image with its data URL, box and rotation', () => {
    const p = defaultProject(); p.elements.push(raster());
    const svg = exportLaserSvg(p, resolve(p));
    const engrave = svg.match(/<g id="badge-engrave">[\s\S]*?<\/g>/)![0];
    expect(engrave).toContain(`<image href="${PNG}"`);
    // The badge center (0, 0) lands at (51.8, 26.4); the 12 x 8 box centered at (10, 5) starts 6 and 4 mm before its center.
    expect(engrave).toContain('x="55.8" y="27.4" width="12" height="8"');
    expect(engrave).toContain('transform="rotate(30 61.8 31.4)"');
  });

  it('puts a print-colored raster in the print group in print and cut only', () => {
    const p = defaultProject(); p.laserVariant = 'printcut';
    p.elements = [raster({ role: { ...DEFAULT_ROLE, printColor: true, fill: '#ff00ff' } })];
    const svg = exportLaserSvg(p, resolve(p));
    expect(svg).toMatch(/<g id="badge-print">\s*<image href="data:image\/png/);
    expect(svg).not.toContain('id="badge-engrave"');
    p.laserVariant = 'single';
    expect(exportLaserSvg(p, resolve(p))).toMatch(/<g id="badge-engrave">\s*<image/);
  });

  it('writes a score-role element as a closed blue stroke', () => {
    const p = defaultProject(); p.elements[0].role.laser = 'score'; p.border.style = 'none';
    const svg = exportLaserSvg(p, resolve(p));
    expect(svg).not.toContain('id="badge-engrave"');
    expect(svg).toMatch(/<g id="badge-score">\s*<path d="M[^"]*Z" fill="none" stroke="#0000ff" stroke-width="0.1"\/>/);
  });

  it('writes dashed border runs as open score lines', () => {
    const p = defaultProject(); p.border.style = 'dashed';
    const pieces = laserPieces(p, resolve(p));
    expect(pieces[0].scoreClosed).toBe(false);
    const d = pathIn(exportLaserSvg(p, resolve(p)), 'badge-score');
    expect(d).not.toContain('Z');
    expect(d.match(/M/g)!.length).toBeGreaterThan(1);
  });

  it('keeps a scored element closed next to open border runs', () => {
    const p = defaultProject(); p.border.style = 'dashed'; p.elements[0].role.laser = 'score';
    const r = resolve(p);
    const piece = laserPieces(p, r)[0];
    const textLines = piece.score.slice(r.border.centerlines.length);
    expect(textLines.length).toBeGreaterThan(0);
    for (const line of textLines) expect(line[line.length - 1]).toEqual(line[0]);
  });

  it('makes one badge piece with a single cut contour and nothing printed', () => {
    const p = defaultProject();
    const [piece] = laserPieces(p, resolve(p));
    expect(piece.id).toBe('badge');
    expect(piece.cut).toHaveLength(1);
    expect(piece.print).toEqual([]);
    expect(piece.images).toEqual([]);
  });
});
