import React, { Suspense, lazy, useState } from 'react';
import { useProject } from './state/useProject';
import { exportFormats } from './state/exportFlow';
import { useExport } from './state/useExport';
import { useProjectFile } from './state/useProjectFile';
import { useRelief } from './state/useRelief';
import { useUndoRemove } from './state/useUndoRemove';
import { AppBar } from './ui/AppBar';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Inspector } from './ui/Inspector';
import { Stage2D } from './ui/Stage2D';
import { Stage3DUnavailable } from './ui/Stage3DUnavailable';
import { StageViewToggle } from './ui/StageViewToggle';
import type { StageView } from './ui/StageViewToggle';
import { partsLiftMm } from './ui/stage3dMath';
import { partsForMode } from './ui/parts';
import type { PartId } from './ui/parts';
import { useShortcuts } from './ui/useShortcuts';

/** three.js comes in with the 3D stage, the first time it shows. */
const Stage3D = lazy(() => import('./ui/Stage3D').then((m) => ({ default: m.Stage3D })));

/** Layers and relief take the same step, so a mode switch carries an open one across. */
const COUNTERPART: Partial<Record<PartId, PartId>> = { layers: 'relief', relief: 'layers' };

export function App() {
  const { project, dispatch: send, selectedId, setSelectedId, resolved, fonts } = useProject();
  // Every edit goes through this, so a removed element can come back with ⌘Z.
  const dispatch = useUndoRemove(project, send, setSelectedId);
  const relief = useRelief(project, resolved);
  const { status, setStatus, busy, exportAs } = useExport(project, fonts);
  const file = useProjectFile({ project, dispatch, clearSelection: () => setSelectedId(null), setStatus });
  /** 3D print mode opens flat, where elements can be dragged; the 3D preview is a tap away, and the choice lasts the session. */
  const [stageView, setStageView] = useState<StageView>('2d');
  const [settingQuery, setSettingQuery] = useState('');
  /** Whether the selected text shows its letter-pair handles on the stage. */
  const [adjustPairs, setAdjustPairs] = useState(false);
  /** The one open inspector section; null when the user closed it. */
  const [openPart, setOpenPart] = useState<PartId | null>('shape');
  /** Asks the inspector to scroll a part's chip and section into view; `n` makes a repeat count. */
  const [scrollRequest, setScrollRequest] = useState<{ id: PartId; n: number } | null>(null);

  const parts = partsForMode(project.mode);
  const selectedPart = openPart && !parts.some((p) => p.id === openPart) ? (COUNTERPART[openPart] ?? null) : openPart;
  const query = settingQuery.trim().toLowerCase();
  // A search shows only the matching parts, each one open.
  const visibleParts = query
    ? parts.filter((p) => p.keywords.toLowerCase().includes(query) || p.label.toLowerCase().includes(query))
    : parts;

  const handleTogglePart = (id: PartId) => {
    if (query) {
      setSettingQuery('');
      setOpenPart(id);
      return;
    }
    setOpenPart(selectedPart === id ? null : id);
  };

  /** A chip always opens its part, clears the search so the section shows, and scrolls to it. */
  const handleSelectPart = (id: PartId) => {
    setSettingQuery('');
    setOpenPart(id);
    setScrollRequest((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
  };

  const viewToggle = <StageViewToggle value={stageView} onChange={setStageView} />;

  useShortcuts({
    save: file.onSave,
    open: file.onOpen,
    // A refusal has no menu open to show it, so the Export section opens to say why. A busy click does nothing.
    export: () => void exportAs(exportFormats(project)[0].id).then((result) => result === 'refused' && handleSelectPart('export')),
  });

  return (
    <div className="app">
      <AppBar
        mode={project.mode}
        onSelectMode={(mode) => dispatch({ type: 'set', patch: { mode } })}
        displayUnit={project.unit}
        onSelectUnit={(unit) => dispatch({ type: 'set', patch: { unit } })}
        projectMenu={{ onNew: file.onNew, onOpen: file.onOpen, onSave: file.onSave, unsaved: file.unsaved }}
        project={project}
        onExport={exportAs}
        exportStatus={status}
        exporting={busy}
      />
      <input ref={file.inputRef} type="file" accept=".badge,application/json" hidden onChange={file.onFileChosen} />
      <div className="app-body">
        {relief && stageView === '3d' ? (
          <ErrorBoundary fallback={<Stage3DUnavailable viewToggle={viewToggle} />}>
            <Suspense fallback={<div className="stage"><p className="stage3d-note" role="status">Loading 3D view</p></div>}>
              <Stage3D
                meshes={relief}
                partsLiftMm={partsLiftMm(project.relief.plateMm, relief.clamped.recessMm ?? project.relief.recessMm)}
                unit={project.unit}
                viewToggle={viewToggle}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <Stage2D project={project} resolved={resolved} selectedId={selectedId} onSelect={setSelectedId} dispatch={dispatch} unit={project.unit} fonts={fonts} adjustPairs={adjustPairs} viewToggle={relief ? viewToggle : undefined} />
        )}
        <Inspector
          settingQuery={settingQuery}
          onSettingQuery={setSettingQuery}
          parts={parts}
          visibleParts={visibleParts}
          selectedPart={selectedPart}
          onSelectPart={handleSelectPart}
          onTogglePart={handleTogglePart}
          scrollRequest={scrollRequest}
          sectionProps={{ project, dispatch, selectedId, setSelectedId, resolved, relief, fonts, adjustPairs, setAdjustPairs }}
          exportControls={{ onExport: exportAs, status, busy }}
        />
      </div>
    </div>
  );
}
