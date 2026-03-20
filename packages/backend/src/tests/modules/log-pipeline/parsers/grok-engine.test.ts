import { describe, it, expect } from 'vitest';
import { compileGrok, matchGrok } from '../../../../modules/log-pipeline/parsers/grok-engine.js';

describe('compileGrok', () => {
  it('compiles a pattern with built-in WORD', () => {
    const { regex } = compileGrok('%{WORD:method} %{URIPATH:path}');
    expect(regex).toBeInstanceOf(RegExp);
  });

  it('throws for unknown pattern name', () => {
    expect(() => compileGrok('%{UNKNOWN_PATTERN:field}')).toThrow('Unknown grok pattern');
  });
});

describe('matchGrok', () => {
  it('extracts named fields from a line', () => {
    const result = matchGrok('%{IPV4:client_ip} %{WORD:method}', '10.0.0.1 GET');
    expect(result).toEqual({ client_ip: '10.0.0.1', method: 'GET' });
  });

  it('coerces :int type to number', () => {
    const result = matchGrok('%{POSINT:status:int} %{WORD:method}', '200 GET');
    expect(result?.status).toBe(200);
    expect(typeof result?.status).toBe('number');
  });

  it('coerces :float type to number', () => {
    const result = matchGrok('%{NUMBER:latency:float}ms', '1.23ms');
    expect(result?.latency).toBeCloseTo(1.23);
  });

  it('returns null when pattern does not match', () => {
    expect(matchGrok('%{IPV4:ip}', 'not-an-ip')).toBeNull();
  });

  it('supports non-capturing %{PATTERN} without field name', () => {
    const result = matchGrok('%{IPV4} %{WORD:method}', '10.0.0.1 POST');
    expect(result).toEqual({ method: 'POST' });
  });

  it('handles a realistic nginx-like grok pattern', () => {
    const pattern = '%{IPV4:client_ip} - %{NOTSPACE:user} \\[%{DATA:timestamp}\\] "%{WORD:method} %{NOTSPACE:path} HTTP/%{NUMBER:http_version}"  %{POSINT:status:int}';
    const line = '192.168.0.1 - alice [01/Jan/2024:00:00:00 +0000] "GET /api HTTP/1.1"  200';
    const result = matchGrok(pattern, line);
    expect(result?.client_ip).toBe('192.168.0.1');
    expect(result?.method).toBe('GET');
    expect(result?.status).toBe(200);
  });
});
