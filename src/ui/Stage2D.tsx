import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { FontProvider } from '../engine/fontProvider';
import { bounds, polyToSvgPath } from '../engine/geom';
import type { Pt, Rect } from '../engine/geom';
import { CUT, laserPieces, pieceBounds } from '../engine/laserExport';
import type { SvgPiece } from '../engine/laserExport';
import type { BadgeElement, BadgeProject, DisplayUnit, TextElement } from '../engine/model';
import type { ResolvedBadge, ResolvedElement } from '../engine/resolve';
import { guideLines, snapMove } from '../engine/snapping';
import type { Guides } from '../engine/snapping';
import { capHeightPx, TEXT_RENDER_SIZE_PX } from '../engine/textOutline';
import type { Action } from '../state/reducer';
import { STAGE_ACCENT_HEX } from './stageColors';
import { addPairEm, alongText, fallbackFontMm, fallbackInk, kerningDeltaEm, kerningHandles, pieceSlots, round2, scaleFactor, textLines } from './stageMath';
import { useMediaQuery } from './useMediaQuery';

/** The badge's face on the stage: a step lighter than the stage, so the outline reads against it. */
const BADGE_FILL = '#353b42';
/** Engraved geometry, drawn as light ink: the export's black would vanish on the dark stage. */
const INK = '#e9e4d8';
/** Score lines in the stacked layout: the export's blue, lifted to read on the dark stage. */
const SCORE_TINT = '#6f9bff';
/** The alignment guides while dragging. */
const GUIDE = '#ff2bd6';

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 16;
/** The gap between pieces in the stacked layout, in mm; the export uses the same. */
const GAP_MM = 5;
/** A snap reaches this far on screen, in px. */
const SNAP_PX = 6;
/** A drag starts after the pointer moves this far, in px (more for a finger), so a click does not nudge. */
const DRAG_START_PX = 3;
const DRAG_START_TOUCH_PX = 8;
/** Minimum size a scale handle can shrink an element to, in mm. */
const MIN_SIZE_MM = 1;
const NUDGE_MM = 0.1;
const NUDGE_SHIFT_MM = 1;
/** A kerning handle's arrow-key step, in em. */
const KERN_STEP_EM = 0.01;

