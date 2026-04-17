import type { BufferRecord, BufferBatch, BufferTransport, BufferTransportStats } from '../types.js';
import { shardOf } from '../sharding.js';

interface PendingEntry {
  id: string;
  record: BufferRecord;
  attempts: number;
  inflight: boolean;
  inflightSince: number;
}

interface ShardState {
  entries: PendingEntry[];
  dlq: Array<{ record: BufferRecord; reason: string; attempts: number }>;
  nextId: number;
  waiters: Array<() => void>;
}

export interface InMemoryTransportOptions {
  shards?: number;
  /** How long an in-flight entry stays claimed before being redelivered */
  inflightTimeoutMs?: number;
}

export class InMemoryTransport implements BufferTransport {
  readonly shardCount: number;
  private shards_: ShardState[];
  private running = false;
  private readonly inflightTimeoutMs: number;

  constructor(opts: InMemoryTransportOptions = {}) {
    this.shardCount = opts.shards ?? 8;
    this.inflightTimeoutMs = opts.inflightTimeoutMs ?? 5000;
    this.shards_ = Array.from({ length: this.shardCount }, () => ({
      entries: [],
      dlq: [],
      nextId: 1,
      waiters: [],
    }));
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    // wake any dequeuers that are currently waiting so they return promptly
    for (const s of this.shards_) {
      const waiters = s.waiters;
      s.waiters = [];
      for (const w of waiters) w();
    }
  }

  async enqueue(record: BufferRecord): Promise<void> {
    if (!this.running) throw new Error('InMemoryTransport not started');
    const shard = this.shards_[shardOf(record.projectId, this.shardCount)];
    shard.entries.push({
      id: String(shard.nextId++),
      record,
      attempts: 0,
      inflight: false,
      inflightSince: 0,
    });
    const waiter = shard.waiters.shift();
    if (waiter) waiter();
  }

  async enqueueMany(records: BufferRecord[]): Promise<void> {
    if (!this.running) throw new Error('InMemoryTransport not started');
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

    for (const [shardIdx, shardRecords] of byShard) {
      const shard = this.shards_[shardIdx];
      const toPush: PendingEntry[] = shardRecords.map((record) => ({
        id: String(shard.nextId++),
        record,
        attempts: 0,
        inflight: false,
        inflightSince: 0,
      }));
      shard.entries.push(...toPush);
      // wake one waiter per shard (they claim up to maxBatchSize each, so one
      // wake per shard is enough; subsequent waiters get woken as dequeue loops)
      const waiter = shard.waiters.shift();
      if (waiter) waiter();
    }
  }

  async dequeue(shardId: number, maxBatchSize: number, maxWaitMs: number): Promise<BufferBatch | null> {
    const shard = this.shards_[shardId];
    const deadline = Date.now() + maxWaitMs;

    while (this.running && Date.now() < deadline) {
      this.reclaimExpired(shard);
      const claimed: PendingEntry[] = [];
      for (const e of shard.entries) {
        if (claimed.length >= maxBatchSize) break;
        if (!e.inflight) {
          e.inflight = true;
          e.inflightSince = Date.now();
          e.attempts++;
          claimed.push(e);
        }
      }
      if (claimed.length > 0) {
        return {
          shardId,
          ackToken: claimed.map((e) => e.id).join(','),
          attempt: Math.max(...claimed.map((e) => e.attempts)),
          records: claimed.map((e) => e.record),
        };
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      // cap each wait segment by the earliest reclaim deadline among inflight
      // entries, so if a consumer dies we pick up its abandoned entry at the
      // right time without relying on a new enqueue to wake us.
      let segment = remaining;
      let earliestInflightSince = Infinity;
      for (const e of shard.entries) {
        if (e.inflight && e.inflightSince < earliestInflightSince) {
          earliestInflightSince = e.inflightSince;
        }
      }
      if (earliestInflightSince !== Infinity) {
        const reclaimDeadline = earliestInflightSince + this.inflightTimeoutMs + 1;
        segment = Math.max(1, Math.min(segment, reclaimDeadline - Date.now()));
      }
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = (): void => {
          if (settled) return;
          settled = true;
          resolve();
        };
        shard.waiters.push(done);
        setTimeout(() => {
          const i = shard.waiters.indexOf(done);
          if (i >= 0) shard.waiters.splice(i, 1);
          done();
        }, segment);
      });
    }
    return null;
  }

  async ack(batch: BufferBatch): Promise<void> {
    const shard = this.shards_[batch.shardId];
    const ids = new Set(batch.ackToken.split(','));
    shard.entries = shard.entries.filter((e) => !ids.has(e.id));
  }

  async nack(batch: BufferBatch, reason: string, attempts: number): Promise<void> {
    const shard = this.shards_[batch.shardId];
    const ids = new Set(batch.ackToken.split(','));
    const moved: PendingEntry[] = [];
    shard.entries = shard.entries.filter((e) => {
      if (ids.has(e.id)) {
        moved.push(e);
        return false;
      }
      return true;
    });
    for (const e of moved) {
      shard.dlq.push({ record: e.record, reason, attempts });
    }
  }

  async getStats(): Promise<BufferTransportStats> {
    let pending = 0;
    let inflight = 0;
    let dlq = 0;
    let oldest = 0;
    const now = Date.now();
    for (const s of this.shards_) {
      for (const e of s.entries) {
        if (e.inflight) inflight++;
        else {
          pending++;
          oldest = Math.max(oldest, now - e.record.enqueuedAt);
        }
      }
      dlq += s.dlq.length;
    }
    return { pendingRecords: pending, inflightRecords: inflight, dlqRecords: dlq, oldestPendingAgeMs: oldest };
  }

  private reclaimExpired(shard: ShardState): void {
    const now = Date.now();
    let reclaimed = false;
    for (const e of shard.entries) {
      if (e.inflight && now - e.inflightSince > this.inflightTimeoutMs) {
        e.inflight = false;
        e.inflightSince = 0;
        reclaimed = true;
      }
    }
    if (reclaimed) {
      const waiter = shard.waiters.shift();
      if (waiter) waiter();
    }
  }
}
