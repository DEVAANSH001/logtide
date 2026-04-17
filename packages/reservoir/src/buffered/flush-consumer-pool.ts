import type { StorageEngine } from '../core/storage-engine.js';
import type { BufferTransport, FlushConfig, FlushLogger, RetryConfig } from './types.js';
import { defaultFlushLogger } from './types.js';
import type { CircuitBreaker } from './circuit-breaker.js';
import type { BufferMetrics } from './metrics.js';
import { FlushConsumer } from './flush-consumer.js';

export class FlushConsumerPool {
  private running = false;
  private controllers: AbortController[] = [];
  private tasks: Promise<void>[] = [];
  private readonly logger: FlushLogger;

  constructor(
    private readonly transport: BufferTransport,
    private readonly engine: StorageEngine,
    private readonly flushConfig: FlushConfig,
    private readonly retryConfig: RetryConfig,
    private readonly metrics: BufferMetrics,
    private readonly breaker: CircuitBreaker,
    logger?: FlushLogger,
  ) {
    this.logger = logger ?? defaultFlushLogger;
  }

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
        this.logger,
      );
      this.tasks.push(consumer.run(ac.signal));
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    // wait for pending work to drain. inflightRecords is NOT checked here: for
    // shared transports (e.g. RedisStreamTransport), inflight counts entries
    // held by other consumers in the same group, which we cannot drain from
    // this instance. our own inflight batches are owned by FlushConsumer tasks
    // and will finish synchronously once pending hits zero and we abort. any
    // truly orphaned claims are recovered by AUTOCLAIM elsewhere.
    const drainDeadline = Date.now() + this.flushConfig.gracefulShutdownMs;
    while (Date.now() < drainDeadline) {
      const stats = await this.transport.getStats();
      if (stats.pendingRecords === 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    for (const ac of this.controllers) ac.abort();
    const results = await Promise.allSettled(this.tasks);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'rejected') {
        this.logger.error(`[FlushConsumerPool] shard=${i} consumer crashed`, { err: r.reason });
      }
    }
    this.controllers = [];
    this.tasks = [];
    this.running = false;
  }
}
