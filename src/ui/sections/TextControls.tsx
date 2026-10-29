import React from 'react';
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import { NumberField } from '../../components/NumberField';
import type { FontFamily } from '../../engine/fontCatalog';
import { nearestWeight } from '../../engine/fontSource';
import type { TextElement } from '../../engine/model';
import type { TextConfig } from '../../engine/textOutline';
import { Field, Segmented, Switch } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Weights and styles to offer when the catalog does not list the family (offline, or a fallback list). */
const FALLBACK_WEIGHTS = [400, 700];
const FALLBACK_STYLES: ('normal' | 'italic')[] = ['normal', 'italic'];

const ALIGNMENTS: { value: TextConfig['align']; label: string; Icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'Align left', Icon: AlignLeft },
  { value: 'center', label: 'Align center', Icon: AlignCenter },
  { value: 'right', label: 'Align right', Icon: AlignRight },
];

interface TextControlsProps extends Pick<SectionProps, 'dispatch' | 'adjustPairs' | 'setAdjustPairs'> {
  el: TextElement;
  unit: SectionProps['project']['unit'];
  /** The picked family's catalog entry, if the catalog has it. */
  family: FontFamily | undefined;
  onOpenFonts: () => void;
}

/** The text, its font, weight and style, sizes, alignment, and letter-pair adjustment. */
export const TextControls: React.FC<TextControlsProps> = ({ el, unit, family, dispatch, adjustPairs, setAdjustPairs, onOpenFonts }) => {
  const { isInch, uLabel } = unitHelpers(unit);
  const { text } = el;
  const setText = (patch: Partial<TextConfig>) => dispatch({ type: 'updateElement', id: el.id, patch: { text: { ...text, ...patch } } });
  const weights = family && family.weights.length > 0 ? family.weights : FALLBACK_WEIGHTS;
  const styles = family && family.styles.length > 0 ? family.styles : FALLBACK_STYLES;
  // A weight the font lacks is drawn as the nearest one it has, so that chip shows as chosen.
  const shownWeight = nearestWeight(weights, text.weight);
  const shownStyle = styles.includes(text.style) ? text.style : 'normal';
  const adjusted = Object.keys(text.pairAdjustEm).length;

  return (
    <>
      <Field label="Text">
        <textarea rows={2} className="ph-no-capture" value={text.text} onChange={(e) => setText({ text: e.target.value })} />
      </Field>

      <Field label="Font" group>
        <button type="button" className="btn font-button" aria-haspopup="dialog" onClick={onOpenFonts}>
          <span className="font-button-name" style={{ fontFamily: `"${text.family.replace(/["\\]/g, '')}", sans-serif`, fontWeight: shownWeight, fontStyle: shownStyle }}>
            {text.family}
          </span>
        </button>
      </Field>

      <Field label="Weight" group>
        <div className="chip-row" role="radiogroup" aria-label="Weight">
          {weights.map((w) => (
            <button key={w} type="button" role="radio" aria-checked={w === shownWeight} className="chip" onClick={() => setText({ weight: w })}>
              {w}
            </button>
          ))}
        </div>
      </Field>

      {styles.length > 1 && (
        <Field label="Style" group>
          <Segmented<'normal' | 'italic'>
            ariaLabel="Font style"
            value={shownStyle}
            onChange={(style) => setText({ style })}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'italic', label: 'Italic' },
            ]}
          />
        </Field>
      )}

      <Field label="Align" group>
        <Segmented<TextConfig['align']>
          ariaLabel="Text alignment"
          value={text.align}
          onChange={(align) => setText({ align })}
          options={ALIGNMENTS.map(({ value, label, Icon }) => ({
            value,
            title: label,
            label: <Icon size={18} strokeWidth={1.75} aria-hidden="true" />,
          }))}
        />
      </Field>

      <div className="two-col-inputs">
        <Field label={`Cap height (${uLabel})`}>
          <NumberField
            valueMm={el.capHeightMm}
            minMm={1}
            maxMm={500}
            step={isInch ? 0.05 : 0.5}
            displayUnit={unit}
            inDecimals={3}
            mmDecimals={2}
            ariaLabel="Cap height"
            onChangeMm={(capHeightMm) => dispatch({ type: 'updateElement', id: el.id, patch: { capHeightMm } })}
          />
        </Field>
        <Field label="Letter spacing (em)">
          <NumberField valueMm={text.letterSpacingEm} minMm={-0.5} maxMm={2} step={0.01} mmDecimals={2} ariaLabel="Letter spacing" onChangeMm={(letterSpacingEm) => setText({ letterSpacingEm })} />
        </Field>
        <Field label="Line height">
          <NumberField valueMm={text.lineHeight} minMm={0.5} maxMm={3} step={0.05} mmDecimals={2} ariaLabel="Line height" onChangeMm={(lineHeight) => setText({ lineHeight })} />
        </Field>
      </div>

      <Switch label="Adjust letter pairs" checked={adjustPairs} onChange={setAdjustPairs} />
      {adjustPairs && <p className="helper-note">Drag a handle on the stage to open or close the space before a letter. With a handle focused, press Left or Right.</p>}
      <button type="button" className="btn btn-sm" disabled={adjusted === 0} onClick={() => setText({ pairAdjustEm: {} })}>
        Reset kerning
      </button>
    </>
  );
};
