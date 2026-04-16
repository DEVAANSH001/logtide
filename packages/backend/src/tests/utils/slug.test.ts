import { describe, it, expect } from 'vitest';
import { validateSlug, RESERVED_SLUGS } from '../../utils/slug.js';

describe('validateSlug', () => {
  it('accepts valid lowercase hyphenated slugs', () => {
    expect(validateSlug('frontend')).toBeNull();
    expect(validateSlug('my-api-v2')).toBeNull();
    expect(validateSlug('ab')).toBeNull();
    expect(validateSlug('a'.repeat(50))).toBeNull();
  });

  it('rejects uppercase, spaces, trailing/leading hyphens', () => {
    expect(validateSlug('Frontend')).toBe('Slug must be lowercase letters, numbers, and hyphens');
    expect(validateSlug('my project')).toBe('Slug must be lowercase letters, numbers, and hyphens');
    expect(validateSlug('-hello')).toBe('Slug must be lowercase letters, numbers, and hyphens');
    expect(validateSlug('hello-')).toBe('Slug must be lowercase letters, numbers, and hyphens');
    expect(validateSlug('a--b')).toBe('Slug must be lowercase letters, numbers, and hyphens');
  });

  it('rejects too short or too long', () => {
    expect(validateSlug('a')).toBe('Slug must be between 2 and 50 characters');
    expect(validateSlug('a'.repeat(51))).toBe('Slug must be between 2 and 50 characters');
    expect(validateSlug('')).toBe('Slug must be between 2 and 50 characters');
  });

  it('rejects reserved words', () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(validateSlug(reserved)).toBe(`"${reserved}" is a reserved slug`);
    }
  });

  it('exposes the expected reserved list', () => {
    expect(RESERVED_SLUGS).toEqual(new Set([
      'api', 'admin', 'dashboard', 'status', 'auth',
      'login', 'signup', 'logout', '_app', 'health',
    ]));
  });
});
