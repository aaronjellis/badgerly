/** The Export menu's and section's one export action, and the sentence that says how the last one went. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FontProvider } from '../engine/fontProvider';
import type { BadgeProject } from '../engine/model';
import { triggerDownload } from '../ui/download';
import { exportBadge } from './exportFlow';
import type { ExportFormatId, ExportIo } from './exportFlow';

const browserIo: ExportIo = {
  save: (file) => triggerDownload(file.blob, file.filename),
  pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface ExportState {
  /** The last refusal, success or open error; cleared when the badge changes. */
  status: string | null;
  setStatus: (message: string | null) => void;
  /** An export is running (it waits for fonts); another click waits for it. */
  busy: boolean;
  /** Exports the badge as it is when called. Resolves to whether a file was downloaded. */
  exportAs: (id: ExportFormatId) => Promise<boolean>;
}

export function useExport(project: BadgeProject, fonts: FontProvider): ExportState {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  // A refusal or a success line describes the badge it was made from.
  useEffect(() => setStatus(null), [project]);

  const exportAs = useCallback(
    async (id: ExportFormatId) => {
      if (running.current) return false;
      running.current = true;
      setBusy(true);
      try {
        const outcome = await exportBadge(id, project, fonts, browserIo);
        setStatus(outcome.message);
        return outcome.ok;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [project, fonts]
  );

  return { status, setStatus, busy, exportAs };
}
