import type { BufferRecordKind } from './types.js';
import type { BreakerState } from './circuit-breaker.js';

type Labels = Record<string, string>;

function labelKey(metric: string, labels: Labels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  const labelStr = entries.map(([k, v]) => `${k}="${v}"`).join(',');
  return labelStr ? `${metric}{${labelStr}}` : metric;
}

interface Snapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, { count: number; sum: number; buckets: Record<number, number> }>;
}

const DEFAULT_BUCKETS_MS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const DEFAULT_BUCKETS_SIZE = [1, 10, 100, 500, 1000, 2500, 5000, 10000];

export class BufferMetrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<
    string,
    { count: number; sum: number; buckets: number[]; counts: number[] }
  >();

  recordEnqueued(kind: BufferRecordKind, shard: number, n: number): void {
    this.inc(`reservoir_buffer_enqueued_total`, { kind, shard: String(shard) }, n);
  }

  observeFlushSuccess(kind: BufferRecordKind, shard: number, batchSize: number, durationMs: number): void {
    this.inc(`reservoir_buffer_flushed_total`, { kind, shard: String(shard) }, batchSize);
    this.observe(
      `reservoir_buffer_flush_duration_ms`,
      { kind, shard: String(shard) },
      durationMs,
      DEFAULT_BUCKETS_MS,
    );
    this.observe(
      `reservoir_buffer_batch_size`,
      { kind, shard: String(shard) },
      batchSize,
      DEFAULT_BUCKETS_SIZE,
    );
  }

  observeFlushFailure(kind: BufferRecordKind, shard: number, _err: unknown): void {
    this.inc(`reservoir_buffer_flush_failures_total`, { kind, shard: String(shard) }, 1);
  }

  recordDlq(kind: BufferRecordKind, shard: number, n: number): void {
    this.inc(`reservoir_buffer_dlq_total`, { kind, shard: String(shard) }, n);
  }

  recordDropped(kind: BufferRecordKind, reason: string, n: number): void {
    this.inc(`reservoir_buffer_dropped_total`, { kind, reason }, n);
  }

  recordBypass(kind: BufferRecordKind, reason: string, n: number): void {
    this.inc(`reservoir_buffer_bypass_total`, { kind, reason }, n);
  }

  setPending(kind: BufferRecordKind, shard: number, v: number): void {
    this.set(`reservoir_buffer_pending`, { kind, shard: String(shard) }, v);
  }

  setInflight(kind: BufferRecordKind, shard: number, v: number): void {
    this.set(`reservoir_buffer_inflight`, { kind, shard: String(shard) }, v);
  }

  setOldestAge(kind: BufferRecordKind, shard: number, ms: number): void {
    this.set(`reservoir_buffer_oldest_age_ms`, { kind, shard: String(shard) }, ms);
  }

  setBreakerState(kind: BufferRecordKind, state: BreakerState): void {
    const v = state === 'closed' ? 0 : state === 'half-open' ? 1 : 2;
    this.set(`reservoir_buffer_breaker_state`, { kind }, v);
  }

  snapshot(): Snapshot {
    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters) counters[k] = v;
    const gauges: Record<string, number> = {};
    for (const [k, v] of this.gauges) gauges[k] = v;
    const histograms: Record<string, { count: number; sum: number; buckets: Record<number, number> }> = {};
    for (const [k, h] of this.histograms) {
      const buckets: Record<number, number> = {};
      for (let i = 0; i < h.buckets.length; i++) buckets[h.buckets[i]] = h.counts[i];
      histograms[k] = { count: h.count, sum: h.sum, buckets };
    }
    return { counters, gauges, histograms };
  }

  toPrometheusText(): string {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const [key, v] of this.counters) {
      const name = key.split('{')[0];
      if (!seen.has(name)) {
        lines.push(`# TYPE ${name} counter`);
        seen.add(name);
      }
      lines.push(`${key} ${v}`);
    }
    for (const [key, v] of this.gauges) {
      const name = key.split('{')[0];
      if (!seen.has(name)) {
        lines.push(`# TYPE ${name} gauge`);
        seen.add(name);
      }
      lines.push(`${key} ${v}`);
    }
    for (const [key, h] of this.histograms) {
      const name = key.split('{')[0];
      if (!seen.has(name)) {
        lines.push(`# TYPE ${name} histogram`);
        seen.add(name);
      }
      const labelSuffix = key.includes('{') ? key.slice(key.indexOf('{')) : '';
      for (let i = 0; i < h.buckets.length; i++) {
        const bucketLabels = labelSuffix
          ? labelSuffix.replace('}', `,le="${h.buckets[i]}"}`)
          : `{le="${h.buckets[i]}"}`;
        lines.push(`${name}_bucket${bucketLabels} ${h.counts[i]}`);
      }
      lines.push(`${name}_sum${labelSuffix} ${h.sum}`);
      lines.push(`${name}_count${labelSuffix} ${h.count}`);
    }
    return lines.join('\n') + '\n';
  }

  private inc(name: string, labels: Labels, n: number): void {
    const key = labelKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + n);
  }

  private set(name: string, labels: Labels, v: number): void {
    const key = labelKey(name, labels);
    this.gauges.set(key, v);
  }

  private observe(name: string, labels: Labels, v: number, buckets: number[]): void {
    const key = labelKey(name, labels);
    let h = this.histograms.get(key);
    if (!h) {
      h = { count: 0, sum: 0, buckets: buckets.slice(), counts: new Array(buckets.length).fill(0) };
      this.histograms.set(key, h);
    }
    h.count++;
    h.sum += v;
    for (let i = 0; i < h.buckets.length; i++) {
      if (v <= h.buckets[i]) h.counts[i]++;
    }
  }
}
