import { randomUUID } from 'crypto';
import type { LogRecord, SpanRecord, TraceRecord, MetricRecord, MetricType } from '../src/index.js';

// ---------------------------------------------------------------------------
// Deterministic PRNG (xorshift32) for reproducibility
// ---------------------------------------------------------------------------

let seed = 42;

function xorshift(): number {
  if (seed === 0) seed = 1; // prevent zero-lock
  seed ^= seed << 13;
  seed ^= seed >> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}

export function resetSeed(s = 42): void {
  seed = s;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(xorshift() * arr.length)];
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const result: T[] = [];
  for (let i = 0; i < n; i++) result.push(pick(arr));
  return result;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVICES = [
  'api-gateway', 'auth-service', 'user-service', 'order-service',
  'payment-service', 'notification-service', 'inventory-service',
  'search-service', 'analytics-service', 'scheduler-service',
] as const;

const LEVELS = ['debug', 'info', 'warn', 'error', 'critical'] as const;
const LEVEL_WEIGHTS = [0.1, 0.5, 0.2, 0.15, 0.05];

const HOSTNAMES = [
  'prod-01', 'prod-02', 'prod-03', 'staging-01', 'dev-01',
] as const;

const LOG_MESSAGES = [
  'Request processed successfully',
  'Database query executed in {duration}ms',
  'User {userId} authenticated via OAuth2',
  'Cache miss for key {cacheKey}',
  'Rate limit exceeded for client {clientIp}',
  'Connection pool exhausted, waiting for available connection',
  'Failed to process webhook: timeout after 30s',
  'Health check passed: all dependencies healthy',
  'Scheduled job completed: processed {count} records',
  'TLS handshake failed: certificate expired',
  'Memory usage at {percent}% - approaching threshold',
  'New deployment detected: version {version}',
  'Circuit breaker opened for downstream service {service}',
  'Retry attempt {attempt}/3 for operation {operation}',
  'Garbage collection pause: {gcMs}ms',
  'Request validation failed: missing required field {field}',
  'Background worker started processing batch {batchId}',
  'Slow query detected: {query} took {duration}ms',
  'Session expired for user {userId}',
  'Incoming request: {method} {path} from {clientIp}',
] as const;

const OPERATIONS = [
  'GET /api/users', 'POST /api/users', 'GET /api/orders',
  'POST /api/orders', 'GET /api/products', 'PUT /api/products/:id',
  'DELETE /api/sessions', 'POST /api/auth/login', 'GET /api/health',
  'POST /api/webhooks', 'GET /api/search', 'PUT /api/inventory',
  'POST /api/payments', 'GET /api/notifications', 'POST /api/analytics/events',
] as const;

const METRIC_NAMES = [
  'http_request_duration_seconds', 'http_requests_total',
  'process_cpu_seconds_total', 'process_resident_memory_bytes',
  'db_query_duration_seconds', 'cache_hit_ratio',
  'queue_depth', 'active_connections',
  'error_rate', 'gc_pause_seconds',
] as const;

const METRIC_TYPES: MetricType[] = ['gauge', 'sum', 'histogram'];

// ---------------------------------------------------------------------------
// Weighted level selection
// ---------------------------------------------------------------------------

function pickLevel(): typeof LEVELS[number] {
  const r = xorshift();
  let cumulative = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    cumulative += LEVEL_WEIGHTS[i];
    if (r < cumulative) return LEVELS[i];
  }
  return 'info';
}

// ---------------------------------------------------------------------------
// Log generation
// ---------------------------------------------------------------------------

function generateMessage(): string {
  const template = pick(LOG_MESSAGES);
  return template
    .replace('{duration}', String(Math.floor(xorshift() * 500)))
    .replace('{userId}', `user-${Math.floor(xorshift() * 10000)}`)
    .replace('{cacheKey}', `cache:${pick(SERVICES)}:${Math.floor(xorshift() * 1000)}`)
    .replace('{clientIp}', `${Math.floor(xorshift() * 255)}.${Math.floor(xorshift() * 255)}.${Math.floor(xorshift() * 255)}.${Math.floor(xorshift() * 255)}`)
    .replace('{count}', String(Math.floor(xorshift() * 10000)))
    .replace('{percent}', String(Math.floor(xorshift() * 100)))
    .replace('{version}', `v${Math.floor(xorshift() * 5)}.${Math.floor(xorshift() * 20)}.${Math.floor(xorshift() * 100)}`)
    .replace('{service}', pick(SERVICES))
    .replace('{attempt}', String(Math.floor(xorshift() * 3) + 1))
    .replace('{operation}', pick(OPERATIONS))
    .replace('{gcMs}', String(Math.floor(xorshift() * 200)))
    .replace('{field}', pick(['email', 'name', 'id', 'token']))
    .replace('{batchId}', `batch-${Math.floor(xorshift() * 100000)}`)
    .replace('{query}', 'SELECT * FROM logs WHERE ...')
    .replace('{method}', pick(['GET', 'POST', 'PUT', 'DELETE']))
    .replace('{path}', pick(OPERATIONS).split(' ')[1]);
}

