import React, { useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { NumberField } from '../../components/NumberField';
import { borderInsetFloor } from '../../engine/border';
import type { BorderConfig, BorderStyle } from '../../engine/border';
import { CORNER_MOTIFS, motifPoly } from '../../engine/cornerArt';
import { polyToSvgPath } from '../../engine/geom';
import { Field, Segmented } from '../Field';
import { readMotifFile } from './motifFile';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** The chip id of an uploaded motif; `motifSvg` holds its art. */
const CUSTOM_MOTIF_ID = 'custom';
/** A motif chip's icon is drawn this many px square. */
const CHIP_ICON_PX = 18;
/** Flattening tolerance for the icons, in px of the icon. */
const CHIP_ICON_TOL = 0.1;

const STYLES: { value: BorderStyle; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'corners', label: 'Corners' },
];

const iconPath = (svg: string): string => polyToSvgPath(motifPoly(svg, CHIP_ICON_PX, CHIP_ICON_TOL), 2);

/** The catalog's icons, drawn once. */
const CATALOG_ICONS = CORNER_MOTIFS.map((m) => ({ id: m.id, label: m.label, d: iconPath(m.svg) }));

const MotifIcon: React.FC<{ d: string }> = ({ d }) => (
  <svg width={CHIP_ICON_PX} height={CHIP_ICON_PX} viewBox={`0 0 ${CHIP_ICON_PX} ${CHIP_ICON_PX}`} fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
);

/** The border style and its sizes; in 3D, whether the line is raised or sunk and how far. */
export const BorderSection: React.FC<SectionProps> = ({ project, dispatch, resolved }) => {
  const { border, shape, unit } = project;
  const { isInch, uLabel, fmtDim } = unitHelpers(unit);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** The floor a typed inset fell below; the note shows only while the inset still sits on that floor. */
  const [limitedTo, setLimitedTo] = useState<number | null>(null);

  const setBorder = (patch: Partial<BorderConfig>) => dispatch({ type: 'setBorder', patch });
  const floor = borderInsetFloor(border, shape);
  const limited = limitedTo !== null && limitedTo === floor && border.insetMm === floor;
  const tooDeep = resolved.warnings.find((w) => w.code === 'borderTooDeep');
  const customIcon = useMemo(() => (border.motifSvg ? iconPath(border.motifSvg) : null), [border.motifSvg]);

  const setInset = (mm: number) => {
    setLimitedTo(mm < floor ? floor : null);
    setBorder({ insetMm: mm });
  };

  const insetHint =
    limited || tooDeep ? (
      <>
        {limited && <span>Limited to {fmtDim(floor, 3)} {uLabel}. </span>}
        {tooDeep && <span className="field-warn">{tooDeep.message}</span>}
      </>
    ) : undefined;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const read = await readMotifFile(file);
    setUploadError('error' in read ? read.error : null);
    if ('svg' in read) setBorder({ motifSvg: read.svg, motifId: CUSTOM_MOTIF_ID });
  };

  const field = (
    label: string,
    value: number,
    key: 'widthMm' | 'gapMm' | 'dashMm' | 'dashGapMm' | 'motifSizeMm' | 'reliefMm',
    min: number,
    max: number,
    step: [inch: number, mm: number],
    decimals: [inch: number, mm: number] = [3, 2],
  ) => (
    <Field label={`${label} (${uLabel})`}>
      <NumberField
        valueMm={value}
        minMm={min}
        maxMm={max}
        step={isInch ? step[0] : step[1]}
        displayUnit={unit}
        inDecimals={decimals[0]}
        mmDecimals={decimals[1]}
        ariaLabel={label}
        onChangeMm={(mm) => setBorder({ [key]: mm })}
      />
    </Field>
  );

  return (
    <>
      <Field label="Style" group>
        <Segmented<BorderStyle> ariaLabel="Border style" value={border.style} onChange={(style) => setBorder({ style })} options={STYLES} />
      </Field>

      {border.style !== 'none' && (
        <>
          <div className="two-col-inputs">
            <Field label={`Inset (${uLabel})`} hint={insetHint}>
              <NumberField
                valueMm={border.insetMm}
                minMm={0}
                maxMm={500}
                step={isInch ? 0.05 : 0.5}
                displayUnit={unit}
                inDecimals={3}
                mmDecimals={2}
                ariaLabel="Inset"
                onChangeMm={setInset}
              />
            </Field>
            {field('Width', border.widthMm, 'widthMm', 0.05, 20, [0.01, 0.1])}
          </div>

          {border.style === 'double' && <div className="two-col-inputs">{field('Gap', border.gapMm, 'gapMm', 0.1, 20, [0.01, 0.1])}</div>}

          {border.style === 'dashed' && (
            <div className="two-col-inputs">
              {field('Dash', border.dashMm, 'dashMm', 0.5, 100, [0.05, 0.5], [3, 1])}
              {field('Gap', border.dashGapMm, 'dashGapMm', 0.5, 100, [0.05, 0.5], [3, 1])}
            </div>
          )}

          {border.style === 'corners' && (
            <>
              <Field label="Corner art" group>
                <div className="chip-row" role="radiogroup" aria-label="Corner art">
                  {CATALOG_ICONS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={!border.motifSvg && border.motifId === m.id}
                      className="chip"
                      onClick={() => {
                        setUploadError(null);
                        setBorder({ motifId: m.id, motifSvg: undefined });
                      }}
                    >
                      <MotifIcon d={m.d} />
                      {m.label}
                    </button>
                  ))}
                  {border.motifSvg && customIcon !== null && (
                    <button type="button" role="radio" aria-checked className="chip">
                      <MotifIcon d={customIcon} />
                      Custom
                    </button>
                  )}
                </div>
              </Field>
              <div className="two-col-inputs">{field('Art size', border.motifSizeMm, 'motifSizeMm', 3, 100, [0.1, 1], [2, 1])}</div>
              <input
                ref={fileRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="visually-hidden-input"
                aria-label="Corner SVG file"
                tabIndex={-1}
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button type="button" className="btn btn-sm pattern-apply-all" onClick={() => fileRef.current?.click()}>
                <Upload size={16} strokeWidth={1.75} aria-hidden="true" />
                Upload corner SVG
              </button>
              {uploadError ? (
                <p className="helper-note field-warn" role="alert">
                  {uploadError}
                </p>
              ) : (
                <p className="helper-note">Draw the art for the top-left corner as filled shapes. The other three corners mirror it.</p>
              )}
            </>
          )}

          {project.mode === 'print3d' && (
            <>
              <Field label="Line" group>
                <Segmented<BorderConfig['relief']>
                  ariaLabel="Border relief"
                  value={border.relief}
                  onChange={(relief) => setBorder({ relief })}
                  options={[
                    { value: 'emboss', label: 'Raised' },
                    { value: 'deboss', label: 'Sunk' },
                  ]}
                />
              </Field>
              <div className="two-col-inputs">{field('Height', border.reliefMm, 'reliefMm', 0.1, 5, [0.01, 0.1], [3, 2])}</div>
            </>
          )}
        </>
      )}
    </>
  );
};
