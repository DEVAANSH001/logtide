import type { StorageEngine } from '../core/storage-engine.js';
import type { LogRecord, SpanRecord, MetricRecord } from '../core/types.js';
import type {
  BufferRecord,
  BufferTransport,
  BufferBatch,
  FlushConfig,
  FlushLogger,
  RetryConfig,
} from './types.js';
import { defaultFlushLogger } from './types.js';
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
  private readonly logger: FlushLogger;

  constructor(
    private readonly shardId: number,
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
        this.logger.warn(`[FlushConsumer shard=${this.shardId}] dequeue error`, { err });
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

    // run the three ingest calls independently so one kind's failure does not
    // force the others to be retried (and re-inserted). storage engines
    // tolerate occasional duplicates, but avoiding preventable ones is nicer.
    const results = await Promise.allSettled([
      log.length > 0 ? this.engine.ingest(log) : Promise.resolve(),
      span.length > 0 ? this.engine.ingestSpans(span) : Promise.resolve(),
      metric.length > 0 ? this.engine.ingestMetrics(metric) : Promise.resolve(),
    ]);
    const [logRes, spanRes, metricRes] = results;
    const logFailed = logRes.status === 'rejected';
    const spanFailed = spanRes.status === 'rejected';
    const metricFailed = metricRes.status === 'rejected';
    const anyFailed = logFailed || spanFailed || metricFailed;

    if (!anyFailed) {
      await this.transport.ack(batch);
      const duration = Date.now() - started;
      if (log.length > 0) this.metrics.observeFlushSuccess('log', this.shardId, log.length, duration);
      if (span.length > 0) this.metrics.observeFlushSuccess('span', this.shardId, span.length, duration);
      if (metric.length > 0)
        this.metrics.observeFlushSuccess('metric', this.shardId, metric.length, duration);
      this.breaker.recordSuccess();
      return;
    }

    // partial or full failure: record failure only for the kinds that failed,
    // and success for the kinds that landed in storage (so metrics reflect
    // reality). we still nack the whole batch because BufferTransport does not
    // support partial acks. on redelivery, the succeeded kinds will be
    // re-ingested; storage engines tolerate the rare duplicate for
    // observability workloads.
    const firstErr = (results.find((r) => r.status === 'rejected') as
      | PromiseRejectedResult
      | undefined)?.reason;
    const duration = Date.now() - started;

    if (log.length > 0) {
      if (logFailed) {
        this.metrics.observeFlushFailure('log', this.shardId, (logRes as PromiseRejectedResult).reason);
      } else {
        this.metrics.observeFlushSuccess('log', this.shardId, log.length, duration);
      }
    }
    if (span.length > 0) {
      if (spanFailed) {
        this.metrics.observeFlushFailure('span', this.shardId, (spanRes as PromiseRejectedResult).reason);
      } else {
        this.metrics.observeFlushSuccess('span', this.shardId, span.length, duration);
      }
    }
    if (metric.length > 0) {
      if (metricFailed) {
        this.metrics.observeFlushFailure(
          'metric',
          this.shardId,
          (metricRes as PromiseRejectedResult).reason,
        );
      } else {
        this.metrics.observeFlushSuccess('metric', this.shardId, metric.length, duration);
      }
    }
    this.breaker.recordFailure();
    this.logger.warn(
      `[FlushConsumer shard=${this.shardId}] flush failed (attempt ${batch.attempt})`,
      { err: firstErr, logFailed, spanFailed, metricFailed },
    );

    if (batch.attempt >= this.retryConfig.maxAttempts) {
      await this.transport.nack(batch, String(firstErr), batch.attempt);
      // DLQ counts reflect only the kinds that never made it to storage.
      if (logFailed && log.length > 0) this.metrics.recordDlq('log', this.shardId, log.length);
      if (spanFailed && span.length > 0) this.metrics.recordDlq('span', this.shardId, span.length);
      if (metricFailed && metric.length > 0)
        this.metrics.recordDlq('metric', this.shardId, metric.length);
    } else {
      await sleep(jitteredBackoff(this.retryConfig.baseDelayMs, batch.attempt));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
