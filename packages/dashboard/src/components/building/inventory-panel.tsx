/**
 * InventoryPanel — Slide-in panel for viewing/editing block inventory
 *
 * Two modes:
 *   Auto  — Read-only counts computed from placed blocks
 *   Manual — Editable number inputs for each block type
 *
 * The active inventory is passed to Sterling solves, so manual mode
 * lets users test resource-constrained build scenarios.
 */

import { useBuildingStore } from '@/stores/building-store';
import { getBlockTextureUrl } from '@/lib/block-texture-resolver';
import { X, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import s from './inventory-panel.module.scss';

function displayName(block: string): string {
  return block
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface InventoryPanelProps {
  onClose: () => void;
}

export function InventoryPanel({ onClose }: InventoryPanelProps) {
  const blocks = useBuildingStore((st) => st.blocks);
  const inventoryMode = useBuildingStore((st) => st.inventoryMode);
  const manualInventory = useBuildingStore((st) => st.manualInventory);
  const setInventoryMode = useBuildingStore((st) => st.setInventoryMode);
  const setManualInventoryItem = useBuildingStore((st) => st.setManualInventoryItem);
  const clearManualInventory = useBuildingStore((st) => st.clearManualInventory);

  // Compute auto inventory (block counts from placed blocks)
  const autoInventory: Record<string, number> = {};
  for (const b of blocks) {
    autoInventory[b.blockType] = (autoInventory[b.blockType] || 0) + 1;
  }

  // Merge: show all block types from both auto and manual
  const allBlockTypes = new Set([
    ...Object.keys(autoInventory),
    ...Object.keys(manualInventory),
  ]);
  const sortedTypes = Array.from(allBlockTypes).sort();

  const isManual = inventoryMode === 'manual';
  const displayInventory = isManual ? manualInventory : autoInventory;

  const handleCopyFromAuto = () => {
    for (const [type, count] of Object.entries(autoInventory)) {
      setManualInventoryItem(type, count);
    }
  };

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={s.header}>
          <h3 className={s.title}>Inventory</h3>
          <button className={s.closeBtn} onClick={onClose}>
            <X />
          </button>
        </div>

        {/* Mode toggle */}
        <div className={s.modeToggle}>
          <button
            className={cn(s.modeBtn, !isManual && s.modeBtnActive)}
            onClick={() => setInventoryMode('auto')}
          >
            Auto (from blocks)
          </button>
          <button
            className={cn(s.modeBtn, isManual && s.modeBtnActive)}
            onClick={() => setInventoryMode('manual')}
          >
            Manual Override
          </button>
        </div>

        {/* Actions for manual mode */}
        {isManual && (
          <div className={s.actions}>
            <button className={s.actionBtn} onClick={handleCopyFromAuto}>
              <Copy /> Copy from auto
            </button>
            <button className={s.actionBtn} onClick={clearManualInventory}>
              Clear
            </button>
          </div>
        )}

        {/* Inventory list */}
        <div className={s.list}>
          {sortedTypes.length === 0 ? (
            <div className={s.empty}>No blocks placed yet</div>
          ) : (
            sortedTypes.map((type) => {
              const count = displayInventory[type] ?? 0;
              return (
                <div key={type} className={s.item}>
                  <img
                    src={getBlockTextureUrl(type)}
                    alt={type}
                    width={24}
                    height={24}
                    className={s.itemIcon}
                  />
                  <span className={s.itemName}>{displayName(type)}</span>
                  {isManual ? (
                    <input
                      type="number"
                      className={s.itemInput}
                      min={0}
                      value={count}
                      onChange={(e) =>
                        setManualInventoryItem(type, parseInt(e.target.value, 10) || 0)
                      }
                    />
                  ) : (
                    <span className={s.itemCount}>{count}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
