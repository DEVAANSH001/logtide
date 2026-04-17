import type { StorageEngine } from '../core/storage-engine.js';
import type { BufferTransport, FlushConfig, RetryConfig } from './types.js';
import type { CircuitBreaker } from './circuit-breaker.js';
import type { BufferMetrics } from './metrics.js';
import { FlushConsumer } from './flush-consumer.js';

export class FlushConsumerPool {
  private running = false;
  private controllers: AbortController[] = [];
  private tasks: Promise<void>[] = [];

  constructor(
    private readonly transport: BufferTransport,
    private readonly engine: StorageEngine,
    private readonly flushConfig: FlushConfig,
    private readonly retryConfig: RetryConfig,
    private readonly metrics: BufferMetrics,
    private readonly breaker: CircuitBreaker,
  ) {}

  async start(): Promise<void> {
    if (this.running) throw new Error('FlushConsumerPool already started');
    this.running = true;

    for (let shard = 0; shard < this.transport.shardCount; shard++) {
      const ac = new AbortController();
      this.controllers.push(ac);
      const consumer = new FlushConsumer(
        shard,
        this.transport,
        this.engine,
        this.flushConfig,
        this.retryConfig,
        this.metrics,
        this.breaker,
      );
      this.tasks.push(consumer.run(ac.signal));
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    const drainDeadline = Date.now() + this.flushConfig.gracefulShutdownMs;
    while (Date.now() < drainDeadline) {
      const stats = await this.transport.getStats();
      if (stats.pendingRecords === 0 && stats.inflightRecords === 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    for (const ac of this.controllers) ac.abort();
    await Promise.allSettled(this.tasks);
    this.controllers = [];
    this.tasks = [];
    this.running = false;
  }
}