export function generateLogs(
  count: number,
  projectId: string,
  organizationId: string,
  timeRange?: { from: Date; to: Date },
): LogRecord[] {
  const now = Date.now();
  const from = timeRange?.from.getTime() ?? now - 86400000 * 7; // 7 days ago
  const to = timeRange?.to.getTime() ?? now;
  const span = to - from;

  const logs: LogRecord[] = [];
  for (let i = 0; i < count; i++) {
    const hasTrace = xorshift() < 0.3;
    logs.push({
      time: new Date(from + xorshift() * span),
      organizationId,
      projectId,
      service: pick(SERVICES),
      level: pickLevel(),
      message: generateMessage(),
      hostname: pick(HOSTNAMES),
      traceId: hasTrace ? randomUUID().replace(/-/g, '') : undefined,
      spanId: hasTrace ? randomUUID().replace(/-/g, '').slice(0, 16) : undefined,
      metadata: {
        environment: pick(['production', 'staging', 'development']),
        region: pick(['us-east-1', 'eu-west-1', 'ap-southeast-1']),
        version: `v${Math.floor(xorshift() * 3)}.${Math.floor(xorshift() * 10)}.${Math.floor(xorshift() * 50)}`,
        requestId: randomUUID(),
        statusCode: pick([200, 201, 204, 400, 401, 403, 404, 500, 502, 503]),
      },
    });
  }

  return logs;
}

// ---------------------------------------------------------------------------
// Span/Trace generation
// ---------------------------------------------------------------------------

export interface TraceBundle {
  trace: TraceRecord;
  spans: SpanRecord[];
}

export function generateTraceBundles(
  count: number,
  projectId: string,
  organizationId: string,
  timeRange?: { from: Date; to: Date },
): TraceBundle[] {
  const now = Date.now();
  const from = timeRange?.from.getTime() ?? now - 86400000 * 7;
  const to = timeRange?.to.getTime() ?? now;
  const span = to - from;

  const bundles: TraceBundle[] = [];
  for (let i = 0; i < count; i++) {
    const traceId = randomUUID().replace(/-/g, '');
    const rootService = pick(SERVICES);
    const rootOp = pick(OPERATIONS);
    const startMs = from + xorshift() * span;
    const totalDuration = 10 + xorshift() * 2000;
    const hasError = xorshift() < 0.1;

    // 2-6 spans per trace
    const spanCount = 2 + Math.floor(xorshift() * 5);
    const traceSpans: SpanRecord[] = [];

    let parentSpanId: string | undefined;
    for (let s = 0; s < spanCount; s++) {
      const spanId = randomUUID().replace(/-/g, '').slice(0, 16);
      const spanStart = startMs + (totalDuration / spanCount) * s;
      const spanDuration = totalDuration / spanCount * (0.5 + xorshift());
      const serviceName = s === 0 ? rootService : pick(SERVICES);

      traceSpans.push({
        time: new Date(spanStart),
        spanId,
        traceId,
        parentSpanId: s === 0 ? undefined : parentSpanId,
        organizationId,
        projectId,
        serviceName,
        operationName: s === 0 ? rootOp : pick(OPERATIONS),
        startTime: new Date(spanStart),
        endTime: new Date(spanStart + spanDuration),
        durationMs: Math.round(spanDuration),
        kind: pick(['CLIENT', 'SERVER', 'INTERNAL'] as const),
        statusCode: hasError && s === spanCount - 1 ? 'ERROR' : 'OK',
        attributes: {
          'http.method': pick(['GET', 'POST', 'PUT', 'DELETE']),
          'http.status_code': hasError && s === spanCount - 1 ? 500 : 200,
          'http.url': pick(OPERATIONS).split(' ')[1],
        },
      });

      parentSpanId = spanId;
    }

    bundles.push({
      trace: {
        traceId,
        organizationId,
        projectId,
        serviceName: rootService,
        rootServiceName: rootService,
        rootOperationName: rootOp,
        startTime: new Date(startMs),
        endTime: new Date(startMs + totalDuration),
        durationMs: Math.round(totalDuration),
        spanCount,
        error: hasError,
      },
      spans: traceSpans,
    });
  }

  return bundles;
}

export function generateSpans(
  count: number,
  projectId: string,
  organizationId: string,
  timeRange?: { from: Date; to: Date },
): SpanRecord[] {
  // Generate enough trace bundles to get ~count spans
  const avgSpansPerTrace = 4;
  const traceCount = Math.ceil(count / avgSpansPerTrace);
  const bundles = generateTraceBundles(traceCount, projectId, organizationId, timeRange);
  return bundles.flatMap(b => b.spans).slice(0, count);
}

// ---------------------------------------------------------------------------
// Metric generation
// ---------------------------------------------------------------------------

export function generateMetrics(
  count: number,
  projectId: string,
  organizationId: string,
  timeRange?: { from: Date; to: Date },
): MetricRecord[] {
  const now = Date.now();
  const from = timeRange?.from.getTime() ?? now - 86400000 * 7;
  const to = timeRange?.to.getTime() ?? now;
  const timeSpan = to - from;

  const metrics: MetricRecord[] = [];
  for (let i = 0; i < count; i++) {
    const metricName = pick(METRIC_NAMES);
    const metricType = metricName.endsWith('_total') ? 'sum' as MetricType
      : metricName.endsWith('_seconds') ? pick(['gauge', 'histogram'] as MetricType[])
      : 'gauge' as MetricType;

    metrics.push({
      time: new Date(from + xorshift() * timeSpan),
      organizationId,
      projectId,
      metricName,
      metricType,
      value: metricName.includes('bytes')
        ? xorshift() * 1e9
        : metricName.includes('ratio')
          ? xorshift()
          : metricName.includes('total')
            ? Math.floor(xorshift() * 100000)
            : xorshift() * 10,
      serviceName: pick(SERVICES),
      isMonotonic: metricType === 'sum',
      attributes: {
        method: pick(['GET', 'POST', 'PUT', 'DELETE']),
        endpoint: pick(OPERATIONS).split(' ')[1],
        status: String(pick([200, 201, 400, 404, 500])),
      },
    });
  }

  return metrics;
}

