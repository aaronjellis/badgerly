import React, { useId } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import type { BadgeProject } from '../engine/model';
import { exportFormats } from '../state/exportFlow';
import type { ExportFormatId } from '../state/exportFlow';
import { FORMAT_ICON } from './exportIcons';
import { Popover, usePopover } from './Popover';

interface ExportMenuProps {
  project: BadgeProject;
  /** Exports the badge; resolves to whether a file was downloaded. */
  onExport: (id: ExportFormatId) => Promise<boolean>;
  /** The last refusal or success line. */
  status: string | null;
  /** An export is running. */
  busy?: boolean;
}

/** The app bar's one primary action: the formats this badge offers, each with what it contains. */
export const ExportMenu: React.FC<ExportMenuProps> = ({ project, onExport, status, busy = false }) => {
  const { anchorRef, open, close, toggle } = usePopover<HTMLButtonElement>();
  const popId = useId();
  const formats = exportFormats(project);

  // A refusal keeps the menu open, so its message shows where the click was.
  const download = async (id: ExportFormatId) => {
    if (await onExport(id)) close();
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="btn-primary"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={toggle}
      >
        <Download size={18} strokeWidth={1.75} aria-hidden="true" />
        <span>Export</span>
        <ChevronDown size={18} strokeWidth={1.75} className="btn-caret" aria-hidden="true" />
      </button>
      <Popover open={open} onClose={close} anchorRef={anchorRef} id={popId} ariaLabel="Export" className="export-menu">
        <div className="export-formats">
          {formats.map((f) => {
            const Icon = FORMAT_ICON[f.id];
            return (
              <button
                key={f.id}
                type="button"
                className="pop-item"
                title={f.id === 'stl-two-files' ? 'Your browser may ask to allow both downloads' : undefined}
                disabled={busy}
                data-ph-capture-attribute-format={f.id}
                onClick={() => void download(f.id)}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                <span className="pop-item-text">
                  <span className="pop-item-name">{busy ? 'Preparing…' : f.label}</span>
                  <span className="pop-item-meta">{f.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        {status && (
          <p className="helper-note export-status" role="status">
            {status}
          </p>
        )}
      </Popover>
    </>
  );
};
