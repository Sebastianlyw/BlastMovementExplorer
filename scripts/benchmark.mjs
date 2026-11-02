// Repeatable rendering benchmark on the local GPU.
//
// Usage: npm run build && node scripts/benchmark.mjs [--configs=default,blocks-only,stress-1m,stress-1m-low] [--discrete-gpu]
//
// Launches a HEADED Chromium (hardware WebGL; headless uses SwiftShader and is not a
// performance measurement), opens the production build with ?benchmark=auto, waits for
// the in-app benchmark (2 s warm-up + 10 s sampling, fixed orbit + movement loop) and
// writes each result to benchmarks/results/<date>-<config>.json.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, release, totalmem, type } from 'node:os';

const CONFIGS = {
  default: '?quality=high&points=100k&benchmark=auto',
  'blocks-only': '?quality=high&benchmark=auto',
  'stress-1m': '?quality=high&points=1m&benchmark=auto',
  'stress-1m-low': '?quality=low&points=1m&benchmark=auto',
};

const arg = process.argv.find((a) => a.startsWith('--configs='));
const names = arg ? arg.slice('--configs='.length).split(',') : Object.keys(CONFIGS);
// --discrete-gpu asks Chromium to prefer the high-performance adapter on multi-GPU machines.
const discrete = process.argv.includes('--discrete-gpu');
const launchArgs = discrete ? ['--force_high_performance_gpu'] : [];
const port = 4320;
const server = spawn(process.execPath, ['scripts/serve-dist.mjs', String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

mkdirSync('benchmarks/results', { recursive: true });
const stamp = new Date().toLocaleDateString('sv-SE'); // local YYYY-MM-DD
const host = { os: `${type()} ${release()}`, cpu: cpus()[0]?.model ?? 'unknown', logicalCores: cpus().length, ramGb: Math.round(totalmem() / 2 ** 30) };

try {
  for (const name of names) {
    const query = CONFIGS[name];
    if (!query) throw new Error(`Unknown config ${name}`);
    const browser = await chromium.launch({ channel: 'chromium', headless: false, args: launchArgs });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://localhost:${port}/${query}`);
    await page.waitForFunction(() => window.__bmx?.lastBenchmark?.() != null, null, { timeout: 120_000 });
    const result = await page.evaluate(() => window.__bmx.lastBenchmark());
    await browser.close();
    const record = { config: name, query, chromiumArgs: launchArgs, host, ...result };
    writeFileSync(`benchmarks/results/${stamp}-${name}${discrete ? '-discrete' : ''}.json`, JSON.stringify(record, null, 2));
    console.log(
      `${name.padEnd(14)} median ${result.medianFrameMs.toFixed(2)} ms  p95 ${result.p95FrameMs.toFixed(2)} ms  ` +
        `frames ${result.frames}  draws ${result.drawCalls}  points ${result.surfacePoints}  dpr ${result.pixelRatio}  gpu ${result.gpuRenderer}`,
    );
  }
} finally {
  server.kill();
}