/** Room kept clear around the badge when the view fits it, in px: the HUD sits in the top inset. */
const FIT = { side: 24, top: 72, bottom: 24 };
/** The stand-in content box when there is nothing to fit. */
const EMPTY_BOX: Rect = { x: -40, y: -25, w: 80, h: 50 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const rotation = (deg: number, cx: number, cy: number): string | undefined =>
  deg !== 0 ? `rotate(${deg} ${cx} ${cy})` : undefined;

const sizeLabel = (w: number, h: number, unit: DisplayUnit) =>
  unit === 'in' ? `${(w / 25.4).toFixed(2)} × ${(h / 25.4).toFixed(2)} in` : `${w.toFixed(1)} × ${h.toFixed(1)} mm`;

/** Score lines as `M…L…` subpaths; closed lines end in `Z`. */
const linesPath = (lines: Pt[][], closed: boolean) =>
  lines
    .filter((l) => l.length > 1)
    .map((l) => `M${l.map((p) => `${Number(p.x.toFixed(3))} ${Number(p.y.toFixed(3))}`).join('L')}${closed ? 'Z' : ''}`)
    .join('');

/** An editing target is an input of some kind; the stage never takes its keys. */
const isTextTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** A button (the zoom controls) keeps its own keys: Delete or an arrow there must not reach the element. */
const isButtonTarget = (t: EventTarget | null) => t instanceof HTMLElement && t.tagName === 'BUTTON';

type Corner = 'nw' | 'ne' | 'se' | 'sw';
const CORNERS: Corner[] = ['nw', 'ne', 'se', 'sw'];

type Drag =
  | { kind: 'move'; id: string; startX: number; startY: number; ink: Rect; guides: Guides; applied: Pt; origin: Pt; active: boolean }
  | { kind: 'kern'; id: string; key: string; startX: number; startY: number; pair0: number | undefined; outlineCapPx: number }
  | { kind: 'scale'; id: string; center: Pt; startDist: number; orig: { cap: number } | { w: number; h: number } }
  | { kind: 'pan'; startX: number; startY: number; pan0: Pt; moved: boolean };

interface View {
  zoom: number;
  /** How far the view's center sits from the fitted center, in mm. */
  pan: Pt;
}
const HOME: View = { zoom: 1, pan: { x: 0, y: 0 } };

interface Stage2DProps {
  project: BadgeProject;
  resolved: ResolvedBadge;
  selectedId: string | null;
  /** An element picked on the stage, or null for the background. */
  onSelect: (id: string | null) => void;
  dispatch: Dispatch<Action>;
  unit: DisplayUnit;
  fonts: FontProvider;
  /** Whether the selected text shows a handle for each letter pair. */
  adjustPairs: boolean;
}

/**
 * The badge in millimeters: outline, border, and every element, with zoom, pan, dragging with snapping, nudging
 * with the arrow keys, and corner handles that scale the selected element. Badge coordinates are the SVG's
 * coordinates, so the stage only chooses which part of them the viewBox shows.
 */
export const Stage2D: React.FC<Stage2DProps> = ({ project, resolved, selectedId, onSelect, dispatch, unit, fonts, adjustPairs }) => {
  const [view, setView] = useState<View>(HOME);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [showLayout, setShowLayout] = useState(false);
  const [hits, setHits] = useState<{ x: number | null; y: number | null } | null>(null);
  const coarse = useMediaQuery('(pointer: coarse)');

  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const stacked = project.mode === 'laser' && project.laserVariant === 'stacked';
  const layout = stacked && showLayout;

  // The pieces laid side by side, as the export lays them.
  const pieces = useMemo<SvgPiece[] | null>(() => (layout ? laserPieces(project, resolved) : null), [layout, project, resolved]);
  const slots = useMemo(() => (pieces ? pieceSlots(pieces.map(pieceBounds), GAP_MM) : null), [pieces]);

  const content: Rect = (layout ? slots?.bounds : bounds(resolved.outline)) ?? EMPTY_BOX;

  // Fit the content in the room the HUD leaves; zoom and pan are relative to that fit.
  const base = Math.max(
    0.01,
    Math.min((size.w - 2 * FIT.side) / content.w, (size.h - FIT.top - FIT.bottom) / content.h)
  );
  const scale = base * view.zoom; // screen px per mm
  const fit: Pt = { x: content.x + content.w / 2, y: content.y + content.h / 2 - (FIT.top - FIT.bottom) / 2 / base };
  const center: Pt = { x: fit.x + view.pan.x, y: fit.y + view.pan.y };
  const vbW = size.w / scale;
  const vbH = size.h / scale;
  const vbX = center.x - vbW / 2;
  const vbY = center.y - vbH / 2;

  // Handlers on the window and the wrapper read the latest values through this ref.
  const live = useRef({ project, resolved, selectedId, layout, dispatch, onSelect, base, fit, scale, center });
  live.current = { project, resolved, selectedId, layout, dispatch, onSelect, base, fit, scale, center };

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The layout is a different drawing: start from its fit.
  useEffect(() => setView(HOME), [layout]);

  // Wheel zoom about the pointer. React's wheel listener is passive, so it cannot stop a trackpad pinch from
  // zooming the page too; a native non-passive listener can.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      const factor = Math.exp(-clamp(delta, -120, 120) * (e.ctrlKey ? 0.01 : 0.0015));
      const { base: b, fit: f } = live.current;
      setView((v) => {
        const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        if (zoom === v.zoom) return v;
        // Keep the badge point under the pointer where it is.
        const s0 = b * v.zoom;
        const s1 = b * zoom;
        const mx = f.x + v.pan.x + px / s0;
        const my = f.y + v.pan.y + py / s0;
        return { zoom, pan: { x: mx - px / s1 - f.x, y: my - py / s1 - f.y } };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Arrow keys nudge and Delete removes, when the stage has focus or nothing does; never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const L = live.current;
      if (!L.selectedId || L.layout || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      const inStage = t instanceof Node && !!wrapperRef.current?.contains(t);
      const idle = t === document.body || t === document.documentElement || t === null;
      if ((!inStage && !idle) || isTextTarget(t) || isButtonTarget(t)) return;
      const step = e.shiftKey ? NUDGE_SHIFT_MM : NUDGE_MM;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (nudge[e.key]) {
        e.preventDefault();
        const el = L.project.elements.find((x) => x.id === L.selectedId);
        if (el) L.dispatch({ type: 'updateElement', id: el.id, patch: { x: round2(el.x + nudge[e.key][0]), y: round2(el.y + nudge[e.key][1]) } });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        L.dispatch({ type: 'removeElement', id: L.selectedId });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Keeps a drag's moves on the stage even when the pointer leaves it. */
  const capture = (pointerId: number) => {
    try {
      svgRef.current?.setPointerCapture(pointerId);
    } catch {
      // The pointer is already gone.
    }
  };

  /** The badge point under a client position. */
  const toMm = (clientX: number, clientY: number): Pt => {
    const rect = svgRef.current?.getBoundingClientRect();
    const L = live.current;
    if (!rect) return L.center;
    return {
      x: L.center.x + (clientX - rect.left - rect.width / 2) / L.scale,
      y: L.center.y + (clientY - rect.top - rect.height / 2) / L.scale,
    };
  };

  const startMove = (e: React.PointerEvent, el: BadgeElement, ink: Rect) => {
    if (e.button !== 0 || layout) return;
    e.stopPropagation();
    capture(e.pointerId);
    onSelect(el.id);
    // Guides are computed once, from where everything else stands when the drag starts.
    dragRef.current = { kind: 'move', id: el.id, startX: e.clientX, startY: e.clientY, ink, guides: guideLines(resolved, el.id), applied: { x: 0, y: 0 }, origin: { x: el.x, y: el.y }, active: false };
  };

  const startScale = (e: React.PointerEvent, el: BadgeElement) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    capture(e.pointerId);
    const c = { x: el.x, y: el.y };
    const p = toMm(e.clientX, e.clientY);
    dragRef.current = {
      kind: 'scale',
      id: el.id,
      center: c,
      startDist: Math.hypot(p.x - c.x, p.y - c.y),
      orig: el.kind === 'text' ? { cap: el.capHeightMm } : { w: el.widthMm, h: el.heightMm },
    };
  };

  const startKern = (e: React.PointerEvent, el: TextElement, key: string) => {
    if (e.button !== 0) return;
    const set = fonts.get(el.text);
    if (!set || set.length === 0) return;
    e.stopPropagation();
    capture(e.pointerId);
    dragRef.current = {
      kind: 'kern',
      id: el.id,
      key,
      startX: e.clientX,
      startY: e.clientY,
      pair0: el.text.pairAdjustEm[key],
      outlineCapPx: capHeightPx(set[0], TEXT_RENDER_SIZE_PX),
    };
  };

  /** Left and Right on a focused handle step its pair by 0.01 em; the stage's own keys stay out of it. */
  const onKernKey = (e: React.KeyboardEvent, el: TextElement, key: string) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
      if (/^(ArrowUp|ArrowDown|Delete|Backspace)$/.test(e.key)) e.preventDefault();
      return;
    }
    e.preventDefault();
    const pair = addPairEm(el.text.pairAdjustEm[key], e.key === 'ArrowRight' ? KERN_STEP_EM : -KERN_STEP_EM);
    dispatch({ type: 'updateElement', id: el.id, patch: { text: { ...el.text, pairAdjustEm: { ...el.text.pairAdjustEm, [key]: pair } } } });
  };

  const startPan = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    capture(e.pointerId);
    dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, pan0: view.pan, moved: false };
  };

  const setHit = (x: number | null, y: number | null) =>
    setHits((prev) => (prev?.x === x && prev?.y === y ? prev : x === null && y === null ? null : { x, y }));

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'move') {
      const dxPx = e.clientX - d.startX;
      const dyPx = e.clientY - d.startY;
      if (!d.active) {
        if (Math.hypot(dxPx, dyPx) < (e.pointerType === 'touch' ? DRAG_START_TOUCH_PX : DRAG_START_PX)) return;
        d.active = true;
      }
      const dx = dxPx / scale;
      const dy = dyPx / scale;
      // Alt turns snapping off.
      const snapped = e.altKey ? { dx, dy, hitX: null, hitY: null } : snapMove(d.ink, dx, dy, d.guides, SNAP_PX / scale);
      // The position is set from where the drag began, rounded to the hundredth, so repeated moves add no float noise.
      const ax = round2(snapped.dx);
      const ay = round2(snapped.dy);
      if (ax !== d.applied.x || ay !== d.applied.y) {
        dispatch({ type: 'updateElement', id: d.id, patch: { x: round2(d.origin.x + ax), y: round2(d.origin.y + ay) } });
        d.applied = { x: ax, y: ay };
      }
      setHit(snapped.hitX, snapped.hitY);
    } else if (d.kind === 'kern') {
      const el = live.current.project.elements.find((x) => x.id === d.id);
      if (el?.kind !== 'text') return;
      const along = alongText((e.clientX - d.startX) / scale, (e.clientY - d.startY) / scale, el.rotationDeg);
      const pair = addPairEm(d.pair0, kerningDeltaEm(along, el.capHeightMm, d.outlineCapPx));
      dispatch({ type: 'updateElement', id: d.id, patch: { text: { ...el.text, pairAdjustEm: { ...el.text.pairAdjustEm, [d.key]: pair } } } });
    } else if (d.kind === 'scale') {
      const p = toMm(e.clientX, e.clientY);
      const dist = Math.hypot(p.x - d.center.x, p.y - d.center.y);
      if ('cap' in d.orig) {
        const k = scaleFactor(d.startDist, dist, d.orig.cap, MIN_SIZE_MM);
        dispatch({ type: 'updateElement', id: d.id, patch: { capHeightMm: round2(d.orig.cap * k) } });
      } else {
        const k = scaleFactor(d.startDist, dist, Math.min(d.orig.w, d.orig.h), MIN_SIZE_MM);
        dispatch({ type: 'updateElement', id: d.id, patch: { widthMm: round2(d.orig.w * k), heightMm: round2(d.orig.h * k) } });
      }
    } else {
      const dx = (e.clientX - d.startX) / scale;
      const dy = (e.clientY - d.startY) / scale;
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_START_PX) d.moved = true;
      if (d.moved) setView((v) => ({ ...v, pan: { x: d.pan0.x - dx, y: d.pan0.y - dy } }));
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setHits(null);
    // A press on the background that never became a pan is a click: it deselects.
    if (d?.kind === 'pan' && !d.moved && e.type === 'pointerup') onSelect(null);
  };

  // Drawing data, rebuilt when the geometry changes.
  const paths = useMemo(
    () => ({
      outline: polyToSvgPath(resolved.outline),
      bands: polyToSvgPath(resolved.border.bands),
      ornaments: polyToSvgPath(resolved.border.ornaments),
      elements: new Map(resolved.elements.map((r) => [r.id, polyToSvgPath(r.poly)])),
    }),
    [resolved]
  );
  const resolvedById = useMemo(() => new Map<string, ResolvedElement>(resolved.elements.map((r) => [r.id, r])), [resolved]);
  const loading = useMemo(
    () => new Set(resolved.warnings.filter((w) => w.code === 'fontLoading' && w.elementId).map((w) => w.elementId)),
    [resolved]
  );

  /** Where an element can be hit and selected: its ink box, or a guess at one for text still loading. */
  const inkOf = (el: BadgeElement): Rect | null => resolvedById.get(el.id)?.ink ?? (el.kind === 'text' ? fallbackInk(el) : null);

  const px = 1 / scale; // one screen pixel in mm
  const selected = layout ? undefined : project.elements.find((el) => el.id === selectedId);
  const selectedInk = selected ? inkOf(selected) : null;
  const handleDraw = 9 * px;
  const handleHit = (coarse ? 36 : 20) * px;
  const kernHandles = useMemo(() => {
    const r = selected?.kind === 'text' && adjustPairs ? resolvedById.get(selected.id) : undefined;
    return r ? kerningHandles(r.clusters) : [];
  }, [selected, adjustPairs, resolvedById]);

  const renderElement = (el: BadgeElement) => {
    const r = resolvedById.get(el.id);
    const ink = inkOf(el);
    const turn = rotation(el.rotationDeg, el.x, el.y);
    return (
      <g key={el.id}>
        {r && r.raster && el.kind === 'graphic' ? (
          <image
            href={el.dataUrl}
            x={r.ink.x}
            y={r.ink.y}
            width={r.ink.w}
            height={r.ink.h}
            preserveAspectRatio="xMidYMid meet"
            transform={turn}
          />
        ) : (
          r && r.poly.length > 0 && <path d={paths.elements.get(el.id)} fill={INK} fillRule="evenodd" />
        )}
        {!r && el.kind === 'text' && loading.has(el.id) && <LoadingText el={el} />}
        {ink && !layout && (
          <rect
            className="stage2d-hit"
            x={ink.x}
            y={ink.y}
            width={ink.w}
            height={ink.h}
            transform={turn}
            fill="transparent"
            role="button"
            tabIndex={-1}
            aria-label={el.name}
            aria-pressed={el.id === selectedId}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(el.id);
              }
            }}
            onPointerDown={(e) => startMove(e, el, ink)}
          />
        )}
      </g>
    );
  };

  return (
    <div
      ref={wrapperRef}
      className="stage viewport-2d-wrapper stage2d"
      tabIndex={0}
      aria-label="Badge stage. Arrow keys move the selected element; Delete removes it."
    >
      <div className="viewport-2d-hud">
        <div className="hud-scroll">
          <div className="hud-zoom" role="group" aria-label="Zoom">
            <button
              type="button"
              className="hud-btn"
              onClick={() => setView((v) => ({ ...v, zoom: clamp(Number((v.zoom * 0.8).toFixed(3)), MIN_ZOOM, MAX_ZOOM) }))}
              aria-label="Zoom out"
              title="Zoom out"
            >
              −
            </button>
            <button type="button" className="hud-btn hud-btn-reset" onClick={() => setView(HOME)} aria-label={`Reset view (${Math.round(view.zoom * 100)}%)`} title="Reset view">
              {Math.round(view.zoom * 100)}%
            </button>
            <button
              type="button"
              className="hud-btn"
              onClick={() => setView((v) => ({ ...v, zoom: clamp(Number((v.zoom * 1.25).toFixed(3)), MIN_ZOOM, MAX_ZOOM) }))}
              aria-label="Zoom in"
              title="Zoom in"
            >
              +
            </button>
          </div>

          <div className="hud-legend">
            <span className="hud-chip" title={`Cut lines, ${CUT}`}>
              <span className="dot" style={{ backgroundColor: CUT }} />
              Cut
            </span>
            <span className="hud-chip" title="Engraved areas">
              <span className="dot" style={{ backgroundColor: INK }} />
              Engrave
            </span>
            {layout && (
              <span className="hud-chip" title="Score lines">
                <span className="dot" style={{ backgroundColor: SCORE_TINT }} />
                Score
              </span>
            )}
            <span className="hud-chip">{layout ? 'Layout' : 'Badge'} {sizeLabel(content.w, content.h, unit)}</span>
          </div>

          {stacked && (
            <div className="hud-toggles" role="group" aria-label="Stage view">
              <button
                type="button"
                className="hud-toggle"
                aria-pressed={showLayout}
                onClick={() => setShowLayout((on) => !on)}
                title="Show the pieces side by side, as the export lays them out"
              >
                Show layout
              </button>
            </div>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        className="viewport-2d-svg"
        viewBox={`${vbX.toFixed(4)} ${vbY.toFixed(4)} ${vbW.toFixed(4)} ${vbH.toFixed(4)}`}
        onPointerDown={startPan}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {layout && pieces && slots ? (
          pieces.map((piece, i) => {
            const rect = pieceBounds(piece);
            return (
              <g key={piece.id} transform={`translate(${slots.dx[i]} 0)`} pointerEvents="none">
                {rect && (
                  <text x={rect.x + rect.w / 2} y={rect.y - 8 * px} fontSize={11 * px} textAnchor="middle" fill="var(--stage-ink)">
                    {piece.id}
                  </text>
                )}
                {piece.cut.length > 0 && (
                  <path d={polyToSvgPath(piece.cut)} fill={BADGE_FILL} fillRule="evenodd" stroke={CUT} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                )}
                {piece.score.length > 0 && (
                  <path d={linesPath(piece.score, piece.scoreClosed)} fill="none" stroke={SCORE_TINT} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                )}
                {piece.engrave.length > 0 && <path d={polyToSvgPath(piece.engrave)} fill={INK} fillRule="evenodd" />}
                {piece.print.map((p, n) => (
                  <path key={n} d={polyToSvgPath(p.poly)} fill={p.fill} fillRule="evenodd" />
                ))}
                {piece.images.map(({ el, box }) => (
                  <image
                    key={el.id}
                    href={el.dataUrl}
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={box.h}
                    preserveAspectRatio="xMidYMid meet"
                    transform={rotation(el.rotationDeg, box.x + box.w / 2, box.y + box.h / 2)}
                  />
                ))}
              </g>
            );
          })
        ) : (
          <>
            <path d={paths.outline} fill={BADGE_FILL} fillRule="evenodd" stroke={CUT} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <path d={paths.bands} fill={INK} fillRule="evenodd" />
            <path d={paths.ornaments} fill={INK} fillRule="evenodd" />
            {project.elements.map(renderElement)}

            {selected && selectedInk && (
              <g transform={rotation(selected.rotationDeg, selected.x, selected.y)}>
                <rect
                  x={selectedInk.x}
                  y={selectedInk.y}
                  width={selectedInk.w}
                  height={selectedInk.h}
                  fill="none"
                  stroke={STAGE_ACCENT_HEX}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                {CORNERS.map((corner) => {
                  const cx = corner.endsWith('w') ? selectedInk.x : selectedInk.x + selectedInk.w;
                  const cy = corner.startsWith('n') ? selectedInk.y : selectedInk.y + selectedInk.h;
                  return (
                    <g key={corner} className={`stage2d-handle stage2d-handle-${corner}`} onPointerDown={(e) => startScale(e, selected)}>
                      <rect x={cx - handleHit / 2} y={cy - handleHit / 2} width={handleHit} height={handleHit} fill="transparent" />
                      <rect
                        x={cx - handleDraw / 2}
                        y={cy - handleDraw / 2}
                        width={handleDraw}
                        height={handleDraw}
                        fill={STAGE_ACCENT_HEX}
                        stroke={BADGE_FILL}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {selected?.kind === 'text' &&
              kernHandles.map((h) => {
                const [line, index] = h.key.split(':').map(Number);
                const next = Array.from(textLines(selected)[line]?.slice(index + 1) ?? '')[0] ?? '';
                const value = selected.text.pairAdjustEm[h.key] ?? 0;
                return (
                  <g
                    key={h.key}
                    className="stage2d-kern"
                    role="slider"
                    tabIndex={0}
                    aria-label={`Space before ${next ? `“${next}”` : 'letter'}`}
                    aria-orientation="horizontal"
                    aria-valuemin={-1}
                    aria-valuemax={1}
                    aria-valuenow={value}
                    aria-valuetext={`${value.toFixed(2)} em`}
                    onPointerDown={(e) => startKern(e, selected, h.key)}
                    onKeyDown={(e) => onKernKey(e, selected, h.key)}
                  >
                    <circle cx={h.x} cy={h.y} r={handleHit / 2} fill="transparent" />
                    <circle className="stage2d-kern-dot" cx={h.x} cy={h.y} r={handleDraw / 2} fill={STAGE_ACCENT_HEX} stroke={BADGE_FILL} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  </g>
                );
              })}

            {hits && hits.x !== null && (
              <line x1={hits.x} x2={hits.x} y1={vbY} y2={vbY + vbH} stroke={GUIDE} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}
            {hits && hits.y !== null && (
              <line x1={vbX} x2={vbX + vbW} y1={hits.y} y2={hits.y} stroke={GUIDE} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}
          </>
        )}
      </svg>
    </div>
  );
};

/** Text whose outline has not arrived: drawn as ordinary SVG text in its family, at its cap height. */
const LoadingText: React.FC<{ el: TextElement }> = ({ el }) => {
  const font = fallbackFontMm(el);
  const lines = textLines(el);
  const lineStep = font * el.text.lineHeight;
  // The block's middle sits on the element's center; the first baseline is half a cap below its top line's middle.
  const first = el.y - ((lines.length - 1) * lineStep) / 2 + el.capHeightMm / 2;
  return (
    <text
      x={el.x}
      y={first}
      textAnchor="middle"
      fontFamily={`'${el.text.family}', serif`}
      fontWeight={el.text.weight}
      fontStyle={el.text.style}
      fontSize={font}
      letterSpacing={`${el.text.letterSpacingEm}em`}
      fill={INK}
      opacity={0.55}
      transform={rotation(el.rotationDeg, el.x, el.y)}
      pointerEvents="none"
    >
      {lines.map((line, i) => (
        <tspan key={i} x={el.x} dy={i === 0 ? 0 : lineStep}>
          {line}
        </tspan>
      ))}
    </text>
  );
};
