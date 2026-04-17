import type { BufferRecord, BufferBatch, BufferTransport, BufferTransportStats } from '../types.js';

export type PassthroughFlushFn = (records: BufferRecord[]) => Promise<void>;

/**
 * PassthroughTransport: no buffering. `enqueue` triggers flush immediately.
 * Used to disable the buffer layer entirely (tests, diagnostics).
 */
export class PassthroughTransport implements BufferTransport {
  readonly shardCount = 1;

  constructor(private readonly flush: PassthroughFlushFn) {}

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async enqueue(record: BufferRecord): Promise<void> {
    await this.flush([record]);
  }

  async enqueueMany(records: BufferRecord[]): Promise<void> {
    if (records.length > 0) await this.flush(records);
  }

  async dequeue(): Promise<BufferBatch | null> {
    return null;
  }

  async ack(): Promise<void> {}
  async nack(): Promise<void> {}

  async getStats(): Promise<BufferTransportStats> {
    return { pendingRecords: 0, inflightRecords: 0, dlqRecords: 0, oldestPendingAgeMs: 0 };
  }
}
