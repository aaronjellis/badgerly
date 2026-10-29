/**
 * Uploaded SVG text to a polygon set, in the SVG's own viewBox units (one unit counts as one mm
 * for the flattening tolerance; callers scale the result). The text is read with a tokenizer
 * rather than a DOM so this runs in node tests and workers alike.
 */
import { Clipper, FillRule } from 'clipper2-js';
import { fromPaths64, toPaths64, union } from './geom';
import type { Poly, Rect } from './geom';
import { NUMBER, flattenPath } from './svgPath';

export interface SvgShape {
  /** The non-zero union of every filled element. */
  poly: Poly;
  viewBox: Rect;
  /** True when every drawable element is an unfilled stroke, so there is no area to use. */
  strokeOnly: boolean;
}

/** A 2D affine map [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m` after `n`: applying the result moves a point by `n` first, then by `m`. */
function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** The transform list of an element, applied left to right as SVG defines it. */
function parseTransform(text: string | undefined): Matrix {
  let m = IDENTITY;
  if (!text) return m;
  for (const call of text.matchAll(/([A-Za-z]+)\s*\(([^)]*)\)/g)) {
    const v = (call[2].match(NUMBER) ?? []).map(Number);
    const rad = (deg: number) => (deg * Math.PI) / 180;
    let t: Matrix | null = null;
    switch (call[1]) {
      case 'translate':
        if (v.length === 1 || v.length === 2) t = [1, 0, 0, 1, v[0], v[1] ?? 0];
        break;
      case 'scale':
        if (v.length === 1 || v.length === 2) t = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
        break;
      case 'rotate':
        if (v.length === 1 || v.length === 3) {
          const [cos, sin] = [Math.cos(rad(v[0])), Math.sin(rad(v[0]))];
          const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
          t = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
        }
        break;
      case 'matrix':
        if (v.length === 6) t = v as Matrix;
        break;
      case 'skewX':
        if (v.length === 1) t = [1, 0, Math.tan(rad(v[0])), 1, 0, 0];
        break;
      case 'skewY':
        if (v.length === 1) t = [1, Math.tan(rad(v[0])), 0, 1, 0, 0];
        break;
    }
    if (t) m = multiply(m, t);
  }
  return m;
}

/** The largest factor by which the map stretches a distance. */
function maxScale(m: Matrix): number {
  return Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
}

type Attrs = Record<string, string>;

function parseAttrs(text: string): Attrs {
  const out: Attrs = {};
  const re = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out[m[1]] ??= m[2] ?? m[3] ?? '';
  return out;
}

/** CSS declarations of a `style` attribute, with names lowercased. */
function parseStyle(text: string | undefined): Attrs {
  const out: Attrs = {};
  for (const decl of (text ?? '').split(';')) {
    const colon = decl.indexOf(':');
    if (colon > 0) out[decl.slice(0, colon).trim().toLowerCase()] = decl.slice(colon + 1).replace(/!important/i, '').trim();
  }
  return out;
}

