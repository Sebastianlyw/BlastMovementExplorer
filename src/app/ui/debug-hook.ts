import { getBlock } from '../domain/blocks';
import { BenchmarkResult, SceneRenderer } from '../renderer/scene-renderer';
import { ExplorerStore } from '../state/explorer-store';

/**
 * Inspection hook used by Playwright tests (`window.__bmx`).
 * It exposes queries plus one write helper (`selectForTest`, for blocks that cannot be
 * clicked because they are occluded); otherwise tests drive the app through the real UI.
 */
export interface DebugHook {
  /** First visible block found by scanning a coarse grid of screen points. */
  findPickableBlock(): { id: number; x: number; y: number } | null;
  pickAt(x: number, y: number): number | null;
  projectBlock(id: number): { x: number; y: number } | null;
  block(id: number): ReturnType<typeof getBlock> | null;
  camera(): ReturnType<SceneRenderer['cameraState']>;
  terrainHeight(x: number, y: number): number | null;
  lifecycle(): { liveRenderers: number; pendingFrames: number; geometries: number; textures: number; framesRendered: number };
  loseContext(): boolean;
  restoreContext(): void;
  lastBenchmark(): BenchmarkResult | null;
  pixelRatio(): number;
  selectionOutline(): { visible: boolean; center: readonly [number, number, number] };
  /** Test helper: select by id through the store, as a click would. */
  selectForTest(id: number): void;
  pointCount(): number;
}

declare global {
  interface Window {
    __bmx?: DebugHook;
  }
}

export function installDebugHook(store: ExplorerStore, renderer: SceneRenderer, lastBenchmark: () => BenchmarkResult | null): () => void {
  const hook: DebugHook = {
    findPickableBlock() {
      const canvas = document.querySelector('[data-testid="viewport"] canvas');
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      for (let fy = 0.35; fy <= 0.75; fy += 0.05) {
        for (let fx = 0.3; fx <= 0.7; fx += 0.05) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          const id = renderer.pickAt(x, y);
          if (id !== null) return { id, x, y };
        }
      }
      return null;
    },
    pickAt: (x, y) => renderer.pickAt(x, y),
    projectBlock: (id) => renderer.projectBlock(id),
    block(id) {
      const ds = store.currentDataset();
      const i = store.blockIndexOf(id);
      return ds && i !== undefined ? getBlock(ds.blocks, i) : null;
    },
    camera: () => renderer.cameraState(),
    terrainHeight: (x, y) => store.heightFunction()?.(x, y) ?? null,
    lifecycle: () => ({ liveRenderers: SceneRenderer.liveInstances, pendingFrames: SceneRenderer.pendingFrames, ...renderer.resourceCounts() }),
    loseContext: () => renderer.simulateContextLoss(),
    restoreContext: () => renderer.simulateContextRestore(),
    lastBenchmark: () => lastBenchmark(),
    pixelRatio: () => renderer.pixelRatio,
    selectionOutline: () => renderer.selectionOutline(),
    selectForTest: (id) => store.select(id),
    pointCount: () => renderer.pointCount,
  };
  window.__bmx = hook;
  return () => {
    if (window.__bmx === hook) delete window.__bmx;
  };
}
