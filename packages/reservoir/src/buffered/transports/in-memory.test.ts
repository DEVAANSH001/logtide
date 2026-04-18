import { describe, it, expect } from 'vitest';
import { runTransportContract } from './contract-test.js';
import { InMemoryTransport } from './in-memory.js';
import type { BufferRecord } from '../types.js';
import { shardOf } from '../sharding.js';

runTransportContract(
  'InMemoryTransport',
  async () => new InMemoryTransport({ shards: 4, inflightTimeoutMs: 50 }),
  async (t) => {
    await t.stop();
  },
);

function makeRecord(projectId: string): BufferRecord {
  return {
    kind: 'log',
    projectId,
    payload: { message: 'hi', level: 'info' } as unknown as BufferRecord['payload'],
    enqueuedAt: Date.now(),
  };
}

describe('InMemoryTransport signal wakeup', () => {
  it('dequeue wakes up quickly when enqueue lands a record on the same shard', async () => {
    const shardCount = 4;
    const t = new InMemoryTransport({ shards: shardCount, inflightTimeoutMs: 5000 });
    await t.start();

    const projectId = 'p-wake';
    const shardId = shardOf(projectId, shardCount);

    // start dequeue BEFORE enqueue, with a long maxWait
    const start = Date.now();
    const dequeuePromise = t.dequeue(shardId, 10, 1000);

    // yield a tick, then enqueue
    await new Promise((r) => setImmediate(r));
    await t.enqueue(makeRecord(projectId));

    const batch = await dequeuePromise;
    const elapsed = Date.now() - start;

    expect(batch).not.toBeNull();
    expect(batch!.records.length).toBe(1);
    // old polling code would sleep for ~50ms; signal-based must be much faster
    expect(elapsed).toBeLessThan(100);
    await t.ack(batch!);
    await t.stop();
  });

  it('stop() unblocks in-flight dequeue waiters promptly', async () => {
    const t = new InMemoryTransport({ shards: 4, inflightTimeoutMs: 5000 });
    await t.start();

    const start = Date.now();
    const dequeuePromise = t.dequeue(0, 10, 1000);
    // give the dequeue a chance to register its waiter
    await new Promise((r) => setImmediate(r));
    await t.stop();

    const batch = await dequeuePromise;
    const elapsed = Date.now() - start;

    expect(batch).toBeNull();
    expect(elapsed).toBeLessThan(100);
  });

  it('waiter list does not leak when a dequeue times out normally', async () => {
    const t = new InMemoryTransport({ shards: 4, inflightTimeoutMs: 5000 });
    await t.start();

    const batch = await t.dequeue(0, 10, 20);
    expect(batch).toBeNull();

    // after timeout, shard waiters array must be empty so we don't leak memory
    const internal = t as unknown as { shards_: Array<{ waiters: Array<() => void> }> };
    expect(internal.shards_[0].waiters.length).toBe(0);

    await t.stop();
  });
});

describe('InMemoryTransport enqueueMany', () => {
  it('wakes the correct number of waiters and distributes to shards', async () => {
    const shardCount = 8;
    const t = new InMemoryTransport({ shards: shardCount, inflightTimeoutMs: 5000 });
    await t.start();

    const records: BufferRecord[] = [];
    for (let i = 0; i < 1000; i++) {
      records.push(makeRecord(`p-${i}`));
    }

    const start = Date.now();
    await t.enqueueMany(records);
    const elapsed = Date.now() - start;

    const stats = await t.getStats();
    expect(stats.pendingRecords).toBe(1000);
    expect(stats.inflightRecords).toBe(0);
    expect(elapsed).toBeLessThan(50);

    await t.stop();
  });
});

describe('InMemoryTransport reclaimExpired', () => {
  it('resets inflightSince when reclaiming an expired entry', async () => {
    const shardCount = 4;
    const t = new InMemoryTransport({ shards: shardCount, inflightTimeoutMs: 20 });
    await t.start();

    const projectId = 'p-reclaim';
    const shardId = shardOf(projectId, shardCount);

    await t.enqueue(makeRecord(projectId));

    const first = await t.dequeue(shardId, 10, 100);
    expect(first).not.toBeNull();
    // do NOT ack, leave it inflight

    // wait longer than the inflight timeout
    await new Promise((r) => setTimeout(r, 50));

    // re-dequeue should reclaim and redeliver
    const second = await t.dequeue(shardId, 10, 100);
    expect(second).not.toBeNull();
    expect(second!.attempt).toBeGreaterThanOrEqual(2);

    // verify internal state: after being re-claimed, inflightSince should be
    // freshly set (non-zero, close to now), not the original stale value
    const internal = t as unknown as {
      shards_: Array<{ entries: Array<{ inflight: boolean; inflightSince: number }> }>;
    };
    const entry = internal.shards_[shardId].entries[0];
    expect(entry.inflight).toBe(true);
    expect(Math.abs(Date.now() - entry.inflightSince)).toBeLessThan(100);

    await t.ack(second!);
    await t.stop();
  });
});
