import { describe, it, expect, vi } from 'vitest';
import Redis from 'ioredis';
import { hostname } from 'node:os';
import { RedisStreamTransport } from './redis-stream.js';
import { runTransportContract } from './contract-test.js';
import type { BufferBatch, BufferRecord } from '../types.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6380';
const runIntegration = process.env.SKIP_REDIS_TESTS !== '1';

(runIntegration ? describe : describe.skip)('RedisStreamTransport (integration)', () => {
  runTransportContract(
    'RedisStreamTransport',
    async () => {
      const redis = new Redis(REDIS_URL);
      const prefix = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const t = new RedisStreamTransport({
        redis,
        streamPrefix: prefix,
        shards: 4,
        consumerGroup: 'flush',
        consumerName: 'consumer-1',
        inflightTimeoutMs: 500,
      });
      return t;
    },
    async (t) => {
      await t.stop();
      // cleanup: drop test keys
      const redis = (t as unknown as { redis: Redis }).redis;
      const prefix = (t as unknown as { streamPrefix: string }).streamPrefix;
      const keys = await redis.keys(`${prefix}:*`);
      if (keys.length > 0) await redis.del(...keys);
      await redis.quit();
    },
  );

  it('persists across transport restarts via XPENDING', async () => {
    const redis = new Redis(REDIS_URL);
    const prefix = `restart-${Date.now()}`;
    const makeT = () =>
      new RedisStreamTransport({
        redis,
        streamPrefix: prefix,
        shards: 1,
        consumerGroup: 'flush',
        consumerName: 'c1',
        inflightTimeoutMs: 200,
      });

    const t1 = makeT();
    await t1.start();
    await t1.enqueue({
      kind: 'log',
      projectId: 'p1',
      payload: { message: 'x' } as unknown as import('../types.js').BufferRecord['payload'],
      enqueuedAt: Date.now(),
    });
    const batch = await t1.dequeue(0, 10, 100);
    expect(batch).not.toBeNull();
    await t1.stop();

    await new Promise((r) => setTimeout(r, 300));
    const t2 = makeT();
    await t2.start();
    const reclaim = await t2.dequeue(0, 10, 500);
    expect(reclaim).not.toBeNull();
    expect(reclaim!.attempt).toBeGreaterThanOrEqual(2);
    await t2.ack(reclaim!);
    await t2.stop();

    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });
});

