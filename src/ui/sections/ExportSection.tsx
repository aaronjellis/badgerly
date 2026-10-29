import React from 'react';
import { exportFormats } from '../../state/exportFlow';
import type { ExportFormatId } from '../../state/exportFlow';
import { FORMAT_ICON } from '../exportIcons';
import type { SectionProps } from './types';

/** What the Export section needs beyond the project: the export action and how the last one went. */
export interface ExportControls {
  onExport: (id: ExportFormatId) => Promise<boolean>;
  /** The last refusal or success line. */
  status: string | null;
  busy: boolean;
}

interface ExportSectionProps extends SectionProps, ExportControls {}

/** The formats this badge offers as buttons, how the last export went, and every warning the badge has now. */
export const ExportSection: React.FC<ExportSectionProps> = ({ project, resolved, relief, onExport, status, busy }) => {
  const warnings = [...new Set([...resolved.warnings, ...(relief?.warnings ?? [])].map((w) => w.message))];
  return (
    <>
      <div className="export-list">
        {exportFormats(project).map((f) => {
          const Icon = FORMAT_ICON[f.id];
          return (
            <button
              key={f.id}
              type="button"
              className="btn export-format"
              disabled={busy}
              data-ph-capture-attribute-format={f.id}
              onClick={() => void onExport(f.id)}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className="pop-item-text">
                <span className="pop-item-name">{busy ? 'Preparing…' : `Download ${f.label}`}</span>
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

      {warnings.length > 0 && (
        <ul className="relief-notes" aria-label="Warnings">
          {warnings.map((message) => (
            <li key={message} className="helper-note field-warn">
              {message}
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
