import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';
import type { BufferTransport, BufferTransportStats } from './types.js';

function mockTransport(stats: Partial<BufferTransportStats>): BufferTransport {
  return {
    shardCount: 1,
    start: async () => {},
    stop: async () => {},
    enqueue: async () => {},
    enqueueMany: async () => {},
    dequeue: async () => null,
    ack: async () => {},
    nack: async () => {},
    getStats: async () => ({
      pendingRecords: 0,
      inflightRecords: 0,
      dlqRecords: 0,
      oldestPendingAgeMs: 0,
      ...stats,
    }),
  };
}

describe('CircuitBreaker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts closed and does not bypass when healthy', async () => {
    const breaker = new CircuitBreaker(
      { pendingThreshold: 100, errorRateThreshold: 0.5, cooldownMs: 1000, windowMs: 1000 },
      mockTransport({ pendingRecords: 10 }),
    );
    expect(await breaker.shouldBypass()).toBe(false);
    expect(breaker.state()).toBe('closed');
  });

  it('trips open when pending exceeds threshold', async () => {
    const breaker = new CircuitBreaker(
      { pendingThreshold: 100, errorRateThreshold: 0.5, cooldownMs: 1000, windowMs: 1000 },
      mockTransport({ pendingRecords: 200 }),
    );
    expect(await breaker.shouldBypass()).toBe(true);
    expect(breaker.state()).toBe('open');
  });

  it('trips open on sustained error rate', async () => {
    const breaker = new CircuitBreaker(
      { pendingThreshold: 1000, errorRateThreshold: 0.5, cooldownMs: 1000, windowMs: 1000 },
      mockTransport({ pendingRecords: 0 }),
    );
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    for (let i = 0; i < 3; i++) breaker.recordSuccess();
    expect(breaker.state()).toBe('open');
  });

  it('moves to half-open after cooldown', async () => {
    vi.setSystemTime(0);
    const breaker = new CircuitBreaker(
      { pendingThreshold: 100, errorRateThreshold: 0.5, cooldownMs: 1000, windowMs: 1000 },
      mockTransport({ pendingRecords: 200 }),
    );
    expect(await breaker.shouldBypass()).toBe(true);
    vi.setSystemTime(500);
    expect(await breaker.shouldBypass()).toBe(true);
    vi.setSystemTime(1500);
    const transport = mockTransport({ pendingRecords: 10 });
    // replace transport stats for the half-open check
    breaker['transport'] = transport;
    expect(await breaker.shouldBypass()).toBe(false);
    expect(breaker.state()).toBe('half-open');
  });

  it('closes from half-open on success', () => {
    const breaker = new CircuitBreaker(
      { pendingThreshold: 100, errorRateThreshold: 0.5, cooldownMs: 1000, windowMs: 1000 },
      mockTransport({}),
    );
    breaker['state_'] = 'half-open';
    breaker.recordSuccess();
    expect(breaker.state()).toBe('closed');
  });
});
