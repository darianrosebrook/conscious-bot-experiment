/**
 * BuildingTab — layout shell for the 3D building designer
 *
 * Toolbar (place/erase/clear/save/load/solve) + two-pane (3D canvas + graph)
 * + bottom materials picker. Includes playback controls for animated solve
 * visualization and inventory panel toggle.
 *
 * Controls:
 *   Left-click        → place block
 *   Shift+left-click  → erase block
 *   Middle-click       → pick block (copy type from targeted block)
 *   Right-drag         → orbit camera
 *   Shift+right-drag   → pan camera
 */

import { useState, useRef, useCallback } from 'react';
import {
  Bot,
  Box,
  ChevronDown,
  Download,
  Eraser,
  FolderOpen,
  Package,
  Pause,
  Play,
  RotateCcw,
  Save,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useBuildingStore } from '@/stores/building-store';
import { useSterlingSolve } from '@/hooks/use-sterling-solve';
import { usePlaybackTimer } from '@/hooks/use-playback-timer';
import { blocksToSolveRequest } from '@/lib/blocks-to-solve-request';
import { BUILDING_TEMPLATES } from '@/lib/building-templates';
import { cn } from '@/lib/utils';
import { BlockCanvas } from './block-canvas';
import { SolveGraphPanel } from './solve-graph-panel';
import { MaterialsPicker } from './materials-picker';
import { InventoryPanel } from './inventory-panel';
import s from './building-tab.module.scss';

export interface BuildingTabProps {
  /** MC version from viewer-status (bot.server.version) so Building tab uses same textures as Live viewer */
  mcVersion?: string | null;
}

