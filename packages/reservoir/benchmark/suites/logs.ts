import type { StorageEngine, LogRecord, AggregationInterval } from '../../src/index.js';
import type { BenchmarkResult, BenchmarkConfig } from '../config.js';
import type { EngineType } from '../../src/index.js';
import { generateLogs } from '../data-generators.js';
import { runBenchmark, runConcurrent, logProgress } from '../runner.js';

function getTimeRange() {
  return {
    from: new Date(Date.now() - 86400000 * 7),
    to: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Seed logs into engine
// ---------------------------------------------------------------------------

export async function seedLogs(
  engine: StorageEngine,
  engineType: EngineType,
  count: number,
  projectId: string,
  organizationId: string,
): Promise<void> {
  const batchSize = 100_000;
  let seeded = 0;
  const tr = getTimeRange();

  while (seeded < count) {
    const size = Math.min(batchSize, count - seeded);
    const logs = generateLogs(size, projectId, organizationId, tr);
    await engine.ingest(logs);
    seeded += size;

    if (seeded % 100_000 === 0 || seeded === count) {
      console.log(`    [${engineType}] seeded ${seeded.toLocaleString()}/${count.toLocaleString()} logs`);
    }
  }
}

// ---------------------------------------------------------------------------
// Log benchmark suite
// ---------------------------------------------------------------------------

export async function runLogBenchmarks(
  engine: StorageEngine,
  engineType: EngineType,
  volume: string,
  config: BenchmarkConfig,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const { iterations, warmup, projectId, organizationId } = config;
  const base = { domain: 'logs' as const, engine: engineType, volume, iterations, warmup };
  const tr = getTimeRange();

  // --- Ingestion benchmarks ---
  for (const batchSize of config.ingestBatchSizes) {
    const r = await runBenchmark({
      ...base,
      operation: 'ingest',
      variant: `batch ${batchSize.toLocaleString()}`,
      fn: async () => {
        const batchData = generateLogs(batchSize, projectId, organizationId, tr);
        await engine.ingest(batchData);
        return { recordCount: batchSize };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query: simple filter (service) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'query',
      variant: 'single service filter',
      fn: async () => {
        const res = await engine.query({
          projectId, from: tr.from, to: tr.to,
          service: 'api-gateway', limit: 100,
        });
        return { recordCount: res.logs.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query: multi-filter (service + level + hostname) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'query',
      variant: 'multi-filter',
      fn: async () => {
        const res = await engine.query({
          projectId, from: tr.from, to: tr.to,
          service: 'api-gateway', level: 'error', hostname: 'prod-01', limit: 100,
        });
        return { recordCount: res.logs.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query: full-text search ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'query',
      variant: 'full-text search',
      fn: async () => {
        const res = await engine.query({
          projectId, from: tr.from, to: tr.to,
          search: 'timeout connection', limit: 100,
        });
        return { recordCount: res.logs.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query: substring search ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'query',
      variant: 'substring search',
      fn: async () => {
        const res = await engine.query({
          projectId, from: tr.from, to: tr.to,
          search: 'circuit breaker', searchMode: 'substring', limit: 100,
        });
        return { recordCount: res.logs.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query: narrow time range (1 hour) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'query',
      variant: 'narrow time range (1h)',
      fn: async () => {
        const narrowFrom = new Date(Date.now() - 3600000);
        const res = await engine.query({
          projectId, from: narrowFrom, to: tr.to, limit: 100,
        });
        return { recordCount: res.logs.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query: pagination (offset 1000) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'query',
      variant: 'pagination offset=1000',
      fn: async () => {
        const res = await engine.query({
          projectId, from: tr.from, to: tr.to,
          limit: 100, offset: 1000,
        });
        return { recordCount: res.logs.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Aggregate ---
  for (const interval of config.aggregationIntervals) {
    const r = await runBenchmark({
      ...base,
      operation: 'aggregate',
      variant: interval,
      fn: async () => {
        const res = await engine.aggregate({
          projectId, from: tr.from, to: tr.to, interval,
        });
        return { recordCount: res.timeseries.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Count ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'count',
      fn: async () => {
        const res = await engine.count({
          projectId, from: tr.from, to: tr.to,
        });
        return { recordCount: res.count };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Count with filter ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'count',
      variant: 'filtered',
      fn: async () => {
        const res = await engine.count({
          projectId, from: tr.from, to: tr.to,
          service: 'api-gateway', level: 'error',
        });
        return { recordCount: res.count };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Count estimate ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'countEstimate',
      fn: async () => {
        const res = await engine.countEstimate({
          projectId, from: tr.from, to: tr.to,
        });
        return { recordCount: res.count };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Distinct ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'distinct',
      variant: 'service',
      fn: async () => {
        const res = await engine.distinct({
          field: 'service', projectId, from: tr.from, to: tr.to,
        });
        return { recordCount: res.values.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Top values ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'topValues',
      variant: 'service top 10',
      fn: async () => {
        const res = await engine.topValues({
          field: 'service', projectId, from: tr.from, to: tr.to, limit: 10,
        });
        return { recordCount: res.values.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Concurrent queries ---
  for (const concurrency of config.concurrencyLevels) {
    const r = await runBenchmark({
      ...base,
      operation: 'concurrent queries',
      variant: `${concurrency} parallel`,
      fn: async () => {
        await runConcurrent(concurrency, async () => {
          await engine.query({
            projectId, from: tr.from, to: tr.to,
            service: 'api-gateway', limit: 50,
          });
        });
        return { recordCount: concurrency };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  return results;
}
