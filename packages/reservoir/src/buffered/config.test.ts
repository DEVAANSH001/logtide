import { describe, it, expect, beforeEach } from 'vitest';
import { loadBufferFlushConfig, loadBreakerConfig, loadRetryConfig, selectTransportKind } from './config.js';

describe('loadBufferConfigFromEnv helpers', () => {
  const base = { ...process.env };
  beforeEach(() => { process.env = { ...base }; });

  it('applies defaults when env is empty', () => {
    const flush = loadBufferFlushConfig({});
    expect(flush.maxBatchSize).toBe(5000);
    expect(flush.maxBatchAgeMs).toBe(1000);
  });

  it('reads custom flush config from env', () => {
    const flush = loadBufferFlushConfig({
      RESERVOIR_BUFFER_MAX_BATCH_SIZE: '2500',
      RESERVOIR_BUFFER_MAX_BATCH_AGE_MS: '500',
      RESERVOIR_BUFFER_SHUTDOWN_TIMEOUT_MS: '5000',
    });
    expect(flush.maxBatchSize).toBe(2500);
    expect(flush.maxBatchAgeMs).toBe(500);
    expect(flush.gracefulShutdownMs).toBe(5000);
  });

  it('selects redis transport when REDIS_URL is set', () => {
    expect(selectTransportKind({ REDIS_URL: 'redis://localhost:6379' })).toBe('redis');
  });

  it('selects memory transport when REDIS_URL missing', () => {
    expect(selectTransportKind({})).toBe('memory');
  });

  it('respects explicit RESERVOIR_BUFFER_TRANSPORT override', () => {
    expect(selectTransportKind({ REDIS_URL: 'redis://x', RESERVOIR_BUFFER_TRANSPORT: 'memory' })).toBe('memory');
    expect(selectTransportKind({ RESERVOIR_BUFFER_TRANSPORT: 'passthrough' })).toBe('passthrough');
  });
});
