// Shared config for all load tests
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
export const API_KEY = __ENV.API_KEY || 'lp_c60a948a208185fac8de8081d2932833164a1d8ff2d4c4d91072cc01582de453';
export const SESSION_TOKEN = __ENV.SESSION_TOKEN || '5f7c14ed0cc8d49f3831d072bcc858fda13e88b8b301e72fa529d6bb5cd1b1f3';
export const ORG_ID = __ENV.ORG_ID || '88ceb5a4-9ea5-4968-bb82-411adf057e50';
export const PROJECT_ID = __ENV.PROJECT_ID || '781bb72e-d996-41be-a54a-962b0df64943';

export const apiKeyHeaders = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};

export const sessionHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SESSION_TOKEN}`,
};

// Headers for DELETE requests (no Content-Type to avoid Fastify 400 on empty body)
export const deleteHeaders = {
  'Authorization': `Bearer ${SESSION_TOKEN}`,
};

// Log levels and services for realistic data generation
export const LEVELS = ['debug', 'info', 'warn', 'error', 'critical'];
export const SERVICES = [
  'api-gateway', 'auth-service', 'user-service', 'payment-service',
  'notification-service', 'search-service', 'analytics-engine',
  'cache-manager', 'file-processor', 'email-worker',
];
export const HOSTNAMES = ['web-01', 'web-02', 'web-03', 'worker-01', 'worker-02'];

const MESSAGES = [
  'Request processed successfully',
  'Database query completed',
  'Cache hit for key',
  'User authentication successful',
  'Payment transaction processed',
  'Email sent to recipient',
  'File upload completed',
  'Search index updated',
  'Rate limit threshold reached',
  'Connection pool exhausted',
  'Timeout waiting for response from upstream',
  'Invalid request payload received',
  'Unhandled exception in request handler',
  'Memory usage exceeded threshold',
  'Disk space running low on volume',
  'SSL certificate expiring soon',
  'Database connection failed, retrying',
  'Queue consumer lag detected',
  'Deployment rollback initiated',
  'Health check failed for service',
];

export function randomLog(traceId) {
  const level = LEVELS[Math.floor(Math.random() * LEVELS.length)];
  const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
  const hostname = HOSTNAMES[Math.floor(Math.random() * HOSTNAMES.length)];
  const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  const log = {
    time: new Date().toISOString(),
    service,
    level,
    hostname,
    message: `[${service}] ${message}`,
    metadata: {
      request_id: `req_${Math.random().toString(36).substring(2, 15)}`,
      duration_ms: Math.floor(Math.random() * 2000),
      environment: 'load-test',
    },
  };
  if (traceId) log.trace_id = traceId;
  return log;
}

export function generateTraceId() {
  const chars = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 32; i++) id += chars[Math.floor(Math.random() * 16)];
  return id;
}

export function generateBatch(size, traceId) {
  const logs = [];
  for (let i = 0; i < size; i++) {
    logs.push(randomLog(traceId));
  }
  return { logs };
}
