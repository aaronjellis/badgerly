import React, { useState } from 'react';
import { useProject } from './state/useProject';
import { useRelief } from './state/useRelief';
import { AppBar } from './ui/AppBar';
import { Inspector } from './ui/Inspector';
import { Stage2D } from './ui/Stage2D';
import { Stage3D } from './ui/Stage3D';
import { StageViewToggle } from './ui/StageViewToggle';
import type { StageView } from './ui/StageViewToggle';
import { partsLiftMm } from './ui/stage3dMath';
import { partsForMode } from './ui/parts';
import type { PartId } from './ui/parts';

/** Layers and relief take the same step, so a mode switch carries an open one across. */
const COUNTERPART: Partial<Record<PartId, PartId>> = { layers: 'relief', relief: 'layers' };

export function App() {
  const { project, dispatch, selectedId, setSelectedId, resolved, fonts } = useProject();
  const relief = useRelief(project, resolved);
  /** 3D print mode shows the 3D preview first, and keeps the choice for the session. */
  const [stageView, setStageView] = useState<StageView>('3d');
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

  return (
    <div className="app">
      <AppBar
        mode={project.mode}
        onSelectMode={(mode) => dispatch({ type: 'set', patch: { mode } })}
        displayUnit={project.unit}
        onSelectUnit={(unit) => dispatch({ type: 'set', patch: { unit } })}
        // Task 20 wires Open and Save and tracks unsaved changes.
        projectMenu={{ onNew: () => dispatch({ type: 'new' }), onOpen: () => {}, onSave: () => {}, unsaved: false }}
      />
      <div className="app-body">
        {relief && stageView === '3d' ? (
          <Stage3D
            meshes={relief}
            partsLiftMm={partsLiftMm(project.relief.plateMm, relief.clamped.recessMm ?? project.relief.recessMm)}
            unit={project.unit}
            viewToggle={viewToggle}
          />
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
        />
      </div>
    </div>
  );
}
