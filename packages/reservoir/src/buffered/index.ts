export type {
  BufferRecord,
  BufferRecordKind,
  BufferBatch,
  BufferTransport,
  BufferTransportStats,
  BufferedConfig,
  FlushConfig,
  CircuitBreakerConfig,
  RetryConfig,
  FlushLogger,
} from './types.js';

export { DEFAULT_FLUSH, DEFAULT_BREAKER, DEFAULT_RETRY, defaultFlushLogger } from './types.js';

export { shardOf } from './sharding.js';
export { RollingWindow } from './rolling-window.js';
export { CircuitBreaker, type BreakerState } from './circuit-breaker.js';
export { BufferMetrics } from './metrics.js';
export { FlushConsumer } from './flush-consumer.js';
export { FlushConsumerPool } from './flush-consumer-pool.js';
export { ReservoirBuffered } from './reservoir-buffered.js';

export { InMemoryTransport, type InMemoryTransportOptions } from './transports/in-memory.js';
export { PassthroughTransport, type PassthroughFlushFn } from './transports/passthrough.js';
export { RedisStreamTransport, type RedisStreamTransportOptions } from './transports/redis-stream.js';

export {
  loadBufferFlushConfig,
  loadBreakerConfig,
  loadRetryConfig,
  selectTransportKind,
  loadShardCount,
  loadStreamPrefix,
  type TransportKind,
} from './config.js';
