import { describe, expect, it } from 'vitest';
import { defaultProject, newId } from '../src/engine/model';
import type { BadgeProject, ElementRole } from '../src/engine/model';
import { parseProject, ProjectFileError, PROJECT_EXTENSION, serializeProject } from '../src/engine/projectFile';
import { DEFAULT_BORDER } from '../src/engine/border';
import { DEFAULT_TEXT } from '../src/engine/textOutline';

const FILE = { format: 'badgerly-project', version: 1 };
const parse = (extra: Record<string, unknown>) => parseProject(JSON.stringify({ ...FILE, ...extra }));
const role: ElementRole = { laser: 'engrave', printColor: false, fill: '#000000', layerId: null, relief: 'emboss', reliefMm: 1 };
const textElement = (over: Record<string, unknown> = {}) => ({
  kind: 'text', id: 't1', name: 'Text', x: 1, y: 2, rotationDeg: 3, role, text: { ...DEFAULT_TEXT }, capHeightMm: 5, ...over,
});

describe('defaultProject', () => {
  it('has one text element, two layers and the controller defaults', () => {
    const p = defaultProject();
    expect(p.elements).toHaveLength(1);
    expect(p.elements[0]).toMatchObject({ kind: 'text', x: 0, y: 0, rotationDeg: 0, capHeightMm: 7.62, name: 'Text' });
    expect(p.unit).toBe('in');
    expect(p.layers[0]).toEqual({ id: 'backing', name: 'MDF', thicknessMm: 3 });
    expect(p.layers[1]).toMatchObject({ name: 'Acrylic', thicknessMm: 3 });
    expect(p.relief).toEqual({ plateMm: 3, edge: 'fillet', edgeMm: 1, split: false, recessMm: 0.6, clearanceMm: 0.1 });
  });
});

describe('newId', () => {
  it('returns distinct non-empty strings', () => {
    const ids = new Set(Array.from({ length: 500 }, newId));
    expect(ids.size).toBe(500);
    expect([...ids].every((id) => id.length > 0)).toBe(true);
  });
});

