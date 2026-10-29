import React from 'react';
import { NumberField } from '../../components/NumberField';
import type { ReliefConfig } from '../../engine/model';
import { Field, Segmented, Switch } from '../Field';
import { reliefNotes } from './reliefNotes';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** The plate's thinnest, and the largest any of these sizes can be typed, in mm. */
const MIN_PLATE_MM = 1;
const MAX_PLATE_MM = 50;
const MAX_EDGE_MM = 100;
const MAX_RECESS_MM = 20;
const MAX_CLEARANCE_MM = 2;

const EDGES: { value: ReliefConfig['edge']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'chamfer', label: 'Chamfer' },
  { value: 'fillet', label: 'Fillet' },
];

/** The 3D badge's plate and edge, the multi-color split, and what the engine had to limit or warn about. */
export const ReliefSection: React.FC<SectionProps> = ({ project, dispatch, resolved, relief }) => {
  const { relief: config, unit } = project;
  const { isInch, uLabel, fmtDim } = unitHelpers(unit);
  const setRelief = (patch: Partial<ReliefConfig>) => dispatch({ type: 'setRelief', patch });
  const limit = (mm: number) => `${fmtDim(mm, 3)} ${uLabel}`;

  const clamped = relief?.clamped;
  const notes = reliefNotes(project, resolved, relief);

  const field = (
    label: string,
    key: 'plateMm' | 'edgeMm' | 'recessMm' | 'clearanceMm',
    min: number,
    max: number,
    step: [inch: number, mm: number],
    hint?: React.ReactNode
  ) => (
    <Field label={`${label} (${uLabel})`} hint={hint}>
      <NumberField
        valueMm={config[key]}
        minMm={min}
        maxMm={max}
        step={isInch ? step[0] : step[1]}
        displayUnit={unit}
        inDecimals={3}
        mmDecimals={2}
        ariaLabel={label}
        onChangeMm={(mm) => setRelief({ [key]: mm })}
      />
    </Field>
  );

  return (
    <>
      <div className="two-col-inputs">{field('Plate thickness', 'plateMm', MIN_PLATE_MM, MAX_PLATE_MM, [0.01, 0.1])}</div>

      <Field label="Edge" group>
        <Segmented<ReliefConfig['edge']> ariaLabel="Edge" value={config.edge} onChange={(edge) => setRelief({ edge })} options={EDGES} />
      </Field>
      {config.edge !== 'none' && (
        <div className="two-col-inputs">
          {field('Edge size', 'edgeMm', 0.1, MAX_EDGE_MM, [0.01, 0.1], clamped?.edgeMm != null ? `Limited to ${limit(clamped.edgeMm)} by the badge and plate size` : undefined)}
        </div>
      )}

      {clamped?.debossMm != null && <p className="helper-note field-warn">Sunk depth limited to {limit(clamped.debossMm)} by the plate thickness.</p>}

      <Switch label="Multi-color split" checked={config.split} onChange={(split) => setRelief({ split })} />
      {config.split && (
        <div className="two-col-inputs">
          {field('Recess', 'recessMm', 0.1, MAX_RECESS_MM, [0.01, 0.1], clamped?.recessMm != null ? `Limited to ${limit(clamped.recessMm)}` : undefined)}
          {field('Clearance', 'clearanceMm', 0, MAX_CLEARANCE_MM, [0.005, 0.05])}
        </div>
      )}

      {notes.length > 0 && (
        <ul className="relief-notes" aria-label="Warnings">
          {notes.map((note) => (
            <li key={note} className="helper-note field-warn">
              {note}
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