describe('RedisStreamTransport (unit, mocked redis)', () => {
  function makeRecord(projectId = 'p1'): BufferRecord {
    return {
      kind: 'log',
      projectId,
      payload: { message: 'x' } as unknown as BufferRecord['payload'],
      enqueuedAt: Date.now(),
    };
  }

  it('default consumerName is hostname-pid-suffix when no override', () => {
    const redis = {} as unknown as Redis;
    const t = new RedisStreamTransport({ redis, streamPrefix: 'p', shards: 1 });
    const name = (t as unknown as { consumerName: string }).consumerName;
    // format: <hostname>-<pid>-<6hex>
    const pattern = new RegExp(`^${hostname()}-${process.pid}-[0-9a-f]{6}$`);
    expect(name).toMatch(pattern);
  });

  it('default consumerName differs across instances (random suffix)', () => {
    const redis = {} as unknown as Redis;
    const a = new RedisStreamTransport({ redis, streamPrefix: 'p', shards: 1 });
    const b = new RedisStreamTransport({ redis, streamPrefix: 'p', shards: 1 });
    expect((a as unknown as { consumerName: string }).consumerName).not.toBe(
      (b as unknown as { consumerName: string }).consumerName,
    );
  });

  it('explicit consumerName override is preserved', () => {
    const redis = {} as unknown as Redis;
    const t = new RedisStreamTransport({
      redis,
      streamPrefix: 'p',
      shards: 1,
      consumerName: 'backend-123',
    });
    expect((t as unknown as { consumerName: string }).consumerName).toBe('backend-123');
  });

  it('enqueueMany throws when a pipeline command returns an error', async () => {
    const pipelineExec = vi.fn().mockResolvedValue([
      [null, '1-0'],
      [new Error('OOM'), null],
    ]);
    const xadd = vi.fn().mockReturnThis();
    const pipelineStub = { xadd, exec: pipelineExec };
    const redis = {
      pipeline: () => pipelineStub,
    } as unknown as Redis;
    const t = new RedisStreamTransport({ redis, streamPrefix: 'p', shards: 2 });
    await expect(t.enqueueMany([makeRecord('a'), makeRecord('b')])).rejects.toThrow('OOM');
    expect(xadd).toHaveBeenCalledTimes(2);
  });

  it('enqueueMany succeeds when all pipeline commands succeed', async () => {
    const pipelineExec = vi.fn().mockResolvedValue([
      [null, '1-0'],
      [null, '1-1'],
    ]);
    const xadd = vi.fn().mockReturnThis();
    const pipelineStub = { xadd, exec: pipelineExec };
    const redis = {
      pipeline: () => pipelineStub,
    } as unknown as Redis;
    const t = new RedisStreamTransport({ redis, streamPrefix: 'p', shards: 2 });
    await expect(t.enqueueMany([makeRecord('a'), makeRecord('b')])).resolves.toBeUndefined();
  });

  it('nack uses MULTI and throws if exec returns null (aborted tx)', async () => {
    const multiExec = vi.fn().mockResolvedValue(null);
    const xadd = vi.fn().mockReturnThis();
    const xack = vi.fn().mockReturnThis();
    const multiStub = { xadd, xack, exec: multiExec };
    const multi = vi.fn(() => multiStub);
    const redis = { multi } as unknown as Redis;
    const t = new RedisStreamTransport({ redis, streamPrefix: 'p', shards: 1 });
    const batch: BufferBatch = {
      shardId: 0,
      ackToken: '1-0',
      attempt: 1,
      records: [makeRecord('a')],
    };
    await expect(t.nack(batch, 'fail', 3)).rejects.toThrow('nack transaction aborted');
    expect(multi).toHaveBeenCalled();
    expect(xadd).toHaveBeenCalledTimes(1);
    expect(xack).toHaveBeenCalledTimes(1);
  });

  it('nack throws when any MULTI command has an error', async () => {
    const multiExec = vi.fn().mockResolvedValue([
      [null, '2-0'],
      [new Error('NOGROUP'), null],
    ]);
    const xadd = vi.fn().mockReturnThis();
    const xack = vi.fn().mockReturnThis();
    const multiStub = { xadd, xack, exec: multiExec };
    const redis = { multi: () => multiStub } as unknown as Redis;
    const t = new RedisStreamTransport({ redis, streamPrefix: 'p', shards: 1 });
    const batch: BufferBatch = {
      shardId: 0,
      ackToken: '1-0',
      attempt: 1,
      records: [makeRecord('a')],
    };
    await expect(t.nack(batch, 'fail', 3)).rejects.toThrow('NOGROUP');
  });

  it('nack resolves when all MULTI commands succeed', async () => {
    const multiExec = vi.fn().mockResolvedValue([
      [null, '2-0'],
      [null, 1],
    ]);
    const xadd = vi.fn().mockReturnThis();
    const xack = vi.fn().mockReturnThis();
    const multiStub = { xadd, xack, exec: multiExec };
    const redis = { multi: () => multiStub } as unknown as Redis;
    const t = new RedisStreamTransport({ redis, streamPrefix: 'p', shards: 1 });
    const batch: BufferBatch = {
      shardId: 0,
      ackToken: '1-0',
      attempt: 1,
      records: [makeRecord('a')],
    };
    await expect(t.nack(batch, 'fail', 3)).resolves.toBeUndefined();
  });

  it('claimStale passes consumer name to XPENDING filter', async () => {
    const entries: Array<[string, string[]]> = [
      ['2-0', ['payload', JSON.stringify(makeRecord('a'))]],
    ];
    const xautoclaim = vi.fn().mockResolvedValue(['0-0', entries, []]);
    const xpending = vi.fn().mockResolvedValue([['2-0', 'c1', 100, 3]]);
    const redis = {
      xautoclaim,
      xpending,
      xreadgroup: vi.fn().mockResolvedValue(null),
    } as unknown as Redis;

    const t = new RedisStreamTransport({
      redis,
      streamPrefix: 'p',
      shards: 1,
      consumerName: 'c1',
      consumerGroup: 'flush',
    });
    const batch = await t.dequeue(0, 10, 50);
    expect(batch).not.toBeNull();
    expect(batch!.attempt).toBe(3);
    // assert xpending was called with the consumer name as the 6th argument
    expect(xpending).toHaveBeenCalledWith('p:0', 'flush', '-', '+', 1, 'c1');
  });

  it('getStats oldestPendingAgeMs tracks only not-yet-delivered entries', async () => {
    // Simulate: stream has 2 entries; first one is in PEL (delivered, not acked),
    // second one is NOT yet delivered. oldestPendingAgeMs should be based on
    // the SECOND entry's ID, not the first.
    const firstId = '1000-0'; // in PEL
    const secondId = '2000-0'; // not-yet-delivered, should be the basis of age

    const xlen = vi.fn().mockImplementation((key: string) => {
      if (key.endsWith(':dlq')) return Promise.resolve(0);
      return Promise.resolve(2);
    });
    // xpending(key, group) returns summary [count, first, last, consumers]
    const xpending = vi.fn().mockResolvedValue([1, firstId, firstId, [['c1', '1']]]);
    const xrangeCalls: Array<unknown[]> = [];
    const xrange = vi.fn().mockImplementation((...args: unknown[]) => {
      xrangeCalls.push(args);
      // exclusive start past PEL last -> return secondId
      return Promise.resolve([[secondId, ['payload', 'x']]]);
    });
    const redis = { xlen, xpending, xrange } as unknown as Redis;

    const t = new RedisStreamTransport({ redis, streamPrefix: 'p', shards: 1 });
    const now = Date.now();
    const stats = await t.getStats();

    // must have used the exclusive-start form "(firstId" (not '-')
    const rangeArgs = xrangeCalls[0];
    expect(rangeArgs[1]).toBe(`(${firstId}`);
    expect(rangeArgs[2]).toBe('+');

    // age should be roughly now - secondIdMs, not now - firstIdMs
    const expectedAge = now - 2000;
    // allow some slack due to `now` difference between test and implementation
    expect(stats.oldestPendingAgeMs).toBeGreaterThanOrEqual(expectedAge - 50);
    expect(stats.oldestPendingAgeMs).toBeLessThanOrEqual(expectedAge + 50);
    expect(stats.pendingRecords).toBe(1); // len 2 - inflight 1
    expect(stats.inflightRecords).toBe(1);
  });

  it('getStats oldestPendingAgeMs falls back to XRANGE - + when PEL is empty', async () => {
    const oldestId = '500-0';
    const xlen = vi.fn().mockImplementation((key: string) => {
      if (key.endsWith(':dlq')) return Promise.resolve(0);
      return Promise.resolve(1);
    });
    const xpending = vi.fn().mockResolvedValue([0, null, null, null]);
    const xrangeCalls: Array<unknown[]> = [];
    const xrange = vi.fn().mockImplementation((...args: unknown[]) => {
      xrangeCalls.push(args);
      return Promise.resolve([[oldestId, ['payload', 'x']]]);
    });
    const redis = { xlen, xpending, xrange } as unknown as Redis;

    const t = new RedisStreamTransport({ redis, streamPrefix: 'p', shards: 1 });
    await t.getStats();

    // must have used '-' start, not exclusive
    const rangeArgs = xrangeCalls[0];
    expect(rangeArgs[1]).toBe('-');
    expect(rangeArgs[2]).toBe('+');
  });

  it('getStats oldestPendingAgeMs is 0 when all entries are in PEL (nothing not-delivered)', async () => {
    const xlen = vi.fn().mockImplementation((key: string) => {
      if (key.endsWith(':dlq')) return Promise.resolve(0);
      return Promise.resolve(1);
    });
    const xpending = vi.fn().mockResolvedValue([1, '100-0', '100-0', [['c1', '1']]]);
    // XRANGE past PEL tail returns nothing
    const xrange = vi.fn().mockResolvedValue([]);
    const redis = { xlen, xpending, xrange } as unknown as Redis;

    const t = new RedisStreamTransport({ redis, streamPrefix: 'p', shards: 1 });
    const stats = await t.getStats();
    expect(stats.oldestPendingAgeMs).toBe(0);
  });
});
