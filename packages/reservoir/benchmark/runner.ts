import type { BenchmarkResult, LatencyStats, MemorySnapshot } from './config.js';
import type { EngineType } from '../src/index.js';

// ---------------------------------------------------------------------------
// Memory tracking
// ---------------------------------------------------------------------------

export function getMemorySnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    heapUsedMB: Number((mem.heapUsed / 1e6).toFixed(1)),
    heapTotalMB: Number((mem.heapTotal / 1e6).toFixed(1)),
    rssMB: Number((mem.rss / 1e6).toFixed(1)),
    externalMB: Number((mem.external / 1e6).toFixed(1)),
  };
}

// ---------------------------------------------------------------------------
// Stats calculation
// ---------------------------------------------------------------------------

export function calculateStats(durations: number[]): LatencyStats {
  if (durations.length === 0) {
    return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    avg: Number((sum / sorted.length).toFixed(2)),
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    p50: Number(percentile(sorted, 0.5).toFixed(2)),
    p95: Number(percentile(sorted, 0.95).toFixed(2)),
    p99: Number(percentile(sorted, 0.99).toFixed(2)),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---------------------------------------------------------------------------
// Benchmark executor
// ---------------------------------------------------------------------------

export interface BenchmarkFnResult {
  /** Number of records processed (for ops/sec calculation) */
  recordCount?: number;
}

export type BenchmarkFn = () => Promise<BenchmarkFnResult | void>;

export interface RunOptions {
  operation: string;
  domain: 'logs' | 'spans' | 'metrics';
  engine: EngineType;
  volume: string;
  variant?: string;
  iterations: number;
  warmup: number;
  fn: BenchmarkFn;
  /** Optional setup to run before each iteration */
  setup?: () => Promise<void>;
  /** Optional teardown to run after each iteration */
  teardown?: () => Promise<void>;
}

export async function runBenchmark(opts: RunOptions): Promise<BenchmarkResult> {
  const { operation, domain, engine, volume, variant, iterations, warmup, fn, setup, teardown } = opts;

  const label = variant ? `${operation} (${variant})` : operation;
  const total = warmup + iterations;

  // Capture memory before benchmark
  global.gc?.();
  const memoryBefore = getMemorySnapshot();

  // Warmup + measured iterations
  const durations: number[] = [];
  let lastRecordCount: number | undefined;
  let peakRssMB = memoryBefore.rssMB;

  for (let i = 0; i < total; i++) {
    const isWarmup = i < warmup;

    if (setup) await setup();

    const start = process.hrtime.bigint();
    try {
      const result = await fn();
      const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // ns → ms

      if (!isWarmup) {
        durations.push(elapsed);
        if (result?.recordCount != null) lastRecordCount = result.recordCount;

        // Track peak memory
        const currentRss = process.memoryUsage().rss / 1e6;
        if (currentRss > peakRssMB) peakRssMB = currentRss;
      }
    } catch (err) {
      const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
      if (!isWarmup) durations.push(elapsed);

      if (teardown) await teardown();

      const memoryAfter = getMemorySnapshot();
      return {
        operation: label,
        domain,
        engine,
        volume,
        variant,
        durations,
        stats: calculateStats(durations),
        memoryBefore,
        memoryAfter,
        memoryDeltaMB: Number((memoryAfter.rssMB - memoryBefore.rssMB).toFixed(1)),
        error: String(err),
      };
    }

    if (teardown) await teardown();
  }

  const memoryAfter = getMemorySnapshot();
  const stats = calculateStats(durations);
  const opsPerSec = lastRecordCount != null && stats.avg > 0
    ? Number(((lastRecordCount / stats.avg) * 1000).toFixed(0))
    : undefined;

  return {
    operation: label,
    domain,
    engine,
    volume,
    variant,
    durations,
    stats,
    opsPerSec,
    recordCount: lastRecordCount,
    memoryBefore,
    memoryAfter,
    memoryDeltaMB: Number((peakRssMB - memoryBefore.rssMB).toFixed(1)),
  };
}

// ---------------------------------------------------------------------------
// Concurrent benchmark executor
// ---------------------------------------------------------------------------

export async function runConcurrent(
  concurrency: number,
  fn: BenchmarkFn,
): Promise<{ totalMs: number; individualMs: number[] }> {
  const start = process.hrtime.bigint();
  const promises: Promise<number>[] = [];

  for (let i = 0; i < concurrency; i++) {
    promises.push(
      (async () => {
        const s = process.hrtime.bigint();
        await fn();
        return Number(process.hrtime.bigint() - s) / 1e6;
      })(),
    );
  }

  const individualMs = await Promise.all(promises);
  const totalMs = Number(process.hrtime.bigint() - start) / 1e6;
  return { totalMs, individualMs };
}

// ---------------------------------------------------------------------------
// Progress logging
// ---------------------------------------------------------------------------

export function logProgress(
  engine: EngineType,
  operation: string,
  result: BenchmarkResult,
): void {
  const status = result.error ? '  FAIL' : '    OK';
  const latency = result.error ? result.error.slice(0, 60) : `${result.stats.p50}ms p50`;
  const ops = result.opsPerSec ? ` | ${result.opsPerSec.toLocaleString()} ops/s` : '';
  const mem = result.memoryDeltaMB != null ? ` | +${result.memoryDeltaMB}MB` : '';
  console.log(`  ${status}  [${engine}] ${operation}: ${latency}${ops}${mem}`);
}
