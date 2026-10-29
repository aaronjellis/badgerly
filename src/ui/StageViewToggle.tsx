import React from 'react';

export type StageView = '2d' | '3d';

interface StageViewToggleProps {
  value: StageView;
  onChange: (view: StageView) => void;
}

/** The HUD's 2D and 3D buttons, as two pills in the toggles row of either stage. */
export const StageViewToggle: React.FC<StageViewToggleProps> = ({ value, onChange }) => (
  <>
    <button type="button" className="hud-toggle" aria-pressed={value === '2d'} onClick={() => onChange('2d')} title="Edit the badge flat">
      2D
    </button>
    <button type="button" className="hud-toggle" aria-pressed={value === '3d'} onClick={() => onChange('3d')} title="Preview the printed badge in 3D">
      3D
    </button>
  </>
);
