import React from 'react';
import { Box, Download, Scissors } from 'lucide-react';
import type { DisplayUnit, Mode } from '../engine/model';
import { BadgerMark } from './BadgerMark';
import { Segmented } from './Field';
import { ProjectMenu, type ProjectMenuProps } from './ProjectMenu';

interface AppBarProps {
  mode: Mode;
  onSelectMode: (mode: Mode) => void;
  displayUnit: DisplayUnit;
  onSelectUnit: (unit: DisplayUnit) => void;
  projectMenu: ProjectMenuProps;
}

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** Wordmark and Project menu, the mode switch (icons only on a narrow phone), units, and Export. */
export const AppBar: React.FC<AppBarProps> = ({ mode, onSelectMode, displayUnit, onSelectUnit, projectMenu }) => (
  <header className="app-bar">
    <div className="app-brand">
      <BadgerMark size={22} className="app-brand-icon" />
      <span className="app-wordmark">Badgerly</span>
      <ProjectMenu {...projectMenu} />
    </div>

    <div className="app-bar-center">
      <Segmented<Mode>
        ariaLabel="Mode"
        value={mode}
        onChange={onSelectMode}
        options={[
          { value: 'print3d', title: '3D print', label: <><Box {...ICON} /><span className="seg-label">3D print</span></> },
          { value: 'laser', title: 'Laser', label: <><Scissors {...ICON} /><span className="seg-label">Laser</span></> },
        ]}
      />
    </div>

    <div className="app-bar-end">
      {/* On a phone the units live in the Shape section only. */}
      <div className="app-bar-units">
        <Segmented<DisplayUnit>
          ariaLabel="Units"
          value={displayUnit}
          onChange={onSelectUnit}
          options={[
            { value: 'mm', label: 'mm' },
            { value: 'in', label: 'in' },
          ]}
        />
      </div>
      {/* Task 20 replaces this with the Export menu. */}
      <button type="button" className="btn-primary" disabled>
        <Download {...ICON} />
        <span>Export</span>
      </button>
    </div>
  </header>
);
