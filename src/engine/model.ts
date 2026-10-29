/** The badge project: what the editor edits, what the `.badge` file holds, and what every export reads. */
import { DEFAULT_BORDER } from './border';
import type { BorderConfig } from './border';
import { DEFAULT_SHAPE } from './shapes';
import type { ShapeConfig } from './shapes';
import { DEFAULT_TEXT } from './textOutline';
import type { TextConfig } from './textOutline';

export type { DisplayUnit } from './types';
import type { DisplayUnit } from './types';

export type Mode = 'laser' | 'print3d';
export type LaserVariant = 'single' | 'stacked' | 'printcut';
export type LaserRole = 'engrave' | 'score' | 'cutout';

/** What an element becomes in each output: laser operation, print color, layer, and relief. */
export interface ElementRole {
  laser: LaserRole;
  printColor: boolean;
  fill: string;
  /** The layer the element sits on; null means the backing. */
  layerId: string | null;
  relief: 'emboss' | 'deboss';
  reliefMm: number;
}

/** `(x, y)` is the center of the element's unrotated ink box in badge coordinates, in mm. */
export interface ElementBase {
  id: string;
  name: string;
  x: number;
  y: number;
  rotationDeg: number;
  role: ElementRole;
}

export interface TextElement extends ElementBase {
  kind: 'text';
  text: TextConfig;
  capHeightMm: number;
}

export interface GraphicElement extends ElementBase {
  kind: 'graphic';
  dataUrl: string;
  vector: boolean;
  widthMm: number;
  heightMm: number;
}

export type BadgeElement = TextElement | GraphicElement;

export interface Layer {
  id: string;
  name: string;
  thicknessMm: number;
}

export interface ReliefConfig {
  plateMm: number;
  edge: 'none' | 'chamfer' | 'fillet';
  edgeMm: number;
  split: boolean;
  recessMm: number;
  clearanceMm: number;
}

export interface BadgeProject {
  version: 1;
  name: string;
  unit: DisplayUnit;
  mode: Mode;
  laserVariant: LaserVariant;
  shape: ShapeConfig;
  border: BorderConfig;
  elements: BadgeElement[];
  layers: Layer[];
  relief: ReliefConfig;
}

/** The id of the backing layer, which is always first. */
export const BACKING_ID = 'backing';

export const DEFAULT_ROLE: ElementRole = {
  laser: 'engrave',
  printColor: false,
  fill: '#000000',
  layerId: null,
  relief: 'emboss',
  reliefMm: 1,
};

export const DEFAULT_RELIEF: ReliefConfig = {
  plateMm: 3,
  edge: 'fillet',
  edgeMm: 1,
  split: false,
  recessMm: 0.6,
  clearanceMm: 0.1,
};

/** A short random id, unique within a session in practice. */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

export const defaultBackingLayer = (): Layer => ({ id: BACKING_ID, name: 'MDF', thicknessMm: 3 });
export const defaultLayers = (): Layer[] => [defaultBackingLayer(), { id: newId(), name: 'Acrylic', thicknessMm: 3 }];

export function defaultProject(): BadgeProject {
  return {
    version: 1,
    name: 'Badge',
    unit: 'in',
    mode: 'laser',
    laserVariant: 'single',
    shape: { ...DEFAULT_SHAPE },
    border: { ...DEFAULT_BORDER },
    elements: [
      {
        kind: 'text',
        id: newId(),
        name: 'Text',
        x: 0,
        y: 0,
        rotationDeg: 0,
        role: { ...DEFAULT_ROLE },
        text: { ...DEFAULT_TEXT, pairAdjustEm: {} },
        // 0.3 in: 'YOUR NAME' in Cinzel 700 at 12.7 mm caps is wider than the default badge.
        capHeightMm: 7.62,
      },
    ],
    layers: defaultLayers(),
    relief: { ...DEFAULT_RELIEF },
  };
}
