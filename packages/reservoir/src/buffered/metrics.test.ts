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

  it('emits distinct _bucket, _sum and _count series for histograms', () => {
    const m = new BufferMetrics();
    m.observeFlushSuccess('log', 0, 100, 42);
    const text = m.toPrometheusText();

    const bucketMatches = text.match(
      /^reservoir_buffer_flush_duration_ms_bucket\{[^}]+\} \d+$/gm,
    );
    const sumMatches = text.match(
      /^reservoir_buffer_flush_duration_ms_sum\{[^}]+\} \d+(\.\d+)?$/gm,
    );
    const countMatches = text.match(
      /^reservoir_buffer_flush_duration_ms_count\{[^}]+\} \d+$/gm,
    );

    expect(bucketMatches).not.toBeNull();
    expect(bucketMatches!.length).toBeGreaterThan(0);
    expect(sumMatches).not.toBeNull();
    expect(sumMatches!.length).toBe(1);
    expect(countMatches).not.toBeNull();
    expect(countMatches!.length).toBe(1);

    // Duplicate-series guard: no (metric + labelset) combo should appear twice.
    const seriesLines = text
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.slice(0, l.lastIndexOf(' ')));
    const duplicates = seriesLines.filter((v, i, arr) => arr.indexOf(v) !== i);
    expect(duplicates).toEqual([]);
  });
});
