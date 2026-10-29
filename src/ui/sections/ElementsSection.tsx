import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, Copy, Image as ImageIcon, Plus, Trash2, Type, Upload } from 'lucide-react';
import { NumberField } from '../../components/NumberField';
import { sizeForAspect } from '../../engine/artworkImage';
import { fetchFontCatalog } from '../../engine/fontCatalog';
import type { FontFamily } from '../../engine/fontCatalog';
import { loadPreviewCss } from '../../engine/googleFonts';
import { BACKING_ID, DEFAULT_ROLE, newId } from '../../engine/model';
import type { BadgeElement, ElementRole, GraphicElement, TextElement } from '../../engine/model';
import { DEFAULT_TEXT } from '../../engine/textOutline';
import { Field, Segmented, Switch } from '../Field';
import { round2 } from '../stageMath';
import { FontPicker } from '../FontPicker';
import { previewFace } from '../fontList';
import { roleLabel } from './elementRole';
import { readGraphicFile } from './graphicFile';
import { unitHelpers } from './shared';
import { TextControls } from './TextControls';
import type { SectionProps } from './types';

/** A new graphic's longer side, in mm (1 in). */
const GRAPHIC_LONG_SIDE_MM = 25.4;
/** The new text's cap height, in mm (0.3 in), as the starting badge's text. */
const NEW_TEXT_CAP_MM = 7.62;
/** Warnings worth showing next to the element they came from. */
const ELEMENT_WARNINGS = new Set(['strokeOnlySvg', 'missingFont']);

const LASER_OPTIONS: { value: ElementRole['laser']; label: string }[] = [
  { value: 'engrave', label: 'Engrave' },
  { value: 'score', label: 'Score' },
  { value: 'cutout', label: 'Cut out' },
];

/** One catalog fetch for the session: the section and the picker both need it. */
let catalogRequest: Promise<FontFamily[]> | null = null;
const loadCatalog = () => (catalogRequest ??= fetchFontCatalog());

