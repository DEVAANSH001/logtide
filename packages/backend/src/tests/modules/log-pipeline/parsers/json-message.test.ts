import { describe, it, expect } from 'vitest';
import { parseJsonMessage } from '../../../../modules/log-pipeline/parsers/json-message.js';

describe('parseJsonMessage', () => {
  it('parses a JSON object in the message', () => {
    const result = parseJsonMessage('{"level":"info","user_id":42,"action":"login"}');
    expect(result?.level).toBe('info');
    expect(result?.user_id).toBe(42);
    expect(result?.action).toBe('login');
  });

  it('returns null for non-JSON messages', () => {
    expect(parseJsonMessage('plain text message')).toBeNull();
    expect(parseJsonMessage('[1,2,3]')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseJsonMessage('{broken json')).toBeNull();
  });

  it('returns null for empty message', () => {
    expect(parseJsonMessage('')).toBeNull();
  });
});
