import type { StorageEngine, SpanRecord, TraceRecord } from '../../src/index.js';
import type { BenchmarkResult, BenchmarkConfig } from '../config.js';
import type { EngineType } from '../../src/index.js';
import { generateTraceBundles, generateSpans } from '../data-generators.js';
import { runBenchmark, runConcurrent, logProgress } from '../runner.js';

function getTimeRange() {
  return {
    from: new Date(Date.now() - 86400000 * 7),
    to: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Seed spans into engine
// ---------------------------------------------------------------------------

export async function seedSpans(
  engine: StorageEngine,
  engineType: EngineType,
  count: number,
  projectId: string,
  organizationId: string,
): Promise<{ traceIds: string[] }> {
  const batchSize = 50_000;
  let seeded = 0;
  const traceIds: string[] = [];
  const tr = getTimeRange();

  while (seeded < count) {
    const size = Math.min(batchSize, count - seeded);
    const bundleCount = Math.ceil(size / 4);
    const bundles = generateTraceBundles(bundleCount, projectId, organizationId, tr);
    const spans = bundles.flatMap(b => b.spans).slice(0, size);

    await engine.ingestSpans(spans);

    // Track only trace IDs whose spans were actually ingested
    const ingestedTraceIds = new Set(spans.map(s => s.traceId));
    for (const bundle of bundles) {
      if (!ingestedTraceIds.has(bundle.trace.traceId)) continue;
      try {
        await engine.upsertTrace(bundle.trace);
        traceIds.push(bundle.trace.traceId);
      } catch {
        // some engines may fail on duplicates, that's ok
      }
    }

    seeded += spans.length;

    if (seeded % 50_000 === 0 || seeded >= count) {
      console.log(`    [${engineType}] seeded ${seeded.toLocaleString()}/${count.toLocaleString()} spans`);
    }
  }

  return { traceIds };
}

// ---------------------------------------------------------------------------
// Span benchmark suite
// ---------------------------------------------------------------------------

export async function runSpanBenchmarks(
  engine: StorageEngine,
  engineType: EngineType,
  volume: string,
  config: BenchmarkConfig,
  traceIds: string[],
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const { iterations, warmup, projectId, organizationId } = config;
  const base = { domain: 'spans' as const, engine: engineType, volume, iterations, warmup };
  const tr = getTimeRange();

  // Sample trace IDs for lookup benchmarks
  const sampleTraceIds = traceIds.slice(0, Math.min(100, traceIds.length));

  // --- Ingest spans (batch 1000) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'ingestSpans',
      variant: 'batch 1,000',
      fn: async () => {
        const batchData = generateSpans(1000, projectId, organizationId, tr);
        await engine.ingestSpans(batchData);
        return { recordCount: 1000 };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Ingest spans (batch 10,000) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'ingestSpans',
      variant: 'batch 10,000',
      fn: async () => {
        const batchData = generateSpans(10_000, projectId, organizationId, tr);
        await engine.ingestSpans(batchData);
        return { recordCount: 10_000 };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query spans (by service) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'querySpans',
      variant: 'by service',
      fn: async () => {
        const res = await engine.querySpans({
          projectId, from: tr.from, to: tr.to,
          serviceName: 'api-gateway', limit: 100,
        });
        return { recordCount: res.spans.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query spans (by service + status) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'querySpans',
      variant: 'service + error status',
      fn: async () => {
        const res = await engine.querySpans({
          projectId, from: tr.from, to: tr.to,
          serviceName: 'api-gateway', statusCode: 'ERROR', limit: 100,
        });
        return { recordCount: res.spans.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Get spans by trace ID ---
  if (sampleTraceIds.length > 0) {
    const r = await runBenchmark({
      ...base,
      operation: 'getSpansByTraceId',
      fn: async () => {
        const traceId = sampleTraceIds[Math.floor(Math.random() * sampleTraceIds.length)];
        const res = await engine.getSpansByTraceId(traceId, projectId);
        return { recordCount: res.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query traces ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'queryTraces',
      variant: 'all',
      fn: async () => {
        const res = await engine.queryTraces({
          projectId, from: tr.from, to: tr.to, limit: 100,
        });
        return { recordCount: res.traces.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query traces (errors only) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'queryTraces',
      variant: 'errors only',
      fn: async () => {
        const res = await engine.queryTraces({
          projectId, from: tr.from, to: tr.to,
          error: true, limit: 100,
        });
        return { recordCount: res.traces.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query traces (slow, >500ms) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'queryTraces',
      variant: 'slow (>500ms)',
      fn: async () => {
        const res = await engine.queryTraces({
          projectId, from: tr.from, to: tr.to,
          minDurationMs: 500, limit: 100,
        });
        return { recordCount: res.traces.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Get trace by ID ---
  if (sampleTraceIds.length > 0) {
    const r = await runBenchmark({
      ...base,
      operation: 'getTraceById',
      fn: async () => {
        const traceId = sampleTraceIds[Math.floor(Math.random() * sampleTraceIds.length)];
        const res = await engine.getTraceById(traceId, projectId);
        return { recordCount: res ? 1 : 0 };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Service dependencies ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'getServiceDependencies',
      fn: async () => {
        const res = await engine.getServiceDependencies(projectId, tr.from, tr.to);
        return { recordCount: res.edges.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Concurrent span queries ---
  for (const concurrency of config.concurrencyLevels) {
    const r = await runBenchmark({
      ...base,
      operation: 'concurrent span queries',
      variant: `${concurrency} parallel`,
      fn: async () => {
        await runConcurrent(concurrency, async () => {
          await engine.querySpans({
            projectId, from: tr.from, to: tr.to,
            serviceName: 'api-gateway', limit: 50,
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
