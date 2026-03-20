import { describe, it, expect } from 'vitest';
import { parseNginx } from '../../../../modules/log-pipeline/parsers/nginx.js';

describe('parseNginx', () => {
  it('parses a standard nginx access log line', () => {
    const line = '192.168.1.1 - john [01/Jan/2024:12:00:00 +0000] "GET /api/v1/logs?limit=10 HTTP/1.1" 200 1234 "-" "curl/7.68.0"';
    const result = parseNginx(line);
    expect(result).toMatchObject({
      client_ip: '192.168.1.1',
      remote_user: 'john',
      http_method: 'GET',
      http_path: '/api/v1/logs',
      http_query: 'limit=10',
      http_version: '1.1',
      http_status: 200,
      response_bytes: 1234,
      http_referer: '-',
      user_agent: 'curl/7.68.0',
    });
    expect(result?.timestamp).toBeDefined();
  });

  it('handles anonymous user (-)', () => {
    const line = '10.0.0.1 - - [15/Mar/2024:08:30:00 +0100] "POST /ingest HTTP/1.1" 201 0 "-" "sdk/1.0"';
    const result = parseNginx(line);
    expect(result?.remote_user).toBe('-');
    expect(result?.http_status).toBe(201);
    expect(result?.http_method).toBe('POST');
  });

  it('returns null for non-nginx lines', () => {
    expect(parseNginx('this is not a log line')).toBeNull();
    expect(parseNginx('')).toBeNull();
  });

  it('parses response bytes as number', () => {
    const line = '1.2.3.4 - - [01/Jan/2024:00:00:00 +0000] "GET / HTTP/2.0" 304 0 "-" "-"';
    expect(parseNginx(line)?.response_bytes).toBe(0);
    expect(typeof parseNginx(line)?.response_bytes).toBe('number');
  });
});
