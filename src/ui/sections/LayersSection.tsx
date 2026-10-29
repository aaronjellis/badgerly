import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { NumberField } from '../../components/NumberField';
import { BACKING_ID } from '../../engine/model';
import type { Layer } from '../../engine/model';
import { Field } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** The thinnest and thickest a layer can be, in mm. */
const MIN_THICKNESS_MM = 0.5;
const MAX_THICKNESS_MM = 50;

/** The stacked variant's layers: the backing, then each layer on top of it. */
export const LayersSection: React.FC<SectionProps> = ({ project, dispatch }) => {
  const { unit, laserVariant } = project;
  const { isInch, uLabel } = unitHelpers(unit);

  if (laserVariant !== 'stacked') {
    return <p className="helper-note">Layers apply to the stacked variant. Choose Stacked at the top of the inspector.</p>;
  }

  const row = (layer: Layer, label: string) => (
    <div key={layer.id} className="layer-row" role="group" aria-label={label}>
      <span className="layer-row-title">{label}</span>
      <div className="two-col-inputs">
        <Field label="Name">
          <input
            type="text"
            value={layer.name}
            aria-label={`${label} name`}
            onChange={(e) => dispatch({ type: 'updateLayer', id: layer.id, patch: { name: e.target.value } })}
          />
        </Field>
        <Field label={`Thickness (${uLabel})`}>
          <NumberField
            valueMm={layer.thicknessMm}
            minMm={MIN_THICKNESS_MM}
            maxMm={MAX_THICKNESS_MM}
            step={isInch ? 0.01 : 0.1}
            displayUnit={unit}
            inDecimals={3}
            mmDecimals={2}
            ariaLabel={`${label} thickness`}
            onChangeMm={(thicknessMm) => dispatch({ type: 'updateLayer', id: layer.id, patch: { thicknessMm } })}
          />
        </Field>
      </div>
      {layer.id !== BACKING_ID && (
        <button type="button" className="btn btn-sm" aria-label={`Remove ${layer.name || label}`} onClick={() => dispatch({ type: 'removeLayer', id: layer.id })}>
          <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
          Remove
        </button>
      )}
    </div>
  );

  return (
    <>
      {project.layers.map((layer, i) => row(layer, layer.id === BACKING_ID ? 'Backing' : `Layer ${i}`))}
      <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'addLayer' })}>
        <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
        Add layer
      </button>
      <p className="helper-note">
        Elements choose their layer in step 3. To see the pieces side by side, turn on <strong>Show layout</strong> on the stage.
      </p>
    </>
  );
};
