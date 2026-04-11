import { describe, it, expect } from 'vitest';
import { parseApache } from '../../../../modules/log-pipeline/parsers/apache.js';

describe('parseApache', () => {
  it('parses apache combined log format', () => {
    const line = '127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/4.08"';
    const result = parseApache(line);
    expect(result?.client_ip).toBe('127.0.0.1');
    expect(result?.http_status).toBe(200);
    expect(result?.response_bytes).toBe(2326);
  });

  it('returns null for non-apache lines', () => {
    expect(parseApache('garbage')).toBeNull();
  });
});
