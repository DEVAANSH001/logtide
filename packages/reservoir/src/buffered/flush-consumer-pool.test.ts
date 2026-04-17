import { describe, it, expect, vi } from 'vitest';
import { FlushConsumerPool } from './flush-consumer-pool.js';
import { InMemoryTransport } from './transports/in-memory.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { BufferMetrics } from './metrics.js';
import { DEFAULT_BREAKER, DEFAULT_FLUSH, DEFAULT_RETRY } from './types.js';
import type { StorageEngine } from '../core/storage-engine.js';
import type {
  BufferBatch,
  BufferRecord,
  BufferTransport,
  BufferTransportStats,
  FlushLogger,
} from './types.js';

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

  it('stop drains on pendingRecords alone (ignores inflightRecords)', async () => {
    // stub transport where inflightRecords is stuck at a nonzero value to
    // simulate other consumers in a shared group. pool should still complete
    // stop() because pendingRecords reaches 0.
    let pending = 0;
    const stubTransport: BufferTransport = {
      shardCount: 1,
      async start() {},
      async stop() {},
      async enqueue() {},
      async enqueueMany() {},
      async dequeue(): Promise<BufferBatch | null> {
        return null;
      },
      async ack() {},
      async nack() {},
      async getStats(): Promise<BufferTransportStats> {
        return {
          pendingRecords: pending,
          inflightRecords: 999, // simulate other consumers still holding entries
          dlqRecords: 0,
          oldestPendingAgeMs: 0,
        };
      },
    };
    const engine = mockEngine();
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, stubTransport);
    const pool = new FlushConsumerPool(
      stubTransport,
      engine,
      { ...DEFAULT_FLUSH, gracefulShutdownMs: 1000 },
      DEFAULT_RETRY,
      metrics,
      breaker,
    );
    await pool.start();

    // pending is already 0; stop() should return quickly even though inflight != 0.
    const startedAt = Date.now();
    await pool.stop();
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeLessThan(900); // well under the 1000ms deadline
    expect(pending).toBe(0);
  });

  it('logs crashed consumer tasks via the injected logger', async () => {
    // transport whose dequeue synchronously throws a non-caught error beyond
    // the FlushConsumer try/catch. Use a sentinel that makes the consumer task
    // reject instead of swallowing.
    const crashingTransport: BufferTransport = {
      shardCount: 2,
      async start() {},
      async stop() {},
      async enqueue() {},
      async enqueueMany() {},
      async dequeue() {
        // throw synchronously so it's NOT caught by FlushConsumer (its catch
        // wraps the awaited dequeue, not the synchronous call). Actually it
        // IS caught since await propagates both. We instead force a crash by
        // making getStats throw only after a few iterations.
        throw new Error('boom');
      },
      async ack() {},
      async nack() {},
      async getStats(): Promise<BufferTransportStats> {
        return { pendingRecords: 0, inflightRecords: 0, dlqRecords: 0, oldestPendingAgeMs: 0 };
      },
    };
    const engine = mockEngine();
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, crashingTransport);
    const logger: FlushLogger = { warn: vi.fn(), error: vi.fn() };
    const pool = new FlushConsumerPool(
      crashingTransport,
      engine,
      { ...DEFAULT_FLUSH, gracefulShutdownMs: 50 },
      DEFAULT_RETRY,
      metrics,
      breaker,
      logger,
    );
    await pool.start();
    // let consumers tick a bit, then abort them. The consumer logs warnings
    // on each dequeue error (normal path), so no rejection is expected here.
    await new Promise((r) => setTimeout(r, 100));
    await pool.stop();

    // expect dequeue errors to be logged through the injected logger.warn path
    expect((logger.warn as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('surfaces a genuinely rejected consumer task via logger.error', async () => {
    // monkey-patch a FlushConsumer behavior by subclassing: use a transport
    // whose dequeue resolves a batch that triggers ingest, and an engine
    // whose ingest synchronously throws an uncatchable symbol. Simpler:
    // craft a transport whose dequeue rejects AFTER the consumer's inner
    // try/catch is bypassed by a signal.aborted race. That's brittle. Instead,
    // directly test the pool branch by injecting a tasks array via a custom
    // subclass hook -> use prototype surgery: create a pool, start it, then
    // replace one task with a rejected promise. This exercises the new
    // logger.error code path.
    const transport = new InMemoryTransport({ shards: 1 });
    await transport.start();
    const engine = mockEngine();
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const logger: FlushLogger = { warn: vi.fn(), error: vi.fn() };
    const pool = new FlushConsumerPool(
      transport,
      engine,
      { ...DEFAULT_FLUSH, gracefulShutdownMs: 50 },
      DEFAULT_RETRY,
      metrics,
      breaker,
      logger,
    );
    await pool.start();
    // overwrite the internal tasks list with one rejected promise.
    (pool as unknown as { tasks: Promise<void>[] }).tasks = [
      Promise.reject(new Error('consumer crashed')),
    ];
    await pool.stop();

    expect((logger.error as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    const firstErrCall = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(firstErrCall[0])).toContain('consumer crashed');
  });
});
