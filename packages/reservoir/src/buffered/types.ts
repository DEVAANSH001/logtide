import type { LogRecord, SpanRecord, MetricRecord } from '../core/types.js';

export type BufferRecordKind = 'log' | 'span' | 'metric';

export interface BufferRecord {
  kind: BufferRecordKind;
  projectId: string;
  payload: LogRecord | SpanRecord | MetricRecord;
  enqueuedAt: number;
}

export interface BufferBatch {
  shardId: number;
  ackToken: string;
  attempt: number;
  records: BufferRecord[];
}

export interface BufferTransportStats {
  pendingRecords: number;
  inflightRecords: number;
  dlqRecords: number;
  oldestPendingAgeMs: number;
}

export interface BufferTransport {
  readonly shardCount: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  enqueue(record: BufferRecord): Promise<void>;
  enqueueMany(records: BufferRecord[]): Promise<void>;
  dequeue(shardId: number, maxBatchSize: number, maxWaitMs: number): Promise<BufferBatch | null>;
  ack(batch: BufferBatch): Promise<void>;
  nack(batch: BufferBatch, reason: string, attempt: number): Promise<void>;
  getStats(): Promise<BufferTransportStats>;
}

export interface FlushConfig {
  maxBatchSize: number;
  maxBatchAgeMs: number;
  gracefulShutdownMs: number;
}

export interface CircuitBreakerConfig {
  pendingThreshold: number;
  errorRateThreshold: number;
  cooldownMs: number;
  windowMs: number;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  dlqStreamSuffix: string;
}

export interface BufferedConfig {
  transport: BufferTransport;
  flush: FlushConfig;
  circuitBreaker: CircuitBreakerConfig;
  retry: RetryConfig;
}

export const DEFAULT_FLUSH: FlushConfig = {
  maxBatchSize: 5000,
  maxBatchAgeMs: 1000,
  gracefulShutdownMs: 30_000,
};

export const DEFAULT_BREAKER: CircuitBreakerConfig = {
  pendingThreshold: 50_000,
  errorRateThreshold: 0.1,
  cooldownMs: 30_000,
  windowMs: 60_000,
};

export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 100,
  dlqStreamSuffix: 'dlq',
};
