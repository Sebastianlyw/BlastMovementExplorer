import { PointTier } from '../domain/point-cloud';
import { GenerationParams } from '../domain/types';
import { PointCloudRequest, PointCloudResponse } from './point-cloud-protocol';

/** The subset of Worker the client needs (lets tests inject a fake). */
export interface WorkerLike {
  postMessage(message: PointCloudRequest): void;
  onmessage: ((ev: MessageEvent<PointCloudResponse>) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
  terminate(): void;
}

export type PointCloudResult = Extract<PointCloudResponse, { ok: true }>;

/**
 * Requests point clouds from a worker. Only the most recent request can resolve
 * with data; superseded requests resolve with null and their buffers are dropped.
 */
export class PointCloudClient {
  private latestId = 0;
  private readonly pending = new Map<number, { resolve: (r: PointCloudResult | null) => void; reject: (e: Error) => void }>();
  private disposed = false;

  constructor(private readonly worker: WorkerLike) {
    worker.onmessage = (ev) => this.onResponse(ev.data);
    worker.onerror = (ev) => {
      const err = new Error(ev.message || 'Point cloud worker failed');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  request(seed: number, params: GenerationParams, tier: PointTier): Promise<PointCloudResult | null> {
    if (this.disposed) return Promise.resolve(null);
    const id = ++this.latestId;
    // Older requests can never be shown any more: settle them now.
    for (const [oldId, p] of this.pending) {
      p.resolve(null);
      this.pending.delete(oldId);
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, seed, params, tier });
    });
  }

  /** Invalidate any in-flight request (e.g. when the layer is hidden or the scene changes). */
  cancel(): void {
    this.latestId++;
    for (const p of this.pending.values()) p.resolve(null);
    this.pending.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
  }

  private onResponse(res: PointCloudResponse): void {
    const p = this.pending.get(res.id);
    if (!p || res.id !== this.latestId) return; // stale: drop (its buffer is garbage-collected)
    this.pending.delete(res.id);
    if (res.ok) p.resolve(res);
    else p.reject(new Error(res.error));
  }
}

export function createPointCloudWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./point-cloud.worker', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}
