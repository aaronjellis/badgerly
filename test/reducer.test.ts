import { describe, expect, it } from 'vitest';
import { BACKING_ID, defaultProject } from '../src/engine/model';
import type { BadgeProject, GraphicElement } from '../src/engine/model';
import { reduce } from '../src/state/reducer';

const graphic = (id: string): GraphicElement => ({
  kind: 'graphic',
  id,
  name: 'Logo',
  x: 1,
  y: 2,
  rotationDeg: 0,
  role: { ...defaultProject().elements[0].role },
  dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>',
  vector: true,
  widthMm: 10,
  heightMm: 10,
});

describe('reducer', () => {
  it('setShape clamps the corner', () => {
    expect(reduce(defaultProject(), { type: 'setShape', patch: { cornerMm: 99 } }).shape.cornerMm).toBe(25.4);
  });

  it('removing a layer moves its elements to the backing', () => {
    let p = defaultProject();
    p.laserVariant = 'stacked';
    p = reduce(p, { type: 'updateElement', id: p.elements[0].id, patch: { role: { ...p.elements[0].role, layerId: p.layers[1].id } } });
    p = reduce(p, { type: 'removeLayer', id: p.layers[1].id });
    expect(p.elements[0].role.layerId).toBeNull();
  });

  it('a new element in stacked mode goes on the first top layer', () => {
    const p = reduce({ ...defaultProject(), laserVariant: 'stacked' }, { type: 'addElement', element: { ...defaultProject().elements[0], id: 'e2' } });
    expect(p.elements[1].role.layerId).toBe(p.layers[1].id);
  });

  it('a new element outside stacked mode stays on the backing', () => {
    const p = reduce(defaultProject(), { type: 'addElement', element: graphic('g1') });
    expect(p.elements).toHaveLength(2);
    expect(p.elements[1].role.layerId).toBeNull();
  });

  it('set merges the patch and leaves the rest', () => {
    const p = reduce(defaultProject(), { type: 'set', patch: { name: 'Sign', mode: 'print3d' } });
    expect(p.name).toBe('Sign');
    expect(p.mode).toBe('print3d');
    expect(p.unit).toBe('in');
  });

  it('setBorder and setRelief merge into their config', () => {
    const base = defaultProject();
    const b = reduce(base, { type: 'setBorder', patch: { widthMm: 2 } });
    expect(b.border).toEqual({ ...base.border, widthMm: 2 });
    const r = reduce(base, { type: 'setRelief', patch: { plateMm: 5 } });
    expect(r.relief).toEqual({ ...base.relief, plateMm: 5 });
  });

  it('setBorder limits the inset to half the line width', () => {
    const b = reduce(defaultProject(), { type: 'setBorder', patch: { insetMm: 0.2, widthMm: 3 } });
    expect(b.border.insetMm).toBe(1.5);
  });

  it('setShape to a scallop raises a shallow inset to the scallop size', () => {
    const p = reduce(defaultProject(), { type: 'setShape', patch: { kind: 'scallop', scallopMm: 6 } });
    expect(p.border.insetMm).toBe(6);
  });

  it('updateElement merges into one element only', () => {
    let p = reduce(defaultProject(), { type: 'addElement', element: graphic('g1') });
    p = reduce(p, { type: 'updateElement', id: 'g1', patch: { x: 7, name: 'Crest' } });
    expect(p.elements[1]).toMatchObject({ id: 'g1', x: 7, y: 2, name: 'Crest' });
    expect(p.elements[0].x).toBe(0);
  });

  it('removeElement drops the element', () => {
    let p = reduce(defaultProject(), { type: 'addElement', element: graphic('g1') });
    p = reduce(p, { type: 'removeElement', id: 'g1' });
    expect(p.elements).toHaveLength(1);
    expect(p.elements[0].kind).toBe('text');
  });

  it('duplicateElement copies with a new id, a "copy" suffix and a 5 mm offset', () => {
    let p = reduce(defaultProject(), { type: 'addElement', element: graphic('g1') });
    p = reduce(p, { type: 'duplicateElement', id: 'g1' });
    expect(p.elements).toHaveLength(3);
    const copy = p.elements[2];
    expect(copy.id).not.toBe('g1');
    expect(copy.name).toBe('Logo copy');
    expect(copy.x).toBe(6);
    expect(copy.y).toBe(7);
    expect(copy.role).toEqual(p.elements[1].role);
    expect(copy.role).not.toBe(p.elements[1].role);
  });

  it('addLayer appends a top layer; updateLayer edits it', () => {
    let p = reduce(defaultProject(), { type: 'addLayer' });
    expect(p.layers).toHaveLength(3);
    const added = p.layers[2];
    expect(added.id).not.toBe(BACKING_ID);
    p = reduce(p, { type: 'updateLayer', id: added.id, patch: { name: 'Gold', thicknessMm: 1.5 } });
    expect(p.layers[2]).toEqual({ id: added.id, name: 'Gold', thicknessMm: 1.5 });
    expect(p.layers[1].name).toBe('Acrylic');
  });

  it('the backing layer cannot be removed', () => {
    const p = defaultProject();
    expect(reduce(p, { type: 'removeLayer', id: BACKING_ID }).layers).toEqual(p.layers);
  });

  it('load replaces the project', () => {
    const other: BadgeProject = { ...defaultProject(), name: 'Other' };
    const loaded = reduce(defaultProject(), { type: 'load', project: other });
    expect(loaded).toBe(other);
  });

  it('does not mutate the project it is given', () => {
    const p = defaultProject();
    const copy = structuredClone(p);
    reduce(p, { type: 'setShape', patch: { cornerMm: 3 } });
    reduce(p, { type: 'updateElement', id: p.elements[0].id, patch: { x: 1, y: 1 } });
    reduce(p, { type: 'removeLayer', id: p.layers[1].id });
    expect(p).toEqual(copy);
  });
});
