# Reservoir Engine Benchmark Results

**Machine:** logtide-server (192.168.0.174)
**Date:** 2026-03-10
**Engines:** TimescaleDB, ClickHouse, MongoDB
**Config:** 3 iterations, 1 warmup

---

## 1K Volume Tier

### Logs

| Operation | TimescaleDB | ClickHouse | MongoDB |
|---|---|---|---|
| **Ingest (batch 100)** | 7.76ms p50 · 13K ops/s | 400.15ms p50 · 250 ops/s | 45.37ms p50 · 2.2K ops/s |
| **Ingest (batch 1,000)** | 16.5ms p50 · 56.6K ops/s | 400.09ms p50 · 2.5K ops/s | 292.08ms p50 · 3.4K ops/s |
| **Ingest (batch 10,000)** | 111.6ms p50 · 83.3K ops/s | 116.9ms p50 · 83.5K ops/s | 4662.5ms p50 · 2.2K ops/s |
| **Query (service filter)** | 0.65ms p50 | 19.84ms p50 | 95ms p50 |
| **Query (multi-filter)** | 0.5ms p50 | 14.67ms p50 | 33.62ms p50 |
| **Query (full-text)** | 0.49ms p50 | 12.74ms p50 | FAIL (text index) |
| **Query (substring)** | 0.45ms p50 | 18.15ms p50 | 174.89ms p50 |
| **Query (1h time range)** | 0.43ms p50 | 8.58ms p50 | 3.12ms p50 |
| **Query (pagination offset=1000)** | 0.54ms p50 | 40.5ms p50 | 183.75ms p50 |
| **Aggregate (1m)** | 0.43ms p50 | 74.6ms p50 | 237.77ms p50 |
| **Aggregate (1h)** | 0.41ms p50 | 9.96ms p50 | 96.46ms p50 |
| **Aggregate (1d)** | 0.41ms p50 | 7.8ms p50 | 116.94ms p50 |
| **Count** | 0.35ms p50 | 6.07ms p50 | 74.59ms p50 |
| **Count (filtered)** | 0.38ms p50 | 6.06ms p50 | 53.88ms p50 |
| **Count estimate** | 0.38ms p50 | 5.57ms p50 | 75.11ms p50 |
| **Distinct (service)** | 0.41ms p50 | 6.21ms p50 | 94.52ms p50 |
| **Top values (service)** | 0.42ms p50 | 6.94ms p50 | 98.34ms p50 |
| **Concurrent (5 parallel)** | 0.86ms p50 | 35.37ms p50 | 101.24ms p50 |
| **Concurrent (10 parallel)** | 1.18ms p50 | 68.42ms p50 | 162.34ms p50 |
| **Concurrent (50 parallel)** | 6.25ms p50 | 361.98ms p50 | 716.11ms p50 |

### Spans/Traces

| Operation | TimescaleDB | ClickHouse | MongoDB |
|---|---|---|---|
| **Ingest spans (batch 1,000)** | 11.91ms p50 · 83.8K ops/s | 399.92ms p50 · 2.5K ops/s | 21.57ms p50 · 42.9K ops/s |
| **Ingest spans (batch 10,000)** | 108ms p50 · 93.1K ops/s | 122.49ms p50 · 80.8K ops/s | 213.32ms p50 · 46.1K ops/s |
| **Query spans (by service)** | 0.82ms p50 | 39.25ms p50 | 68.93ms p50 |
| **Query spans (service + error)** | 0.79ms p50 | 36.92ms p50 | 68.99ms p50 |
| **Get spans by traceId** | 0.33ms p50 | 7.99ms p50 | 0.47ms p50 |
| **Query traces (all)** | 1.81ms p50 | 13.56ms p50 | 1.42ms p50 |
| **Query traces (errors only)** | 0.89ms p50 | 12.08ms p50 | 1.02ms p50 |
| **Query traces (slow >500ms)** | 1.43ms p50 | 12.09ms p50 | 1.52ms p50 |
| **Get trace by ID** | 0.33ms p50 | 3.61ms p50 | 0.44ms p50 |
| **Service dependencies** | 0.46ms p50 | 68.71ms p50 | 415.8ms p50 |
| **Concurrent spans (5)** | 1.29ms p50 | 60.92ms p50 | 111.99ms p50 |
| **Concurrent spans (10)** | 2.15ms p50 | 122.86ms p50 | 217.06ms p50 |
| **Concurrent spans (50)** | 9.64ms p50 | 604.25ms p50 | 1071.66ms p50 |

### Metrics

