// Query load test - search, filter, aggregate under concurrent load
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, apiKeyHeaders, sessionHeaders, ORG_ID, SERVICES, LEVELS } from './config.js';

const queryDuration = new Trend('query_duration', true);
const searchDuration = new Trend('search_duration', true);
const aggregateDuration = new Trend('aggregate_duration', true);

export const options = {
  scenarios: {
    // Concurrent simple queries
    simpleQuery: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { target: 30, duration: '1m' },
        { target: 30, duration: '2m' },
        { target: 50, duration: '1m' },
        { target: 50, duration: '2m' },
        { target: 5, duration: '30s' },
      ],
      exec: 'queryLogs',
    },
    // Full-text search
    search: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
      exec: 'searchLogs',
      startTime: '30s',
    },
    // Aggregations + dashboard
    aggregations: {
      executor: 'constant-vus',
      vus: 5,
      duration: '5m',
      exec: 'queryAggregations',
      startTime: '30s',
    },
    // Trace correlation
    traces: {
      executor: 'constant-vus',
      vus: 5,
      duration: '4m',
      exec: 'queryTraces',
      startTime: '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    query_duration: ['p(50)<100', 'p(95)<500', 'p(99)<1000'],
    search_duration: ['p(50)<200', 'p(95)<1000'],
    aggregate_duration: ['p(50)<200', 'p(95)<1000'],
  },
};

export function queryLogs() {
  const queries = [
    // Simple list
    `${BASE_URL}/api/v1/logs?limit=50`,
    // Filter by service
    `${BASE_URL}/api/v1/logs?service=${SERVICES[Math.floor(Math.random() * SERVICES.length)]}&limit=50`,
    // Filter by level
    `${BASE_URL}/api/v1/logs?level=${LEVELS[Math.floor(Math.random() * LEVELS.length)]}&limit=50`,
    // Combined filters
    `${BASE_URL}/api/v1/logs?service=${SERVICES[Math.floor(Math.random() * SERVICES.length)]}&level=error&limit=50`,
    // Time range (last hour)
    `${BASE_URL}/api/v1/logs?from=${new Date(Date.now() - 3600000).toISOString()}&limit=50`,
    // Pagination
    `${BASE_URL}/api/v1/logs?limit=20&offset=${Math.floor(Math.random() * 100)}`,
  ];

  const url = queries[Math.floor(Math.random() * queries.length)];
  const start = Date.now();
  const res = http.get(url, { headers: apiKeyHeaders, tags: { type: 'query' } });
  queryDuration.add(Date.now() - start);
  check(res, { 'query ok': (r) => r.status === 200 });
  sleep(0.1 + Math.random() * 0.3);
}

export function searchLogs() {
  const terms = [
    'error', 'timeout', 'connection', 'failed', 'api-gateway',
    'payment', 'authentication', 'database', 'cache', 'threshold',
  ];
  const term = terms[Math.floor(Math.random() * terms.length)];
  const modes = ['fulltext', 'substring'];
  const mode = modes[Math.floor(Math.random() * modes.length)];

  const start = Date.now();
  const res = http.get(
    `${BASE_URL}/api/v1/logs?q=${term}&searchMode=${mode}&limit=50`,
    { headers: apiKeyHeaders, tags: { type: 'search' } }
  );
  searchDuration.add(Date.now() - start);
  check(res, { 'search ok': (r) => r.status === 200 });
  sleep(0.2 + Math.random() * 0.5);
}

export function queryAggregations() {
  const endpoints = [
    `${BASE_URL}/api/v1/logs/aggregated?interval=1h&from=${new Date(Date.now() - 3600000).toISOString()}&to=${new Date().toISOString()}`,
    `${BASE_URL}/api/v1/logs/aggregated?interval=5m&from=${new Date(Date.now() - 3600000).toISOString()}&to=${new Date().toISOString()}`,
    `${BASE_URL}/api/v1/logs/top-services?limit=10`,
    `${BASE_URL}/api/v1/logs/top-errors?limit=10`,
    `${BASE_URL}/api/v1/logs/services`,
    `${BASE_URL}/api/v1/logs/hostnames`,
    `${BASE_URL}/api/v1/dashboard/stats?organizationId=${ORG_ID}`,
    `${BASE_URL}/api/v1/dashboard/timeseries?organizationId=${ORG_ID}`,
    `${BASE_URL}/api/v1/dashboard/top-services?organizationId=${ORG_ID}&limit=10`,
    `${BASE_URL}/api/v1/dashboard/recent-errors?organizationId=${ORG_ID}`,
  ];

  const url = endpoints[Math.floor(Math.random() * endpoints.length)];
  const headers = url.includes('organizationId') ? sessionHeaders : apiKeyHeaders;
  const start = Date.now();
  const res = http.get(url, { headers, tags: { type: 'aggregation' } });
  aggregateDuration.add(Date.now() - start);
  check(res, { 'aggregation ok': (r) => r.status === 200 });
  sleep(0.5 + Math.random() * 1);
}

export function queryTraces() {
  // Query traces list
  let res = http.get(`${BASE_URL}/api/v1/traces?limit=10`, {
    headers: apiKeyHeaders,
    tags: { type: 'traces' },
  });
  check(res, { 'traces list ok': (r) => r.status === 200 });

  // Try to get a specific trace
  try {
    const body = JSON.parse(res.body);
    if (body.traces && body.traces.length > 0) {
      const traceId = body.traces[0].traceId || body.traces[0].trace_id;
      if (traceId) {
        res = http.get(`${BASE_URL}/api/v1/traces/${traceId}`, {
          headers: apiKeyHeaders,
          tags: { type: 'trace_detail' },
        });
        check(res, { 'trace detail ok': (r) => r.status === 200 });

        // Also get correlated logs
        res = http.get(`${BASE_URL}/api/v1/logs/trace/${traceId}`, {
          headers: apiKeyHeaders,
          tags: { type: 'trace_logs' },
        });
        check(res, { 'trace logs ok': (r) => r.status === 200 });
      }
    }
  } catch (e) { /* ignore parse errors */ }

  sleep(0.5 + Math.random() * 1);
}
