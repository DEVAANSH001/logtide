import type { EngineType, StorageConfig, AggregationInterval } from '../src/index.js';

// ---------------------------------------------------------------------------
// Data volume tiers
// ---------------------------------------------------------------------------

export interface VolumeTier {
  name: string;
  logs: number;
  spans: number;
  metrics: number;
}

export const VOLUME_TIERS: Record<string, VolumeTier> = {
  '1k': { name: '1K', logs: 1_000, spans: 500, metrics: 500 },
  '10k': { name: '10K', logs: 10_000, spans: 5_000, metrics: 5_000 },
  '100k': { name: '100K', logs: 100_000, spans: 50_000, metrics: 50_000 },
  '1m': { name: '1M', logs: 1_000_000, spans: 500_000, metrics: 500_000 },
  '10m': { name: '10M', logs: 10_000_000, spans: 5_000_000, metrics: 5_000_000 },
  '50m': { name: '50M', logs: 50_000_000, spans: 25_000_000, metrics: 25_000_000 },
};

// ---------------------------------------------------------------------------
// Benchmark execution config
// ---------------------------------------------------------------------------

export interface BenchmarkConfig {
  /** Number of measured iterations per benchmark */
  iterations: number;
  /** Number of warmup iterations (discarded) */
  warmup: number;
  /** Batch sizes to test for ingestion */
  ingestBatchSizes: number[];
  /** Aggregation intervals to test */
  aggregationIntervals: AggregationInterval[];
  /** Concurrency levels for concurrent benchmarks */
  concurrencyLevels: number[];
  /** Project ID used across all benchmarks */
  projectId: string;
  /** Organization ID used across all benchmarks */
  organizationId: string;
}

export const DEFAULT_CONFIG: BenchmarkConfig = {
  iterations: 5,
  warmup: 1,
  ingestBatchSizes: [100, 1_000, 10_000],
  aggregationIntervals: ['1m', '1h', '1d'],
  concurrencyLevels: [5, 10, 50],
  projectId: 'bench-project-001',
  organizationId: 'bench-org-001',
};

// ---------------------------------------------------------------------------
// Engine connection configs
// ---------------------------------------------------------------------------

export const ENGINE_CONFIGS: Record<EngineType, StorageConfig> = {
  timescale: {
    host: process.env.TIMESCALE_HOST ?? 'localhost',
    port: Number(process.env.TIMESCALE_PORT ?? 5433),
    database: process.env.TIMESCALE_DB ?? 'bench',
    username: process.env.TIMESCALE_USER ?? 'bench',
    password: process.env.TIMESCALE_PASS ?? 'bench',
  },
  clickhouse: {
    host: process.env.CLICKHOUSE_HOST ?? 'localhost',
    port: Number(process.env.CLICKHOUSE_PORT ?? 8124),
    database: process.env.CLICKHOUSE_DB ?? 'bench',
    username: process.env.CLICKHOUSE_USER ?? 'default',
    password: process.env.CLICKHOUSE_PASS ?? 'bench',
  },
  mongodb: {
    host: process.env.MONGODB_HOST ?? 'localhost',
    port: Number(process.env.MONGODB_PORT ?? 27018),
    database: process.env.MONGODB_DB ?? 'bench',
    username: process.env.MONGODB_USER ?? 'bench',
    password: process.env.MONGODB_PASS ?? 'bench',
  },
};

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface MemorySnapshot {
  /** Node.js heap used (MB) */
  heapUsedMB: number;
  /** Node.js heap total (MB) */
  heapTotalMB: number;
  /** Node.js RSS (MB) */
  rssMB: number;
  /** External memory (MB) */
  externalMB: number;
}

export interface BenchmarkResult {
  operation: string;
  domain: 'logs' | 'spans' | 'metrics';
  engine: EngineType;
  volume: string;
  /** Extra detail (batch size, interval, etc.) */
  variant?: string;
  /** Individual iteration durations in ms */
  durations: number[];
  /** Computed stats */
  stats: LatencyStats;
  /** Operations per second (for ingestion: records/sec) */
  opsPerSec?: number;
  /** Number of records involved */
  recordCount?: number;
  /** Memory usage before benchmark */
  memoryBefore?: MemorySnapshot;
  /** Memory usage after benchmark */
  memoryAfter?: MemorySnapshot;
  /** Peak memory delta (MB) across iterations */
  memoryDeltaMB?: number;
  error?: string;
}

export interface LatencyStats {
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface BenchmarkReport {
  timestamp: string;
  config: BenchmarkConfig;
  volume: string;
  engines: EngineType[];
  results: BenchmarkResult[];
  systemInfo?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

export interface CLIArgs {
  volumes: string[];
  engines: EngineType[];
  suites: ('logs' | 'spans' | 'metrics')[];
  iterations: number;
  warmup: number;
  output?: string;
}

export function parseCLIArgs(args: string[]): CLIArgs {
  const parsed: CLIArgs = {
    volumes: Object.keys(VOLUME_TIERS),
    engines: ['timescale', 'clickhouse', 'mongodb'],
    suites: ['logs', 'spans', 'metrics'],
    iterations: DEFAULT_CONFIG.iterations,
    warmup: DEFAULT_CONFIG.warmup,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--volume':
      case '-v':
        if (next) {
          parsed.volumes = next.split(',').filter(v => v in VOLUME_TIERS);
          i++;
        }
        break;
      case '--engine':
      case '-e':
        if (next) {
          parsed.engines = next.split(',').filter(
            (e): e is EngineType => ['timescale', 'clickhouse', 'mongodb'].includes(e),
          );
          i++;
        }
        break;
      case '--suite':
      case '-s':
        if (next) {
          parsed.suites = next.split(',').filter(
            (s): s is 'logs' | 'spans' | 'metrics' => ['logs', 'spans', 'metrics'].includes(s),
          );
          i++;
        }
        break;
      case '--iterations':
      case '-i':
        if (next) { parsed.iterations = parseInt(next, 10); i++; }
        break;
      case '--warmup':
      case '-w':
        if (next) { parsed.warmup = parseInt(next, 10); i++; }
        break;
      case '--output':
      case '-o':
        if (next) { parsed.output = next; i++; }
        break;
    }
  }

  return parsed;
}
