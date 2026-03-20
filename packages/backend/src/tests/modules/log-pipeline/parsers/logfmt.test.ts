import { describe, it, expect } from 'vitest';
import { parseLogfmt } from '../../../../modules/log-pipeline/parsers/logfmt.js';

describe('parseLogfmt', () => {
  it('parses simple key=value pairs', () => {
    const result = parseLogfmt('level=info msg="user logged in" user_id=42 latency=1.23ms');
    expect(result?.level).toBe('info');
    expect(result?.msg).toBe('user logged in');
    expect(result?.user_id).toBe('42');
    expect(result?.latency).toBe('1.23ms');
  });

  it('handles quoted values with spaces', () => {
    const result = parseLogfmt('error="file not found" path="/var/log/app.log"');
    expect(result?.error).toBe('file not found');
    expect(result?.path).toBe('/var/log/app.log');
  });

  it('handles boolean-like values', () => {
    const result = parseLogfmt('success=true retried=false');
    expect(result?.success).toBe('true');
  });

  it('returns null if no key=value found', () => {
    expect(parseLogfmt('this is a plain message')).toBeNull();
    expect(parseLogfmt('')).toBeNull();
  });

  it('requires at least 2 pairs to avoid false positives', () => {
    expect(parseLogfmt('id=123')).toBeNull();
  });
});
