import { DEFAULT_GENERATION_PARAMS } from '../domain/generator';
import { PointCloudClient, WorkerLike } from './point-cloud-client';
import { PointCloudRequest, PointCloudResponse } from './point-cloud-protocol';

/** A fake worker that lets the test decide when and in which order to answer. */
class FakeWorker implements WorkerLike {
  onmessage: ((ev: MessageEvent<PointCloudResponse>) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  readonly received: PointCloudRequest[] = [];
  terminated = false;

  postMessage(m: PointCloudRequest): void {
    this.received.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  respond(id: number, count: number): void {
    const res: PointCloudResponse = {
      id,
      ok: true,
      positions: new Float32Array(count * 3),
      count,
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
      tier: '100k',
      ms: 1,
    };
    this.onmessage?.({ data: res } as MessageEvent<PointCloudResponse>);
  }
}

describe('PointCloudClient', () => {
  it('drops a stale response that arrives after a newer request', async () => {
    const w = new FakeWorker();
    const client = new PointCloudClient(w);
    const first = client.request(1, DEFAULT_GENERATION_PARAMS, '1m');
    const second = client.request(1, DEFAULT_GENERATION_PARAMS, '100k');
    // The old (slow) result arrives first, then the new one.
    w.respond(w.received[0].id, 999);
    w.respond(w.received[1].id, 10);
    await expect(first).resolves.toBeNull();
    const r = await second;
    expect(r?.count).toBe(10);
  });

  it('drops a stale response that arrives last', async () => {
    const w = new FakeWorker();
    const client = new PointCloudClient(w);
    const first = client.request(1, DEFAULT_GENERATION_PARAMS, '1m');
    const second = client.request(1, DEFAULT_GENERATION_PARAMS, '100k');
    w.respond(w.received[1].id, 10);
    w.respond(w.received[0].id, 999); // ignored
    expect((await second)?.count).toBe(10);
    await expect(first).resolves.toBeNull();
  });

  it('cancel invalidates an in-flight request', async () => {
    const w = new FakeWorker();
    const client = new PointCloudClient(w);
    const p = client.request(1, DEFAULT_GENERATION_PARAMS, '300k');
    client.cancel();
    w.respond(w.received[0].id, 5);
    await expect(p).resolves.toBeNull();
  });

  it('rejects on worker error responses and terminates on dispose', async () => {
    const w = new FakeWorker();
    const client = new PointCloudClient(w);
    const p = client.request(1, DEFAULT_GENERATION_PARAMS, '100k');
    w.onmessage?.({ data: { id: w.received[0].id, ok: false, error: 'boom' } } as MessageEvent<PointCloudResponse>);
    await expect(p).rejects.toThrow('boom');
    client.dispose();
    expect(w.terminated).toBe(true);
    await expect(client.request(1, DEFAULT_GENERATION_PARAMS, '100k')).resolves.toBeNull();
  });
});
