import type Redis from 'ioredis';
import type {
  BufferRecord,
  BufferBatch,
  BufferTransport,
  BufferTransportStats,
} from '../types.js';
import { shardOf } from '../sharding.js';

export interface RedisStreamTransportOptions {
  redis: Redis;
  streamPrefix: string;
  shards?: number;
  consumerGroup?: string;
  consumerName?: string;
  maxStreamLength?: number;
  inflightTimeoutMs?: number;
  dlqStreamSuffix?: string;
}

export class RedisStreamTransport implements BufferTransport {
  readonly shardCount: number;
  private readonly streamPrefix: string;
  private readonly consumerGroup: string;
  private readonly consumerName: string;
  private readonly maxStreamLength: number;
  private readonly inflightTimeoutMs: number;
  private readonly dlqSuffix: string;
  private readonly redis: Redis;
  private started = false;

  constructor(opts: RedisStreamTransportOptions) {
    this.redis = opts.redis;
    this.streamPrefix = opts.streamPrefix;
    this.shardCount = opts.shards ?? 8;
    this.consumerGroup = opts.consumerGroup ?? 'flush';
    this.consumerName = opts.consumerName ?? `consumer-${process.pid}`;
    this.maxStreamLength = opts.maxStreamLength ?? 1_000_000;
    this.inflightTimeoutMs = opts.inflightTimeoutMs ?? 30_000;
    this.dlqSuffix = opts.dlqStreamSuffix ?? 'dlq';
  }

  async start(): Promise<void> {
    if (this.started) return;
    for (let shard = 0; shard < this.shardCount; shard++) {
      const key = this.streamKey(shard);
      try {
        await this.redis.xgroup('CREATE', key, this.consumerGroup, '$', 'MKSTREAM');
      } catch (err: unknown) {
        const msg = (err as Error).message ?? '';
        if (!msg.includes('BUSYGROUP')) throw err;
      }
    }
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
    // Do NOT quit redis here — the client is owned by the caller.
  }

  async enqueue(record: BufferRecord): Promise<void> {
    const shard = shardOf(record.projectId, this.shardCount);
    await this.redis.xadd(
      this.streamKey(shard),
      'MAXLEN',
      '~',
      String(this.maxStreamLength),
      '*',
      'payload',
      JSON.stringify(record),
    );
  }

  async enqueueMany(records: BufferRecord[]): Promise<void> {
    if (records.length === 0) return;
    const byShard = new Map<number, BufferRecord[]>();
    for (const r of records) {
      const s = shardOf(r.projectId, this.shardCount);
      let list = byShard.get(s);
      if (!list) {
        list = [];
        byShard.set(s, list);
      }
      list.push(r);
    }
    const pipeline = this.redis.pipeline();
    for (const [shard, list] of byShard) {
      for (const r of list) {
        pipeline.xadd(
          this.streamKey(shard),
          'MAXLEN',
          '~',
          String(this.maxStreamLength),
          '*',
          'payload',
          JSON.stringify(r),
        );
      }
    }
    await pipeline.exec();
  }

  async dequeue(
    shardId: number,
    maxBatchSize: number,
    maxWaitMs: number,
  ): Promise<BufferBatch | null> {
    const key = this.streamKey(shardId);

    // Priority 1: claim stale in-flight entries from dead consumers
    const claimed = await this.claimStale(key, shardId, maxBatchSize);
    if (claimed && claimed.records.length > 0) return claimed;

    // Priority 2: read new entries
    const res = (await this.redis.xreadgroup(
      'GROUP',
      this.consumerGroup,
      this.consumerName,
      'COUNT',
      maxBatchSize,
      'BLOCK',
      maxWaitMs,
      'STREAMS',
      key,
      '>',
    )) as Array<[string, Array<[string, string[]]>]> | null;

    if (!res || res.length === 0) return null;
    const entries = res[0][1];
    if (entries.length === 0) return null;

    const records: BufferRecord[] = [];
    const ids: string[] = [];
    for (const [id, fields] of entries) {
      const idx = fields.indexOf('payload');
      if (idx < 0) continue;
      records.push(JSON.parse(fields[idx + 1]) as BufferRecord);
      ids.push(id);
    }
    return { shardId, ackToken: ids.join(','), attempt: 1, records };
  }

