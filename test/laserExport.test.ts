import { describe, expect, it } from 'vitest';
import { exportLaserSvg, laserPieces, pieceSlots, STACK_GAP_MM } from '../src/engine/laserExport';
import { area, bounds } from '../src/engine/geom';
import { defaultProject, DEFAULT_ROLE, newId } from '../src/engine/model';
import type { BadgeProject, GraphicElement } from '../src/engine/model';
import { resolveBadge } from '../src/engine/resolve';
import { inlineSvgArtwork, sanitize } from '../src/engine/svgInline';
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

  it('print and cut prints a vector graphic in its own colors, placed in its ink box', () => {
    const art = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="10" height="10" fill="#ff0000"/><rect x="10" width="10" height="10" fill="#00ff00"/></svg>';
    const p = defaultProject(); p.laserVariant = 'printcut';
    p.elements.push(raster({ id: 'flag', x: 0, y: 0, rotationDeg: 0, vector: true, widthMm: 20, heightMm: 10, dataUrl: `data:image/svg+xml,${encodeURIComponent(art)}`, role: { ...DEFAULT_ROLE, printColor: true, fill: '#123456' } }));
    const svg = exportLaserSvg(p, resolve(p));
    const print = svg.match(/<g id="badge-print">[\s\S]*?\n<\/g>/)![0];
    expect(print).toContain('fill="#ff0000"');
    expect(print).toContain('fill="#00ff00"');
    expect(print).not.toContain('#123456');
    expect(print).toContain('<g id="badge-flag-art" transform="translate(');
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
  describe('stacked', () => {
    /** A stacked default project whose text sits on the first top layer. */
    function stacked(): BadgeProject {
      const p = defaultProject(); p.laserVariant = 'stacked'; p.elements[0].role.layerId = p.layers[1].id;
      return p;
    }

    it('a group per layer, top pieces scored on the backing and cut on their own layer', () => {
      const p = stacked();
      const r = resolve(p);
      const pieces = laserPieces(p, r);
      expect(pieces.map((x) => x.id)).toEqual(['backing', 'layer-acrylic']);
      expect(pieces[0].score.length).toBeGreaterThan(1); // border plus letter outlines
      expect(area(pieces[1].cut)).toBeCloseTo(area(r.elements[0].poly), 2);
      const svg = exportLaserSvg(p, r);
      expect(svg).toContain('id="layer-acrylic-cut"');
      expect(svg).toContain('viewBox="0 0 ' + (103.6 + 5 + Math.ceil(r.elements[0].ink.w * 10) / 10).toFixed(1));
    });

    it('gives the top piece only a cut', () => {
      const p = stacked();
      const [, top] = laserPieces(p, resolve(p));
      expect(top.score).toEqual([]);
      expect(top.engrave).toEqual([]);
      expect(top.print).toEqual([]);
      expect(top.images).toEqual([]);
    });

    it('makes one piece per top layer in layer order, with unique slugs', () => {
      const p = stacked();
      p.layers.push({ id: newId(), name: 'Acrylic!', thicknessMm: 2 }, { id: newId(), name: '  Gold Mirror ', thicknessMm: 2 });
      const second = { ...p.elements[0], id: newId(), role: { ...p.elements[0].role, layerId: p.layers[2].id } };
      const third = { ...p.elements[0], id: newId(), role: { ...p.elements[0].role, layerId: p.layers[3].id } };
      p.elements.push(second, third);
      const pieces = laserPieces(p, resolve(p));
      expect(pieces.map((x) => x.id)).toEqual(['backing', 'layer-acrylic', 'layer-acrylic-2', 'layer-gold-mirror']);
      // Each of the three text copies is scored on the backing as its own set of outlines.
      const r = resolve(p);
      const outlines = r.elements.reduce((n, e) => n + e.poly.length, 0);
      expect(pieces[0].score.length).toBe(r.border.centerlines.length + outlines);
    });

    it('skips a top layer that has no vector elements', () => {
      const p = stacked();
      p.layers.push({ id: newId(), name: 'Empty', thicknessMm: 2 }, { id: newId(), name: 'Photo', thicknessMm: 2 });
      p.elements.push(raster({ role: { ...DEFAULT_ROLE, layerId: p.layers[3].id } }));
      const pieces = laserPieces(p, resolve(p));
      expect(pieces.map((x) => x.id)).toEqual(['backing', 'layer-acrylic']);
      expect(pieces[0].images).toEqual([]);
    });

    it('keeps backing elements engraved on the backing piece', () => {
      const p = stacked();
      const logo = { ...p.elements[0], id: newId(), role: { ...p.elements[0].role, layerId: null } };
      p.elements.push(logo);
      const r = resolve(p);
      const [backing] = laserPieces(p, r);
      expect(area(backing.engrave)).toBeCloseTo(area(r.elements[1].poly), 1);
      // The top text is scored, not engraved.
      expect(backing.score.length).toBeGreaterThan(r.border.centerlines.length);
    });

    it('scores a backing score-role element and the top outlines as closed loops beside open border runs', () => {
      const p = stacked(); p.border.style = 'dashed';
      const r = resolve(p);
      const [backing] = laserPieces(p, r);
      expect(backing.scoreClosed).toBe(false);
      for (const line of backing.score.slice(r.border.centerlines.length)) expect(line[line.length - 1]).toEqual(line[0]);
    });

    it('lays the top piece 5 mm right of the backing, matching each piece by element id', () => {
      const p = stacked();
      p.elements.unshift({ ...p.elements[0], id: newId(), role: { ...p.elements[0].role, layerId: null, laser: 'cutout' } });
      const r = resolve(p);
      // Reverse the resolved order: pieces must still find each element by id.
      r.elements.reverse();
      const svg = exportLaserSvg(p, r);
      const rightEdge = (id: string) => {
        const xs = [...pathIn(svg, id).matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]));
        return { min: Math.min(...xs), max: Math.max(...xs) };
      };
      const back = rightEdge('backing-cut');
      const top = rightEdge('layer-acrylic-cut');
      expect(back.min).toBeCloseTo(1, 3);
      expect(top.min - back.max).toBeCloseTo(5, 3);
      const topPiece = laserPieces(p, r)[1];
      expect(bounds(topPiece.cut)!.w).toBeCloseTo(top.max - top.min, 3);
    });

    it('balances its group tags', () => {
      const p = stacked();
      const svg = exportLaserSvg(p, resolve(p));
      expect(svg.match(/<g[\s>]/g)?.length).toBe(svg.match(/<\/g>/g)?.length);
      expect(svg).toContain('<g id="backing">');
      expect(svg).toContain('<g id="layer-acrylic">');
    });
  });
});

