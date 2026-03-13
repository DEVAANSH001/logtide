// Ingestion load test — sustained and burst ingestion
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, apiKeyHeaders, generateBatch, generateTraceId } from './config.js';

const logsIngested = new Counter('logs_ingested');
const ingestErrors = new Rate('ingest_errors');
const ingestDuration = new Trend('ingest_duration', true);

export const options = {
  scenarios: {
    // Phase 1: Sustained load — 50 req/s (500 logs/s) for 3 min
    sustained: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: 'ingestBatch',
      startTime: '0s',
    },
    // Phase 2: Ramp up — 10 → 200 → 10 req/s
    ramp: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 30,
      maxVUs: 80,
      stages: [
        { target: 200, duration: '1m' },
        { target: 200, duration: '1m' },
        { target: 10, duration: '30s' },
      ],
      exec: 'ingestBatch',
      startTime: '3m30s',
    },
    // Phase 3: Burst — 500 req/s (5000 logs/s) for 30s
    burst: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 50,
      maxVUs: 150,
      exec: 'ingestBatch',
      startTime: '6m30s',
    },
    // Phase 4: Large batches — fewer requests with 100 logs each
    largeBatch: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 10,
      maxVUs: 30,
      exec: 'ingestLargeBatch',
      startTime: '7m30s',
    },
    // Phase 5: Traced requests — logs with trace correlation
    traced: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 10,
      maxVUs: 30,
      exec: 'ingestTracedBatch',
      startTime: '9m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],           // <1% error rate
    http_req_duration: ['p(95)<500'],          // p95 < 500ms
    ingest_errors: ['rate<0.01'],
    ingest_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

export function ingestBatch() {
  const batch = generateBatch(10);
  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/ingest`, JSON.stringify(batch), {
    headers: apiKeyHeaders,
    tags: { scenario: 'sustained' },
  });
  ingestDuration.add(Date.now() - start);
  const ok = check(res, { 'ingest ok': (r) => r.status === 200 });
  if (ok) {
    logsIngested.add(10);
  } else {
    ingestErrors.add(1);
  }
}

export function ingestLargeBatch() {
  const batch = generateBatch(100);
  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/ingest`, JSON.stringify(batch), {
    headers: apiKeyHeaders,
    tags: { scenario: 'large_batch' },
  });
  ingestDuration.add(Date.now() - start);
  const ok = check(res, { 'large batch ok': (r) => r.status === 200 });
  if (ok) {
    logsIngested.add(100);
  } else {
    ingestErrors.add(1);
  }
}

export function ingestTracedBatch() {
  const traceId = generateTraceId();
  // Simulate a distributed trace with 3-5 service hops
  const hops = 3 + Math.floor(Math.random() * 3);
  const batch = generateBatch(hops, traceId);
  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/ingest`, JSON.stringify(batch), {
    headers: apiKeyHeaders,
    tags: { scenario: 'traced' },
  });
  ingestDuration.add(Date.now() - start);
  const ok = check(res, { 'traced batch ok': (r) => r.status === 200 });
  if (ok) {
    logsIngested.add(hops);
  } else {
    ingestErrors.add(1);
  }
}