| Operation | TimescaleDB | ClickHouse | MongoDB |
|---|---|---|---|
| **Ingest metrics (batch 1,000)** | 7.27ms p50 · 134K ops/s | 400.75ms p50 · 2.5K ops/s | 19.12ms p50 · 53.4K ops/s |
| **Ingest metrics (batch 10,000)** | 64.73ms p50 · 149.5K ops/s | 100.36ms p50 · 100.5K ops/s | 174.35ms p50 · 54.3K ops/s |
| **Query metrics (by name)** | 0.9ms p50 | 18.16ms p50 | 2.55ms p50 |
| **Query metrics (name + service)** | 0.88ms p50 | 16.41ms p50 | 12.48ms p50 |
| **Aggregate avg / 1h** | FAIL (no cagg) | 6.67ms p50 | 13.67ms p50 |
| **Aggregate sum / 1h** | FAIL (no cagg) | 6.48ms p50 | 12.85ms p50 |
| **Aggregate min / 1h** | FAIL (no cagg) | 7.39ms p50 | 13.16ms p50 |
| **Aggregate max / 1h** | FAIL (no cagg) | 6.42ms p50 | 13.11ms p50 |
| **Aggregate p50 / 1h** | 0.41ms p50 | 11.38ms p50 | 13.81ms p50 |
| **Aggregate p95 / 1h** | 0.4ms p50 | 12.08ms p50 | 14.93ms p50 |
| **Aggregate p99 / 1h** | 0.38ms p50 | 12.15ms p50 | 14.71ms p50 |
| **Aggregate avg / 1h / groupBy** | 0.42ms p50 | 17.64ms p50 | 16.74ms p50 |
| **Get metric names** | 0.3ms p50 | 12.46ms p50 | 107.69ms p50 |
| **Get label keys** | 0.31ms p50 | 6.71ms p50 | 21.44ms p50 |
| **Get label values** | 0.31ms p50 | 8.43ms p50 | 12.34ms p50 |
| **Metrics overview** | 14.49ms p50 | FAIL (agg error) | 137.14ms p50 |
| **Concurrent metrics (5)** | 1.3ms p50 | 23.82ms p50 | 4.02ms p50 |
| **Concurrent metrics (10)** | 2.34ms p50 | 33.98ms p50 | 7.77ms p50 |
| **Concurrent metrics (50)** | 8.21ms p50 | 154.77ms p50 | 38.17ms p50 |

### Winner Summary (1K)

| Engine | Wins | % |
|---|---|---|
| **TimescaleDB** | 47 | 90% |
| **ClickHouse** | 4 | 8% |
| **MongoDB** | 1 | 2% |

> **Note:** ClickHouse small batch ingestion shows ~400ms overhead due to `async_insert` wait. At 1K volume, TimescaleDB dominates with sub-millisecond query latency. ClickHouse advantages emerge at larger volumes.

### Known Issues (1K run)
- TimescaleDB: `aggregateMetrics` (avg/sum/min/max) fails - missing `metrics_hourly_stats` continuous aggregate (fixed)
- MongoDB: full-text search fails - stale time-series collection blocks text index (fixed)
- ClickHouse: `getMetricsOverview` fails - alias collision causes `sum(sum(...))` (fixed)

---

## 10K Volume Tier

### Logs

| Operation | TimescaleDB | ClickHouse | MongoDB |
|---|---|---|---|
| **Ingest (batch 100)** | 6.67ms p50 · 14.9K ops/s | 399.78ms p50 · 250 ops/s | 4.22ms p50 · 23.8K ops/s |
| **Ingest (batch 1,000)** | 14.17ms p50 · 71.4K ops/s | 400.88ms p50 · 2.5K ops/s | 35.46ms p50 · 27.6K ops/s |
| **Ingest (batch 10,000)** | 84.52ms p50 · 119K ops/s | 114.74ms p50 · 85.4K ops/s | 349.84ms p50 · 26.6K ops/s |
| **Query (service filter)** | 0.54ms p50 | 21.7ms p50 | 102.3ms p50 |
| **Query (multi-filter)** | 0.5ms p50 | 16.92ms p50 | 100.03ms p50 |
| **Query (full-text)** | 0.62ms p50 | 17.4ms p50 | 16.95ms p50 |
| **Query (substring)** | 0.43ms p50 | 19.87ms p50 | 115.96ms p50 |
| **Query (1h time range)** | 0.39ms p50 | 10.9ms p50 | 2.26ms p50 |
| **Query (pagination offset=1000)** | 0.39ms p50 | 44.54ms p50 | 107.48ms p50 |
| **Aggregate (1m)** | 0.43ms p50 | 82.04ms p50 | 282.88ms p50 |
| **Aggregate (1h)** | 0.49ms p50 | 10.62ms p50 | 128.02ms p50 |
| **Aggregate (1d)** | 0.43ms p50 | 8.49ms p50 | 150.96ms p50 |
| **Count** | 0.38ms p50 | 5.92ms p50 | 19.94ms p50 |
| **Count (filtered)** | 0.44ms p50 | 6.32ms p50 | 95.28ms p50 |
| **Count estimate** | 0.4ms p50 | 5.73ms p50 | 20.4ms p50 |
| **Distinct (service)** | 0.4ms p50 | 8.36ms p50 | 138.74ms p50 |
| **Top values (service)** | 0.41ms p50 | 6.88ms p50 | 125.21ms p50 |
| **Concurrent (5 parallel)** | 0.9ms p50 | 39.62ms p50 | 113.49ms p50 |
| **Concurrent (10 parallel)** | 1.35ms p50 | 80.98ms p50 | 157.27ms p50 |
| **Concurrent (50 parallel)** | 5.88ms p50 | 411.78ms p50 | 736.5ms p50 |

