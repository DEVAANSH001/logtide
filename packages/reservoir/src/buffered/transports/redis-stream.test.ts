import { describe, it, expect } from 'vitest';
import Redis from 'ioredis';
import { RedisStreamTransport } from './redis-stream.js';
import { runTransportContract } from './contract-test.js';

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