describe('inline artwork', () => {
  const box = { x: 0, y: 0, w: 10, h: 10 };
  it('removes javascript: and outside links, scripts, animations, and handlers', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">' +
      '<a href="javascript:alert(1)"><rect width="5" height="5" onclick="alert(2)"/></a>' +
      '<image xlink:href="https://example.com/x.png" width="1" height="1"/><use href="#r"/>' +
      '<script>alert(3)</script><foreignObject><div/></foreignObject>' +
      '<animate attributeName="x" to="5"/><set attributeName="fill" to="red"></set><animateTransform type="rotate"/>' +
      '<rect id="r" style="fill:url(https://example.com/p.svg#g)" width="1" height="1"/></svg>';
    const out = inlineSvgArtwork(svg, 'p-', box, 0)!;
    expect(out).not.toMatch(/javascript|alert|example\.com|<script|<foreignObject|<animate|<set|onload|onclick/i);
    expect(out).toContain('href="#p-r"');
    expect(out).toContain('<rect width="5" height="5"/>');
  });
  it('keeps links to the drawing itself and embedded images', () => {
    const kept = sanitize('<image href="data:image/png;base64,AAAA"/><rect fill="url(#g)"/>');
    expect(kept).toBe('<image href="data:image/png;base64,AAAA"/><rect fill="url(#g)"/>');
  });
});

describe('pieceSlots', () => {
  it('lays pieces left to right with the gap between their bounds', () => {
    const { dx, bounds } = pieceSlots(
      [{ x: -20, y: -5, w: 40, h: 10 }, null, { x: -10, y: -8, w: 20, h: 16 }],
      STACK_GAP_MM
    );
    expect(dx).toEqual([20, 0, 55]);
    expect(bounds).toEqual({ x: 0, y: -8, w: 40 + STACK_GAP_MM + 20, h: 16 });
  });

  it('has no bounds when nothing is placed', () => {
    expect(pieceSlots([null]).bounds).toBeNull();
  });
});
