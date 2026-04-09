// Mixed realistic load test - simulates real-world usage patterns
// Multiple user personas acting concurrently
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, apiKeyHeaders, sessionHeaders, ORG_ID, PROJECT_ID, generateBatch, generateTraceId, SERVICES, LEVELS } from './config.js';

const totalOps = new Counter('total_operations');
const errorRate = new Rate('operation_errors');

export const options = {
  scenarios: {
    // Persona 1: SDK/Agent sending logs (high throughput)
    sdkIngestion: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 30,
      maxVUs: 80,
      exec: 'sdkAgent',
    },
    // Persona 2: Developer browsing logs (moderate)
    developer: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { target: 10, duration: '1m' },
        { target: 10, duration: '3m' },
        { target: 2, duration: '1m' },
      ],
      exec: 'developerBrowsing',
    },
    // Persona 3: Security analyst checking SIEM
    securityAnalyst: {
      executor: 'constant-vus',
      vus: 3,
      duration: '5m',
      exec: 'securityAnalyst',
    },
    // Persona 4: Dashboard auto-refresh (every 10s)
    dashboardRefresh: {
      executor: 'constant-vus',
      vus: 5,
      duration: '5m',
      exec: 'dashboardAutoRefresh',
    },
    // Persona 5: OTLP traces ingestion
    otlpTraces: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 10,
      maxVUs: 30,
      exec: 'otlpIngest',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],           // <2% errors under mixed load
    http_req_duration: ['p(95)<1000'],         // p95 < 1s
    operation_errors: ['rate<0.05'],
  },
};

// Persona 1: SDK continuously sending logs
export function sdkAgent() {
  const batchSize = 5 + Math.floor(Math.random() * 15); // 5-20 logs
  const traceId = Math.random() < 0.3 ? generateTraceId() : undefined;
  const batch = generateBatch(batchSize, traceId);

  const res = http.post(`${BASE_URL}/api/v1/ingest`, JSON.stringify(batch), {
    headers: apiKeyHeaders,
    tags: { persona: 'sdk' },
  });
  const ok = check(res, { 'sdk ingest ok': (r) => r.status === 200 });
  totalOps.add(1);
  if (!ok) errorRate.add(1);
  else errorRate.add(0);
}

// Persona 2: Developer searching and browsing logs
export function developerBrowsing() {
  // Step 1: Check recent logs
  let res = http.get(`${BASE_URL}/api/v1/logs?limit=50`, {
    headers: apiKeyHeaders,
    tags: { persona: 'developer' },
  });
  check(res, { 'dev list ok': (r) => r.status === 200 });
  totalOps.add(1);
  sleep(2 + Math.random() * 3); // Read logs

  // Step 2: Filter by service
  const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
  res = http.get(`${BASE_URL}/api/v1/logs?service=${service}&level=error&limit=50`, {
    headers: apiKeyHeaders,
    tags: { persona: 'developer' },
  });
  check(res, { 'dev filter ok': (r) => r.status === 200 });
  totalOps.add(1);
  sleep(1 + Math.random() * 2);

  // Step 3: Full-text search
  const terms = ['timeout', 'error', 'connection', 'failed'];
  const term = terms[Math.floor(Math.random() * terms.length)];
  res = http.get(`${BASE_URL}/api/v1/logs?q=${term}&limit=50`, {
    headers: apiKeyHeaders,
    tags: { persona: 'developer' },
  });
  check(res, { 'dev search ok': (r) => r.status === 200 });
  totalOps.add(1);
  sleep(2 + Math.random() * 3);

  // Step 4: Look at a specific log and its context
  try {
    const body = JSON.parse(res.body);
    if (body.logs && body.logs.length > 0) {
      const log = body.logs[0];
      if (log.id) {
        res = http.get(`${BASE_URL}/api/v1/logs/${log.id}`, {
          headers: apiKeyHeaders,
          tags: { persona: 'developer' },
        });
        check(res, { 'dev log detail ok': (r) => r.status === 200 });
        totalOps.add(1);
      }
      if (log.trace_id) {
        res = http.get(`${BASE_URL}/api/v1/logs/trace/${log.trace_id}`, {
          headers: apiKeyHeaders,
          tags: { persona: 'developer' },
        });
        check(res, { 'dev trace ok': (r) => r.status === 200 });
        totalOps.add(1);
      }
    }
  } catch (e) { /* ignore */ }

  sleep(3 + Math.random() * 5);
}