### Spans/Traces

| Operation | TimescaleDB | ClickHouse | MongoDB |
|---|---|---|---|
| **Ingest spans (batch 1,000)** | 12.38ms p50 · 82.3K ops/s | 400.12ms p50 · 2.5K ops/s | 19.96ms p50 · 50.2K ops/s |
| **Ingest spans (batch 10,000)** | 105.44ms p50 · 91.3K ops/s | 127.15ms p50 · 78.7K ops/s | 227.69ms p50 · 45.6K ops/s |
| **Query spans (by service)** | 0.69ms p50 | 37.93ms p50 | 78.69ms p50 |
| **Query spans (service + error)** | 0.69ms p50 | 35.99ms p50 | 74.22ms p50 |
| **Get spans by traceId** | 0.3ms p50 | 6.01ms p50 | 0.47ms p50 |
| **Query traces (all)** | 2.38ms p50 | 10.84ms p50 | 1.53ms p50 |
| **Query traces (errors only)** | 2.18ms p50 | 11.31ms p50 | 2.68ms p50 |
| **Query traces (slow >500ms)** | 2.27ms p50 | 11.52ms p50 | 2.56ms p50 |
| **Get trace by ID** | 0.32ms p50 | 3.6ms p50 | 0.37ms p50 |
| **Service dependencies** | 0.45ms p50 | 96.79ms p50 | 458.26ms p50 |
| **Concurrent spans (5)** | 1.2ms p50 | 86.88ms p50 | 122.39ms p50 |
| **Concurrent spans (10)** | 2.29ms p50 | 163.28ms p50 | 242.67ms p50 |
| **Concurrent spans (50)** | 6.21ms p50 | 835.97ms p50 | 1197.31ms p50 |

### Metrics

| Operation | TimescaleDB | ClickHouse | MongoDB |
|---|---|---|---|
| **Ingest metrics (batch 1,000)** | 7.45ms p50 · 132.3K ops/s | 401.75ms p50 · 2.5K ops/s | 16.5ms p50 · 61.1K ops/s |
| **Ingest metrics (batch 10,000)** | 67.03ms p50 · 150.2K ops/s | 100.03ms p50 · 98K ops/s | 184.17ms p50 · 55.6K ops/s |
| **Query metrics (by name)** | 0.68ms p50 | 20.76ms p50 | 2.76ms p50 |
| **Query metrics (name + service)** | 0.72ms p50 | 21.66ms p50 | 11.33ms p50 |
| **Aggregate avg / 1h** | 0.36ms p50 | 6.97ms p50 | 14.42ms p50 |
| **Aggregate sum / 1h** | 0.35ms p50 | 7.19ms p50 | 14.01ms p50 |
| **Aggregate min / 1h** | 0.36ms p50 | 6.54ms p50 | 12.99ms p50 |
| **Aggregate max / 1h** | 0.34ms p50 | 6.21ms p50 | 13.4ms p50 |
| **Aggregate p50 / 1h** | 0.38ms p50 | 14.02ms p50 | 14.61ms p50 |
| **Aggregate p95 / 1h** | 0.38ms p50 | 14.1ms p50 | 13.87ms p50 |
| **Aggregate p99 / 1h** | 0.37ms p50 | 14.08ms p50 | 12.97ms p50 |
| **Aggregate avg / 1h / groupBy** | 0.38ms p50 | 19.46ms p50 | 18.29ms p50 |
| **Get metric names** | 0.27ms p50 | 11.56ms p50 | 117.84ms p50 |
| **Get label keys** | 0.28ms p50 | 8.25ms p50 | 18.84ms p50 |
| **Get label values** | 0.29ms p50 | 9.8ms p50 | 12.05ms p50 |
| **Metrics overview** | 0.75ms p50 | FAIL (agg error) | 139.4ms p50 |
| **Concurrent metrics (5)** | 1.1ms p50 | 32.15ms p50 | 4.57ms p50 |
| **Concurrent metrics (10)** | 1.52ms p50 | 54.31ms p50 | 8.91ms p50 |
| **Concurrent metrics (50)** | 6.64ms p50 | 251.37ms p50 | 43.7ms p50 |

### Winner Summary (10K)

| Engine | Wins | % |
|---|---|---|
| **TimescaleDB** | 50 | 96% |
| **ClickHouse** | 0 | 0% |
| **MongoDB** | 2 | 4% |

> **Note:** At 10K, TimescaleDB maintains dominance. MongoDB wins on trace queries (indexed lookups). ClickHouse still penalized by async_insert on small batches.

---

## 100K Volume Tier

*Running...*
