import React from 'react';
import { NumberField } from '../../components/NumberField';
import type { DisplayUnit } from '../../engine/model';
import { secondaryMax, SHAPE_OPTIONS } from '../../engine/shapes';
import type { ShapeConfig } from '../../engine/shapes';
import { Field, Segmented } from '../Field';
import { ShapeThumb } from '../ShapeThumb';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

type Secondary = 'corner' | 'scallop' | 'depth' | 'hug';

const SECONDARY_LABEL: Record<Secondary, string> = { corner: 'Corner', scallop: 'Scallop', depth: 'Depth', hug: 'Hug' };
const SECONDARY_KEY: Record<Secondary, 'cornerMm' | 'scallopMm' | 'depthMm' | 'hugMm'> = {
  corner: 'cornerMm',
  scallop: 'scallopMm',
  depth: 'depthMm',
  hug: 'hugMm',
};

/** The largest hug the field takes, in mm; `clampShape` sets none. */
const HUG_FIELD_MAX_MM = 50;

/** Units, the outline picker, the badge size, and the sizes the chosen outline uses. */
export const ShapeSection: React.FC<SectionProps> = ({ project, dispatch }) => {
  const { shape, unit } = project;
  const { isInch, uLabel } = unitHelpers(unit);
  const option = SHAPE_OPTIONS.find((o) => o.kind === shape.kind) ?? SHAPE_OPTIONS[0];
  const hugs = shape.kind === 'hugText';
  const shortMm = Math.min(shape.widthMm, shape.heightMm);
  const setShape = (patch: Partial<ShapeConfig>) => dispatch({ type: 'setShape', patch });

  return (
    <>
      <Segmented<DisplayUnit>
        ariaLabel="Units"
        value={unit}
        onChange={(next) => dispatch({ type: 'set', patch: { unit: next } })}
        options={[
          { value: 'mm', label: 'mm' },
          { value: 'in', label: 'in' },
        ]}
      />

      <Field label="Outline" group hint={option.label}>
        <div className="shape-picker" role="radiogroup" aria-label="Outline">
          {SHAPE_OPTIONS.map((o) => (
            <ShapeThumb key={o.kind} kind={o.kind} selected={o.kind === shape.kind} onClick={() => setShape({ kind: o.kind })} />
          ))}
        </div>
      </Field>

      {hugs ? (
        <p className="helper-note">The outline follows your lettering and graphics, so the badge has no set width or height.</p>
      ) : (
        <div className="two-col-inputs">
          <Field label={`Width (${uLabel})`}>
            <NumberField
              valueMm={shape.widthMm}
              minMm={5}
              maxMm={1000}
              step={isInch ? 0.1 : 1}
              displayUnit={unit}
              inDecimals={2}
              mmDecimals={1}
              ariaLabel="Width"
              onChangeMm={(widthMm) => setShape({ widthMm })}
            />
          </Field>
          <Field label={`Height (${uLabel})`}>
            <NumberField
              valueMm={shape.heightMm}
              minMm={5}
              maxMm={1000}
              step={isInch ? 0.1 : 1}
              displayUnit={unit}
              inDecimals={2}
              mmDecimals={1}
              ariaLabel="Height"
              onChangeMm={(heightMm) => setShape({ heightMm })}
            />
          </Field>
        </div>
      )}

      {option.uses.length > 0 && (
        <div className="two-col-inputs">
          {option.uses.map((use) => (
            <Field key={use} label={`${SECONDARY_LABEL[use]} (${uLabel})`}>
              <NumberField
                valueMm={shape[SECONDARY_KEY[use]]}
                minMm={0}
                maxMm={use === 'hug' ? HUG_FIELD_MAX_MM : secondaryMax(use, shortMm)}
                step={isInch ? 0.05 : 0.5}
                displayUnit={unit}
                inDecimals={2}
                mmDecimals={1}
                ariaLabel={SECONDARY_LABEL[use]}
                onChangeMm={(mm) => setShape({ [SECONDARY_KEY[use]]: mm })}
              />
            </Field>
          ))}
        </div>
      )}
    </>
  );
};
