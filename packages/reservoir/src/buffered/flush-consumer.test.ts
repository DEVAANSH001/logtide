import { describe, it, expect, vi } from 'vitest';
import { FlushConsumer } from './flush-consumer.js';
import { InMemoryTransport } from './transports/in-memory.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { BufferMetrics } from './metrics.js';
import type { StorageEngine } from '../core/storage-engine.js';
import type { BufferRecord, FlushLogger } from './types.js';
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

  it('on partial failure records success for the landed kind and failure for the broken one', async () => {
    const transport = new InMemoryTransport({ shards: 1, inflightTimeoutMs: 50 });
    await transport.start();
    const engine = mockEngine();
    (engine.ingestSpans as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('spans down'));
    const metrics = new BufferMetrics();
    const successSpy = vi.spyOn(metrics, 'observeFlushSuccess');
    const failureSpy = vi.spyOn(metrics, 'observeFlushFailure');
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const retry = { ...DEFAULT_RETRY, maxAttempts: 1, baseDelayMs: 5 };
    const consumer = new FlushConsumer(0, transport, engine, DEFAULT_FLUSH, retry, metrics, breaker);

    await transport.enqueueMany([record('log'), record('span')]);

    const ac = new AbortController();
    const run = consumer.run(ac.signal);
    await new Promise((r) => setTimeout(r, 400));
    ac.abort();
    await run;

    expect(engine.ingest).toHaveBeenCalled();
    expect(engine.ingestSpans).toHaveBeenCalled();
    expect(successSpy).toHaveBeenCalledWith('log', 0, 1, expect.any(Number));
    expect(failureSpy).toHaveBeenCalledWith('span', 0, expect.any(Error));
    expect(successSpy).not.toHaveBeenCalledWith('span', expect.anything(), expect.anything(), expect.anything());
  });

  it('DLQs only the failed kinds on retry exhaustion', async () => {
    const transport = new InMemoryTransport({ shards: 1, inflightTimeoutMs: 50 });
    await transport.start();
    const engine = mockEngine();
    (engine.ingestSpans as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('spans down'));
    const metrics = new BufferMetrics();
    const dlqSpy = vi.spyOn(metrics, 'recordDlq');
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const retry = { ...DEFAULT_RETRY, maxAttempts: 1, baseDelayMs: 5 };
    const consumer = new FlushConsumer(0, transport, engine, DEFAULT_FLUSH, retry, metrics, breaker);

    await transport.enqueueMany([record('log'), record('span')]);

    const ac = new AbortController();
    const run = consumer.run(ac.signal);
    await new Promise((r) => setTimeout(r, 400));
    ac.abort();
    await run;

    const spanDlqs = dlqSpy.mock.calls.filter((c) => c[0] === 'span');
    const logDlqs = dlqSpy.mock.calls.filter((c) => c[0] === 'log');
    expect(spanDlqs.length).toBeGreaterThan(0);
    expect(logDlqs.length).toBe(0);
  });

  it('uses injected logger for dequeue errors', async () => {
    const transport = new InMemoryTransport({ shards: 1 });
    await transport.start();
    const brokenTransport = new Proxy(transport, {
      get(target, prop, receiver) {
        if (prop === 'dequeue') {
          return () => Promise.reject(new Error('dequeue boom'));
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const engine = mockEngine();
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const logger: FlushLogger = {
      warn: vi.fn(),
      error: vi.fn(),
    };
    const consumer = new FlushConsumer(
      0,
      brokenTransport,
      engine,
      DEFAULT_FLUSH,
      DEFAULT_RETRY,
      metrics,
      breaker,
      logger,
    );

    const ac = new AbortController();
    const run = consumer.run(ac.signal);
    await new Promise((r) => setTimeout(r, 200));
    ac.abort();
    await run;

    expect(logger.warn).toHaveBeenCalled();
    const firstCall = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(firstCall[0])).toContain('dequeue error');
  });

  it('falls back to console.warn when no logger is injected', async () => {
    const transport = new InMemoryTransport({ shards: 1 });
    await transport.start();
    const brokenTransport = new Proxy(transport, {
      get(target, prop, receiver) {
        if (prop === 'dequeue') {
          return () => Promise.reject(new Error('dequeue boom'));
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const engine = mockEngine();
    const metrics = new BufferMetrics();
    const breaker = new CircuitBreaker(DEFAULT_BREAKER, transport);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consumer = new FlushConsumer(
      0,
      brokenTransport,
      engine,
      DEFAULT_FLUSH,
      DEFAULT_RETRY,
      metrics,
      breaker,
    );

    const ac = new AbortController();
    const run = consumer.run(ac.signal);
    await new Promise((r) => setTimeout(r, 150));
    ac.abort();
    await run;

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