export function BuildingTab({ mcVersion }: BuildingTabProps = {}) {
  const buildMode = useBuildingStore((st) => st.buildMode);
  const setBuildMode = useBuildingStore((st) => st.setBuildMode);
  const clearBlocks = useBuildingStore((st) => st.clearBlocks);
  const blocks = useBuildingStore((st) => st.blocks);
  const blockCount = blocks.length;
  const savedLayouts = useBuildingStore((st) => st.savedLayouts);
  const saveLayout = useBuildingStore((st) => st.saveLayout);
  const loadLayout = useBuildingStore((st) => st.loadLayout);
  const loadBlocks = useBuildingStore((st) => st.loadBlocks);
  const deleteLayout = useBuildingStore((st) => st.deleteLayout);
  const exportLayoutJSON = useBuildingStore((st) => st.exportLayoutJSON);
  const importLayoutJSON = useBuildingStore((st) => st.importLayoutJSON);
  const solveStatus = useBuildingStore((st) => st.solveStatus);

  // Playback state
  const playbackMode = useBuildingStore((st) => st.playbackMode);
  const playbackBlocks = useBuildingStore((st) => st.playbackBlocks);
  const currentBlockIndex = useBuildingStore((st) => st.currentBlockIndex);
  const playbackSpeed = useBuildingStore((st) => st.playbackSpeed);
  const startPlayback = useBuildingStore((st) => st.startPlayback);
  const pausePlayback = useBuildingStore((st) => st.pausePlayback);
  const stepForward = useBuildingStore((st) => st.stepForward);
  const stepBackward = useBuildingStore((st) => st.stepBackward);
  const setPlaybackSpeed = useBuildingStore((st) => st.setPlaybackSpeed);
  const resetPlayback = useBuildingStore((st) => st.resetPlayback);

  const { startSolve, cancel: cancelSolve } = useSterlingSolve();

  // Drive the playback timer
  usePlaybackTimer();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [showInventoryPanel, setShowInventoryPanel] = useState(false);
  const [saveName, setSaveName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prerequisite state
  const hasDeficit = useBuildingStore((st) => st.hasDeficit);
  const deficitSummary = useBuildingStore((st) => st.deficitSummary);
  const prerequisiteChains = useBuildingStore((st) => st.prerequisiteChains);

  const isSolving = solveStatus === 'solving' || solveStatus === 'connecting' || solveStatus === 'solving_prerequisites';

  const handleSolve = useCallback(() => {
    if (isSolving) {
      cancelSolve();
      return;
    }
    if (blocks.length === 0) return;
    const inventory = useBuildingStore.getState().getActiveInventory();
    const request = blocksToSolveRequest(blocks, inventory);
    startSolve(request);
  }, [isSolving, blocks, startSolve, cancelSolve]);

  const handleSave = () => {
    const name = saveName.trim() || `Build ${savedLayouts.length + 1}`;
    saveLayout(name);
    setSaveName('');
    setShowSaveDialog(false);
  };

  const handleExport = () => {
    const json = exportLayoutJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'building-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const json = reader.result as string;
      importLayoutJSON(json);
    };
    reader.readAsText(file);
    // Reset so the same file can be imported again
    e.target.value = '';
  };

  const handlePlayPause = () => {
    if (playbackMode === 'playing') {
      pausePlayback();
    } else {
      startPlayback();
    }
  };

  const showPlaybackControls = (solveStatus === 'solved' || solveStatus === 'deficit') && playbackBlocks.length > 0;

  return (
    <div className={s.root}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className={s.toolbar}>
        <div className={s.toolbarGroup}>
          <button
            className={cn(s.toolBtn, buildMode === 'place' && s.toolBtnActive)}
            onClick={() => setBuildMode('place')}
          >
            <Box /> Place
          </button>
          <button
            className={cn(s.toolBtn, buildMode === 'erase' && s.toolBtnActive)}
            onClick={() => setBuildMode('erase')}
          >
            <Eraser /> Erase
          </button>
          <button className={s.toolBtn} onClick={clearBlocks}>
            <Trash2 /> Clear
          </button>

          <span className={s.toolbarDivider} />

          {/* Save */}
          <div className={s.dropdownAnchor}>
            <button
              className={s.toolBtn}
              onClick={() => {
                setShowSaveDialog(!showSaveDialog);
                setShowLoadMenu(false);
              }}
              disabled={blockCount === 0}
            >
              <Save /> Save
            </button>
            {showSaveDialog && (
              <div className={s.dropdown}>
                <div className={s.dropdownRow}>
                  <input
                    className={s.dropdownInput}
                    placeholder="Layout name…"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    autoFocus
                  />
                  <button className={s.dropdownAction} onClick={handleSave}>
                    Save
                  </button>
                </div>
                <button className={s.dropdownItem} onClick={handleExport}>
                  <Download /> Export as JSON
                </button>
              </div>
            )}
          </div>

          {/* Load */}
          <div className={s.dropdownAnchor}>
            <button
              className={s.toolBtn}
              onClick={() => {
                setShowLoadMenu(!showLoadMenu);
                setShowSaveDialog(false);
              }}
            >
              <FolderOpen /> Load <ChevronDown />
            </button>
            {showLoadMenu && (
              <div className={s.dropdown}>
                {/* Templates */}
                <div className={s.dropdownLabel}>Templates</div>
                {BUILDING_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    className={s.dropdownItem}
                    onClick={() => {
                      loadBlocks(tpl.blocks);
                      setShowLoadMenu(false);
                    }}
                    title={tpl.description}
                  >
                    {tpl.name}
                    <span className={s.dropdownMeta}>
                      {tpl.blocks.length} blocks
                    </span>
                  </button>
                ))}

                {/* Saved layouts */}
                {savedLayouts.length > 0 && (
                  <>
                    <div className={s.dropdownLabel}>Saved</div>
                    {savedLayouts.map((layout) => (
                      <div key={layout.id} className={s.dropdownItemRow}>
                        <button
                          className={s.dropdownItem}
                          onClick={() => {
                            loadLayout(layout.id);
                            setShowLoadMenu(false);
                          }}
                        >
                          {layout.name}
                          <span className={s.dropdownMeta}>
                            {layout.blocks.length} blocks
                          </span>
                        </button>
                        <button
                          className={s.dropdownDeleteBtn}
                          onClick={() => deleteLayout(layout.id)}
                          title="Delete layout"
                        >
                          <X />
                        </button>
                      </div>
                    ))}
                  </>
                )}

                <button
                  className={s.dropdownItem}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload /> Import JSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className={s.hiddenInput}
                  onChange={handleImport}
                />
              </div>
            )}
          </div>
        </div>

        <div className={s.toolbarGroup}>
          {/* Inventory toggle */}
          <button
            className={cn(s.toolBtn, showInventoryPanel && s.toolBtnActive)}
            onClick={() => setShowInventoryPanel(!showInventoryPanel)}
            title="Inventory"
          >
            <Package /> Inventory
          </button>

          {/* Bot toggle (disabled placeholder) */}
          <button className={s.toolBtn} disabled title="Available when Sterling is connected">
            <Bot /> Bot Build
          </button>

          <button
            className={cn(s.solveBtn, isSolving && s.solveBtnStopping)}
            disabled={blockCount === 0 && !isSolving}
            onClick={handleSolve}
          >
            {isSolving ? (
              <>
                <Square /> Stop
              </>
            ) : (
              <>
                <Play /> Solve
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Prerequisite status ─────────────────────────────────────────── */}
      {solveStatus === 'solving_prerequisites' && (
        <div className={s.prereqBar}>
          <span className={s.prereqLabel}>Resolving prerequisites...</span>
        </div>
      )}
      {hasDeficit && (solveStatus === 'deficit' || solveStatus === 'solved') && (
        <div className={s.prereqBar}>
          <span className={s.prereqLabel}>
            {solveStatus === 'deficit' ? 'Materials needed' : 'Prerequisites resolved'}
          </span>
          <div className={s.deficitList}>
            {Object.entries(deficitSummary).map(([item, count]) => {
              // Find the primary action type for this item from prerequisite chains
              const chain = prerequisiteChains.find((c) => c.goalItem === item);
              const primaryAction = chain?.steps?.[0]?.actionType;
              return (
                <span
                  key={item}
                  className={s.deficitItem}
                  data-action={primaryAction || 'craft'}
                >
                  {count as number}&times; {item.replace(/_/g, ' ')}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Playback controls ──────────────────────────────────────────── */}
      {showPlaybackControls && (
        <div className={s.playbackBar}>
          <div className={s.playbackControls}>
            <button
              className={s.playbackBtn}
              onClick={stepBackward}
              disabled={currentBlockIndex <= 0}
              title="Step back"
            >
              <SkipBack />
            </button>
            <button
              className={cn(s.playbackBtn, s.playbackBtnMain)}
              onClick={handlePlayPause}
              title={playbackMode === 'playing' ? 'Pause' : 'Play'}
            >
              {playbackMode === 'playing' ? <Pause /> : <Play />}
            </button>
            <button
              className={s.playbackBtn}
              onClick={stepForward}
              disabled={currentBlockIndex >= playbackBlocks.length}
              title="Step forward"
            >
              <SkipForward />
            </button>
          </div>

          <div className={s.playbackProgress}>
            <span className={s.playbackCounter}>
              Block {currentBlockIndex} / {playbackBlocks.length}
            </span>
            <div className={s.progressBar}>
              <div
                className={s.progressFill}
                style={{
                  width: `${playbackBlocks.length > 0 ? (currentBlockIndex / playbackBlocks.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          <div className={s.playbackSpeed}>
            <label className={s.speedLabel}>Speed</label>
            <input
              type="range"
              min={1}
              max={8}
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              className={s.speedSlider}
            />
            <span className={s.speedValue}>{playbackSpeed}/s</span>
          </div>

          <button
            className={s.playbackBtn}
            onClick={resetPlayback}
            title="Reset — show all blocks"
          >
            <RotateCcw />
          </button>
        </div>
      )}

      {/* ── Two-pane area ───────────────────────────────────────────────── */}
      <div className={s.panes}>
        <div className={s.canvasPane}>
          <BlockCanvas mcVersion={mcVersion} />
        </div>
        <div className={s.graphPane}>
          <SolveGraphPanel />
        </div>
      </div>

      {/* ── Materials picker ────────────────────────────────────────────── */}
      <div className={s.bottomBar}>
        <MaterialsPicker />
      </div>

      {/* ── Inventory panel (slide-in) ──────────────────────────────────── */}
      {showInventoryPanel && (
        <InventoryPanel onClose={() => setShowInventoryPanel(false)} />
      )}
    </div>
  );
}
