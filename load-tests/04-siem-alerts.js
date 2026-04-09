// SIEM & Alerts load test - dashboard, incidents, alert rules under load
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, sessionHeaders, deleteHeaders, ORG_ID, PROJECT_ID } from './config.js';

const siemDuration = new Trend('siem_duration', true);

export const options = {
  scenarios: {
    // SIEM dashboard polling (simulates multiple users refreshing)
    dashboard: {
      executor: 'constant-vus',
      vus: 10,
      duration: '3m',
      exec: 'siemDashboard',
    },
    // Alert CRUD operations
    alertOps: {
      executor: 'per-vu-iterations',
      vus: 5,
      iterations: 10,
      exec: 'alertCrud',
      startTime: '30s',
    },
    // Incident lifecycle
    incidentOps: {
      executor: 'per-vu-iterations',
      vus: 3,
      iterations: 5,
      exec: 'incidentLifecycle',
      startTime: '30s',
    },
    // Sigma rules operations
    sigmaOps: {
      executor: 'constant-vus',
      vus: 3,
      duration: '2m',
      exec: 'sigmaOperations',
      startTime: '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    siem_duration: ['p(95)<2000'],
  },
};

export function siemDashboard() {
  const endpoints = [
    `/api/v1/siem/dashboard?organizationId=${ORG_ID}&timeRange=24h`,
    `/api/v1/siem/dashboard?organizationId=${ORG_ID}&timeRange=7d`,
    `/api/v1/siem/dashboard?organizationId=${ORG_ID}&timeRange=30d`,
    `/api/v1/siem/incidents?organizationId=${ORG_ID}&limit=20`,
    `/api/v1/siem/incidents?organizationId=${ORG_ID}&status=open&limit=20`,
    `/api/v1/siem/incidents?organizationId=${ORG_ID}&severity=critical&severity=high&limit=20`,
    `/api/v1/siem/detections?organizationId=${ORG_ID}&limit=20`,
  ];

  const url = endpoints[Math.floor(Math.random() * endpoints.length)];
  const start = Date.now();
  const res = http.get(`${BASE_URL}${url}`, { headers: sessionHeaders, tags: { type: 'siem_dashboard' } });
  siemDuration.add(Date.now() - start);
  check(res, { 'siem dashboard ok': (r) => r.status === 200 });
  sleep(1 + Math.random() * 2); // Simulate user looking at dashboard
}

export function alertCrud() {
  // Create alert rule
  const rule = {
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    name: `Load Test Alert ${Date.now()}`,
    service: 'api-gateway',
    level: ['error', 'critical'],
    threshold: 10,
    timeWindow: 300,
    emailRecipients: ['loadtest@example.com'],
    enabled: false, // Don't trigger during load test
  };

  let start = Date.now();
  let res = http.post(`${BASE_URL}/api/v1/alerts`, JSON.stringify(rule), {
    headers: sessionHeaders,
    tags: { type: 'alert_create' },
  });
  siemDuration.add(Date.now() - start);
  const created = check(res, { 'alert created': (r) => r.status === 200 || r.status === 201 });

  if (!created) {
    sleep(1);
    return;
  }

  let alertId;
  try {
    const body = JSON.parse(res.body);
    alertId = body.alertRule?.id || body.id;
  } catch (e) { return; }

  if (!alertId) return;

  // Read alert
  start = Date.now();
  res = http.get(`${BASE_URL}/api/v1/alerts/${alertId}?organizationId=${ORG_ID}`, {
    headers: sessionHeaders,
    tags: { type: 'alert_read' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'alert read ok': (r) => r.status === 200 });

  // Update alert (organizationId must be in query string)
  start = Date.now();
  res = http.put(`${BASE_URL}/api/v1/alerts/${alertId}?organizationId=${ORG_ID}`, JSON.stringify({
    name: `Updated Alert ${Date.now()}`,
    threshold: 20,
  }), {
    headers: sessionHeaders,
    tags: { type: 'alert_update' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'alert updated': (r) => r.status === 200 });

  // Delete alert (no Content-Type for empty body DELETE)
  start = Date.now();
  res = http.del(`${BASE_URL}/api/v1/alerts/${alertId}?organizationId=${ORG_ID}`, null, {
    headers: deleteHeaders,
    tags: { type: 'alert_delete' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'alert deleted': (r) => r.status === 200 || r.status === 204 });

  sleep(0.5);
}

export function incidentLifecycle() {
  // Create incident
  const incident = {
    organizationId: ORG_ID,
    title: `Load Test Incident ${Date.now()}`,
    severity: ['critical', 'high', 'medium', 'low'][Math.floor(Math.random() * 4)],
    description: 'Automated load test incident',
    status: 'open',
  };

  let start = Date.now();
  let res = http.post(`${BASE_URL}/api/v1/siem/incidents`, JSON.stringify(incident), {
    headers: sessionHeaders,
    tags: { type: 'incident_create' },
  });
  siemDuration.add(Date.now() - start);
  const created = check(res, { 'incident created': (r) => r.status === 200 || r.status === 201 });

  if (!created) {
    sleep(1);
    return;
  }

  let incidentId;
  try {
    const body = JSON.parse(res.body);
    incidentId = body.incident?.id || body.id;
  } catch (e) { return; }

  if (!incidentId) return;

  // Read incident detail
  start = Date.now();
  res = http.get(`${BASE_URL}/api/v1/siem/incidents/${incidentId}?organizationId=${ORG_ID}`, {
    headers: sessionHeaders,
    tags: { type: 'incident_detail' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'incident detail ok': (r) => r.status === 200 });

  // Add comment
  start = Date.now();
  res = http.post(`${BASE_URL}/api/v1/siem/incidents/${incidentId}/comments`, JSON.stringify({
    organizationId: ORG_ID,
    comment: 'Investigating this incident during load test',
  }), {
    headers: sessionHeaders,
    tags: { type: 'incident_comment' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'comment added': (r) => r.status === 200 || r.status === 201 });

  // Update status: investigating
  start = Date.now();
  res = http.patch(`${BASE_URL}/api/v1/siem/incidents/${incidentId}`, JSON.stringify({
    organizationId: ORG_ID,
    status: 'investigating',
  }), {
    headers: sessionHeaders,
    tags: { type: 'incident_update' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'incident investigating': (r) => r.status === 200 });

  // Resolve
  start = Date.now();
  res = http.patch(`${BASE_URL}/api/v1/siem/incidents/${incidentId}`, JSON.stringify({
    organizationId: ORG_ID,
    status: 'resolved',
  }), {
    headers: sessionHeaders,
    tags: { type: 'incident_resolve' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'incident resolved': (r) => r.status === 200 });

  // Delete (no Content-Type for empty body DELETE)
  start = Date.now();
  res = http.del(`${BASE_URL}/api/v1/siem/incidents/${incidentId}?organizationId=${ORG_ID}`, null, {
    headers: deleteHeaders,
    tags: { type: 'incident_delete' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'incident deleted': (r) => r.status === 200 || r.status === 204 });

  sleep(0.5);
}

export function sigmaOperations() {
  // List sigma rules
  let start = Date.now();
  let res = http.get(`${BASE_URL}/api/v1/sigma/rules?organizationId=${ORG_ID}`, {
    headers: sessionHeaders,
    tags: { type: 'sigma_list' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'sigma list ok': (r) => r.status === 200 });

  // Browse categories (public)
  start = Date.now();
  res = http.get(`${BASE_URL}/api/v1/sigma/categories`, {
    headers: sessionHeaders,
    tags: { type: 'sigma_categories' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'sigma categories ok': (r) => r.status === 200 });

  // MITRE tactics
  start = Date.now();
  res = http.get(`${BASE_URL}/api/v1/sigma/mitre/tactics`, {
    headers: sessionHeaders,
    tags: { type: 'sigma_mitre' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'sigma mitre ok': (r) => r.status === 200 });

  // Search (may fail with 500 if GitHub API is rate limited)
  start = Date.now();
  res = http.get(`${BASE_URL}/api/v1/sigma/search?q=sql+injection`, {
    headers: sessionHeaders,
    tags: { type: 'sigma_search' },
  });
  siemDuration.add(Date.now() - start);
  check(res, { 'sigma search ok': (r) => r.status === 200 || r.status === 500 });

  sleep(1 + Math.random() * 2);
}
