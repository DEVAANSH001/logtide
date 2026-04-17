import { describe, it, expect } from 'vitest';
import { BufferMetrics } from './metrics.js';

describe('BufferMetrics', () => {
  it('counts enqueued records per kind and shard', () => {
    const m = new BufferMetrics();
    m.recordEnqueued('log', 0, 10);
    m.recordEnqueued('log', 0, 5);
    m.recordEnqueued('span', 1, 3);
    expect(m.snapshot().counters['reservoir_buffer_enqueued_total{kind="log",shard="0"}']).toBe(15);
    expect(m.snapshot().counters['reservoir_buffer_enqueued_total{kind="span",shard="1"}']).toBe(3);
  });

  it('tracks flush success and failure', () => {
    const m = new BufferMetrics();
    m.observeFlushSuccess('log', 0, 100, 42);
    m.observeFlushFailure('log', 0, new Error('boom'));
    expect(m.snapshot().counters['reservoir_buffer_flushed_total{kind="log",shard="0"}']).toBe(100);
    expect(m.snapshot().counters['reservoir_buffer_flush_failures_total{kind="log",shard="0"}']).toBe(1);
  });

  it('emits Prometheus text format', () => {
    const m = new BufferMetrics();
    m.recordEnqueued('log', 0, 10);
    const text = m.toPrometheusText();
    expect(text).toContain('# TYPE reservoir_buffer_enqueued_total counter');
    expect(text).toContain('reservoir_buffer_enqueued_total{kind="log",shard="0"} 10');
  });

  it('records circuit breaker state', () => {
    const m = new BufferMetrics();
    m.setBreakerState('log', 'open');
    expect(m.snapshot().gauges['reservoir_buffer_breaker_state{kind="log"}']).toBe(2);
    m.setBreakerState('log', 'closed');
    expect(m.snapshot().gauges['reservoir_buffer_breaker_state{kind="log"}']).toBe(0);
  });
});
