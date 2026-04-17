import Redis from 'ioredis';
import {
  Reservoir,
  ReservoirBuffered,
  RedisStreamTransport,
  InMemoryTransport,
  PassthroughTransport,
  loadBufferFlushConfig,
  loadBreakerConfig,
  loadRetryConfig,
  selectTransportKind,
  loadShardCount,
  loadStreamPrefix,
  type BufferTransport,
  type IReservoir,
} from '@logtide/reservoir';
import { pool } from './connection.js';
import { STORAGE_ENGINE, getClickHouseConfig, getMongoDBConfig } from './storage-config.js';

function createBaseReservoir(): Reservoir {
  if (STORAGE_ENGINE === 'clickhouse') {
    return new Reservoir('clickhouse', getClickHouseConfig(), {
      tableName: 'logs',
      skipInitialize: false,
    });
  }
  if (STORAGE_ENGINE === 'mongodb') {
    return new Reservoir('mongodb', getMongoDBConfig(), {
      tableName: 'logs',
      skipInitialize: false,
    });
  }
  return new Reservoir(
    'timescale',
    { host: '', port: 0, database: '', username: '', password: '' },
    { pool, tableName: 'logs', skipInitialize: true, projectIdType: 'uuid' },
  );
}

function createBufferTransport(baseReservoir: Reservoir): BufferTransport {
  const kind = selectTransportKind(process.env);
  const shards = loadShardCount(process.env);

  if (kind === 'redis') {
    if (!process.env.REDIS_URL) {
      console.warn('[Reservoir] RESERVOIR_BUFFER_TRANSPORT=redis but REDIS_URL missing, falling back to memory');
      return new InMemoryTransport({ shards });
    }
    const redis = new Redis(process.env.REDIS_URL);
    return new RedisStreamTransport({
      redis,
      streamPrefix: loadStreamPrefix(process.env),
      shards,
      consumerGroup: 'logtide-flush',
      consumerName: `backend-${process.pid}`,
    });
  }

  if (kind === 'passthrough') {
    return new PassthroughTransport(async (records) => {
      const logs = records.filter((r) => r.kind === 'log').map((r) => r.payload as never);
      const spans = records.filter((r) => r.kind === 'span').map((r) => r.payload as never);
      const metrics = records.filter((r) => r.kind === 'metric').map((r) => r.payload as never);
      if (logs.length > 0) await baseReservoir.ingest(logs);
      if (spans.length > 0) await baseReservoir.ingestSpans(spans);
      if (metrics.length > 0) await baseReservoir.ingestMetrics(metrics);
    });
  }

  console.warn('[Reservoir] Using in-memory buffer transport (single-instance only, not crash-safe)');
  return new InMemoryTransport({ shards });
}

const baseReservoir = createBaseReservoir();

const bufferEnabled = process.env.RESERVOIR_BUFFER_ENABLED === 'true';

export const reservoir: IReservoir = bufferEnabled
  ? new ReservoirBuffered(baseReservoir, {
      transport: createBufferTransport(baseReservoir),
      flush: loadBufferFlushConfig(process.env),
      circuitBreaker: loadBreakerConfig(process.env),
      retry: loadRetryConfig(process.env),
    })
  : baseReservoir;

// Initialize (and start buffered consumer pool if applicable)
export const reservoirReady = (async () => {
  try {
    await reservoir.initialize();
    if (bufferEnabled) await (reservoir as ReservoirBuffered).start();
    console.log(`[Reservoir] Ready (buffer=${bufferEnabled ? 'enabled' : 'disabled'})`);
  } catch (err) {
    console.error('[Reservoir] Failed to initialize:', err);
  }
})();

export async function shutdownReservoir(): Promise<void> {
  if (bufferEnabled) {
    await (reservoir as ReservoirBuffered).stop();
  }
}
