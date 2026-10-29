/** The badge project's state: one reducer holds every edit, so the editor and its tests share the same rules. */
import { BACKING_ID, newId } from '../engine/model';
import type { BadgeElement, BadgeProject, Layer, ReliefConfig } from '../engine/model';
import { clampBorder } from '../engine/border';
import { edgeInsetMm } from '../engine/relief';
import type { BorderConfig } from '../engine/border';
import { clampShape } from '../engine/shapes';
import type { ShapeConfig } from '../engine/shapes';

export type Action =
  | { type: 'set'; patch: Partial<BadgeProject> }
  | { type: 'setShape'; patch: Partial<ShapeConfig> }
  | { type: 'setBorder'; patch: Partial<BorderConfig> }
  | { type: 'setRelief'; patch: Partial<ReliefConfig> }
  | { type: 'addElement'; element: BadgeElement }
  | { type: 'updateElement'; id: string; patch: Partial<BadgeElement> }
  | { type: 'removeElement'; id: string }
  /** Puts a removed element back where it stood in the list, as it was. */
  | { type: 'restoreElement'; element: BadgeElement; index: number }
  | { type: 'duplicateElement'; id: string }
  | { type: 'addLayer' }
  | { type: 'updateLayer'; id: string; patch: Partial<Layer> }
  | { type: 'removeLayer'; id: string } // elements on it move to the backing
  | { type: 'load'; project: BadgeProject };

/** How far a duplicate sits from the original, in mm, in x and y. */
const DUPLICATE_OFFSET_MM = 5;

const mapElement = (p: BadgeProject, id: string, fn: (el: BadgeElement) => BadgeElement): BadgeProject => ({
  ...p,
  elements: p.elements.map((el) => (el.id === id ? fn(el) : el)),
});

/** The project with its border's inset held to what its shape and, in 3D, its edge allow. */
const withBorderClamped = (p: BadgeProject): BadgeProject => {
  const border = clampBorder(p.border, p.shape, edgeInsetMm(p));
  return border === p.border ? p : { ...p, border };
};

export function reduce(p: BadgeProject, a: Action): BadgeProject {
  switch (a.type) {
    case 'set':
      // Switching to 3D print brings the edge's floor in.
      return withBorderClamped({ ...p, ...a.patch });
    case 'setShape':
      // A new shape can move the scallop floor, or the edge's, under the border's inset.
      return withBorderClamped({ ...p, shape: clampShape({ ...p.shape, ...a.patch }) });
    case 'setBorder':
      return withBorderClamped({ ...p, border: { ...p.border, ...a.patch } });
    case 'setRelief':
      return withBorderClamped({ ...p, relief: { ...p.relief, ...a.patch } });
    case 'addElement': {
      // In stacked mode a new element goes on the first top layer, not the backing.
      const top = p.layers.find((l) => l.id !== BACKING_ID);
      const onBacking = a.element.role.layerId === null;
      const element: BadgeElement =
        p.laserVariant === 'stacked' && top && onBacking ? { ...a.element, role: { ...a.element.role, layerId: top.id } } : a.element;
      return { ...p, elements: [...p.elements, element] };
    }
    case 'updateElement':
      return mapElement(p, a.id, (el) => ({ ...el, ...a.patch }) as BadgeElement);
    case 'removeElement':
      return { ...p, elements: p.elements.filter((el) => el.id !== a.id) };
    case 'restoreElement': {
      if (p.elements.some((el) => el.id === a.element.id)) return p;
      const elements = [...p.elements];
      elements.splice(Math.max(0, Math.min(a.index, elements.length)), 0, a.element);
      return { ...p, elements };
    }
    case 'duplicateElement': {
      const source = p.elements.find((el) => el.id === a.id);
      if (!source) return p;
      const copy = structuredClone(source);
      copy.id = newId();
      copy.name = `${source.name} copy`;
      copy.x += DUPLICATE_OFFSET_MM;
      copy.y += DUPLICATE_OFFSET_MM;
      return { ...p, elements: [...p.elements, copy] };
    }
    case 'addLayer':
      return { ...p, layers: [...p.layers, { id: newId(), name: `Layer ${p.layers.length}`, thicknessMm: 3 }] };
    case 'updateLayer':
      return { ...p, layers: p.layers.map((l) => (l.id === a.id ? { ...l, ...a.patch, id: l.id } : l)) };
    case 'removeLayer': {
      if (a.id === BACKING_ID) return p;
      return {
        ...p,
        layers: p.layers.filter((l) => l.id !== a.id),
        elements: p.elements.map((el) => (el.role.layerId === a.id ? { ...el, role: { ...el.role, layerId: null } } : el)),
      };
    }
    case 'load':
      return a.project;
  }
}