/** The element list, the buttons that add text and graphics, and the controls for the selected element. */
export const ElementsSection: React.FC<SectionProps> = ({ project, dispatch, selectedId, setSelectedId, resolved, adjustPairs, setAdjustPairs }) => {
  const { unit, mode, laserVariant } = project;
  const { isInch, uLabel } = unitHelpers(unit);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<FontFamily[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Set when a duplicate is asked for: the copy is the element added next, so select it when it lands. */
  const selectNext = useRef(false);

  const selected = project.elements.find((el) => el.id === selectedId);
  const family = selected?.kind === 'text' ? selected.text.family : null;
  const familyEntry = useMemo(() => catalog?.find((f) => f.family === family), [catalog, family]);

  useEffect(() => {
    let live = true;
    void loadCatalog().then((families) => live && setCatalog(families));
    return () => {
      live = false;
    };
  }, []);

  // The Font button shows its family in that family, at the text's weight and style.
  const face = selected?.kind === 'text' ? { family: selected.text.family, ...(familyEntry ? previewFace(familyEntry, selected.text.weight, selected.text.style) : { weight: 400, style: 'normal' as const }) } : null;
  useEffect(() => {
    if (face) void loadPreviewCss([face]);
  }, [face?.family, face?.weight, face?.style]);

  // A duplicate lands last in the list; select it.
  const count = project.elements.length;
  useEffect(() => {
    if (!selectNext.current) return;
    selectNext.current = false;
    const last = project.elements[count - 1];
    if (last) setSelectedId(last.id);
  }, [count]);

  // The picker belongs to one element.
  useEffect(() => setPickerOpen(false), [selectedId]);

  const add = (element: BadgeElement) => {
    dispatch({ type: 'addElement', element });
    setSelectedId(element.id);
  };

  const addText = () => {
    const n = project.elements.filter((el) => el.kind === 'text').length + 1;
    add({
      kind: 'text',
      id: newId(),
      name: `Text ${n}`,
      x: 0,
      y: 0,
      rotationDeg: 0,
      role: { ...DEFAULT_ROLE },
      text: { ...DEFAULT_TEXT, text: 'New text', pairAdjustEm: {} },
      capHeightMm: NEW_TEXT_CAP_MM,
    });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const read = await readGraphicFile(file);
    if ('error' in read) {
      setUploadError(read.error);
      return;
    }
    setUploadError(null);
    add({
      kind: 'graphic',
      id: newId(),
      name: file.name.replace(/\.[^.]+$/, '') || 'Graphic',
      x: 0,
      y: 0,
      rotationDeg: 0,
      role: { ...DEFAULT_ROLE },
      dataUrl: read.dataUrl,
      vector: read.vector,
      ...sizeForAspect(read.aspect, GRAPHIC_LONG_SIDE_MM),
    });
  };

  const patch = (p: Partial<BadgeElement>) => selected && dispatch({ type: 'updateElement', id: selected.id, patch: p });
  const setRole = (r: Partial<ElementRole>) => selected && patch({ role: { ...selected.role, ...r } });

  const posField = (label: string, key: 'x' | 'y') => (
    <Field label={`${label} (${uLabel})`}>
      <NumberField
        valueMm={selected ? selected[key] : 0}
        minMm={-2000}
        maxMm={2000}
        step={isInch ? 0.05 : 0.5}
        displayUnit={unit}
        inDecimals={3}
        mmDecimals={2}
        ariaLabel={label}
        onChangeMm={(v) => patch({ [key]: v })}
      />
    </Field>
  );

  /** A graphic keeps its proportions: changing one side changes the other. */
  const sizeField = (el: GraphicElement, label: string, key: 'widthMm' | 'heightMm') => (
    <Field label={`${label} (${uLabel})`}>
      <NumberField
        valueMm={el[key]}
        minMm={1}
        maxMm={2000}
        step={isInch ? 0.05 : 0.5}
        displayUnit={unit}
        inDecimals={3}
        mmDecimals={2}
        ariaLabel={label}
        onChangeMm={(v) => {
          const k = v / el[key];
          patch({ widthMm: round2(el.widthMm * k), heightMm: round2(el.heightMm * k) });
        }}
      />
    </Field>
  );

  // A PNG, or an SVG that could not be read, is drawn as an image: it has no outline to score or cut.
  const raster = !!selected && resolved.elements.some((r) => r.id === selected.id && r.raster);
  const warnings = selected ? resolved.warnings.filter((w) => w.elementId === selected.id && ELEMENT_WARNINGS.has(w.code)) : [];

  return (
    <>
      <div className="two-col-inputs">
        <button type="button" className="btn btn-sm" onClick={addText}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          Add text
        </button>
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
          <Upload size={16} strokeWidth={1.75} aria-hidden="true" />
          Upload graphic
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".svg,.png,.jpg,.jpeg,.webp"
        className="visually-hidden-input"
        aria-label="Graphic file"
        tabIndex={-1}
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {uploadError && (
        <p className="helper-note field-warn" role="alert">
          {uploadError}
        </p>
      )}

      {project.elements.length === 0 ? (
        <p className="helper-note">Nothing on the badge yet. Add text or upload a graphic.</p>
      ) : (
        <ul className="element-list" aria-label="Elements">
          {project.elements.map((el) => (
            <li key={el.id}>
              <button type="button" className="element-row ph-no-capture" aria-pressed={el.id === selectedId} onClick={() => setSelectedId(el.id)}>
                {el.kind === 'text' ? <Type size={16} strokeWidth={1.75} aria-hidden="true" /> : <ImageIcon size={16} strokeWidth={1.75} aria-hidden="true" />}
                <span className="element-row-name">{el.name}</span>
                <span className="element-row-role">{roleLabel(project, el)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="element-editor" aria-label={`Settings for ${selected.name}`} role="group">
          <Field label="Name">
            <input type="text" className="ph-no-capture" value={selected.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>

          {selected.kind === 'text' && (
            <TextControls
              el={selected as TextElement}
              unit={unit}
              family={familyEntry}
              dispatch={dispatch}
              adjustPairs={adjustPairs}
              setAdjustPairs={setAdjustPairs}
              onOpenFonts={() => setPickerOpen(true)}
            />
          )}

          {selected.kind === 'graphic' && (
            <div className="two-col-inputs">
              {sizeField(selected, 'Width', 'widthMm')}
              {sizeField(selected, 'Height', 'heightMm')}
            </div>
          )}

          {warnings.map((w) => (
            <p key={w.code} className="helper-note field-warn" role="status">
              {w.message}
            </p>
          ))}

          <div className="two-col-inputs">
            {posField('X', 'x')}
            {posField('Y', 'y')}
            <Field label="Rotation (degrees)">
              <NumberField valueMm={selected.rotationDeg} minMm={-360} maxMm={360} step={1} mmDecimals={1} ariaLabel="Rotation" onChangeMm={(rotationDeg) => patch({ rotationDeg })} />
            </Field>
          </div>

          {/* The badge's center is the origin of its coordinates. */}
          <div className="two-col-inputs">
            <button type="button" className="btn btn-sm" disabled={selected.x === 0} onClick={() => patch({ x: 0 })} title="Snap to the badge's vertical center line">
              <AlignHorizontalJustifyCenter size={16} strokeWidth={1.75} aria-hidden="true" />
              Center horizontally
            </button>
            <button type="button" className="btn btn-sm" disabled={selected.y === 0} onClick={() => patch({ y: 0 })} title="Snap to the badge's horizontal center line">
              <AlignVerticalJustifyCenter size={16} strokeWidth={1.75} aria-hidden="true" />
              Center vertically
            </button>
          </div>

          {mode === 'laser' && (
            <Field label="Laser" group hint={raster ? 'An image has no outline to score or cut, so it is engraved.' : undefined}>
              <Segmented<ElementRole['laser']>
                ariaLabel="Laser operation"
                value={selected.role.laser}
                onChange={(laser) => setRole({ laser })}
                options={raster ? LASER_OPTIONS.slice(0, 1) : LASER_OPTIONS}
              />
            </Field>
          )}

          {mode === 'laser' && laserVariant === 'printcut' && (
            <>
              <Switch label="Print in color" checked={selected.role.printColor} onChange={(printColor) => setRole({ printColor })} />
              {selected.role.printColor && (
                <Field label="Print color">
                  <input type="color" value={selected.role.fill} aria-label="Print color" onChange={(e) => setRole({ fill: e.target.value })} />
                </Field>
              )}
            </>
          )}

          {mode === 'laser' && laserVariant === 'stacked' && (
            <Field label="Layer">
              <select value={selected.role.layerId ?? BACKING_ID} onChange={(e) => setRole({ layerId: e.target.value === BACKING_ID ? null : e.target.value })}>
                {project.layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id === BACKING_ID ? `${l.name} (backing)` : l.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {mode === 'print3d' && (
            <>
              <Field label="Relief" group>
                <Segmented<ElementRole['relief']>
                  ariaLabel="Relief"
                  value={selected.role.relief}
                  onChange={(relief) => setRole({ relief })}
                  options={[
                    { value: 'emboss', label: 'Raised' },
                    { value: 'deboss', label: 'Sunk' },
                  ]}
                />
              </Field>
              <div className="two-col-inputs">
                <Field label={`Height (${uLabel})`}>
                  <NumberField
                    valueMm={selected.role.reliefMm}
                    minMm={0.1}
                    maxMm={5}
                    step={isInch ? 0.01 : 0.1}
                    displayUnit={unit}
                    inDecimals={3}
                    mmDecimals={2}
                    ariaLabel="Relief height"
                    onChangeMm={(reliefMm) => setRole({ reliefMm })}
                  />
                </Field>
              </div>
            </>
          )}

          <div className="two-col-inputs">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                selectNext.current = true;
                dispatch({ type: 'duplicateElement', id: selected.id });
              }}
            >
              <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
              Duplicate
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                dispatch({ type: 'removeElement', id: selected.id });
                setSelectedId(null);
              }}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>
      )}

      {pickerOpen && selected?.kind === 'text' && (
        <FontPicker
          catalog={catalog}
          value={selected.text.family}
          sampleText={selected.text.text.split(/\r?\n/)[0].slice(0, 24)}
          weight={selected.text.weight}
          style={selected.text.style}
          onPick={(f) => patch({ text: { ...selected.text, family: f.family } })}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
};