/** A length in user units: a bare number or px. Real units (mm, in) need a viewBox to place. */
function userUnits(value: string | undefined): number | null {
  const m = value?.trim().match(/^([\d.]+)(px)?$/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readViewBox(root: Attrs): Rect | null {
  const vb = root.viewBox?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  const w = userUnits(root.width);
  const h = userUnits(root.height);
  return w && h ? { x: 0, y: 0, w, h } : null;
}

/** The viewBox an SVG document's root declares (else its plain width and height), or null. */
export function svgViewBox(svgText: string): Rect | null {
  const root = svgText.replace(/<!--[\s\S]*?-->/g, '').match(/<svg\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/i);
  return root ? readViewBox(parseAttrs(root[1])) : null;
}

/** Elements whose children are never drawn directly. */
const NOT_RENDERED = new Set(['defs', 'clippath', 'mask', 'symbol', 'metadata', 'title', 'desc', 'pattern', 'marker', 'lineargradient', 'radialgradient', 'filter', 'foreignobject']);

/** Elements that fill an area, and the open ones that are drawn but never read for area. */
const FILLED = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon']);
const STROKED = new Set(['line', 'polyline']);

/** What an element passes down to its children. */
interface Frame {
  name: string;
  matrix: Matrix;
  fill: string;
  stroke: string;
  rule: FillRule;
  skip: boolean;
}

/** Declarations by class name, from a stylesheet's rules whose selectors are plain classes (`.a`, `.a, .b`). */
type ClassRules = Map<string, Attrs>;

/** The simple class rules of every `<style>` block, as Illustrator and Inkscape write them; other rules are ignored. */
function readClassRules(svgText: string): ClassRules {
  const rules: ClassRules = new Map();
  for (const block of svgText.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    const css = block[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selectors = rule[1].split(',').map((sel) => sel.trim());
      if (!selectors.every((sel) => /^\.[\w-]+$/.test(sel))) continue;
      const decls = parseStyle(rule[2]);
      for (const sel of selectors) rules.set(sel.slice(1), { ...rules.get(sel.slice(1)), ...decls });
    }
  }
  return rules;
}

/** The declarations the element's classes give it, in the order the classes are listed. */
function classProps(attrs: Attrs, rules: ClassRules): Attrs {
  const out: Attrs = {};
  for (const name of (attrs.class ?? '').split(/\s+/)) Object.assign(out, rules.get(name));
  return out;
}

/** A paint that draws nothing. */
const isNone = (paint: string) => paint === 'none' || paint === 'transparent';

function childFrame(parent: Frame, name: string, attrs: Attrs, rules: ClassRules): Frame {
  // A class rule beats a presentation attribute, and an inline style beats both, as in CSS.
  const props = { ...attrs, ...classProps(attrs, rules), ...parseStyle(attrs.style) };
  const inherit = (value: string | undefined, fallback: string) => (value === undefined || value === 'inherit' ? fallback : value);
  return {
    name,
    matrix: multiply(parent.matrix, parseTransform(attrs.transform)),
    fill: inherit(props.fill, parent.fill).toLowerCase(),
    stroke: inherit(props.stroke, parent.stroke).toLowerCase(),
    rule: props['fill-rule'] === undefined ? parent.rule : props['fill-rule'] === 'evenodd' ? FillRule.EvenOdd : FillRule.NonZero,
    skip: parent.skip || NOT_RENDERED.has(name) || props.display === 'none',
  };
}

const num = (value: string | undefined, fallback = 0) => {
  const n = value === undefined ? NaN : Number(value.trim().replace(/px$/, ''));
  return Number.isFinite(n) ? n : fallback;
};

/** The outline of a rect, with corner arcs when rx or ry is set, as path data. */
function rectPath(a: Attrs): string | null {
  const [x, y, w, h] = [num(a.x), num(a.y), num(a.width), num(a.height)];
  if (!(w > 0 && h > 0)) return null;
  const rxAttr = num(a.rx, -1);
  const ryAttr = num(a.ry, -1);
  const rx = Math.min(w / 2, Math.max(0, rxAttr >= 0 ? rxAttr : Math.max(0, ryAttr)));
  const ry = Math.min(h / 2, Math.max(0, ryAttr >= 0 ? ryAttr : Math.max(0, rxAttr)));
  if (rx === 0 || ry === 0) return `M${x} ${y}h${w}v${h}h${-w}z`;
  return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}z`;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string | null {
  if (!(rx > 0 && ry > 0)) return null;
  return `M${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}z`;
}

function polygonPath(points: string | undefined): string | null {
  const v = points?.match(NUMBER);
  if (!v || v.length < 6) return null;
  const pairs: string[] = [];
  for (let k = 0; k + 1 < v.length; k += 2) pairs.push(`${v[k]} ${v[k + 1]}`);
  return `M${pairs.join('L')}z`;
}

/** The path data that outlines a filled shape element, or null when it draws nothing. */
function shapePath(name: string, a: Attrs): string | null {
  if (name === 'path') return a.d ?? null;
  if (name === 'rect') return rectPath(a);
  if (name === 'circle') return ellipsePath(num(a.cx), num(a.cy), num(a.r), num(a.r));
  if (name === 'ellipse') return ellipsePath(num(a.cx), num(a.cy), num(a.rx), num(a.ry));
  if (name === 'polygon') return polygonPath(a.points);
  return null;
}

/**
 * Reads an SVG's filled shapes into one polygon set in viewBox units. Handles `path`, `rect`,
 * `circle`, `ellipse` and `polygon` with transforms on the shape or any group around it; skips
 * unfilled shapes and everything that is not drawn directly (`defs`, `clipPath`, `use`, ...).
 * Returns null when the text has no `svg` root or the root has neither a viewBox nor a plain
 * width and height.
 */
export function parseSvgShape(svgText: string, tolMm: number): SvgShape | null {
  const rules = readClassRules(svgText.replace(/<!--[\s\S]*?-->/g, ''));
  const text = svgText
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?[^>]*>/gi, '')
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, '');
  const tags = text.matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g);

  let stack: Frame[] = [];
  let viewBox: Rect | null = null;
  const regions: Poly[] = [];
  let drawables = 0;
  let allStroked = true;

  const draw = (name: string, attrs: Attrs, f: Frame) => {
    if (!FILLED.has(name) && !STROKED.has(name)) return;
    // A line has no interior, so its fill never matters.
    const unfilled = name === 'line' || isNone(f.fill);
    drawables++;
    if (!(unfilled && !isNone(f.stroke))) allStroked = false;
    // A polyline is ignored for area, like a line.
    const pathData = FILLED.has(name) ? shapePath(name, attrs) : null;
    if (unfilled || pathData === null) return;
    const scale = maxScale(f.matrix);
    if (!(scale > 0 && Number.isFinite(scale))) return;
    const [a, b, c, d, e, g] = f.matrix;
    const contours = flattenPath(pathData, tolMm / scale)
      .filter((s) => s.length >= 3)
      .map((s) => s.map((p) => ({ x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + g })));
    if (contours.length) regions.push(fromPaths64(Clipper.Union(toPaths64(contours), undefined, f.rule)));
  };

  for (const tag of tags) {
    const closing = tag[1] === '/';
    const name = tag[2].toLowerCase();
    if (closing) {
      const at = stack.map((f) => f.name).lastIndexOf(name);
      if (at > 0) stack = stack.slice(0, at);
      else if (at === 0) break;
      continue;
    }
    const selfClosing = tag[3].trimEnd().endsWith('/');
    const attrs = parseAttrs(tag[3]);
    if (!stack.length) {
      if (name !== 'svg') continue;
      viewBox = readViewBox(attrs);
      if (!viewBox) return null;
      const root: Frame = { name, matrix: IDENTITY, fill: 'black', stroke: 'none', rule: FillRule.NonZero, skip: false };
      stack = [childFrame(root, name, attrs, rules)];
      if (selfClosing) break;
      continue;
    }
    const frame = childFrame(stack[stack.length - 1], name, attrs, rules);
    if (!frame.skip) draw(name, attrs, frame);
    if (!selfClosing) stack.push(frame);
  }

  if (!viewBox) return null;
  // Adding 0 turns a -0 from rounding into 0, so bounds compare equal to plain numbers.
  const poly = union(regions).map((contour) => contour.map((p) => ({ x: p.x + 0, y: p.y + 0 })));
  return { poly, viewBox, strokeOnly: drawables > 0 && allStroked };
}