describe('projectFile', () => {
  it('uses the .badge extension', () => {
    expect(PROJECT_EXTENSION).toBe('.badge');
  });

  it('round-trips the default project', () => {
    const p = defaultProject();
    expect(parseProject(serializeProject(p))).toEqual(p);
  });

  it('writes the format, version and a save time', () => {
    const raw = JSON.parse(serializeProject(defaultProject()));
    expect(raw.format).toBe('badgerly-project');
    expect(raw.version).toBe(1);
    expect(Number.isNaN(Date.parse(raw.savedAt))).toBe(false);
  });

  it('round-trips a graphic element and a modified project', () => {
    const p: BadgeProject = {
      ...defaultProject(),
      mode: 'print3d',
      laserVariant: 'stacked',
      unit: 'mm',
      elements: [
        ...defaultProject().elements,
        { kind: 'graphic', id: 'g1', name: 'Logo', x: 4, y: -2, rotationDeg: 15, role, dataUrl: 'data:image/svg+xml;base64,AAAA', vector: true, widthMm: 20, heightMm: 10 },
      ],
    };
    expect(parseProject(serializeProject(p))).toEqual(p);
  });

  it('fills missing settings with defaults and drops unknown elements', () => {
    const p = parseProject(JSON.stringify({ format: 'badgerly-project', version: 1, shape: { kind: 'pill' }, elements: [{ kind: 'blob' }] }));
    expect(p.shape.kind).toBe('pill');
    expect(p.shape.widthMm).toBe(101.6);
    expect(p.elements).toHaveLength(0);
  });

  it('refuses a file from a newer version', () => {
    expect(() => parseProject(JSON.stringify({ format: 'badgerly-project', version: 2 }))).toThrow(ProjectFileError);
  });

  it('refuses a file that is not a project, or not JSON', () => {
    expect(() => parseProject('{"format":"other","version":1}')).toThrow(ProjectFileError);
    expect(() => parseProject('[]')).toThrow(ProjectFileError);
    expect(() => parseProject('not json')).toThrow(ProjectFileError);
  });

  it('takes every default from an empty project file', () => {
    const p = parse({});
    expect(p.mode).toBe('laser');
    expect(p.laserVariant).toBe('single');
    expect(p.unit).toBe('in');
    expect(p.border).toEqual(DEFAULT_BORDER);
    expect(p.layers[0].id).toBe('backing');
    expect(p.relief.edge).toBe('fillet');
  });

  it('drops a text element missing text.family', () => {
    const bad = textElement({ text: { ...DEFAULT_TEXT, family: undefined } });
    const p = parse({ elements: [bad, textElement({ id: 't2' })] });
    expect(p.elements.map((e) => e.id)).toEqual(['t2']);
  });

  it('drops an element with a non-finite number', () => {
    const p = parse({ elements: [textElement({ x: 'far' }), textElement({ id: 't2', capHeightMm: null })] });
    expect(p.elements).toHaveLength(0);
  });

  it('round-trips a custom corner motif', () => {
    const svg = '<svg viewBox="0 0 100 100"><path d="M0 0H30V30H0Z"/></svg>';
    const p = { ...defaultProject(), border: { ...DEFAULT_BORDER, style: 'corners' as const, motifId: 'custom', motifSvg: svg } };
    expect(parseProject(serializeProject(p)).border).toEqual(p.border);
  });

  it('clamps a shallow border inset on a scallop badge when the file opens', () => {
    const p = parse({ shape: { kind: 'scallop', scallopMm: 4 }, border: { insetMm: 1 } });
    expect(p.border.insetMm).toBe(4);
  });

  it('drops a corner motif that is not a string', () => {
    expect(parse({ border: { motifSvg: 7 } }).border.motifSvg).toBeUndefined();
  });

  it('falls back to the default border style when the style is invalid', () => {
    const p = parse({ border: { style: 'wiggly', widthMm: 2 } });
    expect(p.border.style).toBe(DEFAULT_BORDER.style);
    expect(p.border.widthMm).toBe(2);
  });

  it('clamps the shape and drops wrong-typed fields', () => {
    const p = parse({ shape: { kind: 'rounded', widthMm: 'wide', heightMm: 1, cornerMm: 500 } });
    expect(p.shape.widthMm).toBe(101.6);
    expect(p.shape.heightMm).toBe(5);
    expect(p.shape.cornerMm).toBe(2.5);
    expect(parse({ shape: { kind: 'nope' } }).shape.kind).toBe('rounded');
  });

  it('turns a layerId that names no layer into null', () => {
    const p = parse({ elements: [textElement({ role: { ...role, layerId: 'ghost' } })] });
    expect(p.elements[0].role.layerId).toBeNull();
  });

  it('keeps a layerId that names a layer', () => {
    const p = parse({
      layers: [{ id: 'backing', name: 'MDF', thicknessMm: 3 }, { id: 'a1', name: 'Acrylic', thicknessMm: 2 }],
      elements: [textElement({ role: { ...role, layerId: 'a1' } })],
    });
    expect(p.elements[0].role.layerId).toBe('a1');
  });

  it('adds a backing layer first when the file lacks one', () => {
    const p = parse({ layers: [{ id: 'a1', name: 'Acrylic', thicknessMm: 2 }] });
    expect(p.layers).toHaveLength(2);
    expect(p.layers[0].id).toBe('backing');
    expect(p.layers[1].id).toBe('a1');
  });

  it('moves the backing layer to the front', () => {
    const p = parse({ layers: [{ id: 'a1', name: 'Acrylic', thicknessMm: 2 }, { id: 'backing', name: 'Oak', thicknessMm: 4 }] });
    expect(p.layers.map((l) => l.id)).toEqual(['backing', 'a1']);
    expect(p.layers[0].name).toBe('Oak');
  });

  it('takes the default role field when a role value is invalid', () => {
    const p = parse({ elements: [textElement({ role: { ...role, laser: 'melt', relief: 'bump', fill: '#ff0000' } })] });
    expect(p.elements[0].role.laser).toBe('engrave');
    expect(p.elements[0].role.relief).toBe('emboss');
    expect(p.elements[0].role.fill).toBe('#ff0000');
  });

  it('takes defaults for invalid mode, variant, unit and relief edge', () => {
    const p = parse({ mode: 'cnc', laserVariant: 'x', unit: 'furlong', relief: { edge: 'round', plateMm: 4 } });
    expect(p.mode).toBe('laser');
    expect(p.laserVariant).toBe('single');
    expect(p.unit).toBe('in');
    expect(p.relief.edge).toBe('fillet');
    expect(p.relief.plateMm).toBe(4);
  });

  it('fills missing text settings from the defaults', () => {
    const p = parse({ elements: [textElement({ text: { text: 'Hi', family: 'Lato', weight: 'bold' } })] });
    const el = p.elements[0];
    expect(el.kind === 'text' && el.text).toEqual({ ...DEFAULT_TEXT, text: 'Hi', family: 'Lato' });
  });

  it('drops a graphic element without a data URL', () => {
    const p = parse({ elements: [{ kind: 'graphic', id: 'g', name: 'G', x: 0, y: 0, rotationDeg: 0, role, vector: false, widthMm: 1, heightMm: 1 }] });
    expect(p.elements).toHaveLength(0);
  });

  it('keeps a text element without rotationDeg and turns it to 0', () => {
    const p = parse({ elements: [textElement({ rotationDeg: undefined })] });
    expect(p.elements).toHaveLength(1);
    expect(p.elements[0].rotationDeg).toBe(0);
  });

  it('drops a text element with a zero cap height', () => {
    expect(parse({ elements: [textElement({ capHeightMm: 0 })] }).elements).toHaveLength(0);
  });

  it('drops a graphic element with a non-positive size', () => {
    const g = { kind: 'graphic', id: 'g', name: 'G', x: 0, y: 0, rotationDeg: 0, role, dataUrl: 'data:,', vector: false, widthMm: 1, heightMm: 1 };
    expect(parse({ elements: [{ ...g, widthMm: 0 }, { ...g, heightMm: -2 }, g] }).elements).toHaveLength(1);
  });

  it('gives a layer with a negative thickness 3 mm', () => {
    const p = parse({ layers: [{ id: 'backing', name: 'MDF', thicknessMm: -1 }, { id: 'a1', name: 'Acrylic', thicknessMm: 0 }] });
    expect(p.layers.map((l) => l.thicknessMm)).toEqual([3, 3]);
  });

  it('turns a layerId of backing into null', () => {
    const p = parse({ elements: [textElement({ role: { ...role, layerId: 'backing' } })] });
    expect(p.elements[0].role.layerId).toBeNull();
  });
});