// Persona 3: Security analyst using SIEM
export function securityAnalyst() {
  // Check SIEM dashboard
  let res = http.get(`${BASE_URL}/api/v1/siem/dashboard?organizationId=${ORG_ID}&timeRange=24h`, {
    headers: sessionHeaders,
    tags: { persona: 'security' },
  });
  check(res, { 'siem dash ok': (r) => r.status === 200 });
  totalOps.add(1);
  sleep(3 + Math.random() * 5);

  // Check incidents
  res = http.get(`${BASE_URL}/api/v1/siem/incidents?organizationId=${ORG_ID}&limit=20`, {
    headers: sessionHeaders,
    tags: { persona: 'security' },
  });
  check(res, { 'siem incidents ok': (r) => r.status === 200 });
  totalOps.add(1);
  sleep(2 + Math.random() * 3);

  // Check detections
  res = http.get(`${BASE_URL}/api/v1/siem/detections?organizationId=${ORG_ID}&limit=20`, {
    headers: sessionHeaders,
    tags: { persona: 'security' },
  });
  check(res, { 'siem detections ok': (r) => r.status === 200 });
  totalOps.add(1);
  sleep(2 + Math.random() * 3);

  // Check alert history
  res = http.get(`${BASE_URL}/api/v1/alerts/history?organizationId=${ORG_ID}&limit=20`, {
    headers: sessionHeaders,
    tags: { persona: 'security' },
  });
  check(res, { 'alert history ok': (r) => r.status === 200 });
  totalOps.add(1);
  sleep(5 + Math.random() * 10);
}

// Persona 4: Dashboard auto-refresh
export function dashboardAutoRefresh() {
  const batch = http.batch([
    ['GET', `${BASE_URL}/api/v1/dashboard/stats?organizationId=${ORG_ID}`, null, { headers: sessionHeaders, tags: { persona: 'dashboard' } }],
    ['GET', `${BASE_URL}/api/v1/dashboard/timeseries?organizationId=${ORG_ID}`, null, { headers: sessionHeaders, tags: { persona: 'dashboard' } }],
    ['GET', `${BASE_URL}/api/v1/dashboard/top-services?organizationId=${ORG_ID}&limit=10`, null, { headers: sessionHeaders, tags: { persona: 'dashboard' } }],
    ['GET', `${BASE_URL}/api/v1/dashboard/recent-errors?organizationId=${ORG_ID}`, null, { headers: sessionHeaders, tags: { persona: 'dashboard' } }],
  ]);

  for (const res of batch) {
    check(res, { 'dashboard ok': (r) => r.status === 200 });
    totalOps.add(1);
  }

  sleep(10); // Auto-refresh interval
}

// Persona 5: OTLP trace ingestion
export function otlpIngest() {
  const traceId = generateTraceId();
  const spanId = generateTraceId().substring(0, 16);

  const otlpPayload = {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: SERVICES[Math.floor(Math.random() * SERVICES.length)] } },
          { key: 'deployment.environment', value: { stringValue: 'load-test' } },
        ],
      },
      scopeSpans: [{
        spans: [{
          traceId,
          spanId,
          name: `${['GET', 'POST', 'PUT'][Math.floor(Math.random() * 3)]} /api/v1/${['users', 'orders', 'payments'][Math.floor(Math.random() * 3)]}`,
          kind: 2, // SERVER
          startTimeUnixNano: `${Date.now() * 1000000}`,
          endTimeUnixNano: `${(Date.now() + Math.floor(Math.random() * 500)) * 1000000}`,
          status: { code: Math.random() < 0.1 ? 2 : 1 }, // 10% errors
          attributes: [
            { key: 'http.method', value: { stringValue: 'GET' } },
            { key: 'http.status_code', value: { intValue: Math.random() < 0.1 ? 500 : 200 } },
          ],
        }],
      }],
    }],
  };

  const res = http.post(`${BASE_URL}/v1/otlp/traces`, JSON.stringify(otlpPayload), {
    headers: apiKeyHeaders,
    tags: { persona: 'otlp' },
  });
  check(res, { 'otlp trace ok': (r) => r.status === 200 });
  totalOps.add(1);
  if (res.status !== 200) errorRate.add(1);
  else errorRate.add(0);
}
