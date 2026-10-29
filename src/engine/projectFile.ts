import { clampBorder, DEFAULT_BORDER } from './border';
import type { BorderConfig, BorderStyle } from './border';
import { BACKING_ID, DEFAULT_RELIEF, DEFAULT_ROLE, defaultBackingLayer, defaultLayers, defaultProject, newId } from './model';
import type { BadgeElement, BadgeProject, ElementRole, Layer, ReliefConfig } from './model';
import { clampShape, DEFAULT_SHAPE, SHAPE_OPTIONS } from './shapes';
import type { ShapeConfig } from './shapes';
import { DEFAULT_TEXT } from './textOutline';
import type { TextConfig } from './textOutline';

/** The project file's extension; the file itself is JSON. */
export const PROJECT_EXTENSION = '.badge';
/** The thickness a layer takes when the file gives none that makes sense. */
const DEFAULT_LAYER_MM = 3;
const FORMAT = 'badgerly-project';
const VERSION = 1;

/** The project as `.badge` file text. */
export function serializeProject(project: BadgeProject): string {
  return JSON.stringify({ format: FORMAT, savedAt: new Date().toISOString(), ...project, version: VERSION }, null, 2);
}

/** Why a file could not be opened, in words for the person who picked it. */
export class ProjectFileError extends Error {}

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** A size in mm: finite and above zero. */
const isSize = (v: unknown): v is number => isNum(v) && v > 0;
const isStr = (v: unknown): v is string => typeof v === 'string';
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** `defaults` with every number, string or boolean field of `raw` that has the same type as its default. */
function mergeScalars<T extends object>(defaults: T, raw: unknown): T {
  const out = { ...defaults } as Raw;
  if (!isRecord(raw)) return out as T;
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = raw[key];
    if (typeof fallback === 'number' ? isNum(value) : typeof value === typeof fallback && typeof fallback !== 'object') {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * `parsed` with each of `sizes` that is not above zero, and each of `lengths` that is below zero,
 * put back to its default: a file's zero line width or negative plate is not a badge.
 */
function keepSizes<T extends object>(parsed: T, defaults: T, sizes: (keyof T)[], lengths: (keyof T)[] = []): T {
  for (const key of sizes) if (!isSize(parsed[key])) parsed[key] = defaults[key];
  for (const key of lengths) if (!(isNum(parsed[key]) && (parsed[key] as number) >= 0)) parsed[key] = defaults[key];
  return parsed;
}

const SHAPE_KINDS = SHAPE_OPTIONS.map((o) => o.kind);
const BORDER_STYLES: BorderStyle[] = ['none', 'single', 'double', 'dashed', 'corners'];

function parseShape(raw: unknown): ShapeConfig {
  const shape = mergeScalars(DEFAULT_SHAPE, raw);
  shape.kind = oneOf(isRecord(raw) ? raw.kind : undefined, SHAPE_KINDS, DEFAULT_SHAPE.kind);
  return clampShape(shape);
}

function parseBorder(raw: unknown): BorderConfig {
  const border = mergeScalars(DEFAULT_BORDER, raw);
  const r = isRecord(raw) ? raw : {};
  border.style = oneOf(r.style, BORDER_STYLES, DEFAULT_BORDER.style);
  border.relief = oneOf(r.relief, ['emboss', 'deboss'], DEFAULT_BORDER.relief);
  if (isStr(r.motifSvg)) border.motifSvg = r.motifSvg;
  return keepSizes(border, DEFAULT_BORDER, ['widthMm', 'gapMm', 'dashMm', 'dashGapMm', 'motifSizeMm', 'reliefMm'], ['insetMm']);
}

function parseRelief(raw: unknown): ReliefConfig {
  const relief = mergeScalars(DEFAULT_RELIEF, raw);
  const r = isRecord(raw) ? raw : {};
  relief.edge = oneOf(r.edge, ['none', 'chamfer', 'fillet'], DEFAULT_RELIEF.edge);
  return keepSizes(relief, DEFAULT_RELIEF, ['plateMm', 'edgeMm', 'recessMm'], ['clearanceMm']);
}

/** Keeps valid layers, puts the backing first, and adds one when the file has none. */
function parseLayers(raw: unknown): Layer[] {
  if (!Array.isArray(raw)) return defaultLayers();
  const seen = new Set<string>();
  const layers: Layer[] = [];
  for (const l of raw as unknown[]) {
    if (!isRecord(l) || !isStr(l.id) || !isStr(l.name) || seen.has(l.id)) continue;
    seen.add(l.id);
    layers.push({ id: l.id, name: l.name, thicknessMm: isSize(l.thicknessMm) ? l.thicknessMm : DEFAULT_LAYER_MM });
  }
  const backing = layers.find((l) => l.id === BACKING_ID) ?? defaultBackingLayer();
  return [backing, ...layers.filter((l) => l.id !== BACKING_ID)];
}

function parseRole(raw: unknown, layerIds: Set<string>): ElementRole {
  const r = isRecord(raw) ? raw : {};
  return {
    laser: oneOf(r.laser, ['engrave', 'score', 'cutout'], DEFAULT_ROLE.laser),
    printColor: typeof r.printColor === 'boolean' ? r.printColor : DEFAULT_ROLE.printColor,
    fill: isStr(r.fill) ? r.fill : DEFAULT_ROLE.fill,
    // Null is the one way to say "on the backing".
    layerId: isStr(r.layerId) && r.layerId !== BACKING_ID && layerIds.has(r.layerId) ? r.layerId : null,
    relief: oneOf(r.relief, ['emboss', 'deboss'], DEFAULT_ROLE.relief),
    reliefMm: isSize(r.reliefMm) ? r.reliefMm : DEFAULT_ROLE.reliefMm,
  };
}

/** The text settings, or null when the text or family is missing: nothing can be drawn without them. */
function parseTextConfig(raw: unknown): TextConfig | null {
  if (!isRecord(raw) || !isStr(raw.text) || !isStr(raw.family)) return null;
  const text = mergeScalars(DEFAULT_TEXT, raw);
  text.style = oneOf(raw.style, ['normal', 'italic'], DEFAULT_TEXT.style);
  text.align = oneOf(raw.align, ['left', 'center', 'right'], DEFAULT_TEXT.align);
  // A pair key is "line:index"; anything else could never name a pair.
  text.pairAdjustEm = isRecord(raw.pairAdjustEm)
    ? Object.fromEntries(Object.entries(raw.pairAdjustEm).filter((e): e is [string, number] => /^\d+:\d+$/.test(e[0]) && isNum(e[1])))
    : {};
  return text;
}

/** One element, or null when its kind is unknown or a field it cannot do without is missing. */
function parseElement(raw: unknown, layerIds: Set<string>): BadgeElement | null {
  if (!isRecord(raw) || !isStr(raw.id) || !isNum(raw.x) || !isNum(raw.y)) return null;
  const base = {
    id: raw.id,
    x: raw.x,
    y: raw.y,
    rotationDeg: isNum(raw.rotationDeg) ? raw.rotationDeg : 0,
    role: parseRole(raw.role, layerIds),
  };
  if (raw.kind === 'text') {
    const text = parseTextConfig(raw.text);
    if (!text || !isSize(raw.capHeightMm)) return null;
    return { ...base, kind: 'text', name: isStr(raw.name) ? raw.name : 'Text', text, capHeightMm: raw.capHeightMm };
  }
  if (raw.kind === 'graphic') {
    // Only an image data URL draws here; anything else (a web address, a script) is not kept.
    if (!isStr(raw.dataUrl) || !raw.dataUrl.startsWith('data:image/') || !isSize(raw.widthMm) || !isSize(raw.heightMm)) return null;
    return {
      ...base,
      kind: 'graphic',
      name: isStr(raw.name) ? raw.name : 'Graphic',
      dataUrl: raw.dataUrl,
      vector: typeof raw.vector === 'boolean' ? raw.vector : false,
      widthMm: raw.widthMm,
      heightMm: raw.heightMm,
    };
  }
  return null;
}

/** The elements with every id used once: the first keeps it, a later one gets a new id, so selecting one never selects two. */
function uniqueIds(elements: BadgeElement[]): BadgeElement[] {
  const seen = new Set<string>();
  return elements.map((el) => {
    let id = el.id;
    while (seen.has(id)) id = newId();
    seen.add(id);
    return id === el.id ? el : { ...el, id };
  });
}

/**
 * Reads `.badge` file text. Settings the file lacks take their defaults, and settings of the wrong
 * type, elements of an unknown kind, and elements missing a required field are dropped, so files
 * with extra or missing fields open. A file saved by a newer version throws instead.
 */
export function parseProject(text: string): BadgeProject {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFileError('This file isn’t a Badgerly project: it couldn’t be read.');
  }
  if (!isRecord(raw) || raw.format !== FORMAT) {
    throw new ProjectFileError('This file isn’t a Badgerly project.');
  }
  if (typeof raw.version !== 'number') {
    throw new ProjectFileError('This file isn’t a Badgerly project.');
  }
  if (raw.version > VERSION) {
    throw new ProjectFileError('This project was saved by a newer Badgerly. Reload the page to update, then open it again.');
  }

  const defaults = defaultProject();
  const layers = parseLayers(raw.layers);
  const layerIds = new Set(layers.map((l) => l.id));
  const elements = Array.isArray(raw.elements)
    ? uniqueIds((raw.elements as unknown[]).flatMap((e) => parseElement(e, layerIds) ?? []))
    : defaults.elements;

  const shape = parseShape(raw.shape);
  return {
    version: VERSION,
    name: isStr(raw.name) ? raw.name : defaults.name,
    unit: oneOf(raw.unit, ['mm', 'in'], defaults.unit),
    mode: oneOf(raw.mode, ['laser', 'print3d'], defaults.mode),
    laserVariant: oneOf(raw.laserVariant, ['single', 'stacked', 'printcut'], defaults.laserVariant),
    shape,
    border: clampBorder(parseBorder(raw.border), shape),
    elements,
    layers,
    relief: parseRelief(raw.relief),
  };
}
