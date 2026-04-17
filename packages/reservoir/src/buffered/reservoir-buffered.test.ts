import { describe, it, expect, vi } from 'vitest';
import { ReservoirBuffered } from './reservoir-buffered.js';
import { InMemoryTransport } from './transports/in-memory.js';
import { DEFAULT_BREAKER, DEFAULT_FLUSH, DEFAULT_RETRY } from './types.js';
import type { Reservoir } from '../client.js';

function mockReservoir(): Reservoir {
  const r = {
    ingest: vi.fn().mockResolvedValue({ inserted: 0 }),
    ingestReturning: vi.fn().mockResolvedValue({ inserted: 0, records: [] }),
    ingestSpans: vi.fn().mockResolvedValue({ inserted: 0 }),
    ingestMetrics: vi.fn().mockResolvedValue({ inserted: 0 }),
    query: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    count: vi.fn().mockResolvedValue({ count: 0 }),
    aggregate: vi.fn().mockResolvedValue({ buckets: [] }),
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
    ['engine' as unknown as string]: {
      ingest: vi.fn().mockResolvedValue({ inserted: 0 }),
      ingestSpans: vi.fn().mockResolvedValue({ inserted: 0 }),
      ingestMetrics: vi.fn().mockResolvedValue({ inserted: 0 }),
    },
  };
  return r as unknown as Reservoir;
}

describe('ReservoirBuffered', () => {
  it('enqueues ingest writes, returns quickly', async () => {
    const reservoir = mockReservoir();
    const transport = new InMemoryTransport({ shards: 2 });
    const buffered = new ReservoirBuffered(reservoir, {
      transport,
      flush: DEFAULT_FLUSH,
      circuitBreaker: DEFAULT_BREAKER,
      retry: DEFAULT_RETRY,
    });
    await buffered.start();

    const started = Date.now();
    const res = await buffered.ingest([{ message: 'x', level: 'info', projectId: 'p1' } as never]);
    const elapsed = Date.now() - started;

    expect(res.inserted).toBe(1);
    expect(elapsed).toBeLessThan(50);
    await buffered.stop();
  });

  it('passes reads straight through to underlying reservoir', async () => {
    const reservoir = mockReservoir();
    const transport = new InMemoryTransport({ shards: 1 });
    const buffered = new ReservoirBuffered(reservoir, {
      transport,
      flush: DEFAULT_FLUSH,
      circuitBreaker: DEFAULT_BREAKER,
      retry: DEFAULT_RETRY,
    });
    await buffered.start();

    await buffered.query({ projectId: 'p1', limit: 10 } as never);
    expect(reservoir.query).toHaveBeenCalledTimes(1);

    await buffered.stop();
  });

  it('ingestReturning always bypasses the buffer (sync)', async () => {
    const reservoir = mockReservoir();
    const transport = new InMemoryTransport({ shards: 1 });
    const buffered = new ReservoirBuffered(reservoir, {
      transport,
      flush: DEFAULT_FLUSH,
      circuitBreaker: DEFAULT_BREAKER,
      retry: DEFAULT_RETRY,
    });
    await buffered.start();

    await buffered.ingestReturning([{ message: 'x', level: 'info', projectId: 'p1' } as never]);
    expect(reservoir.ingestReturning).toHaveBeenCalledTimes(1);

    await buffered.stop();
  });

  it('falls back to sync when circuit breaker is open', async () => {
    const reservoir = mockReservoir();
    const transport = new InMemoryTransport({ shards: 1 });
    const buffered = new ReservoirBuffered(reservoir, {
      transport,
      flush: DEFAULT_FLUSH,
      circuitBreaker: { ...DEFAULT_BREAKER, pendingThreshold: 0 },
      retry: DEFAULT_RETRY,
    });
    await buffered.start();

    await buffered.ingest([{ message: 'x', level: 'info', projectId: 'p1' } as never]);
    await buffered.ingest([{ message: 'y', level: 'info', projectId: 'p1' } as never]);
    expect(reservoir.ingest).toHaveBeenCalled();

    await buffered.stop();
  });
});
