import { describe, it, expect } from 'vitest';
import { parseSyslog } from '../../../../modules/log-pipeline/parsers/syslog.js';

describe('parseSyslog', () => {
  it('parses RFC 3164 format', () => {
    const line = 'Jan 15 12:00:00 myhost myapp[1234]: Connection established';
    const result = parseSyslog(line);
    expect(result?.hostname).toBe('myhost');
    expect(result?.appname).toBe('myapp');
    expect(result?.pid).toBe(1234);
    expect(result?.syslog_message).toBe('Connection established');
  });

  it('parses RFC 3164 without PID', () => {
    const line = 'Mar 20 08:15:30 server nginx: worker process 123 exited';
    const result = parseSyslog(line);
    expect(result?.hostname).toBe('server');
    expect(result?.appname).toBe('nginx');
    expect(result?.pid).toBeUndefined();
  });

  it('parses RFC 5424 format', () => {
    const line = '<34>1 2024-01-15T12:00:00.000Z myhost myapp 1234 - - Connection established';
    const result = parseSyslog(line);
    expect(result?.priority).toBe(34);
    expect(result?.hostname).toBe('myhost');
    expect(result?.syslog_message).toBe('Connection established');
  });

  it('returns null for non-syslog', () => {
    expect(parseSyslog('hello world')).toBeNull();
  });
});
