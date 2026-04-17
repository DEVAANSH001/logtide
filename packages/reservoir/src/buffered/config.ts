import {
  DEFAULT_BREAKER,
  DEFAULT_FLUSH,
  DEFAULT_RETRY,
  type CircuitBreakerConfig,
  type FlushConfig,
  type RetryConfig,
} from './types.js';

export type TransportKind = 'redis' | 'memory' | 'passthrough';

type Env = Record<string, string | undefined>;

function num(env: Env, key: string, def: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`${key} must be a number, got ${raw}`);
  return v;
}

export function loadBufferFlushConfig(env: Env): FlushConfig {
  return {
    maxBatchSize: num(env, 'RESERVOIR_BUFFER_MAX_BATCH_SIZE', DEFAULT_FLUSH.maxBatchSize),
    maxBatchAgeMs: num(env, 'RESERVOIR_BUFFER_MAX_BATCH_AGE_MS', DEFAULT_FLUSH.maxBatchAgeMs),
    gracefulShutdownMs: num(env, 'RESERVOIR_BUFFER_SHUTDOWN_TIMEOUT_MS', DEFAULT_FLUSH.gracefulShutdownMs),
  };
}

export function loadBreakerConfig(env: Env): CircuitBreakerConfig {
  return {
    pendingThreshold: num(env, 'RESERVOIR_BUFFER_PENDING_THRESHOLD', DEFAULT_BREAKER.pendingThreshold),
    errorRateThreshold: num(env, 'RESERVOIR_BUFFER_ERROR_RATE_THRESHOLD', DEFAULT_BREAKER.errorRateThreshold),
    cooldownMs: num(env, 'RESERVOIR_BUFFER_BREAKER_COOLDOWN_MS', DEFAULT_BREAKER.cooldownMs),
    windowMs: DEFAULT_BREAKER.windowMs,
  };
}

export function loadRetryConfig(env: Env): RetryConfig {
  return {
    maxAttempts: num(env, 'RESERVOIR_BUFFER_MAX_ATTEMPTS', DEFAULT_RETRY.maxAttempts),
    baseDelayMs: num(env, 'RESERVOIR_BUFFER_RETRY_BASE_MS', DEFAULT_RETRY.baseDelayMs),
    dlqStreamSuffix: env.RESERVOIR_BUFFER_DLQ_SUFFIX ?? DEFAULT_RETRY.dlqStreamSuffix,
  };
}

export function selectTransportKind(env: Env): TransportKind {
  const explicit = (env.RESERVOIR_BUFFER_TRANSPORT ?? '').toLowerCase();
  if (explicit === 'redis' || explicit === 'memory' || explicit === 'passthrough') {
    return explicit;
  }
  return env.REDIS_URL ? 'redis' : 'memory';
}

export function loadShardCount(env: Env): number {
  return num(env, 'RESERVOIR_BUFFER_SHARDS', 8);
}

export function loadStreamPrefix(env: Env): string {
  return env.RESERVOIR_BUFFER_STREAM_PREFIX ?? 'logtide:buffer';
}
