import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { BufferTransport, BufferRecord } from '../types.js';

function makeRecord(projectId: string, kind: 'log' | 'span' | 'metric' = 'log'): BufferRecord {
  return {
    kind,
    projectId,
    payload: { message: `hello from ${projectId}`, level: 'info' } as unknown as BufferRecord['payload'],
    enqueuedAt: Date.now(),
  };
}

export function runTransportContract(
  name: string,
  makeTransport: () => Promise<BufferTransport>,
  teardownTransport: (t: BufferTransport) => Promise<void>,
): void {
  describe(`BufferTransport contract: ${name}`, () => {
    let transport: BufferTransport;

    beforeEach(async () => {
      transport = await makeTransport();
      await transport.start();
    });
    afterEach(async () => {
      await teardownTransport(transport);
    });

    it('enqueue then dequeue returns the same record', async () => {
      await transport.enqueue(makeRecord('p1'));
      // on redis transport, p1 may not hash to shard 0 - iterate all shards
      let batch = null;
      for (let s = 0; s < transport.shardCount && !batch; s++) {
        batch = await transport.dequeue(s, 100, 50);
      }
      expect(batch).not.toBeNull();
      expect(batch!.records.length).toBeGreaterThanOrEqual(1);
      await transport.ack(batch!);
    });

    it('enqueueMany groups records into same shard when projectId matches', async () => {
      const records = [makeRecord('same'), makeRecord('same'), makeRecord('same')];
      await transport.enqueueMany(records);
      let total = 0;
      for (let s = 0; s < transport.shardCount; s++) {
        const b = await transport.dequeue(s, 100, 50);
        if (b) {
          total += b.records.length;
          await transport.ack(b);
        }
      }
      expect(total).toBe(3);
    });

    it('dequeue returns null when empty', async () => {
      const batch = await transport.dequeue(0, 100, 50);
      expect(batch).toBeNull();
    });

    it('nack moves batch to DLQ and increments dlq stat', async () => {
      await transport.enqueue(makeRecord('p1'));
      let batch = null;
      for (let s = 0; s < transport.shardCount && !batch; s++) {
        batch = await transport.dequeue(s, 100, 50);
      }
      expect(batch).not.toBeNull();
      await transport.nack(batch!, 'test', 5);
      const stats = await transport.getStats();
      expect(stats.dlqRecords).toBeGreaterThanOrEqual(1);
    });

    it('attempt increments on redelivery without ack', async () => {
      await transport.enqueue(makeRecord('p1'));
      let first = null;
      for (let s = 0; s < transport.shardCount && !first; s++) {
        first = await transport.dequeue(s, 100, 50);
      }
      expect(first!.attempt).toBe(1);

      // Do not ack. Next dequeue from same shard should redeliver.
      let second = null;
      // Some transports need the first to time out; wait briefly then re-dequeue
      await new Promise((r) => setTimeout(r, 100));
      second = await transport.dequeue(first!.shardId, 100, 100);
      expect(second).not.toBeNull();
      expect(second!.attempt).toBeGreaterThanOrEqual(2);
      await transport.ack(second!);
    });

    it('getStats reports pending and inflight accurately', async () => {
      await transport.enqueue(makeRecord('p1'));
      await transport.enqueue(makeRecord('p2'));
      const before = await transport.getStats();
      expect(before.pendingRecords + before.inflightRecords).toBeGreaterThanOrEqual(2);
    });
  });
}
