// Smoke test — quick validation that all endpoints respond correctly
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, apiKeyHeaders, sessionHeaders, ORG_ID, PROJECT_ID, randomLog, generateBatch, generateTraceId } from './config.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1.0'],
  },
};

export default function () {
  // 1. Health check
  let res = http.get(`${BASE_URL}/health`);
  check(res, { 'health 200': (r) => r.status === 200 });

  // 2. Ingest single batch
  const traceId = generateTraceId();
  const batch = generateBatch(5, traceId);
  res = http.post(`${BASE_URL}/api/v1/ingest`, JSON.stringify(batch), { headers: apiKeyHeaders });
  check(res, {
    'ingest 200': (r) => r.status === 200,
    'ingest received 5': (r) => JSON.parse(r.body).received === 5,
  });

  sleep(1); // Wait for ingestion to complete

  // 3. Query logs
  res = http.get(`${BASE_URL}/api/v1/logs?limit=5`, { headers: apiKeyHeaders });
  check(res, {
    'query 200': (r) => r.status === 200,
    'query has logs': (r) => JSON.parse(r.body).logs.length > 0,
  });

  // 4. Query with filters
  res = http.get(`${BASE_URL}/api/v1/logs?service=${batch.logs[0].service}&limit=5`, { headers: apiKeyHeaders });
  check(res, { 'filtered query 200': (r) => r.status === 200 });

  // 5. Full-text search
  res = http.get(`${BASE_URL}/api/v1/logs?q=load-test&searchMode=substring&limit=5`, { headers: apiKeyHeaders });
  check(res, { 'search 200': (r) => r.status === 200 });

  // 6. Trace correlation
  res = http.get(`${BASE_URL}/api/v1/logs/trace/${traceId}`, { headers: apiKeyHeaders });
  check(res, { 'trace 200': (r) => r.status === 200 });

  // 7. Aggregated stats
  const fromTime = new Date(Date.now() - 3600000).toISOString();
  const toTime = new Date().toISOString();
  res = http.get(`${BASE_URL}/api/v1/logs/aggregated?interval=1h&from=${fromTime}&to=${toTime}`, { headers: apiKeyHeaders });
  check(res, { 'aggregated 200': (r) => r.status === 200 });

  // 8. Top services
  res = http.get(`${BASE_URL}/api/v1/logs/top-services?limit=5`, { headers: apiKeyHeaders });
  check(res, { 'top-services 200': (r) => r.status === 200 });

  // 9. Services list
  res = http.get(`${BASE_URL}/api/v1/logs/services`, { headers: apiKeyHeaders });
  check(res, { 'services 200': (r) => r.status === 200 });

  // 10. Top errors
  res = http.get(`${BASE_URL}/api/v1/logs/top-errors?limit=5`, { headers: apiKeyHeaders });
  check(res, { 'top-errors 200': (r) => r.status === 200 });

  // 11. Dashboard stats (session auth)
  res = http.get(`${BASE_URL}/api/v1/dashboard/stats?organizationId=${ORG_ID}`, { headers: sessionHeaders });
  check(res, { 'dashboard stats 200': (r) => r.status === 200 });

  // 12. Dashboard timeseries
  res = http.get(`${BASE_URL}/api/v1/dashboard/timeseries?organizationId=${ORG_ID}`, { headers: sessionHeaders });
  check(res, { 'dashboard timeseries 200': (r) => r.status === 200 });

  // 13. Alert rules list
  res = http.get(`${BASE_URL}/api/v1/alerts?organizationId=${ORG_ID}`, { headers: sessionHeaders });
  check(res, { 'alerts list 200': (r) => r.status === 200 });

  // 14. Sigma rules list
  res = http.get(`${BASE_URL}/api/v1/sigma/rules?organizationId=${ORG_ID}`, { headers: sessionHeaders });
  check(res, { 'sigma rules 200': (r) => r.status === 200 });

  // 15. SIEM dashboard
  res = http.get(`${BASE_URL}/api/v1/siem/dashboard?organizationId=${ORG_ID}&timeRange=24h`, { headers: sessionHeaders });
  check(res, { 'siem dashboard 200': (r) => r.status === 200 });

  // 16. SIEM incidents
  res = http.get(`${BASE_URL}/api/v1/siem/incidents?organizationId=${ORG_ID}`, { headers: sessionHeaders });
  check(res, { 'siem incidents 200': (r) => r.status === 200 });

  // 17. Traces list
  res = http.get(`${BASE_URL}/api/v1/traces?limit=5`, { headers: apiKeyHeaders });
  check(res, { 'traces 200': (r) => r.status === 200 });

  // 18. Error groups
  res = http.get(`${BASE_URL}/api/v1/error-groups?organizationId=${ORG_ID}`, { headers: sessionHeaders });
  check(res, { 'error-groups 200': (r) => r.status === 200 });

  // 19. OTLP logs endpoint (GET status)
  res = http.get(`${BASE_URL}/v1/otlp/logs`, { headers: apiKeyHeaders });
  check(res, { 'otlp status 200': (r) => r.status === 200 });

  // 20. Metrics overview
  res = http.get(`${BASE_URL}/api/v1/metrics/overview?from=${fromTime}&to=${toTime}`, { headers: apiKeyHeaders });
  check(res, { 'metrics overview 200': (r) => r.status === 200 });

  console.log('Smoke test completed — all endpoints verified');
}
