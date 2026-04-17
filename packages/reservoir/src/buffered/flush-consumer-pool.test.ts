import { describe, it, expect, vi } from 'vitest';
import { FlushConsumerPool } from './flush-consumer-pool.js';
import { InMemoryTransport } from './transports/in-memory.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { BufferMetrics } from './metrics.js';
import { DEFAULT_BREAKER, DEFAULT_FLUSH, DEFAULT_RETRY } from './types.js';
import type { StorageEngine } from '../core/storage-engine.js';
import type { BufferRecord } from './types.js';

function mockEngine(): StorageEngine {
  return {
    ingest: vi.fn().mockResolvedValue({ inserted: 0 }),
    ingestSpans: vi.fn().mockResolvedValue({ inserted: 0 }),
    ingestMetrics: vi.fn().mockResolvedValue({ inserted: 0 }),
  } as unknown as StorageEngine;
}

describe('FlushConsumerPool', () => {
  it('spawns one consumer per shard', async () => {
    const transport = new InMemoryTransport({ shards: 4 });
    await transport.start();
    const engine = mockEngine();
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const pool = new FlushConsumerPool(transport, engine, DEFAULT_FLUSH, DEFAULT_RETRY, metrics, breaker);

    await pool.start();

    const records: BufferRecord[] = [];
    for (let i = 0; i < 40; i++) {
      records.push({
        kind: 'log',
        projectId: `p-${i}`,
        payload: { message: 'x' } as unknown as BufferRecord['payload'],
        enqueuedAt: Date.now(),
      });
    }
    await transport.enqueueMany(records);
    await new Promise((r) => setTimeout(r, 400));

    const stats = await transport.getStats();
    expect(stats.pendingRecords).toBe(0);

    await pool.stop();
  });

  it('drains buffer on stop (graceful)', async () => {
    const transport = new InMemoryTransport({ shards: 2 });
    await transport.start();
    const engine = mockEngine();
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const pool = new FlushConsumerPool(
      transport,
      engine,
      { ...DEFAULT_FLUSH, gracefulShutdownMs: 2000 },
      DEFAULT_RETRY,
      metrics,
      breaker,
    );

    await pool.start();
    for (let i = 0; i < 10; i++) {
      await transport.enqueue({
        kind: 'log',
        projectId: `p${i}`,
        payload: { message: 'x' } as unknown as BufferRecord['payload'],
        enqueuedAt: Date.now(),
      });
    }
    await pool.stop();

    const stats = await transport.getStats();
    expect(stats.pendingRecords).toBe(0);
  });

  it('throws if started twice', async () => {
    const transport = new InMemoryTransport({ shards: 1 });
    await transport.start();
    const engine = mockEngine();
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const pool = new FlushConsumerPool(transport, engine, DEFAULT_FLUSH, DEFAULT_RETRY, metrics, breaker);
    await pool.start();
    await expect(pool.start()).rejects.toThrow();
    await pool.stop();
  });
});
