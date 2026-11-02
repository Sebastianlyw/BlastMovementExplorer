import { DEFAULT_GENERATION_PARAMS, DEFAULT_SEED, terrainHeightFor } from './generator';
import { generateSurfacePoints, SCAN_NOISE_MAX } from './point-cloud';

describe('synthetic surface scan', () => {
  const cloud = generateSurfacePoints(DEFAULT_SEED, DEFAULT_GENERATION_PARAMS, '100k');

  it('is deterministic', () => {
    expect(generateSurfacePoints(DEFAULT_SEED, DEFAULT_GENERATION_PARAMS, '100k').positions).toEqual(cloud.positions);
  });

  it('changes with the seed', () => {
    const other = generateSurfacePoints(DEFAULT_SEED + 1, DEFAULT_GENERATION_PARAMS, '100k');
    expect(other.positions).not.toEqual(cloud.positions);
  });

  it('has dropout holes but keeps most points', () => {
    expect(cloud.count).toBeLessThan(100_000);
    expect(cloud.count).toBeGreaterThan(70_000);
    expect(cloud.positions.length).toBe(cloud.count * 3);
  });

  it('lies on the terrain surface within the noise bound and inside the extent (every tier)', () => {
    const h = terrainHeightFor(DEFAULT_GENERATION_PARAMS);
    const ext = DEFAULT_GENERATION_PARAMS.terrain.extent;
    let maxDev = 0;
    let outside = 0;
    for (const tier of ['100k', '300k', '1m'] as const) {
      const c = tier === '100k' ? cloud : generateSurfacePoints(DEFAULT_SEED, DEFAULT_GENERATION_PARAMS, tier);
      for (let i = 0; i < c.count; i++) {
        const x = c.positions[i * 3];
        const y = c.positions[i * 3 + 1];
        const z = c.positions[i * 3 + 2];
        if (!(x >= ext.min[0] && x <= ext.max[0] && y >= ext.min[1] && y <= ext.max[1])) outside++;
        maxDev = Math.max(maxDev, Math.abs(z - h(x, y)));
      }
    }
    expect(outside).toBe(0);
    // float32 storage adds < 1e-5 m at these magnitudes
    expect(maxDev).toBeLessThanOrEqual(SCAN_NOISE_MAX + 1e-4);
    expect(maxDev).toBeGreaterThan(0);
  });

  it('scales with the tier', () => {
    const c300 = generateSurfacePoints(DEFAULT_SEED, DEFAULT_GENERATION_PARAMS, '300k');
    expect(c300.count).toBeGreaterThan(210_000);
    expect(c300.count).toBeLessThan(300_000);
  });

  it('is labelled as a synthetic surface scan', () => {
    expect(cloud.source).toBe('synthetic-surface-scan');
  });
});