  async ack(batch: BufferBatch): Promise<void> {
    if (!batch.ackToken) return;
    const key = this.streamKey(batch.shardId);
    const ids = batch.ackToken.split(',');
    if (ids.length > 0) await this.redis.xack(key, this.consumerGroup, ...ids);
  }

  async nack(batch: BufferBatch, reason: string, attempts: number): Promise<void> {
    const key = this.streamKey(batch.shardId);
    const dlqKey = `${key}:${this.dlqSuffix}`;
    const pipeline = this.redis.pipeline();
    for (const r of batch.records) {
      pipeline.xadd(
        dlqKey,
        '*',
        'payload',
        JSON.stringify(r),
        'reason',
        reason,
        'attempts',
        String(attempts),
        'firstFailedAt',
        String(Date.now()),
      );
    }
    const ids = batch.ackToken.split(',');
    if (ids.length > 0) pipeline.xack(key, this.consumerGroup, ...ids);
    await pipeline.exec();
  }

  async getStats(): Promise<BufferTransportStats> {
    let pending = 0;
    let inflight = 0;
    let dlq = 0;
    let oldest = 0;
    const now = Date.now();

    for (let shard = 0; shard < this.shardCount; shard++) {
      const key = this.streamKey(shard);
      const dlqKey = `${key}:${this.dlqSuffix}`;

      try {
        const len = (await this.redis.xlen(key)) as number;
        const pend = (await this.redis.xpending(key, this.consumerGroup)) as [
          number,
          string | null,
          string | null,
          unknown,
        ];
        const inflightCount = pend[0] as number;
        pending += Math.max(0, len - inflightCount);
        inflight += inflightCount;
      } catch {
        /* stream may not exist yet */
      }

      try {
        const first = (await this.redis.xrange(key, '-', '+', 'COUNT', 1)) as Array<
          [string, string[]]
        >;
        if (first.length > 0) {
          const idMs = Number(first[0][0].split('-')[0]);
          if (!Number.isNaN(idMs)) oldest = Math.max(oldest, now - idMs);
        }
      } catch {
        /* no entries */
      }

      try {
        dlq += (await this.redis.xlen(dlqKey)) as number;
      } catch {
        /* no dlq yet */
      }
    }

    return {
      pendingRecords: pending,
      inflightRecords: inflight,
      dlqRecords: dlq,
      oldestPendingAgeMs: oldest,
    };
  }

  private streamKey(shard: number): string {
    return `${this.streamPrefix}:${shard}`;
  }

  private async claimStale(
    key: string,
    shardId: number,
    maxBatchSize: number,
  ): Promise<BufferBatch | null> {
    // XAUTOCLAIM MIN-IDLE-TIME ms START 0 COUNT N
    // ioredis typings may not include xautoclaim; cast to a narrow signature.
    const xautoclaim = (
      this.redis as unknown as {
        xautoclaim: (...a: unknown[]) => Promise<unknown>;
      }
    ).xautoclaim.bind(this.redis);

    const res = (await xautoclaim(
      key,
      this.consumerGroup,
      this.consumerName,
      this.inflightTimeoutMs,
      '0',
      'COUNT',
      maxBatchSize,
    )) as [string, Array<[string, string[]]>, string[]] | null;

    if (!res) return null;
    const entries = res[1];
    if (!entries || entries.length === 0) return null;

    const records: BufferRecord[] = [];
    const ids: string[] = [];
    let maxAttempt = 1;

    // Get delivery count from XPENDING for each entry
    const pending = (await this.redis.xpending(
      key,
      this.consumerGroup,
      '-',
      '+',
      entries.length,
    )) as Array<[string, string, number, number]>;
    const deliveryByEntryId = new Map(pending.map((p) => [p[0], p[3]]));

    for (const [id, fields] of entries) {
      const idx = fields.indexOf('payload');
      if (idx < 0) continue;
      records.push(JSON.parse(fields[idx + 1]) as BufferRecord);
      ids.push(id);
      const attempt = deliveryByEntryId.get(id) ?? 2;
      if (attempt > maxAttempt) maxAttempt = attempt;
    }

    return records.length > 0
      ? { shardId, ackToken: ids.join(','), attempt: maxAttempt, records }
      : null;
  }
}
