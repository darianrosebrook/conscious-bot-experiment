/**
 * In-memory registry for placed workstation positions.
 *
 * PlaceWorkstationLeaf records positions on successful placement.
 * The prereq injector consults this registry when craft_recipe fails
 * because the bot isn't near a required workstation — enabling a
 * navigate-back-to-table prereq instead of the wrong "mine materials" loop.
 *
 * @author @darianrosebrook
 */

export interface WorkstationEntry {
  type: string;
  position: { x: number; y: number; z: number };
  placedAt: number;
}

function manhattan(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

function euclidean(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.sqrt(
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2,
  );
}

export class WorkstationRegistry {
  private entries: WorkstationEntry[] = [];

  /** Register a workstation. Deduplicates within 1 block Manhattan distance. */
  register(
    type: string,
    position: { x: number; y: number; z: number },
  ): void {
    const duplicate = this.entries.find(
      (e) => e.type === type && manhattan(e.position, position) <= 1,
    );
    if (duplicate) {
      // Update position and timestamp (may have shifted by 1 block on re-place)
      duplicate.position = { ...position };
      duplicate.placedAt = Date.now();
      return;
    }
    this.entries.push({ type, position: { ...position }, placedAt: Date.now() });
  }

  /** Find the nearest workstation of the given type within maxDistance. */
  findNearest(
    type: string,
    from: { x: number; y: number; z: number },
    maxDistance = 64,
  ): WorkstationEntry | null {
    let best: WorkstationEntry | null = null;
    let bestDist = Infinity;
    for (const entry of this.entries) {
      if (entry.type !== type) continue;
      const dist = euclidean(entry.position, from);
      if (dist <= maxDistance && dist < bestDist) {
        best = entry;
        bestDist = dist;
      }
    }
    return best;
  }

  /** Remove a workstation entry within 1 block Manhattan distance. */
  remove(
    type: string,
    position: { x: number; y: number; z: number },
  ): boolean {
    const idx = this.entries.findIndex(
      (e) => e.type === type && manhattan(e.position, position) <= 1,
    );
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    return true;
  }

  /** Clear all entries (session reset). */
  clear(): void {
    this.entries = [];
  }

  /** Get all entries, optionally filtered by type. */
  getAll(type?: string): readonly WorkstationEntry[] {
    if (type) return this.entries.filter((e) => e.type === type);
    return this.entries;
  }
}

export const workstationRegistry = new WorkstationRegistry();
