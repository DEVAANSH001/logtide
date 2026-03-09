import type { StorageEngine, MetricAggregationFn } from '../../src/index.js';
import type { BenchmarkResult, BenchmarkConfig } from '../config.js';
import type { EngineType } from '../../src/index.js';
import { generateMetrics } from '../data-generators.js';
import { runBenchmark, runConcurrent, logProgress } from '../runner.js';

function getTimeRange() {
  return {
    from: new Date(Date.now() - 86400000 * 7),
    to: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Seed metrics into engine
// ---------------------------------------------------------------------------

export async function seedMetrics(
  engine: StorageEngine,
  engineType: EngineType,
  count: number,
  projectId: string,
  organizationId: string,
): Promise<void> {
  const batchSize = 10_000;
  let seeded = 0;
  const tr = getTimeRange();

  while (seeded < count) {
    const size = Math.min(batchSize, count - seeded);
    const metrics = generateMetrics(size, projectId, organizationId, tr);
    await engine.ingestMetrics(metrics);
    seeded += size;

    if (seeded % 100_000 === 0 || seeded === count) {
      console.log(`    [${engineType}] seeded ${seeded.toLocaleString()}/${count.toLocaleString()} metrics`);
    }
  }
}

// ---------------------------------------------------------------------------
// Metric benchmark suite
// ---------------------------------------------------------------------------

export async function runMetricBenchmarks(
  engine: StorageEngine,
  engineType: EngineType,
  volume: string,
  config: BenchmarkConfig,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const { iterations, warmup, projectId, organizationId } = config;
  const base = { domain: 'metrics' as const, engine: engineType, volume, iterations, warmup };
  const tr = getTimeRange();

  // --- Ingest metrics (batch 1,000) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'ingestMetrics',
      variant: 'batch 1,000',
      fn: async () => {
        const batchData = generateMetrics(1000, projectId, organizationId, tr);
        await engine.ingestMetrics(batchData);
        return { recordCount: 1000 };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Ingest metrics (batch 10,000) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'ingestMetrics',
      variant: 'batch 10,000',
      fn: async () => {
        const batchData = generateMetrics(10_000, projectId, organizationId, tr);
        await engine.ingestMetrics(batchData);
        return { recordCount: 10_000 };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query metrics (by name) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'queryMetrics',
      variant: 'by name',
      fn: async () => {
        const res = await engine.queryMetrics({
          projectId, from: tr.from, to: tr.to,
          metricName: 'http_request_duration_seconds', limit: 100,
        });
        return { recordCount: res.metrics.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Query metrics (by name + service) ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'queryMetrics',
      variant: 'name + service',
      fn: async () => {
        const res = await engine.queryMetrics({
          projectId, from: tr.from, to: tr.to,
          metricName: 'http_request_duration_seconds',
          serviceName: 'api-gateway', limit: 100,
        });
        return { recordCount: res.metrics.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Aggregate metrics (avg, p50, p95, p99) ---
  const aggregations: MetricAggregationFn[] = ['avg', 'sum', 'min', 'max', 'p50', 'p95', 'p99'];
  for (const aggregation of aggregations) {
    const r = await runBenchmark({
      ...base,
      operation: 'aggregateMetrics',
      variant: `${aggregation} / 1h`,
      fn: async () => {
        const res = await engine.aggregateMetrics({
          projectId, from: tr.from, to: tr.to,
          metricName: 'http_request_duration_seconds',
          interval: '1h', aggregation,
        });
        return { recordCount: res.timeseries.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Aggregate with groupBy ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'aggregateMetrics',
      variant: 'avg / 1h / groupBy service',
      fn: async () => {
        const res = await engine.aggregateMetrics({
          projectId, from: tr.from, to: tr.to,
          metricName: 'http_request_duration_seconds',
          interval: '1h', aggregation: 'avg',
          groupBy: ['method'],
        });
        return { recordCount: res.timeseries.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Get metric names ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'getMetricNames',
      fn: async () => {
        const res = await engine.getMetricNames({ projectId });
        return { recordCount: res.names.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Get metric label keys ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'getMetricLabelKeys',
      fn: async () => {
        const res = await engine.getMetricLabelKeys({
          projectId, metricName: 'http_request_duration_seconds',
        });
        return { recordCount: res.keys?.length ?? 0 };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Get metric label values ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'getMetricLabelValues',
      variant: 'method',
      fn: async () => {
        const res = await engine.getMetricLabelValues({
          projectId, metricName: 'http_request_duration_seconds',
        }, 'method');
        return { recordCount: res.values?.length ?? 0 };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Metrics overview ---
  {
    const r = await runBenchmark({
      ...base,
      operation: 'getMetricsOverview',
      fn: async () => {
        const res = await engine.getMetricsOverview({
          projectId, from: tr.from, to: tr.to,
        });
        return { recordCount: res.services.length };
      },
    });
    logProgress(engineType, r.operation, r);
    results.push(r);
  }

  // --- Concurrent metric queries ---
  for (const concurrency of config.concurrencyLevels) {
    const r = await runBenchmark({
      ...base,
      operation: 'concurrent metric queries',
      variant: `${concurrency} parallel`,
      fn: async () => {
        await runConcurrent(concurrency, async () => {
          await engine.queryMetrics({
            projectId, from: tr.from, to: tr.to,
            metricName: 'http_request_duration_seconds', limit: 50,
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
