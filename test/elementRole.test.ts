import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE, defaultProject } from '../src/engine/model';
import { roleLabel } from '../src/ui/sections/elementRole';

describe('roleLabel', () => {
  const base = () => {
    const p = defaultProject();
    return { p, el: p.elements[0] };
  };

  it('names the laser operation in laser mode', () => {
    const { p, el } = base();
    expect(roleLabel(p, el)).toBe('Engrave');
    expect(roleLabel(p, { ...el, role: { ...el.role, laser: 'score' } })).toBe('Score');
    expect(roleLabel(p, { ...el, role: { ...el.role, laser: 'cutout' } })).toBe('Cut out');
  });

  it('says Print for colored elements in print and cut', () => {
    const { p, el } = base();
    p.laserVariant = 'printcut';
    expect(roleLabel(p, el)).toBe('Engrave');
    expect(roleLabel(p, { ...el, role: { ...DEFAULT_ROLE, printColor: true } })).toBe('Print');
  });

  it('names the layer in stacked mode', () => {
    const { p, el } = base();
    p.laserVariant = 'stacked';
    expect(roleLabel(p, el)).toBe('MDF');
    expect(roleLabel(p, { ...el, role: { ...el.role, layerId: p.layers[1].id } })).toBe('Acrylic');
    expect(roleLabel(p, { ...el, role: { ...el.role, layerId: 'gone' } })).toBe('MDF');
  });

  it('says Raised or Sunk in 3D', () => {
    const { p, el } = base();
    p.mode = 'print3d';
    expect(roleLabel(p, el)).toBe('Raised');
    expect(roleLabel(p, { ...el, role: { ...el.role, relief: 'deboss' } })).toBe('Sunk');
  });
});
