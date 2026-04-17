import type { StorageEngine } from '../core/storage-engine.js';
import type { LogRecord, SpanRecord, MetricRecord } from '../core/types.js';
import type {
  BufferRecord,
  BufferTransport,
  BufferBatch,
  FlushConfig,
  RetryConfig,
} from './types.js';
import type { CircuitBreaker } from './circuit-breaker.js';
import type { BufferMetrics } from './metrics.js';

function groupByKind(records: BufferRecord[]): {
  log: LogRecord[];
  span: SpanRecord[];
  metric: MetricRecord[];
} {
  const log: LogRecord[] = [];
  const span: SpanRecord[] = [];
  const metric: MetricRecord[] = [];
  for (const r of records) {
    if (r.kind === 'log') log.push(r.payload as LogRecord);
    else if (r.kind === 'span') span.push(r.payload as SpanRecord);
    else metric.push(r.payload as MetricRecord);
  }
  return { log, span, metric };
}

function jitteredBackoff(baseMs: number, attempt: number): number {
  const exp = baseMs * 2 ** Math.max(0, attempt - 1);
  return exp + Math.random() * baseMs;
}

export class FlushConsumer {
  constructor(
    private readonly shardId: number,
    private readonly transport: BufferTransport,
    private readonly engine: StorageEngine,
    private readonly flushConfig: FlushConfig,
    private readonly retryConfig: RetryConfig,
    private readonly metrics: BufferMetrics,
    private readonly breaker: CircuitBreaker,
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let batch: BufferBatch | null;
      try {
        batch = await this.transport.dequeue(
          this.shardId,
          this.flushConfig.maxBatchSize,
          this.flushConfig.maxBatchAgeMs,
        );
      } catch (err) {
        console.warn(`[FlushConsumer shard=${this.shardId}] dequeue error:`, err);
        await sleep(100);
        continue;
      }
      if (signal.aborted) return;
      if (!batch || batch.records.length === 0) continue;
      await this.flushBatch(batch);
    }
  }

  private async flushBatch(batch: BufferBatch): Promise<void> {
    const started = Date.now();
    const { log, span, metric } = groupByKind(batch.records);

    try {
      if (log.length > 0) await this.engine.ingest(log);
      if (span.length > 0) await this.engine.ingestSpans(span);
      if (metric.length > 0) await this.engine.ingestMetrics(metric);

      await this.transport.ack(batch);
      const duration = Date.now() - started;
      if (log.length > 0) this.metrics.observeFlushSuccess('log', this.shardId, log.length, duration);
      if (span.length > 0) this.metrics.observeFlushSuccess('span', this.shardId, span.length, duration);
      if (metric.length > 0) this.metrics.observeFlushSuccess('metric', this.shardId, metric.length, duration);
      this.breaker.recordSuccess();
    } catch (err) {
      console.warn(`[FlushConsumer shard=${this.shardId}] flush failed (attempt ${batch.attempt}):`, err);
      if (log.length > 0) this.metrics.observeFlushFailure('log', this.shardId, err);
      if (span.length > 0) this.metrics.observeFlushFailure('span', this.shardId, err);
      if (metric.length > 0) this.metrics.observeFlushFailure('metric', this.shardId, err);
      this.breaker.recordFailure();

      if (batch.attempt >= this.retryConfig.maxAttempts) {
        await this.transport.nack(batch, String(err), batch.attempt);
        if (log.length > 0) this.metrics.recordDlq('log', this.shardId, log.length);
        if (span.length > 0) this.metrics.recordDlq('span', this.shardId, span.length);
        if (metric.length > 0) this.metrics.recordDlq('metric', this.shardId, metric.length);
      } else {
        await sleep(jitteredBackoff(this.retryConfig.baseDelayMs, batch.attempt));
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
