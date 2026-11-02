/// <reference lib="webworker" />
import { generateSurfacePoints } from '../domain/point-cloud';
import { PointCloudRequest, PointCloudResponse } from './point-cloud-protocol';

addEventListener('message', ({ data }: MessageEvent<PointCloudRequest>) => {
  const t0 = performance.now();
  let response: PointCloudResponse;
  try {
    const cloud = generateSurfacePoints(data.seed, data.params, data.tier);
    response = { id: data.id, ok: true, positions: cloud.positions, count: cloud.count, bounds: cloud.bounds, tier: cloud.tier, ms: performance.now() - t0 };
    // Transfer the buffer: after this call it is detached here and must not be touched.
    postMessage(response, [cloud.positions.buffer]);
  } catch (e) {
    response = { id: data.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    postMessage(response);
  }
});
