import { describe, it, expect, vi } from 'vitest';
import { FlushConsumer } from './flush-consumer.js';
import { InMemoryTransport } from './transports/in-memory.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { BufferMetrics } from './metrics.js';
import type { StorageEngine } from '../core/storage-engine.js';
import type { BufferRecord } from './types.js';
import { DEFAULT_BREAKER, DEFAULT_FLUSH, DEFAULT_RETRY } from './types.js';

function mockEngine(): StorageEngine {
  const e: Partial<StorageEngine> = {
    ingest: vi.fn().mockResolvedValue({ inserted: 0 }),
    ingestSpans: vi.fn().mockResolvedValue({ inserted: 0 }),
    ingestMetrics: vi.fn().mockResolvedValue({ inserted: 0 }),
  };
  return e as StorageEngine;
}

function record(kind: 'log' | 'span' | 'metric', projectId = 'p'): BufferRecord {
  return {
    kind,
    projectId,
    payload: { foo: 'bar' } as unknown as BufferRecord['payload'],
    enqueuedAt: Date.now(),
  };
}

describe('FlushConsumer', () => {
  it('calls engine.ingest on a log batch and acks on success', async () => {
    const transport = new InMemoryTransport({ shards: 1 });
    await transport.start();
    const engine = mockEngine();
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const consumer = new FlushConsumer(0, transport, engine, DEFAULT_FLUSH, DEFAULT_RETRY, metrics, breaker);

    await transport.enqueueMany([record('log'), record('log'), record('log')]);

    const ac = new AbortController();
    const run = consumer.run(ac.signal);
    await new Promise((r) => setTimeout(r, 200));
    ac.abort();
    await run;

    expect(engine.ingest).toHaveBeenCalledTimes(1);
    const stats = await transport.getStats();
    expect(stats.pendingRecords).toBe(0);
    expect(stats.inflightRecords).toBe(0);
  });

  it('groups mixed-kind batch into 3 engine calls', async () => {
    const transport = new InMemoryTransport({ shards: 1 });
    await transport.start();
    const engine = mockEngine();
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const consumer = new FlushConsumer(0, transport, engine, DEFAULT_FLUSH, DEFAULT_RETRY, metrics, breaker);

    await transport.enqueueMany([record('log'), record('span'), record('metric'), record('log')]);

    const ac = new AbortController();
    const run = consumer.run(ac.signal);
    await new Promise((r) => setTimeout(r, 200));
    ac.abort();
    await run;

    expect(engine.ingest).toHaveBeenCalledTimes(1);
    expect(engine.ingestSpans).toHaveBeenCalledTimes(1);
    expect(engine.ingestMetrics).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then DLQs after maxAttempts', async () => {
    const transport = new InMemoryTransport({ shards: 1, inflightTimeoutMs: 50 });
    await transport.start();
    const engine = mockEngine();
    (engine.ingest as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const retry = { ...DEFAULT_RETRY, maxAttempts: 3, baseDelayMs: 10 };
    const consumer = new FlushConsumer(0, transport, engine, DEFAULT_FLUSH, retry, metrics, breaker);

    await transport.enqueue(record('log'));

    const ac = new AbortController();
    const run = consumer.run(ac.signal);
    await new Promise((r) => setTimeout(r, 800));
    ac.abort();
    await run;

    const stats = await transport.getStats();
    expect(stats.dlqRecords).toBe(1);
    expect(stats.pendingRecords).toBe(0);
  });

  it('aborts cleanly when signal triggers', async () => {
    const transport = new InMemoryTransport({ shards: 1 });
    await transport.start();
    const engine = mockEngine();
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const consumer = new FlushConsumer(0, transport, engine, DEFAULT_FLUSH, DEFAULT_RETRY, metrics, breaker);

    const ac = new AbortController();
    const run = consumer.run(ac.signal);
    setTimeout(() => ac.abort(), 50);
    await expect(run).resolves.toBeUndefined();
  });
});
